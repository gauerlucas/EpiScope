/* EpiScope — imaging_ui.js : écran « Imagerie » du dossier patient.
 *   - import des NIfTI (glisser-déposer ou Fichier → Importer) : modalité, temps (pré-op, post-implantation,
 *     post-thermocoagulation, post-op), date devinés du nom de fichier, modifiables ; le fichier est rangé dans le
 *     dossier (imaging/<id>.nii.gz) ; le premier T1 pré-opératoire devient la référence ;
 *   - recalage rigide de chaque image sur la référence (SV.Coreg, dans un worker), contrôle visuel en coupes ;
 *   - anatomie du patient (SV.Anat : segmentation MeshNet, parcellation VEP, surfaces) et électrodes réelles sur le
 *     scanner post-implantation (SV.CTElec), dérivés rangés dans derivatives/ ;
 *   - visionneuse en coupes (imaging_panel.js, SV.Slices) : image de base, superpositions (FLAIR, TEP, CT…), contraste à
 *     la souris, parcellation VEP colorée par l'activation de la crise ouverte, lésions, plots, vérification d'électrode. */
(function (SV) {
  'use strict';
  const $ = id => document.getElementById(id), S = SV.Store, L = SV.Library, V = S.V;
  const esc = SV.U.esc;
  const opts = (map, v) => Object.entries(map).map(([k, l]) => `<option value="${esc(k)}"${String(v) === k ? ' selected' : ''}>${esc(l)}</option>`).join('');
  const fmtDate = s => { if (!s) return ''; const d = new Date(String(s).length <= 10 ? s + 'T12:00:00' : s); return isNaN(d) ? String(s) : d.toLocaleDateString(SV.LOC); };

  /** modalité, temps et date devinés du nom de fichier (exports des PACS, dcm2niix…) */
  function guessFromName(name) {
    const n = name.toLowerCase().replace(/\.nii(\.gz)?$/, '');
    let modality = 'other';
    if (/flair/.test(n)) modality = 'FLAIR';
    else if (/(^|[^a-z])(pet|tep|fdg|pt)([^a-z]|$)/.test(n)) modality = 'PET';
    else if (/(^|[^a-z])(ct|scanner|tdm|cbct|o-arm|oarm)([^a-z]|$)/.test(n)) modality = 'CT';
    else if (/spect|temp|hmpao|ecd/.test(n)) modality = 'SPECT';
    else if (/t2/.test(n)) modality = 'T2';
    else if (/(t1|mprage|mp2rage|bravo|spgr|tfl|3dt1|vibe)/.test(n)) modality = /gado|gd|c\+|ce[^a-z]|post_?contrast|inj/.test(n) ? 'T1c' : 'T1';
    let timepoint = 'preop';
    if (/post.?op|postchir|post_?surg/.test(n)) timepoint = 'postop';
    else if (/thermo|rftc|post.?tc/.test(n)) timepoint = 'postthermo';
    else if (/post.?implant|seeg|electrod|post.?imp/.test(n) || modality === 'CT') timepoint = 'postimplant';
    let date = ''; const m = n.match(/(20\d{2})[-_]?([01]\d)[-_]?([0-3]\d)/); if (m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31) date = `${m[1]}-${m[2]}-${m[3]}`;
    return { modality, timepoint, date };
  }

  const M = {
    // ================================================================ import
    /** o : { modality, timepoint } imposés (scanner importé depuis SEEG › Localisation), noRender ; renvoie les images ajoutées */
    async importNifti(files, o) {
      const d = this.dossier; if (!d) { this.toast('Ouvrez d’abord un dossier patient'); return []; } o = o || {}; const added = [];
      for (const f of files) {
        try {
          this.toast(`Lecture de ${f.name}…`, 1500);
          let u8 = await SV.Nifti.toU8(f), gz = SV.Nifti.isGz(u8);
          const vol = await SV.Nifti.read(u8);   // contrôle et en-tête
          if (!gz) u8 = await SV.Nifti.gzip(u8);
          const g = Object.assign(guessFromName(f.name), o.modality ? { modality: o.modality } : {}, o.timepoint ? { timepoint: o.timepoint } : {}), date = g.date || (f.lastModified ? new Date(f.lastModified).toISOString().slice(0, 10) : '');
          const im = S.addImaging(d, { modality: g.modality, timepoint: g.timepoint, date, label: f.name, source: f.name, bytes: u8.length, dims: vol.dims, pixdim: vol.pixdim.map(v => +v.toFixed(3)), nt: vol.nt || 1 });
          im.file = `imaging/${im.id}.nii.gz`;
          await L.writeFile(d, im.file, u8);
          if (!S.refImaging(d) || (!d.imaging.some(x => x.ref) && im.modality === 'T1' && im.timepoint === 'preop')) { for (const x of d.imaging) x.ref = false; im.ref = true; }
          this._volCache && this._volCache.set(im.id, vol);
          this.touch('imaging', im.id, im.label); added.push(im);
        } catch (e) { console.error(e); this.toast(`${f.name} : ${e.message}`, 6000); }
      }
      if (!d.imaging.some(x => x.ref)) { const r = S.refImaging(d); if (r) r.ref = true; }
      await this.flushSave(); if (!o.noRender) this.renderImaging();
      return added;
    },
    /** dossier DICOM (fichiers ou dossier déposé) : séries triées, choix, conversion NIfTI.gz et rangement dans le dossier (v4.21) */
    async importDicom(files, o) {
      const d = this.dossier; if (!d) { this.toast('Ouvrez d’abord un dossier patient'); return []; } o = o || {}; const Dm = SV.Dicom; if (!Dm) { this.toast('Lecteur DICOM absent'); return []; }
      const job = this.jobStart(`Lecture DICOM (${files.length} fichiers)`), parsed = []; let skipped = 0;
      try {
        for (let i = 0; i < files.length; i++) {
          const f = files[i]; if (i % 20 === 0) job.progress({ fraction: 0.6 * i / files.length, message: `${i} / ${files.length}` });
          try { const u8 = new Uint8Array(await f.arrayBuffer()); if (!Dm.isDicom(u8) && !(u8.length > 8 && u8[0] === 8 && u8[1] === 0)) { skipped++; continue; } parsed.push({ name: f.relPath || f.name, P: Dm.parse(u8) }); }
          catch (e) { skipped++; }
        }
        if (!parsed.length) { job.fail(`aucun fichier DICOM lisible (${files.length} fichiers)`); return []; }
        const series = Dm.series(parsed); job.done(`${parsed.length} fichiers DICOM, ${series.length} série${series.length > 1 ? 's' : ''}${skipped ? ` (${skipped} ignoré${skipped > 1 ? 's' : ''})` : ''}`);
        return await this.dicomChooser(series, o);
      } catch (e) { console.error(e); job.fail(e.message); return []; }
    },
    dicomChooser(series, o) {
      const Dm = SV.Dicom, d = this.dossier;
      return new Promise(resolve => {
        const m = document.createElement('div'); m.className = 'modal'; document.body.appendChild(m);
        const rows = series.map((s, i) => { const g = Dm.guess(s), v = s.sub[0], a = v && v.slices[0]; return { s, i, g, n: v ? v.n : 0, dims: a ? `${a.cols}×${a.rows}×${v.n}` : '—', pix: a && a.ps ? `${(+a.ps[1]).toFixed(2)}×${(+a.ps[0]).toFixed(2)}×${v.spacing.toFixed(2)}` : '', ok: !!v && v.n >= 3 && !s.compressed && !s.mosaic, sel: !!v && v.n >= 10 && !s.compressed && !s.mosaic && g.modality !== 'other', warn: [].concat(s.warnings, v ? v.warnings : [], s.compressed ? ['pixels compressés'] : [], s.mosaic ? ['mosaïque'] : []) }; });
        if (o.modality) rows.forEach(r => { r.g.modality = o.modality; }); if (o.timepoint) rows.forEach(r => { r.g.timepoint = o.timepoint; });
        m.innerHTML = `<div class="modal-card wide dcm-card"><div class="modal-head"><span>Dossier DICOM : séries trouvées</span><button class="close">✕</button></div>
          <div class="help"><div class="hint">Cochez les séries à convertir en NIfTI (.nii.gz) et à ranger dans le dossier du patient ; modalité, moment et date sont devinés, modifiables ici ou ensuite. Les séries 3D de plus de 10 coupes sont cochées d’office. Les pixels compressés (JPEG) ne sont pas lus : exporter la série non compressée, ou la convertir avec dcm2niix.</div>
          <table class="dcm-tab"><tr><th></th><th>série</th><th>DICOM</th><th>coupes</th><th>taille</th><th>voxel (mm)</th><th>modalité</th><th>moment</th><th>date</th><th></th></tr>
          ${rows.map(r => `<tr data-i="${r.i}" class="${r.ok ? '' : 'off'}"><td><input type="checkbox" data-k="sel"${r.sel ? ' checked' : ''}${r.ok ? '' : ' disabled'}></td><td><b>${esc(r.s.desc || r.g.label)}</b>${r.s.number != null ? ` <span class="muted">n° ${r.s.number}</span>` : ''}<div class="muted small">${esc(r.s.manufacturer)}${r.s.sub.length > 1 ? ` · ${r.s.sub.length} volumes (le plus grand retenu)` : ''}</div></td><td>${esc(r.s.modality)}</td><td>${r.n}</td><td class="mono">${r.dims}</td><td class="mono">${r.pix}</td><td><select data-k="modality">${opts(V.modality, r.g.modality)}</select></td><td><select data-k="timepoint">${opts(V.timepoint, r.g.timepoint)}</select></td><td><input type="date" data-k="date" value="${esc(r.g.date)}"></td><td class="small warn">${esc(r.warn.join(' ; '))}</td></tr>`).join('')}</table></div>
          <div class="modal-foot"><button class="primary ok">Convertir et importer</button><button class="cancel">Annuler</button></div>`;
        const close = v => { m.remove(); resolve(v); };
        m.querySelector('.close').onclick = m.querySelector('.cancel').onclick = () => close([]);
        m.querySelectorAll('tr[data-i]').forEach(tr => { const r = rows[+tr.dataset.i]; tr.querySelector('[data-k=sel]').onchange = e => { r.sel = e.target.checked; }; tr.querySelector('[data-k=modality]').onchange = e => { r.g.modality = e.target.value; }; tr.querySelector('[data-k=timepoint]').onchange = e => { r.g.timepoint = e.target.value; }; tr.querySelector('[data-k=date]').onchange = e => { r.g.date = e.target.value; }; });
        m.querySelector('.ok').onclick = async () => {
          const chosen = rows.filter(r => r.sel && r.ok); m.remove(); const added = [];
          for (const r of chosen) {
            const job = this.jobStart(`DICOM → NIfTI : ${r.s.desc || r.g.label}`);
            try {
              job.progress({ fraction: 0.2, message: 'lecture des pixels' }); await new Promise(x => setTimeout(x, 10));
              const vol = Dm.volume(r.s); job.progress({ fraction: 0.6, message: 'compression' });
              const u8 = await SV.Nifti.encodeGz(vol);
              const im = S.addImaging(d, { modality: r.g.modality, timepoint: r.g.timepoint, date: r.g.date, label: (r.s.desc || r.g.label).replace(/[\\/:*?"<>|]+/g, ' ').trim() + '.nii.gz', source: `DICOM · ${r.s.files.length} fichiers · ${esc(r.s.manufacturer)}`, bytes: u8.length, dims: vol.dims, pixdim: vol.pixdim.map(v => +v.toFixed(3)), nt: 1 });
              im.file = `imaging/${im.id}.nii.gz`; await L.writeFile(d, im.file, u8);
              if (!S.refImaging(d) || (!d.imaging.some(x => x.ref) && im.modality === 'T1' && im.timepoint === 'preop')) { for (const x of d.imaging) x.ref = false; im.ref = true; }
              this._volCache && this._volCache.set(im.id, { dims: vol.dims, pixdim: vol.pixdim, affine: vol.affine, data: vol.data, slope: vol.slope, inter: vol.inter, nt: 1 });
              this.touch('imaging', im.id, im.label); added.push(im);
              job.done(`${im.label} : ${vol.dims.join('×')}, coupes ${vol.orient}${vol.warnings.length ? ' — ⚠ ' + vol.warnings[0] : ''}`);
            } catch (e) { console.error(e); job.fail(e.message); }
          }
          if (!d.imaging.some(x => x.ref)) { const rr = S.refImaging(d); if (rr) rr.ref = true; }
          await this.flushSave(); if (!o.noRender) this.renderImaging(); close(added);
        };
      });
    },
    /** volume d'une image du dossier (lecture du fichier, mise en cache) */
    async imagingVolume(im) {
      this._volCache = this._volCache || new Map(); if (this._volCache.has(im.id)) return this._volCache.get(im.id);
      const u8 = await L.readBytes(this.dossier, im.file); if (!u8) throw new Error('fichier absent du dossier (archive « légère » ?) : ' + im.label);
      const vol = await SV.Nifti.read(u8); this._volCache.set(im.id, vol);
      // mémoire : on garde au plus 6 volumes
      if (this._volCache.size > 6) { const k = this._volCache.keys().next().value; this._volCache.delete(k); }
      return vol;
    },
    async onDossierOpened(d) { this._volCache = new Map(); this._anatCache = null; this.ui.slv = null; this._slvKey = null; this._slvView = null; this._insetPts = null; if (this.loadPatientAnatomy) { try { await this.loadPatientAnatomy(d); } catch (e) { console.warn('anatomie patient', e); } }
      if (this.ui.dock && this.ui.screen === 'work' && this.toggleDock) this.toggleDock(true);
    },

    // ================================================================ écran
    /** catégories de la colonne des images (v4.21) : T1 (la plus récente en haut), FLAIR, TEP, puis les autres */
    imCategories(list) {
      const CATS = [['T1', ['T1', 'T1c'], 'T1'], ['FLAIR', ['FLAIR'], 'FLAIR'], ['PET', ['PET'], 'TEP'], ['CT', ['CT'], 'Scanner'], ['T2', ['T2'], 'T2'], ['SPECT', ['SPECT'], 'TEMP'], ['other', ['other'], 'Autres']];
      const byDate = (a, b) => String(b.date || '').localeCompare(String(a.date || '')) || (b.ref ? 1 : 0) - (a.ref ? 1 : 0);
      return CATS.map(([key, mods, label]) => ({ key, label, items: list.filter(im => mods.includes(im.modality) || (key === 'other' && !CATS.some(c => c[1].includes(im.modality)))).sort(byDate) })).filter(c => c.items.length);
    },
    async renderImaging() {
      const d = this.dossier, box = $('scr-imaging'); if (!d) return;
      if (this.ui.adj && this.adjustCoregEnd) this.adjustCoregEnd(true); if (this.ui.lmk && this.coregLandmarksEnd) this.coregLandmarksEnd(true);
      const ref = S.refImaging(d), list = d.imaging.filter(im => !im.derived), cats = this.imCategories(list), ui = this.ui;
      ui.imCat = ui.imCat || {}; ui.imRight = ui.imRight == null ? (localStorage.getItem('sv_im_right') !== '0') : ui.imRight;
      const an = d.anatomy, ex = S.explorationsSorted(d).filter(e => e.kind === 'seeg');
      box.innerHTML = `<div class="scr-inner wide imaging">
        <div class="scr-head"><h2>Imagerie</h2><span class="muted">${list.length} image${list.length > 1 ? 's' : ''}${ref ? ' · référence : ' + esc(V.modality[ref.modality]) + ' ' + fmtDate(ref.date) : ''}</span><span class="spacer"></span>
          <button id="imAdd" class="primary" title="fichiers NIfTI ou DICOM, ou un dossier DICOM entier (aussi : glisser-déposer dans la fenêtre)">+ Images ▾</button><button id="imAll" title="Recale toutes les images sur la référence, puis calcule l’anatomie du patient (parcellation VEP). Les électrodes se localisent dans SEEG › Localisation.">Recaler tout + anatomie</button></div>
        <div class="im-grid3${ui.imRight ? '' : ' right-collapsed'}">
          <div class="im-col im-left"><div class="card im-images"><div class="card-h">Images <span class="muted small">par catégorie, la plus récente en haut</span></div><div id="imList"></div></div></div>
          <div class="im-col main"><div class="card im-view" id="imPanel"></div></div>
          <div class="im-col im-right"><button class="im-rtoggle" id="imRightToggle" title="${ui.imRight ? 'replier' : 'déplier'} les post-traitements">${ui.imRight ? '▸' : '◂'}<span>Post-traitements</span></button><div class="im-rbody">
            <div class="card"><div class="card-h">Anatomie du patient</div><div id="imAnat"></div></div>
            <div class="card"><div class="card-h">Post-traitement <span class="muted small" style="margin-left:6px">sur les images recalées</span></div><div id="imPost"></div></div>
            <div class="card"><div class="card-h">Électrodes SEEG</div><div id="imElec"></div></div></div></div>
        </div></div>`;
      $('imAdd').onclick = e => this.imagePickMenu(e.currentTarget, files => this.importFiles(files));
      $('imAll').onclick = () => this.processAll();
      $('imRightToggle').onclick = () => { ui.imRight = !ui.imRight; localStorage.setItem('sv_im_right', ui.imRight ? '1' : '0'); this.renderImaging(); };
      const lb = $('imList');
      // v5.1 : chaque image repliable (titre : modalité, moment, date, référence / état du recalage) ; l'alerte « à vérifier »
      // se lève d'un clic une fois la superposition vérifiée
      ui.imOpen = ui.imOpen || {};
      const repId = m => { const r = (d.imagingRep || {})[m]; if (r && S.byId(d.imaging, r)) return r; const c = d.imaging.filter(x => x.modality === m && !x.derived && (x.ref || (x.coreg && x.coreg.T))).sort((a, b) => (b.ref ? 1 : 0) - (a.ref ? 1 : 0) || String(b.date).localeCompare(String(a.date)))[0]; return c ? c.id : null; };
      const item = im => {
        const warn = im.coreg && im.coreg.T && im.coreg.warnings && im.coreg.warnings.length && !im.coreg.checked, open = !!ui.imOpen[im.id];
        const st = im.ref ? '<span class="badge ok">référence</span>' : im.coreg && im.coreg.T ? `<span class="badge${warn ? ' warn' : ''}"${warn ? ' data-a="chk"' : ''} title="${esc(im.coreg.text || '')}${warn ? ' — clic : superposition vérifiée, retirer l’alerte' : ''}">${warn ? 'recalage à vérifier ✓?' : im.coreg.checked && im.coreg.warnings && im.coreg.warnings.length ? 'recalée · vérifiée' : im.coreg.manual ? 'recalée · ajustée' : 'recalée'}</span>` : '<span class="badge">à recaler</span>';
        const ym = im.date ? String(im.date).slice(5, 7) + '/' + String(im.date).slice(0, 4) : '';
        return `<div class="im-item${this.ui.imSel === im.id ? ' sel' : ''}${open ? ' open' : ''}" data-id="${im.id}"><div class="im-h"><button class="im-fold" data-a="fold" title="${open ? 'replier' : 'déplier'}">${open ? '▾' : '▸'}</button><b>${esc(V.modality[im.modality] || im.modality)}</b><span class="muted">${esc(V.timepoint[im.timepoint] || '')}${ym ? ' · ' + ym : ''}</span>${st}<span class="spacer"></span><button class="mini-btn" data-a="view">voir</button></div>${open ? `
          <div class="im-f"><select data-f="modality">${opts(V.modality, im.modality)}</select><select data-f="timepoint">${opts(V.timepoint, im.timepoint)}</select><input type="date" data-f="date" value="${esc(im.date)}"><label class="chip" title="image de référence (T1 pré-opératoire) : toutes les autres y sont recalées"><input type="radio" name="imref" data-ref${im.ref ? ' checked' : ''}> réf.</label>${['T1', 'FLAIR', 'PET', 'T1c'].includes(im.modality) && !im.derived ? `<label class="chip" title="examen affiché par les boutons rapides des coupes (T1, FLAIR, TEP + FLAIR)"><input type="radio" name="imrep-${im.modality}" data-rep${repId(im.modality) === im.id ? ' checked' : ''}> représentatif</label>` : ''}</div>
          <div class="im-m muted">${esc(im.label || '')} · ${(im.dims || []).join('×')} · ${(im.pixdim || []).map(v => (+v).toFixed(2)).join('×')} mm${im.coreg && im.coreg.text ? ' · ' + esc(im.coreg.text) : ''}</div>
          <div class="btnrow">${im.ref ? `<button class="mini-btn${im.acpc ? ' on' : ''}" data-a="acpc" title="redresser toutes les coupes sur la ligne AC-PC et le plan interhémisphérique (repères posés grossièrement sur cette IRM)">${im.acpc ? 'AC-PC ✓ (modifier)' : 'redresser (AC-PC)…'}</button>` : ''}${!im.ref ? `<button class="mini-btn" data-a="coreg">${im.coreg && im.coreg.T ? 'recaler à nouveau' : 'recaler sur la référence'}</button><button class="mini-btn" data-a="lmk" title="pointer le centre du cerveau (et AC, PC, ligne médiane) sur les deux images pour guider le recalage">repères…</button>` : ''}${im.coreg && im.coreg.T ? '<button class="mini-btn" data-a="nudge" title="ajuster le recalage à la main dans les coupes : déplacer, tourner, mettre à l’échelle (croissance)">ajuster</button>' : ''}<span class="spacer"></span><button class="mini-btn danger" data-a="del">✕</button></div>` : ''}</div>`;
      };
      lb.innerHTML = cats.map(c => { const open = ui.imCat[c.key] !== false; return `<details class="im-cat" data-cat="${c.key}"${open ? ' open' : ''}><summary><b>${esc(c.label)}</b><span class="muted">${c.items.length}</span>${c.items.some(x => x.ref) ? '<span class="badge ok">réf.</span>' : ''}${c.items.some(x => !x.ref && !(x.coreg && x.coreg.T)) ? '<span class="badge">à recaler</span>' : ''}</summary>${c.items.map(item).join('')}</details>`; }).join('') || '<div class="hint">Aucune image.</div>';
      lb.querySelectorAll('details.im-cat').forEach(dt => dt.ontoggle = () => { ui.imCat[dt.dataset.cat] = dt.open; });
      lb.querySelectorAll('.im-item').forEach(it => {
        const im = S.byId(d.imaging, it.dataset.id);
        it.querySelector('[data-a=fold]').onclick = () => { ui.imOpen[im.id] = !ui.imOpen[im.id]; this.renderImaging(); };
        const ck = it.querySelector('[data-a=chk]'); if (ck) ck.onclick = e => { e.stopPropagation(); im.coreg.checked = S.now(); this.touch('imaging', im.id, 'recalage vérifié'); this.renderImaging(); };
        it.querySelectorAll('[data-f]').forEach(el => el.onchange = () => { im[el.dataset.f] = el.value; this.touch('imaging', im.id, im.label); this.renderImaging(); });
        const rp = it.querySelector('[data-rep]'); if (rp) rp.onchange = () => { (d.imagingRep = d.imagingRep || {})[im.modality] = im.id; this.touch('imaging', im.id, 'examen représentatif'); if (this.renderImagingBar) this.renderImagingBar(); };
        const rf = it.querySelector('[data-ref]'); if (rf) rf.onchange = () => { if (im.modality !== 'T1' && !confirm('La référence est habituellement un T1 pré-opératoire 3D. Continuer ?')) { this.renderImaging(); return; } for (const x of d.imaging) x.ref = false; im.ref = true; for (const x of d.imaging) if (x !== im) x.coreg = null; this.touch('imaging', im.id, 'référence'); this.renderImaging(); };
        it.querySelector('[data-a=view]').onclick = () => {   // « voir » : l'image devient une superposition visible, cible du contraste
          this.ui.imSel = im.id; const st = this.slvState && this.slvState();
          if (st) { if (im.ref || im.id === st.base) st.wlTarget = 'base'; else { this.addOverlay(im.id); st.wlTarget = im.id; } }
          lb.querySelectorAll('.im-item').forEach(x => x.classList.toggle('sel', x.dataset.id === im.id)); this.renderSliceView();
        };
        const ac = it.querySelector('[data-a=acpc]'); if (ac) ac.onclick = () => { this.ui.imSel = im.id; const st = this.slvState && this.slvState(); if (st) { st.base = null; } this.renderSliceView().then(() => this.acpcTool()); };
        const c = it.querySelector('[data-a=coreg]'); if (c) c.onclick = () => this.coregImage(im);
        const k = it.querySelector('[data-a=lmk]'); if (k) k.onclick = () => this.coregLandmarks && this.coregLandmarks(im);
        const n = it.querySelector('[data-a=nudge]'); if (n) n.onclick = () => this.nudgeCoreg(im);
        const dl = it.querySelector('[data-a=del]'); if (dl) dl.onclick = async () => { if (!confirm(`Retirer « ${im.label} » du dossier (le fichier du dossier est supprimé) ?`)) return; await L.removeFile(d, im.file); S.remove(d, 'imaging', im.id); if (im.ref) { const r = S.refImaging(d); if (r) r.ref = true; } this.touch(); this.renderImaging(); };
      });
      this.renderAnatCard(); this.renderElecCard();
      if (this.mountImagingPanel) await this.mountImagingPanel($('imPanel'));
    },
    /** un seul point d'entrée pour importer des images (v5.1) : fichiers NIfTI / DICOM, ou un dossier DICOM entier ;
     *  aussi utilisé par la Localisation (scanner) — glisser-déposer un dossier dans la fenêtre fait de même */
    imagePickMenu(anchor, onFiles) {
      const r = anchor.getBoundingClientRect(), fi = $('fileNifti'), di = $('fileDicomDir');
      const pick = inp => { if (!inp) return; inp.value = ''; inp.onchange = e => { const F = [...e.target.files]; inp.value = ''; inp.onchange = null; if (F.length) onFiles(F); }; inp.click(); };
      this.popupMenu([{ head: 'Importer des images' }, { label: 'Fichiers NIfTI (.nii, .nii.gz) ou DICOM…', run: () => pick(fi) }, { label: 'Un dossier DICOM (export du PACS, CD)…', run: () => pick(di) },
        { node: Object.assign(document.createElement('div'), { className: 'hint', textContent: 'Ou glisser des fichiers ou un dossier n’importe où dans la fenêtre. Tout est copié dans le dossier du patient ; rien ne quitte le poste.' }) }], Math.min(r.left, window.innerWidth - 340), r.bottom + 4);
    },
    /** fichiers déposés ou choisis : NIfTI vers importNifti, le reste (DICOM) vers importDicom (v4.21) */
    async importFiles(files, o) {
      files = [...files]; const nii = files.filter(f => /\.nii(\.gz)?$/i.test(f.name)), rest = files.filter(f => !/\.nii(\.gz)?$/i.test(f.name) && !/\.(episcope|zip|json|png|jpe?g|mp4|webm|mov|csv|tsv|txt|pdf)$/i.test(f.name));
      let added = []; if (nii.length) added = added.concat(await this.importNifti(nii, o));
      if (rest.length && this.importDicom) added = added.concat(await this.importDicom(rest, o) || []);
      else if (!nii.length) this.toast('Aucun fichier NIfTI ni DICOM reconnu', 4000);
      return added;
    },

    // ---------------------------------------------------------------- visionneuse en coupes (imaging_panel.js)
    /** redessine les coupes là où elles sont affichées (écran Imagerie, sinon volet de la vue des crises) */
    async renderSliceView() {
      const host = this.ui.screen === 'imaging' ? $('imPanel') : this.ui.screen === 'loc' ? $('locPanel') : this.ui.dock ? $('sliceDock') : null; if (!host || !this.mountImagingPanel) return;
      if (this.slices && this._ipHost === host && host.isConnected && host.querySelector('.sv-slices')) { await this.updateImagingLayers(); this.renderImagingBar(); return; }
      await this.mountImagingPanel(host);
    },

    // ---------------------------------------------------------------- recalage
    /** o : { init (matrice 16 monde mobile → monde fixe : départ imposé, sans recherche d'orientation — repères, v4.21),
     *        dof (6 | 9 | 12), what (texte de la méthode) } */
    async coregImage(im, quiet, o) {
      const d = this.dossier, ref = S.refImaging(d); if (!ref || im === ref) return null; o = o || {};
      if (!SV.Coreg) { this.toast('Module de recalage absent de cette version'); return null; }
      const job = this.jobStart(`Recalage ${V.modality[im.modality]} → ${V.modality[ref.modality]}${o.init ? ' (repères)' : ''}`);
      try {
        const [fix, mov] = [await this.imagingVolume(ref), await this.imagingVolume(im)];
        const kind = im.modality === 'T1c' ? 'T1' : im.modality === 'other' ? 'MRI' : im.modality;
        // TEP / TEMP : masque du cerveau de l'anatomie (grille 1 mm conformée) ramené sur la grille du T1 par le moteur (v4.21 :
        // auparavant l'objet { dims, affine, data } était passé tel quel → « fixedMask : undefined voxels »)
        const mask = kind === 'PET' || kind === 'SPECT' ? (this.anatBrainMask ? await this.anatBrainMask(0) : null) : null;
        const opts = Object.assign({ movingKind: kind }, mask ? { fixedMask: mask, maskDilate: 4 } : {}, o.init ? { init: Array.from(o.init), search: false } : {}, o.dof ? { dof: o.dof } : {});
        const r = await SV.Coreg.rigidAsync(fix, mov, opts, p => job.progress(p && p.frac != null ? { fraction: p.frac, message: { pyramid: 'pyramide', search: 'recherche de l’orientation', retry: 'nouvel essai (grille large)', levels: 'affinage, niveau ' + (p.level != null ? p.level : '') }[p.phase] || '' } : p));
        const dec = SV.Coreg.decompose ? SV.Coreg.decompose(r.T, r.center) : null, q = r.quality || null, warn = r.warnings || [];
        const lmk = im.coreg && im.coreg.landmarks ? im.coreg.landmarks : null;
        im.coreg = { T: SV.Mat4.toArray(r.T), refId: ref.id, method: (o.what || 'rigide · information mutuelle normalisée (Powell)') + (o.init ? ' · départ sur repères' : ''), date: S.now(), quality: q, qc: r.qc || null, warnings: warn, landmarks: lmk, text: dec ? `t = ${dec.translation.map(v => v.toFixed(1)).join(', ')} mm · r = ${dec.rotations.map(v => v.toFixed(1)).join(', ')}°${q ? ' · NMI ' + q.nmi.toFixed(3) : ''}${warn.length ? ' · ⚠ ' + warn.join(' ; ') : ''}` : '' };
        S.log(d, 'compute', 'imaging', im.id, 'recalage ' + V.modality[im.modality]); this.touch();
        job.done(`${V.modality[im.modality]} recalée en ${(r.ms / 1000).toFixed(1)} s${warn.length ? ' — ⚠ ' + warn[0] : ''}`);
        if (warn.length && !quiet && this.coregSuggestLandmarks) this.coregSuggestLandmarks(im, warn[0]);
        if (!quiet) { this.ui.imSel = im.id; this.renderImaging(); }
        return r;
      } catch (e) { console.error(e); job.fail(e.message); if (this.coregSuggestLandmarks) this.coregSuggestLandmarks(im, e.message, true); return null; }
    },
    /** ajustement manuel du recalage : v4.21, coreg_ui.js (poignées dans les coupes : déplacer, tourner, mettre à l'échelle) */
    nudgeCoreg(im) { if (this.adjustCoreg) return this.adjustCoreg(im); },
    async processAll() {
      const d = this.dossier, ref = S.refImaging(d); if (!ref) { this.toast('Ajoutez d’abord un T1 de référence'); return; }
      for (const im of d.imaging) if (im !== ref && !(im.coreg && im.coreg.T)) await this.coregImage(im, true);
      if (this.computeAnatomy && !(d.anatomy && d.anatomy.status === 'done')) await this.computeAnatomy();
      this.renderImaging();
    },

    // ---------------------------------------------------------------- tâches longues (barre de progression)
    jobStart(title) {
      let bar = $('jobBar'); if (!bar) { bar = document.createElement('div'); bar.id = 'jobBar'; bar.className = 'job-bar'; document.body.appendChild(bar); }
      const el = document.createElement('div'); el.className = 'job'; el.innerHTML = `<span class="jt">${esc(title)}</span><span class="jp"><i></i></span><span class="jm"></span>`; bar.appendChild(el);
      const t0 = performance.now();
      return {
        progress(p, msg) { const f = typeof p === 'number' ? p : p && p.fraction != null ? p.fraction : null; if (f != null) el.querySelector('.jp i').style.width = Math.round(f * 100) + '%'; const m = msg || (p && p.message) || ''; if (m) el.querySelector('.jm').textContent = m; },
        done: (msg) => { el.classList.add('ok'); el.querySelector('.jp i').style.width = '100%'; el.querySelector('.jm').textContent = msg || `terminé (${((performance.now() - t0) / 1000).toFixed(0)} s)`; setTimeout(() => el.remove(), 6000); this.toast(msg || title + ' : terminé', 3000); },
        fail: (msg) => { el.classList.add('err'); el.querySelector('.jm').textContent = msg; setTimeout(() => el.remove(), 12000); this.toast(title + ' : ' + msg, 7000); },
      };
    },
    renderAnatCard() { const b = $('imAnat'); if (b && !this.renderAnatomyCard) b.innerHTML = '<div class="hint">Module d’anatomie absent de cette version.</div>'; else if (b) this.renderAnatomyCard(b); },
    /** Imagerie : les électrodes se reconstruisent dans l'étape SEEG (Localisation) ; ici, l'état et le lien */
    renderElecCard() {
      const b = $('imElec'), d = this.dossier; if (!b || !d) return;
      const exs = S.explorationsSorted(d).filter(e => e.kind === 'seeg');
      b.innerHTML = exs.length ? exs.map(ex => { const n = ex.electrodes.length, r = ex.electrodes.filter(e => e.real).length, ok = ex.electrodes.filter(e => e.real && e.real.checked).length; return `<div class="row-line"><b>${esc(ex.label)}</b> <span class="muted small">${n} électrode${n > 1 ? 's' : ''} au schéma · ${r} reconstruite${r > 1 ? 's' : ''}${r ? ' · ' + ok + ' vérifiée' + (ok > 1 ? 's' : '') : ''}</span> <button class="mini-btn" data-loc="${ex.id}">Localisation →</button></div>`; }).join('') + '<div class="hint">Scanner post-implantation : recalage, détection des électrodes, nommage d’après le schéma et vérification une à une dans SEEG › Localisation.</div>'
        : '<div class="hint">Pas de SEEG dans le parcours. Les électrodes se reconstruisent dans l’étape SEEG › Localisation, à partir du scanner post-implantation.</div>';
      b.querySelectorAll('[data-loc]').forEach(x => x.onclick = () => this.openExploration(x.dataset.loc, 'loc'));
    },
  };
  M.guessFromName = guessFromName;
  Object.assign(SV.app, M);
})(window.SV = window.SV || {});
