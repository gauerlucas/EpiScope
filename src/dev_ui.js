/* EpiScope — dev_ui.js : Dossier › Développement et examen clinique (v4.19).
 *   - Grossesse et naissance : grossesse pathologique et complications périnatales (mêmes réponses que dans les antécédents),
 *     infection materno-fœtale, complications obstétricales, terme, mode d'accouchement, Apgar, poids / taille / PC de
 *     naissance situés sur les courbes INTERGROWTH-21st (centile, PAG / GAG, micro- / macrocéphalie) ;
 *   - Développement psychomoteur : âge d'acquisition de chaque étape (ou « non acquis »), fenêtres de l'OMS et repères du
 *     CDC 2022, frise, âge de développement indicatif par domaine, âge corrigé du prématuré ; évaluations datées, niveau
 *     actuel ;
 *   - Examen clinique : examen neurologique daté, mesures datées (poids, taille, PC, IMC calculé) situées sur les courbes de
 *     l'OMS (garçons / filles), latéralité et dominance.
 *   v4.20 : clic sur la frise des acquisitions = âge d'acquisition de l'étape (clic droit : acquis, non acquis, effacer) ;
 *   clic droit sur une courbe de croissance : ajouter un point à l'âge et à la valeur pointés, ou retirer le point visé.    */
(function (SV) {
  'use strict';
  const $ = id => document.getElementById(id), S = SV.Store, V = S.V, G = SV.Growth;
  const esc = SV.U.esc;
  const opts = (map, v) => Object.entries(map).map(([k, l]) => `<option value="${esc(k)}"${String(v) === k ? ' selected' : ''}>${esc(l)}</option>`).join('');
  const num = v => v === '' || v == null || !isFinite(+v) ? null : +v;
  const fmt = (v, k) => v == null || !isFinite(v) ? '—' : (Math.round(v * Math.pow(10, k || 0)) / Math.pow(10, k || 0)).toString().replace('.', ',');
  const DELIVERY = { '': '—', vb: 'voie basse', instr: 'voie basse instrumentale', cesarPlan: 'césarienne programmée', cesarUrg: 'césarienne en urgence' };
  const YN = [['no', 'non'], ['yes', 'oui'], ['', '?']];
  const pctTxt = p => p == null ? '' : 'P' + (p < 0.01 ? '< 1' : p > 0.99 ? '> 99' : fmt(100 * p, 0));
  const zCls = z => z == null ? '' : Math.abs(z) > 3 ? 'z3' : Math.abs(z) > 2 ? 'z2' : '';

  function ensure(C) {
    const B = C.birth || (C.birth = {}), D0 = { gaWeeks: '', gaDays: '', mode: '', weight: '', length: '', hc: '', apgar: '', neonatal: '', notes: '' };   // en place : les champs liés gardent leur objet
    for (const k in D0) if (B[k] == null) B[k] = D0[k];
    for (const k of ['infection', 'obstetric']) if (!C.birth[k] || typeof C.birth[k] !== 'object') C.birth[k] = { v: '', text: '' };
    C.milestones = C.milestones || {}; C.devEvals = C.devEvals || []; C.anthro = C.anthro || []; if (C.devNotes == null) C.devNotes = '';
    return C;
  }
  /** naissance : centiles INTERGROWTH-21st des mesures, classement */
  function birthStats(P, B) {
    const ga = num(B.gaWeeks) != null ? 7 * +B.gaWeeks + (num(B.gaDays) || 0) : null, sex = P.sex === 'F' || P.sex === 'M' ? P.sex : null, out = { ga, sex };
    for (const [k, v, f] of [['wt', num(B.weight), 1 / 1000], ['len', num(B.length), 1], ['hc', num(B.hc), 1]]) out[k] = v != null && ga != null && sex ? G.igP(k, sex, ga, v * f) : null;
    out.cls = out.wt != null ? G.sizeClass(out.wt) : ''; out.hcCls = out.hc == null ? '' : out.hc < 0.03 ? 'microcéphalie (< 3e centile)' : out.hc > 0.97 ? 'macrocéphalie (> 97e centile)' : '';
    out.preterm = ga != null && ga < 259; out.term = ga == null ? '' : ga < 196 ? 'grande prématurité extrême (< 28 SA)' : ga < 224 ? 'grande prématurité (28–31 SA)' : ga < 259 ? 'prématurité (32–36 SA)' : ga <= 293 ? 'à terme' : 'post-terme (≥ 42 SA)';
    return out;
  }
  /** mesures datées : âge, IMC, z-scores OMS */
  function anthroRows(P, C) {
    const sex = P.sex === 'F' || P.sex === 'M' ? P.sex : null;
    return (C.anthro || []).slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))).map(x => {
      const d = G.ageDays(P, x.date), w = num(x.weight), h = num(x.height), hc = num(x.hc), bmi = w != null && h ? w / Math.pow(h / 100, 2) : null;
      const z = k => sex && d != null ? G.whoZ(k, sex, d, k === 'wt' ? w : k === 'ht' ? h : k === 'bmi' ? bmi : hc) : null;
      return { x, d, w, h, hc, bmi, z: { wt: w != null ? z('wt') : null, ht: h != null ? z('ht') : null, bmi: bmi != null ? z('bmi') : null, hc: hc != null ? z('hc') : null } };
    });
  }

  /** redessin différé : un innerHTML pendant un « change » déclenché par la perte de focus (redessin en cours) échouerait */
  // … et le champ qui avait le focus (passage au champ suivant par Tab, clic) le retrouve dans le nouveau DOM
  function focusKey(el) {
    if (!el || !el.closest) return null; const host = el.closest('#devBirth, #devMs, #devAnthro'); if (!host) return null;
    const attr = ['data-b', 'data-f', 'data-k', 'data-t'].find(a => el.hasAttribute(a)); if (!attr) return null;
    const tr = el.closest('tr[data-id], tr[data-m], tr[data-yn]'), row = !tr ? '' : tr.dataset.id ? `tr[data-id="${tr.dataset.id}"] ` : tr.dataset.m ? `tr[data-m="${tr.dataset.m}"] ` : `tr[data-yn="${tr.dataset.yn}"] `;
    return `#${host.id} ${row}[${attr}${el.getAttribute(attr) ? `="${el.getAttribute(attr)}"` : ''}]`;
  }
  /** point écran → coordonnées du SVG (viewBox), malgré la mise à l'échelle */
  const svgPt = (svg, e) => { const m = svg.getScreenCTM && svg.getScreenCTM(); if (!m) return null; const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(m.inverse()); };
  const FIELD = { wt: 'weight', ht: 'height', hc: 'hc' }, BFIELD = { wt: 'weight', ht: 'length', hc: 'hc' };
  const roundV = (ind, v) => ind === 'wt' ? (v < 10 ? Math.round(v * 20) / 20 : Math.round(v * 10) / 10) : ind === 'ht' ? Math.round(v * 2) / 2 : Math.round(v * 10) / 10;
  const isoDay = t => new Date(t).toISOString().slice(0, 10);
  const later = (app, fn) => { clearTimeout(app['_dv_' + fn]); app['_dv_' + fn] = setTimeout(() => {
    const a = document.activeElement, key = focusKey(a), sel = a && typeof a.selectionStart === 'number' ? a.selectionStart : null;
    app[fn]();
    if (key) { const n = document.querySelector(key); if (n && n !== a) { n.focus(); try { if (sel != null && n.setSelectionRange) n.setSelectionRange(sel, sel); } catch (e) { /* champ numérique */ } } }
  }, 0); };
  const M = {
    renderDevView(box) {
      const d = this.dossier, P = d.patient, C = ensure(P.clin || (P.clin = S.newClin())), B = C.birth;
      if (!C.examHistory || !Array.isArray(P.etiologies)) S.migrateClin(P);
      const ageD = G.ageDays(P, null), corr = G.correctedDays(P, { weeks: B.gaWeeks, days: B.gaDays }, null), preterm = num(B.gaWeeks) != null && +B.gaWeeks < 37 && ageD != null && ageD <= 730;
      box.innerHTML = `<div class="scr-inner wide"><div class="view-head"><h3>Développement et examen clinique</h3><span class="muted">${ageD != null ? `âge ${esc(G.fmtAge(ageD))}${preterm ? ` · âge corrigé ${esc(G.fmtAge(corr))} (né${P.sex === 'F' ? 'e' : ''} à ${esc(B.gaWeeks)}${B.gaDays ? '+' + esc(B.gaDays) : ''} SA)` : ''}` : 'année de naissance à renseigner (Synthèse) pour situer les mesures et les acquisitions'}${P.sex !== 'F' && P.sex !== 'M' ? ' · sexe à renseigner (courbes garçons / filles)' : ''}</span></div>
        <div class="hx-grid">
          <div class="hx-col"><div class="card" id="devBirthCard"><div class="card-h">Grossesse et naissance <span class="muted">lié aux antécédents (grossesse pathologique, complications périnatales)</span></div><div id="devBirth"></div></div></div>
          <div class="hx-col">
            <div class="card"><div class="card-h">Latéralité et dominance</div><div class="form grid2">
              <label>Latéralité manuelle <select data-p="handedness">${opts(V.handedness, P.handedness)}</select></label>
              <label title="Edinburgh Handedness Inventory : quotient de latéralité de −100 % (gaucher) à +100 % (droitier)">Edinburgh <span class="inrow"><input type="number" min="-100" max="100" step="5" data-c="edinburgh" value="${esc(C.edinburgh)}" placeholder="+80"> % <button class="mini-btn" id="devEhi" title="questionnaire d’Edinburgh (Oldfield 1971, 10 items) : le quotient est calculé ; il reste modifiable à la main">questionnaire…</button></span></label>
              <label title="test de pointage : nombre d’items réalisés de la main droite et de la main gauche">Test de pointage <span class="inrow"><input type="number" min="0" max="99" data-c="pointingR" value="${esc(C.pointingR)}" placeholder="D"> droite / <input type="number" min="0" max="99" data-c="pointingL" value="${esc(C.pointingL)}" placeholder="G"> gauche</span></label>
              <label>Œil directeur <select data-c="eye">${opts({ '': '—', R: 'droit', L: 'gauche' }, C.eye)}</select></label>
              <label class="span2">Gaucherie familiale <input data-c="familyLeftHanded" value="${esc(C.familyLeftHanded)}" placeholder="non / oui (qui)"></label>
              <label class="span2">Dominance du langage <span class="inrow"><select data-p="dominant">${opts(V.dominance, P.dominant)}</select><select data-p="dominanceMethod">${opts(V.dominanceMethod, P.dominanceMethod)}</select></span></label></div></div>
            <div class="card"><div class="card-h">Examen neurologique <span class="muted">daté : l’examen peut évoluer (année seule acceptée)</span><span class="spacer"></span><button class="mini-btn" data-addh="examHistory">+ ligne</button></div><table class="aed dated" data-h="examHistory"></table></div>
            <div class="card"><div class="card-h">Développement actuel <span class="muted">en texte libre</span><span class="spacer"></span><label class="muted small dev-upd" title="date de l’information (mise à jour à chaque modification ; modifiable, par ex. pour reprendre un compte rendu plus ancien)">à jour au <input class="dev-date" value="${esc(S.fmtPartial(C.devNotesDate || ''))}" placeholder="mm/aaaa"></label></div>
              <div class="form"><textarea class="grow" rows="3" data-c="devNotes" placeholder="scolarité, aides (AESH, SESSAD, IME), rééducations (orthophonie, psychomotricité, kinésithérapie), régression éventuelle…">${esc(C.devNotes)}</textarea></div></div>
          </div>
        </div>
        <div class="card hx-wide" id="devMsCard"><div class="card-h">Développement psychomoteur <span class="muted">âge d’acquisition de chaque étape, ou « non acquis » ; fenêtres de l’OMS (1er–99e centile) et repères du CDC (âge où 75 % des enfants l’ont acquise)</span></div><div id="devMs"></div></div>
        <div class="card hx-wide" id="devAnthroCard"><div class="card-h">Mesures <span class="muted">poids, taille, périmètre crânien (IMC calculé) ; courbes de l’OMS ${P.sex === 'F' ? 'filles' : P.sex === 'M' ? 'garçons' : '(sexe à renseigner)'}</span><span class="spacer"></span><button class="mini-btn primary" id="devAnthroAdd">+ mesure</button></div><div id="devAnthro"></div></div></div>`;
      this._hxBind(box, P, C); this._hxDated(box, C);
      // date de l'information « développement actuel » : mise à jour à la saisie, sauf si on l'a fixée dans cette vue
      const dd = box.querySelector('.dev-date'), dn = box.querySelector('[data-c=devNotes]'); let fixed = false;
      dd.onchange = () => { C.devNotesDate = SV.Clinical.parsePartial(dd.value); dd.value = S.fmtPartial(C.devNotesDate); fixed = true; this.touch('patient', null, 'développement'); };
      dn.addEventListener('input', () => { if (fixed) return; const t = S.today().slice(0, 7); if (C.devNotesDate !== t) { C.devNotesDate = t; dd.value = S.fmtPartial(t); } });
      $('devEhi').onclick = () => this.edinburghDialog(() => this.renderDevView(box));
      this.renderDevBirth(); this.renderDevMilestones(); this.renderDevAnthro();
      $('devAnthroAdd').onclick = () => { C.anthro.push({ id: S.uid('W'), date: S.today(), weight: '', height: '', hc: '', note: '' }); this.touch('patient', null, 'mesures'); this.renderDevAnthro(true); };
      if (this.ui.devFocus === 'birth') { this.ui.devFocus = null; const c = $('devBirthCard'); if (c) { c.scrollIntoView({ block: 'start' }); c.classList.add('flash'); setTimeout(() => c.classList.remove('flash'), 1600); } }
    },
    /** questionnaire d'Edinburgh (Oldfield, Neuropsychologia 1971 ; 10 items, traduction française non validée) : « ++ » si
     *  l'autre main ne serait jamais utilisée, « + » sinon, « + » des deux côtés si indifférent ; QL = 100 × (D − G) / (D + G).
     *  Classement au seuil conventionnel de ±40 (Oldfield n'en donne pas) ; pied et œil facultatifs, hors quotient. */
    edinburghDialog(after) {
      const C = this.dossier.patient.clin, P = this.dossier.patient, E = C.ehi = C.ehi || { items: {} }, it = E.items;
      const ITEMS = [['write', 'Écrire'], ['draw', 'Dessiner'], ['throw', 'Lancer'], ['scissors', 'Ciseaux'], ['tooth', 'Brosse à dents'], ['knife', 'Couteau (sans fourchette)'], ['spoon', 'Cuillère'], ['broom', 'Balai (main supérieure)'], ['match', 'Craquer une allumette (main tenant l’allumette)'], ['box', 'Ouvrir une boîte (main tenant le couvercle)']];
      const R = [['L2', '++ G'], ['L1', '+ G'], ['B', 'les deux'], ['R1', '+ D'], ['R2', '++ D']], PTS = { L2: [2, 0], L1: [1, 0], B: [1, 1], R1: [0, 1], R2: [0, 2] };
      const score = () => { let l = 0, r = 0, n = 0; for (const [k] of ITEMS) { const v = PTS[it[k]]; if (v) { l += v[0]; r += v[1]; n++; } } return n && l + r ? { lq: Math.round(100 * (r - l) / (r + l)), n } : null; };
      const cls = lq => lq > 40 ? ['R', 'droitier'] : lq < -40 ? ['L', 'gaucher'] : ['A', 'ambidextre (mixte)'];
      const m = document.createElement('div'); m.className = 'modal'; const card = document.createElement('div'); card.className = 'modal-card ehi'; m.appendChild(card); document.body.appendChild(m);
      const draw = () => { const sc = score();
        card.innerHTML = `<div class="modal-head"><span>Questionnaire d’Edinburgh — latéralité manuelle</span><button class="close">✕</button></div>
          <div class="help"><p class="muted small">Pour chaque activité, la main préférée : « ++ » si l’autre ne serait jamais utilisée, « + » sinon ; « les deux » si indifférent ; rien si jamais fait. Traduction non validée de l’Edinburgh Handedness Inventory (Oldfield, 1971).</p>
          <table class="ehi-t">${ITEMS.map(([k, l]) => `<tr data-k="${k}"><td>${esc(l)}</td><td><span class="seg">${R.map(([v, t]) => `<button data-v="${v}" class="${it[k] === v ? 'on' : ''}">${t}</button>`).join('')}</span></td></tr>`).join('')}
            <tr class="opt"><td>Pied (pour shooter) <span class="muted small">facultatif</span></td><td><span class="seg" data-o="foot">${[['L', 'gauche'], ['B', 'les deux'], ['R', 'droit']].map(([v, t]) => `<button data-v="${v}" class="${E.foot === v ? 'on' : ''}">${t}</button>`).join('')}</span></td></tr>
            <tr class="opt"><td>Œil (pour viser) <span class="muted small">facultatif</span></td><td><span class="seg" data-o="eye">${[['L', 'gauche'], ['R', 'droit']].map(([v, t]) => `<button data-v="${v}" class="${(E.eye || C.eye) === v ? 'on' : ''}">${t}</button>`).join('')}</span></td></tr></table>
          <div class="ehi-res">${sc ? `Quotient de latéralité <b>${sc.lq > 0 ? '+' : ''}${sc.lq}</b> — ${cls(sc.lq)[1]} <span class="muted small">(${sc.n} / 10 items ; seuil conventionnel ±40)</span>` : '<span class="muted">Répondre aux items pour calculer le quotient.</span>'}</div></div>
          <div class="modal-foot"><button class="primary ok"${sc ? '' : ' disabled'}>Reporter dans le dossier</button><button class="cancel">Fermer</button></div>`;
        card.querySelectorAll('tr[data-k] [data-v]').forEach(b => b.onclick = () => { const k = b.closest('tr').dataset.k; it[k] = it[k] === b.dataset.v ? '' : b.dataset.v; draw(); });
        card.querySelectorAll('[data-o] [data-v]').forEach(b => b.onclick = () => { const k = b.closest('[data-o]').dataset.o; E[k] = E[k] === b.dataset.v ? '' : b.dataset.v; draw(); });
        card.querySelector('.close').onclick = card.querySelector('.cancel').onclick = () => { m.remove(); this.touch('patient', null, 'Edinburgh'); };
        card.querySelector('.ok').onclick = () => { const sc2 = score(); if (!sc2) return; C.edinburgh = sc2.lq; E.lq = sc2.lq; E.at = S.today(); if (E.eye) C.eye = E.eye; if (!P.handedness) P.handedness = cls(sc2.lq)[0]; m.remove(); this.touch('patient', null, 'Edinburgh ' + sc2.lq); if (after) after(); };
      };
      draw();
    },
    renderDevBirth() {
      const host = $('devBirth'); if (!host) return;
      const d = this.dossier, P = d.patient, C = ensure(P.clin), B = C.birth, A = C.antecedents, st = birthStats(P, B);
      const yn = (key, obj, lab, ph) => `<tr data-yn="${key}"><td>${esc(lab)}</td><td><span class="seg yn">${YN.map(([v, t]) => `<button data-v="${v}" class="${(obj.v || '') === v ? 'on ' + (v || 'u') : ''}">${t}</button>`).join('')}</span></td><td><input class="inline" data-t value="${esc(obj.text || '')}" placeholder="${esc(ph)}"></td></tr>`;
      const meas = (k, f, lab, unit, ph) => { const p = st[k]; return `<label>${lab} <span class="inrow"><input type="number" step="any" min="0" data-b="${f}" value="${esc(B[f])}" placeholder="${ph}"> ${unit}${p != null ? ` <span class="badge ${p < 0.03 || p > 0.97 ? 'warn' : p < 0.1 || p > 0.9 ? 'mid' : ''}" title="INTERGROWTH-21st, ${P.sex === 'F' ? 'filles' : 'garçons'}, ${st.ga ? Math.floor(st.ga / 7) + '+' + (st.ga % 7) : ''} SA">${pctTxt(p)}</span>` : ''}</span></label>`; };
      host.innerHTML = `<table class="ant">${yn('pregnancy', A.pregnancy, 'Grossesse pathologique', 'HTA, diabète, toxiques, traitements, retard de croissance…')}${yn('infection', B.infection, 'Infection materno-fœtale', 'CMV, toxoplasmose, chorioamniotite, streptocoque B…')}${yn('obstetric', B.obstetric, 'Complications obstétricales', 'souffrance fœtale, hémorragie, dystocie, circulaire…')}${yn('perinatal', A.perinatal, 'Complications périnatales, néonatales', 'réanimation, détresse respiratoire, convulsions néonatales, ictère…')}</table>
        <div class="form grid2" style="margin-top:8px">
          <label>Terme <span class="inrow"><input type="number" min="22" max="44" data-b="gaWeeks" value="${esc(B.gaWeeks)}" placeholder="SA"> + <input type="number" min="0" max="6" data-b="gaDays" value="${esc(B.gaDays)}" placeholder="j"> SA</span></label>
          <label>Accouchement <select data-b="mode">${opts(DELIVERY, B.mode)}</select></label>
          ${meas('wt', 'weight', 'Poids', 'g', '3300')}${meas('len', 'length', 'Taille', 'cm', '50')}${meas('hc', 'hc', 'PC', 'cm', '34')}
          <label>Apgar <input data-b="apgar" value="${esc(B.apgar)}" placeholder="ex. 8 / 10 / 10"></label>
          <label class="span2">Période néonatale, remarques <textarea class="grow" rows="2" data-b="notes" placeholder="séjour en néonatalogie, alimentation, sortie…">${esc(B.notes)}</textarea></label></div>
        ${st.ga != null ? `<div class="dev-birthsum"><b>${esc(st.term)}</b>${st.cls ? ' · ' + esc(st.cls) : ''}${st.hcCls ? ' · <span class="warn">' + esc(st.hcCls) + '</span>' : ''}${!st.sex ? ' · <span class="muted">sexe à renseigner pour les centiles</span>' : ''}</div>` : '<div class="hint">Terme (SA) et sexe : poids, taille et PC de naissance situés sur les courbes INTERGROWTH-21st (24 à 42 SA).</div>'}
        ${st.ga != null && st.sex ? `<div class="dev-igcharts">${[['wt', num(B.weight) != null ? +B.weight / 1000 : null], ['len', num(B.length)], ['hc', num(B.hc)]].map(([k, y]) => `<figure><figcaption>${esc(G.IGV[k].fr)} de naissance</figcaption>${G.igChart(k, st.sex, st.ga, y, { w: 236, h: 170 })}</figure>`).join('')}</div>` : ''}`;
      SV.Clinical.growAll(host);
      const touch = () => this.touch('patient', null, 'naissance');
      host.querySelectorAll('tr[data-yn]').forEach(tr => {
        const k = tr.dataset.yn, obj = k === 'pregnancy' || k === 'perinatal' ? (A[k] = A[k] || { v: '', text: '' }) : B[k];
        const sync = () => { tr.querySelectorAll('[data-v]').forEach(x => x.className = x.dataset.v === (obj.v || '') ? 'on ' + (x.dataset.v || 'u') : ''); };
        tr.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { obj.v = b.dataset.v; sync(); if ((k === 'infection' || k === 'obstetric') && obj.v === 'yes' && !A.pregnancy.v) { A.pregnancy.v = 'yes'; later(this, 'renderDevBirth'); } touch(); });
        tr.querySelector('[data-t]').oninput = e => { obj.text = e.target.value; if (obj.text && !obj.v) { obj.v = 'yes'; sync(); } touch(); };
      });
      host.querySelectorAll('[data-b]').forEach(el => { const k = el.dataset.b; el[el.tagName === 'SELECT' ? 'onchange' : 'oninput'] = () => { B[k] = el.value; touch(); }; if (el.type === 'number' || el.tagName === 'SELECT') el.addEventListener('change', () => {
        // prématurité : complication périnatale répondue « oui » si rien n'était répondu
        if ((k === 'gaWeeks') && num(B.gaWeeks) != null && +B.gaWeeks < 37 && !A.perinatal.v) { A.perinatal.v = 'yes'; if (!A.perinatal.text) A.perinatal.text = 'prématurité (' + B.gaWeeks + ' SA)'; }
        later(this, 'renderDevBirth'); if (k === 'gaWeeks' || k === 'gaDays') later(this, 'renderDevMilestones'); }); });
    },
    renderDevMilestones() {
      const host = $('devMs'); if (!host) return;
      const d = this.dossier, P = d.patient, C = ensure(P.clin), B = C.birth, acq = C.milestones;
      const ageD = G.ageDays(P, null), corrD = G.correctedDays(P, { weeks: B.gaWeeks, days: B.gaDays }, null), ageM = corrD != null ? corrD / G.MONTH : null, isCorr = ageD != null && corrD != null && Math.abs(ageD - corrD) > 1;
      const DA = G.devAges(acq), any = Object.values(DA).some(v => v != null);
      const rows = Object.entries(G.DOMAINS).map(([dk, dl]) => `<tr class="ms-dom"><td colspan="4">${esc(dl)}${DA[dk] != null ? ` <span class="muted small">— âge de développement ≈ ${fmt(DA[dk], 1)} mois</span>` : ''}</td></tr>` + G.MILESTONES.filter(m => m.dom === dk).map(m => {
        const a = acq[m.k] || {}, J = G.judge(m, a, ageM);
        return `<tr data-m="${m.k}"><td>${esc(m.fr)}</td><td class="muted small">${m.who ? `OMS ${fmt(m.who[0], 1)}–${fmt(m.who[2], 1)} mois (méd. ${fmt(m.who[1], 1)})` : `CDC : 75 % à ${m.cdc} mois`}</td><td class="ms-in"><input type="number" min="0" max="240" step="0.5" data-k="months" value="${esc(a.months == null ? '' : a.months)}" placeholder="mois"${a.no ? ' disabled' : ''}><label class="chip" title="pas encore acquise à ce jour"><input type="checkbox" data-k="no"${a.no ? ' checked' : ''}> non acquis</label></td><td><span class="ms-st ${J.cls}">${esc(J.txt)}</span></td></tr>`;
      }).join('')).join('');
      host.innerHTML = `<div class="dev-ms">
          <div class="dev-ms-l"><table class="ms-tab">${rows}</table></div>
          <div class="dev-ms-r">
            <div class="dev-da">${ageM != null ? `<div><b>${isCorr ? 'Âge corrigé' : 'Âge'}</b> ${esc(G.fmtAge(corrD))}${isCorr ? ` <span class="muted">(chronologique ${esc(G.fmtAge(ageD))})</span>` : ''}</div>` : ''}
              ${any ? `<div class="dev-chips">${Object.entries(G.DOMAINS).filter(([k]) => DA[k] != null).map(([k, l]) => `<span class="chip" title="âge de référence de l’étape la plus avancée acquise (indicatif, n’est pas une échelle de développement)">${esc(l)} ≈ ${fmt(DA[k], 1)} mois${ageM != null && ageM < 72 && ageM > 1 ? ` <b>(${Math.round(100 * Math.min(DA[k], ageM) / ageM)} %)</b>` : ''}</span>`).join('')}</div><div class="muted small">Âge de développement indicatif : âge de référence de l’étape la plus avancée acquise dans chaque domaine${ageM != null && ageM < 72 ? ', rapporté à l’âge' + (isCorr ? ' corrigé' : '') : ''} ; seule une échelle standardisée (Brunet-Lézine, Bayley, Vineland…) donne un quotient de développement.</div>` : '<div class="hint">Saisissez l’âge (en mois) auquel chaque étape a été acquise ; « non acquis » si elle ne l’est pas encore.</div>'}</div>
            <div class="dev-mschart">${G.milestoneChart(acq, ageM, { corrected: isCorr, w: 600, interactive: true })}<div class="muted small">clic sur la ligne d’une étape : âge d’acquisition (au ½ mois) ; clic droit : acquis, non acquis, effacer</div></div>
          </div></div>`;
      this._hxBind(host, P, C); this._hxDated(host, C);
      host.querySelectorAll('tr[data-m]').forEach(tr => {
        const k = tr.dataset.m, a = () => (acq[k] = acq[k] || { months: '', no: false });
        const mi = tr.querySelector('[data-k=months]'), no = tr.querySelector('[data-k=no]');
        mi.oninput = () => { a().months = mi.value === '' ? '' : +mi.value; if (mi.value !== '') a().no = false; this.touch('patient', null, 'développement'); };
        mi.onchange = () => later(this, 'renderDevMilestones');
        no.onchange = () => { a().no = no.checked; if (no.checked) a().months = ''; this.touch('patient', null, 'développement'); later(this, 'renderDevMilestones'); };
      });
      const sv = host.querySelector('svg.ms-chart'); if (sv) this._devMsChartBind(sv, acq);
    },
    /** frise des acquisitions : survol (repère et âge), clic = acquis à cet âge, clic droit = menu */
    _devMsChartBind(sv, acq) {
      const D = sv.dataset, x0 = +D.x0, x1 = +D.x1, amax = +D.amax, mt = +D.mt, rh = +D.rowh, keys = (D.keys || '').split(','), cur = sv.querySelector('.gr-cur'), ln = cur && cur.querySelector('line'), tx = cur && cur.querySelector('text'), MS = new Map(G.MILESTONES.map(m => [m.k, m]));
      const at = e => { const p = svgPt(sv, e); if (!p) return null; const i = Math.floor((p.y - mt) / rh); if (i < 0 || i >= keys.length || p.x < x0 - 3 || p.x > x1 + 3) return null; const m = Math.max(0, Math.min(amax, Math.round((p.x - x0) / (x1 - x0) * amax * 2) / 2)); return { k: keys[i], m, x: x0 + m / amax * (x1 - x0), y: mt + i * rh + rh / 2 }; };
      const set = (k, patch) => { acq[k] = Object.assign(acq[k] || { months: '', no: false }, patch); this.touch('patient', null, 'développement'); this.renderDevMilestones(); };
      sv.onmousemove = e => { const a = at(e); if (!cur) return; if (!a) { cur.style.display = 'none'; return; } cur.style.display = ''; ln.setAttribute('x1', a.x); ln.setAttribute('x2', a.x); const right = a.x > x1 - 70; tx.setAttribute('x', right ? a.x - 5 : a.x + 5); tx.setAttribute('text-anchor', right ? 'end' : 'start'); tx.setAttribute('y', a.y - 5); tx.textContent = `${fmt(a.m, 1)} mois`; };
      sv.onmouseleave = () => { if (cur) cur.style.display = 'none'; };
      sv.onclick = e => { const a = at(e); if (a) set(a.k, { months: a.m, no: false }); };
      sv.oncontextmenu = e => { const a = at(e); if (!a) return; e.preventDefault(); const m = MS.get(a.k), c0 = acq[a.k] || {}, items = [{ head: m ? m.fr : a.k }, { label: `Acquis à ${fmt(a.m, 1)} mois`, run: () => set(a.k, { months: a.m, no: false }) }, { label: 'Non acquis à ce jour', run: () => set(a.k, { months: '', no: true }) }];
        if ((c0.months !== '' && c0.months != null) || c0.no) items.push({ sep: true }, { label: 'Effacer', danger: true, run: () => set(a.k, { months: '', no: false }) }); this.popupMenu(items, e.clientX, e.clientY); };
    },
    renderDevAnthro(focusLast) {
      const host = $('devAnthro'); if (!host) return;
      const d = this.dossier, P = d.patient, C = ensure(P.clin), B = C.birth, rows = anthroRows(P, C), sex = P.sex === 'F' || P.sex === 'M' ? P.sex : null;
      const ind = this.ui.devInd || 'wt', ageD = G.ageDays(P, null);
      const zB = (z, k) => z == null ? '' : `<span class="zb ${zCls(z)}" title="${esc(G.IND[k].fr)} : z = ${fmt(z, 2)} (OMS)">${pctTxt(G.normCdf(z))}</span>`;
      const tbl = rows.length ? `<table class="aed anthro"><thead><tr><th>date</th><th>âge</th><th>poids (kg)</th><th>taille (cm)</th><th>PC (cm)</th><th>IMC</th><th>remarque</th><th></th></tr></thead><tbody>${rows.map(r => `<tr data-id="${r.x.id}"><td><input type="date" data-f="date" value="${esc(r.x.date || '')}"></td><td class="muted small">${esc(G.fmtAge(r.d))}</td><td><input type="number" step="any" min="0" data-f="weight" value="${esc(r.x.weight)}"> ${zB(r.z.wt, 'wt')}</td><td><input type="number" step="any" min="0" data-f="height" value="${esc(r.x.height)}"> ${zB(r.z.ht, 'ht')}</td><td><input type="number" step="any" min="0" data-f="hc" value="${esc(r.x.hc)}"> ${zB(r.z.hc, 'hc')}</td><td class="mono">${r.bmi != null ? fmt(r.bmi, 1) : '—'} ${zB(r.z.bmi, 'bmi')}</td><td><input data-f="note" value="${esc(r.x.note || '')}" placeholder="examen, contexte"></td><td><b class="x" data-rm="${r.x.id}">✕</b></td></tr>`).join('')}</tbody></table>` : '<div class="hint">Aucune mesure. « + mesure » : poids, taille et périmètre crânien datés (IMC calculé), situés sur les courbes de l’OMS.</div>';
      // points des courbes : mesures datées (+ naissance à terme)
      const pts = k => { const L = rows.map(r => ({ d: r.d, y: k === 'wt' ? r.w : k === 'ht' ? r.h : k === 'bmi' ? r.bmi : r.hc, id: r.x.id })).filter(p => p.y != null && p.d != null && p.d >= 0); const term = num(B.gaWeeks) == null || +B.gaWeeks >= 37; if (term) { const y = k === 'wt' ? num(B.weight) != null ? +B.weight / 1000 : null : k === 'ht' ? num(B.length) : k === 'hc' ? num(B.hc) : null; if (y != null) L.unshift({ d: 0, y, id: 'birth' }); } return L; };
      const lastD = Math.max(ageD || 0, ...rows.map(r => r.d || 0)), note = ind === 'hc' && lastD > 1856 ? 'Pas de référence OMS du périmètre crânien après 5 ans (courbe jusqu’à 5 ans).' : ind === 'wt' && lastD > 3683 ? 'Référence OMS du poids pour l’âge jusqu’à 10 ans ; au-delà, suivre l’IMC.' : (ind === 'ht' || ind === 'bmi') && lastD > 6970 ? 'Référence OMS jusqu’à 19 ans ; adulte : IMC (< 18,5 maigreur, 25–30 surpoids, ≥ 30 obésité).' : '';
      host.innerHTML = `${tbl}<div class="dev-gr"><div class="seg dev-ind">${Object.entries(G.IND).map(([k, v]) => `<button data-ind="${k}" class="${k === ind ? 'on' : ''}">${esc(v.fr)}</button>`).join('')}</div>
        ${sex ? G.whoChart(ind, sex, pts(ind), { w: 640, h: 300, interactive: true, dNow: ageD }) + `<div class="muted small">${ind === 'bmi' ? 'IMC calculé d’après le poids et la taille' : 'clic droit sur la courbe : ajouter un point à cet âge et à cette valeur ; clic droit sur un point : le retirer'}</div>` : '<div class="hint">Renseignez le sexe du patient (Synthèse) : courbes garçons ou filles.</div>'}${note ? `<div class="muted small">${esc(note)}</div>` : ''}<div class="muted small">OMS : Child Growth Standards 2006 (0–5 ans) et Growth Reference 2007 (5–19 ans) ; bande P3–P97, courbes P3, P15, P50, P85, P97 ; z-score et centile de chaque mesure (au-delà de ±2 DS en orange, ±3 DS en rouge).</div></div>`;
      host.querySelectorAll('[data-ind]').forEach(b => b.onclick = () => { this.ui.devInd = b.dataset.ind; this.renderDevAnthro(); });
      host.querySelectorAll('tr[data-id]').forEach(tr => {
        const x = C.anthro.find(y => y.id === tr.dataset.id);
        tr.querySelectorAll('[data-f]').forEach(el => { el.oninput = () => { x[el.dataset.f] = el.value; this.touch('patient', null, 'mesures'); }; if (el.dataset.f !== 'note') el.onchange = () => later(this, 'renderDevAnthro'); });
      });
      host.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { C.anthro = C.anthro.filter(y => y.id !== b.dataset.rm); this.touch('patient', null, 'mesures'); this.renderDevAnthro(); });
      if (focusLast) { const ins = host.querySelectorAll('tr[data-id] [data-f=weight]'); if (ins.length) ins[ins.length - 1].focus(); }
      const sv = host.querySelector('svg.gr-chart'); if (sv && sex) this._devGrBind(sv, ind, sex);
    },
    /** courbe de croissance : survol (âge, valeur, centile), clic droit = ajouter un point / retirer le point visé */
    _devGrBind(sv, ind, sex) {
      const P = this.dossier.patient, C = ensure(P.clin), B = C.birth, D = sv.dataset, x0 = +D.x0, x1 = +D.x1, y0 = +D.y0, y1 = +D.y1, d0 = +D.d0, d1 = +D.d1, lo = +D.lo, hi = +D.hi, I = G.IND[ind];
      const cur = sv.querySelector('.gr-cur'), q = c => cur && cur.querySelector(c), X = d => x0 + (d - d0) / (d1 - d0) * (x1 - x0), Y = v => y0 + (hi - v) / (hi - lo) * (y1 - y0);
      const at = e => { const p = svgPt(sv, e); if (!p || p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) return null; const d = Math.max(0, Math.round(d0 + (p.x - x0) / (x1 - x0) * (d1 - d0))), v = roundV(ind, hi - (p.y - y0) / (y1 - y0) * (hi - lo)); return v > 0 ? { d, v } : null; };
      const lab = a => { const z = G.whoZ(ind, sex, a.d, a.v); return `${G.fmtAge(a.d)} · ${fmt(a.v, ind === 'wt' && a.v < 10 ? 2 : 1)} ${I.unit}${z != null ? ` · P${fmt(100 * G.normCdf(z), 0)}` : ''}`; };
      sv.onmousemove = e => { if (!cur) return; const a = e.target.closest && e.target.closest('circle.gr-pt') ? null : at(e); if (!a || ind === 'bmi') { cur.style.display = 'none'; return; } cur.style.display = '';
        const x = X(a.d), y = Y(a.v), right = x > x1 - 150; q('.gr-curl').setAttribute('x1', x); q('.gr-curl').setAttribute('x2', x); q('.gr-curh').setAttribute('y1', y); q('.gr-curh').setAttribute('y2', y); q('.gr-curp').setAttribute('cx', x); q('.gr-curp').setAttribute('cy', y);
        const t = q('.gr-curt'); t.setAttribute('x', right ? x - 7 : x + 7); t.setAttribute('y', y < y0 + 16 ? y + 14 : y - 7); t.setAttribute('text-anchor', right ? 'end' : 'start'); t.textContent = lab(a); };
      sv.onmouseleave = () => { if (cur) cur.style.display = 'none'; };
      const done = birth => { this.touch('patient', null, 'mesures'); this.renderDevAnthro(); if (birth && this.renderDevBirth) this.renderDevBirth(); };
      sv.oncontextmenu = e => {
        const pt = e.target.closest && e.target.closest('circle.gr-pt[data-id]'), items = [];
        if (pt) {
          const id = pt.dataset.id, x = id === 'birth' ? null : C.anthro.find(y => y.id === id), t = pt.querySelector('title');
          items.push({ head: (t ? t.textContent : I.fr) });
          if (ind === 'bmi') items.push({ head: 'IMC calculé : retirer le poids ou la taille' });
          else if (id === 'birth') items.push({ label: `Retirer le point (${I.fr} de naissance)`, danger: true, run: () => { B[BFIELD[ind]] = ''; done(true); } });
          else if (x) items.push({ label: 'Retirer le point', danger: true, run: () => { x[FIELD[ind]] = ''; if (!num(x.weight) && !num(x.height) && !num(x.hc) && !String(x.note || '').trim()) C.anthro = C.anthro.filter(y => y !== x); done(); } });
        } else {
          const a = at(e); if (!a) return; items.push({ head: lab(a) });
          const b = G.birthTime(P);
          if (ind === 'bmi') items.push({ head: 'IMC calculé d’après le poids et la taille : ajouter ces mesures' });
          else if (isNaN(b)) items.push({ head: 'date de naissance à renseigner (Synthèse)' });
          else { const date = isoDay(b + a.d * 864e5); items.push({ label: `Ajouter un point : ${fmt(a.v, ind === 'wt' && a.v < 10 ? 2 : 1)} ${I.unit} le ${date.split('-').reverse().join('/')}`, run: () => {
            let x = C.anthro.find(y => y.date === date); if (!x) { x = { id: S.uid('W'), date, weight: '', height: '', hc: '', note: '' }; C.anthro.push(x); } x[FIELD[ind]] = String(a.v); done(); } }); }
        }
        e.preventDefault(); this.popupMenu(items, e.clientX, e.clientY);
      };
    },
  };
  /** v5.2 — morceaux du développement : text (blocs HTML : grossesse et naissance, acquisitions, évaluations, mesures),
   *  ms (courbe des acquisitions), charts (courbes de croissance OMS), nMs (acquisitions renseignées) ; null si rien */
  M.devParts = function (d) {
    const P = d.patient, C = P.clin || {}; if (!C.birth && !C.milestones && !C.anthro && !(C.devEvals || []).length && !C.devNotes) return null;
    ensure(C); const B = C.birth, A = C.antecedents || {}, st = birthStats(P, B), out = [], yn = o => o && o.v ? (o.v === 'yes' ? 'oui' : o.v === 'no' ? 'non' : '?') + (o.text ? ' (' + o.text + ')' : '') : '';
    const preg = [['Grossesse pathologique', A.pregnancy], ['Infection materno-fœtale', B.infection], ['Complications obstétricales', B.obstetric], ['Complications périnatales, néonatales', A.perinatal]].filter(([, o]) => o && (o.v || o.text));
    const birthTxt = [st.ga != null ? `né${P.sex === 'F' ? 'e' : ''} à ${B.gaWeeks}${B.gaDays ? '+' + B.gaDays : ''} SA, ${st.term}` : '', DELIVERY[B.mode] && B.mode ? DELIVERY[B.mode] : '', B.apgar ? 'Apgar ' + B.apgar : '',
      num(B.weight) != null ? `poids ${B.weight} g${st.wt != null ? ' (' + pctTxt(st.wt) + ', ' + st.cls + ')' : ''}` : '', num(B.length) != null ? `taille ${fmt(+B.length, 1)} cm${st.len != null ? ' (' + pctTxt(st.len) + ')' : ''}` : '', num(B.hc) != null ? `PC ${fmt(+B.hc, 1)} cm${st.hc != null ? ' (' + pctTxt(st.hc) + (st.hcCls ? ', ' + st.hcCls : '') + ')' : ''}` : ''].filter(Boolean);
    if (preg.length || birthTxt.length || B.notes) out.push(`<h4>Grossesse et naissance</h4>${preg.length ? `<table class="anttab">${preg.map(([l, o]) => `<tr><td>${esc(l)}</td><td class="${o.v}">${esc(yn(o))}</td></tr>`).join('')}</table>` : ''}${birthTxt.length ? `<p>${esc(birthTxt.join(' · '))}${st.ga != null && st.sex ? ' <span class="m">(INTERGROWTH-21st)</span>' : ''}</p>` : ''}${B.notes ? `<p>${esc(B.notes).replace(/\n/g, '<br>')}</p>` : ''}`);
    const acq = C.milestones || {}, filled = G.MILESTONES.filter(m => acq[m.k] && ((acq[m.k].months !== '' && acq[m.k].months != null) || acq[m.k].no));
    const ageD = G.ageDays(P, null), corrD = G.correctedDays(P, { weeks: B.gaWeeks, days: B.gaDays }, null), ageM = corrD != null ? corrD / G.MONTH : null, DA = G.devAges(acq);
    if (filled.length) out.push(`<h4>Développement psychomoteur</h4><table><tr><th>étape</th><th>acquise à</th><th>référence</th><th>appréciation</th></tr>${filled.map(m => { const a = acq[m.k], J = G.judge(m, a, ageM); return `<tr><td>${esc(G.DOMAINS[m.dom])} — ${esc(m.fr)}</td><td class="mono">${a.no ? 'non acquise' : fmt(+a.months, 1) + ' mois'}</td><td class="m">${m.who ? `OMS ${fmt(m.who[0], 1)}–${fmt(m.who[2], 1)} mois` : `CDC : 75 % à ${m.cdc} mois`}</td><td>${esc(J.txt)}</td></tr>`; }).join('')}</table>${Object.values(DA).some(v => v != null) ? `<p>Âge de développement indicatif : ${Object.entries(DA).filter(([, v]) => v != null).map(([k, v]) => `${esc(G.DOMAINS[k])} ≈ ${fmt(v, 1)} mois`).join(' ; ')}${ageM != null && ageM < 72 ? ` (âge${Math.abs(ageD - corrD) > 1 ? ' corrigé' : ''} ${esc(G.fmtAge(corrD))})` : ''}.</p>` : ''}`);
    const ms = filled.length ? G.milestoneChart(acq, ageM, { corrected: ageD != null && Math.abs(ageD - corrD) > 1, w: 660 }) : '';
    const ev = (C.devEvals || []).filter(x => x.text).sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    if (ev.length || C.devNotes) out.push(`${filled.length ? '' : '<h4>Développement psychomoteur</h4>'}${ev.length ? `<table class="dtab">${ev.map(x => `<tr><td class="mono" style="width:90px">${esc(S.fmtPartial(x.date) || '—')}</td><td>${esc(x.text)}</td></tr>`).join('')}</table>` : ''}${C.devNotes ? `<p>${esc(C.devNotes).replace(/\n/g, '<br>')}</p>` : ''}`);
    const rows = anthroRows(P, C), sex = P.sex === 'F' || P.sex === 'M' ? P.sex : null, charts = [];
    if (rows.length) {
      const zc = (z, k) => z == null ? '' : ` <span class="m">(${pctTxt(G.normCdf(z))}, z ${fmt(z, 1)})</span>`;
      out.push(`<h4>Mesures</h4><table><tr><th>date</th><th>âge</th><th>poids</th><th>taille</th><th>PC</th><th>IMC</th></tr>${rows.map(r => `<tr><td class="mono">${esc(r.x.date ? new Date(r.x.date + 'T12:00:00').toLocaleDateString(SV.LOC) : '—')}</td><td>${esc(G.fmtAge(r.d))}</td><td>${r.w != null ? fmt(r.w, 1) + ' kg' + zc(r.z.wt) : ''}</td><td>${r.h != null ? fmt(r.h, 1) + ' cm' + zc(r.z.ht) : ''}</td><td>${r.hc != null ? fmt(r.hc, 1) + ' cm' + zc(r.z.hc) : ''}</td><td>${r.bmi != null ? fmt(r.bmi, 1) + zc(r.z.bmi) : ''}</td></tr>`).join('')}</table>`);
      if (sex) { const lastD = Math.max(...rows.map(r => r.d || 0)); for (const k of ['wt', 'ht', 'hc', 'bmi']) { if (k === 'hc' && lastD > 1856 + 365) continue; if (k === 'wt' && lastD > 3683) continue; if (lastD > 6970 + 365) continue; const pts = rows.map(r => ({ d: r.d, y: k === 'wt' ? r.w : k === 'ht' ? r.h : k === 'bmi' ? r.bmi : r.hc })).filter(p => p.y != null && p.d != null); if (pts.length) charts.push(`<figure><figcaption>${esc(G.IND[k].fr)} pour l’âge (OMS, ${sex === 'F' ? 'filles' : 'garçons'})</figcaption>${G.whoChart(k, sex, pts, { w: 460, h: 250 })}</figure>`); } }
    }
    return out.length || charts.length ? { text: out, ms, nMs: filled.length, charts } : null;
  };
  /** compte rendu : grossesse et naissance, acquisitions (courbe dès 3 étapes), évaluations, mesures et courbes */
  M.reportDevelopment = function (d) {
    const D = this.devParts(d); if (!D) return '';
    const out = D.text.slice(), k = out.findIndex(t => /^<h4>Mesures/.test(t));
    if (D.nMs >= 3) out.splice(k < 0 ? out.length : k, 0, `<div class="gr-rep">${D.ms}</div>`);
    if (D.charts.length) out.push(`<div class="gr-rep two">${D.charts.join('')}</div>`);
    return `<h3>Grossesse, naissance et développement</h3>${out.join('')}`;
  };
  Object.assign(SV.app, M);
  SV.DevUI = { ensure, birthStats, anthroRows, DELIVERY };
})(window.SV = window.SV || {});
