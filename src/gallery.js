/* EpiScope — gallery.js : galerie du patient — captures de tracés EEG / SEEG (en attendant la lecture directe des tracés),
 *   autres images (photo, document) et vidéos (vidéo familiale, crise filmée pendant la phase 1…).
 *   - capture prise à la volée (outil Capture de Windows, Maj+Win+S → presse-papiers) puis Ctrl+V dans la galerie, ou
 *     image glissée ; le fichier est rangé dans le dossier (gallery/<id>.png), rien ne quitte le poste ;
 *   - métadonnées : titre, type (intercritique, critique, stimulation…), vigilance, étape (phase 1, SEEG…), crise, date,
 *     notes ; annotations vectorielles (flèche, ellipse, texte) posées sur l'image, en coordonnées relatives ;
 *   - rangement : regroupement par étape, crise, type ou mois, filtre par type, recherche, groupes repliables (une phase 1
 *     ou une SEEG compte souvent 15 à 20 captures) ; sélection pour un staff (présentation, compte rendu) ; image composée
 *     (capture + annotations) pour les rapports ;
 *   - vidéos (mp4, webm, mov) : fichier rangé tel quel (gallery/<id>.<ext>), vignette JPEG (gallery/<id>_thumb.jpg) et durée
 *     calculées à l'ajout ; lecture dans la visionneuse ; les rapports montrent la vignette (▶ et durée).              */
(function (SV) {
  'use strict';
  const $ = id => document.getElementById(id), S = SV.Store, V = S.V, L = SV.Library;
  const esc = SV.U.esc;
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const opts = (map, v) => Object.entries(map).map(([k, l]) => `<option value="${esc(k)}"${String(v) === k ? ' selected' : ''}>${esc(l)}</option>`).join('');
  const fmtDate = s => { if (!s) return ''; const d = new Date(String(s).length <= 10 ? s + 'T12:00:00' : s); return isNaN(d) ? String(s) : d.toLocaleDateString(SV.LOC); };
  const COLORS = ['#ffd23f', '#ff4d5e', '#38d6ff', '#7bd389', '#ffffff'];
  const blobToDataURL = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
  const loadImg = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
  const isVideo = g => !!g && /^video\//.test(g.mime || '');
  const fmtDur = t => { t = Math.round(t || 0); return t >= 3600 ? `${Math.floor(t / 3600)} h ${String(Math.floor(t % 3600 / 60)).padStart(2, '0')}` : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
  const VIDEO_EXT = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'video/x-m4v': 'm4v', 'video/ogg': 'ogv', 'video/x-matroska': 'mkv' };
  /** vidéo : dimensions, durée, vignette JPEG (image à ~1 s) — sans charger tout le fichier en mémoire */
  async function videoInfo(file) {
    const url = URL.createObjectURL(file), v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.playsInline = true; v.src = url;
    const out = { w: 0, h: 0, dur: 0, thumb: null };
    try {
      await new Promise(res => { v.onloadeddata = res; v.onerror = res; setTimeout(res, 10000); });
      out.dur = isFinite(v.duration) ? v.duration : 0; out.w = v.videoWidth; out.h = v.videoHeight;
      if (out.w) {
        await new Promise(res => { v.onseeked = res; setTimeout(res, 5000); try { v.currentTime = Math.min(1, (out.dur || 2) / 3); } catch (e) { res(); } });
        const sc = Math.min(1, 640 / out.w), cv = document.createElement('canvas'); cv.width = Math.round(out.w * sc); cv.height = Math.round(out.h * sc); cv.getContext('2d').drawImage(v, 0, 0, cv.width, cv.height);
        out.thumb = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.82));
      }
    } catch (e) { }
    URL.revokeObjectURL(url); return out;
  }
  /** vignette d'une vidéo pour un rapport : image + ▶ + durée */
  async function videoBadge(src, dur, maxW) {
    const im = await loadImg(src), sc = Math.min(1, (maxW || 960) / im.width), cv = document.createElement('canvas'); cv.width = Math.round(im.width * sc); cv.height = Math.round(im.height * sc);
    const c = cv.getContext('2d'), W = cv.width, H = cv.height, r = Math.min(W, H) * 0.12; c.drawImage(im, 0, 0, W, H);
    c.fillStyle = 'rgba(0,0,0,.55)'; c.beginPath(); c.arc(W / 2, H / 2, r, 0, 7); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.moveTo(W / 2 - r * 0.35, H / 2 - r * 0.5); c.lineTo(W / 2 + r * 0.55, H / 2); c.lineTo(W / 2 - r * 0.35, H / 2 + r * 0.5); c.closePath(); c.fill();
    if (dur) { const t = 'vidéo · ' + fmtDur(dur), fs = Math.max(12, Math.round(H / 18)); c.font = `600 ${fs}px "Segoe UI", system-ui, sans-serif`; const tw = c.measureText(t).width; c.fillStyle = 'rgba(0,0,0,.65)'; c.fillRect(W - tw - fs, H - fs * 1.9, tw + fs * 0.6, fs * 1.5); c.fillStyle = '#fff'; c.fillText(t, W - tw - fs * 0.7, H - fs * 0.8); }
    return cv.toDataURL('image/jpeg', 0.88);
  }
  const LSg = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } } };
  const GROUPS = [['stage', 'étape'], ['seizure', 'crise'], ['kind', 'critique / intercritique'], ['mod', 'type'], ['month', 'mois']];

  /** dessin des annotations (coordonnées relatives) sur un contexte 2D de taille W × H */
  function drawAnnotations(g, list, W, H, selIdx) {
    const lw = Math.max(2, Math.round(Math.min(W, H) / 300));
    (list || []).forEach((a, i) => {
      g.save(); g.strokeStyle = a.color || COLORS[0]; g.fillStyle = a.color || COLORS[0]; g.lineWidth = lw * (i === selIdx ? 1.6 : 1); g.lineCap = 'round'; g.lineJoin = 'round';
      g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = lw * 1.5;
      const x1 = a.x1 * W, y1 = a.y1 * H, x2 = (a.x2 == null ? a.x1 : a.x2) * W, y2 = (a.y2 == null ? a.y1 : a.y2) * H;
      if (a.type === 'arrow') {
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
        const ang = Math.atan2(y2 - y1, x2 - x1), hl = lw * 6; g.beginPath(); g.moveTo(x2, y2); g.lineTo(x2 - hl * Math.cos(ang - 0.45), y2 - hl * Math.sin(ang - 0.45)); g.lineTo(x2 - hl * Math.cos(ang + 0.45), y2 - hl * Math.sin(ang + 0.45)); g.closePath(); g.fill();
      } else if (a.type === 'ellipse') {
        g.beginPath(); g.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.max(2, Math.abs(x2 - x1) / 2), Math.max(2, Math.abs(y2 - y1) / 2), 0, 0, Math.PI * 2); g.stroke();
      } else if (a.type === 'text') {
        const fs = Math.max(12, Math.round(Math.min(W, H) / 32)); g.font = `600 ${fs}px "Segoe UI", system-ui, sans-serif`; g.textBaseline = 'top';
        const tw = g.measureText(a.text || '').width; g.shadowBlur = 0; g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x1 - 4, y1 - 3, tw + 8, fs + 6); g.fillStyle = a.color || COLORS[0]; g.fillText(a.text || '', x1, y1);
        if (i === selIdx) { g.strokeRect(x1 - 4, y1 - 3, tw + 8, fs + 6); }
      }
      g.restore();
    });
  }

  const M = {
    // ================================================================ fichiers
    async galleryBlob(g) { if (!g || !g.file) return null; try { return await L.readFile(this.dossier, g.file); } catch (e) { return null; } },
    async galleryURL(g) {
      if (isVideo(g)) return this.galleryThumbURL(g);   // une vidéo n'est jamais lue en entier en data URL : sa vignette
      this._galURL = this._galURL || new Map(); const k = g.id + ':' + (g.rev || 0); if (this._galURL.has(k)) return this._galURL.get(k);
      const b = await this.galleryBlob(g); if (!b) return null; const u = await blobToDataURL(b); this._galURL.set(k, u); return u;
    },
    /** vignette enregistrée d'une vidéo (data URL) */
    async galleryThumbURL(g) {
      this._galURL = this._galURL || new Map(); const k = g.id + ':thumb'; if (this._galURL.has(k)) return this._galURL.get(k);
      if (!g.thumb) return null; let b = null; try { b = await L.readFile(this.dossier, g.thumb); } catch (e) { } if (!b) return null;
      const u = await blobToDataURL(b instanceof Blob ? b : new Blob([b], { type: 'image/jpeg' })); this._galURL.set(k, u); return u;
    },
    /** adresse de lecture d'une vidéo (objet URL, gardé pendant la session) */
    async galleryMediaURL(g) {
      this._galObj = this._galObj || new Map(); if (this._galObj.has(g.id)) return this._galObj.get(g.id);
      const b = await this.galleryBlob(g); if (!b) return null; const u = URL.createObjectURL(b instanceof Blob && b.type ? b : new Blob([b], { type: g.mime })); this._galObj.set(g.id, u); return u;
    },
    /** vignette (JPEG ~320 px) mise en cache */
    async galleryThumb(g) {
      if (!g) return null; if (isVideo(g)) return this.galleryThumbURL(g);
      this._galThumb = this._galThumb || new Map(); const k = g.id + ':' + JSON.stringify(g.annotations || []); if (this._galThumb.has(k)) return this._galThumb.get(k);
      const u = await this.galleryURL(g); if (!u) return null;
      try { const im = await loadImg(u), sc = Math.min(1, 360 / im.width), cv = document.createElement('canvas'); cv.width = Math.round(im.width * sc); cv.height = Math.round(im.height * sc); const c = cv.getContext('2d'); c.drawImage(im, 0, 0, cv.width, cv.height); drawAnnotations(c, g.annotations, cv.width, cv.height); const t = cv.toDataURL('image/jpeg', 0.82); this._galThumb.set(k, t); return t; } catch (e) { return u; }
    },
    /** capture + annotations, pour la présentation et les rapports (PNG ou JPEG, largeur maximale maxW) */
    async galleryComposite(g, maxW, type) {
      if (isVideo(g)) { const t = await this.galleryThumbURL(g); return t ? videoBadge(t, g.duration, maxW) : null; }
      const u = await this.galleryURL(g); if (!u) return null; const im = await loadImg(u), sc = Math.min(1, (maxW || 2400) / im.width);
      const cv = document.createElement('canvas'); cv.width = Math.round(im.width * sc); cv.height = Math.round(im.height * sc); const c = cv.getContext('2d'); c.drawImage(im, 0, 0, cv.width, cv.height); drawAnnotations(c, g.annotations, cv.width, cv.height);
      return cv.toDataURL(type || 'image/jpeg', 0.9);
    },
    /** vidéo à ajouter : lisible et légère → telle quelle ; lourde → version légère (navigateur) proposée ; illisible →
     *  conversion par ffmpeg proposée. Renvoie { file, conv } ou null (vidéo écartée) */
    async videoPrepare(f) {
      const VC = SV.VideoConv, mb = x => (x / 1e6).toLocaleString(SV.LOC, { maximumFractionDigits: 0 }) + ' Mo', p = await VC.probe(f);
      if (!p.ok) {
        const cached = await VC.ffCached();
        if (!confirm(`« ${f.name} » (${mb(f.size || 0)}) : ce format n’est pas lisible par le navigateur.\n\nLe convertir en vidéo légère (format écran, ≤ 1280 px) ?\n${cached ? 'ffmpeg est déjà installé dans ce navigateur.' : 'ffmpeg (≈ 31 Mo) sera téléchargé une seule fois depuis cdn.jsdelivr.net puis gardé dans ce navigateur.'}\nLa vidéo elle-même ne quitte pas le poste.`)) { this.toast(`${f.name} : non ajoutée (format non lisible)`, 4000); return null; }
        const out = await this.videoConvertJob(f, 'ffmpeg'); return out ? { file: out, conv: { name: f.name, size0: f.size || 0, tool: 'ffmpeg', date: S.now() } } : null;
      }
      if (VC.needsLight(f, p) && confirm(`« ${f.name} » : ${mb(f.size || 0)}, ${p.w} × ${p.h}${p.dur ? ', ' + fmtDur(p.dur) : ''}.\n\nCréer une version légère pour la revue (≤ 1280 × 720, ≈ 1,5 Mb/s, son conservé) ?\nOK : version légère seulement · Annuler : garder l’original`)) {
        const out = await this.videoConvertJob(f, 'native'); if (out) return { file: out, conv: { name: f.name, size0: f.size || 0, tool: 'navigateur', date: S.now() } };
        this.toast(`${f.name} : version légère impossible dans ce navigateur, original conservé`, 5000);
      }
      return { file: f, conv: null };
    },
    async videoConvertJob(f, kind) {
      const job = this.jobStart(`${kind === 'ffmpeg' ? 'Conversion' : 'Version légère'} · ${f.name}`);
      try {
        const cb = (p, t) => job.progress({ fraction: p, message: t || '' });
        const out = kind === 'ffmpeg' ? await SV.VideoConv.ffmpegLight(f, cb) : await SV.VideoConv.nativeLight(f, cb);
        if (!out) { job.fail('non pris en charge par ce navigateur'); return null; }
        job.done(`${f.name} : ${(f.size / 1e6).toFixed(0)} → ${(out.size / 1e6).toFixed(1)} Mo`); return out;
      } catch (e) { console.error(e); job.fail(e.message); return null; }
    },
    /** vidéo déjà rangée mais illisible (AVI déposée avant la v4.5…) : conversion, le fichier est remplacé */
    async galleryConvertStored(g) {
      const d = this.dossier, blob = await L.readFile(d, g.file); if (!blob) { this.toast('Fichier absent du dossier'); return false; }
      const src = new File([blob], g.name || String(g.file).split('/').pop(), { type: g.mime || '' });
      const cached = await SV.VideoConv.ffCached();
      if (!confirm(`Convertir « ${src.name} » en vidéo lisible et légère ?\n${cached ? '' : 'ffmpeg (≈ 31 Mo) sera téléchargé une seule fois depuis cdn.jsdelivr.net. '}La vidéo ne quitte pas le poste.`)) return false;
      const out = await this.videoConvertJob(src, 'ffmpeg'); if (!out) return false;
      const info = await videoInfo(out), ext = out.type === 'video/webm' ? 'webm' : 'mp4', old = g.file;
      g.file = `gallery/${g.id}.${ext}`; g.mime = out.type; g.w = info.w; g.h = info.h; g.duration = info.dur || g.duration || 0; g.converted = { name: g.name || src.name, size0: blob.size, tool: 'ffmpeg', date: S.now() }; g.size = out.size;
      await L.writeFile(d, g.file, out); if (old !== g.file) await L.removeFile(d, old).catch(() => { });
      if (info.thumb) { g.thumb = `gallery/${g.id}_thumb.jpg`; await L.writeFile(d, g.thumb, info.thumb); }
      if (this._galObj && this._galObj.has(g.id)) { URL.revokeObjectURL(this._galObj.get(g.id)); this._galObj.delete(g.id); } if (this._galURL) this._galURL.delete(g.id + ':thumb'); this.touch('gallery', g.id, 'vidéo convertie'); return true;
    },
    /** ajoute des images (presse-papiers, fichiers) à la galerie, rattachées à l'étape donnée */
    async galleryAdd(files, ctx) {
      const d = this.dossier; if (!d) return []; ctx = ctx || {}; const out = [];
      for (let f of files) {
        let vid = !!f && (/^video\//.test(f.type || '') || /\.(mp4|webm|mov|m4v|ogv|mkv|avi|wmv|asf|mpg|mpeg|m2v|vob|flv|3gp|3g2|mts|m2ts|ts|divx|dv|mxf)$/i.test(f.name || '')), conv = null;
        // vidéo illisible par le navigateur (AVI…) ou lourde (Full HD) : version légère pour la revue
        if (vid && SV.VideoConv) { const r = await this.videoPrepare(f); if (!r) continue; if (r.file !== f) { conv = r.conv; f = r.file; } }
        if (!f || (!vid && !/^image\//.test(f.type || ''))) continue;
        let w = 0, hh = 0, info = null;
        if (vid) { info = await videoInfo(f); w = info.w; hh = info.h; }
        else { try { const im = await loadImg(await blobToDataURL(f)); w = im.width; hh = im.height; } catch (e) { } }
        const mime = vid ? (f.type || ({ mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/x-m4v', ogv: 'video/ogg', mkv: 'video/x-matroska' }[String(f.name).split('.').pop().toLowerCase()]) || 'video/mp4') : f.type;
        const ext = vid ? (VIDEO_EXT[mime] || String(f.name || 'video.mp4').split('.').pop().toLowerCase() || 'mp4') : /png/.test(f.type) ? 'png' : /jpe?g/.test(f.type) ? 'jpg' : /webp/.test(f.type) ? 'webp' : 'png';
        // valeurs par défaut (modifiables dans la visionneuse) : celles du bilan (date, étape, intitulé), sinon le premier jour de l'étape
        const exam = ctx.examId ? S.byId(d.exams || [], ctx.examId) : null, exId = ctx.explorationId || (exam && exam.explorationId) || null;
        const st = exId ? S.byId(d.explorations, exId) : null, date = (exam && exam.date) || (st && st.start) || S.today();
        const g = S.addGalleryItem(d, { mime, w, h: hh, explorationId: exId, seizureId: ctx.seizureId || null, examId: ctx.examId || null, kind: ctx.kind != null ? ctx.kind : vid ? '' : st && st.kind === 'seeg' ? 'ictal' : 'interictal', modality: ctx.modality || (vid ? (exam ? 'video' : 'video') : exam && ['mri', 'pet', 'spect', 'meg', 'fmri'].includes(exam.kind) ? 'imaging' : exam && ['neuropsy', 'psy', 'wada', 'other'].includes(exam.kind) ? 'document' : st && st.kind === 'seeg' ? 'seeg' : 'eeg'), title: ctx.title || (exam && exam.title) || (vid ? String(f.name || '').replace(/\.[^.]+$/, '') : ''), date, by: L.user });
        if (vid) { g.duration = info.dur || 0; g.size = f.size || 0; g.name = f.name || ''; if (conv) { g.converted = conv; g.name = conv.name; } if (info.thumb) { g.thumb = `gallery/${g.id}_thumb.jpg`; await L.writeFile(d, g.thumb, info.thumb); } }
        g.file = `gallery/${g.id}.${ext}`; await L.writeFile(d, g.file, f); out.push(g);
      }
      if (out.length) { const nv = out.filter(isVideo).length, ni = out.length - nv; this.touch(); await this.flushSave(); this.toast([ni ? `${ni} capture${ni > 1 ? 's' : ''}` : '', nv ? `${nv} vidéo${nv > 1 ? 's' : ''}` : ''].filter(Boolean).join(' et ') + ` ajoutée${out.length > 1 ? 's' : ''} à la galerie`, 2500); }
      return out;
    },
    async galleryRemove(g) { const d = this.dossier; if (g.file) await L.removeFile(d, g.file); if (g.thumb) await L.removeFile(d, g.thumb).catch(() => { }); S.remove(d, 'gallery', g.id); this.touch(); },
    /** coller : écoute globale active tant qu'une galerie est affichée */
    bindGalleryPaste() {
      if (this._galPasteBound) return; this._galPasteBound = true;
      document.addEventListener('paste', async e => {
        const host = [...document.querySelectorAll('.gal-host')].find(x => x.isConnected && x.offsetParent !== null); if (!host || !this.dossier) return;
        const t = document.activeElement; if (t && /INPUT|TEXTAREA/.test(t.tagName) && !host.contains(t)) return;
        const files = [...(e.clipboardData ? e.clipboardData.items : [])].filter(it => it.kind === 'file' && /^image\//.test(it.type)).map(it => it.getAsFile()).filter(Boolean);
        if (!files.length) return; e.preventDefault();
        const added = await this.galleryAdd(files, host._galCtx || {}); if (host._galRefresh) host._galRefresh(); if (added.length === 1 && host._galCtx && (!host._galCtx.compact || host._galCtx.examId)) this.galleryEditor(added[0], host._galList ? host._galList() : [added[0]], host._galRefresh);
      });
    },

    // ================================================================ vues
    renderGalleryView(box, st) {
      const ex = st && st.kind !== 'dossier' ? st.obj : null;
      box.innerHTML = `<div class="scr-inner wide"><div class="view-head"><h3>Galerie${ex ? ' · ' + esc(ex.label) : ''}</h3><span class="muted">${ex ? 'captures, images et vidéos de cette étape' : 'captures de tracés, images et vidéos du patient'}</span></div><div id="galBox"></div></div>`;
      this.renderGallery($('galBox'), { explorationId: ex ? ex.id : null, all: !ex, tools: true });
    },
    /** réglages de rangement de la galerie (regroupement, filtre, recherche, ordre), gardés sur le poste */
    galSettings() { return this.ui.galSet || (this.ui.galSet = Object.assign({ group: '', kind: '', q: '', desc: false, closed: {} }, LSg.get('sv_gal') || {})); },
    galSave() { const s = this.galSettings(); LSg.set('sv_gal', { group: s.group, kind: s.kind, desc: s.desc, closed: s.closed }); },
    /** grille de la galerie avec zone « coller / déposer » ; o = { explorationId, all, compact, tools (barre de rangement), meeting (sélection pour un staff), examId, filter } */
    renderGallery(host, o) {
      const d = this.dossier; if (!host || !d) return; o = o || {}; this.bindGalleryPaste();
      host.classList.add('gal-host'); host._galCtx = { explorationId: o.explorationId || null, examId: o.examId || null, compact: !!o.compact, kind: o.kind != null ? o.kind : undefined };
      const tools = !!(o.tools || o.meeting), G = this.galSettings();
      const base = () => (d.gallery || []).filter(g => o.examId ? g.examId === o.examId : o.all || o.meeting ? true : g.explorationId === (o.explorationId || null)).filter(g => !o.filter || o.filter(g));
      const modOf = g => S.galleryModOf(d, g), fv = String(G.kind || ''), match = g => (!tools || !fv || (fv.startsWith('m:') ? modOf(g) === fv.slice(2) : (fv.startsWith('k:') ? fv.slice(2) : fv) === (g.kind || ''))) && (!tools || !G.q || [g.title, g.notes, V.galleryKind[g.kind], V.galleryMod[modOf(g)]].join(' ').toLowerCase().includes(G.q.toLowerCase()));
      const items = () => base().filter(match).sort((a, b) => (String(a.date).localeCompare(String(b.date)) || String(a.added).localeCompare(String(b.added))) * (tools && G.desc ? -1 : 1));
      host._galList = items; host._galRefresh = () => this.renderGallery(host, o);
      const all = base(), list = items(), m = o.meeting, sel = m ? new Set(m.galleryIds || []) : null;
      // v5 — emplacement de chaque capture dans le diaporama du staff (automatique, une diapositive choisie, ou pas montrée)
      const slotOpts = m && this.presentSlotOptions ? this.presentSlotOptions(m) : [], slots = m ? (m.gallerySlots = m.gallerySlots || {}) : {};
      const slotSel = g => { if (!m || !slotOpts.length) return ''; const cur = slots[g.id] || ''; let html = `<option value=""${cur ? '' : ' selected'}>diapositive : automatique</option><option value="none"${cur === 'none' ? ' selected' : ''}>ne pas montrer</option>`; let sec = null;
        for (const o2 of slotOpts) { if (o2.sec !== sec) { if (sec !== null) html += '</optgroup>'; sec = o2.sec; html += `<optgroup label="${esc(sec)}">`; } html += `<option value="${esc(o2.key)}"${cur === o2.key ? ' selected' : ''}>après « ${esc(o2.title)} »</option>`; }
        if (sec !== null) html += '</optgroup>'; return `<select class="gal-slot" title="Moment du diaporama où montrer cette capture (sa propre diapositive, juste après celle choisie) ; « automatique » : à sa place d’après son étape, sa crise ou son type">${html}</select>`; };
      const group = tools ? (G.group || (o.all || o.meeting ? 'stage' : 'kind')) : (o.all || o.meeting ? 'stage' : '');
      const szOf = g => g.seizureId && S.byId(d.seizures, g.seizureId), exOf = g => g.explorationId && S.byId(d.explorations, g.explorationId), xOf = g => g.examId && S.byId(d.exams || [], g.examId);
      const KO = Object.keys(V.galleryKind), MO = Object.keys(V.galleryMod);
      const keyOf = g => group === 'stage' ? (exOf(g) ? 'e:' + exOf(g).id : g.stage === 'amb' ? 'amb' : xOf(g) ? 'bilans' : 'none') : group === 'seizure' ? (szOf(g) ? 's:' + g.seizureId : 'none') : group === 'kind' ? 'k:' + (g.kind || '') : group === 'mod' ? 't:' + modOf(g) : group === 'month' ? 'm:' + String(g.date || '').slice(0, 7) : 'all';
      const labelOf = (k, g) => k === 'none' ? (group === 'seizure' ? 'Hors crise' : 'Sans étape') : k === 'bilans' ? 'Bilans' : k === 'amb' ? 'Ambulatoire' : k.startsWith('e:') ? exOf(g).label : k.startsWith('s:') ? `${szOf(g).label}${exOf(g) ? ' · ' + exOf(g).label : ''}` : k.startsWith('k:') ? (k === 'k:' ? 'Non précisé' : (V.galleryKind[k.slice(2)] || k.slice(2)).replace(/^./, c => c.toUpperCase())) : k.startsWith('t:') ? (V.galleryMod[k.slice(2)] || k.slice(2)).replace(/^./, c => c.toUpperCase()) : k.startsWith('m:') ? (k.length > 2 ? new Date(k.slice(2) + '-15').toLocaleDateString(SV.LOC, { month: 'long', year: 'numeric' }) : 'Sans date') : '';
      const rankOf = (k, g) => k.startsWith('e:') ? String(exOf(g).start || '9') : k === 'bilans' ? '0' : k === 'amb' ? '01' : k.startsWith('s:') ? String(szOf(g).date || '') + String(szOf(g).label) : k.startsWith('k:') ? String(k === 'k:' ? 99 : KO.indexOf(k.slice(2)) + 10) : k.startsWith('t:') ? String(MO.indexOf(k.slice(2)) + 10) : k.startsWith('m:') ? k : '~';
      const groups = new Map(); for (const g of list) { const k = keyOf(g); if (!groups.has(k)) groups.set(k, { k, label: labelOf(k, g), rank: rankOf(k, g), items: [] }); groups.get(k).items.push(g); }
      const order = [...groups.values()].sort((a, b) => a.rank.localeCompare(b.rank) * (tools && G.desc && group === 'month' ? -1 : 1));
      const card = g => { const sz = szOf(g), x = xOf(g), vid = isVideo(g); return `<div class="gal-item${sel && sel.has(g.id) ? ' sel' : ''}${vid ? ' video' : ''}" data-gid="${g.id}"><div class="gal-img"><img alt="">${vid ? `<span class="gal-play">▶</span>${g.duration ? `<span class="gal-dur">${fmtDur(g.duration)}</span>` : ''}` : ''}${(g.annotations || []).length ? `<span class="gal-ann" title="${g.annotations.length} annotation${g.annotations.length > 1 ? 's' : ''}">✎ ${g.annotations.length}</span>` : ''}</div><div class="gal-meta"><b title="${esc(g.title)}">${esc(g.title || 'sans titre')}</b><span class="badge t-${esc(modOf(g))}">${esc(V.galleryMod[modOf(g)])}</span>${g.kind ? `<span class="badge k-${esc(g.kind)}">${esc(V.galleryKind[g.kind] || g.kind)}</span>` : ''}${g.vigilance ? `<span class="badge">${esc({ V: 'veille', S: 'sommeil' }[g.vigilance] || g.vigilance)}</span>` : ''}<span class="muted small">${fmtDate(g.date)}${sz ? ' · ' + esc(sz.label) : ''}${x ? ' · bilan ' + esc(V.exam[x.kind] || '') : ''}${group !== 'stage' && exOf(g) && (o.all || o.meeting) ? ' · ' + esc(exOf(g).label) : ''}</span></div>${m ? `<label class="gal-pick"><input type="checkbox"${sel.has(g.id) ? ' checked' : ''}> montrer</label>${slotSel(g)}` : ''}</div>`; };
      const kinds = KO.filter(k => k && all.some(g => g.kind === k)), mods = MO.filter(k => all.some(g => modOf(g) === k));
      const bar = tools && all.length ? `<div class="gal-tools-bar"><span class="lbl">Regrouper par</span><div class="seg">${GROUPS.map(([k, l]) => `<button data-grp="${k}" class="${group === k ? 'on' : ''}">${l}</button>`).join('')}</div>
          <select class="gal-kind" title="filtrer par type d’élément ou par moment (critique, intercritique…)"><option value="">tout (${all.length})</option><optgroup label="Type">${mods.map(k => `<option value="m:${k}"${fv === 'm:' + k ? ' selected' : ''}>${esc(V.galleryMod[k])} (${all.filter(g => modOf(g) === k).length})</option>`).join('')}</optgroup><optgroup label="Critique / intercritique">${kinds.map(k => `<option value="k:${k}"${fv === 'k:' + k || fv === k ? ' selected' : ''}>${esc(V.galleryKind[k])} (${all.filter(g => g.kind === k).length})</option>`).join('')}</optgroup></select>
          <input class="gal-q" type="search" placeholder="rechercher (titre, notes)" value="${esc(G.q)}"><button class="mini-btn" data-a="order" title="ordre chronologique">${G.desc ? 'récentes d’abord ↓' : 'anciennes d’abord ↑'}</button>
          <span class="spacer"></span><span class="muted small">${list.length}${list.length !== all.length ? ' / ' + all.length : ''} élément${all.length > 1 ? 's' : ''}</span>${groups.size > 1 ? '<button class="mini-btn" data-a="fold" title="replier / déplier tous les groupes">tout replier / déplier</button>' : ''}</div>` : '';
      const grid = L0 => `<div class="gal-grid${o.compact ? ' compact' : ''}">${L0.map(card).join('')}</div>`;
      const body = !list.length ? `<div class="hint" style="padding:8px 2px">${all.length ? 'Aucun élément ne correspond.' : o.meeting ? 'Aucune capture dans le dossier : les galeries des étapes (Phase 1 › Galerie, SEEG › Galerie, bilans) les recueillent.' : 'Aucune capture pour l’instant.'}</div>`
        : group ? order.map(g => { const closed = tools && G.closed[group + '|' + g.k]; return `<div class="gal-group${closed ? ' closed' : ''}" data-gk="${esc(g.k)}"><div class="sub-h gal-gh">${tools ? `<button class="gal-fold" title="replier / déplier">${closed ? '▸' : '▾'}</button>` : ''}${esc(g.label)} <span class="muted">${g.items.length}</span></div>${closed ? '' : grid(g.items)}</div>`; }).join('') : grid(list);
      host.innerHTML = `${o.meeting ? '' : `<div class="gal-drop" tabindex="0"><b>Coller une capture : Ctrl+V</b> <span class="muted">(outil Capture de Windows : Maj+Win+S, puis Ctrl+V ici) · ou glisser une image ou une vidéo · ou</span> <button class="mini-btn" data-a="paste">coller depuis le presse-papiers</button> <button class="mini-btn" data-a="file">choisir des fichiers (images, vidéos)…</button><input type="file" accept="image/*,video/*,.mp4,.webm,.mov,.m4v,.mkv,.avi,.wmv,.mpg,.mpeg,.flv,.3gp,.mts,.m2ts,.ts" multiple hidden></div>`}${bar}${body}`;
      host.querySelectorAll('.gal-item').forEach(el => {
        const g = S.byId(d.gallery, el.dataset.gid); this.galleryThumb(g).then(u => { const im = el.querySelector('img'); if (u && im) im.src = u; });
        el.onclick = e => { if (e.target.closest('.gal-pick, .gal-slot')) return; this.galleryEditor(g, items(), host._galRefresh); };
        const ss = el.querySelector('.gal-slot'); if (ss) ss.onchange = () => { if (ss.value) slots[g.id] = ss.value; else delete slots[g.id]; this.touch('meeting', m.id, 'diaporama : emplacement d’une capture'); };
        const pk = el.querySelector('.gal-pick input'); if (pk) pk.onchange = () => { m.galleryIds = m.galleryIds || []; if (pk.checked && !m.galleryIds.includes(g.id)) m.galleryIds.push(g.id); if (!pk.checked) m.galleryIds = m.galleryIds.filter(x => x !== g.id); el.classList.toggle('sel', pk.checked); this.touch('meeting', m.id, 'galerie'); };
      });
      if (tools) {
        host.querySelectorAll('[data-grp]').forEach(b => b.onclick = () => { G.group = b.dataset.grp; this.galSave(); host._galRefresh(); });
        const ks = host.querySelector('.gal-kind'); if (ks) ks.onchange = () => { G.kind = ks.value; this.galSave(); host._galRefresh(); };
        const q = host.querySelector('.gal-q'); if (q) q.oninput = () => { G.q = q.value; clearTimeout(this._galQ); this._galQ = setTimeout(() => { const pos = q.selectionStart; host._galRefresh(); const q2 = host.querySelector('.gal-q'); if (q2) { q2.focus(); try { q2.setSelectionRange(pos, pos); } catch (e) { } } }, 250); };
        const ob = host.querySelector('[data-a=order]'); if (ob) ob.onclick = () => { G.desc = !G.desc; this.galSave(); host._galRefresh(); };
        host.querySelectorAll('.gal-fold').forEach(b => b.onclick = () => { const k = group + '|' + b.closest('.gal-group').dataset.gk; G.closed[k] = !G.closed[k]; this.galSave(); host._galRefresh(); });
        const fb = host.querySelector('[data-a=fold]'); if (fb) fb.onclick = () => { const ks0 = order.map(g => group + '|' + g.k), allClosed = ks0.every(k => G.closed[k]); ks0.forEach(k => { G.closed[k] = !allClosed; }); this.galSave(); host._galRefresh(); };
      }
      const drop = host.querySelector('.gal-drop'); if (!drop) return;
      const fi = drop.querySelector('input[type=file]');
      const after = added => { host._galRefresh(); if (added.length === 1 && (!o.compact || o.examId)) this.galleryEditor(added[0], items(), host._galRefresh); };
      drop.querySelector('[data-a=file]').onclick = () => { fi.value = ''; fi.click(); };
      fi.onchange = async () => after(await this.galleryAdd([...fi.files], host._galCtx));
      drop.querySelector('[data-a=paste]').onclick = async () => {
        try { const its = await navigator.clipboard.read(); const files = []; for (const it of its) for (const t of it.types) if (/^image\//.test(t)) files.push(new File([await it.getType(t)], 'capture.png', { type: t })); if (!files.length) { this.toast('Le presse-papiers ne contient pas d’image', 3000); return; } after(await this.galleryAdd(files, host._galCtx)); }
        catch (e) { this.toast('Accès au presse-papiers refusé : utilisez Ctrl+V', 3500); }
      };
      drop.ondragover = e => { if ([...(e.dataTransfer || {}).types || []].includes('Files')) { e.preventDefault(); drop.classList.add('over'); } };
      drop.ondragleave = () => drop.classList.remove('over');
      drop.ondrop = async e => { e.preventDefault(); e.stopPropagation(); drop.classList.remove('over'); const files = [...e.dataTransfer.files].filter(f => /^(image|video)\//.test(f.type) || /\.(mp4|webm|mov|m4v|mkv|avi|wmv|mpg|mpeg|flv|3gp|mts|m2ts)$/i.test(f.name)); if (files.length) after(await this.galleryAdd(files, host._galCtx)); };
    },

    // ================================================================ visionneuse et annotation
    galleryEditor(g, list, onClose) {
      const d = this.dossier; list = list && list.length ? list : [g]; let idx = Math.max(0, list.findIndex(x => x.id === g.id));
      const m = h('div', 'modal gal-modal'), card = h('div', 'modal-card gal-card');
      let tool = 'select', color = COLORS[0], selA = -1, drag = null, img = null, cur = g;
      const close = () => { const v0 = card.querySelector('video'); if (v0) v0.pause(); m.remove(); document.removeEventListener('keydown', key, true); if (onClose) onClose(); };
      const save = () => { cur.rev = (cur.rev || 0); this.touch('gallery', cur.id, cur.title || 'capture'); };
      const key = e => {
        if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { if (e.key === 'Escape') document.activeElement.blur(); return; }
        if (e.key === 'Escape') { e.stopPropagation(); close(); } else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
        else if ((e.key === 'Delete' || e.key === 'Backspace') && selA >= 0) { e.preventDefault(); cur.annotations.splice(selA, 1); selA = -1; save(); paint(); }
      };
      const step = k => { const n = idx + k; if (n < 0 || n >= list.length) return; const v0 = card.querySelector('video'); if (v0) v0.pause(); idx = n; cur = list[idx]; selA = -1; render(); };
      const exs = S.explorationsSorted(d);
      const render = async () => {
        cur.annotations = cur.annotations || [];
        const szs = cur.explorationId ? S.seizuresOfExploration(d, cur.explorationId) : [];
        const vid = isVideo(cur);
        card.innerHTML = `<div class="modal-head"><span>${vid ? 'Vidéo' : 'Capture'} ${idx + 1}/${list.length}${vid && cur.duration ? ' · ' + fmtDur(cur.duration) : ''}${vid && cur.size ? ' · ' + (cur.size >= 1048576 ? Math.round(cur.size / 1048576) + ' Mo' : Math.max(1, Math.round(cur.size / 1024)) + ' ko') : ''}</span><span class="spacer"></span><button class="mini-btn" data-a="prev"${idx ? '' : ' disabled'}>‹</button><button class="mini-btn" data-a="next"${idx < list.length - 1 ? '' : ' disabled'}>›</button><button class="close">✕</button></div>
          <div class="gal-body"><div class="gal-stage">${vid ? '<video controls playsinline preload="metadata"></video>' : '<canvas></canvas>'}</div>
            <div class="gal-side">
              ${vid ? '' : `<div class="seg gal-tools">${[['select', '↖', 'sélectionner / déplacer (Suppr pour effacer)'], ['arrow', '➘', 'flèche'], ['ellipse', '◯', 'cercle / ellipse'], ['text', 'T', 'texte']].map(([k, i, t]) => `<button data-tool="${k}" class="${tool === k ? 'on' : ''}" title="${t}">${i}</button>`).join('')}</div>
              <div class="gal-colors">${COLORS.map(c => `<button data-col="${c}" class="${c === color ? 'on' : ''}" style="background:${c}"></button>`).join('')}<button class="mini-btn" data-a="undo" title="retirer la dernière annotation">↶</button></div>`}
              <div class="form">
                <label>Titre <input data-f="title" value="${esc(cur.title)}" placeholder="${vid ? 'ex. crise filmée par la famille' : 'ex. pointes T4-T6 au sommeil'}"></label>
                <div class="grid2"><label>Type <select data-f="modality">${opts(V.galleryMod, S.galleryModOf(this.dossier, cur))}</select></label><label>Critique / intercritique <select data-f="kind">${opts(V.galleryKind, cur.kind || '')}</select></label><label>Vigilance <select data-f="vigilance">${opts({ '': '—', V: 'veille', S: 'sommeil' }, cur.vigilance)}</select></label></div>
                <label title="Ambulatoire : EEG, imagerie… réalisés en dehors des bilans de phase 1 / phase 2">Étape <select data-f="explorationId">${opts(Object.assign({ '': '—', amb: 'Ambulatoire' }, Object.fromEntries(exs.map(e => [e.id, e.label]))), cur.explorationId || (cur.stage === 'amb' ? 'amb' : ''))}</select></label>
                <label>Crise <select data-f="seizureId">${opts(Object.assign({ '': '—' }, Object.fromEntries(szs.map(z => [z.id, z.label]))), cur.seizureId || '')}</select></label>
                <label>Date <input type="date" data-f="date" value="${esc(cur.date)}"></label>
                <label>Notes <textarea data-f="notes" rows="4" placeholder="${vid ? 'contexte (qui a filmé, quand), ce que montre la vidéo' : 'montage, filtres, sensibilité, ce que montre la capture'}">${esc(cur.notes)}</textarea></label>
              </div>
              <div class="btnrow">${vid ? '<button class="mini-btn" data-a="dl" title="enregistrer la vidéo sur le poste">télécharger la vidéo</button>' : '<button class="mini-btn" data-a="png" title="télécharger la capture annotée">PNG annoté</button>'}<span class="spacer"></span><button class="mini-btn danger" data-a="del">supprimer</button></div>
              <div class="hint">${vid ? 'Lecture, plein écran et vitesse dans le lecteur ; ← → élément voisin.' : 'Glisser sur l’image pour tracer ; ↖ pour déplacer ou effacer (Suppr) une annotation ; ← → capture voisine.'}</div>
            </div></div>`;
        card.querySelector('.close').onclick = close; card.querySelector('[data-a=prev]').onclick = () => step(-1); card.querySelector('[data-a=next]').onclick = () => step(1);
        card.querySelectorAll('[data-f]').forEach(el => { el[el.tagName === 'SELECT' || el.type === 'date' ? 'onchange' : 'oninput'] = () => { cur[el.dataset.f] = el.value || ((el.dataset.f === 'explorationId' || el.dataset.f === 'seizureId') ? null : ''); if (el.dataset.f === 'explorationId') { if (el.value === 'amb') { cur.explorationId = null; cur.stage = 'amb'; } else delete cur.stage; cur.seizureId = null; render(); } save(); }; });
        card.querySelector('[data-a=del]').onclick = async () => { if (!confirm(vid ? 'Supprimer cette vidéo et son fichier ?' : 'Supprimer cette capture et son fichier ?')) return; await this.galleryRemove(cur); list.splice(idx, 1); if (!list.length) { close(); return; } idx = Math.min(idx, list.length - 1); cur = list[idx]; render(); };
        if (vid) {
          const v = card.querySelector('video'), u = await this.galleryMediaURL(cur);
          if (!u) { card.querySelector('.gal-stage').innerHTML = '<div class="hint" style="padding:30px">Fichier absent du dossier (archive légère ?).</div>'; return; }
          v.src = u; const th = await this.galleryThumbURL(cur); if (th) v.poster = th;
          v.onerror = () => { const st0 = card.querySelector('.gal-stage'); st0.innerHTML = `<div class="hint" style="padding:30px">Format non lisible par le navigateur${cur.name ? ' (' + esc(String(cur.name).split('.').pop().toUpperCase()) + ')' : ''}. <button class="mini-btn primary" data-a="conv">Convertir en vidéo légère…</button></div>`; st0.querySelector('[data-a=conv]').onclick = async () => { if (await this.galleryConvertStored(cur)) render(); }; };
          card.querySelector('[data-a=dl]').onclick = () => { const a = document.createElement('a'); a.href = u; a.download = cur.name || `EpiScope_${(cur.title || 'video').replace(/[^\w\-]+/g, '_')}.${String(cur.file).split('.').pop()}`; a.click(); };
          return;
        }
        card.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => { tool = b.dataset.tool; card.querySelectorAll('[data-tool]').forEach(x => x.classList.toggle('on', x === b)); cv.style.cursor = tool === 'select' ? 'default' : tool === 'text' ? 'text' : 'crosshair'; });
        card.querySelectorAll('[data-col]').forEach(b => b.onclick = () => { color = b.dataset.col; card.querySelectorAll('[data-col]').forEach(x => x.classList.toggle('on', x === b)); if (selA >= 0) { cur.annotations[selA].color = color; save(); paint(); } });
        card.querySelector('[data-a=undo]').onclick = () => { cur.annotations.pop(); selA = -1; save(); paint(); };
        card.querySelector('[data-a=png]').onclick = async () => { const u = await this.galleryComposite(cur, 4000, 'image/png'); const a = document.createElement('a'); a.href = u; a.download = `EpiScope_${(cur.title || 'capture').replace(/[^\w\-]+/g, '_')}.png`; a.click(); };
        const cv = card.querySelector('canvas'), stage = card.querySelector('.gal-stage');
        const u = await this.galleryURL(cur); if (!u) { stage.innerHTML = '<div class="hint" style="padding:30px">Fichier absent du dossier (archive légère ?).</div>'; return; }
        img = await loadImg(u);
        const fit = () => { const r = stage.getBoundingClientRect(), sc = Math.min((r.width - 8) / img.width, (r.height - 8) / img.height, 2); cv.width = Math.max(10, Math.round(img.width * sc)); cv.height = Math.max(10, Math.round(img.height * sc)); paint(); };
        const rel = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
        const hit = (x, y) => { for (let i = cur.annotations.length - 1; i >= 0; i--) { const a = cur.annotations[i], x2 = a.x2 == null ? a.x1 : a.x2, y2 = a.y2 == null ? a.y1 : a.y2; const mx = Math.min(a.x1, x2) - 0.02, Mx = Math.max(a.x1, x2) + (a.type === 'text' ? 0.2 : 0.02), my = Math.min(a.y1, y2) - 0.02, My = Math.max(a.y1, y2) + (a.type === 'text' ? 0.06 : 0.02); if (x >= mx && x <= Mx && y >= my && y <= My) return i; } return -1; };
        cv.onpointerdown = e => {
          const [x, y] = rel(e); cv.setPointerCapture(e.pointerId);
          if (tool === 'select') { selA = hit(x, y); if (selA >= 0) { const a = cur.annotations[selA]; drag = { kind: 'move', x, y, a0: Object.assign({}, a) }; } paint(); return; }
          if (tool === 'text') { const t = prompt('Texte de l’annotation :'); if (t) { cur.annotations.push({ type: 'text', x1: x, y1: y, text: t, color }); selA = cur.annotations.length - 1; save(); paint(); } return; }
          cur.annotations.push({ type: tool, x1: x, y1: y, x2: x, y2: y, color }); selA = cur.annotations.length - 1; drag = { kind: 'draw' }; paint();
        };
        cv.onpointermove = e => { if (!drag) return; const [x, y] = rel(e), a = cur.annotations[selA]; if (!a) return; if (drag.kind === 'draw') { a.x2 = x; a.y2 = y; } else { const dx = x - drag.x, dy = y - drag.y; a.x1 = drag.a0.x1 + dx; a.y1 = drag.a0.y1 + dy; if (a.x2 != null) { a.x2 = drag.a0.x2 + dx; a.y2 = drag.a0.y2 + dy; } } paint(); };
        cv.onpointerup = () => { if (drag) { const a = cur.annotations[selA]; if (drag.kind === 'draw' && a && Math.hypot((a.x2 - a.x1) * cv.width, (a.y2 - a.y1) * cv.height) < 6) { cur.annotations.splice(selA, 1); selA = -1; } save(); } drag = null; paint(); };
        paint = () => { const c = cv.getContext('2d'); c.clearRect(0, 0, cv.width, cv.height); c.drawImage(img, 0, 0, cv.width, cv.height); drawAnnotations(c, cur.annotations, cv.width, cv.height, selA); };
        requestAnimationFrame(fit);
      };
      let paint = () => { };
      m.appendChild(card); document.body.appendChild(m); m.hidden = false; document.addEventListener('keydown', key, true);
      m.onclick = e => { if (e.target === m) close(); };
      render();
    },
  };
  Object.assign(SV.app, M);
  SV.Gallery = { drawAnnotations, COLORS, isVideo, fmtDur };
})(window.SV = window.SV || {});
