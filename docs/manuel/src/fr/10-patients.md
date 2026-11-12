---
id: patients
title: Patients et dossier
group: path
order: 10
ctx: library>la-liste-des-patients, dossier>la-synthese, dossier/synthese>la-synthese, dossier/antecedents>lhistoire-clinique, dossier/maladie>lhistoire-clinique, dossier/developpement>lhistoire-clinique, dossier/bilans>les-bilans, dossier/galerie>la-galerie, dossier/journal>le-journal
lead: Un patient, un dossier. On y trouve son histoire clinique, ses bilans datés, ses explorations, ses images, ses staffs et son devenir, avec le journal de qui a modifié quoi.
---

# Patients et dossier

!!! bref
    - **Où ?** Liste des patients (<kbd>F9</kbd>), puis l'étape **Dossier** du parcours (<kbd>F4</kbd>).
    - **Minimum** : un pseudonyme. Tout le reste se remplit quand l'information arrive.
    - **Repris** : tout ce qui est saisi ici alimente la présentation du staff et les comptes rendus.

## La liste des patients

C'est l'écran d'accueil d'EpiScope. Chaque ligne donne le pseudonyme, l'**étape du parcours** où en est le patient (staff à venir, SEEG, suivi…), le nombre d'explorations et de crises, l'état de l'imagerie et la date de dernière modification. Le champ de recherche filtre par pseudonyme ou par étape.

![La liste des patients, avec la bibliothèque (répertoire des dossiers) et l'utilisateur.](shot:library)

En haut de la liste :

- **Bibliothèque** : le répertoire où sont rangés les dossiers. [[Changer de répertoire…]] en choisit un autre (un partage d'équipe, par exemple) ; [[Revenir au stockage du navigateur]] range les dossiers dans le navigateur, sur ce poste seulement.
- **Utilisateur** : vos initiales. Elles signent chaque modification dans le journal du dossier.
- [[Importer un dossier…]] : ouvre une archive `.episcope` reçue d'un collègue.
- [[Exporter la cohorte (CSV)]] : voir [Exporter une cohorte](@rapports#exporter-une-cohorte).

En bas de la liste, le pied de page rappelle le statut de l'outil (prototype de recherche, non validé pour un usage clinique) et donne trois liens : [[Aide]] (ce manuel), [[Crédits]] (auteurs des méthodes, atlas et logiciels) et [[Mentions légales]] (propriété intellectuelle, citation, licences des composants, données personnelles).

!!! astuce
    Sur un partage d'équipe, un **verrou** signale qu'un dossier est ouvert par un collègue. Si deux personnes modifient le même dossier en même temps, rien n'est écrasé : la seconde version est gardée à côté, en copie de conflit.

## Créer un patient

[[+ Nouveau patient]], puis un pseudonyme. Le dossier s'ouvre sur sa **Synthèse** et le parcours commence par une **Phase 1** (vidéo-EEG de scalp). Le sexe, la date de naissance, la latéralité et le reste se remplissent dans la carte **Patient** de la synthèse.

Pour supprimer un patient : ✕ au bout de sa ligne, puis retaper son pseudonyme. Tout ce qui s'y rattache est effacé (crises, images, électrodes, staffs, journal).

## La synthèse

La première vue du dossier tient sur un écran :

- en haut, la **chronologie** du parcours : explorations, crises, bilans, staffs, interventions et devenir sur une même frise, avec l'âge du patient ; la molette ou le glisser zoome et déplace ;
- la carte **Patient** : identité pseudonymisée, dominance du langage, âge des premières crises, IRM, **fréquence actuelle des crises** (bouton [[MàJ aujourd'hui]]), traitement ;
- la carte **Parcours** : chaque étape résumée en deux lignes, avec [[ouvrir →]] ;
- les cartes **Imagerie**, **Bilans** et **Implantations**.

![La synthèse du dossier : chronologie, patient, parcours, imagerie, bilans.](shot:dossier-synthese)

## L'histoire clinique

Trois onglets, à remplir dans l'ordre qui vous convient :

- **Antécédents et contexte** : antécédents en *non / oui / ?* avec une précision (le bouton [[non partout]] répond « non » aux lignes restées vides), antécédents médico-chirurgicaux notables, mode de vie, comorbidités, et l'**arbre généalogique** (voir ci-dessous).
- **Histoire de la maladie** : âge et mode de début, étiologie (confirmée ou suspectée), IRM, types de crises, manifestations subjectives et objectives, facteurs déclenchants, fréquence des crises au fil du temps, traitements actuels et passés avec leur effet.
- **Développement et examen** : grossesse et naissance (avec les courbes de poids, taille et périmètre crânien), acquisitions psychomotrices, examen neurologique daté, latéralité (questionnaire d'Édimbourg, test de pointage, œil directeur) et dominance du langage.

### L'arbre généalogique

{refs: pedigree}

L'arbre se dessine directement, à partir du cas index :

1. **Ajouter une personne** : survolez la zone autour d'un apparenté ; un symbole en pointillé montre où la personne ira. Cliquez **au-dessus** pour un parent, **en dessous** pour un enfant (des deux conjoints s'il n'y en a qu'un), **à côté** pour la même génération (frère ou sœur par défaut ; les parents déjà dessinés sont repris). La fenêtre de la nouvelle personne s'ouvre : sexe, statut, identité, précisions médicales. Après un ajout à côté, un bouton la change en **conjoint(e)**.
2. **Relier deux personnes** : glissez d'un symbole à un autre. Dans la même génération, choisissez **union** ou **fratrie** ; entre deux générations voisines, c'est une filiation. Deux parents d'un même enfant sont unis automatiquement.
3. **Corriger un lien** : cliquez le trait. Une fratrie se change en union (et inversement), un lien se supprime. Le menu d'une personne liste aussi tous ses liens.
4. **Ranger** : [[Réorganiser]] replace les enfants sous leurs parents ; <kbd>Maj</kbd> + glisser déplace une personne dans sa rangée ; [[↶ Annuler]] ou <kbd>Ctrl</kbd>+<kbd>Z</kbd> revient en arrière.

La **consanguinité** s'affiche toute seule : une union entre deux personnes qui ont un ancêtre commun dans l'arbre est tracée en double trait, avec leur lien de parenté (cousins germains…) et le coefficient de consanguinité de leurs enfants (F = 1/16 pour des cousins germains). Des frères et sœurs reliés sans que leurs parents soient dessinés comptent comme ayant des parents communs. Si les ancêtres communs ne sont pas dessinés, cochez **consanguinité déclarée** dans le menu de l'union.

![L'arbre généalogique : un clic près d'une personne ajoute un parent, un enfant ou un frère ou une sœur ; chaque personne porte son statut (atteint, possiblement atteint, porteur, décédé).](shot:dossier-antecedents)

## Les bilans

Chaque bilan est daté et typé : vidéo-EEG, IRM, TEP, TEMP, MEG, IRMf, Wada, neuropsychologie (par domaine), psychiatrie… Il porte une conclusion et une latéralisation, et peut être **rattaché à une étape** du parcours. On peut y joindre :

- des **pièces jointes** (compte rendu en PDF, courrier), copiées dans le dossier du patient ;
- des **captures** (EEG standard des urgences, coupe d'IRM), collées par <kbd>Ctrl</kbd>+<kbd>V</kbd> dans le bilan ;
- un lien vers les **images** du dossier : [[voir]] ouvre l'image dans l'écran Imagerie.

![Les bilans, du plus récent au plus ancien, filtrables par type.](shot:dossier-bilans)

## La galerie

Les captures d'écran, images et vidéos du patient. Pour une capture : outil Capture de Windows (<kbd>Win</kbd>+<kbd>Maj</kbd>+<kbd>S</kbd>), puis <kbd>Ctrl</kbd>+<kbd>V</kbd> dans la galerie, ou glisser un fichier. Chaque élément reçoit un titre, un type (critique, intercritique, stimulation, imagerie…), une vigilance, une crise, une date et des notes ; on peut l'**annoter** (flèches, cercles, texte) et l'exporter en PNG annoté.

Chaque étape a sa galerie (Phase 1, SEEG…) ; celle du Dossier les réunit toutes, regroupées par étape, par crise, par type ou par mois.

!!! astuce
    Une vidéo trop lourde peut être allégée sur place. Une vidéo dans un format que le navigateur ne lit pas (AVI, WMV…) est convertie sur le poste ; elle n'est jamais envoyée ailleurs.

## Le journal

Toutes les modifications du dossier, datées et signées des initiales de l'utilisateur, regroupées par tranche de dix minutes.

??? plus
    **Où sont les fichiers ?** Dans le répertoire de la bibliothèque, un sous-répertoire par patient : `dossier.json` (tout ce qui est saisi), `imaging/` (images), `ieeg/` (tracés), `gallery/` (captures et vidéos), `attachments/` (pièces jointes) et `derivatives/` (anatomie calculée, résultats). Ce sont des fichiers ordinaires : ils se sauvegardent avec le reste du partage. Voir [Données et confidentialité](@donnees).
