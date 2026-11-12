/* EpiScope — loc3d.js (v5.1) : SEEG › Localisation, vue 3D en volet à droite des coupes (« 3D » dans la barre des coupes).
 *   - électrodes reconstruites (détectées ou enregistrées) dans l'anatomie du patient, nommées, celle de la ligne choisie
 *     en surbrillance ;
 *   - « projet » : schéma prévu en surimpression (orange, noms), pour reconnaître chaque électrode et la nommer comme prévu ;
 *   - clic sur une électrode : sa ligne est choisie (coupes alignées) et un menu propose les noms du projet, les plus
 *     proches de sa trajectoire d'abord ; « autre nom… » ouvre le champ du nom.
 *   Demande l'anatomie du patient (elle relie le scanner recalé au modèle 3D). */
(function (SV) {
  'use strict';
  const $ = id => document.getElementById(id), S = SV.Store, M4 = SV.Mat4;
  const esc = SV.U.esc;
  const nn = s => String(s || '').trim().replace(/['’‘´`]/g, '’').replace(/\s+/g, '').toUpperCase();
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const hasPlan = s => !!(s && (s.target || (s.plan && s.plan.tip)));
  const PLAN_COL = [255, 150, 50];
  const CFG = { inflate: 0, opacity: 0.28, sub: true, subFilter: 'noCb', subOpacity: 0.28, subHemi: 'both', fibers: false, nodes: false, sync: false, netLabels: false, hubLabels: false, electrodes: true, labels: true, neutral: true, thermo: false, stims: false, borders: false };
  const LS = { get() { try { return localStorage.getItem('sv_loc3d') === '1'; } catch (e) { return false; } }, set(v) { try { localStorage.setItem('sv_loc3d', v ? '1' : '0'); } catch (e) { } } };
  /** distance moyenne des plots reconstruits à la droite prévue (mm) */
  function lineDist(pts, tip, entry) {
    const u = sub(entry, tip), L = Math.hypot(...u) || 1, d = u.map(x => x / L); let s = 0;
    for (const p of pts) { const w = sub(p, tip), t = dot(w, d), q = [w[0] - d[0] * t, w[1] - d[1] * t, w[2] - d[2] * t]; s += Math.hypot(...q) + Math.max(0, -t) * 0.5; }
    return s / Math.max(1, pts.length);
  }

  const M = {
    loc3dOn() { return this.ui.screen === 'loc' && (this.ui.loc3d != null ? this.ui.loc3d : (this.ui.loc3d = LS.get())); },
    loc3dToggle(on) {
      this.ui.loc3d = on == null ? !this.loc3dOn() : !!on; LS.set(this.ui.loc3d);
      this.loc3dMount(); if (this.renderImagingBar) this.renderImagingBar(); if (this.updateElecInset) this.updateElecInset();
      setTimeout(() => { if (this.slices && this.slices.resize) this.slices.resize(); else if (this.slices) this.slices.draw(); }, 40);
    },
    loc3dDestroy() { const L = this._loc3d; if (L && L.V) { try { L.V.destroy(); } catch (e) { } } this._loc3d = null; },
    /** volet monté (ou retiré) selon le réglage ; appelé après chaque rendu de l'écran */
    loc3dMount() {
      const host = $('loc3d'); if (!host) { this.loc3dDestroy(); return; }
      const on = this.loc3dOn(); host.hidden = !on; host.closest('.loc-main').classList.toggle('with3d', on);
      if (!on) { this.loc3dDestroy(); host.innerHTML = ''; return; }
      const A = this.patientAnat;
      if (this._loc3d && this._loc3d.host === host && this._loc3d.A === A && host.isConnected) { this.loc3dScene(); return; }
      this.loc3dDestroy();
      const plan = this.ui.loc3dPlan !== false;
      host.innerHTML = `<div class="l3-bar"><b>3D</b><div class="seg l3-views">${[['latL', 'lat. G'], ['latR', 'lat. D'], ['sup', 'dessus'], ['ant', 'face'], ['infRad', 'dessous']].map(([v, l]) => `<button data-v="${v}">${l}</button>`).join('')}</div>
        <label class="chip" title="schéma prévu (projet d’implantation) en orange, avec ses noms"><input type="checkbox" class="l3-plan"${plan ? ' checked' : ''}> <i class="l3-sw"></i>projet</label><span class="spacer"></span><button class="mini-btn l3-x" title="fermer la vue 3D">✕</button></div>
        <div class="l3-view"></div><div class="l3-foot muted small">clic sur une électrode : elle est choisie, les noms du projet les plus proches sont proposés</div>`;
      host.querySelector('.l3-x').onclick = () => this.loc3dToggle(false);
      host.querySelector('.l3-plan').onchange = e => { this.ui.loc3dPlan = e.target.checked; this.loc3dScene(); };
      const view = host.querySelector('.l3-view');
      if (!A) { view.innerHTML = '<div class="hint" style="padding:24px">Vue 3D de la localisation : calculez d’abord l’anatomie du patient (Dossier › Imagerie) — elle relie le scanner recalé au modèle 3D.</div>'; this._loc3d = { host, A: null }; return; }
      let V; try { V = new SV.Viewer3D(view, A.atlas, (r, kind, e) => this.loc3dPick(kind, e)); } catch (e) { view.innerHTML = `<div class="hint" style="padding:24px">Vue 3D indisponible : ${esc(e.message)}</div>`; return; }
      if (V.mode !== 'webgl') { V.destroy(); view.innerHTML = '<div class="hint" style="padding:24px">Vue 3D indisponible (rendu logiciel).</div>'; return; }
      if (V.setElectrodeStyle) V.setElectrodeStyle('dark-bg');
      const ex = this.loc3dEx(), side = ex && ex.electrodes.filter(s => s.hemi === 'R').length > ex.electrodes.length / 2 ? 'latR' : 'latL';
      V.setCellConfig(0, Object.assign({}, CFG, { view: side }), true);
      host.querySelectorAll('.l3-views [data-v]').forEach(b => { b.classList.toggle('on', b.dataset.v === side); b.onclick = () => { V.setView(b.dataset.v, true, 0); host.querySelectorAll('.l3-views button').forEach(x => x.classList.toggle('on', x === b)); }; });
      this._loc3d = { host, A, V }; this.loc3dScene();
    },
    loc3dEx() { const d = this.dossier, W = this.ui.ce || {}; return d && W.exId ? S.byId(d.explorations, W.exId) : null; },
    /** électrodes reconstruites (affichage du patient) et projet en surimpression */
    loc3dScene() {
      const L = this._loc3d, A = this.patientAnat; if (!L || !L.V || !A) return; const V = L.V, ex = this.loc3dEx(); if (!ex) return;
      const T = A.toDisplay, W = this.ui.ce || {}, rows = this.locRows(ex), Rx = SV.RealElec && SV.RealElec.realElectrode; if (!Rx) return;
      const mp = p => M4.apply(T, p[0], p[1], p[2]), els = [];
      for (const r of rows) {
        const o = r.it || (r.spec && r.spec.real); if (!o || !o.contacts || !o.contacts.length) continue;
        const C = o.contacts.map(mp), tip = mp(o.tip || o.contacts[0]), entry = mp(o.entry || o.contacts[o.contacts.length - 1]);
        els.push(Rx({ id: r.row, name: r.name, hemi: (r.it && r.it.hemi) || (r.spec && r.spec.hemi) || (tip[0] < 0 ? 'L' : 'R'), maker: this.exMaker ? this.exMaker(ex) : 'DIXI' }, { tipW: tip, entryW: entry }, C, A.labelVol, this.atlas));
      }
      V.setElectrodes(els, W.selRow || null);
      const plan = [];
      if (this.ui.loc3dPlan !== false) {
        const specs = (ex.implant && ex.implant.adopted && ex.implantPlan ? ex.implantPlan.electrodes : ex.electrodes).filter(hasPlan);
        for (const s of specs) { try { const e = this.buildElectrodeFor(s, 'patient', 'plan'); if (e && e.contacts && e.contacts.length) plan.push(Object.assign({}, e, { name: s.name })); } catch (err) { /* électrode prévue hors du cerveau */ } }
      }
      V.setGhostElectrodes(plan.length ? [{ key: 'plan', color: PLAN_COL, labels: true, tag: '', list: plan }] : []);
    },
    /** noms du projet classés par distance à la trajectoire reconstruite (monde du T1) */
    loc3dNames(ex, row) {
      const o = row.it || (row.spec && row.spec.real); if (!o) return [];
      const specs = (ex.implant && ex.implant.adopted && ex.implantPlan ? ex.implantPlan.electrodes : ex.electrodes).filter(hasPlan), out = [];
      for (const s of specs) { const w = this.specWorld && this.specWorld(s, 'plan'); if (!w || !w.tip) continue; out.push({ name: s.name, d: lineDist(o.contacts, w.tip, w.entry) }); }
      return out.sort((a, b) => a.d - b.d);
    },
    /** clic dans la vue 3D : électrode choisie, noms proposés */
    loc3dPick(kind, ev) {
      if (kind !== 'click') return; const L = this._loc3d, lp = L && L.V && L.V.lastPick; if (!lp || (lp.kind !== 'electrode' && lp.kind !== 'contact')) return;
      const ex = this.loc3dEx(), rows = ex ? this.locRows(ex) : [], r = rows.find(x => x.row === lp.eid); if (!r) return;
      this.locCheckRow(ex, r); this.loc3dScene();
      if (!r.it) return;   // électrode enregistrée hors de la liste de reconstruction : renommage dans la liste
      const names = this.loc3dNames(ex, r), taken = new Set(rows.filter(x => x !== r).map(x => nn(x.name)));
      const items = [{ head: `${r.name} — renommer` }];
      for (const c of names.slice(0, 6)) items.push({ label: `${c.name}${nn(c.name) === nn(r.name) ? ' ✓' : ''} · ${c.d.toFixed(0)} mm du projet${taken.has(nn(c.name)) ? ' (déjà pris)' : ''}`, run: () => this.loc3dRename(ex, r, c.name) });
      items.push({ label: 'autre nom…', run: () => { const inp = document.querySelector('#imElec .lc-row.sel input.nm'); if (inp) { inp.focus(); inp.select(); } } });
      this.popupMenu(items, ev ? ev.clientX : 200, ev ? ev.clientY : 200);
    },
    loc3dRename(ex, r, name) {
      if (!r.it || nn(r.it.name) === nn(name)) return;
      if (this.locRows(ex).some(x => x !== r && nn(x.name) === nn(name))) this.toast(`${name} : nom déjà porté par une autre électrode de la liste (une seule des deux peut être enregistrée)`, 5000);
      r.it.name = name; const det = ex.ctDetect; if (det) det.dirty = true;
      this.touch('exploration', ex.id, 'électrode ' + name); this.renderElectrodeCard($('imElec')); if (this.sliceMarkers) this.sliceMarkers();
    },
  };
  Object.assign(SV.app, M);
  // la liste redessinée (nom, modèle, plots, sélection) : la 3D suit
  const rl0 = SV.app.renderLocList;
  if (rl0) SV.app.renderLocList = function () { const r = rl0.apply(this, arguments); if (this.ui.screen === 'loc' && this._loc3d) { clearTimeout(this._l3t); this._l3t = setTimeout(() => this.loc3dScene(), 60); } return r; };
  SV.Bus.on('nav:after', function () { if (this.ui.screen !== 'loc' || !$('loc3d')) this.loc3dDestroy(); }, 'loc3d');
})(window.SV = window.SV || {});
