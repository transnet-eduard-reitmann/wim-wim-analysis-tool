/**
 * pdf-export.js — Exports the rendered report as a PDF via the browser's
 * native print dialog (File → Print → Save as PDF).
 *
 * html2pdf / html2canvas cannot read Tailwind CDN's dynamically-injected
 * stylesheet, so it renders blank pages. window.print() uses the browser's
 * own CSS engine, which has full access to all loaded styles and produces
 * correct output. The @page rule in styles.css sets landscape A4.
 */

const PdfExport = (() => {

  function exportReport(reportId, meta) {
    // Set document title so the browser's print dialog suggests a good filename
    const origTitle    = document.title;
    document.title     = buildFilename(meta);

    // Brief delay lets the title update propagate before the dialog opens
    setTimeout(() => {
      window.print();
      document.title = origTitle;
    }, 100);
  }

  function buildFilename(meta) {
    const site  = (meta.component || 'UNKNOWN').replace(/\./g, '_');
    const train = (meta.trainId   || 'UNKNOWN').replace(/[^a-zA-Z0-9]/g, '');
    const date  = (meta.time      || '').replace(/[^0-9]/g, '').slice(0, 8);
    return `${site}_${train}_${date}_WIM-Report`;
  }

  return { exportReport };

})();
