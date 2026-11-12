/* EpiScope — dicom.js : lecture d'un dossier DICOM sans logiciel externe (v4.21).
 *   - parse(buffer) : éléments d'un fichier DICOM (préambule « DICM » ou flux implicit VR sans préambule) ; syntaxes
 *     implicit / explicit VR little endian, explicit big endian ; séquences (items, longueurs indéfinies) parcourues ;
 *     valeurs utiles décodées (chaînes, nombres, listes DS / IS) ; position et longueur des données de pixels ;
 *   - series(files) : regroupement par Series Instance UID (et orientation / taille), tri des coupes le long de la normale,
 *     séries temporelles ou multi-échos séparées (positions répétées → volumes successifs), vérification de l'espacement ;
 *   - volume(serie) : images classiques (une coupe par fichier) ou multi-images « enhanced » (positions par image dans
 *     Per-frame Functional Groups) → volume aux conventions de nifti.js : dims, pixdim, affine RAS (DICOM LPS → RAS),
 *     données natives (Uint8 / Int16 / Uint16) avec pente et ordonnée (HU du scanner conservées) ;
 *   - guess(serie) : modalité EpiScope (T1, T1c, T2, FLAIR, CT, PET, SPECT, other) d'après la modalité DICOM, la description
 *     de la série, le protocole, les paramètres d'acquisition (TI, TE) et le produit de contraste ; date ; étiquette.
 *   Non pris en charge (signalé) : pixels compressés (JPEG, RLE), mosaïques Siemens, couleur. Fabrique 'dicom' (worker). */
(function (factory) {
  const G = typeof window !== 'undefined' ? (window.SV = window.SV || {}) : (globalThis.SV = globalThis.SV || {});
  factory(G); (G._factories = G._factories || {}).dicom = factory;
})(function (SV) {
  'use strict';
  const T = {   // tags utiles : [groupe, élément] → nom ; VR implicite connue pour les décoder
    '0002,0010': ['TransferSyntaxUID', 'UI'], '0008,0008': ['ImageType', 'CS'], '0008,0016': ['SOPClassUID', 'UI'], '0008,0018': ['SOPInstanceUID', 'UI'], '0008,0020': ['StudyDate', 'DA'], '0008,0021': ['SeriesDate', 'DA'], '0008,0022': ['AcquisitionDate', 'DA'], '0008,0030': ['StudyTime', 'TM'], '0008,0060': ['Modality', 'CS'], '0008,0070': ['Manufacturer', 'LO'], '0008,1030': ['StudyDescription', 'LO'], '0008,103e': ['SeriesDescription', 'LO'], '0008,1090': ['ManufacturerModelName', 'LO'],
    '0010,0010': ['PatientName', 'PN'], '0010,0020': ['PatientID', 'LO'], '0010,0030': ['PatientBirthDate', 'DA'], '0010,0040': ['PatientSex', 'CS'],
    '0018,0010': ['ContrastBolusAgent', 'LO'], '0018,0015': ['BodyPartExamined', 'CS'], '0018,0020': ['ScanningSequence', 'CS'], '0018,0021': ['SequenceVariant', 'CS'], '0018,0023': ['MRAcquisitionType', 'CS'], '0018,0024': ['SequenceName', 'SH'], '0018,0050': ['SliceThickness', 'DS'], '0018,0080': ['RepetitionTime', 'DS'], '0018,0081': ['EchoTime', 'DS'], '0018,0082': ['InversionTime', 'DS'], '0018,0086': ['EchoNumbers', 'IS'], '0018,0088': ['SpacingBetweenSlices', 'DS'], '0018,1030': ['ProtocolName', 'LO'], '0018,1210': ['ConvolutionKernel', 'SH'], '0018,5100': ['PatientPosition', 'CS'], '0018,0060': ['KVP', 'DS'],
    '0020,000d': ['StudyInstanceUID', 'UI'], '0020,000e': ['SeriesInstanceUID', 'UI'], '0020,0011': ['SeriesNumber', 'IS'], '0020,0012': ['AcquisitionNumber', 'IS'], '0020,0013': ['InstanceNumber', 'IS'], '0020,0032': ['ImagePositionPatient', 'DS'], '0020,0037': ['ImageOrientationPatient', 'DS'], '0020,0052': ['FrameOfReferenceUID', 'UI'], '0020,0100': ['TemporalPositionIdentifier', 'IS'], '0020,1041': ['SliceLocation', 'DS'], '0020,9057': ['InStackPositionNumber', 'UL'], '0020,9056': ['StackID', 'SH'], '0020,9111': ['FrameContentSequence', 'SQ'], '0020,9113': ['PlanePositionSequence', 'SQ'], '0020,9116': ['PlaneOrientationSequence', 'SQ'], '0020,9157': ['DimensionIndexValues', 'UL'],
    '0028,0002': ['SamplesPerPixel', 'US'], '0028,0004': ['PhotometricInterpretation', 'CS'], '0028,0008': ['NumberOfFrames', 'IS'], '0028,0010': ['Rows', 'US'], '0028,0011': ['Columns', 'US'], '0028,0030': ['PixelSpacing', 'DS'], '0028,0100': ['BitsAllocated', 'US'], '0028,0101': ['BitsStored', 'US'], '0028,0103': ['PixelRepresentation', 'US'], '0028,1052': ['RescaleIntercept', 'DS'], '0028,1053': ['RescaleSlope', 'DS'], '0028,1054': ['RescaleType', 'LO'], '0028,9110': ['PixelMeasuresSequence', 'SQ'], '0028,9145': ['PixelValueTransformationSequence', 'SQ'],
    '0040,9096': ['RealWorldValueMappingSequence', 'SQ'], '0040,9224': ['RealWorldValueIntercept', 'FD'], '0040,9225': ['RealWorldValueSlope', 'FD'], '2005,100d': ['PhilipsScaleIntercept', 'FL'], '2005,100e': ['PhilipsScaleSlope', 'FL'],
    '5200,9229': ['SharedFunctionalGroupsSequence', 'SQ'], '5200,9230': ['PerFrameFunctionalGroupsSequence', 'SQ'], '7fe0,0010': ['PixelData', 'OW'], '0019,100a': ['SiemensNumberOfImagesInMosaic', 'US'],
  };
  const NAME = {}; for (const k in T) NAME[T[k][0]] = k;
  const NUM = { US: 2, SS: 2, UL: 4, SL: 4, FL: 4, FD: 8, AT: 4 }, LONG = new Set(['OB', 'OW', 'OF', 'OD', 'OL', 'SQ', 'UT', 'UN', 'UC', 'UR']);
  const key = (g, e) => g.toString(16).padStart(4, '0') + ',' + e.toString(16).padStart(4, '0');
  const txt = (u8, o, n) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(u8[o + i]); return s.replace(/\0+$/g, '').trim(); };
  const isDicom = u8 => u8.length > 132 && u8[128] === 0x44 && u8[129] === 0x49 && u8[130] === 0x43 && u8[131] === 0x4d;

  /** éléments d'un fichier : Map(tag 'gggg,eeee' → { vr, val (décodée si utile), off, len }) ; séquences : val = [Map…] */
  function parse(buf, opts) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), o = opts || {};
    let pos = 0, explicit = true, le = true, ts = '';
    if (isDicom(u8)) pos = 132; else if (!(u8.length > 8 && dv.getUint16(0, true) === 0x0008)) throw new Error('pas un fichier DICOM');
    const decode = (vr, off, len, little) => {
      if (vr === 'SQ') return null;
      if (NUM[vr]) { const n = Math.floor(len / NUM[vr]), out = []; for (let i = 0; i < n; i++) { const p = off + i * NUM[vr]; out.push(vr === 'US' ? dv.getUint16(p, little) : vr === 'SS' ? dv.getInt16(p, little) : vr === 'UL' ? dv.getUint32(p, little) : vr === 'SL' ? dv.getInt32(p, little) : vr === 'FL' ? dv.getFloat32(p, little) : vr === 'FD' ? dv.getFloat64(p, little) : dv.getUint32(p, little)); } return out.length === 1 ? out[0] : out; }
      if (vr === 'OB' || vr === 'OW' || vr === 'UN' || vr === 'OF') return null;
      const s = txt(u8, off, Math.min(len, 4096));
      if (vr === 'DS' || vr === 'IS') { const a = s.split('\\').map(x => parseFloat(x)).filter(x => !isNaN(x)); return a.length === 1 ? a[0] : a; }
      return s;
    };
    const readSet = (start, end, expl, little, depth) => {
      const ds = new Map(); let p = start;
      while (p + 8 <= end) {
        const g = dv.getUint16(p, little), e = dv.getUint16(p + 2, little), k = key(g, e);
        if (g === 0xfffe && (e === 0xe00d || e === 0xe0dd)) return { ds, next: p + 8 };   // fin d'item / de séquence
        let vr, len, vo;
        const exp = expl && g !== 0xfffe;
        if (exp) { vr = String.fromCharCode(u8[p + 4], u8[p + 5]); if (LONG.has(vr)) { len = dv.getUint32(p + 8, little); vo = p + 12; } else { len = dv.getUint16(p + 6, little); vo = p + 8; } }
        else { len = dv.getUint32(p + 4, little); vo = p + 8; vr = T[k] ? T[k][1] : (g === 0xfffe ? 'IT' : 'UN'); }
        if (g === 0xfffe && e === 0xe000) { p = vo; continue; }   // item isolé (ne devrait pas arriver ici)
        const undef = len === 0xffffffff;
        if (vr === 'SQ' || (undef && k !== '7fe0,0010')) {   // séquence : items jusqu'au délimiteur (ou longueur donnée)
          const items = []; let q = vo; const qEnd = undef ? end : vo + len;
          while (q + 8 <= qEnd) {
            const ig = dv.getUint16(q, little), ie = dv.getUint16(q + 2, little), il = dv.getUint32(q + 4, little);
            if (ig === 0xfffe && ie === 0xe0dd) { q += 8; break; }
            if (ig !== 0xfffe || ie !== 0xe000) break;
            const iEnd = il === 0xffffffff ? qEnd : q + 8 + il, r = depth < 6 ? readSet(q + 8, iEnd, expl, little, depth + 1) : { ds: new Map(), next: iEnd };
            items.push(r.ds); q = il === 0xffffffff ? r.next : iEnd;
          }
          ds.set(k, { vr: 'SQ', val: items, off: vo, len: q - vo }); p = q; continue;
        }
        if (undef) { ds.set(k, { vr, val: null, off: vo, len: -1, encapsulated: true }); return { ds, next: end }; }   // pixels encapsulés : fin de lecture
        if (vo + len > end) { if (k === '7fe0,0010') ds.set(k, { vr, val: null, off: vo, len, truncated: true }); break; }
        const want = T[k] || o.all; ds.set(k, { vr, val: want && k !== '7fe0,0010' ? decode(vr, vo, len, little) : null, off: vo, len });
        p = vo + len;
        if (p >= end) break;
      }
      return { ds, next: p };
    };
    // méta-informations du fichier (groupe 0002, toujours explicit VR LE), puis la syntaxe de transfert
    let ds = new Map();
    if (pos === 132) {
      let p = pos;
      while (p + 8 <= u8.length && dv.getUint16(p, true) === 0x0002) {
        const e = dv.getUint16(p + 2, true), vr = String.fromCharCode(u8[p + 4], u8[p + 5]), long = LONG.has(vr), len = long ? dv.getUint32(p + 8, true) : dv.getUint16(p + 6, true), vo = p + (long ? 12 : 8), k = key(2, e);
        if (vo + len > u8.length) break;
        ds.set(k, { vr, val: T[k] || o.all ? decode(vr, vo, len, true) : null, off: vo, len }); p = vo + len;
      }
      pos = p; ts = ds.get('0002,0010') ? String(ds.get('0002,0010').val) : '';
      if (ts === '1.2.840.10008.1.2') explicit = false; else if (ts === '1.2.840.10008.1.2.2') le = false;
      // sans syntaxe déclarée : explicit si les deux octets après le premier tag forment une VR connue
      if (!ts) { const vr = String.fromCharCode(u8[pos + 4], u8[pos + 5]); explicit = /^[A-Z]{2}$/.test(vr); }
    } else explicit = false;
    const body = readSet(pos, u8.length, explicit, le, 0).ds; for (const [k, v] of body) ds.set(k, v);
    const get = n => { const x = ds.get(NAME[n]); return x ? x.val : undefined; };
    return { ds, get, u8, dv, le, explicit, ts, compressed: !!ts && !/^1\.2\.840\.10008\.1\.2(\.1|\.2)?$/.test(ts), deflated: ts === '1.2.840.10008.1.2.1.99' };
  }

  // ---------------------------------------------------------------- séries
  const arr = v => v == null ? [] : Array.isArray(v) ? v : [v];
  const num = v => { const x = Array.isArray(v) ? v[0] : v; const n = typeof x === 'number' ? x : parseFloat(x); return isFinite(n) ? n : null; };
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  /** une « coupe » : fichier (ou image d'un fichier multi-images) avec sa géométrie */
  function slicesOf(P, fileIdx) {
    const nF = num(P.get('NumberOfFrames')) || 1, iop0 = arr(P.get('ImageOrientationPatient')).map(Number), ipp0 = arr(P.get('ImagePositionPatient')).map(Number), ps0 = arr(P.get('PixelSpacing')).map(Number);
    const shared = (P.get('SharedFunctionalGroupsSequence') || [])[0], per = P.get('PerFrameFunctionalGroupsSequence') || [];
    const inSeq = (m, name, inner) => { if (!m) return undefined; const sq = m.get(NAME[name]); const it = sq && sq.val && sq.val[0]; const x = it && it.get(NAME[inner]); return x ? x.val : undefined; };
    const out = [];
    // Philips : « precise float » comme dcm2niix — valeur = (brut × RS + RI) / (RS × SS) = brut / SS + RI / (RS × SS)
    const SS = num(P.get('PhilipsScaleSlope')), RS0 = num(P.get('RescaleSlope')), RI0 = num(P.get('RescaleIntercept')), philips = SS != null && SS > 0 && String(P.get('Modality')) === 'MR';
    const base = { fileIdx, rows: num(P.get('Rows')), cols: num(P.get('Columns')), bits: num(P.get('BitsAllocated')) || 16, signed: num(P.get('PixelRepresentation')) === 1, spp: num(P.get('SamplesPerPixel')) || 1, slope: philips ? 1 / SS : RS0, inter: philips ? (RI0 || 0) / ((RS0 || 1) * SS) : RI0, thick: num(P.get('SliceThickness')), sbs: num(P.get('SpacingBetweenSlices')), inst: num(P.get('InstanceNumber')), acq: num(P.get('AcquisitionNumber')), echo: num(P.get('EchoNumbers')), temporal: num(P.get('TemporalPositionIdentifier')) };
    if (nF > 1 && (per.length || shared)) {
      for (let f = 0; f < nF; f++) {
        const fm = per[f];
        const ipp = arr(inSeq(fm, 'PlanePositionSequence', 'ImagePositionPatient')).map(Number), iop = arr(inSeq(fm, 'PlaneOrientationSequence', 'ImageOrientationPatient') || inSeq(shared, 'PlaneOrientationSequence', 'ImageOrientationPatient')).map(Number);
        const ps = arr(inSeq(fm, 'PixelMeasuresSequence', 'PixelSpacing') || inSeq(shared, 'PixelMeasuresSequence', 'PixelSpacing')).map(Number), th = num(inSeq(fm, 'PixelMeasuresSequence', 'SliceThickness') || inSeq(shared, 'PixelMeasuresSequence', 'SliceThickness'));
        const sl = num(inSeq(fm, 'PixelValueTransformationSequence', 'RescaleSlope') || inSeq(shared, 'PixelValueTransformationSequence', 'RescaleSlope')), it = num(inSeq(fm, 'PixelValueTransformationSequence', 'RescaleIntercept') || inSeq(shared, 'PixelValueTransformationSequence', 'RescaleIntercept'));
        const dim = arr(inSeq(fm, 'FrameContentSequence', 'DimensionIndexValues')).map(Number), stack = inSeq(fm, 'FrameContentSequence', 'StackID');
        out.push(Object.assign({}, base, { frame: f, ipp: ipp.length === 3 ? ipp : ipp0, iop: iop.length === 6 ? iop : iop0, ps: ps.length === 2 ? ps : ps0, thick: th != null ? th : base.thick, slope: sl != null ? sl : base.slope, inter: it != null ? it : base.inter, dim, stack, inst: f + 1 }));
      }
    } else for (let f = 0; f < nF; f++) out.push(Object.assign({}, base, { frame: f, ipp: ipp0, iop: iop0, ps: ps0, inst: nF > 1 ? f + 1 : base.inst }));
    return out;
  }
  /** regroupement des fichiers lus ([{ name, P }]) en séries ; chaque série : { uid, desc, modality, date, files, slices, sub (volumes
   *  distincts si positions répétées), warnings } */
  function series(parsed) {
    const by = new Map();
    parsed.forEach((f, idx) => {
      const P = f.P, uid = String(P.get('SeriesInstanceUID') || 'sans-uid'), iop = arr(P.get('ImageOrientationPatient')).map(v => (+v).toFixed(2)).join(','), sz = `${P.get('Rows')}x${P.get('Columns')}`;
      const k = uid + '|' + sz + '|' + (P.get('NumberOfFrames') > 1 ? 'mf' : iop);
      let s = by.get(k); if (!s) { by.set(k, s = { key: k, uid, desc: String(P.get('SeriesDescription') || P.get('ProtocolName') || ''), protocol: String(P.get('ProtocolName') || ''), modality: String(P.get('Modality') || ''), date: String(P.get('SeriesDate') || P.get('AcquisitionDate') || P.get('StudyDate') || ''), number: num(P.get('SeriesNumber')), manufacturer: String(P.get('Manufacturer') || ''), study: String(P.get('StudyDescription') || ''), files: [], slices: [], warnings: [], compressed: false, mosaic: false, P0: P }); }
      s.files.push(f); if (f.P.compressed) s.compressed = true; if (num(P.get('SiemensNumberOfImagesInMosaic')) > 1 || /MOSAIC/i.test(String(arr(P.get('ImageType')).join('\\')))) s.mosaic = true;
      for (const sl of slicesOf(P, idx)) { sl.file = f; s.slices.push(sl); }
    });
    const out = [];
    for (const s of by.values()) {
      const S0 = s.slices.filter(x => x.ipp && x.ipp.length === 3 && x.iop && x.iop.length === 6);
      if (!S0.length) { s.warnings.push('sans position ni orientation : non convertible'); s.sub = []; out.push(s); continue; }
      const iop = S0[0].iop, N = cross(iop.slice(0, 3), iop.slice(3, 6));
      for (const x of S0) x.z = dot(x.ipp, N);
      // volumes distincts (échos, temps, acquisitions) : même position répétée → découpage par rang d'apparition
      const groups = new Map();
      for (const x of S0) { const g = [x.echo, x.temporal, x.acq, x.stack].map(v => v == null ? '' : v).join('/'); (groups.get(g) || groups.set(g, []).get(g)).push(x); }
      let subs = [...groups.values()];
      if (subs.length === 1) {   // positions répétées sans tag discriminant : par rang
        const byZ = new Map(); for (const x of subs[0]) { const k = x.z.toFixed(1); (byZ.get(k) || byZ.set(k, []).get(k)).push(x); }
        const rep = Math.max(...[...byZ.values()].map(a => a.length));
        if (rep > 1 && byZ.size > 1) { const v = []; for (const a of byZ.values()) a.sort((p, q) => (p.inst || 0) - (q.inst || 0)).forEach((x, i) => { (v[i] = v[i] || []).push(x); }); subs = v; s.warnings.push(`${rep} volumes à la même position (temps, échos) : séparés`); }
      }
      s.sub = subs.map(list => {
        list.sort((a, b) => a.z - b.z); const zs = list.map(x => x.z), d = []; for (let i = 1; i < zs.length; i++) d.push(zs[i] - zs[i - 1]);
        const med = d.length ? d.slice().sort((a, b) => a - b)[d.length >> 1] : (list[0].sbs || list[0].thick || 1), warn = [];
        if (d.some(v => Math.abs(v - med) > Math.max(0.05 * Math.abs(med), 0.05))) warn.push('espacement irrégulier entre les coupes (coupes manquantes ?) : espacement médian retenu');
        if (d.some(v => Math.abs(v) < 1e-3)) warn.push('coupes superposées');
        return { slices: list, spacing: Math.abs(med) || 1, warnings: warn, n: list.length };
      }).filter(v => v.n > 0).sort((a, b) => b.n - a.n);
      out.push(s);
    }
    return out.sort((a, b) => (a.number || 0) - (b.number || 0));
  }
  /** modalité EpiScope et étiquette devinées */
  function guess(s) {
    const P = s.P0, mod = s.modality, d = (s.desc + ' ' + s.protocol + ' ' + String(P.get('SequenceName') || '') + ' ' + arr(P.get('ImageType')).join(' ')).toLowerCase();
    const ti = num(P.get('InversionTime')), te = num(P.get('EchoTime')), tr = num(P.get('RepetitionTime')), contrast = String(P.get('ContrastBolusAgent') || '').trim();
    let modality = 'other';
    if (mod === 'CT') modality = 'CT'; else if (mod === 'PT') modality = 'PET'; else if (mod === 'NM') modality = 'SPECT';
    else if (mod === 'MR') {
      if (/flair/.test(d) || (ti != null && ti > 1500 && te != null && te > 60)) modality = 'FLAIR';
      else if (/t2|tse.*t2|haste|fse(?!.*t1)/.test(d) && !/t1/.test(d)) modality = 'T2';
      else if (/t1|mprage|mp2rage|tfe|bravo|spgr|fspgr|tfl|fl3d|3d.?t1|vibe|ffe/.test(d) || (te != null && te < 10 && tr != null && tr < 30)) modality = (/gado|gd|c\+|ce[^a-z]|post.?contrast|inj|\+c/.test(d) || contrast.length > 1) ? 'T1c' : 'T1';
      else if (te != null && te > 60) modality = 'T2';
    }
    const date = s.date && /^\d{8}$/.test(s.date) ? `${s.date.slice(0, 4)}-${s.date.slice(4, 6)}-${s.date.slice(6, 8)}` : '';
    const label = (s.desc || s.protocol || `${mod} série ${s.number || ''}`).trim();
    return { modality, date, label, timepoint: modality === 'CT' ? 'postimplant' : 'preop' };
  }
  // ---------------------------------------------------------------- volume
  /** volume d'un sous-ensemble d'une série : { dims, pixdim, affine (RAS), data, slope, inter, descrip, warnings } */
  function volume(s, part, readPixels) {
    const V0 = part || s.sub[0]; if (!V0 || !V0.slices.length) throw new Error('série sans coupe exploitable');
    if (s.compressed) throw new Error('pixels compressés (JPEG / RLE) : exporter la série non compressée depuis le PACS, ou la convertir avec dcm2niix');
    if (s.mosaic) throw new Error('mosaïque Siemens : convertir avec dcm2niix');
    const L = V0.slices, a = L[0], nx = a.cols, ny = a.rows, nz = L.length, spp = a.spp || 1;
    if (!nx || !ny) throw new Error('taille d’image absente');
    const iop = a.iop, row = iop.slice(0, 3), col = iop.slice(3, 6), N = cross(row, col), dj = a.ps[0], di = a.ps[1];   // ps = [entre lignes, entre colonnes]
    const dz = nz > 1 ? V0.spacing : (a.sbs || a.thick || 1);
    const p0 = a.ipp, pN = L[nz - 1].ipp, kdir = nz > 1 ? sub(pN, p0).map(v => v / (nz - 1)) : N.map(v => v * dz);
    // affine LPS : colonnes = direction i (colonnes de l'image) × di, direction j × dj, direction k ; origine = position de la 1re coupe
    const A = new Float64Array(16); A[15] = 1;
    for (let r = 0; r < 3; r++) { A[4 * r] = row[r] * di; A[4 * r + 1] = col[r] * dj; A[4 * r + 2] = kdir[r]; A[4 * r + 3] = p0[r]; }
    for (let c = 0; c < 4; c++) { A[c] = -A[c]; A[4 + c] = -A[4 + c]; }   // LPS → RAS
    const signed = a.signed, bits = a.bits, Type = bits === 8 ? Uint8Array : signed ? Int16Array : Uint16Array, data = new Type(nx * ny * nz), warnings = V0.warnings.slice();
    let slope = a.slope != null ? a.slope : 1, inter = a.inter != null ? a.inter : 0;
    const rel = (u, v) => Math.abs(u - v) > 1e-6 * Math.max(1, Math.abs(u), Math.abs(v));
    if (L.some(x => rel(x.slope != null ? x.slope : 1, slope) || rel(x.inter != null ? x.inter : 0, inter))) warnings.push('pente / ordonnée différentes selon les coupes : celles de la 1re coupe retenues');
    if (spp !== 1) warnings.push(`${spp} échantillons par pixel : moyenne des canaux`);
    if (readPixels !== false) {
      const frameBytes = nx * ny * spp * (bits >> 3);
      L.forEach((sl, k) => {
        const P = sl.file.P, px = P.ds.get('7fe0,0010'); if (!px) throw new Error('données de pixels absentes');
        const off = px.off + sl.frame * frameBytes, u8 = P.u8, dv = P.dv, o0 = k * nx * ny;
        if (off + frameBytes > u8.length) throw new Error('fichier tronqué');
        if (bits === 8) { for (let i = 0; i < nx * ny; i++) { let v = 0; for (let c = 0; c < spp; c++) v += u8[off + i * spp + c]; data[o0 + i] = v / spp; } }
        else if (spp === 1 && P.le) { const src = new Type(u8.buffer.slice(u8.byteOffset + off, u8.byteOffset + off + frameBytes)); data.set(src, o0); }
        else for (let i = 0; i < nx * ny; i++) { let v = 0; for (let c = 0; c < spp; c++) { const p = off + (i * spp + c) * 2; v += signed ? dv.getInt16(p, P.le) : dv.getUint16(p, P.le); } data[o0 + i] = v / spp; }
      });
    }
    const g = guess(s), pixdim = [di, dj, Math.hypot(kdir[0], kdir[1], kdir[2]) || dz];
    const vol = { dims: [nx, ny, nz], pixdim, affine: A, data, slope, inter, descrip: ('EpiScope DICOM ' + (s.desc || '')).slice(0, 79), warnings, guess: g, orient: orientName(row, col) };
    return readPixels !== false ? canonical(vol) : vol;
  }
  /** axes voxel permutés puis retournés pour que chaque axe du monde (x, y, z) soit porté par son axe voxel dominant et croisse
   *  avec lui (comme dcm2niix : une acquisition sagittale ou coronale est rangée « x d'abord ») : même monde, rangement canonique */
  function canonical(vol) {
    const A = vol.affine, dims = vol.dims;
    const perm = [0, 1, 2].map(r => { let best = 0; for (let c = 1; c < 3; c++) if (Math.abs(A[4 * r + c]) > Math.abs(A[4 * r + best])) best = c; return best; });
    const isPerm = new Set(perm).size === 3, P = isPerm ? perm : [0, 1, 2];
    const B = Float64Array.from(A); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) B[4 * r + c] = A[4 * r + P[c]];
    const nd = [dims[P[0]], dims[P[1]], dims[P[2]]], flips = [false, false, false];
    for (let c = 0; c < 3; c++) if (B[4 * c + c] < 0) flips[c] = true;
    const same = P.every((v, i) => v === i);
    if (same && !flips.some(Boolean)) return vol;
    const d = vol.data, out = new d.constructor(d.length);
    // positions des axes dans l'ancien rangement : stride de l'ancien axe P[c]
    const [nx, ny, nz] = dims, st = [1, nx, nx * ny], s0 = st[P[0]], s1 = st[P[1]], s2 = st[P[2]];
    const [mx, my, mz] = nd; let q = 0;
    for (let k = 0; k < mz; k++) { const kk = flips[2] ? mz - 1 - k : k; for (let j = 0; j < my; j++) { const jj = flips[1] ? my - 1 - j : j, base = jj * s1 + kk * s2;
      if (!flips[0] && s0 === 1) { out.set(d.subarray(base, base + mx), q); q += mx; }
      else for (let i = 0; i < mx; i++, q++) out[q] = d[base + (flips[0] ? mx - 1 - i : i) * s0]; } }
    for (let c = 0; c < 3; c++) if (flips[c]) { const n = nd[c]; for (let r = 0; r < 3; r++) { B[4 * r + 3] += B[4 * r + c] * (n - 1); B[4 * r + c] = -B[4 * r + c]; } }
    const pixdim = vol.pixdim ? [vol.pixdim[P[0]], vol.pixdim[P[1]], vol.pixdim[P[2]]] : vol.pixdim;
    return Object.assign({}, vol, { data: out, affine: B, dims: nd, pixdim });
  }
  function orientName(row, col) { const N = cross(row, col).map(Math.abs), k = N.indexOf(Math.max(...N)); return ['sagittale', 'coronale', 'axiale'][k]; }
  SV.Dicom = { parse, isDicom, series, volume, guess, slicesOf, canonical, TAGS: T };
});
