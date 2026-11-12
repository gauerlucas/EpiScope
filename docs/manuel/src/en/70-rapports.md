---
id: rapports
title: Reports, sharing and exports
short: Reports and exports
group: path
order: 70
lead: Each stage produces its document. A record is sent as one archive, a cohort is exported as tables. It all starts from two buttons: Report and ⋯.
---

# Reports, sharing and exports

!!! bref
    - **A document**: the [[Report]] button in the top bar, on the stage you want.
    - **A record for a colleague**: patient name ▾ › *Export the record*.
    - **A cohort**: patient list › [[Export the cohort (CSV)]].

## Reports {#les-comptes-rendus}

The [[Report]] button produces the document for the open stage:

| Stage | Document |
|---|---|
| Record | Record report: patient, timeline, each exploration with its seizures and report, MDT meetings, surgery and outcome. You choose the content (habitual seizures only, 3D views, parameters…). |
| Phase 1 | Phase 1 report: seizures, EEG, summary. |
| SEEG | SEEG report (see [The SEEG report](@seeg#le-rapport-seeg)). |
| MDT meeting | MDT report. |
| An open seizure | The seizure alone: timeline, sequence, candidate regions, 3D views. |

![Choosing the content of the record report.](shot:rapport-choix)

The document is **downloaded**: a self-contained HTML file (images included), to be filed with the medical record or sent. Opened in the browser, it shows a side table of contents; <kbd>Ctrl</kbd>+<kbd>P</kbd> prints it or saves it as PDF, and it can be copied into a word processor. In English mode, the report is written in English (data you entered stay as typed).

![A report opened in the browser: summary tables and 3D views; the ☰ Contents button leads to each section.](shot:rapport-html)

## Captures {#captures}

The [[Capture ▾]] menu of 3D views, slices and recordings files the image in the gallery, copies it (to paste into Word or PowerPoint) or saves it as PNG.

## Sharing a record {#partager-un-dossier}

Patient name ▾ › *Export the record* produces a `patient.episcope` archive (a zip readable anywhere):

- **full**: with images, recordings and videos;
- **light**: without the original images or recordings, but with surfaces, parcellation, electrodes and results.

Your colleague drops it on their EpiScope window (or [[Import a record…]]). If the record already exists on their side, they choose: replace their copy, keep both, or make it a new record.

!!! attention
    Send archives through a secure health messaging service or on an encrypted medium, like any medical document.

## Exporting a cohort {#exporter-une-cohorte}

Patient list › [[Export the cohort (CSV)]]: a zip of tables (patients, explorations, sessions, seizures, signs, lesions, imaging, stimulations, thermocoagulations, meetings, hypotheses, decisions, procedures, outcome), to open in Excel, R or Python.

## Other exports {#autres-exports}

- **Electrodes**: BIDS `electrodes.tsv` (Localisation tab).
- **Surfaces**: GIfTI of the patient's anatomy (Patient anatomy card).
- **Results**: each SEEG analysis set, each spike cluster, the hypnogram can be exported as CSV.
- **Reference database**: [[⋯]] › *Reference database* exports the sign and prior tables as CSV, or produces an `EpiScope.html` embedding your modified database (see [Data and confidentiality](@donnees#la-base-de-reference)).
