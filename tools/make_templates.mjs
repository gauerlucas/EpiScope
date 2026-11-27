// node tools/make_templates.mjs <dossier des gabarits> <dossier de travail> [--stage=seg|mesh|assets|all]
// v3.0.0 — gabarits d'EpiScope sur ICBM 152 NLin 2009b asymétrique (Fonov et al. 2009, 2011) et NIHPD asymétriques
// 4,5–18,5 ans (Fonov et al. 2011), téléchargés par l'utilisateur sur nist.mni.mcgill.ca (licence MNI : usage, copie,
// modification et distribution permis avec l'avis de copyright). Rien n'est lu sur le réseau.
//   <dossier des gabarits>/mni_icbm152_nlin_asym_09b_nifti/mni_icbm152_nlin_asym_09b/mni_icbm152_t1_tal_nlin_asym_09b_hires.nii
//   <dossier des gabarits>/nihpd_asym_all_nifti/nihpd_asym_<âges>_{t1w,mask,gm,wm,csf}.nii
// Étapes (résultats intermédiaires dans le dossier de travail, hors dépôt) :
//   seg   : T1 0,5 mm → 1 mm ; conformation 256³, masque mindgrab, MeshNet aparc+aseg 104 classes (même chaîne que pour
//           un patient) → t1_1mm, conf, mask, seg_104 ;
//   (puis python3 tools/make_templates_vol.py <gabarits> <travail> : tissus, compartiments, régions VEP, 104 classes)
//   mesh  : surfaces piales des hémisphères sur le T1 0,5 mm, structures profondes → meshes.json ;
//   (puis python3 tools/make_templates_assets.py <gabarits> <travail> : assets/brain_meshes.json, vep_volume.json,
//           template_anat.json, template_spm.json)
//   peds  : gabarits NIHPD asymétriques par tranche d'âge → assets/templates_peds.json.
import fs from 'fs'; import vm from 'vm'; import path from 'path'; import zlib from 'zlib';
import { smoothLabels, addMissing } from './tpl_labels.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const [SRC, WORK] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const STAGE = ((process.argv.find(a => a.startsWith('--stage=')) || '--stage=seg').slice(8));
if (!SRC || !WORK) { console.error('usage : node tools/make_templates.mjs <dossier des gabarits> <dossier de travail> [--stage=…]'); process.exit(1); }
fs.mkdirSync(WORK, { recursive: true });
globalThis.window = undefined; globalThis.SV = {};
const loadSrc = f => vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
for (const f of ['src/nifti.js', 'src/work.js', 'src/imaging/coreg.js', 'src/imaging/volops.js', 'src/imaging/meshnet.js', 'src/imaging/mesh.js', 'src/imaging/anat.js', 'src/imaging/warp.js']) loadSrc(f);
const asset = n => JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', n), 'utf8'));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const B09 = path.join(SRC, 'mni_icbm152_nlin_asym_09b_nifti/mni_icbm152_nlin_asym_09b/mni_icbm152_t1_tal_nlin_asym_09b_hires.nii');

/** 0,5 mm → 1 mm : moyenne des blocs 2×2×2 (grille 1 mm alignée sur celle des gabarits NIHPD / 2009c, origine identique) */
function half(vol) {
  const [nx, ny, nz] = vol.dims, mx = nx >> 1, my = ny >> 1, mz = nz >> 1, out = new Float32Array(mx * my * mz), D = vol.data, s = vol.slope || 1, b = vol.inter || 0;
  for (let k = 0; k < mz; k++) for (let j = 0; j < my; j++) for (let i = 0; i < mx; i++) {
    let a = 0; for (let dk = 0; dk < 2; dk++) for (let dj = 0; dj < 2; dj++) for (let di = 0; di < 2; di++) a += D[(2 * i + di) + nx * ((2 * j + dj) + ny * (2 * k + dk))];
    out[i + mx * (j + my * k)] = (a / 8) * s + b;
  }
  const A = Array.from(vol.affine), Aff = SV.Mat4.from([2 * A[0], 2 * A[1], 2 * A[2], A[3] + 0.5 * (A[0] + A[1] + A[2]), 2 * A[4], 2 * A[5], 2 * A[6], A[7] + 0.5 * (A[4] + A[5] + A[6]), 2 * A[8], 2 * A[9], 2 * A[10], A[11] + 0.5 * (A[8] + A[9] + A[10]), 0, 0, 0, 1]);
  return { dims: [mx, my, mz], pixdim: [1, 1, 1], affine: Aff, data: out, slope: 1, inter: 0, datatype: 16 };
}
/** volume VEP de l'ancien gabarit (fsaverage tkrRAS = MNI305, 2 mm, RLE ; EpiScope ≤ 2.4.0, gardé dans tools/data) */
function oldTemplateVol() {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/data/vep_volume_fsaverage.json'), 'utf8')), rv = Buffer.from(j.rle_values, 'base64'), rn = new Uint16Array(Uint8Array.from(Buffer.from(j.rle_lengths, 'base64')).buffer);
  const n = j.dims[0] * j.dims[1] * j.dims[2], data = new Uint8Array(n); let p = 0; for (let i = 0; i < rv.length; i++) { data.fill(rv[i], p, p + rn[i]); p += rn[i]; }
  return { dims: j.dims, off: j.offset_vox, vox: j.voxel_mm || 2, data };
}
const writeNii = (file, vol) => fs.writeFileSync(file, zlib.gzipSync(Buffer.from(SV.Nifti.encode(vol))));

async function stageSeg() {
  log('lecture du T1 2009b (0,5 mm)'); const v05 = await SV.Nifti.read(fs.readFileSync(B09));
  const v1 = half(v05); writeNii(path.join(WORK, 't1_1mm.nii.gz'), v1); log('T1 1 mm', v1.dims.join('×'));
  const conf = SV.MeshNet.conform(v1, { mode: 'niivue' }); writeNii(path.join(WORK, 'conf.nii.gz'), conf);
  const model = SV.MeshNet.loadModel(asset('models/model21_104class.json')), pre = SV.MeshNet.loadModel(asset('models/model5_gw_ae.json'));
  const prog = (f, m) => { const t = Date.now(); if (!prog.t || t - prog.t > 20000) { prog.t = t; log('   ', typeof f === 'number' ? (100 * f).toFixed(0) + ' %' : '', m || (f && f.message) || ''); } };
  log('masque du cerveau (mindgrab)');
  const mask = (await SV.MeshNet.segmentPass(conf, SV.MeshNet.loadModel(asset('models/mindgrab.json')), { workers: 0, onProgress: prog })).labels;
  const env = SV.MeshNet.envelope(mask, 4, 1); let nb = 0; for (const x of mask) if (x) nb++; log('cerveau', Math.round(nb / 1000), 'cm³');
  log('MeshNet aparc+aseg 104 classes'); const r = await SV.MeshNet.segmentPass(conf, model, { premodel: pre, envelope: env, workers: 0, onProgress: prog });
  const tpl = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/data/template_anat_fsaverage.json'), 'utf8')), q = SV.Anat.segQuality(r.labels, [256, 256, 256], Array.from(conf.affine), tpl);
  log('contrôle de qualité (centres comparés à l’ancien gabarit)', JSON.stringify(q));
  writeNii(path.join(WORK, 'seg_104.nii.gz'), { dims: [256, 256, 256], pixdim: [1, 1, 1], affine: conf.affine, data: r.labels, slope: 1, inter: 0 });
  writeNii(path.join(WORK, 'mask.nii.gz'), { dims: [256, 256, 256], pixdim: [1, 1, 1], affine: conf.affine, data: mask, slope: 1, inter: 0 });
  fs.writeFileSync(path.join(WORK, 'seg_info.json'), JSON.stringify({ quality: q }, null, 1));
  log('étape seg terminée');
}

/** gabarits pédiatriques : repères (python3 tools/make_templates_peds.py) → transformation de chaque gabarit NIHPD vers
 *  MNI 2009b (spline de plaque mince régularisée, λ par validation croisée, ou affine si elle prédit mieux), comme pour
 *  un patient ; assets/templates_peds.json */
async function stagePeds() {
  const P = JSON.parse(fs.readFileSync(path.join(WORK, 'peds_landmarks.json'), 'utf8')), tpl = asset('template_anat.json'), list = [];
  for (const k of Object.keys(P).sort()) {
    const t = P[k], W = SV.Warp.estimate(t.landmarks, tpl.centroids); delete W.grid;
    const f = v => String(v).replace('.', ',').replace(/,0$/, '');
    list.push({ id: 'nihpd-' + k, name: `NIHPD ${f(t.ageMin)}–${f(t.ageMax)} ans`, ageMin: t.ageMin, ageMax: t.ageMax, builtin: true, source: 'NIHPD asymétrique (Fonov et al. 2011)', landmarks: t.landmarks, toMNI: W });
    log('NIHPD', k, W.method, JSON.stringify(W.loo));
  }
  const out = { version: 1, space: tpl.space, source: 'MNI NIHPD Objective 1, gabarits asymétriques 4,5–18,5 ans (Fonov et al., NeuroImage 2011 ; 47 : S102 ; NeuroImage 2011 ; 54 : 313–327)', license: 'Copyright (C) 1993–2004 Louis Collins, McConnell Brain Imaging Centre, Montreal Neurological Institute, McGill University. Usage, copie, modification et distribution permis avec cet avis (licence du MNI).', templates: list };
  fs.writeFileSync(path.join(ROOT, 'assets', 'templates_peds.json'), JSON.stringify(out));
  log('assets/templates_peds.json', list.length, 'gabarits');
}
const readGz = async f => SV.Nifti.read(zlib.gunzipSync(fs.readFileSync(path.join(WORK, f))));
/** surfaces piales des deux hémisphères sur le T1 0,5 mm : intérieur = compartiment de l'hémisphère (make_templates_vol.py)
 *  ∩ masque du cerveau ∩ T1 au-dessus du milieu LCR / SG (limite piale au demi-volume partiel), plus noyaux gris et
 *  ventricules du côté ; puis la chaîne des patients (SV.Mesh.pipelineHemisphere : composante principale, trous comblés,
 *  topologie corrigée, marching cubes, Taubin, décimation, gonflement, profondeur sulcale) et régions VEP des sommets. */
async function stageMesh() {
  const hi = await SV.Nifti.read(fs.readFileSync(B09)), [hx, hy, hz] = hi.dims, info = JSON.parse(fs.readFileSync(path.join(WORK, 'vol_info.json'), 'utf8'));
  const comp = await readGz('comp_1mm.nii.gz'), vep = await readGz('vep_1mm.nii.gz'), brain = await readGz('brain_1mm.nii.gz');
  const [mx, my] = comp.dims, thr = info.tissue.pial != null ? info.tissue.pial : 0.5 * (info.tissue.mu[0] + info.tissue.mu[1]), sl = hi.slope || 1, ic = hi.inter || 0;
  log('limite piale : T1 >', thr.toFixed(1));
  const out = { hemis: {}, thr };
  for (const [side, c, lo, hiL, deep] of [['L', 1, 1, 72, [145, 152]], ['R', 2, 73, 144, [154, 161]]]) {
    const m = new Uint8Array(hx * hy * hz);
    for (let k = 0, o = 0; k < hz; k++) for (let j = 0; j < hy; j++) for (let i = 0; i < hx; i++, o++) {
      const q = (i >> 1) + mx * ((j >> 1) + my * (k >> 1)); if (comp.data[q] !== c || !brain.data[q]) continue;
      const v = vep.data[q]; if ((v >= deep[0] && v <= deep[1]) || v === 201 || hi.data[o] * sl + ic > thr) m[o] = 1;
    }
    log('surface', side);
    const r = SV.Mesh.pipelineHemisphere({ dims: hi.dims, affine: hi.affine, data: m }, [1], { targetVertices: +(process.env.TPL_VERTICES || 32000), sigma: 0.8, inflate: { center: 'origin', scale: 'rms', scaleFactor: 1.36 } }, p => p && p.stage && log('   ', p.stage));
    const cort = new Uint8Array(vep.data.length); for (let q = 0; q < cort.length; q++) { const v = vep.data[q]; if (v >= lo && v <= hiL) cort[q] = v; }
    const lab = SV.Mesh.sampleLabels(r.pial, r.faces, null, { dims: vep.dims, affine: vep.affine, data: cort }, { depths: [1, 0.5, 1.5, 2, 2.5, 0, 3, 3.5] });
    smoothLabels(r.faces, lab, r.n); out.added = (out.added || []).concat(addMissing(r.pial, lab, vep, lo, hiL));
    if (r.info.pockets) log('    poches refermées', JSON.stringify(r.info.pockets));
    log('   ', r.n, 'sommets, genre', JSON.stringify(r.info.topology), 'aire', Math.round(r.info.area / 100), 'cm²');
    out.hemis[side === 'L' ? 'lh' : 'rh'] = { n: r.n, pial: Array.from(r.pial, v => +v.toFixed(2)), inflated: Array.from(r.inflated, v => +v.toFixed(2)), faces: Array.from(r.faces), sulc: Array.from(r.sulc, v => +v.toFixed(3)), labels: Array.from(lab), info: { topology: r.info.topology, area: r.info.area, volume: r.info.volume, timings: r.timings } };
  }
  const names = asset('brain_meshes.json').regions.map(x => x.name);
  // cervelet : surface externe (substance grise et blanche du compartiment cérébelleux), pas la seule écorce
  const sv = vep.data.slice(); for (let q = 0; q < sv.length; q++) if (sv[q] === 200 && (comp.data[q] === 3 || comp.data[q] === 4)) sv[q] = comp.data[q] === 3 ? 153 : 162;
  out.subcortical = SV.Anat.structures(sv, vep.dims, Array.from(vep.affine), names).map(s => ({ index: s.index, name: s.name, vertices: Array.from(s.vertices, v => +v.toFixed(2)), faces: Array.from(s.faces) }));
  log('régions de fond de sillon ajoutées (région, sommets)', JSON.stringify(out.added));
  fs.writeFileSync(path.join(WORK, process.env.TPL_MESHOUT || 'meshes.json'), JSON.stringify(out));
  log('étape mesh terminée');
}

if (STAGE === 'seg' || STAGE === 'all') await stageSeg();
if (STAGE === 'mesh' || STAGE === 'all') await stageMesh();
if (STAGE === 'peds' || STAGE === 'all') await stagePeds();
