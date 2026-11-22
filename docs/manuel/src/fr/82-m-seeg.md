---
id: m-seeg
title: "Méthodes : SEEG"
short: "Méthodes : SEEG"
group: more
order: 30
lead: Les quantifications des tracés SEEG, calculées sur place, sans AnyWave ni Matlab. Pour chacune : ce qu'elle mesure, ses réglages par défaut et sa référence.
---

# Méthodes : SEEG

!!! bref
    - **Le début de crise** : EI (rapport d'énergie, délai), cEI (connectivité), PEI (entropie), Empreinte (temps-fréquence), EM (puissance haute fréquence).
    - **L'intercritique** : pointes, ripples et fast ripples (Delphos), force des nœuds h².
    - **Plusieurs crises** : EImax, cEImax, PEImax (valeur maximale de chaque plot).

## Index d'épileptogénicité (EI)

{refs: ei pagehinkley hinkley}

Le rapport d'énergie ER = (Eβ + Eγ) / (Eθ + Eα) est calculé sur une fenêtre glissante de 1 s (θ 3,5–7,4 ; α 7,4–12,4 ; β 12,4–24 ; γ 24–97 Hz). L'algorithme de **Page–Hinkley** détecte le changement de chaque voie (biais ν, seuil λ réglables, l'EI suit en direct). L'EI rapporte l'énergie cumulée 5 s après la détection au délai depuis la première détection, normalisé à 1. Par défaut, la fenêtre d'analyse va du début à la fin de crise annotés, avec 10 s de référence avant le début. **EI ≥ 0,4** : zone épileptogène (rouge) ; 0,1–0,4 : zone de propagation (orange).

## cEI, PEI, h²

{refs: cei pei permentropy h2 lagarde}

- **cEI** : degré sortant d'un réseau h² orienté (12–45 Hz, fenêtres de 3 s), combiné à l'EI de la même fenêtre ; surligné dès 0,6.
- **PEI** : entropie de permutation (ordre 3) sous chaque voie ; rapport du maximum post-critique au minimum critique ; calculé d'emblée si le début et la fin de crise sont annotés.
- **h²** : connectivité non linéaire (Wendling). Sur une crise : liens dirigés fenêtre par fenêtre, rejouables en 3D. En intercritique : force des nœuds (moyenne des liens d'une voie).

## Empreinte de la zone épileptogène

{refs: grinenko li2020}

Temps-fréquence (ondelettes de Morlet, 1–200 Hz) de −20 à +20 s autour du début, rapporté à une référence de 40 s. Les trois éléments de l'empreinte — **pointes préictales**, **activité rapide multibande**, **suppression concomitante** des basses fréquences — sont repérés avec des seuils explicites ; score de 0 à 1, pondéré par le délai (une empreinte précoce l'emporte sur une tardive). Détection simplifiée, sans le classifieur de l'article : à relire sur l'image temps-fréquence.

## Cartes d'épileptogénicité (EM)

{refs: david}

Puissance haute fréquence (120–200 Hz, ou 60–100 Hz sous 512 Hz) par blocs de 0,2 s, test t contre la référence [−10, −1] s, seuil p < 0,05 corrigé. Délai de chaque voie, voies précoces ou tardives, et **carte sur l'IRM** du patient (t étalé dans le cerveau, image dérivée ajoutée aux calques des coupes).

## Pointes et HFO (Delphos)

{refs: delphos crossrate}

Détecteur Delphos (ondelettes, normalisation, forme des îlots) : pointes, ripples, fast ripples par minute et taux croisé, pointes portant une HFO, couplage à l'onde lente. À 512 Hz, l'analyse s'arrête vers 159 Hz : les fast ripples ne sont pas analysables (signalé).

## Valeurs sur les plots

Chaque résultat enregistré devient un **jeu d'analyse** : une valeur par plot ou par paire, affichée en sphères colorées en 3D, sur la parcellation (valeur maximale ou moyenne de la région) et dans les coupes. Des valeurs calculées ailleurs (Excel, CSV) s'importent de la même façon.

## Provenance des résultats

Un résultat calculé en 2026 doit rester interprétable en 2028, même si la méthode a changé entre-temps. Chaque jeu enregistré garde donc une **fiche de provenance**, qui ne se modifie plus :

- la méthode et sa **version**, la version d'EpiScope, la date et l'auteur ;
- les entrées : le tracé (empreinte SHA-256 du fichier), la fenêtre analysée (en temps du tracé et en heure réelle), les marques de début et de fin, le **montage** (cascade, référence, moyenne ou plot de référence), les voies exclues, la correspondance voies → électrodes ;
- tous les paramètres, valeurs par défaut comprises, et les valeurs obtenues.

La pastille du jeu dit où il en est : **à jour** ; **périmé** (le tracé, la fenêtre, le montage ou la correspondance ont changé depuis le calcul) ; **ancienne méthode** (la méthode a changé de version depuis : le résultat reste consultable, un nouveau calcul le complète sans l'effacer) ; **valeurs modifiées à la main** ; **antérieure** (jeu enregistré avant la version 1.1, sans fiche complète). Un clic sur la pastille ouvre l'historique : les calculs successifs du même jeu, chacun avec sa fiche.

!!! methode
    Toute modification de la sortie d'une méthode fait monter son numéro de version (contrôlé par des tests automatiques sur des signaux de référence) et figure dans le journal des modifications d'EpiScope. Une version publiée d'EpiScope n'est jamais modifiée : un ancien calcul peut toujours être rejoué avec la version qui l'a produit.

La base de référence de la sémiologie porte elle aussi une empreinte ; si la base du poste diffère de la base livrée, un avertissement le signale, et chaque crise garde la base et la version du modèle avec lesquelles elle a été calculée.

## Pour aller plus loin

{refs: isnard2018}
