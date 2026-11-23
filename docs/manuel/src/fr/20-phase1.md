---
id: phase1
title: Phase 1 : crises et EEG de scalp
short: Phase 1 (vidéo-EEG)
group: path
order: 20
ctx: phase1>vue-densemble, phase1/apercu>vue-densemble, phase1>decrire-une-crise, phase1/crises>decrire-une-crise, phase1/crise>decrire-une-crise, phase1/inter>lintercritique, phase1/analyses>leeg-de-scalp, phase1/synthese>la-synthese-de-la-phase-1, phase1/galerie>leeg-de-scalp
lead: La phase 1 réunit les crises enregistrées en vidéo-EEG, leur sémiologie signe par signe, l'EEG de scalp et sa synthèse. C'est le cœur d'EpiScope.
---

# Phase 1 : crises et EEG de scalp

!!! bref
    - **Où ?** Étape **Phase 1** du parcours. Onglets : *Vue d'ensemble · Intercritique · Crises · Analyses · Synthèse · Galerie*.
    - **Minimum** : décrire les crises habituelles. Le compte rendu d'EEG et les tracés sont un plus.
    - **Temps** : trois à cinq minutes par crise avec la vidéo.

## Vue d'ensemble

L'onglet [[Vue d'ensemble]] s'ouvre en premier. Il réunit ce qu'est l'exploration et où elle en est :

- **libellé, dates de début et de fin, centre, statut** et **notes** (déroulement, sevrage, incidents ; les notes des anciennes « séances » y ont été versées) ;
- les **compteurs** (crises habituelles et décrites, tracés, vidéos) et l'état du compte rendu (rythme de fond, intercritique, critique, conclusion) ;
- une **frise** des jours de l'exploration (J1, J2…) : tracés importés en bandes à l'heure réelle (violet : avec crise, bleu : intercritique), crises en losanges (pleins : décrites ; vides : à décrire). Un clic sur une crise l'ouvre. Une crise rapportée rattachée mais datée loin de l'exploration est citée sous la frise sans l'étirer ;
- la **liste des crises** et celle des **tracés importés**, avec un lien vers les onglets [[Crises]] et [[Analyses]].

## Les crises de l'exploration

L'onglet [[Crises]] liste les crises de la phase 1, regroupées par jour d'enregistrement (J1, J2… d'après leur date) : date et heure, caractère habituel, vigilance, séquence des signes. [[+ Crise]] en ajoute une ; [[ouvrir]] ouvre sa saisie ; [[⋯]] › [[Rattacher une crise rapportée du dossier…]] y range une vidéo familiale décrite avant l'hospitalisation (voir [les crises rapportées](10-patients.md#les-crises-rapportees)). En bas de l'onglet :

Chaque crise porte quatre **pastilles d'état** : *sémiologie* (nombre de signes, ou « à décrire »), *vidéo*, *tracé* (début de crise marqué, ou « début ? ») et *analyses*. On voit d'un coup d'œil, sur une vidéo-EEG d'une ou deux semaines, les crises quantifiées mais pas encore décrites, et l'inverse.

- **Crises annotées dans les tracés** : les débuts de crise trouvés dans les fichiers importés (une nuit peut en contenir plusieurs) apparaissent en tête de l'onglet s'ils n'ont pas de fiche. [[créer la fiche]] crée la crise à l'heure du tracé et y marque le début (et la fin si elle est annotée) ; [[rattacher à …]] la relie à la crise déjà saisie à la même heure (à 2 min près). Deux exports qui se recouvrent (la nuit entière et un segment de crise, par exemple) sont signalés, et la crise n'est comptée qu'une fois.
- **Reprendre la sémiologie** : [[⋯]] d'une crise › [[Reprendre la sémiologie de…]] copie les signes d'une autre crise du dossier (crises stéréotypées, crise rapportée), avec leurs temps ; il reste à ajuster les marqueurs. L'état d'avant reste dans l'historique du dossier.

- **EEG critique** et **post-critique** : description pour l'ensemble des crises, avec des phrases types ([[phrases ▾]]) et un texte proposé ([[proposer]]) ;
- **Événements enregistrés** : crises épileptiques, crises fonctionnelles dissociatives, autres manifestations (malaise, parasomnie, attaque de panique…) ;
- la **carte 10-20** du début des crises : un clic sur une électrode augmente l'intensité, un clic droit l'efface.

![L'onglet Crises : la liste, l'EEG critique et la carte du début des crises.](shot:phase1-crises)

## Décrire une crise

L'écran d'une crise a trois colonnes et une frise :

![① mode de saisie et chronomètre ; ② côté du signe suivant ; ③ recherche et palette des signes ; ④ séquence saisie ; ⑤ vue 3D ; ⑥ résultats ; ⑦ frise.](shot:crise-workspace-annot)

### Trois modes de saisie

| Mode | Quand l'utiliser |
|---|---|
| [[Chrono]] | Vous regardez la vidéo. <kbd>Espace</kbd> démarre le chronomètre au premier signe (t = 0), le met en pause et le relance avec la vidéo. Chaque signe est horodaté au temps du chronomètre. |
| [[Séquence]] | Vous connaissez l'ordre des signes mais pas leur timing. Les signes sont espacés régulièrement. |
| [[Manuel]] | Vous recopiez les temps d'un compte rendu. |

### Ajouter un signe

- Tapez quelques lettres dans la recherche (« peur », « automat », « version »), puis <kbd>Entrée</kbd>. Le vocabulaire suit la classification ILAE ; les synonymes courants sont reconnus.
- Ou cliquez sur une pastille de la palette, rangée par catégorie (auras, signes cognitifs et émotionnels, moteurs, automatismes, végétatifs, post-critiques).
- Le **côté** se règle avant (touches <kbd>1</kbd> gauche, <kbd>2</kbd> droite, <kbd>3</kbd> bilatéral, <kbd>4</kbd> inconnu, ou boutons [[Gauche]] [[Droite]] [[Bilat.]] [[?]]) ou après, dans la séquence. Pour les signes qui en ont une, une **topographie** est proposée (face, membre supérieur…).

!!! astuce
    Dès que vous tapez une lettre, le curseur va dans la recherche : inutile de cliquer dessus.

### Avec la vidéo dans EpiScope

[[Vidéo +]] lie une vidéo de la galerie (ou en importe une). Elle s'affiche à gauche de la 3D et pilote le chronomètre : un clic sur l'image met en pause, vous choisissez le signe, il est horodaté au temps de la vidéo ; <kbd>Espace</kbd> reprend ; [[⟲ 0]] fixe t = 0 à l'image affichée. La frise, les flèches et la séquence déplacent la vidéo. Si une vidéo calée sur l'heure des tracés couvre le début de la crise, elle est trouvée toute seule, déjà placée au début de la crise (voir [Vidéo et tracé](#video-et-trace)).

### Corriger la séquence

La frise en bas se manipule comme un montage vidéo :

- **glisser le milieu** d'une barre la déplace, **glisser un bord** change le début ou la fin (pas de 0,1 s, aimant sur la tête de lecture et sur les autres signes ; <kbd>Alt</kbd> pour s'en passer) ;
- **clic droit** sur un signe (frise ou séquence) : côté, topographie, certitude ;
- **double-clic** : tous ses paramètres ;
- poignée ⋮⋮ dans la séquence : réordonner ; <kbd>Suppr</kbd> : retirer le signe choisi.

Les champs **EEG début / fin** en haut à gauche situent le début électrique par rapport au premier signe clinique (négatif si l'EEG précède la clinique) : la latence clinique compte dans le raisonnement.

![La frise : chaque signe est une barre qu'on déplace ou qu'on étire.](shot:crise-frise)

## Lire le résultat

[[▶ Lecture]] (ou <kbd>Maj</kbd>+<kbd>Espace</kbd>) rejoue la crise : les régions s'allument quand elles deviennent plausibles, le réseau se dessine entre elles. Les flèches <kbd>←</kbd> <kbd>→</kbd> avancent d'une demi-seconde.

Le panneau de droite a quatre onglets :

| Onglet | Ce qu'il montre |
|---|---|
| [[Réseau à t]] | Les régions plausiblement actives à l'instant affiché, avec leur score (0 à 1) et le signe qui les justifie (*évidence directe*, *relais*, *propagation*). |
| [[Origine]] | Les régions d'où la crise peut être partie, classées, avec la latéralisation (barre gauche / droite) et les hypothèses de réseau H1 à H4. Une région sans signe propre est marquée « silencieuse ? ». |
| [[Cibles]] | Les régions à échantillonner si l'on envisage une SEEG : candidates d'origine, zones symptomatogènes précoces, relais. |
| [[Modèle]] | Les réglages du calcul et la classification ILAE de la crise, dérivée de la séquence. |

![L'onglet Origine : régions candidates, latéralisation, hypothèses de réseau.](shot:crise-origine)

!!! attention
    Les scores mesurent la **compatibilité** d'une région avec la séquence saisie, à partir de la littérature. Ce ne sont pas des probabilités de zone épileptogène. Voir [Le modèle sémiologie → régions](@m-semiologie).

[[‹]] [[›]] en haut de l'écran passent à la crise voisine.

## L'intercritique

L'onglet [[Intercritique]] rassemble le compte rendu de l'EEG intercritique :

- **rythme de fond** et **anomalies intercritiques**, avec phrases types ([[phrases ▾]]) et textes proposés d'après la carte ([[proposer]]) ;
- **épreuves d'activation** : SLI (simple ou détaillée par fréquence), hyperpnée, autres (privation de sommeil, lecture, calcul…) ;
- **cartes 10-20** des pointes et des ondes lentes, **en veille et au sommeil** (les anomalies et les foyers diffèrent souvent) : intensité 1 à 3 par électrode, rendue en carte d'amplitude, avec la topographie écrite (« frontopolaires et frontales gauches (max. Fp1) »). Une carte saisie avant la version 2.0, sans vigilance, reste affichée à part avec [[→ veille]] et [[→ sommeil]] pour la ranger ;
- **tracés et captures** intercritiques, datés, en veille ou en sommeil (<kbd>Ctrl</kbd>+<kbd>V</kbd>).

![L'intercritique : compte rendu, épreuves d'activation et cartes 10-20.](shot:phase1-inter)

## L'EEG de scalp

L'onglet [[Analyses]] reçoit les **tracés** eux-mêmes : EDF, EDF+, BDF, BrainVision, exports Brainquick ou Micromed. [[+ Importer un tracé…]], ou glisser les fichiers sur la carte. Les tracés sont séparés en **Analyses critiques** (tracés avec crise, synthèse des crises) et **Analyses intercritiques** (pointes, sommeil, sources), chacun rangé par jour d'enregistrement ; un long tracé qui contient des crises est rangé avec les crises et signalé dans l'intercritique. Une crise du dossier dont l'heure tombe dans le tracé lui est rattachée d'elle-même.

Un tracé qui contient à la fois des crises et de l'intercritique (une nuit, par exemple) figure dans les deux parties : ses analyses critiques avec les crises, ses analyses intercritiques (pointes, groupes, sources des pointes, sommeil) avec l'intercritique ; ces dernières sont aussi reprises dans l'onglet [[Intercritique]]. Le titre d'un tracé (dans la visionneuse) ou [[⋯]] › [[Informations du tracé…]] sur sa carte ouvre ses informations : titre, nature, vigilance et notes modifiables ; heure de début et de fin, durée, blocs et coupures, voies, fichiers et avertissements de lecture en entier.

Sous chaque tracé apparaissent ses post-traitements : pointes et groupes, hypnogramme, imagerie de source, captures de pages.

!!! bref
    Un tracé importé est rangé sous un **nom BIDS** fondé sur le code du patient (`sub-HFAR0007_ses-scalp1_task-seizure_run-01_eeg.edf`) et reçoit un **titre neutre** (« Crise · 02/06/2021 23:30 · run 01 ») : le nom du fichier d'origine, qui contient souvent le nom du patient, n'est gardé nulle part. Le titre se change au besoin ([[⋯]] de la carte › *Renommer…*).

![Une carte de tracé : crises reliées, pointes détectées, sommeil, sources.](shot:phase1-analyses)

### Relire un tracé

[[Revoir]] ouvre la visionneuse plein écran :

- montage (monopolaire, double banane, transverse, référence moyenne, laplacien), page de 2 à 60 s, gain (<kbd>Ctrl</kbd>+molette), filtres passe-haut, passe-bas et coupe-bande ;
- polarité de la convention EEG : **négatif vers le haut** (une déflexion négative monte, comme sur les logiciels d'acquisition) ;
- <kbd>←</kbd> <kbd>→</kbd> : page précédente ou suivante (<kbd>Maj</kbd> : une seconde) ; glisser pour défiler ;
- clic droit : marquer le début ou la fin d'une crise, poser une marque ; [[Marques ▾]] les liste pour s'y rendre ;
- **heure réelle** : l'axe et le curseur donnent l'heure du poste d'acquisition (avec la date après minuit) ; [[Heure]] | [[t]] bascule vers le temps depuis le début du tracé.

La **frise** en bas montre tout l'enregistrement, avec la règle des heures, l'activité, les crises (bandes rouges, cliquables), les coupures d'un EDF discontinu (hachures, avec leur durée) et la page affichée (cadre jaune). Un clic ou un glisser s'y rend ; la **molette** zoome autour du pointeur ; [[⤢ tout le tracé]] ou un double-clic revient au tracé entier. Le menu *crise* du haut se place sur une crise ; la frise garde la vue d'ensemble.

!!! attention
    Un enregistrement **discontinu** (EDF+D : pauses, coupures) est affiché bloc après bloc, sans les trous ; l'heure réelle, elle, tient compte des coupures. Chaque marque est enregistrée aussi à son heure réelle, ce qui la garde à sa place même si la lecture du fichier change.

### Vidéo et tracé

Une vidéo de la galerie se **cale** sur l'heure des tracés : on connaît l'heure de son début, et chaque instant de la vidéo correspond à une heure du tracé. Plusieurs vidéos peuvent couvrir un même tracé (plusieurs caméras, fichiers découpés).

- **À l'import** : si le nom du fichier contient la date et l'heure du début (`…20210602_223543…`), la vidéo est calée tout de suite.
- **Fenêtre « Heure de la vidéo »** (galerie : [[heure de la vidéo…]] ; visionneuse : ⚙ du panneau vidéo) : l'heure du début (`2021-06-02 22:03:43`, ou seulement `22:03:43` avec la date du tracé), le tracé associé, et des **points de synchronisation** — le même évènement repéré dans la vidéo et dans le tracé (artefact de mouvement, début clinique). Un point corrige le décalage ; deux points éloignés ou plus corrigent aussi la dérive de l'horloge de la caméra. La fenêtre indique l'écart de chaque point et où tombe chaque crise : « Crise 1 (22:05:00) → vidéo à 1:17 », ou « … avant le début de la vidéo ».
- **Dans la visionneuse** : [[▶ Vidéo]] ouvre un panneau (déplaçable par sa barre, redimensionnable par le coin) qui montre la vidéo couvrant le curseur et la suit quand on navigue ; pendant la lecture, c'est le tracé qui suit la vidéo. Hors de toute vidéo, le panneau affiche « Pas de vidéo calée à … ». [[📍 point]] ajoute un point de synchronisation : mettez la vidéo et le curseur du tracé sur le même évènement, puis cliquez.
- Les vidéos calées apparaissent en **bandes bleues** sur la frise du tracé.

Exemple : tracé commencé à 19:30, vidéo commencée à 22:03:43, crise annotée à 22:01 dans le tracé : la fenêtre signale que la crise est 2 min 43 s avant le début de la vidéo, et le panneau affiche « Pas de vidéo calée à 22:01:00 ».

![La visionneuse de tracé.](shot:eeg-viewer)

### Pointes et imagerie de source

{refs: spikenet janca sloreta lcmv}

Dans la visionneuse, le panneau **Quantification** › [[Pointes → source]] :

1. **Détecter** : SpikeNet (réseau entraîné sur des milliers d'EEG annotés par des experts) parcourt le tracé ; le seuil se règle (0,5 = la majorité des experts).
2. **Relire les groupes** : les pointes sont réunies par topographie, chaque groupe avec sa pointe moyennée et sa carte. Fusionner, scinder, supprimer un groupe d'artefacts.
3. **Retoucher** : retirer une pointe détectée à tort (<kbd>Suppr</kbd> ou clic droit), en ajouter une oubliée (clic droit › *Ajouter une pointe ici*). Les ajouts à la main sont marqués ◆ et se parcourent à part. Sans détection automatique, clic droit › *Marquer une pointe ici (moyennage à la main)* : les pointes marquées forment un groupe, moyenné et localisé comme les autres. Sur le tracé, chaque pointe d'un groupe choisi est entourée d'une bande colorée de 350 ms, avec un trait fin à l'instant de la pointe ; la pointe moyennée (vue « papillon ») est dessinée à la même échelle de temps que le tracé, pour que le grapho-élément garde sa forme.
4. **Chercher la source** : sLORETA, dipôle équivalent et faisceau LCMV, sur l'anatomie du patient si elle existe (modèle de tête BEM), sinon sur le gabarit.

**SpikeNet2** (Li et al., NEJM AI 2025), entraîné sur plus de 17 000 EEG avec une recherche des faux positifs difficiles, peut remplacer SpikeNet dans [[Réglages]] › détecteur. Ses poids ne sont pas livrés avec EpiScope : la BDSP (bdsp.io) les distribue sous licence restreinte à des utilisateurs accrédités. Celui qui les détient les ajoute une fois par [[Ajouter les poids de SpikeNet2…]] (ou Patients › [[Réglages]] › Modèles ajoutés) en choisissant le point de contrôle des auteurs (`new_weights.ckpt`, environ 370 Mo) : EpiScope en lit le réseau, le vérifie et le range dans la bibliothèque (dossier `models`, environ 120 Mo), jamais dans un dossier patient ni un export. Chaque détection note l'empreinte des poids utilisés. Le calcul est plus long que SpikeNet (quelques minutes par heure d'EEG sur un poste récent) ; le filtre propre au patient reste réservé à SpikeNet.

L'onglet [[Début de crise → source]] fait de même pour la fenêtre du début de crise (fréquence dominante, composantes).

![Pointes → source : groupes de pointes, pointe moyennée, topographie et source.](shot:spikes-esi)

### Le sommeil

{refs: yasa}

L'onglet [[Sommeil]] propose un **hypnogramme** automatique (veille, N1, N2, N3, sommeil paradoxal) par YASA. La case [[relire et corriger, époque par époque]] fait défiler le tracé par époques de 30 s : les touches <kbd>W</kbd> <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>R</kbd> cotent l'époque et passent à la suivante. Les époques corrigées sont marquées en orange.

![L'hypnogramme, avec les crises et les pointes au fil de la nuit.](shot:sleep)

## La synthèse de la phase 1

L'onglet [[Synthèse]] réunit toutes les crises : latéralisation et régions d'origine candidates **en consensus** (les crises habituelles comptent double), tableau de comparaison des crises signe par signe, hypothèses récurrentes, et une vue 3D des régions candidates et des réseaux.

![La synthèse : consensus des crises et comparaison signe par signe.](shot:phase1-synthese)

??? plus
    **Plusieurs explorations de scalp ?** [[+]] › *Vidéo-EEG de scalp* en ajoute une ; chacune a ses crises, son EEG et sa synthèse. **Classification ILAE** : elle est dérivée de la séquence (début focal moteur ou non moteur, conscience, évolution bilatérale) et reste modifiable.
