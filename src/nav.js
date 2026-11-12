/* EpiScope — nav.js : navigation par le parcours du patient.
 *
 *   Patients ─ patient ─ parcours (chronologique) : Dossier · Phase 1 · Staff · SEEG · Staff · Chirurgie · Suivi · ＋
 *   chaque étape a ses vues (sous-onglets), dans l'ordre où l'on s'en sert :
 *     Dossier   : Synthèse · Histoire clinique · Bilans · Imagerie · Galerie · Journal
 *     Phase 1   : Crises (→ crise ouverte : saisie sémiologique, 3D, frise) · Synthèse des crises · EEG · Galerie
 *     Staff     : Préparer · Présenter
 *     SEEG      : Planification · Localisation · Crises · Intercritique · Analyses · Stimulations · Thermocoagulations ·
 *                 Galerie · Rapport SEEG
 *     Chirurgie : Intervention        Suivi : Suivi
 *   L'espace de travail 3D sert plusieurs vues, chacune dans un « mode » qui ne montre que ce qu'il faut : sémiologie
 *   (saisie, frise, réseau, origine, cibles), planification (schéma), analyses (quantifications), stimulations et
 *   thermocoagulations (3D + coupe de l'électrode dans son axe + formulaire, sans saisie ni frise).                */
(function (SV) {
  'use strict';
  const $ = id => document.getElementById(id), S = SV.Store, V = S.V;
  const esc = SV.U.esc;
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const fmtDate = s => { if (!s) return ''; const d = new Date(String(s).length <= 10 ? s + 'T12:00:00' : s); return isNaN(d) ? String(s) : d.toLocaleDateString(SV.LOC); };
  const fmtShort = s => { if (!s) return 'à dater'; const d = new Date(String(s).length <= 10 ? s + 'T12:00:00' : s); return isNaN(d) ? String(s) : d.toLocaleDateString(SV.LOC, { day: '2-digit', month: '2-digit', year: '2-digit' }); };
  const LSget = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };

  const VIEWS = {
    dossier: [['synthese', 'Synthèse'], ['antecedents', 'Antécédents et contexte'], ['maladie', 'Histoire de la maladie'], ['developpement', 'Développement et examen'], ['bilans', 'Bilans'], ['imagerie', 'Imagerie'], ['galerie', 'Galerie'], ['journal', 'Journal']],
    phase1: [['inter', 'Intercritique'], ['crises', 'Crises'], ['analyses', 'Analyses EEG'], ['synthese', 'Synthèse'], ['galerie', 'Galerie']],   // v5.1 : l'EEG est réparti entre intercritique, crises et synthèse
    seeg: [['planif', 'Planification'], ['loc', 'Localisation'], ['inter', 'Intercritique'], ['crises', 'Crises'], ['analyses', 'Analyses'], ['stim', 'Stimulations'], ['thermo', 'Thermocoagulations'], ['galerie', 'Galerie'], ['rapport', 'Rapport SEEG']],
    meeting: [['preparer', 'Préparer']],   // v5 : « Présenter » est l'action orange de la barre (pas un second onglet)
    procedure: [['intervention', 'Intervention']],
    followup: [['suivi', 'Suivi']],
  };
  VIEWS.other = VIEWS.phase1;
  const VIEW_HINT = {
    planif: 'schéma d’implantation : proposition, édition, import de la planification chirurgicale (ROSA, CSV)', loc: 'scanner post-implantation : recalage, reconstruction des électrodes, nommage, vérification une à une',
    crises: 'crises enregistrées : sémiologie, EEG critique, types de crises', inter: 'rythme de fond, anomalies intercritiques, tracés et captures datés (veille / sommeil)', analyses: 'quantifications : EI, taux de ripples, de pointes…',
    stim: 'stimulations corticales directes', thermo: 'thermocoagulations', rapport: 'compte rendu de la SEEG', synthese: 'synthèse intercritique et des crises, conclusion', galerie: 'captures de tracés (Ctrl+V)',
    antecedents: 'antécédents, mode de vie, comorbidités, arbre généalogique', maladie: 'histoire de l’épilepsie, fréquence des crises, traitements', developpement: 'grossesse et naissance, acquisitions psychomotrices, examen, mesures et courbes, latéralité', bilans: 'EEG, IRM, TEP, neuropsychologie… datés', imagerie: 'NIfTI, recalage, anatomie du patient', preparer: 'concordance, hypothèses, décision', presenter: 'diaporama plein écran, sans édition',
  };
  /** vues de l'espace de travail 3D → mode */
  const WORK = { crise: 'semio', planif: 'plan', analyses: 'quant', stim: 'stim', thermo: 'thermo' };
  const WM_TABS = { semio: ['network', 'onset', 'targets', 'model'], semioSeeg: ['seegsz', 'network', 'onset', 'targets', 'model'], plan: ['electrodes'], stim: ['stims'], thermo: ['thermo'], quant: ['quant'] };
  const PROC_SHORT = { resection: 'Chirurgie', lobectomy: 'Chirurgie', disconnection: 'Chirurgie', rftc: 'Thermocoagulation', litt: 'Laser', neuromod: 'Neuromodulation', other: 'Procédure' };
  /** vues rendues dans la section générique #scr-view → méthode */
  const VIEW_FN = { antecedents: 'renderAntecedentsView', maladie: 'renderDiseaseView', developpement: 'renderDevView', histoire: 'renderHistoryView', bilans: 'renderExamsView', galerie: 'renderGalleryView', journal: 'renderJournalView', crises: 'renderSeizureListView', synthese: 'renderSzSynthesisView', loc: 'renderLocalisationView', inter: 'renderInterView', rapport: 'renderSeegReportView', intervention: 'renderProcedureView', suivi: 'renderFollowupView' };

  const M = {
    loc: null,
    navViews: VIEWS,

    // ================================================================ étapes du parcours
    parcours() {
      const d = this.dossier; if (!d) return [];
      const decFor = (key, id) => d.decisions.find(x => x[key] === id), mDate = x => x && x.meetingId ? ((S.byId(d.meetings, x.meetingId) || {}).date || '') : '';
      const it = [];
      for (const ex of d.explorations) { const dec = decFor('createdExplorationId', ex.id), md = mDate(dec); it.push({ key: 'ex:' + ex.id, kind: ex.kind === 'seeg' ? 'seeg' : ex.kind === 'other' ? 'other' : 'phase1', id: ex.id, obj: ex, label: ex.label, sort: ex.start || (md ? md + '~' : '9999'), date: ex.start, status: ex.status }); }
      for (const m of d.meetings) it.push({ key: 'meet:' + m.id, kind: 'meeting', id: m.id, obj: m, label: 'Staff ' + fmtShort(m.date), sort: (m.date || '9999') + '!', date: m.date, status: m.status });
      for (const p of d.procedures) { const dec = decFor('procedureId', p.id), md = mDate(dec); it.push({ key: 'proc:' + p.id, kind: 'procedure', id: p.id, obj: p, label: PROC_SHORT[p.type] || 'Procédure', sort: p.date || (md ? md + '~~' : '9999'), date: p.date, status: p.date && p.date <= S.today() ? 'done' : 'planned' }); }
      if (d.outcomes.length) { const first = d.outcomes.map(o => o.date).filter(Boolean).sort()[0] || '9999'; it.push({ key: 'followup', kind: 'followup', label: 'Suivi', sort: first + '~~~', date: first, status: 'ongoing' }); }
      it.sort((a, b) => String(a.sort).localeCompare(String(b.sort)));
      return [{ key: 'dossier', kind: 'dossier', label: 'Dossier' }].concat(it);
    },
    stageByKey(key) { return this.parcours().find(x => x.key === key) || null; },
    stageOfExploration(exId) { return this.stageByKey('ex:' + exId); },
    currentStage() { return this.loc ? this.stageByKey(this.loc.stage) : null; },
    defaultView(st) {
      if (st.kind === 'seeg') { const ex = st.obj; if (ex.status === 'planned') return 'planif'; if (ex.status === 'done') return 'rapport'; return ex.electrodes.some(e => e.real) ? 'crises' : 'loc'; }
      return (VIEWS[st.kind] || VIEWS.dossier)[0][0];
    },

    // ================================================================ aller à…
    /** loc = { stage: 'dossier' | 'ex:<id>' | 'meet:<id>' | 'proc:<id>' | 'followup', view, seizureId } */
    go(loc, o) {
      o = o || {}; const d = this.dossier;
      if (!d) { this.showRaw('patients'); return; }
      loc = Object.assign({}, loc || {});
      let st = loc.stage && this.stageByKey(loc.stage);
      if (!st && loc.seizureId) { const c = S.contextOf(d, loc.seizureId); if (c) { st = this.stageOfExploration(c.exploration.id); loc.view = 'crise'; } }
      if (!st) st = this.stageByKey('dossier');
      loc.stage = st.key;
      const views = VIEWS[st.kind] || VIEWS.dossier;
      if (!loc.view) loc.view = (this.ui.lastView && this.ui.lastView[st.key]) || this.defaultView(st);
      if (loc.view === 'crise' && !loc.seizureId) loc.seizureId = this.ctx && this.ctx.seizureId && (S.contextOf(d, this.ctx.seizureId) || {}).exploration && S.contextOf(d, this.ctx.seizureId).exploration.id === st.id ? this.ctx.seizureId : null;
      if (loc.view === 'crise' && !loc.seizureId) loc.view = 'crises';
      if (loc.view === 'histoire') loc.view = 'antecedents';   // v4.19 : histoire clinique en trois onglets
      if (loc.view === 'eeg') loc.view = 'inter';   // v5.1 : ancienne vue « EEG » de la phase 1
      if (loc.view !== 'crise' && !(st.kind === 'meeting' && loc.view === 'presenter') && !views.some(v => v[0] === loc.view)) loc.view = views[0][0];
      if (this.ui.screen === 'work') this.persistWorkspace();
      if (this.ui.present) this.present(false);
      this.loc = loc; (this.ui.lastView = this.ui.lastView || {})[st.key] = loc.view === 'crise' ? 'crises' : loc.view;
      const wm = loc.view === 'crise' ? (st.kind === 'seeg' ? 'semioSeeg' : 'semio') : WORK[loc.view];
      if (wm) {
        const TWO = ['stim', 'thermo'], leavingTwo = TWO.includes(this.ui.wm) && !TWO.includes(wm);
        if (loc.view === 'crise') { if (!this.ctx || this.ctx.seizureId !== loc.seizureId) this.openContext({ seizureId: loc.seizureId }, true); }
        else if (!this.ctx || this.ctx.seizureId || this.ctx.explorationId !== st.id) this.openContext({ explorationId: st.id }, true);
        this.showRaw('work'); this.setWorkMode(wm);
        // v5 — en quittant les deux vues (stimulations, thermocoagulations), la disposition d'avant est rétablie par stim3dLeave ;
        // la crise ou l'exploration ouverte reprend ensuite ses propres vues enregistrées
        if (leavingTwo && this.viewer && this.state && this.state.views && this.state.views.cells) { try { this.viewer.restoreLayout(this.state.views); if (this.viewer.onCellChange) this.viewer.onCellChange(); } catch (e) { console.warn(e); } if (SV.Scope) SV.Scope.apply(this, 'workmode'); }
      } else {
        this.setWorkMode(null);
        this.renderStageView(st, loc.view);
      }
      this.renderParcours(); this.renderSubbar(); this.rememberCtx();
      if (SV.Scope && this.ui.screen === 'work') SV.Scope.apply(this, 'go');
      if (o.scrollTop !== false) { const sc = document.querySelector('.screen:not([hidden])'); if (sc) sc.scrollTop = 0; }
      SV.Bus.emit('nav:after', this, loc, st);
    },
    renderStageView(st, view) {
      if (st.kind === 'dossier' && view === 'synthese') { this.showRaw('dossier'); this.renderDossier(); return; }
      if (st.kind === 'dossier' && view === 'imagerie') { this.showRaw('imaging'); this.renderImaging(); return; }
      if (st.kind === 'meeting') {
        this.ui.meetingId = st.id; this.showRaw('staff'); if (this.renderStaff) this.renderStaff();
        if (view === 'presenter' && this.openPresentation) this.openPresentation(st.obj);
        return;
      }
      const fn = VIEW_FN[view], box = $('scr-view');
      this.showRaw(view === 'loc' ? 'loc' : 'view');
      box.innerHTML = '';
      if (fn && this[fn]) this[fn](box, st);
      else box.innerHTML = `<div class="scr-inner"><div class="hint">Vue « ${esc(view)} » indisponible dans cette version.</div></div>`;
    },
    /** affiche une section (patients, dossier, staff, imaging, view, loc) ou l'espace de travail (work) */
    showRaw(name) {
      if (this.ui.screen === 'work' && name !== 'work') this.persistWorkspace();
      const sec = name === 'loc' ? 'view' : name;
      // réglages des coupes : propres à chaque contexte (slvKey / slvSwitch, imaging_panel.js)
      this.ui.screen = name;
      for (const s of ['patients', 'dossier', 'staff', 'imaging', 'view']) { const el = $('scr-' + s); if (!el) continue; el.hidden = s !== sec; if (s !== sec && (s === 'imaging' || s === 'view')) el.innerHTML = ''; }
      if (this.slices && this._ipHost && !this._ipHost.isConnected) { this.slices.destroy(); this.slices = null; this._ipHost = null; }
      document.body.classList.toggle('screen-open', name !== 'work');
      document.body.classList.toggle('no-dossier', !this.dossier);
      document.body.classList.toggle('at-patients', name === 'patients');
      if (name === 'patients') { this.renderPatients(); this.renderParcours(); this.renderSubbar(); }
      if (name === 'work') setTimeout(() => { this.viewer.resize(); if (this.tl && this.tl.render) this.tl.render(); }, 30);
      if (name === 'work' && this.ui.dock && this.toggleDock && !(this.slices && this._ipHost === $('sliceDock'))) this.toggleDock(true);
    },
    /** compatibilité : anciens noms d'écrans */
    showScreen(name) {
      const d = this.dossier;
      if (!d || name === 'patients') { this.showRaw('patients'); return; }
      if (name === 'dossier') return this.go({ stage: 'dossier', view: 'synthese' });
      if (name === 'imaging') return this.go({ stage: 'dossier', view: 'imagerie' });
      if (name === 'staff') { const m = (this.ui.meetingId && S.byId(d.meetings, this.ui.meetingId)) || d.meetings.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).pop(); if (m) return this.go({ stage: 'meet:' + m.id, view: 'preparer' }); this.toast('Aucun staff : « ＋ » dans la barre du parcours'); return this.go({ stage: 'dossier' }); }
      // espace de travail : la vue de travail de l'étape courante, sinon la crise ou l'exploration du contexte
      const cur = this.loc && this.currentStage();
      if (cur && this.loc && (this.loc.view === 'crise' || WORK[this.loc.view])) return this.go(this.loc);
      if (this.ctx && this.ctx.seizureId) return this.go({ seizureId: this.ctx.seizureId, view: 'crise' });
      if (this.ctx && this.ctx.explorationId) { const st = this.stageOfExploration(this.ctx.explorationId); if (st && st.kind === 'seeg') return this.go({ stage: st.key, view: 'planif' }); const z = st && S.seizuresOfExploration(d, st.id).pop(); if (z) return this.openSeizure(z.id); if (st) return this.go({ stage: st.key, view: 'crises' }); }
      // sans contexte : la dernière exploration (SEEG → planification ; sinon sa dernière crise saisie)
      const ex = S.explorationsSorted(d).pop();
      if (ex && ex.kind === 'seeg') return this.go({ stage: 'ex:' + ex.id, view: 'planif' });
      const sz = ex && S.seizuresOfExploration(d, ex.id).pop(); if (sz) return this.openSeizure(sz.id);
      return this.go({ stage: 'dossier' });
    },
    openSeizure(id) { this.go({ seizureId: id, view: 'crise' }); },
    openExploration(id, view) { const st = this.stageOfExploration(id); if (st) this.go({ stage: st.key, view: view || (st.kind === 'seeg' ? 'planif' : 'crises') }); },

    // ================================================================ modes de l'espace de travail
    /** mode de l'espace de travail ; les modules s'y branchent par SV.Bus : 'workmode:before' (mode, prev) puis
     *  'workmode:after' (mode, prev) — à la place des anciennes greffes emboîtées (8 surcharges en v4.21) */
    setWorkMode(mode) {
      const prev = this.ui.wm; SV.Bus.emit('workmode:before', this, mode, prev);
      const r = this._setWorkModeCore(mode);
      SV.Bus.emit('workmode:after', this, mode, prev);
      if (SV.Scope) SV.Scope.apply(this, 'workmode');
      return r;
    },
    _setWorkModeCore(mode) {
      const prev = this.ui.wm; this.ui.wm = mode;
      if (prev === 'stim' && mode !== 'stim' && this.ui.slv) this.ui.slv.pair = null;
      const all = ['semio', 'semioSeeg', 'plan', 'stim', 'thermo', 'quant'];
      for (const m of all) document.body.classList.toggle('wm-' + m, m === mode);
      const tools = !!mode && !['semio', 'semioSeeg'].includes(mode);
      document.body.classList.toggle('wm-tools', tools); document.body.classList.toggle('wm-seeg', !!mode && mode !== 'semio');
      if (!mode) return;
      const tabs = WM_TABS[mode] || WM_TABS.semio;
      document.querySelectorAll('#tabs [data-tab]').forEach(b => { b.hidden = !tabs.includes(b.dataset.tab); });
      document.getElementById('tabs').classList.toggle('single', tabs.length === 1);
      if (!tabs.includes(this.ui.tab) || prev !== mode) this.setTab(mode === 'semioSeeg' && prev !== mode ? 'seegsz' : tabs.includes(this.ui.tab) ? this.ui.tab : tabs[0]);
      // affichage adapté : verre, électrodes, sans réseau pour les outils SEEG ; le réseau revient en sémiologie
      if (prev !== mode && this.viewer) {
        const V3 = this.viewer;
        if (tools) for (let i = 0; i < V3.cells.length; i++) V3.setCellConfig(i, { fibers: false, nodes: false, sync: false, netLabels: false, electrodes: true, labels: true, opacity: Math.min(V3.cells[i].cfg.opacity, mode === 'plan' ? 0.55 : 0.35), frontGlass: true, sub: true }, true);
        else if (prev && !['semio', 'semioSeeg'].includes(prev)) for (let i = 0; i < V3.cells.length; i++) V3.setCellConfig(i, { fibers: true, nodes: true, sync: true, netLabels: true, opacity: 1 }, true);
        if (V3.onCellChange) V3.onCellChange();
      }
      // stimulations, thermocoagulations : coupe de l'électrode courante dans son axe, à côté de la 3D
      if ((mode === 'stim' || mode === 'thermo') && this.dossier && S.refImaging(this.dossier)) { this._dockAuto = !this.ui.dock || this._dockAuto; if (this.toggleDock) this.toggleDock(true).then(() => this.seegDockFollow && this.seegDockFollow()); }
      else if ((this._dockAuto || this._dockAutoQ) && prev && !['semio', 'semioSeeg'].includes(prev) && ['semio', 'semioSeeg', 'plan'].includes(mode)) { this._dockAuto = false; this._dockAutoQ = false; if (this.toggleDock) this.toggleDock(false); }
      else if (this._dockAuto && prev && (prev === 'stim' || prev === 'thermo')) { this._dockAuto = false; if (this.toggleDock) this.toggleDock(false); }
      setTimeout(() => this.viewer && this.viewer.resize(), 40);
    },

    // ================================================================ barre du parcours
    renderParcours() {
      const box = $('parcours'), cp = $('crPatient'); if (!box) return;
      const d = this.dossier;
      if (cp) cp.textContent = d ? (d.patient.pseudo || 'patient') + ' ▾' : '—';
      if (!d || this.ui.screen === 'patients') { box.innerHTML = ''; return; }
      const cur = this.loc ? this.loc.stage : null;
      box.innerHTML = this.parcours().map(st => `<button class="pstep k-${st.kind}${st.key === cur ? ' on' : ''}" data-key="${esc(st.key)}" title="${esc(this.stageTitle(st))}"><i class="dot s-${esc(st.status || '')}"></i>${esc(st.label)}</button>`).join('<span class="psep"></span>') + '<button class="pstep add" id="pAdd" title="Nouvelle étape : vidéo-EEG, SEEG, staff, chirurgie, suivi">＋</button>';
      box.querySelectorAll('.pstep[data-key]').forEach(b => b.onclick = () => this.go({ stage: b.dataset.key }));
      $('pAdd').onclick = e => this.addStageMenu(e.currentTarget);
      const on = box.querySelector('.pstep.on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    },
    stageTitle(st) {
      const d = this.dossier;
      if (st.kind === 'dossier') return 'Dossier du patient : synthèse, histoire clinique, bilans, imagerie, galerie';
      if (st.kind === 'meeting') return `${V.meeting[st.obj.kind]} · ${fmtDate(st.date)} · ${st.status === 'final' ? 'validé' : 'brouillon'}`;
      if (st.kind === 'procedure') return `${V.procedure[st.obj.type]}${st.date ? ' · ' + fmtDate(st.date) : ' · à dater'}`;
      if (st.kind === 'followup') return `${d.outcomes.length} évaluation${d.outcomes.length > 1 ? 's' : ''} du devenir`;
      const ex = st.obj, n = S.seizuresOfExploration(d, ex.id).length;
      return `${V.exploration[ex.kind]} · ${ex.start ? fmtDate(ex.start) : 'à dater'}${ex.end ? ' → ' + fmtDate(ex.end) : ''} · ${V.explorationStatus[ex.status] || ''} · ${n} crise${n > 1 ? 's' : ''}`;
    },
    addStageMenu(anchor) {
      const d = this.dossier, r = anchor.getBoundingClientRect();
      this.popupMenu([{ head: 'Nouvelle étape du parcours' },
        { label: 'Vidéo-EEG de scalp (phase 1)', run: () => this.newExplorationStage('phase1') },
        { label: 'SEEG', run: () => this.newExplorationStage('seeg') },
        { label: 'Staff (réunion de concertation)', run: () => this.newMeeting() },
        { label: 'Chirurgie ou autre procédure', run: () => { const p = S.addProcedure(d, { date: '' }); this.touch(); this.go({ stage: 'proc:' + p.id }); } },
        { label: 'Suivi (évaluation du devenir)', run: () => { const p = d.procedures.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).pop(); S.addOutcome(d, { procedureId: p ? p.id : null }); this.touch(); this.go({ stage: 'followup' }); } },
        { label: 'Autre exploration', run: () => this.newExplorationStage('other') }], Math.min(r.left, window.innerWidth - 330), r.bottom + 4);
    },
    newExplorationStage(kind) {
      const d = this.dossier, hasPlan = S.implantations(d).length;
      const ex = S.addExploration(d, { kind, status: kind === 'seeg' ? 'planned' : 'ongoing', start: kind === 'seeg' ? '' : S.today() }); S.addSession(d, ex.id, { date: ex.start }); this.touch();
      if (kind === 'seeg' && hasPlan && this.implantChooser) {
        const open = S.latestHypotheses(d).filter(H => ['proposed', 'testing', 'confirmed'].includes(H.status));
        this.implantChooser({ toEx: ex, hyps: open, seizures: S.allSeizures(d).filter(z => z.events.length).map(sz => ({ sz })), title: `Schéma d’implantation de ${ex.label}`, onDone: () => this.go({ stage: 'ex:' + ex.id, view: 'planif' }), onCancel: () => this.go({ stage: 'ex:' + ex.id, view: 'planif' }) });
      }
      this.go({ stage: 'ex:' + ex.id, view: kind === 'seeg' ? 'planif' : 'crises' });
    },

    // ================================================================ sous-barre : vues de l'étape
    renderSubbar() {
      const bar = $('subbar'); if (!bar) return;
      const d = this.dossier, st = this.currentStage();
      document.body.classList.toggle('has-subbar', !!(d && st && this.ui.screen !== 'patients'));
      if (!d || !st || this.ui.screen === 'patients') { bar.innerHTML = ''; this.updateReportButton(); return; }
      const views = VIEWS[st.kind] || VIEWS.dossier, cur = this.loc.view === 'crise' ? 'crises' : this.loc.view;
      let extra = '';
      if (this.loc.view === 'crise' && this.ctx && this.ctx.seizureId) {
        const ex = st.obj, list = S.seizuresOfExploration(d, ex.id), i = list.findIndex(z => z.id === this.ctx.seizureId), sz = list[i];
        extra = `<span class="sb-sz"><button class="mini-btn" data-a="szprev" title="crise précédente"${i <= 0 ? ' disabled' : ''}>‹</button><b>${esc(sz ? sz.label : '')}</b> <span class="muted">${i + 1}/${list.length}</span><button class="mini-btn" data-a="szprev2" hidden></button><button class="mini-btn" data-a="sznext" title="crise suivante"${i >= list.length - 1 ? ' disabled' : ''}>›</button></span>`;
      }
      const actions = [];
      if (st.kind === 'meeting') actions.push(`<button class="mini-btn${this.loc.view === 'presenter' ? '' : ' primary'}" data-a="present" title="Diaporama plein écran (F2)">▶ Présenter</button>`);
      const status = st.kind === 'seeg' || st.kind === 'phase1' || st.kind === 'other' ? `<select class="sb-status" title="statut de l’exploration">${Object.entries(V.explorationStatus).map(([k, l]) => `<option value="${k}"${st.obj.status === k ? ' selected' : ''}>${l}</option>`).join('')}</select>` : '';
      bar.innerHTML = `<div class="sb-title"><b>${esc(st.kind === 'dossier' ? (d.patient.pseudo || 'Dossier') : st.label)}</b><span class="muted">${esc(st.kind === 'dossier' ? this.patientLine() : st.kind === 'meeting' ? V.meeting[st.obj.kind] : st.kind === 'procedure' ? V.procedure[st.obj.type] : st.kind === 'followup' ? 'devenir' : (st.date ? fmtDate(st.date) : 'à dater'))}</span>${status}</div>
        <nav class="sb-tabs">${views.map(([k, l], i) => `<button data-v="${k}" class="${k === cur ? 'on' : ''}" title="${esc(VIEW_HINT[k] || '')}">${st.kind === 'seeg' ? `<small>${i + 1}</small>` : ''}${esc(l)}</button>`).join('')}</nav>${extra}<span class="spacer"></span>${actions.join('')}`;
      bar.querySelectorAll('.sb-tabs [data-v]').forEach(b => b.onclick = () => this.go({ stage: st.key, view: b.dataset.v }));
      const ss = bar.querySelector('.sb-status'); if (ss) ss.onchange = () => { st.obj.status = ss.value; this.touch('exploration', st.obj.id, st.obj.label); this.renderParcours(); };
      const A = a => bar.querySelector(`[data-a=${a}]`);
      if (A('szprev')) { const list = S.seizuresOfExploration(d, st.obj.id), i = list.findIndex(z => z.id === this.ctx.seizureId); A('szprev').onclick = () => { if (i > 0) this.openSeizure(list[i - 1].id); }; A('sznext').onclick = () => { if (i < list.length - 1) this.openSeizure(list[i + 1].id); }; }
      if (A('newsz')) A('newsz').onclick = () => this.newSeizureIn(st.obj);
      if (A('present')) A('present').onclick = () => this.go({ stage: st.key, view: 'presenter' });
      this.updateReportButton();
    },
    patientLine() {
      const P = this.dossier.patient, age = P.birthYear ? new Date().getFullYear() - (+P.birthYear) : null;
      return [P.sex === 'F' ? 'F' : P.sex === 'M' ? 'M' : '', age != null ? age + ' ans' : '', P.handedness ? V.handedness[P.handedness] : '', S.onsetText(P) ? 'premières crises à ' + S.onsetText(P) : ''].filter(Boolean).join(' · ');
    },
    /** nouvelle crise dans la dernière séance de l'exploration (une séance est créée s'il n'y en a pas) */
    newSeizureIn(ex) {
      const d = this.dossier, ses = S.sessionsOf(d, ex.id).pop() || S.addSession(d, ex.id, { date: S.today() });
      const sz = S.addSeizure(d, ses.id, { datetime: this.defaultDT(ses.date) }); if (S.renumberSeizures) S.renumberSeizures(d, ex.id); this.touch(); this.openSeizure(sz.id);
    },
    /** bouton « Rapport » : rapport de l'étape ouverte */
    updateReportButton() {
      const b = $('btnReport'); if (!b) return; const st = this.currentStage();
      b.disabled = !this.dossier; b.hidden = !this.dossier || this.ui.screen === 'patients';
      b.textContent = !st || st.kind === 'dossier' || st.kind === 'procedure' || st.kind === 'followup' ? 'Rapport du dossier' : st.kind === 'meeting' ? 'Compte rendu du staff' : st.kind === 'seeg' ? 'Rapport SEEG' : 'Rapport ' + st.label;
    },
    reportForStage() {
      const st = this.currentStage(); if (!this.dossier) return;
      if (st && st.kind === 'meeting') return this.reportDialog({ staff: st.obj });
      if (st && st.kind === 'seeg') { if (this.seegReportDialog) return this.seegReportDialog(st.obj); }
      if (st && (st.kind === 'phase1' || st.kind === 'other')) return this.reportDialog({ exploration: st.obj });
      return this.reportDialog();
    },

    // ================================================================ menus du patient et « ⋯ »
    patientMenu(anchor) {
      const d = this.dossier, r = anchor.getBoundingClientRect();
      const items = [{ head: d ? d.patient.pseudo : 'Aucun patient' }];
      if (d) items.push({ label: 'Exporter le dossier complet (.episcope)', run: () => this.exportBundleUI(null, false) }, { label: 'Exporter le dossier léger (sans les images d’origine)', run: () => this.exportBundleUI(null, true) }, { label: 'Importer des images NIfTI…', run: () => { this.go({ stage: 'dossier', view: 'imagerie' }); $('fileNifti').value = ''; $('fileNifti').click(); } }, { sep: true }, { label: 'Fermer le dossier', run: () => this.closeDossier() });
      items.push({ label: 'Liste des patients', run: () => this.showRaw('patients') });
      this.popupMenu(items, Math.max(8, r.left), r.bottom + 4);
    },
    /** v5 — densité : compacte (portable 1366 px), automatique (selon la fenêtre), large (écran 27″ ou projection) ; mémorisée sur ce poste */
    densityMenu(anchor) {
      const r = anchor.getBoundingClientRect(), set = v => { if (v) document.documentElement.dataset.density = v; else delete document.documentElement.dataset.density; try { localStorage.setItem('sv_density', v || ''); } catch (e) { } setTimeout(() => { if (this.viewer) this.viewer.resize(); if (this.tl && this.tl.render) this.tl.render(); }, 60); };
      this.popupMenu([{ head: 'Densité de l’affichage' }, { label: 'Compacte — portable, petit écran', run: () => set('compact') }, { label: 'Automatique — selon la taille de la fenêtre', run: () => set('') }, { label: 'Large — grand écran, écran de projection', run: () => set('large') }], Math.max(8, r.left), r.bottom + 4);
    },
    moreMenu(anchor) {
      const r = anchor.getBoundingClientRect(), L = SV.Library;
      this.popupMenu([{ head: 'EpiScope' }, { label: 'Importer un dossier (.episcope) ou une crise (.json)…', run: () => { $('fileOpen').value = ''; $('fileOpen').click(); } },
        { label: 'Exporter la cohorte (tables CSV, tous les patients)', run: () => this.exportCohort() }, { label: 'Exporter la crise ouverte (.json)', run: () => this.saveCase() },
        { sep: true }, { label: 'Base de référence (signes, priors, liens)…', run: () => this.openDB() }, { label: 'Mode présentation de la vue 3D (F2)', run: () => this.present() }, { label: 'Densité de l’affichage : ' + ({ compact: 'compacte (portable)', large: 'large (grand écran, projection)' }[document.documentElement.dataset.density] || 'automatique') + '…', run: () => this.densityMenu(anchor) }, { label: 'Manuel d’utilisation', run: () => this.openManual && this.openManual() }, { label: 'Crédits et sources…', run: () => this.openCredits && this.openCredits() }, { label: 'Mentions légales…', run: () => this.openLegal && this.openLegal() },
        { sep: true }, { head: 'Langue' }, ...[['fr', 'Français'], ['en', 'English']].map(([k, l]) => ({ label: (SV.I18n.lang === k ? '✓ ' : '') + l, run: () => { if (SV.I18n.lang !== k) SV.I18n.set(k); } })),
        { sep: true }, { head: 'Thème' }, ...[['auto', 'automatique (celui du système)'], ['light', 'clair'], ['dark', 'sombre']].map(([k, l]) => ({ label: ((document.documentElement.dataset.themePref || 'auto') === k ? '✓ ' : '') + l, run: () => this.setTheme(k) })),
        { sep: true }, { label: 'Utilisateurs… (moi : ' + ((SV.People && SV.People.me() && SV.People.label(SV.People.me(), true)) || L.user || '—') + ')', run: () => this.peopleDialog() }], r.right - 330, r.bottom + 4);
    },
    /** ferme le dossier ouvert (retour à la liste) */
    async closeDossier() {
      if (this.dossier) { this.persistWorkspace(); await this.flushSave(); await SV.Library.unlock(this.dossier);
        // dossier fermé explicitement : sa prochaine ouverture se fait sur Dossier › Synthèse (pas sur la dernière vue)
        try { const id = this.dossier.id, cl = JSON.parse(localStorage.getItem('sv_closed') || '[]').filter(x => x !== id); cl.push(id); localStorage.setItem('sv_closed', JSON.stringify(cl.slice(-200))); } catch (e) { } }
      this.dossier = null; this.ctx = null; this.loc = null; this.patientAnat = null; this._volCache = new Map(); this.ui.slv = null; this._slvKey = null;
      if (this.slices) { this.slices.destroy(); this.slices = null; this._ipHost = null; } if (this.ui.dock && this.toggleDock) this.toggleDock(false);
      if (this.setAnatomy) this.setAnatomy('template', true);
      this._loading = true; this.newCase(true); this._loading = false;
      try { localStorage.removeItem('sv_last'); } catch (e) { }
      this.setSaveState('none'); this.showRaw('patients');
    },
  };
  M.VIEWS = VIEWS;
  Object.assign(SV.app, M);
  SV.Nav = { VIEWS, WORK, WM_TABS };
})(window.SV = window.SV || {});
