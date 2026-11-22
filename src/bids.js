/* EpiScope — bids.js (v1.1.0) : noms de fichiers selon BIDS (Brain Imaging Data Structure, v1.10), sans DOM, testable sous Node.
 *   Entités dans l'ordre de la spécification : sub, ses, task, acq, ce, rec, dir, run, mod, echo, space, desc ; puis _suffixe.ext.
 *   Sujet = code neutre du dossier (store.makeSubject, ex. HFAR0007) ; jamais un nom, une date de naissance ni un nom de fichier
 *   d'origine (les exports des logiciels d'acquisition portent souvent le nom du patient).
 *   Sessions : une par exploration (scalp1, seeg1, seeg2…, rang parmi les explorations du même type, par date de début) ;
 *   imagerie : le temps de l'examen (preop, postimplant, postthermo, postop, followup).
 *   Disposition cible (étape « disposition BIDS ») : sub-X/ses-Y/<type>/fichier ; dérivés sous derivatives/episcope/.
 *   Tracés : ses-<session>/<ieeg|eeg>/ dans le répertoire du patient ; caches de calcul dans ieeg/<id du tracé>/.              */
(function (SV) {
  'use strict';
  const ORDER = ['sub', 'ses', 'task', 'acq', 'ce', 'rec', 'dir', 'run', 'mod', 'echo', 'space', 'desc'];
  /** étiquette d'entité : lettres et chiffres seulement */
  const label = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]/g, '');
  const pad = (n, w) => String(Math.max(0, n | 0)).padStart(w || 2, '0');
  /** nom BIDS : ent = { sub, ses, task, …, suffix, ext } ; entités vides omises ; ext avec ou sans point */
  function name(ent) {
    const parts = []; for (const k of ORDER) { if (ent[k] == null || ent[k] === '') continue; const v = k === 'run' || k === 'echo' ? (typeof ent[k] === 'number' ? pad(ent[k]) : label(ent[k])) : label(ent[k]); if (v) parts.push(k + '-' + v); }
    if (ent.suffix) parts.push(label(ent.suffix) || ent.suffix);
    const ext = ent.ext ? (ent.ext[0] === '.' ? ent.ext : '.' + ent.ext) : '';
    return parts.join('_') + ext;
  }
  /** analyse d'un nom BIDS → { sub, ses, …, suffix, ext } (null si ce n'est pas un nom BIDS) */
  function parse(n) {
    const base = String(n || '').split('/').pop(), m = base.match(/^((?:[a-z]+-[A-Za-z0-9]+_)*)([A-Za-z0-9]+)((?:\.[A-Za-z0-9]+)*)$/);
    if (!m || !/^sub-/.test(base)) return null;
    const out = {}; for (const kv of m[1].split('_').filter(Boolean)) { const i = kv.indexOf('-'); out[kv.slice(0, i)] = kv.slice(i + 1); }
    out.suffix = m[2]; out.ext = m[3]; return out;
  }
  const isBids = n => !!parse(n);
  /** sujet du dossier : code neutre ; à défaut un repère tiré de l'identifiant interne (jamais du pseudonyme) */
  const subOf = d => label((d && d.subject && d.subject.label) || ('X' + String((d && d.id) || '').slice(-8)));
  /** session d'une exploration : scalp1, seeg2… */
  function sesOf(d, ex) {
    if (!ex) return '';
    const kind = ex.kind === 'phase1' ? 'scalp' : ex.kind === 'seeg' ? 'seeg' : ex.context === 'ambu' ? 'ambu' : ex.context === 'postop' ? 'postop' : 'expl';
    const same = ((d && d.explorations) || []).filter(e => e.kind === ex.kind && (e.context || '') === (ex.context || '')).slice().sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')) || String(a.id).localeCompare(String(b.id)));
    return kind + (Math.max(0, same.findIndex(e => e.id === ex.id)) + 1);
  }
  /** session d'imagerie : temps de l'examen */
  const sesOfImaging = im => label((im && im.timepoint) || 'preop');
  /** type de données d'un tracé : ieeg (SEEG, ECoG) ou eeg (scalp) */
  const datatypeOf = (ex, rec) => (rec && rec.datatype) || (ex && ex.kind === 'phase1' ? 'eeg' : 'ieeg');
  /** tâche BIDS d'un tracé : seizure (critique), interictal, sleep, stim, sinon monitoring */
  function taskOf(rec) {
    const k = rec && rec.kind; if (rec && rec.task) return label(rec.task);
    return k === 'ictal' ? 'seizure' : k === 'inter' ? 'interictal' : k === 'sleep' ? 'sleep' : k === 'stim' ? 'stim' : 'monitoring';
  }
  /** numéro de passage : rang du tracé parmi ceux de la même exploration et de la même tâche (ordre d'import), 1 si seul */
  function runOf(ex, rec) {
    const t = taskOf(rec), list = ((ex && ex.recordings) || []).filter(r => taskOf(r) === t);
    const i = list.findIndex(r => r.id === rec.id); if (i >= 0) return i + 1;
    // nouveau tracé : après le plus grand run déjà porté par un nom de fichier (un tracé mis à la corbeille ne libère pas son numéro)
    let mx = list.length; for (const r of list) for (const p of Object.values(r.files || {})) { const e = parse(p); if (e && e.task === t && +e.run > mx) mx = +e.run; }
    return mx + 1;
  }
  /** fichiers d'un tracé : clé interne (edf, bdf, vhdr, vmrk, eeg, channels, events, json) → { suffixe, extension } */
  function recPart(key, dt, origName) {
    const ext = (String(origName || '').match(/\.([A-Za-z0-9]+)$/) || [, ''])[1].toLowerCase();
    if (key === 'edf') return { suffix: dt, ext: ext === 'bdf' ? '.bdf' : '.edf' };
    if (key === 'vhdr' || key === 'vmrk' || key === 'eeg') return { suffix: dt, ext: '.' + key };
    if (key === 'channels') return { suffix: 'channels', ext: '.tsv' };
    if (key === 'events') return { suffix: 'events', ext: '.tsv' };
    if (key === 'json') return { suffix: dt, ext: '.json' };
    return { suffix: dt, ext: ext ? '.' + ext : '' };
  }
  /** base des noms d'un tracé (sans suffixe) */
  const recEntities = (d, ex, rec) => ({ sub: subOf(d), ses: sesOf(d, ex), task: taskOf(rec), run: runOf(ex, rec) });
  /** chemin d'un fichier de tracé dans le répertoire du patient (= sub-<code>) : ses-<session>/<ieeg|eeg>/<nom BIDS> ;
   *  les caches de calcul (fp_*.bin…) restent dans ieeg/<id du tracé>/, hors arborescence brute */
  function recPath(d, ex, rec, key, origName) {
    const dt = datatypeOf(ex, rec), p = recPart(key, dt, origName), e = recEntities(d, ex, rec);
    return `ses-${e.ses}/${dt}/` + name(Object.assign(e, p));
  }
  /** titre lisible sans nom de fichier d'origine : « Crise · 02/03/2026 22:03 · run 01 » */
  function recTitle(rec, run) {
    const T = { seizure: 'Crise', interictal: 'Intercritique', sleep: 'Sommeil', stim: 'Stimulation', monitoring: 'Tracé' }[taskOf(rec)] || 'Tracé';
    const md = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rec.startDate || ''), mt = /^(\d{1,2})[:.](\d{2})/.exec(String(rec.startTime || '').trim());
    const dmy = md ? `${md[3]}/${md[2]}/${md[1]}` : String(rec.startDate || '').replace(/\./g, '/'), hm = mt ? mt[1].padStart(2, '0') + ':' + mt[2] : '';
    return [T, [dmy, hm].filter(Boolean).join(' '), run ? 'run ' + pad(run) : ''].filter(Boolean).join(' · ');
  }
  /** BrainVision : les en-têtes citent leurs fichiers compagnons ; noms réécrits octet par octet (latin-1 conservé) */
  function vhdrRename(bytes, dataFile, markerFile) {
    let s = ''; const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes); for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192));
    if (dataFile) s = s.replace(/^(DataFile\s*=).*$/mi, '$1' + dataFile);
    if (markerFile) s = s.replace(/^(MarkerFile\s*=).*$/mi, '$1' + markerFile);
    const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 255; return out;
  }
  /** EDF / BDF : en-tête anonymisé pour un partage (copie) — champ patient (octets 8–88) → « X X X X » ; champ
   *  enregistrement (88–168) : « Startdate jj-MMM-aaaa » gardé (EDF+), le reste → « X X X » ; signal inchangé */
  function edfAnon(bytes) {
    const u = new Uint8Array(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)); if (u.length < 256) return u;
    const out = u.slice(0), put = (off, len, s) => { for (let i = 0; i < len; i++) out[off + i] = i < s.length ? s.charCodeAt(i) & 127 : 32; };
    const rec = String.fromCharCode.apply(null, u.subarray(88, 168)), sd = /^Startdate\s+(\S+)/.exec(rec);
    put(8, 80, 'X X X X'); put(88, 80, sd ? `Startdate ${sd[1]} X X X` : 'X');
    return out;
  }
  /** plan de renommage d'un dossier : fichiers de tracés aux noms d'origine → noms BIDS ; titres et libellés tirés des noms
   *  de fichiers d'origine → titres neutres. Rien n'est fait ici ; library/interface appliquent (voir bids_ui.js). */
  function renamePlan(d) {
    const files = [], titles = [];
    for (const ex of (d && d.explorations) || []) for (const rec of ex.recordings || []) {
      const run = runOf(ex, rec), names = {};
      for (const [k, p] of Object.entries(rec.files || {})) { if (!p) continue; const to = recPath(d, ex, rec, k, p); names[k] = to.split('/').pop(); if (to !== p) files.push({ recId: rec.id, key: k, from: p, to }); }
      if (files.some(f => f.recId === rec.id) && !rec.titleSet) titles.push({ kind: 'recording', id: rec.id, from: rec.title || '', to: recTitle(rec, run) });
      if (rec.files && rec.files.vhdr && files.some(f => f.recId === rec.id)) files.filter(f => f.recId === rec.id && f.key === 'vhdr').forEach(f => { f.rewrite = { dataFile: names.eeg, markerFile: names.vmrk }; });
      if (rec.files && rec.files.vmrk && files.some(f => f.recId === rec.id)) files.filter(f => f.recId === rec.id && f.key === 'vmrk').forEach(f => { f.rewrite = { dataFile: names.eeg }; });
    }
    for (const im of (d && d.imaging) || []) if (/\.(nii|nii\.gz|img|hdr)$/i.test(im.label || '') || /\.(nii|nii\.gz)$/i.test(im.source || '')) titles.push({ kind: 'imaging', id: im.id, from: im.label || '', to: imagingLabel(im) });
    return { files, titles, n: files.length + titles.length };
  }
  /** applique les titres neutres d'un plan : tracés, images, et toutes les reprises de l'ancien titre (noms et sources des jeux
   *  d'analyses — y compris ceux de l'espace de travail ouvert, extraQuant —, captures, libellés des résultats, journal) ; renvoie le nombre de textes modifiés */
  function applyTitles(d, titles, extraQuant) {
    let n = 0; const subs = [];
    for (const t of titles || []) {
      const obj = t.kind === 'imaging' ? (d.imaging || []).find(x => x.id === t.id) : [].concat(...(d.explorations || []).map(e => e.recordings || [])).find(x => x.id === t.id);
      if (!obj) continue;
      if (t.kind === 'imaging') { obj.label = t.to; if (obj.source === t.from || /\.(nii|nii\.gz)$/i.test(obj.source || '')) obj.source = 'NIfTI'; } else obj.title = t.to;
      n++; if (t.from && t.from.length >= 3 && t.from !== t.to) subs.push([t.from, t.to]);
    }
    const fix = (o, k) => { if (!o || typeof o[k] !== 'string') return; let v = o[k]; for (const [a, b] of subs) v = v.split(a).join(b); if (v !== o[k]) { o[k] = v; n++; } };
    if (subs.length) {
      for (const q of [].concat(...(d.explorations || []).map(ex => ex.quant || []), extraQuant || [])) { fix(q, 'name'); fix(q, 'source'); }
      for (const g of d.gallery || []) { fix(g, 'title'); fix(g, 'caption'); }
      for (const j of d.journal || []) fix(j, 'text');
      for (const r of d.results || []) { fix(r, 'name'); fix(r, 'label'); for (const i of r.inputs || []) fix(i, 'title'); }
    }
    return n;
  }
  /** libellé neutre d'une image : « T1 · preop · 2025-01-10 » */
  const imagingLabel = im => [im.modality || 'image', im.timepoint || '', im.date || ''].filter(Boolean).join(' · ');
  /** chemin BIDS cible d'une image (disposition BIDS, étape suivante) */
  function imagingPath(d, im, run) {
    const suf = { T1: 'T1w', T1c: 'T1w', T2: 'T2w', FLAIR: 'FLAIR', CT: 'CT', PET: 'pet', SPECT: 'spect' }[im.modality] || 'unknown';
    const dt = im.modality === 'PET' ? 'pet' : 'anat', ce = im.modality === 'T1c' ? 'gadolinium' : '';
    return `sub-${subOf(d)}/ses-${sesOfImaging(im)}/${dt}/` + name({ sub: subOf(d), ses: sesOfImaging(im), ce, run: run || '', suffix: suf, ext: '.nii.gz' });
  }
  SV.BIDS = { VERSION: '1.10.0', ORDER, label, name, parse, isBids, subOf, sesOf, sesOfImaging, datatypeOf, taskOf, runOf, recPart, recEntities, recPath, recTitle, vhdrRename, edfAnon, renamePlan, applyTitles, imagingLabel, imagingPath };
})(typeof window !== 'undefined' ? (window.SV = window.SV || {}) : (globalThis.SV = globalThis.SV || {}));
