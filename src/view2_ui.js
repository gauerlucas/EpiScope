/* EpiScope — view2_ui.js : stimulations et thermocoagulations, interface des deux vues 3D allégée.
 *   Le neurologue passe de paire en paire, revient sur une cible, montre le résultat en staff : la barre de la 3D ne garde que
 *   l'essentiel (recentrer · gabarit / patient · coupes IRM · PNG · Affichage ▾) ; les réglages moins utiles (disposition,
 *   orientations, curseurs, éléments affichés, réglages complets d'une vue) passent dans le menu « Affichage ».
 *   Chaque vue porte sa légende, qui sert aussi de filtre :
 *     - vue du haut (stimulations et thermocoagulations) : résultats des stimulations — pastille par paire, couleur de la
 *       réponse ; filtre « toutes (réponse la plus forte) · crises / PD · subjectives · fonctionnelles » ;
 *     - vue du bas, stimulations : aire de cortex échantillonnée par la paire (estimation géométrique) ;
 *     - vue du bas, thermocoagulations : volumes des cibles par étape (planifiées, validées, réalisées, contre-indiquées :
 *       chaque étape s'affiche ou se masque d'un clic) et zones du Rapport SEEG (épileptogène, propagation précoce).
 *   La paire ou la cible active est cerclée d'un halo blanc (3D et coupes).
 *   PNG : l'image des deux vues avec leurs titres et leurs légendes (pour une présentation).                               */
(function (SV) {
  'use strict';
  const $ = id => document.getElementById(id), Q = SV.Seeg, TS = SV.Store;
  const esc = SV.U.esc;
  const rgb = c => `rgb(${c.map(x => Math.round(x)).join(',')})`;
  const TWO = ['stim', 'thermo'];
  const SETS = [['all', 'Toutes', 'réponse la plus forte de chaque paire'], ['elec', 'Crises / PD', 'crises et post-décharges'], ['subj', 'Subjectives', 'réponses subjectives (« début de crise », sensation bizarre…)'], ['func', 'Fonctionnelles', 'réponses fonctionnelles (langage, sensitives, motrices…)']];
  const KEY = ['sz', 'ad', 'subj', 'func', 'none'];
  const ZONE = { ez: [230, 30, 45], prop: [255, 125, 20] };
  const HEAT_CSS = 'linear-gradient(90deg, rgb(255,150,25), rgb(240,80,25), rgb(190,15,40))';
  const AREA_INFO = 'Aire estimée comme l’affichage SEEG sur le cortex de Brainstorm : interpolation de Shepard (1/d²) d’un indicateur valant 1 sur les plots stimulés et 0 sur les autres plots situés à moins du rayon, atténuée vers le rayon. Estimation géométrique, pas un modèle du champ électrique.';
  const VOL_INFO = 'Thermocoagulation bipolaire standard entre deux plots contigus : ellipsoïde centré entre les plots, grand axe le long de l’électrode. Ordre de grandeur publié : 3 à 6 mm de diamètre autour de l’électrode. Volume indicatif, à adapter aux paramètres utilisés (puissance, durée).';

  const M = {
    /** les deux vues sont affichées dans un mode stimulations / thermocoagulations */
    v2On() { const V3 = this.viewer; return !!V3 && this.ui.screen === 'work' && TWO.includes(this.ui.wm) && V3.layoutName === 'stim'; },
    /** met l'interface au diapason : barre allégée, titres courts, légendes des vues */
    v2Sync() {
      const V3 = this.viewer; if (!V3) return; const on = this.v2On();
      document.body.classList.toggle('cv2', on); this.v2Bar();
      if (V3.compactTitles !== on) { V3.compactTitles = on; V3._layoutCells(); }
      for (const c of V3.cells) { const old = c.el.querySelector('.v2-leg'); if (old && !on) old.remove(); }
      if (on) this.v2Legends();
      const b = $('btnV2Opts'); if (b) b.textContent = 'Affichage ▾';
    },
    /** boutons propres aux deux vues dans la barre de la 3D (créés une fois, visibles seulement en mode allégé) */
    v2Bar() {
      const row = document.querySelector('.viewbar .vrow'); if (!row || $('btnV2Center')) return;
      const c = document.createElement('button'); c.id = 'btnV2Center'; c.className = 'v2-only'; c.title = 'recentrer les deux vues sur la paire choisie'; c.innerHTML = '⌖ Recentrer';
      row.insertBefore(c, row.firstChild);
      const o = document.createElement('button'); o.id = 'btnV2Opts'; o.className = 'v2-only'; o.title = 'réglages des deux vues : éléments affichés, opacité, rayon de l’aire, volume théorique, réglages complets, réglages par défaut'; o.textContent = 'Affichage ▾';
      row.appendChild(o);
      c.onclick = () => { this._st3dKey = null; this.stim3dUpdate(); };
      o.onclick = e => this.v2Menu(e.currentTarget);
    },
    /** décompte des paires stimulées par type de réponse (légende de la vue du haut) */
    v2StimCounts() {
      const by = new Map(), n = { all: 0, sz: 0, ad: 0, subj: 0, func: 0, none: 0, elec: 0 };
      for (const s of (this.state && this.state.stims) || []) { const r = this.resolvePair(s); if (!r) continue; const L = by.get(r.key) || []; L.push(s); by.set(r.key, L); }
      for (const L of by.values()) { const t = Q.pairResponseTypes(L); n.all++; n[t[0]]++; if (t.includes('sz') || t.includes('ad')) n.elec++; if (t.includes('subj')) n.subj++; if (t.includes('func')) n.func++; }
      n.max = {}; for (const L of by.values()) { const t = Q.pairResponseTypes(L)[0]; n.max[t] = (n.max[t] || 0) + 1; }
      return n;
    },
    /** modèle des légendes : [{ cell, title?, seg?: [{k, label, on, title}], key: [{color, label, n?, on?, k?, grad?}], info? }] */
    v2LegendModel() {
      const V3 = this.viewer, tc = this.ui.wm === 'thermo', out = [];
      const c0 = V3.cells[0] && V3.cells[0].cfg, set = c0 ? (c0.stimSet === 'clin' ? 'func' : c0.stimSet || 'all') : 'all', n = this.v2StimCounts();
      const vis = set === 'all' ? KEY : set === 'elec' ? ['sz', 'ad'] : [set];
      out.push({ cell: 0, kind: 'stim', seg: SETS.map(([k, l, t]) => ({ k, label: l, on: k === set, title: t, n: k === 'all' ? n.all : n[k] })), key: vis.filter(t => set !== 'all' || n.max[t]).map(t => ({ color: Q.RESP[t].color, label: Q.RESP[t].fr, n: set === 'all' ? n.max[t] || 0 : null })), empty: n.all ? '' : 'aucune stimulation enregistrée' });
      if (!tc) { const st = this.stim3dSettings(); out.push({ cell: 1, kind: 'area', key: [{ grad: HEAT_CSS, label: `aire échantillonnée par la paire (rayon ${st.R} mm)` }], info: AREA_INFO }); return out; }
      const tset = this.tcSettings(), all = (this.state.thermo || []).filter(t => this.resolvePair(t)), cnt = k => all.filter(t => TS.thermoStatusOf(t) === k).length, ST = TS.V.thermoStatus;
      const Z = this.thermoZones ? this.thermoZones() : [];
      out.push({ cell: 1, kind: 'thermo', key: ['planned', 'validated', 'done', 'rejected'].map(k => ({ k, color: TS.THERMO_COL[k], label: (cnt(k) > 1 ? ST[k] + 's' : ST[k]), n: cnt(k), on: tset.show.includes(k), toggle: true })),
        zones: Z.length ? [{ color: ZONE.ez, label: 'zone épileptogène', on: Z.some(z => z.color[0] === ZONE.ez[0] && z.color[1] === ZONE.ez[1]) }, { color: ZONE.prop, label: 'propagation précoce', on: Z.some(z => z.color[1] === ZONE.prop[1]) }].filter(z => z.on) : null, noZones: !Z.length });
      return out;
    },
    v2Legends() {
      const V3 = this.viewer; if (!V3) return;
      for (const L of this.v2LegendModel()) {
        const c = V3.cells[L.cell]; if (!c) continue; let el = c.el.querySelector('.v2-leg');
        if (!el) { el = document.createElement('div'); el.className = 'v2-leg'; ['pointerdown', 'wheel', 'dblclick'].forEach(ev => el.addEventListener(ev, e => e.stopPropagation())); c.el.appendChild(el); }
        el.dataset.kind = L.kind;
        const html = (L.seg ? `<div class="v2-seg" title="pastilles affichées">${L.seg.map(s => `<button data-set="${s.k}" class="${s.on ? 'on' : ''}" title="${esc(s.title)}">${esc(s.label)}${s.n ? ` <small>${s.n}</small>` : ''}</button>`).join('')}</div>` : '')
          + (L.key.length ? `<div class="v2-key">${L.key.map(k => k.toggle ? `<label class="v2-tg${k.on ? '' : ' off'}" title="afficher / masquer les cibles ${esc(k.label)}"><input type="checkbox" data-show="${k.k}"${k.on ? ' checked' : ''}><i style="background:${rgb(k.color)}"></i>${esc(k.label)} <b>${k.n}</b></label>` : k.grad ? `<span><i class="grad" style="background:${k.grad}"></i>${esc(k.label)}</span>` : `<span><i style="background:${rgb(k.color)}"></i>${esc(k.label)}${k.n != null ? ` <b>${k.n}</b>` : ''}</span>`).join('')}${L.info ? `<span class="info" title="${esc(L.info)}">ⓘ</span>` : ''}</div>` : '')
          + (L.empty ? `<div class="v2-key muted">${esc(L.empty)}</div>` : '')
          + (L.zones ? `<div class="v2-key">${L.zones.map(z => `<span><i class="sq" style="background:${rgb(z.color)}"></i>${esc(z.label)}</span>`).join('')}<a href="#" data-zones title="SEEG › Rapport SEEG : zones">modifier</a></div>` : L.noZones ? `<div class="v2-key muted">zones du rapport SEEG : <a href="#" data-zones>à saisir</a></div>` : '');
        if (el._html === html) continue;   // inchangée : on ne remplace pas les boutons (un clic en cours n'est pas perdu)
        el._html = html; el.innerHTML = html;
        el.querySelectorAll('[data-set]').forEach(b => b.onclick = () => { V3.setCellConfig(L.cell, { stimSet: b.dataset.set }, true); this.stim3dKeep(this.ui.wm); this.v2Legends(); });
        el.querySelectorAll('[data-show]').forEach(x => x.onchange = () => { const s = this.tcSettings(), k = x.dataset.show; s.show = ['planned', 'validated', 'done', 'rejected'].filter(q => q === k ? x.checked : s.show.includes(q)); this.tcSave(); this.thermoApplyFilter(); this.sliceThermo(); this.v2Legends(); });
        el.querySelectorAll('[data-zones]').forEach(a => a.onclick = e => { e.preventDefault(); const s0 = this.currentStage && this.currentStage(); if (s0) this.go({ stage: s0.key, view: 'rapport' }); });
      }
    },
    /** menu « Affichage » des deux vues */
    v2Menu(anchor) {
      const V3 = this.viewer; if (!V3) return; const tc = this.ui.wm === 'thermo', st = this.stim3dSettings(), c0 = V3.cells[0].cfg, c1 = V3.cells[1].cfg;
      const tset = tc ? this.tcSettings() : null, slv = this.slvState ? this.slvState() : {}, panel = document.createElement('div'); panel.className = 'cell-panel v2-menu';
      const pct = x => Math.round(x * 100);
      const cellBlock = (i, cfg, t) => `<div class="v2-sec"><div class="v2-h">${t}</div>
        <div class="row"><span>Opacité du cortex</span><input type="range" data-op="${i}" min="5" max="100" step="5" value="${pct(cfg.opacity)}"><b class="op-v">${pct(cfg.opacity)} %</b></div>
        <div class="chips"><label class="chip"><input type="checkbox" data-c="${i}" data-k="sub"${cfg.sub ? ' checked' : ''}> structures profondes</label><label class="chip"><input type="checkbox" data-c="${i}" data-k="electrodes"${cfg.electrodes ? ' checked' : ''}> électrodes</label><label class="chip"><input type="checkbox" data-c="${i}" data-k="labels"${cfg.labels ? ' checked' : ''}> noms</label></div>`;
      panel.innerHTML = `<div class="ctx-head">Affichage · ${tc ? 'thermocoagulations' : 'stimulations'}</div>
        ${cellBlock(0, c0, tc ? 'Vue du haut · résultats des stimulations' : 'Vue du haut · contact stimulé')}</div>
        ${cellBlock(1, c1, tc ? 'Vue du bas · volumes des cibles et zones' : 'Vue du bas · cortex stimulé')}
          ${tc ? `<div class="row"><span>Volume théorique</span>⌀ <input id="tcD" type="number" min="2" max="12" step="0.5" value="${tset.d}"> × <input id="tcL" type="number" min="3" max="15" step="0.5" value="${tset.l}"> mm <span class="info" title="${esc(VOL_INFO)}">ⓘ</span></div>
          <div class="chips"><label class="chip"><input type="checkbox" id="tcHalo"${slv.showTc ? ' checked' : ''}> volumes dans les coupes IRM</label><button class="mini-btn" id="v2Zones">zones du rapport SEEG…</button></div>`
          : `<div class="row"><span>Rayon de l’aire</span><select id="st3dR">${[5, 8, 10, 12, 15, 20].map(r => `<option value="${r}"${r === st.R ? ' selected' : ''}>${r} mm</option>`).join('')}</select><span class="info" title="${esc(AREA_INFO)}">ⓘ</span></div>`}</div>
        ${tc ? `<div class="v2-sec"><div class="v2-h">Les deux vues et les coupes</div><div class="chips"><label class="chip" title="seules les électrodes qui portent des cibles affichées"><input type="checkbox" id="tcOnly"${tset.onlyTc ? ' checked' : ''}> électrodes concernées seulement</label></div></div>` : ''}
        <div class="v2-sec"><div class="v2-h">Plus de réglages</div><div class="btnrow"><button data-full="0">vue du haut…</button><button data-full="1">vue du bas…</button></div>
        <div class="btnrow"><button id="v2Reset" title="reprendre les réglages par défaut des deux vues de ce mode">Réglages par défaut</button><button id="v2Quit" title="revenir à la disposition habituelle de la 3D (la disposition « Stimulation (2 vues) » la rétablit)">Quitter les deux vues</button></div></div>`;
      const keep = () => this.stim3dKeep(this.ui.wm);
      panel.querySelectorAll('[data-op]').forEach(r => r.oninput = () => { V3.setCellConfig(+r.dataset.op, { opacity: +r.value / 100 }, true); r.nextElementSibling.textContent = r.value + ' %'; keep(); });
      panel.querySelectorAll('input[data-c]').forEach(x => x.onchange = () => { V3.setCellConfig(+x.dataset.c, { [x.dataset.k]: x.checked }, true); keep(); });
      const r = panel.querySelector('#st3dR'); if (r) r.onchange = () => { st.R = +r.value; this.stim3dSave(); this._st3dKey = null; this.stim3dUpdate(); };
      if (tc) {
        const vol = () => { tset.d = Math.max(2, Math.min(12, +panel.querySelector('#tcD').value || 5)); tset.l = Math.max(3, Math.min(15, +panel.querySelector('#tcL').value || 7)); this.tcSave(); this.refreshMarkers(); this.sliceThermo(); this.stim3dUpdate(); };
        panel.querySelector('#tcD').onchange = vol; panel.querySelector('#tcL').onchange = vol;
        panel.querySelector('#tcHalo').onchange = e => { this.slvState().showTc = e.target.checked; this.sliceThermo(); };
        panel.querySelector('#tcOnly').onchange = e => { tset.onlyTc = e.target.checked; this.tcSave(); this.thermoApplyFilter(); };
        panel.querySelector('#v2Zones').onclick = () => { this.closeMenu(); const s0 = this.currentStage && this.currentStage(); if (s0) this.go({ stage: s0.key, view: 'rapport' }); };
      }
      panel.querySelectorAll('[data-full]').forEach(b => b.onclick = ev => { const i = +b.dataset.full, rr = anchor.getBoundingClientRect(); this.closeMenu(); V3.setActive(i); this.cellMenu(i, { clientX: rr.right - 380, clientY: rr.bottom + 4 }); });
      panel.querySelector('#v2Reset').onclick = () => this.v2Reset();
      panel.querySelector('#v2Quit').onclick = () => { this.closeMenu(); st.auto = false; this.stim3dSave(); this.stim3dLeave(this.ui.wm); if (this.refreshMarkers) this.refreshMarkers(); this.v2Sync(); this.toast('Disposition habituelle de la 3D · « Stimulation (2 vues) » dans la liste des dispositions pour y revenir', 4000); };
      const rr = anchor.getBoundingClientRect(); this.popupMenu([{ node: panel }], rr.right - 400, rr.bottom + 4);
    },
    /** réglages par défaut des deux vues du mode courant */
    v2Reset() {
      const mode = this.ui.wm; if (!TWO.includes(mode)) return; this.closeMenu();
      if (this.ui.twoView) delete this.ui.twoView[mode]; try { localStorage.removeItem('sv_2v_' + mode); } catch (e) { }
      this.stim3dApply(mode); this._st3dKey = null; if (this.refreshMarkers) this.refreshMarkers(); if (mode === 'thermo') this.thermoApplyFilter(); this.stim3dUpdate(); this.toast('Réglages par défaut des deux vues');
    },
    /** image des deux vues avec titres et légendes */
    v2Png() {
      const V3 = this.viewer, sc = 2, url = V3.snapshot({ scale: sc }), img = new Image(), model = this.v2LegendModel();
      img.onload = () => {
        const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; const g = cv.getContext('2d'); g.fillStyle = '#0d1016'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0);   // fond sombre (les étiquettes restent dans leur style sombre)
        const font = getComputedStyle(document.body).fontFamily, k = img.width / Math.max(1, V3.el.clientWidth);
        V3.cells.forEach((c, i) => {
          const x0 = c.el.offsetLeft * k, y0 = c.el.offsetTop * k, h0 = c.el.offsetHeight * k;
          if (i) { g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x0, y0, c.el.offsetWidth * k, Math.max(1, k)); }
          g.font = `600 ${13 * k}px ${font}`; g.fillStyle = '#e8edf3'; g.fillText(c.cfg.title || '', x0 + 12 * k, y0 + 22 * k);
          const L = model.find(m => m.cell === i); if (!L) return;
          const items = (L.seg ? [{ text: 'pastilles : ' + (L.seg.find(s => s.on) || {}).label }] : []).concat(L.key.filter(q => q.on !== false).map(q => ({ color: q.color, grad: q.grad, text: q.label + (q.n != null ? ' ' + q.n : '') })), (L.zones || []).map(z => ({ color: z.color, text: z.label })));
          let x = x0 + 12 * k; const y = y0 + h0 - 16 * k; g.font = `${11.5 * k}px ${font}`;
          for (const it of items) {
            if (it.color || it.grad) { if (it.grad) { const gr = g.createLinearGradient(x, 0, x + 22 * k, 0); gr.addColorStop(0, 'rgb(255,150,25)'); gr.addColorStop(0.5, 'rgb(240,80,25)'); gr.addColorStop(1, 'rgb(190,15,40)'); g.fillStyle = gr; g.fillRect(x, y - 8 * k, 22 * k, 9 * k); x += 27 * k; } else { g.fillStyle = rgb(it.color); g.beginPath(); g.arc(x + 5 * k, y - 4 * k, 5 * k, 0, 7); g.fill(); x += 14 * k; } }
            g.fillStyle = '#cfd6df'; g.fillText(it.text, x, y); x += g.measureText(it.text).width + 14 * k;
          }
        });
        const sg = this.ensureSeeg(), P = this.ui.wm === 'thermo' ? sg.tpair : sg.pair, name = P ? Q.pairLabel(P.elec, P.c1, P.c2).replace(/[’']/g, 'p').replace(/[^\w-]+/g, '') : 'vue';
        this.download(`EpiScope_${this.ui.wm === 'thermo' ? 'thermocoagulations' : 'stimulations'}_${name}.png`, dataURLtoBlob(cv.toDataURL('image/png')));
      };
      img.src = url;
    },
  };
  function dataURLtoBlob(u) { const [h, b] = u.split(','), bin = atob(b), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: (h.match(/:(.*?);/) || [])[1] || 'image/png' }); }
  Object.assign(SV.app, M);

  // ---------------------------------------------------------------- greffes
  const A = SV.app, s3u = A.stim3dUpdate, s3l = A.stim3dLeave, rm = A.refreshMarkers;
  A.stim3dUpdate = function () { const r = s3u.apply(this, arguments); this.v2Sync(); return r; };
  A.stim3dLeave = function () { const r = s3l.apply(this, arguments); this.v2Sync(); return r; };
  SV.Bus.on('workmode:after', function () { this.v2Sync(); setTimeout(() => this.v2Sync(), 150); }, 'view2_ui');
  A.refreshMarkers = function () { const r = rm.apply(this, arguments); if (this.v2On && this.v2On()) this.v2Legends(); return r; };
  // « Stimulation (2 vues) » choisie dans la liste des dispositions : les deux vues du mode reviennent, avec leurs réglages
  document.addEventListener('change', e => {
    if (!e.target || e.target.id !== 'layoutSel' || !A.viewer) return;
    if (e.target.value === 'stim' && TWO.includes(A.ui.wm)) { const st = A.stim3dSettings(); st.auto = true; A.stim3dSave(); A.stim3dApply(A.ui.wm); if (A.refreshMarkers) A.refreshMarkers(); if (A.ui.wm === 'thermo') A.thermoApplyFilter(); A.stim3dUpdate(); }
    else A.v2Sync();
  });
  // PNG de la 3D : en mode allégé, l'image porte les titres et les légendes des deux vues
  document.addEventListener('click', e => { if (e.target && e.target.id === 'btnPng' && A.v2On && A.v2On()) { e.stopImmediatePropagation(); e.preventDefault(); A.v2Png(); } }, true);
})(window.SV = window.SV || {});
