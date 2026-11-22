---
id: donnees
title: Data and confidentiality
short: Data and confidentiality
group: more
order: 50
lead: Where records are kept, who can read them, how they are shared and backed up, and how to evolve the reference database.
---

# Data and confidentiality

!!! bref
    - **Nothing leaves the computer**: EpiScope works offline and sends no data.
    - **Records are files** in the chosen folder: they follow that folder's access and backup rules.
    - **Identity in one place**: each patient has a neutral code (`HFAR0007`) that names their files; their name is stored only in the record's *Identity* area and only leaves it through the correspondence table or an internal export.
    - **Nothing is lost**: record bin and versions; each result keeps its provenance.

## Where are the records? {#ou-sont-les-dossiers}

On first launch, you choose between:

- a **folder** (local disk, the department's network share): one sub-folder per patient, readable without EpiScope;
- **browser storage**: handy for trying things out, but tied to this browser on this computer (no sharing, and it disappears if browser data are cleared).

The choice can be changed from the patient list ([[Change directory…]]).

Browser mode is meant for trying things out: when a real patient is created in this mode, EpiScope says so and asks the browser for persistent storage.

A folder library is organised according to **BIDS** (*Brain Imaging Data Structure*, the standard for neuroimaging and EEG datasets): `dataset_description.json` at the root, one `sub-<code>` folder per patient created since version 1.1, recordings stored by session under their BIDS name. EpiScope's own areas are declared in `.bidsignore`.

| In a patient's folder | Content |
|---|---|
| `dossier.json` | Everything entered: identity, history, seizures, meetings, electrodes, results and their provenance. |
| `ses-scalp1/eeg/`, `ses-seeg1/ieeg/`… | EEG and SEEG recordings, as imported, named according to BIDS (`sub-HFAR0007_ses-seeg1_task-seizure_run-01_ieeg.edf`). |
| `ieeg/` | Recording computations (energy ratio, fingerprints…), recomputable. In a record created before version 1.1: also the recordings themselves. |
| `imaging/` | NIfTI images (converted from DICOM if needed; the DICOM is not kept). |
| `gallery/`, `attachments/` | Screenshots, videos, attachments. |
| `derivatives/` | Patient anatomy, head models, computed maps. |
| `staff/` | MDT meeting snapshots, as presented. |
| `history/` | Previous versions of the record (compressed). |
| `trash/` | Removed files, waiting in the bin. |

## Identity and anonymisation {#identite-et-anonymisation}

- **Neutral code**: centre prefix (set when the library is initialised, `HFAR` by default) + number. It never changes and contains nothing identifying.
- **Identity area**: last name, first name, date of birth, hospital ID. Never in a file name, a meeting snapshot, an anonymised export or the log. The name is shown in the application; [[Hide names]] replaces it with the code on a computer (projection).
- **Original file names**: exports from acquisition software often carry the patient's name. EpiScope does not keep that name: recordings are renamed according to BIDS on import, videos get a neutral title. For an older record, the *Original file names* card of the log tidies up.
- **Correspondence table**: the only way out for the identity of all patients (CSV), noted in the log.
- **Anonymised exports**: record (identity removed, EDF headers anonymised, no videos), cohort (codes), reports (*hide the name* box). See [Sharing a record](@rapports#partager-un-dossier).

## Nothing is lost {#ne-rien-perdre}

- **Record bin**: any deletion (with its dependants: an exploration takes its seizures along) can be restored exactly; files wait in `trash/`. Nothing is erased without emptying the bin.
- **Library bin**: a patient removed from the list stays there, with all their files, until permanently deleted.
- **Versions**: at each save, the previous version is kept in `history/` (all those of the last 48 hours, then one per day for three months, then one per month, plus restore points). Log › *Saved versions*.
- **Read-only**: a record written by a more recent EpiScope version opens read-only, so as not to lose what the older version does not know about.
- **Format 2.0**: since version 2.0, seizures belong directly to their investigation (or to the record, for a reported seizure): there are no more “sessions”. A record in the former format is converted when opened: each seizure joins the investigation of its session (the session date is used if the seizure had none), session notes and files go, dated, into the investigation notes, the bin is converted, and the previous state stays pinned in `history/`. The conversion is noted in the log. Patient list › [[Dry run…]] shows, without writing anything, what the conversion will do for each record. A 1.x version then opens these records read-only. In a recording that contains several seizures, each seizure keeps its own marks (onset, end, free marks, at real time) and its own results: switching seizures in the viewer moves nothing.
- **Provenance**: each result keeps the method version, the parameters and the recording's fingerprint (see [Provenance of results](@m-seeg#provenance-des-resultats)).

## Working as a team {#travailler-a-plusieurs}

On a shared drive, each colleague opens EpiScope on their own computer and points to the same folder. A **lock** shows that a record is open elsewhere; if it is edited in two places at once, the second version is kept as a conflict copy, nothing is overwritten. The user's initials sign each change in the log.

## Backup and updates {#sauvegarde-et-mise-a-jour}

- **Backup**: that of the folder (backed-up share, regular copy).
- **Updating EpiScope**: replace `EpiScope.html` with the new version. Records, kept elsewhere, are not touched.

## Sending a record {#envoyer-un-dossier}

Patient name ▾ › *Export the record*: full, light or anonymised `.episcope` archive (see [Sharing a record](@rapports#partager-un-dossier)). Send it through a secure health messaging service.

## The reference database {#la-base-de-reference}

[[⋯]] › *Reference database* opens the sign database: for each sign, its VEP regions, weights, role, source and notes; and the long-range network links. You can edit it; changes stay on this computer, and a warning reminds you that a base different from the shipped one is active (each seizure keeps the fingerprint of the base it was computed with). To share them: *Export the app with this database* produces a new `EpiScope.html` that embeds it. Tables can be exported and re-imported as CSV.

!!! attention
    Editing the database changes the results of every seizure. Record your changes (*source* column) and share the same version within the team.
