/**
 * visualiser.js — Renders the train heatmap and diagnostic charts.
 *
 * Depends on: Chart.js (loaded via CDN in index.html)
 * Depends on: SEVERITY (from config/alarm-limits.js)
 */

const Visualiser = (() => {

  const COLOUR = {
    [SEVERITY.NOMINAL]: '#22c55e',  // green-500
    [SEVERITY.TYPE1]:   '#f59e0b',  // amber-500
    [SEVERITY.TYPE2]:   '#f97316',  // orange-500
    [SEVERITY.TYPE3]:   '#ef4444',  // red-500
    healthy:            '#22c55e',
    warning:            '#f59e0b',
    fault:              '#ef4444',
    neutral:            '#94a3b8',  // slate-400
  };

  const LABEL = {
    [SEVERITY.NOMINAL]: 'Nominal',
    [SEVERITY.TYPE1]:   'Type 1',
    [SEVERITY.TYPE2]:   'Type 2',
    [SEVERITY.TYPE3]:   'Type 3',
  };

  let _channelChart = null;
  let _donutChart   = null;

  /**
   * Renders the full-train scrollable heatmap into `containerId`.
   * Each cell = one wheel measurement. Cells are coloured by worst severity.
   */
  function renderTrainHeatmap(analysisResult, trainData, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    const { vehicleResults } = analysisResult;
    if (vehicleResults.length === 0) {
      container.innerHTML = '<p class="text-slate-400 text-sm">No vehicle data available.</p>';
      return;
    }

    // Build a lookup: vPos → axle → side → severity
    const severityMap = buildSeverityMap(analysisResult);

    // Outer scroll wrapper
    const scrollWrapper = document.createElement('div');
    scrollWrapper.className = 'overflow-x-auto pb-2';

    const trainStrip = document.createElement('div');
    trainStrip.className = 'flex items-end gap-1 min-w-max';

    vehicleResults.forEach((vehicle, vIdx) => {
      const vData = trainData.vehicles.find(v => v.vPos === vehicle.vPos);
      const axleCount = vData ? vData.axles.length : 0;

      // Vehicle block
      const vehicleBlock = document.createElement('div');
      vehicleBlock.className = 'flex flex-col items-center';

      // Axle cells row
      const axleRow = document.createElement('div');
      axleRow.className = 'flex gap-0.5';

      for (let a = 1; a <= Math.max(axleCount, 1); a++) {
        const axleGroup = document.createElement('div');
        axleGroup.className = 'flex flex-col gap-0.5';

        // Left wheel cell
        const leftCell = createWheelCell(vehicle.vPos, a, 'Left', severityMap, vData);
        // Right wheel cell
        const rightCell = createWheelCell(vehicle.vPos, a, 'Right', severityMap, vData);

        axleGroup.appendChild(leftCell);
        axleGroup.appendChild(rightCell);
        axleRow.appendChild(axleGroup);
      }

      vehicleBlock.appendChild(axleRow);

      // Vehicle label below
      const label = document.createElement('div');
      label.className = 'text-xs text-slate-400 mt-1 text-center leading-tight';
      label.style.maxWidth = Math.max(axleCount, 1) * 14 + 'px';
      label.textContent = `V${vehicle.vPos}`;
      vehicleBlock.appendChild(label);

      // Worst-severity border
      vehicleBlock.style.borderLeft = vIdx > 0 ? '1px solid #334155' : 'none';
      vehicleBlock.style.paddingLeft = vIdx > 0 ? '4px' : '0';

      trainStrip.appendChild(vehicleBlock);
    });

    scrollWrapper.appendChild(trainStrip);
    container.appendChild(scrollWrapper);

    // Rail-side labels
    const sideLabels = document.createElement('div');
    sideLabels.className = 'flex flex-col items-start mt-2 text-xs text-slate-400 gap-0.5';
    sideLabels.innerHTML = '<span>▲ Left rail</span><span>▼ Right rail</span>';
    container.appendChild(sideLabels);

    // Colour legend
    container.appendChild(buildLegend());
  }

  function createWheelCell(vPos, axleNum, side, severityMap, vData) {
    const cell = document.createElement('div');
    cell.style.width  = '10px';
    cell.style.height = '10px';
    cell.style.borderRadius = '2px';
    cell.style.cursor = 'pointer';
    cell.style.flexShrink = '0';

    const key = `${vPos}-${axleNum}-${side}`;
    const sev = severityMap[key] || SEVERITY.NOMINAL;
    cell.style.backgroundColor = COLOUR[sev];

    // Build tooltip content
    let tooltip = `V${vPos} · Axle ${axleNum} · ${side}\nSeverity: ${LABEL[sev]}`;
    if (vData) {
      const axle = vData.axles.find(a => a.axleNum === axleNum);
      if (axle) {
        const dynKN = side === 'Left' ? axle.dynamicLoadLeft_kN : axle.dynamicLoadRight_kN;
        const latT  = side === 'Left' ? axle.lateralForceLeft_t : axle.lateralForceRight_t;
        if (dynKN != null) tooltip += `\nDynamic Load: ${dynKN.toFixed(1)} kN`;
        if (latT  != null) tooltip += `\nLateral Force: ${latT.toFixed(2)} t`;
      }
    }
    cell.title = tooltip;

    return cell;
  }

  function buildSeverityMap(analysisResult) {
    const map = {};
    for (const vehicle of analysisResult.vehicleResults) {
      for (const ar of vehicle.axleResults) {
        const key = `${ar.vPos}-${ar.axle}-${ar.side}`;
        const existing = map[key];
        // Keep worst severity
        if (!existing || severityRank(ar.severity) > severityRank(existing)) {
          map[key] = ar.severity;
        }
      }
    }
    return map;
  }

  function severityRank(s) {
    return [SEVERITY.NOMINAL, SEVERITY.TYPE1, SEVERITY.TYPE2, SEVERITY.TYPE3].indexOf(s);
  }

  function buildLegend() {
    const legend = document.createElement('div');
    legend.className = 'flex flex-wrap gap-3 mt-3';
    const items = [
      { sev: SEVERITY.NOMINAL, label: 'Nominal' },
      { sev: SEVERITY.TYPE1,   label: 'Type 1 (depot)' },
      { sev: SEVERITY.TYPE2,   label: 'Type 2 (station)' },
      { sev: SEVERITY.TYPE3,   label: 'Type 3 (stop)' },
    ];
    items.forEach(item => {
      const el = document.createElement('div');
      el.className = 'flex items-center gap-1.5 text-xs text-slate-300';
      el.innerHTML = `<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${COLOUR[item.sev]}"></span>${item.label}`;
      legend.appendChild(el);
    });
    return legend;
  }

  /**
   * Renders a horizontal bar chart of bridge channel offsets into `canvasId`.
   */
  function renderChannelOffsetChart(channelHealth, canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    if (_channelChart) { _channelChart.destroy(); _channelChart = null; }

    const { channels } = channelHealth;
    const labels = channels.map(c => `Ch ${c.channel}`);
    const values = channels.map(c => c.value);
    const colours = channels.map(c => COLOUR[c.status === 'fault' ? 'fault' : c.status === 'warning' ? 'warning' : 'healthy']);

    _channelChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Channel Offset (t)',
          data: values,
          backgroundColor: colours,
          borderRadius: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => `Offset: ${ctx.raw.toFixed(3)} t`,
            },
          },
          annotation: {
            annotations: {
              warnLine:  { type: 'line', yMin:  ALARM_LIMITS.channelOffset.warningThreshold, yMax:  ALARM_LIMITS.channelOffset.warningThreshold, borderColor: '#f59e0b', borderWidth: 1, borderDash: [4,4] },
              warnLineN: { type: 'line', yMin: -ALARM_LIMITS.channelOffset.warningThreshold, yMax: -ALARM_LIMITS.channelOffset.warningThreshold, borderColor: '#f59e0b', borderWidth: 1, borderDash: [4,4] },
              faultLine:  { type: 'line', yMin:  ALARM_LIMITS.channelOffset.faultThreshold, yMax:  ALARM_LIMITS.channelOffset.faultThreshold, borderColor: '#ef4444', borderWidth: 1, borderDash: [4,4] },
              faultLineN: { type: 'line', yMin: -ALARM_LIMITS.channelOffset.faultThreshold, yMax: -ALARM_LIMITS.channelOffset.faultThreshold, borderColor: '#ef4444', borderWidth: 1, borderDash: [4,4] },
            },
          },
        },
        scales: {
          x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: '#1e293b' } },
          y: {
            ticks: { color: '#94a3b8' },
            grid:  { color: '#1e293b' },
            title: { display: true, text: 'Offset (t)', color: '#94a3b8' },
          },
        },
      },
    });
  }

  /**
   * Renders a donut chart showing axle severity distribution.
   */
  function renderExceedanceDonut(stats, canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    if (_donutChart) { _donutChart.destroy(); _donutChart = null; }

    const nominal = stats.totalWheels - stats.exceedingWheels;

    _donutChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['Nominal', 'Type 1', 'Type 2', 'Type 3'],
        datasets: [{
          data: [nominal, stats.type1Count, stats.type2Count, stats.type3Count],
          backgroundColor: [COLOUR[SEVERITY.NOMINAL], COLOUR[SEVERITY.TYPE1], COLOUR[SEVERITY.TYPE2], COLOUR[SEVERITY.TYPE3]],
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: {
            position: 'right',
            labels: { color: '#94a3b8', font: { size: 11 }, padding: 10 },
          },
          tooltip: {
            callbacks: {
              label: ctx => {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0;
                return `${ctx.label}: ${ctx.raw} (${pct}%)`;
              },
            },
          },
        },
      },
    });
  }

  return { renderTrainHeatmap, renderChannelOffsetChart, renderExceedanceDonut };

})();
