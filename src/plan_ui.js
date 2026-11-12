/* EpiScope — plan_ui.js : vue « Planification » (schéma d'implantation).
 *   - liseré autour de la vue 3D : orange « Planification · cibles théoriques » (schéma, trajectoires prévues), bleu
 *     « Implantation réelle » (électrodes localisées sur le scanner post-implantation), hachuré en comparaison de schémas
 *     (calques d'un autre schéma affichés), les électrodes de chaque schéma dans sa couleur ;
 *   - poignées de toute électrode prévue (schéma sur le gabarit ou trajectoire chirurgicale importée) : la blanche (milieu)
 *     la déplace en entier dans le plan de la caméra, l'orange (pointe) et la bleue (entrée) bougent une extrémité, l'autre
 *     restant fixe ; l'électrode suit la poignée pendant le glisser ; les mêmes poignées sont dans les coupes (vues liées) ;
 *     les règles (entrée, croisement…) restent des avertissements ;
 *   - interface allégée : barre de la 3D réduite aux orientations, gabarit / patient, coupes IRM, PNG et « Affichage ▾ »
 *     (opacité, gonflement, éléments, disposition…) ; cortex en verre à 40 % sans le fond, sans cervelet ; coupes sur le
 *     T1 injecté, sinon le T1, sinon la FLAIR (un seul calque), boutons rapides T1 gado · T1 · FLAIR · FLAIR + TEP ;
 *   - la liste des électrodes garde sa position de défilement ; pas d'infobulle de la parcellation.            */
(function (SV) {
  'use strict';
  const $ = id => document.getElementById(id), M4 = SV.Mat4;
  const esc = SV.U.esc;
  const css = c => `rgb(${c.join(',')})`;
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const hasReal = s => !!(s && s.real && s.real.contacts && s.real.contacts.length);
  /** électrode affichée selon sa géométrie prévue (pas réelle) : schéma sur le gabarit, ou trajectoire chirurgicale */
  const canMove = (e, s) => !!e && !!s && !e.real && (!!s.target || !!(s.plan && s.plan.tip));
  const snap = s => JSON.parse(JSON.stringify({ target: s.target, exit: s.exit, yaw: s.yaw, pitch: s.pitch, targetIndex: s.targetIndex, auto: s.auto, plan: s.plan }));
  const restore = (s, b) => { for (const k of ['target', 'exit', 'yaw', 'pitch', 'targetIndex', 'auto', 'plan']) { if (b[k] === undefined) delete s[k]; else s[k] = JSON.parse(JSON.stringify(b[k])); } };
  const LSp = { get() { try { return JSON.parse(localStorage.getItem('sv_plan')) || {}; } catch (e) { return {}; } }, set(v) { try { localStorage.setItem('sv_plan', JSON.stringify(v)); } catch (e) { } } };
  const PLAN_DEF = { opacity: 0.4, frontGlass: true };

  const M = {
    /** état de la vue : 'plan' | 'real' | 'compare' (et légende) */
    planFrameState() {
      if (this.ui.screen !== 'work' || this.ui.wm !== 'plan' || !this.elecs || !this.elecs.length) return null;
      const LC = (SV.ImplantLayers && SV.ImplantLayers.COL) || { plan: [255, 160, 60], real: [76, 156, 255], compare: [190, 130, 255] };
      const ex = this.workspaceSeeg ? this.workspaceSeeg() : null, geom = this.mainGeom ? this.mainGeom() : 'plan';
      const real = !!ex && geom !== 'plan' && (ex.electrodes || []).some(hasReal);
      const sets = ex && this.implantLayerSets ? this.implantLayerSets(ex) : [];
      const main = { label: real ? 'implantation réelle' : 'cibles théoriques', color: real ? LC.real : LC.plan };
      return { kind: sets.length ? 'compare' : real ? 'real' : 'plan', main, sets };
    },
    planFrameSync() {
      const host = $('view3d'); if (!host) return; let fr = host.querySelector('.plan-frame');
      const st = this.planFrameState();
      if (!st) { if (fr) fr.remove(); host.classList.remove('pf-on'); if (this.viewer && this.viewer.setElectrodeTint) this.viewer.setElectrodeTint(null); return; }
      if (!fr) { fr = document.createElement('div'); fr.className = 'plan-frame'; host.appendChild(fr); }
      fr.className = 'plan-frame pf-' + st.kind; host.classList.add('pf-on');
      const lbl = st.kind === 'plan' ? 'Planification · cibles théoriques' : st.kind === 'real' ? 'Implantation réelle · scanner post-implantation' : 'Comparaison de schémas';
      fr.innerHTML = `<div class="pf-lbl">${esc(lbl)}${st.kind === 'compare' ? ` <span class="pf-keys"><span><i style="background:${css(st.main.color)}"></i>${esc(st.main.label)}</span>${st.sets.map(G => `<span><i style="background:${css(G.color)}"></i>${esc(G.label)}</span>`).join('')}</span>` : ''}</div>`;
      if (this.viewer && this.viewer.setElectrodeTint) this.viewer.setElectrodeTint(st.kind === 'compare' ? st.main.color : null);
    },

    // ---------------------------------------------------------------- poignées (3D et coupes)
    planSelected() {
      const on = this.ui.screen === 'work' && this.ui.wm === 'plan' && this.ui.selElec && !this.ui.addElec;
      const e = on ? (this.elecs || []).find(x => x.id === this.ui.selElec) : null, spec = e && (this.state.electrodes || []).find(s => s.id === e.id);
      return canMove(e, spec) ? { e, spec } : null;
    },
    /** poignées de l'électrode choisie dans la 3D et dans les coupes */
    planHandlesSync() {
      const V3 = this.viewer; if (!V3 || !V3.setHandles) return;
      const S0 = this.planSelected(); V3.setHandles(S0 ? { eid: S0.e.id, tip: S0.e.tip, entry: S0.e.entry } : null);
      this.planSliceHandles();
    },
    viewToWorld(p) { const A = this.patientAnat; if (!A || !p) return null; return M4.apply(this.anatMode === 'patient' ? A.fromDisplay : A.fromTemplate, p[0], p[1], p[2]); },
    /** applique un glisser de poignée à la spécification (depuis son état au début du glisser) ; now / before : espace de la vue */
    planApplyHandle(spec, kind, now, before) {
      if (spec.plan && spec.plan.tip) {   // trajectoire chirurgicale : monde du T1
        const W = p => this.viewToWorld(p), P = spec.plan; if (!this.patientAnat) return;
        if (kind === 'move') { const d = sub(W(now.tip), W(before.tip)); P.tip = add(P.tip, d); P.entry = add(P.entry, d); }
        else if (kind === 'tip') P.tip = W(now.tip); else P.entry = W(now.entry);
        P.tip = P.tip.map(v => Math.round(v * 100) / 100); P.entry = P.entry.map(v => Math.round(v * 100) / 100); P.edited = true;
        return;
      }
      const T = p => this.viewToTemplate ? this.viewToTemplate(p) : p, tip0 = T(before.tip), tip1 = T(now.tip), ent0 = T(before.entry), ent1 = T(now.entry);
      if (kind === 'move') { const d = sub(tip1, tip0); spec.target = add(spec.target, d); if (spec.exit) spec.exit = add(spec.exit, d); }
      else if (kind === 'tip') { spec.target = tip1; spec.exit = ent0; spec.yaw = 0; spec.pitch = 0; }
      else { spec.exit = ent1; spec.yaw = 0; spec.pitch = 0; }   // l'entrée bouge, la pointe (cible) reste
      const tl = this.vol && this.vol.labelAt(spec.target[0], spec.target[1], spec.target[2]); if (tl >= 1 && tl <= 162) spec.targetIndex = tl;
    },
    planBuild(spec) { try { return this.buildElectrodeFor(spec, undefined, hasReal(spec) ? 'plan' : undefined); } catch (e) { return null; } },
    /** pendant le glisser : la spécification suit, l'électrode est redessinée seule (3D), les coupes suivent */
    planHandleDrag(eid, kind, now, before, src) {
      const spec = (this.state.electrodes || []).find(s => s.id === eid), e = (this.elecs || []).find(x => x.id === eid); if (!spec || (!this._hd && !canMove(e, spec))) return;
      if (!this._hd || this._hd.eid !== eid) this._hd = { eid, backup: snap(spec), last: null };
      restore(spec, this._hd.backup); this.planApplyHandle(spec, kind, now, before);
      const e2 = this.planBuild(spec);
      if (!e2) { restore(spec, this._hd.last || this._hd.backup); return; }   // hors du cerveau : on garde la dernière position valide
      this._hd.last = snap(spec); e2.id = eid;
      const V3 = this.viewer; if (V3 && V3.previewElectrode) V3.previewElectrode(e2);
      if (src === 'slices' && V3 && V3.setHandles) V3.setHandles({ eid, tip: e2.tip, entry: e2.entry });
      if (src !== 'slices') { clearTimeout(this._hdSl); this._hdSl = setTimeout(() => this.planRefreshSlices(), 50); }
    },
    planRefreshSlices() { const st = this.slvState ? this.slvState() : {}; if (!this.slices) return; if (st.elec && this.electrodeCheckMarkers) this.electrodeCheckMarkers(); else if (this.sliceMarkers) this.sliceMarkers(); },
    /** fin d'un glisser de poignée (3D ou coupes) : la spécification est fixée, le schéma reconstruit */
    planOnHandle(eid, kind, now, before) {
      const spec = (this.state.electrodes || []).find(s => s.id === eid); if (!spec) { this._hd = null; return; }
      const bk = this._hd && this._hd.eid === eid ? this._hd.backup : snap(spec); this._hd = null;
      restore(spec, bk); this.planApplyHandle(spec, kind, now, before); spec.auto = false;
      this.ui.selElec = eid; this.rebuildElectrodes();
      const e = (this.elecs || []).find(x => x.id === eid);
      if (!e) { restore(spec, bk); this.ui.selElec = eid; this.rebuildElectrodes(); this.toast('Trajectoire impossible à cet endroit (pointe hors du cerveau) : électrode laissée en place', 4000); return; }
      this.toast(`${e.name} ${kind === 'move' ? 'déplacée' : kind === 'tip' ? ': pointe déplacée (entrée fixe)' : ': entrée déplacée (pointe fixe)'} — ${e.nContacts} plots, ${e.length.toFixed(0)} mm${hasReal(spec) ? ' · position prévue (les plots réels ne changent pas)' : ''}${(e.issues || []).some(i => i.sev >= 2) ? ' · ⚠ ' + e.issues.filter(i => i.sev >= 2).map(i => i.text).join(' ; ') : ''}`, 4000);
      const st = this.slvState ? this.slvState() : null; if (st && st.elec && st.elec.slice(2) === eid && this.checkElectrode) this.checkElectrode(st.elec, true);   // coupes réalignées sur la nouvelle trajectoire
    },
    /** poignées dans les coupes (monde du T1) : pointe orange, entrée bleue, milieu blanc ; glisser = même action que dans la 3D */
    planSliceHandles() {
      const S3 = this.slices; if (!S3) return; const S0 = this.planSelected();
      const had = S3.markers.some(m => m.handle); if (had) S3.markers = S3.markers.filter(m => !m.handle);
      if (!S0 || !this.viewToSlv(S0.e.tip)) { if (S3._planEdit) { S3._planEdit = false; S3.editMarkers = false; S3.onMarkerEdit = null; S3.editAdd = true; } if (had) S3.draw(); return; }
      const tip = this.viewToSlv(S0.e.tip), entry = this.viewToSlv(S0.e.entry); if (!tip || !entry) return;
      const H = (p, handle, color, label, hline) => ({ p, r: handle === 'move' ? 2.3 : 2, color, solid: true, always: true, edit: 'h', handle, hline, live: true, label, showLabel: !!label, eid: S0.e.id });
      S3.markers.push(H(tip, 'tip', '#ffa94d', S0.e.name + ' pointe', 'tip'), H(entry, 'entry', '#4cc9f0', 'entrée', 'entry'), H(mid(tip, entry), 'move', '#ffffff', ''));
      S3._planEdit = true; S3.editMarkers = true; S3.editAdd = false; S3.onMarkerEdit = (k, m, p) => this.planSliceHandle(k, m, p);
      S3.draw();
    },
    planSliceHandle(kind, m, p) {
      if (!m || !m.handle) return; const S0 = this.planSelected(); if (!S0 || S0.e.id !== m.eid) return;
      if (kind === 'select' || kind === 'delete') { if (kind === 'select' && this.slices) this.slices.setCursor(m.p); return; }
      const V = q => this.slvToView(q), e = S0.e;
      if (!this._shB || this._shB.eid !== e.id) this._shB = { eid: e.id, before: { tip: e.tip.slice(), entry: e.entry.slice() } };
      const b = this._shB.before, pv = V(p), now = m.handle === 'tip' ? { tip: pv, entry: b.entry } : m.handle === 'entry' ? { tip: b.tip, entry: pv } : (() => { const d = sub(pv, mid(b.tip, b.entry)); return { tip: add(b.tip, d), entry: add(b.entry, d) }; })();
      if (kind === 'drag') { this.planHandleDrag(e.id, m.handle, now, b, 'slices'); return; }
      this._shB = null; this.planOnHandle(e.id, m.handle, now, b);
    },

    // ---------------------------------------------------------------- interface allégée
    planSettings() { return Object.assign({}, PLAN_DEF, LSp.get()); },
    /** entrée en planification : réglages des vues (gardés), sans cervelet ; sortie : réglages précédents rétablis */
    planViewEnter() {
      const V3 = this.viewer; if (!V3) return; const P = this.planSettings();
      this._planPrev = V3.cells.map(c => ({ opacity: c.cfg.opacity, frontGlass: c.cfg.frontGlass, subFilter: c.cfg.subFilter }));
      for (let i = 0; i < V3.cells.length; i++) V3.setCellConfig(i, { subFilter: 'noCb', opacity: P.opacity, frontGlass: P.frontGlass }, true);
      const dock = $('sliceDock'); if (dock) { let w = null; try { w = localStorage.getItem('episcope.dockW.plan'); } catch (e) { } dock.style.width = w || '48%'; V3.resize && V3.resize(); }
    },
    planViewLeave() {
      const V3 = this.viewer, P = this._planPrev; this._planPrev = null;
      if (V3 && P) for (let i = 0; i < V3.cells.length; i++) if (P[i]) V3.setCellConfig(i, { subFilter: P[i].subFilter === 'noCb' ? 'all' : P[i].subFilter || 'all', opacity: P[i].opacity, frontGlass: P[i].frontGlass }, true);
      const dock = $('sliceDock'); if (dock) { let w = null; try { w = localStorage.getItem('episcope.dockW'); } catch (e) { } dock.style.width = w || ''; V3 && V3.resize && V3.resize(); }
    },
    planBarSync() {
      const on = this.ui.screen === 'work' && this.ui.wm === 'plan' && !(this.v2On && this.v2On());
      document.body.classList.toggle('cplan', on);
      const row = document.querySelector('.viewbar .vrow'); if (!row) return;
      if (!$('btnPlanOpts')) { const b = document.createElement('button'); b.id = 'btnPlanOpts'; b.className = 'plan-only'; b.title = 'affichage de la vue 3D : opacité, gonflement, éléments affichés, disposition, réglages complets'; b.textContent = 'Affichage ▾'; row.appendChild(b); b.onclick = e => this.planMenu(e.currentTarget); }
    },
    /** menu « Affichage » de la planification : les réglages de la deuxième rangée et de la disposition, à la demande */
    /** v5.5 — panneau « Affichage » unique (barre de la 3D, roue d'une vue, planification) : cortex, éléments, imagerie, vues.
     *  Remplace l'ancien menu court + « Réglages complets… » (répétitions, menus en gigogne). cellIndex : vue visée (roue). */
    planMenu(anchor, cellIndex) {
      const V3 = this.viewer; if (!V3) return; if (cellIndex != null && cellIndex !== V3.active) V3.setActive(cellIndex);
      const ci = V3.active || 0, c = V3.cells[ci].cfg, pct = x => Math.round((x == null ? 1 : x) * 100), panel = document.createElement('div'); panel.className = 'cell-panel v2-menu plan-menu disp-menu';
      const chk = (k, l, t) => `<label class="chip"${t ? ` title="${esc(t)}"` : ''}><input type="checkbox" data-pk="${k}"${c[k] ? ' checked' : ''}> ${l}</label>`, seg = (k, opts) => `<div class="seg">${opts.map(([v, l]) => `<button data-sk="${k}" data-v="${v}" class="${(c[k] || 'both') === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
      const lay = $('layoutSel'), inPlan = this.ui.wm === 'plan', tools = document.body.classList.contains('wm-tools'), net = !inPlan && !tools, multi = V3.cells.length > 1, linked = !!($('chkLink') && $('chkLink').checked), seeg = !!(this.state && (this.state.electrodes || []).length);
      panel.innerHTML = `<div class="ctx-head">Affichage${multi && !linked ? ` · vue ${ci + 1}` : ''}${inPlan ? ' · planification' : ''}</div>
        <div class="v2-sec"><div class="row"><span>Hémisphères</span>${seg('hemi', [['both', 'les deux'], ['L', 'gauche'], ['R', 'droit']])}</div>
          <div class="row"><span>Opacité du cortex</span><input type="range" data-r="opac" min="5" max="100" step="5" value="${pct(c.opacity)}"><b class="op-v">${pct(c.opacity)} %</b></div>
          <div class="row"><span>Gonflement</span><input type="range" data-r="infl" min="0" max="100" step="5" value="${pct(c.inflate || 0)}"></div>
          <div class="chips">${chk('frontGlass', 'transparence : surface avant seule', 'Cortex transparent : seule la surface la plus proche est dessinée — les sillons et la face opposée ne s’y superposent pas (plus lisible ; sans effet à 100 %)')}${chk('borders', 'limites des régions')}</div></div>
        <div class="v2-sec"><div class="chips">${chk('sub', 'structures profondes')}<button class="mini-btn" data-a="sub" title="opacité, côté, cervelet, sélection de structures">réglages ▾</button></div>
          ${seeg || inPlan ? `<div class="row"><span>Électrodes</span>${seg('elecHemi', [['both', 'toutes'], ['L', 'gauches'], ['R', 'droites']])}<label class="chip"><input type="checkbox" data-pk="electrodes"${c.electrodes ? ' checked' : ''}> afficher</label><label class="chip"><input type="checkbox" data-pk="labels"${c.labels ? ' checked' : ''}> noms</label></div>` : ''}
          ${net ? `<div class="row" title="réseau de l’hypothèse (phase 1) ou de la crise"><span>Réseau</span><div class="chips">${chk('fibers', 'trajets')}${chk('nodes', 'nœuds')}${chk('sync', 'liens')}${chk('netLabels', 'noms')}${chk('hubLabels', 'hubs ◆', 'étiquettes des régions centrales (hubs) du réseau')}</div></div>` : ''}
          <div class="row" title="coupes IRM dans la vue 3D : T1 MNI sur le gabarit, IRM du patient sur son anatomie"><span>Coupes IRM</span><label class="chip"><input type="checkbox" data-pk="slices3d"${c.slices3d ? ' checked' : ''}> dans la 3D</label>${c.slices3d ? `<div class="seg">${[['', 'cerveau entier'], ['axial', 'coupé ax.'], ['coronal', 'cor.'], ['sagittal', 'sag.']].map(([v, l]) => `<button data-sk="clip" data-v="${v}" class="${(c.clip || '') === v ? 'on' : ''}">${l}</button>`).join('')}</div><button class="mini-btn" data-a="wl" title="contraste et luminosité des coupes de la 3D">◐</button>` : ''}</div></div>
        ${this.dispExtraHtml ? this.dispExtraHtml(ci) : ''}
        <div class="v2-sec"><div class="row"><span>Disposition</span><select data-a="layout">${lay ? [...lay.options].map(o => `<option value="${o.value}"${o.value === lay.value ? ' selected' : ''}>${esc(o.textContent)}</option>`).join('') : ''}</select>${multi ? `<label class="chip" title="réglages d’affichage et réseaux d’hypothèses appliqués à toutes les vues"><input type="checkbox" data-a="link"${linked ? ' checked' : ''}> vues liées</label>${!linked ? '<button class="mini-btn" data-a="toall" title="copier les réglages de cette vue vers toutes les vues">→ toutes</button>' : ''}` : ''}</div></div>
        ${inPlan ? '<div class="btnrow"><button data-a="reset" title="opacité 40 %, surface avant seule, sans cervelet">Réglages par défaut</button></div>' : ''}`;
      const keep = () => { if (!inPlan) return; const cc = V3.cells[ci].cfg; LSp.set({ opacity: cc.opacity, frontGlass: !!cc.frontGlass }); };
      const all = cfg => { if (inPlan || linked) { for (let i = 0; i < V3.cells.length; i++) V3.setCellConfig(i, cfg, true); } else V3.setCellConfig(ci, cfg, true); if ((cfg.slices3d !== undefined || cfg.clip !== undefined) && this.updateSlices3d) this.updateSlices3d(true); };
      const reopen = () => { const keepPos = this._menu && this._menu.getBoundingClientRect(); this.closeMenu(); this.planMenu(anchor); if (keepPos && this._menu) { this._menu.style.left = keepPos.left + 'px'; this._menu.style.top = keepPos.top + 'px'; } };
      const op = panel.querySelector('[data-r=opac]'); op.oninput = () => { all({ opacity: +op.value / 100 }); op.nextElementSibling.textContent = op.value + ' %'; const o = $('opacRange'); if (o) o.value = op.value; keep(); };
      const inf = panel.querySelector('[data-r=infl]'); inf.oninput = () => { const o = $('inflRange'); if (o) { o.value = inf.value; o.dispatchEvent(new Event('input', { bubbles: true })); } else all({ inflate: +inf.value / 100 }); };
      panel.querySelectorAll('[data-pk]').forEach(x => x.onchange = () => { all({ [x.dataset.pk]: x.checked }); const o = x.dataset.pk === 'frontGlass' ? $('chkFrontGlass') : document.querySelector(`#dispChips input[data-k="${x.dataset.pk}"]`); if (o) o.checked = x.checked; keep(); if (x.dataset.pk === 'slices3d') reopen(); });
      panel.querySelectorAll('[data-sk]').forEach(b => b.onclick = () => { all({ [b.dataset.sk]: b.dataset.v }); panel.querySelectorAll(`[data-sk="${b.dataset.sk}"]`).forEach(x => x.classList.toggle('on', x === b)); });
      panel.querySelector('[data-a=sub]').onclick = e => { const r = e.currentTarget.getBoundingClientRect(); this.closeMenu(); this.subMenu({ getBoundingClientRect: () => r }, ci); };
      panel.querySelector('[data-a=layout]').onchange = e => { this.closeMenu(); if (lay) { lay.value = e.target.value; lay.dispatchEvent(new Event('change', { bubbles: true })); } };
      const lk = panel.querySelector('[data-a=link]'); if (lk) lk.onchange = () => { const o = $('chkLink'); if (o) { o.checked = lk.checked; o.dispatchEvent(new Event('change', { bubbles: true })); } reopen(); };
      const wl = panel.querySelector('[data-a=wl]'); if (wl) wl.onclick = () => { this.closeMenu(); const b = $('btn3dWL'); if (b) b.click(); };
      const ta = panel.querySelector('[data-a=toall]'); if (ta) ta.onclick = () => { this.closeMenu(); V3.applyActiveToAll(); this.toast('Réglages d’affichage copiés à toutes les vues', 2000); };
      if (panel.querySelector('[data-a=reset]')) panel.querySelector('[data-a=reset]').onclick = () => { LSp.set({}); all({ opacity: PLAN_DEF.opacity, frontGlass: PLAN_DEF.frontGlass, subFilter: 'noCb' }); this.closeMenu(); this.toast('Planification : réglages d’affichage par défaut', 2000); };
      if (this.dispExtraBind) this.dispExtraBind(panel, ci);   // sections ajoutées par d'autres modules (imagerie de source)
      const rr = anchor.getBoundingClientRect(); this.popupMenu([{ node: panel }], rr.right - 420, rr.bottom + 4);
    },
  };
  Object.assign(SV.app, M);

  // ---------------------------------------------------------------- greffes
  // planification : ni stimulations, ni thermocoagulations, ni analyses quantifiées dans la 3D (résultats d'une SEEG faite)
  { const rm0 = SV.app.refreshMarkers; SV.app.refreshMarkers = function () { if (this.ui.wm === 'plan' && this.viewer) { this.viewer.setMarkers([]); if (this.viewer.setMarkerLinks) this.viewer.setMarkerLinks([]); if (this.viewer.setContactHighlight) this.viewer.setContactHighlight([]); this.ccepLinkCount = 0; if (this.updateQuantLegend) this.updateQuantLegend(); return; } return rm0.apply(this, arguments); }; }
  const A = SV.app, rb0 = A.rebuildElectrodes, re0 = A.renderElectrodes, se0 = A.selectElectrode, sam0 = A.setAddMode, ig0 = A.implantGhostsUpdate, aep0 = A.addElectrodeAtPoint, sm0 = A.sliceMarkers, ecm0 = A.electrodeCheckMarkers;
  const sync = app => { app.planFrameSync(); app.planHandlesSync(); app.planBarSync(); };
  A.rebuildElectrodes = function () { const r = rb0.apply(this, arguments); sync(this); return r; };
  if (se0) A.selectElectrode = function () { const r = se0.apply(this, arguments); this.planHandlesSync(); return r; };
  if (sam0) A.setAddMode = function () { const r = sam0.apply(this, arguments); this.planHandlesSync(); return r; };
  if (ig0) A.implantGhostsUpdate = function () { const r = ig0.apply(this, arguments); this.planFrameSync(); return r; };
  if (sm0) A.sliceMarkers = function () { const r = sm0.apply(this, arguments); if (this.ui.screen === 'work' && this.ui.wm === 'plan') this.planSliceHandles(); return r; };
  if (ecm0) A.electrodeCheckMarkers = function () { const r = ecm0.apply(this, arguments); if (this.ui.screen === 'work' && this.ui.wm === 'plan') this.planSliceHandles(); return r; };
  SV.Bus.on('workmode:after', function (mode, prev) {
    if (this.viewer && prev !== mode) { if (mode === 'plan') this.planViewEnter(); else if (prev === 'plan') this.planViewLeave(); if ((mode === 'plan' || prev === 'plan') && this.refreshMarkers) this.refreshMarkers(); }
    sync(this);
  }, 'plan_ui');
  // la liste des électrodes garde sa position de défilement (réglages +2 / −2, longueur…)
  A.renderElectrodes = function () {
    const box = $('tab-electrodes'), scs = []; for (let el = box; el && el !== document.body; el = el.parentElement) if (el.scrollTop) scs.push([el, el.scrollTop]);
    const r = re0.apply(this, arguments); for (const [el, t] of scs) el.scrollTop = t; return r;
  };
  // électrode posée au clic : plus souple — point de surface ramené dans le cerveau, cible voisine si la trajectoire échoue
  if (aep0) A.addElectrodeAtPoint = function (P, region) {
    if (!this.vol || !P) return aep0.apply(this, arguments);
    const Pt = this.viewToTemplate ? this.viewToTemplate(P) : P, hemi = region ? this.atlas.hemiOf[region] : (Pt[0] < 0 ? 'L' : 'R'), lat = hemi === 'L' ? -1 : 1, V = this.vol;
    let Q = null; for (let s = 0; s <= 8 && !Q; s += 0.5) { const q = [Pt[0] - lat * s, Pt[1], Pt[2]]; if (V.labelAt(q[0], q[1], q[2]) > 0) Q = q; }
    if (!Q) for (let r = 1; r <= 5 && !Q; r++) for (const d of [[0, r, 0], [0, -r, 0], [0, 0, r], [0, 0, -r], [r, 0, 0], [-r, 0, 0]]) { const q = [Pt[0] + d[0], Pt[1] + d[1], Pt[2] + d[2]]; if (V.labelAt(q[0], q[1], q[2]) > 0) { Q = q; break; } }
    if (!Q) return aep0.apply(this, arguments);
    const n0 = (this.state.electrodes || []).length, toast0 = this.toast;
    let failed = false; this.toast = function (msg) { if (/impossible/.test(msg)) { failed = true; return; } return toast0.apply(this, arguments); };
    const back = this.anatMode === 'patient' && this.patientAnat ? SV.Mat4.apply(this.patientAnat.dispFromTemplate, Q[0], Q[1], Q[2]) : Q;
    try { aep0.call(this, back, region); } finally { this.toast = toast0; }
    if (failed && (this.state.electrodes || []).length === n0) this.toast('Pas de trajectoire orthogonale depuis ce point : cliquez un peu plus loin, ou ajoutez l’électrode par la bibliothèque puis déplacez-la (poignées)', 5000);
  };
  // pas d'infobulle de la parcellation en planification
  const op0 = A.onPick;
  A.onPick = function (r, kind, e) {
    if (kind === 'hover' && this.ui.wm === 'plan') { const lp = this.viewer && this.viewer.lastPick; if (!lp || (lp.kind !== 'contact' && lp.kind !== 'electrode' && lp.kind !== 'marker')) { const tip = $('tip'); if (tip) tip.hidden = true; return; } }
    return op0.apply(this, arguments);
  };
  // poignées : branchées sur la vue 3D quand elle est prête (fin du glisser, et suivi pendant le glisser)
  const bindHandles = () => { const V3 = A.viewer; if (!V3) return; if (!V3.onHandle) V3.onHandle = (eid, kind, now, before) => A.planOnHandle(eid, kind, now, before); if (!V3.onHandleDrag) V3.onHandleDrag = (eid, kind, now, before) => A.planHandleDrag(eid, kind, now, before, '3d'); };
  const tm = setInterval(() => { if (A.viewer) { bindHandles(); clearInterval(tm); } }, 300);
})(window.SV = window.SV || {});
