/* EpiScope — staff_ui.js : réunion de concertation (staff) d'épileptologie chirurgicale.
 *   1. Synthèse automatique des données saisies (crises de l'exploration, consensus sémiologique sur toutes les crises,
 *      matrice signes × crises, lésions, imagerie, SEEG : électrodes, stimulations, thermocoagulations, quantifications).
 *   2. Tableau de concordance anatomo-électro-clinique : lignes = systèmes anatomo-fonctionnels × côté ; colonnes =
 *      modalités ; cellules automatiques (sémiologie, IRM, SEEG) ou saisies (EEG scalp, TEP, neuropsychologie…), toutes
 *      modifiables, avec une note ; score de concordance par ligne.
 *   3. Hypothèses versionnées : lignée, version, « remplace », statut (proposée, en test, confirmée, réfutée…),
 *      zone épileptogène et propagation (régions VEP), arguments pour / contre ; import depuis le modèle.
 *   4. Décisions (SEEG, 2e SEEG, thermocoagulation, chirurgie…) qui créent l'exploration ou la procédure suivante.
 *   5. Compte rendu imprimable et texte pour le dossier médical.                                                     */
(function (SV) {
  'use strict';
  const $ = id => document.getElementById(id), S = SV.Store, V = S.V;
  const esc = SV.U.esc;
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const opts = (map, v) => Object.entries(map).map(([k, l]) => `<option value="${esc(k)}"${String(v) === k ? ' selected' : ''}>${esc(l)}</option>`).join('');
  const fmtDate = s => { if (!s) return ''; const d = new Date(String(s).length <= 10 ? s + 'T12:00:00' : s); return isNaN(d) ? String(s) : d.toLocaleDateString(SV.LOC); };
  const SYSTEMS = ['mesial_temporal', 'lateral_temporal', 'basal_temporal', 'insulo_opercular', 'orbitofrontal', 'prefrontal_mesial', 'prefrontal_lateral', 'premotor', 'central', 'parietal_lateral', 'posterior_medial', 'occipital'];
  const SYS_FR = { mesial_temporal: 'temporal mésial', lateral_temporal: 'temporal latéral', basal_temporal: 'temporal basal', insulo_opercular: 'insulo-operculaire', central: 'central (rolandique)', premotor: 'prémoteur / AMS', prefrontal_lateral: 'préfrontal latéral', prefrontal_mesial: 'préfrontal mésial / cingulaire ant.', orbitofrontal: 'orbitofrontal', posterior_medial: 'pariétal médian / cingulaire post.', parietal_lateral: 'pariétal latéral', occipital: 'occipital' };
  const LEVELS = [['++', 'argument fort'], ['+', 'en faveur'], ['0', 'neutre / normal'], ['−', 'contre'], ['?', 'douteux'], ['', 'non renseigné']];
  const LV_SCORE = { '++': 2, '+': 1, '0': 0, '−': -1, '?': 0, '': 0 };
  const DEFAULT_COLS = [
    { key: 'semio', label: 'Sémiologie', auto: true, hint: 'consensus du modèle sur les crises prises en compte (régions d’origine candidates)' },
    { key: 'eeg_ii', label: 'EEG intercritique' }, { key: 'eeg_ic', label: 'EEG critique (scalp)' },
    { key: 'mri', label: 'IRM', auto: true, hint: 'lésions déclarées dans le dossier' }, { key: 'pet', label: 'TEP' }, { key: 'neuropsy', label: 'Neuropsychologie' },
    { key: 'seeg_q', label: 'SEEG : quantification', auto: true, seeg: true, hint: 'maximum normalisé des jeux de quantification (EI…) sur les plots du système' },
    { key: 'seeg_stim', label: 'SEEG : stimulations', auto: true, seeg: true, hint: 'réponse la plus forte : crise habituelle, crise, post-décharge, réponse clinique habituelle' },
  ];
  const CONF_W = { low: 0.4, medium: 0.7, high: 1 };

  const M = {
    // ================================================================ réunion courante
    newMeeting() {
      const d = this.dossier; if (!d) return;
      const exs = S.explorationsSorted(d), last = exs[exs.length - 1], prev = d.meetings.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).pop();
      const lastProc = d.procedures.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).pop();
      const kind = lastProc && (!last || String(lastProc.date) >= String(last.start)) ? 'post_surgery' : last && last.kind === 'seeg' ? 'post_seeg' : 'post_phase1';
      const m = S.addMeeting(d, { kind, explorationId: last ? last.id : null, participants: prev ? prev.participants : '' });
      // les cases saisies du staff précédent (EEG scalp, TEP, neuropsychologie…) sont reprises, marquées comme telles
      if (prev && prev.concordance) { m.concordance.columns = S.clone(prev.concordance.columns); const cells = S.clone(prev.concordance.cells || {}); for (const r in cells) for (const c in cells[r]) cells[r][c].from = cells[r][c].from || prev.date; m.concordance.cells = cells; }
      this.touch(); this.ui.meetingId = m.id; this.go({ stage: 'meet:' + m.id, view: 'preparer' });
    },
    currentMeeting() {
      const d = this.dossier; if (!d) return null;
      return S.byId(d.meetings, this.ui.meetingId) || d.meetings.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).pop() || null;
    },
    /** crises prises en compte : explorations cochées (par défaut, toutes celles commencées avant la date du staff) */
    staffScope(m) {
      const d = this.dossier, exs = S.explorationsSorted(d);
      const ids = m.scope && m.scope.length ? m.scope : exs.filter(e => !m.date || !e.start || String(e.start) <= String(m.date)).map(e => e.id);
      const off = new Set(m.scopeOff || []), seizures = []; for (const ex of exs) if (ids.includes(ex.id)) for (const sz of S.seizuresOfExploration(d, ex.id)) if (sz.events.length && !off.has(sz.id)) seizures.push({ sz, ex });
      return { ids, seizures, explorations: exs.filter(e => ids.includes(e.id)) };
    },
    /** modèle de chaque crise (mis en cache sur le contenu de la crise) */
    seizureModel(sz) {
      const d = this.dossier, key = JSON.stringify([sz.events, sz.eeg_onset, sz.params, d.patient.dominant, S.lesionRegions(d)]);
      this._mc = this._mc || new Map(); const c = this._mc.get(sz.id); if (c && c.key === key) return c.res;
      const res = SV.Model.compute({ events: sz.events, patient: { dominant: d.patient.dominant === 'R' ? 'R' : 'L', eeg_onset: sz.eeg_onset, seizure_end: sz.seizure_end, state: sz.vigilance, lesion: S.lesionRegions(d) }, params: sz.params || {}, db: this.db, atlas: this.atlas });
      this._mc.set(sz.id, { key, res }); return res;
    },
    /** consensus sur les crises : latéralisation, score d'origine moyen par région (crises habituelles ×2), hypothèses récurrentes */
    consensus(scope) {
      const N = this.atlas.N, sum = new Float32Array(N); let wsum = 0, pl = 0; const hyps = new Map(), per = [];
      for (const { sz, ex } of scope.seizures) {
        const r = this.seizureModel(sz), w = sz.habitual === 'yes' ? 2 : sz.habitual === 'no' ? 0.5 : 1; per.push({ sz, ex, r, w });
        const mx = Math.max(1e-6, ...r.candidates.map(c => c.score));
        for (const c of r.candidates) sum[c.region] += w * c.score / mx;
        wsum += w; pl += w * r.lateralization.pL;
        r.hypotheses.slice(0, 3).forEach((H, k) => { const key = H.name + '|' + H.hemi; const e = hyps.get(key) || { key, name: H.name, hemi: H.hemi, n: 0, top: 0, w: 0, H, sz }; e.n++; if (k === 0) e.top++; e.w += w * H.score * (k === 0 ? 1 : 0.6); if (H.score > e.H.score) { e.H = H; e.sz = sz; } hyps.set(key, e); });
      }
      for (let i = 0; i < N; i++) sum[i] = wsum ? sum[i] / wsum : 0;
      return { per, region: sum, pL: wsum ? pl / wsum : 0.5, hyps: [...hyps.values()].sort((a, b) => b.w - a.w), n: per.length };
    },
    regionsOf(sys, side) { const out = []; for (let i = 1; i < this.atlas.N; i++) if (this.atlas.system(i) === sys && this.atlas.hemiOf[i] === side) out.push(i); return out; },
    /** électrodes construites d'une exploration (sur le gabarit), pour relier plots et régions */
    builtElectrodes(ex) {
      if (this.ctx && this.ctx.explorationId === ex.id && this.elecs) return this.elecs;
      if (!this.vol) return [];
      // trajectoires du patient (sans cible sur le gabarit), électrodes réelles : construites comme dans la vue (v4.11)
      return (ex.electrodes || []).map(spec => { try { return this.buildElectrodeFor ? this.buildElectrodeFor(spec, 'template') : spec.target ? SV.Electrodes.build(spec, this.atlas, this.vol) : null; } catch (e) { return null; } }).filter(Boolean);
    },
    /** valeurs automatiques du tableau de concordance */
    concordanceAuto(m, scope, cons) {
      const d = this.dossier, A = {}, set = (row, col, v, note) => { (A[row] = A[row] || {})[col] = { v, note, auto: true }; };
      for (const sys of SYSTEMS) for (const side of ['L', 'R']) {
        const row = sys + ':' + side, regs = this.regionsOf(sys, side);
        // sémiologie : meilleur score consensuel d'origine dans le système
        let best = 0, br = 0; for (const r of regs) if (cons.region[r] > best) { best = cons.region[r]; br = r; }
        if (cons.n) set(row, 'semio', best >= 0.6 ? '++' : best >= 0.35 ? '+' : best >= 0.15 ? '0' : '', best >= 0.15 ? `${this.atlas.label(br)} : ${best.toFixed(2)} (consensus ${cons.n} crise${cons.n > 1 ? 's' : ''})` : '');
        // IRM : lésions déclarées
        const les = d.lesions.filter(l => (l.regions || []).some(r => regs.includes(r)));
        if (les.length) set(row, 'mri', les.some(l => l.confidence === 'high' || l.source === 'histology') ? '++' : '+', les.map(l => (l.label || V.lesionType[l.type]) + ' (' + V.lesionSource[l.source] + ')').join(' ; '));
      }
      // SEEG : stimulations et quantifications des explorations SEEG prises en compte
      for (const ex of scope.explorations.filter(e => e.kind === 'seeg')) {
        const els = this.builtElectrodes(ex); if (!els.length) continue;
        const regOfPair = (name, c1, c2) => { const e = SV.Seeg.findElec(els, name); if (!e) return []; return [c1, c2].map(k => e.contacts[k - 1] ? e.contacts[k - 1].label : 0).filter(l => l >= 1 && l <= 162); };
        const lvl = { none: 0, clin: 1, ad: 2, sz: 3 }, best = {};
        for (const s of ex.stims) {
          const L = s.sz ? (s.szHabitual ? 4 : 3) : s.ad ? 2 : s.clin ? (SV.Seeg.clinTypeOf(s) === 'subj' ? 2 : 1) : 0; if (!L) continue;
          for (const r of regOfPair(s.elec, s.c1, s.c2)) { const row = this.atlas.system(r) + ':' + this.atlas.hemiOf[r]; if (!best[row] || best[row].L < L) best[row] = { L, txt: `${s.elec}${s.c1}-${s.c2} ${s.mode === 'train' ? '50 Hz' : '1 Hz'} ${s.mA} mA : ${s.sz ? (s.szHabitual ? 'crise habituelle' : 'crise') : s.ad ? 'post-décharge' : 'réponse clinique' + (s.habitual ? ' habituelle' : '')}` }; }
        }
        for (const [row, b] of Object.entries(best)) set(row, 'seeg_stim', b.L >= 3 ? '++' : '+', b.txt);
        for (const q of ex.quant) {
          const vals = Object.entries(q.values || {}).map(([k, v]) => [k, +v]).filter(([, v]) => isFinite(v)); if (!vals.length) continue;
          const mx = Math.max(...vals.map(x => x[1])), mn = Math.min(0, ...vals.map(x => x[1])), rowBest = {};
          for (const [lab, v] of vals) { const p = SV.Seeg.parseLabel(lab); if (!p) continue; for (const r of regOfPair(p.elec, p.c1, p.c2 || p.c1)) { const row = this.atlas.system(r) + ':' + this.atlas.hemiOf[r]; const f = (v - mn) / Math.max(1e-9, mx - mn); if (!rowBest[row] || rowBest[row].f < f) rowBest[row] = { f, txt: `${q.name} ${lab} = ${(+v).toLocaleString(SV.LOC, { maximumFractionDigits: 3 })}` }; } }
          for (const [row, b] of Object.entries(rowBest)) { const prev = A[row] && A[row].seeg_q; if (prev && prev.f >= b.f) continue; set(row, 'seeg_q', b.f >= 0.66 ? '++' : b.f >= 0.33 ? '+' : '0', b.txt); A[row].seeg_q.f = b.f; }
        }
      }
      return A;
    },

    // ================================================================ écran
    renderStaff() {
      const d = this.dossier, box = $('scr-staff'); if (!d) return;
      const m = this.currentMeeting();
      if (!m) { box.innerHTML = `<div class="scr-inner"><div class="card"><div class="hint">Aucune réunion pour ${esc(d.patient.pseudo)} : « ＋ » dans la barre du parcours → Staff.</div></div></div>`; return; }
      this.ui.meetingId = m.id;
      const ms = d.meetings.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const scope = this.staffScope(m), cons = this.consensus(scope); this._cons = cons; this._scope = scope;
      box.innerHTML = `<div class="scr-inner wide staff">
        <div class="view-head"><h3>Préparer le staff</h3><span class="muted">tout se modifie ici, avant ou pendant la réunion ; « ▶ Présenter » (en haut à droite, F2) montre le dossier en plein écran ; « Compte rendu du staff » (barre du haut) produit le document</span><span class="spacer"></span>
          <button id="stText" title="Texte de synthèse à coller dans le dossier médical">Copier le texte</button><button id="stDel" class="danger" title="Supprimer ce staff">✕</button></div>
        <div class="st-review"><span class="muted">Revoir :</span> <button class="mini-btn" data-rv="dossier:histoire">histoire clinique</button><button class="mini-btn" data-rv="dossier:bilans">bilans${(d.exams || []).length ? ' (' + d.exams.length + ')' : ''}</button><button class="mini-btn" data-rv="dossier:imagerie">imagerie${d.imaging.length ? ' (' + d.imaging.length + ')' : ''}</button>${scope.explorations.map(ex => `<button class="mini-btn" data-rv="ex:${ex.id}:${ex.kind === 'seeg' ? 'crises' : 'synthese'}">${esc(ex.label)} · crises (${S.seizuresOfExploration(d, ex.id).length})</button>`).join('')}</div>
        <div class="card"><div class="form row4 stform"><label>Date <input type="date" data-f="date" value="${esc(m.date)}"></label><label>Type <select data-f="kind">${opts(V.meeting, m.kind)}</select></label>
          <label>Statut <select data-f="status">${opts({ draft: 'brouillon (en préparation)', final: 'validé' }, m.status)}</select></label></div><div class="st-ppl"><span class="lbl">Participants</span><span class="ppl-chips" id="stPpl"></span></div>
          <div class="form stform"><label>Question posée <input data-f="question" value="${esc(m.question || '')}" placeholder="ex. indication et schéma d’une SEEG ? résection temporale antérieure droite d’emblée ?"></label></div>
          <div class="scope"><span class="muted">Crises prises en compte :</span> ${S.explorationsSorted(d).map(ex => { const zs = S.seizuresOfExploration(d, ex.id).filter(z => z.events.length), on = scope.ids.includes(ex.id), off = new Set(m.scopeOff || []), n = zs.filter(z => !off.has(z.id)).length;
            return `<span class="scope-ex"><label class="chip"><input type="checkbox" data-scope="${ex.id}"${on ? ' checked' : ''}> ${esc(ex.label)} (${on && n < zs.length ? n + '/' : ''}${zs.length})</label>${on && zs.length ? `<span class="scope-sz">${zs.map(z => `<label class="chip sm${off.has(z.id) ? '' : ' on'}" title="${esc(z.label)}${z.datetime ? ' · ' + esc(String(z.datetime).replace('T', ' ')) : ''}${z.habitual === 'yes' ? ' · habituelle' : ''}"><input type="checkbox" data-scsz="${z.id}"${off.has(z.id) ? '' : ' checked'}> ${esc(z.label)}${z.habitual === 'yes' ? ' ●' : ''}</label>`).join('')}</span>` : ''}</span>`; }).join('')}</div></div>
        <div class="st-grid">
          <div class="st-col"><div class="card"><div class="card-h">Synthèse</div><div id="stSynth"></div></div></div>
          <div class="st-col wide"><div class="card"><div class="card-h">Concordance anatomo-électro-clinique <span class="muted">clic sur une case : valeur et note</span><span class="spacer"></span><label class="chip"><input type="checkbox" id="stAllRows"${this.ui.stAllRows ? ' checked' : ''}> toutes les régions</label><button class="mini-btn" id="stAddCol">+ colonne</button></div><div id="stConc"></div></div></div>
        </div>
        <div class="card"><div class="card-h">Hypothèses <span class="muted">zones épileptogènes discutées ; chaque révision crée une nouvelle version</span><span class="spacer"></span><button class="mini-btn" id="stHypModel">+ depuis le modèle</button><button class="mini-btn" id="stHypNew">+ hypothèse</button></div><div id="stHyps"></div></div>
        <div class="card"><div class="card-h">Captures à montrer <span class="muted">cochez les tracés de la galerie à présenter et à joindre au compte rendu</span></div><div id="stGal"></div></div>
        <div class="card"><div class="card-h">Conclusion du staff</div><textarea data-f="conclusion" rows="4" style="width:100%" placeholder="Synthèse et proposition (texte repris dans le compte rendu)">${esc(m.conclusion)}</textarea></div>
        <div class="card"><div class="card-h">Décisions <span class="spacer"></span><button class="mini-btn" id="stDecNew">+ décision</button></div><div id="stDecs"></div></div>
      </div>`;
      box.querySelectorAll('.stform [data-f], textarea[data-f]').forEach(el => { el[el.tagName === 'TEXTAREA' || el.type !== 'date' && el.tagName === 'INPUT' ? 'oninput' : 'onchange'] = () => { m[el.dataset.f] = el.value; this.touch('meeting', m.id, V.meeting[m.kind] + ' ' + m.date); if (['date', 'kind', 'status'].includes(el.dataset.f)) { this.renderParcours(); this.renderSubbar(); } }; });
      box.querySelectorAll('[data-rv]').forEach(b => b.onclick = () => { const [k, id, v] = b.dataset.rv.split(':'); this.go(k === 'dossier' ? { stage: 'dossier', view: id } : { stage: 'ex:' + id, view: v }); });
      $('stDel').onclick = () => { if (!confirm('Supprimer ce staff ? Ses hypothèses et décisions sont conservées, détachées du staff.')) return; S.remove(d, 'meeting', m.id); this.ui.meetingId = null; this.touch(); this.go({ stage: 'dossier' }); };
      if (this.renderGallery) this.renderGallery($('stGal'), { meeting: m });
      if ($('stPpl')) this.peopleChips($('stPpl'), m, () => this.touch('meeting', m.id, 'participants'));
      $('stText').onclick = () => { const t = this.meetingText(m); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => this.toast('Texte du staff copié'), () => { const w = window.open('', '_blank'); if (w) w.document.body.innerText = t; }); };
      box.querySelectorAll('[data-scsz]').forEach(c => c.onchange = () => { const off = new Set(m.scopeOff || []); if (c.checked) off.delete(c.dataset.scsz); else off.add(c.dataset.scsz); m.scopeOff = [...off]; this.touch('meeting', m.id, 'crises prises en compte'); this.renderStaff(); });
      box.querySelectorAll('[data-scope]').forEach(c => c.onchange = () => { m.scope = [...box.querySelectorAll('[data-scope]')].filter(x => x.checked).map(x => x.dataset.scope); this.touch('meeting', m.id); this.renderStaff(); });
      $('stAllRows').onchange = e => { this.ui.stAllRows = e.target.checked; this.renderConcordance(m); };
      $('stAddCol').onclick = () => { const l = prompt('Nouvelle modalité (ex. MEG, TEMP ictale, IRMf, SEEG : activité intercritique) :'); if (!l) return; const cols = this.meetingColumns(m); cols.push({ key: 'c_' + Date.now().toString(36), label: l.trim() }); m.concordance.columns = cols; this.touch('meeting', m.id); this.renderConcordance(m); };
      $('stHypNew').onclick = () => { const H = S.addHypothesis(d, { meetingId: m.id, title: 'Nouvelle hypothèse', side: cons.pL >= 0.5 ? 'L' : 'R', source: { kind: 'manual' } }); this.touch(); this.ui.openHyp = H.id; this.renderHypotheses(m); };
      $('stHypModel').onclick = e => this.modelHypothesisMenu(m, e.currentTarget);
      $('stDecNew').onclick = () => { S.addDecision(d, { meetingId: m.id, type: m.kind === 'post_phase1' ? 'seeg' : 'surgery', date: m.date, hypothesisIds: this.meetingHypotheses(m).filter(x => x.status !== 'refuted' && x.status !== 'abandoned').map(x => x.id) }); this.touch(); this.renderDecisions(m); };
      this.renderSynthesis(m); this.renderConcordance(m); this.renderHypotheses(m); this.renderDecisions(m);
    },

    // ---------------------------------------------------------------- synthèse
    renderSynthesis(m) {
      const d = this.dossier, P = d.patient, cons = this._cons, scope = this._scope, box = $('stSynth');
      const age = P.birthYear ? new Date(m.date || Date.now()).getFullYear() - (+P.birthYear) : null;
      const pt = [P.sex ? (P.sex === 'F' ? 'Patiente' : 'Patient') : 'Patient(e)', age != null ? age + ' ans' : '', P.handedness ? (P.sex === 'F' ? { R: 'droitière', L: 'gauchère', A: 'ambidextre' } : V.handedness)[P.handedness] : '', P.dominant ? 'dominance ' + V.dominance[P.dominant] + (P.dominanceMethod ? ' (' + V.dominanceMethod[P.dominanceMethod] + ')' : '') : '', S.onsetText(P) ? 'premières crises à ' + S.onsetText(P) : '', S.etiologyText(P) ? 'étiologie ' + S.etiologyText(P) : '', P.mri ? V.mri[P.mri] : '', P.frequency ? 'crises : ' + P.frequency + (P.frequencyDate ? ' (' + S.fmtPartial(P.frequencyDate) + ')' : '') : ''].filter(Boolean).join(', ');
      let html = `<div class="syn-p">${esc(pt)}${P.aeds ? '<br><span class="muted">Traitements : ' + esc(P.aeds) + '</span>' : ''}</div>`;
      for (const ex of scope.explorations) {
        const szs = S.seizuresOfExploration(d, ex.id), hab = szs.filter(z => z.habitual === 'yes').length;
        html += `<div class="syn-ex"><b>${esc(ex.label)}</b> <span class="muted">${fmtDate(ex.start)}${ex.end ? ' → ' + fmtDate(ex.end) : ''}${ex.center ? ' · ' + esc(ex.center) : ''}</span> · ${szs.length} crise${szs.length > 1 ? 's' : ''}${hab ? ` (${hab} habituelle${hab > 1 ? 's' : ''})` : ''}`;
        if (ex.kind === 'seeg') { const sz = ex.stims.filter(s => s.sz), szh = sz.filter(s => s.szHabitual); html += `<div class="small">${ex.electrodes.length} électrodes · ${ex.stims.length} stimulations${sz.length ? ` dont ${sz.length} crise${sz.length > 1 ? 's' : ''} déclenchée${sz.length > 1 ? 's' : ''}${szh.length ? ' (' + szh.length + ' habituelle' + (szh.length > 1 ? 's' : '') + ' : ' + [...new Set(szh.map(s => s.elec + s.c1 + '-' + s.c2))].join(', ') + ')' : ''}` : ''} · ${(() => { const n = ex.thermo.filter(t => S.thermoStatusOf(t) === 'done').length, v = ex.thermo.filter(t => S.thermoStatusOf(t) === 'validated').length, p = ex.thermo.filter(t => S.thermoStatusOf(t) === 'planned').length; return `${n} paire${n > 1 ? 's' : ''} thermocoagulée${n > 1 ? 's' : ''}${v ? ` (${v} validée${v > 1 ? 's' : ''})` : ''}${p ? ` (${p} planifiée${p > 1 ? 's' : ''})` : ''}`; })()}${ex.quant.length ? ' · quantification : ' + (() => { const c = new Map(); for (const q of ex.quant) { const k = String(q.name || '').split(' · ')[0].trim(); c.set(k, (c.get(k) || 0) + 1); } return [...c].map(([k, n]) => esc(k) + (n > 1 ? ' ×' + n : '')).join(', '); })() : ''}</div>`; }
        html += '</div>';
      }
      // v5 — ce qui est postérieur à la date du staff n'entre pas dans sa synthèse (un staff est une photographie à sa date)
      const at = (m && m.date) || '9999', before = x => !x || !x.date || String(x.date).slice(0, 10) <= at, exBefore = ex => !ex.start || String(ex.start).slice(0, 10) <= at || scope.explorations.includes(ex);
      const imps = S.implantations(d).filter(it => exBefore(it.ex)); if (imps.length) html += `<div class="syn-l"><b>Implantations</b> : ${imps.map(it => `${esc(it.ex.label)} — ${esc(V.implantStatus[it.status])} (${it.status === 'real' ? it.nReal + '/' + it.n : it.n} : <span class="mono">${esc(it.names.join(' '))}</span>)`).join(' ; ')}</div>`;
      if (d.lesions.length) html += `<div class="syn-l"><b>Lésions</b> : ${d.lesions.map(l => esc(l.label || V.lesionType[l.type]) + (l.regions.length ? ' (' + l.regions.slice(0, 4).map(r => esc(this.atlas.label(r))).join(', ') + (l.regions.length > 4 ? '…' : '') + ')' : '')).join(' ; ')}</div>`;
      const ims = d.imaging.filter(i => !i.derived && before(i)), later = d.imaging.filter(i => !i.derived && !before(i)).length;
      if (ims.length || later) html += `<div class="syn-l"><b>Imagerie</b> : ${ims.map(i => esc(V.modality[i.modality] || i.modality) + (i.date ? ' ' + fmtDate(i.date) : '')).join(', ') || '—'}${later ? ` <span class="muted small">(+ ${later} image${later > 1 ? 's' : ''} postérieure${later > 1 ? 's' : ''} au staff, non reprise${later > 1 ? 's' : ''})</span>` : ''}</div>`;
      if (cons.n) {
        const pL = Math.round(cons.pL * 100);
        html += `<div class="sub-h">Sémiologie : ${cons.n} crise${cons.n > 1 ? 's' : ''} (habituelles ×2)</div><div class="lat-bar"><span class="L" style="width:${pL}%">G ${pL} %</span><span class="R" style="width:${100 - pL}%">D ${100 - pL} %</span></div>`;
        const top = []; for (let i = 1; i < this.atlas.N; i++) if (cons.region[i] >= 0.2) top.push(i); top.sort((a, b) => cons.region[b] - cons.region[a]);
        html += `<div class="small muted" style="margin:6px 0 2px">Origines candidates (consensus)</div>` + top.slice(0, 6).map(i => this.regionRow(i, cons.region[i], '')).join('');
        html += `<div class="small muted" style="margin:8px 0 2px">Hypothèses récurrentes du modèle</div>` + cons.hyps.slice(0, 4).map(x => `<div class="row-line"><b>${esc(x.name)}</b> ${x.hemi === 'L' ? 'gauche' : 'droit'} <span class="muted">H1 dans ${x.top}/${cons.n} crise${cons.n > 1 ? 's' : ''}, présente dans ${x.n}</span></div>`).join('');
        html += this.signMatrix(cons);
      } else html += '<div class="hint" style="margin-top:8px">Aucune crise saisie dans les explorations prises en compte.</div>';
      box.innerHTML = html; this.bindRows(box);
    },
    /** matrice signes × crises : rang d'apparition et côté (comparaison des crises) */
    signMatrix(cons) {
      if (cons.per.length < 2) return '';
      const per = cons.per.slice(0, 12), rows = new Map();
      per.forEach(({ sz }, j) => { sz.events.slice().sort((a, b) => a.t - b.t).forEach((e, k) => { const r = rows.get(e.sign_id) || { id: e.sign_id, cells: [], rank: 0, n: 0 }; r.cells[j] = { k: k + 1, side: e.side, t: e.t }; r.rank += k; r.n++; rows.set(e.sign_id, r); }); });
      const list = [...rows.values()].sort((a, b) => b.n - a.n || a.rank / a.n - b.rank / b.n).slice(0, 18);
      return `<div class="small muted" style="margin:10px 0 3px">Comparaison des crises (rang · côté)</div><div class="smx-wrap"><table class="smx"><thead><tr><th></th>${per.map(({ sz, ex }) => `<th title="${esc(ex.label + ' · ' + sz.label)}" class="${sz.habitual === 'yes' ? 'hab' : ''}">${esc(sz.label.replace(/^Crise\s*/, 'C'))}</th>`).join('')}</tr></thead><tbody>${list.map(r => `<tr><td>${esc((this.db.signById.get(r.id) || {}).label_fr || r.id)}</td>${per.map((_, j) => { const c = r.cells[j]; return `<td>${c ? `<b>${c.k}</b>${c.side ? ' ' + { L: 'G', R: 'D', B: 'bil' }[c.side] : ''}` : ''}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`;
    },

    // ---------------------------------------------------------------- concordance
    meetingColumns(m) { const c = m.concordance.columns; if (c && c.length) return c; const seeg = this._scope && this._scope.explorations.some(e => e.kind === 'seeg'); return DEFAULT_COLS.filter(x => !x.seeg || seeg).map(x => Object.assign({}, x)); },
    renderConcordance(m) {
      const box = $('stConc'), cols = this.meetingColumns(m), auto = this.concordanceAuto(m, this._scope, this._cons), man = m.concordance.cells || (m.concordance.cells = {});
      const cell = (row, col) => (man[row] && man[row][col.key] && man[row][col.key].v !== undefined) ? Object.assign({ manual: true }, man[row][col.key]) : (auto[row] && auto[row][col.key]) || null;
      const hypRows = new Set(); for (const H of this.meetingHypotheses(m)) for (const r of H.ez.concat(H.prop)) hypRows.add(this.atlas.system(r) + ':' + this.atlas.hemiOf[r]);
      const rows = []; for (const sys of SYSTEMS) for (const side of ['L', 'R']) {
        const key = sys + ':' + side, cells = cols.map(c => cell(key, c)), score = cells.reduce((s, c) => s + (c ? LV_SCORE[c.v] || 0 : 0), 0);
        const any = cells.some(c => c && c.v && c.v !== '0') || hypRows.has(key);
        if (any || this.ui.stAllRows) rows.push({ key, sys, side, cells, score, hyp: hypRows.has(key) });
      }
      const maxS = Math.max(1, ...rows.map(r => r.score));
      box.innerHTML = rows.length ? `<table class="conc"><thead><tr><th>Système</th>${cols.map((c, i) => `<th title="${esc(c.hint || 'saisie')}">${esc(c.label)}${c.auto ? ' <i>auto</i>' : ''}${!DEFAULT_COLS.some(x => x.key === c.key) ? ` <b class="rmcol" data-i="${i}" title="retirer la colonne">✕</b>` : ''}</th>`).join('')}<th>Concordance</th></tr></thead><tbody>
        ${rows.map(r => `<tr class="${r.hyp ? 'hyp-row' : ''}"><td class="sys">${esc(SYS_FR[r.sys])} <b>${r.side === 'L' ? 'G' : 'D'}</b></td>${r.cells.map((c, i) => `<td class="cc lv${c && c.v ? ' v' + ({ '++': 'pp', '+': 'p', '0': 'z', '−': 'm', '?': 'q' }[c.v]) : ''}${c && c.manual ? ' man' : c ? ' aut' : ''}" data-row="${r.key}" data-col="${cols[i].key}" title="${esc((c && c.note ? c.note : '') + (c && c.from ? ' (repris du staff du ' + fmtDate(c.from) + ')' : ''))}">${c && c.v ? esc(c.v) : ''}${c && c.note && c.manual ? '<sup>✎</sup>' : ''}</td>`).join('')}<td class="score"><span class="bar"><i style="width:${Math.max(0, r.score) / maxS * 100}%"></i></span> ${r.score > 0 ? '+' + r.score : r.score}</td></tr>`).join('')}
        </tbody></table><div class="hint">++ argument fort · + en faveur · 0 neutre · − contre · ? douteux. Cases <i>auto</i> calculées à partir des données du dossier (survol : détail) ; un clic permet de les corriger. Lignes surlignées : régions des hypothèses du staff.</div>`
        : '<div class="hint">Rien à afficher : saisissez des crises, des lésions, ou cochez « toutes les régions » pour remplir le tableau à la main.</div>';
      box.querySelectorAll('td.cc').forEach(td => td.onclick = e => this.concordanceCellMenu(m, td.dataset.row, td.dataset.col, cols, auto, e));
      box.querySelectorAll('.rmcol').forEach(b => b.onclick = e => { e.stopPropagation(); const c = cols.slice(); c.splice(+b.dataset.i, 1); m.concordance.columns = c; this.touch('meeting', m.id); this.renderConcordance(m); });
    },
    concordanceCellMenu(m, row, col, cols, auto, e, after) {
      const redraw = after || (() => this.renderConcordance(m));
      m.concordance = m.concordance || { cells: {}, notes: '', columns: null }; const man = m.concordance.cells || (m.concordance.cells = {}), cur = (man[row] && man[row][col]) || null, a = auto[row] && auto[row][col], c = cols.find(x => x.key === col), [sys, side] = row.split(':');
      const panel = h('div', 'cell-panel conc-pop');
      panel.innerHTML = `<div class="ctx-head">${esc(SYS_FR[sys])} ${side === 'L' ? 'gauche' : 'droit'} · ${esc(c.label)}</div>${a ? `<div class="hint" style="margin:2px 0 6px">Auto : <b>${esc(a.v || '—')}</b> ${esc(a.note || '')}</div>` : ''}
        <div class="seg wrap">${LEVELS.map(([v, l]) => `<button data-v="${esc(v)}" class="${cur && cur.v === v ? 'on' : ''}" title="${esc(l)}">${v || '∅'}</button>`).join('')}</div>
        <input class="cnote" placeholder="note (ex. pointes T1-T3 G, hypométabolisme temporo-polaire)" value="${esc(cur && cur.note || '')}" style="width:100%;margin-top:6px">
        <div class="btnrow">${cur ? '<button class="ghost reset">revenir à l’automatique</button>' : ''}<button class="primary ok">OK</button></div>`;
      const put = v => { man[row] = man[row] || {}; man[row][col] = { v, note: panel.querySelector('.cnote').value.trim(), by: SV.Library.user, t: S.now() }; this.touch('meeting', m.id); };
      panel.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { put(b.dataset.v); this.closeMenu(); redraw(); });
      panel.querySelector('.ok').onclick = () => { if (cur || panel.querySelector('.cnote').value.trim()) put(cur ? cur.v : (a ? a.v : '')); this.closeMenu(); redraw(); };
      const rs = panel.querySelector('.reset'); if (rs) rs.onclick = () => { delete man[row][col]; this.touch('meeting', m.id); this.closeMenu(); redraw(); };
      this.popupMenu([{ node: panel }], e.clientX, e.clientY); setTimeout(() => panel.querySelector('.cnote').focus(), 30);
    },

    // ---------------------------------------------------------------- hypothèses
    /** hypothèses du staff : celles créées dans ce staff + les hypothèses encore ouvertes des staffs précédents */
    meetingHypotheses(m) {
      const d = this.dossier, latest = S.latestHypotheses(d);
      return latest.filter(H => H.meetingId === m.id || ((!H.meetingId || String((S.byId(d.meetings, H.meetingId) || {}).date || '') <= String(m.date)) && !['refuted', 'abandoned'].includes(H.status)));
    },
    modelHypothesisMenu(m, anchor) {
      const cons = this._cons, d = this.dossier; if (!cons.n) { this.toast('Aucune crise saisie dans les explorations prises en compte'); return; }
      const items = [{ head: 'Hypothèses du modèle (consensus des crises)' }];
      for (const x of cons.hyps.slice(0, 8)) items.push({ label: `${x.name} ${x.hemi === 'L' ? 'G' : 'D'} · H1 dans ${x.top}/${cons.n}, présente dans ${x.n}`, run: () => {
        const H = x.H, ez = H.members.filter(mm => mm.origin).map(mm => mm.region), prop = H.members.filter(mm => !mm.origin).map(mm => mm.region).slice(0, 8);
        const nm = H.name.charAt(0).toUpperCase() + H.name.slice(1) + (H.hemi === 'L' ? ' gauche' : ' droit');
        const args = []; if (x.top) args.push({ text: `H1 du modèle dans ${x.top} crise(s) sur ${cons.n}`, ref: { kind: 'model' } }); if (H.explained.length) args.push({ text: 'explique : ' + H.explained.map(e => e.sign.label_fr).join(', '), ref: { kind: 'seizure', id: x.sz.id } });
        const against = H.unexplained.length ? [{ text: 'n’explique pas : ' + H.unexplained.map(s => s.label_fr).join(', '), ref: { kind: 'seizure', id: x.sz.id } }] : [];
        const nh = S.addHypothesis(d, { meetingId: m.id, title: nm, side: H.hemi, ez: ez.length ? ez : [H.origin], prop, confidence: x.top >= Math.ceil(cons.n / 2) ? 'medium' : 'low', argsFor: args, argsAgainst: against, source: { kind: 'model', name: H.name, seizureId: x.sz.id, nSeizures: cons.n, nTop: x.top } });
        this.touch(); this.ui.openHyp = nh.id; this.renderHypotheses(m); this.renderConcordance(m);
      } });
      const r = anchor.getBoundingClientRect(); this.popupMenu(items, Math.min(r.left, window.innerWidth - 460), r.bottom + 4);
    },
    renderHypotheses(m) {
      const d = this.dossier, box = $('stHyps'), list = this.meetingHypotheses(m); box.innerHTML = '';
      if (!list.length) box.innerHTML = '<div class="hint">Aucune hypothèse. « + depuis le modèle » reprend les trajectoires que la sémiologie de toutes les crises suggère ; « + hypothèse » pour une hypothèse posée par l’équipe.</div>';
      list.forEach((H, idx) => {
        const lin = d.hypotheses.filter(x => x.lineage === H.lineage).sort((a, b) => a.version - b.version), open = this.ui.openHyp === H.id;
        const from = S.byId(d.meetings, H.meetingId), fromOther = H.meetingId !== m.id;
        const c = h('div', 'hypc' + (open ? ' open' : '') + ' st-' + H.status); c.style.setProperty('--hue', SV.hypCss ? SV.hypCss(idx) : '#4ea8ff');
        c.innerHTML = `<div class="hypc-h"><b class="hn">H${idx + 1}</b><input class="inline title" data-f="title" value="${esc(H.title)}"><span class="badge">v${H.version}</span><span class="badge st">${esc(V.hypStatus[H.status])}</span><span class="badge">${esc(V.confidenceText[H.confidence] || '')}</span>${fromOther ? `<span class="badge warn" title="hypothèse issue d’un staff antérieur">staff du ${fmtDate(from && from.date)}</span>` : ''}<span class="spacer"></span>
            ${fromOther ? '<button class="mini-btn primary" data-a="revise">réviser dans ce staff</button>' : '<button class="mini-btn" data-a="revise" title="nouvelle version (la précédente reste dans l’historique)">nouvelle version</button>'}<button class="mini-btn" data-a="toggle">${open ? 'replier' : 'détails'}</button></div>
          <div class="hypc-sum"><span class="lbl">ZE</span> ${H.ez.map(r => `<span class="rchip ez">${esc(this.atlas.label(r))}</span>`).join('') || '<i class="muted">à préciser</i>'} ${H.prop.length ? `<span class="lbl">propagation</span> ${H.prop.slice(0, 6).map(r => `<span class="rchip">${esc(this.atlas.label(r))}</span>`).join('')}${H.prop.length > 6 ? '…' : ''}` : ''}</div>
          <div class="hypc-body"></div>`;
        if (open) {
          const b = c.querySelector('.hypc-body');
          b.innerHTML = `<div class="form row4"><label>Côté <select data-f="side">${opts({ '': '—', L: 'gauche', R: 'droit', B: 'bilatéral' }, H.side)}</select></label><label>Statut <select data-f="status">${opts(V.hypStatus, H.status)}</select></label><label>Confiance <select data-f="confidence">${opts(V.confidence, H.confidence)}</select></label><label>Source <input disabled value="${esc(H.source && H.source.kind === 'model' ? 'modèle (' + (H.source.nTop || 0) + '/' + (H.source.nSeizures || 0) + ' crises)' : 'équipe')}"></label></div>
            <div class="hyp-regs"><div><span class="lbl">Zone épileptogène</span><div class="rp-ez"></div></div><div><span class="lbl">Propagation, réseau</span><div class="rp-prop"></div></div></div>
            <div class="hyp-args"><div><span class="lbl">Arguments pour</span><div class="a-for"></div><button class="mini-btn" data-add="argsFor">+ argument</button></div><div><span class="lbl">Arguments contre</span><div class="a-against"></div><button class="mini-btn" data-add="argsAgainst">+ argument</button></div></div>
            <label>Notes <textarea data-f="notes" rows="2" style="width:100%">${esc(H.notes)}</textarea></label>
            ${lin.length > 1 ? `<div class="hyp-hist"><span class="lbl">Historique</span> ${lin.map(x => `<span class="hv${x.id === H.id ? ' cur' : ''}" title="${esc(x.title)} · ZE : ${esc(x.ez.map(r => this.atlas.label(r)).join(', '))}">v${x.version} ${esc(V.hypStatus[x.status])} · ${fmtDate((S.byId(d.meetings, x.meetingId) || {}).date || x.created)}</span>`).join(' → ')}${this.hypDiff(lin[lin.length - 2], H)}</div>` : ''}
            <div class="btnrow"><button class="mini-btn" data-a="shots">vues 3D</button><button class="mini-btn danger" data-a="del">supprimer cette version</button></div><div class="hyp-shots"></div>`;
          b.querySelector('.rp-ez').appendChild(this.regionPicker(H.ez, () => { this.touch('hypothesis', H.id, H.title); this.renderConcordance(m); this.renderHypSummary(c, H); }));
          b.querySelector('.rp-prop').appendChild(this.regionPicker(H.prop, () => { this.touch('hypothesis', H.id, H.title); this.renderConcordance(m); this.renderHypSummary(c, H); }));
          for (const [k, cls] of [['argsFor', 'a-for'], ['argsAgainst', 'a-against']]) {
            const wrap = b.querySelector('.' + cls);
            wrap.innerHTML = H[k].map((a, i) => `<div class="arg"><input value="${esc(a.text)}" data-i="${i}">${a.ref && a.ref.kind === 'seizure' && S.byId(d.seizures, a.ref.id) ? `<button class="mini-btn" data-open="${a.ref.id}" title="ouvrir la crise">${esc(S.byId(d.seizures, a.ref.id).label)}</button>` : ''}<b data-rm="${i}">✕</b></div>`).join('');
            wrap.querySelectorAll('input').forEach(inp => inp.oninput = () => { H[k][+inp.dataset.i].text = inp.value; this.touch('hypothesis', H.id, H.title); });
            wrap.querySelectorAll('[data-rm]').forEach(x => x.onclick = () => { H[k].splice(+x.dataset.rm, 1); this.touch('hypothesis', H.id, H.title); this.renderHypotheses(m); });
            wrap.querySelectorAll('[data-open]').forEach(x => x.onclick = () => this.openSeizure(x.dataset.open));
          }
          b.querySelectorAll('[data-add]').forEach(x => x.onclick = () => { H[x.dataset.add].push({ text: '', ref: null }); this.touch('hypothesis', H.id, H.title); this.renderHypotheses(m); const ins = $('stHyps').querySelectorAll(`.hypc.open .${x.dataset.add === 'argsFor' ? 'a-for' : 'a-against'} input`); if (ins.length) ins[ins.length - 1].focus(); });
          b.querySelector('[data-a=shots]').onclick = async () => { const imgs = await this.hypothesisShots(H, idx); b.querySelector('.hyp-shots').innerHTML = imgs.map(u => `<img src="${u}">`).join(''); };
          b.querySelector('[data-a=del]').onclick = () => { if (!confirm(`Supprimer la version ${H.version} de « ${H.title} » ?`)) return; const prev = H.supersedes && S.byId(d.hypotheses, H.supersedes); if (prev && prev.status === 'revised') prev.status = 'proposed'; S.remove(d, 'hypothesis', H.id); this.touch(); this.renderHypotheses(m); this.renderConcordance(m); };
        }
        c.querySelectorAll('[data-f]').forEach(el => { el[el.tagName === 'SELECT' ? 'onchange' : 'oninput'] = () => { H[el.dataset.f] = el.value; this.touch('hypothesis', H.id, H.title); if (el.tagName === 'SELECT') this.renderHypotheses(m); }; });
        c.querySelector('[data-a=toggle]').onclick = () => { this.ui.openHyp = open ? null : H.id; this.renderHypotheses(m); };
        c.querySelector('[data-a=revise]').onclick = () => { const nv = S.addHypothesis(d, { supersedes: H.id, meetingId: m.id, status: 'proposed' }); this.touch(); this.ui.openHyp = nv.id; this.renderHypotheses(m); this.toast(`« ${nv.title} » : version ${nv.version} (la version ${H.version} reste dans l’historique)`, 3500); };
        box.appendChild(c);
      });
    },
    renderHypSummary(c, H) { const s = c.querySelector('.hypc-sum'); if (!s) return; s.innerHTML = `<span class="lbl">ZE</span> ${H.ez.map(r => `<span class="rchip ez">${esc(this.atlas.label(r))}</span>`).join('') || '<i class="muted">à préciser</i>'} ${H.prop.length ? `<span class="lbl">propagation</span> ${H.prop.slice(0, 6).map(r => `<span class="rchip">${esc(this.atlas.label(r))}</span>`).join('')}` : ''}`; },
    /** différence entre deux versions (régions ajoutées / retirées) */
    hypDiff(a, b) {
      if (!a || !b) return ''; const L = r => esc(this.atlas.label(r));
      const add = b.ez.filter(r => !a.ez.includes(r)), rem = a.ez.filter(r => !b.ez.includes(r));
      const parts = []; if (add.length) parts.push('ZE + ' + add.map(L).join(', ')); if (rem.length) parts.push('ZE − ' + rem.map(L).join(', ')); if (a.title !== b.title) parts.push(`« ${esc(a.title)} » → « ${esc(b.title)} »`);
      return parts.length ? `<div class="small muted">depuis v${a.version} : ${parts.join(' · ')}</div>` : '';
    },
    /** carte d'une hypothèse sur le cerveau (ZE = 1, propagation = 0,5), faces latérale et médiale de son côté */
    hypothesisShots(H, idx, opt) { return this.viewerTask(() => this._hypothesisShots(H, idx, opt)); },
    /** vues d'une hypothèse du staff : son réseau (nœuds sur la ZE et la propagation, faisceaux selon la connectivité du modèle)
     *  sur le cortex en verre coloré par l'hypothèse, faces latérale et médiale de son côté ; sans les ROI annotées */
    async _hypothesisShots(H, idx, opt) {
      const V3 = this.viewer;
      const restore = { layout: V3.layoutName, active: V3.active, linked: V3.linked, cfgs: V3.cells.map(c => Object.assign({}, c.cfg, { hyps: c.cfg.hyps.slice() })), act: V3.activation, hyps: V3.hypActs, hl: V3.highlight };
      const imgs = [];
      try {
        V3.setLinked(false); V3.setLayout('single');
        const sc = this.sceneStaffHyp(V3, H, idx);
        for (const [v] of sc.views) { V3.setView(v, false); await new Promise(r => setTimeout(r, 160)); imgs.push(V3.snapshot({ format: 'jpeg', quality: 0.88, scale: (opt && opt.scale) || 1.5, crop: true, orient: !!(opt && opt.orient) })); }
      } finally {
        this.sceneClear(V3);
        V3.setLayout(restore.layout); restore.cfgs.forEach((cfg, i) => V3.setCellConfig(i, cfg, true)); V3.setActive(restore.active); V3.setLinked(restore.linked);
        V3.setActivations(restore.act, restore.hyps, restore.hl); this.setTime(this.ui.t);
      }
      return imgs;
    },

    // ---------------------------------------------------------------- décisions
    renderDecisions(m) {
      const d = this.dossier, box = $('stDecs'), list = d.decisions.filter(x => x.meetingId === m.id); box.innerHTML = '';
      if (!list.length) box.innerHTML = '<div class="hint">Aucune décision. « + décision » : SEEG, deuxième SEEG, thermocoagulation, chirurgie, imagerie complémentaire, pas de chirurgie…</div>';
      const hyps = this.meetingHypotheses(m);
      for (const x of list) {
        const c = h('div', 'subcard dec'), ex = x.createdExplorationId && S.byId(d.explorations, x.createdExplorationId), pr = x.procedureId && S.byId(d.procedures, x.procedureId);
        c.innerHTML = `<div class="form row4"><label>Décision <select data-f="type">${opts(V.decision, x.type)}</select></label><label>Statut <select data-f="status">${opts(V.decisionStatus, x.status)}</select></label><label>Date <input type="date" data-f="date" value="${esc(x.date)}"></label><label>&nbsp;<span class="dec-acts"></span></label></div>
          <label>Détail <input data-f="text" value="${esc(x.text)}" placeholder="ex. SEEG droite, 11 électrodes, couvrir opercule et insula postérieure"></label>
          <div class="dec-h"><span class="lbl">Hypothèses testées / retenues</span> ${hyps.map((H, i) => `<label class="chip"><input type="checkbox" data-h="${H.id}"${x.hypothesisIds.includes(H.id) ? ' checked' : ''}> H${i + 1} ${esc(H.title)}</label>`).join('') || '<i class="muted">—</i>'}</div>
          ${['surgery', 'litt'].includes(x.type) ? '<div class="surg-slot"></div>' : '<div><span class="lbl">Cibles</span><div class="rp"></div></div>'}
          <div class="btnrow">${ex ? `<span class="badge ok">${esc(ex.label)} créée</span><span class="muted small">${ex.electrodes.length} électrode${ex.electrodes.length > 1 ? 's' : ''}${ex.implant && ex.implant.source && ex.implant.source.label ? ' · ' + (ex.implant.source.kind === 'import' ? 'repris de ' : '') + esc(ex.implant.source.label) : ''}</span><button class="mini-btn" data-a="openex">ouvrir</button><button class="mini-btn" data-a="replan" title="changer le schéma de cette SEEG (reprendre un autre schéma, compléter, proposer)">schéma…</button>` : ''}${pr ? `<span class="badge ok">${esc(V.procedure[pr.type])} ${esc(pr.date)}</span>` : ''}<span class="spacer"></span><button class="mini-btn danger" data-a="del">supprimer</button></div>`;
        const acts = c.querySelector('.dec-acts');
        if ((x.type === 'seeg' || x.type === 'seeg2') && !ex) { const b = h('button', 'mini-btn primary', 'Créer l’exploration SEEG'); b.onclick = () => this.decisionToExploration(m, x); acts.appendChild(b); }
        if (['surgery', 'litt', 'neuromod', 'rftc'].includes(x.type) && !pr) { const b = h('button', 'mini-btn primary', 'Programmer la procédure'); b.onclick = () => this.decisionToProcedure(m, x); acts.appendChild(b); }
        const dh = () => d.hypotheses.filter(H => x.hypothesisIds.includes(H.id));
        if (c.querySelector('.surg-slot') && this.surgeryEditor) c.querySelector('.surg-slot').appendChild(this.surgeryEditor(x, dh(), () => this.touch('decision', x.id, V.decision[x.type])));
        else c.querySelector('.rp').appendChild(this.regionPicker(x.targets, () => this.touch('decision', x.id, V.decision[x.type])));
        c.querySelectorAll('[data-f]').forEach(el => { el[el.tagName === 'SELECT' || el.type === 'date' ? 'onchange' : 'oninput'] = () => { x[el.dataset.f] = el.value; this.touch('decision', x.id, V.decision[x.type]); if (el.dataset.f === 'type') this.renderDecisions(m); }; });
        c.querySelectorAll('[data-h]').forEach(cb => cb.onchange = () => { x.hypothesisIds = [...c.querySelectorAll('[data-h]')].filter(y => y.checked).map(y => y.dataset.h); if (!x.targets.length && !['surgery', 'litt'].includes(x.type)) { for (const H of hyps.filter(H => x.hypothesisIds.includes(H.id))) for (const r of H.ez) if (!x.targets.includes(r)) x.targets.push(r); } this.touch('decision', x.id); this.renderDecisions(m); });
        const oe = c.querySelector('[data-a=openex]'); if (oe) oe.onclick = () => this.openExploration(ex.id);
        const rp = c.querySelector('[data-a=replan]'); if (rp) rp.onclick = () => { if (ex.electrodes.some(e => e.real) && !confirm(`${ex.label} a des électrodes localisées sur le scanner : changer quand même le schéma ?`)) return; this.implantChooser({ toEx: ex, hyps: d.hypotheses.filter(H => x.hypothesisIds.includes(H.id)), seizures: this.staffScope(m).seizures, source: { meetingId: m.id, decisionId: x.id }, onDone: () => { this.renderDecisions(m); this.renderSynthesis(m); } }); };
        c.querySelector('[data-a=del]').onclick = () => { if (confirm('Supprimer cette décision ?')) { S.remove(d, 'decision', x.id); this.touch(); this.renderDecisions(m); } };
        box.appendChild(c);
      }
    },
    /** décision SEEG → nouvelle exploration programmée ; son schéma reprend un schéma existant (proposé en phase 1,
     *  SEEG précédente), éventuellement complété pour les hypothèses retenues, ou est proposé à partir d'elles */
    decisionToExploration(m, x) {
      const d = this.dossier, hyps = d.hypotheses.filter(H => x.hypothesisIds.includes(H.id)), ex = this.decisionCreateExploration(x);
      this.renderDecisions(m); this.updateCrumbs();
      if (this.implantChooser) this.implantChooser({ toEx: ex, hyps, seizures: this.staffScope(m).seizures, title: `${ex.label} : schéma d’implantation (décision du staff du ${fmtDate(m.date)})`, source: { meetingId: m.id, decisionId: x.id }, onDone: () => { this.renderDecisions(m); this.renderSynthesis(m); } });
    },
    /** exploration SEEG programmée, liée à la décision ; les hypothèses proposées passent « en test » */
    decisionCreateExploration(x) {
      const d = this.dossier, ex = S.addExploration(d, { kind: 'seeg', status: 'planned', start: '', entryHypothesisIds: x.hypothesisIds.slice() }); ex.start = '';
      S.addSession(d, ex.id, { date: '' });
      x.createdExplorationId = ex.id; x.status = 'planned';
      for (const H of d.hypotheses.filter(H => x.hypothesisIds.includes(H.id))) if (H.status === 'proposed') H.status = 'testing';
      this.touch(); return ex;
    },
    decisionToProcedure(m, x) {
      const d = this.dossier, map = { surgery: 'resection', litt: 'litt', neuromod: 'neuromod', rftc: 'rftc' };
      const side = x.targets.length ? this.atlas.hemiOf[x.targets[0]] : '';
      const T = x.template && SV.Surgery && SV.Surgery.TEMPLATES[x.template];
      const p = S.addProcedure(d, { type: T ? T.type : map[x.type] || 'other', date: '', side: x.side || side, regions: x.targets.slice(), extent: Object.assign({}, x.extent || {}), template: x.template || '', target: x.text, decisionId: x.id });
      x.procedureId = p.id; x.status = 'planned'; this.touch(); this.renderDecisions(m); this.toast('Procédure ajoutée au dossier (date à compléter)', 3000);
    },

    // ---------------------------------------------------------------- textes et compte rendu
    meetingText(m) {
      const d = this.dossier, P = d.patient, L = r => this.atlas.label(r), hyps = this.meetingHypotheses(m), dec = d.decisions.filter(x => x.meetingId === m.id), scope = this.staffScope(m), cons = this.consensus(scope);
      const lines = [`${V.meeting[m.kind].toUpperCase()} — ${P.pseudo} — ${fmtDate(m.date)}`, m.participants ? 'Participants : ' + m.participants : '', m.question ? 'Question posée : ' + m.question : ''];
      for (const ex of scope.explorations) { const szs = S.seizuresOfExploration(d, ex.id); lines.push(`${ex.label} (${fmtDate(ex.start)}${ex.end ? ' → ' + fmtDate(ex.end) : ''}) : ${szs.length} crise(s), ${szs.filter(z => z.habitual === 'yes').length} habituelle(s)${ex.kind === 'seeg' ? `, ${ex.electrodes.length} électrodes, ${ex.stims.length} stimulations, ${ex.thermo.length} paires thermocoagulées` : ''}.`); }
      for (const { sz, ex } of scope.seizures.slice(0, 10)) lines.push(`  ${ex.label} · ${sz.label}${sz.habitual === 'yes' ? ' (habituelle)' : ''} : ${sz.events.slice().sort((a, b) => a.t - b.t).map(e => (this.db.signById.get(e.sign_id) || {}).label_fr + (e.side ? ' ' + { L: 'G', R: 'D', B: 'bil' }[e.side] : '')).join(' → ')}`);
      if (cons.n) lines.push(`Latéralisation clinique : G ${Math.round(cons.pL * 100)} % / D ${100 - Math.round(cons.pL * 100)} %.`);
      if (d.lesions.length) lines.push('Lésions : ' + d.lesions.map(l => (l.label || V.lesionType[l.type]) + (l.regions.length ? ' (' + l.regions.map(L).join(', ') + ')' : '')).join(' ; '));
      const conc = this.concordanceAuto(m, scope, cons), man = m.concordance.cells || {};
      const rows = []; for (const sys of SYSTEMS) for (const side of ['L', 'R']) { const k = sys + ':' + side, cols = this.meetingColumns(m).map(c => [c, (man[k] && man[k][c.key]) || (conc[k] && conc[k][c.key])]).filter(([, v]) => v && v.v && v.v !== '0'); if (cols.length) rows.push(`  ${SYS_FR[sys]} ${side === 'L' ? 'G' : 'D'} : ` + cols.map(([c, v]) => `${c.label} ${v.v}${v.note && v.note.length < 80 ? ' (' + v.note + ')' : ''}`).join(' ; ')); }
      if (rows.length) lines.push('Concordance :', ...rows);
      hyps.forEach((H, i) => lines.push(`H${i + 1} ${H.title} (v${H.version}, ${V.hypStatus[H.status]}, ${V.confidenceText[H.confidence] || ''}) — ZE : ${H.ez.map(L).join(', ') || '?'}${H.prop.length ? ' ; propagation : ' + H.prop.map(L).join(', ') : ''}${H.argsFor.filter(a => a.text).length ? ' ; pour : ' + H.argsFor.filter(a => a.text).map(a => a.text).join(' ; ') : ''}${H.argsAgainst.filter(a => a.text).length ? ' ; contre : ' + H.argsAgainst.filter(a => a.text).map(a => a.text).join(' ; ') : ''}`));
      dec.forEach(x => lines.push(`Décision : ${V.decision[x.type]}${x.text ? ' — ' + x.text : ''}${x.targets.length ? ' (cibles : ' + x.targets.map(L).join(', ') + ')' : ''} [${V.decisionStatus[x.status]}]`));
      if (m.conclusion) lines.push('Conclusion : ' + m.conclusion);
      return lines.filter(Boolean).join('\n');
    },
  };
  Object.assign(SV.app, M);
  SV.Staff = { SYSTEMS, SYS_FR, LV_SCORE, DEFAULT_COLS };
})(window.SV = window.SV || {});
