// node tools/tests/test_methods_golden.mjs [--update] — v1.1.0 : tests « dorés » des méthodes de quantification.
//   Chaque méthode est calculée sur une crise synthétique fixe (synth_seeg.mjs, graine fixe, aucune donnée de patient) ;
//   la sortie est comparée à la référence tools/tests/fixtures/methods_golden.json, enregistrée avec la version de la
//   méthode (src/provenance.js, SV.Prov.METHODS). Règle : une sortie qui change sans montée de version échoue. Après une
//   modification voulue d'une méthode : monter sa version dans provenance.js, ajouter une ligne « Méthodes » au CHANGELOG,
//   puis `node tools/tests/test_methods_golden.mjs --update`.
import fs from 'fs'; import vm from 'vm'; import path from 'path'; import assert from 'assert';
import { synthSeizure } from './synth_seeg.mjs';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
globalThis.window = globalThis; globalThis.SV = {};
for (const f of ['src/stats.js', 'src/provenance.js', 'src/ieeg.js', 'src/ieeg_methods.js']) vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
const IE = SV.IEEG, IM = SV.IEEGM, PV = SV.Prov, REF = path.join(ROOT, 'tools/tests/fixtures/methods_golden.json'), TOL = 5e-4;
const r4 = v => v == null || !isFinite(v) ? null : Math.round(v * 1e4) / 1e4;

// entrée commune : crise synthétique, montage cascade
const rec = synthSeizure({ dur: 120 }), D = IE.montage(rec.names.map(n => ({ name: n, type: 'SEEG' })), 'bipolar'), sig = D.map(d => IE.deriveSignal(rec.data, d, 0, rec.nSamples));
const names = D.map(d => d.name), out = {};
{ // EI
  const B = IE.erBatch(sig, rec.fs, { line: 50 }), R = IE.epileptogenicity(B.ers, { t0: B.t0, dt: B.dt, start: 20, end: 100, szEnd: 100, nu: 0.5, lambda: 8, tau: 1, H: 5 });
  out.ei = { N0: r4(R.N0), values: R.rows.map(r => r4(r.ei)) };
}
{ // cEI (8 voies : début, propagation, non atteinte)
  const pick = ['B’1-B’2', 'B’2-B’3', 'A’1-A’2', 'TB’1-TB’2', 'TP’1-TP’2', 'CE’1-CE’2', 'OR’1-OR’2', 'A1-A2'].map(n => names.indexOf(n)).filter(i => i >= 0);
  const s = pick.map(i => sig[i].subarray(Math.round(55 * rec.fs), Math.round(80 * rec.fs))), C = IM.cei(s, rec.fs, pick.map(i => out.ei.values[i]));
  out.cei = { values: Array.from(C.cei, r4), out: Array.from(C.out, r4) };
}
{ // PEI
  const rp = synthSeizure({ dur: 200, end: 110, couple: 0.6 }), Dp = IE.montage(rp.names.map(n => ({ name: n, type: 'SEEG' })), 'bipolar'), sp = Dp.map(d => IE.deriveSignal(rp.data, d, 0, rp.nSamples));
  const PB = IM.peBatch(sp, rp.fs), PR = IM.pei(PB.pes, PB.t0, PB.dt, 60, 110);
  out.pei = { values: PR.rows.map(r => r4(r.pei)) };
}
{ // h² (force des nœuds)
  const s = ['B’1-B’2', 'TP’1-TP’2', 'OR’1-OR’2', 'A1-A2'].map(n => sig[names.indexOf(n)].subarray(Math.round(55 * rec.fs), Math.round(85 * rec.fs)));
  const R2 = IM.h2Run(s, rec.fs, { band: [1, 45], win: 3, step: 1, lag: 0.1 }), Sg = IM.h2Strength(R2.H, R2.L, 4, R2.nWin);
  out.h2 = { values: Array.from(Sg.strength, r4) };
}

// comparaison à la référence
const update = process.argv.includes('--update'), ref = fs.existsSync(REF) ? JSON.parse(fs.readFileSync(REF, 'utf8')) : {}, fails = [], next = {};
const flat = o => Object.entries(o).flatMap(([k, v]) => Array.isArray(v) ? v.map((x, i) => [k + '[' + i + ']', x]) : [[k, v]]);
for (const [m, o] of Object.entries(out)) {
  const v = PV.versionOf(m); next[m] = { version: v, output: o };
  const g = ref[m]; if (!g) { if (!update) fails.push(`${m} : pas de référence (lancer avec --update)`); continue; }
  const A = new Map(flat(g.output)), B = flat(o); let worst = null, nd = 0;
  for (const [k, x] of B) { const y = A.get(k); const d = x == null || y == null ? (x === y ? 0 : Infinity) : Math.abs(x - y); if (d > TOL) { nd++; if (!worst || d > worst[1]) worst = [k, d, y, x]; } }
  if (B.length !== A.size) { nd++; worst = worst || ['longueur', Infinity, A.size, B.length]; }
  if (nd && g.version === v) fails.push(`${m} ${v} : sortie changée sans montée de version (${nd} valeur(s), ex. ${worst[0]} ${worst[2]} → ${worst[3]}) — monter la version dans src/provenance.js, CHANGELOG « Méthodes », puis --update`);
  else if (nd) { if (!update) fails.push(`${m} : version ${g.version} → ${v}, sortie changée — confirmer avec --update`); }
  else if (g.version !== v && !update) fails.push(`${m} : version ${g.version} → ${v} sans changement de sortie — confirmer avec --update`);
  console.log(`${m.padEnd(4)} ${v}  ${nd ? nd + ' écart(s)' : 'identique'} (${B.length} valeurs)`);
}
if (update) { fs.mkdirSync(path.dirname(REF), { recursive: true }); fs.writeFileSync(REF, JSON.stringify(next, null, 1) + '\n'); console.log('référence écrite :', path.relative(ROOT, REF)); }
if (fails.length && !update) { for (const f of fails) console.error('ÉCHEC ' + f); process.exit(1); }
console.log('OK méthodes (sorties conformes aux références et aux versions)');
