/* EpiScope — resection_ui.js (v2.1.0) : contacts SEEG dans la résection, par liste ou d'après la cavité segmentée.
 *
 * Carte de l'écran d'une intervention : électrodes réelles de la SEEG de référence, un bouton par contact (clic : dans la
 * résection ou non ; survol : région VEP figée du plot). « Cavité de résection » : IRM post-opératoire recalée choisie, cavité
 * segmentée par différence avec la parcellation pré-opératoire (imaging/cavity.js, dans un worker), composantes à garder ou
 * écarter, volume et fraction emportée de chaque région ; « Retenir » range le masque (image dérivée de l'IRM post-opératoire,
 * visible dans les coupes) et déduit les contacts compris dans la cavité (tolérance 1,5 mm). Les contacts ajoutés à la main
 * restent ; ceux d'une cavité précédente sont remplacés. Les données vivent dans p.resection (store.js).               */
(function (SV) {
  'use strict';
  const S = SV.Store, V = S.V, L = SV.Library, esc = SV.U.esc;
  const ID16 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const pct = x => x == null ? '—' : (100 * x).toLocaleString(SV.LOC, { maximumFractionDigits: x < 0.1 ? 1 : 0 }) + ' %';
  /** « A'1–3, B2 » */
  const rangeText = list => { const by = new Map(); for (const c of list) { const k = c.spec.name.replace(/’/g, "'"); if (!by.has(k)) by.set(k, []); by.get(k).push(c.k); }
    return [...by].map(([nm, ks]) => { ks.sort((a, b) => a - b); const parts = []; for (let i = 0; i < ks.length;) { let j = i; while (j + 1 < ks.length && ks[j + 1] === ks[j] + 1) j++; parts.push(j > i ? `${ks[i]}–${ks[j]}` : `${ks[i]}`); i = j + 1; } return nm + parts.join(','); }).join(', '); };

  const M = {
    resectionCard(p) {
      const el = document.createElement('div'); el.className = 'card resect'; this._resEl = el; this._resP = p; this.renderResection(); return el;
    },
    renderResection() {
      const el = this._resEl, p = this._resP, d = this.dossier; if (!el || !p || !el.isConnected && el.parentNode) return;
      const R = p.resection = Object.assign(S.newResection(), p.resection), exs = S.explorationsSorted(d).filter(e => e.kind === 'seeg' && (e.electrodes || []).some(s => s.real && s.real.contacts)), ex = S.resectionExploration(d, p);
      const on = new Map(R.contacts.map(c => [c.e + ':' + c.k, c.how])), list = S.resectedContacts(d, p), cav = R.cavity;
      const posts = (d.imaging || []).filter(im => im.timepoint === 'postop' && !im.derived && im.coreg && im.coreg.T && im.file);
      el.innerHTML = `<div class="card-h"><span>Contacts dans la résection</span><span class="muted small">${list.length ? `${list.length} contact${list.length > 1 ? 's' : ''} : ${esc(rangeText(list))}` : 'aucun contact déclaré'}${exs.length < 2 && ex ? ' · ' + esc(ex.label) : ''}</span>${exs.length > 1 ? `<select class="rs-ex" title="SEEG de référence">${exs.map(e => `<option value="${e.id}"${ex && e.id === ex.id ? ' selected' : ''}>${esc(e.label)}</option>`).join('')}</select>` : ''}</div>
        ${!ex ? '<div class="hint">Aucune SEEG avec électrodes réelles validées : les contacts réséqués se déclarent sur les plots localisés (Imagerie › électrodes réelles).</div>' : `<div class="hint small">Clic sur un contact : dans la résection ou non. Survol : région VEP figée à la validation des électrodes. rouge : déclaré à la main ; violet : déduit de la cavité.</div>
        <div class="rs-grid">${ex.electrodes.filter(s => s.real && s.real.contacts).map(s => `<div class="rs-e"><b>${esc(s.name)}</b>${s.real.contacts.map((_, i) => { const k = i + 1, h = on.get(s.id + ':' + k), r = S.contactRegion(s, k); return `<button class="rs-c${h ? ' on ' + h : ''}" data-e="${esc(s.id)}" data-k="${k}" title="${esc(S.contactName(s, k))}${r ? ' · ' + esc(r.name) : ''}${h ? ' · ' + esc(V.resectHow[h]) : ''}">${k}</button>`; }).join('')}</div>`).join('')}</div>`}
        <div class="rs-cav"><div class="rs-cav-h"><b>Cavité de résection</b> <span class="muted small">IRM post-opératoire recalée, comparée à la parcellation pré-opératoire du patient</span></div>
          ${cav ? `<div class="small">cavité retenue : <b>${String(cav.volumeMl).replace('.', ',')} ml</b> · IRM du ${esc(cav.postDate || '—')} · seuil ${String(cav.thr).replace('.', ',')} · ${cav.nContacts} contact${cav.nContacts > 1 ? 's' : ''} déduit${cav.nContacts > 1 ? 's' : ''} · régions les plus emportées : ${esc((cav.regions || []).filter(r => r.frac >= 0.05).slice(0, 5).map(r => `${r.name} ${pct(r.frac)}`).join(', ') || '—')} ${cav.imagingId ? '<button class="mini-btn rs-show">voir dans les coupes</button>' : ''}</div>` : ''}
          ${!this.patientAnat || !this.patientAnat.vepVol ? '<div class="hint small">Anatomie du patient à calculer d’abord (Imagerie) : la parcellation pré-opératoire sert de référence.</div>' : !posts.length ? '<div class="hint small">IRM post-opératoire à importer (temps « post-opératoire ») et recaler sur le T1 (Imagerie).</div>'
          : `<div class="rs-run"><select class="rs-post">${posts.map(im => `<option value="${im.id}"${cav && cav.postopId === im.id ? ' selected' : ''}>${esc(im.label || V.modality[im.modality])}${im.date ? ' · ' + esc(im.date) : ''}</option>`).join('')}</select><label class="small" title="intensité normalisée (LCR 0, substance blanche 1) sous laquelle un voxel de parenchyme pré-opératoire est compté dans la cavité">seuil <input class="rs-thr" type="number" min="0.05" max="0.6" step="0.05" value="${cav ? cav.thr : 0.3}"></label><label class="small">composantes ≥ <input class="rs-min" type="number" min="0.1" max="20" step="0.5" value="${cav ? cav.minMl : 1}"> ml</label><button class="mini-btn primary rs-go">${cav ? 'Segmenter à nouveau' : 'Segmenter la cavité'}</button></div><div class="rs-res"></div>`}</div>`;
      const q = s => el.querySelector(s);
      if (q('.rs-ex')) q('.rs-ex').onchange = e => { R.explorationId = e.target.value; this.touch('procedure', p.id, 'SEEG de référence de la résection'); this.renderResection(); };
      el.querySelectorAll('.rs-c').forEach(b => b.onclick = () => { if (!R.explorationId && ex) R.explorationId = ex.id; S.toggleResected(d, p, b.dataset.e, +b.dataset.k); this.touch('procedure', p.id, 'contacts dans la résection'); this.renderResection(); });
      if (q('.rs-go')) q('.rs-go').onclick = () => this.cavitySegment(p, S.byId(d.imaging, q('.rs-post').value), +q('.rs-thr').value || 0.3, +q('.rs-min').value || 1);
      if (q('.rs-show')) q('.rs-show').onclick = () => { const im = S.byId(d.imaging, cav.imagingId), src = im && im.derived ? S.byId(d.imaging, im.derived.from) : null; if (im && src && this.imShowStep) { this.go({ stage: 'dossier', view: 'imagerie' }); setTimeout(() => this.imShowStep(src, 'd:' + im.id), 300); } };
      if (this._cavR && this._cavR.procId === p.id) this.renderCavityResult();
    },
    /** segmentation (worker) → composantes proposées ; rien n'est enregistré avant « Retenir » */
    async cavitySegment(p, post, thr, minMl) {
      const d = this.dossier, A = this.patientAnat; if (!post || !A || !A.vepVol) return;
      const job = this.jobStart ? this.jobStart('Cavité de résection · ' + (post.label || 'IRM post-opératoire')) : { progress() {}, done() {}, fail() {} };
      try {
        const vol = await this.imagingVolume(post), lab = A.vepVol, hemi = new Uint8Array(256);
        for (let c = 1; c <= 162; c++) { const n = this.atlas.labelEn(c); hemi[c] = /^Left|_L$|-lh/i.test(n) ? 1 : /^Right|_R$|-rh/i.test(n) ? 2 : 0; }
        const args = { img: { dims: vol.dims, affine: Array.from(vol.affine), data: vol.data, slope: vol.slope, inter: vol.inter }, imgT: Array.from(SV.Mat4.from(post.coreg.T)), lab: { dims: lab.dims, affine: Array.from(lab.affine), data: lab.data }, thr, minMl, side: p.side || '', hemi };
        const R = SV.Work && SV.Work.available ? await SV.Work.run(['cavity'], 'Cavity.segment', [args], [], x => job.progress(x)) : SV.Cavity.segment(args, x => job.progress(x));
        this._cavR = Object.assign(R, { procId: p.id, postId: post.id, thr, minMl, keep: R.chosen.slice() });
        job.done(R.comps.length ? `${R.comps.length} composante${R.comps.length > 1 ? 's' : ''} candidate${R.comps.length > 1 ? 's' : ''} : vérifier, puis « Retenir »` : 'aucune cavité trouvée à ce seuil');
        this.renderCavityResult();
      } catch (e) { console.error(e); job.fail(e.message || String(e)); }
    },
    renderCavityResult() {
      const R = this._cavR, el = this._resEl && this._resEl.querySelector('.rs-res'), p = this._resP; if (!R || !el || !p) return;
      const Sel = SV.Cavity.select(R, R.keep), nm = c => c >= 1 && c <= 162 ? this.atlas.label(c) : c === 200 ? 'substance blanche' : String(c);
      el.innerHTML = !R.comps.length ? '<div class="hint small">Aucune composante : seuil plus haut, ou recalage de l’IRM post-opératoire à vérifier.</div>' : `<div class="small">${R.comps.map(c => `<label class="chip${R.keep.includes(c.id) ? ' on' : ''}"><input type="checkbox" class="rs-k" data-id="${c.id}"${R.keep.includes(c.id) ? ' checked' : ''}> ${String(c.ml).replace('.', ',')} ml ${c.hemi === 'L' ? 'gauche' : c.hemi === 'R' ? 'droite' : ''}</label>`).join(' ')}</div>
        <div class="small">cavité : <b>${String(Sel.volumeMl).replace('.', ',')} ml</b> · régions : ${Sel.regions.slice(0, 6).map(r => `${esc(nm(r.code))} ${String(r.ml).replace('.', ',')} ml (${pct(r.frac)} de la région)`).join(' ; ') || '—'}</div>
        <div class="btnrow"><button class="mini-btn primary rs-keep">Retenir cette cavité et déduire les contacts</button><span class="muted small">à vérifier dans les coupes après l’enregistrement</span></div>`;
      el.querySelectorAll('.rs-k').forEach(b => b.onchange = () => { const id = +b.dataset.id; R.keep = b.checked ? R.keep.concat(id) : R.keep.filter(x => x !== id); this.renderCavityResult(); });
      const k = el.querySelector('.rs-keep'); if (k) k.onclick = () => this.cavityKeep(p);
    },
    /** masque rangé (image dérivée de l'IRM post-opératoire), contacts déduits, résumé dans p.resection.cavity */
    async cavityKeep(p) {
      const d = this.dossier, R = this._cavR, post = S.byId(d.imaging, R.postId), ref = S.refImaging(d); if (!R || !post) return;
      const Sel = SV.Cavity.select(R, R.keep), A = R.affine, px = [0, 1, 2].map(c => Math.hypot(A[c], A[4 + c], A[8 + c]));
      const vol = { dims: R.dims, pixdim: px, affine: Float64Array.from(A), data: Sel.mask, slope: 1, inter: 0, descrip: 'EpiScope cavite de resection' }, u8 = await SV.Nifti.encodeGz(vol);
      const old = p.resection && p.resection.cavity && p.resection.cavity.imagingId ? S.byId(d.imaging, p.resection.cavity.imagingId) : null;
      const im = S.addImaging(d, { modality: post.modality, timepoint: 'postop', date: post.date, label: `${post.label || V.modality[post.modality]} · cavité de résection`, source: post.source || post.label, bytes: u8.length, dims: R.dims, pixdim: px.map(v => +v.toFixed(3)), nt: 1,
        coreg: { T: ID16.slice(), refId: ref && ref.id, method: 'masque calculé dans l’espace du T1', date: S.now(), text: 'cavité de résection · espace du T1' },
        derived: { kind: 'cavity', short: 'Cavité', from: post.id, date: S.now(), thr: R.thr, minMl: R.minMl, volumeMl: Sel.volumeMl, cmap: 'red', win: [0, 1] } });
      im.file = `imaging/${im.id}.nii.gz`; await L.writeFile(d, im.file, u8); this._volCache = this._volCache || new Map(); this._volCache.set(im.id, vol);
      if (old) S.remove(d, 'imaging', old.id);   // l'ancienne cavité passe à la corbeille (fichier gardé)
      // contacts compris dans la cavité (SEEG de référence)
      const ex = S.resectionExploration(d, p), pts = [], who = [];
      if (ex) for (const s of ex.electrodes || []) if (s.real && s.real.contacts) s.real.contacts.forEach((c, i) => { pts.push(c); who.push({ e: s.id, k: i + 1 }); });
      const inside = pts.length ? SV.Cavity.contactsIn(pts, vol, 1.5) : [], hit = who.filter((_, i) => inside[i]);
      if (ex && !p.resection.explorationId) p.resection.explorationId = ex.id;
      S.setResected(d, p, hit, 'cavity');
      const nm = c => c >= 1 && c <= 162 ? this.atlas.labelEn(c) : c === 200 ? 'white-matter' : String(c);
      p.resection.cavity = { imagingId: im.id, postopId: post.id, postDate: post.date || '', thr: R.thr, minMl: R.minMl, keep: R.keep.slice(), volumeMl: Sel.volumeMl, nContacts: hit.length, tolMm: 1.5, norm: { wm: +R.norm.wm.toPrecision(4), csf: +R.norm.csf.toPrecision(4) },
        regions: Sel.regions.slice(0, 40).map(r => ({ code: r.code, name: nm(r.code), ml: r.ml, frac: r.frac })), method: 'différence pré / post-opératoire (EpiScope, imaging/cavity.js)', date: S.now() };
      S.log(d, 'compute', 'procedure', p.id, `cavité de résection ${Sel.volumeMl} ml · ${hit.length} contacts`); this.touch('procedure', p.id, 'cavité de résection');
      this._cavR = null; this.toast(`Cavité de ${String(Sel.volumeMl).replace('.', ',')} ml enregistrée · ${hit.length} contact${hit.length > 1 ? 's' : ''} dans la résection`, 6000); this.renderResection();
    },
  };
  Object.assign(SV.app, M);
})(window.SV = window.SV || {});
