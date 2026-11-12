// node tools/tests/test_esi.mjs — v5.3 : imagerie de source (esi.js) : modèle sphérique multicouche (contre la forme close
// homogène et une référence Python validée), sLORETA et dipôle équivalent sur une simulation, détection et regroupement de
// pointes, FastICA, milieu infini (SEEG)
import fs from 'fs'; import vm from 'vm'; import assert from 'assert';
globalThis.window = globalThis; globalThis.SV = globalThis.SV || {};
vm.runInThisContext(fs.readFileSync('src/esi.js', 'utf8'));
const E = SV.ESI; let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const nrm = v => Math.hypot(...v), sub = (a, b) => a.map((x, i) => x - b[i]), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// 1. sphère homogène : série = forme close (Lütkenhöner 1992, FieldTrip eeg_leadfield1)
function closed(R, r, rad, cond) { const c0 = nrm(R), c1 = rad, c2 = 4 * Math.PI * c0 * c0 * cond, c3 = sub(r, R), c4 = nrm(c3), c5 = c1 * c1 * c0 * c0 - dot(r, R) ** 2, c6 = sub(r.map(x => x * c0 * c0), R.map(x => x * dot(r, R))), a = dot(R, sub(r.map(x => x / c1), c3.map(x => x / c4))) / c5 + 2 / c4 ** 3, b = (c1 * c1 - c0 * c0) / c4 ** 3 - 1 / c1; return [0, 1, 2].map(i => (a * c6[i] + b * R[i]) / c2); }
{ const M = E.sphereModel({ c: [0, 0, 0], rBrain: 90, rSkull: 90, rScalp: 90, sig: [0.33, 0.33, 0.33], N: 200 }); let err = 0;
  for (const R of [[10, 20, 50], [-30, 40, 20], [5, -60, 30]]) for (const d of [[1, 0, 0], [0.3, 0.8, 0.5], [-0.2, -0.4, 0.9]]) { const e = d.map(x => x / nrm(d)), r = e.map(x => x * 90), g = E.sphereGain(M, e, R, [0, 0, 0]), c = closed(R, r, 90, 0.33); err = Math.max(err, nrm(sub(g, c)) / nrm(c)); }
  ok(err < 1e-6, 'sphère homogène : série = forme close (écart ' + err.toExponential(1) + ')'); }
// 2. trois couches : référence (Python, coefficients vérifiés contre Cuffin & Cohen 1979)
{ const R = JSON.parse(fs.readFileSync('tools/tests/esi_ref3.json', 'utf8')), M = E.sphereModel({ c: [0, 0, 0], rBrain: R.radii[0], rSkull: R.radii[1], rScalp: R.radii[2], sig: R.sig, N: 120 }); let err = 0;
  R.pts.forEach((p, i) => R.elc.forEach((e, j) => { const u = e.map(x => x / nrm(e)), g = E.sphereGain(M, u, p, [0, 0, 0]), ref = R.V[i][j]; err = Math.max(err, nrm(sub(g, ref)) / nrm(ref)); }));
  ok(err < 1e-6, '3 couches : référence Python (écart ' + err.toExponential(1) + ')'); }
// 3. simulation scalp : 21 électrodes 10-20 sur la tête MNI, sphère ajustée, sources sur une grille cérébrale
const names = 'Fp1 Fp2 F7 F3 Fz F4 F8 T7 C3 Cz C4 T8 P7 P3 Pz P4 P8 O1 O2 F9 F10'.split(' '), P = names.map(k => E.STD[k]);
ok(E.stdName('EEG FP1-REF') === 'Fp1' && E.stdName('T3') === 'T3' && E.stdName('ECG') === null && E.isScalp(names), 'noms 10-20 reconnus');
const sp = E.fitSphere(P.filter(p => p[2] > -20)); ok(sp.r > 80 && sp.r < 110, 'sphère de tête ajustée (' + sp.r.toFixed(0) + ' mm)');
const M3 = E.sphereModel({ c: sp.c, rBrain: sp.r * 0.85, rSkull: sp.r * 0.92, rScalp: sp.r }), m = P.length;
const Ed = new Float32Array(m * 3); P.forEach((p, i) => { const d = sub(p, sp.c), r = nrm(d); Ed.set(d.map(x => x / r), 3 * i); });
const S = []; for (let x = -60; x <= 60; x += 7) for (let y = -60; y <= 60; y += 7) for (let z = -40; z <= 60; z += 7) if (Math.hypot(x, y, z * 1.2) < sp.r * 0.8) S.push(x, y, z);
const Sf = Float32Array.from(S), ns = Sf.length / 3, L = E.avgRefCols(E.sphereLeadfield(M3, Ed, Sf), m, 3 * ns);
const truth = [-45, 20, 25], q = [0.2, 0.3, 0.93], gainAt = p => { const g = new Float64Array(m * 3), o = [0, 0, 0]; for (let i = 0; i < m; i++) { E.sphereGain(M3, [Ed[3 * i], Ed[3 * i + 1], Ed[3 * i + 2]], p, o); g[i * 3] = o[0]; g[i * 3 + 1] = o[1]; g[i * 3 + 2] = o[2]; } for (let k = 0; k < 3; k++) { let s = 0; for (let i = 0; i < m; i++) s += g[i * 3 + k]; s /= m; for (let i = 0; i < m; i++) g[i * 3 + k] -= s; } return g; };
const G = gainAt(truth); let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
const v0 = Float64Array.from({ length: m }, (_, i) => G[i * 3] * q[0] + G[i * 3 + 1] * q[1] + G[i * 3 + 2] * q[2]), amp = Math.max(...v0.map(Math.abs));
const v = E.avgRefVec(Array.from(v0, x => x + 0.05 * amp * rnd()));
const O = E.sloretaOperator(L, m, ns, 0.05), pw = E.sloretaPower(O, v); let jb = 0; for (let j = 1; j < ns; j++) if (pw[j] > pw[jb]) jb = j;
const errS = nrm(sub([Sf[3 * jb], Sf[3 * jb + 1], Sf[3 * jb + 2]], truth)); ok(errS < 15, 'sLORETA : maximum à ' + errS.toFixed(1) + ' mm de la source (grille 7 mm, bruit 5 %)');
const D = E.fitDipole({ gainAt, v, L, n: ns, S: Sf, inside: p => nrm(p) < M3.rBrain * 0.98 }), errD = nrm(sub(D.p, truth));
ok(errD < 4 && D.gof > 0.95, `dipôle : ${errD.toFixed(1)} mm, GOF ${(D.gof * 100).toFixed(0)} %, IC95 ${D.ci.r.map(x => x.toFixed(1)).join('/')} mm`);
ok(D.ci.r[0] > 0 && D.ci.r[0] < 40, 'ellipsoïde de confiance fini');
// covariance : rythme critique simulé (même source) → même maximum
{ const T = 512, X = Array.from({ length: m }, (_, i) => new Float32Array(T)); for (let t = 0; t < T; t++) { const s = Math.sin(2 * Math.PI * 6 * t / 256); for (let i = 0; i < m; i++) X[i][t] = v0[i] * s + 0.05 * amp * rnd(); }
  const C = E.covariance(E.avgRefData(X)), pc = E.sloretaPowerCov(O, C); let jc = 0; for (let j = 1; j < ns; j++) if (pc[j] > pc[jc]) jc = j; ok(nrm(sub([Sf[3 * jc], Sf[3 * jc + 1], Sf[3 * jc + 2]], truth)) < 15, 'sLORETA de covariance (rythme) au même endroit');
  const f = E.dominantFreq(X, 256, 1.5, 20).f; ok(Math.abs(f - 6) < 0.3, 'fréquence dominante 6 Hz (' + f.toFixed(2) + ')'); }
// 3 bis. v5.4 : blanchiment par la covariance du bruit de fond et formeur de voie LCMV (fond corrélé entre électrodes)
{ const T = 3000, Mx = Array.from({ length: m }, () => Float64Array.from({ length: m }, () => rnd())), noise = () => { const z = Float64Array.from({ length: m }, () => rnd()); return Float64Array.from({ length: m }, (_, i) => { let s0 = 0; for (let k = 0; k < m; k++) s0 += Mx[i][k] * z[k]; return s0 * 0.25 * amp; }); };
  const Nn = Array.from({ length: m }, () => new Float32Array(T)), Xd = Array.from({ length: m }, () => new Float32Array(T)); for (let t = 0; t < T; t++) { const a = noise(), b = noise(), sgl = Math.sin(2 * Math.PI * t / 41) * (1 + 0.5 * rnd()); for (let i = 0; i < m; i++) { Nn[i][t] = a[i]; Xd[i][t] = b[i] + v0[i] * sgl; } }
  const Cn = E.covariance(E.avgRefData(Nn)), W0 = E.whitener(Cn, m, 0), I = E.whitenC(W0, Cn); let dev = 0; for (let a = 0; a < W0.r; a++) for (let b = 0; b < W0.r; b++) dev = Math.max(dev, Math.abs(I[a * W0.r + b] - (a === b ? 1 : 0)));
  ok(W0.r === m - 1 && dev < 1e-6, `blanchiment : W C Wᵀ = I sur ${W0.r} axes (référence moyenne), écart ${dev.toExponential(1)}`);
  const Wt = E.whitener(Cn, m, 0.1), Lw = E.whitenL(Wt, L, 3 * ns), Ow = E.sloretaOperator(Lw, Wt.r, ns, 1 / 9), vn = Float64Array.from(v0, (x, i) => x + noise()[i]), pw2 = E.sloretaPower(Ow, E.whitenV(Wt, E.avgRefVec(vn)));
  let j2 = 0; for (let j = 1; j < ns; j++) if (pw2[j] > pw2[j2]) j2 = j; const e2 = nrm(sub([Sf[3 * j2], Sf[3 * j2 + 1], Sf[3 * j2 + 2]], truth));
  const Cd = E.whitenC(Wt, E.covariance(E.avgRefData(Xd))), lp = E.lcmvPower(Lw, Wt.r, ns, Cd, null, 0.05); let j3 = 0; for (let j = 1; j < ns; j++) if (lp[j] > lp[j3]) j3 = j; const e3 = nrm(sub([Sf[3 * j3], Sf[3 * j3 + 1], Sf[3 * j3 + 2]], truth));
  ok(e2 < 15 && e3 < 15, `sLORETA blanchi ${e2.toFixed(1)} mm, LCMV ${e3.toFixed(1)} mm de la source (bruit corrélé)`);
  const tm = [100, 900, 1700], cc = E.cleanCov(Nn, tm, 256, 0.5, 120); ok(cc.sec > 8.2 && cc.sec < 9.4 && Math.abs(cc.C[0] / E.covariance(Nn)[0] - 1) < 0.25, `covariance hors pointes : ${cc.sec.toFixed(1)} s retenues`); }
// 4. pointes simulées dans un fond 1/f : détection, regroupement par topographie, moyenne et mi-montée
{ const fs = 256, T = fs * 120, X = Array.from({ length: m }, () => new Float32Array(T)); let b = Array(m).fill(0);
  for (let t = 0; t < T; t++) for (let i = 0; i < m; i++) { b[i] = 0.97 * b[i] + rnd() * 12; X[i][t] = b[i]; }
  const shape = k => { const tt = k / fs; return -Math.exp(-((tt / 0.018) ** 2)) + 0.35 * Math.exp(-(((tt - 0.09) / 0.06) ** 2)); };   // pointe négative puis onde lente
  const topoB = v0.map(x => x / amp), topoC = Array.from({ length: m }, (_, i) => i === 15 || i === 16 || i === 13 ? 1 : i === 11 ? 0.5 : 0);   // 2 générateurs
  const tA = [], tB = []; for (let k = 0; k < 40; k++) { const t0 = Math.round((2 + k * 2.7) * fs); (k % 3 === 2 ? tB : tA).push(t0); }
  for (const [ts, tp] of [[tA, topoB], [tB, topoC]]) for (const t0 of ts) for (let k = -40; k < 60; k++) { const s = shape(k) * 140; for (let i = 0; i < m; i++) X[i][t0 + k] += tp[i] * s; }
  const Y = E.avgRefData(X.map(x => E.bandpass(x, fs, 1, 35))), ev = E.detectSpikes(Y, fs, { k: 4.5 });
  const hit = ts => ts.filter(t => ev.some(e => Math.abs(e.t - t) < 0.05 * fs)).length;
  ok(hit(tA) >= 0.85 * tA.length && hit(tB) >= 0.8 * tB.length, `détection : ${hit(tA)}/${tA.length} et ${hit(tB)}/${tB.length} pointes`);
  ok(ev.length <= 1.3 * (tA.length + tB.length), `peu de fausses détections (${ev.length} évènements)`);
  const cl = E.clusterTopos(ev.map(e => E.topoAt(Y, e.t)), 0.8, 3); ok(cl.length >= 2 && cl[0].idx.length >= 0.7 * tA.length, `regroupement : ${cl.map(c => c.idx.length).join(', ')}`);
  const A = E.averageEpochs(Y, cl[0].idx.map(i => ev[i].t), Math.round(0.3 * fs), Math.round(0.3 * fs)), tm = E.spikeTimes(A.avg, fs, Math.round(0.3 * fs));
  ok(tm.half < tm.peak && tm.onset <= tm.half && (tm.peak - tm.half) / fs < 0.04, `mi-montée ${(1000 * (tm.half - tm.peak) / fs).toFixed(0)} ms avant le pic`);
  ok(Math.abs(E.corr(E.topoAt(A.avg, tm.peak), cl[0].topo)) > 0.9, 'topographie moyenne = celle du groupe');
  const pc = E.pca(A.avg, tm.onset, tm.peak + 10); ok(pc.explained[0] > 0.8, `ACP : 1er axe ${(pc.explained[0] * 100).toFixed(0)} %`); }
// 5. FastICA : deux sources mélangées
{ const T = 4000, s1 = Float32Array.from({ length: T }, (_, t) => Math.sin(t / 7)), s2 = Float32Array.from({ length: T }, (_, t) => ((t / 23) % 2 < 1 ? 1 : -1)), X = [0, 1, 2, 3].map(i => Float32Array.from({ length: T }, (_, t) => [0.8, 0.3, -0.5, 0.2][i] * s1[t] + [0.2, 0.9, 0.4, -0.7][i] * s2[t] + 0.01 * rnd()));
  const F = E.fastica(X, 2), c1 = Math.max(...F.S.map(s => Math.abs(E.corr(s, s1)))), c2 = Math.max(...F.S.map(s => Math.abs(E.corr(s, s2)))); ok(c1 > 0.95 && c2 > 0.95, `FastICA : sources retrouvées (r ${c1.toFixed(3)}, ${c2.toFixed(3)})`); }
// 6. SEEG, milieu infini : triangulation d'une source non échantillonnée par des plots à distance
{ const C = []; for (const [x0, y0, z0, dx, dy, dz] of [[-60, 10, 0, 1, 0, 0], [-60, -15, 10, 1, 0.1, 0], [-55, 30, -10, 1, -0.1, 0.1], [-60, 0, 30, 1, 0, -0.2]]) for (let k = 0; k < 12; k++) C.push([x0 + dx * 3.5 * k, y0 + dy * 3.5 * k, z0 + dz * 3.5 * k]);
  const mC = C.length, Cf = Float32Array.from(C.flat()), src = [-30, 5, 12], q2 = [0, 0, 1];
  const gA = p => { const g = new Float64Array(mC * 3), o = [0, 0, 0]; for (let i = 0; i < mC; i++) { E.infiniteGain(C[i], p, 0.33, o); g.set(o, 3 * i); } for (let k = 0; k < 3; k++) { let s = 0; for (let i = 0; i < mC; i++) s += g[i * 3 + k]; s /= mC; for (let i = 0; i < mC; i++) g[i * 3 + k] -= s; } return g; };
  const g0 = gA(src), vv = Float64Array.from({ length: mC }, (_, i) => g0[i * 3 + 2]), am = Math.max(...vv.map(Math.abs)), vn = E.avgRefVec(Array.from(vv, x => x + 0.03 * am * rnd()));
  const Sg = []; for (let x = -55; x <= 0; x += 5) for (let y = -25; y <= 35; y += 5) for (let z = -15; z <= 35; z += 5) Sg.push(x, y, z); const Sgf = Float32Array.from(Sg), ng = Sgf.length / 3;
  const L2 = E.avgRefCols(E.infiniteLeadfield(Cf, Sgf, 0.33), mC, 3 * ng), D2 = E.fitDipole({ gainAt: gA, v: vn, L: L2, n: ng, S: Sgf, inside: p => C.every(c => nrm(sub(c, p)) > 3) });
  const near = Math.min(...C.map(c => nrm(sub(c, src)))); ok(nrm(sub(D2.p, src)) < 5, `SEEG : source à ${near.toFixed(0)} mm du plot le plus proche retrouvée à ${nrm(sub(D2.p, src)).toFixed(1)} mm (GOF ${(D2.gof * 100).toFixed(0)} %)`); }
console.log(`test_esi : ${n} vérifications ok`);
