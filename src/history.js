/* EpiScope — history.js (v1.0.1) : historique des révisions du dossier, sans dépendance au DOM (testable sous Node).
 *
 *   Avant chaque réécriture de dossier.json, la bibliothèque (library.js) peut ranger l'état précédent dans
 *   history/dossier.r<révision>.<horodatage>.<motif>.json.gz. Ce module donne :
 *   - le nom d'une révision et sa relecture (name, parse) ;
 *   - la décision de prendre ou non un instantané à l'enregistrement (due) : toujours pour un motif « structurel »
 *     (suppression, restauration, import…), sinon au premier enregistrement de la séance puis toutes les 10 min ;
 *   - la politique de rétention (keep) : les motifs épinglés jamais supprimés ; sinon tout pendant 48 h, puis une
 *     révision par jour jusqu'à 90 jours, puis une par mois ; toujours les 20 plus récentes ;
 *   - la compression gzip (CompressionStream, navigateur et Node ≥ 18).                                            */
(function (factory) {
  const G = typeof window !== 'undefined' ? (window.SV = window.SV || {}) : (globalThis.SV = globalThis.SV || {});
  factory(G); (G._factories = G._factories || {}).history = factory;
})(function (SV) {
  'use strict';
  const DIR = 'history';
  /** motifs gardés pour toujours (points de restauration volontaires ou avant une opération lourde) */
  const PINNED = new Set(['remove', 'restore', 'import', 'migrate', 'manual', 'purge', 'trash']);
  const LABEL = { open: 'ouverture', auto: 'automatique', remove: 'avant une suppression', restore: 'avant une restauration', import: 'avant un import', migrate: 'avant une migration', manual: 'point de restauration', purge: 'avant une purge', trash: 'avant mise à la corbeille' };
  const SPACING_MS = 10 * 60000, H48 = 48 * 3600e3, D90 = 90 * 864e5, KEEP_RECENT = 20;

  const pad = (n, w) => String(n).padStart(w, '0');
  /** horodatage ISO → 20261121T153002Z (UTC, sans séparateurs) */
  function stamp(iso) { const t = new Date(iso || Date.now()); if (isNaN(t)) return stamp(); return t.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z'); }
  function unstamp(s) { const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s || ''); return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : null; }
  const cleanReason = r => (String(r || 'auto').toLowerCase().replace(/[^a-z]/g, '') || 'auto').slice(0, 16);
  function name(rev, iso, reason) { return `dossier.r${pad(Math.max(0, rev | 0), 6)}.${stamp(iso)}.${cleanReason(reason)}.json.gz`; }
  /** nom → { name, rev, t (ISO), ms, reason } ou null */
  function parse(n) {
    const m = /^dossier\.r(\d+)\.(\d{8}T\d{6}Z)\.([a-z]+)\.json\.gz$/.exec(String(n || '').split('/').pop()); if (!m) return null;
    const t = unstamp(m[2]); return { name: m[0], rev: +m[1], t, ms: Date.parse(t), reason: m[3], pinned: PINNED.has(m[3]) };
  }
  /** faut-il ranger l'état précédent ? reason : motif forcé (ou null) ; lastMs : dernier instantané de la séance (ou null) */
  function due(reason, lastMs, nowMs) {
    if (reason) return cleanReason(reason);
    if (lastMs == null) return 'open';
    return (nowMs || Date.now()) - lastMs >= SPACING_MS ? 'auto' : null;
  }
  /** noms à garder parmi la liste ; les autres peuvent être supprimés */
  function keep(names, nowMs) {
    nowMs = nowMs || Date.now();
    const E = names.map(parse).filter(Boolean).sort((a, b) => b.ms - a.ms || b.rev - a.rev), out = new Set(), day = new Set(), month = new Set();
    E.forEach((e, i) => {
      const age = nowMs - e.ms, dk = e.t.slice(0, 10), mk = e.t.slice(0, 7);
      if (e.pinned || i < KEEP_RECENT || age < H48) { out.add(e.name); return; }
      if (age < D90) { if (!day.has(dk)) { day.add(dk); out.add(e.name); } return; }
      if (!month.has(mk)) { month.add(mk); out.add(e.name); }
    });
    for (const n of names) if (!parse(n)) out.add(n);   // fichiers inconnus : jamais touchés
    return out;
  }
  async function streamBytes(stream) { const parts = [], r = stream.getReader(); let n = 0; for (;;) { const { done, value } = await r.read(); if (done) break; parts.push(value); n += value.length; } const u = new Uint8Array(n); let o = 0; for (const p of parts) { u.set(p, o); o += p.length; } return u; }
  /** texte → octets gzip */
  async function gzip(text) { const s = new Blob([new TextEncoder().encode(text)]).stream().pipeThrough(new CompressionStream('gzip')); return streamBytes(s); }
  /** octets gzip (Uint8Array ou Blob) → texte */
  async function gunzip(bytes) { const b = bytes instanceof Blob ? bytes : new Blob([bytes]); const s = b.stream().pipeThrough(new DecompressionStream('gzip')); return new TextDecoder().decode(await streamBytes(s)); }

  SV.History = { DIR, PINNED, LABEL, SPACING_MS, name, parse, due, keep, gzip, gunzip, stamp };
});
