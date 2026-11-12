// node tools/tests/test_spikenet.mjs — v5.6 : SpikeNet1.o (spikenet.js) contre sa référence numpy (poids Keras h5,
// prétraitement MNE de run_spikenet.py ; spikenet_ref.json), évènements, recalage d'une fenêtre sur la pointe et
// interpolation des électrodes manquantes (esi.js). Sur le tracé publié des auteurs : max |Δ| 3,3e-7 (vérifié à l'export).
import fs from 'fs'; import vm from 'vm'; import assert from 'assert';
globalThis.window = globalThis; globalThis.SV = {}; globalThis.atob = s => Buffer.from(s, 'base64').toString('binary');
vm.runInThisContext(fs.readFileSync('src/esi.js', 'utf8')); vm.runInThisContext(fs.readFileSync('src/spikenet.js', 'utf8'));
const N = SV.SpikeNet, E = SV.ESI, J = JSON.parse(fs.readFileSync('assets/models/spikenet1.json', 'utf8')), R = JSON.parse(fs.readFileSync('tools/tests/spikenet_ref.json', 'utf8'));
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('ok', m); };
// signal de mkref : 19 voies, 60 s à 128 Hz (sinus, secteur 50 Hz, pointes F4/C4/Fp2/F8)
const fs0 = 128, T = 128 * 60, X = Array.from({ length: 19 }, (_, c) => Float32Array.from({ length: T }, (_, i) => 20 * Math.sin(2 * Math.PI * (3 + 0.37 * c) * i / fs0 + c) + 8 * Math.sin(2 * Math.PI * (11.3 + 0.11 * c) * i / fs0) + 5 * Math.sin(2 * Math.PI * 50 * i / fs0 + 0.3 * c)));
for (const s of R.spikes) for (const [c, g] of [[12, 1], [13, 0.6], [11, 0.5], [15, 0.4]]) for (let i = 0; i < T; i++) { const t = (i - s * fs0) / fs0; X[c][i] += g * (-150 * Math.exp(-((t / 0.018) ** 2)) + 60 * Math.exp(-(((t - 0.09) / 0.06) ** 2))); }
// 1. modèle exporté
{ const M = N.load(J); ok(M.mono.length === 19 && M.bip.length === 18 && M.wd.length === 256 && M.filt['50'] && M.filt['60'], '19 électrodes, 18 voies bipolaires, 256 descripteurs, filtres 50 et 60 Hz'); }
// 2. calcul incrémental = référence numpy fenêtre par fenêtre
const D = N.prep(J, X, fs0, 50), S8 = N.scan(J, D, 8);
{ let mx = 0; for (let w = 0; w < R.p.length; w++) mx = Math.max(mx, Math.abs(S8.p[w] - R.p[w])); ok(S8.p.length === R.p.length && mx < 1e-4, `${R.p.length} fenêtres : max |Δ| = ${mx.toExponential(1)} contre la référence numpy`); }
// 3. pas fin (4) : mêmes valeurs aux positions communes ; descripteurs → même probabilité par la couche dense
{ const S4 = N.scan(J, D, 4); let mx = 0; for (let w = 0; w < S8.p.length; w++) mx = Math.max(mx, Math.abs(S4.p[2 * w] - S8.p[w])); ok(mx < 1e-6, `pas de 4 et de 8 identiques aux fenêtres communes (max |Δ| ${mx.toExponential(1)})`);
  const F = N.scan(J, D.map(d => d.subarray(0, 128 * 3)), 128, { feat: true }), M = N.load(J); let z = M.bd; for (let k = 0; k < 256; k++) z += F.f[k] * M.wd[k];
  ok(Math.abs(1 / (1 + Math.exp(-z)) - F.p[0]) < 1e-5, 'descripteurs (256) → couche dense → même probabilité (base de l’adaptation au patient)'); }
// 4. évènements : régions au-dessus du seuil réunies à < 150 ms, temps = centre de la fenêtre la plus probable
{ const P = new Float32Array(200); P.fill(0.1); for (let w = 40; w < 50; w++) P[w] = 0.7; P[45] = 0.9; P[51] = 0.6; for (let w = 120; w < 125; w++) P[w] = 0.55;
  const ev = N.events(P, 8, 0.5, 10); ok(ev.length === 2 && Math.abs(ev[0].t - (10 + (45 * 8 + 64) / 128)) < 1e-9 && ev[0].p > 0.89 && Math.abs(ev[1].p - 0.55) < 1e-6, `2 évènements (régions réunies à < 150 ms), t = ${ev[0].t.toFixed(3)} s`); }
// 5. recalage d'une fenêtre de 1 s sur la composante aiguë (pente maximale puis GFP à ± 40 ms)
{ const fs = 256, L = fs * 10, Y = Array.from({ length: 8 }, (_, c) => Float32Array.from({ length: L }, (_, i) => 15 * Math.sin(2 * Math.PI * 2 * i / fs + c))), t0 = Math.round(4.3 * fs);
  for (let c = 0; c < 8; c++) for (let i = 0; i < L; i++) { const t = (i - t0) / fs; Y[c][i] += (c < 4 ? 1 : -0.6) * 120 * Math.exp(-((t / 0.015) ** 2)); }
  const R1 = E.spikeScan(Y, fs, 1, 45, 3, null, { times: [t0 + Math.round(0.3 * fs)], amps: [0.8], srch: 0.4, det: 'spikenet' }), d = Math.abs(R1.ev[0].t - t0) / fs * 1000;
  ok(d < 8 && R1.det === 'spikenet' && R1.ev[0].amp === 0.8, `fenêtre décalée de 300 ms recalée sur la pointe (écart ${d.toFixed(1)} ms)`); }
// 6. électrodes manquantes : spline sphérique (Perrin 1989) — somme des poids 1, champ lisse reproduit
{ const pr = J.mono.filter(m => m !== 'Cz' && m !== 'Pz'), W = E.splineWeights(pr, ['Cz', 'Pz']), P = n => E.STD[E.stdName(n)], c = E.fitSphere(Object.values(E.STD)).c;
  const f = n => { const p = P(n), v = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], r = Math.hypot(...v); return 40 * v[1] / r + 25 * v[0] / r; };   // champ de degré 1
  const err = ['Cz', 'Pz'].map((m, r) => Math.abs(W[r].reduce((s, w, j) => s + w * f(pr[j]), 0) - f(m))), sw = W.map(w => w.reduce((a, b) => a + b, 0));
  ok(sw.every(s => Math.abs(s - 1) < 1e-3) && err.every(e => e < 3), `Cz, Pz interpolées : Σ poids = ${sw.map(s => s.toFixed(3)).join(', ')} ; erreur sur un champ lisse ${err.map(e => e.toFixed(2)).join(', ')} µV (amplitude 47 µV)`); }
// 7. filtre propre au patient : descripteurs de deux sortes (pointes gardées / artefact rejeté), séparables sur 20 dimensions
{ const M = N.load(J); let sd = 5; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647, g = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const X = [], y = []; for (let i = 0; i < 160; i++) { const k = i % 4 ? 1 : 0, f = Float32Array.from({ length: 256 }, (_, j) => Math.max(0, 0.05 + 0.03 * g() + (j < 20 ? (k ? 0.04 : -0.04) : 0))); X.push(f); y.push(k); }
  const cv = N.filterCV(M, X, y, 0.5); ok(cv.sens >= 0.9 && cv.spec >= 0.9, `filtre patient (validation croisée) : ${Math.round(cv.sens * 100)} % des gardées conservées, ${Math.round(cv.spec * 100)} % des rejetées retirées`); }
console.log(`\n${n} vérifications SpikeNet réussies`);
