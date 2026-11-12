---
id: phase1
title: Phase 1 : crises et EEG de scalp
short: Phase 1 (vidéo-EEG)
group: path
order: 20
ctx: phase1>decrire-une-crise, phase1/crises>decrire-une-crise, phase1/crise>decrire-une-crise, phase1/inter>lintercritique, phase1/analyses>leeg-de-scalp, phase1/synthese>la-synthese-de-la-phase-1, phase1/galerie>leeg-de-scalp
lead: La phase 1 réunit les crises enregistrées en vidéo-EEG, leur sémiologie signe par signe, l'EEG de scalp et sa synthèse. C'est le cœur d'EpiScope.
---

# Phase 1 : crises et EEG de scalp

!!! bref
    - **Où ?** Étape **Phase 1** du parcours. Onglets : *Intercritique · Crises · Analyses EEG · Synthèse · Galerie*.
    - **Minimum** : décrire les crises habituelles. Le compte rendu d'EEG et les tracés sont un plus.
    - **Temps** : trois à cinq minutes par crise avec la vidéo.

## Les crises de l'exploration

L'onglet [[Crises]] liste les crises de la phase 1 : date et heure, caractère habituel, vigilance, séquence des signes. [[+ Crise]] en ajoute une ; [[ouvrir]] ouvre sa saisie. En bas de l'onglet :

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

[[Vidéo +]] lie une vidéo de la galerie (ou en importe une). Elle s'affiche à gauche de la 3D et pilote le chronomètre : un clic sur l'image met en pause, vous choisissez le signe, il est horodaté au temps de la vidéo ; <kbd>Espace</kbd> reprend ; [[⟲ 0]] fixe t = 0 à l'image affichée. La frise, les flèches et la séquence déplacent la vidéo.

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
- **carte 10-20** des pointes et des ondes lentes : intensité 1 à 3 par électrode, rendue en carte d'amplitude, avec la topographie écrite (« frontopolaires et frontales gauches (max. Fp1) ») ;
- **tracés et captures** intercritiques, datés, en veille ou en sommeil (<kbd>Ctrl</kbd>+<kbd>V</kbd>).

![L'intercritique : compte rendu, épreuves d'activation et cartes 10-20.](shot:phase1-inter)

## L'EEG de scalp

L'onglet [[Analyses EEG]] reçoit les **tracés** eux-mêmes : EDF, EDF+, BDF, BrainVision, exports Brainquick ou Micromed. [[+ Importer un tracé…]], ou glisser les fichiers sur la carte. Chaque tracé est rangé par jour d'enregistrement ; une crise du dossier dont l'heure tombe dans le tracé lui est rattachée d'elle-même.

Sous chaque tracé apparaissent ses post-traitements : pointes et groupes, hypnogramme, imagerie de source, captures de pages.

!!! attention
    Le titre d'un tracé reprend le nom du fichier, qui contient parfois le nom du patient. Renommez-le ([[⋯]] de la carte › *Renommer…*) : ce titre apparaît au staff et dans les comptes rendus.

![Une carte de tracé : crises reliées, pointes détectées, sommeil, sources.](shot:phase1-analyses)

### Relire un tracé

[[Revoir]] ouvre la visionneuse plein écran :

- montage (monopolaire, double banane, transverse, référence moyenne, laplacien), page de 2 à 60 s, gain (<kbd>Ctrl</kbd>+molette), filtres passe-haut, passe-bas et coupe-bande ;
- <kbd>←</kbd> <kbd>→</kbd> : page précédente ou suivante (<kbd>Maj</kbd> : une seconde) ; glisser pour défiler ;
- clic droit : marquer le début ou la fin d'une crise, poser une marque ;
- l'aperçu en bas montre tout l'enregistrement ; un clic s'y rend.

![La visionneuse de tracé.](shot:eeg-viewer)

### Pointes et imagerie de source

{refs: spikenet janca sloreta lcmv}

Dans la visionneuse, le panneau **Quantification** › [[Pointes → source]] :

1. **Détecter** : SpikeNet (réseau entraîné sur des milliers d'EEG annotés par des experts) parcourt le tracé ; le seuil se règle (0,5 = la majorité des experts).
2. **Relire les groupes** : les pointes sont réunies par topographie, chaque groupe avec sa pointe moyennée et sa carte. Fusionner, scinder, supprimer un groupe d'artefacts.
3. **Retoucher** : retirer une pointe détectée à tort (<kbd>Suppr</kbd> ou clic droit), en ajouter une oubliée (clic droit › *Ajouter une pointe ici*). Les ajouts à la main sont marqués ◆ et se parcourent à part.
4. **Chercher la source** : sLORETA, dipôle équivalent et faisceau LCMV, sur l'anatomie du patient si elle existe (modèle de tête BEM), sinon sur le gabarit.

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
