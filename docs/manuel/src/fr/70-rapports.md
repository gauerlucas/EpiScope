---
id: rapports
title: Comptes rendus, partage et exports
short: Rapports et exports
group: path
order: 70
lead: Chaque étape produit son document. Un dossier s'envoie en une archive, une cohorte s'exporte en tables. Tout part de deux boutons : Rapport et ⋯.
---

# Comptes rendus, partage et exports

!!! bref
    - **Un document** : bouton [[Rapport]] de la barre du haut, sur l'étape voulue.
    - **Un dossier pour un collègue** : nom du patient ▾ › *Exporter le dossier*.
    - **Une cohorte** : liste des patients › [[Exporter la cohorte (CSV)]].

## Les comptes rendus

Le bouton [[Rapport]] produit le document de l'étape ouverte :

| Étape | Document |
|---|---|
| Dossier | Rapport du dossier : patient, chronologie, chaque exploration avec ses crises et son compte rendu, les staffs, la chirurgie et le devenir. On choisit le contenu (crises habituelles seules, vues 3D, paramètres…). |
| Phase 1 | Rapport de la phase 1 : crises, EEG, synthèse. |
| SEEG | Rapport SEEG (voir [Le rapport SEEG](@seeg#le-rapport-seeg)). |
| Staff | Compte rendu du staff. |
| Une crise ouverte | La crise seule : frise, séquence, régions candidates, vues 3D. |

![Le choix du contenu du rapport du dossier.](shot:rapport-choix)

Le document est **téléchargé** : un fichier HTML autonome (images comprises), à ranger avec le dossier médical ou à envoyer. Ouvert dans le navigateur, il s'affiche avec un sommaire latéral ; <kbd>Ctrl</kbd>+<kbd>P</kbd> l'imprime ou l'enregistre en PDF, et on peut le copier dans un traitement de texte. En anglais (⋯ › *Langue*), le compte rendu est rédigé en anglais ; les données saisies restent telles quelles.

![Un rapport ouvert dans le navigateur : tableaux de synthèse et vues 3D ; le bouton ☰ Sommaire mène à chaque partie.](shot:rapport-html)

## Captures

Le menu [[Capture ▾]] des vues 3D, des coupes et des tracés range l'image dans la galerie, la copie (à coller dans Word ou PowerPoint) ou l'enregistre en PNG.

## Partager un dossier

Nom du patient ▾ › *Exporter le dossier* produit une archive `patient.episcope` (un zip lisible partout) :

- **complète** : avec les images, les tracés et les vidéos ;
- **légère** : sans les images d'origine ni les tracés, mais avec les surfaces, la parcellation, les électrodes et les résultats.

Le collègue la glisse sur sa fenêtre EpiScope (ou [[Importer un dossier…]]). Si le dossier existe déjà chez lui, il choisit : remplacer sa copie, garder les deux, ou en faire un nouveau dossier.

!!! attention
    Envoyez les archives par une messagerie sécurisée de santé ou sur un support chiffré, comme tout document médical.

## Exporter une cohorte

Liste des patients › [[Exporter la cohorte (CSV)]] : un zip de tables (patients, explorations, séances, crises, signes, lésions, imagerie, stimulations, thermocoagulations, staffs, hypothèses, décisions, procédures, devenir), à ouvrir dans Excel, R ou Python.

## Autres exports

- **Électrodes** : `electrodes.tsv` au format BIDS (onglet Localisation).
- **Surfaces** : GIfTI de l'anatomie du patient (carte Anatomie du patient).
- **Résultats** : chaque jeu d'analyse SEEG, chaque groupe de pointes, l'hypnogramme s'exportent en CSV.
- **Base de référence** : [[⋯]] › *Base de référence* exporte les tables des signes et des priors en CSV, ou produit un `EpiScope.html` qui embarque votre base modifiée (voir [Données et confidentialité](@donnees#la-base-de-reference)).
