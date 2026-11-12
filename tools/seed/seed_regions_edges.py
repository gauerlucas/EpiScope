# -*- coding: utf-8 -*-
"""
Seed de data/regions.csv (métadonnées cliniques des 81 familles VEP) et de
data/network_edges.csv (liens fonctionnels/structurels longue distance curés),
et de data/semio2brain_category_map.csv (catégories SemioDict → signes EpiScope).

ATTENTION : seed initial, ÉCRASE les CSV. Les CSV sont les fichiers canoniques éditables.

regions.csv
  family, label_fr, lobe, system, ez_prior, notes
    system   : regroupement « réseau » utilisé pour l'affichage et l'agrégation
    ez_prior : facteur multiplicatif (1 = neutre) appliqué au score de candidat d'origine.
               Sert à encoder une connaissance a priori (fréquence des ZE dans cette région
               en SEEG) ; laisser à 1 sauf raison explicite.
network_edges.csv
  family_a, family_b, weight, kind, name, source, notes
    weight 0–1 ; kind = structural | functional | both ; lien intra-hémisphérique appliqué
    aux deux hémisphères. Le lien homotopique inter-hémisphérique est un paramètre global
    (params.homotopic) et non une ligne.
"""
import csv, os
D = os.path.join(os.path.dirname(__file__), '..', '..', 'data')

R = []
def reg(family, fr, lobe, system, ez=1.0, notes=''):
    R.append(dict(family=family, label_fr=fr, lobe=lobe, system=system, ez_prior=ez, notes=notes))

# ---- frontal
reg('Frontal-pole','Pôle frontal','frontal','prefrontal_lateral')
reg('Orbito-frontal-cortex','Cortex orbitofrontal','frontal','orbitofrontal')
reg('Gyrus-rectus','Gyrus droit','frontal','orbitofrontal')
reg('F3-Pars-Orbitalis','F3 pars orbitalis','frontal','prefrontal_lateral')
reg('F3-Pars-triangularis','F3 pars triangularis','frontal','prefrontal_lateral')
reg('F3-pars-opercularis','F3 pars opercularis','frontal','insulo_opercular')
reg('Inferior-frontal-sulcus','Sillon frontal inférieur','frontal','prefrontal_lateral')
reg('F2-rostral','F2 rostral','frontal','prefrontal_lateral')
reg('F2-caudal','F2 caudal (aire oculomotrice)','frontal','premotor')
reg('Middle-frontal-sulcus','Sillon frontal moyen','frontal','prefrontal_lateral')
reg('SFS-rostral','Sillon frontal supérieur rostral','frontal','prefrontal_lateral')
reg('SFS-caudal','Sillon frontal supérieur caudal','frontal','premotor')
reg('F1-mesial-prefrontal','F1 mésial préfrontal','frontal','prefrontal_mesial')
reg('PreSMA','Pré-AMS','frontal','premotor')
reg('SMA','Aire motrice supplémentaire','frontal','premotor')
reg('F1-lateral-prefrontal','F1 latéral préfrontal','frontal','prefrontal_lateral')
reg('F1-lateral-premotor','F1 latéral prémoteur','frontal','premotor')
reg('Subcallosal-area','Aire sous-calleuse','frontal','prefrontal_mesial')
reg('Precentral-sulcus-inferior-part','Sillon précentral inférieur','frontal','premotor')
reg('Precentral-sulcus-superior-part','Sillon précentral supérieur','frontal','premotor')
reg('Precentral-gyrus-head-face','Gyrus précentral (face)','frontal','central')
reg('Precentral-gyrus-upper-limb','Gyrus précentral (membre supérieur)','frontal','central')
reg('Central-sulcus-head-face','Sillon central (face)','frontal','central')
reg('Central-sulcus-upper-limb','Sillon central (membre supérieur)','frontal','central')
reg('Paracentral-lobule','Lobule paracentral','frontal','central')
reg('Central-operculum','Opercule rolandique','frontal','insulo_opercular')
reg('Parietal-operculum','Opercule pariétal (SII)','parietal','insulo_opercular')
# ---- cingulate
reg('Anterior-cingulate-cortex','Cingulaire antérieur','cingulate','prefrontal_mesial')
reg('Middle-cingulate-cortex-anterior-part','Cingulaire moyen antérieur','cingulate','prefrontal_mesial')
reg('Middle-cingulate-cortex-posterior-part','Cingulaire moyen postérieur','cingulate','posterior_medial')
reg('Posterior-cingulate-cortex-dorsal','Cingulaire postérieur dorsal','cingulate','posterior_medial')
reg('Posterior-cingulate-cortex-retrosplenial-gyrus','Cortex rétrosplénial','cingulate','posterior_medial')
# ---- insula
reg('Insula-gyri-brevi','Insula antérieure (gyri courts)','insula','insulo_opercular')
reg('Insula-gyri-longi','Insula postérieure (gyri longs)','insula','insulo_opercular')
# ---- temporal
reg('Temporal-pole','Pôle temporal','temporal','mesial_temporal')
reg('T1-planum-polare','Planum polare','temporal','lateral_temporal')
reg('Gyrus-of-Heschl','Gyrus de Heschl','temporal','lateral_temporal')
reg('T1-planum-temporale','Planum temporale','temporal','lateral_temporal')
reg('T1-lateral-anterior','T1 latéral antérieur','temporal','lateral_temporal')
reg('T1-lateral-posterior','T1 latéral postérieur','temporal','lateral_temporal')
reg('STS-anterior','STS antérieur','temporal','lateral_temporal')
reg('STS-posterior','STS postérieur','temporal','lateral_temporal')
reg('ITS-anterior','ITS antérieur','temporal','lateral_temporal')
reg('ITS-posterior','ITS postérieur','temporal','lateral_temporal')
reg('T2-anterior','T2 antérieur','temporal','lateral_temporal')
reg('T2-posterior','T2 postérieur','temporal','lateral_temporal')
reg('T3-anterior','T3 antérieur','temporal','basal_temporal')
reg('T3-posterior','T3 postérieur','temporal','basal_temporal')
reg('Fusiform-gyrus','Gyrus fusiforme','temporal','basal_temporal')
reg('Occipito-temporal-sulcus','Sillon occipito-temporal','temporal','basal_temporal')
reg('Collateral-sulcus','Sillon collatéral','temporal','basal_temporal')
reg('Lingual-sulcus','Sillon lingual','occipital','occipital')
reg('Parahippocampal-cortex','Cortex parahippocampique','temporal','mesial_temporal')
reg('Rhinal-cortex','Cortex rhinal (entorhinal/périrhinal)','temporal','mesial_temporal')
# ---- parietal
reg('Postcentral-gyrus','Gyrus postcentral (SI)','parietal','central')
reg('Postcentral-sulcus','Sillon postcentral','parietal','parietal_lateral')
reg('Superior-parietal-lobule-P1','Lobule pariétal supérieur','parietal','parietal_lateral')
reg('Supramarginal-anterior','Supramarginal antérieur','parietal','parietal_lateral')
reg('Supramarginal-posterior','Supramarginal postérieur','parietal','parietal_lateral')
reg('Angular-gyrus','Gyrus angulaire','parietal','parietal_lateral')
reg('Intraparietal-sulcus','Sillon intrapariétal','parietal','parietal_lateral')
reg('Precuneus','Précunéus','parietal','posterior_medial')
reg('Marginal-branch-of-the-cingulate-sulcus','Branche marginale du sillon cingulaire','parietal','posterior_medial')
reg('Parieto-occipital-sulcus','Sillon pariéto-occipital','parietal','posterior_medial')
# ---- occipital
reg('Anterior-occipital-sulcus-and-preoccipital-notch','Sillon occipital antérieur','occipital','occipital')
reg('O3','O3 (occipital inférieur)','occipital','occipital')
reg('O2','O2 (occipital moyen)','occipital','occipital')
reg('O1','O1 (occipital supérieur)','occipital','occipital')
reg('Occipital-pole','Pôle occipital','occipital','occipital')
reg('Lingual-gyrus','Gyrus lingual','occipital','occipital')
reg('Calcarine-sulcus','Sillon calcarin (V1)','occipital','occipital')
reg('Cuneus','Cunéus','occipital','occipital')
# ---- subcortical
reg('Hippocampus-anterior','Hippocampe antérieur','subcortical','mesial_temporal')
reg('Hippocampus-posterior','Hippocampe postérieur','subcortical','mesial_temporal')
reg('Amygdala','Amygdale','subcortical','mesial_temporal')
reg('Thalamus','Thalamus','subcortical','subcortical', ez=0.25, notes='propagation, synchronisation ; rarement zone d origine')
reg('Caudate-nucleus','Noyau caudé','subcortical','subcortical', ez=0.1, notes='ganglions de la base : propagation (dystonie), pas d origine')
reg('Putamen','Putamen','subcortical','subcortical', ez=0.1, notes='ganglions de la base : propagation (dystonie), pas d origine')
reg('Pallidum','Pallidum','subcortical','subcortical', ez=0.05, notes='pas d origine')
reg('Nucleus-accumbens','Noyau accumbens','subcortical','subcortical', ez=0.1, notes='pas d origine')
reg('Cerebellar-cortex','Cortex cérébelleux','subcortical','subcortical', ez=0.05, notes='pas d origine (hors hamartome)')

with open(os.path.join(D,'regions.csv'),'w',newline='',encoding='utf-8') as f:
    w=csv.DictWriter(f,fieldnames=list(R[0].keys())); w.writeheader(); w.writerows(R)
print('regions', len(R))

# ----------------------------------------------------------------- edges
E = []
def edge(a, b, w, kind='both', name='', source='expert', notes=''):
    E.append(dict(family_a=a, family_b=b, weight=w, kind=kind, name=name, source=source, notes=notes))

# réseau temporal mésial / limbique
edge('Amygdala','Hippocampus-anterior',1.0,'both','amygdalo-hippocampique','Bartolomei 2008 (EI)')
edge('Hippocampus-anterior','Rhinal-cortex',1.0,'both','voie perforante / rhinal','Bartolomei 2008')
edge('Amygdala','Rhinal-cortex',0.8,'both','')
edge('Rhinal-cortex','Temporal-pole',0.8,'both','')
edge('Amygdala','Temporal-pole',0.8,'both','')
edge('Hippocampus-anterior','Temporal-pole',0.6,'both','')
edge('Hippocampus-anterior','Hippocampus-posterior',0.9,'structural','axe longitudinal')
edge('Hippocampus-posterior','Parahippocampal-cortex',0.9,'both','')
edge('Hippocampus-anterior','Parahippocampal-cortex',0.6,'both','')
edge('Parahippocampal-cortex','Rhinal-cortex',0.7,'both','')
edge('Parahippocampal-cortex','Fusiform-gyrus',0.6,'both','')
edge('Parahippocampal-cortex','Lingual-gyrus',0.5,'structural','')
edge('Rhinal-cortex','Collateral-sulcus',0.7,'structural','')
edge('Hippocampus-posterior','Posterior-cingulate-cortex-retrosplenial-gyrus',0.7,'both','cingulum / Papez','')
edge('Hippocampus-posterior','Precuneus',0.5,'functional','DMN')
edge('Hippocampus-anterior','Thalamus',0.5,'structural','fornix → thalamus antérieur')
edge('Hippocampus-posterior','Thalamus',0.5,'structural','fornix')
edge('Amygdala','Thalamus',0.4,'structural','')
edge('Amygdala','Orbito-frontal-cortex',0.6,'both','faisceau unciné')
edge('Temporal-pole','Orbito-frontal-cortex',0.8,'structural','faisceau unciné','Proix 2017; expert')
edge('Temporal-pole','Gyrus-rectus',0.5,'structural','faisceau unciné')
edge('Amygdala','Anterior-cingulate-cortex',0.5,'both','')
edge('Amygdala','Subcallosal-area',0.5,'both','')
edge('Amygdala','Insula-gyri-brevi',0.7,'both','','Isnard 2004 (86 % des crises temporales atteignent l insula)')
edge('Temporal-pole','Insula-gyri-brevi',0.7,'both','')
edge('Hippocampus-anterior','Insula-gyri-brevi',0.5,'both','')
edge('T1-planum-polare','Insula-gyri-brevi',0.6,'structural','')
edge('Amygdala','Nucleus-accumbens',0.5,'structural','')
edge('Amygdala','Hypothalamus',0.0,'both','','','placeholder : hypothalamus absent de VEP (ligne ignorée)')
# temporo-latéral / langage
edge('T1-lateral-posterior','F3-pars-opercularis',0.7,'structural','faisceau arqué')
edge('T1-planum-temporale','F3-pars-opercularis',0.6,'structural','faisceau arqué')
edge('STS-posterior','F3-Pars-triangularis',0.5,'structural','faisceau arqué / SLF')
edge('T2-posterior','F3-Pars-triangularis',0.4,'structural','')
edge('T2-posterior','Supramarginal-posterior',0.5,'structural','')
edge('T1-lateral-posterior','Supramarginal-anterior',0.6,'structural','')
edge('STS-posterior','Angular-gyrus',0.6,'structural','')
edge('T2-anterior','Orbito-frontal-cortex',0.4,'structural','unciné / IFOF')
edge('T3-posterior','O3',0.5,'structural','ILF')
edge('Fusiform-gyrus','Lingual-gyrus',0.6,'structural','')
edge('Fusiform-gyrus','Calcarine-sulcus',0.4,'structural','ILF')
edge('T1-lateral-anterior','Amygdala',0.4,'both','')
edge('T1-lateral-anterior','Hippocampus-anterior',0.5,'both','','Maillard 2004 (mésio-latéral 0–3 s)')
edge('T2-anterior','Hippocampus-anterior',0.5,'both','')
edge('T1-lateral-posterior','Hippocampus-posterior',0.4,'both','')
# insulo-operculaire / salience
edge('Insula-gyri-brevi','Anterior-cingulate-cortex',0.7,'functional','réseau de saillance')
edge('Insula-gyri-brevi','Insula-gyri-longi',0.9,'both','')
edge('Insula-gyri-longi','Parietal-operculum',0.8,'both','SII')
edge('Insula-gyri-longi','Central-operculum',0.7,'both','')
edge('Insula-gyri-brevi','Central-operculum',0.6,'both','')
edge('Insula-gyri-brevi','F3-pars-opercularis',0.6,'both','')
edge('Insula-gyri-brevi','F3-Pars-Orbitalis',0.6,'both','')
edge('Insula-gyri-brevi','Orbito-frontal-cortex',0.5,'both','')
edge('Insula-gyri-brevi','Putamen',0.6,'structural','')
edge('Insula-gyri-longi','Putamen',0.5,'structural','')
edge('Insula-gyri-longi','Postcentral-gyrus',0.5,'both','')
edge('Insula-gyri-longi','Supramarginal-anterior',0.5,'both','')
edge('Insula-gyri-longi','Gyrus-of-Heschl',0.5,'both','')
edge('Insula-gyri-brevi','SMA',0.4,'functional','','Rheims 2008')
edge('Insula-gyri-brevi','PreSMA',0.4,'functional','')
edge('Insula-gyri-brevi','Thalamus',0.4,'structural','')
# frontal mésial / prémoteur / moteur
edge('SMA','Precentral-gyrus-upper-limb',0.8,'both','')
edge('SMA','Precentral-gyrus-head-face',0.6,'both','')
edge('SMA','Paracentral-lobule',0.8,'both','')
edge('SMA','Anterior-cingulate-cortex',0.7,'both','')
edge('SMA','Middle-cingulate-cortex-anterior-part',0.8,'both','')
edge('PreSMA','Middle-cingulate-cortex-anterior-part',0.7,'both','')
edge('SMA','Putamen',0.6,'structural','boucle cortico-striée')
edge('PreSMA','Caudate-nucleus',0.6,'structural','')
edge('PreSMA','F1-mesial-prefrontal',0.8,'both','')
edge('PreSMA','F1-lateral-prefrontal',0.5,'both','')
edge('PreSMA','F3-pars-opercularis',0.4,'functional','')
edge('F1-mesial-prefrontal','Anterior-cingulate-cortex',0.9,'both','')
edge('F1-mesial-prefrontal','Orbito-frontal-cortex',0.6,'both','')
edge('F1-mesial-prefrontal','Gyrus-rectus',0.6,'both','')
edge('F1-mesial-prefrontal','Frontal-pole',0.6,'both','')
edge('F1-mesial-prefrontal','F1-lateral-prefrontal',0.7,'both','')
edge('F1-mesial-prefrontal','Precuneus',0.5,'functional','DMN')
edge('F1-mesial-prefrontal','Posterior-cingulate-cortex-dorsal',0.5,'functional','DMN')
edge('Anterior-cingulate-cortex','Subcallosal-area',0.7,'both','')
edge('Anterior-cingulate-cortex','Orbito-frontal-cortex',0.6,'both','')
edge('Anterior-cingulate-cortex','Thalamus',0.5,'structural','')
edge('Anterior-cingulate-cortex','Caudate-nucleus',0.5,'structural','')
edge('Orbito-frontal-cortex','Gyrus-rectus',0.9,'both','')
edge('Orbito-frontal-cortex','Subcallosal-area',0.6,'both','')
edge('Orbito-frontal-cortex','Nucleus-accumbens',0.5,'structural','')
edge('Orbito-frontal-cortex','F3-Pars-Orbitalis',0.7,'both','')
edge('Orbito-frontal-cortex','Frontal-pole',0.6,'both','')
edge('Gyrus-rectus','Subcallosal-area',0.6,'both','')
edge('F2-caudal','Intraparietal-sulcus',0.6,'structural','SLF (fronto-pariétal)')
edge('F2-caudal','Superior-parietal-lobule-P1',0.4,'structural','SLF')
edge('F1-lateral-premotor','Superior-parietal-lobule-P1',0.5,'structural','SLF')
edge('F2-caudal','F1-lateral-premotor',0.7,'both','')
edge('F2-caudal','SMA',0.5,'both','')
edge('F2-rostral','F1-lateral-prefrontal',0.7,'both','')
edge('F2-rostral','Frontal-pole',0.6,'both','')
edge('F1-lateral-prefrontal','Caudate-nucleus',0.5,'structural','')
edge('F3-Pars-triangularis','F3-pars-opercularis',0.8,'both','')
edge('F3-pars-opercularis','Precentral-gyrus-head-face',0.7,'both','')
edge('F3-pars-opercularis','Central-operculum',0.7,'both','')
edge('Precentral-gyrus-upper-limb','Postcentral-gyrus',0.9,'both','')
edge('Precentral-gyrus-head-face','Postcentral-gyrus',0.7,'both','')
edge('Precentral-gyrus-head-face','Central-operculum',0.8,'both','')
edge('Paracentral-lobule','Postcentral-gyrus',0.5,'both','')
edge('Paracentral-lobule','Middle-cingulate-cortex-posterior-part',0.6,'both','')
edge('Precentral-gyrus-upper-limb','Putamen',0.6,'structural','')
edge('Precentral-gyrus-upper-limb','Thalamus',0.6,'structural','')
edge('Postcentral-gyrus','Thalamus',0.6,'structural','')
edge('Postcentral-gyrus','Parietal-operculum',0.7,'both','')
edge('Postcentral-gyrus','Supramarginal-anterior',0.6,'both','')
# ganglions de la base / thalamus / cervelet
edge('Thalamus','Putamen',0.6,'structural','')
edge('Thalamus','Pallidum',0.7,'structural','')
edge('Thalamus','Caudate-nucleus',0.5,'structural','')
edge('Putamen','Pallidum',0.9,'structural','')
edge('Caudate-nucleus','Putamen',0.6,'structural','')
edge('Caudate-nucleus','Nucleus-accumbens',0.6,'structural','')
edge('Thalamus','Cerebellar-cortex',0.5,'structural','voie cérébello-thalamique')
edge('Thalamus','Precuneus',0.4,'structural','')
edge('Thalamus','Posterior-cingulate-cortex-dorsal',0.4,'structural','')
edge('Thalamus','F1-mesial-prefrontal',0.4,'structural','')
edge('Thalamus','F1-lateral-prefrontal',0.4,'structural','')
edge('Thalamus','SMA',0.5,'structural','')
# pariéto-occipital / DMN
edge('Posterior-cingulate-cortex-dorsal','Precuneus',0.8,'both','DMN')
edge('Posterior-cingulate-cortex-retrosplenial-gyrus','Precuneus',0.7,'both','')
edge('Precuneus','Angular-gyrus',0.5,'functional','DMN')
edge('Precuneus','Cuneus',0.6,'both','')
edge('Precuneus','Superior-parietal-lobule-P1',0.6,'both','')
edge('Precuneus','SMA',0.4,'functional','','Yang 2018 (précunéus → SMA, silencieux)')
edge('Precuneus','Paracentral-lobule',0.5,'both','','Yang 2018')
edge('Angular-gyrus','F1-mesial-prefrontal',0.4,'functional','DMN')
edge('Angular-gyrus','O2',0.5,'both','')
edge('Angular-gyrus','Intraparietal-sulcus',0.7,'both','')
edge('Superior-parietal-lobule-P1','Intraparietal-sulcus',0.8,'both','')
edge('Intraparietal-sulcus','O1',0.5,'both','')
edge('O2','Fusiform-gyrus',0.5,'both','')
edge('Calcarine-sulcus','Lingual-gyrus',0.9,'both','')
edge('Calcarine-sulcus','Cuneus',0.9,'both','')
edge('Calcarine-sulcus','Occipital-pole',0.9,'both','')
edge('Calcarine-sulcus','Thalamus',0.4,'structural','radiations optiques (pulvinar/CGL)')
edge('Lingual-gyrus','Parahippocampal-cortex',0.5,'structural','')
edge('Cuneus','Parieto-occipital-sulcus',0.7,'both','')

with open(os.path.join(D,'network_edges.csv'),'w',newline='',encoding='utf-8') as f:
    w=csv.DictWriter(f,fieldnames=list(E[0].keys())); w.writeheader(); w.writerows(E)
print('edges', len(E))

# ----------------------------------------------------------------- Semio2Brain category map
# SemioDict category → signes EpiScope (plusieurs possibles, séparés par |), poids de mélange
M = [
 ('Epigastric','aura_epigastric',1), ('Fear-Anxiety','fear',1), ('Psychic','deja_vu|reminiscence|derealization',1),
 ('Autonomic','tachycardia|bradycardia|flushing|piloerection|hypersalivation|vomiting|sweating|hyperventilation|apnea|mydriasis|urinary_urge',1),
 ('Olfactory','olfactory',1), ('Gustatory','gustatory',1), ('Auditory','auditory_elementary|auditory_complex|auditory_illusion',1),
 ('Visual','visual_elementary|visual_complex|visual_illusion|visual_loss',1), ('Somatosensory','somatosensory_paresthesia|somatosensory_pain|somatosensory_thermal',1),
 ('Vestibular','vestibular',1), ('Non-Specific Aura','unspecific_aura|aura_cephalic',1),
 ('Head or Body Turn','head_turn_nonforced',1), ('Head Version','head_version',1), ('Eye Movements','eye_version|nystagmus',1),
 ('Tonic','tonic|axial_tonic',1), ('Asymmetric Tonic','asymmetric_tonic|bilateral_asymmetric_tonic',1), ('Dystonic','dystonic_posturing',1),
 ('Clonic','clonic|facial_contraction',1), ('Tonic-Clonic','fbtcs',1), ('Myoclonic','myoclonus|eyelid_myoclonia',1),
 ('Hypermotor','hyperkinetic|hyperkinetic_proximal|hyperkinetic_mild|pedaling',1), ('Complex Behavioural','gestural_automatisms_integrated|stereotypies|aggressive_behavior|undressing|wandering|sexual_automatisms',1),
 ('Atonic','ictal_paresis',1), ('Ictal Limb Paresis','ictal_paresis',1), ('Astatic','fall',1), ('Hypomotor','behavioral_arrest',1), ('Spasms','spasm',1),
 ('Postictal Hemiparesis or Hemiplegia','postictal_hemiparesis',1), ('Postictal Nose-wiping','postictal_nose_wiping',1),
 ('Postictal Oral or Manual Automatisms','oroalimentary_automatisms|gestural_automatisms_distal',0.5), ('Postictal Dysphasia','postictal_aphasia',1),
 ('Postictal Aphasia','postictal_aphasia',1), ('Postictal Cough','cough',1), ('Postictal Aggressive','aggressive_behavior',0.5),
 ('Automatisms - Oral & Manual','oroalimentary_automatisms|gestural_automatisms_distal|nose_wiping',1), ('Automatisms - Other','blinking|spitting|water_drinking',0.7),
 ('Ictal Pout','chapeau_de_gendarme',1), ('Mimetic Automatisms','mimic_automatisms',1),
 ('Vocalisation - Unintelligible Noises','vocalization|vocal_automatisms',1), ('Aphasia','aphasia_production|aphasia_comprehension|speech_arrest',1),
 ('Dysphasia - Ictal Speech','aphasia_production|verbal_automatisms|dysarthria',0.7), ('Dialeptic-LOA-LOC','loss_of_awareness|behavioral_arrest|confusion',1),
]
with open(os.path.join(D,'semio2brain_category_map.csv'),'w',newline='',encoding='utf-8') as f:
    w=csv.writer(f); w.writerow(['semio2brain_category','sign_ids','blend']); w.writerows(M)
print('category map', len(M))
