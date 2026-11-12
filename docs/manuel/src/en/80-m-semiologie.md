---
id: m-semiologie
title: The semiology → regions model
short: Semiology → regions
group: more
order: 10
lead: How EpiScope goes from a sequence of time-stamped signs to candidate regions and network hypotheses, what data it relies on, and what it does not do.
---

# The semiology → regions model

!!! bref
    - A sign is not a lobar label: it is the expression, at a given moment, of a discharge involving one or more **symptomatogenic zones**.
    - The **succession** of signs draws a trajectory through a network; the origin is the region that best explains the **whole** sequence, even if it is silent.
    - Scores are **plausibilities** derived from the literature, not probabilities of being the epileptogenic zone.

## The reasoning {#le-raisonnement}

{refs: talairach vepatlas semio2brain maillard2004}

EpiScope follows the anatomo-electro-clinical reading of the Sainte-Anne and Marseille schools (Talairach, Bancaud, Chauvel, Bartolomei). The brain is divided according to the **VEP atlas** (*Virtual Epileptic Patient*): 162 cortical regions and deep structures, designed for epilepsy.

For each region and each 0.5 s step, an **activation plausibility** (0 to 1) combines three sources:

1. **Direct evidence**: the reference database links each sign to the regions that can produce it (sign → region *priors*), weighted by the sign's lateralisation rule, the entered side, topography and certainty. It is blended with the statistical evidence of **Semio2Brain** (11,230 localisations in 4,643 patients, from 309 publications).
2. **Relays**: between two successive symptomatogenic zones, the most plausible connectivity path (neighbourhood, distance, known long-range links, patient connectome if loaded) is progressively activated.
3. **Propagation and persistence**: an active region stays active for a while, and the discharge reaches its neighbours.

Signs are read according to their **phase** (early, intermediate, late): late oroalimentary automatisms do not carry the same weight as early ones. Regions have a **role**: the basal ganglia or the thalamus are recruited but never proposed as the origin.

## Candidate origin regions {#les-regions-dorigine-candidates}

{refs: proix2017 bonini2014}

The ranking measures each region's ability to reach, through connectivity, the symptomatogenic zones of each sign, early signs weighing more. It integrates:

- overall **lateralisation** (votes of lateralising signs, including postictal ones);
- **clinical latency**: if the EEG onset clearly precedes the first sign, a silent origin one or two relays away from the first symptomatogenic zone is favoured;
- **order concordance**: symptomatogenic zones should appear further and further from the origin as signs follow one another; a sequence read backwards does not give the same hypotheses.

**Network hypotheses** (H1 to H4) are trajectories — origin, relays, zones in the order of the signs — named after the systems they cross ("cingulate → left temporal").

## Summary of several seizures {#la-synthese-de-plusieurs-crises}

The summary of an exploration builds a **consensus** across seizures (habitual seizures count double): candidate regions found from one seizure to the next, common lateralisation, recurrent hypotheses. It pre-fills the *Semiology* column of the concordance at the MDT meeting.

## The reference database {#la-base-de-reference}

{refs: ilae2022semio ilae2025 semio2brain}

The database is editable: [[⋯]] › *Reference database*. Each sign has its rows (VEP region, topography, weight, role, source, notes). Priors come from the SEEG and stimulation literature, the ILAE 2022 glossary and Semio2Brain, with a share of expert opinion flagged in the *source* column. See [Data and confidentiality](@donnees#la-base-de-reference).

## Limits {#limites}

- Priors are a starting point, meant to be discussed and corrected.
- No public database gives inter-sign latencies in seconds: the dynamics are inferred from the entered times, not learned.
- The VEP atlas has neither hypothalamus (gelastic seizures) nor brainstem.
- The normative connectome is geometric and curated, not tractographic.
- EpiScope feeds the discussion; it does not localise.
