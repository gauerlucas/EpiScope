---
id: patients
title: Patients and the record
group: path
order: 10
lead: One patient, one record. It holds the clinical history, dated investigations, explorations, images, MDT meetings and outcome, with a log of who changed what.
---

# Patients and the record

!!! bref
    - **Where?** Patient list (<kbd>F9</kbd>), then the **Record** stage of the pathway (<kbd>F4</kbd>).
    - **Minimum**: the last and first name (or nothing: the patient receives a neutral code anyway). Everything else is filled in as information arrives.
    - **Reused**: everything entered here feeds the MDT presentation and the reports.

## The patient list {#la-liste-des-patients}

This is EpiScope's home screen. Each row gives the patient's **code**, their name (“First LAST”), their **stage in the pathway** (upcoming meeting, SEEG, follow-up…), the number of explorations and seizures, the imaging status and the date of the last change. The search field filters by name, code or stage.

![The patient list, with the library (records folder) and the user.](shot:library)

At the top of the list:

- **Library**: the folder where records are kept. [[Change directory…]] chooses another one (a shared team drive, for example); [[Return to browser storage]] keeps records in the browser, on this computer only.
- **User**: your initials. They sign every change in the record's log.
- [[Import a record…]]: opens an `.episcope` archive received from a colleague.
- [[Export the cohort (CSV)]]: see [Exporting a cohort](@rapports#exporter-une-cohorte).
- [[Correspondence table…]]: the code ↔ identity list of all patients (see [Identity and patient code](#identite-et-code-du-patient)).
- [[Bin]]: patients removed from the list, to restore or delete permanently.
- [[Settings…]]: the code prefix and the centre name; [[Hide names]] replaces names with codes on this computer.

At the bottom of the list, the footer recalls the tool's status (research prototype, not validated for clinical use) and gives three links: [[Help]] (this manual), [[Credits]] (authors of the methods, atlases and software) and [[Legal notice]] (intellectual property, citation, component licences, personal data).

!!! astuce
    On a shared drive, a **lock** shows that a record is open by a colleague. If two people edit the same record at the same time, nothing is overwritten: the second version is kept alongside as a conflict copy.

## Creating a patient {#creer-un-patient}

[[+ New patient]], then the last and first name (for example `DUPONT Jeanne`; optional). The patient immediately receives their **code** (for example `HFAR0007`). The record opens on its **Summary** and the pathway starts with a **Phase 1** (scalp video-EEG). Sex, handedness and the rest are filled in the **Patient** card of the summary.

On the very first creation, EpiScope asks for the **library settings**: the code prefix (`HFAR` by default), the number of digits and the centre name. The prefix and the number of digits no longer change once a code has been assigned.

To remove a patient: ✕ at the end of the row. The record goes to the **library bin** with all its files; [[Bin]] restores it. Permanent deletion is done from the bin, by retyping the patient's code.

## Identity and patient code {#identite-et-code-du-patient}

Each patient has a **neutral code**: the centre prefix followed by a number (`HFAR0007`). This code never changes. It names the patient's files (BIDS format, `sub-HFAR0007`) and replaces them in anonymised exports.

The **identity** (last name, first name, date of birth, hospital ID) is entered in the *Identity* area, at the top of the **Patient** card of the summary. It is the only place where it is stored: it appears neither in file names nor in the log.

- **Display**: the name “First LAST” is shown everywhere in the application (list, record bar, meetings, reports). Without an identity, it is the pseudonym (optional working label), otherwise the code.
- **Date of birth**: the identity's date gives the patient's month and year of birth (age on the timeline); those fields then become read-only.
- **Hide names**: [[hide names]] (Identity area) or [[Hide names]] (patient list) replaces names with codes everywhere on screen, on this computer: to project a record for teaching or share your screen.
- **Older records**: a record created before version 1.1 receives its code when first opened (noted in the log). If its pseudonym is the patient's name, [[use the pseudonym]] fills in last and first name (words in capitals become the last name).
- **Correspondence table**: [[Correspondence table…]] (patient list) exports a CSV file *code; pseudonym; last name; first name; date of birth; hospital ID*. It is an identifying file: keep it within the centre's information system, never attach it to a research share. Each export is noted in the records' logs.

!!! attention
    To send data outside the department, use the **anonymised exports** (see [Sharing a record](@rapports#partager-un-dossier)): name, hospital ID and date of birth are replaced by the code.

## The summary {#la-synthese}

The first view of the record fits on one screen:

- at the top, the **timeline** of the pathway: explorations, seizures, investigations, meetings, surgery and outcome on one strip, with the patient's age; the wheel or dragging zooms and pans;
- the **Patient** card: *Identity* area (last and first name, date of birth, hospital ID, on three lines), sex, language dominance, age at first seizures, MRI, **current seizure frequency** ([[Update today]] button), treatment, and the **pathway status** (pending, operated, declined with its reason, lost to follow-up): entered explicitly for research queries, with the suggestion drawn from the record (procedure performed, “no surgery” decision) applied in one click;
- the **Pathway** card: each stage summarised in two lines, with [[open →]];
- the **Imaging**, **Investigations** and **Implantations** cards.

![The record summary: timeline, patient, pathway, imaging, investigations.](shot:dossier-synthese)

## The clinical history {#lhistoire-clinique}

Three tabs, to fill in whichever order suits you:

- **History and context**: past history as *no / yes / ?* with details (the [[no to all]] button answers "no" to lines left empty), notable medical and surgical history, lifestyle, comorbidities, and the **family tree** (see below).
- **History of present illness**: age and mode of onset, aetiology (confirmed or suspected), MRI, seizure types, subjective and objective manifestations, triggers, seizure frequency over time, current and past treatments with their effect.
- **Development & examination**: pregnancy and birth (with weight, length and head circumference charts), psychomotor milestones, dated neurological examination, handedness (Edinburgh inventory, pointing test, dominant eye) and language dominance. The **Current development** card starts with the **developmental comorbidities** to tick (intellectual disability and its severity, autism spectrum disorder, infantile spasms, language delay, severe behavioural disorders): one click goes from *not recorded* to *yes* then *no* — for a query, “not recorded” is not “no”; free text stays below.

### Reported seizures {#les-crises-rapportees}

A seizure seen outside an investigation — **home video**, eyewitness account, seizure filmed in another centre — is described in **History of present illness**, **Reported seizures** card: [[+ reported seizure]] opens its details (date, habitual or not, notes) and then the semiology entry screen, as for a recorded seizure. Its videos go to the gallery and are linked to it.

Once the relevant investigation exists (ambulatory EEG, phase 1, SEEG, postoperative video-EEG, second phase 1…), the seizure is attached to it: “attach to…” menu of the card, **attached to** field of its details, or, from the investigation's [[Seizures]] tab, [[⋯]] › [[Attach a reported seizure of the record…]]. It keeps its semiology, videos and notes, and then counts in that investigation's summary; it stays listed in the card, with the investigation it is attached to. The same menu moves it back to the record if needed.

In the MDT meeting, a reported seizure that is **not attached** (and dated before the meeting) is shown in a “Reported seizures” section, before the investigations, and counts in the concordance; it can be unticked in “Seizures taken into account” like the others.

### The family tree {#larbre-genealogique}

{refs: pedigree}

The tree is drawn directly, starting from the index case:

1. **Add a person**: hover around a relative; a dotted symbol shows where the person will go. Click **above** for a parent, **below** for a child (of both partners if there is only one), **beside** for the same generation (a brother or sister by default; parents already drawn are carried over). The new person's window opens: sex, status, identity, medical details. After adding beside, a button turns the person into a **partner**.
2. **Link two people**: drag from one symbol to another. In the same generation, choose **union** or **siblings**; between two adjacent generations, it is a parent–child link. Two parents of the same child are joined automatically.
3. **Correct a link**: click the line. A sibling link becomes a union (and vice versa), a link can be deleted. A person's menu also lists all their links.
4. **Tidy up**: [[Tidy up]] places children under their parents; <kbd>Shift</kbd> + drag moves a person within their row; [[↶ Undo]] or <kbd>Ctrl</kbd>+<kbd>Z</kbd> goes back.

**Consanguinity** is shown automatically: a union between two people who share an ancestor in the tree is drawn as a double line, with their relationship (first cousins…) and the inbreeding coefficient of their children (F = 1/16 for first cousins). Siblings linked without their parents being drawn count as having common parents. If the common ancestors are not drawn, tick **declared consanguinity** in the union's menu.

![The family tree: a click near a person adds a parent, a child or a sibling; each person carries a status (affected, possibly affected, carrier, deceased).](shot:dossier-antecedents)

## Investigations {#les-bilans}

Each investigation is dated and typed: video-EEG, MRI, PET, SPECT, MEG, fMRI, Wada, neuropsychology (by domain), psychiatry… It has a conclusion and a lateralisation, and can be **attached to a stage** of the pathway. You can add:

- **attachments** (PDF report, letter), copied into the patient's folder;
- **screenshots** (emergency EEG, an MRI slice), pasted with <kbd>Ctrl</kbd>+<kbd>V</kbd> into the investigation;
- a link to the record's **images**: [[view]] opens the image on the Imaging screen.

![Investigations, most recent first, filterable by type.](shot:dossier-bilans)

## The gallery {#la-galerie}

The patient's screenshots, images and videos. For a screenshot: Windows Snipping Tool (<kbd>Win</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>), then <kbd>Ctrl</kbd>+<kbd>V</kbd> in the gallery, or drop a file. Each item gets a title, a type (ictal, interictal, stimulation, imaging…), a vigilance state, a seizure, a date and notes; it can be **annotated** (arrows, circles, text) and exported as an annotated PNG.

Each stage has its gallery (Phase 1, SEEG…); the Record gallery gathers them all, grouped by stage, seizure, type or month.

An imported video gets a neutral title (“Video of 02/06/2021 23:35:43”): the original file name, which often carries the patient's name, is not kept. If that name contains the start date and time, the video is immediately **aligned** on the recordings’ clock; otherwise, [[video time…]] does it (see [Video and recording](@phase1#video-et-trace)).

!!! astuce
    A video that is too heavy can be reduced on the spot. A video in a format the browser cannot play (AVI, WMV…) is converted on the computer; it is never sent anywhere.

## The log {#le-journal}

All changes to the record, dated and signed with the user's initials, grouped in ten-minute slots. Above the log, the means of losing nothing:

- **Record bin**: everything deleted (a seizure, an exploration with its seizures, an investigation, an image, an MDT comment…) goes there with its dependants. [[Restore]] puts it back exactly in place, links included; removed files wait in the patient's `trash/` sub-folder. Nothing is erased without [[Empty the bin…]].
- **Saved versions**: at each save, the previous version of the record is kept (all those of the last 48 hours, then one per day for three months, then one per month). [[Preview]] shows it read-only, [[Restore…]] brings it back (the current version is kept too). [[Create a restore point]] pins the current version before a delicate operation.
- **Original file names**: in a record created before version 1.1, recordings may still carry their original file name (often the patient's name). The card lists the changes; [[Rename according to BIDS]] stores the files under their BIDS name and gives recordings a neutral title (a version is pinned beforehand).

!!! astuce
    A record written by a more recent EpiScope version opens **read-only**: nothing is rewritten until you have updated the application.

??? plus
    **Where are the files?** In the library folder, one sub-folder per patient (`sub-HFAR0007` for a patient created since version 1.1): `dossier.json` (everything entered), `ses-…/ieeg/` and `ses-…/eeg/` (recordings, named according to BIDS), `imaging/` (images), `gallery/` (screenshots and videos), `attachments/`, `derivatives/` (computed anatomy, results), `history/` (versions) and `trash/` (bin). They are ordinary files: they are backed up with the rest of the drive. See [Data and confidentiality](@donnees).
