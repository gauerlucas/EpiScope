/* EpiScope — store.js : modèle du dossier patient (parcours pré-chirurgical), sans dépendance au DOM.
 *
 *   Patient ─┬─ Exploration (phase 1 vidéo-EEG scalp, SEEG 1, SEEG 2…) ─┬─ Séance d'enregistrement ── Crise ── signes
 *            │                                                         └─ implantation (électrodes), stimulations,
 *            │                                                            thermocoagulations, quantifications
 *            ├─ Imagerie (T1, FLAIR, PET, CT… datées, avec leur temps : pré-op, post-implantation, post-thermo, post-op)
 *            ├─ Anatomie patient (dérivés : segmentation, surfaces, parcellation VEP, transformations)
 *            ├─ Lésions
 *            ├─ Réunions (staffs) ── hypothèses versionnées (lignée, version, remplace…) ── décisions
 *            ├─ Procédures (chirurgie, thermocoagulation, laser, neuromodulation) ── devenir (Engel, ILAE)
 *            └─ Journal (qui a fait quoi, quand)
 *
 * Le dossier est un objet JSON unique (dossier.json) ; les fichiers lourds (NIfTI, maillages) sont rangés à côté
 * (imaging/, derivatives/) et référencés par chemin relatif. La crise ouverte dans l'espace de travail est un
 * « état » (format historique des cas EpiScope v1) construit par toWorkspace et réécrit par fromWorkspace.        */
(function (factory) {
  const G = typeof window !== 'undefined' ? (window.SV = window.SV || {}) : (globalThis.SV = globalThis.SV || {});
  factory(G); (G._factories = G._factories || {}).store = factory;
})(function (SV) {
  'use strict';
  const SCHEMA = 2;
  const now = () => new Date().toISOString();
  const today = () => new Date().toISOString().slice(0, 10);
  let _seq = 0;
  /** identifiant triable dans le temps (base 36) + aléa */
  const uid = p => (p || '') + Date.now().toString(36) + (_seq++ % 1296).toString(36).padStart(2, '0') + Math.random().toString(36).slice(2, 6);
  const clone = o => o == null ? o : JSON.parse(JSON.stringify(o));

  // ---------------------------------------------------------------- vocabulaires
  const V = {
    exploration: { phase1: 'Phase 1 · vidéo-EEG scalp', seeg: 'SEEG', other: 'Autre exploration' },
    explorationShort: { phase1: 'Phase 1', seeg: 'SEEG', other: 'Exploration' },
    explorationStatus: { planned: 'programmée', ongoing: 'en cours', done: 'terminée' },
    sex: { '': '—', F: 'F', M: 'M' },
    handedness: { '': '—', R: 'droitier', L: 'gaucher', A: 'ambidextre' },
    dominance: { L: 'gauche', R: 'droite', B: 'bilatérale', '?': 'inconnue' },
    dominanceMethod: { '': '—', presumed: 'présumée', fmri: 'IRMf', wada: 'Wada', stim: 'stimulation', meg: 'MEG' },
    etiology: { '': '—', structural: 'structurelle', genetic: 'génétique', infectious: 'infectieuse', metabolic: 'métabolique', immune: 'auto-immune', unknown: 'inconnue' },
    mri: { '': '—', lesional: 'lésionnelle', negative: 'IRM négative', equivocal: 'douteuse' },
    habitual: { yes: 'habituelle', no: 'non habituelle', '?': '?' },
    ilaeOnset: { focal: 'focale', generalized: 'généralisée', unknown: 'début inconnu', unclassified: 'non classée' },
    consciousness: { preserved: 'conscience préservée', impaired: 'conscience altérée', unknown: 'conscience inconnue' },
    vigilance: { '': '—', wake: 'veille', sleep: 'sommeil' },
    modality: { T1: 'T1', T1c: 'T1 injecté', T2: 'T2', FLAIR: 'FLAIR', PET: 'TEP-FDG', SPECT: 'TEMP', CT: 'Scanner (CT)', other: 'Autre' },
    timepoint: { preop: 'pré-opératoire', postimplant: 'post-implantation', postthermo: 'post-thermocoagulation', postop: 'post-opératoire', followup: 'suivi' },
    lesionType: { FCD: 'dysplasie corticale focale', HS: 'sclérose hippocampique', cavernoma: 'cavernome', LEAT: 'tumeur (LEAT, DNET, gangliogliome…)', tumor: 'autre tumeur', gliosis: 'gliose / cicatrice', PMG: 'polymicrogyrie', heterotopia: 'hétérotopie', encephalocele: 'encéphalocèle', hamartoma: 'hamartome', other: 'autre' },
    lesionSource: { radiology: 'compte rendu radiologique', manual: 'saisie manuelle', atlas: 'marquée sur l’atlas', MELD: 'MELD', MAP: 'MAP', histology: 'histologie' },
    confidence: { low: 'faible', medium: 'moyenne', high: 'élevée' },
    confidenceText: { low: 'confiance faible', medium: 'confiance moyenne', high: 'confiance élevée' },
    meeting: { post_phase1: 'staff après phase 1', post_seeg: 'staff après SEEG', post_surgery: 'staff après chirurgie', other: 'autre staff' },
    hypStatus: { proposed: 'proposée', testing: 'en cours de test', confirmed: 'confirmée', refuted: 'réfutée', revised: 'révisée', abandoned: 'abandonnée' },
    decision: { seeg: 'SEEG', seeg2: 'deuxième SEEG', rftc: 'thermocoagulation SEEG', surgery: 'chirurgie', litt: 'thermothérapie laser', neuromod: 'neuromodulation (VNS, DBS, RNS)', imaging: 'imagerie complémentaire', workup: 'autre bilan', medical: 'traitement médical', none: 'pas de chirurgie' },
    decisionStatus: { proposed: 'proposée', planned: 'programmée', done: 'réalisée', cancelled: 'annulée' },
    implantStatus: { proposed: 'schéma proposé', planned: 'implantation prévue', real: 'implantation réelle' },
    thermoStatus: { planned: 'planifiée', validated: 'validée', done: 'réalisée', rejected: 'contre-indiquée' },
    /** bilans datés (dossier › Bilans) */
    exam: { veeg: 'vidéo-EEG', mri: 'IRM', pet: 'TEP', spect: 'TEMP (SPECT)', meg: 'MEG / EEG-HR', fmri: 'IRMf', wada: 'Test de Wada', neuropsy: 'Neuropsychologie', psy: 'Psychiatrie', other: 'Autre' },   // « EEG de scalp » (eeg) fondu dans vidéo-EEG (v4.4)
    langDom: { '': '—', L: 'gauche', R: 'droite', B: 'bilatérale', A: 'atypique' },
    neuroDomains: [['efficiency', 'efficience globale'], ['language', 'langage'], ['memory', 'mémoire'], ['executive', 'fonctions exécutives'], ['attention', 'attention'], ['visuospatial', 'fonctions visuo-spatiales'], ['other', 'autres']],
    /** antécédents (oui / non + précision), d'après le modèle de présentation des cas chirurgicaux */
    antecedents: [['family', 'antécédent familial d’épilepsie'], ['pregnancy', 'grossesse pathologique'], ['perinatal', 'complications périnatales'], ['febrile', 'convulsions fébriles'], ['headInjury', 'traumatisme crânien significatif'], ['infection', 'méningite / encéphalite'], ['status', 'état de mal']],
    /** étiologies (ILAE 2017) : plusieurs possibles, chacune confirmée ou suspectée */
    etiologyStatus: { confirmed: 'confirmée', suspected: 'suspectée' },
    /** arbre généalogique : liens au cas index, symboles (remplissage), sexe */
    pedRel: { father: 'père', mother: 'mère', sibling: 'frère / sœur', child: 'enfant', gpPat: 'grand-parent paternel', gpMat: 'grand-parent maternel', unclePat: 'oncle / tante paternel', uncleMat: 'oncle / tante maternel', cousinPat: 'cousin(e) paternel', cousinMat: 'cousin(e) maternel', other: 'autre apparenté' },
    pedStatus: { none: 'non atteint', affected: 'atteint', carrier: 'porteur (hétérozygote)', suspected: 'atteinte possible', unknown: 'statut inconnu' },
    /** ROI annotées sur l'imagerie */
    roiKind: { sphere: 'sphère', arrow: 'flèche' },
    // capture : moment par rapport aux crises (« critique / intercritique ») et type d'élément (modalité), indépendants
    galleryKind: { '': '—', interictal: 'intercritique', ictal: 'critique', stim: 'stimulation', postictal: 'post-critique', sleep: 'sommeil / physiologique', artefact: 'artefact', other: 'autre' },
    galleryMod: { eeg: 'EEG', seeg: 'SEEG', imaging: 'imagerie', video: 'vidéo d’enregistrement', familyvideo: 'vidéo familiale', photo: 'photo', document: 'document', other: 'autre' },
    seegRole: { onset: 'début', early: 'propagation précoce', late: 'propagation tardive' },
    seegPattern: { '': '—', lvfa: 'activité rapide de bas voltage', preictal_spikes: 'pointes pré-critiques puis activité rapide', rhythmic_spikes: 'pointes rythmiques', slow: 'décharge lente / rythmique thêta-delta', dc: 'DC-shift + activité rapide', suppression: 'aplatissement (suppression)', other: 'autre' },
    vigil: { '': '', V: 'veille', S: 'sommeil', VS: 'veille et sommeil' },
    procedure: { resection: 'résection / corticectomie', lobectomy: 'lobectomie', rftc: 'thermocoagulation SEEG', litt: 'thermothérapie laser', neuromod: 'neuromodulation', disconnection: 'déconnexion', other: 'autre' },
    engel: { IA: 'IA', IB: 'IB', IC: 'IC', ID: 'ID', IIA: 'IIA', IIB: 'IIB', IIC: 'IIC', IID: 'IID', IIIA: 'IIIA', IIIB: 'IIIB', IVA: 'IVA', IVB: 'IVB', IVC: 'IVC' },
    ilaeOutcome: { 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6' },
    /** aide-mémoire : classification d'Engel (Engel et al. 1993) */
    engelMemo: [
      ['I', 'Libre de crises invalidantes', [['IA', 'complètement libre de crises depuis l’intervention'], ['IB', 'crises partielles simples non invalidantes (auras) seulement'], ['IC', 'quelques crises invalidantes après l’intervention, mais libre de crises invalidantes depuis au moins 2 ans'], ['ID', 'crises généralisées uniquement à l’arrêt des antiépileptiques']]],
      ['II', 'Crises invalidantes rares (« presque libre »)', [['IIA', 'initialement libre de crises invalidantes, crises rares actuellement'], ['IIB', 'crises invalidantes rares depuis l’intervention'], ['IIC', 'crises invalidantes plus que rares après l’intervention, mais rares depuis au moins 2 ans'], ['IID', 'crises nocturnes seulement']]],
      ['III', 'Amélioration notable', [['IIIA', 'réduction notable des crises'], ['IIIB', 'intervalles libres prolongés, plus de la moitié du suivi et au moins 2 ans']]],
      ['IV', 'Pas d’amélioration notable', [['IVA', 'réduction significative des crises'], ['IVB', 'pas de changement appréciable'], ['IVC', 'aggravation']]],
    ],
    /** aide-mémoire : classification ILAE du devenir (Wieser et al. 2001), en jours de crise par an */
    ilaeMemo: [['1', 'libre de crises, sans aura'], ['2', 'auras seulement, aucune autre crise'], ['3', '1 à 3 jours de crise par an, ± auras'], ['4', '4 jours de crise par an jusqu’à 50 % de réduction des jours de crise initiaux, ± auras'], ['5', 'moins de 50 % de réduction à 100 % d’augmentation des jours de crise initiaux, ± auras'], ['6', 'plus de 100 % d’augmentation des jours de crise initiaux, ± auras']],
  };

  // ---------------------------------------------------------------- création
  function newDossier(p) {
    const d = {
      format: 'episcope-dossier', schema: SCHEMA, id: uid('P'), created: now(), updated: now(), revision: 0,
      patient: Object.assign({ pseudo: '', sex: '', birthYear: '', birthMonth: '', handedness: '', dominant: 'L', dominanceMethod: '', onsetAge: '', etiology: '', etiologies: [], etiologyDetail: '', mri: '', frequency: '', aeds: '', history: '', notes: '', clin: newClin() }, p || {}),
      explorations: [], sessions: [], seizures: [], imaging: [], anatomy: null, lesions: [], meetings: [], hypotheses: [], decisions: [], procedures: [], outcomes: [], exams: [], gallery: [], aedHistory: [], rois: [], sliceViews: {},
      settings: { anatomy: 'template' }, ui: {}, journal: [],
    };
    return d;
  }
  /** histoire clinique structurée (modèle de RCP / de présentation des cas chirurgicaux) */
  function newClin() {
    const ant = {}; for (const [k] of V.antecedents) ant[k] = { v: '', text: '' };
    return { antecedents: ant, antecedentsText: '', familyLeftHanded: '', lifestyle: '', epilepsyHistory: '', onsetMode: '', seizureTypes: '', duration: '', subjective: '', objective: '', contact: '', postictal: '', timing: '', triggers: '', fbtcs: '', longestFree: '', intolerances: '', neuroExam: '', comorbidities: '',
      edinburgh: '', pointingR: '', pointingL: '', eye: '', examHistory: [], comorbHistory: [], freqHistory: [], pedigree: { v: 3, persons: [], links: [], notes: '' } };
  }
  /** complète un dossier lu sur disque (champs ajoutés par les versions ultérieures) */
  function normalize(d) {
    if (!d || d.format !== 'episcope-dossier') throw new Error('ce fichier n’est pas un dossier EpiScope');
    const base = newDossier();
    for (const k of Object.keys(base)) if (d[k] == null) d[k] = base[k];
    d.patient = Object.assign(base.patient, d.patient);
    const c0 = newClin(); d.patient.clin = Object.assign(c0, d.patient.clin || {}); d.patient.clin.antecedents = Object.assign(newClin().antecedents, d.patient.clin.antecedents || {});
    migrateClin(d.patient);
    for (const x of d.exams || []) { x.imagingIds = x.imagingIds || []; x.attachments = x.attachments || []; if (x.kind === 'eeg') x.kind = 'veeg'; }   // l'EEG de scalp est un vidéo-EEG
    d.rois = d.rois || [];
    d.sliceViews = d.sliceViews && typeof d.sliceViews === 'object' ? d.sliceViews : {};
    for (const k of Object.keys(d.sliceViews)) { const v = d.sliceViews[k]; if (!v || typeof v !== 'object') { delete d.sliceViews[k]; continue; } delete v.elec; delete v.elecK; delete v.pair; }   // réglages d'affichage seulement
    for (const ex of d.explorations) { for (const k of ['electrodes', 'stims', 'thermo', 'quant']) ex[k] = ex[k] || []; ex.eeg = ex.eeg || {}; if (ex.kind === 'seeg') { ex.implant = Object.assign({ adopted: null, by: '', showReal: true, showPlan: false, compare: null }, ex.implant || {}); ex.inter = Object.assign({ sampling: '', wake: '', sleep: '', physiological: '', slow: '', spikes: [], other: '' }, ex.inter || {}); ex.elecNotes = ex.elecNotes || {}; ex.report = ex.report || {}; ex.recordings = Array.isArray(ex.recordings) ? ex.recordings : []; } }
    for (const sz of d.seizures) { sz.events = sz.events || []; sz.params = sz.params || {}; }
    for (const m of d.meetings) m.galleryIds = m.galleryIds || [];
    // v4.5 : « vidéo », « vidéo familiale », « image, document » deviennent des types d'élément (modalité)
    for (const g of d.gallery || []) { if (['video', 'familyvideo', 'image'].includes(g.kind)) { g.modality = g.modality || (g.kind === 'image' ? 'document' : g.kind); g.kind = ''; } if (!(g.kind in V.galleryKind)) g.kind = 'other'; }
    for (const o of d.outcomes) if (o.monthsManual == null) o.monthsManual = o.months !== '' && o.months != null && !(o.procedureId && byId(d.procedures, o.procedureId));
    d.settings = Object.assign({ anatomy: 'template' }, d.settings); d.ui = d.ui || {};
    return d;
  }
  /** histoire clinique v3 : « autre antécédent » → texte libre ; examen, comorbidités et fréquence des crises datés ;
   *  étiologies multiples (P.etiologies), P.etiology gardé = la première (compatibilité) */
  function migrateClin(P) {
    const C = P.clin, o = C.antecedents.other;
    if (o) { if (o.text || o.v === 'yes') C.antecedentsText = [C.antecedentsText, o.text].filter(Boolean).join('\n'); delete C.antecedents.other; }
    for (const [k, h] of [['neuroExam', 'examHistory'], ['comorbidities', 'comorbHistory']]) { C[h] = C[h] || []; if (C[k] && !C[h].length) { C[h].push({ id: uid('H'), date: '', text: C[k] }); C[k] = ''; } }
    C.freqHistory = C.freqHistory || []; if (P.frequency && !C.freqHistory.length) C.freqHistory.push({ id: uid('H'), date: '', text: P.frequency });
    C.pedigree = Object.assign({ persons: [], notes: '' }, C.pedigree || {});
    if (!Array.isArray(P.etiologies)) P.etiologies = P.etiology ? [{ k: P.etiology, status: 'confirmed' }] : [];
    syncPatient(P);
  }
  /** champs dérivés : fréquence actuelle (entrée la plus récente), étiologie principale */
  function syncPatient(P) {
    const C = P.clin || {}, F = (C.freqHistory || []).filter(f => f.text).slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))), cur = F[F.length - 1];
    P.frequency = cur ? cur.text : ''; P.frequencyDate = cur ? cur.date || '' : '';
    const E = P.etiologies || []; P.etiology = (E.find(e => e.status !== 'suspected') || E[0] || {}).k || '';
  }
  /** étiologies en clair : « structurelle + génétique (suspectée) » */
  /** v5.1 — âge aux premières crises : nombre + unité (jours, mois, ans ; défaut ans) → « 3 mois », « 1 jour », « 4 ans » ('' si vide) */
  const ONSET_UNIT = { d: ['jour', 'jours'], m: ['mois', 'mois'], y: ['an', 'ans'] };
  function onsetText(P) { const v = P && P.onsetAge; if (v === '' || v == null || isNaN(+v)) return ''; const u = ONSET_UNIT[P.onsetAgeUnit] || ONSET_UNIT.y, n = +v; return String(n).replace('.', ',') + ' ' + (n >= 2 ? u[1] : u[0]); }
  /** âge aux premières crises en années (calculs, cohorte) */
  function onsetYears(P) { const v = P && P.onsetAge; if (v === '' || v == null || isNaN(+v)) return null; return P.onsetAgeUnit === 'd' ? +v / 365.25 : P.onsetAgeUnit === 'm' ? +v / 12 : +v; }
  function etiologyText(P) { const E = P.etiologies || (P.etiology ? [{ k: P.etiology }] : []); const t = E.map(e => (V.etiology[e.k] || e.k) + (e.status === 'suspected' ? ' (suspectée)' : '')).join(' + '); return [t, P.etiologyDetail].filter(Boolean).join(' — '); }
  /** date partielle « 2019 », « 2019-05 » ou « 2019-05-12 » → texte */
  function fmtPartial(s) { if (!s) return ''; const m = String(s).match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/); if (!m) return String(s); return m[3] ? `${m[3]}/${m[2]}/${m[1]}` : m[2] ? `${m[2]}/${m[1]}` : m[1]; }
  /** âge (années) à une date, d'après l'année (et le mois) de naissance */
  function ageAt(P, date) {
    if (!P.birthYear) return null; const d = date ? new Date(String(date).length <= 10 ? String(date).slice(0, 10) + 'T12:00:00' : date) : new Date(); if (isNaN(d)) return null;
    let a = d.getFullYear() - (+P.birthYear); if (P.birthMonth && d.getMonth() + 1 < +P.birthMonth) a--; return a;
  }
  /** thermocoagulation : statut (les entrées antérieures au suivi des étapes sont des thermocoagulations réalisées) */
  /** planifiée (jaune) → validée par le chirurgien, une à une (vert) → réalisée (rouge) ; ou contre-indiquée, récusée avec
   *  sa raison (gris) */
  const THERMO_ORDER = ['planned', 'validated', 'done', 'rejected'];
  const THERMO_COL = { planned: [242, 193, 78], validated: [80, 190, 105], done: [225, 45, 55], rejected: [140, 146, 160] };
  const thermoStatusOf = t => !t ? 'done' : t.status === 'skipped' ? 'rejected' : THERMO_ORDER.includes(t.status) ? t.status : 'done';
  function addRoi(d, o) { const r = Object.assign({ id: uid('R'), kind: 'sphere', p: [0, 0, 0], r: 5, label: 'ROI', color: '#ff5ad1', visible: true, notes: '', date: today(), by: '' }, o || {}); (d.rois = d.rois || []).push(r); log(d, 'add', 'roi', r.id, r.label); return r; }
  const byId = (list, id) => list.find(x => x.id === id) || null;
  const sortDate = (a, b) => String(a.date || a.start || a.datetime || '').localeCompare(String(b.date || b.start || b.datetime || '')) || String(a.id).localeCompare(String(b.id));

  function addExploration(d, o) {
    o = o || {}; const kind = o.kind || 'phase1', rank = d.explorations.filter(e => e.kind === kind).length + 1;
    const ex = Object.assign({ id: uid('E'), kind, rank, label: kind === 'seeg' ? 'SEEG ' + rank : kind === 'phase1' ? (rank > 1 ? 'Phase 1 (' + rank + ')' : 'Phase 1') : 'Exploration ' + rank, start: today(), end: '', center: '', status: 'ongoing', notes: '', entryHypothesisIds: [], electrodes: [], stims: [], thermo: [], quant: [], ctImageId: null, eeg: {} }, o);
    if (kind === 'seeg') { ex.inter = Object.assign({ sampling: '', wake: '', sleep: '', physiological: '', slow: '', spikes: [], other: '' }, ex.inter || {}); ex.elecNotes = ex.elecNotes || {}; ex.report = ex.report || {}; }
    if (!o.label) ex.label = kind === 'seeg' ? 'SEEG ' + ex.rank : ex.label;
    d.explorations.push(ex); log(d, 'add', 'exploration', ex.id, ex.label); return ex;
  }
  function addSession(d, explorationId, o) {
    const ex = byId(d.explorations, explorationId); if (!ex) throw new Error('exploration inconnue');
    const n = d.sessions.filter(s => s.explorationId === explorationId).length + 1;
    const s = Object.assign({ id: uid('S'), explorationId, label: 'Séance ' + n, date: (o && o.date) || ex.start || today(), files: [], notes: '' }, o || {});
    d.sessions.push(s); log(d, 'add', 'session', s.id, ex.label + ' · ' + s.label); return s;
  }
  function addSeizure(d, sessionId, o) {
    const s = byId(d.sessions, sessionId); if (!s) throw new Error('séance inconnue');
    const n = seizuresOfExploration(d, s.explorationId).length + 1;
    const sz = Object.assign({ id: uid('C'), sessionId, label: 'Crise ' + n, datetime: s.date, habitual: '?', ilae: null, eeg_onset: null, seizure_end: null, vigilance: '', trigger: '', eegOnsetText: '', events: [], params: {}, views: null, notes: '', source: 'manual', created: now() }, o || {});
    d.seizures.push(sz); log(d, 'add', 'seizure', sz.id, sz.label); return sz;
  }
  /** v5 — titres « Crise n » renumérotés dans l'ordre chronologique (date et heure) de l'exploration ; les titres libres sont
   *  gardés. Renvoie le nombre de crises renommées. */
  function renumberSeizures(d, explorationId) {
    const list = seizuresOfExploration(d, explorationId); let n = 0, k = 0;
    for (const sz of list) { k++; if (/^Crise \d+$/.test(String(sz.label || '').trim()) && sz.label !== 'Crise ' + k) { sz.label = 'Crise ' + k; n++; } }
    return n;
  }
  function addImaging(d, o) { const im = Object.assign({ id: uid('I'), modality: 'T1', timepoint: 'preop', date: '', label: '', file: '', bytes: 0, dims: null, pixdim: null, ref: false, coreg: null, notes: '', added: now() }, o || {}); d.imaging.push(im); log(d, 'add', 'imaging', im.id, (V.modality[im.modality] || im.modality) + ' ' + (im.date || '')); return im; }
  function addLesion(d, o) { const l = Object.assign({ id: uid('L'), label: '', type: 'other', side: '', regions: [], source: 'manual', confidence: 'medium', imagingId: null, notes: '' }, o || {}); d.lesions.push(l); log(d, 'add', 'lesion', l.id, l.label || V.lesionType[l.type]); return l; }
  function addMeeting(d, o) { const m = Object.assign({ id: uid('M'), date: today(), kind: 'post_phase1', explorationId: null, participants: '', summary: '', concordance: { cells: {}, notes: '', columns: null }, hypothesisIds: [], decisionIds: [], galleryIds: [], conclusion: '', status: 'draft', created: now() }, o || {}); d.meetings.push(m); log(d, 'add', 'meeting', m.id, V.meeting[m.kind] + ' ' + m.date); return m; }
  function addProcedure(d, o) { const p = Object.assign({ id: uid('R'), type: 'resection', template: '', date: today(), side: '', target: '', regions: [], extent: {}, histology: '', complications: '', notes: '', decisionId: null }, o || {}); d.procedures.push(p); log(d, 'add', 'procedure', p.id, V.procedure[p.type]); return p; }
  function addOutcome(d, o) { const x = Object.assign({ id: uid('O'), date: today(), months: '', monthsManual: false, procedureId: null, engel: '', ilae: '', aeds: '', notes: '' }, o || {}); d.outcomes.push(x); log(d, 'add', 'outcome', x.id, 'Engel ' + (x.engel || '?')); return x; }
  function addExam(d, o) { const x = Object.assign({ id: uid('X'), kind: 'veeg', date: today(), title: '', text: '', conclusion: '', side: '', domains: {}, explorationId: null, imagingIds: [], attachments: [], added: now() }, o || {}); (d.exams = d.exams || []).push(x); log(d, 'add', 'exam', x.id, (V.exam[x.kind] || x.kind) + ' ' + (x.date || '')); return x; }
  /** capture d'écran d'un tracé (galerie) : fichier rangé dans gallery/<id>.<ext> */
  /** type d'élément d'une capture : choisi, sinon déduit (vidéo, examen d'imagerie lié, exploration SEEG, EEG par défaut) */
  function galleryModOf(d, g) {
    if (g.modality && V.galleryMod[g.modality]) return g.modality;
    if (/^video\//.test(g.mime || '')) return 'video';
    const x = g.examId && (d.exams || []).find(e => e.id === g.examId); if (x && ['mri', 'pet', 'spect', 'meg', 'fmri'].includes(x.kind)) return 'imaging'; if (x && ['neuropsy', 'psy', 'wada', 'other'].includes(x.kind)) return 'document';
    const ex = g.explorationId && d.explorations.find(e => e.id === g.explorationId); return ex && ex.kind === 'seeg' ? 'seeg' : 'eeg';
  }
  function addGalleryItem(d, o) { const g = Object.assign({ id: uid('G'), file: '', mime: 'image/png', w: 0, h: 0, explorationId: null, seizureId: null, kind: 'interictal', title: '', notes: '', vigilance: '', annotations: [], date: today(), added: now(), by: '' }, o || {}); (d.gallery = d.gallery || []).push(g); log(d, 'add', 'gallery', g.id, g.title || 'capture'); return g; }
  function addAed(d, o) { const a = Object.assign({ id: uid('A'), date: '', text: '', effect: '' }, o || {}); (d.aedHistory = d.aedHistory || []).push(a); return a; }
  /** procédure de référence d'un suivi : celle choisie, sinon la dernière procédure datée avant le suivi */
  function outcomeProcedure(d, o) {
    const p = o.procedureId ? byId(d.procedures, o.procedureId) : null; if (p) return p;
    return d.procedures.filter(x => x.date && (!o.date || String(x.date) <= String(o.date))).sort(sortDate).pop() || null;
  }
  /** recul d'un suivi (mois) calculé de la date de la procédure à celle du suivi ; une valeur saisie à la main prime */
  function outcomeMonthsAuto(d, o) { const p = outcomeProcedure(d, o); if (!p || !p.date || !o.date) return ''; const m = (Date.parse(o.date) - Date.parse(p.date)) / (30.4375 * 864e5); return isFinite(m) && m >= 0 ? Math.round(m * 10) / 10 : ''; }
  function outcomeMonths(d, o) { return o.monthsManual && o.months !== '' && o.months != null ? +o.months : outcomeMonthsAuto(d, o); }

  // ---------------------------------------------------------------- hypothèses versionnées et décisions
  /** nouvelle hypothèse (lignée neuve) ou nouvelle version d'une hypothèse existante (o.supersedes = id) */
  function addHypothesis(d, o) {
    o = o || {}; const prev = o.supersedes ? byId(d.hypotheses, o.supersedes) : null;
    const lineage = prev ? prev.lineage : uid('H'), version = prev ? Math.max(...d.hypotheses.filter(h => h.lineage === lineage).map(h => h.version)) + 1 : 1;
    const H = Object.assign({ id: uid('h'), lineage, version, supersedes: prev ? prev.id : null, meetingId: null, title: '', side: '', ez: [], prop: [], confidence: 'medium', status: 'proposed', argsFor: [], argsAgainst: [], source: { kind: 'manual' }, notes: '', created: now() },
      prev ? { title: prev.title, side: prev.side, ez: prev.ez.slice(), prop: prev.prop.slice(), confidence: prev.confidence, argsFor: clone(prev.argsFor), argsAgainst: clone(prev.argsAgainst), source: clone(prev.source), notes: prev.notes } : {}, o, { lineage, version, supersedes: prev ? prev.id : null });
    if (prev && prev.status !== 'refuted' && prev.status !== 'abandoned') prev.status = 'revised';
    d.hypotheses.push(H); log(d, prev ? 'revise' : 'add', 'hypothesis', H.id, (H.title || 'hypothèse') + ' v' + H.version); return H;
  }
  /** dernière version de chaque lignée (ou toutes les versions si all) */
  function hypothesisLineages(d) {
    const by = new Map(); for (const h of d.hypotheses) { if (!by.has(h.lineage)) by.set(h.lineage, []); by.get(h.lineage).push(h); }
    return [...by.values()].map(v => v.sort((a, b) => a.version - b.version)).sort((a, b) => String(a[0].created).localeCompare(String(b[0].created)));
  }
  const latestHypotheses = d => hypothesisLineages(d).map(v => v[v.length - 1]);
  function addDecision(d, o) { const x = Object.assign({ id: uid('D'), meetingId: null, type: 'seeg', text: '', hypothesisIds: [], targets: [], status: 'proposed', date: today(), createdExplorationId: null, procedureId: null }, o || {}); d.decisions.push(x); const m = x.meetingId && byId(d.meetings, x.meetingId); if (m && !m.decisionIds.includes(x.id)) m.decisionIds.push(x.id); log(d, 'add', 'decision', x.id, V.decision[x.type]); return x; }

  function remove(d, kind, id) {
    const key = { exploration: 'explorations', session: 'sessions', seizure: 'seizures', imaging: 'imaging', lesion: 'lesions', meeting: 'meetings', hypothesis: 'hypotheses', decision: 'decisions', procedure: 'procedures', outcome: 'outcomes', exam: 'exams', gallery: 'gallery', aed: 'aedHistory', roi: 'rois' }[kind];
    if (!key) return;
    const it = byId(d[key], id); if (!it) return;
    if (kind === 'exploration') { for (const s of d.sessions.filter(s => s.explorationId === id)) remove(d, 'session', s.id); for (const g of d.gallery || []) if (g.explorationId === id) g.explorationId = null; for (const x of d.exams || []) if (x.explorationId === id) x.explorationId = null; }
    if (kind === 'session') { const gone = new Set(d.seizures.filter(z => z.sessionId === id).map(z => z.id)); for (const g of d.gallery || []) if (gone.has(g.seizureId)) g.seizureId = null; d.seizures = d.seizures.filter(z => z.sessionId !== id); }
    if (kind === 'seizure') for (const g of d.gallery || []) if (g.seizureId === id) g.seizureId = null;
    if (kind === 'gallery') for (const m of d.meetings) m.galleryIds = (m.galleryIds || []).filter(x => x !== id);
    if (kind === 'imaging') for (const x of d.exams || []) x.imagingIds = (x.imagingIds || []).filter(i => i !== id);
    if (kind === 'exam') for (const g of d.gallery || []) if (g.examId === id) g.examId = null;
    if (kind === 'meeting') { for (const x of d.decisions) if (x.meetingId === id) x.meetingId = null; for (const h of d.hypotheses) if (h.meetingId === id) h.meetingId = null; }
    if (kind === 'decision') for (const m of d.meetings) m.decisionIds = m.decisionIds.filter(x => x !== id);
    d[key] = d[key].filter(x => x.id !== id); log(d, 'remove', kind, id, it.label || it.title || '');
  }

  // ---------------------------------------------------------------- schémas d'implantation
  /** schémas d'implantation du dossier, un par exploration qui en porte un : phase 1 = schéma proposé ; SEEG = implantation
   *  prévue, puis réelle dès qu'une électrode est localisée sur le scanner post-implantation (spec.real) */
  function implantations(d) {
    return explorationsSorted(d).filter(ex => (ex.electrodes || []).length).map(ex => {
      const E = ex.electrodes, nReal = E.filter(e => e.real).length;
      return { ex, n: E.length, nReal, nPlan: E.filter(e => e.target || (e.plan && e.plan.tip)).length, status: ex.kind === 'seeg' ? (nReal ? 'real' : 'planned') : 'proposed', source: (ex.implant && ex.implant.source) || null, updated: (ex.implant && ex.implant.updated) || '', names: E.map(e => e.name) };
    });
  }
  // ---------------------------------------------------------------- projet d'implantation / implantation réelle
  /** implantation de référence d'une SEEG : le projet (trajectoires prévues) tant que l'implantation réelle (scanner) n'est
   *  pas adoptée ; à l'adoption, le projet est figé dans ex.implantPlan et seules les électrodes localisées restent */
  function implantState(ex) {
    const I = ex.implant || {}, E = ex.electrodes || [], real = E.filter(e => e.real), plan = I.adopted && ex.implantPlan ? ex.implantPlan.electrodes : E.filter(e => e.target || e.plan);
    return { adopted: I.adopted || null, nReal: real.length, nChecked: real.filter(e => e.real.checked).length, nPlan: plan.length, plan, real, planOnly: I.adopted ? [] : E.filter(e => !e.real) };
  }
  // ---------------------------------------------------------------- projets d'implantation d'une SEEG (v4.7)
  /** Une SEEG peut avoir plusieurs projets d'implantation (variantes discutées) : ex.electrodes porte le projet actif
   *  (ex.project = {id, name, date}), les autres sont rangés dans ex.projects ({id, name, date, electrodes, source}).
   *  Dès qu'une électrode est localisée sur le scanner, le projet actif est celui qui a été posé : plus de bascule
   *  (projectLocked) ; à l'adoption de l'implantation réelle, il est figé dans ex.implantPlan (avec son nom). */
  const projectLocked = ex => !!((ex.implant && ex.implant.adopted) || (ex.electrodes || []).some(e => e.real));
  function ensureProject(ex) { if (!Array.isArray(ex.projects)) ex.projects = []; if (!ex.project) ex.project = { id: uid('P'), name: 'Projet 1', date: (ex.implant && ex.implant.updated) || ex.added || now() }; return ex.project; }
  function projectsOf(ex) {
    const a = ensureProject(ex);
    return [Object.assign({ active: true, n: (ex.electrodes || []).length, source: (ex.implant && ex.implant.source) || null }, a)]
      .concat(ex.projects.map(p => ({ id: p.id, name: p.name, date: p.date, n: (p.electrodes || []).length, source: p.source || null, active: false })))
      .sort((x, y) => String(x.date).localeCompare(String(y.date)) || String(x.name).localeCompare(String(y.name), 'fr', { numeric: true }));
  }
  const stashProject = ex => ({ id: ex.project.id, name: ex.project.name, date: ex.project.date, electrodes: clone(ex.electrodes || []), source: (ex.implant && ex.implant.source) || null });
  const loadProject = (ex, p) => { ex.electrodes = clone(p.electrodes || []); ex.project = { id: p.id, name: p.name, date: p.date }; ex.implant = Object.assign({}, ex.implant, { source: p.source || null, updated: now() }); };
  function switchProject(d, ex, id) {
    ensureProject(ex); if (ex.project.id === id || projectLocked(ex)) return false;
    const k = ex.projects.findIndex(p => p.id === id); if (k < 0) return false;
    const nx = ex.projects[k]; ex.projects[k] = stashProject(ex); loadProject(ex, nx);
    log(d, 'edit', 'exploration', ex.id, `${ex.label} : projet d’implantation « ${nx.name} »`); return true;
  }
  /** nouveau projet (vide, ou copie du projet actif) devenant le projet actif */
  function addProject(d, ex, o) {
    o = o || {}; ensureProject(ex); if (projectLocked(ex)) return null;
    const from = ex.project.name, used = new Set(projectsOf(ex).map(p => p.name)); let k = ex.projects.length + 2, name = String(o.name || '').trim();
    if (!name) { while (used.has('Projet ' + k)) k++; name = 'Projet ' + k; }
    const els = o.copy ? clone(ex.electrodes || []).map(e => Object.assign(e, { id: uid('el') })) : [];
    ex.projects.push(stashProject(ex)); ex.electrodes = els; ex.project = { id: uid('P'), name, date: now() };
    ex.implant = Object.assign({}, ex.implant, { source: o.copy ? { kind: 'copy', label: from } : null, updated: now() });
    log(d, 'add', 'exploration', ex.id, `${ex.label} : projet d’implantation « ${name} »${o.copy ? ' (copie de « ' + from + ' »)' : ''}`); return ex.project;
  }
  function renameProject(d, ex, id, name) {
    ensureProject(ex); name = String(name || '').trim(); if (!name) return false;
    const p = ex.project.id === id ? ex.project : ex.projects.find(x => x.id === id); if (!p) return false;
    const old = p.name; p.name = name; if (ex.project.id === id && ex.implantPlan && ex.implantPlan.name === old) ex.implantPlan.name = name;
    log(d, 'edit', 'exploration', ex.id, `${ex.label} : projet « ${old} » renommé « ${name} »`); return true;
  }
  /** supprime un projet ; le projet actif est remplacé par le plus récent des autres (ou un projet vide) */
  function removeProject(d, ex, id) {
    ensureProject(ex); let name;
    if (ex.project.id === id) {
      if (projectLocked(ex)) return false; name = ex.project.name;
      const nx = ex.projects.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
      if (nx) { ex.projects = ex.projects.filter(p => p !== nx); loadProject(ex, nx); } else { ex.electrodes = []; ex.project = { id: uid('P'), name: 'Projet 1', date: now() }; ex.implant = Object.assign({}, ex.implant, { source: null, updated: now() }); }
    } else { const p = ex.projects.find(x => x.id === id); if (!p) return false; name = p.name; ex.projects = ex.projects.filter(x => x !== p); }
    if (ex.implant && Array.isArray(ex.implant.layers)) ex.implant.layers = ex.implant.layers.filter(k => k !== 'pj:' + id);
    log(d, 'remove', 'exploration', ex.id, `${ex.label} : projet d’implantation « ${name} » supprimé`); return true;
  }
  const projectElectrodes = (ex, id) => { ensureProject(ex); return ex.project.id === id ? (ex.electrodes || []) : ((ex.projects.find(p => p.id === id) || {}).electrodes || []); };
  function adoptRealImplant(d, ex, by) {
    const E = ex.electrodes || []; if (!E.some(e => e.real)) return null;
    ex.implantPlan = { date: now(), by: by || '', name: ex.project ? ex.project.name : '', electrodes: E.filter(e => e.target || e.plan).map(e => { const c = clone(e); delete c.real; return c; }) };
    const removed = E.filter(e => !e.real); ex.electrodes = E.filter(e => e.real);
    ex.implant = Object.assign(ex.implant || {}, { adopted: now(), by: by || '', showPlan: false });
    log(d, 'edit', 'exploration', ex.id, `implantation réelle adoptée (${ex.electrodes.length} électrodes ; projet conservé : ${ex.implantPlan.electrodes.length}${removed.length ? ', ' + removed.length + ' non posée(s) retirée(s)' : ''})`);
    return { kept: ex.electrodes.length, removed };
  }
  function revertToPlan(d, ex) {
    const P = ex.implantPlan; if (!P) { if (ex.implant) ex.implant.adopted = null; return; }
    const cur = new Map((ex.electrodes || []).map(e => [e.id, e])), out = [];
    for (const p of P.electrodes) { const c = cur.get(p.id); out.push(c ? Object.assign(clone(p), { real: c.real, name: c.name }) : clone(p)); cur.delete(p.id); }
    for (const c of cur.values()) out.push(c);   // électrodes hors projet (reconstruites seulement)
    ex.electrodes = out; ex.implantPlan = null; ex.implant = Object.assign(ex.implant || {}, { adopted: null });
    log(d, 'edit', 'exploration', ex.id, 'retour au projet d’implantation');
  }
  const implantLabel = (d, ex) => { const it = implantations(d).find(x => x.ex === ex); return it ? `${ex.label} · ${V.implantStatus[it.status]} (${it.status === 'real' ? it.nReal + '/' + it.n : it.n} électrode${it.n > 1 ? 's' : ''})` : ex.label; };
  /** copie le schéma de fromEx dans toEx : mode 'replace' (défaut) ou 'merge' (ajoute les électrodes absentes, par nom).
   *  Les électrodes copiées redeviennent prévues (position sur le gabarit) et gardent leur origine ; une électrode
   *  localisée sur le scanner sans trajectoire prévue (pas de cible sur le gabarit) n'est pas reprise. */
  function importImplantation(d, fromEx, toEx, mode, source) {
    const have = new Set((toEx.electrodes || []).map(e => e.name)), out = { added: 0, skipped: 0, noTarget: 0 };
    const list = [];
    for (const e0 of fromEx.electrodes || []) {
      if (!e0.target && !(e0.plan && e0.plan.tip)) { out.noTarget++; continue; }   // trajectoire prévue : sur le gabarit (cible) ou sur le patient (plan)
      if (mode === 'merge' && have.has(e0.name)) { out.skipped++; continue; }
      const e = clone(e0); delete e.real; e.origin = e0.origin || { explorationId: fromEx.id, label: fromEx.label, id: e0.id, name: e0.name }; e.id = uid('el'); e.auto = false; list.push(e); out.added++;
    }
    toEx.electrodes = mode === 'merge' ? (toEx.electrodes || []).concat(list) : list;
    toEx.implant = Object.assign({}, toEx.implant, { source: source || { kind: 'import', explorationId: fromEx.id, label: fromEx.label }, updated: now() });
    log(d, 'edit', 'exploration', toEx.id, `${toEx.label} : schéma repris de ${fromEx.label} (${out.added} électrodes)`);
    return out;
  }
  /** comparaison de deux schémas (par origine puis par nom, sans tenir compte du prime typographique) */
  function compareImplantations(a, b) {
    const key = e => String(e.name || '').replace(/['’‘´`]/g, '’').toUpperCase();
    const A = new Map((a || []).map(e => [key(e), e])), Bm = new Map((b || []).map(e => [key(e), e]));
    const common = [...A.keys()].filter(k => Bm.has(k)), onlyA = [...A.keys()].filter(k => !Bm.has(k)), onlyB = [...Bm.keys()].filter(k => !A.has(k));
    return { common: common.map(k => Bm.get(k).name), onlyA: onlyA.map(k => A.get(k).name), onlyB: onlyB.map(k => Bm.get(k).name) };
  }

  // ---------------------------------------------------------------- requêtes
  /** explorations dans l'ordre du parcours : date de début ; une exploration pas encore datée (SEEG programmée) vient juste
   *  après le staff qui l'a décidée, sinon en dernier — jamais avant les explorations datées */
  const explorationsSorted = d => {
    const key = ex => { if (ex.start) return String(ex.start); const dec = (d.decisions || []).find(x => x.createdExplorationId === ex.id), m = dec && (d.meetings || []).find(y => y.id === dec.meetingId); return m && m.date ? String(m.date) + '~' : '9999'; };
    return d.explorations.slice().sort((a, b) => key(a).localeCompare(key(b)) || String(a.id).localeCompare(String(b.id)));
  };
  const sessionsOf = (d, explorationId) => d.sessions.filter(s => s.explorationId === explorationId).sort(sortDate);
  const seizuresOfSession = (d, sessionId) => d.seizures.filter(z => z.sessionId === sessionId).sort((a, b) => String(a.datetime || '').localeCompare(String(b.datetime || '')) || String(a.created || a.id).localeCompare(String(b.created || b.id)));
  const seizuresOfExploration = (d, explorationId) => sessionsOf(d, explorationId).flatMap(s => seizuresOfSession(d, s.id));
  function contextOf(d, seizureId) {
    const sz = byId(d.seizures, seizureId); if (!sz) return null;
    const ses = byId(d.sessions, sz.sessionId), ex = ses ? byId(d.explorations, ses.explorationId) : null;
    return { seizure: sz, session: ses, exploration: ex };
  }
  /** toutes les crises, dans l'ordre du parcours */
  const allSeizures = d => explorationsSorted(d).flatMap(ex => seizuresOfExploration(d, ex.id));
  const lesionRegions = d => [...new Set(d.lesions.flatMap(l => l.regions || []))];
  const refImaging = d => d.imaging.find(i => i.ref) || d.imaging.find(i => i.modality === 'T1' && i.timepoint === 'preop') || d.imaging.find(i => i.modality === 'T1') || null;

  /** classification ILAE 2025 déduite de la séquence (capture une fois) ; les valeurs saisies à la main priment */
  function deriveIlae(sz, db) {
    const evs = (sz.events || []).slice().sort((a, b) => a.t - b.t), signs = evs.map(e => db && db.signById ? db.signById.get(e.sign_id) : null).filter(Boolean);
    const ids = new Set(evs.map(e => e.sign_id)), ictal = signs.filter(s => s.category !== 'postictal');
    const auto = {
      onset: ids.has('fbtcs') && ictal.length <= 1 ? 'unknown' : ictal.length ? 'focal' : 'unknown',
      consciousness: ids.has('loss_of_awareness') || ids.has('behavioral_arrest') || ids.has('confusion') ? 'impaired' : ictal.some(s => s.subjective) ? 'preserved' : 'unknown',
      first: ictal[0] ? (ictal[0].subjective ? 'aura' : /^motor/.test(ictal[0].category) ? 'motor' : 'nonmotor') : '',
      fbtc: ids.has('fbtcs'),
    };
    return Object.assign(auto, sz.ilae || {});
  }
  function ilaeText(c) {
    if (!c) return '';
    const parts = [V.ilaeOnset[c.onset] || ''];
    if (c.onset === 'focal' && c.consciousness && c.consciousness !== 'unknown') parts.push(V.consciousness[c.consciousness]);
    if (c.fbtc) parts.push('évoluant vers une crise tonico-clonique bilatérale');
    return parts.filter(Boolean).join(', ');
  }

  /** étape du parcours (pour la liste des patients) */
  function stage(d) {
    const ex = explorationsSorted(d), last = ex[ex.length - 1], proc = d.procedures.slice().sort(sortDate).pop(), out = d.outcomes.slice().sort(sortDate).pop();
    const meet = d.meetings.slice().sort(sortDate).pop();
    if (out) return { key: 'followup', text: 'suivi · Engel ' + (out.engel || '?') };
    if (proc) return { key: 'operated', text: V.procedure[proc.type] + ' ' + (proc.date || '') };
    const pending = d.decisions.filter(x => x.status === 'proposed' || x.status === 'planned').pop();
    if (meet && last && String(meet.date) >= String(last.start || '')) return { key: 'decided', text: pending ? 'décision : ' + V.decision[pending.type] : 'staff ' + meet.date };
    if (last) return { key: last.kind, text: last.label + (last.status === 'done' ? ' · à discuter en staff' : ' · ' + V.explorationStatus[last.status || 'ongoing']) };
    return { key: 'new', text: 'nouveau dossier' };
  }
  function summary(d) {
    return { id: d.id, pseudo: d.patient.pseudo, updated: d.updated, revision: d.revision, stage: stage(d), nExpl: d.explorations.length, nSeizures: d.seizures.length, nImaging: d.imaging.length, anatomy: !!(d.anatomy && d.anatomy.status === 'done') };
  }

  // ---------------------------------------------------------------- journal
  function log(d, action, kind, id, text, user) {
    const j = d.journal || (d.journal = []), t = now(), last = j[j.length - 1];
    // les modifications successives d'un même objet sont regroupées (10 min)
    if (action === 'edit' && last && last.action === 'edit' && last.kind === kind && last.id === id && Date.parse(t) - Date.parse(last.t) < 600000) { last.t = t; last.n = (last.n || 1) + 1; return; }
    j.push({ t, user: user || (SV.Store && SV.Store.user) || '', action, kind, id, text: text || '' });
    if (j.length > 2000) j.splice(0, j.length - 2000);
  }

  // ---------------------------------------------------------------- espace de travail « crise » (format des cas v1)
  /** contexte de travail : { seizureId } ou { explorationId } (implantation, stimulations sans crise encore saisie) */
  function resolveCtx(d, ctx) {
    if (ctx && ctx.seizureId) { const c = contextOf(d, ctx.seizureId); if (c) return c; }
    const ex = ctx && ctx.explorationId ? byId(d.explorations, ctx.explorationId) : explorationsSorted(d).pop();
    return ex ? { seizure: null, session: null, exploration: ex } : null;
  }
  const snap = (d, sz, ex) => JSON.stringify([sz ? [sz.events, sz.eeg_onset, sz.seizure_end, sz.vigilance, sz.label, sz.params] : null, ex.electrodes, ex.stims, ex.thermo, ex.quant, d.patient.dominant, lesionRegions(d)]);
  const _snaps = new Map();   // dernier état connu par contexte (les modifications en place des tableaux restent détectées)
  const _lesBase = new Map(); // lésions transmises à l'espace de travail (pour n'appliquer que ses modifications)
  const snapKey = (d, sz, ex) => d.id + ':' + ex.id + ':' + (sz ? sz.id : '');
  function toWorkspace(d, ctx) {
    if (typeof ctx === 'string') ctx = { seizureId: ctx };
    const c = resolveCtx(d, ctx); if (!c) return null; const { seizure: sz, exploration: ex } = c;
    _snaps.set(snapKey(d, sz, ex), snap(d, sz, ex)); _lesBase.set(snapKey(d, sz, ex), lesionRegions(d));
    return {
      version: 1, name: sz ? sz.label : '',
      patient: { dominant: d.patient.dominant === 'R' ? 'R' : 'L', eeg_onset: sz && sz.eeg_onset != null ? sz.eeg_onset : null, seizure_end: sz && sz.seizure_end != null ? sz.seizure_end : null, state: sz ? sz.vigilance || '' : '', lesion: lesionRegions(d) },
      events: sz ? sz.events : [], params: sz ? (sz.params || (sz.params = {})) : (ex.params || (ex.params = {})), views: sz ? sz.views || null : ex.views || null,
      electrodes: ex.electrodes, stims: ex.stims, thermo: ex.thermo, quant: ex.quant,
    };
  }
  /** réécrit l'état de l'espace de travail dans le dossier ; renvoie { changed, ctx } (ctx mis à jour si une crise a été
   *  créée : premiers signes saisis dans une exploration sans crise) */
  function fromWorkspace(d, ctx, st) {
    if (typeof ctx === 'string') ctx = { seizureId: ctx };
    const c = resolveCtx(d, ctx); if (!c || !st) return { changed: false, ctx };
    let { seizure: sz, exploration: ex } = c; const before = _snaps.get(snapKey(d, sz, ex));
    if (!sz && st.events && st.events.length) {
      const ses = sessionsOf(d, ex.id).pop() || addSession(d, ex.id, { date: today() });
      sz = addSeizure(d, ses.id, { datetime: ses.date }); ctx = { seizureId: sz.id, explorationId: ex.id };
    }
    if (sz) {
      sz.events = st.events || []; sz.params = st.params || {}; sz.views = st.views || sz.views || null;
      sz.eeg_onset = st.patient.eeg_onset == null ? null : st.patient.eeg_onset; sz.seizure_end = st.patient.seizure_end == null ? null : st.patient.seizure_end; sz.vigilance = st.patient.state || '';
      if (st.name && st.name.trim()) sz.label = st.name.trim();
    } else { ex.params = st.params || {}; ex.views = st.views || null; }
    if (JSON.stringify(ex.electrodes || []) !== JSON.stringify(st.electrodes || [])) ex.implant = Object.assign({}, ex.implant, { updated: now() });
    ex.electrodes = st.electrodes || []; ex.stims = st.stims || []; ex.thermo = st.thermo || []; ex.quant = st.quant || [];
    if (st.patient.dominant) d.patient.dominant = st.patient.dominant;
    // lésions marquées sur l'atlas dans l'onglet Origine : seules les additions / retraits faits dans l'espace de travail
    // (par rapport à la liste reçue à l'ouverture) sont appliqués — les lésions saisies ailleurs ne sont pas effacées
    const k0 = snapKey(d, c.seizure, ex), base = new Set(_lesBase.get(k0) || []), want = new Set(st.patient.lesion || []);
    const added = [...want].filter(r => !base.has(r)), removed = [...base].filter(r => !want.has(r));
    if (removed.length) for (const l of d.lesions) l.regions = (l.regions || []).filter(r => !removed.includes(r));
    const have = new Set(lesionRegions(d)), add2 = added.filter(r => !have.has(r));
    if (add2.length) { let l = d.lesions.find(x => x.source === 'atlas'); if (!l) l = addLesion(d, { label: 'Lésion marquée sur l’atlas', source: 'atlas', type: 'other' }); l.regions.push(...add2); }
    d.lesions = d.lesions.filter(l => l.regions.length || l.source !== 'atlas');
    st.patient.lesion = lesionRegions(d); _lesBase.set(snapKey(d, sz, ex), st.patient.lesion.slice());
    const after = snap(d, sz, ex), changed = before !== after; _snaps.set(snapKey(d, sz, ex), after);
    if (changed) log(d, 'edit', sz ? 'seizure' : 'exploration', sz ? sz.id : ex.id, sz ? sz.label : ex.label);
    return { changed, ctx };
  }

  /** cas EpiScope v1 (une crise, .json) → nouveau dossier, ou crise ajoutée à un dossier existant (target) */
  function migrateCase(c, target) {
    const isSeeg = (c.electrodes && c.electrodes.length && ((c.stims && c.stims.length) || (c.thermo && c.thermo.length) || (c.quant && c.quant.length)));
    const d = target || newDossier({ pseudo: (c.name || 'Cas importé').replace(/\s+—\s+.*$/, '').slice(0, 60), dominant: (c.patient && c.patient.dominant) || 'L' });
    let ex = target ? d.explorations.filter(e => e.kind === (isSeeg ? 'seeg' : 'phase1')).pop() : null;
    if (!ex) ex = addExploration(d, { kind: isSeeg ? 'seeg' : 'phase1', start: (c.saved || '').slice(0, 10) || today(), status: 'done' });
    if (c.electrodes && c.electrodes.length && !ex.electrodes.length) ex.electrodes = c.electrodes;
    for (const k of ['stims', 'thermo', 'quant']) if (c[k] && c[k].length) ex[k] = ex[k].concat(c[k]);
    const ses = sessionsOf(d, ex.id)[0] || addSession(d, ex.id, { date: ex.start });
    const sz = addSeizure(d, ses.id, { label: c.name || undefined, events: c.events || [], params: c.params || {}, views: c.views || null, eeg_onset: c.patient ? c.patient.eeg_onset : null, seizure_end: c.patient ? c.patient.seizure_end : null, vigilance: c.patient ? c.patient.state || '' : '', notes: c.notes || '', source: 'import v1' });
    if (c.patient && c.patient.lesion && c.patient.lesion.length) addLesion(d, { label: 'Lésion marquée sur l’atlas', source: 'atlas', regions: c.patient.lesion.slice() });
    return { dossier: d, seizure: sz };
  }

  // ---------------------------------------------------------------- dossier portable
  /** fichiers d'un dossier à mettre dans une archive ; light = sans les images d'origine (imaging/) */
  function bundlePolicy(path, light) { if (/^(\.lock|dossier\.conflict)/.test(path)) return false; if (light && /^(imaging|ieeg|derivatives\/esi)\//.test(path)) return false; if (light && /^gallery\/[^/]+\.(mp4|webm|mov|m4v|ogv|mkv|avi|wmv|mpg|mpeg|flv|3gp|mts|m2ts|ts)$/i.test(path)) return false; return true; }   // archive légère : sans les images d'origine, les tracés SEEG ni les vidéos (vignettes gardées)

  SV.Store = { onsetText, onsetYears, ONSET_UNIT, renumberSeizures, SCHEMA, V, uid, now, today, clone, newDossier, normalize, newClin, migrateClin, syncPatient, etiologyText, fmtPartial, ageAt, addRoi, byId, addExploration, addSession, addSeizure, addImaging, addLesion, addMeeting, addProcedure, addOutcome, addExam, addGalleryItem, galleryModOf, addAed, outcomeProcedure, outcomeMonthsAuto, outcomeMonths, addHypothesis, hypothesisLineages, latestHypotheses, addDecision, remove, implantations, implantLabel, implantState, adoptRealImplant,
    projectLocked, ensureProject, projectsOf, switchProject, addProject, renameProject, removeProject, projectElectrodes, revertToPlan, THERMO_ORDER, THERMO_COL, thermoStatusOf, importImplantation, compareImplantations, explorationsSorted, sessionsOf, seizuresOfSession, seizuresOfExploration, allSeizures, contextOf, lesionRegions, refImaging, deriveIlae, ilaeText, stage, summary, log, resolveCtx, toWorkspace, fromWorkspace, migrateCase, bundlePolicy, user: '' };
});
