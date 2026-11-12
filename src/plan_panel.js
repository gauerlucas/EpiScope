/* EpiScope — plan_panel.js (v4.9) : panneau de la planification, pensé pour 10 à 15 électrodes.
 *   - en tête : projet et calques, hypothèses à tester, import de la planification chirurgicale (inchangés) ;
 *   - barre : ＋ Au clic (cible sur les coupes IRM ou une structure profonde : trajectoire faisable la plus courte ; point
 *     d'entrée sur le cortex en 3D : électrode orthogonale ; modèle choisi),
 *     ＋ Électrode type ▾ (bibliothèque, G / D), Proposer ▾ (réglages de la proposition), ⋯ (copier, tout retirer, pose
 *     orthogonale au clic) ; une ligne de synthèse (électrodes, plots, faisabilité) ;
 *   - liste compacte : une ligne par électrode (état, nom, cible, modèle, trajet, alertes) ; la ligne choisie s'ouvre :
 *     modèle (auto ou imposé), trajet, incidence, entrée, plots, alertes, déplacement de la pointe (2 mm), trajectoire
 *     la plus courte, miroir, coupes, supprimer ; ↑ ↓ passent d'une électrode à l'autre.
 *   - sur l'anatomie du patient, une électrode du schéma déplacée devient une trajectoire du patient (plan.tip / entry),
 *     dont l'entrée reste collée à l'enveloppe du cerveau. */
(function (SV) {
  'use strict';
  const $ = id => document.getElementById(id), M4 = SV.Mat4, S = SV.Store, PT = SV.PlanTraj;
  const esc = SV.U.esc;
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b, s) => [a[0] + b[0] * (s == null ? 1 : s), a[1] + b[1] * (s == null ? 1 : s), a[2] + b[2] * (s == null ? 1 : s)];
  const unit = a => { const n = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };
  const r2 = p => p.map(v => Math.round(v * 100) / 100);
  const ST = { ok: ['faisable', '#5fcf80'], orange: ['à revoir', '#ffa53d'], red: ['irréalisable', '#ff4b4b'] };
  const nat = (a, b) => (a.hemi === b.hemi ? 0 : a.hemi === 'L' ? -1 : 1) || String(a.name).localeCompare(String(b.name), 'fr', { numeric: true });

  const M = {
    planSpec(id) { return (this.state.electrodes || []).find(s => s.id === id); },
    /** sur l'anatomie du patient, une électrode du schéma (gabarit) devient une trajectoire du patient avant d'être modifiée */
    planToPatient(spec) {
      if (!spec || (spec.plan && spec.plan.tip) || this.trajSpace() !== 'patient') return spec;
      const e = (this.elecs || []).find(x => x.id === spec.id); if (!e || !e.tipW || !e.entryW) return spec;
      spec.plan = { tip: r2(e.tipW), entry: r2(e.entryW), snap: true, from: 'schéma' }; return spec;
    },
    /** nom d'une électrode posée sur une cible : trajectoire de la bibliothèque visant cette structure, sinon initiales */
    planNameFor(targetIndex, hemi) {
      const reg = targetIndex && this.atlas.region(targetIndex), fam = reg && reg.family;
      const libs = fam ? SV.Electrodes.LIBRARY.filter(l => l.target === fam) : [], lib = libs.find(l => !l.oblique) || libs[0];
      const fr = fam ? ((this.db.regionByFamily.get(fam) || { label_fr: fam }).label_fr) : 'cible';
      let code = lib ? lib.code : fr.split(/[\s-]+/).filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 3) || 'E';
      const sfx = SV.Side.suffix(hemi, this.sideConv()); let name = code + sfx, k = 2; const used = new Set((this.state.electrodes || []).map(s => s.name));
      while (used.has(name)) name = code + (k++) + sfx;
      return { code, name, fr: lib ? lib.fr : fr };
    },
    /** cible cliquée (coupes : monde du T1 ; 3D : espace de la vue) → électrode sur la trajectoire faisable la plus courte */
    planTargetAt(p, from, replaceId, forceSpace) {
      const space = forceSpace || this.trajSpace(), ctx = this.trajCtx(space); if (!ctx) { this.toast('Planification : volume du cerveau indisponible', 3000); return; }
      const A = this.patientAnat, pv = this.anatMode === 'patient' && A;   // vue affichée ↔ monde du calcul (T1 du patient ou gabarit)
      const v2w = v => space === 'patient' ? this.viewToWorld(v) : pv ? M4.apply(A.templateFromDisplay, v[0], v[1], v[2]) : v;
      const w2v = w => space === 'patient' ? this.worldToView(w) : pv ? M4.apply(A.dispFromTemplate, w[0], w[1], w[2]) : w;
      let tW;
      if (from === 'world') tW = p;   // déjà dans le monde du calcul
      else if (from === 'slices') {   // coupes : monde du T1, ou gabarit MNI (v5.1)
        const tplS = this.slvSpace && this.slvSpace() === 'tpl';
        if (space === 'patient') tW = tplS ? this.slvToWorld(p) : p; else if (tplS) tW = p; else if (A) tW = M4.apply(A.toTemplate, p[0], p[1], p[2]);
        if (!tW) { this.toast('Cibler sur les coupes : calculez d’abord l’anatomie du patient (Dossier › Imagerie)', 5000); return; } }
      else { tW = v2w(p); if (!ctx.hull.brain(tW)) tW = add(tW, ctx.hull.normal(tW), -3); }   // clic sur le cortex : un peu sous la surface
      if (!ctx.hull.brain(tW) && !ctx.hull.inside(tW)) { this.toast('Cible hors du cerveau', 2500); return; }
      const targetIndex = this.planLabelNear(ctx, tW), hemi = ctx.side(tW) || (targetIndex && this.atlas.hemiOf[targetIndex]) || 'R';
      const tV = w2v(tW), others = (this.elecs || []).filter(e => e.id !== replaceId && e.tip && e.entry);
      if (!replaceId) {   // cible déjà échantillonnée : l'électrode qui y passe est choisie
        let near = null; for (const e of others) for (const c of e.contacts || []) { const d = Math.hypot(c.xyz[0] - tV[0], c.xyz[1] - tV[1], c.xyz[2] - tV[2]); if (d < 4 && (!near || d < near.d)) near = { e, c, d }; }
        if (near) { this.ui.selElec = null; this.selectElectrode(near.e.id); this.toast(`Cible déjà échantillonnée par ${near.e.name} (plot ${near.c.k}, ${near.d.toFixed(1)} mm)`, 4000); return; }
      }
      const best = PT.searchTrajectory(ctx, tW, hemi, others.map(e => { const t = v2w(e.tip), en = v2w(e.entry); return { tip: t, entry: en, dir: unit(sub(en, t)) }; }));
      if (!best) { this.toast('Aucune trajectoire faisable vers cette cible : entrée par le crâne du même côté, incidence ≤ 40°, hors zones à risque, à 6 mm des autres électrodes, sans ventricule ni cervelet', 6000); return; }
      const tip = add(tW, best.dir, -1);   // premier plot sur la cible
      let spec = replaceId ? this.planSpec(replaceId) : null; const maker = ($('elMaker') && $('elMaker').value) || 'DIXI';
      if (!spec) { const nm = this.planNameFor(targetIndex, hemi); spec = { id: 'm' + Date.now().toString(36), code: nm.code, name: nm.name, fr: nm.fr, hemi, targetIndex, auto: false, maker }; this.state.electrodes = (this.state.electrodes || []).concat([spec]); }
      else { spec.targetIndex = targetIndex || spec.targetIndex; spec.auto = false; }
      if (space === 'patient') { spec.plan = { tip: r2(tip), entry: r2(best.entry), snap: true, from: 'cible' }; }
      else { delete spec.plan; spec.target = r2(tip); spec.exit = r2(best.entry); spec.yaw = 0; spec.pitch = 0; }
      this.ui.selElec = spec.id; this.rebuildElectrodes();
      let e = (this.elecs || []).find(x => x.id === spec.id);
      if (e && !spec.targetIndex) { const l = (e.contacts || []).map(c => c.label).find(x => x >= 1 && x <= 162); if (l) { spec.targetIndex = l; this.rebuildElectrodes(); e = (this.elecs || []).find(x => x.id === spec.id); } }
      this.toast(e ? `${e.name} → ${spec.targetIndex && this.atlas.region(spec.targetIndex) ? this.atlas.label(spec.targetIndex) : "cible"} : ${e.nContacts} plots (${e.model}), trajet ${e.length.toFixed(0)} mm, incidence ${e.incidence != null ? e.incidence : best.incidence}°` : 'Trajectoire posée', 4500);
      if (this.ui.dock && this.planHandlesSync) this.planHandlesSync();
    },
    /** point d'entrée cliqué sur le cortex (3D, espace de la vue) → électrode orthogonale au plan sagittal entrant là
     *  (perpendiculaire à la voûte si l'orthogonale est trop oblique), jusqu'aux noyaux gris, au ventricule, à la ligne
     *  médiane ou à la sortie du cerveau ; entrée collée à l'enveloppe, modèle d'après le trajet */
    planEntryAt(pV) {
      const space = this.trajSpace(), ctx = this.trajCtx(space); if (!ctx) { this.toast('Planification : volume du cerveau indisponible', 3000); return; }
      const A = this.patientAnat, pv = this.anatMode === 'patient' && A, H = ctx.hull;
      const v2w = v => space === 'patient' ? this.viewToWorld(v) : pv ? M4.apply(A.templateFromDisplay, v[0], v[1], v[2]) : v;
      const w2v = w => space === 'patient' ? this.worldToView(w) : pv ? M4.apply(A.dispFromTemplate, w[0], w[1], w[2]) : w;
      // point de l'enveloppe le plus proche, le long de la normale
      const P = v2w(pV), n0 = H.normal(P), in0 = H.field(P) >= 0.5; let E = null;
      for (let s = 0; s <= 25 && !E; s += 0.5) for (const sg of in0 ? [1] : [-1]) { const q = add(P, n0, sg * s); if ((H.field(q) >= 0.5) !== in0) E = q; }
      if (!E) { this.toast('Point d’entrée : cliquez sur la surface du cerveau', 3000); return; }
      const lat = ctx.latX(E), hemi = lat < 0 ? 'L' : 'R', sx = hemi === 'L' ? -1 : 1, n = H.normal(E);
      // trajectoire type (bibliothèque) dont l'entrée est la plus proche du clic : sa cible, l'entrée cliquée, son nom
      const Ev = w2v(E); let can = null;
      for (const G of this.planLibGeo(hemi)) { const dd = Math.hypot(G.e.entry[0] - Ev[0], G.e.entry[1] - Ev[1], G.e.entry[2] - Ev[2]); if (dd < (can ? can.d : 35)) can = { G, d: dd }; }
      if (can) return this.planCanonAt(can.G, E, hemi, space, v2w, can.d);
      // sans trajectoire type à proximité : direction vers l'intérieur : orthogonale au plan sagittal, sinon perpendiculaire à la surface
      const ev = w2v(E), dOrth = unit(sub(v2w([ev[0] - sx * 10, ev[1], ev[2]]), E)), ang = d => Math.acos(Math.max(-1, Math.min(1, -(d[0] * n[0] + d[1] * n[1] + d[2] * n[2])))) * 180 / Math.PI;
      const orth = ang(dOrth) <= 40, din = orth ? dOrth : [-n[0], -n[1], -n[2]];
      const deep = new Set(['Thalamus', 'Caudate-nucleus', 'Putamen', 'Pallidum', 'Nucleus-accumbens', 'Cerebellar-cortex', 'Hypothalamus']);
      let T = null, out = 0;
      for (let s = 3; s <= 90; s += 1) {
        const q = add(E, din, s), lq = ctx.latX(q); if (Math.abs(lq) < 4 || Math.sign(lq) !== sx) break;   // ligne médiane
        const l = ctx.labelAt(q); if (l === 201 && s > 10) break;   // ventricule
        if (!H.brain(q)) { if (s > 8 && ++out >= 6) break; continue; } out = 0;
        if (l >= 1 && l <= 162 && this.atlas.region(l) && deep.has(this.atlas.region(l).family)) break;   // noyaux gris
        T = q;
      }
      if (!T || Math.hypot(...sub(T, E)) < 8) { this.toast('Pas de trajectoire depuis ce point d’entrée : cliquez un peu plus loin', 3500); return; }
      // structure visée : première substance grise (hors noyaux d'arrêt) en remontant de la pointe vers l'entrée
      const tip = T, isDeep = l => this.atlas.region(l) && deep.has(this.atlas.region(l).family); let targetIndex = 0;
      for (let s = 0; s <= 25 && !targetIndex; s += 1) { const l = ctx.labelAt(add(tip, din, -s)); if (l >= 1 && l <= 162 && !isDeep(l)) targetIndex = l; }
      const nm = this.planNameFor(targetIndex, hemi), maker = ($('elMaker') && $('elMaker').value) || 'DIXI';
      const spec = { id: 'm' + Date.now().toString(36), code: nm.code, name: nm.name, fr: nm.fr, hemi, targetIndex, auto: false, maker };
      if (space === 'patient') spec.plan = { tip: r2(tip), entry: r2(E), snap: true, from: 'entrée' }; else { spec.target = r2(tip); spec.exit = r2(E); spec.yaw = 0; spec.pitch = 0; }
      this.state.electrodes = (this.state.electrodes || []).concat([spec]); this.ui.selElec = spec.id; this.rebuildElectrodes();
      const e = (this.elecs || []).find(x => x.id === spec.id);
      this.toast(e ? `${e.name} : pas de trajectoire type à proximité ; entrée ${e.entryLabel ? this.atlas.label(e.entryLabel) : 'ici'}, ${orth ? 'orthogonale' : 'perpendiculaire à la voûte (l’orthogonale serait trop oblique)'} → ${targetIndex ? this.atlas.label(targetIndex) : 'profondeur'} : ${e.nContacts} plots, ${e.length.toFixed(0)} mm${e.status === 'red' ? ' · ⚠ irréalisable' : e.status === 'orange' ? ' · à revoir' : ''}` : 'Électrode posée', 5000);
      if (this.ui.dock && this.planHandlesSync) this.planHandlesSync();
    },
    /** trajectoires de la bibliothèque construites dans la vue (entrée sur l'enveloppe), par hémisphère ; refaites si
     *  l'anatomie affichée change */
    planLibGeo(hemi) {
      const key = this.anatMode + '|' + this.trajSpace();
      if (!this._libGeoV || this._libGeoV.key !== key || this._libGeoV.P !== this.patientAnat) this._libGeoV = { key, P: this.patientAnat, L: null, R: null };
      if (this._libGeoV[hemi]) return this._libGeoV[hemi];
      const out = [];
      for (const lib of SV.Electrodes.LIBRARY) {
        let t = null; try { t = SV.Electrodes.fromLibrary(lib, hemi, this.atlas, this.vol, {}); } catch (err) { t = null; } if (!t) continue;
        const spec = SV.Electrodes.serialize(t); spec.id = '__lib_' + lib.code + hemi; let e = null;
        try { e = this.buildElectrodeFor(spec, this.anatMode, 'plan'); } catch (err) { e = null; }
        if (e && e.entry && e.tip) out.push({ lib, spec, e });
      }
      return this._libGeoV[hemi] = out;
    },
    /** électrode type posée depuis le point d'entrée cliqué : pointe = cible de la trajectoire type, entrée = le clic
     *  (collée à l'enveloppe), modèle d'après le trajet, nom de la trajectoire type */
    planCanonAt(G, E, hemi, space, v2w, d) {
      const lib = G.lib, tip = v2w(G.e.tip), prime = SV.Side.suffix(hemi, this.sideConv()), used = new Set((this.state.electrodes || []).map(s => s.name));
      let name = lib.code + prime, k = 2; while (used.has(name)) name = lib.code + (k++) + prime;
      const maker = ($('elMaker') && $('elMaker').value) || 'DIXI';
      const spec = { id: 'm' + Date.now().toString(36), code: lib.code, lib: lib.code, name, fr: lib.fr, hemi, targetIndex: G.spec.targetIndex || G.e.targetIndex || 0, oblique: !!lib.oblique, auto: false, maker };
      if (space === 'patient') spec.plan = { tip: r2(tip), entry: r2(E), snap: true, from: 'trajectoire type ' + lib.code };
      else { spec.target = r2(tip); spec.exit = r2(E); spec.yaw = 0; spec.pitch = 0; }
      this.state.electrodes = (this.state.electrodes || []).concat([spec]); this.ui.selElec = spec.id; this.rebuildElectrodes();
      const e = (this.elecs || []).find(x => x.id === spec.id);
      this.toast(e ? `${e.name} — trajectoire type ${lib.code} (${lib.fr}) : entrée au point cliqué (${d.toFixed(0)} mm de l’entrée type), cible ${spec.targetIndex ? this.atlas.label(spec.targetIndex) : 'type'} ; ${e.nContacts} plots, ${e.length.toFixed(0)} mm${e.status === 'red' ? ' · ⚠ irréalisable' : e.status === 'orange' ? ' · à revoir' : ''}` : 'Électrode posée', 5500);
      if (this.ui.dock && this.planHandlesSync) this.planHandlesSync();
    },
    /** structure ciblée : étiquette au point, sinon la plus fréquente à 2 mm autour (cortex et noyaux, pas la substance blanche) */
    planLabelNear(ctx, p) {
      const l0 = ctx.labelAt(p); if (l0 >= 1 && l0 <= 162) return l0;
      const v = new Map(); for (const dx of [-2, 0, 2]) for (const dy of [-2, 0, 2]) for (const dz of [-2, 0, 2]) { const l = ctx.labelAt([p[0] + dx, p[1] + dy, p[2] + dz]); if (l >= 1 && l <= 162) v.set(l, (v.get(l) || 0) + 1); }
      let best = 0, bn = 0; for (const [l, n] of v) if (n > bn) { bn = n; best = l; } return best;
    },
    setPlanTarget(on) {
      this.ui.planTarget = on == null ? !this.ui.planTarget : !!on;
      if (this.ui.planTarget && this.ui.addElec && this.setAddMode) this.setAddMode(false);
      $('view3d') && $('view3d').classList.toggle('adding', !!this.ui.planTarget);
      if (this.slices) { this.slices.pickMode = this.ui.planTarget ? 'target' : null; this.slices.el.classList.toggle('picking', !!this.ui.planTarget); }
      if (this.updatePickFilter && this.viewer) this.updatePickFilter();
      if (this.ui.planTarget) this.toast('Au clic : une cible sur les coupes IRM (ou une structure profonde en 3D) → trajectoire faisable la plus courte ; un point d’entrée sur le cortex en 3D → trajectoire type la plus proche (son nom, sa cible, l’entrée cliquée). Échap pour arrêter.', 7000);
      if (this.ui.tab === 'electrodes') this.renderElectrodes();
    },
    /** pointe déplacée de 2 mm (vue : ant / post, haut / bas ; profondeur le long de l'axe), entrée recalculée */
    planNudge(id, kind, v) {
      const spec = this.planSpec(id); if (!spec) return;
      if (this.trajSpace() === 'patient') this.planToPatient(spec);
      if (spec.plan && spec.plan.tip) {   // trajectoire du patient (monde du T1) : axes de la vue affichée
        if (!this.patientAnat) return; const P = spec.plan, dir = unit(sub(P.entry, P.tip));
        if (kind === 'depth') P.tip = r2(add(P.tip, dir, -v));
        else { const tv = this.worldToView(P.tip), t2 = this.viewToWorld(add(tv, kind === 'dy' ? [0, v, 0] : [0, 0, v])), dd = sub(t2, P.tip); P.tip = r2(t2); P.entry = r2(add(P.entry, dd)); }
        P.edited = true; if (this.patientAnat.segVol) P.snap = true; spec.auto = false;
        const lw = this.patientAnat.labelWorld, tl = lw ? lw.labelAt(P.tip[0], P.tip[1], P.tip[2]) : 0; if (tl >= 1 && tl <= 162) spec.targetIndex = tl;
        this.rebuildElectrodes(); this.planStoreEntry(spec); return;
      }
      this.updateElectrode(id, { [kind]: v });
    },
    planFlip(id) {
      const spec = this.planSpec(id); if (!spec) return;
      if (spec.plan && spec.plan.tip) {
        if (!this.patientAnat) return;
        const mx = this.anatMode === 'patient' ? ((this.patientAnat.info && this.patientAnat.info.midX) || 0) : 0, mir = p => { const v = this.worldToView(p); return r2(this.viewToWorld([2 * mx - v[0], v[1], v[2]])); };
        spec.plan.tip = mir(spec.plan.tip); spec.plan.entry = mir(spec.plan.entry); spec.plan.edited = true; if (this.patientAnat.segVol) spec.plan.snap = true;
        spec.hemi = this.hemiOfSpec(spec) === 'L' ? 'R' : 'L'; spec.name = spec.hemi === 'L' ? String(spec.name).replace(/’?$/, '’') : String(spec.name).replace(/’$/, '');
        if (spec.targetIndex && this.atlas.homotopic[spec.targetIndex] > 0) spec.targetIndex = this.atlas.homotopic[spec.targetIndex];
        this.rebuildElectrodes(); return;
      }
      this.updateElectrode(id, { flip: true });
    },
    /** trajectoire faisable la plus courte vers la cible actuelle (premier plot) de l'électrode */
    planShortest(id) {
      const e = (this.elecs || []).find(x => x.id === id); if (!e || !e.contacts || !e.contacts.length) return;
      const spec = this.planSpec(id), P = this.patientAnat, space = spec && spec.plan && spec.plan.tip && P && P.segVol ? 'patient' : this.trajSpace(), ctx = this.trajCtx(space); if (!ctx) return;
      const v2w = v => space === 'patient' ? this.viewToWorld(v) : this.anatMode === 'patient' && P ? M4.apply(P.templateFromDisplay, v[0], v[1], v[2]) : v;
      // cible : premier plot dans le cerveau (depuis la pointe), sinon le centre de la structure visée
      let tW = null; for (const c of e.contacts) { const w = v2w(c.xyz); if (ctx.hull.brain(w)) { tW = w; break; } }
      if (!tW && spec && spec.targetIndex) { const at = this.anatMode === 'patient' && P && P.atlas ? P.atlas : this.atlas, reg = at.region(spec.targetIndex); if (reg && reg.centroid) { const w = v2w(reg.centroid); if (ctx.hull.inside(w)) tW = w; } }
      if (!tW) { this.toast(`${e.name} : cible hors du cerveau — déplacez la pointe`, 4000); return; }
      this.planTargetAt(tW, 'world', id, space);
    },
    /** électrodes irréalisables (prévues) : trajectoire faisable la plus courte vers leur cible, nom gardé */
    planFixRed() {
      const ids = (this.elecs || []).filter(e => e.status === 'red' && !e.real).map(e => e.id); if (!ids.length) return;
      const t0 = this.toast; let ok = 0; const left = [];
      this.toast = () => {};
      try { for (const id of ids) { this.planShortest(id); const e = (this.elecs || []).find(x => x.id === id); if (e && e.status !== 'red') ok++; else if (e) left.push(e.name); } } finally { this.toast = t0; }
      this.toast(`${ok} trajectoire${ok > 1 ? 's' : ''} rendue${ok > 1 ? 's' : ''} faisable${ok > 1 ? 's' : ''}${left.length ? ' · sans solution : ' + left.join(', ') + ' (cible à déplacer)' : ''}`, 5000);
    },
    /** l'entrée affichée (sur l'enveloppe) devient l'entrée enregistrée : les déplacements suivants partent de là */
    planStoreEntry(spec) { const e = (this.elecs || []).find(x => x.id === spec.id); if (e && spec.plan && spec.plan.snap && e.entryW) spec.plan.entry = r2(e.entryW); },
    planSetModel(id, v) { const spec = this.planSpec(id); if (!spec) return; if (v) { spec.model = v; spec.modelFixed = true; } else { delete spec.model; spec.modelFixed = false; } spec.auto = false; this.rebuildElectrodes(); },

    // ---------------------------------------------------------------- panneau
    renderPlanElectrodes() {
      const box = $('tab-electrodes'); if (!box) return;
      const els = (this.elecs || []).slice().sort(nat), sel = this.ui.selElec, space = this.trajSpace();
      const opts = this._elOpts || (this._elOpts = { max: 12, hemi: 'auto', contra: true, post: false, maker: 'DIXI' });
      const cnt = { ok: 0, orange: 0, red: 0 }; let nPl = 0; for (const e of els) { cnt[e.status || 'ok'] = (cnt[e.status || 'ok'] || 0) + 1; nPl += e.nContacts || 0; }
      const tgtOf = e => { const t = e.targetIndex && this.atlas.region(e.targetIndex) ? e.targetIndex : (e.contacts || []).map(c => c.label).find(l => l >= 1 && l <= 162); return t ? this.atlas.label(t) : (e.fr || '—'); };
      let html = `<div class="pe-tools"><button id="peTarget" class="${this.ui.planTarget ? 'on primary' : 'primary'}" title="pose au clic — sur les coupes IRM ou une structure profonde en 3D : la cible (trajectoire faisable la plus courte) ; sur le cortex en 3D : le point d’entrée (électrode orthogonale) ; modèle d’après la longueur ; Échap pour arrêter">＋ Au clic</button><button id="peLib" title="électrode type : trajectoire conventionnelle (nomenclature Talairach–Bancaud), gauche ou droite">＋ Type ▾</button><button id="pePropose" title="schéma proposé d’après les hypothèses et les crises">Proposer ▾</button><span class="spacer"></span><select id="elMaker" title="marque des électrodes"><option value="DIXI"${opts.maker === 'DIXI' ? ' selected' : ''}>DIXI</option><option value="Alcis"${opts.maker === 'Alcis' ? ' selected' : ''}>Alcis</option></select><button id="peMore" title="copier le schéma, tout retirer">⋯</button></div>
        <div class="pe-sum"><span><b>${els.length}</b> électrode${els.length > 1 ? 's' : ''} · ${nPl} plots</span>${els.length ? ` · <span class="pe-st"><i style="background:${ST.ok[1]}"></i>${cnt.ok || 0}</span><span class="pe-st" title="à revoir"><i style="background:${ST.orange[1]}"></i>${cnt.orange || 0}</span><span class="pe-st" title="irréalisable"><i style="background:${ST.red[1]}"></i>${cnt.red || 0}</span>` : ''}${cnt.red ? `<button class="mini-btn pe-fix" data-a="fixred" title="trajectoire faisable la plus courte vers la même cible pour chaque électrode irréalisable (nom et cible gardés)">↻ rendre faisable${cnt.red > 1 ? 's' : ''}</button>` : ''}<span class="spacer"></span><span class="muted small" title="${space === 'patient' ? 'entrées sur l’enveloppe du cerveau du patient (segmentation)' : 'entrées à la surface du gabarit fsaverage ; « Patient » (barre du haut) pour planifier sur l’anatomie du patient'}">${space === 'patient' ? 'sur le patient' : 'sur le gabarit'}</span></div>`;
      if (!els.length) html += '<div class="hint" style="margin:8px 0">Aucune électrode : « ＋ Au clic » puis un clic sur la cible (coupes IRM) ou sur le point d’entrée (cortex en 3D), une électrode type, ou « Proposer ».</div>';
      else {
        html += '<div class="pe-list" tabindex="0">';
        for (const e of els) {
          const st = e.status || 'ok', nI = (e.issues || []).filter(i => i.sev >= 2).length, on = e.id === sel;
          html += `<div class="pe-row${on ? ' sel' : ''} st-${st}" data-eid="${e.id}"><i class="dot" title="${ST[st][0]}" style="background:${ST[st][1]}"></i><b class="nm">${esc(e.name)}</b><span class="tg">${esc(tgtOf(e))}</span><span class="md">${e.nContacts} pl.</span><span class="ln">${(e.length || 0).toFixed(0)} mm</span><span class="is">${nI ? '⚠ ' + nI : ''}</span></div>`;
          if (on) html += this.planDetailHTML(e);
        }
        html += '</div>';
      }
      box.innerHTML = html;
      // en-têtes : hypothèses à tester (et import), projet et calques, implantation de référence si des électrodes sont localisées
      const ph = this.planHeader && this.planHeader(); if (ph) box.insertBefore(ph, box.firstChild);
      const ih = this.implantHeader && this.implantHeader(); if (ih) box.insertBefore(ih, box.firstChild);
      const ex = this.workspaceSeeg && this.workspaceSeeg(); if (ex && this.implantPanel) { const is = S.implantState(ex); if (is.adopted || is.nReal) { const det = h('details', 'impl-det'); det.innerHTML = `<summary>Implantation : <b>${is.adopted || !is.nPlan ? 'réelle' : 'projet'}</b> · calques</summary>`; det.appendChild(this.implantPanel(ex, true)); box.insertBefore(det, box.querySelector('.pe-tools')); } }
      this.planPanelBind(box, opts);
    },
    planDetailHTML(e) {
      const spec = this.planSpec(e.id) || {}, auto = !spec.modelFixed, n = e.nContacts, sp = PT.span(n);
      const mopts = `<option value=""${auto ? ' selected' : ''}>auto · ${n} plots (${sp.toFixed(1).replace('.', ',')} mm)</option>` + SV.Electrodes.MODELS.filter(m => m.maker === (spec.maker || 'DIXI')).map(m => `<option value="${m.id}"${!auto && m.id === e.model ? ' selected' : ''}>${m.id} · ${m.n} plots</option>`).join('');
      const ent = e.entryLabel ? this.atlas.label(e.entryLabel) : '';
      const tests = this.electrodeTests ? this.electrodeTests(e) : [], slc = this.dossier && S.refImaging(this.dossier) ? '<button data-a="slices" title="coupes alignées sur la trajectoire">coupes</button>' : '';
      const nm = `<input class="pe-nm" data-a="name" value="${esc(e.name)}" title="renommer" spellcheck="false">`, bdg = this.electrodeBadges ? this.electrodeBadges(e.id) : '';
      if (e.real) return `<div class="pe-det" data-eid="${e.id}"><div class="pe-l">${nm}<span class="muted">${esc(e.model || '')} · ${n} plots · localisée sur le scanner</span>${bdg}</div><div class="pe-c">${esc(SV.Electrodes.contactSummary(e, this.atlas))}${tests.length ? ' · teste ' + tests.join(', ') : ''}</div><div class="pe-act">${slc}<span class="spacer"></span></div></div>`;
      return `<div class="pe-det" data-eid="${e.id}">
        <div class="pe-l">${nm}<label>modèle <select data-a="model">${mopts}</select></label>${bdg}</div>
        <div class="pe-l"><span class="muted">trajet ${(e.length || 0).toFixed(0)} mm${e.incidence != null ? ` · incidence ${e.incidence}°` : ''}${ent ? ' · entrée ' + esc(ent) : ''}${spec.plan && spec.plan.tip ? ' · trajectoire du patient' : ''}</span></div>
        <div class="pe-c">${esc(SV.Electrodes.contactSummary(e, this.atlas))}${tests.length ? ' · teste ' + tests.join(', ') : ''}</div>
        ${(e.issues || []).length ? `<div class="pe-iss">${e.issues.slice().sort((a, b) => b.sev - a.sev).map(i => `<span class="badge s${i.sev}">${esc(i.text)}</span>`).join('')}</div>` : ''}
        <div class="pe-nudge"><span class="lbl">pointe</span><button data-n="dy" data-v="2" title="2 mm en avant">ant.</button><button data-n="dy" data-v="-2" title="2 mm en arrière">post.</button><button data-n="dz" data-v="2" title="2 mm plus haut">haut</button><button data-n="dz" data-v="-2" title="2 mm plus bas">bas</button><button data-n="depth" data-v="2" title="2 mm plus profond">+ prof.</button><button data-n="depth" data-v="-2" title="2 mm moins profond">− prof.</button></div>
        <div class="pe-act"><button data-a="short" title="trajectoire faisable la plus courte vers le premier plot (même cible)">↻ plus courte</button><button data-a="flip" title="même électrode de l’autre côté">⇆ miroir</button>${slc}<span class="spacer"></span><button data-a="del" class="danger" title="retirer l’électrode">✕</button></div>
      </div>`;
    },
    planPanelBind(box, opts) {
      const B = id => box.querySelector('#' + id);
      B('peTarget').onclick = () => this.setPlanTarget();
      const fx = box.querySelector('[data-a=fixred]'); if (fx) fx.onclick = () => this.planFixRed();
      B('elMaker').onchange = e => { opts.maker = e.target.value; };
      B('peLib').onclick = e => {
        const items = [{ head: 'Électrode type (prime = gauche)' }], hl = this.ui.highlight, groups = [...new Set(SV.Electrodes.LIBRARY.map(l => l.group))];
        if (hl && this.atlas.region(hl)) items.push({ label: `＋ sur « ${this.atlas.label(hl)} » (région choisie en 3D)`, run: () => this.addElectrodeOnRegion(hl) });
        for (const g of groups) { items.push({ head: g }); for (const l of SV.Electrodes.LIBRARY.filter(x => x.group === g)) items.push({ group: `${l.code} — ${l.fr}`, options: [{ label: 'G', run: () => this.addElectrode(l.code, 'L') }, { label: 'D', run: () => this.addElectrode(l.code, 'R') }] }); }
        const r = e.currentTarget.getBoundingClientRect(); this.popupMenu(items, r.left, r.bottom + 4); const m = this._menu; if (m) m.classList.add('scroll');
      };
      B('pePropose').onclick = e => {
        const panel = h('div', 'cell-panel pe-prop');
        panel.innerHTML = `<div class="ctx-head">Proposer un schéma</div><div class="form"><label>électrodes au plus <input id="elMax" type="number" min="1" max="20" value="${opts.max}"></label>
          <label>hémisphère <select id="elHemi"><option value="auto"${opts.hemi === 'auto' ? ' selected' : ''}>auto (latéralisation)</option><option value="L"${opts.hemi === 'L' ? ' selected' : ''}>gauche</option><option value="R"${opts.hemi === 'R' ? ' selected' : ''}>droit</option><option value="B"${opts.hemi === 'B' ? ' selected' : ''}>bilatéral</option></select></label>
          <label class="chk"><input type="checkbox" id="elContra"${opts.contra ? ' checked' : ''}> contrôle controlatéral</label><label class="chk"><input type="checkbox" id="elPost"${opts.post ? ' checked' : ''}> autoriser postérieures</label></div>
          <div class="hint small">Les électrodes posées à la main sont gardées ; les autres sont remplacées.</div><div class="btnrow"><button class="primary" data-a="go">Proposer</button></div>`;
        const r = e.currentTarget.getBoundingClientRect(); this.popupMenu([{ node: panel }], r.left, r.bottom + 4);
        panel.querySelector('[data-a=go]').onclick = () => { Object.assign(opts, { max: +panel.querySelector('#elMax').value || 12, hemi: panel.querySelector('#elHemi').value, contra: panel.querySelector('#elContra').checked, post: panel.querySelector('#elPost').checked }); this.proposeElectrodes(); this.closeMenu(); };
      };
      B('peMore').onclick = e => {
        const r = e.currentTarget.getBoundingClientRect();
        this.popupMenu([{ label: 'Copier le schéma (texte)', run: () => { navigator.clipboard && navigator.clipboard.writeText(this.electrodesText()).then(() => this.toast('Schéma copié')); } },
          { sep: true }, { label: 'Tout retirer…', danger: true, run: () => { if (confirm('Retirer toutes les électrodes du projet ?')) { this.state.electrodes = []; this.ui.selElec = null; this.rebuildElectrodes(); } } }], Math.min(r.left, window.innerWidth - 340), r.bottom + 4);
      };
      box.querySelectorAll('.pe-row').forEach(row => row.onclick = () => this.selectElectrode(row.dataset.eid));
      const det = box.querySelector('.pe-det');
      if (det) {
        const id = det.dataset.eid;
        const md = det.querySelector('[data-a=model]'); if (md) md.onchange = ev => this.planSetModel(id, ev.target.value);
        const nm = det.querySelector('[data-a=name]'); if (nm) { nm.onchange = ev => { const spec = this.planSpec(id), v = ev.target.value.trim(); if (spec && v) { spec.name = v; spec.auto = false; this.rebuildElectrodes(); } }; nm.onkeydown = ev => { ev.stopPropagation(); if (ev.key === 'Enter') ev.target.blur(); }; }
        det.querySelectorAll('[data-n]').forEach(b => b.onclick = () => this.planNudge(id, b.dataset.n, +b.dataset.v));
        det.querySelectorAll('.pe-act [data-a]').forEach(b => b.onclick = () => { const a = b.dataset.a; if (a === 'del') this.removeElectrode(id); else if (a === 'flip') this.planFlip(id); else if (a === 'short') this.planShortest(id); else if (a === 'slices') this.checkElectrodeInDock(id); });
      }
      const list = box.querySelector('.pe-list');
      if (list) list.onkeydown = ev => {
        if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return; ev.preventDefault(); ev.stopPropagation();
        const ids = [...list.querySelectorAll('.pe-row')].map(r => r.dataset.eid), i = ids.indexOf(this.ui.selElec), j = i < 0 ? 0 : Math.max(0, Math.min(ids.length - 1, i + (ev.key === 'ArrowDown' ? 1 : -1)));
        if (ids[j] && ids[j] !== this.ui.selElec) { this.ui.selElec = null; this.selectElectrode(ids[j]); const l2 = $('tab-electrodes').querySelector('.pe-list'); if (l2) l2.focus({ preventScroll: true }); const rr = $('tab-electrodes').querySelector('.pe-row.sel'); if (rr) rr.scrollIntoView({ block: 'nearest' }); }
      };
    },
  };
  Object.assign(SV.app, M);

  // ---------------------------------------------------------------- greffes
  const A = SV.app, re0 = A.renderElectrodes, pah0 = A.planApplyHandle, poh0 = A.planOnHandle, osp0 = A.onSlicePick, op0 = A.onPick, sm0 = A.sliceMarkers;
  A.renderElectrodes = function () {
    if (this.ui.wm === 'plan' && this.ui.screen === 'work' && this.vol) return this.renderPlanElectrodes();
    return re0.apply(this, arguments);
  };
  // poignées sur l'anatomie du patient : l'électrode du schéma devient une trajectoire du patient, entrée collée à l'enveloppe
  if (pah0) A.planApplyHandle = function (spec) { if (this.trajSpace() === 'patient') { this.planToPatient(spec); if (spec.plan) spec.plan.snap = true; } return pah0.apply(this, arguments); };
  if (poh0) A.planOnHandle = function (eid) { const r = poh0.apply(this, arguments), spec = this.planSpec(eid); if (spec) this.planStoreEntry(spec); return r; };
  // clic sur les coupes / la 3D en mode « Au clic » (cortex = entrée, coupes et structures profondes = cible)
  A.onSlicePick = function (p) { if (this.ui.planTarget && this.ui.wm === 'plan') { this.planTargetAt(p, 'slices'); return; } return osp0 ? osp0.apply(this, arguments) : undefined; };
  A.onPick = function (r, kind) {
    if (kind === 'click' && this.ui.planTarget && this.ui.wm === 'plan') { const lp = this.viewer && this.viewer.lastPick; if (lp && (lp.kind === 'contact' || lp.kind === 'electrode')) return op0.apply(this, arguments); if (lp && lp.point) { if (lp.kind === 'surface') this.planEntryAt(lp.point); else this.planTargetAt(lp.point, '3d'); return; } }
    return op0.apply(this, arguments);
  };
  A.sliceMarkers = function () { const r = sm0.apply(this, arguments); if (this.slices && this.ui.planTarget && this.ui.wm === 'plan') { this.slices.onPick = p => this.onSlicePick(p); this.slices.pickMode = 'target'; } return r; };
  // proposition : pas de doublon d'une électrode gardée (même nom = même trajectoire conventionnelle)
  const pe0 = A.proposeElectrodes;
  A.proposeElectrodes = function () {
    const r = pe0.apply(this, arguments), st = this.state.electrodes || [], man = new Set(st.filter(e => !e.auto).map(e => e.name));
    const keep = st.filter(e => !e.auto || !man.has(e.name)); if (keep.length !== st.length) { this.state.electrodes = keep; this.rebuildElectrodes(); }
    return r;
  };
  // « Au clic » : le cortex et les structures profondes restent cliquables dans l'onglet Électrodes (filtre SEEG levé)
  const ist0 = A.isSeegTab;
  A.isSeegTab = function () { if (this.ui.planTarget && this.ui.wm === 'plan' && this.ui.tab === 'electrodes') return false; return ist0.apply(this, arguments); };
  // pose orthogonale au clic (ancien mode « + au clic ») : même règle que le point d'entrée de « Au clic »
  const aep0 = A.addElectrodeAtPoint;
  A.addElectrodeAtPoint = function (P) { if (this.ui.wm === 'plan' && this.ui.screen === 'work' && P) return this.planEntryAt(P); return aep0.apply(this, arguments); };
  // électrode choisie dans la liste (ou en 3D) : les coupes du volet se centrent sur sa pointe
  const se0 = A.selectElectrode;
  A.selectElectrode = function (id) { const r = se0.apply(this, arguments); if (this.ui.selElec === id && this.ui.tab === 'electrodes') this.planFollowSlices(id); return r; };
  A.planFollowSlices = function (id) {
    const S3 = this.slices; if (!S3 || !this.ui.dock || this._ipHost !== $('sliceDock')) return;
    const st = this.slvState ? this.slvState() : {}; if (st.elec) { if (this.dockFollowElectrode) this.dockFollowElectrode(id, 0); return; }
    const e = (this.elecs || []).find(x => x.id === id); if (!e || !e.tip) return;
    const w = this.viewToSlv(e.tip); if (!w) return; S3.setCursor(w); if (!S3.oblique && S3.setViewCenter) S3.setViewCenter(w);
  };
  // électrodes reconstruites (poignées, réglages, cible…) : les plots des coupes suivent sans rouvrir le volet
  const rb0 = A.rebuildElectrodes;
  A.rebuildElectrodes = function () {
    const r = rb0.apply(this, arguments);
    if (this.slices && this.ui.screen === 'work' && this.ui.wm === 'plan' && !this._hd) {
      clearTimeout(this._rbSl);
      this._rbSl = setTimeout(() => { if (!this.slices) return; const st = this.slvState ? this.slvState() : {}; if (st.elec && /^p:/.test(st.elec) && this.findWorldElectrode(st.elec) && this.checkElectrode) this.checkElectrode(st.elec, true); else if (this.planRefreshSlices) this.planRefreshSlices(); }, 30);
    }
    return r;
  };
  SV.Bus.on('workmode:before', function (mode) { if (mode !== 'plan' && this.ui.planTarget) { this.ui.planTarget = false; const v = $('view3d'); if (v) v.classList.remove('adding'); if (this.slices) this.slices.pickMode = null; if (this.updatePickFilter && this.viewer) this.updatePickFilter(); } }, 'plan_panel');
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && A.ui && A.ui.planTarget) A.setPlanTarget(false); });
})(window.SV = window.SV || {});
