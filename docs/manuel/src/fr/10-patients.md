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
    - **Minimum** : le nom et le prénom (ou rien : le patient reçoit de toute façon un code neutre). Tout le reste se remplit quand l'information arrive.
    - **Repris** : tout ce qui est saisi ici alimente la présentation du staff et les comptes rendus.

## La liste des patients

C'est l'écran d'accueil d'EpiScope. Chaque ligne donne le **code** du patient, son nom (« Prénom NOM »), l'**étape du parcours** où il en est (staff à venir, SEEG, suivi…), le nombre d'explorations et de crises, l'état de l'imagerie et la date de dernière modification. Le champ de recherche filtre par nom, par code ou par étape.

![La liste des patients, avec la bibliothèque (répertoire des dossiers) et l'utilisateur.](shot:library)

En haut de la liste :

- **Bibliothèque** : le répertoire où sont rangés les dossiers. [[Changer de répertoire…]] en choisit un autre (un partage d'équipe, par exemple) ; [[Revenir au stockage du navigateur]] range les dossiers dans le navigateur, sur ce poste seulement.
- **Utilisateur** : vos initiales. Elles signent chaque modification dans le journal du dossier.
- [[Importer un dossier…]] : ouvre une archive `.episcope` reçue d'un collègue.
- [[Exporter la cohorte (CSV)]] : voir [Exporter une cohorte](@rapports#exporter-une-cohorte).
- [[Table de correspondance…]] : la liste code ↔ identité de tous les patients (voir [Identité et code du patient](#identite-et-code-du-patient)).
- [[Corbeille]] : les patients retirés de la liste, à restaurer ou à supprimer définitivement.
- [[Réglages…]] : le préfixe des codes et le nom du centre ; [[Masquer les noms]] remplace les noms par les codes sur ce poste.

En bas de la liste, le pied de page rappelle le statut de l'outil (prototype de recherche, non validé pour un usage clinique) et donne trois liens : [[Aide]] (ce manuel), [[Crédits]] (auteurs des méthodes, atlas et logiciels) et [[Mentions légales]] (propriété intellectuelle, citation, licences des composants, données personnelles).

!!! astuce
    Sur un partage d'équipe, un **verrou** signale qu'un dossier est ouvert par un collègue. Si deux personnes modifient le même dossier en même temps, rien n'est écrasé : la seconde version est gardée à côté, en copie de conflit.

## Créer un patient

[[+ Nouveau patient]], puis le nom et le prénom (par exemple `DUPONT Jeanne` ; facultatif). Le patient reçoit aussitôt son **code** (par exemple `HFAR0007`). Le dossier s'ouvre sur sa **Synthèse** et le parcours commence par une **Phase 1** (vidéo-EEG de scalp). Le sexe, la latéralité et le reste se remplissent dans la carte **Patient** de la synthèse.

À la toute première création, EpiScope demande les **réglages de la bibliothèque** : le préfixe des codes (`HFAR` par défaut), le nombre de chiffres et le nom du centre. Le préfixe et le nombre de chiffres ne changent plus dès qu'un code a été attribué.

Pour retirer un patient : ✕ au bout de sa ligne. Le dossier part à la **corbeille de la bibliothèque** avec tous ses fichiers ; [[Corbeille]] le restaure. La suppression définitive se fait depuis la corbeille, en retapant le code du patient.

## Identité et code du patient

Chaque patient a un **code neutre** : le préfixe du centre suivi d'un numéro (`HFAR0007`). Ce code ne change jamais. Il nomme les fichiers du patient (format BIDS, `sub-HFAR0007`) et le remplace dans les exports anonymisés.

L'**identité** (nom, prénom, date de naissance, IPP) se saisit dans la zone *Identité*, en tête de la carte **Patient** de la synthèse. C'est le seul endroit où elle est enregistrée : elle n'apparaît ni dans les noms de fichiers, ni dans le journal.

- **Affichage** : le nom « Prénom NOM » s'affiche partout dans l'application (liste, barre du dossier, staffs, comptes rendus). Sans identité saisie, c'est le pseudonyme (libellé de travail facultatif), sinon le code.
- **Date de naissance** : celle de l'identité donne le mois et l'année de naissance du patient (âge sur la chronologie) ; ces champs passent alors en lecture seule.
- **Masquer les noms** : [[masquer les noms]] (zone Identité) ou [[Masquer les noms]] (liste des patients) remplace les noms par les codes partout à l'écran, sur ce poste : pour projeter un dossier en enseignement ou partager son écran.
- **Anciens dossiers** : un dossier créé avant la version 1.1 reçoit son code à sa première ouverture (noté au journal). Si son pseudonyme est le nom du patient, [[reprendre le pseudonyme]] remplit nom et prénom (les mots en capitales deviennent le nom).
- **Table de correspondance** : [[Table de correspondance…]] (liste des patients) exporte un fichier CSV *code ; pseudonyme ; nom ; prénom ; date de naissance ; IPP*. C'est un fichier identifiant : à garder dans le système d'information du centre, jamais joint à un partage de recherche. Chaque export est noté au journal des dossiers.

!!! attention
    Pour envoyer des données hors du service, utilisez les **exports anonymisés** (voir [Partager un dossier](@rapports#partager-un-dossier)) : le nom, l'IPP et la date de naissance y sont remplacés par le code.

## La synthèse

La première vue du dossier tient sur un écran :

- en haut, la **chronologie** du parcours : explorations, crises, bilans, staffs, interventions et devenir sur une même frise, avec l'âge du patient ; la molette ou le glisser zoome et déplace ;
- la carte **Patient** : zone *Identité* (nom et prénom, date de naissance, IPP, sur trois lignes), sexe, dominance du langage, âge des premières crises, IRM, **fréquence actuelle des crises** (bouton [[MàJ aujourd'hui]]), traitement, et le **statut du parcours** (en attente, opéré, récusé avec son motif, perdu de vue) : saisi explicitement pour les requêtes de recherche, avec la suggestion tirée du dossier (procédure réalisée, décision « pas de chirurgie ») à appliquer d'un clic ;
- la carte **Parcours** : chaque étape résumée en deux lignes, avec [[ouvrir →]] ;
- les cartes **Imagerie**, **Bilans** et **Implantations**.

![La synthèse du dossier : chronologie, patient, parcours, imagerie, bilans.](shot:dossier-synthese)

## L'histoire clinique

Trois onglets, à remplir dans l'ordre qui vous convient :

- **Antécédents et contexte** : antécédents en *non / oui / ?* avec une précision (le bouton [[non partout]] répond « non » aux lignes restées vides), antécédents médico-chirurgicaux notables, mode de vie, comorbidités, et l'**arbre généalogique** (voir ci-dessous).
- **Histoire de la maladie** : âge et mode de début, étiologie (confirmée ou suspectée), IRM, types de crises, manifestations subjectives et objectives, facteurs déclenchants, fréquence des crises au fil du temps, traitements actuels et passés avec leur effet.
- **Développement et examen** : grossesse et naissance (avec les courbes de poids, taille et périmètre crânien), acquisitions psychomotrices, examen neurologique daté, latéralité (questionnaire d'Édimbourg, test de pointage, œil directeur) et dominance du langage. La carte **Développement actuel** commence par les **comorbidités développementales** à cocher (déficience intellectuelle et sa sévérité, trouble du spectre de l'autisme, spasmes infantiles, retard de langage, troubles graves du comportement) : un clic passe de *non renseigné* à *oui* puis *non* — pour une requête, « non renseigné » n'est pas « non » ; le texte libre reste en dessous.

### Les crises rapportées

Une crise vue hors exploration — **vidéo familiale**, témoignage, crise filmée dans un autre centre — se décrit dans **Histoire de la maladie**, carte **Crises rapportées** : [[+ crise rapportée]] ouvre sa fiche (date, caractère habituel, notes) puis la saisie de la sémiologie, comme pour une crise enregistrée. Ses vidéos se rangent dans la galerie et s'y rattachent.

Quand l'exploration qui la concerne existe (EEG ambulatoire, phase 1, SEEG, vidéo-EEG post-opératoire, deuxième phase 1…), la crise s'y rattache : menu « rattacher à… » de la carte, champ **rattachée à** de sa fiche, ou, depuis l'onglet [[Crises]] de l'exploration, [[⋯]] › [[Rattacher une crise rapportée du dossier…]]. Elle garde sa sémiologie, ses vidéos et ses notes, et compte alors dans la synthèse de cette exploration ; elle reste listée dans la carte, avec l'exploration à laquelle elle est rattachée. Le même menu la replace au dossier si besoin.

Au staff, une crise rapportée **non rattachée** (et datée avant la réunion) est présentée dans une section « Crises rapportées », avant les explorations, et compte dans la concordance ; elle se décoche dans « Crises prises en compte » comme les autres.

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

**Localisation** (IRM, TEP, TEMP, MEG, neuropsychologie) : les systèmes anatomo-fonctionnels concernés (temporal mésial, prémoteur / AMS…), choisis par [[+ région ▾]] ; le côté est celui de la latéralisation du bilan. EpiScope propose les régions citées dans le texte (« Hypersignal T2 AMS droite » → *prémoteur / AMS*) ; un clic les ajoute, rien n'est ajouté seul. La localisation remplit les colonnes IRM, TEP et neuropsychologie du [tableau de concordance du staff](@staff#preparer).

![Les bilans, du plus récent au plus ancien, filtrables par type.](shot:dossier-bilans)

## La galerie

Les captures d'écran, images et vidéos du patient. Pour une capture : outil Capture de Windows (<kbd>Win</kbd>+<kbd>Maj</kbd>+<kbd>S</kbd>), puis <kbd>Ctrl</kbd>+<kbd>V</kbd> dans la galerie, ou glisser un fichier. Chaque élément reçoit un titre, un type (critique, intercritique, stimulation, imagerie…), une vigilance, une crise, une date et des notes ; on peut l'**annoter** (flèches, cercles, texte) et l'exporter en PNG annoté.

Chaque étape a sa galerie (Phase 1, SEEG…) ; celle du Dossier les réunit toutes, regroupées par étape, par crise, par type ou par mois.

Une vidéo importée prend un titre neutre (« Vidéo du 02/06/2021 23:35:43 ») : le nom du fichier d'origine, qui porte souvent le nom du patient, n'est pas gardé. Si ce nom contient la date et l'heure du début, la vidéo est aussitôt **calée** sur l'heure des tracés ; sinon, [[heure de la vidéo…]] le fait (voir [Vidéo et tracé](@phase1#video-et-trace)).

!!! astuce
    Une vidéo trop lourde peut être allégée sur place. Une vidéo dans un format que le navigateur ne lit pas (AVI, WMV…) est convertie sur le poste ; elle n'est jamais envoyée ailleurs.

## Le journal

Toutes les modifications du dossier, datées et signées des initiales de l'utilisateur, regroupées par tranche de dix minutes. Au-dessus du journal, de quoi ne rien perdre :

- **Corbeille du dossier** : tout ce qui est supprimé (une crise, une exploration avec ses crises, un bilan, une image, un commentaire de staff…) y part avec ses dépendances. [[Restaurer]] le remet exactement en place, liens compris ; les fichiers retirés attendent dans le sous-répertoire `trash/` du patient. Rien n'est effacé sans [[Vider la corbeille…]].
- **Versions enregistrées** : à chaque enregistrement, la version précédente du dossier est gardée (toutes celles des dernières 48 heures, puis une par jour pendant trois mois, puis une par mois). [[Aperçu]] la montre en lecture seule, [[Restaurer…]] la rétablit (la version actuelle est gardée elle aussi). [[Créer un point de restauration]] épingle la version du moment avant une opération délicate.
- **Noms de fichiers d'origine** : dans un dossier créé avant la version 1.1, les tracés peuvent encore porter le nom de leur fichier d'origine (souvent le nom du patient). La carte liste les changements ; [[Renommer selon BIDS]] range les fichiers sous leur nom BIDS et donne aux tracés un titre neutre (une version est épinglée avant).

!!! astuce
    Un dossier écrit par une version plus récente d'EpiScope s'ouvre en **lecture seule** : rien n'est réécrit tant que vous n'avez pas mis l'application à jour.

??? plus
    **Où sont les fichiers ?** Dans le répertoire de la bibliothèque, un sous-répertoire par patient (`sub-HFAR0007` pour un patient créé depuis la version 1.1) : `dossier.json` (tout ce qui est saisi), `ses-…/ieeg/` et `ses-…/eeg/` (tracés, nommés selon BIDS), `imaging/` (images), `gallery/` (captures et vidéos), `attachments/` (pièces jointes), `derivatives/` (anatomie calculée, résultats), `history/` (versions) et `trash/` (corbeille). Ce sont des fichiers ordinaires : ils se sauvegardent avec le reste du partage. Voir [Données et confidentialité](@donnees).
