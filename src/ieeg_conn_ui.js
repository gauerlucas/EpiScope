/* EpiScope — ieeg_conn_ui.js : connectivité h² des tracés SEEG (v4.16), onglet « h² » de la quantification.
 *   - tracé de crise : h² (Wendling 2001) de chaque voie sachant chaque autre, sur des fenêtres glissantes (3 s, pas 1 s) de
 *     10 s avant le début à 10 s après la fin de crise ; liens de chaque fenêtre (h² ≥ seuil, sens de plus fort h², direction
 *     par le signe du délai), degré sortant au fil du temps sous chaque voie, connectivité globale ; enregistré comme jeu
 *     d'Analyses (degré sortant moyen normalisé) portant le réseau : liens dirigés en 3D, fenêtre par fenêtre (curseur et
 *     lecture sous la vue) ou réseau de toute la crise (liens présents dans au moins 20 % des fenêtres) ;
 *   - tracé intercritique : force de chaque nœud (h² moyen de tous ses liens, les deux sens, toutes fenêtres — Courtens 2016,
 *     Lagarde 2018 ; fenêtres de 4 s au pas de 2 s, 3 min par défaut, délais en grille grossière puis affinée), liens les plus
 *     forts (sens dominant quand une voie précède l'autre dans ≥ 2/3 des fenêtres orientées, majoritaires) ; jeu « force h² » avec ses liens.
 *   rec.h2 = { params, last: { kind, rows, glob, t0, dt, nW, … } } ; détail (liens par fenêtre, courbes par voie) dans
 *   ieeg/<id>/h2_<montage>.json ; h² et délais complets gardés en mémoire (seuil modifiable sans recalcul).                */
(function (SV) {
  'use strict';
  const DR = SV.IeegDraw, IE = SV.IEEG, IM = SV.IEEGM, S = SV.Seeg, ST = SV.Store, L = SV.Library, A = SV.app;
  const { esc, nf, num, clamp, clock, fmtDur } = DR;
  const BANDS = [['large', 'large bande 1–45 Hz'], ['delta', 'delta 0,5–3,4 Hz'], ['theta', 'thêta 3,4–7,4 Hz'], ['alpha', 'alpha 7,4–12,4 Hz'], ['beta', 'bêta 12,4–24 Hz'], ['gamma', 'gamma 24–45 Hz'], ['bg', 'bêta–gamma 12–45 Hz (comme le cEI)']];
  const bandFr = k => (BANDS.find(b => b[0] === k) || BANDS[0])[1];
  const LINK_LO = [60, 140, 255], LINK_HI = [255, 60, 200];
  const linkCol = t => LINK_LO.map((c, i) => Math.round(c + (LINK_HI[i] - c) * t));
  const download = (name, lines) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); };
  const nL = n => `${n} lien${n > 1 ? 's' : ''}`;
  const f3 = v => v == null || !isFinite(v) ? '' : String(Math.round(v * 1000) / 1000).replace('.', ',');

  const M = {
    ieegH2Ict() { return this.ieegKind(this._iev.rec) !== 'inter'; },
    ieegH2Params() {
      const V = this._iev, rec = V.rec, ict = this.ieegH2Ict(), kind = ict ? 'ictal' : 'inter'; rec.h2 = rec.h2 || {};
      if (rec.h2.params && rec.h2.params.kind && rec.h2.params.kind !== kind) rec.h2.params = null;   // tracé passé de crise à intercritique (ou l'inverse) : réglages par défaut du nouveau type
      const P = rec.h2.params || (rec.h2.params = {}); P.kind = kind;
      const D = ict ? { band: 'large', win: 3, step: 1, lag: 0.1, lagStep: 1, thr: 0.3, thrAuto: true, maxE: 80, adj: false } : { band: 'large', win: 4, step: 2, lag: 0.1, lagStep: 2, thr: 0.3, maxE: 60, adj: false };
      for (const [k, v] of Object.entries(D)) if (P[k] == null) P[k] = v;
      if (P.start == null || P.end == null || P.auto == null) this.ieegH2Fit(P);
      return P;
    },
    /** fenêtre : crise de 10 s avant le début à 10 s après la fin (sans fin : début + 60 s) ; intercritique : 3 premières minutes */
    ieegH2Fit(P) {
      const V = this._iev, mk = V.rec.marks || {}, dur = V.mem.duration; P.auto = true;
      if (this.ieegH2Ict()) { const on = mk.onset != null ? mk.onset : 0, end = mk.end != null && mk.end > on ? mk.end : on + 50; P.start = Math.max(0, on - 10); P.end = Math.min(dur, end + 10); }
      else { P.start = 0; P.end = Math.min(dur, 180); }
    },
    async ieegH2Compute() {
      const V = this._iev; if (!V || V.mbusy) return; const rec = V.rec, P = this.ieegH2Params(), ders = this.ieegMDers();
      if (ders.length < 3) { this.toast('Trop peu de voies pour une connectivité'); return; }
      const fs = V.mem.fs, band = IM.H2BANDS[P.band] || IM.H2BANDS.large, tfs = band[1] > 50 ? 256 : 128, pad = 1, a = Math.max(0, P.start - pad), b = Math.min(V.mem.duration, P.end + pad), tA = performance.now();
      V.mbusy = 'h2'; V.mcancel = false; V.mprog = 0; this.ieegH2Render();
      try {
        const prep = IM.ceiPrep(this.ieegSig(ders, a, b), fs, { band, fs: tfs }), f2 = prep.fs, sig = prep.sig, len = sig[0].length;
        const W = Math.round(P.win * f2), step = Math.max(1, Math.round(P.step * f2)), lag = Math.max(0, Math.round(P.lag * f2)), first = Math.max(lag, Math.round((P.start - a) * f2));
        const nWin = Math.min(Math.floor((Math.round((P.end - a) * f2) - first - W) / step) + 1, Math.floor((len - lag - W - first) / step) + 1);
        if (!(nWin >= 2)) throw new Error(`fenêtre trop courte (au moins ${nf(P.win + P.step, 1)} s)`);
        const N = sig.length, nj = Math.min(N, 4 * Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 2) - 1))), size = Math.ceil(N / nj), jobs = [];
        for (let i = 0; i < N; i += size) { const rows = []; for (let r = i; r < Math.min(N, i + size); r++) rows.push(r); jobs.push({ args: [sig, rows, { W, step, lag, first, nWin, bins: IM.CEI.bins, lagStep: P.lagStep }] }); }
        const parts = await this.ieegPar('IEEGM.h2Batch', jobs); if (this._iev !== V) return;
        const H = new Float32Array(N * N * nWin), Lg = new Int8Array(N * N * nWin); let off = 0; for (const p of parts) { H.set(p.H, off); Lg.set(p.L, off); off += p.H.length; }
        V.h2 = { montage: V.montage, names: ders.map(d => d.name), ders, H, L: Lg, N, nW: nWin, t0: a + (first + W / 2) / f2, dt: step / f2 };
        rec.h2.last = { at: ST.now(), kind: this.ieegH2Ict() ? 'ictal' : 'inter', montage: V.montage, ms: Math.round(performance.now() - tA), start: P.start, end: P.end, band: P.band, win: P.win, step: P.step, nW: nWin, t0: V.h2.t0, dt: V.h2.dt };
        this.ieegH2Derive(); await this.ieegH2SaveFile(); V.dirty = true; this.touch();
      } catch (e) { if (!V.mcancel) { console.warn(e); this.toast('Connectivité h² : ' + e.message, 7000); } }
      finally { V.mbusy = null; V.mcancel = false; if (this._iev === V) { this.ieegMethRender(); this.ieegChips(); this.ieegDraw(); } }
    },
    /** liens et degrés (crise) ou forces (intercritique) au seuil choisi, sur les voies retenues */
    ieegH2Derive() {
      const V = this._iev, C = V.h2, rec = V.rec, P = this.ieegH2Params(), Lr = rec.h2.last; if (!C || !Lr) return;
      const ex = this.ieegExcl(), keep = C.names.map((n, i) => ex.has(n) ? -1 : i).filter(i => i >= 0), mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
      // dérivations bipolaires voisines (plot commun) : liées mécaniquement, sans délai — ignorées sauf demande
      let skip = null; if (!P.adj) { skip = new Uint8Array(C.N * C.N); C.ders.forEach((d, i) => C.ders.forEach((e, j) => { if (i !== j && d.b >= 0 && e.b >= 0 && (d.a === e.a || d.a === e.b || d.b === e.a || d.b === e.b)) skip[i * C.N + j] = 1; })); }
      // seuil de la crise : 99ᵉ centile du h² des fenêtres entièrement avant le début (au moins 0,3), sauf seuil réglé à la main
      const on = (rec.marks || {}).onset; Lr.thrPre = null;
      if (Lr.kind === 'ictal' && P.thrAuto !== false && on != null) {
        const nPre = Math.min(C.nW, Math.floor((on - C.t0 - Lr.win / 2) / C.dt) + 1), vals = [];
        if (nPre >= 3) { for (let w = 0; w < nPre; w++) for (let u = 0; u < keep.length; u++) for (let v = u + 1; v < keep.length; v++) { const i = keep[u], j = keep[v]; if (skip && skip[i * C.N + j]) continue; vals.push(Math.max(C.H[(i * C.N + j) * C.nW + w], C.H[(j * C.N + i) * C.nW + w])); }
          vals.sort((x, y) => x - y); Lr.thrPre = Math.round(vals[Math.floor(0.99 * (vals.length - 1))] * 1000) / 1000; P.thr = Math.max(0.3, Math.round(Lr.thrPre * 100) / 100); }
      }
      const F = IM.h2Frames(C.H, C.L, C.N, C.nW, P.thr, keep, P.maxE, skip); Lr.adj = !!P.adj;
      Lr.thr = P.thr; Lr.glob = Array.from(F.glob, v => Math.round(v * 1e4) / 1e4); Lr.nE = F.frames.map(f => f.length);
      if (Lr.kind === 'ictal') {
        Lr.rows = keep.map(i => Object.assign(this.ieegRowOf(C.ders[i]), { out: Math.round(mean(F.outW[i]) * 100) / 100, inn: Math.round(mean(F.inW[i]) * 100) / 100, str: Math.round(mean(F.strW[i]) * 1e4) / 1e4 }));
        V.h2F = { names: C.names, t0: C.t0, dt: C.dt, frames: F.frames.map(f => f.map(([i, j, h, d]) => [i, j, Math.round(h * 1000), d])), outW: F.outW, strW: F.strW };
      } else {
        const Sg = IM.h2Strength(C.H, C.L, C.N, C.nW, keep, skip), pairs = [];
        for (let u = 0; u < keep.length; u++) for (let v = u + 1; v < keep.length; v++) { const i = keep[u], j = keep[v]; if (skip && skip[i * C.N + j]) continue; pairs.push([i, j, Sg.pair[i * C.N + j], Sg.lead[i * C.N + j]]); }
        pairs.sort((p, q) => q[2] - p[2]);
        Lr.rows = keep.map(i => Object.assign(this.ieegRowOf(C.ders[i]), { str: Math.round(Sg.strength[i] * 1e4) / 1e4, outS: Math.round(Sg.outS[i] * 1e4) / 1e4, inS: Math.round(Sg.inS[i] * 1e4) / 1e4 }));
        Lr.pairs = pairs.slice(0, 200).map(([i, j, h, ld]) => [C.names[i], C.names[j], Math.round(h * 1e4) / 1e4, Math.round(ld * 100) / 100]);
        V.h2F = { names: C.names, t0: C.t0, dt: C.dt, strW: F.strW };
      }
      V.h2Heat = null;
    },
    async ieegH2SaveFile() {
      const V = this._iev, F = V.h2F, Lr = V.rec.h2.last; if (!F || !Lr) return; const path = `ieeg/${V.rec.id}/h2_${V.montage}.json`, R = a => a ? Array.from(a, v => Math.round(v * 1000) / 1000) : null;
      try { await L.writeFile(this.dossier, path, new Blob([JSON.stringify({ v: 1, kind: Lr.kind, names: F.names, t0: F.t0, dt: F.dt, frames: F.frames || null, outW: F.outW ? F.outW.map(R) : null, strW: F.strW.map(R) })], { type: 'application/json' })); Lr.path = path; }
      catch (e) { console.warn('connectivité h²', e); }
    },
    async ieegH2Load() {
      const V = this._iev, Lr = V.rec.h2 && V.rec.h2.last; if (!Lr || !Lr.path || V.h2F || V._h2Loading) return; V._h2Loading = true;
      try { const b = await L.readFile(this.dossier, Lr.path), J = JSON.parse(await b.text()); if (this._iev !== V) return; V.h2F = { names: J.names, t0: J.t0, dt: J.dt, frames: J.frames, outW: J.outW ? J.outW.map(a => Float32Array.from(a)) : null, strW: J.strW.map(a => Float32Array.from(a)), montage: Lr.montage }; V.h2Heat = null; this.ieegDraw(); if (V.meth === 'h2') this.ieegH2Render(true); }
      catch (e) { console.warn('connectivité h²', e); } finally { V._h2Loading = false; }
    },
    /** fond : degré sortant (crise) ou force (intercritique) de chaque voie, fenêtre par fenêtre */
    ieegH2Heat() {
      const V = this._iev, F = V.h2F, Lr = V.rec.h2 && V.rec.h2.last; if (!F || !Lr || Lr.montage !== V.montage) return null; const k = V.show.cmap + '|' + Lr.at + '|' + Lr.thr + '|' + V.light;
      if (V.h2Heat && V.h2Heat.k === k) return V.h2Heat.hs;
      const src = Lr.kind === 'ictal' && F.outW ? F.outW : F.strW, idx = new Map(F.names.map((n, i) => [n, i])), all = []; src.forEach(a => { for (let i = 0; i < a.length; i += 2) all.push(a[i]); }); all.sort((x, y) => x - y);
      const lo = Lr.kind === 'ictal' ? 0 : all[Math.floor(all.length * 0.05)] || 0, hi = Math.max(lo + 1e-3, all[Math.floor(all.length * 0.995)] || 1);
      const hs = { t0: F.t0, dt: F.dt, len: src[0] ? src[0].length : 0, lut: this.ieegFadeLut ? this.ieegFadeLut() : this.ieegLut(), plainTrace: true, row: n => { const i = idx.get(n); return i == null || !src[i] ? null : { a: src[i], lo, hi }; } };
      V.h2Heat = { k, hs }; return hs;
    },
    /** clés des plots du schéma pour les voies du tracé (null : hors schéma) */
    ieegH2Keys(map, names) {
      const C = this._iev.h2, rows = names.map(n => (C ? C.ders : this._iev.D).find(d => d.name === n)).map(d => d ? this.ieegRowOf(d) : null);
      return rows.map(r => { if (!r) return null; const en = map[r.elec], e = en && S.findElec(this.elecs || [], en); return e && r.k1 != null ? (r.k2 != null ? S.pairLabel(e.name, r.k1, r.k2) : S.pairLabel(e.name, r.k1)) : null; });
    },
    ieegH2SaveSet() {
      const V = this._iev, rec = V.rec, Lr = rec.h2.last, P = this.ieegH2Params(), F = V.h2F; if (!Lr || !Lr.rows) return;
      const ict = Lr.kind === 'ictal', mx = Math.max(1e-9, ...Lr.rows.map(r => ict ? r.out : r.str)), src = `Connectivité h² (Wendling 2001) · ${bandFr(Lr.band)} · fenêtres ${nf(Lr.win, 1)} s, pas ${nf(Lr.step, 1)} s · ${clock(Lr.start)}–${clock(Lr.end)}${ict ? ` · seuil ${nf(Lr.thr, 2)}${Lr.thrPre != null && P.thrAuto !== false ? ' (préictal)' : ''}` : ''}${Lr.adj ? '' : ' · dérivations voisines ignorées'}`;
      const extra = map => {
        if (!F) return {}; const names = F.names, keys = this.ieegH2Keys(map, names), idx = names.map((n, i) => keys[i] ? i : -1), remap = new Map(), K = [];
        idx.forEach(i => { if (i >= 0) { remap.set(i, K.length); K.push(keys[i]); } });
        if (ict) {
          const frames = (F.frames || []).map(f => f.filter(([i, j]) => remap.has(i) && remap.has(j)).map(([i, j, h, d]) => [remap.get(i), remap.get(j), h, d])), cnt = new Map();
          for (const f of frames) for (const [i, j, h, d] of f) { const kk = i < j ? i + ':' + j : j + ':' + i, o = cnt.get(kk) || { a: Math.min(i, j), b: Math.max(i, j), n: 0, h: 0, ab: 0, ba: 0 }; o.n++; o.h += h; if (d) { if (i < j) o.ab++; else o.ba++; } cnt.set(kk, o); }
          const agg = [...cnt.values()].filter(o => o.n >= 0.2 * frames.length).sort((p, q) => q.n - p.n).slice(0, P.maxE).map(o => o.ab >= 2 * o.ba && o.ab ? [o.a, o.b, Math.round(o.h / o.n), 1] : o.ba >= 2 * o.ab && o.ba ? [o.b, o.a, Math.round(o.h / o.n), 1] : [o.a, o.b, Math.round(o.h / o.n), 0]);
          return { net: { kind: 'ictal', keys: K, thr: Lr.thr, t0: F.t0, dt: F.dt, frames, agg, onset: (rec.marks || {}).onset, end: (rec.marks || {}).end } };
        }
        const byName = new Map(names.map((n, i) => [n, i])), edges = (Lr.pairs || []).map(([a, b, h, ld]) => [byName.get(a), byName.get(b), h, ld]).filter(([i, j]) => remap.has(i) && remap.has(j)).slice(0, P.maxE)
          .map(([i, j, h, ld]) => ld >= 0.66 ? [remap.get(i), remap.get(j), Math.round(h * 1000), 1] : ld <= 0.34 ? [remap.get(j), remap.get(i), Math.round(h * 1000), 1] : [remap.get(i), remap.get(j), Math.round(h * 1000), 0]);
        const hs = edges.map(e => e[2]); return { net: { kind: 'inter', keys: K, thr: hs.length ? Math.min(...hs) / 1000 : 0, edges } };
      };
      this.ieegSaveSet(ict ? 'h2-ictal' : 'h2-inter', Lr.rows, r => ict ? r.out / mx : r.str, { name: (ict ? 'h² crise · ' : 'Force h² · ') + rec.title, unit: ict ? '' : 'h²', min: 0, max: ict ? 1 : Math.ceil(mx * 100) / 100, rescale: !ict, cmap: ict ? 'inferno' : 'viridis', source: src + (ict ? ` · degré sortant moyen (seuil h² ${nf(Lr.thr)}), normalisé` : ' · force des nœuds (h² moyen)'), what: 'h²', extra });
    },
    ieegH2CSV() {
      const V = this._iev, rec = V.rec, Lr = rec.h2.last; if (!Lr || !Lr.rows) return; const map = this.ieegElecMap(), ict = Lr.kind === 'ictal';
      const lines = [`# EpiScope — connectivité h² (${ict ? 'au fil de la crise' : 'intercritique'}) — ${rec.title}`, `# montage ${Lr.montage}; ${bandFr(Lr.band)}; fenêtres ${Lr.win} s pas ${Lr.step} s; ${f3(Lr.start)}–${f3(Lr.end)} s; ${Lr.nW} fenêtres${ict ? '; seuil h2 ' + f3(Lr.thr) : ''}`,
        ict ? 'voie;électrode du schéma;degré sortant moyen;degré entrant moyen;h2 moyen' : 'voie;électrode du schéma;force (h2 moyen);force sortante;force entrante',
        ...Lr.rows.slice().sort((a, b) => ict ? b.out - a.out : b.str - a.str).map(r => (ict ? [r.name, map[r.elec] || '', f3(r.out), f3(r.inn), f3(r.str)] : [r.name, map[r.elec] || '', f3(r.str), f3(r.outS), f3(r.inS)]).join(';'))];
      if (!ict && Lr.pairs) lines.push('', 'voie A;voie B;h2 moyen;part des fenêtres où A précède B', ...Lr.pairs.map(p => [p[0], p[1], f3(p[2]), f3(p[3])].join(';')));
      download(`h2_${rec.title.replace(/[^\w\-]+/g, '_').slice(0, 60)}.csv`, lines);
    },
    /** connectivité globale (h² moyen des paires) au fil des fenêtres, nombre de liens ; début et fin de crise ; clic : instant */
    ieegH2Plot(cv) {
      const V = this._iev, Lr = V.rec.h2.last; if (!cv || !Lr || !Lr.glob) return; const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr;
      const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H); const n = Lr.glob.length, X = i => 4 + (W - 8) * (n > 1 ? i / (n - 1) : 0.5), tOf = i => Lr.t0 + i * Lr.dt, Xt = t => X((t - Lr.t0) / Lr.dt);
      const gmx = Math.max(1e-3, ...Lr.glob), emx = Math.max(1, ...(Lr.nE || [1])), mk = V.rec.marks || {};
      if (mk.onset != null) { g.fillStyle = 'rgba(255,90,95,0.10)'; const a = Xt(mk.onset), b = mk.end != null ? Xt(mk.end) : W; g.fillRect(a, 0, Math.max(1, b - a), H); }
      if (Lr.nE) { g.fillStyle = V.light ? 'rgba(176,0,143,0.35)' : 'rgba(255,60,200,0.35)'; Lr.nE.forEach((e, i) => { const hh = e / emx * (H - 14); g.fillRect(X(i) - 1, H - 2 - hh, 2, hh); }); }
      g.strokeStyle = V.light ? '#0067a3' : '#4cc9f0'; g.lineWidth = 1.6; g.beginPath(); Lr.glob.forEach((v, i) => { const y = H - 2 - v / gmx * (H - 14); if (i) g.lineTo(X(i), y); else g.moveTo(X(i), y); }); g.stroke();
      g.font = '10.5px system-ui, sans-serif'; g.fillStyle = V.light ? '#556171' : '#8f99a8'; g.fillText(`h² moyen (max ${nf(gmx, 2)})${Lr.nE ? ` · liens ≥ ${nf(Lr.thr)} (max ${emx})` : ''}`, 6, 10);
      if (V.cursor != null && V.cursor >= Lr.t0 && V.cursor <= tOf(n - 1)) { g.strokeStyle = V.light ? '#111' : '#fff'; g.lineWidth = 1; g.beginPath(); g.moveTo(Xt(V.cursor), 12); g.lineTo(Xt(V.cursor), H); g.stroke(); }
      cv.onclick = e => { const r = cv.getBoundingClientRect(), i = clamp(Math.round((e.clientX - r.left - 4) / (W - 8) * (n - 1)), 0, n - 1), t = tOf(i); V.cursor = t; V.t = clamp(t - V.page / 2, 0, Math.max(0, V.mem.duration - V.page)); this.ieegDraw(); this.ieegH2Plot(cv); const q = this.ieegH2Set(); if (q && q.net && q.net.frames) this.quantNetSet(q, i); };
    },
    ieegH2Set() { const V = this._iev, id = V.rec.quantIds && V.rec.quantIds[this.ieegH2Ict() ? 'h2-ictal' : 'h2-inter']; return id && ((this.state && this.state.quant) || []).find(q => q.id === id) || null; },
    ieegH2Render(onlyRes) {
      const V = this._iev, side = V.sb, rec = V.rec, P = this.ieegH2Params(), Lr = rec.h2.last, ict = this.ieegH2Ict(), mk = rec.marks || {}, sel = V.sel >= 0 && V.D[V.sel] ? V.D[V.sel].name : null, ex = this.ieegExcl();
      if (Lr && !V.h2F) this.ieegH2Load();
      const resHtml = () => {
        if (!Lr || !Lr.rows) return ''; const rows = Lr.rows.filter(r => !ex.has(r.name)).sort((a, b) => ict ? b.out - a.out || b.str - a.str : b.str - a.str), mx = Math.max(1e-9, ...rows.map(r => ict ? r.out : r.str));
        const stale = Lr.montage !== V.montage ? ` · <span class="warn">calculé en ${Lr.montage === 'bipolar' ? 'bipolaire' : 'monopolaire'}</span>` : Math.abs(Lr.start - P.start) > 1e-6 || Math.abs(Lr.end - P.end) > 1e-6 || Lr.band !== P.band ? ' · <span class="warn">réglages modifiés : recalculer</span>' : '';
        return `<div class="ie-n0">${rows.length} voies · ${Lr.nW} fenêtres de ${nf(Lr.win, 1)} s · ${esc(bandFr(Lr.band))}${stale}</div>
          ${Lr.glob ? '<canvas class="ie-h2plot" title="Connectivité globale au fil des fenêtres (clic : aller à cet instant, et fenêtre affichée en 3D)"></canvas>' : ''}
          <div class="ie-tabwrap"><table class="ie-tab" style="--thr:101%"><tr><th>voie</th>${ict ? '<th title="Degré sortant moyen : liens h² ≥ seuil dont la voie précède l’autre">sortant</th><th title="Degré entrant moyen">entrant</th><th title="h² moyen des liens de la voie">h² moyen</th>' : '<th title="Force : h² moyen de tous les liens de la voie (les deux sens, toutes fenêtres)">force</th><th title="Force sortante : la voie explique les autres">sortante</th><th title="Force entrante">entrante</th>'}</tr>
          ${rows.map(r => `<tr data-n="${esc(r.name)}" class="${r.name === sel ? 'sel' : ''}"><td class="nm mono">${esc(r.name)}</td>${ict ? `<td><i class="ie-bar"><b style="width:${Math.round(r.out / mx * 100)}%"></b></i>${nf(r.out, 1)}</td><td>${nf(r.inn, 1)}</td><td>${nf(r.str, 2)}</td>` : `<td><i class="ie-bar"><b style="width:${Math.round(r.str / mx * 100)}%"></b></i>${nf(r.str, 3)}</td><td>${nf(r.outS, 3)}</td><td>${nf(r.inS, 3)}</td>`}</tr>`).join('')}</table></div>
          ${!ict && Lr.pairs ? `<details class="ie-sec"><summary>Liens les plus forts</summary><table class="ie-tab"><tr><th>paire</th><th>h² moyen</th><th title="sens dominant : part des fenêtres où la première voie précède la seconde">sens</th></tr>${Lr.pairs.filter(p => !ex.has(p[0]) && !ex.has(p[1])).slice(0, 15).map(p => `<tr><td class="mono">${esc(p[0])} ${p[3] >= 0.66 ? '→' : p[3] <= 0.34 ? '←' : '↔'} ${esc(p[1])}</td><td>${nf(p[2], 3)}</td><td class="muted">${Math.round(p[3] * 100)} %</td></tr>`).join('')}</table></details>` : ''}`;
      };
      const bindRes = box => { box.querySelectorAll('tr[data-n]').forEach(tr => tr.onclick = () => this.ieegGotoT(tr.dataset.n, null)); this.ieegH2Plot(box.querySelector('.ie-h2plot')); };
      if (onlyRes && side.querySelector('.ie-res')) { const box = side.querySelector('.ie-res'), w = box.querySelector('.ie-tabwrap'), sc = w ? w.scrollTop : 0; box.innerHTML = resHtml(); bindRes(box); const w2 = box.querySelector('.ie-tabwrap'); if (w2) w2.scrollTop = sc; return; }
      const METHOD = ict ? 'h² (régression non linéaire, Wendling 2001) de chaque voie sachant chaque autre sur des fenêtres glissantes, délai ≤ 0,1 s ; pour chaque paire, sens de plus fort h², direction donnée par le signe du délai ; liens h² ≥ seuil (dérivations voisines qui partagent un plot ignorées), fenêtre par fenêtre : degré sortant de chaque voie au fil de la crise (fond sous le tracé), réseau dirigé en 3D fenêtre par fenêtre ou sur toute la crise (liens présents dans ≥ 20 % des fenêtres).'
        : 'Connectivité intercritique (Courtens 2016, Lagarde 2018) : h² entre toutes les paires de voies, fenêtres de 4 s au pas de 2 s, délai ≤ 0,1 s ; force d’une voie = h² moyen de tous ses liens (les deux sens, toutes fenêtres ; dérivations voisines qui partagent un plot ignorées) ; liens les plus forts, sens dominant quand une voie précède l’autre dans au moins 2/3 des fenêtres où le délai n’est pas nul (lien sans délai, comme entre deux dérivations voisines : non orienté).';
      const warn = ict && mk.onset == null ? 'Début de crise non annoté : la fenêtre part du début du tracé. Marquer le début et la fin de crise (clic droit).' : V.montage !== 'bipolar' ? 'La connectivité se calcule en montage bipolaire (référence commune : liens artificiels). <a data-mont="bipolar">Passer en bipolaire</a>' : !ict && P.end - P.start < 60 ? 'Fenêtre de moins d’une minute : forces peu stables.' : '';
      const busy = V.mbusy === 'h2', nD = this.ieegMDers().length, est = Math.round(nD * nD * Math.max(1, (P.end - P.start - P.win) / P.step) * (2 * Math.round(P.lag * 128) / Math.max(1, P.lagStep) + 1) * P.win * 128 / 2e8 / Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 2) - 1)));
      side.innerHTML = this.ieegMHead(ict ? 'Connectivité h² au fil de la crise' : 'Connectivité h² intercritique', ict ? 'Wendling 2001 ; Bartolomei 2001' : 'Courtens 2016 ; Lagarde, Brain 2018', METHOD,
        `<span><i class="ie-lgbar" style="background:${S.cmapCss(V.show.cmap)}"></i> ${ict ? 'degré sortant' : 'force'} de la voie (fond)</span><span><svg width="22" height="12"><path d="M2 9C7 2 13 2 18 6" stroke="rgb(${linkCol(0.2)})" stroke-width="2" fill="none"/><path d="M17 3l3 4-4 1z" fill="rgb(${linkCol(0.2)})"/></svg> lien dirigé en 3D (épaisseur et couleur ∝ h²)</span>`, warn)
        + `<div class="ie-sec"><div class="ie-sh">Fenêtre d’analyse <span class="muted">(${P.auto ? (ict ? 'crise annotée ± 10 s' : '3 premières minutes') : 'réglée à la main'} · ${fmtDur(P.end - P.start)})</span></div>
            <div class="ctrl-row"><label>début <input type="number" step="1" class="c2-start" value="${+P.start.toFixed(2)}"> s</label><label>fin <input type="number" step="1" class="c2-end" value="${+P.end.toFixed(2)}"> s</label><button class="c2-fit">↺ ${ict ? 'crise annotée' : 'automatique'}</button></div>
            <div class="ctrl-row"><label>bande <select class="c2-band">${BANDS.map(([k, l]) => `<option value="${k}"${P.band === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label></div>
            ${ict ? `<label class="ie-sl" title="Seuil de h² des liens (réglable sans recalcul tant que la visionneuse est ouverte). Par défaut : 99ᵉ centile du h² des fenêtres avant le début de crise (au moins 0,3), pour ne garder que les liens plus forts que le fond.">seuil h² <input type="range" class="c2-thr" min="0.1" max="0.8" step="0.01" value="${P.thr}"${Lr && !V.h2 ? ' disabled title="recalculer pour changer le seuil"' : ''}><output>${nf(P.thr)}</output></label>
            <div class="ctrl-row"><span class="muted">${P.thrAuto !== false ? (Lr && Lr.thrPre != null ? `seuil d’après le préictal (99ᵉ centile ${nf(Lr.thrPre, 2)}${Lr.thrPre < 0.3 ? ', porté à 0,3' : ''})` : mk.onset != null ? 'seuil d’après le préictal (99ᵉ centile, au calcul)' : 'seuil 0,3 (début de crise non annoté)') : 'seuil réglé à la main'}</span>${P.thrAuto === false ? '<button class="c2-thra">↺ d’après le préictal</button>' : ''}</div>` : ''}</div>
          <details class="ie-sec"><summary>Réglages de h²</summary>
            <div class="ctrl-row"><label>fenêtre <input type="number" step="0.5" min="1" class="c2-win" value="${P.win}"> s</label><label>pas <input type="number" step="0.5" min="0.25" class="c2-step" value="${P.step}"> s</label><label>délai max <input type="number" step="0.02" min="0" class="c2-lag" value="${P.lag}"> s</label></div>
            <div class="ctrl-row"><label title="Délais testés : tous (1) ou grille grossière puis voisins du meilleur (2, plus rapide)">pas des délais <select class="c2-ls">${[1, 2, 3].map(v => `<option${+P.lagStep === v ? ' selected' : ''}>${v}</option>`).join('')}</select></label><label title="Liens gardés par fenêtre (les plus forts) pour la 3D">liens affichés ≤ <input type="number" step="10" min="10" class="c2-maxe" value="${P.maxE}"></label></div>
            <label class="chk" title="Deux dérivations bipolaires voisines (A1-A2, A2-A3) partagent un plot : leur lien, mécanique et sans délai, masque les autres. Ignoré par défaut (réglable sans recalcul).">${'<input type="checkbox" class="c2-adj"' + (P.adj ? ' checked' : '') + '>'} liens entre dérivations voisines (plot commun)</label>
            <div class="hint">Signaux filtrés aller-retour puis ramenés vers 128 Hz (256 Hz au-delà de 50 Hz) ; régression par morceaux sur 10 classes ; calcul dans des workers${nD ? ` (≈ ${est < 2 ? 'quelques' : est} s pour ${nD} voies)` : ''}.</div></details>
          ${busy ? this.ieegBusyHtml(`Connectivité h² (${nD} voies)`) : `<div class="ie-status">${Lr ? `<span>${Lr.nW} fenêtres · calculé le ${new Date(Lr.at).toLocaleString(SV.LOC, { dateStyle: 'short', timeStyle: 'short' })}${Lr.ms ? ` (${nf(Lr.ms / 1000, 1)} s)` : ''}</span>` : '<span>Non calculé</span>'}<button class="c2-run${Lr ? '' : ' primary'}">${Lr ? '↻ Recalculer' : 'Calculer la connectivité'}</button></div>`}
          <div class="ie-res"></div>
          <div class="btnrow"><button class="primary c2-save"${Lr && Lr.rows ? '' : ' disabled'}>${this.ieegSetBtn(ict ? 'h2-ictal' : 'h2-inter', 'Enregistrer dans Analyses (3D, réseau)')}</button><button class="c2-csv"${Lr && Lr.rows ? '' : ' disabled'}>CSV</button></div>${this.ieegMapNote()}`;
      const q = s => side.querySelector(s), box = q('.ie-res'); box.innerHTML = resHtml(); bindRes(box); this.ieegBindCommon(side);
      const mo = side.querySelector('[data-mont]'); if (mo) mo.onclick = () => { V.montage = 'bipolar'; V.rec.view = Object.assign(V.rec.view || {}, { montage: 'bipolar' }); this.ieegSetMontage(); };
      const re = () => { this.ieegH2Render(); this.ieegDraw(); };
      this.ieegNumIn(side, '.c2-start', P, 'start', 0, re); this.ieegNumIn(side, '.c2-end', P, 'end', 0, re);
      for (const [c, k, m] of [['.c2-win', 'win', 1], ['.c2-step', 'step', 0.25], ['.c2-lag', 'lag', 0], ['.c2-maxe', 'maxE', 10]]) this.ieegNumIn(side, c, P, k, m, re);
      q('.c2-fit').onclick = () => { this.ieegH2Fit(P); re(); };
      q('.c2-band').onchange = e => { P.band = e.target.value; V.dirty = true; re(); };
      q('.c2-ls').onchange = e => { P.lagStep = +e.target.value; V.dirty = true; };
      q('.c2-adj').onchange = e => { P.adj = e.target.checked; V.dirty = true; if (V.h2) { this.ieegH2Derive(); this.ieegH2Render(); this.ieegDraw(); } };
      const th = q('.c2-thr'); if (th) th.oninput = () => { P.thr = +th.value; P.thrAuto = false; th.nextElementSibling.textContent = nf(P.thr); const ta = q('.c2-thra'); if (ta) ta.disabled = false; if (V.h2) { this.ieegH2Derive(); this.ieegH2Render(true); this.ieegDraw(); } };
      if (th) th.onchange = () => re();
      const ta = q('.c2-thra'); if (ta) ta.onclick = () => { P.thrAuto = true; V.dirty = true; if (V.h2) this.ieegH2Derive(); re(); };
      const run = q('.c2-run'); if (run) run.onclick = () => this.ieegH2Compute();
      q('.c2-save').onclick = () => this.ieegH2SaveSet(); q('.c2-csv').onclick = () => this.ieegH2CSV();
    },
    /** fond, barre à gauche des voies et ombrage de la fenêtre pour l'onglet h² */

    // ================================================================ réseau en 3D (jeux portant q.net)
    /** liens des jeux-réseaux affichés dans une vue : fenêtre choisie (crise), réseau de toute la crise, ou liens intercritiques */
    /** position affichée d'un réseau de crise : −1 = toute la crise (réseau aplati sur le temps), sinon fenêtre fractionnaire u */
    quantNetPos(q) { const v = this.ui.netFrame && this.ui.netFrame[q.id]; return v == null ? -1 : v; },
    /** réseau de toute la crise : liens qui reviennent au fil des fenêtres, additionnés (épaisseur ∝ nombre de fenêtres) */
    quantNetFlat(N) {
      this._netFlat = this._netFlat || new WeakMap(); let F = this._netFlat.get(N);
      if (!F) { F = N.frames && N.frames.length ? IM.netFlatten(N.frames, { maxE: 80 }) : (N.agg || []).map(e => [e[0], e[1], e[2], e[3], 1]); this._netFlat.set(N, F); }
      return F;
    },
    quantNetLinks() {
      const out = []; if (!this.viewer || !this.state) return out; const shown = new Set(this.viewer.cells.map(c => c.cfg.quant).filter(Boolean));
      for (const q of this.state.quant || []) {
        if (!q.net || !shown.has(q.id)) continue; const N = q.net, u = this._netShot ? -1 : this.quantNetPos(q);
        const pos = k => { const p = S.parseLabel(N.keys[k] || ''), e = p && this.elecByName(p.elec); return e ? { eid: e.id, ks: [p.c1, p.c2].filter(x => x != null) } : null; };
        if (N.kind === 'ictal' && u < 0) {   // toute la crise : épaisseur selon la fréquence du lien, couleur selon son h² moyen
          const E = this.quantNetFlat(N), nMax = Math.max(1, ...E.map(e => e[4])), hs = E.map(e => e[2] / 1000), lo = Math.min(N.thr || 0, ...hs), hi = Math.max(lo + 1e-3, ...hs);
          for (const [a, b, h, dir, n] of E) { const A0 = pos(a), B0 = pos(b); if (!A0 || !B0) continue; out.push({ from: A0, to: B0, set: q.id, dir, w: 0.12 + 0.88 * n / nMax, color: linkCol(clamp((h / 1000 - lo) / (hi - lo), 0, 1)) }); }
          continue;
        }
        const E = N.kind === 'ictal' ? (N.frames ? IM.netInterp(N.frames, u) : []) : (N.edges || []).map(e => e.concat([1]));
        const hs = E.map(e => e[2] / 1000), lo = Math.min(N.thr || 0, ...hs), hi = Math.max(lo + 1e-3, ...hs);
        for (const [a, b, h, dir, al] of E) { const A0 = pos(a), B0 = pos(b); if (!A0 || !B0) continue; const t = clamp((h / 1000 - lo) / (hi - lo), 0, 1); out.push({ from: A0, to: B0, set: q.id, dir, w: (0.15 + 0.85 * t) * (0.45 + 0.55 * al), alpha: al, color: linkCol(t) }); }
      }
      return out;
    },
    quantNetRefresh() { if (this.viewer && this.viewer.setMarkerLinks) this.viewer.setMarkerLinks((this._ccepLinks || []).concat(this.quantNetLinks())); },
    /** fenêtre affichée (u fractionnaire, −1 : toute la crise) : légende, liens en 3D (au plus ~12 fois par seconde), barre du tracé */
    quantNetSet(q, u, o) {
      const N = q.net, nF = N && N.frames ? N.frames.length : 0; u = u < 0 || !nF ? -1 : clamp(u, 0, nF - 1);
      this.ui.netFrame = this.ui.netFrame || {}; this.ui.netFrame[q.id] = u;
      const lg = document.querySelector('#quantLegend .ql-net'); if (lg) { const rg = lg.querySelector('.ql-fr'), tl = lg.querySelector('.ql-t'); if (rg && !(o && o.fromSlider)) rg.value = String(u); if (tl) tl.textContent = this.quantNetLabel(q, u); }
      const now = performance.now(); clearTimeout(this._netRT);
      if (!(o && o.anim) || !this._netRAt || now - this._netRAt > 80) { this._netRAt = now; this.quantNetRefresh(); } else this._netRT = setTimeout(() => { this._netRAt = performance.now(); this.quantNetRefresh(); }, 90);
      if (this.traceOnNet) this.traceOnNet(q, u);
    },
    quantNetLabel(q, u) {
      const N = q.net, mk = N.onset; if (N.kind !== 'ictal') return '';
      if (u < 0) { const n = this.quantNetFlat(N).length; return `toute la crise · ${nL(n)} (épaisseur : fréquence)`; }
      const t = N.t0 + u * N.dt, f = Math.round(u), n = (N.frames[f] || []).length;
      return `${clock(t)}${mk != null ? ` (${t - mk >= 0 ? '+' : '−'}${nf(Math.abs(t - mk), 1)} s)` : ''} · ${nL(n)}`;
    },
    quantNetStop() { if (this._netAnim) { cancelAnimationFrame(this._netAnim.raf); this._netAnim = null; } const b = document.querySelector('#quantLegend .ql-play'); if (b) b.textContent = '▶'; },
    /** lecture continue : la fenêtre avance au rythme choisi (× temps réel), liens interpolés d'une fenêtre à la suivante */
    quantNetPlay(q) {
      if (this._netAnim) { this.quantNetStop(); return; }
      const N = q.net, nF = N.frames ? N.frames.length : 0; if (nF < 2) return; let u = this.quantNetPos(q); if (u < 0 || u >= nF - 1) u = 0;
      const b = document.querySelector('#quantLegend .ql-play'); if (b) b.textContent = '⏸';
      const A0 = this._netAnim = { q, last: performance.now(), raf: 0 };
      const step = now => {
        if (this._netAnim !== A0) return; if (!this.viewer.cells.some(c => c.cfg.quant === q.id)) { this.quantNetStop(); return; }
        const sp = +(this.ui.netSpeed || 2), dt = Math.min(1, (now - A0.last) / 1000); A0.last = now; u += dt * sp / (N.dt || 1);
        if (u >= nF - 1) u = 0; this.quantNetSet(q, u, { anim: true }); A0.raf = requestAnimationFrame(step);
      };
      A0.raf = requestAnimationFrame(step);
    },
    /** légende d'un jeu-réseau sous la vue : lecture, curseur (tout à gauche : toute la crise), vitesse */
    quantNetLegend(lg, q) {
      const N = q.net, nF = N.frames ? N.frames.length : 0, u = this.quantNetPos(q);
      const s = document.createElement('span'); s.className = 'ql-net';
      if (N.kind !== 'ictal') { s.textContent = `réseau h² : ${(N.edges || []).length > 1 ? (N.edges || []).length + ' liens les plus forts' : nL((N.edges || []).length)}`; lg.appendChild(s); return; }
      s.innerHTML = `réseau h² <button class="ql-play" title="Lecture : la fenêtre avance, les liens se font et se défont en fondu ; la barre du tracé suit">${this._netAnim && this._netAnim.q.id === q.id ? '⏸' : '▶'}</button><input type="range" class="ql-fr" min="-1" max="${Math.max(0, nF - 1)}" step="0.01" value="${u}" title="Fenêtre affichée (tout à gauche : toute la crise, liens additionnés)"><select class="ql-sp" title="Vitesse de lecture (× temps réel)">${[0.5, 1, 2, 4].map(v => `<option value="${v}"${+(this.ui.netSpeed || 2) === v ? ' selected' : ''}>×${String(v).replace('.', ',')}</option>`).join('')}</select><span class="ql-t">${this.quantNetLabel(q, u)}</span>`; lg.appendChild(s);
      const rg = s.querySelector('.ql-fr');
      rg.oninput = () => { if (this._netAnim) this.quantNetStop(); const v = +rg.value; this.quantNetSet(q, v < -0.5 ? -1 : Math.max(0, v), { fromSlider: true, anim: true }); };
      rg.onchange = () => this.quantNetRefresh();
      s.querySelector('.ql-play').onclick = () => this.quantNetPlay(q);
      s.querySelector('.ql-sp').onchange = e => { this.ui.netSpeed = +e.target.value; };
    },
  };
  Object.assign(A, M);

  // greffes : liens refaits avec les marqueurs ; légende de la vue ; liens du réseau de toute la crise dans les rapports
  const ql0 = A.updateQuantLegend;
  if (ql0) A.updateQuantLegend = function () {
    const r = ql0.apply(this, arguments);
    try { const lg = document.getElementById('quantLegend'), q = this.quantActive && this.quantActive(); if (lg && q && q.net && !lg.hidden && !lg.querySelector('.ql-net')) this.quantNetLegend(lg, q); } catch (e) { console.warn(e); }
    return r;
  };
  const sr0 = A.seegReport;
  if (sr0) A.seegReport = async function () { this._netShot = true; this.quantNetRefresh(); try { return await sr0.apply(this, arguments); } finally { this._netShot = false; this.quantNetRefresh(); } };
  // exclusions modifiées : liens et degrés recalculés sur les voies retenues
  const af0 = A.ieegAfterExcl;
  A.ieegAfterExcl = function () { if (af0) af0.apply(this, arguments); const V = this._iev; if (V && V.h2) { this.ieegH2Derive(); if (V.meth === 'h2') this.ieegH2Render(true); this.ieegDraw(); } };
  const mc0 = A.ieegMarksChanged;
  A.ieegMarksChanged = function () { const V = this._iev; if (V && V.rec.h2 && V.rec.h2.params && V.rec.h2.params.auto) this.ieegH2Fit(V.rec.h2.params); return mc0 ? mc0.apply(this, arguments) : undefined; };
})(window.SV);
