/**
 * app.js — Main application: file upload, UI state, report rendering.
 *
 * Depends on: parser.js, analyser.js, visualiser.js, pdf-export.js,
 *             config/alarm-limits.js
 */

(function () {

  // ── State ──────────────────────────────────────────────────────────────────

  let trainData       = null;
  let analysisResult  = null;
  let currentRailType = RAIL_TYPE.S_LINE;
  let limitOverrides  = {};   // partial ALARM_LIMITS object — built from the limits editor

  // ── Init ───────────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', () => {
    setupDropZone();
    setupFileInput();
    setupRailTypeSelector();
    setupLimitsEditor();
    setupDownloadButton();
  });

  // ── File upload ────────────────────────────────────────────────────────────

  function setupDropZone() {
    const zone = document.getElementById('drop-zone');
    if (!zone) return;
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.csv'));
      if (files.length > 0) handleFile(files[0]);
    });
  }

  function setupFileInput() {
    const input = document.getElementById('file-input');
    if (!input) return;
    input.addEventListener('change', () => {
      if (input.files.length > 0) handleFile(input.files[0]);
    });
  }

  function handleFile(file) {
    setStatus('loading', `Reading ${file.name}…`);
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const text = e.target.result;

        // Detect file type from content, not filename
        const fileType = Parser.detectFileType(text);
        if (fileType === 'alarm') {
          setStatus('error', 'This is an alarm file. Please upload a condition data file for analysis.');
          return;
        }
        if (fileType === 'unknown') {
          setStatus('error',
            'Unrecognised file format. This tool only accepts ITCMS WIM condition CSV exports. ' +
            'If this is an alarm management report (e.g. exported from the alarm overview screen), ' +
            'it cannot be analysed here — please upload a condition data file instead.');
          return;
        }

        trainData = Parser.parseConditionFile(text, file.name);

        // Surface any data-quality warnings from the parser
        renderDataWarnings(trainData.warnings || []);

        runAnalysis();
      } catch (err) {
        setStatus('error', `Failed to parse file: ${err.message}`);
        console.error(err);
      }
    };
    reader.readAsText(file);
  }

  function setupRailTypeSelector() {
    const select = document.getElementById('rail-type-select');
    if (!select) return;
    select.addEventListener('change', () => {
      currentRailType = select.value;
      if (trainData) runAnalysis();
    });
  }

  // ── Alarm limits editor ────────────────────────────────────────────────────

  function setupLimitsEditor() {
    const toggle = document.getElementById('limits-toggle');
    const panel  = document.getElementById('limits-panel');
    if (toggle && panel) {
      toggle.addEventListener('click', () => {
        panel.classList.toggle('hidden');
        toggle.querySelector('.toggle-chevron').textContent = panel.classList.contains('hidden') ? '▶' : '▼';
      });
    }

    // Wire up every limit input to rebuild overrides and re-run analysis
    const inputs = document.querySelectorAll('[data-limit]');
    inputs.forEach(input => {
      input.addEventListener('change', () => {
        buildLimitOverrides();
        if (trainData) runAnalysis();
      });
    });
  }

  /**
   * Reads all [data-limit] inputs and builds the limitOverrides object that is
   * passed to Analyser.analyse(). Only values that differ from the hard-coded
   * defaults are included, but deepMerge in analyser.js handles the full merge.
   */
  function buildLimitOverrides() {
    const inputs = document.querySelectorAll('[data-limit]');
    limitOverrides = {};
    inputs.forEach(input => {
      const path = input.getAttribute('data-limit').split('.');
      const val  = parseFloat(input.value);
      if (isNaN(val)) return;
      let obj = limitOverrides;
      for (let i = 0; i < path.length - 1; i++) {
        if (!obj[path[i]]) obj[path[i]] = {};
        obj = obj[path[i]];
      }
      obj[path[path.length - 1]] = val;
    });
  }

  /** Reset all limit inputs to the ALARM_LIMITS defaults */
  function resetLimits() {
    document.querySelectorAll('[data-limit]').forEach(input => {
      const path = input.getAttribute('data-limit').split('.');
      let val = ALARM_LIMITS;
      for (const key of path) val = val[key];
      input.value = val;
    });
    limitOverrides = {};
    if (trainData) runAnalysis();
  }

  // ── Analysis and report ────────────────────────────────────────────────────

  function runAnalysis() {
    if (!trainData) return;
    try {
      const overrides = Object.keys(limitOverrides).length > 0 ? limitOverrides : null;
      analysisResult = Analyser.analyse(trainData, currentRailType, overrides);
      renderReport();
      setStatus('ready', '');
    } catch (err) {
      setStatus('error', `Analysis failed: ${err.message}`);
      console.error(err);
    }
  }

  function renderReport() {
    if (!analysisResult || !trainData) return;

    showSection('report-section');
    renderMeta();
    renderVerdict();
    renderDataAnalysis();
    renderChannelSummaryCards();
    Visualiser.renderChannelLayout(analysisResult.channelHealth, 'channel-layout');
    Visualiser.renderMultiParamHeatmap(trainData, analysisResult, currentRailType, 'heatmap-container');
    renderExceedanceTable();
    renderConclusions();
    renderLimitsSummary();
  }

  function renderMeta() {
    const { meta } = trainData;
    setText('meta-component', meta.component);
    setText('meta-train',     meta.trainId);
    setText('meta-time',      meta.time);
    setText('meta-direction', meta.direction);
    setText('meta-rail-type', currentRailType === RAIL_TYPE.S_LINE ? 'S-line (60 kg/m)' : 'N1-line (57 kg/m)');
    setText('meta-vehicles',  trainData.vehicles.length + ' vehicles');
    const totalAxles = trainData.vehicles.reduce((sum, v) => sum + v.axles.length, 0);
    setText('meta-axles', totalAxles + ' axles');
    setText('meta-total-mass', trainData.trainMass.total != null ? trainData.trainMass.total.toFixed(1) + ' t' : '—');
  }

  function renderVerdict() {
    const { verdict, confidence, reasons } = analysisResult.verdict;
    const banner = document.getElementById('verdict-banner');
    const verdictText = document.getElementById('verdict-text');
    const confidenceEl = document.getElementById('verdict-confidence');
    const reasonsList = document.getElementById('verdict-reasons');

    if (!banner || !verdictText) return;

    verdictText.textContent = verdict;
    if (confidenceEl) confidenceEl.textContent = confidence !== 'N/A' ? `Confidence: ${confidence}` : '';
    banner.className = 'rounded-xl p-5 border-2 ' + verdictBannerClass(verdict);
    if (reasonsList) reasonsList.innerHTML = reasons.map(r => `<li>${r}</li>`).join('');
  }

  function verdictBannerClass(verdict) {
    if (verdict.includes('TRUE'))  return 'bg-red-50 border-red-400 text-red-800';
    if (verdict.includes('FALSE')) return 'bg-green-50 border-green-400 text-green-800';
    if (verdict === 'NO ALARM')    return 'bg-gray-50 border-gray-300 text-gray-700';
    return 'bg-amber-50 border-amber-400 text-amber-800';
  }

  // ── Data Analysis Overview ────────────────────────────────────────────────────────

  function renderDataAnalysis() {
    const alarmsEl = document.getElementById('daa-alarms');
    const statsEl  = document.getElementById('daa-stats');
    if (!alarmsEl || !statsEl || !analysisResult || !trainData) return;

    const { stats } = analysisResult;
    const limits      = analysisResult.effectiveLimits;
    const impactLimits = limits.wheelImpact[currentRailType];

    // ── Alarm type summary chips ───────────────────────────────────────────
    const allExceedances = analysisResult.vehicleResults.flatMap(v => v.exceedances);
    const paramCounts = {};
    for (const e of allExceedances) {
      paramCounts[e.parameter] = (paramCounts[e.parameter] || 0) + 1;
    }
    const paramBadges = Object.entries(paramCounts)
      .map(([p, n]) =>
        `<span class="inline-flex items-center gap-0.5 text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">${p} <span class="font-semibold">${n}</span></span>`
      ).join('');

    alarmsEl.innerHTML = `
      <div class="flex flex-wrap items-center gap-1.5">
        <span class="text-xs font-medium text-gray-500 mr-0.5">Alarms:</span>
        <span class="text-xs px-2 py-0.5 rounded-full border font-semibold bg-gray-100 text-gray-700 border-gray-300">${stats.totalExceedances} total</span>
        <span class="text-xs px-2 py-0.5 rounded-full border font-semibold bg-amber-50 text-amber-700 border-amber-300">${stats.type1Count} Type 1</span>
        <span class="text-xs px-2 py-0.5 rounded-full border font-semibold bg-orange-50 text-orange-600 border-orange-300">${stats.type2Count} Type 2</span>
        <span class="text-xs px-2 py-0.5 rounded-full border font-semibold bg-red-50 text-red-600 border-red-300">${stats.type3Count} Type 3</span>
        ${allExceedances.length > 0
          ? `<span class="text-gray-300 mx-0.5">│</span>${paramBadges}`
          : `<span class="text-xs text-green-600 font-medium ml-1">✔ No alarms detected</span>`}
      </div>`;

    // ── Per-parameter stats table ────────────────────────────────────────────
    const paramDefs = [
      {
        label: 'Vehicle Mass', unit: 't',
        values: trainData.vehicles.map(v => v.mass_t).filter(x => x != null && !isNaN(x)),
        thresholds: [],
      },
      {
        label: 'Train Speed', unit: 'km/h',
        values: trainData.vehicles.map(v => v.speed_kmh).filter(x => x != null && !isNaN(x) && x > 0),
        thresholds: [],
      },
      {
        label: 'Dyn. Load', unit: 'kN',
        values: trainData.vehicles.flatMap(v => v.axles.flatMap(a => [a.dynamicLoadLeft_kN, a.dynamicLoadRight_kN])).filter(x => x != null && !isNaN(x)),
        thresholds: [impactLimits.type2, impactLimits.type3],
      },
      {
        label: 'Bogie Skew', unit: 't',
        values: trainData.vehicles.flatMap(v => v.skewnessBogie.map(b => b.value)).filter(x => x != null && !isNaN(x)),
        thresholds: [],
      },
      {
        label: 'Lat. Force L', unit: 't',
        values: trainData.vehicles.flatMap(v => v.axles.map(a => a.lateralForceLeft_t)).filter(x => x != null && !isNaN(x)),
        thresholds: [limits.lateralForce.type1Min, limits.lateralForce.type2Min, limits.lateralForce.type3Force],
      },
      {
        label: 'Lat. Force R', unit: 't',
        values: trainData.vehicles.flatMap(v => v.axles.map(a => a.lateralForceRight_t)).filter(x => x != null && !isNaN(x)),
        thresholds: [limits.lateralForce.type1Min, limits.lateralForce.type2Min, limits.lateralForce.type3Force],
      },
      {
        label: 'S-S Skew', unit: '%',
        values: trainData.vehicles
          .map(v => v.sideToSideSkew != null ? v.sideToSideSkew * 100 : null)
          .filter(x => x != null && !isNaN(x)),
        thresholds: [limits.skewLoading.type2],
      },
      {
        label: 'E-E Skew', unit: '%',
        values: trainData.vehicles
          .map(v => v.endToEndSkew != null ? v.endToEndSkew * 100 : null)
          .filter(x => x != null && !isNaN(x)),
        thresholds: [limits.skewLoading.type2],
      },
    ].filter(p => p.values.length > 1);

    if (paramDefs.length === 0) {
      statsEl.innerHTML = '<p class="text-xs text-gray-400 italic">No measurement data available.</p>';
      return;
    }

    const rows = paramDefs.map(p => {
      const sorted = [...p.values].sort((a, b) => a - b);
      const n   = sorted.length;
      const min = sorted[0];
      const max = sorted[n - 1];
      const mean   = sorted.reduce((s, v) => s + v, 0) / n;
      const median = statPct(sorted, 0.50);
      const q1     = statPct(sorted, 0.25);
      const q3     = statPct(sorted, 0.75);

      const excCount  = p.thresholds.length > 0 ? sorted.filter(v => v >= p.thresholds[0]).length : 0;
      const sev2Count = p.thresholds.length > 1 ? sorted.filter(v => v >= p.thresholds[1]).length : 0;
      const excBadge  = excCount > 0
        ? `<span class="ml-1 font-semibold ${sev2Count > 0 ? 'text-orange-500' : 'text-amber-500'}">↑${excCount}</span>`
        : '';

      return `
        <tr class="border-b border-gray-100">
          <td class="py-0.5 pr-2 text-gray-700 font-medium whitespace-nowrap">${p.label} <span class="text-gray-400 font-normal">${p.unit}</span>${excBadge}</td>
          <td class="py-0.5 px-1.5 text-right font-mono text-gray-500">${min.toFixed(1)}</td>
          <td class="py-0.5 px-1.5 text-right font-mono text-gray-400">${q1.toFixed(1)}</td>
          <td class="py-0.5 px-1.5 text-right font-mono text-gray-600">${mean.toFixed(1)}</td>
          <td class="py-0.5 px-1.5 text-right font-mono text-gray-800 font-semibold">${median.toFixed(1)}</td>
          <td class="py-0.5 px-1.5 text-right font-mono text-gray-400">${q3.toFixed(1)}</td>
          <td class="py-0.5 px-1.5 text-right font-mono text-gray-500">${max.toFixed(1)}</td>
          <td class="py-0.5 px-1.5 text-right text-gray-400">${n}</td>
        </tr>`;
    }).join('');

    // Distribution charts — one per parameter, 2-per-row grid
    const chartCells = paramDefs.map(p => {
      const sorted = [...p.values].sort((a, b) => a - b);
      const excCount  = p.thresholds.length > 0 ? sorted.filter(v => v >= p.thresholds[0]).length : 0;
      const sev2Count = p.thresholds.length > 1 ? sorted.filter(v => v >= p.thresholds[1]).length : 0;
      const excBadge  = excCount > 0
        ? `<span style="font-size:10px;font-weight:600;color:${sev2Count > 0 ? '#ea580c' : '#d97706'};">↑${excCount} alarm${excCount > 1 ? 's' : ''}</span>`
        : '';
      const chart = buildHistogram(sorted, 16, p.thresholds, p.unit);
      return `
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:10px 12px;">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;">
            <span style="font-size:11px;font-weight:600;color:#374151;">${p.label} <span style="font-weight:400;color:#9ca3af;">(${p.unit})</span></span>
            ${excBadge}
          </div>
          ${chart}
        </div>`;
    }).join('');

    statsEl.innerHTML = `
      <table class="text-xs w-full border-collapse mb-5">
        <thead>
          <tr class="border-b border-gray-200 text-gray-400 text-left">
            <th class="py-1 pr-2 font-medium">Parameter</th>
            <th class="py-1 px-1.5 font-medium text-right">Min</th>
            <th class="py-1 px-1.5 font-medium text-right">Q1</th>
            <th class="py-1 px-1.5 font-medium text-right">Mean</th>
            <th class="py-1 px-1.5 font-medium text-right">Median</th>
            <th class="py-1 px-1.5 font-medium text-right">Q3</th>
            <th class="py-1 px-1.5 font-medium text-right">Max</th>
            <th class="py-1 px-1.5 font-medium text-right">n</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Distributions</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">${chartCells}</div>`;
  }

  /** Interpolated percentile on a pre-sorted array (0 ≤ p ≤ 1). */
  function statPct(sorted, p) {
    const n = sorted.length;
    if (n === 1) return sorted[0];
    const idx = p * (n - 1);
    const lo  = Math.floor(idx);
    const hi  = Math.ceil(idx);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  }

  /**
   * Builds a standalone histogram SVG with x-axis tick labels at min, threshold
   * boundaries (with severity names), and max. Bars are colour-coded by severity
   * zone. Returns an HTML string containing the SVG.
   */
  function buildHistogram(sortedValues, bins, thresholds, unit) {
    const n = sortedValues.length;
    if (n === 0) return '';

    const min = sortedValues[0];
    const max = sortedValues[n - 1];

    // Layout: chart area is [PAD_L, PAD_T] to [PAD_L+CW, PAD_T+BH]
    // Total SVG viewBox: TW x TH
    const CW    = 330;  // chart inner width
    const BH    = 54;   // chart inner height (bars)
    const PAD_L = 28;   // left  — y-axis labels
    const PAD_R = 20;   // right — room for last x-tick label
    const PAD_T = 8;    // top   — room for top y-tick label
    const PAD_B = 32;   // bottom — x-axis labels (value + sev name row)
    const TW    = PAD_L + CW + PAD_R;
    const TH    = PAD_T + BH + PAD_B;
    // Shorthand: chart top-left corner
    const CX = PAD_L;
    const CY = PAD_T;

    if (max === min) {
      const fill = histBinColor(min, thresholds);
      return '<svg width="100%" viewBox="0 0 ' + TW + ' ' + TH + '" style="display:block;">' +
        '<rect x="' + CX + '" y="' + CY + '" width="' + CW + '" height="' + BH + '" rx="2" fill="' + fill + '" opacity="0.8"/>' +
        '<text x="' + (CX + CW / 2) + '" y="' + (CY + BH + 16) + '" text-anchor="middle" font-size="9" fill="#6b7280">' + min.toFixed(1) + ' ' + unit + ' (all ' + n + ')</text>' +
        '</svg>';
    }

    const range = max - min;
    const binW  = range / bins;
    const counts = new Array(bins).fill(0);
    for (const v of sortedValues) {
      const i = Math.min(bins - 1, Math.floor((v - min) / binW));
      counts[i]++;
    }
    const maxCount = Math.max(...counts);
    const cellW    = CW / bins;

    // ── Y-axis: 4 fixed gridlines at 0, 33%, 67%, 100% of maxCount
    const yTicks = [0, 0.33, 0.67, 1.0];
    const yLines = yTicks.map(function(frac) {
      const yVal = Math.round(frac * maxCount);
      const yPx  = CY + BH - Math.round(frac * BH);
      const line = '<line x1="' + CX + '" y1="' + yPx + '" x2="' + (CX + CW) + '" y2="' + yPx + '" stroke="#e5e7eb" stroke-width="0.8"/>';
      const lbl  = '<text x="' + (CX - 3) + '" y="' + (yPx + 3) + '" text-anchor="end" font-size="7.5" fill="#9ca3af">' + yVal + '</text>';
      return line + lbl;
    }).join('');

    // ── Bars with SVG title tooltips
    const bars = counts.map(function(count, i) {
      const x   = (CX + i * cellW).toFixed(1);
      const bh  = count === 0 ? 0 : Math.max(2, Math.round((count / maxCount) * BH));
      const y   = CY + BH - bh;
      const fill = histBinColor(min + (i + 0.5) * binW, thresholds);
      const binLo = (min + i * binW).toFixed(2);
      const binHi = (min + (i + 1) * binW).toFixed(2);
      const pct   = ((count / n) * 100).toFixed(1);
      const tip   = binLo + '–' + binHi + ' ' + unit + '&#10;' + count + ' values (' + pct + '%)';
      if (count === 0) {
        return '<rect x="' + x + '" y="' + CY + '" width="' + cellW.toFixed(1) + '" height="' + BH + '" fill="transparent"><title>' + tip + '</title></rect>';
      }
      return '<rect x="' + x + '" y="' + y + '" width="' + (cellW - 0.5).toFixed(1) + '" height="' + bh + '" rx="1" fill="' + fill + '" opacity="0.85"><title>' + tip + '</title></rect>';
    }).join('');

    // ── X-axis: 5 evenly-spaced ticks, plus threshold values (deduplicated)
    const xTickCount = 5;
    const xTickStep  = range / (xTickCount - 1);
    const xTickVals  = [];
    for (var ti = 0; ti < xTickCount; ti++) xTickVals.push(min + ti * xTickStep);
    const sorted_t = thresholds.slice().sort(function(a, b) { return a - b; });
    sorted_t.forEach(function(t) {
      if (t > min && t < max && !xTickVals.some(function(v) { return Math.abs(v - t) < xTickStep * 0.15; })) {
        xTickVals.push(t);
      }
    });
    xTickVals.sort(function(a, b) { return a - b; });

    const sevNames = ['T1', 'T2', 'T3'];
    const baselineY = CY + BH;
    const xAxis = xTickVals.map(function(v) {
      const px = (CX + (v - min) / range * CW).toFixed(1);
      const isThresh  = sorted_t.some(function(t) { return Math.abs(t - v) < 0.001; });
      const threshIdx = sorted_t.findIndex(function(t) { return Math.abs(t - v) < 0.001; });
      const col  = isThresh ? '#6b7280' : '#9ca3af';
      // Clamp text-anchor so rightmost label doesn't overflow PAD_R
      const pxNum  = parseFloat(px);
      const anchor = pxNum > CX + CW - 10 ? 'end' : (pxNum < CX + 10 ? 'start' : 'middle');
      const tick   = '<line x1="' + px + '" y1="' + baselineY + '" x2="' + px + '" y2="' + (baselineY + 4) + '" stroke="' + col + '" stroke-width="1"/>';
      const label  = '<text x="' + px + '" y="' + (baselineY + 12) + '" text-anchor="' + anchor + '" font-size="7.5" fill="' + col + '">' + v.toFixed(1) + '</text>';
      const sevLbl = (isThresh && threshIdx >= 0)
        ? '<text x="' + px + '" y="' + (baselineY + 22) + '" text-anchor="' + anchor + '" font-size="7" fill="#9ca3af">' + (sevNames[threshIdx] || '') + '</text>'
        : '';
      return tick + label + sevLbl;
    }).join('');

    // Threshold dashed vertical lines
    const threshLines = sorted_t
      .filter(function(t) { return t > min && t < max; })
      .map(function(t) {
        const tx = (CX + (t - min) / range * CW).toFixed(1);
        return '<line x1="' + tx + '" y1="' + CY + '" x2="' + tx + '" y2="' + (CY + BH) + '" stroke="#374151" stroke-width="0.8" stroke-dasharray="3,2" opacity="0.45"/>';
      }).join('');

    const baseline = '<line x1="' + CX + '" y1="' + baselineY + '" x2="' + (CX + CW) + '" y2="' + baselineY + '" stroke="#d1d5db" stroke-width="1"/>';
    const yAxis    = '<line x1="' + CX + '" y1="' + CY + '" x2="' + CX + '" y2="' + baselineY + '" stroke="#d1d5db" stroke-width="1"/>';

    return '<svg width="100%" viewBox="0 0 ' + TW + ' ' + TH + '" style="display:block;">' +
      yLines + yAxis + baseline + threshLines + bars + xAxis +
      '</svg>';
  }
  function histBinColor(value, thresholds) {
    if (thresholds.length === 0) return '#94a3b8';        // slate-400 — neutral
    const t = [...thresholds].sort((a, b) => a - b);
    if (t.length >= 3 && value >= t[2]) return '#dc2626'; // red-600    — Type 3
    if (t.length >= 2 && value >= t[1]) return '#ea580c'; // orange-600 — Type 2
    if (value >= t[0])                  return '#d97706'; // amber-600  — Type 1
    return '#16a34a';                                     // green-600  — nominal
  }

  // ── Channel summary cards ─────────────────────────────────────────────────

  function renderChannelSummaryCards() {
    const { faultCount, warningCount, total } = analysisResult.channelHealth;
    setText('ch-total',   total);
    setText('ch-healthy', total - faultCount - warningCount);
    setText('ch-warning', warningCount);
    setText('ch-fault',   faultCount);
  }

  function renderExceedanceTable() {
    const tbody = document.getElementById('exceedance-table-body');
    if (!tbody) return;

    const allExceedances = analysisResult.vehicleResults
      .flatMap(v => v.exceedances)
      .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || a.vPos - b.vPos);

    if (allExceedances.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="py-4 text-center text-gray-400">No exceedances detected.</td></tr>';
      return;
    }

    tbody.innerHTML = allExceedances.map(e => {
      const sevClass = severityClass(e.severity);
      return `<tr class="border-b border-gray-100">
        <td class="py-1 px-2 text-gray-700">${e.vPos}</td>
        <td class="py-1 px-2 text-gray-700">${e.axle != null ? e.axle : '—'}</td>
        <td class="py-1 px-2 text-gray-700">${e.side}</td>
        <td class="py-1 px-2 text-gray-800">${e.parameter}</td>
        <td class="py-1 px-2 text-gray-800 font-mono">${e.value.toFixed(2)} ${e.units}</td>
        <td class="py-1 px-2 text-gray-400 font-mono">${e.limit.toFixed(1)} ${e.units}</td>
        <td class="py-1 px-2 font-semibold ${sevClass}">${severityLabel(e.severity)}</td>
      </tr>`;
    }).join('');
  }

  function renderConclusions() {
    const { stats } = analysisResult;
    const reasonsList = document.getElementById('verdict-reasons');
    if (!reasonsList) return;

    if (stats.type3Count > 0) {
      const li = document.createElement('li');
      li.innerHTML = `<strong>ACTION REQUIRED:</strong> ${stats.type3Count} Type 3 exceedance(s) detected — train must be stopped and inspected immediately.`;
      reasonsList.appendChild(li);
    } else if (stats.type2Count > 0) {
      const li = document.createElement('li');
      li.textContent = `${stats.type2Count} Type 2 exceedance(s) detected — train should proceed to the next station for corrective action.`;
      reasonsList.appendChild(li);
    } else if (stats.type1Count > 0) {
      const li = document.createElement('li');
      li.textContent = `${stats.type1Count} Type 1 exceedance(s) detected — route train to maintenance depot at next opportunity.`;
      reasonsList.appendChild(li);
    }

    if (analysisResult.verdict.verdict === 'REVIEW REQUIRED') {
      const li = document.createElement('li');
      li.innerHTML = `<strong>ACTION REQUIRED:</strong> Manual review by a trained technician is required before any operational decision is made.`;
      reasonsList.appendChild(li);
    }
  }

  // ── PDF download ───────────────────────────────────────────────────────────

  function setupDownloadButton() {
    const btn = document.getElementById('download-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (!trainData) return;
      PdfExport.exportReport('report-section', trainData.meta);
    });
  }

  // ── Alarm limits summary ───────────────────────────────────────────────────

  function renderLimitsSummary() {
    const container = document.getElementById('limits-summary');
    if (!container || !analysisResult) return;

    const L = analysisResult.effectiveLimits || ALARM_LIMITS;
    const D = ALARM_LIMITS;  // defaults for comparison

    // Returns a <td> with amber highlight if the value differs from default
    function td(val, defVal, fmt) {
      const text   = fmt ? fmt(val) : String(val);
      const isCustom = Math.abs(val - defVal) > 1e-9;
      return `<td class="py-1.5 px-3 text-right font-mono text-xs ${isCustom ? 'text-amber-600 font-semibold' : 'text-gray-700'}">${text}${isCustom ? ' ✎' : ''}</td>`;
    }

    const railLabel = currentRailType === RAIL_TYPE.S_LINE ? 'S-line (60 kg/m)' : 'N1-line (57 kg/m)';
    const wi = L.wheelImpact[currentRailType];
    const wiD = D.wheelImpact[currentRailType];

    const rows = [
      // ─ Wheel Impact ─
      ['Wheel Impact — Dynamic Load', 'Type 2', `${wi.type2} kN`, Math.abs(wi.type2 - wiD.type2) > 1e-9],
      ['', 'Type 3', `${wi.type3} kN`, Math.abs(wi.type3 - wiD.type3) > 1e-9],
      // ─ Lateral Force ─
      ['Lateral Force (per wheel)', 'Type 1 min', `${L.lateralForce.type1Min} t`, Math.abs(L.lateralForce.type1Min - D.lateralForce.type1Min) > 1e-9],
      ['', 'Type 2 min', `${L.lateralForce.type2Min} t`, Math.abs(L.lateralForce.type2Min - D.lateralForce.type2Min) > 1e-9],
      ['', 'Type 3 force', `${L.lateralForce.type3Force} t`, Math.abs(L.lateralForce.type3Force - D.lateralForce.type3Force) > 1e-9],
      ['', 'Type 3 L/V ratio', `${L.lateralForce.type3LvRatio}`, Math.abs(L.lateralForce.type3LvRatio - D.lateralForce.type3LvRatio) > 1e-9],
      // ─ Gauge Spreading ─
      ['Gauge Spreading Force', 'Type 1 min', `${L.gaugeSpreading.type1Min} t`, Math.abs(L.gaugeSpreading.type1Min - D.gaugeSpreading.type1Min) > 1e-9],
      ['', 'Type 2', `${L.gaugeSpreading.type2} t`, Math.abs(L.gaugeSpreading.type2 - D.gaugeSpreading.type2) > 1e-9],
      // ─ Skew Loading ─
      ['Skew Loading', 'Type 2', `${L.skewLoading.type2} %`, Math.abs(L.skewLoading.type2 - D.skewLoading.type2) > 1e-9],
      // ─ Channel Offsets ─
      ['Bridge Channel Offset', 'Warning threshold', `${L.channelOffset.warningThreshold} t`, Math.abs(L.channelOffset.warningThreshold - D.channelOffset.warningThreshold) > 1e-9],
      ['', 'Fault threshold', `${L.channelOffset.faultThreshold} t`, Math.abs(L.channelOffset.faultThreshold - D.channelOffset.faultThreshold) > 1e-9],
    ];

    const hasAnyOverride = rows.some(r => r[3]);
    const sourceNote = hasAnyOverride
      ? 'BBD5249 v3.1 (with analyst overrides)'
      : 'BBD5249 v3.1 (unmodified)';

    container.innerHTML = `
      <p class="text-xs text-gray-500 mb-3">
        Rail type: <strong class="text-gray-700">${railLabel}</strong> &nbsp;·&nbsp;
        Source: <strong class="text-gray-700">${sourceNote}</strong>
      </p>
      <div class="overflow-x-auto">
        <table class="text-xs w-full max-w-xl">
          <thead>
            <tr class="border-b border-gray-200 text-gray-400 text-left bg-gray-50">
              <th class="py-2 px-3 font-medium">Parameter</th>
              <th class="py-2 px-3 font-medium">Alarm Type</th>
              <th class="py-2 px-3 font-medium text-right">Limit Used</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(([param, type, val, isCustom]) => `
              <tr class="border-b border-gray-100">
                <td class="py-1.5 px-3 text-gray-600">${param}</td>
                <td class="py-1.5 px-3 text-gray-500">${type}</td>
                <td class="py-1.5 px-3 text-right font-mono ${isCustom ? 'text-amber-600 font-semibold' : 'text-gray-700'}">${val}${isCustom ? ' ✎' : ''}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  // ── Data quality warnings ──────────────────────────────────────────────────

  function renderDataWarnings(warnings) {
    const container = document.getElementById('data-warnings');
    if (!container) return;
    if (!warnings || warnings.length === 0) {
      container.innerHTML = '';
      container.classList.add('hidden');
      return;
    }
    container.classList.remove('hidden');
    container.innerHTML = warnings.map(w => {
      const icon = '⚠';
      return `<div class="flex gap-3 bg-amber-50 border border-amber-300 rounded-lg p-4 text-sm">
        <div class="text-amber-500 text-lg leading-none mt-0.5 flex-shrink-0">${icon}</div>
        <div>
          <p class="font-semibold text-amber-800 mb-1">Data Quality Warning — ${w.code.replace(/_/g, ' ')}</p>
          <p class="text-amber-700">${w.message}</p>
        </div>
      </div>`;
    }).join('');
  }

  // Expose resetLimits so the inline onclick in the HTML can call it
  window._appResetLimits = () => resetLimits();

  // ── Helpers ────────────────────────────────────────────────────────────────

  function setStatus(type, message) {
    const el = document.getElementById('status-message');
    if (!el) return;
    el.textContent = message;
    el.className = {
      loading: 'text-gray-500 text-sm',
      error:   'text-red-600 text-sm',
      ready:   'hidden',
    }[type] || 'text-gray-500 text-sm';
  }

  function showSection(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function severityClass(sev) {
    return {
      [SEVERITY.NOMINAL]: 'text-green-600',
      [SEVERITY.TYPE1]:   'text-amber-600',
      [SEVERITY.TYPE2]:   'text-orange-600',
      [SEVERITY.TYPE3]:   'text-red-600',
    }[sev] || 'text-gray-400';
  }

  function severityLabel(sev) {
    return { [SEVERITY.NOMINAL]: 'Nominal', [SEVERITY.TYPE1]: 'Type 1', [SEVERITY.TYPE2]: 'Type 2', [SEVERITY.TYPE3]: 'Type 3' }[sev] || '—';
  }

  function severityRank(s) {
    return [SEVERITY.NOMINAL, SEVERITY.TYPE1, SEVERITY.TYPE2, SEVERITY.TYPE3].indexOf(s);
  }

})();
