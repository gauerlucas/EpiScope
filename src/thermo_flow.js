/* EpiScope — thermo_flow.js : SEEG › Thermocoagulations, comme les stimulations.
 *   - étapes d'une cible : planifiée → validée par le chirurgien, une par une → réalisée, ou récusée (contre-indiquée, avec sa raison) ; une entrée antérieure au
 *     suivi des étapes est une thermocoagulation réalisée ;
 *   - la paire choisie est suivie par la coupe de l'électrode et par la 3D en deux vues (cible dans le verre ; en bas, cortex
 *     en verre neutre, volumes des cibles, zones du Rapport SEEG), comme pour les stimulations ;
 *   - volume théorique d'une thermocoagulation bipolaire standard entre deux plots contigus : ellipsoïde centré entre les
 *     deux plots, grand axe le long de l'électrode (⌀ 5 mm × 7 mm par défaut, réglable ; ordre de grandeur publié : 3 à
 *     6 mm de diamètre autour de l'électrode) — dessiné dans les coupes (section : ellipse ou halo, calque « volumes de
 *     thermocoagulation ») et dans la 3D, dans la couleur de l'étape.                                             */
(function (SV) {
  'use strict';
  const $ = id => document.getElementById(id), Q = SV.Seeg, TS = SV.Store;
  const esc = SV.U.esc;
  const LS = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } } };
  const rgb = c => `rgb(${c.join(',')})`, today = () => new Date().toISOString().slice(0, 10);
  /** v5 — date par défaut d'une thermocoagulation : la date du jour si la SEEG est en cours, sinon la fin de la SEEG (saisie
   *  rétrospective d'une exploration terminée : « réalisée le » ne doit pas prendre la date de saisie) */
  const defaultDate = app => { const d = app.dossier, ex = d && app.ctx && SV.Store.byId(d.explorations, app.ctx.explorationId); const t = today(); if (!ex) return t; if (ex.end && ex.end < t) return ex.end; if (ex.start && ex.start > t) return ex.start; return t; };
  const nn = s => String(s || '').replace(/[’']/g, "'").toLowerCase();
  const ORDER = ['done', 'validated', 'planned', 'rejected'];   // ordre des listes
  const ALL = ['planned', 'validated', 'done', 'rejected'];

  const M = {
    thermoDefaultDate() { return defaultDate(this); },
    tcSettings() { const s = this.ui.tcSet || (this.ui.tcSet = Object.assign({ d: 5, l: 7, show: ['planned', 'validated', 'done'], onlyTc: false }, LS.get('sv_tc') || {})); if (!Array.isArray(s.show)) s.show = ['planned', 'validated', 'done']; return s; },
    tcSave() { LS.set('sv_tc', this.tcSettings()); },
    /** étape d'une cible : planifiée → validée par le chirurgien (une à une) → réalisée ; ou contre-indiquée (récusée, avec sa raison) */
    thermoSetStatus(t, s, o) {
      const sg = this.ensureSeeg(); o = o || {}; t.status = s;
      if (s === 'planned') { if (!t.plannedAt) t.plannedAt = today(); delete t.validatedBy; delete t.validatedAt; delete t.reason; delete t.rejectedAt; }
      if (s === 'validated') { t.validatedAt = today(); t.validatedBy = o.by != null ? o.by : (sg.tcValBy || t.validatedBy || ''); delete t.reason; }
      if (s === 'rejected') { t.reason = o.reason != null ? o.reason : (t.reason || ''); t.rejectedAt = today(); t.rejectedBy = sg.tcValBy || ''; }
      if (s === 'done') t.date = t.date || sg.thermoDate || defaultDate(this); else t.date = '';   // date = date de réalisation
    },
    thermoAdd(e, c1, c2, s) {
      const t = { eid: e.id, elec: e.name, c1, c2, date: '', note: '', status: s || 'planned' };
      this.thermoSetStatus(t, t.status); this.state.thermo.push(t); return t;
    },
    thermoRemove(t) { this.state.thermo = this.state.thermo.filter(x => x !== t); },
    /** affichage : étapes montrées (3D, coupes) et, au choix, seulement les électrodes qui portent ces cibles */
    thermoShown() { return new Set(this.tcSettings().show); },
    thermoElecIds() { const sh = this.thermoShown(), ids = new Set(); for (const t of this.state.thermo || []) { if (!sh.has(TS.thermoStatusOf(t))) continue; const r = this.resolvePair(t); if (r) ids.add(r.e.id); } return ids; },
    thermoApplyFilter() {
      const V3 = this.viewer, set = this.tcSettings(), on = this.ui.wm === 'thermo'; if (!V3) return;
      if (on && V3.layoutName === 'stim') { const tcs = set.show.length === ALL.length ? null : set.show.slice(); for (const i of [0, 1]) if (V3.cells[i]) V3.setCellConfig(i, { tcStatus: tcs }, true); }
      const ids = on && set.onlyTc ? this.thermoElecIds() : null;
      V3.setElectrodeFilter(ids); this.sliceElecFilter = ids ? (e => ids.has(e.id) || [...ids].some(id => { const x = this.elecById(id); return x && nn(x.name) === nn(e.name); })) : null;
      if (this.slices) { const st = this.slvState(); if (st.elec) this.electrodeCheckMarkers(); else if (this.sliceMarkers) this.sliceMarkers(); }
    },
    // ---------------------------------------------------------------- onglet
    renderThermoNew() {
      const box = $('tab-thermo'); if (!box) return; const sg = this.ensureSeeg(), set = this.tcSettings(), ST = TS.V.thermoStatus, COL = TS.THERMO_COL;
      if (!this.elecs.length) { box.innerHTML = '<div class="hint">Aucune électrode : construisez d’abord le schéma d’implantation.</div>'; return; }
      const e = this.currentElec('thermoElec'); if (sg.tpair && !this.elecByName(sg.tpair.elec)) sg.tpair = null;
      const P = sg.tpair && sg.tpair.elec === e.name ? sg.tpair : null, cur = P && this.thermoOf(e, P.c1, P.c2), cs = cur && TS.thermoStatusOf(cur);
      const all = this.state.thermo.map(t => ({ t, r: this.resolvePair(t), s: TS.thermoStatusOf(t) })).filter(x => x.r), cnt = k => all.filter(x => x.s === k).length;
      const sw = s => `<i class="sw" style="background:${rgb(COL[s])}"></i>`, plur = (s, n) => n > 1 ? ST[s] + 's' : ST[s];
      const stimInfo = (ee, c1, c2) => { const L = this.stimsOf(ee, c1, c2), lv = this.pairMaxLevel(ee, c1, c2); return L.length ? `${L.length} stimulation${L.length > 1 ? 's' : ''}, réponse max. ${Q.RESP[lv].fr}` : 'non stimulée'; };
      const HELP = 'Chaque cible est planifiée, puis validée par le chirurgien — une par une — puis réalisée ; une cible peut être récusée (contre-indiquée), avec sa raison. Avant chaque cible, une stimulation directe est recommandée : un déficit à la stimulation prédit un déficit similaire après thermocoagulation. Clic sur une paire, ou sur une cible de la liste pour la modifier : la coupe et les deux vues 3D la suivent. Couleur : étape de la cible ; point : réponse maximale aux stimulations.';
      // étapes affichées : dans la légende de la vue 3D du bas quand les deux vues sont là, ici sinon
      let html = this.v2On && this.v2On() ? '' : `<div class="tc-show"><span class="lbl">Afficher</span>${ALL.map(s => `<label class="chip tc-${s}"><input type="checkbox" data-show="${s}"${set.show.includes(s) ? ' checked' : ''}> ${sw(s)} ${plur(s, 2)} <b>${cnt(s)}</b></label>`).join('')}<label class="chip" title="dans la 3D et les coupes, seules les électrodes qui portent des cibles affichées"><input type="checkbox" id="tcOnly"${set.onlyTc ? ' checked' : ''}> électrodes concernées seulement</label></div>`;
      html += `<div class="ctrl-row"><label>électrode <select id="tcElec">${this.elecOptions(e.name)}</select></label><span class="info" title="${esc(HELP)}">ⓘ</span></div>
        <div class="pchips" id="tcPairs">${this.pairChips(e, P, 'thermo')}</div>`;
      if (P) {
        const key = Q.pairLabel(e.name, P.c1, P.c2), info = [];
        if (cur && cur.plannedAt) info.push('planifiée le ' + esc(cur.plannedAt));
        if (cur && cur.validatedAt && (cs === 'validated' || cs === 'done')) info.push(`validée le ${esc(cur.validatedAt)}${cur.validatedBy ? ' par ' + esc(cur.validatedBy) : ''}`);
        if (cs === 'rejected') info.push(`récusée le ${esc(cur.rejectedAt || '?')}${cur.rejectedBy ? ' par ' + esc(cur.rejectedBy) : ''}`);
        const ACT = { planned: 'plan', validated: 'validate', done: 'done', rejected: 'reject' }, NEXT = { planned: 'validated', validated: 'done' };
        const TIP = { planned: 'revenir à planifiée', validated: 'valider (chirurgien)', done: 'marquer réalisée', rejected: 'récuser (contre-indiquée)' };
        const fields = !cur ? '' : cs === 'planned' ? `<label>chirurgien <input id="tcValBy" value="${esc(sg.tcValBy || '')}" placeholder="nom" style="width:120px"></label><span class="muted small">pour la validation</span>`
          : cs === 'validated' ? `<label>validée par <input data-f="validatedBy" value="${esc(cur.validatedBy || '')}" placeholder="chirurgien" style="width:120px"></label><label>réalisation le <input id="tcDate" type="date" value="${esc(sg.thermoDate || '')}"></label>`
          : cs === 'done' ? `<label>validée par <input data-f="validatedBy" value="${esc(cur.validatedBy || '')}" placeholder="chirurgien" style="width:120px"></label><label>réalisée le <input type="date" data-f="date" value="${esc(cur.date || '')}"></label>`
          : `<label class="tc-reason">raison <input data-f="reason" value="${esc(cur.reason || '')}" placeholder="raison de la contre-indication"></label>`;
        html += `<div class="tc-sel${cs ? ' tc-' + cs : ''}"><div class="tc-hd"><b>${esc(key)}</b> <span class="muted">${esc(Q.pairStructures(e, P.c1, P.c2, this.atlas))}</span><span class="spacer"></span>${cur ? '<button class="mini-btn danger" data-act="rm" title="retirer cette cible de la liste">retirer</button>' : ''}</div>
          <div class="muted small">${esc(stimInfo(e, P.c1, P.c2))}${info.length ? ' · ' + info.join(' · ') : ''}</div>
          ${!cur ? `<div class="ctrl-row tc-acts"><button class="primary" data-act="plan">${sw('planned')} planifier cette cible</button><button class="mini-btn" data-act="post" title="saisie a posteriori d’une thermocoagulation déjà faite">déjà réalisée</button></div>`
            : `<div class="seg tc-steps" title="étape de la cible : cliquer pour la changer">${ALL.map(k => `<button data-act="${ACT[k]}" class="tc-${k}${cs === k ? ' on' : ''}${NEXT[cs] === k ? ' next' : ''}" title="${TIP[k]}">${sw(k)} ${ST[k]}</button>`).join('')}</div>
          <div class="ctrl-row tc-fields">${fields}</div>
          <div class="ctrl-row"><input data-f="note" value="${esc(cur.note || '')}" placeholder="note (paramètres, suites…)"></div>`}</div>`;
      } else html += '<div class="tc-sel muted">Choisissez une paire, ou une cible de la liste.</div>';
      html += `<div class="ctrl-row"><input id="tcText" placeholder="saisie rapide de cibles planifiées : Ia 1-3, OC 4-7, B’ 2-3"><button id="tcAdd" class="primary">Planifier</button></div>`;
      const selKey = P ? Q.pairLabel(P.elec, P.c1, P.c2) : null;
      const small = x => { const s = x.s; return `${s === 'done' && x.t.date ? 'réalisée le ' + esc(x.t.date) + ' · ' : ''}${x.t.validatedBy && (s === 'validated' || s === 'done') ? 'validée par ' + esc(x.t.validatedBy) + ' · ' : ''}${s === 'rejected' ? 'contre-indication : ' + esc(x.t.reason || 'raison non précisée') + ' · ' : ''}${esc(stimInfo(x.r.e, x.t.c1, x.t.c2))}`; };
      for (const s of ORDER) {
        const L = all.filter(x => x.s === s).sort((a, b) => this.elecs.indexOf(a.r.e) - this.elecs.indexOf(b.r.e) || a.t.c1 - b.t.c1); if (!L.length) continue;
        html += `<div class="tc-group"><div class="sub-h">${sw(s)} ${plur(s, L.length).replace(/^./, c => c.toUpperCase())} <span class="muted">${L.length}</span></div>${L.map(x => `<div class="tc-entry tc-${s}${x.r.key === selKey ? ' sel' : ''}" data-key="${esc(x.r.key)}" title="cliquer pour modifier cette cible (la coupe et la 3D s’y centrent)"><i></i><b class="tc-k">${esc(x.r.key)}</b> <span>${esc(Q.pairStructures(x.r.e, x.t.c1, x.t.c2, this.atlas))}</span>${s === 'planned' ? '<button class="mini-btn" data-row="validate" title="valider cette cible (chirurgien)">valider</button>' : s === 'validated' ? '<button class="mini-btn" data-row="done" title="marquer réalisée">réalisée</button>' : ''}<a data-rm="${esc(x.r.key)}" title="retirer">×</a><small>${small(x)}</small></div>`).join('')}</div>`;
      }
      html += `<div class="side-row"><span>${all.length ? `${all.length} cible${all.length > 1 ? 's' : ''}` : 'Aucune cible'}</span><span>${all.length ? '<button id="tcCopy">Copier</button><button id="tcClear" class="danger">Tout retirer</button>' : ''}</span></div>`;
      box.innerHTML = html;
      const redraw = () => { this.seegChanged(); this.renderThermo(); this.refreshMarkers(); this.thermoApplyFilter(); this.sliceThermo(); };
      const select = (ee, c1, c2) => { sg.thermoElec = ee.name; sg.tpair = { elec: ee.name, c1, c2 }; this._st3dKey = null; this.renderThermo(); this.refreshMarkers(); this.sliceThermo(); const c = $('tab-thermo').querySelector('.tc-sel'); if (c) { c.classList.add('flash'); if (c.scrollIntoView) c.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } };
      $('tcElec').onchange = ev => { sg.thermoElec = ev.target.value; sg.tpair = null; this.renderThermo(); this.refreshMarkers(); };
      if ($('tcDate')) $('tcDate').onchange = ev => { sg.thermoDate = ev.target.value; };
      if ($('tcValBy')) $('tcValBy').onchange = ev => { sg.tcValBy = ev.target.value.trim(); };
      box.querySelectorAll('[data-show]').forEach(c => c.onchange = () => { const k = c.dataset.show; set.show = ALL.filter(s => s === k ? c.checked : set.show.includes(s)); this.tcSave(); this.thermoApplyFilter(); this.sliceThermo(); });
      if ($('tcOnly')) $('tcOnly').onchange = ev => { set.onlyTc = ev.target.checked; this.tcSave(); this.thermoApplyFilter(); };
      box.querySelectorAll('#tcPairs .pchip').forEach(b => b.onclick = () => { const c1 = +b.dataset.c1; sg.tpair = { elec: e.name, c1, c2: c1 + 1 }; this.renderThermo(); this.refreshMarkers(); this.sliceThermo(); });
      box.querySelectorAll('.tc-sel [data-act]').forEach(b => b.onclick = () => {
        const a = b.dataset.act;
        if (a === 'plan') { if (cur) this.thermoSetStatus(cur, 'planned'); else this.thermoAdd(e, P.c1, P.c2, 'planned'); }
        else if (a === 'post') this.thermoAdd(e, P.c1, P.c2, 'done');
        else if (a === 'validate') { const vb = $('tcValBy'); if (vb) sg.tcValBy = vb.value.trim(); this.thermoSetStatus(cur, 'validated', { by: cs === 'done' || cs === 'validated' ? (cur.validatedBy || sg.tcValBy || '') : (sg.tcValBy || '') }); }
        else if (a === 'done') { const dt = $('tcDate'); if (dt) sg.thermoDate = dt.value; this.thermoSetStatus(cur, 'done'); }
        else if (a === 'reject') this.thermoSetStatus(cur, 'rejected', { reason: cur.reason || '' });
        else if (a === 'rm') this.thermoRemove(cur);
        redraw();
        if (a === 'reject') { const i = $('tab-thermo').querySelector('.tc-sel [data-f=reason]'); if (i) i.focus(); }
      });
      box.querySelectorAll('.tc-sel [data-f]').forEach(i => i.onchange = () => {
        if (!cur) return; cur[i.dataset.f] = i.value.trim(); this.seegChanged(); this.refreshMarkers();
        // la ligne de la liste suit, sans redessiner l'onglet (un clic en cours ailleurs n'est pas perdu)
        const x = all.find(y => y.t === cur), row = x && [...box.querySelectorAll('.tc-entry')].find(r => r.dataset.key === x.r.key); if (row && row.querySelector('small')) row.querySelector('small').innerHTML = small(x);
      });
      box.querySelectorAll('.tc-entry').forEach(row => {
        const x = all.find(y => y.r.key === row.dataset.key); if (!x) return;
        row.onclick = ev => { if (ev.target.closest('button, a, input')) return; select(x.r.e, x.t.c1, x.t.c2); };
        row.querySelectorAll('[data-row]').forEach(b => b.onclick = () => { const a = b.dataset.row; if (a === 'validate') this.thermoSetStatus(x.t, 'validated', { by: sg.tcValBy || '' }); else if (a === 'done') this.thermoSetStatus(x.t, 'done'); redraw(); });
        row.querySelector('[data-rm]').onclick = () => { this.thermoRemove(x.t); redraw(); };
      });
      $('tcAdd').onclick = () => this.thermoAddRanges($('tcText').value); $('tcText').onkeydown = ev => { if (ev.key === 'Enter') this.thermoAddRanges($('tcText').value); };
      if ($('tcCopy')) $('tcCopy').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(this.thermoText()).then(() => this.toast('Liste copiée')); };
      if ($('tcClear')) $('tcClear').onclick = () => { if (confirm('Retirer toutes les cibles de thermocoagulation ?')) { this.state.thermo = []; redraw(); } };
      if (this.stim3dControls) this.stim3dControls(box);
      clearTimeout(this._s3T); this._s3T = setTimeout(() => { if (this.stim3dUpdate) this.stim3dUpdate(); this.thermoApplyFilter(); }, 40);
    },
    thermoAddRanges(text) {
      const pairs = Q.parseRanges(text); let added = 0; const unknown = [];
      for (const p of pairs) { const e = this.elecByName(p.elec); if (!e || p.c2 > e.nContacts) { unknown.push(Q.pairLabel(p.elec, p.c1, p.c2)); continue; } if (this.thermoOf(e, p.c1, p.c2)) continue; this.thermoAdd(e, p.c1, p.c2, 'planned'); added++; }
      if (!pairs.length) this.toast('Rien de reconnu : écrivez par exemple « Ia 1-3, OC 4-7 »'); else this.toast(`${added} cible${added > 1 ? 's' : ''} planifiée${added > 1 ? 's' : ''}` + (unknown.length ? ' · inconnues : ' + unknown.join(', ') : ''), 4000);
      const i = $('tcText'); if (i) i.value = ''; this.seegChanged(); this.renderThermo(); this.refreshMarkers(); this.thermoApplyFilter(); this.sliceThermo();
    },
    /** ajoute (planifiée) ou retire une cible */
    thermoToggle(e, c1, c2) { const t = this.thermoOf(e, c1, c2); if (t) this.thermoRemove(t); else this.thermoAdd(e, c1, c2); this.seegChanged(); if (this.ui.tab === 'thermo') this.renderThermo(); this.refreshMarkers(); this.sliceThermo(); },
    thermoText() {
      const lines = [`EpiScope — thermocoagulations — ${this.state.name || 'cas'}`];
      for (const s of ORDER) for (const t of this.state.thermo) { if (TS.thermoStatusOf(t) !== s) continue; const r = this.resolvePair(t); if (r) lines.push(`${r.key} (${Q.pairStructures(r.e, r.c1, r.c2, this.atlas)}) · ${TS.V.thermoStatus[s]}${s === 'done' && t.date ? ' le ' + t.date : ''}${t.validatedBy && s !== 'rejected' ? ' · validée par ' + t.validatedBy : ''}${t.reason ? ' · contre-indication : ' + t.reason : ''}${t.note ? ' · ' + t.note : ''}`); }
      return lines.join('\n');
    },
    // ---------------------------------------------------------------- coupes : volumes théoriques
    /** cibles de l'exploration dont les électrodes sont dans les coupes (espace de travail, sinon dossier) */
    thermoListForSlices(W) {
      const d = this.dossier; if (!d || !W.ex) return [];
      const cx = this.ctx && (this.ctx.explorationId || (this.ctx.seizureId && ((TS.contextOf(d, this.ctx.seizureId) || {}).exploration || {}).id));
      return cx === W.ex.id && this.state && this.state.thermo ? this.state.thermo : (W.ex.thermo || []);
    },
    sliceThermo() {
      const S3 = this.slices; if (!S3 || !S3.setEllipsoids) return; const st = this.slvState();
      if (!st.showTc || !this.dossier) { S3.setEllipsoids([]); return; }
      const W = this.worldElectrodes(), L = this.thermoListForSlices(W); if (!L.length) { S3.setEllipsoids([]); return; }
      const set = this.tcSettings(), sg = this.ui.seeg || {}, P = sg.tpair, out = [], shown = this.thermoShown();
      for (const t of L) {
        const s = TS.thermoStatusOf(t); if (!shown.has(s)) continue; const E = W.list.find(x => x.id === t.eid && x.kind === 'real') || W.list.find(x => x.id === t.eid) || W.list.find(x => nn(x.name) === nn(t.elec)); if (!E) continue;
        const a = E.pts[t.c1 - 1], b = E.pts[t.c2 - 1]; if (!a || !b) continue;
        const L0 = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1;
        out.push({ c: [0, 1, 2].map(i => (a[i] + b[i]) / 2), u: [0, 1, 2].map(i => (b[i] - a[i]) / L0), a: set.l / 2, b: set.d / 2, color: TS.THERMO_COL[s], style: s, label: `${E.name}${t.c1}-${t.c2} · ${TS.V.thermoStatus[s]}`, sel: !!P && nn(P.elec) === nn(E.name) && P.c1 === t.c1 });
      }
      S3.setEllipsoids(out);
    },
  };
  Object.assign(SV.app, M);

  // ---------------------------------------------------------------- greffes
  const A = SV.app, ecm0 = A.electrodeCheckMarkers, sm0 = A.sliceMarkers;
  SV.Bus.on('workmode:after', function (mode) { if (mode === 'thermo') setTimeout(() => this.ui.wm === 'thermo' && this.thermoApplyFilter(), 120); else if (this.viewer && this.viewer.elecFilter) { this.viewer.setElectrodeFilter(null); this.sliceElecFilter = null; } else this.sliceElecFilter = null; }, 'thermo_flow');
  A.renderThermoCore = A.renderThermoNew;
  A.electrodeCheckMarkers = function () { const r = ecm0.apply(this, arguments); this.sliceThermo(); return r; };
  A.sliceMarkers = function () { const r = sm0.apply(this, arguments); this.sliceThermo(); return r; };
})(window.SV = window.SV || {});
