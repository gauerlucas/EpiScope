/* EpiScope — app.js : application (état, saisie, rendu des panneaux, fichiers) */
(function (SV) {
  'use strict';
  const $ = id => document.getElementById(id);
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = SV.U.esc;
  const LS = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }, del(k) { try { localStorage.removeItem(k); } catch (e) { } } };
  const SIDE_FR = { L: 'gauche', R: 'droite', B: 'bilatéral', '': '' };
  const SYS_FR = { mesial_temporal: 'temporal mésial', lateral_temporal: 'temporal latéral', basal_temporal: 'temporal basal', insulo_opercular: 'insulo-operculaire', central: 'central (rolandique)', premotor: 'prémoteur / AMS', prefrontal_lateral: 'préfrontal latéral', prefrontal_mesial: 'préfrontal mésial / cingulaire antérieur', orbitofrontal: 'orbitofrontal', posterior_medial: 'pariétal médian / cingulaire postérieur', parietal_lateral: 'pariétal latéral', occipital: 'occipital', subcortical: 'sous-cortical' };
  const sysFr = k => SYS_FR[k] || (k || '').replace(/_/g, ' ');
  const PARAM_DEFS = [
    ['s2b_weight', 'Poids Semio2Brain', 0, 1, 0.05, 'évidence statistique (onset) mêlée aux priors curés'],
    ['prop_gain', 'Gain de propagation', 0, 1, 0.05, 'plausibilité transmise à chaque saut de connectivité'],
    ['persist', 'Persistance', 0.5, 0.99, 0.01, 'une région activée reste active (par pas de 0,5 s)'],
    ['dist_lambda', 'λ distance (mm)', 5, 60, 1, 'portée de la propagation de proche en proche'],
    ['w_edges', 'Poids liens curés', 0, 1.5, 0.05, 'liens fonctionnels/structurels de network_edges.csv'],
    ['homotopic', 'Lien homotopique', 0, 1, 0.05, 'passage vers la région miroir'],
    ['onset_tau', 'τ origine (s)', 5, 60, 1, 'les signes précoces pèsent plus pour l’origine'],
    ['relay_gain', 'Gain des relais', 0, 1, 0.05, 'régions intermédiaires entre deux zones symptomatogènes'],
  ];

  const app = {
    db: null, atlas: null, viewer: null, tl: null, result: null,
    state: null, ui: { mode: 'chrono', side: '', t: 0, playing: false, selected: null, tab: 'network', hover: 0, highlight: 0, present: false, collapsed: {}, linkViews: false },
    chrono: { running: false, base: 0, start: 0 }, nextId: 1,

    // ======================================================================= démarrage
    /** identité (window.EPISCOPE_BRAND, défini en tête d'index.html) : nom, sous-titre, crédit, auteur, ORCID, version, statut, année */
    brand() {
      const b = window.EPISCOPE_BRAND || {};
      return { name: b.name || 'EpiScope', tagline: b.tagline || 'Visualize seizures', credit: b.credit || '', author: b.author || '', orcid: b.orcid || '', version: b.version || '', status: b.status || '',
        year: b.year || new Date().getFullYear(), splash: b.splash !== false };
    },
    /** v5.3 : thème clair / sombre / automatique (système) ; mémorisé sur le poste */
    setTheme(pref) {
      pref = ['light', 'dark', 'auto'].includes(pref) ? pref : 'auto'; try { localStorage.setItem('sv_theme', pref); } catch (e) { }
      const dark = pref === 'dark' || (pref === 'auto' && !(window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches)), R = document.documentElement;
      R.dataset.theme = dark ? 'dark' : 'light'; R.dataset.themePref = pref;
      const b = $('btnTheme'); if (b) b.title = `Thème ${dark ? 'sombre' : 'clair'}${pref === 'auto' ? ' (automatique, celui du système)' : ''} — cliquer pour passer en thème ${dark ? 'clair' : 'sombre'}`;
      if (this.viewer && this.viewer.setElectrodeStyle) this.viewer.setElectrodeStyle(this.stageStyle());
      this.themeFallback(R.dataset.theme); SV.Bus.emit('theme', this, R.dataset.theme);
    },
    themeName() { return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'; },
    /** navigateur sans light-dark() (Chrome / Edge avant 123) : feuilles incorporées réécrites avec les valeurs du thème */
    themeFallback(theme) {
      if (!window.CSS || !CSS.supports || CSS.supports('color', 'light-dark(#000, #fff)')) return;
      const pick = (src, light) => { let out = '', i = 0; for (;;) { const k = src.indexOf('light-dark(', i); if (k < 0) return out + src.slice(i); out += src.slice(i, k); let d = 0, j = k + 11, cut = -1; for (; j < src.length; j++) { const c = src[j]; if (c === '(') d++; else if (c === ')') { if (!d) break; d--; } else if (c === ',' && !d && cut < 0) cut = j; } out += (light ? src.slice(k + 11, cut) : src.slice(cut + 1, j)).trim(); i = j + 1; } };
      for (const st of document.querySelectorAll('style')) { if (st._ld == null) { if (st.textContent.indexOf('light-dark(') < 0) continue; st._ld = st.textContent; } st.textContent = pick(st._ld, theme === 'light'); }
    },
    /** style des électrodes de la vue 3D principale : hampes sombres sur la scène claire du thème clair */
    stageStyle() { return this.themeName() === 'light' ? 'light-bg' : 'dark-bg'; },
    /** écran d'accueil : logo, nom, sous-titre, crédit ; fondu après ~1,4 s, ou dès un clic / une touche */
    splash() {
      const B = this.brand(), el = $('splash'); document.title = `${B.name} — ${B.tagline}`;
      document.querySelectorAll('.brand .name').forEach(e => { e.textContent = B.name; });
      if (!el) return;
      const img = el.querySelector('.brain'); document.querySelectorAll('.brand .logo').forEach(i => { i.src = img.src; });   // même image (incorporée une seule fois)
      el.querySelector('.name').textContent = B.name; el.querySelector('.tagline').textContent = B.tagline; el.querySelector('.credit').textContent = B.credit ? `${B.credit} ${B.year}` : String(B.year);
      el.classList.remove('leaving', 'done');   // (une copie exportée de l'app peut contenir l'état final)
      if (!B.splash) { el.classList.add('done'); return; }
      let gone = false; const leave = () => { if (gone) return; gone = true; el.classList.add('leaving'); setTimeout(() => el.classList.add('done'), 600); };
      el.addEventListener('click', leave); window.addEventListener('keydown', leave, { once: true });
      this._splashLeave = leave;   // la tenue (1,4 s) démarre à la fin du démarrage, une fois l'application prête (voir boot)
    },
    boot() {
      try { const dens = localStorage.getItem('sv_density'); if (dens) document.documentElement.dataset.density = dens; } catch (e) { }
      this.loadBrandFont(); this.splash();
      const rawDb = window.SV_DB || JSON.parse($('sv-db').textContent), mesh = window.SV_MESH || JSON.parse($('sv-mesh').textContent);
      this.shippedDb = rawDb;
      const override = LS.get('sv_db_v1');
      this.db = new SV.DB(override && override.signs ? override : rawDb);
      if (override && override.signs) this.toast('Base de référence modifiée localement chargée (Base → Réinitialiser pour revenir à la base livrée)');
      this.atlas = new SV.Atlas(mesh, this.db);
      try { this.vol = new SV.Electrodes.Volume(window.SV_VOL || JSON.parse($('sv-vol').textContent)); } catch (e) { console.warn('volume VEP absent', e); this.vol = null; }
      this.viewer = new SV.Viewer3D($('view3d'), this.atlas, (r, kind, e) => this.onPick(r, kind, e));
      if (this.viewer.mode === 'canvas') $('glWarn').hidden = false;
      this.tl = new SV.Timeline($('timeline'), {
        onSeek: t => this.setTime(t), onSelect: ev => this.select(ev.id), onEdit: ev => this.openEvent(ev.id), onContext: (ev, e) => this.eventMenu(ev, e.clientX, e.clientY),
        onChange: (ev, patch) => { Object.assign(ev, patch); this.changed(); },
      });
      this.newCase(true);
      this.bindUI(); if (this.ensureSeeg) this.ensureSeeg(); this.renderPalette(); this.renderParams(); this.renderConnectome(); this.rebuildElectrodes(); this.restorePanels();
      this.viewer.setView('latL'); this.changed();
      if (this.bindDossierUI) this.bindDossierUI();
      if (this.startDossiers) this.startDossiers().catch(e => { console.error(e); this.toast('Bibliothèque : ' + e.message, 6000); });
      if (this._splashLeave) setTimeout(this._splashLeave, 1400);
    },

    newCase(silent) {
      this.state = { version: 1, name: '', patient: { dominant: 'L', eeg_onset: null, seizure_end: null, state: '', lesion: [] }, events: [], params: {}, electrodes: [], stims: [], thermo: [], quant: [] };
      this.nextId = 1; this.ui.selected = null; this.ui.t = 0; this.chronoReset(); this.elecs = []; this.ui.seeg = null; if (this.viewer) { this.viewer.setElectrodes([], null); if (this.refreshMarkers) this.refreshMarkers(); }
      $('caseName').value = ''; $('dominant').value = 'L'; $('eegOnset').value = ''; $('seizureEnd').value = ''; $('vigilance').value = '';
      if (!silent) { this.changed(); this.toast('Nouveau cas'); }
    },
    loadCase(c) {
      this.state = Object.assign({ version: 1, name: '', patient: { dominant: 'L', eeg_onset: null, lesion: [] }, events: [], params: {} }, c);
      this.state.patient = Object.assign({ dominant: 'L', eeg_onset: null, lesion: [] }, c.patient || {}); this.state.electrodes = c.electrodes || [];
      this.state.events.forEach(e => { e.id = e.id || this.nextId; this.nextId = Math.max(this.nextId, e.id + 1); });
      $('caseName').value = this.state.name || ''; $('dominant').value = this.state.patient.dominant; $('eegOnset').value = this.state.patient.eeg_onset == null ? '' : this.state.patient.eeg_onset;
      $('seizureEnd').value = this.state.patient.seizure_end == null ? '' : this.state.patient.seizure_end; $('vigilance').value = this.state.patient.state || '';
      this.ui.seeg = null; if (this.ensureSeeg) this.ensureSeeg();
      this.renderParams(); this.changed(); this.rebuildElectrodes();
      if (c.views && this.viewer && this.viewer.restoreLayout) { this.viewer.restoreLayout(c.views); this.ui.linkViews = !!c.views.linked; const ck = $('chkLink'); if (ck) ck.checked = this.ui.linkViews; if (this.refreshMarkers) this.refreshMarkers(); }
    },

    // ======================================================================= saisie
    addEvent(signId, opts) {
      const sign = this.db.signById.get(signId); if (!sign) return;
      let t;
      if (this.ui.mode === 'chrono') t = Math.round(this.chronoNow() * 2) / 2;
      else if (this.ui.mode === 'sequence') { const last = this.state.events.length ? Math.max(...this.state.events.map(e => e.t)) : -(+$('seqStep').value || 5); t = last + (+$('seqStep').value || 5); }
      else t = +$('manT').value || 0;
      const ev = Object.assign({ id: this.nextId++, sign_id: signId, t, dt: this.ui.mode === 'sequence' ? 3 : this.ui.mode === 'chrono' ? 1 : 1.5, dur: sign.default_duration_s, side: sign.laterality_rule === 'none' ? '' : this.ui.side, topography: '', conf: 1, note: '' }, opts || {});
      this.state.events.push(ev); this.ui.selected = ev.id; this.changed();
      if (this.ui.mode === 'manual') $('manT').value = t + 5;
      if (sign.topography_list.length && !ev.topography) this.topoPopover(ev);
      this.toast(`${sign.label_fr} ajouté à ${SV.fmtT(t)}`, 1200);
    },
    /** déplace l'événement `id` juste avant/après `targetId` dans l'ordre temporel */
    reorderEvent(id, targetId, before) {
      if (id === targetId) return;
      const evs = this.state.events.slice().sort((a, b) => a.t - b.t), mv = evs.find(e => e.id === id), tg = evs.find(e => e.id === targetId); if (!mv || !tg) return;
      const rest = evs.filter(e => e.id !== id), k = rest.indexOf(tg) + (before ? 0 : 1); rest.splice(k, 0, mv);
      if (this.ui.mode === 'sequence') { const step = +$('seqStep').value || 5; rest.forEach((e, i) => { e.t = i * step; }); }
      else { const prev = rest[k - 1], next = rest[k + 1]; let t; if (prev && next) t = (prev.t + next.t) / 2; else if (prev) t = prev.t + 2; else if (next) t = next.t - 2; else t = mv.t; mv.t = Math.round(t * 2) / 2; }
      this.changed(); this.toast('Séquence réordonnée', 1200);
    },
    duplicateEvent(id) { const ev = this.state.events.find(e => e.id === id); if (!ev) return; const c = Object.assign({}, ev, { id: this.nextId++, t: ev.t + 2 }); this.state.events.push(c); this.ui.selected = c.id; this.changed(); },
    /** menu contextuel d'un signe (liste ou frise) */
    eventMenu(ev, x, y) {
      const s = this.db.signById.get(ev.sign_id); if (!s) return;
      const items = [{ head: s.label_fr + ' · ' + SV.fmtT(ev.t) }];
      if (s.laterality_rule !== 'none') items.push({ group: 'Côté', options: [['L', 'Gauche'], ['R', 'Droite'], ['B', 'Bilatéral'], ['', 'Inconnu']].map(([v, l]) => ({ label: l, on: (ev.side || '') === v, run: () => { ev.side = v; this.changed(); } })) });
      if (s.topography_list.length) items.push({ group: 'Topographie', options: [['', '—'], ...s.topography_list.map(t => [t, SV.TOPO_LABELS[t] || t])].map(([v, l]) => ({ label: l, on: (ev.topography || '') === v, run: () => { ev.topography = v; this.changed(); } })) });
      items.push({ group: 'Certitude', options: [[1, 'certain'], [0.75, 'probable'], [0.5, 'douteux']].map(([v, l]) => ({ label: l, on: (ev.conf == null ? 1 : ev.conf) === v, run: () => { ev.conf = v; this.changed(); } })) });
      items.push({ sep: true }, { label: 'Modifier… (double-clic)', run: () => this.openEvent(ev.id) }, { label: 'Placer la tête de lecture ici', run: () => this.setTime(ev.t + 0.5) }, { label: 'Dupliquer', run: () => this.duplicateEvent(ev.id) }, { label: 'Supprimer', danger: true, run: () => this.removeEvent(ev.id) });
      this.popupMenu(items, x, y);
    },
    /** menu flottant générique : items = [{head}|{group, options:[{label,on,run}]}|{label,run,danger}|{sep}] */
    popupMenu(items, x, y) {
      this.closeMenu();
      const m = h('div', 'ctx-menu'); this._menu = m;
      for (const it of items) {
        if (it.head) { m.appendChild(h('div', 'ctx-head', esc(it.head))); continue; }
        if (it.sep) { m.appendChild(h('div', 'ctx-sep')); continue; }
        if (it.node) { m.appendChild(it.node); continue; }
        if (it.group) { const g = h('div', 'ctx-group', `<span>${esc(it.group)}</span>`); const seg = h('div', 'seg'); for (const o of it.options) { const b = h('button', o.on ? 'on' : '', esc(o.label)); b.onclick = () => { o.run(); this.closeMenu(); }; seg.appendChild(b); } g.appendChild(seg); m.appendChild(g); continue; }
        const b = h('button', 'ctx-item' + (it.danger ? ' danger' : ''), esc(it.label)); if (it.title) b.title = it.title; if (it.disabled) b.disabled = true; else b.onclick = () => { it.run(); this.closeMenu(); }; m.appendChild(b);
      }
      document.body.appendChild(m);
      const W = window.innerWidth, H = window.innerHeight, r = m.getBoundingClientRect();
      m.style.left = Math.min(x, W - r.width - 8) + 'px'; m.style.top = Math.min(y, H - r.height - 8) + 'px';
      setTimeout(() => { this._menuClose = e => { if (!m.contains(e.target)) this.closeMenu(); }; window.addEventListener('pointerdown', this._menuClose, true); }, 0);
    },
    closeMenu() { if (this._menu) { this._menu.remove(); this._menu = null; } if (this._menuClose) { window.removeEventListener('pointerdown', this._menuClose, true); this._menuClose = null; } },
    /** panneau de réglages d'une cellule de la mosaïque (vue, hémisphères, gonflé, opacité, éléments affichés) */
    /** roue d'une vue : le panneau « Affichage » unique, pour cette vue (plan_ui.js) */
    cellMenu(i, e) { const x = e.clientX, y = e.clientY; this.planMenu({ getBoundingClientRect: () => ({ left: x, right: x + 420, top: y, bottom: y }) }, i); },
    removeEvent(id) { this.state.events = this.state.events.filter(e => e.id !== id); if (this.ui.selected === id) this.ui.selected = null; this.changed(); },
    select(id) { this.ui.selected = id; this.renderSequence(); this.tl.setSelected(id); const ev = this.state.events.find(e => e.id === id); if (ev && this.result) { this.setTime(ev.t + 0.5); } },

    /** structures profondes d'une vue : affichage, opacité, hémisphère, cervelet, sélection de structures, préréglages */
    subMenu(anchor, cellIndex) {
      const V = this.viewer, i = cellIndex == null ? V.active : cellIndex, cfg = V.cells[i].cfg, F = SV.SUB_FAMS, sel = new Set(cfg.subFams || F.map(f => f.k));
      const PRE = [['all', 'Toutes', F.map(f => f.k)], ['noCb', 'Sans cervelet', F.filter(f => f.k !== 'Cerebellar-cortex').map(f => f.k)], ['mtl', 'Temporal mésial', ['Amygdala', 'Hippocampus-anterior', 'Hippocampus-posterior']], ['bg', 'Noyaux gris', ['Thalamus', 'Caudate-nucleus', 'Putamen', 'Pallidum', 'Nucleus-accumbens']]];
      const same = (a, b) => a.length === b.length && a.every(x => b.includes(x)), cur = [...sel];
      const panel = h('div', 'cell-panel sub-menu');
      panel.innerHTML = `<div class="hd">Structures profondes — vue ${i + 1}${V.linked ? ' <small>(vues liées)</small>' : ''}</div>
        <label class="row"><input type="checkbox" data-k="sub"${cfg.sub ? ' checked' : ''}> afficher</label>
        <div class="row"><span>Opacité</span><input type="range" class="sop" min="5" max="100" step="5" value="${Math.round((cfg.subOpacity == null ? 0.95 : cfg.subOpacity) * 100)}"><b class="sop-v">${Math.round((cfg.subOpacity == null ? 0.95 : cfg.subOpacity) * 100)} %</b></div>
        <div class="row"><span>Côté</span><div class="seg">${[['both', 'Les deux'], ['L', 'Gauche'], ['R', 'Droit']].map(([v, l]) => `<button data-sh="${v}" class="${(cfg.subHemi || 'both') === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        <div class="row"><span>Sélection</span><div class="seg wrap">${PRE.map(([k, l, list]) => `<button data-pre="${k}" class="${same(cur, list) ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        <div class="sub-list">${F.map(f => `<label class="row"><input type="checkbox" data-f="${f.k}"${sel.has(f.k) ? ' checked' : ''}> <i style="background:rgb(${f.color.join(',')})"></i> ${esc(f.fr)}</label>`).join('')}</div>
        <div class="btnrow"><button data-a="copy">→ toutes les vues</button></div>`;
      const set = patch => { V.setCellConfig(i, patch); };
      const reopen = () => { this.closeMenu(); this.subMenu(anchor, i); };
      panel.querySelector('[data-k=sub]').onchange = e => set({ sub: e.target.checked });
      panel.querySelector('.sop').oninput = e => { set({ sub: true, subOpacity: +e.target.value / 100 }); panel.querySelector('.sop-v').textContent = e.target.value + ' %'; };
      panel.querySelectorAll('[data-sh]').forEach(b => b.onclick = () => { set({ sub: true, subHemi: b.dataset.sh }); reopen(); });
      panel.querySelectorAll('[data-pre]').forEach(b => b.onclick = () => { const list = PRE.find(p => p[0] === b.dataset.pre)[2]; set({ sub: true, subFams: list.length === F.length ? null : list.slice() }); reopen(); });
      panel.querySelectorAll('[data-f]').forEach(x => x.onchange = () => { const list = [...panel.querySelectorAll('[data-f]')].filter(y => y.checked).map(y => y.dataset.f); set({ sub: list.length > 0, subFams: list.length === F.length ? null : list }); reopen(); });
      panel.querySelector('[data-a=copy]').onclick = () => { const c = V.cells[i].cfg; V.setAllCells({ sub: c.sub, subOpacity: c.subOpacity, subHemi: c.subHemi, subFams: c.subFams ? c.subFams.slice() : null }); this.toast('Réglages des structures profondes appliqués à toutes les vues'); };
      const r = anchor.getBoundingClientRect(); this.popupMenu([{ node: panel }], r.left, r.bottom + 4);
    },
    topoPopover(ev) {
      const sign = this.db.signById.get(ev.sign_id), old = document.querySelector('.topo-pop'); if (old) old.remove();
      const pop = h('div', 'topo-pop');
      pop.innerHTML = `<span>Topographie de « ${esc(sign.label_fr)} » :</span>`;
      for (const t of sign.topography_list) { const b = h('button', '', SV.TOPO_LABELS[t] || t); b.onclick = () => { ev.topography = t; pop.remove(); this.changed(); }; pop.appendChild(b); }
      const n = h('button', '', 'sans précision'); n.onclick = () => pop.remove(); pop.appendChild(n);
      $('search').parentElement.insertBefore(pop, $('palette'));
      setTimeout(() => pop.remove(), 12000);
    },

    renderPalette() {
      const q = $('search').value.trim(), list = this.db.search(q), box = $('palette'); box.innerHTML = '';
      const top = q ? list[0] : null; this.ui.topMatch = top ? top.id : null;
      for (const cat of SV.CATEGORIES) {
        const signs = list.filter(s => s.category === cat.id); if (!signs.length) continue;
        const head = h('div', 'chip-cat', `<i style="background:${cat.color}"></i>${cat.fr}<span class="n">${signs.length}</span>`);
        const row = h('div', 'chip-row');
        const collapsed = !q && this.ui.collapsed[cat.id];
        if (collapsed) row.hidden = true;
        head.onclick = () => { this.ui.collapsed[cat.id] = !this.ui.collapsed[cat.id]; row.hidden = !row.hidden; };
        for (const s of signs) {
          const c = h('span', 'chip' + (s.subjective ? ' subj' : '') + (top && s.id === top.id ? ' top' : ''), esc(s.label_fr));
          c.style.setProperty('--c', cat.color); c.title = (s.label_en || '') + (s.notes ? ' — ' + s.notes : '');
          c.onclick = () => this.addEvent(s.id); row.appendChild(c);
        }
        box.appendChild(head); box.appendChild(row);
      }
    },

    renderSequence() {
      const ol = $('seqList'); ol.innerHTML = '';
      for (const ev of this.state.events.slice().sort((a, b) => a.t - b.t)) {
        const s = this.db.signById.get(ev.sign_id); if (!s) continue;
        const cat = this.db.category(s.category);
        const li = h('li', ev.id === this.ui.selected ? 'sel' : ''); li.style.setProperty('--c', cat.color); li.draggable = true; li.dataset.id = ev.id;
        const lat = s.laterality_rule !== 'none';
        li.innerHTML = `<span class="grip" title="Glisser pour réordonner">⋮⋮</span><span class="t">${SV.fmtT(ev.t)}</span><span class="lab">${esc(s.label_fr)}<small> ${ev.side ? SIDE_FR[ev.side] : ''} ${ev.topography ? '· ' + (SV.TOPO_LABELS[ev.topography] || ev.topography) : ''} ${ev.conf < 1 ? '· ' + (ev.conf >= 0.75 ? 'probable' : 'douteux') : ''}</small></span>` +
          (lat ? `<span class="seg mini" title="Côté du signe">${['L', 'R', 'B', ''].map(sd => `<button data-side="${sd}" class="${(ev.side || '') === sd ? 'on' : ''}">${{ L: 'G', R: 'D', B: 'bil', '': '?' }[sd]}</button>`).join('')}</span>` : '<span></span>') +
          `<span class="x" title="supprimer">✕</span>`;
        li.querySelector('.x').onclick = e => { e.stopPropagation(); this.removeEvent(ev.id); };
        li.querySelectorAll('.seg.mini button').forEach(b => b.onclick = e => { e.stopPropagation(); ev.side = b.dataset.side; this.changed(); });
        li.onclick = () => this.select(ev.id); li.ondblclick = () => this.openEvent(ev.id);
        li.oncontextmenu = e => { e.preventDefault(); this.eventMenu(ev, e.clientX, e.clientY); };
        li.ondragstart = e => { e.dataTransfer.setData('text/plain', String(ev.id)); e.dataTransfer.effectAllowed = 'move'; li.classList.add('dragging'); };
        li.ondragend = () => li.classList.remove('dragging');
        li.ondragover = e => { e.preventDefault(); const r = li.getBoundingClientRect(); li.classList.toggle('drop-before', e.clientY < r.top + r.height / 2); li.classList.toggle('drop-after', e.clientY >= r.top + r.height / 2); };
        li.ondragleave = () => li.classList.remove('drop-before', 'drop-after');
        li.ondrop = e => { e.preventDefault(); const before = li.classList.contains('drop-before'); li.classList.remove('drop-before', 'drop-after'); this.reorderEvent(+e.dataTransfer.getData('text/plain'), ev.id, before); };
        ol.appendChild(li);
      }
      if (!this.state.events.length) ol.innerHTML = '<li class="hint" style="display:block;border:0;background:none">Aucun signe. Cliquez un signe dans la palette ou tapez son nom puis Entrée.</li>';
    },

    // ======================================================================= chrono
    chronoNow() { return this.chrono.base + (this.chrono.running ? (performance.now() - this.chrono.start) / 1000 : 0); },
    chronoToggle() {
      if (this.chrono.running) { this.chrono.base = this.chronoNow(); this.chrono.running = false; }
      else { this.chrono.start = performance.now(); this.chrono.running = true; }
      $('chronoToggle').textContent = this.chrono.running ? '❚❚ Pause' : '▶ Lecture';
      $('chronoTime').classList.toggle('running', this.chrono.running);
      if (this.chrono.running) this.chronoTick();
    },
    chronoTick() { $('chronoTime').textContent = SV.fmtT(this.chronoNow(), true); if (this.chrono.running) requestAnimationFrame(() => this.chronoTick()); },
    chronoReset() { this.chrono = { running: false, base: 0, start: 0 }; $('chronoToggle').textContent = '▶ Lecture'; $('chronoTime').classList.remove('running'); $('chronoTime').textContent = '0.0 s'; },
    chronoNudge(d) { this.chrono.base = Math.max(-600, this.chronoNow() + d); if (this.chrono.running) this.chrono.start = performance.now(); $('chronoTime').textContent = SV.fmtT(this.chronoNow(), true); },

    // ======================================================================= calcul et rendu
    changed() {
      this.state.name = $('caseName').value; this.state.patient.dominant = $('dominant').value;
      const eo = $('eegOnset').value; this.state.patient.eeg_onset = eo === '' ? null : +eo;
      const se = $('seizureEnd').value; this.state.patient.seizure_end = se === '' ? null : +se; this.state.patient.state = $('vigilance').value;
      if (this.viewer && this.viewer.layoutState) this.state.views = this.viewer.layoutState();
      if (this.persistWorkspace) this.persistWorkspace(); else LS.set('sv_case_v1', this.state);
      clearTimeout(this._ct); this._ct = setTimeout(() => this.compute(), 60);
      this.renderSequence();
    },
    compute() {
      const t0 = performance.now();
      this.result = SV.Model.compute({ events: this.state.events, patient: this.state.patient, params: this.state.params, db: this.db, atlas: this.atlas });
      const r = this.result;
      // densité du réseau (nombre de régions ≥ 0.3) pour la frise
      const density = new Float32Array(r.T); for (let k = 0; k < r.T; k++) { let n = 0; for (let i = 1; i < r.N; i++) if (r.A[k * r.N + i] >= 0.3) n++; density[k] = n; }
      this.tl.setData(this.state.events, { tmin: r.tmin, tmax: r.tmax, eegOnset: this.state.patient.eeg_onset, seizureEnd: this.state.patient.seizure_end, density, times: r.times, colorOf: ev => this.db.category((this.db.signById.get(ev.sign_id) || {}).category).color, labelOf: ev => (this.db.signById.get(ev.sign_id) || { label_fr: ev.sign_id }).label_fr });
      this.tl.setSelected(this.ui.selected);
      this.links = this.buildLinks(r);
      // couches de réseau : graphe global (neutre) + une couche par hypothèse affichée dans au moins une vue
      this.viewer.clearHypLayers();
      this.viewer.setNetwork(Object.assign({}, r.network, { labels: [] }));
      for (const c of this.viewer.cells) { c.cfg.hyps = c.cfg.hyps.filter(k => +k.slice(1) < r.hypotheses.length); for (const k of c.cfg.hyps) this.ensureHypLayer(+k.slice(1)); }
      this.viewer.onCellChange();
      this.ui.t = Math.max(r.tmin, Math.min(r.tmax, this.ui.t));
      this.setTime(this.ui.t, true);
      this.renderOnset(); this.renderTargets();
      this._lastComputeMs = performance.now() - t0;
    },
    buildLinks(r) {
      const links = [];
      const ictal = r.evInfo.filter(i => i.ictal && i.top.length);
      for (let k = 0; k + 1 < ictal.length; k++) {
        const a = ictal[k], b = ictal[k + 1];
        const relay = r.relays.find(x => x.eventFrom === r.evInfo.indexOf(a));
        const path = relay ? relay.path : [a.top[0], b.top[0]];
        if (path.length < 2 || path[0] === path[path.length - 1]) continue;
        const t0 = a.ev.t, t1 = Math.max(b.ev.t, t0 + 0.5), n = path.length - 1;
        for (let i = 0; i < n; i++) links.push({ from: path[i], to: path[i + 1], t0: t0 + (t1 - t0) * i / n, t1: t0 + (t1 - t0) * (i + 1) / n, t: t0 + (t1 - t0) * (i + 1) / n, strength: relay ? relay.amp : Math.min(a.e[path[0]], b.e[path[1]]) * 0.8 });
      }
      return links;
    },
    /** activation à l'instant t : champ global, ou dynamique conditionnée à l'hypothèse `key` ('h0'…) ; par défaut la source de la vue active */
    activationAt(t, key) {
      const r = this.result; if (!r) return new Float32Array(this.atlas.N);
      const k = Math.max(0, Math.min(r.T - 1, Math.round((t - r.tmin) / r.params.step)));
      if (key === undefined) key = this.viewer.sourceOf(this.viewer.activeCfg);
      const H = key && key !== 'global' ? r.hypotheses[+key.slice(1)] : null, A = H && H.A ? H.A : r.A;
      return A.subarray(k * r.N, (k + 1) * r.N);
    },
    /** hypothèse affichée seule dans la vue active, sinon null */
    activeHyp() { const k = this.viewer.sourceOf(this.viewer.activeCfg); return k === 'global' || !this.result ? null : this.result.hypotheses[+k.slice(1)] || null; },
    /** clés des couches d'hypothèses affichées dans au moins une vue */
    shownHypKeys() { const s = new Set(); for (const c of this.viewer.cells) for (const k of c.cfg.hyps) s.add(k); return [...s]; },
    /** couche de réseau d'une hypothèse (dynamique conditionnée à son origine, teinte propre) */
    ensureHypLayer(i) {
      const r = this.result; if (!r || !r.hypotheses[i]) return; const H = r.hypotheses[i], key = 'h' + i;
      if (this.viewer.layers.has(key) && this.viewer.layers.get(key).net._hyp === H) return;
      SV.Model.hypothesisDynamics(r, H);
      const labels = H.trajectory.filter(n => n.origin || n.signs.length).slice(0, 9).map(n => ({ region: n.region, text: esc(this.atlas.label(n.region).replace(/ [GD]$/, '')), sub: (n.origin ? 'H' + (i + 1) + ' · origine supposée' : n.signs.slice(0, 3).map(s => s.label_fr).join(', ') + (n.signs.length > 3 ? ' …' : '')), origin: !!n.origin }));
      this.viewer.setLayer(key, Object.assign({}, H.network, { labels, _hyp: H }), SV.hypColor(i));
    },
    setTime(t, force) {
      this.ui.t = t; this.tl.setTime(t); $('tCur').textContent = SV.fmtT(t, true).replace('.', ',');
      const acts = {}; for (const k of this.shownHypKeys()) { this.ensureHypLayer(+k.slice(1)); acts[k] = this.activationAt(t, k); }
      this.viewer.setActivations(this.activationAt(t, 'global'), acts, this.ui.highlight);
      const a = this.activationAt(t);
      this.viewer.setTime(t);
      if (this.ui.dock && this.slices && this.ui.slv && this.ui.slv.labels === 'act' && this.refreshActSlices) this.refreshActSlices();
      this.renderCaption(t);
      if (this.ui.tab === 'network' || force) this.renderNetwork(a);
    },
    renderCaption(t) {
      const box = $('caption'); box.innerHTML = '';
      for (const ev of this.state.events) {
        if (t < ev.t - 0.01 || t > ev.t + Math.max(ev.dur || 0, 1)) continue;
        const s = this.db.signById.get(ev.sign_id); if (!s) continue;
        const d = h('div', 'cap', `${esc(s.label_fr)}<small>${ev.side ? SIDE_FR[ev.side] : ''}${ev.topography ? ' · ' + (SV.TOPO_LABELS[ev.topography] || '') : ''}</small>`);
        d.style.setProperty('--c', this.db.category(s.category).color); box.appendChild(d);
      }
    },

    renderNetwork(a) {
      const box = $('tab-network'); if (!this.result) return;
      const idx = []; for (let i = 1; i < this.atlas.N; i++) if (a[i] >= 0.12) idx.push(i);
      idx.sort((x, y) => a[y] - a[x]);
      const items = idx.slice(0, 18).map(i => this.regionRow(i, a[i], this.whyAt(i))).join('');
      const H = this.activeHyp();
      box.innerHTML = `<div class="sub-h">Régions plausiblement actives à ${SV.fmtT(this.ui.t, true)}${H ? ' · <span style="color:' + SV.hypCss(H.index) + '">H' + (H.index + 1) + '</span>' : ''}</div>` + (H ? `<div class="hint" style="margin-bottom:6px">Vue active : dynamique conditionnée à l’origine « ${esc(this.atlas.label(H.origin))} » (tenue active dès ${SV.fmtT(H.trajectory[0].t)}).</div>` : '') + (items || '<div class="hint">Rien à cet instant.</div>');
      this.bindRows(box);
    },
    whyAt(i) {
      const r = this.result, k = Math.max(0, Math.min(r.T - 1, Math.round((this.ui.t - r.tmin) / r.params.step))), base = k * r.N;
      const e = r.E[base + i], rel = r.R[base + i], a = r.A[base + i];
      if (e >= a - 1e-3) { const ev = this.evDriving(i); return ev ? 'évidence directe : ' + esc(ev.sign.label_fr) : 'évidence directe'; }
      if (rel >= a - 1e-3) return 'relais entre deux zones symptomatogènes';
      // propagation / persistance : trouver le voisin le plus contributif
      let bj = 0, bv = 0; const prev = Math.max(0, k - 1) * r.N;
      for (let j = 1; j < r.N; j++) { const v = r.C[i * r.N + j] * r.A[prev + j]; if (v > bv) { bv = v; bj = j; } }
      if (r.A[prev + i] * r.params.persist >= a - 1e-3) return 'persistance d’une activation antérieure';
      return bj ? 'propagée depuis ' + esc(this.atlas.label(bj)) : '';
    },
    evDriving(i) { let best = null, bv = 0; for (const info of this.result.evInfo) { const g = Math.abs(this.ui.t - info.ev.t) <= Math.max(info.ev.dur || 0, 1) + (info.ev.dt || 0) + 2 ? 1 : 0; if (g && info.e[i] > bv) { bv = info.e[i]; best = info; } } return best; },
    regionRow(i, v, why, extra) {
      const col = SV.cssRamp(v), sys = this.atlas.system(i);
      return `<div class="rk${i === this.ui.highlight ? ' hl' : ''}" data-r="${i}"><span class="nm">${esc(this.atlas.label(i))}<small>${esc(sys.replace(/_/g, ' '))}</small>${extra || ''}</span><span class="v">${v.toFixed(2)}</span><span class="bar"><i style="width:${Math.round(v * 100)}%;background:${col}"></i></span>${why ? `<span class="why">${why}</span>` : ''}</div>`;
    },
    bindRows(box) {
      box.querySelectorAll('.rk,[data-r],.mem,.tn').forEach(el => {
        el.onclick = () => { const r = +el.dataset.r; this.ui.highlight = this.ui.highlight === r ? 0 : r; this.viewer.setActivation(this.activationAt(this.ui.t), this.ui.highlight); box.querySelectorAll('.hl').forEach(x => x.classList.remove('hl')); if (this.ui.highlight) el.classList.add('hl'); };
      });
    },
    renderOnset() {
      const box = $('tab-onset'), r = this.result; if (!r) return;
      const pL = Math.round(r.lateralization.pL * 100);
      let html = `<div class="sub-h">Latéralisation</div><div class="lat-bar"><span class="L" style="width:${pL}%">G ${pL} %</span><span class="R" style="width:${100 - pL}%">D ${100 - pL} %</span></div>`;
      html += `<div class="hint">${r.lateralization.votes.length ? r.lateralization.votes.map(v => esc(v.sign.label_fr) + ' → ' + (v.hemi === 'L' ? 'G' : 'D') + ' <i>(' + (v.lv || 0).toFixed(2) + ')</i>').join(' · ') : 'Aucun signe latéralisant : les deux hémisphères restent équivalents. Précisez le côté des signes moteurs/sensitifs, ou la dominance.'}</div>`;
      if (r.latency != null) html += `<div class="note">Latence clinique ${SV.fmtT(r.latency)} entre le début EEG et le premier signe${r.latency >= 10 ? ' : une origine cliniquement silencieuse, à un ou deux relais de la première zone symptomatogène, est favorisée' : ' : le premier signe reflète probablement la zone d’origine elle-même'}.</div>`;
      html += `<div class="sub-h">Hypothèses de réseau épileptogène</div><div class="hint" style="margin-bottom:6px">Chaque hypothèse est une trajectoire : une origine, puis le chemin de connectivité qui rejoint, dans l’ordre d’apparition, la zone symptomatogène de chaque signe. « ordre » mesure si les zones s’éloignent de l’origine à mesure que les signes apparaissent ; l’implantation se conçoit pour départager ces trajectoires.</div>`;
      r.hypotheses.forEach(H => { html += this.hypCard(H); });
      if (!r.hypotheses.length) html += '<div class="hint">Aucune hypothèse : saisissez au moins un signe ictal.</div>';
      html += `<div class="sub-h">Régions d’origine candidates</div><div class="hint" style="margin-bottom:6px">Score = capacité à expliquer toute la séquence (signes précoces pondérés, rôles onset/symptomatogène/propagation), via la connectivité ; « silencieuse » = sans zone symptomatogène propre.</div>`;
      for (const c of r.candidates.slice(0, 12)) {
        const why = c.explain.filter(x => x.value > 0.15).slice(0, 4).map(x => esc(x.sign.label_fr) + (x.direct ? '' : x.via ? ' <i>(via relais)</i>' : ' <i>(lien)</i>')).join(' · ');
        const extra = (c.silent ? '<span class="badge silent">silencieuse ?</span>' : '') + (this.state.patient.lesion.includes(c.region) ? '<span class="badge les">lésion</span>' : '');
        html += this.regionRow(c.region, c.score, why, extra);
      }
      html += `<div class="sub-h">Lésion / hypothèse a priori</div><div class="hint">Cliquez une région dans la vue 3D puis « marquer comme lésion » pour renforcer cette hypothèse (×1,6).</div><div class="btnrow" id="lesionRow"></div>`;
      box.innerHTML = html; this.bindRows(box); this.renderLesionRow();
      box.querySelectorAll('[data-hyp]').forEach(b => b.onclick = e => { e.stopPropagation(); this.toggleHypothesis(+b.dataset.hyp); });
    },
    hypCard(H) {
      const r = this.result, shown = this.viewer.activeCfg.hyps.includes('h' + H.index), col = SV.hypCss(H.index);
      const link = H.index === 0 ? '' : H.linkToTop >= 0.5 ? `<span class="badge">liée à H1 (${H.linkToTop.toFixed(2)})</span>` : '<span class="badge">indépendante de H1</span>';
      const sil = H.silent ? '<span class="badge silent">origine silencieuse ?</span>' : '';
      const traj = H.trajectory.map(n => `<span class="tn${n.origin ? ' org' : n.relay ? ' rel' : ''}" data-r="${n.region}" title="${n.origin ? 'origine supposée' : n.relay ? 'relais' : 'zone symptomatogène'} · ${SV.fmtT(n.t)}">${n.origin ? '◉ ' : ''}${esc(this.atlas.label(n.region).replace(/ [GD]$/, ''))}${n.signs.length ? `<small>${n.signs.map(s => esc(s.label_fr)).join(', ')}</small>` : ''}</span>`).join('<span class="ta">→</span>');
      const ex = H.explained.map(x => esc(x.sign.label_fr)).join(', '), part = H.partial.map(x => esc(x.sign.label_fr)).join(', '), un = H.unexplained.map(s => esc(s.label_fr)).join(', ');
      const conc = H.nPairs > 0 ? `<span class="badge${H.conc >= 0.75 ? ' ok' : H.conc < 0.5 ? ' warn' : ''}" title="concordance entre l’ordre d’apparition des signes et l’éloignement des zones depuis l’origine (${H.nPairs.toFixed(1)} paires pondérées)">ordre ${Math.round(H.conc * 100)} %</span>` : '<span class="badge" title="une seule zone symptomatogène : l’ordre ne départage pas">ordre non testable</span>';
      return `<div class="hyp${H.index === 0 ? ' top' : ''}${shown ? ' shown' : ''}" style="--hue:${col}" data-hi="${H.index}"><div class="hyp-h"><b style="color:${col}">H${H.index + 1}</b> ${esc(H.name)} <small>${H.hemi === 'L' ? 'gauche' : 'droit'}</small> <span class="kv">${H.score.toFixed(2)}</span>${conc}${sil}${link}<button class="mini-btn${shown ? ' on' : ''}" data-hyp="${H.index}" title="${this.ui.linkViews ? 'dans toutes les vues (vues liées)' : 'dans la vue active'}">${shown ? '● masquer le réseau' : '○ voir le réseau'}</button></div>
        <div class="hyp-bar"><i style="width:${Math.round(H.score * 100)}%"></i></div>
        <div class="hyp-t">${traj}</div>
        <div class="hyp-x">${ex ? '<b>explique</b> ' + ex : ''}${part ? ' · <b>en partie</b> ' + part : ''}${un ? ' · <b>n’explique pas</b> ' + un : ''}</div></div>`;
    },
    /** affiche / masque le réseau d'une hypothèse dans la vue active (ou toutes si les vues sont liées) ; plusieurs
     *  hypothèses peuvent être superposées, chacune dans sa teinte ; aucune = graphe global neutre */
    toggleHypothesis(i) {
      const r = this.result; if (!r || !r.hypotheses[i]) return; const H = r.hypotheses[i], key = 'h' + i;
      const on = !this.viewer.activeCfg.hyps.includes(key); if (on) this.ensureHypLayer(i);
      this._opacBefore = this._opacBefore || {};
      for (const ci of this.viewer.targetCells()) {
        const cfg = this.viewer.cells[ci].cfg, hyps = cfg.hyps.filter(k => k !== key); if (on) hyps.push(key);
        if (on && !cfg.hyps.length && cfg.opacity > 0.4) { this._opacBefore[ci] = cfg.opacity; this.viewer.setCellConfig(ci, { hyps, opacity: 0.3 }, true); }
        else if (!on && !hyps.length && this._opacBefore[ci] != null) { this.viewer.setCellConfig(ci, { hyps, opacity: this._opacBefore[ci] }, true); delete this._opacBefore[ci]; }
        else this.viewer.setCellConfig(ci, { hyps }, true);
      }
      this.ui.highlight = on ? H.origin : 0;
      if (on) this.toast(`H${i + 1} en ${['bleu', 'jaune', 'vert', 'rose'][i % 4]} : réseau conditionné à l’origine « ${this.atlas.label(H.origin)} »${this.ui.linkViews ? ' (toutes les vues)' : ' (vue active)'}`, 3500);
      this.setTime(this.ui.t); if (this.ui.tab === 'onset') this.renderOnset(); if (this.ui.tab === 'targets') this.renderTargets();
    },
    renderLesionRow() {
      const row = $('lesionRow'); if (!row) return; row.innerHTML = '';
      for (const i of this.state.patient.lesion) { const b = h('button', '', esc(this.atlas.label(i)) + ' ✕'); b.onclick = () => { this.state.patient.lesion = this.state.patient.lesion.filter(x => x !== i); this.changed(); }; row.appendChild(b); }
      if (this.ui.highlight && !this.state.patient.lesion.includes(this.ui.highlight)) { const b = h('button', 'primary', 'Marquer « ' + esc(this.atlas.label(this.ui.highlight)) + ' » comme lésion'); b.onclick = () => { this.state.patient.lesion.push(this.ui.highlight); this.changed(); }; row.appendChild(b); }
    },
    renderTargets() {
      const box = $('tab-targets'), r = this.result; if (!r) return;
      const pL = r.lateralization.pL, pFav = Math.max(pL, 1 - pL);
      let html = `<div class="hint">Synthèse pour la discussion d’implantation : chaque hypothèse de réseau doit être échantillonnée, ainsi que les voies de propagation qui les relient ; les structures retenues sont des régions VEP, à traduire en trajectoires d’électrodes.</div>`;
      if (pFav < 0.7) html += `<div class="note">Latéralisation incertaine (G ${Math.round(pL * 100)} % / D ${Math.round(100 - pL * 100)} %) : précisez le côté des signes ou prévoyez des arguments non cliniques ; une exploration bilatérale peut se discuter.</div>`;
      r.hypotheses.forEach(H => {
        html += `<div class="sub-h">H${H.index + 1} · ${esc(H.name)} ${H.hemi === 'L' ? 'gauche' : 'droit'} <span class="kv">${H.score.toFixed(2)}</span></div>`;
        H.members.slice(0, 7).forEach(m => { html += `<div class="target${m.origin && m.silent ? ' silent' : ''}${m.relay ? ' relay' : ''}" data-r="${m.region}"><b>${esc(this.atlas.label(m.region))}</b> <span class="kv">${SV.fmtT(m.trajT)}</span><div class="r">${m.origin ? 'origine supposée' + (m.silent ? ', cliniquement silencieuse' : '') : m.relay ? 'relais de propagation' : 'zone symptomatogène : ' + m.trajSigns.map(s => esc(s.label_fr)).join(', ')}</div></div>`; });
      });
      const relays = r.targets.filter(t => [...t.reasons].some(x => x.includes('relais')));
      if (relays.length) { html += `<div class="sub-h">Voies de propagation (relais entre signes)</div>`; relays.forEach(t => { html += `<div class="target" data-r="${t.region}"><b>${esc(this.atlas.label(t.region))}</b> <span class="kv">${t.score.toFixed(2)}</span></div>`; }); }
      const early = r.targets.filter(t => t.reasons.has('zone symptomatogène précoce') && !r.hypotheses.some(H => H.members.some(m => m.region === t.region)));
      if (early.length) { html += `<div class="sub-h">Zones symptomatogènes précoces hors hypothèses</div>`; early.forEach(t => { html += `<div class="target" data-r="${t.region}"><b>${esc(this.atlas.label(t.region))}</b> <span class="kv">${t.score.toFixed(2)}</span></div>`; }); }
      html += `<div class="btnrow"><button id="copyTargets">Copier la synthèse</button></div>`;
      html += `<div class="sub-h">Ordre d’activation estimé</div>`;
      const order = []; for (let i = 1; i < r.N; i++) if (!isNaN(r.firstT[i]) && r.peak[i] >= 0.45) order.push(i);
      order.sort((a, b) => r.firstT[a] - r.firstT[b] || r.peak[b] - r.peak[a]);
      html += order.slice(0, 20).map(i => `<div class="rk" data-r="${i}"><span class="nm">${esc(this.atlas.label(i))}</span><span class="v">${SV.fmtT(r.firstT[i])}</span></div>`).join('') || '<div class="hint">—</div>';
      box.innerHTML = html; this.bindRows(box);
      $('copyTargets').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(this.targetsText()).then(() => this.toast('Synthèse copiée')); };
    },
    targetsText() {
      const r = this.result, lat = Math.round(r.lateralization.pL * 100);
      const lines = [`EpiScope — ${this.state.name || 'cas'} — latéralisation G ${lat} % / D ${100 - lat} %`];
      lines.push('Séquence : ' + this.state.events.slice().sort((a, b) => a.t - b.t).map(e => `${SV.fmtT(e.t)} ${(this.db.signById.get(e.sign_id) || {}).label_fr}${e.side ? ' (' + SIDE_FR[e.side] + ')' : ''}`).join(' → '));
      if (r.latency != null) lines.push(`Latence clinique : ${SV.fmtT(r.latency)}`);
      r.hypotheses.forEach(H => lines.push(`H${H.index + 1} ${H.name} ${H.hemi === 'L' ? 'G' : 'D'} (${H.score.toFixed(2)}${H.nPairs > 0 ? ', ordre ' + Math.round(H.conc * 100) + ' %' : ''}${H.silent ? ', origine silencieuse ?' : ''}) : ${H.trajectory.map(n => (n.origin ? 'origine ' : n.relay ? 'relais ' : '') + this.atlas.label(n.region) + (n.signs.length ? ' [' + n.signs.map(s => s.label_fr).join(', ') + ']' : '')).join(' → ')}${H.unexplained.length ? ' ; n’explique pas ' + H.unexplained.map(x => x.label_fr).join(', ') : ''}`));
      const relays = r.targets.filter(t => [...t.reasons].some(x => x.includes('relais')));
      if (relays.length) lines.push('Relais : ' + relays.map(t => this.atlas.label(t.region)).join(', '));
      return lines.join('\n');
    },
    renderParams() {
      const box = $('tab-params'); box.innerHTML = '';
      const p = Object.assign({}, SV.Model.DEFAULT_PARAMS, this.state.params);
      for (const [k, lab, min, max, step, d] of PARAM_DEFS) {
        const w = h('div', 'param'); w.innerHTML = `<label>${lab}<span class="val">${p[k]}</span></label><input type="range" min="${min}" max="${max}" step="${step}" value="${p[k]}"><div class="d">${d}</div>`;
        const inp = w.querySelector('input'), val = w.querySelector('.val');
        inp.oninput = () => { val.textContent = inp.value; this.state.params[k] = +inp.value; clearTimeout(this._pt); this._pt = setTimeout(() => this.changed(), 120); };
        box.appendChild(w);
      }
      const reset = h('button', '', 'Valeurs par défaut'); reset.onclick = () => { this.state.params = {}; this.renderParams(); this.changed(); }; box.appendChild(reset);
      box.appendChild(h('div', 'note', 'Les réglages sont enregistrés avec le cas. Le filtre Semio2Brain embarqué est « ' + esc(this.db.s2bFilter) + ' » (voir data/README_semio2brain.md).'));
    },
    renderConnectome() {
      const box = $('tab-connectome'), A = this.atlas;
      const st = kind => { const M = kind === 'sc' ? A.patientSC : A.patientFC; if (!M) return '<span class="muted">aucun (prior normatif : adjacence + distance + liens curés)</span>'; let n = 0; for (let i = 0; i < M.length; i++) if (M[i] > 0) n++; return `<span class="ok">chargé</span> · ${Math.round(n / 2)} connexions non nulles`; };
      box.innerHTML = `<div class="sub-h">Connectivité structurelle du patient (VEP)</div><div>${st('sc')}</div>
        <div class="hint" style="margin:6px 0">Sortie du pipeline VEP/TVB : <code>weights.txt</code> (matrice N×N, comptes de fibres) + <code>centres.txt</code> (nom x y z, noms VEP « Left-… / Right-… »). Sélectionnez les deux fichiers ensemble. Les comptes sont passés en log et normalisés.</div>
        <div class="btnrow"><button id="scLoad">Charger weights + centres…</button><button id="scClear">Retirer</button></div>
        <div class="param"><label>Poids du connectome patient<span class="val" id="alphaVal">${(this.state.params.patient_alpha ?? SV.Model.DEFAULT_PARAMS.patient_alpha)}</span></label><input type="range" id="alphaRange" min="0" max="1" step="0.05" value="${this.state.params.patient_alpha ?? SV.Model.DEFAULT_PARAMS.patient_alpha}"><div class="d">0 = prior normatif seul ; 1 = le connectome patient prime</div></div>
        <div class="sub-h">Connectivité fonctionnelle (rs-fMRI)</div><div>${st('fc')}</div>
        <div class="hint" style="margin:6px 0">Matrice de corrélations N×N en VEP + fichier de noms (même format). Les valeurs absolues normalisées renforcent les liens.</div>
        <div class="btnrow"><button id="fcLoad">Charger FC + noms…</button><button id="fcClear">Retirer</button></div>
        <div class="param"><label>Poids FC<span class="val" id="fcVal">${(this.state.params.fc_alpha ?? SV.Model.DEFAULT_PARAMS.fc_alpha)}</span></label><input type="range" id="fcRange" min="0" max="1" step="0.05" value="${this.state.params.fc_alpha ?? SV.Model.DEFAULT_PARAMS.fc_alpha}"></div>
        <div class="note">Prior normatif livré : adjacence sur fsaverage5, décroissance exponentielle par distance (λ réglable), ${this.db.edges.length} liens longue distance curés (network_edges.csv). Un connectome de groupe (ex. F-TRACT ou HCP re-parcellé en VEP) peut être chargé par le même bouton.</div>`;
      $('scLoad').onclick = () => { $('fileSC').value = ''; $('fileSC').click(); };
      $('fcLoad').onclick = () => { $('fileFC').value = ''; $('fileFC').click(); };
      $('scClear').onclick = () => { A.clearPatient('sc'); this.renderConnectome(); this.changed(); };
      $('fcClear').onclick = () => { A.clearPatient('fc'); this.renderConnectome(); this.changed(); };
      $('alphaRange').oninput = e => { $('alphaVal').textContent = e.target.value; this.state.params.patient_alpha = +e.target.value; clearTimeout(this._pt); this._pt = setTimeout(() => this.changed(), 120); };
      $('fcRange').oninput = e => { $('fcVal').textContent = e.target.value; this.state.params.fc_alpha = +e.target.value; clearTimeout(this._pt); this._pt = setTimeout(() => this.changed(), 120); };
    },
    async loadMatrixFiles(files, kind) {
      const texts = {}; for (const f of files) texts[f.name.toLowerCase()] = await f.text();
      const names = Object.keys(texts);
      const nameFile = names.find(n => /centr|name|label|region/.test(n)), matFile = names.find(n => n !== nameFile);
      if (!nameFile || !matFile) { this.toast('Il faut deux fichiers : la matrice et la liste des noms (centres.txt)'); return; }
      const regNames = texts[nameFile].split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => l.split(/[\s,;]+/)[0]);
      const rows = texts[matFile].split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => l.split(/[\s,;]+/).map(Number));
      if (rows.length !== regNames.length || rows.some(r => r.length !== regNames.length)) { this.toast(`Dimensions incohérentes : ${rows.length}×${rows[0] ? rows[0].length : 0} vs ${regNames.length} noms`); return; }
      const res = this.atlas.setPatientMatrix(kind, rows, regNames);
      this.toast(`${kind === 'sc' ? 'Connectome structurel' : 'FC'} : ${res.matched}/${regNames.length} régions reconnues` + (res.missing.length ? ' (non reconnues : ' + res.missing.slice(0, 5).join(', ') + (res.missing.length > 5 ? '…' : '') + ')' : ''), 5000);
      this.renderConnectome(); this.changed();
    },

    // ======================================================================= électrodes SEEG
    rebuildElectrodes() {
      if (!this.vol) { this.elecs = []; return; }
      this.elecs = (this.state.electrodes || []).map(spec => this.buildElectrodeFor ? this.buildElectrodeFor(spec) : SV.Electrodes.build(spec, this.atlas, this.vol)).filter(Boolean);
      SV.Electrodes.crossings(this.elecs);
      this.viewer.setElectrodes(this.elecs, this.ui.selElec);
      if (this.refreshMarkers) this.refreshMarkers();
      if (this.ui.tab === 'electrodes') this.renderElectrodes(); if (this.ui.tab === 'stims') this.renderStims(); if (this.ui.tab === 'thermo') this.renderThermo(); if (this.ui.tab === 'quant') this.renderQuant();
      if (this.persistWorkspace) this.persistWorkspace();
    },
    /** géométrie d'une électrode prévue sur le gabarit (réglages de profondeur et de longueur, quel que soit l'affichage) */
    templateElec(id) { const spec = (this.state.electrodes || []).find(e => e.id === id); return spec && spec.target ? SV.Electrodes.build(spec, this.atlas, this.vol) : null; },
    selectElectrode(id) { this.ui.selElec = this.ui.selElec === id ? null : id; this.viewer.setElectrodes(this.elecs, this.ui.selElec); if (this.ui.tab !== 'electrodes') this.setTab('electrodes'); else this.renderElectrodes(); },
    proposeElectrodes() {
      if (!this.result || !this.vol) return;
      const opts = { max: +$('elMax').value || 12, hemi: $('elHemi').value, contralateral: $('elContra').checked, allowPosterior: $('elPost').checked, maker: $('elMaker').value, sideConv: this.sideConv() };
      const P = SV.Electrodes.propose(this.result, this.atlas, this.vol, opts);
      const manual = (this.state.electrodes || []).filter(e => !e.auto);
      this.state.electrodes = manual.concat(P.electrodes.map(SV.Electrodes.serialize));
      this.ui.selElec = null; this.rebuildElectrodes();
      this.toast(`${P.electrodes.length} électrodes proposées (${P.hemis.map(h => h === 'L' ? 'G' : 'D').join(' + ')})` + (P.uncovered.length ? ' · non échantillonnées : ' + P.uncovered.slice(0, 4).map(r => this.atlas.label(r)).join(', ') : ''), 6000);
    },
    addElectrode(libCode, hemi) {
      const lib = SV.Electrodes.LIBRARY.find(l => l.code === libCode); if (!lib || !this.vol) return;
      const e = SV.Electrodes.fromLibrary(lib, hemi, this.atlas, this.vol, { maker: $('elMaker').value, sideConv: this.sideConv() }); if (!e) { this.toast('Trajectoire impossible sur le gabarit'); return; }
      e.id = 'm' + Date.now().toString(36); e.auto = false;
      if (this.elecs.some(x => x.name === e.name)) e.name = e.name.replace(/(’?)$/, (m) => '2' + m);
      this.state.electrodes = (this.state.electrodes || []).concat([SV.Electrodes.serialize(e)]); this.ui.selElec = e.id; this.rebuildElectrodes();
    },
    /** mode « + au clic » : chaque clic sur une parcelle pose une électrode orthogonale entrant à cet endroit */
    setAddMode(on) {
      this.ui.addElec = on == null ? !this.ui.addElec : on; $('view3d').classList.toggle('adding', !!this.ui.addElec); this.updatePickFilter();
      if (this.ui.addElec) this.toast('Mode ajout : cliquez une parcelle en 3D pour y poser une électrode orthogonale (Échap pour quitter)', 6000);
      if (this.ui.tab === 'electrodes') this.renderElectrodes();
    },
    /** trajectoires de bibliothèque construites sur le gabarit, par hémisphère (pour nommer une électrode posée à la main) */
    libraryGeometry(hemi) {
      this._libGeo = this._libGeo || {}; if (this._libGeo[hemi]) return this._libGeo[hemi];
      return this._libGeo[hemi] = SV.Electrodes.LIBRARY.map(l => SV.Electrodes.fromLibrary(l, hemi, this.atlas, this.vol, {})).filter(Boolean);
    },
    addElectrodeAtPoint(P, region) {
      if (!this.vol || !P) return;
      if (this.viewToTemplate) P = this.viewToTemplate(P);   // clic sur l'anatomie du patient : position ramenée sur le gabarit
      const hemi = region ? this.atlas.hemiOf[region] : (P[0] < 0 ? 'L' : 'R'), lat = hemi === 'L' ? -1 : 1;
      // cible : on s'enfonce depuis le point cliqué, orthogonalement, jusqu'à la limite des structures profondes
      // (noyaux gris, ventricule, ligne médiane, sortie du cerveau), hippocampe et amygdale compris
      const deep = new Set(['Thalamus', 'Caudate-nucleus', 'Putamen', 'Pallidum', 'Nucleus-accumbens', 'Cerebellar-cortex']);
      let T = P.slice(), out = 0;
      for (let s = 1; s <= 60; s++) {
        const q = [P[0] - lat * s, P[1], P[2]], l = this.vol.labelAt(q[0], q[1], q[2]);
        if (lat * q[0] < 3 || l === 201) break;
        if (l === 0) { if (s > 4 && ++out >= 6) break; continue; } else out = 0;
        if (l >= 1 && l <= 162 && deep.has(this.atlas.region(l).family)) break;
        T = q;
      }
      const tl = this.vol.labelAt(T[0], T[1], T[2]), targetIndex = tl >= 1 && tl <= 162 ? tl : region;
      const probe = SV.Electrodes.build({ code: 'E', name: 'E', hemi, target: T, targetIndex, maker: $('elMaker') ? $('elMaker').value : 'DIXI' }, this.atlas, this.vol);
      if (!probe) { this.toast('Trajectoire impossible sur le gabarit'); return; }
      // nom : trajectoire conventionnelle la plus proche (distance entre entrées), sinon initiales de la région
      let best = null, bd = Infinity;
      for (const g of this.libraryGeometry(hemi)) { const d = Math.hypot(g.entry[0] - probe.entry[0], g.entry[1] - probe.entry[1], g.entry[2] - probe.entry[2]); if (d < bd) { bd = d; best = g; } }
      const regFr = (this.db.regionByFamily.get(this.atlas.region(targetIndex).family) || { label_fr: '' }).label_fr;
      let code = best && bd <= 22 ? best.code : regFr.split(/[\s-]+/).map(w => w[0]).join('').toUpperCase().slice(0, 3) || 'E';
      const sfx = SV.Side.suffix(hemi, this.sideConv()); let name = code + sfx; if (this.elecs.some(x => x.name === name)) name = code + '2' + sfx;
      const e = Object.assign(probe, { code, name, fr: (best && bd <= 22 ? best.fr + ' · ' : '') + regFr, id: 'm' + Date.now().toString(36), auto: false, oblique: false });
      this.state.electrodes = (this.state.electrodes || []).concat([SV.Electrodes.serialize(e)]); this.ui.selElec = e.id; this.rebuildElectrodes();
      if (this.ui.tab !== 'electrodes') this.setTab('electrodes');
      this.toast(`${name} posée${best && bd <= 22 ? ' (proche de ' + best.name + ')' : ''} : ${e.nContacts} plots, ${e.length.toFixed(0)} mm — réglez longueur et position dans la carte`, 5000);
    },
    addElectrodeOnRegion(r) {
      if (!r || !this.vol) return; const reg = this.atlas.region(r), hemi = reg.hemi;
      const libs = SV.Electrodes.LIBRARY.filter(l => l.target === reg.family), lib = libs.find(l => !l.oblique) || libs[0];
      if (lib) return this.addElectrode(lib.code, hemi);
      const c = this.vol.nearestOf(r, reg.centroid, 14) || reg.centroid;
      const code = (this.db.regionByFamily.get(reg.family) || { label_fr: reg.family }).label_fr.split(/[\s-]+/).map(w => w[0]).join('').toUpperCase().slice(0, 3);
      const e = SV.Electrodes.build({ code, name: SV.Side.name(code, hemi, this.sideConv()), hemi, target: c, targetIndex: r, fr: this.db.regionByFamily.get(reg.family).label_fr, maker: $('elMaker').value }, this.atlas, this.vol);
      if (!e) { this.toast('Trajectoire impossible sur le gabarit'); return; }
      e.id = 'm' + Date.now().toString(36); this.state.electrodes = (this.state.electrodes || []).concat([SV.Electrodes.serialize(e)]); this.ui.selElec = e.id; this.rebuildElectrodes();
    },
    updateElectrode(id, patch) {
      const spec = (this.state.electrodes || []).find(e => e.id === id); if (!spec) return;
      if (patch.flip) { spec.hemi = spec.hemi === 'L' ? 'R' : 'L'; spec.target = [-spec.target[0], spec.target[1], spec.target[2]]; if (spec.exit) spec.exit = [-spec.exit[0], spec.exit[1], spec.exit[2]]; spec.targetIndex = this.atlas.homotopic[spec.targetIndex] > 0 ? this.atlas.homotopic[spec.targetIndex] : spec.targetIndex; spec.name = spec.hemi === 'L' ? spec.name.replace(/’?$/, '’') : spec.name.replace(/’$/, ''); delete patch.flip; }
      if (patch.dy) spec.target[1] += patch.dy; if (patch.dz) spec.target[2] += patch.dz;
      if (patch.depth) { const e = this.templateElec(id); if (e) spec.target = [spec.target[0] - e.dir[0] * patch.depth, spec.target[1] - e.dir[1] * patch.depth, spec.target[2] - e.dir[2] * patch.depth]; }
      if (patch.length) { const e = this.templateElec(id); if (e) { const L = Math.max(4, patch.length - (e.overshoot || 2)); spec.target = [e.entry[0] - e.dir[0] * L, e.entry[1] - e.dir[1] * L, e.entry[2] - e.dir[2] * L]; const tl = this.vol.labelAt(...spec.target); if (tl >= 1 && tl <= 162) spec.targetIndex = tl; } }
      for (const k of ['name', 'model', 'yaw', 'pitch']) if (patch[k] !== undefined) spec[k] = patch[k];
      spec.auto = false; this.rebuildElectrodes();
    },
    removeElectrode(id) { this.state.electrodes = (this.state.electrodes || []).filter(e => e.id !== id); if (this.ui.selElec === id) this.ui.selElec = null; this.rebuildElectrodes(); },
    electrodeTests(e) { const r = this.result; if (!r) return []; return r.hypotheses.filter(H => (H.members || []).some(m => e.regions.has(m.region))).map(H => 'H' + (H.index + 1)); },
    renderElectrodes() {
      const box = $('tab-electrodes'); if (!this.vol) { box.innerHTML = '<div class="hint">Volume VEP absent du bundle.</div>'; return; }
      const r = this.result, opts = this._elOpts || (this._elOpts = { max: 12, hemi: 'auto', contra: true, post: false, maker: 'DIXI' });
      const groups = [...new Set(SV.Electrodes.LIBRARY.map(l => l.group))];
      const libOpts = groups.map(g => `<optgroup label="${esc(g)}">` + SV.Electrodes.LIBRARY.filter(l => l.group === g).map(l => `<option value="${l.code}">${l.code}${l.alias ? ' (' + l.alias + ')' : ''} — ${esc(l.fr)}</option>`).join('') + '</optgroup>').join('');
      let html = `<div class="hint">Schéma sur gabarit fsaverage (coordonnées tkrRAS), à traduire sur l’IRM et l’angiographie du patient. Nomenclature conventionnelle (prime = gauche) : orthogonales au plan sagittal, sauf les insulaires obliques Ia / Im / Ip (entrée F2, précentrale, pariétale supérieure) et l’OR fronto-orbitaire ; modèles DIXI / Alcis ; règles : pas de croisement, entrée hors sillon, pas de frontal bas ni de temporal pneumatisé, postérieur évité, orthogonal privilégié.</div>
        <div class="ctrl-row"><label>max <input id="elMax" type="number" min="1" max="20" value="${opts.max}"></label>
          <label>hémisphère <select id="elHemi"><option value="auto"${opts.hemi === 'auto' ? ' selected' : ''}>auto (latéralisation)</option><option value="L"${opts.hemi === 'L' ? ' selected' : ''}>gauche</option><option value="R"${opts.hemi === 'R' ? ' selected' : ''}>droit</option><option value="B"${opts.hemi === 'B' ? ' selected' : ''}>bilatéral</option></select></label>
          <label><input type="checkbox" id="elContra"${opts.contra ? ' checked' : ''}> contrôle controlatéral</label>
          <label><input type="checkbox" id="elPost"${opts.post ? ' checked' : ''}> autoriser postérieures</label>
          <label>marque <select id="elMaker"><option value="DIXI"${opts.maker === 'DIXI' ? ' selected' : ''}>DIXI Microdeep</option><option value="Alcis"${opts.maker === 'Alcis' ? ' selected' : ''}>Alcis</option></select></label><label title="convention du centre pour le suffixe de côté dans les noms (prime, D/G ou aucun)">noms <select id="elSideConv">${Object.entries(SV.Side.CONV).map(([k, l]) => `<option value="${k}"${this.sideConv() === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label></div>
        <div class="btnrow"><button id="elPropose" class="primary">Proposer un schéma</button><button id="elClear">Tout retirer</button><button id="elCopy">Copier le schéma</button></div>
        <div class="ctrl-row"><span>Ajouter</span><select id="elLib">${libOpts}</select><select id="elSide"><option value="L">gauche</option><option value="R">droit</option></select><button id="elAdd">+</button>${this.ui.highlight ? `<button id="elAddRegion">+ sur « ${esc(this.atlas.label(this.ui.highlight))} »</button>` : ''}<button id="elAddClick" class="${this.ui.addElec ? 'on' : ''}" title="Chaque clic sur une parcelle en 3D pose une électrode orthogonale">+ au clic</button></div>`;
      if (!this.elecs.length) html += '<div class="hint" style="margin-top:8px">Aucune électrode. « Proposer un schéma » à partir des hypothèses, ou ajoutez-en une.</div>';
      const sorted = this.elecs.slice().sort((a, b) => (a.hemi === b.hemi ? 0 : a.hemi === 'L' ? -1 : 1) || (b.gain || 0) - (a.gain || 0));
      for (const e of sorted) {
        const sel = e.id === this.ui.selElec, worst = Math.max(0, ...e.issues.map(i => i.sev)), tests = this.electrodeTests(e);
        const modelOpts = SV.Electrodes.MODELS.map(m => `<option value="${m.id}"${m.id === e.model ? ' selected' : ''}>${m.id}</option>`).join('');
        html += `<div class="elec-card${sel ? ' sel' : ''}${worst >= 2 ? ' warn' : ''}" data-eid="${e.id}">
          <div class="elec-h"><input class="nm" value="${esc(e.name)}" title="renommer"><span>${esc(e.fr || '')}${e.oblique ? ' <i class="obl">oblique</i>' : ''}</span><select class="mdl">${modelOpts}</select><span class="kv">${e.nContacts} plots · ${e.length.toFixed(0)} mm</span>${this.electrodeBadges ? this.electrodeBadges(e.id) : ''}</div>
          <div class="elec-c"><b>${esc(SV.Electrodes.contactSummary(e, this.atlas))}</b>${tests.length ? ' · teste ' + tests.join(', ') : ''}${e.auto ? '' : ' · <i>manuelle</i>'}</div>
          ${e.issues.length ? `<div class="elec-issues">${e.issues.map(i => `<span class="badge${i.sev >= 2 ? ' les' : i.sev === 1 ? ' warn' : ''}">${esc(i.text)}</span>`).join('')}</div>` : ''}
          <div class="elec-tools"><span class="grp">ant/post <button data-a="dy" data-v="2">+2</button><button data-a="dy" data-v="-2">−2</button></span><span class="grp">haut/bas <button data-a="dz" data-v="2">+2</button><button data-a="dz" data-v="-2">−2</button></span><span class="grp">profondeur <button data-a="depth" data-v="2">+2</button><button data-a="depth" data-v="-2">−2</button></span><span class="grp">longueur <input type="range" class="len" min="6" max="70" step="2" value="${Math.round(e.length)}" title="longueur pointe → entrée"></span>
            <span class="grp">yaw <input type="range" class="yaw" min="-35" max="35" step="5" value="${e.yaw || 0}"></span><span class="grp">pitch <input type="range" class="pitch" min="-35" max="35" step="5" value="${e.pitch || 0}"></span>
            <button data-a="flip">miroir</button><button data-a="sel">${sel ? 'désélectionner' : 'voir'}</button>${this.dossier && SV.Store.refImaging(this.dossier) ? '<button data-a="slices" title="vérifier sur l’IRM du patient : coupes alignées sur la trajectoire, encart en verre">coupes</button>' : ''}<button data-a="del" class="danger">✕</button></div></div>`;
      }
      box.innerHTML = html;
      const ih = this.implantHeader && this.implantHeader(); if (ih) box.insertBefore(ih, box.firstChild);
      $('elPropose').onclick = () => { Object.assign(opts, { max: +$('elMax').value, hemi: $('elHemi').value, contra: $('elContra').checked, post: $('elPost').checked, maker: $('elMaker').value }); this.proposeElectrodes(); };
      if ($('elSideConv')) $('elSideConv').onchange = e => { const ex = this.currentStage && this.currentStage() && this.currentStage().obj; this.setSideConv(ex && ex.electrodes ? ex : null, e.target.value); this.toast('Convention des noms : ' + SV.Side.CONV[e.target.value] + ' (pour les prochaines électrodes)', 3000); };
      $('elClear').onclick = () => { if (confirm('Retirer toutes les électrodes ?')) { this.state.electrodes = []; this.ui.selElec = null; this.rebuildElectrodes(); } };
      $('elCopy').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(this.electrodesText()).then(() => this.toast('Schéma copié')); };
      $('elAdd').onclick = () => this.addElectrode($('elLib').value, $('elSide').value);
      if ($('elAddRegion')) $('elAddRegion').onclick = () => this.addElectrodeOnRegion(this.ui.highlight);
      $('elAddClick').onclick = () => this.setAddMode();
      box.querySelectorAll('.elec-card').forEach(card => {
        const id = card.dataset.eid;
        card.querySelector('input.nm').onchange = ev => this.updateElectrode(id, { name: ev.target.value.trim() || 'E' });
        card.querySelector('select.mdl').onchange = ev => this.updateElectrode(id, { model: ev.target.value });
        card.querySelector('input.yaw').onchange = ev => this.updateElectrode(id, { yaw: +ev.target.value });
        card.querySelector('input.pitch').onchange = ev => this.updateElectrode(id, { pitch: +ev.target.value });
        card.querySelector('input.len').onchange = ev => this.updateElectrode(id, { length: +ev.target.value });
        card.querySelectorAll('button[data-a]').forEach(b => b.onclick = () => { const a = b.dataset.a; if (a === 'del') this.removeElectrode(id); else if (a === 'sel') this.selectElectrode(id); else if (a === 'slices') this.checkElectrodeInDock(id); else if (a === 'flip') this.updateElectrode(id, { flip: true }); else this.updateElectrode(id, { [a]: +b.dataset.v }); });
        card.onclick = ev => { if (ev.target.closest('button,input,select')) return; this.selectElectrode(id); };
      });
    },
    electrodesText() {
      const lines = [`EpiScope — schéma d’implantation (gabarit fsaverage) — ${this.state.name || 'cas'}`];
      for (const e of this.elecs) lines.push(`${e.name} (${this.elecDesc ? this.elecDesc(e) || e.code : e.fr || e.code}, ${e.model}, ${e.nContacts} plots, ${e.length.toFixed(0)} mm) : ${SV.Electrodes.contactSummary(e, this.atlas)}${this.electrodeTests(e).length ? ' — teste ' + this.electrodeTests(e).join(', ') : ''}${e.issues.length ? ' — ⚠ ' + e.issues.map(i => i.text).join(' ; ') : ''}`);
      return lines.join('\n');
    },

    // ======================================================================= dialogue événement
    openEvent(id) {
      const ev = this.state.events.find(e => e.id === id); if (!ev) return; this.editing = ev;
      const sel = $('evSign'); sel.innerHTML = '';
      for (const cat of SV.CATEGORIES) { const og = document.createElement('optgroup'); og.label = cat.fr; for (const s of this.db.signsOf(cat.id)) { const o = document.createElement('option'); o.value = s.id; o.textContent = s.label_fr; og.appendChild(o); } sel.appendChild(og); }
      sel.value = ev.sign_id; $('evT').value = ev.t; $('evDt').value = ev.dt; $('evDur').value = ev.dur; $('evNote').value = ev.note || '';
      const fillTopo = () => { const s = this.db.signById.get(sel.value); const box = $('evTopo'); box.innerHTML = ''; $('evTopoRow').hidden = !s.topography_list.length; for (const t of ['', ...s.topography_list]) { const b = h('button', ev.topography === t ? 'on' : '', t ? SV.TOPO_LABELS[t] : '—'); b.dataset.topo = t; b.onclick = () => { ev.topography = t; box.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); }; box.appendChild(b); } };
      sel.onchange = () => { ev.sign_id = sel.value; ev.topography = ''; fillTopo(); $('evTitle').textContent = this.db.signById.get(sel.value).label_fr; }; fillTopo();
      $('evTitle').textContent = this.db.signById.get(ev.sign_id).label_fr;
      $('evSide').querySelectorAll('button').forEach(b => { b.classList.toggle('on', b.dataset.side === (ev.side || '')); b.onclick = () => { ev.side = b.dataset.side; $('evSide').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); }; });
      $('evConf').querySelectorAll('button').forEach(b => { b.classList.toggle('on', +b.dataset.conf === (ev.conf == null ? 1 : ev.conf)); b.onclick = () => { ev.conf = +b.dataset.conf; $('evConf').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); }; });
      $('evDialog').hidden = false; $('evT').focus();
    },
    closeEvent(save) {
      const ev = this.editing; if (!ev) return;
      if (save) { ev.t = +$('evT').value || 0; ev.dt = Math.max(0, +$('evDt').value || 0); ev.dur = Math.max(0.5, +$('evDur').value || 1); ev.note = $('evNote').value; }
      $('evDialog').hidden = true; this.editing = null; this.changed();
    },

    // ======================================================================= lecture
    togglePlay() {
      this.ui.playing = !this.ui.playing; $('playBtn').textContent = this.ui.playing ? '❚❚' : '▶';
      if (!this.ui.playing) return;
      if (this.ui.t >= this.result.tmax - 0.1) this.ui.t = this.result.tmin;
      let last = performance.now();
      const step = () => {
        if (!this.ui.playing) return; const now = performance.now(), dt = (now - last) / 1000 * (+$('speed').value || 1); last = now;
        let t = this.ui.t + dt; if (t > this.result.tmax) { t = this.result.tmax; this.ui.playing = false; $('playBtn').textContent = '▶'; }
        this.setTime(t); requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    },

    // ======================================================================= fichiers, rapport
    download(name, content, type) {
      const blob = content instanceof Blob ? content : new Blob([content], { type: type || 'application/octet-stream' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    },
    saveCase() { this.changed(); const name = (this.state.name || 'cas').replace(/[^\w\-]+/g, '_'); this.download(`EpiScope_${name}.json`, JSON.stringify(Object.assign({}, this.state, { app: 'EpiScope', db_version: this.db.meta.version, saved: new Date().toISOString(), views: this.viewer.layoutState() }), null, 1), 'application/json'); },
    /** file d'attente des opérations qui modifient temporairement la vue 3D (captures) : une seule à la fois */
    viewerTask(fn) { const run = () => fn(); return (this._vq = (this._vq || Promise.resolve()).then(run, run)); },
    /** rapport de la crise ouverte (format historique) ; avec un dossier ouvert, le bouton passe par reportDialog */
    async report() {
      if (!this.result) return; this.toast('Génération du rapport…', 2500);
      const restore = { t: this.ui.t, layout: this.viewer.layoutName, active: this.viewer.active, cfgs: this.viewer.cells.map(c => Object.assign({}, c.cfg, { hyps: c.cfg.hyps.slice() })) };
      const SHOT = { scale: 3, crop: true };
      const html = await this.viewerTask(async () => {
        const cap = await this.captureSeizureViews({ images: true, dynamics: true, shot: SHOT });
        // schéma d'implantation et SEEG : même style que les vues SEEG (verre neutre, électrodes nommées, latérales / médiales, supérieure)
        const implant = this.elecs.length && this.seegShots ? await this.seegShots({}, SHOT, 'implantation') : [];
        const seeg = this.seegReport ? await this.seegReport(SHOT) : null;
        this.viewer.setLayout(restore.layout); restore.cfgs.forEach((cfg, i) => this.viewer.setCellConfig(i, cfg, true)); this.viewer.setActive(restore.active); this.setTime(restore.t); if (this.refreshMarkers) this.refreshMarkers();
        const B = this.brandHead();
        return SV.Report.build({ brand: B.brand, logo: B.logo, seeg, font: B.font, caseName: this.caseTitle ? this.caseTitle() : this.state.name, patient: this.state.patient, events: this.state.events, db: this.db, atlas: this.atlas, result: this.result, snapshots: cap.snaps, timelineSVG: cap.svg, connectome: this.atlas.patientSC ? 'connectome patient chargé' : '', implantation: implant, hypothesisViews: cap.hypViews, hypColor: i => SV.hypCss(i), electrodes: this.electrodeRows() });
      });
      this.download(`EpiScope_rapport_${(this.caseTitle ? this.caseTitle() : this.state.name || 'cas').replace(/[^\w\-]+/g, '_')}.html`, SV.I18n.html(html), 'text/html');
      this.toast('Rapport téléchargé : ouvrez-le puis Imprimer → PDF', 5000);
    },
    exportAppWithDb() {
      const dbEl = $('sv-db');
      if (!dbEl) { this.toast('Disponible depuis le fichier unique dist/EpiScope.html ; en développement, utilisez Exporter JSON puis tools/build.py'); return; }
      const json = JSON.stringify(this.db.toJSON()).replace(/<\/script/g, '<\\/script');
      const src = '<!doctype html>\n' + document.documentElement.outerHTML;
      const re = /(<script id="sv-db" type="application\/json">)[\s\S]*?(<\/script>)/;
      if (!re.test(src)) { this.toast('Bloc de données introuvable'); return; }
      this.download(`${this.brand().name}.html`, src.replace(re, (m, a, b) => a + json + b), 'text/html'); this.toast('Nouvelle copie de l’application téléchargée (base intégrée)', 4000);
    },

    // ======================================================================= éditeur de base
    openDB() { $('dbDialog').hidden = false; this.dbSel = this.dbSel || this.db.signs[0].id; this.renderDBList(); this.renderDBSign(); },
    renderDBList() {
      const q = $('dbSearch').value, ul = $('dbSignList'); ul.innerHTML = '';
      for (const s of this.db.search(q)) { const li = h('li', s.id === this.dbSel ? 'on' : '', esc(s.label_fr)); li.style.setProperty('--c', this.db.category(s.category).color); li.onclick = () => { this.dbSel = s.id; this.renderDBList(); this.renderDBSign(); }; ul.appendChild(li); }
    },
    renderDBSign() {
      const s = this.db.signById.get(this.dbSel), box = $('dbRight'); if (!s) { box.innerHTML = ''; return; }
      const fams = this.db.regions.map(r => r.family), rows = (this.db.priorsBySign.get(s.id) || []).slice();
      const opt = (list, v, lab) => list.map(x => `<option value="${esc(x)}"${x === v ? ' selected' : ''}>${esc(lab ? lab(x) : x)}</option>`).join('');
      box.innerHTML = `<h3>${esc(s.label_fr)} <small class="muted">${esc(s.id)}</small></h3>
        <div class="grid2">
          <label>Libellé (fr) <input id="f_label_fr" value="${esc(s.label_fr)}"></label><label>Label (en / ILAE) <input id="f_label_en" value="${esc(s.label_en)}"></label>
          <label>Catégorie <select id="f_category">${opt(SV.CATEGORIES.map(c => c.id), s.category, x => this.db.category(x).fr)}</select></label>
          <label>Règle de latéralité <select id="f_lat">${opt(Object.keys(SV.LAT_LABELS), s.laterality_rule, x => SV.LAT_LABELS[x])}</select></label>
          <label>Valeur latéralisante (0–1, fiabilité du côté) <input id="f_latv" type="number" min="0" max="1" step="0.05" value="${s.lateralizing_value == null ? '' : s.lateralizing_value}"></label>
          <label>Topographies possibles (face|UL|LL|trunk|hemibody) <input id="f_topo" value="${esc(s.topography)}"></label><label>Durée par défaut (s) <input id="f_dur" type="number" value="${s.default_duration_s}"></label>
          <label>Synonymes (;) <input id="f_syn" value="${esc(s.synonyms)}"></label><label>Subjectif <select id="f_subj">${opt(['1', '0'], s.subjective ? '1' : '0', x => x === '1' ? 'oui (rapporté)' : 'non (observé)')}</select></label>
          <label style="grid-column:1/span 2">Notes <input id="f_notes" value="${esc(s.notes)}"></label>
        </div>
        <div class="sub-h">Priors : régions VEP impliquées quand ce signe est présent (${rows.length} lignes)</div>
        <table class="db"><thead><tr><th>Région (famille VEP)</th><th>Topo.</th><th>Phase</th><th>Poids</th><th>Rôle</th><th>Source</th><th>Notes</th><th></th></tr></thead><tbody id="priorRows"></tbody></table>
        <div class="hint">Phase : la ligne ne compte pleinement que si le signe survient tôt (≤ 10 s ou 2 premiers signes) ou tard (≥ 20 s ou rang ≥ 3). Rôle : <i>onset</i> = région d’origine statistiquement associée, <i>symptomatogenic</i> = produit le signe, <i>propagation</i> = recrutée sans être origine (compte 0,35 pour le score d’origine).</div>
        <div class="btnrow"><button id="addPrior">+ ligne</button><button id="savePrior" class="primary">Enregistrer ce signe</button><button id="delSign" class="danger">Supprimer le signe</button></div>
        <div class="note">Semio2Brain (évidence statistique, filtre « ${esc(this.db.s2bFilter)} ») pour ce signe : ${(() => { const m = this.db.s2bBySign.get(s.id); if (!m) return 'aucune'; return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([f, v]) => `${esc(f)} ${v.toFixed(2)}`).join(' · '); })()}</div>`;
      const tb = $('priorRows');
      const addRow = r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><select>${opt(fams, r.family, x => (this.db.regionByFamily.get(x) || {}).label_fr + ' (' + x + ')')}</select></td><td><select>${opt(['', 'face', 'UL', 'LL', 'trunk', 'hemibody'], r.topography, x => x ? SV.TOPO_LABELS[x] : '—')}</select></td><td><select>${opt(['', 'early', 'late'], r.phase || '', x => x === 'early' ? 'précoce' : x === 'late' ? 'tardif' : '—')}</select></td><td><input class="w" type="number" min="0" max="1" step="0.05" value="${r.weight}"><div class="wbar"><i style="width:${r.weight * 100}%"></i></div></td><td><select>${opt(['symptomatogenic', 'onset', 'both', 'propagation'], r.role || 'symptomatogenic')}</select></td><td><input value="${esc(r.source)}"></td><td><input value="${esc(r.notes)}"></td><td class="x">✕</td>`;
        tr.querySelector('.x').onclick = () => tr.remove(); tr.querySelector('input.w').oninput = e => { tr.querySelector('.wbar i').style.width = (e.target.value * 100) + '%'; };
        if (r.role === 'propagation') tr.classList.add('prop');
        tb.appendChild(tr);
      };
      rows.sort((a, b) => b.weight - a.weight).forEach(addRow);
      $('addPrior').onclick = () => addRow({ family: fams[0], topography: '', phase: '', weight: 0.5, role: 'symptomatogenic', source: 'expert', notes: '' });
      $('savePrior').onclick = () => {
        const sign = Object.assign({}, s, { label_fr: $('f_label_fr').value, label_en: $('f_label_en').value, category: $('f_category').value, laterality_rule: $('f_lat').value, lateralizing_value: $('f_latv').value === '' ? '' : +$('f_latv').value, topography: $('f_topo').value, default_duration_s: +$('f_dur').value || 10, synonyms: $('f_syn').value, subjective: $('f_subj').value === '1', notes: $('f_notes').value });
        this.db.upsertSign(sign);
        const newRows = [...tb.querySelectorAll('tr')].map(tr => { const c = tr.children; return { family: c[0].firstChild.value, topography: c[1].firstChild.value, phase: c[2].firstChild.value, weight: +c[3].firstChild.value, role: c[4].firstChild.value, source: c[5].firstChild.value, notes: c[6].firstChild.value }; });
        this.db.setPriors(s.id, newRows); this.persistDB(); this.renderDBList(); this.renderDBSign(); this.renderPalette(); this.changed(); this.toast('Signe enregistré');
      };
      $('delSign').onclick = () => { if (confirm('Supprimer « ' + s.label_fr + ' » et ses priors ?')) { this.db.removeSign(s.id); this.dbSel = this.db.signs[0].id; this.persistDB(); this.renderDBList(); this.renderDBSign(); this.renderPalette(); this.changed(); } };
    },
    renderDBEdges() {
      const box = $('dbRight'), fams = this.db.regions.map(r => r.family);
      const opt = (list, v) => list.map(x => `<option value="${esc(x)}"${x === v ? ' selected' : ''}>${esc(x)}</option>`).join('');
      box.innerHTML = `<h3>Liens réseau longue distance (${this.db.edges.length})</h3><div class="hint">Liens intra-hémisphériques appliqués aux deux hémisphères ; poids 0–1. Le voisinage anatomique et la distance sont calculés automatiquement.</div>
        <table class="db"><thead><tr><th>Région A</th><th>Région B</th><th>Poids</th><th>Type</th><th>Nom / faisceau</th><th>Source</th><th></th></tr></thead><tbody id="edgeRows"></tbody></table>
        <div class="btnrow"><button id="addEdge">+ lien</button><button id="saveEdges" class="primary">Enregistrer les liens</button></div>`;
      const tb = $('edgeRows');
      const addRow = e => { const tr = document.createElement('tr'); tr.innerHTML = `<td><select>${opt(fams, e.family_a)}</select></td><td><select>${opt(fams, e.family_b)}</select></td><td><input class="w" type="number" min="0" max="1" step="0.05" value="${e.weight}"></td><td><select>${opt(['both', 'structural', 'functional'], e.kind || 'both')}</select></td><td><input value="${esc(e.name)}"></td><td><input value="${esc(e.source)}"></td><td class="x">✕</td>`; tr.querySelector('.x').onclick = () => tr.remove(); tb.appendChild(tr); };
      this.db.edges.forEach(addRow);
      $('addEdge').onclick = () => addRow({ family_a: fams[0], family_b: fams[1], weight: 0.5, kind: 'both', name: '', source: 'expert' });
      $('saveEdges').onclick = () => { this.db.setEdges([...tb.querySelectorAll('tr')].map(tr => { const c = tr.children; return { family_a: c[0].firstChild.value, family_b: c[1].firstChild.value, weight: +c[2].firstChild.value, kind: c[3].firstChild.value, name: c[4].firstChild.value, source: c[5].firstChild.value, notes: '' }; })); this.persistDB(); this.changed(); this.toast('Liens enregistrés'); };
    },
    newSign() {
      const id = prompt('Identifiant du nouveau signe (snake_case, ex. ictal_tremor)'); if (!id || this.db.signById.has(id)) return;
      this.db.upsertSign({ id, category: 'motor_elementary', label_fr: id, label_en: '', subjective: false, topography: '', laterality_rule: 'none', default_duration_s: 10, key: '', synonyms: '', notes: '' });
      this.dbSel = id; this.persistDB(); this.renderDBList(); this.renderDBSign(); this.renderPalette();
    },
    persistDB() { LS.set('sv_db_v1', this.db.toJSON()); },
    resetDB() { if (!confirm('Revenir à la base livrée ? Les modifications locales seront perdues (exportez-les avant).')) return; LS.del('sv_db_v1'); this.db.load(this.shippedDb); this.atlas.db = this.db; this.dbSel = this.db.signs[0].id; this.renderDBList(); this.renderDBSign(); this.renderPalette(); this.changed(); this.toast('Base livrée restaurée'); },
    exportDBCsv() { const d = new Date().toISOString().slice(0, 10); this.download(`signs_${d}.csv`, this.db.csvSigns(), 'text/csv'); setTimeout(() => this.download(`sign_region_priors_${d}.csv`, this.db.csvPriors(), 'text/csv'), 300); setTimeout(() => this.download(`network_edges_${d}.csv`, this.db.csvEdges(), 'text/csv'), 600); setTimeout(() => this.download(`regions_${d}.csv`, this.db.csvRegions(), 'text/csv'), 900); },
    async importDBCsv(files) {
      const raw = this.db.toJSON(); let n = 0;
      for (const f of files) {
        const { fields, rows } = SV.csv.parseCSV(await f.text());
        const has = (...k) => k.every(x => fields.includes(x));
        if (has('sign_id', 'family', 'weight')) { raw.priors = rows; n++; }
        else if (has('id', 'label_fr', 'laterality_rule')) { raw.signs = rows; n++; }
        else if (has('family_a', 'family_b', 'weight')) { raw.edges = rows; n++; }
        else if (has('family', 'label_fr', 'system')) { raw.regions = rows; n++; }
        else if (has('semio2brain_category', 'sign_ids')) { raw.s2b_map = rows; n++; }
        else this.toast('Fichier non reconnu : ' + f.name, 4000);
      }
      if (n) { this.db.load(raw); this.atlas.db = this.db; this.persistDB(); this.renderDBList(); this.renderDBSign(); this.renderPalette(); this.changed(); this.toast(n + ' table(s) importée(s)'); }
    },

    // ======================================================================= interactions
    onPick(r, kind, e) {
      const tip = $('tip');
      if (kind === 'hover') {
        const lp = this.viewer.lastPick;
        if (lp && e && lp.kind === 'marker') { const rect = $('view3d').getBoundingClientRect(); tip.innerHTML = `<b>${esc(lp.marker.label || '')}</b><br><span class="muted">${esc(this.markerTip ? this.markerTip(lp.marker) : '')}</span>`; tip.hidden = false; tip.style.left = Math.min(rect.width - 290, e.clientX - rect.left + 14) + 'px'; tip.style.top = Math.max(8, e.clientY - rect.top - 10) + 'px'; return; }
        if (lp && e && (lp.kind === 'contact' || lp.kind === 'electrode')) {
          const el = this.elecs.find(x => x.id === lp.eid), rect = $('view3d').getBoundingClientRect(); if (!el) { tip.hidden = true; return; }
          if (this.isSeegTab() && this.seegContactTip) { tip.innerHTML = lp.kind === 'contact' ? this.seegContactTip(el, lp.k) : this.seegElectrodeTip(el); tip.hidden = false; tip.style.left = Math.min(rect.width - 300, e.clientX - rect.left + 14) + 'px'; tip.style.top = Math.max(8, e.clientY - rect.top - 10) + 'px'; return; }
          const a = lp.label >= 1 && lp.label <= 162 ? this.activationAt(this.ui.t)[lp.label] : 0;
          tip.innerHTML = `<b>${esc(el.name)}</b>${lp.kind === 'contact' ? ' · plot ' + lp.k + ' — ' + esc(SV.Electrodes.contactName(lp.label, this.atlas)) : ' · ' + esc(el.fr || '')}<br><span class="muted">${esc(el.model)} · ${el.nContacts} plots · ${el.length.toFixed(0)} mm</span>${lp.kind === 'contact' && lp.label >= 1 && lp.label <= 162 ? `<div class="bar"><i style="width:${Math.round(a * 100)}%;background:${SV.cssRamp(a)}"></i></div>` : ''}`;
          tip.hidden = false; tip.style.left = Math.min(rect.width - 290, e.clientX - rect.left + 14) + 'px'; tip.style.top = Math.max(8, e.clientY - rect.top - 10) + 'px'; return;
        }
        if (!r || !e || this.isSeegTab()) { tip.hidden = true; return; }
        const a = this.activationAt(this.ui.t)[r], rect = $('view3d').getBoundingClientRect();
        tip.innerHTML = `<b>${esc(this.atlas.label(r))}</b><br><span class="muted">${esc(this.atlas.labelEn(r))} · ${esc(this.atlas.system(r).replace(/_/g, ' '))}</span><div class="bar"><i style="width:${Math.round(a * 100)}%;background:${SV.cssRamp(a)}"></i></div><span class="muted">${a.toFixed(2)} ${this.whyAt(r) ? '· ' + this.whyAt(r) : ''}</span>`;
        tip.hidden = false; tip.style.left = Math.min(rect.width - 290, e.clientX - rect.left + 14) + 'px'; tip.style.top = Math.max(8, e.clientY - rect.top - 10) + 'px';
      } else if (kind === 'click') {
        const lp = this.viewer.lastPick;
        if (lp && lp.kind === 'contact' && (this.ui.tab === 'stims' || this.ui.tab === 'thermo') && this.seegPickContact && this.seegPickContact(lp.eid, lp.k)) return;
        if (lp && lp.kind === 'marker') { if (lp.marker.kind === 'stim' && this.seegPickContact) { this.setTab('stims'); this.seegPickContact(lp.eid, lp.marker.ks[0]); } return; }
        if (lp && (lp.kind === 'contact' || lp.kind === 'electrode')) { this.selectElectrode(lp.eid); if (this.ui.dock && this.dockFollowElectrode) this.dockFollowElectrode(lp.eid, lp.k ? lp.k - 1 : 0); return; }
        if (this.ui.addElec) { if (lp && lp.point) this.addElectrodeAtPoint(lp.point, r || lp.region); return; }
        if (lp && lp.point && this.slices3dShown && this.slices3dShown()) this.setSlices3dCursor(lp.point, true);
        else if (lp && lp.point && this.ui.dock && this.slices && this.patientAnat) { const A = this.patientAnat; this.slices.setCursor(SV.Mat4.apply(this.anatMode === 'patient' ? A.fromDisplay : A.fromTemplate, lp.point[0], lp.point[1], lp.point[2])); }
        this.ui.highlight = (r && r !== this.ui.highlight) ? r : 0; this.viewer.setActivation(this.activationAt(this.ui.t), this.ui.highlight);
        if (this.ui.tab === 'onset') this.renderLesionRow(); if (this.ui.tab === 'network') this.renderNetwork(this.activationAt(this.ui.t));
      }
    },
    isSeegTab() { return ['stims', 'thermo', 'quant'].includes(this.ui.tab) || (this.ui.tab === 'electrodes' && !this.ui.addElec); },
    updatePickFilter() { this.viewer.pickFilter = this.isSeegTab() ? 'seeg' : null; $('view3d').classList.toggle('seeg-pick', !!this.viewer.pickFilter); },
    setTab(tab) {
      if (tab === 'params' || tab === 'connectome') tab = 'model';
      this.ui.tab = tab; $('tabs').querySelectorAll('button[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab)); this.updatePickFilter();
      for (const t of ['network', 'onset', 'targets', 'electrodes', 'model', 'seegsz', 'stims', 'thermo', 'quant']) { const el = $('tab-' + t); if (el) el.hidden = t !== tab; }
      if (tab === 'network') this.renderNetwork(this.activationAt(this.ui.t)); if (tab === 'onset') this.renderOnset(); if (tab === 'targets') this.renderTargets(); if (tab === 'electrodes') this.renderElectrodes(); if (tab === 'model') { this.renderParams(); this.renderConnectome(); }
      if (tab === 'stims') this.renderStims(); if (tab === 'thermo') this.renderThermo(); if (tab === 'quant') this.renderQuant(); if (tab === 'seegsz' && this.renderSeegSeizure) this.renderSeegSeizure();
      if (this.refreshMarkers) this.refreshMarkers();
    },
    setMode(m) { this.ui.mode = m; $('modeSwitch').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.mode === m)); $('chronoBody').hidden = m !== 'chrono'; $('seqBody').hidden = m !== 'sequence'; $('manBody').hidden = m !== 'manual'; },
    setSide(s) { this.ui.side = s; $('sideSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.side === s)); },
    /** message bref (bulle) ; une consigne ou une erreur longue (> 90 caractères) passe dans le volet du haut (SV.Notice) */
    toast(msg, ms) { msg = String(msg == null ? '' : msg); if (msg.length > 90 && SV.Notice) { $('toast').hidden = true; SV.Notice.show(msg, { ms: ms && ms > 6000 ? ms * 2 : undefined }); return; } const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(this._toast); this._toast = setTimeout(() => { t.hidden = true; }, ms || 2500); },
    /** panneaux repliables (gauche, droite, frise) ; état mémorisé localement */
    togglePanel(which, on) {
      const ui = LS.get('sv_ui_v1') || {}; ui[which] = on == null ? !ui[which] : !!on; LS.set('sv_ui_v1', ui);
      document.body.classList.toggle(which + '-collapsed', !!ui[which]);
      document.querySelectorAll(`[data-collapse="${which}"]`).forEach(b => { b.classList.toggle('on', !!ui[which]); b.title = ({ left: ['Réduire la saisie', 'Afficher la saisie'], right: ['Réduire les panneaux d’analyse', 'Afficher les panneaux d’analyse'], bottom: ['Réduire la frise', 'Afficher la frise'] }[which] || ['', ''])[ui[which] ? 1 : 0]; });
      setTimeout(() => { this.viewer.resize(); if (this.tl && this.tl.render) this.tl.render(); }, 30);
    },
    restorePanels() { const ui = LS.get('sv_ui_v1') || {}; for (const w of ['left', 'right', 'bottom']) this.togglePanel(w, !!ui[w]); },
    /** polices de la marque (Bodoni Moda, OFL) et des titres (Aleo) chargées depuis les liens incorporés ; data URI transmises au rapport */
    loadBrandFont() {
      const link = $('brandFont'); if (!link || !window.FontFace) return;
      try { const ff = new FontFace('Bodoni Moda', `url(${link.href})`, { weight: '500' }); document.fonts.add(ff); ff.load().catch(() => {}); if (/^data:/.test(link.href)) this.brandFont = link.href; } catch (e) { }
      // v5.3 : Aleo (OFL, police variable 100–900) pour les titres ; data URI transmise aux rapports
      const al = $('uiSerifFont'); if (al) try { const f2 = new FontFace('Aleo', `url(${al.href})`, { weight: '100 900' }); document.fonts.add(f2); f2.load().catch(() => {}); if (/^data:/.test(al.href)) this.serifFont = al.href; } catch (e) { }
    },
    /** pied de vue : étape de la vue et couches d'autres étapes retirées (SV.Scope) */
    renderScopeLegend() {
      const el = $('scopeLeg'); if (!el) return; const P = this.ui.scope, hid = this.ui.scopeHidden || [];
      if (!P || !this.dossier) { el.hidden = true; return; }
      const what = hid.length ? `couches d’autres étapes masquées : ${SV.Scope.describe(hid)}` : '';
      el.hidden = !what && !this.ui.scopeFree;
      el.innerHTML = `<i class="dot"></i><b>${esc(P.label)}</b>${what ? ` <span class="muted">· ${esc(what)}</span>` : ''}${this.ui.scopeFree ? ' <span class="warn">· couches libres (SEEG ▾)</span>' : ''}`;
      el.title = 'Chaque vue ne montre par défaut que ce qui appartient à son étape du parcours ; SEEG ▾ › « garder les couches d’autres étapes » pour tout afficher le temps de la séance.';
    },
    present(on) { this.ui.present = on == null ? !this.ui.present : on; document.body.classList.toggle('present', this.ui.present); setTimeout(() => this.viewer.resize(), 50); },

    bindUI() {
      $('caseName').oninput = () => this.changed(); $('dominant').onchange = () => this.changed(); $('eegOnset').onchange = () => this.changed(); $('seizureEnd').onchange = () => this.changed(); $('vigilance').onchange = () => this.changed();
      $('btnOpen').onclick = () => { $('fileOpen').value = ''; $('fileOpen').click(); };
      $('fileOpen').onchange = async e => { const f = e.target.files[0]; if (f) await this.importFile(f); };
      $('btnSave').onclick = e => this.exportMenu(e.currentTarget); $('btnReport').onclick = () => this.reportForStage ? this.reportForStage() : this.report();
      $('btnDB').onclick = () => this.openDB(); $('btnPresent').onclick = () => this.present(); $('btnHelp').onclick = () => this.openManual && this.openManual();
      document.querySelectorAll('[data-collapse]').forEach(b => b.onclick = () => this.togglePanel(b.dataset.collapse));
      if ($('subChip')) $('subChip').onclick = ev => { ev.stopPropagation(); this.subMenu($('subChip')); };
      if ($('seegChip')) $('seegChip').onclick = ev => { ev.stopPropagation(); this.seegDisplayMenu($('seegChip')); };
      // frise redimensionnable (poignée en haut du bandeau) ; hauteur mémorisée
      const rz = $('tlResizer'); if (rz) {
        const ui0 = LS.get('sv_ui_v1') || {}; if (ui0.tlH) document.documentElement.style.setProperty('--tl-h', ui0.tlH + 'px');
        rz.addEventListener('pointerdown', e => {
          e.preventDefault(); rz.setPointerCapture(e.pointerId); const h0 = $('timelineWrap').getBoundingClientRect().height, y0 = e.clientY; document.body.classList.add('resizing');
          const mv = m => { const hh = Math.max(96, Math.min(window.innerHeight * 0.7, h0 + (y0 - m.clientY))); document.documentElement.style.setProperty('--tl-h', hh + 'px'); };
          const up = m => { rz.removeEventListener('pointermove', mv); rz.removeEventListener('pointerup', up); document.body.classList.remove('resizing'); const ui = LS.get('sv_ui_v1') || {}; ui.tlH = Math.round($('timelineWrap').getBoundingClientRect().height); LS.set('sv_ui_v1', ui); this.viewer.resize(); };
          rz.addEventListener('pointermove', mv); rz.addEventListener('pointerup', up);
        });
        rz.ondblclick = () => { document.documentElement.style.removeProperty('--tl-h'); const ui = LS.get('sv_ui_v1') || {}; delete ui.tlH; LS.set('sv_ui_v1', ui); this.viewer.resize(); };
      }
      if ($('btnDock')) $('btnDock').onclick = () => this.toggleDock && this.toggleDock();
      if ($('btn3dWL')) $('btn3dWL').onclick = () => this.toggle3dWL && this.toggle3dWL();
      if (this.bindDockHandle) this.bindDockHandle();
      $('btnPng').onclick = e => { const r = e.currentTarget.getBoundingClientRect(), shot = () => this.viewer.snapshot({ scale: 2 }), sz = this.ctx && this.ctx.seizure;
        this.popupMenu([{ head: 'Capture de la vue 3D' }, { label: 'Ranger dans la galerie' + (sz ? ' (liée à ' + sz.label + ')' : ''), run: async () => { if (!this.galleryAdd) return; const b = dataURLtoBlob(shot()), ex = this.ctx && this.ctx.exploration; const g = (await this.galleryAdd([new File([b], 'vue3d.png', { type: 'image/png' })], { explorationId: ex ? ex.id : null, seizureId: sz ? sz.id : null, kind: '', title: 'Vue 3D' + (sz ? ' · ' + sz.label + ' · ' + SV.fmtT(this.ui.t) : '') }))[0]; if (g) { g.date = SV.Store.today(); this.touch("gallery", g.id, g.title); this.toast("Vue 3D rangée dans la galerie", 2500); } } },
          { label: 'Copier (coller dans Word, PowerPoint)', run: async () => { const ok = SV.Clip && await SV.Clip.copyImage(shot()); this.toast(ok ? 'Vue copiée' : 'Copie impossible', 2000); } },
          { label: 'Enregistrer en PNG', run: () => this.download(`EpiScope_${SV.fmtT(this.ui.t).replace(/\s/g, '')}.png`, dataURLtoBlob(shot())) }], Math.min(r.left, window.innerWidth - 320), r.bottom + 4); };
      document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => { const id = b.dataset.close; if (id === 'evDialog') this.closeEvent(true); else $(id).hidden = true; });
      document.querySelectorAll('.modal').forEach(m => m.addEventListener('pointerdown', e => { if (e.target === m) { if (m.id === 'evDialog') this.closeEvent(true); else m.hidden = true; } }));
      $('evOk').onclick = () => this.closeEvent(true); $('evDelete').onclick = () => { const id = this.editing.id; this.closeEvent(false); this.removeEvent(id); };
      $('modeSwitch').querySelectorAll('button').forEach(b => b.onclick = () => this.setMode(b.dataset.mode));
      $('sideSeg').querySelectorAll('button').forEach(b => b.onclick = () => this.setSide(b.dataset.side));
      $('chronoToggle').onclick = () => this.chronoToggle(); $('chronoReset').onclick = () => this.chronoReset(); $('chronoMinus').onclick = () => this.chronoNudge(-1); $('chronoPlus').onclick = () => this.chronoNudge(1);
      $('search').oninput = () => this.renderPalette();
      $('search').onkeydown = e => { if (e.key === 'Enter' && this.ui.topMatch) { this.addEvent(this.ui.topMatch); $('search').value = ''; this.renderPalette(); } if (e.key === 'Escape') { $('search').value = ''; this.renderPalette(); $('search').blur(); } };
      $('btnClear').onclick = () => { if (confirm('Effacer tous les signes ?')) { this.state.events = []; this.changed(); } };
      $('btnShift').onclick = () => { const d = parseFloat(prompt('Décaler tous les temps de (s), ex. -5 si le premier signe était plus tôt :', '0')); if (!isNaN(d) && d) { this.state.events.forEach(e => e.t += d); this.changed(); } };
      $('viewSeg').querySelectorAll('button').forEach(b => b.onclick = () => this.viewer.setView(b.dataset.view, true));
      $('layoutSel').onchange = e => this.viewer.setLayout(e.target.value);
      $('inflRange').oninput = e => this.viewer.setCellConfig(this.viewer.active, { inflate: +e.target.value / 100 });
      $('opacRange').oninput = e => this.viewer.setCellConfig(this.viewer.active, { opacity: +e.target.value / 100 });
      $('dispChips').querySelectorAll('input[data-k]').forEach(x => x.onchange = () => this.viewer.setCellConfig(this.viewer.active, { [x.dataset.k]: x.checked }));
      $('chkFrontGlass').onchange = e => this.viewer.setCellConfig(this.viewer.active, { frontGlass: e.target.checked });
      $('btnAllCells').onclick = () => { this.viewer.applyActiveToAll(); this.toast('Réglages d’affichage copiés à toutes les vues'); };
      $('chkLink').onchange = e => { this.ui.linkViews = e.target.checked; this.viewer.setLinked(this.ui.linkViews); if (this.ui.tab === 'onset') this.renderOnset(); this.toast(this.ui.linkViews ? 'Vues liées : les réglages d’affichage et les réseaux d’hypothèses s’appliquent à toutes les vues' : 'Vues indépendantes', 3000); };
      this.viewer.onCellMenu = (i, e) => this.cellMenu(i, e);
      this.viewer.onCellChange = () => {
        const cfg = this.viewer.activeCfg;
        $('viewSeg').querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.view === cfg.view));
        $('inflRange').value = Math.round(cfg.inflate * 100); $('opacRange').value = Math.round(cfg.opacity * 100);
        $('dispChips').querySelectorAll('input[data-k]').forEach(x => { x.checked = !!cfg[x.dataset.k]; });
        $('chkFrontGlass').checked = !!cfg.frontGlass; $('chkFrontGlass').closest('.chip').classList.toggle('dim', cfg.opacity >= 0.9);
        $('layoutSel').value = this.viewer.layoutName;
        const lg = $('hypLegend'); if (lg) { lg.innerHTML = (cfg.hyps.length ? cfg.hyps.map(k => { const i = +k.slice(1); return `<i style="--hue:${SV.hypCss(i)}">H${i + 1}</i>`; }).join('') + '<em>réseaux affichés</em>' : '<em>graphe global neutre</em>') + (cfg.paint ? ` <span class="paint-leg"><i style="--hue:#dc3e3e">${esc(this.ui.paintLabel || 'résection')}</i><button class="mini-btn" id="paintClear" title="retirer la proposition chirurgicale de la vue">✕</button></span>` : '');
          const pc = $('paintClear'); if (pc) pc.onclick = () => { this.viewer.setCellConfig(this.viewer.active, { paint: null }); this.viewer.onCellChange(); }; }
        if (this.ui.tab === 'onset' && this.result) { const act = new Set(cfg.hyps); $('tab-onset').querySelectorAll('.hyp[data-hi]').forEach(card => { const on = act.has('h' + card.dataset.hi); card.classList.toggle('shown', on); const b = card.querySelector('[data-hyp]'); if (b) { b.classList.toggle('on', on); b.textContent = on ? '● masquer le réseau' : '○ voir le réseau'; } }); }
        if (this.ui.tab === 'network' && this.result) this.renderNetwork(this.activationAt(this.ui.t));
        if (this.updateQuantLegend) this.updateQuantLegend(); if (this.updateSeegChip) this.updateSeegChip(); if (this.ui.tab === 'quant') this.renderQuant();
        this.renderScopeLegend();
      };
      this.viewer.onCellChange();
      $('tabs').querySelectorAll('button[data-tab]').forEach(b => b.onclick = () => this.setTab(b.dataset.tab));
      $('playBtn').onclick = () => this.togglePlay();
      $('dbSearch').oninput = () => this.renderDBList(); $('dbNewSign').onclick = () => this.newSign(); $('dbEdges').onclick = () => this.renderDBEdges();
      $('dbExportApp').onclick = () => this.exportAppWithDb(); $('dbExportCsv').onclick = () => this.exportDBCsv(); $('dbExportJson').onclick = () => this.download('episcope_db.json', JSON.stringify(this.db.toJSON(), null, 1), 'application/json');
      $('dbImportCsv').onclick = () => { $('fileCsv').value = ''; $('fileCsv').click(); }; $('fileCsv').onchange = e => this.importDBCsv([...e.target.files]); $('dbReset').onclick = () => this.resetDB();
      $('fileSC').onchange = e => this.loadMatrixFiles([...e.target.files], 'sc'); $('fileFC').onchange = e => this.loadMatrixFiles([...e.target.files], 'fc');
      window.addEventListener('keydown', e => {
        const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName), modal = [...document.querySelectorAll('.modal')].some(m => !m.hidden);
        if (e.key === 'Escape') { this.closeMenu(); if (this.ui.addElec) this.setAddMode(false); if (this.ui.ce && this.ui.ce.pick && this.cancelElecPick) this.cancelElecPick(); document.querySelectorAll('.modal').forEach(m => { if (!m.hidden) { if (m.id === 'evDialog') this.closeEvent(true); else m.hidden = true; } }); const p = document.querySelector('.topo-pop'); if (p) p.remove(); if (this.ui.present) this.present(false); return; }
        if (e.key === 'F3' || e.key === 'F4' || e.key === 'F6' || e.key === 'F7' || e.key === 'F9') { e.preventDefault(); if (this.showScreen) this.showScreen({ F3: 'work', F4: 'dossier', F6: 'staff', F7: 'imaging', F9: 'patients' }[e.key]); return; }
        if (e.key === 'F2' && !typing && this.loc && /^meet:/.test(this.loc.stage)) { e.preventDefault(); this.go({ stage: this.loc.stage, view: 'presenter' }); return; }
        if (typing || modal || (this.ui.screen && this.ui.screen !== 'work')) return;
        if (document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('sv-slices')) return;   // flèches et molette : coupes du volet
        if (e.code === 'Space') { e.preventDefault(); if (this.ui.mode === 'chrono' && !e.shiftKey) this.chronoToggle(); else this.togglePlay(); }
        else if (e.key === 'F2') { e.preventDefault(); this.present(); }
        else if (e.key === 'ArrowLeft') this.setTime(Math.max(this.result.tmin, this.ui.t - (e.shiftKey ? 5 : 0.5)));
        else if (e.key === 'ArrowRight') this.setTime(Math.min(this.result.tmax, this.ui.t + (e.shiftKey ? 5 : 0.5)));
        else if (e.key === '1') this.setSide('L'); else if (e.key === '2') this.setSide('R'); else if (e.key === '3') this.setSide('B'); else if (e.key === '4') this.setSide('');
        else if ((e.key === 'Delete' || e.key === 'Backspace') && this.ui.selected) { e.preventDefault(); const ev = this.state.events.find(x => x.id === this.ui.selected); if (ev && confirm(`Supprimer « ${(this.db.signById.get(ev.sign_id) || { label_fr: ev.sign_id }).label_fr} » (${SV.fmtT ? SV.fmtT(ev.t) : ev.t + ' s'}) ?`)) this.removeEvent(ev.id); }
        else if (/^[a-zA-Zàâéèêëîïôûùç]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) { $('search').focus(); }
      });
    },
  };
  function dataURLtoBlob(u) { const [h, b] = u.split(','); const bin = atob(b), arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); return new Blob([arr], { type: h.match(/:(.*?);/)[1] }); }

  SV.app = SV.Hooks ? SV.Hooks.track(app) : app;
  window.addEventListener('DOMContentLoaded', () => { try { app.boot(); } catch (e) { console.error(e); document.body.insertAdjacentHTML('afterbegin', '<div style="padding:20px;color:#ffb3b5">Erreur au démarrage : ' + esc(e.message) + '</div>'); } });
})(window.SV = window.SV || {});
