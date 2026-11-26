/* EpiScope — seizure_layers.js (v3.2.0) : une crise SEEG ouverte, ses plots marqués et ses quantifications.
 *
 *   - onglet « Quantifs » (à côté d'Électrique, Réseau à t, Origine…) : jeux de valeurs de l'onglet Analyses rattachés à
 *     la crise ouverte (EI, cEI, PEI, empreinte, EM… : S.seizureQuantIds), affichables dans la vue active et modifiables,
 *     avec leur accord avec l'analyse visuelle (plots de début parmi les valeurs les plus fortes) ;
 *   - plots de début, de propagation précoce et tardive dans les coupes (comme dans la vue 3D), case « plots de la crise »
 *     de « Multimodalité ▾ » ; parcellation « régions des plots de la crise » ;
 *   - cortex 3D : coloré par l'activation du modèle (défaut), par les régions des plots marqués (peinture 'szOnset'), ou
 *     neutre — « Affichage ▾ › Crise SEEG », comme les coupes ; les plots marqués se masquent aussi.        */
(function (SV) {
  'use strict';
  const $ = id => document.getElementById(id), S = SV.Store, Q = SV.Seeg, esc = SV.U.esc, A = SV.app;
  const ROLE_COL = { onset: '#ff4d5e', early: '#ff9f43', late: '#ffd23f' }, ROLE_FR = { onset: 'début', early: 'propagation précoce', late: 'propagation tardive' };
  const rgb = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const nf = v => (+v).toLocaleString(SV.LOC, { maximumFractionDigits: 2 });

  const M = {
    /** plots marqués de la crise ouverte : { 'A’1': 'onset' | 'early' | 'late' } */
    szRoles() { const sz = this.currentSeizure && this.currentSeizure(); return (sz && sz.seeg && sz.seeg.onset) || {}; },
    /** régions (parcellation de l'anatomie affichée) des plots marqués : Map(région → rôle le plus précoce) */
    szOnsetRegions() {
      const R = this.szRoles(), out = new Map(), lab = this.quantLabeler ? this.quantLabeler() : null, rank = { onset: 0, early: 1, late: 2 };
      if (!this.elecs || !this.quantContactRegion) return out;
      for (const [k, role] of Object.entries(R)) {
        const m = k.match(/^(.*?)(\d+)$/); if (!m) continue; const e = Q.findElec(this.elecs, m[1]); if (!e) continue;
        const r = this.quantContactRegion(e, +m[2], lab); if (!r) continue; if (!out.has(r) || rank[role] < rank[out.get(r)]) out.set(r, role);
      }
      return out;
    },
    szOnsetPaint() { const map = new Map(); for (const [r, role] of this.szOnsetRegions()) { const c = rgb(ROLE_COL[role]); map.set(r, [c[0], c[1], c[2], role === 'onset' ? 0.9 : role === 'early' ? 0.75 : 0.6]); } return map; },

    // ---------------------------------------------------------------- onglet « Quantifs »
    szQuantSets(sz) { const ids = S.seizureQuantIds(this.dossier, sz && sz.id); return ((this.state && this.state.quant) || []).filter(q => ids.has(q.id)).sort((a, b) => (this.quantMethodRank ? this.quantMethodRank(a) - this.quantMethodRank(b) : 0)); },
    renderSzQuant() {
      const box = $('tab-szquant'); if (!box) return; const sz = this.currentSeizure && this.currentSeizure();
      if (!sz || !this.state) { box.innerHTML = '<div class="hint">Ouvrez une crise.</div>'; return; }
      this.ensureSeeg(); const sets = this.szQuantSets(sz), R = this.szRoles(), onsetKeys = Object.keys(R).filter(k => R[k] === 'onset');
      // accord avec l'analyse visuelle : plots de début parmi les 5 valeurs les plus fortes de chaque jeu
      const agree = q => {
        if (!onsetKeys.length) return ''; const top = Object.entries(q.values || {}).filter(([, v]) => isFinite(+v)).sort((a, b) => b[1] - a[1]).slice(0, 5), hit = new Set();
        for (const [k] of top) { const p = Q.parseLabel(k); if (!p) continue; for (const c of [p.c1, p.c2].filter(x => x != null)) { const key = Object.keys(R).find(x => Q.normName(x).toLowerCase() === Q.normName(p.elec + c).toLowerCase()); if (key && R[key] === 'onset') hit.add(key); } }
        return `<div class="szq-agree small${hit.size ? ' ok-t' : ' muted'}" title="plots marqués « début » (analyse visuelle) parmi les cinq valeurs les plus fortes du jeu">début visuel dans les 5 premières valeurs : ${hit.size}/${onsetKeys.length}${hit.size ? ' (' + esc([...hit].join(', ')) + ')' : ''}</div>`;
      };
      box.innerHTML = `<div class="hint">Quantifications de l’onglet Analyses rattachées à <b>${esc(sz.label)}</b>, en plus de l’analyse visuelle (onglet Électrique). L’œil affiche le jeu dans la vue active (plots et régions colorés) ; un jeu ouvert montre ses valeurs, modifiables.</div>
        ${sets.length ? `<div class="qx-list szq">${sets.map(q => `<div class="szq-row" data-q="${esc(q.id)}">${this.quantRowHtml(q)}${agree(q)}</div>`).join('')}</div>`
          : `<div class="muted small" style="margin:10px 0">Aucun jeu pour cette crise : Analyses › tracé de la crise › EI, cEI, PEI, empreinte…</div>`}
        <div class="btnrow"><button class="mini-btn" data-a="an">Analyses ›</button></div>`;
      box.querySelectorAll('.szq-row .qx-row').forEach(card => { const q = sets.find(x => x.id === card.dataset.q); if (q) this.quantRowBind(card, q); });
      box.querySelector('[data-a=an]').onclick = () => { if (this.setWorkMode) this.setWorkMode('quant'); };
    },

    // ---------------------------------------------------------------- coupes
    /** plots marqués de la crise par-dessus les électrodes des coupes */
    szSliceMarkers() {
      const S3 = this.slices, R = this.szRoles(); if (!S3 || !this.quantWorldPos) return; const keys = Object.keys(R); if (!keys.length) return;
      const out = []; for (const k of keys) { const pos = this.quantWorldPos(k); if (!pos) continue; out.push({ p: pos.p, r: R[k] === 'onset' ? 2.0 : 1.6, color: ROLE_COL[R[k]], solid: true, label: k, showLabel: R[k] === 'onset', szk: k }); }
      if (!out.length) return; const rank = { late: 0, early: 1, onset: 2 }; out.sort((a, b) => rank[R[a.szk]] - rank[R[b.szk]]);
      S3.setMarkers((S3.markers || []).filter(m => !m.szk).concat(out));
    },

    // ---------------------------------------------------------------- vue 3D : réglages de la crise SEEG
    szCortexMode(c) { return c.paint === 'szOnset' ? 'onset' : c.neutral ? 'none' : 'act'; },
  };
  Object.assign(A, M);

  // ---------------------------------------------------------------- greffes (explicites)
  /** peinture des régions des plots marqués ; coupes à jour quand les marques changent */
  SV.Hooks.wrap(A, 'refreshMarkers', function (orig) {
    const r = orig();
    try {
      const V3 = this.viewer;
      if (V3) {
        if (this.ui.wm === 'semioSeeg') V3.setPaint('szOnset', this.szOnsetPaint());
        else V3.cells.forEach((c, i) => { if (c.cfg.paint === 'szOnset') V3.setCellConfig(i, { paint: null }, true); });
      }
      if (this.ui.wm === 'semioSeeg' && this.slices && this._ipHost && this._ipHost.id === 'sliceDock') {
        if (this.sliceMarkers) this.sliceMarkers();
        const st = this.slvState(); if (st.labels === 'onset' || (st.extraLabs || []).includes('onset')) this.updateImagingLayers();
      }
      if (this.ui.tab === 'szquant') this.renderSzQuant();
    } catch (e) { console.warn(e); }
    return r;
  }, 'seizure_layers');
  if (A.implantSliceMarkers) SV.Hooks.wrap(A, 'implantSliceMarkers', function (orig) {
    const r = orig(); if (r && this.ui.wm === 'semioSeeg' && this.slvState().showOnset !== false) this.szSliceMarkers(); return r;
  }, 'seizure_layers');
  /** onglet Quantifs : rendu à l'ouverture */
  SV.Hooks.wrap(A, 'setTab', function (orig, tab) { const r = orig(); const el = $('tab-szquant'); if (el) el.hidden = tab !== 'szquant'; if (tab === 'szquant') this.renderSzQuant(); return r; }, 'seizure_layers');
  /** la liste suit les réglages des jeux (renderQuant est appelé après chaque modification d'un jeu) */
  SV.Hooks.wrap(A, 'renderQuant', function (orig) { const r = orig(); if (this.ui.tab === 'szquant') this.renderSzQuant(); return r; }, 'seizure_layers');
  /** « Affichage ▾ » : cortex et plots de la crise SEEG */
  if (A.dispExtraHtml) SV.Hooks.wrap(A, 'dispExtraHtml', function (orig, ci) {
    const h0 = orig() || ''; if (this.ui.wm !== 'semioSeeg' || !this.viewer) return h0; const c = this.viewer.cells[ci == null ? this.viewer.active : ci].cfg, mode = this.szCortexMode(c);
    return h0 + `<div class="v2-sec sz-disp"><div class="row" title="couleur du cortex et des plots dans cette vue"><span>Crise SEEG</span><div class="seg">${[['act', 'activation', 'plausibilité d’activation du modèle (cortex et plots)'], ['onset', 'plots marqués', 'régions des plots marqués début (rouge), précoce (orangé), tardive (jaune)'], ['none', 'aucune', 'cortex et plots neutres']].map(([k, l, t]) => `<button data-szc="${k}" class="${mode === k ? 'on' : ''}" title="${t}">${l}</button>`).join('')}</div></div>
      <div class="chips"><label class="chip"><input type="checkbox" data-szm="1"${c.onsetMarks !== false ? ' checked' : ''}> plots de début et de propagation</label></div></div>`;
  }, 'seizure_layers');
  if (A.dispExtraBind) SV.Hooks.wrap(A, 'dispExtraBind', function (orig, panel, ci) {
    const r = orig(); const V3 = this.viewer; if (!V3 || !panel.querySelector('.sz-disp')) return r; const i0 = ci == null ? V3.active : ci;
    const all = cfg => { const lk = $('chkLink'); if (lk && lk.checked) V3.cells.forEach((_, i) => V3.setCellConfig(i, cfg, true)); else V3.setCellConfig(i0, cfg, true); };
    panel.querySelectorAll('[data-szc]').forEach(b => b.onclick = () => { const k = b.dataset.szc; if (k === 'onset') V3.setPaint('szOnset', this.szOnsetPaint()); all(k === 'act' ? { neutral: false, paint: null } : k === 'onset' ? { neutral: false, paint: 'szOnset' } : { neutral: true, paint: null }); panel.querySelectorAll('[data-szc]').forEach(x => x.classList.toggle('on', x === b)); });
    const m = panel.querySelector('[data-szm]'); if (m) m.onchange = () => all({ onsetMarks: m.checked });
    return r;
  }, 'seizure_layers');

  SV.SzLayers = { ROLE_COL, ROLE_FR };
})(window.SV = window.SV || {});
