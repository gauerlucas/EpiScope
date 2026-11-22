/* EpiScope — staff_edit.js (v1.1.0) : modifier et commenter les données depuis le staff.
 *   Ancres posées par les rendus (diapositives et compte rendu, mêmes chaînes) :
 *     data-ed="<type>:<id>:<champ>"  champ texte du dossier : « Éditer » (modifie le dossier) et « Commenter » ;
 *     data-cm="<cible> [<cible>…]"   bloc de données sans champ texte unique : « Commenter » seulement.
 *     types : exam, meeting, hypothesis, decision, seizure (listes du dossier), patient (d.patient), clin (d.patient.clin).
 *   Éditer : zone de saisie avec la valeur brute, enregistrée dans le dossier (journal « … modifié pendant le staff ») ;
 *   tout le dossier, les rapports et les staffs suivants voient la nouvelle valeur.
 *   Commenter : note de staff (store.addStaffNote, d.staffNotes) accrochée à la donnée sans la modifier ; affichée sous la
 *   donnée dans ce staff, dans les staffs ultérieurs (« staff du jj/mm/aaaa ») et dans le compte rendu (cmInjectHtml) ;
 *   les commentaires du staff en cours se modifient ou partent à la corbeille.
 *   Page sans ancre : « Commenter la page » (cible page:<clé de la diapositive>) ; dans le compte rendu, placé sous le
 *   titre de la section correspondante (pageAnchorIds).
 *   Boutons visibles en mode édition (« ✎ Éditer », touche E) ; commentaires toujours visibles ; instantané : staff_deck.js. */
(function (SV) {
  'use strict';
  const S = SV.Store, A = SV.app, esc = SV.U.esc, $ = id => document.getElementById(id);
  const COLL = { exam: 'exams', meeting: 'meetings', hypothesis: 'hypotheses', decision: 'decisions', seizure: 'seizures' };
  const LBL = { exam: 'bilan', meeting: 'staff', hypothesis: 'hypothèse', decision: 'décision', seizure: 'crise', patient: 'dossier', clin: 'dossier' };
  const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const setPath = (o, p, v) => { const ks = p.split('.'), last = ks.pop(); let a = o; for (const k of ks) { if (a[k] == null || typeof a[k] !== 'object') a[k] = {}; a = a[k]; } a[last] = v; };
  const fmt = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
  const targetsOf = el => String(el.getAttribute('data-ed') || el.getAttribute('data-cm') || '').split(/\s+/).filter(Boolean);
  /** sections du compte rendu (identifiants des titres) où placer les commentaires d'une page de diaporama */
  function pageAnchorIds(key, meetingId) {
    const k = String(key || ''), id = k.slice(k.lastIndexOf(':') + 1), out = [];
    if (/^(title|dev|history|life|hx|exam|img|x:)/.test(k)) out.push('patient');
    else if (/^eegint:/.test(k)) out.push('eeg_' + id, 'ex_' + id);
    else if (/^esi:sp:/.test(k)) out.push('esisp_' + id, 'ex_' + id);
    else if (/^esi:/.test(k)) out.push('esisz_' + id, 'ex_' + id);
    else if (/^(syn|seegsyn):/.test(k)) out.push('syn_' + id, 'seegcr_' + id, 'ex_' + id);
    else if (/^q?sz:/.test(k)) out.push('sz_' + id);
    else if (/^(implplan|impl|implsl|seegint|qinter|seegsz|quant|stims|thermo|pimpl):/.test(k)) out.push('seegcr_' + id, 'ex_' + id);
    else if (/^(psurg|proc):/.test(k)) out.push('surgery');
    if (meetingId) out.push('mt_' + meetingId);
    return out;
  }

  const M = {
    /** objet visé par une ancre data-ed : { obj, kind, id, field } ou null */
    edTarget(spec) {
      const [kind, id, field] = String(spec || '').split(':'), d = this.dossier; if (!d || !field) return null;
      const obj = kind === 'patient' ? d.patient : kind === 'clin' ? (d.patient.clin = d.patient.clin || {}) : (d[COLL[kind]] && S.byId(d[COLL[kind]], id));
      return obj ? { obj, kind, id, field } : null;
    },
    edValue(spec) { const t = this.edTarget(spec); return t ? String(getPath(t.obj, t.field) || '') : ''; },
    /** enregistre un champ du dossier modifié depuis le staff ; vrai si la valeur a changé */
    edSave(spec, value) {
      const t = this.edTarget(spec); if (!t) return false; value = String(value || '').replace(/\s+$/, '');
      if (String(getPath(t.obj, t.field) || '') === value) return false;
      setPath(t.obj, t.field, value); this.touch(t.kind === 'clin' ? 'patient' : t.kind, t.kind === 'clin' || t.kind === 'patient' ? null : t.id, `${LBL[t.kind] || t.kind} modifié pendant le staff`);
      if (this.presentInvalidate) this.presentInvalidate();
      return true;
    },
    /** bloc des commentaires d'une ou plusieurs cibles ; o.upTo : date du staff affiché ; o.cur : id du staff en cours
     *  (ses commentaires sont modifiables) ; o.tools : boutons de modification */
    cmBlockHtml(targets, o) {
      o = o || {}; const d = this.dossier; if (!d) return ''; const M0 = new Map((d.meetings || []).map(m => [m.id, m]));
      const L = [].concat(...[].concat(targets).map(t => S.notesFor(d, t, o.upTo))); if (!L.length) return '';
      return `<div class="stcm">${L.map(n => { const m = M0.get(n.meetingId), mine = o.tools && o.cur && n.meetingId === o.cur;
        return `<div class="stcm-n${n.meetingId === o.cur ? ' cur' : ''}" data-n="${esc(n.id)}"><span class="stcm-h">💬 ${m ? 'staff du ' + esc(fmt(m.date)) : 'commentaire'}${n.by ? ' · ' + esc(n.by) : ''}</span> <span class="stcm-t">${esc(n.text).replace(/\n/g, '<br>')}</span>${mine ? '<span class="stcm-x"><button class="pr-mini" data-cm-a="edit" title="modifier ce commentaire">✎</button><button class="pr-mini" data-cm-a="del" title="mettre ce commentaire à la corbeille">✕</button></span>' : ''}</div>`; }).join('')}</div>`;
    },
    /** compte rendu : commentaires insérés sous chaque ancre et sous le titre de section des pages commentées */
    cmInjectHtml(html, upTo) {
      const d = this.dossier; if (!d || !(d.staffNotes || []).length) return html;
      const tpl = document.createElement('template'); tpl.innerHTML = html; const root = tpl.content, done = new Set();
      const place = (anchor, block) => { let at = anchor; const h = anchor.closest && anchor.closest('h1,h2,h3,h4,h5,h6'); if (h) at = h; at.insertAdjacentHTML(/^(LI|TD|DD)$/.test(at.tagName) ? 'beforeend' : 'afterend', block); };
      root.querySelectorAll('[data-ed], [data-cm]').forEach(el => { const T = targetsOf(el).filter(t => !done.has(t)); const b = this.cmBlockHtml(T, { upTo }); if (b) { T.forEach(t => done.add(t)); place(el, b); } });
      // commentaires de pages : sous le titre de la section correspondante
      const pages = (d.staffNotes || []).filter(n => /^page:/.test(n.target) && !done.has(n.target)), by = new Map();
      for (const n of pages) { if (!by.has(n.target)) by.set(n.target, n); }
      for (const [t, n] of by) { const ids = pageAnchorIds(t.slice(5), n.meetingId); const h = ids.map(id => root.getElementById ? root.getElementById(id) : root.querySelector('#' + CSS.escape(id))).find(Boolean); const b = h && this.cmBlockHtml(t, { upTo }); if (b) { done.add(t); h.insertAdjacentHTML('afterend', b); } }
      return tpl.innerHTML;
    },
    /** actions des boutons Éditer / Commenter / ✎ / ✕ (délégation sur le corps de la diapositive) */
    presentCmClick(e, body) {
      const d = this.dossier; if (!this._pres || !d) return;
        const b = e.target.closest('[data-cm-a]'); if (!b || !body.contains(b)) return; e.preventDefault(); e.stopPropagation();
        const host = b.closest('.stcm-host, .stcm-page'), act = b.dataset.cmA, tgt = host && host.dataset.cmTargets;
        if (act === 'ed' && host && host._spec) { const a = host._anchor; a.classList.add('stcm-editing'); this.presentInput(host.querySelector('.stcm-tools'), this.edValue(host._spec), async v => { if (this.edSave(host._spec, v)) { this.toast('Modifié dans le dossier', 1500); this.presentRedraw(); } }, { label: 'Enregistrer dans le dossier', onClose: () => a.classList.remove('stcm-editing') }); return; }
        if (act === 'add' && tgt) { this.presentInput(b.closest('.stcm-tools'), '', this.presentComment(tgt), { label: 'Ajouter le commentaire', ph: 'Commentaire du staff (la donnée du dossier n’est pas modifiée)' }); return; }
        const nEl = b.closest('.stcm-n'), n = nEl && S.byId(d.staffNotes || [], nEl.dataset.n); if (!n) return;
        if (act === 'del') { S.remove(d, 'staffNote', n.id); this.touch('staffNote', n.id, 'commentaire de staff à la corbeille'); this.presentRedraw(); }
        else if (act === 'edit') this.presentInput(nEl, n.text, async v => { v = String(v || '').trim(); if (!v || v === n.text) return; n.text = v; n.edited = S.now(); this.touch('staffNote', n.id, 'commentaire de staff modifié'); this.presentRedraw(); }, { label: 'Enregistrer' });
      },
    presentEditToggle() {
      const P = this._pres; if (!P) return; this.ui.presEdit = !this.ui.presEdit;
      const el = $('presentation'); el.classList.toggle('pr-editing', !!this.ui.presEdit);
      const b = el.querySelector('[data-a=edit]'); if (b) { b.classList.toggle('on', !!this.ui.presEdit); b.textContent = this.ui.presEdit ? '✓ Terminer' : '✎ Éditer'; }
      this.presentShow(P.i);
    },
    /** zone de saisie sous un élément (édition d'un champ ou d'un commentaire) ; ok(texte) renvoie une promesse ou rien */
    presentInput(after, value, ok, o) {
      const box = document.createElement('div'); box.className = 'stcm-in';
      box.innerHTML = `<textarea rows="${Math.min(10, Math.max(2, String(value || '').split('\n').length + 1))}" placeholder="${esc((o && o.ph) || '')}"></textarea><div class="stcm-row"><button class="pr-btn primary" data-k="ok">${esc((o && o.label) || 'Enregistrer')}</button><button class="pr-btn" data-k="no">Annuler</button><span class="muted small">Ctrl+Entrée : enregistrer · Échap : annuler</span></div>`;
      after.insertAdjacentElement('afterend', box); const ta = box.querySelector('textarea'); ta.value = value || ''; ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
      const close = () => { box.remove(); if (o && o.onClose) o.onClose(); };
      box.querySelector('[data-k=no]').onclick = close;
      const go = async () => { await ok(ta.value); close(); };
      box.querySelector('[data-k=ok]').onclick = go;
      ta.onkeydown = e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); go(); } else if (e.key === 'Escape') { e.preventDefault(); close(); } };
      return box;
    },
    presentRedraw() { const P = this._pres; if (P) this.presentShow(P.i); },
    presentComment(target) {
      const P = this._pres, d = this.dossier; if (!P || !d) return null;
      return async text => { const n = S.addStaffNote(d, { target, meetingId: P.m.id, text, by: SV.Library.user || '' }); if (!n) return; this.touch('staffNote', n.id, 'commentaire de staff'); this.presentRedraw(); };
    },
    /** après le rendu d'une page : commentaires sous les données, boutons Éditer / Commenter, titre modifiable */
    presentDecorate() {
      const P = this._pres, el = $('presentation'), d = this.dossier; if (!P || !el || !d) return; const s = P.slides[P.i], body = el.querySelector('.pr-body'); if (!s || !body) return;
      const ed = !!this.ui.presEdit, ctx = { upTo: P.m.date, cur: P.m.id, tools: ed }, page = 'page:' + s.deckKey;
      body.querySelectorAll('.stcm, .stcm-tools, .stcm-in, .stcm-page').forEach(x => x.remove());
      // commentaires de la page entière (en tête)
      const pb = this.cmBlockHtml(page, ctx);
      if (pb || ed) { const top = document.createElement('div'); top.className = 'stcm-page'; top.innerHTML = (ed ? '<div class="stcm-tools page"><button class="pr-mini" data-cm-a="add" title="commentaire de staff sur l’ensemble de cette page (sans modifier le dossier)">💬 Commenter la page</button></div>' : '') + pb; body.prepend(top);
        top.dataset.cmTargets = page; }
      // commentaires et boutons de chaque donnée
      body.querySelectorAll('[data-ed], [data-cm]').forEach(a => {
        const T = targetsOf(a), spec = a.getAttribute('data-ed'), canEd = !!(spec && this.edTarget(spec)); if (!T.length) return;
        const blk = this.cmBlockHtml(T, ctx), wrap = document.createElement('div'); wrap.className = 'stcm-host'; wrap.dataset.cmTargets = T[0];
        if (ed) wrap.innerHTML = `<div class="stcm-tools">${canEd ? '<button class="pr-mini" data-cm-a="ed" title="modifier cette donnée dans le dossier (tout le dossier et les staffs suivants verront la nouvelle valeur)">✎ Éditer</button>' : ''}<button class="pr-mini" data-cm-a="add" title="ajouter un commentaire de staff sans modifier la donnée (les staffs suivants verront la donnée d’origine et ce commentaire)">💬 Commenter</button></div>`;
        if (blk) wrap.insertAdjacentHTML('beforeend', blk); if (!wrap.innerHTML) return;
        const at = /^(DD|LI|TD|SPAN|I|B)$/.test(a.tagName) ? a : a; at.insertAdjacentElement(/^(DD|LI|TD)$/.test(a.tagName) ? 'beforeend' : 'afterend', wrap);
        wrap._anchor = a; wrap._spec = canEd ? spec : null;
      });
      if (!body._cmBound) { body._cmBound = true; body.addEventListener('click', e => this.presentCmClick(e, body), true); }
      // titre de la page : surcouche du diaporama
      const h1 = el.querySelector('.pr-t');
      if (h1) {
        h1.contentEditable = ed ? 'true' : 'false'; h1.classList.toggle('ed', ed);
        h1.onblur = !ed ? null : () => { const v = String(h1.innerText || '').replace(/\s+/g, ' ').trim(); if (!v || v === s.title) { h1.textContent = s.title; return; } const D = P.m.deck || {}, c = (D.custom || []).find(x => x.key === s.deckKey); if (c) c.title = v; else this.deckItem(P.m, s.deckKey).title = v; s.title = v; this.deckSave(P.m, 'diaporama : titre'); if (this.presentNav) this.presentNav(); this.deckCapture && this.deckCapture(); };
        h1.onkeydown = !ed ? null : e => { if (e.key === 'Enter') { e.preventDefault(); h1.blur(); } };
      }
    },
  };
  Object.assign(A, M);
  A.cmPageAnchorIds = pageAnchorIds;

  // rendu d'une page : décoration juste après (avant la capture de l'instantané, faite 1,2 s plus tard par staff_deck.js)
  SV.Hooks.wrap(A, 'presentShow', async function (orig) { const r = await orig(); if (this._pres) this.presentDecorate(); return r; }, 'staff_edit');
  // pas de pagination en mode édition : la page défile, aucune donnée cachée pendant la saisie
  SV.Hooks.wrap(A, 'presentPaginate', function (orig, body, s, last) { if (this.ui.presEdit) { const P = this._pres; if (P) { P.pages = null; if (P._mo) { P._mo.disconnect(); P._mo = null; } } body.classList.remove('paged'); body.querySelectorAll('.pg-off, .pg-hid').forEach(x => x.classList.remove('pg-off', 'pg-hid')); return; } return orig(body, s, last); }, 'staff_edit');
  // clavier : la saisie garde ses touches ; E bascule le mode édition (M aussi)
  SV.Hooks.wrap(A, 'presentKey', function (orig, e) {
    const t = e.target || {};
    if (this._pres && (t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName || ''))) { if (e.key === 'Escape' && t.isContentEditable) { t.blur(); e.preventDefault(); } return; }
    if (this._pres && /^[eEmM]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) { this.presentEditToggle(); e.preventDefault(); e.stopPropagation(); return; }
    return orig(e);
  }, 'staff_edit');
  // ouverture : mode édition repris s'il était actif
  SV.Hooks.wrap(A, 'openPresentation', function (orig, m) {
    const r = orig(m), el = $('presentation'); if (!el || !this._pres) return r;
    el.classList.toggle('pr-editing', !!this.ui.presEdit);
    const b = el.querySelector('[data-a=edit]'); if (b) { b.textContent = this.ui.presEdit ? '✓ Terminer' : '✎ Éditer'; b.classList.toggle('on', !!this.ui.presEdit); b.onclick = () => this.presentEditToggle(); }
    return r;
  }, 'staff_edit');
})(window.SV = window.SV || {});
