---
id: staff
title: Le staff
group: path
order: 40
ctx: meeting>preparer, meeting/preparer>preparer, meeting/presenter>presenter
lead: Un staff est une étape du parcours. On le prépare avant ou pendant la réunion, on le présente en plein écran, et le compte rendu se produit en un clic.
---

# Le staff

!!! bref
    - **Où ?** [[+]] › *Staff* dans la barre du haut ; ensuite, l'étape **Staff** du parcours (<kbd>F6</kbd>).
    - **Minimum** : la date, le type et les explorations prises en compte. La concordance est préremplie.
    - **Le jour J** : [[▶ Présenter]] (<kbd>F2</kbd>). Aucun diaporama à faire à la main.

## Préparer

L'onglet [[Préparer]] se remplit de haut en bas :

1. **Date, type** (après phase 1, après SEEG, après chirurgie…), **statut** (brouillon, validé), **participants** et **question posée**.
2. **Crises prises en compte** : les explorations et les crises à discuter (cases à cocher).
3. **Revoir** : des raccourcis vers l'histoire clinique, les bilans, l'imagerie et les crises de chaque exploration.
4. **Synthèse** : un résumé du dossier rédigé d'après les données, et la sémiologie en consensus des crises retenues.
5. **Concordance anatomo-électro-clinique** : un tableau *systèmes anatomo-fonctionnels × modalités* (sémiologie, EEG intercritique et critique, IRM, TEP, neuropsychologie, SEEG). Quatre colonnes sont **préremplies** d'après le dossier (consensus des crises, lésions, quantifications, stimulations) ; chaque case reste modifiable au clic. [[toutes les régions]] affiche aussi les lignes vides ; [[+ colonne]] ajoute une modalité.
6. **Hypothèses** : chaque hypothèse (régions, réseau, niveau de confiance) s'illustre en 3D. Une hypothèse révisée à un staff suivant garde son historique.
7. **Décisions** : SEEG, deuxième SEEG, thermocoagulation, chirurgie, laser, neuromodulation, bilan complémentaire, traitement médical, pas de chirurgie. Une décision de SEEG crée l'exploration SEEG avec un schéma d'implantation ; une décision de chirurgie crée l'intervention.
8. **Captures à montrer** et **conclusion**.

![Préparer le staff : synthèse à gauche, concordance à droite.](shot:staff-preparer)

!!! astuce
    Tout se modifie aussi pendant la réunion : une case de concordance, une hypothèse, une décision. Le compte rendu suivra.

## Présenter

[[▶ Présenter]] (ou <kbd>F2</kbd>) affiche le dossier en plein écran, en diapositives, sans bouton d'édition. <kbd>←</kbd> <kbd>→</kbd> pour avancer, le plan à gauche pour sauter à une partie, <kbd>Échap</kbd> pour sortir.

L'ordre suit le raisonnement : présentation du patient et question posée, histoire clinique, synthèse des crises puis chaque crise (frise, séquence, vidéo, modèle), EEG de scalp et tracés, imagerie (coupes interactives), neuropsychologie, pour chaque SEEG l'implantation, les plots de début des crises, les analyses, les stimulations et les thermocoagulations, puis la concordance, les hypothèses, les décisions et la conclusion.

![Une diapositive du staff. Le plan à gauche permet de sauter à n'importe quelle partie.](shot:staff-presenter)

Pendant la présentation :

- [[▶ Revoir en 3D]] sur une crise ouvre son espace de travail ; un bouton ramène à la même diapositive ;
- [[〰 Revoir le tracé]] sur une capture ou une ligne de source ouvre le tracé à cet instant (montage, filtres, base de temps), puis *Retour à la présentation* ;
- les coupes d'imagerie restent interactives (molette, zoom, contraste).

## Le compte rendu

Le bouton [[Compte rendu du staff]] (à la place de *Rapport* dans la barre du haut) produit le compte rendu : question, participants, synthèse, concordance, hypothèses, décisions et conclusion, avec les vues 3D. Il est téléchargé en fichier HTML ; ouvert dans le navigateur, <kbd>Ctrl</kbd>+<kbd>P</kbd> l'imprime ou l'enregistre en PDF. [[Copier le texte]] dans *Préparer* copie la synthèse en texte brut, pour un courrier.

??? plus
    **Plusieurs staffs ?** Chaque staff est une étape ; un staff après SEEG reprend les hypothèses du staff précédent (révisées ou non) et les cases de concordance saisies à la main. **Proposition chirurgicale** : une décision de chirurgie propose les interventions standard (lobectomie temporale antérieure, résection sur mesure, déconnexion…) et montre, sur le cerveau, la couverture des hypothèses retenues.
