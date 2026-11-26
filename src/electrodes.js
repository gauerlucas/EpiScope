/* EpiScope — electrodes.js : schéma d'implantation SEEG sur le gabarit MNI ICBM 152 NLin 2009b asymétrique (atlas VEP).
 *
 * Tradition Talairach–Bancaud (Marseille, Grenoble, Lyon, Milan) : électrodes orthogonales au plan sagittal,
 * nommées d'après la structure visée (nomenclature conventionnelle : A = amygdale, B/C = hippocampe antérieur/postérieur,
 * TP, TB, CE/GPH parahippocampe, T, H, OT/PFG/GL/FCA/Cu, FT/OF/OC/OP opercules, FP, FD, OR, R, CR/CC/CP/GC cingulaire,
 * PM, SA, LP, SC, PA/PP, PI…), prime (') = hémisphère gauche. Les insulaires obliques de Lyon (Ia, Im, Ip) entrent
 * haut sur la convexité frontale, précentrale ou pariétale et descendent dans un plan parasagittal vers l'insula
 * antérieure, moyenne ou postérieure ; l'OR est oblique (entrée F2 rostrale, descente vers l'orbitofrontal médial).
 * BM et BL (v2.4.0) sont verticales : entrée F1 (BM) ou F2 (BL) sur la convexité, descente vers le gyrus droit ou l’orbitofrontal.
 * v3.0.0 : FA, PO (cingulaires moyens antérieur / postérieur), LI (planum temporale), O (pôle occipital), Ib (insulaire
 * oblique antérieure basse), PB (cunéus supérieur → angulaire) ; toutes les trajectoires sont données en coordonnées MNI.
 * Modèles DIXI Microdeep / Alcis : Ø 0,8 mm, plots de 2 mm espacés de 1,5 mm (pas 3,5 mm), 5 à 18 plots.
 * Règles (Cardinale 2013, 2016, 2019 ; Isnard 2018 ; Afif 2008) : privilégier l'orthogonal (sauf insula), pas de
 * croisement, minimiser le nombre d'électrodes pour un maximum de structures, éviter les entrées en fond de sillon
 * (veines), les entrées trop basses en frontal (sinus), l'os temporal pneumatisé et les entrées trop postérieures.
 *
 * AVERTISSEMENT : ce module produit un SCHÉMA sur gabarit (coordonnées MNI 2009b), pas une planification
 * stéréotaxique ; la trajectoire définitive se fait sur l'IRM et l'angiographie du patient. */
(function (SV) {
  'use strict';

  const PITCH = 3.5, CONTACT_LEN = 2, DIAM = 0.8;
  /** Catalogue des modèles (v4.21, d'après les catalogues DIXI medical Microdeep® et Alcis Neuro 2069-EPC) : plots de longueur
   *  clen au pas pitch depuis la pointe (plot 1 affleure la pointe hémisphérique) ; groups = { size, gap } pour les électrodes
   *  à groupes espacés (3 × 5, 3 × 6 : isolant de gap mm entre les groupes) ; hd = haute résolution Alcis type E (plot de
   *  pointe 2 mm, anneaux 1 mm au pas 2 mm). span = pointe → fin du dernier plot (Lt / UEL des catalogues). */
  const MODELS = [];
  const addModel = (id, maker, n, o) => { const m = Object.assign({ id, maker, n, pitch: PITCH, clen: CONTACT_LEN, groups: null, hd: false }, o || {}); m.offsets = contactOffsets(m); m.span = m.offsets[n - 1] + (m.hd && n > 1 ? 0.5 : m.clen / 2); MODELS.push(m); return m; };
  /** centres des plots depuis la pointe (mm), plot 1 = le plus profond */
  function contactOffsets(m) {
    const out = []; let x = 0;
    for (let k = 1; k <= m.n; k++) {
      const len = m.hd ? (k === 1 ? 2 : 1) : m.clen; out.push(x + len / 2);
      if (m.groups && k % m.groups.size === 0) x += len + m.groups.gap;   // fin d'un groupe : isolant long
      else x += m.hd ? (k === 1 ? 3 : 2) : m.pitch;   // haute résolution : pointe 2 mm + isolant 1 mm, puis anneaux de 1 mm tous les 2 mm
    }
    return out;
  }
  for (const n of [5, 8, 10, 12, 15, 18]) addModel(`DIXI D08-${String(n).padStart(2, '0')}AM`, 'DIXI', n, { label: `${n} plots · ${2 + (n - 1) * 3.5} mm` });
  addModel('DIXI D08-15BM', 'DIXI', 15, { groups: { size: 5, gap: 7 }, label: '3 × 5 plots · groupes espacés de 7 mm · 62 mm' });
  addModel('DIXI D08-15CM', 'DIXI', 15, { groups: { size: 5, gap: 11 }, label: '3 × 5 plots · groupes espacés de 11 mm · 70 mm' });
  addModel('DIXI D08-18CM', 'DIXI', 18, { groups: { size: 6, gap: 11 }, label: '3 × 6 plots · groupes espacés de 11 mm · 80,5 mm' });
  for (const n of [5, 8, 10, 12, 15, 18]) addModel(`Alcis 2069-EPC-${String(n).padStart(2, '0')}C-35`, 'Alcis', n, { label: `${n} plots · pas 3,5 mm · ${2 + (n - 1) * 3.5} mm`, legacy: `Alcis 2069-EPC-${String(n).padStart(2, '0')}` });
  addModel('Alcis 2069-EPC-18C-40', 'Alcis', 18, { pitch: 4, label: '18 plots · pas 4 mm · 70 mm' });
  addModel('Alcis 2069-EPC-15C-35-3G-07', 'Alcis', 15, { groups: { size: 5, gap: 7 }, label: '3 × 5 plots · groupes espacés de 7 mm · 62 mm' });
  addModel('Alcis 2069-EPC-15C-35-3G-11', 'Alcis', 15, { groups: { size: 5, gap: 11 }, label: '3 × 5 plots · groupes espacés de 11 mm · 70 mm' });
  addModel('Alcis 2069-EPC-18C-35-3G-11', 'Alcis', 18, { groups: { size: 6, gap: 11 }, label: '3 × 6 plots · groupes espacés de 11 mm · 80,5 mm' });
  addModel('Alcis 2069-EPC-15E-20', 'Alcis', 15, { hd: true, pitch: 2, clen: 2, label: 'HD · 15 plots de 1 mm au pas 2 mm · 30 mm' });
  addModel('Alcis 2069-EPC-18E-20', 'Alcis', 18, { hd: true, pitch: 2, clen: 2, label: 'HD · 18 plots de 1 mm au pas 2 mm · 36 mm' });
  const MAKERS = { DIXI: 'DIXI Microdeep®', Alcis: 'Alcis 2069-EPC' };
  /** modèle par identifiant (anciens identifiants Alcis « 2069-EPC-08 » acceptés) ; null si inconnu */
  function modelById(id) { if (!id) return null; return MODELS.find(m => m.id === id) || MODELS.find(m => m.legacy === id) || null; }
  /** modèle standard d'une marque pour n plots (AM / C-35), sinon le premier de n plots */
  function modelFor(maker, n) { const mk = maker === 'Alcis' ? 'Alcis' : 'DIXI'; return MODELS.find(m => m.maker === mk && m.n === n && !m.groups && !m.hd && m.pitch === PITCH) || MODELS.find(m => m.maker === mk && m.n === n) || null; }
  /** centres des plots (mm depuis la pointe) d'un modèle (identifiant ou objet), ou du peigne standard à n plots */
  function offsetsOf(model, n) { const m = typeof model === 'string' ? modelById(model) : model; if (m && (!n || m.n === n)) return m.offsets.slice(); const k = n || (m ? m.n : 0); return Array.from({ length: k }, (_, i) => CONTACT_LEN / 2 + i * PITCH); }

  /** Bibliothèque des trajectoires conventionnelles (nomenclature Talairach–Bancaud, prime = gauche).
   *  v3.0.0 : géométrie explicite sur le gabarit MNI 2009b — tip (pointe) et entry (point d'entrée) de l'électrode GAUCHE en mm
   *  MNI, n = nombre de plots du modèle (null : choisi d'après la longueur), model = modèle proposé par défaut (DIXI) ; à droite,
   *  miroir x → −x. Jeu de trajectoires placées
   *  et corrigées à la main par un épileptologue sur le gabarit (gauche et droite symétriques).
   *  target = structure visée (famille VEP : rattachement des propositions, contrôle « plot dans la cible ») ;
   *  exit = famille corticale de sortie (renseignement) ; oblique = trajectoire oblique assumée ; vertical = trajet de haut en bas.
   *  Sans tip / entry (bibliothèques anciennes) : cible au centroïde de la famille décalé de dx (médial +), dy (antérieur +),
   *  dz (supérieur +), sortie vers la famille exit (décalage ex). */
  const LIBRARY = [
    // --- temporal mésial / basal
    { code: 'TP', fr: 'pôle temporal', target: 'Temporal-pole', tip: [-24.6, 11.7, -36.2], entry: [-61.4, 3.8, -28.8], n: 8, samples: 'pôle temporal mésial → latéral', group: 'temporal' },
    { code: 'A', alias: 'NA', fr: 'amygdale', target: 'Amygdala', tip: [-19.6, -6.9, -18.8], entry: [-69.1, -8.4, -12.0], n: 12, samples: 'amygdale → T2 antérieur', group: 'temporal' },
    { code: 'B', alias: 'HC', fr: 'hippocampe antérieur (tête)', target: 'Hippocampus-anterior', tip: [-25.0, -17.1, -20.8], entry: [-70.4, -19.4, -19.8], n: 12, samples: 'tête de l’hippocampe → T2', group: 'temporal' },
    { code: 'C', alias: 'HT', fr: 'hippocampe postérieur (queue)', target: 'Hippocampus-posterior', tip: [-25.1, -33.1, -9.1], entry: [-72.1, -36.2, -4.6], n: 12, samples: 'hippocampe postérieur → T2 postérieur', group: 'temporal' },
    { code: 'TB', fr: 'temporo-basal (cortex rhinal)', target: 'Rhinal-cortex', tip: [-28.5, -13.8, -34.8], entry: [-55.0, -13.8, -34.8], n: 8, samples: 'cortex rhinal → fusiforme → T3', group: 'temporal' },
    { code: 'CE', fr: 'parahippocampique antérieur', target: 'Parahippocampal-cortex', tip: [-20.4, -31.1, -18.0], entry: [-70.0, -32.5, -17.5], n: 15, samples: 'parahippocampe antérieur → fusiforme → T3', group: 'temporal' },
    { code: 'GPH', fr: 'parahippocampique postérieur', target: 'Parahippocampal-cortex', tip: [-19.2, -39.1, -13.9], entry: [-70.2, -39.1, -13.9], n: 15, samples: 'parahippocampe postérieur → fusiforme → T3 postérieur', group: 'temporal' },
    { code: 'T', fr: 'T1 antérieur (planum polare)', target: 'T1-planum-polare', exit: 'T1-lateral-anterior', tip: [-35.0, 6.9, -24.9], entry: [-61.6, 6.0, -12.0], n: 8, samples: 'planum polare → T1 antérieur', group: 'temporal' },
    { code: 'H', fr: 'gyrus de Heschl', target: 'Insula-gyri-longi', exit: 'Gyrus-of-Heschl', tip: [-36.3, -24.0, 5.5], entry: [-69.9, -16.1, 8.2], n: 10, samples: 'insula postérieure → Heschl → planum temporale → T1', group: 'temporal' },
    { code: 'LI', fr: 'planum temporale (sortie supramarginale)', target: 'T1-planum-temporale', tip: [-42.4, -36.0, 17.5], entry: [-70.4, -40.2, 18.6], samples: 'planum temporale → supramarginal antérieur', group: 'temporal' },
    // --- temporo-occipital
    { code: 'OT', fr: 'occipito-temporal (fusiforme)', target: 'Fusiform-gyrus', tip: [-28.4, -52.7, -16.0], entry: [-65.3, -53.5, -15.9], n: 8, samples: 'fusiforme → T3 postérieur', group: 'postérieur' },
    { code: 'PFG', fr: 'fusiforme postérieur', target: 'Fusiform-gyrus', tip: [-18.9, -70.4, -12.1], entry: [-53.7, -71.0, -12.6], n: 5, samples: 'fusiforme postérieur → O3 / T3 postérieur', group: 'postérieur' },
    { code: 'GL', fr: 'gyrus lingual', target: 'Lingual-gyrus', tip: [-9.2, -69.1, -11.6], entry: [-49.7, -69.1, -11.6], n: 12, samples: 'lingual → fusiforme postérieur → O3', group: 'postérieur' },
    { code: 'FCA', fr: 'fissure calcarine antérieure', target: 'Calcarine-sulcus', tip: [-17.7, -58.0, 6.4], entry: [-62.3, -64.5, 6.7], n: 15, samples: 'calcarine antérieure → O2 / T2 postérieur', group: 'postérieur' },
    { code: 'Cu', fr: 'cunéus', target: 'Cuneus', tip: [-4.0, -80.8, 17.2], entry: [-48.3, -80.8, 17.6], n: 12, samples: 'cunéus → O1 / O2', group: 'postérieur' },
    { code: 'O', fr: 'pôle occipital', target: 'Occipital-pole', tip: [-2.9, -93.5, -6.3], entry: [-39.0, -93.2, -3.4], samples: 'lingual → pôle occipital → O2', group: 'postérieur' },
    // --- insulo-operculaire : orthogonales trans-operculaires
    { code: 'FT', fr: 'frontal triangulaire → insula antérieure', target: 'Insula-gyri-brevi', exit: 'F3-Pars-triangularis', tip: [-33.6, 22.5, 0.0], entry: [-58.4, 24.9, 0.2], n: 8, samples: 'insula antérieure → F3 pars triangularis', group: 'insulo-operculaire' },
    { code: 'OF', fr: 'opercule frontal → insula antérieure', target: 'Insula-gyri-brevi', exit: 'F3-pars-opercularis', tip: [-37.4, 7.3, 3.7], entry: [-59.6, 13.9, 0.4], n: 8, samples: 'insula antérieure → F3 pars opercularis', group: 'insulo-operculaire' },
    { code: 'OC', fr: 'opercule central → insula moyenne', target: 'Insula-gyri-longi', exit: 'Central-operculum', tip: [-40.5, -1.2, 6.5], entry: [-63.6, 5.4, 5.4], n: 8, samples: 'insula moyenne → opercule rolandique', group: 'insulo-operculaire' },
    { code: 'OP', fr: 'opercule pariétal → insula postérieure', target: 'Insula-gyri-longi', exit: 'Parietal-operculum', tip: [-40.7, -13.9, 9.8], entry: [-68.9, -10.6, 15.2], n: 10, samples: 'insula postérieure → opercule pariétal (SII)', group: 'insulo-operculaire' },
    // --- insulaires obliques (Lyon) : entrée haute, trajet parasagittal descendant vers l'insula
    { code: 'Ia', fr: 'insula antérieure (oblique, sortie F2)', target: 'Insula-gyri-brevi', exit: 'F2-caudal', oblique: true, tip: [-37.2, 12.2, -13.4], entry: [-38.0, 40.4, 42.0], n: 15, model: 'DIXI D08-15BM', samples: 'insula antérieure → F3 / sillon frontal inférieur → F2', group: 'insulaire oblique' },
    { code: 'Im', fr: 'insula moyenne (oblique, sortie précentrale)', target: 'Insula-gyri-longi', exit: 'Precentral-gyrus-upper-limb', oblique: true, tip: [-40.6, 6.4, -12.3], entry: [-49.2, -25.7, 64.6], n: 18, model: 'DIXI D08-18CM', samples: 'insula moyenne → corona radiata → précentral', group: 'insulaire oblique' },
    { code: 'Ip', fr: 'insula postérieure (oblique, sortie pariétale supérieure)', target: 'Insula-gyri-longi', exit: 'Superior-parietal-lobule-P1', oblique: true, tip: [-39.8, 0.5, -13.9], entry: [-36.2, -36.6, 35.0], n: 18, model: 'DIXI D08-18CM', samples: 'insula postérieure → Heschl / planum → substance blanche pariétale → pariétal supérieur', group: 'insulaire oblique' },
    { code: 'Ib', fr: 'insula antérieure (oblique, sortie F2 caudal)', target: 'Insula-gyri-brevi', exit: 'F2-caudal', oblique: true, tip: [-41.6, 7.7, -8.3], entry: [-51.0, 20.2, 46.6], n: 12, model: 'DIXI D08-12AM', samples: 'insula antérieure → F3 pars opercularis → F2 caudal', group: 'insulaire oblique' },
    // --- frontal
    { code: 'FP', fr: 'fronto-polaire (F1 mésial antérieur)', target: 'F1-mesial-prefrontal', tip: [-6.2, 62.2, -13.2], entry: [-42.0, 61.0, -8.0], n: 8, samples: 'pôle frontal mésial → F1 latéral → F2 rostral', group: 'frontal' },
    { code: 'FD', fr: 'frontal dorsal', target: 'F1-mesial-prefrontal', tip: [-3.0, 52.8, 17.7], entry: [-43.0, 51.2, 22.3], n: 8, samples: 'F1 mésial préfrontal → F1 latéral → F2', group: 'frontal' },
    { code: 'OR', fr: 'fronto-orbitaire (oblique)', target: 'Orbito-frontal-cortex', exit: 'F2-rostral', oblique: true, tip: [-4.0, 47.2, -25.0], entry: [-49.5, 50.3, -6.5], n: 15, samples: 'orbitofrontal médial → F3 → F2 rostral', group: 'frontal' },
    // verticales (v2.4.0) : entrée sur la convexité dorsale (F1, F2), descente vers la face orbitaire
    { code: 'BM', fr: 'basal médial (verticale, F1 → gyrus droit)', target: 'Gyrus-rectus', exit: 'F1-lateral-prefrontal', vertical: true, oblique: true, tip: [-4.7, 40.5, -29.1], entry: [-6.2, 42.6, 56.2], n: 18, model: 'DIXI D08-18CM', samples: 'gyrus droit → substance blanche frontale → F1', group: 'frontal' },
    { code: 'BL', fr: 'basal latéral (verticale, F2 → orbitofrontal)', target: 'Orbito-frontal-cortex', exit: 'F2-rostral', vertical: true, oblique: true, tip: [-33.2, 45.5, -18.7], entry: [-30.4, 47.8, 40.6], n: 15, model: 'DIXI D08-15BM', samples: 'cortex orbitofrontal → substance blanche frontale → F2', group: 'frontal' },
    { code: 'R', fr: 'sous-rostral (aire sous-calleuse)', target: 'Subcallosal-area', tip: [-3.5, 33.2, -28.3], entry: [-54.4, 30.7, -13.1], n: 12, samples: 'aire sous-calleuse → striatum ventral → orbitofrontal postérieur → F3 orbitaire', group: 'frontal' },
    { code: 'CR', fr: 'cingulaire rostral (aire 32)', target: 'Anterior-cingulate-cortex', tip: [-4.3, 39.0, 1.2], entry: [-54.1, 41.3, 2.3], n: 10, samples: 'cingulaire antérieur rostral → F1 mésial (paracingulaire) → F2 rostral', group: 'frontal' },
    { code: 'CC', fr: 'cingulaire antérieur (aire 24)', target: 'Middle-cingulate-cortex-anterior-part', tip: [-6.3, 21.5, 34.3], entry: [-46.8, 21.5, 34.3], n: 12, samples: 'cingulaire antérieur / moyen antérieur → F1 → F2 caudal', group: 'frontal' },
    { code: 'FA', fr: 'cingulaire moyen antérieur → précentral inférieur', target: 'Middle-cingulate-cortex-anterior-part', tip: [-3.8, 13.9, 28.8], entry: [-63.1, 4.2, 32.0], samples: 'cingulaire moyen antérieur → substance blanche frontale → précentral inférieur (face)', group: 'frontal' },
    { code: 'PM', fr: 'pré-AMS', target: 'PreSMA', tip: [-4.5, 23.2, 51.3], entry: [-31.0, 23.2, 51.3], n: 8, samples: 'pré-AMS → F1 latéral → F2 caudal', group: 'frontal' },
    { code: 'SA', fr: 'AMS', target: 'SMA', tip: [-5.1, -6.8, 59.1], entry: [-47.9, 2.4, 57.5], n: 12, samples: 'AMS → F1 latéral prémoteur', group: 'frontal' },
    // --- central / pariétal
    { code: 'LP', fr: 'lobule paracentral', target: 'Paracentral-lobule', tip: [-4.2, -40.4, 46.6], entry: [-63.6, -45.8, 43.5], n: 8, samples: 'lobule paracentral → précentral / postcentral', group: 'central' },
    { code: 'SC', fr: 'sillon central (main)', target: 'Central-sulcus-upper-limb', tip: [-4.2, -29.0, 53.6], entry: [-58.0, -27.0, 55.4], n: 8, samples: 'berges du sillon central → convexité', group: 'central' },
    { code: 'CP', fr: 'cingulaire paracentral', target: 'Posterior-cingulate-cortex-dorsal', tip: [-2.7, -35.5, 31.2], entry: [-69.0, -32.1, 26.1], n: 18, samples: 'cingulaire postérieur dorsal / moyen postérieur → lobule paracentral → postcentral', group: 'central' },
    { code: 'PO', fr: 'cingulaire moyen postérieur → sillon central', target: 'Middle-cingulate-cortex-posterior-part', tip: [-3.5, -11.7, 36.8], entry: [-65.4, -12.7, 37.2], samples: 'cingulaire moyen postérieur → corona radiata → sillon central / précentral', group: 'central' },
    { code: 'PA', fr: 'pariétal supérieur antérieur (7A)', target: 'Precuneus', tip: [-5.1, -52.1, 57.0], entry: [-41.2, -53.4, 61.9], n: 10, samples: 'précunéus antéro-supérieur → lobule pariétal supérieur', group: 'postérieur' },
    { code: 'PP', fr: 'pariétal supérieur postérieur (7B)', target: 'Precuneus', tip: [-2.8, -68.1, 52.7], entry: [-41.4, -70.0, 53.3], n: 8, samples: 'précunéus postéro-supérieur → lobule pariétal supérieur', group: 'postérieur' },
    { code: 'PI', fr: 'sub-pariétal (précunéus)', target: 'Precuneus', tip: [-5.1, -51.5, 35.8], entry: [-64.7, -53.3, 36.8], n: 18, samples: 'précunéus (sillon sub-pariétal) → supramarginal postérieur', group: 'postérieur' },
    { code: 'GC', fr: 'isthme du gyrus cingulaire', target: 'Posterior-cingulate-cortex-retrosplenial-gyrus', tip: [-4.5, -57.2, 13.3], entry: [-64.9, -57.8, 22.0], n: 18, samples: 'isthme / rétrosplénial → carrefour ventriculaire → T1 postérieur', group: 'postérieur' },
    { code: 'PB', fr: 'cunéus supérieur → gyrus angulaire', target: 'Cuneus', tip: [-1.4, -78.2, 30.1], entry: [-53.3, -74.7, 31.7], samples: 'cunéus supérieur → sillon pariéto-occipital → sillon intrapariétal → gyrus angulaire', group: 'postérieur' },
  ];

  const SULCAL = /sulcus|^STS|^ITS|^SFS|Parieto-occipital|Intraparietal|Marginal-branch|Collateral|Occipito-temporal-sulcus|Lingual-sulcus/;

  // ---------------------------------------------------------------- volume d'étiquettes (2 mm)
  class Volume {
    constructor(json) {
      this.dims = json.dims; this.off = json.offset_vox; this.vox = json.voxel_mm || 2;
      const rv = SV.b64ToArray(json.rle_values, Uint8Array), rn = SV.b64ToArray(json.rle_lengths, Uint16Array);
      const n = this.dims[0] * this.dims[1] * this.dims[2], data = new Uint8Array(n); let p = 0;
      for (let i = 0; i < rv.length; i++) { data.fill(rv[i], p, p + rn[i]); p += rn[i]; }
      this.data = data;
    }
    /** étiquette au point du gabarit (mm MNI 2009b ; grille centrée sur 128, convention héritée de fsaverage) : 0 hors
     *  cerveau, 1–162 région, 200 SB, 201 LCR, 202 autre */
    labelAt(x, y, z) {
      const i = Math.round((128 - x) / this.vox) - this.off[0], j = Math.round((128 - z) / this.vox) - this.off[1], k = Math.round((y + 128) / this.vox) - this.off[2];
      if (i < 0 || j < 0 || k < 0 || i >= this.dims[0] || j >= this.dims[1] || k >= this.dims[2]) return 0;
      return this.data[(i * this.dims[1] + j) * this.dims[2] + k];
    }
    /** point de la région `idx` le plus proche de p (recherche dans un rayon), ou null */
    nearestOf(idx, p, radius) {
      radius = radius || 16; let best = null, bd = Infinity;
      for (let dx = -radius; dx <= radius; dx += 2) for (let dy = -radius; dy <= radius; dy += 2) for (let dz = -radius; dz <= radius; dz += 2) {
        const d = dx * dx + dy * dy + dz * dz; if (d >= bd) continue;
        if (this.labelAt(p[0] + dx, p[1] + dy, p[2] + dz) === idx) { bd = d; best = [p[0] + dx, p[1] + dy, p[2] + dz]; }
      }
      return best;
    }
  }

  // ---------------------------------------------------------------- géométrie d'une électrode
  const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const add = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  function dirFrom(hemi, yaw, pitch, base) {
    // direction de la cible vers l'entrée : base = latérale pure (orthogonale) ou cible → point de sortie (oblique),
    // puis rotation yaw (plan axial, + = antérieur) et inclinaison pitch (+ = supérieur)
    const lat = hemi === 'L' ? -1 : 1, b = base ? norm(base) : [lat, 0, 0];
    const th = lat * yaw * Math.PI / 180, cz = Math.cos(th), sz = Math.sin(th);
    const r = [b[0] * cz - b[1] * sz, b[0] * sz + b[1] * cz, b[2]];
    const cp = Math.cos(pitch * Math.PI / 180), sp = Math.sin(pitch * Math.PI / 180);
    return norm([r[0] * cp, r[1] * cp, r[2] * cp + sp]);
  }
  /** angle (°) entre la trajectoire et le plan orthogonal (axe latéral) */
  const obliquity = dir => Math.round(Math.acos(Math.min(1, Math.abs(dir[0]))) * 180 / Math.PI);

  /** Construit la géométrie : spec = {code, name, hemi, target:[x,y,z], exit:[x,y,z]|null, yaw, pitch, overshoot, model} */
  function build(spec, atlas, vol) {
    const e = Object.assign({ yaw: 0, pitch: 0, overshoot: 2 }, spec);
    const T = e.target, base = e.exit ? [e.exit[0] - T[0], e.exit[1] - T[1], e.exit[2] - T[2]] : null;
    const dir = dirFrom(e.hemi, e.yaw, e.pitch, base);
    // entrée : dernier point intra-cérébral en marchant vers l'extérieur
    // (les sillons et la vallée sylvienne sont traversés : on ne s'arrête qu'après 14 mm continus hors cerveau = crâne)
    let last = null, outside = 0, p = T.slice();
    // (le LCR ventriculaire, 201, est « dans le cerveau » : il n'arrête pas la marche mais ne fait pas une entrée)
    for (let s = 0; s < 140; s++) { p = add(T, dir, s); const l = vol.labelAt(p[0], p[1], p[2]); if (l > 0) { if (l !== 201) last = s; outside = 0; } else if (last != null && ++outside >= 14) break; }
    if (last == null) return null;
    const entry = add(T, dir, last + 1);
    // pointe : au-delà de la cible, tant qu'on reste dans le cerveau
    let over = 0; for (let s = 1; s <= e.overshoot; s++) { const q = add(T, dir, -s); if (vol.labelAt(q[0], q[1], q[2]) > 0) over = s; else break; }
    const tip = add(T, dir, -over), length = dist(tip, entry);
    const need = Math.max(1, Math.floor((length - 1) / PITCH) + 1);
    const model = e.model ? modelById(e.model) : null;
    const chosen = model || MODELS.find(m => m.maker === (e.maker || 'DIXI') && !m.groups && !m.hd && m.pitch === PITCH && m.n >= need) || MODELS.filter(m => m.maker === (e.maker || 'DIXI') && !m.groups && !m.hd).pop();
    const offs = chosen.offsets, nFit = offs.filter(o => o <= length - 1).length, n = model ? Math.min(chosen.n, Math.max(1, nFit)) : Math.min(chosen.n, need), contacts = [], regions = new Map();
    for (let k = 1; k <= n; k++) {
      const c = add(tip, dir, offs[k - 1]);
      const votes = {}; for (const d of [-0.8, 0, 0.8]) { const q = add(c, dir, d); const l = vol.labelAt(q[0], q[1], q[2]); votes[l] = (votes[l] || 0) + 1; }
      const label = +Object.keys(votes).sort((a, b) => votes[b] - votes[a])[0];
      contacts.push({ k, xyz: c, label });
      if (label >= 1 && label <= 162) regions.set(label, (regions.get(label) || 0) + 1);
    }
    const entryLabel = (() => { for (let s = 0; s <= 6; s++) { const q = add(entry, dir, -s); const l = vol.labelAt(q[0], q[1], q[2]); if (l >= 1 && l <= 162) return l; } return 0; })();
    const issues = [];
    const fam = entryLabel ? atlas.region(entryLabel).family : '';
    if (fam && SULCAL.test(fam)) issues.push({ sev: 1, text: 'entrée en fond de sillon (veines) : ' + atlas.label(entryLabel) });
    if (entry[1] > 40 && entry[2] < 0) issues.push({ sev: 2, text: 'entrée frontale basse : sinus frontal / orbite' });
    else if (entry[1] > 40 && entry[2] < 10) issues.push({ sev: 1, text: 'entrée frontale basse : vérifier le sinus frontal' });
    else if (entry[1] > 25 && entry[2] < -5) issues.push({ sev: 2, text: 'trop bas sur la ligne de front' });
    if (entry[1] < -30 && entry[2] < -22) issues.push({ sev: 2, text: 'os temporal pneumatisé (mastoïde / rocher)' });
    if (entry[1] < -70) issues.push({ sev: 1, text: 'entrée très postérieure (décubitus dorsal)' });
    if (entry[2] < -35) issues.push({ sev: 2, text: 'entrée très basse' });
    const csf = contacts.slice(1, -1).filter(c => c.label === 201).length;
    if (csf >= 3) issues.push({ sev: 1, text: `${csf} plots dans le LCR (ventricule / citerne)` });
    const obl = obliquity(dir);
    if (obl >= 15) issues.push({ sev: 0, text: (e.oblique ? 'oblique assumée' : 'oblique') + ` (${obl}°${e.yaw || e.pitch ? `, yaw ${e.yaw}°, pitch ${e.pitch}°` : ''})` });
    if (!regions.has(e.targetIndex)) issues.push({ sev: 1, text: 'aucun plot dans la cible ' + (e.targetIndex ? atlas.label(e.targetIndex) : '') });
    return Object.assign({}, e, { dir, entry, tip, length, model: chosen.id, nContacts: n, contacts, regions, entryLabel, issues, obliquity: obl });
  }

  /** distance minimale entre deux segments 3D */
  function segDist(p1, q1, p2, q2) {
    const u = [q1[0] - p1[0], q1[1] - p1[1], q1[2] - p1[2]], v = [q2[0] - p2[0], q2[1] - p2[1], q2[2] - p2[2]], w = [p1[0] - p2[0], p1[1] - p2[1], p1[2] - p2[2]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const a = dot(u, u), b = dot(u, v), c = dot(v, v), d = dot(u, w), e = dot(v, w), D = a * c - b * b; let sN, sD = D, tN, tD = D;
    if (D < 1e-8) { sN = 0; sD = 1; tN = e; tD = c; } else { sN = b * e - c * d; tN = a * e - b * d; if (sN < 0) { sN = 0; tN = e; tD = c; } else if (sN > sD) { sN = sD; tN = e + b; tD = c; } }
    if (tN < 0) { tN = 0; if (-d < 0) sN = 0; else if (-d > a) sN = sD; else { sN = -d; sD = a; } } else if (tN > tD) { tN = tD; if (-d + b < 0) sN = 0; else if (-d + b > a) sN = sD; else { sN = -d + b; sD = a; } }
    const sc = Math.abs(sN) < 1e-8 ? 0 : sN / sD, tc = Math.abs(tN) < 1e-8 ? 0 : tN / tD;
    const dP = [w[0] + sc * u[0] - tc * v[0], w[1] + sc * u[1] - tc * v[1], w[2] + sc * u[2] - tc * v[2]];
    return Math.hypot(dP[0], dP[1], dP[2]);
  }
  function crossings(list) {
    list.forEach(e => { e.issues = e.issues.filter(i => !i.cross); });
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const d = segDist(list[i].tip, add(list[i].entry, list[i].dir, 8), list[j].tip, add(list[j].entry, list[j].dir, 8));
      if (d < 6) { list[i].issues.push({ sev: 2, cross: true, text: `croisement / proximité ${d.toFixed(1)} mm avec ${list[j].name}` }); list[j].issues.push({ sev: 2, cross: true, text: `croisement / proximité ${d.toFixed(1)} mm avec ${list[i].name}` }); }
    }
  }

  /** point de sortie d'une trajectoire de bibliothèque (famille `exit`, décalage `ex`), ou null si orthogonale */
  function exitPoint(lib, hemi, atlas, vol, target) {
    if (!lib.exit) return null;
    const xi = atlas.idx(lib.exit, hemi); if (!xi) return null;
    const lat = hemi === 'L' ? -1 : 1, ex = lib.ex || [0, 0, 0];
    // verticale : point de la famille de sortie le plus proche de l'aplomb de la cible (même x, y ; 30 à 70 mm plus haut)
    if (lib.vertical && target) for (const up of [50, 40, 60, 30, 70]) { const p = vol.nearestOf(xi, [target[0] - lat * ex[0], target[1] + ex[1], target[2] + up + ex[2]], 12); if (p) return p; }
    const x0 = atlas.region(xi).centroid;
    return vol.nearestOf(xi, [x0[0] - lat * ex[0], x0[1] + ex[1], x0[2] + ex[2]], 16) || x0;
  }

  /** Électrode de bibliothèque pour un hémisphère : géométrie explicite (v3.0.0 : pointe et entrée sur le gabarit, miroir à
   *  droite ; entrée recalculée au bord du cerveau le long de la même direction) ; sinon cible de famille avec recherche d'une
   *  entrée hors sillon (décalages ±2…6 mm) */
  function fromLibrary(lib, hemi, atlas, vol, opts) {
    const idx = atlas.idx(lib.target, hemi);
    if (lib.tip && lib.entry) {
      const mir = p => hemi === 'L' ? p.slice() : [-p[0], p[1], p[2]], tip = mir(lib.tip), entry = mir(lib.entry);
      const name = SV.Side ? SV.Side.name(lib.code, hemi, opts && opts.sideConv) : lib.code + (hemi === 'L' ? '’' : '');
      // modèle de la bibliothèque (v3.1.0 : électrodes à groupes espacés pour BM, BL, Ia, Im, Ip — l'échantillonnage va plus
      // loin vers la sortie) ; autre marque : modèle standard du même nombre de plots
      const mk = opts && opts.maker, model = lib.model && mk !== 'Alcis' ? modelById(lib.model) : lib.n ? modelFor(mk, lib.n) : null;
      const e = build(Object.assign({ code: lib.code, lib: lib.code, name, hemi, target: tip, targetIndex: idx || 0, exit: entry, exitFamily: lib.exit || null, overshoot: 0, oblique: !!lib.oblique, fr: lib.fr, maker: mk, model: model ? model.id : undefined }, opts && opts.spec), atlas, vol);
      // trajectoire placée à la main : la « cible » est la région du plot le plus profond quand la famille nominale n'est pas
      // échantillonnée (pointe juste en deçà de la structure, par exemple)
      if (e && !e.regions.has(e.targetIndex)) { const c = e.contacts.find(x => x.label >= 1 && x.label <= 162); if (c) { e.targetIndex = c.label; e.issues = e.issues.filter(i => !/^aucun plot dans la cible/.test(i.text)); } }
      return e;
    }
    if (!idx) return null;
    const lat = hemi === 'L' ? -1 : 1, c0 = atlas.region(idx).centroid;
    const c = vol.nearestOf(idx, [c0[0] - lat * (lib.dx || 0), c0[1] + (lib.dy || 0), c0[2] + (lib.dz || 0)], 14) || c0;
    const exit = exitPoint(lib, hemi, atlas, vol, c);
    const name = SV.Side ? SV.Side.name(lib.code, hemi, opts && opts.sideConv) : lib.code + (hemi === 'L' ? '’' : '');
    const offsets = [[0, 0]]; for (const r of [2, 4, 6]) for (const [dy, dz] of [[0, r], [0, -r], [r, 0], [-r, 0], [r, r], [-r, r], [r, -r], [-r, -r]]) offsets.push([dy, dz]);
    let best = null;
    for (const [dy, dz] of offsets) {
      const e = build(Object.assign({ code: lib.code, lib: lib.code, name, hemi, target: [c[0], c[1] + dy, c[2] + dz], targetIndex: idx, exit, exitFamily: lib.exit || null, oblique: !!lib.oblique, fr: lib.fr, maker: opts && opts.maker }, opts && opts.spec), atlas, vol);
      if (!e) continue;
      const bad = e.issues.some(i => i.sev >= 1);
      if (!best) best = e;
      if (!bad) { best = e; break; }
    }
    return best;
  }

  // ---------------------------------------------------------------- proposition automatique
  function valueMap(result, atlas) {
    const V = new Map(), addV = (r, v) => { if (r) V.set(r, (V.get(r) || 0) + v); };
    result.hypotheses.forEach(H => {
      H.trajectory.forEach(n => addV(n.region, (n.origin ? 3 : n.relay ? 0.8 : 2) * H.score));
      H.discriminant.forEach(r => addV(r, 0.5 * H.score));
    });
    result.candidates.slice(0, 8).forEach(c => addV(c.region, 0.6 * c.score));
    result.targets.filter(t => t.reasons.has('zone symptomatogène précoce')).forEach(t => addV(t.region, 1));
    // structures sous-corticales non implantées (ganglions de la base, thalamus, cervelet) : valeur nulle
    for (const [r] of V) { const sys = atlas.system(r); if (sys === 'subcortical') V.set(r, 0); }
    return V;
  }

  function propose(result, atlas, vol, opts) {
    opts = Object.assign({ max: 12, minGain: 0.5, hemi: 'auto', contralateral: true, allowPosterior: false, maker: 'DIXI', sideConv: 'prime' }, opts || {});
    const V = valueMap(result, atlas), pL = result.lateralization.pL, pFav = Math.max(pL, 1 - pL), fav = pL >= 0.5 ? 'L' : 'R';
    let hemis = opts.hemi === 'auto' ? (pFav >= 0.7 ? [fav] : ['L', 'R']) : opts.hemi === 'B' ? ['L', 'R'] : [opts.hemi];
    // contrôle controlatéral classique : miroir de l'origine principale quand la latéralisation n'est pas absolue
    if (opts.contralateral && hemis.length === 1 && result.hypotheses.length && pFav < 0.92) {
      const o = result.hypotheses[0].origin, m = atlas.homotopic[o]; if (m > 0) { V.set(m, (V.get(m) || 0) + 1.2); hemis = [fav, fav === 'L' ? 'R' : 'L']; }
    }
    // opts.keep : électrodes déjà présentes (schéma repris) — elles comptent pour la couverture et les croisements, et
    // leur trajectoire de bibliothèque n'est pas reproposée — opts.max : nombre d'électrodes à ajouter
    const keep = (opts.keep || []).filter(Boolean), keepKey = new Set(keep.map(e => (e.lib || e.code) + ':' + e.hemi));
    const cands = [];
    for (const lib of LIBRARY) for (const h of hemis) { if (keepKey.has(lib.code + ':' + h)) continue; const e = fromLibrary(lib, h, atlas, vol, { maker: opts.maker }); if (e) cands.push(e); }
    const chosen = keep.slice(), covered = new Map();
    for (const e of keep) for (const [r] of e.regions || []) covered.set(r, (covered.get(r) || 0) + 1);
    const gainOf = e => {
      let g = 0; for (const [r, n] of e.regions) { const v = V.get(r) || 0; if (!v) continue; const already = covered.get(r) || 0; g += v * (already ? 0.15 : 1) * (n >= 2 ? 1 : 0.75); }
      const sev2 = e.issues.filter(i => i.sev >= 2).length, sev1 = e.issues.filter(i => i.sev === 1).length;
      if (sev2) g *= 0.1; if (sev1) g *= 0.6; if (!opts.allowPosterior && e.issues.some(i => /postérieure/.test(i.text))) g *= 0.4;
      if (e.oblique) g *= 0.8; // l'orthogonal est privilégié ; l'oblique insulaire se justifie par ce qu'il échantillonne
      return g;
    };
    while (chosen.length - keep.length < opts.max) {
      let best = null, bg = 0;
      for (const e of cands) {
        if (chosen.includes(e)) continue;
        if (chosen.some(c => segDist(c.tip, add(c.entry, c.dir, 8), e.tip, add(e.entry, e.dir, 8)) < 7)) continue;
        const g = gainOf(e); if (g > bg) { bg = g; best = e; }
      }
      if (!best || bg < opts.minGain) break;
      best.gain = bg; chosen.push(best); for (const [r] of best.regions) covered.set(r, (covered.get(r) || 0) + 1);
    }
    const added = chosen.slice(keep.length);
    added.forEach((e, i) => { e.id = 'e' + (i + 1) + '_' + Date.now().toString(36); e.auto = true; e.value = [...e.regions.keys()].reduce((a, r) => a + (V.get(r) || 0), 0); });
    crossings(chosen);
    const uncovered = [...V.entries()].filter(([r, v]) => v >= 1 && !covered.has(r)).sort((a, b) => b[1] - a[1]).map(([r]) => r);
    return { electrodes: added, kept: keep, uncovered, hemis, value: V };
  }

  /** résumé des plots : "1–3 amygdale · 4 SB · 5–8 T2 antérieur" */
  function contactSummary(e, atlas) {
    const parts = []; let start = 1, cur = e.contacts[0] ? e.contacts[0].label : 0;
    const nameOf = l => l === 200 ? 'SB' : l === 201 ? 'LCR' : l === 0 ? 'sillon/LCR' : l === 202 ? 'autre' : atlas.label(l).replace(/ [GD]$/, '');
    for (let k = 1; k <= e.contacts.length; k++) {
      const l = k < e.contacts.length ? e.contacts[k].label : null;
      if (l !== cur) { parts.push((start === k ? `${k}` : `${start}–${k}`) + ' ' + nameOf(cur)); start = k + 1; cur = l; }
    }
    return parts.join(' · ');
  }
  function serialize(e) { return { id: e.id, code: e.code, lib: e.lib, name: e.name, hemi: e.hemi, target: e.target, targetIndex: e.targetIndex, exit: e.exit || null, exitFamily: e.exitFamily || null, oblique: !!e.oblique, yaw: e.yaw || 0, pitch: e.pitch || 0, overshoot: e.overshoot, model: e.model, maker: e.maker, fr: e.fr, auto: !!e.auto }; }

  SV.Electrodes = { contactName: (l, atlas) => l === 200 ? 'substance blanche' : l === 201 ? 'LCR' : l === 0 ? 'sillon / LCR' : l === 202 ? 'autre tissu' : atlas.label(l), MODELS, MAKERS, modelById, modelFor, offsetsOf, contactOffsets, LIBRARY, PITCH, CONTACT_LEN, DIAM, Volume, build, fromLibrary, exitPoint, propose, crossings, contactSummary, serialize, segDist, SULCAL, obliquity };
})(window.SV = window.SV || {});
