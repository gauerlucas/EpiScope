---
id: demarrage
title: Quick start
short: Quick start (10 min)
group: start
order: 10
lead: Six steps, ten minutes. By the end you will have a patient, a seizure described sign by sign, the candidate regions in 3D and an MDT meeting ready to present.
---

# Quick start

!!! bref
    - **You need**: Edge or Chrome, the file `EpiScope.html` and, ideally, a seizure video (on another screen or computer).
    - **You will learn**: to create a patient, enter a seizure, read the result, present the record at the MDT meeting, produce a report.
    - **You can stop** after any step: everything is already saved.

<div class="steps" markdown>

1. **Open EpiScope** <span class="time">1 min</span>

    Double-click `EpiScope.html`. On the very first launch, EpiScope asks where to keep the records: choose a folder (on your disk or on the department's shared drive). One sub-folder per patient will be created there. You land on the **patient list**.

    ![The patient list. [[+ New patient]] at the top right; [[Open]] on each row.](shot:library)

2. **Create a patient** <span class="time">30 s</span>

    Click [[+ New patient]] and type a pseudonym (for example `STR-0042`). The record opens on its **Summary**, and the patient's pathway starts with a **Phase 1**.

    !!! attention
        Do not use the patient's name as the pseudonym if the folder is shared with other teams or if you intend to send the record.

3. **Describe a seizure** <span class="time">4 min</span>

    Click the **Phase 1** stage in the top bar, then the [[Seizures]] tab and [[+ Seizure]]. The entry screen opens.

    - Start the seizure video and press <kbd>Space</kbd> at the first sign: that is t = 0. The stopwatch runs with the video; <kbd>Space</kbd> pauses and resumes it.
    - For each sign, type its first letters ("epig", "automat", "dyston"…) then <kbd>Enter</kbd>. The sign is time-stamped at the stopwatch time.
    - Keys <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> set the side of the next sign: left, right, bilateral, unknown.

    ![A seizure screen: entry on the left, the 3D brain in the middle, results on the right, the sign timeline at the bottom.](shot:crise-workspace)

    No video at hand? Choose [[Sequence]] mode (the order of signs is enough) or [[Manual]] mode (times copied from a report).

4. **Read the result** <span class="time">2 min</span>

    Press [[▶ Play]]: the seizure replays on the brain. Regions light up as they become plausible and the network is drawn between them. On the right:

    - [[Network at t]] lists the regions plausibly active at the displayed time;
    - [[Origin]] ranks the regions the seizure may have started from, with lateralisation;
    - [[Targets]] lists the regions consistent with the hypotheses, for discussion if an SEEG is considered.

    ![The Origin tab: candidate regions and lateralisation, recomputed with each new sign.](shot:crise-origine)

5. **Prepare and present the MDT meeting** <span class="time">2 min</span>

    Click [[+]] at the end of the pathway, then **MDT meeting**. The [[Prepare]] tab gathers the question asked, the summary, the concordance table (already pre-filled from the record), the hypotheses and the decision. On the day, [[▶ Present]] (or <kbd>F2</kbd>) shows the record full screen as slides, without a single editing button.

    ![The MDT slideshow: built from the record, nothing to prepare by hand.](shot:staff-presenter)

6. **Produce the report** <span class="time">30 s</span>

    The [[Report]] button in the top bar produces the document for the open stage: record report, phase 1 report, SEEG report or MDT report. It is downloaded as a self-contained HTML file: open it and it displays in the browser; <kbd>Ctrl</kbd>+<kbd>P</kbd> saves it as PDF.

</div>

## What next?

You now know the essentials. Depending on what you want to do:

<div class="cards" markdown>

- [**Add the EEG** Report, 10-20 map, EDF recordings, spike detection.](@phase1#leeg-de-scalp)
- [**Add imaging** MRI, PET and CT, the patient's anatomy in 3D.](@imagerie)
- [**Prepare an SEEG** Hypotheses, implantation scheme, actual electrodes.](@seeg)
- [**Find your way around the screen** The top bar buttons and the 3D views.](@ecran)

</div>
