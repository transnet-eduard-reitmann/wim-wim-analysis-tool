/**
 * parser.js — Parses ITCMS WIM-WIM CSV condition and alarm files.
 *
 * Supported CSV layouts
 * ─────────────────────
 * Format A — H/D-prefixed (original ITCMS export)
 *   Each row starts with 'H' (header) or 'D' (data). Column indices:
 *   0:row-type  1:COMPONENT  2:TIME  3:DIR  4:TRAIN#  5:VEHICLE#
 *   6:ORIENT    7:V POS      8:TYPE  9:M POS 10:SIDE  11:VALUE  12:UNITS
 *
 * Format B — Headerless plain-text (direct-query export, no prefix)
 *   First row is a column header; data rows follow immediately. Same column
 *   order as Format A but without the leading row-type field. This parser
 *   prepends synthetic H/D markers so all downstream code uses the same
 *   column indices as Format A.
 *
 * Format C — Headerless with Excel formula notation (=\"value\", =number)
 *   Identical to Format B except field values are prefixed with '=' to prevent
 *   Excel from interpreting them as numbers or formulas. The parser strips this
 *   prefix automatically.
 *
 * Alarm files follow Format A but with different columns:
 *   0:row-type  1:STATE  2:COMPONENT  3:TIME  4:DIR  5:TRAIN#  6:VEHICLE#
 *   7:SEVERITY  8:TYPE   9:V POS     10:M POS 11:SIDE 12:VALUE1 13:VALUE2 …
 *
 * Files whose column layout does not match a known WIM format are rejected
 * with an 'unknown' type so the caller can surface a meaningful error.
 */

const Parser = (() => {

  const TON_TO_KN = 9.80665;

  // Known TYPE column values that identify a condition file
  const CONDITION_TYPE_SIGNATURES = [
    'Bridge Offsets [T]', 'Bridge Effectivity [T]', 'Dynamic Load [A]',
    'Lateral Force [A]', 'Mass [V]', 'Type [V]', 'Speed [V]',
  ];

  /**
   * Inspects the CSV text and returns 'condition', 'alarm', or 'unknown'.
   * Detection is based on file content (column headers and data patterns),
   * not the filename. Supports Format A (H/D prefix), Format B (headerless)
   * and Format C (headerless with Excel formula '=' prefix).
   * @param {string} csvText
   * @returns {'condition'|'alarm'|'unknown'}
   */
  function detectFileType(csvText) {
    const rows = parseRows(csvText);

    // Check header rows for column signature
    const hRow = rows.find(r => r[0] === 'H' && r.length >= 8);
    if (hRow) {
      const col1 = (hRow[1] || '').toUpperCase();
      const col2 = (hRow[2] || '').toUpperCase();
      const col3 = (hRow[3] || '').toUpperCase();

      if (col1 === 'COMPONENT') return 'condition';

      if (col1 === 'STATE') {
        // WIM alarm layout: STATE, COMPONENT, TIME, DIR, …
        // Non-WIM alarm-management export: STATE, COMPONENT, SEVERITY, TIME, …
        // Distinguish by whether col[3] is TIME (WIM) or SEVERITY (non-WIM).
        if (col2 === 'COMPONENT' && col3 === 'TIME') return 'alarm';
        return 'unknown';
      }
    }

    // Fallback: check D-row TYPE column
    const dRows = rows.filter(r => r[0] === 'D' && r.length >= 9);
    for (const r of dRows) {
      if (CONDITION_TYPE_SIGNATURES.includes(r[8])) return 'condition';
    }

    return 'unknown';
  }

  /**
   * Parses a condition CSV file text and returns a structured TrainData object.
   * Warnings are returned in the `warnings` array on the result — callers should
   * surface these to the user without blocking the analysis.
   * @param {string} csvText - raw file contents
   * @param {string} fileName - original filename for metadata
   * @returns {TrainData}
   */
  function parseConditionFile(csvText, fileName) {
    const rows = parseRows(csvText);
    let dataRows = rows.filter(r => r[0] === 'D' && r.length >= 12);

    if (dataRows.length === 0) {
      throw new Error('No data rows found in this file. Check that it is a valid ITCMS condition CSV.');
    }

    const warnings = [];

    // ── Multi-passage detection ──────────────────────────────────────────────
    // Group D-rows by their TIME column (col[2]). Multiple distinct timestamps
    // in the same file means the ITCMS query exported data from several separate
    // train passages merged into one file. This causes duplicate V POS entries
    // and produces misleading train overview graphics.
    const passageGroups = groupRowsByPassage(dataRows);
    if (passageGroups.length > 1) {
      const timestamps = passageGroups.map(g => g.timestamp);
      const largest = passageGroups.reduce((a, b) => a.rows.length >= b.rows.length ? a : b);

      warnings.push({
        code: 'MULTI_PASSAGE',
        message:
          `This file contains data from ${passageGroups.length} separate train passages ` +
          `(timestamps: ${timestamps.join(', ')}). ` +
          `Only the passage with the most data (${largest.timestamp}, ` +
          `${largest.rows.length} rows) has been used for analysis. ` +
          `Probable cause: the ITCMS query exported a date/time range that captured ` +
          `multiple passages for the same train ID. Re-export using a narrower time ` +
          `window that covers only the passage of interest to resolve this.`,
        timestamps,
        usedTimestamp: largest.timestamp,
      });

      dataRows = largest.rows;
    }

    const meta = extractMeta(dataRows[0], fileName);
    const offsets = extractBridgeOffsets(dataRows);
    const effectivity = extractEffectivity(dataRows);
    const trainMass = extractTrainMass(dataRows);
    const vehicles = extractVehicles(dataRows);

    return { meta, offsets, effectivity, trainMass, vehicles, warnings };
  }

  /**
   * Groups data rows into passages by their TIME column value.
   * Each unique time stamp is treated as a distinct passage.
   * @param {string[][]} dataRows
   * @returns {{ timestamp: string, rows: string[][] }[]}
   */
  function groupRowsByPassage(dataRows) {
    const map = new Map();
    for (const row of dataRows) {
      const ts = row[2] || '';
      if (!map.has(ts)) map.set(ts, []);
      map.get(ts).push(row);
    }
    return Array.from(map.entries()).map(([timestamp, rows]) => ({ timestamp, rows }));
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

  /**
   * Parses, normalises and returns all rows as H/D-prefixed string arrays.
   * Handles Format A (H/D prefix), Format B (headerless plain) and
   * Format C (headerless with Excel formula '=' prefix on field values).
   */
  function parseRows(csvText) {
    const rawRows = csvText
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => splitCsvLine(line));

    return normalizeToHDFormat(rawRows);
  }

  /**
   * Detects whether rows are already in H/D format or headerless, and
   * normalises them to a canonical H/D layout so the rest of the parser
   * can use fixed column indices regardless of the source format.
   *
   * H/D format:   first non-empty row's first field is 'H' or 'D'.
   * Headerless:   first row contains column-name strings — a synthetic
   *               'H' marker is prepended to it and 'D' is prepended to
   *               every subsequent row.
   */
  function normalizeToHDFormat(rawRows) {
    if (rawRows.length === 0) return rawRows;

    const firstField = rawRows[0][0];
    if (firstField === 'H' || firstField === 'D') return rawRows;

    // Headerless format: prepend row-type markers
    return rawRows.map((row, i) => [i === 0 ? 'H' : 'D', ...row]);
  }

  /**
   * Splits a single CSV line into fields, handling quoted fields and
   * stripping the Excel formula '=' prefix that direct-query exports add
   * to prevent Excel from interpreting values as formulas.
   *
   * Examples of raw field text (after the CSV layer):
   *   =XMEM801080030526  →  XMEM801080030526
   *   =-0.76             →  -0.76
   *   =V                 →  V
   *   =                  →  (empty string, from ="" in source)
   */
  function splitCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(stripExcelFormula(current.trim()));
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(stripExcelFormula(current.trim()));
    return result;
  }

  /**
   * Strips the Excel formula injection prefix ('=') from a parsed CSV field.
   * The CSV splitter processes  ="text"  as  =text  (quotes consumed by the
   * quote-state machine), so by the time this function is called only the
   * leading '=' remains to be removed.
   */
  function stripExcelFormula(value) {
    if (value.length > 0 && value[0] === '=') {
      return value.slice(1);
    }
    return value;
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

    // Bogie Couple (Skewness [B]): BBD5249 reports in tonnes (e.g. 0.280 = 0.280 t)
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

  return { parseConditionFile, parseAlarmFile, detectFileType };

})();
