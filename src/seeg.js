/* EpiScope — seeg.js : données de la phase SEEG
 *   - plots bipolaires : étiquettes « A’1-2 », analyse (apostrophes variées, « A'1-A'2 », plages « OC 4-7 »), position 3D ;
 *   - stimulations corticales : paramètres usuels (recommandations françaises SEEG, Isnard et al. 2018 :
 *     chocs 1 Hz, 0,5–3 ms, 0,5–4 mA, 20–60 s ; trains 50 Hz, 0,5–1 ms, 0,5–5 mA, 3–8 s ; bipolaire entre plots contigus) ;
 *   - lecture de tableaux : CSV / TSV / texte, et XLSX (zip + XML lus sans bibliothèque : DecompressionStream) ;
 *   - détection des colonnes (étiquette de plot, valeurs numériques) ; palettes de couleurs (viridis, inferno, plasma,
 *     magma, chaud, bleu→rouge, EpiScope).                                                                       */
(function (SV) {
  'use strict';

  // ---------------------------------------------------------------- étiquettes de plots
  const PRIMES = /[’'`´‘ʹ′]/g;
  /** nom d'électrode normalisé : apostrophe typographique unique, sans espaces */
  function normName(s) { return String(s || '').trim().replace(PRIMES, '’').replace(/\s+/g, ''); }
  /** « A’1-2 », « a'1 - 2 », « A'1-A'2 », « A01-02 », « A’3 » (monopolaire) → {elec, c1, c2|null} ; sinon null */
  function parseLabel(s) {
    if (s == null) return null; const t = String(s).trim().replace(PRIMES, '’');
    const m = t.match(/^([A-Za-z]{1,4})(’?)\s*0*(\d{1,3})\s*(?:[-–—_/]\s*(?:([A-Za-z]{1,4})(’?)\s*)?0*(\d{1,3}))?$/);
    if (!m) return null;
    if (m[4] && (m[4].toLowerCase() !== m[1].toLowerCase() || (m[5] || '') !== m[2])) return null;   // « A'1-B'2 » : pas une paire
    const c1 = +m[3], c2 = m[6] != null ? +m[6] : null;
    if (c2 != null && c2 === c1) return null;
    return { elec: m[1] + m[2], c1: c2 != null ? Math.min(c1, c2) : c1, c2: c2 != null ? Math.max(c1, c2) : null };
  }
  function pairLabel(elec, c1, c2) { return normName(elec) + c1 + (c2 != null ? '-' + c2 : ''); }
  /** électrode dont le nom correspond (insensible à la casse, apostrophes normalisées) */
  function findElec(elecs, name) { const n = normName(name).toLowerCase(); return (elecs || []).find(e => normName(e.name).toLowerCase() === n) || null; }
  /** « Ia 1-3, OC 4-7 ; B' 2-3 » → paires contiguës [{elec,c1,c2}] (une plage de plus de deux plots est développée en paires successives) */
  function parseRanges(text) {
    const out = [];
    for (const tok of String(text || '').split(/[,;\n]+/)) {
      const p = parseLabel(tok.trim()); if (!p) continue;
      if (p.c2 == null) continue;
      for (let k = p.c1; k < p.c2; k++) out.push({ elec: p.elec, c1: k, c2: k + 1 });
    }
    return out;
  }
  /** toutes les paires contiguës d'une électrode construite */
  function pairsOf(e) { const out = []; for (let k = 1; k < e.nContacts; k++) out.push({ elec: e.name, c1: k, c2: k + 1 }); return out; }
  /** position (tkrRAS) d'un plot ou d'une paire sur une électrode construite (géométrie au niveau de gonflement donné) */
  function pairPoint(geom, c1, c2) {
    const C = geom.contacts, a = C[c1 - 1], b = c2 != null ? C[c2 - 1] : null; if (!a) return null; if (!b) return a.slice ? a.slice() : a;
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  }
  /** structure(s) échantillonnée(s) par une paire : « amygdale / hippocampe antérieur » */
  function pairStructures(e, c1, c2, atlas) {
    const names = []; for (const k of [c1, c2]) { const c = k != null && e.contacts[k - 1]; if (!c) continue; const n = SV.Electrodes.contactName(c.label, atlas); if (!names.includes(n)) names.push(n); }
    return names.join(' / ');
  }

  // ---------------------------------------------------------------- stimulations
  const STIM_MODES = {
    train: { fr: 'Train 50 Hz', freq: 50, pulse: 1, dur: 5, mA: 1, maxA: 5, hint: 'cartographie fonctionnelle, sémiologie ; 0,5–1 ms, 3–8 s, 0,5–5 mA' },
    shock: { fr: 'Chocs 1 Hz', freq: 1, pulse: 3, dur: 30, mA: 1, maxA: 4, hint: 'réponse électrique, crise déclenchée, CCEP ; 0,5–3 ms, 20–60 s, 0,5–4 mA' },
  };
  /** réponses : RAS (gris) ; fonctionnelle — manque du mot, arrêt du langage, paresthésies, clonies, phosphènes… (vert) ;
   *  subjective — « début de crise », sensation bizarre, déjà-vu, peur… (orange, comme une post-décharge) ; post-décharge
   *  (orange) ; crise (rouge). 'clin' (versions antérieures) = fonctionnelle. */
  const RESP = { none: { fr: 'RAS', short: '—', color: [128, 138, 150] }, func: { fr: 'réponse fonctionnelle', short: 'fonct.', color: [70, 190, 100] }, subj: { fr: 'réponse subjective', short: 'subj.', color: [255, 160, 60] }, ad: { fr: 'post-décharge', short: 'PD', color: [255, 160, 60] }, sz: { fr: 'crise', short: 'crise', color: [230, 60, 60] } };
  RESP.clin = RESP.func;
  const RESP_ORDER = ['none', 'func', 'subj', 'ad', 'sz'];
  /** type d'une réponse clinique : celui choisi, sinon subjective si elle fait partie des crises habituelles, fonctionnelle sinon */
  const clinTypeOf = s => s.clinType === 'subj' || s.clinType === 'func' ? s.clinType : (s.habitual ? 'subj' : 'func');
  /** niveau de réponse le plus élevé d'une stimulation */
  function stimLevel(s) { return s.sz ? 'sz' : s.ad ? 'ad' : s.clin ? clinTypeOf(s) : 'none'; }
  function levelMax(a, b) { return RESP_ORDER.indexOf(a) >= RESP_ORDER.indexOf(b) ? a : b; }
  /** résumé court d'une stimulation : « 2 mA · clinique : peur (hab.) · PD 6 s · crise hab. · CCEP B’1-2 » */
  function stimSummary(s) {
    const parts = [];
    if (s.clin) parts.push((clinTypeOf(s) === 'subj' ? 'subjective' : 'fonctionnelle') + (s.clinText ? ' : ' + s.clinText : '') + (s.habitual ? ' (hab.)' : ''));
    if (s.ad) parts.push('PD' + (s.adDur ? ' ' + s.adDur + ' s' : ''));
    if (s.sz) parts.push('crise' + (s.szHabitual ? ' habituelle' : ' non habituelle'));
    if (!parts.length) parts.push('RAS');
    if (s.ccep && s.ccep.length) parts.push('CCEP ' + s.ccep.join(', '));
    if (s.eeg) parts.push('EEG : ' + s.eeg);
    return parts.join(' · ');
  }
  /** types de réponse d'une stimulation (crise, post-décharge, clinique ; « none » si aucun) */
  function stimTypes(s) { const t = []; if (s.sz) t.push('sz'); if (s.ad) t.push('ad'); if (s.clin) t.push(clinTypeOf(s)); return t.length ? t : ['none']; }
  /** types de réponse obtenus sur une paire (union), du plus fort au plus faible ; « none » seulement si aucune réponse */
  function pairResponseTypes(list) { const set = new Set(); for (const s of list) for (const t of stimTypes(s)) if (t !== 'none') set.add(t); const out = ['sz', 'ad', 'subj', 'func'].filter(t => set.has(t)); return out.length ? out : ['none']; }
  /** intensités efficaces pour un type de réponse : « min X mA » si la réponse est obtenue à X et à toutes les intensités supérieures testées,
   *  « [X–Y] mA » si une intensité supérieure à Y a été testée sans cette réponse, « X mA » si une seule intensité efficace suivie d'un échec */
  function effectiveRange(list, type) {
    const pos = list.filter(s => stimTypes(s).includes(type)).map(s => s.mA); if (!pos.length) return '';
    const lo = Math.min(...pos), hi = Math.max(...pos), above = list.some(s => s.mA > hi && !stimTypes(s).includes(type));
    const n = x => (Math.round(x * 10) / 10).toLocaleString(SV.LOC, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    if (!above) return 'min ' + n(lo) + ' mA';
    return lo === hi ? n(lo) + ' mA' : '[' + n(lo) + '–' + n(hi) + '] mA';
  }
  function fmtA(x) { return (Math.round(x * 10) / 10).toLocaleString(SV.LOC, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' mA'; }

  // ---------------------------------------------------------------- palettes
  const POLY = {
    viridis: [[0.2777273272234177, 0.005407344544966578, 0.3340998053353061], [0.1050930431085774, 1.404613529898575, 1.384590162594685], [-0.3308618287255563, 0.214847559468213, 0.09509516302823659], [-4.634230498983486, -5.799100973351585, -19.33244095627987], [6.228269936347081, 14.17993336680509, 56.69055260068105], [4.776384997670288, -13.74514537774601, -65.35303263337234], [-5.435455855934631, 4.645852612178535, 26.3124352495832]],
    inferno: [[0.0002189403691192265, 0.001651004631001012, -0.01948089843709184], [0.1065134194856116, 0.5639564367884091, 3.932712388889277], [11.60249308247187, -3.972853965665698, -15.9423941062914], [-41.70399613139459, 17.43639888205313, 44.35414519872813], [77.162935699427, -33.40235894210092, -81.80730925738993], [-71.31942824499214, 32.62606426397723, 73.20951985803202], [25.13112622477341, -12.24266895238567, -23.07032500287172]],
    plasma: [[0.05873234392399702, 0.02333670892565664, 0.5433401826748754], [2.176514634195958, 0.2383834171260182, 0.7539604599784036], [-2.689460476458034, -7.455851135738909, 3.110799939717086], [6.130348345893603, 42.3461881477227, -28.51885465332158], [-11.10743619062271, -82.66631109428045, 60.13984767418263], [10.02306557647065, 71.41361770095349, -54.07218655560067], [-3.658713842777788, -22.93153465461149, 18.19190778539828]],
    magma: [[-0.002136485053939582, -0.000749655052795221, -0.005386127855323933], [0.2516605407371642, 0.6775232436837668, 2.494026599312351], [8.353717279216625, -3.577719514958484, 0.3144679030132573], [-27.66873308576866, 14.26473078096533, -13.64921318813922], [52.17613981234068, -27.94360607168351, 12.94416944238394], [-50.76852536473588, 29.04658282127291, 4.23415299384598], [18.65570506591883, -11.48977351997711, -5.601961508734096]],
  };
  function poly(c, t) { const r = [0, 0, 0]; for (let k = 0; k < 3; k++) { let v = c[6][k]; for (let i = 5; i >= 0; i--) v = c[i][k] + t * v; r[k] = Math.max(0, Math.min(255, Math.round(v * 255))); } return r; }
  function lerpStops(stops, t) { for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) { const [t0, a] = stops[i - 1], [t1, b] = stops[i], f = (t - t0) / (t1 - t0 || 1); return [0, 1, 2].map(k => Math.round(a[k] + (b[k] - a[k]) * f)); } return stops[stops.length - 1][1]; }
  const CMAPS = {
    viridis: { fr: 'viridis', f: t => poly(POLY.viridis, t) },
    inferno: { fr: 'inferno', f: t => poly(POLY.inferno, t) },
    plasma: { fr: 'plasma', f: t => poly(POLY.plasma, t) },
    magma: { fr: 'magma', f: t => poly(POLY.magma, t) },
    parula: { fr: 'parula (Matlab, AnyWave)', f: t => lerpStops([[0, [62, 38, 168]], [0.1, [71, 71, 235]], [0.2, [62, 111, 255]], [0.3, [39, 150, 235]], [0.4, [8, 181, 208]], [0.5, [49, 198, 159]], [0.6, [113, 207, 106]], [0.7, [183, 201, 58]], [0.8, [236, 185, 51]], [0.9, [252, 206, 37]], [1, [249, 251, 14]]], t) },
    hot: { fr: 'chaud (noir → rouge → jaune)', f: t => lerpStops([[0, [20, 10, 10]], [0.35, [200, 30, 20]], [0.7, [255, 180, 30]], [1, [255, 250, 210]]], t) },
    coolwarm: { fr: 'bleu → blanc → rouge', f: t => lerpStops([[0, [59, 76, 192]], [0.5, [221, 221, 221]], [1, [180, 4, 38]]], t) },
    episcope: { fr: 'EpiScope (or → carmin)', f: t => SV.rampColor(t).map(Math.round) },
  };
  function cmap(name, t) { const c = CMAPS[name] || CMAPS.viridis; return c.f(Math.max(0, Math.min(1, isFinite(t) ? t : 0))); }
  function cmapCss(name) { const st = []; for (let i = 0; i <= 10; i++) st.push(`rgb(${cmap(name, i / 10).join(',')})`); return `linear-gradient(90deg, ${st.join(', ')})`; }

  // ---------------------------------------------------------------- lecture de tableaux
  /** lit un fichier CSV / TSV / TXT / XLSX → {sheets:[{name, rows:[[cellules]]}]} */
  async function readTable(file) {
    const name = (file.name || '').toLowerCase();
    if (/\.xlsx$|\.xlsm$/.test(name)) return { sheets: await readXlsx(await file.arrayBuffer()) };
    if (/\.xls$/.test(name)) throw new Error('Format .xls (Excel 97-2003) non lu : enregistrez en .xlsx ou .csv');
    const text = await file.text();
    return { sheets: [{ name: file.name, rows: parseDelimited(text) }] };
  }
  /** texte délimité (séparateur détecté : tabulation, point-virgule, virgule, espaces) → lignes de cellules */
  function parseDelimited(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
    const head = lines.slice(0, 5).join('\n');
    const count = re => (head.match(re) || []).length;
    const sep = count(/\t/g) >= lines.length - 1 && count(/\t/g) > 0 ? '\t' : count(/;/g) > count(/,/g) ? ';' : count(/,/g) > 0 ? ',' : null;
    if (sep === null) return lines.map(l => l.trim().split(/\s+/));
    return SV.CSV.parseRows ? SV.CSV.parseRows(text, sep) : lines.map(l => l.split(sep).map(c => c.trim().replace(/^"|"$/g, '')));
  }
  /** nombre : accepte la virgule décimale et les espaces */
  function toNum(v) { if (typeof v === 'number') return v; if (v == null) return NaN; const s = String(v).trim().replace(/\s/g, '').replace(',', '.'); if (s === '' || !/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return NaN; return parseFloat(s); }
  /** détecte la ligne d'en-tête, la colonne des étiquettes de plots et les colonnes numériques candidates */
  function detectColumns(rows) {
    const R = rows.filter(r => r && r.some(c => String(c == null ? '' : c).trim() !== ''));
    if (!R.length) return { header: false, labelCol: -1, numCols: [], rows: [] };
    const width = Math.max(...R.map(r => r.length)), first = R[0];
    const labelScore = col => R.reduce((n, r) => n + (parseLabel(r[col]) ? 1 : 0), 0);
    let labelCol = -1, best = 0; for (let c = 0; c < width; c++) { const s = labelScore(c); if (s > best) { best = s; labelCol = c; } }
    const header = first.some((c, i) => i !== labelCol && String(c == null ? '' : c).trim() !== '' && isNaN(toNum(c))) || (labelCol >= 0 && !parseLabel(first[labelCol]));
    const body = header ? R.slice(1) : R, numCols = [];
    for (let c = 0; c < width; c++) {
      if (c === labelCol) continue;
      const vals = body.map(r => toNum(r[c])).filter(v => !isNaN(v)); const nonEmpty = body.filter(r => String(r[c] == null ? '' : r[c]).trim() !== '').length;
      if (vals.length && vals.length >= 0.5 * Math.max(1, nonEmpty)) numCols.push({ idx: c, name: header ? String(first[c] || 'colonne ' + (c + 1)).trim() : 'colonne ' + (c + 1), n: vals.length, min: Math.min(...vals), max: Math.max(...vals) });
    }
    return { header, labelCol, numCols, rows: body, labelName: header && labelCol >= 0 ? String(first[labelCol] || '').trim() : '' };
  }
  /** valeurs d'une colonne, par étiquette normalisée ; les étiquettes inconnues du schéma sont listées à part */
  function extractValues(body, labelCol, valCol, elecs) {
    const values = {}, unmatched = [], dup = new Set();
    for (const r of body) {
      const p = parseLabel(r[labelCol]), v = toNum(r[valCol]); if (!p || isNaN(v)) continue;
      const e = findElec(elecs, p.elec), key = pairLabel(e ? e.name : p.elec, p.c1, p.c2);
      if (!e || p.c1 > e.nContacts || (p.c2 != null && p.c2 > e.nContacts)) { unmatched.push(key); continue; }
      if (values[key] !== undefined) dup.add(key); values[key] = v;
    }
    return { values, unmatched: [...new Set(unmatched)], duplicates: [...dup] };
  }

  // ---------------------------------------------------------------- XLSX (zip + SpreadsheetML)
  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') throw new Error('Ce navigateur ne sait pas décompresser le XLSX : enregistrez en CSV');
    const ds = new DecompressionStream('deflate-raw');
    return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer());
  }
  async function unzip(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(buf), n = u8.length, td = new TextDecoder();
    let eocd = -1; for (let i = n - 22; i >= Math.max(0, n - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Fichier XLSX invalide (archive)');
    const count = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true); const entries = new Map();
    for (let i = 0; i < count; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      const name = td.decode(u8.subarray(p + 46, p + 46 + nl)); entries.set(name, { method, csize, usize, off }); p += 46 + nl + el + cl;
    }
    return {
      names: [...entries.keys()],
      async read(name) {
        const e = entries.get(name); if (!e) return null;
        const nl = dv.getUint16(e.off + 26, true), el = dv.getUint16(e.off + 28, true), start = e.off + 30 + nl + el, data = u8.subarray(start, start + e.csize);
        const bytes = e.method === 0 ? data : e.method === 8 ? await inflateRaw(data) : null; if (!bytes) throw new Error('Compression non gérée');
        return td.decode(bytes);
      },
    };
  }
  function colIndex(ref) { let c = 0; for (const ch of ref.replace(/\d+/g, '')) c = c * 26 + (ch.charCodeAt(0) - 64); return c - 1; }
  async function readXlsx(buf) {
    const z = await unzip(buf), xml = s => new DOMParser().parseFromString(s, 'application/xml');
    const wb = await z.read('xl/workbook.xml'); if (!wb) throw new Error('XLSX : classeur introuvable');
    const rels = await z.read('xl/_rels/workbook.xml.rels'), relMap = new Map();
    if (rels) for (const r of xml(rels).getElementsByTagName('Relationship')) relMap.set(r.getAttribute('Id'), r.getAttribute('Target'));
    const shared = []; const ss = await z.read('xl/sharedStrings.xml');
    if (ss) for (const si of xml(ss).getElementsByTagName('si')) shared.push([...si.getElementsByTagName('t')].map(t => t.textContent).join(''));
    const sheets = [];
    for (const sh of xml(wb).getElementsByTagName('sheet')) {
      const rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      let target = relMap.get(rid) || ('worksheets/sheet' + sh.getAttribute('sheetId') + '.xml'); target = target.replace(/^\/?xl\//, '').replace(/^\//, '');
      const sx = await z.read('xl/' + target); if (!sx) continue;
      const rows = [];
      for (const row of xml(sx).getElementsByTagName('row')) {
        const ri = +row.getAttribute('r') - 1, out = rows[ri] = rows[ri] || [];
        for (const c of row.getElementsByTagName('c')) {
          const ref = c.getAttribute('r') || '', ci = ref ? colIndex(ref) : out.length, t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0];
          let val = '';
          if (t === 's') val = shared[+(v ? v.textContent : 0)] || '';
          else if (t === 'inlineStr') val = [...c.getElementsByTagName('t')].map(x => x.textContent).join('');
          else if (t === 'b') val = v && v.textContent === '1' ? 'VRAI' : 'FAUX';
          else if (t === 'str' || t === 'e') val = v ? v.textContent : '';
          else val = v ? (isNaN(parseFloat(v.textContent)) ? v.textContent : parseFloat(v.textContent)) : '';
          out[ci] = val;
        }
      }
      for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
      sheets.push({ name: sh.getAttribute('name') || 'Feuille', rows });
    }
    if (!sheets.length) throw new Error('XLSX : aucune feuille');
    return sheets;
  }

  SV.Seeg = { normName, parseLabel, pairLabel, findElec, parseRanges, pairsOf, pairPoint, pairStructures, STIM_MODES, RESP, RESP_ORDER, clinTypeOf, stimLevel, levelMax, stimSummary, fmtA, stimTypes, pairResponseTypes, effectiveRange, CMAPS, cmap, cmapCss, readTable, parseDelimited, toNum, detectColumns, extractValues, readXlsx };
})(window.SV = window.SV || {});
