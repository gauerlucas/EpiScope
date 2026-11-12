/* EpiScope — seizure_info.js (v5.5) : fiche d'une crise (date et heure, habituelle, vigilance, facteur déclenchant, tracé
 * lié, notes), remplie AVANT d'ouvrir la sémiologie quand on ajoute une crise, et modifiable depuis la vue de la crise
 * (bouton « Détails » de l'en-tête). Lier un tracé : la crise devient l'une des crises de ce tracé (ieeg_seizures.js :
 * plusieurs crises par enregistrement, chacune ses marques et ses analyses) ; si l'heure de la crise tombe dans le tracé
 * (en-tête EDF / BrainVision), son début y est placé. Nouvelle crise : vue 3D par défaut (deux hémisphères, sans reliquat
 * de la crise précédente).                                                                                              */
(function (SV) {
  'use strict';
  const S = SV.Store, A = SV.app, V = S.V, esc = SV.U.esc;
  const $ = id => document.getElementById(id), opts = (o, v) => Object.entries(o).map(([k, l]) => `<option value="${k}"${(v || '') === k ? ' selected' : ''}>${esc(l)}</option>`).join('');
  const dtVal = s => s ? (String(s).length <= 10 ? s + 'T00:00' : String(s).slice(0, 16)) : '';

  const M = {
    /** fiche de la crise sz ; o = { isNew, then } — nouvelle crise : « Annuler » la retire */
    seizureInfoDialog(sz, o) {
      o = o || {}; const d = this.dossier; if (!d || !sz) return; const ses = S.byId(d.sessions, sz.sessionId), ex = ses && S.byId(d.explorations, ses.explorationId), recs = (ex && ex.recordings) || [];
      const linked = r => r.seizureId === sz.id || !!(r.bySz && r.bySz[sz.id]);
      document.querySelectorAll('#szInfoDlg').forEach(x => x.remove());
      const box = document.createElement('div'); box.className = 'modal'; box.id = 'szInfoDlg';
      box.innerHTML = `<div class="modal-card sz-info"><div class="modal-head"><span>${o.isNew ? 'Nouvelle crise' : 'Détails de la crise'}${ex ? ' · ' + esc(ex.label) : ''}</span><button class="close">✕</button></div>
        <div class="sz-grid"><label>libellé <input class="z-label" value="${esc(sz.label)}"></label><label>date et heure <input type="datetime-local" class="z-dt" value="${esc(dtVal(sz.datetime))}"></label>
          <label>caractère <select class="z-hab">${opts(V.habitual, sz.habitual || '?')}</select></label><label>vigilance au début <select class="z-vig">${opts(V.vigilance, sz.vigilance)}</select></label>
          <label class="w2">facteur déclenchant <input class="z-trig" value="${esc(sz.trigger || '')}" placeholder="privation de sommeil, arrêt du traitement, stimulation…"></label></div>
        ${recs.length ? `<div class="sz-recs"><div class="muted small">Tracé(s) de la crise — le début est placé à l’heure de la crise si elle tombe dans le tracé ; plusieurs crises peuvent partager un même tracé long.</div>${recs.map(r => { const t = this.szRecOffset ? this.szRecOffset(r, sz) : null; return `<label class="chip" title="${esc(r.title)}"><input type="checkbox" data-r="${r.id}"${linked(r) ? ' checked' : ''}> ${esc(r.title)} <span class="muted">${r.duration ? Math.round(r.duration / 60) + ' min' : ''}${t != null ? ' · crise à ' + SV.fmtT(t) : ''}</span></label>`; }).join('')}</div>` : ''}
        <label class="w2">notes <textarea class="z-notes" rows="3" placeholder="contexte, description par l’entourage…">${esc(sz.notes || '')}</textarea></label>
        <div class="btnrow"><span class="spacer"></span><button class="close">${o.isNew ? 'Annuler' : 'Fermer'}</button><button class="primary z-ok">${o.isNew ? 'Créer et décrire la sémiologie' : 'Enregistrer'}</button></div></div>`;
      document.body.appendChild(box); box.hidden = false; const q = s => box.querySelector(s);
      const cancel = () => { box.remove(); if (o.isNew) { S.remove(d, 'seizure', sz.id); if (S.renumberSeizures && ex) S.renumberSeizures(d, ex.id); this.touch(); if (this.render) this.render(); } };
      box.querySelectorAll('.close').forEach(b => b.onclick = cancel); box.onclick = e => { if (e.target === box) cancel(); };
      q('.z-ok').onclick = () => {
        Object.assign(sz, { label: q('.z-label').value.trim() || sz.label, datetime: q('.z-dt').value || sz.datetime, habitual: q('.z-hab').value, vigilance: q('.z-vig').value, trigger: q('.z-trig').value.trim(), notes: q('.z-notes').value });
        box.querySelectorAll('[data-r]').forEach(c => { const r = recs.find(x => x.id === c.dataset.r); if (r && c.checked !== linked(r)) this.szLinkRec(r, sz, c.checked); });
        if (ex && S.renumberSeizures) S.renumberSeizures(d, ex.id); this.touch('seizure', sz.id, sz.label); box.remove();
        if (this.ctx && this.ctx.seizureId === sz.id) this.szHeadSync(); if (o.then) o.then(); else if (this.render) this.render();
      };
      setTimeout(() => q(o.isNew ? '.z-dt' : '.z-label').focus(), 30);
    },
    /** heure de la crise dans le tracé (s depuis son début) si elle y tombe, sinon null */
    szRecOffset(rec, sz) {
      const t0 = this.ieegRecStart && this.ieegRecStart(rec); if (!t0 || !sz.datetime || String(sz.datetime).length <= 10) return null;
      const t = (new Date(sz.datetime) - t0) / 1000; return t >= 0 && t <= (rec.duration || 0) ? Math.round(t) : null;
    },
    /** lie (ou délie) un tracé à une crise ; la crise active du tracé reste celle qu'elle était */
    szLinkRec(rec, sz, on) {
      if (!on) { if (this.ieegDropSeizure) this.ieegDropSeizure(rec, sz.id); else if (rec.seizureId === sz.id) rec.seizureId = null; return; }
      const t = this.szRecOffset(rec, sz), prev = rec.seizureId || null; rec.kind = 'ictal';
      if (!prev) { rec.seizureId = sz.id; rec.marks = rec.marks || { onset: null, end: null, user: [] }; if (t != null && rec.marks.onset == null) rec.marks.onset = t; return; }
      rec.bySz = rec.bySz || {}; rec.bySz[sz.id] = rec.bySz[sz.id] || { marks: { onset: t, end: null, user: [] } };
    },
    /** en-tête de la vue de la crise : date et heure (bouton « Détails ») */
    szHeadSync() {
      const b = $('szInfoBtn'), d = this.dossier, sz = d && this.ctx && this.ctx.seizureId ? S.byId(d.seizures, this.ctx.seizureId) : null; if (!b) return; b.hidden = !sz; if (!sz) return;
      const dt = sz.datetime ? new Date(String(sz.datetime).length <= 10 ? sz.datetime + 'T12:00' : sz.datetime) : null;
      b.textContent = dt && !isNaN(dt) ? (String(sz.datetime).length <= 10 ? dt.toLocaleDateString(SV.LOC) : dt.toLocaleString(SV.LOC, { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })) + ' ✎' : 'Détails ✎';
      const hb = $('szHabitual'); if (hb) hb.value = sz.habitual || '?';
    },
    /** nouvelle crise d'une séance : fiche d'abord, puis la vue de la crise */
    newSeizureFlow(ses, ex) {
      const d = this.dossier, sz = S.addSeizure(d, ses.id, { datetime: this.defaultDT(ses.date) }); if (S.renumberSeizures && ex) S.renumberSeizures(d, ex.id); this.touch();
      this.seizureInfoDialog(sz, { isNew: true, then: () => this.openSeizure(sz.id) });
    },
  };
  Object.assign(A, M);

  // nouvelle crise : la fiche avant la sémiologie (barre du parcours, carte de l'exploration, liste des crises)
  A.newSeizureIn = function (ex) { const d = this.dossier, ses = S.sessionsOf(d, ex.id).pop() || S.addSession(d, ex.id, { date: S.today() }); this.newSeizureFlow(ses, ex); };
  // crise sans vue enregistrée : vue 3D par défaut (une cellule, deux hémisphères, sans peinture), pas celle de la crise d'avant
  const lc0 = A.loadCase; A.loadCase = function (c) {
    const r = lc0.apply(this, arguments), V3 = this.viewer;
    if (!c.views && V3 && V3.cells && this.ctx && this.ctx.seizureId) { V3.setLayout('single'); V3.setCellConfig(0, { hemi: 'both', paint: null, inflate: 0, opacity: 1, hyps: [], view: 'latL' }, true); }
    this.szHeadSync(); return r;
  };
  // en-tête : bouton « Détails » (date, heure, tracé lié…)
  function boot() {
    const hb = $('szHabitual'); if (!hb || $('szInfoBtn')) return; const b = document.createElement('button'); b.id = 'szInfoBtn'; b.className = 'mini-btn'; b.title = 'Date, heure, caractère habituel, vigilance, facteur déclenchant, tracé lié, notes'; b.textContent = 'Détails ✎';
    hb.after(b); b.onclick = () => { const d = A.dossier, sz = d && A.ctx && A.ctx.seizureId ? S.byId(d.seizures, A.ctx.seizureId) : null; if (sz) A.seizureInfoDialog(sz); };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  SV.Bus.on('nav:after', function () { if (this.szHeadSync) this.szHeadSync(); }, 'seizure_info');
})(window.SV);
