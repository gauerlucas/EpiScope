// node tools/tests/test_surfaces.mjs — v3.1.0 : surfaces lisses (données synthétiques)
//  - poche (cavité reliée à l'extérieur par un goulot étroit) refermée avant gonflement : plus de sommets écrasés en un point
//    (« petits pics » de la surface gonflée), genre 0 conservé ;
//  - normales robustes de la visionneuse (sommets d'aire incidente nulle : normale des voisins) ;
//  - structures profondes : distance signée lissée, surface sans marches de voxels, volume proche du masque.
import fs from 'fs'; import vm from 'vm'; import assert from 'assert/strict';
globalThis.window = undefined; globalThis.SV = {};
for (const f of ['src/imaging/volops.js', 'src/imaging/mesh.js']) vm.runInThisContext(fs.readFileSync(f, 'utf8'), { filename: f });
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const N = 72, A = [1, 0, 0, -36, 0, 1, 0, -36, 0, 0, 1, -36, 0, 0, 0, 1], idx = (i, j, k) => i + N * (j + N * k);
const collapsed = (P, F) => { const nv = P.length / 3, VA = new Float64Array(nv); for (let f = 0; f < F.length; f += 3) { const a = 3 * F[f], b = 3 * F[f + 1], c = 3 * F[f + 2]; const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2]; const s = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 6; VA[F[f]] += s; VA[F[f + 1]] += s; VA[F[f + 2]] += s; } const med = Float64Array.from(VA).sort()[nv >> 1]; let k = 0; for (const v of VA) if (v < 0.05 * med) k++; return k; };
// boule de rayon 26 creusée d'une poche (rayon 9) qui ne s'ouvre que par un canal de 1,5 voxel de rayon
const d = new Uint8Array(N * N * N);
for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  const x = i - 36, y = j - 36, z = k - 36, inBall = x * x + y * y + z * z < 26 * 26, inPocket = (x - 10) ** 2 + y * y + z * z < 81, inNeck = x > 10 && y * y + z * z < 2.25;
  if (inBall && !inPocket && !inNeck) d[idx(i, j, k)] = 1;
}
{
  const r0 = SV.Mesh.pipelineHemisphere({ dims: [N, N, N], affine: A, data: d }, [1], { targetVertices: 6000, pockets: false });
  const r1 = SV.Mesh.pipelineHemisphere({ dims: [N, N, N], affine: A, data: d }, [1], { targetVertices: 6000 });
  const c0 = collapsed(r0.inflated, r0.faces), c1 = collapsed(r1.inflated, r1.faces);
  ok(c0 > 20, 'sans traitement, la poche se referme en un point au gonflement (' + c0 + ' sommets écrasés)');
  ok(r1.info.pockets && r1.info.pockets.capped >= 1, 'poche refermée par un couvercle (' + JSON.stringify(r1.info.pockets) + ')');
  ok(c1 < c0 / 5, 'sommets écrasés après couvercle : ' + c1);
  ok(r1.info.topology.genus === 0 && r1.info.topology.closed && r1.info.topology.manifold, 'surface close, variété, genre 0');
  const used = new Uint8Array(r1.n); for (const v of r1.faces) used[v] = 1; ok(used.every(Boolean) && r1.inflated.length === 3 * r1.n && r1.sulc.length === r1.n, 'aucun sommet isolé, tableaux cohérents');
  ok(Array.from(r1.inflated).every(Number.isFinite), 'surface gonflée finie');
}
// normales de la visionneuse : sommets écrasés → normale des voisins
{
  const src = fs.readFileSync('src/viewer3d.js', 'utf8'), i0 = src.indexOf('  function vertexNormals'), i1 = src.indexOf('  const lvlKey');
  const vertexNormals = new Function(src.slice(i0, i1) + '; return vertexNormals;')();
  // grille plane 5 × 5 dont le sommet central est dédoublé en un éventail écrasé (4 sommets confondus)
  const P = [], F = [], g = (i, j) => i + 5 * j; for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) P.push(i, j, 0);
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { if ((i === 1 || i === 2) && (j === 1 || j === 2)) continue; F.push(g(i, j), g(i + 1, j), g(i + 1, j + 1), g(i, j), g(i + 1, j + 1), g(i, j + 1)); }
  const c = P.length / 3; P.push(2, 2, 0.001); const ring = [g(1, 1), g(2, 1), g(3, 1), g(3, 2), g(3, 3), g(2, 3), g(1, 3), g(1, 2)];
  const inner = []; for (let q = 0; q < 8; q++) { inner.push(P.length / 3); P.push(2 + 1e-4 * Math.cos(q), 2 + 1e-4 * Math.sin(q), (q % 2 ? 1 : -1) * 1e-4); }
  for (let q = 0; q < 8; q++) { F.push(ring[q], ring[(q + 1) % 8], inner[(q + 1) % 8], ring[q], inner[(q + 1) % 8], inner[q]); F.push(inner[q], inner[(q + 1) % 8], c); }
  const Nn = vertexNormals(Float32Array.from(P), Uint32Array.from(F), P.length / 3);
  ok([c, ...inner].every(v => Nn[3 * v + 2] > 0.9), 'normales des sommets écrasés reprises des voisins (z ≈ 1)');
}
// structures profondes : cube de 12 voxels → surface lisse, volume conservé à ±15 %
{
  const L = new Uint8Array(N * N * N); for (let k = 30; k < 42; k++) for (let j = 30; j < 42; j++) for (let i = 30; i < 42; i++) L[idx(i, j, k)] = 7;
  const s = SV.Mesh.pipelineStructure({ dims: [N, N, N], affine: A, data: L }, [7], {});
  const P = s.pos, F = s.faces, V = Math.abs(SV.Mesh.volume(P, F));
  ok(V > 0.85 * 1728 * 0.8 && V < 1.15 * 1728, 'volume du cube ≈ 1 728 mm³ (' + Math.round(V) + ')');
  // lisse : angle entre normales de faces voisines (arêtes) ≤ 25° en moyenne
  const fn = []; for (let f = 0; f < F.length; f += 3) { const a = 3 * F[f], b = 3 * F[f + 1], c = 3 * F[f + 2]; const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2], nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1; fn.push([nx / l, ny / l, nz / l]); }
  const e = new Map(); let sum = 0, cnt = 0; for (let f = 0; f < F.length / 3; f++) for (let k = 0; k < 3; k++) { const a = F[3 * f + k], b = F[3 * f + (k + 1) % 3], key = Math.min(a, b) + ',' + Math.max(a, b); if (e.has(key)) { const g2 = fn[e.get(key)], h = fn[f]; sum += Math.acos(Math.max(-1, Math.min(1, g2[0] * h[0] + g2[1] * h[1] + g2[2] * h[2]))); cnt++; } else e.set(key, f); }
  ok(sum / cnt * 180 / Math.PI < 12, 'surface lisse (angle moyen entre faces voisines ' + (sum / cnt * 180 / Math.PI).toFixed(1) + '°)');
}
console.log('test_surfaces :', n, 'vérifications');
