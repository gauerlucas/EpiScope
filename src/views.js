/* EpiScope — views.js : vues des étapes du parcours qui ne sont pas l'espace de travail 3D.
 *   Phase 1 / SEEG : liste des crises (par jour), synthèse des crises, EEG de scalp ;
 *   Chirurgie : intervention (gabarit, côté, étendue, histologie, complications) ;
 *   Suivi : évaluations du devenir (Engel, ILAE, recul calculé) ; Dossier : journal complet.              */
(function (SV) {
  'use strict';
  const $ = id => document.getElementById(id), S = SV.Store, V = S.V;
  const esc = SV.U.esc;
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const opts = (map, v) => Object.entries(map).map(([k, l]) => `<option value="${esc(k)}"${String(v) === k ? ' selected' : ''}>${esc(l)}</option>`).join('');
  const fmtDate = s => { if (!s) return ''; const d = new Date(String(s).length <= 10 ? s + 'T12:00:00' : s); return isNaN(d) ? String(s) : d.toLocaleDateString(SV.LOC); };
  const fmtDT = s => { if (!s) return ''; const d = new Date(s); return isNaN(d) ? String(s) : d.toLocaleString(SV.LOC, { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); };

  const M = {
    // ================================================================ crises d'une exploration
    renderSeizureListView(box, st) {
      const d = this.dossier, ex = st.obj, all = S.seizuresOfExploration(d, ex.id), hab = all.filter(z => z.habitual === 'yes').length, seeg = ex.kind === 'seeg';
      box.innerHTML = `<div class="scr-inner wide"><div class="view-head"><h3>Crises · ${esc(ex.label)}</h3><span class="muted">${all.length} crise${all.length > 1 ? 's' : ''}${hab ? `, ${hab} habituelle${hab > 1 ? 's' : ''}` : ''}</span><span class="spacer"></span><button id="vsSz" class="primary" title="nouvelle crise de cette exploration">+ Crise</button><button id="vsMore" class="mini-btn" title="autres actions : rattacher une crise rapportée, types de crises">⋯</button></div>
        <div class="muted small ov-line">${esc([ex.start && 'du ' + new Date(ex.start + 'T12:00').toLocaleDateString(SV.LOC), ex.end && 'au ' + new Date(ex.end + 'T12:00').toLocaleDateString(SV.LOC), ex.center].filter(Boolean).join(' ') || 'dates à renseigner')} · <a href="#" data-a="ov">dates, centre, notes : Vue d’ensemble</a></div>
        ${(() => { const bad = all.map((z, i) => [z, i + 1]).filter(([z, k]) => /^Crise \d+$/.test(String(z.label || '').trim()) && z.label !== 'Crise ' + k); return bad.length ? `<div class="note" id="vsRenum">Les titres « Crise n » ne suivent pas l’ordre chronologique (dates et heures) : ${bad.map(([z, k]) => `${esc(z.label)} → Crise ${k}`).join(', ')}. <button class="mini-btn primary" data-a="renum">Renuméroter par date</button></div>` : ''; })()}
        <div id="vsAnn"></div><div id="vsSessions"></div>
        ${seeg ? '' : '<div class="sub-h">EEG critique <small class="muted">pour l’ensemble des crises de cette exploration</small></div><div class="eeg-grid ictal" id="vsIctal"></div>'}</div>`;
      box.querySelector('.ov-line [data-a=ov]').onclick = e => { e.preventDefault(); this.go({ stage: st.key, view: 'apercu' }); };
      // types de crises (v5.1) : regroupent les crises pour la synthèse (ex. « crises gélastiques », « crises hypermotrices »)
      ex.szTypes = ex.szTypes || [];
      const typeSel = sz => `<select data-z="typeId" title="type de crise (regroupement pour la synthèse)"><option value="">—</option>${ex.szTypes.map(t => `<option value="${t.id}"${sz.typeId === t.id ? ' selected' : ''}>${esc(t.label)}</option>`).join('')}<option value="+">+ type…</option></select>`;
      $('vsSz').onclick = () => this.newSeizureIn(ex);
      $('vsMore').onclick = e => { const r = e.currentTarget.getBoundingClientRect(); const rep0 = S.reportedSeizures(d); this.popupMenu([{ label: `Rattacher une crise rapportée du dossier…${rep0.length ? ' (' + rep0.length + ')' : ''}`, disabled: !rep0.length, run: () => this.attachReportedSeizure(ex, () => this.renderSeizureListView(box, st)) }, { label: 'Types de crises…', run: () => this.szTypesDialog(ex, () => this.renderSeizureListView(box, st)) }], Math.min(r.left, window.innerWidth - 380), r.bottom + 4); };
      const rn = box.querySelector('#vsRenum [data-a=renum]'); if (rn) rn.onclick = () => { const n = S.renumberSeizures(d, ex.id); this.touch('exploration', ex.id, 'crises renumérotées par date'); this.toast(`${n} crise${n > 1 ? 's' : ''} renumérotée${n > 1 ? 's' : ''} dans l’ordre chronologique`, 3000); this.updateCrumbs && this.updateCrumbs(); this.renderSubbar && this.renderSubbar(); this.renderSeizureListView(box, st); };
      // v2.0.0 : plus de séances — crises regroupées par jour (J1, J2…), d'après leur date
      const sb = $('vsSessions'), days = S.seizureDays(d, ex.id), one = days.length <= 1;
      if (!days.length) sb.innerHTML = '<div class="card"><div class="hint">Aucune crise. « + Crise » en ajoute une ; une crise rapportée du dossier (vidéo familiale…) se rattache par « ⋯ ».</div></div>';
      // médias liés à une crise : vidéos et captures (galerie), tracé SEEG, jeux d'analyse
      const recOf = sz => (ex.recordings || []).find(r => r.seizureId === sz.id || (r.bySz && r.bySz[sz.id]));
      const media = sz => { const g = (d.gallery || []).filter(x => x.seizureId === sz.id), nv = g.filter(x => /^video\//.test(x.mime || '')).length, nc = g.length - nv, nq = seeg ? (ex.quant || []).filter(q => q.seizureId === sz.id).length : 0;
        return [nv && `▶ ${nv} vidéo${nv > 1 ? 's' : ''}`, nc && `▣ ${nc} capture${nc > 1 ? 's' : ''}`, nq && `∑ ${nq} analyse${nq > 1 ? 's' : ''}`].filter(Boolean).join(' · '); };
      const dayLbl = dy => dy.day ? `${dy.n != null && dy.n > 0 ? 'J' + dy.n + ' · ' : ''}${new Date(dy.day + 'T12:00').toLocaleDateString(SV.LOC, { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}` : 'date inconnue';
      for (const dy of days) {
        const list = dy.seizures, c = h('div', 'card session' + (one ? ' one' : ''));
        // un seul jour : pas d'en-tête ; plusieurs : en-tête du jour (J1, J2…)
        c.innerHTML = `${one ? '' : `<div class="ses-h"><b>${esc(dayLbl(dy))}</b><span class="muted small">${list.length} crise${list.length > 1 ? 's' : ''}</span><span class="spacer"></span></div>`}
          <table class="sz-table">${list.map(sz => {
            const il = S.ilaeText(S.deriveIlae(sz, this.db)), evs = sz.events.slice().sort((a, b) => a.t - b.t), first = evs.slice(0, 4).map(e => (this.db.signById.get(e.sign_id) || {}).label_fr || e.sign_id).join(' → ');
            const on = seeg && sz.seeg && sz.seeg.onset ? Object.entries(sz.seeg.onset).filter(([, r]) => r === 'onset').map(([k]) => k) : [];
            return `<tr data-id="${sz.id}" class="click${this.ctx && this.ctx.seizureId === sz.id ? ' cur' : ''}"><td><b>${esc(sz.label)}</b></td><td><input type="datetime-local" data-z="datetime" value="${esc(sz.datetime ? (sz.datetime.length <= 10 ? sz.datetime + 'T00:00' : sz.datetime.slice(0, 16)) : '')}"></td><td><select data-z="habitual">${opts(V.habitual, sz.habitual)}</select></td><td><select data-z="vigilance">${opts(V.vigilance, sz.vigilance)}</select></td><td>${typeSel(sz)}</td><td class="seq">${esc(first) || '<i class="muted">aucun signe</i>'}${evs.length > 4 ? ' …' : ''}<small>${esc(il)}</small>${on.length ? `<small class="onset">début SEEG : ${esc(on.join(', '))}</small>` : ''}${media(sz) ? `<small class="media">${esc(media(sz))}</small>` : ''}${recOf(sz) ? `<button class="mini-btn sz-trace" data-a="trace" title="Ouvrir le tracé « ${esc(recOf(sz).title)} » au début de la crise">〰 tracé</button>` : ''}</td><td class="sz-st">${this.szStatusHtml ? this.szStatusHtml(sz, ex) : esc(evs.length + ' signes')}</td><td class="nowrap"><button class="mini-btn primary" data-a="open">ouvrir</button><button class="mini-btn" data-a="more" title="reprendre la sémiologie d’une autre crise, supprimer…">⋯</button></td></tr>`; }).join('') || '<tr><td class="hint">Aucune crise ce jour.</td></tr>'}</table>`;
        c.querySelectorAll('tr[data-id]').forEach(tr => {
          const sz = S.byId(d.seizures, tr.dataset.id);
          tr.onclick = e => { if (e.target.closest('input,select,button')) return; this.openSeizure(sz.id); };
          tr.querySelector('[data-a=open]').onclick = () => this.openSeizure(sz.id);
          const tb = tr.querySelector('[data-a=trace]'); if (tb) tb.onclick = async () => { const r = recOf(sz); if (r.seizureId !== sz.id && this.ieegSetSeizure) this.ieegSetSeizure(r, sz.id); await this.recOpenAt(r, r.marks && r.marks.onset); };
          const rm = () => { if (!confirm(`Supprimer « ${sz.label} » (signes : ${sz.events.length}) ? (corbeille du dossier : restaurable)`)) return; const cur = this.ctx && this.ctx.seizureId === sz.id; S.remove(d, 'seizure', sz.id); if (cur) this.openContext({ explorationId: ex.id }, true); this.touch(); this.renderSeizureListView(box, st); };
          tr.querySelector('[data-a=more]').onclick = e => { const r = e.currentTarget.getBoundingClientRect(); this.popupMenu([{ head: sz.label }, { label: 'Reprendre la sémiologie de…', run: () => setTimeout(() => this.szCopyMenu(sz, r, () => this.renderSeizureListView(box, st)), 0) }, { sep: true }, { label: 'Supprimer la crise…', danger: true, run: rm }], Math.min(r.left, window.innerWidth - 300), r.bottom + 4); };
          tr.querySelectorAll('[data-z]').forEach(el => el.onchange = () => { if (el.dataset.z === 'typeId' && el.value === '+') { el.value = sz.typeId || ''; const l = prompt('Nouveau type de crise (ex. crises gélastiques) :'); if (!l || !l.trim()) return; const t = { id: S.uid('T'), label: l.trim() }; ex.szTypes.push(t); sz.typeId = t.id; this.touch('exploration', ex.id, 'type de crise ' + t.label); this.renderSeizureListView(box, st); return; }
            sz[el.dataset.z] = el.value; this.touch('seizure', sz.id, sz.label); if (el.dataset.z === 'datetime' && S.renumberSeizures && S.renumberSeizures(d, ex.id)) { this.toast('Titres « Crise n » renumérotés dans l’ordre chronologique', 3000); this.updateCrumbs && this.updateCrumbs(); this.renderSeizureListView(box, st); } });
        });
        sb.appendChild(c);
      }
      if (this.renderAnnotatedCard) this.renderAnnotatedCard($('vsAnn'), ex, () => this.renderSeizureListView(box, st));
      if ($('vsIctal') && this.eegPart) this.eegPart($('vsIctal'), ex, 'ictal');
    },
    /** types de crises d'une exploration : nom, ordre ; retirer un type le retire des crises */
    szTypesDialog(ex, after) {
      ex.szTypes = ex.szTypes || []; const d = this.dossier, m = h('div', 'modal'), card = h('div', 'modal-card'); m.appendChild(card); document.body.appendChild(m);
      const draw = () => {
        card.innerHTML = `<div class="modal-head"><span>Types de crises · ${esc(ex.label)}</span><button class="close">✕</button></div><div class="help"><div class="hint">Un type regroupe des crises de même allure pour la synthèse (consensus, présentation).</div>
          ${ex.szTypes.map((t, i) => `<div class="row-line" data-i="${i}"><input value="${esc(t.label)}"><span class="muted small">${S.seizuresOfExploration(d, ex.id).filter(z => z.typeId === t.id).length} crise(s)</span><span class="spacer"></span><b class="x" data-rm="${i}">✕</b></div>`).join('') || '<div class="muted">aucun type</div>'}
          <button class="mini-btn" data-a="add">+ type</button></div><div class="modal-foot"><button class="primary ok">OK</button></div>`;
        card.querySelectorAll('[data-i] input').forEach(inp => inp.oninput = () => { ex.szTypes[+inp.closest('[data-i]').dataset.i].label = inp.value; });
        card.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { const t = ex.szTypes.splice(+b.dataset.rm, 1)[0]; for (const z of S.seizuresOfExploration(d, ex.id)) if (z.typeId === t.id) z.typeId = ''; draw(); });
        card.querySelector('[data-a=add]').onclick = () => { ex.szTypes.push({ id: S.uid('T'), label: 'Type ' + String.fromCharCode(65 + ex.szTypes.length) }); draw(); };
        card.querySelector('.close').onclick = card.querySelector('.ok').onclick = () => { ex.szTypes = ex.szTypes.filter(t => t.label.trim()); m.remove(); this.touch('exploration', ex.id, 'types de crises'); if (after) after(); };
      };
      draw();
    },

    // ================================================================ synthèse des crises d'une exploration
    renderSzSynthesisView(box, st) {
      // v5.1 : synthèse par type de crise (toutes, ou un type), puis synthèse écrite et conclusion de l'exploration
      const d = this.dossier, ex = st.obj, types = (ex.szTypes || []).filter(t => S.seizuresOfExploration(d, ex.id).some(z => z.typeId === t.id)), ui = this.ui.synType = this.ui.synType || {}, ty = types.some(t => t.id === ui[ex.id]) ? ui[ex.id] : '';
      const seizures = S.seizuresOfExploration(d, ex.id).filter(z => z.events.length && (!ty || z.typeId === ty)).map(sz => ({ sz, ex }));
      const scope = { ids: [ex.id], seizures, explorations: [ex] }, cons = this.consensus(scope);
      box.innerHTML = `<div class="scr-inner wide"><div class="view-head"><h3>Synthèse · ${esc(ex.label)}</h3><span class="muted">${cons.n} crise${cons.n > 1 ? 's' : ''} avec sémiologie · crises habituelles comptées double</span>${types.length ? `<span class="seg syn-ty"><button data-ty="" class="${ty ? '' : 'on'}">toutes les crises</button>${types.map(t => `<button data-ty="${t.id}" class="${ty === t.id ? 'on' : ''}">${esc(t.label)}</button>`).join('')}</span>` : ''}</div>
        <div class="syn-grid"><div class="card" id="vsyn"></div><div class="card" id="vsynT"></div></div><div class="card syn-viz-card" id="vsynV"></div>
        ${ex.kind !== 'seeg' ? '<div class="sub-h">Synthèse et conclusion <small class="muted">reprises au staff et dans les rapports</small></div><div class="eeg-grid synth" id="vsynCR"></div>' : ''}</div>`;
      box.querySelectorAll('[data-ty]').forEach(b => b.onclick = () => { ui[ex.id] = b.dataset.ty; this.renderSzSynthesisView(box, st); });
      if ($('vsynCR') && this.eegPart) this.eegPart($('vsynCR'), ex, 'synth');
      const a = $('vsyn');
      if (!cons.n) { a.innerHTML = '<div class="hint">Aucune crise saisie dans cette exploration.</div>'; $('vsynT').remove(); $('vsynV').remove(); return; }
      if (this.renderSynthViz) this.renderSynthViz($('vsynV'), cons);
      const pL = Math.round(cons.pL * 100), top = []; for (let i = 1; i < this.atlas.N; i++) if (cons.region[i] >= 0.2) top.push(i); top.sort((x, y) => cons.region[y] - cons.region[x]);
      a.innerHTML = `<div class="card-h">Latéralisation et origines</div><div class="lat-bar"><span class="L" style="width:${pL}%">G ${pL} %</span><span class="R" style="width:${100 - pL}%">D ${100 - pL} %</span></div>
        <div class="small muted" style="margin:8px 0 2px">Origines candidates (consensus)</div>${top.slice(0, 8).map(i => this.regionRow(i, cons.region[i], '')).join('')}
        <div class="small muted" style="margin:10px 0 2px">Hypothèses récurrentes du modèle</div>${cons.hyps.slice(0, 5).map(x => `<div class="row-line"><b>${esc(x.name)}</b> ${x.hemi === 'L' ? 'gauche' : 'droit'} <span class="muted">H1 dans ${x.top}/${cons.n} crise${cons.n > 1 ? 's' : ''}, présente dans ${x.n}</span></div>`).join('')}`;
      this.bindRows(a);
      $('vsynT').innerHTML = `<div class="card-h">Crises</div><table class="sz-table"><tbody>${seizures.map(({ sz }) => `<tr class="click" data-id="${sz.id}"><td><b>${esc(sz.label)}</b>${sz.habitual === 'yes' ? ' <span class="badge ok">habituelle</span>' : ''}</td><td class="muted">${esc(fmtDT(sz.datetime))}${sz.vigilance ? ' · ' + esc(V.vigilance[sz.vigilance]) : ''}</td><td class="seq">${sz.events.slice().sort((p, q) => p.t - q.t).map(e => esc((this.db.signById.get(e.sign_id) || {}).label_fr || e.sign_id) + (e.side ? ' <i>' + { L: 'G', R: 'D', B: 'bil' }[e.side] + '</i>' : '')).join(' → ')}<small>${esc(S.ilaeText(S.deriveIlae(sz, this.db)))}</small></td></tr>`).join('')}</tbody></table>${this.signMatrix(cons)}`;
      $('vsynT').querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => this.openSeizure(tr.dataset.id));
    },

    // ================================================================ journal
    renderJournalView(box) {
      const d = this.dossier, act = { create: 'création', add: 'ajout', edit: 'modification', remove: 'suppression (corbeille)', revise: 'nouvelle version', import: 'import', compute: 'calcul', restore: 'restauration', purge: 'corbeille vidée' };
      box.innerHTML = `<div class="scr-inner"><div class="view-head"><h3>Journal</h3><span class="muted">${(d.journal || []).length} entrées · qui a modifié quoi, quand (regroupé par 10 min)</span></div><div class="card journal">${(d.journal || []).slice().reverse().map(j => `<div><span class="muted">${esc(fmtDT(j.t))}${j.user ? ' · ' + esc(j.user) : ''}</span> ${esc(act[j.action] || j.action)} ${esc(j.text || j.kind)}${j.n > 1 ? ' <small>×' + j.n + '</small>' : ''}</div>`).join('') || '<div class="hint">—</div>'}</div></div>`;
      if (this.renderSafetyCards) this.renderSafetyCards(box.querySelector('.scr-inner .view-head') ? box.querySelector('.scr-inner') : box);
    },

    // ================================================================ intervention
    renderProcedureView(box, st) {
      const d = this.dossier, p = st.obj, dec = d.decisions.find(x => x.procedureId === p.id), m = dec && S.byId(d.meetings, dec.meetingId);
      box.innerHTML = `<div class="scr-inner wide"><div class="view-head"><h3>${esc(V.procedure[p.type])}</h3><span class="muted">${p.date ? fmtDate(p.date) : 'date à fixer'}${m ? ' · décidée au staff du ' + fmtDate(m.date) : ''}</span><span class="spacer"></span><button class="mini-btn" id="vpOut">+ évaluation du devenir</button><button class="mini-btn danger" id="vpDel">supprimer</button></div><div class="card" id="vpCard"></div>
        <div class="card"><div class="card-h">Coupes IRM <span class="muted small">régions de l’intervention sur le T1 du patient ; IRM post-opératoire associée : superposition pré / post</span></div><div class="surg-slices" id="vpSlices"></div></div>
        <div class="card"><div class="card-h">Après l’intervention</div><div class="hint">IRM post-opératoire : importée dans Dossier › Imagerie (temps « post-opératoire »), recalée, puis choisie ci-dessus (Coupes IRM) ; devenir : étape « Suivi ».</div><div id="vpOuts"></div></div></div>`;
      const c = $('vpCard');
      c.innerHTML = `<div class="form grid2"><label>Type <select data-f="type">${opts(V.procedure, p.type)}</select></label><label>Date <input type="date" data-f="date" value="${esc(p.date)}"></label>
        <label>Côté <select data-f="side">${opts({ '': '—', L: 'gauche', R: 'droit' }, p.side)}</select></label><label>Description <input data-f="target" value="${esc(p.target)}" placeholder="ex. corticectomie operculaire"></label>
        <div class="span2 rp"></div><div class="span2 hb"></div><label class="span2">Complications <input data-f="complications" value="${esc(p.complications)}"></label>
        <label class="span2">Notes <textarea data-f="notes" rows="2">${esc(p.notes || '')}</textarea></label></div>`;
      if (this.histologyField) c.querySelector('.hb').replaceWith(this.histologyField(p, () => this.touch('procedure', p.id, 'histologie')));   // v2.1.0 : vocabulaire fermé + texte libre
      if (this.resectionCard && !['rftc', 'neuromod'].includes(p.type)) {   // v2.1.0 : contacts dans la résection, cavité ; v3.2.0 : coupes à côté des contacts
        const rc = this.resectionCard(p, { slices: true }); c.after(rc); const sl = $('vpSlices'), card = sl && sl.closest('.card'), side = rc.querySelector('.rs-side');
        if (sl && side) { side.innerHTML = '<div class="rs-side-h"><b>Coupes IRM</b> <span class="muted small">calques : régions cibles de l’intervention, volume de résection segmenté</span></div>'; side.appendChild(sl); if (card) card.remove(); }
      }
      const hy = S.latestHypotheses(d).filter(H => ['confirmed', 'testing', 'proposed'].includes(H.status));
      const changed = () => { this.touch('procedure', p.id, V.procedure[p.type]); clearTimeout(this._vpSl); this._vpSl = setTimeout(() => { if (this.slices && this._ipHost && this._ipHost.closest('#vpSlices')) { this._slvSurg = { regions: p.regions, extent: p.extent, hyps: hy, proc: p }; this.updateImagingLayers(); } }, 300); };   // régions peintes sur les coupes mises à jour
      if (this.surgeryEditor && ['resection', 'lobectomy', 'litt', 'disconnection', 'other'].includes(p.type)) c.querySelector('.rp').appendChild(this.surgeryEditor(p, hy, changed, 'procedure'));
      else c.querySelector('.rp').appendChild(this.regionPicker(p.regions, changed));
      this.bindFields(c, p, 'procedure', k => { if (k === 'date' || k === 'type') { this.renderParcours(); this.renderSubbar(); } if (k === 'type') this.renderProcedureView(box, this.stageByKey(st.key)); });
      $('vpDel').onclick = () => { if (!confirm('Supprimer cette procédure ?')) return; S.remove(d, 'procedure', p.id); this.touch(); this.go({ stage: 'dossier' }); };
      $('vpOut').onclick = () => { S.addOutcome(d, { procedureId: p.id }); this.touch(); this.go({ stage: 'followup' }); };
      // v5.2 : coupes du T1 avec les régions opérées, IRM post-opératoire associée (redessinées quand les régions changent)
      const slices = () => this.mountSurgerySlices && this.mountSurgerySlices($('vpSlices'), { key: 'proc:' + p.id, regions: p.regions, extent: p.extent, hyps: hy, proc: p });
      slices();
      const outs = d.outcomes.filter(o => S.outcomeProcedure(d, o) === p);
      $('vpOuts').innerHTML = outs.map(o => `<div class="row-line">${fmtDate(o.date)} : Engel <b>${esc(o.engel || '?')}</b> · ILAE <b>${esc(o.ilae || '?')}</b> · ${S.outcomeMonths(d, o)} mois</div>`).join('');
    },

    // ================================================================ suivi
    renderFollowupView(box) {
      const d = this.dossier;
      box.innerHTML = `<div class="scr-inner"><div class="view-head"><h3>Suivi</h3><span class="muted">devenir après l’intervention : recul calculé de la date de l’intervention à celle de l’évaluation (modifiable)</span><span class="spacer"></span><button class="primary" id="vfAdd">+ évaluation</button></div><div class="card" id="vfList"></div><div class="card" id="vfExams"></div></div>`;
      // bilans de suivi (neuropsychologie, imagerie post-opératoire…) : rangés avec les autres bilans du dossier
      const pd = d.procedures.map(p => p.date).filter(Boolean).sort()[0] || '';
      if (this.renderExamsView) this.renderExamsView($('vfExams'), { embed: true, title: 'Bilans de suivi', intro: 'neuropsychologie, imagerie post-opératoire… — rangés avec les autres bilans du dossier', filter: x => x.phase === 'postop' || (!!pd && !!x.date && String(x.date) > String(pd)), defaults: { phase: 'postop', date: S.today() }, empty: 'Aucun bilan de suivi : « + Bilan » (neuropsychologie post-opératoire, IRM post-opératoire, EEG de contrôle…).' });
      $('vfAdd').onclick = () => { const p = d.procedures.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).pop(); S.addOutcome(d, { procedureId: p ? p.id : null }); this.touch(); this.renderDxOutcomes($('vfList')); this.renderParcours(); };
      this.renderDxOutcomes($('vfList'));
    },
  };
  Object.assign(SV.app, M);
})(window.SV = window.SV || {});
