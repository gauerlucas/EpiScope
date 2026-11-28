/* EpiScope — imaging/elastix.js (v3.5.0) : recalage fin (non linéaire, dense) par elastix, dans le navigateur, sans logiciel externe.
 *
 * elastix (Klein et al., IEEE TMI 2010 ; Shamonin et al., Front Neuroinform 2014) est exécuté tel quel dans sa version WebAssembly
 * (ITKElastix / itk-wasm, imaging/elastix_wasm.js + assets/elastix.json) ; ce module prépare les images, choisit les cartes de
 * paramètres, relit la transformation obtenue et l'applique aux points.
 *
 *   Cartes de paramètres : celles d'ITKElastix par défaut (affine puis B-spline cubique, information mutuelle de Mattes,
 *   descente de gradient stochastique adaptative, pyramide de lissage à 4 niveaux, pénalité d'énergie de flexion), avec
 *   les seules modifications de MAPS_CHANGES (validées sur des T1 réels contre ANTs SyN : voir tools/validation/).
 *   Conventions : elastix travaille en coordonnées physiques LPS ; la transformation va du domaine FIXE vers le domaine
 *   MOBILE (T(x) = point de l'image mobile qui correspond au point x de l'image fixe) ; les cartes successives sont composées
 *   (« Compose ») : T(x) = T_n(… T_1(T_0(x))) — ordre vérifié contre l'image rééchantillonnée par elastix (test_elastix.mjs).
 *   Vers MNI : image fixe = T1 du patient (cerveau seul), image mobile = T1 du gabarit MNI 2009b (cerveau seul) : T va donc
 *   du patient vers le gabarit, ce qu'il faut pour les coordonnées des plots.
 *   Contrôle : déterminant jacobien sur une grille de 2 mm dans le cerveau (part de repliements, minimum) — publié avec le
 *   résultat, comme dans les comparaisons de méthodes (Learn2Reg, Klein 2009).
 *
 * Fabrique 'elastix' (sans DOM) : utilisable dans un worker (avec 'elastixwasm') et sous Node (tests).                      */
(function (factory) {
  const G = typeof window !== 'undefined' ? (window.SV = window.SV || {}) : (globalThis.SV = globalThis.SV || {});
  factory(G); (G._factories = G._factories || {}).elastix = factory;
})(function (SV) {
  'use strict';
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  // ---------------------------------------------------------------------------------------------------- cartes de paramètres
  /** cartes par défaut d'ITKElastix 2.1 (defaultParameterMap 'affine' / 'bspline', 4 niveaux), recopiées pour ne pas dépendre
   *  du programme default-parameter-map ; la valeur de chaque clé est une liste de chaînes, comme dans elastix */
  const BASE = {
    AutomaticParameterEstimation: ['true'], CheckNumberOfSamples: ['true'], DefaultPixelValue: ['0'], FinalBSplineInterpolationOrder: ['3'],
    FixedImagePyramid: ['FixedSmoothingImagePyramid'], ImageSampler: ['RandomCoordinate'], Interpolator: ['LinearInterpolator'],
    MaximumNumberOfIterations: ['256'], MaximumNumberOfSamplingAttempts: ['8'], MovingImagePyramid: ['MovingSmoothingImagePyramid'],
    NewSamplesEveryIteration: ['true'], NumberOfResolutions: ['4'], NumberOfSamplesForExactGradient: ['4096'], NumberOfSpatialSamples: ['2048'],
    Optimizer: ['AdaptiveStochasticGradientDescent'], ResampleInterpolator: ['FinalBSplineInterpolator'], Resampler: ['DefaultResampler'],
    ResultImageFormat: ['nii'], WriteIterationInfo: ['false'], WriteResultImage: ['true']
  };
  const RIGID = Object.assign({}, BASE, { Metric: ['AdvancedMattesMutualInformation'], Registration: ['MultiResolutionRegistration'], Transform: ['EulerTransform'], AutomaticScalesEstimation: ['true'], AutomaticTransformInitialization: ['true'], AutomaticTransformInitializationMethod: ['CenterOfGravity'] });
  const AFFINE = Object.assign({}, BASE, { Metric: ['AdvancedMattesMutualInformation'], Registration: ['MultiResolutionRegistration'], Transform: ['AffineTransform'], AutomaticScalesEstimation: ['true'] });
  const BSPLINE = Object.assign({}, BASE, { Metric: ['AdvancedMattesMutualInformation', 'TransformBendingEnergyPenalty'], Metric0Weight: ['1.0'], Metric1Weight: ['1.0'],
    Registration: ['MultiMetricMultiResolutionRegistration'], Transform: ['BSplineTransform'], FinalGridSpacingInPhysicalUnits: ['8'], GridSpacingSchedule: ['2.8284271247461903', '2', '1.4142135623730951', '1'] });
  /** modifications des cartes par défaut, par usage, réglées sur des patients (bilan hors dépôt) ; gardées dans le dossier avec
   *  chaque transformation (an.mni.elastix.changes, derived.changes) :
   *   - mni : grille finale 6 mm, pénalité de flexion 5, 1000 itérations, 5000 échantillons — recouvrement des régions comparable
   *     à ANTs SyN, champ sans repliement notable ;
   *   - coreg (deux images du même patient) : grille large (20 mm), déformation douce — croissance, pas de détail sillon par sillon */
  const MAPS_CHANGES = {
    mni: { affine: {}, bspline: { FinalGridSpacingInPhysicalUnits: ['6'], MaximumNumberOfIterations: ['1000'], NumberOfSpatialSamples: ['5000'], Metric1Weight: ['5'] } },
    coreg: { affine: {}, bspline: { FinalGridSpacingInPhysicalUnits: ['20'], MaximumNumberOfIterations: ['500'], NumberOfSpatialSamples: ['5000'] } }
  };
  const clone = o => JSON.parse(JSON.stringify(o));
  /** cartes [affine, B-spline] (ou [rigide, B-spline] si o.rigid) pour un usage ('mni' | 'coreg') */
  function maps(use, o) {
    o = o || {}; const C = MAPS_CHANGES[use] || {}, X = o.changes || {};   // o.changes : réglages ponctuels (tests), par-dessus l'usage
    const a = Object.assign(clone(o.rigid ? RIGID : AFFINE), C.affine || {}, X.affine || {}), b = Object.assign(clone(BSPLINE), C.bspline || {}, X.bspline || {});
    return o.linearOnly ? [a] : [a, b];
  }

  // ---------------------------------------------------------------------------------------------------- images itk-wasm
  /** volume NIfTI (affine RAS ligne par ligne, data, slope / inter) → image itk-wasm float32 en LPS ; mask : voxels gardés
   *  (les autres à 0 : cerveau seul) */
  function itkImage(vol, mask) {
    const A = Array.from(vol.affine), F = [-1, -1, 1], n = vol.dims[0] * vol.dims[1] * vol.dims[2], s = vol.slope || 1, b = vol.inter || 0;
    const sp = [0, 1, 2].map(c => Math.hypot(A[c], A[4 + c], A[8 + c]));
    const dir = new Float64Array(9); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) dir[c + 3 * r] = F[r] * A[4 * r + c] / sp[c];
    const data = new Float32Array(n); for (let i = 0; i < n; i++) data[i] = (mask && !mask[i]) ? 0 : vol.data[i] * s + b;
    return { imageType: { dimension: 3, componentType: 'float32', pixelType: 'Scalar', components: 1 }, name: 'image', origin: [F[0] * A[3], F[1] * A[7], F[2] * A[11]], spacing: sp, direction: dir, size: vol.dims.slice(0, 3), metadata: new Map(), data };
  }
  /** image itk-wasm (LPS) → volume NIfTI (RAS) */
  function fromItk(img) {
    const F = [-1, -1, 1], D = img.direction, sp = img.spacing, A = new Float64Array(16);
    for (let r = 0; r < 3; r++) { for (let c = 0; c < 3; c++) A[4 * r + c] = F[r] * D[c + 3 * r] * sp[c]; A[4 * r + 3] = F[r] * img.origin[r]; } A[15] = 1;
    return { dims: img.size.slice(0, 3), pixdim: sp.slice(0, 3), affine: A, data: Float32Array.from(img.data), slope: 1, inter: 0, datatype: 16 };
  }
  /** masque binaire dilaté de r voxels (6-voisinage) : étiquettes > 0 */
  function dilate(lab, dims, r) {
    const [nx, ny, nz] = dims, NN = nx * ny, m = new Uint8Array(lab.length); for (let i = 0; i < lab.length; i++) m[i] = lab[i] > 0 ? 1 : 0;
    for (let it = 0; it < r; it++) { const o = m.slice(); for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) { const q = i + nx * (j + ny * k); if (!m[q] && (m[q - 1] || m[q + 1] || m[q - nx] || m[q + nx] || m[q - NN] || m[q + NN])) o[q] = 1; } m.set(o); }
    return m;
  }
  /** étiquettes d'un volume rééchantillonnées (plus proche voisin) sur la grille d'un autre volume */
  function resampleLabels(src, dst) {
    const Ai = SV.Mat4 ? SV.Mat4.inv(SV.Mat4.from(Array.from(src.affine))) : inv4(Array.from(src.affine)), B = Array.from(dst.affine), [sx, sy, sz] = src.dims, [nx, ny, nz] = dst.dims, out = new Uint8Array(nx * ny * nz);
    const M = mul4(Array.from(Ai), B);
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const u = Math.round(M[0] * i + M[1] * j + M[2] * k + M[3]), v = Math.round(M[4] * i + M[5] * j + M[6] * k + M[7]), w = Math.round(M[8] * i + M[9] * j + M[10] * k + M[11]);
      if (u >= 0 && v >= 0 && w >= 0 && u < sx && v < sy && w < sz) out[i + nx * (j + ny * k)] = src.data[u + sx * (v + sy * w)] > 0 ? 1 : 0;
    }
    return out;
  }
  function mul4(A, B) { const C = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) C[4 * i + j] += A[4 * i + k] * B[4 * k + j]; return C; }
  function inv4(m) {
    const a = m, inv = new Array(16);
    inv[0] = a[5] * a[10] * a[15] - a[5] * a[11] * a[14] - a[9] * a[6] * a[15] + a[9] * a[7] * a[14] + a[13] * a[6] * a[11] - a[13] * a[7] * a[10];
    inv[4] = -a[4] * a[10] * a[15] + a[4] * a[11] * a[14] + a[8] * a[6] * a[15] - a[8] * a[7] * a[14] - a[12] * a[6] * a[11] + a[12] * a[7] * a[10];
    inv[8] = a[4] * a[9] * a[15] - a[4] * a[11] * a[13] - a[8] * a[5] * a[15] + a[8] * a[7] * a[13] + a[12] * a[5] * a[11] - a[12] * a[7] * a[9];
    inv[12] = -a[4] * a[9] * a[14] + a[4] * a[10] * a[13] + a[8] * a[5] * a[14] - a[8] * a[6] * a[13] - a[12] * a[5] * a[10] + a[12] * a[6] * a[9];
    inv[1] = -a[1] * a[10] * a[15] + a[1] * a[11] * a[14] + a[9] * a[2] * a[15] - a[9] * a[3] * a[14] - a[13] * a[2] * a[11] + a[13] * a[3] * a[10];
    inv[5] = a[0] * a[10] * a[15] - a[0] * a[11] * a[14] - a[8] * a[2] * a[15] + a[8] * a[3] * a[14] + a[12] * a[2] * a[11] - a[12] * a[3] * a[10];
    inv[9] = -a[0] * a[9] * a[15] + a[0] * a[11] * a[13] + a[8] * a[1] * a[15] - a[8] * a[3] * a[13] - a[12] * a[1] * a[11] + a[12] * a[3] * a[9];
    inv[13] = a[0] * a[9] * a[14] - a[0] * a[10] * a[13] - a[8] * a[1] * a[14] + a[8] * a[2] * a[13] + a[12] * a[1] * a[10] - a[12] * a[2] * a[9];
    inv[2] = a[1] * a[6] * a[15] - a[1] * a[7] * a[14] - a[5] * a[2] * a[15] + a[5] * a[3] * a[14] + a[13] * a[2] * a[7] - a[13] * a[3] * a[6];
    inv[6] = -a[0] * a[6] * a[15] + a[0] * a[7] * a[14] + a[4] * a[2] * a[15] - a[4] * a[3] * a[14] - a[12] * a[2] * a[7] + a[12] * a[3] * a[6];
    inv[10] = a[0] * a[5] * a[15] - a[0] * a[7] * a[13] - a[4] * a[1] * a[15] + a[4] * a[3] * a[13] + a[12] * a[1] * a[7] - a[12] * a[3] * a[5];
    inv[14] = -a[0] * a[5] * a[14] + a[0] * a[6] * a[13] + a[4] * a[1] * a[14] - a[4] * a[2] * a[13] - a[12] * a[1] * a[6] + a[12] * a[2] * a[5];
    inv[3] = -a[1] * a[6] * a[11] + a[1] * a[7] * a[10] + a[5] * a[2] * a[11] - a[5] * a[3] * a[10] - a[9] * a[2] * a[7] + a[9] * a[3] * a[6];
    inv[7] = a[0] * a[6] * a[11] - a[0] * a[7] * a[10] - a[4] * a[2] * a[11] + a[4] * a[3] * a[10] + a[8] * a[2] * a[7] - a[8] * a[3] * a[6];
    inv[11] = -a[0] * a[5] * a[11] + a[0] * a[7] * a[9] + a[4] * a[1] * a[11] - a[4] * a[3] * a[9] - a[8] * a[1] * a[7] + a[8] * a[3] * a[5];
    inv[15] = a[0] * a[5] * a[10] - a[0] * a[6] * a[9] - a[4] * a[1] * a[10] + a[4] * a[2] * a[9] + a[8] * a[1] * a[6] - a[8] * a[2] * a[5];
    const det = a[0] * inv[0] + a[1] * inv[4] + a[2] * inv[8] + a[3] * inv[12]; return inv.map(v => v / det);
  }

  // ---------------------------------------------------------------------------------------------------- transformations
  const num = (m, k) => (m[k] || []).map(Number);
  function linPart(m) {
    const t = m.Transform[0], p = num(m, 'TransformParameters'), c = num(m, 'CenterOfRotationPoint');
    if (t === 'AffineTransform') return { A: p.slice(0, 9), c, t: p.slice(9, 12) };
    if (t === 'TranslationTransform') return { A: [1, 0, 0, 0, 1, 0, 0, 0, 1], c: [0, 0, 0], t: p.slice(0, 3) };
    if (t === 'EulerTransform') {
      const [rx, ry, rz] = p, cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
      const Rx = [1, 0, 0, 0, cx, -sx, 0, sx, cx], Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy], Rz = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
      const mul = (A, B) => { const C = new Array(9).fill(0); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) C[3 * i + j] += A[3 * i + k] * B[3 * k + j]; return C; };
      // ITK Euler3DTransform : R = Rz·Rx·Ry (ComputeZYX faux, défaut) ou Rz·Ry·Rx
      return { A: (m.ComputeZYX || ['false'])[0] === 'true' ? mul(Rz, mul(Ry, Rx)) : mul(Rz, mul(Rx, Ry)), c, t: p.slice(3, 6) };
    }
    return null;
  }
  const b3 = u => { u = Math.abs(u); return u < 1 ? (4 - 6 * u * u + 3 * u * u * u) / 6 : u < 2 ? (2 - u) * (2 - u) * (2 - u) / 6 : 0; };
  /** une carte → fonction point (LPS, mm) → point */
  function stepFn(m) {
    const L = linPart(m);
    if (L) return x => { const d = [x[0] - L.c[0], x[1] - L.c[1], x[2] - L.c[2]]; return [0, 1, 2].map(i => L.A[3 * i] * d[0] + L.A[3 * i + 1] * d[1] + L.A[3 * i + 2] * d[2] + L.c[i] + L.t[i]); };
    if (m.Transform[0] !== 'BSplineTransform') throw new Error('transformation elastix non prise en charge : ' + m.Transform[0]);
    if (+((m.BSplineTransformSplineOrder || ['3'])[0]) !== 3) throw new Error('B-spline d’ordre ≠ 3');
    const G = num(m, 'GridSize'), O = num(m, 'GridOrigin'), S = num(m, 'GridSpacing'), D = m.GridDirection ? num(m, 'GridDirection') : [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const P = m._P || Float64Array.from(num(m, 'TransformParameters')), N = G[0] * G[1] * G[2];
    // GridDirection est rangée colonne par colonne : composante k de l'index = (colonne k)·(x − origine) / pas
    return x => {
      const d = [x[0] - O[0], x[1] - O[1], x[2] - O[2]], q = [0, 1, 2].map(k => (D[3 * k] * d[0] + D[3 * k + 1] * d[1] + D[3 * k + 2] * d[2]) / S[k]);
      const st = [Math.floor(q[0]) - 1, Math.floor(q[1]) - 1, Math.floor(q[2]) - 1], w = q.map((v, k) => [b3(v - st[k]), b3(v - st[k] - 1), b3(v - st[k] - 2), b3(v - st[k] - 3)]);
      let u0 = 0, u1 = 0, u2 = 0;
      for (let c = 0; c < 4; c++) { const kk = st[2] + c; if (kk < 0 || kk >= G[2]) continue; for (let b = 0; b < 4; b++) { const jj = st[1] + b; if (jj < 0 || jj >= G[1]) continue; const wbc = w[2][c] * w[1][b];
        for (let a = 0; a < 4; a++) { const ii = st[0] + a; if (ii < 0 || ii >= G[0]) continue; const wt = wbc * w[0][a], id = ii + G[0] * (jj + G[1] * kk); u0 += wt * P[id]; u1 += wt * P[N + id]; u2 += wt * P[2 * N + id]; } } }
      return [x[0] + u0, x[1] + u1, x[2] + u2];
    };
  }
  /** liste de cartes (objet de paramètres de transformation d'elastix) → fonction point LPS → point LPS (composition) */
  function compileLPS(tpo) { const f = tpo.map(stepFn); return x => { let y = x; for (const g of f) y = g(y); return y; }; }
  /** même chose en RAS (monde NIfTI, celui d'EpiScope) */
  function compile(tpo) { const f = compileLPS(tpo); return p => { const q = f([-p[0], -p[1], p[2]]); return [-q[0], -q[1], q[2]]; }; }
  /** inverse par point fixe (y → x tel que T(x) = y), départ : inverse de la partie linéaire ; n itérations de Newton approché */
  function inverse(tpo) {
    const T = compile(tpo), L0 = tpo.map(linPart).find(Boolean);
    let Li = null; if (L0) { const A = L0.A, M = [A[0], A[1], A[2], 0, A[3], A[4], A[5], 0, A[6], A[7], A[8], 0, 0, 0, 0, 1], I = inv4(M); Li = I; }
    return y => {
      let x = y.slice();
      if (Li) { const z = [-y[0], -y[1], y[2]], c = L0.c, t = L0.t, d = [z[0] - c[0] - t[0], z[1] - c[1] - t[1], z[2] - c[2] - t[2]], u = [0, 1, 2].map(i => Li[4 * i] * d[0] + Li[4 * i + 1] * d[1] + Li[4 * i + 2] * d[2] + c[i]); x = [-u[0], -u[1], u[2]]; }
      for (let it = 0; it < 40; it++) { const r = T(x), e = [y[0] - r[0], y[1] - r[1], y[2] - r[2]]; x = [x[0] + e[0], x[1] + e[1], x[2] + e[2]]; if (Math.hypot(e[0], e[1], e[2]) < 1e-3) break; }
      return x;
    };
  }
  /** déterminant jacobien de T sur les voxels d'un masque (pas en voxels) → { negPct, min, p1, n } */
  function jacobian(tpo, vol, mask, step) {
    const T = compile(tpo), A = Array.from(vol.affine), [nx, ny, nz] = vol.dims, h = 0.5, dets = [];
    step = step || 2;
    for (let k = 1; k < nz - 1; k += step) for (let j = 1; j < ny - 1; j += step) for (let i = 1; i < nx - 1; i += step) {
      if (mask && !mask[i + nx * (j + ny * k)]) continue;
      const p = [A[0] * i + A[1] * j + A[2] * k + A[3], A[4] * i + A[5] * j + A[6] * k + A[7], A[8] * i + A[9] * j + A[10] * k + A[11]];
      const J = [0, 1, 2].map(a => { const e = [0, 0, 0]; e[a] = h; const u = T([p[0] + e[0], p[1] + e[1], p[2] + e[2]]), v = T([p[0] - e[0], p[1] - e[1], p[2] - e[2]]); return [(u[0] - v[0]) / (2 * h), (u[1] - v[1]) / (2 * h), (u[2] - v[2]) / (2 * h)]; });
      dets.push(J[0][0] * (J[1][1] * J[2][2] - J[1][2] * J[2][1]) - J[1][0] * (J[0][1] * J[2][2] - J[0][2] * J[2][1]) + J[2][0] * (J[0][1] * J[1][2] - J[0][2] * J[1][1]));
    }
    const s = Float64Array.from(dets).sort(); let neg = 0; for (const d of s) if (d <= 0) neg++;
    return { negPct: +(100 * neg / Math.max(1, s.length)).toFixed(3), min: +(s[0] || 0).toFixed(3), p1: +(s[Math.floor(0.01 * s.length)] || 0).toFixed(3), n: s.length };
  }
  /** forme compacte (fichier dérivé) : paramètres en Float64 base64, le reste tel quel */
  function pack(tpo) {
    return tpo.map(m => { const o = {}; for (const k in m) { if (k === '_P') continue; o[k] = m[k]; } if (m.TransformParameters && m.TransformParameters.length > 64) { const a = Float64Array.from(m.TransformParameters.map(Number)); o.TransformParameters = null; o.TransformParametersF64 = b64(new Uint8Array(a.buffer)); } return o; });
  }
  function unpack(tpo) { return tpo.map(m => { const o = Object.assign({}, m); if (o.TransformParametersF64) { const P = new Float64Array(unb64(o.TransformParametersF64).buffer); Object.defineProperty(o, '_P', { value: P, enumerable: false }); o.TransformParameters = { length: P.length, map: f => Array.from(P, f) }; delete o.TransformParametersF64; } return o; }); }
  function b64(u8) { if (typeof Buffer !== 'undefined') return Buffer.from(u8).toString('base64'); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
  function unb64(s) { if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(s, 'base64')); const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }

  // ---------------------------------------------------------------------------------------------------- calculs (worker)
  async function wasmBinary(gzB64) {
    const u8 = unb64(gzB64);
    if (typeof DecompressionStream !== 'undefined') return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    return new Uint8Array(require('zlib').gunzipSync(u8));   // Node (tests)
  }
  /** recalage elastix générique : fixed / moving = volumes NIfTI, masques optionnels (cerveau seul), use = 'mni' | 'coreg' →
   *  { tpo (forme compacte), jac, secs, maps (cartes demandées), result (volume rééchantillonné sur la grille fixe si o.result) } */
  async function register(wasmGzB64, fixed, fixedMask, moving, movingMask, use, o, progress) {
    o = o || {}; const t0 = now(), say = (f, m) => progress && progress({ fraction: f, message: m });
    if (!SV.ElastixWasm) throw new Error('module elastix absent de cette version');
    say(0.02, 'chargement d’elastix'); const wasm = await wasmBinary(wasmGzB64);
    const M = maps(use, o), log = [];
    say(0.05, 'recalage (elastix : ' + M.map(m => m.Transform[0].replace('Transform', '')).join(' puis ') + ')');
    const r = await SV.ElastixWasm.run(wasm, M, itkImage(fixed, fixedMask), itkImage(moving, movingMask), t => { log.push(t); const m = /^(\d+)\s/.exec(t); if (m && log.length % 200 === 0) say(Math.min(0.9, 0.05 + log.length / 20000), 'recalage en cours'); });
    say(0.92, 'contrôle de la transformation (déterminant jacobien)');
    const tpo = r.transformParameterObject, jac = jacobian(tpo, fixed, fixedMask || null, 3);
    const out = { tpo: pack(tpo), jac, secs: +((now() - t0) / 1000).toFixed(1), maps: M, version: SV.ElastixWasm.version, itkWasm: SV.ElastixWasm.itkWasm };
    if (o.result) out.result = fromItk(r.result);
    return out;
  }
  /** patient → MNI 2009b : T1 conformé du patient + segmentation (cerveau = étiquettes > 0, dilaté 2 mm) ; gabarit : T1 2009b
   *  1 mm + segmentation du gabarit (2 mm, rééchantillonnée) */
  async function registerMNI(wasmGzB64, patT1, patSeg, tplT1, tplSeg, progress) {
    const mP = dilate(patSeg.data, patSeg.dims, 2), tl = resampleLabels(tplSeg, tplT1), mT = dilate(tl, tplT1.dims, 2);
    const mPonT1 = sameGrid(patSeg, patT1) ? mP : resampleLabels({ affine: patSeg.affine, dims: patSeg.dims, data: mP }, patT1);
    return register(wasmGzB64, patT1, mPonT1, tplT1, mT, 'mni', {}, progress);
  }
  /** deux images du patient (années d'écart, croissance, post-opératoire) : référence conformée (fixe) et image déjà portée sur
   *  la même grille par le rigide (mobile) ; masque = cerveau segmenté de la référence dilaté de 6 mm (cerveau, LCR, table interne :
   *  la déformation suit le cerveau, pas le scalp ni le cou), appliqué aux deux images (le rigide les a déjà superposées : un
   *  masque d'un seul côté opposerait un cerveau seul à une tête entière) ; sans segmentation, images entières */
  async function registerCoreg(wasmGzB64, fixed, fixedSeg, moving, o, progress) {
    let mF = null;
    if (fixedSeg) { const m = dilate(fixedSeg.data, fixedSeg.dims, 6); mF = sameGrid(fixedSeg, fixed) ? m : resampleLabels({ affine: fixedSeg.affine, dims: fixedSeg.dims, data: m }, fixed); }
    return register(wasmGzB64, fixed, mF, moving, mF && sameGrid(fixed, moving) ? mF : null, 'coreg', o || {}, progress);
  }
  const sameGrid = (a, b) => a.dims.join() === b.dims.join() && Array.from(a.affine).every((v, i) => Math.abs(v - b.affine[i]) < 1e-4);

  SV.Elastix = { MAPS_CHANGES, maps, itkImage, fromItk, dilate, resampleLabels, compile, compileLPS, inverse, jacobian, pack, unpack, register, registerMNI, registerCoreg, wasmBinary };
});
