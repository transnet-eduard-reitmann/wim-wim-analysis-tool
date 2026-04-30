/**
 * pdf-export.js — Exports the rendered report to a PDF file.
 *
 * Depends on: html2pdf.js (loaded via CDN in index.html)
 *
 * PDF truncation fix: before capturing, all .heatmap-scroll containers have
 * their overflow temporarily removed so html2canvas captures the full width.
 * This is restored after export.
 */

const PdfExport = (() => {

  function exportReport(reportId, meta) {
    const element = document.getElementById(reportId);
    if (!element) return;

    const filename = buildFilename(meta);

    // Expand heatmap scroll containers so the full width is captured
    const scrollEls = Array.from(element.querySelectorAll('.heatmap-scroll'));
    const savedStyles = scrollEls.map(el => ({
      el,
      overflow: el.style.overflow,
      maxWidth: el.style.maxWidth,
    }));
    scrollEls.forEach(el => {
      el.style.overflow = 'visible';
      el.style.maxWidth = 'none';
    });

    const btn = document.getElementById('download-btn');
    if (btn) btn.style.display = 'none';

    const opt = {
      margin:      [8, 8, 8, 8],
      filename,
      image:       { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF:       { unit: 'mm', format: 'a4', orientation: 'landscape' },
      pagebreak:   { mode: ['avoid-all', 'css', 'legacy'] },
    };

    html2pdf()
      .set(opt)
      .from(element)
      .save()
      .then(() => {
        // Restore original overflow styles
        savedStyles.forEach(({ el, overflow, maxWidth }) => {
          el.style.overflow = overflow;
          el.style.maxWidth = maxWidth;
        });
        if (btn) btn.style.display = '';
      });
  }

  function buildFilename(meta) {
    const site  = (meta.component || 'UNKNOWN').replace(/\./g, '_');
    const train = (meta.trainId   || 'UNKNOWN').replace(/[^a-zA-Z0-9]/g, '');
    const date  = (meta.time      || '').replace(/[^0-9]/g, '').slice(0, 8);
    return `${site}_${train}_${date}_WIM-Report.pdf`;
  }

  return { exportReport };

})();
