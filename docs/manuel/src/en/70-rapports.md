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
    - **Outside the department**: **anonymised** exports (the patient's code replaces the name).

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

The report carries the patient's name. The **hide the patient's name** box in the choice window replaces it with the code (and removes the date of birth), for a document leaving the department. The downloaded file name always carries the code, never the name.

![A report opened in the browser: summary tables and 3D views; the ☰ Contents button leads to each section.](shot:rapport-html)

## Captures {#captures}

The [[Capture ▾]] menu of 3D views, slices and recordings files the image in the gallery, copies it (to paste into Word or PowerPoint) or saves it as PNG.

## Sharing a record {#partager-un-dossier}

Patient name ▾ › *Export the record* (or [[Export]] on its row in the list) produces an `HFAR0007.episcope` archive (a zip readable anywhere):

- **full**: with images, recordings and videos;
- **light**: without the original images or recordings, but with surfaces, parcellation, electrodes and results;
- **anonymised** (full or light), for sharing outside the department or a multicentre study: the identity is removed, last name, first name, hospital ID, date of birth and the former pseudonym are replaced by the code in all texts (log included) and in file names (anatomy, electrodes and images stay readable on import; an anonymised archive made before version 2.1.1 should be made again), EDF file headers are anonymised (patient and recording fields; the start date is kept) and videos are not included (faces). MRI images and captures remain included: check that none shows a face or a name before sharing.

The internal archive (full or light) contains the identity: it is meant to move from one computer of the department to another.

Your colleague drops it on their EpiScope window (or [[Import a record…]]). If the record already exists on their side, they choose: replace their copy, keep both, or make it a new record.

!!! attention
    Send archives through a secure health messaging service or on an encrypted medium, like any medical document.

## Exporting a cohort {#exporter-une-cohorte}

Patient list › [[Export the cohort (CSV)]]: a zip of tables (patients, explorations, seizures (with their recording day), signs, lesions, imaging, stimulations, thermocoagulations, meetings, hypotheses, decisions, procedures, outcome), to open in Excel, R or Python. The button produces the **anonymised** version (each patient designated by their code; for research). The version **with names** (last and first name added, internal use only) is in the [[Export]] menu of a row of the list.

## Research export (anonymised BIDS) {#export-de-recherche}

Patient list › [[Export]] › [[Research export (anonymised BIDS)…]] produces a **BIDS dataset** (version 1.10, iEEG extension) ready to be shared or added to a multicentre research database. EpiScope produces and files the data; exploring the database (cohorts, queries) is done with other tools.

- **Content**: recordings (EDF with an anonymised header, BrainVision), channels (`_channels.tsv`), events with seizure onsets and ends (`_events.tsv`), recording descriptions (`_ieeg.json`, `_eeg.json`), dated sessions and scans; **electrodes** in the patient's T1 space (`space-ScanRAS`) and in the **MNI305** template (`space-MNI305`, 12-dof affine transform), with each contact's region; EpiScope derivatives (`derivatives/episcope`): seizures, sign-by-sign semiology, stimulations, thermocoagulations, analysis results per contact with method and version, clinical data (aetiology, lesions, surgery, outcome), transform to MNI305. The reference T1 is optional (its face is not masked).
- **Anonymisation**: neutral codes only; dates **shifted** by a number of days specific to each subject (intervals and times kept; the shift is drawn once, stored in the library, and stays the same from one export to the next); ages in years instead of birth dates; no video, capture or free text.
- **Check**: every file (recording headers and annotations included) is searched for the patient's last name, first name, hospital number and birth date. A patient for whom an occurrence is found **is not exported**; the report says in which file (often a recording annotation: untick annotations or fix the file).
- **Destination**: a chosen folder (Chrome, Edge), otherwise a `.zip` archive. The export report (patients, options, version) is kept in the library (`exports/`), never in the exported dataset.

In the library itself, validated electrodes are filed with the recordings of their session (`ses-seeg1/ieeg/…_space-ScanRAS_electrodes.tsv`, and `…_space-MNI305_electrodes.tsv` as soon as the patient's anatomy is computed).

## Other exports {#autres-exports}

- **Electrodes**: BIDS `electrodes.tsv` (Localisation tab), named after the patient's code and the session.
- **Correspondence table**: code ↔ identity of all patients, as CSV (patient list; see [Identity and patient code](@patients#identite-et-code-du-patient)).
- **Surfaces**: GIfTI of the patient's anatomy (Patient anatomy card).
- **Results**: each SEEG analysis set, each spike cluster, the hypnogram can be exported as CSV.
- **Reference database**: [[⋯]] › *Reference database* exports the sign and prior tables as CSV, or produces an `EpiScope.html` embedding your modified database (see [Data and confidentiality](@donnees#la-base-de-reference)).
