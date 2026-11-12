// node tools/tests/test_dicom.mjs [DOSSIER_DICOM] — depuis la racine du dépôt (dossier : tools/tests/make_synth_dicom.py)
// v4.21 : lecture d'un dossier DICOM (SV.Dicom) sans conversion externe — tri des séries, VR explicite et implicite,
//   affine LPS → RAS (comparée à la position et à l'orientation DICOM), rescale des HU, axes rendus canoniques, aller-retour
//   NIfTI ; catalogue d'électrodes (DIXI 3×5 / 3×6, Alcis C-35 / 3G / HD) : positions des plots d'après les vraies mesures ;
//   recalage : masque fixe donné sur une autre grille (cause de « fixedMask : undefined voxels ») rééchantillonné, ou ignoré.
import fs from 'fs'; import vm from 'vm'; import path from 'path'; import os from 'os'; import { execSync } from 'child_process';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
globalThis.window = globalThis; globalThis.SV = {};
for (const f of ['src/nifti.js', 'src/dicom.js', 'src/imaging/volops.js', 'src/imaging/coreg.js', 'src/electrodes.js']) if (fs.existsSync(path.join(ROOT, f))) vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
const D = SV.Dicom; let nOk = 0, nFail = 0; const ok = (c, msg) => { console.log((c ? '  ok    ' : '  ÉCHEC  ') + msg); c ? nOk++ : nFail++; };
const near = (a, b, t) => Math.abs(a - b) <= t;
let dir = process.argv[2];
if (!dir) { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dcm-')); execSync(`python3 ${path.join(ROOT, 'tools/tests/make_synth_dicom.py')} ${dir}`, { stdio: 'inherit' }); }

// --- dossier entier (sous-dossiers, fichiers sans extension, un .txt à ignorer)
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const files = walk(dir), parsed = [];
let skipped = 0;
for (const f of files) { const u8 = new Uint8Array(fs.readFileSync(f)); if (!D.isDicom(u8)) { skipped++; continue; } parsed.push({ name: path.basename(f), relPath: path.relative(dir, f), P: D.parse(u8) }); }
ok(skipped === 1 && parsed.length === files.length - 1, `dossier : ${files.length} fichiers, ${parsed.length} DICOM reconnus (préambule DICM), ${skipped} ignoré`);
const S = D.series(parsed);
ok(S.length === 3, `${S.length} séries triées (T1 3D, repérage, CT)`);
const t1 = S.find(s => /MPRAGE/.test(s.desc)), loc = S.find(s => /rep/.test(s.desc)), ct = S.find(s => s.modality === 'CT');
ok(t1 && t1.sub[0].n === 40 && loc && loc.sub[0].n === 3 && ct && ct.sub[0].n === 30, `coupes par série : T1 ${t1 && t1.sub[0].n}, repérage ${loc && loc.sub[0].n}, CT ${ct && ct.sub[0].n}`);
ok(t1.P0.explicit && !ct.P0.explicit && !ct.compressed, `VR explicite (T1) et implicite (CT) lues, non compressées`);
const g1 = D.guess(t1), g2 = D.guess(ct), g3 = D.guess(loc);
ok(g1.modality === 'T1' && g1.date === '2021-05-12' && g1.timepoint === 'preop' && g2.modality === 'CT' && g2.timepoint === 'postimplant' && g2.date === '2021-09-15', `modalités devinées : ${g1.modality} (${g1.date}), ${g2.modality} (${g2.date}), repérage → ${g3.modality}`);
ok(near(t1.sub[0].spacing, 2, 1e-6) && near(ct.sub[0].spacing, 1, 1e-6) && !t1.sub[0].warnings.length, `espacement entre coupes : T1 ${t1.sub[0].spacing} mm, CT ${ct.sub[0].spacing} mm, sans avertissement`);

// --- volume T1 oblique : l'affine envoie chaque voxel exactement sur la position DICOM (LPS → RAS)
const V1 = D.volume(t1, null, false);   // sans pixels : affine brute (avant retournement des axes)
const M4 = SV.Mat4 || null;
const app = (A, x, y, z) => [A[0] * x + A[1] * y + A[2] * z + A[3], A[4] * x + A[5] * y + A[6] * z + A[7], A[8] * x + A[9] * y + A[10] * z + A[11]];
{
  const sl = t1.sub[0].slices, k = 17, s = sl[k], p = s.ipp, iop = s.iop;   // voxel (5, 9) de la coupe k : position DICOM = ipp + 5·di·row + 9·dj·col
  const lps = [0, 1, 2].map(r => p[r] + 5 * s.ps[1] * iop[r] + 9 * s.ps[0] * iop[3 + r]), ras = [-lps[0], -lps[1], lps[2]], got = app(V1.affine, 5, 9, k);
  ok(got.every((v, i) => near(v, ras[i], 1e-6)), `affine T1 oblique (6°) : voxel (5, 9, ${k}) → ${got.map(v => v.toFixed(2))} = position DICOM en RAS`);
  ok(V1.dims.join('x') === '64x64x40' && V1.pixdim.every((v, i) => near(v, [3, 3, 2][i], 1e-6)) && V1.orient === 'axiale', `dims ${V1.dims.join('×')}, pixdim ${V1.pixdim.map(v => v.toFixed(2))}, ${V1.orient}`);
}
// --- volume avec pixels : axes canoniques (chaque axe du monde croît avec son axe voxel), même monde
const V1c = D.volume(t1);
{
  const A = V1c.affine; ok(A[0] > 0 && A[5] > 0 && A[10] > 0 && V1c.data.length === 64 * 64 * 40, `axes canoniques : diagonale positive (${[A[0], A[5], A[10]].map(v => v.toFixed(2))})`);
  // même boîte dans le monde : les 8 coins du volume brut et du volume canonique coïncident (ordre différent)
  const raw = D.volume(t1, null, false), corners = V => { const [nx, ny, nz] = V.dims, out = []; for (const z of [0, nz - 1]) for (const y of [0, ny - 1]) for (const x of [0, nx - 1]) out.push(app(V.affine, x, y, z).map(v => v.toFixed(3)).join()); return out.sort(); };
  const c0 = corners(raw), c1 = corners(V1c); ok(c0.join('|') === c1.join('|'), 'retournement des axes : même boîte dans le monde (8 coins identiques)');
  // et même valeur au même point du monde : voxel brut (20, 30, 7) → monde → voxel canonique
  const i = 20, j = 30, k = 7, w = app(raw.affine, i, j, k), B = V1c.affine, inv = [[B[0], B[1], B[2]], [B[4], B[5], B[6]], [B[8], B[9], B[10]]];
  // résolution 3×3 (Cramer)
  const det = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const rhs = [w[0] - B[3], w[1] - B[7], w[2] - B[11]], dd = det(inv), v = [0, 1, 2].map(c => { const m = inv.map(r => r.slice()); for (let r = 0; r < 3; r++) m[r][c] = rhs[r]; return Math.round(det(m) / dd); });
  const rawPix = D.volume(t1); // volume canonique = rawPix ; valeur brute : relire le pixel dans la coupe k
  const sl = t1.sub[0].slices[k], px = sl.file.P.ds.get('7fe0,0010'), u8 = sl.file.P.u8, o = px.off + 2 * (i + 64 * j), rawVal = u8[o] | (u8[o + 1] << 8);
  ok(V1c.data[v[0] + 64 * (v[1] + 64 * v[2])] === rawVal, `même valeur au même point du monde : brut (${i}, ${j}, ${k}) = canonique (${v}) = ${rawVal}`);
  let mx = 0; for (let q = 0; q < V1c.data.length; q++) if (V1c.data[q] > mx) mx = V1c.data[q];
  ok(mx >= 600 && mx <= 4000, `pixels T1 lus (max ${mx})`);
}
// --- acquisition sagittale ou coronale : les axes voxel sont permutés pour que x, y, z du monde soient portés par les axes 0, 1, 2
{
  // le volume canonique T1, réécrit « coupes sagittales » (axe voxel 0 = z monde, 1 = x, 2 = y) puis rendu canonique : identique
  const V = V1c, [nx, ny, nz] = V.dims, P = [2, 0, 1];   // nouvel axe c = ancien axe P[c]
  const nd = [V.dims[P[0]], V.dims[P[1]], V.dims[P[2]]], d2 = new V.data.constructor(V.data.length), A = V.affine, B = Float64Array.from(A);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) B[4 * r + c] = A[4 * r + P[c]];
  for (let k = 0; k < nd[2]; k++) for (let j = 0; j < nd[1]; j++) for (let i = 0; i < nd[0]; i++) { const o = [0, 0, 0]; o[P[0]] = i; o[P[1]] = j; o[P[2]] = k; d2[i + nd[0] * (j + nd[1] * k)] = V.data[o[0] + nx * (o[1] + ny * o[2])]; }
  const sag = { dims: nd, pixdim: [V.pixdim[2], V.pixdim[0], V.pixdim[1]], affine: B, data: d2, slope: 1, inter: 0 }, back = D.canonical(sag);
  const sameA = [...Array(12).keys()].every(i => near(back.affine[i], A[i], 1e-9)); let sameD = true; for (let q = 0; q < V.data.length; q += 7) if (back.data[q] !== V.data[q]) { sameD = false; break; }
  ok(back.dims.join() === V.dims.join() && sameA && sameD && back.pixdim.join() === V.pixdim.join(), `acquisition sagittale (${nd.join('×')}) rangée x d'abord : ${back.dims.join('×')}, affine et voxels identiques au volume axial`);
}
// --- CT : HU par pente / ordonnée, électrode hyperdense, VR implicite
const Vc = D.volume(ct);
{
  const hu = v => v * Vc.slope + Vc.inter; let mx = -Infinity, mn = Infinity, nMetal = 0; for (let q = 0; q < Vc.data.length; q++) { const h = hu(Vc.data[q]); if (h > mx) mx = h; if (h < mn) mn = h; if (h > 2000) nMetal++; }
  ok(Vc.slope === 1 && Vc.inter === -1024 && near(mn, -1024, 1) && near(mx, 2500, 1) && nMetal > 50, `CT : HU = pixel × ${Vc.slope} − 1024, min ${mn} max ${mx}, ${nMetal} voxels métalliques`);
  ok(Vc.dims.join('x') === '80x80x30' && Vc.pixdim.every((v, i) => near(v, [1.5, 1.5, 1][i], 1e-6)) && Vc.guess.modality === 'CT', `CT ${Vc.dims.join('×')} à ${Vc.pixdim.map(v => v.toFixed(1))} mm`);
  // la tige oblique : x croît avec z dans le monde (x = 10 + 0,6 z en LPS → RAS : x = −10 − 0,6 z) : centre des voxels métalliques par coupe
  const [nx, ny, nz] = Vc.dims, A = Vc.affine, cz = [];
  for (let z = 0; z < nz; z++) { let sx = 0, n = 0; for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) if (hu(Vc.data[x + nx * (y + ny * z)]) > 2000) { sx += app(A, x, y, z)[0]; n++; } if (n) cz.push([app(A, 0, 0, z)[2], sx / n]); }
  const z0 = cz[0], z1 = cz[cz.length - 1], slope = (z1[1] - z0[1]) / (z1[0] - z0[0]);
  ok(cz.length >= 20 && near(slope, -0.6, 0.08), `électrode oblique suivie dans le monde RAS : dx/dz = ${slope.toFixed(2)} (attendu −0,60)`);
}
// --- aller-retour NIfTI (.nii.gz) : mêmes dims, affine et données
{
  const gz = await SV.Nifti.encodeGz(Vc), back = await SV.Nifti.read(gz);
  const same = back.dims.slice(0, 3).join() === Vc.dims.join() && [...Array(12).keys()].every(i => near(back.affine[i], Vc.affine[i], 1e-3)) && back.data.length === Vc.data.length && back.data[12345] === Vc.data[12345];
  ok(same, `NIfTI.gz : ${gz.length} octets, dims et affine conservées, pente ${back.slope} ordonnée ${back.inter}`);
}

// --- catalogue d'électrodes (v4.21) : positions des plots depuis la pointe, d'après les catalogues DIXI et Alcis
if (SV.Electrodes && SV.Electrodes.offsetsOf) {
  const E = SV.Electrodes, off = id => E.offsetsOf(E.modelById(id)), last = a => a[a.length - 1];
  const am12 = off('DIXI D08-12AM'); ok(am12.length === 12 && near(am12[0], 1, 1e-9) && near(am12[1] - am12[0], 3.5, 1e-9) && near(last(am12), 1 + 11 * 3.5, 1e-9), `DIXI D08-12AM : 12 plots, 1 + k·3,5 mm (dernier ${last(am12)})`);
  const cm18 = off('DIXI D08-18CM'); ok(cm18.length === 18 && near(cm18[6] - cm18[5], 2 + 11, 1e-9) && near(cm18[12] - cm18[11], 2 + 11, 1e-9) && near(last(cm18) - cm18[0] + 2, 80.5, 1e-6), `DIXI D08-18CM (3×6, écart 11 mm entre groupes) : longueur ${(last(cm18) - cm18[0] + 2).toFixed(1)} mm`);
  const bm15 = off('DIXI D08-15BM'); ok(bm15.length === 15 && near(bm15[5] - bm15[4], 2 + 7, 1e-9) && near(last(bm15) - bm15[0] + 2, 62, 1e-6), `DIXI D08-15BM (3×5, écart 7) : longueur ${(last(bm15) - bm15[0] + 2).toFixed(1)} mm`);
  const a18 = off('Alcis 2069-EPC-18C-40'); ok(a18.length === 18 && near(a18[1] - a18[0], 4, 1e-9) && near(last(a18) - a18[0] + 2, 70, 1e-6), `Alcis 18C-40 : pas 4 mm, longueur ${(last(a18) - a18[0] + 2).toFixed(0)} mm`);
  const hd15 = off('Alcis 2069-EPC-15E-20'); ok(hd15.length === 15 && near(hd15[0], 1, 1e-9) && near(hd15[1], 3.5, 1e-9) && near(hd15[2] - hd15[1], 2, 1e-9) && near(last(hd15) + 0.5, 30, 1e-6), `Alcis HD 15E-20 : pointe 2 mm puis anneaux de 1 mm tous les 2 mm, longueur ${(last(hd15) + 0.5).toFixed(0)} mm`);
  const m = E.modelFor('Alcis', 12); ok(m && /Alcis/.test(m.id) && m.n === 12, `modelFor(Alcis, 12) → ${m && m.id}`);
}

// --- recalage : masque fixe sur une autre grille (masque du cerveau conformé 1 mm) → rééchantillonné ; grille sans recouvrement → ignoré avec avertissement
if (SV.Coreg && SV.Coreg._util && SV.Coreg._util.maskOnFixed) {
  const U = SV.Coreg._util, fixed = { dims: [20, 20, 20], pixdim: [2, 2, 2], affine: Float64Array.from([2, 0, 0, -20, 0, 2, 0, -20, 0, 0, 2, -20, 0, 0, 0, 1]), data: new Float32Array(8000) };
  const mask = { dims: [40, 40, 40], affine: Float64Array.from([1, 0, 0, -20, 0, 1, 0, -20, 0, 0, 1, -20, 0, 0, 0, 1]), data: new Uint8Array(64000) };
  for (let z = 10; z < 30; z++) for (let y = 10; y < 30; y++) for (let x = 10; x < 30; x++) mask.data[x + 40 * (y + 40 * z)] = 1;
  const w = [], m = U.maskOnFixed(fixed, mask, w); let n = 0; if (m) for (const v of m) n += v;
  ok(m instanceof Uint8Array && m.length === 8000 && n > 800 && n < 1300 && !w.length, `masque objet (grille 1 mm) rééchantillonné sur la grille fixe (2 mm) : ${n} voxels sur 8000`);
  const w2 = [], m2 = U.maskOnFixed(fixed, { dims: [10, 10, 10], affine: Float64Array.from([1, 0, 0, 500, 0, 1, 0, 500, 0, 0, 1, 500, 0, 0, 0, 1]), data: new Uint8Array(1000).fill(1) }, w2);
  ok(m2 === null && w2.length === 1, `masque sans recouvrement : ignoré (${w2[0]})`);
  const u = new Uint8Array(8000).fill(1), w3 = [], m3 = U.maskOnFixed(fixed, u, w3); ok(m3 === u && !w3.length, 'masque déjà sur la grille fixe : inchangé');
  const w4 = []; ok(U.maskOnFixed(fixed, new Uint8Array(12), w4) === null && w4.length === 1, `masque de mauvaise taille : ignoré (${w4[0]})`);
}
console.log(`${nOk} ok, ${nFail} échec(s)`); process.exit(nFail ? 1 : 0);
