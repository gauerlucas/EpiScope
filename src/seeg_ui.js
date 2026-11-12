/* EpiScope — seeg_ui.js : onglets de la phase SEEG — Stimulations, Thermocoagulations, Quantification —
 *   marqueurs 3D associés (sphères sur les plots), légende de quantification, vues et tables pour le rapport.
 *   Les méthodes sont ajoutées à l'application (SV.app) ; les données vivent dans state.stims / state.thermo /
 *   state.quant et sont enregistrées avec le cas.                                                              */
(function (SV) {
  'use strict';
  const $ = id => document.getElementById(id), S = SV.Seeg;
  const esc = SV.U.esc;
  const rgb = c => `rgb(${c.map(Math.round).join(',')})`;
  const hhmm = iso => { const d = iso ? new Date(iso) : null; return d && !isNaN(d) ? d.toLocaleTimeString(SV.LOC, { hour: '2-digit', minute: '2-digit' }) : ''; };
  const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  /** propositions de réponses cliniques à la stimulation */
  const FUNC = ['manque du mot', 'arrêt du langage', 'paraphasies', 'paresthésies', 'sensation somesthésique', 'clonies', 'contraction tonique', 'phosphènes', 'hallucination visuelle élémentaire', 'acouphène', 'vertige', 'goût', 'déviation du regard', 'arrêt moteur'];
  const SUBJ = ['sensation de début de crise', 'sensation bizarre', 'déjà-vu', 'peur', 'angoisse', 'sensation épigastrique ascendante', 'sensation de chaleur', 'impression d’étrangeté', 'malaise indéfinissable', 'rêverie'];
  const num = (v, d) => { const x = parseFloat(String(v).replace(',', '.')); return isFinite(x) ? x : d; };

  const M = {
    // ------------------------------------------------------------------ état et utilitaires
    ensureSeeg() {
      const st = this.state; st.stims = st.stims || []; st.thermo = st.thermo || []; st.quant = st.quant || [];
      this.ui.seeg = this.ui.seeg || { stimElec: null, pair: null, editing: null, showAll: false, form: this.stimDefaultForm('train'), ccepElec: null, ccepOpen: false, thermoElec: null, thermoDate: '', quantImport: null, quantOpen: {} };
      return this.ui.seeg;
    },
    stimDefaultForm(mode) { const m = S.STIM_MODES[mode]; return { mode, mA: m.mA, pulse: m.pulse, dur: m.dur, step: 0.5, clin: false, clinType: '', clinText: '', habitual: false, ad: false, adDur: '', sz: false, szHabitual: false, eeg: '', ccep: [], note: '' }; },
    elecByName(name) { return S.findElec(this.elecs, name); },
    elecById(id) { return (this.elecs || []).find(e => e.id === id) || null; },
    /** résout une entrée {eid, elec, c1, c2} vers l'électrode construite (par id, sinon par nom) */
    resolvePair(p) { const e = this.elecById(p.eid) || this.elecByName(p.elec); return e ? { e, c1: p.c1, c2: p.c2, key: S.pairLabel(e.name, p.c1, p.c2) } : null; },
    stimsOf(e, c1, c2) { const key = S.pairLabel(e.name, c1, c2); return this.state.stims.filter(s => { const r = this.resolvePair(s); return r && r.key === key; }); },
    /** entrée de thermocoagulation d'une paire (toutes étapes) */
    thermoOf(e, c1, c2) { const key = S.pairLabel(e.name, c1, c2); return this.state.thermo.find(t => { const r = this.resolvePair(t); return r && r.key === key; }) || null; },
    /** paire thermocoagulée (étape « réalisée ») */
    isCoagulated(e, c1, c2) { const t = this.thermoOf(e, c1, c2); return !!t && SV.Store.thermoStatusOf(t) === 'done'; },
    pairMaxLevel(e, c1, c2) { let lv = null; for (const s of this.stimsOf(e, c1, c2)) lv = lv ? S.levelMax(lv, S.stimLevel(s)) : S.stimLevel(s); return lv; },
    /** description d'une électrode : son nom conventionnel s'il diffère du nom, sinon la structure de sa pointe */
    elecDesc(e) { const n = x => String(x || '').replace(/[’']/g, '').toLowerCase(); if (e.fr && n(e.fr) !== n(e.name) && n(e.fr) !== n(e.code)) return e.fr; const c = (e.contacts || [])[0]; return c && c.label > 0 ? SV.Electrodes.contactName(c.label, this.atlas) : ''; },
    elecOptions(sel) { return this.elecs.slice().sort((a, b) => (a.hemi === b.hemi ? 0 : a.hemi === 'L' ? -1 : 1) || a.name.localeCompare(b.name)).map(e => `<option value="${esc(e.name)}"${e.name === sel ? ' selected' : ''}>${esc(e.name)}${this.elecDesc(e) ? ' — ' + esc(this.elecDesc(e)) : ''}</option>`).join(''); },
    /** électrode courante d'un onglet : celle mémorisée, sinon la sélectionnée en 3D, sinon la première */
    currentElec(field) { const sg = this.ensureSeeg(); let e = sg[field] ? this.elecByName(sg[field]) : null; if (!e && this.ui.selElec) e = this.elecById(this.ui.selElec); if (!e) e = this.elecs[0] || null; if (e) sg[field] = e.name; return e; },

    // ------------------------------------------------------------------ marqueurs 3D
    refreshMarkers() {
      if (!this.viewer || !this.elecs) return; this.ensureSeeg();
      const list = [], seen = new Set();
      const TS = SV.Store, tcL = this.tcSettings ? this.tcSettings() : { d: 5, l: 7 };
      for (const t of this.state.thermo) {
        const r = this.resolvePair(t); if (!r || seen.has('t' + r.key)) continue; seen.add('t' + r.key); const stt = TS.thermoStatusOf(t); if (stt === 'rejected' && this.ui.wm !== 'thermo') continue;   // contre-indiquée : grise, seulement dans la vue des thermocoagulations (si affichée)
        list.push({ id: 'thermo:' + r.key, kind: 'thermo', status: stt, eid: r.e.id, ks: [r.c1, r.c2].filter(k => k != null), color: TS.THERMO_COL[stt], ell: { a: tcL.l / 2, b: tcL.d / 2 }, radius: tcL.d / 2, opacity: { planned: 0.4, validated: 0.6, done: 0.85, rejected: 0.3 }[stt], label: r.key, text: `thermocoagulation ${TS.V.thermoStatus[stt]} ${r.key}${t.date ? ' · ' + t.date : ''}${t.reason ? ' · ' + t.reason : ''}${t.note ? ' · ' + t.note : ''}` });
      }
      const byPair = new Map();
      for (const s of this.state.stims) { const r = this.resolvePair(s); if (!r) continue; const g = byPair.get(r.key) || { r, n: 0, lv: 'none' }; g.n++; g.lv = S.levelMax(g.lv, S.stimLevel(s)); byPair.set(r.key, g); }
      for (const [key, g] of byPair) {
        // trois jeux de pastilles par paire, une seule pastille par jeu (jamais côte à côte) :
        //  'all'  : réponse la plus forte (crise > post-décharge > clinique > RAS) — affichage courant ;
        //  'elec' : crise, sinon post-décharge — réponses électriques ;   'subj' : réponse subjective ;   'func' : réponse fonctionnelle ;
        //  une paire sans aucune réponse (RAS) figure en gris dans chacun des jeux
        const types = S.pairResponseTypes(this.stimsOf(g.r.e, g.r.c1, g.r.c2)), text = `${key} · ${g.n} stimulation${g.n > 1 ? 's' : ''} · ${types.map(t => S.RESP[t].fr).join(' + ')}`;
        const mk = (set, t) => list.push({ id: 'stim:' + key + ':' + set, kind: 'stim', set, eid: g.r.e.id, ks: [g.r.c1, g.r.c2], color: S.RESP[t].color, radius: 2.1 + (t === 'sz' ? 0.5 : t === 'ad' ? 0.25 : 0), opacity: 0.95, label: key, text });
        mk('all', types[0]);
        if (types[0] === 'none') for (const set of ['elec', 'subj', 'func']) mk(set, 'none');   // paire testée sans réponse (RAS) : grise dans chaque jeu (vues du staff, du rapport)
        if (types.includes('sz') || types.includes('ad')) mk('elec', types.includes('sz') ? 'sz' : 'ad');
        if (types.includes('subj')) mk('subj', 'subj');
        if (types.includes('func')) mk('func', 'func');
      }

      for (const q of this.state.quant) {
        const lo = q.min, hi = q.max, span = (hi - lo) || 1;
        for (const [key, v] of Object.entries(q.values || {})) {
          const p = S.parseLabel(key), e = p && this.elecByName(p.elec); if (!e) continue;
          const t = Math.max(0, Math.min(1, (v - lo) / span)), col = q.mode === 'size' ? [255, 200, 90] : S.cmap(q.cmap, t), rad = q.mode === 'color' ? 2.6 : 1.1 + 3.8 * t;
          list.push({ id: 'quant:' + q.id + ':' + key, kind: 'quant', set: q.id, eid: e.id, ks: [p.c1, p.c2].filter(k => k != null), color: col, radius: rad, opacity: 0.95, halo: true, label: key, value: v, text: `${key} · ${q.name} = ${(+v).toLocaleString(SV.LOC, { maximumFractionDigits: 3 })}${q.unit ? ' ' + q.unit : ''}` });
        }
      }
      this.viewer.setMarkers(list);
      // réseau CCEP : un lien dirigé par couple (paire stimulée → paire de recueil), intensité ∝ nombre d'observations ;
      // les liens de la stimulation sélectionnée (en édition, ou dernière de la paire courante) sont en blanc
      const sg = this.ui.seeg, byLink = new Map();
      let sel = sg.editing ? this.state.stims.find(s => s.id === sg.editing) : null;
      if (!sel && sg.pair) { const e = this.elecByName(sg.pair.elec); if (e) { const l = this.stimsOf(e, sg.pair.c1, sg.pair.c2).filter(s => s.ccep && s.ccep.length); sel = l[l.length - 1]; } }
      for (const st of this.state.stims) {
        if (!st.ccep || !st.ccep.length) continue; const a = this.resolvePair(st); if (!a) continue;
        for (const lab of st.ccep) { const p = S.parseLabel(lab), e = p && this.elecByName(p.elec); if (!e) continue; const key = a.key + '>' + S.pairLabel(e.name, p.c1, p.c2); const L = byLink.get(key) || { from: { eid: a.e.id, ks: [a.c1, a.c2] }, to: { eid: e.id, ks: [p.c1, p.c2].filter(k => k != null) }, n: 0, sel: false }; L.n++; if (st === sel) L.sel = true; byLink.set(key, L); }
      }
      const links = [...byLink.values()].map(L => ({ from: L.from, to: L.to, sel: L.sel, color: L.sel ? [255, 255, 255] : [120, 220, 255], w: Math.min(1, 0.35 + 0.25 * L.n) }));
      this.ccepLinkCount = links.length; this._ccepLinks = links; this.viewer.setMarkerLinks(this.quantNetLinks ? links.concat(this.quantNetLinks()) : links);
      const hl = [], hp = this.ui.tab === 'stims' ? sg.pair : this.ui.tab === 'thermo' ? sg.tpair : null; if (hp) { const e = this.elecByName(hp.elec); if (e) hl.push(e.id + ':' + hp.c1, e.id + ':' + hp.c2); }
      this.viewer.setContactHighlight(hl);
      this.updateQuantLegend(); this.updateSeegChip();
    },
    /** légende de quantification sous la vue (jeu affiché dans la vue active) */
    updateQuantLegend() {
      const lg = $('quantLegend'); if (!lg || !this.viewer) return; const cfg = this.viewer.activeCfg, q = cfg && cfg.quant ? (this.state.quant || []).find(x => x.id === cfg.quant) : null;
      if (!q) { lg.hidden = true; return; }
      lg.hidden = false; lg.innerHTML = `<b>${esc(q.name)}</b>${q.unit ? ` <small>(${esc(q.unit)})</small>` : ''}<span>${(+q.min).toLocaleString(SV.LOC, { maximumFractionDigits: 3 })}</span><i class="qbar" style="background:${q.mode === 'size' ? 'linear-gradient(90deg,#ffc85a,#ffc85a)' : S.cmapCss(q.cmap)}"></i><span>${(+q.max).toLocaleString(SV.LOC, { maximumFractionDigits: 3 })}</span><em>${q.mode === 'size' ? 'taille ∝ valeur' : q.mode === 'both' ? 'couleur et taille' : 'couleur'}</em>`;
    },
    /** clic sur un plot en 3D : dans l'onglet Stimulations, sélectionne la paire (k, k+1) ; dans Thermocoagulations, bascule la paire */
    seegPickContact(eid, k) {
      const e = this.elecById(eid); if (!e) return false;
      const c1 = k >= e.nContacts ? e.nContacts - 1 : k, c2 = c1 + 1; if (c2 > e.nContacts) return false;
      const sg = this.ensureSeeg();
      if (this.ui.tab === 'stims') { sg.stimElec = e.name; sg.pair = { elec: e.name, c1, c2 }; this.renderStims(); this.refreshMarkers(); return true; }
      if (this.ui.tab === 'thermo') { sg.thermoElec = e.name; sg.tpair = { elec: e.name, c1, c2 }; this.renderThermo(); this.refreshMarkers(); return true; }
      return false;
    },
    markerTip(mk) { return mk.text || mk.label || ''; },
    /** infobulle d'un plot (phase SEEG) : électrode, plot, structure, paires contiguës avec stimulations, thermocoagulation, valeurs */
    seegContactTip(e, k) {
      const c = e.contacts[k - 1]; if (!c) return '';
      let html = `<b>${esc(e.name)}</b> · plot ${k} — ${esc(SV.Electrodes.contactName(c.label, this.atlas))}<br><span class="muted">${esc(this.elecDesc(e))}${this.elecDesc(e) ? ' · ' : ''}${esc(e.model)} · ${e.nContacts} plots</span>`;
      const pairs = []; if (k > 1) pairs.push([k - 1, k]); if (k < e.nContacts) pairs.push([k, k + 1]);
      for (const [c1, c2] of pairs) {
        const key = S.pairLabel(e.name, c1, c2), st = this.stimsOf(e, c1, c2), lv = this.pairMaxLevel(e, c1, c2), bits = [];
        if (st.length) bits.push(`<i style="color:${rgb(S.RESP[lv].color)}">●</i> ${st.length} stim. · max ${esc(S.RESP[lv].fr)}` + (st.some(s => s.ccep && s.ccep.length) ? ' · CCEP' : ''));
        if (this.isCoagulated(e, c1, c2)) bits.push('<i style="color:#e12d37">●</i> thermocoagulée');
        for (const q of this.state.quant || []) if (q.values && q.values[key] != null) bits.push(`${esc(q.name)} = ${(+q.values[key]).toLocaleString(SV.LOC, { maximumFractionDigits: 3 })}${q.unit ? ' ' + esc(q.unit) : ''}`);
        html += `<div class="tipline"><b>${esc(key)}</b> <span class="muted">${esc(S.pairStructures(e, c1, c2, this.atlas))}</span>${bits.length ? '<br>' + bits.join(' · ') : ''}</div>`;
      }
      return html;
    },
    seegElectrodeTip(e) {
      const nSt = this.state.stims.filter(s => { const r = this.resolvePair(s); return r && r.e === e; }).length, nTc = this.state.thermo.filter(t => { const r = this.resolvePair(t); return r && r.e === e; }).length;
      return `<b>${esc(e.name)}</b>${this.elecDesc(e) ? ' — ' + esc(this.elecDesc(e)) : ''}<br><span class="muted">${esc(e.model)} · ${e.nContacts} plots · ${e.length.toFixed(0)} mm · ${esc(SV.Electrodes.contactSummary(e, this.atlas))}</span>${nSt || nTc ? `<br>${nSt ? nSt + ' stimulation' + (nSt > 1 ? 's' : '') : ''}${nSt && nTc ? ' · ' : ''}${nTc ? nTc + ' paire' + (nTc > 1 ? 's' : '') + ' thermocoagulée' + (nTc > 1 ? 's' : '') : ''}` : ''}`;
    },
    /** menu d'affichage SEEG de la vue active : thermocoagulations, stimulations, réseau CCEP, jeu de quantification */
    seegDisplayMenu(anchor) {
      this.ensureSeeg();
      const V = this.viewer, cfg = V.activeCfg, sets = this.state.quant || [];
      const nTc = this.state.thermo.length, nSt = new Set(this.state.stims.map(s => { const r = this.resolvePair(s); return r ? r.key : ''; })).size, nCc = this.ccepLinkCount || 0;
      const panel = document.createElement('div'); panel.className = 'cell-panel seeg-menu';
      panel.innerHTML = `<div class="hd">SEEG dans la vue ${V.active + 1}${V.linked ? ' <small>(vues liées)</small>' : ''}</div>
        <label class="row"><input type="checkbox" data-k="thermo"${cfg.thermo ? ' checked' : ''}> <i style="background:#e12d37"></i> thermocoagulations <small>${nTc}</small></label>
        <div class="row sub"><span>étapes</span><div class="seg">${['planned', 'validated', 'done', 'rejected'].map(k => `<button data-tcs="${k}" class="${!cfg.tcStatus || cfg.tcStatus.includes(k) ? 'on' : ''}"><i style="background:rgb(${SV.Store.THERMO_COL[k].join(',')})"></i>${SV.Store.V.thermoStatus[k]}</button>`).join('')}</div></div>
        <label class="row"><input type="checkbox" data-k="stims"${cfg.stims ? ' checked' : ''}> <i style="background:#50a0ff"></i> stimulations <small>${nSt} paire${nSt > 1 ? 's' : ''}</small></label>
        <div class="row sub"><span>pastilles</span><div class="seg">${[['all', 'réponse max.'], ['elec', 'crises / PD'], ['subj', 'subjectives'], ['func', 'fonctionnelles']].map(([v, l]) => `<button data-ss="${v}" class="${(cfg.stimSet || 'all') === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        <label class="row"><input type="checkbox" data-k="ccep"${cfg.ccep ? ' checked' : ''}> <i style="background:#78dcff"></i> réseau CCEP <small>${nCc} lien${nCc > 1 ? 's' : ''}</small></label>
        <div class="hd sub">quantification</div>
        <label class="row"><input type="radio" name="sgq" value=""${!cfg.quant ? ' checked' : ''}> aucune</label>
        ${sets.map(q => `<label class="row"><input type="radio" name="sgq" value="${q.id}"${cfg.quant === q.id ? ' checked' : ''}> <i style="background:${S.cmapCss(q.cmap)}"></i> ${esc(q.name)} <small>${Object.keys(q.values || {}).length}</small></label>`).join('')}
        ${!sets.length ? '<div class="hint">aucun jeu importé (onglet Quantification)</div>' : ''}
        <div class="btnrow"><button data-a="all">tout afficher</button><button data-a="none">tout masquer</button><button data-a="copy" title="appliquer ces réglages SEEG à toutes les vues">→ toutes les vues</button></div>
        <label class="row scope-row" title="Par défaut, chaque vue ne montre que les couches de son étape (une crise ne montre pas les thermocoagulations faites après, une phase 1 ne montre pas la SEEG). Cocher pour garder tout ce que vous activez, le temps de la séance."><input type="checkbox" data-k="scopeFree"${this.ui.scopeFree ? ' checked' : ''}> garder les couches d’autres étapes dans toutes les vues</label>`;
      const r = anchor.getBoundingClientRect(); this.popupMenu([{ node: panel }], r.left, r.bottom + 4);
      const set = patch => { V.setCellConfig(V.active, patch); this.refreshMarkers(); };
      panel.querySelectorAll('input[data-k]').forEach(x => x.onchange = () => { if (x.dataset.k === 'scopeFree') { this.ui.scopeFree = x.checked; if (SV.Scope) SV.Scope.apply(this, 'menu'); this.toast(x.checked ? 'Les couches activées restent affichées d’une vue à l’autre (séance)' : 'Chaque vue revient aux couches de son étape', 2500); return; } set({ [x.dataset.k]: x.checked }); });
      panel.querySelectorAll('[data-tcs]').forEach(b => b.onclick = () => { const all = ['planned', 'validated', 'done', 'rejected'], cur = cfg.tcStatus || all, k = b.dataset.tcs, nx = cur.includes(k) ? cur.filter(x => x !== k) : cur.concat([k]); set({ thermo: true, tcStatus: nx.length === all.length ? null : nx }); this.closeMenu(); this.seegDisplayMenu(anchor); });
      panel.querySelectorAll('[data-ss]').forEach(b => b.onclick = () => { set({ stims: true, stimSet: b.dataset.ss }); this.closeMenu(); this.seegDisplayMenu(anchor); });
      panel.querySelectorAll('input[name=sgq]').forEach(x => x.onchange = () => { if (!x.checked) return; set(x.value ? Object.assign({ electrodes: true }, this.quantViewCfg(sets.find(q => q.id === x.value))) : { quant: null }); });
      panel.querySelectorAll('button[data-a]').forEach(b => b.onclick = () => {
        const a = b.dataset.a;
        if (a === 'all') { set(Object.assign({ thermo: true, stims: true, ccep: true, electrodes: true }, sets.length && !cfg.quant ? { quant: sets[0].id } : {})); }
        else if (a === 'none') set({ thermo: false, stims: false, ccep: false, quant: null });
        else if (a === 'copy') { const c = V.activeCfg; V.setAllCells({ thermo: c.thermo, tcStatus: c.tcStatus, stims: c.stims, stimSet: c.stimSet, ccep: c.ccep, quant: c.quant }); this.refreshMarkers(); this.toast('Réglages SEEG appliqués à toutes les vues'); }
        this.closeMenu(); this.seegDisplayMenu(anchor);
      });
    },
    /** état du bouton « SEEG ▾ » de la barre de vue */
    updateSeegChip() { const b = $('seegChip'); if (!b || !this.viewer) return; const c = this.viewer.activeCfg, on = !!(c.thermo && this.state.thermo.length) || !!(c.stims && this.state.stims.length) || !!(c.ccep && this.ccepLinkCount) || !!c.quant; b.classList.toggle('on', on); },

    // ------------------------------------------------------------------ STIMULATIONS
    pairChips(e, sel, mode) {
      let html = '';
      for (const p of S.pairsOf(e)) {
        const on = sel && sel.c1 === p.c1, lv = this.pairMaxLevel(e, p.c1, p.c2), n = this.stimsOf(e, p.c1, p.c2).length, coag = this.isCoagulated(e, p.c1, p.c2);
        const st = e.contacts[p.c1 - 1], inBrain = st && st.label > 0 && st.label !== 201 && st.label !== 202;   // hors cerveau / LCR : pastille atténuée
        if (mode === 'thermo') { const t = this.thermoOf(e, p.c1, p.c2), stt = t ? SV.Store.thermoStatusOf(t) : ''; html += `<button class="pchip${stt ? ' tc-' + stt : ''}${on ? ' on' : ''}${inBrain ? '' : ' out'}" data-c1="${p.c1}" title="${esc(S.pairStructures(e, p.c1, p.c2, this.atlas))}${stt ? ' · thermocoagulation ' + SV.Store.V.thermoStatus[stt] : ''}${lv ? ' · stimulée : ' + S.RESP[lv].fr : ''}">${p.c1}-${p.c2}${lv ? `<i style="background:${rgb(S.RESP[lv].color)}"></i>` : ''}</button>`; }
        else html += `<button class="pchip${on ? ' on' : ''}${inBrain ? '' : ' out'}${coag ? ' coag' : ''}" data-c1="${p.c1}" title="${esc(S.pairStructures(e, p.c1, p.c2, this.atlas))}${coag ? ' · thermocoagulée' : ''}">${p.c1}-${p.c2}${lv ? `<i style="background:${rgb(S.RESP[lv].color)}"></i>` : ''}${n > 1 ? `<small>${n}</small>` : ''}</button>`;
      }
      return html;
    },
    renderStims() {
      const box = $('tab-stims'); if (!box) return; const sg = this.ensureSeeg(), F = sg.form;
      if (!this.elecs.length) { box.innerHTML = '<div class="hint">Aucune électrode : construisez d’abord le schéma d’implantation (onglet Électrodes).</div>'; return; }
      const e = this.currentElec('stimElec'); if (sg.pair && !this.elecByName(sg.pair.elec)) sg.pair = null;
      const pair = sg.pair && sg.pair.elec === e.name ? sg.pair : null, mode = S.STIM_MODES[F.mode];
      const sel = pair ? `<b>${esc(S.pairLabel(e.name, pair.c1, pair.c2))}</b> <span class="muted">${esc(S.pairStructures(e, pair.c1, pair.c2, this.atlas))}</span>${this.isCoagulated(e, pair.c1, pair.c2) ? ' <span class="badge les">thermocoagulée</span>' : ''}` : '<span class="muted">cliquez une paire ci-dessus ou un plot en 3D</span>';
      const presets = [0.5, 1, 1.5, 2, 3, 4, 5].filter(v => v <= mode.maxA).map(v => `<button class="pre${Math.abs(F.mA - v) < 0.01 ? ' on' : ''}" data-ma="${v}">${v}</button>`).join('');
      const signsList = this.db.signs.map(s => `<option value="${esc(s.label_fr)}">`).join('');
      const ccepE = sg.ccepElec ? this.elecByName(sg.ccepElec) : null, ccepElec = ccepE || this.elecs.find(x => x.name !== e.name) || e;
      const ccepChips = S.pairsOf(ccepElec).map(p => { const key = S.pairLabel(ccepElec.name, p.c1, p.c2), on = F.ccep.includes(key); return `<button class="pchip sm${on ? ' on' : ''}" data-ccep="${esc(key)}">${p.c1}-${p.c2}</button>`; }).join('');
      const PROTO = 'Stimulation bipolaire entre deux plots contigus (recommandations SEEG françaises, Isnard et al. 2018) : trains 50 Hz — 0,5–1 ms, 3–8 s, 0,5–5 mA (cartographie fonctionnelle, sémiologie) ; chocs 1 Hz — 0,5–3 ms, 20–60 s, 0,5–4 mA (réponse électrique, crise, CCEP). Attendre le retour à l’activité de base entre deux stimulations ; dans la région centrale, trains courts et de faible intensité. Réponse fonctionnelle : manque du mot, arrêt du langage, paresthésies, clonies, phosphènes… (vert). Réponse subjective : « début de crise », sensation bizarre, déjà-vu, peur, sensation épigastrique… (orange, comme une post-décharge).';
      let html = `<div class="ctrl-row"><label>électrode <select id="stElec">${this.elecOptions(e.name)}</select></label><label class="muted">${e.nContacts} plots · plot 1 = pointe</label><span class="info" title="${esc(PROTO)}">ⓘ protocole</span></div>
        <div class="pchips" id="stPairs">${this.pairChips(e, pair, 'stim')}</div>
        <div class="stim-sel">${sel}</div>
        <div class="stim-form${pair ? '' : ' off'}">
          <div class="seg mode"><button data-mode="train" class="${F.mode === 'train' ? 'on' : ''}" title="${esc(S.STIM_MODES.train.hint)}">Train 50 Hz</button><button data-mode="shock" class="${F.mode === 'shock' ? 'on' : ''}" title="${esc(S.STIM_MODES.shock.hint)}">Chocs 1 Hz</button></div>
          <div class="ctrl-row"><label>durée <input id="stDur" type="number" step="1" min="1" max="90" value="${F.dur}"> s</label><label>largeur <input id="stPulse" type="number" step="0.5" min="0.1" max="5" value="${F.pulse}"> ms</label></div>
          <div class="ma-row"><button id="stMinus" class="big">−</button><div class="ma"><input id="stMa" type="number" step="0.1" min="0.1" max="10" value="${F.mA}"><span>mA</span></div><button id="stPlus" class="big">+</button><label>pas <select id="stStep">${[0.2, 0.5, 1].map(v => `<option value="${v}"${F.step === v ? ' selected' : ''}>${v}</option>`).join('')}</select></label></div>
          <div class="pre-row">${presets}</div>
          <div class="resp-lbl"><span>réponse</span><span>clinique</span><span>électrique</span></div><div class="resp-row"><button class="resp none${!F.clin && !F.ad && !F.sz ? ' on' : ''}" data-r="none">RAS</button><button class="resp func${F.clin && F.clinType === 'func' ? ' on' : ''}" data-r="func" title="réponse fonctionnelle : manque du mot, arrêt du langage, paresthésies, clonies, phosphènes…">Fonctionnelle</button><button class="resp subj${F.clin && F.clinType === 'subj' ? ' on' : ''}" data-r="subj" title="réponse subjective : « début de crise », sensation bizarre, déjà-vu, peur, sensation épigastrique…">Subjective</button><button class="resp ad${F.ad ? ' on' : ''}" data-r="ad">Post-décharge</button><button class="resp sz${F.sz ? ' on' : ''}" data-r="sz">Crise</button></div>
          ${F.clin ? `<div class="ctrl-row"><input id="stClinText" list="stSigns" placeholder="${F.clinType === 'subj' ? 'réponse subjective : « début de crise », sensation bizarre, déjà-vu, peur…' : 'réponse fonctionnelle : manque du mot, paresthésies de la main D, clonies…'}" value="${esc(F.clinText)}"><datalist id="stSigns">${(F.clinType === 'subj' ? SUBJ : FUNC).map(t => `<option value="${esc(t)}">`).join('')}${signsList}</datalist>${F.clinType === 'subj' ? `<label title="la sensation reproduit le début des crises habituelles"><input type="checkbox" id="stHab"${F.habitual ? ' checked' : ''}> habituelle</label>` : ''}</div>` : ''}
          ${F.ad ? `<div class="ctrl-row"><label>post-décharge : durée <input id="stAdDur" type="number" min="0" step="1" value="${esc(F.adDur)}"> s</label><span class="muted">(0 ou vide = non mesurée)</span></div>` : ''}
          ${F.sz ? `<div class="ctrl-row"><label><input type="checkbox" id="stSzHab"${F.szHabitual ? ' checked' : ''}> crise habituelle (reproduit la sémiologie spontanée, au moins en partie)</label></div>` : ''}
          <div class="ctrl-row"><input id="stEeg" placeholder="EEG : diffusion, rythme, structures impliquées…" value="${esc(F.eeg)}"></div>
          <div class="ccep"><button id="stCcepToggle" class="${sg.ccepOpen || F.ccep.length ? 'on' : ''}">CCEP${F.ccep.length ? ' (' + F.ccep.length + ')' : ''}</button>${F.ccep.map(k => `<span class="chip tag">${esc(k)}<a data-rm="${esc(k)}">×</a></span>`).join('')}
            ${sg.ccepOpen ? `<div class="ccep-pick"><label>recueil sur <select id="stCcepElec">${this.elecOptions(ccepElec.name)}</select></label><div class="pchips">${ccepChips}</div></div>` : ''}</div>
          <div class="ctrl-row"><input id="stNote" placeholder="note" value="${esc(F.note)}"></div>
          <div class="btnrow">${sg.editing ? `<button id="stSave" class="primary">Mettre à jour</button><button id="stDup">Dupliquer</button><button id="stCancel">Annuler</button>` : `<button id="stSave" class="primary big">Enregistrer</button><button id="stSaveNext" title="Enregistre puis augmente l’intensité d’un pas">Enregistrer, +${F.step} mA</button>`}</div>
        </div>`;
      // journal : par paire (trains | chocs), intensités croissantes
      const groups = new Map();
      for (const s of this.state.stims) { const r = this.resolvePair(s); if (!r) continue; if (!sg.showAll && (!pair || r.key !== S.pairLabel(e.name, pair.c1, pair.c2))) continue; const g = groups.get(r.key) || { r, list: [] }; g.list.push(s); groups.set(r.key, g); }
      const order = [...groups.values()].sort((a, b) => this.elecs.indexOf(a.r.e) - this.elecs.indexOf(b.r.e) || a.r.c1 - b.r.c1);
      html += `<div class="side-row"><span>Journal${this.state.stims.length ? ` · ${this.state.stims.length} stimulation${this.state.stims.length > 1 ? 's' : ''}` : ''}</span><span><button id="stShowAll" class="${sg.showAll ? 'on' : ''}">toutes les paires</button><button id="stCopy">Copier</button></span></div>`;
      if (!order.length) html += `<div class="hint">${this.state.stims.length ? 'Aucune stimulation sur cette paire.' : 'Aucune stimulation enregistrée.'}</div>`;
      for (const g of order) {
        const col = m => g.list.filter(s => s.mode === m).sort((a, b) => a.mA - b.mA || (a.t || '').localeCompare(b.t || '')).map(s => { const lv = S.stimLevel(s); return `<div class="st-entry${sg.editing === s.id ? ' sel' : ''}" data-sid="${s.id}"><i style="background:${rgb(S.RESP[lv].color)}"></i><b>${S.fmtA(s.mA)}</b> <span>${esc(S.stimSummary(s))}</span>${s.note ? ` <em>${esc(s.note)}</em>` : ''}<small>${hhmm(s.t)}${s.pulse !== S.STIM_MODES[s.mode].pulse || s.dur !== S.STIM_MODES[s.mode].dur ? ` · ${s.pulse} ms · ${s.dur} s` : ''}</small><a data-del="${s.id}" title="supprimer">×</a></div>`; }).join('');
        html += `<div class="st-pair"><div class="st-h"><b>${esc(g.r.key)}</b> <span class="muted">${esc(S.pairStructures(g.r.e, g.r.c1, g.r.c2, this.atlas))}</span>${this.isCoagulated(g.r.e, g.r.c1, g.r.c2) ? ' <span class="badge les">TC</span>' : ''}</div><div class="st-cols"><div><div class="st-t">Trains 50 Hz</div>${col('train') || '<div class="muted">—</div>'}</div><div><div class="st-t">Chocs 1 Hz</div>${col('shock') || '<div class="muted">—</div>'}</div></div></div>`;
      }
      box.innerHTML = html;
      // liaisons
      $('stElec').onchange = ev => { sg.stimElec = ev.target.value; sg.pair = null; this.renderStims(); this.refreshMarkers(); };
      box.querySelectorAll('#stPairs .pchip').forEach(b => b.onclick = () => { const c1 = +b.dataset.c1; sg.pair = { elec: e.name, c1, c2: c1 + 1 }; this.renderStims(); this.refreshMarkers(); });
      box.querySelectorAll('.seg.mode button').forEach(b => b.onclick = () => { const m = b.dataset.mode; if (m === F.mode) return; const d = S.STIM_MODES[m]; Object.assign(F, { mode: m, pulse: d.pulse, dur: d.dur }); if (F.mA > d.maxA) F.mA = d.maxA; this.renderStims(); });
      const bind = (id, fn, evName) => { const el = $(id); if (el) el[evName || 'onchange'] = ev => fn(ev.target); };
      bind('stDur', t => { F.dur = num(t.value, F.dur); }); bind('stPulse', t => { F.pulse = num(t.value, F.pulse); }); bind('stMa', t => { F.mA = Math.max(0.1, num(t.value, F.mA)); });
      bind('stStep', t => { F.step = +t.value; this.renderStims(); });
      const setMa = v => { F.mA = Math.round(Math.max(0.1, Math.min(10, v)) * 10) / 10; this.renderStims(); };
      $('stMinus').onclick = () => setMa(F.mA - F.step); $('stPlus').onclick = () => setMa(F.mA + F.step);
      box.querySelectorAll('.pre-row .pre').forEach(b => b.onclick = () => setMa(+b.dataset.ma));
      box.querySelectorAll('.resp-row .resp').forEach(b => b.onclick = () => {
        const r = b.dataset.r;
        if (r === 'none') { F.clin = F.ad = F.sz = false; F.clinType = ''; }
        else if (r === 'func' || r === 'subj') { if (F.clin && F.clinType === r) { F.clin = false; F.clinType = ''; } else { F.clin = true; F.clinType = r; if (r === 'func') F.habitual = false; } }
        else F[r] = !F[r];
        this.renderStims(); if ((r === 'func' || r === 'subj') && F.clin) { const i = $('stClinText'); if (i) i.focus(); }
      });
      bind('stClinText', t => { F.clinText = t.value.trim(); }, 'oninput'); bind('stHab', t => { F.habitual = t.checked; }); bind('stAdDur', t => { F.adDur = t.value; }); bind('stSzHab', t => { F.szHabitual = t.checked; });
      bind('stEeg', t => { F.eeg = t.value.trim(); }, 'oninput'); bind('stNote', t => { F.note = t.value.trim(); }, 'oninput');
      $('stCcepToggle').onclick = () => { sg.ccepOpen = !sg.ccepOpen; this.renderStims(); };
      box.querySelectorAll('[data-rm]').forEach(a => a.onclick = () => { F.ccep = F.ccep.filter(k => k !== a.dataset.rm); this.renderStims(); });
      if ($('stCcepElec')) $('stCcepElec').onchange = ev => { sg.ccepElec = ev.target.value; this.renderStims(); };
      box.querySelectorAll('[data-ccep]').forEach(b => b.onclick = () => { const k = b.dataset.ccep; F.ccep = F.ccep.includes(k) ? F.ccep.filter(x => x !== k) : F.ccep.concat([k]); this.renderStims(); });
      $('stSave').onclick = () => this.stimSave(false); if ($('stSaveNext')) $('stSaveNext').onclick = () => this.stimSave(true);
      if ($('stDup')) $('stDup').onclick = () => { sg.editing = null; this.stimSave(false); };
      if ($('stCancel')) $('stCancel').onclick = () => { sg.editing = null; sg.form = this.stimDefaultForm(F.mode); this.renderStims(); this.refreshMarkers(); };
      $('stShowAll').onclick = () => { sg.showAll = !sg.showAll; this.renderStims(); };
      $('stCopy').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(this.stimsText()).then(() => this.toast('Journal copié')); };
      box.querySelectorAll('.st-entry').forEach(d => d.onclick = ev => { if (ev.target.dataset.del) return; this.stimEdit(d.dataset.sid); });
      box.querySelectorAll('[data-del]').forEach(a => a.onclick = ev => { ev.stopPropagation(); this.stimDelete(a.dataset.del); });
    },
    stimSave(next) {
      const sg = this.ensureSeeg(), F = sg.form, pair = sg.pair; if (!pair) { this.toast('Choisissez d’abord une paire de plots'); return; }
      const e = this.elecByName(pair.elec); if (!e) return;
      const rec = { id: sg.editing || uid('s'), eid: e.id, elec: e.name, c1: pair.c1, c2: pair.c2, mode: F.mode, freq: S.STIM_MODES[F.mode].freq, pulse: F.pulse, dur: F.dur, mA: F.mA, clin: !!F.clin, clinType: F.clin ? (F.clinType || 'func') : '', clinText: F.clin ? F.clinText : '', habitual: !!(F.clin && F.clinType === 'subj' && F.habitual), ad: !!F.ad, adDur: F.ad && F.adDur !== '' ? num(F.adDur, 0) : null, sz: !!F.sz, szHabitual: !!(F.sz && F.szHabitual), eeg: F.eeg, ccep: F.ccep.slice(), note: F.note, t: new Date().toISOString() };
      if (sg.editing) { const i = this.state.stims.findIndex(s => s.id === sg.editing); const old = i >= 0 ? this.state.stims[i] : null; if (old) rec.t = old.t; if (i >= 0) this.state.stims[i] = rec; else this.state.stims.push(rec); sg.editing = null; this.toast('Stimulation mise à jour'); }
      else { this.state.stims.push(rec); this.toast(`${S.pairLabel(e.name, pair.c1, pair.c2)} · ${S.STIM_MODES[F.mode].fr} · ${S.fmtA(F.mA)} — ${S.stimSummary(rec)}`, 3000); }
      // le formulaire garde mode, intensité, durée, largeur ; la réponse et la note repartent de zéro
      Object.assign(F, { clin: false, clinType: '', clinText: '', habitual: false, ad: false, adDur: '', sz: false, szHabitual: false, eeg: '', ccep: [], note: '' });
      if (next) F.mA = Math.round(Math.min(10, F.mA + F.step) * 10) / 10;
      this.seegChanged(); this.renderStims(); this.refreshMarkers();
    },
    stimEdit(id) {
      const sg = this.ensureSeeg(), s = this.state.stims.find(x => x.id === id); if (!s) return; const r = this.resolvePair(s); if (!r) return;
      sg.editing = id; sg.stimElec = r.e.name; sg.pair = { elec: r.e.name, c1: r.c1, c2: r.c2 };
      sg.form = { mode: s.mode, mA: s.mA, pulse: s.pulse, dur: s.dur, step: sg.form.step, clin: !!s.clin, clinType: s.clin ? S.clinTypeOf(s) : '', clinText: s.clinText || '', habitual: !!s.habitual, ad: !!s.ad, adDur: s.adDur == null ? '' : s.adDur, sz: !!s.sz, szHabitual: !!s.szHabitual, eeg: s.eeg || '', ccep: (s.ccep || []).slice(), note: s.note || '' };
      this.renderStims(); this.refreshMarkers();
    },
    stimDelete(id) { const sg = this.ensureSeeg(); this.state.stims = this.state.stims.filter(s => s.id !== id); if (sg.editing === id) { sg.editing = null; sg.form = this.stimDefaultForm(sg.form.mode); } this.seegChanged(); this.renderStims(); this.refreshMarkers(); },
    stimsText() {
      const lines = [`EpiScope — stimulations corticales — ${this.state.name || 'cas'}`];
      for (const s of this.state.stims.slice().sort((a, b) => (a.t || '').localeCompare(b.t || ''))) { const r = this.resolvePair(s); lines.push(`${hhmm(s.t)} ${r ? r.key : s.elec + s.c1 + '-' + s.c2} ${S.STIM_MODES[s.mode].fr} ${S.fmtA(s.mA)} ${s.pulse} ms ${s.dur} s — ${S.stimSummary(s)}${s.note ? ' — ' + s.note : ''}`); }
      return lines.join('\n');
    },

    // ------------------------------------------------------------------ THERMOCOAGULATIONS
    renderThermo() {
      const box = $('tab-thermo'); if (!box) return; const sg = this.ensureSeeg();
      if (!this.elecs.length) { box.innerHTML = '<div class="hint">Aucune électrode : construisez d’abord le schéma d’implantation.</div>'; return; }
      const e = this.currentElec('thermoElec');
      let html = `<div class="hint">Thermocoagulations SEEG entre plots contigus. Avant chaque cible, une stimulation directe est recommandée : un déficit moteur à la stimulation prédit un déficit similaire après thermocoagulation (recommandations françaises). Les paires marquées apparaissent en sphères rouges dans la vue et dans le rapport.</div>
        <div class="ctrl-row"><input id="tcText" placeholder="saisie rapide : Ia 1-3, OC 4-7, B’ 2-3 (une plage est développée en paires contiguës)"><button id="tcAdd" class="primary">Ajouter</button></div>
        <div class="ctrl-row"><label>électrode <select id="tcElec">${this.elecOptions(e.name)}</select></label><label>date <input id="tcDate" type="date" value="${esc(sg.thermoDate || (this.thermoDefaultDate ? this.thermoDefaultDate() : '') || sg.thermoDate)}"></label></div>
        <div class="pchips" id="tcPairs">${this.pairChips(e, null, 'thermo')}</div><div class="hint">cliquez une paire pour la marquer / retirer ; le point coloré rappelle la réponse maximale aux stimulations</div>`;
      const groups = new Map();
      for (const t of this.state.thermo) { const r = this.resolvePair(t); if (!r) continue; const g = groups.get(r.e.name) || { e: r.e, list: [] }; g.list.push(Object.assign({ r }, t)); groups.set(r.e.name, g); }
      const order = [...groups.values()].sort((a, b) => this.elecs.indexOf(a.e) - this.elecs.indexOf(b.e));
      html += `<div class="side-row"><span>${this.state.thermo.length ? `${this.state.thermo.length} paire${this.state.thermo.length > 1 ? 's' : ''} thermocoagulée${this.state.thermo.length > 1 ? 's' : ''}` : 'Aucune thermocoagulation enregistrée'}</span><span>${this.state.thermo.length ? '<button id="tcCopy">Copier</button><button id="tcClear" class="danger">Tout retirer</button>' : ''}</span></div>`;
      for (const g of order) {
        html += `<div class="tc-elec"><b>${esc(g.e.name)}</b> <span class="muted">${esc(g.e.fr || '')}</span><div class="tc-list">${g.list.sort((a, b) => a.c1 - b.c1).map(t => { const stims = this.stimsOf(g.e, t.c1, t.c2), lv = this.pairMaxLevel(g.e, t.c1, t.c2); return `<div class="tc-entry"><i></i><b>${t.c1}-${t.c2}</b> <span>${esc(S.pairStructures(g.e, t.c1, t.c2, this.atlas))}</span><small>${esc(t.date || '')}${stims.length ? ` · stim : ${stims.length}, max ${S.RESP[lv].fr}` : ' · non stimulée'}</small><input class="tcnote" data-key="${esc(t.r.key)}" placeholder="note" value="${esc(t.note || '')}"><a data-rm="${esc(t.r.key)}" title="retirer">×</a></div>`; }).join('')}</div></div>`;
      }
      box.innerHTML = html;
      $('tcAdd').onclick = () => this.thermoAddRanges($('tcText').value); $('tcText').onkeydown = ev => { if (ev.key === 'Enter') this.thermoAddRanges($('tcText').value); };
      $('tcElec').onchange = ev => { sg.thermoElec = ev.target.value; this.renderThermo(); }; $('tcDate').onchange = ev => { sg.thermoDate = ev.target.value; };
      box.querySelectorAll('#tcPairs .pchip').forEach(b => b.onclick = () => { const c1 = +b.dataset.c1; this.thermoToggle(e, c1, c1 + 1); });
      box.querySelectorAll('[data-rm]').forEach(a => a.onclick = () => { this.state.thermo = this.state.thermo.filter(t => { const r = this.resolvePair(t); return !r || r.key !== a.dataset.rm; }); this.seegChanged(); this.renderThermo(); this.refreshMarkers(); });
      box.querySelectorAll('.tcnote').forEach(i => i.onchange = () => { const t = this.state.thermo.find(x => { const r = this.resolvePair(x); return r && r.key === i.dataset.key; }); if (t) { t.note = i.value.trim(); this.seegChanged(); this.refreshMarkers(); } });
      if ($('tcCopy')) $('tcCopy').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(this.thermoText()).then(() => this.toast('Liste copiée')); };
      if ($('tcClear')) $('tcClear').onclick = () => { if (confirm('Retirer toutes les thermocoagulations ?')) { this.state.thermo = []; this.seegChanged(); this.renderThermo(); this.refreshMarkers(); } };
    },
    thermoToggle(e, c1, c2) {
      const sg = this.ensureSeeg(), key = S.pairLabel(e.name, c1, c2), i = this.state.thermo.findIndex(t => { const r = this.resolvePair(t); return r && r.key === key; });
      if (i >= 0) this.state.thermo.splice(i, 1); else this.state.thermo.push({ eid: e.id, elec: e.name, c1, c2, date: sg.thermoDate, note: '' });
      this.seegChanged(); if (this.ui.tab === 'thermo') this.renderThermo(); this.refreshMarkers();
    },
    thermoAddRanges(text) {
      const sg = this.ensureSeeg(), pairs = S.parseRanges(text); let added = 0; const unknown = [];
      for (const p of pairs) { const e = this.elecByName(p.elec); if (!e || p.c2 > e.nContacts) { unknown.push(S.pairLabel(p.elec, p.c1, p.c2)); continue; } if (this.isCoagulated(e, p.c1, p.c2)) continue; this.state.thermo.push({ eid: e.id, elec: e.name, c1: p.c1, c2: p.c2, date: sg.thermoDate, note: '' }); added++; }
      if (!pairs.length) this.toast('Rien de reconnu : écrivez par exemple « Ia 1-3, OC 4-7 »'); else this.toast(`${added} paire${added > 1 ? 's' : ''} ajoutée${added > 1 ? 's' : ''}` + (unknown.length ? ' · inconnues : ' + unknown.join(', ') : ''), 4000);
      $('tcText').value = ''; this.seegChanged(); this.renderThermo(); this.refreshMarkers();
    },
    thermoText() { const lines = [`EpiScope — thermocoagulations — ${this.state.name || 'cas'}`]; for (const t of this.state.thermo) { const r = this.resolvePair(t); if (r) lines.push(`${r.key} (${S.pairStructures(r.e, r.c1, r.c2, this.atlas)})${t.date ? ' · ' + t.date : ''}${t.note ? ' · ' + t.note : ''}`); } return lines.join('\n'); },

    // ------------------------------------------------------------------ QUANTIFICATION
    renderQuant() {
      const box = $('tab-quant'); if (!box) return; const sg = this.ensureSeeg(), imp = sg.quantImport, cfg = (this.viewer && this.viewer.activeCfg) || {}, sets = this.state.quant;
      let html = `<div class="qx-head"><b title="Valeurs par plot ou par paire bipolaire (EI, taux de pointes, puissance…) : sphères colorées sur les plots, en 3D et dans les coupes ; régions de la parcellation colorées par la valeur de leurs plots">Valeurs sur les plots</b>${sets.length ? `<span class="muted">${sets.length} jeu${sets.length > 1 ? 'x' : ''}</span>` : ''}<span class="spacer"></span><button id="qAdd" title="Importer un fichier (Excel, CSV, texte) ou créer un jeu vide">＋ Jeu ▾</button><input type="file" id="qFileInput" accept=".xlsx,.xlsm,.csv,.tsv,.txt" hidden></div>`;
      if (imp) {
        const sheet = imp.sheets[imp.sheet], det = imp.det;
        html += `<div class="q-import"><div class="side-row"><b>${esc(imp.fileName)}</b><a id="qImpClose">fermer</a></div>
          ${imp.sheets.length > 1 ? `<div class="ctrl-row"><label>feuille <select id="qSheet">${imp.sheets.map((s, i) => `<option value="${i}"${i === imp.sheet ? ' selected' : ''}>${esc(s.name)} (${s.rows.length} lignes)</option>`).join('')}</select></label></div>` : ''}
          ${det.labelCol < 0 ? '<div class="hint warn">Aucune colonne d’étiquettes de plots reconnue dans cette feuille (attendu : A’1-2, B1-2, A1…).</div>' : `<div class="ctrl-row"><label>étiquettes <select id="qLabelCol">${sheet.rows[0].map((c, i) => `<option value="${i}"${i === det.labelCol ? ' selected' : ''}>${esc(det.header ? String(sheet.rows[0][i] || 'colonne ' + (i + 1)) : 'colonne ' + (i + 1))}</option>`).join('')}</select></label>
            <label>valeurs <select id="qValCol">${det.numCols.map(c => `<option value="${c.idx}"${c.idx === imp.valCol ? ' selected' : ''}>${esc(c.name)} (${c.n} valeurs, ${c.min.toLocaleString(SV.LOC, { maximumFractionDigits: 3 })} → ${c.max.toLocaleString(SV.LOC, { maximumFractionDigits: 3 })})</option>`).join('')}</select></label></div>
            <div class="ctrl-row"><label>nom <input id="qName" value="${esc(imp.name)}"></label><label>unité <input id="qUnit" value="${esc(imp.unit)}" style="width:60px"></label><label>min <input id="qMin" type="number" step="any" value="${imp.min}"></label><label>max <input id="qMax" type="number" step="any" value="${imp.max}"></label></div>
            <div class="ctrl-row"><label>palette <select id="qCmap">${Object.entries(S.CMAPS).map(([k, v]) => `<option value="${k}"${k === imp.cmap ? ' selected' : ''}>${esc(v.fr)}</option>`).join('')}</select></label><i class="qbar" style="background:${S.cmapCss(imp.cmap)}"></i><label>rendu <select id="qMode">${[['color', 'couleur'], ['size', 'taille'], ['both', 'couleur et taille']].map(([k, l]) => `<option value="${k}"${k === imp.mode ? ' selected' : ''}>${l}</option>`).join('')}</select></label></div>
            <div class="hint">${imp.preview.n} valeur${imp.preview.n > 1 ? 's' : ''} reconnue${imp.preview.n > 1 ? 's' : ''}${imp.preview.unmatched.length ? ` · <span class="warn">${imp.preview.unmatched.length} étiquette${imp.preview.unmatched.length > 1 ? 's' : ''} sans électrode dans le schéma : ${esc(imp.preview.unmatched.slice(0, 8).join(', '))}${imp.preview.unmatched.length > 8 ? '…' : ''}</span>` : ''}${imp.preview.duplicates.length ? ` · doublons : ${esc(imp.preview.duplicates.join(', '))}` : ''}</div>
            <div class="btnrow"><button id="qImport" class="primary"${imp.preview.n ? '' : ' disabled'}>Importer ce jeu</button></div>`}</div>`;
      }
      if (!sets.length && !imp) html += '<div class="hint qx-empty">Aucun jeu : calculez l’EI d’un tracé (ci-dessus) ou importez un fichier (＋ Jeu).</div>';
      if (sg.quantOpenId == null || (sg.quantOpenId && !sets.some(q => q.id === sg.quantOpenId))) { const sh = sets.find(q => q.id === cfg.quant); sg.quantOpenId = sh ? sh.id : null; }   // '' : tous fermés par l'utilisateur
      const fmt = v => (+v).toLocaleString(SV.LOC, { maximumFractionDigits: 3 }), selK = this.ui.quantSel;
      const others = this.quantGrouped ? sets.filter(q => !this.quantGrouped(q)) : sets;
      if (others.length !== sets.length) html = html.replace('>Valeurs sur les plots</b>', '>Autres jeux</b>').replace(`${sets.length} jeu${sets.length > 1 ? 'x' : ''}`, `${others.length ? others.length + ' importé' + (others.length > 1 ? 's' : '') + ' ou saisi' + (others.length > 1 ? 's' : '') : 'importés ou saisis'}`);
      html += '<div class="qx-list">' + others.map(q => this.quantRowHtml(q)).join('') + '</div>';
      box.innerHTML = html;
      $('qFileInput').onchange = ev => { const f = ev.target.files[0]; if (f) this.quantLoadFile(f); };
      $('qAdd').onclick = e => { const b = e.currentTarget.getBoundingClientRect(); this.popupMenu([{ label: 'Importer un fichier (Excel, CSV, texte)…', run: () => { $('qFileInput').value = ''; $('qFileInput').click(); } }, { label: 'Nouveau jeu vide', run: () => { const q = { id: uid('q'), name: 'valeur', unit: '', cmap: 'viridis', mode: 'color', min: 0, max: 1, source: 'saisie', values: {} }; this.state.quant.push(q); sg.quantOpenId = q.id; sg.quantAll = q.id; this.seegChanged(); this.renderQuant(); } }], b.left - 120, b.bottom + 4); };
      if (imp) {
        $('qImpClose').onclick = () => { sg.quantImport = null; this.renderQuant(); };
        if ($('qSheet')) $('qSheet').onchange = ev => { this.quantSetSheet(+ev.target.value); };
        if ($('qLabelCol')) { $('qLabelCol').onchange = ev => { imp.det.labelCol = +ev.target.value; this.quantPreview(); this.renderQuant(); }; $('qValCol').onchange = ev => { imp.valCol = +ev.target.value; const c = imp.det.numCols.find(x => x.idx === imp.valCol); if (c) { imp.name = c.name; imp.min = c.min; imp.max = c.max; } this.quantPreview(); this.renderQuant(); };
          $('qName').onchange = ev => { imp.name = ev.target.value.trim() || 'valeur'; }; $('qUnit').onchange = ev => { imp.unit = ev.target.value.trim(); }; $('qMin').onchange = ev => { imp.min = num(ev.target.value, imp.min); }; $('qMax').onchange = ev => { imp.max = num(ev.target.value, imp.max); };
          $('qCmap').onchange = ev => { imp.cmap = ev.target.value; this.renderQuant(); }; $('qMode').onchange = ev => { imp.mode = ev.target.value; };
          $('qImport').onclick = () => this.quantImport(); }
      }
      box.querySelectorAll('.qx-list .qx-row').forEach(card => { const q = sets.find(x => x.id === card.dataset.q); if (q) this.quantRowBind(card, q); });
    },
    /** ligne d'un jeu (◉ vue active, nom, plots, palette, ⋯ ; ouverte : valeurs les plus fortes, tableau, réglages) — o.label : nom affiché */
    quantRowHtml(q, o) {
      const sg = this.ensureSeeg(), cfg = (this.viewer && this.viewer.activeCfg) || {};
      const fmt = v => (+v).toLocaleString(SV.LOC, { maximumFractionDigits: 3 }), selK = this.ui.quantSel;

        const shown = cfg.quant === q.id, open = sg.quantOpenId === q.id, keys = Object.keys(q.values || {}).sort((a, b) => (q.values[b] - q.values[a])), span = (q.max - q.min) || 1, roi = q.roi || 'max';
        const bar = v => { const t = Math.max(0, Math.min(1, (v - q.min) / span)), c = S.cmap(q.cmap, t); return `<i class="ie-bar"><b style="width:${Math.round(t * 100)}%;background:rgb(${c.join(',')})"></b></i>`; };
        return `<div class="qx-row${shown ? ' on' : ''}${open ? ' open' : ''}" data-q="${q.id}"><div class="qx-line"><button class="qx-eye" title="${shown ? 'Affiché dans la vue active — cliquer pour masquer' : 'Afficher dans la vue active'}">${shown ? '◉' : '○'}</button><span class="qx-name" title="${esc(q.name + (q.source ? ' — ' + q.source : ''))}">${esc((o && o.label) || q.name)}</span><span class="muted qx-n">${keys.length} plot${keys.length > 1 ? 's' : ''}</span><i class="qbar qx-bar" style="background:${S.cmapCss(q.cmap)}"></i><button class="qx-more" title="Autres actions">⋯</button></div>
          ${open ? `<div class="qx-det">${q.source ? `<div class="hint">${esc(q.source)}</div>` : ''}
            <div class="qx-top">${keys.slice(0, 8).map(k => `<div class="qx-v${k === selK ? ' sel' : ''}" data-k="${esc(k)}" title="Centrer la 3D et les coupes sur ${esc(k)}"><span class="mono">${esc(k)}</span>${bar(q.values[k])}<span>${fmt(q.values[k])}</span></div>`).join('') || '<div class="hint">Aucune valeur.</div>'}</div>
            <div class="qx-links"><a class="qx-all">${sg.quantAll === q.id ? 'masquer le tableau' : `${keys.length > 8 ? 'toutes les valeurs (' + keys.length + ')' : 'modifier les valeurs'}`}</a><a class="qx-cfg">${sg.quantCfg === q.id ? 'masquer les réglages' : 'réglages'}</a></div>
            ${sg.quantCfg === q.id ? `<div class="qx-set"><div class="ctrl-row"><label>min <input class="qmin" type="number" step="any" value="${q.min}"></label><label>max <input class="qmax" type="number" step="any" value="${q.max}"></label><button class="qauto" title="min et max des valeurs">auto</button></div>
              <div class="ctrl-row"><label>palette <select class="qcmap">${Object.entries(S.CMAPS).map(([k, v]) => `<option value="${k}"${k === q.cmap ? ' selected' : ''}>${esc(v.fr)}</option>`).join('')}</select></label><label>plots <select class="qmode">${[['color', 'couleur'], ['size', 'taille'], ['both', 'couleur et taille']].map(([k, l]) => `<option value="${k}"${k === q.mode ? ' selected' : ''}>${l}</option>`).join('')}</select></label></div>
              <div class="ctrl-row"><label title="Régions de la parcellation colorées par la valeur des plots qu’elles contiennent (cortex et structures profondes)">régions <select class="qroi">${[['max', 'valeur maximale'], ['mean', 'valeur moyenne'], ['off', 'non colorées']].map(([k, l]) => `<option value="${k}"${k === roi ? ' selected' : ''}>${l}</option>`).join('')}</select></label><label>unité <input class="unit" value="${esc(q.unit || '')}" style="width:70px"></label></div></div>` : ''}
            ${sg.quantAll === q.id ? `<div class="qx-tabwrap"><table class="q-table"><tr><th>plot</th><th>${esc(q.name)}</th><th></th></tr>${keys.map(k => `<tr><td class="mono">${esc(k)}</td><td><input class="qv" data-k="${esc(k)}" type="number" step="any" value="${q.values[k]}"></td><td><a class="qrm" data-k="${esc(k)}">×</a></td></tr>`).join('')}<tr><td><input class="qnewk" placeholder="A’1-2"></td><td><input class="qnewv" type="number" step="any" placeholder="valeur"></td><td><button class="qnewb">+</button></td></tr></table></div>` : ''}</div>` : ''}</div>`;
    },
    quantRowBind(card, q) {
      const sg = this.ensureSeeg(), cfg = (this.viewer && this.viewer.activeCfg) || {};
        const upd = () => { this.seegChanged(); this.refreshMarkers(); }, $c = s => card.querySelector(s), shown = cfg.quant === q.id;
        $c('.qx-line').onclick = e => { if (e.target.closest('button')) return; sg.quantOpenId = sg.quantOpenId === q.id ? '' : q.id; this.renderQuant(); };
        $c('.qx-eye').onclick = () => { if (shown) this.quantHide(q, true); else { this.viewer.setCellConfig(this.viewer.active, this.quantViewCfg(q), true); sg.quantOpenId = q.id; } this.refreshMarkers(); this.renderQuant(); };
        $c('.qx-more').onclick = e => { const b = e.currentTarget.getBoundingClientRect(); this.popupMenu([{ head: q.name }, { label: 'Afficher dans toutes les vues', run: () => { this.viewer.setAllCells(this.quantViewCfg(q)); this.refreshMarkers(); this.renderQuant(); } }, { label: 'Masquer partout', run: () => { this.quantHide(q); this.refreshMarkers(); this.renderQuant(); } }, { sep: true },
          { label: 'Renommer…', run: () => { const t = prompt('Nom du jeu', q.name); if (t && t.trim()) { q.name = t.trim(); upd(); this.renderQuant(); } } }, { label: 'Exporter (CSV)', run: () => this.quantCSV(q) }, { sep: true },
          { label: 'Supprimer le jeu…', danger: true, run: () => { if (!confirm(`Supprimer le jeu « ${q.name} » ?`)) return; this.quantHide(q); this.state.quant = this.state.quant.filter(x => x !== q); upd(); this.renderQuant(); } }], b.right - 230, b.bottom + 4); };
        card.querySelectorAll('.qx-v').forEach(r => r.onclick = () => this.quantSelect(r.dataset.k, q));
        const all = $c('.qx-all'); if (all) all.onclick = () => { sg.quantAll = sg.quantAll === q.id ? null : q.id; this.renderQuant(); };
        const cf = $c('.qx-cfg'); if (cf) cf.onclick = () => { sg.quantCfg = sg.quantCfg === q.id ? null : q.id; this.renderQuant(); };
        if ($c('.qmin')) {
          $c('.qmin').onchange = ev => { q.min = num(ev.target.value, q.min); upd(); this.renderQuant(); }; $c('.qmax').onchange = ev => { q.max = num(ev.target.value, q.max); upd(); this.renderQuant(); };
          $c('.qauto').onclick = () => { const v = Object.values(q.values); if (v.length) { q.min = Math.min(...v); q.max = Math.max(...v); upd(); this.renderQuant(); } };
          $c('.qcmap').onchange = ev => { q.cmap = ev.target.value; upd(); this.renderQuant(); }; $c('.qmode').onchange = ev => { q.mode = ev.target.value; upd(); };
          $c('.qroi').onchange = ev => { q.roi = ev.target.value; this.viewer.cells.forEach((c, i) => { if (c.cfg.quant === q.id) this.viewer.setCellConfig(i, { paint: q.roi === 'off' ? null : 'q:' + q.id }, true); }); upd(); };
          $c('.unit').onchange = ev => { q.unit = ev.target.value.trim(); upd(); };
        }
        card.querySelectorAll('.qv').forEach(i => i.onchange = () => { const v = num(i.value, NaN); if (isNaN(v)) return; q.values[i.dataset.k] = v; upd(); });
        card.querySelectorAll('.qrm').forEach(a => a.onclick = () => { delete q.values[a.dataset.k]; upd(); this.renderQuant(); });
        const nb = $c('.qnewb'); if (nb) nb.onclick = () => { const p = S.parseLabel($c('.qnewk').value), v = num($c('.qnewv').value, NaN); const e = p && this.elecByName(p.elec); if (!e || isNaN(v)) { this.toast('Étiquette inconnue ou valeur manquante'); return; } q.values[S.pairLabel(e.name, p.c1, p.c2)] = v; upd(); this.renderQuant(); };
    },
    /** retire un jeu de la vue active (ou de toutes), avec la coloration de ses régions */
    quantHide(q, activeOnly) { this.viewer.cells.forEach((c, i) => { if (c.cfg.quant === q.id && (!activeOnly || i === this.viewer.active)) this.viewer.setCellConfig(i, Object.assign({ quant: null }, c.cfg.paint === 'q:' + q.id ? { paint: null } : {}), true); }); },
    quantCSV(q) { const lines = ['plot;' + q.name.replace(/;/g, ','), ...Object.entries(q.values || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ';' + String(v).replace('.', ','))]; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })); a.download = q.name.replace(/[^\w\-]+/g, '_').slice(0, 60) + '.csv'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); },
    async quantLoadFile(file) {
      const sg = this.ensureSeeg();
      try {
        const t = await S.readTable(file);
        sg.quantImport = { fileName: file.name, sheets: t.sheets, sheet: 0, cmap: 'viridis', mode: 'color', unit: '' };
        this.quantSetSheet(0, true); this.toast(`${file.name} : ${t.sheets.length} feuille${t.sheets.length > 1 ? 's' : ''}`);
      } catch (err) { this.toast('Lecture impossible : ' + err.message, 6000); console.warn(err); }
    },
    quantSetSheet(i, first) {
      const sg = this.ensureSeeg(), imp = sg.quantImport; imp.sheet = i; imp.det = S.detectColumns(imp.sheets[i].rows);
      const c = imp.det.numCols[0]; imp.valCol = c ? c.idx : -1; imp.name = c ? c.name : 'valeur'; imp.min = c ? c.min : 0; imp.max = c ? c.max : 1;
      if (/^(ei|epileptogenicity)/i.test(imp.name)) { imp.min = 0; imp.max = 1; }
      this.quantPreview(); this.renderQuant();
    },
    quantPreview() { const imp = this.ui.seeg.quantImport, d = imp.det; const r = d.labelCol >= 0 && imp.valCol >= 0 ? S.extractValues(d.rows, d.labelCol, imp.valCol, this.elecs) : { values: {}, unmatched: [], duplicates: [] }; imp.preview = { n: Object.keys(r.values).length, unmatched: r.unmatched, duplicates: r.duplicates, values: r.values }; },
    quantImport() {
      const sg = this.ensureSeeg(), imp = sg.quantImport; if (!imp || !imp.preview.n) return;
      const q = { id: uid('q'), name: imp.name, unit: imp.unit, cmap: imp.cmap, mode: imp.mode, min: imp.min, max: imp.max, source: imp.fileName + (imp.sheets.length > 1 ? ' / ' + imp.sheets[imp.sheet].name : ''), values: imp.preview.values, unmatched: imp.preview.unmatched };
      this.state.quant.push(q); sg.quantImport = null; sg.quantOpenId = q.id;
      this.viewer.setCellConfig(this.viewer.active, this.quantViewCfg(q), true);
      this.seegChanged(); this.refreshMarkers(); this.renderQuant(); this.toast(`Jeu « ${q.name} » importé (${Object.keys(q.values).length} plots) et affiché dans la vue active`, 4000);
    },
    /** réglage d'une vue de quantification : électrodes visibles, cortex transparent, réseau masqué (le réseau se réactive par ses cases) */
    quantViewCfg(q) { const c = this.viewer.activeCfg || {}, roi = (q.roi || 'max') !== 'off'; return Object.assign({ quant: q.id, electrodes: true, fibers: false, nodes: false, sync: false, paint: roi ? 'q:' + q.id : null }, c.opacity > 0.6 || (roi && c.opacity < 0.5) ? { opacity: roi ? 0.55 : 0.35 } : {}); },
    seegChanged() { this.changed(); },

    // ------------------------------------------------------------------ rapport : vues et tables
    /** vues (faces latérale et médiale de chaque hémisphère implanté, puis supérieure) avec un réglage donné, fond blanc */
    /** réglage des vues SEEG (rapport et bouton de la vue) : cortex en verre neutre, sans structures profondes ni réseau,
     *  électrodes et étiquettes ; une seule information SEEG à la fois (patch) */
    seegViewCfg(patch) { return Object.assign({ inflate: 0, opacity: 0.3, neutral: true, frontGlass: true, sub: false, subFilter: 'all', subOpacity: 0.95, subHemi: 'both', subFams: null, stimSet: 'all', electrodes: true, labels: true, fibers: false, nodes: false, sync: false, netLabels: false, borders: false, thermo: false, stims: false, ccep: false, quant: null, hyps: [] }, patch || {}); },
    /** vues SEEG pour le rapport. Disposition : une colonne par hémisphère implanté (gauche puis droit), face latérale en haut,
     *  face mésiale en bas présentée en miroir (orientée comme la latérale du même hémisphère : on « pèle » le cortex du premier
     *  plan pour voir le fond), vue supérieure dans la dernière colonne sur les deux rangées.
     *  Structures profondes : toutes celles de l'hémisphère (sans cervelet) sur la latérale, amygdale et hippocampe seuls sur la mésiale. */
    async seegShots(patch, SHOT, tag, hemis) {
      const out = [], wait = () => new Promise(r => setTimeout(r, 150)); hemis = (hemis && hemis.length ? hemis : [...new Set(this.elecs.map(e => e.hemi))]).sort();
      const shot = mirror => this.viewer.snapshot(Object.assign({ background: '#ffffff', format: 'jpeg', quality: 0.9, mirror: !!mirror, orient: true }, SHOT));
      const implant = /^impl/.test(tag || '');   // schéma d'implantation : vues inférieure (radiologique) et antérieure des deux hémisphères à la place de la vue supérieure
      const view0 = this.viewer.cells[0] ? this.viewer.cells[0].cfg.view : 'latL';   // v5 : orientation rendue à la fin (la vue ne reste plus en « sup. » après une capture)
      this.viewer.setElectrodeStyle('light-bg');   // fond blanc : hampes sombres
      this.viewer.setCellConfig(0, this.seegViewCfg(Object.assign({ tilt: 0 }, patch)), true);   // latérales / mésiales vues d'une dizaine de degrés au-dessus de l'horizontale : les électrodes orthogonales se dégagent
      if (this.quantNetRefresh) this.quantNetRefresh();   // liens du jeu affiché (réseau h²) refaits pour cette vue
      for (const hm of hemis) {
        const side = hm === 'L' ? 'gauche' : 'droit';
        this.viewer.setCellConfig(0, { hemi: hm, elecHemi: hm, sub: true, subFilter: 'noCb' }, true); this.viewer.setView(hm === 'L' ? 'latL' : 'latR', false); this.viewer.setCellConfig(0, { hemi: hm }, true); await wait();
        out.push({ face: 'lat', hemi: hm, title: 'Latéral ' + side, name: tag + '_lateral_' + hm, img: shot(false) });
        this.viewer.setCellConfig(0, { hemi: hm, elecHemi: hm, sub: true, subFilter: 'mtl' }, true); this.viewer.setView(hm === 'L' ? 'medL' : 'medR', false); await wait();
        out.push({ face: 'med', hemi: hm, title: 'Mésial ' + side + ' (miroir)', name: tag + '_mesial_' + hm, img: shot(true) });
      }
      if (implant) {
        this.viewer.setCellConfig(0, { hemi: 'both', elecHemi: 'both', tilt: 0, sub: false, subFilter: 'all' }, true); this.viewer.setView('infRad', false); this.viewer.setCellConfig(0, { hemi: 'both' }, true); await wait();
        out.push({ face: 'inf', title: 'Inférieur (convention radiologique)', name: tag + '_inferieur', img: shot(false) });
        this.viewer.setView('ant', false); this.viewer.setCellConfig(0, { hemi: 'both' }, true); await wait();
        out.push({ face: 'ant', title: 'De face', name: tag + '_face', img: shot(false) });
        this.viewer.setView('latL', false);   // caméra rendue à l'orientation habituelle (haut = supérieur)
      } else {
        this.viewer.setView('sup', false); this.viewer.setCellConfig(0, { hemi: 'both', elecHemi: hemis.length > 1 ? 'both' : hemis[0], tilt: 0, sub: false, subFilter: 'all' }, true); await wait();
        out.push({ face: 'sup', title: 'Supérieur', name: tag + '_sup', img: shot(false) });
      }
      this.viewer.setCellConfig(0, { hemi: 'both', elecHemi: 'both', neutral: false, tilt: 0, subFilter: 'all' }, true); this.viewer.setElectrodeStyle(this.stageStyle());
      if (view0 && view0 !== this.viewer.cells[0].cfg.view) this.viewer.setView(view0, false);
      return out;
    },
    async seegReport(SHOT) {
      this.ensureSeeg(); const R = { stims: null, thermo: null, quant: [] }; if (!this.elecs.length) return R;
      const pairRow = s => { const r = this.resolvePair(s); return r ? { key: r.key, struct: S.pairStructures(r.e, r.c1, r.c2, this.atlas), e: r.e, c1: r.c1 } : null; };
      if (this.state.stims.length) {
        const rows = this.state.stims.map(s => Object.assign({ p: pairRow(s), level: S.stimLevel(s), levelFr: S.RESP[S.stimLevel(s)].fr, modeFr: S.STIM_MODES[s.mode].fr, summary: S.stimSummary(s), time: hhmm(s.t), date: s.t && !isNaN(new Date(s.t)) ? new Date(s.t).toLocaleDateString(SV.LOC) : '' }, s)).filter(x => x.p).sort((a, b) => this.elecs.indexOf(a.p.e) - this.elecs.indexOf(b.p.e) || a.p.c1 - b.p.c1 || a.mA - b.mA);
        const hemSt = [...new Set(rows.map(r => r.p.e.hemi))];
        // synthèse par paire et par mode : réponses obtenues, intensités efficaces (seuil « min » ou fourchette), histogramme
        const ORD = { sz: 0, ad: 1, clin: 2, none: 3 }, groups = new Map();
        for (const r of rows) { const k = r.mode + '|' + r.p.key; const g = groups.get(k) || { mode: r.mode, p: r.p, list: [] }; g.list.push(r); groups.set(k, g); }
        const pairs = [...groups.values()].map(g => {
          const types = S.pairResponseTypes(g.list), top = types[0], tested = g.list.map(s => s.mA), maxT = Math.max(...tested);
          const ranges = types.filter(t => t !== 'none').map(t => ({ type: t, fr: S.RESP[t].fr, color: rgb(S.RESP[t].color), txt: S.effectiveRange(g.list, t) }));
          const clin = [...new Set(g.list.filter(s => s.clin && s.clinText).map(s => s.clinText + (s.habitual ? ' (hab.)' : '')))], ad = g.list.filter(s => s.ad && s.adDur).map(s => s.adDur), szH = g.list.filter(s => s.sz).map(s => s.szHabitual);
          const ccep = [...new Set(g.list.flatMap(s => s.ccep || []))], eeg = [...new Set(g.list.map(s => s.eeg).filter(Boolean))], notes = [...new Set(g.list.map(s => s.note).filter(Boolean))];
          const det = [];
          if (szH.length) det.push('crise ' + (szH.some(Boolean) ? 'habituelle' : 'non habituelle') + (szH.length > 1 ? ` (×${szH.length})` : ''));
          if (ad.length) det.push('PD ' + (ad.length > 1 ? Math.min(...ad) + '–' + Math.max(...ad) : ad[0]) + ' s');
          if (clin.length) det.push('clinique : ' + clin.join(' ; '));
          if (ccep.length) det.push('CCEP ' + ccep.join(', ')); if (eeg.length) det.push('EEG : ' + eeg.join(' ; '));
          const dates = [...new Set(g.list.map(s => s.date).filter(Boolean))], times = g.list.map(s => s.time).filter(Boolean).sort();
          return { mode: g.mode, key: g.p.key, struct: g.p.struct, eIdx: this.elecs.indexOf(g.p.e), c1: g.p.c1, types: types.map(t => ({ type: t, fr: S.RESP[t].fr, color: rgb(S.RESP[t].color) })), top, ranges, tested: `${g.list.length} stim. · ${S.fmtA(Math.min(...tested))}${maxT > Math.min(...tested) ? '–' + S.fmtA(maxT) : ''}`, maxT,
            hist: g.list.map(s => ({ mA: s.mA, types: S.stimTypes(s) })), detail: det.join(' · ') || 'RAS', notes: notes.join(' ; '), when: dates.join(', ') + (times.length ? ' · ' + times[0] + (times.length > 1 && times[times.length - 1] !== times[0] ? '–' + times[times.length - 1] : '') : '') };
        }).sort((a, b) => ORD[a.top] - ORD[b.top] || a.eIdx - b.eIdx || a.c1 - b.c1);   // crises, PD, clinique, RAS ; puis électrode ; puis du plus profond (plot 1) vers l'extérieur
        const hasE = pairs.some(r => r.types.some(t => t.type === 'sz' || t.type === 'ad')), hasS = pairs.some(r => r.types.some(t => t.type === 'subj')), hasF = pairs.some(r => r.types.some(t => t.type === 'func'));
        const hemE = [...new Set(rows.filter(r => r.sz || r.ad).map(r => r.p.e.hemi))], hemS = [...new Set(rows.filter(r => r.clin && S.clinTypeOf(r) === 'subj').map(r => r.p.e.hemi))], hemF = [...new Set(rows.filter(r => r.clin && S.clinTypeOf(r) === 'func').map(r => r.p.e.hemi))];
        R.stims = { rows, pairs, respColors: Object.fromEntries(S.RESP_ORDER.map(k => [k, rgb(S.RESP[k].color)])), views: [],
          elecViews: hasE ? await this.seegShots({ stims: true, stimSet: 'elec' }, SHOT, 'stim_crises_PD', hemE) : [],
          subjViews: hasS ? await this.seegShots({ stims: true, stimSet: 'subj' }, SHOT, 'stim_subjectives', hemS) : [], funcViews: hasF ? await this.seegShots({ stims: true, stimSet: 'func' }, SHOT, 'stim_fonctionnelles', hemF) : [], ccepViews: this.ccepLinkCount ? await this.seegShots({ stims: true, stimSet: 'all', ccep: true }, SHOT, 'ccep', hemSt) : [], nCcep: this.ccepLinkCount || 0, legend: S.RESP_ORDER.map(k => ({ fr: S.RESP[k].fr, color: rgb(S.RESP[k].color) })) };
      }
      if (this.state.thermo.length) {
        const rows = this.state.thermo.filter(t => SV.Store.thermoStatusOf(t) !== 'rejected' || t.reason).map(t => { const p = pairRow(t); if (!p) return null; const st = this.stimsOf(p.e, t.c1, t.c2), lv = this.pairMaxLevel(p.e, t.c1, t.c2); const status = SV.Store.thermoStatusOf(t); return { key: p.key, struct: p.struct, e: p.e, c1: p.c1, status, statusFr: SV.Store.V.thermoStatus[status], statusColor: rgb(SV.Store.THERMO_COL[status]), validatedBy: t.validatedBy || '', date: status === 'done' ? t.date || '' : '', note: [t.reason ? 'contre-indication : ' + t.reason : '', t.note || ''].filter(Boolean).join(' · '), stims: st.length ? st.map(s => `${S.STIM_MODES[s.mode].fr} ${S.fmtA(s.mA)} : ${S.stimSummary(s)}`).join(' ; ') : 'non stimulée', level: lv }; }).filter(Boolean).sort((a, b) => ['done', 'validated', 'planned', 'skipped'].indexOf(a.status) - ['done', 'validated', 'planned', 'skipped'].indexOf(b.status) || this.elecs.indexOf(a.e) - this.elecs.indexOf(b.e) || a.c1 - b.c1);
        R.thermo = { rows, views: await this.seegShots({ thermo: true }, SHOT, 'thermocoagulations', [...new Set(rows.map(r => r.e.hemi))]) };
      }
      const groups = this.quantReportGroups ? this.quantReportGroups(null, this.state.quant) : [{ title: '', sets: this.state.quant }];   // intercritique, crises une à une, synthèse, autres
      for (const grp of groups) for (const q of grp.sets) {
        const keys = Object.keys(q.values || {}); if (!keys.length) continue;
        const rows = keys.map(k => { const p = S.parseLabel(k), e = p && this.elecByName(p.elec); return { key: k, value: q.values[k], struct: e ? S.pairStructures(e, p.c1, p.c2, this.atlas) : '', color: rgb(S.cmap(q.cmap, Math.max(0, Math.min(1, (q.values[k] - q.min) / ((q.max - q.min) || 1))))) }; }).sort((a, b) => b.value - a.value);
        const nFlat = q.net && q.net.kind === 'ictal' && this.quantNetFlat ? this.quantNetFlat(q.net).length : 0;
        R.quant.push({ id: q.id, name: q.name, group: grp.title, gkind: grp.kind, ieeg: q.ieeg || null, method: q.method || '', thr: this.quantThreshold ? this.quantThreshold(q) : null, pz: this.quantPZ ? this.quantPZ(q) : null, regions: q.regionTop || null, net: q.net ? (q.net.kind === 'ictal' ? `réseau h² de toute la crise « aplati » sur le temps : ${nFlat} liens qui reviennent dans au moins 10 % des fenêtres, additionnés (épaisseur ∝ nombre de fenêtres, couleur ∝ h² moyen)` : `réseau h² intercritique (${(q.net.edges || []).length} liens les plus forts, épaisseur et couleur ∝ h²)`) : '', unit: q.unit, min: q.min, max: q.max, cmapCss: S.cmapCss(q.cmap), mode: q.mode, source: q.source, rows, views: await this.seegShots({ quant: q.id }, SHOT, 'quant_' + q.name.replace(/\W+/g, '_'), [...new Set(keys.map(k => { const p = S.parseLabel(k), e = p && this.elecByName(p.elec); return e ? e.hemi : null; }).filter(Boolean))]) });
      }
      return R;
    },
  };
  Object.assign(SV.app, M);
})(window.SV = window.SV || {});
