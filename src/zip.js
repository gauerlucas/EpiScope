/* EpiScope — zip.js : archives ZIP (lecture / écriture) sans dépendance, pour le dossier patient portable (.episcope).
 *   SV.Zip.write([{ name, data: Uint8Array | string | Blob, store?: bool, date?: Date }]) → Promise<Blob>
 *   SV.Zip.read(Blob | ArrayBuffer | Uint8Array) → Promise<{ names: [...], has(n), bytes(n) → Uint8Array, text(n) → string, size(n) }>
 * Compression « deflate » par CompressionStream('deflate-raw') ; les fichiers déjà compressés (.gz, .png, .jpg, .webp,
 * .zip) sont stockés tels quels. Pas de ZIP64 (archives < 4 Go), noms en UTF-8 (drapeau 0x0800). */
(function (factory) {
  const G = typeof window !== 'undefined' ? (window.SV = window.SV || {}) : (globalThis.SV = globalThis.SV || {});
  factory(G); (G._factories = G._factories || {}).zip = factory;
})(function (SV) {
  'use strict';
  const enc = new TextEncoder(), dec = new TextDecoder();
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  async function pipe(u8, stream) {
    const r = new Blob([u8]).stream().pipeThrough(stream).getReader(), parts = []; let n = 0;
    for (;;) { const { done, value } = await r.read(); if (done) break; parts.push(value); n += value.length; }
    const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out;
  }
  const deflate = u8 => pipe(u8, new CompressionStream('deflate-raw'));
  const inflate = u8 => pipe(u8, new DecompressionStream('deflate-raw'));
  const STORED = /\.(gz|png|jpe?g|webp|zip|episcope|woff2?)$/i;
  function dosTime(d) { return ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF; }
  function dosDate(d) { return (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF; }

  async function write(files) {
    const chunks = [], central = []; let offset = 0;
    for (const f of files) {
      let data = f.data;
      if (typeof data === 'string') data = enc.encode(data);
      else if (data && typeof data.arrayBuffer === 'function' && !(data instanceof Uint8Array)) data = new Uint8Array(await data.arrayBuffer());
      else if (data instanceof ArrayBuffer) data = new Uint8Array(data);
      const name = enc.encode(f.name.replace(/\\/g, '/')), crc = crc32(data), store = f.store || STORED.test(f.name) || data.length < 64;
      const comp = store ? data : await deflate(data), method = store ? 0 : 8, d = f.date || new Date();
      const lh = new Uint8Array(30 + name.length), lv = new DataView(lh.buffer);
      lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, method, true);
      lv.setUint16(10, dosTime(d), true); lv.setUint16(12, dosDate(d), true); lv.setUint32(14, crc, true); lv.setUint32(18, comp.length, true); lv.setUint32(22, data.length, true);
      lv.setUint16(26, name.length, true); lv.setUint16(28, 0, true); lh.set(name, 30);
      chunks.push(lh, comp);
      const ch = new Uint8Array(46 + name.length), cv = new DataView(ch.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, method, true);
      cv.setUint16(12, dosTime(d), true); cv.setUint16(14, dosDate(d), true); cv.setUint32(16, crc, true); cv.setUint32(20, comp.length, true); cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true); ch.set(name, 46);
      central.push(ch); offset += lh.length + comp.length;
    }
    const cdSize = central.reduce((s, c) => s + c.length, 0), eocd = new Uint8Array(22), ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, central.length, true); ev.setUint16(10, central.length, true); ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
    return new Blob([...chunks, ...central, eocd], { type: 'application/zip' });
  }

  async function read(input) {
    const u8 = input instanceof Uint8Array ? input : input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(await input.arrayBuffer());
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), n = u8.length;
    let eocd = -1; for (let i = n - 22; i >= Math.max(0, n - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('archive ZIP invalide');
    const count = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
    const entries = new Map();
    for (let k = 0; k < count; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('répertoire ZIP corrompu');
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), loff = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen)); p += 46 + nlen + xlen + clen;
      if (name.endsWith('/')) continue;
      entries.set(name, { method, csize, usize, loff });
    }
    const bytes = async name => {
      const e = entries.get(name); if (!e) return null;
      const l = e.loff, start = l + 30 + dv.getUint16(l + 26, true) + dv.getUint16(l + 28, true), raw = u8.subarray(start, start + e.csize);
      if (e.method === 0) return raw.slice();
      if (e.method === 8) return inflate(raw);
      throw new Error('méthode de compression ZIP non prise en charge (' + e.method + ')');
    };
    return { names: [...entries.keys()], has: n2 => entries.has(n2), size: n2 => (entries.get(n2) || {}).usize || 0, bytes, text: async n2 => { const b = await bytes(n2); return b ? dec.decode(b) : null; } };
  }

  SV.Zip = { write, read, crc32 };
});
