/* EpiScope — research_ui.js (v2.0.0) : « Export de recherche (BIDS anonymisé) » depuis la liste des patients.
 *  Choix des patients et des options, construction par SV.Research (research.js), contrôle d'identité de chaque fichier
 *  (un patient dont un fichier contient son nom, son IPP ou sa date de naissance n'est pas exporté), écriture dans un
 *  dossier choisi (Chrome, Edge) ou dans une archive .zip ; rapport d'export gardé dans la bibliothèque clinique.
 *  Le décalage des dates de chaque sujet est tiré une fois et gardé dans les réglages de la bibliothèque (le même d'un
 *  export à l'autre) : il ne sort jamais de la bibliothèque clinique.                                                */
(function (SV) {
  'use strict';
  const S = SV.Store, L = SV.Library, R = SV.Research, esc = SV.U.esc;
  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
  const latin1 = u => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return s; };

  const M = {
    async researchExportDialog() {
      if (this.dossier) { this.persistWorkspace(); await this.flushSave(); }
      const list = (await L.list()).filter(x => x.subject || true), canDir = typeof window.showDirectoryPicker === 'function';
      document.querySelectorAll('#rxDlg').forEach(x => x.remove());
      const box = document.createElement('div'); box.className = 'modal'; box.id = 'rxDlg';
      box.innerHTML = `<div class="modal-card wide"><div class="modal-head"><span>Export de recherche (BIDS anonymisé)</span><button class="close">✕</button></div>
        <p class="muted small">Jeu BIDS ${R.VERSION} (iEEG) : tracés (en-têtes EDF anonymisés), voies, évènements (crises), électrodes dans le repère du patient et en MNI305, crises, sémiologie, stimulations, thermocoagulations, résultats par plot, clinique. Codes neutres, dates décalées par sujet (intervalles conservés), âges au lieu des dates de naissance ; pas de vidéo, de capture ni de texte libre. Chaque fichier est contrôlé : un patient dont l’identité apparaîtrait quelque part n’est pas exporté.</p>
        <div class="rx-list">${list.map(x => `<label class="chk"><input type="checkbox" data-id="${x.id}" checked> <span class="mono">${esc(x.subject || '—')}</span> ${esc(this.dnameSum ? this.dnameSum(x) : '')}</label>`).join('') || '<div class="hint">Aucun patient.</div>'}</div>
        <div class="btnrow"><button class="mini-btn" data-a="all">tout cocher</button><button class="mini-btn" data-a="none">tout décocher</button></div>
        <label class="chk"><input type="checkbox" class="rx-ann" checked> annotations des fichiers de tracés (texte des évènements ; contrôlées comme le reste)</label>
        <label class="chk"><input type="checkbox" class="rx-t1"> T1 de référence (anat) — <span class="warn">le visage n’est pas masqué</span></label>
        <div class="rx-out muted small"></div>
        <div class="btnrow"><span class="spacer"></span><button class="close">Fermer</button><button class="primary rx-go">${canDir ? 'Choisir le dossier de destination et exporter…' : 'Exporter (archive .zip)'}</button></div></div>`;
      document.body.appendChild(box); box.hidden = false;
      box.querySelectorAll('.close').forEach(b => b.onclick = () => box.remove());
      box.querySelector('[data-a=all]').onclick = () => box.querySelectorAll('.rx-list input').forEach(c => c.checked = true);
      box.querySelector('[data-a=none]').onclick = () => box.querySelectorAll('.rx-list input').forEach(c => c.checked = false);
      box.querySelector('.rx-go').onclick = async () => {
        const ids = [...box.querySelectorAll('.rx-list input:checked')].map(c => c.dataset.id); if (!ids.length) return;
        let dir = null; if (canDir) { try { const parent = await window.showDirectoryPicker({ id: 'episcope-research', mode: 'readwrite' }); dir = await parent.getDirectoryHandle('episcope-bids-' + stamp(), { create: true }); } catch (e) { return; } }
        const out = box.querySelector('.rx-out'); box.querySelector('.rx-go').disabled = true;
        try { const rep = await this.researchExport(ids, { includeT1: box.querySelector('.rx-t1').checked, fileEvents: box.querySelector('.rx-ann').checked, dir, progress: t => { out.textContent = t; } });
          out.innerHTML = `<b>Export terminé</b> : patients exportés : ${rep.subjects.length}${rep.refused.length ? ` ; <span class="warn">non exportés (identité trouvée) : ${rep.refused.map(x => esc(x.sub + ' — ' + x.file)).join(', ')}</span>` : ''} ; fichiers : ${rep.files}.${rep.notes.length ? '<br>' + rep.notes.map(esc).join('<br>') : ''}${dir ? `<br>Dossier : ${esc(dir.name)}` : ''}`;
        } catch (e) { console.warn(e); out.innerHTML = `<span class="warn">Échec : ${esc(e.message)}</span>`; }
        box.querySelector('.rx-go').disabled = false;
      };
    },
    /** export : ids des dossiers ; o = { includeT1, fileEvents, dir (FileSystemDirectoryHandle) | null → .zip, progress } → rapport */
    async researchExport(ids, o) {
      o = o || {}; const prog = o.progress || (() => { }), st = await L.settings() || {}, shifts = Object.assign({}, st.shifts || {}); let newShift = false;
      const zip = [], put = async (path, data) => { if (o.dir) { const parts = path.split('/'); let h = o.dir; for (const p of parts.slice(0, -1)) h = await h.getDirectoryHandle(p, { create: true }); const fh = await h.getFileHandle(parts[parts.length - 1], { create: true }), w = await fh.createWritable(); await w.write(data); await w.close(); } else zip.push({ name: path, data }); };
      const rep = { at: S.now(), app: (window.EPISCOPE_BRAND || {}).version || '', bids: R.VERSION, options: { includeT1: !!o.includeT1, fileEvents: o.fileEvents !== false }, subjects: [], refused: [], files: 0, notes: [] }, parts = [];
      const db = this.db, signLabel = id => { const s = db && db.signById && db.signById.get(id); return s ? s.label_fr : ''; }, atlasLabel = i => this.atlas && this.atlas.labelEn ? this.atlas.labelEn(i) : i;
      for (const id of ids) {
        const d = await L.load(id); const sub = SV.BIDS.subOf(d); prog(`${sub} : préparation…`);
        if (!S.subjectLabel(d)) { rep.refused.push({ sub: sub, file: 'pas de code neutre' }); continue; }
        if (shifts[sub] == null) { shifts[sub] = R.newShift(); newShift = true; }
        // régions des plots : électrodes rangées dans la bibliothèque clinique (colonne region_vep)
        const regions = {}; try { for (const p of (await L.listFiles(d)).filter(p => /_electrodes\.tsv$/.test(p))) { const f = await L.readFile(d, p); if (!f) continue; const lines = (await f.text()).split('\n'), hd = lines[0].split('\t'), ci = hd.indexOf('region_vep'); if (ci < 0) continue; const m = /_ses-([a-zA-Z0-9]+)_/.exec(p), ex = m && d.explorations.find(e => SV.BIDS.sesOf(d, e) === m[1]); const tg = regions[ex ? ex.id : '_'] = regions[ex ? ex.id : '_'] || {}; for (const l of lines.slice(1)) { const c = l.split('\t'); if (c[ci] && c[ci] !== 'n/a') tg[c[0]] = c[ci]; } } } catch (e) { }
        for (const ex of d.explorations) if (!regions[ex.id] && regions._) regions[ex.id] = regions._;
        const B = R.buildSubject(d, { shift: shifts[sub], includeT1: o.includeT1, fileEvents: o.fileEvents, signLabel, atlasLabel, regions, db, version: rep.app }), secrets = R.secretsOf(d), ready = [];
        let bad = null;
        for (const f of B.files) {
          if (f.text != null) { if (R.scanSecrets(f.text, secrets).length) { bad = f.path; break; } ready.push([f.path, f.text]); continue; }
          prog(`${sub} : ${f.path.split('/').pop()}`);
          const file = await L.readFile(d, f.src.file); if (!file) { rep.notes.push(`${sub} : fichier introuvable dans la bibliothèque (${f.path.split('/').pop()})`); continue; }
          let u = new Uint8Array(await file.arrayBuffer());
          if (f.src.kind === 'edf') u = R.edfAnonShift(u, shifts[sub]);
          else if (f.src.kind === 'vmrk') u = new TextEncoder().encode(R.vmrkShift(new TextDecoder('latin1').decode(u), shifts[sub]));
          // contrôle : en-tête et annotations (texte) ; un NIfTI compressé n'est pas lisible tel quel (en-tête vérifié à part)
          if (!/\.nii\.gz$/.test(f.path) && R.scanSecrets(latin1(u), secrets).length) { bad = f.path; break; }
          ready.push([f.path, u]);
        }
        if (bad) { rep.refused.push({ sub, file: bad.split('/').pop() }); continue; }
        for (const [p, data] of ready) { await put(p, data); rep.files++; }
        rep.subjects.push(sub); parts.push(B.participant); rep.notes.push(...B.notes.map(n => `${sub} : ${n}`));
      }
      for (const f of R.datasetFiles(parts, { version: rep.app })) { await put(f.path, f.text); rep.files++; }
      if (newShift) await L.saveSettings(Object.assign({}, st, { shifts }));
      if (!o.dir) { prog('archive…'); const blob = await SV.Zip.write(zip); this.download('episcope-bids-' + stamp() + '.zip', blob, 'application/zip'); }
      // rapport gardé dans la bibliothèque clinique (pas dans le jeu exporté)
      try { if (L.writeRootFile) await L.writeRootFile('exports/recherche-' + stamp() + '.json', JSON.stringify(rep, null, 1)); } catch (e) { }
      return rep;
    },
  };
  Object.assign(SV.app, M);
})(window.SV = window.SV || {});
