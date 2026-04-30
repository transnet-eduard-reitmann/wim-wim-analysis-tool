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
   * Ch 29    = proximity sensor — Down direction
   * Ch 30    = proximity sensor — Up direction
   * Ch 31    = trigger input   — Down direction
   * Ch 32    = trigger input   — Up direction
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
      { bg: CH_BG.healthy, label: `Healthy (< ${ALARM_LIMITS.channelOffset.warningThreshold} V)` },
      { bg: CH_BG.warning, label: `Warning (${ALARM_LIMITS.channelOffset.warningThreshold}–${ALARM_LIMITS.channelOffset.faultThreshold} V)` },
      { bg: CH_BG.fault,   label: `Fault (≥ ${ALARM_LIMITS.channelOffset.faultThreshold} V)` },
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
    if (n === 29) return 'Proximity sensor — Down direction';
    if (n === 30) return 'Proximity sensor — Up direction';
    if (n === 31) return 'Trigger input — Down direction';
    if (n === 32) return 'Trigger input — Up direction';
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
      ? `Channel ${ch}${desc ? '\n' + desc : ''}\nOffset: ${data.value.toFixed(3)} V\nStatus: ${status.toUpperCase()}`
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
   * split into five visually distinct column groups:
   *   * Measurements         — Vehicle Mass (merged) · Bogie Load (merged) · Mass L (merged) · Mass R (merged)
   *   * Vertical Force Alarms — Dyn Load L/R (kN, per axle, alarm-coloured)
   *   * Skew Loading          — Side-to-Side Skew · End-to-End Skew (merged vehicle blocks, alarm-coloured)
   *   * Skewness [B]          — raw bogie skewness from CSV (merged bogie blocks, teal/informational)
   *   * Lateral Force Alarms  — Lat Force L/R · Gauge Spreading (per axle, alarm-coloured)
   *
   * Skew loading values are calculated from mass left/right and bogie masses.
   * Dynamic load kN is a unit conversion only. All other values are raw CSV.
   *
   * Hover tooltips carry exact values and severity on all blocks.
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

    // ── Alarm column definitions ──────────────────────────────────────────────
    const VERT_DYN_COLS = [
      { key: 'dynL', label: 'Left',  getAxleVal: a => a.dynamicLoadLeft_kN,  classify: v => classifyDynLoad(v, impactLimits), fmt: v => v.toFixed(1) + ' kN', perVehicle: false },
      { key: 'dynR', label: 'Right', getAxleVal: a => a.dynamicLoadRight_kN, classify: v => classifyDynLoad(v, impactLimits), fmt: v => v.toFixed(1) + ' kN', perVehicle: false },
    ];
    const LAT_COLS = [
      { key: 'latL',  label: 'Lateral\nForce L',  getAxleVal: a => a.lateralForceLeft_t,    classify: classifyLateral, fmt: v => v.toFixed(2) + ' t', perVehicle: false },
      { key: 'latR',  label: 'Lateral\nForce R',  getAxleVal: a => a.lateralForceRight_t,   classify: classifyLateral, fmt: v => v.toFixed(2) + ' t', perVehicle: false },
      { key: 'gauge', label: 'Gauge\nSpreading',  getAxleVal: a => a.gaugeSpreadingForce_t, classify: classifyGauge,   fmt: v => v.toFixed(2) + ' t', perVehicle: false },
    ];

    // Layout constants (px)
    const BW = 38, BH = 28, BG = 3, GG = 16;
    const VROT_W     = 18;
    const AXLE_W     = 46;
    const INFO_W     = VROT_W + AXLE_W;                                                             // 64
    const BOGIE_W    = BW;                                                                           // 38 — merged bogie column
    const measGroupW = 4 * BW + 3 * BG;                                                             // 161 — total mass · bogie · mass L · mass R
    const dynW       = VERT_DYN_COLS.length * (BW + BG) - BG;                                       // 79 — dyn load L/R
    const skewLoadW  = BW + GG + BW;                                                                 // 92 — S-S skew | sep | E-E skew (merged vehicle blocks)
    const skewnessW  = 52;                                                                           // wider — Skewness bogie column
    const latW       = LAT_COLS.length      * (BW + BG) - BG;                                       // 120
    const totalW     = INFO_W + GG + measGroupW + GG + dynW + GG + skewLoadW + GG + skewnessW + GG + latW;  // 634

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

    function mkColHdrs(cols, fg, bg, bdr, unitNote) {
      const wrap = el('div', `display:flex;gap:${BG}px;flex-shrink:0;`);
      cols.forEach(col => {
        const h = el('div',
          `width:${BW}px;flex-shrink:0;text-align:center;font-size:7.5px;font-weight:700;` +
          `color:${fg};line-height:1.3;background:${bg};border-radius:2px 2px 0 0;padding:2px 1px 4px;`
        );
        let note = '';
        if (col.perVehicle) {
          note = '<br><span style="font-size:6.5px;opacity:0.65;font-weight:400;">(per veh)</span>';
        } else if (unitNote) {
          note = `<br><span style="font-size:6.5px;opacity:0.65;font-weight:400;">(${unitNote})</span>`;
        }
        h.innerHTML = col.label.replace('\n', '<br>') + note;
        wrap.appendChild(h);
      });
      return wrap;
    }

    function mkSingleColHdr(htmlContent, fg, bg, w) {
      const width = w || BW;
      const h = el('div',
        `width:${width}px;flex-shrink:0;text-align:center;font-size:7.5px;font-weight:700;` +
        `color:${fg};line-height:1.3;background:${bg};border-radius:2px 2px 0 0;padding:2px 1px 4px;`
      );
      h.innerHTML = htmlContent;
      return h;
    }

    // Row 1 — group labels
    const grpRow = el('div', `display:flex;align-items:flex-end;`);
    grpRow.appendChild(el('div', `width:${INFO_W}px;flex-shrink:0;`));
    grpRow.appendChild(el('div', `width:${GG}px;flex-shrink:0;`));
    grpRow.appendChild(mkGrpLabel(measGroupW, 'Measurements',         '#0e7490', '#cffafe', '#a5f3fc'));
    grpRow.appendChild(el('div', `width:${GG}px;flex-shrink:0;`));
    grpRow.appendChild(mkGrpLabel(dynW,       'Dynamic Load',          '#1e40af', '#dbeafe', '#bfdbfe'));
    grpRow.appendChild(el('div', `width:${GG}px;flex-shrink:0;`));
    grpRow.appendChild(mkGrpLabel(skewLoadW,  'Skew Loading',          '#1e40af', '#dbeafe', '#bfdbfe'));
    grpRow.appendChild(el('div', `width:${GG}px;flex-shrink:0;`));
    grpRow.appendChild(mkGrpLabel(skewnessW,  'Skewness',              '#0e7490', '#cffafe', '#a5f3fc'));
    grpRow.appendChild(el('div', `width:${GG}px;flex-shrink:0;`));
    grpRow.appendChild(mkGrpLabel(latW,       'Lateral Force Alarms',  '#5b21b6', '#ede9fe', '#c4b5fd'));
    stickyHdr.appendChild(grpRow);

    // Row 2 — column labels
    const colRow = el('div', `display:flex;align-items:flex-end;`);
    colRow.appendChild(el('div', `width:${VROT_W}px;flex-shrink:0;`));
    const axleHdrCell = el('div',
      `width:${AXLE_W}px;flex-shrink:0;font-size:9px;color:#9ca3af;font-weight:600;` +
      `padding:2px 6px 2px 2px;text-align:right;`
    );
    axleHdrCell.textContent = 'Axle';
    colRow.appendChild(axleHdrCell);
    colRow.appendChild(el('div', `width:${GG}px;flex-shrink:0;`));

    // Measurement group — 4 merged-block column headers
    function mkMeasHdr(html) {
      const h = el('div',
        `width:${BW}px;flex-shrink:0;text-align:center;font-size:7.5px;font-weight:700;` +
        `color:#0e7490;line-height:1.3;background:#ecfeff;border-radius:2px 2px 0 0;padding:2px 1px 4px;`
      );
      h.innerHTML = html;
      return h;
    }
    const sub = s => `<br><span style="font-size:6.5px;opacity:0.65;font-weight:400;">${s}</span>`;
    const measHdrWrap = el('div', `display:flex;gap:${BG}px;flex-shrink:0;`);
    measHdrWrap.appendChild(mkMeasHdr(`Vehicle<br>Mass`));
    measHdrWrap.appendChild(mkMeasHdr(`Bogie<br>Load`));
    measHdrWrap.appendChild(mkMeasHdr(`Mass<br>Left`));
    measHdrWrap.appendChild(mkMeasHdr(`Mass<br>Right`));;
    colRow.appendChild(measHdrWrap);
    colRow.appendChild(el('div', `width:${GG}px;flex-shrink:0;`));

    // Vertical alarms — dynamic load columns only
    colRow.appendChild(mkColHdrs(VERT_DYN_COLS, '#1d4ed8', '#eff6ff', '#bfdbfe'));
    colRow.appendChild(el('div', `width:${GG}px;flex-shrink:0;`));

    // Skew Loading — S-S skew | thin-line separator | E-E skew (vehicle-height merged blocks)
    colRow.appendChild(mkSingleColHdr(`Side-to-<br>Side`, '#1d4ed8', '#eff6ff'));
    const skewHdrSep = el('div', `width:${GG}px;flex-shrink:0;display:flex;align-items:center;justify-content:center;`);
    skewHdrSep.appendChild(el('div', `width:1px;background:#bfdbfe;align-self:stretch;margin:2px 0;`));
    colRow.appendChild(skewHdrSep);
    colRow.appendChild(mkSingleColHdr(`End-to-<br>End`, '#1d4ed8', '#eff6ff'));
    colRow.appendChild(el('div', `width:${GG}px;flex-shrink:0;`));

    // Skewness [B] — teal, bogie-height merged blocks
    colRow.appendChild(mkSingleColHdr(`Bogie`, '#0e7490', '#ecfeff', skewnessW));
    colRow.appendChild(el('div', `width:${GG}px;flex-shrink:0;`));

    colRow.appendChild(mkColHdrs(LAT_COLS, '#6d28d9', '#f5f3ff', '#c4b5fd'));
    stickyHdr.appendChild(colRow);

    inner.appendChild(stickyHdr);

    // ── Vehicle blocks ────────────────────────────────────
    vehicles.forEach(v => {
      const vTotalH = v.axles.length * BH + (v.axles.length - 1) * BG;
      const vBlock  = el('div', `display:flex;margin-bottom:10px;`);

      // ── Rotated vehicle-info strip ────────────────────
      const rotCol = el('div',
        `width:${VROT_W}px;flex-shrink:0;height:${vTotalH}px;` +
        `position:relative;overflow:hidden;` +
        `background:#f1f5f9;border-left:3px solid #94a3b8;border-radius:2px 0 0 2px;`
      );
      const rotText = el('div',
        `position:absolute;` +
        `width:${vTotalH}px;height:${VROT_W}px;` +
        `top:${(vTotalH - VROT_W) / 2}px;left:${(VROT_W - vTotalH) / 2}px;` +
        `transform:rotate(-90deg);transform-origin:50% 50%;` +
        `display:flex;align-items:center;justify-content:center;` +
        `font-size:8px;font-weight:700;color:#475569;letter-spacing:0.03em;` +
        `white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`
      );
      const vIdPart  = v.vehicleId && v.vehicleId.trim() ? ` · ${v.vehicleId.trim()}` : '';
      const vSpdPart = v.speed_kmh != null ? ` · ${v.speed_kmh.toFixed(0)} km/h` : '';
      rotText.textContent = `V${v.vPos}${vIdPart}${vSpdPart}`;
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

      // ── Gap between sidebar and measurement group ─────
      vBlock.appendChild(el('div', `width:${GG}px;flex-shrink:0;`));

      // ── Vehicle total mass column ─────────────────────
      vBlock.appendChild(buildVehicleMassCell(v.mass_t, 'Total', v, vTotalH, BW));
      vBlock.appendChild(el('div', `width:${BG}px;flex-shrink:0;`));

      // ── Bogie merged column ───────────────────────────
      const bogieColDiv = el('div', `width:${BOGIE_W}px;flex-shrink:0;display:flex;flex-direction:column;`);
      const bogieGroups = computeBogieGroups(v);
      if (bogieGroups.length > 0) {
        bogieGroups.forEach((bg, i) => {
          const n     = bg.endAxleIdx - bg.startAxleIdx + 1;
          const cellH = n * BH + (n - 1) * BG;
          const bgCell = buildBogieCell(bg.mass_t, bg.bogieNum, v, cellH, BOGIE_W);
          if (i < bogieGroups.length - 1) bgCell.style.marginBottom = BG + 'px';
          bogieColDiv.appendChild(bgCell);
        });
      } else {
        // No bogie data — placeholder spanning all axles
        bogieColDiv.appendChild(el('div',
          `width:${BOGIE_W}px;height:${vTotalH}px;border-radius:4px;` +
          `background:#f3f4f6;border:1px solid rgba(0,0,0,0.07);`
        ));
      }
      vBlock.appendChild(bogieColDiv);
      vBlock.appendChild(el('div', `width:${BG}px;flex-shrink:0;`));

      // ── Vehicle mass left/right columns ──────────────
      vBlock.appendChild(buildVehicleMassCell(v.massLeft_t,  'Left',  v, vTotalH, BW));
      vBlock.appendChild(el('div', `width:${BG}px;flex-shrink:0;`));
      vBlock.appendChild(buildVehicleMassCell(v.massRight_t, 'Right', v, vTotalH, BW));
      vBlock.appendChild(el('div', `width:${GG}px;flex-shrink:0;`));

      // ── Per-axle dynamic load blocks ──────────────────
      const dynBlocksArea = el('div', `display:flex;flex-direction:column;gap:${BG}px;`);
      v.axles.forEach(axle => {
        const row = el('div', `display:flex;align-items:center;height:${BH}px;`);
        const dynG = el('div', `display:flex;gap:${BG}px;`);
        VERT_DYN_COLS.forEach(col => {
          dynG.appendChild(buildAxleBlock(col.getAxleVal(axle), col, v, axle, BW, BH));
        });
        row.appendChild(dynG);
        dynBlocksArea.appendChild(row);
      });
      vBlock.appendChild(dynBlocksArea);

      vBlock.appendChild(el('div', `width:${GG}px;flex-shrink:0;`));

      // ── Skew Loading — S-S and E-E vehicle-height merged cells ──
      vBlock.appendChild(buildVehicleSkewCell(v.sideToSideSkew, '⇔', v, vTotalH, BW));
      const skewSep = el('div', `width:${GG}px;flex-shrink:0;display:flex;align-items:stretch;justify-content:center;`);
      skewSep.appendChild(el('div', `width:1px;background:#bfdbfe;margin:4px 0;`));
      vBlock.appendChild(skewSep);
      vBlock.appendChild(buildVehicleSkewCell(v.endToEndSkew, '↕', v, vTotalH, BW));

      vBlock.appendChild(el('div', `width:${GG}px;flex-shrink:0;`));

      // ── Skewness [B] — bogie-height merged cells ───────────────
      const skewnessColDiv = el('div', `width:${skewnessW}px;flex-shrink:0;display:flex;flex-direction:column;`);
      if (bogieGroups.length > 0) {
        bogieGroups.forEach((bg, i) => {
          const n     = bg.endAxleIdx - bg.startAxleIdx + 1;
          const cellH = n * BH + (n - 1) * BG;
          const sk    = v.skewnessBogie.find(s => s.bogieNum === bg.bogieNum);
          const skCell = buildSkewnessCell(sk ? sk.value : null, bg.bogieNum, v, cellH, skewnessW);
          if (i < bogieGroups.length - 1) skCell.style.marginBottom = BG + 'px';
          skewnessColDiv.appendChild(skCell);
        });
      } else {
        skewnessColDiv.appendChild(el('div',
          `width:${skewnessW}px;height:${vTotalH}px;border-radius:4px;` +
          `background:#f3f4f6;border:1px solid rgba(0,0,0,0.07);`
        ));
      }
      vBlock.appendChild(skewnessColDiv);

      vBlock.appendChild(el('div', `width:${GG}px;flex-shrink:0;`));

      // ── Per-axle lateral blocks ───────────────────────
      const latBlocksArea = el('div', `display:flex;flex-direction:column;gap:${BG}px;`);
      v.axles.forEach(axle => {
        const row = el('div', `display:flex;align-items:center;height:${BH}px;`);
        const lg = el('div', `display:flex;gap:${BG}px;`);
        LAT_COLS.forEach(col => {
          lg.appendChild(buildAxleBlock(col.getAxleVal(axle), col, v, axle, BW, BH));
        });
        row.appendChild(lg);
        latBlocksArea.appendChild(row);
      });
      vBlock.appendChild(latBlocksArea);

      inner.appendChild(vBlock);
    });

    scrollWrap.appendChild(inner);
    container.appendChild(scrollWrap);
    container.appendChild(buildLegend());
  }

  // Returns bogie groups with axle-index ranges, assuming equal axle distribution.
  function computeBogieGroups(vehicle) {
    if (!vehicle.bogieMasses || vehicle.bogieMasses.length === 0) return [];
    const numBogies     = vehicle.bogieMasses.length;
    const numAxles      = vehicle.axles.length;
    const axlesPerBogie = Math.round(numAxles / numBogies);
    return vehicle.bogieMasses.map((bm, i) => ({
      bogieNum:     bm.bogieNum,
      mass_t:       bm.mass_t,
      startAxleIdx: i * axlesPerBogie,
      endAxleIdx:   Math.min((i + 1) * axlesPerBogie, numAxles) - 1,
    }));
  }

  // Merged bogie cell — spans multiple axle rows in height.
  function buildBogieCell(mass_t, bogieNum, vehicle, cellH, cellW) {
    const hasMass = mass_t != null && !isNaN(mass_t);
    const cell    = el('div',
      `width:${cellW}px;height:${cellH}px;border-radius:4px;flex-shrink:0;` +
      `background:${hasMass ? '#ecfeff' : '#f3f4f6'};border:1px solid rgba(0,0,0,0.07);` +
      `display:flex;flex-direction:column;align-items:center;justify-content:center;` +
      `font-size:7.5px;font-weight:700;color:#0e7490;line-height:1.4;overflow:hidden;`
    );
    if (hasMass) {
      if (cellH >= 40) {
        const lbl = el('div', `font-size:6.5px;opacity:0.7;font-weight:400;`);
        lbl.textContent = `B${bogieNum}`;
        cell.appendChild(lbl);
      }
      const valDiv = el('div', ``);
      valDiv.textContent = mass_t.toFixed(1);
      cell.appendChild(valDiv);
      attachTooltip(cell, `V${vehicle.vPos} · Bogie ${bogieNum}\nBogie Load: ${mass_t.toFixed(2)} t`);
    }
    return cell;
  }

  // Vehicle-level merged cell (total mass, mass left, mass right) — spans full vehicle height.
  function buildVehicleMassCell(mass_t, label, vehicle, cellH, cellW) {
    const hasMass = mass_t != null && !isNaN(mass_t);
    const cell    = el('div',
      `width:${cellW}px;height:${cellH}px;border-radius:4px;flex-shrink:0;` +
      `background:${hasMass ? '#ecfeff' : '#f3f4f6'};border:1px solid rgba(0,0,0,0.07);` +
      `display:flex;flex-direction:column;align-items:center;justify-content:center;` +
      `font-size:7.5px;font-weight:700;color:#0e7490;line-height:1.4;overflow:hidden;`
    );
    if (hasMass) {
      if (cellH >= 40) {
        const lbl = el('div', `font-size:6.5px;opacity:0.7;font-weight:400;`);
        lbl.textContent = label;
        cell.appendChild(lbl);
      }
      const valDiv = el('div', ``);
      valDiv.textContent = mass_t.toFixed(1);
      cell.appendChild(valDiv);
      const tipLabel = label === 'Total' ? 'Vehicle Mass (Total)' : `Vehicle Mass (${label} side)`;
      attachTooltip(cell, `V${vehicle.vPos} · ${tipLabel}\n${mass_t.toFixed(2)} t`);
    }
    return cell;
  }

  // Vehicle-level skew cell — spans full vehicle height, alarm-coloured.
  function buildVehicleSkewCell(skewFrac, label, vehicle, cellH, cellW) {
    const pct  = skewFrac != null && !isNaN(skewFrac) ? skewFrac * 100 : null;
    const sev  = pct != null ? classifySkew(pct) : null;
    const bg   = sev != null ? CELL_BG[sev]   : CELL_BG.noData;
    const fg   = sev != null ? CELL_TEXT[sev]  : '#9ca3af';
    const cell = el('div',
      `width:${cellW}px;height:${cellH}px;border-radius:4px;flex-shrink:0;` +
      `background:${bg};border:1px solid rgba(0,0,0,0.07);` +
      `display:flex;flex-direction:column;align-items:center;justify-content:center;` +
      `font-size:7.5px;font-weight:700;color:${fg};line-height:1.4;overflow:hidden;`
    );
    if (sev && sev !== SEVERITY.NOMINAL) {
      cell.style.boxShadow = `0 0 0 1.5px ${LEGEND_BG[sev]}90`;
    }
    if (cellH >= 40) {
      const lbl = el('div', `font-size:6.5px;opacity:0.7;font-weight:400;`);
      lbl.textContent = label;
      cell.appendChild(lbl);
    }
    const tipLabel = label === '⇔' ? 'Side-to-Side Skew' : 'End-to-End Skew';
    if (pct != null) {
      const valDiv = el('div', ``);
      valDiv.textContent = pct.toFixed(1) + '%';
      cell.appendChild(valDiv);
      const sevPart = sev && sev !== SEVERITY.NOMINAL ? `\n⚠ Severity: ${sev}` : '';
      attachTooltip(cell, `V${vehicle.vPos} · ${tipLabel}\n${pct.toFixed(2)}%${sevPart}`);
    } else {
      attachTooltip(cell, `V${vehicle.vPos} · ${tipLabel}: no data`);
    }
    return cell;
  }

  // Bogie-level skewness cell — teal, spans bogie axle rows in height.
  function buildSkewnessCell(value, bogieNum, vehicle, cellH, cellW) {
    const hasVal = value != null && !isNaN(value);
    const cell   = el('div',
      `width:${cellW}px;height:${cellH}px;border-radius:4px;flex-shrink:0;` +
      `background:${hasVal ? '#ecfeff' : '#f3f4f6'};border:1px solid rgba(0,0,0,0.07);` +
      `display:flex;flex-direction:column;align-items:center;justify-content:center;` +
      `font-size:7.5px;font-weight:700;color:#0e7490;line-height:1.4;overflow:hidden;`
    );
    if (hasVal) {
      if (cellH >= 40) {
        const lbl = el('div', `font-size:6.5px;opacity:0.7;font-weight:400;`);
        lbl.textContent = `B${bogieNum}`;
        cell.appendChild(lbl);
      }
      const valDiv = el('div', ``);
      valDiv.textContent = value.toFixed(2);
      cell.appendChild(valDiv);
      attachTooltip(cell, `V${vehicle.vPos} · Bogie ${bogieNum}\nSkewness: ${value.toFixed(3)} t`);
    }
    return cell;
  }

  // Per-axle measurement cell — shows value as text, cyan styling, no severity colour.
  function buildMeasBlock(val, col, vehicle, axle, bw, bh) {
    const hasData = val != null && !isNaN(val);
    const block   = el('div',
      `width:${bw}px;height:${bh}px;border-radius:4px;flex-shrink:0;` +
      `background:${hasData ? '#ecfeff' : '#f3f4f6'};border:1px solid rgba(0,0,0,0.07);` +
      `display:flex;align-items:center;justify-content:center;` +
      `font-size:7.5px;font-weight:600;color:#0e7490;overflow:hidden;`
    );
    if (hasData) block.textContent = col.fmt(val);
    const colLabel = col.label.replace('\n', ' ');
    const tipText  = hasData
      ? `V${vehicle.vPos} · Axle ${axle.axleNum}\n${colLabel}: ${col.fmt(val)} ${col.unit}`
      : `V${vehicle.vPos} · Axle ${axle.axleNum}\n${colLabel}: no data`;
    attachTooltip(block, tipText);
    return block;
  }

  /**
   * Builds one coloured alarm block for the train heatmap. No text is rendered
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
    const sevPart  = sev && sev !== SEVERITY.NOMINAL ? `\n⚠ Severity: ${sev}` : '';
    const tipText  = val != null
      ? `V${vehicle.vPos} · Axle ${axle.axleNum}\n${colLabel}: ${col.fmt(val)}${sevPart}`
      : `V${vehicle.vPos} · Axle ${axle.axleNum}\n${colLabel}: no data`;
    attachTooltip(block, tipText);

    return block;
  }

  // ── Shared helpers ─────────────────────────────────────────────────────────

  function buildLegend() {
    const legend = el('div', 'display:flex;flex-wrap:wrap;gap:14px;margin-top:10px;');
    [
      { sev: SEVERITY.NOMINAL, label: 'Nominal (within alarm limits)' },
      { sev: SEVERITY.TYPE1,   label: 'Type 1 — Continue to depot' },
      { sev: SEVERITY.TYPE2,   label: 'Type 2 — Continue to station' },
      { sev: SEVERITY.TYPE3,   label: 'Type 3 — Stop train' },
    ].forEach(item => {
      const e = el('div', 'display:flex;align-items:center;gap:6px;font-size:11px;color:#6b7280;');
      e.innerHTML = `<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${LEGEND_BG[item.sev]}"></span>${item.label}`;
      legend.appendChild(e);
    });
    // Measurement colour note
    const measNote = el('div', 'display:flex;align-items:center;gap:6px;font-size:11px;color:#6b7280;');
    measNote.innerHTML = '<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#0e9488;"></span>Cyan — measured value (informational)';
    legend.appendChild(measNote);
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
