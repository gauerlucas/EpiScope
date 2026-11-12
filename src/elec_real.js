/* EpiScope — elec_real.js : électrodes réelles (scanner post-implantation) dans le dossier et dans les vues.
 *   - écran Imagerie : détection automatique (SV.CTElec.detect, dans un worker), saisie à la Brainstorm (pointe, entrée,
 *     modèle → plots au pas du modèle ; « affiner » ajuste la droite sur le métal), noms appariés au schéma prévu,
 *     validation dans l'exploration SEEG (spec.real) et export BIDS (…_electrodes.tsv, …_coordsystem.json) ;
 *   - construction des électrodes pour la vue 3D : réelles dans l'anatomie du patient, ramenées sur le gabarit par la
 *     transformation patient → gabarit, ou schéma prévu porté sur le patient (transformation inverse).
 * Une électrode réelle garde l'identifiant de l'électrode prévue : stimulations, thermocoagulations et quantifications
 * (liées par nom et identifiant) suivent sans ressaisie.                                                             */
(function (SV) {
  'use strict';
  const $ = id => document.getElementById(id), S = SV.Store, L = SV.Library, M4 = SV.Mat4;
  const esc = SV.U.esc;
  const D = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], unit = a => { const n = Math.hypot(...a) || 1; return a.map(x => x / n); };
  const MODEL_N = [5, 8, 10, 12, 15, 18];

  /** électrode (format du viewer et de seeg_ui) à partir de plots en coordonnées monde ; vol.labelAt(x, y, z) */
  function realElectrode(spec, real, contactsW, vol, atlas) {
    const tip = real.tipW || contactsW[0], entry = real.entryW || contactsW[contactsW.length - 1], dir = unit(sub(entry, tip));
    const contacts = [], regions = new Map();
    contactsW.forEach((c, i) => {
      const votes = {}; for (const d of [-0.8, 0, 0.8]) { const l = vol ? vol.labelAt(c[0] + dir[0] * d, c[1] + dir[1] * d, c[2] + dir[2] * d) : 0; votes[l] = (votes[l] || 0) + 1; }
      const label = +Object.keys(votes).sort((a, b) => votes[b] - votes[a])[0]; contacts.push({ k: i + 1, xyz: c, label });
      if (label >= 1 && label <= 162) regions.set(label, (regions.get(label) || 0) + 1);
    });
    const n = contacts.length, EM = SV.Electrodes, known = EM.modelById(spec.model), model = known && known.n === n ? known.id : ((EM.modelFor(spec.maker, n) || {}).id || (spec.maker === 'Alcis' ? `Alcis 2069-EPC-${String(n).padStart(2, '0')}C-35` : `DIXI D08-${String(n).padStart(2, '0')}AM`));
    return Object.assign({}, spec, { tip, entry: D(entry, tip) > 1 ? entry : [tip[0] + dir[0] * 3.5 * n, tip[1] + dir[1] * 3.5 * n, tip[2] + dir[2] * 3.5 * n], dir, length: D(tip, entry), model, nContacts: n, contacts, regions, issues: [], entryLabel: 0, obliquity: Math.round(Math.acos(Math.min(1, Math.abs(dir[0]))) * 180 / Math.PI), real: true });
  }
  const mapPts = (T, pts) => pts.map(p => M4.apply(T, p[0], p[1], p[2]));

  const M = {
    anatMode: 'template',
    /** électrode affichée selon l'anatomie choisie ; appelé par rebuildElectrodes */
    buildElectrodeFor(spec, space) {
      const A = this.patientAnat, patient = (space || this.anatMode) === 'patient' && A;
      if (spec.real && spec.real.contacts && spec.real.contacts.length) {
        const r = spec.real;
        if (A) {   // plots réels (monde du T1) → espace de la vue ; régions lues dans la parcellation du patient
          const T = patient ? A.toDisplay : A.toTemplate, Ti = patient ? A.fromDisplay : A.fromTemplate, lab = { labelAt: (x, y, z) => { const q = M4.apply(Ti, x, y, z); return A.labelWorld.labelAt(q[0], q[1], q[2]); } };
          return realElectrode(spec, { tipW: M4.apply(T, ...r.tip), entryW: M4.apply(T, ...r.entry) }, mapPts(T, r.contacts), lab, this.atlas);
        }
        if (!spec.target) return null;   // électrode réelle sans anatomie : pas de position sur le gabarit
      }
      // trajectoire chirurgicale importée (ROSA, CSV) : plots au pas du modèle depuis la cible, dans le monde du T1
      if (spec.plan && spec.plan.tip && A) {
        const p = spec.plan, dir = unit(sub(p.entry, p.tip)), n = p.n || MODEL_N.find(m => 1 + (m - 1) * 3.5 >= D(p.tip, p.entry) - 3) || 18;
        const T = patient ? A.toDisplay : A.toTemplate, Ti = patient ? A.fromDisplay : A.fromTemplate, lab = { labelAt: (x, y, z) => { const q = M4.apply(Ti, x, y, z); return A.labelWorld.labelAt(q[0], q[1], q[2]); } };
        const pe = realElectrode(spec, { tipW: M4.apply(T, ...p.tip), entryW: M4.apply(T, ...p.entry) }, mapPts(T, SV.CTElec.contacts(p.tip, dir, n)), lab, this.atlas);
        return Object.assign(pe, { real: false, planned: true, surgical: true });
      }
      if (!spec.target) return null;
      const e = SV.Electrodes.build(spec, this.atlas, this.vol); if (!e || !patient) return e;
      // schéma prévu (gabarit) porté sur l'anatomie du patient (gabarit → monde → affichage)
      const Ti = A.dispFromTemplate, cs = e.contacts.map(c => M4.apply(Ti, ...c.xyz));
      const pe = realElectrode(spec, { tipW: M4.apply(Ti, ...e.tip), entryW: M4.apply(Ti, ...e.entry) }, cs, A.labelVol, this.atlas);
      return Object.assign(pe, { real: false, planned: true, model: e.model, issues: e.issues });
    },

    // ================================================================ carte « Électrodes réelles » (écran Imagerie)
    seegExplorations() { return S.explorationsSorted(this.dossier).filter(e => e.kind === 'seeg'); },
    /** exploration SEEG la plus probable pour un scanner (dates), sinon la dernière */
    explorationForCT(ct) {
      const ex = this.seegExplorations(); if (!ex.length) return null;
      return ex.find(e => e.ctImageId === ct.id) || ex.filter(e => !ct.date || !e.start || String(e.start) <= String(ct.date)).pop() || ex[ex.length - 1];
    },
    renderElectrodeCard(box) {
      const d = this.dossier, cts = d.imaging.filter(x => x.modality === 'CT');
      if (!cts.length) { box.innerHTML = '<div class="hint">Ajoutez le scanner post-implantation (CT) : il est recalé sur le T1, puis les électrodes sont détectées (seuil du métal, droites, plots au pas du modèle) et nommées d’après le schéma prévu.</div>'; return; }
      const W = this.ui.ce = this.ui.ce || {}; if (!W.ctId || !S.byId(d.imaging, W.ctId)) W.ctId = (cts.find(x => x.timepoint === 'postimplant') || cts[0]).id;
      const ct = S.byId(d.imaging, W.ctId), exs = this.seegExplorations(); if (!W.exId || !S.byId(d.explorations, W.exId)) W.exId = (this.explorationForCT(ct) || {}).id;
      const ex = W.exId && S.byId(d.explorations, W.exId), det = ex && ex.ctDetect && ex.ctDetect.imagingId === ct.id ? ex.ctDetect : null;
      const planned = ex ? ex.electrodes.filter(e => e.target || e.real || (e.plan && e.plan.tip)).map(e => e.name) : [];
      const inLoc = this.ui.screen === 'loc';   // SEEG › Localisation : scanner et exploration choisis par l'étape (carte 1)
      box.innerHTML = `${inLoc ? '' : `<div class="form row4"><label class="span2">Scanner <select id="ceCT">${cts.map(x => `<option value="${x.id}"${x.id === ct.id ? ' selected' : ''}>${esc(S.V.timepoint[x.timepoint])} ${esc(x.date)}</option>`).join('')}</select></label><label class="span2">Exploration <select id="ceEx">${exs.map(e => `<option value="${e.id}"${ex && e.id === ex.id ? ' selected' : ''}>${esc(e.label)}</option>`).join('') || '<option value="">(créez une exploration SEEG)</option>'}</select></label></div>`}
        ${!ct.coreg || !ct.coreg.T ? '<div class="note">Le scanner n’est pas encore recalé sur le T1 de référence : « recaler sur le T1 » (étape 1, ci-dessus).</div>' : ''}
        ${ex ? `<div class="ctrl-row ce-maker"><label title="marque des électrodes implantées : les modèles proposés (plots, pas, groupes espacés, haute résolution) en dépendent">marque <select id="ceMaker">${Object.entries(SV.Electrodes.MAKERS).map(([k, l]) => `<option value="${k}"${this.exMaker(ex) === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label><label title="convention du centre pour le suffixe de côté dans les noms (prime, D/G ou aucun). Le côté lui-même est géométrique : sortie du crâne et majorité des plots, jamais le suffixe.">noms <select id="ceSideConv">${Object.entries(SV.Side.CONV).map(([k, l]) => `<option value="${k}"${this.sideConv(ex) === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label><span class="muted small">pointe + entrée + modèle → plots aux vraies cotes du catalogue</span></div>` : ''}
        <div class="btnrow"><button id="ceDetect" class="${det && det.items.length ? '' : 'primary'}"${!ex ? ' disabled' : ''}>${det && det.items.length ? 'Détecter à nouveau' : 'Détecter les électrodes'}</button><button id="ceManual"${!ex ? ' disabled' : ''} title="Brainstorm : cliquez la pointe puis l’entrée dans les coupes. Une électrode déjà reconstruite au même endroit (ou du même nom) est remplacée, pas doublée.">+ à la main</button>${det && det.items.length ? `<button id="ceValidate" class="${!det.validated || det.dirty ? 'primary' : ''}" title="les électrodes de la liste deviennent les électrodes réelles de ${esc(ex.label)} (mêmes identifiants que le schéma : stimulations, crises et thermocoagulations suivent)">${det.validated && !det.dirty ? '✓ enregistrées dans ' : 'Enregistrer dans '}${esc(ex.label)}</button>` : ''}</div>
        ${W.pick ? `<div class="note pickmsg">${W.redoName ? `Refaire <b>${esc(W.redoName)}</b> : ` : ''}${W.pick === 'tip' ? 'cliquez la <b>pointe</b> (plot le plus profond) dans une coupe' : 'cliquez le <b>point d’entrée</b> (dernier plot ou sortie du cerveau)'} · <a href="#" id="cePickX">annuler</a> (Échap)</div>` : ''}
        <div id="ceList"></div>
        ${ex && ex.electrodes.some(e => e.real) ? `<div class="hint" style="margin-top:6px">${ex.electrodes.filter(e => e.real).length} électrode(s) réelle(s) validée(s) dans ${esc(ex.label)}${ex.ctDate ? ' (' + esc(SV.U.fmtDate(ex.ctDate.slice(0, 10))) + ')' : ''} · <a href="#" id="ceBids">export BIDS (electrodes.tsv)</a></div>` : ''}`;
      if ($('ceCT')) $('ceCT').onchange = e => { W.ctId = e.target.value; W.exId = null; this.renderElectrodeCard(box); this.sliceMarkers(); };
      if ($('ceMaker')) $('ceMaker').onchange = e => { ex.maker = e.target.value; for (const sp of ex.electrodes) if (!sp.makerOwn) sp.maker = ex.maker; const items = det ? det.items : []; for (const it of items) { if (it.maker === ex.maker) it.maker = null; if (it.maker) continue; if (it.model && (SV.Electrodes.modelById(it.model) || {}).maker !== ex.maker) { it.model = null; this.locApplyModel(ex, it, null); } } this.touch('exploration', ex.id, 'marque ' + ex.maker); this.renderElectrodeCard(box); this.locRefreshSlices && this.locRefreshSlices(); };
      if ($('ceEx')) $('ceEx').onchange = e => { W.exId = e.target.value; this.renderElectrodeCard(box); this.sliceMarkers(); };
      if ($('ceSideConv')) $('ceSideConv').onchange = e => { this.setSideConv(ex, e.target.value); this.touch('exploration', ex.id, 'convention des noms'); this.renderElectrodeCard(box); };
      if ($('ceDetect')) $('ceDetect').onclick = () => this.detectElectrodes(ct, ex);
      if ($('ceManual')) $('ceManual').onclick = () => { W.pick = 'tip'; W.manual = {}; W.redo = null; W.redoName = null; this.slices && (this.slices.pickMode = 'elec'); this.renderElectrodeCard(box); };
      if ($('cePickX')) $('cePickX').onclick = ev => { ev.preventDefault(); this.cancelElecPick(); };
      if ($('ceValidate')) $('ceValidate').onclick = () => this.validateElectrodes(ct, ex);
      if ($('ceBids')) $('ceBids').onclick = e => { e.preventDefault(); this.exportElectrodesBids(ex, true); };
      this.renderLocList($('ceList'), ct, ex, box);
      if (inLoc && this.renderLocMatch) this.renderLocMatch(ex);
    },
    /** marque des électrodes d'une exploration (réglée ici ou majoritaire dans ses spécifications ; DIXI par défaut) */
    /** convention du centre pour le suffixe de côté des noms d'électrodes : celle de l'exploration, sinon celle mémorisée sur ce poste, sinon prime */
    sideConv(ex) { ex = ex || (this.ctx && this.dossier && SV.Store.byId(this.dossier.explorations, this.ctx.explorationId)) || null; return (ex && ex.sideConv) || (localStorage.getItem('sv_sideconv') || 'prime'); },
    setSideConv(ex, v) { v = SV.Side.CONV[v] ? v : 'prime'; if (ex) ex.sideConv = v; try { localStorage.setItem('sv_sideconv', v); } catch (e) { } },
    /** côté d'implantation d'une électrode reconstruite (sortie du crâne et majorité des plots ; la pointe seule ne décide pas) */
    elecSideOf(o) { const A = this.patientAnat; return SV.Side.of(o, A && A.lateral ? A.lateral : null); },
    /** v5.1 — côté des électrodes localisées relu sur leur géométrie (point d'entrée, sinon majorité des plots, par rapport à la
     *  ligne médiane du patient) : corrige les côtés venus du nom prévu ou de la seule pointe (une pointe qui franchit à peine
     *  la ligne médiane donnait « droite »). Un côté choisi à la main (liste de la localisation) est gardé. */
    fixElectrodeSides(d) {
      const A = this.patientAnat; if (!A || !d) return 0; let n = 0;
      for (const ex of d.explorations || []) for (const s of ex.electrodes || []) {
        if (!s.real || !s.real.contacts || !s.real.contacts.length || s.hemiManual) continue;
        const g = this.elecSideOf(s.real); if (g && g !== s.hemi) { s.hemi = g; n++; }
      }
      if (n) { this.touch('patient', null, `côté de ${n} électrode${n > 1 ? 's' : ''} relu sur la géométrie`); if (this.rebuildElectrodes) this.rebuildElectrodes(); }
      return n;
    },
    exMaker(ex) { if (!ex) return 'DIXI'; if (ex.maker) return ex.maker; const n = ex.electrodes.filter(e => e.maker === 'Alcis').length; return n > ex.electrodes.length / 2 ? 'Alcis' : 'DIXI'; },
    /** modèle d'un élément reconstruit : choisi, sinon le modèle standard de la marque pour son nombre de plots */
    /** marque d'une électrode reconstruite : la sienne (it.maker, v5 : une électrode peut venir d'une autre marque que le
     *  reste de l'implantation), sinon celle de l'exploration */
    locMakerOf(ex, it) { return (it && it.maker) || this.exMaker(ex); },
    locModelOf(ex, it) { const E = SV.Electrodes; return (it.model && E.modelById(it.model)) || E.modelFor(this.locMakerOf(ex, it), it.n) || null; },
    /** applique un modèle à un élément : nombre de plots et plots aux cotes du catalogue, depuis la pointe le long de l'axe */
    locApplyModel(ex, it, modelId) {
      const E = SV.Electrodes, m = modelId ? E.modelById(modelId) : this.locModelOf(ex, it); it.model = modelId || null;
      if (m && modelId) it.maker = m.maker === this.exMaker(ex) ? null : m.maker;   // modèle d'une autre marque : la marque suit l'électrode
      if (m) it.n = m.n; const offs = m ? m.offsets : E.offsetsOf(null, it.n);
      it.contacts = SV.CTElec.contacts(it.tip, it.dir, it.n, offs); it.edited = false; if (m && D(it.tip, it.entry) < m.span) it.entry = [it.tip[0] + it.dir[0] * m.span, it.tip[1] + it.dir[1] * m.span, it.tip[2] + it.dir[2] * m.span];
      it.length = D(it.tip, it.entry); return m;
    },
    /** CT dans le monde de la référence : volume + transformation de recalage */
    async ctForDetection(ct) { const vol = await this.imagingVolume(ct); return { vol, T: ct.coreg && ct.coreg.T ? ct.coreg.T : null }; },
    async detectElectrodes(ct, ex) {
      ex = ex || this.explorationForCT(ct); if (!ex) { this.toast('Créez d’abord une exploration SEEG dans le dossier'); return; }
      const job = this.jobStart('Électrodes sur le scanner');
      try {
        const { vol, T } = await this.ctForDetection(ct), A = this.patientAnat;
        const optsD = { T, mask: this.anatBrainMask ? await this.anatBrainMask(4) : null, center: A && A.center ? A.center : SV.Vol.center(await this.imagingVolume(S.refImaging(this.dossier))) };
        const r = SV.Work.available ? await SV.Work.run(['nifti', 'ctelec'], 'CTElec.detect', [vol, optsD], [], p => job.progress(p)) : SV.CTElec.detect(vol, optsD, p => job.progress(p));
        const items = r.electrodes.map((e, i) => ({ id: 'ct' + i, name: '', hemi: '', tip: e.tip, entry: e.entry, dir: e.dir, length: e.length, n: e.n, nObs: e.nObs, contacts: e.contacts, score: e.score, manual: false }));
        this.matchToPlan(items, ex);
        ex.ctDetect = { imagingId: ct.id, date: S.now(), threshold: r.threshold, items }; ex.ctImageId = ct.id;
        S.log(this.dossier, 'compute', 'exploration', ex.id, `${items.length} électrodes détectées sur le scanner`); this.touch();
        job.done(`${items.length} électrodes détectées en ${(r.ms / 1000).toFixed(1)} s`);
        this.ui.ce = Object.assign(this.ui.ce || {}, { ctId: ct.id, exId: ex.id });
        if (this.refreshImagingScreen) this.refreshImagingScreen(); else if (this.ui.screen === 'imaging') this.renderImaging();
      } catch (e) { console.error(e); job.fail(e.message); }
    },
    /** noms : appariement aux électrodes prévues (pointe et entrée portées sur le patient), sinon côté + trajectoire voisine */
    matchToPlan(items, ex, taken0) {
      const A = this.patientAnat, plan = [];
      for (const spec of ex.electrodes) {
        if (spec.plan && spec.plan.tip) { plan.push({ spec, tip: spec.plan.tip, entry: spec.plan.entry, n: spec.plan.n || 12 }); continue; }   // trajectoire chirurgicale (monde du T1)
        if (!spec.target) continue; const e = SV.Electrodes.build(spec, this.atlas, this.vol); if (!e) continue;
        if (A && A.fromTemplate) { const Ti = M4.from(A.fromTemplate); plan.push({ spec, tip: M4.apply(Ti, ...e.tip), entry: M4.apply(Ti, ...e.entry), n: e.nContacts }); }
        else plan.push({ spec, tip: null, entry: null, n: e.nContacts });
      }
      const pairs = [];
      if (plan.some(p => p.tip)) for (let i = 0; i < items.length; i++) for (let j = 0; j < plan.length; j++) { const it = items[i], p = plan[j]; if (!p.tip) continue; const du = unit(sub(p.entry, p.tip)), cos = Math.abs(du[0] * it.dir[0] + du[1] * it.dir[1] + du[2] * it.dir[2]); pairs.push({ i, j, c: 0.5 * D(it.tip, p.tip) + 0.5 * D(it.entry, p.entry) + 25 * (1 - cos) }); }
      pairs.sort((a, b) => a.c - b.c); const ui = new Set(), uj = new Set();
      for (const pr of pairs) { if (ui.has(pr.i) || uj.has(pr.j) || pr.c > 28) continue; ui.add(pr.i); uj.add(pr.j); const it = items[pr.i], p = plan[pr.j]; it.name = p.spec.name; it.planId = p.spec.id; it.plan = 'prévue ' + p.spec.name; it.hemiGeo = this.elecSideOf(it); it.hemi = it.hemiGeo || p.spec.hemi; if (Math.abs(it.nObs - p.n) <= 3 && MODEL_N.includes(p.n)) { it.n = p.n; it.contacts = SV.CTElec.contacts(it.tip, it.dir, it.n); } }   // v5.2 : côté de la géométrie (point d'entrée, plots), pas celui du nom prévu
      // sans correspondance : côté (abscisse par rapport à la ligne médiane du patient) + numéro
      const taken = new Set([...(taken0 || []), ...ex.electrodes.map(e => e.name), ...items.map(x => x.name).filter(Boolean)]); let k = 1;
      const conv = this.sideConv(ex); for (const it of items) if (!it.name) { it.hemi = it.hemiGeo = this.elecSideOf(it); let nm; do { nm = SV.Side.name('E' + (k++), it.hemi, conv); } while (taken.has(nm)); it.name = nm; taken.add(nm); }
    },
    async refineItem(ct, it) {
      const { vol, T } = await this.ctForDetection(ct);
      const mdl = it.model ? SV.Electrodes.modelById(it.model) : null;
      const r = SV.CTElec.refine(vol, { T, threshold: (this.dossier.explorations.find(e => e.ctDetect && e.ctDetect.imagingId === ct.id) || { ctDetect: {} }).ctDetect.threshold, model: mdl ? { offsets: mdl.offsets, hd: mdl.hd } : null }, it.tip, it.entry);
      if (!r.refined) { this.toast('Pas assez de métal autour du segment : vérifiez la pointe et l’entrée', 4000); return; }
      it.tip = r.tip; it.dir = r.dir; it.entry = r.entry; it.length = D(r.tip, r.entry); if (!it.manualN) it.nObs = r.nObs; const m = it.model ? SV.Electrodes.modelById(it.model) : null; it.contacts = SV.CTElec.contacts(it.tip, it.dir, it.n, m ? m.offsets : null); this.touch(); this.toast(m ? `Droite ajustée sur le scanner, plots posés aux cotes du modèle ${m.id}` : 'Droite ajustée sur le scanner', 2500);
    },
    /** saisie manuelle (Brainstorm) : clic sur la pointe puis sur l'entrée */
    async onSlicePick(p) {
      const W = this.ui.ce || {}; if (!W.pick) return;
      const d = this.dossier, ex = S.byId(d.explorations, W.exId), ct = S.byId(d.imaging, W.ctId); if (!ex || !ct) return;
      if (W.pick === 'tip') { W.manual = { tip: p }; W.pick = 'entry'; this.renderElectrodeCard($('imElec')); return; }
      const tip = W.manual.tip, entry = p, dir = unit(sub(entry, tip)), len = D(tip, entry), n = MODEL_N.find(m => 1 + (m - 1) * 3.5 >= len - 2) || 18;
      const det = ex.ctDetect && ex.ctDetect.imagingId === ct.id ? ex.ctDetect : (ex.ctDetect = { imagingId: ct.id, date: S.now(), items: [] });
      const it = { id: 'm' + Date.now().toString(36), name: '', tip, entry, dir, length: len, n, nObs: n, contacts: SV.CTElec.contacts(tip, dir, n), score: 1, manual: true };
      await this.refineItem(ct, it);
      // une électrode refaite (pointe + entrée) remplace sa reconstruction : ligne choisie (« refaire »), sinon même
      // trajectoire, sinon même nom d'après le schéma — jamais deux noms pour une même électrode
      if (!det.items.length && this.locSeedDet) this.locSeedDet(ex, ct, det);
      let old = W.redo ? det.items.find(x => 'd:' + x.id === W.redo || (x.planId && 'r:' + x.planId === W.redo)) : null;
      if (!old) { let bc = 18; for (const x of det.items) { if (!x.tip || !x.entry) continue; const c = 0.5 * D(x.tip, it.tip) + 0.5 * D(x.entry, it.entry) + 25 * (1 - Math.abs(x.dir[0] * it.dir[0] + x.dir[1] * it.dir[1] + x.dir[2] * it.dir[2])); if (c < bc) { bc = c; old = x; } } }
      if (!old) { this.matchToPlan([it], ex, det.items.map(x => x.name)); old = det.items.find(x => (it.planId && x.planId === it.planId) || x.name === it.name) || null; }
      if (old) {
        Object.assign(old, { tip: it.tip, entry: it.entry, dir: it.dir, length: it.length, n: it.n, nObs: it.nObs, contacts: it.contacts, score: 1, manual: true, edited: false, status: '', checked: false });
        W.sel = det.items.indexOf(old); this.toast(`${old.name} refaite (pointe + entrée) : la reconstruction précédente est remplacée`, 4000);
      } else { det.items.push(it); W.sel = det.items.length - 1; this.toast(`${it.name} ajoutée (${it.n} plots)`, 2500); }
      det.dirty = true; W.pick = null; W.redo = null; W.redoName = null; if (this.slices) this.slices.pickMode = null; this.touch(); this.renderElectrodeCard($('imElec')); this.sliceMarkers();
      const row = det.items[W.sel]; if (row && this.locCheckRow) this.locCheckRow(ex, row);
    },
    /** plots et hampes dans les coupes : vérification d'une électrode (imaging_panel), détection en cours sur le scanner
     *  (écran Imagerie), sinon électrodes de l'exploration : réelles (vert), détectées non validées (bleu), prévues (orange) */
    sliceMarkers() {
      if (!this.slices || !this.dossier) return; const d = this.dossier, W = this.ui.ce || {}, S3 = this.slices;
      S3.onPick = p => this.onSlicePick(p); S3.pickMode = W.pick && ['imaging', 'loc'].includes(this.ui.screen) ? 'elec' : null;
      if (this.ui.slv && this.ui.slv.elec && this.electrodeCheckMarkers) { this.electrodeCheckMarkers(); return; }
      const ex = ['imaging', 'loc'].includes(this.ui.screen) && W.exId ? S.byId(d.explorations, W.exId) : null, marks = [], shafts = [];
      if (this.ui.slv && this.ui.slv.showElec === false) { S3.setMarkers([]); S3.setShafts([]); return; }   // calque « électrodes » masqué
      if (ex && ex.ctDetect && (!W.ctId || ex.ctDetect.imagingId === W.ctId)) ex.ctDetect.items.forEach((it, i) => { const sel = W.sel === i; shafts.push({ a: it.tip, b: it.entry, color: sel ? 'rgba(255,255,255,.8)' : 'rgba(120,220,255,.55)' }); it.contacts.forEach((c, k) => marks.push({ p: c, r: 1.1, color: sel ? 'rgba(255,230,120,.95)' : 'rgba(76,201,240,.85)', label: k === 0 || k === it.contacts.length - 1 ? it.name + (k + 1) : '', showLabel: k === 0, sel })); });
      else if (this.worldElectrodes) {
        const COL = { real: [123, 211, 137], detected: [76, 201, 240], planned: [255, 170, 60] };
        for (const e of this.worldElectrodes().list) { const c = COL[e.kind].join(','); shafts.push({ a: e.tip, b: e.entry, color: `rgba(${c},.5)` }); e.pts.forEach((p, k) => marks.push({ p, r: 1.1, color: `rgba(${c},.9)`, label: e.name + (k + 1), showLabel: k === 0 })); }
      }
      S3.setMarkers(marks); S3.setShafts(shafts);
    },
    /** validation : les électrodes réelles remplacent la géométrie prévue (mêmes identifiants), les nouvelles sont ajoutées */
    validateElectrodes(ct, ex, quiet) {
      const det = ex.ctDetect; if (!det) return; const ref = S.refImaging(this.dossier); let nNew = 0, nUp = 0, nOut = 0;
      const names = new Set(); for (const it of det.items) { if (names.has(it.name)) { this.toast(`Nom en double : ${it.name} — renommez ou supprimez l’une des deux`, 5000); return; } names.add(it.name); }
      const done = new Set();
      for (const it of det.items) {
        let spec = ex.electrodes.find(s => s.id === it.planId && !done.has(s.id)) || SV.Seeg.findElec(ex.electrodes.filter(s => !done.has(s.id)), it.name);
        if (!spec) { spec = { id: 'r' + Date.now().toString(36) + nNew, code: it.name.replace(/[’']/g, ''), name: it.name, hemi: it.hemi || this.elecSideOf(it), auto: false, maker: this.exMaker(ex) }; ex.electrodes.push(spec); nNew++; } else nUp++;
        spec.name = it.name; spec.hemi = it.hemi || spec.hemi; if (it.hemiManual) spec.hemiManual = true;
        done.add(spec.id); it.planId = it.planId || spec.id;
        const st = it.status || (it.checked ? 'ok' : '');
        spec.real = { contacts: it.contacts.map(c => c.map(v => Math.round(v * 100) / 100)), tip: it.tip.map(v => Math.round(v * 100) / 100), entry: it.entry.map(v => Math.round(v * 100) / 100), n: it.contacts.length, source: it.manual ? 'manual' : 'ct', edited: !!it.edited, imagingId: ct.id, refId: ref && ref.id, date: S.now(), checked: st === 'ok', status: st };
        const mk = this.locMakerOf(ex, it), mdl = this.locModelOf(ex, it); spec.maker = mdl ? mdl.maker : mk; spec.makerOwn = !!it.maker; spec.model = mdl ? mdl.id : (mk === 'Alcis' ? `Alcis 2069-EPC-${String(it.n).padStart(2, '0')}C-35` : `DIXI D08-${String(it.n).padStart(2, '0')}AM`);
      }
      // reconstructions de ce scanner retirées de la liste (supprimées, ou refaites sous un autre nom) : plus de plots fantômes
      const nm = x => String(x || '').trim().replace(/['’‘´`]/g, '’').toUpperCase();
      for (const spec of ex.electrodes.slice()) if (spec.real && spec.real.imagingId === ct.id && !done.has(spec.id)) {
        nOut++; const twin = ex.electrodes.some(s => s !== spec && done.has(s.id) && nm(s.name) === nm(spec.name));   // doublon d'une électrode refaite : retiré en entier
        if (!twin && (spec.target || (spec.plan && spec.plan.tip))) delete spec.real; else ex.electrodes.splice(ex.electrodes.indexOf(spec), 1);
      }
      ex.ctImageId = ct.id; ex.ctDate = S.now(); det.dirty = false;
      S.log(this.dossier, 'edit', 'exploration', ex.id, `électrodes réelles validées (${nUp} prévues, ${nNew} nouvelles${nOut ? ', ' + nOut + ' retirées' : ''})`); this.touch();
      if (this.ctx && this.ctx.explorationId === ex.id) { const st = S.toWorkspace(this.dossier, this.ctx); this.state.electrodes = st.electrodes; this.rebuildElectrodes(); }
      this.exportElectrodesBids(ex, false);
      if (!quiet) this.toast(`${det.items.length} électrodes réelles enregistrées dans ${ex.label} (${nUp} du schéma, ${nNew} nouvelle${nNew > 1 ? 's' : ''}${nOut ? `, ${nOut} reconstruction${nOut > 1 ? 's' : ''} retirée${nOut > 1 ? 's' : ''}` : ''})`, 5000);
      ex.ctDetect.validated = S.now();
      if (quiet) return; if (this.refreshImagingScreen) this.refreshImagingScreen(); else this.renderImaging();
    },
    /** BIDS iEEG : sub-<pseudo>_ses-<exploration>_space-T1w_electrodes.tsv + coordsystem.json, rangés dans derivatives/ieeg */
    async exportElectrodesBids(ex, download) {
      const d = this.dossier, A = this.patientAnat, sub = (d.patient.pseudo || 'patient').replace(/[^A-Za-z0-9]/g, ''), ses = ex.label.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
      const rows = ['name\tx\ty\tz\tsize\tmaterial\tmanufacturer\tgroup\themisphere\ttype\tregion_vep'];
      for (const spec of ex.electrodes) if (spec.real) spec.real.contacts.forEach((c, k) => { const l = A && A.labelWorld ? A.labelWorld.labelAt(c[0], c[1], c[2]) : 0; rows.push([spec.name.replace(/’/g, "'") + (k + 1), c[0].toFixed(2), c[1].toFixed(2), c[2].toFixed(2), '5.03', 'PtIr', spec.maker || 'DIXI', spec.name.replace(/’/g, "'"), spec.hemi, 'depth', l >= 1 && l <= 162 ? this.atlas.labelEn(l) : l === 200 ? 'white-matter' : l === 201 ? 'CSF' : 'n/a'].join('\t')); });
      const base = `derivatives/ieeg/sub-${sub}_ses-${ses}_space-T1w`, cs = { iEEGCoordinateSystem: 'Other', iEEGCoordinateUnits: 'mm', iEEGCoordinateSystemDescription: 'RAS scanner du T1 pré-opératoire de référence (monde NIfTI), EpiScope', IntendedFor: (S.refImaging(d) || {}).file || '', iEEGCoordinateProcessingDescription: 'scanner post-implantation recalé (rigide, information mutuelle) ; plots détectés (seuil du métal, droites, peigne 2 mm / 3,5 mm) et validés', iEEGCoordinateProcessingReference: 'EpiScope ; méthode Brainstorm SEEG / GARDEL (Medina Villalon et al. 2018)' };
      await L.writeFile(d, base + '_electrodes.tsv', rows.join('\n') + '\n'); await L.writeFile(d, base + '_coordsystem.json', JSON.stringify(cs, null, 2));
      if (download) { this.download(base.split('/').pop() + '_electrodes.tsv', rows.join('\n') + '\n', 'text/tab-separated-values'); }
    },
  };
  Object.assign(SV.app, M);
  SV.RealElec = { realElectrode };
})(window.SV = window.SV || {});
