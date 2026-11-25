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
  const SCHEMA = 3;   // v2.0.0 : plus de séances (crises rattachées à leur exploration, ou au dossier : crises rapportées)
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
    /** v2.0.0 : contexte d'une exploration « autre » (préréglages du menu + Étape) */
    explorationContext: { '': 'autre exploration', ambu: 'EEG ambulatoire', postop: 'post-opératoire' },
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
    /** systèmes anatomo-fonctionnels (lignes du tableau de concordance du staff, localisation d'un bilan) */
    systems: { mesial_temporal: 'temporal mésial', lateral_temporal: 'temporal latéral', basal_temporal: 'temporal basal', insulo_opercular: 'insulo-operculaire', orbitofrontal: 'orbitofrontal', prefrontal_mesial: 'préfrontal mésial / cingulaire ant.', prefrontal_lateral: 'préfrontal latéral', premotor: 'prémoteur / AMS', central: 'central (rolandique)', parietal_lateral: 'pariétal latéral', posterior_medial: 'pariétal médian / cingulaire post.', occipital: 'occipital' },
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
    /** v2.1.0 — histologie en vocabulaire fermé (plusieurs codes possibles : double pathologie), texte libre à côté.
     *  FCD : classification ILAE 2022 (Najm et al., Epilepsia 2022 ; types I–III de 2011, mMCD, MOGHE) ; sclérose
     *  hippocampique : ILAE 2013 (Blümcke et al.) ; tumeurs épileptogènes (LEAT) : OMS 2021 (CNS5). Codes stables, libellés
     *  traduisibles : une requête porte sur le code. */
    histology: [
      ['fcd', 'dysplasie corticale focale (ILAE 2022)', [['fcd1a', 'FCD Ia'], ['fcd1b', 'FCD Ib'], ['fcd1c', 'FCD Ic'], ['fcd2a', 'FCD IIa'], ['fcd2b', 'FCD IIb'], ['fcd3a', 'FCD IIIa (avec sclérose hippocampique)'], ['fcd3b', 'FCD IIIb (avec tumeur)'], ['fcd3c', 'FCD IIIc (avec malformation vasculaire)'], ['fcd3d', 'FCD IIId (avec lésion acquise précoce)'], ['fcd3ns', 'FCD III sans précision'], ['fcdns', 'FCD sans précision'], ['mmcd', 'mMCD (malformation corticale légère)'], ['moghe', 'MOGHE (malformation légère avec hyperplasie oligodendrogliale)']]],
      ['hs', 'sclérose hippocampique (ILAE 2013)', [['hs1', 'HS ILAE type 1'], ['hs2', 'HS ILAE type 2'], ['hs3', 'HS ILAE type 3'], ['hsns', 'HS sans précision du type'], ['gliosisOnly', 'gliose seule, sans sclérose']]],
      ['leat', 'tumeur épileptogène (LEAT, OMS 2021)', [['gg', 'gangliogliome'], ['dnet', 'tumeur neuroépithéliale dysembryoplasique (DNET)'], ['ag', 'gliome angiocentrique'], ['plnty', 'PLNTY'], ['mvnt', 'tumeur neuronale multinodulaire et vacuolisante (MVNT)'], ['pxa', 'xanthoastrocytome pléomorphe'], ['myb', 'astrocytome diffus MYB / MYBL1 (dont isomorphe)'], ['pgnt', 'tumeur glioneuronale papillaire'], ['leatns', 'autre LEAT']]],
      ['other', 'autres', [['cavernoma', 'cavernome'], ['avm', 'malformation artério-veineuse'], ['tuber', 'tuber cortical (sclérose tubéreuse)'], ['hh', 'hamartome hypothalamique'], ['pmg', 'polymicrogyrie'], ['heterotopia', 'hétérotopie'], ['scar', 'cicatrice gliale (traumatique, vasculaire, infectieuse)'], ['rasmussen', 'encéphalite de Rasmussen'], ['encephalitis', 'autre encéphalite'], ['sws', 'angiomatose de Sturge-Weber'], ['tumor', 'autre tumeur'], ['normal', 'pas de lésion identifiée'], ['nonContributive', 'prélèvement non contributif']]],
    ],
    /** v2.1.0 — comorbidités développementales (pédiatrie), à côté du texte libre : '' = non renseigné, 'no', 'yes' ;
     *  déficience intellectuelle : sévérité DSM-5 au choix */
    devComorb: [['id', 'déficience intellectuelle', 'DI'], ['asd', 'trouble du spectre de l’autisme', 'TSA'], ['spasms', 'spasmes infantiles (antécédent)', 'spasmes'], ['language', 'retard de langage', 'langage'], ['behavior', 'troubles graves du comportement', 'comportement']],
    devValue: { '': 'non renseigné', no: 'non', yes: 'oui' },
    idSeverity: { yes: 'oui, sévérité non précisée', mild: 'légère', moderate: 'moyenne', severe: 'sévère', profound: 'profonde' },
    /** v2.1.0 — statut final du parcours, explicite (une requête ne le déduit plus des décisions) */
    pathwayStatus: { '': 'non renseigné', evaluation: 'en attente / en cours d’évaluation', operated: 'opéré', declined: 'récusé', lost: 'perdu de vue' },
    declineReason: { noEz: 'pas d’hypothèse localisatrice', multifocal: 'épilepsie multifocale ou bilatérale', eloquent: 'zone épileptogène en région fonctionnelle', risk: 'rapport bénéfice / risque défavorable', comorbid: 'comorbidité ou contre-indication', refusal: 'refus du patient ou de la famille', improved: 'amélioration ou rémission', other: 'autre motif' },
    /** v2.1.0 — contacts dans la résection : origine de l'appartenance */
    resectHow: { manual: 'à la main', cavity: 'cavité segmentée' },
    /** aide-mémoire : classification ILAE du devenir (Wieser et al. 2001), en jours de crise par an */
    ilaeMemo: [['1', 'libre de crises, sans aura'], ['2', 'auras seulement, aucune autre crise'], ['3', '1 à 3 jours de crise par an, ± auras'], ['4', '4 jours de crise par an jusqu’à 50 % de réduction des jours de crise initiaux, ± auras'], ['5', 'moins de 50 % de réduction à 100 % d’augmentation des jours de crise initiaux, ± auras'], ['6', 'plus de 100 % d’augmentation des jours de crise initiaux, ± auras']],
  };

  // ---------------------------------------------------------------- création
  function newDossier(p) {
    const d = {
      format: 'episcope-dossier', schema: SCHEMA, minReader: '2.0.0', id: uid('P'), created: now(), updated: now(), revision: 0,
      patient: Object.assign({ pseudo: '', sex: '', birthYear: '', birthMonth: '', handedness: '', dominant: 'L', dominanceMethod: '', onsetAge: '', etiology: '', etiologies: [], etiologyDetail: '', mri: '', frequency: '', aeds: '', history: '', notes: '', clin: newClin(), dev: newDev() }, p || {}),
      explorations: [], seizures: [], imaging: [], anatomy: null, lesions: [], meetings: [], hypotheses: [], decisions: [], procedures: [], outcomes: [], exams: [], gallery: [], aedHistory: [], rois: [], sliceViews: {},
      settings: { anatomy: 'template' }, ui: {}, journal: [], trash: [], results: [], subject: null, identity: newIdentity(), staffNotes: [], syncLinks: [], pathway: newPathway(),
    };
    return d;
  }
  // ---------------------------------------------------------------- identité et code du sujet (v1.1.0)
  /** zone d'identité : seul endroit des données identifiantes (jamais dans un nom de fichier, un export de recherche, un
   *  instantané de staff ou un rapport anonymisé) ; le pseudonyme (patient.pseudo) reste le libellé d'affichage */
  function newIdentity() { return { lastName: '', firstName: '', birthDate: '', ipp: '', notes: '' }; }
  function newDev() { return { id: '', asd: '', spasms: '', language: '', behavior: '' }; }
  function newPathway() { return { status: '', reason: '', date: '', text: '', at: '' }; }
  function newResection() { return { explorationId: null, contacts: [], cavity: null }; }
  /** préfixe de site : lettres et chiffres, 1 à 8, en majuscules (étiquette BIDS « sub- ») */
  const cleanSite = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  /** code du sujet : { site, n, code (numéro sur digits chiffres), label = site + code, at } */
  function makeSubject(site, n, digits) { site = cleanSite(site) || 'HFAR'; n = Math.max(1, n | 0); const code = String(n).padStart(Math.max(1, digits | 0 || 4), '0'); return { site, n, code, label: site + code, at: now() }; }
  const subjectLabel = d => (d && d.subject && d.subject.label) || '';
  /** nom affiché : « Prénom NOM » d'après l'identité, sinon pseudonyme, sinon code ; anon = vrai → code seulement
   *  (masquage pour un partage d'écran, un export vers l'extérieur ou un rapport anonymisé) */
  function displayName(d, anon) {
    if (!d) return ''; const code = subjectLabel(d), P = d.patient || {};
    if (anon) return code || 'Patient';
    const I = d.identity || {}, nm = [String(I.firstName || '').trim(), String(I.lastName || '').trim().toUpperCase()].filter(Boolean).join(' ');
    return nm || P.pseudo || code || 'Patient';
  }
  /** chaînes identifiantes d'un dossier : nom, prénom, IPP, date de naissance sous plusieurs écritures, ancien pseudonyme */
  function secretsOf(d) {
    const I = (d && d.identity) || {}, P = (d && d.patient) || {}, code = subjectLabel(d), bd = String(I.birthDate || ''), m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bd);
    return [I.lastName, I.firstName, I.ipp, bd, m && `${m[3]}/${m[2]}/${m[1]}`, m && `${m[3]}.${m[2]}.${m[1]}`, m && `${m[3]}.${m[2]}.${m[1].slice(2)}`, m && `${m[1]}${m[2]}${m[3]}`, P.pseudo && P.pseudo !== code ? P.pseudo : '']
      .map(s => String(s || '').trim()).filter(s => s.length >= 3);
  }
  /** texte d'où l'identité du patient est retirée (remplacée par son code) : noms de pièces jointes, titres importés */
  function scrub(d, s) {
    const L = secretsOf(d).sort((a, b) => b.length - a.length); if (!L.length || s == null) return s;
    const esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), code = subjectLabel(d) || 'patient';
    return String(s).replace(new RegExp(L.map(x => esc(x).replace(/\s+/g, '[\\s_.-]+')).join('|'), 'gi'), code);
  }
  /** copie anonymisée d'un dossier pour un partage extérieur : identité vidée, pseudonyme = code, toute occurrence du nom,
   *  du prénom, de l'IPP, de la date de naissance ou de l'ancien pseudonyme remplacée par le code dans tous les textes
   *  (journal compris). Les fichiers (en-têtes EDF, vidéos) sont traités par l'export (library.exportBundle). */
  function anonymize(d0) { return anonymizer(d0).d; }
  /** v2.1.1 : anonymisation d'un dossier ET de ses chemins de fichiers. paths = fichiers du dossier (archive) ; renvoie
   *  { d, pathMap } : un chemin qui contient le nom, le prénom, l'IPP, la date de naissance ou l'ancien pseudonyme (dérivés
   *  d'avant le code neutre « sub-<pseudonyme>_… », pièces jointes au nom d'origine) est renommé — le secret remplacé par le
   *  code, mot entier seulement pour ne pas toucher aux chemins fixes (derivatives/anat…) — et toute référence du dossier à
   *  ce chemin suit le même renommage. Les autres textes sont anonymisés comme avant. */
  function anonymizer(d0, paths) {
    const d = JSON.parse(JSON.stringify(d0)), code = subjectLabel(d) || 'Patient', I = d.identity || {}, P = d.patient || {};
    const bd = String(I.birthDate || ''), m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bd);
    const secrets = [I.lastName, I.firstName, I.ipp, bd, m && `${m[3]}/${m[2]}/${m[1]}`, m && `${m[3]}.${m[2]}.${m[1]}`, P.pseudo !== code ? P.pseudo : '']
      .concat(String(P.pseudo || '').split(/\s+/).filter(w => P.pseudo !== code && w.length > 2))
      .map(s => String(s || '').trim()).filter(s => s.length > 1).sort((a, b) => b.length - a.length);
    // texte libre : un secret court (≤ 3 lettres, prénom bref) en mot entier seulement, pour ne pas couper « anatomie » ou « analyse »
    const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), re = secrets.length ? new RegExp(secrets.map(s => s.length > 3 ? esc(s) : '(?<![\\p{L}])' + esc(s) + '(?![\\p{L}])').join('|'), 'giu') : null;
    // chemins : secrets et leurs formes collées (« sub-NomPrenom », accents retirés), en mot entier (lettres autour exclues)
    const flat = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]/g, '');
    const glued = [P.pseudo !== code ? P.pseudo : '', [I.lastName, I.firstName].join(' '), [I.firstName, I.lastName].join(' ')].map(flat).filter(s => s.length > 2);
    const pSecrets = [...new Set(secrets.concat(glued, secrets.map(flat)).filter(s => s && s.length > 2))].sort((a, b) => b.length - a.length);
    const pRe = pSecrets.length ? new RegExp('(?<![\\p{L}])(' + pSecrets.map(esc).join('|') + ')(?![\\p{L}])', 'giu') : null;
    // un secret d'au moins 4 caractères resté collé dans le nom du fichier (dernier segment) est remplacé aussi
    const long = secrets.filter(s => s.length > 3), lRe = long.length ? new RegExp(long.map(esc).join('|'), 'gi') : null;
    const anonPath = p => { let q = pRe ? p.replace(pRe, code) : p; const i = q.lastIndexOf('/') + 1; if (lRe) q = q.slice(0, i) + q.slice(i).replace(lRe, code); return q; };
    const pathMap = new Map(); for (const p of paths || []) { const q = anonPath(p); if (q !== p) pathMap.set(p, q); }
    // chemin = fichier de l'archive, ou chaîne d'allure « dossier/…/fichier.ext » (fichier absent d'un export allégé) : jamais
    // le remplacement en sous-chaîne du texte libre, qui coupait « derivatives/anat/… » quand un prénom court s'y trouvait
    const known = new Set(paths || []), looksPath = v => v.length < 400 && !/[\n\r]/.test(v) && /^[^/\s][^\n]*\/[^/\n]*\.[A-Za-z0-9]{1,8}$/.test(v);
    const walkP = o => { const fix = v => known.has(v) ? (pathMap.get(v) || v) : looksPath(v) ? anonPath(v) : (re ? v.replace(re, code) : v);
      if (Array.isArray(o)) { for (let i = 0; i < o.length; i++) { if (typeof o[i] === 'string') o[i] = fix(o[i]); else if (o[i] && typeof o[i] === 'object') walkP(o[i]); } return; }
      for (const k of Object.keys(o)) { const v = o[k]; if (typeof v === 'string') o[k] = fix(v); else if (v && typeof v === 'object') walkP(v); } };
    if (re || pRe) walkP(d);
    d.identity = newIdentity(); d.patient.pseudo = code; d.anonymized = { at: now(), by: 'EpiScope' };
    return { d, pathMap };
  }
  /** date de naissance de l'identité → mois et année du patient (âge, frise) ; vrai si quelque chose a changé */
  function syncBirth(d) {
    const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(String((d.identity || {}).birthDate || '')); if (!m) return false;
    const P = d.patient, y = m[1], mo = String(+m[2]); if (P.birthYear === y && P.birthMonth === mo) return false;
    P.birthYear = y; P.birthMonth = mo; return true;
  }
  // ---------------------------------------------------------------- temps absolu des tracés (v1.1.0)
  // Référence = heure murale du poste d'acquisition (EDF : sans fuseau) ; calculs faits en UTC sur cette heure murale pour
  // ne pas dépendre du fuseau du poste qui lit le dossier. rec.clock : voir SV.IEEG.clockOf.
  const isoMs = s => { const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?/.exec(String(s || '')); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], m[7] ? +m[7].padEnd(3, '0') : 0) : null; };
  const msIso = t => { const d = new Date(t), p = (n, w) => String(n).padStart(w || 2, '0'); return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}.${p(d.getUTCMilliseconds(), 3)}`; };
  /** temps du tracé t (s) → heure absolue ISO (null sans horloge) */
  function clockAbs(clock, t) {
    if (!clock || !clock.start || t == null || !isFinite(t)) return null; const B = clock.blocks || [], s0 = isoMs(clock.start); if (s0 == null) return null;
    let b = B[0] || { t0: 0, r0: 0 }; for (const x of B) if (x.t0 <= t + 1e-9) b = x;
    return msIso(s0 + Math.round((b.r0 + (t - b.t0)) * 1000));
  }
  /** heure absolue ISO → temps du tracé (s) ; null si l'instant tombe dans une coupure ou hors du tracé ; recouvrement de
   *  blocs : le premier bloc qui contient l'instant */
  function clockT(clock, iso) {
    if (!clock || !clock.start) return null; const s0 = isoMs(clock.start), a = isoMs(iso); if (s0 == null || a == null) return null;
    const r = (a - s0) / 1000; for (const b of clock.blocks || []) if (r >= b.r0 - 1e-6 && r <= b.r0 + (b.t1 - b.t0) + 1e-6) return Math.round((b.t0 + (r - b.r0)) * 1000) / 1000;
    return null;
  }
  /** écart en secondes entre deux heures ISO (b − a) */
  const isoDiff = (a, b) => { const x = isoMs(a), y = isoMs(b); return x == null || y == null ? null : (y - x) / 1000; };
  const isoAdd = (a, s) => { const x = isoMs(a); return x == null ? null : msIso(x + Math.round(s * 1000)); };
  /** marques d'un ensemble { onset, end, user: [{ t }] } : heure absolue ajoutée (mk.abs, user[].abs) */
  function stampSet(clock, mk) {
    if (!mk) return; mk.abs = { onset: clockAbs(clock, mk.onset), end: clockAbs(clock, mk.end) };
    for (const u of mk.user || []) u.abs = clockAbs(clock, u.t);
  }
  /** tracé : heure absolue de toutes ses marques (crise active, autres crises, marques intercritiques) */
  function stampMarks(rec) {
    if (!rec || !rec.clock || !rec.clock.start) return false;
    stampSet(rec.clock, rec.marks); for (const sl of Object.values(rec.bySz || {})) if (sl) stampSet(rec.clock, sl.marks);
    for (const u of rec.imarks || []) u.abs = clockAbs(rec.clock, u.t);
    return true;
  }
  /** nouvelle horloge (lecture du fichier changée : blocs recouverts écartés, etc.) : temps du tracé recalculés d'après les
   *  heures absolues enregistrées ; renvoie le nombre de marques recalées */
  function rebaseMarks(rec, clock) {
    let n = 0; const fix = (o, k, iso) => { if (!iso) return; const t = clockT(clock, iso); if (t != null && Math.abs(t - (o[k] == null ? NaN : o[k])) > 1e-3) { o[k] = t; n++; } else if (t != null && o[k] == null) { o[k] = t; n++; } };
    const set = mk => { if (!mk) return; const A0 = mk.abs || {}; fix(mk, 'onset', A0.onset); fix(mk, 'end', A0.end); for (const u of mk.user || []) fix(u, 't', u.abs); };
    set(rec.marks); for (const sl of Object.values(rec.bySz || {})) if (sl) set(sl.marks); for (const u of rec.imarks || []) fix(u, 't', u.abs);
    rec.clock = clock; return n;
  }
  // ---------------------------------------------------------------- marques et résultats par crise d'un tracé (v2.0.0)
  /** Un tracé peut contenir plusieurs crises. Avant 2.0.0, la crise active avait ses marques et ses résultats au premier
   *  niveau du tracé (rec.marks, rec.ei…) et les autres dans rec.bySz : on les permutait à chaque changement de crise,
   *  ce qui pouvait ranger le résultat d'une crise sous une autre. Désormais chaque crise a son rangement fixe :
   *    rec.sz[<id crise>] = { marks, ei, cei, pei, h2, fp, em, hfo, quantIds, esz } ; rec.free = même chose hors crise ;
   *  rec.marks, rec.ei… sont des accès (non enregistrés) au rangement de la crise active (rec.seizureId) ; rec.bySz est une
   *  vue des autres crises (compatibilité). Changer de crise = changer rec.seizureId, rien n'est déplacé. */
  const REC_F = ['marks', 'ei', 'cei', 'pei', 'h2', 'fp', 'em', 'hfo', 'quantIds', 'esz'];
  const recFresh = k => k === 'marks' ? { onset: null, end: null, user: [] } : k === 'quantIds' ? {} : null;
  function bindRec(rec) {
    if (!rec || typeof rec !== 'object' || rec._bound) return rec;
    if (!rec.sz || typeof rec.sz !== 'object') rec.sz = {}; if (!rec.free || typeof rec.free !== 'object') rec.free = {};
    // ancien rangement : bySz (crises non actives) puis premier niveau (crise active, ou hors crise)
    const ob = Object.getOwnPropertyDescriptor(rec, 'bySz'); if (ob && 'value' in ob) { for (const [k, sl] of Object.entries(ob.value || {})) if (sl && typeof sl === 'object') rec.sz[k] = Object.assign(rec.sz[k] || {}, sl); delete rec.bySz; }
    const top = {}; for (const k of REC_F) { const ds = Object.getOwnPropertyDescriptor(rec, k); if (ds && 'value' in ds) { top[k] = ds.value; delete rec[k]; } }
    if (Object.keys(top).length) { const tg = rec.seizureId ? (rec.sz[rec.seizureId] = rec.sz[rec.seizureId] || {}) : rec.free; for (const [k, v] of Object.entries(top)) if (v != null || !(k in tg)) tg[k] = v; }
    const slot = () => rec.seizureId ? (rec.sz[rec.seizureId] || (rec.sz[rec.seizureId] = {})) : rec.free;
    for (const k of REC_F) Object.defineProperty(rec, k, { configurable: true, enumerable: false, get() { const s = slot(); if (s[k] === undefined) s[k] = recFresh(k); return s[k]; }, set(v) { slot()[k] = v; } });
    const px = new Proxy(rec.sz, {
      get: (t, p) => p === rec.seizureId ? undefined : t[p], set: (t, p, v) => { t[p] = v; return true; }, deleteProperty: (t, p) => { delete t[p]; return true; },
      has: (t, p) => p !== rec.seizureId && p in t, ownKeys: t => Reflect.ownKeys(t).filter(k => k !== rec.seizureId),
      getOwnPropertyDescriptor: (t, p) => p === rec.seizureId ? undefined : Reflect.getOwnPropertyDescriptor(t, p) });
    Object.defineProperty(rec, 'bySz', { configurable: true, enumerable: false, get: () => px, set: () => { } });
    Object.defineProperty(rec, '_bound', { value: true, enumerable: false, configurable: true });
    return rec;
  }
  /** tous les tracés du dossier (lecture, restauration, avant chaque enregistrement) */
  const bindRecs = d => { for (const ex of (d && d.explorations) || []) for (const r of ex.recordings || []) bindRec(r); return d; };
  /** crise active du tracé (ses marques et ses résultats deviennent ceux de rec.marks, rec.ei…) ; des marques posées hors
   *  crise deviennent celles de la première crise choisie */
  function recSetSeizure(rec, szId) {
    bindRec(rec); szId = szId || null; if ((rec.seizureId || null) === szId) return false;
    if (!rec.seizureId && szId && !rec.sz[szId]) { rec.sz[szId] = rec.free; rec.free = {}; }
    rec.seizureId = szId; return true;
  }
  /** retire une crise du tracé (ses marques et résultats), sans toucher à la crise du dossier */
  function recDropSeizure(rec, szId) {
    bindRec(rec); delete rec.sz[szId];
    if (rec.seizureId === szId) rec.seizureId = Object.keys(rec.sz)[0] || null;
  }
  /** v2.1.1 : jeu EI enregistré sans sa crise (ieegSaveQuant avant 2.1.1) → crise du rangement du tracé qui le porte
   *  (rec.sz[<crise>].ei.quantId) ; idempotent, ne touche pas un jeu déjà rattaché ni un jeu hors crise (rec.free) */
  function eiSetSeizures(d) {
    let n = 0;
    for (const ex of d.explorations || []) for (const q of ex.quant || []) {
      if (q.seizureId || !q.ieeg || (q.method && q.method !== 'ei')) continue;
      const rec = (ex.recordings || []).find(r => r.id === q.ieeg); if (!rec || !rec.sz) continue;
      const k = Object.keys(rec.sz).find(id => { const sl = rec.sz[id]; return sl && sl.ei && sl.ei.quantId === q.id; });
      if (k && byId(d.seizures, k)) { q.seizureId = k; n++; }
    }
    return n;
  }
  /** dossier : heures absolues des marques et début absolu des crises (sz.onsetAbs, d'après le tracé qui la marque) */
  function stampAll(d) {
    bindRecs(d);
    for (const ex of d.explorations || []) for (const rec of ex.recordings || []) {
      if (!stampMarks(rec)) continue;
      const put = (szId, mk) => { const sz = szId && byId(d.seizures, szId); if (sz && mk && mk.abs && mk.abs.onset) sz.onsetAbs = mk.abs.onset; };
      put(rec.seizureId, rec.marks); for (const [k, sl] of Object.entries(rec.bySz || {})) put(k, sl && sl.marks);
    }
  }
  // ---------------------------------------------------------------- synchronisation vidéo ↔ temps absolu (v1.1.0)
  /** lien d'une vidéo de la galerie avec l'heure absolue : { id, galleryId, recordingId, start (heure absolue de t = 0 de
   *  la vidéo), drift (dérive de l'horloge vidéo, s/s), method: metadata | filename | manual | points, points: [{ tv, abs }] }
   *  plusieurs vidéos par tracé (caméras, fichiers découpés) */
  function addSyncLink(d, o) {
    const L = { id: uid('V'), galleryId: o.galleryId, recordingId: o.recordingId || null, start: o.start || null, drift: +o.drift || 0, method: o.method || 'manual', points: o.points || [], at: now() };
    d.syncLinks = (d.syncLinks || []).filter(x => x.galleryId !== L.galleryId).concat([L]); return L;
  }
  const syncOf = (d, galleryId) => (d.syncLinks || []).find(x => x.galleryId === galleryId) || null;
  /** temps de la vidéo (s) → heure absolue ; heure absolue → temps de la vidéo */
  const videoAbs = (L, tv) => L && L.start && tv != null ? isoAdd(L.start, tv * (1 + (L.drift || 0))) : null;
  const videoT = (L, iso) => { const s = L && L.start ? isoDiff(L.start, iso) : null; return s == null ? null : Math.round(s / (1 + (L.drift || 0)) * 1000) / 1000; };
  /** points de synchronisation (même évènement dans la vidéo et dans le tracé) → { start, drift } : 1 point = décalage,
   *  2 points et plus = décalage + dérive (moindres carrés) */
  function fitSync(points) {
    const P = (points || []).filter(p => p && p.tv != null && isoMs(p.abs) != null); if (!P.length) return null;
    const ref = P[0].abs, ys = P.map(p => isoDiff(ref, p.abs)), xs = P.map(p => +p.tv);
    if (P.length === 1 || Math.max(...xs) - Math.min(...xs) < 1) { const a = ys[0] - xs[0]; return { start: isoAdd(ref, a), drift: 0 }; }
    const n = P.length, mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
    let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
    const b = sxy / sxx, a = my - b * mx; return { start: isoAdd(ref, a), drift: Math.round((b - 1) * 1e7) / 1e7 };
  }
  /** heure de début tirée d'un nom de fichier vidéo (AAAAMMJJ_HHMMSS, AAAA-MM-JJ_HH-MM-SS, AAAAMMJJHHMMSS, …) ; le nom
   *  d'origine n'est pas conservé (il peut porter le nom du patient) : à appeler à l'import seulement */
  function videoStartFromName(name) {
    const s = String(name || ''), m = /(20\d{2}|19\d{2})[-_.]?(\d{2})[-_.]?(\d{2})[ _T-]?(\d{2})[-_.:h]?(\d{2})[-_.:m]?(\d{2})/.exec(s);
    if (!m || +m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > 31 || +m[4] > 23 || +m[5] > 59 || +m[6] > 59) return null;
    return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000`;
  }
  /** vidéos qui couvrent un instant (durée de la vidéo : g.duration) → [{ link, g, tv }] */
  function videosAt(d, iso) {
    const out = []; for (const L of d.syncLinks || []) { const g = byId(d.gallery || [], L.galleryId), tv = videoT(L, iso); if (g && tv != null && tv >= 0 && tv <= (g.duration || 0)) out.push({ link: L, g, tv }); }
    return out;
  }
  // ---------------------------------------------------------------- commentaires de staff (v1.1.0)
  /** note d'un staff accrochée à une donnée sans la modifier : target = « <type>:<id>:<champ> » (même chaîne que les
   *  ancres data-ed / data-cm des rendus), meetingId = staff où elle a été faite ; les staffs ultérieurs la voient */
  function addStaffNote(d, o) {
    const n = { id: uid('N'), target: String(o.target || ''), meetingId: o.meetingId || null, text: String(o.text || '').trim(), at: now(), by: o.by || '' };
    if (!n.target || !n.text) return null; (d.staffNotes = d.staffNotes || []).push(n); return n;
  }
  /** commentaires d'une donnée, du plus ancien au plus récent ; upTo (date ISO) : ceux des staffs de cette date ou avant */
  function notesFor(d, target, upTo) {
    const M = new Map((d.meetings || []).map(m => [m.id, m]));
    return (d.staffNotes || []).filter(n => n.target === target && (!upTo || !n.meetingId || !M.get(n.meetingId) || String(M.get(n.meetingId).date || '') <= String(upTo)))
      .sort((a, b) => String(a.at).localeCompare(String(b.at)));
  }
  /** « DUPONT Jeanne Marie » ou « Jeanne DUPONT » → { lastName, firstName } : mots en capitales = nom ; sinon premier mot = nom */
  function parseName(s) {
    const w = String(s || '').trim().split(/\s+/).filter(Boolean); if (!w.length) return { lastName: '', firstName: '' };
    const caps = w.filter(x => x.length > 1 && x === x.toUpperCase() && /\p{L}/u.test(x));
    if (caps.length && caps.length < w.length) return { lastName: caps.join(' '), firstName: w.filter(x => !caps.includes(x)).join(' ') };
    return { lastName: w[0], firstName: w.slice(1).join(' ') };
  }
  /** histoire clinique structurée (modèle de RCP / de présentation des cas chirurgicaux) */
  function newClin() {
    const ant = {}; for (const [k] of V.antecedents) ant[k] = { v: '', text: '' };
    return { antecedents: ant, antecedentsText: '', familyLeftHanded: '', lifestyle: '', epilepsyHistory: '', onsetMode: '', seizureTypes: '', duration: '', subjective: '', objective: '', contact: '', postictal: '', timing: '', triggers: '', fbtcs: '', longestFree: '', intolerances: '', neuroExam: '', comorbidities: '',
      edinburgh: '', pointingR: '', pointingL: '', eye: '', examHistory: [], comorbHistory: [], freqHistory: [], pedigree: { v: 3, persons: [], links: [], notes: '' } };
  }
  /** complète un dossier lu sur disque (champs ajoutés par les versions ultérieures) */
  // ---------------------------------------------------------------- migration schéma 2 → 3 (v2.0.0) : plus de séances
  /** crises rattachées à l'exploration de leur séance (date de la séance reprise si la crise n'en a pas) ; notes et fichiers
   *  des séances versés dans les notes de l'exploration, datés ; corbeille convertie ; rien n'est perdu. Idempotente.
   *  Renvoie un rapport { sessions, seizures, notes, orphans, trash, changed } (essai à blanc : appeler sur une copie). */
  function migrate3(d) {
    const R = { sessions: 0, seizures: 0, notes: 0, orphans: 0, trash: 0, changed: false };
    const S0 = Array.isArray(d.sessions) ? d.sessions : [], M = new Map(S0.map(s => [s.id, s]));
    const inSes = it => it && it.loc && it.loc.list === 'sessions', topSz = it => it && it.loc && it.loc.list === 'seizures' && !it.loc.id;
    for (const e of d.trash || []) for (const it of e.items || []) if (inSes(it) && !it.loc.id && it.obj && !M.has(it.obj.id)) M.set(it.obj.id, it.obj);
    const fmt = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
    const fix = sz => {
      if (!sz || !('sessionId' in sz)) return false; const ses = M.get(sz.sessionId);
      if (ses && ses.explorationId && (d.explorations || []).some(e => e.id === ses.explorationId)) sz.explorationId = ses.explorationId;
      else { sz.explorationId = sz.explorationId || null; R.orphans++; }
      if (!sz.datetime && ses && ses.date) sz.datetime = ses.date;
      delete sz.sessionId; return true;
    };
    for (const sz of d.seizures || []) if (fix(sz)) R.seizures++;
    for (const s of S0) {
      R.sessions++; const ex = (d.explorations || []).find(e => e.id === s.explorationId); if (!ex) continue;
      const files = (s.files || []).map(f => (f && f.name) || f).filter(Boolean), txt = [String(s.notes || '').trim(), files.length ? 'fichiers : ' + files.join(', ') : ''].filter(Boolean).join(' — ');
      if (txt) { ex.notes = [String(ex.notes || '').trim(), `[${s.label || 'Séance'}${s.date ? ' du ' + fmt(s.date) : ''}] ${txt}`].filter(Boolean).join('\n'); R.notes++; }
    }
    for (const e of d.trash || []) {
      let ch = false; const n0 = (e.items || []).length;
      e.items = (e.items || []).filter(it => !inSes(it)); if (e.items.length !== n0) ch = true;
      for (const it of e.items) if (topSz(it) && fix(it.obj)) ch = true;
      if (Array.isArray(e.patches)) { const p0 = e.patches.length; e.patches = e.patches.filter(p => p.list !== 'sessions'); if (e.patches.length !== p0) ch = true; }
      if (ch) R.trash++;
    }
    if ('sessions' in d) { delete d.sessions; R.changed = true; }
    if (R.seizures || R.notes || R.trash) R.changed = true;
    if ((d.schema || 0) < 3) { d.schema = 3; R.changed = true; }
    if (R.changed) { d.minReader = '2.0.0'; }
    return R;
  }
  function normalize(d) {
    if (!d || d.format !== 'episcope-dossier') throw new Error('ce fichier n’est pas un dossier EpiScope');
    const base = newDossier();
    for (const k of Object.keys(base)) if (d[k] == null) d[k] = base[k];
    d.patient = Object.assign(base.patient, d.patient);
    const c0 = newClin(); d.patient.clin = Object.assign(c0, d.patient.clin || {}); d.patient.clin.antecedents = Object.assign(newClin().antecedents, d.patient.clin.antecedents || {});
    migrateClin(d.patient);
    for (const x of d.exams || []) { x.imagingIds = x.imagingIds || []; x.attachments = x.attachments || []; if (x.kind === 'eeg') x.kind = 'veeg'; x.loc = (Array.isArray(x.loc) ? x.loc : []).filter(k => V.systems[k]); }   // l'EEG de scalp est un vidéo-EEG
    d.rois = d.rois || [];
    d.sliceViews = d.sliceViews && typeof d.sliceViews === 'object' ? d.sliceViews : {};
    for (const k of Object.keys(d.sliceViews)) { const v = d.sliceViews[k]; if (!v || typeof v !== 'object') { delete d.sliceViews[k]; continue; } delete v.elec; delete v.elecK; delete v.pair; }   // réglages d'affichage seulement
    for (const ex of d.explorations) { for (const k of ['electrodes', 'stims', 'thermo', 'quant']) ex[k] = ex[k] || []; (ex.recordings || []).forEach(bindRec); ex.eeg = ex.eeg || {}; if (ex.eeg.map) for (const k of EEG_MAP_KEYS) ex.eeg.map[k] = ex.eeg.map[k] || {}; ex.context = ex.kind === 'other' ? ex.context || '' : ''; if (ex.kind === 'seeg') { ex.implant = Object.assign({ adopted: null, by: '', showReal: true, showPlan: false, compare: null }, ex.implant || {}); ex.inter = Object.assign({ sampling: '', wake: '', sleep: '', physiological: '', slow: '', spikes: [], other: '' }, ex.inter || {}); ex.elecNotes = ex.elecNotes || {}; ex.report = ex.report || {}; ex.recordings = Array.isArray(ex.recordings) ? ex.recordings : []; } }
    { const R = migrate3(d); if (R.changed && (R.sessions || R.seizures)) { d._snap = d._snap || 'migrate'; d._migrated = R; log(d, 'edit', 'dossier', d.id, `format 2.0 — séances fondues dans leur exploration : ${R.sessions} ; crises rattachées : ${R.seizures}${R.orphans ? ` ; crises rapportées (séance sans exploration) : ${R.orphans}` : ''}`); } }
    for (const sz of d.seizures) { sz.events = sz.events || []; sz.params = sz.params || {}; if (sz.explorationId === undefined) sz.explorationId = null; if (sz.origin === undefined) sz.origin = sz.explorationId ? '' : 'reported'; }
    for (const m of d.meetings) { m.galleryIds = m.galleryIds || []; if (m.deck && typeof m.deck !== 'object') delete m.deck; m.snapshots = Array.isArray(m.snapshots) ? m.snapshots : []; }   // v1.1.0 : surcouche du diaporama, instantanés (staff_deck.js)
    // v4.5 : « vidéo », « vidéo familiale », « image, document » deviennent des types d'élément (modalité)
    for (const g of d.gallery || []) { if (['video', 'familyvideo', 'image'].includes(g.kind)) { g.modality = g.modality || (g.kind === 'image' ? 'document' : g.kind); g.kind = ''; } if (!(g.kind in V.galleryKind)) g.kind = 'other'; }
    for (const o of d.outcomes) if (o.monthsManual == null) o.monthsManual = o.months !== '' && o.months != null && !(o.procedureId && byId(d.procedures, o.procedureId));
    d.settings = Object.assign({ anatomy: 'template' }, d.settings); d.ui = d.ui || {};
    d.trash = Array.isArray(d.trash) ? d.trash : [];
    d.results = Array.isArray(d.results) ? d.results : [];
    d.identity = Object.assign(newIdentity(), d.identity || {}); if (d.subject && !d.subject.label) d.subject = null;
    d.staffNotes = Array.isArray(d.staffNotes) ? d.staffNotes : [];
    d.syncLinks = Array.isArray(d.syncLinks) ? d.syncLinks : [];
    normalizeResearch(d);
    eiSetSeizures(d);
    // notes de page saisies avec la première version de l'édition du staff → commentaires accrochés à la page
    for (const m of d.meetings || []) { const it = m.deck && m.deck.items; if (!it) continue; for (const [k, v] of Object.entries(it)) if (v && v.note) { d.staffNotes.push({ id: uid('N'), target: 'page:' + k, meetingId: m.id, text: v.note, at: m.updated || now(), by: '' }); delete v.note; } }
    // v1.1.0 : jeux d'Analyses enregistrés avant la provenance → résultat « antérieur » (valeurs gardées, origine inconnue)
    if (SV.Prov) for (const ex of d.explorations) for (const q of ex.quant || []) if (!q.resultId && q.values && Object.keys(q.values).length) { const r = SV.Prov.legacy(q, ex); d.results.push(r); q.resultId = r.id; }
    for (const g of d.gallery || []) if (g.src && g.src.recId && !g.src.polarity) g.src.polarity = 'posup-legacy';   // v1.0.1 : pages de tracé capturées avant la correction de polarité (positif en haut)
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
  /** v1.0.1 : avertissement pour une page de tracé capturée avec l'ancienne polarité (positif en haut) */
  const polarityNote = g => g && g.src && /^posup/.test(g.src.polarity || '') ? 'polarité inversée : positif en haut' + (g.src.polarity === 'posup-legacy' ? ' (capture antérieure à la version 1.0.1)' : '') : '';
  const byId = (list, id) => list.find(x => x.id === id) || null;
  const sortDate = (a, b) => String(a.date || a.start || a.datetime || '').localeCompare(String(b.date || b.start || b.datetime || '')) || String(a.id).localeCompare(String(b.id));

  function addExploration(d, o) {
    o = o || {}; const kind = o.kind || 'phase1', ctx = kind === 'other' ? o.context || '' : '', rank = d.explorations.filter(e => e.kind === kind && (e.context || '') === ctx).length + 1;
    const ex = Object.assign({ id: uid('E'), kind, rank, label: kind === 'seeg' ? 'SEEG ' + rank : kind === 'phase1' ? (rank > 1 ? 'Phase 1 (' + rank + ')' : 'Phase 1') : 'Exploration ' + rank, start: today(), end: '', center: '', status: 'ongoing', notes: '', entryHypothesisIds: [], electrodes: [], stims: [], thermo: [], quant: [], ctImageId: null, eeg: {} }, o);
    if (kind === 'seeg') { ex.inter = Object.assign({ sampling: '', wake: '', sleep: '', physiological: '', slow: '', spikes: [], other: '' }, ex.inter || {}); ex.elecNotes = ex.elecNotes || {}; ex.report = ex.report || {}; }
    ex.context = ctx; if (!o.label) ex.label = kind === 'seeg' ? 'SEEG ' + ex.rank : ctx === 'ambu' ? 'EEG ambulatoire' + (rank > 1 ? ' (' + rank + ')' : '') : ctx === 'postop' ? 'Vidéo-EEG post-opératoire' + (rank > 1 ? ' (' + rank + ')' : '') : ex.label;
    d.explorations.push(ex); log(d, 'add', 'exploration', ex.id, ex.label); return ex;
  }
  /** v2.0.0 : crise rattachée directement à une exploration (explorationId), ou au dossier (explorationId null : crise
   *  rapportée — vidéo familiale, témoignage, autre centre — rattachable plus tard à une exploration, voir moveSeizure) */
  function addSeizure(d, explorationId, o) {
    const ex = explorationId ? byId(d.explorations, explorationId) : null; if (explorationId && !ex) throw new Error('exploration inconnue');
    const n = (ex ? seizuresOfExploration(d, ex.id) : reportedAll(d)).length + 1;
    const sz = Object.assign({ id: uid('C'), explorationId: ex ? ex.id : null, origin: ex ? '' : 'reported', label: ex ? 'Crise ' + n : 'Crise rapportée ' + n, datetime: (o && o.datetime) || (ex && ex.start) || '', habitual: '?', ilae: null, eeg_onset: null, seizure_end: null, vigilance: '', trigger: '', eegOnsetText: '', events: [], params: {}, views: null, notes: '', source: 'manual', created: now() }, o || {});
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
  function addProcedure(d, o) { const p = Object.assign({ id: uid('R'), type: 'resection', template: '', date: today(), side: '', target: '', regions: [], extent: {}, histology: '', histologyCodes: [], resection: newResection(), complications: '', notes: '', decisionId: null }, o || {}); d.procedures.push(p); log(d, 'add', 'procedure', p.id, V.procedure[p.type]); return p; }
  function addOutcome(d, o) { const x = Object.assign({ id: uid('O'), date: today(), months: '', monthsManual: false, procedureId: null, engel: '', ilae: '', aeds: '', notes: '' }, o || {}); d.outcomes.push(x); log(d, 'add', 'outcome', x.id, 'Engel ' + (x.engel || '?')); return x; }
  function addExam(d, o) { const x = Object.assign({ id: uid('X'), kind: 'veeg', date: today(), title: '', text: '', conclusion: '', side: '', loc: [], domains: {}, explorationId: null, imagingIds: [], attachments: [], added: now() }, o || {}); (d.exams = d.exams || []).push(x); log(d, 'add', 'exam', x.id, (V.exam[x.kind] || x.kind) + ' ' + (x.date || '')); return x; }
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

  // ---------------------------------------------------------------- résultats (v1.1.0, provenance.js)
  /** range un résultat (append-only) : le précédent « même calcul » (méthode, tracé, crise, emplacement) passe « superseded » */
  function addResult(d, r) {
    const R = d.results || (d.results = []), key = SV.Prov ? SV.Prov.keyOf(r) : null;
    if (key) for (const x of R) if (x.status === 'current' && SV.Prov.keyOf(x) === key) { x.status = 'superseded'; x.supersededBy = r.id; r.supersedes = r.supersedes || x.id; }
    R.push(r); log(d, 'compute', 'result', r.id, (SV.Prov ? SV.Prov.chip(r) : r.method) + (r.label ? ' — ' + r.label : '')); return r;
  }
  const resultById = (d, id) => (d.results || []).find(r => r.id === id) || null;
  /** lignée d'un résultat (le plus récent d'abord) : lui et tous ceux qu'il remplace, puis ceux qui le remplacent */
  function resultLineage(d, id) {
    const R = d.results || [], r0 = resultById(d, id); if (!r0) return []; const key = SV.Prov ? SV.Prov.keyOf(r0) : null;
    const same = key ? R.filter(x => SV.Prov.keyOf(x) === key) : [r0];
    const seen = new Set(), out = []; const walk = x => { if (!x || seen.has(x.id)) return; seen.add(x.id); out.push(x); walk(resultById(d, x.supersedes)); }; walk(r0);
    for (const x of same) if (!seen.has(x.id)) out.push(x);
    return out.sort((a, b) => String(b.created || '').localeCompare(String(a.created || '')));
  }

  // ---------------------------------------------------------------- suppression → corbeille (v1.0.1)
  /** Toute suppression passe par la corbeille du dossier (d.trash) : l'objet retiré, sa place, et chaque référence que la
   *  cascade a modifiée (patch), pour une restauration exacte. Les fichiers cités par les objets retirés sont listés
   *  (entry.files) ; library.js les range dans trash/ au lieu de les effacer. */
  const KEYS = { exploration: 'explorations', session: 'sessions', seizure: 'seizures', imaging: 'imaging', lesion: 'lesions', meeting: 'meetings', hypothesis: 'hypotheses', decision: 'decisions', procedure: 'procedures', outcome: 'outcomes', exam: 'exams', gallery: 'gallery', aed: 'aedHistory', roi: 'rois', staffNote: 'staffNotes' };
  const TRASH_MAX = 300;
  const FILE_RE = /^(imaging|gallery|ieeg|attachments|derivatives)\//;
  let _rec = null;   // suppression en cours (cascade) : { items, patches }
  const getPath = (o, path) => String(path).split('.').reduce((a, k) => a == null ? a : a[k], o);
  function setPath(o, path, v) { const k = String(path).split('.'), last = k.pop(), p = k.reduce((a, x) => a == null ? a : a[x], o); if (p != null) p[last] = v; }
  /** tableau désigné par loc : { list } (premier niveau) ou { list, id, field } (tableau dans un objet) */
  function locArr(d, loc) { if (!loc.id) return d[loc.list] || (d[loc.list] = []); const o = byId(d[loc.list] || [], loc.id); if (!o) return null; let a = getPath(o, loc.field); if (!Array.isArray(a)) { a = []; setPath(o, loc.field, a); } return a; }
  /** champ d'un objet du dossier modifié par une cascade (ancienne valeur notée) */
  function recSet(d, list, obj, field, value) { const old = getPath(obj, field); if (old === value) return; if (_rec) _rec.patches.push({ t: 'set', list, id: obj.id, field, old: clone(old) }); setPath(obj, field, value); }
  /** valeur retirée d'un tableau d'un objet (position notée) */
  function recPull(d, list, obj, field, value) { const a = getPath(obj, field); if (!Array.isArray(a)) return; const i = a.indexOf(value); if (i < 0) return; a.splice(i, 1); if (_rec) _rec.patches.push({ t: 'pull', list, id: obj.id, field, value, index: i }); }
  /** objet retiré de son tableau (place notée) */
  function recDrop(d, loc, obj) { const a = locArr(d, loc); if (!a) return; const i = a.indexOf(obj); if (i < 0) return; a.splice(i, 1); if (_rec) _rec.items.push({ loc, obj, index: i }); }
  /** chemins de fichiers du dossier cités dans des objets (imaging/…, gallery/…, ieeg/…, attachments/…, derivatives/…) */
  function filesIn(x, out) { out = out || new Set(); if (typeof x === 'string') { if (FILE_RE.test(x)) out.add(x); } else if (Array.isArray(x)) x.forEach(v => filesIn(v, out)); else if (x && typeof x === 'object') for (const v of Object.values(x)) filesIn(v, out); return out; }
  function pushTrash(d, e) {
    const files = [...filesIn(e.items.map(i => i.obj))];
    const entry = Object.assign({ id: uid('T'), t: now(), user: (SV.Store && SV.Store.user) || '' }, e, { files });
    (d.trash = d.trash || []).push(entry); if (d.trash.length > TRASH_MAX) d.trash.splice(0, d.trash.length - TRASH_MAX);
    d._snap = d._snap || 'remove';   // la bibliothèque range aussi l'état précédent dans l'historique
    return entry;
  }
  /** suppression enregistrée dans la corbeille ; fn(rec) fait les retraits avec recDrop / recSet / recPull */
  function trashed(d, meta, fn) {
    const top = !_rec; if (top) _rec = { items: [], patches: [] };
    try { fn(); } catch (e) { if (top) _rec = null; throw e; }
    if (!top) return null;
    const r = _rec; _rec = null; if (!r.items.length) return null;
    const entry = pushTrash(d, Object.assign({}, meta, { items: r.items, patches: r.patches }));
    log(d, 'remove', meta.kind, meta.itemId, meta.label || ''); return entry;
  }
  function remove(d, kind, id) {
    const key = KEYS[kind]; if (!key) return null;
    const it = byId(d[key], id); if (!it) return null;
    return trashed(d, { kind, itemId: id, label: it.label || it.title || it.pseudo || (V.procedure && V.procedure[it.type]) || '' }, () => {
      if (kind === 'exploration') {
        for (const z of d.seizures.filter(z => z.explorationId === id)) remove(d, 'seizure', z.id);
        for (const g of d.gallery || []) if (g.explorationId === id) recSet(d, 'gallery', g, 'explorationId', null);
        for (const x of d.exams || []) if (x.explorationId === id) recSet(d, 'exams', x, 'explorationId', null);
        for (const x of d.decisions || []) if (x.createdExplorationId === id) recSet(d, 'decisions', x, 'createdExplorationId', null);
        for (const x of d.explorations) if (x.implant && Array.isArray(x.implant.layers)) recPull(d, 'explorations', x, 'implant.layers', 'ex:' + id);
      }
      if (kind === 'seizure') for (const g of d.gallery || []) if (g.seizureId === id) recSet(d, 'gallery', g, 'seizureId', null);
      if (kind === 'gallery') for (const m of d.meetings) recPull(d, 'meetings', m, 'galleryIds', id);
      if (kind === 'imaging') for (const x of d.exams || []) recPull(d, 'exams', x, 'imagingIds', id);
      if (kind === 'exam') for (const g of d.gallery || []) if (g.examId === id) recSet(d, 'gallery', g, 'examId', null);
      if (kind === 'meeting') { for (const x of d.decisions) if (x.meetingId === id) recSet(d, 'decisions', x, 'meetingId', null); for (const h of d.hypotheses) if (h.meetingId === id) recSet(d, 'hypotheses', h, 'meetingId', null); }
      if (kind === 'decision') for (const m of d.meetings) recPull(d, 'meetings', m, 'decisionIds', id);
      if (kind === 'hypothesis' && it.supersedes) { const prev = byId(d.hypotheses, it.supersedes); if (prev && prev.status === 'revised' && !d.hypotheses.some(h => h !== it && h.supersedes === prev.id)) recSet(d, 'hypotheses', prev, 'status', 'proposed'); }
      recDrop(d, { list: key }, it);
    });
  }
  /** retrait d'un élément d'un tableau imbriqué (tracé d'une exploration, pièce jointe d'un bilan…) via la corbeille */
  function discard(d, o) {
    // o = { kind, label, list, id, field, item } — ex. { kind: 'recording', list: 'explorations', id: ex.id, field: 'recordings', item: rec }
    return trashed(d, { kind: o.kind, itemId: o.item && o.item.id, label: o.label || (o.item && (o.item.title || o.item.name || o.item.label)) || '' }, () => recDrop(d, { list: o.list, id: o.id, field: o.field }, o.item));
  }
  /** restaure une entrée de la corbeille ; renvoie { ok, entry, missing } (missing : objets dont le parent a disparu) */
  function restoreTrash(d, trashId) {
    const T = d.trash || [], k = T.findIndex(e => e.id === trashId); if (k < 0) return { ok: false, missing: [] };
    const e = T[k], missing = [];
    for (const it of e.items.slice().reverse()) {
      const a = locArr(d, it.loc); if (!a) { missing.push(it.obj.label || it.obj.title || it.obj.id); continue; }
      if (!a.some(x => x && x.id === it.obj.id)) a.splice(Math.min(it.index, a.length), 0, it.obj);
    }
    for (const p of e.patches.slice().reverse()) {
      const o = byId(d[p.list] || [], p.id); if (!o) continue;
      if (p.t === 'set') { const cur = getPath(o, p.field); if (cur == null || cur === '' || p.field === 'status') setPath(o, p.field, p.old); }
      else if (p.t === 'pull') { let a = getPath(o, p.field); if (!Array.isArray(a)) { a = []; setPath(o, p.field, a); } if (!a.includes(p.value)) a.splice(Math.min(p.index, a.length), 0, p.value); }
    }
    T.splice(k, 1); d._snap = d._snap || 'restore'; bindRecs(d);
    log(d, 'restore', e.kind, e.itemId, e.label || ''); return { ok: true, entry: e, missing };
  }
  /** fichiers encore cités par le dossier (hors corbeille) */
  const filesUsed = d => filesIn(Object.assign({}, d, { trash: null, journal: null }));
  /** vide la corbeille (toutes les entrées, ou celles de plus de maxAgeDays jours) ; renvoie les fichiers devenus orphelins */
  function purgeTrash(d, maxAgeDays) {
    const lim = maxAgeDays == null ? Infinity : Date.now() - maxAgeDays * 864e5, gone = (d.trash || []).filter(e => maxAgeDays == null || Date.parse(e.t) < lim);
    d.trash = (d.trash || []).filter(e => !gone.includes(e)); const used = filesUsed(d), keepT = filesIn(d.trash);
    const files = [...new Set(gone.flatMap(e => e.files || []))].filter(f => !used.has(f) && !keepT.has(f));
    if (gone.length) { d._snap = d._snap || 'purge'; log(d, 'purge', 'trash', '', gone.length + ' élément(s)'); }
    return { n: gone.length, files };
  }
  /** comparaison de versions « 1.2.3 » (pré-versions ignorées) */
  function cmpVersion(a, b) { const p = v => String(v || '0').split('-')[0].split('.').map(n => +n || 0); const x = p(a), y = p(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); } return 0; }

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
  const bySzTime = (a, b) => String(a.datetime || '').localeCompare(String(b.datetime || '')) || String(a.created || a.id).localeCompare(String(b.created || b.id));
  /** crises d'une exploration, dans l'ordre chronologique */
  const seizuresOfExploration = (d, explorationId) => d.seizures.filter(z => z.explorationId === explorationId).sort(bySzTime);
  /** crises rapportées non rattachées (hors exploration : vidéo familiale, témoignage…) */
  const reportedSeizures = d => d.seizures.filter(z => !z.explorationId).sort(bySzTime);
  /** toutes les crises saisies comme rapportées, rattachées depuis à une exploration ou non (carte du dossier) */
  const reportedAll = d => d.seizures.filter(z => z.origin === 'reported' || !z.explorationId).sort(bySzTime);
  /** cartes 10-20 de l'EEG de scalp (ex.eeg.map) : intercritique en veille (W) et au sommeil (S), début des crises ;
   *  « spikes » et « slow » (avant 2.0.0) = vigilance non précisée, gardés tels quels jusqu'à ce qu'on les range */
  const EEG_MAP_KEYS = ['spikesW', 'spikesS', 'slowW', 'slowS', 'ictal'];
  /** v2.2.0 : électrode 10-20 → systèmes qu'elle explore au mieux (p : principaux, s : voisins) ; le scalp localise mal : un
   *  système voisin n'est jamais compté plus que « en faveur ». Électrode médiane (Fz, Cz, Pz) : les deux côtés. */
  const EEG_SYS = {
    Fp: { p: ['orbitofrontal', 'prefrontal_mesial'], s: ['prefrontal_lateral'] },
    F7: { p: ['mesial_temporal', 'lateral_temporal'], s: ['orbitofrontal', 'insulo_opercular'] }, F8: 'F7',
    F9: { p: ['mesial_temporal', 'basal_temporal'], s: ['lateral_temporal'] }, F10: 'F9',
    T3: { p: ['lateral_temporal', 'mesial_temporal'], s: ['insulo_opercular'] }, T4: 'T3',
    T9: { p: ['basal_temporal', 'mesial_temporal'], s: ['lateral_temporal'] }, T10: 'T9',
    T5: { p: ['lateral_temporal', 'basal_temporal'], s: ['occipital', 'parietal_lateral'] }, T6: 'T5', P9: 'T5', P10: 'T5',
    F3: { p: ['prefrontal_lateral', 'premotor'], s: [] }, F4: 'F3',
    Fz: { p: ['premotor', 'prefrontal_mesial'], s: [] },
    C3: { p: ['central'], s: ['premotor', 'insulo_opercular'] }, C4: 'C3',
    Cz: { p: ['central', 'premotor'], s: ['posterior_medial'] },
    P3: { p: ['parietal_lateral'], s: ['central'] }, P4: 'P3',
    Pz: { p: ['posterior_medial', 'parietal_lateral'], s: [] },
    O1: { p: ['occipital'], s: [] }, O2: 'O1',
    T7: 'T3', T8: 'T3', P7: 'T5', P8: 'T5',
  };
  const eegSysOf = e => { let r = EEG_SYS[e] || EEG_SYS[String(e).slice(0, 2)]; if (typeof r === 'string') r = EEG_SYS[r]; return r || null; };
  const eegSidesOf = e => /z$/i.test(e) ? ['L', 'R'] : (+String(e).replace(/\D/g, '') % 2 ? ['L'] : ['R']);
  /** carte 10-20 ({ électrode: 1–3 }) → { 'système:côté': { v, els: [électrodes] } } ; v = amplitude la plus forte d'une électrode
   *  qui explore le système à titre principal (1 au plus pour un système voisin) */
  function eegMapSystems(vals) {
    const out = {};
    for (const [e, a] of Object.entries(vals || {})) {
      const m = eegSysOf(e), v = +a || 0; if (!m || v <= 0) continue;
      for (const side of eegSidesOf(e)) for (const [list, cap] of [[m.p, 3], [m.s, 1]]) for (const sys of list) {
        const k = sys + ':' + side, o = out[k] || (out[k] = { v: 0, els: [] }); o.v = Math.max(o.v, Math.min(v, cap)); if (!o.els.includes(e)) o.els.push(e);
      }
    }
    return out;
  }
  /** v2.2.0 : systèmes cités dans le texte d'un bilan (conclusion, puis résultats) — une SUGGESTION, jamais appliquée seule :
   *  l'utilisateur la confirme dans le bilan (x.loc) ; le côté vient de la latéralisation du bilan */
  const LOC_WORDS = [
    ['mesial_temporal', /hippocamp|amygdal|parahippocamp|uncus|temporal\w* (interne|mesial|medial)|mesio-?temporal|temporo-?mesial|sclerose (de l.)?hippocamp/],
    ['basal_temporal', /temporal\w* basal|temporo-?basal|fusiform|gyrus temporal inferieur/],
    ['lateral_temporal', /temporal\w* (externe|lateral|neocortical)|pole temporal|temporo-?polaire|gyrus temporal (superieur|moyen)|neocortex temporal/],
    ['insulo_opercular', /insul|opercul/],
    ['orbitofrontal', /orbito|gyrus droit|frontal\w* basal|fronto-?basal/],
    ['prefrontal_mesial', /cingulaire anterieur|frontal\w* (interne|mesial|medial)|prefrontal\w* (mesial|medial)|fronto-?mesial/],
    ['prefrontal_lateral', /prefrontal\w* (lateral|dorso)|dorsolateral|frontal\w* (lateral|dorso|inferieur|moyen)|gyrus frontal (superieur|moyen|inferieur)|broca/],
    ['premotor', /\bams\b|\bsma\b|aire motrice supplementaire|premot/],
    ['central', /rolandi|precentral|postcentral|\bcentral|moteur primaire|paracentral/],
    ['parietal_lateral', /supramarginal|angulaire|parietal\w* (lateral|inferieur|superieur|externe)/],
    ['posterior_medial', /precuneus|cingulaire posterieur|parietal\w* (mesial|medial|interne)|retrosplenial/],
    ['occipital', /occipit|calcarin|(?<!pre)cuneus|lingual/],
  ];
  /** v2.3.0 : hypothèses de réseau à discuter au staff — la sémiologie des crises ET le reste du tableau de concordance.
   *  pool : [{ key, name, hemi, w (poids sémiologique : somme des scores du modèle sur les crises), ez: ['système:côté'],
   *          prop: ['système:côté'], ... }] ; rows : { 'système:côté': { cells: [{ col, label, v }] } } (cases du tableau,
   *          saisies comprises ; la colonne 'semio' est exclue du score de concordance : la sémiologie compte déjà par w).
   *  Score de concordance d'une ligne R = Σ niveaux hors sémiologie (++ 2, + 1, 0 / ? 0, − −1). Hypothèse :
   *    sémiologie s = w / max(w) ∈ [0, 1] ; concordance c = (max R des lignes de la ZE + ½ max R⁺ des lignes de propagation) / max R⁺ ;
   *    total = s + c. Zone concordante (R ≥ 2) qu'aucune hypothèse ne prend pour ZE → proposition « d'après la concordance »
   *    (s = niveau de la case sémiologie / 2). Renvoie la liste triée, avec arguments pour / contre lisibles. */
  function networkRank(pool, rows, opts) {
    const o = Object.assign({ sysLabel: k => k, minConc: 2, max: 8 }, opts || {}), LV = { '++': 2, '+': 1, '0': 0, '?': 0, '−': -1, '-': -1 };
    const R = {}, sup = {}, con = {};
    for (const [k, r] of Object.entries(rows || {})) {
      const cs = (r.cells || []).filter(c => c && c.col !== 'semio' && c.v);
      R[k] = cs.reduce((s, c) => s + (LV[c.v] || 0), 0);
      sup[k] = cs.filter(c => LV[c.v] > 0); con[k] = cs.filter(c => LV[c.v] < 0);
    }
    const maxR = Math.max(1, ...Object.values(R)), maxW = Math.max(1e-9, ...(pool || []).map(x => x.w || 0));
    const side = k => (String(k).split(':')[1] === 'L' ? 'G' : 'D'), lab = k => o.sysLabel(String(k).split(':')[0]) + ' ' + side(k);
    const cellTxt = (k, c) => `${c.label} ${c.v} (${lab(k)})`;
    const score = (ez, prop) => {
      const ezR = ez.length ? Math.max(...ez.map(k => R[k] || 0)) : 0, pr = prop.filter(k => !ez.includes(k)), prR = pr.length ? Math.max(0, ...pr.map(k => R[k] || 0)) : 0;
      return { c: (ezR + 0.5 * prR) / maxR, ezR, prR };
    };
    const out = (pool || []).map(x => {
      const ez = [...new Set(x.ez || [])], prop = [...new Set(x.prop || [])], sc = score(ez, prop), s = (x.w || 0) / maxW;
      const forC = [...ez.flatMap(k => (sup[k] || []).map(c => cellTxt(k, c))), ...prop.filter(k => !ez.includes(k)).flatMap(k => (sup[k] || []).filter(c => c.v === '++').map(c => cellTxt(k, c) + ', propagation'))];
      const againstC = ez.flatMap(k => (con[k] || []).map(c => cellTxt(k, c)));
      return Object.assign({}, x, { ez, prop, semio: s, conc: sc.c, total: s + sc.c, forC: [...new Set(forC)], againstC, from: 'model' });
    });
    // zones concordantes sans hypothèse sémiologique qui les prenne pour zone épileptogène
    const ezAll = new Set(out.flatMap(x => x.ez));
    for (const [k, r] of Object.entries(R)) {
      if (r < o.minConc || ezAll.has(k)) continue;
      const sem = ((rows[k].cells || []).find(c => c && c.col === 'semio') || {}).v, s = (LV[sem] || 0) / 2;
      out.push({ key: 'conc|' + k, name: o.sysLabel(k.split(':')[0]), hemi: k.split(':')[1], w: 0, ez: [k], prop: [], semio: Math.max(0, s), conc: r / maxR, total: Math.max(0, s) + r / maxR,
        forC: (sup[k] || []).map(c => cellTxt(k, c)), againstC: (con[k] || []).map(c => cellTxt(k, c)), from: 'concordance' });
    }
    // ZE sans aucun appui hors sémiologie alors qu'une autre zone est concordante (R ≥ 2) : argument contre
    for (const x of out) {
      const ezR = x.ez.length ? Math.max(...x.ez.map(k => R[k] || 0)) : 0, best = Object.entries(R).filter(([k]) => !x.ez.includes(k)).sort((a, b) => b[1] - a[1])[0];
      if (ezR <= 0 && best && best[1] >= o.minConc) x.againstC = x.againstC.concat(`zone plus concordante : ${lab(best[0])} (${best[1] > 0 ? '+' : ''}${best[1]})`);
    }
    return out.sort((a, b) => b.total - a.total || b.semio - a.semio).slice(0, o.max);
  }
  function examLocSuggest(x) {
    const T = [x && x.conclusion, x && x.text, ...Object.values((x && x.domains) || {})].filter(Boolean).join(' . ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (!T.trim()) return [];
    const out = LOC_WORDS.filter(([, re]) => re.test(T)).map(([k]) => k);
    // « temporal », « frontal », « pariétal » sans précision : système latéral, seulement si rien de plus précis n'a été trouvé
    if (!out.some(k => /temporal/.test(k)) && /temporal/.test(T)) out.push('lateral_temporal');
    if (!out.some(k => /frontal|premotor/.test(k)) && /\bfrontal/.test(T)) out.push('prefrontal_lateral');
    if (!out.some(k => /parietal|posterior/.test(k)) && /parietal/.test(T)) out.push('parietal_lateral');
    return Object.keys(V.systems).filter(k => out.includes(k));
  }
  /** vue d'ensemble d'une exploration (frise) : jours, tracés et crises placés en heure murale ISO
   *  → { t0, t1, days: [{ day, n }], recs: [{ id, title, kind, t0, t1, vigil }], seizures: [{ id, label, t, habitual, events }] } */
  function explorationOverview(d, ex) {
    const recs = (ex.recordings || []).map(r => {
      const a = r.clock && r.clock.start ? clockAbs(r.clock, 0) : null, b = a && r.duration ? clockAbs(r.clock, r.duration) : null;
      return { id: r.id, title: r.title || '', kind: r.kind || '', vigil: r.vigil || '', t0: a, t1: b || a, duration: r.duration || 0 };
    });
    const szs = seizuresOfExploration(d, ex.id).map(z => ({ id: z.id, label: z.label, t: z.onsetAbs || (/T\d{2}:\d{2}/.test(z.datetime || '') ? String(z.datetime).slice(0, 16) + ':00' : ''), date: String(z.datetime || '').slice(0, 10), habitual: z.habitual, events: (z.events || []).length }));
    // période : début (et fin) de l'exploration, sinon les tracés ; une crise à plus de 3 jours de la période (crise rapportée
    // rattachée, faute de frappe…) n'étire pas la frise : elle est rendue dans « outside »
    const D = s => /^\d{4}-\d{2}-\d{2}/.test(s || '') ? String(s).slice(0, 10) : null, szT = z => z.t || (D(z.date) ? z.date + 'T12:00:00' : '');
    const rs = [].concat(recs.map(r => r.t0), recs.map(r => r.t1)).filter(Boolean).map(x => String(x).slice(0, 19)).sort();
    let a = D(ex.start) || (rs[0] && rs[0].slice(0, 10)) || null, b = D(ex.end) || (rs.length ? rs[rs.length - 1].slice(0, 10) : null);
    const near = (t, lo, hi) => { const x = Date.parse(t.slice(0, 10) + 'T00:00:00Z'); return x >= Date.parse(lo + 'T00:00:00Z') - 3 * 864e5 && x <= Date.parse(hi + 'T00:00:00Z') + 3 * 864e5; };
    if (!a) { const zs = szs.map(szT).filter(Boolean).sort(); a = zs[0] ? zs[0].slice(0, 10) : null; }
    if (a && (!b || b < a)) b = a;
    const outside = [];
    if (a) {
      const hiMax = D(ex.end) ? b : new Date(Date.parse(a + 'T00:00:00Z') + 30 * 864e5).toISOString().slice(0, 10);
      for (const z of szs) { const t = szT(z); if (!t) continue; if (!near(t, a, hiMax)) { outside.push(z.id); continue; } const k = t.slice(0, 10); if (k < a) a = k; if (k > b) b = k; }
      for (const t of rs) { const k = t.slice(0, 10); if (k < a) a = k; if (k > b && near(t, a, hiMax)) b = k; }
    }
    const t0 = a ? a + 'T00:00:00' : null, t1 = b ? b + 'T23:59:59' : null;
    const days = []; if (t0 && t1) { const D0 = Date.parse(a + 'T00:00:00Z'), D1 = Date.parse(b + 'T00:00:00Z'), J0 = D(ex.start) ? Date.parse(D(ex.start) + 'T00:00:00Z') : D0;
      for (let x = D0; x <= D1 && days.length < 60; x += 864e5) days.push({ day: new Date(x).toISOString().slice(0, 10), n: Math.round((x - J0) / 864e5) + 1 }); }
    return { t0, t1, days, recs, seizures: szs.map(z => Object.assign(z, { outside: outside.includes(z.id) })) };
  }
  /** jours d'une exploration (regroupement calculé, à la place des séances) : [{ day: 'AAAA-MM-JJ' | '', n (J1, J2…), seizures }] */
  function seizureDays(d, explorationId) {
    const ex = byId(d.explorations, explorationId), L = explorationId ? seizuresOfExploration(d, explorationId) : reportedSeizures(d), map = new Map();
    for (const z of L) { const k = String(z.datetime || '').slice(0, 10); if (!map.has(k)) map.set(k, []); map.get(k).push(z); }
    const t0 = ex && /^\d{4}-\d{2}-\d{2}/.test(ex.start || '') ? Date.parse(ex.start.slice(0, 10)) : null;
    return [...map.entries()].sort((a, b) => (a[0] || '~').localeCompare(b[0] || '~')).map(([day, seizures]) => ({ day, n: t0 != null && day ? Math.round((Date.parse(day) - t0) / 864e5) + 1 : null, seizures }));
  }
  /** rattacher une crise à une autre exploration (ou au dossier : null) ; ses tracés et vidéos la suivent par leurs liens */
  function moveSeizure(d, seizureId, explorationId) {
    const sz = byId(d.seizures, seizureId), ex = explorationId ? byId(d.explorations, explorationId) : null; if (!sz || (explorationId && !ex)) return false;
    if ((sz.explorationId || null) === (ex ? ex.id : null)) return false;
    sz.explorationId = ex ? ex.id : null; log(d, 'edit', 'seizure', sz.id, `${sz.label} → ${ex ? ex.label : 'crises rapportées (dossier)'}`); return true;
  }
  /** v2.0.0 — crises annotées dans les fichiers des tracés d'une exploration, et ce qu'elles sont dans le dossier :
   *  detect(rec.events) → [{ onset, end, label }] (IEEG.seizureEvents) ; pour chaque début :
   *   state 'linked'    : une crise du tracé a son début marqué à moins de 5 s ;
   *   state 'match'     : une crise de l'exploration est datée à moins de 2 min (heure réelle) → proposer de l'y rattacher ;
   *   state 'duplicate' : même instant (± 5 s) qu'une annotation d'un autre tracé déjà prise (exports qui se recouvrent) ;
   *   state 'free'      : aucune fiche → proposer de la créer (crise quantifiable mais pas encore décrite).
   *  → [{ recId, onset, end, label, abs, state, seizureId }] trié par heure */
  function annotatedSeizures(d, ex, detect) {
    const out = [], ms = s => s ? isoMs(String(s).length === 16 ? s + ':00' : s) : null, szs = seizuresOfExploration(d, ex.id);
    const onsetIn = (r, id) => { const m = r.seizureId === id ? r.marks : ((r.bySz || {})[id] || {}).marks; return m && m.onset != null ? m.onset : null; };
    for (const r of ex.recordings || []) {
      const ids = [].concat(r.seizureId ? [r.seizureId] : [], Object.keys(r.bySz || {}).filter(k => k !== r.seizureId));
      for (const a of (detect ? detect(r.events || []) : [])) {
        const abs = r.clock ? clockAbs(r.clock, a.onset) : null, lk = ids.find(id => { const o = onsetIn(r, id); return o != null && Math.abs(o - a.onset) <= 5; });
        let state = lk ? 'linked' : 'free', seizureId = lk || null;
        if (!lk && abs) { const A = isoMs(abs), z = szs.filter(z => { const t = ms(z.onsetAbs) || (/T\d{2}:\d{2}/.test(z.datetime || '') ? ms(z.datetime) : null); return t != null && Math.abs(t - A) <= 120e3; }).sort((x, y) => Math.abs(ms(x.onsetAbs || x.datetime) - A) - Math.abs(ms(y.onsetAbs || y.datetime) - A))[0]; if (z) { state = 'match'; seizureId = z.id; } }
        out.push({ recId: r.id, onset: a.onset, end: a.end, label: a.label, abs, state, seizureId });
      }
    }
    const ri = id => (ex.recordings || []).findIndex(r => r.id === id);
    out.sort((a, b) => String(a.abs || '~').slice(0, 19).localeCompare(String(b.abs || '~').slice(0, 19)) || ri(a.recId) - ri(b.recId) || a.onset - b.onset);
    for (const x of out) if (x.state !== 'linked' && x.abs) { const A = isoMs(x.abs), tw = out.find(y => y !== x && y.recId !== x.recId && y.abs && Math.abs(isoMs(y.abs) - A) <= 5e3 && (y.state === 'linked' || out.indexOf(y) < out.indexOf(x))); if (tw) { x.state = 'duplicate'; x.seizureId = tw.seizureId; } }
    return out;
  }
  /** tracés d'une exploration qui se recouvrent à l'heure réelle (exports d'une nuit et d'un segment, par exemple)
   *  → [{ a, b, from, to }] (identifiants, heures ISO murales) */
  function recordingOverlaps(ex) {
    const R = (ex.recordings || []).map(r => ({ id: r.id, a: r.clock ? clockAbs(r.clock, 0) : null, b: r.clock && r.duration ? clockAbs(r.clock, r.duration) : null })).filter(x => x.a && x.b), out = [];
    for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) { const from = R[i].a > R[j].a ? R[i].a : R[j].a, to = R[i].b < R[j].b ? R[i].b : R[j].b; if (from < to) out.push({ a: R[i].id, b: R[j].id, from, to }); }
    return out;
  }
  /** reprendre la sémiologie d'une crise (crises stéréotypées) : signes copiés (nouveaux identifiants, mêmes temps
   *  relatifs), à ajuster ensuite ; la crise cible garde le reste (date, tracé, vidéo). Renvoie le nombre de signes. */
  function copySemiology(d, fromId, toId) {
    const a = byId(d.seizures, fromId), b = byId(d.seizures, toId); if (!a || !b || a === b) return 0;
    let n = 0; b.events = (a.events || []).map(e => Object.assign(clone(e), { id: ++n }));
    for (const k of ['vigilance', 'ilae']) if (!b[k] && a[k]) b[k] = clone(a[k]);
    b.semioFrom = a.id; log(d, 'edit', 'seizure', b.id, `${b.label} : sémiologie reprise de ${a.label}`); return b.events.length;
  }
  /** contexte de travail des crises rapportées : pseudo-exploration propre au dossier ouvert, jamais enregistrée
   *  (id REPORTED ; pas d'électrodes ni de tracés) — l'espace de travail de la sémiologie fonctionne comme ailleurs */
  const REPORTED = '_rep', _rep = new WeakMap();
  const reportedEx = d => { let x = _rep.get(d); if (!x) { x = { id: REPORTED, kind: 'reported', label: 'Crises rapportées', start: '', electrodes: [], stims: [], thermo: [], quant: [], recordings: [], params: {}, views: null }; _rep.set(d, x); } return x; };
  const exOf = (d, id) => id === REPORTED ? reportedEx(d) : byId(d.explorations, id);
  function contextOf(d, seizureId) {
    const sz = byId(d.seizures, seizureId); if (!sz) return null;
    return { seizure: sz, exploration: (sz.explorationId && byId(d.explorations, sz.explorationId)) || reportedEx(d) };
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
    const meet = d.meetings.slice().sort(sortDate).pop(), W = d.pathway || {};
    if (W.status === 'declined') return { key: 'declined', text: 'récusé' + (W.reason ? ' · ' + V.declineReason[W.reason] : '') };   // v2.1.0 : statut explicite
    if (W.status === 'lost') return { key: 'lost', text: 'perdu de vue' };
    if (out) return { key: 'followup', text: 'suivi · Engel ' + (out.engel || '?') };
    if (proc) return { key: 'operated', text: V.procedure[proc.type] + ' ' + (proc.date || '') };
    const pending = d.decisions.filter(x => x.status === 'proposed' || x.status === 'planned').pop();
    if (meet && last && String(meet.date) >= String(last.start || '')) return { key: 'decided', text: pending ? 'décision : ' + V.decision[pending.type] : 'staff ' + meet.date };
    if (last) return { key: last.kind, text: last.label + (last.status === 'done' ? ' · à discuter en staff' : ' · ' + V.explorationStatus[last.status || 'ongoing']) };
    return { key: 'new', text: 'nouveau dossier' };
  }
  function summary(d) {
    return { oldFormat: Array.isArray(d.sessions), id: d.id, display: displayName(d), subject: subjectLabel(d), subjectN: d.subject ? d.subject.n : null, site: d.subject ? d.subject.site : '', pseudo: d.patient.pseudo, updated: d.updated, revision: d.revision, stage: stage(d), nExpl: d.explorations.length, nSeizures: d.seizures.length, nImaging: d.imaging.length, anatomy: !!(d.anatomy && d.anatomy.status === 'done') };
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
    const ex = ctx && ctx.explorationId ? exOf(d, ctx.explorationId) : explorationsSorted(d).pop();
    return ex ? { seizure: null, exploration: ex } : null;
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
      sz = addSeizure(d, ex.id === REPORTED ? null : ex.id, { datetime: today() }); ctx = { seizureId: sz.id, explorationId: ex.id };
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
    const sz = addSeizure(d, ex.id, { datetime: ex.start, label: c.name || undefined, events: c.events || [], params: c.params || {}, views: c.views || null, eeg_onset: c.patient ? c.patient.eeg_onset : null, seizure_end: c.patient ? c.patient.seizure_end : null, vigilance: c.patient ? c.patient.state || '' : '', notes: c.notes || '', source: 'import v1' });
    if (c.patient && c.patient.lesion && c.patient.lesion.length) addLesion(d, { label: 'Lésion marquée sur l’atlas', source: 'atlas', regions: c.patient.lesion.slice() });
    return { dossier: d, seizure: sz };
  }

  // ---------------------------------------------------------------- dossier portable
  /** fichiers d'un dossier à mettre dans une archive ; light = sans les images d'origine (imaging/) */
  function bundlePolicy(path, light) { if (/^(\.lock|dossier\.conflict|history\/|trash\/)/.test(path)) return false;   // v1.0.1 : ni l'historique ni la corbeille dans une archive
    if (light && (/^(imaging|ieeg|derivatives\/esi)\//.test(path) || /^ses-[^/]+\/(ieeg|eeg|anat|pet)\//.test(path))) return false; if (light && /^gallery\/[^/]+\.(mp4|webm|mov|m4v|ogv|mkv|avi|wmv|mpg|mpeg|flv|3gp|mts|m2ts|ts)$/i.test(path)) return false; return true; }   // archive légère : sans les images d'origine, les tracés SEEG ni les vidéos (vignettes gardées)

  // ---------------------------------------------------------------- v2.1.0 : données de recherche dans le dossier
  // Histologie fermée, comorbidités développementales, statut du parcours, contacts dans la résection, région VEP de chaque
  // plot figée à la validation, transformation vers MNI (affine ou non linéaire) : nées des besoins de la recherche, rangées
  // dans le dossier pour qu'une requête les lise telles qu'elles ont été établies, sans les recalculer.
  const HISTO = new Map(); for (const [g, , L] of V.histology) for (const [k, t] of L) HISTO.set(k, { group: g, label: t });
  const DEV_KEYS = V.devComorb.map(x => x[0]);
  function normalizeResearch(d) {
    const P = d.patient; P.dev = Object.assign(newDev(), P.dev && typeof P.dev === 'object' ? P.dev : {});
    for (const k of DEV_KEYS) if (!(P.dev[k] in (k === 'id' ? Object.assign({ '': 1, no: 1 }, V.idSeverity) : V.devValue))) P.dev[k] = '';
    d.pathway = Object.assign(newPathway(), d.pathway && typeof d.pathway === 'object' ? d.pathway : {}); if (!(d.pathway.status in V.pathwayStatus)) d.pathway.status = '';
    if (d.pathway.status !== 'declined' || !(d.pathway.reason in V.declineReason)) d.pathway.reason = '';
    for (const p of d.procedures || []) {
      p.histologyCodes = Array.isArray(p.histologyCodes) ? [...new Set(p.histologyCodes.filter(k => HISTO.has(k)))] : [];
      p.resection = Object.assign(newResection(), p.resection && typeof p.resection === 'object' ? p.resection : {});
      p.resection.contacts = (Array.isArray(p.resection.contacts) ? p.resection.contacts : []).filter(c => c && c.e && +c.k >= 1).map(c => ({ e: String(c.e), k: +c.k, how: c.how in V.resectHow ? c.how : 'manual' }));
    }
  }
  /** histologie : libellé, groupe, texte d'une procédure (codes puis texte libre) */
  const histologyLabel = k => (HISTO.get(k) || { label: k }).label, histologyGroup = k => (HISTO.get(k) || {}).group || '';
  const histologyText = p => [...(p.histologyCodes || []).map(histologyLabel), p.histology || ''].filter(Boolean).join(' ; ');
  /** comorbidités développementales : « DI moyenne, TSA » (oui seulement) ; null = rien de renseigné */
  function devText(P, short) {
    const D = (P && P.dev) || {}; if (!DEV_KEYS.some(k => D[k])) return null;
    return V.devComorb.filter(([k]) => D[k] && D[k] !== 'no').map(([k, t, s]) => (short ? s : t) + (k === 'id' && D.id !== 'yes' ? ' ' + V.idSeverity[D.id] : '')).join(', ');
  }
  /** statut du parcours suggéré par le dossier (procédures, décision « pas de chirurgie ») : une aide, jamais écrite seule */
  function pathwaySuggest(d) {
    const td = today(), done = d.procedures.filter(p => p.date && String(p.date) <= td).sort(sortDate), last = done[done.length - 1];
    if (last) return { status: 'operated', why: `${V.procedure[last.type] || last.type} du ${last.date}`, procedureId: last.id };
    const no = d.decisions.filter(x => x.type === 'none' && x.status !== 'cancelled').sort(sortDate).pop();
    if (no) { const m = no.meetingId && byId(d.meetings, no.meetingId); return { status: 'declined', why: `décision « pas de chirurgie »${m ? ' du staff du ' + m.date : no.date ? ' du ' + no.date : ''}` }; }
    if (d.explorations.length || d.meetings.length || d.procedures.length) return { status: 'evaluation', why: d.procedures.length ? 'intervention programmée' : 'bilan en cours' };
    return { status: '', why: '' };
  }
  function setPathway(d, o) {
    const W = d.pathway = Object.assign(newPathway(), d.pathway, o || {}); if (!(W.status in V.pathwayStatus)) W.status = ''; if (W.status !== 'declined') W.reason = '';
    W.at = now(); log(d, 'edit', 'dossier', d.id, 'statut du parcours : ' + V.pathwayStatus[W.status] + (W.reason ? ' (' + V.declineReason[W.reason] + ')' : '')); return W;
  }
  /** contacts dans la résection : exploration SEEG de référence (choisie, sinon la dernière avec des électrodes réelles) */
  function resectionExploration(d, p) {
    const R = p.resection || {}, ex = R.explorationId ? byId(d.explorations, R.explorationId) : null; if (ex) return ex;
    const L = explorationsSorted(d).filter(e => e.kind === 'seeg' && (e.electrodes || []).some(s => s.real && s.real.contacts)); return L[L.length - 1] || null;
  }
  const contactName = (spec, k) => String(spec.name || '').replace(/’/g, "'") + k;
  /** contacts réséqués d'une procédure, résolus sur les électrodes : [{ spec, k, name, how, region }] (contacts disparus ignorés) */
  function resectedContacts(d, p) {
    const ex = resectionExploration(d, p); if (!ex) return []; const out = [];
    for (const c of (p.resection && p.resection.contacts) || []) { const spec = (ex.electrodes || []).find(s => s.id === c.e); if (!spec) continue; out.push({ spec, k: c.k, name: contactName(spec, c.k), how: c.how, region: contactRegion(spec, c.k) }); }
    return out;
  }
  /** remplace (how = 'cavity' : seulement les contacts déduits de la cavité ; les ajouts à la main restent) ou bascule un contact */
  function setResected(d, p, list, how) {
    const R = p.resection = Object.assign(newResection(), p.resection); const keep = how === 'cavity' ? R.contacts.filter(c => c.how === 'manual') : [];
    const seen = new Set(keep.map(c => c.e + ':' + c.k)); R.contacts = keep.concat(list.filter(c => !seen.has(c.e + ':' + c.k)).map(c => ({ e: c.e, k: +c.k, how: how || 'manual' })));
    log(d, 'edit', 'procedure', p.id, `contacts dans la résection : ${R.contacts.length}`); return R.contacts;
  }
  function toggleResected(d, p, e, k) {
    const R = p.resection = Object.assign(newResection(), p.resection), i = R.contacts.findIndex(c => c.e === e && c.k === +k);
    if (i >= 0) R.contacts.splice(i, 1); else R.contacts.push({ e, k: +k, how: 'manual' }); log(d, 'edit', 'procedure', p.id, `contacts dans la résection : ${R.contacts.length}`); return i < 0;
  }
  /** région VEP de chaque plot, figée à la validation : spec.real.regions[k-1] = { code, name } ; regionsMeta = atlas, anatomie */
  function stampContactRegions(d, spec, labels, meta) {
    if (!spec || !spec.real || !Array.isArray(labels)) return false;
    spec.real.regions = labels.map(l => ({ code: +l.code || 0, name: String(l.name || '') }));
    spec.real.regionsMeta = Object.assign({ atlas: 'VEP', anatomyDate: d.anatomy && d.anatomy.date || null, space: 'patient', at: now() }, meta || {}); return true;
  }
  const contactRegion = (spec, k) => { const r = spec && spec.real && spec.real.regions; return r && r[k - 1] ? r[k - 1] : null; };
  /** 'ok' | 'missing' (pas encore étiqueté) | 'stale' (anatomie recalculée depuis : les régions figées restent, à réétiqueter si voulu) */
  function contactRegionStatus(d, spec) {
    const R = spec && spec.real; if (!R || !R.contacts) return null; if (!R.regions || R.regions.length !== R.contacts.length) return 'missing';
    return d.anatomy && d.anatomy.date && R.regionsMeta && R.regionsMeta.anatomyDate && R.regionsMeta.anatomyDate !== d.anatomy.date ? 'stale' : 'ok';
  }
  /** coordonnées MNI305 d'un point du T1 du patient : transformation non linéaire si elle a été calculée et retenue, sinon affine */
  function toMNI(d, p) {
    const A = d && d.anatomy, M = A && A.mni; if (!A || !p) return null;
    if (M && M.method !== 'affine' && SV.Warp && M.steps && M.steps.length) return SV.Warp.applyChain(M.steps, p);
    const T = A.toTemplate; if (!T) return null; return [T[0] * p[0] + T[1] * p[1] + T[2] * p[2] + T[3], T[4] * p[0] + T[5] * p[1] + T[6] * p[2] + T[7], T[8] * p[0] + T[9] * p[1] + T[10] * p[2] + T[11]];
  }
  const mniMethod = d => { const M = d && d.anatomy && d.anatomy.mni; return d && d.anatomy && d.anatomy.toTemplate ? (M && M.method && M.method !== 'affine' ? M.method : 'affine') : null; };

  SV.Store = { networkRank, EEG_SYS, eegMapSystems, examLocSuggest, anonymizer, eiSetSeizures, newDev, newPathway, newResection, normalizeResearch, histologyLabel, histologyGroup, histologyText, devText, pathwaySuggest, setPathway, resectionExploration, contactName, resectedContacts, setResected, toggleResected, stampContactRegions, contactRegion, contactRegionStatus, toMNI, mniMethod, onsetText, onsetYears, ONSET_UNIT, renumberSeizures, SCHEMA, V, uid, now, today, clone, newDossier, normalize, newClin, migrateClin, syncPatient, etiologyText, fmtPartial, ageAt, addRoi, byId, addExploration, addSeizure, addImaging, addLesion, addMeeting, addProcedure, addOutcome, addExam, addGalleryItem, galleryModOf, addAed, outcomeProcedure, outcomeMonthsAuto, outcomeMonths, addHypothesis, hypothesisLineages, latestHypotheses, addDecision, remove, discard, restoreTrash, purgeTrash, filesIn, filesUsed, cmpVersion, polarityNote, newIdentity, cleanSite, makeSubject, subjectLabel, displayName, parseName, anonymize, syncBirth, addStaffNote, notesFor, clockAbs, clockT, isoDiff, isoAdd, stampMarks, rebaseMarks, stampAll, addSyncLink, syncOf, videoAbs, videoT, fitSync, videoStartFromName, videosAt, addResult, resultById, resultLineage, implantations, implantLabel, implantState, adoptRealImplant,
    projectLocked, ensureProject, projectsOf, switchProject, addProject, renameProject, removeProject, projectElectrodes, revertToPlan, THERMO_ORDER, THERMO_COL, thermoStatusOf, importImplantation, compareImplantations, explorationsSorted, secretsOf, scrub, bindRec, bindRecs, recSetSeizure, recDropSeizure, REC_F, reportedSeizures, reportedAll, explorationOverview, annotatedSeizures, recordingOverlaps, copySemiology, EEG_MAP_KEYS, seizureDays, moveSeizure, migrate3, REPORTED, reportedEx, seizuresOfExploration, allSeizures, contextOf, lesionRegions, refImaging, deriveIlae, ilaeText, stage, summary, log, resolveCtx, toWorkspace, fromWorkspace, migrateCase, bundlePolicy, user: '' };
});
