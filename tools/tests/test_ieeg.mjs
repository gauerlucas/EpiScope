// node tools/tests/test_ieeg.mjs — depuis la racine du dépôt
// Tracés SEEG et index d'épileptogénicité (v4.12, SV.IEEG) sur des données synthétiques (aucune donnée patient) :
//   lecture BrainVision (aller-retour), EDF+ (annotations), .eeg BIDS tronqué (channels.tsv + _ieeg.json, volts),
//   montages, rapport d'énergie sur des sinusoïdes, Page–Hinkley sur un saut connu, EI de Bartolomei (2008) sur une crise
//   synthétique (zone de début B’ > A’ > TB’ > propagation > structures non atteintes) ;
//   v4.15 (SV.IEEGM) : h² non linéaire (délai et direction), cEI, entropie de permutation et PEI, détecteur Delphos
//   (ripples, fast ripples et pointes insérés dans un fond 1/f, taux par voie sur une crise synthétique avec activité intercritique) ;
//   v4.18 : lois de Student, FDR, temps-fréquence de Morlet, empreinte (Grinenko 2018) et cartes d'épileptogénicité (David 2011)
//   sur une crise synthétique (synthFP), étalement des valeurs sur une grille (carte sur l'IRM) ;
//   v4.20 : seuils EI / PZ, EImax, temporalité de l'empreinte et des EM, empreinte connectivité.
import fs from 'fs'; import vm from 'vm'; import path from 'path'; import os from 'os';
import { synthSeizure, writeBrainVision, synthFP } from './synth_seeg.mjs';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
globalThis.window = globalThis; globalThis.SV = {};
vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'src/stats.js'), 'utf8'), { filename: 'src/stats.js' });
vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'src/ieeg.js'), 'utf8'), { filename: 'src/ieeg.js' });
vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'src/ieeg_methods.js'), 'utf8'), { filename: 'src/ieeg_methods.js' });
const IE = SV.IEEG, IM = SV.IEEGM;
let nOk = 0, nFail = 0; const ok = (c, msg) => { console.log((c ? '  ok    ' : '  ÉCHEC  ') + msg); c ? nOk++ : nFail++; };
const near = (a, b, t) => Math.abs(a - b) <= t;
const ab = b => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ieeg-'));

// --- BrainVision : écriture puis lecture (INT_16, 0,1 µV) avec les fichiers BIDS d'accompagnement
const rec = synthSeizure({ dur: 120 }), base = 'sub-synth_task-ictal';
writeBrainVision(tmp, base, rec);
const rd = f => fs.readFileSync(path.join(tmp, base + f));
let t0 = performance.now();
const R = IE.openRecording({ vhdr: rd('_ieeg.vhdr').toString('utf8'), vmrk: rd('_ieeg.vmrk').toString('utf8'), eeg: ab(rd('_ieeg.eeg')), channels: rd('_channels.tsv').toString('utf8'), events: rd('_events.tsv').toString('utf8'), json: rd('_ieeg.json').toString('utf8') });
console.log(`    lecture BrainVision ${R.channels.length} voies × ${R.duration} s : ${(performance.now() - t0).toFixed(0)} ms`);
ok(R.kind === 'brainvision' && R.fs === 512 && R.nSamples === rec.nSamples && R.channels.length === 64 && R.channels[0].name === 'B’1', 'BrainVision : fréquence, nombre d’échantillons, noms (prime typographique)');
let maxErr = 0; for (const c of [0, 17, 63]) for (let i = 0; i < R.nSamples; i += 97) maxErr = Math.max(maxErr, Math.abs(R.data[c][i] - rec.data[c][i]));
ok(maxErr <= 0.051, `BrainVision : valeurs à la résolution près (écart max ${maxErr.toFixed(3)} µV)`);
const mk = IE.seizureMarks(R.events);
ok(near(mk.onset, 60, 0.01) && near(mk.end, 100, 0.01) && R.events.length === 2, 'marqueurs .vmrk et events.tsv fusionnés sans doublon ; début et fin de crise reconnus');
ok(R.line === 50 && R.channels.every(c => c.type === 'SEEG' && c.status === 'good'), 'secteur (_ieeg.json) et statut des voies (channels.tsv)');

// --- EDF+ : 3 voies + annotations
function writeEDF(sigs, fsr, nrec, ann, o) {
  o = o || {}; const ns = sigs.length + 1, hb = 256 * (ns + 1), spr = fsr, annN = 60, pad = (s, n) => String(s).padEnd(n).slice(0, n);
  let H = pad('0', 8) + pad('X', 80) + pad(o.rec || 'Startdate X', 80) + pad('01.01.26', 8) + pad('10.00.00', 8) + pad(hb, 8) + pad(o.kind || 'EDF+C', 44) + pad(nrec, 8) + pad(1, 8) + pad(ns, 4);
  const labels = sigs.map(s => s.name).concat(['EDF Annotations']), F = (fn) => labels.map(fn).join(''), recT = r => o.recT ? o.recT(r) : r;
  H += F(l => pad(l, 16)) + F((l, i) => pad(i < sigs.length ? (sigs[i].trans || '') : '', 80)) + F((l, i) => pad(i < sigs.length ? 'uV' : '', 8)) + F((l, i) => pad(i < sigs.length ? -3276.8 : -1, 8)) + F((l, i) => pad(i < sigs.length ? 3276.7 : 1, 8)) + F(() => pad(-32768, 8)) + F(() => pad(32767, 8)) + F(() => pad('', 80)) + F((l, i) => pad(i < sigs.length ? spr : annN / 2, 8)) + F(() => pad('', 32));
  const recB = (sigs.length * spr + annN / 2) * 2, buf = Buffer.alloc(hb + nrec * recB); buf.write(H, 0, 'latin1');
  for (let r = 0; r < nrec; r++) {
    let o = hb + r * recB;
    for (const s of sigs) for (let i = 0; i < spr; i++, o += 2) buf.writeInt16LE(Math.round(s.x[r * spr + i] / 0.1), o);
    let tal = `+${recT(r)}\x14\x14\x00`; for (const a of ann) if (Math.floor(a.onset) === r) tal += `+${recT(r) + a.onset - r}\x14${a.label}\x14\x00`;
    buf.write(tal, o, 'latin1');
  }
  return buf;
}
{
  const fsr = 256, n = fsr * 10, mkx = f => Float32Array.from({ length: n }, (_, i) => 100 * Math.sin(2 * Math.PI * f * i / fsr));
  const edf = writeEDF([{ name: "A'1", x: mkx(5) }, { name: "A'2", x: mkx(10) }, { name: 'ECG', x: mkx(1) }], fsr, 10, [{ onset: 4.5, label: 'début de crise' }]);
  const E = IE.openRecording({ edf: ab(edf) });
  ok(E.kind === 'edf+' && E.fs === 256 && E.nSamples === n && E.channels.map(c => c.name).join() === "A'1,A'2,ECG", 'EDF+ : voies, fréquence, durée (canal d’annotations écarté)');
  ok(near(E.data[1][37], 100 * Math.sin(2 * Math.PI * 10 * 37 / fsr), 0.11), 'EDF+ : mise à l’échelle physique');
  ok(E.events.length === 1 && near(E.events[0].onset, 4.5, 1e-6) && IE.seizureMarks(E.events).onset === 4.5, 'EDF+ : annotation TAL lue (début de crise)');
  // v4.21 : export Brainquick / Micromed — préfixes « EEG », « ECG », « Value », transducteur Monopolar, EDF+D avec une coupure, mois en français
  { const sig = [{ name: 'EEG NA1', x: mkx(5), trans: 'Monopolar' }, { name: 'EEG NA2', x: mkx(7), trans: 'Monopolar' }, { name: 'EEG NA4', x: mkx(9), trans: 'Monopolar' }, { name: 'ECG ecg+', x: mkx(1), trans: 'Bipolar' }, { name: 'Value MKR1+', x: mkx(2), trans: 'Marker' }, { name: 'SaO2 SpO2+', x: mkx(1), trans: 'Oxymeter' }];
    const edfD = writeEDF(sig, fsr, 10, [{ onset: 7.25, label: 'crise' }], { kind: 'EDF+D', rec: 'Startdate 02-JUIN-2021 X X X', recT: r => r < 6 ? r : r + 1584 });
    const D2 = IE.openRecording({ edf: ab(edfD) }), names = D2.channels.map(c => c.name), typ = D2.channels.map(c => c.type), cut = D2.events.find(e => /coupure/.test(e.label)), ev = D2.events.find(e => e.label === 'crise');
    ok(names.join() === 'NA1,NA2,NA4,ecg+,MKR1+,SpO2+' && typ.slice(0, 3).every(t => t === 'SEEG') && typ[3] === 'ECG' && typ[4] === 'TRIG' && D2.channels.slice(3).every(c => !IE.isSeegChannel(c)) && IE.isSeegChannel(D2.channels[0]), `Brainquick : préfixes retirés (${names.slice(0, 4).join(', ')}), types déduits, voies ECG / marqueurs / SpO2 hors SEEG`);
    ok(D2.segments && D2.segments.length === 2 && D2.segments[1].sample0 === 6 * fsr && cut && near(cut.onset, 6, 1e-6) && /26 min/.test(cut.label) && D2.warnings.some(w => /discontinu/.test(w)), `EDF+D : 2 segments, coupure de 26 min marquée à 6 s du tracé (${cut && cut.label})`);
    ok(ev && near(ev.onset, 7.25, 1e-6) && D2.startDate === '2021-06-02' && D2.bipolarIn === false, `EDF+D : évènement après la coupure ramené au temps du tracé (${ev && ev.onset} s) ; date « 02-JUIN-2021 » lue (${D2.startDate})`);
    const B2 = IE.montage(D2.channels, 'bipolar'); ok(B2.length === 1 && B2[0].name === 'NA1-NA2', `montage bipolaire après préfixes : NA1-NA2 seulement (NA3 absent) — ${B2.map(x => x.name).join(', ')}`); }
  const M = IE.montage(E.channels, 'mono');
  ok(M[M.length - 1].name === 'ECG' && !M[M.length - 1].seeg && IE.montage(E.channels, 'bipolar').map(d => d.name + d.elec).join() === "A'1-A'2A’", 'montages : ECG à la fin en monopolaire, exclu du bipolaire');
}

// --- .eeg BIDS sans .vhdr, tronqué, valeurs en volts
{
  const nch = 3, ns = 1000, f = new Float32Array(nch * ns + 2); for (let s = 0; s < ns; s++) for (let c = 0; c < nch; c++) f[s * nch + c] = 1e-5 * Math.sin(s / 10 + c);
  const B = IE.openRecording({ eeg: f.buffer, channels: 'name\ttype\tunits\tstatus\nLA1\tSEEG\tµV\tgood\nLA2\tSEEG\tµV\tbad\nEKG\tECG\tµV\tgood\n', json: JSON.stringify({ SamplingFrequency: 1000, PowerLineFrequency: 60 }) });
  ok(B.kind === 'bids-raw' && B.nSamples === ns && B.warnings.some(w => /tronqué/.test(w)), '.eeg BIDS : lecture jusqu’au dernier échantillon complet, avertissement de troncature');
  ok(B.warnings.some(w => /volts/.test(w)) && near(B.data[0][10], 10 * Math.sin(1), 1e-3) && B.line === 60, '.eeg BIDS : volts convertis en µV, secteur 60 Hz');
  ok(IE.montage(B.channels, 'bipolar').length === 0 && IE.montage(B.channels, 'mono')[1].bad, 'voie « bad » de channels.tsv : écartée du bipolaire, signalée en monopolaire');
}

// --- v4.14 : libellés de crise reconnus (marqueur « Seizure » seul, fin en français, sans fin)
{
  const ev = (...l) => l.map(([t, label]) => ({ onset: t, label })), M = IE.seizureMarks;
  const a = M(ev([120.3, 'Seizure'])), b = M(ev([50, 'spike'], [120.3, 'Seizure'], [150, 'end'])), c = M(ev([10, 'SZ 1'], [40, 'fin de crise'])), d = M(ev([5, 'Seizure onset'], [60, 'Seizure offset'])), e = M(ev([5, 'artefact']));
  ok(a.onset === 120.3 && a.end == null && b.onset === 120.3 && b.end === 150 && c.onset === 10 && c.end === 40 && d.onset === 5 && d.end === 60 && e.onset == null, 'marqueurs de crise : « Seizure » seul, « SZ 1 », « fin de crise », « onset / offset », aucun');
}

// --- correspondance des électrodes du tracé avec le schéma
ok(IE.matchElectrode('LA', ['A’', 'B’']) === 'A’' && IE.matchElectrode('RA', ['A', 'A’']) === 'A' && IE.matchElectrode('Ap', ['A’']) === 'A’' && IE.matchElectrode("TB'", ['TB’']) === 'TB’' && IE.matchElectrode('LOFS', ['A’']) === null, 'correspondance : identique, prime (’ ou p), convention L/R');
ok(IE.parseContact('GPH’12').elec === 'GPH’' && IE.parseContact("A'3").k === 3 && IE.parseContact('LA 10').elec === 'LA', 'noms de plots');

// --- rapport d'énergie sur des sinusoïdes (fs 1000 Hz, décimé vers 250 Hz)
{
  const fsr = 1000, n = fsr * 6, s = (f, a) => i => a * Math.sin(2 * Math.PI * f * i / fsr), mk = (...g) => Float32Array.from({ length: n }, (_, i) => g.reduce((v, h) => v + h(i), 0));
  const er = x => { const r = IE.energyRatio(x, fsr, { line: 50 }); return r.er[r.er.length >> 1]; };
  const a = er(mk(s(6, 50))), b = er(mk(s(30, 50))), c = er(mk(s(6, 50), s(30, 50))), d = er(mk(s(9, 50), s(50, 200)));
  ok(a < 0.02 && b > 50 && near(c, 1, 0.25) && d < 0.05, `ER : θ seul ${a.toFixed(3)}, γ seul ${b.toFixed(0)}, θ+γ égaux ${c.toFixed(2)}, raie 50 Hz exclue ${d.toFixed(3)}`);
  const r = IE.energyRatio(mk(s(6, 50)), fsr, {});
  ok(r.q === 4 && near(r.dt, 0.125, 0.002) && near(r.t0, 0.5, 0.005) && r.df <= 1, `ER : décimation ×${r.q}, pas ${r.dt} s, centre de la 1re fenêtre ${r.t0} s, résolution ${r.df.toFixed(2)} Hz`);
}

// --- Page–Hinkley : saut connu
{
  const dt = 0.125, er = new Float32Array(800); for (let i = 0; i < 800; i++) er[i] = (i < 400 ? 0.5 : 3) + 0.1 * Math.sin(i * 1.7);
  const p = IE.pageHinkley(er, 0, 799, 0.5, 8, dt);
  ok(p && near(p.nd, 400, 2) && p.na > p.nd && (p.na - p.nd) * dt < 6, `Page–Hinkley : détection à ${p && p.nd} (saut à 400), alarme ${p && ((p.na - p.nd) * dt).toFixed(2)} s plus tard`);
  ok(IE.pageHinkley(er.slice(0, 400), 0, 399, 0.5, 8, dt) === null, 'Page–Hinkley : pas de détection sans changement');
}

// --- EI sur la crise synthétique (montage bipolaire)
{
  const D = IE.montage(R.channels, 'bipolar');
  t0 = performance.now(); const B = IE.erBatch(D.map(d => IE.deriveSignal(R.data, d, 0, R.nSamples)), R.fs, { line: 50 }); const ms = performance.now() - t0;
  console.log(`    ER ${D.length} dérivations × ${R.duration} s : ${ms.toFixed(0)} ms`);
  const res = IE.epileptogenicity(B.ers, { t0: B.t0, dt: B.dt, start: 20, end: 100, szEnd: 100, nu: 0.5, lambda: 8, tau: 1, H: 5 });
  const by = e => Math.max(...res.rows.map((r, i) => D[i].elec === e ? r.ei : 0)), top = res.rows.map((r, i) => [D[i].name, r.ei]).sort((a, b) => b[1] - a[1]);
  console.log('    EI : ' + top.slice(0, 6).map(([n, v]) => `${n} ${v.toFixed(2)}`).join(' · ') + ` · N0 ${res.N0.toFixed(2)} s`);
  ok(near(res.N0, 60, 0.6) && D[res.rows.findIndex(r => r.ei === 1)].elec === 'B’', 'EI : première détection au début de la crise, maximum sur B’');
  ok(by('B’') > by('A’') && by('A’') > by('TB’') && by('TB’') >= by('TP’') && by('TP’') >= by('OR’'), `EI ordonné : B’ ${by('B’').toFixed(2)} > A’ ${by('A’').toFixed(2)} > TB’ ${by('TB’').toFixed(2)} ≥ TP’ ${by('TP’').toFixed(2)} ≥ OR’ ${by('OR’').toFixed(2)}`);
  ok(by('OR’') < 0.1 && by('A') < 0.3 && by('GPH’') < 0.3, 'EI : structures non atteintes ou atteintes tardivement par une activité lente sous 0,3');
  const iB = D.findIndex(d => d.name === 'B’3-B’4'), man = IE.epileptogenicity(B.ers, { t0: B.t0, dt: B.dt, start: 20, end: 100, szEnd: 100, nu: 0.5, lambda: 8, tau: 1, H: 5, manual: { [iB]: 70 } });
  ok(man.rows[iB].manual && man.rows[iB].tNd === 70 && man.rows[iB].ei < res.rows[iB].ei, 'EI : détection corrigée à la main (plus tardive → EI plus faible)');
  const strict = IE.epileptogenicity(B.ers, { t0: B.t0, dt: B.dt, start: 20, end: 100, szEnd: 100, nu: 0.5, lambda: 40, tau: 1, H: 5 });
  ok(strict.rows.filter(r => r.detected).length <= res.rows.filter(r => r.detected).length, 'EI : λ plus élevé → moins de détections');
  // v4.13 : courbe U_N complète (affichage) — identique à Page–Hinkley jusqu'à l'alarme, minimum à la détection
  const iB3 = D.findIndex(d => d.name === 'B’3-B’4'), i0 = Math.round((20 - B.t0) / B.dt), i1 = Math.round((100 - B.t0) / B.dt);
  const U = IE.phCurve(B.ers[iB3], i0, i1, 0.5, B.dt), ph = IE.pageHinkley(B.ers[iB3], i0, i1, 0.5, 8, B.dt, true);
  let same = true; for (let i = 0; i <= ph.na - i0; i++) if (Math.abs(U[i] - ph.U[i]) > 1e-4) same = false;
  let imin = 0; for (let i = 0; i <= ph.na - i0; i++) if (U[i] < U[imin]) imin = i;
  ok(U.length === i1 - i0 + 1 && same && imin + i0 === ph.nd, `U_N : courbe entière (${U.length} valeurs), confondue avec Page–Hinkley jusqu’à l’alarme, minimum à Nd`);
  // v4.13 : plots exclus → dérivations bipolaires exclues
  const xc = new Set(['A’3']), touched = D.filter(d => IE.derContacts(d, R.channels).some(c => xc.has(c))).map(d => d.name);
  ok(touched.join() === 'A’2-A’3,A’3-A’4', `plot exclu : ses deux dérivations bipolaires (${touched.join(', ')})`);
  // v4.13 : EImax de deux crises (la seconde débute sur A’)
  const plan2 = [{ e: 'B’', n: 8, role: 'prop', t: 66, gain: [0.6, 0.4] }, { e: 'A’', n: 8, role: 'ez', t: 60, gain: [1, 0.8, 0.4] }, { e: 'TB’', n: 8, role: 'ez', t: 61, gain: [0.8, 0.5] }, { e: 'OR’', n: 8, role: 'none' }];
  const rec2 = synthSeizure({ plan: plan2, seed: 11 }), D2 = IE.montage(rec2.names.map(n => ({ name: n, type: 'SEEG' })), 'bipolar');
  const B2 = IE.erBatch(D2.map(d => IE.deriveSignal(rec2.data, d, 0, rec2.nSamples)), rec2.fs, { line: 50 });
  const res2 = IE.epileptogenicity(B2.ers, { t0: B2.t0, dt: B2.dt, start: 20, end: 100, szEnd: 100, nu: 0.5, lambda: 8, tau: 1, H: 5 });
  const runs = [{ id: 'c1', rows: res.rows.map((r, i) => ({ key: D[i].name, ei: r.ei })) }, { id: 'c2', rows: res2.rows.map((r, i) => ({ key: D2[i].name, ei: r.ei })) }];
  const EM = IE.eiMax(runs), get = k => EM.find(x => x.key === k);
  const a12 = get('A’1-A’2'), okMax = EM.every(x => x.max === Math.max(...Object.values(x.values))), b34 = get('B’3-B’4');
  console.log('    EImax : ' + EM.slice(0, 6).map(x => `${x.key} ${x.max.toFixed(2)} (${x.from})`).join(' · '));
  ok(okMax && b34.from === 'c1' && b34.max === 1 && a12.values.c2 > a12.values.c1 && a12.from === 'c2' && get('TB’1-TB’2').n === 2, 'EImax : maximum par voie, crise du maximum, voies communes aux deux crises');
  ok(EM.filter(x => x.max >= 0.3).length >= Math.max(res.rows.filter(r => r.ei >= 0.3).length, res2.rows.filter(r => r.ei >= 0.3).length) && EM[0].max === 1, 'EImax : au moins autant de voies ≥ 0,3 que chaque crise, tri décroissant');
}

// --- v4.15 : méthodes complémentaires (SV.IEEGM)
{
  let sd = 3; const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; }, gs = () => { let u = 0; for (let i = 0; i < 6; i++) u += rnd(); return (u - 3) * 1.41; };
  const ar = (n, a) => { const x = new Float32Array(n); let v = 0; for (let i = 0; i < n; i++) { v = a * v + gs(); x[i] = v; } return x; };
  // h² : y = f(x) retardée de 31 ms (non linéaire), z indépendant
  const f0 = 512, n = f0 * 30, base = ar(n, 0.9), d = 16, x = base, y = new Float32Array(n), z = ar(n, 0.9);
  for (let i = 0; i < n; i++) y[i] = Math.tanh(0.3 * (i >= d ? base[i - d] : 0)) * 20 + 0.3 * gs();
  const C = IM.cei([x, y, z], f0, [1, 0.5, 0.1]), N = 3, nW = C.nWin, at = (i, j, w) => (i * N + j) * nW + w, mean = (i, j, A) => { let s = 0; for (let w = 0; w < nW; w++) s += A[at(i, j, w)]; return s / nW; };
  ok(mean(0, 1, C.H) > 0.7 && Math.abs(mean(0, 1, C.L) - 4) < 0.6 && mean(0, 2, C.H) < 0.15 && mean(2, 0, C.H) < 0.15, `h² : couplage non linéaire retrouvé (${mean(0, 1, C.H).toFixed(2)}, délai ${(mean(0, 1, C.L) / C.fs2 * 1000).toFixed(0)} ms à 128 Hz), voie indépendante ${mean(0, 2, C.H).toFixed(2)}`);
  ok(C.out[0] === 1 && C.out[1] === 0 && C.in[1] === 1 && C.cei[0] === 1, `cEI : direction par le délai (x → y), degré sortant médian [${C.out}], cEI ${C.cei.map(v => v.toFixed(2))}`);
  const cmb = IM.ceiCombine([1, 0.5, 0], [0, 2, 4]);
  ok(Math.abs(cmb[2] - 1) < 1e-9 && Math.abs(cmb[1] - 1 / 1) < 1e-9 && Math.abs(cmb[0] - 1) < 1e-9 && IM.ceiCombine([0.2, 0.1], [0, 0])[0] === 1, 'cEI = (EI/max EI + sortant/max sortant) normalisé par son maximum');
  const sub = IM.ceiDegrees(C.H, C.L, N, nW, 0.2, [1, 2]);
  ok(sub.out.every(v => v === 0), 'cEI : voie exclue après le calcul retirée du graphe (degrés recalculés sans elle)');
  // entropie de permutation
  const codes = new Set(); for (const p of [[1, 2, 3], [1, 3, 2], [2, 3, 1], [2, 1, 3], [3, 1, 2], [3, 2, 1]]) codes.add(IM.ordinal(p, 0, 3, 1));
  ok(codes.size === 6 && Math.max(...codes) === 5, 'motifs ordinaux : 6 codes distincts (0–5) pour D = 3');
  const wn = Float32Array.from({ length: f0 * 20 }, gs), sn = Float32Array.from({ length: f0 * 20 }, (_, i) => Math.sin(2 * Math.PI * 5 * i / f0)), pw = IM.permEntropy(wn, f0), ps = IM.permEntropy(sn, f0);
  ok(pw.pe[0] > 0.99 && ps.pe[0] < 0.5 && Math.abs(pw.dt - 2.5) < 1e-9 && Math.abs(pw.t0 - 2.5) < 1e-9 && pw.pe.length === 7, `entropie de permutation : bruit blanc ${pw.pe[0].toFixed(3)}, sinusoïde ${ps.pe[0].toFixed(3)} ; fenêtres de 5 s au pas de 2,5 s`);
  // PEI sur la crise synthétique (60 → 110 s, 90 s postictaux)
  const rp = synthSeizure({ dur: 200, end: 110, couple: 0.6, ied: [{ e: 'B’', k: [1, 2, 3], spk: 10, r: 15 }, { e: 'TP’', k: [2, 3], spk: 4, r: 3 }] });
  const Dp = IE.montage(rp.names.map(nm => ({ name: nm, type: 'SEEG' })), 'bipolar'), sig = Dp.map(dd => IE.deriveSignal(rp.data, dd, 0, rp.nSamples));
  const PB = IM.peBatch(sig, rp.fs), PR = IM.pei(PB.pes, PB.t0, PB.dt, 60, 110), grp = e => { const v = Dp.map((dd, i) => dd.elec === e ? PR.rows[i].pei : null).filter(v => v != null); return v.reduce((a, b) => a + b, 0) / v.length; };
  const top = Dp.map((dd, i) => ({ n: dd.name, v: PR.rows[i].pei })).sort((a, b) => b.v - a.v);
  ok(PR.cov.pre[0] === 0 && PR.cov.pre[1] === 60 && PR.cov.post[0] === 110 && PR.cov.post[1] === 170 && PR.cov.nIct === 19, `PEI : périodes préictale [0, 60], postictale [110, 170], ${PR.cov.nIct} fenêtres ictales`);
  ok(/^(B’|A’|TB’)/.test(top[0].n) && grp('B’') > grp('OR’') && top[0].v === 1, `PEI : zone de début en tête (${top.slice(0, 3).map(t => t.n + ' ' + t.v.toFixed(2)).join(', ')}), B’ ${grp('B’').toFixed(2)} > OR’ ${grp('OR’').toFixed(2)}`);
  const r0 = PR.rows[Dp.findIndex(dd => dd.name === top[0].n)];
  ok(r0.m < r0.B && r0.M >= r0.m && Math.abs(r0.dE - (r0.B - r0.m)) < 1e-9 && r0.tMin >= 60 && r0.tMin <= 110 && r0.tMax >= 110, 'PEI : chute ictale de l’entropie (m < B), ΔE = B − m, minimum dans la crise, maximum après');
  // Delphos : ripples (110 Hz), fast ripples (300 Hz) et pointes dans un fond 1/f à 2 048 Hz
  const fh = 2048, nh = fh * 40, xh = new Float32Array(nh); let v = 0; for (let i = 0; i < nh; i++) { v = 0.98 * v + gs(); xh[i] = v * 3 + gs() * 1.5; }
  const truth = []; for (let k = 0; k < 36; k++) {
    const t = 1 + k * 1.07, i0 = Math.round(t * fh), kind = ['r', 'fr', 'spk'][k % 3];
    if (kind === 'spk') { const L1 = Math.round(0.03 * fh), L2 = Math.round(0.2 * fh); for (let i = 0; i < L1; i++) xh[i0 + i] += -150 * (1 - Math.abs(2 * i / (L1 - 1) - 1)); for (let i = 0; i < L2; i++) xh[i0 + L1 + i] += 30 * Math.sin(Math.PI * i / L2); }
    else { const f = kind === 'r' ? 110 : 300, L1 = Math.round((kind === 'r' ? 0.06 : 0.03) * fh), Am = kind === 'r' ? 22 : 13; for (let i = 0; i < L1; i++) xh[i0 + i] += Am * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (L1 - 1))) * Math.sin(2 * Math.PI * f * i / fh); }
    truth.push({ t, kind });
  }
  t0 = performance.now(); const DH = IM.delphosBatch([xh], fh, {}), ev = DH.events[0], msD = performance.now() - t0;
  const hit = kind => truth.filter(q => q.kind === kind && ev.some(e => e.band === kind && e.t >= q.t - 0.03 && e.t <= q.t + 0.1)).length, fp = ev.filter(e => !truth.some(q => e.t >= q.t - 0.05 && e.t <= q.t + 0.25)).length;
  console.log(`    Delphos 40 s à 2 048 Hz : ${msD.toFixed(0)} ms, ${DH.freqs.length} échelles jusqu’à ${DH.fmax} Hz, ${ev.length} évènements`);
  ok(hit('r') >= 10 && hit('fr') >= 10 && hit('spk') >= 10 && fp <= 1, `Delphos : ripples ${hit('r')}/12, fast ripples ${hit('fr')}/12, pointes ${hit('spk')}/12 retrouvés, ${fp} faux positif(s)`);
  const er = ev.find(e => e.band === 'r'), ef = ev.find(e => e.band === 'fr'), es = ev.find(e => e.band === 'spk');
  ok(er && er.f > 90 && er.f < 135 && er.tr >= 1.38 && ef && ef.f > 250 && ef.f < 350 && es && es.tr <= 1.25 && es.fsp >= 10.2, `Delphos : fréquence et forme (ripple ${er && er.f} Hz rapport ${er && er.tr}, FR ${ef && ef.f} Hz, pointe étalement ${es && es.fsp} voix)`);
  ok(Math.abs(IM.delphosFmax(512, {}) - 158.72) < 0.01 && IM.delphosPlan(512, {}).freqs.every(f => f <= 158.8), 'Delphos : à 512 Hz, analyse bornée à ~159 Hz (fast ripples hors bande)');
  const rt = IM.delphosRates([{ band: 'spk' }, { band: 'spk' }, { band: 'r' }, { band: 'fr' }, { band: 'g' }], 30);
  ok(rt.spk === 4 && rt.r === 2 && rt.fr === 2 && rt.g === 2 && rt.hfo === 4 && Math.abs(rt.cross - 4) < 1e-9, 'Delphos : taux par minute, HFO = ripples + FR (+ VFO), taux croisé √(pointes × HFO)');
  // activité intercritique de la crise synthétique (512 Hz) : 55 premières secondes
  const DS = IM.delphosBatch(sig.map(s0 => s0.subarray(0, 55 * rp.fs)), rp.fs, {}), rates = Dp.map((dd, i) => ({ n: dd.name, ...IM.delphosRates(DS.events[i], 55) })).sort((a, b) => b.cross - a.cross);
  const nSp = rp.ied.filter(e => e.t < 55 && e.e === 'B’' && e.kind === 'spk').length;
  ok(rates[0].n === 'B’1-B’2' && Math.abs(rates[0].spk - nSp * 60 / 55) < 1.2 && rates.filter(r0 => /^(OR’|A\d|GPH’)/.test(r0.n)).every(r0 => r0.spk < 0.5), `Delphos sur la crise synthétique : ${rates[0].n} en tête (pointes ${rates[0].spk.toFixed(1)}/min pour ${(nSp * 60 / 55).toFixed(1)} insérées, ripples ${rates[0].r.toFixed(1)}/min), voies sans activité intercritique à ~0`);
}

// --- v4.16 : connectivité h² (évolution, force des nœuds), pointes avec HFO, couplage à l'onde lente
{
  let sd = 5; const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; }, gs = () => { let u = 0; for (let i = 0; i < 6; i++) u += rnd(); return (u - 3) * 1.41; };
  const ar = (n, a) => { const x = new Float32Array(n); let v = 0; for (let i = 0; i < n; i++) { v = a * v + gs(); x[i] = v; } return x; };
  // 4 voies : A mène B et C (couplage seulement dans la seconde moitié), D indépendante
  const f0 = 256, n = f0 * 40, A0 = ar(n, 0.85), d1 = 6, d2 = 9, B0 = ar(n, 0.85), C0 = ar(n, 0.85), D0 = ar(n, 0.85);
  for (let i = n / 2; i < n; i++) { B0[i] = 0.9 * Math.tanh(0.3 * A0[i - d1]) * 20 + 0.3 * B0[i]; C0[i] = 0.8 * A0[i - d2] + 0.4 * C0[i]; }
  const R2 = IM.h2Run([A0, B0, C0, D0], f0, { band: [1, 45], win: 3, step: 1, lag: 0.1 }), F = IM.h2Frames(R2.H, R2.L, 4, R2.nWin, 0.3, null, 50);
  const half = Math.floor(R2.nWin / 2), early = F.frames.slice(0, half - 2), late = F.frames.slice(half + 2);
  const has = (fr, a, b) => fr.some(e => e[0] === a && e[1] === b && e[3] === 1);
  ok(late.filter(f => has(f, 0, 1) && has(f, 0, 2)).length >= 0.8 * late.length && early.filter(f => f.length).length <= 0.2 * early.length, `h² au fil du temps : liens A → B et A → C apparus dans la seconde moitié (${late.filter(f => has(f, 0, 1) && has(f, 0, 2)).length}/${late.length} fenêtres), aucun avant`);
  const outLate = i => late.length ? F.outW[i].slice(half + 2).reduce((s, v) => s + v, 0) / late.length : 0;
  ok(outLate(0) >= 1.8 && outLate(3) === 0 && F.inW[1][R2.nWin - 1] === 1 && F.glob[R2.nWin - 1] > F.glob[0], `degré sortant de A ${outLate(0).toFixed(1)}, D 0 ; connectivité globale ${F.glob[0].toFixed(3)} → ${F.glob[R2.nWin - 1].toFixed(3)}`);
  const R3 = IM.h2Run([A0, B0, C0, D0], f0, { band: [1, 45], win: 3, step: 1, lag: 0.1, lagStep: 2 });
  let dmax = 0; for (let i = 0; i < R2.H.length; i++) dmax = Math.max(dmax, Math.abs(R2.H[i] - R3.H[i]));
  ok(dmax < 0.03, `délais en grille grossière puis affinée : h² maximal identique à ${dmax.toFixed(3)} près`);
  const Sg = IM.h2Strength(R2.H, R2.L, 4, R2.nWin);
  ok(Sg.strength[0] > Sg.strength[3] && Sg.pair[0 * 4 + 1] > Sg.pair[1 * 4 + 3] && Sg.lead[0 * 4 + 1] > 0.6 && Sg.outS[0] > Sg.inS[0], `force des nœuds : A ${Sg.strength[0].toFixed(3)} > D ${Sg.strength[3].toFixed(3)}, A précède B dans ${Math.round(Sg.lead[1] * 100)} % des fenêtres liées`);
  const S2 = IM.h2Strength(R2.H, R2.L, 4, R2.nWin, [1, 2, 3]);
  ok(S2.strength[0] === 0 && S2.pair[1] === 0 && S2.strength[1] > 0, 'force des nœuds : voie exclue retirée');
  { // deux dérivations bipolaires voisines (plot commun) : liées sans délai → pas de sens
    const P0 = new Float32Array(n), Q0 = new Float32Array(n), U0 = new Float32Array(n); for (let i = 0; i < n; i++) { const c = gs() * 20; P0[i] = c + gs() * 12; Q0[i] = -c + gs() * 12; U0[i] = gs() * 20; }
    const R4 = IM.h2Run([P0, Q0, U0], f0, { band: [1, 45], win: 4, step: 2, lag: 0.1, lagStep: 2 }), S4 = IM.h2Strength(R4.H, R4.L, 3, R4.nWin);
    ok(S4.pair[1] > 0.3 && S4.lead[1] === 0.5 && S4.lead[3] === 0.5, `force des nœuds : lien sans délai (plot commun, h² ${S4.pair[1].toFixed(2)}) non orienté`);
    const sk = new Uint8Array(9); sk[1] = sk[3] = 1; const S5 = IM.h2Strength(R4.H, R4.L, 3, R4.nWin, null, sk), F5 = IM.h2Frames(R4.H, R4.L, 3, R4.nWin, 0.3, null, 10, sk);
    ok(S5.pair[1] === 0 && S5.strength[0] < 0.5 * S4.strength[0] && F5.frames.every(f => !f.some(e => (e[0] === 0 && e[1] === 1) || (e[0] === 1 && e[1] === 0))), `paires ignorées (dérivations voisines) : ni force (${S4.strength[0].toFixed(2)} → ${S5.strength[0].toFixed(2)}) ni lien`);
  }
  // pointes avec HFO
  const ev = [{ t: 1, band: 'spk' }, { t: 1.03, band: 'fr' }, { t: 2, band: 'spk' }, { t: 2.05, band: 'r' }, { t: 3, band: 'spk' }, { t: 3.5, band: 'r' }, { t: 4, band: 'spk' }, { t: 3.95, band: 'r' }, { t: 4.02, band: 'fr' }];
  const co = IM.cooccur(ev, 0.1);
  ok(co.nSpk === 4 && co.nSpkR === 2 && co.nSpkFR === 2 && co.nSpkHFO === 3, `pointes avec HFO : ${co.nSpkR} avec ripple, ${co.nSpkFR} avec FR, ${co.nSpkHFO}/4 avec un HFO (± 100 ms)`);
  // couplage : onde lente de 1 Hz, HFO aux crêtes (phase 0) puis au hasard
  const fsw = 512, nw = fsw * 120, sw = new Float32Array(nw); for (let i = 0; i < nw; i++) sw[i] = 80 * Math.sin(2 * Math.PI * 1 * i / fsw) + 5 * gs();
  const ph = IM.slowPhase(sw, fsw, [0.5, 2]), peaks = [], rand = []; for (let k = 5; k < 115; k++) { peaks.push(k + 0.25 + 0.02 * gs()); rand.push(5 + rnd() * 110); }
  const cP = IM.phaseCoupling(peaks, ph, 0), cR = IM.phaseCoupling(rand, ph, 0);
  ok(cP.mvl > 0.9 && Math.abs(cP.phase) < 15 && cP.p < 1e-6 && cR.mvl < 0.3 && cR.p > 0.01, `couplage à l’onde lente : HFO aux crêtes → vecteur ${cP.mvl.toFixed(2)}, phase ${cP.phase}°, p ${cP.p.toExponential(1)} ; au hasard → ${cR.mvl.toFixed(2)} (p ${cR.p.toFixed(2)})`);
}

// --- v4.17 : réseau de toute la crise aplati sur le temps, liens interpolés d'une fenêtre à la suivante
{
  const fr = Array.from({ length: 10 }, (_, w) => [].concat(w < 8 ? [[0, 1, 500 + 10 * w, 1]] : [], w === 3 ? [[1, 2, 900, 1]] : [], w >= 5 ? [[3, 2, 400, w % 2 ? 0 : 1]] : []));
  const Fl = IM.netFlatten(fr, { minFrac: 0.1, minN: 2 }), e01 = Fl.find(e => e[0] === 0 && e[1] === 1), e23 = Fl.find(e => (e[0] === 3 && e[1] === 2) || (e[0] === 2 && e[1] === 3));
  ok(Fl.length === 2 && Fl[0] === e01 && e01[4] === 8 && e01[3] === 1 && Math.abs(e01[2] - 535) <= 1 && e23 && e23[4] === 5 && !Fl.some(e => e.includes(900)), `réseau aplati : liens additionnés (A→B ${e01 && e01[4]} fenêtres, C–D ${e23 && e23[4]}), lien isolé écarté, sens majoritaire`);
  const iA = [[0, 1, 500, 1]], iB = [[0, 1, 700, 1], [2, 3, 400, 0]], I0 = IM.netInterp([iA, iB], 0), Ih = IM.netInterp([iA, iB], 0.5), I9 = IM.netInterp([iA, iB], 0.9);
  const g = (L, a, b) => L.find(e => Math.min(e[0], e[1]) === a && Math.max(e[0], e[1]) === b);
  ok(I0.length === 1 && g(Ih, 0, 1)[2] === 600 && g(Ih, 0, 1)[4] === 1 && Math.abs(g(Ih, 2, 3)[4] - 0.5) < 1e-9 && g(I9, 2, 3)[4] > 0.9 && g(I9, 2, 3)[4] < 1, `liens interpolés : lien commun ${g(Ih, 0, 1)[2]} (alpha 1), lien naissant alpha ${g(Ih, 2, 3)[4]} à mi-chemin, ${g(I9, 2, 3)[4].toFixed(2)} à 0,9`);
}

// --- v4.18 : statistiques, Morlet, empreinte, EM
{
  const X = SV.Stat;
  ok(Math.abs(X.tInv(0.975, 10) - 2.2281) < 1e-3 && Math.abs(X.tInv(0.975, 1) - 12.706) < 1e-2 && Math.abs(X.normCdf(1.96) - 0.975) < 1e-4 && Math.abs(X.tCdf(-2.2281, 10) - 0.025) < 1e-4, `Student : t(0,975 ; 10) = ${X.tInv(0.975, 10).toFixed(4)}, t(0,975 ; 1) = ${X.tInv(0.975, 1).toFixed(3)}, Φ(1,96) = ${X.normCdf(1.96).toFixed(4)}`);
  const q = X.bh([0.01, 0.04, 0.03, 0.005]), w = X.welch(1, 1, 30, 0, 1, 30), rz = X.robustZ([0, 1, -1, 2, -2, 40]);
  ok(q.map(v => v.toFixed(3)).join() === '0.020,0.040,0.040,0.020' && Math.abs(w.t - 3.873) < 1e-3 && Math.abs(w.df - 58) < 1e-6 && rz.z[5] > 15, `FDR (Benjamini–Hochberg) ${q.map(v => v.toFixed(3)).join(' ')} ; Welch t ${w.t.toFixed(2)} (ddl ${w.df}) ; z robuste de la valeur aberrante ${rz.z[5].toFixed(1)}`);
  // Morlet : sinusoïde continue et salve brève bien placées dans le temps et la fréquence
  const f0 = 512, nM = f0 * 30, xm = new Float32Array(nM); for (let i = 0; i < nM; i++) { const t = i / f0; xm[i] = Math.sin(2 * Math.PI * 50 * t) + (t > 15 && t < 15.2 ? 3 * Math.sin(2 * Math.PI * 120 * t) : 0); }
  const frq = IM.fpFreqs(IM.morletFmax(f0, 8)), T = IM.morletTF(xm, f0, frq, { k: 8, dt: 0.1, a: 5, b: 25 }), at = (f, j) => T.P[frq.indexOf(f) * T.nT + j];
  let jm = -1, mx = 0; for (let j = 0; j < T.nT; j++) if (at(120, j) > mx) { mx = at(120, j); jm = j; }
  ok(IM.morletFmax(f0, 8) === 204 && Math.abs(at(50, 10) / at(50, 150) - 1) < 0.01 && at(50, 50) > 1e4 * at(40, 50) && jm === 101, `Morlet (indice 8) : 50 Hz stable dans le temps, sélectif (× ${(at(50, 50) / at(40, 50)).toExponential(0)} contre 40 Hz), salve à 120 Hz retrouvée à ${(5 + jm * 0.1).toFixed(1)} s (15,1 attendu)`);
  // crise synthétique : empreinte complète sur B’1-B’2, activité rapide d'une seule bande sur A’, rien ailleurs
  const rc = synthFP(), fsF = rc.fs, on = 160, bip = [];
  for (let c = 0; c + 1 < rc.names.length; c++) { if (rc.names[c].replace(/\d+$/, '') !== rc.names[c + 1].replace(/\d+$/, '')) continue; const a = rc.data[c], b = rc.data[c + 1]; bip.push({ name: rc.names[c] + '-' + rc.names[c + 1], x: a.map((v, i) => v - b[i]) }); }
  const W = IM.fpWindows(on, rc.nSamples / fsF), i0 = Math.round(W.seg[0] * fsF), i1 = Math.round(W.seg[1] * fsF), fr2 = IM.fpFreqs(Math.min(200, IM.morletFmax(fsF, 8)));
  let t1 = performance.now(); const R = IM.fpBatch(bip.map(d => d.x.slice(i0, i1)), fsF, { freqs: fr2, k: 8, dt: 0.1, base: [W.base[0] - W.seg[0], W.base[1] - W.seg[0]], win: [W.win[0] - W.seg[0], W.win[1] - W.seg[0]] });
  console.log(`    empreinte : ${bip.length} voies × ${R.nF} fréquences × ${R.nT} cases en ${(performance.now() - t1).toFixed(0)} ms`);
  const F = bip.map((d, i) => IM.fpFeatures(R.L[i], fr2, R.nT, 0.1, W.win[0] - on + 0.05, {})), by = n => F[bip.findIndex(d => d.name === n)];
  const b1 = by('B’1-B’2'), a1 = by('A’1-A’2'), others = bip.filter(d => !/^B’[12]|^A’[12]|^B’3/.test(d.name)).map(d => by(d.name));
  ok(W.base[0] === 40 && W.base[1] === 80 && W.win[0] === 140 && !W.warn.length && IM.fpWindows(30, 200).err && IM.fpWindows(60, 200).warn.length === 1, `fenêtres : référence ${W.base.join('–')} s (2 min avant), crise ${W.win.join('–')} s ; référence raccourcie si le tracé commence tard, impossible sous 35 s`);
  ok(b1.full && b1.score === 1 && b1.nBands === 2 && b1.faFmin >= 55 && b1.faFmax >= 125 && b1.faFmax <= 145 && b1.sup && b1.nSpk >= 2 && b1.spkT.every(t => t < 0), `B’1-B’2 : empreinte complète (score ${b1.score}) — ${b1.nSpk} pointes préictales (${b1.spkT.join(', ')} s), activité rapide ${b1.faFmin}–${b1.faFmax} Hz en ${b1.nBands} bandes, suppression ${(b1.supRatio * 100).toFixed(1)} % de la carte`);
  ok(a1.fa && a1.nBands === 1 && !a1.sup && !a1.full && a1.score < 0.2 && a1.faFmin >= 50 && a1.faFmax <= 72, `A’1-A’2 : activité rapide d’une seule bande (${a1.faFmin}–${a1.faFmax} Hz), sans suppression ni empreinte (score ${a1.score.toFixed(2)})`);
  ok(others.every(f => !f.fa && f.score === 0), `voies sans activité rapide (${others.length}) : score nul`);
  { const fr = IM.fpFreqs(200), nT = 40, nF = fr.length, Lm = new Float32Array(nF * nT);   // trou du secteur (50 Hz) dans une bande : une seule bande
    for (let f = 0; f < nF; f++) for (let j = 10; j < 35; j++) { const v = fr[f]; if ((v >= 36 && v <= 46) || (v >= 56 && v <= 90) || (v >= 164 && v <= 184)) Lm[f * nT + j] = 1.2; }
    const r = IM.fpFeatures(Lm, fr, nT, 0.1, -2, {}); ok(r.nBands === 2 && r.faFmin === 36 && r.faFmax === 184, `bandes simultanées : le trou du secteur à 50 Hz ne coupe pas une bande (36–90 Hz + 164–184 Hz → ${r.nBands} bandes)`); }
  // EM : seules les voies de B’ (activité 130 Hz) sont significatives à L = 0, délais nuls
  const EW = IM.emWindows(on, rc.nSamples / fsF, {}), e0 = Math.round(EW.seg[0] * fsF), e1 = Math.round(EW.seg[1] * fsF), ef = IM.emFreqs([120, 200], 50), blk = 0.2;
  ok(ef.every(f => Math.abs(f - 150) > 3 && Math.abs(f - 200) > 3) && ef[0] === 120 && ef.length >= 8, `EM : fréquences ${ef.join(', ')} Hz (harmoniques du secteur 150 et 200 Hz écartées)`);
  t1 = performance.now(); const E = IM.emBatch(bip.map(d => d.x.slice(e0, e1)), fsF, { freqs: ef, k: 7, a: 1, b: (e1 - e0) / fsF - 1, blk }); const et0 = EW.seg[0] + 1 + blk / 2 - on;
  const Ts = bip.map((d, i) => IM.emTest(E.E[i], et0, blk, EW.base, 0, 3)), ps = Ts.map(r => r.p1), qq = X.adjust(ps, 'bonf'), sig = bip.filter((d, i) => qq[i] < 0.05).map(d => d.name);
  console.log(`    EM : ${bip.length} voies en ${(performance.now() - t1).toFixed(0)} ms ; t ${Ts.map(r => r.t.toFixed(1)).join(' ')}`);
  ok(sig.length >= 2 && sig.every(n => /^B’[123]-/.test(n)) && sig.includes('B’1-B’2'), `EM (120–200 Hz, L = 0, Bonferroni) : significatives ${sig.join(', ')} (t max ${Math.max(...Ts.map(r => r.t)).toFixed(1)})`);
  // carte sur une grille : valeur au plot, décroissance gaussienne, nulle au-delà de rmax et hors masque
  const G = { dims: [41, 41, 41], affine: [1, 0, 0, -20, 0, 1, 0, -20, 0, 0, 1, -20, 0, 0, 0, 1] }, mk = new Uint8Array(41 ** 3).fill(1); mk[(20 + 5) + 41 * (20 + 41 * 20)] = 0;
  const V = IM.emSplat(G, mk, [[0, 0, 0, 10], [8, 0, 0, 6]], { fwhm: 6, rmax: 12 }), vx = (x, y, z) => V[(x + 20) + 41 * ((y + 20) + 41 * (z + 20))];
  ok(Math.abs(vx(0, 0, 0) - 10) < 0.6 && vx(3, 0, 0) < vx(0, 0, 0) && vx(5, 0, 0) === 0 && vx(0, 0, 13) === 0 && vx(0, 3, 0) > 3 && vx(8, 0, 0) > 5, `carte sur l’IRM : ${vx(0, 0, 0).toFixed(1)} au plot (10), ${vx(0, 3, 0).toFixed(1)} à 3 mm, 0 hors masque et au-delà de 12 mm`);
}

// --- v4.20 : seuils EI (zone épileptogène / propagation), temporalité de l'empreinte et des EM, empreinte connectivité
{
  ok(IE.EZT.ei === 0.4 && IE.EZT.eiPZ === 0.1 && IE.EZT.cei === 0.6 && IE.eiZone(0.4) === 'ez' && IE.eiZone(0.39) === 'pz' && IE.eiZone(0.1) === '' && IE.eiZone(0.11) === 'pz', 'seuils : EI ≥ 0,4 zone épileptogène, 0,1 < EI < 0,4 propagation, cEI 0,6');
  const mx = IE.eiMax([{ id: 'a', rows: [{ key: 'X', ei: 0.5 }, { key: 'Y', ei: 0.2 }] }, { id: 'b', rows: [{ key: 'X', ei: 0.3 }, { key: 'X', ei: 0.35 }, { key: 'Y', ei: 0.05 }] }], 0.4, 0.1), X0 = mx.find(x => x.key === 'X'), Y0 = mx.find(x => x.key === 'Y');
  ok(X0.n === 2 && X0.n03 === 1 && X0.npz === 1 && X0.values.b === 0.35 && Y0.n03 === 0 && Y0.npz === 1, `EImax : crises ≥ 0,4 et en zone de propagation, deux voies d’un tracé sur une clé → la plus forte (X ${X0.n03}+${X0.npz}/${X0.n}, Y ${Y0.npz})`);
  const T = IM.fpTiming([{ fa: true, faT0: 0.5, score: 1 }, { fa: true, faT0: 6.5, score: 1 }, { fa: true, faT0: 0, score: 0.5 }, { fa: false, faT0: null, score: 1 / 3 }], { clear: 1, early: 2, tau: 2, end: 20 }), R = T.rows;
  ok(T.t0 === 0 && T.tClear === 0.5 && T.nEarly === 1 && T.nLate === 1 && R[0].sT === 1 && R[1].early === false && near(R[1].sT, 2 / 6.5, 0.002) && R[1].sT < R[2].sT && R[3].sT < 0.05, `empreinte : franche précoce (Δ 0,5 s, score t ${R[0].sT}) > franche tardive (Δ 6,5 s, ${R[1].sT}) ; sans activité rapide : délai de fin de fenêtre (${R[3].sT})`);
  const E2 = IM.emTiming([{ t: 8, delay: 2 }, { t: 9, delay: 8 }, { t: 1, delay: null }], { early: 2, tau: 2, lmax: 20, step: 2 });
  ok(E2.d0 === 2 && E2.nEarly === 1 && E2.nLate === 1 && E2.rows[0].tw === 8 && E2.rows[1].tw < E2.rows[0].tw && E2.rows[2].tw < 0.2, `EM : voie significative dès la 1re latence (t pondéré ${E2.rows[0].tw}) devant une voie recrutée 6 s plus tard malgré un t plus fort (${E2.rows[1].tw})`);
  const N = 6, C = new Float32Array(N * N), lk = (a, b, v) => { C[a * N + b] = v; C[b * N + a] = v; }; lk(1, 2, 0.6); lk(1, 3, 0.6); lk(2, 3, 0.1); lk(3, 4, 0.5); lk(4, 5, 0.6); lk(2, 5, 0.05);
  const K = IM.fpConnect(new Map([[2, { e: 0.5 }], [3, { e: 0.5 }], [4, { e: 0 }], [5, { e: 0 }]]), C, N, {});
  ok(K[0].r === 1 && !K[0].sampled && K[0].via.length === 2 && (K.find(x => x.r === 4) || { score: 0 }).score < K[0].score / 2, `empreinte connectivité : sans empreinte franche, la région non échantillonnée reliée aux deux meilleures voies vient en tête (score ${K[0].score} contre ${K.filter(x => x.sampled).map(x => x.score).join(', ')} pour les régions échantillonnées) ; région échantillonnée sans empreinte reléguée`);
  const K2 = IM.fpConnect(new Map([[2, { e: 1 }], [3, { e: 0.3 }], [4, { e: 0 }]]), C, N, {});
  ok(K2[0].r === 2 && K2[0].sampled, `empreinte connectivité : une empreinte franche précoce échantillonnée reste en tête (${K2.slice(0, 3).map(x => x.r + ' ' + x.score).join(', ')})`);
}

// v5 : date et heure du début du tracé (marqueur New Segment BrainVision)
{ const ev = IE.vmrkEvents('[Marker Infos]\nMk1=New Segment,,1,1,0,20210603010203000000\nMk2=Comment,sz start,5120,1,0\n', 512);
  ok(ev.length === 1 && ev.startDate === '2021-06-03' && ev.startTime === '01:02:03' && near(ev[0].onset, 9.998, 0.01), 'BrainVision : début du tracé lu dans New Segment, marqueur suivant conservé'); }
// v5 : côté d'une électrode (sortie du crâne et majorité des plots)
{ const src = fs.readFileSync(path.join(ROOT, 'src/core.js'), 'utf8'); const w = { SV: SV }; try { new Function('window', 'document', 'MutationObserver', 'localStorage', 'navigator', src)(w, { addEventListener() { }, body: null, readyState: 'loading' }, class { observe() { } }, { getItem() { return null; }, setItem() { } }, {}); } catch (e) { console.log('  core.js :', e.message); }
  const Sd = w.SV.Side; if (Sd) { ok(Sd.of({ tip: [-4, 0, 0], entry: [40, 10, 20] }) === 'R', 'côté : la sortie du crâne décide (pointe gauche, entrée droite → D)');
  ok(Sd.of({ tip: [3, 0, 0], entry: [-2, 10, 20], contacts: [[3, 0, 0], [0, 0, 0], [-3, 0, 0], [-6, 0, 0], [-9, 0, 0]] }) === 'L', 'côté : entrée près de la ligne médiane → majorité des plots');
  ok(Sd.name('A', 'L', 'dg') === 'AG' && Sd.name('A', 'L', 'prime') === 'A’' && Sd.name('A', 'L', 'none') === 'A' && Sd.fromName('AG', 'dg') === 'L' && Sd.fromName('A2', 'dg') === null, 'convention des suffixes (prime, D/G, aucun)'); } else ok(false, 'SV.Side absent'); }

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${nOk} ok, ${nFail} échec(s)`); process.exit(nFail ? 1 : 0);
