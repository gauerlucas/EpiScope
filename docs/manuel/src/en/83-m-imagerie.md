---
id: m-imagerie
title: "Methods: imaging"
short: "Methods: imaging"
group: more
order: 40
lead: Registration, segmentation, the patient's VEP parcellation, electrodes on the CT and PET post-processing, all computed in the browser.
---

# Methods: imaging

!!! bref
    - Rigid **registration** by mutual information, with landmarks and manual adjustment as a fallback.
    - **Segmentation** by the MeshNet network (brainchop) or by an SPM-like atlas, chosen or compared.
    - **Electrodes** detected on the CT and placed at catalogue dimensions, checked one by one.

## Registration {#recalage}

{refs: nmi mattes}

Each image is registered rigidly to the reference T1: normalised mutual information, resolution pyramid, orientation search, about 5 to 10 s per image. If it fails: landmarks (brain centre, AC, PC), or manual adjustment with scaling (a skull that has grown between two scans).

## The patient's anatomy {#anatomie-du-patient}

{refs: mindgrab brainchop meshnet ashburner2005 desikan vepatlas}

1. **Conforming** the T1 (1 mm isotropic) and brain mask (mindgrab).
2. **Segmentation** into 104 classes (aparc+aseg) by **MeshNet**, a light network that runs in the browser (brainchop). Other methods: network after bias correction, smoothed image, or an **SPM-like MNI atlas** without a network (affine registration of the ICBM152 template, tissues by EM with spatial priors), recommended in young children.
3. The patient's **VEP parcellation**: projection of the template, constrained by the patient's gyri (Desikan).
4. Pial and inflated **surfaces** by topology-corrected marching cubes.

A quality control comes with the result: regions found, proportion of unlabelled tissue, consistency with age.

## Electrodes on the CT {#electrodes-sur-le-scanner}

{refs: epitools}

Metal detection, lines fitted to the clusters, contacts placed at the **catalogue** dimensions of the model (DIXI Microdeep®, Alcis: spacing, spaced groups, high density), names matched to the planned scheme. **Tip + entry + model** refines detection with the true contact template. Each electrode is checked on slices aligned with its axis.

## PET and SPECT {#tep-et-temp}

{refs: petpvc rbv mg gtm}

- **Partial volume effect correction**: PETPVC methods rewritten for the browser (RBV, iterative Yang, Müller-Gärtner, GTM, Richardson-Lucy), on the patient's segmentation, with the effective resolution of the image (about 6 mm).
- **Left / right asymmetry**: mean of each VEP region and its homologue, index AI = 200 × (L − R) / (L + R), significance by **robust z** (median and MAD: a global asymmetry is neutralised); voxel-wise map by reflection through the template.
