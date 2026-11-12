/* EpiScope — quant_trace.js (v4.17) : volet « Tracé » du mode Analyses, à côté de la vue 3D (à la place des coupes de l'IRM
 * ou en plus d'elles : 3D | tracé | coupes sur un écran large). Bouton « Tracé » à côté de « Coupes IRM ».
 *   - tracé SEEG de l'enregistrement du jeu affiché (ou choisi dans la liste), montage bipolaire, page fixe, voies serrées
 *     (molette : voies ; Maj + molette ou ‹ › : pages ; Ctrl + molette ou − / + : gain) ; début et fin de crise, évènements,
 *     détections de l'EI (▼) et N0 quand le jeu affiché est un EI ;
 *   - à gauche de chaque voie, la valeur du jeu affiché (palette du jeu) ; clic sur une étiquette : plot choisi (3D, coupes, liste) ;
 *   - réseau h² de la crise : la barre de lecture avance sur la page fixe au rythme de la fenêtre affichée en 3D (lecture ▶ de
 *     la légende) ; arrivée en bout de page, la page suivante s'affiche ; voies source (●) et cible (○) des liens de la fenêtre ;
 *     clic dans le tracé : la fenêtre la plus proche s'affiche (liens en 3D, légende).
 *   La page est peinte une fois (image hors écran) ; seule la barre est redessinée pendant la lecture.                        */
(function (SV) {
  'use strict';
  const $ = id => document.getElementById(id), DR = SV.IeegDraw, IE = SV.IEEG, S = SV.Seeg, A = SV.app;
  if (!DR || !IE || !A) return;
  const { esc, nf, clamp, clock, THEME, MK, glyph, tick, trace, AMPS, MONO, h } = DR;
  const LS = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* stockage indisponible */ } } };
  const GUT = 96, TOP = 18;

  const M = {
    /** enregistrement d'un jeu : le sien, ou le premier d'une synthèse de crises */
    traceRecOf(q) {
      const ex = this.ieegEx && this.ieegEx(); if (!ex || !q) return null; const R = ex.recordings || [];
      const id = q.ieeg || (Array.isArray(q.eimax) && q.eimax.length ? (q.eimax[0].id || q.eimax[0]) : null) || (q.smax && q.smax.ids && q.smax.ids[0]);
      return R.find(r => r.id === id) || null;
    },
    traceAvailable() { const ex = this.ieegEx && this.ieegEx(); return !!(ex && (ex.recordings || []).length && (this.ui.wm === 'quant' || ((this.ui.wm === 'semioSeeg' || this.ui.wm === 'semio') && this.traceSzRec()))); },
    /** v5.5 — marques du tracé pour la crise ouverte (crise active du tracé ou rangée dans rec.bySz), sinon celles du tracé */
    traceMarks(rec) { const sid = this.ctx && this.ctx.seizureId; if (sid && rec.seizureId !== sid && rec.bySz && rec.bySz[sid]) return rec.bySz[sid].marks || {}; return rec.marks || {}; },
    /** v5.1 — crise ouverte (sémiologie d'une SEEG) : son tracé, calé sur le temps de la crise (début EEG ↔ début marqué) */
    traceSzRec() {
      const ex = this.ieegEx && this.ieegEx(), sid = this.ctx && this.ctx.seizureId; if (!ex || !sid) return null;
      return (ex.recordings || []).find(r => r.seizureId === sid || (r.bySz && r.bySz[sid])) || null;
    },
    traceSzTime(t) {
      const T = this._tr, r = T && T.rec, sid = this.ctx && this.ctx.seizureId, d = this.dossier; if (!r || !sid || !d) return null;
      const mk = r.seizureId === sid ? r.marks : (r.bySz && r.bySz[sid] && r.bySz[sid].marks) || null, z = (d.seizures || []).find(x => x.id === sid);
      if (!mk || mk.onset == null || !z) return null; return mk.onset + (t - (z.eeg_onset || 0));
    },
    traceBtnSync() {
      const b = $('btnTrace'); if (!b) return; const ok = this.traceAvailable(); b.hidden = !ok; b.classList.toggle('on', !!(ok && this._tr && !this._tr.el.hidden));
    },
    tracePane() {
      if (this._tr) return this._tr;
      const split = $('viewSplit'), v3 = $('view3d'); if (!split || !v3) return null;
      const el = h('div', 'trace-dock'); el.id = 'traceDock'; el.hidden = true;
      el.innerHTML = `<div class="td-head"><select class="td-rec" title="Tracé affiché (par défaut : celui du jeu affiché dans la vue active)"></select>
          <span class="td-g"><button data-p="-1" title="Page précédente (Maj + molette)">‹</button><button data-p="1" title="Page suivante">›</button></span>
          <select class="td-page" title="Durée de la page">${[5, 10, 20, 30, 60].map(v => `<option value="${v}">${v} s</option>`).join('')}</select>
          <span class="td-g" title="Amplitude (Ctrl + molette)"><button data-a="-1">−</button><span class="td-amp mono"></span><button data-a="1">＋</button></span>
          <span class="spacer"></span><span class="td-t mono"></span>
          <button class="td-theme" title="Thème clair / sombre du tracé">☀</button><button class="td-open" title="Ouvrir dans la visionneuse (quantification)">↗</button><button class="td-x" title="Fermer le tracé">✕</button></div>
        <div class="td-stage"><canvas></canvas></div>`;
      const hd = h('div', 'dock-handle'); hd.id = 'traceHandle'; hd.hidden = true; hd.title = 'glisser pour élargir ou réduire le tracé';
      const after = v3.nextSibling; split.insertBefore(hd, after); split.insertBefore(el, hd.nextSibling);
      const w = LS.get('episcope.traceW'); if (w) el.style.width = w;
      hd.addEventListener('pointerdown', e => {
        hd.setPointerCapture(e.pointerId); const box = split.getBoundingClientRect();
        const mv = ev => { const r = el.getBoundingClientRect(); el.style.width = Math.max(240, Math.min(box.width - 300, r.right - ev.clientX)) + 'px'; this.traceDraw(true); };
        const up = () => { hd.removeEventListener('pointermove', mv); hd.removeEventListener('pointerup', up); LS.set('episcope.traceW', el.style.width); if (this.viewer) this.viewer.resize(); };
        hd.addEventListener('pointermove', mv); hd.addEventListener('pointerup', up);
      });
      const T = this._tr = { el, hd, cv: el.querySelector('canvas'), stage: el.querySelector('.td-stage'), recId: null, mem: null, page: +(LS.get('episcope.tracePage') || 20), t0: 0, amp: null, scroll: 0, light: LS.get('sv_ieeg_light') === '1', cache: new Map(), pinned: false, tCur: null };
      el.querySelector('.td-page').value = String(T.page);
      el.querySelector('.td-page').onchange = e => { const c = T.t0 + T.page / 2; T.page = +e.target.value; LS.set('episcope.tracePage', String(T.page)); T.t0 = this.traceClampT(c - T.page / 2); this.traceDraw(true); };
      el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { T.t0 = this.traceClampT(T.t0 + (+b.dataset.p) * T.page * 0.9); this.traceDraw(true); });
      el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => this.traceGain(+b.dataset.a));
      el.querySelector('.td-rec').onchange = e => { T.pinned = !!e.target.value; const ex = this.ieegEx(), r = e.target.value ? (ex.recordings || []).find(x => x.id === e.target.value) : this.traceRecOf(this.quantActive && this.quantActive()); if (r) this.traceLoad(r); };
      el.querySelector('.td-theme').onclick = e => { T.light = !T.light; e.currentTarget.textContent = T.light ? '☾' : '☀'; el.classList.toggle('light', T.light); this.traceDraw(true); };
      el.querySelector('.td-theme').textContent = T.light ? '☾' : '☀'; el.classList.toggle('light', T.light);
      el.querySelector('.td-open').onclick = () => { const ex = this.ieegEx(), r = ex && (ex.recordings || []).find(x => x.id === T.recId); if (r) this.ieegOpen(r, true); };
      el.querySelector('.td-x').onclick = () => this.traceToggle(false);
      T.cv.addEventListener('wheel', e => this.traceWheel(e), { passive: false });
      T.cv.addEventListener('pointerdown', e => this.traceClick(e));
      T.cv.addEventListener('pointermove', e => { const p = this.tracePt(e); T.cv.style.cursor = p && p.x < GUT ? 'pointer' : 'crosshair'; });
      T.ro = new ResizeObserver(() => this.traceDraw(true)); T.ro.observe(T.stage);
      return T;
    },
    /** ouvrir / fermer le volet (préférence gardée pour le mode Analyses) */
    async traceToggle(on) {
      const T = this.tracePane(); if (!T) return; on = on == null ? T.el.hidden : !!on;
      if (on && !this.traceAvailable()) { this.toast(this.ui.wm === 'quant' ? 'Tracé : importez d’abord un tracé (carte des tracés d’Analyses)' : 'Tracé : liez un tracé à cette crise (Détails de la crise, ou ⋯ du tracé dans Analyses)', 4500); on = false; }
      this.ui.traceOn = on; LS.set('episcope.traceOn', on ? '1' : '0');
      T.el.hidden = !on; T.hd.hidden = !on; this.traceBtnSync();
      // le tracé prend la place des coupes ouvertes d'office (mode Analyses) ; elles reviennent en le fermant. Coupes rouvertes à la main : 3 vues
      if (on && this.ui.dock && this._dockAutoQ && this.toggleDock) { this._trDock = true; this._dockAutoQ = false; await this.toggleDock(false); }
      else if (!on && this._trDock && !this.ui.dock && this.ui.wm === 'quant' && this.toggleDock) { this._trDock = false; this._dockAutoQ = true; await this.toggleDock(true); }
      if (on) { this.traceRecList(); await this.traceSync(true); }
      setTimeout(() => { if (this.viewer) this.viewer.resize(); this.traceDraw(true); }, 30);
    },
    traceRecList() {
      const T = this._tr, ex = this.ieegEx && this.ieegEx(); if (!T || !ex) return; const R = ex.recordings || [], k = r => this.ieegKind(r);
      const og = (lab, L) => L.length ? `<optgroup label="${lab}">${L.map(r => `<option value="${r.id}">${esc(r.title)}</option>`).join('')}</optgroup>` : '';
      const sel = T.el.querySelector('.td-rec'); sel.innerHTML = `<option value="">${this.ui.wm === 'semioSeeg' || this.ui.wm === 'semio' ? 'tracé de la crise' : 'tracé du jeu affiché'}</option>${og('Crises', R.filter(r => k(r) === 'ictal'))}${og('Intercritique', R.filter(r => k(r) === 'inter'))}`;
      sel.value = T.pinned && T.recId ? T.recId : '';
    },
    /** jeu affiché changé : son tracé (sauf tracé choisi à la main) */
    async traceSync(force) {
      const T = this._tr; if (!T || T.el.hidden) return; const q = this.quantActive && this.quantActive();
      let r = null; if (T.pinned && T.recId) { const ex = this.ieegEx(); r = ex && (ex.recordings || []).find(x => x.id === T.recId); }
      if (!r && (this.ui.wm === 'semioSeeg' || this.ui.wm === 'semio')) r = this.traceSzRec();
      if (!r) r = this.traceRecOf(q); if (!r) { const ex = this.ieegEx(); r = ex && ((ex.recordings || []).find(x => this.ieegKind(x) === 'ictal') || (ex.recordings || [])[0]); }
      if (!r) return; if (r.id !== T.recId || force && !T.mem) await this.traceLoad(r); else this.traceDraw(true);
    },
    async traceLoad(rec) {
      const T = this._tr; let mem;
      try { mem = await this.ieegMem(rec); } catch (e) { console.warn(e); this.toast('Tracé illisible : ' + e.message, 6000); return; }
      const vw = rec.view || {}, hc = new Set(vw.hiddenContacts || []), hd = new Set(vw.hiddenDers || []);
      T.recId = rec.id; T.rec = rec; T.mem = mem; T.cache.clear(); T.pageKey = null; T.scroll = 0; T.tCur = null; T.amp = null;
      T.D = IE.montage(mem.channels, rec.modality === 'scalp' ? (vw.montage || 'banana') : 'bipolar').filter(d => d.seeg && !d.bad && !hd.has(d.name) && !IE.derContacts(d, mem.channels).some(c => hc.has(c)));   // scalp : montage de la visionneuse
      if (!T.D.length) T.D = IE.montage(mem.channels, 'mono').filter(d => d.seeg && !d.bad);
      const mk = this.traceMarks(rec); T.t0 = this.traceClampT(mk.onset != null ? mk.onset - T.page * 0.3 : 0);
      T.hp = vw.hp != null ? vw.hp : 1; T.notch = vw.notch === false || vw.notch === 0 ? 0 : +vw.notch > 1 ? +vw.notch : 50;
      this.traceKeys(); this.traceAutoAmp(); this.traceRecList(); this.traceDraw(true);
      const q = this.quantActive && this.quantActive(); if (q && q.net && q.net.frames && this.traceRecOf(q) === rec) { const u = this.quantNetPos(q); if (u >= 0) this.traceOnNet(q, u); }
    },
    /** clé du plot (ou de la paire) du schéma pour chaque voie du tracé */
    traceKeys() {
      const T = this._tr, map = this.ieegMapFor(T.rec, [...new Set(T.D.map(d => d.elec))]);
      T.keys = T.D.map(d => { const en = map[d.elec], e = en && S.findElec(this.elecs || [], en); return e && d.k1 != null ? (d.k2 != null ? S.pairLabel(e.name, d.k1, d.k2) : S.pairLabel(e.name, d.k1)) : null; });
      T.laneOfKey = new Map(T.keys.map((k, i) => [k, i]).filter(([k]) => k));
    },
    traceClampT(t) { const T = this._tr; return clamp(t, 0, Math.max(0, ((T && T.mem && T.mem.duration) || 0) - ((T && T.page) || 20))); },
    traceSeg(d, i0, i1) {
      const T = this._tr, fs = T.mem.fs, key = d.name + '|' + i0 + '|' + i1; let y = T.cache.get(key); if (y) return y;
      const pad = Math.round(fs * 2), a = Math.max(0, i0 - pad); y = IE.deriveSignal(T.mem.data, d, a, i1);
      if (T.hp || T.notch) y = IE.filterView(y, fs, { hp: T.hp, lp: 0, notch: T.notch === 50 && (T.mem.line || T.rec.line) ? (T.mem.line || T.rec.line) : T.notch });
      y = y.subarray(i0 - a); if (T.cache.size > 400) T.cache.clear(); T.cache.set(key, y); return y;
    },
    traceAutoAmp() {
      const T = this._tr, fs = T.mem.fs, i0 = Math.floor(T.t0 * fs), i1 = Math.min(T.mem.nSamples, i0 + Math.floor(Math.min(T.page, 10) * fs)), sd = [];
      for (const d of T.D.filter((x, i) => i % Math.max(1, Math.floor(T.D.length / 24)) === 0)) { const y = this.traceSeg(d, i0, i1); let s = 0, s2 = 0; for (let i = 0; i < y.length; i++) { s += y[i]; s2 += y[i] * y[i]; } const n = y.length || 1; sd.push(Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2))); }
      sd.sort((a, b) => a - b); const med = sd.length ? sd[sd.length >> 1] : 50; T.amp = AMPS.find(a => a >= 4 * med) || AMPS[AMPS.length - 1]; this.traceAmpLabel();
    },
    traceGain(dir) { const T = this._tr; if (!T || !T.amp) return; const i = AMPS.indexOf(T.amp), j = clamp((i < 0 ? 5 : i) - dir, 0, AMPS.length - 1); T.amp = AMPS[j]; this.traceAmpLabel(); this.traceDraw(true); },
    traceAmpLabel() { const T = this._tr, s = T.el.querySelector('.td-amp'); if (s && T.amp) s.textContent = T.amp >= 1000 ? nf(T.amp / 1000, 1) + ' mV' : T.amp + ' µV'; },
    /** jeu affiché, s'il porte sur ce tracé (valeurs à gauche des voies, détections, réseau) */
    traceSet() { const T = this._tr, q = this.quantActive && this.quantActive(); return q && T && T.rec && (this.traceRecOf(q) === T.rec || (q.eimax || q.smax)) ? q : null; },
    traceGeo() {
      const T = this._tr, W = T.cv.clientWidth, H = T.cv.clientHeight, n = (T.D || []).length, avail = H - TOP - 2, laneH = Math.max(7, avail / Math.max(1, n)), nVis = Math.max(1, Math.floor(avail / laneH));
      T.scroll = clamp(T.scroll, 0, Math.max(0, n - nVis)); const pw = Math.max(10, W - GUT - 6), k = pw / T.page; return { W, H, laneH, nVis, pw, k, x0: GUT, X: t => GUT + (t - T.t0) * k };
    },
    /** dessin : page (image hors écran, refaite si elle change), puis barre de lecture et voies des liens */
    traceDraw(full) {
      const T = this._tr; if (!T || T.el.hidden || !T.mem) return; if (full) T.pageKey = null;
      if (T._raf) return; T._raf = requestAnimationFrame(() => { T._raf = 0; try { this.tracePaint(); } catch (e) { console.warn(e); } });
    },
    tracePaint() {
      const T = this._tr, cv = T.cv, W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return; const dpr = window.devicePixelRatio || 1;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); T.pageKey = null; }
      const q = this.traceSet(), key = [T.recId, T.t0.toFixed(3), T.page, T.amp, T.scroll, W, H, T.light, q ? q.id + ':' + (q.min) + ':' + (q.max) + ':' + q.cmap : ''].join('|');
      if (T.pageKey !== key) { T.page0 = this.tracePaintPage(q, W, H, dpr); T.pageKey = key; }
      const g = cv.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(T.page0, 0, 0); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const G = this.traceGeo();
      // voies source / cible des liens de la fenêtre affichée (réseau h² de la crise)
      if (q && q.net && q.net.kind === 'ictal' && q.net.frames) {
        const u = this.quantNetPos(q); if (u >= 0) { const fr = q.net.frames[Math.round(u)] || [], role = new Map();
          for (const [a, b, , d] of fr) { const la = T.laneOfKey.get(q.net.keys[a]), lb = T.laneOfKey.get(q.net.keys[b]); if (la != null) role.set(la, (role.get(la) || 0) | (d ? 1 : 3)); if (lb != null) role.set(lb, (role.get(lb) || 0) | (d ? 2 : 3)); }
          for (const [li, r] of role) { const j = li - T.scroll; if (j < 0 || j >= G.nVis) continue; const yc = TOP + j * G.laneH + G.laneH / 2, rr = Math.max(2.2, Math.min(4, G.laneH * 0.3));
            g.lineWidth = 1.4; if (r & 1) { g.fillStyle = '#ff3cc8'; g.beginPath(); g.arc(GUT - 34, yc, rr, 0, 2 * Math.PI); g.fill(); } if (r & 2) { g.strokeStyle = '#4c8cff'; g.beginPath(); g.arc(GUT - 34, yc, rr + 1.2, 0, 2 * Math.PI); g.stroke(); } }
        }
      }
      // barre de lecture
      if (T.tCur != null) { const x = Math.round(G.X(T.tCur)) + 0.5; if (x >= GUT && x <= GUT + G.pw) { g.strokeStyle = T.light ? '#d0021b' : '#ff4d5e'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, TOP - 4); g.lineTo(x, H); g.stroke(); g.lineWidth = 1; } }
      const tl = T.el.querySelector('.td-t'), on = this.traceMarks(T.rec).onset, t = T.tCur != null ? T.tCur : T.t0;
      if (tl) tl.textContent = `${clock(t)}${on != null ? ` (${t - on >= 0 ? '+' : '−'}${nf(Math.abs(t - on), 1)} s)` : ''}`;
    },
    tracePaintPage(q, W, H, dpr) {
      const T = this._tr, c = T.page0 && T.page0.width === Math.round(W * dpr) && T.page0.height === Math.round(H * dpr) ? T.page0 : document.createElement('canvas');
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const C = T.light ? THEME.light : THEME.dark; g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
      const G = this.traceGeo(), fs = T.mem.fs, t0 = T.t0, X = G.X;
      // grille du temps
      const step = T.page <= 6 ? 1 : T.page <= 30 ? 5 : 10; g.font = '10px ' + MONO; g.textBaseline = 'middle'; g.textAlign = 'center';
      for (let t = Math.ceil(t0 / step) * step; t <= t0 + T.page + 1e-9; t += step) { const x = Math.round(X(t)) + 0.5; g.strokeStyle = C.grid; g.beginPath(); g.moveTo(x, TOP); g.lineTo(x, H); g.stroke(); g.fillStyle = C.tick; g.fillText(clock(t).replace(/\.0$/, ''), x, 8); }
      // valeurs du jeu affiché
      const vals = q && q.values ? q.values : null, lo = q ? +q.min || 0 : 0, sp = q ? ((+q.max - lo) || 1) : 1, thr = q && this.quantThreshold ? this.quantThreshold(q) : null, pz = q && thr != null && this.quantPZ ? this.quantPZ(q) : null;
      const rec = T.rec, eiOK = q && (q.method === 'ei' || q.eimax || /^EI\b/.test(q.source || '')) && rec.ei && rec.ei.last && rec.ei.last.montage === 'bipolar', EIby = eiOK ? new Map(rec.ei.last.rows.map(r => [r.name, r])) : null;
      const i0 = Math.max(0, Math.floor(t0 * fs)), i1 = Math.min(T.mem.nSamples, Math.ceil((t0 + T.page) * fs) + 1), xs = X(i0 / fs), spx = G.k / fs, ppu = G.laneH / (T.amp || 200);
      let prev = null; g.textAlign = 'left';
      for (let j = 0; j < G.nVis && T.scroll + j < T.D.length; j++) {
        const li = T.scroll + j, d = T.D[li], yT = TOP + j * G.laneH, yc = yT + G.laneH / 2;
        if (d.elec !== prev) { if (prev != null) { g.strokeStyle = C.sep; g.beginPath(); g.moveTo(0, Math.round(yT) + 0.5); g.lineTo(W, Math.round(yT) + 0.5); g.stroke(); } prev = d.elec; }
        const key = T.keys[li], v = vals && key != null ? vals[key] : undefined;
        g.fillStyle = v != null && thr != null && v >= thr ? (T.light ? '#b00020' : '#ff8a8f') : v != null && pz != null && v > pz ? (T.light ? '#9a5200' : '#ffc06a') : C.txt; g.font = (G.laneH >= 12 ? '10px ' : G.laneH >= 9 ? '8.5px ' : '7.5px ') + MONO;
        g.fillText(d.name.length > 11 ? d.name.slice(0, 10) + '…' : d.name, 4, yc);
        if (v != null && isFinite(v)) { const tt = clamp((v - lo) / sp, 0, 1), col = S.cmap(q.cmap || 'inferno', tt); g.fillStyle = C.barBg; g.fillRect(GUT - 26, yc - 2.5, 22, 5); g.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`; g.fillRect(GUT - 26, yc - 2.5, Math.max(1, 22 * tt), 5); }
        if (i1 - i0 > 1) { g.save(); g.beginPath(); g.rect(GUT, yT - G.laneH * 0.6, G.pw, G.laneH * 2.2); g.clip(); g.strokeStyle = C.trace; g.lineWidth = 0.9; trace(g, this.traceSeg(d, i0, i1), xs, spx, yc, ppu); g.restore(); }
        const r = EIby && EIby.get(d.name);
        if (r && r.detected && r.tNd != null) { const x = X(r.tNd), sz = Math.max(3.5, Math.min(6, G.laneH * 0.42)), col = r.manual ? MK.man : MK.nd; if (x >= GUT && x <= GUT + G.pw) { tick(g, Math.round(x) + 0.5, yT + sz * 0.9, yT + G.laneH - 1, col); glyph(g, r.manual ? 'dia' : 'tri', x, yT + sz * 0.75, sz, col); } if (r.tNa != null) { const xa = X(r.tNa); if (xa >= GUT && xa <= GUT + G.pw) glyph(g, 'ring', xa, yc, sz * 0.9, MK.na); } }
      }
      // marques et évènements
      const mk = this.traceMarks(rec), vline = (t, col, dash, lab) => { const x = Math.round(X(t)) + 0.5; if (x < GUT || x > GUT + G.pw) return; g.strokeStyle = col; g.setLineDash(dash || []); g.beginPath(); g.moveTo(x, TOP); g.lineTo(x, H); g.stroke(); g.setLineDash([]); if (lab) { g.font = '10px system-ui, sans-serif'; const w = Math.min(120, g.measureText(lab).width + 6); g.fillStyle = C.lblBg; g.fillRect(x + 2, TOP + 1, w, 13); g.fillStyle = col; g.fillText(lab, x + 5, TOP + 8); } };
      for (const e of rec.events || []) vline(e.onset, T.light ? 'rgba(170,110,0,0.85)' : 'rgba(242,184,75,0.75)', [4, 3], '');
      g.lineWidth = 1.5; if (mk.onset != null) vline(mk.onset, T.light ? '#d0021b' : '#ff5a5f', null, 'début'); if (mk.end != null) vline(mk.end, T.light ? '#0067a3' : '#4cc9f0', null, 'fin'); g.lineWidth = 1;
      if (eiOK && rec.ei.last.N0 != null) { g.lineWidth = 1.6; vline(rec.ei.last.N0, MK.n0, [3, 2], 'N0'); g.lineWidth = 1; }
      if (T.D.length > G.nVis) { const hT = H - TOP, bh = Math.max(16, hT * G.nVis / T.D.length), by = TOP + (hT - bh) * T.scroll / Math.max(1, T.D.length - G.nVis); g.fillStyle = C.scroll || 'rgba(255,255,255,0.25)'; g.fillRect(W - 4, by, 3, bh); }
      return c;
    },
    tracePt(e) { const T = this._tr, r = T.cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; },
    traceWheel(e) {
      const T = this._tr; if (!T || !T.mem) return; e.preventDefault(); const G = this.traceGeo();
      if (e.ctrlKey || e.metaKey) { this.traceGain(e.deltaY < 0 ? 1 : -1); return; }
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) { T.t0 = this.traceClampT(T.t0 + Math.sign(e.deltaX || e.deltaY) * T.page * 0.25); this.traceDraw(true); return; }
      T.scroll = clamp(T.scroll + Math.sign(e.deltaY) * Math.max(1, Math.round(G.nVis / 6)), 0, Math.max(0, T.D.length - G.nVis)); this.traceDraw(true);
    },
    /** clic : étiquette → plot choisi ; tracé → instant (fenêtre h² la plus proche si le jeu affiché est un réseau de crise) */
    traceClick(e) {
      const T = this._tr; if (!T || !T.mem) return; const p = this.tracePt(e), G = this.traceGeo(), q = this.traceSet();
      if (p.x < GUT) { const li = T.scroll + Math.floor((p.y - TOP) / G.laneH), key = T.keys[li]; if (key && q && this.quantSelect) this.quantSelect(key, q); return; }
      const t = T.t0 + (p.x - GUT) / G.k;
      if (q && q.net && q.net.kind === 'ictal' && q.net.frames && this.quantNetSet) { if (this._netAnim && this.quantNetStop) this.quantNetStop(); this.quantNetSet(q, clamp((t - q.net.t0) / q.net.dt, 0, q.net.frames.length - 1)); }
      else { T.tCur = t; this.traceDraw(); }
    },
    /** fenêtre affichée du réseau (lecture, curseur de la légende) : barre sur la page fixe, page suivante en bout de page */
    traceOnNet(q, u) {
      const T = this._tr; if (!T || T.el.hidden || !T.mem || this.traceRecOf(q) !== T.rec) return;
      if (u < 0) { T.tCur = null; this.traceDraw(); return; }
      const t = q.net.t0 + u * q.net.dt; T.tCur = t;
      if (t < T.t0 || t > T.t0 + T.page) { T.t0 = this.traceClampT(t - T.page * 0.04); T.pageKey = null; }
      this.traceDraw();
    },
  };
  Object.assign(A, M);

  // greffes : bouton « Tracé », mode Analyses, jeu affiché changé
  SV.Bus.on('workmode:after', function (mode) {
    try {
      const T = this._tr;
      if (mode === 'quant' && this.traceAvailable() && (this.ui.traceOn != null ? this.ui.traceOn : LS.get('episcope.traceOn') === '1') && (!T || T.el.hidden)) this.traceToggle(true);
      else if ((mode === 'semioSeeg' || mode === 'semio') && T && !T.el.hidden && this.traceAvailable()) this.traceSync(true);
      else if (mode !== 'quant' && T && !T.el.hidden) { const keep = this.ui.traceOn; T.el.hidden = true; T.hd.hidden = true; this.ui.traceOn = keep; setTimeout(() => this.viewer && this.viewer.resize(), 30); }
      this.traceBtnSync();
    } catch (e) { console.warn(e); }
  }, 'quant_trace');
  const ql0 = A.updateQuantLegend;
  if (ql0) A.updateQuantLegend = function () { const r = ql0.apply(this, arguments); try { if (this._tr && !this._tr.el.hidden) this.traceSync(); } catch (e) { console.warn(e); } return r; };
  const rq0 = A.renderQuant;
  if (rq0) A.renderQuant = function () { const r = rq0.apply(this, arguments); try { this.traceBtnSync(); if (this._tr && !this._tr.el.hidden) { this.traceRecList(); } } catch (e) { console.warn(e); } return r; };
  // autre crise ouverte : bouton et tracé suivent
  SV.Bus.on('nav:after', function () { try { this.traceBtnSync(); const T = this._tr; if (T && !T.el.hidden && (this.ui.wm === 'semioSeeg' || this.ui.wm === 'semio')) { if (T.recId && T.szId !== (this.ctx && this.ctx.seizureId)) { T.recId = null; T.pinned = false; } T.szId = this.ctx && this.ctx.seizureId; if (this.traceAvailable()) this.traceSync(true).then(() => this.setTime(this.ui.t || 0)); else this.traceToggle(false); } } catch (e) { console.warn(e); } }, 'quant_trace');
  // temps de la crise (frise, lecture, vidéo) → barre de lecture du tracé de la crise
  const st0 = A.setTime;
  if (st0) A.setTime = function (t) {
    const r = st0.apply(this, arguments), T = this._tr;
    if (T && !T.el.hidden && T.mem && (this.ui.wm === 'semioSeeg' || this.ui.wm === 'semio')) { const u = this.traceSzTime(t); if (u != null) { T.tCur = u; if (u < T.t0 || u > T.t0 + T.page) { T.t0 = this.traceClampT(u - T.page * 0.1); T.pageKey = null; } this.traceDraw(); } }
    return r;
  };
  function boot() {
    const dock = $('btnDock'); if (!dock || $('btnTrace')) return;
    const b = h('button', '', 'Tracé'); b.id = 'btnTrace'; b.hidden = true; b.title = 'Tracé à côté de la vue 3D (à la place des coupes ou en plus) : Analyses → tracé du jeu affiché ; crise → tracé lié à la crise, calé sur le temps de la sémiologie';
    dock.parentElement.insertBefore(b, dock); b.onclick = () => A.traceToggle.call(A);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window.SV);
