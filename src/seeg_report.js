/* EpiScope — seeg_report.js : SEEG › Rapport — synthèse et compte rendu du monitoring vidéo-SEEG.
 *   Ordre du compte rendu (pratique des services de neurophysiologie) :
 *     en-tête (dates, objet, traitement à l'admission) ; I. implantation et test des plots (schémas d'implantation sous le
 *     titre, puis localisation réelle de chaque électrode et activité recueillie) ; II. EEG intercritique (rythme de fond,
 *     activités physiologiques, foyer lent, grapho-éléments, captures) suivi de ses analyses quantitatives (tracé par tracé) ;
 *     III. crises spontanées, chacune suivie des analyses de son tracé (EI, cEI, PEI, h², HFO) ; synthèse des crises (EImax,
 *     cEImax, PEImax) et autres analyses, s'il y a lieu ; stimulations corticales directes ; thermocoagulations (tableau
 *     détaillé) ; synthèse et conclusion. Chapitres numérotés au fil du document ; sommaire latéral qui suit la lecture (v4.17).
 *   La vue « Rapport SEEG » prépare la synthèse : chaque rubrique peut être proposée d'après les données saisies.   */
(function (SV) {
  'use strict';
  const $ = id => document.getElementById(id), S = SV.Store, V = S.V, R = SV.Report, Q = SV.Seeg;
  const esc = SV.U.esc;
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const fmtDate = s => { if (!s) return ''; const d = new Date(String(s).length <= 10 ? s + 'T12:00:00' : s); return isNaN(d) ? String(s) : d.toLocaleDateString(SV.LOC); };
  const hm = s => { if (!s || String(s).length <= 10) return ''; const d = new Date(s); return isNaN(d) ? '' : d.toLocaleTimeString(SV.LOC, { hour: '2-digit', minute: '2-digit' }).replace(':', 'h'); };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const SHOT = { scale: 2, crop: true };
  const FIELDS = [
    ['lesional', 'Zone lésionnelle électrique', 'rythme de fond déstructuré, activité rapide de polypointes de bas voltage (brushes), pointes rythmiques continues, pattern alternant'],
    ['irritative', 'Zone irritative', 'pointes, polypointes, pointes-ondes'],
    ['soz', 'Zone d’initiation des crises — analyse visuelle', 'plots impliqués au début des crises'],
    ['ei', 'Analyses quantifiées (EI, cEI, PEI, HFO…)', 'valeurs les plus élevées de chaque analyse (SEEG › Analyses) : EI (Bartolomei 2008), cEI, PEI, taux de HFO…'],
    ['ez', 'Zone épileptogène actuelle pratique', ''],
    ['ezPot', 'Zone épileptogène potentielle', ''],
    ['functional', 'Zone fonctionnelle en rapport avec la zone épileptogène', 'cartographie par stimulation, chevauchement avec les aires éloquentes'],
    ['limits', 'Limites du bilan', 'échantillonnage, déviations de trajectoire, crises non recueillies…'],
    ['riskFunctional', 'Pronostic fonctionnel', 'risque de déficit'],
    ['riskEpi', 'Pronostic épileptologique', 'chances de contrôle des crises (%)'],
    ['thermoAfter', 'Thermocoagulations : suites immédiates et différées', ''],
  ];
  /** v5.1 — carte « Synthèse et conclusion » : une ligne par rubrique, rangées dans l'ordre du raisonnement ; les régions VEP
   *  des zones (pickers) rejoignent la conclusion */
  const SECTIONS = [
    ['Activités électrophysiologiques', 'ce que montrent les tracés', ['irritative', 'lesional', 'soz', 'ei']],
    ['Zone épileptogène', 'conclusion du bilan', ['ez', 'ezRegions', 'ezPot', 'propRegions', 'functional']],
    ['Limites et pronostic', '', ['limits', 'riskFunctional', 'riskEpi']],
    ['Thermocoagulations', '', ['thermoAfter']],
  ];
  const SUG = new Set(['irritative', 'soz', 'ei', 'ez', 'functional', 'thermoAfter']);
  const ZONES = { ezRegions: ['Zone épileptogène · régions', '#e12d37', 'ez', 'régions VEP (plots marqués au début des crises) : reprises en rouge dans la vue des thermocoagulations'], propRegions: ['Propagation précoce · régions', '#ff9628', 'prop', 'régions VEP des plots de propagation précoce : en orange dans la vue des thermocoagulations'] };

  const M = {
    seegReportFields: FIELDS,
    // ================================================================ vue
    renderSeegReportView(box, st) {
      const d = this.dossier, ex = st.obj, Rp = ex.report || (ex.report = {}), P = d.patient;
      const szs = S.seizuresOfExploration(d, ex.id), on = this.onsetSummary(ex), nReal = ex.electrodes.filter(e => e.real).length, I = ex.inter || {};
      const stS = ex.stims.filter(s => s.sz).length, stC = ex.stims.filter(s => s.clin).length, stA = ex.stims.filter(s => s.ad && !s.sz).length, stF = ex.stims.filter(s => s.clin && Q.clinTypeOf(s) === 'func').length, stJ = stC - stF;
      const todo = (ok, txt, view) => `<div class="todo ${ok ? 'ok' : ''}"><span>${ok ? '✓' : '○'}</span> ${txt}${view ? ` <a href="#" data-go="${view}">${ok ? 'voir' : 'compléter'} →</a>` : ''}</div>`;
      box.innerHTML = `<div class="scr-inner wide"><div class="view-head"><h3>Rapport SEEG · ${esc(ex.label)}</h3><span class="muted">la synthèse se prépare ici ; le compte rendu reprend toutes les étapes de la SEEG</span><span class="spacer"></span><button class="primary" id="srGen">Générer le rapport SEEG</button></div>
        <div class="sr-grid">
          <div class="card"><div class="card-h">Données recueillies</div>
            ${todo(ex.electrodes.length, `${ex.electrodes.length} électrode${ex.electrodes.length > 1 ? 's' : ''}${nReal ? ` dont ${nReal} localisée${nReal > 1 ? 's' : ''} sur le scanner` : ' (aucune localisée)'}`, nReal ? 'loc' : 'loc')}
            ${todo(I.wake || I.sleep || (I.spikes || []).length, `intercritique : ${[(I.wake || I.sleep) ? 'rythme de fond' : '', (I.spikes || []).length ? I.spikes.length + ' grapho-élément(s)' : '', I.slow ? 'foyer lent' : ''].filter(Boolean).join(', ') || 'à décrire'}`, 'inter')}
            ${todo(szs.length, `${szs.length} crise${szs.length > 1 ? 's' : ''}${on.n ? `, ${on.n} avec plots de début marqués` : ''}`, 'crises')}
            ${todo(ex.stims.length, `${ex.stims.length} stimulation${ex.stims.length > 1 ? 's' : ''}${ex.stims.length ? ` (${stS} crise${stS > 1 ? 's' : ''}, ${stA} post-décharge${stA > 1 ? 's' : ''}, ${stJ} réponse${stJ > 1 ? 's' : ''} subjective${stJ > 1 ? 's' : ''}, ${stF} fonctionnelle${stF > 1 ? 's' : ''})` : ''}`, 'stim')}
            ${todo(ex.quant.length, ex.quant.length ? 'analyses : ' + ex.quant.map(q => esc(q.name)).join(', ') : 'aucune analyse quantifiée (EI, ripples…)', 'analyses')}
            ${(() => { const n = s => ex.thermo.filter(t => S.thermoStatusOf(t) === s).length, nd = n('done'); return todo(ex.thermo.length, `${nd} paire${nd > 1 ? 's' : ''} thermocoagulée${nd > 1 ? 's' : ''}${n('validated') ? `, ${n('validated')} validée${n('validated') > 1 ? 's' : ''}` : ''}${n('planned') ? `, ${n('planned')} planifiée${n('planned') > 1 ? 's' : ''}` : ''}`, 'thermo'); })()}
            ${todo((d.gallery || []).some(g => g.explorationId === ex.id), `${(d.gallery || []).filter(g => g.explorationId === ex.id).length} capture(s) de tracés`, 'galerie')}</div>
          <div class="card form"><div class="card-h">En-tête</div>
            <div class="grid2"><label>Début du monitoring <input type="date" data-x="start" value="${esc(ex.start)}"></label><label>Fin <input type="date" data-x="end" value="${esc(ex.end)}"></label></div>
            <label>Objet de la demande <input data-f="object" value="${esc(Rp.object || '')}" placeholder="bilan pré-chirurgical de phase 2 (SEEG) d’une épilepsie…"></label>
            <label>Traitement à l’admission <textarea data-f="treatment" rows="2" placeholder="${esc(P.aeds || '')}">${esc(Rp.treatment || '')}</textarea></label>
            <label>Conditions <input data-f="conditions" value="${esc(Rp.conditions || '')}" placeholder="sevrage, privation de sommeil…"></label>
            <label><span class="srl">Synthèse (introduction) <button class="mini-btn" data-sug="summary">proposer</button></span><textarea data-f="summary" rows="3" placeholder="Au cours de ce bilan stéréo-EEG de … jours, réalisé sous …, x crises électrocliniques…">${esc(Rp.summary || '')}</textarea></label></div>
        </div>
        <div class="card sr-card"><div class="card-h">Synthèse et conclusion <span class="muted">une rubrique par ligne · ● remplie · « proposer » la rédige d’après les données (à relire)</span></div>
          ${SECTIONS.filter(([, , keys]) => !keys.includes('thermoAfter') || ex.thermo.length || (Rp.thermoAfter || '').trim()).map(([t, sub, keys]) => `<div class="sr-sec"><div class="sr-sec-h">${esc(t)}${sub ? ` <span class="muted">${esc(sub)}</span>` : ''}</div>${keys.map(k => this.seegReportRow(k, Rp)).join('')}</div>`).join('')}</div></div>`;
      this.bindFields(box.querySelector('.sr-grid .card.form'), Rp, 'exploration');
      this.bindFields(box.querySelector('.sr-card'), Rp, 'exploration');
      box.querySelectorAll('.sr-card textarea[data-f]').forEach(ta => ta.addEventListener('input', () => { const r = ta.closest('.sr-row'); if (r) r.classList.toggle('ok', !!ta.value.trim()); }));
      box.querySelectorAll('[data-x]').forEach(el => el.onchange = () => { ex[el.dataset.x] = el.value; this.touch('exploration', ex.id, ex.label); this.renderParcours(); this.renderSubbar(); });
      box.querySelectorAll('[data-go]').forEach(a => a.onclick = e => { e.preventDefault(); this.go({ stage: st.key, view: a.dataset.go }); });
      box.querySelectorAll('[data-sug]').forEach(b => b.onclick = e => { e.preventDefault(); const k = b.dataset.sug, t = this.seegSuggest(ex, k), ta = box.querySelector(`textarea[data-f="${k}"]`); if (!t) { this.toast('Pas assez de données pour proposer cette rubrique', 3000); return; } if (ta.value.trim() && !confirm('Remplacer le texte de la rubrique par la proposition ?')) return; ta.value = t; Rp[k] = t; ta.dispatchEvent(new Event('input')); this.touch('exploration', ex.id, 'rapport SEEG'); });
      $('srGen').onclick = () => this.seegReportDialog(ex);
      Rp.ezRegions = Rp.ezRegions || []; Rp.propRegions = Rp.propRegions || [];
      const zt = () => this.touch('exploration', ex.id, 'zones du rapport SEEG');
      const drawZ = () => { for (const [id, L] of [['srEz', Rp.ezRegions], ['srProp', Rp.propRegions]]) { const a = $(id); if (!a) continue; a.innerHTML = ''; a.appendChild(this.regionPicker(L, () => { zt(); a.closest('.sr-row').classList.toggle('ok', L.length > 0); })); a.closest('.sr-row').classList.toggle('ok', L.length > 0); } };
      drawZ();
      box.querySelectorAll('[data-zsug]').forEach(bt => bt.onclick = () => { const k = bt.dataset.zsug, L = this.seegZoneSuggest(ex, k), tgt = k === 'ez' ? Rp.ezRegions : Rp.propRegions; if (!L.length) { this.toast(k === 'ez' ? 'Aucun plot marqué au début des crises (SEEG › Crises, onglet Électrique)' : 'Aucun plot de propagation précoce marqué', 4000); return; } if (tgt.length && !confirm('Remplacer les régions de cette zone par la proposition ?')) return; tgt.splice(0, tgt.length, ...L); zt(); drawZ(); });
    },
    /** une ligne de la carte de synthèse : libellé, aide, « proposer » | champ (ou régions VEP des zones) */
    seegReportRow(k, Rp) {
      const Z = ZONES[k];
      if (Z) return `<div class="sr-row"><div class="sr-lab"><span class="sr-t"><i class="sr-dot"></i><i class="sw" style="background:${Z[1]}"></i>${esc(Z[0])}</span><small class="muted">${esc(Z[3])}</small><button class="mini-btn" data-zsug="${Z[2]}">proposer</button></div><div class="sr-in" id="${k === 'ezRegions' ? 'srEz' : 'srProp'}"></div></div>`;
      const F = FIELDS.find(f => f[0] === k); if (!F) return '';
      return `<div class="sr-row${(Rp[k] || '').trim() ? ' ok' : ''}"><div class="sr-lab"><span class="sr-t"><i class="sr-dot"></i>${esc(F[1])}</span>${F[2] ? `<small class="muted">${esc(F[2])}</small>` : ''}${SUG.has(k) ? `<button class="mini-btn" data-sug="${k}">proposer</button>` : ''}</div><div class="sr-in"><textarea class="grow" data-f="${k}" rows="2">${esc(Rp[k] || '')}</textarea></div></div>`;
    },
    /** régions VEP des plots de début des crises (ez) ou de propagation précoce hors début (prop) */
    seegZoneSuggest(ex, kind) {
      const on = this.onsetSummary(ex), els = this.planElectrodes(ex.electrodes), out = [];
      for (const [key, c] of Object.entries(on.contacts || {})) {
        if (kind === 'ez' ? !c.onset : !(c.early && !c.onset)) continue;
        const m = String(key).match(/^(.*?)(\d+)$/); if (!m) continue; const e = Q.findElec(els, m[1]); if (!e) continue; const ct = e.contacts[+m[2] - 1];
        if (ct && ct.label >= 1 && ct.label <= 162 && !out.includes(ct.label)) out.push(ct.label);
      }
      if (kind === 'prop') { const ez = (ex.report && ex.report.ezRegions) || this.seegZoneSuggest(ex, 'ez'); return out.filter(r => !ez.includes(r)); }
      return out;
    },
    /** compte rendu SEEG rédigé (intercritique, synthèse et conclusion) pour le rapport du dossier et le staff */
    seegCrHTML(ex, o) {
      o = o || {}; const I = ex.inter || {}, Rp = ex.report || {}, filled = FIELDS.filter(([k]) => k !== 'thermoAfter' && (Rp[k] || '').trim()), br = t => esc(t).replace(/\n/g, '<br>');
      let s = '';
      if (I.wake || I.sleep || I.physiological || I.slow || (I.spikes || []).length || I.other) s += `<h4>EEG intercritique</h4>${I.wake ? `<p><b>Veille</b> : ${br(I.wake)}</p>` : ''}${I.sleep ? `<p><b>Sommeil</b> : ${br(I.sleep)}</p>` : ''}${I.physiological ? `<p><b>Activités physiologiques</b> : ${br(I.physiological)}</p>` : ''}${I.slow ? `<p><b>Foyer lent</b> : ${br(I.slow)}</p>` : ''}${(I.spikes || []).length ? `<table><tr><th>plots</th><th>grapho-éléments</th><th>V / S</th></tr>${I.spikes.map(x => `<tr><td class="mono">${esc(x.contacts)}</td><td>${esc(x.text)}</td><td>${esc(({ V: 'V', S: 'S', VS: 'V, S' })[x.vig] || '')}</td></tr>`).join('')}</table>` : ''}${I.other ? `<p>${br(I.other)}</p>` : ''}`;
      if (o.afterInter) s += o.afterInter;   // imagerie de source des pointes, après l'analyse visuelle de l'intercritique
      if (Rp.summary || filled.length) s += `<h4>Synthèse et conclusion</h4>${Rp.summary ? `<p>${br(Rp.summary)}</p>` : ''}${filled.length ? `<dl class="zones">${filled.map(([k, l]) => `<dt>${esc(l)}</dt><dd>${br(Rp[k])}</dd>`).join('')}</dl>` : ''}`;   // zones en régions VEP : non reprises pour le moment
      return s;
    },
    /** plots d'une liste de clés (« A’1 ») regroupés par électrode : « A’1-2-3 » */
    groupContacts(keys) {
      const by = new Map(); for (const k of keys) { const m = String(k).match(/^(.*?)(\d+)$/); if (!m) continue; if (!by.has(m[1])) by.set(m[1], []); by.get(m[1]).push(+m[2]); }
      return [...by].map(([e, L]) => e + ' ' + L.sort((a, b) => a - b).join('-'));
    },
    /** région (parcellation du patient si calculée) d'un plot « A’3 » */
    contactRegion(key, els) {
      const m = String(key).match(/^(.*?)(\d+)$/); if (!m) return ''; const e = Q.findElec(els || this.planElectrodes((S.byId(this.dossier.explorations, this.ctx && this.ctx.explorationId) || {}).electrodes || []), m[1]); if (!e) return '';
      const c = e.contacts[+m[2] - 1]; if (!c) return ''; const l = c.label; return l >= 1 && l <= 162 ? this.atlas.label(l) : l === 200 ? 'substance blanche' : l === 201 ? 'LCR' : '';
    },
    seegSuggest(ex, k) {
      const d = this.dossier, els = this.planElectrodes(ex.electrodes), regs = keys => { const R0 = new Map(); for (const key of keys) { const r = this.contactRegion(key, els); if (r) R0.set(r, (R0.get(r) || 0) + 1); } return [...R0.keys()]; };
      if (k === 'soz') { const on = this.onsetSummary(ex); if (!on.n) return ''; const L = Object.entries(on.contacts).filter(([, c]) => c.onset).sort((a, b) => b[1].onset - a[1].onset); if (!L.length) return ''; return `Plots impliqués au début des crises (${on.n} crise${on.n > 1 ? 's' : ''} analysée${on.n > 1 ? 's' : ''}) : ${this.groupContacts(L.map(x => x[0])).join(' ; ')}${regs(L.map(x => x[0])).length ? ' — ' + regs(L.map(x => x[0])).join(', ') : ''}. Propagation précoce : ${this.groupContacts(Object.entries(on.contacts).filter(([, c]) => c.early && !c.onset).map(x => x[0])).join(' ; ') || '—'}.`; }
      if (k === 'irritative') { const sp = (ex.inter && ex.inter.spikes) || []; if (!sp.length) return ''; return sp.map(s => `${s.contacts}${s.text ? ' : ' + s.text : ''}${s.vig ? ' (' + ({ V: 'veille', S: 'sommeil', VS: 'veille et sommeil' }[s.vig] || s.vig) + ')' : ''}`).join(' ; ') + '.'; }
      if (k === 'ei') {   // v5.1 : chaque analyse quantifiée (synthèses EImax / cEImax / PEImax d'abord), une ligne chacune
        const rank = q => q.eimax || /max/i.test(q.name) ? 0 : 1, L = ex.quant.slice().sort((a, b) => rank(a) - rank(b)), out = [];
        for (const q of L) { const vals = Object.entries(q.values || {}).filter(([, v]) => isFinite(+v)).sort((a, b) => b[1] - a[1]); if (!vals.length) continue; const mx = +vals[0][1], top = vals.filter(([, v]) => +v >= 0.5 * mx).slice(0, 8), r = regs(top.map(([l]) => { const p = Q.parseLabel(l); return p ? p.elec + p.c1 : l; }));
          out.push(`${q.name} : ${top.map(([l, v]) => `${l} (${(+v).toLocaleString(SV.LOC, { maximumFractionDigits: 2 })})`).join(', ')}${r.length ? ' — ' + r.join(', ') : ''}.`); if (out.length >= 6) break; }
        return out.join('\n');
      }
      if (k === 'ez') { const on = this.onsetSummary(ex), keys = Object.entries(on.contacts).filter(([, c]) => c.onset).map(x => x[0]); const r = regs(keys); return r.length ? r.join(', ') + '.' : ''; }
      if (k === 'functional') { const L = ex.stims.filter(s => s.clin && Q.clinTypeOf(s) === 'func' && !s.sz); if (!L.length) return ''; const g = new Map(); for (const s of L) { const key = `${s.elec}${s.c1}-${s.c2}`; if (!g.has(key)) g.set(key, []); g.get(key).push(s); } return [...g].map(([key, ss]) => `${key} : ${[...new Set(ss.map(s => s.clinText).filter(Boolean))].join(', ') || 'réponse clinique'} (${[...new Set(ss.map(s => Q.STIM_MODES[s.mode].fr.toLowerCase()))].join(', ')} à ${Math.min(...ss.map(s => s.mA)).toLocaleString(SV.LOC)} mA)`).join(' ; ') + '.'; }
      if (k === 'thermoAfter') { const D = ex.thermo.filter(t => S.thermoStatusOf(t) === 'done'); return D.length ? `Thermocoagulations de ${[...new Set(D.map(t => `${t.elec} ${t.c1}-${t.c2}`))].join(', ')}. Suites immédiates : … Suites différées : …` : ''; }
      if (k === 'summary') { const szs = S.seizuresOfExploration(d, ex.id), hab = szs.filter(z => z.habitual === 'yes').length, days = ex.start && ex.end ? Math.round((Date.parse(ex.end) - Date.parse(ex.start)) / 864e5) + 1 : null, sl = szs.filter(z => z.vigilance === 'sleep').length, induced = ex.stims.filter(s => s.sz && s.szHabitual).length; return `Au cours de ce bilan stéréo-EEG${days ? ' de ' + days + ' jours' : ''}, ${szs.length} crise${szs.length > 1 ? 's' : ''} électroclinique${szs.length > 1 ? 's' : ''}${hab ? ` (dont ${hab} à sémiologie habituelle)` : ''} ${szs.length > 1 ? 'ont été enregistrées' : 'a été enregistrée'}${sl ? `, ${sl === szs.length ? 'toutes' : sl} au cours du sommeil` : ''}. ${induced ? induced + ' crise' + (induced > 1 ? 's' : '') + ' à sémiologie habituelle ' + (induced > 1 ? 'ont été reproduites' : 'a été reproduite') + ' par les stimulations corticales.' : 'Aucune crise habituelle n’a été reproduite par les stimulations corticales.'}`; }
      return '';
    },

    // ================================================================ génération
    seegReportDialog(ex) {
      const box = h('div', 'modal'), card = h('div', 'modal-card small');
      card.innerHTML = `<div class="modal-head"><span>Rapport SEEG — ${esc(ex.label)}</span><button class="close">✕</button></div><div class="help rd-body" style="padding:12px 16px">
        <label><input type="checkbox" id="sgImg" checked> vues 3D (implantation, stimulations, thermocoagulations, analyses)</label>
        <label><input type="checkbox" id="sgGal" checked> captures de tracés de la galerie (intercritique, crises, stimulations)</label>
        <label><input type="checkbox" id="sgAnx" checked> tableaux détaillés des stimulations, thermocoagulations et analyses (plots au-dessus du seuil, tableau complet replié)</label>
        <label><input type="checkbox" id="sgSeq" checked> séquence sémiologique saisie pour chaque crise</label>
        ${(ex.esi || []).length ? `<label><input type="checkbox" id="sgEsi" checked> imagerie de source (${ex.esi.length} résultat${ex.esi.length > 1 ? 's' : ''}) : pointes après l’intercritique, début de crise après chaque crise ou à la synthèse</label>` : ''}
        <div class="hint">Le compte rendu suit l’ordre du monitoring : implantation (schémas en tête), intercritique et ses analyses, chaque crise suivie des analyses de son tracé, synthèse des crises (EImax…), stimulations, thermocoagulations, synthèse. Les rubriques de synthèse vides sont omises ; un sommaire latéral suit la lecture.</div></div>
        <div class="modal-foot"><button class="primary ok">Générer</button><button class="cancel">Annuler</button></div>`;
      const close = () => box.remove(); card.querySelector('.close').onclick = card.querySelector('.cancel').onclick = close;
      card.querySelector('.modal-foot .ok').onclick = () => { const o = { images: $('sgImg').checked, gallery: $('sgGal').checked, annex: $('sgAnx').checked, sequence: $('sgSeq').checked, esi: !!($('sgEsi') && $('sgEsi').checked) }; close(); this.seegReportGenerate(ex, o); };
      box.appendChild(card); document.body.appendChild(box); box.hidden = false;
    },
    async seegReportGenerate(ex, opts) {
      const d = this.dossier; if (!d || this._reportBusy) return;
      const job = this.jobStart('Rapport SEEG'), orig = this.ctx ? Object.assign({}, this.ctx) : null, loc0 = this.loc ? Object.assign({}, this.loc) : null;
      const restoreV = { layout: this.viewer.layoutName, active: this.viewer.active, cfgs: this.viewer.cells.map(c => Object.assign({}, c.cfg, { hyps: c.cfg.hyps.slice() })) };
      if (this.ctx) this.persistWorkspace(); await this.flushSave(); this._reportBusy = true;
      let html = '';
      try {
        html = await this.viewerTask(async () => {
          this.loadForReport({ explorationId: ex.id }); await wait(60);
          const A = this.atlas, P = d.patient, Rp = ex.report || {}, els = this.elecs.slice(), F = P.sex === 'F';
          const region = l => l >= 1 && l <= 162 ? A.label(l) : l === 200 ? 'substance blanche' : l === 201 ? 'LCR' : l === 0 ? 'hors cerveau' : 'autre';
          const ranges = e => { const out = []; let s = 1, cur = e.contacts[0] ? e.contacts[0].label : 0; for (let k = 1; k <= e.contacts.length; k++) { const l = k < e.contacts.length ? e.contacts[k].label : null; if (l !== cur) { out.push(`${e.name}${s}${k > s ? ' à ' + e.name + k : ''} : ${region(cur)}`); s = k + 1; cur = l; } } return out.join(' ; '); };
          const gal = async filter => { if (!opts.gallery) return ''; const G = (d.gallery || []).filter(g => g.explorationId === ex.id && filter(g)); if (!G.length) return ''; const imgs = []; for (const g of G) { const u = await this.galleryComposite(g, 1800); if (u) imgs.push(`<figure class="galfig">${R.IMG(u, 'SEEG_' + (g.title || g.id))}<figcaption><b>${esc(g.title || V.galleryKind[g.kind])}</b>${g.vigilance ? ' · ' + esc(g.vigilance === 'S' ? 'sommeil' : 'veille') : ''}${g.notes ? ' — ' + esc(g.notes) : ''}</figcaption></figure>`); } return imgs.length ? `<div class="galimgs">${imgs.join('')}</div>` : ''; };
          let body = '';
          // ---- en-tête
          const days = ex.start && ex.end ? Math.round((Date.parse(ex.end) - Date.parse(ex.start)) / 864e5) + 1 : null;
          body += `<div class="callout"><p><b>Monitoring vidéo-SEEG prolongé</b>${ex.start ? ' du ' + fmtDate(ex.start) : ''}${ex.end ? ' au ' + fmtDate(ex.end) : ''}${days ? ` (${days} jours)` : ''}${ex.center ? ' · ' + esc(ex.center) : ''}</p>
            <p><b>Patient${F ? 'e' : ''}</b> : ${esc(P.pseudo)}${P.birthYear ? ', ' + (F ? 'née' : 'né(e)') + ' en ' + esc(P.birthYear) : ''}${P.handedness ? ', ' + esc(V.handedness[P.handedness]) : ''}</p>
            <p><b>Objet de la demande</b> : ${esc(Rp.object || 'bilan pré-chirurgical de phase 2 (SEEG) d’une épilepsie pharmacorésistante')}</p>
            ${(Rp.treatment || P.aeds) ? `<p><b>Traitement à l’admission</b> : ${esc(Rp.treatment || P.aeds).replace(/\n/g, '<br>')}</p>` : ''}${Rp.conditions ? `<p><b>Conditions</b> : ${esc(Rp.conditions)}</p>` : ''}</div>`;
          // chapitres numérotés au fil du compte rendu (« Synthèse des crises » et « Autres analyses » seulement s'il y a lieu)
          const ROM = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'], ch = { n: 0 }, chap = (id, t) => `<h2 id="${id}">${ROM[ch.n++]}. ${t}</h2>`, base = ex.label;
          // vues et tableaux des stimulations, thermocoagulations et analyses (calculés une fois)
          job.progress(0.08, 'vues');
          const G = (opts.annex || opts.images) && this.seegReport ? await this.seegReport(opts.images ? SHOT : null) : null, anx = !!(opts.annex && G);
          const TT = { stims: 'Détail des stimulations', thermo: 'Détail des thermocoagulations' };
          // analyses quantitatives : jeu prêt pour le rapport (vues, structures) ou, sans vues ni tableaux, ses seules valeurs
          const qItem = q => (G && G.quant || []).find(x => x.id === q.id) || { id: q.id, name: q.name, unit: q.unit, min: q.min, max: q.max, source: q.source, thr: this.quantThreshold ? this.quantThreshold(q) : null, pz: this.quantPZ ? this.quantPZ(q) : null, regions: q.regionTop || null,
            rows: Object.entries(q.values || {}).filter(([, v]) => isFinite(+v)).map(([k, v]) => ({ key: k, value: +v, struct: '', color: '#9aa3b0' })) };
          const QG = this.quantReportGroups ? this.quantReportGroups(ex, ex.quant) : [{ title: '', kind: 'other', sets: ex.quant }], qSets = (g, lv) => g.sets.map(q => R.quantSet(qItem(q), { lv, base })).join('');
          const VIG = { wake: 'veille', nrem: 'sommeil lent', rem: 'sommeil paradoxal', mixed: 'veille et sommeil' };
          // ---- I. implantation : schémas sous le titre, puis électrode par électrode
          job.progress(0.15, 'implantation');
          const byH = { R: els.filter(e => e.hemi === 'R'), L: els.filter(e => e.hemi === 'L') }, notes = ex.elecNotes || {};
          body += chap('s1', 'Implantation et test des plots');
          if (opts.images && this.seegShots && els.length) { const imgs = await this.seegShots({}, SHOT, 'implantation_' + ex.label); body += R.views(imgs, R.slug(base)) + `<p class="m">${this.anatMode === 'patient' && this.patientAnat ? 'Vues sur l’anatomie du patient' : 'Vues sur le gabarit fsaverage'} : une colonne par hémisphère implanté (face latérale en haut, mésiale en miroir en bas) ; à droite, vues inférieure (convention radiologique) et de face.</p>`; }
          for (const hs of ['R', 'L']) { if (!byH[hs].length) continue; body += `<p>${byH[hs].length} électrode${byH[hs].length > 1 ? 's' : ''} profonde${byH[hs].length > 1 ? 's' : ''} ${byH[hs].length > 1 ? 'ont été implantées' : 'a été implantée'} au niveau de l’hémisphère ${hs === 'R' ? 'droit' : 'gauche'} :</p><ol class="elist">${byH[hs].map(e => { const n = notes[e.name] || {}, spec = ex.electrodes.find(s => s.id === e.id) || {}; return `<li><b>${esc(e.name)}</b> <span class="m">${esc(e.model || '')} · ${e.nContacts} plots${spec.real ? '' : ' · position prévue (non localisée sur le scanner)'}</span><ul><li>${esc(n.loc || ranges(e))}</li>${n.act ? `<li>${esc(n.act)}</li>` : ''}</ul></li>`; }).join('')}</ol>`; }
          // ---- II. intercritique, puis ses analyses quantitatives
          job.progress(0.3, 'intercritique');
          const I = ex.inter || {};
          body += `${chap('s2', 'EEG intercritique')}${I.sampling ? `<p class="m">Acquisition : ${esc(I.sampling)}.</p>` : ''}
            ${I.wake || I.sleep ? `<h3>Rythme de fond</h3><ul>${I.wake ? `<li><b>À la veille</b> : ${esc(I.wake)}</li>` : ''}${I.sleep ? `<li><b>Au sommeil</b> : ${esc(I.sleep)}</li>` : ''}</ul>` : ''}${I.physiological ? `<h3>Activités physiologiques</h3><p>${esc(I.physiological)}</p>` : ''}
            ${I.slow ? `<h3>Foyer lent</h3><p>${esc(I.slow)}</p>` : ''}${(I.spikes || []).length ? `<h3>Grapho-éléments transitoires pathologiques</h3><table><tr><th>plots</th><th>description</th><th>V / S</th></tr>${I.spikes.map(s => `<tr><td class="mono">${esc(s.contacts)}</td><td>${esc(s.text)}</td><td>${esc(({ V: 'V', S: 'S', VS: 'V, S' })[s.vig] || '')}</td></tr>`).join('')}</table>` : ''}${I.other ? `<p>${esc(I.other)}</p>` : ''}
            ${!I.wake && !I.sleep && !(I.spikes || []).length && !I.slow ? '<p class="m">—</p>' : ''}${await gal(g => g.kind === 'interictal' || g.kind === 'sleep')}`;
          const QI = QG.filter(g => g.kind === 'inter'), recT = r => `${esc(r.title)}${r.vigil ? ' <span class="m">(' + esc(VIG[r.vigil] || r.vigil) + ')</span>' : ''}`;
          if (QI.length === 1) body += `<h3>Analyses quantitatives — ${recT(QI[0].rec)}</h3>${qSets(QI[0], 4)}`;
          else if (QI.length) body += `<h3>Analyses quantitatives</h3>${QI.map(g => `<h4>${recT(g.rec)}</h4>${qSets(g, 5)}`).join('')}`;
          // imagerie de source : pointes après l'intercritique, début de crise après chaque crise, ou à la synthèse s'il ne se rattache à aucune
          const ES = opts.esi && this.esiReportHtml ? this.esiKept(ex.esi || []) : [], esiH = (L, t, lv) => L.length ? this.esiReportHtml(L, { images: opts.images, base, title: t, lv }) : '';
          body += await esiH(ES.filter(r => r.kind === 'spike'), 'Imagerie de source des pointes intercritiques', 3);
          // ---- III. crises, chacune suivie des analyses de son tracé
          job.progress(0.45, 'crises');
          const szs = S.seizuresOfExploration(d, ex.id), QC = QG.filter(g => g.kind === 'ictal'), usedC = new Set();
          const esiSz = {}, szIds = new Set(szs.map(z => z.id)); for (const sz of szs) esiSz[sz.id] = await esiH(ES.filter(r => r.kind !== 'spike' && r.seizureId === sz.id), 'Imagerie de source du début de crise', 4);
          const esiAgg = await esiH(ES.filter(r => r.kind !== 'spike' && !szIds.has(r.seizureId)), szs.length > 1 ? 'Imagerie de source critique (ensemble des crises)' : 'Imagerie de source critique', 3);
          const szQuant = sz => QC.filter(g => g.rec && g.rec.seizureId === sz.id).map(g => { usedC.add(g); return `<h4>Analyses quantitatives — tracé « ${esc(g.rec.title)} »</h4>${qSets(g, 5)}`; }).join('');
          body += `${chap('s3', 'Crises spontanées')}${szs.length ? '' : '<p class="m">Aucune crise enregistrée.</p>'}`;
          szs.forEach((sz, i) => {
            const Z = sz.seeg || {}, on = Z.onset || {}, by = r => Object.entries(on).filter(([, x]) => x === r).map(([k]) => k), seq = sz.events.slice().sort((a, b) => a.t - b.t).map(e => esc((this.db.signById.get(e.sign_id) || {}).label_fr || e.sign_id) + (e.side ? ' ' + { L: 'G', R: 'D', B: 'bil.' }[e.side] : '')).join(' → ');
            const rg = keys => { const r = [...new Set(keys.map(k => this.contactRegion(k, els)).filter(Boolean))]; return r.length ? ` <span class="m">(${esc(r.join(', '))})</span>` : ''; };
            body += `<h3 class="szband">Crise n°${i + 1}<span class="m">${sz.datetime ? 'le ' + fmtDate(sz.datetime) + (hm(sz.datetime) ? ' à ' + hm(sz.datetime) : '') : ''}${sz.vigilance ? ' (' + esc(V.vigilance[sz.vigilance]) + ')' : ''}</span>${sz.habitual === 'yes' ? '<span class="chip">habituelle</span>' : sz.habitual === 'no' ? '<span class="chip">non habituelle</span>' : ''}${S.ilaeText(S.deriveIlae(sz, this.db)) ? `<span class="chip">${esc(S.ilaeText(S.deriveIlae(sz, this.db)))}</span>` : ''}</h3>
              <p><b>Clinique</b> : ${Z.clinical ? esc(Z.clinical).replace(/\n/g, '<br>') : ''}${opts.sequence && seq ? `${Z.clinical ? '<br>' : ''}<span class="m">séquence saisie : ${seq}</span>` : ''}${!Z.clinical && !seq ? '—' : ''}</p>
              <p><b>Électrique</b> : ${Z.pattern ? esc(V.seegPattern[Z.pattern]) + '. ' : ''}${by('onset').length ? `Début sur ${esc(this.groupContacts(by('onset')).join(', '))}${rg(by('onset'))}. ` : ''}${by('early').length ? `Propagation précoce : ${esc(this.groupContacts(by('early')).join(', '))}${rg(by('early'))}. ` : ''}${by('late').length ? `Propagation tardive : ${esc(this.groupContacts(by('late')).join(', '))}. ` : ''}${Z.electric ? esc(Z.electric).replace(/\n/g, '<br>') : ''}${!Z.pattern && !Object.keys(on).length && !Z.electric ? '—' : ''}</p>${szQuant(sz)}${esiSz[sz.id] || ''}`;
          });
          const QCx = QC.filter(g => !usedC.has(g));
          if (QCx.length) body += `<h3>Tracés de crise non rattachés à une crise saisie</h3>${QCx.map(g => `<h4>Analyses quantitatives — tracé « ${esc(g.rec ? g.rec.title : g.title)} »</h4>${qSets(g, 5)}`).join('')}`;
          const sum = this.onsetSummary(ex);
          if (sum.n > 1) { const keys = Object.keys(sum.contacts).sort((a, b) => (sum.contacts[b].onset - sum.contacts[a].onset) || (sum.contacts[b].early - sum.contacts[a].early)); body += `<h3>Plots impliqués, toutes crises</h3><table><tr><th>plot</th><th>région</th><th>début</th><th>propagation précoce</th><th>tardive</th></tr>${keys.slice(0, 40).map(k => { const c = sum.contacts[k]; return `<tr><td class="mono">${esc(k)}</td><td>${esc(this.contactRegion(k, els))}</td><td>${c.onset || ''}</td><td>${c.early || ''}</td><td>${c.late || ''}</td></tr>`; }).join('')}</table><p class="m">${sum.n} crises analysées.</p>`; }
          body += await gal(g => g.kind === 'ictal' || g.kind === 'postictal');
          // ---- synthèse des crises (EImax, cEImax, PEImax), autres analyses (importées ou saisies)
          const QS = QG.filter(g => g.kind === 'synth'), QO = QG.filter(g => g.kind === 'other');
          if (QS.length || esiAgg) body += chap('s4', 'Synthèse des crises') + (QS.length ? `<p class="m">Valeur maximale de chaque plot parmi les crises choisies (EI : Bartolomei et al. 2008 ; cEI, PEI : Bratu et al. 2025).</p>` + QS.map(g => qSets(g, 3)).join('') : '') + esiAgg;
          if (QO.length) body += chap('s4b', 'Autres analyses quantitatives') + QO.map(g => qSets(g, 3)).join('');
          // ---- stimulations (tableaux détaillés dans le chapitre)
          job.progress(0.6, 'stimulations');
          const st = ex.stims, grp = list => { const g = new Map(); for (const s of list) { const k = `${s.elec}${s.c1}-${s.c2}`; if (!g.has(k)) g.set(k, []); g.get(k).push(s); } return [...g]; };
          const line = ([k, ss]) => `<li><b>${esc(k)}</b> : ${esc([...new Set(ss.map(s => s.clinText).filter(Boolean))].join(', ') || (ss[0].sz ? 'crise' : ss[0].ad ? 'post-décharge' : 'réponse'))} <span class="m">— ${[...new Set(ss.map(s => Q.STIM_MODES[s.mode].fr.toLowerCase()))].join(', ')} à ${[...new Set(ss.map(s => s.mA))].sort((a, b) => a - b).map(v => v.toLocaleString(SV.LOC)).join(', ')} mA${ss.some(s => s.ad && s.adDur) ? ', PD ' + ss.filter(s => s.adDur).map(s => s.adDur + ' s').join(', ') : ''}${(() => { const r = this.contactRegion(ss[0].elec + ss[0].c1, els); return r ? ' · ' + esc(r) : ''; })()}</span></li>`;
          const cat = [['Crises induites par stimulation', st.filter(s => s.sz)], ['Réponses subjectives (sensations rapportées, phénomènes faisant partie des crises)', st.filter(s => s.clin && Q.clinTypeOf(s) === 'subj' && !s.sz)], ['Post-décharges asymptomatiques', st.filter(s => s.ad && !s.clin && !s.sz)], ['Cartographie fonctionnelle (réponses fonctionnelles)', st.filter(s => s.clin && Q.clinTypeOf(s) === 'func' && !s.sz)]];
          body += `${chap('s5', 'Stimulations corticales directes')}${st.length ? cat.map(([t, L], i) => `<h3>${i + 1}. ${t}</h3>${L.length ? `<ul>${grp(L).map(line).join('')}</ul>` : '<p class="m">Aucun(e).</p>'}`).join('') + `<p class="m">${st.length} stimulations · ${new Set(st.map(s => s.elec + s.c1 + '-' + s.c2)).size} paires testées.</p>` : '<p class="m">Pas de stimulation enregistrée.</p>'}${await gal(g => g.kind === 'stim')}`;
          if (anx && G.stims && st.length) body += R.seeg({ stims: G.stims }, { lv: 3, caseName: ex.label, titles: TT });
          // ---- thermocoagulations : le tableau détaillé se suffit ; sans lui, liste des cibles par étape
          job.progress(0.75, 'thermocoagulations');
          const tcBy = st0 => [...new Set(ex.thermo.filter(t => S.thermoStatusOf(t) === st0).map(t => `${t.elec} ${t.c1}-${t.c2}`))], tcD = tcBy('done'), tcV = tcBy('validated'), tcP = tcBy('planned'), tcS = tcBy('rejected'), tcTab = anx && G.thermo && ex.thermo.length;
          body += `${chap('s6', 'Thermocoagulations')}${tcTab ? '' : `${tcD.length ? `<p>Thermocoagulation des plots : ${esc(tcD.join(', '))}.</p>` : ''}${tcV.length ? `<p>Cibles validées par le chirurgien, non encore réalisées : ${esc(tcV.join(', '))}.</p>` : ''}${tcP.length ? `<p class="m">Cibles planifiées : ${esc(tcP.join(', '))}.</p>` : ''}${tcS.length ? `<p class="m">Cibles contre-indiquées (récusées) : ${esc(ex.thermo.filter(t => S.thermoStatusOf(t) === 'rejected').map(t => `${t.elec} ${t.c1}-${t.c2}${t.reason ? ' (' + t.reason + ')' : ''}`).join(', '))}.</p>` : ''}`}${!ex.thermo.length ? '<p class="m">—</p>' : ''}${Rp.thermoAfter ? `<p>${esc(Rp.thermoAfter).replace(/\n/g, '<br>')}</p>` : ''}`;
          if (tcTab) body += R.seeg({ thermo: G.thermo }, { lv: 3, caseName: ex.label, titles: TT });
          // ---- synthèse (zones en régions VEP non reprises pour le moment)
          const filled = FIELDS.filter(([k]) => k !== 'thermoAfter' && (Rp[k] || '').trim());
          body += `<h2 id="s7">Synthèse et conclusion</h2>${Rp.summary ? `<p>${esc(Rp.summary).replace(/\n/g, '<br>')}</p>` : ''}${filled.length ? `<dl class="zones">${filled.map(([k, l]) => `<dt>${esc(l)}</dt><dd>${esc(Rp[k]).replace(/\n/g, '<br>')}</dd>`).join('')}</dl>` : '<p class="m">Rubriques de synthèse à compléter (SEEG › Rapport SEEG).</p>'}`;
          job.progress(0.95, 'mise en page');
          const head = Object.assign(this.brandHead(), { title: `${ex.label} — ${P.pseudo}`, subtitle: 'Compte rendu de monitoring vidéo-SEEG', meta: [`${els.length} électrodes`, `${szs.length} crise${szs.length > 1 ? 's' : ''}`, `${st.length} stimulations`, `${ex.thermo.filter(t => S.thermoStatusOf(t) === 'done').length} thermocoagulations`, this.patientAnat ? 'anatomie du patient' : 'gabarit fsaverage'], foot: 'Compte rendu préparé avec EpiScope à partir des données saisies ; à relire et signer par le médecin responsable.' });
          return R.wrap(head, body);   // sommaire latéral construit dans le document (titres des chapitres et des crises)
        });
        this.download(`SEEG_${(d.patient.pseudo || 'patient')}_${ex.label}`.replace(/[^\w\-]+/g, '_') + '.html', SV.I18n.html(html), 'text/html');
        job.done('Rapport SEEG téléchargé : ouvrez-le puis Imprimer → PDF');
      } catch (e) { console.error(e); job.fail(e.message); }
      finally {
        this._reportBusy = false; this.ctx = null; if (orig) this.openContext(orig, true);
        this.viewer.setLayout(restoreV.layout); restoreV.cfgs.forEach((cfg, i) => this.viewer.setCellConfig(i, cfg, true)); this.viewer.setActive(restoreV.active);
        if (loc0) this.go(loc0);
      }
    },
  };
  Object.assign(SV.app, M);
})(window.SV = window.SV || {});
