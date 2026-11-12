# Historique des versions

EpiScope suit la numérotation sémantique (`MAJEUR.MINEUR.CORRECTIF`) : **1.0.x** pour les corrections, **1.x.0** pour les nouvelles fonctions, **2.0.0** si un changement oblige à migrer les dossiers ou casse une habitude de travail. Une version publiée n'est jamais modifiée : une correction donne une nouvelle version.

## [1.0.0] — 2026-11-11

Première version publique.

- **Un seul fichier, hors ligne** : `EpiScope.html` s'ouvre dans Edge ou Chrome, sans installation ni serveur ; aucune donnée ne quitte le poste. Dossiers des patients dans un répertoire choisi (partage réseau possible) ou dans le stockage du navigateur ; export et import d'un dossier (`.episcope`).
- **Parcours du patient** en chirurgie de l'épilepsie : dossier (antécédents, arbre généalogique à dessiner avec calcul de la consanguinité, histoire de la maladie, développement et examen, bilans, imagerie, galerie, journal), phase 1 (vidéo-EEG de scalp), staff, SEEG, chirurgie ou autre procédure, suivi (Engel, ILAE).
- **Sémiologie séquentielle** : signes saisis dans l'ordre de la crise, régions plausiblement activées au fil des signes sur l'atlas VEP ou l'anatomie du patient, latéralisation, hypothèses de réseau (trajectoires), schéma d'implantation.
- **Imagerie sans logiciel externe** : IRM, scanner, TEP, recalage, surfaces et parcellation du patient, électrodes réelles.
- **EEG** : visionneuse du scalp (montages, filtres), pointes (Janča, SpikeNet) relues une à une, imagerie de source sur un modèle de tête réaliste, stadification du sommeil (YASA) relue époque par époque ; SEEG : planification, localisation des plots, intercritique, crises, quantifications (EI, cEI, PEI et autres), stimulations, thermocoagulations.
- **Staff et comptes rendus** : préparation et diaporama du staff, comptes rendus de chaque étape (HTML imprimable), captures.
- **Manuel d'utilisation** en français et en anglais, dans l'application (bouton **?**, touche **F1**, à la page de l'écran en cours) et à part (HTML hors ligne, PDF) ; **interface en anglais** (⋯ › *Langue*).
- **Crédits et mentions légales** : méthodes et données publiées citées, licences des composants de tiers ; logiciel de l'auteur sous licence MIT, citation dans `CITATION.cff`. Prototype de recherche, non validé pour un usage clinique.
