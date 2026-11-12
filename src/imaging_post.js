/* EpiScope — imaging_post.js : Dossier › Imagerie, post-traitements sur les images recalées et navigation dans le pipeline.
 *   - chaque image (hors référence) porte ses étapes : 1 · originale (sans recalage, telle qu'acquise) → 2 · recalée sur le
 *     T1 → 3… · post-traitements (images dérivées, rangées sous leur source) ; un clic montre l'étape dans les coupes ;
 *   - carte « Post-traitement » : correction de l'effet de volume partiel (PVC) de la TEP ou de la TEMP sur la segmentation
 *     du patient (imaging/pvc.js, méthodes de PETPVC) : RBV, Yang itératif, Müller-Gärtner, GTM, Richardson-Lucy ;
 *     le résultat est une image dérivée dans l'espace du T1 (im.derived), avec le tableau des valeurs régionales
 *     (avant / après, asymétrie gauche-droite des régions VEP) exportable en CSV ;
 *   - carte d'asymétrie gauche / droite (v4.18) : TEP native recalée ou image corrigée (PVC), valeurs moyennes des régions
 *     VEP homologues (grille de 2 mm du T1), AI = 200 (G − D) / (G + D), significativité au choix (z robuste parmi les paires,
 *     t de Welch sur les voxels à effectif efficace, ou seuil fixe), correction FDR / Bonferroni ; image dérivée « chaud / froid »
 *     (froid : région moins fixante que son homologue, chaud : plus fixante), versions accumulées sous la source ;
 *   - « Cartes calculées » : cartes d'asymétrie et cartes d'épileptogénicité (SEEG), à superposer ou retirer.         */
(function (SV) {
  'use strict';
  const $ = id => document.getElementById(id), S = SV.Store, L = SV.Library, V = S.V;
  const esc = SV.U.esc;
  const opts = (o, cur) => Object.entries(o).map(([k, l]) => `<option value="${k}"${String(k) === String(cur) ? ' selected' : ''}>${esc(l)}</option>`).join('');
  const LSk = 'sv_pvc', LSg = () => { try { return JSON.parse(localStorage.getItem(LSk)) || {}; } catch (e) { return {}; } }, LSs = v => { try { localStorage.setItem(LSk, JSON.stringify(v)); } catch (e) { } };
  const METHODS = { rbv: 'RBV — GTM puis correction voxel à voxel (recommandée)', iy: 'Yang itératif', mg: 'Müller-Gärtner — substance grise', gtm: 'GTM — valeurs régionales', rl: 'Richardson-Lucy — sans segmentation' };
  const SHORT = { rbv: 'RBV', iy: 'Yang it.', mg: 'MG', gtm: 'GTM', rl: 'RL' };
  const INFO = 'Correction de l’effet de volume partiel : la résolution limitée de la TEP étale le signal (le cortex fin paraît moins actif, le LCR et la substance blanche « débordent »). Les méthodes de PETPVC (Thomas et al., Phys Med Biol 2016) utilisent la segmentation du T1 du patient et la résolution effective de l’image (FWHM de la PSF, scanner + filtre de reconstruction : à demander au service de médecine nucléaire, souvent 5 à 8 mm). GTM (Rousset 1998) : valeurs régionales ; RBV (Thomas 2011) : GTM puis correction de Yang voxel à voxel ; Yang itératif (Erlandsson 2012) : sans GTM ; Müller-Gärtner (1992) : substance grise seule ; Richardson-Lucy : déconvolution sans segmentation (bruit amplifié). Résultat indicatif, à interpréter avec l’image d’origine.';
  const ID16 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const LSa = 'sv_asym', LSag = () => { try { return JSON.parse(localStorage.getItem(LSa)) || {}; } catch (e) { return {}; } }, LSas = v => { try { localStorage.setItem(LSa, JSON.stringify(v)); } catch (e) { } };
  const STAT = { vox: 'voxel à voxel (réflexion, z robuste)', z: 'régions : z robuste (parmi les paires)', t: 'régions : t de Welch (voxels, effectif efficace)', abs: 'régions : seuil fixe de |asymétrie|' }, STATS = { vox: 'voxel', z: 'z', t: 't', abs: '|AI|' }, CORR = { fdr: 'FDR (Benjamini–Hochberg)', bonf: 'Bonferroni', none: 'sans correction' };
  const ASYM_VOX_INFO = 'Méthode voxel (v5) : chaque voxel du cerveau est comparé à son point homologue de l’autre hémisphère — p′ = A⁻¹·F·A·p, A = affine 12 ddl du patient vers le gabarit symétrique (MNI305 / fsaverage), F = réflexion x → −x : équivalent à passer en espace MNI, retourner l’image et revenir, sans rééchantillonnage. AI = 200 × (I(p) − I(p′)) / (I(p) + I(p′)), lissé par convolution normalisée dans le cerveau (FWHM 10 mm par défaut : absorbe l’asymétrie anatomique résiduelle du recalage affine), restreint à la substance grise (cortex et noyaux de la parcellation, des deux côtés), puis z robuste sur la distribution des AI du patient (médiane, MAD). Retenu : |z| ≥ seuil et |AI| ≥ minimum ; froid = voxel moins fixant que son homologue. Évite deux biais de la méthode par régions : la dilution d’un foyer dans une grande région et le mélange cortex / substance blanche différent à gauche et à droite. Reste indicatif sans base de témoins ; à confronter à l’image.';
  const ASYM_INFO = 'Asymétrie de fixation entre régions homologues de la parcellation VEP du patient : moyenne de l’image dans chaque région (grille de 2 mm du T1 ; image corrigée de l’effet de volume partiel : valeurs régionales de la PVC), AI = 200 × (G − D) / (G + D). Significativité : z robuste de l’AI parmi toutes les paires (médiane et MAD : une asymétrie globale, de recalage ou de normalisation, est neutralisée), ou t de Welch sur les voxels des deux régions avec un effectif efficace n × (2 mm)³ / FWHM³ (voxels corrélés par la résolution de l’image), ou seuil fixe ; correction FDR ou Bonferroni sur les paires ; |AI| minimal exigé. Carte : froid = région moins fixante que son homologue (hypofixation), chaud = plus fixante. Indicatif : à confronter à l’image, à la clinique et, idéalement, à une base de témoins.';

  const M = {
    derivedOf(im) { return (this.dossier.imaging || []).filter(x => x.derived && x.derived.from === im.id); },
    regionName(code) { return code >= 1 && code <= 162 ? this.atlas.label(code) : code === 200 ? 'substance blanche' : code === 201 ? 'LCR' : code === 0 ? 'substance grise (tous)' : code === -1 ? 'extra-cérébral' : code === 202 ? 'autre tissu (cervelet, tronc…)' : 'autre ' + code; },
    /** étapes affichables d'une image : originale, recalée, dérivées */
    imPipeline(im) {
      const ref = S.refImaging(this.dossier); if (!im || im === ref || im.derived) return [];
      const out = [{ key: 'native', label: 'originale', title: 'image telle qu’acquise (sans recalage) : comparez avec la recalée pour juger le recalage' }];
      if (im.coreg && im.coreg.T) out.push({ key: 'reg', label: 'recalée', title: 'image recalée sur le T1 de référence' });
      for (const x of this.derivedOf(im)) out.push({ key: 'd:' + x.id, label: x.derived.short || 'dérivée', title: x.label, id: x.id });
      return out;
    },
    imStepOn(im) {
      const st = this.slvState ? this.slvState() : null; if (!st) return null; const ids = new Set([im.id, ...this.derivedOf(im).map(x => x.id)]);
      const o = (st.overlays || []).filter(x => ids.has(x.id) && x.on !== false).pop(); if (!o) return null;
      return o.id === im.id ? (o.native ? 'native' : 'reg') : 'd:' + o.id;
    },
    /** montre une étape dans les coupes : une seule image de la famille superposée au T1 */
    imShowStep(im, key) {
      const st = this.slvState(), ids = new Set([im.id, ...this.derivedOf(im).map(x => x.id)]);
      st.overlays = (st.overlays || []).filter(o => !ids.has(o.id)); if (ids.has(st.base)) st.base = null;
      const id = key.startsWith('d:') ? key.slice(2) : im.id, o = { id, on: true, opacity: 0.55 }; if (key === 'native') o.native = true;
      st.overlays.push(o); st.wlTarget = id; this.ui.imSel = im.id;
      this.updateImagingLayers().then(() => { this.renderImagingBar && this.renderImagingBar(); this.imPipeSync(); });
    },
    imPipeSync() {
      document.querySelectorAll('#imMaps [data-a=on]').forEach(cb => { const st = this.slvState ? this.slvState() : null, id = cb.closest('.im-der-row').dataset.id; cb.checked = !!st && (st.overlays || []).some(o => o.id === id && o.on !== false); });
      document.querySelectorAll('.im-pipe').forEach(p => { const im = S.byId(this.dossier.imaging, p.dataset.im); if (!im) return; const on = this.imStepOn(im); p.querySelectorAll('[data-step]').forEach(b => b.classList.toggle('on', b.dataset.step === on)); });
    },
    /** décor de la liste des images : étapes du pipeline, images dérivées rangées sous leur source */
    imPostDecorate() {
      const d = this.dossier; if (!d) return;
      document.querySelectorAll('#imList .im-item').forEach(it => {
        if (!it.classList.contains('open')) return;   // image repliée : son titre seulement (v5.1)
        const im = S.byId(d.imaging, it.dataset.id), steps = this.imPipeline(im); if (!steps.length) return;
        const der = this.derivedOf(im);
        const stepH = steps.map((s0, k) => `<button data-step="${s0.key}" title="${esc(s0.title)}">${k + 1} · ${esc(s0.label)}</button>`).join('<i class="arr">→</i>');
        const derRow = x => { const D = x.derived, info = this.derivedInfo(x);
          return `<div class="im-der-row" data-id="${x.id}"><span class="badge pp">${esc(D.short || 'dérivée')}</span><span class="muted small">${esc(info)}</span><span class="spacer"></span>${(D.table || D.rows || []).length ? '<button class="mini-btn" data-a="tab" title="' + (D.kind === 'asym' ? 'paires de régions : valeurs, asymétrie, significativité' : 'valeurs régionales avant / après correction, asymétrie') + '">tableau</button>' : ''}<button class="mini-btn danger" data-a="rm" title="supprimer l’image dérivée">✕</button></div>`; };
        const html = `<div class="im-pipe" data-im="${im.id}"><span class="lbl">Afficher</span><div class="seg">${stepH}</div></div>` + (der.length ? `<div class="im-der">${der.map(derRow).join('')}</div>` : '');
        const anchor = it.querySelector('.btnrow'); const wrap = document.createElement('div'); wrap.className = 'im-post'; wrap.innerHTML = html; it.insertBefore(wrap, anchor);
        wrap.querySelectorAll('[data-step]').forEach(b => b.onclick = ev => { ev.stopPropagation(); this.imShowStep(im, b.dataset.step); });
        wrap.querySelectorAll('.im-der-row').forEach(r => { const x = S.byId(d.imaging, r.dataset.id);
          const tb = r.querySelector('[data-a=tab]'); if (tb) tb.onclick = ev => { ev.stopPropagation(); x.derived.kind === 'asym' ? this.asymTable(x) : this.pvcTable(x); };
          r.querySelector('[data-a=rm]').onclick = ev => { ev.stopPropagation(); this.derivedRemove(x); }; });
      });
      this.imPipeSync();
    },
    /** carte « Post-traitement » */
    renderPostCard() {
      const box = $('imPost'), d = this.dossier; if (!box || !d) return; const A = this.patientAnat, ref = S.refImaging(d);
      const srcs = d.imaging.filter(im => !im.derived && ['PET', 'SPECT'].includes(im.modality) && im.coreg && im.coreg.T);
      const P = Object.assign({ method: 'rbv', regions: 'vep', fwhm: 6, res: 2, iters: 10 }, LSg()); this.ui.pvcSrc = srcs.some(x => x.id === this.ui.pvcSrc) ? this.ui.pvcSrc : (srcs[0] || {}).id;
      const why = !ref ? 'Ajoutez d’abord le T1 de référence.' : !A || !A.vepVol ? 'Calculez d’abord l’anatomie du patient (segmentation et parcellation VEP) : la correction s’appuie sur elle.' : !srcs.length ? 'Aucune TEP ou TEMP recalée sur le T1 : importez-la puis « recaler sur la référence ».' : '';
      box.innerHTML = `<div class="pp-step"><b>Correction de l’effet de volume partiel</b> <span class="muted small">TEP, TEMP · d’après PETPVC</span> <span class="info" title="${esc(INFO)}">ⓘ</span></div>
        ${why ? `<div class="hint">${esc(why)}</div>` : `<div class="form pp-form">
          <label>Image <select data-p="src">${srcs.map(x => `<option value="${x.id}"${x.id === this.ui.pvcSrc ? ' selected' : ''}>${esc(V.modality[x.modality])} ${esc(x.date || '')} · ${esc(x.label || '')}</option>`).join('')}</select></label>
          <label>Méthode <select data-p="method">${opts(METHODS, P.method)}</select></label>
          <div class="grid3" style="display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:8px"><label>Régions <select data-p="regions">${opts({ vep: 'régions VEP + SB + LCR', tissue: 'tissus : SG, SB, LCR' }, P.regions)}</select></label><label title="largeur à mi-hauteur de la PSF (résolution effective de l’image)">FWHM (mm) <input type="number" data-p="fwhm" min="2" max="15" step="0.5" value="${P.fwhm}"></label><label title="pas de la grille de calcul, dans l’espace du T1">Grille <select data-p="res">${opts({ 1: '1 mm (lent)', 2: '2 mm', 3: '3 mm (rapide)' }, P.res)}</select></label></div>
          ${['iy', 'rl'].includes(P.method) ? `<label>Itérations <input type="number" data-p="iters" min="1" max="50" value="${P.iters}"></label>` : ''}
          <div class="btnrow"><button class="primary" data-a="run">Calculer</button><span class="muted small">image dérivée rangée sous sa source, dans l’espace du T1</span></div></div>`}
        <div class="pp-sec" id="imAsym"></div><div class="pp-sec" id="imMaps"></div>
        <div class="pp-next muted small">À venir : détection des dysplasies corticales focales (MELD) sur le T1 et la FLAIR.</div>`;
      box.querySelectorAll('[data-p]').forEach(el => el.onchange = () => { const k = el.dataset.p; if (k === 'src') this.ui.pvcSrc = el.value; else { P[k] = el.type === 'number' || k === 'res' ? +el.value : el.value; LSs({ method: P.method, regions: P.regions, fwhm: P.fwhm, res: P.res, iters: P.iters }); } if (k === 'method') this.renderPostCard(); });
      const run = box.querySelector('[data-a=run]'); if (run) run.onclick = () => this.runPvc(S.byId(d.imaging, this.ui.pvcSrc), P);
      this.renderAsymCard(); this.renderMapsCard();
    },
    async runPvc(src, P) {
      const d = this.dossier, A = this.patientAnat, ref = S.refImaging(d); if (!src || !A || !A.vepVol) return;
      const job = this.jobStart(`Correction de volume partiel · ${SHORT[P.method]} · ${V.modality[src.modality]}`);
      try {
        const pet = await this.imagingVolume(src), lab = A.vepVol;
        const args = { pet: { dims: pet.dims, affine: Array.from(pet.affine), data: pet.data, slope: pet.slope, inter: pet.inter }, petT: Array.from(SV.Mat4.from(src.coreg.T)), lab: { dims: lab.dims, affine: Array.from(lab.affine), pixdim: lab.pixdim, data: lab.data }, method: P.method, fwhm: +P.fwhm || 6, res: +P.res || 2, regions: P.regions, iters: +P.iters || 10 };
        const r = SV.Work.available ? await SV.Work.run(['volops', 'pvc'], 'PVC.run', [args], [], p => job.progress(p)) : SV.PVC.run(args, p => job.progress(p));
        const vol = { dims: r.dims, pixdim: r.pixdim, affine: Float64Array.from(r.affine), data: r.data, slope: 1, inter: 0, descrip: 'EpiScope PVC ' + P.method };
        const u8 = await SV.Nifti.encodeGz(vol), short = `PVC ${SHORT[P.method]}`;
        const im = S.addImaging(d, { modality: src.modality, timepoint: src.timepoint, date: src.date, label: `${src.label || V.modality[src.modality]} · ${short} ${P.fwhm} mm`, source: src.source || src.label, bytes: u8.length, dims: r.dims, pixdim: r.pixdim.map(v => +(+v).toFixed(3)), nt: 1,
          coreg: { T: ID16.slice(), refId: ref && ref.id, method: 'image dérivée, calculée dans l’espace du T1', date: S.now(), text: 'dérivée de ' + (src.label || '') + ' · espace du T1' },
          derived: { kind: 'pvc', short, method: P.method, fwhm: +P.fwhm, regions: P.regions, res: r.res, from: src.id, date: S.now(), ms: r.ms, table: r.table.map(t => ({ code: t.code, n: t.n, obs: +t.obs.toPrecision(5), pvc: +(+t.pvc).toPrecision(5), gtm: t.gtm == null ? null : +(+t.gtm).toPrecision(5) })) } });
        im.file = `imaging/${im.id}.nii.gz`; await L.writeFile(d, im.file, u8);
        this._volCache = this._volCache || new Map(); this._volCache.set(im.id, vol);
        S.log(d, 'compute', 'imaging', im.id, `${short} (${P.fwhm} mm, ${P.regions === 'tissue' ? 'tissus' : 'VEP'})`); this.touch('imaging', im.id, im.label);
        job.done(`${short} calculée en ${(r.ms / 1000).toFixed(1)} s · ${r.nRegions} régions`);
        await this.renderImaging(); this.imShowStep(src, 'd:' + im.id);
      } catch (e) { console.error(e); job.fail(e.message); }
    },
    /** résumé d'une image dérivée (liste, cartes calculées) */
    derivedInfo(x) {
      const D = x.derived || {}, day = D.date ? ' · ' + String(D.date).slice(0, 10) : '';
      if (D.kind === 'asym' && D.stat === 'vox') return `voxel · réflexion par l’affine patient → gabarit · FWHM ${D.vfwhm} mm · ${D.gm ? 'substance grise' : 'cerveau entier'} · |z| ≥ ${String(D.thrZ).replace('.', ',')} et |AI| ≥ ${D.minAI} % · ${D.nVoxSig} voxels · ${D.nSig} région${D.nSig > 1 ? 's' : ''} ≥ 25 %${D.show === 'hypo' ? ' · hypofixations seules' : ''}${day}`;
      if (D.kind === 'asym') return `${STAT[D.stat] || D.stat}${D.stat === 'abs' ? ` ≥ ${D.abs} %` : ` · p ${String(D.p).replace('.', ',')} ${D.corr === 'none' ? 'sans correction' : D.corr === 'bonf' ? 'Bonferroni' : 'FDR'} · |AI| ≥ ${D.minAI} %`} · ${D.nSig} paire${D.nSig > 1 ? 's' : ''} · ${D.src === 'native' ? 'image recalée' : esc(D.src)}${D.show === 'hypo' ? ' · hypofixations seules' : ''}${day}`;
      if (D.kind === 'em') return `${esc(D.rec || '')} · t ≥ ${String(D.thr).replace('.', ',')} (p ${String(D.p).replace('.', ',')}, ${D.corr === 'none' ? 'sans correction' : D.corr === 'bonf' ? 'Bonferroni' : 'FDR'}) · ${D.nPts} plots · noyau ${D.fwhm} mm${day}`;
      return `${(D.method || '').toUpperCase()} · FWHM ${D.fwhm} mm · ${D.regions === 'tissue' ? 'tissus' : 'régions VEP'} · grille ${(+D.res).toFixed(1)} mm${day}`;
    },
    async derivedRemove(x) {
      const d = this.dossier; if (!confirm(`Supprimer l’image dérivée « ${x.label} » ?`)) return; await L.removeFile(d, x.file).catch(() => { }); if (x.derived && x.derived.aiFile) await L.removeFile(d, x.derived.aiFile).catch(() => { });
      const st = this.slvState(); st.overlays = st.overlays.filter(o => o.id !== x.id); for (const k of Object.keys(d.sliceViews || {})) { const v = d.sliceViews[k]; if (v && v.overlays) v.overlays = v.overlays.filter(o => o.id !== x.id); }
      if (this._volCache) this._volCache.delete(x.id); S.remove(d, 'imaging', x.id); this.touch(); this.renderImaging();
    },
    /** paires de régions VEP homologues : [[code G, code D, nom]] */
    asymPairs() { const A = this.atlas, out = []; for (const [, lr] of A.famIndex) if (lr.L && lr.R) out.push([lr.L, lr.R, A.label(lr.L).replace(/ G$/, '')]); return out; },
    /** section « Carte d'asymétrie G / D » de la carte Post-traitement */
    renderAsymCard() {
      const box = $('imAsym'), d = this.dossier; if (!box || !d) return; const A = this.patientAnat;
      const roots = d.imaging.filter(im => !im.derived && ['PET', 'SPECT'].includes(im.modality) && im.coreg && im.coreg.T), srcs = [];
      for (const r of roots) { srcs.push({ key: 'n:' + r.id, label: `${V.modality[r.modality]} ${r.date || ''} · ${r.label || ''} — image recalée` }); for (const x of this.derivedOf(r).filter(x => x.derived.kind === 'pvc')) srcs.push({ key: 'd:' + x.id, label: `${V.modality[r.modality]} ${r.date || ''} — ${x.derived.short} ${x.derived.fwhm} mm (valeurs corrigées)` }); }
      const P = Object.assign({ stat: 'vox', p: 0.05, corr: 'fdr', minAI: 5, abs: 10, fwhm: 8, vfwhm: 10, thrZ: 2.5, gm: true, show: 'both' }, LSag()); if (!srcs.some(x => x.key === this.ui.asymSrc)) this.ui.asymSrc = (srcs[0] || {}).key;
      const why = !A || !A.vepVol ? 'Calculez d’abord l’anatomie du patient (parcellation VEP).' : !srcs.length ? 'Aucune TEP ou TEMP recalée sur le T1.' : '';
      const vox = P.stat === 'vox';
      box.innerHTML = `<div class="pp-step"><b>Carte d’asymétrie gauche / droite</b> <span class="muted small">${vox ? 'voxel à voxel par réflexion (espace symétrique) · substance grise' : 'régions VEP homologues'} · chaud / froid</span> <span class="info" title="${esc(vox ? ASYM_VOX_INFO : ASYM_INFO)}">ⓘ</span></div>
        ${why ? `<div class="hint">${esc(why)}</div>` : `<div class="form pp-form">
          <label>Image <select data-q="src">${srcs.map(x => `<option value="${x.key}"${x.key === this.ui.asymSrc ? ' selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label>
          <div style="display:grid;grid-template-columns:1.6fr 1fr 1fr;gap:8px"><label>Méthode <select data-q="stat">${opts(STAT, P.stat)}</select></label>
            ${vox ? `<label title="|z| robuste minimal (médiane et MAD des AI du patient)">|z| ≥ <input type="number" data-q="thrZ" min="1" max="6" step="0.5" value="${P.thrZ}"></label><label title="lissage de la carte d’asymétrie (absorbe l’asymétrie anatomique résiduelle du recalage affine)">FWHM (mm) <input type="number" data-q="vfwhm" min="4" max="16" step="1" value="${P.vfwhm}"></label>` : P.stat === 'abs' ? `<label title="paire retenue si |AI| ≥">|AI| ≥ (%) <input type="number" data-q="abs" min="1" max="50" step="1" value="${P.abs}"></label><span></span>` : `<label>p < <select data-q="p">${opts({ 0.05: '0,05', 0.01: '0,01', 0.001: '0,001' }, P.p)}</select></label><label>Correction <select data-q="corr">${opts(CORR, P.corr)}</select></label>`}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1.4fr;gap:8px">${P.stat === 'abs' ? '<span></span>' : `<label title="asymétrie minimale exigée en plus du test">|AI| ≥ (%) <input type="number" data-q="minAI" min="0" max="30" step="1" value="${P.minAI}"></label>`}
            ${vox ? `<label class="chip" title="voxels de cortex et de noyaux seulement (des deux côtés) ; décoché : tout le cerveau"><input type="checkbox" data-q="gm"${P.gm ? ' checked' : ''}> substance grise</label>` : P.stat === 't' ? `<label title="résolution effective de l’image (effectif efficace des voxels)">FWHM (mm) <input type="number" data-q="fwhm" min="2" max="15" step="0.5" value="${P.fwhm}"></label>` : '<span></span>'}
            <label>Afficher <select data-q="show">${opts({ both: 'hypo et hyperfixations', hypo: 'hypofixations seules' }, P.show)}</select></label></div>
          <div class="btnrow"><button class="primary" data-a="asym">Calculer la carte</button><span class="muted small">chaque calcul ajoute une version sous la TEP (calques des coupes)</span></div></div>`}`;
      box.querySelectorAll('[data-q]').forEach(el => el.onchange = () => { const k = el.dataset.q; if (k === 'src') { this.ui.asymSrc = el.value; return; } P[k] = el.type === 'checkbox' ? el.checked : el.type === 'number' || k === 'p' ? +el.value : el.value; LSas({ stat: P.stat, p: P.p, corr: P.corr, minAI: P.minAI, abs: P.abs, fwhm: P.fwhm, vfwhm: P.vfwhm, thrZ: P.thrZ, gm: P.gm, show: P.show }); if (k === 'stat') this.renderAsymCard(); });
      const run = box.querySelector('[data-a=asym]'); if (run) run.onclick = () => this.runAsym(this.ui.asymSrc, P);
    },
    /** section « Cartes calculées » : asymétrie, cartes d'épileptogénicité ; calque des coupes, tableau, suppression */
    renderMapsCard() {
      const box = $('imMaps'), d = this.dossier; if (!box || !d) return; const maps = d.imaging.filter(x => x.derived && (x.derived.kind === 'asym' || x.derived.kind === 'em')), st = this.slvState ? this.slvState() : { overlays: [] };
      if (!maps.length) { box.innerHTML = ''; return; } const shown = id => (st.overlays || []).some(o => o.id === id && o.on !== false);
      box.innerHTML = `<div class="pp-step"><b>Cartes calculées</b> <span class="muted small">${maps.length} · superposées au T1 dans les coupes (calques)</span></div>
        <div class="im-der">${maps.map(x => `<div class="im-der-row cm-row" data-id="${x.id}"><span class="badge pp">${esc(x.derived.short || 'carte')}</span><span class="spacer"></span><label class="chip"><input type="checkbox" data-a="on"${shown(x.id) ? ' checked' : ''}> calque</label>${x.derived.kind === 'asym' ? '<button class="mini-btn" data-a="tab">tableau</button>' : ''}<button class="mini-btn danger" data-a="rm" title="supprimer la carte">✕</button><div class="cm-info muted small">${x.derived.kind === 'em' ? '' : esc(x.label) + ' · '}${this.derivedInfo(x)}</div></div>`).join('')}</div>`;
      box.querySelectorAll('.im-der-row').forEach(r => { const x = S.byId(d.imaging, r.dataset.id);
        r.querySelector('[data-a=on]').onchange = e => { const s2 = this.slvState(); s2.overlays = (s2.overlays || []).filter(o => o.id !== x.id); if (e.target.checked) s2.overlays.push({ id: x.id, on: true, opacity: 0.8 }); this.updateImagingLayers().then(() => { this.renderImagingBar && this.renderImagingBar(); this.imPipeSync(); }); };
        const tb = r.querySelector('[data-a=tab]'); if (tb) tb.onclick = () => this.asymTable(x); r.querySelector('[data-a=rm]').onclick = () => this.derivedRemove(x); });
    },
    async runAsym(key, P) {
      const d = this.dossier, A = this.patientAnat, ref = S.refImaging(d); if (!key || !A || !A.vepVol) return;
      const isD = key.startsWith('d:'), im = S.byId(d.imaging, key.slice(2)), root = isD ? S.byId(d.imaging, im.derived.from) : im; if (!im || !root) return;
      const st0 = STATS[P.stat], job = this.jobStart(`Asymétrie G/D · ${st0} · ${V.modality[root.modality]}${isD ? ' ' + im.derived.short : ''}`);
      if (P.stat === 'vox') return this.runAsymVoxel(key, P, im, root, isD, job);
      try {
        const vol = await this.imagingVolume(im), lab = A.vepVol;
        const args = { img: { dims: vol.dims, affine: Array.from(vol.affine), data: vol.data, slope: vol.slope, inter: vol.inter }, imgT: isD ? null : Array.from(SV.Mat4.from(im.coreg.T)), lab: { dims: lab.dims, affine: Array.from(lab.affine), pixdim: lab.pixdim, data: lab.data }, res: 2 };
        const stt = SV.Work.available ? await SV.Work.run(['volops', 'pvc'], 'PVC.regionStats', [args], [], p => job.progress(p)) : SV.PVC.regionStats(args, p => job.progress(p));
        const means = isD && (im.derived.table || []).length ? Object.fromEntries(im.derived.table.map(t => [t.code, t.pvc])) : null;
        const rows = SV.PVC.asymTest(stt, this.asymPairs(), { stat: P.stat, p: +P.p, corr: P.corr, minAI: +P.minAI, abs: +P.abs, fwhm: +P.fwhm, res: stt.grid.res, means });
        if (!rows.length) throw new Error('aucune paire de régions mesurable (image hors du cerveau ?)');
        const data = SV.PVC.asymPaint(stt.grid, rows, P.show), sig = rows.filter(r => r.sig), mxa = Math.max(0, ...sig.map(r => Math.abs(r.ai))), Wn = Math.max(10, Math.ceil(mxa / 5) * 5), G = stt.grid;
        const vol2 = { dims: G.dims, pixdim: [G.res, G.res, G.res], affine: Float64Array.from(G.affine), data, slope: 1, inter: 0, descrip: 'EpiScope asymetrie G/D' }, u8 = await SV.Nifti.encodeGz(vol2);
        const short = `Asym. ${st0}${isD ? ' · ' + im.derived.short : ''}`, r4 = v => v == null || !isFinite(v) ? null : +(+v).toPrecision(4);
        const nim = S.addImaging(d, { modality: root.modality, timepoint: root.timepoint, date: root.date, label: `${root.label || V.modality[root.modality]} · asymétrie G/D (${st0})${isD ? ' · ' + im.derived.short : ''}`, source: root.source || root.label, bytes: u8.length, dims: G.dims, pixdim: [G.res, G.res, G.res].map(v => +v.toFixed(3)), nt: 1,
          coreg: { T: ID16.slice(), refId: ref && ref.id, method: 'carte calculée dans l’espace du T1', date: S.now(), text: 'asymétrie de ' + (root.label || '') + ' · espace du T1' },
          derived: { kind: 'asym', short, from: root.id, base: isD ? im.id : null, src: isD ? `${im.derived.short} ${im.derived.fwhm} mm` : 'native', stat: P.stat, p: +P.p, corr: P.corr, minAI: +P.minAI, abs: +P.abs, fwhm: +P.fwhm, show: P.show, res: G.res, cmap: 'div', win: [-Wn, Wn], nSig: sig.length, med: r4(rows.med), date: S.now(),
            rows: rows.map(r => ({ name: r.name, cL: r.cL, cR: r.cR, nL: r.nL, nR: r.nR, mL: r4(r.mL), mR: r4(r.mR), ai: r4(r.ai), z: r4(r.z), t: r4(r.t), p: r4(r.p), q: r4(r.q), sig: !!r.sig })) } });
        nim.file = `imaging/${nim.id}.nii.gz`; await L.writeFile(d, nim.file, u8); this._volCache = this._volCache || new Map(); this._volCache.set(nim.id, vol2);
        S.log(d, 'compute', 'imaging', nim.id, short); this.touch('imaging', nim.id, nim.label);
        job.done(`${short} : ${sig.length} paire${sig.length > 1 ? 's' : ''} significative${sig.length > 1 ? 's' : ''} sur ${rows.length}`);
        await this.renderImaging(); this.imShowStep(root, 'd:' + nim.id);
      } catch (e) { console.error(e); job.fail(e.message); }
    },
    /** asymétrie voxel à voxel (v5) : réflexion par l'affine patient → gabarit symétrique, lissage, z robuste en substance grise */
    async runAsymVoxel(key, P, im, root, isD, job) {
      const d = this.dossier, A = this.patientAnat, ref = S.refImaging(d), M4 = SV.Mat4;
      try {
        const vol = await this.imagingVolume(im), lab = A.vepVol;
        // point homologue : p' = A⁻¹ · F · A · p (A : monde du T1 → gabarit symétrique tkrRAS ; F : x → −x)
        const T = M4.from(A.toTemplate), Ti = M4.inv(T), F = M4.from([-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), mirror = Array.from(M4.mul(Ti, M4.mul(F, T)));
        const At = this.atlas, codesGM = []; for (let c = 1; c <= 162; c++) codesGM.push(c);   // régions VEP corticales et profondes (1–162) ; 200 = substance blanche, 201 = LCR
        const args = { img: { dims: vol.dims, affine: Array.from(vol.affine), data: vol.data, slope: vol.slope, inter: vol.inter }, imgT: isD ? null : Array.from(M4.from(im.coreg.T)), lab: { dims: lab.dims, affine: Array.from(lab.affine), pixdim: lab.pixdim, data: lab.data }, res: 2, mirror, fwhm: +P.vfwhm || 10, thrZ: +P.thrZ || 2.5, minAI: +P.minAI, gm: P.gm !== false, show: P.show, codesGM };
        const R = SV.Work.available ? await SV.Work.run(['volops', 'pvc'], 'PVC.asymVoxel', [args], [], p => job.progress(p)) : SV.PVC.asymVoxel(args, p => job.progress(p));
        if (!R.nVox) throw new Error('aucun voxel mesurable (image hors du cerveau ?)');
        const G = R.grid; let mxa = 10; for (let q = 0; q < R.sig.length; q++) { const v = Math.abs(R.sig[q]); if (v > mxa) mxa = v; }   // (pas de spread : des centaines de milliers de voxels)
        const Wn = Math.max(10, Math.ceil(Math.min(40, mxa) / 5) * 5);
        const vol2 = { dims: G.dims, pixdim: [G.res, G.res, G.res], affine: Float64Array.from(G.affine), data: R.sig, slope: 1, inter: 0, descrip: 'EpiScope asymetrie voxel' }, u8 = await SV.Nifti.encodeGz(vol2);
        const volAI = { dims: G.dims, pixdim: [G.res, G.res, G.res], affine: Float64Array.from(G.affine), data: R.ai, slope: 1, inter: 0, descrip: 'EpiScope AI lisse' }, u8ai = await SV.Nifti.encodeGz(volAI);
        const short = `Asym. voxel${isD ? ' · ' + im.derived.short : ''}`, r4 = v => v == null || !isFinite(v) ? null : +(+v).toPrecision(4), nm = c => At && At.label ? At.label(c) : String(c);
        const fam = new Map(); for (const r of R.rows) { const n0 = nm(r.code), base = n0.replace(/ [GD]$/, ''), h = / G$/.test(n0) ? 'L' : / D$/.test(n0) ? 'R' : '?'; const o = fam.get(base) || { name: base }; o[h] = r; fam.set(base, o); }
        const rows = [...fam.values()].map(o => { const L = o.L, Rr = o.R; return { name: o.name, cL: L && L.code, cR: Rr && Rr.code, nL: L && L.n, nR: Rr && Rr.n, ai: r4(L ? L.meanAI : Rr ? -Rr.meanAI : null), z: r4(L ? L.z : Rr ? -Rr.z : null), fracL: r4(L ? L.fracSig : null), fracR: r4(Rr ? Rr.fracSig : null), sig: !!((L && L.fracSig >= 0.25) || (Rr && Rr.fracSig >= 0.25)) }; }).sort((a, b) => Math.abs(b.ai || 0) - Math.abs(a.ai || 0));
        const nSig = rows.filter(r => r.sig).length;
        const nim = S.addImaging(d, { modality: root.modality, timepoint: root.timepoint, date: root.date, label: `${root.label || V.modality[root.modality]} · asymétrie G/D (voxel)${isD ? ' · ' + im.derived.short : ''}`, source: root.source || root.label, bytes: u8.length, dims: G.dims, pixdim: [G.res, G.res, G.res].map(v => +v.toFixed(3)), nt: 1,
          coreg: { T: ID16.slice(), refId: ref && ref.id, method: 'carte calculée dans l’espace du T1', date: S.now(), text: 'asymétrie voxel de ' + (root.label || '') + ' · espace du T1' },
          derived: { kind: 'asym', short, from: root.id, base: isD ? im.id : null, src: isD ? `${im.derived.short} ${im.derived.fwhm} mm` : 'native', stat: 'vox', thrZ: +P.thrZ, vfwhm: +P.vfwhm, gm: P.gm !== false, minAI: +P.minAI, show: P.show, res: G.res, cmap: 'div', win: [-Wn, Wn], nSig, nVoxSig: R.nSig, nVox: R.nVox, med: r4(R.med), mad: r4(R.mad), date: S.now(), aiFile: `imaging/${'AI_' + Date.now().toString(36)}.nii.gz`, rows } });
        nim.file = `imaging/${nim.id}.nii.gz`; await L.writeFile(d, nim.file, u8); await L.writeFile(d, nim.derived.aiFile, u8ai); this._volCache = this._volCache || new Map(); this._volCache.set(nim.id, vol2);
        S.log(d, 'compute', 'imaging', nim.id, short); this.touch('imaging', nim.id, nim.label);
        job.done(`${short} : ${R.nSig} voxels retenus (|z| ≥ ${P.thrZ}) · ${nSig} région${nSig > 1 ? 's' : ''} avec ≥ 25 % de voxels retenus`);
        await this.renderImaging(); this.imShowStep(root, 'd:' + nim.id);
      } catch (e) { console.error(e); job.fail(e.message); }
    },
    /** paires de régions : valeurs G / D, asymétrie, statistique, p corrigé ; CSV */
    asymTable(im) {
      const D = im.derived || {}, R = (D.rows || []).slice().sort((a, b) => (b.sig - a.sig) || Math.abs(b.ai) - Math.abs(a.ai)), fmt = v => v == null || !isFinite(v) ? '—' : (+v).toLocaleString(SV.LOC, { maximumSignificantDigits: 4 }), pf = v => v == null ? '—' : v < 0.001 ? '< 0,001' : (+v).toFixed(3).replace('.', ',');
      const sk = D.stat === 't' ? 't' : D.stat === 'z' ? 'z' : null, vox = D.stat === 'vox', panel = document.createElement('div'); panel.className = 'modal';
      panel.innerHTML = `<div class="modal-card pvc-tab"><div class="modal-head"><span>${esc(im.label)} — ${vox ? 'régions (asymétrie voxel moyenne)' : 'paires de régions'}</span><button class="close">✕</button></div>
        <div class="hint">${vox ? `Asymétrie voxel à voxel (réflexion par l’affine patient → gabarit symétrique, FWHM ${D.vfwhm} mm, ${D.gm ? 'substance grise' : 'cerveau entier'}) : z robuste (MAD ${fmt(D.mad)} %), voxels retenus si |z| ≥ ${String(D.thrZ).replace('.', ',')} et |AI| ≥ ${D.minAI} % (${D.nVoxSig} voxels sur ${D.nVox}). Par région : AI moyen du côté gauche (positif = gauche plus fixant), fraction de voxels retenus à gauche et à droite ; en gras ≥ 25 %.` : `AI = 200 × (G − D) / (G + D) ; ${esc(STAT[D.stat] || '')}${D.stat === 'z' && D.med != null ? ` (médiane des AI ${fmt(D.med)} %)` : ''}${D.stat === 'abs' ? ` : |AI| ≥ ${D.abs} %` : ` · p < ${String(D.p).replace('.', ',')} (${esc(CORR[D.corr] || '')}) et |AI| ≥ ${D.minAI} %`} ; ${D.nSig} paire${D.nSig > 1 ? 's' : ''} retenue${D.nSig > 1 ? 's' : ''} sur ${R.length}.`} Source : ${D.src === 'native' ? 'image recalée' : esc(D.src)}.</div>
        <div class="pvc-grid"><table class="ce-table"><thead><tr><th>Région</th>${vox ? '<th>AI moyen G %</th><th>z</th><th>retenus G</th><th>retenus D</th>' : `<th>G</th><th>D</th><th>AI %</th>${sk ? `<th>${sk}</th><th>p corr.</th>` : ''}`}<th></th></tr></thead><tbody>${R.map(r => vox ? `<tr><td>${esc(r.name)}</td><td class="${r.sig ? 'hot' : ''}">${r.ai == null ? '—' : (r.ai > 0 ? '+' : '') + fmt(r.ai)}</td><td>${fmt(r.z)}</td><td>${r.fracL == null ? '—' : Math.round(r.fracL * 100) + ' %'}</td><td>${r.fracR == null ? '—' : Math.round(r.fracR * 100) + ' %'}</td><td>${r.sig ? `<b>${(r.fracL || 0) >= (r.fracR || 0) ? (r.ai < 0 ? 'hypo G' : 'hyper G') : (r.ai > 0 ? 'hypo D' : 'hyper D')}</b>` : ''}</td></tr>` : `<tr><td>${esc(r.name)}</td><td>${fmt(r.mL)}</td><td>${fmt(r.mR)}</td><td class="${r.sig ? 'hot' : ''}">${r.ai > 0 ? '+' : ''}${fmt(r.ai)}</td>${sk ? `<td>${fmt(r[sk])}</td><td>${pf(r.q)}</td>` : ''}<td>${r.sig ? `<b>${r.ai < 0 ? 'hypo G' : 'hypo D'}</b>` : ''}</td></tr>`).join('')}</tbody></table></div>
        <div class="btnrow"><button data-a="csv">Exporter (CSV)</button><span class="spacer"></span><button class="primary close">Fermer</button></div></div>`;
      document.body.appendChild(panel); panel.hidden = false;
      panel.querySelectorAll('.close').forEach(b => b.onclick = () => panel.remove()); panel.onclick = e => { if (e.target === panel) panel.remove(); };
      panel.querySelector('[data-a=csv]').onclick = () => { const lines = ['region;code G;code D;voxels G;voxels D;moyenne G;moyenne D;AI (%);z;t;p;p corrige;retenue;cote hypofixant'].concat(R.map(r => [r.name, r.cL, r.cR, r.nL, r.nR, r.mL, r.mR, r.ai, r.z == null ? '' : r.z, r.t == null ? '' : r.t, r.p == null ? '' : r.p, r.q == null ? '' : r.q, r.sig ? 1 : 0, r.sig ? (r.ai < 0 ? 'G' : 'D') : ''].join(';'))); this.download(`EpiScope_${(this.dossier.patient.pseudo || 'patient')}_${D.short.replace(/[^\w]+/g, '_')}.csv`, lines.join('\n') + '\n', 'text/csv'); };
    },
    /** valeurs régionales : avant / après, gain ; asymétrie G/D des régions VEP appariées ; export CSV */
    pvcTable(im) {
      const T = (im.derived && im.derived.table) || [], A = this.atlas, fmt = v => v == null || !isFinite(v) ? '—' : (+v).toLocaleString(SV.LOC, { maximumSignificantDigits: 4 });
      const vep = T.filter(t => t.code >= 1 && t.code <= 162), other = T.filter(t => !(t.code >= 1 && t.code <= 162));
      const pairs = new Map(); for (const t of vep) { const nm = A.label(t.code).replace(/ [GD]$/, ''), h = A.hemiOf[t.code]; const p = pairs.get(nm) || {}; p[h] = t; pairs.set(nm, p); }
      const ai = (l, r) => l && r && (l.pvc + r.pvc) ? 200 * (l.pvc - r.pvc) / (l.pvc + r.pvc) : null;
      const rowsP = [...pairs].map(([nm, p]) => ({ nm, L: p.L, R: p.R, ai: ai(p.L, p.R) })).sort((a, b) => Math.abs(b.ai || 0) - Math.abs(a.ai || 0));
      const panel = document.createElement('div'); panel.className = 'modal'; panel.innerHTML = `<div class="modal-card pvc-tab"><div class="modal-head"><span>${esc(im.label)} — valeurs régionales</span><button class="close">✕</button></div>
        <div class="hint">Moyennes dans chaque région (voxels purs) de l’image d’origine (observée) et corrigée ; asymétrie = 200 × (G − D) / (G + D), sur les valeurs corrigées, régions classées par asymétrie absolue. ${esc(METHODS[im.derived.method] || '')}, FWHM ${im.derived.fwhm} mm.</div>
        <div class="pvc-tis">${other.map(t => `<span class="pvc-chip"><b>${esc(this.regionName(t.code))}</b> ${(t.n / 1000).toFixed(0)} mL · ${fmt(t.obs)} → <b>${fmt(t.pvc)}</b></span>`).join('')}</div>
        <div class="pvc-grid"><table class="ce-table"><thead><tr><th>Région</th><th>G obs.</th><th>G corr.</th><th>D obs.</th><th>D corr.</th><th>asym. %</th></tr></thead><tbody>${rowsP.map(r => `<tr><td>${esc(r.nm)}</td><td>${fmt(r.L && r.L.obs)}</td><td><b>${fmt(r.L && r.L.pvc)}</b></td><td>${fmt(r.R && r.R.obs)}</td><td><b>${fmt(r.R && r.R.pvc)}</b></td><td class="${r.ai != null && Math.abs(r.ai) >= 10 ? 'hot' : ''}">${r.ai == null ? '—' : (r.ai > 0 ? '+' : '') + r.ai.toFixed(1)}</td></tr>`).join('')}</tbody></table></div>
        <div class="btnrow"><button data-a="csv">Exporter (CSV)</button><span class="spacer"></span><button class="primary close">Fermer</button></div></div>`;
      document.body.appendChild(panel); panel.hidden = false;
      panel.querySelectorAll('.close').forEach(b => b.onclick = () => panel.remove()); panel.onclick = e => { if (e.target === panel) panel.remove(); };
      panel.querySelector('[data-a=csv]').onclick = () => { const lines = ['code;region;volume_mm3;observe;corrige;gtm'].concat(T.map(t => [t.code, this.regionName(t.code), t.n, t.obs, t.pvc, t.gtm == null ? '' : t.gtm].join(';'))); this.download(`EpiScope_${(this.dossier.patient.pseudo || 'patient')}_${im.derived.short.replace(/\s+/g, '_')}.csv`, lines.join('\n') + '\n', 'text/csv'); };
    },
  };
  Object.assign(SV.app, M);

  const A = SV.app, ri0 = A.renderImaging, ra0 = A.renderAnatCard;
  A.renderImaging = async function () { const r = await ri0.apply(this, arguments); if (this.ui.screen === 'imaging' || $('imList')) { this.imPostDecorate(); this.renderPostCard(); } return r; };
  if (ra0) A.renderAnatCard = function () { const r = ra0.apply(this, arguments); this.renderPostCard && this.renderPostCard(); return r; };
})(window.SV = window.SV || {});
