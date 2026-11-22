// node tools/tests/test_v51.mjs — v5.1 : arbre généalogique (graphe), âge des premières crises, volume VEP du gabarit en
// volume NIfTI (même étiquette que Volume.labelAt en tout point)
import fs from 'fs'; import vm from 'vm'; import assert from 'assert';
globalThis.window = globalThis; globalThis.SV = globalThis.SV || {};
for (const f of ['src/core.js', 'src/store.js', 'src/pedigree.js']) vm.runInThisContext(fs.readFileSync(f, 'utf8'));
const S = SV.Store, Pd = SV.Pedigree;
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };

// ---------------------------------------------------------------- âge des premières crises
ok(S.onsetText({ onsetAge: 3, onsetAgeUnit: 'm' }) === '3 mois', 'mois');
ok(S.onsetText({ onsetAge: 12, onsetAgeUnit: 'd' }) === '12 jours', 'jours');
ok(S.onsetText({ onsetAge: 1, onsetAgeUnit: 'y' }) === '1 an', 'singulier');
ok(Math.abs(S.onsetYears({ onsetAge: 6, onsetAgeUnit: 'm' }) - 0.5) < 0.01, 'années depuis mois');
ok(S.onsetYears({ onsetAge: 4 }) === 4, 'unité par défaut : ans');

// ---------------------------------------------------------------- arbre (v3, dessin libre) : deux parents au plus, générations voisines, parents unis
// (v1.0.1 : réécrit pour l'éditeur v3 — l'ancienne API addParents / addPartner / addChild n'existe plus)
const P = { sex: 'M' }, ped = Pd.migrate(null), me = ped.persons.find(p => p.proband);
ok(!!me, 'cas index créé');
const fa = Pd.Ed.person(ped, { sex: 'M', gen: me.gen - 1, x: me.x - 60 }), mo = Pd.Ed.person(ped, { sex: 'F', gen: me.gen - 1, x: me.x + 60 });
ok(Pd.Ed.addFiliation(ped, fa.id, me.id).ok && Pd.Ed.addFiliation(ped, mo.id, me.id).ok, 'un père et une mère');
ok(Pd.Ed.addFiliation(ped, fa.id, me.id).ok && Pd.parentsOf(ped, me.id).length === 2, 'pas de doublon');
const x3 = Pd.Ed.person(ped, { sex: 'M', gen: me.gen - 1, x: me.x + 180 }); ok(!!Pd.Ed.addFiliation(ped, x3.id, me.id).err, 'pas de troisième parent');
ok(!!Pd.findLink(ped, 'union', fa.id, mo.id), 'les deux parents d’un enfant sont unis');
ok(!!Pd.Ed.addFiliation(ped, me.id, fa.id).err, 'un parent est dans la rangée au-dessus');
const sib = Pd.Ed.person(ped, { sex: 'F', gen: me.gen, x: me.x + 120 }); Pd.Ed.addFiliation(ped, mo.id, sib.id);
ok(Pd.siblingsOf(ped, me.id).includes(sib.id), 'demi-sœur par la mère');
const lay = Pd.layout(ped, P); ok(lay && lay.nodes && lay.nodes.length >= ped.persons.length - 1, 'disposition de tous les individus');
ok(/<svg/.test(Pd.svg(ped, P)), 'SVG');

// ---------------------------------------------------------------- volume VEP du gabarit (slice_space.tplVepVol) : même étiquette
// que Volume.labelAt pour un point du monde
const vj = JSON.parse(fs.readFileSync('assets/vep_volume.json', 'utf8'));
const b64 = (s, T) => { const u = Uint8Array.from(Buffer.from(s, 'base64')); return new T(u.buffer, u.byteOffset, u.byteLength / T.BYTES_PER_ELEMENT); };
const dims = vj.dims, off = vj.offset_vox, s = +vj.voxel_mm || 2, rv = b64(vj.rle_values, Uint8Array), rn = b64(vj.rle_lengths, Uint16Array);
const data = new Uint8Array(dims[0] * dims[1] * dims[2]); let p = 0; for (let i = 0; i < rv.length; i++) { data.fill(rv[i], p, p + rn[i]); p += rn[i]; }
const labelAt = (x, y, z) => { const i = Math.round((128 - x) / s) - off[0], j = Math.round((128 - z) / s) - off[1], k = Math.round((y + 128) / s) - off[2]; if (i < 0 || j < 0 || k < 0 || i >= dims[0] || j >= dims[1] || k >= dims[2]) return 0; return data[(i * dims[1] + j) * dims[2] + k]; };
// affine de tplVepVol : x = 128 − s(c + o0), y = s(a + o2) − 128, z = 128 − s(b + o1) ; index NIfTI a + b·d2 + c·d2·d1
const nd = [dims[2], dims[1], dims[0]], vox = (x, y, z) => [Math.round((y + 128) / s - off[2]), Math.round((128 - z) / s - off[1]), Math.round((128 - x) / s - off[0])];
let same = 0, tot = 0;
for (let t = 0; t < 4000; t++) { const x = -70 + Math.random() * 140, y = -100 + Math.random() * 170, z = -50 + Math.random() * 120; const [a, b, c] = vox(x, y, z); if (a < 0 || b < 0 || c < 0 || a >= nd[0] || b >= nd[1] || c >= nd[2]) continue; tot++; if (data[a + nd[0] * (b + nd[1] * c)] === labelAt(x, y, z)) same++; }
ok(tot > 1000 && same === tot, `volume VEP du gabarit en NIfTI : ${same}/${tot} étiquettes identiques`);

console.log(`test_v51 : ${n} vérifications ok`);
