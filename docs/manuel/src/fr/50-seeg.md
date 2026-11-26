---
id: seeg
title: La SEEG
group: path
order: 50
ctx: seeg>planifier, seeg/planif>planifier, seeg/loc>localiser-les-electrodes, seeg/inter>lintercritique-seeg, seeg/crises>les-crises-seeg, seeg/crise>les-crises-seeg, seeg/analyses>analyser-les-traces, seeg/stim>stimulations, seeg/thermo>thermocoagulations, seeg/galerie>analyser-les-traces, seeg/rapport>le-rapport-seeg
lead: De la planification au rapport : schéma d'implantation, électrodes réelles sur le scanner, crises plot par plot, tracés et index d'épileptogénicité, stimulations, thermocoagulations.
---

# La SEEG

!!! bref
    - **Où ?** Étape **SEEG** du parcours, créée par une décision de staff ou par [[+]] › *SEEG*.
    - **Les onglets suivent l'ordre du travail** : Vue d'ensemble (dates, frise des tracés et des crises, comme en [phase 1](20-phase1.md#vue-densemble)) · 1 Planification · 2 Localisation · 3 Intercritique · 4 Crises · 5 Analyses (critiques, puis intercritiques) · 6 Stimulations · 7 Thermocoagulations · 8 Galerie · 9 Rapport SEEG.
    - **Rien n'est obligatoire** : on peut ne saisir que les stimulations, ou seulement le rapport.

## Planifier

L'onglet [[Planification]] montre le schéma d'implantation en 3D et sa liste d'électrodes. En tête, l'**état du schéma** (proposé, prévu, réel) et la **couverture des hypothèses** du staff : chaque hypothèse dit si sa zone d'origine est échantillonnée.

- [[Proposer ▾]] : EpiScope choisit, parmi les trajectoires conventionnelles (nomenclature de Talairach et Bancaud, prime = gauche), le plus petit ensemble qui échantillonne les origines, zones symptomatogènes et relais des hypothèses, sans croisement.
- [[+ Au clic]] : ajouter une électrode en cliquant sur la cible ; [[+ Type ▾]] : une trajectoire conventionnelle par son nom. Parmi elles, deux **verticales** frontales : **BM** (entrée F1, descente vers le gyrus droit) et **BL** (entrée F2, descente vers le cortex orbitofrontal). Depuis la version 3.0, chaque trajectoire de la bibliothèque est définie par sa pointe et son point d'entrée en coordonnées MNI (jeu placé et corrigé à la main par un épileptologue, gauche et droite symétriques) ; s'y ajoutent **FA** et **PO** (cingulaires moyens antérieur et postérieur), **LI** (planum temporale), **O** (pôle occipital), **Ib** (insulaire oblique antérieure) et **PB** (cunéus supérieur vers le gyrus angulaire). Les électrodes **BM**, **Im**, **Ip** (3 × 6 plots espacés) et **BL**, **Ia** (3 × 5) sont proposées par défaut en modèles à groupes espacés, pour échantillonner plus loin vers la sortie.
- **Modèle** d'électrode et marque (DIXI, Alcis) : les plots sont posés aux cotes du catalogue.
- [[Importer la planification chirurgicale…]] : une fois les trajectoires arrêtées par le neurochirurgien, lire un export ROSA (`.ros`), un CSV (nom, entrée, cible) ou un `electrodes.tsv` BIDS. Chaque trajectoire est appariée par son nom à l'électrode du schéma.

![La planification : le schéma en 3D, la couverture des hypothèses et la liste des électrodes.](shot:seeg-planif)

## Localiser les électrodes

L'onglet [[Localisation]] place les **électrodes réelles** sur le scanner post-implantation, en deux temps :

1. **Scanner post-implantation** : importer le scanner (ou choisir celui déjà importé dans Dossier › Imagerie) ; il est recalé sur le T1.
2. **Reconstruction et vérification** : [[Détecter]] trouve le métal, trace les électrodes et pose les plots aux cotes du modèle ; les noms sont appariés au schéma prévu. Un bilan en tête indique les électrodes retrouvées, manquantes, hors schéma ou en double.

Ensuite, **une électrode à la fois** : un clic sur une électrode aligne les coupes sur son axe (plots cerclés et numérotés sur le métal, trajectoire prévue en pointillé). On corrige le nombre de plots, le modèle ou le nom, puis [[✓]] la valide. [[+ à la main]] trace une électrode que la détection a manquée (pointe puis entrée dans les coupes).

![La localisation : la liste des électrodes avec leur statut, les coupes alignées sur l'électrode choisie.](shot:seeg-loc)

!!! attention
    La détection est automatique : vérifiez chaque électrode (pointe, nombre de plots, modèle) avant de la valider. Le scanner est recalé de façon rigide ; le déplacement du cerveau après l'implantation n'est pas corrigé.

## L'intercritique SEEG

L'onglet [[Intercritique]] rassemble le compte rendu : acquisition, rythme de fond en veille et en sommeil, activités physiologiques, foyer lent, grapho-éléments pathologiques par plots, et un tableau **par électrode** (localisation des plots d'après la parcellation du patient, activité recueillie). Chaque rubrique a ses phrases types ([[phrases ▾]]).

La carte **Pointage des plots**, en tête de l'onglet, se remplit comme les plots de début d'une crise : choisissez une catégorie — [[Rythme lésionnel]] ou un groupe de pointes ([[+ groupe de pointes]]) — puis cliquez les plots ; un glisser ajoute (ou retire) tous les plots survolés. Un **groupe de pointes** réunit des plots aux pointes synchrones, avec sa fréquence (fréquentes, occasionnelles, rares), la vigilance, le moment (jour, heure, tracé intercritique) et une description ; [[dupliquer]] crée le même groupe pour un autre moment, plus ou moins fréquent selon le jour ou le sommeil. Les **quantifications intercritiques** de l'onglet Analyses (taux de pointes, HFO, détection SpikeNet2…) sont listées dessous : ouvrez un jeu pour voir ou modifier ses valeurs ; [[→ groupe]] reprend ses plots les plus forts (au moins la moitié du maximum). Le rapport SEEG propose la zone lésionnelle électrique et la zone irritative d'après ce pointage.

## Les crises SEEG

Une crise SEEG se décrit comme en phase 1 (sémiologie, frise). L'onglet [[Électrique]], en premier dans le panneau de droite, marque **plot par plot** :

- le **début** de la crise, la propagation **précoce** et **tardive** (clics répétés sur les pastilles des plots) ;
- l'aspect du début (activité rapide de bas voltage, pointes rythmiques, DC-shift…) et une description électrique et clinique.

Les plots marqués apparaissent en 3D et dans les coupes ([[Coupes IRM]] ; case « plots de la crise » de [[Multimodalité ▾]], parcellation « régions des plots de la crise »), et nourrissent la concordance, la proposition des zones du rapport et le staff. [[Affichage ▾]] › *Crise SEEG* colore le cortex et les plots par l'activation du modèle, par les régions des plots marqués, ou ne les colore pas.

L'onglet [[Quantifs]], à côté d'Électrique, montre les jeux de l'onglet Analyses rattachés à la crise ouverte (EI, cEI, PEI, empreinte…) : l'œil les affiche dans la vue active, un jeu ouvert montre ses valeurs (modifiables), et une ligne indique combien de plots marqués « début » figurent parmi ses cinq valeurs les plus fortes.

![Une crise SEEG : l'onglet Électrique, plots de début et de propagation marqués sur les électrodes.](shot:seeg-crise)

## Analyser les tracés

{refs: ei cei pei h2 grinenko david delphos}

L'onglet [[Analyses]] reçoit les **tracés SEEG** (EDF, BrainVision, exports Brainquick et Micromed, BIDS iEEG) : [[+ Importer un tracé…]]. Les tracés sont rangés en *Crises* et *Intercritique* ; un tracé de crise se lie à sa crise.

Les tracés importés sont rangés sous leur nom BIDS (`sub-HFAR0007_ses-seeg1_task-seizure_run-01_ieeg.edf`) avec un titre neutre, comme en phase 1.

[[Ouvrir]] lance la visionneuse : page, gain, filtres, électrodes affichées, heure réelle et frise de navigation comme en [phase 1](@phase1#relire-un-trace), vidéo calée ([Vidéo et tracé](@phase1#video-et-trace)). Deux réglages indépendants organisent les voies :

- **Référence** : [[Cascade]] (paires de plots voisins sur la même électrode, A’1-A’2, A’2-A’3… ; un plot absent du fichier n'est jamais « ponté », le trou est signalé dans la gouttière), [[Référence]] (référence d'enregistrement du fichier), [[Moyenne]] (moyenne commune des plots), [[Plot ▾]] (un plot de référence choisi, en général en substance blanche : les plots en substance blanche sont proposés en premier, avec leur région et leur amplitude, pour choisir un plot calme).
- **Disposition** ([[Disposition ▾]]) : par électrode, ou **anatomique** (une bande par région en panachant les électrodes qui échantillonnent la même région), filtre substance grise, dispositions enregistrées pour l'exploration.

Le montage choisi pour un tracé devient le montage par défaut des tracés suivants de la même SEEG ; la correspondance voies → électrodes du schéma est vérifiée une fois pour toute l'exploration. Puis, dans le panneau **Quantification** :

- **EI**, l'index d'épileptogénicité (Bartolomei 2008) : la fenêtre va du début à la fin de crise annotés (marques du fichier, ou clic droit sur le tracé) ; l'EI se calcule en quelques secondes et s'affiche sous le tracé, plot par plot : **≥ 0,4 en rouge** (zone épileptogène), 0,1 à 0,4 en orange ;
- d'autres méthodes dans les onglets voisins : **cEI**, **PEI**, **h²** (connectivité), **Empreinte** (Grinenko 2018), **EM** (cartes d'épileptogénicité, David 2011), **Pointes · HFO** (Delphos) ;
- [[Enregistrer dans Analyses (3D)]] verse le résultat en **valeurs sur les plots** : sphères colorées en 3D, régions colorées sur la parcellation, coupes ;
- avec au moins deux crises, **EImax** (ou cEImax, PEImax) garde la valeur maximale de chaque plot ;
- chaque jeu enregistré porte une **pastille de provenance** : méthode et version, date, auteur, montage, fenêtre analysée (en heure réelle), empreinte du fichier. Elle passe à l'orange si le tracé, les marques ou la méthode ont changé depuis ; un clic ouvre l'historique des calculs (voir [Provenance des résultats](@m-seeg#provenance-des-resultats)).

![La visionneuse SEEG et le panneau EI : rapport d'énergie sous le tracé, détections, tableau des voies.](shot:seeg-ei)

![Les valeurs sur les plots en 3D et dans les coupes.](shot:seeg-analyses)

Les méthodes sont décrites dans [Méthodes : SEEG](@m-seeg).

## Stimulations

L'onglet [[Stimulations]] : deux vues 3D et la coupe de l'électrode dans son axe. Pour saisir une stimulation :

1. choisir la **paire** (pastilles de l'électrode, ou clic sur un plot en 3D) ;
2. le **mode** (train 50 Hz ou chocs 1 Hz, paramètres usuels préremplis) et l'**intensité** (boutons ±) ;
3. la **réponse** : RAS, fonctionnelle, subjective (avec le signe ; *habituelle* le cas échéant), post-décharge, crise ;
4. [[Enregistrer]], ou [[Enregistrer, +0,5 mA]] pour la stimulation suivante à la même paire.

Les réponses s'affichent en pastilles colorées sur les électrodes ; le journal liste toutes les stimulations.

![Les stimulations : paire choisie, coupe de l'électrode, réponses en couleur.](shot:seeg-stim)

## Thermocoagulations

L'onglet [[Thermocoagulations]] : saisie rapide (« Ia 1-3, OC 4-7 » est développé en paires contiguës), ou pastilles par électrode. Chaque cible passe par les étapes *planifiée*, *validée*, *réalisée* (ou *récusée*), avec la date, le chirurgien et une note. Le rappel des stimulations de chaque paire et les zones du rapport (épileptogène en rouge, propagation précoce en orange) évitent d'oublier une cible.

![Les thermocoagulations : cibles par étape, volumes en 3D, résultats des stimulations.](shot:seeg-thermo)

## Le rapport SEEG

L'onglet [[Rapport SEEG]] prépare le compte rendu :

- **Données recueillies** : ce qui est saisi, avec un lien vers ce qui manque ;
- **En-tête** : dates du monitoring, objet de la demande, traitement, conditions d'enregistrement ;
- **Zones en régions VEP** : zone épileptogène et zone de propagation précoce, proposées d'après les plots de début et de propagation des crises, modifiables ;
- **Synthèse et conclusion** : zones lésionnelle, irritative, d'initiation, EI, zone épileptogène, zone fonctionnelle, limites ; chaque rubrique peut être **proposée** d'après les données, puis relue.

[[Générer le rapport SEEG]] produit le document (schémas d'implantation, analyses, crises, stimulations, thermocoagulations, conclusion).

![Le rapport SEEG : données recueillies, en-tête, rubriques proposées.](shot:seeg-rapport)
