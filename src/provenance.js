/* EpiScope — provenance.js (v1.1.0) : d'où vient chaque résultat affiché, sans dépendance au DOM (testable sous Node).
 *
 *   Chaque calcul enregistré (EI, cEI, PEI, h², empreinte, EM, pointes / HFO, sources, sommeil, jeu importé…) laisse un
 *   enregistrement immuable dans d.results (store.addResult) :
 *     { id, method, methodVersion, app: { version, build }, created, by,
 *       scope: { explorationId, recordingId, seizureId, slot }, inputs: [...], params, outputs: { values, summary }, status,
 *       supersedes, legacy }
 *   Recalculer crée un nouvel enregistrement (l'ancien passe « superseded » et reste consultable) ; le jeu d'Analyses (ex.quant)
 *   affiché porte q.resultId. Une méthode change de version dès que sa sortie peut changer pour une même entrée : les tests
 *   « dorés » (tools/tests/test_methods_golden.mjs) échouent tant que la version ici n'est pas montée.
 *   Rejouer un ancien calcul : rouvrir l'EpiScope.html de la version notée (Releases GitHub) sur le même tracé (empreinte). */
(function (factory) {
  const G = typeof window !== 'undefined' ? (window.SV = window.SV || {}) : (globalThis.SV = globalThis.SV || {});
  factory(G); (G._factories = G._factories || {}).provenance = factory;
})(function (SV) {
  'use strict';
  /** méthodes et versions (MAJEUR : définition changée ; MINEUR : réglage par défaut ou traitement changé ; CORRECTIF : erreur
   *  corrigée qui change certains résultats). Toute montée de version : ligne « Méthodes » du CHANGELOG. */
  const METHODS = {
    ei: { v: '1.0.0', label: 'EI', ref: 'Bartolomei, Chauvel, Wendling, Brain 2008' },
    cei: { v: '1.0.0', label: 'cEI', ref: 'Balatskaya et al., Clin Neurophysiol 2020' },
    pei: { v: '1.0.0', label: 'PEI', ref: 'Bratu et al., Epilepsia 2024' },
    h2: { v: '1.0.0', label: 'h²', ref: 'Wendling 2001 ; Lagarde 2018' },
    fp: { v: '1.0.0', label: 'Empreinte', ref: 'Grinenko et al., Brain 2018' },
    em: { v: '1.0.0', label: 'EM', ref: 'David et al., Brain 2011' },
    hfo: { v: '1.0.0', label: 'Pointes · HFO', ref: 'Roehri et al., IEEE TBME 2016 (Delphos)' },
    esp: { v: '1.0.0', label: 'Pointes → source', ref: 'sLORETA, dipôle équivalent' },
    esz: { v: '1.0.0', label: 'Début de crise → source', ref: 'sLORETA, dipôle équivalent' },
    src: { v: '1.0.0', label: 'Source SEEG', ref: 'triangulation des plots' },
    slp: { v: '1.0.0', label: 'Sommeil', ref: 'YASA, Vallat & Walker, eLife 2021' },
    max: { v: '1.0.0', label: 'Maximum sur les crises', ref: 'EImax, cEImax, PEImax' },
    import: { v: '1.0.0', label: 'Jeu importé', ref: 'fichier ou saisie' },
    semio: { v: '1.0.0', label: 'Modèle sémiologique', ref: 'model.js' },
  };
  /** clé de méthode d'un jeu d'Analyses (q.method : 'ei', 'cei', 'hfo:taux…', 'pei'…) */
  const methodOf = m => { const k = String(m || '').split(':')[0]; return METHODS[k] ? k : (k ? k : 'import'); };
  const versionOf = m => (METHODS[methodOf(m)] || { v: '0.0.0' }).v;
  const app = () => { const B = (typeof window !== 'undefined' && window.EPISCOPE_BRAND) || SV.BRAND || {}; return { version: B.version || '0.0.0', build: B.build || '' }; };
  const cmpV = (a, b) => { const p = v => String(v || '0').split('-')[0].split('.').map(n => +n || 0); const x = p(a), y = p(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };

  // ---------------------------------------------------------------- empreintes
  /** FNV-1a 64 bits (deux moitiés de 32) d'un texte → 16 hexadécimaux ; pour les petites entrées (réglages, correspondances) */
  function fnv(str) {
    let h1 = 0x811c9dc5, h2 = 0x050c5d1f; str = String(str);
    for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 ^= c; h1 = Math.imul(h1, 0x01000193) >>> 0; h2 ^= c + i; h2 = Math.imul(h2, 0x01000193) >>> 0; }
    return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
  }
  /** JSON canonique (clés triées) pour qu'un même contenu donne la même empreinte */
  function canon(x) { if (x == null || typeof x !== 'object') return JSON.stringify(x === undefined ? null : x); if (Array.isArray(x)) return '[' + x.map(canon).join(',') + ']'; return '{' + Object.keys(x).sort().filter(k => x[k] !== undefined).map(k => JSON.stringify(k) + ':' + canon(x[k])).join(',') + '}'; }
  const hashJSON = x => fnv(canon(x));
  /** SHA-256 d'octets (Uint8Array, ArrayBuffer ou Blob) → hexadécimal ; null si l'API manque */
  async function sha256(data) {
    const C = (typeof crypto !== 'undefined' && crypto.subtle) ? crypto : null; if (!C) return null;
    const buf = data instanceof ArrayBuffer ? data : data && typeof data.arrayBuffer === 'function' ? await data.arrayBuffer() : data.buffer ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data;
    const h = new Uint8Array(await C.subtle.digest('SHA-256', buf)); let s = ''; for (const b of h) s += b.toString(16).padStart(2, '0'); return s;
  }

  // ---------------------------------------------------------------- enregistrements
  const uid = () => 'res' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const clone = o => o == null ? o : JSON.parse(JSON.stringify(o));
  /** nouvel enregistrement de résultat (immuable une fois rangé par store.addResult) */
  function make(o) {
    const method = methodOf(o.method);
    return { id: uid(), method, sub: o.method && String(o.method).includes(':') ? String(o.method).split(':').slice(1).join(':') : undefined, methodVersion: versionOf(method), app: app(), created: new Date().toISOString(), by: o.by || '',
      scope: Object.assign({ explorationId: null, recordingId: null, seizureId: null, slot: null }, o.scope || {}), inputs: clone(o.inputs || []), params: clone(o.params == null ? null : o.params),
      outputs: { values: clone((o.outputs && o.outputs.values) || {}), summary: clone((o.outputs && o.outputs.summary) || null) }, status: 'current', supersedes: null, label: o.label || '', note: o.note || '' };
  }
  /** jeu d'Analyses enregistré avant la v1.1 : résultat « antérieur », sans réglages ni empreintes connus */
  function legacy(q, ex) {
    const r = make({ method: q.method || (q.source ? 'import' : 'import'), scope: { explorationId: ex && ex.id, recordingId: q.ieeg || null, seizureId: q.seizureId || null, slot: q.method || null }, outputs: { values: q.values || {} }, label: q.name, note: q.source || '' });
    r.legacy = true; r.app = { version: '< 1.1.0', build: '' }; r.methodVersion = 'antérieure'; r.created = null; return r;
  }
  /** clé du « même calcul » : méthode (et sous-mesure), tracé, crise, emplacement */
  const keyOf = r => [r.method, r.sub || '', r.scope.recordingId || '', r.scope.seizureId || '', r.scope.slot || ''].join('|');
  /** entrée d'un type donné */
  const inputOf = (r, type) => (r && r.inputs || []).find(i => i.type === type) || null;

  /** état d'un résultat face à l'état actuel : current, old-method (version de méthode dépassée), stale (entrée changée),
   *  legacy (antérieur à la v1.1) ; cur = { recording: { sha256 }, window: { t0, t1 }, params, montage, elecMap } (champs facultatifs) */
  function status(r, cur) {
    if (!r) return { state: 'none', reasons: [] };
    if (r.legacy) return { state: 'legacy', reasons: ['calculé avant la version 1.1 : méthode, réglages et tracé non enregistrés'] };
    const reasons = []; cur = cur || {};
    const rec = inputOf(r, 'recording'); if (rec && rec.sha256 && cur.recording && cur.recording.sha256 && rec.sha256 !== cur.recording.sha256) reasons.push('le fichier du tracé a changé');
    const w = inputOf(r, 'window'); if (w && cur.window && (Math.abs((w.t0 || 0) - (cur.window.t0 || 0)) > 1e-3 || Math.abs((w.t1 || 0) - (cur.window.t1 || 0)) > 1e-3)) reasons.push('la fenêtre d’analyse ou les marques ont changé');
    const m = inputOf(r, 'montage'); if (m && cur.montage && m.kind !== cur.montage.kind) reasons.push('le montage a changé');
    const em = inputOf(r, 'elecMap'); if (em && cur.elecMap && em.hash !== cur.elecMap.hash) reasons.push('la correspondance voies → électrodes a changé');
    if (cur.params && r.params && hashJSON(r.params) !== hashJSON(cur.params)) reasons.push('les réglages ont changé');
    if (reasons.length) return { state: 'stale', reasons };
    if (cmpV(r.methodVersion, versionOf(r.method)) < 0) return { state: 'old-method', reasons: [`${(METHODS[r.method] || {}).label || r.method} ${r.methodVersion} — version actuelle ${versionOf(r.method)}`] };
    return { state: 'current', reasons: [] };
  }
  const p2 = n => (n < 10 ? '0' : '') + n;
  const day = iso => { const d = iso ? new Date(iso) : null; return d && !isNaN(d) ? `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}` : ''; };
  /** libellé court : « EI 1.0.0 · 21/11/2026 · EpiScope 1.1.0 · LG » */
  function chip(r) {
    if (!r) return ''; const M = METHODS[r.method] || { label: r.method };
    if (r.legacy) return `${M.label} · antérieur à la version 1.1`;
    return [`${M.label} ${r.methodVersion}`, day(r.created), `EpiScope ${r.app && r.app.version}`, r.by].filter(Boolean).join(' · ');
  }
  SV.Prov = { METHODS, methodOf, versionOf, cmpV, fnv, canon, hashJSON, sha256, make, legacy, keyOf, inputOf, status, chip, day };
});
