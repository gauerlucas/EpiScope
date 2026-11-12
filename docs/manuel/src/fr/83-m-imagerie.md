---
id: m-imagerie
title: "Méthodes : imagerie"
short: "Méthodes : imagerie"
group: more
order: 40
lead: Recalage, segmentation, parcellation VEP du patient, électrodes sur le scanner et post-traitement de la TEP, tous calculés dans le navigateur.
---

# Méthodes : imagerie

!!! bref
    - **Recalage** rigide par information mutuelle, avec repères et ajustement à la main en secours.
    - **Segmentation** par réseau MeshNet (brainchop) ou par atlas de type SPM, au choix ou comparées.
    - **Électrodes** détectées sur le scanner et posées aux cotes du catalogue, vérifiées une à une.

## Recalage

{refs: nmi mattes}

Chaque image est recalée de façon rigide sur le T1 de référence : information mutuelle normalisée, pyramide de résolutions, recherche d'orientation, environ 5 à 10 s par image. En cas d'échec : repères (centre du cerveau, CA, CP), ou ajustement manuel avec homothétie (crâne qui a grandi entre deux examens).

## Anatomie du patient

{refs: mindgrab brainchop meshnet ashburner2005 desikan vepatlas}

1. **Conformation** du T1 (1 mm isotrope) et masque du cerveau (mindgrab).
2. **Segmentation** en 104 classes (aparc+aseg) par **MeshNet**, un réseau léger qui tourne dans le navigateur (brainchop). Autres méthodes : réseau après correction du biais, image lissée, ou **atlas MNI de type SPM** sans réseau (recalage affine du gabarit ICBM152, tissus par EM avec a priori spatiaux), recommandé chez le jeune enfant.
3. **Parcellation VEP** du patient : projection du gabarit, contrainte par ses gyri (Desikan).
4. **Surfaces** piale et gonflée par marching cubes à topologie corrigée.

Un contrôle de qualité accompagne le résultat : régions retrouvées, part du tissu sans étiquette, cohérence avec l'âge.

## Électrodes sur le scanner

{refs: epitools}

Détection du métal, droites ajustées sur les amas, plots posés aux cotes du **catalogue** du modèle (DIXI Microdeep®, Alcis : pas, groupes espacés, haute densité), noms appariés au schéma prévu. **Pointe + entrée + modèle** affine la détection avec le vrai gabarit des plots. Chaque électrode se vérifie dans des coupes alignées sur son axe.

## TEP et TEMP

{refs: petpvc rbv mg gtm}

- **Correction de l'effet de volume partiel** : méthodes de PETPVC réécrites pour le navigateur (RBV, Yang itératif, Müller-Gärtner, GTM, Richardson-Lucy), sur la segmentation du patient, avec la résolution effective de l'image (environ 6 mm).
- **Asymétrie gauche / droite** : moyenne de chaque région VEP et de son homologue, indice AI = 200 × (G − D) / (G + D), significativité par **z robuste** (médiane et MAD : une asymétrie globale est neutralisée) ; carte voxel par voxel par réflexion à travers le gabarit.
