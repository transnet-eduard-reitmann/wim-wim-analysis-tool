# WIM-WIM Analysis Tool

**Live tool:** https://transnet-eduard-reitmann.github.io/wim-wim-analysis-tool/src/

A browser-based tool for processing and reporting on raw WIM-WIM (Weigh-In-Motion) train data extracted from the Integrated Train Condition Monitoring System (ITCMS).

## Purpose

Technicians receive raw CSV data files from the ITCMS query interface and need to determine whether a triggered alarm was a **true alarm** (genuine wheel/loading defect) or a **false alarm** (faulty measurement system). This tool automates that assessment and produces a clear, visual one-page report.

## How to Use

1. Open [the tool](https://transnet-eduard-reitmann.github.io/wim-wim-analysis-tool/src/) in any browser.
2. Drag and drop a `-cond.csv` file exported from the ITCMS query interface onto the upload zone (or click **Open File**).
3. Select the rail type at the measurement site (S-line 60 kg/m or N1-line 57 kg/m).
4. Review the generated report — system diagnostics, train heatmap, exceedance summary, and alarm verdict.
5. Download the report as a PDF to share with stakeholders.

## Hosting

The tool is a pure static web application (HTML + JavaScript). No backend or server-side processing is required — all CSV parsing and analysis runs entirely in the browser.

- **Live:** Served via GitHub Pages from this repository.
- **Local / company network:** Run `python -m http.server 8080` from the `src/` folder and open `http://localhost:8080` in a browser.

## Analysis Standards

Alarm limits are sourced from **BBD5249 v3.1** — *Alarm Limits for Weighbridges, Wheel Impact Load Detectors, Skew Loading, and Bogie Condition Monitoring*.

## Folder Structure

```
├── src/                  Application source (HTML, CSS, JS)
│   ├── index.html
│   ├── css/styles.css
│   └── js/
│       ├── app.js        UI orchestration and file upload
│       ├── parser.js     CSV parsing
│       ├── analyser.js   BBD5249 alarm limit checks
│       ├── visualiser.js Train heatmap and charts
│       └── pdf-export.js PDF report export
├── config/
│   └── alarm-limits.js   BBD5249 limits (single source of truth)
└── data/samples/         Anonymised sample CSV files for testing
```

## Disclaimer

This tool is intended as a decision-support aid. All alarm assessments must be reviewed by a qualified technician before action is taken.
