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

### Vers l'espace MNI

{refs: bookstein1989 fonov2009 fonov2011}

Le **gabarit** d'EpiScope est, depuis la version 3.0, le cerveau moyen **MNI ICBM 152 non linéaire 2009b asymétrique** (MNI152NLin2009bAsym) : surfaces piale et gonflée segmentées sur son T1 à 0,5 mm, parcellation VEP, coupes et bibliothèque des électrodes y sont tous définis, en coordonnées MNI ; le masque du cerveau et les probabilités des tissus (a priori de la méthode atlas) viennent de la version 2009c du même gabarit ; les coupes du gabarit montrent le T1 2009b haute résolution ramené à 1 mm. Les dossiers d'une version antérieure (gabarit fsaverage, MNI305) sont convertis à l'ouverture (matrice publiée MNI305 → MNI152) et la conversion est inscrite au journal.

La transformation affine (12 degrés de liberté) vers le gabarit MNI 2009b s'ajuste sur les centres d'une centaine de structures segmentées de la même façon chez le patient et sur le gabarit. EpiScope la complète par une **spline de plaque mince** régularisée ajustée sur les mêmes repères : la régularisation se choisit par validation croisée (chaque repère est prédit sans lui), et la spline n'est gardée que si elle prédit mieux que l'affine, sans repliement. La carte **Anatomie du patient** affiche l'erreur de prédiction des deux. Les coordonnées MNI 2009b des exports, de la cohorte et des requêtes suivent la transformation retenue ; l'affichage 3D « gabarit » reste affine. C'est une correction à l'échelle des structures (quelques millimètres), pas un recalage voxel à voxel.

Chez l'enfant, la transformation passe par le **gabarit de son âge** : les gabarits pédiatriques **NIHPD asymétriques** (4,5–8,5 ; 7–11 ; 7,5–13,5 ; 10–14 ; 13–18,5 ans) sont intégrés, et la tranche dont le centre est le plus proche de l'âge au T1 est choisie jusqu'à 18,5 ans : patient → gabarit de l'âge → MNI 2009b, les coordonnées restant exprimées en MNI 2009b. [[Gabarits adaptés à l'âge…]] liste ces gabarits (chacun peut être désactivé) ; un gabarit ajouté à partir d'un dossier dont le T1 est l'image du gabarit l'emporte quand sa tranche couvre l'âge, et se range dans les réglages de la bibliothèque. Avant 2 ans, la myélinisation immature rend segmentation et coordonnées moins fiables : la carte le signale.

### Région de chaque plot

À la validation des électrodes réelles, la région VEP de chaque plot est **figée** dans le dossier (vote sur trois points de l'axe), avec la date de l'anatomie utilisée : une requête la lit telle qu'elle a été établie, quelle que soit la version ultérieure de l'atlas. Si l'anatomie est recalculée, les régions figées restent et sont signalées ; [[Réétiqueter les plots]] les met à jour.

## Électrodes sur le scanner

{refs: epitools}

Détection du métal, droites ajustées sur les amas, plots posés aux cotes du **catalogue** du modèle (DIXI Microdeep®, Alcis : pas, groupes espacés, haute densité), noms appariés au schéma prévu. **Pointe + entrée + modèle** affine la détection avec le vrai gabarit des plots. Chaque électrode se vérifie dans des coupes alignées sur son axe.

## TEP et TEMP

{refs: petpvc rbv mg gtm}

- **Correction de l'effet de volume partiel** : méthodes de PETPVC réécrites pour le navigateur (RBV, Yang itératif, Müller-Gärtner, GTM, Richardson-Lucy), sur la segmentation du patient, avec la résolution effective de l'image (environ 6 mm).
- **Asymétrie gauche / droite** : moyenne de chaque région VEP et de son homologue, indice AI = 200 × (G − D) / (G + D), significativité par **z robuste** (médiane et MAD : une asymétrie globale est neutralisée) ; carte voxel par voxel par réflexion à travers le gabarit.
