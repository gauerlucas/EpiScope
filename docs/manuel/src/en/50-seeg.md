---
id: seeg
title: SEEG
group: path
order: 50
lead: From planning to report: implantation scheme, actual electrodes on the CT, seizures contact by contact, recordings and epileptogenicity index, stimulations, thermocoagulations.
---

# SEEG

!!! bref
    - **Where?** The **SEEG** stage of the pathway, created by an MDT decision or by [[+]] › *SEEG*.
    - **The tabs follow the order of work**: 1 Planning · 2 Localisation · 3 Interictal · 4 Seizures · 5 Analyses · 6 Stimulations · 7 Thermocoagulations · 8 Gallery · 9 SEEG report.
    - **Nothing is mandatory**: you may enter only the stimulations, or only the report.

## Planning {#planifier}

The [[Planning]] tab shows the implantation scheme in 3D and its list of electrodes. At the top, the **status of the scheme** (proposed, planned, actual) and the **coverage of the hypotheses** from the MDT meeting: each hypothesis states whether its origin zone is sampled.

- [[Propose ▾]]: EpiScope picks, among conventional trajectories (Talairach and Bancaud nomenclature, prime = left), the smallest set that samples the origins, symptomatogenic zones and relays of the hypotheses, without crossings.
- [[+ On click]]: add an electrode by clicking its target; [[+ Type ▾]]: a conventional trajectory by name.
- Electrode **model** and brand (DIXI, Alcis): contacts are placed at the catalogue dimensions.
- [[Import the surgical plan…]]: once the trajectories are set by the neurosurgeon, read a ROSA export (`.ros`), a CSV (name, entry, target) or a BIDS `electrodes.tsv`. Each trajectory is matched by name to the scheme's electrode.

![Planning: the scheme in 3D, hypothesis coverage and the electrode list.](shot:seeg-planif)

## Localising the electrodes {#localiser-les-electrodes}

The [[Localisation]] tab places the **actual electrodes** on the post-implantation CT, in two steps:

1. **Post-implantation CT**: import the CT (or choose the one already imported in Record › Imaging); it is registered to the T1.
2. **Reconstruction and check**: [[Detect]] finds the metal, traces the electrodes and places the contacts at the model's dimensions; names are matched to the planned scheme. A summary at the top lists the electrodes found, missing, outside the scheme or duplicated.

Then, **one electrode at a time**: clicking an electrode aligns the slices on its axis (contacts circled and numbered on the metal, planned trajectory dotted). Correct the number of contacts, the model or the name, then [[✓]] validates it. [[+ by hand]] traces an electrode the detection missed (tip then entry on the slices).

![Localisation: the electrode list with its status, slices aligned on the selected electrode.](shot:seeg-loc)

!!! attention
    Detection is automatic: check each electrode (tip, number of contacts, model) before validating it. The CT is registered rigidly; brain shift after implantation is not corrected.

## SEEG interictal activity {#lintercritique-seeg}

The [[Interictal]] tab holds the report: acquisition, background rhythm awake and asleep, physiological activity, slow focus, pathological graphoelements by contact, and a table **per electrode** (contact locations from the patient's parcellation, recorded activity). Each section has its standard sentences ([[sentences ▾]]).

## SEEG seizures {#les-crises-seeg}

An SEEG seizure is described as in phase 1 (semiology, timeline). The [[Electrical]] tab, first in the right-hand panel, marks **contact by contact**:

- seizure **onset**, **early** and **late** propagation (repeated clicks on the contact chips);
- the onset pattern (low-voltage fast activity, rhythmic spikes, DC shift…) and an electrical and clinical description.

Marked contacts appear in 3D and feed the concordance, the suggested report zones and the MDT meeting.

![An SEEG seizure: the Electrical tab, onset and propagation contacts marked on the electrodes.](shot:seeg-crise)

## Analysing the recordings {#analyser-les-traces}

{refs: ei cei pei h2 grinenko david delphos}

The [[Analyses]] tab receives the **SEEG recordings** (EDF, BrainVision, Brainquick and Micromed exports, BIDS iEEG): [[+ Import a recording…]]. Recordings are filed under *Seizures* and *Interictal*; a seizure recording is linked to its seizure.

[[Open]] launches the viewer (monopolar or bipolar montage, page, gain, filters, displayed electrodes). Then, in the **Quantification** panel:

- **EI**, the epileptogenicity index (Bartolomei 2008): the window runs from the annotated seizure onset to its end (file markers, or right-click on the recording); the EI is computed in a few seconds and shown under the recording, contact by contact: **≥ 0.4 in red** (epileptogenic zone), 0.1 to 0.4 in orange;
- other methods in the neighbouring tabs: **cEI**, **PEI**, **h²** (connectivity), **Fingerprint** (Grinenko 2018), **EM** (epileptogenicity maps, David 2011), **Spikes · HFO** (Delphos);
- [[Save in Analyses (3D)]] turns the result into **values on the contacts**: coloured spheres in 3D, regions coloured on the parcellation, slices;
- with at least two seizures, **EImax** (or cEImax, PEImax) keeps the maximum value of each contact.

![The SEEG viewer and the EI panel: energy ratio under the recording, detections, channel table.](shot:seeg-ei)

![Values on the contacts in 3D and on the slices.](shot:seeg-analyses)

The methods are described in [Methods: SEEG](@m-seeg).

## Stimulations {#stimulations}

The [[Stimulations]] tab: two 3D views and the slice of the electrode along its axis. To enter a stimulation:

1. choose the **pair** (electrode chips, or click a contact in 3D);
2. the **mode** (50 Hz train or 1 Hz pulses, usual parameters pre-filled) and the **intensity** (± buttons);
3. the **response**: none, functional, subjective (with the sign; *habitual* if so), afterdischarge, seizure;
4. [[Save]], or [[Save, +0.5 mA]] for the next stimulation on the same pair.

Responses are shown as coloured dots on the electrodes; the log lists all stimulations.

![Stimulations: selected pair, electrode slice, colour-coded responses.](shot:seeg-stim)

## Thermocoagulations {#thermocoagulations}

The [[Thermocoagulations]] tab: quick entry ("Ia 1-3, OC 4-7" expands into contiguous pairs), or chips per electrode. Each target goes through the *planned*, *validated*, *performed* (or *rejected*) stages, with date, surgeon and a note. The reminder of each pair's stimulations and the report zones (epileptogenic in red, early propagation in orange) help not to forget a target.

![Thermocoagulations: targets by stage, volumes in 3D, stimulation results.](shot:seeg-thermo)

## The SEEG report {#le-rapport-seeg}

The [[SEEG report]] tab prepares the report:

- **Collected data**: what has been entered, with a link to what is missing;
- **Header**: monitoring dates, reason for referral, treatment, recording conditions;
- **Zones as VEP regions**: epileptogenic zone and early propagation zone, suggested from the seizure onset and propagation contacts, editable;
- **Summary and conclusion**: lesional, irritative and onset zones, EI, epileptogenic zone, functional zone, limitations; each section can be **suggested** from the data, then reviewed.

[[Generate the SEEG report]] produces the document (implantation schemes, analyses, seizures, stimulations, thermocoagulations, conclusion).

![The SEEG report: collected data, header, suggested sections.](shot:seeg-rapport)
