/* EpiScope — meshnet.js : segmentation cérébrale MeshNet (modèles brainchop, neuroneural/brainchop, licence MIT)
 * sur CPU, sans TensorFlow.js, multi-fil (Web Workers via SV.Work), depuis file://.
 *
 * Reproduit la chaîne brainchop (inference-logic.js, tensor-utils.js, brainchop-mainthread.js) :
 *   1. image conformée (niivue / FastSurfer conform : 256³, 1 mm, LIA, uint8) — voir conform() ;
 *   2. normalisation sur tout le volume 256³ : min-max (x−min)/(max−min) ou quantiles 5 %–95 % (sans écrêtage) ;
 *   3. masque de recadrage : sortie ≠ 0 du prémodèle (model5_gw_ae pour l'atlas 104) sinon seuil automatique
 *      (x > max·autoThreshold) sinon x > 0 ; boîte englobante + marge cropPadding (bornée à 0..255) ;
 *   4. couches Conv3D 3×3×3 dilatées (« same », zéros hors boîte) + activation (relu, elu, gelu), normalisation
 *      d'instance après les couches « _gn » (mindgrab), dernière couche 1×1×1 → argmax (premier maximum) ;
 *   5. remise dans la grille 256³ (0 hors boîte) ; post-traitement : plus grande composante 26-connexe du masque
 *      binaire des étiquettes ≠ 0 (BWLabeler brainchop : binarize + onlyLargestClusterPerClass).
 *
 * Indexation (point critique) : brainchop empile l'image conformée en tenseur [k][j][i] (i le plus rapide, comme nos
 * volumes) puis le transpose : axes du modèle (D,H,W) = (i,j,k). La prise (dd,dh,dw) d'un noyau Keras
 * [kd][kh][kw][ci][co] s'applique donc au décalage voxel (di,dj,dk) = (dd−1, dh−1, dw−1)·dilatation.
 *
 * Calcul : activations « canal dernier » par plan k de la boîte (Float32Array bx·by·C) ; chaque couche est découpée en
 * tranches de plans k ; une tâche reçoit les seuls plans d'entrée nécessaires (z−d, z, z+d), calcule la tranche et la
 * renvoie (objets transférables). La dernière couche 1×1×1 est fusionnée avec l'argmax (jamais 104×N flottants).
 * Noyau WebAssembly SIMD (tools/meshnet_wasm.c, embarqué en base64) avec repli JavaScript équivalent ; sans Worker
 * (Node, tests) le calcul se fait dans le fil courant. La fabrique ne dépend que de SV et des API standard.
 *
 * API (SV.MeshNet) :
 *   isConformed(vol) ; conform(vol, {mode:'niivue'|'fastsurfer'}) → volume uint8 256³ LIA (affine monde)
 *   loadModel(json) → modèle (poids Float32Array réordonnés) ; json = assets/models/<nom>.json (tools/make_models.py)
 *   segment(conf, model, {premodel, mask, pool, workers, wasm, onProgress, postprocess, signal, harmonize, pad, keepImage})
 *     harmonize (EpiScope, hors brainchop) : biais de champ corrigé et intensités standardisées avant le réseau — voir harmonize() ;
 *     → Promise<{labels: Uint8Array 256³ (grille conformée), dims, affine, labelNames, fsCodes, hemi, cropBox, maskSource,
 *                ms, timings, workers}>
 *   largestComponent(labels, dims, perLabel) ; labelStats(labels, dims, affine, names) → effectifs et centroïdes monde
 * Fils : opts.pool = SV.Work.pool(['meshnet'], n) réutilisable (chaque worker garde ~60 Mo de mémoire WebAssembly),
 * sinon segment() crée puis ferme un groupe de opts.workers (défaut : cœurs logiques, ≤ 8) ; workers: 0 → fil courant.
 * Mémoire du fil principal ≈ une couche d'activations de la boîte (N·C·4 octets, ~250–350 Mo pour l'atlas 104 ;
 * 335 Mo pour le prémodèle sur 256³) : les plans d'entrée sont libérés dès leur dernière copie vers une tâche.
 * Étiquettes : indices du modèle (labelNames[i]) ; fsCodes[i] = code FreeSurferColorLUT (aparc+aseg), hemi[i] = 'L'|'R'|''.
 * Retour vers la grille native : SV.Vol.resample({dims, data: labels, affine, slope: 1, inter: 0}, natif, null, 'nearest'). */
(function (factory) {
  const G = typeof window !== 'undefined' ? (window.SV = window.SV || {}) : (globalThis.SV = globalThis.SV || {});
  factory(G); (G._factories = G._factories || {}).meshnet = factory;   // fabrique réutilisée dans les workers (voir work.js)
})(function (SV) {
  'use strict';
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const ACT = { linear: 0, relu: 1, elu: 2, gelu: 3 };

  // ---------------------------------------------------------------- activations (identiques à tf.js)
  // erf : Abramowitz-Stegun 7.1.26 (tfjs-backend-cpu Erf) ; gelu = x·½(1 + erf(x/√2)) (tfjs-layers Gelu)
  function erf(x) {
    const s = Math.sign(x), v = Math.abs(x), t = 1 / (1 + 0.3275911 * v);
    return s * (1 - (((((1.061405429 * t + -1.453152027) * t) + 1.421413741) * t + -0.284496736) * t + 0.254829592) * t * Math.exp(-v * v));
  }
  function act(x, a) { return a === 1 ? (x > 0 ? x : 0) : a === 2 ? (x >= 0 ? x : Math.exp(x) - 1) : a === 3 ? x * (0.5 * (1 + erf(x / Math.SQRT2))) : x; }

  function b64(s) { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }

  // ---------------------------------------------------------------- modèle
  /** json (assets/models/<nom>.json) → { name, settings, layers:[{inC,outC,kernel,dil,act,gn,bias,W,B,nv}], labels, ... }
   *  W 3×3×3 réordonné [dz][dy][dx][ci][co] (dz ↔ k, dy ↔ j, dx ↔ i) ; tête 1×1×1 [ci][co'] (co' complété à nv·4, multiple de 16) */
  function loadModel(json) {
    if (typeof json === 'string') json = JSON.parse(json);
    if (!json || json.format !== 'episcope-meshnet/1') throw new Error('format de modèle MeshNet inconnu');
    const raw = b64(json.weights.base64), all = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength >> 2);
    if (all.length !== json.weights.count) throw new Error('poids du modèle tronqués (' + all.length + ' / ' + json.weights.count + ')');
    const tr = json.settings.transpose !== false;
    let off = 0; const layers = [];
    json.layers.forEach((L, li) => {
      const k = L.kernel, n = k * k * k * L.inC * L.outC, K = all.subarray(off, off + n); off += n;
      let bias = null; if (L.bias) { bias = all.subarray(off, off + L.outC); off += L.outC; }
      const head = li === json.layers.length - 1;
      if (head !== (k === 1)) throw new Error('topologie MeshNet inattendue (couche ' + L.name + ')');
      const out = { name: L.name, inC: L.inC, outC: L.outC, kernel: k, dil: L.dilation || 1, act: ACT[L.activation || 'linear'], gn: !!L.gn, bias: !!L.bias };
      if (out.act === undefined) throw new Error('activation non prise en charge : ' + L.activation);
      if (k === 3) {
        const W = new Float32Array(27 * L.inC * L.outC), B = new Float32Array(L.outC);
        for (let dz = 0; dz < 3; dz++) for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) {
          // transposition brainchop : (kd,kh,kw) = (dx,dy,dz) ; sans transposition (kd,kh,kw) = (dz,dy,dx)
          const src = tr ? (dx * 3 + dy) * 3 + dz : (dz * 3 + dy) * 3 + dx, dst = (dz * 3 + dy) * 3 + dx;
          W.set(K.subarray(src * L.inC * L.outC, (src + 1) * L.inC * L.outC), dst * L.inC * L.outC);
        }
        if (bias) B.set(bias);
        Object.assign(out, { W, B });
      } else {
        const nv = Math.ceil(L.outC / 16) * 4, cp = nv * 4, W = new Float32Array(L.inC * cp), B = new Float32Array(cp);
        for (let ci = 0; ci < L.inC; ci++) for (let co = 0; co < L.outC; co++) W[ci * cp + co] = K[ci * L.outC + co];
        if (bias) B.set(bias);
        Object.assign(out, { nv, W, B });
      }
      layers.push(out);
    });
    if (off !== all.length) throw new Error('nombre de poids incohérent');
    if (layers.length < 2 || layers.slice(0, -1).some((L, i) => i && L.inC !== layers[i - 1].outC) || layers[layers.length - 1].inC !== layers[layers.length - 2].outC) throw new Error('chaîne de couches incohérente');
    return { name: json.name, title: json.title || json.name, settings: Object.assign({ normalization: 'minmax', cropPadding: 0, autoThreshold: 0, transpose: true, preModel: null }, json.settings),
      layers, labels: json.labels || [], colors: json.colors || null, fsCodes: json.fsCodes || null, hemi: json.hemi || null, nClasses: layers[layers.length - 1].outC };
  }

  // ---------------------------------------------------------------- conform (niivue / FastSurfer)
  /** volume déjà conformé au sens de brainchop (main.js ensureConformed) : 256³, uint8, orientation LIA (sans échelle) */
  function isConformed(vol) {
    if (!vol || !vol.dims || vol.dims[0] !== 256 || vol.dims[1] !== 256 || vol.dims[2] !== 256 || !(vol.data instanceof Uint8Array) || vol.data.length !== 256 ** 3) return false;
    if ((vol.slope != null && vol.slope !== 1) || (vol.inter || 0) !== 0) return false;
    const A = vol.affine, dom = c => { const v = [A[c], A[4 + c], A[8 + c]], a = v.map(Math.abs), w = a.indexOf(Math.max(...a)); return [w, Math.sign(v[w])]; };
    const [x, y, z] = [dom(0), dom(1), dom(2)];
    return x[0] === 0 && x[1] < 0 && y[0] === 2 && y[1] < 0 && z[0] === 1 && z[1] > 0;   // i → G, j → I, k → A
  }

  /** min/max comme NVImage.calMinMax : bloc central (25 % des bords exclus), NaN ignorés */
  function centralMinMax(vol) {
    const [nx, ny, nz] = vol.dims, d = vol.data, b = [Math.floor(0.25 * nx), Math.floor(0.25 * ny), Math.floor(0.25 * nz)];
    let mn = Infinity, mx = -Infinity;
    for (let k = b[2]; k < nz - b[2]; k++) for (let j = b[1]; j < ny - b[1]; j++) { let o = b[0] + nx * (j + ny * k); for (let i = b[0]; i < nx - b[0]; i++, o++) { const v = d[o]; if (v !== v) continue; if (v < mn) mn = v; if (v > mx) mx = v; } }
    return [mn, mx];
  }

  /** échelle robuste (conform.py getscale, f_low = 0, f_high = 0,999) → [src_min, scale] ; mode niivue ou fastsurfer ;
   *  val(i) : intensité mise à l'échelle du voxel i (float32, comme le in_img de niivue) */
  function getScale(vol, val, mode) {
    const s = vol.slope == null ? 1 : vol.slope, b = vol.inter || 0, n = vol.data.length;
    let mn, mx;
    if (mode === 'fastsurfer') { mn = Infinity; mx = -Infinity; for (let i = 0; i < n; i++) { const v = val(i); if (v < mn) mn = v; if (v > mx) mx = v; } }
    else { const r = centralMinMax(vol); mn = r[0] * s + b; mx = r[1] * s + b; if (s < 0) [mn, mx] = [mx, mn]; }
    if (vol.data instanceof Uint8Array) return [mode === 'fastsurfer' ? 0 : mn, 1];   // uint8 : pas de remise à l'échelle
    const fHigh = 0.999, H = 1000, bin = (mx - mn) / H, hist = new Float64Array(H);
    let nzv = 0;
    for (let i = 0; i < n; i++) {
      const v = val(i); if (Math.abs(v) >= 1e-15) nzv++;
      let k = Math.floor((v - mn) / bin); if (k > H - 1) k = H - 1; if (k >= 0) hist[k]++;   // niivue : valeurs < min ignorées
    }
    for (let i = 1; i < H; i++) hist[i] += hist[i - 1];
    const nth = n - Math.floor((1 - fHigh) * nzv); let idx = 0;
    while (idx < H - 1) { if (hist[idx + 1] >= nth) break; idx++; }
    const srcMax = idx * bin + mn;
    return [mn, mn !== srcMax ? 255 / (srcMax - mn) : 1];
  }

  /** conform FreeSurfer (FastSurfer conform.py, port niivue) : 256³ voxels de 1 mm, LIA, centré sur le centre du
   *  volume d'entrée (affine·dims/2), interpolation trilinéaire, intensités robustes → uint8.
   *  mode 'niivue' (défaut, = brainchop) : min/max du bloc central, troncature ; 'fastsurfer' : min/max global, mise à
   *  l'échelle seulement si le maximum dépasse 255, arrondi (np.rint). Un volume déjà conformé est recopié tel quel.
   *  Mémoire : aucune copie de l'entrée (intensités mises à l'échelle à la lecture) ; 2 tampons 256³ (Float32 + uint8). */
  function conform(vol, opts) {
    opts = opts || {}; const mode = opts.mode || 'niivue', Mat4 = SV.Mat4;
    if (!opts.force && isConformed(vol)) return { dims: [256, 256, 256], pixdim: [1, 1, 1], data: new Uint8Array(vol.data), slope: 1, inter: 0, affine: Mat4.from(vol.affine), datatype: 2, descrip: 'conform (inchangé)' };
    const [nx, ny, nz] = vol.dims, A = vol.affine, c = Mat4.apply(A, nx / 2, ny / 2, nz / 2);
    const O = Mat4.from([-1, 0, 0, c[0] + 128, 0, 0, 1, c[1] - 128, 0, -1, 0, c[2] + 128, 0, 0, 0, 1]);
    const V = Mat4.mul(Mat4.inv(A), O);   // voxel conformé → voxel d'entrée
    const s = vol.slope == null ? 1 : vol.slope, b = vol.inter || 0, src = vol.data, fr = Math.fround;
    const val = s === 1 && b === 0 ? (src instanceof Float64Array ? i => fr(src[i]) : i => src[i]) : i => fr(src[i] * s + b);
    const [smin, scale] = getScale(vol, val, mode);
    const out = new Float32Array(256 ** 3), sxy = nx * ny, snap = v => { const r = Math.round(v); return Math.abs(v - r) < 1e-6 ? r : v; };
    let o = 0, mxOut = -Infinity;
    for (let z = 0; z < 256; z++) for (let y = 0; y < 256; y++) {
      const bx = V[1] * y + V[2] * z + V[3], by = V[5] * y + V[6] * z + V[7], bz = V[9] * y + V[10] * z + V[11];
      for (let x = 0; x < 256; x++, o++) {
        const ix = snap(V[0] * x + bx), iy = snap(V[4] * x + by), iz = snap(V[8] * x + bz);
        const fx = Math.floor(ix), fy = Math.floor(iy), fz = Math.floor(iz);
        if (fx < 0 || fy < 0 || fz < 0 || Math.ceil(ix) >= nx || Math.ceil(iy) >= ny || Math.ceil(iz) >= nz) continue;
        const rx = ix - fx, ry = iy - fy, rz = iz - fz, f = fx + nx * (fy + ny * fz);
        const dx = fx + 1 < nx ? 1 : 0, dy = fy + 1 < ny ? nx : 0, dz = fz + 1 < nz ? sxy : 0;
        const v = ((val(f) * (1 - rx) + val(f + dx) * rx) * (1 - ry) + (val(f + dy) * (1 - rx) + val(f + dy + dx) * rx) * ry) * (1 - rz) +
          ((val(f + dz) * (1 - rx) + val(f + dz + dx) * rx) * (1 - ry) + (val(f + dz + dy) * (1 - rx) + val(f + dz + dy + dx) * rx) * ry) * rz;
        out[o] = v; if (v > mxOut) mxOut = v;
      }
    }
    const data = new Uint8Array(256 ** 3), fs = mode === 'fastsurfer', doScale = !fs || (!(src instanceof Uint8Array) && mxOut > 255);
    for (let i = 0; i < data.length; i++) {
      let v = out[i]; if (v !== v) continue;
      if (doScale) v = scale * (v - smin);
      v = v < 0 ? 0 : v > 255 ? 255 : v;
      data[i] = fs ? Math.round(v) - (Math.abs(v % 1) === 0.5 && Math.round(v) % 2 ? 1 : 0) : v;   // rint (pair) ou troncature (niivue)
    }
    return { dims: [256, 256, 256], pixdim: [1, 1, 1], data, slope: 1, inter: 0, affine: O, datatype: 2, descrip: 'conform ' + mode };
  }

  // ---------------------------------------------------------------- noyaux JavaScript (repli ; mêmes conventions que meshnet_wasm.c)
  /** conv 3×3×3 dilatée sur nz plans de sortie ; inp : plans locaux [p][y][x][inC] ; pz[z*3+t] plan local ou −1 ;
   *  W [27][inC][outC], B [outC] ; sortie out [z][y][x][outC] activée, ou étiquettes lab si tête (H) fournie */
  function convJS(inp, pz, nz, bx, by, inC, dil, W, B, out, outC, a, H, lab) {
    const plane = bx * by, cp = outC, acc = new Float32Array(cp), h = new Float32Array(outC), ts = inC * cp;
    for (let z = 0; z < nz; z++) {
      const P = [pz[3 * z], pz[3 * z + 1], pz[3 * z + 2]];
      for (let y = 0; y < by; y++) for (let x = 0; x < bx; x++) {
        for (let o = 0; o < outC; o++) acc[o] = B[o];
        for (let dz = 0; dz < 3; dz++) {
          const p = P[dz]; if (p < 0) continue;
          for (let dy = 0; dy < 3; dy++) {
            const yy = y + (dy - 1) * dil; if (yy < 0 || yy >= by) continue;
            const rb = p * plane + yy * bx;
            for (let dx = 0; dx < 3; dx++) {
              const xx = x + (dx - 1) * dil; if (xx < 0 || xx >= bx) continue;
              const s = (rb + xx) * inC; let w = ((dz * 3 + dy) * 3 + dx) * ts;
              for (let c = 0; c < inC; c++, w += cp) { const v = inp[s + c]; if (v === 0) continue; for (let o = 0; o < outC; o++) acc[o] += v * W[w + o]; }
            }
          }
        }
        const vo = z * plane + y * bx + x;
        if (lab) { for (let o = 0; o < outC; o++) h[o] = act(acc[o], a); lab[vo] = headVox(h, 0, outC, H.W, H.B, H.outC, H.nv * 4); }
        else { const d = vo * outC; for (let o = 0; o < outC; o++) out[d + o] = act(acc[o], a); }
      }
    }
  }
  function headVox(h, ho, inC, W2, B2, outC2, cp2) {
    let best = -Infinity, bi = 0;
    for (let o = 0; o < outC2; o++) { let s = B2[o]; for (let c = 0; c < inC; c++) s = Math.fround(s + Math.fround(h[ho + c] * W2[c * cp2 + o])); if (s > best) { best = s; bi = o; } }
    return bi;
  }
  function transformJS(buf, n, C, m, s, a) { for (let i = 0, o = 0; i < n; i++) for (let c = 0; c < C; c++, o++) buf[o] = act((buf[o] - m[c]) * s[c], a); }
  function statsJS(buf, n, C) { const sum = new Float64Array(C), sq = new Float64Array(C); for (let i = 0, o = 0; i < n; i++) for (let c = 0; c < C; c++, o++) { const v = buf[o]; sum[c] += v; sq[c] += v * v; } return { sum, sq }; }

  // ---------------------------------------------------------------- noyau WebAssembly SIMD (tools/meshnet_wasm.c)
  let wasmP = null;
  function wasmGet() {
    if (wasmP) return wasmP;
    wasmP = (async () => {
      try {
        if (typeof WebAssembly === 'undefined') return null;
        const memory = new WebAssembly.Memory({ initial: 64, maximum: 32768 });
        const { instance } = await WebAssembly.instantiate(b64(WASM_B64), { env: { memory } });
        const W = { memory, ex: instance.exports, base: (instance.exports.__heap_base.value + 15) & ~15 };
        if (!selfTest(W)) return null;   // garde-fou : un résultat faux désactive WebAssembly
        warmUp(W); await new Promise(r => setTimeout(r, 30));   // laisse finir la recompilation optimisée
        return W;
      } catch (e) { return null; }
    })();
    return wasmP;
  }
  function wasmRun(Wm, t) {
    const plane = t.bx * t.by, nOut = t.nz * plane, ex = Wm.ex, H = t.head;
    let off = Wm.base; const al = nb => { const o = off; off += (nb + 15) & ~15; return o; };
    const pIn = al(t.input.length * 4), pPz = al(t.pz ? t.pz.length * 4 : 0), pW = al(t.W ? t.W.length * 4 : 0), pB = al(t.B ? t.B.length * 4 : 0);
    const pW2 = al(H ? H.W.length * 4 : 0), pB2 = al(H ? H.B.length * 4 : 0), pM = al(t.inC * 4), pS = al(t.inC * 4), pTmp = al(2048);
    const pOut = al(H ? nOut : nOut * t.outC * 4), pSum = al(t.outC * 8), pSq = al(t.outC * 8), np = t.input.length / (plane * t.inC);
    const pT = t.kind === 'conv' ? al(np * t.by * t.inC * (((t.bx + 3) & ~3) + 2 * t.dil) * 4) : 0, pW4 = t.kind === 'conv' ? al(t.W.length * 16) : 0;
    const need = off - Wm.memory.buffer.byteLength; if (need > 0) Wm.memory.grow(Math.ceil(need / 65536));
    const buf = Wm.memory.buffer, F = (p, n) => new Float32Array(buf, p, n);
    F(pIn, t.input.length).set(t.input);
    if (t.pz) new Int32Array(buf, pPz, t.pz.length).set(t.pz);
    if (t.W) { F(pW, t.W.length).set(t.W); F(pB, t.B.length).set(t.B); }
    if (H) { F(pW2, H.W.length).set(H.W); F(pB2, H.B.length).set(H.B); }
    if (t.pre) { F(pM, t.inC).set(t.pre.m); F(pS, t.inC).set(t.pre.s); ex.transform(pIn, t.input.length / t.inC, t.inC, pM, pS, t.pre.act); }
    if (t.kind === 'head') ex.head(pIn, nOut, t.inC, pW2, pB2, H.outC, H.nv, pOut, pTmp);
    else if (ex.conv(pIn, np, pPz, t.nz, t.bx, t.by, t.inC, t.dil, pW, pB, H ? 0 : pOut, t.outC, t.act, H ? pW2 : 0, H ? pB2 : 0, H ? H.outC : 0, H ? H.nv : 0, H ? pOut : 0, pT, pW4, pTmp) !== 0) throw new Error('noyau WebAssembly : ' + t.outC + ' canaux non pris en charge');
    const r = {};
    if (H) r.labels = new Uint8Array(buf, pOut, nOut).slice();
    else { r.out = F(pOut, nOut * t.outC).slice(); if (t.stats) { ex.stats(pOut, nOut, t.outC, pSum, pSq); r.sum = new Float64Array(buf, pSum, t.outC).slice(); r.sq = new Float64Array(buf, pSq, t.outC).slice(); } }
    return r;
  }
  function jsRun(t) {
    const plane = t.bx * t.by, nOut = t.nz * plane, H = t.head, r = {};
    if (t.pre) transformJS(t.input, t.input.length / t.inC, t.inC, t.pre.m, t.pre.s, t.pre.act);
    if (t.kind === 'head') { r.labels = new Uint8Array(nOut); for (let i = 0; i < nOut; i++) r.labels[i] = headVox(t.input, i * t.inC, t.inC, H.W, H.B, H.outC, H.nv * 4); return r; }
    if (H) { r.labels = new Uint8Array(nOut); convJS(t.input, t.pz, t.nz, t.bx, t.by, t.inC, t.dil, t.W, t.B, null, t.outC, t.act, H, r.labels); return r; }
    r.out = new Float32Array(nOut * t.outC); convJS(t.input, t.pz, t.nz, t.bx, t.by, t.inC, t.dil, t.W, t.B, r.out, t.outC, t.act, null, null);
    if (t.stats) Object.assign(r, statsJS(r.out, nOut, t.outC));
    return r;
  }
  /** petit problème aléatoire calculé par les deux noyaux (conv + tête + gelu) ; vrai si accord < 1e-4 */
  function selfTest(Wm) {
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
    const bx = 7, by = 6, nz = 3, inC = 3, outC = 6, W = new Float32Array(27 * inC * outC).map(() => rnd()), B = new Float32Array(outC).map(() => rnd());
    const input = new Float32Array(5 * bx * by * inC).map(() => { const r = rnd(); return Math.abs(r) < 0.1 ? 0 : r * 6; }), pz = new Int32Array([-1, 0, 2, 0, 1, 3, 1, 2, 4]);
    const H = { W: new Float32Array(outC * 16).map(() => rnd()), B: new Float32Array(16).map(() => rnd()), outC: 11, nv: 4 };
    const base = { kind: 'conv', bx, by, nz, inC, outC, dil: 2, act: 3, W, B, pz };
    const a = wasmRun(Wm, Object.assign({}, base, { input })), b = jsRun(Object.assign({}, base, { input: input.slice() }));
    let e = 0; for (let i = 0; i < a.out.length; i++) e = Math.max(e, Math.abs(a.out[i] - b.out[i]));
    const la = wasmRun(Wm, Object.assign({}, base, { input, head: H })).labels, lb = jsRun(Object.assign({}, base, { input: input.slice(), head: H })).labels;
    let d = 0; for (let i = 0; i < la.length; i++) d += la[i] !== lb[i];
    return e < 1e-4 && d <= 1;
  }

  /** V8 compile d'abord le module en code de base (Liftoff, ~5× plus lent) puis recompile en tâche de fond les fonctions
   *  « chaudes » ; quelques petits appels de chaque variante (blocs K = 1..8, tête, transformation) déclenchent ce passage
   *  avant le vrai calcul (une fonction ne change pas de niveau pendant un long appel) */
  function warmUp(Wm) {
    const bx = 6, by = 6, inC = 4, pz = new Int32Array([-1, 0, 1]), input = new Float32Array(2 * bx * by * inC).fill(0.5);
    for (let outC = 1; outC <= 8; outC++) {
      const W = new Float32Array(27 * inC * outC).fill(0.01), B = new Float32Array(outC);
      for (let r = 0; r < 24; r++) wasmRun(Wm, { kind: 'conv', bx, by, nz: 1, inC, outC, dil: 1, act: r % 4, W, B, input, pz, pre: r % 2 ? { m: new Float32Array(inC), s: new Float32Array(inC).fill(1), act: 3 } : null });
    }
    const H = { W: new Float32Array(inC * 16).fill(0.1), B: new Float32Array(16), outC: 16, nv: 4 };
    for (let r = 0; r < 24; r++) wasmRun(Wm, { kind: 'head', bx, by, nz: 1, inC, outC: 16, input, head: H });
  }

  /** tâche de calcul (exécutée dans un worker ou dans le fil courant) :
   *  { kind:'conv'|'head', bx, by, nz, inC, outC, dil, act, W, B, input, pz, pre:{m,s,act}|null, head:{W,B,outC,nv}|null, stats, wasm }
   *  → { out: Float32Array nz·bx·by·outC | labels: Uint8Array nz·bx·by, sum, sq (si stats), ms, engine } */
  async function task(t) {
    const t0 = now(), Wm = t.wasm === false ? null : await wasmGet();
    const ok = Wm && (t.kind === 'head' || t.outC <= 64);
    const r = ok ? wasmRun(Wm, t) : jsRun(t);
    r.ms = now() - t0; r.engine = ok ? 'wasm' : 'js';
    return r;
  }

  // ---------------------------------------------------------------- normalisation, masque, boîte
  /** table uint8 → valeur normalisée (float32 comme tf.js) : min-max ou quantiles 5 %–95 % (calculateQuantiles) ;
   *  → { L: Float32Array(256), max : valeur normalisée maximale présente } */
  function normLUT(img, kind) {
    const H = new Float64Array(256); for (let i = 0; i < img.length; i++) H[img[i]]++;
    let vmin = 0; while (vmin < 255 && !H[vmin]) vmin++; let vmax = 255; while (vmax > 0 && !H[vmax]) vmax--;
    let lo = vmin, hi = vmax;
    if (kind === 'quantile') {
      const n = img.length, q = [];
      for (const t of [Math.floor(n * 0.05), Math.ceil(n * 0.95) - 1]) { let c = 0, v = 0; for (; v < 256; v++) { c += H[v]; if (c > t) break; } q.push(v); }
      [lo, hi] = q;
    }
    if (!(hi > lo)) throw new Error('image uniforme : normalisation impossible');
    const L = new Float32Array(256); for (let v = 0; v < 256; v++) L[v] = (v - lo) / (hi - lo);
    return { L, max: L[vmax] };
  }
  /** boîte englobante des voxels ≠ 0 d'un masque 256³ + marge (cropAndGetCorner) → {min:[i,j,k], max:[i,j,k]} inclusifs */
  function cropBox(mask, pad) {
    const mn = [256, 256, 256], mx = [-1, -1, -1];
    for (let k = 0, o = 0; k < 256; k++) for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++, o++) if (mask[o]) {
      if (i < mn[0]) mn[0] = i; if (i > mx[0]) mx[0] = i; if (j < mn[1]) mn[1] = j; if (j > mx[1]) mx[1] = j; if (k < mn[2]) mn[2] = k; if (k > mx[2]) mx[2] = k;
    }
    if (mx[0] < 0) throw new Error('masque de recadrage vide');
    return { min: mn.map(v => Math.max(0, v - pad)), max: mx.map(v => Math.min(255, v + pad)) };
  }

  // ---------------------------------------------------------------- exécution d'un réseau sur une boîte
  function makeExec(opts) {
    const wasm = opts.wasm !== false;
    if (opts.pool) return { size: opts.pool.size, wasm, run: t => opts.pool.call('MeshNet._task', [t], [t.input.buffer].concat(t.pz ? [t.pz.buffer] : [])), close() {} };
    if (SV.Work && SV.Work.available && opts.workers !== 0) {
      // calcul pur, fil principal presque inactif : un worker par cœur logique (≤ 8) plutôt que cœurs − 1 (défaut de work.js)
      const n = opts.workers || Math.max(1, Math.min(8, (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 2));
      const pool = SV.Work.pool(['meshnet'], n);
      return { size: pool.size, wasm, run: t => pool.call('MeshNet._task', [t], [t.input.buffer].concat(t.pz ? [t.pz.buffer] : [])), close: () => pool.close() };
    }
    // fil courant : rend la main à la boucle d'événements toutes les ~100 ms (affichage de la progression, minuteries)
    let last = now();
    return { size: 1, wasm, local: true, close() {}, run: async t => { if (now() - last > 100) { await new Promise(r => setTimeout(r, 0)); last = now(); } return task(t); } };
  }

  /** réseau complet sur la boîte {bx,by,bz} ; input(z) → plan normalisé (Float32Array bx·by) ; → étiquettes de la boîte */
  async function runNet(model, box, input, exec, prog, timings, tag) {
    const { bx, by, bz } = box, plane = bx * by, layers = model.layers, head = layers[layers.length - 1];
    const H = { W: head.W, B: head.B, outC: head.outC, nv: head.nv }, labels = new Uint8Array(plane * bz);
    const work = layers.reduce((s, L) => s + L.inC * L.outC * L.kernel ** 3, 0) * plane * bz; let done = 0;
    let cur = new Array(bz); for (let z = 0; z < bz; z++) cur[z] = input(z);
    let pre = null;
    for (let li = 0; li < layers.length - 1; li++) {
      const L = layers[li], fuse = li === layers.length - 2 && !L.gn, d = L.dil, t0 = now();
      const t = Math.max(1, Math.min(Math.floor(8e6 / (plane * L.outC * 4)), Math.ceil(bz / (4 * exec.size)))), jobs = [];
      const ref = new Int32Array(bz);
      for (let z0 = 0; z0 < bz; z0 += t) {
        const z1 = Math.min(bz, z0 + t), set = new Set();
        for (let z = z0; z < z1; z++) for (const q of [z - d, z, z + d]) if (q >= 0 && q < bz) set.add(q);
        const need = Array.from(set).sort((a, b) => a - b); need.forEach(q => ref[q]++); jobs.push({ z0, z1, need });
      }
      const next = new Array(bz), sum = new Float64Array(L.outC), sq = new Float64Array(L.outC); let eng = '';
      await pump(jobs, exec.local ? 1 : exec.size + 2, async j => {   // une tâche d'avance par worker suffit
        if (exec.signal && exec.signal.aborted) throw new Error('segmentation annulée');
        const nz = j.z1 - j.z0, loc = new Map(), input = new Float32Array(j.need.length * plane * L.inC);
        j.need.forEach((q, n) => { loc.set(q, n); input.set(cur[q], n * plane * L.inC); if (--ref[q] === 0) cur[q] = null; });   // libère les plans consommés
        const pz = new Int32Array(nz * 3);
        for (let z = j.z0; z < j.z1; z++) for (let k = 0; k < 3; k++) { const q = z + (k - 1) * d; pz[(z - j.z0) * 3 + k] = q >= 0 && q < bz ? loc.get(q) : -1; }
        const r = await exec.run({ kind: 'conv', bx, by, nz, inC: L.inC, outC: L.outC, dil: d, act: L.gn ? 0 : L.act, W: L.W, B: L.B, input, pz, pre, head: fuse ? H : null, stats: L.gn, wasm: exec.wasm });
        eng = r.engine;
        if (fuse) labels.set(r.labels, j.z0 * plane);
        else for (let z = j.z0; z < j.z1; z++) next[z] = r.out.subarray((z - j.z0) * plane * L.outC, (z - j.z0 + 1) * plane * L.outC);
        if (L.gn) for (let c = 0; c < L.outC; c++) { sum[c] += r.sum[c]; sq[c] += r.sq[c]; }
        done += nz * plane * (L.inC * L.outC * 27 + (fuse ? head.inC * head.outC : 0));
        prog(done / work, tag + ' : couche ' + (li + 1) + '/' + (layers.length - 1));
      });
      cur = next;
      if (L.gn) {   // normalisation d'instance (moments sur toute la boîte, epsilon 1e-5) appliquée à l'entrée de la tâche suivante
        const N = plane * bz, m = new Float32Array(L.outC), s = new Float32Array(L.outC);
        for (let c = 0; c < L.outC; c++) { const mu = sum[c] / N, v = Math.max(0, sq[c] / N - mu * mu); m[c] = mu; s[c] = 1 / Math.sqrt(v + 1e-5); }
        pre = { m, s, act: L.act };
      } else pre = null;
      timings.push({ model: tag, layer: L.name, inC: L.inC, outC: L.outC, dil: d, fusedHead: fuse, ms: Math.round(now() - t0), engine: eng });
      if (fuse) return labels;
    }
    // tête 1×1×1 seule (dernière couche normalisée) : tranches sans halo
    const t0 = now(), C = head.inC, t = Math.max(1, Math.min(Math.floor(8e6 / (plane * C * 4)), Math.ceil(bz / (4 * exec.size)))), jobs = [];
    for (let z0 = 0; z0 < bz; z0 += t) jobs.push({ z0, z1: Math.min(bz, z0 + t) });
    await pump(jobs, exec.local ? 1 : exec.size + 2, async j => {   // une tâche d'avance par worker suffit
      if (exec.signal && exec.signal.aborted) throw new Error('segmentation annulée');
      const input = new Float32Array((j.z1 - j.z0) * plane * C);
      for (let z = j.z0; z < j.z1; z++) { input.set(cur[z], (z - j.z0) * plane * C); cur[z] = null; }
      const r = await exec.run({ kind: 'head', bx, by, nz: j.z1 - j.z0, inC: C, outC: head.outC, input, pre, head: H, wasm: exec.wasm });
      labels.set(r.labels, j.z0 * plane);
      done += (j.z1 - j.z0) * plane * C * head.outC; prog(done / work, tag + ' : tête');
    });
    timings.push({ model: tag, layer: head.name, inC: C, outC: head.outC, dil: 1, fusedHead: false, ms: Math.round(now() - t0) });
    return labels;
  }
  /** exécute fn sur chaque élément, au plus k à la fois, dans l'ordre de soumission */
  async function pump(items, k, fn) {
    let i = 0, err = null;
    const lane = async () => { while (i < items.length && !err) { const it = items[i++]; try { await fn(it); } catch (e) { err = err || e; } } };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(k, items.length)) }, lane));
    if (err) throw err;
  }

  /** modèle sur le volume conformé : normalisation, masque, boîte (+ marge), réseau, retour en 256³ ;
   *  full : volume entier sans recadrage (prémodèle) ; mask : masque 256³ (≠ 0) donnant la boîte, sinon seuil */
  async function runModel(img, model, mask, full, exec, prog, timings, extraPad) {
    const st = model.settings, { L, max } = normLUT(img, st.normalization === 'quantile' ? 'quantile' : 'minmax');
    let box, src = mask ? null : 'volume entier';
    if (full) box = { min: [0, 0, 0], max: [255, 255, 255] };
    else {
      if (!mask) {   // applyMriThreshold (x > max·seuil, float32) ou x > 0
        const thr = st.autoThreshold, th = thr > 0 && thr <= 1 ? Math.fround(max * Math.fround(thr)) : 0, T = new Uint8Array(256);
        for (let v = 0; v < 256; v++) T[v] = L[v] > th ? 1 : 0;
        mask = new Uint8Array(img.length); for (let i = 0; i < img.length; i++) mask[i] = T[img[i]];
        src = thr > 0 && thr <= 1 ? 'seuil ' + thr + ' × max' : 'intensité > min';
      }
      box = cropBox(mask, (st.cropPadding || 0) + (extraPad || 0));
    }
    const bx = box.max[0] - box.min[0] + 1, by = box.max[1] - box.min[1] + 1, bz = box.max[2] - box.min[2] + 1, [i0, j0, k0] = box.min;
    const input = z => { const p = new Float32Array(bx * by); for (let y = 0, o = 0; y < by; y++) { const r = i0 + 256 * (j0 + y + 256 * (k0 + z)); for (let x = 0; x < bx; x++, o++) p[o] = L[img[r + x]]; } return p; };
    const lab = await runNet(model, { bx, by, bz }, input, exec, prog, timings, model.name);
    const out = new Uint8Array(256 ** 3);
    for (let z = 0; z < bz; z++) for (let y = 0; y < by; y++) out.set(lab.subarray((z * by + y) * bx, (z * by + y + 1) * bx), i0 + 256 * (j0 + y + 256 * (k0 + z)));
    return { labels: out, box, maskSource: src };
  }

  /** part du tissu vu par le prémodèle (SB ∪ SG) restée sans étiquette : contrôle qualité de la segmentation */
  function coverage(mask, labels) { let t = 0, miss = 0, g = 0, gm = 0; for (let o = 0; o < mask.length; o++) { const m = mask[o]; if (!m) continue; t++; const u = !labels[o]; miss += u; if (m === 2) { g++; gm += u; } } return { tissue: t, unlabeled: t ? +(miss / t).toFixed(4) : 0, grayUnlabeled: g ? +(gm / g).toFixed(4) : 0 }; }
  /** segmentation complète (voir en-tête) ; conf : volume conformé (sinon conformé ici) ; model : loadModel(...) ;
   *  opts.premodel : modèle de masque (model5_gw_ae pour l'atlas 104 ; null = recadrage par seuil comme brainchop
   *  sans prémodèle) ; opts.mask : masque 256³ fourni (prioritaire) ; opts.pool | opts.workers ; opts.wasm (défaut vrai) ;
   *  opts.postprocess : true/'brainchop' (défaut) | 'perLabel' (plus grande composante de chaque étiquette) | false */
  async function segment(conf, model, opts) {
    opts = opts || {}; const T0 = now(), timings = [];
    if (!isConformed(conf)) conf = conform(conf);
    const cb = opts.onProgress || (() => {}), prog = (f, msg) => cb(Math.min(1, f), msg);
    const exec = makeExec(opts); exec.signal = opts.signal;
    try {
      let mask = opts.mask || null, src = mask ? 'masque fourni' : null, w0 = 0, img = conf.data, harm = null, mask0 = null;
      const pre = opts.premodel || null, ho = opts.harmonize ? Object.assign({ smooth: 'auto', retry: 0.05 }, typeof opts.harmonize === 'object' ? opts.harmonize : {}) : null;
      const harmo = (data, m, o) => !exec.local && SV.Work && SV.Work.available && typeof SV.Work.run === 'function' ? SV.Work.run(['meshnet'], 'MeshNet.harmonize', [data, m, o]) : Promise.resolve(harmonize(data, m, o));
      const pp = opts.postprocess === undefined ? true : opts.postprocess;
      const post = lab => { if (!pp) return lab; const t0 = now(), out = largestComponent(lab, [256, 256, 256], pp === 'perLabel'); timings.push({ model: model.name, layer: 'postprocess', ms: Math.round(now() - t0) }); return out; };
      if (opts.cascade && pre && !mask) return await cascadeRun();
      if (!mask && pre) {   // prémodèle sur le volume entier (inferenceFullVolumePhase1) : boîte = sortie ≠ 0
        w0 = ho ? 0.1 : 0.2; const r = await runModel(img, pre, null, true, exec, (f, m) => prog(w0 * f, m), timings);
        mask = mask0 = r.labels; src = 'prémodèle ' + pre.name;
        if (ho) {   // biais de champ + intensités standardisées (sans lissage), puis prémodèle à nouveau sur l'image corrigée
          const t0 = now(); cb(w0, 'correction du biais de champ, intensités standardisées');
          const h = await harmo(img, mask, Object.assign({}, ho, { smooth: ho.smooth > 0 ? ho.smooth : 0 })); harm = h.stats; timings.push({ model: 'harmonize', layer: 'biais + standardisation', ms: Math.round(now() - t0) });
          if (!harm.skipped) { img = h.data; const w1 = w0; w0 = 0.2; const r2 = await runModel(img, pre, null, true, exec, (f, m) => prog(w1 + (w0 - w1) * f, m), timings); mask = r2.labels; src += ' (image corrigée)'; }
        }
      } else if (!mask && model.settings.preModel) cb(0, 'sans prémodèle : recadrage par seuil (brainchop sans prémodèle)');
      const auto = !!(ho && harm && !harm.skipped && ho.smooth === 'auto'), wEnd = auto ? 0.6 : 1;
      const r = await runModel(img, model, mask, false, exec, (f, m) => prog(w0 + (wEnd - w0) * f, m), timings, opts.pad || 0);
      let labels = post(r.labels), box = r.box, cov = pre && mask ? coverage(mask, labels) : null;
      // tissu resté sans étiquette au-delà du seuil : second passage sur l'image légèrement lissée (texture fine d'une
      // acquisition < 1 mm rééchantillonnée) ; gardé seulement s'il étiquette davantage de tissu (même masque de référence)
      if (auto && cov && cov.unlabeled > ho.retry) {
        cb(wEnd, `segmentation incomplète (${(100 * cov.unlabeled).toFixed(1)} % du tissu sans étiquette) : second passage sur l'image lissée`);
        const t0 = now(), sm = 0.6, h2 = await harmo(conf.data, mask0, Object.assign({}, ho, { smooth: sm })); timings.push({ model: 'harmonize', layer: 'lissage ' + sm + ' mm', ms: Math.round(now() - t0) });
        const r3 = await runModel(h2.data, model, mask, false, exec, (f, m) => prog(wEnd + (1 - wEnd) * f, m + ' (image lissée)'), timings, opts.pad || 0);
        const lab2 = post(r3.labels), cov2 = coverage(mask, lab2), keep = cov2.unlabeled < cov.unlabeled - 0.005;
        harm.retry = { threshold: ho.retry, smooth: sm, unlabeled: [cov.unlabeled, cov2.unlabeled], kept: keep ? 'lissée' : 'première' };
        if (keep) { labels = lab2; box = r3.box; cov = cov2; img = h2.data; harm.smooth = sm; }
      }
      prog(1, 'segmentation terminée');
      return { labels, dims: [256, 256, 256], affine: Float64Array.from(conf.affine), labelNames: model.labels, fsCodes: model.fsCodes, hemi: model.hemi,
        cropBox: box, maskSource: src || r.maskSource, ms: Math.round(now() - T0), timings, workers: exec.local ? 0 : exec.size, harmonize: harm,
        coverage: cov, image: opts.keepImage ? img : undefined };

      /** cascade (EpiScope v4.8) : on ne corrige que si le contrôle de qualité l'exige.
       *   A. brainchop tel quel (prémodèle + modèle) — gardé s'il est bon ;
       *   B. biais de champ corrigé, intensités standardisées (prémodèle à nouveau sur l'image corrigée) — gardé s'il est bon ;
       *   C. image de B légèrement lissée, étiquettes limitées à l'enveloppe de B (jamais le cou ni le scalp) ;
       *   sinon la meilleure des trois (score). Qualité : opts.cascade.quality(labels) → {rms, scales, volume, extent}
       *   (SV.Anat.segQuality) + part du tissu du prémodèle sans étiquette. */
      async function cascadeRun() {
        const C = opts.cascade, L = Object.assign({ unlabeled: 0.05, rms: 6.5, extent: 158, vmin: 8.5e5, vmax: 1.6e6, smin: 0.8, smax: 1.3 }, C.limits || {}), tried = [];
        const judge = (lab, cov) => {
          const q = Object.assign({}, C.quality ? C.quality(lab) : {}), why = [];
          q.unlabeled = cov.unlabeled; q.grayUnlabeled = cov.grayUnlabeled;
          if (q.unlabeled > L.unlabeled) why.push(`${(100 * q.unlabeled).toFixed(1)} % du tissu sans étiquette`);
          if (q.rms != null && q.rms > L.rms) why.push(`recalage sur le gabarit ${q.rms.toFixed(1)} mm`);
          if (q.scales && q.scales.some(x => x < L.smin || x > L.smax)) why.push('proportions anormales (' + q.scales.map(x => x.toFixed(2)).join(' / ') + ')');
          if (q.extent != null && q.extent > L.extent) why.push(`étendue ${q.extent} mm (cou ou scalp ?)`);
          if (q.volume != null && (q.volume < L.vmin || q.volume > L.vmax)) why.push(`volume étiqueté ${(q.volume / 1000).toFixed(0)} cm³`);
          q.ok = !why.length; q.why = why;
          q.score = (q.rms != null ? q.rms : 6) + 40 * q.unlabeled + (q.extent > L.extent ? (q.extent - L.extent) / 2 : 0) + (q.scales && q.scales.some(x => x < L.smin || x > L.smax) ? 10 : 0) + (q.volume < L.vmin || q.volume > L.vmax ? 5 : 0);
          return q;
        };
        const finish = (P, chosenWhy) => {
          prog(1, 'segmentation terminée');
          const casc = tried.map(t => ({ name: t.name, ok: t.q.ok, why: t.q.why, rms: t.q.rms, unlabeled: +t.q.unlabeled.toFixed(4), score: +t.q.score.toFixed(2), extent: t.q.extent, volume: t.q.volume, scales: t.q.scales, ms: t.ms }));
          return { labels: P.labels, dims: [256, 256, 256], affine: Float64Array.from(conf.affine), labelNames: model.labels, fsCodes: model.fsCodes, hemi: model.hemi,
            cropBox: P.box, maskSource: 'prémodèle ' + pre.name + (P.harm ? ' (image corrigée)' : ''), ms: Math.round(now() - T0), timings, workers: exec.local ? 0 : exec.size,
            harmonize: P.harm || null, coverage: { tissue: P.cov.tissue, unlabeled: P.cov.unlabeled, grayUnlabeled: P.cov.grayUnlabeled }, quality: P.q,
            cascade: { steps: casc, chosen: P.name, reason: chosenWhy }, image: opts.keepImage ? P.img : undefined };
        };
        // A. brainchop
        let t0 = now(); cb(0, 'segmentation (brainchop)');
        const m0 = (await runModel(conf.data, pre, null, true, exec, (f, m) => prog(0.12 * f, m), timings)).labels;
        const rA = await runModel(conf.data, model, m0, false, exec, (f, m) => prog(0.12 + 0.2 * f, m), timings, opts.pad || 0), labA = post(rA.labels);
        const A = { name: 'brainchop', labels: labA, box: rA.box, cov: coverage(m0, labA), img: conf.data, harm: null }; A.q = judge(labA, A.cov); A.ms = Math.round(now() - t0); tried.push(A);
        if (A.q.ok) return finish(A, 'contrôle de qualité satisfaisant');
        // B. intensités corrigées
        t0 = now(); cb(0.32, `contrôle de qualité : ${A.q.why.join(', ')} → correction du biais de champ, intensités standardisées`);
        const hB = await harmo(conf.data, m0, { smooth: 0, target: C.target }); timings.push({ model: 'harmonize', layer: 'biais + standardisation', ms: Math.round(now() - t0) });
        if (hB.stats.skipped) return finish(A, 'correction impossible : ' + hB.stats.skipped);
        const mB = (await runModel(hB.data, pre, null, true, exec, (f, m) => prog(0.34 + 0.1 * f, m + ' (image corrigée)'), timings)).labels;
        const rB = await runModel(hB.data, model, mB, false, exec, (f, m) => prog(0.44 + 0.2 * f, m + ' (image corrigée)'), timings, opts.pad || 0), labB = post(rB.labels);
        const B = { name: 'intensités corrigées', labels: labB, box: rB.box, cov: coverage(mB, labB), img: hB.data, harm: hB.stats }; B.q = judge(labB, B.cov); B.ms = Math.round(now() - t0); tried.push(B);
        if (B.q.ok) return finish(B, 'contrôle de qualité satisfaisant après correction');
        // C. lissage léger, borné à l'enveloppe de B
        t0 = now(); cb(0.64, `contrôle de qualité : ${B.q.why.join(', ')} → second passage sur l'image légèrement lissée`);
        const hC = await harmo(conf.data, m0, { smooth: 0.6, target: C.target });
        const rC = await runModel(hC.data, model, mB, false, exec, (f, m) => prog(0.66 + 0.32 * f, m + ' (image lissée)'), timings, opts.pad || 0);
        const env = envelope(labB, 7, 3), labC = post(rC.labels.map((v, o) => env[o] ? v : 0)), mBe = mB.map((v, o) => env[o] ? v : 0);
        const Cc = { name: 'image lissée', labels: labC, box: rC.box, cov: coverage(mBe, labC), img: hC.data, harm: Object.assign({}, hC.stats, { smooth: 0.6 }) }; Cc.q = judge(labC, Cc.cov); Cc.ms = Math.round(now() - t0);
        B.cov = coverage(mBe, labB); B.q = judge(labB, B.cov); tried.push(Cc);   // B et C comparés sur le même masque (cerveau de B)
        const best = tried.slice().sort((a, b) => (b.q.ok - a.q.ok) || (a.q.score - b.q.score))[0];
        return finish(best, best.q.ok ? 'contrôle de qualité satisfaisant' : 'meilleur score des trois passages');
      }
    } finally { if (!opts.pool) exec.close(); }
  }
  /** un passage du réseau, sans contrôle de qualité (méthodes choisies une à une, v4.19) : opts.image (uint8 256³ à segmenter,
   *  défaut conf.data : image corrigée, lissée…), opts.premodel (recadrage par le prémodèle sur cette image ; sinon opts.mask ou
   *  seuil du modèle), opts.envelope (masque 256³ : étiquettes hors masque supprimées, jamais le cou ni le scalp), opts.pool |
   *  opts.workers, opts.onProgress → { labels, coverage (tissu du prémodèle sans étiquette), premask, cropBox, ms, timings } */
  async function segmentPass(conf, model, opts) {
    opts = opts || {}; const T0 = now(), timings = [];
    if (!isConformed(conf)) conf = conform(conf);
    const cb = opts.onProgress || (() => {}), prog = (f, msg) => cb(Math.min(1, f), msg), exec = makeExec(opts); exec.signal = opts.signal;
    try {
      const img = opts.image || conf.data, pre = opts.premodel || null, w0 = pre ? 0.3 : 0;
      let m0 = null; if (pre) m0 = (await runModel(img, pre, null, true, exec, (f, m) => prog(w0 * f, m), timings)).labels;
      const r = await runModel(img, model, m0 || opts.mask || null, false, exec, (f, m) => prog(w0 + (1 - w0) * f, m), timings, opts.pad || 0);
      const env = opts.envelope || null; let lab = r.labels; if (env) for (let o = 0; o < lab.length; o++) if (!env[o]) lab[o] = 0;
      const pp = opts.postprocess === undefined ? true : opts.postprocess;
      if (pp) { const t0 = now(); lab = largestComponent(lab, [256, 256, 256], pp === 'perLabel'); timings.push({ model: model.name, layer: 'postprocess', ms: Math.round(now() - t0) }); }
      let cov = null; if (m0) { const mm = env ? m0.map((v, o) => env[o] ? v : 0) : m0; cov = coverage(mm, lab); }
      prog(1, 'passage terminé');
      return { labels: lab, dims: [256, 256, 256], affine: Float64Array.from(conf.affine), labelNames: model.labels, fsCodes: model.fsCodes, hemi: model.hemi,
        cropBox: r.box, coverage: cov, premask: opts.keepPremask ? m0 : undefined, ms: Math.round(now() - T0), timings, workers: exec.local ? 0 : exec.size };
    } finally { if (!opts.pool) exec.close(); }
  }
  /** lissage gaussien léger (σ en mm, grille conformée 1 mm) d'une image uint8 256³ */
  function smoothImage(img, sm) {
    const N = 256, S2 = N * N, r = Math.max(1, Math.ceil(3 * sm)), w = []; let ws = 0; for (let t = -r; t <= r; t++) { const x = Math.exp(-t * t / (2 * sm * sm)); w.push(x); ws += x; } for (let t = 0; t < w.length; t++) w[t] /= ws;
    let a = Float32Array.from(img), b = new Float32Array(img.length);
    for (const st of [1, N, S2]) {
      for (let o = 0; o < a.length; o++) { const x = st === 1 ? o % N : st === N ? ((o / N) | 0) % N : (o / S2) | 0; let acc = 0, wsum = 0; for (let t = -r; t <= r; t++) { const y = x + t; if (y < 0 || y >= N) continue; acc += a[o + t * st] * w[t + r]; wsum += w[t + r]; } b[o] = acc / wsum; }
      const t = a; a = b; b = t;
    }
    const out = new Uint8Array(img.length); for (let o = 0; o < out.length; o++) { const y = a[o]; out[o] = y > 255 ? 255 : y < 0 ? 0 : Math.round(y); } return out;
  }
  /** enveloppe d'une segmentation (grille 256³) : dilatation cubique de r1 voxels puis érosion de r2 (sommes glissantes) */
  function envelope(labels, r1, r2) {
    const N = 256, S2 = N * N; let a = new Uint8Array(labels.length); for (let o = 0; o < a.length; o++) a[o] = labels[o] ? 1 : 0;
    const pass = (src, st, r, ero) => {
      const out = new Uint8Array(src.length), row = new Int32Array(N + 1), w = 2 * r + 1;
      const lines = st === 1 ? (q, p) => q * S2 + p * N : st === N ? (q, p) => q * S2 + p : (q, p) => q * N + p;
      for (let q = 0; q < N; q++) for (let p = 0; p < N; p++) {
        const b = lines(q, p); row[0] = 0; for (let x = 0; x < N; x++) row[x + 1] = row[x] + src[b + x * st];
        for (let x = 0; x < N; x++) { const lo = Math.max(0, x - r), hi = Math.min(N - 1, x + r), c = row[hi + 1] - row[lo]; out[b + x * st] = ero ? (c === w ? 1 : 0) : (c > 0 ? 1 : 0); }
      }
      return out;
    };
    for (const st of [1, N, S2]) a = pass(a, st, r1, false);
    for (const st of [1, N, S2]) a = pass(a, st, r2, true);
    return a;
  }

  // ---------------------------------------------------------------- post-traitement, statistiques
  /** plus grande composante 26-connexe : du masque binaire (≠ 0) comme brainchop, ou de chaque étiquette (perLabel) */
  function largestComponent(labels, dims, perLabel) {
    const [nx, ny, nz] = dims, n = nx * ny * nz, comp = new Int32Array(n), queue = new Int32Array(n), sizes = [0], owner = [0];
    let nc = 0;
    for (let s = 0; s < n; s++) {
      if (!labels[s] || comp[s]) continue;
      const lv = labels[s]; nc++; comp[s] = nc; let qh = 0, qt = 0; queue[qt++] = s;
      while (qh < qt) {
        const v = queue[qh++], i = v % nx, j = ((v / nx) | 0) % ny, k = (v / (nx * ny)) | 0;
        for (let dk = -1; dk <= 1; dk++) { const kk = k + dk; if (kk < 0 || kk >= nz) continue;
          for (let dj = -1; dj <= 1; dj++) { const jj = j + dj; if (jj < 0 || jj >= ny) continue;
            for (let di = -1; di <= 1; di++) { const ii = i + di; if (ii < 0 || ii >= nx) continue;
              const u = ii + nx * (jj + ny * kk); if (comp[u] || !labels[u] || (perLabel && labels[u] !== lv)) continue; comp[u] = nc; queue[qt++] = u; } } }
      }
      sizes.push(qt); owner.push(perLabel ? lv : 1);
    }
    const best = new Map(); for (let c = 1; c <= nc; c++) { const o = owner[c], b = best.get(o); if (b === undefined || sizes[c] > sizes[b]) best.set(o, c); }
    const keep = new Uint8Array(nc + 1); for (const c of best.values()) keep[c] = 1;
    const out = new Uint8Array(n); for (let v = 0; v < n; v++) if (keep[comp[v]]) out[v] = labels[v];
    return out;
  }
  /** effectif et centroïde monde (mm) de chaque étiquette */
  function labelStats(labels, dims, affine, names) {
    const K = Math.max(names ? names.length : 0, 256), cnt = new Float64Array(K), sx = new Float64Array(K), sy = new Float64Array(K), sz = new Float64Array(K);
    for (let k = 0, o = 0; k < dims[2]; k++) for (let j = 0; j < dims[1]; j++) for (let i = 0; i < dims[0]; i++, o++) { const l = labels[o]; if (!l) continue; cnt[l]++; sx[l] += i; sy[l] += j; sz[l] += k; }
    const out = [];
    for (let l = 1; l < K; l++) {
      if (!cnt[l] && !(names && l < names.length)) continue;
      const v = cnt[l] ? [sx[l] / cnt[l], sy[l] / cnt[l], sz[l] / cnt[l]] : null, A = affine;
      out.push({ index: l, name: names ? names[l] : String(l), count: cnt[l], centroid: v && [A[0] * v[0] + A[1] * v[1] + A[2] * v[2] + A[3], A[4] * v[0] + A[5] * v[1] + A[6] * v[2] + A[7], A[8] * v[0] + A[9] * v[1] + A[10] * v[2] + A[11]] });
    }
    return out;
  }


  // ---------------------------------------------------------------- harmonisation des intensités (EpiScope v4.6)
  /** Correction du biais de champ (inhomogénéité lente des intensités, fréquente sans « prescan normalize ») et
   *  standardisation : MeshNet / brainchop échoue là où le T1 est sombre (substance blanche ≪ référence, lobes
   *  frontaux et vertex plus sombres que l'arrière) — le réseau ne voit alors plus de cortex à ces endroits.
   *  Méthode (convolution normalisée, esprit N3/N4 simplifié) : à partir des classes SB / SG du prémodèle (model5_gw_ae),
   *  résidus log(I) − médiane de la classe (SB poids 1, SG 0,3, valeurs aberrantes |r| > 0,4 écartées), cumulés sur une
   *  grille de 4 mm, lissés (gaussienne σ = 20 mm, repli σ = 60 mm loin du cerveau) ; 4 itérations ; puis I / champ,
   *  mise à l'échelle de la médiane SB à `target` (170, ≈ images de référence de brainchop), lissage gaussien léger
   *  facultatif (`smooth` en mm), écrêtage 0–255. Dans segment({harmonize}) : correction toujours, lissage « auto » — second
   *  passage sur l'image lissée (σ = 0,6 mm) seulement si > 5 % du tissu vu par le prémodèle reste sans étiquette, gardé s'il
   *  en étiquette davantage (la texture fine d'une acquisition < 1 mm rééchantillonnée fait perdre le cortex au réseau ; sur
   *  une image « normale », le lissage modifie inutilement les contours).
   *  conf : volume conformé (uint8 256³) ; lab : sortie du prémodèle (1 = SB, 2 = SG) → { data: Uint8Array, stats } */
  function harmonize(img, lab, opts) {
    opts = opts || {}; const N = 256, B = 4, n = N / B, n3 = n * n * n, target = opts.target || 170, iters = opts.iters || 4;
    const LOG = new Float32Array(256); for (let v = 0; v < 256; v++) LOG[v] = Math.log(Math.max(v, 1));
    // SB érodée (6-voisins) : voxels purs ; SG telle quelle
    const cls = new Uint8Array(N * N * N), S1 = N, S2 = N * N;
    for (let k = 1; k < N - 1; k++) for (let j = 1; j < N - 1; j++) { let o = 1 + S1 * j + S2 * k; for (let i = 1; i < N - 1; i++, o++) {
      const l = lab[o]; if (l === 2) cls[o] = 2; else if (l === 1 && lab[o - 1] === 1 && lab[o + 1] === 1 && lab[o - S1] === 1 && lab[o + S1] === 1 && lab[o - S2] === 1 && lab[o + S2] === 1) cls[o] = 1; } }
    const idx = []; for (let o = 0; o < cls.length; o++) if (cls[o] && img[o]) idx.push(o);
    const nW = idx.reduce((c, o) => c + (cls[o] === 1), 0);
    if (nW < 20000) return { data: img, stats: { skipped: 'substance blanche trop peu étendue (' + nW + ' voxels)' } };
    // interpolation trilinéaire de la grille de 4 mm (centres des blocs en 4b + 1,5)
    const ax = new Int32Array(N), af = new Float32Array(N); for (let x = 0; x < N; x++) { const u = Math.min(n - 1.000001, Math.max(0, (x - 1.5) / B)); ax[x] = Math.floor(u); af[x] = u - ax[x]; }
    const F = new Float32Array(n3);
    const fAt = o => { const i = o % N, j = ((o / N) | 0) % N, k = (o / S2) | 0, i0 = ax[i], j0 = ax[j], k0 = ax[k], fi = af[i], fj = af[j], fk = af[k];
      const b = i0 + n * (j0 + n * k0), di = i0 + 1 < n ? 1 : 0, dj = j0 + 1 < n ? n : 0, dk = k0 + 1 < n ? n * n : 0;
      return ((F[b] * (1 - fi) + F[b + di] * fi) * (1 - fj) + (F[b + dj] * (1 - fi) + F[b + dj + di] * fi) * fj) * (1 - fk) +
        ((F[b + dk] * (1 - fi) + F[b + dk + di] * fi) * (1 - fj) + (F[b + dk + dj] * (1 - fi) + F[b + dk + dj + di] * fi) * fj) * fk; };
    const median = (vals) => { const H = new Float64Array(4096); let c = 0; for (const v of vals) { H[Math.max(0, Math.min(4095, Math.round(v * 600)))]++; c++; } let a = 0, t = c / 2, k = 0; for (; k < 4096; k++) { a += H[k]; if (a >= t) break; } return k / 600; };
    const blur = (A, sig) => {   // gaussienne séparable sur la grille n³, bords à zéro
      const r = Math.ceil(3 * sig), w = new Float32Array(2 * r + 1); for (let t = -r; t <= r; t++) w[t + r] = Math.exp(-t * t / (2 * sig * sig));
      let a = A, b = new Float32Array(n3);
      for (const [st, s2, s3] of [[1, n, n * n], [n, 1, n * n], [n * n, 1, n]]) {
        b.fill(0);
        for (let q = 0; q < n; q++) for (let p = 0; p < n; p++) { const base = p * s2 + q * s3;
          for (let x = 0; x < n; x++) { let acc = 0; const lo = Math.max(0, x - r), hi = Math.min(n - 1, x + r); for (let y = lo; y <= hi; y++) acc += a[base + y * st] * w[y - x + r]; b[base + x * st] = acc; } }
        const t = a === A ? new Float32Array(n3) : a; a = b; b = t;
      }
      return a;
    };
    const cor = new Float32Array(idx.length), blk = new Int32Array(idx.length);
    for (let q = 0; q < idx.length; q++) { const o = idx[q], i = o % N, j = ((o / N) | 0) % N, k = (o / S2) | 0; blk[q] = (i >> 2) + n * ((j >> 2) + n * (k >> 2)); }
    const cvOf = () => { let s = 0, s2 = 0, c = 0; for (let q = 0; q < idx.length; q++) if (cls[idx[q]] === 1) { const v = Math.exp(LOG[img[idx[q]]] - fAt(idx[q])); s += v; s2 += v * v; c++; } const m = s / c; return Math.sqrt(Math.max(0, s2 / c - m * m)) / m; };
    const cv0 = cvOf(), wm0 = Math.exp(median(idx.filter(o => cls[o] === 1).map(o => LOG[img[o]])));
    for (let it = 0; it < iters; it++) {
      for (let q = 0; q < idx.length; q++) cor[q] = LOG[img[idx[q]]] - fAt(idx[q]);
      const mW = median(Array.from(cor).filter((v, q) => cls[idx[q]] === 1)), mG = median(Array.from(cor).filter((v, q) => cls[idx[q]] === 2));
      const R = new Float32Array(n3), W = new Float32Array(n3);
      for (let q = 0; q < idx.length; q++) { const c = cls[idx[q]], r = cor[q] - (c === 1 ? mW : mG); if (Math.abs(r) > 0.4) continue; const w = c === 1 ? 1 : 0.3; R[blk[q]] += r * w; W[blk[q]] += w; }
      const sg = 20 / B, Rs = blur(R, sg), Ws = blur(W, sg), Rl = blur(R, 3 * sg), Wl = blur(W, 3 * sg); let wmax = 0; for (const v of Ws) if (v > wmax) wmax = v;
      for (let b = 0; b < n3; b++) F[b] += Ws[b] > 1e-3 * wmax ? Rs[b] / Ws[b] : Wl[b] > 1e-12 ? Rl[b] / Wl[b] : 0;
    }
    let fmin = Infinity, fmax = -Infinity; for (let q = 0; q < idx.length; q++) if (cls[idx[q]] === 1) { const f = fAt(idx[q]); if (f < fmin) fmin = f; if (f > fmax) fmax = f; }
    const wm1 = Math.exp(median(idx.filter(o => cls[o] === 1).map(o => LOG[img[o]] - fAt(o)))), scale = target / wm1, out = new Uint8Array(img.length);
    const sm = opts.smooth > 0 ? +opts.smooth : 0;
    if (sm > 0) {   // lissage gaussien léger (σ en mm) : texture fine (acquisitions < 1 mm rééchantillonnées) que le réseau ne connaît pas
      const fl = new Float32Array(img.length); for (let o = 0; o < img.length; o++) { const v = img[o]; if (v) fl[o] = v * Math.exp(-fAt(o)) * scale; }
      const r = Math.max(1, Math.ceil(3 * sm)), w = []; let ws = 0; for (let t = -r; t <= r; t++) { const x = Math.exp(-t * t / (2 * sm * sm)); w.push(x); ws += x; } for (let t = 0; t < w.length; t++) w[t] /= ws;
      let a = fl, b = new Float32Array(img.length);
      for (const st of [1, N, N * N]) {
        for (let o = 0; o < a.length; o++) { const x = st === 1 ? o % N : st === N ? ((o / N) | 0) % N : (o / S2) | 0; let acc = 0, wsum = 0; for (let t = -r; t <= r; t++) { const y = x + t; if (y < 0 || y >= N) continue; acc += a[o + t * st] * w[t + r]; wsum += w[t + r]; } b[o] = acc / wsum; }
        const t = a; a = b; b = t;
      }
      for (let o = 0; o < img.length; o++) { const y = a[o]; out[o] = y > 255 ? 255 : y < 0 ? 0 : y; }
    } else for (let o = 0; o < img.length; o++) { const v = img[o]; if (!v) continue; const y = v * Math.exp(-fAt(o)) * scale; out[o] = y > 255 ? 255 : y; }
    let s = 0, s2 = 0, c = 0; for (const o of idx) if (cls[o] === 1) { const v = out[o]; s += v; s2 += v * v; c++; }
    const m = s / c;
    return { data: out, stats: { wmBefore: Math.round(wm0), wmAfter: Math.round(m), target, smooth: sm, scale: +scale.toFixed(3), field: [+(Math.exp(fmin) - 1).toFixed(3), +(Math.exp(fmax) - 1).toFixed(3)], cvBefore: +cv0.toFixed(3), cvAfter: +(Math.sqrt(Math.max(0, s2 / c - m * m)) / m).toFixed(3), voxels: idx.length } };
  }

  SV.MeshNet = { isConformed, conform, getScale, loadModel, segment, segmentPass, smoothImage, coverage, harmonize, envelope, largestComponent, labelStats, normLUT, cropBox, ACT, act, erf,
    _task: task, _wasm: wasmGet, _jsRun: jsRun, _runNet: runNet, _makeExec: makeExec };

  // module WebAssembly (tools/meshnet_wasm.c compilé par clang, voir l'en-tête de ce fichier C) ; atob ignore les fins de ligne
  const WASM_B64 = `
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`;
});
