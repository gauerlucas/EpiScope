// node tools/tests/test_bem.mjs — v5.4 : modèle de tête BEM à 3 couches (esi_bem.js) contre la solution exacte des sphères
// concentriques (esi.js, série de Legendre déjà validée), approche du problème isolé, localisation d'un dipôle, surfaces
// construites à partir de rayons mesurés (tête sphérique synthétique), paramètres selon l'âge
import fs from 'fs'; import vm from 'vm'; import assert from 'assert';
globalThis.window = globalThis; globalThis.SV = globalThis.SV || {};
vm.runInThisContext(fs.readFileSync('src/esi.js', 'utf8')); vm.runInThisContext(fs.readFileSync('src/esi_bem.js', 'utf8'));
const E = SV.ESI, B = SV.BEM, nrm = v => Math.hypot(...v); let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('ok', m); };

// 1. sphère géodésique : 10ν² + 2 sommets, triangles orientés vers l'extérieur
{ const G = B.geoSphere(8); let out = 0; for (let f = 0; f < G.ntri; f++) { const [a, b, c] = [0, 1, 2].map(k => [0, 1, 2].map(q => G.rr[3 * G.tris[3 * f + k] + q])), u = b.map((x, i) => x - a[i]), v = c.map((x, i) => x - a[i]), w = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; if (w[0] * a[0] + w[1] * a[1] + w[2] * a[2] > 0) out++; }
  ok(G.np === 642 && G.ntri === 1280 && out === G.ntri, 'sphère géodésique ν = 8 : 642 sommets, 1280 triangles orientés'); }

// électrodes de test (60 points de la moitié supérieure) et comparaison BEM / série exacte
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const ELC = R => { const P = []; seed = 7; while (P.length < 60) { const u = [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1], r = nrm(u); if (r > 1 || r < 0.1 || u[2] / r < -0.2) continue; P.push(u.map(x => x / r * R)); } return P; };
const AR = a => { const m = a.reduce((s, x) => s + x, 0) / a.length; return a.map(x => x - m); };
function compare(radii, sig, depthR) {
  const G = B.geoSphere(8), surfs = radii.slice().reverse().map(r => B.radialSurface(G, [0, 0, 0], new Float64Array(G.np).fill(r)));
  const S = B.solve(surfs, sig.slice().reverse()), Rout = radii[radii.length - 1], P = ELC(Rout), Tr = B.elecTransfer(S, P), V = B.allVerts(S);
  const M = E.sphereModel({ c: [0, 0, 0], rBrain: radii[0], rSkull: radii[1] || radii[0], rScalp: Rout, sig: sig.length === 3 ? sig : [sig[0], sig[0], sig[0]], N: 200 });
  return depthR.map(rr => { let rdm = 0, mag = 0, k = 0;
    for (const dir of [[0.3, 0.2, 0.93], [0.8, -0.1, 0.59], [-0.5, 0.6, 0.62]]) { const u = dir.map(x => x / nrm(dir)), p = u.map(x => x * rr), g = B.gainAt(Tr, V, S.n, p);
      for (const q of [u, [u[1], -u[0], 0].map((x, _, a) => x / nrm(a))]) { const va = [], vb = []; P.forEach((e, i) => { const ga = E.sphereGain(M, e.map(x => x / Rout), p, [0, 0, 0]); va.push(ga[0] * q[0] + ga[1] * q[1] + ga[2] * q[2]); vb.push(g[3 * i] * q[0] + g[3 * i + 1] * q[1] + g[3 * i + 2] * q[2]); });
        const A = AR(va), Bv = AR(vb), na = nrm(A), nb = nrm(Bv); rdm += nrm(A.map((x, i) => x / na - Bv[i] / nb)); mag += nb / na; k++; } }
    return { rdm: rdm / k, mag: mag / k }; });
}
// 2. sphère homogène
{ const [a, b] = compare([90], [0.33], [20, 50]); ok(a.rdm < 0.005 && b.rdm < 0.015 && Math.abs(b.mag - 1) < 0.02, `sphère homogène : RDM ${(a.rdm * 100).toFixed(2)} % / ${(b.rdm * 100).toFixed(2)} %, MAG ${b.mag.toFixed(3)}`); }
// 3. trois couches, os au 1/50 (approche du problème isolé)
{ const R = compare([80, 86.5, 92], [0.33, 0.33 / 50, 0.33], [20, 50, 70]);
  ok(R[0].rdm < 0.015 && R[1].rdm < 0.035 && R[2].rdm < 0.07 && R.every(x => x.mag > 0.85 && x.mag < 1.05), `3 couches 1/50 : RDM ${R.map(x => (x.rdm * 100).toFixed(1) + ' %').join(' / ')} (60, 30, 10 mm du crâne interne)`); }
// 4. nouveau-né : os mince (1,5 mm) et conducteur (1/4)
{ const R = compare([51, 52.5, 55], [0.33, 0.33 / 4, 0.33], [21, 41]); ok(R.every(x => x.rdm < 0.04), `nouveau-né (os 1,5 mm, 1/4) : RDM ${R.map(x => (x.rdm * 100).toFixed(1) + ' %').join(' / ')}`); }
// 5. localisation : données exactes (sphère), dipôle ajusté avec le gain BEM
{ const radii = [80, 86.5, 92], sig = [0.33, 0.33 / 50, 0.33], G = B.geoSphere(8), S = B.solve([92, 86.5, 80].map(r => B.radialSurface(G, [0, 0, 0], new Float64Array(G.np).fill(r))), sig.slice().reverse());
  const names = 'Fp1 Fp2 F7 F3 Fz F4 F8 T7 C3 Cz C4 T8 P7 P3 Pz P4 P8 O1 O2 F9 F10 T9 T10 P9 P10'.split(' '), c0 = [0, -18, 10], P = names.map(k => { const u = E.STD[k].map((x, i) => x - c0[i]), r = nrm(u); return u.map(x => x / r * 92); });
  const Tr = B.elecTransfer(S, P), V = B.allVerts(S), M = E.sphereModel({ c: [0, 0, 0], rBrain: 80, rSkull: 86.5, rScalp: 92, sig, N: 200 }), m = P.length;
  const gB = p => { const g = B.gainAt(Tr, V, S.n, p); for (let q = 0; q < 3; q++) { let a = 0; for (let i = 0; i < m; i++) a += g[3 * i + q]; a /= m; for (let i = 0; i < m; i++) g[3 * i + q] -= a; } return g; };
  const err = [10, 30].map(dd => { let e = 0, k = 0; for (const dir of [[0.6, 0.3, 0.74], [-0.9, -0.1, 0.42], [0.1, 0.8, 0.59], [0.95, 0.1, -0.1]]) { const u = dir.map(x => x / nrm(dir)), p = u.map(x => x * (80 - dd));
    for (const q of [u, [u[1], -u[0], 0].map((x, _, a) => x / nrm(a))]) { const v = E.avgRefVec(P.map(el => { const g = E.sphereGain(M, el.map(x => x / 92), p, [0, 0, 0]); return g[0] * q[0] + g[1] * q[1] + g[2] * q[2]; })); const D = E.fitDipole({ gainAt: gB, v, p0: p.map(x => x + 4), inside: x => nrm(x) < 79.5, step: 5 }); e += nrm(D.p.map((x, i) => x - p[i])); k++; } } return e / k; });
  ok(err[0] < 4.5 && err[1] < 3.5, `dipôle ajusté avec le BEM sur des données exactes : erreur ${err.map(x => x.toFixed(1)).join(' / ')} mm (10 et 30 mm sous le crâne interne)`);
  // transfert recalculé pour des électrodes déplacées = mêmes lignes
  const T2 = B.elecTransfer(S, [P[5], P[2]]); let d = 0; for (let j = 0; j < S.n; j++) d = Math.max(d, Math.abs(T2.T[j] - Tr.T[5 * S.n + j]), Math.abs(T2.T[S.n + j] - Tr.T[2 * S.n + j]));
  ok(d < 1e-12, 'transfert vers des électrodes déplacées : recalcul par le facteur LU (identique)'); }
// 6. surfaces à partir de rayons mesurés : tête sphérique (cerveau 70, scalp 90 mm), coupe à z = −40
{ const P = B.ageParams(null), H = B.headSurfaces({ c: [0, 0, 0], zCut: -40, P, brainAt: p => nrm(p) < 70, scalpAt: p => nrm(p) < 90 });
  const up = [...Array(H.G.np).keys()].filter(i => H.G.rr[3 * i + 2] > 0.3), mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  const nest = [...Array(H.G.np).keys()].every(i => H.r.is[i] + 0.9 < H.r.os[i] && H.r.os[i] + 0.9 < H.r.sc[i]);
  const flat = [...Array(H.G.np).keys()].filter(i => H.G.rr[3 * i + 2] < -0.9).every(i => H.surfs[0].rr[3 * i + 2] > -75);
  ok(Math.abs(mean(up.map(i => H.r.is[i])) - 72.5) < 1.2 && Math.abs(mean(up.map(i => H.r.sc[i])) - 90) < 1.5 && Math.abs(H.stats.skull - P.skull) < 0.6 && nest && flat, `surfaces : crâne interne ${mean(up.map(i => H.r.is[i])).toFixed(1)} mm, scalp ${mean(up.map(i => H.r.sc[i])).toFixed(1)} mm, os ${H.stats.skull.toFixed(1)} mm, emboîtées, cou plan`);
  const E2 = B.onSurface(H.surfs[0], [0, 0, 0], [[10, 20, 60], [-50, 0, 10]]); ok(E2.every(p => Math.abs(nrm(p) - 90) < 1.5), 'électrodes posées sur le scalp dans leur direction'); }
// 7. paramètres selon l'âge
{ const a = [0, 1, 5, 30].map(x => B.ageParams(x)); ok(a[0].bscr === 4 && Math.abs(a[1].bscr - 11) < 1e-9 && a[3].bscr === 50 && a.every((x, i) => !i || (x.skull > a[i - 1].skull && x.bscr > a[i - 1].bscr)), `âge : rapport cerveau/os ${a.map(x => Math.round(x.bscr)).join(' → ')}, os ${a.map(x => x.skull.toFixed(1)).join(' → ')} mm (0, 1, 5 ans, adulte)`); }
console.log(`test_bem : ${n} vérifications OK`);
