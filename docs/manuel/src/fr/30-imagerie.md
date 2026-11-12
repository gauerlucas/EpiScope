---
id: imagerie
title: Imagerie du patient
short: Imagerie
group: path
order: 30
ctx: dossier/imagerie>importer-des-images
lead: IRM, TEP, TEMP et scanner du patient, recalés entre eux, et son cerveau en 3D avec la parcellation VEP. Sans logiciel externe : tout se calcule dans le navigateur.
---

# Imagerie du patient

!!! bref
    - **Où ?** Dossier › [[Imagerie]] (<kbd>F7</kbd>).
    - **Minimum** : un T1 3D. Il sert de référence à toutes les autres images et à l'anatomie du patient.
    - **Temps** : une minute pour importer et recaler, une à deux minutes pour l'anatomie du patient.

## Importer des images

Glissez sur l'écran des fichiers **NIfTI** exportés du PACS, ou directement un **dossier DICOM** (sous-dossiers compris) : les séries sont triées, la modalité, le moment (pré-opératoire, post-implantation, post-opératoire…) et la date sont devinés, modifiables, et les séries 3D cochées d'office. [[+ Images ▾]] fait la même chose par un sélecteur de fichiers.

Le premier T1 pré-opératoire devient l'**image de référence** (pastille *référence*). Les autres images y sont **recalées** : [[Recaler tout + anatomie]] lance d'un coup le recalage de chaque image et le calcul de l'anatomie du patient.

![L'écran Imagerie : images par catégorie à gauche, coupes au centre, anatomie du patient et post-traitement à droite.](shot:imagerie)

!!! attention
    Les DICOM compressés (JPEG, JPEG 2000) ne sont pas lus : exportez-les non compressés depuis le PACS, ou convertissez-les en NIfTI.

### Si le recalage échoue

Chaque recalage se contrôle dans les coupes, image superposée au T1. S'il est faux :

- [[repères…]] : pointez le centre du cerveau (et, si besoin, CA, CP, un point de la ligne médiane) sur la référence puis sur l'image ; EpiScope repart de cette position ;
- [[ajuster]] : un cadre autour de la tête pour corriger à la main la position et l'échelle (utile chez l'enfant entre deux examens éloignés).

## L'anatomie du patient

À partir du T1, EpiScope calcule :

- la **segmentation** du cerveau (substance grise, blanche, structures profondes) par un réseau de neurones ;
- la **parcellation VEP** du patient (162 régions corticales, 18 structures profondes) ;
- les **surfaces** du cortex, piale et gonflée, pour la vue 3D.

La carte **Anatomie du patient** résume le résultat et son contrôle de qualité. [[Voir en 3D]] bascule les vues 3D sur le cerveau du patient (bouton [[Patient]] de la barre de vue) ; [[Coupes VEP]] superpose la parcellation aux coupes. [[Autre méthode…]] propose d'autres segmentations, ou de les comparer côte à côte et de choisir à la main ; une segmentation faite ailleurs (FreeSurfer, FastSurfer, CAT12) peut aussi être importée.

!!! astuce
    Une fois l'anatomie calculée, tout ce qui est en 3D (crises, électrodes, stimulations, analyses) peut s'afficher sur le cerveau du patient plutôt que sur le cerveau moyen.

!!! attention
    La segmentation est automatique : vérifiez-la dans les coupes, surtout en cas de lésion étendue, de cavité opératoire ou de malformation.

## Lire les coupes

Les coupes se lisent comme dans MRIcroGL :

| Geste | Effet |
|---|---|
| Clic, glisser | Déplacer le réticule (les trois coupes suivent). |
| Molette | Coupe suivante. |
| <kbd>Ctrl</kbd>+molette | Zoom autour du réticule. |
| <kbd>Maj</kbd>+glisser, ou outil ◐ | Contraste (↔) et luminosité (↕). |
| Clic droit glissé, ou outil ✋ | Déplacer l'image. |
| Double-clic | Recadrer. ⤢ : une coupe en grand. |

La barre des coupes propose :

- [[Calques ▾]] : image de base, superpositions empilées (TEP, FLAIR, scanner) avec palette, opacité et fenêtre ; parcellation ; électrodes et ROI ;
- [[Multimodalité ▾]] : des préréglages de fusion (TEP sur T1, FLAIR + TEP…) ;
- [[Électrode ▾]] : aligner les coupes sur une électrode (voir [Localiser les électrodes](@seeg#localiser-les-electrodes)) ;
- **ROI** : annoter une zone suspecte (sphère ou flèche) avec un nom et une couleur ; elle est reprise en 3D, au staff et dans les comptes rendus ;
- [[Capture ▾]] : ranger la vue dans la galerie, ou la copier pour un document.

Chaque écran (imagerie, crise, localisation, stimulations, staff) garde ses propres calques et réglages.

## Post-traitement

Dans la colonne de droite, **Post-traitement** :

- **Correction de l'effet de volume partiel** de la TEP ou de la TEMP (méthodes de PETPVC), sur la segmentation du patient ;
- **Carte d'asymétrie gauche / droite** de la TEP (ou de la TEMP), par région VEP et voxel par voxel, avec un seuil statistique ;
- les **cartes calculées** ailleurs dans EpiScope (cartes d'épileptogénicité de la SEEG, par exemple).

Les images dérivées sont rangées sous leur image source, dans l'espace du T1, et s'ajoutent aux calques des coupes.

??? plus
    Les méthodes (réseau MeshNet, parcellation VEP, recalage par information mutuelle, correction de volume partiel, z robuste de l'asymétrie) sont décrites dans [Méthodes : imagerie](@m-imagerie).
