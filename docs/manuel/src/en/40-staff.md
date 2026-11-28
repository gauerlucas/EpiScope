---
id: staff
title: The MDT meeting
group: path
order: 40
lead: An MDT meeting is a stage of the pathway. It is prepared before or during the meeting, presented full screen, and its report is produced in one click.
---

# The MDT meeting

!!! bref
    - **Where?** [[+]] › *MDT meeting* in the top bar; then the **MDT** stage of the pathway (<kbd>F6</kbd>).
    - **Minimum**: the date, the type and the explorations taken into account. The concordance is pre-filled.
    - **On the day**: [[▶ Present]] (<kbd>F2</kbd>). No slides to make by hand.

## Preparing {#preparer}

The [[Prepare]] tab is filled from top to bottom:

1. **Date, type** (after phase 1, after SEEG, after surgery…), **status** (draft, validated), **participants** and **question asked**.
2. **Seizures taken into account**: the explorations and seizures to discuss (check boxes).
3. **Review**: shortcuts to the clinical history, investigations, imaging and the seizures of each exploration.
4. **Summary**: a summary of the record written from the data, the consensus semiology of the selected seizures, and the **network hypotheses to discuss** (see item 6).
5. **Anatomo-electro-clinical concordance**: a table of *anatomo-functional systems × modalities* (semiology, interictal and ictal EEG, MRI, PET, neuropsychology, SEEG). Columns marked *auto* are **pre-filled** from the record; hovering a cell shows its details and each cell remains editable with a click:
    - **Semiology**: the model's consensus over the seizures taken into account;
    - **Interictal EEG** and **Ictal EEG (scalp)**: 10-20 maps of the explorations taken into account (spikes and slow waves in wakefulness and sleep; seizure onset). Each electrode counts for the systems it explores best (C4: central; T4: lateral and mesial temporal); a neighbouring system, or slow waves alone, stays “in favour” at most. The *Interictal EEG* column also reads **spike localisation** when it exists: retained spike sources (ESI tab; “strong argument” above 40% of the weight);
    - **MRI**, **PET**, **neuropsychology**: declared lesions and [localized investigations](@patients#les-bilans) dated before the meeting (follow-up investigations excluded). A localized, lateralised MRI is a “strong argument”. An investigation without a confirmed localization counts from the regions mentioned in its text, “in favour” at most, marked *to be confirmed*;
    - **SEEG** (post-SEEG meeting): *SEEG interictal* — contacts marked in the Interictal tab (frequent spike group: “strong argument”; other group or lesional rhythm: “in favour”); *SEEG ictal* — onset contacts of the SEEG seizures taken into account (at the onset of at least half the seizures: “strong argument”, otherwise “in favour”); quantifications and stimulations. These columns are also added to columns carried over from a previous meeting; an SEEG column removed by hand does not come back.

    [[all regions]] also shows empty rows; [[+ column]] adds a modality.
6. **Hypotheses**: each hypothesis (regions, network, confidence level) is illustrated in 3D. A hypothesis revised at a later meeting keeps its history. [[+ from the model]] proposes networks ranked from **the whole concordance**, not just semiology:
    - the model's trajectories over all seizures get a **semiology** score (relative, from 0 to 1);
    - their epileptogenic zone and propagation get a **concordance** score from the other columns of the table (EEG, MRI, PET, neuropsychology, SEEG, manual cells included; a “−” cell lowers it);
    - a concordant zone (at least “++” or two “+” outside semiology) that no trajectory takes as its origin is proposed **from the concordance**.

    Both scores, and the arguments for and against, are shown; they are carried into the created hypothesis, which remains editable. The list follows the table: correcting a cell updates it.
7. **Decisions**: SEEG, second SEEG, thermocoagulation, surgery, laser, neuromodulation, further investigation, medical treatment, no surgery. An SEEG decision creates the SEEG exploration with an implantation scheme; a surgery decision creates the procedure.
8. **Captures to show** and **conclusion**.

![Preparing the meeting: summary on the left, concordance on the right.](shot:staff-preparer)

### Slides {#les-diapositives}

The **Slides** card in *Prepare* lists the pages of the slideshow, in the order they will be shown. For each page: ◉ / ○ shows or hides it, ↑ ↓ moves it, a click on the title renames it, 💬 adds an MDT comment on the page. [[＋ Free page]] inserts a page of your own text; [[Automatic order]] returns to the proposed order. The slideshow is still built from the record: a page whose data disappears is flagged, not deleted.

!!! astuce
    Everything can also be edited during the meeting: a concordance cell, a hypothesis, a decision, and every piece of data shown in the slideshow (see [Editing or commenting during the meeting](#editer-ou-commenter-pendant-le-staff)). The report will follow.

## Presenting {#presenter}

[[▶ Present]] (or <kbd>F2</kbd>) shows the record full screen, as slides. <kbd>←</kbd> <kbd>→</kbd> to move on, the outline on the left to jump to a section, <kbd>Esc</kbd> to leave. Pages hidden in *Prepare* do not appear; renamed titles and free pages do.

The order follows the reasoning: patient presentation and question asked, clinical history, seizure summary then each seizure (timeline, sequence, video, model), scalp EEG and recordings, imaging (interactive slices), neuropsychology, for each SEEG the implantation, seizure-onset contacts, analyses, stimulations and thermocoagulations, then the concordance, hypotheses, decisions and conclusion.

Each slide carries a single message, readable from the back of the room:

- **Patient**: *Development* summarises the documented psychomotor milestones in a table with markers (within the reference window, slightly late, late), with small height, weight and BMI charts; scales without data are not shown. *History* gives personal history two thirds of the width, family history the remaining third, and laterality as pictograms (hand and Edinburgh score, pointing test, dominant eye, language dominance, family left-handedness). *Lifestyle* fills the slide with large cards. *Epilepsy history* shows the landmarks as tiles (age at first seizures, duration, longest seizure-free period…) followed by the descriptions; in edit mode each field can be edited ([[✎ Edit]]) or commented on.
- **Phase 1 EEG**: the *Interictal EEG* slide shows interictal findings only, under a banner of the exploration days where each interictal capture or recording is placed; clicking a thumbnail opens the captures as a slideshow, one per slide, like the media of a seizure. The *Electrophysiology summary* slide brings seizures and interictal findings together under the same banner.
- **Post-SEEG meeting**: the *Outcome of the previous meeting* slide recalls the concordance, hypotheses and conclusion of the meeting that decided the SEEG, before the implantation performed. The SEEG *Interictal* slide shows the marked contacts in 3D, one colour per category, with their legend.
- **Implantation**: [[2D schema]] replaces the 3D views with the classic schema, one hemisphere per page: Talairach grid (AC-PC, VAC and VPC lines; columns A to I, rows 1 to 12) with entry points and contacts in sagittal projection, oblique electrodes dashed; separate lateral surface, mesial surface and insula; list of electrodes. [[3D views]] returns to the usual views.
- **Concordance**: the table separates the left and right hemispheres, each row carries a brain thumbnail with the region coloured, and each column a pictogram. The twelve most concordant rows are shown (plus the hypothesis rows); [[all regions]] shows the rest.
- **Hypotheses**: they can be chosen and edited during the meeting. [[＋ Hypothesis ▾]], under the concordance, adds a hypothesis proposed from semiology and concordance, or an empty one; on a hypothesis slide, the command bar changes its status, confidence and side, its regions ([[✎ Regions]]), its title and arguments ([[✎ Title and arguments]], one line per argument). A hypothesis from a previous meeting is revised in this meeting (new version).

![An MDT slide. The outline on the left jumps to any section.](shot:staff-presenter)

During the presentation:

- [[▶ Review in 3D]] on a seizure opens its workspace; a button brings you back to the same slide;
- [[〰 Review the recording]] on a capture or a source line opens the recording at that moment (montage, filters, time base), then *Back to the presentation*;
- imaging slices remain interactive (wheel, zoom, contrast);
- double-clicking a page title renames it;
- [[◉ Snapshot]] saves the meeting **as presented** (see [The snapshot](#linstantane)).

### Editing or commenting during the meeting {#editer-ou-commenter-pendant-le-staff}

[[✎ Edit]] (or <kbd>E</kbd>) switches the presentation to editing mode: two buttons appear under each piece of data shown (conclusion, text and domains of an investigation; history, lifestyle, epilepsy history, examination, handedness, treatments; meeting conclusion, hypotheses, decisions).

- [[✎ Edit]] **changes the data in the record**: the value opens in an input box ([[Save in the record]], or <kbd>Ctrl</kbd>+<kbd>Enter</kbd>). The whole record, the reports and later meetings see the new value; the log notes “changed during the staff meeting”.
- [[💬 Comment]] **adds an MDT comment without changing the data**: it appears right under it, in this meeting and in later meetings (“staff meeting of 21/11/2026”), which therefore see the original data and the comment. Comments of the current meeting can be edited (✎) or moved to the bin (✕); those of earlier meetings are read-only.
- [[💬 Comment on the page]], at the top of the page, comments on the whole page (a seizure, the interictal EEG, an SEEG page…).

In editing mode the page scrolls instead of being split, and the arrow keys do not change page while typing. <kbd>E</kbd> or [[✓ Done]] returns to the presentation; comments stay visible, buttons disappear.

### The snapshot {#linstantane}

A meeting is a moment: reopened months later, the slideshow would show the record as it has become. [[◉ Snapshot]] therefore keeps each page **as it was shown**, with its data, changes and comments. Several snapshots are possible; the **Slides** card › *Snapshots* lists them and reopens them read-only (“Snapshot of 21/11/2026”). The record itself stays editable.

## The report {#le-compte-rendu}

The [[MDT report]] button (in place of *Report* in the top bar) produces the meeting report: question, participants, summary, concordance, hypotheses, decisions and conclusion, with the 3D views. **MDT comments** appear where the commented data is (under an investigation's conclusion, under a seizure's section…), not at the end of the document; data changed during the meeting appears with its new value. The report window offers to **hide the patient's name** (code instead) for a report leaving the department. It is downloaded as an HTML file; open it in the browser and <kbd>Ctrl</kbd>+<kbd>P</kbd> prints it or saves it as PDF. [[Copy the text]] in *Prepare* copies the summary as plain text, for a letter.

??? plus
    **Several meetings?** Each meeting is a stage; a post-SEEG meeting takes over the hypotheses of the previous meeting (revised or not) and the concordance cells entered by hand. **Surgical proposal**: a surgery decision offers standard procedures (anterior temporal lobectomy, tailored resection, disconnection…) and shows, on the brain, how the retained hypotheses are covered.
