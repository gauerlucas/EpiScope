/* EpiScope — ieeg_ez_ui.js : onglets « Empreinte » et « EM » de la quantification des crises SEEG (v4.18).
 *   - Empreinte de la zone épileptogène (Grinenko et al., Brain 2018) : temps-fréquence de Morlet (indice 8, 1–200 Hz) de
 *     chaque dérivation bipolaire de −20 à +20 s autour du début de crise, rapporté à une référence de 40 s commençant 2 min
 *     avant (log10) ; trois éléments repérés avec des seuils explicites : pointes préictales (maxima de la médiane sur les
 *     fréquences, composante rapide), activité rapide (composantes connexes au-dessus de 30 Hz, bandes simultanées non
 *     harmoniques), suppression concomitante des fréquences plus basses (aire rapportée à la carte, seuil 3,1 % de l'article) ;
 *     score 0–1 et « empreinte complète » (pointes + activité rapide multibande + suppression). Image temps-fréquence de la
 *     voie choisie dans le panneau, fond « activité rapide / référence » sous le tracé. Version simplifiée, sans le filtre de
 *     crêtes, le filtre guidé ni le classifieur SVM de l'article : à relire sur l'image.
 *   - Cartes d'épileptogénicité (David et al., Brain 2011) : puissance haute fréquence (120–200 Hz, ou 60–100 Hz) par blocs de
 *     0,2 s (Morlet), log10 ; t de Welch de la fenêtre [L, L + 3 s] contre la référence [−10, −1] s, seuil p 0,05 corrigé
 *     (Bonferroni, FDR ou sans) ; délai : première latence de 0 à 20 s (pas de 2 s) où le contact devient significatif ; jeu
 *     d'Analyses (t, seuil porté par le jeu) et « carte sur l'IRM » : valeurs étalées autour des plots (noyau gaussien) dans le
 *     cerveau du patient, image dérivée (calque des coupes, écran Imagerie › Cartes calculées).
 *   rec.fp = { params, last: { onset, win, base, freqs, nT, dt, t0, names, path, rows } } ; images temps-fréquence (Int8,
 *   pas 0,02 en log10) dans ieeg/<id>/fp_<montage>.bin ; rec.em = { params, last: { onset, band, t0, dt, names, path, rows } }, puissances
 *   dans ieeg/<id>/em_<montage>.json.                                                                                       */
(function (SV) {
  'use strict';
  const DR = SV.IeegDraw, IM = SV.IEEGM, S = SV.Seeg, ST = SV.Store, L = SV.Library, A = SV.app, X = SV.Stat;
  const { esc, nf, num, clamp, clock, glyph } = DR;
  const download = (name, lines) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); };
  const f3 = v => v == null || !isFinite(v) ? '' : String(Math.round(v * 1000) / 1000).replace('.', ',');
  const fname = (p, rec) => p + '_' + rec.title.replace(/[^\w\-]+/g, '_').slice(0, 60) + '.csv';
  const FPC = { fa: '#ff5a5f', sup: '#4cc9f0', spk: '#ffd60a' }, FPR = 1.5, Q8 = 50;   // couleurs ; échelle de l'image (± 1,5 log10) ; quantification Int8
  const BANDS = { hi: [120, 200], lo: [60, 100] }, BANDL = { hi: '120–200 Hz', lo: '60–100 Hz', custom: 'personnalisée' };
  const ID16 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const svg = (w, body) => `<svg width="${w}" height="14" viewBox="0 0 ${w} 14">${body}</svg>`;
  const LG = {
    spk: svg(14, `<path d="M7 2L12 12H2Z" fill="${FPC.spk}" stroke="#000" stroke-width="1.1" stroke-linejoin="round"/>`),
    box: c => svg(16, `<rect x="1.5" y="2.5" width="13" height="9" fill="none" stroke="${c}" stroke-width="1.8"/>`),
    zone: c => svg(16, `<rect x="1" y="2" width="14" height="10" rx="2" fill="${c}" stroke="rgba(127,127,127,.6)"/>`),
  };
  const ZFP = { win: 'rgba(255,90,95,0.07)', base: 'rgba(76,201,240,0.08)' };

  const M = {
    // ================================================================ empreinte (Grinenko 2018)
    ieegFPParams() {
      const V = this._iev, rec = V.rec; rec.fp = rec.fp || {}; const P = rec.fp.params || (rec.fp.params = {}), D = IM.FP;
      for (const k of ['faLo', 'faThr', 'faMinDur', 'faFrom', 'supThr', 'supArea', 'spkZ', 'spkThr']) if (P[k] == null) P[k] = D[k];
      for (const [k, v] of Object.entries({ clear: IM.FPT.clear, early: IM.FPT.early, tau: IM.FPT.tau, tw: true })) if (P[k] == null) P[k] = v;
      return P;
    },
    /** valeur d'une voie (tri, jeu, barre) : score pondéré par le délai (défaut) ou score brut */
    ieegFPVal(r) { return this.ieegFPParams().tw && r.sT != null ? r.sT : r.score; },
    /** temporalité : délai de chaque voie à la première activité rapide (voies non exclues), empreinte franche précoce ou tardive */
    ieegFPTime() {
      const V = this._iev, Lr = V.rec.fp && V.rec.fp.last; if (!Lr || !Lr.rows) return null; const P = this.ieegFPParams(), rows = this.ieegFPRows();
      const T = IM.fpTiming(rows, { clear: P.clear, early: P.early, tau: P.tau, end: IM.FP.post }); rows.forEach((r, i) => Object.assign(r, T.rows[i]));
      Lr.timing = { t0: T.t0, tClear: T.tClear, nClear: T.nClear, nEarly: T.nEarly, nLate: T.nLate, clear: P.clear, early: P.early, tau: P.tau }; return Lr.timing;
    },
    /** fenêtres de l'empreinte d'après le début annoté */
    ieegFPWins() { const V = this._iev, mk = V.rec.marks || {}; return mk.onset == null ? null : IM.fpWindows(mk.onset, V.mem.duration, {}); },
    async ieegFPCompute() {
      const V = this._iev; if (!V || V.mbusy) return; const rec = V.rec, mk = rec.marks || {};
      if (mk.onset == null) { this.toast('Empreinte : marquer le début de crise (clic droit sur le tracé)', 5000); return; }
      const W = this.ieegFPWins(); if (W.err) { this.toast('Empreinte : ' + W.err, 6000); return; }
      const ders = this.ieegMDers(); if (!ders.length) { this.toast('Aucune voie SEEG valide'); return; }
      const fs = V.mem.fs, fmax = Math.min(IM.FP.fmax, IM.morletFmax(fs, IM.FP.k)), freqs = IM.fpFreqs(fmax), dt = IM.FP.dt, tA = performance.now(), s0 = W.seg[0];
      V.mbusy = 'fp'; V.mcancel = false; V.mprog = 0; this.ieegFPRender();
      try {
        const sig = this.ieegSig(ders, W.seg[0], W.seg[1]), nj = Math.min(sig.length, 3 * Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 2) - 1))), size = Math.ceil(sig.length / nj), jobs = [];
        const o = { freqs, k: IM.FP.k, dt, base: [W.base[0] - s0, W.base[1] - s0], win: [W.win[0] - s0, W.win[1] - s0] };
        for (let i = 0; i < sig.length; i += size) { const c = sig.slice(i, i + size); jobs.push({ args: [c, fs, o], transfer: c.map(x => x.buffer) }); }
        const parts = await this.ieegPar('IEEGM.fpBatch', jobs); if (this._iev !== V) return;
        const Ls = [].concat(...parts.map(p => p.L)), nT = parts[0].nT, on = mk.onset, t0 = W.win[0] - on + dt / 2;
        V.fp = { montage: V.montage, names: ders.map(d => d.name), ders, L: Ls, nT, freqs, dt, t0, on, idx: new Map(ders.map((d, i) => [d.name, i])) };
        rec.fp.last = { at: ST.now(), montage: V.montage, onset: on, ms: Math.round(performance.now() - tA), win: W.win, base: W.base, warn: W.warn, freqs, nT, dt, t0, fmax, names: V.fp.names.slice() };
        this.ieegFPDerive(); await this.ieegFPSaveFile(); V.dirty = true; this.touch();
      } catch (e) { if (!V.mcancel) { console.warn(e); this.toast('Empreinte : ' + e.message, 7000); } }
      finally { V.mbusy = null; V.mcancel = false; if (this._iev === V) { this.ieegMethRender(); this.ieegChips(); this.ieegDraw(); } }
    },
    /** éléments de l'empreinte de chaque voie aux seuils choisis (sans recalcul de la TF) */
    ieegFPDerive() {
      const V = this._iev, F = V.fp, Lr = V.rec.fp && V.rec.fp.last; if (!F || !Lr) return; const P = this.ieegFPParams(), byD = new Map((F.ders || V.D).map(d => [d.name, d]));
      V.fpF = new Map(); Lr.rows = [];
      F.names.forEach((n, i) => { const r = IM.fpFeatures(F.L[i], F.freqs, F.nT, F.dt, F.t0, P); V.fpF.set(n, r); const d = byD.get(n) || V.D.find(x => x.name === n); if (!d) return; const { mask, ...rest } = r; Lr.rows.push(Object.assign(this.ieegRowOf(d), rest)); });
      Lr.params = { faLo: P.faLo, faThr: P.faThr, supThr: P.supThr, supArea: P.supArea, spkZ: P.spkZ }; V._fpHeat = null; this.ieegFPTime();
    },
    async ieegFPSaveFile() {
      const V = this._iev, F = V.fp, Lr = V.rec.fp.last; if (!F) return; const n = F.freqs.length * F.nT, u = new Int8Array(F.names.length * n);
      F.L.forEach((a, i) => { for (let k = 0; k < n; k++) u[i * n + k] = Math.max(-127, Math.min(127, Math.round(a[k] * Q8))); });
      const path = `ieeg/${V.rec.id}/fp_${V.montage}.bin`; try { await L.writeFile(this.dossier, path, new Blob([u.buffer], { type: 'application/octet-stream' })); Lr.path = path; } catch (e) { console.warn('empreinte', e); }
    },
    async ieegFPLoad() {
      const V = this._iev, Lr = V.rec.fp && V.rec.fp.last; if (!Lr || !Lr.path || V.fp || V._fpLoading) return; V._fpLoading = true;
      try {
        const b = await L.readFile(this.dossier, Lr.path), u = new Int8Array(await b.arrayBuffer()); if (this._iev !== V) return; const n = Lr.freqs.length * Lr.nT;
        const Ls = Lr.names.map((_, i) => { const a = new Float32Array(n); for (let k = 0; k < n; k++) a[k] = u[i * n + k] / Q8; return a; });
        V.fp = { montage: Lr.montage, names: Lr.names, ders: null, L: Ls, nT: Lr.nT, freqs: Lr.freqs, dt: Lr.dt, t0: Lr.t0, on: Lr.onset, idx: new Map(Lr.names.map((x, i) => [x, i])) };
        this.ieegFPDerive(); this.ieegDraw(); if (V.meth === 'fp') this.ieegFPRender();
      } catch (e) { console.warn('empreinte', e); } finally { V._fpLoading = false; }
    },
    ieegFPRows() { const V = this._iev, Lr = V.rec.fp && V.rec.fp.last, ex = this.ieegExcl(); return Lr && Lr.rows ? Lr.rows.filter(r => !ex.has(r.name)) : []; },
    ieegFPStale() { const V = this._iev, Lr = V.rec.fp && V.rec.fp.last, mk = V.rec.marks || {}; if (!Lr) return ''; if (Lr.onset !== mk.onset) return 'début de crise modifié'; if (Lr.montage !== V.montage) return `calculé en ${Lr.montage === 'bipolar' ? 'bipolaire' : 'monopolaire'}`; return ''; },
    /** voie de l'image temps-fréquence : voie choisie si elle a une image, sinon la voie au plus fort score */
    ieegFPCur() {
      const V = this._iev, F = V.fp; if (!F) return null; const sel = V.sel >= 0 && V.D[V.sel] ? V.D[V.sel].name : null; if (sel && F.idx.has(sel)) return sel;
      if (V.fpSel && F.idx.has(V.fpSel)) return V.fpSel; const r = this.ieegFPRows().slice().sort((a, b) => b.score - a.score || b.faArea - a.faArea)[0]; return r ? r.name : F.names[0];
    },
    ieegFPRender(onlyRes) {
      const V = this._iev, side = V.sb, rec = V.rec, P = this.ieegFPParams(), mk = rec.marks || {}, Lr = rec.fp.last, W = this.ieegFPWins();
      if (Lr && !V.fp) this.ieegFPLoad();
      const sel = this.ieegFPCur(), stale = this.ieegFPStale();
      if (Lr && Lr.rows && (!Lr.timing || Lr.timing.clear !== P.clear || Lr.timing.early !== P.early || Lr.timing.tau !== P.tau)) this.ieegFPTime();
      const sgn = v => (v >= 0 ? '+' : '−') + nf(Math.abs(v), 1);
      const resHtml = () => {
        if (!Lr || !Lr.rows) return ''; const val = r => this.ieegFPVal(r), rows = this.ieegFPRows().sort((a, b) => val(b) - val(a) || b.score - a.score || b.faArea - a.faArea || a.name.localeCompare(b.name, 'fr', { numeric: true })), nFull = rows.filter(r => r.full).length, nFA = rows.filter(r => r.fa).length, T = Lr.timing || {};
        const fr = r => r.fa ? `${nf(r.faFmin, 0)}–${nf(r.faFmax, 0)}${r.nBands >= 2 ? ` <b>×${r.nBands}</b>` : ''}` : '—';
        const when = r => r.fa ? `<span title="début de l’activité rapide ${sgn(r.faT0)} s après le début de crise${r.dT != null ? ` ; Δ ${sgn(r.dT)} s après la 1re activité rapide de toutes les voies` : ''}">${sgn(r.faT0)} s</span>${r.clear ? (r.early ? ' <span class="ie-early" title="empreinte franche précoce">préc.</span>' : ' <span class="ie-late" title="empreinte franche tardive : propagation probable">tard.</span>') : r.dT != null && r.dT > P.early ? ' <span class="muted" title="activité rapide tardive">Δ ' + sgn(r.dT) + '</span>' : ''}` : '—';
        const hi = r => P.tw ? r.clear && r.early : r.full, clearL = P.clear >= 0.99 ? 'complète' : `score ≥ ${nf(P.clear, 2)}`;
        const tline = T.t0 == null ? '' : `<div class="ie-n0">temporalité : 1re activité rapide à ${sgn(T.t0)} s du début · ${T.nClear ? `1re empreinte franche (${clearL}) à ${sgn(T.tClear)} s · <b>${T.nEarly}</b> précoce${T.nEarly > 1 ? 's' : ''} (Δ ≤ ${nf(P.early, 1)} s) · ${T.nLate} tardive${T.nLate > 1 ? 's' : ''} (propagation probable)` : `aucune empreinte franche (${clearL})`}</div>`;
        const noEarly = T.t0 != null && !T.nEarly ? `<div class="ie-warnbox">⚠ Aucune empreinte franche précoce : la crise démarre peut-être hors des voies échantillonnées. Voir <a class="f-goconn">l’empreinte connectivité</a> (région reliée aux meilleures empreintes, échantillonnée ou non).</div>` : '';
        return `<div class="ie-n0">${rows.length} voies · <b>${nFull}</b> empreinte${nFull > 1 ? 's' : ''} complète${nFull > 1 ? 's' : ''} · ${nFA} avec activité rapide · 1–${nf(Lr.fmax || 200, 0)} Hz${(Lr.warn || []).length ? ` · <span class="warn">${esc(Lr.warn.join(' ; '))}</span>` : ''}${stale ? ` · <span class="warn">${esc(stale)} : recalculer</span>` : ''}</div>${tline}${noEarly}
          ${V.fp ? `<canvas class="ie-tfplot" title="Temps-fréquence de la voie (log10 du rapport à la référence, ± ${nf(FPR, 1)}) : activité rapide encadrée en rouge, suppression en bleu, pointes ▲ ; clic : aller à cet instant"></canvas>` : ''}
          <div class="ie-tabwrap"><table class="ie-tab ie-fptab" style="--thr:99.9%"><tr><th>voie</th><th title="Pointes préictales (avant l’activité rapide)">pt.</th><th title="Activité rapide : bornes de fréquence (Hz) ; ×n : bandes simultanées (non harmoniques)">AR (Hz)</th><th title="Début de l’activité rapide par rapport au début de crise ; Δ : délai à la première activité rapide de toutes les voies ; empreinte franche précoce (Δ ≤ ${nf(P.early, 1)} s) ou tardive">début</th><th title="Suppression concomitante des basses fréquences : aire rapportée à la carte (seuil ${nf(P.supArea * 100, 1)} %)">supp.</th>${P.tw ? `<th title="Score pondéré par le délai : score × τ / (max(0, Δ − ${nf(P.early, 1)} s) + τ), τ = ${nf(P.tau, 1)} s (comme le délai de l’EI) ; sans activité rapide : délai pris à +${IM.FP.post} s ; entre parenthèses : score brut (pointes + activité rapide (½ si une seule bande) + suppression) / 3">score t</th>` : '<th title="Score : (pointes + activité rapide (½ si une seule bande) + suppression) / 3">score</th>'}</tr>
          ${rows.map(r => `<tr data-n="${esc(r.name)}" data-t="${r.faT0 != null ? r.faT0 : 0}" class="${hi(r) ? 'hi' : ''}${r.name === sel ? ' sel' : ''}"><td class="nm mono">${esc(r.name)}</td><td>${r.nSpk || '—'}</td><td>${fr(r)}</td><td>${when(r)}</td><td>${r.sup ? Math.round(r.supRatio * 1000) / 10 + ' %' : r.supRatio ? `<span class="muted">${Math.round(r.supRatio * 1000) / 10} %</span>` : '—'}</td>${P.tw ? `<td><i class="ie-bar"><b style="width:${Math.round((r.sT || 0) * 100)}%"></b></i>${nf(r.sT || 0, 2)}${Math.abs((r.sT || 0) - r.score) > 0.005 ? ` <span class="muted">(${nf(r.score, 2)})</span>` : ''}</td>` : `<td><i class="ie-bar"><b style="width:${Math.round(r.score * 100)}%"></b></i>${nf(r.score, 2)}</td>`}</tr>`).join('')}</table></div>
          ${this.ieegFPConnHtml(!T.nEarly)}`;
      };
      const bindRes = box => { box.querySelectorAll('.ie-tabwrap tr[data-n]').forEach(tr => tr.onclick = () => { V.fpSel = tr.dataset.n; const r = (Lr.rows || []).find(x => x.name === tr.dataset.n); this.ieegGotoT(tr.dataset.n, Lr.onset + (r && r.faT0 != null ? r.faT0 : 0)); }); this.ieegFPPlot(box.querySelector('.ie-tfplot')); this.ieegFPConnBind(box); };
      if (onlyRes && side.querySelector('.ie-res')) { const box = side.querySelector('.ie-res'), w = box.querySelector('.ie-tabwrap'), sc = w ? w.scrollTop : 0; box.innerHTML = resHtml(); bindRes(box); const w2 = box.querySelector('.ie-tabwrap'); if (w2) w2.scrollTop = sc; return; }
      const METHOD = 'Grinenko et al. 2018 : temps-fréquence de Morlet (indice 8) des dérivations bipolaires, 1–200 Hz, de −20 à +20 s autour du début de crise, chaque fréquence divisée par sa puissance moyenne sur 40 s commençant 2 min avant le début ; l’empreinte de la zone épileptogène associe des pointes préictales, une activité rapide multibande et une suppression concomitante des fréquences plus basses. Détection simplifiée ici (seuils explicites, sans le filtre de crêtes de Frangi, le filtre guidé ni le classifieur SVM de l’article) : activité rapide = composantes connexes de l’image lissée ≥ seuil au-dessus de 30 Hz, durée ≥ 1 s ; bandes simultanées séparées d’au moins 6 Hz et non harmoniques ; suppression = image lissée (± 1 s) ≤ −seuil sous l’activité rapide et pendant elle, aire ≥ 3,1 % de la carte (40 s × 199 Hz) ; pointes = maxima de la médiane sur les fréquences (z robuste ≥ 3) avec une composante ≥ 60 Hz.';
      const warn = mk.onset == null ? 'L’empreinte demande le <b>début de crise</b> annoté (clic droit sur le tracé) : fenêtre de −20 à +20 s, référence 2 min avant.' : W && W.err ? esc(W.err) : V.montage !== 'bipolar' ? 'L’empreinte se calcule en montage bipolaire. <a data-mont="bipolar">Passer en bipolaire</a>' : V.mem.fs < 400 ? `échantillonnage ${nf(V.mem.fs, 0)} Hz : temps-fréquence limité à ${nf(IM.morletFmax(V.mem.fs, 8), 0)} Hz (activité rapide partielle)` : '';
      const busy = V.mbusy === 'fp';
      side.innerHTML = this.ieegMHead('Empreinte de la zone épileptogène', 'Grinenko et al., Brain 2018', METHOD,
        `<span>${LG.spk} pointe préictale</span><span>${LG.box(FPC.fa)} activité rapide</span><span>${LG.box(FPC.sup)} suppression</span><span><i class="ie-lgbar" style="background:${S.cmapCss(V.show.cmap)}"></i> activité rapide / référence (fond)</span>`, warn)
        + `<div class="ie-sec"><div class="ie-sh">Fenêtres <span class="muted">${W && !W.err ? `(début ${clock(mk.onset)} : ${clock(W.win[0])} → ${clock(W.win[1])} ; référence ${clock(W.base[0])} → ${clock(W.base[1])})` : '(crise non annotée)'}</span></div>
            <label class="ie-sl" title="Seuil de l’activité rapide (log10 du rapport à la référence ; 0,6 ≈ × 4)">act. rapide ≥ <input type="range" class="f-fa" min="0.3" max="1.5" step="0.05" value="${P.faThr}"><output>${nf(P.faThr, 2)}</output></label>
            <label class="ie-sl" title="Seuil de la suppression (log10 ; 0,5 : puissance ≤ 32 % de la référence)">suppression ≤ − <input type="range" class="f-sup" min="0.2" max="1.2" step="0.05" value="${P.supThr}"><output>${nf(P.supThr, 2)}</output></label></div>
          <details class="ie-sec"><summary>Réglages de l’empreinte</summary>
            <div class="ctrl-row"><label title="Fréquence basse de l’activité rapide">act. rapide dès <input type="number" step="5" min="15" max="80" class="f-falo" value="${P.faLo}"> Hz</label><label title="Durée minimale d’une composante">durée ≥ <input type="number" step="0.5" min="0.3" class="f-fadur" value="${P.faMinDur}"> s</label></div>
            <div class="ctrl-row"><label title="Aire minimale de la suppression, rapportée à la carte de 40 s × 199 Hz (3,1 % : moyenne des contacts réséqués dans l’article)">aire de suppression ≥ <input type="number" step="0.5" min="0.5" class="f-supa" value="${nf(P.supArea * 100, 1).replace(',', '.')}"> %</label><label title="Pointe : z robuste de la médiane sur les fréquences">pointes : z ≥ <input type="number" step="0.5" min="2" class="f-spkz" value="${P.spkZ}"></label></div>
            <div class="ctrl-row"><label title="Empreinte franche : complète (pointes + activité rapide multibande + suppression) ou score minimal">empreinte franche <select class="f-clear">${[[1, 'complète'], [0.83, 'score ≥ 0,83'], [0.67, 'score ≥ 0,67']].map(([v, l]) => `<option value="${v}"${Math.abs(P.clear - v) < 0.01 ? ' selected' : ''}>${l}</option>`).join('')}</select></label><label title="Précoce : début de l’activité rapide au plus tant de secondes après la première activité rapide de toutes les voies">précoce si Δ ≤ <input type="number" step="0.5" min="0" class="f-early" value="${P.early}"> s</label><label title="Décroissance du poids avec le délai au-delà de la fenêtre précoce : τ / (Δ − précoce + τ)">τ <input type="number" step="0.5" min="0.5" class="f-tau" value="${P.tau}"> s</label></div>
            <label class="ie-chk" title="Tri, barre sous les voies et jeu d’Analyses : score pondéré par le délai (une empreinte franche précoce l’emporte sur une empreinte franche tardive)"><input type="checkbox" class="f-tw"${P.tw ? ' checked' : ''}> pondérer le score par le délai</label>
            <div class="hint">Seuils modifiables sans recalcul tant que la visionneuse est ouverte ; images temps-fréquence rangées avec le tracé (relues à la réouverture). Délai : Grinenko et al. n’ont pas trouvé l’instant de l’activité rapide discriminant à lui seul ; la pondération suit l’idée de l’EI (une structure recrutée plus tard compte moins).</div></details>
          ${busy ? this.ieegBusyHtml(`Temps-fréquence (${this.ieegMDers().length} voies)`) : `<div class="ie-status">${Lr ? `<span>calculé le ${new Date(Lr.at).toLocaleString(SV.LOC, { dateStyle: 'short', timeStyle: 'short' })}${Lr.ms ? ` (${nf(Lr.ms / 1000, 1)} s)` : ''}</span>` : '<span>Non calculé</span>'}<button class="f-run${Lr ? '' : ' primary'}"${mk.onset != null && !(W && W.err) ? '' : ' disabled'}>${Lr ? '↻ Recalculer' : 'Calculer'}</button></div>`}
          <div class="ie-res"></div>
          <div class="btnrow"><button class="primary f-save"${Lr && Lr.rows ? '' : ' disabled'}>${this.ieegSetBtn('fp')}</button><button class="f-csv"${Lr && Lr.rows ? '' : ' disabled'}>CSV</button></div>${this.ieegMapNote()}`;
      const q = s => side.querySelector(s), box = q('.ie-res'); box.innerHTML = resHtml(); bindRes(box); this.ieegBindCommon(side);
      const mo = side.querySelector('[data-mont]'); if (mo) mo.onclick = () => { V.montage = 'bipolar'; V.rec.view = Object.assign(V.rec.view || {}, { montage: 'bipolar' }); this.ieegSetMontage(); };
      const live = () => { if (V.fp) { this.ieegFPDerive(); this.ieegFPRender(true); this.ieegDraw(); } };
      for (const [c, k] of [['.f-fa', 'faThr'], ['.f-sup', 'supThr']]) { const i = q(c); i.oninput = () => { P[k] = +i.value; i.nextElementSibling.textContent = nf(P[k], 2); V.dirty = true; live(); }; }
      this.ieegNumIn(side, '.f-falo', P, 'faLo', 15, live); this.ieegNumIn(side, '.f-fadur', P, 'faMinDur', 0.3, live); this.ieegNumIn(side, '.f-spkz', P, 'spkZ', 1, live);
      const sa = q('.f-supa'); sa.onchange = () => { P.supArea = Math.max(0.001, num(sa.value, 3.1) / 100); V.dirty = true; live(); };
      const tlive = () => { this.ieegFPTime(); V.dirty = true; this.ieegFPRender(true); this.ieegDraw(); };
      q('.f-clear').onchange = e => { P.clear = +e.target.value; tlive(); }; this.ieegNumIn(side, '.f-early', P, 'early', 0, tlive); this.ieegNumIn(side, '.f-tau', P, 'tau', 0.5, tlive);
      q('.f-tw').onchange = e => { P.tw = e.target.checked; tlive(); };
      const run = q('.f-run'); if (run) run.onclick = () => this.ieegFPCompute();
      q('.f-save').onclick = () => this.ieegFPSaveSet(); q('.f-csv').onclick = () => this.ieegFPCSV();
    },
    /** image temps-fréquence de la voie (rangées : fréquences de la grille, du bas vers le haut) */
    ieegFPPlot(cv) {
      const V = this._iev, F = V.fp; if (!cv || !F) return; const name = this.ieegFPCur(), i = F.idx.get(name); if (i == null) return;
      const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
      const pl = 30, pt = 14, pb = 14, pw = W - pl - 4, ph = H - pt - pb, nT = F.nT, fr = F.freqs, nF = fr.length, La = F.L[i], lut = this.ieegDivLut(V.light), feat = V.fpF && V.fpF.get(name);
      const c = document.createElement('canvas'); c.width = nT; c.height = nF; const cg = c.getContext('2d'), img = cg.createImageData(nT, nF);
      for (let f = 0; f < nF; f++) for (let j = 0; j < nT; j++) { const v = La[f * nT + j], t = Math.max(0, Math.min(255, Math.round((v + FPR) / (2 * FPR) * 255))), o = 4 * ((nF - 1 - f) * nT + j); img.data[o] = lut[3 * t]; img.data[o + 1] = lut[3 * t + 1]; img.data[o + 2] = lut[3 * t + 2]; img.data[o + 3] = 255; }
      cg.putImageData(img, 0, 0); g.imageSmoothingEnabled = false; g.drawImage(c, pl, pt, pw, ph);
      const cw = pw / nT, chh = ph / nF, xOf = j => pl + j * cw, yOf = f => pt + (nF - 1 - f) * chh, tX = t => pl + (t - (F.t0 - F.dt / 2)) / (nT * F.dt) * pw;
      if (feat && feat.mask) for (const [bit, col] of [[1, FPC.fa], [2, FPC.sup]]) {
        g.strokeStyle = col; g.lineWidth = 1.4; g.beginPath(); const m = feat.mask, on = (f, j) => f >= 0 && f < nF && j >= 0 && j < nT && (m[f * nT + j] & bit);
        for (let f = 0; f < nF; f++) for (let j = 0; j < nT; j++) { if (!on(f, j)) continue; const x = xOf(j), y = yOf(f);
          if (!on(f + 1, j)) { g.moveTo(x, y); g.lineTo(x + cw, y); } if (!on(f - 1, j)) { g.moveTo(x, y + chh); g.lineTo(x + cw, y + chh); } if (!on(f, j - 1)) { g.moveTo(x, y); g.lineTo(x, y + chh); } if (!on(f, j + 1)) { g.moveTo(x + cw, y); g.lineTo(x + cw, y + chh); } }
        g.stroke();
      }
      const x0 = tX(0); g.strokeStyle = V.light ? '#111' : '#fff'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x0, pt); g.lineTo(x0, pt + ph); g.stroke(); g.setLineDash([]);
      if (feat) for (const t of feat.spkT || []) glyph(g, 'tri', tX(t), pt + 5, 5, FPC.spk);
      if (V.cursor != null && F.on != null) { const xc = tX(V.cursor - F.on); if (xc >= pl && xc <= pl + pw) { g.strokeStyle = 'rgba(255,214,10,0.9)'; g.beginPath(); g.moveTo(xc, pt); g.lineTo(xc, pt + ph); g.stroke(); } }
      g.font = '10px system-ui, sans-serif'; g.fillStyle = V.light ? '#556171' : '#8f99a8'; g.textAlign = 'right';
      for (const hz of [1, 10, 30, 60, 100, 200]) { const f = fr.findIndex(x => x >= hz); if (f < 0 || fr[f] > hz * 1.1) continue; g.fillText(String(hz), pl - 3, yOf(f) + chh / 2 + 3); }
      g.textAlign = 'center'; for (let t = -20; t <= 20; t += 10) { const x = tX(t); if (x >= pl - 1 && x <= pl + pw + 1) g.fillText((t > 0 ? '+' : '') + t + ' s', x, H - 3); }
      g.textAlign = 'left'; g.fillText(`${name}${feat ? ` · score ${nf(feat.score, 2)}${feat.full ? ' · empreinte complète' : ''}` : ''} · Hz`, pl, 10);
      cv.onclick = e => { const r = cv.getBoundingClientRect(), t = F.t0 - F.dt / 2 + (e.clientX - r.left - pl) / pw * nT * F.dt; if (F.on == null) return; V.cursor = F.on + t; V.t = clamp(V.cursor - V.page / 2, 0, Math.max(0, V.mem.duration - V.page)); this.ieegDraw(); this.ieegFPPlot(cv); };
    },
    /** fond : activité rapide (maximum, au-dessus de la fréquence basse de l'activité rapide, de l'image lissée en log10 du rapport à la référence) */
    ieegFPHeat() {
      const V = this._iev, F = V.fp, Lr = V.rec.fp && V.rec.fp.last; if (!F || !Lr || Lr.montage !== V.montage || F.on == null) return null; const P = this.ieegFPParams(), k = P.faLo + '|' + V.light + '|' + V.show.cmap + '|' + Lr.at;
      if (V._fpHeat && V._fpHeat.k === k) return V._fpHeat.hs;
      const nF = F.freqs.length, hiF = F.freqs.map((f, i) => f >= P.faLo ? i : -1).filter(i => i >= 0), rows = new Map();
      F.names.forEach((n, i) => { const a = new Float32Array(F.nT), Sm = IM.smooth33(F.L[i], nF, F.nT); for (let j = 0; j < F.nT; j++) { let mx = 0; for (const f of hiF) { const v = Sm[f * F.nT + j]; if (v > mx) mx = v; } a[j] = mx; } rows.set(n, a); });
      const hs = { t0: F.on + F.t0, dt: F.dt, len: F.nT, lut: this.ieegFadeLut(), plainTrace: true, row: n => { const a = rows.get(n); return a ? { a, lo: 0.3, hi: 2 } : null; } };
      V._fpHeat = { k, hs }; return hs;
    },
    ieegFPSaveSet() {
      const V = this._iev, rec = V.rec, Lr = rec.fp.last, P = this.ieegFPParams(); if (!Lr || !Lr.rows) return;
      this.ieegFPTime(); const tw = P.tw;
      this.ieegSaveSet('fp', this.ieegFPRows(), r => this.ieegFPVal(r), { name: 'Empreinte · ' + rec.title, min: 0, max: 1, cmap: 'inferno', what: 'empreinte', extra: () => ({ thr: 0.99 }),
        source: `Empreinte de la ZE (Grinenko 2018, détection simplifiée) · ${Lr.montage === 'bipolar' ? 'bipolaire' : 'monopolaire'} · début ${clock(Lr.onset)} (−20 → +20 s, référence ${clock(Lr.base[0])}–${clock(Lr.base[1])}) · act. rapide ≥ ${nf(P.faThr, 2)} dès ${nf(P.faLo, 0)} Hz · suppression ≤ −${nf(P.supThr, 2)}, aire ≥ ${nf(P.supArea * 100, 1)} % · score (pointes + act. rapide + suppression) / 3 ; 1 = empreinte complète${tw ? ` · pondéré par le délai à la 1re activité rapide (précoce ≤ ${nf(P.early, 1)} s, τ ${nf(P.tau, 1)} s)` : ''}` });
    },
    ieegFPCSV() {
      const V = this._iev, rec = V.rec, Lr = rec.fp.last, P = this.ieegFPParams(); if (!Lr || !Lr.rows) return; const map = this.ieegElecMap();
      download(fname('Empreinte', rec), [`# EpiScope — empreinte de la zone épileptogène (Grinenko et al., Brain 2018 ; détection simplifiée) — ${rec.title}`, `# montage ${Lr.montage}; début ${f3(Lr.onset)} s; fenêtre ${f3(Lr.win[0])}–${f3(Lr.win[1])} s; référence ${f3(Lr.base[0])}–${f3(Lr.base[1])} s; Morlet indice 8, 1–${Lr.fmax} Hz; act. rapide ≥ ${P.faThr} (log10) dès ${P.faLo} Hz, durée ≥ ${P.faMinDur} s; suppression ≤ -${P.supThr}, aire ≥ ${f3(P.supArea * 100)} %; pointes z ≥ ${P.spkZ}`,
        `# temporalité : délai Δ au début de la 1re activité rapide de toutes les voies; empreinte franche ${P.clear >= 0.99 ? 'complète' : 'score ≥ ' + P.clear}; précoce si Δ ≤ ${P.early} s; poids = τ / (max(0, Δ − ${P.early}) + τ), τ ${P.tau} s; sans activité rapide : Δ pris à +${IM.FP.post} s`,
        'voie;électrode du schéma;pointes préictales;instants des pointes (s / début);activité rapide;début AR (s);fin AR (s);f min AR (Hz);f max AR (Hz);bandes simultanées;aire AR (Hz.s);suppression;aire suppression (%);f max suppression (Hz);score;empreinte complète;délai Δ (s);empreinte franche;précoce;poids temporel;score pondéré',
        ...(this.ieegFPTime(), this.ieegFPRows()).sort((a, b) => this.ieegFPVal(b) - this.ieegFPVal(a)).map(r => [r.name, map[r.elec] || '', r.nSpk, (r.spkT || []).map(f3).join(' '), r.fa ? 1 : 0, f3(r.faT0), f3(r.faT1), r.faFmin == null ? '' : r.faFmin, r.faFmax == null ? '' : r.faFmax, r.nBands, f3(r.faArea), r.sup ? 1 : 0, f3(r.supRatio * 100), r.supFmax == null ? '' : r.supFmax, f3(r.score), r.full ? 1 : 0, f3(r.dT), r.clear ? 1 : 0, r.clear ? (r.early ? 1 : 0) : '', f3(r.w), f3(r.sT)].join(';'))]);
    },

    // ---------------------------------------------------------------- empreinte connectivité (v4.20)
    /** régions de la parcellation touchées par les voies analysées (plots du schéma) → meilleure empreinte (pondérée par le
     *  délai) ; candidates : toutes les régions reliées (connectivité du modèle : voisinage, distance, liens curés,
     *  homotopiques, connectome du patient s'il est chargé), échantillonnées ou non */
    ieegFPConn() {
      const V = this._iev, Lr = V.rec.fp && V.rec.fp.last, At = this.atlas; if (!Lr || !Lr.rows) return { err: 'non calculée' };
      if (!At || !At.buildConnectivity) return { err: 'atlas indisponible' }; this.ieegFPTime();
      const rows = this.ieegFPRows(), map = this.ieegMapFor(V.rec, [...new Set(rows.map(r => r.elec))]), lab = this.quantLabeler ? this.quantLabeler() : null, ev = new Map(); let nMapped = 0;
      for (const r of rows) {
        const en = map[r.elec], e = en && S.findElec(this.elecs || [], en); if (!e || r.k1 == null || !this.quantContactRegion) continue;
        const regs = [...new Set([r.k1, r.k2].filter(k => k != null).map(k => this.quantContactRegion(e, k, lab)).filter(x => x > 0))]; if (!regs.length) continue; nMapped++;
        const v = this.ieegFPVal(r) || 0; for (const g0 of regs) { const o = ev.get(g0) || { e: 0, best: null, n: 0 }; o.n++; if (v > o.e || !o.best) { o.e = Math.max(o.e, v); o.best = r.name; } ev.set(g0, o); }
      }
      if (!ev.size) return { err: 'map' };
      const prm = Object.assign({}, SV.Model ? SV.Model.DEFAULT_PARAMS : {}, (this.state && this.state.params) || {}), C = At.buildConnectivity(prm), res = IM.fpConnect(ev, C, At.N, {});
      return { res, ev, nMapped, nReg: ev.size, label: r => At.label(r) };
    },
    ieegFPConnHtml(open) {
      const V = this._iev; if (V.fpConnOpen == null) V.fpConnOpen = !!open; const K = V.fpConnOpen ? this.ieegFPConn() : null;
      const body = !K ? '' : K.err === 'map' ? '<div class="hint warn">Aucune voie rattachée à une région : compléter la correspondance des électrodes avec le schéma (en bas du panneau) et localiser les plots.</div>' : K.err ? `<div class="hint warn">${esc(K.err)}</div>`
        : !K.res.length ? '<div class="hint">Aucune voie ne porte d’empreinte : rien à relier.</div>'
        : `<div class="hint">${K.nMapped} voies dans ${K.nReg} régions échantillonnées. Score d’une région = le plus grand de son empreinte propre (pondérée par le délai, si elle est échantillonnée) et de sa plausibilité de source : ressemblance (cosinus) entre son profil de connexion et la carte des empreintes des régions échantillonnées, × part de l’empreinte totale à laquelle elle est reliée. Une empreinte franche précoce échantillonnée reste en tête ; une région non échantillonnée passe devant quand elle relie plusieurs voies à l’empreinte nette. Connectivité du modèle : voisinage, distance, liens curés, homotopiques, connectome du patient s’il est chargé. ⇢ : score tiré de la connectivité. Hypothèse à confronter à l’anatomie, à la sémiologie et à l’imagerie.</div>
          <div class="ie-tabwrap" style="max-height:220px"><table class="ie-tab ie-fpctab"><tr><th>région</th><th title="le plus grand de l’empreinte propre et de la plausibilité de source (connectivité)">score</th><th title="échantillonnée par la SEEG (meilleure empreinte de ses voies)">SEEG</th><th title="régions échantillonnées qui portent le plus de son score">reliée à</th></tr>
          ${K.res.slice(0, 12).map((x, i) => `<tr class="${i === 0 ? 'hi' : ''}"><td class="nm">${esc(K.label(x.r))}</td><td title="${x.basis === 'own' ? 'd’après son empreinte propre' : `d’après la connectivité (plausibilité de source ${nf(x.src, 2)})`}">${nf(x.score, 2)}${x.basis === 'own' ? '' : ' <span class="muted">⇢</span>'}</td><td>${x.sampled ? `oui <span class="muted">${nf(x.own, 2)}</span>` : '<b>non</b>'}</td><td class="muted">${x.via.map(([r, f]) => `${r === x.r ? 'elle-même' : esc(K.label(r))} ${Math.round(f * 100)} %`).join(' · ')}</td></tr>`).join('')}</table></div>
          <div class="btnrow"><button class="f-csave">${this.ieegSetBtn('fpc', 'Enregistrer (régions en 3D)')}</button><button class="f-ccsv">CSV</button></div>`;
      return `<details class="ie-sec ie-fpc"${V.fpConnOpen ? ' open' : ''}><summary>Empreinte connectivité <span class="muted">— région qui pourrait nourrir les meilleures empreintes, échantillonnée ou non</span></summary>${body}</details>`;
    },
    ieegFPConnBind(box) {
      const V = this._iev, d = box.querySelector('.ie-fpc'); if (!d) return;
      d.ontoggle = () => { if (V.fpConnOpen === d.open) return; V.fpConnOpen = d.open; this.ieegFPRender(true); };
      const go = box.querySelector('.f-goconn'); if (go) go.onclick = () => { V.fpConnOpen = true; this.ieegFPRender(true); const d2 = V.sb.querySelector('.ie-fpc'); if (d2) d2.scrollIntoView({ block: 'nearest' }); };
      const sv = box.querySelector('.f-csave'); if (sv) sv.onclick = () => this.ieegFPConnSave();
      const cv = box.querySelector('.f-ccsv'); if (cv) cv.onclick = () => this.ieegFPConnCSV();
    },
    ieegFPConnSave() {
      const V = this._iev, rec = V.rec, Lr = rec.fp.last, P = this.ieegFPParams(), K = this.ieegFPConn(); if (!K.res || !K.res.length) { this.toast('Empreinte connectivité : aucune région candidate'); return null; }
      const top = K.res.slice(0, 12).map(x => ({ r: x.r, name: K.label(x.r), score: x.score, sampled: x.sampled, own: x.own, basis: x.basis, src: x.src, via: x.via.map(([r, f]) => [r === x.r ? 'elle-même' : K.label(r), f]) }));
      return this.ieegSaveSet('fpc', this.ieegFPRows(), r => this.ieegFPVal(r), { name: 'Empreinte connectivité · ' + rec.title, min: 0, max: 1, cmap: 'inferno', what: 'empreinte connectivité',
        extra: () => ({ thr: 0.99, regionValues: Object.fromEntries(K.res.map(x => [x.r, x.score])), regionTop: top }),
        source: `Empreinte connectivité (EpiScope) : régions reliées aux voies à l’empreinte la plus nette (Grinenko 2018, score${P.tw ? ' pondéré par le délai' : ''}) d’après la connectivité du modèle ; plots : empreinte des voies ; régions : score de la candidate (échantillonnée ou non) · début ${clock(Lr.onset)}` });
    },
    ieegFPConnCSV() {
      const V = this._iev, K = this.ieegFPConn(); if (!K.res) return;
      download(fname('Empreinte_connectivite', V.rec), [`# EpiScope — empreinte connectivité (régions reliées aux meilleures empreintes, échantillonnées ou non) — ${V.rec.title}`, '# score = max(empreinte propre si échantillonnée, plausibilité de source) ; plausibilité = cosinus(profil de connexion, carte des empreintes) × couverture (part de l’empreinte totale reliée)',
        'région;score;d’après;plausibilité de source;cosinus;couverture;échantillonnée;empreinte de la région;reliée à', ...K.res.map(x => [K.label(x.r), f3(x.score), x.basis === 'own' ? 'empreinte' : 'connectivité', f3(x.src), f3(x.cos), f3(x.cover), x.sampled ? 1 : 0, x.sampled ? f3(x.own) : '', x.via.map(([r, f]) => `${r === x.r ? 'elle-même' : K.label(r)} ${Math.round(f * 100)} %`).join(' | ')].join(';'))]);
    },

    // ================================================================ cartes d'épileptogénicité (David 2011)
    ieegEMParams() {
      const V = this._iev, rec = V.rec; rec.em = rec.em || {}; const P = rec.em.params || (rec.em.params = {}), D = IM.EM;
      if (P.band == null) P.band = IM.morletFmax(V.mem.fs, D.k) >= 200 ? 'hi' : 'lo';
      for (const [k, v] of Object.entries({ lo: 120, hi: 200, b0: D.base[0], b1: D.base[1], lat: D.lat, dur: D.dur, p: D.p, corr: D.corr, notch: D.notch, fwhm: 6, rmax: 12, early: 2, tau: 2, tw: true })) if (P[k] == null) P[k] = v;
      return P;
    },
    ieegEMBand(P) { const fx = IM.morletFmax(this._iev.mem.fs, IM.EM.k), b = P.band === 'custom' ? [+P.lo, +P.hi] : BANDS[P.band] || BANDS.hi; return [Math.max(2, Math.min(b[0], fx - 10)), Math.min(b[1], fx)]; },
    async ieegEMCompute() {
      const V = this._iev; if (!V || V.mbusy) return; const rec = V.rec, mk = rec.marks || {}, P = this.ieegEMParams();
      if (mk.onset == null) { this.toast('EM : marquer le début de crise (clic droit sur le tracé)', 5000); return; }
      const W = IM.emWindows(mk.onset, V.mem.duration, { base: [P.b0, P.b1], lat: P.lat, dur: P.dur }); if (W.err) { this.toast('EM : ' + W.err, 6000); return; }
      const ders = this.ieegMDers(); if (!ders.length) { this.toast('Aucune voie SEEG valide'); return; }
      const fs = V.mem.fs, band = this.ieegEMBand(P), freqs = IM.emFreqs(band, P.notch), blk = IM.EM.blk, tA = performance.now(), seg = W.seg, a = Math.min(1, (seg[1] - seg[0]) / 4), b = seg[1] - seg[0] - a;
      if (band[1] - band[0] < 10) { this.toast(`EM : bande trop étroite sous Nyquist (${nf(fs, 0)} Hz)`, 6000); return; }
      V.mbusy = 'em'; V.mcancel = false; V.mprog = 0; this.ieegEMRender();
      try {
        const sig = this.ieegSig(ders, seg[0], seg[1]), nj = Math.min(sig.length, 2 * Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 2) - 1))), size = Math.ceil(sig.length / nj), jobs = [];
        for (let i = 0; i < sig.length; i += size) { const c = sig.slice(i, i + size); jobs.push({ args: [c, fs, { freqs, k: IM.EM.k, a, b, blk }], transfer: c.map(x => x.buffer) }); }
        const parts = await this.ieegPar('IEEGM.emBatch', jobs); if (this._iev !== V) return;
        const E = [].concat(...parts.map(p => p.E)), t0 = seg[0] + a + blk / 2 - mk.onset;
        V.em = { montage: V.montage, names: ders.map(d => d.name), ders, E, nT: parts[0].nT, dt: blk, t0 };
        rec.em.last = { at: ST.now(), montage: V.montage, onset: mk.onset, band, freqs, notch: P.notch, blk, t0, nT: V.em.nT, base: W.base, req: { b0: P.b0, b1: P.b1, dur: P.dur }, warn: W.warn, ms: Math.round(performance.now() - tA), names: V.em.names.slice() };
        this.ieegEMDerive(); await this.ieegEMSaveFile(); V.dirty = true; this.touch();
      } catch (e) { if (!V.mcancel) { console.warn(e); this.toast('EM : ' + e.message, 7000); } }
      finally { V.mbusy = null; V.mcancel = false; if (this._iev === V) { this.ieegMethRender(); this.ieegChips(); this.ieegDraw(); } }
    },
    /** t de chaque voie à la latence choisie, significativité corrigée, délais (première latence significative) */
    ieegEMDerive() {
      const V = this._iev, C = V.em, Lr = V.rec.em && V.rec.em.last; if (!C || !Lr) return; const P = this.ieegEMParams(), ex = this.ieegExcl(), byD = new Map((C.ders || V.D).map(d => [d.name, d]));
      const keep = C.names.map((n, i) => ex.has(n) ? -1 : i).filter(i => i >= 0), base = Lr.base || [P.b0, P.b1], lats = IM.EM.lats;
      const test = (i, lat) => IM.emTest(C.E[i], C.t0, C.dt, base, lat, P.dur), sigAt = lat => { const T = keep.map(i => test(i, lat)), ps = T.map(r => r ? r.p1 : 1), q = X.adjust(ps, P.corr); return { T, q }; };
      const cur = sigAt(P.lat), del = new Map(); for (const lat of lats) { const s = sigAt(lat); keep.forEach((i, k) => { if (!del.has(i) && s.q[k] < P.p) del.set(i, lat); }); }
      const rows = [], dfs = []; keep.forEach((i, k) => { const r = cur.T[k], d = byD.get(C.names[i]) || V.D.find(x => x.name === C.names[i]); if (!d || !r) return; dfs.push(r.df);
        let mB = 0, nB = 0, mI = 0, nI = 0; for (let j = 0; j < C.nT; j++) { const t = C.t0 + j * C.dt; if (t >= base[0] && t <= base[1]) { mB += C.E[i][j]; nB++; } if (t >= P.lat && t <= P.lat + P.dur) { mI += C.E[i][j]; nI++; } }
        rows.push(Object.assign(this.ieegRowOf(d), { t: Math.round(r.t * 100) / 100, df: Math.round(r.df * 10) / 10, p: r.p1, q: cur.q[k], sig: cur.q[k] < P.p, delay: del.has(i) ? del.get(i) : null, dB: nB && nI ? Math.round(10 * (mI / nI - mB / nB) * 10) / 10 : null })); });
      // t critique (carte, jeu) : Bonferroni ou sans correction au plus petit df ; FDR : plus petit t significatif
      const dfMin = dfs.length ? Math.min(...dfs) : 10, m = Math.max(1, rows.length), sigT = rows.filter(r => r.sig).map(r => r.t);
      Lr.tCrit = Math.round((P.corr === 'fdr' ? (sigT.length ? Math.min(...sigT) : X.tInv(1 - P.p / m, dfMin)) : X.tInv(1 - (P.corr === 'bonf' ? P.p / m : P.p), dfMin)) * 100) / 100;
      Lr.rows = rows; Lr.lat = P.lat; Lr.dur = P.dur; Lr.p = P.p; Lr.corr = P.corr; Lr.nSig = rows.filter(r => r.sig).length;
      Lr.byLat = lats.map(lat => ({ lat, n: [...del.values()].filter(x => x <= lat).length })); V._emHeat = null;
      const T = IM.emTiming(rows, { early: P.early, tau: P.tau, lmax: lats[lats.length - 1], step: lats[1] - lats[0] }); rows.forEach((r, i) => Object.assign(r, T.rows[i])); Lr.timing = { d0: T.d0, nEarly: T.nEarly, nLate: T.nLate, early: P.early, tau: P.tau };
    },
    async ieegEMSaveFile() {
      const V = this._iev, C = V.em, Lr = V.rec.em.last; if (!C) return; const path = `ieeg/${V.rec.id}/em_${V.montage}.json`;
      try { await L.writeFile(this.dossier, path, new Blob([JSON.stringify({ v: 1, names: C.names, t0: C.t0, dt: C.dt, E: C.E.map(a => Array.from(a, v => Math.round(v * 1000) / 1000)) })], { type: 'application/json' })); Lr.path = path; } catch (e) { console.warn('EM', e); }
    },
    async ieegEMLoad() {
      const V = this._iev, Lr = V.rec.em && V.rec.em.last; if (!Lr || !Lr.path || V.em || V._emLoading) return; V._emLoading = true;
      try { const b = await L.readFile(this.dossier, Lr.path), J = JSON.parse(await b.text()); if (this._iev !== V) return; V.em = { montage: Lr.montage, names: J.names, ders: null, E: J.E.map(a => Float32Array.from(a)), nT: J.E[0] ? J.E[0].length : 0, dt: J.dt, t0: J.t0 }; this.ieegEMDerive(); this.ieegDraw(); if (V.meth === 'em') this.ieegEMRender(); }
      catch (e) { console.warn('EM', e); } finally { V._emLoading = false; }
    },
    ieegEMRows() { const V = this._iev, Lr = V.rec.em && V.rec.em.last, ex = this.ieegExcl(); return Lr && Lr.rows ? Lr.rows.filter(r => !ex.has(r.name)) : []; },
    /** valeur d'une voie (tri, jeu, barre) : t pondéré par le délai (défaut) ou t */
    ieegEMVal(r) { return this.ieegEMParams().tw && r.tw != null ? r.tw : Math.max(0, r.t); },
    ieegEMStale() { const V = this._iev, Lr = V.rec.em && V.rec.em.last, mk = V.rec.marks || {}, P = this.ieegEMParams(); if (!Lr) return ''; if (Lr.onset !== mk.onset) return 'début de crise modifié'; const b = this.ieegEMBand(P); if (Lr.band[0] !== b[0] || Lr.band[1] !== b[1]) return 'bande modifiée'; const rq = Lr.req || {}; if (rq.b0 != null && (rq.b0 !== P.b0 || rq.b1 !== P.b1)) return 'référence modifiée'; if (rq.dur != null && P.dur > rq.dur) return 'fenêtre allongée'; if (Lr.montage !== V.montage) return `calculé en ${Lr.montage === 'bipolar' ? 'bipolaire' : 'monopolaire'}`; return ''; },
    ieegEMRender(onlyRes) {
      const V = this._iev, side = V.sb, rec = V.rec, P = this.ieegEMParams(), mk = rec.marks || {}, Lr = rec.em.last, band = this.ieegEMBand(P);
      if (Lr && !V.em) this.ieegEMLoad();
      const sel = V.sel >= 0 && V.D[V.sel] ? V.D[V.sel].name : null, stale = this.ieegEMStale(), corrL = { bonf: 'Bonferroni', fdr: 'FDR', none: 'sans correction' };
      const resHtml = () => {
        if (!Lr || !Lr.rows) return ''; const val = r => this.ieegEMVal(r), rows = this.ieegEMRows().sort((a, b) => val(b) - val(a) || b.t - a.t || a.name.localeCompare(b.name, 'fr', { numeric: true })), mx = Math.max(1e-9, ...rows.map(r => r.t)), thr = Lr.tCrit, T = Lr.timing || {};
        const del = r => r.delay == null ? '—' : `<span title="première latence significative ${nf(r.delay, 0)} s${r.dT ? ` ; Δ +${nf(r.dT, 0)} s après la voie la plus précoce` : ''}">${nf(r.delay, 0)} s</span> ${r.early ? '<span class="ie-early" title="significative dès les premières latences">préc.</span>' : '<span class="ie-late" title="significative plus tard : propagation probable">tard.</span>'}`;
        const tline = T.d0 == null ? '<div class="ie-n0">aucune voie significative de 0 à 20 s</div>' : `<div class="ie-n0">temporalité : 1re latence significative ${nf(T.d0, 0)} s · <b>${T.nEarly}</b> voie${T.nEarly > 1 ? 's' : ''} précoce${T.nEarly > 1 ? 's' : ''} (Δ ≤ ${nf(P.early, 1)} s) · ${T.nLate} tardive${T.nLate > 1 ? 's' : ''} (propagation probable)${T.d0 > 4 ? ' · <span class="warn">début tardif par rapport au début annoté : source peut-être hors des voies échantillonnées</span>' : ''}</div>`;
        return `<div class="ie-n0">${rows.length} voies · <b>${Lr.nSig}</b> significative${Lr.nSig > 1 ? 's' : ''} à L = ${nf(P.lat, 1)} s (p < ${nf(P.p, 3)}, ${corrL[P.corr]}) · t critique ${nf(thr, 2)} · ${nf(Lr.band[0], 0)}–${nf(Lr.band[1], 0)} Hz${(Lr.warn || []).length ? ` · <span class="warn">${esc(Lr.warn.join(' ; '))}</span>` : ''}${stale ? ` · <span class="warn">${esc(stale)} : recalculer</span>` : ''}</div>${tline}
          ${Lr.byLat ? '<canvas class="ie-h2plot ie-emplot" title="Contacts significatifs selon la latence (délai : première latence significative) ; clic : choisir la latence"></canvas>' : ''}
          <div class="ie-tabwrap"><table class="ie-tab ie-fptab" style="--thr:${Math.round(Math.min(1, thr / mx) * 100)}%"><tr><th>voie</th>${P.tw ? `<th title="t pondéré par le délai : t × τ / (max(0, Δ − ${nf(P.early, 1)} s) + τ), τ = ${nf(P.tau, 1)} s ; Δ : délai à la première latence significative de toutes les voies ; jamais significative : Δ pris après 20 s ; entre parenthèses : t de Welch de [L, L + ${nf(P.dur, 1)} s] contre la référence">t × délai</th>` : `<th title="t de Welch : puissance haute fréquence de [L, L + ${nf(P.dur, 1)} s] contre la référence">t</th>`}<th title="Variation de puissance (dB) par rapport à la référence">Δ dB</th><th title="p unilatéral (hausse), corrigé">p corr.</th><th title="Délai : première latence (0 à 20 s, pas de 2 s) où la voie devient significative ; Δ : écart à la voie la plus précoce">délai</th></tr>
          ${rows.map(r => `<tr data-n="${esc(r.name)}" class="${r.sig && (!P.tw || r.early) ? 'hi' : ''}${r.name === sel ? ' sel' : ''}"><td class="nm mono">${esc(r.name)}</td>${P.tw ? `<td><i class="ie-bar"><b style="width:${Math.round(Math.max(0, r.tw || 0) / mx * 100)}%"></b></i>${nf(Math.round((r.tw || 0) * 10) / 10, 1)}${Math.abs((r.tw || 0) - Math.max(0, r.t)) > 0.05 ? ` <span class="muted">(${nf(Math.round(r.t * 10) / 10 || 0, 1)})</span>` : ''}</td>` : `<td><i class="ie-bar"><b style="width:${Math.round(Math.max(0, r.t) / mx * 100)}%"></b></i>${nf(Math.round(r.t * 10) / 10 || 0, 1)}</td>`}<td>${r.dB == null ? '—' : (r.dB > 0.05 ? '+' : '') + nf(Math.round(r.dB * 10) / 10 || 0, 1)}</td><td>${r.q < 0.001 ? '< 0,001' : nf(r.q, 3)}</td><td>${del(r)}</td></tr>`).join('')}</table></div>`;
      };
      const bindRes = box => { box.querySelectorAll('tr[data-n]').forEach(tr => tr.onclick = () => this.ieegGotoT(tr.dataset.n, Lr.onset + P.lat + P.dur / 2)); this.ieegEMPlot(box.querySelector('.ie-emplot')); };
      if (onlyRes && side.querySelector('.ie-res')) { const box = side.querySelector('.ie-res'), w = box.querySelector('.ie-tabwrap'), sc = w ? w.scrollTop : 0; box.innerHTML = resHtml(); bindRes(box); const w2 = box.querySelector('.ie-tabwrap'); if (w2) w2.scrollTop = sc; return; }
      const METHOD = 'David et al. 2011 (méthode de Brainstorm) : puissance haute fréquence (Morlet, bande 120–200 Hz, ou 60–100 Hz sous 512 Hz d’échantillonnage) des dérivations bipolaires par blocs de 0,2 s, en log10 ; pour chaque voie, t de Welch des blocs de la fenêtre [L, L + 3 s] après le début contre ceux de la référence [−10, −1] s ; seuil p < 0,05 corrigé (Bonferroni par défaut) ; délai = première latence (0 à 20 s, pas de 2 s) où la voie est significative. Carte sur l’IRM : t des voies étalés autour des plots (noyau gaussien, FWHM 6 mm, ≤ 12 mm) dans le cerveau du patient, seuil t critique — image dérivée dans l’espace du T1. Les blocs successifs sont corrélés : t et p sont surtout comparatifs entre voies.';
      const warn = mk.onset == null ? 'Les cartes d’épileptogénicité demandent le <b>début de crise</b> annoté (clic droit sur le tracé).' : V.montage !== 'bipolar' ? 'Les EM se calculent en montage bipolaire. <a data-mont="bipolar">Passer en bipolaire</a>' : IM.morletFmax(V.mem.fs, IM.EM.k) < 200 && P.band === 'hi' ? `échantillonnage ${nf(V.mem.fs, 0)} Hz : bande ramenée à ${nf(band[0], 0)}–${nf(band[1], 0)} Hz` : '';
      const busy = V.mbusy === 'em', ok = mk.onset != null, A0 = this.patientAnat, ref = ST.refImaging(this.dossier || { imaging: [] });
      side.innerHTML = this.ieegMHead('Cartes d’épileptogénicité (EM)', 'David et al., Brain 2011', METHOD,
        `<span><i class="ie-lgbar" style="background:${S.cmapCss(V.show.cmap)}"></i> puissance HF / référence (z, fond)</span><span>${LG.zone(ZFP.base)} référence</span><span>${LG.zone(ZFP.win)} fenêtre [L, L + ${nf(P.dur, 1)} s]</span>`, warn)
        + `<div class="ie-sec"><div class="ie-sh">Fenêtres <span class="muted">(${ok ? `début ${clock(mk.onset)} · référence ${nf(P.b0, 0)} → ${nf(P.b1, 0)} s` : 'crise non annotée'})</span></div>
            <div class="ctrl-row"><label>bande <select class="e-band">${Object.entries(BANDL).map(([k, l]) => `<option value="${k}"${P.band === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>${P.band === 'custom' ? `<label><input type="number" step="5" min="20" class="e-lo" value="${P.lo}"> – <input type="number" step="5" min="30" class="e-hi" value="${P.hi}"> Hz</label>` : ''}</div>
            <label class="ie-sl" title="Latence L : début de la fenêtre testée, après le début de crise">latence L <input type="range" class="e-lat" min="0" max="20" step="0.2" value="${P.lat}"><output>${nf(P.lat, 1)} s</output></label>
            <div class="ctrl-row"><label>seuil p <select class="e-p">${[0.05, 0.01, 0.001].map(v => `<option value="${v}"${+P.p === v ? ' selected' : ''}>${nf(v, 3)}</option>`).join('')}</select></label><label>correction <select class="e-corr">${Object.entries(corrL).map(([k, l]) => `<option value="${k}"${P.corr === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label></div></div>
          <details class="ie-sec"><summary>Réglages des EM</summary>
            <div class="ctrl-row"><label title="Durée de la fenêtre testée">durée <input type="number" step="0.5" min="1" class="e-dur" value="${P.dur}"> s</label><label title="Référence (s, par rapport au début)">référence <input type="number" step="1" max="-1" class="e-b0" value="${P.b0}"> → <input type="number" step="0.5" class="e-b1" value="${P.b1}"> s</label></div>
            <div class="ctrl-row"><label title="Harmoniques du secteur écartées (± 3 Hz)">secteur <select class="e-notch">${[[50, '50 Hz'], [60, '60 Hz'], [0, 'aucun']].map(([v, l]) => `<option value="${v}"${+P.notch === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label><label title="Carte sur l’IRM : largeur à mi-hauteur du noyau gaussien autour de chaque plot">noyau <input type="number" step="1" min="2" max="15" class="e-fwhm" value="${P.fwhm}"> mm</label><label title="distance maximale à un plot">≤ <input type="number" step="1" min="4" max="25" class="e-rmax" value="${P.rmax}"> mm</label></div>
            <div class="ctrl-row"><label title="Précoce : significative au plus tant de secondes après la voie la plus précoce">précoce si Δ ≤ <input type="number" step="2" min="0" class="e-early" value="${P.early}"> s</label><label title="Décroissance du poids avec le délai : τ / (Δ − précoce + τ)">τ <input type="number" step="0.5" min="0.5" class="e-tau" value="${P.tau}"> s</label><label class="ie-chk" title="Tri, barre et jeu d’Analyses : t pondéré par le délai (une voie significative tôt l’emporte sur une voie recrutée plus tard)"><input type="checkbox" class="e-tw"${P.tw ? ' checked' : ''}> t pondéré par le délai</label></div>
            <div class="hint">Latence, seuil, correction et pondération modifiables sans recalcul ; bande, référence et durée : recalculer. David et al. lisent les cartes de latence en latence : la zone significative aux premières latences est la zone de début, les suivantes la propagation.</div></details>
          ${busy ? this.ieegBusyHtml(`Puissance ${nf(band[0], 0)}–${nf(band[1], 0)} Hz (${this.ieegMDers().length} voies)`) : `<div class="ie-status">${Lr ? `<span>calculé le ${new Date(Lr.at).toLocaleString(SV.LOC, { dateStyle: 'short', timeStyle: 'short' })}${Lr.ms ? ` (${nf(Lr.ms / 1000, 1)} s)` : ''}</span>` : '<span>Non calculé</span>'}<button class="e-run${Lr ? '' : ' primary'}"${ok ? '' : ' disabled'}>${Lr ? '↻ Recalculer' : 'Calculer'}</button></div>`}
          <div class="ie-res"></div>
          <div class="btnrow"><button class="primary e-save"${Lr && Lr.rows ? '' : ' disabled'}>${this.ieegSetBtn('em')}</button><button class="e-mri"${Lr && Lr.rows && A0 && A0.vepVol && ref ? '' : ` disabled title="${esc(!ref ? 'T1 de référence absent (écran Imagerie)' : 'anatomie du patient à calculer (écran Imagerie)')}"`}>Carte sur l’IRM</button><button class="e-csv"${Lr && Lr.rows ? '' : ' disabled'}>CSV</button></div>${this.ieegMapNote()}`;
      const q = s => side.querySelector(s), box = q('.ie-res'); box.innerHTML = resHtml(); bindRes(box); this.ieegBindCommon(side);
      const mo = side.querySelector('[data-mont]'); if (mo) mo.onclick = () => { V.montage = 'bipolar'; V.rec.view = Object.assign(V.rec.view || {}, { montage: 'bipolar' }); this.ieegSetMontage(); };
      const live = () => { if (V.em) { this.ieegEMDerive(); this.ieegEMRender(true); this.ieegDraw(); } }, re = () => { this.ieegEMRender(); this.ieegDraw(); };
      q('.e-band').onchange = e => { P.band = e.target.value; V.dirty = true; re(); };
      this.ieegNumIn(side, '.e-lo', P, 'lo', 20, re); this.ieegNumIn(side, '.e-hi', P, 'hi', 30, re);
      const lt = q('.e-lat'); lt.oninput = () => { P.lat = +lt.value; lt.nextElementSibling.textContent = nf(P.lat, 1) + ' s'; V.dirty = true; live(); };
      q('.e-p').onchange = e => { P.p = +e.target.value; V.dirty = true; live(); }; q('.e-corr').onchange = e => { P.corr = e.target.value; V.dirty = true; live(); };
      this.ieegNumIn(side, '.e-dur', P, 'dur', 1, re); this.ieegNumIn(side, '.e-b0', P, 'b0', null, re); this.ieegNumIn(side, '.e-b1', P, 'b1', null, re);
      q('.e-notch').onchange = e => { P.notch = +e.target.value; V.dirty = true; re(); };
      this.ieegNumIn(side, '.e-early', P, 'early', 0, live); this.ieegNumIn(side, '.e-tau', P, 'tau', 0.5, live); q('.e-tw').onchange = e => { P.tw = e.target.checked; V.dirty = true; live(); };
      this.ieegNumIn(side, '.e-fwhm', P, 'fwhm', 2, () => { }); this.ieegNumIn(side, '.e-rmax', P, 'rmax', 4, () => { });
      const run = q('.e-run'); if (run) run.onclick = () => this.ieegEMCompute();
      q('.e-save').onclick = () => this.ieegEMSaveSet(); q('.e-mri').onclick = () => this.ieegEMMap(); q('.e-csv').onclick = () => this.ieegEMCSV();
    },
    /** contacts significatifs selon la latence (cumul des délais) ; latence courante surlignée ; clic : latence */
    ieegEMPlot(cv) {
      const V = this._iev, Lr = V.rec.em.last, P = this.ieegEMParams(); if (!cv || !Lr || !Lr.byLat) return; const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr;
      const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H); const B = Lr.byLat, n = B.length, mx = Math.max(1, ...B.map(b => b.n), Lr.nSig), bw = (W - 12) / n;
      B.forEach((b, i) => { const hh = b.n / mx * (H - 26), x = 6 + i * bw; g.fillStyle = V.light ? 'rgba(192,38,45,0.55)' : 'rgba(255,90,95,0.55)'; g.fillRect(x + 1, H - 12 - hh, bw - 2, hh); });
      const xl = 6 + P.lat / 20 * (n - 1) * bw + bw / 2; g.strokeStyle = V.light ? '#111' : '#fff'; g.beginPath(); g.moveTo(xl, 12); g.lineTo(xl, H - 12); g.stroke();
      g.font = '10px system-ui, sans-serif'; g.fillStyle = V.light ? '#556171' : '#8f99a8'; g.textAlign = 'left'; g.fillText(`contacts significatifs selon la latence (max ${mx}) · L = ${nf(P.lat, 1)} s : ${Lr.nSig}`, 6, 10);
      g.textAlign = 'center'; B.forEach((b, i) => { if (i % 2 === 0) g.fillText(b.lat + ' s', 6 + i * bw + bw / 2, H - 2); });
      cv.onclick = e => { const r = cv.getBoundingClientRect(), i = clamp(Math.floor((e.clientX - r.left - 6) / bw), 0, n - 1); P.lat = B[i].lat; V.dirty = true; this.ieegEMDerive(); this.ieegEMRender(); this.ieegDraw(); };
    },
    /** fond : puissance haute fréquence de chaque bloc en z de la référence (hausses seules) */
    ieegEMHeat() {
      const V = this._iev, C = V.em, Lr = V.rec.em && V.rec.em.last; if (!C || !Lr || Lr.montage !== V.montage) return null; const k = V.show.cmap + '|' + V.light + '|' + Lr.at;
      if (V._emHeat && V._emHeat.k === k) return V._emHeat.hs; const base = Lr.base, rows = new Map();
      C.names.forEach((n, i) => { const e = C.E[i], B = []; for (let j = 0; j < C.nT; j++) { const t = C.t0 + j * C.dt; if (t >= base[0] && t <= base[1]) B.push(e[j]); } const m = X.mean(B), sd = Math.sqrt(X.variance(B, m)) || 1, a = new Float32Array(C.nT); for (let j = 0; j < C.nT; j++) a[j] = (e[j] - m) / sd; rows.set(n, a); });
      const hs = { t0: Lr.onset + C.t0, dt: C.dt, len: C.nT, lut: this.ieegFadeLut(), plainTrace: true, row: n => { const a = rows.get(n); return a ? { a, lo: 0, hi: 8 } : null; } };
      V._emHeat = { k, hs }; return hs;
    },
    ieegEMSaveSet() {
      const V = this._iev, rec = V.rec, Lr = rec.em.last, P = this.ieegEMParams(); if (!Lr || !Lr.rows) return null; const rows = this.ieegEMRows(), mx = Math.max(1, ...rows.map(r => r.t)), corrL = { bonf: 'Bonferroni', fdr: 'FDR', none: 'sans correction' };
      return this.ieegSaveSet('em', rows, r => this.ieegEMVal(r), { name: `EM ${nf(Lr.band[0], 0)}–${nf(Lr.band[1], 0)} Hz · L ${nf(P.lat, 1)} s · ${rec.title}`, unit: 't', min: 0, max: Math.ceil(mx), rescale: true, cmap: 'inferno', what: 'EM', extra: () => ({ thr: Lr.tCrit, em: { lat: P.lat, dur: P.dur, band: Lr.band, tCrit: Lr.tCrit } }),
        source: `Cartes d’épileptogénicité (David 2011) · ${Lr.montage === 'bipolar' ? 'bipolaire' : 'monopolaire'} · ${nf(Lr.band[0], 0)}–${nf(Lr.band[1], 0)} Hz, blocs de 0,2 s · fenêtre [${nf(P.lat, 1)} ; ${nf(P.lat + P.dur, 1)}] s contre [${nf(Lr.base[0], 1)} ; ${nf(Lr.base[1], 1)}] s · t de Welch, seuil t ${nf(Lr.tCrit, 2)} (p ${nf(P.p, 3)}, ${corrL[P.corr]})${P.tw ? ` · t pondéré par le délai (précoce ≤ ${nf(P.early, 1)} s, τ ${nf(P.tau, 1)} s)` : ''} · début ${clock(Lr.onset)}` });
    },
    /** carte sur l'IRM : t des plots (jeu enregistré) étalés dans le cerveau du patient → image dérivée (calque des coupes) */
    async ieegEMMap() {
      const V = this._iev, rec = V.rec, Lr = rec.em.last, P = this.ieegEMParams(), d = this.dossier, A0 = this.patientAnat, ref = ST.refImaging(d); if (!Lr || !A0 || !A0.vepVol || !ref) return;
      const q = this.ieegEMSaveSet(); if (!q) return; const pts = [], miss = [];
      for (const [key, v] of Object.entries(q.values)) { const w = this.quantWorldPos ? this.quantWorldPos(key) : null; if (w && w.p) pts.push([w.p[0], w.p[1], w.p[2], v]); else miss.push(key); }
      if (!pts.length) { this.toast('Carte EM : aucun plot localisé (électrodes réelles ou schéma recalé à valider dans l’exploration)', 6000); return; }
      const job = this.jobStart ? this.jobStart(`Carte d’épileptogénicité sur l’IRM · L ${nf(P.lat, 1)} s`) : null;
      try {
        const G = this._emGrid && this._emGrid.A === A0 ? this._emGrid.G : SV.PVC.labelGrid(A0.vepVol, 2); this._emGrid = { A: A0, G };
        const mask = new Uint8Array(G.code.length); for (let i = 0; i < mask.length; i++) mask[i] = G.code[i] > 0 && G.code[i] !== 201 ? 1 : 0;
        const data = IM.emSplat({ dims: G.dims, affine: G.affine }, mask, pts, { fwhm: +P.fwhm || 6, rmax: +P.rmax || 12 });
        let tmax = 0; for (const v of data) if (v > tmax) tmax = v;
        const vol = { dims: G.dims, pixdim: [G.res, G.res, G.res], affine: Float64Array.from(G.affine), data, slope: 1, inter: 0, descrip: 'EpiScope EM' }, u8 = await SV.Nifti.encodeGz(vol), short = `EM ${nf(Lr.band[0], 0)}–${nf(Lr.band[1], 0)} Hz · L ${nf(P.lat, 1)} s`;
        const im = ST.addImaging(d, { modality: 'other', timepoint: 'preop', date: (ref.date || ''), label: `${short} · ${rec.title}`, source: 'EpiScope (SEEG)', bytes: u8.length, dims: G.dims, pixdim: [G.res, G.res, G.res].map(v => +v.toFixed(3)), nt: 1,
          coreg: { T: ID16.slice(), refId: ref.id, method: 'carte calculée dans l’espace du T1', date: ST.now(), text: 'carte d’épileptogénicité · espace du T1' },
          derived: { kind: 'em', short, from: 'ieeg:' + rec.id, cmap: 'hot', win: [Math.max(0, Lr.tCrit * 0.6), Math.max(Lr.tCrit + 1, Math.ceil(tmax))], thr: Lr.tCrit, band: Lr.band, lat: P.lat, dur: P.dur, p: P.p, corr: P.corr, fwhm: +P.fwhm, rmax: +P.rmax, res: G.res, rec: rec.title, nPts: pts.length, nSig: Lr.nSig, date: ST.now() } });
        im.file = `imaging/${im.id}.nii.gz`; await L.writeFile(d, im.file, u8); this._volCache = this._volCache || new Map(); this._volCache.set(im.id, vol);
        ST.log(d, 'compute', 'imaging', im.id, short); this.touch('imaging', im.id, im.label);
        const st = this.slvState ? this.slvState() : null; if (st) { st.overlays = (st.overlays || []).filter(o => !(S0 => S0 && S0.derived && S0.derived.kind === 'em' && S0.derived.from === 'ieeg:' + rec.id)(ST.byId(d.imaging, o.id))); st.overlays.push({ id: im.id, on: true, opacity: 0.8 }); if (this.slices && this.updateImagingLayers) this.updateImagingLayers(); else this.syncSlices3d && this.syncSlices3d(); }
        if (job) job.done(`${short} : ${pts.length} plots${miss.length ? ` (${miss.length} non localisés)` : ''}, t max ${nf(tmax, 1)}`);
        this.toast(`Carte « ${short} » : calque des coupes (seuil t ${nf(Lr.tCrit, 2)}) ; listée dans Imagerie › Post-traitement › Cartes calculées`, 6500);
      } catch (e) { console.error(e); if (job) job.fail(e.message); else this.toast('Carte EM : ' + e.message, 6000); }
    },
    ieegEMCSV() {
      const V = this._iev, rec = V.rec, Lr = rec.em.last, P = this.ieegEMParams(); if (!Lr || !Lr.rows) return; const map = this.ieegElecMap();
      download(fname('EM', rec), [`# EpiScope — cartes d'épileptogénicité (David et al., Brain 2011) — ${rec.title}`, `# montage ${Lr.montage}; début ${f3(Lr.onset)} s; bande ${Lr.band.join('-')} Hz (secteur ${Lr.notch || 'aucun'}); blocs ${Lr.blk} s; référence ${f3(Lr.base[0])} à ${f3(Lr.base[1])} s; fenêtre L ${P.lat} s + ${P.dur} s; p ${P.p} ${P.corr}; t critique ${f3(Lr.tCrit)}`,
        `# temporalité : Δ = délai − premier délai significatif; précoce si Δ ≤ ${P.early} s; poids = τ / (max(0, Δ − ${P.early}) + τ), τ ${P.tau} s; jamais significative : Δ pris après la dernière latence`,
        'voie;électrode du schéma;t (Welch);ddl;variation (dB);p unilatéral;p corrigé;significatif;délai (s);Δ (s);précoce;poids temporel;t pondéré', ...this.ieegEMRows().sort((a, b) => b.t - a.t).map(r => [r.name, map[r.elec] || '', f3(r.t), f3(r.df), f3(r.dB), r.p < 1e-6 ? r.p.toExponential(2) : f3(r.p), r.q < 1e-6 ? r.q.toExponential(2) : f3(r.q), r.sig ? 1 : 0, r.delay == null ? '' : r.delay, r.dT == null ? '' : r.dT, r.delay == null ? '' : r.early ? 1 : 0, f3(r.w), f3(r.tw)].join(';'))]);
    },
  };
  Object.assign(A, M);

  // ---------------------------------------------------------------- greffes : fond, barre, fenêtres et aperçu des deux onglets
  const g = (name, fn) => { const f0 = A[name]; A[name] = function () { const V = this._iev; if (V && (V.meth === 'fp' || V.meth === 'em')) return fn.apply(this, arguments); return f0 ? f0.apply(this, arguments) : undefined; }; };
  g('ieegHeatLabel', function () { return this._iev.meth === 'fp' ? 'activité rapide / référence' : 'puissance HF (z)'; });
  g('ieegHeatSrc', function () { return this._iev.meth === 'fp' ? this.ieegFPHeat() : this.ieegEMHeat(); });
  g('ieegLaneVal', function (name) {
    const V = this._iev;
    if (V.meth === 'fp') { const Lr = V.rec.fp && V.rec.fp.last, r = Lr && Lr.rows && Lr.rows.find(x => x.name === name); if (!r) return null; const P = this.ieegFPParams(); return { v: this.ieegFPVal(r), hi: P.tw ? r.clear && r.early : r.full }; }
    const Lr = V.rec.em && V.rec.em.last, r = Lr && Lr.rows && Lr.rows.find(x => x.name === name); if (!r) return null; const mx = Math.max(1e-9, ...Lr.rows.map(x => x.t)), P = this.ieegEMParams(); return { v: this.ieegEMVal(r) / mx, hi: r.sig && (!P.tw || r.early) };
  });
  g('ieegPaintShade', function (gx, o) {
    const V = this._iev, { X, x0, pw, TOP, H } = o, band = (a, b, col) => { const xa = clamp(X(a), x0, x0 + pw), xb = clamp(X(b), x0, x0 + pw); if (xb > xa) { gx.fillStyle = col; gx.fillRect(xa, TOP, xb - xa, H - TOP); } };
    if (V.meth === 'fp') { const W = this.ieegFPWins(); if (W && !W.err) { band(W.base[0], W.base[1], ZFP.base); band(W.win[0], W.win[1], o.heatOn ? 'rgba(255,255,255,0.02)' : ZFP.win); } return; }
    const mk = V.rec.marks || {}, P = this.ieegEMParams(); if (mk.onset == null) return; band(mk.onset + P.b0, mk.onset + P.b1, ZFP.base); band(mk.onset + P.lat, mk.onset + P.lat + P.dur, ZFP.win);
  });
  g('ieegPaintWin', function (gx, o) {
    const V = this._iev, vl = o.vline, cA = V.light ? '#0067a3' : 'rgba(76,201,240,0.7)', cR = V.light ? '#c0262d' : 'rgba(255,90,95,0.8)';
    if (V.meth === 'fp') { const W = this.ieegFPWins(); if (W && !W.err) { vl(W.base[0], cA, [2, 4], 'référence'); vl(W.base[1], cA, [2, 4], ''); vl(W.win[0], cR, [6, 4], 'empreinte'); vl(W.win[1], cR, [6, 4], ''); } return; }
    const mk = V.rec.marks || {}, P = this.ieegEMParams(); if (mk.onset == null) return; vl(mk.onset + P.b0, cA, [2, 4], 'réf. EM'); vl(mk.onset + P.b1, cA, [2, 4], ''); vl(mk.onset + P.lat, cR, [6, 4], `EM L ${nf(P.lat, 1)} s`); vl(mk.onset + P.lat + P.dur, cR, [6, 4], '');
  });
  g('ieegPaintLane', function (gx, d, o) {
    const V = this._iev; if (V.meth !== 'fp' || !V.fp || V.fp.montage !== V.montage || V.fp.on == null) return; const f = V.fpF && V.fpF.get(d.name); if (!f) return;
    const { X, x0, pw, yT, laneH } = o, sz = Math.max(4.5, Math.min(7, laneH * 0.4)), on = V.fp.on;
    for (const t of f.spkT || []) { const x = X(on + t); if (x >= x0 && x <= x0 + pw) { gx.save(); gx.translate(x, yT + laneH - sz * 0.85); gx.scale(1, -1); glyph(gx, 'tri', 0, 0, sz, FPC.spk); gx.restore(); } }
    if (f.fa) { const a = clamp(X(on + f.faT0), x0, x0 + pw), b = clamp(X(on + f.faT1), x0, x0 + pw); if (b > a) { gx.fillStyle = 'rgba(0,0,0,0.75)'; gx.fillRect(a - 1, yT + 1, b - a + 2, 5); gx.fillStyle = FPC.fa; gx.fillRect(a, yT + 2, b - a, 3); if (f.sup) { gx.fillStyle = FPC.sup; gx.fillRect(a, yT + 5, b - a, 2); } } }
  });
  g('ieegOvwWin', function (gx, Xf, H) {
    const V = this._iev; let a = null, b = null;
    if (V.meth === 'fp') { const W = this.ieegFPWins(); if (W && !W.err) { a = W.base[0]; b = W.win[1]; } }
    else { const mk = V.rec.marks || {}, P = this.ieegEMParams(); if (mk.onset != null) { a = mk.onset + P.b0; b = mk.onset + Math.max(P.lat + P.dur, 20); } }
    if (a != null) { gx.strokeStyle = 'rgba(255,90,95,0.85)'; gx.strokeRect(Xf(a) + 0.5, 1.5, Math.max(1, Xf(b) - Xf(a)), H - 3); }
  });
  g('ieegMenuMeth', function (items, t, d) { const V = this._iev; if (d) { const ex = (V.rec.ei && V.rec.ei.excluded || []).includes(d.name); items.push({ sep: true }, { label: ex ? `Réintégrer ${d.name} dans les calculs` : `Exclure ${d.name} des calculs (artefact)`, run: () => this.ieegExclude(d.name, !ex) }); } });
  // exclusions : EM recorrigé (nombre de tests), lignes à jour
  const af0 = A.ieegAfterExcl;
  A.ieegAfterExcl = function () { if (af0) af0.apply(this, arguments); const V = this._iev; if (V && V.em) { this.ieegEMDerive(); if (V.meth === 'em') this.ieegEMRender(true); } if (V && V.rec && V.rec.fp && V.rec.fp.last) this.ieegFPTime(); if (V && V.meth === 'fp') this.ieegFPRender(true); };
  // voie choisie (clic dans le tracé) : image temps-fréquence de cette voie
  const dr0 = A.ieegGotoT;
  A.ieegGotoT = function () { const r = dr0.apply(this, arguments); const V = this._iev; if (V && V.meth === 'fp') { const cv = V.sb && V.sb.querySelector('.ie-tfplot'); if (cv) this.ieegFPPlot(cv); } return r; };
})(window.SV);
