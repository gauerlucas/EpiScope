// node tools/tests/test_zip.mjs — aller-retour ZIP + lecture par Python zipfile
import fs from 'fs'; import vm from 'vm'; import { execSync } from 'child_process';
vm.runInThisContext(fs.readFileSync('src/zip.js', 'utf8'));
const SV = globalThis.SV;
const big = new Uint8Array(200000); for (let i = 0; i < big.length; i++) big[i] = (i * 7) % 13;
const blob = await SV.Zip.write([{ name: 'dossier.json', data: JSON.stringify({ a: 'é ü', n: [1, 2, 3] }) }, { name: 'imaging/x.nii.gz', data: new Uint8Array([31, 139, 8, 0, 1, 2, 3]) }, { name: 'derivatives/big.bin', data: big }]);
const u8 = new Uint8Array(await blob.arrayBuffer()); fs.writeFileSync('/tmp/claude-0/t/test.zip', u8);
const z = await SV.Zip.read(u8);
const ok = (await z.text('dossier.json')).includes('é ü') && (await z.bytes('imaging/x.nii.gz')).length === 7 && (await z.bytes('derivatives/big.bin')).every((v, i) => v === big[i]);
console.log('names', z.names.join(','), 'roundtrip', ok, 'size', u8.length);
console.log(execSync(`python3 -c "import zipfile;z=zipfile.ZipFile('/tmp/claude-0/t/test.zip');print(z.testzip(), [ (i.filename,i.compress_type,i.file_size) for i in z.infolist()])"`).toString());
// archive écrite par Python
execSync(`cd /tmp/claude-0/t && python3 -c "import zipfile;z=zipfile.ZipFile('py.zip','w',zipfile.ZIP_DEFLATED);z.writestr('a/b.txt','bonjour '*100);z.close()"`);
const z2 = await SV.Zip.read(fs.readFileSync('/tmp/claude-0/t/py.zip')); console.log('python zip:', (await z2.text('a/b.txt')).slice(0, 16), z2.size('a/b.txt'));
