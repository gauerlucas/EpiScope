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
4. **Summary**: a summary of the record written from the data, and the consensus semiology of the selected seizures.
5. **Anatomo-electro-clinical concordance**: a table of *anatomo-functional systems × modalities* (semiology, interictal and ictal EEG, MRI, PET, neuropsychology, SEEG). Four columns are **pre-filled** from the record (seizure consensus, lesions, quantifications, stimulations); each cell remains editable with a click. [[all regions]] also shows empty rows; [[+ column]] adds a modality.
6. **Hypotheses**: each hypothesis (regions, network, confidence level) is illustrated in 3D. A hypothesis revised at a later meeting keeps its history.
7. **Decisions**: SEEG, second SEEG, thermocoagulation, surgery, laser, neuromodulation, further investigation, medical treatment, no surgery. An SEEG decision creates the SEEG exploration with an implantation scheme; a surgery decision creates the procedure.
8. **Captures to show** and **conclusion**.

![Preparing the meeting: summary on the left, concordance on the right.](shot:staff-preparer)

!!! astuce
    Everything can also be edited during the meeting: a concordance cell, a hypothesis, a decision. The report will follow.

## Presenting {#presenter}

[[▶ Present]] (or <kbd>F2</kbd>) shows the record full screen, as slides, with no editing buttons. <kbd>←</kbd> <kbd>→</kbd> to move on, the outline on the left to jump to a section, <kbd>Esc</kbd> to leave.

The order follows the reasoning: patient presentation and question asked, clinical history, seizure summary then each seizure (timeline, sequence, video, model), scalp EEG and recordings, imaging (interactive slices), neuropsychology, for each SEEG the implantation, seizure-onset contacts, analyses, stimulations and thermocoagulations, then the concordance, hypotheses, decisions and conclusion.

![An MDT slide. The outline on the left jumps to any section.](shot:staff-presenter)

During the presentation:

- [[▶ Review in 3D]] on a seizure opens its workspace; a button brings you back to the same slide;
- [[〰 Review the recording]] on a capture or a source line opens the recording at that moment (montage, filters, time base), then *Back to the presentation*;
- imaging slices remain interactive (wheel, zoom, contrast).

## The report {#le-compte-rendu}

The [[MDT report]] button (in place of *Report* in the top bar) produces the meeting report: question, participants, summary, concordance, hypotheses, decisions and conclusion, with the 3D views. It is downloaded as an HTML file; open it in the browser and <kbd>Ctrl</kbd>+<kbd>P</kbd> prints it or saves it as PDF. [[Copy the text]] in *Prepare* copies the summary as plain text, for a letter.

??? plus
    **Several meetings?** Each meeting is a stage; a post-SEEG meeting takes over the hypotheses of the previous meeting (revised or not) and the concordance cells entered by hand. **Surgical proposal**: a surgery decision offers standard procedures (anterior temporal lobectomy, tailored resection, disconnection…) and shows, on the brain, how the retained hypotheses are covered.
