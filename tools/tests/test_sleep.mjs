// node tools/tests/test_sleep.mjs — v5.5 : stadification du sommeil (portage de YASA, sleep.js), détecteur de pointes de
// Janča 2015 et montage d'enregistrement du scalp (esi.js). Référence YASA Python (p10, 360 époques) : accord 98,9 %.
import fs from 'fs'; import vm from 'vm'; import assert from 'assert';
globalThis.window = globalThis; globalThis.SV = {}; globalThis.atob = s => Buffer.from(s, 'base64').toString('binary');
vm.runInThisContext(fs.readFileSync('src/sleep.js', 'utf8')); vm.runInThisContext(fs.readFileSync('src/esi.js', 'utf8'));
const S = SV.Sleep, E = SV.ESI; let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('ok', m); };
let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
// 1. Simpson (scipy, correction de Cartwright) : intégrale exacte d'un polynôme de degré 2
{ const y = Array.from({ length: 8 }, (_, i) => (i * 0.2) ** 2), v = S.simpson(y, 0.2); ok(Math.abs(v - 1.4 ** 3 / 3) < 1e-9, `Simpson, 8 points (pair) : ${v.toFixed(6)} = ${(1.4 ** 3 / 3).toFixed(6)}`); }
// 2. filtre 0,4–30 Hz identique à mne.filter.create_filter (825 coefficients, extraits)
{ const h = S.firBand(0, 0.4, 30, 100); ok(h.length === 825 && Math.abs(h[0] - 5.552491e-5) < 1e-9 && Math.abs(h[412] - 0.6702615) < 1e-6 && Math.abs(h.reduce((a, b) => a + b, 0)) < 1e-9, 'RIF 0,4–30 Hz = mne.filter.create_filter (825 coefficients, gain nul en continu)'); }
// 3. entropie de permutation, Higuchi, Petrosian
{ const lin = Float32Array.from({ length: 3000 }, (_, i) => i), wn = Float32Array.from({ length: 3000 }, gauss); ok(S.permEnt(lin) === 0 && S.permEnt(wn) > 0.99, `entropie de permutation : droite 0, bruit blanc ${S.permEnt(wn).toFixed(3)}`);
  const hg = S.higuchi(wn, 10); ok(hg > 1.9 && hg < 2.1, `dimension de Higuchi du bruit blanc ${hg.toFixed(2)} (≈ 2)`); }
// 4. descripteurs d'un tracé synthétique (sommeil lent : delta ample) et classifieur
{ const fs = 256, N = fs * 60 * 12, x = new Float32Array(N); for (let i = 0; i < N; i++) { const t = i / fs, slow = i > N / 2; x[i] = (slow ? 80 * Math.sin(2 * Math.PI * 1.2 * t) : 12 * Math.sin(2 * Math.PI * 10 * t)) + 6 * gauss(); }
  const Fe = S.features(x, fs, {}), M = S.loadModel(JSON.parse(fs_read('assets/models/yasa_eeg.json'))), P = S.predict(M, Fe);
  ok(Fe.n === 24 && Fe.names.length === 65 && P.every(p => Math.abs(p.p.reduce((a, b) => a + b, 0) - 1) < 1e-9), `24 époques de 30 s, 65 descripteurs, probabilités normalisées`);
  const late = P.slice(14).filter(p => p.stage === 'N3' || p.stage === 'N2').length, early = P.slice(0, 10).filter(p => p.stage === 'W' || p.stage === 'N1' || p.stage === 'R').length;
  ok(late >= 8 && early >= 6, `alpha 10 Hz → éveil (${early}/10), delta 1,2 Hz ample → sommeil lent (${late}/10)`); }
function fs_read(p) { return fs.readFileSync(p, 'utf8'); }
// 5. Janča 2015 : pointes injectées dans un bruit de fond, retrouvées sur ≥ 2 voies
{ const fs = 256, T = fs * 120, m = 6, X = Array.from({ length: m }, () => new Float32Array(T)); for (const x of X) { let a = 0; for (let i = 0; i < T; i++) { a = 0.95 * a + gauss() * 4; x[i] = a; } }
  const at = []; for (let s = 5; s < 115; s += 4.3) { at.push(s); const c = Math.round(s * fs); for (let ch = 0; ch < 3; ch++) for (let k = -20; k <= 20; k++) X[ch][c + k] += (ch === 0 ? 120 : 70) * Math.exp(-(k * k) / 18) * (k < 0 ? 1 : 1.2); }
  const R = E.spikeScan(X, fs, 1, 35, 5, null, { det: 'janca' }), tt = R.ev.map(e => e.t / fs), hit = at.filter(s => tt.some(t => Math.abs(t - s) < 0.1)).length, fp = tt.filter(t => !at.some(s => Math.abs(t - s) < 0.1)).length;
  ok(hit >= at.length - 1 && fp <= 2, `Janča : ${hit}/${at.length} pointes retrouvées, ${fp} fausse(s) détection(s)`); }
// 6. montage d'enregistrement
{ const chb = 'FP1-F7 F7-T7 T7-P7 P7-O1 FP1-F3 F3-C3 C3-P3 P3-O1 FP2-F4 F4-C4 C4-P4 P4-O2 FZ-CZ CZ-PZ'.split(' '), ref = 'Fp1-Ref Fp2-Ref F3-Ref F4-Ref C3-Ref C4-Ref P3-Ref P4-Ref O1-Ref O2-Ref F7-Ref'.split(' '), cz = 'Fp1-Cz Fp2-Cz F3-Cz F4-Cz C3-Cz C4-Cz P3-Cz P4-Cz O1-Cz'.split(' ');
  const seeg = []; for (const e of 'FCPOTAB') for (let k = 1; k <= 12; k++) seeg.push(e + k);
  ok(E.recordedMontage(chb).sub === 'long' && E.recordedMontage(ref).ref === 'Ref' && E.recordedMontage(cz).ref === 'Cz' && E.isScalp(chb) && !E.isScalp(seeg), 'montage enregistré : double banane (CHB-MIT), référence Ref / Cz ; SEEG F1…F12 non pris pour du scalp'); }
console.log(`test_sleep : ${n} vérifications OK`);
