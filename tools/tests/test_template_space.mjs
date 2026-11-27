// node tools/tests/test_template_space.mjs — v3.0.0 : gabarit MNI ICBM 152 NLin 2009b asymétrique.
// Fichiers du gabarit (surfaces, volume VEP, repères, méthode atlas, gabarits pédiatriques NIHPD) cohérents entre eux,
// bibliothèque d'électrodes en coordonnées MNI (miroir à droite), migration des dossiers d'avant la v3 (MNI305 → MNI 2009b),
// choix du gabarit pédiatrique de l'âge le plus proche. Données synthétiques (aucun dossier réel).
import fs from 'fs'; import vm from 'vm'; import assert from 'assert/strict';
globalThis.window = globalThis; globalThis.SV = globalThis.SV || {}; globalThis.atob = globalThis.atob || (s => Buffer.from(s, 'base64').toString('binary'));
for (const f of ['src/core.js', 'src/imaging/warp.js', 'src/store.js', 'src/atlas.js', 'src/electrodes.js']) vm.runInThisContext(fs.readFileSync(f, 'utf8'), { filename: f });
const S = SV.Store, E = SV.Electrodes; let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const J = f => JSON.parse(fs.readFileSync('assets/' + f, 'utf8'));
const mesh = J('brain_meshes.json'), vj = J('vep_volume.json'), tpl = J('template_anat.json'), spm = J('template_spm.json'), peds = J('templates_peds.json');

// ---------------------------------------------------------------- fichiers du gabarit
{
  for (const [nm, x] of [['brain_meshes', mesh.space], ['vep_volume', vj.space], ['template_anat', tpl.space], ['template_spm', spm.space], ['templates_peds', peds.space]]) ok(String(x).startsWith(S.TEMPLATE_SPACE), nm + ' : espace ' + x);
  ok(!('mni305_to_mni152' in tpl), 'plus de conversion MNI305 dans template_anat');
  const atlas = new SV.Atlas(mesh, null);
  ok(atlas.regions.length === 163 && atlas.regions.slice(1).every(r => r.centroid && r.n_vertices > 0), 'chaque région VEP a des sommets et un centre');
  for (const h of ['lh', 'rh']) { const H = atlas.hemis[h]; ok(H.n > 20000 && H.n < 65536 && H.faces.length === 3 * mesh.hemis[h].n_faces && H.labels.length === H.n, h + ' : maillage propre (' + H.n + ' sommets, index 16 bits)'); }
  const xs = atlas.hemis.lh.pial.filter((_, i) => i % 3 === 0); ok(Math.max(...xs) < 5 && Math.min(...xs) > -80, 'hémisphère gauche à gauche (x < 0), dimensions MNI');
  // v3.3.0 : surfaces du modèle ICBM152_2026 de Brainstorm (FreeSurfer 8.2.0 sur 2009c), mention de la source ; structures
  // profondes et cervelet de l'aseg du même modèle, découpées selon les régions VEP (hippocampe antérieur / postérieur)
  ok(/Brainstorm/.test(mesh.source) && /Tadel/.test(mesh.license) && /FreeSurfer/.test(mesh.license), 'surfaces : Brainstorm et FreeSurfer cités');
  const subIdx = mesh.subcortical.map(s => s.region_index).sort((a, b) => a - b);
  ok(subIdx.length === 18 && subIdx[0] === 145 && subIdx[17] === 162, '18 structures profondes VEP (145–162)');
  for (const [a, p] of [[145, 146], [154, 155]]) { const A = atlas.regions[a].centroid, P = atlas.regions[p].centroid; ok(A[1] > P[1] + 5 && Math.abs(A[0] - P[0]) < 10, 'hippocampe antérieur en avant du postérieur (' + a + ', ' + p + ')'); }
  ok(atlas.regions[153].centroid[2] < -20 && atlas.regions[153].centroid[1] < -40, 'cervelet en bas et en arrière');
  ok(Object.keys(tpl.centroids).length >= 90, 'repères du recalage : ' + Object.keys(tpl.centroids).length + ' classes');
  const vol = new E.Volume(vj), nm = (p) => { const l = vol.labelAt(...p); return l >= 1 && l <= 162 ? atlas.regions[l].name : l; };
  ok(/Amygdala/.test(nm([-22, -5, -18])) && /Amygdala/.test(nm([22, -4, -18])), 'amygdales aux coordonnées MNI attendues');
  ok(/Thalamus/.test(nm([-11, -18, 7])) && /Putamen/.test(nm([26, 2, 0])), 'thalamus et putamen');
  ok(nm([0, 0, 0]) !== 0 && vol.labelAt(0, 0, 100) === 0 && vol.labelAt(0, 0, -100) === 0, 'cerveau dans la boîte MNI');
  ok(spm.dims.length === 3 && spm.vox === 2 && ['t1', 'gm', 'wm', 'csf', 'seg'].every(k => typeof spm[k] === 'string' && spm[k].length > 1000), 'gabarit de la méthode atlas complet');
  ok(/Louis Collins/.test(mesh.license) && /Louis Collins/.test(spm.license) && /Louis Collins/.test(peds.license), 'avis de copyright du MNI conservé');
  const t1 = J('template_t1.json'); ok(t1.vox === 1 && t1.space === S.TEMPLATE_SPACE && t1.dims[0] > 150 && typeof t1.t1 === 'string' && t1.t1.length > 1e6 && /Louis Collins/.test(t1.license), 'T1 des coupes du gabarit à 1 mm (2009b haute résolution)');
}
// ---------------------------------------------------------------- bibliothèque d'électrodes
{
  const atlas = new SV.Atlas(mesh, null), vol = new E.Volume(vj), lib = E.LIBRARY;
  ok(lib.length >= 44 && lib.every(l => l.tip && l.entry && l.tip[0] < 0 && l.entry[0] < 0), 'trajectoires gauches explicites (' + lib.length + ')');
  for (const code of ['FA', 'PO', 'LI', 'O', 'Ib', 'PB', 'BM', 'BL']) ok(lib.some(l => l.code === code), 'trajectoire ' + code);
  let built = 0;
  for (const l of lib) {
    const L = E.fromLibrary(l, 'L', atlas, vol, {}), R = E.fromLibrary(l, 'R', atlas, vol, {});
    if (!L || !R) continue; built++;
    assert.ok(Math.abs(L.tip[0] + R.tip[0]) < 1e-9 && Math.abs(L.tip[1] - R.tip[1]) < 1e-9, l.code + ' : miroir exact de la pointe');
    if (l.n) assert.equal(E.modelById(L.model).n, l.n, l.code + ' : modèle de la bibliothèque');
  }
  ok(built === lib.length, 'toutes les trajectoires se construisent des deux côtés');
  const def = { BM: 'DIXI D08-18CM', BL: 'DIXI D08-15BM', Ia: 'DIXI D08-15BM', Im: 'DIXI D08-18CM', Ip: 'DIXI D08-18CM', Ib: 'DIXI D08-12AM' };
  for (const [code, id] of Object.entries(def)) { const e = E.fromLibrary(lib.find(l => l.code === code), 'L', atlas, vol, {}); assert.equal(e.model, id, code + ' : modèle par défaut ' + id); }
  ok(E.modelById('DIXI D08-18CM').groups && E.modelById('DIXI D08-15BM').groups, 'BM, Im, Ip (3 × 6) et BL, Ia (3 × 5) : électrodes à groupes espacés par défaut');
  ok(E.fromLibrary(lib.find(l => l.code === 'BM'), 'L', atlas, vol, { maker: 'Alcis' }).model !== 'DIXI D08-18CM', 'autre marque : modèle de cette marque');
  const fam = (code, h) => { const e = E.fromLibrary(lib.find(l => l.code === code), h, atlas, vol, {}); return e.contacts.slice(0, 3).map(c => c.label >= 1 && c.label <= 162 ? atlas.regions[c.label].family : '').join(' '); };
  ok(/Amygdala/.test(fam('A', 'L')) && /Hippocampus-anterior/.test(fam('B', 'R')) && /Temporal-pole/.test(fam('TP', 'L')), 'plots profonds dans la structure visée (A, B, TP)');
}
// ---------------------------------------------------------------- migration des dossiers d'avant la v3
{
  const d0 = S.newDossier({ pseudo: 'TS' }); ok(d0.templateSpace === S.TEMPLATE_SPACE, 'dossier neuf dans le gabarit 2009b');
  const ex = S.addExploration(d0, { kind: 'seeg', label: 'SEEG 1' });
  ex.electrodes.push({ id: 'e1', code: 'A', name: "A'", hemi: 'L', target: [-20, -5, -18], exit: null }, { id: 'e2', code: 'Ia', name: "Ia'", hemi: 'L', target: [-36, 12, -12], exit: [-38, 40, 42] });
  d0.anatomy = { status: 'done', date: '2025-01-01', toTemplate: [1, 0, 0, 2, 0, 1, 0, -3, 0, 0, 1, 1, 0, 0, 0, 1], toDisplay: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], mni: { method: 'tps', target: 'MNI305', steps: [{ kind: 'affine', T: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }] } };
  const raw = JSON.parse(JSON.stringify(d0)); delete raw.templateSpace;
  const d = S.normalize(raw), M = S.MNI305_TO_MNI152, ap = (T, p) => [0, 1, 2].map(r => T[4 * r] * p[0] + T[4 * r + 1] * p[1] + T[4 * r + 2] * p[2] + T[4 * r + 3]);
  ok(d.templateSpace === S.TEMPLATE_SPACE && d.anatomy.templateSpace === S.TEMPLATE_SPACE, 'ancien dossier marqué migré');
  const p = [10, 20, 30], q0 = ap([1, 0, 0, 2, 0, 1, 0, -3, 0, 0, 1, 1, 0, 0, 0, 1], p), q = ap(d.anatomy.toTemplate, p), qq = ap(M, q0);
  ok(q.every((v, i) => Math.abs(v - qq[i]) < 1e-3), 'patient → gabarit = MNI305→152 ∘ ancienne transformation');
  ok(d.anatomy.mni.steps.length === 2 && d.anatomy.mni.target === S.TEMPLATE_SPACE && d.anatomy.mni.migrated === 'MNI305', 'vers MNI : étape affine ajoutée');
  const m = S.toMNI(d, p); ok(m.every((v, i) => Math.abs(v - ap(M, p)[i]) < 1e-3), 'toMNI suit la chaîne migrée');
  const e1 = d.explorations[0].electrodes[0], e2 = d.explorations[0].electrodes[1];
  ok(e1.target.every((v, i) => Math.abs(v - ap(M, [-20, -5, -18])[i]) < 1e-2) && e1.exit === null && e2.exit.every((v, i) => Math.abs(v - ap(M, [-38, 40, 42])[i]) < 1e-2), 'cibles et sorties du schéma portées en MNI 2009b');
  ok(d.journal.some(j => /gabarit 3\.0/.test(j.text || j.what || JSON.stringify(j))) && d._snap === 'migrate', 'migration journalisée, révision gardée');
  const again = S.normalize(JSON.parse(JSON.stringify(d))); ok(JSON.stringify(again.explorations[0].electrodes) === JSON.stringify(d.explorations[0].electrodes) && JSON.stringify(again.anatomy.toTemplate) === JSON.stringify(d.anatomy.toTemplate), 'migration idempotente');
  const fresh = S.normalize(JSON.parse(JSON.stringify(d0))); ok(JSON.stringify(fresh.explorations[0].electrodes[0].target) === '[-20,-5,-18]', 'dossier v3 inchangé');
}
// ---------------------------------------------------------------- gabarits pédiatriques NIHPD
{
  const T = peds.templates; ok(T.length === 5 && T.every(t => t.builtin && t.landmarks && Object.keys(t.landmarks).length >= 90 && t.toMNI && t.toMNI.steps.length), '5 gabarits NIHPD avec repères et transformation vers 2009b');
  ok(T[0].ageMin === 4.5 && T[T.length - 1].ageMax === 18.5, 'tranches 4,5 → 18,5 ans');
  const pick = S.nearestAgeTemplate;
  ok(typeof pick === 'function', 'choix du gabarit de l’âge exposé par store.js');
  const id = a => (pick(T, a) || {}).id || null;
  ok(id(6) === 'nihpd-04.5-08.5' && id(2) === 'nihpd-04.5-08.5' && id(9) === 'nihpd-07.0-11.0' && id(10.6) === 'nihpd-07.5-13.5' && id(12.2) === 'nihpd-10.0-14.0' && id(16) === 'nihpd-13.0-18.5', 'tranche dont le centre est le plus proche de l’âge');
  ok(id(18.5) === null && id(40) === null && id(null) === null, 'adulte : 2009b directement');
  const lm = T[2].landmarks, out = SV.Warp.applyChain(T[2].toMNI.steps, lm[Object.keys(lm)[0]].slice(0, 3)); ok(out.every(isFinite), 'transformation NIHPD → 2009b applicable');
}
console.log('test_template_space :', n, 'vérifications');
