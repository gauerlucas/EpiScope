/* EpiScope — present_seeg.js : diaporama du staff, chapitres SEEG, décisions et intervention réalisée (v5.2).
 *   SEEG : implantation prévue / réalisée (vues 3D, liste), électrodes sur le T1 du patient (coupes ; clic sur une électrode :
 *   coupes le long de sa trajectoire), intercritique (compte rendu, captures en galerie), analyses intercritiques, crises
 *   (totaux, frise de l'exploration, plots de début), chaque crise suivie de ses analyses, synthèse des analyses (EImax…),
 *   stimulations (une page, un onglet par type de réponse), thermocoagulations, synthèse. Analyses, stimulations : onglets,
 *   tableau à gauche, vues à droite, visionneuse 3D légère.
 *   Décision : SEEG — schéma proposé, ou « Proposer le schéma » → planification de la SEEG ; chirurgie — coupes du T1 avec
 *   les régions à opérer, vues 3D, proposition modifiable sans quitter le diaporama.
 *   Chirurgie (staff après une intervention) : intervention, devenir, vues 3D, coupes (IRM post-opératoire associée).     */
(function (SV) {
  'use strict';
  const $ = id => document.getElementById(id), S = SV.Store, V = S.V;
  const esc = SV.U.esc;
  const br = s => esc(s).replace(/\n/g, '<br>');
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const fmtDate = s => { if (!s) return ''; const d = new Date(String(s).length <= 10 ? s + 'T12:00:00' : s); return isNaN(d) ? String(s) : d.toLocaleDateString(SV.LOC); };
  const fmtDT = s => { if (!s) return ''; const d = new Date(s); if (isNaN(d)) return String(s); return String(s).length <= 10 ? d.toLocaleDateString(SV.LOC) : d.toLocaleString(SV.LOC, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const hash = s => { let x = 5381; for (let i = 0; i < s.length; i++) x = ((x << 5) + x + s.charCodeAt(i)) | 0; return (x >>> 0).toString(36); };
  const SHOT = { scale: 1.6, crop: true };
  const ROLE = () => (SV.SeegFlow && SV.SeegFlow.ROLE_COL) || { onset: '#e5484d', early: '#f2994a', late: '#e8d44d' };
  const INTER = [['sampling', 'Acquisition'], ['wake', 'Rythme de fond (veille)'], ['sleep', 'Sommeil'], ['physiological', 'Activités physiologiques'], ['slow', 'Foyer lent'], ['other', 'Autres']];
  const SURG_LEG = 'Rouge : résection ; orangé : partielle ; rouge sombre : ZE comprise ; bleu : ZE hors résection.';

  const M = {
    // ================================================================ plan : chapitres SEEG
    /** exploration SEEG d'une décision : celle qu'elle a créée, sinon (décision antérieure à ce lien) la première SEEG qui a
     *  suivi le staff et qu'aucune autre décision ne revendique */
    decisionExploration(x) {
      const d = this.dossier; if (!x) return null; if (x.createdExplorationId) return S.byId(d.explorations, x.createdExplorationId);
      if (!['seeg', 'seeg2'].includes(x.type)) return null;
      const m = S.byId(d.meetings, x.meetingId), taken = new Set(d.decisions.map(y => y.createdExplorationId).filter(Boolean));
      return S.explorationsSorted(d).find(e => e.kind === 'seeg' && !taken.has(e.id) && (!m || !m.date || !e.start || String(e.start) >= String(m.date))) || null;
    },
    /** C = { add, gal (captures sans place imposée), galList (toutes), galSlide, mediaSlide } */
    presentSeegSlides(m, scope, C) {
      const d = this.dossier, { add, gal, galList, galSlide, mediaSlide } = C;
      const mine = d.decisions.filter(x => x.meetingId === m.id).map(x => this.decisionExploration(x)).filter(Boolean), created = new Set(mine.map(e => e.id));
      for (const ex of scope.explorations.filter(e => e.kind === 'seeg' && !created.has(e.id))) {
        const sec = ex.label, pf = { prefetch: () => this.presentSeegAsset(ex) }, PS = this.seegPlanSpecs(ex);
        // implantation prévue (sous le staff qui l'a décidée), puis réalisée et ses électrodes sur l'IRM
        const dec = d.decisions.find(x => { const e = this.decisionExploration(x); return e && e.id === ex.id; }), m0 = dec && S.byId(d.meetings, dec.meetingId), nReal = ex.electrodes.filter(e => e.real && e.real.contacts && e.real.contacts.length).length;
        if (PS.length) add(m0 && m0.id !== m.id ? `Staff du ${fmtDate(m0.date)}` : sec, 'Implantation prévue', (el, alive) => this.prSeegImpl(el, ex, alive, 'plan'), Object.assign({ kind: 'seeg', key: 'implplan:' + ex.id }, pf));
        if (nReal || (ex.electrodes.length && !PS.length)) add(sec, nReal ? 'Implantation réalisée' : 'Implantation', (el, alive) => this.prSeegImpl(el, ex, alive, 'real'), Object.assign({ kind: 'seeg', key: 'impl:' + ex.id }, pf));
        if (nReal && S.refImaging(d)) add(sec, 'Électrodes sur l’IRM', (el, alive) => this.prSeegImplSlices(el, ex, alive), Object.assign({ short: '· Électrodes sur l’IRM', sub: true, kind: 'img', key: 'implsl:' + ex.id }, pf));
        // intercritique : compte rendu et captures en galerie ; analyses intercritiques
        const G0 = galList.filter(g => g.explorationId === ex.id && !g.seizureId && !g.examId), gInter = G0.filter(g => !['stim', 'ictal', 'postictal'].includes(g.kind)), free = new Set(gal.map(g => g.id));
        const I0 = ex.inter || {};
        if (INTER.some(([k]) => (I0[k] || '').trim()) || (I0.spikes || []).length || gInter.length) add(sec, 'Intercritique', (el, alive) => this.prSeegInter(el, ex, gInter, alive), { short: 'Intercritique', key: 'seegint:' + ex.id });
        const QG = this.quantReportGroups ? this.quantReportGroups(ex, ex.quant || []) : [{ kind: 'other', sets: ex.quant || [] }];
        const qIds = k => QG.filter(g => g.kind === k).flatMap(g => g.sets.map(q => q.id)), qSz = sz => QG.filter(g => g.kind === 'ictal').flatMap(g => g.sets.filter(q => (q.seizureId || (g.rec && g.rec.seizureId) || '') === sz.id).map(q => q.id));
        if (qIds('inter').length) add(sec, 'Analyses intercritiques', (el, alive) => this.prQuantTabs(el, ex, alive, qIds('inter'), 'qi:' + ex.id), Object.assign({ short: 'Analyses intercritiques', kind: 'seeg', key: 'qinter:' + ex.id }, pf));
        // crises : début (totaux, frise de l'exploration), puis chacune, ses médias et ses analyses
        const szs = S.seizuresOfExploration(d, ex.id);
        if (szs.length) add(sec, 'Crises', (el, alive) => this.prSeegSz(el, ex, alive), Object.assign({ short: 'Crises (début)', kind: 'seeg', key: 'seegsz:' + ex.id }, pf));
        for (const sz of szs) {
          const show = sz.events.length || (sz.seeg && (Object.keys(sz.seeg.onset || {}).length || sz.seeg.electric)), q = qSz(sz);
          if (show) add(sec, sz.label, (el, alive) => this.prSeizure(el, sz, ex, alive), { short: '· ' + sz.label, hab: sz.habitual === 'yes', kind: 'sz', group: sz.id, key: 'sz:' + sz.id, prefetch: () => this.presentSeizureAsset(sz) });
          if (show) mediaSlide(sec, sz, gal.filter(g => g.seizureId === sz.id));
          if (q.length) add(sec, `Analyses · ${sz.label}`, (el, alive) => this.prQuantTabs(el, ex, alive, q, 'qs:' + sz.id), Object.assign({ short: '· Analyses', sub: true, kind: 'seeg', group: sz.id, key: 'qsz:' + sz.id }, pf));
        }
        const qs = qIds('synth').concat(qIds('other'));
        if (qs.length) add(sec, 'Synthèse des analyses', (el, alive) => this.prQuantTabs(el, ex, alive, qs, 'qy:' + ex.id), Object.assign({ short: 'Synthèse des analyses', kind: 'seeg', key: 'quant:' + ex.id }, pf));
        if (ex.stims.length) add(sec, 'Stimulations', (el, alive) => this.prSeegStims(el, ex, alive), Object.assign({ kind: 'seeg', key: 'stims:' + ex.id }, pf));
        G0.filter(g => g.kind === 'stim' && free.has(g.id)).forEach(g => galSlide(sec, g));
        if (ex.thermo.length) add(sec, 'Thermocoagulations', (el, alive) => this.prSeegThermo(el, ex, alive), Object.assign({ kind: 'seeg', key: 'thermo:' + ex.id }, pf));
        G0.filter(g => ['ictal', 'postictal'].includes(g.kind) && free.has(g.id)).forEach(g => galSlide(sec, g));
        const Rp = ex.report || {}; if ((this.seegReportFields || []).some(([k]) => (Rp[k] || '').trim()) || (Rp.summary || '').trim()) add(sec, 'Synthèse SEEG', el => this.prSeegSynth(el, ex), { short: 'Synthèse', key: 'seegsyn:' + ex.id });
      }
    },

    // ================================================================ vues et tables d'une SEEG
    /** vues et tables d'une SEEG : implantation, stimulations, thermocoagulations, analyses (espace de travail rejoué) */
    presentSeegAsset(ex) {
      const sig = hash(JSON.stringify([ex.electrodes, ex.stims, ex.thermo, ex.quant.map(q => [q.id, q.name, q.values, q.cmap, q.min, q.max]), ex.elecNotes || {}, this.anatMode]));
      return this.presentAsset('seeg:' + ex.id + ':' + sig, async () => {
        const orig = this.ctx ? Object.assign({}, this.ctx) : null, V3 = this.viewer;
        const restoreV = { layout: V3.layoutName, active: V3.active, cfgs: V3.cells.map(c => Object.assign({}, c.cfg, { hyps: c.cfg.hyps.slice() })) };
        if (this.ctx && this.ui.screen === 'work') this.persistWorkspace();
        try {
          this.loadForReport({ explorationId: ex.id }); await wait(60);
          const A = this.atlas, els = (this.elecs || []).slice(), notes = ex.elecNotes || {};
          const region = l => l >= 1 && l <= 162 ? A.label(l) : l === 200 ? 'substance blanche' : l === 201 ? 'LCR' : l === 0 ? 'hors cerveau' : 'autre';
          const ranges = e => { const out = []; let s = 1, cur = e.contacts[0] ? e.contacts[0].label : 0; for (let k = 1; k <= e.contacts.length; k++) { const l = k < e.contacts.length ? e.contacts[k].label : null; if (l !== cur) { out.push(`${s}${k > s ? '–' + k : ''} ${region(cur)}`); s = k + 1; cur = l; } } return out.join(' ; '); };
          // une ligne par électrode du schéma, même sans position (électrode réelle sans anatomie du patient calculée)
          const rows = ex.electrodes.map(spec => { const e = els.find(x => x.id === spec.id), n = notes[spec.name] || {}; return { id: spec.id, name: spec.name, built: !!e, hemi: e ? e.hemi : spec.hemi || (spec.real ? this.elecSideOf(spec.real) : SV.Side.fromName(spec.name, this.sideConv ? this.sideConv() : 'prime') || 'R'), n: e ? e.nContacts : spec.real ? spec.real.contacts.length : spec.plan ? spec.plan.n : spec.n || '', model: e ? e.model : spec.model || '', real: !!spec.real, loc: n.loc || (e ? ranges(e) : 'localisation anatomique à calculer (anatomie du patient)'), act: n.act || '', labels: e ? e.contacts.map(c => c.label) : [] }; });
          V3.setLayout('single');
          const impl = els.length && this.seegShots ? await this.seegShots({}, SHOT, 'impl') : [];
          const G = this.seegReport ? await this.seegReport(SHOT) : null;
          const markers = (V3.markers || []).map(m0 => Object.assign({}, m0));
          // implantation prévue : schéma (projet figé après l'adoption de la réelle), même présentation
          let plan = null; const PS = this.seegPlanSpecs(ex);
          if (PS.length && this.seegShots) {
            const pEls = PS.map(sp => { try { return this.buildElectrodeFor(sp, undefined, 'plan'); } catch (e) { return null; } }).filter(Boolean), keep = this.elecs;
            if (pEls.length) { this.elecs = pEls; V3.setElectrodes(pEls); try { plan = { els: pEls, impl: await this.seegShots({}, SHOT, 'impl_plan'), rows: PS.map(sp => { const e = pEls.find(x => x.id === sp.id); return { id: sp.id, name: sp.name, built: !!e, hemi: e ? e.hemi : sp.hemi, n: e ? e.nContacts : sp.n || '', model: e ? e.model : sp.model || '', real: false, loc: e ? ranges(e) : '', act: '', labels: e ? e.contacts.map(c => c.label) : [] }; }) }; } finally { this.elecs = keep; V3.setElectrodes(keep); } }
          }
          return { els, rows, impl, G, markers, plan };
        } finally {
          this.ctx = null; if (orig) this.openContext(orig, true);
          V3.setLayout(restoreV.layout); restoreV.cfgs.forEach((cfg, i) => V3.setCellConfig(i, cfg, true)); V3.setActive(restoreV.active);
        }
      });
    },
    /** vues SEEG : une colonne par hémisphère (latérale au-dessus de la mésiale), vues supérieure / inférieure / de face */
    seegViewsHtml(list) {
      if (!list || !list.length) return '';
      const col = hm => list.filter(v => v.hemi === hm), sup = list.filter(v => v.face === 'sup' || v.face === 'inf' || v.face === 'ant');
      return `<div class="pr-sviews">${['L', 'R'].filter(hm => col(hm).length).map(hm => `<div class="col">${col(hm).map(v => `<figure><img src="${v.img}"><figcaption>${esc(v.title)}</figcaption></figure>`).join('')}</div>`).join('')}${sup.length ? `<div class="col sup">${sup.map(v => `<figure><img src="${v.img}"><figcaption>${esc(v.title)}</figcaption></figure>`).join('')}</div>` : ''}</div>`;
    },
    async seegSlide(el, ex, alive, html) {
      el.innerHTML = `<div class="pr-wait big">vues de ${esc(ex.label)}…</div>`;
      const a = await this.presentSeegAsset(ex); if (!alive()) return null;
      if (!a) { el.innerHTML = '<div class="hint">Vues indisponibles.</div>'; return null; }
      el.innerHTML = html(a); return a;
    },
    /** schéma prévu d'une SEEG : projet figé (implantation réelle adoptée), sinon électrodes portant une cible ou une trajectoire */
    seegPlanSpecs(ex) {
      const hp = sp => !!(sp.target || (sp.plan && sp.plan.tip));
      if (ex.implant && ex.implant.adopted && ex.implantPlan && ex.implantPlan.electrodes) return ex.implantPlan.electrodes.filter(hp);
      return ex.electrodes.filter(hp);
    },
    /** liste courte des électrodes : nom, nombre de plots, régions principales ; détail au survol ; click : lignes cliquables (data-eid) */
    elecListShort(rows, click) {
      const reg = r => { const A = this.atlas, seen = []; for (const l of r.labels || []) if (l >= 1 && l <= 162) { const t = A.label(l).replace(/ [GD]$/, ''); if (!seen.includes(t)) seen.push(t); } return seen; };
      return `<table class="pr-tab elec short${click ? ' click' : ''}">${['R', 'L'].map(hs => { const L = rows.filter(r => r.hemi === hs).sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true })); return L.length ? `<tr class="sep"><td colspan="2">${hs === 'R' ? 'Droite' : 'Gauche'} · ${L.length}</td></tr>` + L.map(r => { const g = reg(r); return `<tr${click && r.id ? ` data-eid="${r.id}"` : ''} title="${esc(r.loc || '')}"><td><b>${esc(r.name)}</b> <span class="muted">${r.n}</span></td><td>${esc(g.slice(0, 3).join(' · ') || r.loc || '')}${g.length > 3 ? '…' : ''}</td></tr>`; }).join('') : ''; }).join('')}</table>`;
    },
    /** bouton « Planification » (espace de travail ; « Retour à la présentation » ramène ici) */
    reviewBtn(view, label) { return `<button class="primary" data-review="${view}" title="ouvrir dans l’espace de travail ; un bouton ramène à la présentation">▶ ${esc(label)}</button>`; },
    bindReview(el, ex) { el.querySelectorAll('[data-review]').forEach(b => b.onclick = () => this.presentReview({ stage: 'ex:' + ex.id, view: b.dataset.review })); },

    // ================================================================ implantation
    /** implantation (prévue ou réalisée) : vues en grand à gauche, agrandissables, visionneuse 3D ; liste courte à droite
     *  (clic sur une électrode réelle : ses coupes sur l'IRM, diapositive suivante) */
    async prSeegImpl(el, ex, alive, which) {
      const nReal = ex.electrodes.filter(e => e.real).length, P0 = this._pres, sl = P0 ? P0.slides.findIndex(x => x.key === 'implsl:' + ex.id) : -1;
      const a = await this.seegSlide(el, ex, alive, a => {
        const P = which === 'plan' ? a.plan : null, impl = P ? P.impl : a.impl, rows = P ? P.rows : a.rows;
        if (which === 'plan' && !P) return '<div class="hint">Schéma prévu indisponible (électrodes non constructibles).</div>';
        return `<div class="pr-chips"><span class="pr-chip">${rows.length} électrode${rows.length > 1 ? 's' : ''}</span>${P ? `<span class="pr-chip">projet d’implantation${(ex.projects || []).length && (ex.implantPlan ? ex.implantPlan.name : ex.project && ex.project.name) ? ' « ' + esc(ex.implantPlan ? ex.implantPlan.name : ex.project.name) + ' »' : ''} (cibles théoriques)</span>` : `<span class="pr-chip${nReal === ex.electrodes.length ? ' ok' : ''}">${nReal ? nReal + ' localisée' + (nReal > 1 ? 's' : '') + ' sur le scanner' : 'positions prévues (non localisées)'}</span>`}${!P && a.rows.some(r => !r.built) ? `<span class="pr-chip" title="Dossier › Imagerie : « Calculer l’anatomie »">${a.rows.filter(r => !r.built).length} sans position 3D : anatomie du patient à calculer</span>` : ''}${ex.start && !P ? `<span class="pr-chip">${esc(fmtDate(ex.start))}${ex.end ? ' → ' + esc(fmtDate(ex.end)) : ''}</span>` : ''}<span class="spacer"></span>${P ? this.reviewBtn('planif', 'Planification') : ''}</div>
          <div class="pr-2c rev"><div class="pr-card pr-impl">${this.seegViewsHtml(impl) || '<div class="hint">Pas de vue (électrodes non construites).</div>'}${this.presentV3Bar()}</div>
          <div class="pr-card">${this.elecListShort(rows, !P && sl >= 0)}${!P && sl >= 0 ? '<div class="muted small">clic sur une électrode : ses coupes sur l’IRM</div>' : ''}</div></div>`;
      });
      if (!a) return; this.bindReview(el, ex); const box = el.querySelector('.pr-impl'); if (box) this.presentZoomable(box);
      const v3 = el.querySelector('[data-a=v3]'); if (v3) v3.onclick = () => this.openImplant3d(`${ex.label} · implantation ${which === 'plan' ? 'prévue' : 'réalisée'}`, which === 'plan' && a.plan ? a.plan.els : a.els);
      el.querySelectorAll('[data-eid]').forEach(tr => tr.onclick = () => { this._presElec = tr.dataset.eid; this.presentShow(sl); });
    },
    /** v5.2 — électrodes reconstruites sur le T1 du patient : liste cliquable à gauche, coupes à droite (clic : coupes le long
     *  de l'électrode, plots nommés, ◀ ▶ d'un plot à l'autre) */
    async prSeegImplSlices(el, ex, alive) {
      const a = await this.seegSlide(el, ex, alive, a => `<div class="pr-impsl"><div class="pr-card pr-ellist">${this.elecListShort(a.rows.filter(r => r.real), true)}<div class="muted small">clic : coupes le long de l’électrode · ◀ ▶ (coupes actives) : d’un plot à l’autre</div></div><div class="pr-ip"></div></div>`); if (!a) return;
      await wait(20); if (!alive()) return; this._slvSurg = null;
      const S3 = await this.mountImagingPanel(el.querySelector('.pr-ip'), { key: 'pimpl:' + ex.id }); if (!S3 || !alive()) return;
      const rows = el.querySelectorAll('[data-eid]'), mark = id => rows.forEach(r => r.classList.toggle('on', r.dataset.eid === id));
      const pick = id => { const st = this.slvState(), key = this.worldKeyOf(id) || this.worldKeyOfAny(id); st.elecK = 0; st.pair = null; if (!key || !this.checkElectrode(key, true)) { this.toast('Électrode non localisable sur l’IRM', 3000); return; } mark(id); };
      rows.forEach(r => r.onclick = () => pick(r.dataset.eid));
      const st = this.slvState(); if (this._presElec) { pick(this._presElec); this._presElec = null; } else if (st.elec) mark(st.elec.slice(2));
    },
    prSeegInter(el, ex, G, alive) {
      const I = ex.inter || {}, F = INTER.filter(([k]) => (I[k] || '').trim());
      el.innerHTML = `<div class="pr-card exam">${F.length ? `<dl class="pr-dl">${F.map(([k, l]) => `<dt>${l}</dt><dd>${br(I[k])}</dd>`).join('')}</dl>` : '<div class="muted">Pas de compte rendu intercritique saisi.</div>'}</div>
        ${(I.spikes || []).length ? `<div class="pr-card exam"><div class="pr-lbl">Grapho-éléments pathologiques</div><table class="pr-tab">${I.spikes.map(s => `<tr><td class="mono"><b>${esc(s.contacts)}</b></td><td>${esc(s.text)}</td><td class="muted">${esc(({ V: 'veille', S: 'sommeil', VS: 'veille et sommeil' })[s.vig] || '')}</td></tr>`).join('')}</table></div>` : ''}
        ${G.length ? '<div class="pr-card"><div class="pr-lbl">Tracés intercritiques <span class="muted">clic : visionneuse</span></div><div class="pr-thumbs"></div></div>' : ''}`;
      this.presentGallery(el.querySelector('.pr-thumbs'), G, alive);
    },
    /** crises de la SEEG : totaux, frise de l'exploration (stimulations, thermocoagulations, traitement), plots de début */
    async prSeegSz(el, ex, alive) {
      const d = this.dossier, szs = S.seizuresOfExploration(d, ex.id), sum = this.onsetSummary(ex), RC = ROLE();
      await this.seegSlide(el, ex, alive, a => {
        const strips = a.rows.map(r => { const cells = []; let any = false; for (let k = 1; k <= r.n; k++) { const c = sum.contacts[r.name + k]; if (c) any = true; const role = c ? (c.onset ? 'onset' : c.early ? 'early' : 'late') : '', n = c ? (c.onset || c.early || c.late) : 0; cells.push(`<i class="${role}" style="${role ? `background:${RC[role]};opacity:${0.35 + 0.65 * n / Math.max(1, sum.n)}` : ''}" title="${esc(r.name + k)}${c ? ` : ${c.onset} début, ${c.early} précoce, ${c.late} tardive` : ''}">${k}</i>`); } return any ? `<div class="pr-strip"><b>${esc(r.name)}</b><span>${cells.join('')}</span></div>` : ''; }).join('');
        const keys = Object.keys(sum.contacts).sort((x, y) => (sum.contacts[y].onset - sum.contacts[x].onset) || (sum.contacts[y].early - sum.contacts[x].early));
        return `${this.presentSzCounts(ex, szs)}${this.presentTimeline(ex, szs)}
          <div class="pr-2c"><div class="pr-card"><div class="pr-lbl">Plots de début <span class="muted">${sum.n} crise${sum.n > 1 ? 's' : ''} avec plots marqués · ${['onset', 'early', 'late'].map(k => `<b style="color:${RC[k]}">${esc(V.seegRole[k])}</b>`).join(' · ')}</span></div>${strips || '<div class="hint">Aucun plot marqué (SEEG › Crises › onglet Électrique).</div>'}${keys.length ? `<table class="pr-tab">${keys.slice(0, 10).map(k => { const c = sum.contacts[k]; return `<tr><td class="mono"><b>${esc(k)}</b></td><td>${esc(this.contactRegion(k, a.els))}</td><td>${c.onset ? `<b style="color:${RC.onset}">${c.onset}/${sum.n} début</b>` : ''}${c.early ? ` ${c.early} précoce` : ''}${c.late ? ` ${c.late} tardive` : ''}</td></tr>`; }).join('')}</table>` : ''}</div>
          <div class="pr-card"><table class="pr-tab">${szs.map(sz => { const Z = sz.seeg || {}, on = Object.entries(Z.onset || {}).filter(([, x]) => x === 'onset').map(([k]) => k); return `<tr class="click" data-sz="${sz.id}"><td><b>${esc(sz.label)}</b><br><span class="muted">${esc(fmtDT(sz.datetime))}</span></td><td>${sz.habitual === 'yes' ? '<span class="pr-chip ok">habituelle</span>' : ''}${sz.vigilance ? `<div class="muted">${esc(V.vigilance[sz.vigilance])}</div>` : ''}</td><td>${on.length ? `début <b>${esc(this.groupContacts(on).join(' · '))}</b>` : '<span class="muted">début non marqué</span>'}${Z.pattern ? `<div class="muted">${esc(V.seegPattern[Z.pattern] || '')}</div>` : ''}</td></tr>`; }).join('')}</table></div></div>`;
      });
      el.querySelectorAll('tr[data-sz]').forEach(tr => tr.onclick = () => { const P = this._pres, i = P ? P.slides.findIndex(x => x.key === 'sz:' + tr.dataset.sz) : -1; if (i >= 0) this.presentShow(i); });
    },

    // ================================================================ analyses, stimulations, thermocoagulations
    /** v5.2 — jeux d'analyse (une crise, l'intercritique, la synthèse des crises) : un onglet par jeu ; tableau à gauche, vues
     *  et visionneuse 3D à droite. key : mémoire de l'onglet ouvert */
    async prQuantTabs(el, ex, alive, ids, key) {
      const a = await this.seegSlide(el, ex, alive, () => '<div class="pr-qt"></div>'); if (!a) return;
      const Q = ids.map(id => ((a.G && a.G.quant) || []).find(q => q.id === id)).filter(Boolean), box = el.querySelector('.pr-qt');
      if (!Q.length) { box.innerHTML = '<div class="hint">Analyses non rattachées aux plots de cette SEEG (plots absents du schéma, ou anatomie à calculer).</div>'; return; }
      const T = this.ui.prQTab = this.ui.prQTab || {}, lab = q => String(q.name).split(' · ')[0];
      box.innerHTML = `${Q.length > 1 ? `<div class="seg pr-tabs">${Q.map((q, k) => `<button data-k="${k}" title="${esc(q.name)}">${esc(lab(q))}</button>`).join('')}</div>` : ''}<div class="pr-qpane"></div>`;
      const pane = box.querySelector('.pr-qpane'), num = v => (+v).toLocaleString(SV.LOC, { maximumFractionDigits: 3 });
      const show = k => {
        const q = Q[k]; T[key] = q.id; box.querySelectorAll('.pr-tabs button').forEach((b, j) => b.classList.toggle('on', j === k));
        pane.innerHTML = `<div class="pr-2c"><div class="pr-card"><div class="pr-lbl">${esc(q.name)}${q.unit ? ' (' + esc(q.unit) + ')' : ''}${q.source ? ` <span class="muted">· ${esc(q.source)}</span>` : ''}</div><div class="pr-cmap" style="background:${q.cmapCss}"><span>${esc(String(q.min))}</span><span>${esc(String(q.max))}</span></div>
          <table class="pr-tab q">${q.rows.slice(0, 12).map(r => `<tr><td class="mono"><i class="dot" style="background:${r.color}"></i><b>${esc(r.key)}</b></td><td>${esc(r.struct || '')}</td><td class="mono">${num(r.value)}</td>${q.thr != null ? `<td>${+r.value >= q.thr ? '<b class="pr-ez">EZ</b>' : q.pz != null && +r.value > q.pz ? '<span class="pr-pz">PZ</span>' : ''}</td>` : ''}</tr>`).join('')}</table>${q.rows.length > 12 ? `<div class="muted small">… et ${q.rows.length - 12} autres</div>` : ''}${q.net ? `<div class="muted small">${esc(q.net)}</div>` : ''}</div>
          <div class="pr-card pr-qv">${this.seegViewsHtml(q.views) || '<div class="hint">Pas de vue.</div>'}${this.presentV3Bar()}</div></div>`;
        this.presentZoomable(pane.querySelector('.pr-qv'));
        pane.querySelector('[data-a=v3]').onclick = () => this.openSeeg3d(`${ex.label} · ${q.name}`, a.els, a.markers, 'quant', `<span><i style="background:${q.cmapCss};width:70px"></i>${esc(String(q.min))} → ${esc(String(q.max))}${q.unit ? ' ' + esc(q.unit) : ''}</span>`, { set: q.id });
      };
      box.querySelectorAll('.pr-tabs button').forEach(b => b.onclick = () => show(+b.dataset.k));
      show(Math.max(0, Q.findIndex(q => q.id === T[key])));
    },
    /** v5.2 — stimulations sur une page : un onglet par type de réponse (fonctionnelles, crises et post-décharges, subjectives),
     *  paires à gauche, vues à droite, visionneuse 3D du même jeu */
    async prSeegStims(el, ex, alive) {
      const a = await this.seegSlide(el, ex, alive, a => {
        const T = a.G && a.G.stims; if (!T) return '<div class="hint">Stimulations non rattachées aux électrodes de cette SEEG.</div>';
        return `<div class="pr-chips"><span class="pr-chip">${T.rows.length} stimulations</span><span class="pr-chip">${T.pairs.length} paires testées</span><span class="pr-chip">${T.pairs.filter(p => p.top !== 'none').length} avec réponse</span>${T.legend.map(l => `<span class="pr-chip"><i class="dot" style="background:${l.color}"></i>${esc(l.fr)}</span>`).join('')}</div><div class="pr-stt"></div>`;
      }); if (!a || !a.G || !a.G.stims) return;
      const T = a.G.stims, box = el.querySelector('.pr-stt'), ui = this.ui.prStTab = this.ui.prStTab || {};
      const TABS = [['func', 'Réponses fonctionnelles', ['func'], T.funcViews], ['elec', 'Crises, post-décharges', ['sz', 'ad'], T.elecViews], ['subj', 'Réponses subjectives', ['subj'], T.subjViews]].map(t => t.concat([T.pairs.filter(p => p.types.some(x => t[2].includes(x.type)))])).filter(t => t[4].length);
      if (!TABS.length) { box.innerHTML = '<div class="hint">Aucune réponse.</div>'; return; }
      box.innerHTML = `<div class="seg pr-tabs">${TABS.map(t => `<button data-k="${t[0]}">${t[1]} (${t[4].length})</button>`).join('')}</div><div class="pr-stpane"></div>`;
      const pane = box.querySelector('.pr-stpane'), mode = p => ((SV.Seeg && SV.Seeg.STIM_MODES[p.mode]) || {}).fr || p.mode;
      const show = k => {
        const [key, label, ty, views, L] = TABS.find(t => t[0] === k) || TABS[0]; ui[ex.id] = key;
        box.querySelectorAll('.pr-tabs button').forEach(b => b.classList.toggle('on', b.dataset.k === key));
        pane.innerHTML = `<div class="pr-2c"><div class="pr-card scroll pr-stl"><table class="pr-tab st cmp">${L.map(p => { const rg = p.ranges.filter(r => ty.includes(r.type)).map(r => r.txt).join(' · '), tt = p.types.filter(t => t.type !== 'none');   // une ligne par paire : réponse en pastilles colorées, détail sur deux lignes au plus
          return `<tr><td class="mono"><b>${esc(p.key)}</b> <span class="pr-md">${esc(String(mode(p)).replace(/^(Train|Chocs)\s*/i, ''))}</span></td><td><span class="pr-cl2" title="${esc(p.struct || '')}">${esc(p.struct || '')}</span></td><td><span class="pr-cl2" title="${esc(tt.map(t => t.fr).join(', ') + ' — ' + p.detail + (rg ? ' — ' + rg : ''))}">${tt.map(t => `<i class="pr-dot" style="background:${t.color}"></i>`).join('')}${esc(p.detail)}${rg ? ` <span class="pr-md">${esc(rg)}</span>` : ''}</span></td></tr>`; }).join('')}</table></div>
          <div class="pr-card pr-stv">${this.seegViewsHtml(views) || '<div class="hint">Pas de vue.</div>'}${this.presentV3Bar()}</div></div>`;
        this.presentZoomable(pane.querySelector('.pr-stv'));
        pane.querySelector('[data-a=v3]').onclick = () => this.openSeeg3d(`${ex.label} · stimulations · ${label.toLowerCase()}`, a.els, a.markers, 'stim', T.legend.filter(l => ty.some(t => (SV.Seeg && SV.Seeg.RESP[t] || {}).fr === l.fr)).map(l => `<span><i style="background:${l.color}"></i>${esc(l.fr)}</span>`).join(''), { set: key });
      };
      box.querySelectorAll('.pr-tabs button').forEach(b => b.onclick = () => show(b.dataset.k));
      show(TABS.some(t => t[0] === ui[ex.id]) ? ui[ex.id] : TABS[0][0]);
    },
    async prSeegThermo(el, ex, alive) {
      const sum = this.onsetSummary(ex), RC = ROLE(), Rp = ex.report || {};
      const a = await this.seegSlide(el, ex, alive, a => {
        const T = a.G && a.G.thermo; if (!T) return '<div class="hint">Thermocoagulations non rattachées aux électrodes de cette SEEG.</div>';
        const onsetOf = (e, c1) => [c1, c1 + 1].map(k => sum.contacts[e.name + k]).filter(Boolean);
        const byS = ['done', 'validated', 'planned', 'rejected'].map(s => [s, T.rows.filter(r => (r.status || 'done') === s)]).filter(([, L]) => L.length);
        return `<div class="pr-chips">${byS.map(([s, L]) => `<span class="pr-chip"><i class="sw" style="background:${L[0].statusColor}"></i> ${L.length} ${esc(L[0].statusFr)}${L.length > 1 ? 's' : ''}</span>`).join('')}</div>
          <div class="pr-2c"><div class="pr-card scroll"><table class="pr-tab st cmp">${T.rows.map(r => { const o = onsetOf(r.e, r.c1), nOn = o.reduce((s, c) => s + c.onset, 0); return `<tr><td class="mono"><i class="pr-dot" style="background:${r.statusColor || '#e12d37'}" title="${esc((r.statusFr || 'réalisée') + (r.date ? ' ' + fmtDate(r.date) : ''))}"></i><b>${esc(r.key)}</b></td><td><span class="pr-cl2" title="${esc(r.struct || '')}">${esc(r.struct || '')}</span>${nOn ? ` <b class="pr-md" style="color:${RC.onset}">début ×${nOn}</b>` : ''}</td><td><span class="pr-cl2 muted" title="${esc(r.stims + (r.note ? ' — ' + r.note : ''))}">${esc(r.stims)}${r.note ? ' — ' + esc(r.note) : ''}</span></td></tr>`; }).join('')}</table>${Rp.thermoAfter ? `<div class="pr-concl">${br(Rp.thermoAfter)}</div>` : ''}</div>
          <div class="pr-card pr-tcv">${this.seegViewsHtml(T.views)}${this.presentV3Bar()}</div></div>`;
      }); if (!a) return;
      const box = el.querySelector('.pr-tcv'); if (box) this.presentZoomable(box);
      const b = el.querySelector('[data-a=v3]'); if (b) b.onclick = () => this.openSeeg3d(`${ex.label} · thermocoagulations`, a.els, a.markers, 'thermo', [['done', 'réalisées'], ['validated', 'validées'], ['planned', 'planifiées']].map(([k, l]) => `<span><i style="background:rgb(${S.THERMO_COL[k].join(',')})"></i>${l}</span>`).join(''));
    },
    prSeegSynth(el, ex) {
      const Rp = ex.report || {}, F = (this.seegReportFields || []).filter(([k]) => (Rp[k] || '').trim());
      el.innerHTML = `${Rp.summary ? `<div class="pr-card"><p class="pr-lead">${br(Rp.summary)}</p></div>` : ''}<div class="pr-card"><dl class="pr-dl zones">${F.map(([k, l]) => `<dt>${esc(l)}</dt><dd>${br(Rp[k])}</dd>`).join('')}</dl></div>`;
    },

    // ================================================================ décisions
    presentDecisionAsset(x) {
      const d = this.dossier, ex = this.decisionExploration(x);
      if (['surgery', 'litt'].includes(x.type) && x.targets.length && this._surgeryShots) { const dh = d.hypotheses.filter(H => x.hypothesisIds.includes(H.id)); return this.presentAsset('surg:' + x.id + ':' + hash(JSON.stringify([x.targets, x.extent, x.side, x.hypothesisIds, dh.map(H => [H.ez, H.prop]), this.anatMode])), () => this._surgeryShots(x.targets, x.extent || {}, dh, x.side, { scale: 1.6 })); }
      if (ex && (ex.electrodes.length || this.seegPlanSpecs(ex).length)) return this.presentSeegAsset(ex);
      return Promise.resolve(null);
    },
    /** coupes d'une diapositive : hauteur ajustée à la place laissée sous le texte (jamais coupées en bas) */
    presentFitSlices(box) {
      const body = box && box.closest('.pr-body'); if (!body) return;
      box.style.height = Math.max(340, body.getBoundingClientRect().bottom - box.getBoundingClientRect().top - 22) + 'px';
    },
    /** vues d'une intervention (latérale, inférieure, médiale) dans box, visionneuse 3D */
    async presentSurgViews(box, imgsP, alive, open3d) {
      if (!box) return; box.innerHTML = '<div class="pr-wait">vues 3D…</div>';
      const a = await imgsP; if (!alive()) return;
      if (!a || !a.length) { box.innerHTML = '<div class="hint">Vues indisponibles.</div>'; return; }
      box.innerHTML = `<div class="pr-svh">${a.map((u, k) => `<figure><img src="${u}"><figcaption>${['latérale', 'inférieure (radiologique)', 'médiale'][k] || ''}</figcaption></figure>`).join('')}</div><div class="muted small">${SURG_LEG}</div>${this.presentV3Bar()}`;
      this.presentZoomable(box); box.querySelector('[data-a=v3]').onclick = open3d;
    },
    /** v5.2 — décision : SEEG (schéma proposé, ou « Proposer le schéma » → planification de la SEEG) ; chirurgie (coupes du
     *  T1 avec les régions à opérer à droite, vues 3D en bas à gauche, proposition modifiable dans le diaporama) */
    async prDecision(el, m, x, alive) {
      const d = this.dossier, L = r => esc(this.atlas.label(r)), hyps = this.meetingHypotheses(m), dh = d.hypotheses.filter(H => x.hypothesisIds.includes(H.id));
      const ex = this.decisionExploration(x), pr = x.procedureId && S.byId(d.procedures, x.procedureId), surg = ['surgery', 'litt'].includes(x.type), seeg = ['seeg', 'seeg2'].includes(x.type);
      const PS = ex ? this.seegPlanSpecs(ex) : [], sch = !!ex && (PS.length > 0 || ex.electrodes.length > 0);
      const hchip = H => { const i = hyps.findIndex(y => y.id === H.id); return `<span class="pr-chip" style="border-color:${i >= 0 ? SV.hypCss(i) : 'var(--line2)'}">${i >= 0 ? 'H' + (i + 1) + ' ' : ''}${esc(H.title)}</span>`; };
      const cov = surg && this.surgeryCoverage ? this.surgeryCoverage(x.targets, dh).map(c => `<div class="pr-row"><b>${esc(c.H.title)}</b> : ZE ${c.in.length}/${c.H.ez.length} dans la résection${c.out.length ? ` <span class="muted">(hors : ${c.out.map(L).join(', ')})</span>` : ''}</div>`).join('')
        : sch && this.hypCoverage ? this.hypCoverage(PS.length ? PS : ex.electrodes, dh).map(c => `<div class="pr-row"><b>${esc(c.H.title)}</b> : ZE ${c.ez.length}/${c.H.ez.length} échantillonnée${c.ezMiss.length ? ` <span class="muted">(manque : ${c.ezMiss.map(L).join(', ')})</span>` : ''}${c.H.prop.length ? ` · propagation ${c.prop.length}/${c.H.prop.length}` : ''}</div>`).join('') : '';
      const btns = `<button class="pr-btn" data-a="dtext" title="texte de la décision (Ctrl+Entrée : enregistrer)">✎ ${x.text ? 'Modifier le texte' : 'Préciser la décision'}</button>${seeg ? `<button class="pr-btn" data-a="plan" title="planification de la SEEG (schéma d’implantation) ; « Retour à la présentation » ramène ici">${sch ? '✎ Modifier le schéma d’implantation' : 'Proposer le schéma d’implantation…'}</button>` : surg ? '<button class="pr-btn" data-a="surg" title="intervention, côté, régions : modifiables ici">✎ Modifier la proposition</button>' : ['rftc', 'neuromod'].includes(x.type) ? '<button class="pr-btn" data-a="prep" title="ouvrir la décision dans « Préparer »">Préciser dans « Préparer »…</button>' : ''}`;
      const body = surg ? `<div class="pr-decs"><div class="l"><div class="pr-card"><div class="pr-lbl">Intervention proposée</div><div class="pr-row"><b>${esc((this.surgeryLabel && this.surgeryLabel(x)) || V.decision[x.type])}</b></div><div class="pr-regs">${x.targets.map(r => `<span class="rchip">${L(r)}${x.extent && x.extent[r] ? ' (partiel)' : ''}</span>`).join('') || '<i class="muted">régions à préciser</i>'}</div>${cov ? `<div class="pr-lbl">Hypothèses couvertes</div>${cov}` : ''}</div>${x.targets.length ? '<div class="pr-card pr-dviews"></div>' : ''}</div><div class="r"><div class="pr-ip pr-ssl"></div></div></div>`
        : sch ? `<div class="pr-2c rev"><div class="pr-card pr-dviews"></div><div class="pr-card"><div class="pr-lbl">${esc(ex.label)} · ${PS.length ? 'schéma proposé' : 'implantation réalisée'} · ${(PS.length || ex.electrodes.length)} électrodes</div><div class="pr-dec-el"></div>${cov ? `<div class="pr-lbl">Hypothèses couvertes</div>${cov}` : ''}</div></div>`
        : x.targets.length ? `<div class="pr-card"><div class="pr-lbl">Cibles</div><div class="pr-regs">${x.targets.map(r => `<span class="rchip">${L(r)}</span>`).join('')}</div></div>` : '';
      el.innerHTML = `<div class="pr-chips"><span class="pr-chip">${esc(V.decisionStatus[x.status] || '')}</span>${x.date ? `<span class="pr-chip">${esc(fmtDate(x.date))}</span>` : ''}${dh.map(hchip).join('')}${ex ? `<span class="pr-chip ok">→ ${esc(ex.label)}</span>` : ''}${pr ? `<span class="pr-chip ok">→ ${esc((this.surgeryLabel && this.surgeryLabel(pr)) || V.procedure[pr.type])}${pr.date ? ' le ' + esc(fmtDate(pr.date)) : ''}</span>` : ''}</div>
        <div class="pr-dtext">${x.text ? `<p class="pr-lead">${br(x.text)}</p>` : ''}</div><div class="pr-vact">${btns}</div>${body}`;
      const redo = () => { if (this._pres) this.presentShow(this._pres.i); };
      el.querySelector('[data-a=dtext]').onclick = () => this.presentInlineEdit(el.querySelector('.pr-dtext'), x.text || '', v => { x.text = v; this.touch('decision', x.id, V.decision[x.type]); }, { placeholder: 'Décision du staff…', rows: 4 });
      const bp = el.querySelector('[data-a=plan]'); if (bp) bp.onclick = () => { let e = ex; if (!e && this.decisionCreateExploration) e = this.decisionCreateExploration(x); else if (e && !x.createdExplorationId) { x.createdExplorationId = e.id; this.touch('decision', x.id, 'SEEG liée à la décision'); } if (e) this.presentReview({ stage: 'ex:' + e.id, view: 'planif' }); };
      const bs = el.querySelector('[data-a=surg]'); if (bs) bs.onclick = () => this.presentSurgEdit(x, dh, redo);
      const bq = el.querySelector('[data-a=prep]'); if (bq) bq.onclick = () => this.presentReview({ stage: 'meet:' + m.id, view: 'preparer' });
      if (surg) {
        this.presentFitSlices(el.querySelector('.pr-ssl')); this.mountSurgerySlices(el.querySelector('.pr-ssl'), { key: 'psurg:' + x.id, regions: x.targets, extent: x.extent, hyps: dh });
        if (x.targets.length) this.presentSurgViews(el.querySelector('.pr-dviews'), this.presentDecisionAsset(x), alive, () => this.openSurgery3d((this.surgeryLabel && this.surgeryLabel(x)) || V.decision[x.type], x.targets, x.extent || {}, dh, x.side));
        return;
      }
      if (!sch) return;
      const vb = el.querySelector('.pr-dviews'); vb.innerHTML = '<div class="pr-wait">vues 3D…</div>';
      const a = await this.presentDecisionAsset(x); if (!alive()) return;
      if (!a) { vb.innerHTML = '<div class="hint">Vues indisponibles.</div>'; return; }
      const P = PS.length && a.plan ? a.plan : null;
      vb.innerHTML = (this.seegViewsHtml(P ? P.impl : a.impl) || '<div class="hint">Pas de vue.</div>') + this.presentV3Bar(); el.querySelector('.pr-dec-el').innerHTML = this.elecListShort(P ? P.rows : a.rows);
      this.presentZoomable(vb); vb.querySelector('[data-a=v3]').onclick = () => this.openImplant3d(`${ex.label} · ${P ? 'schéma proposé' : 'implantation réalisée'}`, P ? P.els : a.els);
    },
    /** proposition chirurgicale modifiée sans quitter le diaporama (même éditeur que « Préparer ») */
    presentSurgEdit(x, dh, done) {
      if (!this.surgeryEditor) return;
      const box = h('div', 'pr-pop', '<div class="pr-pop-card wide"><div class="pr-lbl">Intervention proposée</div><div class="pr-se"></div><div class="btnrow"><span class="spacer"></span><button class="pr-btn" data-a="ok">Fermer</button></div></div>');
      $('presentation').appendChild(box); box.querySelector('.pr-se').appendChild(this.surgeryEditor(x, dh, () => this.touch('decision', x.id, V.decision[x.type])));
      const close = () => { box.remove(); done(); };
      box.querySelector('[data-a=ok]').onclick = close; box.onclick = e => { if (e.target === box) close(); };
    },

    // ================================================================ chirurgie (staff après une intervention)
    /** interventions réalisées avant le staff (hors thermocoagulations SEEG, montrées avec la SEEG) */
    presentSurgerySlides(m, add) {
      const d = this.dossier, L = (d.procedures || []).filter(p => p.type !== 'rftc' && (p.date ? !m.date || String(p.date) <= String(m.date) : m.kind === 'post_surgery')).sort((a, b) => String(a.date).localeCompare(String(b.date)));
      for (const p of L) add('Chirurgie', (this.surgeryLabel && this.surgeryLabel(p)) || p.target || V.procedure[p.type], (el, alive) => this.prSurgery(el, m, p, alive), { short: V.procedure[p.type], key: 'proc:' + p.id, prefetch: () => this.presentProcAsset(p) });
    },
    /** hypothèses comparées à une intervention : celles de la décision qui l'a programmée, sinon les retenues */
    presentProcHyps(p) { const d = this.dossier, dec = (p.decisionId && S.byId(d.decisions, p.decisionId)) || d.decisions.find(x => x.procedureId === p.id); return dec ? d.hypotheses.filter(H => dec.hypothesisIds.includes(H.id)) : S.latestHypotheses(d).filter(H => ['confirmed', 'testing'].includes(H.status)); },
    presentProcAsset(p) {
      const hy = this.presentProcHyps(p); if (!p.regions.length || !this._surgeryShots) return Promise.resolve(null);
      return this.presentAsset('proc:' + p.id + ':' + hash(JSON.stringify([p.regions, p.extent, p.side, hy.map(H => H.ez), this.anatMode])), () => this._surgeryShots(p.regions, p.extent || {}, hy, p.side, { scale: 1.6 }));
    },
    /** intervention réalisée : description, histologie, complications, devenir (jusqu'au staff), vues 3D ; coupes du T1 avec
     *  les régions opérées, et l'IRM post-opératoire associée (superposition pré / post) */
    async prSurgery(el, m, p, alive) {
      const d = this.dossier, L = r => esc(this.atlas.label(r)), hy = this.presentProcHyps(p), dec = (p.decisionId && S.byId(d.decisions, p.decisionId)) || d.decisions.find(x => x.procedureId === p.id), m0 = dec && S.byId(d.meetings, dec.meetingId);
      const outs = d.outcomes.filter(o => S.outcomeProcedure(d, o) === p && (!m.date || !o.date || String(o.date) <= String(m.date))).sort((a, b) => String(a.date).localeCompare(String(b.date))), lab = (this.surgeryLabel && this.surgeryLabel(p)) || '';
      const cov = this.surgeryCoverage ? this.surgeryCoverage(p.regions, hy).map(c => `<div class="pr-row"><b>${esc(c.H.title)}</b> : ZE ${c.in.length}/${c.H.ez.length} réséquée${c.out.length ? ` <span class="muted">(hors : ${c.out.map(L).join(', ')})</span>` : ''}</div>`).join('') : '';
      const last = outs[outs.length - 1];
      el.innerHTML = `<div class="pr-chips"><span class="pr-chip">${esc(V.procedure[p.type])}</span>${p.date ? `<span class="pr-chip">${esc(fmtDate(p.date))}</span>` : ''}${p.side ? `<span class="pr-chip">${p.side === 'L' ? 'gauche' : 'droite'}</span>` : ''}${m0 ? `<span class="pr-chip">décidée au staff du ${esc(fmtDate(m0.date))}</span>` : ''}${last ? `<span class="pr-chip ok">Engel ${esc(last.engel || '?')} · ILAE ${esc(last.ilae || '?')} à ${S.outcomeMonths(d, last)} mois</span>` : ''}</div>
        <div class="pr-decs"><div class="l"><div class="pr-card"><div class="pr-lbl">Intervention</div>${lab ? `<div class="pr-row"><b>${esc(lab)}</b></div>` : ''}${p.target && p.target !== lab ? `<div class="pr-row">${esc(p.target)}</div>` : ''}<div class="pr-regs">${p.regions.map(r => `<span class="rchip">${L(r)}${p.extent && p.extent[r] ? ' (partiel)' : ''}</span>`).join('')}</div>${cov ? `<div class="pr-lbl">Hypothèses</div>${cov}` : ''}
          ${p.histology || p.complications || p.notes ? `<dl class="pr-dl">${p.histology ? `<dt>Histologie</dt><dd>${esc(p.histology)}</dd>` : ''}${p.complications ? `<dt>Complications</dt><dd>${esc(p.complications)}</dd>` : ''}${p.notes ? `<dt>Notes</dt><dd>${br(p.notes)}</dd>` : ''}</dl>` : ''}</div>
          ${outs.length ? `<div class="pr-card"><div class="pr-lbl">Devenir</div><table class="pr-tab">${outs.map(o => `<tr><td class="mono">${esc(fmtDate(o.date))}</td><td>Engel <b>${esc(o.engel || '?')}</b> · ILAE <b>${esc(o.ilae || '?')}</b></td><td class="muted">${S.outcomeMonths(d, o)} mois${o.aeds ? ' · ' + esc(o.aeds) : ''}${o.notes ? ' · ' + esc(o.notes) : ''}</td></tr>`).join('')}</table></div>` : ''}
          ${p.regions.length ? '<div class="pr-card pr-dviews"></div>' : ''}</div><div class="r"><div class="pr-ip pr-ssl"></div></div></div>`;
      this.presentFitSlices(el.querySelector('.pr-ssl')); this.mountSurgerySlices(el.querySelector('.pr-ssl'), { key: 'proc:' + p.id, regions: p.regions, extent: p.extent, hyps: hy, proc: p });
      if (p.regions.length) this.presentSurgViews(el.querySelector('.pr-dviews'), this.presentProcAsset(p), alive, () => this.openSurgery3d(lab || V.procedure[p.type], p.regions, p.extent || {}, hy, p.side));
    },
  };
  Object.assign(SV.app, M);
})(window.SV = window.SV || {});
