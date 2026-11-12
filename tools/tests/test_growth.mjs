// node tools/tests/test_growth.mjs — normes de croissance (v4.19, src/growth.js) contre les valeurs de référence du paquet
// R growthstandards (tests/testthat : test_who.R, test_igbirth.R ; tables de l'OMS et d'INTERGROWTH-21st).
import fs from 'fs'; import vm from 'vm'; import path from 'path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
globalThis.window = globalThis;
for (const f of ['src/core.js', 'src/stats.js', 'src/growth_data.js', 'src/growth.js']) vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
const G = SV.Growth; let nOk = 0, nFail = 0; const ok = (c, m) => { console.log((c ? '  ok    ' : '  ÉCHEC  ') + m); c ? nOk++ : nFail++; };
const r1 = v => Math.round(v * 10) / 10;
// OMS taille pour l'âge (filles, garçons) : 50e, 1er, 99e centiles à 0, 7, 14, 21, 28, 974, 1461 jours
const days = [0, 7, 14, 21, 28, 974, 1461];
const W = { F: { 50: [49.1, 50.3, 51.5, 52.5, 53.4, 92.2, 102.7], 1: [44.8, 45.9, 47.1, 48.0, 48.9, 83.8, 92.7], 99: [53.5, 54.7, 55.9, 56.9, 57.9, 100.6, 112.8] }, M: { 50: [49.9, 51.1, 52.3, 53.4, 54.4, 93.4, 103.3], 1: [45.5, 46.7, 47.9, 48.9, 49.9, 85.2, 93.6], 99: [54.3, 55.5, 56.8, 57.9, 58.9, 101.5, 113.1] } };
for (const sx of ['F', 'M']) for (const p of [50, 1, 99]) { const got = days.map(d => r1(G.whoValue('ht', sx, d, G.probit(p / 100)))), want = W[sx][p], bad = got.filter((v, i) => Math.abs(v - want[i]) > 0.15); ok(!bad.length, `OMS taille ${sx} P${p} : ${got.join(' / ')} (attendu ${want.join(' / ')})`); }
const zb = G.whoZ('ht', 'F', 974, G.whoValue('ht', 'F', 974, -3)); ok(Math.abs(zb + 3) < 1e-6, 'OMS : z → valeur → z (−3)');
const zw = G.whoZ('wt', 'M', 365, 4); ok(zw < -4 && zw > -8, `OMS poids : extrapolation au-delà de −3 DS (4 kg à 1 an : z ${zw.toFixed(2)})`);
// INTERGROWTH-21st nouveau-né : P3, P50, P97 à 33+1 (232 j) et 42+6 (300 j)
const IG = `lencm,Male,232,39.89,43.98,48.11|lencm,Male,300,48.49,51.44,54.42|lencm,Female,232,39.98,43.57,47.01|lencm,Female,300,47.59,50.58,53.45|wtkg,Male,232,1.22,1.99,2.86|wtkg,Male,300,2.96,3.71,4.54|wtkg,Female,232,1.24,1.90,2.66|wtkg,Female,300,2.80,3.53,4.37|hcircm,Male,232,28.35,30.97,33.69|hcircm,Male,300,33.33,35.38,37.51|hcircm,Female,232,28.03,30.55,33.22|hcircm,Female,300,32.67,34.60,36.63`;
const V = { lencm: 'len', wtkg: 'wt', hcircm: 'hc' };
for (const row of IG.split('|')) { const [v, s, ga, p3, p50, p97] = row.split(','), sx = s === 'Male' ? 'M' : 'F', got = [0.03, 0.5, 0.97].map(p => G.igValue(V[v], sx, +ga, p)), want = [+p3, +p50, +p97], e = Math.max(...got.map((x, i) => Math.abs(x - want[i]))), back = G.igP(V[v], sx, +ga, +p50);
  ok(e < 0.02 && Math.abs(back - 0.5) < 0.015, `INTERGROWTH ${v} ${s} ${ga} j : P3/P50/P97 ${got.map(x => x.toFixed(2)).join(' / ')} (attendu ${want.join(' / ')}), centile de la médiane ${(100 * back).toFixed(1)}`); }
// très grands prématurés : ±2 DS à 24, 28, 32 SA (garçons, filles)
const E = [['len', 'M', 168, 27.02, 37.41], ['len', 'F', 196, 31.67, 42.07], ['wt', 'M', 168, 0.43, 0.94], ['wt', 'F', 224, 1.12, 2.42], ['hc', 'M', 217, 25.43, 31.67], ['hc', 'F', 182, 20.75, 26.99]];
for (const [v, sx, ga, m2, p2] of E) { const a = G.igValue(v, sx, ga, G.normCdf(-2)), b = G.igValue(v, sx, ga, G.normCdf(2)); ok(Math.abs(a - m2) < 0.02 && Math.abs(b - p2) < 0.02, `INTERGROWTH très prématurés ${v} ${sx} ${ga} j : −2 / +2 DS ${a.toFixed(2)} / ${b.toFixed(2)} (attendu ${m2} / ${p2})`); }
// acquisitions : jugement, âge de développement, âge corrigé
const ms = k => G.MILESTONES.find(m => m.k === k);
ok(G.judge(ms('walk'), { months: 13 }).cls === 'ok' && G.judge(ms('walk'), { months: 19 }).cls === 'late' && G.judge(ms('walk'), { no: true }, 20).cls === 'late' && G.judge(ms('walk'), { no: true }, 11).cls === 'na', 'marche seule : 13 mois dans la fenêtre OMS, 19 mois tardif, non acquise à 20 mois = retard, à 11 mois = pas encore');
const da = G.devAges({ sit: { months: 6 }, walk: { months: 14 }, babble: { months: 10 } }); ok(da.gross === 12 && da.lang === 9 && da.fine == null, `âge de développement : motricité ${da.gross} mois, langage ${da.lang} mois`);
const P = { birthDate: '2025-01-01' }, c = G.correctedDays(P, { weeks: 32, days: 0 }, '2025-07-01'), a = G.ageDays(P, '2025-07-01');
ok(Math.abs(a - c - 56) < 1e-6, `âge corrigé d'un prématuré de 32 SA : ${G.fmtAge(a)} → ${G.fmtAge(c)}`);
const svg = G.whoChart('wt', 'F', [{ d: 200, y: 7 }, { d: 400, y: 9 }]) + G.igChart('wt', 'M', 266, 3.1) + G.milestoneChart({ walk: { months: 13 } }, 15);
ok(/<svg/.test(svg) && !/NaN/.test(svg), 'courbes OMS, INTERGROWTH et frise des acquisitions sans valeur manquante');
console.log(`\n${nOk} ok, ${nFail} échec(s)`); process.exit(nFail ? 1 : 0);
