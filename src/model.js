/* EpiScope — model.js : moteur d'inférence séquentielle
 *
 * Idée (Bancaud–Talairach–Chauvel–Bartolomei) : la sémiologie est l'expression, instant par instant,
 * de la décharge dans un réseau. Chaque signe désigne une ou plusieurs zones symptomatogènes ; la
 * succession des signes dessine la trajectoire de la décharge ; les régions reliées (voisinage,
 * distance, liens fonctionnels/structurels, connectome du patient) aux régions actives deviennent
 * plausibles ; enfin, la région d'origine est celle qui explique le mieux TOUTE la séquence, y
 * compris lorsqu'elle est cliniquement silencieuse.
 *
 * Sorties : A[t][r] (plausibilité d'activation de la région r au temps t), E (évidence directe),
 * relais (chemins entre zones symptomatogènes successives), candidats d'origine avec explications.
 */
(function (SV) {
  'use strict';

  const DEFAULT_PARAMS = {
    step: 0.5, pad_before: 4, pad_after: 8,
    s2b_weight: 0.35,          // poids de l'évidence Semio2Brain (noisy-OR avec les priors curés)
    prop_gain: 0.6,            // gain de propagation par saut de connectivité
    persist: 0.92,             // persistance par pas de temps d'une région activée
    dist_lambda: 25,           // mm, décroissance exponentielle de la connectivité par distance
    w_adj: 0.55, w_dist: 0.45, w_edges: 1.0, homotopic: 0.3,
    patient_alpha: 0.5, fc_alpha: 0.3,
    onset_tau: 20,             // s, les signes précoces pèsent plus pour l'origine
    relay_gain: 0.7, max_relay_hops: 4,
    contra_leak: 0.15, dominant_leak: 0.25, unknown_side: 0.65, bilateral_side: 0.8,
    hop2: 0.8, hop3: 0.5,
    early_s: 10, late_s: 20,        // phases : précoce ≤ 10 s (ou 2 premiers signes), tardif ≥ 20 s (ou rang ≥ 3)
    latency_tau: 12,                // s : latence clinique (EEG → 1er signe) au-delà de laquelle l'origine est probablement silencieuse
    homotopic_delay: 8,             // s : la propagation controlatérale n'est pas prise en compte avant ce délai
    hyp_link: 0.45, hyp_max: 4, hyp_members: 8, hyp_min_score: 0.35,
  };

  function sideFactor(rule, side, hemi, dominant, p) {
    if (!rule || rule === 'none') return 1;
    if (rule === 'dominant') return hemi === dominant ? 1 : p.dominant_leak;
    if (rule === 'nondominant') return hemi !== dominant ? 1 : p.dominant_leak;
    if (side === 'L' || side === 'R') {
      const target = rule === 'contra' ? (side === 'L' ? 'R' : 'L') : side;
      return hemi === target ? 1 : p.contra_leak;
    }
    return side === 'B' ? p.bilateral_side : p.unknown_side;
  }

  /** fenêtre temporelle d'un événement : rampe gaussienne avant (incertitude dt), plateau, queue après */
  function window_(ev, t) {
    const s = Math.max(ev.dt || 0, 0.5), t0 = ev.t, t1 = ev.t + Math.max(ev.dur || 0, 0.5);
    if (t >= t0 && t <= t1) return 1;
    if (t < t0) { const z = (t0 - t) / s; return Math.exp(-0.5 * z * z); }
    const z = (t - t1) / Math.max(s, 1.5); return Math.exp(-0.5 * z * z);
  }

  /** Dijkstra sur coût -log(C), renvoie {path:[...], strength} ou null */
  function bestPath(C, N, a, b, maxHops) {
    const cost = new Float64Array(N).fill(Infinity), prev = new Int16Array(N).fill(-1), hops = new Int16Array(N);
    const done = new Uint8Array(N); cost[a] = 0;
    for (let iter = 0; iter < N; iter++) {
      let u = -1, best = Infinity;
      for (let i = 1; i < N; i++) if (!done[i] && cost[i] < best) { best = cost[i]; u = i; }
      if (u < 0 || u === b) break;
      done[u] = 1; if (hops[u] >= maxHops) continue;
      for (let v = 1; v < N; v++) {
        const c = C[u * N + v]; if (c <= 0.02 || done[v]) continue;
        const nc = cost[u] - Math.log(c);
        if (nc < cost[v]) { cost[v] = nc; prev[v] = u; hops[v] = hops[u] + 1; }
      }
    }
    if (!isFinite(cost[b])) return null;
    const path = []; for (let v = b; v >= 0; v = prev[v]) { path.unshift(v); if (v === a) break; }
    return { path, strength: Math.exp(-cost[b]) };
  }

  function compute(input) {
    const { events: rawEvents, patient, db, atlas } = input;
    const p = Object.assign({}, DEFAULT_PARAMS, input.params || {});
    const N = atlas.N, dominant = patient.dominant || 'L';
    const C = atlas.buildConnectivity(p);
    const events = rawEvents.filter(e => db.signById.has(e.sign_id)).slice().sort((a, b) => a.t - b.t);

    // ---------- 1. évidence directe par événement (avec phase précoce / intermédiaire / tardive)
    const ictalRaw = events.filter(ev => db.signById.get(ev.sign_id).category !== 'postictal');
    const tFirstRaw = ictalRaw.length ? ictalRaw[0].t : 0;
    const spread = (fw, sign, ev) => {
      const e = new Float32Array(N); let max = 0;
      for (const [fam, w] of fw) for (const h of ['L', 'R']) {
        const i = atlas.idx(fam, h); if (!i) continue;
        const v = w * sideFactor(sign.laterality_rule, ev.side, h, dominant, p) * (ev.conf == null ? 1 : ev.conf);
        if (v > e[i]) e[i] = v; if (v > max) max = v;
      }
      return { e, max };
    };
    const evInfo = events.map(ev => {
      const sign = db.signById.get(ev.sign_id), ictal = sign.category !== 'postictal';
      const rank = ictalRaw.indexOf(ev), rel = ev.t - tFirstRaw;
      const phase = !ictal ? 'late' : (rank >= 0 && rank <= 1) || rel <= p.early_s ? 'early' : (rel >= p.late_s || rank >= 3) ? 'late' : 'mid';
      const act = spread(db.familyWeights(ev.sign_id, ev.topography, p.s2b_weight, { phase }), sign, ev);
      const ons = spread(db.familyWeights(ev.sign_id, ev.topography, p.s2b_weight, { phase, forOnset: true }), sign, ev);
      const top = []; for (let i = 1; i < N; i++) if (act.e[i] > 0) top.push(i);
      top.sort((a, b) => act.e[b] - act.e[a]);
      return { ev, sign, e: act.e, max: act.max, eo: ons.e, maxo: ons.max, top: top.slice(0, 8), ictal, phase, rel };
    });

    // ---------- 1b. latéralisation globale : votes des signes latéralisants (y compris post-critiques)
    let vL = 0, vR = 0; const latVotes = [];
    for (const info of evInfo) {
      const rule = info.sign.laterality_rule, side = info.ev.side, conf = info.ev.conf == null ? 1 : info.ev.conf;
      let h = null;
      if (rule === 'contra' && (side === 'L' || side === 'R')) h = side === 'L' ? 'R' : 'L';
      else if (rule === 'ipsi' && (side === 'L' || side === 'R')) h = side;
      else if (rule === 'dominant') h = dominant;
      else if (rule === 'nondominant') h = dominant === 'L' ? 'R' : 'L';
      info.hemiVote = h;
      if (!h) continue;
      let lv = info.sign.lateralizing_value == null ? 0.7 : info.sign.lateralizing_value;
      if (info.sign.id === 'head_version' && info.phase === 'late') lv = Math.max(lv, 0.95); // version tardive avant GTC
      if (info.sign.id === 'head_turn_nonforced' && info.phase !== 'early') lv *= 0.5;       // la rotation non forcée n'est ipsilatérale que précoce
      const w = conf * lv;
      if (h === 'L') vL += w; else vR += w;
      latVotes.push({ event: info.ev, sign: info.sign, hemi: h, w, lv });
    }
    const pL = (vL + 0.5) / (vL + vR + 1), pFav = Math.max(pL, 1 - pL);
    const latMod = h => { const ph = h === 'L' ? pL : 1 - pL; return 0.4 + 0.6 * (ph / pFav); };
    // les signes non latéralisants sont modulés par la latéralisation globale
    for (const info of evInfo) {
      if (info.hemiVote) continue;
      for (let i = 1; i < N; i++) { const m = latMod(atlas.hemiOf[i]); if (info.e[i] > 0) info.e[i] *= m; if (info.eo[i] > 0) info.eo[i] *= m; }
      info.max = 0; info.maxo = 0; for (let i = 1; i < N; i++) { if (info.e[i] > info.max) info.max = info.e[i]; if (info.eo[i] > info.maxo) info.maxo = info.eo[i]; }
      info.top.sort((a, b) => info.e[b] - info.e[a]);
    }
    const lateralization = { pL, votesL: vL, votesR: vR, votes: latVotes };

    // ---------- 2. grille temporelle
    let tmin = 0, tmax = 20;
    if (events.length) { tmin = Math.min(...events.map(e => e.t)) - p.pad_before; tmax = Math.max(...events.map(e => e.t + Math.max(e.dur || 0, 1))) + p.pad_after; }
    if (patient.eeg_onset != null) tmin = Math.min(tmin, patient.eeg_onset - 2);
    if (patient.seizure_end != null) tmax = Math.max(tmax, patient.seizure_end + 5);
    const T = Math.max(2, Math.ceil((tmax - tmin) / p.step) + 1);
    const times = new Float32Array(T); for (let k = 0; k < T; k++) times[k] = tmin + k * p.step;
    const E = new Float32Array(T * N), R = new Float32Array(T * N), A = new Float32Array(T * N);
    for (let k = 0; k < T; k++) {
      const t = times[k];
      for (const info of evInfo) {
        const g = window_(info.ev, t); if (g < 0.02) continue;
        const base = k * N, e = info.e;
        for (let i = 1; i < N; i++) { const v = e[i] * g; if (v > E[base + i]) E[base + i] = v; }
      }
    }

    // ---------- 3. relais entre zones symptomatogènes successives
    const relays = [];
    for (let k = 0; k + 1 < evInfo.length; k++) {
      const a = evInfo[k], b = evInfo[k + 1];
      if (!a.top.length || !b.top.length || !a.ictal || !b.ictal) continue;
      let best = null;
      for (const ra of a.top.slice(0, 2)) for (const rb of b.top.slice(0, 2)) {
        if (ra === rb) { best = { path: [ra], strength: 1, ra, rb }; break; }
        const bp = bestPath(C, N, ra, rb, p.max_relay_hops);
        if (bp && (!best || bp.strength * a.e[ra] * b.e[rb] > best.strength * a.e[best.ra] * b.e[best.rb])) best = Object.assign(bp, { ra, rb });
      }
      if (!best || best.path.length <= 2) continue;
      const inner = best.path.slice(1, -1), t0 = a.ev.t, t1 = Math.max(b.ev.t, t0 + 0.5);
      const amp = p.relay_gain * Math.pow(best.strength, 1 / (best.path.length - 1)) * Math.min(a.e[best.ra], b.e[best.rb]);
      inner.forEach((r, m) => {
        const tr = t0 + (t1 - t0) * (m + 1) / (inner.length + 1);
        relays.push({ region: r, t: tr, from: best.ra, to: best.rb, eventFrom: k, eventTo: k + 1, amp, path: best.path });
        for (let kk = 0; kk < T; kk++) {
          const g = window_({ t: tr, dt: 1, dur: Math.max(t1 - tr, 1) }, times[kk]) * amp;
          if (g > R[kk * N + r]) R[kk * N + r] = g;
        }
      });
    }

    // ---------- 4. récursion : évidence directe, relais, persistance, propagation sur le graphe
    // (le lien homotopique n'agit qu'après homotopic_delay : la propagation controlatérale est tardive)
    const tFirst0 = evInfo.filter(i => i.ictal).length ? evInfo.filter(i => i.ictal)[0].ev.t : 0;
    for (let k = 0; k < T; k++) {
      const base = k * N, prev = (k - 1) * N, allowHom = times[k] >= tFirst0 + p.homotopic_delay;
      for (let i = 1; i < N; i++) {
        let v = Math.max(E[base + i], R[base + i]);
        if (k > 0) {
          v = Math.max(v, p.persist * A[prev + i]);
          let pm = 0; const row = i * N, hom = atlas.homotopic[i];
          for (let j = 1; j < N; j++) { const c = C[row + j]; if (c > 0.03 && (allowHom || j !== hom)) { const x = c * A[prev + j]; if (x > pm) pm = x; } }
          v = Math.max(v, p.prop_gain * pm);
        }
        A[base + i] = v;
      }
    }

    // ---------- 5. candidats d'origine : qui explique le mieux toute la séquence ?
    // reach(o,r) = max(direct, 2 sauts, 3 sauts) avec atténuation
    const reach = new Float32Array(N * N);
    for (let o = 1; o < N; o++) {
      const row = o * N; reach[row + o] = 1;
      for (let r = 1; r < N; r++) if (r !== o) reach[row + r] = C[row + r];
    }
    const reach2 = new Float32Array(N * N);
    for (let o = 1; o < N; o++) for (let m = 1; m < N; m++) {
      const com = C[o * N + m]; if (com < 0.1) continue;
      for (let r = 1; r < N; r++) { const v = com * C[m * N + r] * p.hop2; if (v > reach2[o * N + r]) reach2[o * N + r] = v; }
    }
    for (let i = 0; i < N * N; i++) if (reach2[i] > reach[i]) reach[i] = reach2[i];
    // 3 sauts (approximation : reach2 ∘ C)
    for (let o = 1; o < N; o++) for (let m = 1; m < N; m++) {
      const r2 = reach2[o * N + m]; if (r2 < 0.1) continue;
      for (let r = 1; r < N; r++) { const v = r2 * C[m * N + r] * p.hop3 / p.hop2; if (v > reach[o * N + r]) reach[o * N + r] = v; }
    }
    evInfo.forEach(i => { i.noSZ = !db.hasSymptomatogenic(i.sign.id); });   // ex. généralisation : rôle propagation seulement
    const ictalEvents = evInfo.filter(i => i.ictal && i.maxo > 0 && !i.noSZ);
    const tFirst = ictalEvents.length ? ictalEvents[0].ev.t : 0;
    const lesion = new Set((patient.lesion || []).map(Number));
    // latence clinique : si l'EEG précède nettement le premier signe, l'origine est probablement silencieuse,
    // donc à un ou deux sauts de la première zone symptomatogène (Bancaud & Talairach ; Bae et al., J Clin Neurol 2026 : 13 s du début SEEG au premier signe quand la propagation est rapide, 29 s quand elle est lente)
    const latency = patient.eeg_onset != null ? Math.max(0, tFirst - patient.eeg_onset) : null;
    const selfW = latency == null ? 1 : Math.max(0.25, Math.exp(-latency / p.latency_tau)), hopBoost = latency == null ? 1 : 1 + 0.6 * (1 - selfW);

    // ---- distances de graphe (plus courts chemins sur −log C) : servent à l'ORDRE des signes et aux trajectoires
    const INF = 1e9, D = new Float64Array(N * N).fill(INF), NXT = new Int16Array(N * N).fill(-1);
    for (let i = 1; i < N; i++) { D[i * N + i] = 0; for (let j = 1; j < N; j++) if (i !== j && C[i * N + j] > 0.03) { D[i * N + j] = -Math.log(C[i * N + j]); NXT[i * N + j] = j; } }
    for (let k = 1; k < N; k++) { const rk = k * N; for (let i = 1; i < N; i++) { const dik = D[i * N + k]; if (dik >= INF) continue; const ri = i * N; for (let j = 1; j < N; j++) { const v = dik + D[rk + j]; if (v < D[ri + j]) { D[ri + j] = v; NXT[ri + j] = NXT[ri + k]; } } } }
    const pathBetween = (a, b) => { if (a === b) return [a]; if (D[a * N + b] >= INF) return null; const path = [a]; let u = a, guard = 0; while (u !== b && guard++ < 40) { u = NXT[u * N + b]; if (u < 0) return null; path.push(u); } return path; };

    // ---- candidats d'origine. Trois termes : (1) atteindre la zone du PREMIER signe (latence clinique comprise),
    // (2) expliquer l'ensemble des signes par la connectivité (association pondérée par la précocité),
    // (3) CONCORDANCE D'ORDRE : vu depuis l'origine, les zones symptomatogènes doivent être de plus en plus
    // éloignées à mesure que les signes apparaissent (tau de Kendall pondéré par l'écart de temps rapporté à
    // l'incertitude saisie). C'est ce terme qui fait que A→B→C et C→B→A n'ont pas les mêmes origines.
    const sumW = ictalEvents.reduce((a, info, k) => a + Math.exp(-(info.ev.t - tFirst) / p.onset_tau) * (k === 0 ? 1.5 : 1) * (info.ev.conf == null ? 1 : info.ev.conf), 0) || 1;
    const tops = ictalEvents.map(info => { const t = []; for (let i = 1; i < N; i++) if (info.eo[i] > 0.05 * info.maxo) t.push(i); return t; });
    const candidates = [];
    for (let o = 1; o < N; o++) {
      let assoc = 0; const explain = [], dk = [];
      ictalEvents.forEach((info, k) => {
        const conf = info.ev.conf == null ? 1 : info.ev.conf, w = Math.exp(-(info.ev.t - tFirst) / p.onset_tau) * (k === 0 ? 1.5 : 1) * conf;
        let best = 0, br = 0, bexp = 0;
        for (const r of tops[k]) { const rc = r === o ? selfW : Math.min(1, reach[o * N + r] * hopBoost), eh = info.eo[r] / info.maxo, v = eh * rc; if (v > best) best = v; if (eh * eh * rc > bexp) { bexp = eh * eh * rc; br = r; } }
        assoc += w * best;
        explain.push({ event: info.ev, sign: info.sign, region: br, value: best, direct: br === o, via: (br && br !== o && C[o * N + br] < reach[o * N + br] - 1e-6) });
        dk.push({ t: info.ev.t, dt: info.ev.dt || 0, conf, region: br, d: br ? D[o * N + br] - Math.log(Math.max(1e-3, info.eo[br] / info.maxo)) : INF });
      });
      let num = 0, den = 0;
      for (let i = 0; i < dk.length; i++) for (let j = i + 1; j < dk.length; j++) {
        if (!dk[i].region || !dk[j].region || dk[i].region === dk[j].region) continue;
        const wt = Math.min(1, (dk[j].t - dk[i].t) / (dk[i].dt + dk[j].dt + 1)) * Math.min(dk[i].conf, dk[j].conf); if (wt <= 0) continue;
        const diff = dk[j].d - dk[i].d, sgn = diff > 0.15 ? 1 : diff < -0.15 ? -1 : 0;
        num += wt * sgn; den += wt;
      }
      const conc = (den * ((den > 0 ? num / den : 0) + 1) / 2 + 0.5 * 1) / (den + 1), first = explain.length ? explain[0].value : 0;   // Kendall pondéré, rétréci vers 0,5 (k = 1 paire)
      const score = atlas.ezPrior(o) * (lesion.has(o) ? 1.6 : 1) * (0.5 + (atlas.hemiOf[o] === 'L' ? pL : 1 - pL)) * (0.5 * first + 0.5 * assoc / sumW) * (0.4 + 0.6 * conc);
      candidates.push({ region: o, score, explain, conc, nPairs: den, first, assoc: assoc / sumW });
    }
    const maxScore = Math.max(1e-9, ...candidates.map(c => c.score));
    candidates.forEach(c => { c.score /= maxScore; });
    candidates.sort((a, b) => b.score - a.score);
    // région silencieuse : pas d'évidence directe notable
    const directPeak = new Float32Array(N);
    for (const info of evInfo) for (let i = 1; i < N; i++) if (info.e[i] > directPeak[i]) directPeak[i] = info.e[i];
    candidates.forEach(c => { c.silent = directPeak[c.region] < 0.2; c.directPeak = directPeak[c.region]; });
    const candByRegion = new Map(candidates.map(c => [c.region, c]));

    // ---------- 5b. hypothèses de réseau épileptogène = TRAJECTOIRES. Pour chaque origine retenue (une par
    // système et hémisphère, classées par score), le réseau est le chemin de connectivité qui part de l'origine
    // et rejoint, dans l'ordre d'apparition, la zone symptomatogène de chaque signe ; ses relais en font partie.
    // Le nom de l'hypothèse est la suite des systèmes traversés, avec l'étiquette classique quand elle existe.
    const hypotheses = [], used = new Set();
    for (const c of candidates) {
      if (c.score < p.hyp_min_score || hypotheses.length >= p.hyp_max) break;
      const key = (atlas.system(c.region) || '?') + '|' + atlas.hemiOf[c.region]; if (used.has(key)) continue; used.add(key);
      const o = c.region, traj = [{ region: o, t: latency != null ? tFirst - latency : tFirst - 3, signs: [], relay: false, origin: true }];
      c.explain.forEach(x => {
        if (!x.region) return;
        const last = traj[traj.length - 1];
        const seen = traj.find(n => n.region === x.region);
        if (seen) { seen.signs.push(x.sign); return; }
        const path = pathBetween(last.region, x.region) || [last.region, x.region];
        let inner = path.slice(1, -1); if (inner.length > 3) inner = [inner[0], inner[Math.floor(inner.length / 2)], inner[inner.length - 1]];
        const t0 = last.t, t1 = Math.max(x.event.t, t0 + 0.5);
        inner.forEach((r, m) => { if (!traj.find(n => n.region === r)) traj.push({ region: r, t: t0 + (t1 - t0) * (m + 1) / (inner.length + 1), signs: [], relay: true }); });
        traj.push({ region: x.region, t: x.event.t, signs: [x.sign], relay: false });
      });
      const systems = []; for (const n of traj) { const sys = atlas.system(n.region) || '?'; if (systems[systems.length - 1] !== sys) systems.push(sys); }
      const members = traj.map(n => Object.assign({}, candByRegion.get(n.region) || { region: n.region, score: 0, explain: [], silent: true }, { relay: n.relay, origin: !!n.origin, trajT: n.t, trajSigns: n.signs })).slice(0, p.hyp_members);
      const links = []; for (let i = 0; i + 1 < traj.length; i++) links.push({ from: traj[i].region, to: traj[i + 1].region, t0: traj[i].t, t1: Math.max(traj[i + 1].t, traj[i].t + 0.3), t: traj[i + 1].t, strength: 0.7 });
      const ex = new Map(); for (const x of c.explain) { const cur = ex.get(x.sign.id); if (!cur || x.value > cur.value) ex.set(x.sign.id, x); }
      hypotheses.push({
        index: hypotheses.length, origin: o, hemi: atlas.hemiOf[o], system: atlas.system(o) || '?', systems, score: c.score, silent: c.silent, conc: c.conc, nPairs: c.nPairs,
        trajectory: traj, members, links, name: canonicalName(systems),
        explained: [...ex.values()].filter(x => x.value >= 0.5).sort((a, b) => a.event.t - b.event.t),
        partial: [...ex.values()].filter(x => x.value >= 0.2 && x.value < 0.5).sort((a, b) => a.event.t - b.event.t),
        unexplained: ictalEvents.filter(i => !(ex.get(i.sign.id) && ex.get(i.sign.id).value >= 0.2)).map(i => i.sign),
      });
    }
    hypotheses.forEach(H => {
      H.linkToTop = H.index === 0 ? 1 : Math.max(0, ...H.members.map(m => Math.max(...hypotheses[0].members.map(n => C[m.region * N + n.region]))));
      const others = new Set(hypotheses.filter(o => o !== H).flatMap(o => o.members.map(m => m.region)));
      H.discriminant = H.members.filter(m => !others.has(m.region)).map(m => m.region);
    });

    // ---------- 6. résumé : pic, première activation, cibles
    const peak = new Float32Array(N), firstT = new Float32Array(N).fill(NaN);
    for (let k = 0; k < T; k++) for (let i = 1; i < N; i++) {
      const v = A[k * N + i]; if (v > peak[i]) peak[i] = v;
      if (isNaN(firstT[i]) && v >= 0.3) firstT[i] = times[k];
    }
    const targets = buildTargets({ candidates, evInfo, relays, atlas, peak, hypotheses });
    const network = drivingGraph(A, T, N, C, times, { maxEdges: 48 });

    return { times, T, N, A, E, R, C, evInfo, relays, candidates, hypotheses, peak, firstT, directPeak, targets, lateralization, latency, network, atlas, params: p, tmin, tmax };
  }

  const SYS_FR = { mesial_temporal: 'temporal mésial', lateral_temporal: 'temporal latéral', basal_temporal: 'temporal basal', insulo_opercular: 'insulo-operculaire', central: 'central (rolandique)', premotor: 'prémoteur / AMS', prefrontal_lateral: 'préfrontal latéral', prefrontal_mesial: 'préfrontal mésial / cingulaire antérieur', orbitofrontal: 'orbitofrontal', posterior_medial: 'pariétal médian / cingulaire postérieur', parietal_lateral: 'pariétal latéral', occipital: 'occipital', subcortical: 'sous-cortical' };
  const sysFr = k => SYS_FR[k] || (k || '').replace(/_/g, ' ');
  /** étiquette classique (littérature SEEG) déduite de la suite des systèmes traversés, origine en premier */
  function canonicalName(systems) {
    const o = systems[0], has = x => systems.indexOf(x) > 0, second = systems[1];
    if (o === 'mesial_temporal') {
      if (second === 'lateral_temporal') return 'temporal mésio-latéral';
      if (has('insulo_opercular')) return 'temporo-périsylvien (temporal plus)';
      if (has('orbitofrontal')) return 'temporo-orbitofrontal (temporal plus)';
      if (has('occipital') || has('basal_temporal')) return 'temporal mésial → basal / occipital';
      if (has('posterior_medial') || has('parietal_lateral')) return 'temporo-pariétal (temporal plus postérieur)';
      return 'temporal mésial';
    }
    if (o === 'lateral_temporal') return has('mesial_temporal') ? 'temporal néocortical → mésial' : has('parietal_lateral') ? 'temporo-pariétal latéral' : 'temporal néocortical (latéral)';
    if (o === 'basal_temporal') return has('mesial_temporal') ? 'temporal basal → mésial' : 'temporal basal';
    if (o === 'insulo_opercular') return has('mesial_temporal') ? 'insulo-operculaire → temporal' : has('central') ? 'insulo-operculaire → central (séquence insulaire)' : has('prefrontal_mesial') || has('orbitofrontal') ? 'insulo-operculaire → frontal ventral' : 'insulo-operculaire';
    if (o === 'orbitofrontal') return has('mesial_temporal') ? 'orbitofrontal → temporal (fronto-temporal)' : 'frontal ventromésial / orbitofrontal (Bonini G4)';
    if (o === 'prefrontal_mesial') return has('premotor') || has('central') ? 'cingulaire antérieur → AMS / central (Bonini G2)' : has('mesial_temporal') ? 'cingulaire → temporal' : 'préfrontal mésial / cingulaire antérieur';
    if (o === 'premotor') return has('central') ? 'prémoteur → central (Bonini G1)' : has('prefrontal_mesial') ? 'AMS / prémoteur → cingulaire' : 'prémoteur / AMS';
    if (o === 'prefrontal_lateral') return 'préfrontal dorsolatéral / antérieur (Bonini G3)';
    if (o === 'central') return has('premotor') ? 'central → prémoteur (Bonini G1)' : has('insulo_opercular') ? 'rolando-operculaire' : 'central (rolandique)';
    if (o === 'posterior_medial') return has('premotor') || has('central') ? 'précunéus / pariétal médian (silencieux) → AMS / central' : has('mesial_temporal') ? 'cingulaire postérieur → temporal' : 'pariétal médian';
    if (o === 'parietal_lateral') return has('mesial_temporal') ? 'pariétal → temporal' : has('central') ? 'pariétal → central' : 'pariétal latéral';
    if (o === 'occipital') return has('mesial_temporal') || has('basal_temporal') ? 'occipito-temporal' : has('parietal_lateral') || has('posterior_medial') ? 'occipito-pariétal' : 'occipital';
    return sysFr(o);
  }

  /** Graphe de mise en jeu : à chaque pas, l'augmentation de plausibilité d'une région j est attribuée aux
   *  régions i déjà actives et connectées (part ∝ C_ij·A_i). Les arêtes gardent leur force cumulée et l'instant
   *  où elles ont commencé à agir. Plusieurs sources peuvent entraîner la même cible : la mise en jeu est un
   *  phénomène de réseau (synchronisation / entraînement), pas un chemin unique. */
  function drivingGraph(A, T, N, C, times, opts) {
    opts = opts || {}; const maxEdges = opts.maxEdges || 48, minA = 0.06, minInc = 0.02;
    const S = new Float32Array(N * N), tOn = new Float32Array(N * N).fill(NaN), peakA = new Float32Array(N);
    const act = [];
    for (let k = 1; k < T; k++) {
      const base = k * N, prev = base - N;
      act.length = 0; for (let i = 1; i < N; i++) { if (A[prev + i] > peakA[i]) peakA[i] = A[prev + i]; if (A[prev + i] >= minA) act.push(i); }
      if (!act.length) continue;
      for (let j = 1; j < N; j++) {
        const inc = A[base + j] - A[prev + j]; if (inc < minInc) continue;
        let tot = 0; const rowj = j; const contrib = [];
        for (const i of act) { if (i === j) continue; const c = C[i * N + rowj]; if (c < 0.05) continue; const v = c * A[prev + i]; if (v > 0.01) { contrib.push([i, v]); tot += v; } }
        if (!tot) continue;
        for (const [i, v] of contrib) { const share = v / tot * inc; const e = i * N + j; S[e] += share; if (isNaN(tOn[e]) && share > 0.01) tOn[e] = times[k]; }
      }
    }
    for (let i = 1; i < N; i++) if (A[(T - 1) * N + i] > peakA[i]) peakA[i] = A[(T - 1) * N + i];
    const edges = [];
    for (let i = 1; i < N; i++) for (let j = 1; j < N; j++) { const e = i * N + j; if (S[e] > 0.03 && !isNaN(tOn[e])) edges.push({ from: i, to: j, strength: S[e], t0: tOn[e], t1: tOn[e] + 1.5, t: tOn[e] + 1.5, sync: C[e] }); }
    edges.sort((a, b) => b.strength - a.strength);
    // garder les plus fortes, mais au moins le meilleur entraîneur de chaque région notablement active
    const keep = new Set(edges.slice(0, maxEdges)), bestIn = new Map();
    for (const e of edges) { if (!bestIn.has(e.to) || e.strength > bestIn.get(e.to).strength) bestIn.set(e.to, e); }
    for (const [j, e] of bestIn) if (peakA[j] >= 0.3) keep.add(e);
    const out = [...keep].sort((a, b) => a.t0 - b.t0 || b.strength - a.strength);
    const maxS = out.length ? Math.max(...out.map(e => e.strength)) : 1; out.forEach(e => { e.strength = e.strength / maxS; });
    const nodes = []; for (let i = 1; i < N; i++) if (peakA[i] >= 0.3) nodes.push({ region: i, peak: peakA[i] });
    // liens de synchronisation possibles : paires de nœuds connectés (non orientés), affichés quand les deux sont actifs
    const sync = []; for (let a = 0; a < nodes.length; a++) for (let b = a + 1; b < nodes.length; b++) { const i = nodes[a].region, j = nodes[b].region, c = Math.max(C[i * N + j], C[j * N + i]); if (c >= 0.35) sync.push({ a: i, b: j, c }); }
    return { edges: out, nodes, sync };
  }

  /** Dynamique conditionnée à une hypothèse d'origine : l'origine est tenue active dès t_origin, puis la même
   *  récursion (évidence directe des signes, persistance, propagation sur le graphe) ; renvoie A_H (T×N) et son graphe. */
  function hypothesisDynamics(res, H) {
    if (H.A) return H;
    const { T, N, C, E, times, params: p, atlas } = res, A = new Float32Array(T * N), o = H.origin, t0 = H.trajectory[0].t;
    const tFirst0 = res.evInfo.filter(i => i.ictal).length ? res.evInfo.filter(i => i.ictal)[0].ev.t : 0;
    for (let k = 0; k < T; k++) {
      const base = k * N, prev = (k - 1) * N, allowHom = times[k] >= tFirst0 + p.homotopic_delay, seeded = times[k] >= t0 - 1e-6;
      for (let i = 1; i < N; i++) {
        let v = E[base + i];
        if (k > 0) {
          v = Math.max(v, p.persist * A[prev + i]);
          let pm = 0; const row = i * N, hom = atlas.homotopic[i];
          for (let j = 1; j < N; j++) { const c = C[row + j]; if (c > 0.03 && (allowHom || j !== hom)) { const x = c * A[prev + j]; if (x > pm) pm = x; } }
          v = Math.max(v, p.prop_gain * pm);
        }
        if (seeded && i === o) v = 1;
        A[base + i] = v;
      }
    }
    H.A = A; H.network = drivingGraph(A, T, N, C, times, { maxEdges: 40 }); return H;
  }

  function buildTargets({ candidates, evInfo, relays, atlas, peak, hypotheses }) {
    const out = new Map(); // region → {reasons:Set, score}
    const add = (r, reason, s) => { if (!r) return; if (!out.has(r)) out.set(r, { region: r, reasons: new Set(), score: 0 }); const o = out.get(r); o.reasons.add(reason); o.score = Math.max(o.score, s); };
    (hypotheses || []).forEach(H => H.members.slice(0, 6).forEach(m => add(m.region, `H${H.index + 1}` + (m.origin ? ' origine' : m.relay ? ' relais' : '') + (m.silent && m.origin ? ' (silencieuse)' : ''), m.score)));
    evInfo.filter(i => i.ictal && i.maxo > 0).slice(0, 3).forEach((info, k) => {
      const tops = []; for (let i = 1; i < info.eo.length; i++) if (info.eo[i] > 0) tops.push(i); tops.sort((a, b) => info.eo[b] - info.eo[a]);
      tops.slice(0, 2).forEach(r => add(r, 'zone symptomatogène précoce', info.eo[r] / info.maxo * (k === 0 ? 1 : 0.8)));
    });
    relays.filter(r => r.amp >= 0.25).forEach(r => add(r.region, 'relais entre signes', r.amp));
    return [...out.values()].sort((a, b) => b.score - a.score);
  }

  SV.Model = { compute, DEFAULT_PARAMS, sideFactor, bestPath, canonicalName, drivingGraph, hypothesisDynamics }; SV.SYS_FR = SYS_FR; SV.sysFr = sysFr;
})(window.SV = window.SV || {});
