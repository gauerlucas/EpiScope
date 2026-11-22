// node tools/tests/test_nifti.mjs — lecture/écriture NIfTI vs nibabel
import fs from 'fs'; import vm from 'vm';
globalThis.window = undefined; vm.runInThisContext(fs.readFileSync('src/nifti.js', 'utf8'));
const SV = globalThis.SV;
// v1.0.1 : sans argument, volume synthétique (aller-retour encodage → lecture) ; avec un fichier : comparaison à nibabel à la main
const f = process.argv[2];
let src = f ? fs.readFileSync(f) : null;
if (!src) { const dims = [17, 13, 11], data = new Float32Array(dims[0] * dims[1] * dims[2]); for (let i = 0; i < data.length; i++) data[i] = (i % 97) - 20; src = await SV.Nifti.encodeGz({ dims, pixdim: [1, 1.5, 2], affine: SV.Mat4.from([1, 0, 0, -8, 0, 1.5, 0, -9, 0, 0, 2, -10, 0, 0, 0, 1]), data, slope: 1, inter: 0 }); }
const v = await SV.Nifti.read(src);
console.log(JSON.stringify({ dims: v.dims, pix: v.pixdim, dt: v.datatype, aff: SV.Mat4.toArray(v.affine), q: SV.Vol.quantiles(v, [0, 0.5, 0.999]) }));
const gz = await SV.Nifti.encodeGz(v);
const v2 = await SV.Nifti.read(gz); let diff = 0; for (let i = 0; i < v.data.length; i++) diff = Math.max(diff, Math.abs(v.data[i] - v2.data[i]));
if (diff > 1e-4) { console.error('aller-retour NIfTI : écart', diff); process.exit(1); }
console.log('roundtrip maxdiff', diff, 'center', SV.Vol.center(v).map(x => x.toFixed(1)).join(','), 'orient', JSON.stringify(SV.Vol.orientation(v)));
