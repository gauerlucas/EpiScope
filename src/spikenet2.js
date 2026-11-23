/* EpiScope — spikenet2.js (v2.1.0) : SpikeNet2 (Li J et al., NEJM AI 2025 ; github.com/bdsp-core/SpikeNet2, code CC BY-NC 4.0)
 * pour la détection des pointes de l'EEG de scalp, à côté de SpikeNet1 (spikenet.js).
 *
 * Les poids ne sont PAS livrés avec EpiScope : la BDSP (bdsp.io) les distribue à des utilisateurs accrédités, sous une licence
 * restreinte. Un utilisateur qui les détient choisit son point de contrôle (« new_weights.ckpt », PyTorch Lightning) ; ce
 * module le lit dans le navigateur, sans Python : archive zip de torch.save (fichiers non compressés), petit lecteur de
 * pickle (protocoles 2 à 4) qui ne fabrique aucun objet Python, puis lecture des seuls tenseurs du réseau (l'état de
 * l'optimiseur est ignoré). Le réseau est rangé sous une forme compacte (« EPSN2 » : normalisations par lot réduites à une
 * échelle et un biais par voie) dans la bibliothèque de l'utilisateur, jamais dans un dossier patient ni dans un export.
 *
 * Réseau (sleeplib/Resnet_15 : Net1D de S. Hong, réécrit ici d'après sa description) : 37 voies × 128 échantillons (1 s à
 * 128 Hz) → convolution 16 pas 2 → 7 étages de blocs résiduels pré-activés (normalisation, Swish, conv 1, conv 16 groupée,
 * conv 1, compression-excitation), le premier bloc de chaque étage au pas 2 (raccourci : max-pool « same », voies
 * complétées par des zéros) → moyenne temporelle → couche dense → sigmoïde. Les tailles (voies, groupes, blocs) sont lues
 * dans le point de contrôle ; le pas (2) et la largeur des groupes sont ceux de l'article.
 *
 * Entrée, comme le code des auteurs (CDAC_combine_montage, extremes_remover, normalisation) : 18 voies en double banane
 * puis 19 en référence moyenne (Fp1 … O2), une voie dont l'amplitude crête à crête sort de [20, 2000] µV dans la fenêtre est
 * mise à zéro, chaque voie est divisée par le 95e centile de sa valeur absolue. Le dépôt ne publie pas le filtrage des
 * enregistrements d'apprentissage : on reprend celui de SpikeNet1 (même équipe, même base : passe-haut 0,5 Hz et coupe-bande
 * du secteur à 128 Hz, spikenet.js : prep). Fonctions utilisables dans un worker (SV._factories.spikenet2).          */
(function (factory) {
  const G = typeof window !== 'undefined' ? (window.SV = window.SV || {}) : (globalThis.SV = globalThis.SV || {});
  factory(G); (G._factories = G._factories || {}).spikenet2 = factory;
})(function (SV) {
  'use strict';
  const FS = 128, W = 128, MAGIC = 'EPSN2', BN_EPS = 1e-5, STRIDE = 2;
  const MONO = ['Fp1', 'F3', 'C3', 'P3', 'F7', 'T3', 'T5', 'O1', 'Fz', 'Cz', 'Pz', 'Fp2', 'F4', 'C4', 'P4', 'F8', 'T4', 'T6', 'O2'];
  const BIP = ['Fp1-F7', 'F7-T3', 'T3-T5', 'T5-O1', 'Fp2-F8', 'F8-T4', 'T4-T6', 'T6-O2', 'Fp1-F3', 'F3-C3', 'C3-P3', 'P3-O1', 'Fp2-F4', 'F4-C4', 'C4-P4', 'P4-O2', 'Fz-Cz', 'Cz-Pz'];
  const BIPI = BIP.map(p => p.split('-').map(e => MONO.indexOf(e)));
  const dec = new TextDecoder('utf-8');

  // ------------------------------------------------------------------ archive zip (torch.save)
  /** src = { size, read(off, len) → Promise<Uint8Array> } ; File/Blob du navigateur ou tampon (Node, tests) */
  function source(x) {
    if (typeof Blob !== 'undefined' && x instanceof Blob) return { size: x.size, read: async (o, n) => new Uint8Array(await x.slice(o, o + n).arrayBuffer()) };
    const u = x instanceof ArrayBuffer ? new Uint8Array(x) : new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
    return { size: u.length, read: async (o, n) => u.subarray(o, o + n) };
  }
  const u16 = (b, o) => b[o] | (b[o + 1] << 8), u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 16777216;
  const u64 = (b, o) => u32(b, o) + u32(b, o + 4) * 4294967296;
  /** entrées de l'archive : nom → { lo (en-tête local), size, method } ; les en-têtes locaux sont lus avec les données
   *  (readSpan : une seule lecture pour un ensemble d'entrées voisines — chaque lecture asynchrone coûte cher dans une page occupée) */
  async function zipEntries(src) {
    const tail = Math.min(src.size, 65557 + 20), T = await src.read(src.size - tail, tail); let e = -1;
    for (let i = T.length - 22; i >= 0; i--) if (u32(T, i) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('ce fichier n’est pas un point de contrôle PyTorch (archive zip introuvable)');
    let n = u16(T, e + 10), cdSize = u32(T, e + 12), cdOff = u32(T, e + 16);
    if (cdOff === 0xffffffff || n === 0xffff) {                                      // zip64
      const l = e - 20; if (l < 0 || u32(T, l) !== 0x07064b50) throw new Error('archive zip64 illisible');
      const R = await src.read(u64(T, l + 8), 56); n = u64(R, 32); cdSize = u64(R, 40); cdOff = u64(R, 48);
    }
    const C = await src.read(cdOff, cdSize), out = new Map(); let p = 0;
    for (let k = 0; k < n; k++) {
      if (u32(C, p) !== 0x02014b50) throw new Error('répertoire de l’archive illisible');
      const method = u16(C, p + 10), nl = u16(C, p + 28), xl = u16(C, p + 30), cl = u16(C, p + 32); let size = u32(C, p + 24), csize = u32(C, p + 20), lo = u32(C, p + 42);
      const name = dec.decode(C.subarray(p + 46, p + 46 + nl));
      for (let x = p + 46 + nl, xe = x + xl; x + 4 <= xe;) {                         // champ zip64 du répertoire
        const id = u16(C, x), len = u16(C, x + 2); let q = x + 4;
        if (id === 1) { if (size === 0xffffffff) { size = u64(C, q); q += 8; } if (csize === 0xffffffff) { csize = u64(C, q); q += 8; } if (lo === 0xffffffff) lo = u64(C, q); }
        x += 4 + len;
      }
      out.set(name, { lo, size, csize, method }); p += 46 + nl + xl + cl;
    }
    return out;
  }
  /** données de plusieurs entrées en une lecture de [premier en-tête, fin de la dernière] → nom → Uint8Array */
  async function readSpan(src, Z, names) {
    const E = names.map(n => [n, Z.get(n)]).filter(([, z]) => z); if (!E.length) return new Map();
    const a = Math.min(...E.map(([, z]) => z.lo)), b = Math.min(src.size, Math.max(...E.map(([, z]) => z.lo + 30 + 65535 * 2 + z.size))), buf = await src.read(a, b - a), out = new Map();
    for (const [n, z] of E) { const h = z.lo - a, off = h + 30 + u16(buf, h + 26) + u16(buf, h + 28); if (u32(buf, h) !== 0x04034b50) throw new Error('archive illisible (en-tête local de ' + n + ')'); out.set(n, buf.subarray(off, off + z.size)); }
    return out;
  }

  // ------------------------------------------------------------------ pickle (sans exécution)
  class PyObj { constructor(cls, args) { this.cls = cls; this.args = args || []; this.dict = {}; this.state = null; } }
  const STORAGE = { FloatStorage: 'f32', HalfStorage: 'f16', BFloat16Storage: 'bf16', DoubleStorage: 'f64', LongStorage: 'i64', IntStorage: 'i32', ShortStorage: 'i16', CharStorage: 'i8', ByteStorage: 'u8', BoolStorage: 'bool' };
  /** pickle → valeurs JS : dictionnaires = objets, tenseurs = { tensor: true, storage: { dtype, key, numel }, offset, shape, stride } ;
   *  toute autre classe devient un PyObj inerte (rien n'est exécuté) */
  function unpickle(b) {
    const st = [], marks = [], memo = new Map(), dv = new DataView(b.buffer, b.byteOffset, b.byteLength); let p = 0;
    const popMark = () => { const m = marks.pop(); return st.splice(m); };
    const str = n => { const s = dec.decode(b.subarray(p, p + n)); p += n; return s; };
    const setItem = (o, k, v) => { if (o instanceof PyObj) o.dict[k] = v; else if (o && typeof o === 'object') o[k] = v; };
    const call = (f, a) => {
      const g = f && f.global;
      if (g === 'collections.OrderedDict' || g === 'builtins.dict' || g === '__builtin__.dict') return {};
      if (g === 'torch._utils._rebuild_tensor_v2' || g === 'torch._utils._rebuild_tensor') return { tensor: true, storage: a[0], offset: a[1], shape: a[2], stride: a[3] };
      if (g === 'torch._utils._rebuild_parameter' || g === 'torch._utils._rebuild_parameter_with_state') return a[0];
      if (g === 'builtins.set' || g === '__builtin__.set' || g === 'builtins.frozenset') return a[0] || [];
      return new PyObj(g || 'objet', a);
    };
    for (;;) {
      if (p >= b.length) throw new Error('pickle tronqué');
      const op = b[p++];
      switch (op) {
        case 0x80: p++; break;                                                       // PROTO
        case 0x95: p += 8; break;                                                    // FRAME
        case 0x2e: return st.pop();                                                  // STOP
        case 0x28: marks.push(st.length); break;                                     // MARK
        case 0x7d: st.push({}); break;                                               // EMPTY_DICT
        case 0x5d: st.push([]); break;                                               // EMPTY_LIST
        case 0x29: st.push([]); break;                                               // EMPTY_TUPLE
        case 0x8f: st.push([]); break;                                               // EMPTY_SET
        case 0x4e: st.push(null); break;                                             // NONE
        case 0x88: st.push(true); break; case 0x89: st.push(false); break;           // NEWTRUE / NEWFALSE
        case 0x4b: st.push(b[p++]); break;                                           // BININT1
        case 0x4d: st.push(u16(b, p)); p += 2; break;                                // BININT2
        case 0x4a: st.push(dv.getInt32(p, true)); p += 4; break;                     // BININT
        case 0x8a: { const n = b[p++]; let v = 0n; for (let i = n - 1; i >= 0; i--) v = (v << 8n) | BigInt(b[p + i]); if (n && b[p + n - 1] & 0x80) v -= 1n << BigInt(8 * n); p += n; st.push(Number(v)); break; }   // LONG1
        case 0x8b: { const n = dv.getUint32(p, true); p += 4; let v = 0n; for (let i = n - 1; i >= 0; i--) v = (v << 8n) | BigInt(b[p + i]); if (n && b[p + n - 1] & 0x80) v -= 1n << BigInt(8 * n); p += n; st.push(Number(v)); break; }   // LONG4
        case 0x47: st.push(dv.getFloat64(p, false)); p += 8; break;                  // BINFLOAT
        case 0x58: { const n = dv.getUint32(p, true); p += 4; st.push(str(n)); break; }   // BINUNICODE
        case 0x8c: { const n = b[p++]; st.push(str(n)); break; }                     // SHORT_BINUNICODE
        case 0x8d: { const n = Number(dv.getBigUint64(p, true)); p += 8; st.push(str(n)); break; }   // BINUNICODE8
        case 0x54: { const n = dv.getInt32(p, true); p += 4; st.push(str(n)); break; }   // BINSTRING
        case 0x55: { const n = b[p++]; st.push(str(n)); break; }                     // SHORT_BINSTRING
        case 0x42: { const n = dv.getUint32(p, true); p += 4; st.push(b.slice(p, p + n)); p += n; break; }   // BINBYTES
        case 0x43: { const n = b[p++]; st.push(b.slice(p, p + n)); p += n; break; }  // SHORT_BINBYTES
        case 0x8e: { const n = Number(dv.getBigUint64(p, true)); p += 8; st.push(b.slice(p, p + n)); p += n; break; }   // BINBYTES8
        case 0x74: st.push(popMark()); break;                                        // TUPLE
        case 0x85: st.push([st.pop()]); break;                                       // TUPLE1
        case 0x86: { const y = st.pop(), x = st.pop(); st.push([x, y]); break; }     // TUPLE2
        case 0x87: { const z = st.pop(), y = st.pop(), x = st.pop(); st.push([x, y, z]); break; }   // TUPLE3
        case 0x6c: st.push(popMark()); break;                                        // LIST
        case 0x64: { const a = popMark(), o = {}; for (let i = 0; i + 1 < a.length; i += 2) o[a[i]] = a[i + 1]; st.push(o); break; }   // DICT
        case 0x71: memo.set(b[p++], st[st.length - 1]); break;                       // BINPUT
        case 0x72: memo.set(dv.getUint32(p, true), st[st.length - 1]); p += 4; break;   // LONG_BINPUT
        case 0x94: memo.set(memo.size, st[st.length - 1]); break;                    // MEMOIZE
        case 0x68: st.push(memo.get(b[p++])); break;                                 // BINGET
        case 0x6a: st.push(memo.get(dv.getUint32(p, true))); p += 4; break;          // LONG_BINGET
        case 0x73: { const v = st.pop(), k = st.pop(); setItem(st[st.length - 1], k, v); break; }   // SETITEM
        case 0x75: { const a = popMark(), o = st[st.length - 1]; for (let i = 0; i + 1 < a.length; i += 2) setItem(o, a[i], a[i + 1]); break; }   // SETITEMS
        case 0x61: { const v = st.pop(), o = st[st.length - 1]; if (Array.isArray(o)) o.push(v); break; }   // APPEND
        case 0x65: { const a = popMark(), o = st[st.length - 1]; if (Array.isArray(o)) o.push(...a); break; }   // APPENDS
        case 0x90: { const a = popMark(), o = st[st.length - 1]; if (Array.isArray(o)) o.push(...a); break; }   // ADDITEMS
        case 0x91: st.push(popMark()); break;                                        // FROZENSET
        case 0x63: {                                                                  // GLOBAL « module\nnom\n »
          let e = b.indexOf(10, p); const m = str(e - p); p++; e = b.indexOf(10, p); const n = str(e - p); p++; st.push({ global: m + '.' + n }); break;
        }
        case 0x93: { const n = st.pop(), m = st.pop(); st.push({ global: m + '.' + n }); break; }   // STACK_GLOBAL
        case 0x52: { const a = st.pop(), f = st.pop(); st.push(call(f, a)); break; } // REDUCE
        case 0x81: { const a = st.pop(), c = st.pop(); st.push(call(c, a)); break; } // NEWOBJ
        case 0x92: { st.pop(); const a = st.pop(), c = st.pop(); st.push(call(c, a)); break; }   // NEWOBJ_EX
        case 0x62: { const s = st.pop(), o = st[st.length - 1]; if (o instanceof PyObj) o.state = s; else if (o && typeof o === 'object' && s && typeof s === 'object' && !Array.isArray(s)) Object.assign(o, s); break; }   // BUILD
        case 0x51: {                                                                  // BINPERSID : stockage d'un tenseur
          const pid = st.pop(), g = pid && pid[1] && pid[1].global ? pid[1].global.split('.').pop() : '';
          st.push({ dtype: STORAGE[g] || (pid && pid[1] && pid[1].dtype) || g, key: String(pid[2]), numel: pid[4] }); break;
        }
        case 0x30: st.pop(); break;                                                  // POP
        case 0x31: popMark(); break;                                                 // POP_MARK
        case 0x32: st.push(st[st.length - 1]); break;                                // DUP
        default: throw new Error('point de contrôle illisible (pickle : code 0x' + op.toString(16) + ' à l’octet ' + (p - 1) + ')');
      }
    }
  }

  // ------------------------------------------------------------------ point de contrôle → réseau
  const half = h => { const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 31, f = h & 1023; return e === 0 ? s * f * 2 ** -24 : e === 31 ? (f ? NaN : s * Infinity) : s * (1 + f / 1024) * 2 ** (e - 15); };
  /** tenseur → Float32Array contiguë (pas quelconques acceptés) */
  function tensorData(raw, t) {
    const S = t.storage, bpe = { f32: 4, f16: 2, bf16: 2, f64: 8 }[S.dtype]; if (!bpe) throw new Error('type de tenseur non pris en charge : ' + S.dtype);
    const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength), shape = t.shape || [], n = shape.reduce((a, b) => a * b, 1), out = new Float32Array(n);
    const contig = []; for (let i = shape.length - 1, s = 1; i >= 0; i--) { contig[i] = s; s *= shape[i]; }
    const stride = t.stride || contig, idx = new Array(shape.length).fill(0);
    for (let k = 0; k < n; k++) {
      let e = t.offset || 0; for (let d = 0; d < shape.length; d++) e += idx[d] * stride[d];
      out[k] = S.dtype === 'f32' ? dv.getFloat32(e * 4, true) : S.dtype === 'f64' ? dv.getFloat64(e * 8, true) : S.dtype === 'f16' ? half(dv.getUint16(e * 2, true)) : new Float32Array(new Uint32Array([dv.getUint16(e * 2, true) << 16]).buffer)[0];
      for (let d = shape.length - 1; d >= 0; d--) { if (++idx[d] < shape[d]) break; idx[d] = 0; }
    }
    return out;
  }
  /** lit un point de contrôle (.ckpt Lightning ou state_dict torch.save) → { cfg, T: { nom → { shape, data } } } ; progress(f) */
  async function readCkpt(file, progress) {
    const src = source(file), Z = await zipEntries(src), pk = [...Z.keys()].find(k => /(^|\/)data\.pkl$/.test(k));
    if (!pk) throw new Error('ce fichier n’est pas un point de contrôle PyTorch (data.pkl absent)');
    const prefix = pk.slice(0, -'data.pkl'.length), root = unpickle((await readSpan(src, Z, [pk])).get(pk));
    const sd = root && root.state_dict && typeof root.state_dict === 'object' ? root.state_dict : root;
    const keys = Object.keys(sd || {}).filter(k => sd[k] && sd[k].tensor), names = {};
    for (const k of keys) { const n = k.replace(/^(model\.)+/, '').replace(/^module\./, ''); if (/num_batches_tracked$/.test(n)) continue; names[n] = k; }
    if (!names['first_conv.conv.weight'] || !names['dense.weight']) throw new Error('ce point de contrôle ne contient pas le réseau de SpikeNet2 (first_conv, dense introuvables)');
    const T = {}, list = Object.keys(names), keyOf = n => prefix + 'data/' + sd[names[n]].storage.key; let i = 0;
    for (const n of list) { const z = Z.get(keyOf(n)); if (!z) throw new Error('stockage manquant dans l’archive : ' + keyOf(n)); if (z.method !== 0) throw new Error('archive compressée : enregistrer le point de contrôle avec torch.save sans compression'); }
    // lectures groupées par blocs voisins (≤ 64 Mo) : les tenseurs du réseau sont rangés ensemble, avant l'état de l'optimiseur
    const order = [...new Set(list.map(keyOf))].sort((x, y) => Z.get(x).lo - Z.get(y).lo), raw = new Map();
    for (let s = 0; s < order.length;) { let e = s + 1; while (e < order.length && Z.get(order[e]).lo + Z.get(order[e]).size - Z.get(order[s]).lo < 64 * 1048576) e++; for (const [k, v] of await readSpan(src, Z, order.slice(s, e))) raw.set(k, v); s = e; if (progress) progress(0.5 * s / order.length); }
    for (const n of list) { const t = sd[names[n]]; T[n] = { shape: t.shape.slice(), data: tensorData(raw.get(keyOf(n)), t) }; if (progress) progress(0.5 + 0.5 * (++i) / list.length); }
    return { cfg: configOf(T), T };
  }
  /** architecture lue dans les tailles des tenseurs (étages, blocs, voies, groupes, noyau) ; contrôlée */
  function configOf(T) {
    const f = T['first_conv.conv.weight'].shape, cfg = { cin: f[1], base: f[0], k: f[2], stride: STRIDE, stages: [] };
    for (let s = 0; T[`stage_list.${s}.block_list.0.conv3.conv.weight`]; s++) {
      const blocks = []; for (let b = 0; T[`stage_list.${s}.block_list.${b}.conv3.conv.weight`]; b++) {
        const P = `stage_list.${s}.block_list.${b}.`, c1 = T[P + 'conv1.conv.weight'].shape, c2 = T[P + 'conv2.conv.weight'].shape, c3 = T[P + 'conv3.conv.weight'].shape;
        if (c2[2] !== cfg.k || c1[2] !== 1 || c3[2] !== 1) throw new Error('architecture inattendue (noyaux) au bloc ' + s + '.' + b);
        blocks.push({ cin: c1[1], mid: c1[0], cout: c3[0], groups: c2[0] / c2[1], first: s === 0 && b === 0, down: b === 0 });
      }
      cfg.stages.push(blocks);
    }
    if (!cfg.stages.length) throw new Error('architecture inattendue : aucun étage');
    if (cfg.cin !== 37) throw new Error(`le réseau attend ${cfg.cin} voies (SpikeNet2 : 37 = 18 en double banane + 19 en référence moyenne)`);
    cfg.cout = cfg.stages[cfg.stages.length - 1].slice(-1)[0].cout; if (T['dense.weight'].shape[1] !== cfg.cout) throw new Error('architecture inattendue (couche dense)');
    return cfg;
  }

  // ------------------------------------------------------------------ forme compacte EPSN2
  const BN = ['first_bn'], bnScale = (T, p) => { const g = T[p + '.weight'].data, b = T[p + '.bias'].data, m = T[p + '.running_mean'].data, v = T[p + '.running_var'].data, s = new Float32Array(g.length), o = new Float32Array(g.length); for (let i = 0; i < g.length; i++) { s[i] = g[i] / Math.sqrt(v[i] + BN_EPS); o[i] = b[i] - m[i] * s[i]; } return [s, o]; };
  /** réseau lu → ArrayBuffer « EPSN2 » : en-tête JSON (architecture, tenseurs, empreinte, source) puis float32 */
  async function pack(R, meta) {
    const T = R.T, arrs = [], idx = [], put = (name, a, shape) => { idx.push({ name, n: a.length, shape }); arrs.push(a); };
    const bn = p => { const [s, o] = bnScale(T, p); put(p + '.s', s, [s.length]); put(p + '.o', o, [o.length]); };
    put('first.w', T['first_conv.conv.weight'].data, T['first_conv.conv.weight'].shape); put('first.b', T['first_conv.conv.bias'].data, [T['first_conv.conv.bias'].data.length]); bn('first_bn');
    R.cfg.stages.forEach((blocks, s) => blocks.forEach((B, b) => {
      const P = `stage_list.${s}.block_list.${b}.`;
      for (const c of ['conv1', 'conv2', 'conv3']) { put(P + c + '.w', T[P + c + '.conv.weight'].data, T[P + c + '.conv.weight'].shape); put(P + c + '.b', T[P + c + '.conv.bias'].data, [T[P + c + '.conv.bias'].data.length]); }
      if (!B.first) bn(P + 'bn1'); bn(P + 'bn2'); bn(P + 'bn3');
      for (const c of ['se_fc1', 'se_fc2']) { put(P + c + '.w', T[P + c + '.weight'].data, T[P + c + '.weight'].shape); put(P + c + '.b', T[P + c + '.bias'].data, [T[P + c + '.bias'].data.length]); }
    }));
    put('dense.w', T['dense.weight'].data, T['dense.weight'].shape); put('dense.b', T['dense.bias'].data, [1]);
    const total = arrs.reduce((a, x) => a + x.length, 0), body = new Float32Array(total); let o = 0; for (const a of arrs) { body.set(a, o); o += a.length; }
    const sha = await sha256(body), head = { format: MAGIC, v: 1, name: 'SpikeNet2', cfg: R.cfg, tensors: idx, sha, nParams: total, ...(meta || {}) };
    const hb = new TextEncoder().encode(JSON.stringify(head)), pad = (8 - ((5 + 4 + hb.length) % 8)) % 8, H = new Uint8Array(9 + hb.length + pad);
    H.set(new TextEncoder().encode(MAGIC)); new DataView(H.buffer).setUint32(5, hb.length + pad, true); H.set(hb, 9); for (let i = 0; i < pad; i++) H[9 + hb.length + i] = 32;
    const out = new Uint8Array(H.length + body.byteLength); out.set(H); out.set(new Uint8Array(body.buffer), H.length); return out.buffer;
  }
  /** en-tête seul (état de l'installation sans décoder les poids) */
  function header(buf) {
    const u = new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer, buf.byteOffset || 0, Math.min(buf.byteLength, 1 << 20));
    if (dec.decode(u.subarray(0, 5)) !== MAGIC) throw new Error('fichier de poids SpikeNet2 illisible');
    const n = new DataView(u.buffer, u.byteOffset).getUint32(5, true); return JSON.parse(dec.decode(u.subarray(9, 9 + n)));
  }
  let cache = null;
  /** ArrayBuffer EPSN2 → réseau prêt (gardé en mémoire du worker) */
  function load(buf) {
    const H = header(buf); if (cache && cache.sha === H.sha) return cache.M;
    const n = new DataView(buf).getUint32(5, true), body = new Float32Array(buf, 9 + n, H.nParams), t = {}; let o = 0;
    for (const e of H.tensors) { t[e.name] = body.subarray(o, o + e.n); o += e.n; }
    cache = { sha: H.sha, M: { H, cfg: H.cfg, t } }; return cache.M;
  }
  async function sha256(a) {
    const b = a instanceof Uint8Array ? a : new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    if (typeof crypto !== 'undefined' && crypto.subtle) return [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map(x => x.toString(16).padStart(2, '0')).join('');
    return require('crypto').createHash('sha256').update(b).digest('hex');
  }

  // ------------------------------------------------------------------ calcul (lot de B fenêtres ; activations [voie][fenêtre][temps])
  const swish = v => v / (1 + Math.exp(-v)), sigm = v => 1 / (1 + Math.exp(-v));
  /** convolution « same » (remplissage de zéros p//2 à gauche), pas s, groupes ; x [cin][B][L] → [cout][B][Lo] */
  function conv(x, cin, B, L, w, bias, cout, k, s, groups) {
    const Lo = Math.ceil(L / s), pd = Math.max(0, (Lo - 1) * s + k - L), pl = pd >> 1, gi = cin / groups, go = cout / groups, y = new Float32Array(cout * B * Lo), BL = B * L, BLo = B * Lo;
    if (k === 1 && s === 1 && groups === 1) {                                        // conv 1 : produit matriciel
      let o = 0;
      for (; o + 4 <= cout; o += 4) {                                               // 4 voies de sortie à la fois : chaque entrée lue une fois
        const y0 = o * BLo, y1 = y0 + BLo, y2 = y1 + BLo, y3 = y2 + BLo; y.fill(bias[o], y0, y1); y.fill(bias[o + 1], y1, y2); y.fill(bias[o + 2], y2, y3); y.fill(bias[o + 3], y3, y3 + BLo);
        for (let i = 0; i < cin; i++) {
          const a0 = w[o * cin + i], a1 = w[(o + 1) * cin + i], a2 = w[(o + 2) * cin + i], a3 = w[(o + 3) * cin + i], xi = i * BL;
          for (let j = 0; j < BLo; j++) { const v = x[xi + j]; y[y0 + j] += a0 * v; y[y1 + j] += a1 * v; y[y2 + j] += a2 * v; y[y3 + j] += a3 * v; }
        }
      }
      for (; o < cout; o++) { const yo = o * BLo; y.fill(bias[o], yo, yo + BLo); for (let i = 0; i < cin; i++) { const wv = w[o * cin + i], xi = i * BL; for (let j = 0; j < BLo; j++) y[yo + j] += wv * x[xi + j]; } }
      return { y, L: Lo };
    }
    for (let o = 0; o < cout; o++) {
      const g = Math.floor(o / go), yo = o * BLo; for (let j = 0; j < BLo; j++) y[yo + j] = bias[o];
      for (let ii = 0; ii < gi; ii++) {
        const i = g * gi + ii, xi = i * BL, wo = (o * gi + ii) * k;
        for (let t = 0; t < k; t++) {
          const wv = w[wo + t]; if (wv === 0) continue;
          const l0 = Math.max(0, Math.ceil((pl - t) / s)), l1 = Math.min(Lo, Math.floor((L - 1 + pl - t) / s) + 1);   // positions où l'entrée est dans [0, L[
          if (l1 <= l0) continue;
          for (let b = 0; b < B; b++) { const yb = yo + b * Lo, xb = xi + b * L - pl + t; for (let l = l0; l < l1; l++) y[yb + l] += wv * x[xb + l * s]; }
        }
      }
    }
    return { y, L: Lo };
  }
  const affine = (x, C, n, s, o, act) => { for (let c = 0; c < C; c++) { const sc = s[c], of = o[c], a = c * n; for (let j = 0; j < n; j++) { const v = x[a + j] * sc + of; x[a + j] = act ? swish(v) : v; } } return x; };
  /** lot X (Float32Array B × 37 × 128, fenêtres préparées) → probabilités (B) */
  function forward(M, X, B) {
    const c = M.cfg, t = M.t; let L = W;
    const x0 = new Float32Array(c.cin * B * L); for (let b = 0; b < B; b++) for (let i = 0; i < c.cin; i++) x0.set(X.subarray((b * c.cin + i) * L, (b * c.cin + i + 1) * L), (i * B + b) * L);
    let r = conv(x0, c.cin, B, L, t['first.w'], t['first.b'], c.base, c.k, 2, 1), x = affine(r.y, c.base, B * r.L, t['first_bn.s'], t['first_bn.o'], true), C = c.base; L = r.L;
    c.stages.forEach((blocks, s) => blocks.forEach((Bk, bi) => {
      const P = `stage_list.${s}.block_list.${bi}.`, st = Bk.down ? c.stride : 1;
      let h = Bk.first ? x : affine(Float32Array.from(x), C, B * L, t[P + 'bn1.s'], t[P + 'bn1.o'], true);
      r = conv(h, C, B, L, t[P + 'conv1.w'], t[P + 'conv1.b'], Bk.mid, 1, 1, 1); h = affine(r.y, Bk.mid, B * L, t[P + 'bn2.s'], t[P + 'bn2.o'], true);
      r = conv(h, Bk.mid, B, L, t[P + 'conv2.w'], t[P + 'conv2.b'], Bk.mid, c.k, st, Bk.groups); const L2 = r.L; h = affine(r.y, Bk.mid, B * L2, t[P + 'bn3.s'], t[P + 'bn3.o'], true);
      r = conv(h, Bk.mid, B, L2, t[P + 'conv3.w'], t[P + 'conv3.b'], Bk.cout, 1, 1, 1); const out = r.y, Co = Bk.cout;
      // compression-excitation (moyenne temporelle → dense → Swish → dense → sigmoïde)
      const w1 = t[P + 'se_fc1.w'], b1 = t[P + 'se_fc1.b'], w2 = t[P + 'se_fc2.w'], b2 = t[P + 'se_fc2.b'], Ch = b1.length, m = new Float32Array(Co), hh = new Float32Array(Ch);
      for (let b = 0; b < B; b++) {
        for (let o = 0; o < Co; o++) { let a = 0; const q = (o * B + b) * L2; for (let l = 0; l < L2; l++) a += out[q + l]; m[o] = a / L2; }
        for (let j = 0; j < Ch; j++) { let a = b1[j]; const q = j * Co; for (let o = 0; o < Co; o++) a += w1[q + o] * m[o]; hh[j] = swish(a); }
        for (let o = 0; o < Co; o++) { let a = b2[o]; const q = o * Ch; for (let j = 0; j < Ch; j++) a += w2[q + j] * hh[j]; const g = sigm(a), q2 = (o * B + b) * L2; for (let l = 0; l < L2; l++) out[q2 + l] *= g; }
      }
      // raccourci : max-pool « same » (zéros de remplissage compris, comme F.pad) puis voies complétées par des zéros
      const c1 = (Co - C) >> 1;
      for (let i = 0; i < C; i++) for (let b = 0; b < B; b++) {
        const xi = (i * B + b) * L, yo = ((i + c1) * B + b) * L2;
        if (st === 1) for (let l = 0; l < L2; l++) out[yo + l] += x[xi + l];
        else { const pl = (st - 1) >> 1; for (let l = 0; l < L2; l++) { let mx = -Infinity; for (let u = 0; u < st; u++) { const e = l * st + u - pl; const v = e >= 0 && e < L ? x[xi + e] : 0; if (v > mx) mx = v; } out[yo + l] += mx; } }
      }
      x = out; C = Co; L = L2;
    }));
    const P = new Float32Array(B), wd = t['dense.w'], bd = t['dense.b'][0];
    for (let b = 0; b < B; b++) { let a = bd; for (let o = 0; o < C; o++) { let m = 0; const q = (o * B + b) * L; for (let l = 0; l < L; l++) m += x[q + l]; a += wd[o] * m / L; } P[b] = sigm(a); }
    return P;
  }

  // ------------------------------------------------------------------ entrée du réseau
  /** quantile linéaire (numpy « linear ») d'un tableau trié */
  const qlin = (s, q) => { const h = (s.length - 1) * q, i = Math.floor(h), f = h - i; return i + 1 < s.length ? s[i] + f * (s[i + 1] - s[i]) : s[i]; };
  /** fenêtre de 128 échantillons de 19 voies (µV, 128 Hz, ordre MONO) débutant en a → 37 × 128 dans out (à partir de off) */
  function prepWindow(D, a, out, off) {
    const avg = new Float32Array(W), tmp = new Float32Array(W);
    for (let k = 0; k < 19; k++) { const d = D[k]; for (let i = 0; i < W; i++) avg[i] += d[a + i] / 19; }
    const put = (ch, fill) => {
      const o = off + ch * W; fill(out.subarray(o, o + W));
      const v = out.subarray(o, o + W); let mn = Infinity, mx = -Infinity; for (let i = 0; i < W; i++) { if (v[i] < mn) mn = v[i]; if (v[i] > mx) mx = v[i]; }
      if (mx - mn < 20 || mx - mn > 2000) { v.fill(0); return; }
      for (let i = 0; i < W; i++) tmp[i] = Math.abs(v[i]); tmp.sort(); const q = qlin(tmp, 0.95) + 1e-8; for (let i = 0; i < W; i++) v[i] /= q;
    };
    BIPI.forEach(([p, q], j) => put(j, v => { const dp = D[p], dq = D[q]; for (let i = 0; i < W; i++) v[i] = dp[a + i] - dq[a + i]; }));
    for (let k = 0; k < 19; k++) put(18 + k, v => { const d = D[k]; for (let i = 0; i < W; i++) v[i] = d[a + i] - avg[i]; });
    return out;
  }
  /** balayage : D = 19 voies à 128 Hz (spikenet.js : prep), une fenêtre de 1 s tous les `step` échantillons → { p } ;
   *  buf = poids EPSN2 (ArrayBuffer, gardé en mémoire du worker après le premier appel ; null ensuite) */
  function scan(buf, D, step, o, progress) {
    if (buf) load(buf); if (!cache) throw new Error('poids de SpikeNet2 non chargés dans ce calcul');
    const M = cache.M, n = D[0].length, nw = n >= W ? Math.floor((n - W) / step) + 1 : 0, P = new Float32Array(nw), BS = 16, X = new Float32Array(BS * 37 * W);
    for (let w0 = 0; w0 < nw; w0 += BS) {
      const B = Math.min(BS, nw - w0); for (let b = 0; b < B; b++) prepWindow(D, (w0 + b) * step, X, b * 37 * W);
      P.set(forward(M, X, B), w0); if (progress) progress(Math.min(1, (w0 + B) / nw));
    }
    return { p: P };
  }
  /** charge les poids dans le worker (une fois par worker) → en-tête */
  function init(buf) { return load(buf).H; }
  SV.SpikeNet2 = { readCkpt, configOf, pack, header, load, init, forward, prepWindow, scan, unpickle, zipEntries, sha256, MONO, BIP, FS, W };
});
