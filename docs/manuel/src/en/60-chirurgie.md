---
id: chirurgie
title: Surgery and follow-up
group: path
order: 60
lead: The procedure decided at the MDT meeting, the resected regions on the patient's anatomy, then the outcome according to Engel and the ILAE, with the follow-up duration computed automatically.
---

# Surgery and follow-up

!!! bref
    - **Where?** The **Surgery** and **Follow-up** stages of the pathway (created by an MDT decision or by [[+]]).
    - **Minimum**: the type of procedure, the date, the side; then an outcome assessment.

## The procedure {#lintervention}

The [[Intervention]] tab describes the procedure: type (resection or corticectomy, lobectomy, disconnection, thermocoagulation, laser, neuromodulation…), date, side, description, histology, complications and notes.

- **Standard intervention**: standard anterior temporal lobectomy, anteromesial resection, selective amygdalohippocampectomy, **hemispherotomy**, **temporal resection + parieto-occipital disconnection**, lesionectomy or tailored resection. The chosen side gives the regions; for a disconnection, regions left in place but disconnected are marked *disconnected* and painted purple (hemispherotomy: the whole cortex of the hemisphere; temporal resection + parieto-occipital disconnection: temporal lobe removed, parietal cortex behind the postcentral gyrus, occipital and medial parietal cortex disconnected).
- **Resected or disconnected regions**: chosen from the list or taken from the retained hypotheses; the 3D view shows the intervention against the epileptogenic zone (included or not).
- **MRI slices**, next to the contacts in the resection: the associated post-operative MRI is overlaid on the pre-operative T1. Two layers can be ticked together: the **target regions** of the procedure, declared on the VEP atlas (resected in red, partly resected in orange, disconnected in purple; the epileptogenic zone of the hypotheses in dark red when inside the procedure, in blue otherwise), and the **segmented resection volume** on the post-operative MRI (white veil and outline). The same layers, and others (lesions, contacts of a seizure), can be added to any slices through [[Multimodality ▾]] › *Additional layers*.

### Histology {#histologie}

{refs: najm2022fcd blumcke2013hs who2021cns}

Diagnoses are picked from a closed list — focal cortical dysplasias according to the ILAE 2022 classification (types I to III, mMCD, MOGHE), hippocampal sclerosis ILAE type 1 to 3, epilepsy-associated tumours according to WHO 2021 (ganglioglioma, DNET, PLNTY…), cavernoma, tuber, glial scar… — several at once for dual pathology. Free text stays alongside for details (gene, immunohistochemistry). A query uses the codes, not the text.

### Contacts in the resection {#contacts-dans-la-resection}

{refs: arnold2022cavity}

The **Contacts in the resection** card shows the real electrodes of the reference SEEG, one button per contact: a click declares it in the resection, hovering recalls its VEP region. The legend lists the four states: in the resection, declared by hand (red); in the segmented cavity (purple); at the margin of the cavity, to be checked (dashed); outside the resection. On an imported, coregistered post-operative MRI, [[Segment the cavity]] compares the image with the patient's pre-operative parcellation: parenchyma turned into CSF forms the cavity. Intensities are scaled to the patient's own on the post-operative MRI (CSF 0, white matter 1; the check shows where the cortex falls, expected between 0.3 and 0.9). The patient's grey / white matter segmentation constrains the result: a voxel already dark on the pre-operative T1 (sulcal CSF, cyst, ventricle) is not counted, and a component without a thick core of about 2 mm (a cortical rim at the bottom of a sulcus, born of imperfect coregistration) is discarded; the cavity is described in grey and white matter. The components found are kept or discarded, with their volume and the fraction of each region removed; [[Keep this cavity and deduce the contacts]] stores the mask (visible in the slices) and marks the contacts inside the cavity (purple, 1.5 mm tolerance). Contacts 1.5 to 5 mm from the cavity are flagged **at the margin** (dashed, “to be checked” list) without being added. Contacts declared by hand remain; those of a previous cavity are replaced.

!!! attention
    The cavity shows emptied tissue. It does not see tissue left in place but disconnected, nor a collapsed or filled cavity, and brain shift after surgery (cortex pulled away from the skull, fluid in its place) can make it spill onto contacts still in healthy tissue. Check it in the slices and correct the contacts with a click: the manual declaration prevails.

![The procedure: type, resected regions, pre / post-operative slices.](shot:chirurgie)

## Follow-up {#le-suivi}

{refs: engel ilaeoutcome}

The [[Follow-up]] tab receives successive assessments: date, **Engel** (IA to IVC) and **ILAE** (1 to 6), with their reminders (? button), treatments and notes. The **follow-up duration** is computed from the date of surgery to the date of the assessment (editable). **Follow-up investigations** (neuropsychology, post-operative imaging…) are filed with the other investigations of the record.

![Follow-up: Engel, ILAE, follow-up duration and follow-up investigations.](shot:suivi)
