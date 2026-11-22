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
      o = o || {}; const d = this.dossier; if (!d || !sz) return; const ex = sz.explorationId ? S.byId(d.explorations, sz.explorationId) : null, recs = (ex && ex.recordings) || [];
      const linked = r => r.seizureId === sz.id || !!(r.bySz && r.bySz[sz.id]);
      document.querySelectorAll('#szInfoDlg').forEach(x => x.remove());
      const box = document.createElement('div'); box.className = 'modal'; box.id = 'szInfoDlg';
      box.innerHTML = `<div class="modal-card sz-info"><div class="modal-head"><span>${o.isNew ? 'Nouvelle crise' : 'Détails de la crise'}${ex ? ' · ' + esc(ex.label) : ''}</span><button class="close">✕</button></div>
        <div class="sz-grid"><label>libellé <input class="z-label" value="${esc(sz.label)}"></label><label>date et heure <input type="datetime-local" class="z-dt" value="${esc(dtVal(sz.datetime))}"></label>
          <label>caractère <select class="z-hab">${opts(V.habitual, sz.habitual || '?')}</select></label><label>vigilance au début <select class="z-vig">${opts(V.vigilance, sz.vigilance)}</select></label>
          <label class="w2" title="crise rapportée (vidéo familiale, témoignage, autre centre) : au niveau du dossier, rattachable plus tard à une exploration">rattachée à <select class="z-ex"><option value="">dossier — crise rapportée (hors exploration)</option>${S.explorationsSorted(d).map(e => `<option value="${esc(e.id)}"${ex && e.id === ex.id ? ' selected' : ''}>${esc(e.label)}${e.start ? ' · ' + esc(String(e.start).slice(0, 10)) : ''}</option>`).join('')}</select></label>
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
        const to = q('.z-ex').value || null; if ((sz.explorationId || null) !== to) { S.moveSeizure(d, sz.id, to); if (to && S.renumberSeizures) S.renumberSeizures(d, to); if (this.ctx && this.ctx.seizureId === sz.id) this.ctx.explorationId = to; }
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
      if (!prev) { if (S.recSetSeizure) S.recSetSeizure(rec, sz.id); else rec.seizureId = sz.id; rec.marks = rec.marks || { onset: null, end: null, user: [] }; if (t != null && rec.marks.onset == null) rec.marks.onset = t; return; }
      rec.bySz = rec.bySz || {}; rec.bySz[sz.id] = rec.bySz[sz.id] || { marks: { onset: t, end: null, user: [] } };
    },
    /** en-tête de la vue de la crise : date et heure (bouton « Détails ») */
    szHeadSync() {
      const b = $('szInfoBtn'), d = this.dossier, sz = d && this.ctx && this.ctx.seizureId ? S.byId(d.seizures, this.ctx.seizureId) : null; if (!b) return; b.hidden = !sz; if (!sz) return;
      const dt = sz.datetime ? new Date(String(sz.datetime).length <= 10 ? sz.datetime + 'T12:00' : sz.datetime) : null;
      b.textContent = dt && !isNaN(dt) ? (String(sz.datetime).length <= 10 ? dt.toLocaleDateString(SV.LOC) : dt.toLocaleString(SV.LOC, { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })) + ' ✎' : 'Détails ✎';
      const hb = $('szHabitual'); if (hb) hb.value = sz.habitual || '?';
    },
    /** rattacher des crises rapportées (dossier) à l'exploration ex ; cb après rattachement */
    attachReportedSeizure(ex, cb) {
      const d = this.dossier, L = S.reportedSeizures(d); if (!d || !ex || !L.length) return;
      document.querySelectorAll('#szAttachDlg').forEach(x => x.remove());
      const box = document.createElement('div'); box.className = 'modal'; box.id = 'szAttachDlg';
      const when = z => z.datetime ? new Date(String(z.datetime).length <= 10 ? z.datetime + 'T12:00' : z.datetime).toLocaleString(SV.LOC, { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'date inconnue';
      box.innerHTML = `<div class="modal-card"><div class="modal-head"><span>Rattacher à ${esc(ex.label)}</span><button class="close">✕</button></div>
        <p class="muted small">Crises rapportées du dossier (vidéo familiale, témoignage, autre centre). Une crise rattachée garde sa sémiologie, ses vidéos et ses notes ; elle peut être replacée au dossier depuis sa fiche.</p>
        <div class="sz-attach">${L.map(z => `<label class="chk"><input type="checkbox" data-id="${z.id}"> <b>${esc(z.label)}</b> <span class="muted">${esc(when(z))} · signes : ${z.events.length}</span></label>`).join('')}</div>
        <div class="btnrow"><span class="spacer"></span><button class="close">Annuler</button><button class="primary z-ok">Rattacher</button></div></div>`;
      document.body.appendChild(box); box.hidden = false;
      const close = () => box.remove(); box.querySelectorAll('.close').forEach(b => b.onclick = close); box.onclick = e => { if (e.target === box) close(); };
      box.querySelector('.z-ok').onclick = () => {
        const ids = [...box.querySelectorAll('input[data-id]:checked')].map(c => c.dataset.id); if (!ids.length) { close(); return; }
        for (const id of ids) S.moveSeizure(d, id, ex.id);
        if (S.renumberSeizures) S.renumberSeizures(d, ex.id);
        if (this.ctx && ids.includes(this.ctx.seizureId)) this.ctx.explorationId = ex.id;
        this.touch('exploration', ex.id, `${ids.length} crise(s) rapportée(s) rattachée(s)`); close();
        this.toast(ids.length > 1 ? `Crises rattachées à ${ex.label} : ${ids.length}` : `Crise rattachée à ${ex.label}`, 2500);
        if (cb) cb();
      };
    },
    /** carte « Crises rapportées » (vue Histoire de la maladie) : crises saisies hors exploration ; elles y restent visibles
     *  une fois rattachées à une exploration (le menu dit laquelle, et permet de les replacer au dossier) */
    renderReportedCard(el) {
      const d = this.dossier; if (!d || !el) return; const L = S.reportedAll(d), exs = S.explorationsSorted(d);
      const vids = z => (d.gallery || []).filter(g => g.seizureId === z.id && /^video\//.test(g.mime || '')).length;
      el.innerHTML = `<div class="card rep-card"><div class="card-h">Crises rapportées <small class="muted">vidéos familiales, témoignages, autres centres</small><span class="spacer"></span><button class="mini-btn primary" data-a="new">+ crise rapportée</button></div>
        ${L.length ? `<table class="sz-table">${L.map(z => `<tr data-id="${z.id}"><td><b>${esc(z.label)}</b></td><td><input type="datetime-local" data-z="datetime" value="${esc(dtVal(z.datetime))}"></td><td><select data-z="habitual">${opts(V.habitual, z.habitual || '?')}</select></td><td class="muted small">signes : ${z.events.length}${vids(z) ? ' · ▶ ' + vids(z) : ''}</td>
          <td><select data-a="to" class="${z.explorationId ? 'on' : ''}" title="exploration à laquelle la crise est rattachée"><option value="">${z.explorationId ? 'replacer au dossier' : 'rattacher à…'}</option>${exs.map(x => `<option value="${x.id}"${x.id === z.explorationId ? ' selected' : ''}>${z.explorationId === x.id ? 'rattachée à ' : ''}${esc(x.label)}</option>`).join('')}</select></td><td><button class="mini-btn" data-a="open">sémiologie</button><button class="mini-btn danger" data-a="rm" title="à la corbeille du dossier">✕</button></td></tr>`).join('')}</table>`
          : '<div class="hint">Aucune crise rapportée. Une vidéo familiale ou un témoignage antérieur aux explorations se décrit ici, puis se rattache à une exploration (ambulatoire, phase 1, SEEG, post-opératoire…) quand elle existe.</div>'}</div>`;
      const redraw = () => this.renderReportedCard(el);
      el.querySelector('[data-a=new]').onclick = () => this.newSeizureFlow(null);
      el.querySelectorAll('tr[data-id]').forEach(tr => {
        const z = S.byId(d.seizures, tr.dataset.id); const q = s => tr.querySelector(s);
        q('[data-a=open]').onclick = () => this.openSeizure(z.id); q('td b').ondblclick = () => this.openSeizure(z.id);
        q('[data-a=rm]').onclick = () => { if (!confirm(`Mettre « ${z.label} » à la corbeille du dossier ?`)) return; S.remove(d, 'seizure', z.id); this.touch(); redraw(); };
        q('[data-a=to]').onchange = e => { const to = e.target.value || null; if (!S.moveSeizure(d, z.id, to)) return; if (to && S.renumberSeizures) S.renumberSeizures(d, to); this.touch('seizure', z.id, z.label); this.toast(to ? `« ${z.label} » rattachée à ${(S.byId(d.explorations, to) || {}).label || ''}` : `« ${z.label} » replacée au dossier`, 2500); redraw(); if (this.renderParcours) this.renderParcours(); };
        tr.querySelectorAll('[data-z]').forEach(c => c.onchange = () => { z[c.dataset.z] = c.value; this.touch('seizure', z.id, z.label); });
      });
    },
    /** nouvelle crise d'une exploration (ex null : crise rapportée, au niveau du dossier) : fiche d'abord, puis la vue */
    newSeizureFlow(ex, o) {
      const d = this.dossier, sz = S.addSeizure(d, ex ? ex.id : null, Object.assign({ datetime: this.defaultDT(ex ? S.today() : '') }, o || {})); if (S.renumberSeizures && ex) S.renumberSeizures(d, ex.id); this.touch();
      this.seizureInfoDialog(sz, { isNew: true, then: () => this.openSeizure(sz.id) });
    },
  };
  Object.assign(A, M);

  // nouvelle crise : la fiche avant la sémiologie (barre du parcours, carte de l'exploration, liste des crises)
  A.newSeizureIn = function (ex, o) { this.newSeizureFlow(ex, o); };
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
