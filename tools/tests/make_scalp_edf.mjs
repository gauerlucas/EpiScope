// node tools/tests/make_scalp_edf.mjs (depuis la racine du projet) → tools/tests/out/scalp_synth.edf (tracé de synthèse, hors git)
// EEG de scalp synthétique (EDF+) : 19 électrodes 10-20 + ECG, 256 Hz, 6 min ; fond 1/f + alpha postérieur ;
// pointes d'un générateur temporal antérieur gauche (dipôle, sphère 3 couches) toutes les ~4 s ; crise à 300 s :
// rythme thêta 6 Hz du même générateur, croissant ; annotations EDF+ « Début de crise » / « Fin de crise ».
import FS from 'fs'; import vm from 'vm';
globalThis.window = globalThis; globalThis.SV = {}; vm.runInThisContext(FS.readFileSync('src/esi.js', 'utf8'));
const E = SV.ESI, names = 'Fp1 Fp2 F7 F3 Fz F4 F8 T3 C3 Cz C4 T4 T5 P3 Pz P4 T6 O1 O2'.split(' '), m = names.length, fs = 256, dur = 360, T = fs * dur;
const P = names.map(n => E.STD[n]), sp = E.fitSphere(P), M = E.sphereModel({ c: [0, 0, 0], rBrain: sp.r * 0.86, rSkull: sp.r * 0.93, rScalp: sp.r });
const gain = (src, q) => names.map((n, i) => { const u = P[i].map((x, k) => x - sp.c[k]), r = Math.hypot(...u), g = E.sphereGain(M, u.map(x => x / r), src.map((x, k) => x - sp.c[k]), [0, 0, 0]); return g[0] * q[0] + g[1] * q[1] + g[2] * q[2]; });
const SRC = [-52, 6, -22], Q = [-0.75, 0.15, 0.25];   // temporal antérieur gauche (MNI), moment surtout radial
let topo = gain(SRC, Q); const mean = topo.reduce((s, x) => s + x, 0) / m; topo = topo.map(x => x - mean); const mx = Math.max(...topo.map(Math.abs)); topo = topo.map(x => x / mx);
let seed = 3; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
const X = names.map(() => new Float32Array(T)), st = names.map(() => [0, 0]);
for (let t = 0; t < T; t++) for (let i = 0; i < m; i++) { st[i][0] = 0.985 * st[i][0] + rnd() * 9; X[i][t] = st[i][0] + 6 * rnd(); }
const post = n => /^(O|P|T5|T6)/.test(n) ? 1 : /^C/.test(n) ? 0.35 : 0.15;
for (let i = 0; i < m; i++) { let ph = rnd() * 6; for (let t = 0; t < T; t++) { ph += 2 * Math.PI * (9.5 + 0.3 * Math.sin(t / fs / 7)) / fs; X[i][t] += 22 * post(names[i]) * Math.sin(ph) * (0.6 + 0.4 * Math.sin(t / fs / 3.1)); } }
const shape = k => { const tt = k / fs; return -Math.exp(-((tt / 0.02) ** 2)) + 0.4 * Math.exp(-(((tt - 0.1) / 0.07) ** 2)); };
const spikes = []; for (let s = 5; s < 290; s += 3 + 2 * Math.abs(rnd())) spikes.push(Math.round(s * fs));
for (const t0 of spikes) { const a = 110 + 40 * rnd(); for (let k = -60; k < 80; k++) { const v = shape(k) * a; for (let i = 0; i < m; i++) X[i][t0 + k] += topo[i] * v; } }
const on = 300 * fs, off = 330 * fs; for (let t = on; t < off; t++) { const e = Math.min(1, (t - on) / (3 * fs)) * (1 - Math.max(0, (t - off + 4 * fs) / (4 * fs))), v = 70 * e * Math.sin(2 * Math.PI * 6 * (t - on) / fs); for (let i = 0; i < m; i++) X[i][t] += topo[i] * v; }
const ecg = new Float32Array(T); for (let t = 0; t < T; t++) { const ph = (t / fs) % 0.85; ecg[t] = 400 * Math.exp(-(((ph - 0.3) / 0.012) ** 2)) - 60 * Math.exp(-(((ph - 0.5) / 0.05) ** 2)); }
// EDF+ : enregistrements de 1 s, int16, ±3276,7 µV ; voie d'annotations
const labels = names.map(n => 'EEG ' + n).concat(['ECG', 'EDF Annotations']), ns = labels.length, nsig = ns - 1, annN = 60;
const pad = (s, n) => String(s).slice(0, n).padEnd(n, ' ');
let hdr = pad('0', 8) + pad('X X X SYNTH_SCALP', 80) + pad('Startdate 01-JAN-2026 X X X', 80) + pad('01.01.26', 8) + pad('10.00.00', 8) + pad(256 * (ns + 1), 8) + pad('EDF+C', 44) + pad(dur, 8) + pad('1', 8) + pad(ns, 4);
const per = f => labels.map(f).join('');
hdr += per(l => pad(l, 16)) + per(l => pad(l === 'EDF Annotations' ? '' : 'AgAgCl', 80)) + per(l => pad(l === 'EDF Annotations' ? '' : 'uV', 8)) + per(l => pad(l === 'EDF Annotations' ? '-1' : '-3276.7', 8)) + per(l => pad(l === 'EDF Annotations' ? '1' : '3276.7', 8))
  + per(() => pad('-32768', 8)) + per(() => pad('32767', 8)) + per(l => pad(l === 'EDF Annotations' ? '' : 'HP:0.1Hz LP:70Hz', 80)) + per(l => pad(l === 'EDF Annotations' ? annN : fs, 8)) + per(() => pad('', 32));
const bufs = [Buffer.from(hdr, 'latin1')];
for (let r = 0; r < dur; r++) {
  const b = Buffer.alloc((nsig * fs + annN) * 2); let o = 0;
  for (let i = 0; i < nsig; i++) { const x = i < m ? X[i] : ecg; for (let k = 0; k < fs; k++) { b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[r * fs + k] * 10))), o); o += 2; } }
  let ann = `+${r}\x14\x14\x00`; if (r === 300) ann += '+300\x14Début de crise\x14\x00'; if (r === 330) ann += '+330\x14Fin de crise\x14\x00';
  const ab = Buffer.from(ann, 'latin1'); ab.copy(b, o); bufs.push(b);
}
FS.mkdirSync('tools/tests/out', { recursive: true }); FS.writeFileSync('tools/tests/out/scalp_synth.edf', Buffer.concat(bufs));
console.log('écrit', names.length, 'voies,', spikes.length, 'pointes, source', SRC, 'topo max', names[topo.map(Math.abs).indexOf(1)]);
