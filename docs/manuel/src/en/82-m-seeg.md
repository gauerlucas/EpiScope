---
id: m-seeg
title: "Methods: SEEG"
short: "Methods: SEEG"
group: more
order: 30
lead: The quantifications of SEEG recordings, computed on the spot, without AnyWave or Matlab. For each: what it measures, its default settings and its reference.
---

# Methods: SEEG

!!! bref
    - **Seizure onset**: EI (energy ratio, delay), cEI (connectivity), PEI (entropy), Fingerprint (time-frequency), EM (high-frequency power).
    - **Interictal**: spikes, ripples and fast ripples (Delphos), h² node strength.
    - **Several seizures**: EImax, cEImax, PEImax (maximum value of each contact).

## Epileptogenicity index (EI) {#index-depileptogenicite-ei}

{refs: ei pagehinkley hinkley}

The energy ratio ER = (Eβ + Eγ) / (Eθ + Eα) is computed over a 1 s sliding window (θ 3.5–7.4; α 7.4–12.4; β 12.4–24; γ 24–97 Hz). The **Page–Hinkley** algorithm detects the change on each channel (bias ν and threshold λ adjustable, the EI follows live). The EI relates the energy accumulated 5 s after detection to the delay since the first detection, normalised to 1. By default, the analysis window runs from the annotated seizure onset to its end, with 10 s of baseline before onset. **EI ≥ 0.4**: epileptogenic zone (red); 0.1–0.4: propagation zone (orange).

## cEI, PEI, h² {#cei-pei-h}

{refs: cei pei permentropy h2 lagarde}

- **cEI**: out-degree of a directed h² network (12–45 Hz, 3 s windows), combined with the EI of the same window; highlighted from 0.6.
- **PEI**: permutation entropy (order 3) under each channel; ratio of the postictal maximum to the ictal minimum; computed directly if seizure onset and end are annotated.
- **h²**: non-linear connectivity (Wendling). On a seizure: directed links window by window, replayable in 3D. Interictally: node strength (mean of a channel's links).

## Epileptogenic zone fingerprint {#empreinte-de-la-zone-epileptogene}

{refs: grinenko li2020}

Time-frequency (Morlet wavelets, 1–200 Hz) from −20 to +20 s around onset, relative to a 40 s baseline. The three elements of the fingerprint — **preictal spikes**, **multiband fast activity**, **concurrent suppression** of lower frequencies — are detected with explicit thresholds; score from 0 to 1, weighted by delay (an early fingerprint outweighs a late one). Simplified detection, without the paper's classifier: to be checked on the time-frequency image.

## Epileptogenicity maps (EM) {#cartes-depileptogenicite-em}

{refs: david}

High-frequency power (120–200 Hz, or 60–100 Hz below 512 Hz) in 0.2 s blocks, t-test against the [−10, −1] s baseline, corrected p < 0.05 threshold. Delay of each channel, early or late channels, and a **map on the patient's MRI** (t spread into the brain, derived image added to the slice layers).

## Spikes and HFOs (Delphos) {#pointes-et-hfo-delphos}

{refs: delphos crossrate}

Delphos detector (wavelets, normalisation, island shape): spikes, ripples, fast ripples per minute and cross rate, spikes carrying an HFO, coupling with the slow wave. At 512 Hz, analysis stops around 159 Hz: fast ripples cannot be analysed (flagged).

## Values on the contacts {#valeurs-sur-les-plots}

Each saved result becomes an **analysis set**: one value per contact or pair, shown as coloured spheres in 3D, on the parcellation (maximum or mean value of the region) and on the slices. Values computed elsewhere (Excel, CSV) can be imported the same way.

## Further reading {#pour-aller-plus-loin}

{refs: isnard2018}
