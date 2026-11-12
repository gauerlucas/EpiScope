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
    - **Where?** The **Phase 1** stage of the pathway. Tabs: *Interictal · Seizures · EEG analyses · Summary · Gallery*.
    - **Minimum**: describe the habitual seizures. The EEG report and recordings are a bonus.
    - **Time**: three to five minutes per seizure with the video.

## The seizures of the exploration {#les-crises-de-lexploration}

The [[Seizures]] tab lists the phase 1 seizures: date and time, habitual or not, vigilance, sequence of signs. [[+ Seizure]] adds one; [[open]] opens its entry screen. At the bottom of the tab:

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

[[Video +]] links a video from the gallery (or imports one). It is shown to the left of the 3D view and drives the stopwatch: clicking the picture pauses it, you choose the sign, and it is time-stamped at the video time; <kbd>Space</kbd> resumes; [[⟲ 0]] sets t = 0 at the displayed frame. The timeline, the arrow keys and the sequence move the video.

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
- **10-20 map** of spikes and slow waves: intensity 1 to 3 per electrode, rendered as an amplitude map, with the topography written out ("left frontopolar and frontal (max. Fp1)");
- interictal **recordings and screenshots**, dated, awake or asleep (<kbd>Ctrl</kbd>+<kbd>V</kbd>).

![Interictal EEG: report, activation procedures and 10-20 maps.](shot:phase1-inter)

## Scalp EEG {#leeg-de-scalp}

The [[EEG analyses]] tab receives the **recordings** themselves: EDF, EDF+, BDF, BrainVision, Brainquick or Micromed exports. [[+ Import a recording…]], or drop the files on the card. Each recording is filed by recording day; a seizure of the record whose time falls within the recording is linked to it automatically.

Under each recording appear its post-processing results: spikes and clusters, hypnogram, source imaging, page captures.

!!! attention
    A recording's title is taken from the file name, which sometimes contains the patient's name. Rename it ([[⋯]] on the card › *Rename…*): this title appears at the MDT meeting and in the reports.

![A recording card: linked seizures, detected spikes, sleep, sources.](shot:phase1-analyses)

### Reviewing a recording {#relire-un-trace}

[[Review]] opens the full-screen viewer:

- montage (monopolar, double banana, transverse, average reference, Laplacian), page of 2 to 60 s, gain (<kbd>Ctrl</kbd>+wheel), high-pass, low-pass and notch filters;
- <kbd>←</kbd> <kbd>→</kbd>: previous or next page (<kbd>Shift</kbd>: one second); drag to scroll;
- right-click: mark seizure onset or end, place a marker;
- the overview at the bottom shows the whole recording; click to go there.

![The recording viewer.](shot:eeg-viewer)

### Spikes and source imaging {#pointes-et-imagerie-de-source}

{refs: spikenet janca sloreta lcmv}

In the viewer, **Quantification** panel › [[Spikes → source]]:

1. **Detect**: SpikeNet (a network trained on thousands of EEGs annotated by experts) scans the recording; the threshold is adjustable (0.5 = the majority of experts).
2. **Review the clusters**: spikes are grouped by topography, each cluster with its averaged spike and its map. Merge, split, or delete an artefact cluster.
3. **Edit**: remove a wrongly detected spike (<kbd>Delete</kbd> or right-click), add a missed one (right-click › *Add a spike here*). Manual additions are marked ◆ and can be browsed separately.
4. **Find the source**: sLORETA, equivalent dipole and LCMV beamformer, on the patient's anatomy if available (BEM head model), otherwise on the template.

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
