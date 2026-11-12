// node tools/tests/test_segatlas.mjs [t1_c.nii.gz] [labels.nii.gz] — depuis la racine du dépôt (Node ≥ 22)
// Segmentation du T1 sans réseau (v4.19, src/imaging/segatlas.js) et méthodes choisies une à une — aucune donnée patient :
//   1. recalage affine 12 ddl (Coreg.rigid({dof: 12})) : gabarit mis à l'échelle (0,8, « enfant ») et tourné, retrouvé ;
//   2. correction du biais sans réseau (biasCorrect) : biais lent connu appliqué à l'image d'exemple de brainchop (t1_c), le
//      champ estimé le suit, l'hétérogénéité de la substance blanche diminue ;
//   3. méthode atlas sur t1_c (masque = cerveau de labels.nii.gz dilaté, comme mindgrab) : Dice SG / SB vs labels.nii.gz,
//      étiquettes du modèle 104 (cortex de Desikan, SB gauche / droite du bon côté, ventricules, noyaux) ;
//   4. « nourrisson » synthétique : contraste inversé (SB plus sombre que la SG), cerveau réduit (× 0,78) et biais : tissus
//      retrouvés (les gaussiennes sont initialisées par les a priori, sans ordre supposé des intensités) ;
//   5. import : lecteur MGH (.mgz), aparc+aseg rééchantillonné d'une autre grille, carte p0 CAT12 et « tissues » Brainstorm
//      (ordre des classes déduit du T1), c1/c2/c3 SPM, aseg seul (cortex étiqueté par le gabarit).
import fs from 'fs'; import vm from 'vm'; import path from 'path'; import zlib from 'zlib';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const T1C = process.argv[2] || '/home/claude/neuroneural/brainchop/v3/data/t1_c.nii.gz', LAB = process.argv[3] || '/home/claude/neuroneural/brainchop/v3/data/labels.nii.gz';
globalThis.window = undefined;
const loadSrc = f => vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
for (const f of ['src/nifti.js', 'src/work.js', 'src/imaging/coreg.js', 'src/imaging/meshnet.js', 'src/imaging/anat.js', 'src/imaging/segatlas.js']) loadSrc(f);
const M4 = SV.Mat4, SA = SV.SegAtlas, N = 256, N3 = N ** 3;
const TJ = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/template_spm.json'), 'utf8'));
const MDL = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/models/model21_104class.json'), 'utf8')), meta = { names: MDL.labels, fsCodes: MDL.fsCodes, hemi: MDL.hemi };
let nOk = 0, nFail = 0; const ok = (c, msg) => { console.log((c ? '  ok    ' : '  ÉCHEC  ') + msg); c ? nOk++ : nFail++; };
const hdr = s => console.log('\n' + s);
const t1 = await SV.Nifti.read(fs.readFileSync(T1C)); t1.data = Uint8Array.from(t1.data); t1.slope = 1; t1.inter = 0;
const REF = Uint8Array.from((await SV.Nifti.read(fs.readFileSync(LAB))).data);   // 1 = SG, 2 = SB
const brain = SV.MeshNet.envelope(REF, 3, 1);   // cerveau + LCR périphérique (≈ masque mindgrab)
const conf = { dims: [N, N, N], pixdim: [1, 1, 1], data: t1.data, affine: M4.from(t1.affine), slope: 1, inter: 0 };
const tisDice = (lab, refCls, setFn) => { let a = 0, b = 0, ab = 0; for (let o = 0; o < N3; o++) { const x = REF[o] === refCls, y = setFn(lab[o]); a += x; b += y; ab += x && y; } return 2 * ab / (a + b); };
const names = MDL.labels, isGM = l => l && /^ctx-|Thalamus|Caudate|Putamen|Pallidum|Hippocampus|Amygdala|Accumbens|VentralDC|Cerebellum-Cortex/.test(names[l]), isWM = l => l && /White-Matter|Brain-Stem|^CC_/.test(names[l]);
const el = t0 => ((performance.now() - t0) / 1000).toFixed(1) + ' s';

// ---------------------------------------------------------------- 1. affine 12 ddl
hdr('1. recalage affine (Coreg.rigid, dof 12) : gabarit × 0,8 tourné de 10°, translaté');
{
  const V = await SV.Nifti.read(Uint8Array.from(atob(TJ.t1), c => c.charCodeAt(0))), c = M4.apply(V.affine, V.dims[0] / 2, V.dims[1] / 2, V.dims[2] / 2);
  const Ttrue = M4.mul(M4.rigid([6, -4, 3, 10 * Math.PI / 180, 0, 4 * Math.PI / 180], c), (() => { const S = M4.identity(); S[0] = 0.8; S[5] = 0.78; S[10] = 0.82; for (let r = 0; r < 3; r++) S[4 * r + 3] = c[r] * (1 - S[5 * r]); return S; })());
  const fixed = SV.Vol.resample(V, { dims: [96, 96, 96], affine: M4.from([1.5, 0, 0, -72, 0, 1.5, 0, -90, 0, 0, 1.5, -60, 0, 0, 0, 1]) }, Ttrue, 'linear');
  const t0 = performance.now(), R = SV.Coreg.rigid(fixed, V, { dof: 12, levels: [8, 4, 2] });
  let e = 0; for (const p of [[0, 0, 0], [50, 0, 0], [-50, 0, 0], [0, 60, 0], [0, -60, 0], [0, 0, 50], [0, 0, -40]]) { const q = [c[0] + p[0], c[1] + p[1], c[2] + p[2]], a = M4.apply(R.T, ...q), b = M4.apply(Ttrue, ...q); e = Math.max(e, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])); }
  const R6 = SV.Coreg.rigid(fixed, V, { levels: [8, 4, 2] }); let e6 = 0; for (const p of [[50, 0, 0], [-50, 0, 0], [0, 60, 0], [0, -60, 0]]) { const q = [c[0] + p[0], c[1] + p[1], c[2] + p[2]], a = M4.apply(R6.T, ...q), b = M4.apply(Ttrue, ...q); e6 = Math.max(e6, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])); }
  ok(e < 2.5 && R.dof === 12, `affine retrouvée : écart max ${e.toFixed(2)} mm à ±60 mm (rigide seul : ${e6.toFixed(1)} mm), échelles ${R.scales.join(' / ')} (vraies 0,8 / 0,78 / 0,82), ${el(t0)}`);
}

// ---------------------------------------------------------------- 2. correction du biais
hdr('2. correction du biais sans réseau (SegAtlas.biasCorrect) sur t1_c dégradé');
const deg = new Uint8Array(N3), Bf = new Float32Array(N3);
for (let k = 0, o = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++, o++) {
  const v = t1.data[o]; if (!v) continue; const b = 1 + 0.15 - 0.3 * (k / 255) - 0.15 * (1 - j / 255) + 0.08 * Math.sin(i / 40); Bf[o] = b; const y = v * 0.7 * b; deg[o] = y > 255 ? 255 : y;
}
{
  const t0 = performance.now(), H = SA.biasCorrect(deg, brain, {});
  // corrélation champ appliqué / champ estimé (image dégradée / corrigée) sur la SB de référence
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, n = 0, s = 0, s2 = 0, d = 0, d2 = 0;
  for (let o = 0; o < N3; o += 3) { if (REF[o] !== 2 || !H.data[o]) continue; const x = Math.log(Bf[o]), y = Math.log((deg[o] + 1) / (H.data[o] + 1)); sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; n++; s += H.data[o]; s2 += H.data[o] ** 2; d += deg[o]; d2 += deg[o] ** 2; }
  const r = (sxy - sx * sy / n) / Math.sqrt((sxx - sx * sx / n) * (syy - sy * sy / n)), cv1 = Math.sqrt(s2 / n - (s / n) ** 2) / (s / n), cv0 = Math.sqrt(d2 / n - (d / n) ** 2) / (d / n);
  ok(!H.stats.skipped && r > 0.85 && cv1 < 0.8 * cv0 && Math.abs(s / n - 170) < 20, `champ estimé ~ champ appliqué (r = ${r.toFixed(3)}), SB : moyenne ${(s / n).toFixed(0)} (cible 170), CV ${(100 * cv0).toFixed(1)} → ${(100 * cv1).toFixed(1)} % ; biais ${H.stats.field.map(v => (100 * v).toFixed(0) + ' %').join(' à ')} ; ${H.stats.iters} it., ${el(t0)}`);
}

// ---------------------------------------------------------------- 3. méthode atlas sur t1_c
hdr('3. méthode atlas (type SPM) sur t1_c dégradé (biais), masque = cerveau de référence dilaté');
let A3;
{
  const t0 = performance.now(); let last = '';
  A3 = await SA.segment(Object.assign({}, conf, { data: deg }), brain, TJ, meta, { keepImage: true }, p => { if (p.message !== last) { last = p.message; process.stdout.write(`\r    ${(100 * p.fraction).toFixed(0).padStart(3)} % ${p.message}                 `); } });
  console.log(`\r    terminé en ${el(t0)} · recalage NMI ${A3.atlas.reg.nmi} (pic ${A3.atlas.reg.rel}), échelles ${A3.atlas.reg.scales.join(' / ')}, s0 ${A3.atlas.reg.s0} · EM ${A3.atlas.em.iters} it. : moyennes ${A3.atlas.em.means.join(' / ')} · volumes LCR ${A3.atlas.em.volumes.csf} / SG ${A3.atlas.em.volumes.gm} / SB ${A3.atlas.em.volumes.wm} cm³`);
  console.log('    ' + A3.timings.map(t => `${t.layer} ${(t.ms / 1000).toFixed(1)} s`).join(' · ') + ` · SG au plus proche ${A3.atlas.stats.gmNearest}, perdus ${A3.atlas.stats.gmLost}, LCR → ventricule ${A3.atlas.stats.csfVent}`);
  const dG = tisDice(A3.labels, 1, isGM), dW = tisDice(A3.labels, 2, isWM);
  ok(dG > 0.78 && dW > 0.85, `Dice vs labels.nii.gz : SG ${dG.toFixed(3)}, SB ${dW.toFixed(3)} (MeshNet : ≈ 0,85 / 0,90 sur l'image d'origine)`);
  const st = SV.MeshNet.labelStats(A3.labels, [N, N, N], A3.affine, names), by = Object.fromEntries(st.map(s => [s.name, s]));
  const nCtx = st.filter(s => /^ctx-/.test(s.name) && s.count > 200).length;
  ok(nCtx >= 60, `${nCtx} régions corticales de Desikan (> 200 voxels) sur 68`);
  const side = ['Cerebral-White-Matter', 'Lateral-Ventricle', 'Thalamus-Proper*', 'Putamen', 'Hippocampus', 'Cerebellum-Cortex'].every(n => by['Left-' + n] && by['Right-' + n] && by['Left-' + n].count > 300 && by['Left-' + n].centroid[0] < by['Right-' + n].centroid[0]);
  ok(side, 'substance blanche, ventricules, thalamus, putamen, hippocampe, cervelet : gauche et droite présents, du bon côté (x gauche < x droit)');
  const big = st.slice().sort((a, b) => b.count - a.count).slice(0, 2).map(s => s.name);
  ok(big.every(n => /Cerebral-White-Matter/.test(n)), 'deux plus grandes classes = ' + big.join(', '));
  const q = SV.Anat.segQuality(A3.labels, [N, N, N], A3.affine, JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/template_anat.json'), 'utf8')));
  ok(q.rms < 6.5 && q.scales.every(s => s > 0.8 && s < 1.3), `contrôle de qualité de la chaîne (centroïdes vs gabarit) : ${q.rms} mm, échelles ${q.scales.join(' / ')}`);
  ok(A3.image && A3.image.length === N3 && A3.harmonize && A3.harmonize.field, `image corrigée du biais fournie (biais ${A3.harmonize.field.map(v => (100 * v).toFixed(0) + ' %').join(' à ')})`);
}

// ---------------------------------------------------------------- 4. nourrisson synthétique
hdr('4. « nourrisson » synthétique : contraste inversé (SB < SG), cerveau × 0,78, biais');
{
  // tissus de référence de t1_c réduits (× 0,78 autour du centre du cerveau) ; LCR = masque − SG − SB
  let cx = 0, cy = 0, cz = 0, n = 0; for (let o = 0; o < N3; o++) if (REF[o]) { cx += o % N; cy += ((o / N) | 0) % N; cz += (o / N / N) | 0; n++; } cx /= n; cy /= n; cz /= n;
  const s = 0.78, tis = new Uint8Array(N3), img = new Uint8Array(N3), msk = new Uint8Array(N3); let r = 12345; const rnd = () => (r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const MU = [0, 35, 120, 85], SD = [0, 6, 9, 8];   // LCR sombre, SG claire, SB plus sombre que la SG (myélinisation débutante)
  for (let k = 0, o = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++, o++) {
    const u = Math.round(cx + (i - cx) / s), v = Math.round(cy + (j - cy) / s), w = Math.round(cz + (k - cz) / s); if (u < 0 || v < 0 || w < 0 || u >= N || v >= N || w >= N) continue;
    const q = u + N * (v + N * w), c = REF[q] === 1 ? 2 : REF[q] === 2 ? 3 : brain[q] ? 1 : 0; if (!c) { if (t1.data[q] > 10) img[o] = Math.min(255, 30 + 0.3 * t1.data[q]); continue; }
    tis[o] = c; msk[o] = 1; const b = 1.1 - 0.2 * k / 255, g = Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd()); img[o] = Math.max(1, Math.min(255, (MU[c] + SD[c] * g) * b));
  }
  const t0 = performance.now(), R = await SA.segment(Object.assign({}, conf, { data: img }), msk, TJ, meta, {});
  const dc = c => { let a = 0, b = 0, ab = 0; for (let o = 0; o < N3; o++) { const x = tis[o] === c, l = R.labels[o], y = c === 2 ? isGM(l) : c === 3 ? isWM(l) : false; a += x; b += y; ab += x && y; } return 2 * ab / (a + b); };
  const g = dc(2), w = dc(3);
  ok(g > 0.75 && w > 0.75 && /inversé/.test(R.atlas.em.contrast), `tissus retrouvés : Dice SG ${g.toFixed(3)}, SB ${w.toFixed(3)} ; ${R.atlas.em.contrast} ; moyennes ${R.atlas.em.means.join(' / ')} ; échelle de départ ${R.atlas.reg.s0}, finale ${R.atlas.reg.scales.join(' / ')} ; cerveau ${R.atlas.brainCm3} cm³ ; ${el(t0)}`);
}

// ---------------------------------------------------------------- 5. import
hdr('5. import de segmentations faites ailleurs');
{
  // MGH : en-tête big-endian, Mdc, c_ras → vox2ras
  const dims = [8, 6, 4], buf = new Uint8Array(284 + dims[0] * dims[1] * dims[2] * 2), dv = new DataView(buf.buffer);
  dv.setInt32(0, 1); dv.setInt32(4, 8); dv.setInt32(8, 6); dv.setInt32(12, 4); dv.setInt32(16, 1); dv.setInt32(20, 4); dv.setInt16(28, 1);
  [1, 1.5, 2].forEach((v, q) => dv.setFloat32(30 + 4 * q, v)); [-1, 0, 0, 0, 0, -1, 0, 1, 0].forEach((v, q) => dv.setFloat32(42 + 4 * q, v)); [10, -20, 5].forEach((v, q) => dv.setFloat32(78 + 4 * q, v));
  for (let q = 0; q < 192; q++) dv.setInt16(284 + 2 * q, q * 3 - 100);
  const V = await SA.readAny(new Uint8Array(zlib.gzipSync(buf)), 'aseg.mgz'), A = V.affine, cen = M4.apply(A, 4, 3, 2);
  ok(V.dims.join() === '8,6,4' && V.data[5] === -85 && Math.abs(cen[0] - 10) < 1e-6 && Math.abs(cen[1] + 20) < 1e-6 && Math.abs(cen[2] - 5) < 1e-6 && A[0] === -1 && A[9] === -1.5 && A[6] === 2, `MGH (.mgz) : dimensions, données int16 big-endian, vox2ras (centre = c_ras, colonnes Mdc × taille)`);
  // aparc+aseg en codes FreeSurfer, sur une grille RAS 1 mm (≠ conformée LIA) → retour aux étiquettes du modèle
  const ras = { dims: [200, 220, 200], affine: M4.from([1, 0, 0, -100, 0, 1, 0, -115, 0, 0, 1, -95, 0, 0, 0, 1]) };
  const labV = { dims: [N, N, N], affine: conf.affine, data: Int16Array.from(A3.labels, l => l ? MDL.fsCodes[l] : 0), slope: 1, inter: 0 };
  const fsVol = SV.Vol.resample(labV, ras, null, 'nearest', Int16Array);
  const nii = await SV.Nifti.encodeGz({ dims: fsVol.dims, affine: fsVol.affine, data: fsVol.data });
  const I1 = await SA.fromImport([{ name: 'aparc+aseg.nii.gz', bytes: nii }], conf, meta);
  let agree = 0, tot = 0; for (let o = 0; o < N3; o++) if (A3.labels[o] || I1.labels[o]) { tot++; if (A3.labels[o] === I1.labels[o]) agree++; }
  ok(I1.kind === 'aparcaseg' && agree / tot > 0.97 && I1.info.inHead > 0.95, `aparc+aseg (grille RAS 1 mm) → modèle : ${(100 * agree / tot).toFixed(2)} % d'accord après aller-retour, dans la tête du T1 ${(100 * I1.info.inHead).toFixed(0)} % ; ${I1.info.source}`);
  // carte p0 CAT12 (1 LCR, 2 SG, 3 SB) et « tissues » Brainstorm (1 SB, 2 SG, 3 LCR, 4 os, 5 scalp)
  const tisOf = l => !l ? 0 : isGM(l) ? 2 : isWM(l) ? 3 : 1;
  const p0 = Float32Array.from(A3.labels, l => tisOf(l)), bst = Uint8Array.from(A3.labels, l => [0, 3, 2, 1][tisOf(l)]); for (let o = 0; o < N3; o += 1) if (!bst[o] && t1.data[o] > 60) bst[o] = 5;
  const I2 = await SA.fromImport([{ name: 'p0sub.nii', bytes: SV.Nifti.encode({ dims: [N, N, N], affine: conf.affine, data: p0 }) }], conf, meta);
  const I3 = await SA.fromImport([{ name: 'tissues.nii', bytes: SV.Nifti.encode({ dims: [N, N, N], affine: conf.affine, data: bst }) }], conf, meta);
  const same = (a, b) => { let d = 0; for (let o = 0; o < N3; o++) if (a[o] !== b[o]) d++; return d; };
  const want = Uint8Array.from(A3.labels, l => tisOf(l));
  ok(I2.kind === 'tissue' && same(I2.tissue, want) === 0 && /CAT12/.test(I2.info.source), `p0 CAT12 : tissus identiques (${I2.info.source})`);
  ok(I3.kind === 'tissue' && same(I3.tissue, want) === 0 && /Brainstorm/.test(I3.info.source), `« tissues » Brainstorm : ordre 1 SB / 3 LCR reconnu par les intensités du T1 (moyennes ${I3.info.means.join(' / ')}), os et scalp ignorés`);
  // c1/c2/c3 SPM (probabilités)
  const pm = c => Float32Array.from(want, t => t === c ? 0.9 : 0.05);
  const I4 = await SA.fromImport([{ name: 'c1sub.nii', bytes: SV.Nifti.encode({ dims: [N, N, N], affine: conf.affine, data: pm(2) }) }, { name: 'c2sub.nii', bytes: SV.Nifti.encode({ dims: [N, N, N], affine: conf.affine, data: pm(3) }) }, { name: 'c3sub.nii', bytes: SV.Nifti.encode({ dims: [N, N, N], affine: conf.affine, data: pm(1) }) }], conf, meta);
  ok(I4.kind === 'tissue' && same(I4.tissue, want) === 0, `c1 / c2 / c3 SPM : SG, SB, LCR (${I4.info.source})`);
  // aseg seul : structures imposées, cortex (3 / 42) par le gabarit
  const asegCode = l => { if (!l) return 0; const n = names[l]; return /^ctx-lh/.test(n) ? 3 : /^ctx-rh/.test(n) ? 42 : MDL.fsCodes[l]; };
  const aseg = Int16Array.from(A3.labels, asegCode);
  const I5 = await SA.fromImport([{ name: 'aseg.mgz', bytes: SV.Nifti.encode({ dims: [N, N, N], affine: conf.affine, data: aseg }) }], conf, meta);
  const t0 = performance.now(), R5 = await SA.segment(conf, brain, TJ, meta, { tissue: I5.tissue, labelsIn: I5.labelsIn });
  let ctxOk = 0, ctxN = 0, deepSame = 0, deepN = 0;
  for (let o = 0; o < N3; o++) { const l = A3.labels[o]; if (!l) continue; if (/^ctx-/.test(names[l])) { ctxN++; if (/^ctx-/.test(names[R5.labels[o]] || '') && names[R5.labels[o]].slice(0, 6) === names[l].slice(0, 6)) ctxOk++; } else { deepN++; if (R5.labels[o] === l) deepSame++; } }
  ok(I5.kind === 'aseg' && ctxOk / ctxN > 0.97 && deepSame / deepN > 0.99 && !R5.atlas.em, `aseg seul : structures du fichier conservées (${(100 * deepSame / deepN).toFixed(1)} %), cortex étiqueté par le gabarit du bon côté (${(100 * ctxOk / ctxN).toFixed(1)} %), sans EM ; ${el(t0)}`);
}
console.log(`\n${nOk} ok, ${nFail} échec(s)`);
process.exit(nFail ? 1 : 0);
