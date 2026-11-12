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

// ---------------------------------------------------------------- arbre : au plus un père et une mère, deux conjoints, demi-fratrie
const P = { sex: 'M' }, ped = Pd.migrate(null), me = ped.persons.find(p => p.proband);
ok(!!me, 'cas index créé');
const [fa, mo] = Pd.Ed.addParents(ped, me), n0 = ped.persons.length, [fa2, mo2] = Pd.Ed.addParents(ped, me);
ok(fa === fa2 && mo === mo2 && ped.persons.length === n0, 'un père et une mère, pas de doublon');
const sp1 = Pd.Ed.addPartner(ped, me), sp2 = Pd.Ed.addPartner(ped, me), sp3 = Pd.Ed.addPartner(ped, me);
ok(sp1 && sp2 && !sp3, 'au plus deux conjoints');
const c1 = Pd.Ed.addChild(ped, me, sp1.id), c2 = Pd.Ed.addChild(ped, me, sp2.id);
ok(c1 && c2 && Pd.partnersOf(ped, me.id).length === 2, 'enfants de deux unions');
const hs = Pd.Ed.addHalfSibling(ped, me, 'mother'); ok(hs && hs.motherId === mo.id && hs.fatherId !== fa.id, 'demi-frère par la mère');
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
