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

  // ── Init ───────────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', () => {
    setupDropZone();
    setupFileInput();
    setupRailTypeSelector();
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
        if (file.name.toLowerCase().includes('-alarm')) {
          setStatus('error', 'This is an alarm file. Please upload a condition file (-cond.csv) for analysis.');
          return;
        }
        trainData = Parser.parseConditionFile(text, file.name);
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

  // ── Analysis and report ────────────────────────────────────────────────────

  function runAnalysis() {
    if (!trainData) return;
    try {
      analysisResult = Analyser.analyse(trainData, currentRailType);
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
    const { reasons } = analysisResult.verdict;
    const { stats } = analysisResult;
    const el = document.getElementById('conclusions-list');
    if (!el) return;

    const items = [...reasons];

    if (stats.totalWheels > 0) {
      items.push(`Total wheels assessed: ${stats.totalWheels} across ${trainData.vehicles.length} vehicles.`);
      items.push(`Exceedance rate: ${(stats.exceedanceRate * 100).toFixed(2)}% (${stats.exceedingWheels} wheels).`);
    }

    if (stats.type3Count > 0) {
      items.push(`ACTION REQUIRED: ${stats.type3Count} Type 3 exceedance(s) detected. Train must be stopped and inspected immediately.`);
    } else if (stats.type2Count > 0) {
      items.push(`${stats.type2Count} Type 2 exceedance(s) detected. Train should proceed to the next station for corrective action.`);
    } else if (stats.type1Count > 0) {
      items.push(`${stats.type1Count} Type 1 exceedance(s) detected. Route train to maintenance depot at next opportunity.`);
    }

    el.innerHTML = items.map(i => `<li>${i}</li>`).join('');
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
