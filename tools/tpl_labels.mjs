// Étiquettes VEP des sommets des surfaces du gabarit (communes à tools/make_templates.mjs et make_templates_bst.mjs) ;
// SV.Mesh (src/imaging/mesh.js) doit être chargé dans globalThis.SV avant l'appel.
/** étiquettes des sommets : vote à la pluralité sur les voisins (10 passages, limites moins dentelées que le filtre modal
 *  à majorité stricte des patients), puis îlots de moins de 40 sommets rendus à la région voisine dominante */
export function smoothLabels(faces, lab, nv) {
  const adj = SV.Mesh.adjacency(faces, nv);
  for (let it = 0; it < 10; it++) {
    const src = lab.slice();
    for (let v = 0; v < nv; v++) { const c = new Map(); c.set(src[v], 1.5); for (let s = adj.off[v]; s < adj.off[v + 1]; s++) { const u = src[adj.nbr[s]]; c.set(u, (c.get(u) || 0) + 1); } let b = src[v], bc = -1; for (const [u, n] of c) if (n > bc) { bc = n; b = u; } lab[v] = b; }
  }
  const comp = new Int32Array(nv).fill(-1), stack = []; let nc = 0;
  for (let v = 0; v < nv; v++) {
    if (comp[v] >= 0) continue; const members = []; comp[v] = nc; stack.push(v);
    while (stack.length) { const a = stack.pop(); members.push(a); for (let s = adj.off[a]; s < adj.off[a + 1]; s++) { const b = adj.nbr[s]; if (comp[b] < 0 && lab[b] === lab[v]) { comp[b] = nc; stack.push(b); } } }
    if (members.length < 40) { const c = new Map(); for (const a of members) for (let s = adj.off[a]; s < adj.off[a + 1]; s++) { const u = lab[adj.nbr[s]]; if (u !== lab[v]) c.set(u, (c.get(u) || 0) + 1); } let b = lab[v], bc = 0; for (const [u, n] of c) if (n > bc) { bc = n; b = u; } for (const a of members) lab[a] = b; }
    nc++;
  }
  return lab;
}
/** régions de fond de sillon (VEP « …-sulcus », STS, ITS…) que la surface du gabarit moyen n'atteint pas : sommets les
 *  plus proches (≤ 5 mm) des voxels de la région, pour que chaque région VEP reste visible et coloriable */
export function addMissing(pos, lab, vep, lo, hi) {
  const nv = lab.length, have = new Set(lab), added = [], cell = 4, key = (x, y, z) => ((Math.floor(x / cell) + 64) * 128 + Math.floor(y / cell) + 64) * 128 + Math.floor(z / cell) + 64, grid = new Map();
  for (let v = 0; v < nv; v++) { const k = key(pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(v); }
  const [nx, ny] = vep.dims, A = vep.affine, vox = new Map();
  for (let o = 0; o < vep.data.length; o++) { const l = vep.data[o]; if (l < lo || l > hi || have.has(l)) continue; let a = vox.get(l); if (!a) vox.set(l, a = []); a.push(o); }
  for (const [l, list] of vox) {
    const hit = new Set();
    for (const o of list) {
      const i = o % nx, j = ((o / nx) | 0) % ny, k = (o / (nx * ny)) | 0, x = A[0] * i + A[1] * j + A[2] * k + A[3], y = A[4] * i + A[5] * j + A[6] * k + A[7], z = A[8] * i + A[9] * j + A[10] * k + A[11];
      let best = -1, bd = 25; for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) { const a = grid.get(key(x + dx * cell, y + dy * cell, z + dz * cell)); if (a) for (const v of a) { const d = (pos[3 * v] - x) ** 2 + (pos[3 * v + 1] - y) ** 2 + (pos[3 * v + 2] - z) ** 2; if (d < bd) { bd = d; best = v; } } }
      if (best >= 0) hit.add(best);
    }
    for (const v of hit) lab[v] = l; added.push([l, hit.size]);
  }
  return added;
}
