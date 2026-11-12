/* EpiScope — pres3d.js : vues 3D « manipulables » et réseaux des hypothèses du staff.
 *   - open3dPopup(titre, réglage) : une seconde visionneuse 3D dans une fenêtre par-dessus l'écran (ou la présentation),
 *     que l'on fait tourner et zoomer à la souris ; réglage(V) configure la scène (couches, peinture, électrodes, activations) ;
 *   - réseau d'une hypothèse du staff (ZE, propagation) : nœuds sur ses régions, faisceaux de la ZE vers chaque région de
 *     propagation selon la connectivité du modèle (la plus forte depuis la ZE), liens de synchronisation, étiquettes ;
 *     le cortex prend la couleur de l'hypothèse (ZE = 1, propagation = 0,5) ;
 *   - scènes réutilisées par les captures (présentation, compte rendu) et par la vue interactive.
 *   Les ROI annotées sur l'imagerie ne sont jamais montrées dans ces vues.                                           */
(function (SV) {
  'use strict';
  const $ = id => document.getElementById(id), S = SV.Store;
  const esc = SV.U.esc;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const HYP_KEY = 'h95';   // clé de couche « hNN » attendue par les titres de cellule, hors des indices des hypothèses d'une crise
  const BASE = { inflate: 0, opacity: 1, sub: true, subFilter: 'all', subOpacity: 0.95, subHemi: 'both', subFams: null, fibers: false, nodes: false, sync: false, netLabels: false, hubLabels: false, electrodes: false, labels: false, thermo: false, stims: false, ccep: false, quant: null, neutral: false, tilt: 0, frontGlass: true, hyps: [], paint: null, zones: null, borders: false, hemi: 'both', elecHemi: 'both', probe: false, rois: false, title: '', viewFr: '', slices3d: false, clip: '' };

  const M = {
    /** connectivité du modèle sur l'atlas affiché (mise en cache) */
    modelC(atlas) { atlas = atlas || (this.viewer && this.viewer.atlas) || this.atlas; if (!this._Cm || this._Cm.atlas !== atlas) this._Cm = { atlas, C: atlas.buildConnectivity(Object.assign({}, SV.Model.DEFAULT_PARAMS)) }; return this._Cm.C; },
    /** réseau d'une hypothèse du staff : { net (couche), act (Float32Array) } */
    staffHypNet(H, atlas) {
      atlas = atlas || (this.viewer && this.viewer.atlas) || this.atlas; const N = atlas.N, C = this.modelC(atlas);
      const ez = (H.ez || []).filter(r => r > 0 && r < N), prop = (H.prop || []).filter(r => r > 0 && r < N && !ez.includes(r)), edges = [];
      const cc = (i, j) => Math.max(C[i * N + j], C[j * N + i]);
      for (const j of prop) { let bi = 0, bc = -1; for (const i of ez) { const c = cc(i, j); if (c > bc) { bc = c; bi = i; } } if (bi) edges.push({ from: bi, to: j, strength: Math.max(0.25, bc), t0: 0.2, t1: 1.2, t: 1.2, sync: bc }); }
      for (let a = 0; a < ez.length; a++) for (let b = a + 1; b < ez.length; b++) { const c = cc(ez[a], ez[b]); if (c >= 0.12) edges.push({ from: ez[a], to: ez[b], strength: Math.max(0.3, c), t0: 0, t1: 1, t: 1, sync: c }); }
      const mx = Math.max(1e-6, ...edges.map(e => e.strength)); edges.forEach(e => { e.strength = e.strength / mx; });
      const nodes = ez.map(r => ({ region: r, peak: 1 })).concat(prop.map(r => ({ region: r, peak: 0.6 })));
      const sync = []; for (let a = 0; a < nodes.length; a++) for (let b = a + 1; b < nodes.length; b++) { const c = cc(nodes[a].region, nodes[b].region); if (c >= 0.35) sync.push({ a: nodes[a].region, b: nodes[b].region, c }); }
      const lab = r => esc(atlas.label(r).replace(/ [GD]$/, ''));
      const labels = ez.slice(0, 5).map(r => ({ region: r, text: lab(r), sub: 'zone épileptogène', origin: true })).concat(prop.slice(0, 5).map(r => ({ region: r, text: lab(r), sub: 'propagation' })));
      const act = new Float32Array(N); for (const r of prop) act[r] = 0.5; for (const r of ez) act[r] = 1;
      return { net: { edges, nodes, sync, labels }, act };
    },
    /** côté d'une hypothèse du staff */
    staffHypSide(H, atlas) { atlas = atlas || this.atlas; return H.side === 'R' ? 'R' : H.side === 'L' ? 'L' : (H.ez.length && atlas.hemiOf[H.ez[0]] === 'R' ? 'R' : 'L'); },
    /** scène « hypothèse du staff » dans la visionneuse V (cellule 0) */
    sceneStaffHyp(V, H, i) {
      const { net, act } = this.staffHypNet(H, V.atlas), side = this.staffHypSide(H, V.atlas);
      V.setLayer(HYP_KEY, net, SV.hypColor(i)); V.setActivations(act, { [HYP_KEY]: act }, -1); if (V.setTime) V.setTime(30);
      V.setCellConfig(0, Object.assign({}, BASE, { hyps: [HYP_KEY], opacity: 0.32, fibers: true, nodes: true, sync: true, netLabels: true, hemi: side, view: side === 'L' ? 'latL' : 'latR' }), true);
      return { side, views: [[side === 'L' ? 'latL' : 'latR', 'face latérale'], [side === 'L' ? 'medL' : 'medR', 'face médiale']] };
    },
    sceneClear(V) { V.removeLayer(HYP_KEY); },

    // ------------------------------------------------------------------ fenêtre 3D interactive
    /** fenêtre par-dessus l'écran : seconde visionneuse ; setup(V) configure la scène ; o = { legend (html), views: [[vue, libellé]] } */
    open3dPopup(title, setup, o) {
      o = o || {}; const host = this._pres ? $('presentation') : document.body;
      const old = document.querySelector('.pop3d'); if (old && old._close) old._close();
      const el = document.createElement('div'); el.className = 'pop3d';
      el.innerHTML = `<div class="pop3d-card"><div class="pop3d-head"><b>${esc(title)}</b><span class="muted small">glisser : tourner · molette : zoom · clic droit + glisser : déplacer</span><span class="spacer"></span><div class="seg pop3d-views"></div><button class="pop3d-x" title="fermer (Échap)">✕</button></div><div class="pop3d-view"></div>${o.legend ? `<div class="pop3d-leg">${o.legend}</div>` : ''}</div>`;
      host.appendChild(el);
      let V = null;
      const close = () => { document.removeEventListener('keydown', key, true); try { if (V) V.destroy(); } catch (e) { } el.remove(); };
      const key = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); } };
      el._close = close; document.addEventListener('keydown', key, true);
      el.querySelector('.pop3d-x').onclick = close; el.onclick = e => { if (e.target === el) close(); };
      requestAnimationFrame(() => {
        try {
          V = new SV.Viewer3D(el.querySelector('.pop3d-view'), (this.viewer && this.viewer.atlas) || this.atlas, () => { });
          if (V.mode !== 'webgl') { el.querySelector('.pop3d-view').innerHTML = '<div class="hint" style="padding:30px">Vue 3D interactive indisponible (rendu logiciel).</div>'; return; }
          const r = setup(V) || {}, views = o.views || r.views || [];
          // v5.2 : les deux hémisphères sur les vues latérales, supérieure, inférieure… ; la face médiale montre son hémisphère seul
          const show = (v, anim) => { V.setView(v, anim, 0); V.setCellConfig(0, { hemi: /^med/.test(v) ? v.slice(-1) : 'both' }, true); };
          const seg = el.querySelector('.pop3d-views'); seg.innerHTML = views.map(([v, l]) => `<button data-v="${v}">${esc(l)}</button>`).join('');
          seg.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { show(b.dataset.v, true); seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); });
          const first = seg.querySelector('button'); if (first) { first.classList.add('on'); show(first.dataset.v, false); }
        } catch (e) { console.error(e); el.querySelector('.pop3d-view').innerHTML = `<div class="hint" style="padding:30px">Vue 3D indisponible : ${esc(e.message)}</div>`; }
      });
      return el;
    },
    /** hypothèse du staff en 3D interactive */
    openStaffHyp3d(H, i) { this.open3dPopup(`H${i + 1} · ${H.title}`, V => this.sceneStaffHyp(V, H, i), { legend: `<span><i style="background:${SV.hypCss(i)}"></i>réseau de l’hypothèse</span><span>nœuds pleins : zone épileptogène · nœuds plus petits : propagation · faisceaux selon la connectivité du modèle</span>` }); },
    /** électrodes d'une exploration (déjà construites) en 3D interactive */
    openImplant3d(title, els, legend) {
      this.open3dPopup(title, V => {
        V.setElectrodes(els || []); if (V.setElectrodeStyle) V.setElectrodeStyle('dark-bg');
        V.setCellConfig(0, Object.assign({}, BASE, { opacity: 0.3, electrodes: true, labels: true, sub: true, subFilter: 'noCb', subOpacity: 0.3, view: 'latL', neutral: true }), true);
        const hs = [...new Set((els || []).map(e => e.hemi))];
        return { views: [['latL', 'latéral G'], ['latR', 'latéral D'], ['infRad', 'inférieur'], ['ant', 'face'], ['sup', 'supérieur']].filter(([v]) => !(v === 'latL' && hs.length === 1 && hs[0] === 'R') && !(v === 'latR' && hs.length === 1 && hs[0] === 'L')) };
      }, { legend });
    },
    /** électrodes d'une SEEG avec ses stimulations (kind 'stim') ou ses thermocoagulations ('thermo') en 3D interactive */
    openSeeg3d(title, els, markers, kind, legend, o) {
      const set = (o && o.set) || (kind === 'stim' ? 'all' : null);   // v5.2 : stimulations — 'elec', 'func', 'subj' ; analyses — identifiant du jeu
      this.open3dPopup(title, V => {
        V.setElectrodes(els || []); if (V.setElectrodeStyle) V.setElectrodeStyle('dark-bg');
        V.setMarkers((markers || []).filter(m => m.kind === kind && (!set || m.set === set) && (kind !== 'thermo' || m.status !== 'rejected')));
        V.setCellConfig(0, Object.assign({}, BASE, { opacity: 0.3, electrodes: true, labels: true, sub: true, subFilter: 'noCb', subOpacity: 0.3, neutral: kind !== 'quant', stims: kind === 'stim', stimSet: kind === 'stim' ? set : 'all', thermo: kind === 'thermo', quant: kind === 'quant' ? set : null, view: 'latL' }), true);
        const hs = [...new Set((els || []).map(e => e.hemi))];
        return { views: [['latL', 'latéral G'], ['latR', 'latéral D'], ['medL', 'mésial G'], ['medR', 'mésial D'], ['infRad', 'inférieur'], ['sup', 'supérieur']].filter(([v]) => !(/L$/.test(v) && hs.length === 1 && hs[0] === 'R') && !(/R$/.test(v) && hs.length === 1 && hs[0] === 'L')) };
      }, { legend });
    },
    /** proposition chirurgicale en 3D interactive */
    openSurgery3d(title, regions, extent, hyps, side) {
      this.open3dPopup(title, V => {
        V.setPaint('surgery_pop', this.surgeryPaint(regions, extent || {}, hyps || []));
        side = side || (regions.length ? V.atlas.hemiOf[regions[0]] : 'L');
        V.setCellConfig(0, Object.assign({}, BASE, { paint: 'surgery_pop', sub: true, subFilter: 'mtl', subHemi: side, hemi: side, borders: true, view: side === 'L' ? 'latL' : 'latR' }), true);
        return { views: [[side === 'L' ? 'latL' : 'latR', 'latérale'], ['infRad', 'inférieure'], [side === 'L' ? 'medL' : 'medR', 'médiale']] };
      }, { legend: '<span><i style="background:rgb(220,62,62)"></i>résection</span><span><i style="background:rgb(240,150,70)"></i>partielle</span><span><i style="background:rgb(140,20,50)"></i>ZE comprise</span><span><i style="background:rgb(78,168,255)"></i>ZE hors résection</span>' });
    },
    /** réseau d'une hypothèse récurrente (synthèse des crises) en 3D interactive */
    openSynthHyp3d(hy, title) {
      const sz = hy && S.byId(this.dossier.seizures, hy.seizureId); if (!sz) return;
      this.open3dPopup(title || `H${hy.k + 1} · ${hy.name} ${hy.hemi === 'L' ? 'gauche' : 'droit'} (synthèse)`, V => {
        const r = this.seizureModel(sz), H = r.hypotheses.find(x => x.name === hy.name && x.hemi === hy.hemi); if (!H) return {};
        SV.Model.hypothesisDynamics(r, H);
        const A = V.atlas, labels = H.trajectory.filter(n => n.origin || n.signs.length).slice(0, 9).map(n => ({ region: n.region, text: esc(A.label(n.region).replace(/ [GD]$/, '')), sub: n.origin ? 'origine supposée' : n.signs.slice(0, 3).map(s => s.label_fr).join(', '), origin: !!n.origin }));
        V.setLayer(HYP_KEY, Object.assign({}, H.network, { labels, _hyp: H }), SV.hypColor(hy.k));
        const tH = Math.min(r.tmax, H.trajectory[H.trajectory.length - 1].t + 2), kk = Math.max(0, Math.min(r.T - 1, Math.round((tH - r.tmin) / r.params.step)));
        V.setActivations(r.A.subarray(kk * r.N, (kk + 1) * r.N), { [HYP_KEY]: H.A.subarray(kk * r.N, (kk + 1) * r.N) }, -1); if (V.setTime) V.setTime(tH);
        V.setCellConfig(0, Object.assign({}, BASE, { hyps: [HYP_KEY], opacity: 0.3, fibers: true, nodes: true, sync: true, netLabels: true, view: H.hemi === 'L' ? 'latL' : 'latR' }), true);
        return { views: [[H.hemi === 'L' ? 'latL' : 'latR', 'latérale'], [H.hemi === 'L' ? 'medL' : 'medR', 'médiale'], ['sup', 'supérieure'], ['infRad', 'inférieure']] };
      });
    },
    /** v5.2 — régions candidates (score d'origine consensuel des crises) en 3D interactive */
    openSynthCand3d(cons, title) {
      if (!cons || !cons.n) return; const f = cons.pL >= 0.5 ? 'L' : 'R', o = f === 'L' ? 'R' : 'L';
      this.open3dPopup(title || 'Régions candidates', V => {
        V.setPaint('cand_pop', this.synthCandPaint(cons, V.atlas));
        V.setCellConfig(0, Object.assign({}, BASE, { paint: 'cand_pop', borders: true, subFilter: 'noCb', view: 'lat' + f }), true);
        return { views: [['lat' + f, 'latérale ' + (f === 'L' ? 'G' : 'D')], ['med' + f, 'médiale ' + (f === 'L' ? 'G' : 'D')], ['lat' + o, 'latérale ' + (o === 'L' ? 'G' : 'D')], ['med' + o, 'médiale ' + (o === 'L' ? 'G' : 'D')], ['sup', 'supérieure'], ['infRad', 'inférieure']] };
      }, { legend: this.synthLegendHtml ? this.synthLegendHtml().replace(/<\/?div[^>]*>/g, '').replace('style="background', 'style="width:70px;background') : '' });
    },
  };
  Object.assign(SV.app, M);
  SV.Pres3D = { BASE, HYP_KEY };
})(window.SV = window.SV || {});
