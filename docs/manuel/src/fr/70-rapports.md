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
    - **Hors du service** : exports **anonymisés** (le code du patient remplace son nom).

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

Le compte rendu porte le nom du patient. La case **masquer le nom du patient** de la fenêtre de choix le remplace par son code (et retire la date de naissance), pour un document qui sort du service. Le nom du fichier téléchargé porte toujours le code, jamais le nom.

![Un rapport ouvert dans le navigateur : tableaux de synthèse et vues 3D ; le bouton ☰ Sommaire mène à chaque partie.](shot:rapport-html)

## Captures

Le menu [[Capture ▾]] des vues 3D, des coupes et des tracés range l'image dans la galerie, la copie (à coller dans Word ou PowerPoint) ou l'enregistre en PNG.

## Partager un dossier

Nom du patient ▾ › *Exporter le dossier* (ou [[Exporter]] sur sa ligne de la liste) produit une archive `HFAR0007.episcope` (un zip lisible partout) :

- **complète** : avec les images, les tracés et les vidéos ;
- **légère** : sans les images d'origine ni les tracés, mais avec les surfaces, la parcellation, les électrodes et les résultats ;
- **anonymisée** (complète ou légère), pour un partage hors du service ou une étude multicentrique : l'identité est retirée, le nom, le prénom, l'IPP, la date de naissance et l'ancien pseudonyme sont remplacés par le code dans tous les textes (journal compris) et dans les noms de fichiers (l'anatomie, les électrodes et les images restent lisibles à l'import ; une archive anonymisée faite avant la version 2.1.1 est à refaire), les en-têtes des fichiers EDF sont anonymisés (champs patient et enregistrement ; la date de début est gardée) et les vidéos ne sont pas incluses (visages). Les images IRM et les captures restent incluses : vérifiez qu'aucune ne montre un visage ou un nom avant de partager.

L'archive interne (complète ou légère) contient l'identité : elle est faite pour passer d'un poste du service à un autre.

Le collègue la glisse sur sa fenêtre EpiScope (ou [[Importer un dossier…]]). Si le dossier existe déjà chez lui, il choisit : remplacer sa copie, garder les deux, ou en faire un nouveau dossier.

!!! attention
    Envoyez les archives par une messagerie sécurisée de santé ou sur un support chiffré, comme tout document médical.

## Exporter une cohorte

Liste des patients › [[Exporter la cohorte (CSV)]] : un zip de tables (patients, explorations, crises (avec leur jour d'enregistrement), signes, lésions, imagerie, stimulations, thermocoagulations, staffs, hypothèses, décisions, procédures, devenir), à ouvrir dans Excel, R ou Python. Le bouton produit la version **anonymisée** (chaque patient désigné par son code ; pour la recherche). La version **avec les noms** (nom et prénom en plus, usage interne seulement) se trouve dans le menu [[Exporter]] d'une ligne de la liste.

## Export de recherche (BIDS anonymisé) {#export-de-recherche}

Liste des patients › [[Exporter]] › [[Export de recherche (BIDS anonymisé)…]] produit un **jeu de données BIDS** (version 1.10, extension iEEG) prêt à être partagé ou versé dans une base de recherche multicentrique. EpiScope produit et range les données ; l'exploration de la base (cohortes, requêtes) se fait avec d'autres outils.

- **Contenu** : tracés (EDF à l'en-tête anonymisé, BrainVision), voies (`_channels.tsv`), évènements avec les débuts et fins de crises (`_events.tsv`), description des enregistrements (`_ieeg.json`, `_eeg.json`), sessions et examens datés ; **électrodes** dans le repère du T1 du patient (`space-ScanRAS`) et dans le gabarit **MNI 2009b** (`space-MNI152NLin2009bAsym`, transformation affine ou non linéaire), avec la région de chaque plot ; dérivés EpiScope (`derivatives/episcope`) : crises, sémiologie signe par signe, stimulations, thermocoagulations, résultats des analyses par plot avec méthode et version, clinique (étiologie, lésions, chirurgie, devenir), transformation vers MNI 2009b. Le T1 de référence est en option (son visage n'est pas masqué).
- **Anonymisation** : codes neutres seulement ; dates **décalées** d'un nombre de jours propre à chaque sujet (intervalles et heures conservés ; le décalage est tiré une fois, gardé dans la bibliothèque, et reste le même d'un export à l'autre) ; âges en années au lieu des dates de naissance ; ni vidéo, ni capture, ni texte libre.
- **Contrôle** : chaque fichier (en-têtes et annotations des tracés compris) est lu pour y chercher le nom, le prénom, l'IPP et la date de naissance du patient. Un patient pour lequel une occurrence est trouvée **n'est pas exporté** ; le rapport dit dans quel fichier (souvent une annotation du tracé : décocher les annotations ou corriger le fichier).
- **Destination** : un dossier choisi (Chrome, Edge), sinon une archive `.zip`. Le rapport d'export (patients, options, version) est gardé dans la bibliothèque (`exports/`), jamais dans le jeu exporté.

Dans la bibliothèque elle-même, les électrodes validées sont rangées avec les tracés de leur session (`ses-seeg1/ieeg/…_space-ScanRAS_electrodes.tsv`, et `…_space-MNI152NLin2009bAsym_electrodes.tsv` dès que l'anatomie du patient est calculée).

## Autres exports

- **Électrodes** : `electrodes.tsv` au format BIDS (onglet Localisation), nommé d'après le code du patient et la session.
- **Table de correspondance** : code ↔ identité de tous les patients, en CSV (liste des patients ; voir [Identité et code du patient](@patients#identite-et-code-du-patient)).
- **Surfaces** : GIfTI de l'anatomie du patient (carte Anatomie du patient).
- **Résultats** : chaque jeu d'analyse SEEG, chaque groupe de pointes, l'hypnogramme s'exportent en CSV.
- **Base de référence** : [[⋯]] › *Base de référence* exporte les tables des signes et des priors en CSV, ou produit un `EpiScope.html` qui embarque votre base modifiée (voir [Données et confidentialité](@donnees#la-base-de-reference)).
