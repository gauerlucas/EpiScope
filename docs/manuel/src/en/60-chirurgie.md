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

- **Resected regions**: chosen from the list or taken from the retained hypotheses; the 3D view shows the resection against the epileptogenic zone (included in the resection or not).
- **MRI slices**: the associated post-operative MRI is overlaid on the pre-operative T1; the regions of the procedure are coloured.

### Histology {#histologie}

{refs: najm2022fcd blumcke2013hs who2021cns}

Diagnoses are picked from a closed list — focal cortical dysplasias according to the ILAE 2022 classification (types I to III, mMCD, MOGHE), hippocampal sclerosis ILAE type 1 to 3, epilepsy-associated tumours according to WHO 2021 (ganglioglioma, DNET, PLNTY…), cavernoma, tuber, glial scar… — several at once for dual pathology. Free text stays alongside for details (gene, immunohistochemistry). A query uses the codes, not the text.

### Contacts in the resection {#contacts-dans-la-resection}

{refs: arnold2022cavity}

The **Contacts in the resection** card shows the real electrodes of the reference SEEG, one button per contact: a click declares it in the resection (red), hovering recalls its VEP region. On an imported, coregistered post-operative MRI, [[Segment the cavity]] compares the image with the patient's pre-operative parcellation: parenchyma turned into CSF forms the cavity. The components found are kept or discarded, with their volume and the fraction of each region removed; [[Keep this cavity and deduce the contacts]] stores the mask (visible in the slices) and marks the contacts inside the cavity (purple, 1.5 mm tolerance). Contacts declared by hand remain; those of a previous cavity are replaced.

!!! attention
    The cavity depends on the registration of the post-operative MRI and on brain shift after surgery: check it in the slices before keeping the contacts.

![The procedure: type, resected regions, pre / post-operative slices.](shot:chirurgie)

## Follow-up {#le-suivi}

{refs: engel ilaeoutcome}

The [[Follow-up]] tab receives successive assessments: date, **Engel** (IA to IVC) and **ILAE** (1 to 6), with their reminders (? button), treatments and notes. The **follow-up duration** is computed from the date of surgery to the date of the assessment (editable). **Follow-up investigations** (neuropsychology, post-operative imaging…) are filed with the other investigations of the record.

![Follow-up: Engel, ILAE, follow-up duration and follow-up investigations.](shot:suivi)
