// tools/tests/synth_seeg.mjs — crise SEEG synthétique (aucune donnée patient), pour les tests de l'index d'épileptogénicité.
//   node tools/tests/synth_seeg.mjs <dossier> [base]   → <base>_ieeg.vhdr / .eeg / .vmrk + channels.tsv, events.tsv, _ieeg.json
// Modèle : fond 1/f par plot (part commune à l'électrode et part locale) avec un peu d'alpha ; à la crise, décharge rapide
// de bas voltage (activité rapide 40 → 18 Hz, fond atténué) dans la zone de début, puis décharge rythmique lente ;
// propagation (bêta et thêta), atteinte tardive lente (thêta), structures non atteintes. Les noms d'électrodes sont ceux
// d'un schéma temporal mésial gauche (A’, B’, TB’, TP’, CE’, GPH’, OR’, A).
import fs from 'fs'; import path from 'path';

export const PLAN = [
  // électrode, plots, rôle, début (s), plots atteints (gain par plot, du plus interne au plus externe)
  { e: 'B’', n: 8, role: 'ez', t: 60.0, gain: [1, 0.85, 0.45, 0.15] },
  { e: 'A’', n: 8, role: 'ez', t: 60.8, gain: [0.9, 0.6, 0.25] },
  { e: 'TB’', n: 8, role: 'ez', t: 62.0, gain: [0.7, 0.45, 0.15] },
  { e: 'TP’', n: 8, role: 'prop', t: 66.0, gain: [0.8, 0.6, 0.3] },
  { e: 'CE’', n: 8, role: 'prop', t: 67.5, gain: [0.7, 0.4] },
  { e: 'GPH’', n: 8, role: 'slow', t: 72.0, gain: [0.8, 0.6, 0.4] },
  { e: 'OR’', n: 8, role: 'none' },
  { e: 'A', n: 8, role: 'slow', t: 85.0, gain: [0.5, 0.3] },
];

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function gauss(r) { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
/** bruit « rose » approché : somme de processus AR(1) */
function pink(r, n, fs) {
  const out = new Float32Array(n), poles = [0.999, 0.99, 0.95, 0.8, 0.5].map(p => Math.pow(p, 512 / fs)), w = [1, 0.7, 0.5, 0.35, 0.25], st = poles.map(() => 0);
  for (let i = 0; i < n; i++) { let s = 0; for (let k = 0; k < poles.length; k++) { st[k] = poles[k] * st[k] + Math.sqrt(1 - poles[k] * poles[k]) * gauss(r); s += w[k] * st[k]; } out[i] = s; }
  return out;
}

export function synthSeizure(o = {}) {
  const fsr = o.fs || 512, dur = o.dur || 120, end = o.end || 100, n = Math.round(fsr * dur), r = rng(o.seed || 7), plan = o.plan || PLAN;
  const names = [], data = [], roles = [], cpl = o.couple || 0, lagN = Math.round(0.025 * fsr); let ez0 = null;   // couple : copie retardée (25 ms) de la décharge de la zone de début dans les voies de propagation
  for (const P of plan) {
    const common = pink(r, n, fsr), ph0 = r() * 6.28;
    for (let k = 1; k <= P.n; k++) {
      const loc = pink(r, n, fsr), x = new Float32Array(n), g = (P.gain && P.gain[k - 1]) || 0, aph = r() * 6.28;
      let phF = 0, phS = r() * 6.28, phB = r() * 6.28;
      for (let i = 0; i < n; i++) {
        const t = i / fsr; let bg = 22 * common[i] + 16 * loc[i] + 6 * Math.sin(2 * Math.PI * 9 * t + aph + ph0), sz = 0;
        if (g > 0 && P.t != null && t >= P.t && t < end) {
          const u = t - P.t;
          if (P.role === 'ez') {
            const f = u < 8 ? 40 - 22 * (u / 8) : 5, amp = u < 8 ? (10 + 30 * Math.min(1, u)) : 90, att = u < 8 ? 0.35 : 0.8;
            phF += 2 * Math.PI * f / fsr; bg *= att;
            sz = g * (u < 8 ? amp * Math.sin(phF) : amp * Math.pow(Math.max(0, Math.sin(phF)), 6) * 1.6 - 25);   // rapide puis pointes rythmiques
          } else if (P.role === 'prop') {
            phB += 2 * Math.PI * 17 / fsr; phS += 2 * Math.PI * 5 / fsr;
            sz = g * (Math.min(1, u / 2) * 18 * Math.sin(phB) + Math.min(1, u / 4) * 45 * Math.sin(phS));
          } else if (P.role === 'slow') { phS += 2 * Math.PI * 5.5 / fsr; sz = g * Math.min(1, u / 3) * 70 * Math.sin(phS); }
          if (cpl && ez0 && P.role !== 'ez' && i >= lagN) sz += g * cpl * ez0[i - lagN];
        }
        if (cpl && !ez0 && P.role === 'ez' && k === 1) (x.sz || (x.sz = new Float32Array(n)))[i] = sz;
        x[i] = bg + sz;
      }
      if (x.sz) { ez0 = x.sz; delete x.sz; }
      names.push(P.e + k); data.push(x); roles.push(P.role === 'none' || !g ? 'none' : P.role);
    }
  }
  // liens de fond (tout le tracé) : copie retardée d'un plot (ou d'une dérivation from − ref) dans d'autres — connectivité intercritique dirigée
  for (const K of o.links || []) {
    const a = names.indexOf(K.from), rf = K.ref ? names.indexOf(K.ref) : -1, lg = Math.round((K.lag || 0.02) * fsr); if (a < 0) continue; const src = rf >= 0 ? data[a].map((v, i) => v - data[rf][i]) : Float32Array.from(data[a]);   // ref : source locale (dérivation bipolaire)
    for (const [j, nm] of (K.to || []).entries()) { const b = names.indexOf(nm), g = (K.g || 0.7) * ((K.gain || [])[j] != null ? K.gain[j] : 1); if (b < 0) continue; const x = data[b]; for (let i = lg; i < n; i++) x[i] = x[i] * (1 - 0.5 * g) + g * src[i - lg]; }
  }
  // activité intercritique (hors crise) : pointes, ripples, fast ripples aux mêmes instants sur les plots listés (gain par plot)
  //   frOnSpk : part des fast ripples posées sur une pointe ; slow { f, amp } : onde lente sur les plots, HFO calés sur sa crête
  const truth = [];
  for (const Q of o.ied || []) {
    const ri = rng((o.seed || 7) * 31 + names.indexOf(Q.e + Q.k[0]) + 1), ok = o.inter ? t => t > 1 && t < dur - 1 : t => t > 1 && t < dur - 1 && (t < plan[0].t - 2 || t > end + 5), spkT = [];
    if (Q.slow) Q.k.forEach((k, j) => { const c = names.indexOf(Q.e + k), gk = (Q.gain || [1, 0.4, 0.15])[j] || 0.1; if (c < 0) return; const x = data[c]; for (let i = 0; i < n; i++) x[i] += gk * Q.slow.amp * Math.sin(2 * Math.PI * Q.slow.f * i / fsr); });
    for (const [kind, rate] of [['spk', Q.spk || 0], ['r', Q.r || 0], ['fr', Q.fr || 0]]) {
      const nEv = Math.round(rate * dur / 60);
      for (let m = 0; m < nEv; m++) {
        let t = 1 + ri() * (dur - 2);
        if (kind === 'fr' && Q.frOnSpk && spkT.length && ri() < Q.frOnSpk) t = spkT[Math.floor(ri() * spkT.length)] + 0.004;
        else if (kind !== 'spk' && Q.slow) t = (Math.floor(t * Q.slow.f) + 0.25) / Q.slow.f - 0.02;   // centre du HFO sur la crête
        if (!ok(t)) continue; if (kind === 'spk') spkT.push(t); const i0 = Math.round(t * fsr), f = kind === 'r' ? 100 + 60 * ri() : 280 + 60 * ri(), L = Math.round((kind === 'r' ? 0.05 + 0.03 * ri() : kind === 'fr' ? 0.02 + 0.01 * ri() : 0.03) * fsr), ph = ri() * 6.28;
        Q.k.forEach((k, j) => {
          const c = names.indexOf(Q.e + k), gk = (Q.gain || [1, 0.4, 0.15])[j] || 0.1; if (c < 0) return; const x = data[c];
          if (kind === 'spk') { for (let q = 0; q < L && i0 + q < n; q++) { const u = q / (L - 1); x[i0 + q] += gk * (Q.spkAmp || -260) * (1 - Math.abs(2 * u - 1)); } const L2 = Math.round(0.2 * fsr); for (let q = 0; q < L2 && i0 + L + q < n; q++) x[i0 + L + q] += gk * 60 * Math.sin(Math.PI * q / L2); }
          else for (let q = 0; q < L && i0 + q < n; q++) { const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * q / (L - 1)); x[i0 + q] += gk * (kind === 'r' ? (Q.rAmp || 30) : (Q.frAmp || 14)) * w * Math.sin(2 * Math.PI * f * q / fsr + ph); }
        });
        truth.push({ t, kind, e: Q.e, k: Q.k });
      }
    }
  }
  return { fs: fsr, names, data, roles, nSamples: n, ied: truth, events: o.inter ? [] : [{ onset: plan[0].t, label: 'eeg sz start' }, { onset: end, label: 'eeg sz end' }] };
}

/** crise synthétique pour l'empreinte (Grinenko 2018) et les cartes d'épileptogénicité (David 2011) : début à `on` s (après au
 *  moins 2 min de fond, référence de l'empreinte), électrodes « fp » (pointes préictales, activité rapide à deux bandes non
 *  harmoniques 75 → 65 Hz et 130 → 120 Hz, fond atténué pendant celle-ci), « fa » (activité rapide d'une seule bande à 60 Hz,
 *  sans suppression ni pointes), « slow » (thêta), « none » ; plots atteints selon leur gain (du plus interne au plus externe) */
export const FP_PLAN = [
  { e: 'B’', n: 6, role: 'fp', gain: [1, 0.55, 0.2] },
  { e: 'A’', n: 6, role: 'fa', gain: [0.9, 0.4] },
  { e: 'TP’', n: 6, role: 'slow', gain: [0.8, 0.5] },
  { e: 'OR’', n: 6, role: 'none' },
];
export function synthFP(o = {}) {
  const fsr = o.fs || 512, dur = o.dur || 200, on = o.on || 160, end = o.end || 185, n = Math.round(fsr * dur), r = rng(o.seed || 11), plan = o.plan || FP_PLAN;
  const names = [], data = [], roles = [], spikes = [on - 8, on - 5, on - 2.5, on - 1];
  for (const P of plan) {
    const common = pink(r, n, fsr), ph0 = r() * 6.28;
    for (let k = 1; k <= P.n; k++) {
      const loc = pink(r, n, fsr), x = new Float32Array(n), g = (P.gain && P.gain[k - 1]) || 0, aph = r() * 6.28; let p1 = r() * 6.28, p2 = r() * 6.28, p3 = r() * 6.28;
      for (let i = 0; i < n; i++) {
        const t = i / fsr; let bg = 22 * common[i] + 16 * loc[i] + 6 * Math.sin(2 * Math.PI * 9 * t + aph + ph0), sz = 0; const u = t - on;
        if (g > 0 && P.role === 'fp') {
          if (u >= 0 && u < 15) { const ramp = Math.min(1, u); bg *= 0.2; p1 += 2 * Math.PI * (75 - 10 * u / 15) / fsr; p2 += 2 * Math.PI * (130 - 10 * u / 15) / fsr; sz = g * ramp * (28 * Math.sin(p1) + 22 * Math.sin(p2)); }
          else if (u >= 15 && t < end) { p3 += 2 * Math.PI * 3 / fsr; sz = g * (120 * Math.pow(Math.max(0, Math.sin(p3)), 8) - 20); }
        } else if (g > 0 && P.role === 'fa' && u >= 3 && u < 15) { p1 += 2 * Math.PI * 60 / fsr; sz = g * Math.min(1, u - 3) * 25 * Math.sin(p1); }
        else if (g > 0 && P.role === 'slow' && u >= 5 && t < end) { p1 += 2 * Math.PI * 6 / fsr; sz = g * Math.min(1, (u - 5) / 2) * 60 * Math.sin(p1); }
        x[i] = bg + sz;
      }
      if (g > 0 && P.role === 'fp') for (const ts of spikes) {   // pointe (30 ms) + onde lente (200 ms) + composante rapide (100 Hz, 40 ms)
        const i0 = Math.round(ts * fsr), L = Math.round(0.03 * fsr), L2 = Math.round(0.2 * fsr), L3 = Math.round(0.04 * fsr);
        for (let q = 0; q < L; q++) x[i0 + q] += g * -320 * (1 - Math.abs(2 * q / (L - 1) - 1));
        for (let q = 0; q < L2; q++) x[i0 + L + q] += g * 90 * Math.sin(Math.PI * q / L2);
        for (let q = 0; q < L3; q++) x[i0 + q] += g * 45 * (0.5 - 0.5 * Math.cos(2 * Math.PI * q / (L3 - 1))) * Math.sin(2 * Math.PI * 100 * q / fsr);
      }
      names.push(P.e + k); data.push(x); roles.push(P.role === 'none' || !g ? 'none' : P.role);
    }
  }
  return { fs: fsr, names, data, roles, nSamples: n, spikes, events: [{ onset: on, label: 'eeg sz start' }, { onset: end, label: 'eeg sz end' }] };
}

/** écrit la crise au format BrainVision (INT_16, 0,1 µV, multiplexé) et ses fichiers BIDS */
export function writeBrainVision(dir, base, rec) {
  fs.mkdirSync(dir, { recursive: true });
  const nch = rec.names.length, ns = rec.nSamples, res = 0.1, buf = Buffer.alloc(nch * ns * 2);
  for (let s = 0, o = 0; s < ns; s++) for (let c = 0; c < nch; c++, o += 2) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(rec.data[c][s] / res))), o);
  fs.writeFileSync(path.join(dir, base + '_ieeg.eeg'), buf);
  const vhdr = ['Brain Vision Data Exchange Header File Version 1.0', '; synthétique (EpiScope)', '', '[Common Infos]', 'Codepage=UTF-8', `DataFile=${base}_ieeg.eeg`, `MarkerFile=${base}_ieeg.vmrk`, 'DataFormat=BINARY', 'DataOrientation=MULTIPLEXED', `NumberOfChannels=${nch}`, `SamplingInterval=${1e6 / rec.fs}`, '', '[Binary Infos]', 'BinaryFormat=INT_16', '', '[Channel Infos]',
    ...rec.names.map((nm, i) => `Ch${i + 1}=${nm},,${res},µV`), ''].join('\r\n');
  fs.writeFileSync(path.join(dir, base + '_ieeg.vhdr'), vhdr);
  const vmrk = ['Brain Vision Data Exchange Marker File, Version 1.0', '', '[Common Infos]', 'Codepage=UTF-8', `DataFile=${base}_ieeg.eeg`, '', '[Marker Infos]', 'Mk1=New Segment,,1,1,0',
    ...rec.events.map((e, i) => `Mk${i + 2}=Comment,${e.label},${Math.round(e.onset * rec.fs) + 1},1,0`), ''].join('\r\n');
  fs.writeFileSync(path.join(dir, base + '_ieeg.vmrk'), vmrk);
  fs.writeFileSync(path.join(dir, base + '_channels.tsv'), ['name\ttype\tunits\tsampling_frequency\tstatus', ...rec.names.map(nm => `${nm}\tSEEG\tµV\t${rec.fs}\tgood`)].join('\n') + '\n');
  fs.writeFileSync(path.join(dir, base + '_events.tsv'), ['onset\tduration\ttrial_type', ...rec.events.map(e => `${e.onset}\t0\t${e.label}`)].join('\n') + '\n');
  fs.writeFileSync(path.join(dir, base + '_ieeg.json'), JSON.stringify({ TaskName: 'ictal', SamplingFrequency: rec.fs, PowerLineFrequency: 50, RecordingDuration: ns / rec.fs, SEEGChannelCount: nch }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2] || 'synth_seeg', base = process.argv[3] || 'sub-synth_ses-seeg1_task-ictal_run-01';
  const rec = synthSeizure(); writeBrainVision(dir, base, rec);
  console.log(`${rec.names.length} voies, ${rec.nSamples / rec.fs} s à ${rec.fs} Hz → ${dir}/${base}_ieeg.vhdr`);
}
