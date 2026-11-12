// node tools/tests/test_v52.mjs — v5.2 : palettes des coupes de l'intervention (T1 pré-opératoire en rouge, IRM
// post-opératoire en gris à fond transparent) ; liens de parenté des remarques de l'arbre généalogique
import fs from 'fs'; import vm from 'vm'; import assert from 'assert';
globalThis.window = globalThis; globalThis.SV = globalThis.SV || {};
for (const f of ['src/core.js', 'src/store.js', 'src/pedigree.js', 'src/slices.js']) vm.runInThisContext(fs.readFileSync(f, 'utf8'));
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const Sl = SV.Slices, sh = Sl.shade;
ok(sh('grayt', 0.02, 0, null) === null, 'cavité (≈ 0) transparente');
ok(Math.abs(sh('grayt', 0.10, 0, null)[3] - 0.5) < 1e-6, 'transition progressive');
ok(sh('grayt', 0.6, 0, null)[3] === 1 && sh('grayt', 0.6, 0, null)[0] === sh('gray', 0.6, 0, null)[0], 'tissu : gris opaque');
const r = Sl.CMAPS.red(1), r0 = Sl.CMAPS.red(0); ok(r[0] > 250 && r[1] < 200 && r0[0] === 0, 'rampe rouge');
ok(Sl.CMAP_FR.red && Sl.CMAP_FR.grayt, 'palettes nommées');
// remarques de l'arbre : nommées par le lien au cas index
const Pd = SV.Pedigree, ped = Pd.migrate(null), me = ped.persons.find(p => p.proband), [fa, mo] = Pd.Ed.addParents(ped, me), [gf] = Pd.Ed.addParents(ped, mo);
ok(Pd.kinship(ped, fa) === 'père' && Pd.kinship(ped, mo) === 'mère', 'parents');
ok(/grand-père mat\./.test(Pd.kinship(ped, gf)), 'grand-père maternel');
console.log(`test_v52 : ${n} vérifications ok`);
