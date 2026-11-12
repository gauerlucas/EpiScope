/* EpiScope — ieeg_seizures.js (v5) : plusieurs crises marquées dans un même tracé SEEG, crise par crise.
 *
 *   Un enregistrement long (une nuit, 76 min…) contient souvent plusieurs crises. Jusqu'en v4.21 un tracé portait une seule
 *   paire de marques (rec.marks) et un seul jeu de résultats (rec.ei, rec.cei, rec.pei, rec.h2, rec.fp, rec.em, rec.hfo,
 *   rec.quantIds), liés à une seule crise (rec.seizureId). Ici la crise active garde ces champs au premier niveau (le code
 *   de la visionneuse et des méthodes ne change pas) ; les autres crises du tracé sont rangées dans rec.bySz[seizureId] =
 *   { marks, ei, … } et l'on bascule de l'une à l'autre (ieegSetSeizure). Chaque jeu d'analyse enregistré porte
 *   q.seizureId ; EImax / cEImax / PEImax voient une « crise » par crise marquée.
 *   Titres : une crise créée au curseur reçoit la date et l'heure du tracé (en-tête EDF / BrainVision) + t, et les titres
 *   « Crise n » de l'exploration sont renumérotés dans l'ordre chronologique (S.renumberSeizures).                     */
(function (SV) {
  'use strict';
  const S = SV.Store, A = SV.app, U = SV.U, $ = U.$, h = U.h, esc = U.esc;
  const F = ['marks', 'ei', 'cei', 'pei', 'h2', 'fp', 'em', 'hfo', 'quantIds', 'esz'];   // esz : source du début de crise (scalp), propre à chaque crise
  const fresh = k => k === 'marks' ? { onset: null, end: null, user: [] } : k === 'quantIds' ? {} : null;
  const clock = t => { if (t == null || !isFinite(t)) return '—'; const s = Math.max(0, Math.round(t)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
  const pad = n => String(n).padStart(2, '0');
  const M = {
    /** crises marquées dans un tracé : identifiants (crise active d'abord) */
    /** fenêtres des crises marquées dans le tracé (toutes les crises) : [[début − pre, fin + post]] — écartées de l'analyse
     *  intercritique (pointes) ; sans fin marquée : début + 120 s */
    ieegSzWins(rec, pre, post) {
      pre = pre == null ? 5 : pre; post = post == null ? 30 : post; const out = [], add = mk => { if (mk && mk.onset != null) out.push([mk.onset - pre, (mk.end != null ? mk.end : mk.onset + 120) + post]); };
      add(rec.marks); for (const sl of Object.values(rec.bySz || {})) add(sl && sl.marks); return out.sort((a, b) => a[0] - b[0]);
    },
    ieegRecSeizures(rec) { const ids = []; if (rec.seizureId) ids.push(rec.seizureId); for (const k of Object.keys(rec.bySz || {})) if (!ids.includes(k)) ids.push(k); return ids; },
    ieegStashSeizure(rec) { if (!rec.seizureId) return; rec.bySz = rec.bySz || {}; const slot = rec.bySz[rec.seizureId] = rec.bySz[rec.seizureId] || {}; for (const k of F) slot[k] = rec[k] == null ? null : rec[k]; },
    /** rend active la crise szId du tracé (ses marques et ses résultats passent au premier niveau) */
    ieegSetSeizure(rec, szId) {
      szId = szId || null; if (rec.seizureId === szId) return false;
      rec.bySz = rec.bySz || {}; const slot = szId && rec.bySz[szId];
      if (!rec.seizureId && !slot) { rec.seizureId = szId; return true; }   // marques non attribuées : elles deviennent celles de la crise choisie
      this.ieegStashSeizure(rec);
      const nx = slot || {}; for (const k of F) rec[k] = nx[k] != null ? nx[k] : fresh(k);
      if (slot) delete rec.bySz[szId];
      rec.seizureId = szId; return true;
    },
    /** retire une crise du tracé (ses marques et résultats) sans toucher à la crise du dossier */
    ieegDropSeizure(rec, szId) { if (rec.seizureId === szId) { const others = this.ieegRecSeizures(rec).filter(x => x !== szId); for (const k of F) rec[k] = fresh(k); rec.seizureId = null; if (others.length) this.ieegSetSeizure(rec, others[0]); } else if (rec.bySz) delete rec.bySz[szId]; },
    /** début du tracé → Date (EDF « jj.mm.aa hh.mm.ss », ISO, BrainVision « AAAAMMJJhhmmss ») ou null */
    ieegRecStart(rec) {
      const V = this._iev, mem = V && V.rec === rec ? V.mem : null, sd = rec.startDate || (mem && mem.startDate), stt = rec.startTime || (mem && mem.startTime) || '00:00:00';
      let m; if (sd && (m = String(sd + 'T' + stt).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/))) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
      const s = String(rec.start || '');
      if ((m = s.match(/^(\d{2})\.(\d{2})\.(\d{2})\s+(\d{2})\.(\d{2})\.(\d{2})/))) { const yy = +m[3], y = yy >= 85 ? 1900 + yy : 2000 + yy; return new Date(y, +m[2] - 1, +m[1], +m[4], +m[5], +m[6]); }
      if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/))) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
      if ((m = String(rec.title || '').match(/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/))) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
      return null;
    },
    /** date-heure (format datetime-local) de l'instant t du tracé, si le début du tracé est connu */
    ieegClockAt(rec, t) { const d0 = this.ieegRecStart(rec); if (!d0 || t == null) return ''; const d = new Date(d0.getTime() + t * 1000); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; },
    /** nouvelle crise de l'exploration marquée au curseur : séance du tracé (sinon la première), date = début du tracé + t ;
     *  elle devient la crise active du tracé, le début est posé à t ; les titres « Crise n » sont renumérotés par date */
    ieegNewSeizureAt(rec, t) {
      const d = this.dossier, ex = this.ieegEx(); if (!d || !ex) return null;
      let ses = S.sessionsOf(d, ex.id)[0]; if (!ses) ses = S.addSession(d, ex.id, {});
      const dt = this.ieegClockAt(rec, t), sz = S.addSeizure(d, ses.id, Object.assign({ source: 'ieeg' }, dt ? { datetime: dt } : {}));
      S.renumberSeizures(d, ex.id);
      this.ieegSetSeizure(rec, sz.id); rec.marks.onset = Math.round(t * 100) / 100;
      this.touch('seizure', sz.id, sz.label + ' (marquée dans ' + rec.title + ')');
      return sz;
    },
    /** barre « Crise : … » dans l'en-tête de la visionneuse */
    ieegSeizureBar(V) {
      const rec = V.rec, d = this.dossier, ex = this.ieegEx(); if (!rec || !d || !ex || !V.el) return;
      let bar = V.el.querySelector('.ie-szbar'); if (!bar) { bar = h('span', 'ie-szbar'); const top = V.el.querySelector('.ie-top'), anchor = top && top.querySelector('.ie-mont'); if (anchor) top.insertBefore(bar, anchor); else if (top) top.appendChild(bar); }
      const szs = S.seizuresOfExploration(d, ex.id), inRec = this.ieegRecSeizures(rec), isInter = this.ieegKind(rec) === 'inter';
      if (isInter) { bar.innerHTML = ''; return; }
      const opt = s => `<option value="${s.id}"${s.id === rec.seizureId ? ' selected' : ''}>${esc(s.label)}${s.datetime ? ' · ' + esc(String(s.datetime).slice(11, 16) || '') : ''}${inRec.includes(s.id) ? '' : ' (non marquée ici)'}</option>`;
      bar.innerHTML = `<label title="Crise active dans ce tracé : ses marques (début, fin) et ses analyses. Un tracé peut porter plusieurs crises : « ＋ crise » en crée une au curseur, avec sa date et son heure d’après le début du tracé.">crise <select class="ie-szsel"><option value="">—</option>${szs.map(opt).join('')}</select></label><button class="ie-sznew mini-btn" title="Nouvelle crise de l’exploration, marquée au curseur (début = curseur ; fin à poser ensuite : clic droit › Fin de crise ici)">＋ crise</button>${inRec.length > 1 ? `<span class="muted small" title="crises marquées dans ce tracé">${inRec.length} crises dans ce tracé</span>` : ''}`;
      bar.querySelector('.ie-szsel').onchange = e => { this.ieegSwitchSeizure(V, e.target.value || null); };
      bar.querySelector('.ie-sznew').onclick = () => { const t = V.cursor != null ? V.cursor : V.t + V.page / 2; const sz = this.ieegNewSeizureAt(rec, t); if (!sz) return; this.ieegAfterSwitch(V); this.toast(`${sz.label} créée${sz.datetime ? ' le ' + sz.datetime.replace('T', ' à ') : ''} ; début à ${clock(t)} — poser la fin (clic droit › Fin de crise ici)`, 6000); };
    },
    ieegSwitchSeizure(V, szId) {
      const rec = V.rec; if (!this.ieegSetSeizure(rec, szId)) return;
      V.dirty = true; this.touch('exploration', (this.ieegEx() || {}).id, 'tracé SEEG : crise active'); this.ieegAfterSwitch(V);
    },
    /** après un changement de crise active : courbes et résultats de la nouvelle crise, fenêtre de l'EI recalée, redessin */
    ieegAfterSwitch(V) {
      const rec = V.rec, mk = rec.marks || (rec.marks = fresh('marks')); mk.user = mk.user || [];
      V.er = null; V.pe = null; V.res = null; V.resBy = new Map(); V.heatN = -1; V.selMark = null;
      if (mk.onset != null) V.t = Math.max(0, mk.onset - V.page * 0.3);
      try { const P = this.ieegEIParams ? this.ieegEIParams() : null; if (P && this.ieegFitWindow) { P.auto = true; this.ieegFitWindow(P, mk, V.mem.duration); } } catch (e) { }
      this.ieegSeizureBar(V); this.ieegChips(); if (V.ei) this.ieegEIRender(); this.ieegDraw(); if (this.ui.tab === 'quant' && this.renderQuant) this.renderQuant();
    },
  };
  Object.assign(A, M);

  // ---------------------------------------------------------------- greffes explicites (SV.Hooks.wrap)
  SV.Hooks.wrap(A, 'ieegOpen', async function (orig) { const r = await orig(); const V = this._iev; if (V && V.el) this.ieegSeizureBar(V); return r; }, 'ieeg_seizures');
  // jeu d'analyse : crise d'origine et libellé
  SV.Hooks.wrap(A, 'ieegSaveSet', function (orig, slot, rows, valueOf, meta) {
    const V = this._iev, rec = V && V.rec, d = this.dossier, sz = rec && rec.seizureId && d && S.byId(d.seizures, rec.seizureId);
    if (sz && meta && meta.name && this.ieegRecSeizures(rec).length > 1 && !new RegExp('· ' + sz.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(meta.name)) meta = Object.assign({}, meta, { name: meta.name.replace(' · ' + rec.title, '') + ' · ' + sz.label + ' · ' + rec.title });
    const q = orig(slot, rows, valueOf, meta); if (q && rec) q.seizureId = rec.seizureId || null; return q;
  }, 'ieeg_seizures');
  // menu du tracé : nouvelle crise au curseur
  SV.Hooks.wrap(A, 'ieegMenu', function (orig, e, p) {
    const V = this._iev; if (!V || this.ieegKind(V.rec) === 'inter') return orig(e, p);
    const pm = this.popupMenu, t = Math.round(p.t * 100) / 100;
    this.popupMenu = (items, x, y) => { if (Array.isArray(items) && items.some(i => i && /Début de crise ici/.test(i.label || ''))) items.push({ label: `＋ Nouvelle crise à ${clock(t)} (début ici)`, run: () => { const sz = this.ieegNewSeizureAt(V.rec, t); if (sz) { this.ieegAfterSwitch(V); this.toast(`${sz.label} créée ; début à ${clock(t)} — poser la fin (clic droit › Fin de crise ici)`, 5000); } } }); return pm.call(this, items, x, y); };
    try { return orig(e, p); } finally { this.popupMenu = pm; }
  }, 'ieeg_seizures');
  // synthèse EImax / cEImax / PEImax : une « crise » par crise marquée dans chaque tracé
  SV.Hooks.wrap(A, 'ieegEIMax', function (orig, q0, meth0) {
    const ex = this.ieegEx(); if (!ex) return orig(q0, meth0);
    const real = ex.recordings || [], virt = [];
    for (const r of real) { virt.push(r); for (const [szId, slot] of Object.entries(r.bySz || {})) if (slot && (slot.ei || slot.cei || slot.pei)) virt.push(Object.assign({}, r, slot, { id: r.id + '#' + szId, seizureId: szId, _virtualOf: r.id })); }
    if (virt.length === real.length) return orig(q0, meth0);
    ex.recordings = virt; try { return orig(q0, meth0); } finally { ex.recordings = real; }
  }, 'ieeg_seizures');
  // volet « tracé » des jeux : un identifiant de synthèse « tracé#crise » renvoie au tracé
  if (typeof A.traceRecOf === 'function') SV.Hooks.wrap(A, 'traceRecOf', function (orig, q) {
    const r = orig(q); if (r || !q) return r; const ex = this.ieegEx && this.ieegEx(); if (!ex) return null;
    const id = String(q.ieeg || (Array.isArray(q.eimax) && q.eimax[0]) || (q.smax && q.smax.ids && q.smax.ids[0]) || '').split('#')[0];
    return (ex.recordings || []).find(x => x.id === id) || null;
  }, 'ieeg_seizures');
  // crises de l'exploration : titres chronologiques après modification d'une date (vue Crises)
  SV.Bus.on('seizure:dated', function (ex) { if (ex && S.renumberSeizures(this.dossier, ex.id)) { this.updateCrumbs && this.updateCrumbs(); } }, 'ieeg_seizures');
})(window.SV = window.SV || {});
