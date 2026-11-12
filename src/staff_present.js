/* EpiScope — staff_present.js : Staff › Présenter.
 *   Le dossier montré en réunion, plein écran : Patient (motif, personnes présentes, parcours ; développement ;
 *   antécédents ; mode de vie ; histoire de l'épilepsie ; examen) · Bilans (pièces jointes et captures en visionneuse ;
 *   imagerie : coupes, un compte rendu lié à une image l'affiche) · EEG de chaque phase 1 (intercritique et sa galerie,
 *   chaque crise sur une page — frise, médias, modèle —, synthèse : totaux, frise de l'exploration, modèle par type de
 *   crise) · SEEG, décisions et intervention réalisée (present_seeg.js) · Discussion (concordance, hypothèses) · Conclusion.
 *   ← → (espace, Page ↑↓) : diapositive · Origine / Fin · Échap : retour à « Préparer » · F : plein écran · N : plan.
 *   Les vues 3D sont calculées à la demande (diapositive affichée et ses voisines), mises en cache.                 */
(function (SV) {
  'use strict';
  const $ = id => document.getElementById(id), S = SV.Store, V = S.V;
  const esc = SV.U.esc;
  const br = s => esc(s).replace(/\n/g, '<br>');
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const fmtDate = s => { if (!s) return ''; const d = new Date(String(s).length <= 10 ? s + 'T12:00:00' : s); return isNaN(d) ? String(s) : d.toLocaleDateString(SV.LOC); };
  const fmtDT = s => { if (!s) return ''; const d = new Date(s); if (isNaN(d)) return String(s); return String(s).length <= 10 ? d.toLocaleDateString(SV.LOC) : d.toLocaleString(SV.LOC, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const hash = s => { let x = 5381; for (let i = 0; i < s.length; i++) x = ((x << 5) + x + s.charCodeAt(i)) | 0; return (x >>> 0).toString(36); };
  const SIDE_FR = { L: 'gauche', R: 'droite', B: 'bilatéral', N: 'non latéralisant' };
  const LVC = { '++': 'pp', '+': 'p', '0': 'z', '−': 'm', '?': 'q' };
  const ROLE = () => (SV.SeegFlow && SV.SeegFlow.ROLE_COL) || { onset: '#e5484d', early: '#f2994a', late: '#e8d44d' };
  const P1_EEG = [['background', 'Rythme de fond'], ['interictal', 'Intercritique'], ['ictal', 'Critique'], ['postictal', 'Post-critique'], ['conclusion', 'Conclusion']];

  const M = {
    // ================================================================ ouverture, fermeture
    openPresentation(m) {
      const d = this.dossier, el = $('presentation'); if (!d || !m || !el) return;
      if (this._presD !== d.id) { this._presCache = new Map(); this._presD = d.id; }
      const back = this.ui.presentBack && this.ui.presentBack.meetingId === m.id ? this.ui.presentBack : null; this.clearPresentBack();
      const slides = this.presentSlides(m), saved = (this.ui.presentAt || {})[m.id];
      const P = this._pres = { m, slides, i: 0, tok: 0 };
      P.i = Math.max(0, Math.min(slides.length - 1, back ? back.i : saved || 0));
      if (this.ui.presLight == null) { try { this.ui.presLight = localStorage.getItem('sv_pres_light') !== '0'; } catch (e) { this.ui.presLight = true; } }   // v5.1 : fond clair par défaut (vidéoprojecteur, écran de TV)
      el.className = 'presentation' + (this.ui.presLight ? ' light' : '') + (this.ui.presNoNav ? ' nonav' : '');
      el.innerHTML = `<aside class="pr-nav"></aside>
        <main class="pr-main"><header class="pr-head"><div class="pr-sec-t"></div><h1 class="pr-t"></h1><span class="spacer"></span><span class="pr-pt">${esc(d.patient.pseudo || '')} · ${esc(V.meeting[m.kind] || 'staff')} du ${esc(fmtDate(m.date))}</span></header>
          <div class="pr-body" tabindex="-1"></div>
          <footer class="pr-foot"><button data-a="prev" title="précédente (←)">‹</button><span class="pr-n"></span><button data-a="next" title="suivante (→)">›</button>
            <span class="hint">← → défiler · Échap : préparer · F : plein écran · N : plan</span><span class="spacer"></span>
            <button data-a="nav" title="afficher / masquer le plan (N)">☰ plan</button><button data-a="theme" title="fond clair pour un vidéoprojecteur">◐ ${this.ui.presLight ? 'sombre' : 'clair'}</button><button data-a="proj" class="proj-btn${document.body.classList.contains('proj') ? ' on' : ''}" title="projection : texte et tableaux agrandis (vidéoprojecteur, écran de présentation)">A+</button><button data-a="fs" title="plein écran (F)">⛶</button><button data-a="prep" title="retour à la préparation (Échap)">✎ Préparer</button></footer></main>`;
      el.hidden = false; document.body.classList.add('presenting');
      this.presentNav();
      const A = a => el.querySelector(`[data-a=${a}]`);
      A('prev').onclick = () => this.presentStep(-1); A('next').onclick = () => this.presentStep(1);
      A('nav').onclick = () => { this.ui.presNoNav = !this.ui.presNoNav; el.classList.toggle('nonav', this.ui.presNoNav); };
      A('theme').onclick = () => { this.ui.presLight = !this.ui.presLight; el.classList.toggle('light', this.ui.presLight); A('theme').textContent = '◐ ' + (this.ui.presLight ? 'sombre' : 'clair'); try { localStorage.setItem('sv_pres_light', this.ui.presLight ? '1' : '0'); } catch (e) { } };
      A('proj').onclick = () => { const on = !document.body.classList.contains('proj'); document.body.classList.toggle('proj', on); A('proj').classList.toggle('on', on); try { localStorage.setItem('sv_proj', on ? '1' : '0'); } catch (e) { } };
      try { if (localStorage.getItem('sv_proj') === '1') document.body.classList.add('proj'); } catch (e) { }
      A('fs').onclick = () => this.presentFullscreen(); A('prep').onclick = () => this.closePresentation();
      if (!this._presKey) this._presKey = e => this.presentKey(e);
      window.removeEventListener('keydown', this._presKey, true); window.addEventListener('keydown', this._presKey, true);
      this.presentShow(P.i);
    },
    /** plan (colonne de gauche) : sections, diapositives, médias d'une crise ; les captures se glissent sur une autre
     *  diapositive (elles la suivront : m.gallerySlots) */
    presentNav() {
      const P = this._pres, el = $('presentation'), nav = el && el.querySelector('.pr-nav'); if (!P || !nav) return; const d = this.dossier, m = P.m;
      const secs = []; P.slides.forEach((s, i) => { let g = secs[secs.length - 1]; if (!g || g.sec !== s.sec) secs.push(g = { sec: s.sec, items: [] }); g.items.push([s, i]); });
      nav.innerHTML = `<div class="pr-brand"><b>${esc(d.patient.pseudo || 'Patient')}</b><span>Staff du ${esc(fmtDate(m.date))}</span></div>
          ${secs.map(g => `<div class="pr-sec"><div class="pr-sec-h">${esc(g.sec)}</div>${g.items.map(([s, i]) => `<button data-i="${i}"${s.key ? ` data-key="${esc(s.key)}"` : ''}${s.gid ? ` data-gid="${s.gid}" draggable="true"` : ''} class="${s.hab ? 'hab' : ''}${s.kind === 'media' ? ' media' : ''}${s.kind === 'gal' ? ' gal' : ''}${s.sub ? ' sub' : ''}" title="${esc(s.title)}${s.gid ? ' — glisser sur une autre diapositive pour la déplacer' : ''}"><small>${i + 1}</small>${esc(s.short || s.title)}</button>${s.kind === 'media' ? `<div class="pr-sub" data-g="${esc(s.group)}">${s.media.map((x, k) => `<button data-i="${i}" data-mi="${k}" title="${esc(x.title || '')}">${/^video\//.test(x.mime || '') ? '▶' : '▣'} ${esc(x.title || (V.galleryKind[x.kind] || 'capture'))}</button>`).join('')}</div>` : ''}`).join('')}</div>`).join('')}`;
      nav.querySelectorAll('[data-i]').forEach(b => b.onclick = () => b.dataset.mi != null ? this.presentShow(+b.dataset.i, { mi: +b.dataset.mi }) : this.presentShow(+b.dataset.i));
      // glisser-déposer d'une capture : elle suit la diapositive où on la lâche
      nav.querySelectorAll('[data-gid]').forEach(b => b.ondragstart = e => { e.dataTransfer.setData('text/x-gid', b.dataset.gid); e.dataTransfer.effectAllowed = 'move'; nav.classList.add('dragging'); });
      nav.ondragend = () => { nav.classList.remove('dragging'); nav.querySelectorAll('.drop').forEach(x => x.classList.remove('drop')); };
      nav.querySelectorAll('[data-key]:not([data-gid])').forEach(b => {
        b.ondragover = e => { if ([...e.dataTransfer.types].includes('text/x-gid')) { e.preventDefault(); b.classList.add('drop'); } };
        b.ondragleave = () => b.classList.remove('drop');
        b.ondrop = e => { e.preventDefault(); b.classList.remove('drop'); const gid = e.dataTransfer.getData('text/x-gid'); if (!gid) return; m.gallerySlots = Object.assign({}, m.gallerySlots, { [gid]: b.dataset.key }); this.touch('meeting', m.id, 'capture déplacée dans le diaporama'); this.presentRebuild({ gid }); };
      });
    },
    /** plan recalculé (capture déplacée, décision ajoutée…) ; o.gid / o.key : diapositive à montrer ensuite */
    presentRebuild(o) {
      const P = this._pres; if (!P) return; o = o || {}; const cur = P.slides[P.i];
      P.slides = this.presentSlides(P.m); this.presentNav();
      let i = o.gid ? P.slides.findIndex(x => x.gid === o.gid) : o.key ? P.slides.findIndex(x => x.key === o.key) : -1;
      if (i < 0 && cur) i = P.slides.findIndex(x => x.key ? x.key === cur.key : x.gid === cur.gid);
      this.presentShow(i < 0 ? Math.min(P.i, P.slides.length - 1) : i);
    },
    closePresentation(o) {
      const P = this._pres; if (!P) return;
      this.presentCleanup(); this._pres = null;
      window.removeEventListener('keydown', this._presKey, true);
      const el = $('presentation'); el.hidden = true; el.innerHTML = ''; document.body.classList.remove('presenting');
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => { });
      if (!o || o.go !== false) this.go({ stage: 'meet:' + P.m.id, view: 'preparer' });
    },
    presentFullscreen() { if (document.fullscreenElement) { if (document.exitFullscreen) document.exitFullscreen().catch(() => { }); } else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => { }); },
    presentKey(e) {
      const P = this._pres; if (!P) return;
      if (document.querySelector('.modal:not([hidden])')) return;   // fenêtre ouverte (pièce jointe, annuaire) : le clavier lui revient
      const t = e.target, typing = t && /INPUT|SELECT|TEXTAREA/.test(t.tagName);
      if (typing) { if (e.key === 'Escape') { t.blur(); e.preventDefault(); e.stopPropagation(); } return; }
      if (t && t.closest && t.closest('.sv-slices') && /^Arrow|^Page/.test(e.key)) return;   // coupes : flèches et pages pour les coupes
      if (document.querySelector('.pop3d') && e.key !== 'Escape') return;   // vue 3D interactive ouverte : le clavier lui revient
      const k = e.key; let done = true;
      const lb = $('presentation').querySelector('.pr-zoom.lb'); if (lb && (k === 'ArrowRight' || k === 'ArrowLeft')) { lb._step(k === 'ArrowRight' ? 1 : -1); e.preventDefault(); e.stopPropagation(); return; }   // visionneuse des captures
      if ($('presentation').querySelector('.pr-pop') && k !== 'Escape') return;
      const cur = P.slides[P.i], vid = cur && cur.kind === 'media' && $('presentation').querySelector('.pr-mview video');
      if (k === ' ' && vid) { if (vid.paused) vid.play().catch(() => { }); else vid.pause(); }   // vidéo des médias : Espace = lecture / pause
      else if (k === 'ArrowRight' || k === 'PageDown' || k === ' ') this.presentStep(1);
      else if (k === 'ArrowLeft' || k === 'PageUp') this.presentStep(-1);
      else if (k === 'Home') this.presentShow(0); else if (k === 'End') this.presentShow(P.slides.length - 1);
      else if (k === 'Escape') { const pp = document.querySelector('.pop3d'), z = $('presentation').querySelector('.pr-zoom, .pr-pop'); if (pp && pp._close) pp._close(); else if (z) { if (z.classList.contains('pr-pop')) { const ok = z.querySelector('[data-a=ok]'); if (ok) ok.click(); else z.remove(); } else z.remove(); } else this.closePresentation(); }
      else if ((k === 'f' || k === 'F') && !e.ctrlKey && !e.metaKey) this.presentFullscreen();
      else if ((k === 'n' || k === 'N') && !e.ctrlKey && !e.metaKey) { const b = $('presentation').querySelector('[data-a=nav]'); if (b) b.click(); }
      else done = false;
      e.stopPropagation(); if (done) e.preventDefault();
    },
    /** coupes montées dans la diapositive : détruites en quittant la diapositive */
    presentCleanup() { if (this.slices && this._ipHost && this._ipHost.closest && this._ipHost.closest('#presentation')) { this.slices.destroy(); this.slices = null; this._ipHost = null; } this._slvForce = this._slvForceHost = null; },
    /** suivante / précédente : dans une diapositive de médias, d'abord le média suivant (ou précédent) */
    presentStep(dir) {
      const P = this._pres; if (!P) return; const s = P.slides[P.i];
      if (s && s.kind === 'media') { const k = s.mi + dir; if (k >= 0 && k < s.media.length) { this.presentMedia(s, k); return; } }
      const pg = P.pages; if (pg && pg.n > 1) { const k = pg.k + dir; if (k >= 0 && k < pg.n) { this.presentPage(k); return; } }   // v5.1 : pages d'une diapositive trop longue
      this.presentShow(P.i + dir, dir < 0 ? { fromEnd: true } : null);
    },
    async presentShow(i, o) {
      const P = this._pres; if (!P || !P.slides.length) return;
      i = Math.max(0, Math.min(P.slides.length - 1, i));
      const s = P.slides[i], el = $('presentation'), body = el.querySelector('.pr-body');
      if (s.kind === 'media') { if (o && o.mi != null) s.mi = Math.max(0, Math.min(s.media.length - 1, o.mi)); else s.mi = o && o.fromEnd && P.i > i ? s.media.length - 1 : 0; if (P.i === i && body.querySelector('.pr-media')) { this.presentMedia(s, s.mi); return; } }
      P.i = i; (this.ui.presentAt = this.ui.presentAt || {})[P.m.id] = i;
      el.querySelectorAll('.pr-nav .pr-sub').forEach(x => x.classList.toggle('open', !!s.group && x.dataset.g === s.group));
      this.presentCleanup();
      el.querySelector('.pr-sec-t').textContent = s.sec; el.querySelector('.pr-t').textContent = s.title; el.querySelector('.pr-n').textContent = `${i + 1} / ${P.slides.length}`;
      el.querySelectorAll('.pr-nav [data-i]').forEach(b => b.classList.toggle('on', +b.dataset.i === i && (b.dataset.mi == null || (s.kind === 'media' && +b.dataset.mi === s.mi))));
      const on = el.querySelector('.pr-nav .on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
      el.querySelector('[data-a=prev]').disabled = i === 0; el.querySelector('[data-a=next]').disabled = i === P.slides.length - 1;
      body.className = 'pr-body k-' + (s.kind || 'doc'); body.innerHTML = ''; body.scrollTop = 0;
      const tok = ++P.tok, alive = () => this._pres === P && P.tok === tok; P.pages = null;
      try { await s.render(body, alive); } catch (e) { console.error(e); if (alive()) body.insertAdjacentHTML('beforeend', `<div class="hint">Diapositive indisponible : ${esc(e.message)}</div>`); }
      if (alive()) this.presentPaginate(body, s, o && o.fromEnd && !(s.kind === 'media'));
      // vues des diapositives voisines préparées à l'avance
      if (alive()) for (const j of [i + 1, i + 2]) { const n = P.slides[j]; if (n && n.prefetch) n.prefetch(); }
    },
    /** v5.1 — pas d'ascenseur : une diapositive plus haute que l'écran est coupée en pages (← → les parcourent), entre ses
     *  blocs (cartes, titres, tableaux, paragraphes) ; une vue interactive (coupes, médias, captures) n'est jamais coupée */
    presentPaginate(body, s, last) {
      const P = this._pres; if (!P) return; P.pages = null; body.classList.remove('paged'); body.querySelectorAll('.pg-off, .pg-hid').forEach(x => x.classList.remove('pg-off', 'pg-hid'));
      if (P._mo) { P._mo.disconnect(); P._mo = null; }
      if (['img', 'media', 'gal'].includes(s.kind) || body.querySelector('.sv-slices, video, .pr-ip')) return;
      // contenu chargé plus tard (vues 3D, vignettes) : pages recalculées, la page courante gardée
      const mo = P._mo = new MutationObserver(() => { clearTimeout(P._moT); P._moT = setTimeout(() => { if (this._pres !== P || P.slides[P.i] !== s || P._mo !== mo) return; const k = P.pages ? P.pages.k : 0; this.presentPaginate(body, s); if (P.pages) this.presentPage(Math.min(k, P.pages.n - 1)); }, 250); });
      mo.observe(body, { childList: true, subtree: true });
      body.querySelectorAll('img').forEach(im => { if (!im.complete) im.addEventListener('load', () => mo.takeRecords && P._mo === mo && (clearTimeout(P._moT), P._moT = setTimeout(() => { if (P._mo !== mo) return; const k = P.pages ? P.pages.k : 0; this.presentPaginate(body, s); if (P.pages) this.presentPage(Math.min(k, P.pages.n - 1)); }, 250)), { once: true }); });
      const H = body.clientHeight - 12; if (body.scrollHeight <= H + 4 || H < 200) return;
      // blocs : on descend dans les conteneurs jusqu'à des éléments qui tiennent dans une page
      const blocks = [], walk = (node, depth) => { for (const c of node.children) { if (c.offsetParent === null) continue; if (c.offsetHeight > H * 0.9 && c.children.length > 1 && depth < 5 && !/^(TABLE|SVG|IMG|FIGURE|CANVAS)$/i.test(c.tagName)) walk(c, depth + 1); else blocks.push(c); } };
      walk(body, 0); if (blocks.length < 2) return;
      const top0 = body.getBoundingClientRect().top - body.scrollTop, pages = []; let start = null, cur = [];
      const head = b => /^H[1-6]$/.test(b.tagName) || b.classList.contains('pr-lbl') || b.classList.contains('tb-h');
      for (const b of blocks) {
        const r = b.getBoundingClientRect(), t = r.top - top0, bt = t + r.height; if (start == null) start = t;
        if (cur.length && bt - start > H) { const carry = []; while (cur.length > 1 && head(cur[cur.length - 1])) carry.unshift(cur.pop()); pages.push(cur); cur = carry; start = carry.length ? carry[0].getBoundingClientRect().top - top0 : t; }   // v5.2 : un titre suit le paragraphe qu'il annonce
        cur.push(b);
      }
      if (cur.length) pages.push(cur); if (pages.length < 2) return;
      P.pages = { n: pages.length, k: 0, list: pages }; body.classList.add('paged'); this.presentPage(last ? pages.length - 1 : 0);
    },
    presentPage(k) {
      const P = this._pres, pg = P && P.pages; if (!pg) return; pg.k = k = Math.max(0, Math.min(pg.n - 1, k));
      const show = new Set(pg.list[k]); pg.list.flat().forEach(b => { b.classList.toggle('pg-off', !show.has(b)); });
      // un conteneur dont tous les blocs sont cachés est caché aussi (titres de cartes vides)
      const el = $('presentation'), body = el.querySelector('.pr-body'); body.scrollTop = 0;
      body.querySelectorAll('.pg-hid').forEach(x => x.classList.remove('pg-hid'));
      const cont = new Set(pg.list.flat().map(b => b.parentElement)); for (const c of cont) if (c !== body && [...c.children].every(x => x.classList.contains('pg-off') || x.offsetParent === null)) c.classList.add('pg-hid');
      el.querySelector('.pr-n').textContent = `${P.i + 1} / ${P.slides.length} · page ${k + 1}/${pg.n}`;
      el.querySelector('[data-a=next]').disabled = P.i === P.slides.length - 1 && k === pg.n - 1; el.querySelector('[data-a=prev]').disabled = P.i === 0 && k === 0;
    },
    /** calcul mis en cache (vues 3D) ; exécuté dans la file de la vue 3D, abandonné si la présentation est fermée */
    presentAsset(key, fn) {
      const C = this._presCache || (this._presCache = new Map());
      if (C.has(key)) return C.get(key);
      const p = this.viewerTask(async () => this._pres ? await fn() : null).then(r => { if (r == null) C.delete(key); return r; }, e => { console.error(e); C.delete(key); return null; });
      C.set(key, p); return p;
    },
    /** quitte la présentation pour revoir une crise, une SEEG… ; « ← Retour à la présentation » ramène à la même diapositive */
    async presentReview(loc, present, then) {
      const P = this._pres; if (!P) return;
      this.ui.presentBack = { meetingId: P.m.id, i: P.i };
      this.closePresentation({ go: false });
      const q = (this._vq || Promise.resolve()).catch(() => { }), slow = setTimeout(() => this.toast('Vue 3D : fin du calcul en cours (vues du diaporama)…', 4000), 600);
      await q; clearTimeout(slow);   // une vue du diaporama en cours de calcul rejoue la crise dans l'espace de travail : on attend qu'elle ait rendu la main
      this.go(loc); if (present) { this.present(true); setTimeout(() => this.presentReviewMedia(), 500); }
      if (then) setTimeout(then, 300);   // ex. ouvrir le tracé à l'instant montré (recReview)
      this.showPresentBack();
    },
    /** v5.1 — crise revue depuis le diaporama : vidéo liée (calée sur la frise) et tracé de la crise (barre de lecture) ouverts d'office */
    presentReviewMedia() {
      if (!this.ui.present) return;
      const sz = this.videoSeizure && this.videoSeizure(), g = sz && this.videoLinked && this.videoLinked(sz);
      if (g && !this._vid && this.videoOpen) this.videoOpen(g);
      if (this.traceAvailable && this.traceAvailable() && this.traceToggle && (!this._tr || this._tr.el.hidden)) this.traceToggle(true).then(() => this.setTime(this.ui.t || 0));
    },
    showPresentBack() {
      let b = $('presentBack'); if (!b) { b = h('div', 'present-back'); b.id = 'presentBack'; document.body.appendChild(b); }
      b.innerHTML = '<button class="primary">← Retour à la présentation</button><button class="x" title="masquer">✕</button>'; b.hidden = false;
      b.querySelector('.primary').onclick = () => { const r = this.ui.presentBack; if (r && this.dossier && S.byId(this.dossier.meetings, r.meetingId)) this.go({ stage: 'meet:' + r.meetingId, view: 'presenter' }); else this.clearPresentBack(); };
      b.querySelector('.x').onclick = () => this.clearPresentBack();
    },
    clearPresentBack() { if (this.ui) this.ui.presentBack = null; const b = $('presentBack'); if (b) b.hidden = true; },

    // ================================================================ plan de la présentation
    presentSlides(m) {
      // ordre : Patient · Bilans · EEG de chaque phase 1 (intercritique, chaque crise et ses médias, synthèse) · chaque SEEG ·
      // Chirurgie (staff après une intervention) · Discussion (concordance, hypothèses) · Proposition (décisions, conclusion)
      const d = this.dossier, scope = this.staffScope(m), cons = this.consensus(scope), out = [];
      this._scope = scope; this._cons = cons;
      const add = (sec, title, render, o) => out.push(Object.assign({ sec, title, render }, o || {}));
      const exams = (d.exams || []).filter(x => !m.date || !x.date || String(x.date) <= String(m.date)), ex1 = scope.explorations.filter(e => e.kind !== 'seeg');
      const slots = m.gallerySlots || {}, galList = this.presentGalleryList(m, scope), gal = galList.filter(g => !g.examId && !slots[g.id]), placed = galList.filter(g => slots[g.id] && slots[g.id] !== 'none');
      const galItem = (sec, g, title) => ({ sec, title: title || g.title || 'Tracé', render: (el, alive) => this.prGalleryItem(el, g, alive), short: '· ' + (title || g.title || 'tracé'), kind: 'gal', gid: g.id });
      const galSlide = (sec, g, title) => out.push(galItem(sec, g, title));
      // médias d'une crise : une diapositive, vidéo d'abord puis captures, en diaporama ; dans le plan, la liste des médias
      // se déroule sous la crise quand on est sur elle
      const isVid = g => /^video\//.test(g.mime || '');
      const mediaOf = (sz, Gz) => { const lk = sz.video && sz.video.galleryId && S.byId(d.gallery || [], sz.video.galleryId), L = Gz.slice(); if (lk && !L.includes(lk)) L.unshift(lk); return L.filter(isVid).sort((a, b) => (b === lk) - (a === lk)).concat(L.filter(g => !isVid(g))); };
      const mediaSlide = (sec, sz, Gz) => { const media = mediaOf(sz, Gz); if (!media.length) return; const sl = { sec, title: `Médias · ${sz.label}`, short: `· Médias (${media.length})`, kind: 'media', media, mi: 0, group: sz.id }; sl.render = (el, alive) => this.prMedia(el, sl, alive); out.push(sl); };
      // patient : développement, antécédents, mode de vie, histoire de l'épilepsie, examen (v5.2 : une page chacun)
      add('Patient', 'Présentation', el => this.prTitle(el, m), { short: 'Présentation', key: 'title' });
      const D = this.devParts ? this.devParts(d) : null, H = this.historyParts(d, { skipAnt: D ? ['pregnancy', 'perinatal'] : [] });
      if (D) add('Patient', 'Grossesse et développement', el => this.prDev(el, D), { short: 'Développement', key: 'dev' });
      if (H.antPers || H.antMed || H.comorb || H.family || H.lat) add('Patient', 'Antécédents', el => this.prAntecedents(el, H), { key: 'history' });
      if (H.life) add('Patient', 'Contexte et mode de vie', el => this.prDoc(el, H.life), { short: 'Mode de vie', key: 'life' });
      if (H.hx || H.tt) add('Patient', 'Histoire de l’épilepsie', el => this.prDoc(el, H.hx + (H.tt ? `<h3>Traitements</h3>${H.tt}` : '')), { key: 'hx' });
      if (H.exam) add('Patient', 'Examen clinique', el => this.prDoc(el, H.exam), { short: 'Examen', key: 'exam' });
      // bilans : vidéo-EEG, neuropsychologie, imagerie (captures des comptes rendus en vignettes), bilans complémentaires
      const of = k => exams.filter(x => [].concat(k).includes(x.kind));
      const veegX = of(['veeg', 'eeg']), npX = of('neuropsy'), imgX = of(['mri', 'pet', 'spect', 'meg']);
      if (veegX.length) add('Bilans', 'Vidéo-EEG', (el, alive) => this.prExams(el, veegX, alive), { short: 'Vidéo-EEG', key: 'x:veeg' });
      gal.filter(g => !g.explorationId && !g.seizureId).forEach(g => galSlide('Bilans', g));
      if (npX.length) add('Bilans', 'Neuropsychologie', (el, alive) => this.prExams(el, npX, alive), { short: 'Neuropsychologie', key: 'x:np' });
      if (d.imaging.length || d.lesions.length || imgX.length) add('Bilans', 'Imagerie', (el, alive) => this.prImaging(el, imgX, alive), { kind: 'img', key: 'img' });
      for (const [k, lbl] of [['psy', 'Psychiatrie'], ['wada', 'Test de Wada'], ['fmri', 'IRMf'], ['other', 'Autres bilans']]) { const X = of(k); if (X.length) add('Bilans', lbl, (el, alive) => this.prExams(el, X, alive), { short: lbl, key: 'x:' + k }); }
      // EEG de chaque exploration non invasive : intercritique (captures en galerie), chaque crise et ses médias, synthèse
      for (const ex of ex1) {
        const sec = 'EEG ' + ex.label, szs = scope.seizures.filter(x => x.ex === ex), inter = galList.filter(g => g.explorationId === ex.id && !g.seizureId && !g.examId);
        const hasCr = ex.eeg && (P1_EEG.some(([k]) => ex.eeg[k]) || (SV.EegCR && SV.EegCR.crHTML(ex)));
        if (hasCr || inter.length) add(sec, 'EEG intercritique', (el, alive) => this.prEegInter(el, ex, inter, alive), { short: 'EEG intercritique', key: 'eegint:' + ex.id });
        // v5.5 : imagerie de source des pointes juste après l'analyse visuelle de l'intercritique, avant les crises
        if ((ex.esi || []).some(r => r.kind === 'spike') && this.prEsi) add(sec, 'Pointes intercritiques : types et sources', (el, alive) => this.prEsi(el, ex, alive, 'spike'), { short: 'Sources intercritiques', key: 'esi:sp:' + ex.id });
        szs.forEach(({ sz }) => {
          add(sec, sz.label, (el, alive) => this.prSeizure(el, sz, ex, alive), { short: sz.label, hab: sz.habitual === 'yes', kind: 'sz', group: sz.id, key: 'sz:' + sz.id, prefetch: () => this.presentSeizureAsset(sz) });
          mediaSlide(sec, sz, gal.filter(g => g.seizureId === sz.id));
        });
        if (szs.length) { const sc = { ids: [ex.id], seizures: szs, explorations: [ex] }; add(sec, 'Synthèse des crises', (el, alive) => this.prSzSynth(el, sc, alive), { short: 'Synthèse', kind: 'syn', key: 'syn:' + ex.id, prefetch: () => this.presentSynthAsset(this.consensus(sc)) }); }
        if ((ex.esi || []).some(r => r.kind !== 'spike') && this.prEsi) add(sec, 'Début des crises : sources', (el, alive) => this.prEsi(el, ex, alive, 'ictal'), { short: 'Sources critiques', key: 'esi:' + ex.id });
      }
      // SEEG, puis l'intervention (staff après une chirurgie) — present_seeg.js
      if (this.presentSeegSlides) this.presentSeegSlides(m, scope, { add, gal, galList, galSlide, mediaSlide });
      if (this.presentSurgerySlides) this.presentSurgerySlides(m, add);
      // discussion
      add('Discussion', 'Concordance anatomo-électro-clinique', el => this.prConcordance(el, m, scope, cons), { short: 'Concordance', key: 'concord' });
      this.meetingHypotheses(m).forEach((Hy, i) => add('Discussion', `H${i + 1} · ${Hy.title}`, (el, alive) => this.prHypothesis(el, Hy, i, alive), { short: `H${i + 1} ${Hy.title}`, kind: 'hyp', key: 'hyp:' + (Hy.id || i), prefetch: () => this.presentHypAsset(Hy, i) }));
      // proposition
      d.decisions.filter(x => x.meetingId === m.id).forEach(x => add('Proposition', 'Décision : ' + (V.decision[x.type] || x.type), (el, alive) => this.prDecision(el, m, x, alive), { short: V.decision[x.type] || x.type, kind: 'dec', key: 'dec:' + x.id, prefetch: () => this.presentDecisionAsset(x) }));
      add('Proposition', 'Conclusion', el => this.prConclusion(el, m), { short: 'Conclusion', key: 'concl' });
      // captures placées à la main (plan : glisser une capture sur une diapositive) : chacune suit la diapositive choisie ;
      // si cette diapositive n'existe plus, la capture reprend sa place automatique (après les bilans)
      for (const g of placed) {
        let i = out.findIndex(x => x.key === slots[g.id]); if (i < 0) { i = out.findIndex(x => x.sec !== 'Patient' && x.sec !== 'Bilans') - 1; if (i < 0) i = out.length - 1; }
        while (out[i + 1] && out[i + 1].kind === 'gal' && out[i + 1].placedAfter === slots[g.id]) i++;
        out.splice(i + 1, 0, Object.assign(galItem(out[i].sec, g), { placedAfter: slots[g.id] }));
      }
      return out;
    },
    /** vues de synthèse des crises d'un groupe (présentation) */
    presentSynthAsset(cons) { return this.presentAsset('synth:' + this.synthSig(cons), () => this.synthShots(cons, { nHyp: 3, shot: { scale: 1.5, crop: true, format: 'jpeg', quality: 0.88 } })); },
    /** emplacements possibles d'une capture dans le diaporama : les diapositives (hors captures et médias), avec leur section */
    presentSlotOptions(m) {
      const seen = new Set(), out = [];
      for (const s of this.presentSlides(m)) if (s.key && !seen.has(s.key)) { seen.add(s.key); out.push({ key: s.key, sec: s.sec, title: s.title }); }
      return out;
    },
    /** captures cochées dans « Préparer » ; sans sélection, toutes celles des explorations prises en compte */
    presentGalleryList(m, scope) {
      const d = this.dossier, G = d.gallery || [], ids = m.galleryIds || [];
      const L = ids.length ? ids.map(id => S.byId(G, id)).filter(Boolean) : G.filter(g => !g.explorationId || scope.ids.includes(g.explorationId));
      return L.slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    },
    /** barre des vues 3D d'une carte : « clic : en grand » puis le bouton de la visionneuse, en bas à droite */
    presentV3Bar(title) { return `<div class="pr-vact v3"><span class="muted small">clic sur une vue : en grand</span><button class="mini-btn" data-a="v3" title="${esc(title || 'vue 3D manipulable (tourner, zoomer)')}">⟲ vue 3D</button></div>`; },

    // ================================================================ diapositives : patient
    prTitle(el, m) {
      const d = this.dossier, P = d.patient, C = P.clin || {}, F = P.sex === 'F', age = P.birthYear ? new Date(m.date || Date.now()).getFullYear() - (+P.birthYear) : null;
      const line = [F ? 'Patiente' : P.sex === 'M' ? 'Patient' : 'Patient(e)', age != null ? age + ' ans' : '', P.handedness ? (F ? { R: 'droitière', L: 'gauchère', A: 'ambidextre' } : V.handedness)[P.handedness] : '', S.onsetText(P) ? 'premières crises à ' + S.onsetText(P) : ''].filter(Boolean).join(' · ');
      // fréquence des crises connue à la date du staff (historique daté), sinon la fréquence actuelle signalée comme telle
      const fh = ((C.freqHistory || []).filter(x => x.date && x.text && String(x.date) <= String(m.date || '9999')).sort((a, b) => String(a.date).localeCompare(String(b.date))).pop());
      const freq = fh ? [`Fréquence des crises (${S.fmtPartial(fh.date)})`, fh.text] : [`Fréquence actuelle des crises${P.frequencyDate ? ' (' + S.fmtPartial(P.frequencyDate) + ', postérieure au staff)' : ''}`, P.frequency];
      const facts = [['Étiologie', S.etiologyText(P)], ['IRM', P.mri ? V.mri[P.mri] : ''], freq, ['Traitement actuel', P.aeds], ['Dominance du langage', P.dominant ? V.dominance[P.dominant] + (P.dominanceMethod ? ' (' + V.dominanceMethod[P.dominanceMethod] + ')' : '') : ''], ['Types de crises', C.seizureTypes]].filter(([, v]) => v);
      const all = this.parcours(), j = all.findIndex(x => x.key === 'meet:' + m.id), st = all.slice(1, j + 1);   // étapes jusqu'à ce staff
      // v5.2 : personnes présentes en badges (annuaire : celles cochées dans « Préparer », ou les membres habituels du staff)
      const PP = SV.People, ppl = PP ? PP.idsOf(m).map(id => PP.byId(id)).filter(Boolean) : [], extra = m.participantsExtra != null ? m.participantsExtra : ppl.length ? '' : m.participants;
      const part = ppl.map(u => `<span class="pchip-p on">${esc(PP.label(u, true))}<small>${esc(PP.role(u))}</small></span>`).join('') + (extra ? `<span class="pr-pext">${esc(extra)}</span>` : '');
      el.innerHTML = `<div class="pr-hero"><div class="pr-name">${esc(P.pseudo || 'Patient')}</div><div class="pr-line">${esc(line)}</div>
        <div class="pr-meet">${esc(V.meeting[m.kind] || 'Staff')} · ${esc(fmtDate(m.date))}</div><div class="pr-ppl">${part || '<i class="muted">participants</i>'}<button class="mini-btn pr-edit" data-a="part" title="modifier les personnes présentes">✎</button></div>
        ${m.question ? `<div class="pr-q"><span>Question posée</span>${br(m.question)}</div>` : ''}
        ${facts.length ? `<div class="pr-facts">${facts.map(([l, v]) => `<div><span>${esc(l)}</span><b>${br(v)}</b></div>`).join('')}</div>` : ''}
        ${st.length ? `<div class="pr-path">${st.map(x => `<div class="pr-step k-${x.kind}${x.key === 'meet:' + m.id ? ' cur' : ''}"><b>${esc(x.label)}</b><div>${this.stageSummary(x)}</div></div>`).join('<i>→</i>')}</div>` : ''}</div>`;
      el.querySelector('[data-a=part]').onclick = () => {
        if (!this.peopleChips) { this.presentInlineEdit(el.querySelector('.pr-ppl'), m.participants || '', v => { m.participants = v; this.touch('meeting', m.id, 'participants'); }, { single: true }); return; }
        const box = h('div', 'pr-pop', '<div class="pr-pop-card"><div class="pr-lbl">Personnes présentes</div><div class="ppl-chips"></div><div class="btnrow"><span class="spacer"></span><button class="pr-btn" data-a="ok">Fermer</button></div></div>');
        $('presentation').appendChild(box); this.peopleChips(box.querySelector('.ppl-chips'), m, () => this.touch('meeting', m.id, 'participants'));
        const close = () => { box.remove(); if (this._pres) this.presentShow(this._pres.i); };
        box.querySelector('[data-a=ok]').onclick = close; box.onclick = e => { if (e.target === box) close(); };
      };
    },
    prDoc(el, html) { el.innerHTML = `<div class="pr-doc">${html}</div>`; },
    /** grossesse, naissance et développement sur une page : textes et tableaux à gauche, courbes (acquisitions, croissance) à droite */
    prDev(el, D) {
      const right = (D.nMs ? `<figure class="ms"><figcaption>Acquisitions psychomotrices</figcaption>${D.ms}</figure>` : '') + D.charts.join('');
      el.innerHTML = `<div class="pr-doc pr-dev${right ? '' : ' one'}"><div>${D.text.join('')}</div>${right ? `<div class="pr-devc">${right}</div>` : ''}</div>`;
    },
    /** antécédents : personnels, médico-chirurgicaux, comorbidités, latéralité à gauche ; familiaux (arbre) à droite */
    prAntecedents(el, H) {
      const L = (H.antPers ? `<h3>Antécédents personnels</h3>${H.antPers}` : '') + (H.antMed ? `<h4>Antécédents médico-chirurgicaux notables</h4>${H.antMed}` : '') + (H.comorb ? `<h4>Comorbidités</h4>${H.comorb}` : '') + (H.lat ? `<h3>Latéralité et dominance</h3>${H.lat}` : '');
      const R = H.family ? `<h3>Antécédents familiaux</h3>${H.famLine}${H.pedSvg ? `<div class="ped-rep">${H.pedSvg}</div>` : ''}${H.pedNotes}` : '';
      el.innerHTML = `<div class="pr-doc pr-2c pr-ant">${L ? `<div>${L}</div>` : ''}${R ? `<div>${R}</div>` : ''}</div>`;
    },

    // ================================================================ crises
    /** v5.2 — frise de l'exploration (phase 1, SEEG) : jours, crises (couleur = type, plein = sommeil), stimulations,
     *  thermocoagulations, changements de traitement — pour voir le lien des crises avec le sevrage, les stimulations… */
    presentTimeline(ex, szs) {
      const d = this.dossier, day = 864e5, tOf = s => { if (!s) return NaN; const t = Date.parse(String(s).length <= 10 ? s + 'T12:00:00' : s); return t; };
      const types = ex.szTypes || [], TC = ['#4cc9f0', '#f2994a', '#b18cff', '#7bd389', '#ff5ad1', '#e8d44d'], col = sz => { const i = types.findIndex(t => t.id === sz.typeId); return i >= 0 ? TC[i % TC.length] : '#8aa0b8'; };
      let S0 = szs.map(sz => ({ sz, t: tOf(sz.datetime) })).filter(x => isFinite(x.t));
      let stims = (ex.stims || []).map(s => ({ t: tOf(s.t), sz: !!s.sz, ad: !!s.ad })).filter(x => isFinite(x.t)), th = (ex.thermo || []).filter(t => S.thermoStatusOf(t) === 'done').map(t => ({ t: tOf(t.date) })).filter(x => isFinite(x.t));
      if (!S0.length && !stims.length && !th.length) return '';
      // période : dates de l'exploration (sinon celle des crises) ; un évènement daté hors de la période (date saisie par
      // défaut, à vérifier) n'étire pas la frise : il est seulement compté
      const dayOf = t => new Date(new Date(t).toDateString()).getTime(), sT = S0.map(x => x.t);
      let t0 = tOf(ex.start), t1 = tOf(ex.end);
      if (!isFinite(t0)) t0 = sT.length ? Math.min(...sT) : Math.min(...stims.concat(th).map(x => x.t));
      if (!isFinite(t1)) t1 = sT.length ? Math.max(...sT, t0) : t0 + 14 * day;
      t0 = dayOf(t0) - (isFinite(tOf(ex.start)) ? 0 : day); t1 = dayOf(t1) + day; if (t1 - t0 > 90 * day) t1 = t0 + 90 * day;
      const inP = x => x.t >= t0 && x.t <= t1, nOut = [S0, stims, th].reduce((n, L) => n + L.filter(x => !inP(x)).length, 0);
      S0 = S0.filter(inP); stims = stims.filter(inP); th = th.filter(inP);
      const aed = (d.aedHistory || []).map(a => ({ t: tOf(a.date), a })).filter(inP);
      const rows = [['Crises', 'sz'], stims.length ? ['Stimulations', 'st'] : null, th.length ? ['Thermocoag.', 'tc'] : null, aed.length ? ['Traitement', 'tt'] : null].filter(Boolean);
      const W = 1000, L = 112, R = 12, top = 22, rh = 26, Hh = top + rows.length * rh + 6, X = t => L + (W - L - R) * (t - t0) / Math.max(day, t1 - t0), Y = k => top + rows.findIndex(r => r[1] === k) * rh + rh / 2;
      let g = ''; const nD = Math.round((t1 - t0) / day), stp = nD > 24 ? 7 : nD > 12 ? 2 : 1;
      for (let k = 0; k <= nD; k++) { const x = X(t0 + k * day); g += `<line x1="${x}" x2="${x}" y1="${top - 4}" y2="${Hh - 4}" class="tl-g"/>`; if (k < nD && k % stp === 0) g += `<text x="${x + 3}" y="${top - 8}" class="tl-d">J${k + 1} · ${new Date(t0 + k * day + day / 2).toLocaleDateString(SV.LOC, { day: '2-digit', month: '2-digit' })}</text>`; }
      rows.forEach(([l, k]) => { g += `<text x="4" y="${Y(k) + 4}" class="tl-r">${l}</text>`; });
      for (const s of stims) g += `<line x1="${X(s.t)}" x2="${X(s.t)}" y1="${Y('st') - 7}" y2="${Y('st') + 7}" class="tl-st${s.sz ? ' sz' : s.ad ? ' ad' : ''}"/>`;
      for (const s of th) g += `<rect x="${X(s.t) - 3}" y="${Y('tc') - 6}" width="6" height="12" rx="2" class="tl-tc"/>`;
      for (const { t, a } of aed) g += `<path d="M${X(t)} ${Y('tt') + 7}V${Y('tt') - 8}l9 3.5-9 3.5" class="tl-tt"><title>${esc(S.fmtPartial(a.date) + ' : ' + a.text)}</title></path>`;
      let xPrev = -1e9; for (const { sz, t } of S0.sort((a, b) => a.t - b.t)) {   // crises rapprochées : côte à côte
        const c = col(sz), sl = sz.vigilance === 'sleep', n = (String(sz.label).match(/\d+/) || [''])[0], x = xPrev = Math.max(X(t), xPrev + 16);
        g += `<g class="tl-sz"><title>${esc(sz.label + ' · ' + fmtDT(sz.datetime) + (sz.vigilance ? ' · ' + V.vigilance[sz.vigilance] : '') + (sz.habitual === 'yes' ? ' · habituelle' : ''))}</title><circle cx="${x}" cy="${Y('sz')}" r="7" fill="${sl ? c : 'none'}" stroke="${c}" stroke-width="${sz.habitual === 'yes' ? 3 : 2}"/>${n ? `<text x="${x}" y="${Y('sz') - 10}" class="tl-n">${n}</text>` : ''}</g>`;
      }
      const leg = `<span><i class="o"></i>veille</span><span><i class="f"></i>sommeil</span><span><i class="h"></i>habituelle (trait épais)</span>${types.length ? types.map((t, i) => `<span><i class="f" style="background:${TC[i % TC.length]};border-color:${TC[i % TC.length]}"></i>${esc(t.label)}</span>`).join('') : ''}${stims.length ? '<span><b class="st sz"></b>stimulation → crise</span><span><b class="st ad"></b>→ post-décharge</span>' : ''}${nOut ? `<span class="warn-t">${nOut} évènement${nOut > 1 ? 's' : ''} daté${nOut > 1 ? 's' : ''} hors de l’exploration (dates à vérifier)</span>` : ''}`;
      return `<div class="pr-tl"><svg viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="xMidYMid meet">${g}</svg><div class="pr-tl-leg">${leg}</div></div>`;
    },
    /** ligne des totaux : crises, veille, sommeil, habituelles, par type */
    presentSzCounts(ex, szs) {
      const n = k => szs.filter(z => z.vigilance === k).length, hab = szs.filter(z => z.habitual === 'yes').length, types = (ex.szTypes || []).map(t => [t, szs.filter(z => z.typeId === t.id).length]).filter(([, k]) => k);
      return `<div class="pr-chips pr-tot"><span class="pr-chip big"><b>${szs.length}</b> crise${szs.length > 1 ? 's' : ''}</span>${n('wake') ? `<span class="pr-chip">${n('wake')} en veille</span>` : ''}${n('sleep') ? `<span class="pr-chip">${n('sleep')} en sommeil</span>` : ''}${szs.length - n('wake') - n('sleep') ? `<span class="pr-chip">${szs.length - n('wake') - n('sleep')} vigilance non précisée</span>` : ''}${hab ? `<span class="pr-chip ok">${hab} habituelle${hab > 1 ? 's' : ''}</span>` : ''}${types.map(([t, k]) => `<span class="pr-chip">${esc(t.label)} : ${k}</span>`).join('')}</div>`;
    },
    /** v5.2 — synthèse des crises d'une exploration sur une page : totaux, frise de l'exploration, puis par type de crise (s'il y
     *  en a) : latéralisation, origines, hypothèses récurrentes et crises à gauche ; vues (régions candidates, réseaux) à droite */
    prSzSynth(el, scope, alive) {
      const ex = scope.explorations[0], d = this.dossier, A = this.atlas, all = S.seizuresOfExploration(d, ex.id), ui = this.ui.prSynTy = this.ui.prSynTy || {};
      const types = (ex.szTypes || []).filter(t => scope.seizures.some(({ sz }) => sz.typeId === t.id)), ty = types.some(t => t.id === ui[ex.id]) ? ui[ex.id] : types.length ? types[0].id : '';
      const grp = scope.seizures.filter(({ sz }) => !ty || sz.typeId === ty), cons = this.consensus({ ids: scope.ids, seizures: grp, explorations: scope.explorations });
      const pL = Math.round(cons.pL * 100), top = []; for (let i = 1; i < A.N; i++) if (cons.region[i] >= 0.2) top.push(i); top.sort((a, b) => cons.region[b] - cons.region[a]);
      const mx = Math.max(1e-6, ...top.map(i => cons.region[i])), hab = grp.filter(x => x.sz.habitual === 'yes').length;
      el.innerHTML = `${this.presentSzCounts(ex, all)}${this.presentTimeline(ex, all)}
        ${types.length > 1 ? `<div class="seg pr-tabs pr-sytabs">${types.map(t => `<button data-ty="${t.id}" class="${t.id === ty ? 'on' : ''}">${esc(t.label)} (${scope.seizures.filter(x => x.sz.typeId === t.id).length})</button>`).join('')}</div>` : ''}
        <div class="pr-card pr-model"><div class="pr-2c"><div>
          <div class="pr-lbl">Latéralisation clinique <span class="muted">${cons.n} crise${cons.n > 1 ? 's' : ''}${types.length === 1 ? ' · ' + esc(types[0].label) : ''}${hab ? `, dont ${hab} habituelle${hab > 1 ? 's' : ''} (comptées double)` : ''}</span></div>
          <div class="lat-bar big"><span class="L" style="width:${pL}%">G ${pL} %</span><span class="R" style="width:${100 - pL}%">D ${100 - pL} %</span></div>
          <div class="pr-lbl">Origines candidates</div>${top.slice(0, 5).map(i => `<div class="pr-bar"><span>${esc(A.label(i))}</span><i style="width:${cons.region[i] / mx * 100}%"></i><b>${cons.region[i].toFixed(2)}</b></div>`).join('') || '<div class="hint">—</div>'}
          <div class="pr-lbl">Hypothèses récurrentes du modèle</div>${cons.hyps.slice(0, 3).map((x, k) => `<div class="pr-row"><b style="color:${SV.hypCss(k)}">H${k + 1}</b> <b>${esc(x.name)}</b> ${x.hemi === 'L' ? 'gauche' : 'droit'} <span class="muted">· H1 dans ${x.top}/${cons.n}, présente dans ${x.n}</span></div>`).join('') || '<div class="hint">—</div>'}
          <div class="pr-lbl">Crises</div><div class="pr-szl">${grp.map(({ sz }) => `<button class="pr-szb" data-sz="${sz.id}" title="${esc(sz.events.slice().sort((a, b) => a.t - b.t).map(e => (this.db.signById.get(e.sign_id) || {}).label_fr || e.sign_id).join(' → '))}"><b>${esc(sz.label)}</b> <span class="muted">${esc(fmtDT(sz.datetime))}${sz.vigilance ? ' · ' + esc(V.vigilance[sz.vigilance]) : ''}</span>${sz.habitual === 'yes' ? ' <span class="pr-chip ok">hab.</span>' : ''}</button>`).join('')}</div></div>
          <div class="pr-synr"><div class="seg pr-tabs pr-syn-tabs"></div><div class="pr-syn-imgs"><div class="pr-wait">vues 3D…</div></div><div class="pr-syn-info muted small"></div>${this.presentV3Bar()}</div></div></div>`;
      el.querySelectorAll('[data-ty]').forEach(b => b.onclick = () => { ui[ex.id] = b.dataset.ty; this.prSzSynth(el, scope, alive); });
      el.querySelectorAll('[data-sz]').forEach(b => b.onclick = () => { const P = this._pres, i = P ? P.slides.findIndex(x => x.key === 'sz:' + b.dataset.sz) : -1; if (i >= 0) this.presentShow(i); });
      if (cons.n) this.presentSynthViews(el, cons, alive || (() => true)); else el.querySelector('.pr-synr').innerHTML = '<div class="hint">Aucune crise avec sémiologie.</div>';
    },
    /** vues de la synthèse : onglets « régions candidates » puis chaque hypothèse récurrente ; vue 3D de l'onglet affiché */
    async presentSynthViews(el, cons, alive) {
      const R = await this.presentSynthAsset(cons); if (!alive()) return;
      const box = el.querySelector('.pr-syn-imgs'), tabs = el.querySelector('.pr-syn-tabs'), info = el.querySelector('.pr-syn-info'); if (!box) return;
      if (!R || !R.cand.length) { box.innerHTML = '<div class="hint">Vues indisponibles.</div>'; return; }
      const fig = v => `<figure><img src="${v.img}" alt=""><figcaption>${esc(v.title)}</figcaption></figure>`, T = [{ label: 'Régions candidates', imgs: R.cand, info: this.synthLegendHtml ? this.synthLegendHtml() : '', v3: () => this.openSynthCand3d(cons) }].concat(R.hyps.map((hy, k) => ({ label: `<b style="color:${hy.color}">H${k + 1}</b> ${esc(hy.name)} ${hy.hemi === 'L' ? 'G' : 'D'}`, imgs: hy.imgs, info: `origine supposée ${esc(hy.origin)} · H1 dans ${hy.top}/${cons.n}, présente dans ${hy.n} · réseau de ${esc(hy.seizure)}`, v3: () => this.openSynthHyp3d(hy) })));
      const show = k => { tabs.querySelectorAll('button').forEach((b, j) => b.classList.toggle('on', j === k)); box.innerHTML = T[k].imgs.slice(0, 2).map(fig).join(''); this.presentZoomable(box); info.innerHTML = T[k].info; el.querySelector('.pr-synr [data-a=v3]').onclick = T[k].v3; };
      tabs.innerHTML = T.map(t => `<button>${t.label}</button>`).join(''); tabs.querySelectorAll('button').forEach((b, k) => b.onclick = () => show(k)); show(0);
    },
    /** images d'un conteneur : clic → en grand */
    presentZoomable(box) { box.querySelectorAll('img').forEach(im => { im.style.cursor = 'zoom-in'; im.onclick = () => this.presentZoomSrc(im.src, (im.closest('figure') && im.closest('figure').querySelector('figcaption') || {}).textContent || ''); }); },
    presentZoomSrc(src, cap) { if (!this._pres) return; const z = h('div', 'pr-zoom', `<img src="${src}"><div class="pr-zcap">${esc(cap || '')}</div>`); z.onclick = () => z.remove(); $('presentation').appendChild(z); },
    /** EEG intercritique d'une exploration : compte rendu sur toute la largeur, captures en galerie dessous */
    prEegInter(el, ex, G, alive) {
      this.prEeg(el, [], ex.eeg ? [ex] : [], alive);
      if (G.length) { const c = h('div', 'pr-card', `<div class="pr-lbl">Tracés intercritiques <span class="muted">clic : visionneuse</span></div><div class="pr-thumbs"></div>`); el.appendChild(c); this.presentGallery(c.querySelector('.pr-thumbs'), G, alive); }
    },
    /** frise de la crise (SVG, rendue hors écran à largeur fixe) */
    seizureFrise(sz) {
      if (!sz.events.length || !SV.Timeline) return '';
      const r = this.seizureModel(sz), dens = new Float32Array(r.T); for (let k = 0; k < r.T; k++) { let n = 0; for (let i = 1; i < r.N; i++) if (r.A[k * r.N + i] >= 0.3) n++; dens[k] = n; }
      const off = h('div'); off.style.cssText = 'position:absolute;left:-10000px;top:0;width:1100px;height:auto;overflow:visible'; document.body.appendChild(off);
      try {
        const tl = new SV.Timeline(off, {});
        tl.setData(sz.events, { tmin: r.tmin, tmax: Math.max(r.tmax, ...sz.events.map(e => (+e.t || 0) + (+e.dur || 0) + 1)), eegOnset: sz.eeg_onset, seizureEnd: sz.seizure_end, density: dens, times: r.times, colorOf: ev => this.db.category((this.db.signById.get(ev.sign_id) || {}).category).color, labelOf: ev => (this.db.signById.get(ev.sign_id) || { label_fr: ev.sign_id }).label_fr });
        tl.render(); const svg = tl.svg.cloneNode(true), H = +tl.svg.getAttribute('height') || 200; if (tl._ro) tl._ro.disconnect();
        svg.setAttribute('viewBox', `0 0 1100 ${H}`); svg.setAttribute('width', '100%'); svg.removeAttribute('height'); svg.style.height = 'auto'; svg.style.overflow = 'hidden';
        return svg.outerHTML;
      } finally { off.remove(); }
    },
    /** v5.2 — une crise sur une page : frise, médias, puis le modèle (latéralisation et hypothèses à gauche, réseau de H1 à droite) */
    async prSeizure(el, sz, ex, alive) {
      const d = this.dossier, A = this.atlas, il = S.ilaeText(S.deriveIlae(sz, this.db)), evs = sz.events.slice().sort((a, b) => a.t - b.t), Z = sz.seeg || {}, on = Z.onset || {};
      const r = evs.length ? this.seizureModel(sz) : null, pL = r ? Math.round(r.lateralization.pL * 100) : 0;
      const by = role => Object.entries(on).filter(([, x]) => x === role).map(([k]) => k);
      const P = this._pres, mi = P ? P.slides.findIndex(x => x.kind === 'media' && x.group === sz.id) : -1, ms = mi >= 0 ? P.slides[mi] : null, gal = ms ? ms.media : (d.gallery || []).filter(g => g.seizureId === sz.id);
      const seegHtml = ex.kind === 'seeg' ? `<div class="pr-lbl">SEEG</div>${Z.pattern ? `<div class="pr-row">${esc(V.seegPattern[Z.pattern] || Z.pattern)}</div>` : ''}${['onset', 'early', 'late'].map(k => by(k).length ? `<div class="pr-row"><b style="color:${ROLE()[k]}">${esc(V.seegRole[k])}</b> ${esc(this.groupContacts ? this.groupContacts(by(k)).join(' · ') : by(k).join(', '))}</div>` : '').join('')}${Z.electric ? `<p>${br(Z.electric)}</p>` : ''}${Z.clinical ? `<p class="muted">${br(Z.clinical)}</p>` : ''}${!Z.pattern && !Object.keys(on).length && !Z.electric ? '<div class="hint">analyse électrique non renseignée</div>' : ''}` : '';
      el.innerHTML = `<div class="pr-chips"><span class="pr-chip">${esc(ex.label)}</span>${sz.datetime ? `<span class="pr-chip">${esc(fmtDT(sz.datetime))}</span>` : ''}${sz.vigilance ? `<span class="pr-chip">${esc(V.vigilance[sz.vigilance])}</span>` : ''}${sz.habitual === 'yes' ? '<span class="pr-chip ok">habituelle</span>' : sz.habitual === 'no' ? '<span class="pr-chip">non habituelle</span>' : ''}${il ? `<span class="pr-chip">ILAE 2025 : ${esc(il)}</span>` : ''}${sz.eeg_onset != null ? `<span class="pr-chip">début EEG ${SV.fmtT ? SV.fmtT(sz.eeg_onset) : sz.eeg_onset + ' s'}</span>` : ''}<span class="spacer"></span>${evs.length ? '<button class="primary" data-a="review" title="ouvrir la crise dans la vue 3D (lecture, frise) ; un bouton ramène à la présentation">▶ Revoir en 3D</button>' : ''}</div>
        ${evs.length ? `<div class="pr-frise">${this.seizureFrise(sz)}</div>` : ''}
        ${gal.length ? `<div class="pr-szmedia"><span class="pr-lbl">Médias (${gal.length})</span><div class="pr-thumbs sm"></div></div>` : ''}
        ${r || seegHtml || sz.notes ? `<div class="pr-card pr-model"><div class="pr-2c"><div>${r ? `<div class="pr-lbl">Modèle de la crise</div><div class="lat-bar"><span class="L" style="width:${pL}%">G ${pL} %</span><span class="R" style="width:${100 - pL}%">D ${100 - pL} %</span></div>${r.hypotheses.slice(0, 3).map((Hy, k) => `<div class="pr-row"><b style="color:${SV.hypCss(Hy.index)}">H${k + 1}</b> ${esc(Hy.name)} ${Hy.hemi === 'L' ? 'gauche' : 'droit'} <span class="muted">· origine ${esc(A.label(Hy.origin))}</span></div>`).join('')}` : ''}${seegHtml}${sz.notes ? `<p class="muted">${br(sz.notes)}</p>` : ''}</div>
          ${r && r.hypotheses.length ? `<div class="pr-szv"><div class="pr-szshots"><div class="pr-wait">vues 3D du réseau H1…</div></div>${this.presentV3Bar()}</div>` : ''}</div></div>` : ''}`;
      const rv = el.querySelector('[data-a=review]'); if (rv) rv.onclick = () => this.presentReview({ seizureId: sz.id, view: 'crise' }, true);
      // médias : vignettes (clic : diaporama des médias de la crise)
      const th = el.querySelector('.pr-szmedia .pr-thumbs'); if (th) this.presentGallery(th, gal, alive, k => mi >= 0 ? this.presentShow(mi, { mi: k }) : this.presentLightbox(gal, k));
      // réseau conditionné de H1 (vues latérale et médiale à la fin de sa trajectoire), calculé dans la file de la vue 3D
      const sb = el.querySelector('.pr-szshots');
      if (sb) {
        const vs = await this.presentSeizureAsset(sz); if (!alive()) return;
        if (!vs || !vs.length) { sb.closest('.pr-szv').remove(); return; }
        const hv = vs[0]; sb.innerHTML = `<div class="pr-figs">${hv.imgs.map(u => `<img src="${u}">`).join('')}</div><div class="pr-szcap"><b style="color:${hv.color}">H${hv.index + 1}</b> ${esc(hv.name)} ${hv.hemi === 'L' ? 'gauche' : 'droit'} · origine ${esc(hv.origin)} · t = ${SV.fmtT ? SV.fmtT(hv.t) : hv.t}</div>`;
        this.presentZoomable(sb);
        el.querySelector('.pr-szv [data-a=v3]').onclick = () => this.openSynthHyp3d({ seizureId: sz.id, name: hv.name, hemi: hv.hemi, k: hv.index }, `${sz.label} · H${hv.index + 1} ${hv.name} ${hv.hemi === 'L' ? 'gauche' : 'droit'}`);
      }
    },

    // ================================================================ EEG, bilans, galerie
    examCard(x) {
      const side = x.kind === 'fmri' ? (x.langDom ? `<span class="pr-chip">langage : ${esc(V.langDom[x.langDom] || x.langDom)}</span>` : '') : x.side && x.kind !== 'psy' ? `<span class="pr-chip">${esc(SIDE_FR[x.side] || x.side)}</span>` : '';
      const body = x.kind === 'neuropsy' ? `<dl class="pr-dl">${V.neuroDomains.filter(([k]) => (x.domains || {})[k]).map(([k, l]) => `<dt>${esc(l)}</dt><dd>${br(x.domains[k])}</dd>`).join('')}</dl>${x.text ? `<p>${br(x.text)}</p>` : ''}` : x.text ? `<p>${br(x.text)}</p>` : '';
      const d = this.dossier, ng = (d.gallery || []).filter(g => g.examId === x.id).length, att = x.attachments || [], ims = (x.imagingIds || []).map(id => S.byId(d.imaging, id)).filter(Boolean);
      const links = (ims.length ? `<div class="muted small">images : ${ims.map(im => esc((V.modality[im.modality] || im.modality) + ' ' + fmtDate(im.date))).join(', ')}</div>` : '') + (att.length ? `<div class="pr-atts">${att.map(a => `<button class="pr-att" data-x="${x.id}" data-att="${a.id}" title="ouvrir dans la visionneuse">📎 ${esc(a.name)}</button>`).join('')}</div>` : '') + (ng ? `<div class="pr-thumbs" data-exam="${x.id}"></div>` : '');
      return `<div class="pr-card exam"><div class="pr-exh"><b>${esc((V.exam[x.kind] || x.kind).replace(/^./, c => c.toUpperCase()))}</b><span class="muted">${esc(fmtDate(x.date))}</span>${x.title ? `<span>${esc(x.title)}</span>` : ''}${side}</div>${body}${x.conclusion ? `<div class="pr-concl">${br(x.conclusion)}</div>` : ''}${links}</div>`;
    },
    /** pièces jointes (visionneuse : image, PDF) et vignettes des captures des bilans affichés (visionneuse des captures) */
    presentExamExtras(el, alive) {
      const d = this.dossier;
      el.querySelectorAll('.pr-att').forEach(b => b.onclick = async () => {
        const x = S.byId(d.exams, b.dataset.x), a = x && (x.attachments || []).find(y => y.id === b.dataset.att); if (!a) return;
        const blob = await SV.Library.readFile(d, a.file).catch(() => null); if (!blob) { this.toast('Fichier absent du dossier (archive légère ?)', 3500); return; }
        if (this.fileViewer) this.fileViewer(blob, a.name, a.mime);
      });
      for (const box of el.querySelectorAll('.pr-thumbs[data-exam]')) this.presentGallery(box, (d.gallery || []).filter(y => y.examId === box.dataset.exam), alive);
    },
    prEeg(el, X, P1, alive) {
      el.innerHTML = `<div class="pr-cards">${P1.map(ex => `<div class="pr-card exam wide"><div class="pr-exh"><b>${esc(ex.label)}</b><span class="muted">${esc(fmtDate(ex.start))}${ex.end ? ' → ' + esc(fmtDate(ex.end)) : ''}${ex.center ? ' · ' + esc(ex.center) : ''}</span></div>${SV.EegCR ? SV.EegCR.crHTML(ex, { size: 190 }).replace('<dl class="eeg-dl">', '<dl class="pr-dl eeg-dl">').replace(/<p class="eeg-concl"><b>Conclusion<\/b> : (.*?)<\/p>/s, '<div class="pr-concl">$1</div>') : `<dl class="pr-dl">${P1_EEG.filter(([k]) => ex.eeg[k] && k !== 'conclusion').map(([k, l]) => `<dt>${l}</dt><dd>${br(ex.eeg[k])}</dd>`).join('')}</dl>${ex.eeg.conclusion ? `<div class="pr-concl">${br(ex.eeg.conclusion)}</div>` : ''}`}</div>`).join('')}${X.map(x => this.examCard(x)).join('')}</div>`;
      this.presentExamExtras(el, alive || (() => true));
    },
    prExams(el, X, alive) { el.innerHTML = `<div class="pr-cards">${X.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).map(x => this.examCard(x)).join('')}</div>`; this.presentExamExtras(el, alive || (() => true)); },
    /** v5.2 — vignettes cliquables (visionneuse ‹ ›, ou onPick(k)) */
    presentGallery(box, G, alive, onPick) {
      if (!box || !G || !G.length) return; const isV = g => /^video\//.test(g.mime || '');
      box.innerHTML = G.map((g, k) => `<figure class="pr-thumb" data-k="${k}" title="${esc(g.notes || g.title || '')}"><div class="th">${isV(g) ? '<span class="vid">▶</span>' : ''}</div><figcaption>${esc(g.title || V.galleryKind[g.kind] || (isV(g) ? 'vidéo' : 'capture'))}</figcaption></figure>`).join('');
      box.querySelectorAll('figure').forEach(f => f.onclick = () => onPick ? onPick(+f.dataset.k) : this.presentLightbox(G, +f.dataset.k));
      (async () => { for (const f of box.querySelectorAll('figure')) { const u = await this.galleryThumb(G[+f.dataset.k]).catch(() => null); if (alive && !alive()) return; if (u) f.querySelector('.th').insertAdjacentHTML('afterbegin', `<img src="${u}" alt="">`); } })();
    },
    /** v5.2 — visionneuse des captures d'une liste, par-dessus la diapositive : ‹ › ou ← →, Échap ou clic hors de l'image */
    presentLightbox(G, k) {
      if (!this._pres || !G || !G.length) return; const host = $('presentation'), old = host.querySelector('.pr-zoom'); if (old) old.remove();
      const z = h('div', 'pr-zoom lb', `<div class="lb-stage"></div><div class="pr-zcap"></div>${G.length > 1 ? '<button class="lb-nav prev" title="précédente (←)">‹</button><button class="lb-nav next" title="suivante (→)">›</button>' : ''}<button class="lb-x" title="fermer (Échap)">✕</button>`); host.appendChild(z);
      const stage = z.querySelector('.lb-stage'), cap = z.querySelector('.pr-zcap');
      const show = async i => {
        k = (i + G.length) % G.length; const g = G[k], tok = z._tok = (z._tok || 0) + 1, vid = /^video\//.test(g.mime || '');
        cap.innerHTML = `<b>${esc(g.title || (vid ? 'vidéo' : 'capture'))}</b>${g.date ? ' · ' + esc(fmtDate(g.date)) : ''}${G.length > 1 ? ` · ${k + 1}/${G.length}` : ''}${g.notes ? `<div class="muted">${esc(g.notes)}</div>` : ''}`;
        stage.innerHTML = '<div class="pr-wait">chargement…</div>';
        const u = vid ? await this.galleryMediaURL(g) : await this.galleryComposite(g, 4000); if (z._tok !== tok || !z.isConnected) return;
        stage.innerHTML = !u ? '<div class="hint">image introuvable dans le dossier</div>' : vid ? `<video controls autoplay playsinline src="${u}"></video>` : `<img src="${u}" alt="">`;
      };
      z._step = dir => show(k + dir);
      z.onclick = e => { if (e.target === z || e.target === stage) z.remove(); };
      z.querySelector('.lb-x').onclick = () => z.remove();
      if (G.length > 1) { z.querySelector('.prev').onclick = () => show(k - 1); z.querySelector('.next').onclick = () => show(k + 1); }
      show(k);
    },
    /** diapositive des médias d'une crise : vidéo puis captures, ‹ › (ou ← →) d'un média à l'autre, vignettes */
    prMedia(el, s, alive) {
      el.innerHTML = `<div class="pr-media"><div class="pr-mstage"><button class="pr-mnav prev" title="média précédent (←)">‹</button><div class="pr-mview"></div><button class="pr-mnav next" title="média suivant (→)">›</button></div>
        <div class="pr-mcap"></div><div class="pr-mstrip">${s.media.map((g, k) => `<figure data-k="${k}" title="${esc(g.title || '')}"><div class="th">${/^video\//.test(g.mime || '') ? '<span class="vid">▶</span>' : ''}</div><figcaption>${esc(g.title || V.galleryKind[g.kind] || '')}</figcaption></figure>`).join('')}</div></div>`;
      el.querySelector('.prev').onclick = () => this.presentStep(-1); el.querySelector('.next').onclick = () => this.presentStep(1);
      el.querySelectorAll('.pr-mstrip figure').forEach(f => f.onclick = () => this.presentMedia(s, +f.dataset.k));
      s._alive = alive; this.presentMedia(s, s.mi || 0);
      (async () => { for (const f of el.querySelectorAll('.pr-mstrip figure')) { const g = s.media[+f.dataset.k], u = await this.galleryThumb(g).catch(() => null); if (!alive()) return; if (u) f.querySelector('.th').insertAdjacentHTML('afterbegin', `<img src="${u}" alt="">`); } })();
    },
    async presentMedia(s, k) {
      const el = $('presentation'), box = el && el.querySelector('.pr-media'); if (!box || !this._pres) return;
      s.mi = k = Math.max(0, Math.min(s.media.length - 1, k)); const g = s.media[k], d = this.dossier, tok = s._mtok = (s._mtok || 0) + 1, alive = () => s._mtok === tok && (!s._alive || s._alive());
      box.querySelectorAll('.pr-mstrip figure').forEach(f => f.classList.toggle('on', +f.dataset.k === k));
      const cur = box.querySelector(`.pr-mstrip figure[data-k="${k}"]`); if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      box.querySelector('.prev').disabled = false; box.querySelector('.next').disabled = false;
      el.querySelectorAll('.pr-nav [data-mi]').forEach(b => b.classList.toggle('on', +b.dataset.i === this._pres.i && +b.dataset.mi === k));
      const sb = el.querySelector('.pr-nav [data-mi].on'); if (sb && sb.scrollIntoView) sb.scrollIntoView({ block: 'nearest' });
      el.querySelector('.pr-n').textContent = `${this._pres.i + 1} / ${this._pres.slides.length} · média ${k + 1}/${s.media.length}`;
      const ex = g.explorationId && S.byId(d.explorations, g.explorationId), vid = /^video\//.test(g.mime || '');
      box.querySelector('.pr-mcap').innerHTML = `<b>${esc(g.title || (vid ? 'Vidéo' : 'Capture'))}</b><span class="pr-chip">${vid ? 'vidéo' : esc(V.galleryKind[g.kind] || g.kind || 'capture')}</span>${g.vigilance ? `<span class="pr-chip">${g.vigilance === 'S' ? 'sommeil' : 'veille'}</span>` : ''}${ex ? `<span class="pr-chip">${esc(ex.label)}</span>` : ''}${g.date ? `<span class="pr-chip">${esc(fmtDate(g.date))}</span>` : ''}<span class="muted">${k + 1} / ${s.media.length}</span>${this.presentRawHtml(g)}${g.notes ? `<p>${br(g.notes)}</p>` : ''}`; this.presentRawBind(box.querySelector('.pr-mcap'), g);
      const view = box.querySelector('.pr-mview'); const old = view.querySelector('video'); if (old) old.pause();
      view.innerHTML = '<div class="pr-wait">chargement…</div>';
      if (vid) { const vu = await this.galleryMediaURL(g), th = await this.galleryThumbURL(g).catch(() => null); if (!alive()) return; view.innerHTML = vu ? `<video controls playsinline src="${vu}"${th ? ` poster="${th}"` : ''}></video>` : '<div class="hint">vidéo introuvable dans le dossier</div>'; return; }
      const u = await this.galleryComposite(g, 2600); if (!alive()) return;
      view.innerHTML = u ? `<img src="${u}" alt="">` : '<div class="hint">image introuvable dans le dossier</div>';
      const img = view.querySelector('img'); if (img) img.onclick = () => this.presentZoom(g, u);
    },
    async prGalleryItem(el, g, alive) {
      const d = this.dossier, ex = g.explorationId && S.byId(d.explorations, g.explorationId), sz = g.seizureId && S.byId(d.seizures, g.seizureId);
      el.innerHTML = `<div class="pr-gal"><div class="pr-gimg"><div class="pr-wait">chargement…</div></div><div class="pr-gcap"><div class="pr-chips"><span class="pr-chip">${esc(V.galleryMod[S.galleryModOf(d, g)])}</span>${g.kind ? `<span class="pr-chip k-${esc(g.kind)}">${esc(V.galleryKind[g.kind] || g.kind)}</span>` : ''}${g.vigilance ? `<span class="pr-chip">${g.vigilance === 'S' ? 'sommeil' : 'veille'}</span>` : ''}${ex ? `<span class="pr-chip">${esc(ex.label)}</span>` : ''}${sz ? `<span class="pr-chip">${esc(sz.label)}</span>` : ''}${g.date ? `<span class="pr-chip">${esc(fmtDate(g.date))}</span>` : ''}</div>${g.notes ? `<p>${br(g.notes)}</p>` : ''}<div class="hint">clic sur l’image : taille réelle</div></div></div>`;
      if (/^video\//.test(g.mime || '')) { const vu = await this.galleryMediaURL(g), th = await this.galleryThumbURL(g); if (!alive()) return; el.querySelector('.pr-gimg').innerHTML = vu ? `<video controls playsinline src="${vu}"${th ? ` poster="${th}"` : ''}></video>` : '<div class="hint">vidéo introuvable dans le dossier</div>'; return; }
      const ch = el.querySelector('.pr-gcap .pr-chips'); if (ch) { ch.insertAdjacentHTML('beforeend', this.presentRawHtml(g)); this.presentRawBind(ch, g); }
      const u = await this.galleryComposite(g, 2600); if (!alive()) return;
      const box = el.querySelector('.pr-gimg'); box.innerHTML = u ? `<img src="${u}" alt="">` : '<div class="hint">image introuvable dans le dossier</div>';
      const img = box.querySelector('img'); if (img) img.onclick = () => this.presentZoom(g, u);
    },
    /** capture d'une page de tracé (g.src) : bouton « Revoir le tracé à cet instant » (montages, filtres, base de temps) */
    presentRawHtml(g) { const d = this.dossier, ex = g.src && g.explorationId && S.byId(d.explorations, g.explorationId), rec = ex && (ex.recordings || []).find(r => r.id === g.src.recId); return rec ? `<button class="pr-chip pr-raw" data-raw="${g.id}" title="Ouvrir « ${esc(rec.title)} » à cet instant (montages, filtres, base de temps), puis « Retour à la présentation »">〰 Revoir le tracé à cet instant</button>` : ''; },
    presentRawBind(box, g) { const b = box && box.querySelector(`[data-raw="${g.id}"]`); if (b) b.onclick = () => this.recReview(g.explorationId, g.src.recId, g.src.t, { montage: g.src.montage }); },
    /** image en taille réelle, par-dessus la diapositive (Échap ou clic pour fermer) */
    async presentZoom(g, u) {
      if (/^video\//.test(g.mime || '')) { const vu = await this.galleryMediaURL(g); if (!vu || !this._pres) return; const z = h('div', 'pr-zoom', `<video controls autoplay playsinline src="${vu}"></video><div class="pr-zcap">${esc(g.title || '')}</div>`); z.onclick = e => { if (e.target === z) z.remove(); }; $('presentation').appendChild(z); return; }
      u = u || await this.galleryComposite(g, 4000); if (!u || !this._pres) return;
      const z = h('div', 'pr-zoom', `<img src="${u}"><div class="pr-zcap">${esc(g.title || '')}</div>`); z.onclick = () => z.remove(); $('presentation').appendChild(z);
    },
    /** imagerie : coupes en grand ; à côté, lésions, ROI, comptes rendus — clic sur un compte rendu lié à une image : elle
     *  s'affiche dans les coupes (IRM en base, TEP / TEMP superposée au T1) ; ses captures en vignettes (visionneuse) */
    async prImaging(el, X, alive) {
      const d = this.dossier, A = this.atlas, ref = S.refImaging(d), rois = (d.rois || []).filter(r => r.visible !== false);
      const xs = X.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))), imOf = x => (x.imagingIds || []).map(id => S.byId(d.imaging, id)).find(im => im && (im === ref || (im.coreg && im.coreg.T)));
      el.innerHTML = `<div class="pr-im${ref ? '' : ' noimg'}">${ref ? '<div class="pr-ip"></div>' : ''}<div class="pr-imside">
        ${d.lesions.length ? `<div class="pr-lbl">Lésions</div>${d.lesions.map(l => `<div class="pr-imx"><b>${esc(l.label || V.lesionType[l.type] || '')}</b> <span class="muted">${esc([SIDE_FR[l.side], l.confidence ? 'confiance ' + V.confidence[l.confidence] : ''].filter(Boolean).join(' · '))}</span><div class="pr-regs">${(l.regions || []).slice(0, 8).map(r => `<span class="rchip">${esc(A.label(r))}</span>`).join('')}${(l.regions || []).length > 8 ? '…' : ''}</div></div>`).join('')}` : ''}
        ${rois.length ? `<div class="pr-lbl">ROI annotées</div>${rois.map(r => `<button class="pr-roi" data-roi="${r.id}" title="placer le réticule sur la ROI"><i style="border-color:${esc(r.color)}"></i><b>${esc(r.label)}</b>${r.notes ? ` <span class="muted">— ${esc(r.notes)}</span>` : ''}<span class="spacer"></span>⌖</button>`).join('')}` : ''}
        ${xs.length ? `<div class="pr-lbl">Comptes rendus</div>${xs.map(x => { const im = ref && imOf(x); return `<div class="pr-imx${im ? ' click' : ''}"${im ? ` data-im="${im.id}" title="afficher ${esc(V.modality[im.modality] || im.modality)} dans les coupes"` : ''}><div><b>${esc((V.exam[x.kind] || x.kind).toUpperCase())}</b> <span class="muted">${esc(fmtDate(x.date))}</span>${x.side && x.kind !== 'psy' ? ` <span class="pr-chip">${esc(SIDE_FR[x.side] || x.side)}</span>` : ''}${im ? ' <span class="pr-chip im">◧ coupes</span>' : ''}</div>${x.conclusion || x.text ? `<div class="pr-imc">${br(x.conclusion || x.text)}</div>` : ''}${(d.gallery || []).some(g => g.examId === x.id) ? `<div class="pr-thumbs sm" data-exam="${x.id}"></div>` : ''}</div>`; }).join('')}` : ''}
        ${!d.lesions.length && !rois.length && !xs.length ? '<div class="hint">Ni lésion, ni ROI, ni compte rendu.</div>' : ''}</div></div>`;
      for (const box of el.querySelectorAll('.pr-thumbs[data-exam]')) { this.presentGallery(box, (d.gallery || []).filter(y => y.examId === box.dataset.exam), alive); box.onclick = e => e.stopPropagation(); }
      if (ref && this.mountImagingPanel) { await wait(20); if (!alive()) return; this._slvSurg = null; await this.mountImagingPanel(el.querySelector('.pr-ip')); }
      el.querySelectorAll('[data-roi]').forEach(b => b.onclick = () => { const r = S.byId(d.rois, b.dataset.roi); if (r && this.slices) { if (this.slvState().elec) this.exitElectrodeCheck(); this.slices.setCursor(r.p); } });
      el.querySelectorAll('[data-im]').forEach(c => c.onclick = async () => {
        const im = S.byId(d.imaging, c.dataset.im), st = this.slvState(); if (!im || !this.slices) return;
        if (im === ref) { st.base = null; st.baseKind = 'gray'; }
        else if (['PET', 'SPECT'].includes(im.modality) || (im.derived && im.derived.cmap)) { st.base = null; st.baseKind = 'gray'; st.overlays.forEach(o => { o.on = false; }); this.addOverlay(im.id, true); }
        else { st.base = im.id; st.baseKind = this.imagingKind(im); st.overlays.forEach(o => { o.on = false; }); }
        st.baseWin = null; el.querySelectorAll('[data-im]').forEach(x => x.classList.toggle('on', x === c));
        await this.updateImagingLayers(); this.renderImagingBar();
      });
    },

    // ================================================================ discussion
    prConcordance(el, m, scope, cons) {
      const ST = SV.Staff || {}, SYS = ST.SYSTEMS || [], FR = ST.SYS_FR || {}, LS = ST.LV_SCORE || {};
      this._scope = scope;
      const cols = this.meetingColumns(m), auto = this.concordanceAuto(m, scope, cons), man = (m.concordance && m.concordance.cells) || {};
      const cell = (row, c) => (man[row] && man[row][c.key] && man[row][c.key].v !== undefined) ? Object.assign({ manual: true }, man[row][c.key]) : (auto[row] && auto[row][c.key]) || null;
      const hypRows = new Set(); for (const H of this.meetingHypotheses(m)) for (const r of H.ez.concat(H.prop)) hypRows.add(this.atlas.system(r) + ':' + this.atlas.hemiOf[r]);
      const rows = []; for (const sys of SYS) for (const side of ['L', 'R']) { const k = sys + ':' + side, cells = cols.map(c => cell(k, c)), score = cells.reduce((s, c) => s + (c ? LS[c.v] || 0 : 0), 0); if (cells.some(c => c && c.v && c.v !== '0') || hypRows.has(k) || this.ui.prConcAll) rows.push({ k, sys, side, cells, score, hyp: hypRows.has(k) }); }
      rows.sort((a, b) => b.score - a.score); const mx = Math.max(1, ...rows.map(r => r.score));
      el.innerHTML = rows.length ? `<div class="pr-card scroll"><table class="conc pr-conc"><thead><tr><th>Système</th>${cols.map(c => `<th>${esc(c.label)}</th>`).join('')}<th>Concordance</th></tr></thead><tbody>${rows.map(r => `<tr class="${r.hyp ? 'hyp-row' : ''}"><td class="sys">${esc(FR[r.sys] || r.sys)} <b>${r.side === 'L' ? 'G' : 'D'}</b></td>${r.cells.map((c, i) => `<td class="cc lv${c && c.v ? ' v' + LVC[c.v] : ''}" data-row="${r.k}" data-col="${cols[i].key}" title="clic : modifier">${c && c.v ? esc(c.v) : ''}${c && c.note ? `<div class="nt">${esc(c.note)}</div>` : ''}</td>`).join('')}<td class="score"><span class="bar"><i style="width:${Math.max(0, r.score) / mx * 100}%"></i></span> ${r.score > 0 ? '+' + r.score : r.score}</td></tr>`).join('')}</tbody></table>
        <div class="hint">++ argument fort · + en faveur · 0 neutre · − contre · ? douteux · lignes en bleu : régions des hypothèses discutées · classées par concordance</div></div>` : '<div class="pr-card"><div class="hint">Tableau de concordance vide : cochez « toutes les régions » pour le remplir ici, ou passez par « Préparer ».</div></div>';
      // modifiable pendant le staff : clic sur une case (même fenêtre que « Préparer »), toutes les régions à la demande
      const bar = h('div', 'pr-vact pr-concbar', `<span class="muted small">✎ clic sur une case pour la modifier pendant la discussion</span><label class="chip"><input type="checkbox" class="pr-call"${this.ui.prConcAll ? ' checked' : ''}> toutes les régions</label>`); el.appendChild(bar);
      const redo = () => this.prConcordance(el, m, scope, cons);
      bar.querySelector('.pr-call').onchange = e => { this.ui.prConcAll = e.target.checked; redo(); };
      el.querySelectorAll('td.cc[data-row]').forEach(td => td.onclick = e => this.concordanceCellMenu(m, td.dataset.row, td.dataset.col, cols, auto, e, () => { this.presentInvalidate && this.presentInvalidate(); redo(); }));
    },
    /** champ modifié en place dans une diapositive (participants, conclusion) : Entrée (une ligne) ou « enregistrer » */
    presentInlineEdit(target, value, save, o) {
      o = o || {}; if (!target) return; const box = h('span', 'pr-inl' + (o.single ? '' : ' block'));
      box.innerHTML = o.single ? `<input class="pr-inl-in" value="${esc(value)}" placeholder="${esc(o.placeholder || '')}"><button class="mini-btn primary" data-a="ok">enregistrer</button><button class="mini-btn" data-a="x">annuler</button>` : `<textarea class="pr-inl-in" rows="${o.rows || 6}" placeholder="${esc(o.placeholder || '')}">${esc(value)}</textarea><span class="btnrow"><button class="mini-btn primary" data-a="ok">enregistrer</button><button class="mini-btn" data-a="x">annuler</button></span>`;
      const prev = target.innerHTML; target.innerHTML = ''; target.appendChild(box); const inp = box.querySelector('.pr-inl-in'); inp.focus(); if (inp.setSelectionRange) inp.setSelectionRange(inp.value.length, inp.value.length);
      const done = ok => { if (ok) { save(inp.value.trim()); this.presentInvalidate && this.presentInvalidate(); } const P = this._pres; if (P) this.presentShow(P.i); else target.innerHTML = prev; };
      box.querySelector('[data-a=ok]').onclick = () => done(true); box.querySelector('[data-a=x]').onclick = () => done(false);
      inp.onkeydown = e => { if (e.key === 'Enter' && (o.single || e.ctrlKey || e.metaKey)) { e.preventDefault(); done(true); } };
    },
    /** vues du réseau H1 d'une crise (clé : évènements, anatomie) — la crise est rejouée sans rien réécrire, puis le contexte d'avant revient */
    presentSeizureAsset(sz) {
      const key = 'szhyp:' + sz.id + ':' + hash(JSON.stringify([sz.events, sz.eeg_onset, this.anatMode]));
      return this.presentAsset(key, async () => {
        const keep = this.ctx ? Object.assign({}, this.ctx) : null, busy = this._reportBusy; this._reportBusy = true;
        const restoreV = this.viewer ? { layout: this.viewer.layoutName, active: this.viewer.active, cfgs: this.viewer.cells.map(c => Object.assign({}, c.cfg, { hyps: c.cfg.hyps.slice() })) } : null;
        try { this.loadForReport({ seizureId: sz.id }); const cap = await this.captureSeizureViews({ dynamics: false, nHyp: 1, shot: { scale: 1.5, crop: true, format: 'jpeg', quality: 0.88 } }); return cap.hypViews; }
        finally { this._reportBusy = busy; if (restoreV && this.viewer) { try { this.viewer.setLayout(restoreV.layout); restoreV.cfgs.forEach((cfg, i) => this.viewer.cells[i] && this.viewer.setCellConfig(i, cfg, true)); this.viewer.setActive(restoreV.active); } catch (e) { } } this.ctx = null; if (keep) this.openContext(keep, true); }
      });
    },
    presentHypAsset(H, i) { return this.presentAsset('hypnet:' + H.id + ':' + hash(JSON.stringify([H.ez, H.prop, H.side, i, this.anatMode])), () => this._hypothesisShots(H, i, { scale: 1.6 })); },
    async prHypothesis(el, H, i, alive) {
      const d = this.dossier, L = r => esc(this.atlas.label(r)), lin = d.hypotheses.filter(x => x.lineage === H.lineage).sort((a, b) => a.version - b.version), from = S.byId(d.meetings, H.meetingId);
      const args = k => H[k].filter(a => a.text).map(a => `<li>${esc(a.text)}</li>`).join('');
      el.innerHTML = `<div class="pr-hyp" style="--hc:${SV.hypCss(i)}"><div class="pr-chips"><span class="pr-chip">${esc(V.hypStatus[H.status])}</span><span class="pr-chip">${esc(V.confidenceText[H.confidence] || '')}</span>${H.side ? `<span class="pr-chip">${esc(SIDE_FR[H.side] || H.side)}</span>` : ''}<span class="pr-chip">v${H.version}${from && from.id !== this._pres.m.id ? ' · staff du ' + esc(fmtDate(from.date)) : ''}</span>${H.source && H.source.kind === 'model' ? `<span class="pr-chip">modèle : H1 dans ${H.source.nTop || 0}/${H.source.nSeizures || 0} crises</span>` : ''}</div>
        <div class="pr-split"><div class="pr-card"><div class="pr-lbl">Zone épileptogène</div><div class="pr-regs">${H.ez.map(r => `<span class="rchip ez">${L(r)}</span>`).join('') || '<i class="muted">à préciser</i>'}</div>
          ${H.prop.length ? `<div class="pr-lbl">Propagation, réseau</div><div class="pr-regs">${H.prop.map(r => `<span class="rchip">${L(r)}</span>`).join('')}</div>` : ''}
          <div class="pr-args"><div class="for"><div class="pr-lbl">Pour</div><ul>${args('argsFor') || '<li class="muted">—</li>'}</ul></div><div class="against"><div class="pr-lbl">Contre</div><ul>${args('argsAgainst') || '<li class="muted">—</li>'}</ul></div></div>
          ${H.notes ? `<p>${br(H.notes)}</p>` : ''}${lin.length > 1 ? `<div class="muted small">Historique : ${lin.map(x => `v${x.version} ${esc(V.hypStatus[x.status])}`).join(' → ')}</div>${this.hypDiff(lin[lin.length - 2], H)}` : ''}</div>
        <div class="pr-card pr-shots"><div class="pr-wait">vues 3D…</div></div></div></div>`;
      const box = el.querySelector('.pr-shots');
      if (!H.ez.length && !H.prop.length) { box.innerHTML = '<div class="hint">Zone épileptogène à préciser.</div>'; return; }
      const imgs = await this.presentHypAsset(H, i); if (!alive()) return;
      box.innerHTML = imgs && imgs.length ? imgs.map((u, k) => `<figure><img src="${u}"><figcaption>réseau · ${k ? 'face médiale' : 'face latérale'}</figcaption></figure>`).join('') + this.presentV3Bar() : '<div class="hint">Vues indisponibles.</div>';
      this.presentZoomable(box); const v3 = box.querySelector('[data-a=v3]'); if (v3) v3.onclick = () => this.openStaffHyp3d(H, i);
    },
    /** v5.1 — conclusion lisible en grand ; décisions du staff ajoutées sur place (comme dans « Préparer ») : chacune a sa
     *  diapositive, où « modifier » ouvre « Préparer » pour le schéma d'implantation ou l'intervention */
    prConclusion(el, m) {
      const d = this.dossier, dec = d.decisions.filter(x => x.meetingId === m.id), L = r => esc(this.atlas.label(r)), P = this._pres;
      const TYPES = m.kind === 'post_phase1' ? ['seeg', 'surgery', 'litt', 'neuromod', 'imaging', 'workup', 'medical', 'none'] : ['surgery', 'rftc', 'litt', 'seeg2', 'neuromod', 'workup', 'medical', 'none'];
      el.innerHTML = `<div class="pr-concl-slide"><div class="pr-conclt">${m.conclusion ? `<p class="pr-lead big">${br(m.conclusion)}</p>` : '<p class="pr-lead big muted">Conclusion à rédiger</p>'}</div>
        <div class="pr-vact"><button class="pr-btn" data-a="concl" title="rédiger ou modifier la conclusion pendant le staff (Ctrl+Entrée : enregistrer)">✎ ${m.conclusion ? 'Modifier' : 'Rédiger'} la conclusion</button><button class="pr-btn" data-a="dec" title="décision du staff : SEEG (schéma d’implantation), chirurgie (intervention proposée)…">＋ Décision ▾</button></div>
        ${dec.length ? `<div class="pr-lbl">Décision${dec.length > 1 ? 's' : ''}</div>${dec.map(x => `<button class="pr-card pr-decrow" data-dec="${x.id}" title="voir la diapositive de la décision"><b>${esc(V.decision[x.type])}</b>${x.text ? ' — ' + esc(x.text) : ''} <span class="pr-chip">${esc(V.decisionStatus[x.status])}</span>${x.targets.length ? `<div class="pr-regs">${x.targets.slice(0, 10).map(r => `<span class="rchip">${L(r)}</span>`).join('')}${x.targets.length > 10 ? '…' : ''}</div>` : ''}</button>`).join('')}` : ''}</div>`;
      el.querySelector('[data-a=concl]').onclick = () => this.presentInlineEdit(el.querySelector('.pr-conclt'), m.conclusion || '', v => { m.conclusion = v; this.touch('meeting', m.id, 'conclusion'); }, { placeholder: 'Conclusion du staff…', rows: 7 });
      el.querySelector('[data-a=dec]').onclick = e => { const r = e.currentTarget.getBoundingClientRect(); this.popupMenu([{ head: 'Décision du staff' }].concat(TYPES.map(t => ({ label: V.decision[t], run: () => {
        const x = S.addDecision(d, { meetingId: m.id, type: t, date: m.date, hypothesisIds: this.meetingHypotheses(m).filter(H => H.status !== 'refuted' && H.status !== 'abandoned').map(H => H.id) });
        this.touch('decision', x.id, V.decision[t]); this.presentRebuild({ key: 'dec:' + x.id });
      } }))), r.left, r.bottom + 4); };
      el.querySelectorAll('[data-dec]').forEach(b => b.onclick = () => { const i = P ? P.slides.findIndex(x => x.key === 'dec:' + b.dataset.dec) : -1; if (i >= 0) this.presentShow(i); });
    },
  };
  Object.assign(SV.app, M);

  // ---------------------------------------------------------------- toute navigation ferme la présentation
  const A = SV.app, go0 = A.go, cd0 = A.closeDossier;
  A.go = function (loc, o) { if (this._pres && !(loc && loc.view === 'presenter')) this.closePresentation({ go: false }); return go0.call(this, loc, o); };
  A.closeDossier = function () { if (this._pres) this.closePresentation({ go: false }); this.clearPresentBack(); this._presCache = new Map(); return cd0.apply(this, arguments); };
})(window.SV = window.SV || {});
