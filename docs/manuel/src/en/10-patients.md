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
    - **Minimum**: a pseudonym. Everything else is filled in as information arrives.
    - **Reused**: everything entered here feeds the MDT presentation and the reports.

## The patient list {#la-liste-des-patients}

This is EpiScope's home screen. Each row gives the pseudonym, the patient's **stage in the pathway** (upcoming meeting, SEEG, follow-up…), the number of explorations and seizures, the imaging status and the date of the last change. The search field filters by pseudonym or by stage.

![The patient list, with the library (records folder) and the user.](shot:library)

At the top of the list:

- **Library**: the folder where records are kept. [[Change directory…]] chooses another one (a shared team drive, for example); [[Return to browser storage]] keeps records in the browser, on this computer only.
- **User**: your initials. They sign every change in the record's log.
- [[Import a record…]]: opens an `.episcope` archive received from a colleague.
- [[Export the cohort (CSV)]]: see [Exporting a cohort](@rapports#exporter-une-cohorte).

At the bottom of the list, the footer recalls the tool's status (research prototype, not validated for clinical use) and gives three links: [[Help]] (this manual), [[Credits]] (authors of the methods, atlases and software) and [[Legal notice]] (intellectual property, citation, component licences, personal data).

!!! astuce
    On a shared drive, a **lock** shows that a record is open by a colleague. If two people edit the same record at the same time, nothing is overwritten: the second version is kept alongside as a conflict copy.

## Creating a patient {#creer-un-patient}

[[+ New patient]], then a pseudonym. The record opens on its **Summary** and the pathway starts with a **Phase 1** (scalp video-EEG). Sex, date of birth, handedness and the rest are filled in the **Patient** card of the summary.

To delete a patient: ✕ at the end of the row, then retype the pseudonym. Everything attached to it is erased (seizures, images, electrodes, meetings, log).

## The summary {#la-synthese}

The first view of the record fits on one screen:

- at the top, the **timeline** of the pathway: explorations, seizures, investigations, meetings, surgery and outcome on one strip, with the patient's age; the wheel or dragging zooms and pans;
- the **Patient** card: pseudonymised identity, language dominance, age at first seizures, MRI, **current seizure frequency** ([[Update today]] button), treatment;
- the **Pathway** card: each stage summarised in two lines, with [[open →]];
- the **Imaging**, **Investigations** and **Implantations** cards.

![The record summary: timeline, patient, pathway, imaging, investigations.](shot:dossier-synthese)

## The clinical history {#lhistoire-clinique}

Three tabs, to fill in whichever order suits you:

- **History and context**: past history as *no / yes / ?* with details (the [[no to all]] button answers "no" to lines left empty), notable medical and surgical history, lifestyle, comorbidities, and the **family tree** (see below).
- **History of present illness**: age and mode of onset, aetiology (confirmed or suspected), MRI, seizure types, subjective and objective manifestations, triggers, seizure frequency over time, current and past treatments with their effect.
- **Development & examination**: pregnancy and birth (with weight, length and head circumference charts), psychomotor milestones, dated neurological examination, handedness (Edinburgh inventory, pointing test, dominant eye) and language dominance.

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

!!! astuce
    A video that is too heavy can be reduced on the spot. A video in a format the browser cannot play (AVI, WMV…) is converted on the computer; it is never sent anywhere.

## The log {#le-journal}

All changes to the record, dated and signed with the user's initials, grouped in ten-minute slots.

??? plus
    **Where are the files?** In the library folder, one sub-folder per patient: `dossier.json` (everything entered), `imaging/` (images), `ieeg/` (recordings), `gallery/` (screenshots and videos), `attachments/` and `derivatives/` (computed anatomy, results). They are ordinary files: they are backed up with the rest of the drive. See [Data and confidentiality](@donnees).
