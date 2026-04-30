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
    const proxChs   = ['29', '30'].filter(ch => byChannel[ch]);
    const trigChs   = ['31', '32'].filter(ch => byChannel[ch]);

    const layout = el('div', 'display:flex;flex-direction:column;gap:6px;');
    layout.appendChild(buildRailRow('Left rail',  leftVert,  ['27'], byChannel));
    layout.appendChild(buildTrackBar());
    layout.appendChild(buildRailRow('Right rail', rightVert, ['28'], byChannel));

    // Other channels (proximity + triggers) combined into one row
    if (proxChs.length > 0 || trigChs.length > 0) {
      const otherRow = el('div', 'display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-top:4px;');
      const rowLbl = el('div', 'font-size:11px;color:#6b7280;width:72px;flex-shrink:0;font-weight:500;');
      rowLbl.textContent = 'Other';
      otherRow.appendChild(rowLbl);
      let firstSection = true;
      const addSection = (subLabel, chs) => {
        if (chs.length === 0) return;
        if (!firstSection) {
          otherRow.appendChild(el('div', 'width:1px;background:#d1d5db;margin:0 6px;align-self:stretch;'));
        }
        const sl = el('div', 'font-size:10px;color:#9ca3af;flex-shrink:0;align-self:center;margin-right:4px;');
        sl.textContent = subLabel + ':';
        otherRow.appendChild(sl);
        chs.forEach(ch => otherRow.appendChild(buildChannelCell(ch, byChannel[ch])));
        firstSection = false;
      };
      addSection('Proximity', proxChs);
      addSection('Triggers', trigChs);
      layout.appendChild(otherRow);
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

    // "Vertical:" sub-label
    const vertLbl = el('div', 'font-size:10px;color:#9ca3af;flex-shrink:0;align-self:center;margin-right:4px;');
    vertLbl.textContent = 'Vertical:';
    row.appendChild(vertLbl);

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

  function channelDescription(ch) {
    const n = parseInt(ch, 10);
    if (n >= 1  && n <= 13) return 'Left rail — vertical sensor';
    if (n >= 14 && n <= 26) return 'Right rail — vertical sensor';
    if (n === 27) return 'Left rail — lateral force sensor';
    if (n === 28) return 'Right rail — lateral force sensor';
    if (n === 29 || n === 30) return 'Proximity sensor (speed / direction / vehicle recognition)';
    if (n === 31 || n === 32) return 'Trigger input (data acquisition start/stop)';
    return '';
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

    const desc = channelDescription(ch);
    const tipText = data
      ? `Channel ${ch}${desc ? '\n' + desc : ''}\nOffset: ${data.value.toFixed(3)} t\nStatus: ${status.toUpperCase()}`
      : `Channel ${ch}${desc ? '\n' + desc : ''}\nNo data`;
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
   * Renders a block-grid heatmap where each row is one axle. Parameters are
   * split into two visually distinct column groups:
   *   • Vertical Force Parameters — Dyn Load L/R · S-S Skew · E-E Skew
   *   • Lateral Force Parameters  — Lat Force L/R · Gauge Spreading
   *
   * Blocks carry no text — hover tooltips show exact values and severity.
   * Each vehicle block has a rotated sidebar showing vehicle number, ID and
   * mass alongside a column of axle labels.
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

    // ── Column group definitions ──────────────────────────
    const VERT_COLS = [
      { key: 'dynL',   label: 'Dyn\nLoad L',  getAxleVal: a => a.dynamicLoadLeft_kN,                                        classify: v => classifyDynLoad(v, impactLimits), fmt: v => v.toFixed(1) + ' kN', perVehicle: false },
      { key: 'dynR',   label: 'Dyn\nLoad R',  getAxleVal: a => a.dynamicLoadRight_kN,                                       classify: v => classifyDynLoad(v, impactLimits), fmt: v => v.toFixed(1) + ' kN', perVehicle: false },
      { key: 'ssSkew', label: 'S-S\nSkew',    getVehicleVal: v => v.sideToSideSkew != null ? v.sideToSideSkew * 100 : null, classify: classifySkew, fmt: v => v.toFixed(1) + '%',  perVehicle: true },
      { key: 'eeSkew', label: 'E-E\nSkew',    getVehicleVal: v => v.endToEndSkew   != null ? v.endToEndSkew   * 100 : null, classify: classifySkew, fmt: v => v.toFixed(1) + '%',  perVehicle: true },
    ];
    const LAT_COLS = [
      { key: 'latL',  label: 'Lat\nForce L',  getAxleVal: a => a.lateralForceLeft_t,    classify: classifyLateral, fmt: v => v.toFixed(2) + ' t', perVehicle: false },
      { key: 'latR',  label: 'Lat\nForce R',  getAxleVal: a => a.lateralForceRight_t,   classify: classifyLateral, fmt: v => v.toFixed(2) + ' t', perVehicle: false },
      { key: 'gauge', label: 'Gauge\nSpread', getAxleVal: a => a.gaugeSpreadingForce_t, classify: classifyGauge,   fmt: v => v.toFixed(2) + ' t', perVehicle: false },
    ];

    // Layout constants (px)
    const BW = 28, BH = 28, BG = 3, GG = 16;
    const VROT_W = 18;                      // rotated vehicle-info strip width
    const AXLE_W = 46;                      // axle-number column width
    const INFO_W = VROT_W + AXLE_W;        // = 64 — left sidebar total
    const vertW  = VERT_COLS.length * (BW + BG) - BG;   // 4×31 − 3 = 121
    const latW   = LAT_COLS.length  * (BW + BG) - BG;   // 3×31 − 3 = 90
    const totalW = INFO_W + GG + vertW + GG + latW;      // = 307

    // Shared group-divider factory (used inside axle rows in blocksArea)
    function mkDivider() {
      const d = el('div',
        `width:${GG}px;flex-shrink:0;display:flex;align-items:center;justify-content:center;`
      );
      d.appendChild(el('div', `width:1px;height:${BH - 6}px;background:#e5e7eb;border-radius:1px;`));
      return d;
    }

    // ── Scroll wrapper ────────────────────────────────────
    const scrollWrap = document.createElement('div');
    scrollWrap.className = 'heatmap-v-scroll';

    const inner = el('div', `width:${totalW}px;padding-bottom:4px;`);

    // ── Sticky double-header ──────────────────────────────
    const stickyHdr = el('div',
      `position:sticky;top:0;z-index:10;background:#ffffff;` +
      `border-bottom:2px solid #d1d5db;margin-bottom:8px;`
    );

    function mkGrpLabel(w, text, fg, bg, bdr) {
      const d = el('div',
        `width:${w}px;flex-shrink:0;text-align:center;font-size:9px;font-weight:700;` +
        `letter-spacing:0.04em;color:${fg};background:${bg};` +
        `border:1px solid ${bdr};border-bottom:none;border-radius:4px 4px 0 0;padding:3px 2px 2px;`
      );
      d.textContent = text;
      return d;
    }

    function mkColHdrs(cols, fg, bg, bdr) {
      const wrap = el('div',
        `display:flex;gap:${BG}px;flex-shrink:0;background:${bg};` +
        `border-left:1px solid ${bdr};border-right:1px solid ${bdr};padding:2px ${BG}px 4px;`
      );
      cols.forEach(col => {
        const h = el('div',
          `width:${BW}px;flex-shrink:0;text-align:center;font-size:7.5px;font-weight:700;color:${fg};line-height:1.3;`
        );
        h.innerHTML = col.label.replace('\n', '<br>') +
          (col.perVehicle
            ? '<br><span style="font-size:6.5px;opacity:0.65;font-weight:400;">(per veh)</span>'
            : '');
        wrap.appendChild(h);
      });
      return wrap;
    }

    // Row 1 — group labels (VROT_W + AXLE_W = INFO_W, same total)
    const grpRow = el('div', `display:flex;align-items:flex-end;`);
    grpRow.appendChild(el('div', `width:${INFO_W}px;flex-shrink:0;`));
    grpRow.appendChild(el('div', `width:${GG}px;flex-shrink:0;`));
    grpRow.appendChild(mkGrpLabel(vertW, '\u25b2\u2002Vertical Force Parameters', '#1e40af', '#dbeafe', '#bfdbfe'));
    grpRow.appendChild(el('div', `width:${GG}px;flex-shrink:0;`));
    grpRow.appendChild(mkGrpLabel(latW,  '\u2190\u2002Lateral Force Parameters',  '#5b21b6', '#ede9fe', '#c4b5fd'));
    stickyHdr.appendChild(grpRow);

    // Row 2 — column labels (spacer for rotated strip + "Axle" label)
    const colRow = el('div', `display:flex;align-items:flex-end;`);
    colRow.appendChild(el('div', `width:${VROT_W}px;flex-shrink:0;`));
    const axleHdrCell = el('div',
      `width:${AXLE_W}px;flex-shrink:0;font-size:9px;color:#9ca3af;font-weight:600;` +
      `padding:2px 6px 2px 2px;text-align:right;`
    );
    axleHdrCell.textContent = 'Axle';
    colRow.appendChild(axleHdrCell);
    colRow.appendChild(el('div', `width:${GG}px;flex-shrink:0;`));
    colRow.appendChild(mkColHdrs(VERT_COLS, '#1d4ed8', '#eff6ff', '#bfdbfe'));
    colRow.appendChild(el('div', `width:${GG}px;flex-shrink:0;`));
    colRow.appendChild(mkColHdrs(LAT_COLS,  '#6d28d9', '#f5f3ff', '#c4b5fd'));
    stickyHdr.appendChild(colRow);

    inner.appendChild(stickyHdr);

    // ── Vehicle blocks ────────────────────────────────────
    // Each vBlock is a flex ROW: [rotated sidebar | axle-number col | blocks area]
    vehicles.forEach(v => {
      const vVals = {};
      [...VERT_COLS, ...LAT_COLS].filter(c => c.perVehicle).forEach(c => {
        vVals[c.key] = c.getVehicleVal(v);
      });

      // Total pixel height of this vehicle's axle rows (blocks area height)
      const vTotalH = v.axles.length * BH + (v.axles.length - 1) * BG;

      const vBlock = el('div', `display:flex;margin-bottom:10px;`);

      // ── Rotated vehicle-info strip ────────────────────
      // Use transform:rotate(-90deg) instead of writing-mode to ensure
      // compatibility with html2canvas (used by the PDF export).
      const rotCol = el('div',
        `width:${VROT_W}px;flex-shrink:0;height:${vTotalH}px;` +
        `position:relative;overflow:hidden;` +
        `background:#f1f5f9;border-left:3px solid #94a3b8;border-radius:2px 0 0 2px;`
      );
      // The text element's natural size is vTotalH × VROT_W; after -90° rotation
      // it appears as VROT_W × vTotalH — perfectly filling the rotCol container.
      const rotText = el('div',
        `position:absolute;` +
        `width:${vTotalH}px;height:${VROT_W}px;` +
        `top:${(vTotalH - VROT_W) / 2}px;left:${(VROT_W - vTotalH) / 2}px;` +
        `transform:rotate(-90deg);transform-origin:50% 50%;` +
        `display:flex;align-items:center;justify-content:center;` +
        `font-size:8px;font-weight:700;color:#475569;letter-spacing:0.03em;` +
        `white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`
      );
      const vIdPart   = v.vehicleId && v.vehicleId.trim() ? `\u2002\u00b7\u2002${v.vehicleId.trim()}` : '';
      const vMassPart = v.mass_t ? `\u2002\u00b7\u2002${v.mass_t.toFixed(1)}\u202Ft` : '';
      rotText.textContent = `V${v.vPos}${vIdPart}${vMassPart}`;
      rotCol.appendChild(rotText);
      vBlock.appendChild(rotCol);

      // ── Axle number column ────────────────────────────
      const axleNumCol = el('div',
        `width:${AXLE_W}px;flex-shrink:0;display:flex;flex-direction:column;gap:${BG}px;`
      );
      v.axles.forEach(axle => {
        const lbl = el('div',
          `height:${BH}px;display:flex;align-items:center;justify-content:flex-end;` +
          `padding-right:6px;font-size:9px;color:#94a3b8;font-weight:600;flex-shrink:0;`
        );
        lbl.textContent = `A${axle.axleNum}`;
        axleNumCol.appendChild(lbl);
      });
      vBlock.appendChild(axleNumCol);

      // ── Axle data blocks ──────────────────────────────
      const blocksArea = el('div', `display:flex;flex-direction:column;gap:${BG}px;`);
      v.axles.forEach(axle => {
        const row = el('div', `display:flex;align-items:center;height:${BH}px;`);

        row.appendChild(mkDivider());

        const vg = el('div', `display:flex;gap:${BG}px;`);
        VERT_COLS.forEach(col => {
          const val = col.perVehicle ? vVals[col.key] : col.getAxleVal(axle);
          vg.appendChild(buildAxleBlock(val, col, v, axle, BW, BH));
        });
        row.appendChild(vg);

        row.appendChild(mkDivider());

        const lg = el('div', `display:flex;gap:${BG}px;`);
        LAT_COLS.forEach(col => {
          lg.appendChild(buildAxleBlock(col.getAxleVal(axle), col, v, axle, BW, BH));
        });
        row.appendChild(lg);

        blocksArea.appendChild(row);
      });
      vBlock.appendChild(blocksArea);

      inner.appendChild(vBlock);
    });

    scrollWrap.appendChild(inner);
    container.appendChild(scrollWrap);
    container.appendChild(buildLegend());
  }

  /**
   * Builds one coloured block for the train heatmap. No text is rendered
   * inside — hover tooltip carries the exact value and severity.
   */
  function buildAxleBlock(val, col, vehicle, axle, bw, bh) {
    const sev = val != null ? col.classify(val) : null;
    const bg  = sev != null ? CELL_BG[sev] : CELL_BG.noData;

    const block = el('div',
      `width:${bw}px;height:${bh}px;border-radius:4px;flex-shrink:0;` +
      `background:${bg};border:1px solid rgba(0,0,0,0.07);`
    );
    if (sev && sev !== SEVERITY.NOMINAL) {
      block.style.boxShadow = `0 0 0 1.5px ${LEGEND_BG[sev]}90`;
    }

    const colLabel = col.label.replace('\n', ' ');
    const sevPart  = sev && sev !== SEVERITY.NOMINAL ? `\n\u26a0 Severity: ${sev}` : '';
    const tipText  = val != null
      ? `V${vehicle.vPos} \u00b7 Axle ${axle.axleNum}\n${colLabel}: ${col.fmt(val)}${sevPart}`
      : `V${vehicle.vPos} \u00b7 Axle ${axle.axleNum}\n${colLabel}: no data`;
    attachTooltip(block, tipText);

    return block;
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
