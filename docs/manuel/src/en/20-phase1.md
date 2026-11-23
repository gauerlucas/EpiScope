---
id: phase1
title: "Phase 1: seizures and scalp EEG"
short: Phase 1 (video-EEG)
group: path
order: 20
lead: Phase 1 gathers the seizures recorded on video-EEG, their semiology sign by sign, the scalp EEG and its summary. It is the heart of EpiScope.
---

# Phase 1: seizures and scalp EEG

!!! bref
    - **Where?** The **Phase 1** stage of the pathway. Tabs: *Overview · Interictal · Seizures · Analyses · Summary · Gallery*.
    - **Minimum**: describe the habitual seizures. The EEG report and recordings are a bonus.
    - **Time**: three to five minutes per seizure with the video.

## Overview {#vue-densemble}

The [[Overview]] tab opens first. It gathers what the investigation is and where it stands:

- **label, start and end dates, centre, status** and **notes** (course, drug withdrawal, incidents; the notes of the former “sessions” were moved here);
- the **counters** (habitual and described seizures, recordings, videos) and the report status (background, interictal, ictal, conclusion);
- a **timeline** of the investigation days (D1, D2…): imported recordings as bars at real time (purple: with a seizure, blue: interictal), seizures as diamonds (filled: described; empty: to describe). Clicking a seizure opens it. An attached reported seizure dated far from the investigation is listed under the timeline without stretching it;
- the **list of seizures** and the list of **imported recordings**, with links to the [[Seizures]] and [[Analyses]] tabs.

## The seizures of the exploration {#les-crises-de-lexploration}

The [[Seizures]] tab lists the phase 1 seizures, grouped by recording day (D1, D2… from their date): date and time, habitual or not, vigilance, sequence of signs. [[+ Seizure]] adds one; [[open]] opens its entry screen; [[⋯]] › [[Attach a reported seizure of the record…]] files there a home video described before admission (see [reported seizures](10-patients.md#les-crises-rapportees)). At the bottom of the tab:

Each seizure carries four **status chips**: *semiology* (number of signs, or “to describe”), *video*, *recording* (seizure onset marked, or “onset?”) and *analyses*. Over one or two weeks of video-EEG, the seizures quantified but not yet described, and the reverse, are visible at a glance.

- **Seizures annotated in the recordings**: seizure onsets found in the imported files (a night may hold several) appear at the top of the tab when they have no seizure entry. [[create the seizure]] creates the seizure at the recording time and marks the onset there (and the end if annotated); [[attach to …]] links it to the seizure already entered at the same time (within 2 min). Two overlapping exports (the whole night and a seizure segment, for example) are flagged, and the seizure is counted only once.
- **Copying the semiology**: [[⋯]] of a seizure › [[Copy the semiology of…]] copies the signs of another seizure of the record (stereotyped seizures, reported seizure), with their timing; the markers then only need adjusting. The previous state stays in the record history.

- **Ictal EEG** and **postictal** EEG: one description for all seizures, with standard sentences ([[sentences ▾]]) and a suggested text ([[propose]]);
- **Recorded events**: epileptic seizures, functional (dissociative) seizures, other events (faint, parasomnia, panic attack…);
- the **10-20 map** of seizure onset: clicking an electrode increases the intensity, right-click clears it.

![The Seizures tab: the list, the ictal EEG and the seizure-onset map.](shot:phase1-crises)

## Describing a seizure {#decrire-une-crise}

A seizure screen has three columns and a timeline:

![① entry mode and stopwatch; ② side of the next sign; ③ search and sign palette; ④ entered sequence; ⑤ 3D view; ⑥ results; ⑦ timeline.](shot:crise-workspace-annot)

### Three entry modes

| Mode | When to use it |
|---|---|
| [[Stopwatch]] | You are watching the video. <kbd>Space</kbd> starts the stopwatch at the first sign (t = 0), pauses and resumes it with the video. Each sign is time-stamped at the stopwatch time. |
| [[Sequence]] | You know the order of signs but not their timing. Signs are evenly spaced. |
| [[Manual]] | You copy the times from a report. |

### Adding a sign

- Type a few letters in the search box ("fear", "automat", "version"), then <kbd>Enter</kbd>. The vocabulary follows the ILAE glossary; common synonyms are recognised.
- Or click a chip in the palette, sorted by category (auras, cognitive and emotional signs, motor signs, automatisms, autonomic signs, postictal signs).
- The **side** is set beforehand (keys <kbd>1</kbd> left, <kbd>2</kbd> right, <kbd>3</kbd> bilateral, <kbd>4</kbd> unknown, or the [[Left]] [[Right]] [[Bilat.]] [[?]] buttons) or afterwards, in the sequence. For signs that have one, a **topography** is offered (face, upper limb…).

!!! astuce
    As soon as you type a letter, the cursor jumps to the search box: no need to click it.

### With the video inside EpiScope

[[Video +]] links a video from the gallery (or imports one). It is shown to the left of the 3D view and drives the stopwatch: clicking the picture pauses it, you choose the sign, and it is time-stamped at the video time; <kbd>Space</kbd> resumes; [[⟲ 0]] sets t = 0 at the displayed frame. The timeline, the arrow keys and the sequence move the video. If a video aligned on the recordings’ clock covers the seizure onset, it is found automatically, already positioned at the onset (see [Video and recording](#video-et-trace)).

### Correcting the sequence {#corriger-la-sequence}

The timeline at the bottom works like a video editor:

- **drag the middle** of a bar to move it, **drag an edge** to change the start or end (0.1 s steps, snapping to the playhead and to other signs; <kbd>Alt</kbd> to disable snapping);
- **right-click** a sign (timeline or sequence): side, topography, certainty;
- **double-click**: all its parameters;
- ⋮⋮ handle in the sequence: reorder; <kbd>Delete</kbd>: remove the selected sign.

The **EEG onset / end** fields at the top left place the electrical onset relative to the first clinical sign (negative if the EEG precedes the clinical onset): clinical latency is part of the reasoning.

![The timeline: each sign is a bar you can move or stretch.](shot:crise-frise)

## Reading the result {#lire-le-resultat}

[[▶ Play]] (or <kbd>Shift</kbd>+<kbd>Space</kbd>) replays the seizure: regions light up as they become plausible, the network is drawn between them. The <kbd>←</kbd> <kbd>→</kbd> keys step by half a second.

The right-hand panel has four tabs:

| Tab | What it shows |
|---|---|
| [[Network at t]] | Regions plausibly active at the displayed time, with their score (0 to 1) and the sign that supports them (*direct evidence*, *relay*, *propagation*). |
| [[Origin]] | Regions the seizure may have started from, ranked, with lateralisation (left / right bar) and network hypotheses H1 to H4. A region with no sign of its own is flagged "silent?". |
| [[Targets]] | Regions to sample if an SEEG is considered: origin candidates, early symptomatogenic zones, relays. |
| [[Model]] | Computation settings and the ILAE classification of the seizure, derived from the sequence. |

![The Origin tab: candidate regions, lateralisation, network hypotheses.](shot:crise-origine)

!!! attention
    Scores measure a region's **compatibility** with the entered sequence, based on the literature. They are not probabilities of being the epileptogenic zone. See [The semiology → regions model](@m-semiologie).

[[‹]] [[›]] at the top of the screen move to the neighbouring seizure.

## Interictal EEG {#lintercritique}

The [[Interictal]] tab holds the interictal EEG report:

- **background rhythm** and **interictal abnormalities**, with standard sentences ([[sentences ▾]]) and texts suggested from the map ([[propose]]);
- **activation procedures**: photic stimulation (simple or detailed by frequency), hyperventilation, others (sleep deprivation, reading, mental arithmetic…);
- **10-20 maps** of spikes and slow waves, **during wakefulness and during sleep** (abnormalities and foci often differ): intensity 1 to 3 per electrode, rendered as an amplitude map, with the topography written out ("left frontopolar and frontal (max. Fp1)"). A map entered before version 2.0, without vigilance, stays displayed apart with [[→ wake]] and [[→ sleep]] to file it;
- interictal **recordings and screenshots**, dated, awake or asleep (<kbd>Ctrl</kbd>+<kbd>V</kbd>).

![Interictal EEG: report, activation procedures and 10-20 maps.](shot:phase1-inter)

## Scalp EEG {#leeg-de-scalp}

The [[Analyses]] tab receives the **recordings** themselves: EDF, EDF+, BDF, BrainVision, Brainquick or Micromed exports. [[+ Import a recording…]], or drop the files on the card. Recordings are split into **Ictal analyses** (recordings with a seizure, seizure summary) and **Interictal analyses** (spikes, sleep, sources), each filed by recording day; a long recording containing seizures is filed with the seizures and flagged in the interictal part. A seizure of the record whose time falls within the recording is linked to it automatically.

A recording that contains both seizures and interictal activity (a night, for example) appears in both parts: its ictal analyses with the seizures, its interictal analyses (spikes, clusters, spike sources, sleep) with the interictal part; the latter are also shown in the [[Interictal]] tab. The title of a recording (in the viewer) or [[⋯]] › [[Recording information…]] on its card opens its information: editable title, nature, vigilance and notes; start and end time, duration, blocks and gaps, channels, files and reading warnings in full.

Under each recording appear its post-processing results: spikes and clusters, hypnogram, source imaging, page captures.

!!! bref
    An imported recording is stored under a **BIDS name** based on the patient's code (`sub-HFAR0007_ses-scalp1_task-seizure_run-01_eeg.edf`) and gets a **neutral title** (“Seizure · 02/06/2021 23:30 · run 01”): the original file name, which often contains the patient's name, is kept nowhere. The title can be changed if needed ([[⋯]] on the card › *Rename…*).

![A recording card: linked seizures, detected spikes, sleep, sources.](shot:phase1-analyses)

### Reviewing a recording {#relire-un-trace}

[[Review]] opens the full-screen viewer:

- montage (monopolar, double banana, transverse, average reference, Laplacian), page of 2 to 60 s, gain (<kbd>Ctrl</kbd>+wheel), high-pass, low-pass and notch filters;
- EEG polarity convention: **negative up** (a negative deflection goes up, as in acquisition software);
- <kbd>←</kbd> <kbd>→</kbd>: previous or next page (<kbd>Shift</kbd>: one second); drag to scroll;
- right-click: mark seizure onset or end, place a marker; [[Markers ▾]] lists them to jump there;
- **wall-clock time**: the axis and the cursor show the acquisition computer's time (with the date after midnight); [[Clock]] | [[t]] switches to the time since the start of the recording.

The **timeline** at the bottom shows the whole recording, with the time ruler, the activity, the seizures (red bands, clickable), the gaps of a discontinuous EDF (hatched, with their duration) and the displayed page (yellow frame). Click or drag to go there; the **wheel** zooms around the pointer; [[⤢ whole recording]] or a double-click returns to the whole recording. The *seizure* menu at the top jumps to a seizure; the timeline keeps the overview.

!!! attention
    A **discontinuous** recording (EDF+D: pauses, gaps) is displayed block after block, without the holes; the wall-clock time takes the gaps into account. Every marker is also stored at its wall-clock time, which keeps it in place even if the way the file is read changes.

### Video and recording {#video-et-trace}

A gallery video can be **aligned** on the recordings’ clock: its start time is known, and each instant of the video corresponds to a time in the recording. Several videos can cover the same recording (several cameras, split files).

- **On import**: if the file name contains the start date and time (`…20210602_223543…`), the video is aligned straight away.
- **“Video time” window** (gallery: [[video time…]]; viewer: ⚙ on the video panel): the start time (`2021-06-02 22:03:43`, or just `22:03:43` with the recording's date), the linked recording, and **synchronisation points** — the same event found in the video and in the recording (movement artefact, clinical onset). One point corrects the offset; two or more distant points also correct the drift of the camera clock. The window shows the difference of each point and where each seizure falls: “Seizure 1 (22:05:00) → video at 1:17”, or “… before the start of the video”.
- **In the viewer**: [[▶ Video]] opens a panel (moved by its title bar, resized by its corner) that shows the video covering the cursor and follows it as you navigate; during playback, the recording follows the video. Outside any video, the panel shows “No aligned video at …”. [[📍 point]] adds a synchronisation point: put the video and the recording cursor on the same event, then click.
- Aligned videos appear as **blue bands** on the recording's timeline.

Example: recording started at 19:30, video started at 22:03:43, seizure marked at 22:01 in the recording: the window reports that the seizure is 2 min 43 s before the start of the video, and the panel shows “No aligned video at 22:01:00”.

![The recording viewer.](shot:eeg-viewer)

### Spikes and source imaging {#pointes-et-imagerie-de-source}

{refs: spikenet janca sloreta lcmv}

In the viewer, **Quantification** panel › [[Spikes → source]]:

1. **Detect**: SpikeNet (a network trained on thousands of EEGs annotated by experts) scans the recording; the threshold is adjustable (0.5 = the majority of experts).
2. **Review the clusters**: spikes are grouped by topography, each cluster with its averaged spike and its map. Merge, split, or delete an artefact cluster.
3. **Edit**: remove a wrongly detected spike (<kbd>Delete</kbd> or right-click), add a missed one (right-click › *Add a spike here*). Manual additions are marked ◆ and can be browsed separately. Without automatic detection, right-click › *Mark a spike here (manual averaging)*: the marked spikes form a cluster, averaged and localised like the others. On the trace, each spike of a selected cluster is surrounded by a 350 ms coloured band, with a thin line at the spike instant; the averaged spike (butterfly view) is drawn at the same time scale as the trace, so the graphoelement keeps its shape.
4. **Find the source**: sLORETA, equivalent dipole and LCMV beamformer, on the patient's anatomy if available (BEM head model), otherwise on the template.

**SpikeNet2** (Li et al., NEJM AI 2025), trained on more than 17,000 EEGs with hard-negative mining, can replace SpikeNet in [[Settings]] › detector. Its weights are not shipped with EpiScope: the BDSP (bdsp.io) distributes them under a restricted licence to credentialed users. A user who holds them adds them once with [[Add the SpikeNet2 weights…]] (or Patients › [[Settings]] › Added models) by choosing the authors' checkpoint (`new_weights.ckpt`, about 370 MB): EpiScope reads the network, checks it and stores it in the library (`models` folder, about 120 MB), never in a patient record or an export. Each detection records the fingerprint of the weights used. Computation is slower than SpikeNet (a few minutes per hour of EEG on a recent computer); the patient-specific filter remains specific to SpikeNet.

The [[Seizure onset → source]] tab does the same for the seizure-onset window (dominant frequency, components).

![Spikes → source: spike clusters, averaged spike, topography and source.](shot:spikes-esi)

### Sleep {#le-sommeil}

{refs: yasa}

The [[Sleep]] tab offers an automatic **hypnogram** (wake, N1, N2, N3, REM sleep) using YASA. The [[review and correct, epoch by epoch]] box steps through the recording in 30 s epochs: the <kbd>W</kbd> <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>R</kbd> keys score the epoch and move to the next one. Corrected epochs are marked in orange.

![The hypnogram, with seizures and spikes through the night.](shot:sleep)

## Phase 1 summary {#la-synthese-de-la-phase-1}

The [[Summary]] tab brings all seizures together: lateralisation and candidate origin regions **by consensus** (habitual seizures count double), a sign-by-sign comparison table, recurrent hypotheses, and a 3D view of the candidate regions and networks.

![The summary: seizure consensus and sign-by-sign comparison.](shot:phase1-synthese)

??? plus
    **Several scalp explorations?** [[+]] › *Scalp video-EEG* adds one; each has its own seizures, EEG and summary. **ILAE classification**: derived from the sequence (focal motor or non-motor onset, awareness, bilateral evolution) and remains editable.
