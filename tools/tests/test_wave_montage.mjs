// node tools/tests/test_wave_montage.mjs — v1.0.1 : polarité « négatif en haut » et montages SEEG (cascade sans pont, garde-fou scalp)
import fs from 'fs'; import vm from 'vm'; import assert from 'assert';
globalThis.window = globalThis; globalThis.SV = globalThis.SV || {};
for (const f of ['src/core.js', 'src/esi.js', 'src/ieeg.js']) vm.runInThisContext(fs.readFileSync(f, 'utf8'), { filename: f });
const W = SV.Wave, IE = SV.IEEG;
// polarité : par défaut une valeur positive est dessinée sous la ligne de base (ordonnée écran plus grande)
assert.equal(W.negUp, true); assert.ok(W.y(+50, 100, 1) > 100, 'positif en bas'); assert.ok(W.y(-50, 100, 1) < 100, 'négatif en haut');
W.negUp = false; assert.ok(W.y(+50, 100, 1) < 100); W.negUp = true;
// tracé : la fonction partagée de la visionneuse dessine un créneau négatif au-dessus de la ligne de base
const pts = []; const g = { beginPath() { }, moveTo(x, y) { pts.push(y); }, lineTo(x, y) { pts.push(y); }, stroke() { } };
const sig = new Float32Array(200); for (let i = 50; i < 100; i++) sig[i] = -100;   // créneau négatif
globalThis.document = globalThis.document || { getElementById: () => null };
const src = fs.readFileSync('src/ieeg_ui.js', 'utf8'), tr = src.slice(src.indexOf('  function trace('), src.indexOf('\n  }\n', src.indexOf('  function trace(')) + 4);
const trace = vm.runInThisContext('(' + tr.trim().replace(/^function trace/, 'function') + ')');
trace(g, sig, 0, 1, 100, 0.5); const m = sig.reduce((a, b) => a + b) / sig.length;
assert.ok(pts[75] < pts[10], 'le créneau négatif monte à l’écran (' + pts[75].toFixed(1) + ' < ' + pts[10].toFixed(1) + ')');
trace(g, sig, 0, 0.25, 100, 0.5);   // tracé compressé (min / max par pixel) : même sens
// montages : libellés d'un export Brainquick (plots 6 absents sur deux électrodes)
const names = []; for (const [e, n, miss] of [['NA', 15, 6], ['HM', 13, 6], ['BM', 15, 0], ['LS', 18, 0]]) for (let k = 1; k <= n; k++) if (k !== miss) names.push(e + k);
const chans = names.map(n => ({ name: n, type: 'SEEG' })).concat([{ name: 'MKR1+', type: 'TRIG' }, { name: 'ecg+', type: 'ECG' }]);
const B = IE.montage(chans, 'bipolar');
assert.ok(!B.some(d => d.name === 'NA5-NA7' || d.name === 'HM5-HM7'), 'aucune paire pontée');
assert.deepEqual(B.find(d => d.name === 'NA7-NA8').gapBefore, ['NA6'], 'trou signalé sur la paire suivante');
assert.equal(B.filter(d => d.elec === 'NA').length, 12); assert.equal(B.filter(d => d.elec === 'BM').length, 14);
for (const k of ['avg', 'lap', 'banana', 'trans']) { const D = IE.montage(chans, k); assert.ok(D.length && D.every(d => d.seeg && d.b >= 0), k + ' → bipolaire pour une SEEG'); }
// un vrai EEG de scalp garde ses montages
const scalp = ['Fp1', 'Fp2', 'F3', 'F4', 'C3', 'C4', 'P3', 'P4', 'O1', 'O2', 'F7', 'F8', 'T3', 'T4', 'T5', 'T6', 'Fz', 'Cz', 'Pz'].map(n => ({ name: n, type: 'EEG' }));
assert.ok(IE.montage(scalp, 'banana').some(d => /Fp1-F7/i.test(d.name)), 'double banane sur un scalp');
// v1.1.0 : références SEEG — moyenne commune et plot de référence choisi
const CAR = IE.montage(chans, 'car'); assert.equal(CAR.filter(d => d.seeg).length, names.length, 'moyenne commune : une voie par plot'); assert.ok(CAR.every(d => !d.seeg || (d.avg.length === names.length && d.k2 == null)));
const R = IE.montage(chans, 'ref:BM9'); assert.equal(R.filter(d => d.seeg).length, names.length - 1, 'plot de référence : toutes les voies sauf la référence');
const iRef = chans.findIndex(c => c.name === 'BM9'); assert.ok(R.filter(d => d.seeg).every(d => d.b === iRef && d.k2 == null && /-BM9$/.test(d.name)));
assert.equal(IE.montage(chans, "ref:bm9").filter(d => d.seeg).length, names.length - 1, 'casse indifférente');
const miss = IE.montage(chans, 'ref:Z9'); assert.ok(miss[0].refMissing === 'Z9' && miss.every(d => !d.seeg || d.b >= 0), 'référence absente → cascade, signalée');
// signal : plot − référence, et moyenne commune de moyenne nulle
const N = 64, data = chans.map((c, i) => Float32Array.from({ length: N }, (_, j) => (i + 1) * Math.sin(j / 5) + (c.name === 'BM9' ? 100 : 0)));
const dA = R.find(d => d.name === 'NA3-BM9'), yA = IE.deriveSignal(data, dA, 0, N); assert.ok(Math.abs(yA[10] - (data[dA.a][10] - data[iRef][10])) < 1e-3);
let sum = 0; for (const d of CAR.filter(x => x.seeg)) sum += IE.deriveSignal(data, d, 0, N)[7]; assert.ok(Math.abs(sum) < 1e-3, 'moyenne commune : somme des voies nulle');
assert.equal(IE.montageKey('ref:B’9'), 'ref_B’9'); assert.equal(IE.montageKey("ref:A'1 "), 'ref_A_1_'); assert.equal(IE.montageLabel('car'), 'moyenne commune');
console.log('OK polarité et montages —', B.length, 'paires bipolaires, références commune et choisie');
