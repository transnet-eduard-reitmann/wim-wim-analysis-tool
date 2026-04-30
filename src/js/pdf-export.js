/**
 * pdf-export.js — Exports the rendered report to a PDF file.
 *
 * Depends on: html2pdf.js (loaded via CDN in index.html)
 */

const PdfExport = (() => {

  /**
   * Exports the element with id `reportId` to a PDF file.
   * @param {string} reportId - id of the DOM element to capture
   * @param {object} meta     - { trainId, component, time } for filename
   */
  function exportReport(reportId, meta) {
    const element = document.getElementById(reportId);
    if (!element) return;

    const filename = buildFilename(meta);

    const opt = {
      margin:       [10, 10, 10, 10],  // mm
      filename,
      image:        { type: 'jpeg', quality: 0.95 },
      html2canvas:  { scale: 2, useCORS: true, backgroundColor: '#0f172a' },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' },
      pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] },
    };

    // Temporarily show any hidden elements needed for PDF
    const btn = document.getElementById('download-btn');
    if (btn) btn.style.display = 'none';

    html2pdf()
      .set(opt)
      .from(element)
      .save()
      .then(() => {
        if (btn) btn.style.display = '';
      });
  }

  function buildFilename(meta) {
    const site   = (meta.component || 'UNKNOWN').replace(/\./g, '_');
    const train  = (meta.trainId   || 'UNKNOWN').replace(/[^a-zA-Z0-9]/g, '');
    const date   = (meta.time      || '').replace(/[^0-9]/g, '').slice(0, 8);
    return `${site}_${train}_${date}_WIM-Report.pdf`;
  }

  return { exportReport };

})();
