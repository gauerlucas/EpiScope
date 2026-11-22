/* EpiScope — phase_overview.js (v2.0.0) : onglet « Vue d'ensemble » d'une exploration (phase 1, SEEG, EEG ambulatoire,
 * vidéo-EEG post-opératoire…). Premier onglet de chaque exploration : ce qu'elle est (dates, centre, statut, notes), une
 * frise des jours (tracés importés et crises placés à l'heure réelle), la liste des crises et celle des tracés, et où en est
 * le compte rendu. Rien n'y est calculé qui ne soit ailleurs : S.explorationOverview (store.js, sans DOM) fournit la frise. */
(function (SV) {
  'use strict';
  const $ = id => document.getElementById(id), S = SV.Store, V = S.V, esc = SV.U.esc;
  const ms = iso => { const t = iso ? Date.parse(String(iso).slice(0, 19) + 'Z') : NaN; return isNaN(t) ? null : t; };
  const hm = iso => iso ? String(iso).slice(11, 16) : '';
  const dmy = day => day ? new Date(day + 'T12:00').toLocaleDateString(SV.LOC, { weekday: 'short', day: '2-digit', month: '2-digit' }) : '';
  const dur = s => { s = Math.round(s || 0); if (!s) return ''; const h = Math.floor(s / 3600), m = Math.round(s % 3600 / 60); return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`; };
  const VIG = { wake: 'veille', nrem: 'sommeil', rem: 'sommeil paradoxal', mixed: 'veille et sommeil' };

  const M = {
    /** vue d'ensemble de l'exploration st.obj */
    renderExplorationOverview(box, st) {
      const d = this.dossier, ex = st.obj, O = S.explorationOverview(d, ex), szs = S.seizuresOfExploration(d, ex.id), seeg = ex.kind === 'seeg';
      const kindLbl = ex.kind === 'other' && ex.context ? V.explorationContext[ex.context] : V.exploration[ex.kind];
      const recs = ex.recordings || [], gal = (d.gallery || []).filter(g => g.explorationId === ex.id), nVid = gal.filter(g => /^video\//.test(g.mime || '')).length;
      const desc = szs.filter(z => z.events.length).length, hab = szs.filter(z => z.habitual === 'yes').length;
      // où en est le compte rendu (EEG de scalp : fond, intercritique, critique, conclusion)
      const E = ex.eeg || {}, cr = seeg ? [] : [['background', 'rythme de fond'], ['interictal', 'intercritique'], ['ictal', 'critique'], ['conclusion', 'conclusion']].map(([k, l]) => `<span class="ov-st${String(E[k] || '').trim() ? ' ok' : ''}">${String(E[k] || '').trim() ? '✓' : '·'} ${l}</span>`).join('');
      box.innerHTML = `<div class="scr-inner wide ov">
        <div class="view-head"><h3>Vue d’ensemble · ${esc(ex.label)}</h3><span class="muted">${esc(kindLbl || '')}</span></div>
        <div class="card"><div class="form row4 ex-form">
            <label>Libellé <input data-f="label" value="${esc(ex.label)}"></label><label>Début <input type="date" data-f="start" value="${esc(ex.start || '')}"></label>
            <label>Fin <input type="date" data-f="end" value="${esc(ex.end || '')}"></label><label>Centre <input data-f="center" value="${esc(ex.center || '')}"></label>
            <label>Statut <select data-f="status">${Object.entries(V.explorationStatus).map(([k, l]) => `<option value="${k}"${(ex.status || 'ongoing') === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label></div>
          <div class="form"><label>Notes <textarea class="grow" data-f="notes" rows="2" placeholder="déroulement, sevrage, incidents…">${esc(ex.notes || '')}</textarea></label></div>
          <div class="ov-nums"><span>Crises : <b>${szs.length}</b>${szs.length ? ` <span class="muted">(habituelles : ${hab} ; décrites : ${desc})</span>` : ''}</span><span>Tracés : <b>${recs.length}</b></span><span>Vidéos : <b>${nVid}</b></span>${seeg ? `<span>Électrodes : <b>${(ex.electrodes || []).length}</b></span>` : ''}${cr ? `<span class="ov-cr">Compte rendu : ${cr}</span>` : ''}</div></div>
        <div class="card"><div class="card-h">Frise <span class="muted">tracés et crises à l’heure réelle</span></div><div id="ovTl"></div></div>
        <div class="ov-cols"><div class="card"><div class="card-h">Crises<span class="spacer"></span><button class="mini-btn" data-go="crises">onglet Crises ›</button></div><div id="ovSz"></div></div>
          <div class="card"><div class="card-h">Tracés importés<span class="spacer"></span><button class="mini-btn" data-go="analyses">onglet Analyses ›</button></div><div id="ovRec"></div></div></div></div>`;
      this.bindFields(box.querySelector('.card'), ex, 'exploration', k => { if (['start', 'end', 'label', 'status'].includes(k)) { this.renderParcours(); this.renderSubbar(); if (k !== 'label' && k !== 'status') this.renderExplorationOverview(box, st); } });
      box.querySelectorAll('[data-go]').forEach(b => b.onclick = () => this.go({ stage: st.key, view: b.dataset.go }));
      // crises
      $('ovSz').innerHTML = szs.length ? `<table class="ov-t">${szs.map(z => { const g = (d.gallery || []).filter(x => x.seizureId === z.id), v = g.filter(x => /^video\//.test(x.mime || '')).length, r = recs.some(x => x.seizureId === z.id || (x.bySz && x.bySz[z.id]));
        return `<tr data-sz="${z.id}"><td><b>${esc(z.label)}</b>${z.origin === 'reported' ? ' <span class="muted small" title="saisie comme crise rapportée (dossier)">rapportée</span>' : ''}</td><td>${esc(String(z.datetime || '').replace('T', ' '))}</td><td>${esc(V.habitual[z.habitual] || '')}</td>
          <td class="small">${z.events.length ? `${z.events.length} signe${z.events.length > 1 ? 's' : ''}` : '<span class="warn">non décrite</span>'}</td><td class="small muted">${[v && '▶ ' + v, r && '〰 tracé'].filter(Boolean).join(' · ')}</td><td><button class="mini-btn" data-a="open">ouvrir</button></td></tr>`; }).join('')}</table>`
        : '<div class="hint">Aucune crise. « onglet Crises › » pour en ajouter ou rattacher une crise rapportée du dossier.</div>';
      $('ovSz').querySelectorAll('tr[data-sz]').forEach(tr => tr.querySelector('[data-a=open]').onclick = () => this.openSeizure(tr.dataset.sz));
      // tracés
      const ri = new Map(O.recs.map(r => [r.id, r]));
      $('ovRec').innerHTML = recs.length ? `<table class="ov-t">${recs.slice().sort((a, b) => String((ri.get(a.id) || {}).t0 || '~').localeCompare(String((ri.get(b.id) || {}).t0 || '~'))).map(r => { const o = ri.get(r.id) || {}, I = this.recInfo ? this.recInfo(r) : {};
        return `<tr><td>${esc(r.title || '')}</td><td>${o.t0 ? esc(o.t0.slice(0, 16).replace('T', ' ')) : '<span class="muted">heure inconnue</span>'}</td><td>${dur(r.duration)}</td><td class="small">${I.ict ? 'crise' + (I.inter ? ' + intercritique' : '') : 'intercritique'}</td><td class="small muted">${esc(VIG[I.vig] || '')}</td></tr>`; }).join('')}</table>`
        : '<div class="hint">Aucun tracé importé. Les tracés s’importent dans l’onglet Analyses (EDF, BrainVision, BIDS).</div>';
      this.ovTimeline($('ovTl'), ex, O, st);
      // v2.0.0 : crises annotées dans les fichiers sans fiche, tracés qui se recouvrent
      const ann = SV.IEEG && SV.IEEG.seizureEvents ? S.annotatedSeizures(d, ex, SV.IEEG.seizureEvents).filter(x => x.state === 'free' || x.state === 'match') : [], ov = S.recordingOverlaps(ex);
      if (ann.length || ov.length) { const n = document.createElement('div'); n.className = 'note small'; n.innerHTML = [ann.length && `Crises annotées dans les tracés, sans fiche ou à rattacher : ${ann.length}. <a href="#" data-go2="crises">onglet Crises</a>`, ov.length && `Tracés qui se recouvrent : ${ov.length} (une crise n’y est comptée qu’une fois).`].filter(Boolean).join('<br>'); $('ovTl').appendChild(n); const a2 = n.querySelector('[data-go2]'); if (a2) a2.onclick = e => { e.preventDefault(); this.go({ stage: st.key, view: 'crises' }); }; }
    },
    /** frise : un jour par colonne (J1, J2…) ; tracés en bandes (critique / intercritique), crises en losanges (pleins : décrites) */
    ovTimeline(el, ex, O, st) {
      if (!O.t0 || !O.t1 || !O.days.length) { el.innerHTML = '<div class="hint">Renseignez la date de début (et de fin) de l’exploration, ou importez un tracé daté, pour afficher la frise.</div>'; return; }
      const W = 1000, padL = 70, padR = 10, H = 96, T0 = ms(O.days[0].day + 'T00:00:00'), T1 = ms(O.days[O.days.length - 1].day + 'T23:59:59') + 1000, X = t => padL + (W - padL - padR) * (t - T0) / (T1 - T0);
      let s = `<svg class="ov-tl" viewBox="0 0 ${W} ${H}" width="100%">`;
      O.days.forEach((dy, i) => { const x0 = X(ms(dy.day + 'T00:00:00')), x1 = X(ms(dy.day + 'T00:00:00') + 864e5); s += `<rect x="${x0.toFixed(1)}" y="0" width="${(x1 - x0).toFixed(1)}" height="${H}" class="ov-day${i % 2 ? ' odd' : ''}"/><text x="${((x0 + x1) / 2).toFixed(1)}" y="12" class="ov-dl">${dy.n > 0 ? 'J' + dy.n : ''}</text><text x="${((x0 + x1) / 2).toFixed(1)}" y="${H - 4}" class="ov-dd">${esc(dmy(dy.day))}</text>`; });
      s += `<text x="4" y="40" class="ov-lane">Tracés</text><text x="4" y="70" class="ov-lane">Crises</text>`;
      for (const r of O.recs) { const a = ms(r.t0), b = ms(r.t1); if (a == null) continue; const x0 = X(a), x1 = Math.max(x0 + 2, X(b == null ? a : b)); s += `<rect x="${x0.toFixed(1)}" y="30" width="${(x1 - x0).toFixed(1)}" height="14" rx="2" class="ov-rec ${r.kind === 'ictal' ? 'ict' : 'int'}"><title>${esc(r.title)} · ${esc(hm(r.t0))}–${esc(hm(r.t1))}</title></rect>`; }
      const undated = [], away = []; for (const z of O.seizures) {
        if (z.outside) { away.push(z); continue; } let t = ms(z.t); if (t == null && z.date) t = ms(z.date + 'T12:00:00'); if (t == null) { undated.push(z); continue; }
        const x = X(t); s += `<g class="ov-sz${z.events ? ' on' : ''}" data-sz="${z.id}"><path d="M${x.toFixed(1)} 58 l6 8 l-6 8 l-6 -8 z"/><title>${esc(z.label)}${z.t ? ' · ' + esc(hm(z.t)) : ''}${z.events ? '' : ' · non décrite'}</title></g>`;
      }
      el.innerHTML = s + '</svg>' + (undated.length ? `<div class="hint small">Sans date : ${undated.map(z => esc(z.label)).join(', ')}</div>` : '') + (away.length ? `<div class="hint small">Hors de la période de l’exploration : ${away.map(z => `${esc(z.label)} (${esc(z.date || '?')})`).join(', ')}</div>` : '') + '<div class="ov-leg small muted"><i class="ov-k ict"></i> tracé avec crise <i class="ov-k int"></i> tracé intercritique <span class="ov-kd on">◆</span> crise décrite <span class="ov-kd">◇</span> crise à décrire</div>';
      el.querySelectorAll('.ov-sz').forEach(g => g.onclick = () => this.openSeizure(g.dataset.sz));
    },
  };
  Object.assign(SV.app, M);
})(window.SV = window.SV || {});
