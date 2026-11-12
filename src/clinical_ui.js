/* EpiScope — clinical_ui.js : histoire clinique et bilans du dossier (Dossier › Histoire clinique, Dossier › Bilans).
 *   Les rubriques suivent ce que l'on présente en RCP de chirurgie de l'épilepsie : antécédents (oui / non, précision),
 *   histoire de l'épilepsie (début, types de crises, manifestations subjectives et objectives, contact, post-critique,
 *   horaire, facteurs déclenchants, généralisations, fréquence, plus longue période sans crise), traitements (actuels,
 *   historique daté, intolérances), examen neurologique, comorbidités ; bilans datés (EEG, IRM, TEP, TEMP, MEG, IRMf,
 *   Wada, neuropsychologie par domaines…), rattachables à une étape.                                               */
(function (SV) {
  'use strict';
  const $ = id => document.getElementById(id), S = SV.Store, V = S.V;
  const esc = SV.U.esc;
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const opts = (map, v) => Object.entries(map).map(([k, l]) => `<option value="${esc(k)}"${String(v) === k ? ' selected' : ''}>${esc(l)}</option>`).join('');
  const fmtDate = s => { if (!s) return ''; const d = new Date(String(s).length <= 10 ? s + 'T12:00:00' : s); return isNaN(d) ? String(s) : d.toLocaleDateString(SV.LOC); };
  const ONSET_MODE = { '': '—', single: 'crise isolée', status: 'état de mal', stormy: 'début explosif (crises très fréquentes)', progressive: 'progressif', other: 'autre' };
  const CONTACT = { '': '—', no: 'non', yes: 'oui', partial: 'partielle' };
  const TIMING = { '': '—', wake: 'veille', sleep: 'sommeil', both: 'veille et sommeil', catamenial: 'cataméniale' };
  /** « 2019 », « 05/2019 », « 12/05/2019 » (ou ISO) → « 2019 », « 2019-05 », « 2019-05-12 » */
  const parsePartial = t => { t = String(t || '').trim(); let m; if (!t) return ''; if ((m = t.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/))) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; if ((m = t.match(/^(\d{1,2})[\/.\-](\d{4})$/))) return `${m[2]}-${m[1].padStart(2, '0')}`; if ((m = t.match(/^(\d{4})(-\d{2})?(-\d{2})?$/))) return t; return t; };

  /** zones de texte extensibles (v4.19) : au clic, la zone s'allonge à son contenu (pas d'ascenseur, rien de caché en bas) ;
   *  au repos, un liseré signale qu'il reste du texte sous la dernière ligne visible */
  function growFit(ta) { ta.style.height = 'auto'; ta.style.height = Math.max(ta.scrollHeight + 2, ta._h0 || 0) + 'px'; }
  function growRest(ta) { ta.style.height = ''; requestAnimationFrame(() => ta.classList.toggle('more', ta.scrollHeight > ta.clientHeight + 2)); }
  function growAll(root) {
    root.querySelectorAll('textarea.grow').forEach(ta => {
      if (ta._grow) return; ta._grow = true;
      ta.addEventListener('focus', () => { ta._h0 = ta.clientHeight; ta.classList.remove('more'); growFit(ta); });
      ta.addEventListener('input', () => { if (document.activeElement === ta) growFit(ta); });
      ta.addEventListener('blur', () => growRest(ta));
      growRest(ta);
    });
  }
  const IMG_KINDS = ['mri', 'pet', 'spect', 'meg', 'fmri', 'other'];   // bilans qui peuvent être liés à des images du dossier
  const M = {
    // ================================================================ histoire clinique (v4.19 : trois onglets du Dossier)
    /** ancien onglet « Histoire clinique » : redirigé vers « Antécédents et contexte » */
    renderHistoryView(box) { return this.renderAntecedentsView(box); },
    _hxPrep() { const d = this.dossier, P = d.patient, C = P.clin || (P.clin = S.newClin()); if (!C.examHistory || !Array.isArray(P.etiologies)) S.migrateClin(P); return { d, P, C }; },
    /** champs liés au patient (data-p) et à l'histoire (data-c), zones de texte extensibles */
    _hxBind(box, P, C) {
      box.querySelectorAll('[data-p]').forEach(el => { el[el.tagName === 'SELECT' ? 'onchange' : 'oninput'] = () => { P[el.dataset.p] = el.type === 'number' ? (el.value === '' ? '' : +el.value) : el.value; this.touch('patient', null, el.dataset.p); if (el.dataset.p === 'dominant') { $('dominant').value = P.dominant === 'R' ? 'R' : 'L'; this.state.patient.dominant = $('dominant').value; this.changed(); } if (['handedness', 'onsetAge'].includes(el.dataset.p)) this.renderSubbar(); }; });
      box.querySelectorAll('[data-c]').forEach(el => { el[el.tagName === 'SELECT' ? 'onchange' : 'oninput'] = () => { C[el.dataset.c] = el.type === 'number' ? (el.value === '' ? '' : +el.value) : el.value; this.touch('patient', null, 'histoire'); }; });
      growAll(box);
    },
    /** listes datées (fréquence des crises, examen, comorbidités) : date partielle « 2019 », « 05/2019 », « 12/05/2019 » */
    _hxDated(box, C) {
      const sync = () => S.syncPatient(this.dossier.patient);
      const drawDated = key => {
        const t = box.querySelector(`table[data-h="${key}"]`); if (!t) return; const L = (C[key] || []).slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));   // v5.1 : la plus récente en haut
        const ph = { freqHistory: 'ex. 4 crises / mois, dont 1 avec chute', examHistory: 'ex. normal ; puis syndrome pyramidal droit', comorbHistory: 'ex. syndrome dépressif traité', devEvals: 'ex. Brunet-Lézine : QD global 72 ; marche seule non acquise' }[key];
        t.innerHTML = L.length ? `<tbody>${L.map(x => `<tr data-id="${x.id}"><td class="dt"><input data-f="date" value="${esc(S.fmtPartial(x.date))}" placeholder="aaaa ou mm/aaaa" title="année seule, mois/année ou date complète"></td><td><textarea class="grow" rows="1" data-f="text" placeholder="${esc(ph)}">${esc(x.text)}</textarea></td><td><b class="x" data-rm="${x.id}">✕</b></td></tr>`).join('')}</tbody>` : `<tr><td class="hint">${key === 'freqHistory' ? 'Fréquence au début, sous traitement, actuelle… (datée).' : key === 'devEvals' ? 'Évaluations du développement datées (échelle, quotient, niveau actuel).' : 'Aucune entrée.'}</td></tr>`;
        t.querySelectorAll('tr[data-id]').forEach(tr => { const x = C[key].find(y => y.id === tr.dataset.id); tr.querySelectorAll('[data-f]').forEach(el => { el.oninput = () => { if (el.dataset.f === 'text') x.text = el.value; sync(); this.touch('patient', null, 'histoire'); }; if (el.dataset.f === 'date') el.onchange = () => { x.date = parsePartial(el.value); el.value = S.fmtPartial(x.date); sync(); this.touch('patient', null, 'histoire'); }; }); });
        t.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { C[key] = C[key].filter(y => y.id !== b.dataset.rm); sync(); this.touch('patient', null, 'histoire'); drawDated(key); });
      };
      box.querySelectorAll('[data-addh]').forEach(b => b.onclick = () => { const k = b.dataset.addh; (C[k] = C[k] || []).push({ id: S.uid('H'), date: String(new Date().getFullYear()), text: '' }); this.touch('patient', null, 'histoire'); drawDated(k); const ins = box.querySelectorAll(`table[data-h="${k}"] [data-f=text]`); if (ins.length) ins[0].focus(); });
      box.querySelectorAll('table[data-h]').forEach(t => drawDated(t.dataset.h));
    },
    /** Antécédents et contexte : antécédents (oui / non, précision), antécédents notables, mode de vie, comorbidités, arbre généalogique */
    renderAntecedentsView(box) {
      const { d, P, C } = this._hxPrep(), B = C.birth || {};
      const birthSum = k => { const G = SV.Growth, t = []; if (k === 'pregnancy') { if (B.infection && B.infection.v === 'yes') t.push('infection materno-fœtale'); if (B.obstetric && B.obstetric.v === 'yes') t.push('complication obstétricale'); } else { if (B.gaWeeks) t.push(`né(e) à ${B.gaWeeks}${B.gaDays ? '+' + B.gaDays : ''} SA`); if (B.weight) t.push(`${B.weight} g`); if (B.neonatal && B.neonatal.v === 'yes') t.push('complication néonatale'); } return t.join(', '); };
      box.innerHTML = `<div class="scr-inner wide"><div class="view-head"><h3>Antécédents et contexte</h3><span class="muted">repris dans la présentation du staff et le compte rendu de RCP</span></div>
        <div class="hx-grid">
          <div class="hx-col">
            <div class="card"><div class="card-h">Antécédents <span class="spacer"></span><button class="mini-btn" id="hxAllNo" title="répondre « non » à toutes les lignes encore sans réponse">non partout</button></div><table class="ant">${V.antecedents.map(([k, l]) => { const a = C.antecedents[k] || (C.antecedents[k] = { v: '', text: '' }), lk = k === 'pregnancy' || k === 'perinatal', sm = lk ? birthSum(k) : ''; return `<tr data-k="${k}"><td>${esc(l)}${lk ? ` <a href="#" class="hx-dev" title="détails : Développement et examen clinique › Grossesse et naissance">détails →</a>` : ''}</td><td><span class="seg yn">${[['no', 'non'], ['yes', 'oui'], ['', '?']].map(([v, t]) => `<button data-v="${v}" class="${a.v === v ? 'on ' + (v || 'u') : ''}">${t}</button>`).join('')}</span></td><td><input class="inline" data-t value="${esc(a.text)}" placeholder="${lk && sm ? esc(sm) : 'précision'}"></td></tr>`; }).join('')}</table>
              <div class="form" style="margin-top:8px"><label>Antécédents médico-chirurgicaux notables <textarea class="grow" data-c="antecedentsText" rows="6" placeholder="maladies, interventions, hospitalisations… (une ligne par élément ; « - » en début de ligne pour une liste)">${esc(C.antecedentsText)}</textarea></label></div></div>
          </div>
          <div class="hx-col">
            <div class="card"><div class="card-h">Mode de vie, contexte</div><div class="form"><textarea class="grow" data-c="lifestyle" rows="6" placeholder="scolarité, profession, situation familiale, permis de conduire, activités, aides…">${esc(C.lifestyle)}</textarea></div></div>
            <div class="card"><div class="card-h"><span>Comorbidités significatives pour le bilan de l’épilepsie</span><span class="spacer"></span><button class="mini-btn" data-addh="comorbHistory">+ ligne</button></div><div class="card-sub">Comorbidité psychiatrique ou somatique (ex. hémophilie, schizophrénie…) ; datée, la plus récente en haut (année seule acceptée)</div><table class="aed dated" data-h="comorbHistory"></table></div>
          </div>
        </div>
        <div class="card hx-wide"><div class="card-h">Arbre généalogique</div><div id="pedBox"></div></div></div>`;
      this._hxBind(box, P, C); this._hxDated(box, C);
      const yn = tr => { const a = C.antecedents[tr.dataset.k]; tr.querySelectorAll('[data-v]').forEach(x => x.className = x.dataset.v === a.v ? 'on ' + (a.v || 'u') : ''); };
      box.querySelectorAll('table.ant tr[data-k]').forEach(tr => {
        const a = C.antecedents[tr.dataset.k];
        tr.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { a.v = b.dataset.v; yn(tr); this.touch('patient', null, 'antécédents'); });
        tr.querySelector('[data-t]').oninput = e => { a.text = e.target.value; if (a.text && !a.v) { a.v = 'yes'; yn(tr); } this.touch('patient', null, 'antécédents'); };
        const lk = tr.querySelector('.hx-dev'); if (lk) lk.onclick = e => { e.preventDefault(); this.ui.devFocus = 'birth'; this.go({ stage: 'dossier', view: 'developpement' }); };
      });
      $('hxAllNo').onclick = () => { for (const [k] of V.antecedents) { const a = C.antecedents[k]; if (!a.v) a.v = 'no'; } box.querySelectorAll('table.ant tr[data-k]').forEach(yn); this.touch('patient', null, 'antécédents'); };
      this.renderPedigree($('pedBox'));
    },
    /** Histoire de la maladie : histoire de l'épilepsie, fréquence datée, traitements (actuel daté, historique, intolérances) */
    renderDiseaseView(box) {
      const { d, P, C } = this._hxPrep();
      box.innerHTML = `<div class="scr-inner wide"><div class="view-head"><h3>Histoire de la maladie</h3><span class="muted">histoire de l’épilepsie et traitements</span></div>
        <div class="hx-grid">
          <div class="hx-col">
            <div class="card"><div class="card-h">Histoire de l’épilepsie</div><div class="form grid2">
              <label>Premières crises à l’âge de <span class="inrow"><input type="number" min="0" max="120" step="any" data-p="onsetAge" value="${esc(P.onsetAge)}"><select data-p="onsetAgeUnit">${opts({ y: 'ans', m: 'mois', d: 'jours' }, P.onsetAgeUnit || 'y')}</select></span></label><label>Mode de début <select data-c="onsetMode">${opts(ONSET_MODE, C.onsetMode)}</select></label>
              <div class="span2 eti"><span class="lbl">Étiologie <small class="muted">clic : confirmée → suspectée → non retenue ; plusieurs possibles</small></span><div class="eti-chips"></div><input data-p="etiologyDetail" value="${esc(P.etiologyDetail || '')}" placeholder="précisions (ex. DCF de type II suspectée, variant DEPDC5 en cours d’analyse)"></div>
              <label>IRM <select data-p="mri">${opts(V.mri, P.mri)}</select></label><span></span>
              <label class="span2">Type(s) de crises <textarea class="grow" data-c="seizureTypes" rows="3" placeholder="si plusieurs types ou une évolution : dans l’ordre chronologique">${esc(C.seizureTypes)}</textarea></label>
              <label class="span2">Manifestations subjectives <textarea class="grow" data-c="subjective" rows="3" placeholder="aura constante ? qualité, localisation ; le patient prévient-il ?">${esc(C.subjective)}</textarea></label>
              <label class="span2">Manifestations objectives <textarea class="grow" data-c="objective" rows="3" placeholder="chronologie précise des signes">${esc(C.objective)}</textarea></label>
              <label>Perte de contact <select data-c="contact">${opts(CONTACT, C.contact)}</select></label><label>Durée <input data-c="duration" value="${esc(C.duration)}" placeholder="ex. 1–2 min"></label>
              <label class="span2">Post-critique <input data-c="postictal" value="${esc(C.postictal)}" placeholder="aphasie (expression / compréhension, durée), désorientation, déficit, amputation du champ visuel…"></label>
              <label>Horaire <select data-c="timing">${opts(TIMING, C.timing)}</select></label><label>Facteurs déclenchants <input data-c="triggers" value="${esc(C.triggers)}" placeholder="privation de sommeil, émotions…"></label>
              <label class="span2">Généralisations tonico-cloniques <input data-c="fbtcs" value="${esc(C.fbtcs)}" placeholder="non / oui, fréquence"></label>
              <div class="span2"><div class="sub-h">Fréquence des crises <small class="muted">au fil de la maladie ; la plus récente est la fréquence actuelle</small><span class="spacer"></span><button class="mini-btn" data-addh="freqHistory">+ ligne</button></div><table class="aed dated" data-h="freqHistory"></table></div>
              <label class="span2">Plus longue période sans crise <input data-c="longestFree" value="${esc(C.longestFree)}" placeholder="durée, sous quel traitement ou spontanée"></label>
              <label class="span2">Histoire, en texte libre <textarea class="grow" data-p="history" rows="6" placeholder="premières crises, diagnostic, évolution, pharmacorésistance, explorations antérieures…">${esc(P.history)}</textarea></label></div></div>
          </div>
          <div class="hx-col">
            <div class="card"><div class="card-h">Traitements</div>
              <div class="form"><label>Traitement actuel <span class="muted small" id="hxAedSince">${P.aedsSince ? 'depuis ' + esc(S.fmtPartial(P.aedsSince)) : ''}</span><textarea class="grow" data-p="aeds" rows="3" placeholder="molécules et doses (corriger ici ; « changer de traitement » garde l’ancien dans l’historique)">${esc(P.aeds)}</textarea></label>
                <div class="inrow"><label>Depuis <input data-since value="${esc(S.fmtPartial(P.aedsSince || ''))}" placeholder="mm/aaaa" title="date de début du traitement actuel (année, mois/année ou date)"></label><span class="spacer"></span><button class="mini-btn primary" id="hxAedChange" title="nouveau traitement actuel ; l’actuel passe dans l’historique (avec ses dates)">changer de traitement…</button></div></div>
              <div class="sub-h">Historique <span class="spacer"></span><button class="mini-btn" id="hxAedAdd">+ ligne</button></div><table class="aed" id="hxAed"></table>
              <div class="form"><label>Intolérances, effets indésirables <textarea class="grow" data-c="intolerances" rows="2">${esc(C.intolerances)}</textarea></label></div></div>
          </div>
        </div></div>`;
      this._hxBind(box, P, C); this._hxDated(box, C);
      const sync = () => S.syncPatient(P);
      const eti = () => {
        const w = box.querySelector('.eti-chips'), E = P.etiologies;
        w.innerHTML = Object.entries(V.etiology).filter(([k]) => k).map(([k, l]) => { const e = E.find(x => x.k === k); return `<button class="eti-chip ${e ? e.status : ''}" data-k="${k}" title="${e ? V.etiologyStatus[e.status] : 'non retenue'}">${esc(l)}${e && e.status === 'suspected' ? ' ?' : ''}</button>`; }).join('');
        w.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { const i = E.findIndex(x => x.k === b.dataset.k); if (i < 0) E.push({ k: b.dataset.k, status: 'confirmed' }); else if (E[i].status === 'confirmed') E[i].status = 'suspected'; else E.splice(i, 1); sync(); this.touch('patient', null, 'étiologie'); eti(); });
      };
      eti();
      const since = box.querySelector('[data-since]'); since.onchange = () => { P.aedsSince = parsePartial(since.value); since.value = S.fmtPartial(P.aedsSince); $('hxAedSince').textContent = P.aedsSince ? 'depuis ' + S.fmtPartial(P.aedsSince) : ''; this.touch('patient', null, 'traitement actuel'); };
      const drawAed = () => {
        const t = $('hxAed'), L = (d.aedHistory || []).slice().sort((x, y) => String(x.date).localeCompare(String(y.date)));
        t.innerHTML = L.length ? `<thead><tr><th>début</th><th>fin</th><th>traitement</th><th>effet</th><th></th></tr></thead><tbody>${L.map(a => `<tr data-id="${a.id}"><td class="dt"><input data-f="date" value="${esc(S.fmtPartial(a.date || ''))}" placeholder="mm/aaaa"></td><td class="dt"><input data-f="end" value="${esc(S.fmtPartial(a.end || ''))}" placeholder="mm/aaaa"></td><td><input data-f="text" value="${esc(a.text)}" placeholder="ex. LEV 2000 mg/j + CBZ 1600 mg/j"></td><td><input data-f="effect" value="${esc(a.effect)}" placeholder="efficacité, arrêt, intolérance"></td><td><b class="x" data-rm="${a.id}">✕</b></td></tr>`).join('')}</tbody>` : '<tr><td class="hint">Molécules essayées, avec leur effet (surtout au début de l’histoire). « changer de traitement » y range l’actuel.</td></tr>';
        t.querySelectorAll('tr[data-id]').forEach(tr => { const a = S.byId(d.aedHistory, tr.dataset.id); tr.querySelectorAll('[data-f]').forEach(el => { el.oninput = () => { if (el.dataset.f === 'text' || el.dataset.f === 'effect') { a[el.dataset.f] = el.value; this.touch('patient', null, 'traitements'); } }; if (el.dataset.f === 'date' || el.dataset.f === 'end') el.onchange = () => { a[el.dataset.f] = parsePartial(el.value); el.value = S.fmtPartial(a[el.dataset.f]); this.touch('patient', null, 'traitements'); }; }); });
        t.querySelectorAll('[data-rm]').forEach(x => x.onclick = () => { S.remove(d, 'aed', x.dataset.rm); this.touch(); drawAed(); });
      };
      $('hxAedAdd').onclick = () => { S.addAed(d, { date: S.today().slice(0, 7) }); this.touch(); drawAed(); };
      $('hxAedChange').onclick = () => this.changeAed(() => this.renderDiseaseView(box));
      drawAed();
    },
    /** nouveau traitement actuel (date de début, éventuellement passée) ; l'actuel passe dans l'historique, de sa date de début
     *  à la veille du nouveau */
    changeAed(after) {
      const d = this.dossier, P = d.patient, panel = h('div', 'cell-panel aed-pop');
      panel.innerHTML = `<div class="ctx-head">Nouveau traitement actuel</div><div class="form">
        ${P.aeds ? `<div class="hint">Le traitement actuel (« ${esc(P.aeds.slice(0, 80))}${P.aeds.length > 80 ? '…' : ''} »${P.aedsSince ? ', depuis ' + esc(S.fmtPartial(P.aedsSince)) : ''}) passera dans l’historique.</div>` : ''}
        <label>Traitement <textarea class="grow" rows="3" data-k="text" placeholder="molécules et doses">${esc(P.aeds || '')}</textarea></label>
        <label>Début <input data-k="since" value="${esc(S.fmtPartial(S.today()))}" placeholder="jj/mm/aaaa, mm/aaaa ou aaaa" title="peut être antérieure à aujourd’hui"></label>
        ${P.aeds ? `<label>Effet du traitement précédent <input data-k="effect" placeholder="inefficace, intolérance, arrêt…"></label>` : ''}</div>
        <div class="btnrow"><button class="mini-btn" data-a="cancel">annuler</button><span class="spacer"></span><button class="mini-btn primary" data-a="ok">enregistrer</button></div>`;
      const close = () => this.closeMenu();
      panel.querySelector('[data-a=cancel]').onclick = close;
      panel.querySelector('[data-a=ok]').onclick = () => {
        const text = panel.querySelector('[data-k=text]').value.trim(), since = parsePartial(panel.querySelector('[data-k=since]').value) || S.today(), ef = panel.querySelector('[data-k=effect]');
        if (!text) { this.toast('Traitement vide'); return; }
        if (P.aeds && P.aeds.trim() && P.aeds.trim() !== text) S.addAed(d, { date: P.aedsSince || '', end: since, text: P.aeds.trim(), effect: ef ? ef.value.trim() : '' });
        P.aeds = text; P.aedsSince = since; S.syncPatient && S.syncPatient(P); this.touch('patient', null, 'traitement actuel'); close(); if (after) after();
      };
      const r = document.activeElement && document.activeElement.getBoundingClientRect ? document.activeElement.getBoundingClientRect() : { left: 200, bottom: 200 };
      this.popupMenu([{ node: panel }], Math.min(r.left, window.innerWidth - 420), Math.min(r.bottom + 4, window.innerHeight - 360));
      setTimeout(() => { const t = panel.querySelector('[data-k=text]'); if (t) { t.focus(); t.select(); } }, 30);
    },

    // ---------------------------------------------------------------- arbre généalogique (dessin direct : clic près d'une personne, liens à la souris)
    renderPedigree(host) {
      const P = this.dossier.patient, PD = SV.Pedigree, ped = P.clin.pedigree = PD.migrate(P.clin.pedigree); if (!host) return;
      if (this._pedUndoFor !== this.dossier.id) { this._pedUndo = []; this._pedUndoFor = this.dossier.id; }
      const cons = PD.consanguinities(ped);
      host.innerHTML = `<div class="ped-bar"><span class="ped-help">Cliquer près d’une personne : <b>au-dessus</b> = parent, <b>en dessous</b> = enfant, <b>à côté</b> = même génération. <b>Glisser</b> d’une personne à une autre : lien. Cliquer un symbole ou un trait : le modifier.</span><span class="spacer"></span>
        <button class="mini-btn" data-a="undo" title="annuler la dernière modification (Ctrl+Z)"${this._pedUndo.length ? '' : ' disabled'}>↶ Annuler</button><button class="mini-btn" data-a="tidy" title="replacer les personnes : enfants sous leurs parents, sans chevauchement">Réorganiser</button></div>
        <div class="ped-wrap" tabindex="0">${PD.svg(ped, P, { edit: true })}</div>
        <div class="ped-foot"><span class="ped-leg"><i class="sq"></i> homme <i class="ci"></i> femme <i class="di"></i> non précisé · <i class="sq full"></i> atteint <i class="sq half"></i> porteur <i class="sq hat"></i> possible · <b>3</b> groupe · ⟋ décédé · ═ union consanguine</span>${cons.length ? `<span class="ped-cons">${cons.map(c => `${esc(this.pedName(ped, c.a))} et ${esc(this.pedName(ped, c.b))} : ${c.rel ? esc(c.rel.label) + ' (F = ' + c.rel.F + ')' : 'consanguinité déclarée'}`).join(' · ')}</span>` : ''}</div>
        <textarea class="ped-notes grow" rows="1" placeholder="remarques sur la famille (origine, analyses génétiques familiales…)">${esc(ped.notes || '')}</textarea>`;
      host.querySelector('.ped-notes').oninput = e => { ped.notes = e.target.value; this.touch('patient', null, 'arbre généalogique'); };
      host.querySelector('[data-a=undo]').onclick = () => this.pedUndo(host);
      host.querySelector('[data-a=tidy]').onclick = () => this.pedMutate(host, d => PD.Ed.tidy(d));
      this.pedigreeBind(host);
    },
    pedName(ped, id) { const q = SV.Pedigree.byId(ped, id); return !q ? '' : q.id === 'proband' ? (this.dossier.patient.pseudo || 'cas index') : (q.label || SV.Pedigree.kinship(ped, q)); },
    /** modification de l'arbre avec point d'annulation ; fn(ped) peut renvoyer { err } (rien n'est changé) */
    pedMutate(host, fn) {
      const ped = this.dossier.patient.clin.pedigree, before = JSON.stringify(ped), r = fn(ped);
      if (r && r.err) { Object.assign(ped, JSON.parse(before)); this.toast(r.err, 2600); return r; }
      this._pedUndo.push(before); if (this._pedUndo.length > 40) this._pedUndo.shift();
      this.touch('patient', null, 'arbre généalogique'); this.renderPedigree(host); return r || {};
    },
    pedUndo(host) {
      const s = this._pedUndo && this._pedUndo.pop(); if (!s) return; const ped = this.dossier.patient.clin.pedigree;
      for (const k of Object.keys(ped)) delete ped[k]; Object.assign(ped, JSON.parse(s)); this.closeMenu();
      this.touch('patient', null, 'arbre généalogique'); this.renderPedigree(host); const w = host.querySelector('.ped-wrap'); if (w) w.focus({ preventScroll: true });
    },
    /** interactions : aperçu au survol près d'une personne, ajout au clic, glisser = lien (Maj + glisser = déplacer), clic sur un trait */
    pedigreeBind(host) {
      const PD = SV.Pedigree, P = this.dossier.patient, ped = P.clin.pedigree, svg = host.querySelector('svg.ped-svg'), wrap = host.querySelector('.ped-wrap'); if (!svg) return;
      const Lt = PD.layout(ped, P, true), NS = 'http://www.w3.org/2000/svg', R0 = PD.SZ / 2 + 7, NEAR = 76;
      const el = (t, a) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
      const layer = el('g', { class: 'ped-prev' }); svg.appendChild(layer);
      const pt = e => { const m = svg.getScreenCTM(), q = svg.createSVGPoint(); q.x = e.clientX; q.y = e.clientY; const r = q.matrixTransform(m.inverse()); return { x: r.x, y: r.y }; };
      const nodeAt = (q, r) => { let b = null, bd = 1e9; for (const n of Lt.nodes) { const d = Math.hypot(n.cx - q.x, n.cy - q.y); if (d < bd) { bd = d; b = n; } } return b && bd <= r ? b : null; };
      const zoneOf = (n, q) => { const dx = q.x - n.cx, dy = q.y - n.cy; return Math.abs(dy) > Math.abs(dx) * 0.9 ? (dy < 0 ? 'up' : 'down') : dx < 0 ? 'left' : 'right'; };
      const ZL = { up: 'parent', down: 'enfant', left: 'même génération', right: 'même génération' };
      const clear = () => { layer.innerHTML = ''; svg.querySelectorAll('.ped-n.target').forEach(g => g.classList.remove('target')); };
      let hover = null, drag = null;
      const preview = (n, z) => {
        clear(); const pl = PD.Ed.placement(ped, n.p.id, z); hover = { id: n.p.id, z, pl };
        const gx = Lt.T.x(pl.x), gy = Lt.T.y(pl.gen), s = PD.SZ / 2, bad = !!pl.err;
        const ax = z === 'left' ? n.cx - s : z === 'right' ? n.cx + s : n.cx, ay = z === 'up' ? n.cy - s : z === 'down' ? n.cy + s + 30 : n.cy;   // en dessous : sous le nom et la note
        const bx = z === 'left' ? gx + s : z === 'right' ? gx - s : gx, by = z === 'up' ? gy + s : z === 'down' ? gy - s : gy;
        layer.appendChild(el('line', { x1: ax, y1: ay, x2: bx, y2: by, class: 'ped-pl' + (bad ? ' bad' : '') }));
        if (!bad) layer.appendChild(el('polygon', { points: `${gx},${gy - s - 2} ${gx + s + 2},${gy} ${gx},${gy + s + 2} ${gx - s - 2},${gy}`, class: 'ped-pg' }));
        const t = el('text', { x: bad ? n.cx : gx, y: bad ? n.cy - s - 10 : z === 'down' ? gy + s + 16 : gy - s - 9, 'text-anchor': 'middle', class: 'ped-pt' + (bad ? ' bad' : '') }); t.textContent = bad ? pl.err : '+ ' + ZL[z]; layer.appendChild(t);
        svg.style.cursor = bad ? 'not-allowed' : 'copy';
      };
      svg.addEventListener('pointermove', e => {
        const q = pt(e);
        if (drag) {
          if (!drag.moved && Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy) < 6) return; drag.moved = true; clear();
          if (drag.shift) { layer.appendChild(el('line', { x1: q.x, y1: drag.n.cy - 22, x2: q.x, y2: drag.n.cy + 22, class: 'ped-pl' })); return; }
          layer.appendChild(el('line', { x1: drag.n.cx, y1: drag.n.cy, x2: q.x, y2: q.y, class: 'ped-pl link' }));
          const to = nodeAt(q, R0 + 4); if (to && to !== drag.n) { const g = svg.querySelector(`.ped-n[data-id="${CSS.escape(to.p.id)}"]`); if (g) g.classList.add('target'); }
          return;
        }
        if (nodeAt(q, R0)) { clear(); hover = null; svg.style.cursor = 'pointer'; return; }
        if (e.target.closest && e.target.closest('.ped-hit')) { clear(); hover = null; svg.style.cursor = 'pointer'; return; }
        const n = nodeAt(q, NEAR); if (!n) { clear(); hover = null; svg.style.cursor = ''; return; }
        const z = zoneOf(n, q); if (!hover || hover.id !== n.p.id || hover.z !== z) preview(n, z);
      });
      svg.addEventListener('pointerleave', () => { if (!drag) { clear(); hover = null; } });
      svg.addEventListener('pointerdown', e => {
        if (e.button) return; const n = nodeAt(pt(e), R0); if (!n) return;
        drag = { n, cx: e.clientX, cy: e.clientY, moved: false, shift: e.shiftKey }; svg.setPointerCapture(e.pointerId); e.preventDefault(); wrap.focus({ preventScroll: true });
      });
      svg.addEventListener('pointerup', e => {
        const q = pt(e);
        if (drag) {
          const d = drag; drag = null; try { svg.releasePointerCapture(e.pointerId); } catch (x) { } clear();
          if (!d.moved) { this.pedigreePersonMenu(PD.byId(ped, d.n.p.id), e.clientX + 12, e.clientY - 20, host); return; }
          if (d.shift) { const id = d.n.p.id, nx = Math.round(Lt.T.mx(q.x)); this.pedMutate(host, x => PD.Ed.move(x, PD.byId(x, id), nx)); return; }
          const to = nodeAt(q, R0 + 4); if (!to || to === d.n) return;
          const a = d.n.p.id, b = to.p.id;
          if (d.n.p.gen === to.p.gen) this.pedigreeLinkChoice(a, b, e.clientX, e.clientY, host);
          else this.pedMutate(host, x => PD.Ed.connect(x, a, b));
          return;
        }
        // traits sous le pointeur (le milieu d'une union porte aussi la descente vers les enfants) : tous leurs liens
        const ids = [...new Set(document.elementsFromPoint(e.clientX, e.clientY).filter(x => x.classList && x.classList.contains('ped-hit')).flatMap(x => x.dataset.links.split(' ').filter(Boolean)))];
        if (ids.length) { this.pedigreeLinkMenu(ids, e.clientX, e.clientY, host); return; }
        if (hover && !hover.pl.err) { const h0 = hover; hover = null; const r = this.pedMutate(host, x => PD.Ed.addNear(x, h0.id, h0.z));
          if (r && r.p) { const g = host.querySelector(`.ped-n[data-id="${CSS.escape(r.p.id)}"]`), b = g && g.getBoundingClientRect(); this.pedigreePersonMenu(PD.byId(ped, r.p.id), b ? b.right + 10 : e.clientX, b ? b.top - 10 : e.clientY, host, r); } }
      });
      wrap.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); e.stopPropagation(); this.pedUndo(host); }
        else if (e.key === 'Escape' && drag) { drag = null; clear(); }
      });
    },
    /** lien tracé entre deux personnes de la même génération : union ou fratrie */
    pedigreeLinkChoice(a, b, x, y, host) {
      const ped = this.dossier.patient.clin.pedigree, PD = SV.Pedigree;
      this.popupMenu([{ head: `${this.pedName(ped, a)} — ${this.pedName(ped, b)}` },
        { label: 'Union (conjoints)', run: () => this.pedMutate(host, d => PD.Ed.connect(d, a, b, 'union')) },
        { label: 'Fratrie (frère, sœur)', run: () => this.pedMutate(host, d => PD.Ed.connect(d, a, b, 'sibling')) }], x, y);
    },
    /** lignes de lien (menu d'une personne ou d'un trait) : description et actions */
    pedLinkRows(ped, ids, host, me, reopen) {
      const PD = SV.Pedigree, L = ids.map(id => ped.links.find(l => l.id === id)).filter(Boolean), nm = id => this.pedName(ped, id);
      const rows = L.map(l => {
        let txt, acts = '';
        if (l.type === 'union') { const r = PD.relatedness(ped, l.a, l.b); txt = me ? `Conjoint(e) de ${nm(l.a === me ? l.b : l.a)}` : `Union : ${nm(l.a)} et ${nm(l.b)}`;
          if (r) txt += ` — apparentés : ${r.label}, F = ${r.F}`;
          acts = `<label class="chip" title="cocher si les conjoints sont apparentés sans que leurs ancêtres communs soient dessinés"><input type="checkbox" data-lc="${l.id}"${l.consang ? ' checked' : ''}> consanguinité déclarée</label><button class="mini-btn" data-lt="${l.id}" data-to="sibling">→ fratrie</button>`; }
        else if (l.type === 'sibling') { txt = me ? `Frère / sœur de ${nm(l.a === me ? l.b : l.a)}` : `Fratrie : ${nm(l.a)} et ${nm(l.b)}`; acts = `<button class="mini-btn" data-lt="${l.id}" data-to="union">→ union</button>`; }
        else txt = me ? (l.b === me ? `Enfant de ${nm(l.a)}` : `Parent de ${nm(l.b)}`) : `Filiation : ${nm(l.a)} → ${nm(l.b)}`;
        return `<div class="ped-lrow"><span>${esc(txt)}</span><span class="spacer"></span>${acts}<button class="mini-btn danger" data-ld="${l.id}" title="supprimer ce lien">✕</button></div>`;
      }).join('');
      const bind = root => {
        const find = id => ped.links.find(l => l.id === id);
        root.querySelectorAll('[data-lc]').forEach(c => c.onchange = () => { const id = c.dataset.lc; this.pedMutate(host, d => { const l = d.links.find(k => k.id === id); if (l) l.consang = c.checked; }); reopen(); });
        root.querySelectorAll('[data-lt]').forEach(b => b.onclick = () => { const id = b.dataset.lt, to = b.dataset.to; this.pedMutate(host, d => { const l = d.links.find(k => k.id === id); if (l) to === 'union' ? PD.Ed.sibToUnion(d, l) : PD.Ed.unionToSib(d, l); }); reopen(); });
        root.querySelectorAll('[data-ld]').forEach(b => b.onclick = () => { const id = b.dataset.ld; this.pedMutate(host, d => { const l = d.links.find(k => k.id === id); if (l) PD.Ed.removeLink(d, l); }); reopen(); });
        return find;
      };
      return { html: rows, bind, n: L.length };
    },
    /** clic sur un trait : les liens qu'il représente */
    pedigreeLinkMenu(ids, x, y, host) {
      const ped = this.dossier.patient.clin.pedigree, panel = h('div', 'cell-panel ped-pop');
      const R = this.pedLinkRows(ped, ids, host, null, () => { this.closeMenu(); const left = ids.filter(id => ped.links.some(l => l.id === id)); if (left.length) this.pedigreeLinkMenu(left, x, y, host); });
      if (!R.n) return;
      panel.innerHTML = `<div class="ctx-head">Liens</div>${R.html}<div class="hint">Union ↔ fratrie : corrige un lien mal choisi ; les parents repris d’un frère ou d’une sœur ajouté(e) à côté sont retirés quand il ou elle devient conjoint(e).</div>`;
      R.bind(panel); this.popupMenu([{ node: panel }], Math.min(x, window.innerWidth - 440), Math.min(y, window.innerHeight - 260));
    },
    /** menu d'une personne : description, puis ses liens ; r = résultat d'un ajout (lien « à côté » : frère/sœur ↔ conjoint) */
    pedigreePersonMenu(p, x, y, host, added) {
      if (!p) return;
      const ped = this.dossier.patient.clin.pedigree, PD = SV.Pedigree, E = PD.Ed, proband = p.id === 'proband', panel = h('div', 'cell-panel ped-pop'), kin = PD.kinship(ped, p);
      const reopen = () => { this.closeMenu(); const q = PD.byId(ped, p.id); if (q) this.pedigreePersonMenu(q, x, y, host); };
      const R = this.pedLinkRows(ped, PD.linksOf(ped, p.id).map(l => l.id), host, p.id, reopen);
      const side = added && added.kind === 'side' ? PD.findLink(ped, 'sibling', added.from, p.id) : null;
      panel.innerHTML = `<div class="ctx-head">${esc(proband ? 'Cas index — ' + (this.dossier.patient.pseudo || '') : (p.label ? p.label + ' · ' : '') + kin)}</div>
        ${side ? `<div class="seg ped-rel"><button class="on" data-rel="sibling">frère / sœur de ${esc(this.pedName(ped, added.from))}</button><button data-rel="union">conjoint(e) de ${esc(this.pedName(ped, added.from))}</button></div>` : ''}
        ${proband ? '<div class="hint">Sexe et statut du cas index : ceux du patient (synthèse du dossier).</div>' : `<div class="form">
        <div class="seg" data-g="sex">${[['M', '□ homme'], ['F', '○ femme'], ['U', '◇ non précisé']].map(([v, l]) => `<button data-v="${v}" class="${p.sex === v ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="seg wrap" data-g="status">${Object.entries(V.pedStatus).map(([v, l]) => `<button data-v="${v}" class="${(p.status || 'none') === v ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="grid2"><label>Nombre <input type="number" min="1" max="30" data-k="count" value="${p.count || 1}" title="plus de 1 : un seul symbole avec le nombre (ex. 3 cousins)"></label><label class="chip"><input type="checkbox" data-k="deceased"${p.deceased ? ' checked' : ''}> décédé(e)</label></div>
        <label>Identité <input data-k="label" value="${esc(p.label)}" placeholder="ex. Paul, 45 ans (sinon : ${esc(kin)})"></label>
        <label>Précisions médicales <textarea class="grow" data-k="notes" rows="2" placeholder="épilepsie (type, âge de début), convulsions fébriles, variant génétique…">${esc(p.notes)}</textarea></label></div>`}
        ${R.n ? `<div class="ped-links"><div class="muted small">Liens</div>${R.html}</div>` : ''}
        <div class="btnrow">${proband ? '' : '<button class="mini-btn danger" data-a="del">retirer cette personne</button>'}<span class="spacer"></span><button class="mini-btn primary" data-a="ok">OK</button></div>`;
      let snap = false; const touchP = () => { if (!snap) { this._pedUndo.push(JSON.stringify(ped)); snap = true; } if (p.ghost) p.ghost = false; this.touch('patient', null, 'arbre généalogique'); this.renderPedigree(host); };
      const rel = panel.querySelector('.ped-rel'); if (rel) rel.querySelectorAll('[data-rel]').forEach(b => b.onclick = () => { if (b.classList.contains('on')) return; const l = PD.findLink(ped, 'sibling', added.from, p.id); if (l) { this.pedMutate(host, d => { const k = d.links.find(z => z.id === l.id); if (k) E.sibToUnion(d, k); }); } this.closeMenu(); const q = PD.byId(ped, p.id); if (q) this.pedigreePersonMenu(q, x, y, host); });
      panel.querySelectorAll('[data-g]').forEach(g => g.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { p[g.dataset.g] = b.dataset.v; g.querySelectorAll('[data-v]').forEach(z => z.classList.toggle('on', z === b)); touchP(); }));
      panel.querySelectorAll('[data-k]').forEach(f => { f[f.type === 'checkbox' ? 'onchange' : 'oninput'] = () => { const k = f.dataset.k; p[k] = f.type === 'checkbox' ? f.checked : f.type === 'number' ? Math.max(1, +f.value || 1) : f.value; touchP(); }; });
      R.bind(panel);
      const del = panel.querySelector('[data-a=del]'); if (del) del.onclick = () => { this.closeMenu(); this.pedMutate(host, d => E.remove(d, PD.byId(d, p.id))); };
      panel.querySelector('[data-a=ok]').onclick = () => this.closeMenu();
      this.popupMenu([{ node: panel }], Math.min(x, window.innerWidth - 420), Math.min(y, window.innerHeight - 520));
    },

    // ================================================================ bilans
    /** bilans : vue Dossier › Bilans, ou carte intégrée (o.embed) — Suivi : bilans post-opératoires (o.filter, o.defaults) */
    renderExamsView(box, o) {
      o = o || {}; const d = this.dossier, X0 = d.exams || (d.exams = []), X = o.filter ? X0.filter(o.filter) : X0, redraw = () => this.renderExamsView(box, o), fk = o.embed ? 'exKindF' : 'exKind';
      const head = o.embed ? `<div class="card-h">${esc(o.title || 'Bilans')}<span class="muted small" style="margin-left:8px">${esc(o.intro || '')}</span><span class="spacer"></span><button class="primary mini-btn ex-add">+ Bilan ▾</button></div>`
        : `<div class="view-head"><h3>Bilans</h3><span class="muted">résultats datés, rattachables à une étape ; repris dans la présentation du staff et les comptes rendus</span><span class="spacer"></span><button class="primary ex-add" id="exAdd">+ Bilan ▾</button></div>`;
      box.innerHTML = `${o.embed ? '' : '<div class="scr-inner wide">'}${head}
        ${X.length > 1 ? `<div class="seg ex-filter"><button data-k="" class="${!this.ui[fk] ? 'on' : ''}">tous (${X.length})</button>${Object.entries(V.exam).filter(([k]) => X.some(x => x.kind === k)).map(([k, l]) => `<button data-k="${k}" class="${this.ui[fk] === k ? 'on' : ''}">${esc(l)} (${X.filter(x => x.kind === k).length})</button>`).join('')}</div>` : ''}
        <div class="ex-list"${o.embed ? '' : ' id="exList"'}></div>${o.embed ? '' : '</div>'}`;
      box.querySelector('.ex-add').onclick = e => { const r = e.currentTarget.getBoundingClientRect(); this.popupMenu([{ head: o.embed ? 'Nouveau bilan de suivi' : 'Nouveau bilan' }, ...Object.entries(V.exam).map(([k, l]) => ({ label: l, run: () => { const x = S.addExam(d, Object.assign({ kind: k, title: '' }, o.defaults || {})); this.ui.exOpen = x.id; this.touch(); redraw(); } }))], Math.min(r.left, window.innerWidth - 300), r.bottom + 4); };
      box.querySelectorAll('.ex-filter [data-k]').forEach(b => b.onclick = () => { this.ui[fk] = b.dataset.k || null; redraw(); });
      const list = box.querySelector('.ex-list'), shown = X.filter(x => !this.ui[fk] || x.kind === this.ui[fk]).sort((a, b) => String(b.date).localeCompare(String(a.date)));
      if (!shown.length) { list.innerHTML = o.embed ? `<div class="hint">${esc(o.empty || 'Aucun bilan.')}</div>` : '<div class="card"><div class="hint">Aucun bilan. « + Bilan » : vidéo-EEG (y compris anciens EEG), IRM, TEP, TEMP, MEG, IRMf, Wada, neuropsychologie, psychiatrie…</div></div>'; return; }
      // étape d'un bilan : ambulatoire, ou une exploration déjà faite ou en cours (libellé daté : jamais « Phase 1 » dans le vide)
      const exs = S.explorationsSorted(d).filter(e => e.status !== 'planned'), exLabel = e => `${e.label}${e.start ? ' · ' + fmtDate(e.start) + (e.end ? ' → ' + fmtDate(e.end) : '') : ''}${e.status === 'ongoing' ? ' (en cours)' : ''}`;
      const stageOpts = x => `<option value=""${!x.explorationId && x.stage !== 'amb' ? ' selected' : ''}>— à rattacher</option><option value="amb"${!x.explorationId && x.stage === 'amb' ? ' selected' : ''}>Ambulatoire</option>${exs.map(e => `<option value="${e.id}"${x.explorationId === e.id ? ' selected' : ''}>${esc(exLabel(e))}</option>`).join('')}${x.explorationId && !exs.some(e => e.id === x.explorationId) ? `<option value="${esc(x.explorationId)}" selected>${esc(((S.byId(d.explorations, x.explorationId)) || {}).label || 'exploration')}</option>` : ''}`;
      for (const x of shown) {
        const c = h('div', 'card exam k-' + x.kind), open = this.ui.exOpen === x.id || !x.text && !x.conclusion;
        c.innerHTML = `<div class="exam-h"><span class="badge">${esc(V.exam[x.kind] || x.kind)}</span>${x.phase === 'postop' && !o.embed ? '<span class="badge postop" title="bilan de suivi (après l’intervention)">suivi</span>' : ''}<input type="date" data-f="date" value="${esc(x.date)}"><input class="inline title" data-f="title" value="${esc(x.title)}" placeholder="intitulé (ex. IRM 3T protocole épilepsie)"><span class="spacer"></span><select data-a="stage" title="rattacher le bilan : en ambulatoire, ou à une phase 1 / SEEG déjà faite (à faire plus tard si l’exploration n’a pas encore eu lieu)">${stageOpts(x)}</select><button class="mini-btn" data-a="t">${open ? 'replier' : 'détails'}</button><b class="x" data-a="rm" title="supprimer">✕</b></div>
          ${open ? `<div class="form">${x.kind === 'neuropsy' ? `<div class="grid2">${V.neuroDomains.map(([k, l]) => `<label>${esc(l)}<textarea data-dom="${k}" rows="2">${esc((x.domains || {})[k] || '')}</textarea></label>`).join('')}</div>` : `<label>Résultats <textarea class="grow" data-f="text" rows="3" placeholder="${x.kind === 'veeg' ? 'anomalies intercritiques (topographie, veille / sommeil), crises enregistrées' : 'description'}">${esc(x.text)}</textarea></label>`}
            <div class="grid2"><label>Conclusion <textarea class="grow" rows="1" data-f="conclusion">${esc(x.conclusion)}</textarea></label>${x.kind === 'psy' ? '' : x.kind === 'fmri' ? `<label>Dominance du langage <select data-f="langDom">${opts(V.langDom, x.langDom || '')}</select></label>` : `<label>Latéralisation <select data-f="side">${opts({ '': '—', L: 'gauche', R: 'droite', B: 'bilatérale', N: 'non latéralisante' }, x.side)}</select></label>`}</div></div>
            <div class="exam-links">${IMG_KINDS.includes(x.kind) ? '<div class="xl-row"><span class="lbl">Images</span><span class="xl-imgs"></span></div>' : ''}
              <div class="xl-row"><span class="lbl">Captures</span><span class="spacer"></span><button class="mini-btn" data-a="linkcap" title="rattacher une capture existante de la galerie">lier une capture ▾</button></div><div class="xl-gal"></div>
              <div class="xl-row"><span class="lbl">Pièces jointes</span><span class="xl-att"></span><button class="mini-btn" data-a="attach" title="compte rendu PDF, courrier, tableau… (copié dans le dossier du patient)">+ joindre un fichier…</button><input type="file" class="xl-file" multiple hidden></div></div>` : `<div class="exam-sum">${esc(x.conclusion || x.text || Object.values(x.domains || {}).filter(Boolean).join(' · ') || '')}${this.examLinkBadges(x)}</div>`}`;
        c.querySelectorAll('[data-f]').forEach(el => { el[el.tagName === 'SELECT' || el.type === 'date' ? 'onchange' : 'oninput'] = () => { x[el.dataset.f] = el.value || (el.dataset.f === 'explorationId' ? null : ''); this.touch('exam', x.id, V.exam[x.kind]); }; });
        const sg = c.querySelector('[data-a=stage]'); if (sg) sg.onchange = () => { const v = sg.value; x.explorationId = v && v !== 'amb' ? v : null; x.stage = v === 'amb' ? 'amb' : ''; this.touch('exam', x.id, V.exam[x.kind]); };
        c.querySelectorAll('[data-dom]').forEach(el => el.oninput = () => { (x.domains = x.domains || {})[el.dataset.dom] = el.value; this.touch('exam', x.id, V.exam[x.kind]); });
        c.querySelector('[data-a=t]').onclick = () => { this.ui.exOpen = open ? null : x.id; redraw(); };
        c.querySelector('[data-a=rm]').onclick = async () => { if (!confirm('Supprimer ce bilan (et ses pièces jointes) ?')) return; for (const a of x.attachments || []) await SV.Library.removeFile(d, a.file).catch(() => { }); S.remove(d, 'exam', x.id); this.touch(); redraw(); };
        if (open) this.bindExamLinks(c, x, () => redraw());
        list.appendChild(c);
      }
    },
    /** pastilles du bilan replié : images, captures, pièces jointes */
    examLinkBadges(x) { const d = this.dossier, ni = (x.imagingIds || []).length, ng = (d.gallery || []).filter(g => g.examId === x.id).length, na = (x.attachments || []).length; return ni + ng + na ? ` <span class="xl-badges">${ni ? `<span class="badge">${ni} image${ni > 1 ? 's' : ''}</span>` : ''}${ng ? `<span class="badge">${ng} capture${ng > 1 ? 's' : ''}</span>` : ''}${na ? `<span class="badge">📎 ${na}</span>` : ''}</span>` : ''; },
    /** liens d'un bilan ouvert : images du dossier (voir), captures (coller / lier), pièces jointes */
    bindExamLinks(c, x, redraw) {
      const d = this.dossier, L = SV.Library, imBox = c.querySelector('.xl-imgs');
      const drawImgs = () => { if (!imBox) return;
        const lbl = im => `${V.modality[im.modality] || im.modality} ${fmtDate(im.date)}`, linked = (x.imagingIds || []).map(id => S.byId(d.imaging, id)).filter(Boolean), rest = d.imaging.filter(im => !(x.imagingIds || []).includes(im.id));
        imBox.innerHTML = linked.map(im => `<span class="xl-chip">${esc(lbl(im))} <button class="mini-btn" data-view="${im.id}" title="ouvrir dans Dossier › Imagerie">voir</button><b class="x" data-unl="${im.id}">✕</b></span>`).join('') + (rest.length ? `<select class="xl-add"><option value="">+ lier une image…</option>${rest.map(im => `<option value="${im.id}">${esc(lbl(im))}</option>`).join('')}</select>` : linked.length ? '' : '<span class="muted small">aucune image dans le dossier</span> <button class="mini-btn" data-goim title="Dossier › Imagerie : déposer les NIfTI exportés du PACS, puis les lier à ce bilan">importer dans Dossier › Imagerie →</button>');
        const gi = imBox.querySelector('[data-goim]'); if (gi) gi.onclick = () => this.go({ stage: 'dossier', view: 'imagerie' });
        imBox.querySelectorAll('[data-view]').forEach(b => b.onclick = () => this.showImaging(b.dataset.view));
        imBox.querySelectorAll('[data-unl]').forEach(b => b.onclick = () => { x.imagingIds = x.imagingIds.filter(i => i !== b.dataset.unl); this.touch('exam', x.id, V.exam[x.kind]); drawImgs(); });
        const sel = imBox.querySelector('.xl-add'); if (sel) sel.onchange = () => { if (!sel.value) return; (x.imagingIds = x.imagingIds || []).push(sel.value); this.touch('exam', x.id, V.exam[x.kind]); drawImgs(); };
      };
      drawImgs();
      if (this.renderGallery) this.renderGallery(c.querySelector('.xl-gal'), { examId: x.id, explorationId: x.explorationId || null, compact: true });
      c.querySelector('[data-a=linkcap]').onclick = e => {
        const G = (d.gallery || []).filter(g => g.examId !== x.id), r = e.currentTarget.getBoundingClientRect();
        if (!G.length) { this.toast('Aucune autre capture dans la galerie : collez-en une ici (Ctrl+V)', 3000); return; }
        this.popupMenu([{ head: 'Rattacher une capture à ce bilan' }].concat(G.map(g => ({ label: `${g.title || (g.kind && V.galleryKind[g.kind]) || V.galleryMod[S.galleryModOf(this.dossier, g)] || 'capture'} · ${fmtDate(g.date)}${g.explorationId ? ' · ' + ((S.byId(d.explorations, g.explorationId) || {}).label || '') : ''}`, run: () => { g.examId = x.id; this.touch('gallery', g.id, g.title); this.renderGallery(c.querySelector('.xl-gal'), { examId: x.id, explorationId: x.explorationId || null, compact: true }); } }))), Math.min(r.left, window.innerWidth - 380), r.bottom + 4);
      };
      const drawAtt = () => {
        const A = x.attachments || [], box = c.querySelector('.xl-att');
        box.innerHTML = A.map(a => `<span class="xl-chip">📎 <a href="#" data-open="${a.id}" title="ouvrir">${esc(a.name)}</a> <span class="muted small">${a.size ? Math.max(1, Math.round(a.size / 1024)) + ' ko' : ''}</span><b class="x" data-del="${a.id}">✕</b></span>`).join('');
        box.querySelectorAll('[data-open]').forEach(b => b.onclick = async ev => { ev.preventDefault(); const a = A.find(y => y.id === b.dataset.open); const blob = await L.readFile(d, a.file).catch(() => null); if (!blob) { this.toast('Fichier absent du dossier (archive légère ?)', 3500); return; } this.fileViewer(blob, a.name, a.mime); });
        box.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { const a = A.find(y => y.id === b.dataset.del); if (!confirm(`Retirer « ${a.name} » du dossier ?`)) return; await L.removeFile(d, a.file).catch(() => { }); x.attachments = A.filter(y => y !== a); this.touch('exam', x.id, 'pièce jointe retirée'); drawAtt(); });
      };
      drawAtt();
      const fi = c.querySelector('.xl-file');
      c.querySelector('[data-a=attach]').onclick = () => { fi.value = ''; fi.click(); };
      fi.onchange = async () => { await this.examAttach(x, [...fi.files]); drawAtt(); };
    },
    /** visionneuse (v5.1) : PDF et images dans une fenêtre de l'application ; autres fichiers : ouverts par le navigateur */
    fileViewer(blob, name, mime) {
      const ext = String(name || '').toLowerCase().split('.').pop(), type = mime || (ext === 'pdf' ? 'application/pdf' : /^(png|jpe?g|gif|webp|bmp)$/.test(ext) ? 'image/' + (ext === 'jpg' ? 'jpeg' : ext) : 'application/octet-stream');
      const u = URL.createObjectURL(new Blob([blob], { type })), pdf = type === 'application/pdf', img = /^image\//.test(type);
      if (!pdf && !img) { const w = window.open(u, '_blank'); if (!w) { const l = document.createElement('a'); l.href = u; l.download = name; l.click(); } setTimeout(() => URL.revokeObjectURL(u), 60000); return; }
      const m = h('div', 'modal fviewer'), card = h('div', 'modal-card fv-card');
      card.innerHTML = `<div class="modal-head"><span>${esc(name)}</span><span class="spacer"></span><a class="mini-btn" href="${u}" download="${esc(name)}">télécharger</a><a class="mini-btn" href="${u}" target="_blank" rel="noopener">nouvel onglet</a><button class="close">✕</button></div>
        <div class="fv-body">${pdf ? `<iframe src="${u}" title="${esc(name)}"></iframe>` : `<img src="${u}" alt="${esc(name)}">`}</div>`;
      m.appendChild(card); document.body.appendChild(m);
      const close = () => { m.remove(); setTimeout(() => URL.revokeObjectURL(u), 1000); document.removeEventListener('keydown', esc1, true); };
      const esc1 = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
      document.addEventListener('keydown', esc1, true); card.querySelector('.close').onclick = close; m.onclick = e => { if (e.target === m) close(); };
    },
    /** pièces jointes d'un bilan : fichiers copiés dans attachments/<id>_<nom> */
    async examAttach(x, files) {
      const d = this.dossier, L = SV.Library; x.attachments = x.attachments || [];
      for (const f of files) { const id = S.uid('F'), safe = String(f.name || 'fichier').replace(/[^\w.\-]+/g, '_').slice(-80), file = `attachments/${id}_${safe}`; await L.writeFile(d, file, f); x.attachments.push({ id, name: f.name || safe, mime: f.type || '', size: f.size || 0, file, added: S.now(), by: L.user }); }
      if (files.length) { this.touch('exam', x.id, 'pièce jointe'); await this.flushSave(); this.toast(`${files.length} pièce${files.length > 1 ? 's' : ''} jointe${files.length > 1 ? 's' : ''} au bilan`, 2500); }
    },
    /** ouvre une image du dossier dans Dossier › Imagerie (en base si c'est un T1, en superposition sinon) */
    showImaging(imId) {
      const d = this.dossier, im = S.byId(d.imaging, imId); if (!im) return;
      this.ui.imSel = im.id; const st = this.slvState ? this.slvState() : null;
      if (st) { if (im.ref) { st.base = null; st.wlTarget = 'base'; } else if (im.modality === 'T1' || im.modality === 'T1c') { st.base = im.id; st.baseWin = null; st.wlTarget = 'base'; } else { this.addOverlay(im.id); st.wlTarget = im.id; } }
      this.go({ stage: 'dossier', view: 'imagerie' });
    },
  };
  Object.assign(SV.app, M);
  SV.Clinical = { ONSET_MODE, CONTACT, TIMING, parsePartial, growAll };
})(window.SV = window.SV || {});
