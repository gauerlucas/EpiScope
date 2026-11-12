---
id: m-eeg
title: "Méthodes : EEG de scalp"
short: "Méthodes : EEG"
group: more
order: 20
lead: Détection des pointes, groupes de même topographie, imagerie de source et stadification du sommeil. Chaque méthode est réécrite pour tourner dans le navigateur, sans serveur.
---

# Méthodes : EEG de scalp

!!! bref
    - **Pointes** : SpikeNet (au niveau des experts au scalp), Janča (intracrânien), filtre facultatif appris de votre relecture.
    - **Source** : sLORETA, dipôle équivalent et LCMV, sur un modèle de tête BEM du patient.
    - **Sommeil** : YASA, puis relecture époque par époque.

## Détection des pointes

{refs: spikenet janca}

**SpikeNet** est le détecteur par défaut des tracés de scalp. C'est un réseau convolutif entraîné sur 9 571 EEG de scalp et 13 262 pointes candidates annotées par huit neurophysiologistes ; sa sortie est calibrée comme la proportion d'experts qui jugeraient la fenêtre comme une pointe (aire sous la courbe 0,98, au niveau des experts). Les poids publiés par les auteurs sont embarqués (licence CC BY-NC 4.0 : usage non commercial). Il utilise les 19 électrodes du système 10-20 (jusqu'à quatre manquantes sont interpolées), des fenêtres de 1 s, et un seuil réglable (0,5 = majorité des experts).

Le détecteur de **Janča** (modélisation de la distribution de l'enveloppe du signal) est celui des tracés intracrâniens, et un choix possible au scalp.

**Filtre propre au patient** (facultatif, « Apprendre de ma relecture ») : après la relecture des groupes, un classifieur appris sur vos choix retire des détections celles qui ressemblent aux rejetées. Il ne fait que retirer, et n'est retenu que si la validation croisée conserve au moins 85 % des pointes gardées. Les pointes ajoutées à la main ne lui servent pas d'exemples.

## Groupes et pointe moyennée

Les pointes sont réunies en **groupes de même topographie** (au moins trois pointes). Chaque groupe a sa pointe moyennée, sa carte et son taux par minute. Les groupes se fusionnent, se scindent ou se suppriment ; chaque pointe se retire ou s'ajoute à la main.

## Imagerie de source

{refs: sloreta lcmv openmeeg parradiaz}

La source est cherchée **à mi-montée** de la pointe moyennée (là où le générateur initial domine la propagation), avec trois méthodes complémentaires :

- **sLORETA** : solution distribuée normalisée sur le cortex ;
- **dipôle équivalent** : un seul générateur, avec sa qualité d'ajustement (GOF) et une ellipse de confiance ;
- **faisceau LCMV** : filtre spatial à variance minimale.

Le **modèle de tête** est un BEM à trois couches (scalp, crâne, cerveau) construit sur l'anatomie du patient quand elle existe, sinon sur le gabarit ; les électrodes de scalp sont posées sur la tête du patient. La concordance lobaire des méthodes est signalée : elle augmente la confiance.

!!! attention
    Avec 19 à 25 électrodes, la résolution spatiale est de l'ordre du lobe ou du sous-lobe. Un générateur profond ou étendu peut être mal localisé ; une source discordante avec le reste du dossier doit faire relire les pointes.

## Stadification du sommeil

{refs: yasa}

**YASA** cote chaque époque de 30 s (veille, N1, N2, N3, sommeil paradoxal) à partir d'une voie EEG centrale, avec l'EOG et l'EMG s'ils existent. Évalué sur des nuits publiques cotées par des experts : 82 % d'accord (κ 0,76) sur trois nuits Sleep-EDF, 73 % (κ 0,62) sur la nuit d'exemple de YASA ; N1 et les transitions sont les moins fiables, comme dans la littérature. D'où la relecture époque par époque.
