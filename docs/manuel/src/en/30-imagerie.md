---
id: imagerie
title: Patient imaging
short: Imaging
group: path
order: 30
lead: The patient's MRI, PET, SPECT and CT, registered to each other, and the patient's brain in 3D with the VEP parcellation. No external software: everything is computed in the browser.
---

# Patient imaging

!!! bref
    - **Where?** Record › [[Imaging]] (<kbd>F7</kbd>).
    - **Minimum**: a 3D T1. It is the reference for all other images and for the patient's anatomy.
    - **Time**: one minute to import and register, one to two minutes for the patient's anatomy.

## Importing images {#importer-des-images}

Drop **NIfTI** files exported from the PACS onto the screen, or a **DICOM folder** directly (sub-folders included): series are sorted, the modality, time point (pre-operative, post-implantation, post-operative…) and date are guessed and editable, and 3D series are ticked by default. [[+ Images ▾]] does the same through a file picker.

The first pre-operative T1 becomes the **reference image** (*reference* badge). The other images are **registered** to it: [[Register all + anatomy]] runs the registration of every image and the computation of the patient's anatomy in one go.

![The Imaging screen: images by category on the left, slices in the middle, patient anatomy and post-processing on the right.](shot:imagerie)

!!! attention
    Compressed DICOM (JPEG, JPEG 2000) cannot be read: export uncompressed from the PACS, or convert to NIfTI.

### If registration fails {#si-le-recalage-echoue}

Each registration is checked on the slices, with the image overlaid on the T1. If it is wrong:

- [[landmarks…]]: point to the centre of the brain (and, if needed, AC, PC, a midline point) on the reference then on the image; EpiScope restarts from that position;
- [[adjust]]: a box around the head to correct position and scale by hand (useful in children between two distant scans).

## The patient's anatomy {#lanatomie-du-patient}

From the T1, EpiScope computes:

- the brain **segmentation** (grey matter, white matter, deep structures) with a neural network;
- the patient's **VEP parcellation** (162 cortical regions, 18 deep structures);
- the cortical **surfaces**, pial and inflated, for the 3D view.

The **Patient anatomy** card summarises the result and its quality control. [[View in 3D]] switches the 3D views to the patient's brain ([[Patient]] button in the view bar); [[VEP slices]] overlays the parcellation on the slices. [[Other method…]] offers other segmentations, or compares them side by side so you can choose by hand; a segmentation made elsewhere (FreeSurfer, FastSurfer, CAT12) can also be imported.

!!! astuce
    Once the anatomy is computed, everything in 3D (seizures, electrodes, stimulations, analyses) can be shown on the patient's brain instead of the average brain.

!!! attention
    The segmentation is automatic: check it on the slices, especially with an extensive lesion, a surgical cavity or a malformation.

## Reading the slices {#lire-les-coupes}

Slices are read as in MRIcroGL:

| Gesture | Effect |
|---|---|
| Click, drag | Move the crosshair (all three slices follow). |
| Wheel | Next slice. |
| <kbd>Ctrl</kbd>+wheel | Zoom around the crosshair. |
| <kbd>Shift</kbd>+drag, or ◐ tool | Contrast (↔) and brightness (↕). |
| Right-drag, or ✋ tool | Pan the image. |
| Double-click | Reframe. ⤢: one slice enlarged. |

The slice toolbar offers:

- [[Layers ▾]]: base image, stacked overlays (PET, FLAIR, CT) with colour map, opacity and window; parcellation; electrodes and ROIs;
- [[Multimodality ▾]]: fusion presets (PET on T1, FLAIR + PET…);
- [[Electrode ▾]]: align the slices on an electrode (see [Localising the electrodes](@seeg#localiser-les-electrodes));
- **ROI**: annotate a suspicious area (sphere or arrow) with a name and a colour; it appears in 3D, at the MDT meeting and in the reports;
- [[Capture ▾]]: file the view in the gallery, or copy it for a document.

Each screen (imaging, seizure, localisation, stimulations, MDT meeting) keeps its own layers and settings.

## Post-processing {#post-traitement}

In the right-hand column, **Post-processing**:

- **Partial volume effect correction** of PET or SPECT (PETPVC methods), on the patient's segmentation;
- **Left / right asymmetry map** of PET (or SPECT), by VEP region and voxel by voxel, with a statistical threshold;
- **maps computed** elsewhere in EpiScope (SEEG epileptogenicity maps, for example).

Derived images are filed under their source image, in T1 space, and added to the slice layers.

??? plus
    The methods (MeshNet network, VEP parcellation, mutual-information registration, partial volume correction, robust z for asymmetry) are described in [Methods: imaging](@m-imagerie).
