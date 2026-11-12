// node tools/tests/test_ctelec.mjs [dossier] — détection des électrodes sur le scanner synthétique (make_synth_ct.py)
import fs from 'fs'; import vm from 'vm';
for (const f of ['src/nifti.js', 'src/imaging/ctelec.js']) vm.runInThisContext(fs.readFileSync(f, 'utf8'));
const SV = globalThis.SV, dir = process.argv[2] || '/tmp/claude-0/ct';
const ct = await SV.Nifti.read(fs.readFileSync(dir + '/ct.nii.gz')), mask = await SV.Nifti.read(fs.readFileSync(dir + '/brainmask.nii.gz'));
const truth = JSON.parse(fs.readFileSync(dir + '/truth.json', 'utf8')).electrodes;
const t0 = Date.now();
const r = SV.CTElec.detect(ct, { mask, center: [0.5, -20, 5.5] }, p => { if (p.message && /trajectoires|électrodes|regroupement/.test(p.message)) console.log('  ', p.message); });
console.log(`détection : ${r.electrodes.length} électrodes en ${((Date.now() - t0) / 1000).toFixed(1)} s (seuil ${Math.round(r.threshold)} HU, ${r.nMetal} voxels)`);
const D = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
let ok = 0;
for (const t of truth) {
  const e = r.electrodes.slice().sort((a, b) => D(a.tip, t.tip) - D(b.tip, t.tip))[0];
  if (!e) { console.log('  manquée', t.tip); continue; }
  const ang = Math.acos(Math.min(1, Math.abs(e.dir[0] * t.dir[0] + e.dir[1] * t.dir[1] + e.dir[2] * t.dir[2]))) * 180 / Math.PI;
  const n = Math.min(e.contacts.length, t.contacts.length), cerr = t.contacts.slice(0, n).map((c, k) => D(c, e.contacts[k])), mean = cerr.reduce((s, x) => s + x, 0) / n;
  const good = D(e.tip, t.tip) < 1.5 && ang < 3 && e.n === t.n && mean < 1.2; if (good) ok++;
  console.log(`  vrai n=${String(t.n).padStart(2)} · trouvé n=${String(e.n).padStart(2)} (obs ${e.nObs}) · pointe ${D(e.tip, t.tip).toFixed(2)} mm · angle ${ang.toFixed(1)}° · plots ${mean.toFixed(2)} mm (max ${Math.max(...cerr).toFixed(2)}) ${good ? '✓' : '✗'}`);
}
console.log(`${ok}/${truth.length} électrodes correctes ; ${r.electrodes.length - truth.length} en trop`);
// affinage manuel : deux clics approximatifs (3 mm d'erreur)
const t = truth[3], a = t.tip.map((v, k) => v + [2, -2, 1.5][k]), b = t.contacts[t.n - 1].map((v, k) => v + [-1.5, 2.5, 2][k] + t.dir[k] * 6);
const f = SV.CTElec.refine(ct, {}, a, b);
console.log(`affinage depuis deux clics : pointe ${D(f.tip, t.tip).toFixed(2)} mm, n=${f.n} (vrai ${t.n}), angle ${(Math.acos(Math.abs(f.dir.reduce((s, v, k) => s + v * t.dir[k], 0))) * 180 / Math.PI).toFixed(1)}°`);
