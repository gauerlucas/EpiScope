/* EpiScope — ieeg.js : tracés SEEG (lecture, montages, filtres) et index d'épileptogénicité de Bartolomei (2008).
 *
 * Lecture (sans dépendance) : BrainVision (.vhdr + .eeg + .vmrk ; INT_16, INT_32, UINT_16, IEEE_FLOAT_32, multiplexé ou
 * vectorisé), EDF / EDF+ (annotations) et BDF, et le .eeg d'un dossier BIDS sans .vhdr (channels.tsv + _ieeg.json :
 * flottants 32 bits multiplexés). Un fichier tronqué est lu jusqu'au dernier échantillon complet (avertissement).
 *
 * Index d'épileptogénicité (EI) — Bartolomei, Chauvel, Wendling, Brain 2008;131:1818-30 :
 *   1. ER[n] = (Eβ + Eγ) / (Eθ + Eα), énergies des bandes θ 3,5–7,4 · α 7,4–12,4 · β 12,4–24 · γ 24–97 Hz, estimées sur une
 *      fenêtre glissante de durée D par la méthode du périodogramme (moyenne de spectres FFT) ;
 *   2. Page–Hinkley : U_N = Σ_{n≤N} (ER[n] − ER̄_n − ν), ER̄_n moyenne de ER[1..n] ; u_N = min U_n ; alarme Na quand
 *      U_N − u_N > λ ; temps de détection Nd = dernier minimum local de U avant l'alarme ;
 *   3. EI_i = 1 / (Nd_i − N0 + τ) · Σ_{n=Nd_i}^{Nd_i+H} ER[n], N0 = première détection, τ = 1 s, H = 5 s ; une structure
 *      sans décharge rapide prend Nd = fin de la crise ; EI normalisé par le maximum (0 à 1). Seuils retenus (EZT) :
 *      EI ≥ 0,4 : zone épileptogène (EZ) ; 0,1 < EI < 0,4 : zone de propagation (PZ) ; l'article d'origine prenait 0,3.
 *   Mise en œuvre : signal ramené vers 250 Hz (filtre anti-repliement), segments de 0,5 s (fenêtre de Hann, complétés à
 *   1 Hz de résolution), pas de 0,125 s ; ER sur D = 1 s (moyenne des segments de la fenêtre) ; raies du secteur (50 ou
 *   60 Hz et harmoniques, ± 4,5 Hz : lobe principal de la fenêtre) exclues des bandes. U_N est cumulé en secondes (ER × s) : ν en unités d'ER, λ en ER·s,
 *   indépendants du pas. */
(function (factory) {
  const G = typeof window !== 'undefined' ? (window.SV = window.SV || {}) : (globalThis.SV = globalThis.SV || {});
  factory(G); (G._factories = G._factories || {}).ieeg = factory;
})(function (SV) {
  'use strict';
  const BANDS = { theta: [3.5, 7.4], alpha: [7.4, 12.4], beta: [12.4, 24], gamma: [24, 97] };
  const DEF = { bands: BANDS, win: 1, seg: 0.5, step: 0.125, line: 50, nu: 0.5, lambda: 8, tau: 1, H: 5 };
  /** seuils de surlignage des index normalisés (0 à 1) : EI ≥ 0,4 zone épileptogène, 0,1 < EI < 0,4 zone de propagation ;
   *  cEI ≥ 0,6 ; PEI ≥ 0,72 (Bratu et al., Epilepsia 2024) */
  const EZT = { ei: 0.4, eiPZ: 0.1, cei: 0.6, pei: 0.72 };
  /** zone d'une valeur d'EI : 'ez' (≥ ez), 'pz' (> pz et < ez) ou '' */
  function eiZone(v, ez, pz) { ez = ez == null ? EZT.ei : ez; pz = pz == null ? EZT.eiPZ : pz; return !(v >= 0) ? '' : v >= ez ? 'ez' : v > pz ? 'pz' : ''; }
  const isBad = c => /bad/i.test(c.status || '');
  const NONSEEG = /^(ekg|ecg|event|ref|emg|eog|pulse|spo2|sao2|puls|beat|trig|dc\d*|status|resp|photic|mk|mkr|marker|annotations?|value|emd)\b/i;
  /** exports Brainquick / Micromed (SystemPLUS) : étiquette « EEG NA1 », « ECG ecg+ », « SaO2 SpO2+ », « Value MKR1+ » → nom de voie
   *  sans le type, type déduit du préfixe ; transducteur « Monopolar » / « Bipolar » ; dates aux mois en français (v4.21) */
  const EDF_PREFIX = /^(EEG|SEEG|ECoG|iEEG|ECG|EKG|EMG|EOG|SaO2|SpO2|Value|Resp|Trig|MKR|Marker|DC|Ref)\s+(?=\S)/i;
  const EDF_TYPE = { eeg: 'SEEG', seeg: 'SEEG', ecog: 'ECOG', ieeg: 'SEEG', ecg: 'ECG', ekg: 'ECG', emg: 'EMG', eog: 'EOG', sao2: 'MISC', spo2: 'MISC', value: 'TRIG', resp: 'RESP', trig: 'TRIG', mkr: 'TRIG', marker: 'TRIG', dc: 'MISC', ref: 'REF' };
  const FR_MONTHS = { jan: 1, janv: 1, feb: 2, fev: 2, 'fév': 2, 'févr': 2, mar: 3, mars: 3, apr: 4, avr: 4, may: 5, mai: 5, jun: 6, juin: 6, jul: 7, juil: 7, aug: 8, 'aoû': 8, aout: 8, 'août': 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12, 'déc': 12 };
  /** « Startdate 02-JUIN-2021 » ou « 02.06.21 » → 'AAAA-MM-JJ' ('' si illisible) */
  function edfDate(rec, hdrDate) {
    const m = String(rec || '').match(/startdate\s+(\d{1,2})-([^\s-]+)-(\d{4})/i);
    if (m) { const mo = FR_MONTHS[m[2].toLowerCase().replace(/\.$/, '')] || parseInt(m[2], 10); if (mo >= 1 && mo <= 12) return `${m[3]}-${String(mo).padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
    const h = String(hdrDate || '').match(/(\d{2})\.(\d{2})\.(\d{2})/); if (h) { const y = +h[3] >= 85 ? 1900 + +h[3] : 2000 + +h[3]; return `${y}-${h[2]}-${h[1]}`; }
    return '';
  }

  // ================================================================ textes
  function parseTSV(text) {
    const lines = String(text || '').replace(/\r/g, '').split('\n').filter(l => l.trim().length);
    if (!lines.length) return [];
    const head = lines[0].split('\t').map(s => s.trim());
    return lines.slice(1).map(l => { const c = l.split('\t'), o = {}; head.forEach((h, i) => { o[h] = (c[i] == null ? '' : c[i]).trim(); }); return o; });
  }
  /** fichier INI de BrainVision → { section: [[clé, valeur], …] } */
  function parseIni(text) {
    const out = {}; let cur = null;
    for (const raw of String(text || '').replace(/\r/g, '').split('\n')) {
      const l = raw.trim(); if (!l || l[0] === ';') continue;
      const m = l.match(/^\[(.+)\]$/); if (m) { cur = out[m[1]] = []; continue; }
      const i = l.indexOf('='); if (i < 0 || !cur) continue; cur.push([l.slice(0, i).trim(), l.slice(i + 1)]);
    }
    return out;
  }
  const get = (sec, k) => { const e = (sec || []).find(x => x[0].toLowerCase() === k.toLowerCase()); return e ? e[1].trim() : ''; };

  // ================================================================ BrainVision
  function vhdrInfo(text) {
    const I = parseIni(text), C = I['Common Infos'] || [], B = I['Binary Infos'] || [], CH = I['Channel Infos'] || [];
    const nch = +get(C, 'NumberOfChannels') || CH.length, si = +get(C, 'SamplingInterval');
    if (!nch || !si) throw new Error('en-tête BrainVision incomplet (nombre de voies, intervalle d’échantillonnage)');
    const fmt = (get(B, 'BinaryFormat') || 'INT_16').toUpperCase(), orient = (get(C, 'DataOrientation') || 'MULTIPLEXED').toUpperCase();
    if ((get(C, 'DataFormat') || 'BINARY').toUpperCase() !== 'BINARY') throw new Error('BrainVision : seul le format binaire est lu');
    const channels = CH.filter(([k]) => /^Ch\d+$/i.test(k)).sort((a, b) => +a[0].slice(2) - +b[0].slice(2)).map(([, v]) => {
      const p = v.split(','), un = s => (s || '').replace(/\\1/g, ',');
      return { name: un(p[0]).trim(), ref: un(p[1]).trim(), res: p[2] && p[2].trim() !== '' ? +p[2] : 1, unit: (p[3] || 'µV').trim() || 'µV' };
    });
    while (channels.length < nch) channels.push({ name: 'Ch' + (channels.length + 1), ref: '', res: 1, unit: 'µV' });
    return { kind: 'brainvision', dataFile: get(C, 'DataFile'), markerFile: get(C, 'MarkerFile'), format: fmt, orientation: orient, nch, fs: 1e6 / si, channels };
  }
  function vmrkEvents(text, fs) {
    const I = parseIni(text), M = I['Marker Infos'] || [], out = [];
    for (const [k, v] of M) {
      if (!/^Mk\d+$/i.test(k)) continue; const p = v.split(','), type = (p[0] || '').trim(), desc = (p[1] || '').replace(/\\1/g, ',').trim(), pos = +p[2], size = +p[3] || 1;
      if (/^new segment$/i.test(type)) { const dt = (p[5] || '').trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/); if (dt && !out.startDate) { out.startDate = `${dt[1]}-${dt[2]}-${dt[3]}`; out.startTime = `${dt[4]}:${dt[5]}:${dt[6]}`; } continue; }
      if (!isFinite(pos)) continue;
      out.push({ onset: (pos - 1) / fs, duration: size > 1 ? size / fs : 0, label: desc || type, type, source: 'vmrk' });
    }
    return out;
  }
  const BPS = { INT_16: 2, UINT_16: 2, INT_32: 4, IEEE_FLOAT_32: 4, IEEE_FLOAT_64: 8 };
  /** données binaires → une Float32Array par voie (× résolution) */
  function decodeBinary(bytes, info) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), bps = BPS[info.format]; if (!bps) throw new Error('format binaire non pris en charge : ' + info.format);
    const nch = info.nch, nTot = Math.floor(u8.byteLength / bps), ns = Math.floor(nTot / nch), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), warn = [];
    if (ns * nch * bps !== u8.byteLength) warn.push(`fichier de données tronqué ou incomplet : ${ns} échantillons complets lus (${(u8.byteLength / 1048576).toFixed(2)} Mo)`);
    const rd = info.format === 'INT_16' ? o => dv.getInt16(o, true) : info.format === 'UINT_16' ? o => dv.getUint16(o, true) : info.format === 'INT_32' ? o => dv.getInt32(o, true) : info.format === 'IEEE_FLOAT_64' ? o => dv.getFloat64(o, true) : o => dv.getFloat32(o, true);
    const data = []; for (let c = 0; c < nch; c++) data.push(new Float32Array(ns));
    const vec = info.orientation === 'VECTORIZED';
    // cas courant (flottants multiplexés, aligné) : lecture directe
    if (!vec && info.format === 'IEEE_FLOAT_32' && u8.byteOffset % 4 === 0) {
      const f = new Float32Array(u8.buffer, u8.byteOffset, ns * nch);
      for (let c = 0; c < nch; c++) { const d = data[c], r = info.channels[c].res; for (let s = 0, o = c; s < ns; s++, o += nch) d[s] = f[o] * r; }
    } else for (let c = 0; c < nch; c++) { const d = data[c], r = info.channels[c].res; for (let s = 0; s < ns; s++) d[s] = rd(bps * (vec ? c * ns + s : s * nch + c)) * r; }
    return { data, nSamples: ns, warnings: warn };
  }
  /** .eeg d'un dossier BIDS sans .vhdr : voies de channels.tsv, fréquence de _ieeg.json (ou de channels.tsv) */
  function bidsRawInfo(channelsTsv, ieegJson) {
    const rows = parseTSV(channelsTsv); if (!rows.length) throw new Error('channels.tsv vide');
    let J = {}; try { J = ieegJson ? JSON.parse(ieegJson) : {}; } catch (e) { J = {}; }
    const fs = +J.SamplingFrequency || +(rows[0].sampling_frequency || 0); if (!fs) throw new Error('fréquence d’échantillonnage inconnue (_ieeg.json)');
    return { kind: 'bids-raw', format: 'IEEE_FLOAT_32', orientation: 'MULTIPLEXED', nch: rows.length, fs, line: +J.PowerLineFrequency || 0, scaleUnknown: true,
      channels: rows.map(r => ({ name: r.name, ref: '', res: 1, unit: r.units && r.units !== 'n/a' ? r.units : 'µV', type: r.type || '', status: r.status || '', statusText: r.status_description || '' })) };
  }

  // ================================================================ EDF / EDF+ / BDF
  function readEDF(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), txt = (o, n) => { let s = ''; for (let i = o; i < o + n; i++) s += String.fromCharCode(u8[i]); return s.trim(); };
    const bdf = u8[0] === 255, hb = +txt(184, 8), nrec0 = +txt(236, 8), dur = +txt(244, 8), ns = +txt(252, 4), resv = txt(192, 44);
    if (!ns || !hb) throw new Error('en-tête EDF illisible');
    const f = (k, w) => { const a = []; let o = 256; const offs = { label: [0, 16], trans: [16, 80], dim: [96, 8], pmin: [104, 8], pmax: [112, 8], dmin: [120, 8], dmax: [128, 8], pre: [136, 80], nsr: [216, 8] }; const [rel, width] = offs[k]; for (let i = 0; i < ns; i++) a.push(txt(256 + rel * ns + i * width, width)); return a; };
    const label0 = f('label'), trans = f('trans'), dim = f('dim'), pmin = f('pmin').map(Number), pmax = f('pmax').map(Number), dmin = f('dmin').map(Number), dmax = f('dmax').map(Number), nsr = f('nsr').map(Number);
    // Brainquick / Micromed : « EEG NA1 » → NA1 (type SEEG) ; « ECG ecg+ » → ecg+ (type ECG)…
    const ctype = [], label = label0.map((l, i) => { const m = l.match(EDF_PREFIX); if (!m) { ctype[i] = ''; return l; } ctype[i] = EDF_TYPE[m[1].toLowerCase()] || ''; return l.slice(m[0].length).trim(); });
    const bipIn = label.some((l, i) => /bipolar/i.test(trans[i]) && /^\S+\d+\s*-\s*\S+\d+$/.test(l)) && !label.some((l, i) => /monopolar/i.test(trans[i]));
    const bps = bdf ? 3 : 2, recBytes = nsr.reduce((a, b) => a + b, 0) * bps, nrec = nrec0 > 0 ? Math.min(nrec0, Math.floor((u8.byteLength - hb) / recBytes)) : Math.floor((u8.byteLength - hb) / recBytes), warn = [];
    if (nrec0 > 0 && nrec < nrec0) warn.push(`EDF tronqué : ${nrec} enregistrements sur ${nrec0}`);
    const ann = label.map(l => /annotations/i.test(l)), sig = label.map((l, i) => !ann[i]);
    const counts = {}; nsr.forEach((n, i) => { if (sig[i]) counts[n] = (counts[n] || 0) + 1; }); const nMain = +Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    const keep = label.map((l, i) => sig[i] && nsr[i] === nMain), fs = nMain / (dur || 1);
    const chIdx = keep.map((k, i) => k ? i : -1).filter(i => i >= 0), data = chIdx.map(() => new Float32Array(nrec * nMain)), events = [], recT = new Float64Array(nrec).fill(NaN);
    const gain = label.map((l, i) => (pmax[i] - pmin[i]) / ((dmax[i] - dmin[i]) || 1)), off = label.map((l, i) => pmin[i] - gain[i] * dmin[i]);
    const recOff = []; { let o = 0; for (let i = 0; i < ns; i++) { recOff.push(o); o += nsr[i] * bps; } }
    for (let r = 0; r < nrec; r++) {
      const base = hb + r * recBytes;
      chIdx.forEach((i, c) => { const d = data[c], g = gain[i], z = off[i], o0 = base + recOff[i], s0 = r * nMain; for (let s = 0; s < nMain; s++) { const o = o0 + s * bps; let v = bdf ? (u8[o] | (u8[o + 1] << 8) | (u8[o + 2] << 16)) : (u8[o] | (u8[o + 1] << 8)); if (bdf) { if (v & 0x800000) v -= 0x1000000; } else if (v & 0x8000) v -= 0x10000; d[s0 + s] = v * g + z; } });
      label.forEach((l, i) => { if (!ann[i]) return; let s = ''; const o0 = base + recOff[i]; for (let k = 0; k < nsr[i] * bps; k++) s += String.fromCharCode(u8[o0 + k]);
        let first = true;
        for (const tal of s.split('\x00')) { if (!tal) continue; const parts = tal.split('\x14'), hd = parts[0].split('\x15'), on = parseFloat(hd[0]), du = hd[1] ? parseFloat(hd[1]) : 0; if (first && isFinite(on) && isNaN(recT[r])) recT[r] = on; first = false; for (const t of parts.slice(1)) if (t && isFinite(on)) events.push({ onset: isNaN(recT[r]) ? on : r * dur + (on - recT[r]), duration: du || 0, label: t, type: 'EDF+', source: 'edf' }); } });   // temps absolu → temps du tracé (EDF+D)
    }
    const channels = chIdx.map(i => ({ name: label[i], unit: dim[i] || 'µV', res: 1, ref: '', type: ctype[i] || '', transducer: trans[i] || '' }));
    // EDF+D (enregistrement discontinu, exports Brainquick) : les enregistrements sont mis bout à bout dans le tracé ; les sauts de
    // temps entre deux enregistrements successifs deviennent des évènements « coupure », la table des segments garde l'heure réelle
    const segments = []; let gapTotal = 0;
    if (/EDF\+D/i.test(resv)) {
      let seg = null;
      for (let r = 0; r < nrec; r++) { const t = recT[r]; if (isNaN(t)) continue; const expect = seg ? seg.t0 + (r - seg.r0) * dur : null;
        if (seg && Math.abs(t - expect) > 1e-3) { const gap = t - expect; gapTotal += Math.max(0, gap); events.push({ onset: r * dur, duration: 0, label: gap > 0 ? `coupure : ${gap >= 60 ? Math.round(gap / 60) + ' min' : Math.round(gap) + ' s'} manquante${gap >= 60 ? 's' : ''}` : 'enregistrements superposés', sys: true }); seg = null; }
        if (!seg) { seg = { r0: r, t0: t, sample0: r * nMain, n: 0 }; segments.push(seg); } seg.n = r - seg.r0 + 1; }
      if (segments.length > 1) warn.push(`enregistrement discontinu : ${segments.length} segments (${gapTotal >= 60 ? Math.round(gapTotal / 60) + ' min' : Math.round(gapTotal) + ' s'} absents du tracé, marqués « coupure »)`);
    }
    // EDF+ : la première annotation de chaque enregistrement (temps de l'enregistrement, sans texte) est écartée ci-dessus
    return { kind: bdf ? 'bdf' : (/EDF\+/.test(resv) ? 'edf+' : 'edf'), fs, nch: channels.length, channels, data, nSamples: nrec * nMain, events, warnings: warn, start: txt(168, 8) + ' ' + txt(176, 8), startDate: edfDate(txt(88, 80), txt(168, 8)), startTime: txt(176, 8).replace(/\./g, ':'), patient: txt(8, 80), segments, bipolarIn: bipIn, prefixed: label0.some((l, i) => l !== label[i]) };
  }

  // ================================================================ enregistrement complet
  const UNIT = { v: 1e6, mv: 1e3, uv: 1, 'µv': 1, 'μv': 1, nv: 1e-3 };
  const unitFactor = u => { const k = String(u || '').trim().toLowerCase(); return UNIT[k] != null ? UNIT[k] : 1; };
  /** assemble un enregistrement à partir de ses pièces (textes, ArrayBuffer) : { vhdr, vmrk, eeg, edf, channels, events,
   *  json } → { kind, fs, nSamples, duration, channels [{ name, unit, type, status, statusText }], data (µV), events,
   *  warnings, line } — channels.tsv (statut des voies) et events.tsv complètent BrainVision et EDF */
  function openRecording(P) {
    let info, dec, events = [], kind;
    let extra = {};
    if (P.edf) { const r = readEDF(P.edf); kind = r.kind; info = { fs: r.fs, channels: r.channels }; dec = { data: r.data, nSamples: r.nSamples, warnings: r.warnings }; events = r.events; extra = { segments: r.segments, bipolarIn: r.bipolarIn, startDate: r.startDate, startTime: r.startTime, prefixed: r.prefixed }; if (r.prefixed) dec.warnings.push('export Brainquick / Micromed : préfixes de type retirés des noms de voies (« EEG NA1 » → NA1)'); }
    else if (P.vhdr) { info = vhdrInfo(P.vhdr); kind = 'brainvision'; if (!P.eeg) throw new Error('fichier de données .eeg manquant (à choisir avec le .vhdr)'); dec = decodeBinary(P.eeg, info); if (P.vmrk) { events = vmrkEvents(P.vmrk, info.fs); if (events.startDate) extra = { startDate: events.startDate, startTime: events.startTime }; } }
    else if (P.eeg && P.channels) { info = bidsRawInfo(P.channels, P.json); kind = 'bids-raw'; dec = decodeBinary(P.eeg, info); }
    else throw new Error(P.eeg ? '.eeg seul : joindre le .vhdr, ou channels.tsv et _ieeg.json (BIDS)' : 'aucun fichier de tracé reconnu');
    const chans = info.channels.map(c => ({ name: c.name, unit: c.unit || 'µV', type: c.type || '', status: c.status || '', statusText: c.statusText || '' }));
    if (P.channels && kind !== 'bids-raw') { const by = new Map(parseTSV(P.channels).map(r => [r.name, r])); chans.forEach(c => { const r = by.get(c.name); if (r) { c.type = r.type || c.type; c.status = r.status || c.status; c.statusText = r.status_description && r.status_description !== 'n/a' ? r.status_description : ''; } }); }
    if (P.events) for (const r of parseTSV(P.events)) { const on = +r.onset, lab = r.trial_type && r.trial_type !== 'n/a' ? r.trial_type : (r.value || r.description || 'évènement'); if (!isFinite(on)) continue; if (!events.some(e => Math.abs(e.onset - on) < 0.01 && e.label === lab)) events.push({ onset: on, duration: +r.duration || 0, label: lab, source: 'events.tsv' }); }
    let line = info.line || 0; if (P.json) { try { const J = JSON.parse(P.json); if (+J.PowerLineFrequency) line = +J.PowerLineFrequency; } catch (e) { } }
    // unités → µV ; flottants BIDS : volts si l'amplitude typique est infime (données écrites en V malgré « µV »)
    // (écart moyen à la moyenne, médiane des voies SEEG : les décalages continus ne comptent pas)
    let volts = false, odd = false;
    if (info.scaleUnknown) {
      const dev = []; dec.data.forEach((x, i) => { if (!isSeegChannel(chans[i]) || isBad(chans[i]) || !x.length) return; const st = Math.max(1, (x.length / 4000) | 0); let s = 0, n = 0; for (let j = 0; j < x.length; j += st) { s += x[j]; n++; } const m = s / n; let d = 0; for (let j = 0; j < x.length; j += st) d += Math.abs(x[j] - m); dev.push(d / n); });
      dev.sort((a, b) => a - b); const med = dev.length ? dev[dev.length >> 1] : 1; volts = med > 0 && med < 1e-2; odd = !volts && (med > 5000 || med < 0.2);
    }
    dec.data.forEach((x, i) => { const f = volts ? 1e6 : unitFactor(chans[i].unit); if (f !== 1) for (let j = 0; j < x.length; j++) x[j] *= f; chans[i].unit = 'µV'; });
    const warnings = (dec.warnings || []).slice(); if (volts) warnings.push('valeurs en volts converties en µV'); if (odd) warnings.push('échelle d’amplitude incertaine sans .vhdr : valeurs affichées telles quelles (l’EI n’en dépend pas)');
    events.sort((a, b) => a.onset - b.onset);
    return Object.assign({ kind, fs: info.fs, nSamples: dec.nSamples, duration: dec.nSamples / info.fs, channels: chans, data: dec.data, events, warnings, line }, extra);
  }
  /** début et fin de crise d'après les évènements du fichier (« eeg sz start », « onset », « début de crise »…) */
  const SZ_END = /(sz|seizure|crise|ictal|eeg).*(end|fin|offset|stop|termin)|^\s*(offset|fin|end|stop|sz ?off|fin de crise)\b/i;
  const SZ_ON = /(sz|seizure|crise|ictal|eeg).*(start|onset|d[ée]but|begin)|^\s*(onset|d[ée]but|sz ?on|start)\b|^\s*(eeg\s*)?(sz|seizure|crise|ictal)\s*\d*\s*$/i;
  function seizureMarks(events) {
    const L = (events || []).slice().sort((a, b) => a.onset - b.onset), on = L.find(e => SZ_ON.test(e.label) && !SZ_END.test(e.label));
    const off = L.find(e => SZ_END.test(e.label) && (!on || e.onset > on.onset));
    return { onset: on ? on.onset : null, end: off ? off.onset : null };
  }

  // ================================================================ voies, montages
  /** « A’12 », « A'12 », « Ap12 », « TB’3 », « LA1 » → { elec, k } (prime typographique unifié) */
  function parseContact(name) {
    const s = String(name || '').trim().replace(/[’'`´‘]/g, '’'), m = s.match(/^(.*?)[\s_-]*(\d+)$/); if (!m || !m[1]) return null;
    return { elec: m[1], k: +m[2] };
  }
  const isSeegChannel = c => !(c.type && !/seeg|ecog|eeg|ieeg/i.test(c.type)) && !NONSEEG.test(c.name);
  /** dérivations bipolaires : plots voisins (k, k+1) d'une même électrode, tous deux valides */
  function bipolarPairs(chans, ok) {
    const by = new Map(); chans.forEach((c, i) => { if (ok && !ok(c, i)) return; const p = parseContact(c.name); if (!p) return; (by.get(p.elec) || by.set(p.elec, []).get(p.elec)).push({ i, k: p.k }); });
    const out = [];
    for (const [elec, L] of by) { L.sort((a, b) => a.k - b.k); for (let j = 0; j + 1 < L.length; j++) if (L[j + 1].k === L[j].k + 1) out.push({ name: `${chans[L[j].i].name}-${chans[L[j + 1].i].name}`, a: L[j].i, b: L[j + 1].i, elec, k1: L[j].k, k2: L[j + 1].k }); }
    return out;
  }
  /** dérivations : 'mono' (voies SEEG d'abord, puis les autres) ou 'bipolar' (plots voisins valides) →
   *  [{ name, a, b (−1 en monopolaire), elec, k1, k2, seeg, bad }] */
  function montage(chans, kind) {
    // v5.3 : EEG de scalp (≥ 8 électrodes 10-20) — référence d'enregistrement, moyenne, double banane, transverse
    const E = SV.ESI, names = chans.map(c => c.name), RM = E ? E.recordedMontage(names) : null, sc = E ? E.scalpChannels(names).filter(x => !isBad(chans[x.i])) : [];
    if (RM && RM.kind === 'bip') {   // EEG enregistré en bipolaire (ex. CHB-MIT) : voies telles qu'enregistrées, rangées par chaîne
      const L = chans.map((c, i) => { const p = E.bipName(c.name); return p ? { name: p.join('-'), a: i, b: -1, elec: E.scalpRegion(p[0]) === 'médian' || E.scalpRegion(p[1]) === 'médian' ? 'médian' : E.scalpRegion(p[0]), k1: null, k2: null, seeg: !isBad(c), bad: isBad(c), scalp: true } : null; });
      const D = L.filter(Boolean).sort((x, y) => E.scalpRank(x.name.split('-')[0]) - E.scalpRank(y.name.split('-')[0]));
      return D.concat(chans.map((c, i) => L[i] ? null : { name: c.name, a: i, b: -1, elec: '·', k1: null, k2: null, seeg: false, bad: isBad(c) }).filter(Boolean));
    }
    if (sc.length >= 8 || ['avg', 'banana', 'trans', 'lap'].includes(kind)) {
      const idx = new Map(sc.map(x => [x.name, x.i])), others = chans.map((c, i) => i).filter(i => !sc.some(x => x.i === i)).map(i => ({ name: chans[i].name, a: i, b: -1, elec: '·', k1: null, k2: null, seeg: false, bad: isBad(chans[i]) }));
      if (kind === 'banana' || kind === 'trans') return E.scalpPairs(idx, kind).map(p => Object.assign(p, { k1: null, k2: null, seeg: true, bad: false, scalp: true })).concat(others.filter(d => /^(ecg|ekg|emg|eog)/i.test(d.name)));
      const ord = sc.slice().sort((a, b) => E.scalpRank(a.name) - E.scalpRank(b.name)), refs = sc.map(x => x.i), nb = kind === 'lap' ? E.hjorth(sc.map(x => x.name)) : null, pos = new Map(sc.map((x, k) => [x.i, k]));
      return ord.map(x => ({ name: kind === 'avg' ? x.name + '-moy' : kind === 'lap' ? x.name + '-lap' : x.name, a: x.i, b: -1, avg: kind === 'avg' ? refs : nb ? nb[pos.get(x.i)].map(k => sc[k].i) : null, elec: E.scalpRegion(x.name), k1: null, k2: null, seeg: true, bad: false, scalp: true })).concat(others);
    }
    if (kind === 'bipolar') return bipolarPairs(chans, c => isSeegChannel(c) && !isBad(c)).map(p => Object.assign(p, { seeg: true, bad: false }));
    const out = chans.map((c, i) => { const p = parseContact(c.name); return { name: c.name, a: i, b: -1, elec: p ? p.elec : c.name, k1: p ? p.k : null, k2: null, seeg: isSeegChannel(c), bad: isBad(c) }; });
    return out.filter(d => d.seeg).concat(out.filter(d => !d.seeg));
  }
  /** plots (noms des voies) d'une dérivation */
  const derContacts = (d, chans) => d.b >= 0 ? [chans[d.a].name, chans[d.b].name] : [chans[d.a].name];
  /** signal d'une dérivation sur les échantillons [i0, i1[ */
  function deriveSignal(data, d, i0, i1) {
    const a = data[d.a], b = d.b >= 0 ? data[d.b] : null; i0 = Math.max(0, i0 | 0); i1 = Math.min(a.length, i1 | 0);
    const n = Math.max(0, i1 - i0), y = new Float32Array(n);
    if (b) for (let j = 0; j < n; j++) y[j] = a[i0 + j] - b[i0 + j]; else y.set(a.subarray(i0, i1));
    if (d.avg && d.avg.length) { const R = d.avg.map(k => data[k]), m = R.length; for (let j = 0; j < n; j++) { let s = 0; for (let k = 0; k < m; k++) s += R[k][i0 + j]; y[j] -= s / m; } }   // référence moyenne (scalp)
    return y;
  }
  /** électrode du schéma pour un préfixe de tracé : nom identique, « p » final pour le prime (Ap → A’), ou convention
   *  gauche / droite (LA → A’, RA → A) ; names : noms des électrodes du schéma */
  function matchElectrode(prefix, names) {
    const norm = s => String(s || '').trim().replace(/[’'`´‘]/g, '’').replace(/\s+/g, '').toLowerCase();
    const by = new Map((names || []).map(n => [norm(n), n])), p = norm(prefix), cands = [p];
    if (p.length > 1 && /p$/.test(p)) cands.push(p.slice(0, -1) + '’');
    const m = p.match(/^([lr])([a-z].*)$/); if (m) cands.push(m[1] === 'l' ? m[2].replace(/’$/, '') + '’' : m[2]);
    for (const c of cands) if (by.has(c)) return by.get(c);
    return null;
  }

  // ================================================================ filtres (affichage)
  function biquad(type, f0, fs, Q) {
    const w = 2 * Math.PI * f0 / fs, c = Math.cos(w), s = Math.sin(w), al = s / (2 * (Q || Math.SQRT1_2)); let b0, b1, b2, a0, a1, a2;
    if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; } else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; } else { b0 = 1; b1 = -2 * c; b2 = 1; }
    a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
  }
  function runBiquad(x, k) { const [b0, b1, b2, a1, a2] = k; let x1 = x[0], x2 = x[0], y1 = 0, y2 = 0; const y = new Float32Array(x.length); for (let i = 0; i < x.length; i++) { const v = x[i], o = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = o; y[i] = o; } return y; }
  /** passe-haut, passe-bas (Butterworth d'ordre 2), coupe-bande (raie du secteur et harmonique) — une passe, pour l'affichage */
  function filterView(x, fs, o) {
    let y = x; if (!o) return y;
    if (o.hp > 0 && o.hp < fs / 2) { let m = 0; for (let i = 0; i < Math.min(y.length, 64); i++) m += y[i]; m /= Math.min(y.length, 64) || 1; const z = new Float32Array(y.length); for (let i = 0; i < y.length; i++) z[i] = y[i] - m; y = runBiquad(z, biquad('hp', o.hp, fs)); }
    if (o.notch > 0) for (let h = 1; h <= 2; h++) if (o.notch * h < fs / 2 - 1) y = runBiquad(y, biquad('notch', o.notch * h, fs, 30));
    if (o.lp > 0 && o.lp < fs / 2) y = runBiquad(y, biquad('lp', o.lp, fs));
    return y;
  }

  // ================================================================ FFT
  const fftCache = new Map();
  function fftPlan(n) {
    if (fftCache.has(n)) return fftCache.get(n);
    const rev = new Uint32Array(n), lg = Math.log2(n); for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < lg; b++) r |= ((i >> b) & 1) << (lg - 1 - b); rev[i] = r; }
    const cs = new Float64Array(n / 2), sn = new Float64Array(n / 2); for (let i = 0; i < n / 2; i++) { cs[i] = Math.cos(2 * Math.PI * i / n); sn[i] = -Math.sin(2 * Math.PI * i / n); }
    const P = { n, rev, cs, sn }; fftCache.set(n, P); return P;
  }
  /** FFT complexe en place (radix 2) */
  function fft(re, im, P) {
    const n = P.n, rev = P.rev;
    for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let i = 0; i < n; i += size) for (let j = 0, k = 0; j < half; j++, k += step) {
        const a = i + j, b = a + half, wr = P.cs[k], wi = P.sn[k], tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
  }

  // ================================================================ rapport d'énergie (ER)
  /** filtre passe-bas (sinus cardinal fenêtré de Hamming) et décimation d'un facteur q */
  function decimate(x, q, fs) {
    if (q <= 1) return x;
    const fc = 0.4 / q, M = 8 * q + 1, h = new Float64Array(M), mid = (M - 1) / 2; let sum = 0;
    for (let i = 0; i < M; i++) { const t = i - mid, v = t === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * t) / (Math.PI * t); h[i] = v * (0.54 - 0.46 * Math.cos(2 * Math.PI * i / (M - 1))); sum += h[i]; }
    for (let i = 0; i < M; i++) h[i] /= sum;
    const n = Math.floor(x.length / q), y = new Float32Array(n), L = x.length;
    for (let j = 0; j < n; j++) { const c = j * q; let s = 0; for (let i = 0; i < M; i++) { let k = c + i - mid; if (k < 0) k = 0; else if (k >= L) k = L - 1; s += h[i] * x[k]; } y[j] = s; }
    return y;
  }
  /** ER d'un signal : { er (Float32Array), t0 (s, centre de la première fenêtre), dt (s) } */
  function energyRatio(x, fs, opts) {
    const o = Object.assign({}, DEF, opts || {}), B = o.bands || BANDS, q = Math.max(1, Math.floor(fs / 250 + 1e-9)), y = decimate(x, q, fs), f2 = fs / q;
    const segN = Math.max(16, Math.round(o.seg * f2)), hop = Math.max(1, Math.round(o.step * f2)), nfft = 1 << Math.ceil(Math.log2(Math.max(segN, f2))), P = fftPlan(nfft), df = f2 / nfft;
    const win = new Float64Array(segN); for (let i = 0; i < segN; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (segN - 1));
    // bandes → plages de raies ; raies du secteur exclues
    const top = Math.min(B.gamma[1], f2 / 2 - df), line = o.line > 0 ? o.line : 0, lw = 2 / o.seg + 0.5;   // demi-largeur exclue : lobe principal de la fenêtre de Hann (2/T) + 0,5 Hz
    const isLine = f => { if (!line) return false; for (let h = line; h <= top + lw; h += line) if (Math.abs(f - h) <= lw) return true; return false; };
    const band = new Int8Array(nfft / 2 + 1).fill(-1); // 0 = bas (θ+α), 1 = haut (β+γ)
    for (let k = 1; k <= nfft / 2; k++) { const f = k * df; if (isLine(f)) continue; if (f >= B.theta[0] && f < B.alpha[1]) band[k] = 0; else if (f >= B.beta[0] && f <= top) band[k] = 1; }
    const nSeg = Math.max(0, Math.floor((y.length - segN) / hop) + 1), lo = new Float64Array(nSeg), hi = new Float64Array(nSeg);
    const re = new Float64Array(nfft), im = new Float64Array(nfft);
    // deux segments réels par FFT complexe (parties réelle et imaginaire)
    for (let s = 0; s < nSeg; s += 2) {
      const two = s + 1 < nSeg; re.fill(0); im.fill(0);
      for (const [m, arr] of two ? [[s, re], [s + 1, im]] : [[s, re]]) { const o0 = m * hop; let mean = 0; for (let i = 0; i < segN; i++) mean += y[o0 + i]; mean /= segN; for (let i = 0; i < segN; i++) arr[i] = (y[o0 + i] - mean) * win[i]; }
      fft(re, im, P);
      let l0 = 0, h0 = 0, l1 = 0, h1 = 0;
      for (let k = 1; k <= nfft / 2; k++) {
        const bk = band[k]; if (bk < 0) continue; const j = (nfft - k) % nfft;
        const ar = (re[k] + re[j]) / 2, ai = (im[k] - im[j]) / 2, br = (im[k] + im[j]) / 2, bi = (re[j] - re[k]) / 2, pa = ar * ar + ai * ai, pb = br * br + bi * bi;
        if (bk === 0) { l0 += pa; l1 += pb; } else { h0 += pa; h1 += pb; }
      }
      lo[s] = l0; hi[s] = h0; if (two) { lo[s + 1] = l1; hi[s + 1] = h1; }
    }
    // fenêtre D : moyenne des K segments qu'elle contient (périodogramme moyenné)
    const K = Math.max(1, Math.round((o.win - o.seg) / o.step) + 1), nER = Math.max(0, nSeg - K + 1), er = new Float32Array(nER);
    let sl = 0, sh = 0; for (let m = 0; m < Math.min(K, nSeg); m++) { sl += lo[m]; sh += hi[m]; }
    for (let j = 0; j < nER; j++) { er[j] = sh / (sl || 1e-30); if (j + K < nSeg) { sl += lo[j + K] - lo[j]; sh += hi[j + K] - hi[j]; } }
    const dt = hop / f2, t0 = (segN / f2 + (K - 1) * dt) / 2;
    return { er, t0, dt, fsUsed: f2, q, nfft, df };
  }
  /** lot de voies (worker) : [Float32Array] → { ers, t0, dt } */
  function erBatch(list, fs, opts, progress) {
    const ers = []; let t0 = 0, dt = 0;
    list.forEach((x, i) => { const r = energyRatio(x, fs, opts); ers.push(r.er); t0 = r.t0; dt = r.dt; if (progress && i % 4 === 3) progress((i + 1) / list.length); });
    return { ers, t0, dt };
  }

  // ================================================================ Page–Hinkley, EI
  /** première détection dans [i0, i1] : { nd, na } (indices) ou null ; U cumulé en ER·s */
  function pageHinkley(er, i0, i1, nu, lambda, dt, keepU) {
    i0 = Math.max(0, i0 | 0); i1 = Math.min(er.length - 1, i1 == null ? er.length - 1 : i1 | 0);
    let sum = 0, n = 0, U = 0, umin = 0, imin = i0; const Uarr = keepU ? new Float32Array(Math.max(0, i1 - i0 + 1)) : null;
    for (let i = i0; i <= i1; i++) {
      n++; sum += er[i]; U += (er[i] - sum / n - nu) * dt; if (Uarr) Uarr[i - i0] = U;
      if (U < umin) { umin = U; imin = i; }
      if (U - umin > lambda) return { nd: imin, na: i, U: Uarr };   // détection = dernier minimum de U avant l'alarme
    }
    return keepU ? { nd: -1, na: -1, U: Uarr } : null;
  }
  /** courbe U_N complète sur [i0, i1] (affichage : elle n'est pas arrêtée à l'alarme), cumulée en ER·s */
  function phCurve(er, i0, i1, nu, dt) {
    i0 = Math.max(0, i0 | 0); i1 = Math.min(er.length - 1, i1 | 0); const U = new Float32Array(Math.max(0, i1 - i0 + 1)); let sum = 0, n = 0, u = 0;
    for (let i = i0; i <= i1; i++) { n++; sum += er[i]; u += (er[i] - sum / n - nu) * dt; U[i - i0] = u; }
    return U;
  }
  /** EImax : pour chaque voie (clé commune, ex. plots du schéma), maximum de l'EI parmi les tracés ; runs = [{ id, rows:
   *  [{ key, ei }] }] → [{ key, max, from (id du tracé du maximum), n03 (tracés où la valeur atteint thr, EI 0,4 par défaut),
   *  npz (tracés où elle est entre pz et thr), n (tracés où la voie figure), values: { id: ei } }] trié par EImax décroissant */
  function eiMax(runs, thr, pz) {
    const by = new Map(), T = thr == null ? EZT.ei : thr;
    for (const r of runs || []) for (const x of r.rows || []) {
      if (x.key == null || !isFinite(x.ei)) continue; let o = by.get(x.key); if (!o) by.set(x.key, o = { key: x.key, max: -Infinity, from: null, n03: 0, npz: 0, n: 0, values: {} });
      if (o.values[r.id] != null && o.values[r.id] >= x.ei) continue;   // deux voies du même tracé sur la même clé : la plus forte
      o.values[r.id] = x.ei; if (x.ei > o.max) { o.max = x.ei; o.from = r.id; }
    }
    for (const o of by.values()) { const v = Object.values(o.values); o.n = v.length; o.n03 = v.filter(x => x >= T).length; o.npz = pz == null ? 0 : v.filter(x => x > pz && x < T).length; }
    return [...by.values()].sort((a, b) => b.max - a.max || String(a.key).localeCompare(String(b.key), 'fr', { numeric: true }));
  }
  /** EI de toutes les voies. ers : [Float32Array] ; o : { t0, dt, start, end (s, fenêtre d'analyse), szEnd (s), nu, lambda,
   *  tau, H, manual: { i: tNd } } → { rows: [{ detected, manual, tNd, tNa, raw, ei }], N0 } */
  function epileptogenicity(ers, o) {
    const dt = o.dt, t0 = o.t0, idx = t => Math.round((t - t0) / dt), tOf = i => t0 + i * dt;
    const i0 = Math.max(0, idx(o.start == null ? t0 : o.start)), rows = [];
    for (let c = 0; c < ers.length; c++) {
      const er = ers[c], i1 = Math.min(er.length - 1, idx(o.end == null ? tOf(er.length - 1) : o.end));
      const man = o.manual && o.manual[c] != null ? o.manual[c] : null;
      if (man != null) { rows.push({ detected: true, manual: true, tNd: man, tNa: null }); continue; }
      const r = pageHinkley(er, i0, i1, o.nu, o.lambda, dt);
      rows.push(r ? { detected: true, manual: false, tNd: tOf(r.nd), tNa: tOf(r.na) } : { detected: false, manual: false, tNd: null, tNa: null });
    }
    const det = rows.filter(r => r.detected), N0 = det.length ? Math.min(...det.map(r => r.tNd)) : null;
    const szEnd = o.szEnd != null ? o.szEnd : (o.end != null ? o.end : null);
    let max = 0;
    rows.forEach((r, c) => {
      const er = ers[c], tN = r.detected ? r.tNd : szEnd; if (tN == null || N0 == null) { r.raw = 0; return; }
      const a = Math.max(0, idx(tN)), b = Math.min(er.length - 1, idx(tN + o.H)); let s = 0; for (let i = a; i <= b; i++) s += er[i]; s *= dt;
      r.raw = s / (Math.max(0, tN - N0) + o.tau); if (r.raw > max) max = r.raw;
    });
    rows.forEach(r => { r.ei = max > 0 ? r.raw / max : 0; });
    return { rows, N0 };
  }

  SV.IEEG = { BANDS, DEF, parseTSV, parseIni, vhdrInfo, vmrkEvents, decodeBinary, bidsRawInfo, readEDF, openRecording, seizureMarks, unitFactor, parseContact, isSeegChannel, bipolarPairs, montage, derContacts, deriveSignal, matchElectrode, biquad, filterView, fftPlan, fft, decimate, energyRatio, erBatch, pageHinkley, phCurve, epileptogenicity, eiMax, EZT, eiZone };
});
