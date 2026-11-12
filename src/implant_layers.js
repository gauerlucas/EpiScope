/* EpiScope — implant_layers.js : projet d'implantation, implantation réelle, calques comparables.
 *   Une SEEG a une implantation de référence : le projet (trajectoires prévues : schéma, planification chirurgicale)
 *   tant que l'implantation réelle n'est pas adoptée, puis l'implantation réelle (électrodes localisées sur le scanner
 *   post-implantation, vérifiées une à une). À l'adoption, le projet est figé (ex.implantPlan) et seules les électrodes
 *   localisées restent dans l'exploration : on ne mélange jamais électrodes théoriques et réelles. Retour au projet possible.
 *   Calques (couleur propre, vus à travers le cortex, sans sélection) : implantation réelle avant l'adoption, projet après,
 *   et l'implantation d'une autre SEEG du patient (implantations successives).                                       */
(function (SV) {
  'use strict';
  const $ = id => document.getElementById(id), S = SV.Store, M4 = SV.Mat4;
  const esc = SV.U.esc;
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const fmtDate = s => { if (!s) return ''; const d = new Date(String(s).length <= 10 ? s + 'T12:00:00' : s); return isNaN(d) ? String(s) : d.toLocaleDateString(SV.LOC); };
  /** couleurs des calques : projet (orange), implantation réelle (bleu), autre SEEG (violet) */
  const COL = { plan: [255, 160, 60], real: [76, 156, 255], compare: [190, 130, 255] };   // orange : cibles théoriques ; bleu : implantation réelle ; violet : autre SEEG
  /** couleurs des calques ajoutés (autres projets, autres explorations), dans l'ordre où ils ont été cochés */
  const LCOL = [[190, 130, 255], [60, 210, 190], [255, 110, 170], [200, 220, 80]];
  const css = c => `rgb(${c.join(',')})`;
  const hasReal = s => !!(s.real && s.real.contacts && s.real.contacts.length), hasPlan = s => !!(s.target || (s.plan && s.plan.tip));

  const M = {
    /** exploration SEEG de l'espace de travail */
    workspaceSeeg() { const d = this.dossier, ex = d && this.ctx && S.byId(d.explorations, this.ctx.explorationId); return ex && ex.kind === 'seeg' ? ex : null; },
    /** géométrie des électrodes principales de l'espace de travail : le projet tant que la réelle n'est pas adoptée */
    mainGeom() { const ex = this.workspaceSeeg(), specs = ex && (this.state && this.state.electrodes && this.state.electrodes.length ? this.state.electrodes : ex.electrodes); return ex && !(ex.implant && ex.implant.adopted) && (specs || []).some(hasPlan) ? 'plan' : null; },   // sans projet, l'implantation réelle fait foi d'emblée
    /** calques à afficher en plus des électrodes principales : [{ key, label, color, specs, geom }] */
    implantLayerSets(ex) {
      ex = ex || this.workspaceSeeg(); if (!ex) return []; const I = ex.implant || {}, out = [], d = this.dossier;
      if (!I.adopted && I.showReal !== false && ex.electrodes.some(hasPlan)) { const R = ex.electrodes.filter(hasReal); if (R.length) out.push({ key: 'real', label: 'implantation réelle (scanner)', color: COL.real, specs: R, geom: 'real' }); }
      if (I.adopted && I.showPlan && ex.implantPlan) out.push({ key: 'plan', label: 'projet d’implantation', color: COL.plan, specs: ex.implantPlan.electrodes, geom: 'plan' });
      // v4.7 : calques choisis — autres projets de cette SEEG ('pj:'), autres explorations du patient ('ex:', implantation réelle sinon projet)
      this.implantLayerKeys(ex).forEach((k, i) => {
        const color = LCOL[i % LCOL.length];
        if (k.startsWith('pj:')) { if (I.adopted) return; const pid = k.slice(3); if (ex.project && ex.project.id === pid) return; const p = (ex.projects || []).find(x => x.id === pid); if (p) out.push({ key: 'L' + i, label: p.name, tag: p.name, color, specs: (p.electrodes || []).filter(hasPlan), geom: 'plan', labels: true }); }
        else if (k.startsWith('ex:')) { const cx = S.byId(d.explorations, k.slice(3)); if (!cx || cx === ex) return; const real = (cx.implant && cx.implant.adopted) || cx.electrodes.some(hasReal); out.push({ key: 'L' + i, label: cx.label + (real ? ' (réelle)' : cx.kind === 'seeg' ? ' (projet)' : ' (schéma proposé)'), tag: cx.label, color, specs: real ? cx.electrodes.filter(hasReal) : cx.electrodes.filter(hasPlan), geom: real ? 'real' : 'plan', labels: true }); }
      });
      return out;
    },
    /** calques choisis d'une exploration (ex.implant.layers ; ancien ex.implant.compare repris) */
    implantLayerKeys(ex) { const I = (ex && ex.implant) || {}; return Array.isArray(I.layers) ? I.layers : I.compare ? ['ex:' + I.compare] : []; },
    implantLayerColor(ex, key) { const i = this.implantLayerKeys(ex).indexOf(key); return i < 0 ? null : LCOL[i % LCOL.length]; },
    /** calques dans la vue 3D */
    implantGhostsUpdate() {
      if (!this.viewer || !this.viewer.setGhostElectrodes) return;
      const sets = this.vol ? this.implantLayerSets() : [];
      this.viewer.setGhostElectrodes(sets.map(G => ({ key: G.key, color: G.color, labels: !!G.labels, tag: G.tag || '', list: G.specs.map(s => { try { return this.buildElectrodeFor(s, undefined, G.geom); } catch (e) { return null; } }).filter(Boolean) })));
    },
    /** une spécification dans l'espace des coupes (monde du T1, ou gabarit MNI) selon la géométrie demandée */
    specWorld(spec, geom) {
      if (geom !== 'plan' && hasReal(spec)) return this.elecToSlv({ name: spec.name, pts: spec.real.contacts, tip: spec.real.tip || spec.real.contacts[0], entry: spec.real.entry || spec.real.contacts[spec.real.contacts.length - 1] }, 'w');
      if (geom === 'real') return null;
      if (spec.plan && spec.plan.tip) { const P = spec.plan, L = Math.hypot(P.entry[0] - P.tip[0], P.entry[1] - P.tip[1], P.entry[2] - P.tip[2]) || 1, dir = [0, 1, 2].map(i => (P.entry[i] - P.tip[i]) / L); return this.elecToSlv({ name: spec.name, pts: SV.CTElec.contacts(P.tip, dir, P.n || 12), tip: P.tip, entry: P.entry }, 'w'); }
      if (spec.target && this.vol) { const e = SV.Electrodes.build(spec, this.atlas, this.vol); if (e) return this.elecToSlv({ name: spec.name, pts: e.contacts.map(c => c.xyz), tip: e.tip, entry: e.entry }, 't'); }
      return null;
    },
    /** coupes (hors localisation) : électrodes principales + calques, chacun dans sa couleur */
    implantSliceMarkers() {
      const ex = this.workspaceSeeg(), S3 = this.slices; if (!ex || !S3) return false;
      const specs = this.state && this.state.electrodes && this.state.electrodes.length ? this.state.electrodes : ex.electrodes, geom = this.mainGeom() || 'auto';
      const main = { color: geom === 'plan' ? COL.plan : COL.real, list: specs.map(s => { const g = geom === 'plan' ? 'plan' : hasReal(s) ? 'real' : 'plan', w = this.specWorld(s, g); if (w && g === 'plan' && geom !== 'plan') w.color = COL.plan; return w; }).filter(Boolean).filter(w => !this.sliceElecFilter || this.sliceElecFilter(w)), main: true };   // électrode encore prévue dans une implantation réelle : orange
      const sets = [main].concat(this.implantLayerSets(ex).map(G => ({ color: G.color, tag: G.labels ? G.tag : '', list: G.specs.map(s => this.specWorld(s, G.geom)).filter(Boolean) })));
      const marks = [], shafts = [];
      for (const G of sets) { for (const e of G.list) { const c = (e.color || G.color).join(','); shafts.push({ a: e.tip, b: e.entry, color: `rgba(${c},${G.main ? 0.55 : 0.4})`, dash: !G.main }); e.pts.forEach((p, k) => marks.push({ p, r: G.main ? 1.1 : 0.9, color: `rgba(${c},${G.main ? 0.9 : 0.7})`, label: G.main ? e.name + (k + 1) : G.tag && k === e.pts.length - 1 ? e.name + ' · ' + G.tag : '', showLabel: (G.main && k === 0) || (!!G.tag && k === e.pts.length - 1) })); } }
      S3.setMarkers(marks); S3.setShafts(shafts); return true;
    },
    /** adoption de l'implantation réelle (avec confirmation) ; l'espace de travail suit si c'est la même exploration */
    implantAdopt(ex) {
      const st = S.implantState(ex); if (!st.nReal) { this.toast('Aucune électrode localisée sur le scanner : Localisation › Reconstruction, puis « Valider »', 5000); return false; }
      const same = this.ctx && this.ctx.explorationId === ex.id; if (same && this.persistWorkspace) this.persistWorkspace();
      const msg = [`Adopter l’implantation réelle de ${ex.label} : ${st.nReal} électrode${st.nReal > 1 ? 's' : ''} localisée${st.nReal > 1 ? 's' : ''} (${st.nChecked} vérifiée${st.nChecked > 1 ? 's' : ''}) ?`];
      if (st.planOnly.length) msg.push(`Électrodes du projet non retrouvées sur le scanner, retirées de l’implantation : ${st.planOnly.map(e => e.name).join(', ')}.`);
      msg.push('Le projet d’implantation est conservé (calque « projet », retour possible).');
      if (!confirm(msg.join('\n\n'))) return false;
      S.adoptRealImplant(this.dossier, ex, S.user); this.touch('exploration', ex.id, 'implantation réelle adoptée'); this.implantSyncWorkspace(ex);
      this.toast(`Implantation réelle adoptée pour ${ex.label}`, 3500); return true;
    },
    implantRevert(ex) {
      if (!confirm(`Revenir au projet d’implantation pour ${ex.label} ? Les électrodes localisées sont conservées (calque « implantation réelle »).`)) return false;
      const same = this.ctx && this.ctx.explorationId === ex.id; if (same && this.persistWorkspace) this.persistWorkspace();
      S.revertToPlan(this.dossier, ex); this.touch('exploration', ex.id, 'retour au projet'); this.implantSyncWorkspace(ex); return true;
    },
    implantSyncWorkspace(ex) {
      if (this.ctx && this.ctx.explorationId === ex.id && this.state) { const st = S.toWorkspace(this.dossier, this.ctx); this.state.electrodes = st.electrodes; }
      if (this.rebuildElectrodes) this.rebuildElectrodes(); else this.implantGhostsUpdate();
      if (this.sliceMarkers) this.sliceMarkers();
      if (this.ui.screen === 'loc' && this.refreshImagingScreen) this.refreshImagingScreen();
    },
    /** choix de l'implantation de référence et calques (Localisation › 5, onglet Électrodes) */
    implantPanel(ex, compact) {
      const st = S.implantState(ex), I = ex.implant || (ex.implant = {}), d = this.dossier, others = d.explorations.filter(x => x.kind === 'seeg' && x !== ex && (x.electrodes.length || x.implantPlan));
      const el = h('div', 'impl-ref' + (compact ? ' compact' : ''));
      if (!st.adopted && !st.nPlan) {   // pas de projet : rien à choisir
        el.innerHTML = `<div class="ir-opt on"><i class="sw" style="background:${css(COL.real)}"></i><div><b>Implantation réelle</b><div class="muted small">${st.nReal ? `${st.nReal} électrode${st.nReal > 1 ? 's' : ''} localisée${st.nReal > 1 ? 's' : ''} · pas de projet d’implantation : elle fait foi` : 'pas de projet d’implantation ni d’électrode localisée'}</div></div></div>${this.implantLayerButton ? `<div class="ir-layers"><span class="lbl">Calques</span>${this.implantLayerButton(ex)}</div>` : ''}`;
        const lb0 = el.querySelector('[data-a=layers]'); if (lb0) lb0.onclick = e => this.implantLayerMenu(ex, e.currentTarget, () => this.implantPanelRefresh());
        return el;
      }
      const chk = st.nReal ? `${st.nChecked}/${st.nReal} vérifiée${st.nChecked > 1 ? 's' : ''}` : '';
      el.innerHTML = `<div class="ir-opts">
          <div class="ir-opt${!st.adopted ? ' on' : ''}"><i class="sw" style="background:${css(COL.plan)}"></i><div><b>Projet d’implantation</b><div class="muted small">${st.nPlan} électrode${st.nPlan > 1 ? 's' : ''} prévue${st.nPlan > 1 ? 's' : ''}${st.adopted && ex.implantPlan ? ' · figé le ' + fmtDate(ex.implantPlan.date) : ''}</div></div>${st.adopted ? '<button class="mini-btn" data-a="revert">revenir au projet</button>' : '<span class="badge">en cours</span>'}</div>
          <div class="ir-opt${st.adopted ? ' on' : ''}"><i class="sw" style="background:${css(COL.real)}"></i><div><b>Implantation réelle</b><div class="muted small">${st.nReal ? `${st.nReal} électrode${st.nReal > 1 ? 's' : ''} localisée${st.nReal > 1 ? 's' : ''} sur le scanner · ${chk}` : 'aucune électrode localisée (étapes 1 à 4)'}${st.adopted ? ' · adoptée le ' + fmtDate(st.adopted) : ''}</div></div>${st.adopted ? '<span class="badge ok">de référence</span>' : `<button class="mini-btn primary" data-a="adopt"${st.nReal ? '' : ' disabled'} title="à faire une fois le recalage du scanner et les électrodes vérifiés">adopter</button>`}</div>
        </div>
        ${!st.adopted && st.nReal && st.nChecked < st.nReal ? `<div class="note small">${st.nReal - st.nChecked} électrode${st.nReal - st.nChecked > 1 ? 's' : ''} pas encore vérifiée${st.nReal - st.nChecked > 1 ? 's' : ''} (étape 4) : vérifiez-les avant d’adopter l’implantation réelle.</div>` : ''}
        ${!st.adopted && st.planOnly.length && st.nReal ? `<div class="muted small">Du projet, sans électrode localisée : ${st.planOnly.map(e => esc(e.name)).join(' ')} — retirées à l’adoption (le projet reste consultable en calque).</div>` : ''}
        <div class="ir-layers"><span class="lbl">Calques</span>
          ${!st.adopted ? `<label class="chip"${st.nReal ? '' : ' hidden'}><input type="checkbox" data-l="showReal"${I.showReal !== false ? ' checked' : ''}> <i class="sw" style="background:${css(COL.real)}"></i> implantation réelle</label>` : `<label class="chip"${ex.implantPlan ? '' : ' hidden'}><input type="checkbox" data-l="showPlan"${I.showPlan ? ' checked' : ''}> <i class="sw" style="background:${css(COL.plan)}"></i> projet d’implantation</label>`}
          ${this.implantLayerButton ? this.implantLayerButton(ex) : ''}
        </div>`;
      const ad = el.querySelector('[data-a=adopt]'); if (ad) ad.onclick = () => { if (this.implantAdopt(ex)) this.implantPanelRefresh(); };
      const rv = el.querySelector('[data-a=revert]'); if (rv) rv.onclick = () => { if (this.implantRevert(ex)) this.implantPanelRefresh(); };
      el.querySelectorAll('input[data-l]').forEach(x => x.onchange = () => { I[x.dataset.l] = x.checked; this.touch('exploration', ex.id, 'calques d’implantation'); this.implantGhostsUpdate(); if (this.sliceMarkers) this.sliceMarkers(); });
      const lb = el.querySelector('[data-a=layers]'); if (lb) lb.onclick = e => this.implantLayerMenu(ex, e.currentTarget, () => this.implantPanelRefresh());
      return el;
    },
    implantPanelRefresh() {
      if (this.ui.screen === 'loc') { const b = $('locRef'), st = this.currentStage(); if (b && st) { b.innerHTML = ''; b.appendChild(this.implantPanel(st.obj)); } }
      if (this.ui.tab === 'electrodes' && this.renderElectrodes) this.renderElectrodes();
    },
    /** bandeau dans les étapes qui utilisent les électrodes : implantation réelle localisée mais pas encore adoptée */
    implantBanner() {
      const ex = this.workspaceSeeg(); if (!ex) return null; const st = S.implantState(ex); if (st.adopted || !st.nReal || !st.nPlan) return null;
      const el = h('div', 'impl-banner', `<i class="sw" style="background:${css(COL.plan)}"></i> Électrodes affichées : <b>projet d’implantation</b>. ${st.nReal} électrode${st.nReal > 1 ? 's' : ''} localisée${st.nReal > 1 ? 's' : ''} sur le scanner (calque vert). <button class="mini-btn primary">adopter l’implantation réelle</button>`);
      el.querySelector('button').onclick = () => { if (this.implantAdopt(ex)) this.implantPanelRefresh(); };
      return el;
    },
  };
  Object.assign(SV.app, M);

  // ---------------------------------------------------------------- greffes
  const A = SV.app, bef0 = A.buildElectrodeFor, rb0 = A.rebuildElectrodes, sm0 = A.sliceMarkers, re0 = A.renderElectrodes, rs0 = A.renderStims, rl0 = A.renderLocalisationView;
  /** géométrie : 'plan' ignore les plots réels, 'real' n'accepte que les électrodes localisées ; sans précision, la
   *  reconstruction des électrodes principales suit l'implantation de référence de l'exploration */
  A.buildElectrodeFor = function (spec, space, geom) {
    if (geom === undefined && this._inRebuild) geom = this.mainGeom();
    if (geom === 'plan' && hasReal(spec)) { if (!hasPlan(spec)) { if (this._inRebuild) this._hiddenSpecIds.add(spec.id); return null; } const s2 = Object.assign({}, spec); delete s2.real; return bef0.call(this, s2, space); }
    if (geom === 'real' && !hasReal(spec)) return null;
    return bef0.call(this, spec, space);
  };
  A.rebuildElectrodes = function () {
    this._hiddenSpecIds = new Set(); this._inRebuild = true;
    try { return rb0.apply(this, arguments); } finally { this._inRebuild = false; this.implantGhostsUpdate(); }
  };
  A.sliceMarkers = function () {
    if (this.slices && this.dossier && !['imaging', 'loc'].includes(this.ui.screen) && !(this.ui.slv && this.ui.slv.elec) && !(this.ui.slv && this.ui.slv.showElec === false) && this.workspaceSeeg()) { this.slices.onPick = p => this.onSlicePick(p); this.slices.pickMode = null; if (this.implantSliceMarkers()) return; }
    return sm0.apply(this, arguments);
  };
  A.renderElectrodes = function () {
    const r = re0.apply(this, arguments), box = $('tab-electrodes'), ex = this.workspaceSeeg();
    if (box && ex) { const p = this.implantPanel(ex, true), wrap = h('details', 'impl-det'); const is = S.implantState(ex), real = !!is.adopted || !is.nPlan; wrap.open = !is.adopted && is.nReal > 0 && is.nPlan > 0; wrap.innerHTML = `<summary>Implantation : <b>${real ? 'réelle' : 'projet'}</b> · calques</summary>`; wrap.appendChild(p); box.insertBefore(wrap, box.firstChild); }
    return r;
  };
  A.renderStims = function () { const r = rs0.apply(this, arguments), box = $('tab-stims'), b = box && this.implantBanner(); if (b) box.insertBefore(b, box.firstChild); return r; };
  A.renderLocalisationView = function (box, st) {
    const r = rl0.apply(this, arguments), col = box && box.querySelector('.loc-col'); if (!col || !st || !st.obj) return r;
    const card = h('div', 'card', '<div class="card-h"><span class="stepn">3</span>Implantation de référence</div><div id="locRef"></div>'); col.appendChild(card);
    $('locRef').appendChild(this.implantPanel(st.obj));
    return r;
  };
  SV.ImplantLayers = { COL };
})(window.SV = window.SV || {});
