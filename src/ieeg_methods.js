/* EpiScope — ieeg_methods.js : méthodes complémentaires de quantification des tracés SEEG (v4.15–4.16), calculées localement (h² et connectivité dirigée, force des nœuds, pointes avec HFO, couplage à l’onde lente en v4.16).
 *
 * 1. Index d'épileptogénicité de connectivité (cEI) — Balatskaya et al., Clin Neurophysiol 2020;131:1947-55 :
 *    dérivations bipolaires filtrées 12–45 Hz (filtre aller-retour, sans déphasage), fenêtres glissantes de 3 s (pas 0,5 s)
 *    sur une fenêtre d'analyse partant 3 s avant le début de la crise ; coefficient de régression non linéaire h²
 *    (Pijn et Lopes da Silva ; Wendling 2001) de chaque voie sachant chaque autre, pour des délais de −0,1 à +0,1 s :
 *        h²(y|x, τ) = 1 − Σ (y(t+τ) − f(x(t)))² / Σ (y(t+τ) − ȳ)²,  f : régression linéaire par morceaux (10 classes de x) ;
 *    pour chaque paire, le sens de plus fort h² est retenu, et le signe de son délai donne la direction (x → y si y suit) ;
 *    seuil h² ≥ 0,2 → graphe orienté de la fenêtre ; degré sortant de chaque voie, médiane sur les fenêtres ;
 *        cEI_i = (EI_i/max EI + out_i/max out) / max_j (EI_j/max EI + out_j/max out).
 *    Mise en œuvre : signaux ramenés vers 128 Hz ; f est évaluée à partir de sommes par demi-classe (Σy et Σxy), ce qui donne
 *    le résidu sans repasser sur les échantillons ; calcul des voies x réparti dans des workers.
 * 2. Index d'entropie de permutation (PEI) — Bratu et al., Epilepsia 2024;65:389-401 :
 *    entropie de permutation (motifs ordinaux de dimension D = 3, délai τ = 1 échantillon), normalisée par ln(D!), sur des
 *    fenêtres de 5 s (pas 2,5 s) ; B = moyenne préictale (60 s avant le début), m = minimum ictal (début → fin), M = maximum
 *    postictal (60 s après la fin) ; PEI = M / m normalisé par le maximum des voies de la crise ; ΔE = B − m.
 * 3. Détecteur Delphos de pointes et d'oscillations rapides — Roehri et al., IEEE TBME 2016;63:2595-606 (manuel du greffon
 *    AnyWave) : transformée en ondelettes continue (ondelette analytique « dérivée de gaussienne » ψ̂(f) ∝ fⁿ e^{−f²},
 *    n = 20, 12 voix par octave), normalisation ZH0 de chaque échelle (parties réelle et imaginaire centrées-réduites par
 *    une moyenne et un écart-type robustes : valeurs comprises entre Q1 − 1,5 IQR et Q3 + 1,5 IQR), image |Z|² ; maxima
 *    locaux au-dessus du seuil (40) ; largeur à mi-hauteur en temps rapportée à celle de la réponse impulsionnelle de
 *    l'échelle, étalement en fréquence (voix) : oscillation (longue, étroite en fréquence) ou pointe (brève, large bande) ;
 *    bandes : gamma 24–80, ripples 80–250, fast ripples 250–500 Hz, VFO > 500 Hz. Seuils de forme lus sur la figure du
 *    manuel (approximatifs). Taux par minute et taux croisé √(pointes × HFO) (Roehri, Ann Neurol 2018).
 *    Mise en œuvre : blocs de 2^k échantillons recouvrants ; échelles basses calculées à cadence réduite (support borné
 *    de l'ondelette) puis interpolées ; statistiques ZH0 sur au plus 30 s réparties dans la fenêtre. */
(function (factory) {
  const G = typeof window !== 'undefined' ? (window.SV = window.SV || {}) : (globalThis.SV = globalThis.SV || {});
  factory(G); (G._factories = G._factories || {}).ieegm = factory;
})(function (SV) {
  'use strict';
  const IE = SV.IEEG;

  // ================================================================ filtres
  function iir(x, k) { const [b0, b1, b2, a1, a2] = k; let x1 = x[0], x2 = x[0], y1 = 0, y2 = 0; const y = new Float32Array(x.length); for (let i = 0; i < x.length; i++) { const v = x[i], o = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = o; y[i] = o; } return y; }
  /** filtre aller-retour (phase nulle) : les délais entre voies sont conservés */
  function filtfilt(x, k) { const a = iir(x, k); a.reverse(); const b = iir(a, k); b.reverse(); return b; }
  /** passe-bande lo–hi (Butterworth d'ordre 2 de chaque côté, aller-retour) */
  function bandpass(x, fs, lo, hi) {
    let m = 0; for (let i = 0; i < x.length; i++) m += x[i]; m /= x.length || 1; let y = new Float32Array(x.length); for (let i = 0; i < x.length; i++) y[i] = x[i] - m;
    if (lo > 0) y = filtfilt(y, IE.biquad('hp', lo, fs)); if (hi > 0 && hi < fs / 2) y = filtfilt(y, IE.biquad('lp', hi, fs)); return y;
  }

  // ================================================================ cEI
  const CEI = { band: [12, 45], fs: 128, win: 3, step: 0.5, lag: 0.1, bins: 10, thr: 0.2, pre: 3, dur: 20 };
  /** préparation des signaux (fil principal ou worker) : passe-bande puis décimation vers ~128 Hz */
  function ceiPrep(list, fs, o) {
    o = Object.assign({}, CEI, o || {}); const q = Math.max(1, Math.floor(fs / o.fs + 1e-9)), f2 = fs / q;
    return { sig: list.map(x => { const y = bandpass(x, fs, o.band[0], o.band[1]); return q > 1 ? IE.decimate(y, q, fs) : y; }), fs: f2 };
  }
  /** h² maximal sur les délais pour les voies x de rows, contre toutes les voies (sig : signaux préparés, même longueur).
   *  o : { W, step, lag, first, nWin, bins } en échantillons → { H: Float32Array(rows × N × nWin), L: Int8Array (délai) } */
  function h2Batch(sig, rows, o, progress) {
    const N = sig.length, len = sig[0].length, W = o.W, nb = o.bins || 10, nh = 2 * nb, Lg = o.lag, nW = o.nWin, st = Math.max(1, o.lagStep | 0 || 1);
    const H = new Float32Array(rows.length * N * nW), Lout = new Int8Array(rows.length * N * nW);
    // sommes cumulées de y et y² (variance de chaque fenêtre décalée en O(1))
    const P1 = sig.map(y => { const p = new Float64Array(len + 1); for (let i = 0; i < len; i++) p[i + 1] = p[i] + y[i]; return p; });
    const P2 = sig.map(y => { const p = new Float64Array(len + 1); for (let i = 0; i < len; i++) p[i + 1] = p[i] + y[i] * y[i]; return p; });
    const hb = new Uint8Array(W), n = new Float64Array(nh), Sx = new Float64Array(nh), Sx2 = new Float64Array(nh), sy = new Float64Array(nh), sxy = new Float64Array(nh);
    const cen = new Float64Array(nb), mb = new Float64Array(nb), ne = new Int8Array(nb), prv = new Int8Array(nb), nxt = new Int8Array(nb), al = new Float64Array(nh), be = new Float64Array(nh);
    rows.forEach((i, ri) => {
      const x = sig[i];
      for (let w = 0; w < nW; w++) {
        const w0 = o.first + w * o.step; let xmin = Infinity, xmax = -Infinity;
        for (let t = 0; t < W; t++) { const v = x[w0 + t]; if (v < xmin) xmin = v; if (v > xmax) xmax = v; }
        const bw = (xmax - xmin) / nb; if (!(bw > 0)) continue;
        n.fill(0); Sx.fill(0); Sx2.fill(0);
        for (let t = 0; t < W; t++) { const v = x[w0 + t]; let k = Math.floor((v - xmin) / (bw / 2)); if (k >= nh) k = nh - 1; hb[t] = k; n[k]++; Sx[k] += v; Sx2[k] += v * v; }
        let last = -1; for (let b = 0; b < nb; b++) { cen[b] = xmin + (b + 0.5) * bw; ne[b] = n[2 * b] + n[2 * b + 1] > 0 ? 1 : 0; prv[b] = last; if (ne[b]) last = b; }
        last = -1; for (let b = nb - 1; b >= 0; b--) { nxt[b] = last; if (ne[b]) last = b; }
        for (let j = 0; j < N; j++) {
          if (j === i) continue; const y = sig[j], p1 = P1[j], p2 = P2[j]; let best = 0, bl = 0;
          const h2At = tau => {
            const yo = w0 + tau, Sy = p1[yo + W] - p1[yo], Syy = p2[yo + W] - p2[yo], vt = Syy - Sy * Sy / W; if (!(vt > 1e-20)) return 0;
            sy.fill(0); sxy.fill(0);
            for (let t = 0; t < W; t++) { const k = hb[t], v = y[yo + t]; sy[k] += v; sxy[k] += v * x[w0 + t]; }
            for (let b = 0; b < nb; b++) if (ne[b]) mb[b] = (sy[2 * b] + sy[2 * b + 1]) / (n[2 * b] + n[2 * b + 1]);
            // droite de chaque demi-classe : entre les centres des classes voisines non vides (constante aux bords)
            let red = 0;
            for (let h = 0; h < nh; h++) {
              if (!n[h]) continue; const b = h >> 1, L = (h & 1) ? b : prv[b], R = (h & 1) ? nxt[b] : b; let a, s;
              if (L < 0 || R < 0) { a = mb[b]; s = 0; } else { s = (mb[R] - mb[L]) / (cen[R] - cen[L]); a = mb[L] - s * cen[L]; }
              red += 2 * a * sy[h] + 2 * s * sxy[h] - a * a * n[h] - 2 * a * s * Sx[h] - s * s * Sx2[h];
            }
            return 1 - (Syy - red) / vt;
          };
          // délais : tous (pas 1) ou grille grossière puis voisins du meilleur (o.lagStep > 1, connectivité intercritique)
          for (let tau = -Lg; tau <= Lg; tau += st) { const v = h2At(tau); if (v > best) { best = v; bl = tau; } }
          if (st > 1) { const c0 = bl; for (let tau = Math.max(-Lg, c0 - st + 1); tau <= Math.min(Lg, c0 + st - 1); tau++) { if (tau === c0) continue; const v = h2At(tau); if (v > best) { best = v; bl = tau; } } }
          const o2 = (ri * N + j) * nW + w; H[o2] = Math.min(1, best); Lout[o2] = bl;
        }
      }
      if (progress) progress((ri + 1) / rows.length);
    });
    return { H, L: Lout };
  }
  /** graphe orienté de chaque fenêtre (seuil thr) → degré sortant (médiane sur les fenêtres) et entrant de chaque voie.
   *  H, L : tableaux complets N × N × nWin (ligne = voie x) ; keep : indices des voies retenues (toutes par défaut) */
  function ceiDegrees(H, L, N, nW, thr, keep) {
    const outW = Array.from({ length: N }, () => new Float32Array(nW)), inW = Array.from({ length: N }, () => new Float32Array(nW)), at = (i, j, w) => (i * N + j) * nW + w;
    const ix = keep ? keep.slice() : Array.from({ length: N }, (_, i) => i);   // voies retenues (exclusions après le calcul)
    for (let w = 0; w < nW; w++) for (let u = 0; u < ix.length; u++) for (let v = u + 1; v < ix.length; v++) {
      const i = ix[u], j = ix[v], a = H[at(i, j, w)], b = H[at(j, i, w)]; if (Math.max(a, b) < thr) continue;
      let from = -1, to = -1;
      if (a >= b) { const tau = L[at(i, j, w)]; if (tau > 0) { from = i; to = j; } else if (tau < 0) { from = j; to = i; } }
      else { const tau = L[at(j, i, w)]; if (tau > 0) { from = j; to = i; } else if (tau < 0) { from = i; to = j; } }
      if (from >= 0) { outW[from][w]++; inW[to][w]++; }
    }
    const med = a => { const s = Array.from(a).sort((x, y) => x - y), m = s.length >> 1; return s.length ? (s.length & 1 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };
    return { out: outW.map(med), in: inW.map(med) };
  }
  /** cEI à partir de l'EI et du degré sortant */
  function ceiCombine(ei, out) {
    const me = Math.max(0, ...ei), mo = Math.max(0, ...out), s = ei.map((v, i) => (me > 0 ? v / me : 0) + (mo > 0 ? out[i] / mo : 0)), ms = Math.max(0, ...s);
    return s.map(v => ms > 0 ? v / ms : 0);
  }
  /** cEI complet sur le fil courant (tests) : list (signaux bruts de la fenêtre), fs, ei → { cei, out, in, fs2 } */
  function cei(list, fs, ei, o) {
    o = Object.assign({}, CEI, o || {}); const P = ceiPrep(list, fs, o), f2 = P.fs, W = Math.round(o.win * f2), step = Math.max(1, Math.round(o.step * f2)), lag = Math.round(o.lag * f2);
    const len = P.sig[0].length, first = lag, nWin = Math.max(0, Math.floor((len - 2 * lag - W) / step) + 1), N = list.length;
    const r = h2Batch(P.sig, list.map((_, i) => i), { W, step, lag, first, nWin, bins: o.bins }), D = ceiDegrees(r.H, r.L, N, nWin, o.thr);
    return { cei: ceiCombine(ei || new Array(N).fill(0), D.out), out: D.out, in: D.in, H: r.H, L: r.L, nWin, fs2: f2 };
  }

  // ================================================================ entropie de permutation, PEI
  const PE = { D: 3, tau: 1, win: 5, step: 2.5, pre: 60, post: 60, tauMode: 'auto', artRms: 20, artLf: 0.85, artChRms: 15, artChLf: 0.5, artChFrac: 0.25, flatFrac: 0.5, maxIctal: 600 };
  /** τ effectif : l'article (512 / 1 024 Hz, τ = 1) regarde des triplets de 4 à 6 ms ; à 1 024 Hz τ = 2 garde la même échelle de
   *  temps, à 256 Hz on ne peut pas descendre sous τ = 1 (échelle deux fois plus grossière, signalée dans l'interface) */
  function peTau(fs, o) { if (o && o.tauMode === 'manual' && o.tau >= 1) return Math.round(o.tau); return Math.max(1, Math.round((fs || 512) / 512)); }
  const FACT = [1, 1, 2, 6, 24, 120, 720, 5040];
  /** code (0 … D!−1) du motif ordinal de x[i], x[i+τ], …, x[i+(D−1)τ] (code de Lehmer ; égalités : ordre d'apparition) */
  function ordinal(x, i, D, tau) {
    let c = 0;
    for (let a = 0; a < D - 1; a++) { const va = x[i + a * tau]; let r = 0; for (let b = a + 1; b < D; b++) if (x[i + b * tau] < va) r++; c = c * (D - a) + r; }
    return c;
  }
  /** entropie de permutation normalisée (0–1) sur fenêtres glissantes : { pe, t0 (centre de la 1re fenêtre, s), dt } */
  function permEntropy(x, fs, o) {
    o = Object.assign({}, PE, o || {}); const D = o.D, tau = peTau(fs, o), nf = FACT[D], span = (D - 1) * tau, Wn = Math.max(D + span, Math.round(o.win * fs)), hop = Math.max(1, Math.round(o.step * fs));
    const nP = x.length - span; if (nP < Wn - span) return { pe: new Float32Array(0), rms: new Float32Array(0), lf: new Float32Array(0), flat: new Float32Array(0), t0: 0, dt: hop / fs, tau };
    const code = new Uint16Array(Math.max(0, nP)); for (let i = 0; i < nP; i++) code[i] = ordinal(x, i, D, tau);
    const nWin = Math.floor((x.length - Wn) / hop) + 1, pe = new Float32Array(nWin), cnt = new Float64Array(nf), m = Wn - span, ln = Math.log(nf);
    // par fenêtre : RMS, part de la variance sous ~2 Hz (moyenne glissante de fs/3 échantillons), part d'échantillons plats
    const rms = new Float32Array(nWin), lf = new Float32Array(nWin), flat = new Float32Array(nWin), L = Math.max(2, Math.round(fs / 3));
    for (let w = 0; w < nWin; w++) {
      const a = w * hop; cnt.fill(0); for (let i = a; i < a + m; i++) cnt[code[i]]++;
      let h = 0; for (let k = 0; k < nf; k++) if (cnt[k]) { const p = cnt[k] / m; h -= p * Math.log(p); } pe[w] = h / ln;
      let s1 = 0, s2 = 0, nz = 0; for (let i = a; i < a + Wn; i++) { s1 += x[i]; s2 += x[i] * x[i]; if (i > a && x[i] === x[i - 1]) nz++; }
      const mu = s1 / Wn, v = Math.max(0, s2 / Wn - mu * mu); rms[w] = Math.sqrt(v); flat[w] = nz / (Wn - 1);
      // variance basse fréquence : moyenne glissante de L échantillons (filtre en boîte, coupure ≈ 0,44 fs / L ≈ 1,3 Hz)
      let acc = 0, vl = 0, n2 = 0; for (let i = a; i < a + Wn; i++) { acc += x[i]; if (i - a >= L) acc -= x[i - L]; if (i - a >= L - 1) { const y = acc / L - mu; vl += y * y; n2++; } }
      lf[w] = v > 0 && n2 ? Math.min(1, (vl / n2) / v) : 0;
    }
    return { pe, rms, lf, flat, t0: Wn / fs / 2, dt: hop / fs, tau };
  }
  function peBatch(list, fs, o, progress) { const pes = [], meta = []; let t0 = 0, dt = 0, tau = 1; list.forEach((x, i) => { const r = permEntropy(x, fs, o); pes.push(r.pe); meta.push({ rms: r.rms, lf: r.lf, flat: r.flat }); t0 = r.t0; dt = r.dt; tau = r.tau; if (progress && i % 4 === 3) progress((i + 1) / list.length); }); return { pes, meta, t0, dt, tau }; }
  /** fenêtres d'une période [a, b] : entièrement comprises, sinon centre compris, sinon la plus proche */
  function periodIdx(n, t0, dt, win, a, b) {
    const inner = [], cen = []; let near = -1, nd = Infinity;
    for (let i = 0; i < n; i++) { const c = t0 + i * dt; if (c - win / 2 >= a - 1e-9 && c + win / 2 <= b + 1e-9) inner.push(i); if (c >= a && c <= b) cen.push(i); const d = Math.abs(c - (a + b) / 2); if (d < nd) { nd = d; near = i; } }
    return inner.length ? inner : cen.length ? cen : near >= 0 ? [near] : [];
  }
  /** PEI des voies. pes : [Float32Array] (fenêtres alignées), onset, offset (s) → rows [{ B, m, M, raw, pei, dE, tMin, tMax }] */
  /** PEI des voies (Bratu 2024), avec deux garde-fous absents de l'article mais implicites dans sa méthode (voies artefactées
   *  écartées à l'œil, plots de substance grise seuls) :
   *   - o.meta[k] = { rms, lf, flat } par fenêtre (peBatch) : une fenêtre est écartée si elle est plate (> flatFrac d'échantillons
   *     identiques : déconnexion, saturation, coupure d'un EDF+D) ou si son amplitude dépasse artRms × la RMS médiane préictale
   *     de la voie avec plus de artLf de variance sous ~1,5 Hz (artefact de mouvement : grande déflexion lente qui abaisse
   *     l'entropie de permutation sans rien dire de l'épileptogénicité) ; une voie dont toutes les fenêtres ictales ou
   *     postictales sont écartées n'a pas de PEI (raw 0, art = nombre de fenêtres écartées) ; une voie dont plus de artChFrac
   *     des fenêtres péri-ictales dépassent artChRms × la RMS préictale avec une variance surtout lente (artChLf) est
   *     « artefactée » (artCh = true) : elle garde une valeur mais ne sert pas à la normalisation, comme une voie écartée à l'œil ;
   *   - o.norm[k] (booléen) : voies qui participent à la normalisation (plots en substance grise) ; les autres reçoivent une
   *     valeur relative à ce maximum et sont marquées wm = true. */
  function pei(pes, t0, dt, onset, offset, o) {
    o = Object.assign({}, PE, o || {}); const n = pes.length ? pes[0].length : 0, win = o.win, meta = o.meta || null, norm = o.norm || null;
    const iPre = periodIdx(n, t0, dt, win, Math.max(0, onset - o.pre), onset), iIct = periodIdx(n, t0, dt, win, onset, offset), iPost = periodIdx(n, t0, dt, win, offset, offset + o.post);
    const med = a => { const s = a.filter(v => isFinite(v)).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
    const rows = pes.map((pe, k) => {
      const mt = meta && meta[k], base = mt ? med(iPre.map(i => mt.rms[i])) : 0;
      const bad = i => { if (!mt) return false; if (mt.flat[i] >= o.flatFrac) return true; if (base > 0 && mt.rms[i] >= o.artRms * base && mt.lf[i] >= o.artLf) return true; return false; };
      let B = 0, nB = 0; for (const i of iPre) if (!bad(i)) { B += pe[i]; nB++; } B = nB ? B / nB : 0;
      let m = Infinity, tMin = null, art = 0; for (const i of iIct) { if (bad(i)) { art++; continue; } if (pe[i] < m) { m = pe[i]; tMin = t0 + i * dt; } }
      let M = -Infinity, tMax = null; for (const i of iPost) { if (bad(i)) { art++; continue; } if (pe[i] > M) { M = pe[i]; tMax = t0 + i * dt; } }
      let nBig = 0, nTot = 0; if (mt && base > 0) for (const i of iIct.concat(iPost)) { nTot++; if (mt.rms[i] >= o.artChRms * base && mt.lf[i] >= o.artChLf) nBig++; }
      const artCh = nTot > 0 && nBig / nTot >= o.artChFrac, raw = isFinite(m) && isFinite(M) && m > 1e-6 ? M / m : 0;
      return { B, m: isFinite(m) ? m : null, M: isFinite(M) ? M : null, raw, dE: isFinite(m) ? B - m : null, tMin, tMax, art, artCh, artFrac: nTot ? nBig / nTot : 0, wm: norm ? !norm[k] : false };
    });
    const ref = rows.filter(r => !r.wm && !r.artCh), mx = Math.max(0, ...(ref.length ? ref : rows).map(r => r.raw)); rows.forEach(r => { r.pei = mx > 0 ? r.raw / mx : 0; });
    // tendance globale (médiane des voies retenues par fenêtre ictale) : si le minimum global tombe dans le dernier cinquième
    // de la période ictale d'une crise de plus de 45 s, la marque de fin est peut-être posée dans le ralentissement postcritique
    let endLow = false; if (iIct.length >= 5 && offset - onset > 45) { const keep = rows.map((r, k) => !r.wm && !r.artCh ? k : -1).filter(k => k >= 0); const gm = iIct.map(i => med(keep.map(k => pes[k][i]))); let am = 0; for (let j = 1; j < gm.length; j++) if (gm[j] < gm[am]) am = j; endLow = am >= Math.floor(0.8 * (gm.length - 1)); }
    const cov = { pre: iPre.length ? [t0 + iPre[0] * dt - win / 2, t0 + iPre[iPre.length - 1] * dt + win / 2] : null, post: iPost.length ? [t0 + iPost[0] * dt - win / 2, t0 + iPost[iPost.length - 1] * dt + win / 2] : null, nIct: iIct.length,
      endLow, nArt: rows.filter(r => r.art).length, nArtCh: rows.filter(r => r.artCh).length, nWm: rows.filter(r => r.wm).length, longIctal: offset - onset > o.maxIctal ? offset - onset : 0, mx };
    return { rows, cov };
  }

  // ================================================================ Delphos
  const DELPHOS = { fmin: 8, fmax: 0, vpo: 12, n: 20, thr: 40, oscRatio: 1.38, oscSpread: 8.5, spkRatio: 1.25, spkSpread: 10.2, statsMax: 30, chunk: 8 };
  const HFO_BANDS = [['vfo', 500, Infinity], ['fr', 250, 500], ['r', 80, 250], ['g', 24, 80], ['b', 12.4, 24], ['a', 7.4, 12.4], ['t', 3.5, 7.4], ['d', 1, 3.5]];
  const bandOf = f => { for (const [k, a, b] of HFO_BANDS) if (f >= a && f < b) return k; return 'd'; };
  /** fréquence maximale analysable : le support de l'ondelette (≈ 1,6 fc) doit rester sous Nyquist */
  const delphosFmax = (fs, o) => { const m = 0.31 * fs; return o && o.fmax > 0 ? Math.min(o.fmax, m) : m; };
  /** plan d'analyse (échelles, spectres des ondelettes, décimation, réponse impulsionnelle) pour fs et une taille de bloc */
  function delphosPlan(fs, o) {
    o = Object.assign({}, DELPHOS, o || {}); const fmax = delphosFmax(fs, o), freqs = [];
    for (let k = 0; ; k++) { const f = o.fmin * Math.pow(2, k / o.vpo); if (f > fmax * (1 + 1e-9)) break; freqs.push(f); }
    const margin = Math.ceil(fs * Math.max(0.25, 6 / o.fmin)), Nn = 1 << Math.ceil(Math.log2(Math.max(4 * margin, o.chunk * fs))), x0 = Math.sqrt(o.n / 2), df = fs / Nn;
    const scales = freqs.map(fc => {
      let m0 = Math.max(1, Math.floor(fc * 0.35 / df)), m1 = Math.min(Nn / 2, Math.ceil(fc * 1.75 / df)); const psi = new Float32Array(m1 - m0 + 1);
      for (let m = m0; m <= m1; m++) { const u = (m * df) / fc; psi[m - m0] = Math.exp(o.n * Math.log(u) - x0 * x0 * (u * u - 1)); }
      let dec = 1; while (dec < 64 && fs / (2 * dec) >= 4 * fc) dec *= 2;   // cadence réduite (≥ 4 fc) : support borné de l'ondelette
      while (dec > 1 && m1 >= Nn / (2 * dec)) dec /= 2;
      return { fc, m0, m1, psi, dec };
    });
    const P = { fs, o, freqs, scales, N: Nn, margin, hop: Nn - 2 * margin };
    // réponse impulsionnelle : largeur à mi-hauteur (échantillons) de |W|² d'un Dirac, échelle par échelle
    const d = new Float32Array(Nn); d[Nn >> 1] = 1; const E = cwtChunk(P, d, null);
    P.impW = scales.map((s, k) => { const row = E[k], c = Nn >> 1; let mx = 0, im = c; for (let t = c - margin; t < c + margin; t++) if (row[t] > mx) { mx = row[t]; im = t; } return Math.max(1, fwhm1(row, im, mx / 2, 0, Nn - 1)); });
    return P;
  }
  /** largeur à mi-hauteur autour de i (interpolation linéaire) */
  function fwhm1(row, i, half, lo, hi) {
    let a = i; while (a > lo && row[a - 1] >= half) a--; let b = i; while (b < hi && row[b + 1] >= half) b++;
    const fa = a > lo ? a - (row[a] - half) / ((row[a] - row[a - 1]) || 1e-30) : a, fb = b < hi ? b + (row[b] - half) / ((row[b] - row[b + 1]) || 1e-30) : b;
    return fb - fa;
  }
  const ffts = new Map(); const plan = n => { if (!ffts.has(n)) ffts.set(n, IE.fftPlan(n)); return ffts.get(n); };
  /** CWT d'un bloc de N échantillons → par échelle : |W|² (stats = null) ou |Z|² normalisé (stats = [{ mr, sr, mi, si }]) ;
   *  collect(k, re, im, dec) reçoit les coefficients bruts (statistiques ZH0) */
  function cwtChunk(P, x, stats, collect, noE) {
    const N = P.N, B = P._buf || (P._buf = { re: new Float64Array(N), im: new Float64Array(N), z: new Map() }), re = B.re, im = B.im;
    for (let i = 0; i < N; i++) { re[i] = i < x.length ? x[i] : 0; im[i] = 0; } IE.fft(re, im, plan(N));
    const out = [];
    P.scales.forEach((s, k) => {
      const n2 = N / s.dec; let zb = B.z.get(n2); if (!zb) { zb = { r: new Float64Array(n2), i: new Float64Array(n2) }; B.z.set(n2, zb); } const zr = zb.r, zi = zb.i; zr.fill(0); zi.fill(0);
      // spectre analytique (fréquences positives) × ψ̂ ; IFFT conjuguée à cadence réduite : z(t·dec) ∝ ifft(n2)
      for (let m = s.m0; m <= s.m1; m++) { const p = s.psi[m - s.m0]; zr[m] = re[m] * p; zi[m] = -im[m] * p; }
      IE.fft(zr, zi, plan(n2)); for (let t = 0; t < n2; t++) zi[t] = -zi[t];
      if (collect) collect(k, zr, zi, s.dec);
      if (noE) return;
      const e = s.dec === 1 ? new Float32Array(N) : (B.e || (B.e = new Float32Array(N)));
      if (stats) { const S = stats[k]; for (let t = 0; t < n2; t++) { const a = (zr[t] - S.mr) / S.sr, b = (zi[t] - S.mi) / S.si; e[t] = a * a + b * b; } }
      else for (let t = 0; t < n2; t++) e[t] = zr[t] * zr[t] + zi[t] * zi[t];
      if (s.dec === 1) { out.push(e); return; }
      const full = new Float32Array(N), d = s.dec; for (let a = 0; a < n2; a++) { const v0 = e[a], v1 = e[a + 1 < n2 ? a + 1 : a], o = a * d; for (let j = 0; j < d; j++) full[o + j] = v0 + (v1 - v0) * j / d; } out.push(full);
    });
    return out;
  }
  /** moyenne et écart-type robustes (valeurs entre Q1 − 1,5 IQR et Q3 + 1,5 IQR) */
  function robust(v) {
    const s = Float64Array.from(v).sort(), n = s.length; if (!n) return [0, 1]; const q = p => s[Math.min(n - 1, Math.floor(p * (n - 1)))], q1 = q(0.25), q3 = q(0.75), lo = q1 - 1.5 * (q3 - q1), hi = q3 + 1.5 * (q3 - q1);
    let m = 0, c = 0; for (const x of s) if (x >= lo && x <= hi) { m += x; c++; } m /= c || 1; let v2 = 0; for (const x of s) if (x >= lo && x <= hi) v2 += (x - m) * (x - m); const sd = Math.sqrt(v2 / Math.max(1, c - 1));
    return [m, sd > 0 ? sd : 1];
  }
  /** détection Delphos sur une voie : x (signal de la fenêtre d'analyse), P (plan) → { events: [{ t, f, kind, band, dur, amp, tr, fsp }] } */
  function delphos(x, P) {
    const o = P.o, N = P.N, M = P.margin, hop = P.hop, K = P.scales.length, len = x.length; if (!K || len < 2 * M) return { events: [] };
    const starts = []; for (let a = -M; a < len - M; a += hop) starts.push(a);
    const block = a => { const b = new Float32Array(N); for (let i = 0; i < N; i++) { let j = a + i; if (j < 0) j = -j; if (j >= len) j = Math.max(0, 2 * len - 2 - j); b[i] = x[j]; } return b; };   // bords : miroir
    // 1. statistiques ZH0 sur ≤ statsMax s réparties dans la fenêtre
    const nStat = Math.max(1, Math.min(starts.length, Math.ceil(o.statsMax * P.fs / hop))), pick = []; for (let i = 0; i < nStat; i++) pick.push(starts[Math.floor(i * starts.length / nStat)]);
    const cap = 12000, R = P.scales.map(() => []), I = P.scales.map(() => []);
    for (const a of pick) cwtChunk(P, block(a), null, (k, zr, zi, dec) => { const s0 = Math.floor(M / dec), s1 = Math.floor((N - M) / dec), stp = Math.max(1, Math.floor((s1 - s0) * nStat / cap)); for (let t = s0; t < s1; t += stp) { R[k].push(zr[t]); I[k].push(zi[t]); } }, true);
    const stats = P.scales.map((_, k) => { const [mr, sr] = robust(R[k]), [mi, si] = robust(I[k]); return { mr, sr, mi, si }; });
    // 2. maxima locaux de |Z|², forme de chaque îlot
    const ev = [], thr = o.thr, kSp = o.vpo / 12;
    for (const a of starts) {
      const E = cwtChunk(P, block(a), stats), t0 = M, t1 = Math.min(N - M, len - a);
      for (let k = 0; k < K; k++) {
        const row = E[k], up = k + 1 < K ? E[k + 1] : null, dn = k > 0 ? E[k - 1] : null;
        for (let t = t0; t < t1; t++) {
          const v = row[t]; if (v < thr || !(v > row[t - 1]) || v < row[t + 1]) continue;
          if (up && (v < up[t] || v < up[t - 1] || v < up[t + 1])) continue; if (dn && (v <= dn[t] || v <= dn[t - 1] || v <= dn[t + 1])) continue;
          const wT = fwhm1(row, t, v / 2, 0, N - 1), tr = wT / P.impW[k];
          let ka = k; while (ka > 0 && E[ka - 1][t] >= v / 2) ka--; let kb = k; while (kb < K - 1 && E[kb + 1][t] >= v / 2) kb++;
          const fa = ka > 0 ? ka - (E[ka][t] - v / 2) / ((E[ka][t] - E[ka - 1][t]) || 1e-30) : ka, fb = kb < K - 1 ? kb + (E[kb][t] - v / 2) / ((E[kb][t] - E[kb + 1][t]) || 1e-30) : kb, fsp = fb - fa;
          let kind = null; if (tr >= o.oscRatio && fsp <= o.oscSpread * kSp) kind = 'osc'; else if (tr <= o.spkRatio && fsp >= o.spkSpread * kSp) kind = 'spike';
          if (!kind) continue; const f = P.freqs[k];
          ev.push({ t: (a + t) / P.fs, f: Math.round(f * 10) / 10, kind, band: kind === 'osc' ? bandOf(f) : 'spk', dur: Math.round(wT / P.fs * 1e4) / 1e4, amp: Math.round(v * 10) / 10, tr: Math.round(tr * 100) / 100, fsp: Math.round(fsp * 10) / 10 });
        }
      }
    }
    // 3. doublons : même type (et même bande) qui se chevauchent → le plus fort
    ev.sort((p, q) => p.t - q.t); const out = [];
    for (const e of ev) {
      let dup = -1; for (let j = out.length - 1; j >= 0 && e.t - out[j].t < 0.25; j--) { const p = out[j]; if (p.band !== e.band) continue; const gap = e.kind === 'spike' ? 0.1 : Math.max(0.02, (p.dur + e.dur) / 2); if (e.t - p.t < gap) { dup = j; break; } }
      if (dup < 0) out.push(e); else if (e.amp > out[dup].amp) out[dup] = e;
    }
    return { events: out };
  }
  /** lot de voies (worker) : { events: [[…]], impW, freqs } */
  function delphosBatch(list, fs, o, progress) {
    const P = delphosPlan(fs, o), events = [], coup = [], sw = o && o.slow;
    list.forEach((x, i) => {
      const ev = delphos(x, P).events; events.push(ev);
      if (sw) { const ph = slowPhase(x, fs, sw), at = b => phaseCoupling(ev.filter(e => b.includes(e.band)).map(e => e.t), ph, 0); coup.push({ hfo: at(['r', 'fr', 'vfo']), fr: at(['fr', 'vfo']), spk: at(['spk']) }); }
      if (progress) progress((i + 1) / list.length);
    });
    return { events, coup: sw ? coup : null, freqs: P.freqs.map(f => Math.round(f * 10) / 10), fmax: Math.round(delphosFmax(fs, o) * 10) / 10 };
  }
  /** taux par minute d'une voie */
  function delphosRates(events, durSec) {
    const c = { spk: 0, r: 0, fr: 0, g: 0, vfo: 0 }; for (const e of events) if (e.band in c) c[e.band]++;
    const per = 60 / Math.max(1e-6, durSec), r = { nSpk: c.spk, nR: c.r, nFR: c.fr, nG: c.g, nVFO: c.vfo, spk: c.spk * per, r: c.r * per, fr: c.fr * per, g: c.g * per, vfo: c.vfo * per };
    r.hfo = r.r + r.fr + r.vfo; r.cross = Math.sqrt(r.spk * r.hfo); return r;
  }


  // ================================================================ connectivité h² : évolution au fil de la crise, force des nœuds
  const H2BANDS = { large: [1, 45], delta: [0.5, 3.4], theta: [3.4, 7.4], alpha: [7.4, 12.4], beta: [12.4, 24], gamma: [24, 45], bg: [12, 45] };
  /** liens de chaque fenêtre (h² ≥ thr, sens de plus fort h², direction par le signe du délai ; délai nul : non orienté) ;
   *  degrés sortant / entrant et force (h² moyen des liens de la voie) par fenêtre ; keep : voies retenues ; maxE : liens gardés par fenêtre ;
   *  skip : paires ignorées (Uint8Array N × N, ex. dérivations bipolaires voisines qui partagent un plot) */
  function h2Frames(H, L, N, nW, thr, keep, maxE, skip) {
    const at = (i, j, w) => (i * N + j) * nW + w, ix = keep ? keep.slice() : Array.from({ length: N }, (_, i) => i), M = maxE || 120, deg = partners(ix, N, skip);
    const outW = Array.from({ length: N }, () => new Float32Array(nW)), inW = Array.from({ length: N }, () => new Float32Array(nW)), strW = Array.from({ length: N }, () => new Float32Array(nW)), frames = [], glob = new Float32Array(nW);
    for (let w = 0; w < nW; w++) {
      const E = []; let sum = 0, np = 0;
      for (let u = 0; u < ix.length; u++) for (let v = u + 1; v < ix.length; v++) {
        const i = ix[u], j = ix[v]; if (skip && skip[i * N + j]) continue; const a = H[at(i, j, w)], b = H[at(j, i, w)], m = Math.max(a, b); sum += m; np++; strW[i][w] += m; strW[j][w] += m;
        if (m < thr) continue; const tau = a >= b ? L[at(i, j, w)] : -L[at(j, i, w)];   // > 0 : i précède j
        if (tau > 0) { E.push([i, j, m, 1]); outW[i][w]++; inW[j][w]++; } else if (tau < 0) { E.push([j, i, m, 1]); outW[j][w]++; inW[i][w]++; } else E.push([i, j, m, 0]);
      }
      glob[w] = np ? sum / np : 0; for (const i of ix) strW[i][w] /= Math.max(1, deg[i]);
      E.sort((p, q) => q[2] - p[2]); frames.push(E.slice(0, M));
    }
    return { frames, outW, inW, strW, glob };
  }
  /** connectivité intercritique : force de chaque nœud (h² moyen de tous ses liens, les deux sens, toutes fenêtres — Courtens
   *  2016, Lagarde 2018), forces sortante et entrante, h² moyen de chaque paire et part des fenêtres où i précède j */
  /** nombre de partenaires de chaque voie retenue (paires ignorées exclues : skip[i·N + j] = 1) */
  function partners(ix, N, skip) { const d = new Float32Array(N); for (let u = 0; u < ix.length; u++) for (let v = u + 1; v < ix.length; v++) { const i = ix[u], j = ix[v]; if (skip && skip[i * N + j]) continue; d[i]++; d[j]++; } return d; }
  function h2Strength(H, L, N, nW, keep, skip) {
    const at = (i, j, w) => (i * N + j) * nW + w, ix = keep ? keep.slice() : Array.from({ length: N }, (_, i) => i), deg = partners(ix, N, skip);
    const strength = new Float32Array(N), outS = new Float32Array(N), inS = new Float32Array(N), pair = new Float32Array(N * N), lead = new Float32Array(N * N);
    for (let u = 0; u < ix.length; u++) for (let v = u + 1; v < ix.length; v++) {
      const i = ix[u], j = ix[v]; if (skip && skip[i * N + j]) continue; let s = 0, sij = 0, sji = 0, ij = 0, ji = 0;
      for (let w = 0; w < nW; w++) { const a = H[at(i, j, w)], b = H[at(j, i, w)]; sij += a; sji += b; s += (a + b) / 2; const tau = a >= b ? L[at(i, j, w)] : -L[at(j, i, w)]; if (tau > 0) ij++; else if (tau < 0) ji++; }
      const m = s / nW; pair[i * N + j] = pair[j * N + i] = m; const nd = ij + ji, od = nd >= 0.5 * nW;   // sens jugé sur les fenêtres orientées, si elles sont la majorité (délai nul : plot commun, conduction en volume)
      lead[i * N + j] = od ? ij / nd : 0.5; lead[j * N + i] = od ? ji / nd : 0.5;
      strength[i] += (sij + sji) / (2 * nW); strength[j] += (sij + sji) / (2 * nW); outS[i] += sij / nW; inS[j] += sij / nW; outS[j] += sji / nW; inS[i] += sji / nW;
    }
    for (const i of ix) { const K = Math.max(1, deg[i]); strength[i] /= K; outS[i] /= K; inS[i] /= K; }
    return { strength, outS, inS, pair, lead };
  }
  /** réseau de toute la crise, « aplati » sur le temps : pour chaque paire, nombre de fenêtres où le lien est présent
   *  (les liens qui reviennent souvent s'additionnent), h² moyen, sens majoritaire (2 : 1, sinon non orienté) ;
   *  frames : [[a, b, h·1000, dir]] par fenêtre ; o { minFrac 0,1, minN 2, maxE 80 } → [[a, b, hMoyen, dir, n]] par n décroissant */
  function netFlatten(frames, o) {
    o = Object.assign({ minFrac: 0.1, minN: 2, maxE: 80 }, o || {}); const nF = (frames || []).length, cnt = new Map();
    for (const f of frames || []) for (const [i, j, h, d] of f) { const a = Math.min(i, j), b = Math.max(i, j), k = a * 65536 + b; let x = cnt.get(k); if (!x) cnt.set(k, x = { a, b, n: 0, h: 0, ab: 0, ba: 0 }); x.n++; x.h += h; if (d) { if (i === a) x.ab++; else x.ba++; } }
    const lim = Math.max(o.minN, Math.ceil(o.minFrac * nF));
    return [...cnt.values()].filter(x => x.n >= lim).sort((p, q) => q.n - p.n || q.h - p.h).slice(0, o.maxE)
      .map(x => { const h = Math.round(x.h / x.n); return x.ab >= 2 * x.ba && x.ab ? [x.a, x.b, h, 1, x.n] : x.ba >= 2 * x.ab && x.ba ? [x.b, x.a, h, 1, x.n] : [x.a, x.b, h, 0, x.n]; });
  }
  /** liens entre deux fenêtres, à une position fractionnaire u (fondu enchaîné, transition adoucie) : [[a, b, h·1000, dir, alpha]] ;
   *  un lien présent des deux côtés garde alpha 1 (h interpolé), un lien qui apparaît ou disparaît s'estompe (alpha 0 → 1) */
  function netInterp(frames, u) {
    const nF = (frames || []).length; if (!nF) return []; u = Math.max(0, Math.min(nF - 1, u)); const f = Math.floor(u), g = Math.min(nF - 1, f + 1), t = u - f, sm = t * t * (3 - 2 * t), m = new Map();
    const add = (fr, wg) => { if (!(wg > 0)) return; for (const [i, j, h, d] of fr || []) { const a = Math.min(i, j), b = Math.max(i, j), k = a * 65536 + b; let x = m.get(k); if (!x) m.set(k, x = { h: 0, al: 0, i, j, d, wd: -1 }); x.h += wg * h; x.al += wg; if (wg > x.wd) { x.wd = wg; x.i = i; x.j = j; x.d = d; } } };
    add(frames[f], 1 - sm); if (g !== f) add(frames[g], sm);
    return [...m.values()].map(x => [x.i, x.j, Math.round(x.h / Math.max(1e-9, x.al)), x.d, Math.min(1, x.al)]);
  }
  /** h² dans le fil courant (tests) : liste de signaux bruts, fs, o { band, win, step, lag, lagStep } → { H, L, nWin, fs2 } */
  function h2Run(list, fs, o) {
    o = Object.assign({ band: [1, 45], win: 3, step: 1, lag: 0.1, lagStep: 1 }, o || {}); const P = ceiPrep(list, fs, { band: o.band }), f2 = P.fs, W = Math.round(o.win * f2), step = Math.max(1, Math.round(o.step * f2)), lag = Math.round(o.lag * f2);
    const len = P.sig[0].length, first = lag, nWin = Math.max(0, Math.floor((len - 2 * lag - W) / step) + 1);
    const r = h2Batch(P.sig, list.map((_, i) => i), { W, step, lag, first, nWin, bins: CEI.bins, lagStep: o.lagStep }); return Object.assign(r, { nWin, fs2: f2, W, step, lag });
  }

  // ================================================================ pointes et HFO : co-occurrence, couplage à l'onde lente
  /** pointes accompagnées d'une oscillation rapide (ripple, fast ripple) : centre de l'HFO à moins de win s du maximum de la pointe */
  function cooccur(events, win) {
    const w = win == null ? 0.1 : win, spk = events.filter(e => e.band === 'spk'), hf = events.filter(e => e.band === 'r' || e.band === 'fr' || e.band === 'vfo').sort((a, b) => a.t - b.t);
    let nR = 0, nFR = 0, nH = 0;
    for (const s of spk) { let r = false, f = false; for (const e of hf) { if (e.t < s.t - w) continue; if (e.t > s.t + w) break; if (e.band === 'r') r = true; else f = true; } if (r) nR++; if (f) nFR++; if (r || f) nH++; }
    return { nSpk: spk.length, nSpkR: nR, nSpkFR: nFR, nSpkHFO: nH };
  }
  /** phase de l'onde lente (passe-bande aller-retour puis signal analytique par FFT), à cadence réduite : { phase, fs2 } */
  function slowPhase(x, fs, band) {
    const b = band || [0.5, 2], q = Math.max(1, Math.floor(fs / 64)), f2 = fs / q, y0 = q > 1 ? IE.decimate(x, q, fs) : Float32Array.from(x), y = bandpass(y0, f2, b[0], b[1]);
    let n = 1; while (n < y.length) n <<= 1; const re = new Float64Array(n), im = new Float64Array(n); for (let i = 0; i < y.length; i++) re[i] = y[i];
    const P = plan(n); IE.fft(re, im, P);   // signal analytique : fréquences négatives annulées, positives doublées
    for (let k = 1; k < n / 2; k++) { re[k] *= 2; im[k] *= 2; } for (let k = n / 2 + 1; k < n; k++) { re[k] = 0; im[k] = 0; }
    for (let k = 0; k < n; k++) im[k] = -im[k]; IE.fft(re, im, P);   // IFFT conjuguée (échelle sans effet sur la phase)
    const phase = new Float32Array(y.length); for (let i = 0; i < y.length; i++) phase[i] = Math.atan2(-im[i], re[i]);
    return { phase, fs2: f2 };
  }
  /** couplage des évènements à la phase de l'onde lente : longueur du vecteur moyen (0–1), phase préférée (degrés ; 0 = crête
   *  de l'onde lente de la dérivation, ±180 = creux), test de Rayleigh */
  function phaseCoupling(times, ph, t0) {
    let c = 0, s = 0, n = 0; for (const t of times) { const i = Math.round((t - t0) * ph.fs2); if (i < 0 || i >= ph.phase.length) continue; c += Math.cos(ph.phase[i]); s += Math.sin(ph.phase[i]); n++; }
    if (!n) return { n: 0, mvl: 0, phase: null, p: 1 }; const R = Math.hypot(c, s) / n, Z = n * R * R, p = Math.min(1, Math.exp(-Z) * (1 + (2 * Z - Z * Z) / (4 * n) - (24 * Z - 132 * Z * Z + 76 * Z ** 3 - 9 * Z ** 4) / (288 * n * n)));
    return { n, mvl: R, phase: Math.round(Math.atan2(s, c) * 180 / Math.PI), p: Math.max(0, p) };
  }

  // ================================================================ temps-fréquence de Morlet (v4.18)
  /** ondelette de Morlet d'indice k (k périodes à mi-hauteur en temps : FWHMt = k / f) : en fréquence, gaussienne d'écart-type
   *  σf = 2,3548 f / (2π k) = 0,3748 f / k ; fréquence maximale analysable : f + 4σf sous 0,95 × Nyquist */
  const MORLET_SF = 0.3748;
  const morletFmax = (fs, k) => Math.floor(0.95 * 0.5 * fs / (1 + 4 * MORLET_SF / (k || 8)));
  /** grille de fréquences pseudo-linéaire : 1 Hz jusqu'à 30 Hz, 2 Hz jusqu'à 100 Hz, 4 Hz au-delà (≤ fmax) */
  function fpFreqs(fmax) { const f = []; for (let v = 1; v <= Math.min(30, fmax); v++) f.push(v); for (let v = 32; v <= Math.min(100, fmax); v += 2) f.push(v); for (let v = 104; v <= fmax; v += 4) f.push(v); return f; }
  /** puissance temps-fréquence (Morlet, analytique) de x, moyennée par cases de dt sur [a, b[ (s depuis le début de x) :
   *  { P: Float32Array (nF × nT, ligne = fréquence), nF, nT, dt, a }. Spectre de x calculé une fois (FFT, bourrage de zéros) ;
   *  pour chaque fréquence, bande f ± 4σf ramenée en bande de base puis FFT inverse courte (|z|² ne dépend pas du décalage) */
  function morletTF(x, fs, freqs, o) {
    o = Object.assign({ k: 8, dt: 0.1, a: 0, b: x.length / fs }, o || {}); const len = x.length; let N = 1; while (N < len) N <<= 1;
    let m = 0; for (let i = 0; i < len; i++) m += x[i]; m /= len || 1;
    const re = new Float64Array(N), im = new Float64Array(N); for (let i = 0; i < len; i++) re[i] = x[i] - m; IE.fft(re, im, plan(N));
    const df = fs / N, nT = Math.max(1, Math.floor((o.b - o.a) / o.dt + 1e-9)), nF = freqs.length, P = new Float32Array(nF * nT);
    freqs.forEach((f, fi) => {
      const sf = MORLET_SF * f / o.k, m0 = Math.max(1, Math.floor((f - 4 * sf) / df)), m1 = Math.min(N / 2 - 1, Math.ceil((f + 4 * sf) / df)), mc = Math.round(f / df);
      let n2 = 16; while (n2 < Math.max(m1 - m0 + 2, 2 * N / (o.dt * fs))) n2 <<= 1; n2 = Math.min(n2, N);
      const zr = new Float64Array(n2), zi = new Float64Array(n2);
      for (let q = m0; q <= m1; q++) { const u = (q * df - f) / sf, g = Math.exp(-0.5 * u * u), j = ((q - mc) % n2 + n2) % n2; zr[j] += re[q] * g; zi[j] -= im[q] * g; }   // conjugué : FFT directe = FFT inverse (au module près)
      IE.fft(zr, zi, plan(n2)); const r2 = n2 / N * fs;
      for (let j = 0; j < nT; j++) {
        const s0 = Math.floor((o.a + j * o.dt) * r2), s1 = Math.max(s0 + 1, Math.floor((o.a + (j + 1) * o.dt) * r2)); let p = 0;
        for (let s = s0; s < s1; s++) { const q = s < 0 ? 0 : s >= n2 ? n2 - 1 : s; p += zr[q] * zr[q] + zi[q] * zi[q]; }
        P[fi * nT + j] = p / (s1 - s0);
      }
    });
    return { P, nF, nT, dt: o.dt, a: o.a };
  }

  // ================================================================ empreinte de la zone épileptogène (Grinenko et al., Brain 2018)
  /** réglages : TF de Morlet (indice 8, 1–200 Hz), fenêtre de −20 à +20 s autour du début, référence de 40 s commençant 2 min
   *  avant le début (puissance de chaque fréquence divisée par sa moyenne de référence, en log10) ; détection simplifiée des trois
   *  éléments (pointes préictales, activité rapide multibande, suppression concomitante des basses fréquences) — sans le filtre
   *  de crêtes de Frangi, le filtre guidé ni le classifieur SVM de l'article : seuils explicites réglables */
  const FP = { k: 8, fmax: 200, pre: 20, post: 20, base0: 120, baseDur: 40, dt: 0.1, faLo: 30, faThr: 0.6, faFrom: -5, faMinDur: 1, supThr: 0.5, supArea: 0.031, spkThr: 0.3, spkZ: 3, spkFast: 60, spkFrom: -20 };
  /** fenêtres de l'empreinte pour un début de crise `on` (s) et un tracé de durée `dur` : référence de 40 s commençant 2 min
   *  avant le début (repli : 40 s au plus, du début du tracé à 25 s avant la crise), fenêtre −20 → +20 s, segment à lire (marges
   *  de 10 s pour les ondelettes lentes) → { seg: [a, b], base: [a, b], win: [a, b] } en s absolues, warn, err */
  function fpWindows(on, dur, o) {
    o = Object.assign({}, FP, o || {}); const warn = []; let w0 = on - o.pre, w1 = Math.min(dur, on + o.post), b0 = on - o.base0, b1 = b0 + o.baseDur;
    if (w0 < 0) { warn.push(`fenêtre amputée : ${Math.round(on)} s de tracé avant le début`); w0 = 0; }
    if (w1 < on + o.post - 0.05) warn.push(`fenêtre amputée : ${Math.round(dur - on)} s de tracé après le début`);
    if (b0 < 3) { b0 = Math.min(3, Math.max(0, on - 35)); b1 = Math.min(b0 + o.baseDur, on - 25); if (b1 - b0 < 10) return { err: 'référence impossible : moins de 35 s de tracé avant le début de crise' }; warn.push(`référence ${Math.round(b1 - b0)} s, de ${Math.round(b0)} à ${Math.round(b1)} s (moins de 2 min avant le début)`); }
    return { seg: [Math.max(0, Math.min(b0, w0) - 10), Math.min(dur, w1 + 10)], base: [b0, b1], win: [w0, w1], warn };
  }
  /** TF de chaque voie (worker) : list = segments bruts, o { freqs, k, base: [a, b], win: [a, b], dt } (s depuis le début du segment)
   *  → { L: [Float32Array (nF × nT) = log10(P / P référence)], nT, nF, dt } */
  function fpBatch(list, fs, o, progress) {
    const fr = o.freqs, nF = fr.length, L = [];
    let nT = 0;
    list.forEach((x, ci) => {
      const a = Math.min(o.base[0], o.win[0]), b = Math.max(o.base[1], o.win[1]), T = morletTF(x, fs, fr, { k: o.k, dt: o.dt, a, b });
      const jb0 = Math.max(0, Math.round((o.base[0] - a) / o.dt)), jb1 = Math.min(T.nT, Math.round((o.base[1] - a) / o.dt)), jw0 = Math.max(0, Math.round((o.win[0] - a) / o.dt)); nT = Math.min(T.nT - jw0, Math.round((o.win[1] - o.win[0]) / o.dt));
      const out = new Float32Array(nF * nT);
      for (let f = 0; f < nF; f++) {
        let s = 0, c = 0; for (let j = jb0; j < jb1; j++) { s += T.P[f * T.nT + j]; c++; } const B = c ? s / c : 0, eps = Math.max(1e-30, B * 1e-6);
        for (let j = 0; j < nT; j++) out[f * nT + j] = Math.log10((T.P[f * T.nT + jw0 + j] + eps) / (B + eps));
      }
      L.push(out); if (progress) progress((ci + 1) / list.length);
    });
    return { L, nT, nF, dt: o.dt };
  }
  /** lissage par boîte : ± hf fréquences, ± ht cases (3 × 3 par défaut) — moyennes glissantes séparables */
  function smooth33(L, nF, nT, hf, ht) {
    hf = hf == null ? 1 : hf; ht = ht == null ? 1 : ht; const a = new Float32Array(nF * nT), o = new Float32Array(nF * nT);
    for (let f = 0; f < nF; f++) { const r = f * nT; for (let j = 0; j < nT; j++) { let s = 0, c = 0; for (let k = Math.max(0, j - ht); k <= Math.min(nT - 1, j + ht); k++) { s += L[r + k]; c++; } a[r + j] = s / c; } }
    for (let j = 0; j < nT; j++) for (let f = 0; f < nF; f++) { let s = 0, c = 0; for (let g = Math.max(0, f - hf); g <= Math.min(nF - 1, f + hf); g++) { s += a[g * nT + j]; c++; } o[f * nT + j] = s / c; }
    return o;
  }
  /** trou de l'activité rapide dû au secteur : toutes les fréquences de la grille entre a et b (exclues) à moins de 5 Hz d'un même
   *  multiple de 50 ou de 60 Hz (largeur de l'ondelette autour de la raie) */
  const mainsGap = (fr, a, b) => { const inner = fr.filter(f => f > a && f < b); if (!inner.length || b - a > 16) return false; return [50, 60].some(m => { const k = Math.round((a + b) / 2 / m); return k >= 1 && inner.every(f => Math.abs(f - k * m) <= 5); }); };
  const fstep = (fr, i) => i + 1 < fr.length ? fr[i + 1] - fr[i] : i > 0 ? fr[i] - fr[i - 1] : 1;
  /** éléments de l'empreinte d'une voie. L : log10 du rapport à la référence (nF × nT), freqs, t0 = temps (s, depuis le début de
   *  crise) du centre de la 1re case, dt ; o (FP) → { fa, faArea, faT0, faT1, faFmin, faFmax, faPeak, nBands, multi, sup, supRatio,
   *  supFmax, supDepth, nSpk, spkT, score, full, mask (Uint8Array : 1 = activité rapide, 2 = suppression) } */
  function fpFeatures(L, freqs, nT, dt, t0, o) {
    o = Object.assign({}, FP, o || {}); const nF = freqs.length, S = smooth33(L, nF, nT), tOf = j => t0 + j * dt, mask = new Uint8Array(nF * nT);
    // 1. activité rapide : composantes connexes (8-voisinage) de S ≥ seuil au-dessus de faLo, dès faFrom, durée ≥ faMinDur
    const cand = new Uint8Array(nF * nT), jFrom = Math.max(0, Math.ceil((o.faFrom - t0) / dt - 1e-9));
    for (let f = 0; f < nF; f++) if (freqs[f] >= o.faLo) for (let j = jFrom; j < nT; j++) if (S[f * nT + j] >= o.faThr) cand[f * nT + j] = 1;
    const seen = new Uint8Array(nF * nT), stack = [], minLen = Math.max(1, Math.round(o.faMinDur / dt));
    let faArea = 0, j0 = Infinity, j1 = -1, fMin = Infinity, fMax = -Infinity, peak = 0;
    for (let s = 0; s < nF * nT; s++) {
      if (!cand[s] || seen[s]) continue; const comp = []; stack.push(s); seen[s] = 1; let a = Infinity, b = -1, fa = Infinity, fb = -1;
      while (stack.length) { const p = stack.pop(); comp.push(p); const f = (p / nT) | 0, j = p % nT; if (j < a) a = j; if (j > b) b = j; if (f < fa) fa = f; if (f > fb) fb = f;
        for (let df = -1; df <= 1; df++) for (let dj = -1; dj <= 1; dj++) { const g = f + df, k = j + dj; if (g < 0 || g >= nF || k < 0 || k >= nT) continue; const q = g * nT + k; if (cand[q] && !seen[q]) { seen[q] = 1; stack.push(q); } } }
      if (b - a + 1 < minLen || fb - fa < 1) continue;
      for (const p of comp) { const f = (p / nT) | 0, j = p % nT; mask[p] |= 1; faArea += fstep(freqs, f) * dt; if (S[p] > peak) peak = S[p]; if (j < j0) j0 = j; if (j > j1) j1 = j; if (freqs[f] < fMin) fMin = freqs[f]; if (freqs[f] > fMax) fMax = freqs[f]; }
    }
    const fa = j1 >= 0;
    // 2. bandes simultanées : nombre de bandes (séparées d'au moins 6 Hz, hors trou du secteur, non harmoniques) présentes ensemble pendant ≥ faMinDur
    let nBands = 0;
    if (fa) {
      const nb = new Int8Array(nT);
      for (let j = j0; j <= j1; j++) {
        const runs = []; let r = null;
        for (let f = 0; f < nF; f++) { const on = mask[f * nT + j] & 1; if (on) { if (r && (freqs[f] - r.hi <= 6 || mainsGap(freqs, r.hi, freqs[f]))) { r.hi = freqs[f]; r.w += S[f * nT + j]; r.c += freqs[f] * S[f * nT + j]; } else { r = { lo: freqs[f], hi: freqs[f], w: S[f * nT + j], c: freqs[f] * S[f * nT + j] }; runs.push(r); } } }
        const cen = runs.map(x => x.c / (x.w || 1)).sort((x, y) => x - y), keep = [];
        for (const c of cen) if (!keep.some(k0 => { const q = c / k0, n = Math.round(q); return n >= 2 && Math.abs(q - n) < 0.08 * n; })) keep.push(c);
        nb[j] = keep.length;
      }
      for (let k = 4; k >= 1 && !nBands; k--) { let run = 0; for (let j = j0; j <= j1; j++) { run = nb[j] >= k ? run + 1 : 0; if (run >= minLen) { nBands = k; break; } } }
    }
    // 3. suppression concomitante : S ≤ −supThr sous la fréquence la plus basse de l'activité rapide, pendant celle-ci
    let supA = 0, supFmax = 0, supS = 0, supN = 0;
    if (fa) { const S9 = smooth33(L, nF, nT, 2, Math.max(1, Math.round(1 / dt))), top = Math.min(fMin, o.faLo + 20); for (let f = 0; f < nF && freqs[f] < top; f++) for (let j = j0; j <= j1; j++) { const p = f * nT + j; if (S9[p] <= -o.supThr) { mask[p] |= 2; supA += fstep(freqs, f) * dt; supS += S9[p]; supN++; if (freqs[f] > supFmax) supFmax = freqs[f]; } } }   // suppression : phénomène soutenu, image lissée sur ± 2 fréquences et ± 1 s
    const supRatio = supA / ((o.pre + o.post) * 199), sup = fa && supRatio >= o.supArea;
    // 4. pointes préictales : maxima de la médiane sur les fréquences de L, avant l'activité rapide (ou le début de crise)
    const med = new Float32Array(nT), col = new Float32Array(nF), fastIdx = freqs.map((f, i) => f >= o.spkFast ? i : -1).filter(i => i >= 0), fast = new Float32Array(nT);
    for (let j = 0; j < nT; j++) { for (let f = 0; f < nF; f++) col[f] = L[f * nT + j]; const s = Float32Array.from(col).sort(); med[j] = nF & 1 ? s[nF >> 1] : (s[nF / 2 - 1] + s[nF / 2]) / 2; let fs0 = 0; for (const i of fastIdx) fs0 += L[i * nT + j]; fast[j] = fastIdx.length ? fs0 / fastIdx.length : 0; }
    // seuil relatif : médiane et MAD de la courbe avant l'activité rapide (pointes rares : statistiques robustes)
    const spkEnd = (fa ? tOf(j0) : 0) + 0.5, spkT = [], w5 = Math.max(1, Math.round(0.5 / dt)), w10 = 2 * w5, needFast = freqs[nF - 1] >= 80, jS0 = Math.max(0, Math.ceil((o.spkFrom - t0) / dt)), jS1 = Math.min(nT - 1, Math.floor((spkEnd - t0) / dt));
    const rz = a => { const v = Array.from(a.slice(jS0, jS1 + 1)).sort((x, y) => x - y), m = v.length ? v[v.length >> 1] : 0, d = v.map(x => Math.abs(x - m)).sort((x, y) => x - y), sd = 1.4826 * (d.length ? d[d.length >> 1] : 0) || 0.1; return x => (x - m) / sd; };
    const zM = rz(med), zF = rz(fast);
    for (let j = jS0; j <= jS1; j++) {
      const v = med[j]; if (v < o.spkThr / 2 || zM(v) < o.spkZ) continue; let mx = true, lo = v;
      for (let k = Math.max(0, j - w10); k <= Math.min(nT - 1, j + w10); k++) { if (Math.abs(k - j) <= w5 && k !== j && (med[k] > v || (med[k] === v && k < j))) { mx = false; break; } if (med[k] < lo) lo = med[k]; }
      if (!mx || v - lo < 0.2 || (needFast && zF(fast[j]) < 1.5)) continue; if (spkT.length && tOf(j) - spkT[spkT.length - 1] < 0.5) continue; spkT.push(Math.round(tOf(j) * 100) / 100);
    }
    const nSpk = spkT.length, multi = nBands >= 2, score = ((nSpk ? 1 : 0) + (fa ? (multi ? 1 : 0.5) : 0) + (sup ? 1 : 0)) / 3;
    const r3 = v => Math.round(v * 1000) / 1000;
    return { fa, faArea: r3(faArea), faT0: fa ? r3(tOf(j0)) : null, faT1: fa ? r3(tOf(j1)) : null, faFmin: fa ? fMin : null, faFmax: fa ? fMax : null, faPeak: r3(peak), nBands, multi, sup, supRatio: r3(supRatio), supFmax: sup || supA ? supFmax : null, supDepth: supN ? r3(supS / supN) : null, nSpk, spkT, score: r3(score), full: !!(nSpk && fa && multi && sup), mask };
  }

  // ================================================================ temporalité de l'empreinte et des EM (v4.20)
  /** réglages : empreinte « franche » = score ≥ clear (1 : complète) ; précoce = délai ≤ early (s) après la première
   *  activité rapide de toutes les voies ; poids temporel w = τ / (max(0, délai − early) + τ), comme 1 / (Nd − N0 + τ) dans
   *  l'EI ; voie sans activité rapide : délai pris à la fin de la fenêtre (end, s après le début) */
  const FPT = { clear: 1, early: 2, tau: 2, end: 20 };
  const r3t = v => Math.round(v * 1000) / 1000;
  const wOf = (d, o) => o.tau / (Math.max(0, d - o.early) + o.tau);
  /** rows [{ fa, faT0 (s / début), score }] → { t0 (première activité rapide), tClear (première empreinte franche), nClear,
   *  nEarly (franches et précoces), nLate (franches et tardives), rows: [{ clear, dT, early, w, sT }] } (même ordre) */
  function fpTiming(rows, o) {
    o = Object.assign({}, FPT, o || {}); const fa = (rows || []).filter(r => r.fa && r.faT0 != null && isFinite(r.faT0)), t0 = fa.length ? Math.min(...fa.map(r => r.faT0)) : null;
    const out = (rows || []).map(r => {
      const clear = !!r.fa && r.score >= o.clear - 0.005, dT = r.fa && r.faT0 != null && t0 != null ? r.faT0 - t0 : null;
      const w = wOf(dT != null ? dT : Math.max(0, o.end - (t0 == null ? 0 : t0)), o);
      return { clear, dT: dT == null ? null : r3t(dT), early: dT != null && dT <= o.early + 1e-9, w: r3t(w), sT: r3t((r.score || 0) * w) };
    });
    const cl = out.filter(x => x.clear), tClear = cl.length ? t0 + Math.min(...cl.map(x => x.dT)) : null;
    return { t0, tClear: tClear == null ? null : r3t(tClear), nClear: cl.length, nEarly: cl.filter(x => x.early).length, nLate: cl.filter(x => !x.early).length, rows: out };
  }
  /** EM : rows [{ t, delay (première latence significative, s, ou null) }] → { d0 (premier délai), nEarly, nLate, rows:
   *  [{ dT, early, w, tw (t⁺ × w) }] } ; voie jamais significative : délai pris après la dernière latence (lmax + pas) */
  function emTiming(rows, o) {
    o = Object.assign({ early: 2, tau: 2, lmax: 20, step: 2 }, o || {}); const ds = (rows || []).map(r => r.delay).filter(d => d != null && isFinite(d)), d0 = ds.length ? Math.min(...ds) : null;
    const out = (rows || []).map(r => { const dT = r.delay != null && d0 != null ? r.delay - d0 : null, w = wOf(dT != null ? dT : o.lmax + o.step - (d0 || 0), o); return { dT, early: dT != null && dT <= o.early + 1e-9, w: r3t(w), tw: r3t(Math.max(0, r.t || 0) * w) }; });
    return { d0, nEarly: out.filter(x => x.early).length, nLate: out.filter(x => x.dT != null && !x.early).length, rows: out };
  }
  /** empreinte connectivité : régions (échantillonnées ou non) qui pourraient nourrir les voies à la meilleure empreinte
   *  (pondérée par le délai). ev : Map(région → { e (0–1, meilleure empreinte de ses voies ; 0 si échantillonnée sans
   *  empreinte) }), C : connectivité du modèle (N × N, Atlas.buildConnectivity), N ; o { minC (lien minimal), top, keep } →
   *  [{ r, score, own, src, cos, cover, sampled, basis ('own' | 'conn'), via: [[région, part]] }] trié par score décroissant.
   *  Profil prédit d'une source c sur les régions échantillonnées s : p_s = 1 si s = c, sinon C[c,s] (≥ minC) ;
   *  src_c = cos(p, e) × couverture, couverture = Σ p_s·e_s / Σ e_s (part de l'empreinte totale à laquelle c est reliée) ;
   *  score = max(e_c si c est échantillonnée, src_c) : une empreinte franche précoce échantillonnée reste en tête ; une région
   *  non échantillonnée passe devant quand elle relie plusieurs voies à l'empreinte nette mieux qu'aucune ne le fait seule */
  function fpConnect(ev, C, N, o) {
    o = Object.assign({ minC: 0.05, top: 3, keep: 0.25 }, o || {}); const S = [...ev.entries()].filter(([r]) => r > 0 && r < N).map(([r, x]) => [r, Math.max(0, x.e || 0)]);
    const sumE = S.reduce((a, [, e]) => a + e, 0), nE = Math.sqrt(S.reduce((a, [, e]) => a + e * e, 0)), res = []; if (!(sumE > 0)) return res;
    for (let c = 1; c < N; c++) {
      const own = ev.has(c) ? Math.max(0, ev.get(c).e || 0) : null; let dot = 0, pp = 0; const via = [];
      for (const [s, e] of S) { const w = s === c ? 1 : C[c * N + s]; if (!(w >= o.minC)) continue; pp += w * w; const v = w * e; if (v > 0) { dot += v; via.push([s, v]); } }
      if (!(dot > 0)) continue; const cos = dot / (Math.sqrt(pp) * nE), cover = dot / sumE, src = cos * Math.min(1, cover), score = Math.max(own || 0, src);
      res.push({ r: c, score: r3t(score), own, src: r3t(src), cos: r3t(cos), cover: r3t(cover), sampled: own != null, basis: own != null && own >= src ? 'own' : 'conn', via: via.sort((a, b) => b[1] - a[1]).slice(0, o.top).map(([r, v]) => [r, r3t(v / dot)]) });
    }
    res.sort((a, b) => b.score - a.score || (b.sampled - a.sampled) || a.r - b.r); const best = res.length ? res[0].score : 0;
    return res.filter(x => x.score >= o.keep * best);
  }

  // ================================================================ cartes d'épileptogénicité (David et al., Brain 2011)
  /** réglages : puissance haute fréquence (bande 120–200 Hz, ou 60–100 Hz sous 512 Hz d'échantillonnage) par blocs de 0,2 s,
   *  log10 ; référence [−10, −1] s ; fenêtre ictale [L, L + 3 s] ; t de Welch par contact ; seuil p 0,05 corrigé ; délais :
   *  première latence L (0 à 20 s, pas de 2 s) où le contact devient significatif */
  const EM = { band: [120, 200], blk: 0.2, base: [-10, -1], lat: 0, dur: 3, lats: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20], p: 0.05, corr: 'bonf', notch: 50, k: 7 };
  /** fréquences de la bande (pas ≈ largeur / 10, harmoniques du secteur écartées de ± 3 Hz) */
  function emFreqs(band, notch) { const [lo, hi] = band, st = Math.max(2, (hi - lo) / 10), out = []; for (let f = lo; f <= hi + 1e-9; f += st) { const r = notch ? f / notch : 0; if (notch && Math.abs(r - Math.round(r)) * notch < 3 && Math.round(r) >= 1) continue; out.push(Math.round(f * 10) / 10); } return out.length ? out : [(lo + hi) / 2]; }
  /** segment de l'EM : de la référence (repli : début du tracé si moins de 10 s avant la crise) à la dernière latence + durée
   *  → { seg: [a, b] (s absolues), base: [a, b] (s depuis le début de crise), warn, err } */
  function emWindows(on, dur, o) {
    o = Object.assign({}, EM, o || {}); const warn = []; let base = o.base.slice(); const last = Math.max(o.lat, ...(o.lats || [0])) + o.dur;
    if (on + base[0] < 1) { base[0] = 1 - on; if (base[1] - base[0] < 3) return { err: 'référence impossible : moins de 4 s de tracé avant le début de crise' }; warn.push(`référence raccourcie : ${Math.round((base[1] - base[0]) * 10) / 10} s`); }
    if (on + last > dur) warn.push(`tracé de ${Math.round(dur - on)} s après le début : latences tardives non testées`);
    return { seg: [Math.max(0, on + base[0] - 2), Math.min(dur, on + last + 2)], base, warn };
  }
  /** puissance de bande par blocs (worker) : list = segments bruts, o { freqs, k, a, b, blk } → { E: [Float32Array log10 P], nT, dt } */
  function emBatch(list, fs, o, progress) {
    const E = []; let nT = 0;
    list.forEach((x, ci) => { const T = morletTF(x, fs, o.freqs, { k: o.k, dt: o.blk, a: o.a, b: o.b }); nT = T.nT; const e = new Float32Array(nT); for (let j = 0; j < nT; j++) { let s = 0; for (let f = 0; f < T.nF; f++) s += T.P[f * nT + j]; e[j] = Math.log10(s / T.nF + 1e-30); } E.push(e); if (progress) progress((ci + 1) / list.length); });
    return { E, nT, dt: o.blk };
  }
  /** t de Welch de la fenêtre [lat, lat + dur] contre la référence (temps depuis le début de crise ; t0 = centre du 1er bloc) */
  function emTest(e, t0, dt, base, lat, dur) {
    const B = [], I = []; for (let j = 0; j < e.length; j++) { const t = t0 + j * dt; if (t >= base[0] && t <= base[1]) B.push(e[j]); if (t >= lat && t <= lat + dur) I.push(e[j]); }
    if (B.length < 3 || I.length < 3) return null; const r = SV.Stat.welchSamples(I, B); return { t: r.t, df: r.df, p1: r.p1, n: I.length, nb: B.length };
  }
  /** inverse d'une matrice affine 4 × 4 (ligne par ligne) */
  function inv4(m) {
    const a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], i = m[10], A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C; if (!det) throw new Error('matrice non inversible');
    const r = [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, 0, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, 0, C / det, -(a * h - b * g) / det, (a * e - b * d) / det, 0, 0, 0, 0, 1], t = [m[3], m[7], m[11]];
    r[3] = -(r[0] * t[0] + r[1] * t[1] + r[2] * t[2]); r[7] = -(r[4] * t[0] + r[5] * t[1] + r[6] * t[2]); r[11] = -(r[8] * t[0] + r[9] * t[1] + r[10] * t[2]); return r;
  }
  /** valeurs portées sur l'IRM : noyau gaussien (FWHM mm) autour de chaque plot, limité à rmax mm, dans le masque ;
   *  v(x) = Σ wᵢ tᵢ / max(1, Σ wᵢ) (au plot : sa valeur ; décroissance gaussienne ailleurs ; moyenne pondérée entre plots proches).
   *  grid { dims, affine (voxel → monde, 16 valeurs) }, mask (Uint8Array ou null), pts [[x, y, z, v]] (monde) → Float32Array */
  function emSplat(grid, mask, pts, o) {
    o = Object.assign({ fwhm: 6, rmax: 12 }, o || {}); const [nx, ny, nz] = grid.dims, A = grid.affine, n = nx * ny * nz, num = new Float32Array(n), den = new Float32Array(n), sg = o.fwhm / 2.3548;
    const Ai = inv4(Array.from(A)), pix = [0, 1, 2].map(a => Math.hypot(A[a], A[4 + a], A[8 + a])), rv = pix.map(p => Math.ceil(o.rmax / p));
    for (const [x, y, z, v] of pts) {
      if (!isFinite(v)) continue; const ci = Ai[0] * x + Ai[1] * y + Ai[2] * z + Ai[3], cj = Ai[4] * x + Ai[5] * y + Ai[6] * z + Ai[7], ck = Ai[8] * x + Ai[9] * y + Ai[10] * z + Ai[11];
      for (let k = Math.max(0, Math.floor(ck - rv[2])); k <= Math.min(nz - 1, Math.ceil(ck + rv[2])); k++) for (let j = Math.max(0, Math.floor(cj - rv[1])); j <= Math.min(ny - 1, Math.ceil(cj + rv[1])); j++) for (let i = Math.max(0, Math.floor(ci - rv[0])); i <= Math.min(nx - 1, Math.ceil(ci + rv[0])); i++) {
        const q = i + nx * (j + ny * k); if (mask && !mask[q]) continue; const wx = A[0] * i + A[1] * j + A[2] * k + A[3] - x, wy = A[4] * i + A[5] * j + A[6] * k + A[7] - y, wz = A[8] * i + A[9] * j + A[10] * k + A[11] - z, d2 = wx * wx + wy * wy + wz * wz;
        if (d2 > o.rmax * o.rmax) continue; const w = Math.exp(-0.5 * d2 / (sg * sg)); num[q] += w * v; den[q] += w;
      }
    }
    for (let q = 0; q < n; q++) num[q] = den[q] > 1e-4 ? num[q] / Math.max(1, den[q]) : 0;
    return num;
  }

  SV.IEEGM = { FPT, fpTiming, emTiming, fpConnect, CEI, PE, peTau, DELPHOS, HFO_BANDS, bandOf, filtfilt, bandpass, ceiPrep, h2Batch, ceiDegrees, ceiCombine, cei, ordinal, permEntropy, peBatch, pei, delphosFmax, delphosPlan, cwtChunk, robust, delphos, delphosBatch, delphosRates, H2BANDS, h2Frames, h2Strength, h2Run, netFlatten, netInterp, cooccur, slowPhase, phaseCoupling,
    morletFmax, morletTF, fpFreqs, FP, fpWindows, fpBatch, fpFeatures, smooth33, EM, emFreqs, emWindows, emBatch, emTest, emSplat };
});
