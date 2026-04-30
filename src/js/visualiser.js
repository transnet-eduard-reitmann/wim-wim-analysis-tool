/**
 * visualiser.js — Renders the bridge channel layout heatmap and
 * multi-parameter train heatmap.
 *
 * Depends on: ALARM_LIMITS, SEVERITY, RAIL_TYPE (from config/alarm-limits.js)
 */

const Visualiser = (() => {

  // Cell background colours for heatmap cells (light theme)
  const CELL_BG = {
    [SEVERITY.NOMINAL]: '#dcfce7',  // green-100 — within limits
    [SEVERITY.TYPE1]:   '#fde68a',  // amber-200
    [SEVERITY.TYPE2]:   '#f97316',  // orange-500
    [SEVERITY.TYPE3]:   '#dc2626',  // red-600
    noData: '#f3f4f6',              // gray-100 — no measurement
  };

  // Cell text colours
  const CELL_TEXT = {
    [SEVERITY.NOMINAL]: '#15803d',  // green-700
    [SEVERITY.TYPE1]:   '#92400e',  // amber-900
    [SEVERITY.TYPE2]:   '#ffffff',
    [SEVERITY.TYPE3]:   '#ffffff',
  };

  // Legend swatch colours (stronger than cell backgrounds)
  const LEGEND_BG = {
    [SEVERITY.NOMINAL]: '#16a34a',  // green-600
    [SEVERITY.TYPE1]:   '#d97706',  // amber-600
    [SEVERITY.TYPE2]:   '#ea580c',  // orange-600
    [SEVERITY.TYPE3]:   '#dc2626',  // red-600
  };

  // Channel layout colours (for bridge channel cells)
  const CH_BG = { healthy: '#16a34a', warning: '#d97706', fault: '#dc2626', unknown: '#e5e7eb' };
  const CH_TEXT = { healthy: '#ffffff', warning: '#ffffff', fault: '#ffffff', unknown: '#9ca3af' };

  // ── Severity classifiers (independent of analyser.js) ─────────────────────

  function classifyDynLoad(kN, impactLimits) {
    if (kN == null || isNaN(kN)) return SEVERITY.NOMINAL;
    if (kN >= impactLimits.type3) return SEVERITY.TYPE3;
    if (kN >= impactLimits.type2) return SEVERITY.TYPE2;
    return SEVERITY.NOMINAL;
  }

  function classifyLateral(t) {
    if (t == null || isNaN(t)) return SEVERITY.NOMINAL;
    const lf = ALARM_LIMITS.lateralForce;
    if (t >= lf.type3Force) return SEVERITY.TYPE3;
    if (t >= lf.type2Min)   return SEVERITY.TYPE2;
    if (t >= lf.type1Min)   return SEVERITY.TYPE1;
    return SEVERITY.NOMINAL;
  }

  function classifyGauge(t) {
    if (t == null || isNaN(t)) return SEVERITY.NOMINAL;
    const gs = ALARM_LIMITS.gaugeSpreading;
    if (t >= gs.type2)    return SEVERITY.TYPE2;
    if (t >= gs.type1Min) return SEVERITY.TYPE1;
    return SEVERITY.NOMINAL;
  }

  function classifySkew(pct) {
    if (pct == null || isNaN(pct)) return SEVERITY.NOMINAL;
    const limit = ALARM_LIMITS.skewLoading.type2;
    if (pct >= limit)          return SEVERITY.TYPE2;
    if (pct >= limit / 2)      return SEVERITY.TYPE1;  // visual warning at 6%
    return SEVERITY.NOMINAL;
  }

  // ── Bridge Channel Layout Heatmap ─────────────────────────────────────────

  /**
   * Renders a physical bridge layout showing channel health as coloured cells.
   *
   * Channel mapping (per user specification):
   *   01–13  Left rail vertical sensors
   *   14–26  Right rail vertical sensors
   *   27     Left rail lateral force sensor
   *   28     Right rail lateral force sensor
   *   29–32  Additional channels (shown if present)
   */
  function renderChannelLayout(channelHealth, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    // Index channel data by channel number string
    const byChannel = {};
    channelHealth.channels.forEach(c => { byChannel[c.channel] = c; });

    // Channel groups
    const leftVert  = range(1, 13).map(pad2);
    const rightVert = range(14, 26).map(pad2);
    const leftLat   = ['27'];
    const rightLat  = ['28'];
    const extra     = range(29, 32).map(pad2).filter(ch => byChannel[ch]);

    const layout = el('div', 'display:flex;flex-direction:column;gap:6px;');

    // Rail rows
    layout.appendChild(buildRailRow('Left rail', leftVert, leftLat, byChannel));
    layout.appendChild(buildTrackBar());
    layout.appendChild(buildRailRow('Right rail', rightVert, rightLat, byChannel));

    if (extra.length > 0) {
      const extraRow = buildRailRow('Other', extra, [], byChannel);
      extraRow.style.marginTop = '4px';
      layout.appendChild(extraRow);
    }

    // Legend
    const legend = el('div', 'display:flex;flex-wrap:wrap;gap:14px;margin-top:10px;');
    [
      { bg: CH_BG.healthy, label: `Healthy (< ${ALARM_LIMITS.channelOffset.warningThreshold} t)` },
      { bg: CH_BG.warning, label: `Warning (${ALARM_LIMITS.channelOffset.warningThreshold}–${ALARM_LIMITS.channelOffset.faultThreshold} t)` },
      { bg: CH_BG.fault,   label: `Fault (≥ ${ALARM_LIMITS.channelOffset.faultThreshold} t)` },
    ].forEach(item => {
      const e = el('div', 'display:flex;align-items:center;gap:6px;font-size:11px;color:#6b7280;');
      e.innerHTML = `<span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:${item.bg}"></span>${item.label}`;
      legend.appendChild(e);
    });
    layout.appendChild(legend);

    container.appendChild(layout);
  }

  function buildRailRow(labelText, vertChs, latChs, byChannel) {
    const row = el('div', 'display:flex;align-items:center;gap:4px;');

    const lbl = el('div', 'font-size:11px;color:#6b7280;width:72px;flex-shrink:0;font-weight:500;');
    lbl.textContent = labelText;
    row.appendChild(lbl);

    const cells = el('div', 'display:flex;gap:2px;flex-wrap:nowrap;');
    vertChs.forEach(ch => cells.appendChild(buildChannelCell(ch, byChannel[ch])));
    row.appendChild(cells);

    if (latChs.length > 0) {
      const sep = el('div', 'width:1px;background:#d1d5db;margin:0 6px;align-self:stretch;');
      row.appendChild(sep);

      const latLabel = el('div', 'font-size:10px;color:#9ca3af;flex-shrink:0;align-self:center;');
      latLabel.textContent = 'Lateral:';
      row.appendChild(latLabel);

      const latCells = el('div', 'display:flex;gap:2px;margin-left:4px;');
      latChs.forEach(ch => latCells.appendChild(buildChannelCell(ch, byChannel[ch])));
      row.appendChild(latCells);
    }

    return row;
  }

  function buildChannelCell(ch, data) {
    const cell = el('div',
      'width:28px;height:28px;border-radius:3px;display:flex;flex-direction:column;' +
      'align-items:center;justify-content:center;font-size:9px;font-weight:700;' +
      'flex-shrink:0;cursor:default;border:1px solid rgba(0,0,0,0.08);line-height:1;'
    );

    if (data) {
      const status = data.status;
      cell.style.backgroundColor = CH_BG[status] || CH_BG.unknown;
      cell.style.color = CH_TEXT[status] || '#9ca3af';
      cell.title = `Channel ${ch}\nOffset: ${data.value.toFixed(3)} t\nStatus: ${status.toUpperCase()}`;
    } else {
      cell.style.backgroundColor = CH_BG.unknown;
      cell.style.color = '#9ca3af';
      cell.title = `Channel ${ch}: no data`;
    }

    cell.textContent = parseInt(ch, 10);
    return cell;
  }

  function buildTrackBar() {
    const wrap = el('div', 'display:flex;align-items:center;gap:4px;');
    const spacer = el('div', 'width:72px;flex-shrink:0;');
    const bar = el('div', 'height:3px;background:#374151;border-radius:2px;flex:1;');
    const lbl = el('div', 'font-size:9px;color:#9ca3af;white-space:nowrap;padding:0 8px;');
    lbl.textContent = '—— measurement bridge ——';
    wrap.appendChild(spacer);
    wrap.appendChild(bar);
    return wrap;
  }

  // ── Multi-Parameter Train Heatmap ─────────────────────────────────────────

  /**
   * Renders stacked parameter strips for the full train.
   * A fixed label column is paired with a horizontally scrollable cell area
   * so the parameter names stay visible while scrolling through long trains.
   *
   * Parameter rows rendered:
   *   Dynamic Load Left (kN)  — per wheel, per axle
   *   Dynamic Load Right (kN)
   *   Lateral Force Left (t)  — per wheel, per axle
   *   Lateral Force Right (t)
   *   Gauge Spreading (t)     — per axle (combined rail)
   *   Side-to-Side Skew (%)   — per vehicle
   *   End-to-End Skew (%)     — per vehicle
   */
  function renderMultiParamHeatmap(trainData, analysisResult, railType, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    const { vehicles } = trainData;
    if (!vehicles || vehicles.length === 0) {
      container.innerHTML = '<p style="color:#9ca3af;font-size:14px;">No vehicle data available.</p>';
      return;
    }

    const impactLimits = ALARM_LIMITS.wheelImpact[railType];
    const CELL_W = 8;   // px per axle column
    const ROW_H  = 10;  // px per parameter row

    // Flat ordered list of all axles across all vehicles
    const axleCols = [];
    vehicles.forEach(v => {
      v.axles.forEach((axle, idx) => {
        axleCols.push({ vPos: v.vPos, axleNum: axle.axleNum, isFirst: idx === 0, axle, vData: v });
      });
    });

    if (axleCols.length === 0) {
      container.innerHTML = '<p style="color:#9ca3af;font-size:14px;">No axle data found.</p>';
      return;
    }

    // ── Parameter definitions ──────────────────────────
    const paramGroups = [
      {
        label: 'Dynamic Load',
        rows: [
          { label: 'Left wheel (kN)',  getValue: col => col.axle.dynamicLoadLeft_kN,  classify: v => classifyDynLoad(v, impactLimits), fmt: v => v.toFixed(1) + ' kN' },
          { label: 'Right wheel (kN)', getValue: col => col.axle.dynamicLoadRight_kN, classify: v => classifyDynLoad(v, impactLimits), fmt: v => v.toFixed(1) + ' kN' },
        ],
      },
      {
        label: 'Lateral Force',
        rows: [
          { label: 'Left wheel (t)',  getValue: col => col.axle.lateralForceLeft_t,  classify: classifyLateral, fmt: v => v.toFixed(2) + ' t' },
          { label: 'Right wheel (t)', getValue: col => col.axle.lateralForceRight_t, classify: classifyLateral, fmt: v => v.toFixed(2) + ' t' },
        ],
      },
      {
        label: 'Gauge Spreading',
        rows: [
          { label: 'Force (t)', getValue: col => col.axle.gaugeSpreadingForce_t, classify: classifyGauge, fmt: v => v.toFixed(2) + ' t' },
        ],
      },
    ];

    const vehicleGroups = [
      {
        label: 'Skew Loading',
        rows: [
          { label: 'Side-to-Side (%)', getValue: v => v.sideToSideSkew != null ? v.sideToSideSkew * 100 : null, classify: classifySkew, fmt: v => v.toFixed(1) + '%' },
          { label: 'End-to-End (%)',   getValue: v => v.endToEndSkew   != null ? v.endToEndSkew   * 100 : null, classify: classifySkew, fmt: v => v.toFixed(1) + '%' },
        ],
      },
    ];

    // ── Build DOM ──────────────────────────────────────

    // Label column (fixed) + scrollable cells column
    const wrapper = el('div', 'display:flex;align-items:flex-start;');

    const labelCol = el('div', 'flex-shrink:0;width:130px;');
    const scrollCol = el('div', 'flex:1;min-width:0;overflow-x:auto;');
    scrollCol.className = 'heatmap-scroll';

    const cellsWrap = el('div', 'display:inline-flex;flex-direction:column;min-width:max-content;');

    // Helper: add one label entry and one cell row simultaneously
    function addRow(labelText, cellRow, isGroupLabel) {
      const h = isGroupLabel ? '14px' : ROW_H + 'px';
      const lbl = el('div', `height:${h};line-height:${h};font-size:${isGroupLabel ? '9' : '10'}px;` +
        `color:${isGroupLabel ? '#9ca3af' : '#6b7280'};white-space:nowrap;` +
        `${isGroupLabel ? 'text-transform:uppercase;letter-spacing:0.05em;' : 'font-weight:500;'}`);
      lbl.textContent = labelText;
      labelCol.appendChild(lbl);
      cellsWrap.appendChild(cellRow);
    }

    function addSpacer(h) {
      const ls = el('div', `height:${h};`); labelCol.appendChild(ls);
      const cs = el('div', `height:${h};`); cellsWrap.appendChild(cs);
    }

    // Build one row of axle-level cells
    function buildAxleRow(stripDef) {
      const row = el('div', `display:flex;height:${ROW_H}px;`);
      axleCols.forEach(col => {
        const val = stripDef.getValue(col);
        const sev = val != null ? stripDef.classify(val) : null;
        const bg  = sev != null ? CELL_BG[sev] : CELL_BG.noData;
        const cell = el('div',
          `width:${CELL_W}px;height:${ROW_H}px;flex-shrink:0;box-sizing:border-box;background:${bg};` +
          (col.isFirst && col !== axleCols[0] ? 'border-left:1px solid #d1d5db;' : '')
        );
        if (val != null) {
          cell.title = `V${col.vPos} · Axle ${col.axleNum}\n${stripDef.label}: ${stripDef.fmt(val)}` +
                       (sev !== SEVERITY.NOMINAL ? `\n⚠ Severity: ${sev}` : '');
        }
        row.appendChild(cell);
      });
      return row;
    }

    // Build one row of vehicle-level cells (one wide cell per vehicle)
    function buildVehicleRow(stripDef) {
      const row = el('div', `display:flex;height:${ROW_H}px;`);
      vehicles.forEach((v, vIdx) => {
        const cellW = v.axles.length * CELL_W;
        const val = stripDef.getValue(v);
        const sev = val != null ? stripDef.classify(val) : null;
        const bg  = sev != null ? CELL_BG[sev] : CELL_BG.noData;
        const fg  = sev != null ? CELL_TEXT[sev] : '#9ca3af';
        const cell = el('div',
          `width:${cellW}px;height:${ROW_H}px;flex-shrink:0;box-sizing:border-box;background:${bg};` +
          `display:flex;align-items:center;justify-content:center;` +
          `font-size:8px;font-weight:600;color:${fg};overflow:hidden;` +
          (vIdx > 0 ? 'border-left:1px solid #d1d5db;' : '')
        );
        if (val != null) {
          cell.title = `V${v.vPos}: ${stripDef.label}: ${stripDef.fmt(val)}` +
                       (sev !== SEVERITY.NOMINAL ? `\n⚠ Severity: ${sev}` : '');
          if (cellW > 28) cell.textContent = stripDef.fmt(val);
        }
        row.appendChild(cell);
      });
      return row;
    }

    // Build vehicle label row at bottom
    function buildVehicleLabelRow() {
      const row = el('div', 'display:flex;margin-top:3px;');
      vehicles.forEach((v, vIdx) => {
        const cellW = v.axles.length * CELL_W;
        const cell = el('div',
          `width:${cellW}px;flex-shrink:0;font-size:9px;color:#9ca3af;text-align:center;` +
          `overflow:hidden;text-overflow:ellipsis;white-space:nowrap;` +
          (vIdx > 0 ? 'border-left:1px solid #e5e7eb;' : '')
        );
        if (cellW > 14) cell.textContent = `V${v.vPos}`;
        row.appendChild(cell);
      });
      return row;
    }

    // ── Assemble rows ──────────────────────────────────

    paramGroups.forEach((group, gIdx) => {
      if (gIdx > 0) addSpacer('6px');
      addRow(group.label, el('div', 'height:14px;'), true);
      group.rows.forEach((row, rIdx) => {
        if (rIdx > 0) addSpacer('1px');
        addRow(row.label, buildAxleRow(row), false);
      });
    });

    vehicleGroups.forEach(group => {
      addSpacer('6px');
      addRow(group.label, el('div', 'height:14px;'), true);
      group.rows.forEach((row, rIdx) => {
        if (rIdx > 0) addSpacer('1px');
        addRow(row.label, buildVehicleRow(row), false);
      });
    });

    // Vehicle labels at the bottom
    addSpacer('2px');
    const lblSpacer = el('div', 'height:16px;'); labelCol.appendChild(lblSpacer);
    cellsWrap.appendChild(buildVehicleLabelRow());

    scrollCol.appendChild(cellsWrap);
    wrapper.appendChild(labelCol);
    wrapper.appendChild(scrollCol);
    container.appendChild(wrapper);

    // Legend
    container.appendChild(buildLegend());
  }

  // ── Shared helpers ─────────────────────────────────────────────────────────

  function buildLegend() {
    const legend = el('div', 'display:flex;flex-wrap:wrap;gap:14px;margin-top:10px;');
    [
      { sev: SEVERITY.NOMINAL, label: 'Nominal' },
      { sev: SEVERITY.TYPE1,   label: 'Type 1 (depot)' },
      { sev: SEVERITY.TYPE2,   label: 'Type 2 (station)' },
      { sev: SEVERITY.TYPE3,   label: 'Type 3 (stop)' },
    ].forEach(item => {
      const e = el('div', 'display:flex;align-items:center;gap:6px;font-size:11px;color:#6b7280;');
      e.innerHTML = `<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${LEGEND_BG[item.sev]}"></span>${item.label}`;
      legend.appendChild(e);
    });
    return legend;
  }

  // Convenience: create an element with inline style
  function el(tag, style) {
    const e = document.createElement(tag);
    if (style) e.style.cssText = style;
    return e;
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  function range(from, to) {
    const arr = [];
    for (let i = from; i <= to; i++) arr.push(i);
    return arr;
  }

  return { renderChannelLayout, renderMultiParamHeatmap };

})();
