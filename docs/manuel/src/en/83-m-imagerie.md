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

### Fine registration (elastix) {#recalage-fin-elastix}

{refs: klein2010 shamonin2014 mccormick2014}

The fast registrations remain the default. As a second step, EpiScope offers a dense **fine registration** with **elastix**, the intensity-based registration toolbox from UMC Utrecht, embedded as WebAssembly (itk-wasm) in the EpiScope.html file: no external software, no network. The parameter maps are those of ITKElastix — affine then cubic B-spline, Mattes mutual information, 4-level pyramid, bending-energy penalty on the deformation field —, with a final grid and penalty tuned by EpiScope on patients: overlap of the 104 segmented regions comparable to ANTs SyN, with no folding of the field. Each run reports the Jacobian determinant of its transformation (share of the brain where the field folds).

- **To MNI 2009b ("research-grade")**: patient T1 (segmented brain dilated by 2 mm) to the template T1 (brain only); the transformation, saved in `derivatives/anat/…_mode-elastix_xfm.json.gz`, replaces the fast transformation for the MNI coordinates of research exports, the cohort and queries; the fast transformation is kept and can be restored.
- **Between two images of the patient**: the image, already rigidly registered, is finely registered (affine then wide-grid B-spline, 20 mm: gentle deformation) to the reference, both images masked by the reference's segmented brain; useful between two MRIs several years apart (growth). After surgery, a deformation tends to fill the cavity: to locate the cavity relative to the electrodes, rigid registration remains the rule. The result is a new image in the record; the original image is kept.

## The patient's anatomy {#anatomie-du-patient}

{refs: mindgrab brainchop meshnet ashburner2005 desikan vepatlas}

1. **Conforming** the T1 (1 mm isotropic) and brain mask (mindgrab).
2. **Segmentation** into 104 classes (aparc+aseg) by **MeshNet**, a light network that runs in the browser (brainchop). Other methods: network after bias correction, smoothed image, or an **SPM-like MNI atlas** without a network (affine registration of the ICBM152 template, tissues by EM with spatial priors), recommended in young children.
3. The patient's **VEP parcellation**: projection of the template, constrained by the patient's gyri (Desikan).
4. Pial and inflated **surfaces** by topology-corrected marching cubes.

A quality control comes with the result: regions found, proportion of unlabelled tissue, consistency with age.

### Towards MNI space {#vers-lespace-mni}

{refs: bookstein1989 fonov2009 fonov2011}

Since version 3.0, EpiScope’s **template** is the **MNI ICBM 152 non-linear 2009b asymmetric** average brain (MNI152NLin2009bAsym): VEP parcellation, slices and the electrode library are all defined on it, in MNI coordinates; since version 3.3, the template’s pial and inflated surfaces, grey nuclei, hippocampi, amygdalae and cerebellum come from **Brainstorm**’s ICBM152 model (the same template in its 2009c version, same space, processed with FreeSurfer 8.2), coloured and split by the template’s VEP regions (anterior and posterior hippocampus…); the brain mask and tissue probabilities (atlas-method priors) come from the 2009c version of the same template; template slices show the high-resolution 2009b T1 resampled to 1 mm. Records from an earlier version (fsaverage template, MNI305) are converted when opened (published MNI305 → MNI152 matrix) and the conversion is logged in the journal.

The affine transformation (12 degrees of freedom) to the MNI 2009b template is fitted on the centres of about a hundred structures segmented in the same way in the patient and on the template. EpiScope complements it with a regularised **thin-plate spline** fitted on the same landmarks: regularisation is chosen by cross-validation (each landmark predicted without itself), and the spline is kept only if it predicts better than the affine, without folding. The **Patient anatomy** card shows the prediction error of both. MNI 2009b coordinates of exports, cohort and queries follow the retained transformation; the 3D “template” display remains affine. This is a correction at the scale of structures (a few millimetres), not a voxel-wise registration: for research coordinates, run the fine registration (above).

In children, the transformation goes through the **template of their age**: the **NIHPD asymmetric** paediatric templates (4.5–8.5; 7–11; 7.5–13.5; 10–14; 13–18.5 years) are built in, and the range whose centre is closest to the age at the T1 is chosen up to 18.5 years: patient → age template → MNI 2009b, coordinates remaining expressed in MNI 2009b. [[Age-appropriate templates…]] lists these templates (each can be switched off); a template added from a record whose T1 is the template image takes precedence when its range covers the age, and is stored in the library settings. Before 2 years, immature myelination makes segmentation and coordinates less reliable: the card says so.

### Region of each contact {#region-de-chaque-plot}

When the real electrodes are validated, the VEP region of each contact is **frozen** in the record (vote over three points of the axis), with the date of the anatomy used: a query reads it as it was established, whatever the later version of the atlas. If the anatomy is recomputed, frozen regions remain and are flagged; [[Relabel the contacts]] updates them.

## Electrodes on the CT {#electrodes-sur-le-scanner}

{refs: epitools}

Metal detection, lines fitted to the clusters, contacts placed at the **catalogue** dimensions of the model (DIXI Microdeep®, Alcis: spacing, spaced groups, high density), names matched to the planned scheme. **Tip + entry + model** refines detection with the true contact template. Each electrode is checked on slices aligned with its axis.

## PET and SPECT {#tep-et-temp}

{refs: petpvc rbv mg gtm}

- **Partial volume effect correction**: PETPVC methods rewritten for the browser (RBV, iterative Yang, Müller-Gärtner, GTM, Richardson-Lucy), on the patient's segmentation, with the effective resolution of the image (about 6 mm).
- **Left / right asymmetry**: mean of each VEP region and its homologue, index AI = 200 × (L − R) / (L + R), significance by **robust z** (median and MAD: a global asymmetry is neutralised); voxel-wise map by reflection through the template.
