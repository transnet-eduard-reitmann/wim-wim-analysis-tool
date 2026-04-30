/**
 * visualiser.js — Renders the bridge channel layout heatmap and the
 * vertical multi-parameter train heatmap.
 *
 * Depends on: ALARM_LIMITS, SEVERITY, RAIL_TYPE (from config/alarm-limits.js)
 */

const Visualiser = (() => {

  // Cell background colours — light backgrounds for nominal, vivid for exceedances
  const CELL_BG = {
    [SEVERITY.NOMINAL]: '#dcfce7',  // green-100
    [SEVERITY.TYPE1]:   '#fde68a',  // amber-200
    [SEVERITY.TYPE2]:   '#f97316',  // orange-500
    [SEVERITY.TYPE3]:   '#dc2626',  // red-600
    noData: '#f3f4f6',              // gray-100
  };

  const CELL_TEXT = {
    [SEVERITY.NOMINAL]: '#15803d',  // green-700
    [SEVERITY.TYPE1]:   '#92400e',  // amber-900
    [SEVERITY.TYPE2]:   '#ffffff',
    [SEVERITY.TYPE3]:   '#ffffff',
  };

  const LEGEND_BG = {
    [SEVERITY.NOMINAL]: '#16a34a',
    [SEVERITY.TYPE1]:   '#d97706',
    [SEVERITY.TYPE2]:   '#ea580c',
    [SEVERITY.TYPE3]:   '#dc2626',
  };

  const CH_BG   = { healthy: '#16a34a', warning: '#d97706', fault: '#dc2626', unknown: '#e5e7eb' };
  const CH_TEXT = { healthy: '#ffffff', warning: '#ffffff', fault: '#ffffff', unknown: '#9ca3af' };

  // ── Custom floating tooltip ────────────────────────────────────────────────

  let _tip = null;

  function getTip() {
    if (!_tip) {
      _tip = document.createElement('div');
      _tip.style.cssText =
        'position:fixed;pointer-events:none;z-index:9999;display:none;' +
        'background:rgba(17,24,39,0.93);color:#f9fafb;border-radius:6px;' +
        'padding:6px 10px;font-size:11px;line-height:1.6;white-space:pre;' +
        'max-width:260px;box-shadow:0 4px 12px rgba(0,0,0,0.25);font-family:monospace;';
      document.body.appendChild(_tip);
    }
    return _tip;
  }

  function attachTooltip(el, text) {
    el.style.cursor = 'default';
    el.addEventListener('mouseenter', e => {
      const tip = getTip();
      tip.textContent = text;
      tip.style.display = 'block';
      _moveTip(e);
    });
    el.addEventListener('mousemove', _moveTip);
    el.addEventListener('mouseleave', () => { getTip().style.display = 'none'; });
  }

  function _moveTip(e) {
    const tip = getTip();
    const x = Math.min(e.clientX + 14, window.innerWidth  - tip.offsetWidth  - 6);
    const y = Math.min(e.clientY + 14, window.innerHeight - tip.offsetHeight - 6);
    tip.style.left = x + 'px';
    tip.style.top  = y + 'px';
  }

  // ── Severity classifiers ───────────────────────────────────────────────────

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
    if (pct >= limit)         return SEVERITY.TYPE2;
    if (pct >= limit / 2)     return SEVERITY.TYPE1;  // visual pre-warning at 6%
    return SEVERITY.NOMINAL;
  }

  // ── Bridge Channel Layout Heatmap ─────────────────────────────────────────

  /**
   * Renders a physical bridge layout showing channel health as coloured cells
   * with a custom hover tooltip showing the exact offset value.
   *
   * Ch 01–13 = left rail vertical sensors
   * Ch 14–26 = right rail vertical sensors
   * Ch 27    = left rail lateral sensor
   * Ch 28    = right rail lateral sensor
   * Ch 29–32 = additional channels (shown if present)
   */
  function renderChannelLayout(channelHealth, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    const byChannel = {};
    channelHealth.channels.forEach(c => { byChannel[c.channel] = c; });

    const leftVert  = range(1, 13).map(pad2);
    const rightVert = range(14, 26).map(pad2);
    const extra     = range(29, 32).map(pad2).filter(ch => byChannel[ch]);

    const layout = el('div', 'display:flex;flex-direction:column;gap:6px;');
    layout.appendChild(buildRailRow('Left rail',  leftVert,  ['27'], byChannel));
    layout.appendChild(buildTrackBar());
    layout.appendChild(buildRailRow('Right rail', rightVert, ['28'], byChannel));
    if (extra.length > 0) {
      const r = buildRailRow('Other', extra, [], byChannel);
      r.style.marginTop = '4px';
      layout.appendChild(r);
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
    const row = el('div', 'display:flex;align-items:center;gap:4px;flex-wrap:wrap;');
    const lbl = el('div', 'font-size:11px;color:#6b7280;width:72px;flex-shrink:0;font-weight:500;');
    lbl.textContent = labelText;
    row.appendChild(lbl);

    const cells = el('div', 'display:flex;gap:2px;flex-wrap:nowrap;');
    vertChs.forEach(ch => cells.appendChild(buildChannelCell(ch, byChannel[ch])));
    row.appendChild(cells);

    if (latChs.length > 0) {
      const sep = el('div', 'width:1px;background:#d1d5db;margin:0 6px;align-self:stretch;');
      row.appendChild(sep);
      const latLbl = el('div', 'font-size:10px;color:#9ca3af;flex-shrink:0;align-self:center;margin-right:4px;');
      latLbl.textContent = 'Lateral:';
      row.appendChild(latLbl);
      latChs.forEach(ch => {
        if (byChannel[ch]) row.appendChild(buildChannelCell(ch, byChannel[ch]));
      });
    }
    return row;
  }

  function buildChannelCell(ch, data) {
    const cell = el('div',
      'width:28px;height:28px;border-radius:3px;display:flex;align-items:center;' +
      'justify-content:center;font-size:9px;font-weight:700;flex-shrink:0;' +
      'border:1px solid rgba(0,0,0,0.08);line-height:1;'
    );
    const status = data ? data.status : 'unknown';
    cell.style.backgroundColor = CH_BG[status] || CH_BG.unknown;
    cell.style.color = CH_TEXT[status] || '#9ca3af';
    cell.textContent = parseInt(ch, 10);

    const tipText = data
      ? `Channel ${ch}\nOffset: ${data.value.toFixed(3)} t\nStatus: ${status.toUpperCase()}`
      : `Channel ${ch}: no data`;
    attachTooltip(cell, tipText);
    return cell;
  }

  function buildTrackBar() {
    const wrap = el('div', 'display:flex;align-items:center;gap:4px;');
    wrap.appendChild(el('div', 'width:72px;flex-shrink:0;'));
    wrap.appendChild(el('div', 'height:3px;background:#374151;border-radius:2px;flex:1;'));
    return wrap;
  }

  // ── Vertical Multi-Parameter Train Heatmap ────────────────────────────────

  /**
   * Renders a vertical CSS-grid heatmap where each row is one axle and each
   * column is one measurement parameter. This layout flows naturally onto
   * subsequent PDF pages for long trains.
   *
   * Columns: Dyn Load L/R · Lateral Force L/R · Gauge Spreading · S-S Skew · E-E Skew
   *
   * Only non-nominal (exceedance) cells show their numeric value as text;
   * nominal cells show only the green background. Hover shows exact values
   * for all cells via a custom floating tooltip.
   */
  function renderMultiParamHeatmap(trainData, analysisResult, railType, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    const { vehicles } = trainData;
    if (!vehicles || vehicles.length === 0) {
      container.innerHTML = '<p style="color:#9ca3af;">No vehicle data available.</p>';
      return;
    }

    const impactLimits = ALARM_LIMITS.wheelImpact[railType];

    // Column definitions: { label (2-line), getAxleVal|getVehicleVal, classify, fmt, perVehicle }
    const COLS = [
      { label: 'Dyn Load\nLeft (kN)',  getAxleVal: a => a.dynamicLoadLeft_kN,   classify: v => classifyDynLoad(v, impactLimits), fmt: v => v.toFixed(1), perVehicle: false },
      { label: 'Dyn Load\nRight (kN)', getAxleVal: a => a.dynamicLoadRight_kN,  classify: v => classifyDynLoad(v, impactLimits), fmt: v => v.toFixed(1), perVehicle: false },
      { label: 'Lat Force\nLeft (t)',  getAxleVal: a => a.lateralForceLeft_t,   classify: classifyLateral,                      fmt: v => v.toFixed(2), perVehicle: false },
      { label: 'Lat Force\nRight (t)', getAxleVal: a => a.lateralForceRight_t,  classify: classifyLateral,                      fmt: v => v.toFixed(2), perVehicle: false },
      { label: 'Gauge\nSpread (t)',    getAxleVal: a => a.gaugeSpreadingForce_t, classify: classifyGauge,                        fmt: v => v.toFixed(2), perVehicle: false },
      { label: 'Side-Side\nSkew (%)',  getVehicleVal: v => v.sideToSideSkew != null ? v.sideToSideSkew * 100 : null, classify: classifySkew, fmt: v => v.toFixed(1) + '%', perVehicle: true },
      { label: 'End-End\nSkew (%)',    getVehicleVal: v => v.endToEndSkew   != null ? v.endToEndSkew   * 100 : null, classify: classifySkew, fmt: v => v.toFixed(1) + '%', perVehicle: true },
    ];

    const LABEL_W = 65;   // px — "A12" label column
    const COL_W   = 56;   // px — each parameter column
    const ROW_H   = 13;   // px — axle data row height
    const VEH_H   = 20;   // px — vehicle separator row height
    const TOTAL_W = LABEL_W + COLS.length * COL_W;

    // ── Grid container ─────────────────────────────────
    const grid = document.createElement('div');
    grid.style.cssText =
      `display:grid;` +
      `grid-template-columns:${LABEL_W}px repeat(${COLS.length},${COL_W}px);` +
      `width:${TOTAL_W}px;border-left:1px solid #e5e7eb;border-top:1px solid #e5e7eb;`;

    // ── Sticky header row ──────────────────────────────
    // Label/axle header cell
    const axleHdr = el('div',
      'position:sticky;top:0;z-index:5;background:#f9fafb;border-right:1px solid #e5e7eb;' +
      'border-bottom:2px solid #d1d5db;padding:4px 4px 4px 6px;font-size:9px;' +
      'font-weight:600;color:#6b7280;display:flex;align-items:flex-end;'
    );
    axleHdr.textContent = 'V / Axle';
    grid.appendChild(axleHdr);

    COLS.forEach(col => {
      const hdr = el('div',
        'position:sticky;top:0;z-index:5;background:#f9fafb;border-right:1px solid #e5e7eb;' +
        'border-bottom:2px solid #d1d5db;padding:4px 2px;font-size:9px;font-weight:600;' +
        'color:#6b7280;text-align:center;line-height:1.3;'
      );
      hdr.innerHTML = col.label.replace('\n', '<br>');
      grid.appendChild(hdr);
    });

    // ── Data rows — one vehicle block at a time ────────
    vehicles.forEach(v => {
      // Pre-compute vehicle-level values
      const vVals = {};
      COLS.filter(c => c.perVehicle).forEach(c => {
        vVals[c.label] = c.getVehicleVal(v);
      });

      // Vehicle separator row (spans all columns)
      const vHdr = el('div',
        `grid-column:1/-1;background:#f3f4f6;border-top:2px solid #cbd5e1;` +
        `border-bottom:1px solid #e2e8f0;padding:0 8px;` +
        `height:${VEH_H}px;display:flex;align-items:center;` +
        `font-size:10px;font-weight:600;color:#374151;gap:10px;`
      );
      const vIdStr = v.vehicleId ? ` · ${v.vehicleId.trim()}` : '';
      const vMassStr = v.mass_t ? ` · ${v.mass_t.toFixed(1)} t` : '';
      vHdr.textContent = `Vehicle ${v.vPos}${vIdStr}${vMassStr} · ${v.axles.length} axles`;
      grid.appendChild(vHdr);

      // Axle rows
      v.axles.forEach((axle, aIdx) => {
        // Axle label cell
        const lblCell = el('div',
          `height:${ROW_H}px;display:flex;align-items:center;padding:0 4px 0 6px;` +
          `font-size:9px;color:#9ca3af;border-right:1px solid #e5e7eb;` +
          `border-bottom:1px solid #f3f4f6;background:#fafafa;`
        );
        lblCell.textContent = `A${axle.axleNum}`;
        grid.appendChild(lblCell);

        // Parameter cells
        COLS.forEach(col => {
          const val = col.perVehicle ? vVals[col.label] : col.getAxleVal(axle);
          const sev = val != null ? col.classify(val) : null;
          const bg  = sev != null ? CELL_BG[sev] : CELL_BG.noData;
          const fg  = sev != null ? CELL_TEXT[sev] : 'transparent';

          const cell = el('div',
            `height:${ROW_H}px;background:${bg};border-right:1px solid rgba(0,0,0,0.05);` +
            `border-bottom:1px solid rgba(0,0,0,0.04);display:flex;align-items:center;` +
            `justify-content:center;font-size:8px;font-weight:700;color:${fg};overflow:hidden;`
          );

          // Show numeric value only for non-nominal exceedances
          const showValue = sev != null && sev !== SEVERITY.NOMINAL;
          // For vehicle-level skew, only show text on first axle of vehicle
          const showSkewText = col.perVehicle && aIdx === 0;
          if (showValue && (!col.perVehicle || showSkewText)) {
            cell.textContent = col.fmt(val);
          }

          // Tooltip for all cells that have a measurement
          if (val != null) {
            const sevLabel = sev !== SEVERITY.NOMINAL ? `\n⚠ Severity: ${sev}` : '';
            const tipText =
              `V${v.vPos} · Axle ${axle.axleNum}\n` +
              `${col.label.replace('\n', ' ')}: ${col.fmt(val)}` + sevLabel;
            attachTooltip(cell, tipText);
          } else {
            attachTooltip(cell, `V${v.vPos} · Axle ${axle.axleNum}\n${col.label.replace('\n', ' ')}: no data`);
          }

          grid.appendChild(cell);
        });
      });
    });

    // Wrap grid in vertical scroll container (for screen only — PDF expands it)
    const scrollWrap = document.createElement('div');
    scrollWrap.className = 'heatmap-v-scroll';
    scrollWrap.appendChild(grid);
    container.appendChild(scrollWrap);
    container.appendChild(buildLegend());
  }

  // ── Shared helpers ─────────────────────────────────────────────────────────

  function buildLegend() {
    const legend = el('div', 'display:flex;flex-wrap:wrap;gap:14px;margin-top:10px;');
    [
      { sev: SEVERITY.NOMINAL, label: 'Nominal (within limits)' },
      { sev: SEVERITY.TYPE1,   label: 'Type 1 — Continue to depot' },
      { sev: SEVERITY.TYPE2,   label: 'Type 2 — Continue to station' },
      { sev: SEVERITY.TYPE3,   label: 'Type 3 — Stop train' },
    ].forEach(item => {
      const e = el('div', 'display:flex;align-items:center;gap:6px;font-size:11px;color:#6b7280;');
      e.innerHTML = `<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${LEGEND_BG[item.sev]}"></span>${item.label}`;
      legend.appendChild(e);
    });
    return legend;
  }

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
