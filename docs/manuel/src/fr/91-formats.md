---
id: formats
title: Formats acceptés
group: ref
order: 20
lead: Ce qu'EpiScope sait lire et écrire. En cas de doute, glissez le fichier sur l'écran : un format non reconnu est signalé, rien n'est abîmé.
---

# Formats acceptés

## Ce qu'EpiScope lit

| Donnée | Formats | Remarques |
|---|---|---|
| Images | NIfTI (`.nii`, `.nii.gz`), dossier DICOM | DICOM non compressé seulement (pas de JPEG / JPEG 2000 / RLE, pas de mosaïque Siemens). |
| EEG et SEEG | EDF, EDF+ (annotations, discontinu), BDF, BrainVision (`.vhdr` + `.eeg` + `.vmrk`), BIDS iEEG | Exports Brainquick et Micromed reconnus (préfixes, voies non EEG écartées, montage bipolaire exporté). Les `.TRC` natifs sont à exporter en EDF. |
| Planification SEEG | ROSA (`.ros`), CSV ou TSV (nom, entrée x y z, cible x y z), `electrodes.tsv` BIDS | Le repère des coordonnées est déduit de la cohérence anatomique : contrôler les trajectoires après l'import. |
| Segmentation faite ailleurs | aparc+aseg ou aseg (FreeSurfer, FastSurfer ; `.mgz`, `.nii`), CAT12, Brainstorm | Dans l'espace du T1 de référence. |
| Quantifications | Excel (`.xlsx`), CSV, texte | Colonne d'étiquettes (A’1-2, A'1-A'2, A1…) et colonnes numériques détectées. |
| Connectome | `weights.txt` + `centres.txt` (pipeline VEP / TVB) | Matrice N × N, noms « Left-… / Right-… ». |
| Vidéos | MP4, WebM, MOV ; AVI, WMV, MPEG-2… convertis sur le poste | La conversion télécharge une fois l'outil ffmpeg (≈ 31 Mo), après accord. |
| Captures | PNG, JPEG, presse-papiers | <kbd>Ctrl</kbd>+<kbd>V</kbd> dans une galerie ou un bilan. |
| Dossiers | `.episcope` (archive zip), anciens cas `.json` | Glisser sur la fenêtre, ou [[Importer un dossier…]]. |

## Ce qu'EpiScope écrit

| Donnée | Format |
|---|---|
| Comptes rendus | HTML autonome (imprimable en PDF) |
| Dossier | `.episcope` (zip : `dossier.json`, images, tracés, dérivés) |
| Cohorte | zip de tables CSV |
| Électrodes | `electrodes.tsv` (BIDS) |
| Surfaces | GIfTI |
| Résultats | CSV (jeux d'analyse, pointes, hypnogramme, valeurs régionales) |
| Images dérivées | NIfTI dans `derivatives/` (TEP corrigée, cartes) |
| Captures | PNG, presse-papiers |
