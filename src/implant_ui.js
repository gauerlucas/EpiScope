/* EpiScope — implant_ui.js : schémas d'implantation du dossier, de la proposition à l'implantation réelle.
 *
 *   phase 1 ── schéma proposé (espace de travail d'une crise ou de l'exploration, sur le gabarit)
 *      │  « Importer » / décision de SEEG au staff : le schéma est repris (et peut être complété pour les hypothèses
 *      ▼  retenues) — chaque électrode garde son origine
 *   SEEG ── implantation prévue ── scanner post-implantation ── implantation réelle (spec.real, même identifiant)
 *
 * Un schéma est le tableau `electrodes` de son exploration. Ce module :
 *   - liste les schémas du dossier (carte « Implantations » de l'écran Dossier, synthèse du staff) ;
 *   - importe un schéma dans une exploration (remplacer ou compléter), compare deux schémas (communes, non implantées,
 *     ajoutées) ;
 *   - propose, lors d'une décision de SEEG, de reprendre le schéma existant plutôt que d'en recalculer un — et de le
 *     compléter seulement pour les zones des hypothèses retenues qu'il n'échantillonne pas ;
 *   - affiche en tête de l'onglet Électrodes l'état du schéma ouvert (proposé / prévu / réel, origine).            */
(function (SV) {
  'use strict';
  const $ = id => document.getElementById(id), S = SV.Store, V = S.V;
  const esc = SV.U.esc;
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const fmtDate = s => { if (!s) return ''; const d = new Date(String(s).length <= 10 ? s + 'T12:00:00' : s); return isNaN(d) ? String(s) : d.toLocaleDateString(SV.LOC); };
  const CONF_W = { low: 0.4, medium: 0.7, high: 1 };
  const STATUS_CLS = { proposed: 'st-proposed', planned: 'st-planned', real: 'st-real' };

  const M = {
    // ================================================================ électrodes d'un schéma sur le gabarit
    /** électrodes construites sur le gabarit (couverture, proposition) : prévues par leur cible, réelles ramenées par la
     *  transformation patient → gabarit si l'anatomie du patient est calculée */
    planElectrodes(specs) {
      if (!this.vol) return [];
      return (specs || []).map(spec => { try { return this.buildElectrodeFor ? this.buildElectrodeFor(spec, 'template') : spec.target ? SV.Electrodes.build(spec, this.atlas, this.vol) : null; } catch (e) { return null; } }).filter(Boolean);
    },
    /** régions échantillonnées par un schéma (≥ 1 plot) */
    sampledRegions(specs) { const R = new Set(); for (const e of this.planElectrodes(specs)) for (const [r] of e.regions || []) R.add(r); return R; },
    /** couverture des hypothèses par un schéma : pour chaque hypothèse, régions de la ZE et de la propagation échantillonnées */
    hypCoverage(specs, hyps) {
      const R = this.sampledRegions(specs);
      return hyps.map(H => ({ H, ez: H.ez.filter(r => R.has(r)), ezMiss: H.ez.filter(r => !R.has(r)), prop: H.prop.filter(r => R.has(r)), propMiss: H.prop.filter(r => !R.has(r)) }));
    },
    /** pseudo-résultat d'inférence pour la proposition automatique : hypothèses du staff (poids fort), complétées par le
     *  modèle de chaque crise prise en compte (trajectoires, origines candidates, zones symptomatogènes précoces) — un
     *  schéma qui teste les hypothèses retenues et leurs alternatives, comme celui proposé dans l'espace de travail */
    hypResult(hyps, seizures) {
      const models = (seizures || []).map(sz => { try { return this.seizureModel(sz.sz || sz); } catch (e) { return null; } }).filter(Boolean);
      const sideP = hyps.length ? hyps.reduce((s, H) => s + (H.side === 'L' ? 1 : H.side === 'R' ? 0 : 0.5), 0) / hyps.length : null;
      const semP = models.length ? models.reduce((s, r) => s + r.lateralization.pL, 0) / models.length : null;
      const pL = sideP != null && semP != null ? 0.65 * sideP + 0.35 * semP : sideP != null ? sideP : semP != null ? semP : 0.5;
      const H0 = hyps.filter(H => H.ez.length).map(H => ({ origin: H.ez[0], score: 1.5 * (CONF_W[H.confidence] || 0.7), discriminant: [], trajectory: H.ez.map(r => ({ region: r, origin: true })).concat(H.prop.map(r => ({ region: r, relay: true }))) }));
      const k = models.length ? 0.6 / models.length : 0, Hm = [], cand = new Map(), targets = [];
      for (const r of models) {
        for (const Hy of r.hypotheses.slice(0, 3)) Hm.push({ origin: Hy.origin, score: Hy.score * k * models.length / Math.max(1, models.length), discriminant: Hy.discriminant || [], trajectory: Hy.trajectory });
        for (const c of r.candidates.slice(0, 8)) cand.set(c.region, (cand.get(c.region) || 0) + c.score / models.length);
        for (const t of r.targets) if (t.reasons.has('zone symptomatogène précoce') && !targets.some(x => x.region === t.region)) targets.push(t);
      }
      return { lateralization: { pL }, candidates: [...cand].map(([region, score]) => ({ region, score })).sort((a, b) => b.score - a.score), targets, hypotheses: H0.concat(Hm) };
    },
    /** électrodes à ajouter à un schéma pour échantillonner les zones des hypothèses qu'il ne couvre pas */
    completeForHypotheses(specs, hyps, max) {
      if (!this.vol || !hyps.length) return { electrodes: [], uncovered: [] };
      const R = this.hypResult(hyps), pL = R.lateralization.pL;   // complément : hypothèses retenues seulement
      return SV.Electrodes.propose(R, this.atlas, this.vol, { keep: this.planElectrodes(specs), max: max == null ? 6 : max, minGain: 0.9, hemi: pL >= 0.85 ? 'L' : pL <= 0.15 ? 'R' : 'B', contralateral: false, sideConv: this.sideConv() });
    },

    // ================================================================ choix du schéma d'une SEEG (staff, nouvelle exploration)
    /** fenêtre de choix : reprendre un schéma existant (et le compléter), proposer à partir des hypothèses, ou vide.
     *  opts : { toEx, hyps, title, onDone(result) } ; le schéma choisi est écrit dans toEx.electrodes */
    implantChooser(opts) {
      // une seule fenêtre à la fois (un double-clic sur « schéma… » en ouvrait deux, l'une restant après la validation de l'autre)
      const open = document.querySelector('.modal .implant-chooser'); if (open) { const m0 = open.closest('.modal'); if (m0 && m0._toEx === opts.toEx) return; if (m0) m0.remove(); }
      const d = this.dossier, toEx = opts.toEx, hyps = (opts.hyps || []).filter(H => H.ez.length), L = r => esc(this.atlas.label(r));
      const others = S.implantations(d).filter(it => it.ex !== toEx).reverse();   // plus récent d'abord
      const m = h('div', 'modal'), card = h('div', 'modal-card implant-chooser');
      const cov = specs => hyps.length ? this.hypCoverage(specs, hyps).map(c => `<span class="cov${c.ezMiss.length ? ' miss' : ' ok'}" title="${c.ezMiss.length ? 'ZE non échantillonnée : ' + c.ezMiss.map(r => this.atlas.label(r)).join(', ') : 'ZE échantillonnée'}">${esc(c.H.title || 'hypothèse')} : ZE ${c.ez.length}/${c.H.ez.length}</span>`).join(' ') : '';
      const rows = others.map((it, i) => `<label class="ic-opt"><input type="radio" name="icsrc" value="ex:${it.ex.id}"${i === 0 ? ' checked' : ''}><div><b>Reprendre « ${esc(it.ex.label)} » — ${esc(V.implantStatus[it.status])}</b> <span class="muted">${it.n} électrode${it.n > 1 ? 's' : ''}${it.updated ? ' · modifié le ' + fmtDate(it.updated) : ''}</span>
          <div class="small mono">${esc(it.names.join(' '))}</div>${hyps.length ? `<div class="small">${cov(it.ex.electrodes)}</div>` : ''}</div></label>`).join('');
      card.innerHTML = `<div class="modal-head"><span>${esc(opts.title || 'Schéma d’implantation de ' + toEx.label)}</span><button class="close">✕</button></div>
        <div class="help" style="padding:12px 16px">
          ${others.length ? '<div class="hint" style="margin-bottom:8px">Des schémas existent déjà dans le dossier : les reprendre évite de repartir de zéro et garde le lien entre l’implantation proposée et l’implantation réelle.</div>' : ''}
          ${rows}
          ${others.length && hyps.length ? `<label class="ic-sub"><input type="checkbox" id="icComplete" checked> compléter pour les zones des hypothèses retenues qu’il n’échantillonne pas (au plus <input type="number" id="icMax" min="1" max="10" value="4" style="width:46px"> électrodes ajoutées)</label>` : ''}
          ${hyps.length || (opts.seizures || []).length ? `<label class="ic-opt"><input type="radio" name="icsrc" value="model"${others.length ? '' : ' checked'}><div><b>Proposer un nouveau schéma</b> <span class="muted">${hyps.length ? 'hypothèses retenues : ' + hyps.map(H => esc(H.title)).join(' · ') : ''}${(opts.seizures || []).length ? (hyps.length ? ' + ' : '') + 'modèle des ' + opts.seizures.length + ' crise' + (opts.seizures.length > 1 ? 's' : '') : ''}</span>${hyps.length ? `<div class="small">ZE : ${[...new Set(hyps.flatMap(H => H.ez))].map(L).join(', ')}</div>` : ''}<div class="small muted">les hypothèses du staff, leurs alternatives (trajectoires et origines candidates de chaque crise) et un contrôle controlatéral si la latéralisation n’est pas absolue</div></div></label>` : ''}
          <label class="ic-opt"><input type="radio" name="icsrc" value="empty"${!others.length && !hyps.length ? ' checked' : ''}><div><b>Schéma vide</b> <span class="muted">à construire dans l’espace de travail (onglet Électrodes)</span></div></label>
        </div><div class="modal-foot"><button class="primary ok">Valider</button><button class="cancel">Annuler</button></div>`;
      const close = () => m.remove();
      // boutons cherchés dans leur barre : « .ok » désigne aussi les pastilles de couverture (« cov ok ») des options — le
      // bouton Valider restait sans effet (clic sur la première option à la place) dès qu'une hypothèse était couverte
      card.querySelector('.modal-head .close').onclick = card.querySelector('.modal-foot .cancel').onclick = () => { close(); if (opts.onCancel) opts.onCancel(); };
      const sub = card.querySelector('.ic-sub'); const syncSub = () => { if (sub) sub.style.display = (card.querySelector('input[name=icsrc]:checked') || {}).value?.startsWith('ex:') ? '' : 'none'; };
      card.querySelectorAll('input[name=icsrc]').forEach(r => r.onchange = syncSub); syncSub();
      // validation : bouton occupé pendant le calcul (proposition, complément), erreur affichée dans la fenêtre
      const okB = card.querySelector('.modal-foot .ok'), err = h('div', 'ic-err'); card.querySelector('.modal-foot').prepend(err);
      okB.onclick = () => {
        if (okB.disabled) return; okB.disabled = true; const lbl0 = okB.textContent; okB.textContent = 'Calcul…'; err.textContent = '';
        setTimeout(() => { try { apply(); } catch (e) { console.error('schéma', e); okB.disabled = false; okB.textContent = lbl0; err.textContent = 'Le schéma n’a pas pu être appliqué : ' + (e && e.message || e) + ' — rien n’a été modifié.'; } }, 30);
      };
      const apply = () => {
        const v = (card.querySelector('input[name=icsrc]:checked') || {}).value || 'empty', res = { mode: v, added: 0, completed: 0, uncovered: [] };
        const snap0 = JSON.stringify({ electrodes: toEx.electrodes, implant: toEx.implant });   // retour arrière si le calcul échoue
        try {
        if (v.startsWith('ex:')) {
          const from = S.byId(d.explorations, v.slice(3)), r = S.importImplantation(d, from, toEx, 'replace', Object.assign({ kind: 'import', explorationId: from.id, label: from.label }, opts.source || {}));
          res.added = r.added; res.from = from;
          if ($('icComplete') && $('icComplete').checked && hyps.length) {
            const P = this.completeForHypotheses(toEx.electrodes, hyps, +$('icMax').value || 4);
            const extra = P.electrodes.map(e => Object.assign(SV.Electrodes.serialize(e), { origin: { kind: 'staff', label: 'complément (hypothèses)', name: e.name } }));
            toEx.electrodes = toEx.electrodes.concat(extra); res.completed = extra.length; res.uncovered = P.uncovered;
          }
        } else if (v === 'model' && this.vol) {
          const R = this.hypResult(hyps, opts.seizures || []), pL = R.lateralization.pL;
          const P = SV.Electrodes.propose(R, this.atlas, this.vol, { max: 14, hemi: pL >= 0.7 ? 'L' : pL <= 0.3 ? 'R' : 'B', contralateral: true, sideConv: this.sideConv(toEx) });
          toEx.electrodes = P.electrodes.map(e => Object.assign(SV.Electrodes.serialize(e), { origin: { kind: 'staff', label: 'proposition (hypothèses)', name: e.name } })); res.added = P.electrodes.length; res.uncovered = P.uncovered;
          toEx.implant = Object.assign({}, toEx.implant, { source: Object.assign({ kind: 'model', label: 'hypothèses du staff' }, opts.source || {}), updated: S.now() });
        }
        } catch (e) { const o = JSON.parse(snap0); toEx.electrodes = o.electrodes || []; toEx.implant = o.implant; throw e; }
        close(); this.touch();
        const txt = v.startsWith('ex:') ? `${toEx.label} : ${res.added} électrodes reprises de ${res.from.label}${res.completed ? ` + ${res.completed} pour les hypothèses` : ''}` : v === 'model' ? `${toEx.label} : ${res.added} électrodes proposées` : `${toEx.label} : schéma vide`;
        this.toast(txt + (res.uncovered.length ? ' · non échantillonnées : ' + res.uncovered.slice(0, 4).map(r => this.atlas.label(r)).join(', ') : ''), 6000);
        if (opts.onDone) opts.onDone(res);
      };
      m._toEx = toEx; m.appendChild(card); document.body.appendChild(m); m.hidden = false;
    },

    // ================================================================ carte « Implantations » (écran Dossier)
    renderDxImplants() {
      const d = this.dossier, box = $('dxImplants'); if (!box) return;
      const list = S.implantations(d);
      if (!list.length) { box.innerHTML = ''; box.hidden = true; return; } box.hidden = false;
      box.innerHTML = `<div class="card"><div class="card-h">Implantations <span class="muted">du schéma proposé à l’implantation réelle</span></div>
        ${list.map(it => { const src = it.source, srcEx = src && src.explorationId && S.byId(d.explorations, src.explorationId), cmp = srcEx ? S.compareImplantations(srcEx.electrodes, it.ex.electrodes) : null;
          return `<div class="impl-row" data-ex="${it.ex.id}"><span class="impl-st ${STATUS_CLS[it.status]}">${esc(V.implantStatus[it.status])}</span><b>${esc(it.ex.label)}</b> <span class="muted">${it.status === 'real' ? `${it.nReal}/${it.n} électrodes localisées` : `${it.n} électrode${it.n > 1 ? 's' : ''}`}${src ? ' · ' + (src.kind === 'import' || srcEx ? 'repris de ' + esc(src.label || (srcEx && srcEx.label) || '') : src.kind === 'model' ? 'proposé à partir des hypothèses' : '') : ''}${it.updated ? ' · ' + fmtDate(it.updated) : ''}</span>
            <span class="spacer"></span><button class="mini-btn" data-a="open">ouvrir</button>${list.length > 1 || d.explorations.some(e => e.kind === 'seeg' && e !== it.ex) ? '<button class="mini-btn" data-a="import">importer dans…</button>' : ''}
            <div class="small mono">${esc(it.names.join(' '))}</div>${cmp && (cmp.onlyA.length || cmp.onlyB.length) ? `<div class="small">par rapport à ${esc(srcEx.label)} : ${cmp.common.length} commune${cmp.common.length > 1 ? 's' : ''}${cmp.onlyA.length ? ` · <span class="warn-t">non reprise${cmp.onlyA.length > 1 ? 's' : ''} : ${esc(cmp.onlyA.join(', '))}</span>` : ''}${cmp.onlyB.length ? ` · ajoutée${cmp.onlyB.length > 1 ? 's' : ''} : ${esc(cmp.onlyB.join(', '))}` : ''}</div>` : ''}</div>`; }).join('')}</div>`;
      box.querySelectorAll('.impl-row').forEach(row => {
        const ex = S.byId(d.explorations, row.dataset.ex);
        row.querySelector('[data-a=open]').onclick = () => this.openExploration(ex.id);
        const ib = row.querySelector('[data-a=import]'); if (ib) ib.onclick = e => this.importMenu(ex, e.currentTarget);
      });
    },
    /** menu « importer ce schéma dans… » : autres explorations (remplacer / compléter) ou nouvelle SEEG */
    importMenu(fromEx, anchor) {
      const d = this.dossier, items = [{ head: `Importer le schéma de « ${fromEx.label} » (${fromEx.electrodes.length} électrodes)` }];
      for (const ex of S.explorationsSorted(d).filter(e => e !== fromEx)) {
        const n = ex.electrodes.length;
        items.push({ label: `${ex.label}${n ? ' — remplacer ses ' + n + ' électrodes' : ''}`, run: () => this.doImport(fromEx, ex, 'replace') });
        if (n) items.push({ label: `${ex.label} — compléter (électrodes absentes seulement)`, run: () => this.doImport(fromEx, ex, 'merge') });
      }
      items.push({ label: '+ nouvelle SEEG avec ce schéma', run: () => { const ex = S.addExploration(d, { kind: 'seeg', status: 'planned' }); S.addSession(d, ex.id, { date: ex.start }); this.doImport(fromEx, ex, 'replace'); } });
      const r = anchor.getBoundingClientRect(); this.popupMenu(items, Math.min(r.left, window.innerWidth - 420), r.bottom + 4);
    },
    doImport(fromEx, toEx, mode) {
      const d = this.dossier, cur = this.ctx && this.ctx.explorationId === toEx.id;
      if (cur) this.persistWorkspace();
      if (mode === 'replace' && toEx.electrodes.some(e => e.real) && !confirm(`${toEx.label} a des électrodes localisées sur le scanner : les remplacer par le schéma de ${fromEx.label} ?`)) return;
      if (mode === 'replace' && (toEx.stims.length || toEx.thermo.length) && !confirm(`${toEx.label} a déjà des stimulations ou thermocoagulations, liées aux électrodes par leur nom. Remplacer le schéma ?`)) return;
      const r = S.importImplantation(d, fromEx, toEx, mode);
      this.touch(); if (cur) this.openContext(this.ctx, true);
      this.toast(`${toEx.label} : ${r.added} électrode${r.added > 1 ? 's' : ''} reprise${r.added > 1 ? 's' : ''} de ${fromEx.label}${r.skipped ? ` (${r.skipped} déjà présente${r.skipped > 1 ? 's' : ''})` : ''}${r.noTarget ? ` · ${r.noTarget} sans trajectoire prévue non reprise${r.noTarget > 1 ? 's' : ''}` : ''}`, 5000);
      if (this.ui.screen === 'dossier') this.renderDossier(); if (this.ui.tab === 'electrodes') this.renderElectrodes(); this.updateCrumbs && this.updateCrumbs();
    },

    // ================================================================ en-tête de l'onglet Électrodes (espace de travail)
    /** état du schéma ouvert et accès aux autres schémas du dossier ; renvoie un élément à placer en tête de l'onglet */
    implantHeader() {
      const d = this.dossier; if (!d || !this.ctx) return null;
      const ex = S.byId(d.explorations, this.ctx.explorationId); if (!ex) return null;
      const all = S.implantations(d), it = all.find(x => x.ex === ex), others = all.filter(x => x.ex !== ex);
      const src = ex.implant && ex.implant.source, srcEx = src && src.explorationId && S.byId(d.explorations, src.explorationId);
      const box = h('div', 'implant-head');
      const status = it ? it.status : ex.kind === 'seeg' ? 'planned' : 'proposed';
      let html = `<div class="ih-l"><span class="impl-st ${STATUS_CLS[status]}">${esc(V.implantStatus[status])}</span><b>${esc(ex.label)}</b>${it ? ` <span class="muted">${it.status === 'real' ? `${it.nReal}/${it.n} électrodes localisées sur le scanner` : `${it.n} électrode${it.n > 1 ? 's' : ''}`}</span>` : ''}${srcEx ? ` <span class="muted">· repris de ${esc(srcEx.label)}</span> <a href="#" class="ih-cmp">comparer</a>` : ''}</div>`;
      if (others.length) html += `<div class="ih-r"><button class="mini-btn ih-imp">Importer un schéma ▾</button></div>`;
      if (!ex.electrodes.length && others.length) { const o = others[others.length - 1]; html += `<div class="ih-banner">« ${esc(o.ex.label)} » a un ${esc(V.implantStatus[o.status])} de ${o.n} électrode${o.n > 1 ? 's' : ''}. <button class="mini-btn primary ih-go">Le reprendre ici</button></div>`; }
      box.innerHTML = html;
      const imp = box.querySelector('.ih-imp'); if (imp) imp.onclick = e => { const items = [{ head: `Importer dans ${ex.label}` }]; for (const o of others.slice().reverse()) { items.push({ label: `${o.ex.label} — ${V.implantStatus[o.status]} (${o.n})${ex.electrodes.length ? ' : remplacer' : ''}`, run: () => this.doImport(o.ex, ex, 'replace') }); if (ex.electrodes.length) items.push({ label: `${o.ex.label} — compléter (électrodes absentes)`, run: () => this.doImport(o.ex, ex, 'merge') }); } const r = e.currentTarget.getBoundingClientRect(); this.popupMenu(items, Math.min(r.left, window.innerWidth - 420), r.bottom + 4); };
      const go = box.querySelector('.ih-go'); if (go) go.onclick = () => this.doImport(others[others.length - 1].ex, ex, 'replace');
      const cmp = box.querySelector('.ih-cmp'); if (cmp) cmp.onclick = e => { e.preventDefault(); const c = S.compareImplantations(srcEx.electrodes, ex.electrodes); const p = h('div', 'cell-panel'); p.innerHTML = `<div class="ctx-head">${esc(ex.label)} par rapport à ${esc(srcEx.label)}</div><div class="small"><b>${c.common.length} commune${c.common.length > 1 ? 's' : ''}</b> : ${esc(c.common.join(', ') || '—')}</div><div class="small warn-t"><b>non reprise${c.onlyA.length > 1 ? 's' : ''}</b> : ${esc(c.onlyA.join(', ') || '—')}</div><div class="small"><b>ajoutée${c.onlyB.length > 1 ? 's' : ''}</b> : ${esc(c.onlyB.join(', ') || '—')}</div>`; const r = e.target.getBoundingClientRect(); this.popupMenu([{ node: p }], r.left, r.bottom + 4); };
      return box;
    },
    /** badge d'une électrode du schéma ouvert : réelle (scanner), prévue, origine */
    electrodeBadges(id) {
      const spec = (this.state.electrodes || []).find(e => e.id === id); if (!spec) return '';
      const b = []; if (spec.real) b.push(`<span class="badge ok" title="localisée sur le scanner (${esc(spec.real.source || '')} ${esc(String(spec.real.date || '').slice(0, 10))})">réelle</span>`);
      else if (spec.target && this.ctx && (S.byId(this.dossier.explorations, this.ctx.explorationId) || {}).kind === 'seeg') b.push('<span class="badge" title="position prévue sur le gabarit, pas encore localisée sur le scanner">prévue</span>');
      if (spec.origin && spec.origin.label) b.push(`<span class="badge" title="origine du tracé">${esc(spec.origin.label)}</span>`);
      return b.join('');
    },
  };
  Object.assign(SV.app, M);
})(window.SV = window.SV || {});
