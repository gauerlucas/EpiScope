# EpiScope — sources : littérature et données

Ce document recense ce qui a servi à constituer la base de référence et les maillages, ce qui a été vérifié, et ce qui reste à récupérer. Les DOI marqués (*) n'ont pas été vérifiés individuellement.

## 1. Cadre conceptuel (sémiologie comme phénomène de réseau)

- Chauvel P, McGonigal A. Emergence of semiology in epileptic seizures. Epilepsy Behav 2014;38:94–103. doi:10.1016/j.yebeh.2013.12.003
- McGonigal A, Bartolomei F, Chauvel P. On seizure semiology. Epilepsia 2021. doi:10.1111/epi.16994
- Bartolomei F, Lagarde S, Wendling F, et coll. Defining epileptogenic networks: contribution of SEEG and signal analysis. Epilepsia 2017 (*)
- Beniczky S, et coll. Seizure semiology: ILAE glossary of terms and their significance. Epileptic Disord 2022;24:447–495. doi:10.1684/epd.2022.1430 — vocabulaire et valeurs latéralisantes utilisés dans `signs.csv` (`laterality_rule`).

- Kahane P, Landré E, Minotti L, Francione S, Ryvlin P. The Bancaud and Talairach view on the epileptogenic zone: a working hypothesis. Epileptic Disord 2006;8 Suppl 2:S16–26 (*) — la ZE comme site d'organisation primaire de la décharge, souvent silencieuse.
- Bartolomei F, Chauvel P, Wendling F. Epileptogenicity of brain structures in human temporal lobe epilepsy: a quantified study from intracerebral EEG. Brain 2008;131:1818–1830 (*) — index d'épileptogénicité.
- Arthuis M, et coll. Impaired consciousness during temporal lobe seizures is related to increased long-distance cortical-subcortical synchronization. Brain 2009 (*) ; Bartolomei F, Naccache L. Epilepsy Behav 2011 (*) — conscience et synchronie à distance (rôle `propagation` du thalamus et du cortex pariétal médian).
- Rheims S, et coll. Analysis of clinical patterns and underlying epileptogenic zones of hypermotor seizures. Epilepsia 2008 (*) — types 1 et 2.
- Vignal JP, Maillard L, McGonigal A, Chauvel P. The dreamy state. Brain 2007 (*) ; Barbeau E, et coll. Neuropsychologia 2005 (*).
- Dupont S, et coll. Lateralizing value of semiology in medial temporal lobe epilepsy (1998) (*) ; Loddenkemper T, Kotagal P. Epilepsy Behav 2005 (*) ; Marks WJ, Laxer KD. Epilepsia 1998 (*) — valeurs latéralisantes (`lateralizing_value`).
- Barba C, et coll. Temporal plus epilepsy. Brain 2007 ; Brain 2016 (*) ; Kahane P, Bartolomei F. Epilepsia 2010 (*).

## 2. Bases quantitatives sémiologie → localisation

- Alim-Marvasti A, et coll. Probabilistic landscape of seizure semiology localizing values. Brain Commun 2022;4(3):fcac130. doi:10.1093/braincomms/fcac130 — 11 230 points de localisation, 4 643 patients, 309 articles ; biais temporal corrigé par inférence bayésienne ; **utilise le premier signe seulement**.
- Semio2Brain Database v1.2.3, Zenodo doi:10.5281/zenodo.4606589 (MIT sur GitHub `thenineteen/Semio2Brain-Database`). Fichier Excel présent dans `old_version/sources_semiologie_crises/` ; extraction automatisée par `tools/extract_semio2brain.py` avec la SemioDict de SVT (`thenineteen/Semiology-Visualisation-Tool`, MIT, v1.8.1, 36 catégories ictales) et un crosswalk de 103 colonnes de localisation vers les familles VEP (`data/README_semio2brain.md`).
- Pérez-García F, et coll. Software tool for visualization of a probabilistic map of the epileptogenic zone from seizure semiologies. Front Neuroinform 2022;16:990859. doi:10.3389/fninf.2022.990859 (SVT, extension 3D Slicer).
- Note : aucun article « Semio2Brain Database » dans Scientific Data 2022 n'a été retrouvé ; citer Brain Communications + Zenodo.

## 3. Séquences et timing par réseau d'origine (seed des priors)

Temporal
- Maillard L, Vignal JP, Gavaret M, et coll. Semiologic and electrophysiologic correlations in temporal lobe seizure subtypes. Epilepsia 2004;45:1590–1599. doi:10.1111/j.0013-9580.2004.09704.x — mésial (n = 24) : aura épigastrique et peur initiales, automatismes et rupture de contact retardés ; latéral (n = 13) : hallucination auditive initiale, rupture de contact initiale ; mésio-latéral (n = 18, latence mésial → latéral 0–3 s) : automatismes précoces.
- Bartolomei F, et coll. From mesial temporal lobe to temporoperisylvian seizures: a quantified study of temporal lobe seizure networks. Epilepsia 2010 (PMID 20738379) — médiane de 4 structures à EI > 0,3.
- Bartolomei F, Barbeau E, Gavaret M, et coll. Cortical stimulation study of the role of rhinal cortex in déjà vu and reminiscence of memories. Neurology 2004 (*) ; Bartolomei F, et coll. Ictal fear. (*)
- Bae et coll. Divergent propagation networks define two electroclinical phenotypes in MTLE. J Clin Neurol 2025. doi:10.3988/jcn.2025.0473 — latence SEEG → clinique 28,8 ± 7,7 s (EEG-first, n = 7) contre 13,0 ± 7,7 s (clinical-first, n = 6).
- Schulze-Bonhage A, et coll. Semiology of seizures with temporo-polar or medio-lateral temporal origin: a systematic review. Epileptic Disord 2025. doi:10.1002/epd2.20329
- À récupérer : Barba (temporal plus, 2007/2016), Kotagal (automatismes/dystonie), Ryvlin, Kahane.

Frontal
- Bonini F, McGonigal A, Trébuchon A, et coll. Frontal lobe seizures: from clinical semiology to localization. Epilepsia 2014;55:264–277. doi:10.1111/epi.12490 — 54 patients SEEG, 4 groupes rostro-caudaux (G1 n = 16 moteur élémentaire ; G2 n = 23 tonique axial, chapeau de gendarme, hypermoteur non intégré ; G3 n = 10 gestes intégrés, stéréotypies, expression émotionnelle ; G4 n = 5 peur, végétatif).
- Prefrontal seizure classification based on SEEG quantification and automatic clustering. Epilepsy Behav 2020;112:107436. doi:10.1016/j.yebeh.2020.107436 — pas de différence sémiologique entre sous-groupes préfrontaux : prudence sur la sous-localisation.
- Souirti Z, et coll. Chapeau de gendarme et cingulaire antérieur (2014) (*) ; Rheims S, et coll. Hyperkinetic seizures (2008) (*) ; Alkawadri (cingulaire, 2013) (*) ; Tinuper/Nobili (SHE) (*).

Insulaire
- Isnard J, Guénot M, Sindou M, Mauguière F. Clinical manifestations of insular lobe seizures: a SEEG study. Epilepsia 2004;45:1079–1090. doi:10.1111/j.0013-9580.2004.68903.x — 5–6/50 : striction laryngée + paresthésies désagréables en pleine conscience → dysarthrie → signes moteurs focaux ; 86 % des crises temporales atteignent l'insula.
- Chisholm J, et coll. Anterior versus posterior insular epilepsy: correlations with semiology based on SEEG. Ann Neurol 2025;98:1111–1124. doi:10.1002/ana.70015 — 45 patients, 94 signes codés précoce/tardif ; antérieur : absence d'aura, mâchonnement/déglutition, clignements tardifs, tachycardie précoce (gyrus court moyen) ; postérieur : moteur élémentaire précoce, tonique axial/bilatéral asymétrique.
- Mazzola L, Mauguière F, Isnard J. Electrical stimulations of the human insula. J Clin Neurophysiol 2017;34:307–314 — 222 patients, 550 réponses : somatosensoriel 61 % (viscéral 14,9 %), auditif 8 %, vestibulaire 7,5 %, parole 5 %, gustatif 2,7 %, olfactif 1 % ; douleur postéro-supérieure. Mazzola L, et coll. Ann Neurol 2017;82:360–370. doi:10.1002/ana.25010 — goût : insula moyenne dorsale.
- Connectome-based disentangling of epilepsy networks from insular SEEG leads (PMID 39830202) — la connectivité fonctionnelle des décharges insulaires reflète la sémiologie.

Postérieur, autres
- Yang Y, et coll. Precuneus epilepsy (SEEG, 11 patients). BMC Neurol 2018;18:110. doi:10.1186/s12883-018-1119-z — origine silencieuse, signes à la propagation vers AMS/paracentral/central.
- Blanke O, et coll. Stimulating illusory own-body perceptions. Nature 2002 (*) — gyrus angulaire.
- Picard F. Ecstatic epileptic seizures and the anterior insula (2013) (*).
- Dlouhy BJ, et coll. Breathing inhibited when seizures spread to the amygdala. J Neurosci 2015 (*).
- Selimbeyoglu A, Parvizi J. Electrical stimulation of the human brain: perceptual and behavioral phenomena. Front Hum Neurosci 2010;4:46. doi:10.3389/fnhum.2010.00046 (CC BY) — tables région → phénomène évoqué, seed des lignes « DES ».
- Penfield W, Jasper H. Epilepsy and the functional anatomy of the human brain (1954) — somatotopie.

Aucune étude publiée ne modélise l'ordre des signes par chaînes de Markov ou fouille de séquences reliée à la localisation ; la notation fléchée du glossaire ILAE et le codage précoce/tardif de Chisholm sont ce qui s'en approche le plus.

## 4. Atlas VEP et pipeline

- Wang HE, Scholly J, Triebkorn P, et coll. VEP atlas: an anatomic and functional human brain atlas dedicated to epilepsy patients. J Neurosci Methods 2021;348:108983. doi:10.1016/j.jneumeth.2020.108983 — 162 régions (72 corticales × 2 + 9 sous-corticales × 2), dérivé de Destrieux par `convert_to_vep_parc.py` (`github.com/HuifangWang/VEP_atlas_shared`, règles dans `data/VepAtlasRules.txt`, LUT `VepFreeSurferColorLut.txt`). **Pas de licence explicite** : accord de l'INS à demander avant diffusion hors équipe des annotations dérivées.
- Annotations fsaverage utilisées : `lh/rh.aparc.vep.annot` et `aparc+aseg.vep.mgz` du dossier `old_version/fsaverage` (produits par `mri_surf2surf` depuis un contrôle) ; fsaverage5 = 10 242 premiers sommets de fsaverage (vérifié sur les coordonnées gonflées).
- Jirsa VK, et coll. The Virtual Epileptic Patient. NeuroImage 2017;145:377–388 (*) ; Proix T, et coll. Brain 2017;140:641–654. doi:10.1093/brain/awx004 (la connectivité individuelle n'améliore pas nettement la prédiction de propagation, 15 patients) ; Wang HE, et coll. Sci Transl Med 2023;15:eabp8982. doi:10.1126/scitranslmed.abp8982 (53 patients, FDR 0,028 chez les libres de crises) ; Makhalova J, et coll. Epilepsia 2022 (*).
- Pipeline : `github.com/ins-amu/tvb-pipeline` (T1 + DWI → surfaces, connectome VEP `weights.txt`/`tract_lengths.txt`/`centres.txt`, gain SEEG) ; `ins-amu/vbi` (simulation/inférence). Cohorte virtuelle VEP : Dollomaja B, et coll. PLoS Comput Biol 2025, EBRAINS doi:10.25493/XWG2-S8X (*).

## 5. Connectomes normatifs, surfaces, atlas fonctionnels

- **F-TRACT** (David O, Lemaréchal JD, Trebaul L, et coll.) : probabilités de connexion et latences (onset/peak, délais axonaux et synaptiques) issues des potentiels évoqués cortico-corticaux de 780 patients ; v21-12, Zenodo doi:10.5281/zenodo.7015415, CC BY 4.0 (usage recherche). Parcellations : AAL, AICHA, Brodmann, FreeSurfer (Desikan), Hammers, HCP-MMP1, Lausanne2008, MarsAtlas — **pas VEP** : re-parcellation par recouvrement de sommets sur fsaverage. Lemaréchal JD, et coll. Brain 2022;145:1653–1667. doi:10.1093/brain/awab362 ; Trebaul L, et coll. NeuroImage 2018. doi:10.1016/j.neuroimage.2018.07.039 ; David O, et coll. NeuroImage 2013. doi:10.1016/j.neuroimage.2013.05.075. Priorité de la v0.2.
- **ENIGMA Toolbox** (Larivière S, et coll.) : SC/FC normatifs HCP (≈ 207 sujets) en Desikan, Glasser, Schaefer 100–400 ; pas Destrieux ; licence à vérifier (BSD-3 présumée).
- À vérifier avant usage : HCP-1065/842 (Yeh, DSI Studio), Lead-DBS, MICA-MICs, Lausanne/Hagmann, neuromaps, netneurotools, Brainnetome, Neurosynth/NeuroQuery, Yeo 7/17 sur fsaverage.
- Surfaces : fsaverage5 (pial, gonflée, sulc, flat) distribuées avec nilearn 0.14 (licence FreeSurfer : vérifier les conditions de redistribution).
- Prior normatif livré en attendant : adjacence surfacique, distance entre centroïdes, 140 liens curés (`network_edges.csv`), lien homotopique.

## 6. Logiciels existants et rendu

- SVT (3D Slicer, MIT, recherche seulement) ; GARDEL / EpiTools (Marseille, contacts SEEG, EI) ; tvb-pipeline, vbi.
- Rendu navigateur : three.js 0.186 (MIT, WebGL 1/2) retenu, empaqueté en IIFE ; NiiVue (BSD-2) exige WebGL2 et les Chromium récents (~v144) ne basculent plus automatiquement en WebGL logiciel, d'où le repli Canvas 2D maison. Déploiement : fichier unique (les restrictions `file://` de Chrome/Edge interdisent `fetch` et les modules ES, pas les scripts classiques ni les blocs JSON en ligne).

## 6 bis. Implantation SEEG (module électrodes)

- Talairach J, Bancaud J. Stereotaxic approach to epilepsy: methodology of anatomo-functional stereotaxic investigations. Prog Neurol Surg 1973 (*) — cadre orthogonal, nomenclature par cible.
- Cardinale F, Cossu M, Castana L, et coll. Stereoelectroencephalography: surgical methodology, safety, and stereotactic application accuracy in 500 procedures. Neurosurgery 2013;72:353–366 (*).
- Cardinale F, Casaceli G, Raneri F, Miller J, Lo Russo G. Implantation of stereoelectroencephalography electrodes: a systematic review. J Clin Neurophysiol 2016;33:490–502 (*).
- Cardinale F, Rizzi M, Vignati E, et coll. Stereoelectroencephalography: retrospective analysis of 742 procedures in a single centre. Brain 2019;142:2688–2704 (*) — planification orthogonale privilégiée, trajectoires obliques pour l'insula, distance aux vaisseaux, risque hémorragique.
- Afif A, Chabardes S, Minotti L, Kahane P, Hoffmann D. Safety and usefulness of insular depth electrodes implanted via an oblique approach in patients with epilepsy. Neurosurgery 2008;62(5 Suppl 2):ONS471–479 (*) — trajectoires insulaires obliques parasagittales (entrée frontale ou pariétale haute), base des électrodes Ia / Im / Ip.
- Carte conventionnelle des électrodes de l'équipe (faces latérale et médiale, grille de Talairach) — nomenclature TP, TB, A (NA), B (HC), C (HT), CE, GPH, OT, FCA, R, OR, CR, CC, CP, PI, GC, FT, LP, SA, PM, FD, FP, T, H, OP, OC, OF, SC, PA, PP, Cu, GL, PFG, Ia, Im, Ip, reprise dans `src/electrodes.js`.
- Cossu M, Cardinale F, Castana L, et coll. Stereoelectroencephalography in the presurgical evaluation of focal epilepsy: a retrospective analysis of 215 procedures. Neurosurgery 2005;57:706–718 (*).
- Isnard J, Taussig D, Bartolomei F, et coll. French guidelines on stereoelectroencephalography (SEEG). Neurophysiol Clin 2018;48:5–13 (*) — recommandations de pratique. Ordre du compte rendu SEEG d'EpiScope (implantation, intercritique, crises, stimulations, quantification, thermocoagulations, synthèse) ; HAL : https://hal.science/hal-01744390
- Planification chirurgicale ROSA (Zimmer Biomet) : format `.ros` non publié (section `[TRAJECTORY]`, repère à rapporter à l'IRM exportée avec le plan) ; forum Brainstorm, « Can I open ROSA .ros trajectory files in brainstorm? » : https://neuroimage.usc.edu/forums/t/opening-rosa-files-in-brainstorm/20802 — d'où, dans EpiScope, le choix du repère par cohérence anatomique et le contrôle visuel après import.
- DIXI Medical, Microdeep D08-xxAM (Ø 0,8 mm, plots 2 mm, espacement 1,5 mm, 5–18 plots) ; Alcis, 2069-EPC-xx (mêmes dimensions) — fiches fabricants (*).
- Horn A, et coll. Lead-DBS v2. NeuroImage 2019 (*) — référence pour la représentation 3D des électrodes (hampe + plots).

## 6 bis. Détails de l'interface (v4)

- Navigation dans les coupes inspirée de MRIcroGL (Rorden) — tutoriel : https://andys-brain-book.readthedocs.io/en/latest/MRIcroGL/MRIcroGL_3_ViewingImages.html
- Beniczky S, Aurlien H, Brøgger JC, et coll. Standardized computer-based organized reporting of EEG: SCORE – Second version. Clin Neurophysiol 2017;128:2334-46 — https://www.sciencedirect.com/science/article/pii/S1388245717309069 ; carte 10-20 du compte rendu EEG (système IFCN à 25 électrodes, Seeck et coll. 2017), simplifiée.
- Brainstorm, affichage SEEG/ECoG sur le cortex : interpolation de Shepard limitée à une distance maximale (`excludeParam`, « Edit interpolation distance ») — forum : https://neuroimage.usc.edu/forums/t/display-area-of-ecog-signals-on-cortex-are-too-large/38415 ; principe repris pour l'aire de cortex stimulée (estimation géométrique).
- Thermocoagulation SEEG : Wang M, et coll. One-stage high-density focal stereo-array SEEG-guided radiofrequency thermocoagulation… Front Neurol 2020;11:965 — https://www.frontiersin.org/journals/neurology/articles/10.3389/fneur.2020.00965/pdf (« ablation diameter ∼3–6 mm around the electrode », 3,5 W pendant 45 s) ; Bourdillon P, et coll. SEEG-guided radiofrequency thermocoagulation (SEEG RF-TC): from in vitro and in vivo data to technical guidelines. World Neurosurg 2016 — https://serval.unil.ch/notice/serval:BIB_1C72C2439C14 (dipôles de plots contigus, courant augmenté jusqu'à l'effondrement de la puissance) ; volume par défaut d'EpiScope (5 × 7 mm) : ordre de grandeur indicatif, réglable.
- Oldfield RC. The assessment and analysis of handedness: the Edinburgh inventory. Neuropsychologia 1971;9:97-113 (*) — quotient de latéralité (± %).
- Bennett RL, et coll. Standardized human pedigree nomenclature: update and assessment of the recommendations of the National Society of Genetic Counselors. J Genet Couns 2008;17:424-33 (*) — symboles de l'arbre généalogique.

## 6 ter. Imagerie de source électrique (v5.3)

- Parra-Díaz P, Valls-Carbó A, Niso G, et coll. Interictal electric source imaging with open-source software and routine low-density electroencephalography: a systematic comparison of four inverse methods in drug-resistant epilepsy. Epilepsia 2026. doi:10.1002/epi.70481 — 79 patients opérés, EEG de routine : sLORETA à mi-montée de la pointe moyennée, précision 81 % (meilleure qu'au pic) ; sLORETA, LCMV et dipôle concordants.
- Birot G, Spinelli L, Vulliémoz S, et coll. Head model and electrical source imaging: a study of 38 epileptic patients. NeuroImage Clin 2014;5:77–83. doi:10.1016/j.nicl.2014.06.005 — modèle sphérique local à contraintes anatomiques (LSMAC), BEM et FEM : localisations très voisines.
- Nemtsas P, Birot G, Pittau F, et coll. Source localization of ictal epileptic activity based on high-density scalp EEG data. Epilepsia 2017;58:1027–1036. doi:10.1111/epi.13749 — rythme critique dominant filtré ± 1 Hz, ESI moyennée sur la fenêtre.
- de Borman A, Vespa S, El Tahry R, Absil PA. Estimation of seizure onset zone from ictal scalp EEG using independent component analysis in extratemporal lobe epilepsy. J Neural Eng 2022;19(2). doi:10.1088/1741-2552/ac55ad — composantes classées par puissance du rythme critique, part de variance, dispersion des sources.
- Hao S, et coll. HD-EEG source imaging with simultaneous SEEG recording in drug-resistant epilepsy. Epilepsia 2025;66:4451–4464. doi:10.1111/epi.18552 — ESI critique plus précise qu'intercritique ; rythmes de 2 à 9 Hz.
- Kim B, et coll. Ictal electrical source imaging for localizing the epileptogenic zone. Seizure 2025;130:70–79. doi:10.1016/j.seizure.2025.05.010.
- Caune V, Ranta R, Le Cam S, et coll. Evaluating dipolar source localization feasibility from intracerebral SEEG recordings. NeuroImage 2014;98:118–133. doi:10.1016/j.neuroimage.2014.04.058 — dipôle équivalent, milieu homogène, signaux en référence commune : < 10 mm sous conditions.
- Kalina A, Jezdik P, Fabera P, Marusic P, Hammer J. Electrical source imaging of somatosensory evoked potentials from intracranial EEG signals. Brain Topogr 2023;36:835–853. doi:10.1007/s10548-023-00994-5 — erreur liée à la distance au plot le plus actif.
- López-Madrona VJ, Medina Villalon S, Velmurugan J, et coll. Reconstruction and localization of auditory sources from intracerebral SEEG using independent component analysis. NeuroImage 2023;269:119905. doi:10.1016/j.neuroimage.2023.119905 — sources non échantillonnées jusqu'à ~40 mm ; intervalle de confiance du dipôle = indicateur de fiabilité.
- Satzer D, et coll. SEEG in 3D: interictal source localization from intracerebral recordings. Front Neurol 2022;13:782880. doi:10.3389/fneur.2022.782880.
- Pascual-Marqui RD. Standardized low-resolution brain electromagnetic tomography (sLORETA): technical details. Methods Find Exp Clin Pharmacol 2002;24 Suppl D:5–12 (*).
- Modèle sphérique : série multicouche (coefficients comme MNE-Python `_fwd_eeg_get_multi_sphere_model_coeffs`), vérifiée contre la forme close d'une sphère homogène (Lütkenhöner 1992, FieldTrip `eeg_leadfield1`) et les constantes à 4 couches de Cuffin BN, Cohen D. Electroencephalogr Clin Neurophysiol 1979;47:132–146 (FieldTrip `eeg_leadfield4_prepare`).
- Positions 10-20 / 10-10 : Oostenveld R, Praamstra P. The five percent electrode system for high-resolution EEG and ERP measurements. Clin Neurophysiol 2001;112:713–719 (*) ; coordonnées sur la tête MNI du fichier `standard_1020.elc` de FieldTrip.
- Charte graphique : bleu 294C / RVB 25-81-142 et beige 4665C / RVB 175-161-134 ; Aleo (Alessio Laiso, SIL OFL 1.1, via Fontsource).

### Modèle de tête réaliste (v5.4)

- Hämäläinen MS, Sarvas J. Realistic conductivity geometry model of the human head for interpretation of neuromagnetic data. IEEE Trans Biomed Eng 1989;36:165–171. doi:10.1109/10.16463 — approche du problème isolé pour l'os peu conducteur.
- Gramfort A, Papadopoulo T, Olivi E, Clerc M. OpenMEEG: opensource software for quasistatic bioelectromagnetics. Biomed Eng Online 2010;9:45. doi:10.1186/1475-925X-9-45 — BEM symétrique (Brainstorm) ; collocation linéaire + IPA moins précise à nombre de sommets égal.
- Brainstorm, tutoriel « BEM head model » (neuroimage.usc.edu/brainstorm/Tutorials/TutBem) : surfaces scalp, crâne externe, crâne interne (méthode « Brainstorm » : enveloppes du cortex et de la tête), 1922 sommets par couche par défaut, 642/482/482 dans le tutoriel EEG / épilepsie.
- MNE-Python : `make_bem_solution` (collocation linéaire, `_fwd_bem_lin_pot_coeff`, `_fwd_bem_multi_solution`, `_fwd_bem_ip_modify_solution`), transcrits dans `esi_bem.js`.
- McCann H, Pisano G, Beltrachini L. Variation in reported human head tissue electrical conductivity values. Brain Topogr 2019;32:825–858. doi:10.1007/s10548-019-00710-2 — méta-analyse : scalp 0,41 S/m, os 0,02 S/m, rapport cerveau / os 50,4.
- Odabaee M, Tokariev A, Layeghy S, et coll. Neonatal EEG at scalp is focal and implies high skull conductivity in realistic neonatal head models. NeuroImage 2014;96:73–80. doi:10.1016/j.neuroimage.2014.04.007 — os du nouveau-né 0,06–0,2 S/m.
- Akalin Acar Z, Ortiz-Mantilla S, Benasich A, Makeig S. High-resolution EEG source imaging of one-year-old children. Conf Proc IEEE EMBC 2016:117–120. doi:10.1109/EMBC.2016.7590654 — rapport cerveau / os 10–12 à 12 mois.
- Delye H, Clijmans T, Mommaerts MY, et coll. Creating a normative database of age-specific 3D geometrical data, bone density, and bone thickness of the developing skull. J Neurosurg Pediatr 2015;16:687–702. doi:10.3171/2015.4.PEDS1493 — épaisseur de l'os : croissance rapide la 1re année, puis jusqu'à l'âge adulte.
- Gargiulo P, Belfiore P, Friðgeirsson EA, et coll. The effect of fontanel on scalp EEG potentials in the neonate. Clin Neurophysiol 2015;126:1703–1710. doi:10.1016/j.clinph.2014.12.002.
- Azizollahi H, Aarabi A, Kazemi K, Wallois F. Assessing the effects of head modelling errors and measurement noise on EEG source localization accuracy in preterm newborns. Eur J Neurosci 2023;58:2746–2765. doi:10.1111/ejn.16060.
- Van Veen BD, van Drongelen W, Yuchtman M, Suzuki A. Localization of brain electrical activity via linearly constrained minimum variance spatial filtering. IEEE Trans Biomed Eng 1997;44:867–880. doi:10.1109/10.623056.
- Seeck M, Koessler L, Bast T, et coll. The standardized EEG electrode array of the IFCN. Clin Neurophysiol 2017;128:2070–2077. doi:10.1016/j.clinph.2017.06.254 — 25 électrodes avec la chaîne temporale inférieure ; chez le jeune enfant, au moins autant d'électrodes que chez l'adulte (os plus mince).

- **v5.5** — Janča R, Jezdik P, Cmejla R, et coll. Detection of interictal epileptiform discharges using signal envelope distribution modelling: application to epileptic and non-epileptic intracranial recordings. Brain Topogr 2015;28:172–183. doi:10.1007/s10548-014-0379-1 — détecteur de pointes par défaut (`ESI.detectSpikesJanca` : 200 Hz, 10–60 Hz, enveloppe de Hilbert, loi log-normale sur 5 s au pas de 1 s, seuil 3,65 × (mode + médiane), polypointes réunies à 120 ms). Implémentation écrite d'après l'article et la description de l'algorithme du code MATLAB de l'ISARG (github.com/EpiReC-ISARG/IED_detector), non recopiée ; validé en intracrânien, appliqué au scalp en référence moyenne avec ≥ 2 électrodes par évènement.
- Vallat R, Walker MP. An open-source, high-performance tool for automated sleep staging. eLife 2021;10:e70092. doi:10.7554/eLife.70092 — YASA 0.8.1 (licence BSD-3) : classifieurs LightGBM `clf_eeg_lgb_0.5.0` et `clf_eeg+demo_lgb_0.5.0` exportés en `assets/models/yasa_eeg*.json` (arbres complets, seuils en double précision) ; descripteurs de `SleepStaging.fit()` portés en JavaScript (filtre RIF de `mne.filter.create_filter`, Welch médian de scipy, Simpson de scipy, entropie de permutation, Higuchi et Petrosian d'antropy) ; accord 98,9 % (356/360 époques) avec YASA Python sur p10 (C4-A1), 99,7 % à signal rééchantillonné identique. Stades selon les règles de l'AASM (W, N1, N2, N3, R).
- Hjorth B. An on-line transformation of EEG scalp potentials into orthogonal source derivations. Electroencephalogr Clin Neurophysiol 1975;39:526–530. doi:10.1016/0013-4694(75)90056-5 — montage laplacien (électrode moins la moyenne de ses voisines, ≤ 4 à moins de 1,4 fois la plus proche).

- **v5.8** — Perslev M, Darkner S, Kempfner L, Nikolic M, Jennum PJ, Igel C. U-Sleep: resilient high-frequency sleep staging. NPJ Digit Med 2021;4:72. doi:10.1038/s41746-021-00440-5 — réseau entièrement convolutif (15 660 participants, 16 études) ; poids non publiés (service sleep.ai.ku.dk) : non intégré.
- Dei Rossi A, Metaldi M, Bechny M, et coll. SLEEPYLAND: trust begins with fair evaluation of automatic sleep staging models. NPJ Digit Med 2025 (publié en ligne le 16 décembre). doi:10.1038/s41746-025-02237-2 (préprint arXiv 2506.08574) — ≈ 220 000 h de polysomnographies dans le domaine et 84 000 h hors domaine, ensemble SOMNUS (F1 macro 68,7–87,2 %) ; comparaison hors domaine (YASA 0,84–0,87 d'exactitude sur DOD-O/DOD-H ; U-Sleep, SleepTransformer, ensembles) ; code et poids github.com/biomedical-signal-processing/sleepyland (MIT, Docker/PyTorch) : non intégré.
- Kemp B, Zwinderman AH, Tuk B, Kamphuisen HA, Oberyé JJ. Analysis of a sleep-dependent neuronal feedback loop: the slow-wave microcontinuity of the EEG. IEEE Trans Biomed Eng 2000;47:1185–94. doi:10.1109/10.867928 — Sleep-EDF (PhysioNet, ODC-BY) : nuits SC4001, SC4002, SC4012 utilisées pour évaluer le portage de YASA (82 % d'accord, κ 0,76, Fpz-Cz).
- **v5.6** — Jing J, Sun H, Kim JA, et coll. Development of expert-level automated detection of epileptiform discharges during electroencephalogram interpretation. JAMA Neurol 2020;77:103–108. doi:10.1001/jamaneurol.2019.3485 — SpikeNet : 9 571 EEG de scalp, 13 262 candidats annotés par 8 experts, AUC 0,980, erreur de calibration 0,041 (Persyst 13 : 0,066) ; poids `spikenet1.o` et prétraitement (`run_spikenet.py`) de github.com/bdsp-core/SpikeNet1, licence CC BY-NC 4.0, portés dans `spikenet.js` (calcul vérifié contre la sortie publiée).
- Li J, Goldenholz DM, Alkofer M, et coll. Expert-level detection of epilepsy markers in EEG on short and long timescales. NEJM AI 2025;2(7). doi:10.1056/aioa2401221 — SpikeNet2 (AUROC 0,973 interne, 0,942 externe) ; poids réservés (bdsp.io, accès accrédité), non intégrés.
- Kumar A, Upadhyay PK. Article de Sci Rep 2025 (1D-ResCNN de détection des pointes, doi:10.1038/s41598-025-90164-3) — examiné et non retenu : étiquettes issues d'un détecteur de pics automatique, une voie, sans code ni poids.
- Perrin F, Pernier J, Bertrand O, Echallier JF. Spherical splines for scalp potential and current density mapping. Electroencephalogr Clin Neurophysiol 1989;72:184–187. doi:10.1016/0013-4694(89)90180-6 — interpolation des électrodes manquantes (`ESI.splineWeights`, paramètres de MNE `interpolate_bads`).

## 7. Modélisation

- Modèles mécanistes : Epileptor/VEP (Jirsa 2017, Proix 2017/2018), réalisables en JavaScript pour 162 nœuds mais sans inversion bayésienne ; conservés comme perspective « what-if ».
- Inférence statique signe → ZE : Semio2Brain/SVT (bayésien). Aucune méthode publiée combinant séquence de signes + connectome pour estimer origine et propagation : c'est la contribution du projet (modèle décrit dans `SPECS.md` §5), avec pour horizon un HMM sur graphe / filtre particulaire sur l'hypothèse d'origine.
- Réglementaire : outil de recherche, qui n'est pas un dispositif médical (pas de marquage CE) ; un usage dans le soin le ferait relever du règlement (UE) 2017/745 (MDR) — l'étiquette « recherche, non validé pour un usage clinique » reste en place.

## 8. Ce qui est dans le dossier du projet

`old_version/` : prototype EpiScope v1 (Tkinter, liste `ictal_symptoms.xlsx` reprise ici), `brainplot_viz.py`, annotations VEP fsaverage, Semio2Brain et descriptions SVT, manuscrit v0, rapports TPS. Ces éléments ont servi d'ambiance et de matière (vocabulaire, atlas), pas de modèle.
