/* EpiScope — ieeg_methods_ui.js : onglets de quantification de la visionneuse SEEG (v4.15–4.18) — EI | cEI | PEI | h² | Empreinte | EM | Pointes · HFO (Empreinte et EM : ieeg_ez_ui.js) ; fond coloré propre à chaque onglet, pointes avec HFO, couplage à l’onde lente.
 *   Chaque onglet suit la même trame : référence (infobulle de méthode), légende des marqueurs du tracé, fenêtre d'analyse
 *   (calée sur la crise annotée, modifiable ; clic droit sur le tracé), réglages repliés, calcul (workers, barre de progression,
 *   annulation), tableau des voies (clic : voie choisie et tracé centré), enregistrement dans un jeu d'Analyses (3D, coupes,
 *   régions) et CSV. Les plots ou voies exclus (« Voies ▾ › Analyse », clic droit) valent pour toutes les méthodes.
 *   - cEI (Balatskaya 2020) : h² orienté dans les workers ; degré sortant médian ; EI recalculé sur la même fenêtre (réglages
 *     ν, λ, H, τ de l'onglet EI) ; seuil h² modifiable sans recalcul tant que la visionneuse est ouverte ;
 *   - PEI (Bratu 2024) : demande le début et la fin de crise annotés ; courbe de l'entropie de permutation sous chaque voie,
 *     périodes préictale / ictale / postictale ombrées, minimum ictal (▼) et maximum postictal (▲) ;
 *   - Pointes · HFO (Delphos, Roehri 2016) : sur un fond intercritique (fenêtre par défaut : jusqu'à 5 min avant la crise) ;
 *     évènements dessinés sur le tracé (▲ pointe, barres ripple / fast ripple / gamma), navigation d'un évènement à l'autre,
 *     taux par minute ; évènements rangés dans ieeg/<id>/hfo_<montage>.json (hors archive légère).
 *   rec.cei = { params, last: { at, montage, names, out, in, rows, nWin, ms } } ; rec.pei = { params, last: { onset, offset, rows, cov } } ;
 *   rec.hfo = { params, last: { start, end, dur, fs, fmax, rows, path } } ; rec.quantIds = { cei, pei, 'hfo:<mesure>' }.          */
(function (SV) {
  'use strict';
  const DR = SV.IeegDraw, IE = SV.IEEG, IM = SV.IEEGM, S = SV.Seeg, ST = SV.Store, L = SV.Library, A = SV.app;
  const { esc, nf, num, clamp, clock, fmtDur, uid, glyph, tick } = DR;
  const METH = [
    { k: 'ei', label: 'EI', title: 'Index d’épileptogénicité — Bartolomei, Chauvel, Wendling, Brain 2008' },
    { k: 'cei', label: 'cEI', title: 'Index d’épileptogénicité de connectivité — Balatskaya et al., Clin Neurophysiol 2020' },
    { k: 'pei', label: 'PEI', title: 'Index d’entropie de permutation — Bratu et al., Epilepsia 2024' },
    { k: 'h2', label: 'h²', title: 'Connectivité h² (régression non linéaire, Wendling 2001) : au fil de la crise (liens dirigés) ou force des nœuds intercritique (Lagarde 2018)' },
    { k: 'fp', label: 'Empreinte', title: 'Empreinte de la zone épileptogène — Grinenko et al., Brain 2018 : pointes préictales, activité rapide multibande, suppression concomitante des basses fréquences (temps-fréquence)' },
    { k: 'em', label: 'EM', title: 'Cartes d’épileptogénicité — David et al., Brain 2011 : puissance haute fréquence au début de crise contre la référence (t), délais, carte sur l’IRM' },
    { k: 'hfo', label: 'Pointes · HFO', title: 'Détecteur Delphos de pointes, ripples et fast ripples — Roehri et al., IEEE TBME 2016 ; pointes avec HFO, couplage à l’onde lente' },
    { k: 'esp', label: 'Pointes → source', title: 'Pointes intercritiques détectées, groupées par topographie et moyennées ; imagerie de source à mi-montée (sLORETA, dipôle équivalent) — esi_ui.js' },
    { k: 'esz', label: 'Début de crise → source', title: 'Rythme du début de crise : fréquence dominante, imagerie de source de la fenêtre, composantes indépendantes — esi_ui.js' },
    { k: 'slp', label: 'Sommeil', title: 'Stadification automatique du sommeil (AASM : éveil, N1, N2, N3, paradoxal) — YASA, Vallat & Walker, eLife 2021 — sleep_ui.js' },
    { k: 'src', label: 'Source', title: 'Source du début de crise à partir de tous les plots (référence commune) : générateur triangulé entre les électrodes ou hors de l’implantation — esi_ui.js' },
  ];
  const HC = { spk: '#ffd60a', r: '#22e06b', fr: '#ff3b30', g: '#b794ff', vfo: '#ff7ae0' };
  const HL = { spk: 'pointes', r: 'ripples', fr: 'fast ripples', g: 'gamma', vfo: 'VFO', cross: 'taux croisé', spkR: 'pointes avec ripple', spkFR: 'pointes avec fast ripple', pHFO: 'part des pointes avec HFO', mvl: 'couplage HFO–onde lente' };
  const HUNIT = { spk: '/min', r: '/min', fr: '/min', cross: '/min', spkR: '/min', spkFR: '/min', pHFO: '', mvl: '' };
  const BC = ['spk', 'r', 'fr', 'g', 'vfo'];
  const PECOL = { dark: '#ffb000', light: '#b06a00' };
  const download = (name, lines) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); };
  const f3 = v => v == null || !isFinite(v) ? '' : String(Math.round(v * 1000) / 1000).replace('.', ',');
  const fname = (p, rec) => p + '_' + rec.title.replace(/[^\w\-]+/g, '_').slice(0, 60) + '.csv';
  const svg = (w, body) => `<svg width="${w}" height="14" viewBox="0 0 ${w} 14">${body}</svg>`;
  const LGH = {
    spk: svg(14, `<path d="M7 2L12 12H2Z" fill="${HC.spk}" stroke="#000" stroke-width="1.1" stroke-linejoin="round"/>`),
    bar: c => svg(18, `<rect x="1.5" y="5" width="15" height="4" rx="1" fill="${c}" stroke="#000" stroke-width="1"/>`),
    pe: svg(18, `<path d="M1 4C5 4 6 11 9 11S13 5 17 4" stroke="${PECOL.dark}" fill="none" stroke-width="1.5"/>`),
    min: svg(14, `<path d="M7 11L2.6 4H11.4Z" fill="${PECOL.dark}" stroke="#000" stroke-width="1.1" stroke-linejoin="round"/>`),
    max: svg(14, `<path d="M7 3L11.4 10H2.6Z" fill="#7bd389" stroke="#000" stroke-width="1.1" stroke-linejoin="round"/>`),
    zone: c => svg(16, `<rect x="1" y="2" width="14" height="10" rx="2" fill="${c}" stroke="rgba(127,127,127,.6)"/>`),
  };
  const ZONE = { pre: 'rgba(76,201,240,0.10)', ict: 'rgba(255,90,95,0.10)', post: 'rgba(123,211,137,0.10)' };

  const M = {
    // ================================================================ trame commune
    /** onglets de la quantification (point : méthode déjà calculée pour ce tracé) */
    ieegTabs() {
      const V = this._iev, nav = V && V.side.querySelector('.ie-mt'); if (!nav) return; const rec = V.rec;
      const done = { ei: !!(rec.ei && rec.ei.last), cei: !!(rec.cei && rec.cei.last), pei: !!(rec.pei && rec.pei.last), h2: !!(rec.h2 && rec.h2.last), fp: !!(rec.fp && rec.fp.last), em: !!(rec.em && rec.em.last), hfo: !!(rec.hfo && rec.hfo.last), esp: !!(rec.esp && rec.esp.last), esz: !!(rec.esz && rec.esz.last), src: !!(rec.src && rec.src.last), slp: !!(rec.sleep && rec.sleep.stages) }, list = this.ieegMethList();
      nav.innerHTML = METH.filter(m => list.includes(m.k)).sort((a, b) => list.indexOf(a.k) - list.indexOf(b.k)).map(m => `<button data-m="${m.k}" class="${V.meth === m.k ? 'on' : ''}" title="${esc(m.title)}${done[m.k] ? ' — calculé' : ''}">${m.label}${done[m.k] ? '<i></i>' : ''}</button>`).join('') + '<button class="ie-mtx" title="Replier le panneau d’analyse (le tracé prend toute la largeur)">›</button>';
      nav.querySelector('.ie-mtx').onclick = () => { try { localStorage.setItem('sv_ieeg_side', '0'); } catch (e) { /* stockage indisponible */ } this.ieegEIPanel(false); };
      nav.querySelectorAll('button[data-m]').forEach(b => b.onclick = () => { if (V.meth === b.dataset.m || V.mbusy) { if (V.mbusy) this.toast('Calcul en cours (Annuler pour changer d’onglet)'); return; } if (V.loupe) this.ieegHFOLoupe(false); V.meth = b.dataset.m; (rec.view = rec.view || {}).meth = V.meth; V.dirty = true; this.ieegEIPanel(true); });
    },
    /** onglets selon la nature du tracé : crise (EI, cEI, PEI, h², pointes et HFO du fond préictal) ou intercritique */
    ieegMethList() { const V = this._iev; return V && this.ieegKind(V.rec) === 'inter' ? ['hfo', 'h2'] : ['ei', 'cei', 'pei', 'h2', 'fp', 'em', 'hfo']; },
    ieegMethRender(onlyRes) {
      const V = this._iev; this.ieegTabs(); if (V.meth === 'h2' && this.ieegH2Render) return this.ieegH2Render(onlyRes);
      if (V.meth === 'cei') return this.ieegCEIRender(onlyRes);
      if (V.meth === 'pei') return this.ieegPEIRender(onlyRes);
      if (V.meth === 'hfo') return this.ieegHFORender(onlyRes);
      if (V.meth === 'fp' && this.ieegFPRender) return this.ieegFPRender(onlyRes);
      if (V.meth === 'em' && this.ieegEMRender) return this.ieegEMRender(onlyRes);
    },
    /** dérivations SEEG valides du montage affiché, hors exclusions */
    ieegMDers() { const V = this._iev, ex = this.ieegExcl(); return V.D.filter(d => d.seeg && !d.bad && !ex.has(d.name)); },
    ieegSig(ders, a, b) { const V = this._iev, fs = V.mem.fs, i0 = Math.max(0, Math.round(a * fs)), i1 = Math.min(V.mem.nSamples, Math.round(b * fs)); return ders.map(d => IE.deriveSignal(V.mem.data, d, i0, i1)); },
    /** calcul réparti dans des workers (repli : fil courant, par morceaux) ; jobs = [{ args, transfer }] */
    async ieegPar(method, jobs) {
      const V = this._iev, prog = jobs.map(() => 0), upd = (j, p) => { prog[j] = p; V.mprog = prog.reduce((s, x) => s + x, 0) / jobs.length; this.ieegMProg(); };
      if (!(SV.Work && SV.Work.available)) {
        const fn = method.split('.').reduce((o, k) => o && o[k], SV), out = [];
        for (let j = 0; j < jobs.length; j++) { await new Promise(r => setTimeout(r, 0)); if (V.mcancel) throw new Error('annulé'); out.push(fn(...jobs[j].args, p => upd(j, p))); upd(j, 1); }
        return out;
      }
      const n = Math.max(1, Math.min(8, ((navigator.hardwareConcurrency || 2) - 1), jobs.length)), pool = SV.Work.pool(['ieeg', 'ieegm'], n); V.mpool = pool;
      try { return await Promise.all(jobs.map((jb, j) => pool.call(method, jb.args, jb.transfer || [], p => upd(j, p)))); }
      finally { pool.close(); if (V.mpool === pool) V.mpool = null; }
    },
    ieegMProg() { const V = this._iev, b = V && V.sb.querySelector('.ie-mprog i'); if (b) b.style.width = Math.round((V.mprog || 0) * 100) + '%'; },
    ieegMCancel() { const V = this._iev; if (!V) return; V.mcancel = true; if (V.mpool) V.mpool.close(); },
    /** dérivation → ligne enregistrée (nom, électrode du tracé, plots) */
    ieegRowOf(d) { return { name: d.name, elec: d.elec, k1: d.k1, k2: d.k2 }; },
    /** jeu d'Analyses d'une méthode (un par tracé et par mesure) : valeurs portées sur les plots du schéma */
    ieegSaveSet(slot, rows, valueOf, meta) {
      const V = this._iev, rec = V.rec; if (!this.state) { this.toast('Ouvrir l’exploration SEEG pour enregistrer le jeu'); return null; }
      const map = this.ieegMapFor(rec, [...new Set(rows.map(r => r.elec))]), values = {}, unmatched = [];
      for (const r of rows) { const en = map[r.elec], e = en && S.findElec(this.elecs || [], en), v = valueOf(r); if (!e || r.k1 == null || v == null || !isFinite(v)) { unmatched.push(r.name); continue; } values[r.k2 != null ? S.pairLabel(e.name, r.k1, r.k2) : S.pairLabel(e.name, r.k1)] = Math.round(v * 1000) / 1000; }
      if (!Object.keys(values).length) { this.toast('Aucune voie ne correspond aux électrodes du schéma : compléter la correspondance (onglet EI, en bas du panneau)', 6000); return null; }
      this.ensureSeeg(); const st = this.state; rec.quantIds = rec.quantIds || {}; let q = rec.quantIds[slot] && st.quant.find(x => x.id === rec.quantIds[slot]), isNew = !q;
      if (!q) { q = { id: uid('q'), name: meta.name, unit: meta.unit || '', cmap: meta.cmap || 'inferno', mode: 'both', min: meta.min != null ? meta.min : 0, max: meta.max != null ? meta.max : 1 }; st.quant.push(q); rec.quantIds[slot] = q.id; }
      else if (meta.rescale) { q.min = meta.min != null ? meta.min : q.min; q.max = meta.max != null ? meta.max : q.max; }
      Object.assign(q, { source: meta.source, values, unmatched, ieeg: rec.id, method: slot }, meta.extra ? meta.extra(map) : {});
      if (this.viewer) this.viewer.setCellConfig(this.viewer.active, this.quantViewCfg(q), true); this.ensureSeeg().quantOpenId = q.id;
      this.seegChanged(); if (this.refreshMarkers) this.refreshMarkers(); this.touch('exploration', (this.ieegEx() || {}).id, meta.what || 'quantification'); V.dirty = true;
      if (this.ui.tab === 'quant') this.renderQuant(); this.ieegMethRender();
      this.toast(`${isNew ? 'Jeu' : 'Jeu mis à jour :'} « ${q.name} » — ${Object.keys(values).length} plots${unmatched.length ? `, ${unmatched.length} voie${unmatched.length > 1 ? 's' : ''} hors schéma` : ''} ; affiché dans la vue 3D active`, 6000);
      return q;
    },
    ieegSetBtn(slot, label) { const V = this._iev, id = V.rec.quantIds && V.rec.quantIds[slot], q = id && ((this.state && this.state.quant) || []).find(x => x.id === id); return q ? `Mettre à jour « ${esc(q.name)} »` : esc(label || 'Enregistrer dans Analyses (3D)'); },
    /** en-tête d'un onglet : titre, référence (méthode en infobulle), légende, avertissement */
    ieegMHead(title, ref, method, legend, warn) {
      return `<div class="ie-eih" title="${esc(method)}"><b>${title}</b><span class="muted">${ref} ⓘ</span></div>${legend ? `<div class="ie-legend">${legend}</div>` : ''}${warn ? `<div class="ie-warnbox">⚠ ${warn}</div>` : ''}`;
    },
    /** correspondance avec le schéma (réglée dans l'onglet EI) */
    ieegMapNote() { return this.ieegMapHtml ? this.ieegMapHtml() : ''; },
    ieegBusyHtml(label) { const V = this._iev; return `<div class="ie-status"><span>${esc(label)}…</span><button class="ie-mstop">Annuler</button><div class="ie-prog ie-mprog"><i style="width:${Math.round((V.mprog || 0) * 100)}%"></i></div></div>`; },
    ieegBindCommon(side) {
      const V = this._iev, st = side.querySelector('.ie-mstop'); if (st) st.onclick = () => this.ieegMCancel();
      side.querySelectorAll('[data-go]').forEach(a => a.onclick = () => { V.meth = a.dataset.go; V.rec.view.meth = V.meth; this.ieegEIPanel(true); });
      if (this.ieegMapBind) this.ieegMapBind(side);
    },
    /** voie choisie dans un tableau : sélectionnée et tracé centré sur t */
    ieegGotoT(name, t) {
      const V = this._iev, li = V.D.findIndex(d => d.name === name); if (li >= 0) { V.sel = li; const j = V.lanes.indexOf(li), nv = (V.geo && V.geo.nVis) || 10; if (j >= 0 && (j < V.scroll || j >= V.scroll + nv)) V.scroll = Math.max(0, j - Math.floor(nv / 2)); }
      if (t != null) { V.t = clamp(t - V.page / 2, 0, Math.max(0, V.mem.duration - V.page)); V.cursor = t; }
      this.ieegDraw(); this.ieegMethRender(true);
    },
    /** saisie numérique d'un réglage (fenêtre : réglage manuel) */
    ieegNumIn(side, cls, P, key, min, after) { const i = side.querySelector(cls); if (!i) return; i.onchange = () => { const v = num(i.value, P[key]); P[key] = min != null ? Math.max(min, v) : v; if (['start', 'end'].includes(key)) P.auto = false; this._iev.dirty = true; after(); }; },

    // ================================================================ cEI
    ieegCEIParams() {
      const V = this._iev, rec = V.rec; rec.cei = rec.cei || {}; const P = rec.cei.params || (rec.cei.params = {}), D = IM.CEI;
      for (const [k, v] of Object.entries({ thr: D.thr, win: D.win, step: D.step, lag: D.lag, lo: D.band[0], hi: D.band[1], ezn: IE.EZT.cei })) if (P[k] == null) P[k] = v;
      if (P.ezn === 0.65 && !P.eznSet) P.ezn = IE.EZT.cei;   // ancien défaut (≤ v4.19) → 0,6
      if (P.start == null || P.end == null || P.auto == null) this.ieegCEIFit(P);
      return P;
    },
    /** fenêtre du cEI : 3 s avant le début de crise → 20 s après (Balatskaya 2020 : 20–30 s commençant 3 s avant) */
    ieegCEIFit(P) { const V = this._iev, mk = V.rec.marks || {}, on = mk.onset != null ? mk.onset : this.ieegEIParams().start, dur = V.mem.duration; P.start = Math.max(0, on - IM.CEI.pre); P.end = Math.min(dur, on + IM.CEI.dur); P.auto = true; },
    /** EI sur la fenêtre du cEI (réglages ν, λ, H, τ et référence de l'onglet EI) : Map(voie → EI) */
    ieegCEIEI() {
      const V = this._iev, E = V.er; if (!E) return null; const P = this.ieegEIParams(), C = this.ieegCEIParams(), ex = this.ieegExcl(), idx = [], manual = {};
      E.names.forEach((n, i) => { if (!ex.has(n)) idx.push(i); }); idx.forEach((i, j) => { const t = V.rec.ei.manual[E.names[i]]; if (t != null && t >= C.start && t <= C.end) manual[j] = t; });
      if (C.start - (+P.base || 0) < E.range[0] - 1e-6 || C.end + P.H > E.range[1] + 1e-6) return null;
      const r = IE.epileptogenicity(idx.map(i => E.ers[i]), { t0: E.t0, dt: E.dt, start: Math.max(0, C.start - (+P.base || 0)), end: C.end, szEnd: C.end, nu: P.nu, lambda: P.lambda, tau: P.tau, H: P.H, manual });
      return new Map(idx.map((i, j) => [E.names[i], r.rows[j].ei]));
    },
    async ieegCEICompute() {
      const V = this._iev; if (!V || V.mbusy) return; const rec = V.rec, P = this.ieegCEIParams(), E = V.er;
      if (!E) { this.toast('Rapport d’énergie en cours : réessayer dans un instant'); if (!V.computing) this.ieegComputeER(); return; }
      const ex = this.ieegExcl(), ders = E.ders.filter(d => !ex.has(d.name)); if (ders.length < 3) { this.toast('Trop peu de voies pour une connectivité'); return; }
      const fs = V.mem.fs, pad = 1, a = Math.max(0, P.start - pad), b = Math.min(V.mem.duration, P.end + pad), tA = performance.now();
      V.mbusy = 'cei'; V.mcancel = false; V.mprog = 0; this.ieegCEIRender();
      try {
        const prep = IM.ceiPrep(this.ieegSig(ders, a, b), fs, { band: [P.lo, P.hi] }), f2 = prep.fs, sig = prep.sig, len = sig[0].length;
        const W = Math.round(P.win * f2), step = Math.max(1, Math.round(P.step * f2)), lag = Math.max(0, Math.round(P.lag * f2)), first = Math.max(lag, Math.round((P.start - a) * f2));
        const nWin = Math.min(Math.floor((Math.round((P.end - a) * f2) - first - W) / step) + 1, Math.floor((len - lag - W - first) / step) + 1);
        if (!(nWin >= 1)) throw new Error(`fenêtre trop courte (au moins ${nf(P.win, 1)} s)`);
        const N = sig.length, nj = Math.min(N, 4 * Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 2) - 1))), size = Math.ceil(N / nj), jobs = [];
        for (let i = 0; i < N; i += size) { const rows = []; for (let r = i; r < Math.min(N, i + size); r++) rows.push(r); jobs.push({ args: [sig, rows, { W, step, lag, first, nWin, bins: IM.CEI.bins }] }); }
        const parts = await this.ieegPar('IEEGM.h2Batch', jobs); if (this._iev !== V) return;
        const H = new Float32Array(N * N * nWin), Lg = new Int8Array(N * N * nWin); let off = 0; for (const p of parts) { H.set(p.H, off); Lg.set(p.L, off); off += p.H.length; }
        V.cei = { names: ders.map(d => d.name), ders, H, L: Lg, N, nWin, f2 };
        rec.cei.last = { at: ST.now(), montage: E.montage, nWin, ms: Math.round(performance.now() - tA), start: P.start, end: P.end, names: V.cei.names.slice() };
        this.ieegCEIDegrees(); V.dirty = true; this.touch();
      } catch (e) { if (!V.mcancel) { console.warn(e); this.toast('cEI : ' + e.message, 7000); } }
      finally { V.mbusy = null; V.mcancel = false; if (this._iev === V) { this.ieegMethRender(); this.ieegDraw(); } }
    },
    /** graphe orienté au seuil h² choisi → degrés sortants (voies retenues : hors exclusions) */
    ieegCEIDegrees() {
      const V = this._iev, C = V.cei, rec = V.rec, P = this.ieegCEIParams(); if (!C) return; const ex = this.ieegExcl(), keep = C.names.map((n, i) => ex.has(n) ? -1 : i).filter(i => i >= 0);
      const D = IM.ceiDegrees(C.H, C.L, C.N, C.nWin, P.thr, keep), out = {}, inn = {}; keep.forEach(i => { out[C.names[i]] = D.out[i]; inn[C.names[i]] = D.in[i]; });
      Object.assign(rec.cei.last, { out, in: inn, thr: P.thr }); this.ieegCEIRecombine();
    },
    /** cEI = EI (même fenêtre) + degré sortant, normalisés (rangé dans rec.cei.last.rows) */
    ieegCEIRecombine() {
      const V = this._iev, rec = V.rec, Lr = rec.cei && rec.cei.last; if (!Lr || !Lr.out) return; const eiMap = this.ieegCEIEI(); if (!eiMap) { V.ceiBy = new Map((Lr.rows || []).map(r => [r.name, r])); return; }
      const byD = new Map((V.er ? V.er.ders : V.D).map(d => [d.name, d])), names = Object.keys(Lr.out).filter(n => eiMap.has(n) && byD.has(n)), ei = names.map(n => eiMap.get(n)), out = names.map(n => Lr.out[n]), c = IM.ceiCombine(ei, out);
      Lr.rows = names.map((n, i) => Object.assign(this.ieegRowOf(byD.get(n)), { ei: Math.round(ei[i] * 1e4) / 1e4, out: out[i], in: Lr.in[n], cei: Math.round(c[i] * 1e4) / 1e4 }));
      V.ceiBy = new Map(Lr.rows.map(r => [r.name, r]));
    },
    ieegCEIRender(onlyRes) {
      const V = this._iev, side = V.sb, rec = V.rec, P = this.ieegCEIParams(), mk = rec.marks || {}, Lr = rec.cei.last, E = V.er, ex = this.ieegExcl();
      if (!V.ceiBy && Lr) this.ieegCEIRecombine();
      const sel = V.sel >= 0 && V.D[V.sel] ? V.D[V.sel].name : null;
      const resHtml = () => {
        if (!Lr || !Lr.rows) return '';
        const rows = Lr.rows.filter(r => !ex.has(r.name)).sort((a, b) => b.cei - a.cei || a.name.localeCompare(b.name, 'fr', { numeric: true })), nHi = rows.filter(r => r.cei >= P.ezn).length;
        const stale = Lr.montage !== V.montage ? ` · <span class="warn">calculé en ${Lr.montage === 'bipolar' ? 'bipolaire' : 'monopolaire'}</span>` : Math.abs(Lr.start - P.start) > 1e-6 || Math.abs(Lr.end - P.end) > 1e-6 ? ' · <span class="warn">fenêtre modifiée : recalculer</span>' : '';
        return `<div class="ie-n0">${rows.length} voies · <b>${nHi}</b> cEI ≥ ${nf(P.ezn)} · ${Lr.nWin} fenêtres de ${nf(P.win, 1)} s · seuil h² ${nf(Lr.thr)}${stale}</div>
          <div class="ie-tabwrap"><table class="ie-tab" style="--thr:${Math.round(P.ezn * 100)}%"><tr><th>voie</th><th title="EI (normalisé) sur la fenêtre du cEI">EI</th><th title="Degré sortant médian : connexions h² ≥ seuil dont la voie précède l’autre">sortant</th><th>cEI</th></tr>
          ${rows.map(r => `<tr data-n="${esc(r.name)}" class="${r.cei >= P.ezn ? 'hi' : ''}${r.name === sel ? ' sel' : ''}"><td class="nm mono">${esc(r.name)}</td><td>${nf(r.ei, 2)}</td><td>${nf(r.out, 1)}</td><td><i class="ie-bar"><b style="width:${Math.round(r.cei * 100)}%"></b></i>${nf(r.cei, 2)}</td></tr>`).join('')}</table></div>`;
      };
      const bindRes = box => box.querySelectorAll('tr[data-n]').forEach(tr => tr.onclick = () => this.ieegGotoT(tr.dataset.n, null));
      if (onlyRes && side.querySelector('.ie-res')) { const box = side.querySelector('.ie-res'), w = box.querySelector('.ie-tabwrap'), sc = w ? w.scrollTop : 0; box.innerHTML = resHtml(); bindRes(box); const w2 = box.querySelector('.ie-tabwrap'); if (w2) w2.scrollTop = sc; return; }
      const METHOD = 'Connectivité orientée : coefficient de régression non linéaire h² (Wendling 2001) entre toutes les paires de voies bipolaires filtrées 12–45 Hz, fenêtres de 3 s (pas 0,5 s), délai ≤ 0,1 s ; sens de plus fort h², direction donnée par le délai ; seuil h² 0,2 → graphe de chaque fenêtre ; degré sortant médian. cEI = (EI normalisé + degré sortant normalisé), normalisé à 1. Seuils : 0,2–0,5 les meilleurs (F1) dans Balatskaya 2020 ; surlignage par défaut à 0,6.';
      const warn = mk.onset == null ? 'Début de crise non annoté : la fenêtre part du début de la fenêtre de l’EI. Marquer le début de crise (clic droit sur le tracé).' : V.montage !== 'bipolar' ? 'Le cEI se calcule en montage bipolaire (référence commune : connectivité biaisée). <a data-mont="bipolar">Passer en bipolaire</a>' : '';
      const busy = V.mbusy === 'cei';
      side.innerHTML = this.ieegMHead('EI de connectivité (cEI)', 'Balatskaya et al., Clin Neurophysiol 2020', METHOD,
        `<span><i class="ie-lgbar" style="background:linear-gradient(90deg,#4cc9f0,#ff5a5f)"></i> cEI par voie (barre à gauche du tracé)</span><span><svg width="16" height="12"><rect x="1" y="2" width="14" height="8" fill="rgba(76,201,240,.25)" stroke="#4cc9f0"/></svg> fenêtre du cEI</span><span>détections Nd de l’EI ▼ conservées</span>`, warn)
        + `<div class="ie-sec"><div class="ie-sh">Fenêtre d’analyse <span class="muted">(${P.auto ? 'crise annotée : −3 s → +20 s' : 'réglée à la main'})</span></div>
            <div class="ctrl-row"><label>début <input type="number" step="0.5" class="c-start" value="${+P.start.toFixed(2)}"> s</label><label>fin <input type="number" step="0.5" class="c-end" value="${+P.end.toFixed(2)}"> s</label><button class="c-fit" title="Recaler sur le début de crise annoté">↺ crise annotée</button></div>
            <label class="ie-sl" title="Seuil de h² pour qu’une connexion compte (graphe de chaque fenêtre)">seuil h² <input type="range" class="c-thr" min="0.05" max="0.6" step="0.01" value="${P.thr}"${Lr && !V.cei ? ' disabled title="recalculer pour changer le seuil"' : ''}><output>${nf(P.thr)}</output></label>
            <label class="ie-sl" title="Valeur de cEI surlignée (zone épileptogène)">surligné ≥ <input type="range" class="c-ezn" min="0.2" max="0.9" step="0.05" value="${P.ezn}"><output>${nf(P.ezn)}</output></label></div>
          <details class="ie-sec"><summary>Réglages de h²</summary>
            <div class="ctrl-row"><label>bande <input type="number" step="1" class="c-lo" value="${P.lo}"> – <input type="number" step="1" class="c-hi" value="${P.hi}"> Hz</label></div>
            <div class="ctrl-row"><label>fenêtre <input type="number" step="0.5" min="1" class="c-win" value="${P.win}"> s</label><label>pas <input type="number" step="0.25" min="0.125" class="c-step" value="${P.step}"> s</label><label>délai max <input type="number" step="0.02" min="0" class="c-lag" value="${P.lag}"> s</label></div>
            <div class="hint">Signaux filtrés aller-retour (sans déphasage) puis ramenés vers 128 Hz ; régression par morceaux sur 10 classes. L’EI du cEI reprend ν, λ, H, τ et la référence de l’onglet EI sur cette fenêtre.</div></details>
          ${busy ? this.ieegBusyHtml(`Connectivité h² (${E ? E.ders.length : '…'} voies)`) : `<div class="ie-status">${Lr ? `<span>h² : ${(Lr.names || []).length} voies · calculé le ${new Date(Lr.at).toLocaleString(SV.LOC, { dateStyle: 'short', timeStyle: 'short' })}${Lr.ms ? ` (${nf(Lr.ms / 1000, 1)} s)` : ''}</span>` : `<span>${E ? 'Connectivité non calculée' : V.computing ? 'Rapport d’énergie en cours…' : 'EI à calculer d’abord'}</span>`}<button class="c-run${Lr ? '' : ' primary'}"${E ? '' : ' disabled'}>${Lr ? '↻ Recalculer' : 'Calculer la connectivité'}</button></div>`}
          <div class="ie-res"></div>
          <div class="btnrow"><button class="primary c-save"${Lr && Lr.rows ? '' : ' disabled'}>${this.ieegSetBtn('cei')}</button><button class="c-csv"${Lr && Lr.rows ? '' : ' disabled'}>CSV</button></div>${this.ieegMapNote()}`;
      const q = s => side.querySelector(s), box = q('.ie-res'); box.innerHTML = resHtml(); bindRes(box); this.ieegBindCommon(side);
      const mo = side.querySelector('[data-mont]'); if (mo) mo.onclick = () => { V.montage = 'bipolar'; V.rec.view = Object.assign(V.rec.view || {}, { montage: 'bipolar' }); this.ieegSetMontage(); };
      const re = () => { this.ieegCEIRecombine(); this.ieegCEIRender(); this.ieegDraw(); };
      this.ieegNumIn(side, '.c-start', P, 'start', 0, re); this.ieegNumIn(side, '.c-end', P, 'end', 0, re);
      for (const [c, k, m] of [['.c-lo', 'lo', 0.5], ['.c-hi', 'hi', 2], ['.c-win', 'win', 1], ['.c-step', 'step', 0.125], ['.c-lag', 'lag', 0]]) this.ieegNumIn(side, c, P, k, m, () => this.ieegCEIRender());
      q('.c-fit').onclick = () => { this.ieegCEIFit(P); re(); };
      const th = q('.c-thr'); th.oninput = () => { P.thr = +th.value; th.nextElementSibling.textContent = nf(P.thr); if (V.cei) { this.ieegCEIDegrees(); this.ieegCEIRender(true); this.ieegDraw(); } };
      const ez = q('.c-ezn'); ez.oninput = () => { P.ezn = +ez.value; P.eznSet = true; ez.nextElementSibling.textContent = nf(P.ezn); this.ieegCEIRender(true); this.ieegDraw(); };
      const run = q('.c-run'); if (run) run.onclick = () => this.ieegCEICompute();
      q('.c-save').onclick = () => { const r = rec.cei.last.rows.filter(x => !ex.has(x.name)); this.ieegSaveSet('cei', r, x => x.cei, { name: 'cEI · ' + rec.title, source: `cEI Balatskaya 2020 · ${Lr.montage === 'bipolar' ? 'bipolaire' : 'monopolaire'} · ${nf(P.lo, 0)}–${nf(P.hi, 0)} Hz · seuil h² ${nf(Lr.thr)} · ${clock(P.start)}–${clock(P.end)}`, cmap: 'inferno', what: 'cEI' }); };
      q('.c-csv').onclick = () => this.ieegCEICSV();
    },
    ieegCEICSV() {
      const V = this._iev, rec = V.rec, P = rec.cei.params, Lr = rec.cei.last; if (!Lr || !Lr.rows) return; const map = this.ieegElecMap();
      download(fname('cEI', rec), [`# EpiScope — EI de connectivité (Balatskaya et al., Clin Neurophysiol 2020) — ${rec.title}`, `# montage ${Lr.montage}; fenêtre ${f3(P.start)}–${f3(P.end)} s; bande ${P.lo}–${P.hi} Hz; fenêtres ${P.win} s pas ${P.step} s; délai max ${P.lag} s; seuil h2 ${f3(Lr.thr)}; ${Lr.nWin} fenêtres`,
        'voie;électrode du schéma;EI (fenêtre cEI);degré sortant médian;degré entrant médian;cEI', ...Lr.rows.slice().sort((a, b) => b.cei - a.cei).map(r => [r.name, map[r.elec] || '', f3(r.ei), f3(r.out), f3(r.in), f3(r.cei)].join(';'))]);
    },

    // ================================================================ PEI
    /** période ictale du PEI : celle réglée pour le PEI (P.icA, P.icB), sinon les marques de crise */
    ieegPEIWin() { const P = this.ieegPEIParams(), mk = this._iev.rec.marks || {}; const a = P.icA != null ? P.icA : mk.onset, b = P.icB != null ? P.icB : mk.end; return { a, b, own: P.icA != null || P.icB != null, ok: a != null && b != null && b > a }; },
    ieegPEIParams() { const V = this._iev, rec = V.rec; rec.pei = rec.pei || {}; const P = rec.pei.params || (rec.pei.params = {}); for (const [k, v] of Object.entries(IM.PE)) if (P[k] == null) P[k] = v; if (P.thr == null) P.thr = IE.EZT.pei; return P; },
    async ieegPEICompute() {
      const V = this._iev; if (!V || V.mbusy) return; const rec = V.rec, P = this.ieegPEIParams(), W = this.ieegPEIWin(), mk = { onset: W.a, end: W.b };
      if (!W.ok) { this.toast('PEI : marquer le début et la fin de crise (clic droit sur le tracé), ou régler la période ictale du PEI', 5000); return; }
      const ders = this.ieegMDers(); if (!ders.length) { this.toast('Aucune voie SEEG valide'); return; }
      const fs = V.mem.fs, a = Math.max(0, mk.onset - P.pre - P.win), b = Math.min(V.mem.duration, mk.end + P.post + P.win), tA = performance.now();
      V.mbusy = 'pei'; V.mcancel = false; V.mprog = 0; this.ieegPEIRender();
      try {
        const sig = this.ieegSig(ders, a, b), nj = Math.min(sig.length, 2 * Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 2) - 1))), size = Math.ceil(sig.length / nj), jobs = [];
        for (let i = 0; i < sig.length; i += size) { const c = sig.slice(i, i + size); jobs.push({ args: [c, fs, { D: P.D, tau: P.tau, tauMode: P.tauMode, win: P.win, step: P.step }], transfer: c.map(x => x.buffer) }); }
        const parts = await this.ieegPar('IEEGM.peBatch', jobs); if (this._iev !== V) return;
        const pes = [].concat(...parts.map(p => p.pes)), meta = [].concat(...parts.map(p => p.meta || [])), t0 = a + parts[0].t0, dt = parts[0].dt, tauEff = parts[0].tau || IM.peTau(fs, P);
        const gm = P.gm !== false ? this.ieegGMMask(ders) : null;
        const r = IM.pei(pes, t0, dt, mk.onset, mk.end, Object.assign({}, P, { meta: meta.length === pes.length ? meta : null, norm: gm && gm.known ? gm.mask : null }));
        V.pe = { montage: V.montage, names: ders.map(d => d.name), pes, t0, dt, idx: new Map(ders.map((d, i) => [d.name, i])), range: pes.map(pe => { let lo = Infinity, hi = -Infinity; for (const v of pe) { if (v < lo) lo = v; if (v > hi) hi = v; } return [lo, hi]; }) };
        rec.pei.last = { at: ST.now(), montage: V.montage, onset: mk.onset, offset: mk.end, ms: Math.round(performance.now() - tA), cov: r.cov, params: { D: P.D, tau: P.tau, tauMode: P.tauMode, tauEff, fs, win: P.win, step: P.step, pre: P.pre, post: P.post, gm: gm && gm.known ? true : false, artRms: P.artRms, artLf: P.artLf },
          rows: r.rows.map((x, i) => Object.assign(this.ieegRowOf(ders[i]), { B: x.B, m: x.m, M: x.M, raw: x.raw, dE: x.dE, tMin: x.tMin, tMax: x.tMax, art: x.art || 0, artCh: !!x.artCh, artFrac: x.artFrac || 0, wm: !!x.wm })) };
        V.dirty = true; this.touch();
        V._peFail = null;
      } catch (e) { if (!V.mcancel) { console.warn(e); V._peFail = mk.onset + '|' + mk.end; this.toast('PEI : ' + e.message, 7000); } }
      finally { V.mbusy = null; V.mcancel = false; if (this._iev === V) { this.ieegMethRender(); this.ieegDraw(); } }
    },
    /** lignes du PEI (hors exclusions), PEI renormalisé sur les voies retenues */
    ieegPEIRows() {
      const V = this._iev, Lr = V.rec.pei && V.rec.pei.last; if (!Lr) return []; const ex = this.ieegExcl(), rows = Lr.rows.filter(r => !ex.has(r.name)), ref = rows.filter(r => !r.wm && !r.artCh), mx = Math.max(0, ...(ref.length ? ref : rows).map(r => r.raw || 0));
      return rows.map(r => Object.assign({}, r, { pei: mx > 0 ? (r.raw || 0) / mx : 0 }));
    },
    /** plots en substance grise (parcellation du patient, sinon volume VEP du gabarit) : une paire compte si l'un de ses
     *  deux plots est dans une région VEP → { known, mask: [bool par dérivation], n } ; known = false sans anatomie */
    ieegGMMask(ders) {
      const lab = this.quantLabeler ? this.quantLabeler() : null, map = this.ieegElecMap ? this.ieegElecMap() : {}, out = [], el = this.elecs || []; let known = false, n = 0;
      for (const d of ders) {
        const en = map[d.elec] || d.elec, e = en && S.findElec(el, en); let ok = true;
        if (e && this.quantContactRegion && d.k1 != null) { known = true; const regs = [d.k1, d.k2].filter(k => k != null).map(k => this.quantContactRegion(e, k, lab)); ok = regs.some(x => x > 0); }
        out.push(ok); if (ok) n++;
      }
      return { known, mask: out, n };
    },
    ieegPEIStale() { const V = this._iev, Lr = V.rec.pei && V.rec.pei.last, W = this.ieegPEIWin(), P = this.ieegPEIParams(); if (!Lr) return ''; if (Lr.onset !== W.a || Lr.offset !== W.b) return 'période ictale modifiée'; if (['D', 'win', 'step', 'pre', 'post'].some(k => Lr.params[k] !== P[k]) || (P.tauMode === 'manual' ? Lr.params.tauEff !== P.tau : Lr.params.tauMode === 'manual') || (Lr.params.artRms != null && Lr.params.artRms !== P.artRms) || ((Lr.params.gm === false) !== (P.gm === false) && Lr.params.gm != null)) return 'réglages modifiés'; if (Lr.montage !== V.montage) return `calculé en ${Lr.montage === 'bipolar' ? 'bipolaire' : 'monopolaire'}`; return ''; },
    ieegPEIRender(onlyRes) {
      const V = this._iev, side = V.sb, rec = V.rec, P = this.ieegPEIParams(), W = this.ieegPEIWin(), mk = { onset: W.a, end: W.b }, Lr = rec.pei.last, ok = W.ok;
      // calcul d'emblée (rapide) : période présente, pas encore calculé ou courbes absentes de cette session ; pas de relance
      // automatique après un échec sur la même période (le message reste affiché)
      if (ok && !V.mbusy && !V._peAuto && V._peFail !== W.a + '|' + W.b && (!Lr || !V.pe || this.ieegPEIStale() === 'période ictale modifiée')) { V._peAuto = true; setTimeout(() => { V._peAuto = false; if (this._iev === V && V.meth === 'pei') this.ieegPEICompute(); }, 0); }
      const sel = V.sel >= 0 && V.D[V.sel] ? V.D[V.sel].name : null, stale = this.ieegPEIStale();
      const resHtml = () => {
        if (!Lr) return ''; const rows = this.ieegPEIRows().sort((a, b) => b.pei - a.pei || a.name.localeCompare(b.name, 'fr', { numeric: true })), nHi = rows.filter(r => r.pei >= P.thr).length, cov = Lr.cov || {};
        const short = [cov.pre && cov.pre[1] - cov.pre[0] < P.pre - 1 ? `préictal ${nf(cov.pre[1] - cov.pre[0], 0)} s` : '', cov.post && cov.post[1] - cov.post[0] < P.post - 1 ? `postictal ${nf(cov.post[1] - cov.post[0], 0)} s` : ''].filter(Boolean);
        const Lp = Lr.params || {}, notes = [];
        if (cov.longIctal) notes.push(`<span class="warn">période ictale de ${nf(cov.longIctal / 60, 1)} min : vérifiez la marque de fin de crise (m est cherché dans tout l’intervalle, le ralentissement postcritique y abaisse l’entropie partout)</span>`);
        if (cov.endLow) notes.push('<span class="warn">l’entropie globale est encore à son minimum juste avant la marque de fin : la fin de crise est peut-être posée trop tard (ralentissement postcritique compté comme ictal) — vérifiez-la sur le tracé</span>');
        if (cov.nArtCh) notes.push(`<span class="warn">${cov.nArtCh} voie${cov.nArtCh > 1 ? 's' : ''} artefactée${cov.nArtCh > 1 ? 's' : ''} (grandes déflexions lentes pendant la crise : mouvement) hors normalisation, en gris — à vérifier sur le tracé</span>`);
        if (cov.nArt) notes.push(`${cov.nArt} voie${cov.nArt > 1 ? 's' : ''} avec fenêtres écartées (⚠)`);
        if (Lp.gm) notes.push(`normalisé sur ${rows.filter(r => !r.wm).length} voies en substance grise${cov.nWm ? ` (${cov.nWm} hors cortex, en gris)` : ''}`); else if (Lp.gm === false) notes.push('<span class="warn">sans anatomie du patient : toutes les voies participent à la normalisation (dont les plots hors cortex)</span>');
        if (Lp.fs && Lp.fs < 500) notes.push(`<span class="warn">${nf(Lp.fs, 0)} Hz : τ = 1 regarde des triplets de ${nf(1000 * (Lp.tauEff || 1) / Lp.fs, 1)} ms, deux fois plus longs que dans l’article (512 Hz)</span>`);
        return `<div class="ie-n0">${rows.length} voies · <b>${nHi}</b> PEI ≥ ${nf(P.thr)} · ${cov.nIct || 0} fenêtres ictales${short.length ? ` · <span class="warn">tracé court : ${short.join(', ')}</span>` : ''}${stale ? ` · <span class="warn">${esc(stale)} : recalculer</span>` : ''}</div>
          ${notes.length ? `<div class="ie-n0 small">${notes.join(' · ')}</div>` : ''}
          <div class="ie-tabwrap"><table class="ie-tab" style="--thr:${Math.round(P.thr * 100)}%"><tr><th>voie</th><th title="Entropie moyenne préictale">B</th><th title="Entropie minimale pendant la crise">m</th><th title="Entropie maximale postictale">M</th><th title="Chute de l’entropie : B − m">ΔE</th><th title="PEI = M / m, normalisé par le maximum des voies en substance grise">PEI</th></tr>
          ${rows.map(r => `<tr data-n="${esc(r.name)}" data-t="${r.tMin != null ? r.tMin : ''}" class="${r.pei >= P.thr && !r.wm && !r.artCh ? 'hi' : ''}${r.name === sel ? ' sel' : ''}${r.wm || r.artCh ? ' wm' : ''}"><td class="nm mono">${esc(r.name)}${r.artCh ? ` <span class="ie-art" title="voie artefactée : ${Math.round(100 * r.artFrac)} % des fenêtres péri-ictales à ≥ ${P.artChRms || 15} × la RMS préictale avec une variance surtout lente (mouvement) — hors normalisation">✖</span>` : ''}${r.art ? ` <span class="ie-art" title="${r.art} fenêtre${r.art > 1 ? 's' : ''} écartée${r.art > 1 ? 's' : ''} (amplitude ≥ ${P.artRms} × la RMS préictale et variance surtout sous 1,5 Hz, ou tracé plat)">⚠</span>` : ''}${r.wm ? ' <small class="muted" title="plots hors substance grise : hors normalisation">·sb</small>' : ''}</td><td>${nf(r.B, 2)}</td><td>${r.m == null ? '—' : nf(r.m, 2)}</td><td>${r.M == null ? '—' : nf(r.M, 2)}</td><td>${nf(r.dE, 2)}</td><td><i class="ie-bar"><b style="width:${Math.round(r.pei * 100)}%"></b></i>${nf(r.pei, 2)}</td></tr>`).join('')}</table></div>`;
      };
      const bindRes = box => box.querySelectorAll('tr[data-n]').forEach(tr => tr.onclick = () => this.ieegGotoT(tr.dataset.n, tr.dataset.t !== '' ? +tr.dataset.t : null));
      if (onlyRes && side.querySelector('.ie-res')) { const box = side.querySelector('.ie-res'), w = box.querySelector('.ie-tabwrap'), sc = w ? w.scrollTop : 0; box.innerHTML = resHtml(); bindRes(box); const w2 = box.querySelector('.ie-tabwrap'); if (w2) w2.scrollTop = sc; return; }
      const METHOD = 'Entropie de permutation (motifs ordinaux de dimension 3, délai τ = 1 échantillon à 512 Hz — ajusté à la fréquence d’échantillonnage) normalisée, fenêtres de 5 s (pas 2,5 s), voies bipolaires ; B = moyenne préictale (60 s), m = minimum ictal, M = maximum postictal (60 s) ; PEI = M / m normalisé par le maximum des voies en substance grise de la crise ; ΔE = B − m. Seuil 0,72 (contact, précision–rappel) ; 0,80 par région (Bratu 2024). Les fenêtres plates ou d’amplitude aberrante à dominante lente (artefact de mouvement) sont écartées, comme les voies artefactées l’étaient à l’œil dans l’article. Le PEI est surtout utile aux crises sans activité rapide au début (slow onset) ; il classe plus qu’il ne seuille (précision 0,29). Demande le début et la fin de crise annotés.';
      const warn = !ok ? 'Le PEI demande le <b>début et la fin de crise</b> annotés (clic droit sur le tracé) : périodes préictale, ictale et postictale.' : V.montage !== 'bipolar' ? 'Le PEI a été validé en montage bipolaire. <a data-mont="bipolar">Passer en bipolaire</a>' : '';
      const busy = V.mbusy === 'pei';
      side.innerHTML = this.ieegMHead('Index d’entropie de permutation (PEI)', 'Bratu et al., Epilepsia 2024', METHOD,
        `<span>${LGH.pe} entropie (voie)</span><span>${LGH.min} minimum ictal m</span><span>${LGH.max} maximum postictal M</span><span>${LGH.zone(ZONE.pre)} préictal</span><span>${LGH.zone(ZONE.ict)} crise</span><span>${LGH.zone(ZONE.post)} postictal</span>`, warn)
        + `<div class="ie-sec"><div class="ie-sh">Périodes <span class="muted">${W.own ? 'période ictale réglée pour le PEI' : 'période ictale = marques de crise'}</span></div>
            <div class="ctrl-row"><label title="début de la période ictale (mm:ss) ; clic droit sur le tracé : « Début de la période ictale du PEI ici »">crise de <input class="p-ica" value="${W.a != null ? clock(W.a) : ''}" placeholder="mm:ss" style="width:72px"></label><label>à <input class="p-icb" value="${W.b != null ? clock(W.b) : ''}" placeholder="mm:ss" style="width:72px"></label>${W.own ? '<button class="mini-btn p-icr" title="revenir aux marques de début et de fin de crise">marques de crise</button>' : ''}</div>
            <div class="ctrl-row"><label>préictal <input type="number" step="5" min="10" class="p-pre" value="${P.pre}"> s</label><label>postictal <input type="number" step="5" min="10" class="p-post" value="${P.post}"> s</label></div>
            <label class="ie-sl" title="Valeur de PEI surlignée">surligné ≥ <input type="range" class="p-thr" min="0.3" max="0.95" step="0.01" value="${P.thr}"><output>${nf(P.thr)}</output></label></div>
          <details class="ie-sec"><summary>Entropie de permutation</summary>
            <div class="ctrl-row"><label>dimension D <select class="p-D">${[3, 4, 5].map(v => `<option${+P.D === v ? ' selected' : ''}>${v}</option>`).join('')}</select></label><label>délai τ <select class="p-taumode"><option value="auto"${P.tauMode !== 'manual' ? ' selected' : ''}>auto (${IM.peTau(V.mem.fs, { tauMode: 'auto' })} éch. à ${nf(V.mem.fs, 0)} Hz)</option><option value="manual"${P.tauMode === 'manual' ? ' selected' : ''}>manuel</option></select>${P.tauMode === 'manual' ? `<input type="number" step="1" min="1" class="p-tau" value="${P.tau}"> éch.` : ''}</label></div>
            <div class="ctrl-row"><label title="Les plots hors cortex (substance blanche, LCR, hors cerveau) reçoivent une valeur mais ne servent pas à la normalisation — comme les montages « substance grise » de l’article"><input type="checkbox" class="p-gm"${P.gm !== false ? ' checked' : ''}> normaliser sur les plots en substance grise</label></div>
            <div class="ctrl-row"><label title="fenêtre écartée si sa RMS dépasse ce multiple de la RMS préictale médiane et que la variance est surtout lente (artefact de mouvement)">artefact ≥ <input type="number" step="1" min="3" class="p-art" value="${P.artRms}"> × RMS</label></div>
            <div class="ctrl-row"><label>fenêtre <input type="number" step="0.5" min="1" class="p-win" value="${P.win}"> s</label><label>pas <input type="number" step="0.5" min="0.25" class="p-step" value="${P.step}"> s</label></div>
            <div class="hint">Entropie normalisée par ln(D!) à ${nf(V.mem.fs, 0)} Hz : 1 = motifs équiprobables (activité irrégulière), proche de 0 = activité régulière.</div></details>
          ${busy ? this.ieegBusyHtml('Entropie de permutation') : `<div class="ie-status">${Lr ? `<span>${Lr.rows.length} voies · calculé le ${new Date(Lr.at).toLocaleString(SV.LOC, { dateStyle: 'short', timeStyle: 'short' })}</span>` : '<span>Non calculé</span>'}<button class="p-run${Lr ? '' : ' primary'}"${ok ? '' : ' disabled'}>${Lr ? '↻ Recalculer' : 'Calculer'}</button></div>`}
          <div class="ie-res"></div>
          <div class="btnrow"><button class="primary p-save"${Lr ? '' : ' disabled'}>${this.ieegSetBtn('pei')}</button><button class="p-csv"${Lr ? '' : ' disabled'}>CSV</button></div>${this.ieegMapNote()}`;
      const q = s => side.querySelector(s), box = q('.ie-res'); box.innerHTML = resHtml(); bindRes(box); this.ieegBindCommon(side);
      const mo = side.querySelector('[data-mont]'); if (mo) mo.onclick = () => { V.montage = 'bipolar'; V.rec.view = Object.assign(V.rec.view || {}, { montage: 'bipolar' }); this.ieegSetMontage(); };
      const rerun = () => { this.ieegPEIRender(); if (this.ieegPEIWin().ok) this.ieegPEICompute(); };
      const parseT = v => { const m2 = String(v || '').trim().match(/^(?:(\d+):)?(\d+(?:[.,]\d+)?)$/); return m2 ? (+(m2[1] || 0)) * 60 + parseFloat(m2[2].replace(',', '.')) : null; };
      for (const [c, k] of [['.p-ica', 'icA'], ['.p-icb', 'icB']]) { const el = q(c); if (el) el.onchange = () => { const t = parseT(el.value); P[k] = t; this.ieegDraw(); rerun(); }; }
      if (q('.p-icr')) q('.p-icr').onclick = () => { P.icA = null; P.icB = null; this.ieegDraw(); rerun(); };
      for (const [c, k, m] of [['.p-pre', 'pre', 10], ['.p-post', 'post', 10], ['.p-tau', 'tau', 1], ['.p-win', 'win', 1], ['.p-step', 'step', 0.25], ['.p-art', 'artRms', 3]]) if (q(c)) this.ieegNumIn(side, c, P, k, m, rerun);
      q('.p-D').onchange = e => { P.D = +e.target.value; rerun(); };
      q('.p-taumode').onchange = e => { P.tauMode = e.target.value; if (P.tauMode === 'manual' && !(P.tau >= 1)) P.tau = IM.peTau(V.mem.fs, { tauMode: 'auto' }); rerun(); };
      q('.p-gm').onchange = e => { P.gm = e.target.checked; rerun(); };
      const th = q('.p-thr'); th.oninput = () => { P.thr = +th.value; th.nextElementSibling.textContent = nf(P.thr); this.ieegPEIRender(true); this.ieegDraw(); };
      const run = q('.p-run'); if (run) run.onclick = () => this.ieegPEICompute();
      q('.p-save').onclick = () => this.ieegSaveSet('pei', this.ieegPEIRows(), x => x.pei, { name: 'PEI · ' + rec.title, source: `PEI Bratu 2024 · ${Lr.montage === 'bipolar' ? 'bipolaire' : 'monopolaire'} · D ${P.D} · τ ${P.tau} · ${nf(P.win, 1)} s / ${nf(P.step, 1)} s · crise ${clock(Lr.onset)}–${clock(Lr.offset)}`, cmap: 'inferno', what: 'PEI' });
      q('.p-csv').onclick = () => { const map = this.ieegElecMap(); download(fname('PEI', rec), [`# EpiScope — index d'entropie de permutation (Bratu et al., Epilepsia 2024) — ${rec.title}`, `# montage ${Lr.montage}; D ${P.D}; tau ${P.tau}; fenêtre ${P.win} s pas ${P.step} s; préictal ${P.pre} s; postictal ${P.post} s; crise ${f3(Lr.onset)}–${f3(Lr.offset)} s`, 'voie;électrode du schéma;B (préictal);m (ictal);M (postictal);ΔE;M/m;PEI;fenêtres écartées;voie artefactée;hors substance grise', ...this.ieegPEIRows().sort((a, b) => b.pei - a.pei).map(r => [r.name, map[r.elec] || '', f3(r.B), f3(r.m), f3(r.M), f3(r.dE), f3(r.raw), f3(r.pei), r.art || 0, r.artCh ? 1 : 0, r.wm ? 1 : 0].join(';'))]); };
    },

    // ================================================================ Delphos (pointes, HFO)
    ieegHFOParams() {
      const V = this._iev, rec = V.rec; rec.hfo = rec.hfo || {}; const P = rec.hfo.params || (rec.hfo.params = {}), D = IM.DELPHOS;
      for (const k of ['fmin', 'vpo', 'thr', 'oscRatio', 'oscSpread', 'spkRatio', 'spkSpread']) if (P[k] == null) P[k] = D[k];
      for (const [k, v] of Object.entries({ coupling: true, slowLo: 0.5, slowHi: 2, cooc: 0.1, cols: 'rates' })) if (P[k] == null) P[k] = v;
      if (P.metric == null) P.metric = 'cross';
      if (P.start == null || P.end == null || P.auto == null) this.ieegHFOFit(P);
      return P;
    },
    /** fenêtre de Delphos : fond intercritique avant la crise (jusqu'à 5 min, arrêt 5 s avant le début) ; sinon après la crise ;
     *  sinon les 5 premières minutes (avertissement si la crise y est) */
    ieegHFOFit(P) {
      const V = this._iev, mk = V.rec.marks || {}, dur = V.mem.duration; P.auto = true;
      if (mk.onset != null && mk.onset - 5 >= 20) { P.end = mk.onset - 5; P.start = Math.max(0, P.end - 300); return; }
      if (mk.end != null && dur - (mk.end + 60) >= 20) { P.start = mk.end + 60; P.end = Math.min(dur, P.start + 300); return; }
      P.start = 0; P.end = Math.min(dur, 300);
    },
    ieegHFOWarn(P) {
      const V = this._iev, mk = V.rec.marks || {}, fmax = IM.delphosFmax(V.mem.fs, {}), w = [];
      if (mk.onset != null && P.end > mk.onset - 2 && P.start < (mk.end != null ? mk.end + 30 : mk.onset + 60)) w.push('la fenêtre recouvre la crise : Delphos s’applique à un fond <b>intercritique</b> stable, sans artefact (idéalement plusieurs minutes de sommeil lent)');
      if (fmax < 250) w.push(`échantillonnage ${nf(V.mem.fs, 0)} Hz : analyse jusqu’à ${nf(fmax, 0)} Hz — fast ripples (250–500 Hz) non analysables${fmax < 200 ? ', ripples partiels (80–' + nf(fmax, 0) + ' Hz)' : ''}`);
      else if (fmax < 500) w.push(`échantillonnage ${nf(V.mem.fs, 0)} Hz : fast ripples analysées jusqu’à ${nf(fmax, 0)} Hz`);
      if (P.end - P.start < 60) w.push('fenêtre de moins d’une minute : taux peu fiables');
      if (V.montage !== 'bipolar') w.push('Delphos s’utilise en montage bipolaire. <a data-mont="bipolar">Passer en bipolaire</a>');
      return w.join('<br>');
    },
    async ieegHFOCompute() {
      const V = this._iev; if (!V || V.mbusy) return; const rec = V.rec, P = this.ieegHFOParams(), ders = this.ieegMDers(); if (!ders.length) { this.toast('Aucune voie SEEG valide'); return; }
      const fs = V.mem.fs, a = Math.max(0, P.start), b = Math.min(V.mem.duration, P.end), tA = performance.now(); if (b - a < 5) { this.toast('Fenêtre trop courte'); return; }
      V.mbusy = 'hfo'; V.mcancel = false; V.mprog = 0; this.ieegHFORender();
      try {
        const sig = this.ieegSig(ders, a, b), o = { fmin: P.fmin, vpo: P.vpo, thr: P.thr, oscRatio: P.oscRatio, oscSpread: P.oscSpread, spkRatio: P.spkRatio, spkSpread: P.spkSpread, slow: P.coupling ? [P.slowLo, P.slowHi] : null };
        const nj = Math.min(sig.length, 3 * Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 2) - 1))), size = Math.ceil(sig.length / nj), jobs = [];
        for (let i = 0; i < sig.length; i += size) { const c = sig.slice(i, i + size); jobs.push({ args: [c, fs, o], transfer: c.map(x => x.buffer) }); }
        const parts = await this.ieegPar('IEEGM.delphosBatch', jobs); if (this._iev !== V) return;
        const evs = [].concat(...parts.map(p => p.events)).map(L0 => L0.map(e => Object.assign(e, { t: e.t + a }))), dur = b - a, coup = parts[0].coup ? [].concat(...parts.map(p => p.coup)) : null;
        V.hfo = { montage: V.montage, names: ders.map(d => d.name), by: new Map(ders.map((d, i) => [d.name, evs[i]])) };
        const path = `ieeg/${rec.id}/hfo_${V.montage}.json`;
        rec.hfo.last = { at: ST.now(), montage: V.montage, start: a, end: b, dur, fs, fmax: parts[0].fmax, ms: Math.round(performance.now() - tA), path, params: o,
          rows: ders.map((d, i) => Object.assign(this.ieegRowOf(d), IM.delphosRates(evs[i], dur), this.ieegHFOExtra(evs[i], dur, coup && coup[i], P))) };
        try { await L.writeFile(this.dossier, path, new Blob([JSON.stringify({ v: 1, start: a, end: b, names: V.hfo.names, events: evs.map(L0 => L0.map(e => [Math.round(e.t * 1e4) / 1e4, e.f, BC.indexOf(e.band), e.dur, e.amp, e.tr, e.fsp])) })], { type: 'application/json' })); } catch (e) { console.warn('évènements Delphos', e); }
        V.dirty = true; this.touch();
      } catch (e) { if (!V.mcancel) { console.warn(e); this.toast('Delphos : ' + e.message, 7000); } }
      finally { V.mbusy = null; V.mcancel = false; if (this._iev === V) { this.ieegMethRender(); this.ieegDraw(); } }
    },
    /** pointes accompagnées d'un ripple / fast ripple (centre à moins de P.cooc s) et couplage des HFO à l'onde lente */
    ieegHFOExtra(ev, dur, cp, P) {
      const c = IM.cooccur(ev, P.cooc), per = 60 / Math.max(1e-6, dur), o = { nSpkR: c.nSpkR, nSpkFR: c.nSpkFR, spkR: c.nSpkR * per, spkFR: c.nSpkFR * per, pHFO: c.nSpk ? c.nSpkHFO / c.nSpk : 0 };
      if (cp) { const h = cp.hfo, f = cp.fr; Object.assign(o, { nC: h.n, mvl: h.n >= 10 ? h.mvl : 0, ph: h.n >= 10 ? h.phase : null, pR: h.n >= 10 ? h.p : 1, nCfr: f.n, mvlFR: f.n >= 10 ? f.mvl : 0, phFR: f.n >= 10 ? f.phase : null, pFR: f.n >= 10 ? f.p : 1 }); }
      return o;
    },
    /** évènements déjà détectés : relus du fichier du tracé */
    async ieegHFOLoad() {
      const V = this._iev, Lr = V.rec.hfo && V.rec.hfo.last; if (!Lr || !Lr.path || V.hfo || V._hfoLoading) return; V._hfoLoading = true;
      try { const b = await L.readFile(this.dossier, Lr.path); const J = JSON.parse(await b.text()); if (this._iev !== V) return; V.hfo = { montage: Lr.montage, names: J.names, by: new Map(J.names.map((n, i) => [n, (J.events[i] || []).map(a => ({ t: a[0], f: a[1], band: BC[a[2]] || 'spk', kind: a[2] === 0 ? 'spike' : 'osc', dur: a[3], amp: a[4], tr: a[5], fsp: a[6] }))])) }; this.ieegDraw(); if (V.meth === 'hfo') this.ieegHFORender(true); }
      catch (e) { console.warn('évènements Delphos', e); } finally { V._hfoLoading = false; }
    },
    ieegHFORows() { const V = this._iev, Lr = V.rec.hfo && V.rec.hfo.last, ex = this.ieegExcl(); return Lr ? Lr.rows.filter(r => !ex.has(r.name)) : []; },
    /** évènement suivant (dir = 1) ou précédent de la voie choisie (sinon de toutes les voies), après le curseur */
    ieegHFONav(dir) {
      const V = this._iev; if (!V.hfo) return; const t = V.cursor != null ? V.cursor : V.t + V.page / 2, sel = V.sel >= 0 && V.D[V.sel] ? V.D[V.sel].name : null, show = this.ieegHFOShow();
      let best = null; for (const [n, L0] of V.hfo.by) { if (sel && n !== sel) continue; for (const e of L0) { if (!show.has(e.band)) continue; const d = (e.t - t) * dir; if (d > 1e-4 && (!best || d < best.d)) best = { d, e, n }; } }
      if (!best) { this.toast(dir > 0 ? 'Pas d’évènement après le curseur' : 'Pas d’évènement avant le curseur', 1800); return; }
      V.hfoCur = { n: best.n, e: best.e }; this.ieegGotoT(best.n, best.e.t); if (V.loupe) this.ieegHFOLoupe(true, best.e.band);
      const s = V.sb.querySelector('.h-cur'); if (s) s.textContent = `${best.n} · ${HL[best.e.band] || best.e.band} ${nf(best.e.f, 0)} Hz · ${clock(best.e.t)} · |Z|² ${nf(best.e.amp, 0)}`;
    },
    /** loupe de vérification : page de 1 s centrée sur l'évènement, passe-haut 80 Hz (ripple) ou 250 Hz (fast ripple), gain
     *  ajusté au signal filtré ; réglages d'affichage rendus en la quittant (non enregistrés) */
    ieegHFOLoupe(on, band) {
      const V = this._iev, sel = (c, v) => { const e = V.el.querySelector(c); if (e) e.value = String(v); };
      if (on) {
        if (!V.loupe) V.loupe = { page: V.page, hp: V.hp, amp: V.amp, man: V.ampManual };
        V.page = 1; V.hp = band === 'fr' || band === 'vfo' ? 250 : band === 'spk' ? V.loupe.hp : 80;
        const c = V.cursor != null ? V.cursor : V.t + 0.5; V.t = clamp(c - 0.5, 0, Math.max(0, V.mem.duration - 1)); V.cache.clear(); V.ampManual = false; this.ieegAutoAmp();
      } else if (V.loupe) { const L0 = V.loupe; V.loupe = null; const c = V.cursor != null ? V.cursor : V.t + V.page / 2; V.page = L0.page; V.hp = L0.hp; V.amp = L0.amp; V.ampManual = L0.man; V.t = clamp(c - V.page / 2, 0, Math.max(0, V.mem.duration - V.page)); V.cache.clear(); }
      sel('.ie-page', V.page); sel('.ie-hp', V.hp); this.ieegAmpLabel(); this.ieegDraw();
      const cb = V.sb.querySelector('.h-loupe'); if (cb) cb.checked = !!V.loupe;
    },
    ieegHFOShow() { const V = this._iev, P = this.ieegHFOParams(); return new Set(P.show || ['spk', 'r', 'fr']); },
    ieegHFORender(onlyRes) {
      const V = this._iev, side = V.sb, rec = V.rec, P = this.ieegHFOParams(), Lr = rec.hfo.last, show = this.ieegHFOShow();
      if (Lr && !V.hfo) this.ieegHFOLoad();
      const sel = V.sel >= 0 && V.D[V.sel] ? V.D[V.sel].name : null, metric = P.metric;
      const COLS = { rates: [['spk', 'pointes'], ['r', 'ripples'], ['fr', 'FR'], ['cross', 'croisé']], cooc: [['spk', 'pointes'], ['spkR', '+ ripple'], ['spkFR', '+ FR'], ['pHFO', '% avec HFO']], coup: [['nC', 'HFO'], ['mvl', 'couplage'], ['ph', 'phase'], ['pR', 'p']] };
      const fmtV = (k, v, r) => v == null || (r && (k === 'mvl' || k === 'pR') && !(r.nC >= 10)) ? '—' : k === 'pHFO' ? Math.round(v * 100) + ' %' : k === 'ph' ? v + '°' : k === 'pR' ? (v < 0.001 ? '< 0,001' : nf(v, 3)) : k === 'mvl' ? nf(v, 2) : k === 'nC' ? String(v) : nf(v, 1);
      const resHtml = () => {
        if (!Lr) return ''; const cg = COLS[P.cols] ? P.cols : 'rates', cols = COLS[cg], hasC = Lr.rows.some(r => r.mvl != null), sortK = cols.some(c => c[0] === metric) ? metric : cols[cols.length - 1][0] === 'pR' ? 'mvl' : metric;
        const rows = this.ieegHFORows().slice().sort((a, b) => (b[sortK] || 0) - (a[sortK] || 0) || a.name.localeCompare(b.name, 'fr', { numeric: true })), mx = Math.max(1e-9, ...rows.map(r => r[metric] || 0));
        const tot = k => rows.reduce((s, r) => s + (r[k] || 0), 0), nSig = rows.filter(r => r.nC >= 10 && r.pR < 0.05).length;
        return `<div class="ie-n0">${rows.length} voies · ${fmtDur(Lr.dur)} analysées · ${tot('nSpk')} pointes · ${tot('nR')} ripples · ${tot('nFR')} FR${Lr.fmax < 250 ? ' <span class="m">(FR hors bande)</span>' : ''}${Lr.montage !== V.montage ? ` · <span class="warn">calculé en ${Lr.montage === 'bipolar' ? 'bipolaire' : 'monopolaire'}</span>` : ''}</div>
          <div class="seg ie-hcols">${[['rates', 'Taux'], ['cooc', 'Pointes avec HFO'], ['coup', 'Couplage onde lente']].map(([k, l]) => `<button data-c="${k}" class="${cg === k ? 'on' : ''}"${k === 'coup' && !hasC ? ' disabled title="Recalculer avec le couplage à l’onde lente (réglages)"' : ''}>${l}</button>`).join('')}</div>
          ${cg === 'coup' ? `<div class="hint">Phase de l’onde lente (${nf(Lr.params.slow ? Lr.params.slow[0] : P.slowLo, 1)}–${nf(Lr.params.slow ? Lr.params.slow[1] : P.slowHi, 1)} Hz) au centre de chaque HFO (ripples et FR) : couplage = longueur du vecteur moyen (0 : HFO répartis sur tout le cycle, 1 : toujours à la même phase), phase préférée (0° : crête de la dérivation, ±180° : creux), test de Rayleigh (≥ 10 HFO) ; <b>${nSig}</b> voie${nSig > 1 ? 's' : ''} p < 0,05.</div>` : cg === 'cooc' ? `<div class="hint">Pointe accompagnée d’un ripple ou d’un fast ripple dont le centre tombe à moins de ${nf((P.cooc || 0.1) * 1000, 0)} ms de son maximum (FR sur pointes : marqueur plus spécifique du tissu épileptogène).</div>` : ''}
          <div class="ie-tabwrap"><table class="ie-tab ie-hfotab" style="--thr:101%"><tr><th>voie</th>${cols.map(([k, l]) => `<th class="${HL[k] ? 'srt' : ''}${metric === k ? ' on' : ''}" data-k="${k}"${HL[k] ? ` title="trier, colorer et enregistrer selon ${HL[k]}${HUNIT[k] ? ' (' + HUNIT[k] + ')' : ''}"` : ''}>${l}</th>`).join('')}</tr>
          ${rows.map(r => `<tr data-n="${esc(r.name)}" class="${r.name === sel ? 'sel' : ''}${cg === 'coup' && r.nC >= 10 && r.pR < 0.05 ? ' hi' : ''}"><td class="nm mono">${esc(r.name)}</td>${cols.map(([k]) => k === metric ? `<td><i class="ie-bar"><b style="width:${Math.round((r[k] || 0) / mx * 100)}%"></b></i>${fmtV(k, r[k], r)}</td>` : `<td>${fmtV(k, r[k], r)}</td>`).join('')}</tr>`).join('')}</table></div>${cg === 'coup' ? '<div class="hint">— : moins de 10 HFO sur la voie, couplage non estimé.</div>' : ''}`;
      };
      const bindRes = box => {
        box.querySelectorAll('tr[data-n]').forEach(tr => tr.onclick = () => { const L0 = V.hfo && V.hfo.by.get(tr.dataset.n), e = L0 && L0.filter(x => show.has(x.band)).sort((a, b) => b.amp - a.amp)[0]; this.ieegGotoT(tr.dataset.n, e ? e.t : null); });
        box.querySelectorAll('th.srt').forEach(th => th.onclick = () => { P.metric = th.dataset.k; V.dirty = true; V._hfoHeat = null; this.ieegHFORender(); this.ieegChips(); this.ieegDraw(); });
        box.querySelectorAll('.ie-hcols button').forEach(b => b.onclick = () => { P.cols = b.dataset.c; const c0 = COLS[P.cols]; if (!c0.some(c => c[0] === P.metric)) { P.metric = P.cols === 'coup' ? 'mvl' : P.cols === 'cooc' ? 'spkFR' : 'cross'; V._hfoHeat = null; } V.dirty = true; this.ieegHFORender(); this.ieegChips(); this.ieegDraw(); });   // rendu complet : mesure (tri, barre, fond, bouton d’enregistrement) à jour
      };
      if (onlyRes && side.querySelector('.ie-res')) { const box = side.querySelector('.ie-res'), w = box.querySelector('.ie-tabwrap'), sc = w ? w.scrollTop : 0; box.innerHTML = resHtml(); bindRes(box); const w2 = box.querySelector('.ie-tabwrap'); if (w2) w2.scrollTop = sc; return; }
      const METHOD = 'Transformée en ondelettes continue (ondelette analytique de type dérivée de gaussienne, n = 20, 12 voix par octave) ; normalisation ZH0 de chaque échelle (moyenne et écart-type robustes) qui aplatit le spectre ; maxima de |Z|² au-dessus du seuil ; forme de l’îlot : durée à mi-hauteur rapportée à la réponse impulsionnelle et étalement en fréquence → oscillation (ripple 80–250 Hz, fast ripple 250–500 Hz, gamma) ou pointe. Seuils de forme approchés d’après le manuel du greffon AnyWave. Taux croisé = √(pointes × HFO) (Roehri, Ann Neurol 2018).';
      const busy = V.mbusy === 'hfo', warn = this.ieegHFOWarn(P), mk = rec.marks || {};
      side.innerHTML = this.ieegMHead('Pointes et oscillations rapides (Delphos)', 'Roehri et al., IEEE TBME 2016', METHOD,
        `<span>${LGH.spk} pointe</span><span>${LGH.bar(HC.r)} ripple</span><span>${LGH.bar(HC.fr)} fast ripple</span><span>${LGH.bar(HC.g)} gamma</span><span class="m">passe-haut 80 ou 250 Hz pour vérifier</span>`, warn)
        + `<div class="ie-sec"><div class="ie-sh">Fenêtre d’analyse <span class="muted">(${P.auto ? (mk.onset != null && P.end <= mk.onset ? 'avant la crise' : 'automatique') : 'réglée à la main'} · ${fmtDur(P.end - P.start)})</span></div>
            <div class="ctrl-row"><label>début <input type="number" step="1" class="h-start" value="${+P.start.toFixed(2)}"> s</label><label>fin <input type="number" step="1" class="h-end" value="${+P.end.toFixed(2)}"> s</label><button class="h-fit" title="Fond intercritique : jusqu’à 5 min avant la crise annotée">↺ automatique</button></div>
            <div class="ctrl-row ie-hshow">afficher ${['spk', 'r', 'fr', 'g'].map(k => `<label class="chip"><input type="checkbox" data-b="${k}"${show.has(k) ? ' checked' : ''}> <i style="background:${HC[k]}"></i>${HL[k]}</label>`).join('')}</div></div>
          <details class="ie-sec"><summary>Réglages de Delphos</summary>
            <div class="ctrl-row"><label title="Seuil sur |Z|² (image normalisée)">seuil <input type="number" step="1" min="5" class="h-thr" value="${P.thr}"></label><label>f min <input type="number" step="1" min="2" class="h-fmin" value="${P.fmin}"> Hz</label><label>voix / octave <input type="number" step="1" min="6" max="24" class="h-vpo" value="${P.vpo}"></label></div>
            <div class="ctrl-row"><label title="Oscillation : durée à mi-hauteur ≥ ce rapport × réponse impulsionnelle">oscillation : durée ≥ <input type="number" step="0.01" class="h-or" value="${P.oscRatio}"></label><label title="… et étalement en fréquence ≤ (voix, pour 12 voix / octave)">étalement ≤ <input type="number" step="0.1" class="h-os" value="${P.oscSpread}"></label></div>
            <div class="ctrl-row"><label title="Pointe : durée à mi-hauteur ≤ ce rapport × réponse impulsionnelle">pointe : durée ≤ <input type="number" step="0.01" class="h-sr" value="${P.spkRatio}"></label><label title="… et étalement en fréquence ≥ (voix)">étalement ≥ <input type="number" step="0.1" class="h-ss" value="${P.spkSpread}"></label></div>
            <div class="ctrl-row"><label title="Pointe « avec HFO » : centre du ripple ou du FR à moins de cette durée du maximum de la pointe">pointe avec HFO : ± <input type="number" step="10" min="10" class="h-cooc" value="${Math.round((P.cooc || 0.1) * 1000)}"> ms</label></div>
            <div class="ctrl-row"><label class="chip"><input type="checkbox" class="h-coup"${P.coupling ? ' checked' : ''}> couplage à l’onde lente</label><label>bande <input type="number" step="0.1" min="0.1" class="h-slo" value="${P.slowLo}"> – <input type="number" step="0.1" min="0.2" class="h-shi" value="${P.slowHi}"> Hz</label></div>
            <div class="hint">Seuils de forme approchés d’après la figure du manuel (AnyWave). Analyse jusqu’à ${nf(IM.delphosFmax(V.mem.fs, {}), 0)} Hz (≈ 0,31 × fs : support de l’ondelette sous Nyquist). Couplage : phase de l’onde lente (passe-bande aller-retour, signal analytique) au centre de chaque HFO.</div></details>
          ${busy ? this.ieegBusyHtml(`Delphos (${this.ieegMDers().length} voies, ${fmtDur(P.end - P.start)})`) : `<div class="ie-status">${Lr ? `<span>calculé le ${new Date(Lr.at).toLocaleString(SV.LOC, { dateStyle: 'short', timeStyle: 'short' })}${Lr.ms ? ` (${nf(Lr.ms / 1000, 1)} s)` : ''}${Math.abs(Lr.start - P.start) > 1e-6 || Math.abs(Lr.end - P.end) > 1e-6 ? ' · <span class="warn">fenêtre modifiée</span>' : ''}</span>` : '<span>Non calculé</span>'}<button class="h-run${Lr ? '' : ' primary'}">${Lr ? '↻ Recalculer' : 'Détecter'}</button></div>`}
          ${Lr ? `<div class="ie-hnav"><button class="h-prev" title="Évènement précédent (voie choisie, sinon toutes)">◀</button><button class="h-next" title="Évènement suivant (voie choisie, sinon toutes)">▶</button><label class="chip" title="Vérifier : page de 1 s centrée sur l’évènement, passe-haut 80 Hz (ripple) ou 250 Hz (fast ripple), gain ajusté"><input type="checkbox" class="h-loupe"${V.loupe ? ' checked' : ''}> loupe</label><span class="h-cur muted">${V.hfoCur ? `${esc(V.hfoCur.n)} · ${HL[V.hfoCur.e.band] || ''} ${nf(V.hfoCur.e.f, 0)} Hz · ${clock(V.hfoCur.e.t)}` : sel ? esc(sel) : 'toutes les voies'}</span></div>` : ''}
          <div class="ie-res"></div>
          <div class="btnrow"><button class="primary h-save"${Lr && HL[metric] ? '' : ' disabled'}>${this.ieegSetBtn('hfo:' + metric, `Enregistrer « ${HL[metric]}${HUNIT[metric] ? ' ' + HUNIT[metric] : ''} »`)}</button><button class="h-csv"${Lr ? '' : ' disabled'}>CSV</button></div>${this.ieegMapNote()}`;
      const q = s => side.querySelector(s), box = q('.ie-res'); box.innerHTML = resHtml(); bindRes(box); this.ieegBindCommon(side);
      const mo = side.querySelector('[data-mont]'); if (mo) mo.onclick = () => { V.montage = 'bipolar'; V.rec.view = Object.assign(V.rec.view || {}, { montage: 'bipolar' }); this.ieegSetMontage(); };
      const re = () => { this.ieegHFORender(); this.ieegDraw(); };
      this.ieegNumIn(side, '.h-start', P, 'start', 0, re); this.ieegNumIn(side, '.h-end', P, 'end', 0, re);
      for (const [c, k, m] of [['.h-thr', 'thr', 5], ['.h-fmin', 'fmin', 2], ['.h-vpo', 'vpo', 6], ['.h-or', 'oscRatio', 0.5], ['.h-os', 'oscSpread', 1], ['.h-sr', 'spkRatio', 0.5], ['.h-ss', 'spkSpread', 1]]) this.ieegNumIn(side, c, P, k, m, re);
      q('.h-fit').onclick = () => { this.ieegHFOFit(P); re(); };
      const cc = q('.h-cooc'); if (cc) cc.onchange = () => { P.cooc = Math.max(0.01, num(cc.value, 100) / 1000); V.dirty = true; const Lr2 = rec.hfo.last; if (Lr2 && V.hfo) { for (const r of Lr2.rows) { const ev = V.hfo.by.get(r.name) || []; Object.assign(r, this.ieegHFOExtra(ev, Lr2.dur, null, P), r.mvl != null ? { nC: r.nC, mvl: r.mvl, ph: r.ph, pR: r.pR } : {}); } } re(); };
      const cp = q('.h-coup'); if (cp) cp.onchange = () => { P.coupling = cp.checked; V.dirty = true; };
      for (const [c, k] of [['.h-slo', 'slowLo'], ['.h-shi', 'slowHi']]) { const i = q(c); if (i) i.onchange = () => { P[k] = Math.max(0.05, num(i.value, P[k])); V.dirty = true; }; }
      side.querySelectorAll('.ie-hshow input').forEach(i => i.onchange = () => { const s = this.ieegHFOShow(); if (i.checked) s.add(i.dataset.b); else s.delete(i.dataset.b); P.show = [...s]; V.dirty = true; this.ieegDraw(); });
      const run = q('.h-run'); if (run) run.onclick = () => this.ieegHFOCompute();
      const pv = q('.h-prev'), nx = q('.h-next'), lp = q('.h-loupe'); if (pv) pv.onclick = () => this.ieegHFONav(-1); if (nx) nx.onclick = () => this.ieegHFONav(1);
      if (lp) lp.onchange = () => this.ieegHFOLoupe(lp.checked, V.hfoCur ? V.hfoCur.e.band : 'r');
      q('.h-save').onclick = () => { const metric = P.metric, rows = this.ieegHFORows(), mx = Math.max(0, ...rows.map(r => r[metric] || 0)), u = HUNIT[metric] || '', frac = metric === 'pHFO' || metric === 'mvl'; this.ieegSaveSet('hfo:' + metric, rows, x => x[metric] || 0, { name: `${HL[metric][0].toUpperCase() + HL[metric].slice(1)}${u ? ' ' + u : ''} · ${rec.title}`, unit: u, min: 0, max: frac ? 1 : Math.max(0.1, Math.ceil(mx * 10) / 10), rescale: !frac, cmap: 'inferno', source: `Delphos (Roehri 2016) · ${HL[metric]}${u === '/min' ? ' par minute' : ''} · ${Lr.montage === 'bipolar' ? 'bipolaire' : 'monopolaire'} · ${clock(Lr.start)}–${clock(Lr.end)} (${fmtDur(Lr.dur)}) · seuil ${nf(P.thr, 0)}${metric === 'mvl' ? ` · onde lente ${nf(P.slowLo, 1)}–${nf(P.slowHi, 1)} Hz` : ''}`, what: 'Delphos' }); };
      q('.h-csv').onclick = () => { const map = this.ieegElecMap(); download(fname('Delphos', rec), [`# EpiScope — détecteur Delphos (Roehri et al., IEEE TBME 2016) — ${rec.title}`, `# montage ${Lr.montage}; fenêtre ${f3(Lr.start)}–${f3(Lr.end)} s (${f3(Lr.dur)} s); fs ${Lr.fs} Hz; analyse jusqu'à ${f3(Lr.fmax)} Hz; seuil ${P.thr}`, 'voie;électrode du schéma;pointes;ripples;fast ripples;gamma;pointes /min;ripples /min;FR /min;gamma /min;taux croisé;pointes avec ripple /min;pointes avec FR /min;part des pointes avec HFO;HFO pour le couplage;couplage HFO-onde lente;phase (°);p Rayleigh', ...this.ieegHFORows().map(r => [r.name, map[r.elec] || '', r.nSpk, r.nR, r.nFR, r.nG, f3(r.spk), f3(r.r), f3(r.fr), f3(r.g), f3(r.cross), f3(r.spkR), f3(r.spkFR), f3(r.pHFO), r.nC == null ? '' : r.nC, f3(r.mvl), r.ph == null ? '' : r.ph, f3(r.pR)].join(';'))]); };
    },

    // ================================================================ dessin dans le tracé
    /** nom du fond coloré de l'onglet (case du bandeau) */
    ieegHeatLabel() { const V = this._iev; return V.meth === 'pei' ? 'entropie / référence' : V.meth === 'hfo' ? 'taux d’évènements' : V.meth === 'h2' ? (this.ieegKind(V.rec) === 'inter' ? 'force h²' : 'degré sortant h²') : null; },
    /** fond coloré sous le tracé selon l'onglet : { t0, dt, len, lut, row(nom) → { a, lo, hi } } */
    ieegHeatSrc() { const V = this._iev; return V.meth === 'pei' ? this.ieegPEHeat() : V.meth === 'hfo' ? this.ieegHFOHeat() : V.meth === 'h2' && this.ieegH2Heat ? this.ieegH2Heat() : null; },
    /** palette divergente (bleu : sous la référence, neutre, rouge : au-dessus), neutre adapté au thème */
    ieegDivLut(light) {
      const V = this._iev, k = light ? 'L' : 'D'; if (V._divLut && V._divLut.k === k) return V._divLut.t; const t = new Uint8ClampedArray(768), N0 = light ? [236, 239, 244] : [26, 30, 38], B = [40, 110, 235], R = [235, 70, 40];
      for (let i = 0; i < 256; i++) { const u = i / 255, c = u < 0.5 ? B.map((b, j) => b + (N0[j] - b) * (u / 0.5)) : N0.map((n, j) => n + (R[j] - n) * ((u - 0.5) / 0.5)); t[3 * i] = c[0]; t[3 * i + 1] = c[1]; t[3 * i + 2] = c[2]; }
      V._divLut = { k, t }; return t;
    },
    /** palette séquentielle choisie, fondue dans le fond du thème pour les faibles valeurs (taux d'évènements, connectivité) : le tracé reste lisible */
    ieegFadeLut() {
      const V = this._iev, k = (V.light ? 'L' : 'D') + V.show.cmap; if (V._fadeLut && V._fadeLut.k === k) return V._fadeLut.t; const src = this.ieegLut(), t = new Uint8ClampedArray(768), N0 = V.light ? [246, 247, 250] : [18, 21, 28];
      for (let i = 0; i < 256; i++) { const u = i / 255, w = Math.min(1, 0.08 + 1.25 * u), j = Math.round(255 * (0.15 + 0.85 * u)); for (let c = 0; c < 3; c++) t[3 * i + c] = N0[c] + (src[3 * j + c] - N0[c]) * w; }
      V._fadeLut = { k, t }; return t;
    },
    /** entropie de permutation de chaque fenêtre rapportée à la référence préictale B de la voie : (PE − B) / B */
    ieegPEHeat() {
      const V = this._iev, E = V.pe; if (!E || E.montage !== V.montage) return null; const Lr = V.rec.pei && V.rec.pei.last, B = new Map((Lr ? Lr.rows : []).map(r => [r.name, r.B]));
      if (!V._peHeat || V._peHeat.E !== E || V._peHeat.light !== V.light) {
        const rows = new Map(), all = [];
        E.names.forEach((n, i) => { const b = B.get(n) || 0; if (!(b > 0)) return; const a = new Float32Array(E.pes[i].length); for (let k = 0; k < a.length; k++) { a[k] = (E.pes[i][k] - b) / b; all.push(Math.abs(a[k])); } rows.set(n, a); });
        all.sort((x, y) => x - y); const R = Math.max(0.03, all.length ? all[Math.floor(all.length * 0.98)] : 0.1);
        V._peHeat = { E, light: V.light, hs: { t0: E.t0, dt: E.dt, len: E.pes[0] ? E.pes[0].length : 0, lut: this.ieegDivLut(V.light), plainTrace: true, R, row: n => { const a = rows.get(n); return a ? { a, lo: -R, hi: R } : null; } } };
      }
      return V._peHeat.hs;
    },
    /** taux d'évènements Delphos au fil du temps (fenêtre gaussienne σ = 5 s) selon la mesure choisie, par minute */
    ieegHFOHeat() {
      const V = this._iev, Lr = V.rec.hfo && V.rec.hfo.last; if (!Lr || !V.hfo || V.hfo.montage !== V.montage) return null; const P = this.ieegHFOParams(), m = P.metric, key = m + '|' + Lr.at + '|' + (P.cooc || 0.1) + '|' + V.show.cmap + '|' + V.light;
      if (V._hfoHeat && V._hfoHeat.key === key) return V._hfoHeat.hs;
      const dt = 0.5, n = Math.max(1, Math.ceil(Lr.dur / dt)), sg = 5, kr = Math.ceil(3 * sg / dt), ker = new Float32Array(2 * kr + 1); for (let i = -kr; i <= kr; i++) ker[i + kr] = Math.exp(-0.5 * (i * dt / sg) ** 2) / (sg * Math.sqrt(2 * Math.PI)) * 60;   // densité gaussienne → par minute
      const conv = cnt => { const o = new Float32Array(n); for (let i = 0; i < n; i++) if (cnt[i]) for (let j = -kr; j <= kr; j++) { const k = i + j; if (k >= 0 && k < n) o[k] += cnt[i] * ker[j + kr]; } return o; };
      const rows = new Map(), all = [], w = P.cooc || 0.1;
      for (const [name, L0] of V.hfo.by) {
        const pick = b => { const c = new Float32Array(n); for (const e of L0) if (b(e)) { const i = Math.floor((e.t - Lr.start) / dt); if (i >= 0 && i < n) c[i]++; } return conv(c); };
        let a; const isH = e => e.band === 'r' || e.band === 'fr' || e.band === 'vfo';
        if (m === 'r' || m === 'fr') a = pick(e => e.band === m);
        else if (m === 'cross') { const s0 = pick(e => e.band === 'spk'), h0 = pick(isH); a = s0.map((v, i) => Math.sqrt(v * h0[i])); }
        else if (m === 'spkR' || m === 'spkFR' || m === 'pHFO') { const want = m === 'spkR' ? ['r'] : m === 'spkFR' ? ['fr', 'vfo'] : ['r', 'fr', 'vfo'], hf = L0.filter(e => want.includes(e.band)); a = pick(e => e.band === 'spk' && hf.some(h => Math.abs(h.t - e.t) <= w)); }
        else if (m === 'mvl') a = pick(isH);
        else a = pick(e => e.band === 'spk');
        rows.set(name, a); for (let i = 0; i < n; i += 4) all.push(a[i]);
      }
      all.sort((x, y) => x - y); const hi = Math.max(1, all.length ? all[Math.floor(all.length * 0.995)] : 1);
      const hs = { t0: Lr.start + dt / 2, dt, len: n, lut: this.ieegFadeLut(), plainTrace: true, row: nm => { const a = rows.get(nm); return a ? { a, lo: 0, hi } : null; } };
      V._hfoHeat = { key, hs }; return hs;
    },
    /** barre de valeur à gauche des voies */
    ieegLaneVal(name) {
      const V = this._iev;
      if (V.meth === 'cei') { const r = V.ceiBy && V.ceiBy.get(name), P = V.rec.cei && V.rec.cei.params; return r ? { v: r.cei, hi: r.cei >= (P ? P.ezn : IE.EZT.cei) } : null; }
      if (V.meth === 'pei') { const r = this._peiRowsCache(name); return r ? { v: r.pei, hi: r.pei >= this.ieegPEIParams().thr } : null; }
      if (V.meth === 'h2') { const Lr = V.rec.h2 && V.rec.h2.last; if (!Lr || !Lr.rows) return null; const k = Lr.kind === 'ictal' ? 'out' : 'str', r = Lr.rows.find(x => x.name === name); if (!r) return null; const mx = Math.max(1e-9, ...Lr.rows.map(x => x[k])); return { v: r[k] / mx, hi: false }; }
      if (V.meth === 'hfo') { const Lr = V.rec.hfo && V.rec.hfo.last; if (!Lr) return null; const P = this.ieegHFOParams(), r = Lr.rows.find(x => x.name === name); if (!r) return null; const mx = V._hfoMx && V._hfoMx.k === P.metric + Lr.at ? V._hfoMx.v : (V._hfoMx = { k: P.metric + Lr.at, v: Math.max(1e-9, ...Lr.rows.map(x => x[P.metric] || 0)) }).v; return { v: (r[P.metric] || 0) / mx, hi: false }; }
      return null;
    },
    _peiRowsCache(name) { const V = this._iev, Lr = V.rec.pei && V.rec.pei.last; if (!Lr) return null; if (!V._peiC || V._peiC.at !== Lr.at || V._peiC.n !== this.ieegExcl().size) V._peiC = { at: Lr.at, n: this.ieegExcl().size, m: new Map(this.ieegPEIRows().map(r => [r.name, r])) }; return V._peiC.m.get(name) || null; },
    /** ombrage des périodes (sous le tracé) */
    ieegPaintShade(g, o) {
      const V = this._iev, { X, x0, pw, TOP, H } = o, band = (a, b, col) => { const xa = clamp(X(a), x0, x0 + pw), xb = clamp(X(b), x0, x0 + pw); if (xb > xa) { g.fillStyle = col; g.fillRect(xa, TOP, xb - xa, H - TOP); } };
      if (V.meth === 'cei') { const P = this.ieegCEIParams(); band(P.start, P.end, o.heatOn ? 'rgba(255,255,255,0.03)' : 'rgba(76,201,240,0.08)'); }
      else if (V.meth === 'pei') { const W0 = this.ieegPEIWin(), mk = { onset: W0.a, end: W0.b }, P = this.ieegPEIParams(); if (W0.ok) { band(mk.onset - P.pre, mk.onset, ZONE.pre); band(mk.onset, mk.end, ZONE.ict); band(mk.end, mk.end + P.post, ZONE.post); } }
      else if (V.meth === 'hfo') { const P = this.ieegHFOParams(); band(P.start, P.end, o.heatOn ? 'rgba(255,255,255,0.03)' : 'rgba(255,214,10,0.05)'); }
      else if (V.meth === 'h2' && this.ieegH2Params) { const P = this.ieegH2Params(); band(P.start, P.end, o.heatOn ? 'rgba(255,255,255,0.03)' : 'rgba(255,60,200,0.05)'); }
    },
    /** bornes et étiquettes des périodes (au-dessus du tracé) */
    ieegPaintWin(g, o) {
      const V = this._iev, vl = o.vline, cA = V.light ? '#0067a3' : 'rgba(76,201,240,0.7)';
      if (V.meth === 'cei') { const P = this.ieegCEIParams(); vl(P.start, cA, [6, 4], 'cEI'); vl(P.end, cA, [6, 4], ''); }
      else if (V.meth === 'pei') { const W0 = this.ieegPEIWin(), mk = { onset: W0.a, end: W0.b }, P = this.ieegPEIParams(); if (W0.ok) { if (W0.own) { vl(mk.onset, '#ffb000', [5, 3], 'PEI : début'); vl(mk.end, '#ffb000', [5, 3], 'PEI : fin'); } vl(Math.max(0, mk.onset - P.pre), cA, [2, 4], 'préictal'); vl(mk.end + P.post, V.light ? '#2b8a3e' : 'rgba(123,211,137,0.8)', [2, 4], 'postictal'); } }
      else if (V.meth === 'hfo') { const P = this.ieegHFOParams(), c = V.light ? '#8a6d00' : 'rgba(255,214,10,0.75)'; vl(P.start, c, [6, 4], 'Delphos'); vl(P.end, c, [6, 4], ''); }
      else if (V.meth === 'h2' && this.ieegH2Params) { const P = this.ieegH2Params(), c = V.light ? '#b0008f' : 'rgba(255,60,200,0.75)'; vl(P.start, c, [6, 4], 'h²'); vl(P.end, c, [6, 4], ''); }
    },
    /** courbe d'entropie (PEI) ou évènements Delphos d'une voie */
    ieegPaintLane(g, d, o) {
      const V = this._iev, { X, x0, pw, yT, yc, laneH, t0 } = o, t1 = t0 + V.page;
      if (V.meth === 'pei' && V.pe && V.pe.montage === V.montage) {
        const i = V.pe.idx.get(d.name); if (i == null) return; const pe = V.pe.pes[i], [lo, hi] = V.pe.range[i], sp = Math.max(0.02, hi - lo), dt = V.pe.dt, a = Math.max(0, Math.floor((t0 - V.pe.t0) / dt) - 1), b = Math.min(pe.length - 1, Math.ceil((t1 - V.pe.t0) / dt) + 1);
        if (b > a) { g.save(); g.beginPath(); g.rect(x0, yT, pw, laneH); g.clip(); g.strokeStyle = V.light && !o.onHeat ? PECOL.light : PECOL.dark; g.lineWidth = 1.4; g.beginPath(); for (let q = a; q <= b; q++) { const x = X(V.pe.t0 + q * dt), y = yT + laneH * 0.9 - (pe[q] - lo) / sp * laneH * 0.8; if (q === a) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke(); g.restore(); }
        const r = this._peiRowsCache(d.name), sz = Math.max(4.5, Math.min(7, laneH * 0.4));
        if (r && r.tMin != null) { const x = X(r.tMin); if (x >= x0 && x <= x0 + pw) glyph(g, 'tri', x, yT + sz * 0.75, sz, PECOL.dark); }
        if (r && r.tMax != null) { const x = X(r.tMax); if (x >= x0 && x <= x0 + pw) { g.save(); g.translate(x, yT + laneH - sz * 0.8); g.scale(1, -1); glyph(g, 'tri', 0, 0, sz, '#7bd389'); g.restore(); } }
      }
      if (V.meth === 'hfo' && V.hfo && V.hfo.montage === V.montage) {
        const L0 = V.hfo.by.get(d.name); if (!L0 || !L0.length) return; const show = this.ieegHFOShow(), sz = Math.max(4, Math.min(6.5, laneH * 0.36));
        for (const e of L0) {
          if (e.t < t0 - 0.5 || e.t > t1 + 0.5 || !show.has(e.band)) continue; const x = X(e.t); if (x < x0 - 4 || x > x0 + pw + 4) continue;
          if (e.band === 'spk') { g.save(); g.translate(x, yT + laneH - sz * 0.85); g.scale(1, -1); glyph(g, 'tri', 0, 0, sz, HC.spk); g.restore(); continue; }
          // oscillation : barre sur sa durée à mi-hauteur (au moins 7 px) en haut de la voie + trait sur la voie, double liseré
          const col = HC[e.band] || '#fff', w = Math.max(7, e.dur * (o.X(1) - o.X(0))), hh = Math.max(4, Math.min(6, laneH * 0.28)), y = yT + 2.5;
          tick(g, Math.round(x) + 0.5, y + hh + 1, yT + laneH - 1, col);
          g.fillStyle = 'rgba(0,0,0,0.85)'; g.fillRect(x - w / 2 - 2, y - 2, w + 4, hh + 4); g.fillStyle = '#fff'; g.fillRect(x - w / 2 - 1, y - 1, w + 2, hh + 2); g.fillStyle = col; g.fillRect(x - w / 2, y, w, hh);
        }
      }
    },
    /** fenêtre de la méthode dans l'aperçu */
    ieegOvwWin(g, X, H) {
      const V = this._iev; let a = null, b = null, col = 'rgba(76,201,240,0.8)';
      if (V.meth === 'cei') { const P = this.ieegCEIParams(); a = P.start; b = P.end; }
      else if (V.meth === 'pei') { const W0 = this.ieegPEIWin(), P = this.ieegPEIParams(); if (W0.ok) { a = Math.max(0, W0.a - P.pre); b = W0.b + P.post; } col = 'rgba(255,176,0,0.8)'; }
      else if (V.meth === 'hfo') { const P = this.ieegHFOParams(); a = P.start; b = P.end; col = 'rgba(255,214,10,0.85)'; }
      else if (V.meth === 'h2' && this.ieegH2Params) { const P = this.ieegH2Params(); a = P.start; b = P.end; col = 'rgba(255,60,200,0.85)'; }
      if (a != null) { g.strokeStyle = col; g.strokeRect(X(a) + 0.5, 1.5, Math.max(1, X(b) - X(a)), H - 3); }
      if (V.meth === 'hfo' && V.hfo) {   // densité des évènements (toutes voies)
        const show = this.ieegHFOShow(), W = g.canvas.clientWidth || 600, cols = new Float32Array(300); let mx = 0; const dur = V.mem.duration || 1;
        for (const L0 of V.hfo.by.values()) for (const e of L0) if (show.has(e.band)) { const c = Math.min(299, Math.floor(e.t / dur * 300)); cols[c]++; if (cols[c] > mx) mx = cols[c]; }
        if (mx > 0) { g.fillStyle = 'rgba(255,214,10,0.55)'; for (let c = 0; c < 300; c++) if (cols[c]) { const x0 = X(c / 300 * dur), x1 = X((c + 1) / 300 * dur), hh = Math.max(1, cols[c] / mx * (H - 6) * 0.45); g.fillRect(x0, H - 3 - hh, Math.max(1, x1 - x0 - 0.3), hh); } }
      }
    },
    /** clic droit sur le tracé : fenêtre de la méthode */
    ieegMenuMeth(items, t, d) {
      const V = this._iev;
      if (V.meth === 'cei') { const P = this.ieegCEIParams(); items.push({ sep: true }, { label: 'Début de la fenêtre du cEI ici', run: () => { P.start = t; P.auto = false; if (P.end <= t) P.end = Math.min(V.mem.duration, t + 20); this.ieegCEIRender(); this.ieegDraw(); } }, { label: 'Fin de la fenêtre du cEI ici', run: () => { if (t > P.start) { P.end = t; P.auto = false; this.ieegCEIRender(); this.ieegDraw(); } } }); }
      else if (V.meth === 'h2' && this.ieegH2Params) { const P = this.ieegH2Params(), re = () => { this.ieegH2Render(); this.ieegDraw(); }; items.push({ sep: true }, { label: 'Début de la fenêtre h² ici', run: () => { P.start = t; P.auto = false; if (P.end <= t) P.end = Math.min(V.mem.duration, t + 60); re(); } }, { label: 'Fin de la fenêtre h² ici', run: () => { if (t > P.start) { P.end = t; P.auto = false; re(); } } }); }
      else if (V.meth === 'hfo') { const P = this.ieegHFOParams(); items.push({ sep: true }, { label: 'Début de la fenêtre Delphos ici', run: () => { P.start = t; P.auto = false; if (P.end <= t) P.end = Math.min(V.mem.duration, t + 300); this.ieegHFORender(); this.ieegDraw(); } }, { label: 'Fin de la fenêtre Delphos ici', run: () => { if (t > P.start) { P.end = t; P.auto = false; this.ieegHFORender(); this.ieegDraw(); } } }); }
      else if (V.meth === 'pei') { const P = this.ieegPEIParams(), re = () => { this.ieegDraw(); this.ieegPEIRender(); if (this.ieegPEIWin().ok) this.ieegPEICompute(); }; items.push({ sep: true }, { label: 'Début de la période ictale du PEI ici', run: () => { P.icA = t; if (this.ieegPEIWin().b != null && this.ieegPEIWin().b <= t) P.icB = null; re(); } }, { label: 'Fin de la période ictale du PEI ici', run: () => { if (t > (this.ieegPEIWin().a || 0)) { P.icB = t; re(); } } }); if (P.icA != null || P.icB != null) items.push({ label: 'PEI : reprendre les marques de crise', run: () => { P.icA = null; P.icB = null; re(); } }); }
      if (d) { const ex = (V.rec.ei && V.rec.ei.excluded || []).includes(d.name); items.push({ label: ex ? `Réintégrer ${d.name} dans les calculs` : `Exclure ${d.name} des calculs (artefact)`, run: () => this.ieegExclude(d.name, !ex) }); }
    },
    /** marques de crise modifiées : fenêtres automatiques recalées */
    ieegMarksChanged() {
      const V = this._iev; if (!V) return; const rec = V.rec;
      if (rec.cei && rec.cei.params && rec.cei.params.auto) this.ieegCEIFit(rec.cei.params);
      if (rec.hfo && rec.hfo.params && rec.hfo.params.auto) this.ieegHFOFit(rec.hfo.params);
      if (V.ei && V.meth && V.meth !== 'ei') setTimeout(() => { if (this._iev === V) this.ieegMethRender(); }, 0);
    },

  };
  Object.assign(A, M);

  // greffes : exclusions → méthodes à jour ; fermeture → calculs annulés
  const exc0 = A.ieegExclude, exc1 = A.ieegExcludeContacts, cl0 = A.ieegClose;
  const after = function () { const V = this._iev; if (!V) return; V._peiC = null; if (V.cei) this.ieegCEIDegrees(); else if (V.ceiBy) this.ieegCEIRecombine(); if (V.ei && V.meth && V.meth !== 'ei') this.ieegMethRender(); this.ieegDraw(); };
  A.ieegAfterExcl = function () { after.call(this); };
  A.ieegExclude = function () { const r = exc0.apply(this, arguments); this.ieegAfterExcl(); return r; };
  if (exc1) A.ieegExcludeContacts = function () { const r = exc1.apply(this, arguments); this.ieegAfterExcl(); return r; };
  A.ieegClose = function () { const V = this._iev; if (V && V.mpool) { V.mcancel = true; V.mpool.close(); } return cl0.apply(this, arguments); };
  // EI recalculé (réglages, détections à la main) : cEI recombiné
  const run0 = A.ieegRunEI;
  A.ieegRunEI = function () { const r = run0.apply(this, arguments); try { const V = this._iev; if (V && V.rec.cei && V.rec.cei.last && V.rec.cei.last.out) this.ieegCEIRecombine(); } catch (e) { console.warn(e); } return r; };
})(window.SV);
