// node tools/tests/test_meshnet.mjs [--parts=1,2,3,4,5[,6]] [--fast] [--no-workers] [--brainchop-ref] — depuis la racine du
// dépôt (Node ≥ 22) ; --fast : parties 1–3 seulement ; --brainchop-ref : calcule les références brainchop absentes du cache
// Vérifie src/imaging/meshnet.js (MeshNet / brainchop sans TensorFlow.js) :
//   1. couches isolées vs tf.js (vrais poids, toutes activations, dilatations 1–16, normalisation d'instance) ;
//   2. réseau complet vs tf.js sur une boîte NON cubique d'un vrai T1 : modèle Keras réel, tenseur construit et transposé
//      exactement comme brainchop ([k][j][i] → transpose) → preuve de l'indexation (noyau ↔ axes voxel) ;
//      + identité calcul local / groupe de workers (Worker simulé par worker_threads) et normalisations/boîte vs tf.js ;
//   3. conform vs Niivue.conform() lui-même (niivue 0.62.1 exécuté sous Node) et vs références Python (FastSurfer
//      conform.py : nibabel + scipy ; port numpy de niivue) ;
//   4. chaîne 104 classes complète sur brainchop v3/data/t1_c.nii.gz → /tmp/claude-0/meshnet_t1c_104.nii.gz, contrôles
//      anatomiques, Dice SG/SB vs labels.nii.gz, et comparaison au code brainchop lui-même exécuté avec tf.js (CPU)
//      (calculé avec --brainchop-ref, ~25 min, puis mis en cache dans /tmp/claude-0/brainchop_ref/) ;
//   5. image non conformée (MNI152 2009a, RAS 197×233×189) : conform → segmentation → /tmp/claude-0/meshnet_mni_104.nii.gz,
//      contrôles anatomiques (centroïdes MNI attendus) et comparaison à Niivue.conform() + brainchop (même cache) ;
//   6. (--parts=6) autres modèles sur t1_c : mindgrab (seuil 0,5 + marge 20, normalisation d'instance, gelu), model30chan18cls ;
//   7. (--parts=7) navigateur réel : page file:// dans Chromium (Playwright Python), vrais Web Workers (Blob) + WebAssembly,
//      chaîne 104 complète sur t1_c ; empreinte des étiquettes = celle du calcul Node de la partie 4.
// tf.js (@tensorflow/tfjs, backend CPU pur JS) est installé hors dépôt : cd /home/claude/pkgs && npm i @tensorflow/tfjs
import fs from 'fs'; import vm from 'vm'; import http from 'http'; import path from 'path';
import { createRequire } from 'module'; import { execFileSync } from 'child_process';

const OUT = '/tmp/claude-0', BC = '/home/claude/neuroneural/brainchop', PKGS = '/home/claude/pkgs';
const T1C = BC + '/v3/data/t1_c.nii.gz', LAB = BC + '/v3/data/labels.nii.gz';
const MNI = PKGS + '/nilearn/x/nilearn/datasets/data/mni_icbm152_t1_tal_nlin_sym_09a_converted.nii.gz';
const REF = OUT + '/brainchop_ref';
fs.mkdirSync(REF, { recursive: true });
const ARGS = new Set(process.argv.slice(2));
const PARTS = new Set(((process.argv.find(a => a.startsWith('--parts=')) || '--parts=1,2,3,4,5').slice(8)).split(',').map(Number));   // 6, 7 : sur demande
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const loadSrc = f => vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });

// ======================================================================= mode enfant : code brainchop + tf.js (référence)
// node test_meshnet.mjs --brainchop-child <indice inferenceModelsList> <entrée conformée .nii.gz> <sortie .nii.gz>
// exécute le code brainchop non modifié (brainchop-mainthread.js, inference-logic.js, tensor-utils.js, bwlabels.js) avec
// tf.js-CPU ; les modèles sont servis en HTTP local depuis public/ comme dans l'application brainchop
if (process.argv[2] === '--brainchop-child') {
  const [, , , idx, inFile, outFile] = process.argv;
  const { register } = await import('module');
  register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s, c, n) {
    if (s === '@tensorflow/tfjs') return { url: 'file://${PKGS}/node_modules/@tensorflow/tfjs/dist/tf.node.js', format: 'commonjs', shortCircuit: true };
    return n(s, c); }`));
  globalThis.window = undefined; loadSrc('src/nifti.js');
  const vol = await SV.Nifti.read(new Uint8Array(fs.readFileSync(inFile)));   // copie (voir cmpConf : Buffer et .nii)
  if (!(vol.data instanceof Uint8Array) || vol.dims.join() !== '256,256,256') throw new Error('entrée non conformée');
  const srv = http.createServer((q, r) => { const f = path.join(BC, 'public', decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200); r.end(b); } }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const tf = createRequire(PKGS + '/')('@tensorflow/tfjs'); await tf.setBackend('cpu');   // pas de WebGL sous Node
  // chemin « fil principal » de brainchop (brainchop-mainthread.js runInference) : le chemin worker
  // (brainchop-webworker.js) poursuit sa boucle while(true) après le prémodèle (res.layers[20] indéfini), envoie une erreur
  // modale et appelle tf.engine().endScope() pendant l'inférence principale (main.js termine alors le worker)
  let done; const fin = new Promise(r => { done = r; });
  globalThis.window = { setInterval, clearInterval, alert: m => process.stderr.write('[alert] ' + m + '\n') };
  const callbackImg = img => done({ img });
  const callbackUI = (message = '', frac = -1, modal = '') => {   // « unreliable reasons » : avertissement mémoire du backend CPU, sans effet
    if (modal && !/^unreliable reasons/.test(modal)) done({ err: modal }); else if (message && !/^unreliable/.test(message)) process.stderr.write('[brainchop] ' + message + '\n');
  };
  const t0 = Date.now();
  const { runInference } = await import(BC + '/brainchop-mainthread.js');
  const { inferenceModelsList, brainChopOpts } = await import(BC + '/brainchop-parameters.js');
  const opts = Object.assign({}, brainChopOpts, { rootURL: 'http://127.0.0.1:' + srv.address().port });
  runInference(opts, inferenceModelsList[+idx], { datatypeCode: 2, dims: [3, 256, 256, 256, 1, 1, 1, 1] }, vol.data, callbackImg, callbackUI);
  const r = await fin; srv.close();
  if (r.err) { console.error('brainchop :', r.err); process.exit(1); }
  fs.writeFileSync(outFile, await SV.Nifti.encodeGz({ dims: [256, 256, 256], data: new Uint8Array(r.img), affine: vol.affine, descrip: 'brainchop tfjs-cpu ' + inferenceModelsList[+idx].path }));
  console.log('brainchop', inferenceModelsList[+idx].modelName, ((Date.now() - t0) / 1000).toFixed(0), 's →', outFile);
  process.exit(0);
}

// ======================================================================= mode enfant : conform de niivue lui-même (référence)
// node test_meshnet.mjs --niivue-child <entrée .nii(.gz)> <sortie .nii> : Niivue.conform(vol, toRAS = false) de
// /home/claude/pkgs/package/dist (niivue 0.62.1, celui qu'utilise brainchop main.js ensureConformed)
if (process.argv[2] === '--niivue-child') {
  const [, , , inFile, outFile] = process.argv;
  globalThis.window = { addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1, matchMedia: () => ({ matches: false, addEventListener() {} }) };
  globalThis.document = { createElement: () => ({ getContext: () => null, style: {} }), addEventListener() {}, body: {} };
  const { Niivue, NVImage } = await import(PKGS + '/package/dist/index.js');
  const vol = await NVImage.loadFromUrl({ url: new Uint8Array(fs.readFileSync(inFile)), name: path.basename(inFile) });
  const c = await new Niivue().conform(vol, false);
  fs.writeFileSync(outFile, Buffer.from(await c.saveToUint8Array(outFile)));
  process.exit(0);
}

// ======================================================================= environnement
globalThis.window = undefined;
const useWorkers = !ARGS.has('--no-workers');
if (useWorkers) installWorkerShim();   // avant work.js (SV.Work.available est évalué au chargement)
loadSrc('src/nifti.js'); loadSrc('src/work.js'); loadSrc('src/imaging/meshnet.js');
const M = SV.MeshNet, Mat4 = SV.Mat4;
const require = createRequire(PKGS + '/');
const tf = require('@tensorflow/tfjs'); await tf.setBackend('cpu'); await tf.ready();

let nFail = 0, nOk = 0;
const ok = (c, msg) => { console.log((c ? '  ok    ' : '  ÉCHEC  ') + msg); if (c) nOk++; else nFail++; };
const hdr = s => console.log('\n=== ' + s);
const fmt = (x, d = 3) => (typeof x === 'number' ? x.toFixed(d) : String(x));
const spec = name => M.loadModel(fs.readFileSync(path.join(ROOT, 'assets/models', name + '.json'), 'utf8'));
const wasmOk = !!(await M._wasm());
console.log('WebAssembly SIMD :', wasmOk ? 'actif' : 'INDISPONIBLE (repli JS)', '| workers :', useWorkers ? 'worker_threads (simulation Web Worker)' : 'non');

/** Web Worker minimal sur worker_threads : Blob → texte → Worker(eval) ; self.postMessage/onmessage */
function installWorkerShim() {
  const { Worker: NW } = createRequire(import.meta.url)('worker_threads');
  const blobs = new Map(); let n = 0;
  URL.createObjectURL = b => { const u = 'blob:episcope-test/' + (++n); blobs.set(u, b); return u; };
  globalThis.Worker = class {
    constructor(url) {
      this.onmessage = null; this.onerror = null; this._q = [];
      blobs.get(url).text().then(src => {
        const boot = "const { parentPort } = require('worker_threads'); globalThis.self = globalThis; self.postMessage = (m, t) => parentPort.postMessage(m, t);" +
          "parentPort.on('message', d => self.onmessage && self.onmessage({ data: d }));\n" + src;
        this._w = new NW(boot, { eval: true });
        this._w.on('message', d => this.onmessage && this.onmessage({ data: d }));
        this._w.on('error', e => this.onerror && this.onerror({ message: e.message, preventDefault() {} }));
        if (this._dead) this._w.terminate(); else for (const [m, t] of this._q) this._w.postMessage(m, t);
        this._q = null;
      });
    }
    postMessage(m, t) { if (this._q) this._q.push([m, t]); else this._w.postMessage(m, t); }
    terminate() { this._dead = true; if (this._w) this._w.terminate(); }
  };
}

/** modèle Keras d'origine (model.json + .bin brainchop) chargé par tf.js */
async function keras(name) {
  const d = BC + '/public/models/' + name + '/', mj = JSON.parse(fs.readFileSync(d + 'model.json', 'utf8'));
  const bufs = [], specs = []; for (const w of mj.weightsManifest) { for (const p of w.paths) bufs.push(fs.readFileSync(d + p)); specs.push(...w.weights); }
  const all = Buffer.concat(bufs);
  return tf.loadLayersModel(tf.io.fromMemory({ modelTopology: mj.modelTopology, weightSpecs: specs, weightData: all.buffer.slice(all.byteOffset, all.byteOffset + all.byteLength) }));
}
/** normalisation d'instance de brainchop (LayerNormInPlace) */
const layerNorm = x => tf.tidy(() => { const { mean, variance } = tf.moments(x, [1, 2, 3], true); return tf.mul(tf.sub(x, mean), tf.rsqrt(tf.add(variance, 1e-5))); });
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()); }
const elapsed = t0 => ((performance.now() - t0) / 1000).toFixed(1) + ' s';

const t1c = await SV.Nifti.read(fs.readFileSync(T1C));
const models = { m104: spec('model21_104class'), m5: spec('model5_gw_ae'), m18: spec('model30chan18cls'), mg: spec('mindgrab') };

// ======================================================================= 1. couches isolées vs tf.js
const pool = useWorkers && SV.Work.available ? SV.Work.pool(['meshnet'], 2) : null;
if (PARTS.has(1)) {
  hdr('1. couches isolées (poids réels) vs tf.js conv3d/activations/normalisation d\'instance');
  const cases = [['model21_104class', 'm104', [0, 1, 3, 5, 7, 8]], ['model5_gw_ae', 'm5', [0, 4, 9]], ['model30chan18cls', 'm18', [0, 4, 8, 9]], ['mindgrab', 'mg', [0, 4, 12, 25]]];
  const [bx, by, bz] = [36, 34, 38], n = bx * by * bz;
  for (const [name, key, lis] of cases) {
    const km = await keras(name), sp = models[key];
    for (const li of lis) {
      const L = sp.layers[li], C = L.inC, r = rng(1000 + li), prev = li ? sp.layers[li - 1].act : -1;
      // entrée réaliste : intensités normalisées (1re couche) ou sorties d'activation (relu/elu/gelu) de la couche précédente
      const ours = new Float32Array(n * C).map(() => prev < 0 ? r() : M.act(gauss(r), prev || 1));
      const tfx = new Float32Array(n * C);
      for (let z = 0; z < bz; z++) for (let y = 0; y < by; y++) for (let x = 0; x < bx; x++) for (let c = 0; c < C; c++) tfx[((x * by + y) * bz + z) * C + c] = ours[((z * by + y) * bx + x) * C + c];
      const kl = km.layers[1 + 2 * li], ka = km.layers[2 + 2 * li];
      const ref = tf.tidy(() => { let y = kl.apply(tf.tensor5d(tfx, [1, bx, by, bz, C])); if (kl.name.endsWith('_gn')) y = layerNorm(y); if (ka && ka.getClassName() === 'Activation') y = ka.apply(y); return L.kernel === 1 ? tf.argMax(y, -1) : y; });
      const R = ref.dataSync(); ref.dispose();
      for (const wasm of wasmOk ? [true, false] : [false]) {
        const t0 = performance.now();
        if (L.kernel === 1) {
          const res = await M._task({ kind: 'head', bx, by, nz: bz, inC: C, outC: L.outC, input: ours.slice(), head: { W: L.W, B: L.B, outC: L.outC, nv: L.nv }, wasm });
          let bad = 0; for (let z = 0; z < bz; z++) for (let y = 0; y < by; y++) for (let x = 0; x < bx; x++) bad += res.labels[(z * by + y) * bx + x] !== R[(x * by + y) * bz + z];
          ok(bad <= n * 1e-4, `${name} ${L.name} 1×1×1 ${C}→${L.outC} + argmax [${res.engine}] : ${bad}/${n} voxels différents (${elapsed(t0)})`);
          continue;
        }
        const d = L.dil, pz = new Int32Array(bz * 3); for (let z = 0; z < bz; z++) for (let k = 0; k < 3; k++) { const q = z + (k - 1) * d; pz[3 * z + k] = q >= 0 && q < bz ? q : -1; }
        const res = await M._task({ kind: 'conv', bx, by, nz: bz, inC: C, outC: L.outC, dil: d, act: L.gn ? 0 : L.act, nv: L.nv, W: L.W, B: L.B, input: ours.slice(), pz, stats: L.gn, wasm });
        const out = res.out;
        if (L.gn) for (let c = 0; c < L.outC; c++) { const mu = res.sum[c] / n, s = 1 / Math.sqrt(Math.max(0, res.sq[c] / n - mu * mu) + 1e-5); for (let v = 0; v < n; v++) out[v * L.outC + c] = M.act((out[v * L.outC + c] - mu) * s, L.act); }
        let e = 0, sc = 0;
        for (let z = 0; z < bz; z++) for (let y = 0; y < by; y++) for (let x = 0; x < bx; x++) for (let c = 0; c < L.outC; c++) {
          const a = out[((z * by + y) * bx + x) * L.outC + c], b = R[((x * by + y) * bz + z) * L.outC + c]; e = Math.max(e, Math.abs(a - b)); sc = Math.max(sc, Math.abs(b));
        }
        const actName = Object.keys(M.ACT).find(k => M.ACT[k] === L.act);
        ok(e / sc < 1e-3, `${name} ${L.name} 3×3×3 d=${d} ${C}→${L.outC} ${L.gn ? 'gn+' : ''}${actName} [${res.engine}] : max|Δ| = ${e.toExponential(2)} (échelle ${fmt(sc, 2)}, relatif ${(e / sc).toExponential(1)}) (${elapsed(t0)})`);
      }
    }
    km.dispose();
  }
}

// ======================================================================= 2. réseau complet vs tf.js (indexation brainchop)
if (PARTS.has(2)) {
  hdr('2. réseau complet sur une boîte non cubique d\'un vrai T1 : notre runNet vs tf.js (modèle Keras, transpositions brainchop)');
  const exLocal = M._makeExec({ workers: 0 });
  const cases = [['model21_104class', 'm104', [140, 120, 120], [44, 38, 34]], ['model5_gw_ae', 'm5', [100, 90, 100], [40, 36, 30]],
    ['model30chan18cls', 'm18', [150, 100, 110], [36, 30, 28]], ['mindgrab', 'mg', [110, 70, 60], [34, 30, 26]]];
  for (const [name, key, [i0, j0, k0], [bx, by, bz]] of cases) {
    const sp = models[key], km = await keras(name), { L } = M.normLUT(t1c.data, sp.settings.normalization), plane = bx * by;
    const crop = new Float32Array(plane * bz);
    for (let z = 0; z < bz; z++) for (let y = 0; y < by; y++) for (let x = 0; x < bx; x++) crop[(z * by + y) * bx + x] = L[t1c.data[(i0 + x) + 256 * ((j0 + y) + 256 * (k0 + z))]];
    // brainchop : tenseur [k][j][i] (getAllSlicesDataAsTF3D) → .transpose() → [1, D, H, W, 1] ; couches ; argMax ; .transpose()
    let t0 = performance.now(), cur = tf.tensor(crop, [bz, by, bx]).transpose().reshape([1, bx, by, bz, 1]);
    for (let i = 1; i < km.layers.length; i++) { const nx = tf.tidy(() => { let r = km.layers[i].apply(cur); if (km.layers[i].name.endsWith('_gn')) r = layerNorm(r); return r; }); cur.dispose(); cur = nx; }
    const lab = tf.tidy(() => tf.argMax(cur, -1).squeeze().transpose()), R = lab.dataSync(); lab.dispose(); cur.dispose(); km.dispose();
    const tTf = elapsed(t0);
    const input = z => crop.slice(z * plane, (z + 1) * plane);
    t0 = performance.now(); const A = await M._runNet(sp, { bx, by, bz }, input, exLocal, () => {}, [], name); const tA = elapsed(t0);
    let bad = 0, cls = new Set(); for (let v = 0; v < R.length; v++) { bad += A[v] !== R[v]; cls.add(R[v]); }
    ok(bad <= R.length * 1e-4, `${name} boîte ${bx}×${by}×${bz} en (${i0},${j0},${k0}) : ${bad}/${R.length} étiquettes différentes de tf.js, ${cls.size} classes présentes (tf.js ${tTf}, nous ${tA})`);
    if (pool) {
      t0 = performance.now(); const P = await M._runNet(sp, { bx, by, bz }, input, M._makeExec({ pool }), () => {}, [], name);
      let d = 0; for (let v = 0; v < A.length; v++) d += A[v] !== P[v];
      ok(d === 0, `${name} : groupe de 2 workers identique au calcul local (${d} différences, ${elapsed(t0)})`);
    }
    if (wasmOk && key === 'm5') {
      const J = await M._runNet(sp, { bx, by, bz }, input, M._makeExec({ workers: 0, wasm: false }), () => {}, [], name);
      let d = 0; for (let v = 0; v < A.length; v++) d += A[v] !== J[v];
      ok(d <= A.length * 1e-4, `${name} : repli JavaScript ≈ WebAssembly (${d} différences)`);
    }
  }
  // normalisations, seuil et boîte englobante vs les fonctions tf.js de brainchop (tensor-utils.js) sur le volume entier
  const vol3 = tf.tensor(Float32Array.from(t1c.data), [256, 256, 256]);
  for (const kind of ['minmax', 'quantile']) {
    const { L, max } = M.normLUT(t1c.data, kind);
    let ref;
    if (kind === 'minmax') ref = tf.tidy(() => vol3.sub(vol3.min()).div(vol3.max().sub(vol3.min())));
    else {   // calculateQuantiles (tri complet) puis (x − qmin)/(qmax − qmin)
      const s = Float32Array.from(t1c.data).sort(), n = s.length, qmin = s[Math.floor(n * 0.05)], qmax = s[Math.ceil(n * 0.95) - 1];
      ref = tf.tidy(() => vol3.sub(tf.scalar(qmin)).div(tf.scalar(qmax).sub(tf.scalar(qmin))));
    }
    const R = ref.dataSync(); let e = 0; for (let i = 0; i < R.length; i += 7) e = Math.max(e, Math.abs(R[i] - L[t1c.data[i]]));
    const thr = tf.tidy(() => ref.greater(ref.max().mul(0.2))).dataSync(); let dm = 0; const th = Math.fround(max * Math.fround(0.2));
    for (let i = 0; i < thr.length; i += 3) dm += thr[i] !== (L[t1c.data[i]] > th ? 1 : 0);
    ok(e === 0 && dm === 0, `normalisation ${kind} identique à tf.js (max|Δ| = ${e}) ; masque applyMriThreshold(0,2) identique (${dm} diff.)`);
    ref.dispose();
  }
  // boîte : firstLastNonZero3D + cropAndGetCorner de brainchop sur un masque (seuil 0,5)
  const { L } = M.normLUT(t1c.data, 'minmax'), mk = new Uint8Array(256 ** 3); for (let i = 0; i < mk.length; i++) mk[i] = L[t1c.data[i]] > 0.5 ? 1 : 0;
  const mt = tf.tensor(mk, [256, 256, 256], 'int32'), fl = async dim => { const m = await (dim === 0 ? mt.max(2).max(1) : dim === 1 ? mt.max(2).max(0) : mt.max(1).max(0)).array(); return [m.findIndex(v => v > 0), 255 - m.slice().reverse().findIndex(v => v > 0)]; };
  const [rk, rj, ri] = [await fl(0), await fl(1), await fl(2)], pad = 20, adj = ([a, b]) => [Math.max(0, a - Math.min(a, pad)), Math.min(255, b + Math.min(255 - b, pad))];
  const bc = [adj(ri), adj(rj), adj(rk)], ours = M.cropBox(mk, pad); mt.dispose(); vol3.dispose();
  ok(bc.every(([a, b], d) => ours.min[d] === a && ours.max[d] === b), `boîte de recadrage = cropAndGetCorner brainchop (i ${bc[0]}, j ${bc[1]}, k ${bc[2]})`);
  // post-traitement : BWLabeler de brainchop (bwlabels.js, module sans dépendance) vs largestComponent, sur des taches
  // aléatoires à plusieurs étiquettes (volume non cubique)
  const { BWLabeler: BWL } = await import(BC + '/bwlabels.js');
  class BWLabeler extends BWL { bwlabel(...a) { const log = console.log; console.log = () => {}; try { return super.bwlabel(...a); } finally { console.log = log; } } }   // silencieux
  const dims = [61, 47, 39], n = dims[0] * dims[1] * dims[2], r = rng(42), lab = new Uint8Array(n);
  for (let b = 0; b < 160; b++) {   // boules aléatoires, étiquettes 1..6
    const c = [r() * dims[0], r() * dims[1], r() * dims[2]], rad = 1 + r() * 5, l = 1 + Math.floor(r() * 6);
    for (let k = 0, o = 0; k < dims[2]; k++) for (let j = 0; j < dims[1]; j++) for (let i = 0; i < dims[0]; i++, o++) if ((i - c[0]) ** 2 + (j - c[1]) ** 2 + (k - c[2]) ** 2 < rad * rad) lab[o] = l;
  }
  const [, keep] = new BWLabeler().bwlabel(lab, new Uint32Array(dims), 26, true, true), ref = lab.map((v, i) => v * keep[i]);
  const mine = M.largestComponent(lab, dims, false); let d1 = 0, kept = 0; for (let i = 0; i < n; i++) { d1 += ref[i] !== mine[i]; kept += mine[i] > 0; }
  let d2 = 0; const per = M.largestComponent(lab, dims, true);
  for (let l = 1; l <= 6; l++) { const bin = lab.map(v => (v === l ? 1 : 0)), [, kl] = new BWLabeler().bwlabel(bin, new Uint32Array(dims), 26, true, true); for (let i = 0; i < n; i++) d2 += ((bin[i] && kl[i]) ? l : 0) !== (per[i] === l ? l : 0); }
  ok(d1 === 0 && d2 === 0, `post-traitement = BWLabeler brainchop (26-connexité, binarize + onlyLargestClusterPerClass) : ${d1} diff. (${kept} voxels gardés) ; mode perLabel = BWLabeler par étiquette : ${d2} diff.`);
}

// ======================================================================= 3. conform vs Python
const PY = OUT + '/meshnet_conform_ref.py';
fs.writeFileSync(PY, String.raw`
# Références conform : FastSurfer conform.py (getscale / map_image / scalecrop / rint, scipy affine_transform order=1)
# et port numpy de niivue conform (bloc central pour min/max, histogramme niivue, troncature).
import sys, numpy as np, nibabel as nib
from scipy.ndimage import affine_transform
def out_affine(img):
    Pc = img.affine.dot(np.hstack((np.array(img.shape[:3]) / 2.0, [1])))[:3]
    M = np.array([[-1, 0, 0], [0, 0, 1], [0, -1, 0]], float)   # Mdc.T * zooms (LIA, 1 mm)
    A = np.eye(4); A[:3, :3] = M; A[:3, 3] = Pc - M.dot([128, 128, 128]); return A
def fs_getscale(data, f_low=0.0, f_high=0.999):
    src_min, src_max = float(np.min(data)), float(np.max(data)); voxnum = data.size
    nz = (np.abs(data) >= 1e-15).sum(); histosize = 1000; bin_size = (src_max - src_min) / histosize
    hist, _ = np.histogram(data, histosize); cs = np.concatenate(([0], np.cumsum(hist)))
    nth = int(f_low * voxnum); idx = np.where(cs < nth); idx = idx[0][-1] + 1 if len(idx[0]) > 0 else 0
    src_min = idx * bin_size + src_min
    nth = voxnum - int((1.0 - f_high) * nz); idx = np.where(cs >= nth); idx = idx[0][0] - 2
    src_max = idx * bin_size + src_min
    return src_min, (1.0 if src_min == src_max else 255.0 / (src_max - src_min))
def fastsurfer(img):
    A = out_affine(img); data = np.asanyarray(img.dataobj).astype(np.float64)
    src_min, scale = fs_getscale(data)
    vox2vox = np.linalg.inv(A) @ img.affine
    mapped = affine_transform(data, np.linalg.inv(vox2vox), output_shape=(256, 256, 256), order=1)
    if img.get_data_dtype() != np.dtype(np.uint8) and np.max(mapped) > 255:
        mapped = np.clip(0 + scale * (mapped - src_min), 0, 255)
    return np.uint8(np.rint(np.clip(mapped, 0, 255))), A
def niivue(img):
    A = out_affine(img); d = np.asanyarray(img.dataobj).astype(np.float32); n = np.array(d.shape)
    b = (0.25 * n).astype(int); c = d[b[0]:n[0]-b[0], b[1]:n[1]-b[1], b[2]:n[2]-b[2]]; c = c[~np.isnan(c)]
    mn, mx = float(c.min()), float(c.max())
    if img.get_data_dtype() == np.dtype(np.uint8): smin, scale = mn, 1.0
    else:
        flat = d.ravel().astype(np.float64); nzv = (np.abs(flat) >= 1e-15).sum(); bs = (mx - mn) / 1000
        k = np.floor((flat - mn) / bs); k = np.minimum(k, 999); k = k[k >= 0].astype(int)
        cs = np.cumsum(np.bincount(k, minlength=1000)); nth = flat.size - int((1 - 0.999) * nzv)
        idx = 0
        while idx < 999 and not cs[idx + 1] >= nth: idx += 1
        smax = idx * bs + mn; smin, scale = mn, (255.0 / (smax - mn) if smax != mn else 1.0)
    V = np.linalg.inv(img.affine) @ A
    out = np.zeros((256, 256, 256), np.uint8)   # [k][j][i] puis transposé ; tranches de 16 plans k (mémoire)
    for k0 in range(0, 256, 16):
        kk, jj, ii = np.meshgrid(np.arange(k0, k0 + 16), np.arange(256), np.arange(256), indexing='ij')
        g = np.stack([ii.ravel(), jj.ravel(), kk.ravel()], -1).astype(np.float64)
        p = g @ V[:3, :3].T + V[:3, 3]; r = np.round(p); p = np.where(np.abs(p - r) < 1e-6, r, p)
        f = np.floor(p).astype(np.int64); ce = np.ceil(p).astype(np.int64)
        ok = (f >= 0).all(1) & (ce[:, 0] < n[0]) & (ce[:, 1] < n[1]) & (ce[:, 2] < n[2])
        val = np.zeros(len(p), np.float64); f, p = f[ok], p[ok]; rr = p - f; f1 = np.minimum(f + 1, n - 1); acc = 0
        for dx in (0, 1):
            for dy in (0, 1):
                for dz in (0, 1):
                    w = (rr[:, 0] if dx else 1 - rr[:, 0]) * (rr[:, 1] if dy else 1 - rr[:, 1]) * (rr[:, 2] if dz else 1 - rr[:, 2])
                    acc = acc + w * d[(f1 if dx else f)[:, 0], (f1 if dy else f)[:, 1], (f1 if dz else f)[:, 2]]
        val[ok] = acc
        out[k0:k0 + 16] = np.clip(scale * (val - smin), 0, 255).astype(np.uint8).reshape(16, 256, 256)   # troncature (Uint8Array)
    out = out.transpose(2, 1, 0)
    return out, A
mode, src, dst = sys.argv[1:4]
img = nib.load(src)
if mode == 'resample':   # t1_c → RAS oblique 1,2 mm, int16 avec scl_slope (contrôle non trivial de conform)
    d = np.asanyarray(img.dataobj).astype(np.float64)
    th = np.deg2rad(8); R = np.array([[np.cos(th), -np.sin(th), 0], [np.sin(th), np.cos(th), 0], [0, 0, 1]]) @ np.array([[1, 0, 0], [0, np.cos(th/2), -np.sin(th/2)], [0, np.sin(th/2), np.cos(th/2)]])
    # centre conform (affine·dims/2) identique à celui de t1_c → la grille conformée retombe sur celle de t1_c
    shape = (180, 200, 170); B = np.eye(4); B[:3, :3] = R * 1.2
    B[:3, 3] = img.affine.dot([128, 128, 128, 1])[:3] - B[:3, :3].dot(np.array(shape) / 2)
    v2v = np.linalg.inv(img.affine) @ B
    out = affine_transform(d, v2v[:3, :3], offset=v2v[:3, 3], output_shape=shape, order=1) * 4.0 + 10.0
    hd = nib.Nifti1Header(); hd.set_data_dtype(np.int16)
    im2 = nib.Nifti1Image(np.round((out - 10.0) / 0.5).astype(np.int16), B, hd); im2.header.set_slope_inter(0.5, 10.0)
    im2.set_qform(B, 1); im2.set_sform(B, 1); nib.save(im2, dst)
else:
    data, A = (fastsurfer if mode == 'fastsurfer' else niivue)(img)
    o = nib.Nifti1Image(data, A); o.set_sform(A, 2); nib.save(o, dst)
print('ok')
`);
const py = (...a) => execFileSync('python3', ['-I', PY, ...a], { encoding: 'utf8' }).trim();
async function cmpConf(js, file, label) {
  // copie en Uint8Array : SV.Nifti.read sur un Buffer Node d'un .nii non compressé lit l'en-tête comme des données
  // (Buffer.slice est une vue, puis new T(raw.buffer) reprend tout le fichier) — défaut de src/nifti.js signalé
  const ref = await SV.Nifti.read(new Uint8Array(fs.readFileSync(file))); let diff = 0, mx = 0;
  for (let i = 0; i < js.data.length; i++) { const e = Math.abs(js.data[i] - ref.data[i]); if (e) { diff++; mx = Math.max(mx, e); } }
  let ea = 0; for (let i = 0; i < 16; i++) ea = Math.max(ea, Math.abs(js.affine[i] - ref.affine[i]));
  ok(ea < 1e-3 && diff <= js.data.length * 1e-3 && mx <= 1, `${label} : affine max|Δ| ${ea.toExponential(1)}, ${diff} voxels ≠ (max ${mx})`);
}
if (PARTS.has(3)) hdr('3. conform (niivue / FastSurfer) vs Niivue.conform() (niivue 0.62.1) et références Python (nibabel + scipy)');
const corr = (a, b, m) => { let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0; for (let i = 0; i < a.length; i++) { if (m && !m[i]) continue; n++; sa += a[i]; sb += b[i]; saa += a[i] * a[i]; sbb += b[i] * b[i]; sab += a[i] * b[i]; } return (sab - sa * sb / n) / Math.sqrt((saa - sa * sa / n) * (sbb - sb * sb / n)); };
if (PARTS.has(3)) {
  let t0 = performance.now();
  const id = M.conform(t1c), idf = M.conform(t1c, { force: true });
  let d1 = 0, d2 = 0; for (let i = 0; i < t1c.data.length; i++) { d1 += id.data[i] !== t1c.data[i]; d2 += idf.data[i] !== t1c.data[i]; }
  let ea = 0; for (let i = 0; i < 16; i++) ea = Math.max(ea, Math.abs(idf.affine[i] - t1c.affine[i]));
  ok(M.isConformed(t1c) && d1 === 0 && d2 === 0 && ea < 1e-4, `t1_c déjà conformé : copie (${d1} diff.) ; conform forcé = identité (${d2} diff., affine max|Δ| ${ea.toExponential(1)}) (${elapsed(t0)})`);
  py('resample', T1C, OUT + '/t1c_ras12_obl.nii.gz');
  const rs = await SV.Nifti.read(fs.readFileSync(OUT + '/t1c_ras12_obl.nii.gz'));
  ok(!M.isConformed(rs), `image rééchantillonnée RAS oblique 1,2 mm ${rs.dims.join('×')} int16 (pente ${rs.slope}, ordonnée ${rs.inter})`);
  for (const mode of ['niivue', 'fastsurfer']) {
    t0 = performance.now(); const c = M.conform(rs, { mode }), tj = elapsed(t0);
    const brain = new Uint8Array(t1c.data.length); for (let i = 0; i < brain.length; i++) brain[i] = t1c.data[i] > 20;
    const rAll = corr(c.data, t1c.data), rBrain = corr(c.data, t1c.data, brain);
    ok(rAll > 0.98, `conform ${mode} (RAS 1,2 mm oblique → 256³ LIA) vs t1_c d'origine : r = ${fmt(rAll, 4)} (tête r = ${fmt(rBrain, 4)}) (${tj})`);
    py(mode, OUT + '/t1c_ras12_obl.nii.gz', OUT + '/conf_ref_' + mode + '.nii.gz');
    await cmpConf(c, OUT + '/conf_ref_' + mode + '.nii.gz', `conform ${mode} = référence Python (image int16 oblique)`);
    if (mode === 'niivue') {
      execFileSync(process.execPath, [new URL(import.meta.url).pathname, '--niivue-child', OUT + '/t1c_ras12_obl.nii.gz', OUT + '/conf_niivue_obl.nii']);
      await cmpConf(c, OUT + '/conf_niivue_obl.nii', 'conform niivue = Niivue.conform() de niivue 0.62.1 (image int16 oblique)');
    }
  }
  const mni = await SV.Nifti.read(fs.readFileSync(MNI));
  for (const mode of ['niivue', 'fastsurfer']) {
    py(mode, MNI, OUT + '/mni_ref_' + mode + '.nii.gz');
    const c = M.conform(mni, { mode });
    await cmpConf(c, OUT + '/mni_ref_' + mode + '.nii.gz', `conform ${mode} = référence Python (MNI152 uint8 RAS 197×233×189)`);
    if (mode === 'niivue') {
      execFileSync(process.execPath, [new URL(import.meta.url).pathname, '--niivue-child', MNI, OUT + '/conf_niivue_mni.nii']);
      await cmpConf(c, OUT + '/conf_niivue_mni.nii', 'conform niivue = Niivue.conform() de niivue 0.62.1 (MNI152)');
    }
  }
}
if (ARGS.has('--fast')) finish();

// ======================================================================= 4. chaîne complète 104 classes sur t1_c
const LUT104 = models.m104.labels;
/** pic de mémoire résidente du processus (fil principal + workers worker_threads) : minuterie + appels de progression */
function memProbe() { let peak = 0; const f = () => { peak = Math.max(peak, process.memoryUsage().rss); }, t = setInterval(f, 200); return { sample: f, stop: () => { clearInterval(t); f(); return peak; } }; }
function timingTable(res) {
  const rows = res.timings.filter(t => t.layer !== 'postprocess');
  console.log('    modèle             couche   C_in→C_out  dil  tête  ms      moteur');
  for (const t of rows) console.log(`    ${t.model.padEnd(18)} ${String(t.layer).padEnd(8)} ${String(t.inC).padStart(4)}→${String(t.outC).padEnd(5)} ${String(t.dil).padStart(4)}  ${t.fusedHead ? 'oui ' : '    '}  ${String(t.ms).padStart(6)}  ${t.engine || ''}`);
  const pp = res.timings.find(t => t.layer === 'postprocess'); if (pp) console.log('    post-traitement (composante 26-connexe) : ' + pp.ms + ' ms');
}
/** effectifs et centroïdes par classe ; contrôles anatomiques en coordonnées monde (repère MNI ou scanner proche du MNI) */
function anatomy(res, tag) {
  const st = M.labelStats(res.labels, res.dims, res.affine, LUT104), by = new Map(st.map(s => [s.name, s]));
  console.log('    étiquette                         voxels   centroïde monde (mm)');
  for (const s of st) console.log(`    ${String(s.index).padStart(3)} ${s.name.padEnd(30)} ${String(s.count).padStart(7)}   ${s.centroid ? s.centroid.map(v => v.toFixed(1).padStart(6)).join(' ') : '—'}`);
  const missing = st.filter(s => !s.count).map(s => s.name); ok(missing.length <= 2, `${tag} : ${st.length - missing.length}/103 classes présentes${missing.length ? ' (absentes : ' + missing.join(', ') + ')' : ''}`);
  const side = st.filter(s => s.count && /^(ctx-lh-|ctx-rh-|Left-|Right-)/.test(s.name));
  const bad = side.filter(s => (/^(ctx-lh-|Left-)/.test(s.name) ? !(s.centroid[0] < 0) : !(s.centroid[0] > 0))).map(s => s.name);
  ok(!bad.length, `${tag} : ${side.length} classes latéralisées, gauches x < 0 et droites x > 0 (monde RAS)${bad.length ? ' — en défaut : ' + bad.join(', ') : ''}`);
  for (const n of ['Left-Hippocampus', 'Right-Hippocampus', 'Left-Amygdala', 'Right-Amygdala']) {
    const c = by.get(n).centroid, ax = Math.abs(c[0]);
    ok(c[2] < 0 && ax >= 20 && ax <= 35 && Math.sign(c[0]) === (n.startsWith('Left') ? -1 : 1), `${tag} : ${n} centroïde (${c.map(v => v.toFixed(1)).join(', ')}) : |x| = ${ax.toFixed(1)} mm, z = ${c[2].toFixed(1)} mm`);
  }
  const big = st.slice().sort((a, b) => b.count - a.count).slice(0, 2).map(s => s.name);
  ok(big.every(n => /Cerebral-White-Matter/.test(n)), `${tag} : deux plus grandes classes = ${big.join(', ')}`);
  return { st, by };
}
// classes tissulaires de labels.nii.gz (vérifié par recouvrement) : 1 = SG (cortex, noyaux gris, diencéphale ventral, cortex
// cérébelleux), 2 = SB (SB cérébrale et cérébelleuse, tronc cérébral, corps calleux)
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const GM = new Set([...range(1, 84), 97, 98]), WM = new Set([85, 86, 94, 95, 96, ...range(99, 103)]);
async function dice(labels) {
  const R = (await SV.Nifti.read(fs.readFileSync(LAB))).data, out = {};
  for (const [nm, cls, set] of [['SG', 1, GM], ['SB', 2, WM], ['cortex seul (1–68) vs classe 1', 1, new Set(range(1, 68))], ['SB cérébrale seule (85–86) vs classe 2', 2, new Set([85, 86])]]) {
    let a = 0, b = 0, ab = 0; for (let i = 0; i < R.length; i++) { const x = R[i] === cls, y = set.has(labels[i]); a += x; b += y; ab += x && y; }
    out[nm] = 2 * ab / (a + b);
  }
  return out;
}
/** accord voxel à voxel avec une segmentation de référence brainchop (voxels non nuls dans l'une ou l'autre) */
async function compareRef(file, A, tag) {
  const R = (await SV.Nifti.read(fs.readFileSync(file))).data, nR = new Float64Array(256), nA = new Float64Array(256), nRA = new Float64Array(256);
  let fg = 0, diff = 0;
  for (let i = 0; i < R.length; i++) { const r = R[i], a = A[i]; if (!r && !a) continue; fg++; if (r !== a) diff++; nR[r]++; nA[a]++; if (r === a) nRA[r]++; }
  const dices = []; for (let l = 1; l < 256; l++) if (nR[l] + nA[l]) dices.push(2 * nRA[l] / (nR[l] + nA[l]));
  ok(diff <= fg * 1e-3, `${tag} vs brainchop (son propre code, tf.js-CPU) : ${diff}/${fg} voxels non nuls différents (${(100 * diff / fg).toFixed(4)} %) ; Dice par classe : min ${Math.min(...dices).toFixed(4)}, moyenne ${(dices.reduce((a, b) => a + b, 0) / dices.length).toFixed(5)} (${dices.length} classes)`);
}
async function writeLabels(res, file, descrip) { fs.writeFileSync(file, await SV.Nifti.encodeGz({ dims: res.dims, data: res.labels, affine: res.affine, datatype: 2, descrip })); }

let res104;
if (PARTS.has(4)) {
  hdr('4. chaîne complète aparc+aseg 104 sur brainchop v3/data/t1_c.nii.gz (prémodèle model5_gw_ae, ' + (pool ? '2 workers' : 'fil courant') + ')');
  const mem = memProbe(), t0 = performance.now(); let lastMsg = '';
  res104 = await M.segment(t1c, models.m104, { premodel: models.m5, pool, onProgress: (f, m) => { mem.sample(); if (m !== lastMsg) { lastMsg = m; process.stdout.write(`\r    ${(100 * f).toFixed(0).padStart(3)} % ${m}            `); } } });
  const peak = mem.stop(); console.log(`\r    terminé en ${elapsed(t0)} ; pic RSS processus ${(peak / 2 ** 20).toFixed(0)} Mo ; boîte ${JSON.stringify(res104.cropBox)} (${res104.maskSource})`);
  await writeLabels(res104, OUT + '/meshnet_t1c_104.nii.gz', 'EpiScope MeshNet model21_104class');
  timingTable(res104);
  anatomy(res104, 't1_c');   // t1_c : repère scanner déjà proche du MNI
  const D = await dice(res104.labels);
  for (const [k, v] of Object.entries(D)) console.log(`    Dice ${k} : ${v.toFixed(3)}`);
  ok(D.SG > 0.8 && D.SB > 0.8, `Dice vs labels.nii.gz (1 = SG, 2 = SB : intensité T1 moyenne 129 vs 169) : SG ${D.SG.toFixed(3)}, SB ${D.SB.toFixed(3)}`);
  // référence : code brainchop (brainchop-webworker.js, entrée 14 « Aparc+Aseg 104 », prémodèle id 1) exécuté par tf.js-CPU
  const refFile = REF + '/t1c_model21_104class.nii.gz';
  if (ARGS.has('--brainchop-ref') && !fs.existsSync(refFile)) {
    console.log('    exécution du code brainchop avec tf.js-CPU (~20 min)…');
    execFileSync(process.execPath, ['--max-old-space-size=6000', new URL(import.meta.url).pathname, '--brainchop-child', '13', T1C, refFile], { stdio: 'inherit' });
  }
  if (fs.existsSync(refFile)) {
    await compareRef(refFile, res104.labels, 't1_c');
  } else console.log('    (référence brainchop absente : relancer avec --brainchop-ref pour la calculer, ~20 min)');
}

// ======================================================================= 5. image non conformée : MNI152 2009a
if (PARTS.has(5)) {
  hdr('5. MNI152 2009a (RAS 197×233×189, non conformé) : conform → segmentation 104 (fil courant)');
  const mni = await SV.Nifti.read(fs.readFileSync(MNI));
  let t0 = performance.now(); const conf = M.conform(mni); const tc = elapsed(t0);
  const c0 = Mat4.apply(mni.affine, mni.dims[0] / 2, mni.dims[1] / 2, mni.dims[2] / 2), cc = Mat4.apply(conf.affine, 128, 128, 128), oc = SV.Vol.orientation(conf);
  ok(M.isConformed(conf) && Math.hypot(cc[0] - c0[0], cc[1] - c0[1], cc[2] - c0[2]) < 1e-9 && oc.axis.join() === '0,2,1' && oc.sign.join() === '-1,1,-1', `conform : 256³ uint8 LIA (i→G, j→I, k→A), voxel (128,128,128) = affine·dims/2 de l'entrée (${tc})`);
  const mem = memProbe(); t0 = performance.now();
  const res = await M.segment(conf, models.m104, { premodel: models.m5, workers: 0, onProgress: mem.sample });
  const peak = mem.stop(); console.log(`    terminé en ${elapsed(t0)} (fil courant) ; pic RSS ${(peak / 2 ** 20).toFixed(0)} Mo ; boîte ${JSON.stringify(res.cropBox)}`);
  await writeLabels(res, OUT + '/meshnet_mni_104.nii.gz', 'EpiScope MeshNet model21_104class (MNI152 2009a)');
  timingTable(res);
  const { by } = anatomy(res, 'MNI152');
  // centroïdes attendus (MNI, mm) : hippocampes ≈ (±27, −22, −12), amygdales ≈ (±23, −5, −18), thalamus ≈ (±11, −18, 7)
  const exp = { 'Left-Hippocampus': [-27, -22, -12], 'Right-Hippocampus': [27, -22, -12], 'Left-Amygdala': [-23, -5, -18], 'Right-Amygdala': [23, -5, -18], 'Left-Thalamus-Proper*': [-11, -18, 7], 'Right-Thalamus-Proper*': [11, -18, 7] };
  for (const [n, e] of Object.entries(exp)) { const c = by.get(n).centroid, d = Math.hypot(c[0] - e[0], c[1] - e[1], c[2] - e[2]); ok(d < 10, `MNI152 : ${n} à ${d.toFixed(1)} mm du centroïde MNI attendu (${e.join(', ')})`); }
  // référence brainchop complète : Niivue.conform() puis code brainchop (fil principal, tf.js-CPU) sur l'image conformée
  const refFile = REF + '/mni_model21_104class.nii.gz';
  if (ARGS.has('--brainchop-ref') && !fs.existsSync(refFile)) {
    execFileSync(process.execPath, [new URL(import.meta.url).pathname, '--niivue-child', MNI, OUT + '/conf_niivue_mni.nii']);
    console.log('    exécution du code brainchop avec tf.js-CPU sur le MNI conformé par niivue (~30 min)…');
    execFileSync(process.execPath, ['--max-old-space-size=6000', new URL(import.meta.url).pathname, '--brainchop-child', '13', OUT + '/conf_niivue_mni.nii', refFile], { stdio: 'inherit' });
  }
  if (fs.existsSync(refFile)) await compareRef(refFile, res.labels, 'MNI152 (Niivue.conform + brainchop)');
  else console.log('    (référence brainchop MNI absente : --brainchop-ref pour la calculer)');
}
// ======================================================================= 6. autres modèles (sur demande : --parts=6)
if (PARTS.has(6)) {
  hdr('6. autres modèles sur t1_c (recadrage par seuil, sans prémodèle) : mindgrab, model30chan18cls');
  const R = (await SV.Nifti.read(fs.readFileSync(LAB))).data;
  // masque mindgrab : il contient aussi le LCR (ventricules, sillons) → on contrôle la couverture de SG ∪ SB (labels > 0)
  for (const [key, file, check] of [['mg', 'meshnet_t1c_mindgrab.nii.gz', lab => { let a = 0, ab = 0, b = 0; for (let i = 0; i < R.length; i++) { const x = R[i] > 0, y = lab[i] > 0; a += x; b += y; ab += x && y; } return [`couverture de SG ∪ SB (labels.nii.gz > 0) par le masque (${(b / 1000).toFixed(0)} cm³)`, ab / a, 0.97]; }],
    ['m18', 'meshnet_t1c_18cls.nii.gz', lab => { let a = 0, b = 0, ab = 0; for (let i = 0; i < R.length; i++) { const x = R[i] === 2, y = lab[i] === 1 || lab[i] === 5 || lab[i] === 13; a += x; b += y; ab += x && y; } return ['SB (SB cérébrale + cérébelleuse + tronc) vs classe 2', 2 * ab / (a + b), 0.85]; }]]) {
    const sp = models[key], mem = memProbe(), t0 = performance.now();
    const res = await M.segment(t1c, sp, { pool, onProgress: mem.sample });
    const peak = mem.stop(), bx = res.cropBox.max.map((v, d) => v - res.cropBox.min[d] + 1);
    await writeLabels(res, OUT + '/' + file, 'EpiScope MeshNet ' + sp.name);
    const cnt = new Float64Array(256); for (const l of res.labels) cnt[l]++;
    const [nm, dv, thr] = check(res.labels);
    console.log(`    ${sp.name} : ${elapsed(t0)}, boîte ${bx.join('×')} (${res.maskSource}), pic RSS ${(peak / 2 ** 20).toFixed(0)} Mo ; classes ${sp.labels.map((n, i) => n + ' ' + cnt[i]).slice(1).join(', ')}`);
    ok(dv > thr, `${sp.name} : Dice ${nm} = ${dv.toFixed(3)}`);
  }
}
// ======================================================================= 7. navigateur réel (sur demande : --parts=7)
if (PARTS.has(7)) {
  hdr('7. Chromium (Playwright) : page file://, Web Workers Blob, WebAssembly — chaîne 104 sur t1_c');
  const D = OUT + '/meshnet_browser', fnv = L => { let h = 2166136261; for (let i = 0; i < L.length; i++) { h ^= L[i]; h = Math.imul(h, 16777619) >>> 0; } return h.toString(16); };
  fs.mkdirSync(D, { recursive: true });
  fs.writeFileSync(D + '/models.js', 'window.MODELS = {m104: ' + fs.readFileSync(path.join(ROOT, 'assets/models/model21_104class.json'), 'utf8') + ', m5: ' + fs.readFileSync(path.join(ROOT, 'assets/models/model5_gw_ae.json'), 'utf8') + '};');
  fs.writeFileSync(D + '/t1c.js', 'window.T1C_B64 = "' + Buffer.from(await SV.Nifti.gunzip(fs.readFileSync(T1C))).toString('base64') + '";');
  fs.writeFileSync(D + '/index.html', `<!doctype html><meta charset="utf-8"><title>MeshNet</title>
${['src/nifti.js', 'src/work.js', 'src/imaging/meshnet.js'].map(f => `<script src="file://${path.join(ROOT, f)}"></script>`).join('')}<script src="models.js"></script><script src="t1c.js"></script>
<script>(async () => { const out = { work: SV.Work.available }; try {
  const b = atob(T1C_B64), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
  const t0 = performance.now(), r = await SV.MeshNet.segment(SV.Nifti.parse(u), SV.MeshNet.loadModel(MODELS.m104), { premodel: SV.MeshNet.loadModel(MODELS.m5), workers: 2 });
  out.ms = Math.round(performance.now() - t0); out.workers = r.workers; out.engines = [...new Set(r.timings.map(t => t.engine).filter(Boolean))];
  let h = 2166136261; for (let i = 0; i < r.labels.length; i++) { h ^= r.labels[i]; h = Math.imul(h, 16777619) >>> 0; } out.hash = h.toString(16);
} catch (e) { out.error = String(e && e.stack || e); } window.RESULT = out; })();</script>`);
  fs.writeFileSync(D + '/run.py', `import json\nfrom playwright.sync_api import sync_playwright\nwith sync_playwright() as p:\n    b = p.chromium.launch(); pg = b.new_page(); pg.goto('file://${D}/index.html')\n    pg.wait_for_function('window.RESULT !== undefined', timeout=1200000, polling=1000)\n    r = pg.evaluate('window.RESULT'); r['ua'] = pg.evaluate('navigator.userAgent'); print(json.dumps(r)); b.close()\n`);
  const r = JSON.parse(execFileSync('python3', [D + '/run.py'], { encoding: 'utf8', maxBuffer: 1 << 24 }).trim().split('\n').pop());
  const ref = res104 ? fnv(res104.labels) : fnv((await SV.Nifti.read(fs.readFileSync(OUT + '/meshnet_t1c_104.nii.gz'))).data);
  ok(!r.error && r.work && r.workers === 2 && r.engines.join() === 'wasm' && r.hash === ref, `${(r.ua || '').match(/\w*Chrome\/[\d.]+/)} : ${r.error || `${r.workers} workers Blob, moteur ${r.engines}, ${(r.ms / 1000).toFixed(1)} s, empreinte ${r.hash} (Node ${ref})`}`);
}
finish();

function finish() {
  if (pool) pool.close();
  console.log(`\n${nOk} contrôles réussis, ${nFail} échec(s)`);
  process.exit(nFail ? 1 : 0);
}
