---
id: formats
title: Supported formats
group: ref
order: 20
lead: What EpiScope can read and write. When in doubt, drop the file on the screen: an unrecognised format is reported, nothing is damaged.
---

# Supported formats

## What EpiScope reads {#ce-quepiscope-lit}

| Data | Formats | Notes |
|---|---|---|
| Images | NIfTI (`.nii`, `.nii.gz`), DICOM folder | Uncompressed DICOM only (no JPEG / JPEG 2000 / RLE, no Siemens mosaic). |
| EEG and SEEG | EDF, EDF+ (annotations, discontinuous), BDF, BrainVision (`.vhdr` + `.eeg` + `.vmrk`), BIDS iEEG | Brainquick and Micromed exports recognised (prefixes, non-EEG channels removed, exported bipolar montage). Native `.TRC` files must be exported to EDF. |
| SEEG planning | ROSA (`.ros`), CSV or TSV (name, entry x y z, target x y z), BIDS `electrodes.tsv` | The coordinate frame is deduced from anatomical consistency: check the trajectories after import. |
| Segmentation made elsewhere | aparc+aseg or aseg (FreeSurfer, FastSurfer; `.mgz`, `.nii`), CAT12, Brainstorm | In the space of the reference T1. |
| Quantifications | Excel (`.xlsx`), CSV, text | Label column (A’1-2, A'1-A'2, A1…) and numeric columns detected. |
| Connectome | `weights.txt` + `centres.txt` (VEP / TVB pipeline) | N × N matrix, "Left-… / Right-…" names. |
| Videos | MP4, WebM, MOV; AVI, WMV, MPEG-2… converted on the computer | Conversion downloads the ffmpeg tool once (≈ 31 MB), after consent. |
| Screenshots | PNG, JPEG, clipboard | <kbd>Ctrl</kbd>+<kbd>V</kbd> in a gallery or an investigation. |
| Records | `.episcope` (zip archive), older `.json` cases | Drop on the window, or [[Import a record…]]. |

## What EpiScope writes {#ce-quepiscope-ecrit}

| Data | Format |
|---|---|
| Reports | Self-contained HTML (printable to PDF) |
| Record | `.episcope` (zip: `dossier.json`, images, recordings, derivatives) |
| Cohort | zip of CSV tables |
| Electrodes | `electrodes.tsv` (BIDS) |
| Surfaces | GIfTI |
| Results | CSV (analysis sets, spikes, hypnogram, regional values) |
| Derived images | NIfTI in `derivatives/` (corrected PET, maps) |
| Captures | PNG, clipboard |
