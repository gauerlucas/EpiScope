/* EpiScope — seizure_board.js (v2.0.0) : tableau des crises d'une exploration (onglet Crises).
 *  - état de chaque crise en un coup d'œil : sémiologie (décrite / à décrire), vidéo, tracé (début marqué), analyses ;
 *  - « Reprendre la sémiologie de… » : crises stéréotypées — les signes d'une autre crise sont copiés, à ajuster ensuite ;
 *  - crises annotées dans les fichiers des tracés (une nuit peut en contenir plusieurs) sans fiche : créer la fiche ou la
 *    rattacher à la crise de même heure ; annotations en double entre deux exports qui se recouvrent signalées.
 *  Le modèle est dans store.js (annotatedSeizures, recordingOverlaps, copySemiology) et ieeg.js (seizureEvents).     */
(function (SV) {
  'use strict';
  const S = SV.Store, esc = SV.U.esc;
  const hm = iso => iso ? String(iso).slice(11, 19) : '';
  const day = iso => iso ? new Date(String(iso).slice(0, 10) + 'T12:00').toLocaleDateString(SV.LOC, { day: '2-digit', month: '2-digit' }) : '';

  const M = {
    /** début marqué de la crise dans un tracé de l'exploration → { rec, onset } | null */
    szTraceOf(sz, ex) {
      for (const r of ex.recordings || []) { const m = r.seizureId === sz.id ? r.marks : ((r.bySz || {})[sz.id] || {}).marks; if (r.seizureId === sz.id || (r.bySz && r.bySz[sz.id])) return { rec: r, onset: m && m.onset != null ? m.onset : null }; }
      return null;
    },
    /** pastilles d'état d'une crise : sémiologie, vidéo, tracé, analyses */
    szStatusHtml(sz, ex) {
      const d = this.dossier, g = (d.gallery || []).filter(x => x.seizureId === sz.id), vid = g.some(x => /^video\//.test(x.mime || '')) || !!(this.videoLinked && this.videoLinked(sz));
      const tr = this.szTraceOf(sz, ex), nq = (ex.quant || []).filter(q => q.seizureId === sz.id).length + (d.results || []).filter(r => r.scope && r.scope.seizureId === sz.id && r.status !== 'superseded').length;
      const chip = (ok, txt, tip) => `<span class="szs${ok === true ? ' ok' : ok === false ? ' no' : ' mid'}" title="${esc(tip)}">${esc(txt)}</span>`;
      return [chip(sz.events.length ? true : false, sz.events.length ? `sémiologie : ${sz.events.length}` : 'à décrire', sz.events.length ? 'signes saisis' : 'aucun signe saisi'),
        chip(vid ? true : null, vid ? 'vidéo' : 'sans vidéo', vid ? 'vidéo rattachée ou calée sur l’heure de la crise' : 'aucune vidéo'),
        chip(tr ? (tr.onset != null ? true : null) : null, tr ? (tr.onset != null ? 'tracé' : 'tracé, début ?') : 'sans tracé', tr ? `${tr.rec.title}${tr.onset != null ? '' : ' : début de crise à marquer'}` : 'aucun tracé'),
        chip(nq ? true : null, nq ? `analyses : ${nq}` : 'sans analyse', 'jeux et résultats enregistrés pour cette crise')].join('');
    },
    /** menu « Reprendre la sémiologie de… » : les autres crises décrites du dossier, par exploration */
    szCopyMenu(sz, rect, after) {
      const d = this.dossier, other = d.seizures.filter(z => z.id !== sz.id && z.events.length);
      if (!other.length) { this.toast('Aucune autre crise décrite dans ce dossier', 2500); return; }
      const exLbl = z => z.explorationId ? (S.byId(d.explorations, z.explorationId) || {}).label || '' : 'crises rapportées';
      const items = [{ head: `Reprendre la sémiologie de… (${sz.label})` }].concat(other.sort((a, b) => String(a.datetime || '').localeCompare(String(b.datetime || ''))).map(z => ({
        label: `${exLbl(z)} · ${z.label}${z.datetime ? ' · ' + String(z.datetime).replace('T', ' ').slice(0, 16) : ''} — signes : ${z.events.length}`,
        run: () => {
          if (sz.events.length && !confirm(`« ${sz.label} » a déjà des signes (${sz.events.length}). Les remplacer par ceux de « ${z.label} » ? (l’état d’avant reste dans l’historique du dossier)`)) return;
          const n = S.copySemiology(d, z.id, sz.id); this.touch('seizure', sz.id, `${sz.label} : sémiologie reprise de ${z.label}`);
          this.toast(`Signes repris de ${z.label} : ${n} — à ajuster (temps, latéralité, ordre)`, 4000); if (after) after();
        } })));
      this.popupMenu(items, Math.min(rect.left, window.innerWidth - 460), rect.bottom + 4);
    },
    /** crise du dossier rattachée au tracé r, début (et fin) posés aux instants annotés dans le fichier */
    szAttachToRec(r, szId, onset, end) {
      if (this.ieegSetSeizure) this.ieegSetSeizure(r, szId); else r.seizureId = szId;
      r.marks = r.marks || { user: [] }; r.marks.onset = Math.round(onset * 100) / 100; if (end != null) r.marks.end = Math.round(end * 100) / 100;
    },
    /** carte « Crises annotées dans les tracés » (au-dessus des jours) ; rien si tout est rattaché */
    renderAnnotatedCard(host, ex, after) {
      const d = this.dossier, IE = SV.IEEG; if (!host || !IE || !IE.seizureEvents) return;
      const A = S.annotatedSeizures(d, ex, IE.seizureEvents), todo = A.filter(x => x.state !== 'linked'), ov = S.recordingOverlaps(ex), recT = id => ((ex.recordings || []).find(r => r.id === id) || {}).title || '';
      if (!todo.length && !ov.length) { host.innerHTML = ''; return; }
      const szL = id => (S.byId(d.seizures, id) || {}).label || '';
      host.innerHTML = `<div class="card ann-card"><div class="card-h">Crises annotées dans les tracés <span class="muted">débuts de crise trouvés dans les fichiers importés</span>${todo.filter(x => x.state === 'free').length > 1 ? '<span class="spacer"></span><button class="mini-btn primary" data-a="all">créer toutes les fiches</button>' : ''}</div>
        ${todo.length ? `<table class="ov-t">${todo.map((x, i) => `<tr data-i="${A.indexOf(x)}"><td>${x.abs ? `${esc(day(x.abs))} ${esc(hm(x.abs))}` : '<span class="muted">heure inconnue</span>'}</td><td class="small">${esc(recT(x.recId))}</td><td class="small muted">« ${esc(x.label)} »</td>
          <td>${x.state === 'free' ? '<span class="szs no">sans fiche</span>' : x.state === 'match' ? `<span class="szs mid">même heure que ${esc(szL(x.seizureId))}</span>` : `<span class="szs">en double${x.seizureId ? ' (' + esc(szL(x.seizureId)) + ')' : ''} : exports qui se recouvrent</span>`}</td>
          <td>${x.state === 'free' ? '<button class="mini-btn primary" data-a="new">créer la fiche</button>' : x.state === 'match' ? `<button class="mini-btn" data-a="link">rattacher à ${esc(szL(x.seizureId))}</button>` : ''}</td></tr>`).join('')}</table>` : ''}
        ${ov.length ? `<div class="hint small">Tracés qui se recouvrent : ${ov.map(o => `${esc(recT(o.a))} et ${esc(recT(o.b))} (${esc(hm(o.from))}–${esc(hm(o.to))})`).join(' ; ')}. Une crise n’y est comptée qu’une fois ; les marques sont rangées à l’heure réelle, quel que soit l’export.</div>` : ''}</div>`;
      const act = async (x, kind) => {
        const r = (ex.recordings || []).find(y => y.id === x.recId); if (!r) return null; let sz;
        if (kind === 'new') { sz = S.addSeizure(d, ex.id, Object.assign({ source: 'ieeg' }, x.abs ? { datetime: String(x.abs).slice(0, 16) } : {})); S.renumberSeizures(d, ex.id); }
        else sz = S.byId(d.seizures, x.seizureId);
        if (!sz) return null; this.szAttachToRec(r, sz.id, x.onset, x.end); this.touch('seizure', sz.id, `${sz.label} : début annoté dans ${r.title}`); return sz;
      };
      host.querySelectorAll('tr[data-i]').forEach(tr => { const x = A[+tr.dataset.i];
        const b = tr.querySelector('[data-a=new]'); if (b) b.onclick = async () => { const sz = await act(x, 'new'); if (sz) this.toast(`${sz.label} créée : sémiologie à décrire`, 3000); if (after) after(); };
        const l = tr.querySelector('[data-a=link]'); if (l) l.onclick = async () => { await act(x, 'link'); if (after) after(); }; });
      const all = host.querySelector('[data-a=all]'); if (all) all.onclick = async () => { let n = 0; for (const x of todo.filter(y => y.state === 'free')) if (await act(x, 'new')) n++; this.toast(`Fiches créées : ${n} — sémiologie à décrire`, 3000); if (after) after(); };
    },
  };
  Object.assign(SV.app, M);
})(window.SV = window.SV || {});
