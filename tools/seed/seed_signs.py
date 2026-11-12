# -*- coding: utf-8 -*-
"""
Seed du vocabulaire sémiologique de EpiScope → data/signs.csv

ATTENTION : ce script est le "seed" initial. Le fichier canonique, éditable à la main,
est data/signs.csv. Ne relancez ce script que pour repartir de zéro (il ÉCRASE le CSV).

Colonnes de signs.csv
  id              identifiant stable (snake_case, jamais modifié une fois publié)
  category        aura_sensory | aura_experiential | awareness | language | motor_elementary |
                  motor_complex | autonomic | postictal
  label_fr        libellé affiché (français)
  label_en        libellé anglais (terme ILAE 2022 quand il existe)
  subjective      1 = rapporté par le patient, 0 = observé
  topography      liste "face|UL|LL|trunk|hemibody" si le signe a une topographie, sinon vide
  laterality_rule contra | ipsi | none | dominant | nondominant
                  → comment le côté du signe désigne l'hémisphère (cf. glossaire ILAE 2022)
  default_duration_s  durée par défaut proposée à la saisie
  key             raccourci clavier (optionnel, lettre unique dans sa catégorie)
  synonyms        synonymes/recherche (séparés par ;)
  notes           valeur localisatrice/latéralisante en une ligne, source
"""
import csv, os, sys

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'signs.csv')

S = []
# valeur latéralisante (fiabilité 0–1) quand la règle de latéralité s'applique ; d'après le glossaire ILAE 2022,
# Loddenkemper & Kotagal 2005, Marks & Laxer 1998, Bonelli 2007, Wyllie 1986 (valeurs arrondies)
LAT_VALUE = {
  'clonic': .9, 'tonic': .8, 'asymmetric_tonic': .9, 'dystonic_posturing': .9, 'myoclonus': .85, 'negative_myoclonus': .8,
  'ictal_paresis': .8, 'facial_contraction': .9, 'head_version': .85, 'eye_version': .85, 'nystagmus': .7, 'head_turn_nonforced': .6,
  'blinking': .6, 'somatosensory_paresthesia': .8, 'somatosensory_pain': .7, 'somatosensory_thermal': .6, 'visual_elementary': .8,
  'visual_loss': .7, 'auditory_elementary': .5, 'genital_sensation': .5, 'urinary_urge': .5, 'gestural_automatisms_distal': .7,
  'nose_wiping': .85, 'postictal_nose_wiping': .85, 'piloerection': .6, 'spitting': .6, 'water_drinking': .5, 'vomiting': .6,
  'verbal_automatisms': .75, 'speech_arrest': .5, 'aphasia_production': .85, 'aphasia_comprehension': .9, 'postictal_aphasia': .9,
  'postictal_hemiparesis': .95, 'ictal_grasping': .6,
}
def sign(id, category, fr, en, subjective, topo='', lat='none', dur=10, key='', syn='', notes=''):
    S.append(dict(id=id, category=category, label_fr=fr, label_en=en, subjective=subjective,
                  topography=topo, laterality_rule=lat, lateralizing_value=(LAT_VALUE.get(id, 0.7) if lat != 'none' else 0),
                  default_duration_s=dur, key=key, synonyms=syn, notes=notes))

# ---------------------------------------------------------------- auras sensorielles
sign('aura_epigastric','aura_sensory','Aura épigastrique / abdominale','Epigastric aura',1,'', 'none',15,'e',
     'abdominale;viscérale;boule qui monte;rising epigastric','Temporal mésial 83 % (Semio2Brain) ; insula antérieure (stimulation)')
sign('aura_cephalic','aura_sensory','Sensation céphalique indéfinissable','Cephalic aura',1,'','none',10,'',
     'tête;cephalic;non specific','Peu localisatrice (frontal > temporal)')
sign('somatosensory_paresthesia','aura_sensory','Paresthésies','Somatosensory aura (paresthesia)',1,'face|UL|LL|trunk|hemibody','contra',15,'p',
     'fourmillements;picotements;engourdissement;tingling;numbness','SI contralatéral ; SII/insula postérieure si bilatéral ou diffus')
sign('somatosensory_pain','aura_sensory','Douleur ictale','Ictal pain',1,'face|UL|LL|trunk|hemibody','contra',15,'',
     'douleur;pain;brûlure','Insula postérieure / opercule pariétal (Mazzola 2017)')
sign('somatosensory_thermal','aura_sensory','Sensation thermique (chaud/froid)','Thermal sensation',1,'face|UL|LL|trunk|hemibody','contra',15,'',
     'chaleur;froid;warm;cold','Insula postérieure')
sign('laryngeal_constriction','aura_sensory','Striction laryngée / pharyngée','Laryngeal constriction',1,'','none',15,'l',
     'gorge serrée;étranglement;throat;choking sensation','Insulaire (Isnard 2004) : striction → paresthésies → dysarthrie → moteur')
sign('visual_elementary','aura_sensory','Hallucination visuelle élémentaire','Elementary visual hallucination',1,'','contra',15,'v',
     'phosphènes;lumières;flashes;taches colorées','Calcarine / pôle occipital ; hémichamp controlatéral')
sign('visual_complex','aura_sensory','Hallucination visuelle complexe','Complex visual hallucination',1,'','none',15,'',
     'scènes;visages;personnages','Temporo-occipital basal, temporal')
sign('visual_illusion','aura_sensory','Illusion visuelle (macropsie, métamorphopsie)','Visual illusion',1,'','none',15,'',
     'macropsie;micropsie;métamorphopsie;déformation','Jonction temporo-pariéto-occipitale')
sign('visual_loss','aura_sensory','Amaurose / cécité ictale','Ictal blindness',1,'','contra',15,'',
     'cécité;amaurose;vision floue;blindness','Occipital mésial')
sign('auditory_elementary','aura_sensory','Hallucination auditive élémentaire','Elementary auditory hallucination',1,'','contra',10,'a',
     'bourdonnement;sifflement;buzzing;tinnitus','Gyrus de Heschl / planum temporale ; latéral temporal (Maillard 2004 groupe L : initiale)')
sign('auditory_complex','aura_sensory','Hallucination auditive complexe (voix, musique)','Complex auditory hallucination',1,'','none',15,'',
     'voix;musique;verbal','T1 latéral postérieur, STS')
sign('auditory_illusion','aura_sensory','Illusion auditive (palinacousie, intensité)','Auditory illusion',1,'','none',10,'',
     'palinacousie;déformation des sons','T1 latéral')
sign('olfactory','aura_sensory','Hallucination olfactive','Olfactory hallucination',1,'','none',15,'o',
     'odeur;smell;cacosmie','Amygdale, cortex rhinal, orbitofrontal')
sign('gustatory','aura_sensory','Hallucination gustative','Gustatory hallucination',1,'','none',15,'g',
     'goût;métallique;taste','Insula moyenne dorsale (Mazzola 2017), opercules')
sign('vestibular','aura_sensory','Vertige / sensation vestibulaire','Vestibular aura',1,'','none',15,'',
     'vertige;rotation;tangage;vertigo;spinning','Insula postérieure / opercule pariétal (PIVC), jonction temporo-pariétale')
sign('genital_sensation','aura_sensory','Sensation génitale / orgasmique','Genital or orgasmic aura',1,'','contra',15,'',
     'orgasme;génital','Lobule paracentral (sensitif), temporal mésial non dominant')
sign('urinary_urge','aura_sensory','Urgence mictionnelle ictale','Ictal urinary urge',1,'','nondominant',15,'',
     'envie d urine;urge','Temporal non dominant (ILAE 2022)')
sign('unspecific_aura','aura_sensory','Aura indéfinissable / non spécifique','Non-specific aura',1,'','none',10,'',
     'aura;bizarre;vague','Peu localisatrice')

# ---------------------------------------------------------------- expérientiel / psychique
sign('fear','aura_experiential','Peur ictale','Ictal fear',1,'','none',15,'f',
     'angoisse;terreur;panique;anxiety;fear','Amygdale ; préfrontal ventromédian (Bonini 2014 G4)')
sign('deja_vu','aura_experiential','Déjà-vu / déjà-vécu','Déjà vu',1,'','none',15,'d',
     'déjà vécu;familiarité;jamais vu','Cortex rhinal (Bartolomei 2004), hippocampe antérieur')
sign('reminiscence','aura_experiential','Réminiscence / état de rêve','Reminiscence, dreamy state',1,'','none',15,'',
     'dreamy state;souvenir;flash-back;experiential','Temporal mésial + néocortex temporal antérieur')
sign('derealization','aura_experiential','Déréalisation / dépersonnalisation','Derealization, depersonalization',1,'','none',15,'',
     'étrangeté;irréel;détachement','Temporal mésial, jonction temporo-pariétale')
sign('out_of_body','aura_experiential','Expérience de sortie du corps / autoscopie','Out-of-body experience, autoscopy',1,'','none',15,'',
     'autoscopie;héautoscopie;flottement','Gyrus angulaire / jonction temporo-pariétale (Blanke)')
sign('forced_thinking','aura_experiential','Pensée forcée','Forced thinking',1,'','none',10,'',
     'idée forcée;intrusion','Préfrontal dorsolatéral')
sign('ecstatic','aura_experiential','Sensation extatique / mystique','Ecstatic aura',1,'','none',15,'',
     'extase;béatitude;bliss;mystique','Insula antérieure (Picard)')
sign('sadness','aura_experiential','Tristesse ictale','Ictal sadness',1,'','none',15,'',
     'tristesse;chagrin;dysphorie','Cingulaire antérieur, amygdale')
sign('anger','aura_experiential','Colère / agressivité ictale','Ictal anger',1,'','none',15,'',
     'colère;rage;agressivité','Amygdale, orbitofrontal')
sign('sexual_arousal','aura_experiential','Excitation sexuelle ictale','Sexual arousal',1,'','none',15,'',
     'érotique;sexuel','Temporal mésial, paracentral')

# ---------------------------------------------------------------- conscience / vigilance
sign('loss_of_awareness','awareness','Rupture de contact','Impaired awareness',0,'','none',40,'r',
     'perte de contact;dialeptique;absence;unresponsive;LOA','Précoce si latéral temporal (Maillard 2004 L), retardée si mésial ; réseau thalamo-cortical bilatéral')
sign('behavioral_arrest','awareness','Arrêt comportemental / hypomoteur','Behavioral arrest',0,'','none',20,'',
     'arrêt;immobilité;hypomotor;motor arrest;staring','Cingulaire antérieur, préSMA, temporal mésial')
sign('arousal_from_sleep','awareness','Éveil paroxystique / arousal','Arousal from sleep',0,'','none',10,'',
     'réveil;arousal;sleep','Crises hypermotrices liées au sommeil (frontal, insulaire)')
sign('confusion','awareness','Confusion / désorientation','Confusion',0,'','none',60,'',
     'désorienté;confus','Peu localisatrice, bilatérale')

# ---------------------------------------------------------------- langage
sign('speech_arrest','language','Arrêt du langage (anarthrie, mutisme)','Speech arrest',0,'','dominant',15,'s',
     'mutisme;anarthrie;aphémie;speech arrest','F3 operculaire, opercule rolandique, SMA (aire motrice négative)')
sign('aphasia_production','language','Aphasie de production (manque du mot, paraphasies)','Expressive aphasia',0,'','dominant',30,'',
     'manque du mot;anomie;paraphasie;jargon;dysphasie','F3 (Broca), temporal postérieur dominant')
sign('aphasia_comprehension','language','Trouble de compréhension du langage','Receptive aphasia',0,'','dominant',30,'',
     'ne comprend pas;Wernicke','T1 postérieur / planum temporale dominant')
sign('dysarthria','language','Dysarthrie','Dysarthria',0,'','none',15,'',
     'articulation;bredouillement','Opercule rolandique, insula (Isnard 2004)')
sign('vocalization','language','Vocalisation non verbale (cri, grognement)','Vocalization',0,'','none',8,'',
     'cri;grognement;hurlement;grunt;scream','SMA, cingulaire antérieur, opercule')
sign('verbal_automatisms','language','Automatismes verbaux / langage conservé','Verbal automatisms, preserved ictal speech',0,'','nondominant',20,'',
     'parle;phrases stéréotypées;ictal speech','Temporal non dominant (ILAE 2022)')
sign('vocal_automatisms','language','Automatismes vocaux (fredonnement, chant)','Humming, singing',0,'','none',15,'',
     'fredonne;chante;humming;singing','Temporal antérieur, insula, cingulaire')

# ---------------------------------------------------------------- moteur élémentaire
sign('clonic','motor_elementary','Clonies','Clonic',0,'face|UL|LL|trunk|hemibody','contra',20,'c',
     'secousses cloniques;jerks;twitching','Gyrus précentral controlatéral (somatotopie)')
sign('tonic','motor_elementary','Posture tonique focale','Tonic posturing',0,'face|UL|LL|trunk','contra',15,'t',
     'contraction tonique;raideur;posture','SMA, prémoteur, paracentral')
sign('asymmetric_tonic','motor_elementary','Posture tonique asymétrique (escrimeur, M2e, « figure of 4 »)','Asymmetric tonic posturing (fencing, figure-of-4)',0,'','contra',15,'',
     'escrimeur;fencing;figure of 4;M2e;bras tendu','SMA ; bras tendu controlatéral (ILAE 2022)')
sign('bilateral_asymmetric_tonic','motor_elementary','Posture tonique bilatérale asymétrique','Bilateral asymmetric tonic',0,'','none',15,'',
     'tonique bilatéral','SMA / cingulaire ; insula postérieure (Chisholm 2025)')
sign('axial_tonic','motor_elementary','Contraction tonique axiale symétrique','Symmetric axial tonic',0,'','none',15,'',
     'tonique axial;tronc','Bonini 2014 G2 (prémoteur + préfrontal)')
sign('dystonic_posturing','motor_elementary','Dystonie d un membre','Dystonic posturing',0,'UL|LL','contra',20,'y',
     'dystonie;posture dystonique;main dystonique','Ganglions de la base ; marqueur de crise temporale mésiale, controlatéral (ILAE 2022)')
sign('myoclonus','motor_elementary','Myoclonies focales','Focal myoclonus',0,'face|UL|LL|trunk','contra',10,'',
     'myoclonie;secousse unique','Cortex sensori-moteur controlatéral')
sign('negative_myoclonus','motor_elementary','Myoclonies négatives','Negative myoclonus',0,'UL|LL','contra',10,'',
     'myoclonie négative;astérixis','Aires motrices négatives, cortex sensori-moteur')
sign('ictal_paresis','motor_elementary','Parésie / atonie focale ictale','Ictal paresis, focal atonia',0,'face|UL|LL|hemibody','contra',20,'',
     'parésie;atonie;plégie;hémiparésie ictale','Aires motrices négatives (F3 operculaire, SMA), pariétal')
sign('head_version','motor_elementary','Version forcée de la tête','Forced head version',0,'','contra',8,'h',
     'version;déviation forcée;tête tournée','Aire oculomotrice frontale (F2 caudal), prémoteur ; controlatéral surtout si précédant une GTC')
sign('eye_version','motor_elementary','Version oculaire','Eye version, gaze deviation',0,'','contra',8,'',
     'déviation du regard;yeux tournés;gaze deviation','F2 caudal (FEF), pariétal, occipital')
sign('nystagmus','motor_elementary','Nystagmus épileptique','Epileptic nystagmus',0,'','contra',10,'',
     'nystagmus;phase rapide','Occipito-pariétal, FEF ; phase rapide controlatérale')
sign('head_turn_nonforced','motor_elementary','Rotation non forcée de la tête (précoce)','Non-forced head turn',0,'','ipsi',5,'',
     'tourne la tête;head turn','Ipsilatéral en début de crise temporale (ILAE 2022)')
sign('blinking','motor_elementary','Clignements / battements palpébraux','Blinking, eyelid flutter',0,'','ipsi',10,'',
     'clignement;papillotement;blink;eyelid flutter','Ipsilatéral si unilatéral ; occipital, insula antérieure (Chisholm 2025 tardif)')
sign('eyelid_myoclonia','motor_elementary','Myoclonies palpébrales','Eyelid myoclonia',0,'','none',8,'',
     'myoclonies des paupières','Occipital, thalamo-cortical')
sign('chapeau_de_gendarme','motor_elementary','Chapeau de gendarme (moue ictale)','Chapeau de gendarme, ictal pouting',0,'','none',8,'',
     'moue;pouting;chapeau','Cingulaire antérieur / préfrontal mésial (Souirti 2014)')
sign('facial_contraction','motor_elementary','Contraction tonique ou clonique hémifaciale','Hemifacial tonic/clonic contraction',0,'','contra',15,'',
     'grimace;hémiface;facial twitching','Précentral face, opercule rolandique')
sign('spasm','motor_elementary','Spasme épileptique','Epileptic spasm',0,'','none',3,'',
     'spasme;salve','Réseau cortico-sous-cortical, souvent postérieur ou frontal')
sign('fbtcs','motor_elementary','Évolution tonico-clonique bilatérale','Focal to bilateral tonic-clonic',0,'','none',60,'b',
     'généralisation;GTC;tonico-clonique;secondarily generalized','Bilatérale ; version/M2e précédant la GTC latéralisent')
sign('fall','motor_elementary','Chute / astasie','Fall, astatic',0,'','none',5,'',
     'chute;drop attack;astasie','Peu localisatrice (frontal mésial, pariétal, insula)')

# ---------------------------------------------------------------- moteur complexe / automatismes
sign('oroalimentary_automatisms','motor_complex','Automatismes oro-alimentaires','Oroalimentary automatisms',0,'','none',30,'m',
     'mâchonnement;déglutition;lèchement;chewing;swallowing;lip smacking','Temporal mésial (retardés si mésial pur, précoces si mésio-latéral : Maillard 2004) ; insula antérieure tardif (Chisholm 2025)')
sign('gestural_automatisms_distal','motor_complex','Automatismes gestuels distaux (manipulation, tripotage)','Distal gestural automatisms, fumbling',0,'','ipsi',30,'u',
     'tripotage;manipulation;fumbling;manual automatisms','Temporal mésial ; ipsilatéraux si unilatéraux (ILAE 2022)')
sign('gestural_automatisms_integrated','motor_complex','Comportement gestuel intégré / complexe','Integrated gestural behaviour',0,'','none',30,'',
     'gestes complexes;comportement élaboré;stéréotypies distales','Préfrontal antérieur latéral et mésial (Bonini 2014 G3)')
sign('hyperkinetic','motor_complex','Agitation hypermotrice (hyperkinétique)','Hyperkinetic (hypermotor) behaviour',0,'','none',30,'k',
     'hyperkinétique;hypermoteur;agitation;thrashing;pédalage violent','Préfrontal mésial / cingulaire antérieur, préSMA (Bonini 2014 G2) ; orbitofrontal, insula, temporal (via OFC)')
sign('hyperkinetic_proximal','motor_complex','Hypermoteur type 1 (agitation proximale violente)','Hyperkinetic type 1 (proximal, violent)',0,'','none',30,'',
     'HM1;agitation violente;coups de pied;rhéims','Rheims 2008 HM1 : cortex frontal ventromésial / orbitofrontal / cingulaire antérieur, pôle temporal, insula')
sign('hyperkinetic_mild','motor_complex','Hypermoteur type 2 (agitation modérée, balancement, mouvements horizontaux)','Hyperkinetic type 2 (mild, rocking)',0,'','none',30,'',
     'HM2;balancement;rocking;agitation modérée','Rheims 2008 HM2 : cortex prémoteur mésial (préSMA / SMA), cingulaire moyen')
sign('stereotypies','motor_complex','Stéréotypies rythmiques (balancement, tapotement)','Rhythmic stereotypies',0,'','none',30,'',
     'balancement;rocking;tapotement;stéréotypie','Préfrontal, ganglions de la base')
sign('mimic_automatisms','motor_complex','Expression faciale émotionnelle (peur, surprise)','Emotional facial expression, mimic automatisms',0,'','none',15,'',
     'mimique;visage effrayé;fearful face','Amygdale, cingulaire antérieur, orbitofrontal (Bonini 2014 G3-G4)')
sign('nose_wiping','motor_complex','Frottement du nez','Nose wiping',0,'','ipsi',5,'',
     'essuie le nez;nose wiping','Main ipsilatérale (ILAE 2022), temporal')
sign('pedaling','motor_complex','Pédalage / automatismes des membres inférieurs','Pedaling, leg automatisms',0,'','none',20,'',
     'pédale;cycling;leg automatisms','Frontal mésial (SMA/cingulaire)')
sign('ictal_grasping','motor_complex','Préhension forcée / grasping','Ictal grasping',0,'','contra',15,'',
     'agrippe;grasping','Cingulaire moyen / SMA')
sign('gelastic','motor_complex','Rire ictal','Gelastic (ictal laughter)',0,'','none',10,'',
     'rire;gelastic;laughter','Hypothalamus (hors VEP), cingulaire antérieur, orbitofrontal, temporal mésial')
sign('dacrystic','motor_complex','Pleurs ictaux','Dacrystic (ictal crying)',0,'','none',15,'',
     'pleure;crying','Cingulaire antérieur, temporal mésial, non dominant')
sign('undressing','motor_complex','Déshabillage','Undressing',0,'','none',20,'',
     'se déshabille','Temporal, frontal')
sign('wandering','motor_complex','Déambulation','Wandering, ambulatory automatisms',0,'','none',30,'',
     'marche;déambule;ambulatory','Temporal mésial, frontal mésial')
sign('sexual_automatisms','motor_complex','Automatismes sexuels (mouvements pelviens)','Sexual automatisms, pelvic thrusting',0,'','none',20,'',
     'pelvic thrusting;frottement génital','Frontal mésial, temporal')
sign('aggressive_behavior','motor_complex','Comportement agressif','Aggressive behaviour',0,'','none',20,'',
     'agressif;violence','Amygdale, orbitofrontal')
sign('spitting','motor_complex','Crachats ictaux','Ictal spitting',0,'','nondominant',10,'',
     'crache;spitting','Temporal non dominant (ILAE 2022)')
sign('water_drinking','motor_complex','Boit de l eau (automatisme)','Ictal water drinking',0,'','nondominant',10,'',
     'boit;drinking','Temporal non dominant')

# ---------------------------------------------------------------- végétatif
sign('tachycardia','autonomic','Tachycardie ictale','Ictal tachycardia',0,'','none',30,'',
     'palpitations;cœur rapide','Insula antérieure (gyrus court moyen, Chisholm 2025 précoce), temporal mésial')
sign('bradycardia','autonomic','Bradycardie / asystolie ictale','Ictal bradycardia, asystole',0,'','none',20,'',
     'asystolie;syncope ictale;bradycardie','Insula, temporal mésial (gauche > droite)')
sign('apnea','autonomic','Apnée / hypoventilation','Ictal apnea, hypoventilation',0,'','none',20,'',
     'apnée;arrêt respiratoire;hypoventilation','Amygdale (Dlouhy), hippocampe, insula')
sign('hyperventilation','autonomic','Hyperventilation ictale','Ictal hyperventilation',0,'','none',20,'',
     'respiration rapide;polypnée','Insula, cingulaire antérieur, amygdale')
sign('flushing','autonomic','Rougeur / pâleur','Flushing, pallor',0,'','none',20,'',
     'rougeur;pâleur;flush;pallor','Insula, temporal mésial, cingulaire')
sign('piloerection','autonomic','Piloérection (chair de poule)','Piloerection',0,'','ipsi',20,'',
     'chair de poule;goosebumps','Temporal mésial, insula ; ipsilatéral si unilatéral')
sign('hypersalivation','autonomic','Hypersalivation','Hypersalivation',0,'','none',20,'',
     'salive;bave;drooling','Opercules, insula, temporal mésial')
sign('vomiting','autonomic','Nausées / vomissements ictaux','Ictal nausea, vomiting',0,'','nondominant',20,'',
     'vomit;nausée;ictus emeticus','Insula, temporal non dominant')
sign('urination','autonomic','Miction ictale','Ictal urination',0,'','none',10,'',
     'urine;incontinence','Frontal mésial, cingulaire, temporal')
sign('mydriasis','autonomic','Mydriase','Mydriasis',0,'','none',20,'',
     'pupilles dilatées','Amygdale, insula, cingulaire')
sign('cough','autonomic','Toux ictale / post-critique','Ictal or postictal cough',0,'','none',10,'',
     'tousse;cough','Insula, opercules, temporal')
sign('sweating','autonomic','Sueurs','Sweating',0,'','none',20,'',
     'transpiration;hyperhidrose','Insula, cingulaire, amygdale')

# ---------------------------------------------------------------- post-critique
sign('postictal_aphasia','postictal','Aphasie post-critique','Postictal aphasia',0,'','dominant',120,'',
     'aphasie postcritique;dysphasie postcritique','Hémisphère dominant (temporal > frontal)')
sign('postictal_hemiparesis','postictal','Déficit moteur post-critique (Todd)','Postictal hemiparesis (Todd)',0,'face|UL|LL|hemibody','contra',300,'',
     'Todd;parésie postcritique','Cortex moteur controlatéral')
sign('postictal_confusion','postictal','Confusion post-critique prolongée','Prolonged postictal confusion',0,'','none',300,'',
     'confusion postcritique','Temporal mésial bilatéral, thalamus')
sign('postictal_amnesia','postictal','Amnésie de la crise','Postictal amnesia',0,'','none',120,'',
     'ne se souvient pas','Temporal mésial')
sign('postictal_nose_wiping','postictal','Frottement du nez post-critique','Postictal nose wiping',0,'','ipsi',10,'',
     'nose wiping postcritique','Main ipsilatérale au foyer (temporal)')

with open(OUT, 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=list(S[0].keys()))
    w.writeheader(); w.writerows(S)
print('wrote', OUT, len(S), 'signs')
ids = [s['id'] for s in S]
assert len(ids) == len(set(ids)), 'duplicate ids'
