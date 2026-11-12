---
id: m-eeg
title: "Methods: scalp EEG"
short: "Methods: EEG"
group: more
order: 20
lead: Spike detection, clusters of similar topography, source imaging and sleep staging. Each method is rewritten to run in the browser, without a server.
---

# Methods: scalp EEG

!!! bref
    - **Spikes**: SpikeNet (expert level on scalp EEG), Janča (intracranial), optional filter learned from your review.
    - **Source**: sLORETA, equivalent dipole and LCMV, on a BEM head model of the patient.
    - **Sleep**: YASA, then epoch-by-epoch review.

## Spike detection {#detection-des-pointes}

{refs: spikenet janca}

**SpikeNet** is the default detector for scalp recordings. It is a convolutional network trained on 9,571 scalp EEGs and 13,262 candidate spikes annotated by eight neurophysiologists; its output is calibrated as the proportion of experts who would label the window as a spike (area under the curve 0.98, at expert level). The weights published by the authors are embedded (CC BY-NC 4.0 licence: non-commercial use). It uses the 19 electrodes of the 10-20 system (up to four missing ones are interpolated), 1 s windows, and an adjustable threshold (0.5 = majority of experts).

The **Janča** detector (modelling of the signal envelope distribution) is used for intracranial recordings, and is an option for scalp EEG.

**Patient-specific filter** (optional, "Learn from my review"): after reviewing the clusters, a classifier trained on your choices removes detections that resemble the rejected ones. It only removes, and is kept only if cross-validation retains at least 85% of the kept spikes. Spikes added by hand are not used as examples.

## Clusters and averaged spike {#groupes-et-pointe-moyennee}

Spikes are gathered into **clusters of similar topography** (at least three spikes). Each cluster has its averaged spike, its map and its rate per minute. Clusters can be merged, split or deleted; each spike can be removed or added by hand.

## Source imaging {#imagerie-de-source}

{refs: sloreta lcmv openmeeg parradiaz}

The source is sought at the **mid-rise** of the averaged spike (where the initial generator dominates propagation), with three complementary methods:

- **sLORETA**: a normalised distributed solution on the cortex;
- **equivalent dipole**: a single generator, with its goodness of fit (GOF) and a confidence ellipse;
- **LCMV beamformer**: a minimum-variance spatial filter.

The **head model** is a three-layer BEM (scalp, skull, brain) built on the patient's anatomy when available, otherwise on the template; scalp electrodes are placed on the patient's head. Lobar concordance of the methods is flagged: it increases confidence.

!!! attention
    With 19 to 25 electrodes, spatial resolution is at the lobar or sub-lobar level. A deep or extended generator may be mislocalised; a source that disagrees with the rest of the record should prompt a review of the spikes.

## Sleep staging {#stadification-du-sommeil}

{refs: yasa}

**YASA** scores each 30 s epoch (wake, N1, N2, N3, REM) from a central EEG channel, with EOG and EMG if available. Evaluated on public nights scored by experts: 82% agreement (κ 0.76) on three Sleep-EDF nights, 73% (κ 0.62) on the YASA example night; N1 and transitions are the least reliable, as in the literature. Hence the epoch-by-epoch review.
