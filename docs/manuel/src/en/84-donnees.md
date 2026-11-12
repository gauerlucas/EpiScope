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
    - **Pseudonyms**: prefer them to names as soon as the folder is shared or records travel; mind recording file names too (a recording's title is taken from its file name: rename it if needed).

## Where are the records? {#ou-sont-les-dossiers}

On first launch, you choose between:

- a **folder** (local disk, the department's network share): one sub-folder per patient, readable without EpiScope;
- **browser storage**: handy for trying things out, but tied to this browser on this computer (no sharing, and it disappears if browser data are cleared).

The choice can be changed from the patient list ([[Change directory…]]).

| In a patient's folder | Content |
|---|---|
| `dossier.json` | Everything entered: history, seizures, meetings, electrodes, results. |
| `imaging/` | NIfTI images (converted from DICOM if needed). |
| `ieeg/` | EEG and SEEG recordings, as imported, and their computations. |
| `gallery/`, `attachments/` | Screenshots, videos, attachments. |
| `derivatives/` | Patient anatomy, head models, computed maps. |

## Working as a team {#travailler-a-plusieurs}

On a shared drive, each colleague opens EpiScope on their own computer and points to the same folder. A **lock** shows that a record is open elsewhere; if it is edited in two places at once, the second version is kept as a conflict copy, nothing is overwritten. The user's initials sign each change in the log.

## Backup and updates {#sauvegarde-et-mise-a-jour}

- **Backup**: that of the folder (backed-up share, regular copy).
- **Updating EpiScope**: replace `EpiScope.html` with the new version. Records, kept elsewhere, are not touched.

## Sending a record {#envoyer-un-dossier}

Patient name ▾ › *Export the record*: full or light `.episcope` archive (see [Sharing a record](@rapports#partager-un-dossier)). Send it through a secure health messaging service.

## The reference database {#la-base-de-reference}

[[⋯]] › *Reference database* opens the sign database: for each sign, its VEP regions, weights, role, source and notes; and the long-range network links. You can edit it; changes stay on this computer. To share them: *Export the app with this database* produces a new `EpiScope.html` that embeds it. Tables can be exported and re-imported as CSV.

!!! attention
    Editing the database changes the results of every seizure. Record your changes (*source* column) and share the same version within the team.
