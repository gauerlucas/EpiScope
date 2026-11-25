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
5. **Concordance anatomo-électro-clinique** : un tableau *systèmes anatomo-fonctionnels × modalités* (sémiologie, EEG intercritique et critique, IRM, TEP, neuropsychologie, SEEG). Les colonnes marquées *auto* sont **préremplies** d'après le dossier ; le détail de chaque case s'affiche au survol et chaque case reste modifiable au clic :
    - **Sémiologie** : consensus du modèle sur les crises prises en compte ;
    - **EEG intercritique** et **EEG critique (scalp)** : cartes 10-20 des explorations prises en compte (pointes et ondes lentes en veille et au sommeil ; début des crises). Chaque électrode compte pour les systèmes qu'elle explore au mieux (C4 : central ; T4 : temporal latéral et mésial) ; un système voisin, ou des ondes lentes seules, reste « en faveur » au plus ;
    - **IRM**, **TEP**, **neuropsychologie** : lésions déclarées et [bilans localisés](@patients#les-bilans) datés avant le staff (hors bilans de suivi). Une IRM localisée et latéralisée est un « argument fort ». Un bilan sans localisation confirmée compte d'après les régions citées dans son texte, « en faveur » au plus, avec la mention *à confirmer* ;
    - **SEEG** : quantifications et stimulations.

    [[toutes les régions]] affiche aussi les lignes vides ; [[+ colonne]] ajoute une modalité.
6. **Hypothèses** : chaque hypothèse (régions, réseau, niveau de confiance) s'illustre en 3D. Une hypothèse révisée à un staff suivant garde son historique.
7. **Décisions** : SEEG, deuxième SEEG, thermocoagulation, chirurgie, laser, neuromodulation, bilan complémentaire, traitement médical, pas de chirurgie. Une décision de SEEG crée l'exploration SEEG avec un schéma d'implantation ; une décision de chirurgie crée l'intervention.
8. **Captures à montrer** et **conclusion**.

![Préparer le staff : synthèse à gauche, concordance à droite.](shot:staff-preparer)

### Les diapositives

La carte **Diapositives** de *Préparer* liste les pages du diaporama, dans l'ordre où elles seront montrées. Pour chaque page : ◉ / ○ la montre ou la masque, ↑ ↓ change sa place, un clic sur le titre le renomme, 💬 ajoute un commentaire de staff sur la page. [[＋ Page libre]] insère une page de texte à vous ; [[Ordre automatique]] revient à l'ordre proposé. Le diaporama reste construit d'après le dossier : une page dont la donnée disparaît est signalée, pas supprimée.

!!! astuce
    Tout se modifie aussi pendant la réunion : une case de concordance, une hypothèse, une décision, et chaque donnée montrée dans le diaporama (voir [Éditer ou commenter pendant le staff](#editer-ou-commenter-pendant-le-staff)). Le compte rendu suivra.

## Présenter

[[▶ Présenter]] (ou <kbd>F2</kbd>) affiche le dossier en plein écran, en diapositives. <kbd>←</kbd> <kbd>→</kbd> pour avancer, le plan à gauche pour sauter à une partie, <kbd>Échap</kbd> pour sortir. Les pages masquées dans *Préparer* n'apparaissent pas ; les titres modifiés et les pages libres, si.

L'ordre suit le raisonnement : présentation du patient et question posée, histoire clinique, synthèse des crises puis chaque crise (frise, séquence, vidéo, modèle), EEG de scalp et tracés, imagerie (coupes interactives), neuropsychologie, pour chaque SEEG l'implantation, les plots de début des crises, les analyses, les stimulations et les thermocoagulations, puis la concordance, les hypothèses, les décisions et la conclusion.

![Une diapositive du staff. Le plan à gauche permet de sauter à n'importe quelle partie.](shot:staff-presenter)

Pendant la présentation :

- [[▶ Revoir en 3D]] sur une crise ouvre son espace de travail ; un bouton ramène à la même diapositive ;
- [[〰 Revoir le tracé]] sur une capture ou une ligne de source ouvre le tracé à cet instant (montage, filtres, base de temps), puis *Retour à la présentation* ;
- les coupes d'imagerie restent interactives (molette, zoom, contraste) ;
- un double-clic sur le titre d'une page le renomme ;
- [[◉ Instantané]] enregistre le staff **tel que présenté** (voir [L'instantané](#linstantane)).

### Éditer ou commenter pendant le staff

[[✎ Éditer]] (ou <kbd>E</kbd>) passe la présentation en mode édition : deux boutons apparaissent sous chaque donnée montrée (conclusion, texte et domaines d'un bilan ; antécédents, mode de vie, histoire, examen, latéralité, traitements ; conclusion du staff, hypothèses, décisions).

- [[✎ Éditer]] **modifie la donnée dans le dossier** : la valeur s'ouvre dans une zone de saisie ([[Enregistrer dans le dossier]], ou <kbd>Ctrl</kbd>+<kbd>Entrée</kbd>). Tout le dossier, les comptes rendus et les staffs suivants voient la nouvelle valeur ; le journal note « modifié pendant le staff ».
- [[💬 Commenter]] **ajoute un commentaire de staff sans modifier la donnée** : il s'affiche juste sous elle, dans ce staff et dans les staffs suivants (« staff du 21/11/2026 »), qui voient donc la donnée d'origine et le commentaire. Les commentaires du staff en cours se modifient (✎) ou partent à la corbeille (✕) ; ceux des staffs précédents sont en lecture seule.
- [[💬 Commenter la page]], en tête de page, commente la page entière (une crise, l'EEG intercritique, une page SEEG…).

En mode édition la page défile au lieu d'être découpée, et les flèches ne changent pas de page pendant la saisie. <kbd>E</kbd> ou [[✓ Terminer]] revient à la présentation ; les commentaires restent affichés, les boutons disparaissent.

### L'instantané

Le staff est un moment : rouvert des mois plus tard, le diaporama montrerait le dossier tel qu'il est devenu. [[◉ Instantané]] garde donc chaque page **telle qu'elle a été montrée**, avec ses données, ses modifications et ses commentaires. Plusieurs instantanés sont possibles ; la carte **Diapositives** › *Instantanés* les liste et les rouvre en lecture seule (« Instantané du 21/11/2026 »). Le dossier, lui, reste modifiable.

## Le compte rendu

Le bouton [[Compte rendu du staff]] (à la place de *Rapport* dans la barre du haut) produit le compte rendu : question, participants, synthèse, concordance, hypothèses, décisions et conclusion, avec les vues 3D. Les **commentaires de staff** y figurent à l'endroit de la donnée commentée (sous la conclusion d'un bilan, sous la section d'une crise…), pas en fin de document ; les données modifiées pendant le staff y apparaissent avec leur nouvelle valeur. La fenêtre du compte rendu propose de **masquer le nom du patient** (code à la place) pour un compte rendu qui sort du service. Il est téléchargé en fichier HTML ; ouvert dans le navigateur, <kbd>Ctrl</kbd>+<kbd>P</kbd> l'imprime ou l'enregistre en PDF. [[Copier le texte]] dans *Préparer* copie la synthèse en texte brut, pour un courrier.

??? plus
    **Plusieurs staffs ?** Chaque staff est une étape ; un staff après SEEG reprend les hypothèses du staff précédent (révisées ou non) et les cases de concordance saisies à la main. **Proposition chirurgicale** : une décision de chirurgie propose les interventions standard (lobectomie temporale antérieure, résection sur mesure, déconnexion…) et montre, sur le cerveau, la couverture des hypothèses retenues.
