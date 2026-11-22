---
id: donnees
title: Données et confidentialité
short: Données et confidentialité
group: more
order: 50
lead: Où sont rangés les dossiers, qui peut les lire, comment ils se partagent et se sauvegardent, et comment faire évoluer la base de référence.
---

# Données et confidentialité

!!! bref
    - **Rien ne quitte le poste** : EpiScope fonctionne sans connexion et n'envoie aucune donnée.
    - **Les dossiers sont des fichiers** dans le répertoire choisi : ils suivent les règles d'accès et de sauvegarde de ce répertoire.
    - **Identité à un seul endroit** : chaque patient a un code neutre (`HFAR0007`) qui nomme ses fichiers ; son nom n'est enregistré que dans la zone *Identité* du dossier et ne sort que par la table de correspondance ou un export interne.
    - **Rien ne se perd** : corbeille et versions du dossier ; chaque résultat garde sa provenance.

## Où sont les dossiers ?

Au premier lancement, vous choisissez entre :

- un **répertoire** (disque local, partage réseau du service) : un sous-répertoire par patient, lisible sans EpiScope ;
- le **stockage du navigateur** : pratique pour essayer, mais lié à ce navigateur sur ce poste (pas de partage, et il disparaît si l'on efface les données du navigateur).

Le choix se change dans la liste des patients ([[Changer de répertoire…]]).

Le mode navigateur est réservé aux essais : à la création d'un vrai patient dans ce mode, EpiScope le rappelle et demande au navigateur un stockage persistant.

La bibliothèque en répertoire est organisée selon **BIDS** (*Brain Imaging Data Structure*, la norme des jeux de données de neuro-imagerie et d'EEG) : `dataset_description.json` à la racine, un répertoire `sub-<code>` par patient créé depuis la version 1.1, les tracés rangés par session sous leur nom BIDS. Les zones propres à EpiScope sont déclarées dans `.bidsignore`.

| Dans le dossier d'un patient | Contenu |
|---|---|
| `dossier.json` | Tout ce qui est saisi : identité, histoire, crises, staffs, électrodes, résultats et leur provenance. |
| `ses-scalp1/eeg/`, `ses-seeg1/ieeg/`… | Tracés EEG et SEEG, tels qu'importés, nommés selon BIDS (`sub-HFAR0007_ses-seeg1_task-seizure_run-01_ieeg.edf`). |
| `ieeg/` | Calculs des tracés (rapport d'énergie, empreintes…), recalculables. Dans un dossier créé avant la version 1.1 : aussi les tracés eux-mêmes. |
| `imaging/` | Images NIfTI (converties depuis le DICOM le cas échéant ; le DICOM n'est pas gardé). |
| `gallery/`, `attachments/` | Captures, vidéos, pièces jointes. |
| `derivatives/` | Anatomie du patient, modèles de tête, cartes calculées. |
| `staff/` | Instantanés des staffs, tels que présentés. |
| `history/` | Versions précédentes du dossier (compressées). |
| `trash/` | Fichiers retirés, en attente dans la corbeille. |

## Identité et anonymisation

- **Code neutre** : préfixe du centre (réglé à l'initialisation de la bibliothèque, `HFAR` par défaut) + numéro. Il ne change jamais et ne contient rien d'identifiant.
- **Zone Identité** : nom, prénom, date de naissance, IPP. Jamais dans un nom de fichier, un instantané de staff, un export anonymisé ou le journal. Le nom s'affiche dans l'application ; [[Masquer les noms]] le remplace par le code sur un poste (projection).
- **Noms de fichiers d'origine** : les exports des logiciels d'acquisition portent souvent le nom du patient. EpiScope ne garde pas ce nom : les tracés sont renommés selon BIDS à l'import, les vidéos prennent un titre neutre. Pour un dossier ancien, la carte *Noms de fichiers d'origine* du journal fait le ménage.
- **Table de correspondance** : seule sortie de l'identité de tous les patients (CSV), notée au journal.
- **Exports anonymisés** : dossier (identité retirée, en-têtes EDF anonymisés, sans vidéos), cohorte (codes), comptes rendus (case *masquer le nom*). Voir [Partager un dossier](@rapports#partager-un-dossier).

## Ne rien perdre

- **Corbeille du dossier** : toute suppression (avec ses dépendances : une exploration emporte ses crises) se restaure exactement ; les fichiers attendent dans `trash/`. Rien n'est effacé sans vider la corbeille.
- **Corbeille de la bibliothèque** : un patient retiré de la liste y reste, avec tous ses fichiers, jusqu'à sa suppression définitive.
- **Versions** : à chaque enregistrement, la version précédente est gardée dans `history/` (toutes celles des dernières 48 heures, puis une par jour pendant trois mois, puis une par mois, et les points de restauration). Journal › *Versions enregistrées*.
- **Lecture seule** : un dossier écrit par une version plus récente d'EpiScope s'ouvre en lecture seule, pour ne pas perdre ce que l'ancienne version ne connaît pas.
- **Format 2.0** : depuis la version 2.0, les crises sont rattachées directement à leur exploration (ou au dossier, pour une crise rapportée) : il n'y a plus de « séances ». Un dossier de l'ancien format est converti à son ouverture : chaque crise rejoint l'exploration de sa séance (la date de la séance est reprise si la crise n'en avait pas), les notes et fichiers des séances passent, datés, dans les notes de l'exploration, la corbeille est convertie, et l'état d'avant reste épinglé dans `history/`. La conversion est notée au journal. Liste des patients › [[Essai à blanc…]] montre, sans rien écrire, ce que la conversion fera pour chaque dossier. Une version 1.x ouvre ensuite ces dossiers en lecture seule. Dans un tracé qui contient plusieurs crises, chaque crise garde ses propres marques (début, fin, marques libres, à l'heure réelle) et ses propres résultats : changer de crise dans la visionneuse ne déplace rien.
- **Provenance** : chaque résultat garde la version de la méthode, les paramètres et l'empreinte du tracé (voir [Provenance des résultats](@m-seeg#provenance-des-resultats)).

## Travailler à plusieurs

Sur un partage, chaque collègue ouvre EpiScope sur son poste et pointe le même répertoire. Un **verrou** indique qu'un dossier est ouvert ailleurs ; s'il est modifié en même temps à deux endroits, la seconde version est gardée en copie de conflit, rien n'est écrasé. Les initiales de l'utilisateur signent chaque modification dans le journal.

## Sauvegarde et mise à jour

- **Sauvegarde** : celle du répertoire (partage sauvegardé, copie régulière).
- **Mise à jour d'EpiScope** : remplacer `EpiScope.html` par la nouvelle version. Les dossiers, rangés ailleurs, ne sont pas touchés.

## Envoyer un dossier

Nom du patient ▾ › *Exporter le dossier* : archive `.episcope` complète, légère ou anonymisée (voir [Partager un dossier](@rapports#partager-un-dossier)). À envoyer par une messagerie sécurisée de santé.

## La base de référence

[[⋯]] › *Base de référence* ouvre la base des signes : pour chaque signe, ses régions VEP, poids, rôle, source et notes ; et les liens réseau longue distance. Vous pouvez la modifier ; les modifications restent sur le poste, et un avertissement rappelle qu'une base différente de la base livrée est active (chaque crise garde l'empreinte de la base avec laquelle elle a été calculée). Pour les partager : *Exporter l'app avec cette base* produit un nouveau `EpiScope.html` qui l'embarque. Les tables s'exportent et se réimportent en CSV.

!!! attention
    Modifier la base change les résultats de toutes les crises. Notez vos changements (colonne *source*) et partagez la même version au sein de l'équipe.
