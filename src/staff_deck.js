/* EpiScope — staff_deck.js (v1.1.0) : le diaporama du staff, page par page.
 *   - Surcouche m.deck sur la liste générée (presentSlides, clés stables) : pages masquées, ordre, titres, notes de
 *     discussion, pages libres (titre + texte) ; une page dont la source disparaît est simplement absente, les autres
 *     gardent leur réglage ; une page nouvelle (crise ajoutée…) s'insère à sa place naturelle.
 *       m.deck = { items: { <clé>: { hidden, title, note } }, order: [clés], custom: [{ key: 'c:…', sec, title, text, after }] }
 *   - Préparer : carte « Diapositives » (œil, ↑ ↓, titre, note, aperçu, ＋ page libre, retour à l'ordre automatique).
 *   - Présenter : édition sur place (staff_edit.js : touche E), double-clic sur le titre ; chaque page montrée est
 *     gardée telle qu'affichée (images comprises) ; « Instantané » enregistre ces pages dans staff/<réunion>/ du dossier :
 *     le staff tel que présenté, consultable plus tard même si le dossier a changé (m.snapshots).
 *   Rendu et navigation : staff_present.js.                                                                          */
(function (SV) {
  'use strict';
  const S = SV.Store, L = SV.Library, Hs = SV.History, A = SV.app, esc = SV.U.esc, $ = id => document.getElementById(id);
  const keyOf = s => s.key || (s.gid ? 'g:' + s.gid : s.kind === 'media' && s.group ? 'media:' + s.group : 't:' + s.sec + '|' + s.title);
  const deckOf = m => { m.deck = m.deck || {}; m.deck.items = m.deck.items || {}; m.deck.custom = m.deck.custom || []; return m.deck; };
  const br = s => esc(s).replace(/\n/g, '<br>');
  /** texte d'une page libre : paragraphes, listes « - », titres « # » */
  function textHtml(t) {
    const out = []; let ul = null;
    for (const line of String(t || '').split('\n')) {
      const l = line.trim(); if (/^[-•*]\s+/.test(l)) { if (!ul) { ul = []; out.push(ul); } ul.push(l.replace(/^[-•*]\s+/, '')); continue; } ul = null;
      if (!l) continue; out.push(/^#\s+/.test(l) ? `<h3>${esc(l.replace(/^#\s+/, ''))}</h3>` : `<p class="pr-lead">${esc(l)}</p>`);
    }
    return out.map(x => Array.isArray(x) ? `<ul class="pr-list">${x.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : x).join('');
  }
  /** ordre enregistré appliqué ; une page absente de l'ordre se place après la page qui la précède dans l'ordre automatique */
  function applyOrder(gen, order) {
    if (!order || !order.length) return gen; const pos = new Map(order.map((k, i) => [k, i]));
    const out = gen.filter(s => pos.has(keyOf(s))).sort((a, b) => pos.get(keyOf(a)) - pos.get(keyOf(b)));
    gen.forEach((s, i) => { if (pos.has(keyOf(s))) return; let j = i - 1; while (j >= 0 && !out.includes(gen[j])) j--; out.splice(j < 0 ? 0 : out.indexOf(gen[j]) + 1, 0, s); });
    return out;
  }

  const M = {
    /** pages du staff avec la surcouche ; o.all : garder les pages masquées (marquées hidden) */
    deckSlides(m, o) {
      const D = deckOf(m), gen = this.presentSlidesRaw(m);
      for (const c of D.custom) { const s = { sec: c.sec || 'Discussion', title: c.title || 'Page libre', key: c.key, kind: 'doc', custom: true, render: el => { el.innerHTML = `<div class="pr-doc pr-free">${textHtml(c.text) || '<p class="pr-lead muted">Page à rédiger</p>'}</div>`; } };
        const at = c.after ? gen.findIndex(x => keyOf(x) === c.after) : -1; gen.splice(at < 0 ? gen.length : at + 1, 0, s); }
      let out = applyOrder(gen, D.order);
      out.forEach(s => { const it = D.items[keyOf(s)] || {}; s.deckKey = keyOf(s); if (it.title) s.title = it.title; s.note = it.note || ''; s.hidden = !!it.hidden; });
      return o && o.all ? out : out.filter(s => !s.hidden);
    },
    deckItem(m, key) { const D = deckOf(m); return D.items[key] || (D.items[key] = {}); },
    deckSave(m, what) { this.touch('meeting', m.id, what || 'diaporama'); },

    // ================================================================ Préparer : carte « Diapositives »
    renderDeckCard(m, host) {
      if (!host || !m) return; const all = this.deckSlides(m, { all: true }), D = deckOf(m), nh = all.filter(s => s.hidden).length;
      let card = host.querySelector('.st-deck'); if (!card) { card = document.createElement('div'); card.className = 'card st-deck'; const anchor = host.querySelector('#stGal'); (anchor ? anchor.closest('.card') : host.lastElementChild).after(card); }
      const snaps = (m.snapshots || []).slice().reverse();
      card.innerHTML = `<div class="card-h">Diapositives <span class="muted">${all.length - nh} montrée${all.length - nh > 1 ? 's' : ''}${nh ? ` · ${nh} masquée${nh > 1 ? 's' : ''}` : ''} · œil : montrer / masquer ; ↑ ↓ : ordre ; clic sur le titre : renommer</span><span class="spacer"></span>
          <button class="mini-btn" data-a="free">＋ Page libre</button>${D.order || Object.keys(D.items).length ? '<button class="mini-btn" data-a="reset" title="ordre, titres et pages masquées automatiques (les notes et pages libres sont gardées)">Ordre automatique</button>' : ''}</div>
        <div class="dk-list">${all.map((s, i) => `<div class="dk-row${s.hidden ? ' off' : ''}" data-k="${esc(s.deckKey)}"><button class="dk-eye" title="${s.hidden ? 'masquée : cliquer pour la montrer' : 'montrée : cliquer pour la masquer'}">${s.hidden ? '○' : '◉'}</button><span class="muted dk-sec">${esc(s.sec)}</span><span class="dk-t" title="cliquer pour renommer">${esc(s.title)}</span>${s.custom ? '<span class="badge">libre</span>' : ''}${s.note ? '<span class="badge" title="' + esc(s.note) + '">note</span>' : ''}<span class="spacer"></span>
          <button class="mini-btn dk-up"${i ? '' : ' disabled'} title="monter">↑</button><button class="mini-btn dk-dn"${i < all.length - 1 ? '' : ' disabled'} title="descendre">↓</button><button class="mini-btn dk-note" title="commentaire de staff sur cette page (affiché dans la page en présentation, repris par les staffs suivants et le compte rendu)">💬</button>${s.custom ? '<button class="mini-btn dk-edit" title="modifier le texte de la page">texte</button><button class="mini-btn danger dk-del" title="supprimer cette page libre">✕</button>' : ''}<button class="mini-btn dk-show" title="présenter à partir de cette page">▶</button></div>`).join('')}</div>
        ${snaps.length ? `<div class="card-h" style="margin-top:10px">Instantanés <span class="muted">le staff tel que présenté, pages telles qu’affichées</span></div>${snaps.map(x => `<div class="dk-snap"><span>${esc(SV.Prov ? SV.Prov.day(x.at) : x.at)} ${esc(new Date(x.at).toLocaleTimeString(SV.LOC, { hour: '2-digit', minute: '2-digit' }))}</span><span class="muted">${x.n} page${x.n > 1 ? 's' : ''}${x.by ? ' · ' + esc(x.by) : ''} · EpiScope ${esc(x.app || '')}</span><span class="spacer"></span><button class="mini-btn" data-snap="${esc(x.file)}">Voir</button></div>`).join('')}` : ''}`;
      const rowOf = el => el.closest('.dk-row'), sl = k => all.find(s => s.deckKey === k), order = () => all.map(s => s.deckKey), redraw = () => this.renderDeckCard(m, host);
      card.querySelectorAll('.dk-eye').forEach(b => b.onclick = () => { const k = rowOf(b).dataset.k, it = this.deckItem(m, k); it.hidden = !it.hidden; this.deckSave(m, 'diaporama : page ' + (it.hidden ? 'masquée' : 'montrée')); redraw(); });
      card.querySelectorAll('.dk-up, .dk-dn').forEach(b => b.onclick = () => { const k = rowOf(b).dataset.k, o = order(), i = o.indexOf(k), j = i + (b.classList.contains('dk-up') ? -1 : 1); if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; deckOf(m).order = o; this.deckSave(m, 'diaporama : ordre'); redraw(); });
      card.querySelectorAll('.dk-t').forEach(t => t.onclick = () => { const k = rowOf(t).dataset.k, s = sl(k), v = prompt('Titre de la page (vide : titre automatique)', s.title); if (v == null) return; const c = deckOf(m).custom.find(x => x.key === k); if (c) c.title = v.trim() || c.title; else this.deckItem(m, k).title = v.trim() || undefined; this.deckSave(m, 'diaporama : titre'); redraw(); });
      card.querySelectorAll('.dk-note').forEach(b => b.onclick = () => { const k = rowOf(b).dataset.k, v = prompt('Commentaire de staff sur la page « ' + sl(k).title + ' » (la donnée du dossier n’est pas modifiée)', ''); if (!v || !v.trim()) return; const n = SV.Store.addStaffNote(this.dossier, { target: 'page:' + k, meetingId: m.id, text: v, by: SV.Library.user || '' }); if (n) { this.touch('staffNote', n.id, 'commentaire de staff'); redraw(); } });
      card.querySelectorAll('.dk-edit').forEach(b => b.onclick = () => this.deckEditFree(m, rowOf(b).dataset.k, redraw));
      card.querySelectorAll('.dk-del').forEach(b => b.onclick = () => { const k = rowOf(b).dataset.k; if (!confirm('Supprimer cette page libre ?')) return; const D2 = deckOf(m); D2.custom = D2.custom.filter(x => x.key !== k); if (D2.order) D2.order = D2.order.filter(x => x !== k); this.deckSave(m, 'diaporama : page libre supprimée'); redraw(); });
      card.querySelectorAll('.dk-show').forEach(b => b.onclick = () => { const k = rowOf(b).dataset.k; if (sl(k).hidden) { this.toast('Page masquée : la montrer d’abord (œil)', 3000); return; } this.openPresentation(m); const P = this._pres; if (P) { const i = P.slides.findIndex(s => s.deckKey === k); if (i >= 0) this.presentShow(i); } });
      const fr = card.querySelector('[data-a=free]'); fr.onclick = () => { const c = { key: 'c:' + S.uid(''), sec: 'Discussion', title: 'Page libre', text: '', after: (all.filter(s => !s.hidden).pop() || {}).deckKey || null }; deckOf(m).custom.push(c); if (deckOf(m).order) deckOf(m).order.push(c.key); this.deckSave(m, 'diaporama : page libre'); this.deckEditFree(m, c.key, redraw); };
      const rs = card.querySelector('[data-a=reset]'); if (rs) rs.onclick = () => { const D2 = deckOf(m); D2.order = null; for (const it of Object.values(D2.items)) { delete it.hidden; delete it.title; } this.deckSave(m, 'diaporama : ordre automatique'); redraw(); };
      card.querySelectorAll('[data-snap]').forEach(b => b.onclick = () => this.openSnapshot(m, b.dataset.snap));
    },
    /** texte d'une page libre (fenêtre) */
    deckEditFree(m, key, done) {
      const c = deckOf(m).custom.find(x => x.key === key); if (!c) return;
      const box = document.createElement('div'); box.className = 'modal'; box.innerHTML = `<div class="modal-card" style="max-width:720px"><div class="modal-head"><b>Page libre</b><span class="spacer"></span><button class="close">✕</button></div><div class="prov-body">
        <label>Section <input class="dk-fs" value="${esc(c.sec || 'Discussion')}"></label> <label>Titre <input class="dk-ft" value="${esc(c.title || '')}" style="width:340px"></label>
        <textarea class="dk-fx" rows="12" style="width:100%;margin-top:8px" placeholder="Texte de la page : une ligne par paragraphe ; « - » pour une liste ; « # » pour un intertitre">${esc(c.text || '')}</textarea>
        <div class="btnrow"><button class="primary dk-ok">Enregistrer</button></div></div></div>`;
      document.body.appendChild(box); const close = () => box.remove(); box.querySelector('.close').onclick = close;
      box.querySelector('.dk-ok').onclick = () => { c.sec = box.querySelector('.dk-fs').value.trim() || 'Discussion'; c.title = box.querySelector('.dk-ft').value.trim() || 'Page libre'; c.text = box.querySelector('.dk-fx').value; this.deckSave(m, 'diaporama : page libre'); close(); if (done) done(); if (this._pres) this.presentRebuild({ key: key }); };
      box.querySelector('.dk-fx').focus();
    },

    // ================================================================ Présenter : notes, titres, pages montrées
    /** capture de la page affichée (HTML, canvas et images en données intégrées, vidéos en image) pour l'instantané */
    deckCapture() {
      const P = this._pres, el = $('presentation'); if (!P || !el) return; const s = P.slides[P.i], body = el.querySelector('.pr-body'); if (!s || !body) return;
      const cl = body.cloneNode(true), src = [...body.querySelectorAll('canvas, img, video')], dst = [...cl.querySelectorAll('canvas, img, video')];
      src.forEach((n, j) => {
        const d = dst[j]; if (!d) return;
        try {
          let url = null;
          if (n.tagName === 'CANVAS') url = n.toDataURL('image/jpeg', 0.85);
          else { const w = n.videoWidth || n.naturalWidth, h = n.videoHeight || n.naturalHeight; if (w && h && (n.tagName === 'VIDEO' || /^blob:/.test(n.src))) { const k = Math.min(1, 1600 / Math.max(w, h)), c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k); c.getContext('2d').drawImage(n, 0, 0, c.width, c.height); url = c.toDataURL('image/jpeg', 0.85); } }
          if (url) { const im = document.createElement('img'); im.src = url; im.className = n.className; im.style.cssText = n.style.cssText + ';max-width:100%'; d.replaceWith(im); }
          else if (n.tagName === 'IMG' && /^data:|^file:|^https?:/.test(n.src)) { /* garde l'image telle quelle */ } else d.remove();
        } catch (e) { d.remove(); }
      });
      cl.querySelectorAll('button, input, select, textarea, script').forEach(x => { if (x.tagName === 'TEXTAREA' || x.tagName === 'INPUT') { const sp = document.createElement('span'); sp.textContent = x.value || ''; x.replaceWith(sp); } else x.remove(); });
      cl.querySelectorAll('*').forEach(x => { for (const a of [...x.attributes]) if (/^on/i.test(a.name) || a.name === 'contenteditable') x.removeAttribute(a.name); });
      cl.querySelectorAll('.stcm-tools, .stcm-in, .stcm-x').forEach(x => x.remove()); cl.querySelectorAll('.stcm-editing').forEach(x => x.classList.remove('stcm-editing'));
      P.snap = P.snap || new Map(); P.snap.set(s.deckKey, { key: s.deckKey, sec: s.sec, title: s.title, note: s.note || '', kind: s.kind || 'doc', html: cl.innerHTML });
      const b = el.querySelector('[data-a=snap]'); if (b) b.textContent = `◉ Instantané (${P.snap.size})`;
    },
    /** enregistre les pages montrées pendant la présentation (staff/<réunion>/<horodatage>.json.gz) */
    async deckSnapshot() {
      const P = this._pres, d = this.dossier; if (!P || !d) return; this.deckCapture();
      const order = P.slides.map(s => s.deckKey), slides = [...(P.snap || new Map()).values()].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
      if (!slides.length) { this.toast('Aucune page montrée pour l’instant', 3000); return; }
      const at = new Date().toISOString(), B = window.EPISCOPE_BRAND || {}, file = `staff/${P.m.id}/${Hs ? Hs.stamp(at) : at.replace(/[-:.]/g, '')}.json.gz`;
      const snap = { format: 'episcope-staff-snapshot', v: 1, meetingId: P.m.id, meeting: { date: P.m.date, kind: P.m.kind }, at, by: L.user || '', app: B.version || '', build: B.build || '', revision: d.revision, db: this.db && this.db.id || '', resultIds: (d.results || []).filter(r => r.status === 'current').map(r => r.id), shown: slides.length, total: P.slides.length, slides };
      try { await L.writeFile(d, file, new Blob([Hs ? await Hs.gzip(JSON.stringify(snap)) : JSON.stringify(snap)])); }
      catch (e) { this.toast('Instantané impossible : ' + e.message, 6000); return; }
      (P.m.snapshots = P.m.snapshots || []).push({ file, at, by: snap.by, n: slides.length, total: P.slides.length, app: snap.app, revision: snap.revision });
      this.deckSave(P.m, 'instantané du staff'); await this.flushSave();
      this.toast(`Instantané enregistré : ${slides.length} page${slides.length > 1 ? 's' : ''} montrée${slides.length > 1 ? 's' : ''} sur ${P.slides.length} — Staff › Préparer › Instantanés`, 5000);
    },
    /** consultation d'un instantané : pages telles que présentées (lecture seule) */
    async openSnapshot(m, file) {
      const d = this.dossier; let snap;
      try { const b = await L.readFile(d, file); if (!b) throw new Error('fichier absent'); const u8 = new Uint8Array(await b.arrayBuffer()); snap = JSON.parse(u8[0] === 0x1f && u8[1] === 0x8b && Hs ? await Hs.gunzip(u8) : new TextDecoder().decode(u8)); }
      catch (e) { this.toast('Instantané illisible : ' + e.message, 5000); return; }
      const el = $('presentation'); let i = 0; const S2 = snap.slides;
      el.className = 'presentation snapshot' + (this.ui.presLight !== false ? ' light' : ''); el.hidden = false; document.body.classList.add('presenting');
      el.innerHTML = `<aside class="pr-nav"><div class="pr-brand"><b>${esc(this.dname(d))}</b><span>Instantané du ${esc(new Date(snap.at).toLocaleString(SV.LOC))}</span></div>${S2.map((s, k) => `<button data-i="${k}">${esc(s.title)}</button>`).join('')}</aside>
        <main class="pr-main"><header class="pr-head"><div class="pr-sec-t"></div><h1 class="pr-t"></h1><span class="spacer"></span><span class="pr-pt">Instantané · ${snap.shown}/${snap.total} pages montrées · EpiScope ${esc(snap.app)}${snap.by ? ' · ' + esc(snap.by) : ''}</span></header>
        <div class="pr-body"></div><div class="pr-snote"></div><footer class="pr-foot"><button data-a="prev">‹</button><span class="pr-n"></span><button data-a="next">›</button><span class="hint">lecture seule — le staff tel que présenté ; ← → · Échap : fermer</span><span class="spacer"></span><button data-a="close">Fermer</button></footer></main>`;
      const show = k => { i = Math.max(0, Math.min(S2.length - 1, k)); const s = S2[i]; el.querySelector('.pr-sec-t').textContent = s.sec; el.querySelector('.pr-t').textContent = s.title; el.querySelector('.pr-n').textContent = `${i + 1} / ${S2.length}`; const bd = el.querySelector('.pr-body'); bd.className = 'pr-body k-' + (s.kind || 'doc'); bd.innerHTML = s.html; el.querySelector('.pr-snote').innerHTML = s.note && !/pr-disc/.test(s.html || '') ? `<b>Note de discussion :</b> ${br(s.note)}` : ''; el.querySelectorAll('.pr-nav [data-i]').forEach(b => b.classList.toggle('on', +b.dataset.i === i)); };
      const close = () => { el.hidden = true; el.innerHTML = ''; el.className = 'presentation'; document.body.classList.remove('presenting'); window.removeEventListener('keydown', key, true); };
      const key = e => { if (e.key === 'ArrowRight' || e.key === 'PageDown') show(i + 1); else if (e.key === 'ArrowLeft' || e.key === 'PageUp') show(i - 1); else if (e.key === 'Escape') close(); else return; e.preventDefault(); e.stopPropagation(); };
      window.addEventListener('keydown', key, true);
      el.querySelectorAll('.pr-nav [data-i]').forEach(b => b.onclick = () => show(+b.dataset.i)); el.querySelector('[data-a=prev]').onclick = () => show(i - 1); el.querySelector('[data-a=next]').onclick = () => show(i + 1); el.querySelector('[data-a=close]').onclick = close;
      show(0);
    },
  };
  Object.assign(A, M);

  // liste générée gardée sous presentSlidesRaw ; presentSlides applique la surcouche (toutes les vues : présenter, plan, captures)
  A.presentSlidesRaw = A.presentSlides;
  SV.Hooks.wrap(A, 'presentSlides', function (orig, m) { return this.deckSlides(m); }, 'staff_deck');
  // Préparer : carte « Diapositives » après « Captures à montrer »
  SV.Hooks.wrap(A, 'renderStaff', function (orig) { const r = orig(); const m = this.currentMeeting && this.currentMeeting(), box = $('scr-staff'); if (m && box) this.renderDeckCard(m, box.querySelector('.scr-inner')); return r; }, 'staff_deck');
  // présentation : boutons Éditer (staff_edit.js) et Instantané, double-clic sur le titre, capture de chaque page affichée
  SV.Hooks.wrap(A, 'openPresentation', function (orig, m) {
    const r = orig(); const el = $('presentation'), P = this._pres; if (!el || !P) return r; P.snap = new Map();
    const foot = el.querySelector('.pr-foot .spacer'); if (foot) { foot.insertAdjacentHTML('afterend', '<button data-a="edit" title="modifier ou commenter les données de la page sur place, changer son titre (E)">✎ Éditer</button><button data-a="snap" title="enregistrer le staff tel que présenté (pages montrées, telles qu’affichées)">◉ Instantané</button>'); el.querySelector('[data-a=snap]').onclick = () => this.deckSnapshot(); }
    const t = el.querySelector('.pr-t'); if (t) { t.title = 'double-clic : renommer la page'; t.ondblclick = () => { const s = P.slides[P.i]; this.presentInlineEdit(t, s.title, v => { const v2 = v.trim(); const c = deckOf(P.m).custom.find(x => x.key === s.deckKey); if (c) c.title = v2 || c.title; else this.deckItem(P.m, s.deckKey).title = v2 || undefined; s.title = v2 || s.title; t.textContent = s.title; this.deckSave(P.m, 'diaporama : titre'); this.presentNav(); }, { single: true, placeholder: 'Titre de la page' }); }; }
    return r;
  }, 'staff_deck');
  SV.Hooks.wrap(A, 'presentShow', async function (orig) { const r = await orig(); const P = this._pres; if (P) { setTimeout(() => { if (this._pres === P) this.deckCapture(); }, 1200); } return r; }, 'staff_deck');
})(window.SV = window.SV || {});
