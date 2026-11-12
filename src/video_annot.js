/* EpiScope — video_annot.js (v4.7) : saisie de la sémiologie au fil de la vidéo de la crise.
 * Bouton « Vidéo » de la vue d'une crise : lier une vidéo de la galerie (ou en importer une), qui s'affiche à gauche,
 * la vue 3D passant à droite (à la place des coupes IRM). La vidéo pilote le chrono existant :
 *   - clic sur la vidéo : pause — on choisit le signe (palette, ou on tape son nom) ; il est horodaté au temps de la vidéo ;
 *   - Espace : reprendre (aussi depuis la recherche vide) ; ◀ ▶ (flèches) et la frise déplacent la vidéo ;
 *   - ⟲ 0 du chrono : « t = 0 ici » (premier signe) — la séquence déjà saisie est décalée pour rester calée ;
 *   - ▶ de la frise, vitesse ×0,5 … ×4 : ceux de la vidéo. Choisir un signe de la séquence place la vidéo à son temps.
 * Lien gardé dans la crise : sz.video = { galleryId, t0 } (t0 = temps de la vidéo au t = 0 de la crise) ; la capture de
 * la galerie est rattachée à la crise (g.seizureId) si elle ne l'était pas. Rien d'autre à régler. */
(function (SV) {
  'use strict';
  const $ = id => document.getElementById(id), S = SV.Store;
  const esc = SV.U.esc;
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const isVideo = g => !!g && /^video\//.test(g.mime || '');
  const mmss = s => { s = Math.max(0, s || 0); const m = Math.floor(s / 60), r = s - 60 * m; return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1).replace('.', ',')}`; };
  const fmtDate = s => { if (!s) return ''; const d = new Date(String(s).length <= 10 ? s + 'T12:00:00' : s); return isNaN(d) ? String(s) : d.toLocaleDateString(SV.LOC); };
  const HINT_V = 'Vidéo : <b>clic</b> sur l’image = pause, puis choisissez le signe (palette ou clavier) ; <b>Espace</b> = reprendre. <b>⟲ 0</b> : t = 0 de la crise à cet instant de la vidéo.';
  const LS = { get() { try { return localStorage.getItem('episcope.vidW'); } catch (e) { return null; } }, set(v) { try { localStorage.setItem('episcope.vidW', v); } catch (e) { } } };

  const M = {
    videoSeizure() { const d = this.dossier; return d && this.ctx && this.ctx.seizureId ? S.byId(d.seizures, this.ctx.seizureId) : null; },
    /** vidéo liée à la crise : sz.video, sinon une vidéo de la galerie rattachée à cette crise */
    videoLinked(sz) {
      const d = this.dossier; if (!d || !sz) return null; const G = d.gallery || [];
      const g = sz.video && S.byId(G, sz.video.galleryId); if (isVideo(g)) return g;
      return G.find(x => isVideo(x) && x.seizureId === sz.id) || null;
    },
    videoCandidates(sz) {
      const d = this.dossier, ctx = sz && S.contextOf(d, sz.id), exId = ctx && ctx.exploration ? ctx.exploration.id : null;
      const rank = g => g.seizureId === sz.id ? 0 : g.explorationId === exId && !g.seizureId ? 1 : g.explorationId === exId ? 2 : 3;
      return (d.gallery || []).filter(isVideo).sort((a, b) => rank(a) - rank(b) || String(b.date).localeCompare(String(a.date)));
    },
    videoLink(sz, g) {
      const d = this.dossier, ctx = S.contextOf(d, sz.id), keep = sz.video && sz.video.galleryId === g.id ? sz.video.t0 || 0 : 0;
      sz.video = { galleryId: g.id, t0: keep };
      if (!g.seizureId) g.seizureId = sz.id; if (!g.explorationId && ctx && ctx.exploration) g.explorationId = ctx.exploration.id;
      this.touch('seizure', sz.id, 'vidéo liée');
    },
    videoUnlink(sz) { if (!sz) return; delete sz.video; this.touch('seizure', sz.id, 'vidéo déliée'); this.videoClose(); this.videoBtnSync(); },

    // ---------------------------------------------------------------- bouton et menu
    videoBtnSync() {
      const b = $('btnVideo'); if (!b) return; const sz = this.videoSeizure(), on = !!this._vid;
      b.hidden = !(this.dossier && sz && this.ui.screen === 'work' && ['semio', 'semioSeeg'].includes(this.ui.wm));
      b.classList.toggle('on', on); const g = sz && this.videoLinked(sz);
      b.textContent = g ? 'Vidéo' : 'Vidéo +'; b.title = g ? `Vidéo de la crise (${g.title || 'sans titre'}) : à gauche, la 3D à droite ; clic sur l’image = pause et choix du signe, Espace = reprendre` : 'Lier une vidéo de la galerie à cette crise, ou en importer une, pour saisir les signes au fil de la vidéo';
    },
    videoButton(anchor) {
      const sz = this.videoSeizure(); if (!sz) return;
      if (this._vid) { this.videoClose(); return; }
      const g = this.videoLinked(sz); if (g) { this.videoOpen(g); return; }
      this.videoMenu(anchor);
    },
    videoMenu(anchor) {
      const sz = this.videoSeizure(); if (!sz) return; const cur = this._vid && this._vid.g, items = [{ head: `Vidéo de ${sz.label}` }];
      const C = this.videoCandidates(sz).filter(g => !cur || g.id !== cur.id);
      for (const g of C.slice(0, 12)) items.push({ label: `▶ ${g.title || 'vidéo sans titre'}${g.duration ? ' · ' + mmss(g.duration).replace(/,\d$/, '') : ''}${g.date ? ' · ' + fmtDate(g.date) : ''}${g.seizureId === sz.id ? ' · cette crise' : ''}`, run: () => { this.videoLink(sz, g); this.videoOpen(g); } });
      if (C.length) items.push({ sep: true });
      items.push({ label: 'Importer une vidéo…', run: () => this.videoImport(sz) });
      if (cur || sz.video) items.push({ label: 'Délier la vidéo de cette crise', danger: true, run: () => this.videoUnlink(sz) });
      const r = anchor.getBoundingClientRect(); this.popupMenu(items, Math.min(r.left, window.innerWidth - 380), r.bottom + 4);
    },
    videoImport(sz) {
      const inp = h('input'); inp.type = 'file'; inp.accept = 'video/*,.avi,.mkv,.mov,.wmv,.mpg,.mpeg,.mts,.m2ts,.3gp,.flv';
      inp.onchange = async () => {
        const f = inp.files && inp.files[0]; if (!f) return; const ctx = S.contextOf(this.dossier, sz.id);
        const added = await this.galleryAdd([f], { explorationId: ctx && ctx.exploration ? ctx.exploration.id : null, seizureId: sz.id, kind: 'ictal', modality: 'video' });
        const g = (added || []).find(isVideo); if (!g) return;
        this.videoLink(sz, g); this.videoOpen(g); this.toast('Vidéo rangée dans la galerie et liée à la crise', 3000);
      };
      inp.click();
    },

    // ---------------------------------------------------------------- volet vidéo
    videoPane() {
      let p = $('videoPane'); if (p) return p;
      const split = $('viewSplit'), v3 = $('view3d'); if (!split || !v3) return null;
      p = h('div', 'video-pane'); p.id = 'videoPane'; p.hidden = true;
      p.innerHTML = `<div class="vp-head"><b class="vp-title"></b><span class="spacer"></span><button class="mini-btn" data-a="more" title="changer de vidéo, en importer une, délier">⋯</button><button class="mini-btn" data-a="close" title="fermer la vidéo">✕</button></div>
        <div class="vp-stage" title="clic : pause et choix du signe · Espace : reprendre"><video playsinline preload="auto"></video><div class="vp-flash" hidden></div></div>
        <div class="vp-bar"><input type="range" class="vp-scrub" min="0" max="1" step="0.04" value="0"><span class="vp-time mono"></span></div>`;
      const hd = h('div', 'dock-handle'); hd.id = 'videoHandle'; hd.hidden = true; hd.title = 'glisser pour élargir ou réduire la vidéo';
      split.insertBefore(p, v3); split.insertBefore(hd, v3);
      const w = LS.get(); if (w) p.style.width = w;
      hd.addEventListener('pointerdown', e => {
        hd.setPointerCapture(e.pointerId); const box = split.getBoundingClientRect();
        const mv = ev => { p.style.width = Math.max(260, Math.min(box.width - 260, ev.clientX - box.left)) + 'px'; };
        const up = () => { hd.removeEventListener('pointermove', mv); hd.removeEventListener('pointerup', up); LS.set(p.style.width); };
        hd.addEventListener('pointermove', mv); hd.addEventListener('pointerup', up);
      });
      const el = p.querySelector('video'), sc = p.querySelector('.vp-scrub');
      p.querySelector('.vp-stage').onclick = () => { if (!this._vid) return; if (el.paused) el.play().catch(() => { }); else { el.pause(); this.videoFlash('❚❚ choisissez le signe'); const s = $('search'); if (s) s.focus(); } };
      p.querySelector('[data-a=close]').onclick = () => this.videoClose();
      p.querySelector('[data-a=more]').onclick = e => this.videoMenu(e.currentTarget);
      sc.oninput = () => { if (this._vid) { el.currentTime = +sc.value; this.videoSyncTime(true); } };
      el.addEventListener('play', () => { this.videoUi(); this.videoLoop(); });
      el.addEventListener('pause', () => { this.videoUi(); this.videoSyncTime(true); });
      el.addEventListener('seeked', () => this.videoSyncTime(true));
      el.addEventListener('loadedmetadata', () => { sc.max = String(el.duration || 1); this.videoSyncTime(true); });
      el.addEventListener('error', () => { if (this._vid) this.toast('Vidéo illisible dans le navigateur : Galerie › ouvrir la vidéo › « Convertir en vidéo légère… »', 6000); });
      return p;
    },
    async videoOpen(g) {
      const sz = this.videoSeizure(); if (!sz || !g) return; const p = this.videoPane(); if (!p) return;
      if (this.ui.dock && this.toggleDock) await this.toggleDock(false);
      const el = p.querySelector('video'), url = await this.galleryMediaURL(g); if (!url) { this.toast('Fichier de la vidéo introuvable dans le dossier', 4000); return; }
      if (this._vid && this._vid.g.id !== g.id) el.pause();
      this._vid = { g, el, sz }; this.ui.videoOn = true;
      if (el.src !== url) el.src = url;
      el.playbackRate = +(($('speed') || {}).value || 1);
      p.querySelector('.vp-title').textContent = g.title || 'vidéo';
      p.hidden = false; $('videoHandle').hidden = false;
      // place pour la vidéo et la 3D : réglages de la vue 3D dans « Affichage ▾ », panneau d'analyse replié (rétabli à la fermeture)
      if (this.planBarSync) this.planBarSync(); document.body.classList.add('cvideo');
      if (!document.body.classList.contains('right-collapsed') && this.togglePanel) { this._vidPanel = true; this.togglePanel('right', true); }
      if (this.ui.mode !== 'chrono' && this.setMode) this.setMode('chrono');
      const hint = document.querySelector('#chronoBody .hint'); if (hint) { if (hint.dataset.h0 == null) hint.dataset.h0 = hint.innerHTML; hint.innerHTML = HINT_V; }
      const t0 = (sz.video && sz.video.galleryId === g.id && sz.video.t0) || 0, tt = this.state && this.state.events.length ? Math.max(0, this.ui.t || 0) : 0, go = () => { try { el.currentTime = Math.max(0, t0 + tt); } catch (e) { } };
      if (el.readyState >= 1) go(); else el.addEventListener('loadedmetadata', go, { once: true });
      this.videoUi(); this.videoBtnSync();
    },
    videoClose(keepPref) {
      const p = $('videoPane'); if (this._vid) this._vid.el.pause(); this._vid = null; if (!keepPref) this.ui.videoOn = false;
      if (p) p.hidden = true; const hd = $('videoHandle'); if (hd) hd.hidden = true;
      document.body.classList.remove('cvideo'); if (this._vidPanel && this.togglePanel) { this._vidPanel = false; this.togglePanel('right', false); }
      const hint = document.querySelector('#chronoBody .hint'); if (hint && hint.dataset.h0 != null) hint.innerHTML = hint.dataset.h0;
      if (this.chronoReset0) this.chronoReset0(); this.videoBtnSync();
      const pb = $('playBtn'); if (pb) pb.textContent = this.ui.playing ? '❚❚' : '▶';
    },
    videoT0() { const V0 = this._vid; return V0 && V0.sz.video && V0.sz.video.galleryId === V0.g.id ? V0.sz.video.t0 || 0 : 0; },
    videoFlash(text) { const f = document.querySelector('#videoPane .vp-flash'); if (!f) return; f.textContent = text; f.hidden = false; clearTimeout(this._vfT); this._vfT = setTimeout(() => { f.hidden = true; }, 1300); },
    videoToggle() { const V0 = this._vid; if (!V0) return; if (V0.el.paused) V0.el.play().catch(() => { }); else V0.el.pause(); },
    /** t = 0 de la crise à l'instant courant de la vidéo ; la séquence saisie est décalée pour rester calée sur la vidéo */
    videoSetT0() {
      const V0 = this._vid; if (!V0) return; const sz = V0.sz, old = this.videoT0(), t0 = Math.round(V0.el.currentTime * 10) / 10, dt = t0 - old;
      sz.video = { galleryId: V0.g.id, t0 };
      if (dt && this.state && this.state.events.length) { for (const ev of this.state.events) ev.t = Math.round((ev.t - dt) * 10) / 10; this.changed(); }
      this.touch('seizure', sz.id, 't0 de la vidéo'); this.videoSyncTime(true);
      this.toast(`t = 0 à ${mmss(t0)} de la vidéo${dt && this.state.events.length ? ` · séquence décalée de ${(-dt).toFixed(1).replace('.', ',')} s` : ''}`, 3500);
    },
    videoUi() {
      const V0 = this._vid, playing = !!(V0 && !V0.el.paused);
      const ct = $('chronoToggle'); if (ct) ct.textContent = playing ? '❚❚ Pause' : '▶ Lecture';
      const tm = $('chronoTime'); if (tm) tm.classList.toggle('running', playing);
      const pb = $('playBtn'); if (pb && V0) pb.textContent = playing ? '❚❚' : '▶';
      const st = document.querySelector('#videoPane .vp-stage'); if (st) st.classList.toggle('paused', !playing);
    },
    /** temps de la crise ← vidéo : chrono, frise, 3D (sans relancer de recherche dans la vidéo) */
    videoSyncTime(force) {
      const V0 = this._vid; if (!V0) return; const el = V0.el, t = el.currentTime - this.videoT0();
      const tm = $('chronoTime'); if (tm) tm.textContent = SV.fmtT(t, true);
      const sc = document.querySelector('#videoPane .vp-scrub'); if (sc && document.activeElement !== sc) sc.value = String(el.currentTime);
      const tx = document.querySelector('#videoPane .vp-time'); if (tx) tx.textContent = `${mmss(el.currentTime)} / ${mmss(el.duration || 0)}  ·  crise ${t < 0 ? '−' : ''}${Math.abs(t).toFixed(1).replace('.', ',')} s`;
      if (this.result && (force || !el.paused)) { const tc = Math.max(this.result.tmin, Math.min(this.result.tmax, t)); if (Math.abs(tc - this.ui.t) > 0.04 || force) { this._vSync = true; try { this.setTime(tc); } finally { this._vSync = false; } } }
    },
    videoLoop() { const V0 = this._vid; if (!V0 || V0.el.paused) return; this.videoSyncTime(); requestAnimationFrame(() => this.videoLoop()); },
  };
  Object.assign(SV.app, M);

  // ---------------------------------------------------------------- greffes : le chrono, la frise et l'espace suivent la vidéo
  const A = SV.app, cn0 = A.chronoNow, ct0 = A.chronoToggle, cr0 = A.chronoReset, cg0 = A.chronoNudge, tp0 = A.togglePlay, st0 = A.setTime, oc0 = A.openContext, dk0 = A.toggleDock;
  A.chronoReset0 = cr0;
  A.chronoNow = function () { return this._vid ? this._vid.el.currentTime - this.videoT0() : cn0.apply(this, arguments); };
  A.chronoToggle = function () { if (this._vid) return this.videoToggle(); return ct0.apply(this, arguments); };
  A.chronoReset = function () { if (this._vid) return this.videoSetT0(); return cr0.apply(this, arguments); };
  A.chronoNudge = function (dd) { if (this._vid) { const el = this._vid.el; el.currentTime = Math.max(0, Math.min(el.duration || 1e9, el.currentTime + dd)); return; } return cg0.apply(this, arguments); };
  A.togglePlay = function () { if (this._vid) return this.videoToggle(); return tp0.apply(this, arguments); };
  A.setTime = function (t) {
    const r = st0.apply(this, arguments);
    if (this._vid && !this._vSync) { const el = this._vid.el, x = Math.max(0, t + this.videoT0()); if (isFinite(x) && Math.abs(el.currentTime - x) > 0.05) { try { el.currentTime = el.duration ? Math.min(el.duration, x) : x; } catch (e) { } } }
    return r;
  };
  A.openContext = function (ctx) {
    const was = this.ui.videoOn, prev = this._vid && this._vid.sz; const r = oc0.apply(this, arguments);
    const sz = this.videoSeizure();
    if (this._vid && (!sz || sz !== prev)) this.videoClose(true);
    if (was && sz && !this._vid && ['semio', 'semioSeeg'].includes(this.ui.wm)) { const g = this.videoLinked(sz); if (g) this.videoOpen(g); }
    this.videoBtnSync(); return r;
  };
  SV.Bus.on('workmode:after', function (mode) {
    if (this._vid && !['semio', 'semioSeeg'].includes(mode)) this.videoClose(true);
    else if (!this._vid && this.ui.videoOn && ['semio', 'semioSeeg'].includes(mode)) { const sz = this.videoSeizure(), g = sz && this.videoLinked(sz); if (g) this.videoOpen(g); }
    this.videoBtnSync();
  }, 'video_annot');
  if (dk0) A.toggleDock = async function (on) { on = on == null ? !this.ui.dock : !!on; if (on && this._vid) this.videoClose(); return dk0.call(this, on); };

  // bouton « Vidéo » (à côté de « Coupes IRM »), vitesse de la frise, Espace capturé avant le raccourci du chrono
  function boot() {
    const dock = $('btnDock'); if (!dock || $('btnVideo')) return;
    const b = h('button', '', 'Vidéo'); b.id = 'btnVideo'; b.hidden = true; dock.parentElement.insertBefore(b, dock);
    b.onclick = e => A.videoButton.call(A, e.currentTarget);
    const sp = $('speed'); if (sp) sp.addEventListener('change', () => { if (A._vid) A._vid.el.playbackRate = +sp.value || 1; });
    window.addEventListener('keydown', e => {
      if (!A._vid || e.code !== 'Space' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (A.ui.screen && A.ui.screen !== 'work') return; if ([...document.querySelectorAll('.modal')].some(m => !m.hidden)) return;
      const a = document.activeElement, tag = a ? a.tagName : '', search = a && a.id === 'search';
      if (/INPUT|SELECT|TEXTAREA/.test(tag) && !(search && !a.value.trim())) return;
      e.preventDefault(); e.stopImmediatePropagation(); if (tag === 'BUTTON' && a.blur) a.blur();
      A.videoToggle();
    }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window.SV = window.SV || {});
