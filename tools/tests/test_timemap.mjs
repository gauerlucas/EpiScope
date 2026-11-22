// node tools/tests/test_timemap.mjs — v1.0.1 : heure réelle d'un tracé EDF+D (coupures, recouvrements, minuit) et lecture
// d'un EDF+D synthétique (tools/tests/make_synth_edfd.py, aucune donnée de patient)
import fs from 'fs'; import vm from 'vm'; import os from 'os'; import path from 'path'; import assert from 'assert'; import { execSync } from 'child_process';
globalThis.window = globalThis; globalThis.SV = globalThis.SV || {};
for (const f of ['src/core.js', 'src/esi.js', 'src/ieeg.js']) vm.runInThisContext(fs.readFileSync(f, 'utf8'), { filename: f });
const IE = SV.IEEG;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'episcope-edfd-')), file = path.join(tmp, 'nuit.edf');
execSync(`python3 tools/tests/make_synth_edfd.py ${file}`, { stdio: 'ignore' });
const r = IE.readEDF(new Uint8Array(fs.readFileSync(file)));
assert.equal(r.kind, 'edf+'); assert.equal(r.fs, 256); assert.equal(r.segments.length, 3, 'trois blocs (recouvrement, coupure)');
const M = IE.timeMap(Object.assign({}, r, { duration: r.nSamples / r.fs }));
assert.ok(M.hasClock); assert.equal(IE.hms(M.abs(0)), '23:30:00');
assert.deepEqual(M.gaps.map(g => [g.t, Math.round(g.dur)]), [[301, -1], [601, 900]], 'recouvrement d’1 s puis coupure de 15 min');
assert.equal(Math.round(M.span), 2100, 'étendue réelle 35 min');
// les crises annotées du fichier tombent à l'heure réelle
const on = r.events.filter(e => e.label === 'Crise').map(e => e.onset);
assert.deepEqual(on, [421, 751], 'temps du tracé (blocs bout à bout)');
assert.equal(IE.hms(M.abs(421)), '23:37:00', '420 s réelles après le début'); assert.equal(IE.hms(M.abs(751)), '23:57:30', '1 650 s réelles (après la coupure)');
// passage de minuit
assert.equal(IE.dmy(M.abs(1200)), '03/06/2021'); assert.equal(IE.hms(M.abs(1200)), '00:04:59');
// inverse : dans un bloc / dans la coupure
assert.equal(M.tOf(1650), 751); assert.equal(M.tOf(1000), null);
// tracé sans heure de début : temps du tracé seulement
const M2 = IE.timeMap({ fs: 256, duration: 60 }); assert.ok(!M2.hasClock); assert.equal(M2.real(12.5), 12.5); assert.equal(M2.abs(3), null);
assert.equal(IE.niceStep(2100, 1200), 300); assert.equal(IE.niceStep(30, 1200), 5);
fs.rmSync(tmp, { recursive: true, force: true });
console.log('OK heure réelle des tracés (EDF+D synthétique : 3 blocs, coupure de 15 min, minuit)');
