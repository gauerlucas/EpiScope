/* EpiScope — surgery.js : propositions chirurgicales du staff, interventions standard et visualisation.
 *
 * Gabarits d'intervention exprimés en familles VEP, avec l'étendue de la résection (1 = région emportée, 0,5 = en
 * partie) ; le côté choisi donne les régions de l'hémisphère. Repères : Falconer, Penfield ; Spencer 1984 ;
 * Yaşargil / Wieser 1982 ; Wiebe et al. 2001 (ERSET). Les étendues sont indicatives (régions VEP = parcelles, pas
 * centimètres) : la planification réelle se fait sur l'IRM du patient.
 *   - lobectomie temporale antérieure réglée : néocortex temporal antérieur (T1 respectée du côté dominant pour le
 *     langage) + structures mésiales (amygdale, hippocampe, parahippocampe) ;
 *   - résection antéro-mésiale (Spencer) : pôle, T2–T3 antérieurs en partie, structures mésiales ;
 *   - amygdalo-hippocampectomie sélective : amygdale, hippocampe, cortex entorhinal / parahippocampique antérieur ;
 *   - sur mesure : ZE des hypothèses retenues, lésion déclarée, ou régions choisies.
 * Visualisation : vues (latérale, inférieure, médiale en verre) peintes — résection en rouge (partielle en orangé), ZE
 * des hypothèses comprise dans la résection en rouge sombre, ZE hors résection en bleu — et bilan de couverture.   */
(function (SV) {
  'use strict';
  const $ = id => document.getElementById(id), S = SV.Store, V = S.V;
  const esc = SV.U.esc;
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  const MESIAL = [['Amygdala', 1], ['Hippocampus-anterior', 1], ['Hippocampus-posterior', 0.5], ['Parahippocampal-cortex', 0.5], ['Rhinal-cortex', 1]];
  const TEMPLATES = {
    atl: { fr: 'lobectomie temporale antérieure réglée', type: 'lobectomy', ref: 'Falconer, Penfield ; Wiebe et al. 2001',
      fams: dominant => [['Temporal-pole', 1], ['T1-planum-polare', dominant ? 0.5 : 1], ['T1-lateral-anterior', dominant ? 0 : 1], ['STS-anterior', dominant ? 0.5 : 1], ['T2-anterior', dominant ? 0.5 : 1], ['ITS-anterior', 1], ['T3-anterior', 1], ['Fusiform-gyrus', 0.5], ['Occipito-temporal-sulcus', 0.5], ['Collateral-sulcus', 0.5]].concat(MESIAL),
      note: dominant => dominant ? 'côté dominant : T1 respectée, néocortex limité (~3,5–4 cm du pôle)' : 'côté non dominant : néocortex ~5 cm du pôle, T1 comprise' },
    amtr: { fr: 'résection antéro-mésiale (Spencer)', type: 'lobectomy', ref: 'Spencer et al. 1984',
      fams: () => [['Temporal-pole', 1], ['T2-anterior', 0.5], ['ITS-anterior', 0.5], ['T3-anterior', 0.5], ['Fusiform-gyrus', 0.5], ['Collateral-sulcus', 0.5]].concat(MESIAL), note: () => 'néocortex limité (~3–3,5 cm), T1 respectée' },
    sah: { fr: 'amygdalo-hippocampectomie sélective', type: 'resection', ref: 'Yaşargil, Wieser 1982',
      fams: () => [['Amygdala', 1], ['Hippocampus-anterior', 1], ['Hippocampus-posterior', 0.5], ['Rhinal-cortex', 0.5], ['Parahippocampal-cortex', 0.5]], note: () => 'voie trans-sylvienne ou sous-temporale ; néocortex respecté' },
    ez: { fr: 'résection sur mesure : ZE retenue', type: 'resection', custom: 'ez', note: () => 'régions de la zone épileptogène des hypothèses retenues' },
    lesion: { fr: 'lésionectomie', type: 'resection', custom: 'lesion', note: () => 'régions de la lésion déclarée' },
    custom: { fr: 'sur mesure (régions choisies)', type: 'resection', custom: 'manual', note: () => '' },
  };
  const COL = { res: [220, 62, 62, 0.92], part: [240, 150, 70, 0.8], ezIn: [140, 20, 50, 0.95], ezOut: [78, 168, 255, 0.95] };

  const M = {
    surgeryTemplates: TEMPLATES,
    /** régions et étendues d'un gabarit pour un côté : { regions: [], extent: {région: 0,5} } */
    surgeryRegions(key, side, ctx) {
      const T = TEMPLATES[key], d = this.dossier, A = this.atlas; if (!T) return { regions: [], extent: {} };
      if (T.custom === 'ez') { const R = [...new Set((ctx && ctx.hyps || []).flatMap(H => H.ez))].filter(r => !side || A.hemiOf[r] === side); return { regions: R, extent: {} }; }
      if (T.custom === 'lesion') { const R = S.lesionRegions(d).filter(r => !side || A.hemiOf[r] === side); return { regions: R, extent: {} }; }
      if (T.custom === 'manual') return { regions: (ctx && ctx.regions) || [], extent: (ctx && ctx.extent) || {} };
      const dominant = (d.patient.dominant || 'L') === side || d.patient.dominant === 'B', regions = [], extent = {};
      for (const [fam, e] of T.fams(dominant)) { if (!e) continue; const r = A.idx(fam, side); if (!r) continue; regions.push(r); if (e < 1) extent[r] = e; }
      return { regions, extent };
    },
    surgeryLabel(o) { const T = TEMPLATES[o.template]; return T ? T.fr + (o.side ? (o.side === 'L' ? ' gauche' : ' droite') : '') : (o.target || ''); },
    /** couverture : ZE des hypothèses comprise dans la résection */
    surgeryCoverage(regions, hyps) { const R = new Set(regions); return hyps.filter(H => H.ez.length).map(H => ({ H, in: H.ez.filter(r => R.has(r)), out: H.ez.filter(r => !R.has(r)) })); },
    /** peinture de la vue : résection (pleine / partielle), ZE comprise ou non */
    surgeryPaint(regions, extent, hyps) {
      const map = new Map(), ez = new Set((hyps || []).flatMap(H => H.ez)), R = new Set(regions);
      for (const r of regions) map.set(r, extent && extent[r] ? COL.part : COL.res);
      for (const r of ez) map.set(r, R.has(r) ? COL.ezIn : COL.ezOut);
      return map;
    },
    /** vues de la proposition : latérale, inférieure, médiale (verre) du côté opéré */
    surgeryShots(regions, extent, hyps, side, opt) {   // file d'attente : une seule capture à la fois (vue 3D partagée)
      return this.viewerTask(() => this._surgeryShots(regions, extent, hyps, side, opt));
    },
    async _surgeryShots(regions, extent, hyps, side, opt) {
      const V3 = this.viewer; if (!V3 || !regions.length && !(hyps || []).length) return [];
      side = side || (regions.length ? this.atlas.hemiOf[regions[0]] : 'L');
      V3.setPaint('surgery_shot', this.surgeryPaint(regions, extent, hyps));
      const restore = { layout: V3.layoutName, active: V3.active, cfgs: V3.cells.map(c => Object.assign({}, c.cfg, { hyps: c.cfg.hyps.slice() })) };
      V3.setLayout('single');
      V3.setCellConfig(0, { inflate: 0, opacity: 1, sub: true, subFilter: 'mtl', subOpacity: 0.95, subHemi: side, subFams: null, fibers: false, nodes: false, sync: false, netLabels: false, electrodes: false, labels: false, thermo: false, stims: false, ccep: false, quant: null, neutral: false, tilt: 0, frontGlass: true, hyps: [], paint: 'surgery_shot', hemi: side, borders: true, rois: false, zones: null, probe: false }, true);
      const imgs = [], scale = (opt && opt.scale) || 1.2;
      for (const [v, op] of [[side === 'L' ? 'latL' : 'latR', 1], ['infRad', 1], [side === 'L' ? 'medL' : 'medR', 0.45]]) {
        V3.setCellConfig(0, { opacity: op, hemi: side }, true); V3.setView(v, false); V3.setCellConfig(0, { hemi: side }, true); await new Promise(r => setTimeout(r, 140));
        imgs.push(V3.snapshot({ format: 'jpeg', quality: 0.88, scale, crop: true, orient: true }));
      }
      V3.setView(side === 'L' ? 'latL' : 'latR', false);   // caméra rendue à l'orientation habituelle
      V3.setLayout(restore.layout); restore.cfgs.forEach((cfg, i) => V3.setCellConfig(i, cfg, true)); V3.setActive(restore.active); V3.setPaint('surgery_shot', null); this.setTime(this.ui.t);
      return imgs;
    },

    // ================================================================ coupes de l'intervention (v5.2)
    /** coupes du T1 du patient, régions de l'intervention peintes comme dans ses vues 3D ; intervention réalisée (o.proc) :
     *  IRM post-opératoire associée (p.postopImagingId), en base ou superposée en gris — valeurs proches de 0 transparentes —
     *  au T1 pré-opératoire en rouge : la cavité laisse voir en rouge le cortex d'avant l'intervention.
     *  o = { key (contexte des coupes), regions, extent, hyps, proc, onChange } */
    async mountSurgerySlices(host, o) {
      const d = this.dossier, ref = d && S.refImaging(d); if (!host || !d) return;
      if (!ref) { host.innerHTML = '<div class="hint" style="padding:24px">Coupes : importez le T1 du patient (écran Imagerie).</div>'; return; }
      const p = o.proc || null, reg = im => !!(im && im.coreg && im.coreg.T), A = this.patientAnat;
      const cands = p ? d.imaging.filter(im => im !== ref && !im.derived && ['T1', 'T1c', 'T2', 'FLAIR', 'other'].includes(im.modality)).sort((a, b) => (['postop', 'followup'].includes(b.timepoint) - ['postop', 'followup'].includes(a.timepoint)) || String(b.date).localeCompare(String(a.date))) : [];
      const post = p && p.postopImagingId && S.byId(d.imaging, p.postopImagingId);
      this._slvSurg = { regions: o.regions || [], extent: o.extent || {}, hyps: o.hyps || [] }; this._slvForce = o.key; this._slvForceHost = host;
      const st = this.slvState(), mode = post ? (st.surgMode && (st.surgMode !== 'cmp' || reg(post)) ? st.surgMode : reg(post) ? 'cmp' : 'post') : 'pre';
      const MODES = [['pre', 'T1 pré-op', 'T1 de référence, régions de l’intervention peintes'], ['post', 'post-op', 'IRM post-opératoire, régions de l’intervention peintes'], ['cmp', 'pré / post', 'T1 pré-opératoire en rouge sous l’IRM post-opératoire en gris (fond transparent) : la cavité montre le cortex d’avant l’intervention']];
      const leg = mode === 'cmp' ? '<span><i style="background:rgb(205,38,30)"></i>T1 pré-opératoire</span><span><i style="background:#bbb"></i>IRM post-opératoire</span>' : '<span><i style="background:rgb(220,62,62)"></i>résection</span><span><i style="background:rgb(240,150,70)"></i>partielle</span><span><i style="background:rgb(140,20,50)"></i>ZE comprise</span><span><i style="background:rgb(78,168,255)"></i>ZE hors résection</span>';
      host.innerHTML = `<div class="ssl-bar">${p ? `<label title="IRM post-opératoire associée à l’intervention">IRM post-op <select class="ssl-post"><option value="">—</option>${cands.map(im => `<option value="${im.id}"${post === im ? ' selected' : ''}>${esc((V.modality[im.modality] || im.modality) + (im.date ? ' ' + new Date(im.date + 'T12:00:00').toLocaleDateString(SV.LOC) : '') + (im.timepoint ? ' · ' + (V.timepoint[im.timepoint] || '') : '') + (reg(im) ? '' : ' (non recalée)'))}</option>`).join('')}</select></label>
        <span class="seg">${MODES.map(([k, l, t]) => `<button data-m="${k}" title="${esc(t)}" class="${k === mode ? 'on' : ''}"${k !== 'pre' && !post || k === 'cmp' && !reg(post) ? ' disabled' : ''}>${l}</button>`).join('')}</span>` : ''}<span class="ssl-leg">${leg}</span></div>
        ${post && !reg(post) ? '<div class="hint ssl-warn">IRM post-opératoire non recalée sur le T1 : Imagerie › recaler, pour la superposer.</div>' : ''}${!A ? '<div class="hint ssl-warn">Régions : calculez l’anatomie du patient (écran Imagerie) pour les peindre sur son IRM.</div>' : ''}<div class="ssl-ip"></div>`;
      // calques du mode : T1 + régions ; IRM post-opératoire + régions ; T1 rouge sous l'IRM post-opératoire grise
      if (mode === 'pre') Object.assign(st, { base: null, baseKind: 'gray', overlays: [], labels: 'surg' });
      else if (mode === 'post') Object.assign(st, { base: post.id, baseKind: 'gray', overlays: [], labels: 'surg' });
      else Object.assign(st, { base: null, baseKind: 'red', overlays: [{ id: post.id, on: true, opacity: 1, kind: 'grayt' }], labels: 'none' });
      if (st.surgMode !== mode) { st.surgMode = mode; st.baseWin = null; }
      const again = () => this.mountSurgerySlices(host, o);
      host.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { this.slvState().surgMode = b.dataset.m; this.slvState().baseWin = null; again(); });
      const sel = host.querySelector('.ssl-post'); if (sel) sel.onchange = () => { p.postopImagingId = sel.value || null; this.slvState().surgMode = null; this.touch('procedure', p.id, 'IRM post-opératoire associée'); if (o.onChange) o.onChange(); again(); };
      const S3 = await this.mountImagingPanel(host.querySelector('.ssl-ip'), { key: o.key }); if (!S3 || !A) return S3;
      // curseur au centre des régions de l'intervention
      const C = (o.regions || []).map(r => (A.atlas && A.atlas.regions.find(x => x.index === r) || {}).centroid).filter(Boolean);
      if (C.length && A.fromDisplay && !host._sslC) { host._sslC = true; const m = [0, 1, 2].map(k => C.reduce((s0, c) => s0 + c[k], 0) / C.length); S3.setCursor(SV.Mat4.apply(A.fromDisplay, m[0], m[1], m[2])); }
      return S3;
    },

    // ================================================================ éditeur d'intervention (décision de staff, procédure)
    /** bloc « intervention » : gabarit, côté, régions, vues et couverture ; obj = décision ou procédure (champs template,
     *  side, targets|regions, extent) ; hyps = hypothèses à comparer */
    surgeryEditor(obj, hyps, onChange, kind) {
      const A = this.atlas, key = obj.targets ? 'targets' : 'regions', list = obj[key] || (obj[key] = []);
      if (!obj.extent) obj.extent = {};
      const box = h('div', 'surg-ed');
      const side0 = obj.side || (list.length ? A.hemiOf[list[0]] : (hyps.find(H => H.side === 'L' || H.side === 'R') || {}).side) || '';
      box.innerHTML = `<div class="form row4"><label class="span2">Intervention <select class="tpl"><option value="">—</option>${Object.entries(TEMPLATES).map(([k, T]) => `<option value="${k}"${obj.template === k ? ' selected' : ''}>${esc(T.fr)}</option>`).join('')}</select></label><label>Côté <select class="side"><option value="">—</option><option value="L"${side0 === 'L' ? ' selected' : ''}>gauche</option><option value="R"${side0 === 'R' ? ' selected' : ''}>droit</option></select></label><label>&nbsp;<span class="btnrow"><button class="mini-btn show3d" title="vue 3D manipulable (tourner, zoomer) dans une fenêtre">⟲ vue 3D</button><button class="mini-btn redraw" title="recalculer les vues">↻ vues</button></span></label></div>
        <div class="surg-note small muted"></div><div class="surg-wrap"><div class="surg-regs"><span class="lbl">Régions réséquées</span><div class="rp"></div><div class="surg-cov small"></div></div><div class="surg-viz"><div class="hint">vues : choisissez une intervention</div></div></div>
        <div class="surg-leg small"><i style="background:rgb(220,62,62)"></i> résection <i style="background:rgb(240,150,70)"></i> partielle <i style="background:rgb(140,20,50)"></i> ZE comprise <i style="background:rgb(78,168,255)"></i> ZE hors résection</div>`;
      const note = () => { const T = TEMPLATES[obj.template]; box.querySelector('.surg-note').textContent = T ? [T.note((this.dossier.patient.dominant || 'L') === (obj.side || side0)), T.ref].filter(Boolean).join(' · ') : ''; };
      const cov = () => { const c = this.surgeryCoverage(list, hyps); box.querySelector('.surg-cov').innerHTML = c.length ? c.map(x => `<div class="${x.out.length ? 'warn-t' : 'ok-t'}">${esc(x.H.title || 'hypothèse')} : ZE ${x.in.length}/${x.H.ez.length} dans la résection${x.out.length ? ' — hors : ' + x.out.map(r => esc(A.label(r))).join(', ') : ''}</div>`).join('') : '<span class="muted">aucune hypothèse avec ZE à comparer</span>'; };
      // vues mises en cache (même résection, mêmes ZE) : un nouveau rendu de l'écran ne relance pas les captures
      let tok = 0; const draw = async force => {
        const my = ++tok, viz = box.querySelector('.surg-viz'); if (!list.length) { viz.innerHTML = '<div class="hint">aucune région</div>'; return; }
        const key = JSON.stringify([list.slice().sort((a, b) => a - b), obj.extent, hyps.map(H => H.ez.slice().sort((a, b) => a - b)), obj.side || side0, this.anatMode]), C = this._surgCache || (this._surgCache = new Map());
        if (!force && C.has(key)) { viz.innerHTML = C.get(key).map(u => `<img src="${u}">`).join(''); return; }
        viz.innerHTML = '<div class="hint">vues…</div>'; const imgs = await this.surgeryShots(list, obj.extent, hyps, obj.side || side0, { scale: 0.9 }); C.set(key, imgs); if (C.size > 40) C.delete(C.keys().next().value);
        if (my !== tok) return; viz.innerHTML = imgs.map(u => `<img src="${u}">`).join('');
      };
      const rp = box.querySelector('.rp'), picker = () => { rp.innerHTML = ''; rp.appendChild(this.regionPicker(list, () => { for (const r of Object.keys(obj.extent)) if (!list.includes(+r)) delete obj.extent[r]; if (obj.template && TEMPLATES[obj.template] && !TEMPLATES[obj.template].custom) obj.template = 'custom'; box.querySelector('.tpl').value = obj.template || ''; cov(); onChange(); draw(); })); };
      const apply = () => {
        const side = box.querySelector('.side').value, k = box.querySelector('.tpl').value; obj.template = k; obj.side = side;
        if (k && TEMPLATES[k] && (TEMPLATES[k].custom !== 'manual')) { if (!side && !TEMPLATES[k].custom) { this.toast('Choisissez le côté'); return; } const R = this.surgeryRegions(k, side, { hyps }); list.splice(0, list.length, ...R.regions); obj.extent = R.extent; }
        if (k && 'text' in obj && (!obj.text || obj._autoText === obj.text)) { obj.text = obj._autoText = this.surgeryLabel(obj); const t = box.closest('.subcard') && box.closest('.subcard').querySelector('[data-f=text]'); if (t) t.value = obj.text; }
        if (k && 'target' in obj && (!obj.target || obj._autoText === obj.target)) { obj.target = obj._autoText = this.surgeryLabel(obj); const t = box.closest('.subcard') && box.closest('.subcard').querySelector('[data-f=target]'); if (t) t.value = obj.target; }
        if (k && kind === 'procedure' && TEMPLATES[k]) { obj.type = TEMPLATES[k].type; const t = box.closest('.subcard') && box.closest('.subcard').querySelector('[data-f=type]'); if (t) t.value = obj.type; }
        note(); picker(); cov(); onChange(); draw();
      };
      box.querySelector('.tpl').onchange = apply; box.querySelector('.side').onchange = apply;
      box.querySelector('.redraw').onclick = () => draw(true);
      box.querySelector('.show3d').onclick = () => this.openSurgery3d(this.surgeryLabel(obj) || 'Intervention', list, obj.extent, hyps, obj.side || side0);   // v5.2 : visionneuse légère, sans quitter l'écran
      note(); picker(); cov(); if (list.length) setTimeout(draw, 50);
      return box;
    },
  };
  Object.assign(SV.app, M);
  SV.Surgery = { TEMPLATES };
})(window.SV = window.SV || {});
