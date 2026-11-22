/* EpiScope — provenance_ui.js (v1.1.0) : provenance des jeux d'Analyses dans l'interface.
 *   - provRecord(q, o) : appelé à chaque enregistrement d'un jeu (EI, autres méthodes, maximum sur les crises, import) ;
 *     range dans d.results un résultat complet (méthode et version, version d'EpiScope, auteur, tracé et son empreinte,
 *     fenêtre et marques, montage, voies exclues, correspondance, réglages, valeurs) et note q.resultId ;
 *   - empreinte SHA-256 du fichier du tracé calculée à l'ouverture de la visionneuse si elle manque (rec.sha256) ;
 *   - pastille de provenance dans le détail de chaque jeu (Analyses) et état : à jour, périmé (entrée changée), ancienne
 *     méthode, valeurs modifiées à la main, antérieur à la v1.1 ; « historique » : calculs précédents du même jeu (CSV).
 *   Modèle et règles : provenance.js ; rangement : store.addResult.                                                  */
(function (SV) {
  'use strict';
  const S = SV.Store, P = SV.Prov, L = SV.Library, A = SV.app, esc = SV.U.esc;
  const STATE = { current: ['à jour', 'ok'], stale: ['périmé', 'warn'], 'old-method': ['ancienne méthode', 'warn'], legacy: ['origine non enregistrée', 'muted'], edited: ['valeurs modifiées à la main', 'warn'], none: ['sans provenance', 'muted'] };
  const mainFile = rec => { const f = rec && rec.files || {}; return f.edf || f.bdf || f.eeg || Object.values(f)[0] || null; };

  const M = {
    /** empreinte du fichier du tracé (calculée une fois, gardée dans rec.sha256) */
    async provRecHash(rec) {
      if (!rec || rec.sha256 || !this.dossier) return rec && rec.sha256 || null;
      const p = mainFile(rec); if (!p) return null;
      try { const b = await L.readFile(this.dossier, p); if (!b) return null; const h = await P.sha256(b); if (h) { rec.sha256 = h; rec.size = b.size; this.touch && this.touch(); } return h; } catch (e) { console.warn('empreinte du tracé', e); return null; }
    },
    /** fenêtre d'analyse d'un emplacement (réglages de la méthode, sinon dernier calcul, sinon marques de la crise) */
    provWindow(rec, slot, seizureId) {
      const k = String(slot || '').split(':')[0], src = seizureId && rec.seizureId !== seizureId && rec.bySz && rec.bySz[seizureId] ? rec.bySz[seizureId] : rec, x = src[k] || {}, p = x.params || {}, l = x.last || {}, mk = src.marks || {};
      const t0 = p.start != null ? p.start : l.start != null ? l.start : l.onset != null ? l.onset : mk.onset, t1 = p.end != null ? p.end : l.end != null ? l.end : l.offset != null ? l.offset : mk.end;
      const ab = t => (rec.clock && t != null ? S.clockAbs(rec.clock, +t) : null);   // v1.1.0 : fenêtre aussi en heure absolue
      return { t0: t0 == null ? null : +t0, t1: t1 == null ? null : +t1, abs0: ab(t0), abs1: ab(t1), marks: { onset: mk.onset == null ? null : mk.onset, end: mk.end == null ? null : mk.end } };
    },
    provParams(rec, slot, seizureId) { const k = String(slot || '').split(':')[0], src = seizureId && rec.seizureId !== seizureId && rec.bySz && rec.bySz[seizureId] ? rec.bySz[seizureId] : rec; return src[k] && src[k].params ? JSON.parse(JSON.stringify(src[k].params)) : null; },
    /** empreinte de la correspondance voies → électrodes en vigueur (exploration + tracé) */
    provMapHash(rec) { const ex = this.ieegExOf ? this.ieegExOf(rec) : null; return P.hashJSON(Object.assign({}, (ex && ex.elecMap) || {}, rec.elecMap || {})); },
    provRecOf(q) { const d = this.dossier; if (!d || !q || !q.ieeg) return null; for (const ex of d.explorations) for (const r of ex.recordings || []) if (r.id === q.ieeg) return r; return null; },
    /** range le résultat du jeu q ; o = { slot, rec, params, map, summary, runs, file } */
    async provRecord(q, o) {
      const d = this.dossier; if (!d || !q) return null; o = o || {};
      const rec = o.rec || this.provRecOf(q), slot = o.slot || q.method || 'import', ex = (this.ieegEx && this.ieegEx()) || null, inputs = [];
      if (rec) {
        const sha = await this.provRecHash(rec), w = this.provWindow(rec, slot, q.seizureId || rec.seizureId), ei = rec.ei || {};
        inputs.push({ type: 'recording', id: rec.id, title: rec.title || '', sha256: sha, size: rec.size || null, format: rec.format || '', fs: rec.fs || null, nSamples: rec.nSamples || null });
        inputs.push({ type: 'window', t0: w.t0, t1: w.t1 }, { type: 'marks', onset: w.marks.onset, end: w.marks.end });
        const V = this._iev && this._iev.rec === rec ? this._iev : null;
        inputs.push({ type: 'montage', kind: (V && V.montage) || (rec.view && rec.view.montage) || 'bipolar', layout: V && V.lay ? V.lay.kind : null });
        inputs.push({ type: 'excluded', voies: (ei.excluded || []).slice(), plots: (ei.excludedContacts || []).slice() });
        inputs.push({ type: 'elecMap', hash: this.provMapHash(rec), used: o.map ? P.hashJSON(o.map) : null });
      }
      if (o.runs) inputs.push({ type: 'runs', ids: o.runs.slice(), results: (ex && ex.quant || []).filter(x => x.resultId && x !== q && o.runs.some(id => x.seizureId && id.includes(x.seizureId))).map(x => x.resultId) });
      if (o.file) inputs.push({ type: 'file', name: o.file });
      const params = o.params !== undefined ? o.params : rec ? this.provParams(rec, slot, q.seizureId || rec.seizureId) : null;
      const r = P.make({ method: String(slot).startsWith('max') ? 'max' : slot, by: (L && L.user) || '', label: q.name, note: q.source || '', params,
        scope: { explorationId: ex && ex.id, recordingId: rec ? rec.id : null, seizureId: q.seizureId || (rec && rec.seizureId) || null, slot: q.id }, inputs, outputs: { values: q.values || {}, summary: o.summary || null } });
      if (String(slot).startsWith('max:')) r.sub = String(slot).slice(4);
      S.addResult(d, r); q.resultId = r.id; q.valuesHash = P.hashJSON(q.values || {});
      if (this.touch) this.touch(); if (this.ui && this.ui.tab === 'quant' && this.renderQuant) this.renderQuant();
      return r;
    },
    /** état du jeu q : { state, reasons, r } */
    provStatus(q) {
      const d = this.dossier, r = d && q && q.resultId ? S.resultById(d, q.resultId) : null; if (!r) return { state: 'none', reasons: ['jeu enregistré sans calcul (saisie, ou avant la version 1.1)'], r: null };
      if (!r.legacy && q.valuesHash && q.valuesHash !== P.hashJSON(q.values || {})) return { state: 'edited', reasons: ['les valeurs du jeu ne sont plus celles du calcul'], r };
      const rec = this.provRecOf(q), cur = {};
      if (rec && !r.legacy && r.method !== 'max' && r.method !== 'import') {
        if (rec.sha256) cur.recording = { sha256: rec.sha256 };
        const sz = r.scope.seizureId, w = this.provWindow(rec, r.scope.slot && q.method ? q.method : r.method, sz); if (w.t0 != null && P.inputOf(r, 'window') && P.inputOf(r, 'window').t0 != null) cur.window = { t0: w.t0, t1: w.t1 };
        cur.elecMap = { hash: this.provMapHash(rec) };
        const pr = this.provParams(rec, q.method || r.method, sz); if (pr && r.params) cur.params = pr;
      }
      return Object.assign(P.status(r, cur), { r });
    },
    /** ligne de provenance dans le détail d'un jeu */
    provHtml(q) {
      const st = this.provStatus(q), [lab, cls] = STATE[st.state] || STATE.none, r = st.r, n = r ? S.resultLineage(this.dossier, r.id).length - 1 : 0;
      return `<div class="qx-prov" data-q="${esc(q.id)}"><span class="badge ${cls}" title="${esc(st.reasons.join(' ; ') || 'résultat à jour')}">${esc(lab)}</span> <span class="muted small" title="${r ? esc(P.chip(r) + (r.app && r.app.build ? ' · build ' + r.app.build : '')) : ''}">${r ? esc(P.chip(r)) : ''}</span>${r ? ` <a data-a="prov">${n ? `historique (${n} calcul${n > 1 ? 's' : ''} antérieur${n > 1 ? 's' : ''})` : 'détails'}</a>` : ''}${st.reasons.length && st.state !== 'current' ? `<div class="hint warn small">${esc(st.reasons.join(' ; '))}</div>` : ''}</div>`;
    },
    /** fenêtre : détail du résultat et calculs antérieurs du même jeu */
    provDialog(qid) {
      const d = this.dossier, q = (this.state && this.state.quant || []).find(x => x.id === qid) || d.explorations.flatMap(e => e.quant || []).find(x => x.id === qid); if (!q || !q.resultId) return;
      const lin = S.resultLineage(d, q.resultId), M0 = P.METHODS, row = r => { const inp = t => P.inputOf(r, t) || {}; const rc = inp('recording'), w = inp('window'), mt = inp('montage'), xx = inp('excluded');
        return `<tr data-r="${esc(r.id)}"><td>${r.id === q.resultId ? '● ' : ''}${esc(P.day(r.created) || '—')}</td><td>${esc((M0[r.method] || {}).label || r.method)}${r.sub ? ' · ' + esc(r.sub) : ''} ${esc(r.methodVersion)}</td><td>${esc((r.app && r.app.version) || '')}</td><td>${esc(r.by || '')}</td>
          <td class="small">${rc.title ? esc(rc.title) + (rc.sha256 ? ` <span class="mono muted" title="SHA-256 ${esc(rc.sha256)}">${esc(rc.sha256.slice(0, 10))}…</span>` : '') : ''}${w.t0 != null ? ` · ${(+w.t0).toFixed(1)}–${w.t1 != null ? (+w.t1).toFixed(1) : '?'} s` : ''}${mt.kind ? ' · ' + esc(mt.kind === 'mono' ? 'référence' : mt.kind === 'bipolar' ? 'cascade' : mt.kind) : ''}${xx.voies && (xx.voies.length || xx.plots.length) ? ` · ${xx.voies.length + xx.plots.length} exclusion(s)` : ''}</td>
          <td>${Object.keys((r.outputs && r.outputs.values) || {}).length}</td><td><button class="mini-btn" data-a="csv">CSV</button></td></tr>`; };
      const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div class="modal-card" style="max-width:980px"><div class="modal-head"><b>Provenance — ${esc(q.name)}</b><span class="spacer"></span><button class="close">✕</button></div><div class="prov-body">
        <div class="hint">Chaque calcul enregistré est gardé : méthode et version, version d’EpiScope, auteur, tracé (empreinte SHA-256 du fichier), fenêtre, montage, exclusions, réglages et valeurs. Pour rejouer un calcul ancien, rouvrir la version d’EpiScope notée sur le même fichier. ● : jeu affiché.</div>
        <table class="sf-t"><thead><tr><th>date</th><th>méthode</th><th>EpiScope</th><th>par</th><th>tracé · fenêtre · montage</th><th>valeurs</th><th></th></tr></thead><tbody>${lin.map(row).join('')}</tbody></table>
        <details style="margin-top:8px"><summary>Réglages du calcul affiché</summary><pre class="small" style="white-space:pre-wrap">${esc(JSON.stringify((S.resultById(d, q.resultId) || {}).params, null, 1) || '—')}</pre></details></div></div>`;
      document.body.appendChild(m); m.querySelector('.close').onclick = () => m.remove(); m.onclick = e => { if (e.target === m) m.remove(); };
      m.querySelectorAll('[data-a=csv]').forEach(b => b.onclick = () => { const r = S.resultById(d, b.closest('tr').dataset.r), V = (r.outputs && r.outputs.values) || {};
        const lines = [`# EpiScope — ${q.name} — ${P.chip(r)}${r.legacy ? '' : ' — résultat ' + r.id}`, 'plot;valeur', ...Object.keys(V).map(k => `${k};${String(V[k]).replace('.', ',')}`)];
        this.download(`${(q.name || 'jeu').replace(/[^\w\-]+/g, '_')}_${(r.created || 'ancien').slice(0, 10)}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8'); });
    },
  };
  Object.assign(A, M);

  // détail d'un jeu (Analyses, cartes des tracés) : ligne de provenance après la source
  SV.Hooks.wrap(A, 'quantRowHtml', function (orig, q) { const h = orig(); if (!this.dossier || !q) return h; return h.replace('<div class="qx-det">', '<div class="qx-det">' + this.provHtml(q)); }, 'provenance_ui');
  // ouverture d'un tracé : empreinte du fichier si elle manque (en arrière-plan)
  SV.Hooks.wrap(A, 'ieegOpen', async function (orig, rec) { const r = await orig(); if (rec && !rec.sha256) this.provRecHash(rec); return r; }, 'provenance_ui');
  // « historique » / « détails » : fenêtre de provenance
  document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('.qx-prov [data-a=prov]'); if (!a) return; e.preventDefault(); e.stopPropagation(); A.provDialog(a.closest('.qx-prov').dataset.q); }, true);
})(window.SV = window.SV || {});
