---
id: ecran
title: Finding your way around
short: Finding your way around
group: start
order: 30
lead: Every EpiScope screen is built the same way: a top bar for the patient's pathway, a tab bar for the views of the current stage, then the workspace.
---

# Finding your way around

!!! bref
    - **At the top**: the patient and their pathway, stage by stage.
    - **Just below**: the views of the open stage.
    - **In the middle**: a form, or the 3D brain with its panels.

![Screen landmarks. ① patient list; ② open patient; ③ patient pathway; ④ add a stage; ⑤ report for the stage; ⑥ save status; ⑦ light or dark theme; ⑧ help; ⑨ main menu; ⑩ views of the stage.](shot:ecran-reperes)

## The top bar

| Item | Role |
|---|---|
| [[Patients]] | Back to the patient list (<kbd>F9</kbd>). |
| Patient name ▾ | Export the record, switch patient. |
| Pathway | The patient's stages in chronological order: Record, Phase 1, MDT meeting, SEEG, Surgery, Follow-up. The coloured dot shows the status (ongoing, completed). |
| [[+]] | Adds a stage: scalp video-EEG, SEEG, MDT meeting, surgery or other procedure, follow-up, other exploration. |
| [[Report]] | Produces the document for the open stage. Its name changes with the stage: *Record report*, *Phase 1 report*, *SEEG report*, *MDT report*. |
| ● | Green: saved. Blue: saving. Red: problem (record open elsewhere, disk full). |
| [[◐]] | Light or dark theme. Imaging views always stay on a black background. |
| [[?]] | Opens this manual at the page for the current screen (<kbd>F1</kbd>). |
| [[⋯]] | Import or export, reference database, display density, **user manual**, credits, legal notice, **language**. |

## The views of a stage

Under the top bar, each stage has its tabs, in the order they are used. For an SEEG, for example: *Planning · Localisation · Interictal · Seizures · Analyses · Stimulations · Thermocoagulations · Gallery · SEEG report*. The number in front of each SEEG tab recalls the usual order of work.

## The 3D workspace

The views that show the brain (a seizure, planning, analyses, stimulations, thermocoagulations) share the same workspace:

- **on the left**, data entry (the signs of a seizure, for example);
- **in the middle**, the 3D view with its toolbar;
- **on the right**, the analysis panel and its tabs;
- **at the bottom**, for a seizure, the sign timeline.

![A seizure workspace. The panels collapse (‹ ›) to enlarge the 3D view.](shot:crise-workspace)

### The 3D view toolbar

| Button | Effect |
|---|---|
| [[1 view ▾]] | One view, two views, four faces or mosaic. Each view keeps its own settings. |
| [[L lat.]] [[L med.]] … [[Post.]] | Orientation: lateral or medial view of each hemisphere, top, bottom, front, back. |
| [[Template]] / [[Patient]] | Average brain (fsaverage) or the patient's anatomy, if it has been computed. |
| [[Display ▾]] | Cortex inflation, opacity, deep structures, network, electrodes, labels. |
| [[MRI slices]] | Opens the patient's slices next to the 3D view, synchronised with it. |
| [[Capture ▾]] | Image of the view, to paste into a document or file in the gallery. |

### With the mouse

- **Drag**: rotate the brain. **Right-drag**: move. **Wheel**: zoom.
- **Hover over a region**: its name and its plausibility at the displayed time; hover over a contact: its electrode, its region and, in SEEG, what was measured there.
- The orientation buttons ([[L lat.]], [[Sup.]]…) straighten the view.

## The slices

Wherever MRI slices are shown (Imaging screen, [[MRI slices]] panel, localisation, stimulations), the same gestures apply, as in MRIcroGL: the wheel moves to the next slice, <kbd>Ctrl</kbd>+wheel zooms around the crosshair, double-click reframes, <kbd>Shift</kbd>+drag adjusts contrast. Details in [Reading the slices](@imagerie#lire-les-coupes).

## Adapting the display

- **Density**: [[⋯]] › *Display density*: compact for a laptop, large for a big screen or a projector.
- **Language**: [[⋯]] › *Language*: French or English. The choice is remembered on this computer.
- **3D presentation mode**: <kbd>F2</kbd> outside an MDT meeting shows the 3D view alone, full screen.

??? plus
    Keyboard shortcuts are gathered on the [Keyboard shortcuts](@raccourcis) page. The ones people remember quickly: <kbd>F9</kbd> patients, <kbd>F4</kbd> record, <kbd>F7</kbd> imaging, <kbd>F6</kbd> MDT meeting, <kbd>F2</kbd> present, <kbd>F1</kbd> help.
