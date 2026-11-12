/* EpiScope — core.js : noyau commun (v5)
 *
 *   SV.U      helpers DOM/texte partagés ($, h, esc, fmt…) — les modules peuvent garder leurs alias locaux.
 *   SV.Bus    bus d'évènements nommés : on / off / emit ; « before » en ordre inverse d'inscription, « after » en ordre
 *             d'inscription, ce qui reproduit l'emboîtement des anciennes greffes (dernier chargé = le plus extérieur).
 *   SV.Hooks  registre des greffes : chaque réaffectation d'une méthode de SV.app est notée avec le module qui l'a faite
 *             (SV.Hooks.current, posé avant chaque script par index.html / build.py) → SV.Hooks.chain('setWorkMode')
 *             donne la pile des surcharges ; SV.Hooks.wrap(obj, name, fn) est la forme explicite d'une greffe.
 *   SV.Scope  portée des visualisations : ce qu'une vue a le droit de montrer selon l'étape du parcours (phase 1, SEEG,
 *             staff, chirurgie) et le mode de travail ; retire les couches d'autres étapes (thermocoagulations,
 *             quantifications, peinture d'une résection…) qui « bavaient » d'une vue à l'autre.
 *   SV.Clip   copie riche vers le presse-papiers (HTML + texte) d'un tableau, d'une carte ou d'une figure : collage
 *             direct dans Word / PowerPoint / mail.                                                                   */
(function (SV) {
  'use strict';
  // ================================================================ helpers partagés
  const $ = id => document.getElementById(id);
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtDate = s => { if (!s) return ''; const d = new Date(String(s).length <= 10 ? s + 'T12:00:00' : s); return isNaN(d) ? String(s) : d.toLocaleDateString(SV.LOC); };
  const LS = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }, del(k) { try { localStorage.removeItem(k); } catch (e) { } } };
  SV.U = { $, h, esc, fmtDate, LS, debounce(fn, ms) { let t; return function () { clearTimeout(t); t = setTimeout(() => fn.apply(this, arguments), ms); }; } };

  // ================================================================ bus d'évènements
  const subs = new Map();
  SV.Bus = {
    on(ev, fn, tag) { if (!subs.has(ev)) subs.set(ev, []); subs.get(ev).push({ fn, tag: tag || SV.Hooks.current || '?' }); return () => this.off(ev, fn); },
    off(ev, fn) { const l = subs.get(ev); if (l) subs.set(ev, l.filter(s => s.fn !== fn)); },
    /** emit(ev, ctx, payload…) ; les évènements « :before » sont servis en ordre inverse d'inscription */
    emit(ev, ctx) {
      const l = subs.get(ev); if (!l || !l.length) return 0; const args = Array.prototype.slice.call(arguments, 2), list = /:before$/.test(ev) ? l.slice().reverse() : l;
      for (const s of list) { try { s.fn.apply(ctx, args); } catch (e) { console.warn('bus ' + ev + ' (' + s.tag + ') :', e); } }
      return list.length;
    },
    list(ev) { return ev ? (subs.get(ev) || []).map(s => s.tag) : Object.fromEntries([...subs].map(([k, v]) => [k, v.map(s => s.tag)])); },
  };

  // ================================================================ registre des greffes
  const chains = new Map();
  SV.Hooks = {
    current: 'core',
    /** note qu'un module réaffecte obj[name] ; appelé par le Proxy de SV.app et par wrap() */
    note(name, tag, kind) { if (!chains.has(name)) chains.set(name, []); chains.get(name).push({ tag: tag || this.current, kind: kind || 'replace' }); },
    /** greffe explicite : fn(orig, ...args) ; this = obj */
    wrap(obj, name, fn, tag) {
      const orig = obj[name]; if (typeof orig !== 'function') throw new Error('Hooks.wrap : ' + name + ' n’est pas une méthode');
      const w = function () { const self = this, a = Array.prototype.slice.call(arguments); return fn.call(self, function () { return orig.apply(self, arguments.length ? arguments : a); }, ...a); };
      w._wrapped = orig; obj[name] = w; this.note(name, tag, 'wrap'); return w;
    },
    chain(name) { return (chains.get(name) || []).map(c => c.tag + (c.kind === 'wrap' ? ' (wrap)' : '')); },
    /** tableau des méthodes surchargées plusieurs fois (diagnostic : SV.Hooks.report()) */
    report(min) { const out = []; for (const [k, v] of chains) if (v.length >= (min || 2)) out.push({ method: k, n: v.length, by: v.map(c => c.tag).join(' › ') }); return out.sort((a, b) => b.n - a.n); },
    /** enveloppe SV.app dans un Proxy qui trace les réaffectations de méthodes (sans changer le comportement) */
    track(app) {
      const H = this;
      return new Proxy(app, {
        set(t, k, v) { if (typeof v === 'function' && typeof t[k] === 'function' && t[k] !== v && !v._wrapped) H.note(String(k), H.current, 'replace'); else if (typeof v === 'function' && t[k] === undefined) H.note(String(k), H.current, 'define'); t[k] = v; return true; },
      });
    },
  };

  // ================================================================ portée des visualisations
  /** couches d'une cellule de vue 3D (clés de cfg) regroupées par concept */
  const LAYER_KEYS = { network: ['fibers', 'nodes', 'sync', 'netLabels', 'hubLabels'], electrodes: ['electrodes', 'labels'], stims: ['stims'], thermo: ['thermo'], quant: ['quant'], ccep: ['ccep'], zones: ['zones'], paint: ['paint'] };
  const OFF = { fibers: false, nodes: false, sync: false, netLabels: false, hubLabels: false, electrodes: false, labels: false, stims: false, thermo: false, quant: null, ccep: false, zones: null, paint: null };
  const PAINT_OK = { surgery: ['intervention', 'preparer', 'presenter', 'synthese'], surgery_shot: [], surgery_pop: [], synthCand: ['synthese'], stimCortex: ['stim'], esi: ['analyses', 'quant'] };
  SV.Scope = {
    /** politique pour l'état courant de l'application → { key, label, kind, wm, allowed:Set, defaults:{}, hidden:[] } */
    policy(app) {
      const loc = app.loc || {}, st = app.currentStage ? app.currentStage() : null, kind = st ? st.kind : 'dossier', ex = st && st.obj && st.kind !== 'meeting' && st.kind !== 'procedure' ? st.obj : null;
      const wm = app.ui.wm, view = loc.view, seeg = kind === 'seeg';
      const allowed = new Set(['network', 'electrodes']), defaults = {}; let label = st ? st.label : 'Dossier';
      if (!seeg) { allowed.delete('electrodes'); Object.assign(defaults, { electrodes: false, labels: false, stims: false, thermo: false, quant: null, ccep: false, zones: null }); }
      else {
        // SEEG : électrodes toujours, réseau ; les autres couches ne sont montrées d'office que dans la vue qui leur est dédiée
        defaults.electrodes = true;
        if (wm === 'stim') { allowed.add('stims'); allowed.add('paint'); Object.assign(defaults, { thermo: false, quant: null, zones: null }); }
        else if (wm === 'thermo') { allowed.add('thermo'); allowed.add('stims'); allowed.add('zones'); Object.assign(defaults, { quant: null }); }
        else if (wm === 'quant') { allowed.add('quant'); allowed.add('ccep'); allowed.add('paint'); Object.assign(defaults, { stims: false, thermo: false, zones: null }); }
        else if (wm === 'plan') { Object.assign(defaults, { stims: false, thermo: false, quant: null, ccep: false, zones: null, paint: null }); }
        else { Object.assign(defaults, { stims: false, thermo: false, quant: null, ccep: false, zones: null }); }   // crise SEEG : électrodes + plots de début ; stimulations, thermocoagulations, quantifications à la demande (SEEG ▾)
      }
      if (app.ui.scopeFree) { for (const k of Object.keys(LAYER_KEYS)) allowed.add(k); }
      return { key: st ? st.key : 'dossier', label, kind, wm, view, allowed, defaults, exploration: ex };
    },
    /** applique la politique à la vue 3D : retire les couches d'autres étapes des cellules et les peintures orphelines ;
     *  renvoie la liste des couches masquées (pour l'indicateur) */
    apply(app, why) {
      const V3 = app.viewer; if (!V3 || !V3.cells) return [];
      const P = this.policy(app), hidden = new Set(), keep = PAINT_OK;
      for (let i = 0; i < V3.cells.length; i++) {
        const cfg = V3.cells[i].cfg, patch = {};
        // crise (sémiologie) : un réseau entièrement éteint est un reliquat d'un mode outil, pas un choix — rallumé
        if ((P.wm === 'semio' || P.wm === 'semioSeeg') && !cfg.fibers && !cfg.nodes && !cfg.sync) Object.assign(patch, { fibers: true, nodes: true, sync: true, netLabels: true });
        for (const [k, v] of Object.entries(P.defaults)) { if (app.ui.scopeFree && (v === false || v === null)) continue; if (cfg[k] === v) continue; patch[k] = v; if ((v === false || v === null) && !['electrodes', 'labels'].includes(k)) { if (cfg[k] != null && cfg[k] !== false) hidden.add(k); } }
        // peinture : seulement si sa clé est permise dans cette vue
        if (cfg.paint && !(P.allowed.has('paint') || (keep[cfg.paint] || []).includes(P.view) || (keep[cfg.paint] || []).includes(P.wm) || /^q:/.test(cfg.paint) && P.wm === 'quant')) { patch.paint = null; hidden.add('paint'); }
        if (cfg.quant && patch.quant === undefined && !P.allowed.has('quant') && !app.ui.scopeFree) { patch.quant = null; hidden.add('quant'); }
        if (Object.keys(patch).length) V3.setCellConfig(i, patch, true);
      }
      // SEEG : en entrant dans un mode outil, une vue latérale tournée vers l'hémisphère non implanté bascule vers le côté implanté
      if (P.kind === 'seeg' && why === 'workmode' && app.state && (app.state.electrodes || []).length) {
        const hemis = new Set(app.state.electrodes.map(e => e.hemi).filter(Boolean)); if (hemis.size === 1) { const h = [...hemis][0], want = h === 'L' ? 'latL' : 'latR', wrong = h === 'L' ? 'latR' : 'latL'; V3.cells.forEach((c, i) => { if (c.cfg.view === wrong) V3.setCellConfig(i, { view: want }, true); }); }
      }
      // peintures transitoires d'autres étapes (résection, synthèse) retirées quand on quitte leur vue
      for (const k of Object.keys(V3.paints || {})) { const ok = keep[k]; if (ok && !ok.includes(P.view) && !ok.includes(P.wm)) { V3.setPaint(k, null); if (app.ui.paintLabel) app.ui.paintLabel = ''; } }
      if (V3.onCellChange && hidden.size) V3.onCellChange();
      const key = P.key + '|' + P.view + '|' + (app.ctx ? app.ctx.seizureId || app.ctx.explorationId : ''), prev = app.ui.scopeKey === key ? (app.ui.scopeHidden || []) : [];
      app.ui.scope = P; app.ui.scopeKey = key; app.ui.scopeHidden = [...new Set(prev.concat([...hidden]))];
      if (app.renderScopeLegend) app.renderScopeLegend();
      SV.Bus.emit('scope:applied', app, P, [...hidden], why);
      return [...hidden];
    },
    /** libellé des couches masquées, pour l'indicateur de la vue */
    describe(keys) { const N = { stims: 'stimulations', thermo: 'thermocoagulations', quant: 'quantifications', ccep: 'réseau CCEP', zones: 'zones', paint: 'peinture', electrodes: 'électrodes', labels: 'noms' }; return keys.map(k => N[k] || k).filter((x, i, a) => a.indexOf(x) === i).join(', '); },
    LAYER_KEYS, OFF,
  };

  // ================================================================ presse-papiers (HTML + texte)
  const CLIP_CSS = 'table{border-collapse:collapse;font:10.5pt Calibri,Arial,sans-serif}th,td{border:1px solid #999;padding:2px 6px;vertical-align:top}th{background:#eee;text-align:left}';
  function cleanClone(el) {
    const c = el.cloneNode(true);
    c.querySelectorAll('button,input,select,textarea,.no-copy,.copy-btn,[hidden]').forEach(x => x.remove());
    c.querySelectorAll('[style]').forEach(x => { const s = x.getAttribute('style') || ''; const keep = s.split(';').filter(r => /^\s*(color|background|font-weight|text-align)\s*:/.test(r) && !/var\(/.test(r)).join(';'); if (keep) x.setAttribute('style', keep); else x.removeAttribute('style'); });
    c.querySelectorAll('canvas').forEach(cv => { try { const im = document.createElement('img'); im.src = cv.toDataURL('image/png'); im.width = cv.clientWidth || cv.width; cv.replaceWith(im); } catch (e) { cv.remove(); } });
    c.querySelectorAll('svg').forEach(sv => { try { const xml = new XMLSerializer().serializeToString(sv), im = document.createElement('img'); im.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml))); im.width = sv.clientWidth || 600; sv.replaceWith(im); } catch (e) { } });
    return c;
  }
  // ================================================================ côté d'implantation d'une électrode
  /** v5 — le côté (G / D) d'une électrode est géométrique : la sortie du crâne (point d'entrée) et la majorité des plots font
   *  foi ; la pointe seule ne décide pas (une électrode gauche peut franchir la ligne médiane). Le suffixe du nom suit la
   *  convention du centre (prime A’, D/G, ou aucun) et n'est jamais la référence du côté. */
  SV.Side = {
    CONV: { prime: 'prime (A à droite, A’ à gauche)', dg: 'D / G (AD, AG)', none: 'aucun suffixe' },
    /** suffixe de nom pour un côté, selon la convention */
    suffix(hemi, conv) { conv = conv || 'prime'; return conv === 'dg' ? (hemi === 'L' ? 'G' : 'D') : conv === 'none' ? '' : hemi === 'L' ? '’' : ''; },
    name(code, hemi, conv) { return String(code) + this.suffix(hemi, conv); },
    /** côté que le nom suggère selon la convention (null : le nom ne le dit pas) — indicatif seulement */
    fromName(name, conv) { name = String(name || '').trim(); if (conv === 'dg') { const m = name.match(/\d*([DG])$/); return m ? (m[1] === 'G' ? 'L' : 'R') : null; } if (conv === 'none') return null; return /[’']$/.test(name) ? 'L' : null; },
    /** côté d'après la géométrie. o = { tip, entry, contacts, dir, length } (mm, monde du patient) ; lat(p) = abscisse signée par
     *  rapport à la ligne médiane du patient (négative à gauche ; par défaut x). Entrée franche (≥ 5 mm) → son côté ; sinon
     *  majorité des plots (ou de points le long de la tige) ; sinon la pointe. */
    of(o, lat, minEntry) {
      lat = lat || (p => p[0]); minEntry = minEntry == null ? 5 : minEntry; if (!o) return 'R';
      const along = (o.tip && o.dir && o.length > 0) ? k => o.tip.map((v, i) => v + o.dir[i] * o.length * k) : null;
      const entry = o.entry || (along ? along(1) : null);
      if (entry) { const x = lat(entry); if (Math.abs(x) >= minEntry) return x < 0 ? 'L' : 'R'; }
      let pts = o.contacts && o.contacts.length ? o.contacts : along ? [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1].map(along) : o.tip ? [o.tip] : [];
      let nL = 0, nR = 0; for (const p of pts) { const x = lat(p); if (x < 0) nL++; else if (x > 0) nR++; }
      if (nL !== nR) return nL > nR ? 'L' : 'R';
      if (entry) return lat(entry) < 0 ? 'L' : 'R';
      return o.tip && lat(o.tip) < 0 ? 'L' : 'R';
    },
  };

  // ---------------------------------------------------------------- formulaires : « libellé : valeur » (v5.1)
  const FIELD = 'input:not([type=hidden]):not([type=file]):not([type=range]):not([type=button]), select, textarea, .seg';
  /** valeur affichée d'un champ (null : vide ou non renseigné) */
  function fieldValue(f) {
    if (f.classList && f.classList.contains('seg')) { const on = f.querySelector('button.on, .on'); return on ? on.textContent.trim() : null; }
    if (f.tagName === 'SELECT') { const o = f.options[f.selectedIndex]; const t = o ? o.textContent.trim() : ''; return !f.value || /^[—–-]+$/.test(t) ? null : t; }
    if (f.type === 'checkbox' || f.type === 'radio') return f.checked ? '✓' : null;
    const v = String(f.value == null ? '' : f.value).trim(); return v || null;
  }
  /** libellé d'un champ : texte de son <label> (sans le champ), sinon libellé voisin, sinon titre */
  function fieldLabel(f) {
    const lab = f.closest('label');
    const txt = n => { const c = n.cloneNode(true); c.querySelectorAll(FIELD + ', button, .muted, small, option').forEach(x => x.remove()); return c.textContent.replace(/\s+/g, ' ').trim(); };
    if (lab) { const t = txt(lab); if (t) return t; }
    const row = f.closest('tr'); if (row) { const th = row.querySelector('th, td:first-child'); if (th && !th.contains(f)) { const t = txt(th); if (t) return t; } }
    let p = f.previousElementSibling; while (p && p.matches && p.matches(FIELD)) p = p.previousElementSibling;
    if (p && p.matches && p.matches('.lbl, b, span, strong')) { const t = txt(p); if (t && t.length < 60) return t; }
    return f.getAttribute('aria-label') || f.title || '';
  }
  /** carte-formulaire → [[libellé, valeur]] (champs renseignés, dans l'ordre) ; les lignes datées gardent leur date en tête */
  function formRows(el) {
    const out = [], seen = new Set();
    for (const f of el.querySelectorAll(FIELD)) {
      if (seen.has(f) || f.closest('.no-copy, .copy-btn, [hidden]') || (f.closest('.seg') && f.closest('.seg') !== f)) continue;
      const tr = f.closest('tr[data-id]');
      if (tr && !seen.has(tr)) {   // ligne datée : « date — texte »
        const fs = [...tr.querySelectorAll(FIELD)]; fs.forEach(x => seen.add(x)); seen.add(tr); const vals = fs.map(fieldValue).filter(Boolean);
        if (vals.length) out.push([vals.length > 1 ? vals[0] : '', vals.slice(vals.length > 1 ? 1 : 0).join(' · ')]); continue;
      }
      seen.add(f); const v = fieldValue(f); if (v == null) continue; out.push([fieldLabel(f), v]);
    }
    return out;
  }
  function tableText(el) {
    const rows = [...el.querySelectorAll('tr')]; if (rows.length) return rows.map(tr => [...tr.children].map(td => td.innerText.replace(/\s+/g, ' ').trim()).join('\t')).join('\n');
    return el.innerText;
  }
  SV.Clip = {
    /** copie un élément (tableau, carte, figure) en HTML + texte ; renvoie une promesse (true si copié) */
    async copyElement(el, opts) {
      opts = opts || {}; const title = opts.title ? `<p><b>${esc(opts.title)}</b></p>` : '';
      // carte-formulaire (champs à remplir) : « libellé : valeur » en tableau à deux colonnes, sans les champs vides
      const nF = el.querySelectorAll(FIELD).length, rows = nF >= 2 ? formRows(el) : null;
      let body, text;
      if (rows) {
        const rest = cleanClone(el); rest.querySelectorAll('.card-h, h2, h3, h4, .hint, label, .sub-h, .form, .lbl').forEach(x => x.remove());
        const extra = rest.querySelectorAll('table, img, p, li').length ? rest.outerHTML : '';
        body = (rows.length ? `<table>${rows.map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(v).replace(/\n/g, '<br>')}</td></tr>`).join('')}</table>` : '<p><i>(rien de renseigné)</i></p>') + extra;
        text = rows.map(([k, v]) => (k ? k + ' : ' : '') + v).join('\n');
      } else { const c = cleanClone(el); body = c.outerHTML; text = tableText(c); }
      const html = `<!doctype html><html><head><meta charset="utf-8"><style>${CLIP_CSS}</style></head><body style="color:#000;background:#fff">${title}${body}</body></html>`;
      text = (opts.title ? opts.title + '\n' : '') + text;
      try {
        if (navigator.clipboard && window.ClipboardItem) { await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]); return true; }
        await navigator.clipboard.writeText(text); return true;
      } catch (e) { console.warn('copie :', e); try { await navigator.clipboard.writeText(text); return true; } catch (e2) { return false; } }
    },
    /** copie une image (canvas ou data URL PNG) dans le presse-papiers */
    async copyImage(src) {
      try {
        let blob; if (src instanceof HTMLCanvasElement) blob = await new Promise(r => src.toBlob(r, 'image/png')); else if (typeof src === 'string') blob = await (await fetch(src)).blob(); else blob = src;
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); return true;
      } catch (e) { console.warn('copie image :', e); return false; }
    },
    /** pose un bouton « ⧉ » (copier) sur chaque tableau / carte / figure d'un conteneur ; idempotent */
    decorate(root, sel) {
      root = root || document; const targets = root.querySelectorAll(sel || 'table, .card, figure, .cp-copy');
      targets.forEach(el => {
        if (el.querySelector(':scope > .copy-btn') || el.closest('.no-copy') || el.closest('#timeline') || el.offsetParent === null && !el.isConnected) return;
        const b = h('button', 'copy-btn', '⧉'); b.title = 'Copier (texte mis en forme) — collage dans Word, PowerPoint, mail'; b.type = 'button';
        b.onclick = async e => { e.stopPropagation(); e.preventDefault(); const title = el.dataset.copyTitle || (el.querySelector('h2,h3,.card-title,caption') || {}).textContent; const ok = await SV.Clip.copyElement(el, { title: title && title.trim() }); b.textContent = ok ? '✓' : '✗'; b.classList.add('done'); setTimeout(() => { b.textContent = '⧉'; b.classList.remove('done'); }, 1400); if (SV.app && SV.app.toast) SV.app.toast(ok ? 'Copié (texte mis en forme + texte brut)' : 'Copie impossible', 1800); };
        const cs = getComputedStyle(el); if (cs.position === 'static') el.style.position = 'relative';
        el.classList.add('copyable'); el.appendChild(b);
      });
    },
    /** décoration automatique des tableaux et cartes des écrans (observateur de mutations, différé) */
    auto() {
      if (this._auto) return; this._auto = true;
      const ROOTS = '#scr-dossier, #scr-staff, #scr-view, #scr-imaging, .tab-body, .modal-card, #presentation .pr-slide, #presentation .slide';
      const SEL = 'table:not(.no-copy):not(.ie-tab), .card:not(.no-copy), figure:not(.no-copy), .cp-copy';
      const run = SV.U.debounce(() => { try { document.querySelectorAll(ROOTS).forEach(r => this.decorate(r, SEL)); } catch (e) { } }, 350);
      new MutationObserver(run).observe(document.body, { childList: true, subtree: true }); run();
    },
  };
  SV.Clip.formRows = formRows;

  // ================================================================ zones de texte extensibles (v5.1, partout)
  /** textarea.grow : une ligne au repos si le texte tient, s'allonge à la saisie (Entrée = retour à la ligne) ; sans
   *  ascenseur. Posé automatiquement sur toute zone ajoutée au document. */
  SV.Grow = {
    fit(ta) { ta.style.height = 'auto'; ta.style.height = (ta.scrollHeight + 2) + 'px'; },
    bind(ta) { if (ta._grow) return; ta._grow = true; ta.style.overflowY = 'hidden'; ta.addEventListener('input', () => SV.Grow.fit(ta)); ta.addEventListener('focus', () => SV.Grow.fit(ta)); requestAnimationFrame(() => { if (ta.offsetParent) SV.Grow.fit(ta); }); },
    auto() { const run = SV.U.debounce(() => document.querySelectorAll('textarea.grow').forEach(SV.Grow.bind), 60); new MutationObserver(run).observe(document.body, { childList: true, subtree: true }); run(); },
  };

  // ================================================================ messages longs : volet en haut de l'écran (v5.1)
  /** Les consignes (plus de ~90 caractères) ne s'affichent plus en bulle au milieu de la vue : volet vert sous la barre du
   *  haut, fermé d'un clic ; « ne plus afficher » les retient (ce poste). Les erreurs restent signalées (volet rouge). */
  const NOTE_KEY = 'sv_notes_off', hash = s => { let x = 0; for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) | 0; return String(x >>> 0); };
  SV.Notice = {
    off() { try { return JSON.parse(localStorage.getItem(NOTE_KEY) || '[]'); } catch (e) { return []; } },
    reset() { try { localStorage.removeItem(NOTE_KEY); } catch (e) { } },
    isError: msg => /impossible|erreur|échec|illisible|introuvable|refus|n.est pas|is not|failed|error/i.test(msg),
    show(msg, o) {
      o = o || {}; const err = o.error != null ? o.error : this.isError(msg), k = hash(msg.replace(/\d+([,.]\d+)?/g, '#'));
      if (!err && this.off().includes(k)) return;
      let el = document.getElementById('svNotice'); if (!el) { el = h('div', 'sv-notice'); el.id = 'svNotice'; document.body.appendChild(el); }
      el.className = 'sv-notice' + (err ? ' err' : ''); el.hidden = false;
      el.innerHTML = `<span class="sv-notice-t"></span>${err ? '' : '<label class="sv-notice-off"><input type="checkbox"> ne plus afficher</label>'}<button class="sv-notice-x" title="fermer">✕</button>`;
      el.querySelector('.sv-notice-t').textContent = msg;
      const close = () => { el.hidden = true; clearTimeout(this._t); };
      el.onclick = e => { const cb = e.target.closest('.sv-notice-off'); if (cb) { if (e.target.tagName === 'INPUT' && e.target.checked) { const L = this.off(); if (!L.includes(k)) L.push(k); try { localStorage.setItem(NOTE_KEY, JSON.stringify(L)); } catch (x) { } close(); } return; } close(); };
      clearTimeout(this._t); this._t = setTimeout(close, o.ms || (err ? 15000 : 12000));
    },
  };

  if (typeof document === 'undefined') return;   // chargé hors navigateur (tests)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { SV.Clip.auto(); SV.Grow.auto(); }); else { SV.Clip.auto(); SV.Grow.auto(); }
})(window.SV = window.SV || {});
