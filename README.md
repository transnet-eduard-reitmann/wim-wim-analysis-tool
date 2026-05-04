# WIM-WIM Analysis Tool

**Live tool:** https://transnet-eduard-reitmann.github.io/wim-wim-analysis-tool/src/

A browser-based tool for processing and reporting on raw WIM-WIM (Weigh-In-Motion) train data extracted from the Integrated Train Condition Monitoring System (ITCMS).

## Purpose

Technicians receive raw CSV data files from the ITCMS query interface and need to determine whether a triggered alarm was a **true alarm** (genuine wheel/loading defect) or a **false alarm** (faulty measurement system). This tool automates that assessment and produces a clear, visual one-page report.

## How to Use

1. Open [the tool](https://transnet-eduard-reitmann.github.io/wim-wim-analysis-tool/src/) in any browser.
2. Drag and drop a condition CSV file exported from the ITCMS query interface onto the upload zone (or click **Open File**). The tool identifies the file type from its contents — no specific filename suffix is required.
3. Select the rail type at the measurement site (S-line 60 kg/m or N1-line 57 kg/m).
4. Optionally expand **Alarm Limits** to review or override the BBD5249 v3.1 thresholds for case-study analysis. Limits are pre-populated from the standard and changes take effect immediately.
5. Review the generated report — system diagnostics, train heatmap, exceedance summary, and alarm verdict.
6. Click **Print / Save as PDF** to export the report. For best quality (vector text and graphics), choose **Save as PDF** as the print destination in the browser dialog — avoid using a Windows printer driver, which rasterises the output.

> **Note:** If the exported CSV file contains data from more than one train passage (multiple timestamps for the same train ID), a data-quality warning will be shown and only the largest passage will be used for analysis. Re-export with a narrower date/time window to avoid this.

> **Note:** The tool automatically detects parameters where all recorded values are identical (particularly all-zero), such as Lateral Force, Gauge Spreading, or Skew Loading channels that are disabled on the measurement system. A warning is shown in the executive summary and any exceedances from those channels are flagged as unreliable.

## Hosting

The tool is a pure static web application (HTML + JavaScript). No backend or server-side processing is required — all CSV parsing and analysis runs entirely in the browser.

- **Live:** Served via GitHub Pages from this repository (https://transnet-eduard-reitmann.github.io/wim-wim-analysis-tool/src/).
- **Local / company network:** Run `python -m http.server 8080` from the `src/` folder and open `http://localhost:8080` in a browser.

## Analysis Standards

Alarm limits are sourced from **BBD5249 v3.1** — *Alarm Limits for Weighbridges, Wheel Impact Load Detectors, Skew Loading, and Bogie Condition Monitoring*.

## Folder Structure

```
├── src/                  Application source (HTML, CSS, JS)
│   ├── index.html
│   ├── css/styles.css
│   └── js/
│       ├── app.js        UI orchestration, file upload, alarm limits editor
│       ├── parser.js     CSV parsing, file-type detection, multi-passage detection
│       ├── analyser.js   BBD5249 alarm limit checks (supports limit overrides)
│       ├── visualiser.js Train heatmap and charts
│       └── pdf-export.js PDF report export
├── config/
│   └── alarm-limits.js   BBD5249 limits (single source of truth)
└── sample-data/          Anonymised sample CSV files for testing
```

## Disclaimer

This tool is intended as a decision-support aid. All alarm assessments must be reviewed by a qualified technician before action is taken.
