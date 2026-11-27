// node tools/make_templates_bst.mjs <dossier de travail>
// v3.3.0 — étape de maillage des surfaces du gabarit tirées du modèle ICBM152_2026 de Brainstorm (voir
// tools/make_templates_bst.py, qui la précède — extract — et la suit — assets). Rien n'est lu sur le réseau.
//   hémisphères : piale FreeSurfer haute résolution → décimation (≈ TPL_VERTICES sommets, défaut 32 000), Taubin léger,
//                 gonflement plus poussé que pour la piale segmentée de la v3.0 (σ = TPL_INFLATE_SIGMA, défaut 26 : sillons
//                 FreeSurfer plus profonds), poches refermées et profondeur sulcale (chaîne des patients, SV.Mesh) ; régions VEP des
//                 sommets d'après la parcellation VEP du gabarit (vep_2mm), vote des voisins, régions de fond de sillon ;
//   structures  : aseg du gabarit numérotée en régions VEP (sub_vep) → surfaces lisses (distance signée lissée,
//                 suréchantillonnage, SV.Mesh.pipelineStructure ; cervelet : enveloppe des folia).
// → <travail>/bst_meshes.json (même forme que meshes.json de make_templates.mjs).
import fs from 'fs'; import vm from 'vm'; import path from 'path'; import zlib from 'zlib';
import { smoothLabels, addMissing } from './tpl_labels.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const WORK = process.argv[2];
if (!WORK) { console.error('usage : node tools/make_templates_bst.mjs <dossier de travail>'); process.exit(1); }
globalThis.window = undefined; globalThis.SV = {};
const loadSrc = f => vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
for (const f of ['src/nifti.js', 'src/work.js', 'src/imaging/volops.js', 'src/imaging/mesh.js']) loadSrc(f);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const readGz = async f => SV.Nifti.read(zlib.gunzipSync(fs.readFileSync(path.join(WORK, f))));
const names = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'brain_meshes.json'), 'utf8')).regions.map(x => x.name);
const TV = +(process.env.TPL_VERTICES || 32000), M = SV.Mesh;

const cortex = JSON.parse(fs.readFileSync(path.join(WORK, 'bst_cortex.json'), 'utf8'));
const vep = await readGz('vep_2mm.nii.gz'), sub = await readGz('sub_vep.nii.gz');
const out = { hemis: {}, source: 'Brainstorm ICBM152_2026', added: [] };
for (const [h, lo, hi] of [['lh', 1, 72], ['rh', 73, 144]]) {
  let pos = Float32Array.from(cortex[h].pos), faces = Uint32Array.from(cortex[h].faces);
  log(h, pos.length / 3, 'sommets FreeSurfer, genre', JSON.stringify(M.topology({ pos, faces })));
  const d = M.decimate(pos, faces, 2 * TV); pos = d.pos; faces = d.faces;
  pos = M.smoothTaubin(pos, faces, 2, 0.5, -0.53);
  const info = { inflate: {} }, inflOpts = { center: 'origin', scale: 'rms', scaleFactor: 1.36, sigma: +(process.env.TPL_INFLATE_SIGMA || 26) };
  let inflated = M.inflate(pos, faces, Object.assign({ adj: M.adjacency(faces, pos.length / 3), stats: info.inflate }, inflOpts));
  const R = M.capPockets(pos, faces, inflated, Object.assign({}, inflOpts));
  if (R.capped) { pos = R.pos; faces = R.faces; inflated = R.inflated; }
  info.pockets = { capped: R.capped, removed: R.removed, rounds: R.rounds };
  const s = M.sulc(pos, faces, inflated), n = pos.length / 3;
  const cort = new Uint8Array(vep.data.length); for (let q = 0; q < cort.length; q++) { const v = vep.data[q]; if (v >= lo && v <= hi) cort[q] = v; }
  const lab = M.sampleLabels(pos, faces, null, { dims: vep.dims, affine: vep.affine, data: cort }, { depths: [1, 0.5, 1.5, 2, 2.5, 0, 3, 3.5], Type: Uint8Array });
  smoothLabels(faces, lab, n); out.added.push(...addMissing(pos, lab, vep, lo, hi));
  info.topology = M.topology({ pos, faces }); info.area = M.area(pos, faces); info.volume = M.volume(pos, faces);
  log('   ', n, 'sommets, genre', JSON.stringify(info.topology), 'aire', Math.round(info.area / 100), 'cm², poches', JSON.stringify(info.pockets), 'régions', new Set(lab).size);
  out.hemis[h] = { n, pial: Array.from(pos, v => +v.toFixed(2)), inflated: Array.from(inflated, v => +v.toFixed(2)), faces: Array.from(faces), sulc: Array.from(s, v => +v.toFixed(3)), labels: Array.from(lab), info };
}
// structures profondes et cervelet : un maillage fermé par région VEP (hippocampe antérieur et postérieur séparés)
const items = []; for (let i = 145; i <= 162; i++) items.push({ name: names[i], labels: [i], opts: i === 153 || i === 162 ? { close: 3, sigma: 2, targetFaces: 6000 } : null });
const st = M.pipelineStructures({ dims: sub.dims, affine: sub.affine, data: sub.data }, items, { targetFaces: 4000, sigma: 1, upsample: 2, taubin: 20 }, () => {});
out.subcortical = st.map(s => ({ index: s.labels[0], name: s.name, vertices: Array.from(s.pos, v => +v.toFixed(2)), faces: Array.from(s.faces), volume: +(s.info.volume / 1000).toFixed(2) }));
for (const s of out.subcortical) log('   ', s.index, s.name, s.vertices.length / 3, 'sommets,', s.volume, 'cm³');
if (st.length < 18) log('attention : structures manquantes', items.filter(it => !st.some(s => s.labels[0] === it.labels[0])).map(it => it.name).join(', '));
log('régions de fond de sillon ajoutées (région, sommets)', JSON.stringify(out.added));
fs.writeFileSync(path.join(WORK, 'bst_meshes.json'), JSON.stringify(out));
log('bst_meshes.json écrit');
