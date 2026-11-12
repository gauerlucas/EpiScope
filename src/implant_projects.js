/* EpiScope — implant_projects.js (v4.7) : projets d'implantation d'une SEEG, calques, gestion des étapes du parcours.
 *   - Une SEEG peut avoir plusieurs projets d'implantation (variantes discutées) ; le projet actif est édité dans
 *     Planification ; quand l'implantation est posée (électrodes localisées sur le scanner), c'est le projet retenu.
 *     Menu « Projet ▾ » en tête de l'onglet Schéma d'implantation : changer de projet, nouveau, dupliquer, renommer,
 *     supprimer, reprendre le schéma d'une autre exploration (dans ce projet ou dans un nouveau).
 *   - Calques ▾ : autres projets de la SEEG et autres explorations du patient (implantation réelle, sinon projet) en
 *     transparence dans la 3D et les coupes, nommés — pour voir ce qui a déjà été exploré. Stimulations et
 *     thermocoagulations ne sont pas montrées en planification.
 *   - ⋯ dans la barre d'une étape (exploration, staff, intervention) : renommer, supprimer (avec confirmation). */
(function (SV) {
  'use strict';
  const $ = id => document.getElementById(id), S = SV.Store, V = S.V;
  const esc = SV.U.esc;
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const fmtDate = s => { if (!s) return ''; const d = new Date(String(s).length <= 10 ? s + 'T12:00:00' : s); return isNaN(d) ? String(s) : d.toLocaleDateString(SV.LOC); };
  const hasReal = s => !!(s.real && s.real.contacts && s.real.contacts.length), hasPlan = s => !!(s.target || (s.plan && s.plan.tip));
  const nEl = n => `${n} électrode${n > 1 ? 's' : ''}`;
  const rgb = c => `rgb(${c.join(',')})`;

  const M = {
    // ================================================================ calques
    /** calques possibles pour une exploration : autres projets de la SEEG, autres explorations avec des électrodes */
    implantLayerOptions(ex) {
      const d = this.dossier, out = []; if (!d || !ex) return out;
      if (ex.kind === 'seeg' && !(ex.implant && ex.implant.adopted)) for (const p of S.projectsOf(ex).filter(p => !p.active && p.n)) out.push({ key: 'pj:' + p.id, group: `Autres projets de ${ex.label}`, label: p.name, sub: nEl(p.n) });
      for (const x of S.explorationsSorted(d)) {
        if (x === ex) continue; const real = !!((x.implant && x.implant.adopted) || (x.electrodes || []).some(hasReal));
        const n = real ? x.electrodes.filter(hasReal).length : (x.electrodes || []).filter(hasPlan).length; if (!n) continue;
        out.push({ key: 'ex:' + x.id, group: 'Autres explorations du patient', label: x.label, sub: `${real ? 'implantation réelle' : x.kind === 'seeg' ? 'projet' : 'schéma proposé'} · ${nEl(n)}${x.start ? ' · ' + fmtDate(x.start) : ''}` });
      }
      return out;
    },
    implantLayerButton(ex) {
      const opts = this.implantLayerOptions(ex); if (!opts.length) return '';
      const on = this.implantLayerKeys(ex).filter(k => opts.some(o => o.key === k)).length;
      return `<button class="mini-btn${on ? ' on' : ''}" data-a="layers" title="afficher en transparence d’autres projets ou les explorations précédentes (3D et coupes)">Calques${on ? ' (' + on + ')' : ''} ▾</button>`;
    },
    setImplantLayer(ex, key, on) {
      const I = ex.implant || (ex.implant = {}), keys = this.implantLayerKeys(ex).filter(k => k !== key); if (on) keys.push(key);
      I.layers = keys; delete I.compare; this.touch('exploration', ex.id, 'calques d’implantation');
      this.implantGhostsUpdate(); if (this.sliceMarkers) this.sliceMarkers();
    },
    /** menu des calques : cases à cocher (le menu reste ouvert), pastille de la couleur attribuée */
    implantLayerMenu(ex, anchor, after) {
      const opts = this.implantLayerOptions(ex); if (!opts.length) { this.toast('Pas d’autre projet ni d’autre exploration avec des électrodes', 3000); return; }
      const panel = h('div', 'cell-panel layer-menu');
      const draw = () => {
        let g0 = '', html = '<div class="ctx-head">Calques · en transparence dans la 3D et les coupes</div>';
        for (const o of opts) {
          if (o.group !== g0) { g0 = o.group; html += `<div class="lm-g">${esc(g0)}</div>`; }
          const c = this.implantLayerColor(ex, o.key);
          html += `<label class="lm-row"><input type="checkbox" data-k="${esc(o.key)}"${c ? ' checked' : ''}><i class="sw" style="background:${c ? rgb(c) : 'transparent'}"></i><b>${esc(o.label)}</b><span class="muted small">${esc(o.sub)}</span></label>`;
        }
        panel.innerHTML = html + '<div class="hint small">Électrodes nommées « A’ · SEEG 1 » ; stimulations et thermocoagulations non montrées en planification.</div>';
        panel.querySelectorAll('input[data-k]').forEach(x => x.onchange = () => { this.setImplantLayer(ex, x.dataset.k, x.checked); draw(); if (after) after(); });
      };
      draw();
      const r = anchor.getBoundingClientRect(); this.popupMenu([{ node: panel }], Math.min(r.left, window.innerWidth - 400), r.bottom + 4);
    },

    // ================================================================ projets d'implantation
    /** applique une opération sur les projets de ex et resynchronise l'espace de travail s'il montre cette exploration */
    projectDo(ex, fn, what) {
      const same = this.ctx && this.ctx.explorationId === ex.id; if (same && this.persistWorkspace) this.persistWorkspace();
      const r = fn(); if (r === false || r == null) return r;
      this.touch('exploration', ex.id, what || 'projet d’implantation');
      if (same) { this.ui.selElec = null; if (this.implantSyncWorkspace) this.implantSyncWorkspace(ex); if (this.refreshMarkers) this.refreshMarkers(); }
      if (this.ui.tab === 'electrodes' && this.renderElectrodes) this.renderElectrodes();
      if (this.renderParcours) this.renderParcours(); return r;
    },
    projectMenu(ex, anchor) {
      const d = this.dossier, P = S.projectsOf(ex), cur = P.find(p => p.active), locked = S.projectLocked(ex), items = [{ head: `Projets d’implantation de ${ex.label}` }];
      for (const p of P) items.push({ label: `${p.active ? '● ' : '○ '}${p.name} — ${nEl(p.n)}${p.active ? (locked ? ' (posé)' : ' (ouvert)') : ''}`, run: () => { if (p.active) return; if (locked) { this.toast('Implantation posée : le projet ne change plus (Localisation › Implantation de référence)', 4500); return; } this.projectDo(ex, () => S.switchProject(d, ex, p.id), 'projet « ' + p.name + ' »'); this.toast(`${ex.label} : projet « ${p.name} »`, 2000); } });
      items.push({ sep: true });
      if (!locked) {
        items.push({ label: '＋ Nouveau projet (vide)', run: () => { const nm = prompt('Nom du nouveau projet', ''); if (nm === null) return; this.projectDo(ex, () => S.addProject(d, ex, { name: nm }), 'nouveau projet'); } });
        items.push({ label: `⧉ Dupliquer « ${cur.name} »`, run: () => { const nm = prompt('Nom de la copie', cur.name + ' (variante)'); if (nm === null) return; this.projectDo(ex, () => S.addProject(d, ex, { name: nm, copy: true }), 'projet dupliqué'); } });
      }
      items.push({ label: `✎ Renommer « ${cur.name} »…`, run: () => { const nm = prompt('Nouveau nom du projet', cur.name); if (nm && nm.trim()) this.projectDo(ex, () => S.renameProject(d, ex, cur.id, nm), 'projet renommé'); } });
      for (const p of P.filter(p => !p.active)) items.push({ label: `✎ Renommer « ${p.name} »…`, run: () => { const nm = prompt('Nouveau nom du projet', p.name); if (nm && nm.trim()) this.projectDo(ex, () => S.renameProject(d, ex, p.id, nm), 'projet renommé'); } });
      if (!locked || P.length > 1) for (const p of P.filter(p => !(p.active && locked))) items.push({ label: `✕ Supprimer « ${p.name} »…`, danger: true, run: () => { if (!confirm(`Supprimer le projet « ${p.name} » (${nEl(p.n)}) de ${ex.label} ?${p.active ? (P.length > 1 ? '\nLe projet le plus récent parmi les autres sera ouvert.' : '\nLe schéma de cette SEEG sera vide.') : ''}`)) return; this.projectDo(ex, () => S.removeProject(d, ex, p.id), 'projet supprimé'); } });
      // reprendre le schéma d'une autre exploration (dans ce projet, ou dans un nouveau projet)
      const others = S.implantations(d).filter(it => it.ex !== ex && it.ex.electrodes.some(e => e.target || (e.plan && e.plan.tip))).reverse();   // seules les trajectoires prévues (cible) se reprennent
      if (others.length && !locked) {
        items.push({ sep: true }, { head: 'Reprendre le schéma d’une autre exploration' });
        for (const o of others) {
          items.push({ label: `${o.ex.label} — ${V.implantStatus[o.status]} (${o.n}) → nouveau projet`, run: () => { const pr = this.projectDo(ex, () => S.addProject(d, ex, { name: 'D’après ' + o.ex.label }), 'nouveau projet'); if (pr) this.doImport(o.ex, ex, 'replace'); } });
          items.push({ label: `${o.ex.label} → dans « ${cur.name} »${ex.electrodes.length ? ' (remplacer)' : ''}`, run: () => this.doImport(o.ex, ex, 'replace') });
        }
      }
      const r = anchor.getBoundingClientRect(); this.popupMenu(items, Math.min(r.left, window.innerWidth - 440), r.bottom + 4);
    },

    // ================================================================ étapes du parcours : renommer, supprimer
    stageMenu(st, anchor) {
      const items = [{ head: st.label }], o = st.obj;
      if (['phase1', 'seeg', 'other'].includes(st.kind)) items.push({ label: '✎ Renommer…', run: () => { const nm = prompt('Nom de l’étape', o.label); if (nm && nm.trim()) { o.label = nm.trim(); this.touch('exploration', o.id, 'renommée'); this.renderParcours(); this.renderSubbar(); this.updateCrumbs && this.updateCrumbs(); } } });
      items.push({ sep: true }, { label: `✕ Supprimer « ${st.label} »…`, danger: true, run: () => this.deleteStage(st) });
      const r = anchor.getBoundingClientRect(); this.popupMenu(items, Math.min(r.left, window.innerWidth - 320), r.bottom + 4);
    },
    /** suppression d'une étape avec confirmation (contenu détaillé) ; retour à la synthèse du dossier */
    deleteStage(st) {
      const d = this.dossier, o = st.obj; if (!d || !o) return;
      const n = (x, s, p) => x ? `${x} ${x > 1 ? (p || s + 's') : s}` : '';
      let what, kind;
      if (['phase1', 'seeg', 'other'].includes(st.kind)) {
        kind = 'exploration'; const szs = S.seizuresOfExploration(d, o.id), ses = S.sessionsOf(d, o.id), gal = (d.gallery || []).filter(g => g.explorationId === o.id);
        what = [n(ses.length, 'séance'), n(szs.length, 'crise'), n((o.electrodes || []).length, 'électrode'), n((o.projects || []).length, 'autre projet', 'autres projets'), n((o.stims || []).length, 'stimulation'), n((o.thermo || []).length, 'thermocoagulation'), n((o.quant || []).length, 'analyse')].filter(Boolean);
        if (gal.length) what.push(`${n(gal.length, 'capture')} de la galerie conservée${gal.length > 1 ? 's' : ''} (sans étape)`);
      } else if (st.kind === 'meeting') { kind = 'meeting'; what = [n(d.hypotheses.filter(x => x.meetingId === o.id).length, 'hypothèse'), n(d.decisions.filter(x => x.meetingId === o.id).length, 'décision')].filter(Boolean); }
      else if (st.kind === 'procedure') { kind = 'procedure'; what = []; }
      else return;
      if (!confirm(`Supprimer « ${st.label} »${what.length ? ' :\n— ' + what.join('\n— ') : ''} ?\n\nCette suppression est définitive (enregistrée dans le dossier).`)) return;
      if (kind === 'exploration') {
        if (this.persistWorkspace && this.ctx) this.persistWorkspace();
        const cur = this.ctx && (this.ctx.explorationId === o.id || (this.ctx.seizureId && S.seizuresOfExploration(d, o.id).some(z => z.id === this.ctx.seizureId)));
        for (const x of d.decisions) if (x.createdExplorationId === o.id) x.createdExplorationId = null;
        for (const x of d.explorations) if (x.implant && Array.isArray(x.implant.layers)) x.implant.layers = x.implant.layers.filter(k => k !== 'ex:' + o.id);
        S.remove(d, 'exploration', o.id);
        if (cur) { this.ctx = null; const all = S.allSeizures(d); if (all.length) this.openContext({ seizureId: all[all.length - 1].id }, true); else if (d.explorations.length) this.openContext({ explorationId: S.explorationsSorted(d).pop().id }, true); else { this._loading = true; this.newCase(true); this._loading = false; } }
      } else if (kind === 'meeting') { for (const x of d.hypotheses.filter(x => x.meetingId === o.id)) x.meetingId = null; S.remove(d, 'meeting', o.id); }
      else S.remove(d, 'procedure', o.id);
      this.touch(); this.toast(`« ${st.label} » supprimé`, 2500); this.go({ stage: 'dossier', view: 'synthese' });
    },
  };
  Object.assign(SV.app, M);

  // ---------------------------------------------------------------- greffes
  const A = SV.app, ih0 = A.implantHeader, sb0 = A.renderSubbar, re0 = A.renderElectrodes;
  /** en-tête du schéma d'une SEEG : projet ouvert (menu Projet ▾) et calques ; le menu d'import y est repris */
  A.implantHeader = function () {
    const box = ih0.apply(this, arguments), d = this.dossier, ex = d && this.ctx && S.byId(d.explorations, this.ctx.explorationId);
    if (!box || !ex) return box;
    const lb = this.implantLayerButton(ex);
    if (ex.kind === 'seeg') {
      const imp = box.querySelector('.ih-imp'); if (imp) imp.closest('.ih-r') ? imp.closest('.ih-r').remove() : imp.remove();
      const P = S.projectsOf(ex), cur = P.find(p => p.active), locked = S.projectLocked(ex);
      const row = h('div', 'ih-proj', `<span class="lbl">${locked ? 'Projet posé' : 'Projet'}</span><button class="mini-btn ih-pj" title="changer de projet, nouveau, dupliquer, renommer, supprimer, reprendre un schéma">${esc(cur.name)} ▾</button>${P.length > 1 ? `<span class="muted small">${P.length} projets</span>` : ''}<span class="spacer"></span>${lb}`);
      box.appendChild(row);
      row.querySelector('.ih-pj').onclick = e => this.projectMenu(ex, e.currentTarget);
    } else if (lb) { const row = h('div', 'ih-proj', `<span class="spacer"></span>${lb}`); box.appendChild(row); }
    const lbt = box.querySelector('[data-a=layers]'); if (lbt) lbt.onclick = e => this.implantLayerMenu(ex, e.currentTarget, () => this.renderElectrodes && this.renderElectrodes());
    return box;
  };
  /** planification : le panneau « Implantation : projet · calques » n'apparaît qu'une fois des électrodes localisées */
  A.renderElectrodes = function () {
    const r = re0.apply(this, arguments);
    if (this.ui.wm === 'plan') { const det = document.querySelector('#tab-electrodes .impl-det'), ex = this.workspaceSeeg && this.workspaceSeeg(); if (det && ex) { const st = S.implantState(ex); if (!st.adopted && !st.nReal) det.remove(); } }
    return r;
  };
  /** barre de l'étape : ⋯ (renommer, supprimer) */
  A.renderSubbar = function () {
    const r = sb0.apply(this, arguments), st = this.currentStage && this.currentStage(), bar = document.querySelector('#subbar .sb-title');
    if (st && bar && ['phase1', 'seeg', 'other', 'meeting', 'procedure'].includes(st.kind) && !bar.querySelector('.sb-more')) {
      const b = h('button', 'mini-btn sb-more', '⋯'); b.title = 'renommer, supprimer cette étape'; b.onclick = e => this.stageMenu(st, e.currentTarget); bar.appendChild(b);
    }
    return r;
  };
})(window.SV = window.SV || {});
