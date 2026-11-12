# -*- coding: utf-8 -*-
"""
Seed des priors signe → région VEP → data/sign_region_priors.csv

ATTENTION : seed initial. Le fichier canonique éditable est data/sign_region_priors.csv
(ce script l'ÉCRASE). Toute itération clinique se fait dans le CSV ou dans l'éditeur de l'app.

Colonnes
  sign_id     identifiant du signe (signs.csv)
  family      nom VEP sans préfixe d'hémisphère (ex. "Hippocampus-anterior", "SMA")
  topography  '' (toute topographie) ou face | UL | LL | trunk | hemibody : la ligne ne
              s'applique que si l'événement a cette topographie (ou aucune topographie,
              auquel cas elle compte avec un facteur 0.6)
  weight      0–1 : force avec laquelle la région fait partie du réseau actif quand le signe
              est présent. 1 = zone symptomatogène classique (quasi pathognomonique),
              0.6 = fréquente, 0.3 = possible / secondaire, 0.15 = occasionnelle
  role        symptomatogenic (la région PRODUIT le signe), onset (région d'origine
              statistiquement associée au signe sans le produire), both
  source      étiquette courte de la source (auteur année, « DES » = stimulation, « expert »)
  notes       libre

Sémantique : les poids ne sont PAS des probabilités normalisées ; ils sont comparés entre
régions pour un même signe (le moteur les normalise). Un signe diffus (rupture de contact)
a beaucoup de régions à poids modérés ; un signe élémentaire (clonies main) a 1 à 3 régions à
poids élevé. Les deux hémisphères sont gérés par laterality_rule (signs.csv) : les familles
sont sans hémisphère.
"""
import csv, os

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'sign_region_priors.csv')

CORTICAL = ['Frontal-pole', 'Orbito-frontal-cortex', 'Gyrus-rectus', 'F3-Pars-Orbitalis', 'F3-Pars-triangularis', 'F3-pars-opercularis', 'Inferior-frontal-sulcus', 'F2-rostral', 'F2-caudal', 'Middle-frontal-sulcus', 'SFS-rostral', 'SFS-caudal', 'F1-mesial-prefrontal', 'PreSMA', 'SMA', 'F1-lateral-prefrontal', 'F1-lateral-premotor', 'Subcallosal-area', 'Precentral-sulcus-inferior-part', 'Precentral-sulcus-superior-part', 'Precentral-gyrus-head-face', 'Precentral-gyrus-upper-limb', 'Central-sulcus-head-face', 'Central-sulcus-upper-limb', 'Paracentral-lobule', 'Central-operculum', 'Parietal-operculum', 'Anterior-cingulate-cortex', 'Middle-cingulate-cortex-anterior-part', 'Middle-cingulate-cortex-posterior-part', 'Posterior-cingulate-cortex-dorsal', 'Posterior-cingulate-cortex-retrosplenial-gyrus', 'Insula-gyri-brevi', 'Insula-gyri-longi', 'Temporal-pole', 'T1-planum-polare', 'Gyrus-of-Heschl', 'T1-planum-temporale', 'T1-lateral-anterior', 'T1-lateral-posterior', 'STS-anterior', 'STS-posterior', 'ITS-anterior', 'ITS-posterior', 'T2-anterior', 'T2-posterior', 'T3-anterior', 'T3-posterior', 'Fusiform-gyrus', 'Occipito-temporal-sulcus', 'Collateral-sulcus', 'Lingual-sulcus', 'Parahippocampal-cortex', 'Rhinal-cortex', 'Postcentral-gyrus', 'Postcentral-sulcus', 'Superior-parietal-lobule-P1', 'Supramarginal-anterior', 'Supramarginal-posterior', 'Angular-gyrus', 'Intraparietal-sulcus', 'Precuneus', 'Marginal-branch-of-the-cingulate-sulcus', 'Parieto-occipital-sulcus', 'Anterior-occipital-sulcus-and-preoccipital-notch', 'O3', 'O2', 'O1', 'Occipital-pole', 'Lingual-gyrus', 'Calcarine-sulcus', 'Cuneus']
SUBCORTICAL = ['Hippocampus-anterior', 'Hippocampus-posterior', 'Amygdala', 'Thalamus', 'Caudate-nucleus', 'Putamen', 'Pallidum', 'Nucleus-accumbens', 'Cerebellar-cortex']
FAMILIES = set(CORTICAL + SUBCORTICAL)

# aliases courts pour l'écriture
A = dict(
    HA='Hippocampus-anterior', HP='Hippocampus-posterior', AMY='Amygdala', THA='Thalamus', CAU='Caudate-nucleus',
    PUT='Putamen', PAL='Pallidum', NAC='Nucleus-accumbens', CER='Cerebellar-cortex',
    FP='Frontal-pole', OFC='Orbito-frontal-cortex', GR='Gyrus-rectus', F3orb='F3-Pars-Orbitalis', F3tri='F3-Pars-triangularis',
    F3op='F3-pars-opercularis', IFS='Inferior-frontal-sulcus', F2r='F2-rostral', F2c='F2-caudal', MFS='Middle-frontal-sulcus',
    SFSr='SFS-rostral', SFSc='SFS-caudal', F1m='F1-mesial-prefrontal', PSMA='PreSMA', SMA='SMA', F1l='F1-lateral-prefrontal',
    F1pm='F1-lateral-premotor', SUBC='Subcallosal-area', PCSi='Precentral-sulcus-inferior-part', PCSs='Precentral-sulcus-superior-part',
    PRCf='Precentral-gyrus-head-face', PRCu='Precentral-gyrus-upper-limb', CSf='Central-sulcus-head-face', CSu='Central-sulcus-upper-limb',
    PARA='Paracentral-lobule', COP='Central-operculum', POP='Parietal-operculum', ACC='Anterior-cingulate-cortex',
    MCCa='Middle-cingulate-cortex-anterior-part', MCCp='Middle-cingulate-cortex-posterior-part', PCCd='Posterior-cingulate-cortex-dorsal',
    RSC='Posterior-cingulate-cortex-retrosplenial-gyrus', INSa='Insula-gyri-brevi', INSp='Insula-gyri-longi', TP='Temporal-pole',
    PPo='T1-planum-polare', HES='Gyrus-of-Heschl', PT='T1-planum-temporale', T1a='T1-lateral-anterior', T1p='T1-lateral-posterior',
    STSa='STS-anterior', STSp='STS-posterior', ITSa='ITS-anterior', ITSp='ITS-posterior', T2a='T2-anterior', T2p='T2-posterior',
    T3a='T3-anterior', T3p='T3-posterior', FUS='Fusiform-gyrus', OTS='Occipito-temporal-sulcus', COLL='Collateral-sulcus',
    LGS='Lingual-sulcus', PHC='Parahippocampal-cortex', RHI='Rhinal-cortex', POC='Postcentral-gyrus', POCS='Postcentral-sulcus',
    SPL='Superior-parietal-lobule-P1', SMGa='Supramarginal-anterior', SMGp='Supramarginal-posterior', ANG='Angular-gyrus',
    IPS='Intraparietal-sulcus', PCUN='Precuneus', MARG='Marginal-branch-of-the-cingulate-sulcus', POS='Parieto-occipital-sulcus',
    AOS='Anterior-occipital-sulcus-and-preoccipital-notch', O3='O3', O2='O2', O1='O1', OPOLE='Occipital-pole', LG='Lingual-gyrus',
    CALC='Calcarine-sulcus', CUN='Cuneus')

ROWS = []
def P(sign_id, entries, source='expert', role='symptomatogenic', topo='', notes='', phase=''):
    for key, w in entries:
        fam = A.get(key, key)
        assert fam in FAMILIES, f'unknown family {fam} for {sign_id}'
        ROWS.append(dict(sign_id=sign_id, family=fam, topography=topo, phase=phase, weight=w, role=role, source=source, notes=notes))

# =============================================================== AURAS SENSORIELLES
P('aura_epigastric', [('AMY',.8),('HA',.8),('RHI',.6),('TP',.5),('PHC',.3),('PPo',.3)], 'Maillard 2004; Semio2Brain', 'onset', notes='initiale dans les crises mésiales et mésio-latérales')
P('aura_epigastric', [('INSa',.7),('INSp',.4),('COP',.3),('OFC',.3),('ACC',.2),('SUBC',.2),('THA',.1)], 'Isnard 2004; Mazzola 2017 (DES)', 'symptomatogenic', notes='insula antérieure viscérale')
P('aura_cephalic', [('F1m',.3),('F2r',.3),('ACC',.3),('HA',.3),('AMY',.3),('INSa',.3),('TP',.2),('SMGa',.2)], 'expert', 'both')
# paresthésies : lignes génériques + somatotopie
P('somatosensory_paresthesia', [('POC',1.0),('POCS',.6),('POP',.7),('INSp',.6),('SMGa',.4),('COP',.4),('SPL',.3),('THA',.2),('SMA',.2)], 'Penfield; Mazzola 2017 (DES)', notes='SII/insula postérieure si bilatéral')
P('somatosensory_paresthesia', [('CSf',.8),('PRCf',.4),('COP',.6)], 'Penfield (DES)', topo='face')
P('somatosensory_paresthesia', [('CSu',.8),('PRCu',.4)], 'Penfield (DES)', topo='UL')
P('somatosensory_paresthesia', [('PARA',.9),('MARG',.4)], 'Penfield (DES)', topo='LL')
P('somatosensory_paresthesia', [('PARA',.5),('POC',.6),('INSp',.6),('POP',.6)], 'expert', topo='trunk')
P('somatosensory_paresthesia', [('INSp',.8),('POP',.8),('POC',.6)], 'Mazzola 2017 (DES)', topo='hemibody', notes='hémicorps entier : SII / insula postérieure')
P('somatosensory_pain', [('INSp',1.0),('POP',.8),('POC',.5),('COP',.5),('ACC',.3),('INSa',.4)], 'Mazzola 2017 (DES)', notes='douleur privilégiée quadrant postéro-supérieur de l insula')
P('somatosensory_thermal', [('INSp',.9),('POP',.6),('POC',.4),('INSa',.4)], 'Mazzola 2017 (DES)')
P('laryngeal_constriction', [('INSa',.9),('INSp',.8),('COP',.6),('POP',.4),('F3op',.3)], 'Isnard 2004', notes='premier temps de la séquence insulaire')
P('laryngeal_constriction', [('AMY',.3),('HA',.2),('TP',.2)], 'expert', 'onset', notes='propagation temporo-insulaire fréquente (86 % des crises temporales atteignent l insula)')
P('visual_elementary', [('CALC',1.0),('OPOLE',.9),('CUN',.8),('LG',.8),('LGS',.5),('O1',.5),('O2',.5),('O3',.5),('POS',.4),('AOS',.3)], 'Penfield; Salanova (DES)')
P('visual_complex', [('FUS',.7),('T3p',.6),('O3',.6),('OTS',.6),('O2',.5),('T2p',.5),('PHC',.4),('LG',.4),('HP',.3),('AMY',.3),('ANG',.3),('STSp',.3),('TP',.2)], 'Penfield; expert')
P('visual_illusion', [('ANG',.6),('O2',.6),('AOS',.6),('T2p',.5),('STSp',.5),('SMGp',.4),('IPS',.4),('FUS',.4),('LG',.3)], 'expert')
P('visual_loss', [('CALC',.9),('OPOLE',.8),('CUN',.6),('LG',.6),('O1',.4)], 'expert')
P('auditory_elementary', [('HES',1.0),('PT',.8),('T1p',.5),('T1a',.4),('POP',.3),('INSp',.3),('STSp',.3)], 'Penfield; Mazzola 2017 (DES)')
P('auditory_elementary', [('T1a',.3),('T2a',.2)], 'Maillard 2004', 'onset', notes='groupe latéral : hallucination auditive initiale')
P('auditory_complex', [('T1p',.7),('PT',.7),('STSp',.6),('T1a',.6),('T2p',.5),('HES',.5),('STSa',.4),('PPo',.3),('HA',.3),('AMY',.3),('TP',.3)], 'Penfield; expert')
P('auditory_illusion', [('T1p',.7),('PT',.7),('HES',.5),('STSp',.4),('SMGp',.3)], 'expert')
P('olfactory', [('AMY',.9),('RHI',.8),('OFC',.5),('GR',.4),('HA',.5),('INSa',.4),('TP',.4),('SUBC',.2)], 'Selimbeyoglu 2010 (DES); expert', notes='cortex piriforme ≈ amygdale/rhinal')
P('gustatory', [('INSa',.9),('COP',.8),('POP',.6),('INSp',.5),('AMY',.3),('HA',.3),('RHI',.2),('TP',.2)], 'Mazzola 2017 (DES)', notes='goût : insula moyenne dorsale exclusivement en stimulation')
P('vestibular', [('INSp',.8),('POP',.8),('SMGa',.6),('SMGp',.5),('T1p',.5),('STSp',.4),('ANG',.3),('IPS',.3),('COP',.3),('F2c',.2),('PCUN',.2)], 'Mazzola 2017 (DES); expert', notes='PIVC')
P('genital_sensation', [('PARA',.9),('POC',.4),('POP',.4),('INSp',.3),('AMY',.3),('HA',.3),('TP',.2)], 'expert')
P('urinary_urge', [('AMY',.5),('HA',.5),('INSa',.5),('T1a',.4),('PARA',.3),('ACC',.3),('TP',.3)], 'ILAE 2022; expert')
P('unspecific_aura', [('AMY',.3),('HA',.3),('TP',.2),('INSa',.3),('F1m',.2),('OFC',.2),('ACC',.2),('F2r',.2)], 'expert', 'both')

# =============================================================== EXPÉRIENTIEL
P('fear', [('AMY',1.0),('HA',.5),('TP',.5),('RHI',.3),('INSa',.5)], 'Maillard 2004; Bartolomei 2005', 'both', notes='peur initiale : mésial temporal')
P('fear', [('ACC',.6),('OFC',.6),('GR',.5),('SUBC',.4),('F1m',.4)], 'Bonini 2014 (G4)', 'both', notes='préfrontal ventromédian')
P('deja_vu', [('RHI',1.0),('HA',.8),('AMY',.6),('PHC',.5),('TP',.5),('T2a',.3),('HP',.3)], 'Bartolomei 2004 (DES); Barbeau 2005')
P('reminiscence', [('HA',.8),('RHI',.8),('AMY',.7),('TP',.6),('PHC',.5),('T1a',.4),('T2a',.4),('HP',.4),('STSa',.3)], 'Vignal 2007 (dreamy state, DES); Barbeau 2005')
P('derealization', [('RHI',.5),('HA',.5),('AMY',.5),('TP',.5),('ANG',.4),('STSp',.3),('INSa',.3),('SMGp',.3)], 'expert')
P('out_of_body', [('ANG',.9),('SMGp',.7),('STSp',.6),('T1p',.5),('PCUN',.5),('POP',.4),('INSp',.3),('IPS',.3)], 'Blanke 2002 (DES)')
P('forced_thinking', [('F1l',.7),('F2r',.7),('F1m',.6),('SFSr',.5),('FP',.5),('ACC',.4),('F3tri',.4),('IFS',.4)], 'expert')
P('ecstatic', [('INSa',1.0),('INSp',.3),('ACC',.4),('TP',.3),('AMY',.3),('HA',.3)], 'Picard 2013; Gschwind 2016')
P('sadness', [('AMY',.5),('ACC',.5),('SUBC',.4),('OFC',.4),('TP',.3),('HA',.3),('F1m',.3)], 'expert')
P('anger', [('AMY',.6),('OFC',.5),('ACC',.4),('TP',.4),('GR',.3)], 'expert')
P('sexual_arousal', [('AMY',.5),('HA',.4),('TP',.4),('PARA',.3),('INSa',.3),('OFC',.3)], 'expert')

# =============================================================== CONSCIENCE
P('loss_of_awareness', [('HA',.5),('HP',.5),('AMY',.4),('PHC',.4),('ACC',.4),('F1m',.4),('PSMA',.3),('MCCa',.3),('INSa',.3)], 'Bartolomei & Naccache 2011; Arthuis 2009', 'both', notes='synchronie temporo-pariéto-frontale (espace de travail global)')
P('loss_of_awareness', [('THA',.7),('PCCd',.5),('PCUN',.5),('ANG',.3),('CAU',.2)], 'Blumenfeld; Arthuis 2009', 'propagation', notes='thalamus et cortex pariétal médian recrutés, jamais origine')
P('loss_of_awareness', [('T1a',.5),('T1p',.4),('T2a',.3),('STSa',.2)], 'Maillard 2004', 'onset', phase='early', notes='rupture de contact initiale : groupe latéral / néocortical')
P('loss_of_awareness', [('HA',.3),('AMY',.3),('RHI',.2)], 'Maillard 2004', 'onset', phase='late', notes='rupture de contact retardée : groupe mésial')
P('behavioral_arrest', [('ACC',.6),('PSMA',.5),('SMA',.4),('F1m',.5),('HA',.4),('AMY',.4),('TP',.3),('INSa',.3)], 'expert', 'both')
P('behavioral_arrest', [('THA',.4),('PCUN',.3),('PCCd',.3),('CAU',.3)], 'expert', 'propagation')
P('arousal_from_sleep', [('ACC',.5),('THA',.5),('SMA',.4),('PSMA',.4),('F1m',.4),('INSa',.3),('OFC',.3),('MCCa',.3)], 'Tinuper 2016; expert', 'both')
P('confusion', [('HA',.4),('HP',.4),('THA',.4),('PHC',.3),('ACC',.3),('F1m',.3),('PCUN',.3)], 'expert', 'both')

# =============================================================== LANGAGE
P('speech_arrest', [('F3op',.9),('PRCf',.9),('COP',.8),('PCSi',.7),('SMA',.7),('INSa',.6),('F3tri',.5),('PSMA',.5),('CSf',.5),('IFS',.3)], 'Penfield; Lüders (DES)', notes='aires motrices négatives')
P('aphasia_production', [('F3op',.8),('F3tri',.8),('IFS',.5),('T1p',.6),('STSp',.5),('T2p',.5),('SMGa',.5),('INSa',.4),('PCSi',.4),('T3p',.3),('F2c',.2),('CAU',.2)], 'expert')
P('aphasia_comprehension', [('T1p',1.0),('PT',.8),('STSp',.8),('T2p',.7),('SMGp',.5),('ANG',.5),('HES',.4),('T2a',.3),('T3p',.3)], 'expert')
P('dysarthria', [('PRCf',.9),('COP',.8),('INSa',.6),('INSp',.5),('F3op',.5),('CSf',.5),('POP',.3),('CER',.2),('PUT',.2)], 'Isnard 2004; expert')
P('vocalization', [('SMA',.7),('ACC',.6),('PSMA',.5),('PRCf',.5),('COP',.5),('F3op',.4),('INSa',.4),('AMY',.3),('OFC',.3),('MCCa',.3)], 'expert')
P('verbal_automatisms', [('T1a',.5),('T1p',.4),('T2a',.4),('HA',.4),('AMY',.4),('TP',.4),('F1m',.3),('ACC',.3),('OFC',.3)], 'ILAE 2022; expert', 'both')
P('vocal_automatisms', [('INSa',.4),('T1a',.4),('TP',.4),('ACC',.4),('SMA',.3),('F1m',.3),('AMY',.3),('HA',.3)], 'expert', 'both')

# =============================================================== MOTEUR ÉLÉMENTAIRE
P('clonic', [('PCSi',.4),('PCSs',.4),('POC',.4),('SMA',.3),('F1pm',.3),('F2c',.2)], 'expert')
P('clonic', [('PRCf',1.0),('CSf',.8),('COP',.5)], 'Penfield (DES)', topo='face')
P('clonic', [('PRCu',1.0),('CSu',.8),('F1pm',.3)], 'Penfield (DES)', topo='UL')
P('clonic', [('PARA',1.0),('MARG',.3),('SMA',.3)], 'Penfield (DES)', topo='LL')
P('clonic', [('PARA',.6),('PRCu',.5),('SMA',.4)], 'expert', topo='trunk')
P('clonic', [('PRCu',.8),('PRCf',.7),('PARA',.6),('CSu',.6),('CSf',.5)], 'expert', topo='hemibody')
P('tonic', [('SMA',.9),('PSMA',.5),('F1pm',.7),('F2c',.5),('PCSs',.6),('MCCa',.5),('ACC',.3),('INSp',.3),('PUT',.3)], 'Bonini 2014 (G1-G2); expert')
P('tonic', [('PRCf',.6),('COP',.3)], 'expert', topo='face')
P('tonic', [('PRCu',.7)], 'expert', topo='UL')
P('tonic', [('PARA',.6)], 'expert', topo='LL')
P('asymmetric_tonic', [('SMA',1.0),('PSMA',.6),('PARA',.5),('F1pm',.7),('MCCa',.5),('PRCu',.5),('F2c',.4),('PCSs',.5),('INSp',.3),('POP',.2),('THA',.2)], 'ILAE 2022; Chisholm 2025', notes='bras tendu controlatéral')
P('bilateral_asymmetric_tonic', [('SMA',.9),('PSMA',.6),('F1m',.5),('MCCa',.5),('ACC',.4),('F1pm',.5),('INSp',.4),('PARA',.4),('THA',.2)], 'Chisholm 2025; expert')
P('axial_tonic', [('SMA',.9),('PSMA',.7),('F1m',.6),('MCCa',.6),('ACC',.5),('F1pm',.5),('PARA',.4),('INSp',.3),('THA',.3)], 'Bonini 2014 (G2)')
P('dystonic_posturing', [('PUT',.8),('CAU',.4),('PAL',.4),('THA',.3)], 'Dupont 1998; expert', 'propagation', notes='implication des ganglions de la base : zone de propagation, jamais d origine')
P('dystonic_posturing', [('SMA',.4),('F1pm',.3),('ACC',.3),('PRCu',.3),('MCCa',.3)], 'expert', 'propagation', phase='late')
P('dystonic_posturing', [('HA',.6),('AMY',.6),('RHI',.4),('INSa',.4),('TP',.3)], 'Kotagal; Dupont 1998; ILAE 2022', 'onset', notes='marqueur de crise temporale mésiale, retardé (propagation mésio-striatale)')
P('myoclonus', [('POC',.5),('PCSi',.3),('PCSs',.3),('SMA',.2),('THA',.2)], 'expert')
P('myoclonus', [('PRCf',.9),('CSf',.8)], 'expert', topo='face')
P('myoclonus', [('PRCu',.9),('CSu',.8)], 'expert', topo='UL')
P('myoclonus', [('PARA',.9)], 'expert', topo='LL')
P('negative_myoclonus', [('POC',.6),('PCSi',.4),('SMA',.5),('F3op',.4),('COP',.4)], 'Lüders (aires motrices négatives)')
P('negative_myoclonus', [('PRCu',.7),('CSu',.6)], 'expert', topo='UL')
P('negative_myoclonus', [('PARA',.7)], 'expert', topo='LL')
P('ictal_paresis', [('SMA',.6),('F3op',.5),('PCSi',.5),('POC',.4),('COP',.4),('POP',.3),('SMGa',.3),('THA',.2)], 'Lüders; expert')
P('ictal_paresis', [('PRCf',.6),('CSf',.4)], 'expert', topo='face')
P('ictal_paresis', [('PRCu',.6),('CSu',.4)], 'expert', topo='UL')
P('ictal_paresis', [('PARA',.6)], 'expert', topo='LL')
P('ictal_paresis', [('PRCu',.5),('PRCf',.5),('PARA',.5)], 'expert', topo='hemibody')
P('head_version', [('F2c',1.0),('SFSc',.7),('F1pm',.7),('PCSs',.6),('SMA',.6),('PSMA',.5),('PRCf',.4),('PRCu',.3),('MCCa',.3),('IPS',.3),('O2',.2)], 'Penfield; Bonini 2014 (G1)', notes='FEF ; version précédant une GTC : controlatérale et fiable')
P('head_version', [('F2c',.6),('SFSc',.4),('F1pm',.4)], 'expert', 'propagation', phase='late', notes='version tardive avant généralisation : propagation frontale, quelle que soit l origine')
P('head_version', [('HA',.2),('AMY',.2),('INSa',.2)], 'expert', 'onset', phase='late')
P('eye_version', [('F2c',1.0),('SFSc',.6),('F1pm',.6),('PCSs',.5),('IPS',.5),('SPL',.3),('O2',.4),('OPOLE',.3),('CALC',.3),('CUN',.3),('SMA',.3)], 'Penfield; expert')
P('nystagmus', [('O2',.6),('O1',.5),('OPOLE',.5),('IPS',.6),('ANG',.4),('SPL',.4),('F2c',.6),('POP',.3),('INSp',.3),('CUN',.3)], 'expert')
P('head_turn_nonforced', [('AMY',.5),('HA',.5),('TP',.4),('T1a',.3),('INSa',.3),('OFC',.3),('F1m',.2),('ACC',.3)], 'ILAE 2022; expert', 'onset', notes='ipsilatéral, précoce, temporal')
P('blinking', [('PRCf',.4),('COP',.3),('INSa',.4),('ACC',.4),('SMA',.3),('OPOLE',.4),('CALC',.3),('CUN',.3),('AMY',.3),('HA',.3),('THA',.2)], 'Chisholm 2025; expert', 'both')
P('eyelid_myoclonia', [('OPOLE',.5),('CALC',.5),('CUN',.4),('O1',.3),('PRCf',.3),('THA',.3)], 'expert')
P('chapeau_de_gendarme', [('ACC',1.0),('F1m',.8),('PSMA',.7),('MCCa',.6),('OFC',.5),('SUBC',.4),('SMA',.4),('INSa',.4),('GR',.3),('F2r',.3)], 'Souirti 2014; Bonini 2014 (G2)')
P('facial_contraction', [('PRCf',1.0),('CSf',.8),('COP',.8),('PCSi',.6),('POC',.4),('INSp',.4),('F3op',.4),('SMA',.3)], 'Penfield (DES)')
P('spasm', [('SMA',.5),('PSMA',.4),('MCCa',.4),('PARA',.4),('PRCu',.4),('SPL',.4),('POC',.3),('O1',.3),('OPOLE',.3),('THA',.4),('F1m',.3),('T2p',.2)], 'expert', 'both')
P('fbtcs', [('PRCu',.7),('PRCf',.7),('PARA',.6),('SMA',.7),('POC',.5),('THA',.7),('PUT',.4),('F1pm',.5),('MCCa',.4),('MCCp',.3),('CER',.3),('CAU',.3),('PAL',.3),('ACC',.4),('INSp',.3),('PCSs',.4),('PCSi',.4)], 'expert', 'propagation', notes='généralisation : réseau de propagation, n informe pas l origine')
P('fall', [('SMA',.4),('PARA',.4),('PRCu',.3),('POC',.3),('SPL',.3),('SMGa',.3),('THA',.4),('INSp',.3),('POP',.3),('CER',.2),('ACC',.3),('F1m',.3)], 'expert', 'both')

# =============================================================== MOTEUR COMPLEXE / AUTOMATISMES
P('oroalimentary_automatisms', [('AMY',.9),('HA',.9),('RHI',.6),('PHC',.5),('TP',.6),('HP',.4),('PPo',.3)], 'Maillard 2004; Kotagal', 'onset', notes='mésial : automatismes retardés')
P('oroalimentary_automatisms', [('T1a',.5),('T2a',.4),('STSa',.3),('T1p',.3)], 'Maillard 2004', 'onset', phase='early', notes='automatismes précoces (< 10 s) : groupe mésio-latéral, implication latérale à 0–3 s')
P('oroalimentary_automatisms', [('THA',.2)], 'expert', 'propagation')
P('oroalimentary_automatisms', [('INSa',.6),('INSp',.4),('COP',.5),('OFC',.4),('ACC',.3),('SUBC',.2)], 'Chisholm 2025; expert', 'symptomatogenic', notes='mâchonnement/déglutition tardifs dans les crises insulaires antérieures')
P('gestural_automatisms_distal', [('HA',.8),('AMY',.7),('TP',.5),('RHI',.4),('PHC',.4),('HP',.4),('INSa',.4)], 'Maillard 2004; Kotagal', 'onset')
P('gestural_automatisms_distal', [('T1a',.5),('T2a',.4),('STSa',.3)], 'Maillard 2004', 'onset', phase='early', notes='précoces : mésio-latéral')
P('gestural_automatisms_distal', [('OFC',.5),('ACC',.5),('F1m',.4),('CAU',.2),('THA',.2)], 'expert', 'symptomatogenic')
P('gestural_automatisms_integrated', [('FP',.6),('F1l',.7),('F2r',.7),('F1m',.7),('ACC',.6),('OFC',.6),('GR',.4),('SFSr',.5),('MFS',.4),('IFS',.3),('F3tri',.3),('TP',.3),('CAU',.3),('SUBC',.3)], 'Bonini 2014 (G3)', 'both')
P('hyperkinetic', [('PSMA',.8),('SMA',.6),('F1m',.8),('ACC',.8),('MCCa',.6),('OFC',.6),('F2r',.5),('F1l',.5),('GR',.4),('SUBC',.4),('F1pm',.4),('CAU',.3),('THA',.3),('PCCd',.2)], 'Bonini 2014 (G2); Rheims 2008', 'both')
P('hyperkinetic', [('INSa',.5),('TP',.4),('AMY',.3),('POP',.2)], 'Ryvlin 2006; Rheims 2008', 'onset', notes='crises hypermotrices d origine insulaire, temporale (via OFC) ou pariétale')
P('hyperkinetic_proximal', [('F1m',.8),('ACC',.9),('OFC',.8),('GR',.6),('SUBC',.5),('FP',.4),('F2r',.4),('F1l',.4),('PSMA',.5),('MCCa',.4)], 'Rheims 2008 (HM1); Bonini 2014 (G2-G3)', 'both', notes='HM1 : préfrontal ventromésial et orbitofrontal')
P('hyperkinetic_proximal', [('TP',.5),('AMY',.4),('INSa',.5),('HA',.3)], 'Rheims 2008; Ryvlin 2006', 'onset', notes='origines temporo-polaire / insulaire avec propagation orbitofrontale')
P('hyperkinetic_mild', [('PSMA',.9),('SMA',.8),('MCCa',.7),('F1m',.5),('F1pm',.5),('ACC',.4),('PARA',.3)], 'Rheims 2008 (HM2)', 'both', notes='HM2 : prémoteur mésial')
P('hyperkinetic_mild', [('INSa',.3),('POP',.2)], 'Rheims 2008', 'onset')
P('stereotypies', [('F1l',.5),('F2r',.5),('FP',.5),('ACC',.4),('OFC',.4),('CAU',.4),('PUT',.3),('F1m',.4)], 'Bonini 2014 (G3); expert', 'both')
P('mimic_automatisms', [('AMY',.7),('ACC',.7),('OFC',.6),('F1m',.5),('SUBC',.4),('INSa',.5),('GR',.4),('TP',.4),('FP',.3),('HA',.3)], 'Bonini 2014 (G3-G4)', 'both')
P('nose_wiping', [('AMY',.6),('HA',.6),('TP',.4),('RHI',.3),('INSa',.3),('OFC',.3),('HP',.3)], 'ILAE 2022', 'onset')
P('pedaling', [('PSMA',.6),('SMA',.6),('F1m',.6),('ACC',.6),('MCCa',.5),('PARA',.4),('OFC',.4),('INSa',.3),('TP',.2)], 'expert', 'both')
P('ictal_grasping', [('SMA',.6),('MCCa',.6),('ACC',.5),('F1m',.5),('PARA',.3),('PRCu',.3),('CAU',.2)], 'expert')
P('gelastic', [('ACC',.6),('SUBC',.5),('GR',.5),('OFC',.5),('F1m',.4),('TP',.4),('AMY',.4),('HA',.4),('FP',.3),('INSa',.3),('THA',.2)], 'expert', 'both', notes='hypothalamus (hamartome) absent de l atlas VEP')
P('dacrystic', [('ACC',.5),('AMY',.5),('SUBC',.4),('OFC',.4),('TP',.4),('HA',.4),('F1m',.3)], 'expert', 'both')
P('undressing', [('TP',.4),('AMY',.4),('HA',.4),('OFC',.4),('ACC',.4),('F1m',.3),('INSa',.3)], 'expert', 'both')
P('wandering', [('HA',.5),('AMY',.4),('TP',.3),('F1m',.4),('ACC',.4),('OFC',.4),('PCCd',.2),('PCUN',.2)], 'expert', 'both')
P('sexual_automatisms', [('F1m',.5),('ACC',.5),('PSMA',.4),('OFC',.4),('TP',.3),('AMY',.3),('PARA',.3),('INSa',.3)], 'expert', 'both')
P('aggressive_behavior', [('AMY',.5),('OFC',.5),('ACC',.4),('TP',.4),('F1m',.3),('GR',.3)], 'expert', 'both')
P('spitting', [('AMY',.5),('HA',.5),('INSa',.5),('TP',.4),('COP',.3),('ACC',.3)], 'ILAE 2022; expert', 'both')
P('water_drinking', [('AMY',.4),('HA',.4),('TP',.4),('INSa',.4),('ACC',.3)], 'expert', 'both')

# =============================================================== VÉGÉTATIF
P('tachycardia', [('INSa',.6),('AMY',.6),('HA',.5),('ACC',.5),('TP',.4),('OFC',.3),('INSp',.3),('SUBC',.2),('HP',.3),('F1m',.2)], 'Chisholm 2025; expert', 'both')
P('bradycardia', [('INSa',.6),('INSp',.4),('AMY',.5),('HA',.4),('ACC',.4),('TP',.4),('OFC',.3),('SUBC',.3)], 'expert', 'both')
P('apnea', [('AMY',.9),('HA',.7),('INSa',.5),('ACC',.5),('TP',.4),('SUBC',.3),('OFC',.3),('RHI',.3),('INSp',.3)], 'Dlouhy 2015 (DES)', 'both')
P('hyperventilation', [('INSa',.5),('ACC',.5),('AMY',.5),('HA',.4),('F1m',.3),('TP',.3),('OFC',.3),('SMA',.2)], 'expert', 'both')
P('flushing', [('INSa',.5),('AMY',.5),('ACC',.5),('HA',.4),('OFC',.3),('TP',.3),('INSp',.3)], 'expert', 'both')
P('piloerection', [('AMY',.6),('HA',.6),('INSa',.5),('TP',.4),('ACC',.3),('OFC',.3),('INSp',.3),('RHI',.3)], 'ILAE 2022; expert', 'both')
P('hypersalivation', [('INSa',.6),('INSp',.5),('COP',.6),('POP',.4),('AMY',.4),('HA',.4),('TP',.3),('PRCf',.3)], 'expert', 'both')
P('vomiting', [('AMY',.5),('HA',.5),('INSa',.6),('INSp',.4),('TP',.4),('COP',.3),('ACC',.3),('OFC',.2),('PPo',.2)], 'ILAE 2022; expert', 'both')
P('urination', [('ACC',.4),('PARA',.4),('F1m',.4),('INSa',.3),('AMY',.3),('HA',.3),('THA',.2),('TP',.2)], 'expert', 'both')
P('mydriasis', [('AMY',.4),('INSa',.4),('ACC',.4),('HA',.3),('F2c',.3),('OFC',.3),('THA',.2)], 'expert', 'both')
P('cough', [('INSa',.4),('INSp',.4),('COP',.4),('AMY',.3),('HA',.3),('TP',.3),('POP',.2)], 'expert', 'both')
P('sweating', [('INSa',.5),('AMY',.4),('ACC',.4),('HA',.3),('OFC',.3)], 'expert', 'both')

# =============================================================== POST-CRITIQUE
P('postictal_aphasia', [('T1p',.7),('STSp',.5),('T2p',.5),('F3op',.5),('F3tri',.5),('HA',.5),('AMY',.4),('T1a',.4),('SMGa',.3),('TP',.3),('PT',.3)], 'ILAE 2022; expert', 'both')
P('postictal_hemiparesis', [('SMA',.5),('POC',.4),('F1pm',.4),('PCSs',.4),('PCSi',.4),('PUT',.2),('THA',.2)], 'expert', 'both')
P('postictal_hemiparesis', [('PRCf',.8),('CSf',.6)], 'expert', topo='face')
P('postictal_hemiparesis', [('PRCu',.8),('CSu',.6)], 'expert', topo='UL')
P('postictal_hemiparesis', [('PARA',.8)], 'expert', topo='LL')
P('postictal_hemiparesis', [('PRCu',.7),('PRCf',.6),('PARA',.6)], 'expert', topo='hemibody')
P('postictal_confusion', [('HA',.5),('HP',.5),('AMY',.4),('THA',.4),('PHC',.4),('TP',.3),('PCUN',.3),('PCCd',.3),('F1m',.3),('ACC',.3)], 'expert', 'both')
P('postictal_amnesia', [('HA',.7),('HP',.6),('RHI',.5),('PHC',.5),('AMY',.4),('THA',.3)], 'expert', 'both')
P('postictal_nose_wiping', [('AMY',.6),('HA',.6),('TP',.4),('RHI',.3),('INSa',.3),('HP',.3)], 'ILAE 2022', 'onset')

with open(OUT, 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=['sign_id','family','topography','phase','weight','role','source','notes'])
    w.writeheader(); w.writerows(ROWS)
print('wrote', OUT, len(ROWS), 'rows,', len({r["sign_id"] for r in ROWS}), 'signs')
