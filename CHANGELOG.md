# Historique des versions

EpiScope suit la numérotation sémantique (`MAJEUR.MINEUR.CORRECTIF`) : **1.0.x** pour les corrections, **1.x.0** pour les nouvelles fonctions, **2.0.0** si un changement oblige à migrer les dossiers ou casse une habitude de travail. Une version publiée n'est jamais modifiée : une correction donne une nouvelle version.

## [3.4.0] — 2026-11-27

Staff recomposé page par page (une idée par diapositive, sans défilement) et intercritique pointé visible partout : analyse visuelle dans les vues 3D et les coupes, le rapport SEEG et le diaporama ; concordance lisible d'un coup d'œil, avec des colonnes SEEG intercritique et critique ; hypothèses choisies et modifiées pendant le staff ; courbes de croissance de la naissance à l'âge adulte ; schéma d'implantation 2D classique.

### Ajouté

- **Analyse visuelle de l'intercritique SEEG** (onglet Analyses, sous les quantifications intercritiques) : une ligne pour toutes les catégories pointées superposées, puis une par catégorie (rythme lésionnel, chaque groupe de pointes) ; l'œil les affiche dans la vue active et dans les coupes, une couleur par catégorie (`cfg.inter` de la cellule). Même vue dans le **rapport SEEG** (« Plots pointés : vues », avec légende) et sur la page *Intercritique* de la SEEG au staff.
- **Affichage des catégories dans la grille** de pointage : toutes superposées ou la catégorie choisie seule ; œil par catégorie pour la masquer.
- **Schéma d'implantation 2D** (page d'implantation du staff, bascule « Vues 3D | Schéma 2D ») : grille de Talairach (lignes CA-CP, VCA, VCP ; colonnes A à I, rangées 1 à 12) avec points d'entrée et plots en projection sagittale, électrodes obliques en pointillés ; face latérale, face mésiale et insula séparées ; liste des électrodes ; un hémisphère par page (`implant2d.js`, `brain_glyph.js`).
- **Résultat du staff précédent** (staff après SEEG) : concordance, hypothèses et conclusion du staff qui a décidé la SEEG, avant l'implantation réalisée, en lecture seule.
- **Captures intercritiques en diaporama** (EEG de phase 1) : une capture par page, comme les médias d'une crise ; les vignettes de la page *EEG intercritique* y mènent.
- **Concordance, colonnes « SEEG intercritique » et « SEEG critique »** (staff dont la portée comprend une SEEG) : plots pointés de l'onglet Intercritique (groupe de pointes fréquentes : argument fort ; autre groupe, rythme lésionnel : en faveur) ; plots de début des crises SEEG prises en compte (au début de la moitié des crises au moins : argument fort, sinon en faveur). Ajoutées aussi aux colonnes reprises d'un staff précédent ; une colonne SEEG retirée à la main ne revient pas.
- **Courbes de croissance de la naissance à l'âge du patient** (Dossier, diaporama, compte rendu) : poids pour l'âge du CDC 2000 de 10 à 20 ans (relais de l'OMS, raccord entre 9 et 10 ans ; `src/growth_cdc.js`, `tools/make_growth_cdc.py`, données du domaine public), z-score et centile du poids jusqu'à 20 ans ; âge adulte en pointillés — taille : centiles de fin de croissance ; IMC : seuils 18,5, 25 et 30 ; poids : poids de ces IMC à la taille adulte mesurée.
- **Hypothèses modifiables pendant le staff** : « ＋ Hypothèse ▾ » sous la concordance (proposition d'après la sémiologie et la concordance, ou hypothèse vide) ; sur la page d'une hypothèse, statut, confiance, côté, régions, titre et arguments ; une hypothèse d'un staff précédent est révisée dans ce staff.

### Modifié

- **Concordance, colonne EEG intercritique** : lit aussi la localisation des pointes de scalp quand elle existe (sources des pointes retenues, ESI), en plus des cartes 10-20 ; les plots pointés d'une SEEG vont dans la colonne « SEEG intercritique ».
- **Tableau de concordance du diaporama** : hémisphères gauche et droit séparés, vignette du cerveau avec la région colorée sur chaque ligne, pictogrammes (et non des émojis) en tête des colonnes, cases réduites au symbole (détail au survol), douze lignes les plus concordantes (et celles des hypothèses) sans barre de défilement, « toutes les régions » pour le reste. Même vignette et mêmes pictogrammes dans *Préparer*.
- **Page EEG intercritique** (phase 1) : intercritique seul, sans les crises, sous un bandeau des jours où sont placés les captures et tracés intercritiques.
- **Synthèse de l'électrophysiologie** (anciennement synthèse des crises) : crises et intercritique sous le même bandeau des jours, cartes des pointes et catégories pointées en SEEG.
- **Pages patient du diaporama** : *Développement* — étapes psychomotrices renseignées en tableau à marqueurs, courbes de taille, de poids et d'IMC en petit, plus de tableau des mesures ni d'échelle vide ; *Antécédents* — personnels aux deux tiers, familiaux au tiers, latéralité en pictogrammes ; *Mode de vie* — grandes cartes qui occupent la page ; *Histoire de l'épilepsie* — repères en tuiles, chaque champ modifiable depuis le staff (mode édition) en plus du commentaire.
- **Développement actuel** (Dossier) : pastilles des comorbidités retirées de la carte, et la mention sur les échelles standardisées.

### Corrigé

- **Liste des images de l'écran Imagerie** : catégories écrasées en colonne étroite (lettres à la verticale), à cause d'un nom de classe de la v3.2.0 partagé avec la carte de pointage intercritique.
- **Gonflement du cortex dans la vue 3D** : à mi-gonflement, les deux hémisphères ne se chevauchent plus (vue de face, ils semblaient fusionner avant de se séparer au gonflement maximal). L'écartement latéral était appliqué au carré du niveau de gonflement, donc en retard sur la forme ; il suit maintenant le niveau, et sa valeur est calculée sur les surfaces (face médiale de chaque hémisphère gonflé à 1 mm du plan médian : les hémisphères gonflés se touchent presque) au lieu d'un décalage fixe de 32 mm, trop court pour les surfaces de la 3.3.0. Les électrodes, étiquettes et centres des régions, qui suivaient déjà le niveau, restent sur la surface à tous les niveaux. Vaut aussi pour les surfaces du patient.

## [3.3.0] — 2026-11-27

Surfaces du gabarit MNI tirées du modèle ICBM152 de Brainstorm (ICBM 2009c traité par FreeSurfer 8.2.0) : cortex aux sillons ouverts, surface gonflée plus régulière, noyaux gris, hippocampes, amygdales et cervelet aux formes du gabarit, découpés selon les régions VEP.

### Modifié

- **Surfaces du gabarit MNI** : cortex (piale, gonflée, profondeur sulcale) tiré du modèle **ICBM152_2026 de Brainstorm** — gabarit ICBM 152 NLin 2009c asymétrique, même espace que 2009b, traité par FreeSurfer 8.2.0 — à la place de la piale segmentée sur le T1 2009b : sillons ouverts jusqu'au fond, régions VEP des sillons visibles sur le cortex, surface gonflée plus régulière (≈ 32 000 sommets par hémisphère, topologie sphérique ; écart médian à l'ancienne surface ≈ 1 mm). Les régions VEP des sommets viennent toujours de la parcellation VEP du gabarit ; les coordonnées MNI 2009b, le volume VEP, les repères du recalage et la bibliothèque des électrodes ne changent pas.
- **Noyaux gris, hippocampes, amygdales et cervelet du gabarit** : maillés sur l'aseg FreeSurfer du même modèle (formes du gabarit, plus celles de MeshNet), puis découpés selon les régions VEP (hippocampe antérieur et postérieur…) ; surfaces lisses comme en 3.1.0.
- **Crédits** : modèle ICBM152 de Brainstorm (Tadel et al. 2011) et FreeSurfer (Fischl 2012) cités dans « Crédits et sources » et dans `brain_meshes.json` ; avis de copyright du MNI conservé.

### Outils

- `tools/make_templates_bst.py` + `tools/make_templates_bst.mjs` : surfaces du gabarit reconstruites depuis `ICBM152_2026.zip` (Brainstorm, fourni par l'utilisateur) ; étiquettes VEP des sommets mises en commun dans `tools/tpl_labels.mjs`.

## [3.2.0] — 2026-11-26

Intercritique SEEG pointé sur les plots, quantifications de chaque crise à côté de l'analyse visuelle, plots de la crise dans les coupes et sur le cortex, cavité de résection contrainte par la segmentation substance grise / blanche et affichée en calque distinct des régions cibles, écran de l'intervention réorganisé, imagerie du patient dans l'espace MNI.

### Ajouté

- **Intercritique SEEG pointé sur les plots** (onglet Intercritique, carte « Pointage des plots », sur le modèle des plots de début d'une crise) : une catégorie active — rythme anormal lésionnel, ou un groupe de pointes — et un clic sur un plot l'y ajoute ou l'en retire ; un glisser fait de même sur les plots survolés. Un **groupe de pointes** réunit des plots aux pointes synchrones, avec sa fréquence (fréquentes, occasionnelles, rares), la vigilance, le moment (jour, heure, tracé intercritique) et une description ; « dupliquer » crée le même groupe pour un autre moment. Les **jeux de valeurs intercritiques** (Analyses) sont listés dans la carte, modifiables ; « → groupe » reprend leurs plots les plus forts. Rapport SEEG : « Zone lésionnelle électrique » et « Zone irritative › proposer » reprennent le pointage, le compte rendu imprimable le tableau des plots pointés. Données : `ex.inter.lesional`, `ex.inter.lesionalText`, `ex.inter.groups` (`S.normalizeInter`, `toggleInterContact`, `interMarks`, `interSummary`, `contactRanges`).
- **Onglet « Quantifs » d'une crise** (à côté d'Électrique, Réseau à t, Origine…) : jeux de l'onglet Analyses rattachés à la crise ouverte (EI, cEI, PEI, empreinte, EM… — `S.seizureQuantIds`), affichables dans la vue active et modifiables, avec leur accord avec l'analyse visuelle (plots marqués « début » parmi les cinq valeurs les plus fortes).
- **Plots de la crise dans les coupes** : plots de début (rouge), de propagation précoce (orangé) et tardive (jaune) par-dessus les électrodes du volet « Coupes IRM », comme dans la vue 3D (case de « Multimodalité ▾ ») ; parcellation « régions des plots de la crise ».
- **Cortex 3D d'une crise SEEG** : « Affichage ▾ › Crise SEEG » colore le cortex et les plots par l'activation du modèle (défaut), par les régions des plots marqués, ou ne les colore pas ; les plots de début et de propagation se masquent.
- **Calques supplémentaires des coupes** (« Multimodalité ▾ ») : régions cibles de l'intervention, volume de résection segmenté (voile et contour blancs), régions des plots de la crise, lésions — plusieurs à la fois, par-dessus la parcellation choisie, avec leur opacité.
- **Imagerie dans l'espace du gabarit MNI** : bascule « Patient | Gabarit » de l'écran Imagerie ; en gabarit, T1 MNI 2009b ou image du patient en base, images recalées du patient (TEP, sources, post-traitements, IRM, scanner) en superposition, ramenées par l'affine patient → gabarit de l'anatomie calculée (comme la vue 3D sur gabarit).

### Modifié

- **Cavité de résection** : segmentation contrainte par la segmentation substance grise / blanche du patient — un voxel déjà sombre sur le T1 pré-opératoire (LCR des sillons, kyste, ventricule) n'est plus compté, et seules les composantes qui contiennent un noyau épais (~2 mm) sont gardées (les liserés minces de cortex au fond des sillons, nés d'un recalage imparfait, disparaissent) ; composition de la cavité en substance grise et blanche, contraintes rangées avec la cavité (`p.resection.cavity.tissue`, `constraints`).
- **Écran de l'intervention** : coupes IRM à côté des contacts (et non plus dans une carte en dessous) ; légende des contacts (dans la résection, déclaré à la main ; dans la cavité segmentée ; en bordure, à vérifier ; hors résection) ; « régions cibles » et « volume de résection segmenté » sont deux calques cochables ensemble.
- **Légende de l'intervention** (coupes, vues 3D, diaporama) rangée selon ce qu'elle désigne : régions cibles de l'intervention (réséquée, réséquée en partie, déconnectée) ; zone épileptogène des hypothèses (dans l'intervention, hors intervention) ; volume de résection segmenté.
- Ligne de grapho-éléments retirée de l'onglet Intercritique : par la corbeille du dossier.

### Méthodes

- Cavité de résection segmentée à partir de cette version : contraintes anatomiques ci-dessus (méthode notée dans `p.resection.cavity.method`) ; les cavités déjà retenues ne changent pas.

## [3.1.0] — 2026-11-26

Gabarit plus net et surfaces plus propres : coupes du gabarit sur le T1 2009b haute résolution, surface gonflée sans « petits pics », noyaux gris et cervelet lisses, cervelet affichable en planification ; électrodes à groupes espacés proposées par défaut pour les trajectoires insulaires et basales.

### Modifié

- **Coupes du gabarit** : T1 MNI 2009b haute résolution (0,5 mm) ramené à 1 mm, tête entière (au lieu du T1 de 2 mm de la méthode atlas) — `assets/template_t1.json`.
- **Surface gonflée** (gabarit et anatomie des patients) : les poches du pial — fond de sillon relié à l'extérieur par un goulot de quelques millimètres, invisible sur le pial — se refermaient en un point au gonflement (triangles écrasés, ombrage en « petits pics »). Elles sont maintenant refermées par un couvercle avant le gonflement (`SV.Mesh.capPockets`, genre 0 conservé), et la visionneuse prend la normale des voisins pour tout sommet d'aire négligeable.
- **Structures profondes** (noyaux gris, hippocampes, amygdales, cervelet ; gabarit et patients) : surface tirée de la distance signée au bord de la structure, lissée, sur une grille suréchantillonnée — plus de « gros voxels lissés » bosselés ; le cervelet est l'enveloppe lisse des folia.
- **Électrodes types de la bibliothèque** : BM, Im, Ip en DIXI D08-18CM (3 × 6 plots espacés), BL, Ia en DIXI D08-15BM (3 × 5), Ib en D08-12AM — l'échantillonnage va plus loin vers la sortie (autre marque : modèle standard du même nombre de plots).

### Corrigé

- Le **cervelet** restait caché en planification même coché dans « Structures profondes » : le choix fait dans ce menu l'emporte désormais sur le filtre « sans cervelet » de la planification.

### Méthodes

- Anatomie du patient calculée à partir de cette version : surface gonflée et structures profondes construites autrement (ci-dessus) ; le pial, les régions et les coordonnées ne changent pas.

## [3.0.0] — 2026-11-25

Le gabarit d'EpiScope devient le cerveau moyen **MNI ICBM 152 non linéaire 2009b asymétrique** (MNI152NLin2009bAsym) partout : vue 3D, coupes, parcellation VEP du gabarit, schéma d'implantation, recalage du patient, coordonnées MNI des exports. Chez l'enfant, la transformation vers MNI passe par le gabarit **NIHPD** de l'âge le plus proche. La bibliothèque des électrodes conventionnelles est redéfinie en coordonnées MNI. Les dossiers des versions antérieures sont convertis à l'ouverture.

### Modifié

- **Gabarit MNI 2009b** (Fonov et al. 2009, 2011) à la place de fsaverage (MNI305) :
  - **surfaces** piale et gonflée segmentées sur le T1 de 2009b à 0,5 mm (≈ 32 000 sommets par hémisphère au lieu de 10 242, topologie sphérique, profondeur sulcale), régions VEP de chaque sommet ; structures profondes ;
  - **parcellation VEP du gabarit** (volume de 2 mm) : tissus de 2009c, noyaux gris et ventricules de MeshNet, régions corticales reportées depuis l'ancien gabarit par la matrice publiée MNI305 → MNI152 ;
  - **repères du recalage** patient → gabarit (centres des 104 classes) et **gabarit de la méthode atlas** (T1 extrait du crâne, 104 classes) recalculés sur 2009b ; masque du cerveau et probabilités de substance grise, blanche et de LCR (a priori de la méthode atlas, tissus du gabarit) tirés de la version **2009c** du même gabarit (même espace, 1 mm) ;
  - **coupes du gabarit** : T1 de 2009b ;
  - coordonnées « MNI » des exports : `space-MNI152NLin2009bAsym` (électrodes BIDS, `coordsystem.json`, transformations `from-T1w_to-MNI152NLin2009bAsym`), cohorte (`transforms.csv`, `contacts.csv`).
- **Bibliothèque des électrodes conventionnelles** : chaque trajectoire est définie par sa pointe et son point d'entrée en coordonnées MNI 2009b (jeu placé et corrigé à la main par un épileptologue sur le gabarit, gauche et droite symétriques), au lieu d'une cible déduite des centres des régions ; l'entrée est recalculée au bord du cerveau le long de la même direction, le modèle (nombre de plots) est celui de la bibliothèque. Les 38 trajectoires existantes sont reprises.

### Ajouté

- **Gabarits pédiatriques NIHPD asymétriques intégrés** (4,5–8,5 ; 7–11 ; 7,5–13,5 ; 10–14 ; 13–18,5 ans ; Fonov et al. 2011) : la transformation vers MNI d'un patient de moins de 18,5 ans passe par le gabarit de la tranche dont le centre est le plus proche de son âge au T1 (`S.nearestAgeTemplate`). Un gabarit ajouté à la bibliothèque l'emporte quand sa tranche couvre l'âge ; chaque gabarit intégré peut être désactivé (Gabarits adaptés à l'âge…).
- **Six trajectoires** dans la bibliothèque : FA (cingulaire moyen antérieur → précentral inférieur), PO (cingulaire moyen postérieur → sillon central), LI (planum temporale), O (pôle occipital), Ib (insulaire oblique antérieure, sortie F2 caudal), PB (cunéus supérieur → gyrus angulaire).
- Outils de construction des gabarits (hors ligne, reproductibles, à partir des fichiers du MNI téléchargés par l'utilisateur) : `tools/make_templates.mjs`, `make_templates_vol.py`, `make_templates_assets.py`, `make_templates_peds.py` ; données de l'ancien gabarit gardées dans `tools/data`.

### Migration

- Dossier d'une version antérieure (sans `templateSpace`) : transformation patient → gabarit, transformation vers MNI (étape affine ajoutée en fin de chaîne) et cibles / sorties des électrodes du schéma portées de MNI305 vers MNI 2009b (`S.migrateTemplate`, matrice publiée par FreeSurfer) ; révision gardée, conversion inscrite au journal. Les régions VEP figées des plots ne changent pas. Une électrode du schéma posée sur l'ancien gabarit garde sa position en coordonnées MNI ; l'anatomie du gabarit ayant changé, ses plots peuvent tomber dans une région voisine : à revoir. Pour un patient dont l'anatomie est calculée, « Recalculer la transformation non linéaire » l'ajuste sur les nouveaux repères.
- Gabarits adaptés à l'âge créés dans la bibliothèque avant la 3.0.0 : étape MNI305 → MNI 2009b ajoutée à leur transformation.

### Documentation

- Manuel (fr / en) : Imagerie › Vers l'espace MNI (gabarit 2009b, gabarits NIHPD, conversion des anciens dossiers), SEEG › Planification (bibliothèque en coordonnées MNI, nouvelles trajectoires), Rapports (espace BIDS), glossaire.
- Crédits et mentions légales : gabarits MNI ICBM 152 2009b, 2009c et NIHPD (avis de copyright du MNI).

## [2.4.0] — 2026-11-25

Deux interventions types (hémisphérotomie ; résection temporale + déconnexion pariéto-occipitale) et deux électrodes verticales (BM, BL) ; cavité de résection corrigée (référence du LCR lue sur l'image, contacts en bordure signalés) ; reprise d'un schéma d'implantation dans la SEEG ouverte réparée.

### Ajouté

- **Deux interventions types** (décision de staff, Chirurgie › Intervention) : **hémisphérotomie** (tout le cortex de l'hémisphère déconnecté ; Delalande et al. 1992, 2007 ; Villemure et Mascott 1995) et **résection temporale + déconnexion pariéto-occipitale** (lobe temporal emporté ; cortex pariétal en arrière du gyrus postcentral, occipital et pariétal médial déconnectés ; Daniel et al. 2007). Une région déconnectée (étendue `disc`) est peinte en violet et notée « déconnecté » dans les vues, les coupes, le diaporama et les comptes rendus ; la couverture de la zone épileptogène la compte comme traitée. Exports : `template` et `disconnected_regions` dans l'export de recherche (`clinical.json`) et la cohorte.
- **Électrodes verticales BM et BL** dans la bibliothèque des trajectoires conventionnelles : BM, entrée F1 → gyrus droit ; BL, entrée F2 → cortex orbitofrontal (sortie cherchée à l'aplomb de la cible, option `vertical`).

### Corrigé

- **Cavité de résection et contacts déduits** : la cavité segmentée sur l'IRM post-opératoire pouvait être beaucoup trop grande, avec bien plus de contacts « dans la résection » que n'en marque l'épileptologue. La référence du LCR était la médiane des voxels étiquetés « LCR » par la parcellation, mince et prise en volume partiel avec le cortex : elle pouvait tomber au niveau du cortex, qui passait alors entier sous le seuil. Elle est maintenant lue sur l'image (voxels du cerveau nettement plus sombres que le cortex ; à défaut, contraste T1 habituel), avec un contrôle (cortex attendu entre 0,3 et 0,9 entre LCR et substance blanche, affiché). Les contacts situés de 1,5 à 5 mm de la cavité sont signalés « en bordure, à vérifier » (pointillé) sans être ajoutés. Une cavité calculée avec une version antérieure est à recalculer.
- **Reprise du schéma d'une autre exploration dans la SEEG ouverte** (bandeau « Le reprendre ici », Importer un schéma, menu des projets « → dans … » et « → nouveau projet ») : le schéma repris était effacé aussitôt — l'espace de travail, rechargé, réécrivait son ancien contenu (aucune électrode) par-dessus, et seule la mention « repris de … » restait. La SEEG ouverte est maintenant rechargée sans réécrire l'ancien espace de travail (`openContext(ctx, silent, fresh)`), de même après une restauration depuis la corbeille. Une reprise faite avec une version antérieure est à refaire.

### Documentation

- Manuel (fr / en) : Chirurgie › L'intervention et contacts dans la résection (référence du LCR, contacts en bordure, limites de la cavité), SEEG › Planification.

## [2.3.0] — 2026-11-25

Au staff, les hypothèses de réseau proposées tiennent compte de toute la concordance anatomo-électro-clinique (EEG, imagerie, neuropsychologie, SEEG), et plus seulement de la sémiologie des crises.

### Ajouté

- **Hypothèses de réseau du staff fondées sur toute la concordance anatomo-électro-clinique.** Les hypothèses proposées (« + depuis le modèle ») et la liste de la Synthèse ne venaient que de la sémiologie des crises. Elles sont maintenant classées avec le reste du tableau de concordance (`S.networkRank`) :
  - **sémiologie** : poids des trajectoires du modèle sur toutes les crises prises en compte (jusqu'à quatre par crise ; H1 pèse 1, les suivantes 0,6 ; crises habituelles ×2), rapporté au plus fort ;
  - **concordance** : somme des niveaux hors sémiologie (++ 2, + 1, − −1) sur la zone épileptogène, plus la moitié de la meilleure ligne de propagation, rapportée à la ligne la plus concordante ; cases saisies comprises ;
  - une zone concordante (au moins 2) qu'aucune trajectoire ne prend pour origine est proposée **d'après la concordance** ;
  - arguments pour et contre affichés et repris dans l'hypothèse créée (source `concordance` pour une proposition sans trajectoire) ; même liste dans le diaporama (page Concordance) et le compte rendu du staff. Les synthèses des crises gardent les hypothèses du modèle, désormais libellées « sémiologie seule ».

### Documentation

- Manuel (fr / en) : Le staff › Préparer, synthèse et hypothèses proposées.

## [2.2.0] — 2026-11-25

Le tableau de concordance du staff se remplit avec les données de la phase 1 (cartes 10-20 du début des crises et de l'intercritique) et les bilans IRM, TEP et neuropsychologiques, grâce à une localisation par bilan.

### Ajouté

- **Tableau de concordance du staff alimenté par la phase 1 et les bilans.** Jusqu'ici, seules la sémiologie et les lésions déclarées remplissaient le tableau ; les colonnes EEG, TEP et neuropsychologie restaient à saisir à la main, et un bilan IRM latéralisé n'était pas lu. Désormais :
  - **EEG critique (scalp)** : carte 10-20 « Début des crises » des explorations prises en compte ; **EEG intercritique** : cartes des pointes et des ondes lentes (veille, sommeil). Chaque électrode est rapportée aux systèmes qu'elle explore au mieux (`S.EEG_SYS`, `S.eegMapSystems`) ; un système voisin, comme des ondes lentes seules, n'est jamais compté plus que « en faveur ». Électrodes médianes : les deux côtés.
  - **IRM, TEP, neuropsychologie** : bilans datés avant le staff (hors suivi), avec une nouvelle **Localisation** dans Dossier › Bilans (`x.loc`, systèmes anatomo-fonctionnels ; côté = latéralisation du bilan). Les régions citées dans le texte du bilan sont proposées (`S.examLocSuggest` : « AMS » → prémoteur / AMS, « hippocampe » → temporal mésial…), jamais ajoutées seules au bilan ; tant que la localisation n'est pas confirmée, le tableau reprend ces régions, « en faveur » au plus et signalées « à confirmer ». IRM latéralisée et localisée : « argument fort ».
  - Le détail de chaque case auto est au survol ; toute case reste modifiable.

### Documentation

- Manuel (fr / en) : Localisation des bilans (Le dossier › Les bilans), colonnes préremplies du tableau de concordance (Le staff › Préparer), noms de fichiers de l'archive anonymisée (Rapports › Partager un dossier).

## [2.1.1] — 2026-11-24

Corrections : l'archive anonymisée (.episcope) garde l'anatomie du patient et les électrodes lisibles après l'import, et l'EI enregistré depuis la visionneuse est rangé avec les analyses critiques de sa crise.

- **Export anonymisé (.episcope)** : l'anatomie du patient (maillage, parcellisation VEP, segmentation) n'était plus lisible après l'import d'une archive anonymisée (« Fichiers dérivés absents ou illisibles »), et les électrodes ne pouvaient plus être placées sur le cerveau. L'anonymisation remplaçait le nom en sous-chaîne dans toutes les chaînes du dossier, y compris les chemins de fichiers : un prénom court contenu dans « derivatives/anat/… » coupait le chemin, alors que les fichiers de l'archive gardaient leur nom. Les chemins sont désormais anonymisés avec les fichiers eux-mêmes (`S.anonymizer`) : un fichier dont le nom contient le nom, le prénom, l'IPP ou l'ancien pseudonyme (dérivés nommés « sub-<pseudonyme>_… » avant le code neutre, pièces jointes) est renommé dans l'archive et chaque référence du dossier suit ; les chemins fixes ne sont plus touchés. Aucun nom ne reste dans les noms de fichiers de l'archive. Dans les textes libres, un secret de trois lettres ou moins n'est remplacé qu'en mot entier. Une archive anonymisée produite avec une version antérieure doit être exportée de nouveau.
- **EI rangé avec les analyses critiques** : le jeu EI enregistré depuis la visionneuse ne portait pas sa crise et apparaissait dans « Analyses intercritiques » d'un tracé mixte. Il porte maintenant la crise active (et son libellé quand le tracé en contient plusieurs), comme cEI et PEI ; les jeux déjà enregistrés retrouvent leur crise à l'ouverture du dossier (`S.eiSetSeizures`, dans `normalize`), et un jeu d'une méthode du début de crise (EI, cEI, PEI, empreintes, EM) n'est jamais rangé en intercritique.

## [2.1.0] — 2026-11-23

Lecture des pointes de scalp améliorée, SpikeNet2 au choix (poids ajoutés par l'utilisateur), et données de recherche rangées dans le dossier : histologie fermée, contacts réséqués, région de chaque plot figée, comorbidités développementales, statut du parcours, coordonnées MNI non linéaires. Les dossiers de la 2.0.0 s'ouvrent sans conversion ; un dossier enregistré par la 2.1.0 reste lisible par la 2.0.0.

- **Pointes intercritiques d'un tracé qui contient aussi des crises** : rangées dans « Analyses intercritiques » (et non plus avec les crises) et reprises dans l'onglet Intercritique (carte « Analyses intercritiques des tracés ») ; les analyses critiques du même tracé restent avec les crises.
- **Pointes marquées à la main, sans détection** : clic droit › « Marquer une pointe ici (moyennage à la main) » ; les pointes marquées forment un groupe moyenné et localisé comme une détection.
- **Lecture des pointes** : bande de 350 ms autour de chaque pointe des groupes choisis, trait fin à l'instant de la pointe ; pointe moyennée (« papillon ») à la même échelle de temps que le tracé (fenêtre d'affichage jusqu'à ±3 s ; temps caractéristiques inchangés).
- **Informations du tracé** : clic sur le titre dans la visionneuse, ou ⋯ › « Informations du tracé… » sur sa carte — titre, nature, vigilance, notes ; début, fin, durée, blocs et coupures, voies, fichiers, avertissements de lecture en entier.
- **SpikeNet2** (Li et al., NEJM AI 2025) au choix à côté de SpikeNet pour les pointes de l'EEG de scalp. Les poids ne sont pas livrés (licence restreinte de la BDSP) : l'utilisateur qui les détient choisit le point de contrôle des auteurs (`new_weights.ckpt`) ; EpiScope le lit dans le navigateur (archive PyTorch, sans Python), vérifie l'architecture et range le réseau dans la bibliothèque (`models/spikenet2.epsn2`, ou base du navigateur), jamais dans un dossier patient, un export ni le fichier EpiScope.html. Retrait → `models/trash/`. Réimplémentation JavaScript vérifiée contre PyTorch sur un point de contrôle synthétique de taille réelle (écart ≤ 6·10⁻⁸). L'empreinte des poids est notée dans chaque détection. Le garde-fou du dépôt refuse les `.ckpt`, `.pth` et `.epsn2`.

Données de recherche rangées dans le dossier (store.js, normalisation des anciens dossiers, tests) :
- **Histologie en vocabulaire fermé** : FCD selon l'ILAE 2022 (types I à III, mMCD, MOGHE), sclérose hippocampique ILAE type 1 à 3, tumeurs épileptogènes selon l'OMS 2021, autres lésions ; plusieurs diagnostics (double pathologie) ; texte libre à côté (`p.histologyCodes`, `p.histology`).
- **Contacts dans la résection** (`p.resection`) : déclarés à la main sur les plots réels de la SEEG de référence, ou déduits d'une **cavité segmentée** sur l'IRM post-opératoire recalée (différence avec la parcellation pré-opératoire, `imaging/cavity.js`, composantes à valider, volume et fraction emportée par région VEP, masque rangé comme image dérivée).
- **Région VEP de chaque plot figée** à la validation des électrodes (`spec.real.regions`, avec la date de l'anatomie) : les requêtes et exports ne dépendent plus de la version de l'atlas ; anatomie recalculée → signalée, « Réétiqueter les plots ».
- **Comorbidités développementales** à trois états (non renseigné / oui / non) : déficience intellectuelle (sévérité DSM-5), TSA, spasmes infantiles, retard de langage, troubles graves du comportement (`patient.dev`), à côté du texte libre.
- **Statut final du parcours** explicite (`d.pathway` : en attente, opéré, récusé avec motif, perdu de vue), suggestion tirée du dossier jamais appliquée seule ; repris dans la liste des patients.
- **Transformation non linéaire vers MNI305** (`imaging/warp.js`) : spline de plaque mince 3D régularisée sur les centres des structures segmentées, λ par validation croisée « un exclu », gardée seulement si elle prédit mieux que l'affine et sans repliement ; **gabarits adaptés à l'âge** (chaîne patient → gabarit de l'âge → MNI305, gabarits créés dans l'application et rangés dans les réglages de la bibliothèque). Coordonnées MNI305 des exports, de la cohorte et des requêtes selon la transformation retenue ; affichage 3D « gabarit » inchangé (affine).
- Exports : `electrodes.tsv` (région figée, colonne `resected`, `electrodes.json`), `clinical.json` (codes histologiques, contacts réséqués, cavité, comorbidités, parcours), `participants.tsv` (`pathway_status`), transformation non linéaire (`…_mode-points_xfm.json`) ; cohorte (colonnes correspondantes).

## [2.0.0] — 2026-11-22

Première version pour l'usage clinique au service. Phases unifiées : la phase 1 et la SEEG rangent leurs données de la même façon, les crises existent avec ou sans vidéo et avec ou sans tracé, dans n'importe quel ordre. **Les dossiers sont transformés à leur ouverture** (une version épinglée est gardée avant) ; une version 1.x les ouvre ensuite en lecture seule.

- **Plus de séances** : chaque crise est rattachée directement à son exploration ; le regroupement par jour (J1, J2…) est calculé d'après les dates. À la transformation, les notes et les fichiers notés dans les séances sont versés dans les notes de l'exploration, datés ; la corbeille est convertie.
- **Crises rapportées** : une crise peut appartenir au dossier sans exploration (vidéo familiale, témoignage, autre centre) et être rattachée plus tard à n'importe quelle exploration (ambulatoire, phase 1, SEEG, post-opératoire…). Carte « Crises rapportées » dans Histoire de la maladie (créer, ouvrir la sémiologie, rattacher) ; dans l'onglet Crises d'une exploration : ⋯ › « Rattacher une crise rapportée du dossier… » ; champ « rattachée à » dans la fiche de chaque crise (replacer au dossier compris).
- **Nouvelles étapes** : « EEG ambulatoire (avant la phase 1) » et « Vidéo-EEG post-opératoire » dans + Étape (sessions BIDS `ambu1`, `postop1`…) ; une deuxième phase 1 ou une deuxième SEEG s'ajoutent comme avant.
- **Essai à blanc** : liste des patients › « Essai à blanc… » montre, pour chaque dossier de l'ancien format, ce que la transformation fera (séances, crises, notes versées, crises sans exploration, corbeille), sans rien écrire.
- **Export de cohorte** : plus de table `sessions` ; la table `seizures` porte le jour d'enregistrement (`day`).
- **Crises rapportées, suite** : une crise saisie comme rapportée reste listée dans la carte du dossier une fois rattachée (le menu dit à quelle exploration, et la replace au dossier) ; au staff, les crises rapportées non rattachées, datées avant la réunion, ont leur section « Crises rapportées » avant les explorations, comptent dans la concordance et se décochent dans « Crises prises en compte ».
- **Vue d'ensemble** : premier onglet de chaque exploration (phase 1, SEEG, ambulatoire, post-opératoire) — libellé, dates, centre, statut, notes, compteurs, état du compte rendu, frise des jours (tracés à l'heure réelle, crises décrites ou à décrire), listes des crises et des tracés. Les dates et le centre quittent l'onglet Crises. Une nouvelle phase 1 s'ouvre sur cette vue.
- **Onglets de la phase 1** : Vue d'ensemble · Intercritique · Crises · Analyses · Synthèse · Galerie ; « Analyses » sépare les **analyses critiques** (tracés avec crise, synthèse des crises) des **analyses intercritiques** (pointes, sommeil, sources), un long tracé avec crises étant rangé avec les crises et signalé dans l'intercritique.
- **Cartes 10-20 intercritiques en veille et au sommeil** : pointes et ondes lentes ont chacune une carte de veille et une carte de sommeil (textes proposés par vigilance) ; une carte d'avant 2.0, sans vigilance, reste affichée à part avec « → veille » / « → sommeil » pour la ranger.
- **Tableau des crises** (onglet Crises) : pastilles d'état par crise — sémiologie (ou « à décrire »), vidéo, tracé (début marqué ou non), analyses.
- **Crises annotées dans les tracés** : tous les débuts de crise d'un fichier sont lus (une nuit peut en contenir plusieurs) ; ceux sans fiche sont listés avec « créer la fiche » (crise datée à l'heure du tracé, début et fin marqués) ou « rattacher à » la crise saisie à la même heure ; deux exports qui se recouvrent sont signalés, la crise n'étant comptée qu'une fois (aussi rappelé dans la vue d'ensemble).
- **Reprendre la sémiologie de…** : les signes d'une autre crise du dossier sont copiés dans la crise choisie (crises stéréotypées), à ajuster ensuite.
- **Plusieurs crises dans un tracé : rangement fixe par crise** : les marques (début, fin, marques libres) et les résultats (EI, cEI, PEI, h², empreinte, EM, HFO, source du début) de chaque crise d'un tracé ont leur propre rangement, à l'heure réelle ; changer de crise dans la visionneuse ne déplace plus rien (avant : permutation entre la crise active et les autres, qui pouvait ranger le résultat d'une crise sous une autre). Les tracés d'avant 2.0 sont convertis à la lecture.
- **Export de recherche (BIDS anonymisé)** : liste des patients › Exporter › « Export de recherche (BIDS anonymisé)… » — jeu BIDS 1.10 (iEEG) : tracés aux en-têtes EDF anonymisés, `_channels.tsv`, `_events.tsv` (débuts et fins de crises), `_ieeg.json` / `_eeg.json`, sessions et examens ; électrodes en `space-ScanRAS` et `space-MNI305` (affine 12 ddl) avec la région de chaque plot ; dérivés EpiScope (crises, sémiologie, stimulations, thermocoagulations, résultats par plot avec méthode et version, clinique, transformation). Codes neutres, dates décalées par sujet (décalage gardé dans la bibliothèque, identique d'un export à l'autre), âges ; pas de vidéo, de capture ni de texte libre ; chaque fichier est contrôlé et un patient dont l'identité apparaîtrait n'est pas exporté. Dossier choisi ou archive .zip ; rapport gardé dans la bibliothèque (`exports/`).
- **Électrodes rangées en BIDS dans la bibliothèque** : `ses-<session>/ieeg/…_space-ScanRAS_electrodes.tsv` et `…_space-MNI305_electrodes.tsv` (+ `_coordsystem.json`), réécrits à la validation des électrodes et au calcul de l'anatomie.
- **Rien ne se perd, suite** : retirer une stimulation, une thermocoagulation, un jeu d'analyses, une électrode (schéma ou reconstruction) ou un résultat d'imagerie de source passe par la corbeille du dossier (restaurable), comme le reste.
- **Pièces jointes des bilans** : rangées sous `attachments/<id>.<ext>` (le nom du fichier d'origine ne va plus sur le disque) ; le nom affiché est débarrassé de l'identité du patient (remplacée par son code).

## [1.1.0] — 2026-11-22

Avant le travail sur des données réelles : rien ne se perd, chaque résultat dit d'où il vient, les tracés s'affichent dans la convention clinique et à l'heure réelle, l'identité des patients est séparée de leurs fichiers (code neutre, noms BIDS, exports anonymisés), le staff se prépare page par page et s'édite en direct, et les vidéos se calent sur les tracés. (Regroupe les travaux préparés sous le numéro 1.0.1, jamais publié.)

- **Provenance des résultats** : chaque calcul enregistré (EI, cEI, PEI, h², empreinte, EM, pointes · HFO, sources, sommeil, maximum sur les crises, jeu importé) est gardé dans le dossier avec la méthode et sa version, la version d'EpiScope, l'auteur, le tracé (empreinte SHA-256 du fichier), la fenêtre et les marques, le montage, les voies exclues, la correspondance voies → électrodes, les réglages et les valeurs. Recalculer garde l'ancien résultat. Dans Analyses, chaque jeu porte une pastille : à jour, périmé (entrée changée depuis le calcul), ancienne méthode, valeurs modifiées à la main, ou origine non enregistrée (jeux antérieurs) ; « historique » liste les calculs successifs (CSV de chacun).
- **Montages SEEG** : référence au choix dans la barre de la visionneuse — Cascade (plots voisins), Référence (telle qu'enregistrée), Moyenne (moyenne commune des plots SEEG valides) ou Plot de référence choisi ; le sélecteur propose d'abord les plots en substance blanche, du plus calme au plus agité sur la page affichée ; un plot de référence absent d'un tracé fait revenir à la cascade, en le signalant. Le montage choisi devient celui des autres tracés de la même SEEG ; la référence est enregistrée avec chaque résultat (provenance) et dans les montages enregistrés. La correspondance voies → électrodes posée une fois vaut pour tous les tracés de l'exploration. Heure réelle aussi pour les pages capturées d'un tracé discontinu.
- **Staff page par page** : dans Préparer, la carte « Diapositives » liste les pages du diaporama — montrer ou masquer, changer l'ordre, renommer, noter, ajouter des pages libres (texte, listes, intertitres), présenter à partir d'une page ; retour possible à l'ordre automatique. Les pages nouvelles (crise ajoutée…) s'insèrent d'elles-mêmes à leur place. En présentation : volet « Notes de discussion » de chaque page (touche M), double-clic sur un titre pour le changer, en plus de la conclusion, des décisions et des participants déjà modifiables.
- **Instantané du staff** : « ◉ Instantané » enregistre les pages montrées pendant la réunion, telles qu'affichées (images comprises), avec les notes ; Préparer › Instantanés les rouvre en lecture seule, même après des modifications du dossier.
- **Identité des patients** : chaque patient reçoit un code neutre — préfixe du centre + numéro, HFAR par défaut (ex. HFAR0007) — futur identifiant des fichiers (BIDS `sub-…`) et des exports de recherche ; préfixe, nombre de chiffres et nom du centre réglés à l'initialisation de la bibliothèque (Patients › Réglages ; préfixe figé dès le premier code), numérotation sans doublon même si le compteur est remis en arrière, code attribué aux dossiers existants à leur première ouverture (journal). Zone « Identité » dans la synthèse du dossier (nom, prénom, date de naissance, IPP), seul endroit des données identifiantes, masquable à l'écran ; table de correspondance code ↔ identité exportable (Patients › Table de correspondance, CSV, trace dans le journal). Code dans la liste des patients et clé de l'export de cohorte.
- **Noms de fichiers BIDS** : un tracé importé est rangé sous un nom BIDS fondé sur le code du sujet (`sub-HFAR0007_ses-seeg1_task-seizure_run-01_ieeg.edf` ; sessions scalp1, seeg1, seeg2… ; en-têtes BrainVision réécrits pour suivre) et reçoit un titre neutre (type · date · heure · run) : le nom du fichier d'origine, qui porte souvent le nom du patient, n'est plus gardé. Même chose pour le libellé des images NIfTI importées et pour le répertoire d'un nouveau patient (`sub-<code>`). Dossiers existants : carte « Noms de fichiers d'origine » dans Dossier › Journal, qui liste les changements et renomme d'un clic (version épinglée avant ; titres neutres reportés dans les jeux d'analyses, captures, résultats et journal). Module `bids.js` (noms, analyse, chemins cibles de la future disposition BIDS).
- **Nom des patients** : le nom (« Prénom NOM », zone Identité) s'affiche par défaut dans la liste des patients, la barre du dossier, les staffs et les rapports ; à défaut le pseudonyme. « Masquer les noms » (Patients, ou zone Identité) remplace les noms par le code partout à l'écran sur ce poste (projection, enseignement). Nouveau patient : nom et prénom demandés à la création ; anciens dossiers : « reprendre le pseudonyme » remplit l'identité. Nombre de chiffres des codes figé comme le préfixe. Mois et année de naissance du patient repris de la date de naissance de l'identité ; zone Identité sur trois lignes (nom et prénom, date de naissance, IPP).
- **Exports anonymisés** (menu Exporter) : dossier `.episcope` anonymisé (identité retirée, nom, IPP et date de naissance remplacés par le code dans tous les textes, en-têtes EDF/BDF anonymisés, vidéos non incluses), cohorte anonymisée (codes) ou nominative (usage interne) ; case « masquer le nom du patient » dans la fenêtre des rapports. Les noms de fichiers exportés portent toujours le code.
- **Arborescence BIDS des tracés** : un tracé importé est rangé dans `ses-<session>/ieeg/` (ou `eeg/` pour le scalp) du répertoire `sub-<code>` ; les caches de calcul restent dans `ieeg/<id>/` ; numéro de run jamais réutilisé ; à l'initialisation d'une bibliothèque en répertoire : `dataset_description.json` et `.bidsignore` (zones propres à EpiScope). Les dérivés d'anatomie et l'export des électrodes utilisent le code du sujet et la session BIDS.
- **Staff : Éditer ou Commenter chaque donnée** : en présentation, « ✎ Éditer » (touche E) affiche deux boutons sous chaque donnée — bilans (conclusion, texte, domaines de la neuropsychologie), antécédents, mode de vie, histoire, examen, latéralité, traitements, conclusion du staff, hypothèses, décisions. **Éditer** modifie la donnée dans le dossier (journal « modifié pendant le staff ») : tout le dossier, les rapports et les staffs suivants voient la nouvelle valeur. **Commenter** accroche une note de staff sans modifier la donnée : elle s'affiche sous la donnée, dans ce staff et les suivants (« staff du jj/mm/aaaa »), dans l'instantané et dans le compte rendu, à l'endroit de la donnée (plus de rubrique « Discussion » en fin de compte rendu). « Commenter la page » pour une page entière ; titre de la page modifiable ; commentaires du staff en cours modifiables ou mis à la corbeille. Les notes de page de la première version deviennent des commentaires de page.
- **Temps absolu enregistré** : chaque tracé garde son horloge dans le dossier (`rec.clock` : heure de début, blocs EDF+D), chaque marque son heure absolue (`abs`) et chaque crise son début absolu (`onsetAbs`) ; si la lecture d'un fichier change (blocs recouverts, nouvelle version), les marques sont recalées d'après leur heure absolue. Cartes des tracés : crises à l'heure réelle. Provenance : fenêtre d'analyse aussi en heure absolue.
- **Synchronisation vidéo (modèle)** : lien vidéo ↔ heure absolue (`d.syncLinks` : début, dérive, méthode, points), plusieurs vidéos par tracé ; heure de début lue dans le nom du fichier à l'import (motifs date-heure), points de synchronisation (décalage, ou décalage + dérive), vidéos couvrant un instant. Le nom d'origine des vidéos importées n'est plus gardé (nom neutre « Vidéo du … »). Fenêtre « Heure de la vidéo » (galerie, visionneuse) : début saisi ou lu dans le nom du fichier, tracé associé, points de synchronisation avec écart de chaque point, contrôle « crise → instant de la vidéo » (ou « avant le début de la vidéo »). Visionneuse : bouton « ▶ Vidéo » — panneau déplaçable qui montre la vidéo couvrant le curseur et la suit, le tracé suivant la vidéo pendant la lecture, « Pas de vidéo calée à … » sinon, choix entre plusieurs vidéos, « 📍 point » (instant de la vidéo = heure du curseur) ; bandes bleues des vidéos sur la frise. Crise couverte par une vidéo calée : vidéo et t = 0 trouvés sans réglage pour la saisie de la sémiologie.
- **Base de référence de la sémiologie** : empreinte du contenu ; avertissement quand un poste utilise une base modifiée localement (les cartes peuvent différer d'un poste à l'autre) ; chaque crise note la base et la version du modèle de sa dernière modification.
- **Méthodes** : versions de départ 1.0.0 pour toutes les méthodes ; tests de référence (`tools/tests/test_methods_golden.mjs`) qui imposent une montée de version à tout changement de résultat.

- **Historique des versions du dossier** : avant chaque enregistrement, l'état précédent est rangé dans `history/` du patient (à l'ouverture, puis toutes les 10 minutes de travail, et toujours avant une suppression, une restauration ou un import). Rétention : tout pendant 48 h, puis une version par jour pendant 90 jours, puis une par mois ; les points de restauration ne sont jamais supprimés. Dossier › Journal : liste des versions, aperçu, téléchargement, retour à une version (lui-même annulable), « Créer un point de restauration ».
- **Corbeille du dossier** : exploration, séance, crise, staff, hypothèse, décision, procédure, suivi, bilan, image, capture, tracé, pièce jointe supprimés vont dans la corbeille avec leurs liens et leurs fichiers (rangés dans `trash/`) ; restauration exacte depuis Dossier › Journal ; « Vider la corbeille » efface définitivement.
- **Corbeille de la bibliothèque** : supprimer un patient le met à la corbeille (rien n'est effacé) ; restauration ou suppression définitive depuis Patients › Corbeille.
- **Polarité des tracés** : négatif en haut, convention EEG / SEEG (visionneuse, volet Tracé, moyennes de pointes, pages capturées) ; réglage dans ⋯. Les pages de tracé capturées avant cette version sont signalées « polarité inversée ».
- **Montages SEEG** : en bipolaire, jamais de paire pontée par-dessus un plot absent du fichier ; le plot absent est signalé dans la gouttière. Un montage de scalp (référence moyenne, laplacien, double banane, transverse) demandé pour un tracé SEEG revient au bipolaire.
- **Navigation dans les tracés longs** : heure réelle de l'enregistrement sur l'axe et au curseur (date, coupures EDF+D et recouvrements pris en compte ; bascule « Heure | t ») ; frise du bas refaite : tout le tracé avec règle horaire (date à minuit), coupures, crises en bandes cliquables (aller au début), enveloppe du signal, carte d'énergie de l'EI en surimpression, page affichée ; molette pour zoomer la frise, glisser pour parcourir, double-clic ou « ⤢ tout le tracé » pour revenir au tracé complet ; crises teintées dans le tracé.
- **Montages** : le bouton « Disposition ▾ » (par électrode, anatomique, montages enregistrés, substance grise) n'apparaissait plus dans la barre de la visionneuse (instruction avalée par un commentaire) ; la référence s'appelle désormais « Référence | Cascade ».
- **Compatibilité** : chaque dossier note la version d'EpiScope qui l'a écrit ; un dossier écrit par une version plus récente s'ouvre en lecture seule. Stockage du navigateur : stockage persistant demandé, avertissement à la création d'un patient (pour des données réelles, choisir un répertoire).
- **Manuel** (français et anglais) : identité et code du patient, corbeilles et versions, noms de fichiers BIDS, visionneuse (heure réelle, frise, polarité, montages SEEG), vidéo et tracé, provenance des résultats, diapositives, édition et commentaires du staff, instantané, exports anonymisés, organisation des fichiers ; raccourcis, formats, questions fréquentes et glossaire mis à jour. Dans Préparer, le bouton 💬 d'une diapositive ajoute un commentaire de staff sur la page.
- **Développement** : tous les tests Node en intégration continue (`tools/tests/run_all.mjs`), garde-fou refusant toute donnée de patient dans le dépôt (`tools/check_no_data.py`, hook `.githooks/pre-commit`).

## [1.0.0] — 2026-11-11

Première version publique.

- **Un seul fichier, hors ligne** : `EpiScope.html` s'ouvre dans Edge ou Chrome, sans installation ni serveur ; aucune donnée ne quitte le poste. Dossiers des patients dans un répertoire choisi (partage réseau possible) ou dans le stockage du navigateur ; export et import d'un dossier (`.episcope`).
- **Parcours du patient** en chirurgie de l'épilepsie : dossier (antécédents, arbre généalogique à dessiner avec calcul de la consanguinité, histoire de la maladie, développement et examen, bilans, imagerie, galerie, journal), phase 1 (vidéo-EEG de scalp), staff, SEEG, chirurgie ou autre procédure, suivi (Engel, ILAE).
- **Sémiologie séquentielle** : signes saisis dans l'ordre de la crise, régions plausiblement activées au fil des signes sur l'atlas VEP ou l'anatomie du patient, latéralisation, hypothèses de réseau (trajectoires), schéma d'implantation.
- **Imagerie sans logiciel externe** : IRM, scanner, TEP, recalage, surfaces et parcellation du patient, électrodes réelles.
- **EEG** : visionneuse du scalp (montages, filtres), pointes (Janča, SpikeNet) relues une à une, imagerie de source sur un modèle de tête réaliste, stadification du sommeil (YASA) relue époque par époque ; SEEG : planification, localisation des plots, intercritique, crises, quantifications (EI, cEI, PEI et autres), stimulations, thermocoagulations.
- **Staff et comptes rendus** : préparation et diaporama du staff, comptes rendus de chaque étape (HTML imprimable), captures.
- **Manuel d'utilisation** en français et en anglais, dans l'application (bouton **?**, touche **F1**, à la page de l'écran en cours) et à part (HTML hors ligne, PDF) ; **interface en anglais** (⋯ › *Langue*).
- **Crédits et mentions légales** : méthodes et données publiées citées, licences des composants de tiers ; logiciel de l'auteur sous licence MIT, citation dans `CITATION.cff`. Prototype de recherche, non validé pour un usage clinique.
