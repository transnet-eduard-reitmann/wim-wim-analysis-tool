/**
 * parser.js — Parses ITCMS WIM-WIM CSV condition and alarm files.
 *
 * Condition file columns (0-indexed after the D/H row-type field):
 *   0: row type (D=data, H=header — skip H rows)
 *   1: COMPONENT   (measurement system ID, e.g. EMR.CAM2.CAM.WIM.01)
 *   2: TIME        (datetime string)
 *   3: DIR         (direction: Up / Down)
 *   4: TRAIN #     (train identifier, quoted)
 *   5: VEHICLE #   (wagon tag, or empty for train-level rows)
 *   6: ORIENT      (orientation flag)
 *   7: V POS       (vehicle position in consist, 1-based)
 *   8: TYPE        (measurement type string)
 *   9: M POS       (measurement position: channel, bogie, or axle number)
 *  10: SIDE        (Left / Right / empty)
 *  11: VALUE       (numeric value)
 *  12: UNITS       (ton, km/h, V, etc.)
 */

const Parser = (() => {

  const TON_TO_KN = 9.80665;

  /**
   * Parses a condition CSV file text and returns a structured TrainData object.
   * @param {string} csvText - raw file contents
   * @param {string} fileName - original filename for metadata
   * @returns {TrainData}
   */
  function parseConditionFile(csvText, fileName) {
    const rows = parseRows(csvText);
    const dataRows = rows.filter(r => r[0] === 'D' && r.length >= 12);

    if (dataRows.length === 0) {
      throw new Error('No data rows found in this file. Check that it is a valid ITCMS condition CSV.');
    }

    const meta = extractMeta(dataRows[0], fileName);
    const offsets = extractBridgeOffsets(dataRows);
    const effectivity = extractEffectivity(dataRows);
    const trainMass = extractTrainMass(dataRows);
    const vehicles = extractVehicles(dataRows);

    return { meta, offsets, effectivity, trainMass, vehicles };
  }

  /**
   * Parses an alarm CSV file text and returns an array of AlarmRecord objects.
   * Alarm file columns: STATE,COMPONENT,TIME,DIR,TRAIN #,VEHICLE #,SEVERITY,TYPE,
   *   V POS,M POS,SIDE,VALUE 1,VALUE 2,ACK TCO,ACK TIME,REP TCO,REP TIME,
   *   VALID,FIELD TECH,FOLLOW-UP,REMOVED,REMOVAL PT
   */
  function parseAlarmFile(csvText, fileName) {
    const rows = parseRows(csvText);
    return rows
      .filter(r => r[0] === 'D' && r.length >= 12)
      .map(r => ({
        state:      r[0],
        component:  r[1],
        time:       r[2],
        direction:  r[3],
        trainId:    r[4].replace(/"/g, '').trim(),
        vehicleId:  r[5].replace(/"/g, '').trim(),
        severity:   r[6],
        type:       r[7],
        vPos:       parseInt(r[8], 10) || null,
        mPos:       r[9],
        side:       r[10],
        value1:     parseFloat(r[11]),
        value2:     parseFloat(r[12]) || null,
      }));
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  function parseRows(csvText) {
    // Normalise line endings then split
    return csvText
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => splitCsvLine(line));
  }

  // Simple CSV line splitter that handles quoted fields
  function splitCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  function extractMeta(firstRow, fileName) {
    return {
      fileName,
      component: firstRow[1],
      time:      firstRow[2],
      direction: firstRow[3],
      trainId:   firstRow[4].replace(/"/g, '').trim(),
    };
  }

  function extractBridgeOffsets(rows) {
    return rows
      .filter(r => r[8] === 'Bridge Offsets [T]')
      .map(r => ({
        channel: r[9],
        value:   parseFloat(r[11]),  // in V (equivalent tonnes offset)
        units:   r[12],
      }));
  }

  function extractEffectivity(rows) {
    const row = rows.find(r => r[8] === 'Bridge Effectivity [T]');
    return row ? row[11] : null;  // 'P' = pass
  }

  function extractTrainMass(rows) {
    const get = type => {
      const row = rows.find(r => r[8] === type && r[5] === '');
      return row ? parseFloat(row[11]) : null;
    };
    return {
      locomotives: get('Locomotives Mass [T]'),
      wagons:      get('Wagons Mass [T]'),
      total:       get('Total Mass [T]'),
    };
  }

  function extractVehicles(rows) {
    // Collect all unique V POS values for vehicle rows
    const vehicleRows = rows.filter(r => r[7] !== '' && r[7] !== '0' && !isNaN(parseInt(r[7], 10)));
    const positions = [...new Set(vehicleRows.map(r => parseInt(r[7], 10)))].sort((a, b) => a - b);

    return positions.map(vPos => {
      const vRows = vehicleRows.filter(r => parseInt(r[7], 10) === vPos);
      return extractVehicle(vPos, vRows);
    });
  }

  function extractVehicle(vPos, rows) {
    const get = (type, mPos = '', side = '') =>
      rows.find(r => r[8] === type && (mPos === '' || r[9] === mPos) && (side === '' || r[10] === side));

    const val = (row) => row ? parseFloat(row[11]) : null;

    const typeRow = get('Type [V]');
    const speedRow = get('Speed [V]');
    const massTotal = val(get('Mass [V]', 'T', '')) ?? val(get('Mass [V]', '', ''));
    const massLeft  = val(get('Mass [V]', '', 'Left'));
    const massRight = val(get('Mass [V]', '', 'Right'));

    // Skewness: BBD5249 reports in tonnes (e.g. 0.280 = 0.280 t)
    const skewnessRows = rows.filter(r => r[8] === 'Skewness [B]');
    const skewnessBogie = skewnessRows.map(r => ({
      bogieNum: parseInt(r[9], 10),
      value:    parseFloat(r[11]),  // tonnes
    }));

    // Side-to-side skew at vehicle level
    const sideToSideSkew = (massLeft != null && massRight != null && massLeft + massRight > 0)
      ? Math.abs(massLeft - massRight) / (massLeft + massRight)
      : null;

    // End-to-end skew: bogies 1 vs 2
    let endToEndSkew = null;
    const massBogieRows = rows.filter(r => r[8] === 'Mass [B]');
    if (massBogieRows.length >= 2) {
      const b1 = parseFloat(massBogieRows[0][11]);
      const b2 = parseFloat(massBogieRows[massBogieRows.length - 1][11]);
      if (!isNaN(b1) && !isNaN(b2) && b1 + b2 > 0) {
        endToEndSkew = Math.abs(b1 - b2) / (b1 + b2);
      }
    }

    const bogieMasses = massBogieRows.map(r => ({
      bogieNum: parseInt(r[9], 10),
      mass_t:   parseFloat(r[11]),
    })).sort((a, b) => a.bogieNum - b.bogieNum);

    // Per-axle data — collect all unique axle numbers
    const axleNums = [...new Set(
      rows.filter(r => r[8] === 'Dynamic Load [A]').map(r => parseInt(r[9], 10))
    )].sort((a, b) => a - b);

    const axles = axleNums.map(axleNum => {
      const dynL = val(get('Dynamic Load [A]', String(axleNum), 'Left'));
      const dynR = val(get('Dynamic Load [A]', String(axleNum), 'Right'));
      const latL = val(get('Lateral Force [A]', String(axleNum), 'Left'));
      const latR = val(get('Lateral Force [A]', String(axleNum), 'Right'));
      const gauge = val(get('Gauge Spreading Force [A]', String(axleNum), ''));

      // Convert dynamic load from tonnes to kN for alarm limit comparison
      return {
        axleNum,
        dynamicLoadLeft_t:  dynL,
        dynamicLoadRight_t: dynR,
        dynamicLoadLeft_kN:  dynL != null ? dynL * TON_TO_KN : null,
        dynamicLoadRight_kN: dynR != null ? dynR * TON_TO_KN : null,
        lateralForceLeft_t:  latL,
        lateralForceRight_t: latR,
        gaugeSpreadingForce_t: gauge,
      };
    });

    return {
      vPos,
      vehicleId:    typeRow ? typeRow[5].replace(/"/g, '').trim() : '',
      type:         typeRow ? typeRow[11] : null,
      speed_kmh:    speedRow ? parseFloat(speedRow[11]) : null,
      mass_t:       massTotal,
      massLeft_t:   massLeft,
      massRight_t:  massRight,
      sideToSideSkew,
      endToEndSkew,
      skewnessBogie,
      bogieMasses,
      axles,
    };
  }

  return { parseConditionFile, parseAlarmFile };

})();
