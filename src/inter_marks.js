/* EpiScope — inter_marks.js (v3.2.0) : intercritique SEEG pointé sur les plots, comme les plots de début d'une crise.
 *
 * Carte « Pointage des plots » en tête de l'onglet Intercritique : une catégorie active (rythme anormal lésionnel, ou un
 * groupe de pointes) ; un clic sur un plot l'ajoute ou le retire de la catégorie, un glisser applique le même geste aux
 * plots survolés. Un groupe de pointes = des plots dont les pointes sont synchrones (ou d'un même foyer), avec sa
 * fréquence, la vigilance, le moment (jour, heure, tracé intercritique) et une description ; « dupliquer » crée le même
 * groupe pour un autre moment (plus ou moins fréquent selon le jour ou le sommeil). Les jeux de valeurs intercritiques
 * (Analyses : taux de pointes, HFO…) sont listés dessous, modifiables ici ; « → groupe » reprend leurs plots les plus forts.
 * Données : ex.inter.lesional, ex.inter.groups (store.js : normalizeInter, toggleInterContact, interSummary).      */
(function (SV) {
  'use strict';
  const S = SV.Store, Q = SV.Seeg, esc = SV.U.esc;
  const LES_COL = '#c77dff', GCOL = ['#4ea8ff', '#2ee6a6', '#ffb020', '#ff6b9a', '#9b8cff', '#5ad1e6', '#c0e05a', '#ff8a5c'];
  const LES_PH = ['rythme de fond déstructuré', 'activité rapide de bas voltage (brushes)', 'pointes rythmiques quasi continues', 'pattern alternant', 'ralentissement focal continu', 'plots plats (lésion, cavité)'];
  const SPK_PH = ['pointes isolées', 'pointes-ondes', 'polypointes', 'pointes rythmiques en salves', 'pointes et activité rapide (aspect dysplasique)', 'décharges pseudo-rythmiques brèves'];
  const fmtD = s => { if (!s) return ''; const d = new Date(String(s).length <= 10 ? s + 'T12:00:00' : s); return isNaN(d) ? String(s) : d.toLocaleDateString(SV.LOC); };
  const opts = (map, v) => Object.entries(map).map(([k, l]) => `<option value="${esc(k)}"${String(v) === k ? ' selected' : ''}>${esc(l)}</option>`).join('');
  const gcol = (I, g) => GCOL[Math.max(0, I.groups.indexOf(g)) % GCOL.length];
  const rgbA = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

  const M = {
    /** carte de pointage (onglet Intercritique d'une SEEG) */
    interMarksRender(host, ex, els) {
      if (!host) return; this._imHost = host; this._imEx = ex; this._imEls = els;
      const I = ex.inter = S.normalizeInter(ex.inter), ui = this.ui.inter = this.ui.inter || { cat: 'lesional' };
      if (ui.cat !== 'lesional' && !I.groups.some(g => g.id === ui.cat)) ui.cat = I.groups.length ? I.groups[0].id : 'lesional';
      const marks = S.interMarks(ex), cnt = k => k === 'lesional' ? Object.keys(I.lesional).length : (I.groups.find(g => g.id === k) || { contacts: [] }).contacts.length;
      const sorted = (els || []).slice().sort((a, b) => (a.hemi === b.hemi ? 0 : a.hemi === 'L' ? -1 : 1) || a.name.localeCompare(b.name, 'fr', { numeric: true }));
      const g = I.groups.find(x => x.id === ui.cat), recs = (ex.recordings || []).filter(r => this.ieegKind && this.ieegKind(r) === 'inter');
      // v3.4.0 : catégories affichées dans la grille (toutes superposées par défaut, une seule, quelques-unes) ; la catégorie active reste visible
      const hide = (ui.hide = ui.hide || {})[ex.id] = ui.hide[ex.id] || {}, vis = id => !hide[id] || id === ui.cat;
      const eye = id => `<span class="imk-eye${vis(id) ? ' on' : ''}" data-eye="${esc(id)}" title="${vis(id) ? 'masquer dans la grille' : 'afficher dans la grille'}">${vis(id) ? '●' : '○'}</span>`;
      const chip = (e, c) => {
        const k = e.name + c.k, m = marks[k], gAll = m ? m.groups.map(id => I.groups.find(x => x.id === id)).filter(Boolean) : [], gs = gAll.filter(x => vis(x.id)), les = m && m.lesional && vis('lesional'), inCat = ui.cat === 'lesional' ? !!(m && m.lesional) : gAll.some(x => x.id === ui.cat);
        const bg = gs.length ? `background:linear-gradient(90deg,${gs.map((x, i) => `${gcol(I, x)} ${Math.round(100 * i / gs.length)}% ${Math.round(100 * (i + 1) / gs.length)}%`).join(',')});color:#0b0f14;` : '';
        const tip = [k, les ? 'rythme lésionnel' : '', ...gs.map(x => x.label)].filter(Boolean).join(' · ');
        return `<button class="pchip sm im-c${inCat ? ' cur' : ''}${les ? ' les' : ''}" data-k="${esc(k)}" style="${bg}${les ? `outline:2px solid ${LES_COL};outline-offset:-2px;` : ''}" title="${esc(tip)}">${c.k}</button>`;
      };
      host.innerHTML = `<div class="card im-card"><div class="card-h">Pointage des plots <span class="muted small">rythme anormal lésionnel, groupes de pointes ; un clic ajoute ou retire le plot de la catégorie choisie, un glisser fait de même sur les plots survolés</span></div>
        <div class="imk-cats"><button class="imk-cat${ui.cat === 'lesional' ? ' on' : ''}" data-cat="lesional">${eye('lesional')}<i style="background:${LES_COL}"></i>Rythme lésionnel <b>${cnt('lesional')}</b></button>${I.groups.map(x => `<button class="imk-cat${ui.cat === x.id ? ' on' : ''}" data-cat="${esc(x.id)}">${eye(x.id)}<i style="background:${gcol(I, x)}"></i>${esc(x.label)} <b>${x.contacts.length}</b>${x.freq ? ` <small>${esc(S.INTER_FREQ[x.freq] || '')}</small>` : ''}</button>`).join('')}<button class="mini-btn" data-a="add">+ groupe de pointes</button>
          <span class="spacer"></span><span class="seg imk-show" title="catégories colorées dans la grille"><button data-show="all" class="${Object.keys(hide).some(k => hide[k]) ? '' : 'on'}">toutes superposées</button><button data-show="one" class="${['lesional'].concat(I.groups.map(x => x.id)).every(id => id === ui.cat || hide[id]) ? 'on' : ''}">la catégorie choisie seule</button></span></div>
        <div class="im-wrap"><div class="sz-elecs im-grid">${sorted.length ? sorted.map(e => `<div class="sz-el"><b>${esc(e.name)}</b><span class="pchips">${e.contacts.map(c => chip(e, c)).join('')}</span></div>`).join('') : '<div class="hint">Aucune électrode : Planification ou Localisation.</div>'}</div>
          <div class="im-ed">${ui.cat === 'lesional' ? `<div class="im-edh"><i style="background:${LES_COL}"></i><b>Rythme anormal lésionnel</b><span class="spacer"></span><button class="mini-btn" data-a="clear" title="retirer tous les plots de cette catégorie">effacer</button></div>
            <div class="small">${Object.keys(I.lesional).length ? esc(S.contactRanges(Object.keys(I.lesional))) : '<span class="muted">aucun plot</span>'}</div>
            <label class="inph">Aspect <input data-l="lesionalText" value="${esc(I.lesionalText)}" placeholder="rythme de fond déstructuré, brushes, pointes rythmiques continues…"><button class="mini-btn" data-ph="les" title="termes types">▾</button></label>
            <div class="hint small">Reprise dans le rapport SEEG (« Zone lésionnelle électrique › proposer »).</div>`
            : g ? `<div class="im-edh"><i style="background:${gcol(I, g)}"></i><input class="im-lab" data-g="label" value="${esc(g.label)}"><span class="spacer"></span><button class="mini-btn" data-a="dup" title="même groupe de plots pour un autre moment (jour, heure, vigilance)">dupliquer</button><button class="mini-btn" data-a="clear" title="retirer tous les plots du groupe">effacer</button><button class="mini-btn danger" data-a="del" title="supprimer le groupe (corbeille du dossier)">supprimer</button></div>
            <div class="small">${g.contacts.length ? esc(S.contactRanges(g.contacts)) : '<span class="muted">aucun plot : cliquez les plots du groupe</span>'}</div>
            <div class="im-row"><label>Fréquence <select data-g="freq">${opts(S.INTER_FREQ, g.freq)}</select></label><label>Vigilance <select data-g="vig">${opts(S.INTER_VIG, g.vig)}</select></label><label class="chip" title="pointes synchrones sur ces plots (même décharge)"><input type="checkbox" data-g="sync"${g.sync ? ' checked' : ''}> synchrones</label></div>
            <div class="im-row"><label>Moment <input data-g="when" value="${esc(g.when)}" placeholder="J2 nuit, début d’exploration, après sevrage…"></label>${recs.length ? `<label>Tracé <select data-g="recId"><option value="">—</option>${recs.map(r => `<option value="${esc(r.id)}"${g.recId === r.id ? ' selected' : ''}>${esc(r.title)}${r.startDate ? ' · ' + esc(fmtD(r.startDate)) + (r.startTime ? ' ' + esc(r.startTime.slice(0, 5)) : '') : ''}</option>`).join('')}</select></label>` : ''}</div>
            <label class="inph">Description <input data-g="text" value="${esc(g.text)}" placeholder="pointes-ondes, polypointes…"><button class="mini-btn" data-ph="spk" title="termes types">▾</button></label>
            <div class="hint small">Reprise dans le rapport SEEG (« Zone irritative › proposer »).</div>` : ''}</div></div>
        <div class="im-q"></div></div>`;
      const touch = what => this.touch('exploration', ex.id, what || 'intercritique');
      const redraw = () => this.interMarksRender(host, ex, els);
      host.querySelectorAll('[data-cat]').forEach(b => b.onclick = e => { if (e.target.closest('[data-eye]')) return; ui.cat = b.dataset.cat; if (Object.keys(hide).length && ['lesional'].concat(I.groups.map(x => x.id)).filter(id => id !== ui.cat).every(id => hide[id])) { for (const id of ['lesional'].concat(I.groups.map(x => x.id))) hide[id] = id !== ui.cat; } redraw(); });
      host.querySelectorAll('[data-eye]').forEach(b => b.onclick = e => { e.stopPropagation(); const id = b.dataset.eye; if (id === ui.cat) return; hide[id] = !hide[id]; redraw(); });
      host.querySelectorAll('[data-show]').forEach(b => b.onclick = () => { const all = ['lesional'].concat(I.groups.map(x => x.id)); for (const id of all) hide[id] = b.dataset.show === 'one' && id !== ui.cat; if (b.dataset.show === 'all') for (const k of Object.keys(hide)) delete hide[k]; redraw(); });
      host.querySelector('[data-a=add]').onclick = () => { const ng = S.addInterGroup(ex); ui.cat = ng.id; touch('groupe de pointes'); redraw(); };
      // clic ou glisser sur les plots : le premier plot décide (ajout ou retrait), les plots survolés suivent
      const grid = host.querySelector('.im-grid'); let paint = null;
      const apply = (b, want) => { const k = b.dataset.k, isIn = ui.cat === 'lesional' ? !!I.lesional[k] : !!(g && g.contacts.includes(k)); if (isIn !== want) S.toggleInterContact(ex, ui.cat, k); b.classList.toggle('cur', want); };
      grid.querySelectorAll('.im-c').forEach(b => {
        b.onpointerdown = e => { if (e.button !== 0) return; e.preventDefault(); if (ui.cat !== 'lesional' && !g) return; paint = !b.classList.contains('cur'); apply(b, paint); };
        b.onpointerenter = () => { if (paint != null) apply(b, paint); };
      });
      const end = () => { if (paint == null) return; paint = null; touch(ui.cat === 'lesional' ? 'rythme lésionnel' : 'groupe de pointes'); redraw(); };
      grid.onpointerup = end; grid.onpointerleave = end;
      const lt = host.querySelector('[data-l=lesionalText]'); if (lt) lt.oninput = () => { I.lesionalText = lt.value; touch(); };
      host.querySelectorAll('[data-g]').forEach(el => el.oninput = el.onchange = () => { const k = el.dataset.g; g[k] = el.type === 'checkbox' ? el.checked : el.value; touch('groupe de pointes'); if (el.tagName === 'SELECT' || el.type === 'checkbox') redraw(); });
      host.querySelectorAll('[data-ph]').forEach(b => b.onclick = ev => { ev.preventDefault(); const inp = b.previousElementSibling; this.phraseMenu(b, inp, b.dataset.ph === 'les' ? LES_PH : SPK_PH, v => { if (b.dataset.ph === 'les') I.lesionalText = inp.value; else g.text = inp.value; touch(); }, ', '); });
      const cl = host.querySelector('[data-a=clear]'); if (cl) cl.onclick = () => { if (cnt(ui.cat) && !confirm('Retirer tous les plots de cette catégorie ?')) return; if (ui.cat === 'lesional') I.lesional = {}; else g.contacts = []; touch(); redraw(); };
      const dp = host.querySelector('[data-a=dup]'); if (dp) dp.onclick = () => { const ng = S.addInterGroup(ex, { label: g.label + ' (autre moment)', contacts: g.contacts.slice(), sync: g.sync, text: g.text, freq: g.freq, vig: g.vig }); ui.cat = ng.id; touch('groupe de pointes'); redraw(); };
      const dl = host.querySelector('[data-a=del]'); if (dl) dl.onclick = () => { if (!confirm(`Supprimer « ${g.label} » ? (corbeille du dossier)`)) return; S.discard(this.dossier, { kind: 'groupe de pointes', label: g.label, list: 'explorations', id: ex.id, field: 'inter.groups', item: g }); ui.cat = 'lesional'; touch('groupe de pointes supprimé'); redraw(); };
      this.interQuantRender(host.querySelector('.im-q'), ex);
    },
    /** jeux de valeurs intercritiques de la SEEG (Analyses), modifiables ici ; « → groupe » : plots ≥ 50 % du maximum */
    interQuantRender(box, ex) {
      if (!box) return; const st = this.state, here = !!(this.ctx && this.ctx.explorationId === ex.id && st && st.quant);
      const sets = (here ? st.quant : ex.quant || []).filter(q => !(this.quantIsIctal && this.quantIsIctal(q))), live = here && !!this.quantRowHtml;
      box.innerHTML = `<div class="sub-h">Quantifications intercritiques <small class="muted">jeux de valeurs (Analyses) : ouvrir un jeu pour voir ou modifier ses valeurs, « → groupe » reprend ses plots les plus forts</small><span class="spacer"></span><button class="mini-btn" data-a="analyses">Analyses ›</button></div>
        ${sets.length ? `<div class="qx-list im-qx">${sets.map(q => `<div class="im-qrow" data-q="${esc(q.id)}">${live ? this.quantRowHtml(q) : `<div class="qx-row"><div class="qx-line"><b>${esc(q.name)}</b> <span class="muted small">${Object.keys(q.values || {}).length} plots</span></div></div>`}<button class="mini-btn im-tog" data-q="${esc(q.id)}" title="nouveau groupe de pointes : plots dont la valeur atteint la moitié du maximum">→ groupe</button></div>`).join('')}</div>`
          : '<div class="muted small">Aucun jeu intercritique : Analyses › tracé intercritique (taux de pointes, HFO, détection SpikeNet2…).</div>'}`;
      box.querySelector('[data-a=analyses]').onclick = () => { if (this.go) this.go({ stage: 'ex:' + ex.id, view: 'analyses' }); };
      if (live) box.querySelectorAll('.im-qrow .qx-row').forEach(card => { const q = sets.find(x => x.id === card.dataset.q); if (q) this.quantRowBind(card, q); });
      box.querySelectorAll('.im-tog').forEach(b => b.onclick = () => {
        const q = sets.find(x => x.id === b.dataset.q); if (!q) return; const vals = Object.entries(q.values || {}).filter(([, v]) => isFinite(+v)), mx = Math.max(0, ...vals.map(([, v]) => +v)); if (!(mx > 0)) { this.toast('Jeu sans valeur positive'); return; }
        const keys = new Set(); for (const [k, v] of vals) { if (+v < 0.5 * mx) continue; const p = Q.parseLabel(k); if (!p) continue; const e = Q.findElec(this._imEls || [], p.elec), nm = e ? e.name : p.elec; keys.add(nm + p.c1); if (p.c2 != null) keys.add(nm + p.c2); }
        const ng = S.addInterGroup(ex, { label: String(q.name || 'Jeu').split(' · ')[0], contacts: [...keys], text: 'd’après ' + q.name }); (this.ui.inter = this.ui.inter || {}).cat = ng.id;
        this.touch('exploration', ex.id, 'groupe de pointes'); this.interMarksRender(this._imHost, ex, this._imEls); this.toast(`${keys.size} plots repris dans « ${ng.label} »`, 3000);
      });
    },

    // ---------------------------------------------------------------- v3.4.0 : analyse visuelle (Analyses, 3D, coupes, rapport, staff)
    /** catégories pointées d'une SEEG : rythme lésionnel puis groupes de pointes, avec leur couleur */
    interCats(ex) {
      const I = S.normalizeInter(ex && ex.inter), out = [];
      if (Object.keys(I.lesional).length) out.push({ id: 'lesional', label: 'Rythme lésionnel', color: LES_COL, contacts: Object.keys(I.lesional), text: I.lesionalText });
      for (const g of I.groups) if (g.contacts.length) out.push({ id: g.id, label: g.label, color: gcol(I, g), contacts: g.contacts.slice(), text: [S.INTER_FREQ[g.freq], S.INTER_VIG[g.vig], g.when].filter(Boolean).join(' · ') });
      return out;
    },
    interEx() { const d = this.dossier, id = this.ctx && this.ctx.explorationId, ex = d && id && S.byId(d.explorations, id); return ex && ex.kind === 'seeg' ? ex : null; },
    /** marqueurs des plots pointés : un jeu par catégorie, et « all » (toutes superposées, couleur du premier groupe du plot) */
    interVisMarkers() {
      const ex = this.interEx(); if (!ex || !this.elecs || !this.elecByName) return []; const cats = this.interCats(ex), out = [], first = new Map();
      for (const c of cats.slice().sort((a, b) => (a.id === 'lesional') - (b.id === 'lesional'))) for (const k of c.contacts) if (!first.has(k)) first.set(k, c);
      const mk = (set, c, k) => { const p = Q.parseLabel(k), e = p && this.elecByName(p.elec); if (!e) return; out.push({ id: 'inter:' + set + ':' + k, kind: 'inter', set, eid: e.id, ks: [p.c1], color: rgbA(c.color), radius: 2.3, opacity: 0.95, halo: true, label: k, text: `${k} · ${cats.filter(x => x.contacts.includes(k)).map(x => x.label).join(', ')}` }); };
      for (const c of cats) for (const k of c.contacts) mk(c.id, c, k);
      for (const [k, c] of first) mk('all', c, k);
      return out;
    },
    /** bloc « Analyse visuelle » des analyses intercritiques (onglet Analyses) : œil = plots colorés dans la vue active et les coupes */
    interVisRender() {
      const box = document.getElementById('tab-quant'), ex = this.interEx(); if (!box || !ex) return; box.querySelectorAll('.ivx').forEach(x => x.remove());
      const cats = this.interCats(ex); if (!cats.length) return;
      const sec = [...box.querySelectorAll('.rc-sec')].find(x => /^Analyses intercritiques/.test((x.querySelector('.rc-sec-h') || {}).textContent || '')) || box.querySelector('.rc-card') || box;
      const cur = (this.viewer && this.viewer.activeCfg && this.viewer.activeCfg.inter) || null, n = new Set(cats.flatMap(c => c.contacts)).size;
      const row = (id, label, sw, sub) => `<div class="qx-row ivx-row${cur === id ? ' on' : ''}" data-iv="${esc(id)}"><div class="qx-line"><button class="qx-eye" title="${cur === id ? 'Affiché dans la vue active — cliquer pour masquer' : 'Afficher dans la vue active et les coupes'}">${cur === id ? '●' : '○'}</button><span class="ivx-sw">${sw}</span><b>${esc(label)}</b> <span class="muted small">${esc(sub)}</span></div></div>`;
      const el = document.createElement('div'); el.className = 'ivx';
      el.innerHTML = `<div class="rc-day">Analyse visuelle <span class="muted">plots pointés dans l’onglet Intercritique</span></div><div class="qx-list">${row('all', 'Toutes les catégories (superposées)', cats.map(c => `<i style="background:${c.color}"></i>`).join(''), n + ' plots')}${cats.map(c => row(c.id, c.label, `<i style="background:${c.color}"></i>`, c.contacts.length + ' plots' + (c.text ? ' · ' + c.text : ''))).join('')}</div>`;
      sec.appendChild(el);
      el.querySelectorAll('.ivx-row').forEach(r => r.querySelector('.qx-eye').onclick = () => this.interVisShow(cur === r.dataset.iv ? null : r.dataset.iv));
    },
    /** affiche une catégorie (ou « all ») dans la vue active et les coupes */
    interVisShow(id) {
      const V3 = this.viewer; if (V3) V3.setCellConfig(V3.active, { inter: id || null }, true);
      if (this.slices && this.sliceMarkers) this.sliceMarkers();
      this.interVisRender();
    },
    /** marqueurs des coupes : catégorie affichée dans la vue active */
    interSliceMarkers() {
      const S3 = this.slices, V3 = this.viewer, set = V3 && V3.activeCfg && V3.activeCfg.inter; if (!S3 || !set || !this.quantWorldPos) return;
      const ex = this.interEx(); if (!ex) return; const out = [];
      for (const m of this.interVisMarkers().filter(x => x.set === set)) { const pos = this.quantWorldPos(m.label); if (pos) out.push({ p: pos.p, r: 1.9, color: '#' + m.color.map(v => v.toString(16).padStart(2, '0')).join(''), solid: true, label: m.label, showLabel: false, ivk: m.label }); }
      if (out.length) S3.setMarkers((S3.markers || []).filter(x => !x.ivk).concat(out));
    },
  };
  Object.assign(SV.app, M);
  SV.InterMarks = { LES_COL, GCOL };

  // la liste des jeux suit leurs modifications (renderQuant est appelé par les réglages d'un jeu)
  SV.Hooks.wrap(SV.app, 'renderQuant', function (orig) { const r = orig(); const h = this._imHost; if (h && h.isConnected && this._imEx) this.interQuantRender(h.querySelector('.im-q'), this._imEx); try { this.interVisRender(); } catch (e) { console.warn(e); } return r; });
  // v3.4.0 : plots pointés (analyse visuelle) parmi les marqueurs de la vue 3D et des coupes
  SV.Hooks.wrap(SV.app, 'refreshMarkers', function (orig) { const r = orig(); try { const V3 = this.viewer; if (V3 && this.interEx()) V3.setMarkers((V3.markers || []).filter(m => m.kind !== 'inter').concat(this.interVisMarkers())); } catch (e) { console.warn(e); } return r; }, 'inter_marks');
  if (SV.app.implantSliceMarkers) SV.Hooks.wrap(SV.app, 'implantSliceMarkers', function (orig) { const r = orig(); if (r) this.interSliceMarkers(); return r; }, 'inter_marks');
  // rapport SEEG et diaporama : une vue par hémisphère, chaque catégorie dans sa couleur
  SV.Hooks.wrap(SV.app, 'seegReport', async function (orig, SHOT) {
    const R = await orig(); try { const ex = this.interEx(), cats = ex ? this.interCats(ex) : []; if (cats.length && this.elecs && this.elecs.length) { const hem = [...new Set(cats.flatMap(c => c.contacts).map(k => { const p = Q.parseLabel(k), e = p && this.elecByName(p.elec); return e ? e.hemi : null; }).filter(Boolean))]; R.inter = { cats: cats.map(c => ({ id: c.id, label: c.label, color: c.color, text: c.text, ranges: S.contactRanges(c.contacts) })), views: hem.length ? await this.seegShots({ inter: 'all' }, SHOT, 'intercritique_visuel', hem) : [] }; } } catch (e) { console.warn(e); }
    return R;
  }, 'inter_marks');
})(window.SV = window.SV || {});
