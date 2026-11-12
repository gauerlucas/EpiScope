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
    - **Pseudonymes** : à préférer aux noms dès que le répertoire est partagé ou que les dossiers circulent ; pensez aussi aux noms de fichiers des tracés (le titre d'un tracé reprend le nom du fichier : renommez-le au besoin).

## Où sont les dossiers ?

Au premier lancement, vous choisissez entre :

- un **répertoire** (disque local, partage réseau du service) : un sous-répertoire par patient, lisible sans EpiScope ;
- le **stockage du navigateur** : pratique pour essayer, mais lié à ce navigateur sur ce poste (pas de partage, et il disparaît si l'on efface les données du navigateur).

Le choix se change dans la liste des patients ([[Changer de répertoire…]]).

| Dans le dossier d'un patient | Contenu |
|---|---|
| `dossier.json` | Tout ce qui est saisi : histoire, crises, staffs, électrodes, résultats. |
| `imaging/` | Images NIfTI (converties depuis le DICOM le cas échéant). |
| `ieeg/` | Tracés EEG et SEEG, tels qu'importés, et leurs calculs. |
| `gallery/`, `attachments/` | Captures, vidéos, pièces jointes. |
| `derivatives/` | Anatomie du patient, modèles de tête, cartes calculées. |

## Travailler à plusieurs

Sur un partage, chaque collègue ouvre EpiScope sur son poste et pointe le même répertoire. Un **verrou** indique qu'un dossier est ouvert ailleurs ; s'il est modifié en même temps à deux endroits, la seconde version est gardée en copie de conflit, rien n'est écrasé. Les initiales de l'utilisateur signent chaque modification dans le journal.

## Sauvegarde et mise à jour

- **Sauvegarde** : celle du répertoire (partage sauvegardé, copie régulière).
- **Mise à jour d'EpiScope** : remplacer `EpiScope.html` par la nouvelle version. Les dossiers, rangés ailleurs, ne sont pas touchés.

## Envoyer un dossier

Nom du patient ▾ › *Exporter le dossier* : archive `.episcope` complète ou légère (voir [Partager un dossier](@rapports#partager-un-dossier)). À envoyer par une messagerie sécurisée de santé.

## La base de référence

[[⋯]] › *Base de référence* ouvre la base des signes : pour chaque signe, ses régions VEP, poids, rôle, source et notes ; et les liens réseau longue distance. Vous pouvez la modifier ; les modifications restent sur le poste. Pour les partager : *Exporter l'app avec cette base* produit un nouveau `EpiScope.html` qui l'embarque. Les tables s'exportent et se réimportent en CSV.

!!! attention
    Modifier la base change les résultats de toutes les crises. Notez vos changements (colonne *source*) et partagez la même version au sein de l'équipe.
