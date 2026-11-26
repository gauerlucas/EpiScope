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

  const M = {
    /** carte de pointage (onglet Intercritique d'une SEEG) */
    interMarksRender(host, ex, els) {
      if (!host) return; this._imHost = host; this._imEx = ex; this._imEls = els;
      const I = ex.inter = S.normalizeInter(ex.inter), ui = this.ui.inter = this.ui.inter || { cat: 'lesional' };
      if (ui.cat !== 'lesional' && !I.groups.some(g => g.id === ui.cat)) ui.cat = I.groups.length ? I.groups[0].id : 'lesional';
      const marks = S.interMarks(ex), cnt = k => k === 'lesional' ? Object.keys(I.lesional).length : (I.groups.find(g => g.id === k) || { contacts: [] }).contacts.length;
      const sorted = (els || []).slice().sort((a, b) => (a.hemi === b.hemi ? 0 : a.hemi === 'L' ? -1 : 1) || a.name.localeCompare(b.name, 'fr', { numeric: true }));
      const g = I.groups.find(x => x.id === ui.cat), recs = (ex.recordings || []).filter(r => this.ieegKind && this.ieegKind(r) === 'inter');
      const chip = (e, c) => {
        const k = e.name + c.k, m = marks[k], gs = m ? m.groups.map(id => I.groups.find(x => x.id === id)).filter(Boolean) : [], les = m && m.lesional, inCat = ui.cat === 'lesional' ? les : gs.some(x => x.id === ui.cat);
        const bg = gs.length ? `background:linear-gradient(90deg,${gs.map((x, i) => `${gcol(I, x)} ${Math.round(100 * i / gs.length)}% ${Math.round(100 * (i + 1) / gs.length)}%`).join(',')});color:#0b0f14;` : '';
        const tip = [k, les ? 'rythme lésionnel' : '', ...gs.map(x => x.label)].filter(Boolean).join(' · ');
        return `<button class="pchip sm im-c${inCat ? ' cur' : ''}${les ? ' les' : ''}" data-k="${esc(k)}" style="${bg}${les ? `outline:2px solid ${LES_COL};outline-offset:-2px;` : ''}" title="${esc(tip)}">${c.k}</button>`;
      };
      host.innerHTML = `<div class="card im-card"><div class="card-h">Pointage des plots <span class="muted small">rythme anormal lésionnel, groupes de pointes ; un clic ajoute ou retire le plot de la catégorie choisie, un glisser fait de même sur les plots survolés</span></div>
        <div class="im-cats"><button class="im-cat${ui.cat === 'lesional' ? ' on' : ''}" data-cat="lesional"><i style="background:${LES_COL}"></i>Rythme lésionnel <b>${cnt('lesional')}</b></button>${I.groups.map(x => `<button class="im-cat${ui.cat === x.id ? ' on' : ''}" data-cat="${esc(x.id)}"><i style="background:${gcol(I, x)}"></i>${esc(x.label)} <b>${x.contacts.length}</b>${x.freq ? ` <small>${esc(S.INTER_FREQ[x.freq] || '')}</small>` : ''}</button>`).join('')}<button class="mini-btn" data-a="add">+ groupe de pointes</button></div>
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
      host.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { ui.cat = b.dataset.cat; redraw(); });
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
  };
  Object.assign(SV.app, M);

  // la liste des jeux suit leurs modifications (renderQuant est appelé par les réglages d'un jeu)
  SV.Hooks.wrap(SV.app, 'renderQuant', function (orig) { const r = orig(); const h = this._imHost; if (h && h.isConnected && this._imEx) this.interQuantRender(h.querySelector('.im-q'), this._imEx); return r; });
})(window.SV = window.SV || {});
