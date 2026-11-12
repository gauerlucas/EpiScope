/* EpiScope — ieeg_ui.js : tracés SEEG dans SEEG › Analyses — import, visionneuse, index d'épileptogénicité (v4.12).
 *   - import : BrainVision (.vhdr + .eeg + .vmrk), EDF / EDF+ / BDF, ou .eeg d'un dossier BIDS (channels.tsv + _ieeg.json,
 *     events.tsv) ; les fichiers sont rangés tels quels dans le dossier du patient (ieeg/<id>/…), rien ne quitte le poste ;
 *     channels.tsv et events.tsv joints complètent le statut des voies (voies « bad ») et les évènements ;
 *   - visionneuse plein écran : montage monopolaire ou bipolaire, filtres d'affichage, page, gain, électrodes affichées,
 *     évènements du fichier, début / fin de crise et marques au clic droit, aperçu de tout l'enregistrement (avec la carte
 *     du rapport d'énergie une fois calculé) ;
 *   - index d'épileptogénicité de Bartolomei, Chauvel et Wendling (Brain 2008) recalculé localement (ieeg.js) : rapport
 *     d'énergie dans des workers, Page–Hinkley et EI recalculés en direct quand ν et λ changent, détections corrigeables à
 *     la main (Alt + clic sur la voie), résultat versé dans un jeu d'Analyses (sphères sur les plots en 3D) ou en CSV.
 *   ex.recordings = [{ id, title, format, files: { rôle: chemin }, fs, nch, nSamples, duration, channels, events, warnings,
 *     line, marks: { onset, end, user: [{ t, label }] }, seizureId, elecMap: { préfixe du tracé: électrode du schéma },
 *     view, ei: { params, manual: { voie: t }, excluded: [voies], last: { N0, rows, params }, quantId } }]          */
(function (SV) {
  'use strict';
  const $ = id => document.getElementById(id), S = SV.Seeg, ST = SV.Store, L = SV.Library, IE = SV.IEEG;
  const esc = SV.U.esc;
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const nf = (v, d = 2) => v == null || !isFinite(v) ? '—' : (+v).toLocaleString(SV.LOC, { maximumFractionDigits: d });
  const num = (v, d) => { const x = parseFloat(String(v).replace(',', '.')); return isFinite(x) ? x : d; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmtDur = s => { s = Math.max(0, s || 0); const m = Math.floor(s / 60), r = Math.round(s - 60 * m); return m ? `${m} min${r ? ' ' + r + ' s' : ''}` : `${nf(s, 1)} s`; };
  const clock = s => { const neg = s < 0; s = Math.abs(s); const m = Math.floor(s / 60), r = s - 60 * m; return (neg ? '−' : '') + m + ':' + (r < 10 ? '0' : '') + r.toFixed(1); };
  const AMPS = [2, 5, 10, 20, 50, 100, 200, 300, 500, 1000, 2000, 5000, 10000, 20000];
  const FILES = /\.(vhdr|vmrk|eeg|edf|bdf|tsv|json)$/i, ACCEPT = '.vhdr,.vmrk,.eeg,.edf,.bdf,.tsv,.json';
  const FMT = { brainvision: 'BrainVision', 'bids-raw': '.eeg BIDS', edf: 'EDF', 'edf+': 'EDF+', bdf: 'BDF' };
  const MONO = 'Cascadia Mono, Consolas, Menlo, monospace';
  /** couleurs du tracé : thème sombre (défaut) ou clair (papier) */
  const THEME = {
    dark: { bg: '#0b0e13', grid: 'rgba(255,255,255,0.055)', tick: '#5c6675', sep: '#273041', band: 'rgba(255,255,255,0.02)', sel: 'rgba(242,184,75,0.09)', selTxt: '#f2b84b', txt: '#cfd6e0', txtBad: '#5c6675', txtOther: '#8f99a8', trace: '#c9d2de', traceBad: '#4a5262', traceOther: '#7d8796', traceExc: '#6b7480', heatTrace: '#ff3b3b', barBg: '#1b212c', lblBg: 'rgba(11,14,19,0.85)', cursor: 'rgba(255,255,255,0.6)', win: 'rgba(76,201,240,0.055)', ref: 'rgba(76,201,240,0.025)', scroll: 'rgba(255,255,255,0.12)', ov: '#10141b', ovEnv: '#2b3443', halo: 'rgba(0,0,0,0.55)' },
    light: { bg: '#ffffff', grid: 'rgba(0,0,0,0.07)', tick: '#6b7280', sep: '#c7ced8', band: 'rgba(15,40,80,0.035)', sel: 'rgba(242,170,40,0.16)', selTxt: '#a45f00', txt: '#1f2937', txtBad: '#9aa3ae', txtOther: '#6b7280', trace: '#111827', traceBad: '#b8bfc8', traceOther: '#6b7280', traceExc: '#9aa3ae', heatTrace: '#c40000', barBg: '#e5e9ef', lblBg: 'rgba(255,255,255,0.9)', cursor: 'rgba(0,0,0,0.55)', win: 'rgba(40,120,200,0.07)', ref: 'rgba(40,120,200,0.035)', scroll: 'rgba(0,0,0,0.18)', ov: '#f1f4f8', ovEnv: '#b9c3d0', halo: 'rgba(255,255,255,0.75)' },
  };
  /** marqueurs de détection : couleurs absentes des palettes ER (parula, hot…) et double liseré noir puis blanc, lisibles
   *  sur fond sombre, sur fond clair et sur la carte du rapport d'énergie */
  const MK = { nd: '#ff2bd6', man: '#ffb000', na: '#22e06b', n0: '#ff2bd6' };
  function glyph(g, shape, x, y, s, fill) {
    g.save(); g.lineJoin = 'round'; g.setLineDash([]); g.beginPath();
    if (shape === 'tri') { g.moveTo(x, y + s * 0.75); g.lineTo(x - s * 0.8, y - s * 0.65); g.lineTo(x + s * 0.8, y - s * 0.65); g.closePath(); }
    else if (shape === 'dia') { g.moveTo(x, y - s * 0.8); g.lineTo(x + s * 0.7, y); g.lineTo(x, y + s * 0.8); g.lineTo(x - s * 0.7, y); g.closePath(); }
    else g.arc(x, y, s * 0.62, 0, 2 * Math.PI);
    if (shape === 'ring') { g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,0.85)'; g.stroke(); g.lineWidth = 3.2; g.strokeStyle = '#fff'; g.stroke(); g.lineWidth = 1.7; g.strokeStyle = fill; g.stroke(); }
    else { g.lineWidth = 4.4; g.strokeStyle = 'rgba(0,0,0,0.85)'; g.stroke(); g.lineWidth = 2.4; g.strokeStyle = '#fff'; g.stroke(); g.fillStyle = fill; g.fill(); }
    g.restore();
  }
  /** trait vertical d'une détection sur la hauteur de la voie */
  function tick(g, x, y0, y1, col) { g.save(); g.setLineDash([]); g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.lineWidth = 3.6; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.stroke(); g.lineWidth = 1.6; g.strokeStyle = col; g.stroke(); g.restore(); }
  /** icônes de la légende (mêmes formes) */
  const LG = {
    nd: `<svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 3V14" stroke="#000" stroke-opacity=".6" stroke-width="3.4"/><path d="M7 3V14" stroke="${MK.nd}" stroke-width="1.6"/><path d="M7 8.2L2.6 1.2H11.4Z" fill="${MK.nd}" stroke="#000" stroke-width="1.1" stroke-linejoin="round"/></svg>`,
    man: `<svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 3V14" stroke="#000" stroke-opacity=".6" stroke-width="3.4"/><path d="M7 3V14" stroke="${MK.man}" stroke-width="1.6"/><path d="M7 .8L11 5 7 9.2 3 5Z" fill="${MK.man}" stroke="#000" stroke-width="1.1" stroke-linejoin="round"/></svg>`,
    na: `<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="4" fill="none" stroke="#000" stroke-width="4.2"/><circle cx="7" cy="7" r="4" fill="none" stroke="#fff" stroke-width="2.6"/><circle cx="7" cy="7" r="4" fill="none" stroke="${MK.na}" stroke-width="1.4"/></svg>`,
    n0: `<svg width="8" height="14"><path d="M4 0V14" stroke="${MK.n0}" stroke-width="1.8" stroke-dasharray="3 2"/></svg>`,
  };
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } };

  // ---------------------------------------------------------------- données décodées (en mémoire, 2 tracés au plus)
  const MEM = new Map();
  const memPut = (id, m) => { MEM.delete(id); MEM.set(id, m); while (MEM.size > 2) MEM.delete(MEM.keys().next().value); };
  const stemOf = n => n.replace(/_(ieeg|eeg)\.(vhdr|vmrk|eeg|edf|bdf)$/i, '').replace(/\.(vhdr|vmrk|eeg|edf|bdf)$/i, '');
  /** fichiers choisis → enregistrements { kind, title, files: { vhdr, eeg, vmrk, edf, channels, events, json } } */
  async function groupFiles(files) {
    const by = new Map(files.map(f => [f.name.toLowerCase(), f])), used = new Set(), out = [];
    const side = (stem, suf) => by.get((stem + suf).toLowerCase()) || null;
    const only = re => { const l = files.filter(f => re.test(f.name)); return l.length === 1 ? l[0] : null; };
    const sidecars = stem => ({ channels: side(stem, '_channels.tsv') || only(/channels\.tsv$/i), events: side(stem, '_events.tsv') || only(/events\.tsv$/i), json: side(stem, '_ieeg.json') || side(stem, '_eeg.json') || only(/_i?eeg\.json$/i) });
    for (const f of files.filter(x => /\.vhdr$/i.test(x.name))) {
      let info; try { info = IE.vhdrInfo(await f.text()); } catch (e) { out.push({ error: f.name + ' : ' + e.message }); continue; }
      const st = f.name.replace(/\.vhdr$/i, ''), eeg = (info.dataFile && by.get(info.dataFile.toLowerCase())) || side(st, '.eeg'), vmrk = (info.markerFile && by.get(info.markerFile.toLowerCase())) || side(st, '.vmrk');
      const g = { kind: 'brainvision', title: stemOf(f.name), files: Object.assign({ vhdr: f, eeg, vmrk }, sidecars(stemOf(f.name))) };
      if (!eeg) { out.push({ error: `${f.name} : choisir aussi le fichier de données ${info.dataFile || st + '.eeg'}` }); continue; }
      Object.values(g.files).forEach(x => x && used.add(x)); out.push(g);
    }
    for (const f of files.filter(x => /\.(edf|bdf)$/i.test(x.name))) { const g = { kind: 'edf', title: stemOf(f.name), files: Object.assign({ edf: f }, sidecars(stemOf(f.name))) }; Object.values(g.files).forEach(x => x && used.add(x)); out.push(g); }
    for (const f of files.filter(x => /\.eeg$/i.test(x.name) && !used.has(x))) {
      const g = { kind: 'bids-raw', title: stemOf(f.name), files: Object.assign({ eeg: f }, sidecars(stemOf(f.name))) };
      if (!g.files.channels) { out.push({ error: `${f.name} : sans .vhdr, joindre channels.tsv et _ieeg.json (dossier BIDS)` }); continue; }
      Object.values(g.files).forEach(x => x && used.add(x)); out.push(g);
    }
    if (!out.length) out.push({ error: 'aucun tracé reconnu : un .vhdr (avec .eeg et .vmrk), un .edf / .bdf, ou un .eeg BIDS avec channels.tsv et _ieeg.json' });
    return out;
  }
  async function partsOf(files) { const P = {}; for (const [k, f] of Object.entries(files)) if (f) P[k] = /^(eeg|edf)$/.test(k) ? await f.arrayBuffer() : await f.text(); return P; }
  const niceTitle = t => { const m = String(t).match(/sub-([^_]+).*?task-([^_]+)(?:.*?run-([^_]+))?/i); return m ? `${m[2]}${m[3] ? ' · run ' + m[3] : ''} (sub-${m[1]})` : String(t).replace(/_ieeg$/i, ''); };

  /** tracé d'une voie (min / max par colonne de pixels au-delà de 2 échantillons par pixel) ; ligne de base = moyenne */
  const LANE_COLS = [['', 'auto'], ['#ff5a5f', 'rouge'], ['#4c9ff0', 'bleu'], ['#3fbf6f', 'vert'], ['#f2a33a', 'orange'], ['#b07cf2', 'violet'], ['none', 'aucune']];   // couleur d'une voie (ECG en rouge par défaut)
  function trace(g, y, xs, spx, yc, ppu) {
    const n = y.length; if (n < 2) return; let m = 0; for (let i = 0; i < n; i++) m += y[i]; m /= n;
    g.beginPath();
    if (spx >= 0.5) for (let i = 0; i < n; i++) { const x = xs + i * spx, v = yc - (y[i] - m) * ppu; if (i) g.lineTo(x, v); else g.moveTo(x, v); }
    else { const per = 1 / spx; for (let px = 0; ; px++) { const a = Math.floor(px * per); if (a >= n) break; const b = Math.min(n, Math.floor((px + 1) * per)); let lo = Infinity, hi = -Infinity; for (let i = a; i < b; i++) { const v = y[i]; if (v < lo) lo = v; if (v > hi) hi = v; } const x = xs + px, yh = yc - (hi - m) * ppu, yl = yc - (lo - m) * ppu; if (px) g.lineTo(x, yh); else g.moveTo(x, yh); g.lineTo(x, yl); } }
    g.stroke();
  }

  const M = {
    ieegEx() { const d = this.dossier; if (!d || !this.ctx) return null; const c = ST.resolveCtx(d, this.ctx), ex = c && c.exploration; return ex && ex.kind === 'seeg' ? ex : null; },

    // ------------------------------------------------------------------ carte « Tracés SEEG » (Analyses)
    /** nature d'un tracé : critique ('ictal' : une crise) ou intercritique ('inter') — choisie dans ⋯, sinon devinée */
    ieegKind(r) {
      if (r.kind) return r.kind; const t = ((r.title || '') + ' ' + Object.values(r.files || {}).join(' ')).toLowerCase();
      if (/inter[ _-]?ictal|intercrit|interict|sleep|sommeil|nuit|night|resting|repos/.test(t)) return 'inter';
      return r.seizureId || (r.marks && r.marks.onset != null) || /seiz|crise|ictal|\bsz/.test(t) ? 'ictal' : 'inter';
    },
    /** jeu rangé avec un tracé (ou dans la synthèse des crises) plutôt que dans « Autres jeux » */
    quantGrouped(q) { const ex = this.ieegEx(); return !!ex && (!!(q.eimax || q.smax) || (!!q.ieeg && (ex.recordings || []).some(r => r.id === q.ieeg))); },
    /** méthode d'un jeu (ei, cei, pei, fp, em…) d'après ses marques */
    quantMethod(q) { return q.method || (q.smax && q.smax.m) || (q.eimax || /^EI\b/.test(q.source || '') ? 'ei' : ''); },
    /** seuil de surlignage d'un jeu (zone épileptogène) : q.thr s'il est porté par le jeu (empreinte, EM), sinon EI 0,4 ; cEI 0,6 ; PEI 0,72 (IE.EZT) ; null sans seuil reconnu */
    quantThreshold(q) { if (q.thr != null && isFinite(q.thr)) return +q.thr; const m = this.quantMethod(q), T = IE.EZT; return m === 'ei' ? T.ei : m === 'cei' ? T.cei : m === 'pei' ? T.pei : null; },
    /** seuil bas de la zone de propagation (EI et EImax : 0,1 < EI < 0,4) ; null pour les autres jeux */
    quantPZ(q) { if (q.pz != null && isFinite(q.pz)) return +q.pz; return this.quantMethod(q) === 'ei' && !(q.thr != null && isFinite(q.thr)) ? IE.EZT.eiPZ : null; },
    /** ordre des jeux d'un tracé : EI, cEI, PEI, h², pointes et HFO, autres */
    quantMethodRank(q) { const m = q.method || (/^EI\b/.test(q.source || '') ? 'ei' : ''); return m === 'ei' ? 0 : m === 'cei' ? 1 : m === 'pei' ? 2 : /^h2/.test(m) ? 3 : m === 'fp' ? 3.5 : m === 'fpc' ? 3.6 : m === 'em' ? 3.7 : /^hfo/.test(m) ? 4 : 5; },
    /** jeux d'analyse dans l'ordre des comptes rendus : intercritique (tracé par tracé), chaque crise (par type d'analyse),
     *  synthèse des crises (EImax, cEImax, PEImax), autres analyses (importées, saisies) : [{ title, kind, sets }] */
    quantReportGroups(ex, sets) {
      ex = ex || this.ieegEx(); sets = sets || (ex && ex.quant) || (this.state && this.state.quant) || []; const recs = (ex && ex.recordings) || [], d = this.dossier;
      const lab = r => { const sz = r.seizureId && d && ST.byId(d.seizures, r.seizureId); return sz ? sz.label : ''; }, VIG = { wake: 'veille', nrem: 'sommeil lent', rem: 'sommeil paradoxal', mixed: 'veille et sommeil' };
      const used = new Set(), out = [], take = (title, kind, L, rec) => { L = L.filter(q => !used.has(q.id)); if (!L.length) return; L.forEach(q => used.add(q.id)); out.push({ title, kind, sets: L, rec: rec || null }); };
      const own = r => sets.filter(q => q.ieeg === r.id && !q.eimax && !q.smax).sort((a, b) => this.quantMethodRank(a) - this.quantMethodRank(b));
      for (const r of recs.filter(r => this.ieegKind(r) === 'inter')) take(`Intercritique — ${r.title}${r.vigil ? ' (' + VIG[r.vigil] + ')' : ''}`, 'inter', own(r), r);
      for (const r of recs.filter(r => this.ieegKind(r) === 'ictal')) {
        // v5 : un tracé peut porter plusieurs crises (q.seizureId) ; chaque crise a son groupe, dans l'ordre chronologique
        const mine = own(r), ids = [...new Set(mine.map(q => q.seizureId || r.seizureId || ''))].sort((a, b) => { const za = d && ST.byId(d.seizures, a), zb = d && ST.byId(d.seizures, b); return String(za ? za.datetime : '').localeCompare(String(zb ? zb.datetime : '')); });
        for (const id of ids) { const sz = id && d && ST.byId(d.seizures, id), l = sz ? sz.label : ''; take(`Crise — ${l || r.title}${l && l !== r.title ? ' (' + r.title + ')' : ''}`, 'ictal', mine.filter(q => (q.seizureId || r.seizureId || '') === id), r); }
      }
      const sr = q => q.eimax ? 0 : q.smax && q.smax.m === 'cei' ? 1 : q.smax && q.smax.m === 'pei' ? 2 : 3;
      take('Synthèse des crises', 'synth', sets.filter(q => q.eimax || q.smax).sort((a, b) => sr(a) - sr(b)));
      take(out.length ? 'Autres analyses' : '', 'other', sets.filter(q => !used.has(q.id)));
      return out;
    },
    // ------------------------------------------------------------------ carte « Tracés SEEG » (Analyses) : un tracé par carte et ses jeux (rec_cards.js), synthèse des crises
    renderIeegCard() {
      const box = $('tab-quant'), ex = this.ieegEx(); if (!box || !ex) return; const recs = ex.recordings || [], quant = (this.state && this.state.quant) || [];
      const synth = quant.filter(q => q.eimax || q.smax), ict = recs.filter(r => this.ieegKind(r) === 'ictal'), n = k => ict.reduce((c, r) => c + (this.ieegMaxRows(r, k).length ? 1 : 0) + Object.values(r.bySz || {}).filter(sl => sl && sl[k] && sl[k].last).length, 0), nE = n('ei'), nC = n('cei'), nP = n('pei'), canMax = Math.max(nE, nC, nP) >= 2;
      const after = canMax || synth.length ? `<div class="rc-day">Synthèse des crises</div><div class="ie-emx"><div class="ie-emxh"><span class="muted">valeur maximale de chaque plot parmi les crises</span><button class="ie-emxb"${canMax ? '' : ' disabled'} title="Valeur maximale de l’EI, du cEI ou du PEI de chaque plot parmi plusieurs crises (EI : ${nE} tracés, cEI : ${nC}, PEI : ${nP})">EImax · cEImax · PEImax…</button></div>${synth.length ? `<div class="qx-list">${synth.map(q => this.quantRowHtml(q)).join('')}</div>` : ''}</div>` : '';
      this.recCardsRender(box, ex, { kind: 'seeg', after });
      const emx = box.querySelector('.ie-emxb'); if (emx) emx.onclick = () => this.ieegEIMax();
    },
    async ieegImport(files) {
      const d = this.dossier, ex = this.ieegEx(); if (!d || !ex) return null;
      files = files.filter(f => FILES.test(f.name)); const list = ex.recordings = ex.recordings || []; let last = null;
      for (const g of await groupFiles(files)) {
        if (g.error) { this.toast(g.error, 7000); continue; }
        const job = this.jobStart('Tracé SEEG · ' + niceTitle(g.title));
        try {
          job.progress(0.1, 'lecture');
          const mem = IE.openRecording(await partsOf(g.files)), id = uid('R');
          if (!mem.nSamples) throw new Error('aucun échantillon lisible');
          const rec = { id, title: niceTitle(g.title), format: mem.kind, files: {}, fs: mem.fs, nch: mem.channels.length, nSamples: mem.nSamples, duration: mem.duration,
            channels: mem.channels.map(c => ({ name: c.name, type: c.type, status: c.status })), events: mem.events.map(e => ({ onset: e.onset, duration: e.duration || 0, label: e.label })),
            warnings: mem.warnings, line: mem.line || 50, startDate: mem.startDate || '', startTime: mem.startTime || '', marks: Object.assign(IE.seizureMarks(mem.events), { user: [] }), seizureId: null, elecMap: {}, view: null, ei: null, created: ST.now() };
          job.progress(0.6, 'rangement dans le dossier');
          for (const [k, f] of Object.entries(g.files)) if (f) { const p = `ieeg/${id}/${f.name}`; await L.writeFile(d, p, f); rec.files[k] = p; }
          rec.kind = this.ieegKind(rec); list.push(rec); memPut(id, mem); last = rec;
          job.done(`${rec.title} : ${rec.nch} voies, ${fmtDur(rec.duration)} à ${nf(rec.fs, 0)} Hz${mem.warnings.length ? ' — ' + mem.warnings[0] : ''}`);
        } catch (e) { console.warn(e); job.fail(e.message); }
      }
      if (last) { this.touch('exploration', ex.id, 'tracé SEEG'); await this.flushSave(); this.renderQuant(); }
      return last;
    },
    async ieegRemove(r) {
      const ex = this.ieegEx(); if (!ex || !confirm(`Supprimer le tracé « ${r.title} » et ses fichiers du dossier ?${r.ei && r.ei.quantId ? '\n(Le jeu d’EI enregistré dans Analyses est conservé.)' : ''}`)) return;
      for (const p of Object.values(r.files || {}).concat(Object.values((r.ei && r.ei.erCache) || {}).map(c => c.path))) await L.removeFile(this.dossier, p).catch(() => { });
      ex.recordings = ex.recordings.filter(x => x !== r); MEM.delete(r.id); this.touch('exploration', ex.id, 'tracé SEEG supprimé'); this.renderQuant();
    },
    async ieegMem(rec) {
      if (MEM.has(rec.id)) return MEM.get(rec.id);
      const files = {};
      for (const [k, p] of Object.entries(rec.files || {})) { const b = await L.readFile(this.dossier, p).catch(() => null); if (b) files[k] = b; else if (/^(vhdr|eeg|edf)$/.test(k)) throw new Error(`fichier absent du dossier : ${p.split('/').pop()} (archive légère ?) — réimporter le tracé`); }
      const mem = IE.openRecording(await partsOf(files)); this.ieegMigrateNames(rec, mem); memPut(rec.id, mem); return mem;
    },
    /** tracé importé avant v4.21 (noms de voies « EEG NA1 » des exports Brainquick) relu avec les noms sans préfixe : les
     *  résultats rangés dans le dossier (EI, exclusions, correspondance, empreintes…) sont renommés une fois pour toutes */
    ieegMigrateNames(rec, mem) {
      const old = (rec.channels || []).map(c => c.name), neu = mem.channels.map(c => c.name); if (old.length !== neu.length || !old.length) return;
      const pairs = old.map((o, i) => [o, neu[i]]).filter(([o, n]) => o !== n); if (!pairs.length || !pairs.every(([o, n]) => o.endsWith(n))) return;
      const map = new Map(pairs), re = new RegExp(pairs.map(([o]) => o.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length).join('|'), 'g');
      const ren = s => map.has(s) ? map.get(s) : s.replace(re, m => map.get(m) || m);
      const walk = (x, depth) => { if (depth > 8 || !x || typeof x !== 'object') return x;
        if (Array.isArray(x)) { for (let i = 0; i < x.length; i++) x[i] = typeof x[i] === 'string' ? ren(x[i]) : walk(x[i], depth + 1); return x; }
        for (const k of Object.keys(x)) { const nk = ren(k); const v = typeof x[k] === 'string' ? ren(x[k]) : walk(x[k], depth + 1); if (nk !== k) { delete x[k]; x[nk] = v; } else x[k] = v; } return x; };
      for (const k of ['channels', 'ei', 'cei', 'pei', 'h2', 'fp', 'em', 'hfo', 'view', 'elecMap', 'events']) if (rec[k]) walk(rec[k], 0);
      // la correspondance « EEG NA » → NA devient NA → NA : inutile, retirée (le nom correspond directement)
      for (const [k, v] of Object.entries(rec.elecMap || {})) if (k === v) delete rec.elecMap[k];
      rec.channels.forEach((c, i) => { c.name = neu[i]; if (!c.type) c.type = mem.channels[i].type || ''; });
      rec.namesMigrated = ST.now(); this.touch('exploration', (this.ieegEx() || {}).id, 'voies renommées (sans préfixe)');
    },

    // ------------------------------------------------------------------ visionneuse
    async ieegOpen(rec, withEI) {
      if (!rec) return; let mem;
      try { mem = await this.ieegMem(rec); } catch (e) { console.warn(e); this.toast('Tracé illisible : ' + e.message, 7000); return; }
      this.ieegClose(true);
      const vw = rec.view || {}, mk = rec.marks || (rec.marks = { onset: null, end: null, user: [] }); mk.user = mk.user || [];
      const V = this._iev = { rec, mem, light: lsGet('sv_ieeg_light') === '1', show: Object.assign({ sig: true, er: true, un: true, cmap: 'parula', scale: 'global' }, vw.show || {}), montage: vw.montage || 'bipolar', page: (vw.pageSet && vw.page) || 20, hp: vw.hp != null ? vw.hp : 1, lp: vw.lp || 0, notch: vw.notch === false || vw.notch === 0 ? 0 : +vw.notch > 1 ? +vw.notch : (mem.line || rec.line || 50), amp: null, hide: new Set(), scroll: 0, sel: -1, cursor: null, ei: false, er: null, res: null, resBy: new Map(), cache: new Map() };
      V.t = mk.onset != null ? Math.max(0, mk.onset - V.page * 0.3) : 0;
      const el = V.el = h('div', 'ie-view');
      el.classList.toggle('light', V.light); el.innerHTML = `<div class="ie-top"><b class="ie-title" title="${esc(rec.title)}">${esc(rec.title)}</b><span class="muted">${mem.channels.length} voies · ${nf(mem.fs, 1)} Hz · ${fmtDur(mem.duration)}</span>${mem.warnings.length ? `<span class="ie-warn" title="${esc(mem.warnings.join('\n'))}">⚠ ${esc(mem.warnings[0])}</span>` : ''}
          <span class="seg ie-mont"><button data-m="mono">Monopolaire</button><button data-m="bipolar">Bipolaire</button></span>
          <label>page <select class="ie-page">${[1, 2, 5, 10, 15, 20, 30, 60].map(v => `<option value="${v}">${v} s</option>`).join('')}</select></label>
          <span class="ie-gain" title="Amplitude d’une voie (+ / −)"><button data-g="-1">−</button><span class="ie-amp"></span><button data-g="1">＋</button></span>
          <label>passe-haut <select class="ie-hp">${[[0, 'aucun'], [0.5, '0,5 Hz'], [1, '1 Hz'], [3, '3 Hz'], [5, '5 Hz'], [10, '10 Hz'], [80, '80 Hz (ripples)'], [250, '250 Hz (FR)']].map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
          <label>passe-bas <select class="ie-lp">${[[0, 'aucun'], [30, '30 Hz'], [70, '70 Hz'], [150, '150 Hz'], [300, '300 Hz']].map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
          <label title="Coupe-bande : raie du secteur et son harmonique (50 Hz en Europe, 60 Hz en Amérique du Nord et dans une partie de l’Asie)">secteur <select class="ie-notch">${[[0, 'aucun'], [50, '50 Hz'], [60, '60 Hz']].map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
          <button class="ie-mlb" title="Marques du tracé en liste (signets) : clic pour s’y rendre">Marques ▾</button><span class="spacer"></span><span class="ie-cur"></span>
          <button class="ie-theme" title="Thème clair / sombre du tracé">${V.light ? '☾' : '☀'}</button><button class="ie-eib" hidden title="Panneau d’analyse">Analyses</button><button class="ie-x" title="Fermer (Échap)">✕</button></div>
        <div class="ie-chips"></div><div class="ie-main"><canvas></canvas></div><div class="ie-ovw" title="Aperçu de l’enregistrement : cliquer ou glisser pour s’y rendre"><canvas></canvas></div><aside class="ie-side" hidden><nav class="ie-mt"></nav><div class="ie-mb"></div></aside><div class="ie-sgrip" title="Glisser : largeur du panneau d’analyse" hidden></div><button class="ie-sidetab" title="Afficher le panneau d’analyse (quantifications, source, sommeil)">‹ Analyses</button>`;
      document.body.appendChild(el);
      V.cv = el.querySelector('.ie-main canvas'); V.ov = el.querySelector('.ie-ovw canvas'); V.side = el.querySelector('.ie-side'); V.sb = el.querySelector('.ie-mb');
      const q = s => el.querySelector(s), keep = () => { rec.view = Object.assign(rec.view || {}, { montage: V.montage, page: V.page, hp: V.hp, lp: V.lp, notch: V.notch, show: V.show }); V.dirty = true; };
      q('.ie-mlb').onclick = e => this.ieegMarkList(e.currentTarget);
      q('.ie-page').value = String(V.page); q('.ie-hp').value = String(V.hp); q('.ie-lp').value = String(V.lp); q('.ie-notch').value = String(V.notch);
      el.querySelectorAll('.ie-mont button').forEach(b => b.onclick = () => { V.montage = b.dataset.m; keep(); this.ieegSetMontage(); });
      q('.ie-page').onchange = e => { const c = V.t + V.page / 2; V.page = +e.target.value; V.t = clamp(c - V.page / 2, 0, Math.max(0, mem.duration - V.page)); keep(); rec.view.pageSet = true; this.ieegDraw(); };
      q('.ie-hp').onchange = e => { V.hp = +e.target.value; keep(); V.cache.clear(); this.ieegDraw(); };
      q('.ie-lp').onchange = e => { V.lp = +e.target.value; keep(); V.cache.clear(); this.ieegDraw(); };
      q('.ie-notch').onchange = e => { V.notch = +e.target.value; keep(); V.cache.clear(); this.ieegDraw(); };
      el.querySelectorAll('.ie-gain button').forEach(b => b.onclick = () => this.ieegGain(+b.dataset.g));
      q('.ie-x').onclick = () => this.ieegClose();
      q('.ie-eib').onclick = () => this.ieegEIPanel(!V.ei); q('.ie-sidetab').onclick = () => { lsSet('sv_ieeg_side', '1'); this.ieegEIPanel(true); };
      { const w = +lsGet('sv_ieeg_sidew'); if (w >= 300) el.style.setProperty('--sidew', Math.min(w, 900) + 'px'); const gp = q('.ie-sgrip'); gp.onpointerdown = e => { e.preventDefault(); gp.setPointerCapture(e.pointerId); const R = el.getBoundingClientRect();   // panneau d'analyse : largeur réglable (gardée)
        gp.onpointermove = ev => { const w2 = clamp(R.right - ev.clientX, 300, Math.min(900, R.width - 420)); el.style.setProperty('--sidew', w2 + 'px'); }; gp.onpointerup = () => { gp.onpointermove = gp.onpointerup = null; lsSet('sv_ieeg_sidew', String(parseInt(getComputedStyle(el).getPropertyValue('--sidew')) || 396)); this.ieegDraw(); }; }; }
      q('.ie-theme').onclick = e => { V.light = !V.light; lsSet('sv_ieeg_light', V.light ? '1' : '0'); el.classList.toggle('light', V.light); e.currentTarget.textContent = V.light ? '☾' : '☀'; this.ieegDraw(); };
      this.ieegBindCanvas(); this.ieegBindOverview();
      V.onKey = e => this.ieegKey(e); window.addEventListener('keydown', V.onKey, true);
      V.ro = new ResizeObserver(() => this.ieegDraw()); V.ro.observe(el.querySelector('.ie-main')); V.ro.observe(el.querySelector('.ie-ovw'));
      this.ieegSetMontage(true);
      if (withEI || lsGet('sv_ieeg_side') !== '0') this.ieegEIPanel(true, typeof withEI === 'string' ? withEI : null);   // v5.5 : panneau d'analyse ouvert d'emblée (sauf s'il a été refermé)
      else if (rec.ei && rec.ei.erCache && rec.ei.erCache[V.montage]) this.ieegComputeER(false, true);   // EI déjà calculé : affiché d'emblée (sans recalcul)
    },
    ieegClose(silent) {
      const V = this._iev; if (!V) return; this._iev = null;
      window.removeEventListener('keydown', V.onKey, true); if (V.vpClose) window.removeEventListener('pointerdown', V.vpClose, true); if (V.ro) V.ro.disconnect(); cancelAnimationFrame(V._raf); clearTimeout(V._saveT); V.el.remove(); this.closeMenu();
      if (V.dirty) this.touch('exploration', (this.ieegEx() || {}).id, 'tracé SEEG');
      if (!silent && this.ui.tab === 'quant') this.renderQuant();
    },
    ieegSetMontage(first) {
      const V = this._iev; V.D = IE.montage(V.mem.channels, V.montage); V.cache.clear(); V.msel = new Set(); V.sel = -1;
      V.elecs = [...new Set(V.D.filter(d => d.seeg).map(d => d.elec))]; V.hasOther = V.D.some(d => !d.seeg);
      V.el.querySelectorAll('.ie-mont button').forEach(b => b.classList.toggle('on', b.dataset.m === V.montage));
      this.ieegLanes(); if (first || V.amp == null || !V.ampManual) this.ieegAutoAmp(); this.ieegChips(); this.ieegDraw(); if (V.ei) this.ieegEIRender();
      if (!first && V.er && V.er.montage !== V.montage && !V.computing && V.rec.ei && V.rec.ei.erCache && V.rec.ei.erCache[V.montage]) this.ieegComputeER(false, true);
    },
    /** réglages d'affichage du tracé (plots et dérivations masqués) */
    ieegVw() { const r = this._iev.rec, vw = r.view || (r.view = {}); vw.hiddenContacts = vw.hiddenContacts || []; vw.hiddenDers = vw.hiddenDers || []; return vw; },
    ieegLanes() {
      const V = this._iev, vw = this.ieegVw(), hc = new Set(vw.hiddenContacts), hd = new Set(vw.hiddenDers), ch = V.mem.channels, grp = d => d.seeg ? d.elec : '·';
      V.lanes = V.D.map((d, i) => i).filter(i => { const d = V.D[i]; return !V.hide.has(grp(d)) && !hd.has(d.name) && !IE.derContacts(d, ch).some(c => hc.has(c)); });
      V.nHidden = V.D.length - V.lanes.length; if (V.sel >= V.D.length) V.sel = -1;
    },
    /** dérivations exclues de l'EI → raison (« voie », ou les plots exclus qu'elle utilise) */
    ieegExcl() {
      const V = this._iev, rec = V.rec, out = new Map(); if (!rec.ei) return out; const xc = new Set(rec.ei.excludedContacts || []);
      for (const n of rec.ei.excluded || []) out.set(n, 'voie');
      for (const d of (V.er && V.er.montage !== V.montage ? V.er.ders.concat(V.D) : V.er ? V.er.ders : V.D)) { const c = IE.derContacts(d, V.mem.channels).filter(x => xc.has(x)); if (c.length) out.set(d.name, c.join(', ')); }
      return out;
    },
    ieegChips() {
      const V = this._iev, box = V.el.querySelector('.ie-chips'), all = V.elecs.concat(V.hasOther ? ['·'] : []);
      const vw = this.ieegVw(), nh = vw.hiddenContacts.length + vw.hiddenDers.length, nx = V.rec.ei ? (V.rec.ei.excludedContacts || []).length + (V.rec.ei.excluded || []).length : 0, Sh = V.show;
      box.innerHTML = `<button class="ie-vbtn${nh || nx ? ' on' : ''}" title="Plots masqués à l’écran, plots exclus de l’analyse">Voies ▾${nh ? ` <span class="m">${nh} masqué${nh > 1 ? 's' : ''}</span>` : ''}${nx ? ` <span class="x">${nx} exclu${nx > 1 ? 's' : ''}</span>` : ''}</button><button data-e="*" title="Toutes les électrodes">toutes</button>${all.map(e => `<button data-e="${esc(e)}" class="${V.hide.has(e) ? '' : 'on'}" title="${e === '·' ? 'Voies non SEEG (ECG, évènements…)' : 'Clic : afficher / masquer · Maj + clic : seule'}">${e === '·' ? 'autres' : esc(e)}</button>`).join('')}
        ${(() => { const eiT = !V.ei || !V.meth || V.meth === 'ei' || V.meth === 'cei', bg = eiT ? (V.er ? 'rapport d’énergie' : null) : (this.ieegHeatLabel ? this.ieegHeatLabel() : null); return bg; })() ? `<span class="spacer"></span><span class="ie-disp" title="Affichage de l’analyse sous le tracé"><label><input type="checkbox" data-s="sig"${Sh.sig ? ' checked' : ''}> signal</label><label title="Fond coloré sous le tracé"><input type="checkbox" data-s="er"${Sh.er ? ' checked' : ''}> ${!V.ei || !V.meth || V.meth === 'ei' || V.meth === 'cei' ? 'rapport d’énergie' : esc(this.ieegHeatLabel())}</label>${!V.ei || !V.meth || V.meth === 'ei' || V.meth === 'cei' ? `<label><input type="checkbox" data-s="un"${Sh.un ? ' checked' : ''}> U<sub>N</sub></label>` : ''}
          <select class="ie-cmap" title="Palette du fond (rapport d’énergie, taux, connectivité ; l’entropie a sa propre palette bleu → rouge)">${['parula', 'inferno', 'viridis', 'hot'].map(k => `<option value="${k}"${Sh.cmap === k ? ' selected' : ''}>${esc(S.CMAPS[k].fr.split(' (')[0])}</option>`).join('')}</select>
          <select class="ie-scale" title="Échelle de couleur">${[['global', 'échelle commune'], ['lane', 'échelle par voie']].map(([k, l]) => `<option value="${k}"${Sh.scale === k ? ' selected' : ''}>${l}</option>`).join('')}</select></span>` : ''}`;
      box.querySelectorAll('button[data-e]').forEach(b => b.onclick = ev => { const e = b.dataset.e; if (e === '*') V.hide.clear(); else if (ev.shiftKey) { V.hide = new Set(all.filter(x => x !== e)); } else V.hide.has(e) ? V.hide.delete(e) : V.hide.add(e); this.ieegLanes(); this.ieegChips(); this.ieegDraw(); });
      box.querySelector('.ie-vbtn').onclick = e => this.ieegVoices(e.currentTarget);
      const keepShow = () => { V.rec.view = Object.assign(this.ieegVw(), { show: V.show }); V.dirty = true; };
      box.querySelectorAll('.ie-disp input').forEach(i => i.onchange = () => { V.show[i.dataset.s] = i.checked; keepShow(); this.ieegDraw(); });
      const cm = box.querySelector('.ie-cmap'); if (cm) cm.onchange = () => { V.show.cmap = cm.value; keepShow(); if (V.er) this.ieegHeat(); this.ieegDraw(); };
      const sc = box.querySelector('.ie-scale'); if (sc) sc.onchange = () => { V.show.scale = sc.value; keepShow(); this.ieegDraw(); };
    },
    /** panneau « Voies » : plots masqués à l'écran (Affichage) ou exclus de l'EI (Analyse), par plot ou par électrode */
    ieegVoices(anchor) {
      const V = this._iev; if (V.vpop) { this.ieegVoicesClose(); return; }
      const pop = V.vpop = h('div', 'ie-vpop'); V.el.appendChild(pop); V.vpMode = V.vpMode || 'show';
      const r = anchor.getBoundingClientRect(), R = V.el.getBoundingClientRect(); pop.style.left = (V.vpPos ? V.vpPos[0] : r.left - R.left) + 'px'; pop.style.top = (V.vpPos ? V.vpPos[1] : r.bottom - R.top + 4) + 'px';
      this.ieegVoicesRender();
      setTimeout(() => { V.vpClose = e => { if (V.vpop && !V.vpop.contains(e.target) && !e.target.closest('.ie-vbtn') && !e.target.closest('.ctx-menu')) this.ieegVoicesClose(); }; window.addEventListener('pointerdown', V.vpClose, true); }, 0);
    },
    ieegVoicesClose() { const V = this._iev; if (!V) return; if (V.vpop) V.vpop.remove(); V.vpop = null; if (V.vpClose) window.removeEventListener('pointerdown', V.vpClose, true); V.vpClose = null; },
    ieegVoicesRender() {
      const V = this._iev, pop = V.vpop; if (!pop) return; const vw = this.ieegVw(), hc = new Set(vw.hiddenContacts), ei = V.rec.ei || {}, xc = new Set(ei.excludedContacts || []), groups = new Map(), mode = V.vpMode;
      const scl = V.rec.modality === 'scalp' && SV.ESI, U = scl ? 'électrode' : 'plot';   // scalp : électrodes 10-20 rangées par région
      V.mem.channels.forEach(c => { if (scl) { const n = SV.ESI.stdName(c.name), b = !n && SV.ESI.bipName(c.name), g = n ? SV.ESI.scalpRegion(n) : b ? SV.ESI.scalpRegion(b[0]) : '·'; (groups.get(g) || groups.set(g, []).get(g)).push({ c, k: n || (b ? b.join('-') : null) }); return; }
        const p = IE.parseContact(c.name), seeg = IE.isSeegChannel(c), g = seeg && p ? p.elec : '·'; (groups.get(g) || groups.set(g, []).get(g)).push({ c, k: seeg && p ? p.k : null }); });
      pop.innerHTML = `<div class="ie-vph" title="Glisser pour déplacer le panneau"><span class="ie-vgrip">⠿</span><span class="seg"><button data-m="show"${mode === 'show' ? ' class="on"' : ''}>Affichage</button><button data-m="ana"${mode === 'ana' ? ' class="on"' : ''}>Analyse</button></span><span class="spacer"></span><button class="ie-vpx" title="Fermer">✕</button></div>
        <div class="ie-vleg"><span><i class="ie-vc"></i>affiché et calculé</span><span><i class="ie-vc off"></i>masqué à l’écran</span><span><i class="ie-vc exc"></i>exclu des calculs</span><span><i class="ie-vc bad"></i>« bad » (channels.tsv)</span></div>
        <div class="hint">${mode === 'show' ? `Clic sur un${scl ? 'e' : ''} ${U} : ${scl ? 'la' : 'le'} masquer ou ${scl ? 'la' : 'le'} réafficher à l’écran (le calcul n’en tient pas compte).` : scl ? 'Clic sur une électrode : l’exclure des calculs (pointes, source) ou l’y réintégrer (mauvais contact).' : 'Clic sur un plot : l’exclure des calculs (EI, cEI, PEI, Delphos) ou l’y réintégrer (en bipolaire : les dérivations qui l’utilisent).'} ${scl ? 'Clic sur une région : toutes ses électrodes.' : 'Clic sur le nom d’une électrode : tous ses plots.'}</div>
        <div class="ie-vgrid">${[...groups].map(([g, Lc]) => `<div class="ie-vr"><button class="ie-ve" data-g="${esc(g)}">${g === '·' ? 'autres' : esc(g)}</button><span class="ie-vcs">${Lc.map(({ c, k }) => { const bad = /bad/i.test(c.status || ''), cls = [hc.has(c.name) ? 'off' : '', xc.has(c.name) ? 'exc' : '', bad ? 'bad' : ''].filter(Boolean).join(' ');
          return `<button class="ie-vc ${cls}" data-c="${esc(c.name)}" title="${esc(c.name)}${bad ? ' — voie « bad » (channels.tsv), hors bipolaire et hors calculs' : ''}${hc.has(c.name) ? ' — masqué' : ''}${xc.has(c.name) ? ' — exclu des calculs' : ''}">${k != null ? k : esc(c.name)}</button>`; }).join('')}</span></div>`).join('')}</div>
        <div class="btnrow"><button class="ie-va"${vw.hiddenContacts.length || vw.hiddenDers.length ? '' : ' disabled'}>Tout afficher</button><button class="ie-vn"${xc.size || (ei.excluded || []).length ? '' : ' disabled'}>Tout réintégrer dans les calculs</button></div>`;
      pop.querySelectorAll('.ie-vph .seg button').forEach(b => b.onclick = () => { V.vpMode = b.dataset.m; this.ieegVoicesRender(); });
      pop.querySelector('.ie-vpx').onclick = () => this.ieegVoicesClose();
      const hd = pop.querySelector('.ie-vph'); hd.onpointerdown = e => {   // panneau déplaçable (il couvre les étiquettes des voies)
        if (e.target.closest('button')) return; e.preventDefault(); hd.setPointerCapture(e.pointerId); const R = V.el.getBoundingClientRect(), o = pop.getBoundingClientRect(), dx = e.clientX - o.left, dy = e.clientY - o.top;
        hd.onpointermove = ev => { const x = clamp(ev.clientX - R.left - dx, 0, R.width - 60), y = clamp(ev.clientY - R.top - dy, 0, R.height - 40); pop.style.left = x + 'px'; pop.style.top = y + 'px'; V.vpPos = [x, y]; };
        hd.onpointerup = () => { hd.onpointermove = null; hd.onpointerup = null; };
      };
      const apply = (names, on) => { if (V.vpMode === 'show') { vw.hiddenContacts = vw.hiddenContacts.filter(x => !names.includes(x)); if (on) vw.hiddenContacts.push(...names); this.ieegLanes(); this.ieegDraw(); } else this.ieegExcludeContacts(names, on, true); V.dirty = true; this.ieegChips(); this.ieegVoicesRender(); };
      const isOn = n => V.vpMode === 'show' ? vw.hiddenContacts.includes(n) : ((V.rec.ei || {}).excludedContacts || []).includes(n);
      pop.querySelectorAll('.ie-vc').forEach(b => b.onclick = () => apply([b.dataset.c], !isOn(b.dataset.c)));
      pop.querySelectorAll('.ie-ve').forEach(b => b.onclick = () => { const names = groups.get(b.dataset.g).map(x => x.c.name); apply(names, !names.every(isOn)); });
      pop.querySelector('.ie-va').onclick = () => { vw.hiddenContacts = []; vw.hiddenDers = []; V.dirty = true; this.ieegLanes(); this.ieegChips(); this.ieegDraw(); this.ieegVoicesRender(); };
      pop.querySelector('.ie-vn').onclick = () => { this.ieegEIParams(); V.rec.ei.excludedContacts = []; V.rec.ei.excluded = []; V.dirty = true; this.ieegEIUpdate(); this.ieegChips(); this.ieegVoicesRender(); };
    },
    /** segment filtré d'une dérivation (2 s de garde pour l'amorce des filtres), en cache tant que la page ne change pas */
    ieegSeg(d, i0, i1) {
      const V = this._iev, fs = V.mem.fs, key = d.name + '|' + i0 + '|' + i1; let y = V.cache.get(key); if (y) return y;
      const pad = Math.round(fs * 2), a = Math.max(0, i0 - pad); y = IE.deriveSignal(V.mem.data, d, a, i1);
      if (V.hp || V.lp || V.notch) y = IE.filterView(y, fs, { hp: V.hp, lp: V.lp, notch: V.notch });
      y = y.subarray(i0 - a); if (V.cache.size > 600) V.cache.clear(); V.cache.set(key, y); return y;
    },
    ieegAutoAmp() {
      const V = this._iev, fs = V.mem.fs, i0 = Math.floor(V.t * fs), i1 = Math.min(V.mem.nSamples, i0 + Math.max(16, Math.floor(Math.min(V.page, 10) * fs))), sd = [];
      for (const li of V.lanes.filter(i => V.D[i].seeg && !V.D[i].bad).slice(0, 48)) { const y = this.ieegSeg(V.D[li], i0, i1); let s = 0, s2 = 0; for (let i = 0; i < y.length; i++) { s += y[i]; s2 += y[i] * y[i]; } const n = y.length || 1; sd.push(Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2))); }
      sd.sort((a, b) => a - b); const med = sd.length ? sd[sd.length >> 1] : 50, want = 6 * med; V.amp = AMPS.find(a => a >= want) || AMPS[AMPS.length - 1]; this.ieegAmpLabel();
    },
    ieegGain(dir) { const V = this._iev; V.ampManual = true; const i = AMPS.indexOf(V.amp), j = clamp((i < 0 ? 5 : i) - dir, 0, AMPS.length - 1); V.amp = AMPS[j]; this.ieegAmpLabel(); this.ieegDraw(); },
    /** gain propre de voies (× √2 par pas), enregistré avec la vue du tracé */
    ieegLaneGain(names, dir) { const vw = this.ieegVw(), G = vw.gain || (vw.gain = {}); for (const n of names) { const v = clamp((G[n] || 1) * Math.pow(Math.SQRT2, dir), 1 / 16, 32); if (Math.abs(v - 1) < 1e-6) delete G[n]; else G[n] = Math.round(v * 1000) / 1000; } this._iev.dirty = true; this.ieegDraw(); },
    /** couleur ('none' : la couleur par défaut, même pour l'ECG) ou gain de voies */
    ieegLaneSet(names, key, v) { const vw = this.ieegVw(), o = vw[key] || (vw[key] = {}); for (const n of names) { if (v == null) delete o[n]; else o[n] = v; } this._iev.dirty = true; this.ieegDraw(); },
    /** couleur d'une voie : choisie, sinon rouge pour l'ECG */
    ieegLaneColor(d) { const c = (this.ieegVw().colors || {})[d.name]; if (c) return c === 'none' ? null : c; return /^(ecg|ekg)/i.test(d.name) || /\b(ecg|ekg)\b/i.test(d.name) ? (this._iev.light ? '#d0021b' : '#ff5a5f') : null; },
    /** marques du tracé en liste (signets) : clic → la page ; crises du tracé comprises */
    ieegMarkList(anchor) {
      const V = this._iev; if (V.mlist) { this.ieegMarkListClose(); return; }
      const rec = V.rec, L = this.ieegMarks().map(m => Object.assign({ sz: rec.seizureId || null }, m)), S0 = this.dossier ? (this.dossier.seizures || []) : [], szName = id => { const z = S0.find(x => x.id === id); return z ? z.label : 'crise'; };
      for (const [id, slot] of Object.entries(rec.bySz || {})) { const mk = slot.marks || {}; if (mk.onset != null) L.push({ t: mk.onset, label: szName(id) + ' — début', kind: 'onset', sz: id, other: true }); if (mk.end != null) L.push({ t: mk.end, label: szName(id) + ' — fin', kind: 'end', sz: id, other: true }); }
      if (rec.seizureId) L.forEach(m => { if (!m.other && (m.kind === 'onset' || m.kind === 'end')) m.label = szName(rec.seizureId) + ' — ' + (m.kind === 'onset' ? 'début' : 'fin'); });
      if (this.ieegMarkExtra) this.ieegMarkExtra(L);
      L.sort((a, b) => a.t - b.t);
      const pop = V.mlist = h('div', 'ie-vpop ie-mlist'), r = anchor.getBoundingClientRect(), R = V.el.getBoundingClientRect(); pop.style.left = Math.max(0, Math.min(r.left - R.left, R.width - 330)) + 'px'; pop.style.top = (r.bottom - R.top + 4) + 'px';
      const KF = { onset: 'début', end: 'fin', user: 'marque de crise', inter: 'intercritique', file: 'fichier', sleep: 'sommeil', spike: 'pointes' };
      pop.innerHTML = `<div class="ie-vph"><b>Marques du tracé</b><span class="muted">${L.length}</span><span class="spacer"></span><button class="ie-vpx" title="Fermer (Échap)">✕</button></div>
        <div class="ie-ml">${L.map((m, i) => `<button class="ie-mi k-${m.kind}${m.other ? ' other' : ''}" data-i="${i}" title="${esc(m.label)} — aller à ${clock(m.t)}${m.other ? ' (autre crise du tracé : elle devient la crise active)' : ''}"><span class="mono">${clock(m.t)}</span><i></i><span class="l">${esc(m.label)}</span><span class="muted">${KF[m.kind] || ''}</span></button>`).join('') || '<div class="hint">Aucune marque : clic droit sur le tracé pour en ajouter.</div>'}</div>`;
      V.el.appendChild(pop); pop.querySelector('.ie-vpx').onclick = () => this.ieegMarkListClose();
      pop.querySelectorAll('.ie-mi').forEach(b => b.onclick = () => { const m = L[+b.dataset.i]; if (m.other && this.ieegSetSeizure && this.ieegSetSeizure(rec, m.sz)) { V.dirty = true; if (this.ieegSeizureBar) this.ieegSeizureBar(V); if (V.ei) this.ieegEIRender(); }
        V.t = clamp(m.t - V.page * 0.3, 0, Math.max(0, V.mem.duration - V.page)); V.cursor = m.t; this.ieegDraw(); pop.querySelectorAll('.ie-mi').forEach(x => x.classList.toggle('on', x === b)); });
      setTimeout(() => { V.mlClose = e => { if (V.mlist && !V.mlist.contains(e.target) && !e.target.closest('.ie-mlb')) this.ieegMarkListClose(); }; window.addEventListener('pointerdown', V.mlClose, true); }, 0);
    },
    ieegMarkListClose() { const V = this._iev; if (!V) return; if (V.mlist) V.mlist.remove(); V.mlist = null; if (V.mlClose) window.removeEventListener('pointerdown', V.mlClose, true); V.mlClose = null; },
    ieegAmpLabel() { const V = this._iev, s = V.el.querySelector('.ie-amp'); if (s) s.textContent = (V.amp >= 1000 ? nf(V.amp / 1000, 1) + ' mV' : V.amp + ' µV'); },
    ieegDraw() { const V = this._iev; if (!V || V._raf) return; V._raf = requestAnimationFrame(() => { V._raf = 0; if (this._iev !== V) return; this.ieegPaint(); this.ieegPaintOverview(); this.ieegCursorLabel(); }); },
    ieegMarks() {
      const V = this._iev, r = V.rec, mk = r.marks || {}, out = [];
      for (const e of r.events || []) out.push({ t: e.onset, label: e.label, kind: 'file' });
      if (mk.onset != null) out.push({ t: mk.onset, label: 'début de crise', kind: 'onset' });
      if (mk.end != null) out.push({ t: mk.end, label: 'fin de crise', kind: 'end' });
      (mk.user || []).forEach((u, i) => out.push({ t: u.t, label: u.label, kind: 'user', i }));
      (r.imarks || []).forEach((u, i) => out.push({ t: u.t, label: u.label, kind: 'inter', i }));   // v5.5 : marques intercritiques du tracé (communes à toutes ses crises)
      return out;
    },
    ieegPaint() {
      const V = this._iev, cv = V.cv, W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return;
      const dpr = window.devicePixelRatio || 1; if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      const C = V.light ? THEME.light : THEME.dark, g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
      const GUT = V.grpKey ? 200 : 108, TOP = 24, x0 = GUT, pw = Math.max(10, W - GUT - 8), fs = V.mem.fs; V.t = clamp(V.t, 0, Math.max(0, V.mem.duration - V.page));
      const t0 = V.t, k = pw / V.page, X = t => x0 + (t - t0) * k, lanes = V.lanes, avail = H - TOP - 4;
      const laneH = Math.max(14, avail / Math.max(1, lanes.length)), nVis = Math.max(1, Math.floor(avail / laneH)); V.scroll = clamp(V.scroll, 0, Math.max(0, lanes.length - nVis));
      V.geo = { GUT, TOP, x0, pw, k, laneH, nVis };
      const P = V.ei || V.er ? this.ieegEIParams() : null, E = V.er, Sh = V.show, heatOn = !!(E && Sh.er) && (!V.ei || !V.meth || V.meth === 'ei' || V.meth === 'cei'), excl = E ? this.ieegExcl() : new Map(), eiOn = !V.ei || !V.meth || V.meth === 'ei' || V.meth === 'cei', eiWin = !V.meth || V.meth === 'ei';
      // rapport d'énergie sous le tracé (comme AnyWave) : une case par valeur d'ER (pas 0,125 s), une ligne par voie affichée
      // fond coloré sous le tracé : rapport d'énergie (EI, cEI), sinon source de l'onglet (entropie, taux d'évènements, connectivité)
      const HS = heatOn ? { t0: E.t0, dt: E.dt, len: E.ers[0].length, lut: this.ieegLut(), row: nm => { const ix = E.idx.get(nm); return ix == null ? null : { a: E.ers[ix], lo: Sh.scale === 'lane' ? E.loLane[ix] : E.lo, hi: Sh.scale === 'lane' ? E.hiLane[ix] : E.hi }; } }
        : (V.ei && !eiOn && Sh.er && this.ieegHeatSrc ? this.ieegHeatSrc() : null);
      const heatRows = new Set();
      if (HS) {
        const a = Math.max(0, Math.floor((t0 - HS.t0) / HS.dt) - 1), b = Math.min(HS.len - 1, Math.ceil((t0 + V.page - HS.t0) / HS.dt) + 1), rows = Math.min(nVis, lanes.length - V.scroll);
        if (b >= a && rows > 0) {
          const cols = b - a + 1, c = V.hcv || (V.hcv = document.createElement('canvas')); c.width = cols; c.height = rows; const hg = c.getContext('2d'), img = hg.createImageData(cols, rows), lut = HS.lut;
          for (let j = 0; j < rows; j++) { const R0 = HS.row(V.D[lanes[V.scroll + j]].name); if (!R0) continue; heatRows.add(j); const arr = R0.a, lo = R0.lo, sp = (R0.hi - lo) || 1;
            for (let q = 0; q < cols; q++) { const v = arr[a + q], o = 4 * (j * cols + q); if (v == null || v !== v) { img.data[o + 3] = 0; continue; } const t = Math.min(255, Math.max(0, Math.round((v - lo) / sp * 255))); img.data[o] = lut[3 * t]; img.data[o + 1] = lut[3 * t + 1]; img.data[o + 2] = lut[3 * t + 2]; img.data[o + 3] = 255; } }
          hg.putImageData(img, 0, 0); g.save(); g.beginPath(); g.rect(x0, TOP, pw, rows * laneH); g.clip(); g.imageSmoothingEnabled = !!HS.smooth;
          g.drawImage(c, X(HS.t0 + (a - 0.5) * HS.dt), TOP, cols * HS.dt * k, rows * laneH); g.restore();
        }
      }
      V.heatN = heatRows.size;
      if (V.ei && !eiWin && this.ieegPaintShade) this.ieegPaintShade(g, { X, x0, pw, TOP, H, heatOn, C });
      if (P && V.ei && eiWin) { const a = clamp(X(P.start), x0, x0 + pw), b = clamp(X(P.end), x0, x0 + pw), r0 = clamp(X(this.ieegPHStart(P)), x0, x0 + pw); if (b > a) { g.fillStyle = heatOn ? 'rgba(255,255,255,0.025)' : C.win; g.fillRect(a, TOP, b - a, H - TOP); } if (a > r0) { g.fillStyle = heatOn ? 'rgba(255,255,255,0.012)' : C.ref; g.fillRect(r0, TOP, a - r0, H - TOP); } }
      // grille du temps
      const step = V.page <= 3 ? 0.5 : V.page <= 15 ? 1 : V.page <= 30 ? 5 : 10;
      g.font = '11px ' + MONO; g.textBaseline = 'middle'; g.textAlign = 'center';
      for (let t = Math.ceil(t0 / step) * step; t <= t0 + V.page + 1e-9; t += step) { const x = Math.round(X(t)) + 0.5; g.strokeStyle = C.grid; g.beginPath(); g.moveTo(x, TOP); g.lineTo(x, H); g.stroke(); g.fillStyle = C.tick; g.fillText(clock(t).replace(/\.0$/, ''), x, 9); }
      if (this.ieegPaintBg) this.ieegPaintBg(g, { X, x0, pw, TOP, H, t0, page: V.page });   // stades du sommeil (sleep_ui.js)
      // voies
      const i0 = Math.max(0, Math.floor(t0 * fs)), i1 = Math.min(V.mem.nSamples, Math.ceil((t0 + V.page) * fs) + 1), xs = X(i0 / fs), spx = k / fs, ppu = laneH / V.amp;
      const grp = li => V.grpKey ? V.grpKey[li] : V.D[li].seeg ? V.D[li].elec : '·', LX = V.grpKey ? 100 : 6;   // v5.1 : groupes du montage (ieeg_montage.js)
      let prev = null, band = 0, gRow = 0, prevB = null; g.textAlign = 'left';
      const VG = this.ieegVw().gain || {};   // gain propre à une voie (sélection + flèches)
      for (let j = 0; j < nVis && V.scroll + j < lanes.length; j++) {
        const li = lanes[V.scroll + j], d = V.D[li], yT = TOP + j * laneH, yc = yT + laneH / 2, r = V.resBy.get(d.name);
        if (grp(li) !== prev) { band ^= 1; gRow = 0; const nb = V.blk ? V.blk[li] : null; if (prev != null) { g.strokeStyle = C.sep; g.lineWidth = nb !== prevB ? 2.5 : 1; g.beginPath(); g.moveTo(0, Math.round(yT) + 0.5); g.lineTo(W, Math.round(yT) + 0.5); g.stroke(); g.lineWidth = 1; } prev = grp(li); prevB = nb; } else gRow++;
        const onHeat = heatRows.has(j), ex = excl.get(d.name);
        if (band && !onHeat) { g.fillStyle = C.band; g.fillRect(0, yT, W, laneH); }
        const ms = V.msel && V.msel.size > 1 && V.msel.has(li);
        if (li === V.sel || ms) { g.fillStyle = C.sel; g.fillRect(0, yT, x0, laneH); if (ms) { g.fillStyle = C.selTxt; g.fillRect(0, yT + 1, 3, laneH - 2); } if (li === V.sel) { g.fillStyle = C.sel; if (!onHeat) g.fillRect(x0, yT, W - x0, laneH); else { g.strokeStyle = 'rgba(242,184,75,0.7)'; g.strokeRect(x0 + 0.5, yT + 0.5, pw - 1, laneH - 1); } } }
        if (V.grpKey) { const GL = this.ieegGroupLines ? this.ieegGroupLines(prev) : [String(prev)]; if (gRow < GL.length) { g.fillStyle = V.light ? '#8a5300' : '#f2b84b'; g.font = '600 11px system-ui, sans-serif'; g.fillText(GL[gRow], 6, yc); } }
        g.fillStyle = d.bad || ex ? C.txtBad : !d.seeg ? C.txtOther : li === V.sel || ms ? C.selTxt : C.txt; g.font = (laneH >= 16 ? '11.5px ' : '10.5px ') + MONO;
        const ml = V.grpKey ? 11 : 12; g.fillText((ex ? '⊘ ' : '') + (d.name.length > ml ? d.name.slice(0, ml - 1) + '…' : d.name), LX, yc);
        const lv = V.ei && V.meth && V.meth !== 'ei' && this.ieegLaneVal ? this.ieegLaneVal(d.name) : r ? { v: r.ei, hi: r.ei >= IE.EZT.ei, pz: IE.eiZone(r.ei) === 'pz' } : null;
        if (lv) { g.fillStyle = C.barBg; g.fillRect(GUT - 30, yc - 3, 24, 6); g.fillStyle = lv.hi ? '#ff5a5f' : lv.pz ? '#f2a33a' : '#4cc9f0'; g.fillRect(GUT - 30, yc - 3, Math.max(1, 24 * clamp(lv.v, 0, 1)), 6); }
        const lg = VG[d.name] || 1, lc = this.ieegLaneColor(d); if (lg !== 1) { g.fillStyle = C.txtOther; g.font = '9.5px ' + MONO; g.fillText('×' + nf(lg, lg < 1 ? 2 : 1), GUT - (lv ? 58 : 30), yc + 3); }
        if (Sh.sig && i1 - i0 > 1) { g.save(); g.beginPath(); g.rect(x0, yT - laneH * 0.9, pw, laneH * 2.8); g.clip(); g.strokeStyle = d.bad ? C.traceBad : lc && !ex ? lc : !d.seeg ? C.traceOther : onHeat && !(HS && HS.plainTrace) ? (ex ? 'rgba(255,90,90,0.45)' : C.heatTrace) : ex ? C.traceExc : C.trace; g.lineWidth = 1; trace(g, this.ieegSeg(d, i0, i1), xs, spx, yc, ppu * lg); g.restore(); }
        const u = eiOn && Sh.un && V.un && V.un.get(d.name);
        if (u && u.U.length > 1) {   // courbe U_N de Page–Hinkley sur la fenêtre d'analyse, mise à l'échelle de la voie
          const a = Math.max(0, Math.floor((t0 - u.t0) / E.dt)), b = Math.min(u.U.length - 1, Math.ceil((t0 + V.page - u.t0) / E.dt)), sp = (u.max - u.min) || 1;
          if (b > a) { g.save(); g.beginPath(); g.rect(x0, yT, pw, laneH); g.clip(); g.strokeStyle = V.light && !onHeat ? 'rgba(0,120,170,0.85)' : 'rgba(94,231,255,0.75)'; g.lineWidth = 1; g.beginPath(); for (let q = a; q <= b; q++) { const x = X(u.t0 + q * E.dt), y = yT + laneH * 0.92 - (u.U[q] - u.min) / sp * laneH * 0.84; if (q === a) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke(); g.restore(); }
        }
        if (V.ei && !eiWin && this.ieegPaintLane) this.ieegPaintLane(g, d, { X, x0, pw, yT, yc, laneH, t0, onHeat, C });
        if (r && r.detected && eiOn) {   // détection : trait sur la voie + ▼ (automatique) ou ◆ (posée à la main) ; alarme Na : anneau
          const sz = Math.max(4.5, Math.min(7.5, laneH * 0.42)), x = X(r.tNd), col = r.manual ? MK.man : MK.nd;
          if (x >= x0 && x <= x0 + pw) { tick(g, Math.round(x) + 0.5, yT + sz * 0.9, yT + laneH - 1, col); glyph(g, r.manual ? 'dia' : 'tri', x, yT + sz * 0.75, sz, col); }
          if (r.tNa != null) { const xa = X(r.tNa); if (xa >= x0 && xa <= x0 + pw) glyph(g, 'ring', xa, yc, sz * 0.95, MK.na); }
        }
      }
      g.lineWidth = 1;
      // évènements, marques, N0, fenêtre d'analyse
      const lblRows = [];   // étiquettes des lignes verticales en quinconce quand elles se chevauchent
      V.lblHits = [];
      const vline = (t, col, dash, label, lc, mref) => { const x = Math.round(X(t)) + 0.5; if (x < x0 || x > x0 + pw) return; const selM = mref && V.selMark && V.selMark.kind === mref.kind && V.selMark.i === mref.i; g.strokeStyle = col; g.setLineDash(dash || []); if (selM) g.lineWidth = 2.6; g.beginPath(); g.moveTo(x, TOP); g.lineTo(x, H); g.stroke(); g.setLineDash([]); if (label) { g.font = (selM ? '600 ' : '') + '11px ' + 'system-ui, sans-serif'; const txt = label.length > 26 ? label.slice(0, 25) + '…' : label, w = Math.min(160, g.measureText(txt).width + 8); let row = lblRows.findIndex(r => r <= x + 1); if (row < 0) { row = lblRows.length; lblRows.push(0); } lblRows[row] = x + 2 + w; const y = TOP + 1 + row * 16; g.fillStyle = C.lblBg; g.fillRect(x + 2, y, w, 15); if (selM) { g.strokeStyle = col; g.lineWidth = 1.5; g.strokeRect(x + 2.5, y + 0.5, w - 1, 14); } g.fillStyle = lc || col; g.textAlign = 'left'; g.fillText(txt, x + 6, y + 8); if (mref) V.lblHits.push({ x0: x - 3, x1: x + 2 + w, y0: y, y1: y + 15, m: mref }); } };
      if (V.ei && !eiWin && this.ieegPaintWin) this.ieegPaintWin(g, { X, x0, pw, TOP, H, heatOn, C, vline, k });
      if (P && V.ei && eiWin) { if (P.base > 0 && this.ieegPHStart(P) < P.start) vline(this.ieegPHStart(P), 'rgba(76,201,240,0.35)', [2, 4], 'référence'); vline(P.start, 'rgba(76,201,240,0.5)', [6, 4], 'analyse'); vline(P.end, 'rgba(76,201,240,0.5)', [6, 4], ''); if (P.szEnd != null && Math.abs(P.szEnd - P.end) > 1e-6) vline(P.szEnd, 'rgba(76,201,240,0.35)', [2, 4], ''); }
      for (const m of this.ieegMarks()) { g.lineWidth = m.kind === 'onset' || m.kind === 'end' ? 1.6 : 1; vline(m.t, m.kind === 'onset' ? (V.light ? '#d0021b' : '#ff5a5f') : m.kind === 'end' ? (V.light ? '#0067a3' : '#4cc9f0') : m.kind === 'user' ? (V.light ? '#2b8a3e' : '#7bd389') : m.kind === 'inter' ? (V.light ? '#7048c0' : '#b07cf2') : (V.light ? 'rgba(170,110,0,0.85)' : 'rgba(242,184,75,0.75)'), m.kind === 'file' ? [4, 3] : null, m.label, null, m); }
      g.lineWidth = 1;
      if (eiOn && V.res && V.res.N0 != null && V.resBy.size) { g.lineWidth = 1.8; vline(V.res.N0, MK.n0, [3, 2], 'N0', V.light ? '#b0008f' : MK.n0); g.lineWidth = 1; }
      if (V.cursor != null) vline(V.cursor, C.cursor, null, '');
      if (V.dropAt != null) { const yd = TOP + (V.dropAt - V.scroll) * laneH; g.strokeStyle = '#4cc9f0'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(0, yd); g.lineTo(W, yd); g.stroke(); g.lineWidth = 1; }
      // ascenseur des voies
      if (lanes.length > nVis) { const hT = H - TOP, bh = Math.max(20, hT * nVis / lanes.length), by = TOP + (hT - bh) * V.scroll / Math.max(1, lanes.length - nVis); g.fillStyle = C.scroll; g.fillRect(W - 5, by, 3, bh); }
    },
    ieegPaintOverview() {
      const V = this._iev, cv = V.ov, W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return;
      const dpr = window.devicePixelRatio || 1; if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      const C = V.light ? THEME.light : THEME.dark, g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = C.ov; g.fillRect(0, 0, W, H);
      const GUT = (V.geo && V.geo.GUT) || 108, pw = W - GUT - 8, dur = V.mem.duration || 1, X = t => GUT + t / dur * pw; V.ovGeo = { GUT, pw, dur };
      g.font = '10.5px system-ui, sans-serif'; g.fillStyle = '#5c6675'; g.textBaseline = 'middle'; g.fillText(V.heat ? 'ER (log)' : 'aperçu', 8, H / 2);
      if (V.heat && V.er) { const a = X(V.er.t0), b = X(V.er.t0 + V.er.dt * V.er.ers[0].length); g.imageSmoothingEnabled = true; g.drawImage(V.heat, 0, 0, V.heat.width, V.heat.height, a, 3, Math.max(1, b - a), H - 6); }
      else { // enveloppe (amplitude crête à crête médiane des voies SEEG valides, 600 colonnes), calculée une fois par montage
        if (!V.env || V.env.m !== V.montage) {
          const n = V.mem.nSamples, C = 600, step = Math.max(1, Math.floor(n / C)), ds = V.D.filter(x => x.seeg && !x.bad), pick = ds.filter((x, i) => i % Math.max(1, Math.floor(ds.length / 12)) === 0).slice(0, 12), env = new Float32Array(Math.ceil(n / step));
          const per = pick.map(d => { const x = IE.deriveSignal(V.mem.data, d, 0, n), e = new Float32Array(env.length); for (let c = 0; c < env.length; c++) { let lo = Infinity, hi = -Infinity; for (let i = c * step; i < Math.min(n, (c + 1) * step); i++) { const v = x[i]; if (v < lo) lo = v; if (v > hi) hi = v; } e[c] = hi - lo; } return e; });
          for (let c = 0; c < env.length; c++) { const v = per.map(e => e[c]).sort((a, b) => a - b); env[c] = v.length ? v[v.length >> 1] : 0; }
          const srt = Array.from(env).sort((a, b) => a - b); V.env = { m: V.montage, env, mx: srt[Math.floor(srt.length * 0.98)] || 1 };
        }
        const { env, mx } = V.env; g.fillStyle = C.ovEnv; for (let c = 0; c < env.length; c++) { const hh = Math.min(1, env[c] / mx) * (H - 8); g.fillRect(GUT + c * pw / env.length, H / 2 - hh / 2, Math.max(1, pw / env.length + 0.5), hh); }
      }
      if (this.ieegOvwBg) this.ieegOvwBg(g, X, H);   // hypnogramme (sleep_ui.js)
      const P = V.ei && (!V.meth || V.meth === 'ei') ? this.ieegEIParams() : null;
      if (V.ei && !P && this.ieegOvwWin) this.ieegOvwWin(g, X, H);
      if (P) { g.strokeStyle = 'rgba(76,201,240,0.8)'; g.strokeRect(X(P.start) + 0.5, 1.5, Math.max(1, X(P.end) - X(P.start)), H - 3); }
      for (const m of this.ieegMarks()) { g.strokeStyle = m.kind === 'onset' ? '#ff5a5f' : m.kind === 'end' ? '#4cc9f0' : m.kind === 'user' ? '#7bd389' : m.kind === 'inter' ? '#b07cf2' : 'rgba(242,184,75,0.7)'; const x = Math.round(X(m.t)) + 0.5; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
      g.strokeStyle = '#f2b84b'; g.lineWidth = 1.5; g.strokeRect(X(V.t), 1, Math.max(2, V.page / dur * pw), H - 2); g.lineWidth = 1;
    },
    ieegCursorLabel() {
      const V = this._iev, s = V.el.querySelector('.ie-cur'); if (!s) return; const on = V.rec.marks && V.rec.marks.onset;
      const t = V.cursor != null ? V.cursor : V.t; s.textContent = `${V.cursor != null ? 't ' : ''}${clock(t)}${on != null ? ` (${t - on >= 0 ? '+' : '−'}${nf(Math.abs(t - on), 1)} s)` : ''}`;
    },
    ieegHit(e) {
      const V = this._iev, r = V.cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, G = V.geo; if (!G) return null;
      const j = Math.floor((y - G.TOP) / G.laneH), li = j >= 0 && j < G.nVis ? V.lanes[V.scroll + j] : undefined;
      return { x, y, t: V.t + (x - G.x0) / G.k, lane: li == null ? -1 : li, inPlot: x >= G.x0, gutter: x < G.x0 };
    },
    /** étiquette de marque sous le pointeur (début, fin, marques, évènements du fichier) */
    ieegMarkHit(p) { const V = this._iev; return p && (V.lblHits || []).find(h => p.x >= h.x0 && p.x <= h.x1 && p.y >= h.y0 && p.y <= h.y1) || null; },
    /** début / fin de crise ou marque déplacée, ajoutée ou retirée (v = null) : fenêtres automatiques recalées */
    ieegMarkSet(k, v, i) {
      const V = this._iev, mk = V.rec.marks || (V.rec.marks = { onset: null, end: null, user: [] }); mk.user = mk.user || [];
      if (k === 'user' || k === 'inter') { const L = k === 'user' ? mk.user : (V.rec.imarks = V.rec.imarks || []); if (v == null) L.splice(i, 1); else if (L[i]) L[i].t = v; }
      else mk[k] = v == null ? null : v;
      V.dirty = true; if (this.ieegMarksChanged) this.ieegMarksChanged();
      if (k !== 'user' && k !== 'inter') { const P = this.ieegEIParams(); if (P.auto) { this.ieegFitWindow(P, mk, V.mem.duration); if (V.er) this.ieegEIChanged(true); } }
      this.ieegDraw(); if (V.ei) this.ieegEIRender(); this.ieegChips();
    },
    ieegMarkDelete(m) {
      const V = this._iev; if (!m) return; if (m.kind === 'file') { this.toast('Évènement du fichier : non modifiable (clic droit : en faire le début ou la fin de crise)', 3500); return; }
      V.selMark = null; this.ieegMarkSet(m.kind, null, m.i);
    },
    /** clic sur l'étiquette d'une voie : choisie ; Ctrl / ⌘ + clic : ajoutée à la sélection (ou retirée) ; Maj + clic : plage */
    ieegLaneClick(li, e) {
      const V = this._iev; V.msel = V.msel || new Set();
      if (e.shiftKey && V.anchor != null && V.lanes.includes(V.anchor)) {
        const a = V.lanes.indexOf(V.anchor), b = V.lanes.indexOf(li); if (!(e.ctrlKey || e.metaKey)) V.msel.clear();
        for (let k = Math.min(a, b); k <= Math.max(a, b); k++) V.msel.add(V.lanes[k]); V.sel = li;
      } else if (e.ctrlKey || e.metaKey) { if (V.msel.size === 0 && V.sel >= 0) V.msel.add(V.sel); if (V.msel.has(li)) V.msel.delete(li); else V.msel.add(li); V.sel = V.msel.has(li) ? li : -1; V.anchor = li; }
      else { const again = V.sel === li && V.msel.size <= 1; V.msel.clear(); V.sel = again ? -1 : li; if (!again) V.msel.add(li); V.anchor = li; }
    },
    /** voies sélectionnées (au moins deux) : masquer, exclure des calculs, réintégrer */
    ieegSelItems(items) {
      const V = this._iev, L = [...(V.msel || [])].filter(i => V.D[i]).map(i => V.D[i]); if (L.length < 2) return; const names = L.map(d => d.name), vw = this.ieegVw(), n = L.length;
      this.ieegEIParams(); const exc = V.rec.ei.excluded, nEx = names.filter(x => exc.includes(x)).length;
      items.push({ head: `${n} voies sélectionnées` },
        { label: `Masquer les ${n} voies à l’écran`, run: () => { vw.hiddenDers = [...new Set(vw.hiddenDers.concat(names))]; V.msel.clear(); V.sel = -1; V.dirty = true; this.ieegLanes(); this.ieegChips(); this.ieegDraw(); } },
        { label: `Exclure les ${n} voies des calculs (artefact, « bad »)`, run: () => { V.rec.ei.excluded = [...new Set(exc.concat(names))]; V.dirty = true; this.ieegEIUpdate(); this.ieegChips(); if (this.ieegAfterExcl) this.ieegAfterExcl(); } });
      if (nEx) items.push({ label: `Réintégrer ${nEx === n ? 'les ' + n : nEx + ' des'} voies dans les calculs`, run: () => { V.rec.ei.excluded = exc.filter(x => !names.includes(x)); const cs = new Set(L.flatMap(d => IE.derContacts(d, V.mem.channels))); V.rec.ei.excludedContacts = V.rec.ei.excludedContacts.filter(x => !cs.has(x)); V.dirty = true; this.ieegEIUpdate(); this.ieegChips(); if (this.ieegAfterExcl) this.ieegAfterExcl(); } });
      items.push({ label: 'Désélectionner', run: () => { V.msel.clear(); this.ieegDraw(); } }, { sep: true });
    },
    ieegBindCanvas() {
      const V = this._iev, cv = V.cv; let drag = null;
      cv.onpointerdown = e => {
        if (e.button !== 0) return; const p = this.ieegHit(e); if (!p) return; cv.setPointerCapture(e.pointerId);
        const mh = this.ieegMarkHit(p);
        if (mh) { V.selMark = { kind: mh.m.kind, i: mh.m.i }; drag = { mark: mh.m, x: e.clientX, t0: mh.m.t, moved: false, p }; this.ieegDraw(); return; }   // marque : choisie, déplacée en glissant son étiquette
        if (p.inPlot && e.altKey && (!V.ei || !V.meth || V.meth === 'ei' || V.meth === 'cei')) { const d = V.D[p.lane]; if (d && V.er && V.er.names.includes(d.name)) this.ieegSetManual(d.name, p.t); else this.toast(V.er ? 'Voie hors des calculs (EI, cEI, PEI, Delphos)' : 'Calculer d’abord l’index d’épileptogénicité'); return; }
        drag = { x: e.clientX, t: V.t, moved: false, p };
      };
      cv.onpointermove = e => {
        if (!drag) { const h0 = this.ieegMarkHit(this.ieegHit(e)); cv.style.cursor = h0 ? (h0.m.kind === 'file' ? 'pointer' : 'ew-resize') : ''; return; }
        const dx = e.clientX - drag.x; if (!drag.moved && Math.abs(dx) < 3) return; drag.moved = true;
        if (drag.mark) { const m = drag.mark; if (m.kind === 'file') return; const t = clamp(drag.t0 + dx / V.geo.k, 0, V.mem.duration), mk = V.rec.marks; if (m.kind === 'user' || m.kind === 'inter') { const L = m.kind === 'user' ? mk.user : V.rec.imarks || []; if (L[m.i]) L[m.i].t = t; } else mk[m.kind] = t; V.cursor = t; cv.style.cursor = 'ew-resize'; this.ieegDraw(); return; }
        V.t = clamp(drag.t - dx / V.geo.k, 0, Math.max(0, V.mem.duration - V.page)); cv.style.cursor = 'grabbing'; this.ieegDraw();
      };
      cv.onpointerup = e => {
        if (!drag) return; const p = drag.p; cv.style.cursor = '';
        if (drag.mark) { const m = drag.mark; if (drag.moved && m.kind !== 'file') { const mk = V.rec.marks, t = Math.round((m.kind === 'user' ? mk.user[m.i].t : m.kind === 'inter' ? V.rec.imarks[m.i].t : mk[m.kind]) * 1000) / 1000; this.ieegMarkSet(m.kind, t, m.i); } drag = null; return; }
        if (!drag.moved && this.ieegClickMeth && this.ieegClickMeth(p, e)) { drag = null; this.ieegDraw(); return; }   // clic propre à une méthode (pointe choisie…)
        if (!drag.moved) { V.selMark = null; if (p.lane >= 0) { if (p.gutter) this.ieegLaneClick(p.lane, e); else { V.sel = p.lane; if (V.msel) V.msel.clear(); } } if (p.inPlot) V.cursor = p.t; this.ieegDraw(); if (V.ei) this.ieegEIRender(true); }
        drag = null;
      };
      cv.oncontextmenu = e => { e.preventDefault(); const p = this.ieegHit(e); if (p) this.ieegMenu(e, p); };
      cv.onwheel = e => {
        e.preventDefault();
        if (e.ctrlKey) { this.ieegGain(e.deltaY < 0 ? 1 : -1); return; }
        if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) { const dv = (e.shiftKey ? e.deltaY : e.deltaX) || 0; V.t = clamp(V.t + Math.sign(dv) * V.page / 8, 0, Math.max(0, V.mem.duration - V.page)); this.ieegDraw(); return; }
        V.scroll = clamp(V.scroll + Math.sign(e.deltaY) * 3, 0, Math.max(0, V.lanes.length - (V.geo ? V.geo.nVis : 1))); this.ieegDraw();
      };
    },
    ieegBindOverview() {
      const V = this._iev, cv = V.ov; let down = false;
      const go = e => { const r = cv.getBoundingClientRect(), G = V.ovGeo; if (!G) return; const t = (e.clientX - r.left - G.GUT) / G.pw * G.dur; V.t = clamp(t - V.page / 2, 0, Math.max(0, V.mem.duration - V.page)); this.ieegDraw(); };
      cv.onpointerdown = e => { down = true; cv.setPointerCapture(e.pointerId); go(e); };
      cv.onpointermove = e => { if (down) go(e); };
      cv.onpointerup = () => { down = false; };
    },
    ieegKey(e) {
      const V = this._iev; if (!V) return; const t = e.target; if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName) && e.key !== 'Escape') return;
      const pg = V.page, max = Math.max(0, V.mem.duration - pg); let done = true;
      switch (e.key) {
        case 'ArrowRight': V.t = clamp(V.t + (e.shiftKey ? 1 : pg), 0, max); break;
        case 'ArrowLeft': V.t = clamp(V.t - (e.shiftKey ? 1 : pg), 0, max); break;
        case 'PageDown': V.scroll += V.geo ? V.geo.nVis : 10; break;
        case 'PageUp': V.scroll = Math.max(0, V.scroll - (V.geo ? V.geo.nVis : 10)); break;
        case 'ArrowUp': case 'ArrowDown': { const dir = e.key === 'ArrowUp' ? 1 : -1; if (V.msel && V.msel.size) this.ieegLaneGain([...V.msel].map(i => V.D[i] && V.D[i].name).filter(Boolean), dir); else this.ieegGain(dir); break; }   // voies sélectionnées (étiquettes) : leur amplitude ; sinon toutes
        case '+': case '=': this.ieegGain(1); break;
        case '-': case '_': this.ieegGain(-1); break;
        case 'Home': V.t = 0; break;
        case 'End': V.t = max; break;
        case 'o': case 'O': if (V.rec.marks && V.rec.marks.onset != null) V.t = clamp(V.rec.marks.onset - pg * 0.3, 0, max); break;
        case 'Delete': case 'Backspace': if (V.selMark) { const m = this.ieegMarks().find(x => x.kind === V.selMark.kind && x.i === V.selMark.i); if (m) this.ieegMarkDelete(m); else V.selMark = null; } else done = false; break;
        case 'Escape': if (this._menu) this.closeMenu(); else if (V.vpop) this.ieegVoicesClose(); else if (V.mlist) this.ieegMarkListClose(); else if (V.msel && V.msel.size) { V.msel.clear(); V.sel = -1; } else this.ieegClose(); break;
        default: done = false;
      }
      if (done) { e.preventDefault(); e.stopImmediatePropagation(); this.ieegDraw(); }
    },
    ieegMenu(e, p) {
      const V = this._iev, rec = V.rec, mk = rec.marks, d = p.lane >= 0 ? V.D[p.lane] : null, t = Math.round(p.t * 100) / 100, items = [{ head: clock(t) + (d ? ' · ' + d.name : '') }];
      const mark = (k, v) => this.ieegMarkSet(k, v);
      const mh = this.ieegMarkHit(p);
      if (mh) {   // clic droit sur l'étiquette d'une marque
        const m = mh.m; V.selMark = { kind: m.kind, i: m.i }; this.ieegDraw(); const it = [{ head: `${m.label} · ${clock(m.t)}` }];
        if (m.kind === 'file') it.push({ label: 'En faire le début de crise', run: () => mark('onset', m.t) }, { label: 'En faire la fin de crise', run: () => mark('end', m.t) });
        else { if (m.kind === 'user' || m.kind === 'inter') it.push({ label: 'Renommer…', run: () => { const l = prompt('Libellé de la marque', m.label); if (l && l.trim()) { (m.kind === 'user' ? mk.user : V.rec.imarks)[m.i].label = l.trim(); V.dirty = true; this.ieegDraw(); } } }); if (V.cursor != null && Math.abs(V.cursor - m.t) > 1e-3) it.push({ label: `Placer au curseur (${clock(V.cursor)})`, run: () => this.ieegMarkSet(m.kind, V.cursor, m.i) }); it.push({ label: 'Supprimer (Suppr)', danger: true, run: () => this.ieegMarkDelete(m) }); }
        this.popupMenu(it, e.clientX, e.clientY); return;
      }
      if (d && V.msel && V.msel.size > 1 && V.msel.has(p.lane)) this.ieegSelItems(items);
      items.push({ label: 'Début de crise ici', run: () => mark('onset', t) }, { label: 'Fin de crise ici', run: () => mark('end', t) }, ...(() => { const szL = rec.seizureId && this.dossier ? (this.dossier.seizures || []).find(z => z.id === rec.seizureId) : null, add = inter => { const l = prompt(inter ? 'Marque intercritique (commune au tracé)' : 'Marque de ' + (szL ? szL.label : 'la crise'), ''); if (l && l.trim()) { if (inter) (rec.imarks = rec.imarks || []).push({ t, label: l.trim() }); else mk.user.push({ t, label: l.trim() }); V.dirty = true; this.ieegDraw(); } };
        return szL ? [{ label: `Ajouter une marque de ${szL.label}…`, run: () => add(false) }, { label: 'Ajouter une marque intercritique…', run: () => add(true) }] : [{ label: 'Ajouter une marque…', run: () => add(this.ieegKind(rec) !== 'ictal') }]; })());
      const near = this.ieegMarks().filter(m => m.kind !== 'file').find(m => Math.abs((m.t - p.t) * V.geo.k) < 7);
      if (near) items.push({ label: `Retirer « ${near.label} »`, danger: true, run: () => { if (near.kind === 'user' || near.kind === 'inter') { (near.kind === 'user' ? mk.user : V.rec.imarks).splice(near.i, 1); V.dirty = true; this.ieegDraw(); } else mark(near.kind, null); } });
      if (d) {
        const vw = this.ieegVw(), tgt = V.msel && V.msel.size > 1 && V.msel.has(p.lane) ? [...V.msel].map(i => V.D[i].name) : [d.name], cur = (vw.colors || {})[d.name];
        items.push({ sep: true }, { group: tgt.length > 1 ? `Couleur (${tgt.length} voies)` : 'Couleur', options: LANE_COLS.map(([c, l]) => ({ label: l, on: (cur || '') === c, run: () => this.ieegLaneSet(tgt, 'colors', c || null) })) });
        if (tgt.some(n => (vw.gain || {})[n])) items.push({ label: 'Amplitude commune (annuler le gain propre)', run: () => this.ieegLaneSet(tgt, 'gain', null) });
        items.push({ label: `Masquer ${d.name} à l’écran`, run: () => { vw.hiddenDers.push(d.name); V.dirty = true; this.ieegLanes(); this.ieegChips(); this.ieegDraw(); } });
        if (d.seeg) for (const c of IE.derContacts(d, V.mem.channels)) { const x = ((V.rec.ei || {}).excludedContacts || []).includes(c); items.push({ label: x ? `Réintégrer le plot ${c} dans les calculs` : `Exclure le plot ${c} des calculs (EI, cEI, PEI, Delphos)${d.b >= 0 ? ' (ses dérivations)' : ''}`, run: () => this.ieegExcludeContacts([c], !x) }); }
      }
      if (V.nHidden && this.ieegVw().hiddenDers.length) items.push({ label: `Réafficher les voies masquées (${this.ieegVw().hiddenDers.length})`, run: () => { this.ieegVw().hiddenDers = []; V.dirty = true; this.ieegLanes(); this.ieegChips(); this.ieegDraw(); } });
      if (V.ei && V.meth && V.meth !== 'ei' && this.ieegMenuMeth) this.ieegMenuMeth(items, t, d);
      else if (V.ei) {
        const P = this.ieegEIParams(); items.push({ sep: true }, { label: 'Début de la fenêtre d’analyse ici', run: () => { P.start = t; P.auto = false; this.ieegEIChanged(true); } }, { label: 'Fin de la fenêtre d’analyse ici', run: () => { P.end = t; P.auto = false; if (P.szEnd == null || P.szEnd > t || P.szEnd < P.start) P.szEnd = t; this.ieegEIChanged(true); } });
        if (d && V.er && V.er.names.includes(d.name)) {
          const man = rec.ei.manual[d.name] != null, exc = rec.ei.excluded.includes(d.name);
          items.push({ label: `Détection de ${d.name} ici (Alt + clic)`, run: () => this.ieegSetManual(d.name, t) });
          if (man) items.push({ label: `Détection automatique pour ${d.name}`, run: () => this.ieegSetManual(d.name, null) });
          items.push({ label: exc ? `Réintégrer ${d.name} dans l’EI` : `Exclure ${d.name} de l’EI (artefact)`, run: () => this.ieegExclude(d.name, !exc) });
        }
      }
      this.popupMenu(items, e.clientX, e.clientY);
    },

    // ------------------------------------------------------------------ index d'épileptogénicité
    ieegEIParams() {
      const V = this._iev, rec = V.rec, dur = V.mem.duration, mk = rec.marks || {}; rec.ei = rec.ei || {};
      const P = rec.ei.params || (rec.ei.params = {}), D0 = { nu: IE.DEF.nu, lambda: IE.DEF.lambda, tau: IE.DEF.tau, H: IE.DEF.H, win: IE.DEF.win, line: V.mem.line || rec.line || 50, base: 10 };   // modifié en place (les réglages du panneau le référencent)
      for (const [k, v] of Object.entries(D0)) if (P[k] == null) P[k] = v;
      if (!P.bands) P.bands = JSON.parse(JSON.stringify(IE.BANDS));
      if (P.start == null || P.end == null || P.szEnd == null || P.auto == null) this.ieegFitWindow(P, mk, dur);   // v4.14 : fenêtres antérieures recalées une fois
      rec.ei.manual = rec.ei.manual || {}; rec.ei.excluded = rec.ei.excluded || []; rec.ei.excludedContacts = rec.ei.excludedContacts || []; return P;
    },
    /** fenêtre d'analyse = crise annotée (début → fin) ; sans fin annotée : début + 60 s ; sans début : tout le tracé (avertissement).
     *  Page–Hinkley part de la référence (P.base secondes d'activité de fond avant le début) : sa moyenne cumulée doit
     *  précéder la décharge, sinon les voies du début ne se détachent pas */
    ieegFitWindow(P, mk, dur) {
      P.start = mk.onset != null ? mk.onset : 0;
      P.end = mk.end != null && mk.end > P.start ? mk.end : mk.onset != null ? Math.min(dur, mk.onset + 60) : dur;
      P.szEnd = P.end; P.auto = true;
    },
    /** début de Page–Hinkley : début de la fenêtre moins la référence (borné à 0) */
    ieegPHStart(P) { return Math.max(0, P.start - (+P.base || 0)); },
    ieegEIPanel(open, meth) {
      const V = this._iev; V.ei = open; V.side.hidden = !open; V.el.querySelector('.ie-eib').classList.toggle('on', open); V.el.querySelector('.ie-sidetab').hidden = open; const gp = V.el.querySelector('.ie-sgrip'); gp.hidden = !open; if (open) gp.style.top = V.el.querySelector('.ie-top').offsetHeight + 'px';
      if (meth) V.meth = meth; V.meth = V.meth || (V.rec.view && V.rec.view.meth) || (this.ieegKind(V.rec) === 'inter' ? 'hfo' : 'ei');
      if (this.ieegMethList && !this.ieegMethList().includes(V.meth)) V.meth = this.ieegMethList()[0];
      if (open) { if (this.ieegTabs) this.ieegTabs(); this.ieegEIParams(); this.ieegChips(); this.ieegEIRender(); if (!V.er && !V.computing && (V.meth === 'ei' || V.meth === 'cei')) this.ieegComputeER(false, true); }   // relu s'il a déjà été calculé ; sinon l'utilisateur marque la crise puis lance le calcul
      this.ieegDraw();
    },
    /** dérivations retenues pour l'EI : voies SEEG valides du montage affiché */
    ieegEIDers() { const V = this._iev; return V.D.filter(d => d.seeg && !d.bad); },
    /** clé des réglages du rapport d'énergie (cache) */
    ieegERKey(P, mem) { return JSON.stringify({ b: P.bands, w: +P.win, l: +P.line, s: IE.DEF.seg, st: IE.DEF.step, fs: mem.fs, n: mem.nSamples }); },
    /** rapport d'énergie déjà calculé (fichier ieeg/<id>/er_<montage>.f32) : relu sans recalcul ; null s'il manque ou ne convient pas */
    async ieegLoadER(V) {
      const rec = V.rec, P = this.ieegEIParams(), C = rec.ei && rec.ei.erCache && rec.ei.erCache[V.montage]; if (!C || C.key !== this.ieegERKey(P, V.mem)) return null;
      const by = new Map(this.ieegEIDers().map(d => [d.name, d])), ders = C.names.map(n => by.get(n)); if (ders.some(x => !x)) return null;
      const b = await L.readFile(this.dossier, C.path).catch(() => null); if (!b) return null; const f = new Float32Array(await b.arrayBuffer()); if (f.length !== C.names.length * C.len) return null;
      return { montage: V.montage, ders, names: C.names.slice(), ers: C.names.map((n, i) => f.subarray(i * C.len, (i + 1) * C.len)), t0: C.t0, dt: C.dt, range: C.range, opts: null, ms: 0, loaded: C.at };
    },
    async ieegSaveER(V) {
      const E = V.er, rec = V.rec, len = E.ers[0].length, buf = new Float32Array(E.ers.length * len), path = `ieeg/${rec.id}/er_${V.montage}.f32`;
      E.ers.forEach((er, i) => buf.set(er, i * len));
      try { await L.writeFile(this.dossier, path, new Blob([buf.buffer], { type: 'application/octet-stream' })); rec.ei.erCache = Object.assign(rec.ei.erCache || {}, { [E.montage]: { path, key: this.ieegERKey(this.ieegEIParams(), V.mem), names: E.names, t0: E.t0, dt: E.dt, len, range: E.range, at: ST.now() } }); V.dirty = true; }
      catch (e) { console.warn('cache ER', e); }
    },
    /** rapport d'énergie : relu du dossier s'il a été calculé (force : recalcul) ; loadOnly : seulement relu, sans calcul */
    async ieegComputeER(force, loadOnly) {
      const V = this._iev; if (!V || V.computing) return; const mem = V.mem, fs = mem.fs, P = this.ieegEIParams(), ders = this.ieegEIDers();
      if (!ders.length) { if (!loadOnly) this.toast('Aucune voie SEEG valide dans ce montage'); return; }
      if (!force) {   // déjà calculé : relu, sans recalcul
        V.computing = true; let E = null; try { E = await this.ieegLoadER(V); } catch (e) { console.warn(e); } V.computing = false;
        if (this._iev !== V) return;
        if (E) { V.er = E; this.ieegERScale(); this.ieegHeat(); this.ieegRunEI(); this.ieegEIRender(); this.ieegChips(); this.ieegDraw(); return; }
        if (loadOnly) { this.ieegEIRender(); return; }
      }
      const dur = mem.duration, ra = dur <= 900 ? 0 : Math.max(0, this.ieegPHStart(P) - 30), rb = dur <= 900 ? dur : Math.min(dur, P.end + P.H + 30);
      const opts = { bands: P.bands, win: P.win, line: P.line, seg: IE.DEF.seg, step: IE.DEF.step };
      V.computing = true; V.prog = 0; this.ieegEIRender(); const tA = performance.now();
      try {
        const i0 = Math.round(ra * fs), i1 = Math.round(rb * fs), sig = ders.map(d => IE.deriveSignal(mem.data, d, i0, i1)); let out;
        if (SV.Work && SV.Work.available && sig.length > 4) {
          const n = Math.max(1, Math.min(8, ((navigator.hardwareConcurrency || 2) - 1), Math.ceil(sig.length / 6))), size = Math.ceil(sig.length / n), chunks = [];
          for (let a = 0; a < sig.length; a += size) chunks.push(sig.slice(a, a + size));
          const pool = SV.Work.pool(['ieeg'], chunks.length), prog = chunks.map(() => 0);
          try { const parts = await Promise.all(chunks.map((c, j) => pool.call('IEEG.erBatch', [c, fs, opts], c.map(x => x.buffer), p => { prog[j] = p; V.prog = prog.reduce((s, x) => s + x, 0) / chunks.length; this.ieegProg(); })));
            out = { ers: [].concat(...parts.map(p => p.ers)), t0: parts[0].t0, dt: parts[0].dt }; } finally { pool.close(); }
        } else out = IE.erBatch(sig, fs, opts);
        if (this._iev !== V) return;
        V.er = { montage: V.montage, ders, names: ders.map(d => d.name), ers: out.ers, t0: ra + out.t0, dt: out.dt, range: [ra, rb], opts, ms: performance.now() - tA };
        this.ieegERScale(); this.ieegHeat(); this.ieegRunEI(); this.ieegSaveER(V);
      } catch (e) { console.warn(e); this.toast('Rapport d’énergie : ' + e.message, 7000); }
      finally { V.computing = false; if (this._iev === V) { this.ieegEIRender(); this.ieegChips(); this.ieegDraw(); } }
    },
    ieegProg() { const V = this._iev, b = V && V.side.querySelector('.ie-prog i'); if (b) b.style.width = Math.round((V.prog || 0) * 100) + '%'; },
    /** index des voies et bornes de couleur du rapport d'énergie : de la médiane (activité de fond, bas de la palette) au
     *  99,5e centile, sur toutes les valeurs (échelle commune) ou voie par voie (échelle par voie) */
    ieegERScale() {
      const E = this._iev.er, pct = (b, p) => b.length ? b[Math.min(b.length - 1, Math.floor(p * b.length))] : 1, all = [];
      E.idx = new Map(E.names.map((n, i) => [n, i])); E.loLane = []; E.hiLane = [];
      E.ers.forEach(er => { const st = Math.max(1, Math.floor(er.length / 800)), sub = []; for (let i = 0; i < er.length; i += st) { sub.push(er[i]); all.push(er[i]); } sub.sort((x, y) => x - y); const lo = pct(sub, 0.5); E.loLane.push(lo); E.hiLane.push(Math.max(pct(sub, 0.995), lo * 1.5 + 1e-6)); });
      all.sort((x, y) => x - y); E.lo = pct(all, 0.5); E.hi = Math.max(pct(all, 0.995), E.lo * 1.5 + 1e-6);
    },
    /** table de couleurs (256 teintes) de la palette choisie */
    ieegLut() { const V = this._iev; if (V.lut && V.lut.k === V.show.cmap) return V.lut.t; const t = new Uint8ClampedArray(768); for (let i = 0; i < 256; i++) { const c = S.cmap(V.show.cmap, i / 255); t[3 * i] = c[0]; t[3 * i + 1] = c[1]; t[3 * i + 2] = c[2]; } V.lut = { k: V.show.cmap, t }; return t; },
    /** carte du rapport d'énergie (aperçu) : une ligne par dérivation, log2(ER) de −2 à 3, palette choisie */
    ieegHeat() {
      const V = this._iev, E = V.er, n = E.ers.length, len = E.ers[0].length, cols = Math.min(1200, len), per = len / cols, c = document.createElement('canvas'); c.width = cols; c.height = n;
      const g = c.getContext('2d'), img = g.createImageData(cols, n);
      for (let r = 0; r < n; r++) { const er = E.ers[r]; for (let x = 0; x < cols; x++) { let m = 0; for (let i = Math.floor(x * per); i < Math.min(len, Math.floor((x + 1) * per) || 1); i++) if (er[i] > m) m = er[i]; const t = (Math.log2(Math.max(1e-6, m)) + 2) / 5, col = S.cmap(V.show.cmap, t), o = 4 * (r * cols + x); img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255; } }
      g.putImageData(img, 0, 0); V.heat = c;
    },
    ieegRunEI() {
      const V = this._iev, E = V.er; if (!E) return null; const rec = V.rec, P = this.ieegEIParams(), exc = this.ieegExcl(), idx = [];
      E.names.forEach((nm, i) => { if (!exc.has(nm)) idx.push(i); });
      const manual = {}; idx.forEach((i, j) => { const t = rec.ei.manual[E.names[i]]; if (t != null) manual[j] = t; });
      const r = IE.epileptogenicity(idx.map(i => E.ers[i]), { t0: E.t0, dt: E.dt, start: this.ieegPHStart(P), end: P.end, szEnd: P.szEnd, nu: P.nu, lambda: P.lambda, tau: P.tau, H: P.H, manual });
      V.res = { N0: r.N0, montage: E.montage, rows: r.rows.map((x, j) => Object.assign({ name: E.names[idx[j]], der: E.ders[idx[j]] }, x)) };
      V.resBy = new Map(V.res.rows.map(x => [x.name, x]));
      const ia = Math.max(0, Math.round((this.ieegPHStart(P) - E.t0) / E.dt)), ib = Math.min(E.ers[0].length - 1, Math.round((P.end - E.t0) / E.dt));
      V.un = new Map(E.names.map((n, i) => { const U = IE.phCurve(E.ers[i], ia, ib, P.nu, E.dt); let mn = Infinity, mx = -Infinity; for (const v of U) { if (v < mn) mn = v; if (v > mx) mx = v; } return [n, { U, t0: E.t0 + ia * E.dt, min: mn, max: mx }]; }));
      rec.ei.last = { at: ST.now(), montage: E.montage, N0: r.N0, params: { nu: P.nu, lambda: P.lambda, tau: P.tau, H: P.H, start: P.start, end: P.end, szEnd: P.szEnd, base: P.base, win: P.win, line: P.line },
        rows: V.res.rows.map(x => ({ name: x.name, elec: x.der.elec, k1: x.der.k1, k2: x.der.k2, tNd: x.tNd, tNa: x.tNa, detected: x.detected, manual: x.manual, ei: Math.round(x.ei * 1e4) / 1e4 })) };
      V.dirty = true; clearTimeout(V._saveT); V._saveT = setTimeout(() => { if (this._iev === V) this.touch(); }, 1200);
      return V.res;
    },
    /** un réglage a changé : EI recalculé (le rapport d'énergie seulement si ses réglages ou sa plage ne conviennent plus) */
    ieegEIChanged(full) {
      const V = this._iev, P = this.ieegEIParams(), E = V.er;
      if (E && (this.ieegPHStart(P) < E.range[0] - 1e-6 || P.end + P.H > E.range[1] + 1e-6) && E.range[1] - E.range[0] < V.mem.duration - 1e-6) { this.ieegComputeER(true); return; }
      cancelAnimationFrame(V._eiRaf); V._eiRaf = requestAnimationFrame(() => { if (this._iev !== V) return; this.ieegRunEI(); this.ieegEIRender(!full); this.ieegDraw(); });
    },
    ieegSetManual(name, t) { const V = this._iev, rec = V.rec; this.ieegEIParams(); if (t == null) delete rec.ei.manual[name]; else rec.ei.manual[name] = Math.round(t * 1000) / 1000; this.ieegRunEI(); this.ieegEIRender(true); this.ieegDraw(); },
    /** exclure une dérivation de l'EI (ou la réintégrer, avec les plots exclus qu'elle utilise) */
    ieegExclude(name, on) {
      const V = this._iev, rec = V.rec; this.ieegEIParams(); rec.ei.excluded = rec.ei.excluded.filter(x => x !== name); if (on) rec.ei.excluded.push(name);
      else { const d = (V.er ? V.er.ders.concat(V.D) : V.D).find(x => x.name === name); if (d) { const cs = IE.derContacts(d, V.mem.channels); rec.ei.excludedContacts = rec.ei.excludedContacts.filter(x => !cs.includes(x)); } }
      V.dirty = true; this.ieegEIUpdate(); this.ieegChips(); if (V.vpop) this.ieegVoicesRender();
    },
    /** exclure des plots de l'EI (toutes les dérivations qui les utilisent) ou les réintégrer */
    ieegExcludeContacts(names, on, quiet) { const V = this._iev, rec = V.rec; this.ieegEIParams(); rec.ei.excludedContacts = rec.ei.excludedContacts.filter(x => !names.includes(x)); if (on) rec.ei.excludedContacts.push(...names); V.dirty = true; this.ieegEIUpdate(); if (!quiet) { this.ieegChips(); if (V.vpop) this.ieegVoicesRender(); } },
    ieegEIUpdate() { const V = this._iev; if (V.er) this.ieegRunEI(); if (V.ei) this.ieegEIRender(true); this.ieegDraw(); },
    /** correspondance électrodes du tracé → électrodes du schéma ('' : aucune ; absent : automatique) */
    ieegElecMap() { const V = this._iev; return this.ieegMapFor(V.rec, V.elecs); },
    /** correspondance des électrodes du tracé avec le schéma d'implantation, au bas de chaque onglet (crise comme intercritique) */
    ieegMapHtml() {
      const V = this._iev, rec = V.rec, map = this.ieegElecMap(), nMap = V.elecs.filter(e => map[e]).length, schema = (this.elecs || []).map(e => e.name);
      return `<details class="ie-sec ie-map"${nMap < V.elecs.length ? ' open' : ''}><summary>Correspondance avec le schéma : ${nMap} / ${V.elecs.length} électrode${V.elecs.length > 1 ? 's' : ''}</summary>
          ${schema.length ? `<div class="hint">Électrode du tracé → électrode du schéma (même nom, « p » pour le prime, LA → A’, RA → A) : c’est elle qui place les valeurs sur les plots en 3D.</div><table class="ie-tab">${V.elecs.map(e => `<tr><td class="mono">${esc(e)}</td><td>→</td><td><select data-e="${esc(e)}"><option value="">— aucune</option>${schema.map(n => `<option value="${esc(n)}"${map[e] === n ? ' selected' : ''}>${esc(n)}${!rec.elecMap[e] && map[e] === n ? ' (auto)' : ''}</option>`).join('')}</select></td></tr>`).join('')}</table>` : '<div class="hint warn">Pas de schéma d’implantation dans cette exploration : les valeurs ne pourront pas être placées sur les plots.</div>'}</details>`;
    },
    ieegMapBind(side) {
      const V = this._iev; side.querySelectorAll('.ie-map select').forEach(s => s.onchange = () => { V.rec.elecMap = V.rec.elecMap || {}; V.rec.elecMap[s.dataset.e] = s.value; V.dirty = true; if (!V.meth || V.meth === 'ei' || !this.ieegMethRender) this.ieegEIRender(); else this.ieegMethRender(); });
    },
    ieegMapFor(rec, prefixes) {
      const names = (this.elecs || []).map(e => e.name), m = {}; rec.elecMap = rec.elecMap || {};
      for (const el of prefixes) { const u = rec.elecMap[el]; m[el] = u === '' ? null : u ? (names.includes(u) ? u : null) : IE.matchElectrode(el, names); }
      return m;
    },
    /** dernier EI d'un tracé, voie par voie, avec la clé du plot (ou de la paire) dans le schéma (sinon le nom du tracé) */
    /** lignes d'une méthode pour la synthèse de plusieurs crises : EI, cEI ou PEI (normalisé au maximum de la crise) */
    ieegMaxRows(rec, meth) {
      if (meth === 'cei') { const L = rec.cei && rec.cei.last; return L && L.rows ? L.rows.map(r => Object.assign({}, r, { v: r.cei })) : []; }
      if (meth === 'pei') { const L = rec.pei && rec.pei.last; if (!L) return []; const mx = Math.max(0, ...L.rows.map(r => r.raw || 0)); return L.rows.map(r => Object.assign({}, r, { v: mx > 0 ? (r.raw || 0) / mx : 0 })); }
      const L = rec.ei && rec.ei.last; return L ? L.rows.map(r => Object.assign({}, r, { v: r.ei })) : [];
    },
    /** dernier résultat d'une méthode (EI par défaut), voie par voie, avec la clé du plot (ou de la paire) dans le schéma (sinon le nom du tracé) */
    ieegKeyRows(rec, meth) {
      const src = this.ieegMaxRows(rec, meth || 'ei'); if (!src.length) return []; const map = this.ieegMapFor(rec, [...new Set(src.map(r => r.elec))]);
      return src.map(r => { const en = map[r.elec], e = en && S.findElec(this.elecs || [], en), ok = !!e && r.k1 != null; return { key: ok ? (r.k2 != null ? S.pairLabel(e.name, r.k1, r.k2) : S.pairLabel(e.name, r.k1)) : r.name, mapped: ok, name: r.name, ei: r.v }; });
    },
    /** synthèse de plusieurs crises (EImax, cEImax, PEImax) : choix des tracés (une crise chacun), maximum de la valeur
     *  normalisée de chaque voie, jeu d'Analyses (maximum de chaque voie sur les crises, comme dans les travaux de l'équipe de Marseille) */
    ieegEIMax(q0, meth0) {
      const ex = this.ieegEx(); if (!ex) return; const d = this.dossier, all = ex.recordings || [];
      const MX = { ei: { L: 'EImax', T: IE.EZT.ei, PZ: IE.EZT.eiPZ, w: 'l’EI', ref: 'index d’épileptogénicité, Bartolomei 2008' }, cei: { L: 'cEImax', T: IE.EZT.cei, w: 'le cEI', ref: 'EI de connectivité, Balatskaya 2020' }, pei: { L: 'PEImax', T: IE.EZT.pei, w: 'le PEI', ref: 'index d’entropie de permutation, Bratu 2024' } };
      const has = (r, k) => this.ieegMaxRows(r, k).length > 0, counts = Object.fromEntries(Object.keys(MX).map(k => [k, all.filter(r => has(r, k)).length]));
      let meth = q0 ? (q0.smax ? q0.smax.m : 'ei') : meth0 || Object.keys(MX).find(k => counts[k] >= 2) || 'ei';
      if (!counts[meth]) return;
      const lab = r => { const sz = r.seizureId && ST.byId(d.seizures, r.seizureId); return sz ? sz.label : r.title; };
      const m = h('div', 'modal'), card = h('div', 'modal-card wide ie-emxm'); m.appendChild(card); document.body.appendChild(m);
      let name = q0 ? q0.name : '', res = [], runs = [], recs = [], sel = null;
      const setMeth = k => { meth = k; recs = all.filter(r => has(r, k)); const ids0 = q0 && (q0.smax ? q0.smax.m === k && q0.smax.ids : k === 'ei' && q0.eimax); sel = new Set(ids0 ? ids0.filter(id => recs.some(r => r.id === id)) : recs.map(r => r.id)); card._named = !!q0 && !!ids0; if (!card._named) name = ''; };
      setMeth(meth);
      const render = () => {
        const X = MX[meth]; runs = recs.filter(r => sel.has(r.id)); const keyed = runs.map(r => ({ r, rows: this.ieegKeyRows(r, meth) })); res = IE.eiMax(keyed.map(k => ({ id: k.r.id, rows: k.rows })), X.T, X.PZ);
        const mapped = new Set(keyed.flatMap(k => k.rows.filter(x => x.mapped).map(x => x.key))), last = r => meth === 'ei' ? r.ei.last : meth === 'cei' ? r.cei.last : r.pei.last, monts = new Set(runs.map(r => last(r).montage));
        if (!card._named) name = `${X.L} · ${runs.length} crise${runs.length > 1 ? 's' : ''}`;
        const nHi = res.filter(x => x.max >= X.T).length, T = nf(X.T, 2), nPZ = X.PZ != null ? res.filter(x => x.max > X.PZ && x.max < X.T).length : 0, cls = v => v >= X.T ? 'hi' : X.PZ != null && v > X.PZ ? 'pz' : '';
        const setting = r => { const L = last(r); return meth === 'ei' ? `ν ${nf(L.params.nu)} · λ ${nf(L.params.lambda, 1)}` : meth === 'cei' ? `seuil h² ${nf(L.thr)} · ${L.nWin} fenêtres` : `crise ${clock(L.onset)}–${clock(L.offset)}`; };
        card.innerHTML = `<div class="modal-head"><span>Synthèse de plusieurs crises — valeur maximale par plot</span><button class="close">✕</button></div>
          <div class="help ie-emxbody"><div class="ctrl-row"><span class="seg ie-emxm-m">${Object.keys(MX).map(k => `<button data-mx="${k}" class="${k === meth ? 'on' : ''}"${counts[k] ? '' : ' disabled'} title="${esc(MX[k].ref)} — ${counts[k]} tracé${counts[k] > 1 ? 's' : ''}">${MX[k].L}</button>`).join('')}</span></div>
            <div class="hint">Le ${X.L} d’une voie est la valeur maximale de ${X.w} parmi les crises choisies (chaque valeur est normalisée à 1 dans sa crise). Les voies sont rapprochées par leurs plots dans le schéma d’implantation.</div>
            <table class="ie-tab ie-emxruns"><tr><th></th><th>tracé</th><th>crise</th><th>montage</th><th>réglages</th><th>≥ ${T}</th></tr>
            ${recs.map(r => { const rows = this.ieegMaxRows(r, meth), n3 = rows.filter(x => x.v >= X.T).length; return `<tr><td><input type="checkbox" data-r="${r.id}"${sel.has(r.id) ? ' checked' : ''}></td><td>${esc(r.title)}</td><td>${esc(lab(r))}</td><td>${last(r).montage === 'bipolar' ? 'bipolaire' : 'monopolaire'}</td><td class="muted">${setting(r)}</td><td>${n3}</td></tr>`; }).join('')}</table>
            ${monts.size > 1 ? '<div class="hint warn">Montages différents : les dérivations bipolaires et les plots monopolaires ne se regroupent pas.</div>' : ''}
            <div class="ctrl-row"><label>nom du jeu <input class="emx-name" value="${esc(name)}" style="width:260px"></label><span class="muted">${res.length} voies · <b>${nHi}</b> avec ${X.L} ≥ ${T}${X.PZ != null ? ` (zone épileptogène) · <b>${nPZ}</b> entre ${nf(X.PZ, 1)} et ${T} (propagation)` : ''}${res.some(x => !mapped.has(x.key)) ? ` · ${res.filter(x => !mapped.has(x.key)).length} hors schéma (non placées sur les plots)` : ''}</span></div>
            <div class="ie-tabwrap" style="max-height:48vh"><table class="ie-tab" style="--thr:${Math.round(X.T * 100)}%"><tr><th>voie</th><th>${X.L}</th>${runs.map(r => `<th title="${esc(r.title)}">${esc(lab(r))}</th>`).join('')}<th title="Crises où la valeur de la voie atteint ${T}">≥ ${T}</th></tr>
            ${res.map(x => `<tr class="${cls(x.max)}"><td class="nm mono">${esc(x.key)}${mapped.has(x.key) ? '' : ' <span class="muted" title="pas d’électrode correspondante dans le schéma">?</span>'}</td><td><i class="ie-bar"><b style="width:${Math.round(x.max * 100)}%"></b></i>${nf(x.max, 2)}</td>${runs.map(r => { const v = x.values[r.id]; return `<td class="${r.id === x.from && x.max > 0 && x.n > 1 ? 'mx' : ''}">${v == null ? '—' : nf(v, 2)}</td>`; }).join('')}<td title="${X.PZ != null ? `${x.n03} crise(s) ≥ ${T}, ${x.npz} entre ${nf(X.PZ, 1)} et ${T}` : ''}">${x.n03} / ${x.n}</td></tr>`).join('')}</table></div></div>
          <div class="modal-foot"><button class="primary ok"${runs.length ? '' : ' disabled'}>${q0 && card._named ? `Mettre à jour « ${esc(q0.name)} »` : 'Enregistrer dans Analyses (3D)'}</button><button class="csv"${runs.length ? '' : ' disabled'}>CSV</button><button class="cancel">Fermer</button></div>`;
        card.querySelector('.modal-head .close').onclick = card.querySelector('.modal-foot .cancel').onclick = () => m.remove();
        card.querySelectorAll('[data-mx]').forEach(b => b.onclick = () => { if (b.dataset.mx === meth) return; setMeth(b.dataset.mx); render(); });
        card.querySelectorAll('.ie-emxruns input[data-r]').forEach(i => i.onchange = () => { if (i.checked) sel.add(i.dataset.r); else sel.delete(i.dataset.r); render(); });
        card.querySelector('.emx-name').oninput = e => { name = e.target.value; card._named = true; };
        card.querySelector('.modal-foot .csv').onclick = () => { const f = v => v == null ? '' : String(Math.round(v * 1000) / 1000).replace('.', ','); const lines = [`# EpiScope — ${X.L} (maximum sur plusieurs crises : ${X.ref}) — ${runs.map(lab).join(', ')}`, ['voie', X.L, 'crise du maximum', ...runs.map(lab), 'crises ≥ ' + T].join(';'), ...res.map(x => [x.key, f(x.max), lab(runs.find(r => r.id === x.from) || {}), ...runs.map(r => f(x.values[r.id])), x.n03].join(';'))];
          const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })); a.download = X.L + '_' + (ex.label || 'SEEG').replace(/[^\w\-]+/g, '_') + '.csv'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); };
        card.querySelector('.modal-foot .ok').onclick = () => {
          if (!this.state) { this.toast('Ouvrir l’exploration SEEG pour enregistrer le jeu'); return; } this.ensureSeeg();
          const st = this.state, ids = runs.map(r => r.id).sort(), values = {}, unmatched = []; for (const x of res) { if (mapped.has(x.key)) values[x.key] = Math.round(x.max * 1000) / 1000; else unmatched.push(x.key); }
          if (!Object.keys(values).length) { this.toast('Aucune voie ne correspond aux électrodes du schéma (correspondance à compléter dans le panneau EI de chaque tracé)', 6000); return; }
          const same = x => meth === 'ei' ? x.eimax && x.eimax.slice().sort().join() === ids.join() : x.smax && x.smax.m === meth && x.smax.ids.slice().sort().join() === ids.join();
          let q = (q0 && card._named && st.quant.find(x => x.id === q0.id)) || st.quant.find(same), isNew = !q;
          if (!q) { q = { id: uid('q'), unit: '', cmap: 'inferno', mode: 'both', min: 0, max: 1 }; st.quant.push(q); }
          Object.assign(q, { name: (name || '').trim() || `${X.L} · ${runs.length} crises`, source: `${X.L} · maximum de ${X.w} sur ${runs.map(lab).join(', ')}`, values, unmatched }, meth === 'ei' ? { eimax: ids } : { smax: { m: meth, ids } });
          if (this.viewer) this.viewer.setCellConfig(this.viewer.active, this.quantViewCfg(q), true); this.ui.seeg.quantOpenId = q.id;
          this.seegChanged(); if (this.refreshMarkers) this.refreshMarkers(); this.touch('exploration', ex.id, X.L); m.remove(); if (this.ui.tab === 'quant') this.renderQuant();
          this.toast(`${isNew ? 'Jeu' : 'Jeu mis à jour :'} « ${q.name} » — ${Object.keys(values).length} plots, maximum de ${runs.length} crises ; affiché dans la vue 3D active`, 6000);
        };
      };
      render();
    },
    ieegEIRender(onlyRes) {
      const V = this._iev, side = V.sb || V.side; if (!V.ei) return;
      if (V.meth && V.meth !== 'ei' && this.ieegMethRender) { if (V.res && V.meth === 'cei' && this.ieegCEIRecombine) this.ieegCEIRecombine(); return this.ieegMethRender(onlyRes); }
      const rec = V.rec, P = this.ieegEIParams(), E = V.er, R = V.res;
      const resHtml = () => {
        if (!E) return V.computing ? '' : '<div class="hint">Rapport d’énergie non calculé.</div>';
        if (!R) return '';
        const exc = this.ieegExcl(), rows = R.rows.slice().sort((a, b) => b.ei - a.ei || (a.tNd == null) - (b.tNd == null) || a.name.localeCompare(b.name, 'fr', { numeric: true })), nDet = R.rows.filter(r => r.detected).length, nHi = R.rows.filter(r => r.ei >= IE.EZT.ei).length, nPZ = R.rows.filter(r => IE.eiZone(r.ei) === 'pz').length, on = rec.marks && rec.marks.onset;
        const sel = V.sel >= 0 && V.D[V.sel] ? V.D[V.sel].name : null;
        return `<div class="ie-n0">${R.N0 != null ? `N0 = <b>${clock(R.N0)}</b>${on != null ? ` (${R.N0 - on >= 0 ? '+' : '−'}${nf(Math.abs(R.N0 - on), 1)} s / début marqué)` : ''} · ` : 'aucune détection · '}${nDet} / ${R.rows.length} voies détectées · <b>${nHi}</b> voie${nHi > 1 ? 's' : ''} EI ≥ 0,4 <span class="ie-ezk" title="zone épileptogène">EZ</span> · <b>${nPZ}</b> entre 0,1 et 0,4 <span class="ie-pzk" title="zone de propagation">PZ</span>${E.montage !== V.montage ? ` · <span class="warn">calculé en ${E.montage === 'bipolar' ? 'bipolaire' : 'monopolaire'}</span>` : ''}</div>
          <div class="ie-tabwrap"><table class="ie-tab" style="--thr:40%"><tr><th title="Inclure dans l’EI"></th><th>voie</th><th title="Délai de détection par rapport à N0">délai</th><th>EI</th><th></th></tr>
          ${rows.map(r => `<tr data-n="${esc(r.name)}" class="${r.ei >= IE.EZT.ei ? 'hi' : IE.eiZone(r.ei) === 'pz' ? 'pz' : ''}${r.name === sel ? ' sel' : ''}"><td><input type="checkbox" class="x-inc" checked></td><td class="nm mono">${esc(r.name)}</td><td title="${r.detected ? 'Nd ' + clock(r.tNd) + (r.tNa != null ? ' · alarme ' + clock(r.tNa) : '') : 'pas de détection : fin de crise retenue'}">${r.detected ? '+' + nf(r.tNd - R.N0, 1) + ' s' : '—'}${r.manual ? ' <span class="ie-man" title="détection posée à la main">✎</span>' : ''}</td><td><i class="ie-bar"><b style="width:${Math.round(r.ei * 100)}%"></b></i>${nf(r.ei, 2)}</td><td>${r.manual ? '<a class="x-auto" title="Détection automatique">↺</a>' : ''}</td></tr>`).join('')}
          ${[...exc].filter(([n]) => E.names.includes(n)).map(([n, why]) => `<tr data-n="${esc(n)}" class="exc"><td><input type="checkbox" class="x-inc" title="Réintégrer"></td><td class="nm mono">${esc(n)}</td><td colspan="3">exclue${why !== 'voie' ? ` (plot ${esc(why)})` : ''}</td></tr>`).join('')}</table></div>`;
      };
      const bindRes = box => {
        box.querySelectorAll('tr[data-n]').forEach(tr => {
          const nm = tr.dataset.n; tr.querySelector('.x-inc').onclick = e => { e.stopPropagation(); this.ieegExclude(nm, !e.target.checked); };
          const a = tr.querySelector('.x-auto'); if (a) a.onclick = e => { e.stopPropagation(); this.ieegSetManual(nm, null); };
          tr.onclick = () => this.ieegGoto(nm);
        });
      };
      if (onlyRes && side.querySelector('.ie-res')) { const box = side.querySelector('.ie-res'); const st = box.querySelector('.ie-tabwrap'), sc = st ? st.scrollTop : 0; box.innerHTML = resHtml(); bindRes(box); const st2 = box.querySelector('.ie-tabwrap'); if (st2) st2.scrollTop = sc; this.ieegSaveLabel(); return; }
      const B = P.bands, map = this.ieegElecMap(), nMap = V.elecs.filter(e => map[e]).length, schema = (this.elecs || []).map(e => e.name), mk = rec.marks || {};
      const METHOD = 'Rapport d’énergie ER = (Eβ + Eγ) / (Eθ + Eα) sur une fenêtre glissante ; changement détecté par l’algorithme de Page–Hinkley (Nd) ; EI = ER cumulé pendant H après Nd, divisé par le délai à la première détection N0 (+ τ), normalisé à 1. Calcul local, sans AnyWave ni Matlab.';
      const warn = mk.onset == null ? 'Début de crise non annoté : la fenêtre couvre tout le tracé. Marquer le début et la fin de crise (clic droit sur le tracé).' : mk.end == null ? 'Fin de crise non annotée : fenêtre arrêtée 60 s après le début. Marquer la fin (clic droit sur le tracé).' : '';
      const when = E && E.loaded ? new Date(E.loaded) : null;
      side.innerHTML = `<div class="ie-eih" title="${esc(METHOD)}"><b>Index d’épileptogénicité</b><span class="muted">Bartolomei et al., Brain 2008 ⓘ</span></div>
        <div class="ie-legend"><span>${LG.nd} détection Nd</span><span>${LG.man} posée à la main <span class="m">(Alt + clic)</span></span><span>${LG.na} alarme Na</span><span>${LG.n0} N0 (1re détection)</span><span><svg width="16" height="12"><path d="M1 3C5 4 7 5 9 9S13 3 15 2" stroke="#5ee7ff" fill="none" stroke-width="1.3"/></svg> U<sub>N</sub></span><span>ER <i class="ie-lgbar" style="background:${S.cmapCss(V.show.cmap)}"></i></span></div>
        ${warn ? `<div class="ie-warnbox">⚠ ${esc(warn)}</div>` : ''}
        <div class="ie-sec"><div class="ie-sh">Fenêtre d’analyse <span class="muted">(${V.montage === 'bipolar' ? 'bipolaire' : 'monopolaire'}${P.auto ? ' · crise annotée' : ' · réglée à la main'})</span></div>
          <div class="ctrl-row"><label title="Début de la fenêtre (début de crise annoté par défaut)">du <input type="number" step="0.5" class="p-start" value="${nf(P.start, 2).replace(/\s/g, '').replace(',', '.')}"> s</label><label title="Fin de la fenêtre (fin de crise annotée par défaut)">au <input type="number" step="0.5" class="p-end" value="${nf(P.end, 2).replace(/\s/g, '').replace(',', '.')}"> s</label><button class="p-fit" title="Fenêtre = début → fin de crise annotés">caler sur la crise</button></div>
          <div class="ctrl-row"><label title="Activité de fond avant le début, d’où part Page–Hinkley (sa moyenne cumulée doit précéder la décharge ; 0 = partir du début de la fenêtre)">référence avant <input type="number" step="1" min="0" class="p-base" value="${P.base}"> s</label><label title="Une voie sans détection prend cet instant comme Nd">fin de crise <input type="number" step="0.5" class="p-szend" value="${nf(P.szEnd, 2).replace(/\s/g, '').replace(',', '.')}"> s</label></div></div>
        <div class="ie-sec"><div class="ie-sh">Page–Hinkley</div>
          <label class="ie-sl" title="Biais ν (unités d’ER) : augmenter pour ne détecter que les hausses franches">ν biais <input type="range" class="p-nu" min="0.05" max="3" step="0.05" value="${P.nu}"><output>${nf(P.nu)}</output></label>
          <label class="ie-sl" title="Seuil λ (ER × s) : augmenter pour retarder ou éviter les détections">λ seuil <input type="range" class="p-lambda" min="0.5" max="40" step="0.5" value="${P.lambda}"><output>${nf(P.lambda, 1)}</output></label>
          <div class="ctrl-row"><label title="Constante τ ajoutée au délai (s)">τ <input type="number" step="0.5" min="0.1" class="p-tau" value="${P.tau}"> s</label><label title="Durée H d’intégration de l’ER après la détection (s)">H <input type="number" step="0.5" min="0.5" class="p-H" value="${P.H}"> s</label><button class="p-def" title="ν 0,5 · λ 8 · τ 1 s · H 5 s">défaut</button></div></div>
        <details class="ie-sec ie-bands"${V.bandsOpen ? ' open' : ''}><summary>Rapport d’énergie : bandes, fenêtre D, secteur</summary>
          ${[['theta', 'θ'], ['alpha', 'α'], ['beta', 'β'], ['gamma', 'γ']].map(([k, l]) => `<div class="ctrl-row"><label>${l} <input type="number" step="0.1" class="b-lo" data-b="${k}" value="${B[k][0]}"> – <input type="number" step="0.1" class="b-hi" data-b="${k}" value="${B[k][1]}"> Hz</label></div>`).join('')}
          <div class="ctrl-row"><label>D <select class="p-win">${[0.5, 1, 2].map(v => `<option value="${v}"${+P.win === v ? ' selected' : ''}>${nf(v, 1)} s</option>`).join('')}</select></label><label>secteur <select class="p-line">${[[50, '50 Hz'], [60, '60 Hz'], [0, 'aucun']].map(([v, l]) => `<option value="${v}"${+P.line === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label><button class="p-bdef">défaut</button></div>
          <div class="hint">Périodogramme : segments de 0,5 s (Hann) tous les 0,125 s, moyennés sur D ; signal ramené vers 250 Hz ; raies du secteur exclues.</div></details>
        <div class="ie-status">${V.computing ? `Rapport d’énergie (${this.ieegEIDers().length} dérivations)…<div class="ie-prog"><i style="width:${Math.round((V.prog || 0) * 100)}%"></i></div>` : E ? `<span>ER : ${E.names.length} dérivations ${E.montage === 'bipolar' ? 'bipolaires' : 'monopolaires'} · ${when ? `relu (calculé le ${when.toLocaleDateString(SV.LOC)} à ${when.toLocaleTimeString(SV.LOC, { hour: '2-digit', minute: '2-digit' })})` : `calculé en ${nf(E.ms / 1000, 1)} s`}</span><button class="p-er" title="Recalculer le rapport d’énergie">↻</button>` : `<button class="primary p-er" title="Rapport d’énergie de toutes les voies, puis EI sur la fenêtre d’analyse">Calculer l’EI</button>${mk.onset == null || mk.end == null ? '<span class="muted">après avoir marqué le début et la fin de crise (clic droit sur le tracé)</span>' : ''}`}</div>
        <div class="ie-res"></div>
        <div class="btnrow"><button class="primary ie-save"${R ? '' : ' disabled'}></button><button class="ie-csv"${R ? '' : ' disabled'}>CSV</button></div>
        ${this.ieegMapHtml()}`;
      const q = s => side.querySelector(s), resBox = q('.ie-res'); resBox.innerHTML = resHtml(); bindRes(resBox); this.ieegSaveLabel();
      const setN = (cls, key, min) => { const i = q(cls); if (i) i.onchange = () => { const v = num(i.value, P[key]); P[key] = min != null ? Math.max(min, v) : v; if (['start', 'end', 'szEnd'].includes(key)) P.auto = false; if (key === 'end' && P.szEnd > P.end) P.szEnd = P.end; this.ieegEIChanged(true); }; };
      setN('.p-start', 'start', 0); setN('.p-end', 'end', 0); setN('.p-szend', 'szEnd', 0); setN('.p-base', 'base', 0); setN('.p-tau', 'tau', 0.1); setN('.p-H', 'H', 0.5);
      q('.p-fit').onclick = () => { this.ieegFitWindow(P, rec.marks || {}, V.mem.duration); this.ieegEIChanged(true); };
      for (const [cls, key, d] of [['.p-nu', 'nu', 2], ['.p-lambda', 'lambda', 1]]) { const i = q(cls), o = i.nextElementSibling; i.oninput = () => { P[key] = +i.value; o.textContent = nf(P[key], d); this.ieegEIChanged(false); }; }
      q('.p-def').onclick = () => { Object.assign(P, { nu: IE.DEF.nu, lambda: IE.DEF.lambda, tau: IE.DEF.tau, H: IE.DEF.H }); this.ieegEIChanged(true); };
      const reER = () => { V.er = null; V.res = null; V.resBy = new Map(); V.heat = null; this.ieegComputeER(true); };
      side.querySelector('details.ie-bands').ontoggle = e => { V.bandsOpen = e.target.open; };
      side.querySelectorAll('.b-lo, .b-hi').forEach(i => i.onchange = () => { const b = P.bands[i.dataset.b], v = num(i.value, NaN); if (!isFinite(v)) return; b[i.classList.contains('b-lo') ? 0 : 1] = v; reER(); });
      q('.p-win').onchange = e => { P.win = +e.target.value; reER(); }; q('.p-line').onchange = e => { P.line = +e.target.value; reER(); };
      q('.p-bdef').onclick = () => { P.bands = JSON.parse(JSON.stringify(IE.BANDS)); P.win = IE.DEF.win; reER(); };
      const er = q('.p-er'); if (er) er.onclick = reER;
      q('.ie-save').onclick = () => this.ieegSaveQuant(); q('.ie-csv').onclick = () => this.ieegCSV();
      this.ieegMapBind(side);
    },
    ieegSaveLabel() { const V = this._iev, b = V.side.querySelector('.ie-save'); if (!b) return; const q = V.rec.ei && V.rec.ei.quantId && ((this.state && this.state.quant) || []).find(x => x.id === V.rec.ei.quantId); b.textContent = q ? `Mettre à jour « ${q.name} »` : 'Enregistrer dans Analyses (3D)'; b.disabled = !V.res; const c = V.side.querySelector('.ie-csv'); if (c) c.disabled = !V.res; },
    ieegGoto(name) {
      const V = this._iev, r = V.resBy.get(name), li = V.D.findIndex(d => d.name === name);
      if (li >= 0) { if (!V.lanes.includes(li)) { V.hide.delete(V.D[li].seeg ? V.D[li].elec : '·'); this.ieegLanes(); this.ieegChips(); } V.sel = li; const j = V.lanes.indexOf(li), nVis = V.geo ? V.geo.nVis : 20; if (j < V.scroll || j >= V.scroll + nVis) V.scroll = Math.max(0, j - Math.floor(nVis / 2)); }
      const t = r && r.detected ? r.tNd : (V.res && V.res.N0 != null ? V.res.N0 : null); if (t != null) { V.t = clamp(t - V.page * 0.3, 0, Math.max(0, V.mem.duration - V.page)); V.cursor = t; }
      this.ieegDraw(); this.ieegEIRender(true);
    },
    ieegSaveQuant() {
      const V = this._iev, R = V.res; if (!R) return; const rec = V.rec, P = rec.ei.params, map = this.ieegElecMap(), values = {}, unmatched = [];
      if (!this.state) { this.toast('Ouvrir l’exploration SEEG pour enregistrer le jeu'); return; }
      for (const r of R.rows) { const d = r.der, en = map[d.elec], e = en && S.findElec(this.elecs || [], en); if (!e || d.k1 == null) { unmatched.push(r.name); continue; } values[d.k2 != null ? S.pairLabel(e.name, d.k1, d.k2) : S.pairLabel(e.name, d.k1)] = Math.round(r.ei * 1000) / 1000; }
      if (!Object.keys(values).length) { this.toast('Aucune voie ne correspond aux électrodes du schéma : compléter la correspondance (en bas du panneau)', 6000); const m = V.side.querySelector('.ie-map'); if (m) { m.open = true; m.scrollIntoView({ block: 'nearest' }); } return; }
      this.ensureSeeg(); const st = this.state; let q = rec.ei.quantId && st.quant.find(x => x.id === rec.ei.quantId), isNew = !q;
      if (!q) { q = { id: uid('q'), name: 'EI · ' + rec.title, unit: '', cmap: 'inferno', mode: 'both', min: 0, max: 1 }; st.quant.push(q); rec.ei.quantId = q.id; }
      Object.assign(q, { source: `EI Bartolomei 2008 · ${R.montage === 'bipolar' ? 'bipolaire' : 'monopolaire'} · ν ${nf(P.nu)} · λ ${nf(P.lambda, 1)}${P.tau !== IE.DEF.tau || P.H !== IE.DEF.H ? ` · τ ${nf(P.tau, 1)} s · H ${nf(P.H, 1)} s` : ''}`, values, unmatched, ieeg: rec.id, method: 'ei' });
      if (this.viewer) this.viewer.setCellConfig(this.viewer.active, this.quantViewCfg(q), true); this.ensureSeeg().quantOpenId = q.id;
      this.seegChanged(); if (this.refreshMarkers) this.refreshMarkers(); this.touch('exploration', (this.ieegEx() || {}).id, 'EI'); V.dirty = false;
      this.ieegSaveLabel(); if (this.ui.tab === 'quant') this.renderQuant();
      this.toast(`${isNew ? 'Jeu' : 'Jeu mis à jour :'} « ${q.name} » — ${Object.keys(values).length} plots${unmatched.length ? `, ${unmatched.length} voie${unmatched.length > 1 ? 's' : ''} hors schéma` : ''} ; affiché dans la vue 3D active (fermer la visionneuse)`, 6000);
    },
    ieegCSV() {
      const V = this._iev, R = V.res; if (!R) return; const rec = V.rec, P = rec.ei.params, map = this.ieegElecMap(), f = v => v == null || !isFinite(v) ? '' : String(Math.round(v * 1000) / 1000).replace('.', ',');
      const lines = [`# EpiScope — index d'épileptogénicité (Bartolomei et al., Brain 2008) — ${rec.title}`, `# montage ${R.montage}; fenêtre ${f(P.start)}–${f(P.end)} s; fin de crise ${f(P.szEnd)} s; nu ${f(P.nu)}; lambda ${f(P.lambda)}; tau ${f(P.tau)} s; H ${f(P.H)} s; D ${f(P.win)} s; N0 ${f(R.N0)} s`,
        '# zone : EZ si EI ≥ 0,4 (zone épileptogène), PZ si 0,1 < EI < 0,4 (zone de propagation)', 'voie;électrode du schéma;détection Nd (s);alarme Na (s);délai / N0 (s);EI;zone;détection'];
      for (const r of R.rows.slice().sort((a, b) => b.ei - a.ei)) lines.push([r.name, map[r.der.elec] || '', f(r.tNd), f(r.tNa), r.detected ? f(r.tNd - R.N0) : '', f(r.ei), IE.eiZone(r.ei).toUpperCase(), r.manual ? 'manuelle' : r.detected ? 'automatique' : 'aucune (fin de crise)'].join(';'));
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })); a.download = 'EI_' + rec.title.replace(/[^\w\-]+/g, '_').slice(0, 60) + '.csv'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    },
  };
  Object.assign(SV.app, M);
  SV.IeegDraw = { glyph, tick, trace, MK, THEME, AMPS, MONO, esc, nf, num, clamp, clock, fmtDur, uid, h };

  // carte des tracés en tête de l'onglet Analyses
  const rq = SV.app.renderQuant;
  SV.app.renderQuant = function () { const r = rq.apply(this, arguments); try { this.renderIeegCard(); } catch (e) { console.warn(e); } return r; };
  // crise SEEG : accès au tracé lié
  const rs = SV.app.renderSeegSeizure;
  if (rs) SV.app.renderSeegSeizure = function () {
    const r = rs.apply(this, arguments);
    try {
      const box = $('tab-seegsz'), sz = this.currentSeizure && this.currentSeizure(), ex = this.ieegEx(), recs = box && sz && ex ? (ex.recordings || []).filter(x => x.seizureId === sz.id || (x.bySz && x.bySz[sz.id])) : [];
      if (recs.length) { const row = h('div', 'ie-szrow', recs.map(x => { const slot = x.seizureId === sz.id ? x : (x.bySz || {})[sz.id] || {}, mk = slot.marks || {}, when = mk.onset != null ? ` · ${clock(mk.onset)}` : ''; return `<button data-r="${x.id}" class="ie-szopen" title="Revoir le tracé SEEG de cette crise — ${esc(x.title)}${mk.onset != null ? ` (début marqué à ${clock(mk.onset)})` : ' (début non marqué)'}">▶ Tracé${recs.length > 1 ? ' · ' + esc(x.title.length > 18 ? x.title.slice(0, 17) + '…' : x.title) : ''}${when}</button>`; }).join('')); box.insertBefore(row, box.firstChild); row.querySelectorAll('button').forEach(b => b.onclick = () => { const r = recs.find(x => x.id === b.dataset.r); if (r && r.seizureId !== sz.id && this.ieegSetSeizure) { this.ieegSetSeizure(r, sz.id); this.touch('exploration', ex.id, 'tracé SEEG : crise active'); } this.ieegOpen(r, !!b.dataset.ei); }); }
      // v5.1 : médias de cette crise (et d'elle seule) : vidéos et captures de la galerie, jeux d'analyse enregistrés
      if (box && sz && ex) {
        const d = this.dossier, G = (d.gallery || []).filter(g => g.seizureId === sz.id), Q = (ex.quant || []).filter(q => q.seizureId === sz.id || (!q.seizureId && recs.some(x => x.id === q.ieeg && x.seizureId === sz.id)));
        if (G.length || Q.length) {
          const row = h('div', 'ie-szmedia', `${G.length ? `<button class="mini-btn" data-a="gal" title="vidéos et captures liées à ${esc(sz.label)}">▣ ${G.length} média${G.length > 1 ? 's' : ''}</button>` : ''}${Q.map(q => `<button class="mini-btn" data-q="${esc(q.id)}" title="${esc(q.name || '')} : ouvrir dans Analyses">∑ ${esc((q.method || q.kind || 'analyse').toUpperCase())}</button>`).join('')}`);
          const after = box.querySelector('.ie-szrow'); if (after) after.insertAdjacentElement('afterend', row); else box.insertBefore(row, box.firstChild);
          const gb = row.querySelector('[data-a=gal]'); if (gb) gb.onclick = () => { const gi = G[0]; if (gi && this.galleryEditor) this.galleryEditor(gi, G, () => this.renderSeegSeizure()); };
          row.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { this.ui.seeg = this.ui.seeg || {}; this.ui.seeg.quantOpenId = b.dataset.q; this.go({ stage: 'ex:' + ex.id, view: 'analyses' }); });
        }
      }
    } catch (e) { console.warn(e); }
    return r;
  };
})(window.SV);
