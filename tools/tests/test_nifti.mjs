// node tools/tests/test_nifti.mjs — lecture/écriture NIfTI vs nibabel
import fs from 'fs'; import vm from 'vm';
globalThis.window = undefined; vm.runInThisContext(fs.readFileSync('src/nifti.js', 'utf8'));
const SV = globalThis.SV;
const f = process.argv[2];
const v = await SV.Nifti.read(fs.readFileSync(f));
console.log(JSON.stringify({ dims: v.dims, pix: v.pixdim, dt: v.datatype, aff: SV.Mat4.toArray(v.affine), q: SV.Vol.quantiles(v, [0, 0.5, 0.999]) }));
const gz = await SV.Nifti.encodeGz(v); fs.writeFileSync('/tmp/claude-0/t/rt.nii.gz', gz);
const v2 = await SV.Nifti.read(gz); let diff = 0; for (let i = 0; i < v.data.length; i++) diff = Math.max(diff, Math.abs(v.data[i] - v2.data[i]));
console.log('roundtrip maxdiff', diff, 'center', SV.Vol.center(v).map(x => x.toFixed(1)).join(','), 'orient', JSON.stringify(SV.Vol.orientation(v)));
