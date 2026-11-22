/* EpiScope — research.js (v2.0.0) : production d'un jeu de données de recherche BIDS anonymisé (sans DOM, testable sous Node).
 *
 *  EpiScope produit et range les données ; l'exploration de la base (cohortes, requêtes) sera l'affaire d'un outil séparé.
 *  Ce module décrit, pour un dossier, tous les fichiers d'un export BIDS (spécification BIDS 1.10, extension iEEG) :
 *    - brut : sub-<code>/[sub-<code>_sessions.tsv] ses-<session>/<ieeg|eeg>/ … _ieeg.edf (en-tête anonymisé, dates décalées),
 *      _channels.tsv, _events.tsv (débuts et fins de crises, annotations), _ieeg.json / _eeg.json, _scans.tsv,
 *      _space-ScanRAS_electrodes.tsv + _coordsystem.json (repère du T1 du patient), _space-MNI305_electrodes.tsv +
 *      _coordsystem.json (affine 12 ddl du T1 vers le gabarit fsaverage / MNI305), anat/…_T1w.nii.gz (option) ;
 *    - dérivés EpiScope (derivatives/episcope/sub-<code>/) : crises, sémiologie signe par signe, stimulations,
 *      thermocoagulations, résultats des analyses par plot (avec méthode et version), clinique (étiologie, lésions,
 *      chirurgie, devenir), transformation vers MNI305.
 *  Anonymisation : code neutre seulement (jamais d'identité), dates décalées d'un nombre de jours propre au sujet (gardé
 *  dans la bibliothèque clinique, le même d'un export à l'autre), âges au lieu des dates de naissance, pas de vidéos ni de
 *  captures, textes libres exclus ; le contrôle final (scanSecrets) cherche l'identité du patient dans chaque fichier.  */
(function (SV) {
  'use strict';
  const S = SV.Store, B = SV.BIDS;
  const VERSION = '1.10.0';
  const tsv = (cols, rows) => cols.join('\t') + '\n' + rows.map(r => cols.map(c => { const v = r[c]; return v == null || v === '' ? 'n/a' : String(v).replace(/[\t\n\r]+/g, ' '); }).join('\t')).join('\n') + (rows.length ? '\n' : '');
  const json = o => JSON.stringify(o, null, 2) + '\n';
  const pad = n => String(n).padStart(2, '0');
  const r2 = v => v == null || !isFinite(v) ? null : Math.round(v * 100) / 100;

  // ---------------------------------------------------------------- dates décalées, âges
  /** décalage propre à un sujet : 1 à 3 ans en arrière, en jours entiers (le jour de la semaine n'est pas gardé) */
  const newShift = rnd => -(365 + Math.floor((rnd || Math.random)() * 730));
  /** date ou date-heure ISO décalée de days jours (heure du jour gardée) ; '' si illisible */
  function shiftIso(iso, days) {
    const s = String(iso || ''), m = /^(\d{4})-(\d{2})-(\d{2})(T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?/.exec(s); if (!m) return '';
    const t = Date.UTC(+m[1], +m[2] - 1, +m[3]) + days * 864e5, x = new Date(t);
    return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}` + (m[4] ? (m[4].length === 6 ? m[4] + ':00' : m[4].slice(0, 9)) : '');
  }
  /** âge (années, une décimale) à une date ; naissance : identité (AAAA-MM-JJ), sinon année / mois du patient ; plus de
   *  89 ans → « 89+ » (pratique d'anonymisation courante) */
  function ageAt(d, iso) {
    const I = d.identity || {}, P = d.patient || {}, m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); if (!m) return '';
    let b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(I.birthDate || '')), bt;
    if (b) bt = Date.UTC(+b[1], +b[2] - 1, +b[3]); else if (P.birthYear) bt = Date.UTC(+P.birthYear, (+P.birthMonth || 7) - 1, P.birthMonth ? 15 : 1); else return '';
    const a = (Date.UTC(+m[1], +m[2] - 1, +m[3]) - bt) / (365.25 * 864e5); if (!isFinite(a) || a < 0) return '';
    return a >= 89 ? '89+' : Math.round(a * 10) / 10;
  }

  // ---------------------------------------------------------------- en-têtes des fichiers de signaux
  const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  /** EDF / BDF : en-tête anonymisé (patient « X X X X », enregistrement « Startdate <date décalée> X X X ») et date de début
   *  décalée de days jours (octets 168–176) ; signal inchangé. Avant 1985 (limite du format), la date est ramenée au 01.01.85. */
  function edfAnonShift(bytes, days) {
    const u = new Uint8Array(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)); if (u.length < 256) return u;
    const out = u.slice(0), put = (off, len, s) => { for (let i = 0; i < len; i++) out[off + i] = i < s.length ? s.charCodeAt(i) & 127 : 32; };
    const sd = String.fromCharCode.apply(null, u.subarray(168, 176)), m = /^(\d{2})\.(\d{2})\.(\d{2})$/.exec(sd);
    let y = 1985, mo = 1, dd = 1;
    if (m) { const yy = +m[3], Y = yy >= 85 ? 1900 + yy : 2000 + yy, x = new Date(Date.UTC(Y, +m[2] - 1, +m[1]) + (days || 0) * 864e5); y = x.getUTCFullYear(); mo = x.getUTCMonth() + 1; dd = x.getUTCDate(); if (y < 1985) { y = 1985; mo = 1; dd = 1; } }
    put(8, 80, 'X X X X'); put(88, 80, `Startdate ${pad(dd)}-${MON[mo - 1]}-${y} X X X`); put(168, 8, `${pad(dd)}.${pad(mo)}.${String(y).slice(2)}`);
    return out;
  }
  /** BrainVision .vmrk : dates des segments (« New Segment », AAAAMMJJhhmmssµµµµµµ) décalées */
  function vmrkShift(text, days) {
    return String(text).replace(/(New Segment,[^,\n]*,\d+,\d+,\d+,)(\d{4})(\d{2})(\d{2})(\d{6,12})/g, (all, pre, Y, Mo, D, rest) => {
      const x = new Date(Date.UTC(+Y, +Mo - 1, +D) + days * 864e5); return pre + x.getUTCFullYear() + pad(x.getUTCMonth() + 1) + pad(x.getUTCDate()) + rest; });
  }

  // ---------------------------------------------------------------- un dossier → fichiers de l'export
  /** identifiants neutres des crises d'un dossier (ordre chronologique) : sz-01, sz-02… */
  function seizureCodes(d) {
    const L = d.seizures.slice().sort((a, b) => String(a.datetime || '').localeCompare(String(b.datetime || '')) || String(a.id).localeCompare(String(b.id)));
    return new Map(L.map((z, i) => [z.id, 'sz-' + pad(i + 1)]));
  }
  const chType = c => { const t = String(c.type || '').toUpperCase(); if (/ECG|EKG/.test(t) || /^(ECG|EKG)/i.test(c.name)) return 'ECG'; if (/EMG/.test(t)) return 'EMG'; if (/EOG/.test(t)) return 'EOG'; if (/SEEG/.test(t)) return 'SEEG'; if (/ECOG/.test(t)) return 'ECOG'; if (/EEG/.test(t)) return 'EEG'; return t || 'MISC'; };

  /** opts : { shift (jours), includeT1, signLabel(id) → libellé, atlasLabel(index) → région, regions: { exId: { plot: région } },
   *           version (EpiScope) } → { sub, files: [{ path, text } | { path, src: { file, kind: 'edf'|'vmrk'|'copy' } }], notes } */
  function buildSubject(d, opts) {
    opts = opts || {}; const sub = B.subOf(d), days = opts.shift || 0, files = [], notes = [], codes = seizureCodes(d), P = d.patient || {};
    const add = (path, text) => files.push({ path: `sub-${sub}/` + path, text }), der = (path, text) => files.push({ path: `derivatives/episcope/sub-${sub}/` + path, text });
    const exs = S.explorationsSorted(d), first = exs.find(e => e.start) || null, T = d.anatomy && d.anatomy.toTemplate ? Array.from(d.anatomy.toTemplate) : null;
    const apply = (M, p) => [M[0] * p[0] + M[1] * p[1] + M[2] * p[2] + M[3], M[4] * p[0] + M[5] * p[1] + M[6] * p[2] + M[7], M[8] * p[0] + M[9] * p[1] + M[10] * p[2] + M[11]];
    const sessions = [];
    for (const ex of exs) {
      const ses = B.sesOf(d, ex), recs = (ex.recordings || []).filter(r => r.files && Object.keys(r.files).length), scans = [];
      for (const r of recs) {
        S.bindRec && S.bindRec(r);
        const dt = B.datatypeOf(ex, r), e = B.recEntities(d, ex, r), base = B.name(Object.assign({}, e, { suffix: '', ext: '' })).replace(/_$/, ''), dir = `ses-${ses}/${dt}/`;
        for (const [k, p] of Object.entries(r.files)) {
          if (!p || !/^(edf|bdf|vhdr|vmrk|eeg)$/.test(k)) continue; const part = B.recPart(k, dt, p), nm = B.name(Object.assign({}, e, part));
          files.push({ path: `sub-${sub}/${dir}${nm}`, src: { file: p, kind: k === 'edf' || k === 'bdf' ? 'edf' : k === 'vmrk' ? 'vmrk' : k === 'vhdr' ? 'vhdr' : 'copy' } });
          if (k === 'edf' || k === 'bdf' || k === 'vhdr') scans.push({ filename: `${dt}/${nm}`, acq_time: r.clock && r.clock.start ? shiftIso(r.clock.start, days).slice(0, 19) : '' });
        }
        add(dir + base + '_channels.tsv', tsv(['name', 'type', 'units', 'low_cutoff', 'high_cutoff', 'status'], (r.channels || []).map(c => ({ name: c.name, type: chType(c), units: 'µV', status: c.status === 'bad' ? 'bad' : 'good' }))));
        // évènements : crises marquées (début, fin) puis annotations du fichier ; temps en secondes depuis le début du fichier
        const ev = [];
        for (const [zid, sl] of Object.entries(r.sz || {})) { const mk = sl && sl.marks; if (!mk) continue; const c = codes.get(zid) || '';
          if (mk.onset != null) ev.push({ onset: r2(mk.onset), duration: mk.end != null ? r2(mk.end - mk.onset) : 0, trial_type: 'seizure', value: c, seizure_id: c });
          for (const u of mk.user || []) ev.push({ onset: r2(u.t), duration: 0, trial_type: 'mark', value: '', seizure_id: c }); }
        for (const x of r.events || []) if (opts.fileEvents !== false) ev.push({ onset: r2(x.onset), duration: r2(x.duration || 0), trial_type: 'annotation', value: x.label, seizure_id: '' });
        ev.sort((a, b) => a.onset - b.onset);
        add(dir + base + '_events.tsv', tsv(['onset', 'duration', 'trial_type', 'value', 'seizure_id'], ev));
        const n = t => (r.channels || []).filter(c => chType(c) === t).length;
        add(dir + base + `_${dt}.json`, json(Object.assign({ TaskName: e.task, SamplingFrequency: r.fs || 'n/a', PowerLineFrequency: r.line || 50, SoftwareFilters: 'n/a', RecordingDuration: r2(r.duration), RecordingType: r.clock && (r.clock.blocks || []).length > 1 ? 'discontinuous' : 'continuous' },
          dt === 'ieeg' ? { iEEGReference: 'voir channels.tsv (référence d’enregistrement)', SEEGChannelCount: n('SEEG'), ECOGChannelCount: n('ECOG'), EEGChannelCount: n('EEG'), ECGChannelCount: n('ECG'), MiscChannelCount: n('MISC') }
            : { EEGReference: 'référence d’enregistrement', EEGChannelCount: n('EEG'), ECGChannelCount: n('ECG'), MiscChannelCount: n('MISC') })));
      }
      // électrodes (SEEG) : repère du T1 du patient, et MNI305 si la transformation existe
      const el = (ex.electrodes || []).filter(s => s.real && s.real.contacts), reg = (opts.regions || {})[ex.id] || {};
      if (el.length) {
        const rows = sp => el.flatMap(s => s.real.contacts.map((c, k) => { const nm = s.name.replace(/’/g, "'") + (k + 1), q = sp === 'MNI305' ? apply(T, c) : c;
          return { name: nm, x: r2(q[0]), y: r2(q[1]), z: r2(q[2]), size: 5.03, group: s.name.replace(/’/g, "'"), hemisphere: s.hemi || '', type: 'depth', manufacturer: s.maker || '', region_vep: reg[nm] || '' }; }));
        const cols = ['name', 'x', 'y', 'z', 'size', 'group', 'hemisphere', 'type', 'manufacturer', 'region_vep'];
        add(`ses-${ses}/ieeg/sub-${sub}_ses-${ses}_space-ScanRAS_electrodes.tsv`, tsv(cols, rows('ScanRAS')));
        add(`ses-${ses}/ieeg/sub-${sub}_ses-${ses}_space-ScanRAS_coordsystem.json`, json({ iEEGCoordinateSystem: 'ScanRAS', iEEGCoordinateUnits: 'mm', iEEGCoordinateSystemDescription: 'RAS scanner du T1 pré-opératoire de référence du patient', iEEGCoordinateProcessingDescription: 'scanner post-implantation recalé sur le T1 (rigide), plots détectés puis validés dans EpiScope' }));
        if (T) {
          add(`ses-${ses}/ieeg/sub-${sub}_ses-${ses}_space-MNI305_electrodes.tsv`, tsv(cols, rows('MNI305')));
          add(`ses-${ses}/ieeg/sub-${sub}_ses-${ses}_space-MNI305_coordsystem.json`, json({ iEEGCoordinateSystem: 'MNI305', iEEGCoordinateUnits: 'mm', iEEGCoordinateProcessingDescription: 'transformation affine 12 ddl du T1 du patient vers le gabarit fsaverage (MNI305), estimée par EpiScope (centres de structures) ; voir derivatives/episcope', iEEGCoordinateProcessingReference: 'Fischl et al. 1999, fsaverage' }));
        } else notes.push(`${ex.label} : pas de transformation vers MNI305 (anatomie du patient non calculée) — électrodes dans le repère du T1 seulement`);
      }
      if (recs.length || el.length) { sessions.push({ session_id: 'ses-' + ses, acq_time: ex.start ? shiftIso(ex.start, days) : '', exploration_type: ex.kind === 'other' ? (ex.context || 'other') : ex.kind });
        if (scans.length) add(`ses-${ses}/sub-${sub}_ses-${ses}_scans.tsv`, tsv(['filename', 'acq_time'], scans)); }
      // dérivés de l'exploration : stimulations, thermocoagulations, résultats par plot
      if ((ex.stims || []).length) der(`ses-${ses}/sub-${sub}_ses-${ses}_stimulations.tsv`, tsv(['pair', 'mode', 'frequency_hz', 'pulse_ms', 'duration_s', 'intensity_ma', 'clinical', 'response_type', 'afterdischarge', 'seizure'],
        ex.stims.map(s => ({ pair: `${String(s.elec || '').replace(/’/g, "'")}${s.c1}-${s.c2}`, mode: s.mode, frequency_hz: s.freq, pulse_ms: s.pulse, duration_s: s.dur, intensity_ma: s.mA, clinical: s.clin ? 1 : 0, response_type: s.clin && SV.Seeg && SV.Seeg.clinTypeOf ? SV.Seeg.clinTypeOf(s) : '', afterdischarge: s.ad ? 1 : 0, seizure: s.sz ? 1 : 0 }))));
      if ((ex.thermo || []).length) der(`ses-${ses}/sub-${sub}_ses-${ses}_thermocoagulations.tsv`, tsv(['pair', 'status', 'date'], ex.thermo.map(t => ({ pair: `${String(t.elec || '').replace(/’/g, "'")}${t.c1}-${t.c2}`, status: S.thermoStatusOf(t), date: shiftIso(t.date, days) }))));
      const qs = (ex.quant || []).filter(q => q.values && Object.keys(q.values).length);
      if (qs.length) {
        der(`ses-${ses}/sub-${sub}_ses-${ses}_results.tsv`, tsv(['set', 'method', 'method_version', 'app_version', 'seizure_id', 'key', 'value', 'unit'], qs.flatMap(q => { const pv = q.resultId ? S.byId(d.results || [], q.resultId) : null;
          return Object.entries(q.values).map(([k, v]) => ({ set: q.name, method: q.method || (pv && pv.method) || '', method_version: pv ? pv.methodVersion : '', app_version: pv && pv.app ? pv.app.version : '', seizure_id: q.seizureId ? codes.get(q.seizureId) || '' : '', key: k.replace(/’/g, "'"), value: v, unit: q.unit || '' })); }))); }
    }
    if (sessions.length) add(`sub-${sub}_sessions.tsv`, tsv(['session_id', 'acq_time', 'exploration_type'], sessions));
    // T1 de référence (option : le visage n'est pas masqué)
    const ref = S.refImaging ? S.refImaging(d) : null;
    if (opts.includeT1 && ref && ref.file) { const ses = B.sesOfImaging ? B.sesOfImaging(d, ref) : 'preop'; files.push({ path: `sub-${sub}/ses-${ses}/anat/sub-${sub}_ses-${ses}_T1w.nii${/\.gz$/.test(ref.file) ? '.gz' : ''}`, src: { file: ref.file, kind: 'copy' } }); }
    // dérivés : crises et sémiologie (sans textes libres), clinique, transformation
    const exOf = z => z.explorationId ? S.byId(d.explorations, z.explorationId) : null, recOf = z => { for (const ex of d.explorations) for (const r of ex.recordings || []) if (r.seizureId === z.id || (r.sz && r.sz[z.id])) return { ex, r }; return null; };
    const szs = d.seizures.slice().sort((a, b) => (codes.get(a.id) || '').localeCompare(codes.get(b.id) || ''));
    if (szs.length) {
      der(`sub-${sub}_seizures.tsv`, tsv(['seizure_id', 'session', 'origin', 'datetime', 'habitual', 'vigilance', 'ilae_onset', 'consciousness', 'fbtc', 'n_signs', 'recording'], szs.map(z => { const ex = exOf(z), il = SV.Store.deriveIlae && opts.db ? S.deriveIlae(z, opts.db) : {}, rr = recOf(z);
        return { seizure_id: codes.get(z.id), session: ex ? 'ses-' + B.sesOf(d, ex) : '', origin: z.origin === 'reported' ? 'reported' : 'recorded', datetime: shiftIso(z.onsetAbs || z.datetime, days), habitual: z.habitual === 'yes' ? 'yes' : z.habitual === 'no' ? 'no' : '', vigilance: z.vigilance, ilae_onset: il.onset, consciousness: il.consciousness, fbtc: il.fbtc ? 1 : il.fbtc === false ? 0 : '', n_signs: (z.events || []).length,
          recording: rr ? B.name(Object.assign({}, B.recEntities(d, rr.ex, rr.r), B.recPart(rr.r.files.edf ? 'edf' : 'vhdr', B.datatypeOf(rr.ex, rr.r), rr.r.files.edf || rr.r.files.vhdr || ''))) : '' }; })));
      der(`sub-${sub}_semiology.tsv`, tsv(['seizure_id', 'rank', 'sign_id', 'sign_label', 'onset_s', 'uncertainty_s', 'duration_s', 'side', 'confidence'], szs.flatMap(z => (z.events || []).slice().sort((a, b) => a.t - b.t).map((e, i) => ({ seizure_id: codes.get(z.id), rank: i + 1, sign_id: e.sign_id, sign_label: opts.signLabel ? opts.signLabel(e.sign_id) : '', onset_s: e.t, uncertainty_s: e.dt, duration_s: e.dur, side: e.side || e.lat || '', confidence: e.conf })))));
    }
    const atl = i => opts.atlasLabel ? opts.atlasLabel(i) : i, regs = a => (a || []).map(atl);
    const months = iso => { const a = first && first.start, m = /^(\d{4})-(\d{2})/.exec(String(iso || '')), n = /^(\d{4})-(\d{2})/.exec(String(a || '')); return m && n ? (+m[1] - +n[1]) * 12 + (+m[2] - +n[2]) : null; };
    der(`sub-${sub}_clinical.json`, json({ sex: P.sex || null, handedness: P.handedness || null, language_dominance: P.dominant || null, epilepsy_onset_age: P.onsetAge === '' ? null : P.onsetAge, age_first_exploration: first ? ageAt(d, first.start) || null : null,
      etiologies: (P.etiologies || []).slice(), lesions: (d.lesions || []).map(l => ({ type: l.type, side: l.side, regions: regs(l.regions), source: l.source })),
      procedures: (d.procedures || []).map(p => ({ type: p.type, side: p.side, regions: regs(p.regions), histology: p.histology || null, months_after_first_exploration: months(p.date) })),
      outcomes: (d.outcomes || []).map(o => ({ months_after_procedure: S.outcomeMonths ? S.outcomeMonths(d, o) : null, engel: o.engel || null, ilae: o.ilae || null })), note: 'dates décalées par sujet ; âges en années ; textes libres non exportés' }));
    if (T) der(`sub-${sub}_from-T1w_to-MNI305_mode-image_xfm.json`, json({ Type: 'affine', Matrix: [T.slice(0, 4), T.slice(4, 8), T.slice(8, 12), T.slice(12, 16)], FromSpace: 'T1w (RAS scanner du T1 de référence)', ToSpace: 'MNI305 (gabarit fsaverage)', Method: (d.anatomy && d.anatomy.method) || 'affine 12 ddl (EpiScope)', RMS_mm: d.anatomy && d.anatomy.fit ? r2(d.anatomy.fit.rms) : null }));
    return { sub, files, notes, participant: { participant_id: 'sub-' + sub, sex: P.sex === 'M' ? 'M' : P.sex === 'F' ? 'F' : 'n/a', age: first ? ageAt(d, first.start) : '', handedness: P.handedness === 'R' ? 'R' : P.handedness === 'L' ? 'L' : P.handedness === 'A' ? 'A' : 'n/a' } };
  }

  /** fichiers communs du jeu : description, participants, README, .bidsignore, description des dérivés */
  function datasetFiles(parts, opts) {
    opts = opts || {}; const v = opts.version || '';
    return [
      { path: 'dataset_description.json', text: json({ Name: opts.name || 'EpiScope — export de recherche', BIDSVersion: VERSION, DatasetType: 'raw', License: opts.license || 'n/a', GeneratedBy: [{ Name: 'EpiScope', Version: v, Description: 'export anonymisé : codes neutres, dates décalées par sujet, en-têtes EDF anonymisés' }] }) },
      { path: 'participants.tsv', text: tsv(['participant_id', 'sex', 'age', 'handedness'], parts) },
      { path: 'participants.json', text: json({ age: { Description: 'âge à la première exploration', Units: 'year' }, sex: { Description: 'sexe', Levels: { M: 'masculin', F: 'féminin' } }, handedness: { Description: 'latéralité manuelle', Levels: { R: 'droitier', L: 'gaucher', A: 'ambidextre' } } }) },
      { path: 'README', text: `Export de recherche EpiScope ${v}\n\nDonnées anonymisées : codes neutres (sub-<site><numéro>), dates décalées d'un nombre de jours propre à chaque sujet (intervalles conservés), âges en années, en-têtes EDF anonymisés, pas de vidéo ni de capture, textes libres non exportés.\nÉlectrodes : repère du T1 du patient (space-ScanRAS) et gabarit MNI305 (transformation affine 12 ddl, voir derivatives/episcope).\nDérivés EpiScope : derivatives/episcope (crises, sémiologie, stimulations, thermocoagulations, résultats par plot avec méthode et version, clinique).\n` },
      { path: '.bidsignore', text: 'derivatives/episcope/**/*_clinical.json\n' },
      { path: 'derivatives/episcope/dataset_description.json', text: json({ Name: 'EpiScope — dérivés', BIDSVersion: VERSION, DatasetType: 'derivative', GeneratedBy: [{ Name: 'EpiScope', Version: v }] }) },
    ];
  }

  // ---------------------------------------------------------------- contrôle : identité absente de l'export
  /** chaînes identifiantes d'un dossier (nom, prénom, IPP, date de naissance sous plusieurs écritures, ancien pseudonyme) */
  const secretsOf = d => S.secretsOf(d);
  /** occurrences des chaînes dans un texte (sans tenir compte de la casse ni des accents) → [chaîne] */
  const fold = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  function scanSecrets(text, secrets) { const T = fold(text); return (secrets || []).filter(s => T.includes(fold(s))); }

  SV.Research = { VERSION, newShift, shiftIso, ageAt, edfAnonShift, vmrkShift, seizureCodes, buildSubject, datasetFiles, secretsOf, scanSecrets, tsv };
})(window.SV = window.SV || {});
