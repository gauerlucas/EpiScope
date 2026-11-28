// node tools/make_elastix.mjs <dossier contenant node_modules avec @itk-wasm/elastix@2.1.0 et esbuild>
// v3.5.0 — embarque elastix (ITKElastix, itk-wasm ; licence Apache 2.0) dans EpiScope, sans réseau :
//   src/imaging/elastix_wasm.js  fabrique 'elastixwasm' (texte du lanceur itk-wasm + liaison Emscripten d'elastix, assemblés
//                                par esbuild) : SV.ElastixWasm.run(wasmBinary, parameterObject, fixed, moving, log) ;
//                                exécutable dans un worker créé par SV.Work (la fabrique est recopiée dans un Blob) ;
//   assets/elastix.json          binaire WebAssembly d'elastix (version Emscripten, celle du navigateur) compressé gzip, base64.
// Le paquet npm n'est jamais versé au dépôt : installer hors dépôt (cd <dossier> && npm i @itk-wasm/elastix@2.1.0 esbuild).
import fs from 'fs'; import path from 'path'; import zlib from 'zlib'; import { execFileSync } from 'child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PK = path.resolve(process.argv[2] || '/home/claude/val'), NM = path.join(PK, 'node_modules');
const pkg = JSON.parse(fs.readFileSync(path.join(NM, '@itk-wasm/elastix/package.json'), 'utf8'));
if (pkg.version !== '2.1.0') console.warn('attention : @itk-wasm/elastix', pkg.version, '(testé : 2.1.0)');
const itk = JSON.parse(fs.readFileSync(path.join(NM, 'itk-wasm/package.json'), 'utf8')).version;

// 1. lanceur : runPipelineEmscripten d'itk-wasm + liaison Emscripten (ESM) d'elastix → IIFE sans import réseau
const entry = path.join(PK, '_episcope_elastix_entry.js');
fs.writeFileSync(entry, `import runPipelineEmscripten from './node_modules/itk-wasm/dist/pipeline/internal/run-pipeline-emscripten.js';
import InterfaceTypes from './node_modules/itk-wasm/dist/interface-types/interface-types.js';
import elastixFactory from './node_modules/@itk-wasm/elastix/dist/pipelines/elastix.js';
async function run(wasmBinary, parameterObject, fixed, moving, log) {
  const mod = await elastixFactory({ wasmBinary, print: t => log && log(t), printErr: t => log && log(t) });
  const inputs = [{ type: InterfaceTypes.JsonCompatible, data: parameterObject }, { type: InterfaceTypes.Image, data: fixed }, { type: InterfaceTypes.Image, data: moving }];
  const outputs = [{ type: InterfaceTypes.Image }, { type: InterfaceTypes.TransformList }, { type: InterfaceTypes.JsonCompatible }];
  const r = runPipelineEmscripten(mod, ['0', '0', '1', '2', '--memory-io', '--fixed', '1', '--moving', '2'], outputs, inputs);
  if (r.returnValue !== 0) throw new Error(r.stderr || ('elastix : code ' + r.returnValue));
  return { result: r.outputs[0].data, transformParameterObject: r.outputs[2].data, stdout: r.stdout };
}
SV.ElastixWasm = { run, version: ${JSON.stringify(pkg.version)}, itkWasm: ${JSON.stringify(itk)} };
`);
const out = path.join(PK, '_episcope_elastix_bundle.js');
execFileSync(path.join(NM, '.bin/esbuild'), [entry, '--bundle', '--format=iife', '--platform=browser', '--target=es2020', '--legal-comments=inline',
  '--define:import.meta.url="file:///episcope/elastix.js"', '--external:module', '--outfile=' + out], { stdio: 'inherit' });
const bundle = fs.readFileSync(out, 'utf8');
fs.writeFileSync(path.join(ROOT, 'src/imaging/elastix_wasm.js'), `/* EpiScope — imaging/elastix_wasm.js : FICHIER GÉNÉRÉ par tools/make_elastix.mjs, ne pas modifier à la main.
 * elastix (Klein et al., IEEE TMI 2010 ; Shamonin et al., Front Neuroinform 2014) dans sa version WebAssembly ITKElastix /
 * itk-wasm (@itk-wasm/elastix ${pkg.version}, itk-wasm ${itk}) — licence Apache 2.0, InsightSoftwareConsortium.
 * Le binaire (assets/elastix.json) est fourni par l'appelant : aucune requête réseau.                                   */
(function (factory) {
  const G = typeof window !== 'undefined' ? (window.SV = window.SV || {}) : (globalThis.SV = globalThis.SV || {});
  factory(G); (G._factories = G._factories || {}).elastixwasm = factory;
})(function (SV) {
${bundle}
});
`);

// 2. binaire : version Emscripten (fichier .wasm.zst du paquet), décompressé puis gzip + base64
const { ZSTDDecoder } = await import(path.join(NM, '@thewtex/zstddec/dist/zstddec.modern.js'));
const dec = new ZSTDDecoder(); await dec.init();
const zst = fs.readFileSync(path.join(NM, '@itk-wasm/elastix/dist/pipelines/elastix.wasm.zst'));
const wasm = dec.decode(new Uint8Array(zst), 64 << 20);
if (wasm[0] !== 0 || wasm[1] !== 0x61) throw new Error('binaire WebAssembly invalide');
fs.writeFileSync(path.join(ROOT, 'assets/elastix.json'), JSON.stringify({
  version: pkg.version, itkWasm: itk, bytes: wasm.length, license: 'Apache-2.0 (ITKElastix / elastix, InsightSoftwareConsortium ; itk-wasm)',
  source: 'npm @itk-wasm/elastix ' + pkg.version + ' (dist/pipelines/elastix.wasm.zst, version Emscripten)', wasm: zlib.gzipSync(Buffer.from(wasm), { level: 9 }).toString('base64') }));
console.log('src/imaging/elastix_wasm.js', (bundle.length / 1024).toFixed(0), 'Ko ; assets/elastix.json', (fs.statSync(path.join(ROOT, 'assets/elastix.json')).size / 1e6).toFixed(2), 'Mo');
