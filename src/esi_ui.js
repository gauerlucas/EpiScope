/* EpiScope — esi_ui.js (v5.3, v5.4) : imagerie de source électrique dans la visionneuse de tracés (calculs : esi.js).
 *   v5.8 — relecture des pointes : pointe courante d'un groupe (◀ ▶, [ ]), retrait (Suppr, clic droit), ajout au clic droit
 *   (◆, e.m), annulation (Ctrl+Z) ; ajouts parcourus seuls et listés (groupe modifiable), pointes retirées (e.x) rétablissables.
 *
 *   EEG de scalp (Phase 1 › Analyses EEG) — tracés EDF / BDF / BrainVision importés comme en SEEG, montages référence,
 *   moyenne, double banane, transverse ; deux onglets de quantification :
 *     « Pointes → source » : détection multivoies, groupes de même topographie, pointe moyennée, ESI à mi-montée (sLORETA
 *       et dipôle équivalent avec ellipsoïde de confiance), ACP de la pointe (part du 1er axe : générateur unique ou
 *       propagation) ;
 *     « Début de crise → source » : fenêtre au début de crise annoté, fréquence dominante, ESI du rythme filtré ± 1 Hz
 *       (moyenne de la fenêtre), dipôle du 1er axe, composantes indépendantes classées (puissance à la fréquence critique ×
 *       dipolarité).
 *   SEEG (Analyses) — onglet « Source » : même chaîne en milieu infini, sur les signaux en référence commune de tous les
 *     plots localisés (paires d'électrodes différentes comprises) : triangulation d'un générateur entre les électrodes ou
 *     hors de l'implantation, distance au plot le plus proche, carte de couverture de l'implantation.
 *   Modèle de tête du scalp (v5.4) : BEM à 3 couches (esi_bem.js) — scalp du T1 et enveloppe du cerveau segmenté du
 *     patient, ou tête du gabarit ; os selon l'âge ; positions 10-20 recalées puis posées sur le scalp, modifiables à la
 *     souris (exploration.scalpPos) ; repli : sphère à 3 couches ajustée ; sources = sommets du cortex affiché.
 *   Inverse (v5.4, Parra-Díaz 2026) : données blanchies par le bruit de fond (scalp), sLORETA, dipôle, LCMV, concordance.
 *   Résultats : ex.esi = [{ id, kind ('spike' | 'ictal'), modality ('scalp' | 'seeg'), recId, seizureId, title, at, space,
 *     chans, topo, pcs, noise, dataCov, meta, summary }] ; la carte et le dipôle sont recalculés pour l'anatomie affichée (gabarit / patient). */
(function (SV) {
  'use strict';
  const A = SV.app, E = SV.ESI, IE = SV.IEEG, ST = SV.Store, S = SV.Seeg, M4 = SV.Mat4, DR = SV.IeegDraw;
  const { esc, nf, clock, uid, glyph } = DR, $ = id => document.getElementById(id), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], len = v => Math.hypot(v[0], v[1], v[2]);
  const sc = V => !!(V && V.rec && V.rec.modality === 'scalp');   // tracé de scalp (nature fixée à l'import ou à l'ouverture)
  const r3 = v => Math.round(v * 1000) / 1000, sig4 = v => +(+v).toPrecision(4);
  /** covariance (m × m, ordre chans) restreinte et réordonnée selon names → Float64Array, ou null */
  const subCov = (C, chans, names) => { if (!C || !chans) return null; const M0 = chans.length, idx = names.map(n => chans.indexOf(n)), k = names.length; if (idx.some(i => i < 0) || C.length !== M0 * M0) return null; const out = new Float64Array(k * k); for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) out[i * k + j] = C[idx[i] * M0 + idx[j]]; return out; };
  const ESI_DMIN = 3;   // mm : distance minimale source – crâne interne pour le calcul BEM
  const COL = { sel: '#ffd60a', ev: 'rgba(255,214,10,0.55)', win: 'rgba(255,90,95,0.85)' };
  const ESI_PAL = ['#e8590c', '#1c7ed6', '#2f9e44', '#ae3ec9', '#f59f00'];   // résultats comparés : une teinte chacun
  const CI_MAX = 100, ciTxt = r => Math.max(...r) > CI_MAX ? 'IC95 non borné (> 10 cm)' : `IC95 ${r.map(x => nf(x, 0)).join('×')} mm`;   // ellipse de confiance plus grande que la tête : non dessinée
  const CL_PAL = ['#ffd60a', '#4cc9f0', '#ff6b9a', '#7bd389', '#ff9f43', '#b07cf2', '#5ee7d0', '#f2e86b'];   // groupes de pointes : une couleur chacun
  const rgba = (hex, a) => `rgba(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(',')},${a})`;
  const REF = {
    esp: 'Parra-Díaz et al., Epilepsia 2026 ; Birot et al., NeuroImage Clin 2014',
    esz: 'Nemtsas et al., Epilepsia 2017 ; de Borman et al., J Neural Eng 2022',
    src: 'Caune et al., NeuroImage 2014 ; Kalina et al., Brain Topogr 2023 ; López-Madrona et al., NeuroImage 2023',
  };

  // ================================================================ dessins (topographie, pointe moyennée)
  /** azimutale équidistante des positions 10-20 (tête MNI) → [x, y] dans [-1, 1] (nez en haut) */
  const STD_C = (() => { const P = Object.entries(E.STD).filter(([k]) => !/^(LPA|RPA|Nz|A1|A2|M1|M2|Iz)$/.test(k)).map(([, p]) => p).filter(p => p[2] > -20); return E.fitSphere(P).c; })();
  function proj2d(name) { const p = E.STD[name]; if (!p) return null; const u = sub(p, STD_C), r = len(u), th = Math.acos(clamp(u[2] / r, -1, 1)), ph = Math.atan2(u[1], u[0]), k = th / (Math.PI / 2) * 0.86; return [k * Math.cos(ph), -k * Math.sin(ph)].map((x, i) => i ? x : x); }
  const DIV = t => { t = clamp(t, -1, 1); const a = Math.abs(t), w = [250, 250, 248], c = t < 0 ? [33, 102, 172] : [178, 24, 43]; return w.map((x, i) => Math.round(x + (c[i] - x) * Math.pow(a, 0.85))); };
  /** topographie (valeurs en référence moyenne sur des électrodes 10-20) → data URL PNG */
  function topoPng(names, vals, o) {
    o = o || {}; const W = o.size || 132, cv = document.createElement('canvas'); cv.width = cv.height = W; const g = cv.getContext('2d'), pts = [];
    names.forEach((n, i) => { const q = proj2d(n); if (q && isFinite(vals[i])) pts.push([q[0], q[1], vals[i], n]); });
    if (pts.length < 3) return cv.toDataURL(); const mx = Math.max(1e-12, ...pts.map(p => Math.abs(p[2]))), R = W / 2 - 8, cx = W / 2, cy = W / 2 + 2, img = g.createImageData(W, W);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const u = (x - cx) / R, v = (y - cy) / R; if (u * u + v * v > 1) continue; let sw = 0, sv = 0, hit = null; for (const p of pts) { const d2 = (p[0] - u) ** 2 + (p[1] - v) ** 2; if (d2 < 1e-6) { hit = p[2]; break; } const w = 1 / (d2 * d2); sw += w; sv += w * p[2]; } const c = DIV((hit != null ? hit : sv / sw) / mx), k = (y * W + x) * 4; img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = 255; }
    g.putImageData(img, 0, 0); g.strokeStyle = '#3a4350'; g.lineWidth = 1.2; g.beginPath(); g.arc(cx, cy, R, 0, 2 * Math.PI); g.stroke();
    g.beginPath(); g.moveTo(cx - 6, cy - R + 1); g.lineTo(cx, cy - R - 6); g.lineTo(cx + 6, cy - R + 1); g.stroke();
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * (R + 2), cy, 3, 9, 0, 0, 2 * Math.PI); g.stroke(); }
    const top = pts.slice().sort((a, b) => Math.abs(b[2]) - Math.abs(a[2])).slice(0, o.labels == null ? 3 : o.labels);
    for (const p of pts) { g.fillStyle = '#1b2230'; g.beginPath(); g.arc(cx + p[0] * R, cy + p[1] * R, 1.6, 0, 7); g.fill(); }
    g.font = '600 9px Arial, sans-serif'; g.textAlign = 'center'; for (const p of top) { g.fillStyle = 'rgba(255,255,255,.85)'; const tw = g.measureText(p[3]).width + 4; g.fillRect(cx + p[0] * R - tw / 2, cy + p[1] * R - 13, tw, 10); g.fillStyle = '#14233a'; g.fillText(p[3], cx + p[0] * R, cy + p[1] * R - 5); }
    return cv.toDataURL();
  }
  /** pointe moyennée « papillon » : voies en gris, GFP, mi-montée et pic → data URL */
  function wavePng(avg, fs, pre, T, light) {
    const W = 300, H = 112, cv = document.createElement('canvas'); cv.width = W * 2; cv.height = H * 2; const g = cv.getContext('2d'); g.scale(2, 2);
    g.fillStyle = light ? '#ffffff' : '#0b0f16'; g.fillRect(0, 0, W, H); const n = avg[0].length, X = k => 4 + (k / (n - 1)) * (W - 8);
    let mx = 1e-12; for (const a of avg) for (const v of a) mx = Math.max(mx, Math.abs(v)); const Y = v => H / 2 - v / mx * (H / 2 - 8);
    g.strokeStyle = light ? 'rgba(20,35,58,.22)' : 'rgba(220,230,245,.22)'; g.lineWidth = 0.8; for (const a of avg) { g.beginPath(); for (let k = 0; k < n; k++) { const y = Y(a[k]); if (k) g.lineTo(X(k), y); else g.moveTo(X(k), y); } g.stroke(); }
    const gf = T.gfp, gm = Math.max(1e-12, ...gf); g.strokeStyle = light ? '#19518e' : '#cdb98f'; g.lineWidth = 1.8; g.beginPath(); for (let k = 0; k < n; k++) { const y = H - 4 - gf[k] / gm * (H * 0.42); if (k) g.lineTo(X(k), y); else g.moveTo(X(k), y); } g.stroke();
    const vl = (k, col, dash, lab) => { g.strokeStyle = col; g.setLineDash(dash); g.lineWidth = 1.2; g.beginPath(); g.moveTo(X(k) + 0.5, 2); g.lineTo(X(k) + 0.5, H - 2); g.stroke(); g.setLineDash([]); g.fillStyle = col; g.font = '600 9px Arial'; g.fillText(lab, X(k) + 3, 11); };
    vl(pre, light ? 'rgba(20,35,58,.35)' : 'rgba(255,255,255,.3)', [2, 3], ''); vl(T.half, '#e5484d', [4, 3], '½'); vl(T.peak, light ? '#14233a' : '#ffffff', [], 'pic');
    g.fillStyle = light ? '#566276' : '#919fb2'; g.font = '9px Arial'; g.fillText(`${Math.round(-pre / fs * 1000)} ms`, 4, H - 4); g.textAlign = 'right'; g.fillText(`+${Math.round((n - 1 - pre) / fs * 1000)} ms`, W - 4, H - 4);
    return cv.toDataURL();
  }

  const LOBE = { frontal: 'frontal', temporal: 'temporal', parietal: 'pariétal', occipital: 'occipital', subcortical: 'sous-cortical', cingulate: 'cingulaire', insula: 'insula' };
  const lobeFr = l => { if (!l) return '—'; const [a, b] = l.split(' '); return (LOBE[a] || a) + (b ? ' ' + b : ''); };
  /** concordance lobaire des méthodes (Parra-Díaz 2026 : 84 % d'Engel I quand toutes concordent, 44 % quand deux seulement) */
  function concHtml(c, short) {
    if (!c || c.of < 2) return ''; const cls = c.n === c.of ? 'ok' : c.n >= 2 ? 'mid' : 'ko', tip = c.by.map(x => `${x.k} ${lobeFr(x.l)}`).join(' · ');
    return `<div class="esi-conc ${cls}" title="${esc(tip)} — concordance lobaire des méthodes : elle renforce la confiance (Parra-Díaz 2026)"><b>Concordance</b> : ${c.n}/${c.of} méthodes${c.n >= 2 ? ' — ' + esc(lobeFr(c.lobe)) : ' (lobes différents)'}${!short && c.n < c.of ? ` <span class="muted">(${esc(c.by.filter(x => x.l !== c.lobe).map(x => `${x.k} ${lobeFr(x.l)}`).join(', '))})</span>` : ''}</div>`;
  }

  const M = {
    // ================================================================ modèles de tête
    /** sources : sommets du cortex affiché étiquetés comme cortex (substance grise corticale : la paroi médiale non corticale —
     *  corps calleux, coupe du diencéphale — est exclue), ≤ max sinon un sur k, + structures temporales mésiales (SEEG) →
     *  { view (n × 3), lab (région par source), deep (index de structure ou −1), map: { lh, rh } (sommet → source, −1 hors cortex) } */
    esiSources(At, max, deep) {
      const H = ['lh', 'rh'].map(h => At.hemis[h]), ctx = r => r > 0 && !(At.regions && At.regions[r] && At.regions[r].type === 'none');
      const tot = H.reduce((s, h) => { let n = 0; for (let v = 0; v < h.n; v++) if (ctx(h.labels[v])) n++; return s + n; }, 0), k = Math.max(1, Math.ceil(tot / max)), V = [], lab = [], dp = [], idx = [new Int32Array(H[0].n).fill(-1), new Int32Array(H[1].n).fill(-1)];
      H.forEach((h, hi) => { let c = 0; for (let v = 0; v < h.n; v++) { if (!ctx(h.labels[v])) continue; if (c++ % k) continue; idx[hi][v] = lab.length; V.push(h.pial[3 * v], h.pial[3 * v + 1], h.pial[3 * v + 2]); lab.push(h.labels[v]); dp.push(-1); } });
      if (deep) for (const s of At.subcortical || []) { if (!/hippocampus|amygdala/i.test(s.name)) continue; const nv = s.vertices.length / 3, kk = Math.max(1, Math.ceil(nv / 220)); for (let v = 0; v < nv; v += kk) { V.push(s.vertices[3 * v], s.vertices[3 * v + 1], s.vertices[3 * v + 2]); lab.push(s.index); dp.push(s.index); } }
      const view = Float32Array.from(V), n = view.length / 3, map = {};
      // sommet cortical non retenu → source corticale la plus proche (grille de 8 mm)
      const cell = 8, key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`, G = new Map();
      if (k > 1) for (let j = 0; j < n; j++) { if (dp[j] >= 0) continue; const kk = key(view[3 * j], view[3 * j + 1], view[3 * j + 2]); (G.get(kk) || G.set(kk, []).get(kk)).push(j); }
      ['lh', 'rh'].forEach((h, hi) => { const Hh = H[hi], m = idx[hi];
        if (k > 1) for (let v = 0; v < Hh.n; v++) { if (m[v] >= 0 || !ctx(Hh.labels[v])) continue; const x = Hh.pial[3 * v], y = Hh.pial[3 * v + 1], z = Hh.pial[3 * v + 2]; let best = -1, bd = Infinity; const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
          for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) for (const j of G.get(`${cx + a},${cy + b},${cz + c}`) || []) { const d = (view[3 * j] - x) ** 2 + (view[3 * j + 1] - y) ** 2 + (view[3 * j + 2] - z) ** 2; if (d < bd) { bd = d; best = j; } }
          m[v] = best; }
        map[h] = m; });
      return { view, n, lab: Int32Array.from(lab), deep: Int32Array.from(dp), map };
    },
    /** sources à moins de dmax mm d'un des points P ; les sommets du cortex rattachés à une source écartée → −1 */
    esiNear(src, P, dmax) {
      const keep = [], idx = new Int32Array(src.n).fill(-1), d2 = dmax * dmax;
      for (let j = 0; j < src.n; j++) { const x = src.view[3 * j], y = src.view[3 * j + 1], z = src.view[3 * j + 2]; for (const p of P) if ((p[0] - x) ** 2 + (p[1] - y) ** 2 + (p[2] - z) ** 2 <= d2) { idx[j] = keep.length; keep.push(j); break; } }
      const view = new Float32Array(3 * keep.length); keep.forEach((j, k) => view.set(src.view.subarray(3 * j, 3 * j + 3), 3 * k));
      const map = {}; for (const h of Object.keys(src.map)) map[h] = Int32Array.from(src.map[h], j => j >= 0 ? idx[j] : -1);
      return { view, n: keep.length, lab: Int32Array.from(keep, j => src.lab[j]), deep: Int32Array.from(keep, j => src.deep[j]), map };
    },
    /** rayon externe du cortex vu du centre c, par direction (grille 10°, trous comblés, lissée) → u ↦ rayon (mm) */
    esiRadial(view, c) {
      const NT = 18, NP = 36, G = new Float64Array(NT * NP), idx = (t, p) => t * NP + ((p % NP) + NP) % NP;
      for (let j = 0; j < view.length; j += 3) { const u = [view[j] - c[0], view[j + 1] - c[1], view[j + 2] - c[2]], r = len(u); if (r < 1) continue; const t = Math.min(NT - 1, Math.floor(Math.acos(clamp(u[2] / r, -1, 1)) / Math.PI * NT)), p = Math.floor((Math.atan2(u[1], u[0]) + Math.PI) / (2 * Math.PI) * NP) % NP; if (r > G[idx(t, p)]) G[idx(t, p)] = r; }
      for (let pass = 0; pass < 20; pass++) { let holes = 0; const G2 = Float64Array.from(G); for (let t = 0; t < NT; t++) for (let p = 0; p < NP; p++) { if (G[idx(t, p)]) continue; holes++; let s = 0, n = 0; for (const [a, b] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const tt = t + a; if (tt < 0 || tt >= NT) continue; const v = G[idx(tt, p + b)]; if (v) { s += v; n++; } } if (n) G2[idx(t, p)] = s / n; } G.set(G2); if (!holes) break; }
      const Gs = new Float64Array(NT * NP); for (let t = 0; t < NT; t++) for (let p = 0; p < NP; p++) { let s = 0, n = 0; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const tt = t + a; if (tt < 0 || tt >= NT) continue; const v = G[idx(tt, p + b)]; if (v) { s += v; n++; } } Gs[idx(t, p)] = n ? s / n : 60; }
      return u => { const r = len(u) || 1, th = Math.acos(clamp(u[2] / r, -1, 1)) / Math.PI * NT - 0.5, ph = (Math.atan2(u[1], u[0]) + Math.PI) / (2 * Math.PI) * NP - 0.5, t0 = clamp(Math.floor(th), 0, NT - 1), t1 = clamp(t0 + 1, 0, NT - 1), p0 = Math.floor(ph), ft = clamp(th - t0, 0, 1), fp = ph - p0;
        return (1 - ft) * ((1 - fp) * Gs[idx(t0, p0)] + fp * Gs[idx(t0, p0 + 1)]) + ft * ((1 - fp) * Gs[idx(t1, p0)] + fp * Gs[idx(t1, p0 + 1)]); };
    },
    /** seuil tête / air d'un T1 : coins du volume (air) et percentile 99 */
    esiAirThr(vol) {
      const [nx, ny, nz] = vol.dims, D = vol.data, smp = []; for (let q = 0; q < 20000; q++) smp.push(D[Math.floor(Math.random() * D.length)]); smp.sort((a, b) => a - b); const p99 = smp[Math.floor(0.99 * smp.length)];
      const air = []; for (const [i, j, k] of [[0, 0, 0], [nx - 6, 0, 0], [0, ny - 6, 0], [0, 0, nz - 6], [nx - 6, ny - 6, 0], [nx - 6, 0, nz - 6], [0, ny - 6, nz - 6], [nx - 6, ny - 6, nz - 6]]) for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) for (let c = 0; c < 5; c++) air.push(D[(i + a) + nx * ((j + b) + ny * (k + c))]);
      const am = air.reduce((s, x) => s + x, 0) / air.length, as = Math.sqrt(air.reduce((s, x) => s + (x - am) ** 2, 0) / air.length); return Math.max(am + 5 * as, 0.08 * p99);
    },
    /** lecture d'un volume en un point de l'espace de la vue (M : vue → voxel) → test(valeur), null hors du volume */
    esiSampler(vol, M, test) { const [nx, ny, nz] = vol.dims, D = vol.data; return p => { const x = p[0], y = p[1], z = p[2], i = Math.round(M[0] * x + M[1] * y + M[2] * z + M[3]), j = Math.round(M[4] * x + M[5] * y + M[6] * z + M[7]), k = Math.round(M[8] * x + M[9] * y + M[10] * z + M[11]); return i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz ? null : test(D[i + nx * (j + ny * k)]); }; },
    /** électrodes de scalp sur le T1 du patient (modèle sphérique) : rayon depuis le centre de la tête, premier tissu rencontré */
    async esiProjectScalp(P) {
      const Ap = this.patientAnat, d = this.dossier, ref = d && ST.refImaging(d); if (!Ap || !ref) return { P, n: 0 };
      let vol; try { vol = await this.imagingVolume(ref); } catch (e) { return { P, n: 0 }; }
      const thr = this.esiAirThr(vol), at = this.esiSampler(vol, M4.mul(M4.inv(vol.affine), Ap.fromDisplay), v => v > thr), c = E.fitSphere(P).c; let n = 0;
      const out = P.map(w => { const u = sub(w, c), r = len(u), e = u.map(x => x / r); let hit = null, run = 0;
        for (let t = r * 1.45; t > r * 0.6; t -= 0.5) { const v = at([c[0] + e[0] * t, c[1] + e[1] * t, c[2] + e[2] * t]); if (v == null) { run = 0; continue; } if (v) { if (++run >= 3) { hit = t + 1; break; } } else run = 0; }
        if (hit == null) return w; n++; return [c[0] + e[0] * hit, c[1] + e[1] * hit, c[2] + e[2] * hit]; });
      return { P: out, n };
    },
    esiAtlasSpace() { const At = this.viewer && this.viewer.atlas; return At && At.patient ? 'patient' : 'template'; },

    // ================================================================ modèle de tête du scalp : BEM réaliste (défaut) ou sphère
    esiHeadCfg() { const s = this.dossier && this.dossier.settings && this.dossier.settings.esiHead; return { model: s && s.model === 'sphere' ? 'sphere' : 'bem', age: s && s.age != null && s.age !== '' && isFinite(+s.age) ? +s.age : null }; },
    /** âge retenu pour les conductivités et les épaisseurs : réglé, à l'IRM (anatomie du patient), à l'EEG, sinon adulte */
    esiAge(space) {
      const d = this.dossier, cfg = this.esiHeadCfg(); if (cfg.age != null) return { age: cfg.age, how: 'réglé' };
      const sg = d && d.anatomy && d.anatomy.segmentation; if (space === 'patient' && sg && sg.age != null) return { age: sg.age, how: 'à l’IRM' };
      const ex = this.ieegEx(), a = d ? ST.ageAt(d.patient, ex && ex.start) : null; return a != null ? { age: a, how: 'à l’EEG' } : { age: null, how: 'adulte, âge inconnu' };
    },
    /** plan sous le cervelet (le masque n'y est plus que bulbe et moelle : section < 4 % de la plus grande) et centre de la
     *  tête (centre du masque au-dessus), dans l'espace de la vue ; Mi : voxel → vue */
    esiCut(vol, Mi) {
      const [nx, ny, nz] = vol.dims, D = vol.data, Z0 = -160, W = 4, NB = 80, cnt = new Float64Array(NB), sx = new Float64Array(NB), sy = new Float64Array(NB), sz = new Float64Array(NB), st = Math.max(1, Math.round(2 / (Math.hypot(Mi[0], Mi[4], Mi[8]) || 1)));
      for (let k = 0; k < nz; k += st) for (let j = 0; j < ny; j += st) for (let i = 0; i < nx; i += st) { if (!(D[i + nx * (j + ny * k)] > 0)) continue; const z = Mi[8] * i + Mi[9] * j + Mi[10] * k + Mi[11], b = Math.floor((z - Z0) / W); if (b < 0 || b >= NB) continue; cnt[b]++; sx[b] += Mi[0] * i + Mi[1] * j + Mi[2] * k + Mi[3]; sy[b] += Mi[4] * i + Mi[5] * j + Mi[6] * k + Mi[7]; sz[b] += z; }
      let bm = 0; for (let b = 0; b < NB; b++) if (cnt[b] > cnt[bm]) bm = b; let cut = -1; for (let b = bm; b >= 0; b--) if (cnt[b] < 0.04 * cnt[bm]) { cut = b; break; }   // tranches de 4 mm
      let n = 0, c = [0, 0, 0]; for (let b = cut + 1; b < NB; b++) { n += cnt[b]; c[0] += sx[b]; c[1] += sy[b]; c[2] += sz[b]; } if (!n) throw new Error('masque du cerveau vide');
      return { z: Z0 + (cut + 1) * W, c: c.map(x => x / n) };
    },
    /** surfaces BEM de l'anatomie affichée — patient : scalp du T1 et masque de sa segmentation ; gabarit : électrodes standard
     *  (posées sur la tête MNI) et masque VEP — épaisseurs et conductivités selon l'âge ; en cache par anatomie et âge */
    async esiHeadGeom(space) {
      const At = this.viewer.atlas, ag = this.esiAge(space), P = SV.BEM.ageParams(ag.age), key = space + '|' + (ag.age == null ? 'adulte' : ag.age.toFixed(2)), C = this._esiGeom || (this._esiGeom = new Map());
      const hit = C.get(key); if (hit && hit.atlas === At) return hit;
      let mask, Mv, scalpAt = null, scalpPts = null;
      if (space === 'patient') {
        const Ap = this.patientAnat, ref = ST.refImaging(this.dossier); if (!Ap || !Ap.segVol || !ref) throw new Error('segmentation du T1 absente (recalculer l’anatomie du patient)');
        mask = Ap.segVol; Mv = M4.mul(M4.inv(mask.affine), Ap.fromDisplay);
        const vol = await this.imagingVolume(ref), thr = this.esiAirThr(vol); scalpAt = this.esiSampler(vol, M4.mul(M4.inv(vol.affine), Ap.fromDisplay), v => v > thr);
      } else { mask = this.tplVepVol(); if (!mask) throw new Error('atlas du gabarit absent'); Mv = M4.inv(mask.affine); scalpPts = Object.entries(E.STD).filter(([k]) => !/^(A1|A2|T3|T4|T5|T6)$/.test(k)).map(([, p]) => p); }
      const inB = this.esiSampler(mask, Mv, v => v > 0), cut = this.esiCut(mask, M4.inv(Mv));
      const H = SV.BEM.headSurfaces({ c: cut.c, zCut: cut.z, P, brainAt: p => inB(p) === true, scalpAt, scalpPts });
      const geom = Object.assign(H, { atlas: At, space, key, P, age: ag, c: cut.c, model: null }); C.set(key, geom); return geom;
    },
    /** électrodes posées sur le scalp du modèle : standard (gabarit), recalées (patient) ou déplacées à la main (enregistrées
     *  par exploration : monde du T1 pour le patient, gabarit sinon) → { P (vue), moved: [noms] } */
    esiElecPos(names, geom) {
      const Ap = this.patientAnat, ex = this.ieegEx(), ed = (ex && ex.scalpPos && ex.scalpPos[geom.space]) || {}, moved = [], pat = geom.space === 'patient';
      const P0 = names.map(n => { const e = ed[n]; if (e) { moved.push(n); return pat ? M4.apply(Ap.toDisplay, e[0], e[1], e[2]) : e.slice(); } const p = E.STD[n]; return pat ? M4.apply(Ap.dispFromTemplate, p[0], p[1], p[2]) : p.slice(); });
      return { P: SV.BEM.onSurface(geom.surfs[0], geom.c, P0), moved };
    },
    /** source trop proche du crâne interne ramenée à dmin vers le centre (précision de la collocation linéaire) */
    esiKeepIn(geom, p, dmin) { const u = sub(p, geom.c), r = len(u) || 1, t = SV.BEM.rayHit(geom.surfs[2], geom.c, [u[0] / r, u[1] / r, u[2] / r]); if (t == null || r <= t - dmin) return p; const k = Math.max(0.2, (t - dmin) / r); return [geom.c[0] + u[0] * k, geom.c[1] + u[1] * k, geom.c[2] + u[2] * k]; },
    /** gain BEM des sources (worker) : 1re fois matrice + facteur LU (conservé), ensuite transfert vers les électrodes seul */
    async esiBemLead(geom, P, src, progress) {
      const elec = Float64Array.from(P.flat()), S = Float64Array.from(src.view), run = (m, args) => SV.Work && SV.Work.available ? SV.Work.run(['bem'], 'BEM.' + m, args, [], progress) : SV.BEM[m](...args, progress);
      if (geom.model) return run('relead', [geom.model, elec, S, geom.c, ESI_DMIN]);
      const r = await run('build', [{ surfs: geom.surfs.map(s => ({ rr: s.rr, tris: s.tris, np: s.np, ntri: s.ntri })), sigma: geom.P.sigma, elec, src: S, center: geom.c, dmin: ESI_DMIN }]); geom.model = r.model; return r;
    },
    /** modèle de tête du scalp pour des électrodes 10-20 (noms normalisés) dans l'anatomie affichée */
    async esiScalpHead(names) {
      const known = names.filter(n => E.STD[n]); if (known.length < 8) throw new Error(`${known.length} électrodes 10-20 reconnues (8 au moins)`);
      if (this.esiHeadCfg().model === 'sphere') return this.esiSphereHead(known);
      let geom; try { geom = await this.esiHeadGeom(this.esiAtlasSpace()); } catch (e) { console.warn('BEM', e); const H = await this.esiSphereHead(known); return Object.assign({}, H, { info: H.info + ` — BEM impossible (${e.message}) : modèle sphérique` }); }
      const At = this.viewer.atlas, ep = this.esiElecPos(known, geom), C = this._esiHeads || (this._esiHeads = new Map());
      const key = 'B|' + geom.key + '|' + known.map((n, i) => n + ep.P[i].map(x => Math.round(x)).join(',')).join(';'); if (C.has(key) && C.get(key).atlas === At) return C.get(key);
      const src = this.esiSources(At, 10000, false), ck = `${key}|${src.n}|${ESI_DMIN}|${geom.space === 'patient' ? ((this.patientAnat.info || {}).date || '') : 'gabarit'}|v1`;
      let r = await this.esiLeadLoad(ck);   // déjà calculé pour cette tête et ces électrodes (dossier du patient) : relu
      if (!r) { const job = this.jobStart ? this.jobStart(geom.model ? 'Modèle de tête : électrodes' : 'Modèle de tête réaliste (BEM 3 couches)') : null;
        try { r = await this.esiBemLead(geom, ep.P, src, p => job && job.progress(p)); } catch (e) { if (job) job.fail(e.message); throw e; }
        if (job) job.done('Modèle de tête prêt (gardé dans le dossier)'); this.esiLeadSave(ck, r); }
      const m = known.length, L = E.avgRefCols(r.L, m, 3 * src.n), R = SV.BEM.allVerts({ n: r.n, surfs: geom.surfs }), Tr = { T: r.T, m }, P = geom.P, st = geom.stats, ag = geom.age;
      const H = { kind: 'scalp', model: 'bem', space: geom.space, atlas: At, names: known, P: ep.P, moved: ep.moved, c: geom.c, geom, m, n: src.n, src, L, op: null,
        gainAt: p => { const g = SV.BEM.gainAt(Tr, R, r.n, this.esiKeepIn(geom, p, ESI_DMIN)); for (let q = 0; q < 3; q++) { let a = 0; for (let i = 0; i < m; i++) a += g[i * 3 + q]; a /= m; for (let i = 0; i < m; i++) g[i * 3 + q] -= a; } return g; },
        inside: p => { const u = sub(p, geom.c), rr = len(u); if (rr < 8) return false; const t = SV.BEM.rayHit(geom.surfs[2], geom.c, [u[0] / rr, u[1] / rr, u[2] / rr]); return t != null && rr < t - 1; },
        info: `BEM à 3 couches (scalp, crâne externe, crâne interne, 642 sommets chacune) ; os ${nf(st.skull, 1)} mm, scalp ${nf(st.scalp, 1)} mm, rapport cerveau / os ${Math.round(P.bscr)} (${ag.age == null ? ag.how : `${nf(ag.age, ag.age < 3 ? 1 : 0)} an${ag.age >= 2 ? 's' : ''} ${ag.how}`}) ; ${m} électrodes ${geom.space === 'patient' ? 'sur le scalp du patient' : 'standard (tête MNI)'}${ep.moved.length ? ` dont ${ep.moved.length} replacée${ep.moved.length > 1 ? 's' : ''} à la main` : ''} ; ${src.n} sources corticales` };
      C.set(key, H); return H;
    },
    /** gain BEM gardé dans le dossier (derivatives/esi/) : même anatomie, âge, électrodes et sources → relu au lieu d'être
     *  recalculé (≈ 9 s) ; fichier = longueur de l'en-tête JSON, en-tête { key, m, n, nL, nT }, L puis T en float32 */
    esiLeadPath(ck) { let h = 0x811c9dc5; for (let i = 0; i < ck.length; i++) { h ^= ck.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return `derivatives/esi/lead_${h.toString(16).padStart(8, '0')}.bin`; },
    async esiLeadLoad(ck) {
      try { const b = this.dossier && await SV.Library.readBytes(this.dossier, this.esiLeadPath(ck)); if (!b) return null; const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), n0 = dv.getUint32(0, true), J = JSON.parse(new TextDecoder().decode(b.subarray(4, 4 + n0)));
        if (J.key !== ck) return null; const o = 4 + n0 + ((4 - n0 % 4) % 4), F = new Float32Array(b.buffer.slice(b.byteOffset + o, b.byteOffset + o + 4 * (J.nL + J.nT)));
        return { L: Float64Array.from(F.subarray(0, J.nL)), T: Float64Array.from(F.subarray(J.nL)), m: J.m, n: J.n }; } catch (e) { console.warn('modèle de tête gardé illisible', e); return null; }
    },
    async esiLeadSave(ck, r) {
      try { const hd = new TextEncoder().encode(JSON.stringify({ key: ck, m: r.m, n: r.n, nL: r.L.length, nT: r.T.length })), pad = (4 - hd.length % 4) % 4, F = new Float32Array(r.L.length + r.T.length); F.set(r.L); F.set(r.T, r.L.length);
        const n0 = new Uint8Array(4); new DataView(n0.buffer).setUint32(0, hd.length, true); await SV.Library.writeFile(this.dossier, this.esiLeadPath(ck), new Blob([n0, hd, new Uint8Array(pad), F])); } catch (e) { console.warn('modèle de tête non gardé', e); }
    },
    /** modèle sphérique à 3 couches (normalisation radiale locale), conductivités selon l'âge */
    async esiSphereHead(known) {
      const At = this.viewer.atlas, space = this.esiAtlasSpace(), key = 'S|' + space + '|' + known.join(','), C = this._esiHeads || (this._esiHeads = new Map()), PA = SV.BEM.ageParams(this.esiAge(space).age);
      if (C.has(key) && C.get(key).atlas === At) return C.get(key);
      let P = known.map(n => E.STD[n].slice()), nProj = 0;
      if (space === 'patient') { const Ap = this.patientAnat; P = P.map(p => M4.apply(Ap.dispFromTemplate, p[0], p[1], p[2])); const r = await this.esiProjectScalp(P); P = r.P; nProj = r.n; }
      const src = this.esiSources(At, 24000, false), sph = E.fitSphere(P), c = sph.c, rho = this.esiRadial(src.view, c);
      const rE = P.map(p => len(sub(p, c))), R = rE.reduce((s, x) => s + x, 0) / rE.length, dI = P.map((p, i) => rE[i] - rho(sub(p, c))), d = clamp(dI.reduce((s, x) => s + x, 0) / dI.length, 0.8 * (PA.skull + PA.scalp), 25);
      const model = E.sphereModel({ c: [0, 0, 0], rScalp: R, rSkull: R - 0.4 * d, rBrain: R - 0.86 * d, sig: [PA.sigma[2], PA.sigma[1], PA.sigma[0]] });
      const toS = p => { const u = sub(p, c), r = len(u); if (r < 1e-6) return [0, 0, 0]; const k = (R - d) / rho(u); return [u[0] * k, u[1] * k, u[2] * k]; };
      const Ed = new Float32Array(3 * known.length); P.forEach((p, i) => { const u = sub(p, c), r = len(u); Ed.set([u[0] / r, u[1] / r, u[2] / r], 3 * i); });
      const Sph = new Float32Array(src.view.length); for (let j = 0; j < src.n; j++) Sph.set(toS([src.view[3 * j], src.view[3 * j + 1], src.view[3 * j + 2]]), 3 * j);
      const m = known.length, L = E.avgRefCols(E.sphereLeadfield(model, Ed, Sph), m, 3 * src.n), g3 = [0, 0, 0];
      const H = { kind: 'scalp', model: 'sphere', space, atlas: At, names: known, P, c, R, d, nProj, sphere: model, m, n: src.n, src, L, op: null,
        gainAt: p => { const s = toS(p), g = new Float64Array(m * 3); for (let i = 0; i < m; i++) { E.sphereGain(model, [Ed[3 * i], Ed[3 * i + 1], Ed[3 * i + 2]], s, g3); g[i * 3] = g3[0]; g[i * 3 + 1] = g3[1]; g[i * 3 + 2] = g3[2]; } for (let q = 0; q < 3; q++) { let a = 0; for (let i = 0; i < m; i++) a += g[i * 3 + q]; a /= m; for (let i = 0; i < m; i++) g[i * 3 + q] -= a; } return g; },
        inside: p => { const u = sub(p, c), r = len(u); return r > 8 && r < rho(u) * 1.01; },
        info: `sphère à 3 couches ajustée (rayon ${nf(R, 0)} mm, scalp + os ${nf(d, 0)} mm, rapport cerveau / os ${Math.round(PA.bscr)}), ${m} électrodes${space === 'patient' ? ` recalées sur le patient${nProj ? ` (${nProj} projetées sur le scalp du T1)` : ''}` : ' standard (tête MNI)'}, ${src.n} sources corticales` };
      C.set(key, H); return H;
    },
    /** modèle SEEG (milieu infini) pour des plots { name, p } (espace de la vue) */
    esiSeegHead(contacts) {
      const At = this.viewer.atlas, key = 'Q|' + this.esiAtlasSpace() + '|' + contacts.map(c => c.name + c.p.map(x => Math.round(x)).join(',')).join(';'), C = this._esiHeads || (this._esiHeads = new Map());
      if (C.has(key) && C.get(key).atlas === At) return C.get(key);
      // sources limitées à la zone vue par l'implantation (≤ 35 mm d'un plot, López-Madrona 2023) : au-delà, la normalisation de
      // sLORETA gonflerait des sources que les plots ne voient presque pas (hémisphère non implanté)
      const src = this.esiNear(this.esiSources(At, 9000, true), contacts.map(c => c.p), 35), m = contacts.length, Cf = Float32Array.from(contacts.flatMap(c => c.p)), L = E.avgRefCols(E.infiniteLeadfield(Cf, src.view, 0.33, 2), m, 3 * src.n), g3 = [0, 0, 0];
      let c0 = [0, 0, 0]; for (let j = 0; j < src.n; j++) for (let q = 0; q < 3; q++) c0[q] += src.view[3 * j + q] / src.n; const rho = this.esiRadial(src.view, c0);
      const H = { kind: 'seeg', space: this.esiAtlasSpace(), atlas: At, names: contacts.map(c => c.name), P: contacts.map(c => c.p), m, n: src.n, src, L, op: null, c: c0,
        gainAt: p => { const g = new Float64Array(m * 3); for (let i = 0; i < m; i++) { E.infiniteGain(contacts[i].p, p, 0.33, g3, 2); g[i * 3] = g3[0]; g[i * 3 + 1] = g3[1]; g[i * 3 + 2] = g3[2]; } for (let q = 0; q < 3; q++) { let a = 0; for (let i = 0; i < m; i++) a += g[i * 3 + q]; a /= m; for (let i = 0; i < m; i++) g[i * 3 + q] -= a; } return g; },
        inside: p => { const u = sub(p, c0), r = len(u); if (r > rho(u) * 1.01) return false; for (const ct of contacts) if (len(sub(ct.p, p)) < 2.5) return false; return true; },
        info: `milieu homogène infini, ${m} plots en référence moyenne, ${src.n} sources (cortex et temporal mésial à moins de 35 mm d’un plot)` };
      C.set(key, H); return H;
    },
    /** opérateur sLORETA (et gain blanchi si une covariance de bruit est donnée), en cache sur la tête */
    esiOp(H, alpha, noise) {
      const a = alpha == null ? 0.05 : alpha, key = (noise ? noise.length + ':' + Array.prototype.reduce.call(noise, (q, x, i) => q + x * (i % 7 + 1), 0).toPrecision(9) : 'id') + '|' + a, C = H.ops || (H.ops = new Map());
      if (C.has(key)) return C.get(key);
      let O; if (noise) { const Wt = E.whitener(Float64Array.from(noise), H.m, 0.1), Lw = E.whitenL(Wt, H.L, 3 * H.n); O = Object.assign(E.sloretaOperator(Lw, Wt.r, H.n, a), { Wt }); }
      else O = E.sloretaOperator(H.L, H.m, H.n, a);
      if (C.size > 6) C.delete(C.keys().next().value); C.set(key, O); return O;
    },
    /** lobe d'une région (avec le côté) : concordance des méthodes */
    esiLobe(At, r) { const g = At.region && At.region(r), m = g && At.db && At.db.regionByFamily.get(g.family); return m && m.lobe ? m.lobe + (g.hemi === 'L' ? ' G' : g.hemi === 'R' ? ' D' : '') : null; },

    // ================================================================ localisation d'une topographie (ou d'une covariance)
    /** v : valeurs par électrode (ordre de H.names), pcs : [{ val, vec }] (covariance approchée) ; X = { noise (m × m) :
     *  blanchiment (bruit de fond, Brainstorm / Parra-Díaz 2026), data (m × m) : formeur de voie LCMV } →
     *  { pw, dip, top, lcmv, conc } — concordance lobaire sLORETA / LCMV / dipôle */
    esiSolve(H, v, pcs, alpha, X) {
      X = H.kind === 'scalp' && X ? X : {};   // SEEG : milieu infini sans blanchiment (Caune 2014) ; le fond préictal n'y est pas un bruit
      const O = this.esiOp(H, alpha, X.noise), m = H.m, Wt = O.Wt, vr = E.avgRefVec(v), vw = Wt ? E.whitenV(Wt, vr) : vr;
      let pw; if (pcs && pcs.length) { const C = new Float64Array(m * m); for (const p of pcs) { const u = E.avgRefVec(p.vec); for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) C[i * m + j] += p.val * u[i] * u[j]; } pw = E.sloretaPowerCov(O, Wt ? E.whitenC(Wt, C) : C); } else pw = E.sloretaPower(O, vw);
      const argmax = a => { let mx = 0, jm = 0; for (let j = 0; j < a.length; j++) if (a[j] > mx) { mx = a[j]; jm = j; } return [jm, mx]; }, [jm, mx] = argmax(pw);
      const gw = Wt ? p => { const g = H.gainAt(p), out = new Float64Array(Wt.r * 3); for (let a = 0; a < Wt.r; a++) for (let i = 0; i < m; i++) { const w = Wt.W[a * m + i]; out[a * 3] += w * g[i * 3]; out[a * 3 + 1] += w * g[i * 3 + 1]; out[a * 3 + 2] += w * g[i * 3 + 2]; } return out; } : H.gainAt;
      const dip = E.fitDipole({ gainAt: gw, v: vw, L: O.L, n: H.n, S: H.src.view, inside: H.inside, step: 6 });
      // régions : part de la puissance au-dessus de 50 % du maximum (étendue de la source), dans l'ordre
      const At = H.atlas, regOf = j => H.src.lab[j], byR = new Map(); let tot = 0; for (let j = 0; j < pw.length; j++) { const r = regOf(j), w = pw[j] / (mx || 1) - 0.5; if (r && w > 0) { byR.set(r, (byR.get(r) || 0) + w); tot += w; } }
      const top = [...byR.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([r, w]) => ({ r, w: r3(w / (tot || 1)), name: At.label(r) })).filter(t => t.w >= 0.05);
      // région du dipôle : source la plus proche (cortex ou temporal mésial) ; plot le plus proche (SEEG)
      let jn = 0, dn = Infinity; for (let j = 0; j < H.n; j++) { const d = (H.src.view[3 * j] - dip.p[0]) ** 2 + (H.src.view[3 * j + 1] - dip.p[1]) ** 2 + (H.src.view[3 * j + 2] - dip.p[2]) ** 2; if (d < dn) { dn = d; jn = j; } }
      dip.region = At.label(regOf(jn)); dip.rIdx = regOf(jn); dip.cortex = Math.sqrt(dn);
      if (H.kind === 'seeg') { let b = Infinity, bn = ''; H.P.forEach((p, i) => { const d = len(sub(p, dip.p)); if (d < b) { b = d; bn = H.names[i]; } }); dip.near = { name: bn, d: b }; }
      // formeur de voie LCMV (covariance des données de la pointe ou de la fenêtre critique), sur le gain blanchi
      let lcmv = null; if (X.data && Wt) { const Lp = E.lcmvPower(O.L, Wt.r, H.n, E.whitenC(Wt, Float64Array.from(X.data)), pcs && pcs.length ? null : vw, 0.05), [jl] = argmax(Lp); lcmv = { jm: jl, region: At.label(regOf(jl)), rIdx: regOf(jl) }; }
      const L3 = [['sLORETA', this.esiLobe(At, regOf(jm))], ['dipôle', this.esiLobe(At, dip.rIdx)]].concat(lcmv ? [['LCMV', this.esiLobe(At, lcmv.rIdx)]] : []).filter(x => x[1]);
      const cnt = new Map(); for (const [, l] of L3) cnt.set(l, (cnt.get(l) || 0) + 1); const best = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0];
      const conc = best ? { lobe: best[0], n: best[1], of: L3.length, by: L3.map(([k, l]) => ({ k, l })) } : null;
      return { pw, mx, jm, peak: At.label(regOf(jm)), dip, top, lcmv, conc, white: !!Wt };
    },
    /** carte des sommets (seuil relatif, 0 à 1) et structures profondes pour la peinture de la vue 3D */
    esiPaint(H, pw, thr) {
      thr = thr == null ? 0.4 : thr; let mx = 0; for (const x of pw) mx = Math.max(mx, x); const w = j => clamp((pw[j] / (mx || 1) - thr) / (1 - thr), 0, 1), vertex = {}, subm = new Map();
      for (const h of ['lh', 'rh']) { const map = H.src.map[h], a = new Float32Array(map.length); for (let v = 0; v < map.length; v++) a[v] = map[v] >= 0 ? w(map[v]) : 0; vertex[h] = a; }
      for (let j = 0; j < H.n; j++) if (H.src.deep[j] >= 0) subm.set(H.src.deep[j], Math.max(subm.get(H.src.deep[j]) || 0, w(j)));
      return { vertex, sub: subm, base: this.themeName && this.themeName() === 'light' ? [178, 186, 200] : [86, 112, 160] };
    },
    /** carte de couverture d'une implantation SEEG : gain maximal de chaque source (2 décades sous le maximum) */
    esiCoverage(H) {
      const k = 3 * H.n, pw = new Float32Array(H.n); for (let j = 0; j < H.n; j++) { let s = 0; for (let i = 0; i < H.m; i++) for (let q = 0; q < 3; q++) s += H.L[i * k + 3 * j + q] ** 2; pw[j] = s; }
      let mx = 0; for (const x of pw) mx = Math.max(mx, x); for (let j = 0; j < H.n; j++) pw[j] = clamp(Math.log10(pw[j] / mx + 1e-12) / 3 + 1, 0, 1); return pw;
    },

    // ================================================================ affichage d'un résultat en 3D
    /** tête du résultat (scalp ou plots localisés de la SEEG) dans l'anatomie affichée ; { H, v } ou { err } */
    async esiHeadFor(res) {
      const X = H => ({ noise: subCov(res.noise, res.chans, H.names), data: subCov(res.dataCov, res.chans, H.names) });
      if (res.modality === 'scalp') { const ex0 = this.ieegEx(), rc = ex0 && (ex0.recordings || []).find(r => r.id === res.recId), off = this.esiOff(rc), H = await this.esiScalpHead(res.chans.filter(n => E.STD[n] && !off.has(n))), v = H.names.map(n => res.topo[res.chans.indexOf(n)]); return { H, v, X: X(H), pcs: (res.pcs || []).map(p => ({ val: p.val, vec: H.names.map(n => p.vec[res.chans.indexOf(n)]) })) }; }
      const ex = this.ieegEx(), rec = ex && (ex.recordings || []).find(r => r.id === res.recId), pos = this.esiContactPos(res.chans, rec), keep = res.chans.map((n, i) => pos.get(n) ? i : -1).filter(i => i >= 0); if (keep.length < 6) return { err: 'plots non localisés dans l’anatomie affichée' };
      const H = this.esiSeegHead(keep.map(i => ({ name: res.chans[i], p: pos.get(res.chans[i]) }))); return { H, v: keep.map(i => res.topo[i]), X: X(H), pcs: (res.pcs || []).map(p => ({ val: p.val, vec: keep.map(i => p.vec[i]) })) };
    },
    /** positions (vue 3D) des plots « électrode du schéma + numéro » ; noms de voies du tracé acceptés (correspondance) */
    esiContactPos(names, rec) {
      const out = new Map(), els = (this.viewer && this.viewer.electrodes) || [], map = rec ? this.ieegMapFor(rec, [...new Set(names.map(n => (IE.parseContact(n) || {}).elec).filter(Boolean))]) : null;
      for (const n of names) { const pc = IE.parseContact(n); if (!pc) continue; const en = map ? map[pc.elec] : pc.elec, e = en && S.findElec(els, en), c = e && e.contacts.find(x => x.k === pc.k); if (c && c.xyz) out.set(n, c.xyz.slice()); }
      return out;
    },
    /** options d'affichage du résultat : carte sLORETA, dipôle (bille et moment), ellipsoïde de confiance à 95 % */
    esiOpt() { return this.ui.esiOpt || (this.ui.esiOpt = { map: true, dip: true, ell: true }); },
    /** contexte d'un affichage : la carte, le dipôle et le scalp ne valent que pour ce dossier et cette exploration */
    esiScopeKey() { const d = this.dossier, ex = this.ieegEx && this.ieegEx(); return (d ? d.id : '') + '|' + (ex ? ex.id : ''); },
    /** résultat calculé dans l'anatomie affichée → { res, sol, H, coverage } ou null */
    async esiItem(res, o) {
      let R; try { R = await this.esiHeadFor(res); } catch (e) { this.toast('Imagerie de source : ' + e.message, 6000); return null; }
      if (R.err) { this.toast('Imagerie de source : ' + R.err, 6000); return null; }
      return { res, sol: this.esiSolve(R.H, R.v, res.cov === false ? null : R.pcs, res.alpha, R.X), H: R.H, coverage: !!(o && o.coverage) };
    },
    /** affiche un résultat ; o.add : ajouté aux résultats déjà montrés (comparaison, une teinte chacun), o.coverage : couverture */
    async esiShow(res, o) {
      o = o || {}; const V3 = this.viewer; if (!V3 || !res) return null; this.ui.esiThr = this.ui.esiThr == null ? 0.6 : this.ui.esiThr;
      const it = await this.esiItem(res, o); if (!it) return null;
      const keep = o.add && !o.coverage ? (this._esiList || []).filter(x => !x.coverage && x.res.id !== res.id) : [];
      this._esiList = keep.concat([it]); this._esiKey = this.esiScopeKey(); this._esiElecOnly = null; this.esiDraw();
      if (!o.add && !o.coverage) { const c = V3.center || { x: 0 }, side = it.sol.dip.p[0] < (c.x || 0) ? 'L' : 'R', v = (V3.activeCfg || {}).view, opp = side === 'L' ? 'latR' : 'latL'; if (v === opp) V3.setView('lat' + side, true); }   // face latérale tournée vers la source
      if (this.ui.tab === 'quant' && this.renderQuant) this.renderQuant(); return it.sol;
    },
    /** retire un résultat de la comparaison */
    esiDrop(id) { this._esiList = (this._esiList || []).filter(x => x.res.id !== id); if (!this._esiList.length) return this.esiHide(); this.esiDraw(); },
    /** dessin des résultats montrés (vue 3D, coupes, légende) selon les options */
    esiDraw() {
      const V3 = this.viewer, L = this._esiList || [], O = this.esiOpt(); if (!V3) return; if (!L.length) return this.esiHide();
      const L0 = L[0], light = this.themeName && this.themeName() === 'light', multi = L.length > 1;
      L.forEach((x, i) => { x.color = multi ? ESI_PAL[i % ESI_PAL.length] : light ? '#0b5fbd' : '#ffd60a'; });
      this._esiLast = L0; this.ui.esiShown = L0.res.id;
      const P = L0.coverage ? this.esiPaint(L0.H, this.esiCoverage(L0.H), 0.05) : !O.map ? { vertex: {}, sub: new Map(), base: light ? [206, 200, 192] : [176, 170, 162] } : multi ? this.esiPaintMulti(L) : this.esiPaint(L0.H, L0.sol.pw, this.ui.esiThr);
      V3.setPaint('esi', P);
      V3.setCellConfig(V3.active, { paint: 'esi', fibers: false, nodes: false, sync: false, opacity: Math.min((V3.activeCfg || {}).opacity || 1, 0.92) }, true);
      V3.setDipoles(L0.coverage ? [] : L.map(x => ({ p: x.sol.dip.p, dir: x.sol.dip.q, ball: O.dip, ci: O.ell && Math.max(...x.sol.dip.ci.r) <= CI_MAX ? x.sol.dip.ci : null, color: x.color })).filter(d => d.ball || d.ci));
      V3.onScalpMenu = (n, e) => this.esiElecMenu(n, e);
      this.esiScalpView(L0.H); this.esiLegend(); this.esiSlices();
    },
    /** coupes IRM (volet ou fenêtre d'imagerie) : ruban du cortex coloré par la carte, dipôles et ellipsoïdes, dans l'espace des coupes */
    esiSlices() {
      const S3 = this.slices, V3 = this.viewer; if (!S3 || !S3.setSource) return; const L = this._esiList || [], P = V3 && V3.paints && V3.paints.esi, At = V3 && V3.atlas;
      if (!L.length || !P || !At || L[0].coverage) { S3.setSource(null); return; }
      const A = this.patientAnat, tpl = this.slvSpace() === 'tpl', M = tpl ? (this.anatMode === 'patient' && A ? A.templateFromDisplay : M4.identity()) : A ? (this.anatMode === 'patient' ? A.fromDisplay : A.fromTemplate) : null; if (!M) { S3.setSource(null); return; }
      const key = [At.patient ? 'p' : 't', tpl, this.anatMode].join('|'), C = this._esiSlPos && this._esiSlPos.At === At && this._esiSlPos.key === key ? this._esiSlPos : (this._esiSlPos = { At, key, pos: {} });
      const pos = h => C.pos[h] || (C.pos[h] = (() => { const H = At.hemis[h], Q = new Float32Array(H.pial.length); for (let i = 0; i < Q.length; i += 3) { const q = M4.apply(M, H.pial[i], H.pial[i + 1], H.pial[i + 2]); Q[i] = q[0]; Q[i + 1] = q[1]; Q[i + 2] = q[2]; } return Q; })());
      const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)), parts = [], O = this.esiOpt();
      for (const h of ['lh', 'rh']) { const H = At.hemis[h]; if (!H || !H.pial) continue;
        if (P.layers) P.layers.forEach(l => { if (l.vertex[h]) parts.push({ pos: pos(h), faces: H.faces, w: l.vertex[h], color: l.color }); });
        else if (P.vertex[h]) parts.push({ pos: pos(h), faces: H.faces, w: P.vertex[h] }); }
      const lin = v => { const a = M4.apply(M, v[0], v[1], v[2]), o = M4.apply(M, 0, 0, 0); return [a[0] - o[0], a[1] - o[1], a[2] - o[2]]; };
      const dips = L.map(x => { const d = x.sol.dip, ax = d.ci && d.ci.axes ? d.ci.axes.map((a, k) => lin(a.map(z => z * d.ci.r[k]))) : null;
        return { p: M4.apply(M, d.p[0], d.p[1], d.p[2]), ball: O.dip, ci: O.ell && ax && Math.max(...d.ci.r) <= CI_MAX ? { axes: ax.map(a => { const n = len(a) || 1; return a.map(z => z / n); }), r: ax.map(a => Math.max(1, Math.min(60, len(a)))) } : null, color: hex(x.color) }; });
      S3.setSource({ parts, dips });
    },
    /** plusieurs cartes : une teinte par résultat (seuil commun), mélangées où elles se recouvrent */
    esiPaintMulti(L) {
      const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)), layers = [], sub = new Map(), subc = new Map();
      for (const x of L) { const P = this.esiPaint(x.H, x.sol.pw, this.ui.esiThr), col = hex(x.color); layers.push({ vertex: P.vertex, color: col }); for (const [r, w] of P.sub) if (w > (sub.get(r) || 0)) { sub.set(r, w); subc.set(r, col); } }
      return { vertex: {}, layers, sub, subc, base: this.themeName && this.themeName() === 'light' ? [178, 186, 200] : [86, 112, 160] };
    },
    esiHide() {
      const V3 = this.viewer; this._esiList = []; this._esiLast = null; this.ui.esiShown = null; if (!V3) return;
      V3.setPaint('esi', null); V3.setDipoles([]); if (V3.setScalp && !this._esiElecOnly) V3.setScalp(null);
      V3.cells.forEach((c, i) => { if (c.cfg.paint === 'esi') V3.setCellConfig(i, { paint: null }, true); }); this.esiLegend(); this.esiSlices();
    },
    /** dossier ouvert, fermé ou changé : rien de l'imagerie de source ne passe d'un patient à l'autre */
    esiReset() { this._esiElecOnly = null; this.esiHide(); if (this.viewer && this.viewer.setScalp) this.viewer.setScalp(null); this._esiGeom = null; this._esiHeads = null; Object.assign(this.ui, { esiElec: false, esiEdit: false, esiLayers: false }); },
    /** électrodes d'un tracé hors du calcul de source : exclues en 3D (clic droit) ou dans le tracé (Voies › Analyse) */
    esiOff(rec) { return new Set(((rec && rec.scalpOff) || []).concat(((rec && rec.ei && rec.ei.excludedContacts) || []).map(n => E.stdName(n)).filter(Boolean))); },
    /** clic droit sur une électrode de scalp (3D) : position standard, exclusion du calcul */
    esiElecMenu(name, e) {
      const L0 = this._esiLast, EO = this._esiElecOnly, ex = this.ieegEx(), rec = EO ? EO.rec : L0 && ex && (ex.recordings || []).find(r => r.id === L0.res.recId), space = L0 ? L0.H.space : this.esiAtlasSpace();
      const moved = !!(ex && ex.scalpPos && ex.scalpPos[space] && ex.scalpPos[space][name]), off = this.esiOff(rec);
      this.popupMenu([{ head: name }, { label: 'Position standard (10-20 recalée)', disabled: !moved, run: () => this.esiResetElec(name) },
        rec ? { label: off.has(name) ? 'Réintégrer dans le calcul de source' : 'Exclure du calcul de source (mauvais contact)', run: () => { if (off.has(name) && rec.ei && rec.ei.excludedContacts) rec.ei.excludedContacts = rec.ei.excludedContacts.filter(n => E.stdName(n) !== name); rec.scalpOff = off.has(name) ? (rec.scalpOff || []).filter(x => x !== name) : (rec.scalpOff || []).concat([name]); this.touch('exploration', ex.id, `électrode ${name} ${off.has(name) ? 'réintégrée' : 'exclue'}`); this._esiHeads = null; EO ? EO.draw() : this.esiRefresh(); } } : null].filter(Boolean), e.clientX, e.clientY);
    },
    esiScalpView(H) {
      const V3 = this.viewer; if (!V3 || !V3.setScalp) return;
      if (!H || H.kind !== 'scalp' || H.model !== 'bem' || !this.ui.esiElec) { V3.setScalp(null); return; }
      const G = H.geom; V3.onScalpMove = (n, p) => this.esiMoveElec(n, p);
      const L0 = this._esiLast, ex = this.ieegEx(), rec = L0 && ex && (ex.recordings || []).find(r => r.id === L0.res.recId), offN = [...this.esiOff(rec)].filter(n => E.STD[n] && L0.res.chans.includes(n)), op = offN.length ? this.esiElecPos(offN, G) : null;
      V3.setScalp({ scalp: G.surfs[0], layers: this.ui.esiLayers ? [G.surfs[1], G.surfs[2]] : [], elecs: H.names.map((n, i) => ({ name: n, p: H.P[i], moved: H.moved.includes(n) })).concat(offN.map((n, i) => ({ name: n, p: op.P[i], off: true }))), c: G.c, edit: !!this.ui.esiEdit, light: this.themeName && this.themeName() === 'light' });
      V3.onScalpMenu = (n, e) => this.esiElecMenu(n, e);
    },
    /** électrode replacée à la souris : position enregistrée dans l'exploration (monde du T1 ou gabarit), modèle recalculé */
    async esiMoveElec(name, p) { const L0 = this._esiLast; if (!L0 || !this.esiStorePos(name, p, L0.H.space)) return; await this.esiRefresh(); },
    esiStorePos(name, p, sp) {
      const ex = this.ieegEx(); if (!ex) return false; const w = sp === 'patient' ? M4.apply(this.patientAnat.fromDisplay, p[0], p[1], p[2]) : p;
      ex.scalpPos = ex.scalpPos || {}; (ex.scalpPos[sp] = ex.scalpPos[sp] || {})[name] = w.map(x => Math.round(x * 10) / 10);
      this.touch('exploration', ex.id, `électrode ${name} replacée`); return true;
    },
    /** électrodes d'un tracé posées sur le scalp du modèle, sans résultat : vérification et placement à la souris (le modèle de
     *  source sera calculé avec ces positions) ; second appel → masquées */
    async esiElecOnly(rec) {
      const V3 = this.viewer; if (!V3 || !V3.setScalp) return; if (this._esiElecOnly && this._esiElecOnly.rec === rec) { this.esiElecOff(); return; }
      if (this._esiLast) this.esiHide(); let geom; try { geom = await this.esiHeadGeom(this.esiAtlasSpace()); } catch (e) { this.toast('Modèle de tête : ' + e.message, 6000); return; }
      const names = E.scalpChannels(((rec && rec.channels) || []).map(c => c.name)).map(x => x.name), ex = this.ieegEx();
      const draw = () => { const ep = this.esiElecPos(names, geom), mv = Object.keys((ex && ex.scalpPos && ex.scalpPos[geom.space]) || {}), off = this.esiOff(rec); V3.setScalp({ free: true, scalp: geom.surfs[0], layers: [], elecs: names.map((n, i) => ({ name: n, p: ep.P[i], moved: mv.includes(n), off: off.has(n) })), c: geom.c, edit: true, light: this.themeName && this.themeName() === 'light' }); };
      this._esiElecOnly = { rec, draw, key: this.esiScopeKey() }; V3.onScalpMenu = (n, e) => this.esiElecMenu(n, e); V3.onScalpMove = (n, p) => { if (this.esiStorePos(n, p, geom.space)) { const C = this._esiHeads; if (C) for (const k of [...C.keys()]) if (k[0] === 'B') C.delete(k); draw(); } };
      draw(); V3.setView('latL', true); this.toast('Glisser une électrode sur le scalp pour la replacer', 4000); this.renderQuant();
    },
    esiElecOff() { if (!this._esiElecOnly) return; this._esiElecOnly = null; if (this.viewer && this.viewer.setScalp && !this._esiLast) this.viewer.setScalp(null); this.renderQuant(); },
    /** positions standard (10-20 recalées) : une électrode (name) ou toutes ; avec ou sans résultat affiché */
    esiResetElec(name) {
      const ex = this.ieegEx(), L0 = this._esiLast, EO = this._esiElecOnly, sp = L0 ? L0.H.space : this.esiAtlasSpace(), P = ex && ex.scalpPos && ex.scalpPos[sp]; if (!P) return;
      if (name) delete P[name]; else delete ex.scalpPos[sp]; if (P && !Object.keys(P).length) delete ex.scalpPos[sp];
      this.touch('exploration', ex.id, name ? `électrode ${name} : position standard` : 'électrodes de scalp : positions standard'); this._esiHeads = null;
      if (EO) EO.draw(); this.esiRefresh();
    },
    /** résultats montrés recalculés (modèle de tête, électrodes, anatomie changés) */
    async esiRecompute() { const L = this._esiList || []; if (!L.length) return; const out = []; for (const x of L) { const it = await this.esiItem(x.res, { coverage: x.coverage }); if (it) out.push(it); } this._esiList = out; this.esiDraw(); },
    /** modèle de tête changé (électrodes, réglages) : résultat affiché et solution du panneau recalculés */
    async esiRefresh() {
      const C = this._esiHeads; if (C) for (const k of [...C.keys()]) if (k[0] === 'B' || k[0] === 'S') C.delete(k);
      await this.esiRecompute();
      const V = this._iev; if (V && sc(V)) { if (V.meth === 'esp' && V.espAvg) await this.esiSpikeAverage(V.espAvg.k); else if (V.meth === 'esz' && V.eszSol) await this.esiIctalCompute(); }
    },
    /** réglages du modèle de tête : BEM réaliste ou sphère, âge (conductivités et épaisseurs), électrodes */
    esiHeadDialog() {
      const d = this.dossier; if (!d) return; const cfg = this.esiHeadCfg(), space = this.esiAtlasSpace(), auto = this.esiAge(space), ex = this.ieegEx(), nMoved = Object.keys((ex && ex.scalpPos && ex.scalpPos[space]) || {}).length;
      document.querySelectorAll('#esiHeadDlg').forEach(x => x.remove());
      const box = document.createElement('div'); box.className = 'modal'; box.id = 'esiHeadDlg';
      const tab = a => { const P = SV.BEM.ageParams(a); return `<table class="esi-ptab"><tr><td>conductivités (S/m)</td><td>cerveau ${nf(P.sigma[2], 2)} · os ${nf(P.sigma[1], 4)} · scalp ${nf(P.sigma[0], 2)}</td></tr><tr><td>rapport cerveau / os</td><td>${Math.round(P.bscr)}</td></tr><tr><td>épaisseurs</td><td>os ${nf(P.skull, 1)} mm · scalp ≥ ${nf(P.scalp, 1)} mm · LCR ${nf(P.csf, 1)} mm</td></tr></table>`; };
      const ageTxt = a => a.age == null ? a.how : `${nf(a.age, a.age < 3 ? 1 : 0)} an${a.age >= 2 ? 's' : ''} (${a.how})`;
      box.innerHTML = `<div class="modal-card esi-head-dlg"><div class="modal-head"><span>Modèle de tête de l’imagerie de source</span><button class="close">✕</button></div>
        <label class="esi-opt"><input type="radio" name="esiM" value="bem"${cfg.model === 'bem' ? ' checked' : ''}> <b>BEM réaliste à 3 couches</b> <span class="muted">scalp, crâne externe et interne construits sur ${space === 'patient' ? 'l’IRM du patient' : 'la tête du gabarit MNI'} (comme Brainstorm / OpenMEEG)</span></label>
        <label class="esi-opt"><input type="radio" name="esiM" value="sphere"${cfg.model === 'sphere' ? ' checked' : ''}> <b>Sphère à 3 couches</b> <span class="muted">ajustée aux électrodes, plus rapide, moins juste en temporal basal et frontal</span></label>
        <div class="ctrl-row"><label>âge <input type="number" class="esi-age" min="0" max="100" step="0.1" value="${cfg.age == null ? '' : cfg.age}" placeholder="${auto.age == null ? 'adulte' : nf(auto.age, 1)}" style="width:70px"> ans</label><span class="muted small">vide : ${esc(ageTxt(cfg.age == null ? auto : this.esiAge(space)))}</span></div>
        <div class="esi-ptabw">${tab(cfg.age != null ? cfg.age : auto.age)}</div>
        <div class="hint">L’os du nourrisson, peu ossifié, conduit beaucoup mieux (rapport ≈ 4 à la naissance, ≈ 11 à 1 an, 50 chez l’adulte) et il est plus mince : ces valeurs suivent l’âge. Fontanelles non représentées. Électrodes : ${nMoved ? `${nMoved} replacée${nMoved > 1 ? 's' : ''} à la main` : 'positions 10-20 recalées sur la tête'} — à vérifier en 3D.</div>
        <div class="btnrow">${nMoved ? '<button class="esi-reset">Positions standard des électrodes</button>' : ''}<span class="spacer"></span><button class="close">Annuler</button><button class="primary esi-ok">Appliquer</button></div></div>`;
      document.body.appendChild(box); box.hidden = false;
      const close = () => box.remove(); box.querySelectorAll('.close').forEach(b => b.onclick = close); box.onclick = e => { if (e.target === box) close(); };
      const ag = box.querySelector('.esi-age'); ag.oninput = () => { const v = ag.value === '' ? auto.age : +ag.value; box.querySelector('.esi-ptabw').innerHTML = tab(isFinite(v) ? v : auto.age); };
      const rs = box.querySelector('.esi-reset'); if (rs) rs.onclick = () => { close(); this.esiResetElec(); };
      box.querySelector('.esi-ok').onclick = () => { const m = box.querySelector('input[name=esiM]:checked').value, a = ag.value === '' ? null : Math.max(0, +ag.value); d.settings = d.settings || {}; d.settings.esiHead = { model: m, age: isFinite(a) ? a : null }; this._esiGeom = null; this.touch(); close(); this.toast('Modèle de tête modifié : recalcul', 2500); this.esiRefresh(); };
    },
    esiLegend() {
      let el = $('esiLeg'); if (!el) { const f = document.querySelector('.view-foot'); if (!f) return; el = document.createElement('div'); el.id = 'esiLeg'; el.className = 'legend esi-leg'; f.appendChild(el); }
      const L = this._esiList || [], L0 = L[0]; el.hidden = !L0; if (!L0) return; const O = this.esiOpt();
      const bem = L0.H.kind === 'scalp' && L0.H.model === 'bem', tg = (k, l, t) => `<button data-k="${k}" class="${this.ui[k] ? 'on' : ''}" title="${t}">${l}</button>`, to = (k, l, t) => `<label class="chip" title="${t}"><input type="checkbox" data-o="${k}"${O[k] ? ' checked' : ''}> ${l}</label>`;
      const line = x => { const d = x.sol.dip; return `<span>sLORETA ≥ ${Math.round(this.ui.esiThr * 100)} % · max ${esc(x.sol.peak)}</span><span>dipôle ${esc(d.region)} · GOF ${Math.round(d.gof * 100)} % · ${ciTxt(d.ci.r)}${d.near ? ` · plot ${esc(d.near.name)} à ${nf(d.near.d, 0)} mm` : ''}</span>`; };
      el.innerHTML = L0.coverage ? `<b>Couverture de l’implantation</b><span class="muted">gain maximal de chaque source (3 décades)</span><a class="esi-x" title="masquer">✕</a>`
        : `${L.length > 1 ? L.map(x => `<div class="esi-cmp"><i style="background:${x.color}"></i><b>${esc(x.res.title)}</b><span class="muted">${esc(x.sol.peak)} · dipôle ${esc(x.sol.dip.region)} (GOF ${Math.round(x.sol.dip.gof * 100)} %)</span><a data-drop="${x.res.id}" title="retirer de la comparaison">✕</a></div>`).join('') : `<b>${esc(L0.res.title)}</b>${line(L0)}${concHtml(L0.sol.conc, true)}`}
        <span class="esi-lb esi-opts">${to('map', 'cortex coloré', 'Cortex coloré par la source (sLORETA, au-dessus du seuil)')}${to('dip', 'dipôle', 'Dipôle équivalent : position et moment')}${to('ell', 'ellipse 95 %', 'Ellipse (ellipsoïde) de confiance à 95 % du dipôle')}</span>
        ${bem ? `<span class="esi-lb">${tg('esiElec', 'Électrodes', 'Scalp du modèle et électrodes (clic droit sur une électrode : position standard, exclure)')}${this.ui.esiElec ? tg('esiEdit', 'Déplacer', 'Glisser une électrode sur le scalp : le modèle est recalculé') + tg('esiLayers', 'Couches', 'Crâne externe et interne du modèle') : ''}${L0.H.moved.length ? '<button data-k="reset" title="Toutes les électrodes aux positions 10-20 recalées">Positions standard</button>' : ''}<button data-k="head" title="BEM ou sphère, âge">Modèle…</button></span>` : ''}<a class="esi-x" title="masquer">✕</a>`;
      const x = el.querySelector('.esi-x'); if (x) x.onclick = () => { this.esiHide(); if (this.ui.tab === 'quant') this.renderQuant(); };
      el.querySelectorAll('[data-drop]').forEach(a => a.onclick = () => { this.esiDrop(a.dataset.drop); if (this.ui.tab === 'quant') this.renderQuant(); });
      el.querySelectorAll('[data-o]').forEach(b => b.onchange = () => { O[b.dataset.o] = b.checked; this.esiDraw(); });
      el.querySelectorAll('.esi-lb button[data-k]').forEach(b => b.onclick = () => { const k = b.dataset.k; if (k === 'reset') return this.esiResetElec(); if (k === 'head') return this.esiHeadDialog(); this.ui[k] = !this.ui[k]; if (k === 'esiElec' && !this.ui.esiElec) this.ui.esiEdit = false; this.esiScalpView(L0.H); this.esiLegend(); if (k === 'esiEdit' && this.ui.esiEdit) this.toast('Glisser une électrode sur le scalp pour la replacer', 3500); });
    },
    /** panneau « Affichage » de la vue 3D : section Source (cortex coloré, dipôle, ellipse, seuil) quand un résultat est montré ;
     *  les mêmes choix valent pour les vues du staff et des rapports */
    dispExtraHtml() {
      const L = this._esiList || []; if (!L.length || L[0].coverage) return ''; const O = this.esiOpt(), th = Math.round((this.ui.esiThr == null ? 0.6 : this.ui.esiThr) * 100), ck = (k, l, t) => `<label class="chip" title="${t}"><input type="checkbox" data-esio="${k}"${O[k] ? ' checked' : ''}> ${l}</label>`;
      return `<div class="v2-sec"><div class="row" title="imagerie de source affichée : ${esc(L[0].res.title)}"><span>Source</span><div class="chips">${ck('map', 'cortex coloré', 'Cortex coloré par la source (sLORETA)')}${ck('dip', 'dipôle', 'Dipôle équivalent : position et moment')}${ck('ell', 'ellipse 95 %', 'Ellipse de confiance à 95 % du dipôle')}</div></div>
        <div class="row"><span>Seuil de la carte</span><input type="range" data-esithr min="0" max="90" step="5" value="${th}"><b>${th} %</b></div></div>`;
    },
    dispExtraBind(panel) {
      panel.querySelectorAll('[data-esio]').forEach(x => x.onchange = () => { this.esiOpt()[x.dataset.esio] = x.checked; this.esiDraw(); });
      const r = panel.querySelector('[data-esithr]'); if (r) r.oninput = () => { this.ui.esiThr = +r.value / 100; r.nextElementSibling.textContent = r.value + ' %'; clearTimeout(this._esiT); this._esiT = setTimeout(() => this.esiDraw(), 120); };
    },
    /** résumé d'un résultat (après calcul) pour la liste et les comptes rendus */
    esiSummary(sol, H) {
      const d = sol.dip; return { peak: sol.peak, top: sol.top.map(t => ({ name: t.name, w: t.w })), dipole: { region: d.region, gof: r3(d.gof), ci: d.ci.r.map(x => Math.round(x * 10) / 10), cortex: Math.round(d.cortex * 10) / 10, near: d.near ? { name: d.near.name, d: Math.round(d.near.d * 10) / 10 } : null, p: d.p.map(x => Math.round(x * 10) / 10), space: H.space },
        lcmv: sol.lcmv ? sol.lcmv.region : null, conc: sol.conc, white: sol.white, head: H.info };
    },

    // ================================================================ visionneuse : signaux et état des onglets
    /** voies analysées : électrodes 10-20 (scalp) ou plots localisés (SEEG), hors voies mauvaises ou exclues */
    esiChans(V) {
      const ch = V.mem.channels, xc = new Set(((V.rec.ei || {}).excludedContacts) || []), ok = (c, i) => !/bad/i.test(c.status || '') && !xc.has(c.name);
      if (sc(V)) return E.scalpChannels(ch.map(c => c.name)).filter(x => ok(ch[x.i], x.i)).map(x => ({ i: x.i, name: x.name }));
      const pos = this.esiContactPos(ch.map(c => c.name), V.rec); return ch.map((c, i) => ({ i, name: c.name, p: pos.get(c.name) })).filter(x => x.p && IE.isSeegChannel(ch[x.i]) && ok(ch[x.i], x.i));
    },
    /** signaux bruts [a, b[ (s) des voies → Float32Array[] */
    esiRaw(V, chans, a, b) { const fs = V.mem.fs, i0 = Math.max(0, Math.round(a * fs)), i1 = Math.min(V.mem.nSamples, Math.round(b * fs)); return chans.map(c => V.mem.data[c.i].slice(i0, i1)); },
    esiP(slot) {
      const V = this._iev, rec = V.rec, dur = V.mem.duration, mk = rec.marks || {}; rec[slot] = rec[slot] || {};
      const P = rec[slot].params || (rec[slot].params = slot === 'esp' ? { start: 0, end: Math.min(dur, 3600), k: 5, corr: 0.85, f1: 1, f2: sc(V) ? 35 : 45 } : { off: 0, len: sc(V) ? 3 : 2, band: 'auto', f1: 4, f2: 8 });
      if (slot === 'esp') { if (!P.det) P.det = 'janca'; if (P.k1 == null) P.k1 = 3.65; if (P.thr == null) P.thr = 0.5;
        if (P.v !== 6) { if (sc(V)) P.det = 'spikenet'; P.v = 6; } if (!sc(V) && P.det === 'spikenet') P.det = 'janca'; }   // v5.6 : SpikeNet au scalp, Janča en SEEG
      if (slot !== 'esp' && mk.onset == null) P.noOnset = true; else delete P.noOnset; return P;
    },
    esiKey() { const V = this._iev; return sc(V) ? 'scalp' : 'seeg'; },

    // ---------------------------------------------------------------- onglet « Pointes → source »
    async esiSpikeDetect(o) {
      const V = this._iev, rec = V.rec, P = this.esiP('esp'), fs = V.mem.fs, ch = this.esiChans(V); if (ch.length < (sc(V) ? 8 : 6)) { this.toast(sc(V) ? 'Moins de 8 électrodes 10-20 reconnues dans ce tracé' : 'Moins de 6 plots localisés : vérifier la correspondance avec le schéma et la localisation des électrodes', 6000); return; }
      const old = rec.esp && rec.esp.last, mode = old && old.n && !(o && o.replace) ? await this.esiAskMode(old) : 'replace'; if (!mode) return;   // pointes déjà détectées : les garder (ajouter) ou les remplacer
      V.mbusy = 'esp'; V.mprog = 0; V.mcancel = false; this.esiRender();
      try {
        const a = clamp(+P.start || 0, 0, V.mem.duration), b = clamp(+P.end || V.mem.duration, a + 5, V.mem.duration), X = this.esiRaw(V, ch, a, b);
        const O = { det: P.det, k1: +P.k1 || 3.65, line: V.notch || V.mem.line || V.rec.line || 50, minCh: sc(V) ? 2 : 1 }; let SN = null;
        if (P.det === 'spikenet') { const C19 = this.esiSnChans(V);
          if (C19.n < 15) { this.toast(`SpikeNet demande les 19 électrodes 10-20 en référentiel (${C19.n} trouvées, 4 manquantes au plus) : détecteur de Janča utilisé`, 7000); O.det = 'janca'; }
          else { SN = await this.esiSpikeNetScan(V, C19, a, b, O.line, P); if (this._iev !== V || V.mcancel) return; O.times = SN.ev.map(e => Math.round(e.t * fs)); O.amps = SN.ev.map(e => e.p); O.srch = 0.4; } }
        const R = SV.Work && SV.Work.available ? await SV.Work.run(['esi'], 'ESI.spikeScan', [X, fs, +P.f1, +P.f2, +P.k, O], [], p => { if (!SN) { V.mprog = p; this.ieegMProg(); } }) : E.spikeScan(X, fs, +P.f1, +P.f2, +P.k, O);
        if (this._iev !== V || V.mcancel) return;
        // crises marquées du tracé écartées (−5 s, +30 s) : l'analyse des pointes reste intercritique
        const SW = this.ieegSzWins ? this.ieegSzWins(rec).map(([u, v]) => [Math.max(u, a), Math.min(v, b)]).filter(([u, v]) => v > u) : [], inSz = t => SW.some(([u, v]) => t >= u && t <= v), keep = R.ev.map((e, i) => inSz(a + e.t / fs) ? -1 : i).filter(i => i >= 0);
        R.ev = keep.map(i => R.ev[i]); R.topo = keep.map(i => R.topo[i]);
        let vetoed = null; const FW = SN && P.adapt && rec.esp.adapt; if (FW) { const N = SV.SpikeNet, J = this.asset('spikenet1'), W = { w: Float64Array.from(FW.wd), b: FW.bd }, ok = R.ev.map(e => { const f = this.esiSnFeat(J, V.snD, a + e.t / fs); return !f || N.head(W, f) >= (+P.thr || 0.5); });   // filtre propre au patient
          vetoed = ok.filter(x => !x).length; R.ev = R.ev.filter((_, i) => ok[i]); R.topo = R.topo.filter((_, i) => ok[i]); }
        let A0 = a, ev = R.ev.map(e => ({ t: a + e.t / fs, c: e.c, amp: e.amp, pol: e.pol, d: R.det })), topo = R.topo, spans = [[a, b]], dets = [R.det];
        const man = mode === 'replace' && old && old.events ? old.events.filter(e => e.m && !e.x && e.t >= a && e.t <= b) : [];   // ajouts à la main gardés
        if (mode === 'add' || man.length) {   // pointes des deux détections (ou ajouts à la main) réunies (une seule à moins de 150 ms), topographies recalculées sur l'ensemble
          const M0 = (mode === 'add' ? old.events.filter(e => !e.x) : man).map(e => ({ t: e.t, amp: e.amp, d: e.m ? 'manual' : e.d || old.det })), U0 = M0.concat(ev).sort((x, y) => x.t - y.t), U = [];
          for (const e of U0) { const l = U[U.length - 1]; if (l && e.t - l.t < 0.15) { if (!l.d.split('+').includes(e.d)) l.d = l.d.split('+').concat(e.d).sort().join('+'); if (e.amp > l.amp && e.d === R.det) { l.t = e.t; } } else U.push(Object.assign({}, e)); }
          if (mode === 'add') spans = E.mergeSpans((old.spans || [[old.start, old.end]]).concat(spans)); A0 = spans[0][0]; const B0 = spans[spans.length - 1][1], X2 = this.esiRaw(V, ch, A0, B0);
          const O2 = { times: U.map(e => Math.round((e.t - A0) * fs)), amps: U.map(e => e.amp), det: 'ext' }, R2 = SV.Work && SV.Work.available ? await SV.Work.run(['esi'], 'ESI.spikeScan', [X2, fs, +P.f1, +P.f2, +P.k, O2], []) : E.spikeScan(X2, fs, +P.f1, +P.f2, +P.k, O2);
          if (this._iev !== V || V.mcancel) return; ev = R2.ev.map((e, i) => ({ t: A0 + e.t / fs, c: e.c, amp: U[i] ? U[i].amp : e.amp, pol: e.pol, d: U[i] ? U[i].d : R.det })); topo = R2.topo; if (mode === 'add') dets = [...new Set((old.dets || [old.det]).concat(R.det))];
        }
        const SWa = spans.flatMap(([u0, v0]) => SW.map(([u, v]) => [Math.max(u, u0), Math.min(v, v0)]).filter(([u, v]) => v > u)), mins = Math.max(0.1, (spans.reduce((q, [u, v]) => q + v - u, 0) - SWa.reduce((q, [u, v]) => q + v - u, 0)) / 60);
        const cl = E.clusterTopos(topo.map(t => Float32Array.from(t)), +P.corr || 0.85, 3), multi = dets.length > 1;
        const evs = ev.map(e => Object.assign({ t: r3(e.t), c: ch[e.c].name, amp: Math.round(e.amp * 10) / 10, pol: e.pol }, multi && e.d !== 'manual' ? { d: e.d } : {}, e.d === 'manual' ? { m: 1 } : {}));
        if (mode === 'replace' && old && old.n) rec.esp.prev = old;   // détection remplacée : rétablissable
        rec.esp.last = { at: ST.now(), det: multi ? dets.join('+') : R.det, dets, spans, start: A0, end: spans[spans.length - 1][1], mins: Math.round(mins * 100) / 100, szOut: SW.length, fs, pm: SN ? SN.pm : null, adapted: vetoed != null, vetoed, interp: SN && SN.interp.length ? SN.interp : null, chans: ch.map(c => c.name), n: evs.length, events: evs.slice(0, 4000), clusters: cl.slice(0, 8).map((c, k) => ({ k, idx: c.idx, n: c.idx.length, rate: Math.round(c.idx.length / mins * 100) / 100, topo: Array.from(c.topo, sig4) })), params: Object.assign({}, P),
          noise: R.noise ? R.noise.map(sig4) : null, noiseSec: R.sec ? Math.round(R.sec) : null };
        V.espSel = rec.esp.last.clusters.length ? 0 : null; V.espAvg = null; V.dirty = true;
        if (V.espSel != null) await this.esiSpikeAverage(0);
      } catch (e) { console.error(e); this.toast('Détection : ' + e.message, 6000); }
      finally { if (this._iev === V) { V.mbusy = null; this.esiRender(); this.ieegDraw(); } }
    },
    /** pointe moyennée d'un groupe (époques filtrées avec 1 s de marge), temps caractéristiques, ESI à mi-montée */
    async esiSpikeAverage(k) {
      const V = this._iev, rec = V.rec, Lr = rec.esp && rec.esp.last; if (!Lr || !Lr.clusters[k]) return; const fs = V.mem.fs, P = Lr.params, ch = this.esiChans(V).filter(c => Lr.chans.includes(c.name)), pre = Math.round(0.3 * fs), post = Math.round(0.3 * fs), pad = Math.round(1 * fs);
      const times = Lr.clusters[k].idx.map(i => Lr.events[i]).filter(Boolean).map(e => Math.round(e.t * fs)), acc = ch.map(() => new Float64Array(pre + post)), m = ch.length, w = Math.round(0.1 * fs), Cd = new Float64Array(m * m); let n = 0, nd = 0;
      for (const t of times) { const i0 = t - pre - pad, i1 = t + post + pad; if (i0 < 0 || i1 > V.mem.nSamples) continue; const Y = E.avgRefData(ch.map(c => E.bandpass(V.mem.data[c.i].subarray(i0, i1), fs, P.f1, P.f2))); for (let i = 0; i < m; i++) for (let q = 0; q < pre + post; q++) acc[i][q] += Y[i][pad + q]; n++;
        const C1 = E.covariance(Y, pad + pre - w, pad + pre + w); for (let q = 0; q < m * m; q++) Cd[q] += C1[q]; nd++; }   // covariance des données autour de la pointe (formeur de voie)
      const avg = acc.map(a => { const y = Float32Array.from(a, v => v / (n || 1)); let b = 0; for (let q = 0; q < pre / 2; q++) b += y[q]; b /= pre / 2; return y.map(v => v - b); });
      const T = E.spikeTimes(avg, fs, pre), pc = E.pca(avg, T.onset, Math.min(avg[0].length, T.peak + Math.round(0.02 * fs)));
      const names = ch.map(c => c.name), noise = Lr.noise && Lr.chans ? subCov(Lr.noise, Lr.chans, names) : null;
      V.espSel = k; V.espAvg = { k, avg, fs, pre, n, T, names, chans: ch, pc1: pc.explained[0], noise, dataCov: nd ? Cd.map(x => x / nd) : null };
      const vHalf = avg.map(a => a[T.half]); V.espSol = { busy: true }; this.esiRender();
      try { const H = sc(V) ? await this.esiScalpHead(names.filter(x => E.STD[x])) : this.esiSeegHead(ch.map(c => ({ name: c.name, p: c.p }))), v = H.names.map(nm => vHalf[names.indexOf(nm)]), X = { noise: subCov(V.espAvg.noise, names, H.names), data: subCov(V.espAvg.dataCov, names, H.names) };
        if (this._iev === V && V.espAvg.k === k) V.espSol = { H, sol: this.esiSolve(H, v, null, X.noise && sc(V) ? 1 / 9 : 0.05, X), v }; }
      catch (e) { console.warn(e); V.espSol = { err: e.message }; }
      this.esiRender();
    },
    /** taux des pointes de chaque groupe par stade du sommeil (/min de ce stade, crises écartées) */
    esiStageRates(rec, Lr) {
      const SW = this.ieegSzWins ? this.ieegSzWins(rec) : [], mins = this.slpMinutes(rec, Lr.start, Lr.end, SW), K = ['W', '1', '2', '3', 'R'], N = { W: 'éveil', 1: 'N1', 2: 'N2', 3: 'N3', R: 'SP' }, cl = this.esiEvCluster(Lr);
      const cnt = Lr.clusters.map(() => ({ W: 0, 1: 0, 2: 0, 3: 0, R: 0 })); Lr.events.forEach((e, i) => { const k = cl[i], st = this.slpAt(rec, e.t); if (k >= 0 && st) cnt[k][st]++; });
      const col = K.filter(k => mins[k] >= 1);
      return `<table class="esi-st" title="pointes par minute de chaque stade (stadification de l’onglet Sommeil ; minutes de stade entre parenthèses)"><tr><th></th>${col.map(k => `<th>${N[k]} <small>(${nf(mins[k], 0)})</small></th>`).join('')}</tr>${Lr.clusters.map((c, k) => `<tr><td><i class="esi-dot" style="background:${CL_PAL[k % CL_PAL.length]}"></i>${k + 1}</td>${col.map(s => `<td>${nf(cnt[k][s] / mins[s], 1)}</td>`).join('')}</tr>`).join('')}</table>`;
    },
    /** groupe de chaque pointe (−1 : hors groupe), en cache sur le résultat */
    esiEvCluster(Lr) { if (Lr._cl && Lr._clRev === Lr.clusters) return Lr._cl; const a = new Int16Array(Lr.events.length).fill(-1); Lr.clusters.forEach((c, k) => c.idx.forEach(i => { if (i < a.length) a[i] = k; })); Object.defineProperty(Lr, '_cl', { value: a, configurable: true, writable: true }); Object.defineProperty(Lr, '_clRev', { value: Lr.clusters, configurable: true, writable: true }); return a; },
    /** groupes sélectionnés (au moins le groupe courant) */
    esiClSel(V) { const Lr = V.rec.esp && V.rec.esp.last, n = Lr ? Lr.clusters.length : 0; V.espSet = new Set([...(V.espSet || [])].filter(k => k < n)); if (!V.espSet.size && V.espSel != null && V.espSel < n) V.espSet.add(V.espSel); return V.espSet; },
    /** groupes renumérotés après fusion ou suppression (k = rang), taux recalculés */
    esiClReset(Lr) { Lr.edits = []; Lr.events.forEach(e => { if (e.x) delete e.g; }); },
    esiClRenum(Lr) { const mins = Lr.mins || (Lr.end - Lr.start) / 60 || 1; Lr.clusters.forEach((c, k) => { c.k = k; c.n = c.idx.length; c.rate = Math.round(c.n / mins * 100) / 100; }); },
    async esiClMerge(ks) {
      const V = this._iev, Lr = V.rec.esp.last; ks = ks.filter(k => Lr.clusters[k]).sort((a, b) => a - b); if (ks.length < 2) return; const C = ks.map(k => Lr.clusters[k]), N = C.reduce((a, c) => a + c.idx.length, 0);
      const topo = C[0].topo.map((_, i) => sig4(C.reduce((a, c) => a + c.topo[i] * c.idx.length, 0) / N));
      Lr.clusters[ks[0]] = { idx: [...new Set(C.flatMap(c => c.idx))].sort((a, b) => a - b), topo, parts: C.flatMap(c => c.parts || [{ idx: c.idx, topo: c.topo }]) }; Lr.clusters = Lr.clusters.filter((c, k) => !ks.slice(1).includes(k)); this.esiClReset(Lr); this.esiClRenum(Lr);
      V.espSet = new Set([ks[0]]); V.dirty = true; this.toast(`${ks.length} groupes fusionnés : groupe ${ks[0] + 1} (${N} pointes)`, 3000); await this.esiSpikeAverage(ks[0]); this.ieegDraw();
    },
    async esiClDelete(ks) {
      const V = this._iev, Lr = V.rec.esp.last; if (!ks.length) return; Lr.rej = (Lr.rej || []).concat(ks.flatMap(k => (Lr.clusters[k] ? Lr.clusters[k].idx : []).filter(i => Lr.events[i] && !Lr.events[i].m).map(i => Lr.events[i].t)));   // pointes détectées rejetées : négatives de l'adaptation
      Lr.del = (Lr.del || []).concat(ks.map(k => Lr.clusters[k]).filter(Boolean)); Lr.clusters = Lr.clusters.filter((c, k) => !ks.includes(k)); this.esiClReset(Lr); this.esiClRenum(Lr); V.espSet = new Set(); V.espSel = Lr.clusters.length ? 0 : null; V.espAvg = null; V.espSol = null; V.dirty = true;   // groupes supprimés : rétablissables (Lr.del)
      if (V.espSel != null) await this.esiSpikeAverage(0); else this.esiRender(); this.ieegDraw();
    },
    // ---------------------------------------------------------------- relecture des pointes une à une (après la détection)
    /** pointe courante du groupe choisi → { Lr, c, i (indice de l'évènement), e } */
    esiCur(V) { const Lr = V.rec.esp && V.rec.esp.last, c = Lr && Lr.clusters[V.espSel]; if (!c || !c.idx.length) return null; V.espI = clamp(V.espI || 0, 0, c.idx.length - 1); const i = c.idx[V.espI]; return { Lr, c, i, e: Lr.events[i] }; },
    /** pointe précédente / suivante du groupe, centrée dans le tracé */
    esiSpikeGo(d) {
      const V = this._iev, C = this.esiCur(V);
      if (V.espManOnly) { const L = this.esiManList(V.rec.esp.last); if (!L.length) return; const t0 = C ? C.e.t : V.t + V.page / 2, j = d > 0 ? L.findIndex(m => m.e.t > t0 + 1e-3) : L.map(m => m.e.t < t0 - 1e-3).lastIndexOf(true); this.esiSpikeFocus((L[j] || L[d > 0 ? 0 : L.length - 1]).i); return; }
      if (!C) return; V.espI = (V.espI + d + C.c.idx.length) % C.c.idx.length; this.ieegGotoT(null, C.Lr.events[C.c.idx[V.espI]].t); this.esiRender(); this.esiRevShow();
    },
    /** l'évènement i devient la pointe courante (groupe changé : pointe moyennée refaite), centré dans le tracé */
    esiSpikeFocus(i) {
      const V = this._iev, Lr = V.rec.esp.last, e = Lr.events[i], k = this.esiEvCluster(Lr)[i]; if (!e) return; this.ieegGotoT(null, e.t);
      if (k >= 0) { const ch = V.espSel !== k; V.espSel = k; V.espSet = new Set([k]); V.espI = Lr.clusters[k].idx.indexOf(i); if (ch) { this.esiSpikeAverage(k); this.esiRevShow(); return; } }
      this.esiRender(); this.ieegDraw(); this.esiRevShow();
    },
    /** ajouts à la main (non retirés) et pointes détectées retirées, par ordre chronologique */
    esiManList(Lr) { const cl = this.esiEvCluster(Lr); return Lr.events.map((e, i) => ({ e, i, k: cl[i] })).filter(m => m.e.m && !m.e.x).sort((a, b) => a.e.t - b.e.t); },
    esiRmList(Lr) { return Lr.events.map((e, i) => ({ e, i })).filter(m => m.e.x && !m.e.m).sort((a, b) => a.e.t - b.e.t); },
    /** la barre de relecture reste visible dans le panneau quand on parcourt, retire ou ajoute des pointes */
    esiRevShow() { const V = this._iev; setTimeout(() => { const s = V && V.sb && V.sb.querySelector('.esi-rev'); if (s) s.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 0); },
    /** une pointe détectée à tort retirée de son groupe (elle rejoint les négatives du filtre propre au patient) ; un ajout à la main retiré disparaît */
    esiSpikeRemove(i) {
      const V = this._iev, Lr = V.rec.esp.last, k = this.esiEvCluster(Lr)[i]; if (k == null || k < 0) return; const c = Lr.clusters[k], pos = c.idx.indexOf(i); if (pos < 0) return;
      const e = Lr.events[i]; c.idx.splice(pos, 1); e.x = 1; if (!e.m) { e.g = k; (Lr.rej = Lr.rej || []).push(e.t); } if (V.espSel === k) V.espI = Math.min(pos, Math.max(0, c.idx.length - 1));
      this.esiEditDone(Lr, { op: 'rm', i, k, pos });
      if (V.espManOnly && e.m) { const L = this.esiManList(Lr), nx = L.find(m => m.e.t > e.t) || L[0]; if (nx) this.esiSpikeFocus(nx.i); }   // relecture des ajouts : l'ajout suivant
    },
    /** pointe ajoutée à la main à l'instant t : composante aiguë cherchée à ± 200 ms (maximum de la GFP), topographie ;
     *  rangée dans le groupe choisi, sinon dans celui de topographie la plus proche */
    esiEvTopo(V, Lr, t, srch) {
      const fs = V.mem.fs, P = Lr.params || this.esiP('esp'), by = new Map(this.esiChans(V).map(c => [c.name, c])), chs = Lr.chans.map(n => by.get(n)).filter(Boolean);
      if (chs.length !== Lr.chans.length) { this.toast('Voies du tracé différentes de celles de la détection : relancer la détection', 4000); return null; }
      const a = Math.max(0, t - 1), b = Math.min(V.mem.duration, t + 1), R = E.spikeScan(this.esiRaw(V, chs, a, b), fs, +P.f1 || 1, +P.f2 || 45, +P.k || 5, { times: [Math.round((t - a) * fs)], amps: [1], srch, det: 'manual' }), ev = R.ev[0];
      if (!ev) return null; const topo = R.topo[0];
      return { t: r3(a + ev.t / fs), c: chs[ev.c].name, amp: Math.round(ev.amp * 10) / 10, pol: ev.pol, corr: c => { let sa = 0, sb = 0, sab = 0; for (let j = 0; j < topo.length; j++) { sa += topo[j] * topo[j]; sb += c.topo[j] * c.topo[j]; sab += topo[j] * c.topo[j]; } return Math.abs(sab) / Math.sqrt(sa * sb || 1); } };
    },
    esiBestCl(Lr, T) { let k = -1; Lr.clusters.forEach((c, j) => { if (k < 0 || T.corr(c) > T.corr(Lr.clusters[k])) k = j; }); return k; },
    esiClInsert(Lr, k, i) { const c = Lr.clusters[k], t = Lr.events[i].t; let pos = c.idx.findIndex(j => Lr.events[j].t > t); if (pos < 0) pos = c.idx.length; c.idx.splice(pos, 0, i); return pos; },
    async esiSpikeAdd(t) {
      const V = this._iev, Lr = V.rec.esp && V.rec.esp.last; if (!Lr) return; const P = Lr.params || this.esiP('esp'), T = this.esiEvTopo(V, Lr, t, 0.2); if (!T) return;
      const cl = this.esiEvCluster(Lr), dup = Lr.events.findIndex(e => !e.x && Math.abs(e.t - T.t) < 0.15);
      if (dup >= 0 && cl[dup] >= 0) { this.toast('Pointe déjà détectée ici : elle devient la pointe courante', 3000); this.esiSpikeFocus(dup); return; }
      const k = V.espSel != null && Lr.clusters[V.espSel] ? V.espSel : this.esiBestCl(Lr, T); if (k < 0) { this.toast('Aucun groupe où ranger la pointe', 3000); return; }
      const i = Lr.events.push({ t: T.t, c: T.c, amp: T.amp, pol: T.pol, m: 1 }) - 1, pos = this.esiClInsert(Lr, k, i);
      V.espSel = k; V.espSet = new Set([k]); V.espI = pos; this.esiEditDone(Lr, { op: 'add', i, k, pos });
      this.toast(`◆ Pointe ajoutée au groupe ${k + 1} (${clock(T.t)}${T.corr(Lr.clusters[k]) < (+P.corr || 0.85) ? ', topographie peu semblable au groupe' : ''})`, 3000);
    },
    /** ajout à la main rangé dans un autre groupe */
    esiSpikeMove(i, k) {
      const V = this._iev, Lr = V.rec.esp.last, k0 = this.esiEvCluster(Lr)[i]; if (k0 === k || !Lr.clusters[k]) return; const p0 = k0 >= 0 ? Lr.clusters[k0].idx.indexOf(i) : -1; if (p0 >= 0) Lr.clusters[k0].idx.splice(p0, 1);
      const pos = this.esiClInsert(Lr, k, i); V.espSel = k; V.espSet = new Set([k]); V.espI = pos; this.esiEditDone(Lr, { op: 'mv', i, k, k0, p0 });
    },
    /** pointe détectée retirée remise dans son groupe d'origine (sinon dans le groupe de topographie la plus proche) */
    esiSpikeRestore(i) {
      const V = this._iev, Lr = V.rec.esp.last, e = Lr.events[i]; if (!e || !e.x || e.m) return; let k = e.g != null && Lr.clusters[e.g] ? e.g : -1;
      if (k < 0) { const T = this.esiEvTopo(V, Lr, e.t, 0.02); if (!T) return; k = this.esiBestCl(Lr, T); } if (k < 0) return;
      delete e.x; delete e.g; const r = (Lr.rej || []).lastIndexOf(e.t); if (r >= 0) Lr.rej.splice(r, 1); const pos = this.esiClInsert(Lr, k, i);
      V.espSel = k; V.espSet = new Set([k]); V.espI = pos; this.esiEditDone(Lr, { op: 'rs', i, k, pos });
    },
    /** après une modification : compte, taux, marques ; la pointe moyennée du groupe est recalculée (une fois les retouches finies) */
    esiEditDone(Lr, ed) {
      const V = this._iev; if (ed) Lr.edits = (Lr.edits || []).concat(ed).slice(-200); Lr.clusters = Lr.clusters.slice(); Lr.n = Lr.events.filter(e => !e.x).length; this.esiClRenum(Lr); V.dirty = true;
      const k = ed ? ed.k : V.espSel; if (k === V.espSel && k != null) { clearTimeout(this._espAvgT); this._espAvgT = setTimeout(() => { if (this._iev === V && V.espSel === k) this.esiSpikeAverage(k); }, 900); }
      this.esiRender(); this.ieegDraw(); this.esiRevShow();
    },
    /** dernière retouche annulée */
    esiEditUndo() {
      const V = this._iev, Lr = V.rec.esp.last, ed = (Lr.edits || []).pop(); if (!ed) return; const c = Lr.clusters[ed.k], e = Lr.events[ed.i]; if (!c || !e) return;
      const out = () => { const p = c.idx.indexOf(ed.i); if (p >= 0) c.idx.splice(p, 1); };
      if (ed.op === 'rm') { c.idx.splice(Math.min(ed.pos, c.idx.length), 0, ed.i); delete e.x; delete e.g; if (!e.m) { const r = (Lr.rej || []).lastIndexOf(e.t); if (r >= 0) Lr.rej.splice(r, 1); } }
      else if (ed.op === 'add') { out(); if (ed.i === Lr.events.length - 1) Lr.events.pop(); else e.x = 1; }
      else if (ed.op === 'mv') { out(); const c0 = Lr.clusters[ed.k0]; if (c0) c0.idx.splice(Math.min(Math.max(ed.p0, 0), c0.idx.length), 0, ed.i); }
      else if (ed.op === 'rs') { out(); e.x = 1; e.g = ed.k; (Lr.rej = Lr.rej || []).push(e.t); }
      const k = ed.op === 'mv' && Lr.clusters[ed.k0] ? ed.k0 : ed.k, p = Lr.clusters[k] ? Lr.clusters[k].idx.indexOf(ed.i) : -1; V.espSel = k; V.espSet = new Set([k]); if (p >= 0) V.espI = p; this.esiEditDone(Lr, null);
    },
    /** groupe fusionné rendu à ses groupes d'origine */
    async esiClSplit(k) {
      const V = this._iev, Lr = V.rec.esp.last, c = Lr.clusters[k]; if (!c || !c.parts) return;
      Lr.clusters.splice(k, 1, ...c.parts.map(p => ({ idx: p.idx.filter(i => c.idx.includes(i)), topo: p.topo }))); this.esiClReset(Lr); this.esiClRenum(Lr); V.espSet = new Set(c.parts.map((_, i) => k + i)); V.dirty = true;
      this.toast(`Groupe ${k + 1} dégroupé en ${c.parts.length} groupes`, 3000); await this.esiSpikeAverage(k); this.ieegDraw();
    },
    /** groupes supprimés rétablis (et retirés des négatives de l'adaptation) */
    async esiClRestore() {
      const V = this._iev, Lr = V.rec.esp.last, D = Lr.del || []; if (!D.length) return; const back = new Set(D.flatMap(c => c.idx.map(i => Lr.events[i] && Lr.events[i].t)));
      Lr.clusters = Lr.clusters.concat(D); Lr.del = []; Lr.rej = (Lr.rej || []).filter(t => !back.has(t)); this.esiClReset(Lr); this.esiClRenum(Lr); V.dirty = true; this.toast(`${D.length} groupe${D.length > 1 ? 's' : ''} rétabli${D.length > 1 ? 's' : ''}`, 3000); this.esiRender(); this.ieegDraw();
    },
    /** pointes déjà détectées sur ce tracé : les garder en ajoutant la nouvelle détection, ou les remplacer → 'add' | 'replace' | null */
    esiAskMode(Lr) {
      return new Promise(res => { const det = { spikenet: 'SpikeNet', janca: 'Janča', morph: 'morphologique' }, nm = String(Lr.det || '').split('+').map(x => det[x] || x).join(' + ');
        const box = document.createElement('div'); box.className = 'modal'; box.innerHTML = `<div class="modal-card" style="max-width:520px"><div class="modal-head"><span>Pointes déjà détectées sur ce tracé</span><button class="close">✕</button></div>
          <p>${esc(nm)} : <b>${Lr.n}</b> pointes, ${Lr.clusters.length} groupe${Lr.clusters.length > 1 ? 's' : ''}${Lr.at ? ' (' + new Date(Lr.at).toLocaleDateString(SV.LOC) + ')' : ''}.</p>
          <p class="muted small">Ajouter : les pointes des deux détections sont réunies (une seule à moins de 150 ms ; chaque pointe garde le nom de son détecteur), puis regroupées. Remplacer : la détection actuelle reste rétablissable depuis le panneau.</p>
          <div class="btnrow"><span class="spacer"></span><button class="close">Annuler</button><button data-m="replace">Remplacer</button><button class="primary" data-m="add">Ajouter aux pointes existantes</button></div></div>`;
        document.body.appendChild(box); box.hidden = false; const done = m => { box.remove(); res(m); };
        box.querySelectorAll('.close').forEach(b => b.onclick = () => done(null)); box.querySelectorAll('[data-m]').forEach(b => b.onclick = () => done(b.dataset.m)); });
    },
    /** détection remplacée : rétablie (l'actuelle devient la précédente) */
    esiSpikeUndo() { const V = this._iev, E0 = V.rec.esp; if (!E0.prev) return; [E0.last, E0.prev] = [E0.prev, E0.last]; V.espSel = E0.last.clusters.length ? 0 : null; V.espSet = new Set(); V.espAvg = null; V.espSol = null; V.dirty = true; if (V.espSel != null) this.esiSpikeAverage(0); else this.esiRender(); this.ieegDraw(); },
    /** SpikeNet : électrodes du modèle (Fp1 … O2) trouvées dans le tracé (T3/T7, T4/T8, T5/P7, T6/P8 équivalentes) */
    esiSnChans(V) { const J = this.asset('spikenet1'), by = new Map(this.esiChans(V).map(c => [c.name, c])), syn = { T3: 'T7', T4: 'T8', T5: 'P7', T6: 'P8' }, L = J ? J.mono.map(n => by.get(n) || by.get(syn[n]) || null) : []; return { L, n: L.filter(Boolean).length }; },
    /** SpikeNet sur [a, b] : 19 voies filtrées à 128 Hz (un worker), fenêtres de 1 s tous les 62,5 ms (31 ms en mode fin)
     *  réparties par minutes sur les workers → { ev: [{ t (s depuis a), p }], pm (probabilité maximale par seconde, %),
     *  interp (électrodes interpolées) } ; voies à 128 Hz gardées (V.snD) pour le filtre propre au patient */
    async esiSpikeNetScan(V, C19, a, b, line, P) {
      const J = this.asset('spikenet1'), N = SV.SpikeNet, fs = V.mem.fs, i0 = Math.round(a * fs), i1 = Math.min(V.mem.nSamples, Math.round(b * fs)), present = C19.L.map(Boolean);
      const X = C19.L.map(c => c ? V.mem.data[c.i].slice(i0, i1) : null), step = P.fine ? 4 : 8;
      if (C19.n < 19) { const nm = J.mono, pr = nm.filter((_, k) => X[k]), mi = nm.filter((_, k) => !X[k]), Wt = E.splineWeights(pr, mi), src = X.filter(Boolean);   // électrodes manquantes : spline sphérique
        mi.forEach((m, r) => { const y = new Float32Array(i1 - i0); src.forEach((x, j) => { const w = Wt[r][j]; for (let i = 0; i < y.length; i++) y[i] += w * x[i]; }); X[nm.indexOf(m)] = y; }); present.fill(true); }
      const opt = { present };
      const pool = SV.Work && SV.Work.available ? SV.Work.pool(['spikenet']) : null, prog = p => { V.mprog = p; this.ieegMProg(); };
      try {
        const D = pool ? await pool.call('SpikeNet.prep', [J, X, fs, line], [], p => prog(0.1 * p)) : N.prep(J, X, fs, line); if (this._iev !== V || V.mcancel) return { ev: [] };
        const n = D[0].length, CH = 7680, jobs = []; let done = 0;
        for (let s0 = 0; s0 + N.W <= n; s0 += CH) { const e = Math.min(n, s0 + CH + N.W - step), sl = D.map(d => d.slice(s0, e));
          jobs.push((pool ? pool.call('SpikeNet.scan', [J, sl, step, opt]) : Promise.resolve(N.scan(J, sl, step, opt))).then(r => { prog(0.1 + 0.85 * (++done) / jobs.length); return r.p; })); }
        const parts = await Promise.all(jobs), P0 = new Float32Array(parts.reduce((q, x) => q + x.length, 0)); let o = 0; for (const x of parts) { P0.set(x, o); o += x.length; }
        const pm = new Array(Math.ceil((i1 - i0) / fs)).fill(0); for (let w = 0; w < P0.length; w++) { const k = Math.floor((w * step + N.W / 2) / N.FS); if (k < pm.length) pm[k] = Math.max(pm[k], Math.round(P0[w] * 100)); }
        V.snD = { D, a, line, present, step }; return { ev: N.events(P0, step, +P.thr || 0.5, 0), pm, interp: J.mono.filter((_, k) => !C19.L[k]) };
      } finally { if (pool) pool.close(); }
    },
    /** descripteurs (256) de SpikeNet pour la fenêtre de 1 s centrée sur t (s), voies à 128 Hz de la dernière détection */
    esiSnFeat(J, S0, t) { const N = SV.SpikeNet, c = Math.round((t - S0.a) * N.FS) - N.W / 2; if (c < 0 || c + N.W > S0.D[0].length) return null; return N.scan(J, S0.D.map(d => d.subarray(c, c + N.W)), 4, { present: S0.present, feat: true }).f.slice(0, 256); },
    /** filtre propre au patient (facultatif) : appris sur la relecture — pointes des groupes gardés et des groupes supprimés —,
     *  il retire ensuite des détections de SpikeNet celles qui ressemblent aux rejetées (artefact récurrent, variante bénigne
     *  du tracé) ; SpikeNet lui-même, entraîné une fois pour tous les patients, est inchangé. Classifieur logistique sur les
     *  256 descripteurs de la fenêtre centrée (spikenet.js : fitHead), validation croisée en 5 parts : retenu si ≥ 85 % des
     *  pointes gardées sont conservées et ≥ 50 % des rejetées retirées */
    async esiSpikeNetAdapt() {
      const V = this._iev, rec = V.rec, Lr = rec.esp && rec.esp.last, J = this.asset('spikenet1'), N = SV.SpikeNet; if (!Lr || Lr.det !== 'spikenet') return;
      const pos = Lr.clusters.flatMap(c => c.idx.filter(i => Lr.events[i] && !Lr.events[i].m).map(i => Lr.events[i].t)), neg = Lr.rej || [];
      if (pos.length < 10 || neg.length < 10) { this.toast(`Filtre patient : au moins 10 pointes gardées et 10 rejetées (groupes supprimés) — ici ${pos.length} et ${neg.length}`, 6000); return; }
      const S0 = V.snD; if (!S0 || S0.a !== Lr.start) { this.toast('Filtre patient : relancer d’abord la détection SpikeNet dans cette session', 5000); return; }
      V.mbusy = 'esp'; V.mprog = 0; this.esiRender(); const ui = () => new Promise(r => setTimeout(r, 0)), pc = x => Math.round(x * 100) + ' %';
      try {
        const M0 = N.load(J), thr = +Lr.params.thr || 0.5, Xs = [], ys = [], items = pos.map(t => [t, 1]).concat(neg.map(t => [t, 0]));
        for (let k = 0; k < items.length; k++) { const f = this.esiSnFeat(J, S0, items[k][0]); if (f) { Xs.push(f); ys.push(items[k][1]); } if (k % 40 === 0) { V.mprog = 0.4 * k / items.length; this.ieegMProg(); await ui(); } }
        const cv = N.filterCV(M0, Xs, ys, thr, f => { V.mprog = 0.4 + 0.12 * (f + 1); this.ieegMProg(); });
        if (cv.sens < 0.85 || cv.spec < 0.5) { this.toast(`Filtre non retenu : en validation croisée, il conserverait ${pc(cv.sens)} des pointes gardées et retirerait ${pc(cv.spec)} des rejetées (il faut ≥ 85 % et ≥ 50 %) — détection inchangée`, 10000); V.mbusy = null; this.esiRender(); return; }
        const W = N.fitHead(M0, Xs, ys, Xs.map((_, i) => i)); rec.esp.adapt = { wd: Array.from(W.w, sig4), bd: W.b, nPos: ys.filter(Boolean).length, nNeg: ys.filter(y => !y).length, sens: r3(cv.sens), spec: r3(cv.spec), at: ST.now() };
        Lr.params.adapt = true; this.esiP('esp').adapt = true; V.dirty = true;
      } catch (e) { console.error(e); this.toast('Filtre patient : ' + e.message, 6000); V.mbusy = null; this.esiRender(); return; }
      V.mbusy = null; const n0 = Lr.n; await this.esiSpikeDetect({ replace: true }); const L2 = rec.esp.last, A = rec.esp.adapt;
      if (L2 && L2.adapted) this.toast(`Filtre patient appliqué : ${n0} → ${L2.n} évènements (${L2.vetoed} retirés ; en validation croisée ${pc(A.sens)} des gardées conservées, ${pc(A.spec)} des rejetées retirées)`, 9000);
    },
    /** part d'un groupe parmi les pointes groupées */
    esiClRel(Lr, k) { const tot = Lr.clusters.reduce((a, c) => a + c.idx.length, 0) || 1; return r3(Lr.clusters[k].idx.length / tot); },
    /** exemple de tracé d'un groupe pour le staff et les rapports : 10 s autour d'une pointe d'amplitude médiane (ou de t),
     *  à la densité d'une lecture à 20 s par page (40 px/s pour des voies de 22 px : la pointe garde son aspect aigu), grille
     *  d'une seconde, pointe repérée par une bande de 150 ms, montage et gain affichés, fond clair → { url (JPEG), t } ; crise
     *  (win = fenêtre analysée, t = début) : 3 s avant le début, fenêtre teintée, trait rouge au début */
    esiTracePng(V, k, t, win) {
      const Lr = V.rec.esp && V.rec.esp.last, c = Lr && k != null && Lr.clusters[k]; if (t == null) { if (!c || !c.idx.length) return null; const evs = c.idx.map(i => Lr.events[i]).filter(Boolean).sort((a, b) => a.amp - b.amp), e = evs[evs.length >> 1]; if (!e) return null; t = e.t; }
      const lanes = V.lanes.filter(li => V.D[li].seeg && !V.D[li].bad).slice(0, 24), fs = V.mem.fs, dur = 10, T = V.mem.nSamples / fs, t0 = Math.max(0, Math.min(win ? t - 3 : t - dur / 2, T - dur)), i0 = Math.round(t0 * fs), i1 = Math.min(V.mem.nSamples, Math.round((t0 + dur) * fs));
      const S = 2, lh = 22, pps = 40, G = 58, W = G + dur * pps + 6, H = lanes.length * lh + 22, cv = document.createElement('canvas'); cv.width = W * S; cv.height = H * S;
      const g = cv.getContext('2d'), X = u => G + (u - t0) * pps, col = win ? '#e8590c' : CL_PAL[k % CL_PAL.length], amp = V.amp || 100, ppu = lh / amp, yb = H - 16; g.scale(S, S);
      g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.strokeStyle = '#e3e6ec'; g.lineWidth = 0.6; g.beginPath(); for (let u = Math.ceil(t0); u <= t0 + dur; u++) { g.moveTo(X(u), 2); g.lineTo(X(u), yb); } g.stroke();
      if (win) { g.fillStyle = rgba(col, 0.2); g.fillRect(X(win[0]), 2, X(win[1]) - X(win[0]), yb - 2); g.strokeStyle = '#c92a2a'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(X(t), 2); g.lineTo(X(t), yb); g.stroke(); }   // crise : fenêtre analysée, trait au début
      else { g.fillStyle = rgba(col, 0.38); g.fillRect(X(t - 0.075), 2, X(t + 0.075) - X(t - 0.075), yb - 2); }
      g.font = '9.5px Menlo, monospace'; g.textBaseline = 'middle';
      lanes.forEach((li, j) => { const d = V.D[li], yc = 4 + j * lh + lh / 2, y = this.ieegSeg(d, i0, i1), gn = ((this.ieegVw().gain || {})[d.name]) || 1; g.fillStyle = '#334'; g.fillText(d.name, 3, yc); g.strokeStyle = this.ieegLaneColor(d) || '#14233a'; g.lineWidth = 0.7; g.beginPath(); let m = 0; for (const v of y) m += v; m /= y.length || 1; for (let i = 0; i < y.length; i++) { const x = G + i / (y.length - 1 || 1) * dur * pps, yy = yc - (y[i] - m) * ppu * gn; if (i) g.lineTo(x, yy); else g.moveTo(x, yy); } g.stroke(); });
      g.fillStyle = '#556'; g.font = '9.5px system-ui, sans-serif'; g.fillText(`${clock(t0)} · 10 s, lu à 20 s/page · ${amp >= 1000 ? nf(amp / 1000, 1) + ' mV' : amp + ' µV'} par voie · ${V.montage === 'banana' ? 'double banane' : V.montage === 'avg' ? 'référence moyenne' : V.montage === 'lap' ? 'laplacien' : V.montage === 'trans' ? 'transverse' : V.montage}`, G, H - 7);
      return { url: cv.toDataURL('image/jpeg', 0.86), t };
    },
    /** extraits enregistrés avant la v5.7 (3 s étirées sur toute la largeur) refaits à l'ouverture du tracé, si le groupe de
     *  pointes est toujours celui du résultat (même couleur, même effectif à 2 % près) ; début de crise sans extrait : ajouté */
    esiTraceUpgrade() {
      const V = this._iev, ex = this.ieegEx(), Lr = V && V.rec && V.rec.esp && V.rec.esp.last; if (!Lr || !ex || !V.lanes) return; let n = 0;
      for (const r of ex.esi || []) { if (r.kind !== 'spike' && r.recId === V.rec.id && !r.trace && r.meta && r.meta.win) {   // début de crise : extrait ajouté (marques de la crise du résultat)
          const mk = (r.seizureId && r.seizureId !== V.rec.seizureId ? ((V.rec.bySz || {})[r.seizureId] || {}).marks : V.rec.marks) || {};
          if (mk.onset != null) { const tr = this.esiTracePng(V, null, mk.onset, [mk.onset + r.meta.win[0], mk.onset + r.meta.win[1]]); if (tr) { r.trace = tr.url; r.traceT = tr.t; r.traceV = 2; n++; } } continue; }
        if (r.kind !== 'spike' || r.recId !== V.rec.id || !r.trace || r.traceV >= 2 || !r.meta) continue;
        const k = CL_PAL.indexOf(r.meta.color), c = Lr.clusters[k]; if (!c || Math.abs(c.idx.length - r.meta.n) > Math.max(2, 0.02 * r.meta.n)) continue;
        const tr = this.esiTracePng(V, k); if (tr) { r.trace = tr.url; r.traceT = tr.t; r.traceV = 2; n++; } }
      if (n) this.touch('exploration', ex.id, 'imagerie de source : extraits de tracé');
    },
    esiSpikeResult() {
      const V = this._iev, A0 = V.espAvg, S0 = V.espSol, rec = V.rec; if (!A0 || !S0 || S0.err || S0.busy) return null; const T = A0.T, fs = A0.fs;
      return { id: uid('esi'), kind: 'spike', modality: this.esiKey(), recId: rec.id, seizureId: null, title: `Pointes ${A0.k + 1} · ${rec.title}`, at: ST.now(), chans: A0.names, topo: A0.avg.map(a => sig4(a[T.half])), alpha: A0.noise && sc(V) ? 1 / 9 : 0.05,
        noise: A0.noise ? Array.from(A0.noise, sig4) : null, dataCov: A0.dataCov ? Array.from(A0.dataCov, sig4) : null,
        meta: { n: A0.n, rate: rec.esp.last.clusters[A0.k].rate, rel: this.esiClRel(rec.esp.last, A0.k), tot: rec.esp.last.n, mins: rec.esp.last.mins, color: CL_PAL[A0.k % CL_PAL.length], half: Math.round((T.half - T.peak) / fs * 1000), pc1: r3(A0.pc1), peakTopo: A0.avg.map(a => sig4(a[T.peak])) },
        ...(tr => tr ? { trace: tr.url, traceT: tr.t, traceV: 2 } : {})(this.esiTracePng(V, A0.k)), summary: this.esiSummary(S0.sol, S0.H) };
    },

    // ---------------------------------------------------------------- onglet « Début de crise → source » (scalp) / « Source » (SEEG)
    async esiIctalCompute() {
      const V = this._iev, rec = V.rec, P = this.esiP(V.meth), mk = rec.marks || {}, fs = V.mem.fs, ch = this.esiChans(V);
      if (mk.onset == null) { this.toast('Annoter d’abord le début de crise (clic droit sur le tracé)', 5000); return; }
      if (ch.length < (sc(V) ? 8 : 6)) { this.toast(sc(V) ? 'Moins de 8 électrodes 10-20 reconnues' : 'Moins de 6 plots localisés : vérifier la correspondance avec le schéma', 6000); return; }
      V.mbusy = V.meth; this.esiRender();
      try {
        const a = mk.onset + (+P.off || 0), b = a + Math.max(0.5, +P.len || 2), pad = 1, X = this.esiRaw(V, ch, Math.max(0, a - pad), Math.min(V.mem.duration, b + pad)), i0 = Math.round((a - Math.max(0, a - pad)) * fs), n = Math.round((b - a) * fs);
        const crop = Y => Y.map(y => y.subarray(i0, i0 + n)), fmax = sc(V) ? 25 : 45, broad = E.avgRefData(crop(X.map(x => E.bandpass(x, fs, 1, fmax))));
        // fréquence du début de crise : celle qui augmente le plus par rapport aux 10 s précédentes (repli : pic du spectre)
        const b0 = Math.max(0, mk.onset - 11), b1 = Math.max(b0, mk.onset - 1), base = b1 - b0 >= 2 ? E.avgRefData(this.esiRaw(V, ch, b0, b1).map(x => E.bandpass(x, fs, 1, fmax))) : null;
        const dom = E.dominantRatio(broad, base, fs, sc(V) ? 1.5 : 2, sc(V) ? 20 : 40), f0 = P.band === 'auto' ? dom.f : null, bw = sc(V) ? 1 : Math.max(1, (f0 || 8) * 0.25);
        const [f1, f2] = P.band === 'auto' ? (f0 ? [Math.max(0.5, f0 - bw), f0 + bw] : [1, fmax]) : [+P.f1, +P.f2];
        const nb = E.avgRefData(crop(X.map(x => E.bandpass(x, fs, f1, f2)))), pc = E.pca(nb), m = ch.length, pcs = [0, 1, 2].filter(k => k < m).map(k => ({ val: sig4(pc.val[k]), vec: Array.from({ length: m }, (_, i) => sig4(pc.vec[i * m + k])) }));
        // composantes indépendantes (large bande) : puissance à la fréquence critique, part de variance, dipolarité
        const K = Math.min(10, m - 1), F = E.fastica(broad, K), H = sc(V) ? await this.esiScalpHead(ch.map(c => c.name).filter(x => E.STD[x])) : this.esiSeegHead(ch.map(c => ({ name: c.name, p: c.p })));
        const idx = H.names.map(nm => ch.findIndex(c => c.name === nm)), totVar = broad.reduce((s, y) => s + y.reduce((q, v) => q + v * v, 0), 0) || 1;
        const comps = F.A.map((a, j) => { const sp = E.welch([F.S[j]], fs, Math.min(2, (b - a))); let pin = 0, pt = 0; sp.f.forEach((f, q) => { if (f >= 1 && f <= fmax) { pt += sp.p[q]; if (f >= f1 && f <= f2) pin += sp.p[q]; } }); let va = 0, vs = 0; for (const v of a) va += v * v; for (const v of F.S[j]) vs += v * v; const topo = idx.map(i => a[i]), D = E.fitDipole({ gainAt: H.gainAt, v: E.avgRefVec(topo), L: H.L, n: H.n, S: H.src.view, inside: H.inside, step: 6 });
          return { j, topo: Array.from(a, sig4), band: r3(pin / (pt || 1)), varp: r3(va * vs / totVar), gof: r3(D.gof), score: r3((pin / (pt || 1)) * D.gof) }; }).sort((x, y) => y.score - x.score);
        // bruit : les 10 s qui précèdent le début, dans la même bande ; données : la fenêtre critique (formeur de voie)
        const noise = b1 - b0 >= 2 ? E.covariance(E.avgRefData(this.esiRaw(V, ch, b0, b1).map(x => E.bandpass(x, fs, f1, f2)))) : null, dataCov = E.covariance(nb), names = ch.map(c => c.name), XC = { noise: subCov(noise, names, H.names), data: subCov(dataCov, names, H.names) };
        const v1 = idx.map(i => pcs[0].vec[i] * Math.sqrt(Math.max(0, pcs[0].val))), sol = this.esiSolve(H, v1, pcs.map(p => ({ val: p.val, vec: idx.map(i => p.vec[i]) })), XC.noise && sc(V) ? 1 / 9 : 0.1, XC);
        rec[V.meth].last = { at: ST.now(), a, b, f0: dom.f ? r3(dom.f) : null, ratio: dom.ratio ? Math.round(dom.ratio * 10) / 10 : null, band: [r3(f1), r3(f2)], chans: names, pcs, explained: pc.explained.slice(0, 3).map(r3), comps: comps.slice(0, 5), spec: { f: Array.from(dom.spec.f.filter(f => f <= fmax), r3), p: Array.from(dom.spec.p.slice(0, dom.spec.f.filter(f => f <= fmax).length), sig4) },
          noise: noise ? Array.from(noise, sig4) : null, dataCov: Array.from(dataCov, sig4) };
        V.eszSol = { H, sol, comp: null, X: XC }; V.dirty = true;
      } catch (e) { console.error(e); this.toast('Source du début de crise : ' + e.message, 6000); }
      finally { if (this._iev === V) { V.mbusy = null; this.esiRender(); this.ieegDraw(); } }
    },
    /** composante indépendante choisie : ESI de sa topographie */
    async esiIctalComp(j) {
      const V = this._iev, Lr = V.rec[V.meth].last, c = Lr && Lr.comps.find(x => x.j === j); if (!c || !V.eszSol) return; const H = V.eszSol.H, ix = H.names.map(nm => Lr.chans.indexOf(nm));
      if (V.eszSol.comp === j) { V.eszSol.comp = null; V.eszSol.csol = null; } else { const nz = V.eszSol.X && V.eszSol.X.noise; V.eszSol.comp = j; V.eszSol.csol = this.esiSolve(H, ix.map(i => c.topo[i]), null, nz && sc(V) ? 1 / 9 : 0.05, { noise: nz }); } this.esiRender();
    },
    esiIctalResult(useComp) {
      const V = this._iev, rec = V.rec, Lr = rec[V.meth].last, S0 = V.eszSol; if (!Lr || !S0) return null; const c = useComp && S0.comp != null ? Lr.comps.find(x => x.j === S0.comp) : null, sz = rec.seizureId && ST.byId(this.dossier.seizures, rec.seizureId);
      return { id: uid('esi'), kind: 'ictal', modality: this.esiKey(), recId: rec.id, seizureId: rec.seizureId || null, title: `${c ? 'Composante ' + (Lr.comps.indexOf(c) + 1) + ' · ' : ''}Début de crise · ${sz ? sz.label : rec.title}`, at: ST.now(), chans: Lr.chans,
        topo: c ? c.topo : Lr.pcs[0].vec.map(x => sig4(x * Math.sqrt(Math.max(0, Lr.pcs[0].val)))), pcs: c ? null : Lr.pcs, cov: c ? false : true, alpha: Lr.noise && sc(V) ? 1 / 9 : c ? 0.05 : 0.1, noise: Lr.noise || null, dataCov: c ? null : Lr.dataCov || null,
        meta: { f0: Lr.f0, band: Lr.band, win: [r3(Lr.a - (rec.marks.onset || 0)), r3(Lr.b - (rec.marks.onset || 0))], explained: Lr.explained, comp: c ? { band: c.band, gof: c.gof, varp: c.varp } : null },
        ...(tr => tr ? { trace: tr.url, traceT: tr.t, traceV: 2 } : {})(rec.marks.onset != null ? this.esiTracePng(V, null, rec.marks.onset, [Lr.a, Lr.b]) : null), summary: this.esiSummary(c ? S0.csol : S0.sol, S0.H) };
    },
    esiSave(res) {
      if (!res) return; const d = this.dossier, ex = this.ieegEx(); if (!d || !ex) return; ex.esi = ex.esi || []; ex.esi.push(res);
      this.touch('exploration', ex.id, 'imagerie de source'); this.toast(`« ${res.title} » enregistré (Analyses : liste des sources)`, 4000); this.esiShow(res); this.esiRender();
    },

    // ---------------------------------------------------------------- panneau
    esiRender() {
      const V = this._iev; if (!V || !V.sb || !['esp', 'esz', 'src'].includes(V.meth)) return; const side = V.sb, rec = V.rec, busy = V.mbusy === V.meth, light = V.light;
      const res = (sol, H) => { const d = sol.dip, fr = d.near && d.near.d > 25; return `<div class="esi-res"><div><b>sLORETA</b> : maximum ${esc(sol.peak)}${sol.top.length ? `<div class="small muted" title="part de la source (au-dessus de 50 % du maximum) dans chaque région">étendue : ${sol.top.slice(0, 4).map(t => `${esc(t.name)} ${Math.round(t.w * 100)} %`).join(' · ')}</div>` : ''}</div>
          <div><b>Dipôle</b> : ${esc(d.region)}${d.cortex > 8 ? ` <span class="muted">(${nf(d.cortex, 0)} mm du cortex)</span>` : ''} · GOF <b>${Math.round(d.gof * 100)} %</b> · ${ciTxt(d.ci.r)}${d.gof < 0.7 ? ' <span class="warn">ajustement médiocre</span>' : ''}</div>
          ${d.near ? `<div>Plot le plus proche : <b>${esc(d.near.name)}</b> à ${nf(d.near.d, 0)} mm${fr ? ' — <span class="warn">au-delà de 25 mm : extrapolation, à confronter</span>' : d.near.d > 10 ? ' — <span class="muted">générateur entre les plots (triangulé)</span>' : ''}</div>` : ''}
          ${sol.lcmv ? `<div><b>LCMV</b> : maximum ${esc(sol.lcmv.region)}</div>` : ''}${concHtml(sol.conc)}
          ${H.kind === 'scalp' && !H.names.some(n => /^(F9|F10|T9|T10|P9|P10|FT9|FT10|TP9|TP10)$/.test(n)) ? '<div class="small warn">Sans chaîne temporale inférieure (F9/T9/P9, F10/T10/P10), les générateurs basaux temporaux sont mal vus (montage IFCN, Seeck 2017).</div>' : ''}
          <div class="small muted">${esc(H.info)}${sol.white ? ' ; données blanchies par le bruit de fond' : ''}</div>
          ${H.kind === 'scalp' && H.model === 'bem' ? '<div class="btnrow"><button class="e-elec" title="Scalp du modèle et électrodes en 3D, déplaçables à la souris">Électrodes en 3D</button><button class="e-head" title="Modèle de tête : BEM ou sphère, âge">Modèle de tête…</button></div>' : H.kind === 'scalp' ? '<div class="btnrow"><button class="e-head">Modèle de tête…</button></div>' : ''}</div>`; };
      let body = '';
      if (V.meth === 'esp') {
        const P = this.esiP('esp'), Lr = rec.esp.last, A0 = V.espAvg, S0 = V.espSol;
        body = `<div class="ie-sec"><div class="ie-sh">Période analysée</div><div class="ctrl-row"><label>de <input class="e-a" value="${clock(+P.start || 0)}" style="width:66px"></label><label>à <input class="e-b" value="${clock(+P.end || V.mem.duration)}" style="width:66px"></label><span class="muted">${nf(((+P.end || V.mem.duration) - (+P.start || 0)) / 60, 1)} min</span></div>
            <details><summary>Réglages</summary><div class="ctrl-row"><label title="SpikeNet (scalp) : réseau entraîné sur des pointes annotées par des experts, sortie calibrée ; Janča 2015 (intracrânien) : seuil adaptatif sur l’enveloppe 10–60 Hz ; morphologique : amplitude, deux demi-ondes, acuité">détecteur <select class="e-det">${(sc(V) ? [['spikenet', 'SpikeNet (scalp)']] : []).concat([['janca', 'Janča 2015' + (sc(V) ? ' (intracrânien)' : '')], ['morph', 'morphologique']]).map(([k, l]) => `<option value="${k}"${P.det === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
                ${P.det === 'spikenet' ? `<label title="probabilité calibrée : proportion d’experts qui jugeraient la fenêtre comme une pointe (0,5 = la majorité)">seuil p ≥ <input type="number" class="e-thr" step="0.05" min="0.2" max="0.95" value="${P.thr}"></label><label title="une fenêtre tous les 31 ms au lieu de 62 ms : un peu plus de pointes retrouvées, calcul deux fois plus long"><input type="checkbox" class="e-fine"${P.fine ? ' checked' : ''}> fin</label>` : P.det === 'morph' ? `<label title="seuil d’amplitude : multiple de l’écart absolu médian local">seuil <input type="number" class="e-k" step="0.5" min="3" value="${P.k}"> σ</label>` : `<label title="seuil k1 × (mode + médiane) de l’enveloppe (3,65 : valeur publiée)">k1 <input type="number" class="e-k1" step="0.05" min="2" value="${P.k1}"></label>`}<label title="corrélation minimale des topographies d’un même groupe">groupes r ≥ <input type="number" class="e-r" step="0.05" min="0.6" max="0.98" value="${P.corr}"></label></div>
              <div class="hint">${P.det === 'spikenet' ? 'SpikeNet (Jing et al., JAMA Neurol 2020) : réseau convolutif entraîné sur 9 571 EEG de scalp et 13 262 pointes candidates annotées par 8 neurophysiologistes, sortie calibrée sur la proportion d’experts ; 19 électrodes 10-20 en référence moyenne et en double banane, 128 Hz, passe-haut 0,5 Hz, fenêtres de 1 s. Poids publics, licence CC BY-NC 4.0 (usage non commercial).' : P.det === 'morph' ? 'Bande ' + P.f1 + '–' + P.f2 + ' Hz, référence moyenne ; deux demi-ondes de 10 à 100 ms et pic aigu (dérivée seconde).' : 'Janča et al., Brain Topogr 2015 : signal rééchantillonné à 200 Hz, filtré 10–60 Hz, enveloppe de Hilbert ; seuil adaptatif k1 × (mode + médiane) d’une loi log-normale ajustée sur 5 s ; polypointes réunies (120 ms) ; validé en intracrânien' + (sc(V) ? ', plus sensible au scalp (artefacts musculaires)' : '') + '.'} Topographies et groupes : référence moyenne, ${P.f1}–${P.f2} Hz ; voies exclues ignorées${this.ieegSzWins ? ' ; crises marquées du tracé écartées' : ''}.</div>
              ${P.det === 'spikenet' ? `<div class="ctrl-row esi-adapt"><label title="Retire des détections celles qui ressemblent aux pointes que vous avez rejetées pour ce patient"><input type="checkbox" class="e-adapt"${P.adapt && rec.esp.adapt ? ' checked' : ''}${rec.esp.adapt ? '' : ' disabled'}> filtre propre au patient</label><span class="spacer"></span><button class="e-adapt-go" title="Après relecture : supprimer les groupes faux (artefact récurrent, variante bénigne), garder les vrais, puis apprendre de ces choix (≥ 10 pointes de chaque sorte)">Apprendre de ma relecture</button></div>
                <div class="hint">${rec.esp.adapt ? `Filtre appris le ${new Date(rec.esp.adapt.at).toLocaleDateString(SV.LOC)} sur ${rec.esp.adapt.nPos} pointes gardées et ${rec.esp.adapt.nNeg} rejetées ; en validation croisée, ${Math.round(rec.esp.adapt.sens * 100)} % des gardées conservées et ${Math.round(rec.esp.adapt.spec * 100)} % des rejetées retirées.` : 'SpikeNet est entraîné une fois pour tous les patients et s’applique tel quel. Le filtre propre au patient, facultatif, apprend de votre relecture (groupes gardés et supprimés) à retirer les fausses détections récurrentes de ce tracé ; il ne fait que retirer des détections.'}</div>` : ''}</details>
            ${busy ? this.ieegBusyHtml('Détection des pointes') : `<div class="btnrow"><button class="e-go primary">${Lr ? 'Relancer la détection' : 'Détecter les pointes'}</button></div>`}</div>`;
        if (Lr && !busy) {
          const tot = Lr.clusters.reduce((a, c) => a + c.n, 0) || 1, S = this.esiClSel(V);
          body += `<div class="ie-sec"><div class="ie-sh">${Lr.n} pointe${Lr.n > 1 ? 's' : ''} · ${nf(Lr.n / (Lr.mins || (Lr.end - Lr.start) / 60), 1)}/min <span class="muted">${Lr.clusters.length} groupe${Lr.clusters.length > 1 ? 's' : ''} de même topographie (≥ 3)${Lr.det === 'spikenet' ? ` · SpikeNet p ≥ ${Lr.params.thr || 0.5}${Lr.adapted ? ` · filtre patient : ${Lr.vetoed} retirée${Lr.vetoed > 1 ? 's' : ''}` : ''}${Lr.interp ? ` · ${Lr.interp.join(', ')} interpolée${Lr.interp.length > 1 ? 's' : ''}` : ''}` : Lr.det === 'janca' ? ' · détecteur Janča 2015' : (Lr.dets || []).length > 1 ? ' · détections réunies : ' + Lr.dets.map(x => ({ spikenet: 'SpikeNet', janca: 'Janča', morph: 'morphologique' }[x] || x)).join(' + ') : ''}${Lr.szOut ? ` · ${Lr.szOut} crise${Lr.szOut > 1 ? 's' : ''} écartée${Lr.szOut > 1 ? 's' : ''}` : ''}</span></div>
            <div class="esi-cl">${Lr.clusters.map(c => { const mx = c.topo.map((v, i) => [Math.abs(v), Lr.chans[i], v]).sort((p, q) => q[0] - p[0]).slice(0, 3); return `<button class="esi-c${S.has(c.k) ? ' on' : ''}${V.espSel === c.k ? ' cur' : ''}" data-k="${c.k}" style="--clc:${CL_PAL[c.k % CL_PAL.length]}" title="${c.n} pointes · ${nf(c.rate, 2)}/min · ${Math.round(c.n / tot * 100)} % des pointes groupées\nClic : choisir (pointe moyennée, source) · Ctrl + clic : sélection multiple (fusionner, supprimer, filtrer)">${sc(V) ? `<img src="${topoPng(Lr.chans, c.topo, { size: 64, labels: 0 })}" alt="">` : ''}<span><b><i class="esi-dot"></i>Groupe ${c.k + 1}</b> · ${c.n}${(m => m ? ` <small class="esi-man" title="dont ${m} ajoutée${m > 1 ? 's' : ''} à la main">◆${m}</small>` : '')(c.idx.filter(i => Lr.events[i] && Lr.events[i].m).length)}<br><small>${nf(c.rate, 1)}/min · ${Math.round(c.n / tot * 100)} %</small><br><small>${mx.map(x => esc(x[1])).join(' ')} ${mx[0] && mx[0][2] < 0 ? '−' : '+'}</small></span></button>`; }).join('') || '<div class="hint">Aucun groupe d’au moins 3 pointes de même topographie.</div>'}</div>
            ${Lr.clusters.length && rec.sleep && rec.sleep.stages && this.slpMinutes ? this.esiStageRates(rec, Lr) : ''}
            ${Lr.clusters.length ? `<div class="ctrl-row esi-clact"><label title="Tracé : marques des seuls groupes sélectionnés"><input type="checkbox" class="e-only"${V.espOnly ? ' checked' : ''}> seulement la sélection</label><span class="spacer"></span>${S.size > 1 ? `<button class="e-merge" title="Même type de grapho-élément : un seul groupe (pointe moyennée recalculée)">Fusionner (${S.size})</button>` : ''}${S.size === 1 && (Lr.clusters[[...S][0]] || {}).parts ? '<button class="e-split" title="Rendre ce groupe fusionné à ses groupes d’origine">Dégrouper</button>' : ''}<button class="e-del" title="Retirer le${S.size > 1 ? 's' : ''} groupe${S.size > 1 ? 's' : ''} sélectionné${S.size > 1 ? 's' : ''} (sans intérêt, artefact)">Supprimer${S.size > 1 ? ` (${S.size})` : ''}</button></div>` : ''}
            ${(Lr.del || []).length || rec.esp.prev ? `<div class="ctrl-row esi-clact">${(Lr.del || []).length ? `<button class="e-restore" title="Remettre les groupes supprimés">Rétablir ${Lr.del.length} groupe${Lr.del.length > 1 ? 's' : ''} supprimé${Lr.del.length > 1 ? 's' : ''}</button>` : ''}<span class="spacer"></span>${rec.esp.prev ? `<button class="e-undo" title="Revenir à la détection remplacée (${rec.esp.prev.n} pointes) ; l’actuelle devient rétablissable à son tour">Détection précédente (${rec.esp.prev.n})</button>` : ''}</div>` : ''}</div>`;
          const C = this.esiCur(V), ML = this.esiManList(Lr), RL = this.esiRmList(Lr), ne = (Lr.edits || []).length;
          if (C || ML.length) body += `<div class="ie-sec esi-rev"><div class="ie-sh">Relecture ${V.espManOnly ? '<span class="esi-man">des ajouts à la main ◆</span>' : C ? `du groupe ${C.c.k + 1}` : ''}</div><div class="ctrl-row"><button class="e-nav" data-d="-1" title="précédente ( [ )">◀</button><span class="esi-cur">${C ? `${V.espManOnly ? `<b class="esi-man">◆</b> <b>${ML.findIndex(m => m.i === C.i) + 1 || '–'}</b> / ${ML.length} · groupe ${C.c.k + 1}` : `pointe <b>${V.espI + 1}</b> / ${C.c.idx.length}${C.e.m ? ' <b class="esi-man" title="ajoutée à la main">◆</b>' : ''}`} · ${clock(C.e.t)} · ${esc(C.e.c)}` : '—'}</span><button class="e-nav" data-d="1" title="suivante ( ] )">▶</button><span class="spacer"></span>${C ? `<button class="e-rm" title="${C.e.m ? 'Supprimer cet ajout à la main (Suppr)' : 'Retirer cette pointe du groupe : détection à tort (Suppr)'}">${C.e.m ? 'Supprimer' : 'Retirer'}</button>` : ''}</div>
            ${ML.length ? `<div class="ctrl-row"><label title="◀ ▶ et [ ] ne parcourent que les pointes ajoutées à la main, tous groupes confondus"><input type="checkbox" class="e-manonly"${V.espManOnly ? ' checked' : ''}> parcourir seulement les ajouts à la main (${ML.length})</label></div>` : ''}
            <div class="hint small">▲ au-dessus du tracé : clic pour choisir une pointe · clic droit sur le tracé : « Ajouter une pointe ici » (◆) · Suppr : retirer la pointe courante${ne ? ' · <a href="#" class="e-uedit">annuler la dernière retouche</a> (Ctrl+Z)' : ''}</div></div>`;
          if (ML.length || RL.length) { const tab = V.espEdTab === 'rm' && RL.length || !ML.length ? 'rm' : 'man', gsel = (m) => `<select class="e-mv" data-i="${m.i}" title="Groupe de cet ajout">${Lr.clusters.map(c => `<option value="${c.k}"${c.k === m.k ? ' selected' : ''}>groupe ${c.k + 1}</option>`).join('')}</select>`;
            body += `<details class="ie-sec esi-ed"${V.espEdOpen ? ' open' : ''}><summary class="ie-sh">Retouches à la main <span class="muted">${ML.length ? `◆ ${ML.length} ajoutée${ML.length > 1 ? 's' : ''}` : ''}${ML.length && RL.length ? ' · ' : ''}${RL.length ? `✕ ${RL.length} retirée${RL.length > 1 ? 's' : ''}` : ''}</span></summary>
              <div class="seg esi-edtab"><button data-tab="man" class="${tab === 'man' ? 'on' : ''}"${ML.length ? '' : ' disabled'}>◆ Ajoutées (${ML.length})</button><button data-tab="rm" class="${tab === 'rm' ? 'on' : ''}"${RL.length ? '' : ' disabled'}>✕ Retirées (${RL.length})</button></div>
              <div class="esi-edl">${tab === 'man' ? ML.map(m => `<div class="esi-edr${C && C.i === m.i ? ' cur' : ''}"><a href="#" class="e-goi" data-i="${m.i}" title="Aller à cette pointe">${clock(m.e.t)}</a><span>${esc(m.e.c)}</span>${gsel(m)}<button class="e-x" data-i="${m.i}" title="Supprimer cet ajout">✕</button></div>`).join('')
                : RL.map(m => `<div class="esi-edr"><a href="#" class="e-goi" data-i="${m.i}" title="Aller à cette pointe">${clock(m.e.t)}</a><span>${esc(m.e.c)}</span><span class="muted">${m.e.g != null && Lr.clusters[m.e.g] ? 'groupe ' + (m.e.g + 1) : ''}</span><button class="e-rs" data-i="${m.i}" title="Remettre cette pointe détectée dans son groupe">Rétablir</button></div>`).join('')}</div>
              <div class="hint small">${tab === 'man' ? 'Les ajouts gardent leur marque ◆ : une nouvelle détection les conserve sans les mêler aux pointes détectées, et le filtre propre au patient ne s’en sert pas.' : 'Pointes détectées puis retirées à la relecture : exemples négatifs du filtre propre au patient.'}</div></details>`; }
          if (A0) body += `<div class="ie-sec"><div class="ie-sh">Groupe ${A0.k + 1} : pointe moyennée (${A0.n}) <span class="muted">mi-montée ${Math.round((A0.T.half - A0.T.peak) / A0.fs * 1000)} ms · 1er axe ${Math.round(A0.pc1 * 100)} %${A0.pc1 < 0.8 ? ' (plusieurs générateurs / propagation)' : ''}</span></div>
            <img class="esi-wave" src="${wavePng(A0.avg, A0.fs, A0.pre, A0.T, light)}" alt="">
            ${sc(V) ? `<div class="esi-topos"><figure><img src="${topoPng(A0.names, A0.avg.map(a => a[A0.T.half]))}"><figcaption>mi-montée</figcaption></figure><figure><img src="${topoPng(A0.names, A0.avg.map(a => a[A0.T.peak]))}"><figcaption>pic</figcaption></figure></div>` : ''}
            ${S0 && S0.err ? `<div class="hint warn">${esc(S0.err)}</div>` : S0 && S0.busy ? '<div class="hint">Modèle de tête et imagerie de source…</div>' : S0 ? res(S0.sol, S0.H) : ''}
            ${S0 && !S0.err && !S0.busy ? '<div class="btnrow"><span class="spacer"></span><button class="e-3d">Voir en 3D</button><button class="e-save primary">Enregistrer</button></div>' : ''}</div>`;
        }
      } else {
        const P = this.esiP(V.meth), Lr = rec[V.meth].last, S0 = V.eszSol, mk = rec.marks || {};
        body = `<div class="ie-sec"><div class="ie-sh">Fenêtre <span class="muted">${mk.onset != null ? 'à partir du début de crise annoté (' + clock(mk.onset) + ')' : ''}</span></div>
            ${mk.onset == null ? '<div class="ie-warnbox">⚠ Annoter le <b>début de crise</b> (clic droit sur le tracé).</div>' : ''}
            <div class="ctrl-row"><label>décalage <input type="number" class="e-off" step="0.5" value="${P.off}"> s</label><label>durée <input type="number" class="e-len" step="0.5" min="0.5" value="${P.len}"> s</label></div>
            <div class="ctrl-row"><label>bande <select class="e-band"><option value="auto"${P.band === 'auto' ? ' selected' : ''}>fréquence dominante ± ${sc(V) ? '1 Hz' : '25 %'}</option><option value="man"${P.band !== 'auto' ? ' selected' : ''}>manuelle</option></select></label>${P.band !== 'auto' ? `<label><input type="number" class="e-f1" step="0.5" value="${P.f1}" style="width:54px"> – <input type="number" class="e-f2" step="0.5" value="${P.f2}" style="width:54px"> Hz</label>` : ''}</div>
            ${busy ? this.ieegBusyHtml('Calcul') : `<div class="btnrow"><button class="e-go primary"${mk.onset == null ? ' disabled' : ''}>${Lr ? 'Recalculer' : 'Localiser le début de crise'}</button></div>`}</div>`;
        if (Lr && S0 && !busy) {
          const csol = S0.comp != null ? S0.csol : null;
          body += `<div class="ie-sec"><div class="ie-sh">Rythme ${Lr.f0 ? nf(Lr.f0, 1) + ' Hz' : '—'}${Lr.ratio ? ` <span class="muted" title="puissance dans la fenêtre / 10 s avant le début">× ${nf(Lr.ratio, 1)} vs préictal</span>` : ''} <span class="muted">bande ${nf(Lr.band[0], 1)}–${nf(Lr.band[1], 1)} Hz · axes ${Lr.explained.map(x => Math.round(x * 100) + ' %').join(' / ')}</span></div>
              ${sc(V) ? `<div class="esi-topos"><figure><img src="${topoPng(Lr.chans, Lr.pcs[0].vec)}"><figcaption>1er axe (rythme)</figcaption></figure></div>` : ''}
              ${res(S0.sol, S0.H)}
              <div class="ie-sh" style="margin-top:8px">Composantes indépendantes <span class="muted">classées : puissance dans la bande × dipolarité</span></div>
              <div class="esi-cl">${Lr.comps.slice(0, 4).map((c, i) => `<button class="esi-c${S0.comp === c.j ? ' on' : ''}" data-j="${c.j}" title="puissance dans la bande ${Math.round(c.band * 100)} %, variance ${Math.round(c.varp * 100)} %, GOF ${Math.round(c.gof * 100)} %">${sc(V) ? `<img src="${topoPng(Lr.chans, c.topo, { size: 64, labels: 0 })}" alt="">` : ''}<span><b>CI ${i + 1}</b><br><small>${Math.round(c.band * 100)} % · GOF ${Math.round(c.gof * 100)} %</small></span></button>`).join('')}</div>
              ${csol ? res(csol, S0.H) : ''}
              <div class="btnrow">${V.meth === 'src' ? '<button class="e-cov" title="Sensibilité de l’implantation à chaque région du cortex">Couverture</button>' : ''}<span class="spacer"></span><button class="e-3d">Voir en 3D</button><button class="e-save primary">Enregistrer${csol ? ' (composante)' : ''}</button></div></div>`;
        }
      }
      const head = V.meth === 'esp' ? this.ieegMHead('Pointes → source', REF.esp, 'Détection multivoies (référence moyenne), groupes de topographie corrélée (r ≥ seuil), pointe moyennée, imagerie de source à mi-montée de la GFP (sLORETA, orientation libre, et dipôle équivalent avec ellipsoïde de confiance à 95 %). Le pic reflète souvent la propagation : la mi-montée est plus fiable (Parra-Díaz 2026).', '<span>▲ pointe détectée (groupe choisi en jaune vif)</span>', '')
        : V.meth === 'esz' ? this.ieegMHead('Début de crise → source', REF.esz, 'Fenêtre au début de crise ; fréquence dominante (Welch), filtre ± 1 Hz, imagerie de source de la covariance de la fenêtre (sLORETA moyenné, Nemtsas 2017) et dipôle du 1er axe ; composantes indépendantes (FastICA) classées par puissance à la fréquence critique et dipolarité (de Borman 2022).', '', '')
          : this.ieegMHead('Source du début de crise (SEEG)', REF.src, 'Signaux en référence moyenne de tous les plots localisés : les différences entre électrodes portent le champ à distance. Rythme de la fenêtre (fréquence dominante ± 25 %) : sLORETA de la covariance et dipôle équivalent du 1er axe, milieu homogène infini (Caune 2014). Fiabilité : GOF, ellipsoïde à 95 %, distance au plot le plus proche (erreur croissante au-delà de ~2 cm).', '', V.montage === 'bipolar' ? 'Le calcul utilise les signaux en référence commune (monopolaires), quel que soit le montage affiché.' : '');
      side.innerHTML = head + body;
      this.ieegBindCommon(side);
      const q = s => side.querySelector(s), on = (s, f) => { const e = q(s); if (e) e.onchange = f; }, P = this.esiP(V.meth);
      const tsec = s => { const m = String(s).trim().match(/^(?:(\d+):)?(\d+(?:[.,]\d+)?)$/); return m ? (+(m[1] || 0)) * 60 + parseFloat(m[2].replace(',', '.')) : null; };
      on('.e-a', e => { const v = tsec(e.target.value); if (v != null) P.start = v; this.esiRender(); this.ieegDraw(); }); on('.e-b', e => { const v = tsec(e.target.value); if (v != null) P.end = v; this.esiRender(); this.ieegDraw(); });
      on('.e-thr', e => { P.thr = clamp(+e.target.value || 0.5, 0.2, 0.95); }); on('.e-fine', e => { P.fine = e.target.checked; }); on('.e-adapt', e => { P.adapt = e.target.checked; }); { const ag = q('.e-adapt-go'); if (ag) ag.onclick = () => this.esiSpikeNetAdapt(); }
      on('.e-k', e => { P.k = +e.target.value || 5; }); on('.e-r', e => { P.corr = clamp(+e.target.value || 0.85, 0.5, 0.99); }); on('.e-k1', e => { P.k1 = clamp(+e.target.value || 3.65, 1.5, 10); }); on('.e-det', e => { P.det = e.target.value; this.esiRender(); });
      on('.e-off', e => { P.off = +e.target.value || 0; this.ieegDraw(); }); on('.e-len', e => { P.len = Math.max(0.5, +e.target.value || 2); this.ieegDraw(); });
      on('.e-band', e => { P.band = e.target.value; this.esiRender(); }); on('.e-f1', e => { P.f1 = +e.target.value; }); on('.e-f2', e => { P.f2 = +e.target.value; });
      const go = q('.e-go'); if (go) go.onclick = () => V.meth === 'esp' ? this.esiSpikeDetect() : this.esiIctalCompute();
      side.querySelectorAll('.esi-c[data-k]').forEach(b => b.onclick = e => { const k = +b.dataset.k, S = this.esiClSel(V); if (e.ctrlKey || e.metaKey || e.shiftKey) { if (S.has(k) && S.size > 1) S.delete(k); else S.add(k); this.esiRender(); this.ieegDraw(); return; } V.espSet = new Set([k]); this.esiSpikeAverage(k); this.ieegDraw(); });
      on('.e-only', e => { V.espOnly = e.target.checked; this.ieegDraw(); });
      const mg = q('.e-merge'); if (mg) mg.onclick = () => this.esiClMerge([...this.esiClSel(V)]);
      const dl = q('.e-del'); if (dl) dl.onclick = () => this.esiClDelete([...this.esiClSel(V)]);
      const sp = q('.e-split'); if (sp) sp.onclick = () => this.esiClSplit([...this.esiClSel(V)][0]); const rs = q('.e-restore'); if (rs) rs.onclick = () => this.esiClRestore(); const ud = q('.e-undo'); if (ud) ud.onclick = () => this.esiSpikeUndo();
      side.querySelectorAll('.esi-c[data-j]').forEach(b => b.onclick = () => this.esiIctalComp(+b.dataset.j));
      side.querySelectorAll('.e-nav').forEach(b => b.onclick = () => this.esiSpikeGo(+b.dataset.d));
      { const mo = q('.e-manonly'); if (mo) mo.onchange = () => { V.espManOnly = mo.checked; if (mo.checked) { const C = this.esiCur(V); if (!C || !C.e.m) return this.esiSpikeGo(1); } this.esiRender(); };
        const ed = q('.esi-ed'); if (ed) ed.ontoggle = () => { V.espEdOpen = ed.open; this.ieegDraw(); };
        side.querySelectorAll('.esi-edtab [data-tab]').forEach(b => b.onclick = () => { V.espEdTab = b.dataset.tab; this.esiRender(); this.ieegDraw(); });
        side.querySelectorAll('.e-goi').forEach(a => a.onclick = ev => { ev.preventDefault(); this.esiSpikeFocus(+a.dataset.i); });
        side.querySelectorAll('.e-mv').forEach(x => x.onchange = () => this.esiSpikeMove(+x.dataset.i, +x.value));
        side.querySelectorAll('.e-x').forEach(b => b.onclick = () => this.esiSpikeRemove(+b.dataset.i));
        side.querySelectorAll('.e-rs').forEach(b => b.onclick = () => this.esiSpikeRestore(+b.dataset.i)); }
      { const rm = q('.e-rm'); if (rm) rm.onclick = () => { const C = this.esiCur(V); if (C) this.esiSpikeRemove(C.i); }; const ue = q('.e-uedit'); if (ue) ue.onclick = e => { e.preventDefault(); this.esiEditUndo(); }; }
      const s3 = q('.e-3d'); if (s3) s3.onclick = () => { const r = V.meth === 'esp' ? this.esiSpikeResult() : this.esiIctalResult(true); if (r) this.esiShow(r); };
      const sv = q('.e-save'); if (sv) sv.onclick = () => this.esiSave(V.meth === 'esp' ? this.esiSpikeResult() : this.esiIctalResult(true));
      const cv = q('.e-cov'); if (cv) cv.onclick = () => { const r = this.esiIctalResult(false); if (r) this.esiShow(r, { coverage: true }); };
      side.querySelectorAll('.e-elec').forEach(b => b.onclick = () => { const r = V.meth === 'esp' ? this.esiSpikeResult() : this.esiIctalResult(true); if (!r) return; this.ui.esiElec = true; this.esiShow(r); });
      side.querySelectorAll('.e-head').forEach(b => b.onclick = () => this.esiHeadDialog());
    },

    // ================================================================ résultats d'un tracé (cartes des tracés, rec_cards.js)
    esiClColor(k) { return CL_PAL[k % CL_PAL.length]; },
    /** lignes des résultats d'imagerie de source : clic = afficher en 3D, Ctrl + clic = comparer, ★ = retenu pour le staff et
     *  les comptes rendus (si un résultat d'une sorte est étoilé, seuls les étoilés de cette sorte y figurent) */
    esiRowsHtml(list) {
      const shown = new Map((this._esiList || []).map(x => [x.res.id, x.color]));
      return list.map(r => { const s = r.summary || {}, d = s.dipole || {}; return `<div class="esi-row${shown.has(r.id) ? ' on' : ''}" data-id="${r.id}" title="Clic : afficher en 3D · Ctrl + clic : comparer (une teinte par résultat)"><div class="esi-r1"><button class="esi-keep${r.keep ? ' on' : ''}" title="${r.keep ? 'Retenu pour le staff et les comptes rendus' : 'Retenir pour le staff et les comptes rendus'}">${r.keep ? '★' : '☆'}</button>${shown.size > 1 && shown.has(r.id) ? `<i class="esi-sw" style="background:${shown.get(r.id)}"></i>` : r.meta && r.meta.color ? `<i class="esi-dot" style="background:${r.meta.color}"></i>` : ''}<b>${esc(r.title)}</b><span class="spacer"></span><button class="esi-more" title="Renommer, supprimer">⋯</button></div>
        <div class="small">${r.kind === 'spike' ? `${r.meta.n} pointes${r.meta.rate != null ? ` · ${nf(r.meta.rate, 2)}/min` : ''} · mi-montée ${r.meta.half} ms` : `${r.meta.f0 ? nf(r.meta.f0, 1) + ' Hz' : 'rythme'} · fenêtre ${nf(r.meta.win[0], 1)} à ${nf(r.meta.win[1], 1)} s`} · sLORETA ${esc(s.peak || '—')} · dipôle ${esc(d.region || '—')} (GOF ${Math.round((d.gof || 0) * 100)} %)${s.lcmv ? ` · LCMV ${esc(s.lcmv)}` : ''}</div>${concHtml(s.conc, true)}</div>`; }).join('');
    },
    esiRowsBind(box, ex) {
      box.querySelectorAll('.esi-row').forEach(row => { const r = (ex.esi || []).find(x => x.id === row.dataset.id); if (!r) return;
        row.onclick = e => { if (e.target.closest('button')) return; const on = (this._esiList || []).some(x => x.res.id === r.id), add = e.ctrlKey || e.metaKey || e.shiftKey;
          if (add) { if (on) this.esiDrop(r.id); else this.esiShow(r, { add: true }); } else if (on && this._esiList.length === 1) this.esiHide(); else this.esiShow(r); this.renderQuant(); };
        row.querySelector('.esi-keep').onclick = () => { r.keep = !r.keep; this.touch('exploration', ex.id, r.keep ? 'source retenue pour le staff' : 'source non retenue'); this.renderQuant(); };
        row.querySelector('.esi-more').onclick = e => { const b = e.currentTarget.getBoundingClientRect(), rec = (ex.recordings || []).find(x => x.id === r.recId);
          this.popupMenu([{ head: r.title }, rec ? { label: 'Ouvrir le tracé', run: () => this.recOpenAt(rec, r.traceT) } : null, { label: 'Renommer…', run: () => { const t = prompt('Titre', r.title); if (t && t.trim()) { r.title = t.trim(); this.touch('exploration', ex.id, 'imagerie de source'); this.renderQuant(); } } },
            { sep: true }, { label: 'Supprimer', danger: true, run: () => { ex.esi = ex.esi.filter(x => x !== r); if (this.ui.esiShown === r.id) this.esiHide(); this.touch('exploration', ex.id, 'imagerie de source supprimée'); this.renderQuant(); } }].filter(Boolean), b.left - 180, b.bottom + 4); }; });
    },
    /** résultats retenus pour le staff et les rapports : les étoilés de chaque sorte (pointes, crises) s'il y en a, sinon tous */
    esiKept(list) { const pick = L => L.some(r => r.keep) ? L.filter(r => r.keep) : L; return [...pick(list.filter(r => r.kind === 'spike')), ...pick(list.filter(r => r.kind !== 'spike'))]; },
    /** Phase 1 › Analyses EEG : une carte par tracé de scalp, ses résultats dessous */
    renderScalpAnalyses() {
      const box = $('tab-quant'), d = this.dossier, c = d && this.ctx && ST.resolveCtx(d, this.ctx), ex = c && c.exploration; if (!box || !ex) return;
      box.innerHTML = ''; this.recCardsRender(box, ex, { kind: 'scalp' });
    },

    // ================================================================ diaporama du staff
    /** vues 3D d'un résultat (face latérale du côté du dipôle, vue supérieure) pour le diaporama et les rapports, avec les
     *  options d'affichage choisies dans la vue (cortex coloré, dipôle, ellipse) ; le scalp et les électrodes restent dans la
     *  vue interactive */
    async esiShots(res) {
      const V3 = this.viewer, keep = { layout: V3.layoutName, active: V3.active, linked: V3.linked, cfgs: V3.cells.map(c => Object.assign({}, c.cfg, { hyps: c.cfg.hyps.slice() })) }, prev = (this._esiList || []).slice(), imgs = [], elec = this.ui.esiElec;
      try {
        this.ui.esiElec = false;
        V3.setLinked(false); V3.setLayout('single'); V3.setCellConfig(0, { hyps: [], fibers: false, nodes: false, sync: false, netLabels: false, electrodes: res.modality === 'seeg', labels: res.modality === 'seeg', zones: null, quant: null, stims: false, thermo: false, opacity: 1, inflate: 0 }, true);
        const sol = await this.esiShow(res); if (!sol) return null; const c = V3.center || { x: 0 }, side = sol.dip.p[0] < (c.x || 0) ? 'L' : 'R';
        for (const v of ['lat' + side, 'sup']) { V3.setView(v, false); await new Promise(r => setTimeout(r, 160)); imgs.push(V3.snapshot({ format: 'jpeg', quality: 0.88, scale: 1.5, crop: true, orient: true })); }
      } finally {
        this.esiHide(); this.ui.esiElec = elec; V3.setLayout(keep.layout); keep.cfgs.forEach((cfg, i) => V3.setCellConfig(i, cfg, true)); V3.setActive(keep.active); V3.setLinked(keep.linked);
        if (prev.length) { this._esiList = prev; this.esiDraw(); }
      }
      return imgs;
    },
    esiShotKey(r) { const O = this.esiOpt(); return `esi:${r.id}:${this.anatMode}:${+O.map}${+O.dip}${+O.ell}:${Math.round((this.ui.esiThr == null ? 0.6 : this.ui.esiThr) * 100)}`; },
    /** une ligne par résultat (type de pointes ou composante critique) : extrait de tracé à 20 s/page, topographie et
     *  résultats, puis les deux vues 3D — HTML commun au diaporama (img) et aux rapports (imgFn : image agrandissable) */
    esiRowHtml(r, o) {
      o = o || {}; const s = r.summary || {}, d = s.dipole || {}, img = o.img || ((u, cls) => `<img class="${cls}" src="${u}" alt="">`);
      const head = r.kind === 'spike' ? `${r.meta.n} pointes${r.meta.rate != null ? ` · ${nf(r.meta.rate, 1)}/min` : ''}${r.meta.rel != null ? ` · ${Math.round(r.meta.rel * 100)} % des pointes` : ''} · mi-montée ${r.meta.half} ms${r.meta.pc1 != null ? ` · 1er axe ${Math.round(r.meta.pc1 * 100)} %` : ''}` : `${r.meta.f0 ? nf(r.meta.f0, 1) + ' Hz' : 'rythme'} · ${nf(r.meta.win[0], 1)} à ${nf(r.meta.win[1], 1)} s du début`;
      const txt = `<div><b>sLORETA</b> : ${esc(s.peak || '—')}</div>${(s.top || []).length ? `<div class="esl-sm">${s.top.slice(0, 3).map(t => `${esc(t.name)} ${Math.round(t.w * 100)} %`).join(' · ')}</div>` : ''}
        <div><b>Dipôle</b> : ${esc(d.region || '—')} · GOF ${Math.round((d.gof || 0) * 100)} %${d.ci ? ` · ${ciTxt(d.ci)}` : ''}</div>${s.lcmv ? `<div><b>LCMV</b> : ${esc(s.lcmv)}</div>` : ''}${d.near ? `<div>Plot le plus proche : ${esc(d.near.name)} à ${nf(d.near.d, 0)} mm</div>` : ''}${concHtml(s.conc, true)}`;
      return `<div class="esl-h">${r.meta.color ? `<i class="esi-dot" style="background:${r.meta.color}"></i>` : ''}<b>${esc(r.title)}</b><span class="esl-sm">${head}</span>${o.review ? `<button class="pr-raw" data-review="${r.id}" title="Ouvrir le tracé à cet instant (montages, filtres, base de temps), puis « Retour à la présentation »">〰 Revoir le tracé</button>` : ''}</div>
        <div class="esl-row">${r.trace ? img(r.trace, 'esl-trace' + (r.traceV >= 2 ? '' : ' old'), 'trace') : ''}<div class="esl-txt">${r.modality === 'scalp' && r.chans ? `<img class="esl-topo" src="${topoPng(r.chans, r.topo, { size: 150 })}" alt="">` : ''}<div>${txt}</div></div>
          <div class="esl-v" data-id="${r.id}">${o.views ? o.views.map((u, k) => img(u, 'esl-3d', k ? 'sup' : 'lat')).join('') : o.views === null ? '' : '<div class="pr-wait">vues 3D…</div>'}</div></div>`;
    },
    /** diapositive « Imagerie de source » d'une exploration : tableau des types de pointes, puis une ligne par résultat */
    prEsi(el, ex, alive, kind) {
      const L0 = this.esiKept((ex.esi || []).filter(r => !kind || r.kind === kind)).slice(0, 4), sp = L0.filter(r => r.kind === 'spike');
      const tab = sp.length > 1 ? `<div class="pr-card esi-pr-sum"><table class="pr-tab"><tr><th></th><th>pointes</th><th>taux</th><th>part</th><th>sLORETA</th><th>dipôle</th><th>concordance</th></tr>${sp.map(r => { const s = r.summary || {}, d = s.dipole || {}; return `<tr><td><i class="esi-dot" style="background:${r.meta.color || '#ffd60a'}"></i><b>${esc(r.title)}</b></td><td>${r.meta.n}</td><td>${r.meta.rate != null ? nf(r.meta.rate, 1) + '/min' : '—'}</td><td>${r.meta.rel != null ? Math.round(r.meta.rel * 100) + ' %' : '—'}</td><td>${esc(s.peak || '—')}</td><td>${esc(d.region || '—')}</td><td>${s.conc ? esc(s.conc.lobe) + ` (${s.conc.n}/${s.conc.of})` : '—'}</td></tr>`; }).join('')}</table><div class="muted small">Part : proportion des pointes groupées de l’enregistrement ; un type nettement prédominant (≥ 70 %) plaide pour un foyer principal.</div></div>` : '';
      const rowH = [0, 40, 29, 21, 16][L0.length] - (tab ? 3 : 0);
      el.innerHTML = `<div class="pr-esi" style="--esi-rowh:${rowH}vh">${tab}${L0.map(r => `<div class="pr-card esi-pr">${this.esiRowHtml(r, { review: (ex.recordings || []).some(x => x.id === r.recId) })}</div>`).join('')}</div>`;
      el.querySelectorAll('[data-review]').forEach(b => { const r = L0.find(x => x.id === b.dataset.review); b.onclick = () => this.recReview(ex.id, r.recId, r.traceT, { meth: r.kind === 'spike' ? 'esp' : r.modality === 'seeg' ? 'src' : 'esz' }); });
      for (const r of L0) this.presentAsset(this.esiShotKey(r), () => this.esiShots(r)).then(imgs => { if (!alive()) return; const box = el.querySelector(`.esl-v[data-id="${r.id}"]`); if (box) box.innerHTML = imgs && imgs.length ? imgs.map(u => `<img class="esl-3d" src="${u}" alt="">`).join('') : '<div class="hint">vues 3D indisponibles</div>'; });
    },
    /** rapports : résultats d'imagerie de source (une ligne chacun), vues 3D calculées ici (appelé dans la file de la vue 3D) */
    async esiReportHtml(list, o) {
      o = o || {}; if (!list.length) return ''; const R = SV.Report, base = R && R.slug ? R.slug(o.base || '') : 'esi'; let h = o.title ? `<h${o.lv || 4}>${esc(o.title)}</h${o.lv || 4}>` : '';
      for (const r of list) { let views = null; if (o.images) { try { views = await this.esiShots(r); } catch (e) { console.warn(e); } }
        h += `<div class="esl-blk">${this.esiRowHtml(r, { views: views || null, img: (u, cls, nm) => `<img class="${cls} zoomable${cls === 'esl-trace' || /old/.test(cls) ? ' light' : ''}" src="${u}" data-name="${esc('EpiScope_' + base + '_' + (r.title || 'source') + '_' + nm)}" title="Cliquer pour agrandir">` })}</div>`; }
      return h + `<p class="m">Imagerie de source : sLORETA, dipôle équivalent (ellipse de confiance à 95 %) et LCMV sur ${list[0].modality === 'seeg' ? 'les plots localisés' : 'les électrodes de scalp (modèle de tête BEM ou sphérique)'} ; extraits de tracé à la densité d’une lecture à 20 s par page.</p>`;
    },
  };
  Object.assign(A, M);

  // ================================================================ greffes
  // diaporama : une diapositive « Imagerie de source » après la synthèse des crises de la phase 1, et après la SEEG
  const ps0 = A.presentSeegSlides; if (ps0) A.presentSeegSlides = function (m, scope, ctx) { const r = ps0.apply(this, arguments); for (const ex of this.dossier.explorations) if (ex.kind === 'seeg' && (ex.esi || []).length && (!ex.start || !m.date || ex.start <= m.date)) ctx.add(ex.label, 'Imagerie de source (SEEG)', (el, alive) => this.prEsi(el, ex, alive), { short: 'Source SEEG', key: 'esi:' + ex.id }); return r; };
  // contexte : une exploration autre que SEEG (Phase 1) porte aussi des tracés (EEG de scalp)
  // extraits de tracé enregistrés avant la v5.7 : refaits à l'ouverture du tracé (esiTraceUpgrade)
  const io0 = A.ieegOpen; A.ieegOpen = async function () { const r = await io0.apply(this, arguments); try { this.esiTraceUpgrade(); } catch (e) { console.warn(e); } return r; };
  const ex0 = A.ieegEx; A.ieegEx = function () { const r = ex0.apply(this, arguments); if (r) return r; const d = this.dossier; if (!d || !this.ctx) return null; const c = ST.resolveCtx(d, this.ctx); return c && c.exploration && c.exploration.kind !== 'seeg' ? c.exploration : null; };
  // Analyses : Phase 1 → cartes des tracés de scalp (SEEG : ieeg_ui.js)
  const rq0 = A.renderQuant; A.renderQuant = function () {
    const ex = this.ieegEx(); if (ex && ex.kind !== 'seeg') return this.renderScalpAnalyses();
    return rq0.apply(this, arguments);
  };
  // import : nature du tracé (scalp / SEEG)
  const im0 = A.ieegImport; A.ieegImport = async function (files) { const last = await im0.apply(this, arguments), ex = this.ieegEx(); if (ex) for (const r of ex.recordings || []) if (!r.modality) r.modality = E.isScalp((r.channels || []).map(c => c.name)) ? 'scalp' : 'ieeg'; if (ex && ex.kind !== 'seeg' && last) this.renderQuant(); return last; };
  // visionneuse : montages et quantification du scalp
  const op0 = A.ieegOpen; A.ieegOpen = async function (rec, withEI) {
    if (!rec) return; const ex = this.ieegEx(), isSc = rec.modality === 'scalp' || ((!rec.modality || rec.modality === 'ieeg' && ex && ex.kind !== 'seeg') && E.isScalp((rec.channels || []).map(c => c.name)));
    const RM = isSc ? E.recordedMontage((rec.channels || []).map(c => c.name)) : null, MS = !RM ? null : RM.kind === 'bip' ? [['file', RM.sub === 'long' ? 'Double banane (enregistré)' : 'Transverse (enregistré)', 'Montage bipolaire de l’enregistrement : les autres montages et l’imagerie de source demandent un enregistrement référentiel']]
      : [['mono', 'Référence', 'Référence de l’enregistrement : ' + RM.label], ['avg', 'Moyenne', 'Référence moyenne des électrodes 10-20'], ['lap', 'Laplacien', 'Laplacien de surface (Hjorth) : chaque électrode moins la moyenne de ses voisines'], ['banana', 'Double banane', 'Bipolaire longitudinal'], ['trans', 'Transverse', 'Bipolaire transverse']];
    if (isSc) { rec.modality = 'scalp'; rec.recMontage = RM.label; rec.view = rec.view || {}; if (!MS.some(([k]) => k === rec.view.montage)) rec.view.montage = MS.length > 1 ? 'banana' : 'file'; }
    await op0.call(this, rec, withEI); const V = this._iev; if (!V || V.rec !== rec) return;
    if (isSc) { const mt = V.el.querySelector('.ie-mont'); mt.innerHTML = MS.map(([k, l, t]) => `<button data-m="${k}" class="${V.montage === k ? 'on' : ''}" title="${esc(t)}">${l}</button>`).join(''); mt.title = 'Enregistré en ' + RM.label;
      mt.querySelectorAll('button').forEach(b => b.onclick = () => { V.montage = b.dataset.m; rec.view = Object.assign(rec.view || {}, { montage: V.montage }); V.dirty = true; this.ieegSetMontage(); });
}
  };
  const ml0 = A.ieegMethList; A.ieegMethList = function () { const V = this._iev; if (V && sc(V)) return ['esp', 'esz']; const L0 = ml0.apply(this, arguments); return L0.concat(this.ieegKind(V.rec) === 'inter' ? ['esp'] : ['src']); };
  const mr0 = A.ieegMethRender; A.ieegMethRender = function (onlyRes) { const V = this._iev; if (V && ['esp', 'esz', 'src'].includes(V.meth)) { this.ieegTabs(); return this.esiRender(); } return mr0.apply(this, arguments); };
  // tracé : pointes détectées (▲ en haut de page), fenêtre du début de crise
  const pw0 = A.ieegPaintWin; A.ieegPaintWin = function (g, o) {
    const V = this._iev; if (!V || !['esp', 'esz', 'src'].includes(V.meth)) return pw0 ? pw0.apply(this, arguments) : undefined; const { X, x0, pw, TOP } = o;
    if (V.meth === 'esp') { const Lr = V.rec.esp && V.rec.esp.last; if (!Lr) return; const S = this.esiClSel(V), cl = this.esiEvCluster(Lr), bw = 0.075 * o.k;   // bande de 150 ms centrée sur la pointe (groupes sélectionnés)
      const C = this.esiCur(V), cur = C ? C.i : -1;
      Lr.events.forEach((e, i) => { if (e.x) return; const x = X(e.t); if (x < x0 - bw || x > x0 + pw + bw) return; const k = cl[i], on = k >= 0 && S.has(k); if (V.espOnly && !on) return; const col = k >= 0 ? CL_PAL[k % CL_PAL.length] : '#9aa4b2';
        if (on) { g.fillStyle = rgba(col, V.light ? 0.2 : 0.16); g.fillRect(x - bw, TOP, 2 * bw, o.H - TOP); g.strokeStyle = rgba(col, 0.75); g.beginPath(); g.moveTo(Math.round(x) + 0.5, TOP); g.lineTo(Math.round(x) + 0.5, TOP + 12); g.stroke(); }
        if (i === cur) { g.strokeStyle = V.light ? 'rgba(20,35,58,0.85)' : 'rgba(255,255,255,0.9)'; g.lineWidth = 1.5; g.strokeRect(x - bw, TOP + 1, 2 * bw, o.H - TOP - 2); g.lineWidth = 1; }   // pointe courante (relecture)
        glyph(g, e.m ? 'dia' : 'tri', x, TOP + 6, on ? 6 : 4, on ? col : rgba(col, k >= 0 ? 0.6 : 0.4)); });
      if (V.espEdOpen && V.espEdTab === 'rm') { g.strokeStyle = V.light ? 'rgba(20,35,58,0.55)' : 'rgba(233,238,246,0.55)'; g.lineWidth = 1.3; Lr.events.forEach(e => { if (!e.x || e.m) return; const x = X(e.t); if (x < x0 || x > x0 + pw) return; g.beginPath(); g.moveTo(x - 4, TOP + 2); g.lineTo(x + 4, TOP + 10); g.moveTo(x + 4, TOP + 2); g.lineTo(x - 4, TOP + 10); g.stroke(); }); g.lineWidth = 1; }   // pointes retirées (liste ouverte)
      const P = this.esiP('esp'); o.vline(P.start, 'rgba(255,214,10,0.6)', [6, 4], 'pointes'); o.vline(P.end, 'rgba(255,214,10,0.6)', [6, 4], ''); return; }
    const mk = V.rec.marks || {}, P = this.esiP(V.meth); if (mk.onset == null) return; const a = mk.onset + (+P.off || 0); o.vline(a, COL.win, [6, 4], 'source'); o.vline(a + (+P.len || 2), COL.win, [6, 4], '');
  };
  const ow0 = A.ieegOvwWin; A.ieegOvwWin = function (g, X, H) { const V = this._iev; if (!V || !['esp', 'esz', 'src'].includes(V.meth)) return ow0 ? ow0.apply(this, arguments) : undefined; if (V.meth === 'esp') { const Lr = V.rec.esp && V.rec.esp.last; if (Lr && Lr.pm) { g.strokeStyle = 'rgba(255,214,10,0.55)'; g.lineWidth = 1; g.beginPath(); Lr.pm.forEach((v, k) => { const x = X(Lr.start + k + 0.5), y = H - 2 - v / 100 * (H - 6); if (k) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke(); }   // probabilité SpikeNet (maximum par seconde)
      if (Lr) { const S = this.esiClSel(V), cl = this.esiEvCluster(Lr); Lr.events.forEach((e, i) => { if (e.x) return; const k = cl[i], on = k >= 0 && S.has(k); if (V.espOnly && !on) return; g.fillStyle = k >= 0 ? rgba(CL_PAL[k % CL_PAL.length], on ? 0.95 : 0.45) : 'rgba(154,164,178,0.4)'; g.fillRect(X(e.t), H - (on ? 9 : 6), 1.2, on ? 8 : 5); });
        g.fillStyle = V.light ? '#14233a' : '#fff'; Lr.events.forEach(e => { if (!e.m || e.x) return; const x = X(e.t); g.beginPath(); g.moveTo(x, 1); g.lineTo(x + 3, 4); g.lineTo(x, 7); g.lineTo(x - 3, 4); g.fill(); }); }   /* ajouts à la main : ◆ en haut de l'aperçu */ const P = this.esiP('esp'); g.strokeStyle = 'rgba(255,214,10,0.8)'; g.strokeRect(X(P.start) + 0.5, 1.5, Math.max(1, X(P.end) - X(P.start)), H - 3); } };
  const mm0 = A.ieegMenuMeth; A.ieegMenuMeth = function (items, t, d) { const V = this._iev; if (!V || !['esp', 'esz', 'src'].includes(V.meth)) return mm0 ? mm0.apply(this, arguments) : undefined; if (V.meth === 'esp') { const P = this.esiP('esp'), Lr = V.rec.esp && V.rec.esp.last; items.push({ sep: true });
      if (Lr && Lr.clusters.length) { const cl = this.esiEvCluster(Lr), tol = 8 / ((V.geo && V.geo.k) || 100), near = Lr.events.map((e, i) => [e, i]).filter(([e, i]) => !e.x && cl[i] >= 0 && Math.abs(e.t - t) < Math.max(tol, 0.08)).sort((p, q) => Math.abs(p[0].t - t) - Math.abs(q[0].t - t))[0];
        if (near) items.push({ label: near[0].m ? `Supprimer l’ajout ◆ de ${clock(near[0].t)} (groupe ${cl[near[1]] + 1})` : `Retirer la pointe de ${clock(near[0].t)} (groupe ${cl[near[1]] + 1})`, danger: true, run: () => this.esiSpikeRemove(near[1]) });
        const gone = Lr.events.map((e, i) => [e, i]).filter(([e]) => e.x && !e.m && Math.abs(e.t - t) < Math.max(tol, 0.08))[0]; if (gone) items.push({ label: `Rétablir la pointe retirée de ${clock(gone[0].t)}`, run: () => this.esiSpikeRestore(gone[1]) });
        items.push({ label: `＋ Ajouter une pointe ici${V.espSel != null && Lr.clusters[V.espSel] ? ` (groupe ${V.espSel + 1})` : ''}`, run: () => this.esiSpikeAdd(t) }); }
      items.push({ label: 'Début de la période des pointes ici', run: () => { P.start = t; this.esiRender(); this.ieegDraw(); } }, { label: 'Fin de la période des pointes ici', run: () => { P.end = t; this.esiRender(); this.ieegDraw(); } }); } else { const P = this.esiP(V.meth), mk = V.rec.marks || {}; if (mk.onset != null) items.push({ sep: true }, { label: 'Fenêtre de source à partir d’ici', run: () => { P.off = Math.round((t - mk.onset) * 10) / 10; this.esiRender(); this.ieegDraw(); } }); } if (d && mm0) { const ex = (V.rec.ei && V.rec.ei.excluded || []).includes(d.name); items.push({ label: ex ? `Réintégrer ${d.name}` : `Exclure ${d.name} des calculs (artefact)`, run: () => this.ieegExclude(d.name, !ex) }); } };
  // relecture : clic sur une pointe (▲ au-dessus du tracé) ; [ ] : précédente / suivante ; Suppr : retirer la pointe courante ; Ctrl+Z : annuler
  A.ieegClickMeth = function (p) {
    const V = this._iev, Lr = V && V.meth === 'esp' && V.ei && V.rec.esp && V.rec.esp.last, G = V && V.geo; if (!Lr || !G || p.y > G.TOP + 14 || !p.inPlot) return false;
    const cl = this.esiEvCluster(Lr), X = t => G.x0 + (t - V.t) * G.k, hit = Lr.events.map((e, i) => [e, i]).filter(([e, i]) => !e.x && cl[i] >= 0 && Math.abs(X(e.t) - p.x) < 7).sort((a, b) => Math.abs(X(a[0].t) - p.x) - Math.abs(X(b[0].t) - p.x))[0];
    if (!hit) return false; const k = cl[hit[1]], ch = V.espSel !== k; V.espSel = k; V.espSet = new Set([k]); V.espI = Lr.clusters[k].idx.indexOf(hit[1]); if (ch) this.esiSpikeAverage(k); else this.esiRender(); this.esiRevShow(); return true;
  };
  const ky0 = A.ieegKey; A.ieegKey = function (e) {
    const V = this._iev, tg = e.target; if (V && V.meth === 'esp' && V.ei && !(tg && /INPUT|TEXTAREA|SELECT/.test(tg.tagName))) { const C = this.esiCur(V);
      if (C && (e.key === ']' || e.key === '[')) { this.esiSpikeGo(e.key === ']' ? 1 : -1); e.preventDefault(); e.stopImmediatePropagation(); return; }
      if (C && (e.key === 'Delete' || e.key === 'Backspace') && !V.selMark) { this.esiSpikeRemove(C.i); e.preventDefault(); e.stopImmediatePropagation(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && V.rec.esp && V.rec.esp.last && (V.rec.esp.last.edits || []).length) { this.esiEditUndo(); e.preventDefault(); e.stopImmediatePropagation(); return; } }
    return ky0.apply(this, arguments);
  };
  // anatomie changée (gabarit ↔ patient) : la source affichée est recalculée dans la nouvelle anatomie
  const sa0 = A.setAnatomy; A.setAnatomy = function () { const r = sa0.apply(this, arguments), L0 = this._esiLast, EO = this._esiElecOnly; if (L0 && this.viewer && L0.H.atlas !== this.viewer.atlas) setTimeout(() => this.esiRecompute(), 50); else if (EO) { this._esiElecOnly = null; setTimeout(() => this.esiElecOnly(EO.rec), 50); } return r; };
  // portée : carte, dipôle et scalp quittent la vue avec leur contexte (autre vue que Analyses, autre exploration, autre dossier)
  SV.Bus.on('scope:applied', function () {
    const app = this, V3 = app.viewer; if (!V3 || !app.esiHide) return; const key = app.esiScopeKey();
    if ((app._esiList || []).length && (!V3.paints || !V3.paints.esi || key !== app._esiKey)) app.esiHide();
    if (app._esiElecOnly && (key !== app._esiElecOnly.key || !['analyses', 'quant'].includes((app.ui.scope || {}).view) && app.ui.wm !== 'quant')) { app._esiElecOnly = null; if (V3.setScalp) V3.setScalp(null); }
  }, 'esi_ui');
  const ui0 = A.updateImagingLayers; if (ui0) A.updateImagingLayers = async function () { const r = await ui0.apply(this, arguments); if (this.esiSlices) this.esiSlices(); return r; };
  for (const k of ['openDossier', 'closeDossier']) { const f0 = A[k]; if (f0) A[k] = function () { if (this.esiReset) this.esiReset(); return f0.apply(this, arguments); }; }
})(window.SV);
