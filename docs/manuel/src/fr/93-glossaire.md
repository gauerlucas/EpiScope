---
id: glossaire
title: Glossaire
group: ref
order: 40
lead: Les termes et abréviations employés dans EpiScope et dans ce manuel, avec leur équivalent anglais.
---

# Glossaire

| Terme | Anglais | Définition |
|---|---|---|
| Atlas VEP | VEP atlas | Découpage du cerveau en 162 régions corticales et des structures profondes, conçu pour l'épilepsie (*Virtual Epileptic Patient*). |
| BEM | BEM | Modèle de tête par éléments de frontière (scalp, crâne, cerveau), pour l'imagerie de source. |
| BIDS | BIDS | *Brain Imaging Data Structure* : norme d'organisation et de nommage des données de neuro-imagerie et d'EEG (`sub-HFAR0007_ses-seeg1_task-seizure_run-01_ieeg.edf`). |
| Code du patient | Patient code | Identifiant neutre et définitif d'un patient : préfixe du centre + numéro (`HFAR0007`). Nomme ses fichiers et le désigne dans les exports anonymisés. |
| Commentaire de staff | MDT comment | Note accrochée à une donnée pendant un staff, sans la modifier ; visible aux staffs suivants et dans le compte rendu. |
| Concordance | Concordance | Tableau du staff croisant systèmes anatomo-fonctionnels et modalités (sémiologie, EEG, IRM, TEP, neuropsychologie, SEEG). |
| Corbeille | Bin | Ce qui a été supprimé, avec ses dépendances, restaurable tel quel tant qu'elle n'est pas vidée. |
| Crise habituelle | Habitual seizure | Crise représentative de celles du patient ; compte double dans la synthèse. |
| EI | EI | Index d'épileptogénicité (Bartolomei 2008) ; aussi cEI (connectivité), PEI (entropie de permutation). |
| EImax | EImax | Valeur maximale de l'EI de chaque plot sur plusieurs crises. |
| Empreinte | Fingerprint | Signature temps-fréquence de la zone épileptogène (Grinenko 2018). |
| Évidence directe | Direct evidence | Part de la plausibilité d'une région due au signe lui-même (et non au relais ou à la propagation). |
| Frise | Timeline | Représentation des signes d'une crise en barres sur l'axe du temps. |
| Gabarit | Template | Cerveau moyen (fsaverage, MNI) utilisé quand l'anatomie du patient n'est pas calculée. |
| Heure réelle | Wall-clock time | Heure du poste d'acquisition au moment de l'enregistrement, qui tient compte des coupures d'un EDF discontinu ; les marques et le début des crises y sont enregistrés. |
| HFO | HFO | Oscillations à haute fréquence : ripples (80–250 Hz), fast ripples (250–500 Hz). |
| Hypothèse (H1–H4) | Hypothesis | Trajectoire de réseau : origine, relais, zones symptomatogènes. |
| Instantané | Snapshot | Copie du staff tel que présenté (pages, données, commentaires), consultable plus tard en lecture seule. |
| Jeu d'analyse | Analysis set | Ensemble de valeurs par plot (EI, taux de pointes…) affiché en 3D et dans les coupes. |
| Montage | Montage | Façon de dériver les voies : cascade (plots voisins), référence d'enregistrement, moyenne commune, plot de référence. |
| Parcours | Pathway | Suite des étapes du patient : dossier, phase 1, staff, SEEG, chirurgie, suivi. |
| Plausibilité | Plausibility | Score de 0 à 1 de compatibilité d'une région avec la séquence des signes ; pas une probabilité de zone épileptogène. |
| Plot | Contact | Contact d'une électrode SEEG ; une paire de plots voisins forme une dérivation bipolaire. |
| Point de synchronisation | Synchronisation point | Même évènement repéré dans une vidéo et dans un tracé, pour caler la vidéo sur l'heure du tracé. |
| Prime (A’) | Prime | Convention de Talairach : une électrode notée avec ’ est dans l'hémisphère gauche. |
| Prior | Prior | Lien signe → région de la base de référence, avec son poids et sa source. |
| Provenance | Provenance | Fiche d'un résultat : méthode et version, paramètres, tracé (empreinte), fenêtre, montage, date, auteur. |
| Relais | Relay | Région sur le chemin le plus plausible entre deux zones symptomatogènes successives. |
| ROI | ROI | Région d'intérêt annotée dans les coupes (sphère, flèche). |
| Crise rapportée | Reported seizure | Crise vue hors exploration (vidéo familiale, témoignage, autre centre), décrite au niveau du dossier et rattachable plus tard à une exploration. |
| Staff | MDT meeting | Réunion de concertation pluridisciplinaire de chirurgie de l'épilepsie. |
| Table de correspondance | Correspondence table | Fichier code ↔ identité de tous les patients ; identifiant, à usage interne. |
| Version du dossier | Record version | État antérieur du dossier gardé à chaque enregistrement, consultable et restaurable. |
| Zone épileptogène | Epileptogenic zone | Région nécessaire et suffisante à la genèse des crises, dont l'exérèse ou la destruction les supprime. |
| Zone symptomatogène | Symptomatogenic zone | Région dont l'activation produit un signe. |
