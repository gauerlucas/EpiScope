/* EpiScope — plan_traj.js (v4.9) : trajectoires de planification sur l'enveloppe du cerveau.
 *   - Enveloppe : masque du cerveau (segmentation du patient, sinon volume VEP du gabarit) sur une grille de 2 mm,
 *     fermé (6 mm : les sillons sont pontés) et rempli ; champ lissé pour les normales. L'entrée d'une électrode est le
 *     point où sa droite sort de l'enveloppe (« collée » à la surface) ; la pointe va où l'on veut.
 *   - Modèle : le plus grand modèle (5 à 18 plots, pas 3,5 mm) dont les plots tiennent dans le trajet intracérébral
 *     (dernier plot juste sous le cortex) ; un modèle choisi à la main est gardé.
 *   - Faisabilité (couleur de l'électrode en 3D et dans la liste) : irréalisable (rouge) = pointe hors du cerveau, pas de
 *     sortie, incidence > 60° sur la surface, entrée de l'autre côté de la ligne médiane, croisement < 3 mm ; à revoir
 *     (orange) = incidence 40–60°, entrée à risque (frontal bas, os temporal, très basse), proximité < 6 mm, ventricule
 *     traversé, trajet > 100 mm.
 *   - Au clic : un clic (coupes IRM ou structure profonde en 3D) donne une cible ; la trajectoire faisable la plus courte est cherchée parmi
 *     ~900 directions (incidence ≤ 45°, même côté, hors zones à risque, à distance des autres électrodes, sans
 *     ventricule), puis le modèle choisi.
 * Espaces : « patient » = monde du T1 (plan.tip / plan.entry) ; « gabarit » = tkrRAS fsaverage (target / exit). */
(function (SV) {
  'use strict';
  const M4 = SV.Mat4;
  const MODEL_N = [5, 8, 10, 12, 15, 18], PITCH = 3.5, span = n => 2 + (n - 1) * PITCH;
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b, s) => [a[0] + b[0] * (s == null ? 1 : s), a[1] + b[1] * (s == null ? 1 : s), a[2] + b[2] * (s == null ? 1 : s)];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = a => Math.hypot(a[0], a[1], a[2]), unit = a => { const n = len(a) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };
  const dist = (a, b) => len(sub(a, b));
  /** directions quasi uniformes sur la sphère (spirale de Fibonacci) */
  function sphere(n) { const out = [], g = Math.PI * (3 - Math.sqrt(5)); for (let i = 0; i < n; i++) { const z = 1 - 2 * (i + 0.5) / n, r = Math.sqrt(1 - z * z), t = g * i; out.push([r * Math.cos(t), r * Math.sin(t), z]); } return out; }
  const DIRS = sphere(1200);

  /** plus grand modèle dont les plots tiennent dans le trajet (dernier plot au plus 2 mm au-delà) */
  function pickModel(L) { let n = MODEL_N[0]; for (const m of MODEL_N) if (span(m) <= L + 2) n = m; return n; }
  const modelId = (n, maker) => maker === 'Alcis' ? `Alcis 2069-EPC-${String(n).padStart(2, '0')}C-35` : `DIXI D08-${String(n).padStart(2, '0')}AM`;
  const modelN = id => { const E = SV.Electrodes, md = E && E.modelById ? E.modelById(id) : null; if (md) return md.n; const m = String(id || '').match(/(\d+)(AM)?$/); return m ? +m[1] : 0; };
  /** positions des plots depuis la pointe pour un modèle imposé (groupes espacés, HD : vraies cotes du catalogue), sinon pas standard */
  const modelOffsets = (id, n) => { const E = SV.Electrodes, md = E && E.modelById ? E.modelById(id) : null; if (md && E.offsetsOf) return E.offsetsOf(md); const out = []; for (let k = 1; k <= n; k++) out.push(1 + (k - 1) * PITCH); return out; };

  // ---------------------------------------------------------------- enveloppe
  /** passage d'un filtre cubique (dilatation, ou érosion) de rayon r le long d'un axe, par sommes glissantes */
  function boxPass(src, dims, axis, r, ero) {
    const [nx, ny, nz] = dims, out = new Uint8Array(src.length), L = dims[axis], st = axis === 0 ? 1 : axis === 1 ? nx : nx * ny, row = new Int32Array(L + 1), w = 2 * r + 1;
    const A = axis === 0 ? [ny, nz] : axis === 1 ? [nx, nz] : [nx, ny];
    for (let q = 0; q < A[1]; q++) for (let p = 0; p < A[0]; p++) {
      const b = axis === 0 ? nx * (p + ny * q) : axis === 1 ? p + nx * ny * q : p + nx * q;
      for (let x = 0; x < L; x++) row[x + 1] = row[x] + src[b + x * st];
      for (let x = 0; x < L; x++) { const lo = Math.max(0, x - r), hi = Math.min(L - 1, x + r), c = row[hi + 1] - row[lo]; out[b + x * st] = ero ? (c === w ? 1 : 0) : (c > 0 ? 1 : 0); }
    }
    return out;
  }
  /** fermeture (dilatation puis érosion, cube de rayon r) puis remplissage des cavités ; → masque 0/1 */
  function closeFill(B, dims, r) {
    const [nx, ny, nz] = dims, n = nx * ny * nz;
    let H = B; for (const ax of [0, 1, 2]) H = boxPass(H, dims, ax, r, false); for (const ax of [0, 1, 2]) H = boxPass(H, dims, ax, r, true);
    // remplissage : tout ce qui n'est pas relié au bord par l'extérieur est dedans
    const out = new Uint8Array(n), Q = new Int32Array(n); let qh = 0, qt = 0;
    const push = o => { if (!out[o] && !H[o]) { out[o] = 1; Q[qt++] = o; } };
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (i === 0 || j === 0 || k === 0 || i === nx - 1 || j === ny - 1 || k === nz - 1) push(i + nx * (j + ny * k));
    while (qh < qt) { const o = Q[qh++], i = o % nx, j = ((o / nx) | 0) % ny, k = (o / (nx * ny)) | 0; if (i > 0) push(o - 1); if (i < nx - 1) push(o + 1); if (j > 0) push(o - nx); if (j < ny - 1) push(o + nx); if (k > 0) push(o - nx * ny); if (k < nz - 1) push(o + nx * ny); }
    const M = new Uint8Array(n); for (let o = 0; o < n; o++) M[o] = out[o] ? 0 : 1; return M;
  }
  /** champ lissé (gaussienne σ = 1 voxel) d'un masque : surface = isovaleur 0,5 */
  function smoothField(M, dims) {
    const [nx, ny] = dims, n = M.length, wk = [0.054, 0.242, 0.399, 0.242, 0.054];
    let F = new Float32Array(n); for (let o = 0; o < n; o++) F[o] = M[o];
    for (const ax of [0, 1, 2]) {
      const st = ax === 0 ? 1 : ax === 1 ? nx : nx * ny, L = dims[ax], G = new Float32Array(n);
      for (let o = 0; o < n; o++) { const x = ax === 0 ? o % nx : ax === 1 ? ((o / nx) | 0) % ny : (o / (nx * ny)) | 0; let s = 0, w = 0; for (let t = -2; t <= 2; t++) { const y = x + t; if (y < 0 || y >= L) continue; s += F[o + t * st] * wk[t + 2]; w += wk[t + 2]; } G[o] = s / w; }
      F = G;
    }
    return F;
  }
  /** isBrain(i, j, k) sur une grille dims ; G2W : grille → monde (Mat4) ; → objet enveloppe (monde).
   *  Deux enveloppes : « cerveau » (fermeture de 3 voxels : sillons pontés, l'entrée y est collée) et « crâne » (fermeture
   *  large : scissures et citernes de la base comblées, ≈ table interne) ; la grille est bordée pour que les fermetures
   *  ne soient pas tronquées. */
  function makeHull(dims, isBrain, G2W, opts) {
    opts = opts || {}; const r = opts.close || 3, pad = r + 2;
    const D = [dims[0] + 2 * pad, dims[1] + 2 * pad, dims[2] + 2 * pad], [nx, ny, nz] = D, n = nx * ny * nz;
    const B = new Uint8Array(n);
    for (let k = 0; k < dims[2]; k++) for (let j = 0; j < dims[1]; j++) for (let i = 0; i < dims[0]; i++) if (isBrain(i, j, k)) B[(i + pad) + nx * ((j + pad) + ny * (k + pad))] = 1;
    const Fb = smoothField(closeFill(B, D, r), D);
    const G2Wp = M4.mul(M4.from(G2W), M4.from([1, 0, 0, -pad, 0, 1, 0, -pad, 0, 0, 1, -pad, 0, 0, 0, 1]));
    // « crâne » : enveloppe convexe du cerveau (fonction d'appui sur 1 200 directions) ≈ voûte ; elle comble les scissures,
    // les citernes de la base et l'espace entre les lobes temporaux et frontaux
    let hU = null;
    if (opts.skull) {
      hU = new Float64Array(DIRS.length).fill(-Infinity); const G = M4.from(G2Wp);
      for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
        const o = i + nx * (j + ny * k); if (!B[o] || (B[o - 1] && B[o + 1] && B[o - nx] && B[o + nx] && B[o - nx * ny] && B[o + nx * ny])) continue;
        const w = M4.apply(G, i, j, k); for (let u = 0; u < DIRS.length; u++) { const d = DIRS[u], v = w[0] * d[0] + w[1] * d[1] + w[2] * d[2]; if (v > hU[u]) hU[u] = v; }
      }
    }
    const W2G = M4.inv(G2Wp), J = [W2G[0], W2G[1], W2G[2], W2G[4], W2G[5], W2G[6], W2G[8], W2G[9], W2G[10]];
    const at = (A, i, j, k) => { if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return A === B ? 0 : 0; return A[i + nx * (j + ny * k)]; };
    const tri = (F, g) => { const x = g[0], y = g[1], z = g[2], i = Math.floor(x), j = Math.floor(y), k = Math.floor(z), fx = x - i, fy = y - j, fz = z - k;
      const c = (a, b, c2) => at(F, a, b, c2);
      return ((c(i, j, k) * (1 - fx) + c(i + 1, j, k) * fx) * (1 - fy) + (c(i, j + 1, k) * (1 - fx) + c(i + 1, j + 1, k) * fx) * fy) * (1 - fz) + ((c(i, j, k + 1) * (1 - fx) + c(i + 1, j, k + 1) * fx) * (1 - fy) + (c(i, j + 1, k + 1) * (1 - fx) + c(i + 1, j + 1, k + 1) * fx) * fy) * fz; };
    const toG = p => M4.apply(W2G, p[0], p[1], p[2]);
    const normalOf = (F, p) => { const g = toG(p), h = 0.6, d = [0, 1, 2].map(a => { const u = g.slice(), v = g.slice(); u[a] += h; v[a] -= h; return (tri(F, u) - tri(F, v)) / (2 * h); });
      return unit([-(J[0] * d[0] + J[3] * d[1] + J[6] * d[2]), -(J[1] * d[0] + J[4] * d[1] + J[7] * d[2]), -(J[2] * d[0] + J[5] * d[1] + J[8] * d[2])]); };
    return {
      dims: D, G2W: G2Wp, W2G,
      /** degré d'intérieur de l'enveloppe du cerveau (0 dehors, 1 dedans) au point monde */
      field(p) { return tri(Fb, toG(p)); },
      inside(p) { return tri(Fb, toG(p)) >= 0.5; },
      brain(p) { const g = toG(p); return !!at(B, Math.round(g[0]), Math.round(g[1]), Math.round(g[2])); },
      /** normale sortante de l'enveloppe du cerveau au point monde */
      normal(p) { return normalOf(Fb, p); },
      /** « crâne » : sortie de l'enveloppe convexe depuis p dans la direction d → { t (mm), normal } */
      skull: hU ? { exit(p, d) { let t = Infinity, nu = null; for (let u = 0; u < DIRS.length; u++) { const U = DIRS[u], c = d[0] * U[0] + d[1] * U[1] + d[2] * U[2]; if (c < 1e-6) continue; const tt = (hU[u] - (p[0] * U[0] + p[1] * U[1] + p[2] * U[2])) / c; if (tt < t) { t = tt; nu = U; } } return { t: Math.max(0, t), normal: nu }; } } : null,
    };
  }
  /** point de sortie de l'enveloppe en partant de la pointe dans la direction dir (monde) → { entry, len } ou null */
  function exitPoint(hull, tip, dir, max) {
    max = max || 180; let prev = hull.field(tip); if (prev < 0.5) return null;
    for (let s = 0.5; s <= max; s += 0.5) { const f = hull.field(add(tip, dir, s)); if (f < 0.5) { const t = (prev - 0.5) / Math.max(1e-6, prev - f), se = s - 0.5 + 0.5 * t; return { entry: add(tip, dir, se), len: se }; } prev = f; }
    return null;
  }
  /** règles d'entrée sur le gabarit (tkrRAS) : q = point d'entrée */
  function zoneIssues(q) {
    const out = [];
    if (q[1] > 40 && q[2] < 0) out.push({ sev: 2, text: 'entrée frontale basse : sinus frontal / orbite' });
    else if (q[1] > 40 && q[2] < 10) out.push({ sev: 1, text: 'entrée frontale basse : vérifier le sinus frontal' });
    else if (q[1] > 25 && q[2] < -5) out.push({ sev: 2, text: 'trop bas sur la ligne de front' });
    if (q[1] < -30 && q[2] < -22) out.push({ sev: 2, text: 'os temporal pneumatisé (mastoïde / rocher)' });
    if (q[1] < -70) out.push({ sev: 1, text: 'entrée très postérieure (décubitus dorsal)' });
    if (q[2] < -35) out.push({ sev: 2, text: 'entrée très basse' });
    return out;
  }
  /** contrôles de l'entrée (monde de ctx) : incidence sur l'enveloppe, face par laquelle on entre (le crâne, pas la base
   *  ni la face médiale), trajet libre au-delà de l'entrée, ligne médiane (sinus sagittal), côté */
  function entryChecks(ctx, entry, dir, hemi) {
    const H = ctx.hull, out = [], n = H.normal(entry), nv = ctx.dirView(entry, n), lat = ctx.latX(entry);
    const s = hemi === 'L' ? -1 : hemi === 'R' ? 1 : (Math.sign(lat) || 1);
    // enveloppe « crâne » : la trajectoire doit en sortir aussitôt (sinon l'entrée est au fond d'une scissure ou d'une
    // citerne de la base) ; la face du crâne traversée ne doit pas regarder vers le bas (base du crâne)
    let nb = nv, incS = null;
    if (H.skull) {
      const sk = H.skull.exit(entry, dir), gap = Math.round(sk.t);
      if (gap > 15) out.push({ sev: 3, text: `entrée au fond d’une scissure ou d’une citerne (${gap} mm sous la voûte : pas d’accès direct par le crâne)` });
      else if (gap > 10) out.push({ sev: 2, text: `entrée en retrait de la voûte (${gap} mm : scissure, citerne)` });
      if (sk.normal) { nb = ctx.dirView(add(entry, dir, sk.t), sk.normal); incS = Math.acos(Math.max(-1, Math.min(1, dot(dir, sk.normal)))) * 180 / Math.PI; }
    }
    // incidence : sur le « crâne » (enveloppe convexe, lisse comme la voûte), sinon sur l'enveloppe du cerveau
    const inc = Math.round(incS != null ? incS : Math.acos(Math.max(-1, Math.min(1, dot(dir, n)))) * 180 / Math.PI);
    if (inc > 65) out.push({ sev: 3, text: `incidence ${inc}° : trop tangentielle au crâne (perçage impossible)` });
    else if (inc > 40) out.push({ sev: 2, text: `incidence ${inc}° sur le crâne (oblique)` });
    const nz = Math.min(nv[2], nb[2]);
    if (nz < -0.75) out.push({ sev: 3, text: 'entrée par la face inférieure (base du crâne)' });
    else if (nz < -0.6) out.push({ sev: 2, text: 'entrée très inférieure (base du crâne proche)' });
    const other = !!hemi && Math.abs(lat) >= 4 && (lat < 0 ? 'L' : 'R') !== hemi;
    if (!other && nv[0] * s < -0.35) out.push({ sev: 3, text: 'entrée par la face médiale de l’hémisphère (pas d’accès par le crâne)' });
    for (let t = 3; t <= 120; t += 1.5) if (H.field(add(entry, dir, t)) >= 0.5) { out.push({ sev: 3, text: 'la trajectoire prolongée retraverse le cerveau (pas d’accès par le crâne)' }); break; }
    const ax = Math.abs(lat);
    if (ax < 4) out.push({ sev: 3, text: 'entrée sur la ligne médiane (sinus sagittal supérieur)' });
    else if (other) out.push({ sev: 3, text: 'entrée de l’autre côté de la ligne médiane' });
    else if (ax < 10 && nv[2] > 0.3) out.push({ sev: 2, text: `entrée à ${ax.toFixed(0)} mm de la ligne médiane (sinus sagittal supérieur)` });
    return { issues: out, incidence: inc };
  }
  /** contrôles d'une trajectoire (monde de ctx) : pointe, sortie, entrée, zones, ventricules, cervelet, longueur */
  function evaluate(ctx, tip, dir, entry, hemi, contacts) {
    const issues = [], H = ctx.hull;
    if (!H.brain(tip)) issues.push(H.inside(tip) ? { sev: 2, text: 'pointe dans le LCR (sillon, citerne)' } : { sev: 3, text: 'pointe hors du cerveau' });
    const ex = exitPoint(H, tip, dir);
    if (!ex) issues.push({ sev: 3, text: 'la trajectoire ne ressort pas du cerveau' });
    let inc = null;
    if (ex) {
      const ec = entryChecks(ctx, ex.entry, dir, hemi); inc = ec.incidence; for (const i of ec.issues) issues.push(i);
      for (const z of zoneIssues(ctx.toTpl(ex.entry))) issues.push(z);
      if (ex.len > 100) issues.push({ sev: 2, text: `trajet intracérébral long (${ex.len.toFixed(0)} mm)` });
      if (ex.len < 14) issues.push({ sev: 1, text: `trajet court (${ex.len.toFixed(0)} mm)` });
      if (ctx.isCb) { let cb = 0; for (let t = 4; t < ex.len; t += 2) if (ctx.isCb(ctx.labelAt(add(tip, dir, t)))) cb++; if (cb >= 2) issues.push({ sev: 3, text: 'la trajectoire traverse le cervelet' }); }
    }
    const csf = (contacts || []).slice(1, -1).filter(c => c.label === 201).length;
    if (csf >= 3) issues.push({ sev: 2, text: `${csf} plots dans un ventricule / une citerne` });
    return { issues, incidence: inc, exit: ex };
  }
  const statusOf = issues => { const m = Math.max(0, ...issues.map(i => i.sev)); return m >= 3 ? 'red' : m >= 2 ? 'orange' : 'ok'; };
  /** trajectoire faisable la plus courte vers une cible (monde de ctx) ; others : [{tip, entry, dir}] dans le même monde.
   *  Gardées : entrée sans alerte (incidence ≤ 40°, par le crâne, même côté, hors zones à risque), à 6 mm des autres
   *  électrodes, sans ventricule ni cervelet ; score = longueur + 0,15 × incidence. */
  function searchTrajectory(ctx, target, hemi, others) {
    const H = ctx.hull; if (!H.brain(target) && !H.inside(target)) return null;
    let best = null;
    for (const d of DIRS) {
      const ex = exitPoint(H, target, d, 130); if (!ex || ex.len < 8) continue;
      if (best && ex.len >= best.score) continue;
      const ec = entryChecks(ctx, ex.entry, d, hemi); if (ec.issues.some(i => i.sev >= 2)) continue;
      if (zoneIssues(ctx.toTpl(ex.entry)).some(z => z.sev >= 2)) continue;
      let ok = true; for (const o of others || []) if (SV.Electrodes.segDist(target, add(ex.entry, d, 8), o.tip, add(o.entry, o.dir, 8)) < 6) { ok = false; break; } if (!ok) continue;
      let csf = 0, cb = 0; for (let s = 4; s < ex.len; s += 2) { const l = ctx.labelAt(add(target, d, s)); if (l === 201) csf++; else if (ctx.isCb && ctx.isCb(l)) cb++; } if (csf >= 3 || cb >= 2) continue;
      const score = ex.len + 0.15 * ec.incidence;
      if (!best || score < best.score) best = { dir: d, entry: ex.entry, len: ex.len, incidence: ec.incidence, score };
    }
    return best;
  }

  SV.PlanTraj = { MODEL_N, PITCH, span, pickModel, modelId, modelN, makeHull, exitPoint, entryChecks, evaluate, statusOf, searchTrajectory, zoneIssues };

  // ================================================================ application
  const A = SV.app, S = SV.Store;
  const hasReal = s => !!(s && s.real && s.real.contacts && s.real.contacts.length);
  const M = {
    /** contexte de calcul : 'patient' (monde du T1, segmentation du patient) ou 'template' (tkrRAS, volume VEP) */
    trajCtx(space) {
      const P = this.patientAnat;
      if (space === 'patient') {
        if (!P || !P.segVol) return null;
        if (!P._hull) {
          const sv = P.segVol, [sx, sy] = sv.dims, d = sv.data, g = [Math.floor(sv.dims[0] / 2), Math.floor(sv.dims[1] / 2), Math.floor(sv.dims[2] / 2)];
          const isB = (i, j, k) => { for (let c = 0; c < 8; c++) { const x = 2 * i + (c & 1), y = 2 * j + ((c >> 1) & 1), z = 2 * k + ((c >> 2) & 1); if (d[x + sx * (y + sy * z)]) return true; } return false; };
          const G2W = M4.mul(M4.from(sv.affine), M4.from([2, 0, 0, 0.5, 0, 2, 0, 0.5, 0, 0, 2, 0.5, 0, 0, 0, 1]));
          P._hull = makeHull(g, isB, G2W, { close: 3, skull: true });
        }
        const midX = (P.info && P.info.midX) || 0, lab = P.labelWorld, tv = p => M4.apply(P.toDisplay, p[0], p[1], p[2]), latX = p => tv(p)[0] - midX;
        return { space: 'patient', hull: P._hull, toView: tv, fromView: p => M4.apply(P.fromDisplay, p[0], p[1], p[2]), toTpl: p => M4.apply(P.toTemplate, p[0], p[1], p[2]),
          labelAt: p => lab ? lab.labelAt(p[0], p[1], p[2]) : 0, latX, side: p => { const x = latX(p); return Math.abs(x) < 4 ? '' : x < 0 ? 'L' : 'R'; },
          dirView: (p, d) => unit(sub(tv(add(p, d)), tv(p))), isCb: this.trajCbTest() };
      }
      const V = this.vol; if (!V) return null;
      if (!this._tplHull) {
        const [d0, d1, d2] = V.dims, o = V.off, vx = V.vox;
        // grille (i, j, k) du volume VEP : x = 128 − (i + off0)·vox, z = 128 − (j + off1)·vox, y = (k + off2)·vox − 128 ; données [(i·d1 + j)·d2 + k]
        this._tplHull = makeHull([d0, d1, d2], (i, j, k) => V.data[(i * d1 + j) * d2 + k] > 0, [-vx, 0, 0, 128 - o[0] * vx, 0, 0, vx, o[2] * vx - 128, 0, -vx, 0, 128 - o[1] * vx, 0, 0, 0, 1], { close: 3, skull: true });
      }
      return { space: 'template', hull: this._tplHull, toView: p => p, fromView: p => p, toTpl: p => p, labelAt: p => V.labelAt(p[0], p[1], p[2]), latX: p => p[0], side: p => Math.abs(p[0]) < 4 ? '' : p[0] < 0 ? 'L' : 'R', dirView: (p, d) => d, isCb: this.trajCbTest() };
    },
    trajCbTest() { if (!this._cbSet) { this._cbSet = new Set(); for (let i = 1; i <= 162; i++) { const r = this.atlas.region(i); if (r && r.family === 'Cerebellar-cortex') this._cbSet.add(i); } } const S0 = this._cbSet; return l => S0.has(l); },
    /** espace d'édition de la vue : le patient si son anatomie est affichée */
    trajSpace() { return this.anatMode === 'patient' && this.patientAnat && this.patientAnat.segVol ? 'patient' : 'template'; },
    hemiOfSpec(spec) { return spec.hemi || SV.Side.fromName(spec.name, this.sideConv ? this.sideConv() : 'prime') || 'R'; },
    /** électrode prévue dans le monde de ctx : pointe, direction ; entrée sur l'enveloppe (ou fixée), modèle, plots, contrôles */
    trajElectrode(spec, ctx, tipW, dirW, entryFixed, base) {
      const hemi = this.hemiOfSpec(spec), ex = exitPoint(ctx.hull, tipW, dirW);
      const entryW = entryFixed || (ex ? ex.entry : add(tipW, dirW, 40)), L = ex ? ex.len : dist(tipW, entryW);
      const P0 = spec.plan, imported = !!(P0 && P0.tip && P0.n && !P0.snap && !P0.edited);
      const n = spec.modelFixed && modelN(spec.model) ? modelN(spec.model) : imported ? P0.n : pickModel(L);
      const offs = spec.modelFixed && modelN(spec.model) ? modelOffsets(spec.model, n) : modelOffsets(null, n), spanN = offs[offs.length - 1] + 1;   // v4.21 : cotes du modèle imposé
      const contactsW = []; for (let k = 1; k <= n; k++) contactsW.push(add(tipW, dirW, offs[k - 1]));
      const contacts = [], regions = new Map();
      contactsW.forEach((c, i) => { const votes = {}; for (const dd of [-0.8, 0, 0.8]) { const l = ctx.labelAt(add(c, dirW, dd)); votes[l] = (votes[l] || 0) + 1; } const label = +Object.keys(votes).sort((a, b) => votes[b] - votes[a])[0]; contacts.push({ k: i + 1, xyz: ctx.toView(c), label }); if (label >= 1 && label <= 162) regions.set(label, (regions.get(label) || 0) + 1); });
      const ev = evaluate(ctx, tipW, dirW, entryW, hemi, contacts), issues = ev.issues;
      if (spec.oblique) for (const i of issues) if (i.sev === 2 && /^incidence/.test(i.text)) { i.sev = 1; i.text += ' — oblique assumée'; }
      if (L - spanN > 10) issues.push({ sev: 0, text: `${(L - spanN).toFixed(0)} mm superficiels sans plot (modèle le plus long : 18 plots)` });
      if (spanN > L + 2) issues.push({ sev: 1, text: `modèle plus long que le trajet (${spanN.toFixed(0)} mm pour ${L.toFixed(0)} mm) : derniers plots hors du cerveau` });
      const tipV = ctx.toView(tipW), entV = ctx.toView(entryW), dV = unit(sub(entV, tipV));
      let entryLabel = 0; for (let s = 0; s <= 6 && !entryLabel; s++) { const l = ctx.labelAt(add(entryW, dirW, -s)); if (l >= 1 && l <= 162) entryLabel = l; }
      if (spec.targetIndex && !regions.has(spec.targetIndex) && this.atlas.region(spec.targetIndex)) issues.push({ sev: 1, text: 'aucun plot dans la cible ' + this.atlas.label(spec.targetIndex) });
      const fam = entryLabel && this.atlas.region(entryLabel) ? this.atlas.region(entryLabel).family : '';
      if (fam && SV.Electrodes.SULCAL && SV.Electrodes.SULCAL.test(fam)) issues.push({ sev: 1, text: 'entrée en fond de sillon (veines) : ' + this.atlas.label(entryLabel) });
      return Object.assign({}, base || {}, spec, { tip: tipV, entry: entV, dir: dV, length: L, model: modelId(n, spec.maker), nContacts: n, contacts, regions, issues, entryLabel, incidence: ev.incidence, status: statusOf(issues),
        obliquity: Math.round(Math.acos(Math.min(1, Math.abs(dV[0]))) * 180 / Math.PI), planned: true, real: false, tipW, entryW, dirW, space: ctx.space });
    },
  };
  Object.assign(A, M);

  // ---------------------------------------------------------------- greffes : construction, croisements, couleurs
  const bef0 = A.buildElectrodeFor, cr0 = SV.Electrodes.crossings;
  A.buildElectrodeFor = function (spec, space, geom) {
    const e = bef0.apply(this, arguments); if (!e) return e;
    if (geom === 'real' || (hasReal(spec) && geom !== 'plan') || e.real === true) return e;   // électrodes réelles : inchangées
    const P = this.patientAnat, sp = space || this.anatMode, seg = !!(P && P.segVol);
    try {
      if (seg && spec.plan && spec.plan.tip) {   // trajectoire du patient (monde du T1), affichée sur le patient ou sur le gabarit
        const ctx = this.trajCtx('patient'); if (!ctx) return e;
        const c2 = sp === 'patient' ? ctx : Object.assign({}, ctx, { toView: p => M4.apply(P.toTemplate, p[0], p[1], p[2]) });
        const p = spec.plan, d = unit(sub(p.entry, p.tip));
        return Object.assign(this.trajElectrode(spec, c2, p.tip, d, p.snap || p.edited ? null : p.entry, e), { space: sp });
      }
      if (seg && sp === 'patient') {   // schéma du gabarit porté sur le patient : entrée sur l'enveloppe du patient
        const ctx = this.trajCtx('patient'); if (!ctx) return e;
        const tipW = ctx.fromView(e.tip), dW = unit(sub(ctx.fromView(add(e.tip, e.dir, 10)), tipW));
        return this.trajElectrode(spec, ctx, tipW, dW, null, Object.assign({}, e, { issues: [] }));
      }
      if (spec.plan && spec.plan.tip) {   // trajectoire importée sans segmentation du patient : contrôles seulement
        const ctx = this.trajCtx('template'); if (!ctx || !e.tip || !e.dir) return e;
        const ev = evaluate(ctx, e.tip, e.dir, e.entry, this.hemiOfSpec(spec), e.contacts), issues = (e.issues || []).concat(ev.issues.filter(i => !(e.issues || []).some(j => j.text === i.text)));
        return Object.assign(e, { issues, incidence: ev.incidence, status: statusOf(issues), planned: true });
      }
      // schéma sur le gabarit : même règle (entrée sur l'enveloppe du gabarit, modèle d'après le trajet)
      const ctx = this.trajCtx('template'); if (!ctx || !e.tip || !e.dir) return e;
      return this.trajElectrode(spec, ctx, e.tip, e.dir, null, Object.assign({}, e, { issues: [] }));
    } catch (err) { console.warn('trajectoire', err); return e; }
  };
  // coupes IRM : les électrodes prévues y sont à la même place que dans la 3D (entrée sur l'enveloppe, modèle d'après le trajet)
  /** électrode prévue → { pts, tip, entry } dans le monde du T1, d'après sa construction (celle de la vue si c'est le schéma ouvert) */
  /** électrode prévue telle que construite pour la vue 3D, ramenée dans l'espace des coupes (monde du T1, ou gabarit MNI) */
  A.planWorldOf = function (spec) {
    if (!spec || !(this.patientAnat || (this.slvSpace && this.slvSpace() === 'tpl'))) return null;
    const cur = !!(this.state && (this.state.electrodes || []).includes(spec));
    let e = cur && !(this._hd && this._hd.eid === spec.id) ? (this.elecs || []).find(x => x.id === spec.id && !x.real) : null;   // pendant un glisser : construite à neuf
    if (!e) { try { e = this.buildElectrodeFor(spec, this.anatMode, 'plan'); } catch (err) { e = null; } }
    if (!e || e.real || !e.tip || !e.entry || !e.contacts) return null;
    const W = p => this.viewToSlv(p), tip = W(e.tip), entry = W(e.entry); if (!tip || !entry) return null;
    return { pts: e.contacts.map(c => W(c.xyz)), tip, entry };
  };
  const sw0 = A.specWorld;
  if (sw0) A.specWorld = function (spec, geom) {
    if (geom === 'real' || (geom !== 'plan' && hasReal(spec)) || !(spec.target || (spec.plan && spec.plan.tip))) return sw0.apply(this, arguments);
    const w = this.planWorldOf(spec); return w ? Object.assign({ name: spec.name }, w) : sw0.apply(this, arguments);
  };
  const we0 = A.worldElectrodes;
  if (we0) A.worldElectrodes = function () {
    const r = we0.apply(this, arguments); if (!r || !r.ex || !r.list) return r;
    const cx = this.ctx && this.dossier && S.byId(this.dossier.explorations, this.ctx.explorationId), specs = r.ex === cx && this.state && (this.state.electrodes || []).length ? this.state.electrodes : r.ex.electrodes;
    for (const it of r.list) { if (it.kind !== 'planned') continue; const spec = specs.find(s => s.id === it.id); const w = spec && this.planWorldOf(spec); if (w) Object.assign(it, w); }
    return r;
  };
  // enveloppes calculées en tâche de fond dès que l'anatomie du patient est prête (≈ 3 s, une fois par patient)
  const bpa0 = A.buildPatientAnat;
  if (bpa0) A.buildPatientAnat = function () {
    const P = bpa0.apply(this, arguments), app = this;
    if (P && P.segVol) { const go = () => { if (app.patientAnat === P && !P._hull) try { app.trajCtx('patient'); } catch (e) { console.warn('enveloppe', e); } }; (window.requestIdleCallback || (f => setTimeout(f, 1500)))(go, { timeout: 8000 }); }
    return P;
  };
  /** croisements : < 3 mm irréalisable, < 6 mm à revoir (électrodes prévues) ; état recalculé */
  SV.Electrodes.crossings = function (list) {
    cr0(list);
    const plan = list.filter(e => e.planned && !e.real);
    for (const e of plan) e.issues = (e.issues || []).filter(i => !i.cross);
    for (let i = 0; i < plan.length; i++) for (let j = i + 1; j < plan.length; j++) {
      const a = plan[i], b = plan[j]; if (!a.tip || !b.tip) continue;
      const d = SV.Electrodes.segDist(a.tip, add(a.entry, a.dir, 8), b.tip, add(b.entry, b.dir, 8)); if (d >= 6) continue;
      const sev = d < 3 ? 3 : 2, t = n => `${d < 3 ? 'croise' : 'à ' + d.toFixed(1) + ' mm de'} ${n}`;
      a.issues.push({ sev, cross: true, text: t(b.name) }); b.issues.push({ sev, cross: true, text: t(a.name) });
    }
    for (const e of list) if (e.planned && !e.real) e.status = statusOf(e.issues || []);
  };
})(window.SV = window.SV || {});
