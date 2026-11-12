/* EpiScope — nifti.js : lecture / écriture NIfTI-1 (.nii, .nii.gz) et outils de volume, sans dépendance.
 *
 * Conventions partagées par tous les modules d'imagerie (coregistration, segmentation, surfaces, électrodes) :
 *   - un volume est { dims:[nx,ny,nz], pixdim:[dx,dy,dz], data: TypedArray (x le plus rapide : idx = i + nx*(j + ny*k)),
 *     slope, inter (valeur = data*slope + inter), affine: Float64Array(16) ligne par ligne, voxel (i,j,k,1) → monde RAS mm,
 *     datatype (code NIfTI), descrip }
 *   - les matrices 4×4 sont des Float64Array(16) rangées par lignes (M[4*r + c]) ; un point se transforme par SV.Mat4.apply
 *   - le « monde » est le RAS scanner du patient (mm) ; une transformation de coregistration est une matrice monde → monde
 *     (image mobile → image de référence).
 * Fonctionne dans le navigateur (DecompressionStream / CompressionStream) et sous Node ≥ 18 (mêmes API globales).    */
(function (factory) {
  const G = typeof window !== 'undefined' ? (window.SV = window.SV || {}) : (globalThis.SV = globalThis.SV || {});
  factory(G); (G._factories = G._factories || {}).nifti = factory;   // fabrique réutilisée dans les workers (voir work.js)
})(function (SV) {
  'use strict';

  // ---------------------------------------------------------------- matrices 4×4 (lignes)
  const Mat4 = {
    identity() { const m = new Float64Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
    from(a) { const m = new Float64Array(16); for (let i = 0; i < 16; i++) m[i] = +a[i] || 0; if (a.length === 12) m[15] = 1; return m; },
    mul(A, B) { const C = new Float64Array(16); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { let s = 0; for (let k = 0; k < 4; k++) s += A[4 * r + k] * B[4 * k + c]; C[4 * r + c] = s; } return C; },
    apply(M, x, y, z) { return [M[0] * x + M[1] * y + M[2] * z + M[3], M[4] * x + M[5] * y + M[6] * z + M[7], M[8] * x + M[9] * y + M[10] * z + M[11]]; },
    applyDir(M, x, y, z) { return [M[0] * x + M[1] * y + M[2] * z, M[4] * x + M[5] * y + M[6] * z, M[8] * x + M[9] * y + M[10] * z]; },
    inv(M) {
      const m = M, inv = new Float64Array(16);
      inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
      inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
      inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
      inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
      inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
      inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
      inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
      inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
      inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
      inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
      inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
      inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
      inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
      inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
      inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
      inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];
      let det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12]; if (!det) return Mat4.identity(); det = 1 / det;
      for (let i = 0; i < 16; i++) inv[i] *= det; return inv;
    },
    /** rigide (6 paramètres : tx, ty, tz en mm ; rx, ry, rz en radians, rotations autour d'un centre c) → matrice */
    rigid(p, c) {
      const [tx, ty, tz, rx, ry, rz] = p, cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
      // R = Rz · Ry · Rx
      const R = [cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx, sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx, -sy, cy * sx, cy * cx];
      const C = c || [0, 0, 0], m = new Float64Array(16);
      m[0] = R[0]; m[1] = R[1]; m[2] = R[2]; m[4] = R[3]; m[5] = R[4]; m[6] = R[5]; m[8] = R[6]; m[9] = R[7]; m[10] = R[8]; m[15] = 1;
      // x' = R (x − c) + c + t
      m[3] = C[0] + tx - (R[0] * C[0] + R[1] * C[1] + R[2] * C[2]);
      m[7] = C[1] + ty - (R[3] * C[0] + R[4] * C[1] + R[5] * C[2]);
      m[11] = C[2] + tz - (R[6] * C[0] + R[7] * C[1] + R[8] * C[2]);
      return m;
    },
    toArray(M) { return Array.from(M, v => Math.round(v * 1e6) / 1e6); },
  };

  // ---------------------------------------------------------------- compression (gzip)
  const isGz = u8 => u8.length > 2 && u8[0] === 0x1f && u8[1] === 0x8b;
  async function streamAll(stream) {
    const reader = stream.getReader(), parts = []; let n = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); n += value.length; }
    const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out;
  }
  async function gunzip(u8) { return streamAll(new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'))); }
  async function gzip(u8) { return streamAll(new Blob([u8]).stream().pipeThrough(new CompressionStream('gzip'))); }
  async function toU8(input) {
    if (input instanceof Uint8Array) return input;
    if (input instanceof ArrayBuffer) return new Uint8Array(input);
    if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    if (input && typeof input.arrayBuffer === 'function') return new Uint8Array(await input.arrayBuffer());
    throw new Error('entrée NIfTI non reconnue');
  }

  // ---------------------------------------------------------------- NIfTI-1
  const DT = { 2: Uint8Array, 4: Int16Array, 8: Int32Array, 16: Float32Array, 64: Float64Array, 256: Int8Array, 512: Uint16Array, 768: Uint32Array };
  const DT_OF = t => t instanceof Uint8Array ? 2 : t instanceof Int16Array ? 4 : t instanceof Int32Array ? 8 : t instanceof Float32Array ? 16 : t instanceof Float64Array ? 64 : t instanceof Int8Array ? 256 : t instanceof Uint16Array ? 512 : t instanceof Uint32Array ? 768 : 16;

  function quatToMat(b, c, d, qx, qy, qz, dx, dy, dz, qfac) {
    let a = 1 - (b * b + c * c + d * d); if (a < 1e-7) { a = 1 / Math.hypot(b, c, d); b *= a; c *= a; d *= a; a = 0; } else a = Math.sqrt(a);
    const R = [a * a + b * b - c * c - d * d, 2 * (b * c - a * d), 2 * (b * d + a * c), 2 * (b * c + a * d), a * a + c * c - b * b - d * d, 2 * (c * d - a * b), 2 * (b * d - a * c), 2 * (c * d + a * b), a * a + d * d - c * c - b * b];
    const zs = qfac < 0 ? -1 : 1, m = new Float64Array(16);
    m[0] = R[0] * dx; m[1] = R[1] * dy; m[2] = R[2] * dz * zs; m[3] = qx;
    m[4] = R[3] * dx; m[5] = R[4] * dy; m[6] = R[5] * dz * zs; m[7] = qy;
    m[8] = R[6] * dx; m[9] = R[7] * dy; m[10] = R[8] * dz * zs; m[11] = qz; m[15] = 1;
    return m;
  }

  /** décode un fichier .nii (décompressé) ; ne garde que le premier volume d'une série 4D (option frame) */
  function parse(buf, opts) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); let le = true;
    let size = dv.getInt32(0, true);
    if (size !== 348 && size !== 540) { le = false; size = dv.getInt32(0, false); }
    if (size === 540) return parse2(u8, dv, le, opts);
    if (size !== 348) throw new Error('fichier NIfTI invalide (en-tête de ' + size + ' octets)');
    const i16 = o => dv.getInt16(o, le), f32 = o => dv.getFloat32(o, le);
    const ndim = i16(40), dims = [i16(42), i16(44), i16(46)].map((d, k) => k < ndim ? Math.max(1, d) : 1), nt = ndim >= 4 ? Math.max(1, i16(48)) : 1;
    const datatype = i16(70), pixdim = [f32(80), f32(84), f32(88)].map(Math.abs).map(v => v || 1), qfac = f32(76) < 0 ? -1 : 1;
    const voxOffset = Math.max(352, Math.round(f32(108))), slope0 = f32(112), inter = f32(116);
    const qform = i16(252), sform = i16(254);
    let descrip = ''; for (let i = 148; i < 228 && u8[i]; i++) descrip += String.fromCharCode(u8[i]);
    let affine;
    if (sform > 0) { affine = new Float64Array(16); for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) affine[4 * r + c] = f32(280 + 16 * r + 4 * c); affine[15] = 1; }
    else if (qform > 0) affine = quatToMat(f32(256), f32(260), f32(264), f32(268), f32(272), f32(276), pixdim[0], pixdim[1], pixdim[2], qfac);
    else { affine = Mat4.identity(); affine[0] = -pixdim[0]; affine[5] = pixdim[1]; affine[10] = pixdim[2]; affine[3] = (dims[0] - 1) / 2 * pixdim[0]; affine[7] = -(dims[1] - 1) / 2 * pixdim[1]; affine[11] = -(dims[2] - 1) / 2 * pixdim[2]; }
    return finish(u8, le, { dims, pixdim, datatype, voxOffset, slope: slope0 && isFinite(slope0) ? slope0 : 1, inter: isFinite(inter) ? inter : 0, affine, descrip, nt, qform, sform }, opts);
  }
  function parse2(u8, dv, le, opts) {
    const i64 = o => Number(dv.getBigInt64(o, le)), f64 = o => dv.getFloat64(o, le), i16 = o => dv.getInt16(o, le), i32 = o => dv.getInt32(o, le);
    const ndim = i64(16), dims = [i64(24), i64(32), i64(40)].map((d, k) => k < ndim ? Math.max(1, d) : 1), nt = ndim >= 4 ? Math.max(1, i64(48)) : 1;
    const datatype = i16(12), pixdim = [f64(112), f64(120), f64(128)].map(Math.abs).map(v => v || 1), qfac = f64(104) < 0 ? -1 : 1;
    const voxOffset = i64(168), slope0 = f64(176), inter = f64(184), qform = i32(344), sform = i32(348);
    let affine;
    if (sform > 0) { affine = new Float64Array(16); for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) affine[4 * r + c] = f64(400 + 32 * r + 8 * c); affine[15] = 1; }
    else affine = quatToMat(f64(352), f64(360), f64(368), f64(376), f64(384), f64(392), pixdim[0], pixdim[1], pixdim[2], qfac);
    return finish(u8, le, { dims, pixdim, datatype, voxOffset, slope: slope0 || 1, inter: inter || 0, affine, descrip: '', nt, qform, sform }, opts);
  }
  function finish(u8, le, h, opts) {
    const T = DT[h.datatype]; if (!T) throw new Error('type de données NIfTI non pris en charge : ' + h.datatype);
    const n = h.dims[0] * h.dims[1] * h.dims[2], bpv = T.BYTES_PER_ELEMENT, frame = Math.min(h.nt - 1, (opts && opts.frame) || 0);
    const off = h.voxOffset + frame * n * bpv;
    if (off + n * bpv > u8.byteLength) throw new Error('fichier NIfTI tronqué');
    const raw = Uint8Array.prototype.slice.call(u8, off, off + n * bpv);   // copie alignée (Buffer.slice de Node renverrait une vue)
    let data = new T(raw.buffer);
    if (!le && bpv > 1) { const dv = new DataView(raw.buffer), out = new T(n); for (let i = 0; i < n; i++) { const o = i * bpv; out[i] = bpv === 2 ? (T === Uint16Array ? dv.getUint16(o, false) : dv.getInt16(o, false)) : bpv === 4 ? (T === Float32Array ? dv.getFloat32(o, false) : T === Uint32Array ? dv.getUint32(o, false) : dv.getInt32(o, false)) : dv.getFloat64(o, false); } data = out; }
    return { dims: h.dims, pixdim: h.pixdim, data, slope: h.slope, inter: h.inter, affine: h.affine, datatype: h.datatype, descrip: h.descrip, nt: h.nt };
  }

  /** lit un .nii ou .nii.gz (ArrayBuffer, Uint8Array ou Blob/File) */
  async function read(input, opts) { let u8 = await toU8(input); if (isGz(u8)) u8 = await gunzip(u8); return parse(u8, opts); }

  /** encode un volume en .nii (Uint8Array) ; data : TypedArray (le type NIfTI en découle) */
  function encode(vol) {
    const data = vol.data, dt = vol.datatype && DT[vol.datatype] && data instanceof DT[vol.datatype] ? vol.datatype : DT_OF(data), bpv = DT[dt].BYTES_PER_ELEMENT;
    const n = vol.dims[0] * vol.dims[1] * vol.dims[2], out = new Uint8Array(352 + n * bpv), dv = new DataView(out.buffer);
    const A = vol.affine || Mat4.identity(), pix = vol.pixdim || [Math.hypot(A[0], A[4], A[8]), Math.hypot(A[1], A[5], A[9]), Math.hypot(A[2], A[6], A[10])];
    dv.setInt32(0, 348, true);
    dv.setInt16(40, 3, true); dv.setInt16(42, vol.dims[0], true); dv.setInt16(44, vol.dims[1], true); dv.setInt16(46, vol.dims[2], true); dv.setInt16(48, 1, true); dv.setInt16(50, 1, true); dv.setInt16(52, 1, true); dv.setInt16(54, 1, true);
    dv.setInt16(70, dt, true); dv.setInt16(72, bpv * 8, true);
    dv.setFloat32(76, 1, true); dv.setFloat32(80, pix[0], true); dv.setFloat32(84, pix[1], true); dv.setFloat32(88, pix[2], true);
    dv.setFloat32(108, 352, true); dv.setFloat32(112, vol.slope == null ? 1 : vol.slope, true); dv.setFloat32(116, vol.inter || 0, true);
    dv.setUint8(123, 10);   // xyzt_units : mm, s
    const d = (vol.descrip || 'EpiScope').slice(0, 79); for (let i = 0; i < d.length; i++) out[148 + i] = d.charCodeAt(i) & 0x7f;
    dv.setInt16(252, 0, true); dv.setInt16(254, 2, true);   // sform aligné sur une référence
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) dv.setFloat32(280 + 16 * r + 4 * c, A[4 * r + c], true);
    out[344] = 0x6E; out[345] = 0x2B; out[346] = 0x31; out[347] = 0;   // "n+1"
    out.set(new Uint8Array(data.buffer, data.byteOffset, n * bpv), 352);
    return out;
  }
  async function encodeGz(vol) { return gzip(encode(vol)); }

  // ---------------------------------------------------------------- outils de volume
  const Vol = {
    create(dims, affine, Type, extra) { return Object.assign({ dims: dims.slice(), pixdim: [Math.hypot(affine[0], affine[4], affine[8]), Math.hypot(affine[1], affine[5], affine[9]), Math.hypot(affine[2], affine[6], affine[10])], data: new (Type || Float32Array)(dims[0] * dims[1] * dims[2]), slope: 1, inter: 0, affine: Mat4.from(affine) }, extra || {}); },
    value(vol, idx) { return vol.data[idx] * vol.slope + vol.inter; },
    /** voxel (continu) d'un point monde */
    worldToVox(vol) { return vol._w2v || (vol._w2v = Mat4.inv(vol.affine)); },
    /** interpolation trilinéaire en coordonnées voxel (valeur mise à l'échelle) ; hors champ → outside (0 par défaut) */
    sampleVox(vol, x, y, z, outside) {
      const [nx, ny, nz] = vol.dims; if (x < 0 || y < 0 || z < 0 || x > nx - 1 || y > ny - 1 || z > nz - 1) return outside == null ? 0 : outside;
      const x0 = Math.min(nx - 2, Math.floor(x)), y0 = Math.min(ny - 2, Math.floor(y)), z0 = Math.min(nz - 2, Math.floor(z));
      const fx = x - x0, fy = y - y0, fz = z - z0, d = vol.data, sxy = nx * ny, i = x0 + nx * (y0 + ny * z0);
      if (nx < 2 || ny < 2 || nz < 2) return d[Math.round(x) + nx * (Math.round(y) + ny * Math.round(z))] * vol.slope + vol.inter;
      const v = (d[i] * (1 - fx) + d[i + 1] * fx) * (1 - fy) * (1 - fz) + (d[i + nx] * (1 - fx) + d[i + nx + 1] * fx) * fy * (1 - fz) +
        (d[i + sxy] * (1 - fx) + d[i + sxy + 1] * fx) * (1 - fy) * fz + (d[i + sxy + nx] * (1 - fx) + d[i + sxy + nx + 1] * fx) * fy * fz;
      return v * vol.slope + vol.inter;
    },
    nearestVox(vol, x, y, z) { const [nx, ny, nz] = vol.dims, i = Math.round(x), j = Math.round(y), k = Math.round(z); if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return 0; return vol.data[i + nx * (j + ny * k)]; },
    sampleWorld(vol, p, outside) { const v = Mat4.apply(Vol.worldToVox(vol), p[0], p[1], p[2]); return Vol.sampleVox(vol, v[0], v[1], v[2], outside); },
    labelWorld(vol, p) { const v = Mat4.apply(Vol.worldToVox(vol), p[0], p[1], p[2]); return Vol.nearestVox(vol, v[0], v[1], v[2]); },
    /** rééchantillonne `src` sur la grille de `ref` ; T = transformation monde src → monde ref (identité si absente) ;
     *  mode 'linear' | 'nearest' ; Type de sortie (Float32Array par défaut, ou celui de src en nearest) */
    resample(src, ref, T, mode, Type) {
      const near = mode === 'nearest', out = Vol.create(ref.dims, ref.affine, Type || (near ? src.data.constructor : Float32Array));
      // voxel ref → monde ref → monde src (T⁻¹) → voxel src
      const M = Mat4.mul(Vol.worldToVox(src), Mat4.mul(T ? Mat4.inv(T) : Mat4.identity(), ref.affine));
      const [nx, ny, nz] = ref.dims, d = out.data; let o = 0;
      for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) {
        let x = M[1] * j + M[2] * k + M[3], y = M[5] * j + M[6] * k + M[7], z = M[9] * j + M[10] * k + M[11];
        for (let i = 0; i < nx; i++, o++, x += M[0], y += M[4], z += M[8]) d[o] = near ? Vol.nearestVox(src, x, y, z) : Vol.sampleVox(src, x, y, z, 0);
      }
      if (near) { out.slope = src.slope; out.inter = src.inter; }
      return out;
    },
    /** quantiles approchés (histogramme) des valeurs mises à l'échelle ; mask optionnel (fonction idx → bool) */
    quantiles(vol, qs, step) {
      const d = vol.data, s = vol.slope, b = vol.inter, st = step || Math.max(1, Math.floor(d.length / 2e6));
      let lo = Infinity, hi = -Infinity; for (let i = 0; i < d.length; i += st) { const v = d[i] * s + b; if (v < lo) lo = v; if (v > hi) hi = v; }
      if (!(hi > lo)) return qs.map(() => lo);
      const H = new Float64Array(4096), w = 4095 / (hi - lo); let n = 0;
      for (let i = 0; i < d.length; i += st) { H[Math.floor((d[i] * s + b - lo) * w)]++; n++; }
      const out = []; for (const q of qs) { let c = 0, k = 0; const t = q * n; for (; k < 4096; k++) { c += H[k]; if (c >= t) break; } out.push(lo + k / w); }
      return out;
    },
    /** centre (monde) du champ de vue */
    center(vol) { return Mat4.apply(vol.affine, (vol.dims[0] - 1) / 2, (vol.dims[1] - 1) / 2, (vol.dims[2] - 1) / 2); },
    /** axes de l'image les plus proches de R, A, S (pour l'affichage en coupes) : [axeVoxel pour x, y, z] et signes */
    orientation(vol) {
      const A = vol.affine, cols = [0, 1, 2].map(c => [A[c], A[4 + c], A[8 + c]]), used = new Set(), axis = [0, 0, 0], sign = [1, 1, 1];
      for (const w of [0, 1, 2]) { let best = -1, bv = -1; for (let c = 0; c < 3; c++) { if (used.has(c)) continue; const v = Math.abs(cols[c][w]) / Math.hypot(...cols[c]); if (v > bv) { bv = v; best = c; } } used.add(best); axis[w] = best; sign[w] = cols[best][w] >= 0 ? 1 : -1; }
      return { axis, sign };
    },
  };

  SV.Mat4 = Mat4; SV.Vol = Vol;
  SV.Nifti = { parse, read, encode, encodeGz, gunzip, gzip, isGz, toU8, DT };
});
