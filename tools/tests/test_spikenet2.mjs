// node tools/tests/test_spikenet2.mjs — v2.1.0 : SpikeNet2 (spikenet2.js) sur un point de contrôle SYNTHÉTIQUE (poids
// aléatoires, architecture réduite, enregistré par PyTorch Lightning comme le vrai : tools/tests/make_synth_spikenet2.py) :
// lecture du .ckpt (zip, pickle, état de l'optimiseur ignoré), architecture déduite, forme compacte EPSN2, entrée du réseau
// (double banane + référence moyenne, voies hors [20, 2000] µV mises à zéro, 95e centile) et sortie = PyTorch.
import fs from 'fs'; import vm from 'vm'; import assert from 'assert';
globalThis.window = globalThis; globalThis.SV = {}; globalThis.require = (await import('module')).createRequire(import.meta.url);
vm.runInThisContext(fs.readFileSync('src/spikenet2.js', 'utf8'));
const N = SV.SpikeNet2, R = JSON.parse(fs.readFileSync('tools/tests/fixtures/spikenet2_synth.json', 'utf8')), ck = fs.readFileSync('tools/tests/fixtures/spikenet2_synth.ckpt');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('ok', m); };
// 1. lecture du point de contrôle
const L = await N.readCkpt(ck), c = L.cfg;
ok(c.cin === 37 && c.k === 16 && c.base === 8 && c.stages.length === 7 && c.stages.map(s => s.length).join() === '2,1,1,2,1,1,2', `architecture lue : ${c.stages.length} étages, blocs ${c.stages.map(s => s.length).join('-')}, noyau ${c.k}`);
ok(c.stages[1][0].groups === 4 && c.stages[0][0].first && !c.stages[0][1].first && c.stages[3][1].down === false, 'groupes (largeur 4), premier bloc sans pré-activation, pas 2 au premier bloc de chaque étage');
ok(!Object.keys(L.T).some(k => /exp_avg|num_batches/.test(k)) && L.T['dense.weight'].shape.join() === '1,48', 'seuls les tenseurs du réseau sont lus (pas l’état de l’optimiseur)');
// 2. forme compacte EPSN2
const buf = await N.pack(L, { source: 'test' }), H = N.header(buf);
ok(H.format === 'EPSN2' && /^[0-9a-f]{64}$/.test(H.sha) && H.nParams > 1000 && H.source === 'test', `EPSN2 : ${H.nParams} paramètres, empreinte ${H.sha.slice(0, 12)}…`);
ok(N.header(await N.pack(await N.readCkpt(ck), { source: 'test' })).sha === H.sha, 'conversion déterministe (même empreinte)');
// 3. entrée du réseau = code des auteurs (numpy)
const raw = R.raw.map(a => Float32Array.from(a)), inp = Float32Array.from(R.inp), X = new Float32Array(raw.length * 37 * 128);
raw.forEach((r, w) => { const D = Array.from({ length: 19 }, (_, k) => r.subarray(k * 128, (k + 1) * 128)); N.prepWindow(D, 0, X, w * 37 * 128); });
{ let mx = 0; for (let i = 0; i < X.length; i++) mx = Math.max(mx, Math.abs(X[i] - inp[i])); ok(mx < 1e-4, `entrée (37 × 128, 4 fenêtres dont voie plate et voie saturée) : max |Δ| = ${mx.toExponential(1)}`); }
ok(X.subarray(2 * 37 * 128, 3 * 37 * 128).every(v => v === 0) && X.subarray(3 * 37 * 128 + 8 * 128, 3 * 37 * 128 + 9 * 128).every(v => v === 0), 'voies hors [20, 2000] µV crête à crête mises à zéro');
// 4. calcul = PyTorch
const M = N.load(buf), P = N.forward(M, inp, 4);
{ let mx = 0; for (let i = 0; i < 4; i++) mx = Math.max(mx, Math.abs(P[i] - R.p[i])); ok(mx < 1e-5, `sortie = PyTorch (4 fenêtres) : max |Δ| = ${mx.toExponential(1)}`); }
{ const P1 = N.forward(M, inp.subarray(37 * 128, 2 * 37 * 128), 1); ok(Math.abs(P1[0] - P[1]) < 1e-6, 'une fenêtre seule = la même dans un lot'); }
// 5. balayage d'un signal continu : fenêtres tous les 32 échantillons
{ const T = 128 * 6, D = Array.from({ length: 19 }, (_, k) => Float32Array.from({ length: T }, (_, i) => 20 * Math.sin(2 * Math.PI * (4 + k / 3) * i / 128) + 5 * Math.cos(i * (k + 1))));
  const S = N.scan(buf, D, 32), Xw = new Float32Array(37 * 128); N.prepWindow(D, 64, Xw, 0);
  ok(S.p.length === Math.floor((T - 128) / 32) + 1 && Math.abs(S.p[2] - N.forward(M, Xw, 1)[0]) < 1e-6, `balayage : ${S.p.length} fenêtres, la 3e = fenêtre débutant à 64`); }
// 6. fichier qui n'est pas un point de contrôle
await assert.rejects(N.readCkpt(Buffer.from('pas un zip')), /point de contrôle/); n++; console.log('ok', 'fichier quelconque refusé avec un message clair');
console.log(`${n} vérifications SpikeNet2`);
