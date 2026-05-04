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
          setStatus('error', 'Unrecognised file format. Please upload a valid ITCMS condition CSV.');
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
