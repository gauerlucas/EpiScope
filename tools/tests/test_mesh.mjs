// node tools/tests/test_mesh.mjs [--quick] — imaging/volops.js + imaging/mesh.js (depuis la racine du dépôt)
//   (a) sphère / ellipsoïde analytiques  (b) tore  (c) décimation (variété, Hausdorff, temps)  (d) données réelles
//   (hémisphères lh/rh, OBJ/GIfTI/PNG dans /tmp/claude-0)  (e) EDT / nearestLabelFill / morphologie vs scipy
//   (f) composantes vs scipy.ndimage.label ; + E/S (GIfTI via nibabel, pack), structures, isosurface CT, injection worker.
// --quick : saute la partie (d).
import fs from 'fs'; import vm from 'vm'; import { execFileSync } from 'child_process';
globalThis.window = undefined;
for (const f of ['src/nifti.js', 'src/imaging/volops.js', 'src/imaging/mesh.js']) vm.runInThisContext(fs.readFileSync(f, 'utf8'), { filename: f });
const SV = globalThis.SV, M = SV.Mesh, VO = SV.VolOps;
const OUT = '/tmp/claude-0', TMP = OUT + '/meshtest'; fs.mkdirSync(TMP, { recursive: true });
const QUICK = process.argv.includes('--quick');
const LABELS = '/home/claude/neuroneural/brainchop/v3/data/labels.nii.gz';
let nFail = 0, nOk = 0;
const check = (name, ok, info) => { console.log((ok ? '  ok   ' : '  FAIL ') + name + (info ? '  — ' + info : '')); if (ok) nOk++; else nFail++; };
const section = s => console.log('\n## ' + s);
const T = fn => { const t = performance.now(), c = process.cpuUsage(), r = fn(), u = process.cpuUsage(c); return [r, Math.round(performance.now() - t), Math.round((u.user + u.system) / 1000)]; };
const pct = x => (100 * x).toFixed(3) + ' %';
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function field(dims, f) { const [nx, ny, nz] = dims, d = new Float32Array(nx * ny * nz); for (let k = 0, o = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++, o++) d[o] = f(i, j, k); return d; }
function py(code, args) { return execFileSync('python3', ['-c', code, ...(args || [])], { encoding: 'utf8', maxBuffer: 1 << 26 }).trim(); }
const topoStr = t => `V=${t.V} E=${t.E} F=${t.F} χ=${t.euler} bord=${t.boundaryEdges} nonvar=${t.nonManifoldEdges}+${t.nonManifoldVertices}s orient=${t.flippedEdges} comp=${t.components}`;
const isClosedManifold = t => t.closed && t.manifold;
/** normales sortantes : volume signé > 0 et normales de sommets orientées vers l'extérieur (fonction de test) */
function outward(mesh, dirFn) { const N = M.normals(mesh.pos, mesh.faces); let bad = 0; for (let v = 0; v < N.length / 3; v++) { const d = dirFn(mesh.pos[3 * v], mesh.pos[3 * v + 1], mesh.pos[3 * v + 2]); if (N[3 * v] * d[0] + N[3 * v + 1] * d[1] + N[3 * v + 2] * d[2] <= 0) bad++; } return bad; }

// ---------------------------------------------------------------- distance point–maillage (grille uniforme)
function ptTri2(p, a, b, c) {   // Ericson, Real-Time Collision Detection 5.1.5 ; carré de la distance
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2], d2 = q => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
  const at = (s, t) => [a[0] + s * ab[0] + t * ac[0], a[1] + s * ab[1] + t * ac[1], a[2] + s * ab[2] + t * ac[2]];
  const d1 = dot(ab, ap), d2_ = dot(ac, ap); if (d1 <= 0 && d2_ <= 0) return d2(a);
  const bp = [p[0] - b[0], p[1] - b[1], p[2] - b[2]], d3 = dot(ab, bp), d4 = dot(ac, bp); if (d3 >= 0 && d4 <= d3) return d2(b);
  const vc = d1 * d4 - d3 * d2_; if (vc <= 0 && d1 >= 0 && d3 <= 0) return d2(at(d1 / (d1 - d3), 0));
  const cp = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], d5 = dot(ab, cp), d6 = dot(ac, cp); if (d6 >= 0 && d5 <= d6) return d2(c);
  const vb = d5 * d2_ - d1 * d6; if (vb <= 0 && d2_ >= 0 && d6 <= 0) return d2(at(0, d2_ / (d2_ - d6)));
  const va = d3 * d6 - d5 * d4; if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return d2([b[0] + w * (c[0] - b[0]), b[1] + w * (c[1] - b[1]), b[2] + w * (c[2] - b[2])]); }
  const den = 1 / (va + vb + vc); return d2(at(vb * den, vc * den));
}
function meshDistance(mesh, h) {
  const P = mesh.pos, F = mesh.faces, lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], P[i + k]); hi[k] = Math.max(hi[k], P[i + k]); }
  const g = [0, 1, 2].map(k => Math.max(1, Math.ceil((hi[k] - lo[k]) / h))), cells = new Map(), key = (a, b, c) => a + g[0] * (b + g[1] * c), cl = (x, k) => Math.max(0, Math.min(g[k] - 1, Math.floor((x - lo[k]) / h)));
  for (let f = 0; f < F.length / 3; f++) {
    const v = [0, 1, 2].map(q => [P[3 * F[3 * f + q]], P[3 * F[3 * f + q] + 1], P[3 * F[3 * f + q] + 2]]), a = [0, 1, 2].map(k => cl(Math.min(v[0][k], v[1][k], v[2][k]), k)), b = [0, 1, 2].map(k => cl(Math.max(v[0][k], v[1][k], v[2][k]), k));
    for (let z = a[2]; z <= b[2]; z++) for (let y = a[1]; y <= b[1]; y++) for (let x = a[0]; x <= b[0]; x++) { const K = key(x, y, z); let L = cells.get(K); if (!L) cells.set(K, L = []); L.push(f); }
  }
  const tri = f => [0, 1, 2].map(q => [P[3 * F[3 * f + q]], P[3 * F[3 * f + q] + 1], P[3 * F[3 * f + q] + 2]]);
  return p => {
    const c = [0, 1, 2].map(k => cl(p[k], k)); let best = Infinity;
    for (let r = 0; r < Math.max(...g); r++) {
      for (let z = c[2] - r; z <= c[2] + r; z++) for (let y = c[1] - r; y <= c[1] + r; y++) for (let x = c[0] - r; x <= c[0] + r; x++) {
        if (Math.max(Math.abs(x - c[0]), Math.abs(y - c[1]), Math.abs(z - c[2])) !== r || x < 0 || y < 0 || z < 0 || x >= g[0] || y >= g[1] || z >= g[2]) continue;
        const L = cells.get(key(x, y, z)); if (L) for (const f of L) { const [a, b, cc] = tri(f); best = Math.min(best, ptTri2(p, a, b, cc)); }
      }
      if (best <= (r * h) ** 2) break;
    }
    return Math.sqrt(best);
  };
}
function hausdorff(A, B, maxSamples) {
  const dA = meshDistance(A, 3), dB = meshDistance(B, 3); let ab = 0, ba = 0, sab = 0, nab = 0;
  const stepB = Math.max(1, Math.floor(B.pos.length / 3 / (maxSamples || 1e9))), stepA = Math.max(1, Math.floor(A.pos.length / 3 / (maxSamples || 1e9)));
  for (let v = 0; v < B.pos.length / 3; v += stepB) { const d = dA([B.pos[3 * v], B.pos[3 * v + 1], B.pos[3 * v + 2]]); ab = Math.max(ab, d); sab += d; nab++; }
  for (let v = 0; v < A.pos.length / 3; v += stepA) ba = Math.max(ba, dB([A.pos[3 * v], A.pos[3 * v + 1], A.pos[3 * v + 2]]));
  return { max: Math.max(ab, ba), meanBtoA: sab / nab };
}

// =====================================================================  (a) sphère et ellipsoïde
section('(a) sphère / ellipsoïde analytiques (grille 1 mm)');
{
  const n = 64, dims = [n, n, n], c = [31.37, 32.11, 30.73];
  for (const R of [10, 20, 28]) {
    const f = field(dims, (i, j, k) => R - Math.hypot(i - c[0], j - c[1], k - c[2]));
    const [m, ms] = T(() => M.marchingCubes(f, dims, 0, null)), t = M.topology(m);
    const eA = M.area(m.pos, m.faces) / (4 * Math.PI * R * R) - 1, eV = M.volume(m.pos, m.faces) / (4 / 3 * Math.PI * R ** 3) - 1;
    const bad = outward(m, (x, y, z) => [x - c[0], y - c[1], z - c[2]]);
    check(`sphère R=${R} : aire, volume < 2 %`, Math.abs(eA) < 0.02 && Math.abs(eV) < 0.02, `aire ${pct(eA)}, volume ${pct(eV)}, ${ms} ms`);
    check(`sphère R=${R} : fermée, variété, χ=2, normales sortantes`, isClosedManifold(t) && t.euler === 2 && t.components === 1 && bad === 0, topoStr(t) + `, normales rentrantes ${bad}`);
  }
  // affine LIA (déterminant < 0, comme le volume réel) : l'orientation doit rester sortante
  const R = 20, f = field(dims, (i, j, k) => R - Math.hypot(i - c[0], j - c[1], k - c[2])), LIA = [-1, 0, 0, 127, 0, 0, 1, -145.5, 0, -1, 0, 147, 0, 0, 0, 1];
  const m = M.marchingCubes(f, dims, 0, LIA), W = SV.Mat4.apply(LIA, ...c), bad = outward(m, (x, y, z) => [x - W[0], y - W[1], z - W[2]]);
  check('sphère sous affine LIA (det < 0) : volume > 0, normales sortantes', M.volume(m.pos, m.faces) > 0 && bad === 0, `volume ${M.volume(m.pos, m.faces).toFixed(0)} mm³, rentrantes ${bad}`);
  // ellipsoïde : aire de référence par intégration numérique
  const [a, b, cc] = [25, 18, 12], e = [33.3, 31.6, 32.2], nd = [70, 66, 64];
  let Aref = 0; const NT = 3000, NP = 6000;
  for (let it = 0; it < NT; it++) { const th = (it + 0.5) * Math.PI / NT, st = Math.sin(th), ct = Math.cos(th); for (let ip = 0; ip < NP; ip++) { const ph = (ip + 0.5) * 2 * Math.PI / NP; Aref += st * Math.sqrt(b * b * cc * cc * st * st * Math.cos(ph) ** 2 + a * a * cc * cc * st * st * Math.sin(ph) ** 2 + a * a * b * b * ct * ct); } }
  Aref *= (Math.PI / NT) * (2 * Math.PI / NP);
  const fe = field(nd, (i, j, k) => 1 - Math.sqrt(((i - e[0]) / a) ** 2 + ((j - e[1]) / b) ** 2 + ((k - e[2]) / cc) ** 2));
  const me = M.marchingCubes(fe, nd, 0, null), te = M.topology(me), eA = M.area(me.pos, me.faces) / Aref - 1, eV = M.volume(me.pos, me.faces) / (4 / 3 * Math.PI * a * b * cc) - 1;
  check('ellipsoïde 25×18×12 : aire, volume < 2 %', Math.abs(eA) < 0.02 && Math.abs(eV) < 0.02, `aire ${pct(eA)} (réf. ${Aref.toFixed(1)} mm²), volume ${pct(eV)}`);
  check('ellipsoïde : fermée, variété, χ=2', isClosedManifold(te) && te.euler === 2, topoStr(te));
  // boule binaire (masque) → flou 0.8 → MC 0.5 : cas réel des segmentations
  const mask = Uint8Array.from(field(dims, (i, j, k) => (i - c[0]) ** 2 + (j - c[1]) ** 2 + (k - c[2]) ** 2 <= R * R ? 1 : 0));
  const mb = M.marchingCubes(VO.gaussian(mask, dims, 0.8, { border: 'zero' }), dims, 0.5, null), tb = M.topology(mb);
  const eAb = M.area(mb.pos, mb.faces) / (4 * Math.PI * R * R) - 1, eVb = M.volume(mb.pos, mb.faces) / (4 / 3 * Math.PI * R ** 3) - 1;
  const sm = M.smoothTaubin(mb.pos, mb.faces, 10), eAs = M.area(sm, mb.faces) / (4 * Math.PI * R * R) - 1, eVs = M.volume(sm, mb.faces) / (4 / 3 * Math.PI * R ** 3) - 1;
  check('boule binaire R=20 + flou σ=0.8 + MC : aire, volume < 2 %', Math.abs(eAb) < 0.02 && Math.abs(eVb) < 0.02 && isClosedManifold(tb) && tb.euler === 2, `aire ${pct(eAb)}, volume ${pct(eVb)} ; après Taubin×10 : aire ${pct(eAs)}, volume ${pct(eVs)}`);
  // champs aléatoires : tous les cas ambigus ; variété fermée orientée pour les trois règles de face
  for (const amb of ['decider', 'separate', 'join']) {
    let ok = true, info = ''; for (let s = 1; s <= 3; s++) {
      const r = rng(s), d = [24 + s, 23, 22]; const g = field(d, () => r() - 0.5);
      const m = M.marchingCubes(g, d, 0, null, null, { ambiguity: amb }), t = M.topology(m); ok = ok && isClosedManifold(t); info = topoStr(t);
    }
    check(`bruit blanc (3 tirages), faces ambiguës '${amb}' : fermée, variété, orientée`, ok, 'dernier : ' + info);
  }
  // correction topologique + MC 'separate' ⇒ genre 0 garanti, même pour des masques très irréguliers
  { let ok = true, info = []; for (let s = 1; s <= 4; s++) {
      const r = rng(100 + s), d = [40, 40, 40], noise = field(d, () => r());
      const sm = VO.gaussian(noise, d, 1.2), bl = field(d, (i, j, k) => sm[i + 40 * (j + 40 * k)] + 0.6 - 0.004 * ((i - 20) ** 2 + (j - 20) ** 2 + (k - 20) ** 2) / 4);
      const mk = VO.keepLargest(VO.threshold(bl, 0.5), d), t0 = M.topology(M.marchingCubes(Float32Array.from(mk), d, 0.5, null, null, { ambiguity: 'separate' }));
      const g = VO.topoCorrect(mk, d), mc = M.marchingCubes(Float32Array.from(g.mask), d, 0.5, null, null, { ambiguity: 'separate' }), t = M.topology(mc);
      ok = ok && isClosedManifold(t) && t.euler === 2 && t.components === 1; info.push(`χ ${t0.euler}→${t.euler} (+${g.added}/−${g.removed} vox)`);
    }
    check('masques aléatoires : topoCorrect + MC separate ⇒ sphère topologique (χ=2)', ok, info.join(', ')); }
}

// =====================================================================  (b) tore
section('(b) tore');
{
  const Rt = 20, rt = 7, n = 64, dims = [n, n, 32], c = [32.2, 31.7, 15.6];
  const f = field(dims, (i, j, k) => rt - Math.hypot(Math.hypot(i - c[0], j - c[1]) - Rt, k - c[2]));
  const m = M.marchingCubes(f, dims, 0, null), t = M.topology(m);
  const eA = M.area(m.pos, m.faces) / (4 * Math.PI ** 2 * Rt * rt) - 1, eV = M.volume(m.pos, m.faces) / (2 * Math.PI ** 2 * Rt * rt * rt) - 1;
  check('tore R=20 r=7 : χ=0 (genre 1), fermé, variété', isClosedManifold(t) && t.euler === 0 && t.genus === 1, topoStr(t));
  check('tore : aire, volume < 2 %', Math.abs(eA) < 0.02 && Math.abs(eV) < 0.02, `aire ${pct(eA)}, volume ${pct(eV)}`);
  const tor = VO.threshold(f, 0), g = VO.topoCorrect(tor, dims), mg = M.marchingCubes(Float32Array.from(g.mask), dims, 0.5, null, null, { ambiguity: 'separate' }), tg = M.topology(mg);
  check('tore binaire : topoCorrect ⇒ χ=2 (anse coupée ou bouchée)', tg.euler === 2 && isClosedManifold(tg), `+${g.added} / −${g.removed} voxels`);
}

// =====================================================================  (c) décimation
section('(c) décimation (Garland–Heckbert)');
{
  const n = 100, dims = [n, n, n], c = [49.6, 50.3, 49.2], R = 44;
  const sph = M.marchingCubes(field(dims, (i, j, k) => R - Math.hypot(i - c[0], j - c[1], k - c[2])), dims, 0, null);
  for (const frac of [0.25, 0.05]) {
    const tgt = Math.round(sph.faces.length / 3 * frac), [d, ms, cpu] = T(() => M.decimate(sph.pos, sph.faces, tgt)), t = M.topology(d);
    let dev = 0; for (let v = 0; v < d.pos.length / 3; v++) dev = Math.max(dev, Math.abs(Math.hypot(d.pos[3 * v] - c[0], d.pos[3 * v + 1] - c[1], d.pos[3 * v + 2] - c[2]) - R));
    const H = hausdorff(sph, d, 20000), bad = outward(d, (x, y, z) => [x - c[0], y - c[1], z - c[2]]);
    check(`sphère R=44 ${sph.faces.length / 3} → ${t.F} faces : variété fermée χ=2, Hausdorff < 0.3 mm`, isClosedManifold(t) && t.euler === 2 && H.max < 0.3 && bad === 0,
      `Hausdorff ${H.max.toFixed(3)} mm (moy. ${H.meanBtoA.toFixed(4)}), écart au rayon ${dev.toFixed(3)} mm, ${ms} ms (cpu ${cpu})`);
  }
  const Rt = 30, rt = 9, dt = [84, 84, 30], ct = [41.7, 42.2, 14.6];
  const tor = M.marchingCubes(field(dt, (i, j, k) => rt - Math.hypot(Math.hypot(i - ct[0], j - ct[1]) - Rt, k - ct[2])), dt, 0, null);
  const dtor = M.decimate(tor.pos, tor.faces, 3000), tt = M.topology(dtor), Ht = hausdorff(tor, dtor, 20000);
  check(`tore ${tor.faces.length / 3} → ${tt.F} faces : χ=0 conservé, Hausdorff < 0.5 mm`, isClosedManifold(tt) && tt.euler === 0 && Ht.max < 0.5, `Hausdorff ${Ht.max.toFixed(3)} mm`);
}

// =====================================================================  (e) EDT, nearestLabelFill, morphologie vs scipy
section('(e) distances, remplissage par étiquette la plus proche, morphologie, flou — vs scipy.ndimage');
const PYREAD = `
import sys, json, numpy as np, scipy.ndimage as ndi
D = sys.argv[1]; meta = json.load(open(D + '/meta.json')); nx, ny, nz = meta['dims']
rd = lambda n, t: np.fromfile(D + '/' + n, dtype=t).reshape(nz, ny, nx)
`;
{
  const dims = [41, 37, 33], n = dims[0] * dims[1] * dims[2], r = rng(7), D = TMP + '/e'; fs.mkdirSync(D, { recursive: true });
  const feat = new Uint8Array(n), labels = new Uint8Array(n), fillm = new Uint8Array(n), blob = new Uint8Array(n), img = new Float32Array(n);
  for (let v = 0; v < n; v++) { feat[v] = r() < 0.004 ? 1 : 0; labels[v] = r() < 0.01 ? 1 + Math.floor(r() * 5) : 0; fillm[v] = r() < 0.5 ? 1 : 0; img[v] = r() * 100; }
  const sm = VO.gaussian(Float32Array.from(feat.map(() => r())), dims, 1.5); for (let v = 0; v < n; v++) blob[v] = sm[v] > 0.52 ? 1 : 0;
  const sp = [1.0, 1.3, 2.0];
  const e1 = VO.edt(feat, dims, { indices: true }), e2 = VO.edt(feat, dims, { spacing: sp }), e3 = VO.edt(blob, dims, { invert: true, borderFeature: true });
  // validité des indices (égalités possibles) : la distance au voxel renvoyé = distance EDT
  let idxBad = 0; for (let v = 0; v < n; v++) { const u = e1.idx[v], [i, j, k] = [v % dims[0], ((v / dims[0]) | 0) % dims[1], (v / (dims[0] * dims[1])) | 0], [a, b, c] = [u % dims[0], ((u / dims[0]) | 0) % dims[1], (u / (dims[0] * dims[1])) | 0]; if (!feat[u] || (i - a) ** 2 + (j - b) ** 2 + (k - c) ** 2 !== e1.d2[v]) idxBad++; }
  const nl = VO.nearestLabelFill(labels, dims, fillm), nl2 = VO.nearestLabelFill(labels, dims, fillm, { maxDist: 2.5, keepOutside: true });
  const g1 = VO.gaussian(img, dims, 1.2), g2 = VO.gaussian(img, dims, [0.7, 1.5, 0], { border: 'zero' });
  const dil = VO.dilate(blob, dims, 2.5), ero = VO.erode(blob, dims, 1.8), clo = VO.close(blob, dims, 2), opn = VO.open(blob, dims, 1.5), fh = VO.fillHoles(VO.threshold(sm, 0.47), dims);
  const dil6 = VO.dilate(blob, dims, 2, { conn: 6 }), ero26 = VO.erode(blob, dims, 1, { conn: 26 });
  const ds = VO.downsample(img, dims, 2), dsm = VO.downsample(labels, dims, 2, { mode: 'max' });
  const W = (nm, a) => fs.writeFileSync(D + '/' + nm, Buffer.from(a.buffer, a.byteOffset, a.byteLength));
  fs.writeFileSync(D + '/meta.json', JSON.stringify({ dims, sp }));
  W('feat.u8', feat); W('labels.u8', labels); W('fillm.u8', fillm); W('blob.u8', blob); W('img.f32', img); W('sm.f32', sm);
  W('e1.f32', e1.d2); W('e2.f32', e2.d2); W('e3.f32', e3.d2); W('nl.u8', nl); W('nl2.u8', nl2); W('g1.f32', g1); W('g2.f32', g2);
  W('dil.u8', dil); W('ero.u8', ero); W('clo.u8', clo); W('opn.u8', opn); W('fh.u8', fh); W('dil6.u8', dil6); W('ero26.u8', ero26); W('ds.f32', ds.data); W('dsm.u8', dsm.data);
  const res = JSON.parse(py(PYREAD + `
feat = rd('feat.u8', np.uint8); labels = rd('labels.u8', np.uint8); fillm = rd('fillm.u8', np.uint8).astype(bool); blob = rd('blob.u8', np.uint8).astype(bool); img = rd('img.f32', np.float32); sm = rd('sm.f32', np.float32)
sp = meta['sp']; out = {}
d1, ind = ndi.distance_transform_edt(feat == 0, return_indices=True); out['e1'] = float(np.abs(rd('e1.f32', np.float32) - d1**2).max())
d2 = ndi.distance_transform_edt(feat == 0, sampling=[sp[2], sp[1], sp[0]]); out['e2'] = float(np.abs(np.sqrt(rd('e2.f32', np.float32)) - d2).max())
d3 = ndi.distance_transform_edt(np.pad(blob, 1))[1:-1, 1:-1, 1:-1]; out['e3'] = float(np.abs(np.sqrt(rd('e3.f32', np.float32)) - d3).max())
dl, il = ndi.distance_transform_edt(labels == 0, return_indices=True); ref = labels[tuple(il)]
nl = rd('nl.u8', np.uint8)
# correction indépendante des égalités : l'étiquette attribuée doit exister à la distance minimale
ok = 0; tot = 0
for lab in range(1, 6):
    dlab = ndi.distance_transform_edt(labels != lab)
    sel = fillm & (nl == lab); ok += int(np.sum(np.abs(dlab[sel] - dl[sel]) < 1e-4)); tot += int(sel.sum())
out['nl_valid'] = ok / max(1, tot); out['nl_assigned'] = int(np.sum(fillm & (nl > 0))); out['nl_expected'] = int(fillm.sum()); out['nl_outside'] = int(np.sum(~fillm & (nl > 0)))
out['nl_agree'] = float(np.mean(nl[fillm] == ref[fillm]))
nl2 = rd('nl2.u8', np.uint8); exp2 = np.where(fillm, np.where(dl <= 2.5, ref, 0), labels); out['nl2_agree'] = float(np.mean((nl2 == exp2) | (fillm & (dl <= 2.5) & (nl2 > 0))))
out['g1'] = float(np.abs(rd('g1.f32', np.float32) - ndi.gaussian_filter(img.astype(np.float64), 1.2, mode='nearest', truncate=3)).max())
out['g2'] = float(np.abs(rd('g2.f32', np.float32) - ndi.gaussian_filter(img.astype(np.float64), [0, 1.5, 0.7], mode='constant', truncate=3)).max())
def ball(r):
    R = int(np.ceil(r)); z, y, x = np.mgrid[-R:R+1, -R:R+1, -R:R+1]; return (x*x + y*y + z*z) <= r*r + 1e-9
out['dil'] = int((rd('dil.u8', np.uint8).astype(bool) != ndi.binary_dilation(blob, ball(2.5))).sum())
out['ero'] = int((rd('ero.u8', np.uint8).astype(bool) != ndi.binary_erosion(blob, ball(1.8), border_value=0)).sum())
P = 6; clo = ndi.binary_closing(np.pad(blob, P), ball(2))[P:-P, P:-P, P:-P]; out['clo'] = int((rd('clo.u8', np.uint8).astype(bool) != clo).sum())
out['opn'] = int((rd('opn.u8', np.uint8).astype(bool) != ndi.binary_opening(blob, ball(1.5), border_value=0)).sum())
out['fh'] = int((rd('fh.u8', np.uint8).astype(bool) != ndi.binary_fill_holes(sm > 0.47)).sum())
out['dil6'] = int((rd('dil6.u8', np.uint8).astype(bool) != ndi.binary_dilation(blob, ndi.generate_binary_structure(3, 1), iterations=2)).sum())
out['ero26'] = int((rd('ero26.u8', np.uint8).astype(bool) != ndi.binary_erosion(blob, ndi.generate_binary_structure(3, 3), border_value=0)).sum())
ds = rd.__defaults__ if False else None
dz, dy, dx = (nz + 1)//2, (ny + 1)//2, (nx + 1)//2
p = np.pad(img.astype(np.float64), ((0, 2*dz - nz), (0, 2*dy - ny), (0, 2*dx - nx)), constant_values=np.nan)
ref_ds = np.nanmean(p.reshape(dz, 2, dy, 2, dx, 2), axis=(1, 3, 5))
out['ds'] = float(np.abs(np.fromfile(D + '/ds.f32', np.float32).reshape(dz, dy, dx) - ref_ds).max())
pl = np.pad(labels, ((0, 2*dz - nz), (0, 2*dy - ny), (0, 2*dx - nx))); out['dsm'] = int((np.fromfile(D + '/dsm.u8', np.uint8).reshape(dz, dy, dx) != pl.reshape(dz, 2, dy, 2, dx, 2).max(axis=(1, 3, 5))).sum())
print(json.dumps(out))
`, [D]));
  check('EDT exacte (carrés) vs scipy, indices valides', res.e1 < 1e-3 && idxBad === 0, `écart max ${res.e1}, indices invalides ${idxBad}`);
  check('EDT anisotrope (spacing 1, 1.3, 2) vs scipy', res.e2 < 1e-3, `écart max ${res.e2.toExponential(2)} mm`);
  check('EDT inverse avec bord = fond vs scipy (volume bordé)', res.e3 < 1e-3, `écart max ${res.e3}`);
  check('nearestLabelFill : chaque voxel du masque reçoit une étiquette à distance minimale, rien hors masque', res.nl_valid === 1 && res.nl_assigned === res.nl_expected && res.nl_outside === 0, `valides ${(100 * res.nl_valid).toFixed(2)} %, accord exact avec scipy (égalités) ${(100 * res.nl_agree).toFixed(2)} %`);
  check('nearestLabelFill maxDist + keepOutside', res.nl2_agree > 0.999, `accord ${(100 * res.nl2_agree).toFixed(3)} %`);
  check('flou gaussien vs scipy (nearest ; constant + sigma anisotrope)', res.g1 < 1e-3 && res.g2 < 1e-3, `écarts ${res.g1.toExponential(2)}, ${res.g2.toExponential(2)}`);
  check('dilatation / érosion / ouverture (boules) vs scipy', res.dil === 0 && res.ero === 0 && res.opn === 0, `voxels différents ${res.dil}/${res.ero}/${res.opn}`);
  check('fermeture (boule r=2, domaine sans bord) vs scipy (volume bordé)', res.clo === 0, `voxels différents ${res.clo}`);
  check('dilatation 6-connexe ×2, érosion 26-connexe vs scipy', res.dil6 === 0 && res.ero26 === 0, `voxels différents ${res.dil6}/${res.ero26}`);
  check('fillHoles vs scipy.binary_fill_holes', res.fh === 0, `voxels différents ${res.fh}`);
  check('downsample ×2 (moyenne, max ; blocs partiels) vs numpy', res.ds < 1e-3 && res.dsm === 0, `écart ${res.ds.toExponential(2)}, voxels différents ${res.dsm}`);
  // temps sur un volume 256³ réaliste
  if (fs.existsSync(LABELS)) {
    const vol = await SV.Nifti.read(fs.readFileSync(LABELS)), gm = VO.maskOf(vol.data, [1]);
    const [, ms, cpu] = T(() => VO.edt(gm, vol.dims, { indices: true }));
    const [nlf, ms2] = T(() => VO.nearestLabelFill(vol.data, vol.dims, VO.dilate(gm, vol.dims, 2)));
    console.log(`  info EDT + indices 256³ : ${ms} ms (cpu ${cpu}) ; nearestLabelFill 256³ : ${ms2} ms`);
  }
}

// =====================================================================  (f) composantes connexes vs scipy
section('(f) composantes connexes, plus grand amas par étiquette — vs scipy.ndimage.label');
{
  const dims = [45, 39, 31], n = dims[0] * dims[1] * dims[2], r = rng(11), D = TMP + '/f'; fs.mkdirSync(D, { recursive: true });
  const m = new Uint8Array(n), lab = new Uint8Array(n); for (let v = 0; v < n; v++) { m[v] = r() < 0.3 ? 1 : 0; lab[v] = r() < 0.5 ? 1 + Math.floor(r() * 4) : 0; }
  const W = (nm, a) => fs.writeFileSync(D + '/' + nm, Buffer.from(a.buffer, a.byteOffset, a.byteLength));
  fs.writeFileSync(D + '/meta.json', JSON.stringify({ dims })); W('m.u8', m); W('lab.u8', lab);
  for (const c of [6, 18, 26]) { const C = VO.components(m, dims, c); W(`c${c}.i32`, C.labels); W(`s${c}.i32`, C.sizes); }
  const kl = VO.keepLargest(m, dims, 26); W('kl.u8', kl);
  const lp = lab.slice(), st = VO.largestPerLabel(lp, dims); W('lp.u8', lp);
  const res = JSON.parse(py(PYREAD + `
m = rd('m.u8', np.uint8); lab = rd('lab.u8', np.uint8); out = {}
for c, s in [(6, 1), (18, 2), (26, 3)]:
    L, n = ndi.label(m, ndi.generate_binary_structure(3, s)); ours = rd('c%d.i32' % c, np.int32)
    sizes = np.fromfile(D + '/s%d.i32' % c, np.int32)
    pairs = set(zip(L[m > 0].tolist(), ours[m > 0].tolist()))
    out['c%d' % c] = dict(n_scipy=int(n), n_ours=int(len(sizes) - 1), bijection=bool(len(pairs) == n == len(sizes) - 1), same_order=bool(np.array_equal(L, ours)), sizes=bool(np.array_equal(np.bincount(ours.ravel())[1:], sizes[1:])))
L, n = ndi.label(m, np.ones((3, 3, 3))); s = np.bincount(L.ravel()); s[0] = 0; out['kl'] = int(((L == s.argmax()) != (rd('kl.u8', np.uint8) > 0)).sum())
ref = lab.copy()
for v in range(1, 5):
    L, n = ndi.label(lab == v, np.ones((3, 3, 3))); s = np.bincount(L.ravel()); s[0] = 0; ref[(lab == v) & (L != s.argmax())] = 0
out['lp'] = int((ref != rd('lp.u8', np.uint8)).sum())
print(json.dumps(out))
`, [D]));
  for (const c of [6, 18, 26]) { const q = res['c' + c]; check(`composantes ${c}-connexes vs scipy`, q.bijection && q.sizes && q.n_ours === q.n_scipy, `${q.n_ours} composantes, même numérotation : ${q.same_order}`); }
  check('keepLargest (26) vs scipy', res.kl === 0, `voxels différents ${res.kl}`);
  check('largestPerLabel (26) vs scipy', res.lp === 0, `voxels différents ${res.lp}, retirés ${st.removed}, amas ${st.clusters}`);
}

// =====================================================================  E/S : GIfTI, pack, OBJ
section('E/S : GIfTI (base64 / gzip / ascii), pack, OBJ');
{
  const n = 40, dims = [n, n, n], c = [19.5, 20.2, 19.1], f = field(dims, (i, j, k) => 14 - Math.hypot(i - c[0], j - c[1], k - c[2]));
  const m = M.marchingCubes(f, dims, 0, null), labs = new Int32Array(m.pos.length / 3).map((_, v) => m.pos[3 * v + 2] > c[2] ? 2 : 1);
  let ok = true; const sizes = {};
  for (const enc of ['base64', 'gzip', 'ascii']) {
    const x = await M.toGifti(m, { encoding: enc, structure: 'CortexLeft' }); sizes[enc] = x.length; const b = await M.fromGifti(x);
    let d = 0; for (let i = 0; i < m.pos.length; i++) d = Math.max(d, Math.abs(b.pos[i] - m.pos[i])); for (let i = 0; i < m.faces.length; i++) if (b.faces[i] !== m.faces[i]) d = Infinity;
    ok = ok && d < (enc === 'ascii' ? 1e-4 : 1e-9);
  }
  const xl = await M.toGifti(null, { kind: 'label', labels: labs, labelTable: [{ key: 0, name: '???', color: [0, 0, 0, 0] }, { key: 1, name: 'bas', color: [255, 0, 0] }, { key: 2, name: 'haut', color: [0, 0, 1, 1] }], encoding: 'gzip' });
  const bl = await M.fromGifti(xl); ok = ok && bl.labels.every((v, i) => v === labs[i]) && bl.labelTable.length === 3 && bl.labelTable[1].name === 'bas';
  check('GIfTI : aller-retour JS (3 encodages, étiquettes + table)', ok, `tailles ${JSON.stringify(sizes)}`);
  fs.writeFileSync(TMP + '/t.gii', await M.toGifti(m, { encoding: 'gzip', structure: 'CortexLeft', geometric: 'Anatomical' })); fs.writeFileSync(TMP + '/t.label.gii', xl);
  fs.writeFileSync(TMP + '/t.shape.gii', await M.toGifti(null, { kind: 'shape', values: Float32Array.from(labs), name: 'sulc' }));
  const r = JSON.parse(py(`
import json, sys, nibabel as nib, numpy as np
g = nib.load(sys.argv[1]); P, F = g.agg_data(('pointset', 'triangle')); l = nib.load(sys.argv[2]); s = nib.load(sys.argv[3])
print(json.dumps(dict(nv=int(P.shape[0]), nf=int(F.shape[0]), sumP=float(P.astype(np.float64).sum()), fmax=int(F.max()), lab=np.bincount(l.agg_data()).tolist(), lt=[x.label for x in l.labeltable.labels], sh=float(s.agg_data().sum()),
  struct=g.darrays[0].meta.get('AnatomicalStructurePrimary', g.meta.get('AnatomicalStructurePrimary', '')))))
`, [TMP + '/t.gii', TMP + '/t.label.gii', TMP + '/t.shape.gii']));
  let sumP = 0; for (const v of m.pos) sumP += v; const cnt = [0, 0, 0]; for (const v of labs) cnt[v]++;
  check('GIfTI lu par nibabel (surface gzip, étiquettes + table, forme)', r.nv === m.pos.length / 3 && r.nf === m.faces.length / 3 && Math.abs(r.sumP - sumP) < 1e-2 && r.lab[1] === cnt[1] && r.lt.join() === '???,bas,haut' && r.struct === 'CortexLeft', JSON.stringify({ nv: r.nv, nf: r.nf, lt: r.lt, struct: r.struct }));
  const pk = M.pack({ pos: m.pos, faces: m.faces, labels: Uint8Array.from(labs), name: 'test', info: { a: 1 } }), up = M.unpack(new Uint8Array(pk));
  check('pack / unpack', up.name === 'test' && up.info.a === 1 && up.pos.every((v, i) => v === m.pos[i]) && up.faces.every((v, i) => v === m.faces[i]) && up.labels.length === labs.length, `${pk.length} octets (${m.pos.length / 3} sommets)`);
  const ob = M.fromObj(M.toObj(m)); check('OBJ aller-retour', ob.faces.every((v, i) => v === m.faces[i]) && ob.pos.every((v, i) => Math.abs(v - m.pos[i]) < 1e-3));
  // nettoyage : faces répétées, doublons, arête nulle, triangle « chapeau »
  const P = Float32Array.from([...m.pos, m.pos[0] + 1e-7, m.pos[1], m.pos[2]]), F = Array.from(m.faces);
  const f0 = [F[0], F[1], F[2]]; F.push(f0[0], f0[1], f0[2]); F.push(f0[0], f0[0], f0[1]);   // doublon + indices répétés
  const cl = M.cleanup({ pos: P, faces: Uint32Array.from(F) }), tc = M.topology(cl);
  check('cleanup : doublons / indices répétés / sommet isolé retirés, variété fermée', isClosedManifold(tc) && tc.euler === 2 && cl.stats.unreferenced === 1, JSON.stringify(cl.stats));
}

// =====================================================================  structures, isosurface CT, injection worker
section('structures sous-corticales (étiquettes), isosurface CT (métal), fabrique injectée (worker)');
{
  const dims = [80, 80, 80], A = [-1, 0, 0, 40, 0, 0, 1, -40, 0, -1, 0, 40, 0, 0, 0, 1];
  const lab = new Uint16Array(field(dims, (i, j, k) => ((i - 30) / 9) ** 2 + ((j - 40) / 6) ** 2 + ((k - 35) / 5) ** 2 <= 1 ? 10 : Math.hypot(i - 55, j - 40, k - 45) <= 7 ? 49 : 0));
  const vol = { dims, affine: A, data: lab };
  const [S, ms] = T(() => M.pipelineStructures(vol, [{ name: 'caudé G', labels: [10] }, { name: 'putamen D', labels: 49 }, { name: 'absent', labels: [77] }], { targetFaces: 2000 }));
  const tS = S.map(s => M.topology(s)), vref = [4 / 3 * Math.PI * 9 * 6 * 5, 4 / 3 * Math.PI * 343];
  check('pipelineStructures : 2 maillages fermés χ=2, volumes ±10 % (retrait de courbure du flou), absente omise', S.length === 2 && tS.every(t => isClosedManifold(t) && t.euler === 2) && S.every((s, i) => Math.abs(s.info.volume / vref[i] - 1) < 0.1),
    S.map((s, i) => `${s.name} ${tS[i].F} faces, vol ${(s.info.volume / vref[i] * 100 - 100).toFixed(1)} %`).join(' ; ') + `, ${ms} ms`);
  // CT synthétique : 2 électrodes de 8 contacts (Ø 0.8 mm, 2 mm, pas 3.5 mm), effet de volume partiel par suréchantillonnage
  const ct = new Float32Array(dims[0] * dims[1] * dims[2]).fill(40), elec = [[[20, 20, 30], [1, 0.3, 0.1]], [[50, 60, 20], [0.2, -0.6, 0.8]]];
  for (const [p0, d0] of elec) {
    const L = Math.hypot(...d0), d = d0.map(x => x / L);
    for (let c = 0; c < 8; c++) for (let t = 0; t <= 2; t += 0.1) for (let a = 0; a < 6; a++) for (let rr = 0; rr <= 0.4; rr += 0.1) {
      const u = Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], e1 = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]], l1 = Math.hypot(...e1), e = e1.map(x => x / l1), f = [d[1] * e[2] - d[2] * e[1], d[2] * e[0] - d[0] * e[2], d[0] * e[1] - d[1] * e[0]];
      const s = c * 3.5 + t, q = [0, 1, 2].map(k => p0[k] + d[k] * s + rr * (Math.cos(a) * e[k] + Math.sin(a) * f[k]));
      const i = Math.round(q[0]), j = Math.round(q[1]), k = Math.round(q[2]); ct[i + 80 * (j + 80 * k)] += 9;
    }
  }
  const ctv = { dims, affine: A, data: Int16Array.from(ct, v => Math.min(32000, v * 3) - 1024), slope: 1, inter: 0 };
  const [iso, ms2] = T(() => M.pipelineIso(ctv, 1500, { minFaces: 8 })), ti = M.topology(iso);
  check('pipelineIso (HU 1500) : 16 contacts = 16 composantes fermées', iso.components === 16 && ti.closed && ti.manifold, `${iso.components} composantes, ${ti.F} faces, ${ms2} ms`);
  // fabrique injectée comme dans work.js (contexte vierge = worker) : mêmes résultats
  const F = SV._factories, src = 'self.SV = {}; self.SV._inWorker = true;\n' + ['nifti', 'volops', 'mesh'].map(nm => '(' + F[nm].toString() + ')(self.SV);').join('\n');
  const ctx = vm.createContext({ self: {}, performance, btoa, atob, Blob, CompressionStream, DecompressionStream, TextEncoder, TextDecoder });
  vm.runInContext(src, ctx);
  const wr = JSON.parse(vm.runInContext(`(() => { const SV = self.SV, n = 40, d = new Uint8Array(n * n * n); for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) d[i + n * (j + n * k)] = (i - 20) ** 2 / 200 + (j - 19) ** 2 / 120 + (k - 21) ** 2 / 90 <= 1 ? 2 : 0;
    const r = SV.Mesh.pipelineHemisphere({ dims: [n, n, n], data: d, affine: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1] }, new Set([2]), { targetVertices: 500 }, () => {});
    return JSON.stringify({ n: r.n, euler: r.info.topology.euler, sulc: r.sulc.length, keys: Object.keys(SV).sort() }); })()`, ctx));
  const d = new Uint8Array(40 ** 3); for (let k = 0; k < 40; k++) for (let j = 0; j < 40; j++) for (let i = 0; i < 40; i++) d[i + 40 * (j + 40 * k)] = (i - 20) ** 2 / 200 + (j - 19) ** 2 / 120 + (k - 21) ** 2 / 90 <= 1 ? 2 : 0;
  const mr = M.pipelineHemisphere({ dims: [40, 40, 40], data: d, affine: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }, new Set([2]), { targetVertices: 500 });
  check('fabriques nifti+volops+mesh injectées dans un contexte vierge (worker) : même résultat', wr.n === mr.n && wr.euler === 2 && wr.keys.includes('Mesh') && wr.keys.includes('VolOps'), JSON.stringify(wr));
}

// =====================================================================  (d) données réelles
if (!QUICK && fs.existsSync(LABELS)) {
  section('(d) données réelles : ' + LABELS);
  const vol = await SV.Nifti.read(fs.readFileSync(LABELS)), A = vol.affine, [nx, ny, nz] = vol.dims;
  const ori = SV.Vol.orientation(vol), codes = ori.axis.map((a, w) => '');
  const axc = [0, 1, 2].map(c => { const v = [A[c], A[4 + c], A[8 + c]], w = v.map(Math.abs).indexOf(Math.max(...v.map(Math.abs))); return (v[w] > 0 ? 'RAS' : 'LPI')[w]; }).join('');
  const cnt = {}; for (const v of vol.data) cnt[v] = (cnt[v] || 0) + 1;
  console.log(`  info dims ${vol.dims.join('×')}, orientation ${axc}, affine ${SV.Mat4.toArray(A).slice(0, 12).join(' ')}, étiquettes ${JSON.stringify(cnt)} → 1 = SG (T1 plus sombre), 2 = SB`);
  check('orientation LIA déduite de l’affine', axc === 'LIA');
  // plan médian : minimum de tissu par plan sagittal (x monde) à ±12 mm du centre du cerveau
  const prof = new Map(); let sx = 0, sn = 0;
  for (let k = 0, o = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++, o++) if (vol.data[o]) { const x = Math.round(A[0] * i + A[1] * j + A[2] * k + A[3]); prof.set(x, (prof.get(x) || 0) + 1); sx += x; sn++; }
  const xc = Math.round(sx / sn); let midX = xc, best = Infinity; for (let x = xc - 12; x <= xc + 12; x++) { const c = (prof.get(x) || 0) + (prof.get(x - 1) || 0) + (prof.get(x + 1) || 0); if (c < best) { best = c; midX = x; } }
  midX += 0.5;   // entre deux plans de voxels
  console.log(`  info plan médian x = ${midX} mm (centre de masse x = ${xc} mm)`);
  const hemis = {};
  for (const [h, side] of [['lh', 'L'], ['rh', 'R']]) {
    const c0 = process.cpuUsage(), r = M.pipelineHemisphere(vol, new Set([1, 2]), { side, midX, targetVertices: 60000 }), cpu = Math.round((process.cpuUsage(c0).user + process.cpuUsage(c0).system) / 1000);
    hemis[h] = r; const t = r.info.topology;
    let cx = 0; for (let v = 0; v < r.n; v++) cx += r.pial[3 * v]; cx /= r.n;
    console.log(`  info ${h} : MC ${r.info.mcVertices} sommets / ${r.info.mcFaces} faces → ${r.n} sommets / ${r.faces.length / 3} faces ; correction topologique +${r.info.topoAdded} / −${r.info.topoRemoved} voxels ; aire ${(r.info.area / 100).toFixed(0)} cm², volume ${(r.info.volume / 1000).toFixed(0)} cm³ ; x moyen ${cx.toFixed(1)} mm`);
    console.log(`  info ${h} temps (ms) : ${JSON.stringify(r.timings)} ; cpu ${cpu} ms`);
    check(`${h} : surface fermée, variété, χ=2 (genre 0), côté correct`, isClosedManifold(t) && t.euler === 2 && (side === 'L' ? cx < midX : cx > midX), topoStr(t));
    const s = Array.from(r.sulc).sort((a, b) => a - b), q = p => s[Math.floor(p * (s.length - 1))];
    check(`${h} : gonflée quasi sans repli (< 0.25 % des faces après dépliage local)`, r.info.inflate.foldedAfter < 2.5e-3 * r.faces.length / 3, `faces repliées gonflée ${r.info.inflate.foldedBefore} → ${r.info.inflate.foldedAfter} (${r.info.inflate.iterations} itérations), pial ${r.info.pialFolded}`);
    check(`${h} : sulc centré (≈ 50 % > 0), même topologie gonflée`, Math.abs(r.sulc.filter(x => x > 0).length / r.n - 0.5) < 0.05 && r.inflated.length === r.pial.length, `percentiles 1/25/50/75/99 : ${[0.01, 0.25, 0.5, 0.75, 0.99].map(q).join(' / ')} (gabarit fsaverage5 : −74 / −28 / −2 / 31 / 94)`);
    // étiquettes par sommet : échantillonnage le long de −normale (3 classes : la SG doit dominer)
    const [labs, msl] = T(() => M.sampleLabels(r.pial, r.faces, null, vol, { Type: Uint8Array })), lc = [0, 0, 0]; for (const v of labs) lc[v]++;
    check(`${h} : sampleLabels (−normale, 0–2.5 mm) → majorité SG`, lc[1] / r.n > 0.8, `SG ${(100 * lc[1] / r.n).toFixed(1)} %, SB ${(100 * lc[2] / r.n).toFixed(1)} %, non étiqueté ${lc[0]}, ${msl} ms`);
    hemis[h].labels = labs;
    const lm = M.modeFilterLabels(r.faces, labs.slice(), 2); let ch = 0; for (let v = 0; v < r.n; v++) if (lm[v] !== labs[v]) ch++;
    const holes = labs.slice(); for (let v = 0; v < r.n; v += 7) holes[v] = 0; M.fillVertexLabels(r.faces, holes);
    check(`${h} : modeFilterLabels / fillVertexLabels`, ch < 0.1 * r.n && holes.every(x => x > 0), `${ch} sommets modifiés par le filtre majoritaire`);
    // sorties
    const struct = h === 'lh' ? 'CortexLeft' : 'CortexRight';
    fs.writeFileSync(`${OUT}/mesh_${h}_pial.obj`, M.toObj({ pos: r.pial, faces: r.faces }));
    fs.writeFileSync(`${OUT}/mesh_${h}_inflated.obj`, M.toObj({ pos: r.inflated, faces: r.faces }));
    fs.writeFileSync(`${OUT}/mesh_${h}_pial.gii`, await M.toGifti({ pos: r.pial, faces: r.faces }, { encoding: 'gzip', structure: struct, secondary: 'Pial', geometric: 'Anatomical' }));
    fs.writeFileSync(`${OUT}/mesh_${h}_inflated.gii`, await M.toGifti({ pos: r.inflated, faces: r.faces }, { encoding: 'gzip', structure: struct, geometric: 'Inflated' }));
    fs.writeFileSync(`${OUT}/mesh_${h}_sulc.shape.gii`, await M.toGifti(null, { kind: 'shape', values: Float32Array.from(r.sulc, x => x / 127), structure: struct, name: 'sulc' }));
    fs.writeFileSync(`${OUT}/mesh_${h}.pack`, M.pack({ n: r.n, pial: r.pial, inflated: r.inflated, faces: r.faces, sulc: r.sulc, labels: labs }));
  }
  // décimation à grande échelle : MC brut d'un hémisphère (~300 k faces) → 100 k
  {
    let mask = VO.maskOf(vol.data, [1, 2]); for (let k = 0, o = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++, o++) if (A[0] * i + A[1] * j + A[2] * k + A[3] < midX) mask[o] = 0;
    const bb = VO.bbox(mask, vol.dims, 4, { clamp: false }), C = VO.crop(mask, vol.dims, bb, Uint8Array);
    const g = VO.topoCorrect(VO.fillHoles(VO.keepLargest(C.data, C.dims), C.dims), C.dims), fl = VO.gaussian(g.mask, C.dims, 0.8, { border: 'zero' });
    for (let v = 0; v < fl.length; v++) fl[v] = g.mask[v] ? Math.max(fl[v], 0.7) : Math.min(fl[v], 0.3);
    let mc = M.marchingCubes(fl, C.dims, 0.5, VO.cropAffine(A, bb), null, { ambiguity: 'separate' }); mc = M.largestComponent(mc); mc.pos = M.smoothTaubin(mc.pos, mc.faces, 5);
    const [d, ms, cpu] = T(() => M.decimate(mc.pos, mc.faces, 100000)), t = M.topology(d), H = hausdorff(mc, d, 60000);
    check(`rh brut ${mc.faces.length / 3} → ${t.F} faces en < 3 s (cpu), variété χ=2, Hausdorff < 1 mm`, cpu < 3000 && isClosedManifold(t) && t.euler === 2 && H.max < 1, `${ms} ms (cpu ${cpu}), Hausdorff ${H.max.toFixed(3)} mm (moy. ${H.meanBtoA.toFixed(3)}), ${JSON.stringify(d.stats)}`);
  }
  // rendus (logiciel, matplotlib) : lit les GIfTI via nibabel (validation croisée du format)
  const RENDER = `
import sys, json, numpy as np, nibabel as nib, matplotlib
matplotlib.use('Agg'); import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection
O = sys.argv[1]
def draw(ax, P, F, vcol, d, title):   # ombrage par normales de sommets (comme viewer3d), peintre + élimination des faces arrière
    d = np.asarray(d, float); u = np.array([0, 0, 1.]); r = np.cross(d, u); r /= np.linalg.norm(r); u = np.cross(r, d)
    T = P[F]; n = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0]); N = np.zeros_like(P)
    for k in range(3): np.add.at(N, F[:, k], n)
    N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-12; shv = 0.35 + 0.65 * np.clip(-(N @ d), 0, 1)
    vis = (n @ d) < 0; Fv = F[vis]; o = np.argsort(-(P[Fv].mean(1) @ d)); Fv = Fv[o]
    c = (vcol[Fv] * shv[Fv][..., None]).mean(1); xy = np.stack([P[Fv] @ r, P[Fv] @ u], -1)
    ax.add_collection(PolyCollection(xy, facecolors=np.clip(c, 0, 1), edgecolors='none', antialiased=False))
    ax.set_xlim(xy[..., 0].min() - 2, xy[..., 0].max() + 2); ax.set_ylim(xy[..., 1].min() - 2, xy[..., 1].max() + 2); ax.set_aspect('equal'); ax.axis('off'); ax.set_title(title, fontsize=11)
out = {}
for h in ['lh', 'rh']:
    P, F = nib.load(f'{O}/mesh_{h}_pial.gii').agg_data(('pointset', 'triangle')); I = nib.load(f'{O}/mesh_{h}_inflated.gii').agg_data('pointset'); s = nib.load(f'{O}/mesh_{h}_sulc.shape.gii').agg_data()
    out[h] = dict(nv=int(P.shape[0]), nf=int(F.shape[0]), same_topology=bool(I.shape == P.shape))
    g = 0.80 - 0.40 * (np.clip(s, -1, 1) + 1) / 2; col = np.stack([g * 1.02, g, g * 0.96], -1)   # gyrus clair, sillon sombre (par sommet)
    lat, med = ((1, 0, 0), (-1, 0, 0)) if h == 'lh' else ((-1, 0, 0), (1, 0, 0))
    M5 = 0.5 * P + 0.5 * (I + np.array([-32 if h == 'lh' else 32, 0, 0]))
    fig, axs = plt.subplots(3, 2, figsize=(13, 14), facecolor='white')
    for row, (X, nm) in enumerate([(P, 'pial'), (M5, 'morph 50 % (±32 mm)'), (I, 'gonflé')]):
        draw(axs[row, 0], X, F, col, lat, f'{h} {nm} — latéral'); draw(axs[row, 1], X, F, col, med, f'{h} {nm} — médial')
    plt.tight_layout(); plt.savefig(f'{O}/mesh_render_{h}.png', dpi=72); plt.close(fig)
print(json.dumps(out))
`;
  const [rr, msr] = T(() => JSON.parse(py(RENDER, [OUT])));
  check('GIfTI hémisphères relus par nibabel, rendus PNG écrits', rr.lh.nv === hemis.lh.n && rr.rh.nv === hemis.rh.n && rr.lh.same_topology && rr.rh.same_topology, `${JSON.stringify(rr)} ; ${OUT}/mesh_render_{lh,rh}.png (${msr} ms)`);
  console.log(`  info fichiers : ${OUT}/mesh_{lh,rh}_{pial,inflated}.{obj,gii}, mesh_{lh,rh}_sulc.shape.gii, mesh_{lh,rh}.pack, mesh_render_{lh,rh}.png`);
}

console.log(`\n${nOk} ok, ${nFail} échec(s)`);
process.exit(nFail ? 1 : 0);
