/* EpiScope — patient_ui.js : dossiers patients dans l'application.
 *   - bibliothèque (répertoire local / partagé, ou navigateur), liste des patients, import / export (.episcope, .json),
 *     export de cohorte (tables CSV : une ligne par patient, exploration, crise, signe, hypothèse, décision, procédure…) ;
 *   - contexte de travail : patient › exploration › séance › crise ; l'espace de travail « crise » existant lit et écrit
 *     le dossier (SV.Store.toWorkspace / fromWorkspace), enregistrement automatique, détection des conflits ;
 *   - écran « Dossier » : chronologie du parcours (frise façon LifeLines), explorations / séances / crises, lésions,
 *     procédures, devenir, journal.
 * Les méthodes sont ajoutées à SV.app (même principe que seeg_ui.js).                                                */
(function (SV) {
  'use strict';
  const $ = id => document.getElementById(id), S = SV.Store, L = SV.Library, V = S.V;
  const esc = SV.U.esc;
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const LSget = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, LSset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
  const fmtDate = s => { if (!s) return ''; const d = new Date(String(s).length <= 10 ? s + 'T12:00:00' : s); return isNaN(d) ? String(s) : d.toLocaleDateString(SV.LOC, { day: '2-digit', month: '2-digit', year: 'numeric' }); };
  const fmtDT = s => { if (!s) return ''; const d = new Date(s); return isNaN(d) ? String(s) : d.toLocaleString(SV.LOC, { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); };
  const opts = (map, v) => Object.entries(map).map(([k, l]) => `<option value="${esc(k)}"${String(v) === k ? ' selected' : ''}>${esc(l)}</option>`).join('');
  const sanitize = s => String(s || 'patient').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\w\-]+/g, '_').slice(0, 50);

  /** date de mise à jour courte : « 2025-02-14 » → « 02/25 », « 2025 » → « 2025 » */
  const fmtMaj = s => { const m = String(s || '').match(/^(\d{4})(?:-(\d{2}))?/); return !m ? String(s || '') : m[2] ? `${m[2]}/${m[1].slice(2)}` : m[1]; };
  const M = {
    dossier: null, ctx: null,

    // ================================================================ démarrage
    async startDossiers() {
      await L.init(); this.setSaveState(this.dossier ? 'saved' : 'none');
      let list = [];
      try { list = await L.list(); } catch (e) { console.warn(e); }
      // reprise d'un cas v1 laissé dans le stockage local (première ouverture de la v2)
      const legacy = LSget('sv_case_v1');
      if (!L.pendingHandle && legacy && legacy.events && legacy.events.length && !LSget('sv_case_v1_migrated')) {
        const { dossier } = S.migrateCase(legacy); dossier.patient.pseudo = legacy.name || 'Cas restauré';
        await L.save(dossier); LSset('sv_case_v1_migrated', 1); list = await L.list();
        this.toast('Le dernier cas de la version précédente a été rangé dans un dossier patient', 5000);
      }
      const last = LSget('sv_last');
      if (!L.pendingHandle && last && list.some(x => x.id === last.dossierId)) { await this.openDossier(last.dossierId, { ctx: last.ctx, loc: last.loc, quiet: true }); return; }
      this.showRaw('patients');
    },

    bindDossierUI() {
      $('crPatients').onclick = () => this.showRaw('patients');
      $('crPatient').onclick = e => this.dossier ? this.patientMenu(e.currentTarget) : this.showRaw('patients');
      $('btnMore').onclick = e => this.moreMenu(e.currentTarget);
      $('btnTheme').onclick = () => this.setTheme(this.themeName() === 'light' ? 'dark' : 'light'); this.setTheme(document.documentElement.dataset.themePref || 'auto');
      if (window.matchMedia) matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (document.documentElement.dataset.themePref === 'auto') this.setTheme('auto'); });
      $('szHabitual').onchange = e => { const c = this.dossier && this.ctx && this.ctx.seizureId ? S.byId(this.dossier.seizures, this.ctx.seizureId) : null; if (c) { c.habitual = e.target.value; this.touch('seizure', c.id, c.label); } };
      document.querySelectorAll('#anatSwitch [data-anat]').forEach(b => b.onclick = () => this.setAnatomy ? this.setAnatomy(b.dataset.anat) : this.toast('Anatomie du patient : à calculer dans l’écran Imagerie'));
      window.addEventListener('pagehide', () => { if (this.dossier) { this.persistWorkspace(); if (this._saveState === 'pending') this.flushSave(); L.unlock(this.dossier); } });
      window.addEventListener('beforeunload', () => { if (this.dossier) { this.persistWorkspace(); if (this._saveState === 'pending') this.flushSave(); L.unlock(this.dossier); } });
      document.addEventListener('visibilitychange', () => { if (document.hidden && this.dossier) { this.persistWorkspace(); this.flushSave(); } });
      // glisser-déposer d'un dossier (.episcope) ou d'un cas (.json) n'importe où ; les NIfTI vont à l'écran Imagerie
      window.addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
      window.addEventListener('drop', async e => {
        if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return; e.preventDefault();
        const files = await this.droppedFiles(e);   // dossiers dépliés (DICOM)
        const isImg = f => /\.nii(\.gz)?$/i.test(f.name) || /\.(dcm|ima)$/i.test(f.name) || (f.relPath && f.relPath.includes('/') && !/\.(json|png|jpe?g|gif|webp|mp4|webm|avi|mov|pdf|docx?|csv|tsv|txt|md|html?)$/i.test(f.name)) || (!/\./.test(f.name) && f.size > 1000);
        const nii = files.filter(isImg), other = files.filter(f => !isImg(f));
        if (nii.length && this.importFiles) { if (!this.dossier) this.toast('Ouvrez d’abord le dossier du patient (liste des patients)', 4000); else { this.go({ stage: 'dossier', view: 'imagerie' }); this.importFiles(nii); } }
        for (const f of other) if (/\.(episcope|zip|json)$/i.test(f.name)) this.importFile(f);
        const imgs = other.filter(f => /^(image|video)\//.test(f.type) || /\.(mp4|webm|mov|m4v|mkv|avi|wmv|mpg|mpeg|flv|3gp|mts|m2ts)$/i.test(f.name));   // captures de tracés, images, vidéos : dans la galerie affichée
        if (imgs.length && this.dossier && this.galleryAdd) { const host = [...document.querySelectorAll('.gal-host')].find(x => x.isConnected && x.offsetParent !== null); if (host) this.galleryAdd(imgs, host._galCtx || {}).then(() => host._galRefresh && host._galRefresh()); else this.toast('Captures de tracés : ouvrez la galerie d’une étape (Phase 1 › Galerie, SEEG › Galerie) puis déposez-les ou Ctrl+V', 5000); }
      });
      const tb = document.querySelector('.topbar'); if (tb && window.ResizeObserver) new ResizeObserver(() => document.documentElement.style.setProperty('--top-h', tb.getBoundingClientRect().height + 'px')).observe(tb);
      this.updateCrumbs();
    },

    /** fichiers d'un dépôt, dossiers compris (webkitGetAsEntry, récursif) ; f.relPath = chemin dans le dossier déposé */
    async droppedFiles(e) {
      const items = e.dataTransfer.items ? [...e.dataTransfer.items] : [], out = [];
      const walk = (entry, path) => new Promise(res => {
        if (!entry) return res();
        if (entry.isFile) entry.file(f => { try { f.relPath = path + f.name; } catch (x) { /* lecture seule */ } out.push(f); res(); }, () => res());
        else if (entry.isDirectory) { const rd = entry.createReader(), all = []; const more = () => rd.readEntries(async ents => { if (!ents.length) { for (const en of all) await walk(en, path + entry.name + '/'); res(); } else { all.push(...ents); more(); } }, () => res()); more(); }
        else res();
      });
      const entries = items.map(it => it.webkitGetAsEntry ? it.webkitGetAsEntry() : null);
      if (entries.some(Boolean)) { for (const en of entries) await walk(en, ''); if (out.length) return out; }
      return [...e.dataTransfer.files];
    },

    // ================================================================ enregistrement
    setSaveState(s, msg) {
      const el = $('saveState'); if (!el) return; this._saveState = s;
      el.className = 'save-state ' + s; el.title = msg || { none: 'Aucun dossier ouvert : la crise en cours est gardée dans ce navigateur', pending: 'Modifications en attente d’enregistrement', saving: 'Enregistrement…', saved: 'Enregistré · ' + L.describe(), error: 'Erreur d’enregistrement', conflict: 'Conflit : le dossier a été modifié ailleurs' }[s] || '';
    },
    /** l'espace de travail a changé : réécriture dans le dossier (appelé par changed()) */
    persistWorkspace() {
      if (this._loading || this._reportBusy) return;   // pendant la génération d'un rapport, les crises rejouées ne sont pas réécrites
      if (!this.dossier || !this.ctx) return;   // pas de crise hors d'un dossier patient
      const r = S.fromWorkspace(this.dossier, this.ctx, this.state);
      if (r.ctx && r.ctx.seizureId !== this.ctx.seizureId) { this.ctx = Object.assign({}, this.ctx, r.ctx); this.rememberCtx(); this.updateCrumbs(); }
      if (r.changed) this.scheduleSave();
    },
    /** modification hors espace de travail (dossier, staff, imagerie) */
    touch(kind, id, text) { if (!this.dossier) return; if (kind) S.log(this.dossier, 'edit', kind, id, text, L.user); this.scheduleSave(); },
    scheduleSave() { if (!this.dossier) return; this.setSaveState('pending'); clearTimeout(this._saveT); this._saveT = setTimeout(() => this.flushSave(), 900); },
    async flushSave() {
      clearTimeout(this._saveT); const d = this.dossier; if (!d || this._saveState !== 'pending') return;
      if (this._saving) { this._saveAgain = true; return; }
      this._saving = true; this.setSaveState('saving');
      try {
        const r = await L.save(d);
        if (r.ok) this.setSaveState('saved'); else if (r.conflict) { this.setSaveState('conflict'); this.onConflict(r); }
      } catch (e) { console.error(e); this.setSaveState('error', 'Erreur d’enregistrement : ' + e.message); this.toast('Enregistrement impossible : ' + e.message, 6000); }
      this._saving = false; if (this._saveAgain) { this._saveAgain = false; this.setSaveState('pending'); this.flushSave(); }
    },
    onConflict(r) {
      const d = this.dossier;
      this.choice(`Le dossier « ${esc(d.patient.pseudo)} » a été enregistré sur un autre poste pendant que vous le modifiiez (version ${r.diskRevision}, ${fmtDT(r.diskUpdated)}). Votre version a été mise de côté dans <code>${esc(r.file)}</code>, sans rien écraser.`, [
        { label: 'Recharger la version enregistrée', primary: true, run: () => this.openDossier(d.id, { ctx: this.ctx, loc: this.loc }) },
        { label: 'Écraser avec ma version', danger: true, run: () => { d._base = r.diskRevision; this.setSaveState('pending'); this.flushSave(); } },
      ]);
    },

    // ================================================================ ouverture d'un dossier, contexte
    async openDossier(id, o) {
      o = o || {};
      if (this.dossier) { this.persistWorkspace(); await this.flushSave(); await L.unlock(this.dossier); }
      let d; try { d = await L.load(id); } catch (e) { this.toast('Dossier illisible : ' + e.message, 5000); return; }
      const lk = await L.lockInfo(id);
      if (lk && !o.quiet && !confirm(`Ce dossier est ouvert par ${lk.user} depuis ${fmtDT(lk.t)}.\nL’ouvrir quand même ? (si vous enregistrez tous les deux, EpiScope détecte le conflit et n’écrase rien)`)) return;
      this.dossier = d; await L.lock(d); clearInterval(this._lockT); this._lockT = setInterval(() => this.dossier && L.lock(this.dossier), 5 * 60000);
      this.setSaveState('saved');
      if (this.onDossierOpened) await this.onDossierOpened(d);   // anatomie du patient (imaging_ui)
      const mine = this.uiSlot(d);
      let ctx = o.ctx || mine.lastCtx || d.ui.lastCtx;
      if (ctx && !S.resolveCtx(d, ctx)) ctx = null;
      if (!ctx) { const all = S.allSeizures(d); ctx = all.length ? { seizureId: all[all.length - 1].id } : d.explorations.length ? { explorationId: S.explorationsSorted(d).pop().id } : null; }
      if (ctx) this.openContext(ctx, true); else { this.ctx = null; this._loading = true; this.newCase(true); this._loading = false; }
      this.loc = null;
      // fermé explicitement la dernière fois (menu ⋯ › Fermer le dossier) : on rouvre sur la synthèse du dossier
      let closed = false; try { const cl = JSON.parse(localStorage.getItem('sv_closed') || '[]'); closed = cl.includes(id); if (closed) localStorage.setItem('sv_closed', JSON.stringify(cl.filter(x => x !== id))); } catch (e) { }
      const loc = o.loc || (closed ? { stage: 'dossier', view: 'synthese' } : mine.loc || d.ui.loc) || null;
      if (o.screen === 'patients') this.showRaw('patients'); else this.go(loc && this.stageByKey(loc.stage) ? loc : { stage: 'dossier', view: 'synthese' });
      if (!o.quiet) this.toast('Dossier « ' + d.patient.pseudo + ' » ouvert', 1800);
    },
    /** v5 — emplacement de reprise propre à chaque utilisateur (initiales) dans le dossier partagé : d.ui.byUser[initiales] ;
     *  sans initiales, l'ancien emplacement commun (d.ui.lastCtx / loc) reste utilisé */
    uiSlot(d) { const u = (L.user || '').trim(); if (!u) return d.ui; d.ui.byUser = d.ui.byUser || {}; return d.ui.byUser[u] = d.ui.byUser[u] || {}; },
    rememberCtx() { if (!this.dossier) return; const slot = this.uiSlot(this.dossier); slot.lastCtx = this.ctx; if (this.loc) slot.loc = this.loc; slot.at = S.now(); if (slot !== this.dossier.ui) { this.dossier.ui.lastCtx = this.ctx; if (this.loc) this.dossier.ui.loc = this.loc; } LSset('sv_last', { dossierId: this.dossier.id, ctx: this.ctx, loc: this.loc }); },
    /** ouvre une crise ({seizureId}) ou une exploration sans crise ({explorationId}) dans l'espace de travail */
    openContext(ctx, silent) {
      const d = this.dossier; if (!d) return;
      if (this.ctx) this.persistWorkspace();
      const c = S.resolveCtx(d, ctx); if (!c) return;
      const st = S.toWorkspace(d, ctx);
      this.ctx = { seizureId: c.seizure ? c.seizure.id : null, explorationId: c.exploration.id };
      this._loading = true; this.ui.t = 0; this.ui.selected = null; this.ui.selElec = null; this.chronoReset();
      try { this.loadCase(st); } finally { this._loading = false; }
      $('szHabitual').value = c.seizure ? c.seizure.habitual || '?' : '?'; $('szHabitual').disabled = !c.seizure;
      if (this.ui.tab === 'seegsz' && this.renderSeegSeizure) this.renderSeegSeizure();   // v5 : l'onglet Électrique suit la crise ouverte (plots marqués de la crise précédente sinon affichés)
      this.rememberCtx(); this.updateCrumbs();
      if (!silent) this.toast(c.seizure ? `${c.exploration.label} · ${c.seizure.label}` : `${c.exploration.label} · implantation et SEEG (aucune crise saisie)`, 1600);
    },
    /** date de la séance + heure courante (format datetime-local) */
    defaultDT(date) { const n = new Date(), hm = String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0'); return (date || S.today()).slice(0, 10) + 'T' + hm; },
    caseTitle() {
      if (!this.dossier) return this.state.name || 'cas';
      const c = this.ctx ? S.resolveCtx(this.dossier, this.ctx) : null;
      return [this.dossier.patient.pseudo, c && c.exploration.label, c && c.session && c.session.label, c && c.seizure && c.seizure.label].filter(Boolean).join(' — ');
    },
    /** fil d'Ariane et barre du parcours */
    updateCrumbs() { if (this.renderParcours) { this.renderParcours(); this.renderSubbar(); } const d = this.dossier; if (d && $('dominant')) $('dominant').value = d.patient.dominant === 'R' ? 'R' : 'L'; },

    // ---------------------------------------------------------------- liste des patients
    /** pied de la liste des patients : statut de l'outil, conception (ORCID), Aide · Crédits · Mentions légales (legal.js) */
    footHtml() {
      const B = this.brand();
      const orcid = B.orcid ? ` <a class="orcid" href="https://orcid.org/${esc(B.orcid)}" target="_blank" rel="noopener" title="ORCID ${esc(B.orcid)}" aria-label="ORCID"><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#A6CE39"/><path fill="#fff" d="M7.6 17.3H6.2V7.2h1.4v10.1zM6.9 4.6a.9.9 0 1 1 0 1.9.9.9 0 0 1 0-1.9zM10 7.2h3.8c3.6 0 5.2 2.6 5.2 5.1 0 2.7-2.1 5.1-5.2 5.1H10V7.2zm1.4 8.9h2.3c3.2 0 3.9-2.4 3.9-3.8 0-2.3-1.5-3.8-3.9-3.8h-2.3v7.6z"/></svg></a>` : '';
      const author = B.author || (B.credit || '').replace(/ et al\.?$/, '');
      return `<div class="app-foot"><div class="of-txt">
        <div><b>${esc(B.name)}</b>${B.status ? ` – <i>${esc(B.status)}</i>` : ''}</div>
        ${author ? `<div><span>Conception</span> ${esc(author)}${orcid}</div>` : ''}
        <div class="of-links"><button type="button" data-foot="help">Aide</button> – <button type="button" data-foot="credits">Crédits</button> – <button type="button" data-foot="legal">Mentions légales</button></div></div></div>`;
    },
    async renderPatients() {
      const box = $('scr-patients'); box.innerHTML = '<div class="scr-inner"><div class="hint">Lecture de la bibliothèque…</div></div>';
      let list = []; try { if (!L.pendingHandle) list = await L.list(); } catch (e) { this.toast('Bibliothèque illisible : ' + e.message, 5000); }
      const q = (this._pq || '').toLowerCase(), shown = list.filter(x => !q || (x.pseudo || '').toLowerCase().includes(q) || x.stage.text.toLowerCase().includes(q));
      const counts = {}; for (const x of list) counts[x.stage.key] = (counts[x.stage.key] || 0) + 1;
      const stageFr = { new: 'nouveaux', phase1: 'phase 1', seeg: 'SEEG', other: 'autre exploration', decided: 'décision prise', operated: 'opérés', followup: 'suivis' };
      box.innerHTML = `<div class="scr-inner">
        <div class="scr-head"><h2>Patients</h2><span class="muted">${list.length} dossier${list.length > 1 ? 's' : ''}${Object.keys(counts).length ? ' · ' + Object.entries(counts).map(([k, n]) => `${n} ${stageFr[k] || k}`).join(' · ') : ''}</span><span class="spacer"></span>
          <button id="pNew" class="primary">+ Nouveau patient</button><button id="pImport">Importer un dossier…</button><button id="pCohort" title="Toutes les données de tous les patients en tables CSV (Excel, R, Python) : une ligne par patient, exploration, séance, crise, signe, lésion, hypothèse, décision, procédure, devenir">Exporter la cohorte (CSV)</button></div>
        <div class="lib-bar"><span><b>Bibliothèque :</b> ${esc(L.describe())}</span>
          ${L.pendingHandle ? `<button id="pReopen" class="primary">Rouvrir « ${esc(L.pendingHandle.name)} »</button>` : ''}
          ${L.supportsFolder() ? `<button id="pFolder">${L.mode === 'folder' ? 'Changer de répertoire…' : 'Choisir un répertoire (disque, partage réseau)…'}</button>` : '<span class="hint">Ce navigateur ne permet pas d’utiliser un répertoire : utilisez Chrome ou Edge pour une bibliothèque partagée.</span>'}
          ${L.mode === 'folder' ? '<button id="pBrowser" class="ghost">Revenir au stockage du navigateur</button>' : ''}
          <label title="utilisateur de ce poste : ses initiales signent le journal de chaque dossier">Utilisateur <select id="pUser">${(() => { const P0 = SV.People, me = P0 && P0.me(), us = P0 ? P0.dir.users : []; return `<option value="">${esc(me ? '' : (L.user ? L.user + ' (initiales)' : '—'))}</option>` + us.map(u => `<option value="${esc(u.id)}"${me && me.id === u.id ? ' selected' : ''}>${esc(P0.label(u))}</option>`).join(''); })()}</select> <button class="mini-btn" id="pPeople" title="annuaire des utilisateurs de la bibliothèque (partagé par tous les postes)">annuaire…</button></label></div>
        ${L.mode === 'browser' && !L.pendingHandle ? '<div class="note">Les dossiers sont pour l’instant gardés dans ce navigateur, sur ce poste. Choisissez un répertoire (de préférence le partage réseau de l’équipe) pour les conserver durablement et les partager ; chaque patient y devient un sous-répertoire lisible (dossier.json, images, dérivés).</div>' : ''}
        <input id="pSearch" class="search" placeholder="Rechercher (pseudonyme, étape)…" value="${esc(this._pq || '')}">
        <table class="ptable"><thead><tr><th>Pseudonyme</th><th>Étape du parcours</th><th>Explorations</th><th>Crises</th><th>Imagerie</th><th>Mis à jour</th><th></th></tr></thead><tbody>
        ${shown.map(x => `<tr data-id="${esc(x.id)}" class="${this.dossier && this.dossier.id === x.id ? 'cur' : ''}"><td><b>${esc(x.pseudo || '—')}</b>${x.lock ? ` <span class="badge warn" title="ouvert par ${esc(x.lock.user)} depuis ${esc(fmtDT(x.lock.t))}">ouvert par ${esc(x.lock.user)}</span>` : ''}</td><td><span class="stage st-${esc(x.stage.key)}">${esc(x.stage.text)}</span></td><td>${x.nExpl}</td><td>${x.nSeizures}</td><td>${x.nImaging}${x.anatomy ? ' · <span class="ok">anatomie</span>' : ''}</td><td>${esc(fmtDT(x.updated))}</td>
          <td class="acts"><button data-a="open" class="primary">Ouvrir</button><button data-a="export">Exporter</button><button data-a="del" class="danger" title="Supprimer le dossier">✕</button></td></tr>`).join('') || `<tr><td colspan="7" class="hint">${list.length ? 'Aucun dossier ne correspond.' : L.pendingHandle ? 'Rouvrez la bibliothèque pour voir les dossiers.' : 'Aucun dossier. Créez un patient, ou importez un dossier reçu d’un collègue (.episcope) ou un cas EpiScope (.json).'}</td></tr>`}
        </tbody></table>
        <div class="hint" style="margin-top:14px">Pseudonymes uniquement (pas de nom, pas de date de naissance complète) : la table de correspondance reste dans le dossier médical. Un dossier exporté (.episcope) contient tout ce qui a été saisi et calculé ; la version « légère » laisse de côté les images d’origine pour tenir dans un mail.</div>${this.footHtml()}</div>`;
      $('pNew').onclick = () => this.newPatient();
      $('pImport').onclick = () => { $('fileOpen').value = ''; $('fileOpen').click(); };
      $('pCohort').onclick = () => this.exportCohort();
      if ($('pReopen')) $('pReopen').onclick = async () => { if (await L.reopen()) { this.toast('Bibliothèque « ' + L.rootName + ' » rouverte'); const last = LSget('sv_last'); const lst = await L.list(); if (last && lst.some(x => x.id === last.dossierId)) await this.openDossier(last.dossierId, { ctx: last.ctx, screen: 'patients', quiet: true }); this.renderPatients(); } };
      if ($('pFolder')) $('pFolder').onclick = async () => { try { if (this.dossier) { this.persistWorkspace(); await this.flushSave(); await L.unlock(this.dossier); } const prev = L.mode === 'browser' ? await this.browserDossiers() : []; const name = await L.chooseFolder(); this.dossier = null; this.ctx = null; this.updateCrumbs(); this.setSaveState('none'); if (prev.length && confirm(`${prev.length} dossier(s) sont gardés dans ce navigateur. Les copier dans « ${name} » ?`)) await this.copyBrowserDossiers(prev); this.renderPatients(); } catch (e) { if (e.name !== 'AbortError') this.toast(e.message, 5000); } };
      if ($('pBrowser')) $('pBrowser').onclick = async () => { if (this.dossier) { this.persistWorkspace(); await this.flushSave(); await L.unlock(this.dossier); } await L.useBrowser(); this.dossier = null; this.ctx = null; this.updateCrumbs(); this.setSaveState('none'); this.renderPatients(); };
      $('pUser').onchange = e => { if (e.target.value) SV.People.setMe(e.target.value); };
      $('pPeople').onclick = () => this.peopleDialog();
      $('pSearch').oninput = e => { this._pq = e.target.value; clearTimeout(this._pqT); this._pqT = setTimeout(() => { this.renderPatients().then(() => { const s = $('pSearch'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }); }, 250); };
      box.querySelectorAll('tr[data-id]').forEach(tr => {
        const id = tr.dataset.id;
        tr.querySelector('[data-a=open]').onclick = () => this.openDossier(id, {});
        tr.querySelector('td b').onclick = () => this.openDossier(id, {});
        tr.querySelector('[data-a=export]').onclick = e => this.exportMenu(e.target, id);
        tr.querySelector('[data-a=del]').onclick = async () => {
          const x = list.find(y => y.id === id);
          const typed = prompt(`Supprimer définitivement « ${x.pseudo} » et TOUTES ses données : explorations, crises, staffs, imagerie (NIfTI), anatomie et dérivés, électrodes, galerie EEG, journal.\nExportez d’abord le dossier si besoin. Tapez le pseudonyme pour confirmer :`);
          if (typed !== x.pseudo) { if (typed != null) this.toast('Pseudonyme différent : rien n’a été supprimé', 3000); return; }
          if (this.dossier && this.dossier.id === id) await this.closeDossier();
          await L.remove(id);
          try { const last = LSget('sv_last'); if (last && last.dossierId === id) localStorage.removeItem('sv_last'); } catch (e) { }
          this.toast(`« ${x.pseudo} » supprimé, avec ses fichiers`, 3500); this.renderPatients();
        };
        tr.ondblclick = () => this.openDossier(id, {});
      });
    },
    async browserDossiers() { const keep = L.mode; if (keep !== 'browser') return []; const out = []; for (const x of await L.list()) out.push(await L.load(x.id)); return out; },
    async copyBrowserDossiers(list) {
      // les fichiers sont relus depuis IndexedDB avant de basculer vers le répertoire
      let n = 0; const root = L.root, rootName = L.rootName;
      for (const d of list) {
        L.mode = 'browser'; const files = []; for (const p of await L.listFiles(d)) files.push([p, await L.readFile(d, p)]);
        L.mode = 'folder'; L.root = root; L.rootName = rootName; d._base = 0; await L.save(d); for (const [p, b] of files) await L.writeFile(d, p, b); n++;
      }
      this.toast(n + ' dossier(s) copiés dans « ' + rootName + ' »', 4000);
    },
    newPatient() {
      const pseudo = prompt('Pseudonyme du nouveau patient (ex. STR-0042 ; pas de nom en clair) :'); if (!pseudo || !pseudo.trim()) return;
      const d = S.newDossier({ pseudo: pseudo.trim() }); S.log(d, 'create', 'dossier', d.id, 'création', L.user);
      const ex = S.addExploration(d, { kind: 'phase1' }); S.addSession(d, ex.id, { date: S.today() });
      L.save(d).then(() => this.openDossier(d.id, { loc: { stage: 'dossier', view: 'synthese' } }));
    },

    // ---------------------------------------------------------------- import / export
    async importFile(f) {
      const name = f.name.toLowerCase();
      try {
        if (/\.(episcope|zip)$/.test(name)) return this.importBundle(await L.readBundle(f));
        const j = JSON.parse(await f.text());
        if (j.format === 'episcope-dossier') return this.importBundle({ dossier: S.normalize(j), meta: {}, files: new Map() });
        if (Array.isArray(j.events)) {
          // cas v1 (une crise) : dans le dossier ouvert, ou nouveau dossier
          if (this.dossier && confirm(`Ajouter cette crise (« ${j.name || f.name} ») au dossier ouvert « ${this.dossier.patient.pseudo} » ?\nAnnuler = créer un nouveau dossier patient.`)) {
            this.persistWorkspace(); const { seizure } = S.migrateCase(j, this.dossier); this.touch(); this.openSeizure(seizure.id); return;
          }
          const { dossier, seizure } = S.migrateCase(j); const p = prompt('Pseudonyme du patient :', dossier.patient.pseudo); if (p) dossier.patient.pseudo = p.trim();
          await L.save(dossier); await this.openDossier(dossier.id, { ctx: { seizureId: seizure.id }, loc: { seizureId: seizure.id, view: 'crise' } }); return;
        }
        throw new Error('format non reconnu');
      } catch (e) { console.error(e); this.toast('Import impossible : ' + e.message, 6000); }
    },
    async importBundle(b) {
      const d = b.dossier, exists = await L.exists(d.id);
      const go = async mode => { const out = await L.importBundle(b, mode); this.toast(`Dossier « ${out.patient.pseudo} » importé (${b.files.size} fichier${b.files.size > 1 ? 's' : ''})${b.meta.light ? ' · version légère, sans les images d’origine' : ''}`, 5000); await this.openDossier(out.id, { loc: { stage: 'dossier', view: 'synthese' }, quiet: true }); };
      if (!exists) return go('new');
      const local = await L.load(d.id);
      this.choice(`Le dossier « ${esc(d.patient.pseudo)} » existe déjà dans votre bibliothèque.<br>Archive : version ${d.revision}, ${esc(fmtDT(d.updated))}${b.meta.by ? ', envoyée par ' + esc(b.meta.by) : ''}.<br>Votre copie : version ${local.revision}, ${esc(fmtDT(local.updated))}.`, [
        { label: 'Remplacer ma copie par l’archive', primary: String(d.updated) > String(local.updated), run: () => go('replace') },
        { label: 'Garder les deux (copie)', run: () => go('copy') },
      ]);
    },
    async exportBundleUI(id, light) {
      const d = id && (!this.dossier || this.dossier.id !== id) ? await L.load(id) : this.dossier;
      if (!d) { this.toast('Aucun dossier ouvert : ouvrez ou créez un patient'); return; }
      if (d === this.dossier) { this.persistWorkspace(); await this.flushSave(); }
      this.toast('Préparation de l’archive…', 2000);
      const blob = await L.exportBundle(d, { light });
      this.download(`${sanitize(d.patient.pseudo)}${light ? '_leger' : ''}.episcope`, blob);
      this.toast(`${(blob.size / 1e6).toFixed(1)} Mo · à ouvrir dans EpiScope (Fichier → Importer) sur le poste du collègue`, 5000);
    },
    exportMenu(anchor, id) {
      const run = kind => kind === 'case' ? this.saveCase() : this.exportBundleUI(id, kind === 'light');
      const items = [{ head: 'Exporter' }, { label: 'Dossier complet (.episcope) — avec les images', run: () => run('full') }, { label: 'Dossier léger (.episcope) — sans les images d’origine (mail)', run: () => run('light') }];
      if (!id) items.push({ label: 'Crise seule (.json, format v1)', run: () => run('case') });
      items.push({ sep: true }, { label: 'Cohorte : tables CSV (tous les patients)', run: () => this.exportCohort() });
      const r = anchor.getBoundingClientRect(); this.popupMenu(items, r.left, r.bottom + 4);
    },
    /** cohorte : une table par entité (format long), pour des questions de recherche posées après coup */
    async exportCohort() {
      if (this.dossier) { this.persistWorkspace(); await this.flushSave(); }
      this.toast('Lecture des dossiers…', 2000);
      const all = []; for (const x of await L.list()) { try { all.push(await L.load(x.id)); } catch (e) { } }
      const T = { patients: [], explorations: [], sessions: [], seizures: [], signs: [], lesions: [], imaging: [], stimulations: [], thermocoagulations: [], hypotheses: [], decisions: [], meetings: [], procedures: [], outcomes: [], contacts: [], quant: [], transforms: [] };
      const M4 = SV.Mat4, r2 = v => v == null || !isFinite(v) ? '' : Math.round(v * 100) / 100;
      const reg = i => this.atlas ? this.atlas.labelEn(i) : i, regs = a => (a || []).map(reg).join('|');
      for (const d of all) {
        const P = d.patient, pid = P.pseudo;
        T.patients.push({ patient: pid, sex: P.sex, birth_year: P.birthYear, etiologies: S.etiologyText(P), frequency_current: P.frequency, frequency_date: P.frequencyDate || '', handedness: P.handedness, language_dominance: P.dominant, dominance_method: P.dominanceMethod, onset_age: P.onsetAge, onset_age_unit: P.onsetAgeUnit || 'y', onset_age_years: S.onsetYears(P), etiology: P.etiology, mri: P.mri, n_explorations: d.explorations.length, n_seizures: d.seizures.length, stage: S.stage(d).text, updated: d.updated });
        // v5 — cohorte multi-patients : transformation patient → gabarit (MNI305 / fsaverage tkrRAS), plots réels en espace du T1 et
        // en espace du gabarit (même affine 12 ddl que la parcellation), valeurs des jeux d'analyses par plot ou paire
        const an = d.anatomy || {}, Tt = an.toTemplate ? M4.from(an.toTemplate) : null;
        if (Tt) T.transforms.push(Object.assign({ patient: pid, space_from: 'T1w (RAS scanner du T1 de référence)', space_to: 'template tkrRAS (fsaverage / MNI305)', method: an.method || '', rms_mm: an.fit && an.fit.rms, reference: an.refLabel || '' }, Object.fromEntries(Array.from(Tt).map((v, i) => ['m' + Math.floor(i / 4) + (i % 4), +v.toFixed(6)]))));
        let regTsv = null; try { const names = (await L.listFiles(d)).filter(p => /derivatives\/ieeg\/.*_electrodes\.tsv$/.test(p)); if (names.length) { const f = await L.readFile(d, names[0]); if (f) regTsv = await f.text(); } } catch (e) { }
        const regOf = new Map(); if (regTsv) for (const line of regTsv.split('\n')) { const f = line.split('\t'); if (f.length > 5 && f[0] !== 'name') regOf.set(f[0], f[f.length - 1]); }
        for (const ex of d.explorations) {
          T.explorations.push({ patient: pid, exploration: ex.label, kind: ex.kind, rank: ex.rank, start: ex.start, end: ex.end, status: ex.status, center: ex.center, n_electrodes: ex.electrodes.length, n_stims: ex.stims.length, n_thermo: ex.thermo.length, maker: ex.maker || '' });
          for (const e of ex.electrodes) { const R = e.real; if (!R || !R.contacts) continue; R.contacts.forEach((c, k) => { const q = Tt ? M4.apply(Tt, c[0], c[1], c[2]) : null, nm = e.name.replace(/’/g, "'") + (k + 1); T.contacts.push({ patient: pid, exploration: ex.label, electrode: e.name, contact: k + 1, name: nm, hemisphere: e.hemi, maker: e.maker || ex.maker || '', model: e.model || '', x_t1: r2(c[0]), y_t1: r2(c[1]), z_t1: r2(c[2]), x_mni305: q ? r2(q[0]) : '', y_mni305: q ? r2(q[1]) : '', z_mni305: q ? r2(q[2]) : '', region_vep: regOf.get(nm) || regOf.get(e.name + (k + 1)) || '', checked: R.checked ? 1 : 0 }); }); }
          for (const qs of ex.quant || []) for (const [key, v] of Object.entries(qs.values || {})) T.quant.push({ patient: pid, exploration: ex.label, set: qs.name, method: qs.method || '', unit: qs.unit || '', key, value: v, threshold: qs.thr == null ? '' : qs.thr, source: qs.source || '' });
          for (const s of ex.stims) T.stimulations.push({ patient: pid, exploration: ex.label, pair: `${s.elec}${s.c1}-${s.c2}`, mode: s.mode, freq: s.freq, pulse_ms: s.pulse, dur_s: s.dur, mA: s.mA, clinical: s.clin ? 1 : 0, clinical_type: s.clin ? (SV.Seeg.clinTypeOf(s) === 'subj' ? 'subjective' : 'fonctionnelle') : '', sign: s.clinText, habitual: s.habitual ? 1 : 0, afterdischarge: s.ad ? 1 : 0, ad_s: s.adDur, seizure: s.sz ? 1 : 0, seizure_habitual: s.szHabitual ? 1 : 0, ccep: (s.ccep || []).join('|'), time: s.t });
          for (const t of ex.thermo) T.thermocoagulations.push({ patient: pid, exploration: ex.label, pair: `${t.elec}${t.c1}-${t.c2}`, status: S.thermoStatusOf(t), validated_by: t.validatedBy || '', date: t.date, note: t.note });
          for (const ses of S.sessionsOf(d, ex.id)) {
            T.sessions.push({ patient: pid, exploration: ex.label, session: ses.label, date: ses.date, files: (ses.files || []).map(f => f.name || f).join('|') });
            for (const sz of S.seizuresOfSession(d, ses.id)) {
              const il = S.deriveIlae(sz, this.db), evs = sz.events.slice().sort((a, b) => a.t - b.t);
              T.seizures.push({ patient: pid, exploration: ex.label, exploration_kind: ex.kind, session: ses.label, seizure: sz.label, datetime: sz.datetime, habitual: sz.habitual, ilae_onset: il.onset, consciousness: il.consciousness, first_sign_type: il.first, fbtc: il.fbtc ? 1 : 0, eeg_onset_s: sz.eeg_onset, end_s: sz.seizure_end, vigilance: sz.vigilance, n_signs: evs.length, first_sign: evs[0] ? evs[0].sign_id : '', sequence: evs.map(e => e.sign_id).join('>') });
              evs.forEach((e, k) => { const sg = this.db && this.db.signById.get(e.sign_id); T.signs.push({ patient: pid, exploration: ex.label, seizure: sz.label, habitual: sz.habitual, rank: k + 1, sign: e.sign_id, label_fr: sg ? sg.label_fr : '', category: sg ? sg.category : '', t_s: e.t, uncertainty_s: e.dt, duration_s: e.dur, side: e.side, topography: e.topography, certainty: e.conf }); });
            }
          }
        }
        for (const l of d.lesions) T.lesions.push({ patient: pid, label: l.label, type: l.type, side: l.side, regions: regs(l.regions), source: l.source, confidence: l.confidence });
        for (const im of d.imaging) T.imaging.push({ patient: pid, modality: im.modality, timepoint: im.timepoint, date: im.date, reference: im.ref ? 1 : 0, dims: (im.dims || []).join('x'), voxel_mm: (im.pixdim || []).map(v => (+v).toFixed(2)).join('x'), coregistered: im.coreg && im.coreg.T ? 1 : 0 });
        for (const m of d.meetings) T.meetings.push({ patient: pid, date: m.date, kind: m.kind, exploration: (S.byId(d.explorations, m.explorationId) || {}).label || '', participants: m.participants, conclusion: m.conclusion });
        for (const H of d.hypotheses) T.hypotheses.push({ patient: pid, lineage: H.lineage, version: H.version, title: H.title, side: H.side, ez: regs(H.ez), propagation: regs(H.prop), confidence: H.confidence, status: H.status, meeting: (S.byId(d.meetings, H.meetingId) || {}).date || '', source: H.source && H.source.kind, created: H.created });
        for (const x of d.decisions) T.decisions.push({ patient: pid, date: x.date, type: x.type, status: x.status, text: x.text, targets: regs(x.targets), meeting: (S.byId(d.meetings, x.meetingId) || {}).date || '' });
        for (const p of d.procedures) T.procedures.push({ patient: pid, date: p.date, type: p.type, side: p.side, target: p.target, regions: regs(p.regions), histology: p.histology, complications: p.complications });
        for (const o of d.outcomes) T.outcomes.push({ patient: pid, date: o.date, months: S.outcomeMonths(d, o), procedure: (S.byId(d.procedures, o.procedureId) || {}).type || '', engel: o.engel, ilae: o.ilae, aeds: o.aeds });
      }
      const csv = rows => { if (!rows.length) return ''; const cols = Object.keys(rows[0]); const q = v => { const s = v == null ? '' : String(v); return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }; return '﻿' + cols.join(',') + '\n' + rows.map(r => cols.map(c => q(r[c])).join(',')).join('\n') + '\n'; };
      const files = Object.entries(T).filter(([, rows]) => rows.length).map(([k, rows]) => ({ name: k + '.csv', data: csv(rows) }));
      files.push({ name: 'LISEZMOI.txt', data: `EpiScope — export de cohorte (${new Date().toLocaleString(SV.LOC)}), ${all.length} patient(s).\nUne table par entité, format long, clé « patient » (pseudonyme). signs.csv : une ligne par signe de chaque crise (rang, temps, côté, topographie, certitude) ; seizures.csv : classification ILAE 2025 déduite de la séquence ; hypotheses.csv : toutes les versions (lignée, version, statut) ; régions = noms VEP.\ncontacts.csv (v5) : un plot réel par ligne, coordonnées dans l'espace du T1 et dans l'espace du gabarit (tkrRAS fsaverage / MNI305, affine 12 ddl de transforms.csv : m00…m33 ligne par ligne) — pour superposer les trajectoires de tous les patients ; quant.csv : valeurs des jeux d'analyses (EI, cEI, PEI, HFO…) par plot ou paire.\nDonnées pseudonymisées : à traiter selon le cadre réglementaire de l’étude (MR-004, entrepôt de données de santé).\n` });
      this.download(`EpiScope_cohorte_${S.today()}.zip`, await SV.Zip.write(files)); this.toast(`Cohorte exportée : ${all.length} patient(s), ${files.length - 1} tables`, 4000);
    },
    /** fenêtre de choix (texte HTML + boutons) */
    choice(html, buttons) {
      const m = h('div', 'modal'), card = h('div', 'modal-card small');
      card.innerHTML = `<div class="modal-head"><span>EpiScope</span><button class="close">✕</button></div><div class="help" style="padding:14px 16px">${html}</div><div class="modal-foot wrap"></div>`;
      const foot = card.querySelector('.modal-foot'), close = () => m.remove();
      for (const b of buttons) { const el = h('button', b.primary ? 'primary' : b.danger ? 'danger' : '', esc(b.label)); el.onclick = () => { close(); b.run(); }; foot.appendChild(el); }
      const c = h('button', '', 'Annuler'); c.onclick = close; foot.appendChild(c);
      card.querySelector('.close').onclick = close; m.appendChild(card); document.body.appendChild(m); m.hidden = false;
    },

    // ================================================================ écran « Dossier »
    renderDossier() {
      const d = this.dossier, box = $('scr-dossier'); if (!d) return;
      box.innerHTML = `<div class="scr-inner wide">
        <div id="dxTimeline" class="lifelines"></div>
        <div class="dx-grid">
          <div class="dx-col">
            <div class="card"><div class="card-h">Patient <button class="mini-btn" data-go="antecedents" title="antécédents et contexte">antécédents →</button><button class="mini-btn" data-go="maladie" title="histoire de l’épilepsie, traitements">maladie →</button><button class="mini-btn" data-go="developpement" title="grossesse, naissance, développement, examen, mesures">développement →</button></div><div class="form grid2" id="dxPatient"></div></div>
            <div class="card"><div class="card-h">Lésions <button id="dxAddLes" class="mini-btn">+ lésion</button></div><div id="dxLesions"></div></div>
          </div>
          <div class="dx-col main">
            <div class="card"><div class="card-h">Parcours <span class="muted">les étapes, dans l’ordre ; « ＋ » dans la barre du haut pour en ajouter une</span></div><div id="dxStages"></div></div>
            <div id="dxImplants" hidden></div>
          </div>
          <div class="dx-col">
            <div class="card"><div class="card-h">Imagerie <button class="mini-btn" data-go="imagerie">ouvrir →</button></div><div id="dxImaging"></div></div>
            <div class="card"><div class="card-h">Bilans <button class="mini-btn" data-go="bilans">ouvrir →</button></div><div id="dxExams"></div></div>
            <div class="card"><div class="card-h">Galerie <button class="mini-btn" data-go="galerie">ouvrir →</button></div><div id="dxGallery"></div></div>
            <div class="card"><div class="card-h">Journal <button class="mini-btn" data-go="journal">tout voir →</button></div><div id="dxJournal" class="journal"></div></div>
          </div>
        </div></div>`;
      box.querySelectorAll('[data-go]').forEach(b => b.onclick = () => this.go({ stage: 'dossier', view: b.dataset.go }));
      $('dxAddLes').onclick = () => { S.addLesion(d, { label: 'Lésion', type: 'FCD' }); this.touch(); this.renderDxLesions(); this.renderDxTimeline(); };
      this.renderDxPatient(); this.renderDxLesions(); this.renderDxImaging(); if (this.renderDxImplants) this.renderDxImplants(); this.renderDxStages(); this.renderDxTimeline();
      const xb = $('dxExams'), ex = (d.exams || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 5);
      xb.innerHTML = ex.length ? ex.map(x => `<div class="row-line"><b>${esc(V.exam[x.kind] || x.kind)}</b> <span class="muted">${fmtDate(x.date)}</span><div class="small">${esc((x.conclusion || x.text || x.title || '').slice(0, 140))}</div></div>`).join('') : '<div class="hint">Vidéo-EEG, IRM, TEP, neuropsychologie, psychiatrie… : « ouvrir » pour les saisir, datés.</div>';
      const gb = $('dxGallery'), G = d.gallery || [];
      gb.innerHTML = G.length ? `<div class="small muted">${G.length} élément${G.length > 1 ? 's' : ''}${G.filter(g => /^video\//.test(g.mime || '')).length ? ` dont ${G.filter(g => /^video\//.test(g.mime || '')).length} vidéo(s)` : ''}</div><div class="gal-strip">${G.slice(-6).reverse().map(g => `<img data-gid="${g.id}" title="${esc(g.title || V.galleryKind[g.kind] || '')}">`).join('')}</div>` : '<div class="hint">Captures de tracés EEG (outil Capture de Windows → Ctrl+V dans la galerie), rangées par étape, pour le staff et les rapports.</div>';
      if (G.length && this.galleryThumb) gb.querySelectorAll('img[data-gid]').forEach(im => this.galleryThumb(S.byId(G, im.dataset.gid)).then(u => { if (u) im.src = u; }));
      const act = { create: 'création', add: 'ajout', edit: 'modification', remove: 'suppression', revise: 'nouvelle version', import: 'import', compute: 'calcul' };
      $('dxJournal').innerHTML = (d.journal || []).slice(-8).reverse().map(j => `<div><span class="muted">${esc(fmtDT(j.t))}${j.user ? ' · ' + esc(j.user) : ''}</span> ${esc(act[j.action] || j.action)} ${esc(j.text || j.kind)}${j.n > 1 ? ' <small>×' + j.n + '</small>' : ''}</div>`).join('') || '<div class="hint">—</div>';
    },
    /** étapes du parcours, résumées, avec un accès direct */
    renderDxStages() {
      const d = this.dossier, box = $('dxStages'); if (!box) return;
      const st = this.parcours().filter(x => x.kind !== 'dossier');
      if (!st.length) { box.innerHTML = '<div class="hint">Aucune étape. Commencez par la vidéo-EEG de scalp :</div><div class="btnrow" style="justify-content:flex-start"><button class="primary" data-new="phase1">+ Vidéo-EEG de scalp (phase 1)</button><button data-new="meeting">+ Staff</button><button data-new="seeg">+ SEEG</button></div>'; box.querySelectorAll('[data-new]').forEach(b => b.onclick = () => b.dataset.new === 'meeting' ? this.newMeeting() : this.newExplorationStage(b.dataset.new)); return; }
      box.innerHTML = st.map(x => `<div class="stage-row k-${x.kind}" data-key="${esc(x.key)}"><span class="pstep k-${x.kind}"><i class="dot s-${esc(x.status || '')}"></i>${esc(x.label)}</span><div class="stage-sum">${this.stageSummary(x)}</div><button class="mini-btn">ouvrir →</button></div>`).join('');
      box.querySelectorAll('.stage-row').forEach(r => r.onclick = () => this.go({ stage: r.dataset.key }));
    },
    stageSummary(x) {
      const d = this.dossier, L = r => esc(this.atlas.label(r));
      if (x.kind === 'meeting') { const m = x.obj, hy = d.hypotheses.filter(H => H.meetingId === m.id), de = d.decisions.filter(y => y.meetingId === m.id); return `<span class="muted">${esc(V.meeting[m.kind])} · ${fmtDate(m.date)} · ${m.status === 'final' ? 'validé' : 'brouillon'}</span><br>${hy.map(H => esc(H.title || 'hypothèse') + ' v' + H.version).join(' · ') || '<i class="muted">aucune hypothèse</i>'}${de.length ? ' → <b>' + de.map(y => esc(V.decision[y.type])).join(', ') + '</b>' : ''}`; }
      if (x.kind === 'procedure') { const p = x.obj; return `<span class="muted">${esc(V.procedure[p.type])} · ${p.date ? fmtDate(p.date) : 'à dater'}</span>${this.surgeryLabel && p.template ? '<br>' + esc(this.surgeryLabel(p)) : p.regions && p.regions.length ? '<br>' + p.regions.slice(0, 5).map(L).join(', ') : ''}${p.histology ? '<br>histologie : ' + esc(p.histology) : ''}`; }
      if (x.kind === 'followup') { const o = d.outcomes.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).pop(); return o ? `dernière évaluation ${fmtDate(o.date)} : Engel <b>${esc(o.engel || '?')}</b> · ILAE <b>${esc(o.ilae || '?')}</b>${S.outcomeMonths(d, o) !== '' ? ' · ' + S.outcomeMonths(d, o) + ' mois' : ''}` : ''; }
      const ex = x.obj, szs = S.seizuresOfExploration(d, ex.id), hab = szs.filter(z => z.habitual === 'yes').length, g = (d.gallery || []).filter(y => y.explorationId === ex.id).length;
      let t = `<span class="muted">${ex.start ? fmtDate(ex.start) : 'à dater'}${ex.end ? ' → ' + fmtDate(ex.end) : ''} · ${esc(V.explorationStatus[ex.status] || '')}${ex.center ? ' · ' + esc(ex.center) : ''}</span><br>${szs.length} crise${szs.length > 1 ? 's' : ''}${hab ? ` (${hab} habituelle${hab > 1 ? 's' : ''})` : ''}${g ? ` · ${g} capture${g > 1 ? 's' : ''}` : ''}`;
      if (ex.kind === 'seeg') { const nr = ex.electrodes.filter(e => e.real).length; t += ` · ${ex.electrodes.length} électrode${ex.electrodes.length > 1 ? 's' : ''}${nr ? ` (${nr} localisée${nr > 1 ? 's' : ''})` : ''} · ${ex.stims.length} stimulation${ex.stims.length > 1 ? 's' : ''} · ${ex.thermo.length} paire${ex.thermo.length > 1 ? 's' : ''} thermocoagulée${ex.thermo.length > 1 ? 's' : ''}`; }
      return t;
    },
    /** champ lié : modifie obj[key] et enregistre ; after() est appelé après la modification */
    bindFields(root, obj, kind, after) {
      root.querySelectorAll('[data-f]').forEach(el => {
        const k = el.dataset.f, ev = el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'date' ? 'onchange' : 'oninput';
        el[ev] = () => { obj[k] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? '' : +el.value) : el.value; this.touch(kind, obj.id, obj.label || obj.title || obj.pseudo || ''); if (after) after(k); };
      });
    },
    renderDxPatient() {
      const d = this.dossier, P = d.patient, box = $('dxPatient');
      box.innerHTML = `<label>Pseudonyme <input data-f="pseudo" value="${esc(P.pseudo)}"></label>
        <label>Sexe <select data-f="sex">${opts(V.sex, P.sex)}</select></label>
        <label>Naissance <span class="inrow"><select data-f="birthMonth" title="mois (facultatif : pour l’âge exact sur la frise)">${opts(Object.fromEntries([['', 'mois'], ...Array.from({ length: 12 }, (_, i) => [String(i + 1), String(i + 1).padStart(2, '0')])]), P.birthMonth || '')}</select><input data-f="birthYear" type="number" min="1900" max="2100" value="${esc(P.birthYear)}" placeholder="année"></span></label>
        <label>Latéralité manuelle <select data-f="handedness">${opts(V.handedness, P.handedness)}</select></label>
        <label>Dominance du langage <select data-f="dominant">${opts(V.dominance, P.dominant)}</select></label>
        <label>… établie par <select data-f="dominanceMethod">${opts(V.dominanceMethod, P.dominanceMethod)}</select></label>
        <label>Premières crises à l’âge de <span class="inrow"><input data-f="onsetAge" type="number" min="0" max="120" step="any" value="${esc(P.onsetAge)}"><select data-f="onsetAgeUnit">${opts({ y: 'ans', m: 'mois', d: 'jours' }, P.onsetAgeUnit || 'y')}</select></span></label>
        <label>Étiologie <span class="ro" data-go2="maladie" title="modifier dans l’histoire de la maladie (plusieurs étiologies, confirmées ou suspectées)">${esc(S.etiologyText(P) || '—')} ✎</span></label>
        <label>IRM <select data-f="mri">${opts(V.mri, P.mri)}</select></label>
        <label class="span2">Fréquence actuelle des crises${P.frequencyDate ? ` <small class="muted">(MàJ ${esc(fmtMaj(P.frequencyDate))})</small>` : ''} <span class="inrow"><input class="freq-cur" value="${esc(P.frequency)}" placeholder="ex. 4/mois" title="modifie la fréquence la plus récente de l’histoire clinique"><button class="mini-btn freq-new" title="nouvelle fréquence datée d’aujourd’hui (l’ancienne reste dans l’histoire clinique)">MàJ aujourd’hui</button></span></label>
        <label class="span2">Traitement actuel${P.aedsSince ? ` <small class="muted">(depuis ${esc(S.fmtPartial(P.aedsSince))})</small>` : ''} <span class="inrow"><input data-f="aeds" value="${esc(P.aeds)}" placeholder="molécules, doses"><button class="mini-btn aed-chg" title="nouveau traitement actuel (date de début) ; l’actuel passe dans l’historique">changer…</button></span></label>
        <label class="span2">Histoire, notes <textarea data-f="history" rows="3">${esc(P.history)}</textarea></label>`;
      box.querySelectorAll('[data-go2]').forEach(x => x.onclick = () => this.go({ stage: 'dossier', view: x.dataset.go2 }));
      const ac = box.querySelector('.aed-chg'); if (ac && this.changeAed) ac.onclick = e => { e.preventDefault(); this.changeAed(() => this.renderDxPatient()); };
      const C = P.clin, FH = () => (C.freqHistory || []).filter(f => f.text).slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))).pop();
      box.querySelector('.freq-cur').oninput = e => { let f = FH(); if (!f) { f = { id: S.uid('H'), date: S.today().slice(0, 7), text: '' }; (C.freqHistory = C.freqHistory || []).push(f); } f.text = e.target.value; S.syncPatient(P); this.touch('patient', null, 'fréquence des crises'); };
      box.querySelector('.freq-new').onclick = () => { const t = prompt('Fréquence actuelle des crises (datée d’aujourd’hui) :', P.frequency || ''); if (t == null) return; (C.freqHistory = C.freqHistory || []).push({ id: S.uid('H'), date: S.today(), text: t.trim() }); S.syncPatient(P); this.touch('patient', null, 'fréquence des crises'); this.renderDxPatient(); };
      this.bindFields(box, P, 'patient', k => { if (k === 'birthYear' || k === 'birthMonth') this.renderDxTimeline(); if (k === 'pseudo') { this.updateCrumbs(); box.closest('.scr-inner').querySelector('h2').textContent = P.pseudo; } if (k === 'dominant') { $('dominant').value = P.dominant === 'R' ? 'R' : 'L'; this.state.patient.dominant = $('dominant').value; this.changed(); } });
    },
    /** sélecteur de régions VEP (liste déroulante groupée par système + pastilles) */
    regionPicker(list, onChange) {
      const wrap = h('div', 'rpick'), A = this.atlas, groups = new Map();
      for (let i = 1; i < A.N; i++) { const sys = A.system(i) || 'autre'; if (!groups.has(sys)) groups.set(sys, []); groups.get(sys).push(i); }
      const draw = () => {
        wrap.innerHTML = list.map(r => `<span class="rchip" data-r="${r}">${esc(A.label(r))} <b>✕</b></span>`).join('') +
          `<select class="radd"><option value="">+ région…</option>${[...groups].map(([g, ids]) => `<optgroup label="${esc(g.replace(/_/g, ' '))}">${ids.sort((a, b) => A.label(a).localeCompare(A.label(b))).map(i => `<option value="${i}">${esc(A.label(i))}</option>`).join('')}</optgroup>`).join('')}</select>` +
          (this.ui.highlight && !list.includes(this.ui.highlight) ? `<button class="mini-btn rsel" title="région sélectionnée dans la vue 3D">+ ${esc(A.label(this.ui.highlight))}</button>` : '');
        wrap.querySelectorAll('.rchip b').forEach(b => b.onclick = () => { const r = +b.parentElement.dataset.r; list.splice(list.indexOf(r), 1); draw(); onChange(); });
        wrap.querySelector('.radd').onchange = e => { const r = +e.target.value; if (r && !list.includes(r)) { list.push(r); draw(); onChange(); } };
        const rs = wrap.querySelector('.rsel'); if (rs) rs.onclick = () => { list.push(this.ui.highlight); draw(); onChange(); };
      };
      draw(); return wrap;
    },
    renderDxLesions() {
      const d = this.dossier, box = $('dxLesions'); box.innerHTML = '';
      if (!d.lesions.length) box.innerHTML = '<div class="hint">Aucune lésion déclarée.' + (d.patient.mri === 'negative' ? ' IRM négative.' : '') + '</div>';
      for (const l of d.lesions) {
        const c = h('div', 'subcard');
        c.innerHTML = `<div class="form grid2"><label class="span2">Libellé <input data-f="label" value="${esc(l.label)}"></label>
          <label>Type <select data-f="type">${opts(V.lesionType, l.type)}</select></label><label>Côté <select data-f="side">${opts({ '': '—', L: 'gauche', R: 'droit', B: 'bilatéral' }, l.side)}</select></label>
          <label>Source <select data-f="source">${opts(V.lesionSource, l.source)}</select></label><label>Confiance <select data-f="confidence">${opts(V.confidence, l.confidence)}</select></label>
          <div class="span2 rp"></div><label class="span2">Notes <input data-f="notes" value="${esc(l.notes)}"></label>
          <div class="span2 les-links"></div></div><div class="btnrow"><button class="danger mini-btn del">supprimer</button></div>`;
        c.querySelector('.rp').appendChild(this.regionPicker(l.regions, () => { this.touch('lesion', l.id, l.label); this.syncLesionsToWorkspace(); }));
        this.renderLesionLinks(c.querySelector('.les-links'), l);
        this.bindFields(c, l, 'lesion', k => { if (k === 'type' || k === 'label') this.renderDxTimeline(); });
        c.querySelector('.del').onclick = () => { if (!confirm('Supprimer cette lésion ?')) return; S.remove(d, 'lesion', l.id); this.touch(); this.syncLesionsToWorkspace(); this.renderDxLesions(); };
        box.appendChild(c);
      }
    },
    /** imagerie liée à une lésion (v4.19) : ROI annotées sur l'IRM (une ROI appartient au plus à une lésion) et captures de la
     *  galerie (coupes exportées depuis l'imagerie, images du PACS…) ; repris dans le compte rendu (une ligne par lésion ou ROI) */
    renderLesionLinks(host, l) {
      const d = this.dossier, R = d.rois || [], G = d.gallery || [], mine = R.filter(r => r.lesionId === l.id), caps = (l.galleryIds || []).map(id => S.byId(G, id)).filter(Boolean);
      const other = R.filter(r => r.lesionId !== l.id), lesName = id => { const x = S.byId(d.lesions, id); return x ? (x.label || V.lesionType[x.type]) : ''; };
      host.innerHTML = `<div class="xl-row"><span class="lbl">ROI</span>${mine.map(r => `<span class="xl-chip roi" style="border-color:${esc(r.color)}"><span style="color:${esc(r.color)}">${r.kind === 'arrow' ? '➘' : '◯'}</span> ${esc(r.label)} <button class="mini-btn" data-roigo="${r.id}" title="voir dans les coupes">voir</button><b class="x" data-unroi="${r.id}" title="détacher">✕</b></span>`).join('')}${other.length ? `<select class="les-roi"><option value="">+ lier une ROI annotée…</option>${other.map(r => `<option value="${r.id}">${esc(r.label)}${r.lesionId ? ' (liée à « ' + esc(lesName(r.lesionId)) + ' »)' : ''}</option>`).join('')}</select>` : mine.length ? '' : '<span class="muted small">aucune ROI : Imagerie › coupes › ROI</span>'}</div>
        <div class="xl-row"><span class="lbl">Captures</span><span class="les-caps">${caps.map(g => `<span class="les-cap" data-gid="${g.id}" title="${esc(g.title || 'capture')}"><img alt=""><b class="x" data-uncap="${g.id}" title="détacher">✕</b></span>`).join('')}</span><button class="mini-btn" data-a="cap" title="lier une capture de la galerie (coupes exportées de l’imagerie, image du PACS…)">+ lier une capture ▾</button></div>`;
      const redraw = () => this.renderLesionLinks(host, l), save = msg => { this.touch('lesion', l.id, msg || l.label); redraw(); };
      host.querySelectorAll('[data-roigo]').forEach(b => b.onclick = () => this.goRoi(b.dataset.roigo));
      host.querySelectorAll('[data-unroi]').forEach(b => b.onclick = () => { const r = S.byId(R, b.dataset.unroi); if (r) r.lesionId = null; save('ROI détachée'); });
      const sel = host.querySelector('.les-roi'); if (sel) sel.onchange = () => { const r = S.byId(R, sel.value); if (r) { r.lesionId = l.id; save('ROI liée'); } };
      host.querySelectorAll('.les-cap').forEach(el => { const g = S.byId(G, el.dataset.gid); if (g && this.galleryThumb) this.galleryThumb(g).then(u => { const im = el.querySelector('img'); if (u && im) im.src = u; }); el.querySelector('img').onclick = () => { if (this.galleryEditor) this.galleryEditor(g, caps, redraw); }; });
      host.querySelectorAll('[data-uncap]').forEach(b => b.onclick = () => { l.galleryIds = (l.galleryIds || []).filter(x => x !== b.dataset.uncap); save('capture détachée'); });
      host.querySelector('[data-a=cap]').onclick = e => {
        const r = e.currentTarget.getBoundingClientRect(), L0 = G.filter(g => !(l.galleryIds || []).includes(g.id) && !/^video\//.test(g.mime || '')).sort((a, b) => (S.galleryModOf(d, b) === 'imaging') - (S.galleryModOf(d, a) === 'imaging') || String(b.date).localeCompare(String(a.date)));
        if (!L0.length) { this.toast('Aucune image dans la galerie : Imagerie › coupes › « → galerie », ou collez une capture (Ctrl+V) dans la galerie', 4500); return; }
        this.popupMenu([{ head: 'Lier une capture à « ' + (l.label || V.lesionType[l.type]) + ' »' }].concat(L0.slice(0, 40).map(g => ({ label: `${g.title || V.galleryMod[S.galleryModOf(d, g)] || 'capture'} · ${new Date(String(g.date).slice(0, 10) + 'T12:00:00').toLocaleDateString(SV.LOC)}${S.galleryModOf(d, g) === 'imaging' ? ' · imagerie' : ''}`, run: () => { (l.galleryIds = l.galleryIds || []).push(g.id); save('capture liée'); } }))), Math.min(r.left, window.innerWidth - 380), r.bottom + 4);
      };
    },
    /** coupes de l'imagerie centrées sur une ROI */
    goRoi(id) {
      const d = this.dossier, r = S.byId(d.rois || [], id); if (!r) return;
      const st = this.slvState ? this.slvState() : null; if (st) st.showRois = true;
      this.go({ stage: 'dossier', view: 'imagerie' });
      let k = 0; const t = setInterval(() => { if (this.slices && this.slices.ref) { this.slices.setCursor(r.p); clearInterval(t); } else if (++k > 40) clearInterval(t); }, 150);
    },
    /** les lésions du dossier modulent le score d'origine de l'espace de travail (×1,6 par région) */
    syncLesionsToWorkspace() { if (!this.state || !this.dossier) return; this.state.patient.lesion = S.lesionRegions(this.dossier); S.toWorkspace(this.dossier, this.ctx); this.changed(); },
    renderDxImaging() {
      const d = this.dossier, box = $('dxImaging');
      const list = d.imaging.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
      box.innerHTML = list.length ? list.map(im => `<div class="row-line"><b>${esc(V.modality[im.modality] || im.modality)}</b> <span class="muted">${esc(V.timepoint[im.timepoint] || '')}${im.date ? ' · ' + fmtDate(im.date) : ''}</span>${im.ref ? ' <span class="badge ok">référence</span>' : ''}${im.coreg && im.coreg.T ? ' <span class="badge">recalée</span>' : ''}</div>`).join('') + (d.anatomy && d.anatomy.status === 'done' ? '<div class="note">Anatomie du patient calculée : surfaces, parcellation VEP' + (d.anatomy.electrodes ? ', électrodes réelles' : '') + '.</div>' : '')
        : '<div class="hint">Aucune image. Écran Imagerie : glissez les NIfTI (T1, FLAIR, TEP, scanner post-implantation…).</div>';
      if ((d.rois || []).length) box.insertAdjacentHTML('beforeend', `<div class="row-line small"><span class="muted">ROI :</span> ${d.rois.map(r => `<span style="color:${esc(r.color)}">◯</span> ${esc(r.label)}`).join(' · ')}</div>`);
    },
    renderDxExplorations() {
      const d = this.dossier, box = $('dxExplorations'); box.innerHTML = '';
      const exs = S.explorationsSorted(d);
      if (!exs.length) box.innerHTML = '<div class="card"><div class="hint">Aucune exploration. « + Exploration » : phase 1 (vidéo-EEG scalp), SEEG…</div></div>';
      for (const ex of exs) {
        const card = h('div', 'card expl k-' + ex.kind), szs = S.seizuresOfExploration(d, ex.id), hab = szs.filter(z => z.habitual === 'yes').length;
        card.innerHTML = `<div class="card-h"><span class="kind">${esc(V.explorationShort[ex.kind])}</span><input class="inline" data-f="label" value="${esc(ex.label)}"><span class="muted">${szs.length} crise${szs.length > 1 ? 's' : ''}${hab ? ` dont ${hab} habituelle${hab > 1 ? 's' : ''}` : ''}</span><span class="spacer"></span>
            <button class="mini-btn" data-a="work" title="Ouvrir l’implantation, les stimulations et la quantification de cette exploration">${ex.kind === 'seeg' ? 'implantation · SEEG' : 'projet d’implantation'}${ex.electrodes.length ? ' (' + ex.electrodes.length + ')' : ''}</button><button class="mini-btn" data-a="ses">+ séance</button><button class="mini-btn danger" data-a="del" title="Supprimer l’exploration">✕</button></div>
          <div class="form row4"><label>Début <input type="date" data-f="start" value="${esc(ex.start)}"></label><label>Fin <input type="date" data-f="end" value="${esc(ex.end)}"></label><label>Statut <select data-f="status">${opts(V.explorationStatus, ex.status)}</select></label><label>Centre <input data-f="center" value="${esc(ex.center)}"></label></div>
          ${ex.kind === 'seeg' ? `<div class="hint">${ex.electrodes.length} électrode${ex.electrodes.length > 1 ? 's' : ''}${ex.ctImageId ? ' · localisées sur le scanner' : ''} · ${ex.stims.length} stimulation${ex.stims.length > 1 ? 's' : ''} · ${ex.thermo.length} paire${ex.thermo.length > 1 ? 's' : ''} thermocoagulée${ex.thermo.length > 1 ? 's' : ''} · ${ex.quant.length} quantification${ex.quant.length > 1 ? 's' : ''}</div>` : ''}
          <div class="sessions"></div>`;
        this.bindFields(card, ex, 'exploration', k => { if (k !== 'label' && k !== 'center') this.renderDxTimeline(); this.updateCrumbs(); });
        card.querySelector('[data-a=work]').onclick = () => this.openExploration(ex.id);
        card.querySelector('[data-a=ses]').onclick = () => { S.addSession(d, ex.id, { date: S.today() }); this.touch(); this.renderDxExplorations(); };
        card.querySelector('[data-a=del]').onclick = () => { if (!confirm(`Supprimer « ${ex.label} », ses séances et ses ${szs.length} crise(s) ?`)) return; const cur = this.ctx && this.ctx.explorationId === ex.id; S.remove(d, 'exploration', ex.id); if (cur) { this.ctx = null; const all = S.allSeizures(d); if (all.length) this.openContext({ seizureId: all[all.length - 1].id }, true); else { this._loading = true; this.newCase(true); this._loading = false; } } this.touch(); this.renderDossier(); this.updateCrumbs(); };
        const sesBox = card.querySelector('.sessions');
        for (const ses of S.sessionsOf(d, ex.id)) {
          const sc = h('div', 'session'), list = S.seizuresOfSession(d, ses.id);
          sc.innerHTML = `<div class="ses-h"><input class="inline" data-f="label" value="${esc(ses.label)}"><input type="date" data-f="date" value="${esc((ses.date || '').slice(0, 10))}"><input class="inline files" data-f="filesText" value="${esc((ses.files || []).map(f => f.name || f).join(', '))}" placeholder="fichiers (ex. EEG_0042.TRC)"><span class="spacer"></span><button class="mini-btn primary" data-a="sz">+ crise</button><button class="mini-btn danger" data-a="del">✕</button></div>
            <table class="sz-table">${list.map(sz => { const il = S.ilaeText(S.deriveIlae(sz, this.db)), evs = sz.events.slice().sort((a, b) => a.t - b.t), first = evs.slice(0, 3).map(e => (this.db.signById.get(e.sign_id) || {}).label_fr || e.sign_id).join(' → '); return `<tr data-id="${sz.id}" class="${this.ctx && this.ctx.seizureId === sz.id ? 'cur' : ''}"><td><b>${esc(sz.label)}</b></td><td><input type="datetime-local" data-z="datetime" value="${esc(sz.datetime ? (sz.datetime.length <= 10 ? sz.datetime + 'T00:00' : sz.datetime.slice(0, 16)) : '')}"></td><td><select data-z="habitual">${opts(V.habitual, sz.habitual)}</select></td><td class="seq">${esc(first)}${evs.length > 3 ? ' …' : ''}<small>${esc(il)}</small></td><td>${evs.length} signe${evs.length > 1 ? 's' : ''}</td><td><button class="mini-btn" data-a="open">ouvrir</button><button class="mini-btn danger" data-a="rm">✕</button></td></tr>`; }).join('') || '<tr><td class="hint">Aucune crise : « + crise », ou ouvrez l’exploration et saisissez un signe.</td></tr>'}</table>`;
          sc.querySelectorAll('.ses-h [data-f]').forEach(el => { el.oninput = el.onchange = () => { if (el.dataset.f === 'filesText') ses.files = el.value.split(/[,;]+/).map(x => x.trim()).filter(Boolean).map(name => ({ name })); else ses[el.dataset.f] = el.value; this.touch('session', ses.id, ses.label); if (el.dataset.f === 'date') this.renderDxTimeline(); this.updateCrumbs(); }; });
          sc.querySelector('[data-a=sz]').onclick = () => this.newSeizureFlow(ses, ex);
          sc.querySelector('.ses-h [data-a=del]').onclick = () => { if (!confirm(`Supprimer la séance et ses ${list.length} crise(s) ?`)) return; S.remove(d, 'session', ses.id); this.touch(); this.renderDxExplorations(); this.renderDxTimeline(); };
          sc.querySelectorAll('tr[data-id]').forEach(tr => {
            const sz = S.byId(d.seizures, tr.dataset.id);
            tr.querySelector('[data-a=open]').onclick = () => this.openSeizure(sz.id); tr.querySelector('td b').ondblclick = () => this.openSeizure(sz.id);
            tr.querySelector('[data-a=rm]').onclick = () => { if (!confirm(`Supprimer « ${sz.label} » (${sz.events.length} signes) ?`)) return; const cur = this.ctx && this.ctx.seizureId === sz.id; S.remove(d, 'seizure', sz.id); if (cur) this.openContext({ explorationId: ex.id }, true); this.touch(); this.renderDxExplorations(); this.renderDxTimeline(); };
            tr.querySelectorAll('[data-z]').forEach(el => el.onchange = () => { sz[el.dataset.z] = el.value; this.touch('seizure', sz.id, sz.label); if (this.ctx && this.ctx.seizureId === sz.id && el.dataset.z === 'habitual') $('szHabitual').value = sz.habitual; this.renderDxTimeline(); });
          });
          sesBox.appendChild(sc);
        }
        box.appendChild(card);
      }
    },
    renderDxSide() {
      const d = this.dossier;
      // staffs
      const mb = $('dxMeetings'), ms = d.meetings.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
      mb.innerHTML = ms.length ? ms.map(m => { const hy = d.hypotheses.filter(H => H.meetingId === m.id), de = d.decisions.filter(x => x.meetingId === m.id); return `<div class="row-line click" data-m="${m.id}"><b>${fmtDate(m.date)}</b> <span class="muted">${esc(V.meeting[m.kind] || '')}</span>${m.status === 'final' ? ' <span class="badge ok">validé</span>' : ' <span class="badge">brouillon</span>'}<div class="small">${hy.map(H => esc(H.title || 'hypothèse') + ' v' + H.version).join(' · ') || '<i>aucune hypothèse</i>'}${de.length ? ' → ' + de.map(x => esc(V.decision[x.type])).join(', ') : ''}</div></div>`; }).join('') : '<div class="hint">Aucun staff.</div>';
      mb.querySelectorAll('[data-m]').forEach(el => el.onclick = () => { this.ui.meetingId = el.dataset.m; this.showScreen('staff'); });
      // procédures
      const pb = $('dxProcedures'); pb.innerHTML = '';
      if (!d.procedures.length) pb.innerHTML = '<div class="hint">Aucune procédure.</div>';
      for (const p of d.procedures) {
        const c = h('div', 'subcard'); c.innerHTML = `<div class="form grid2"><label>Type <select data-f="type">${opts(V.procedure, p.type)}</select></label><label>Date <input type="date" data-f="date" value="${esc(p.date)}"></label>
          <label>Côté <select data-f="side">${opts({ '': '—', L: 'gauche', R: 'droit' }, p.side)}</select></label><label>Cible <input data-f="target" value="${esc(p.target)}" placeholder="ex. corticectomie operculaire"></label>
          <div class="span2 rp"></div><label>Histologie <input data-f="histology" value="${esc(p.histology)}" placeholder="ex. FCD IIb"></label><label>Complications <input data-f="complications" value="${esc(p.complications)}"></label></div><div class="btnrow"><button class="danger mini-btn del">supprimer</button></div>`;
        if (this.surgeryEditor && ['resection', 'lobectomy', 'litt', 'disconnection', 'other'].includes(p.type)) { const hy = S.latestHypotheses(d).filter(H => ['confirmed', 'testing', 'proposed'].includes(H.status)); c.querySelector('.rp').appendChild(this.surgeryEditor(p, hy, () => this.touch('procedure', p.id, V.procedure[p.type]), 'procedure')); }
        else c.querySelector('.rp').appendChild(this.regionPicker(p.regions, () => this.touch('procedure', p.id, V.procedure[p.type])));
        this.bindFields(c, p, 'procedure', k => { this.renderDxTimeline(); if (k === 'date') this.renderDxOutcomes(); if (k === 'type') this.renderDxSide(); }); c.querySelector('.del').onclick = () => { if (confirm('Supprimer cette procédure ?')) { S.remove(d, 'procedure', p.id); this.touch(); this.renderDxSide(); this.renderDxTimeline(); } };
        pb.appendChild(c);
      }
      this.renderDxOutcomes();
      // journal
      const act = { create: 'création', add: 'ajout', edit: 'modification', remove: 'suppression', revise: 'nouvelle version', import: 'import', compute: 'calcul' };
      $('dxJournal').innerHTML = (d.journal || []).slice(-14).reverse().map(j => `<div><span class="muted">${esc(fmtDT(j.t))}${j.user ? ' · ' + esc(j.user) : ''}</span> ${esc(act[j.action] || j.action)} ${esc(j.text || j.kind)}${j.n > 1 ? ' <small>×' + j.n + '</small>' : ''}</div>`).join('') || '<div class="hint">—</div>';
    },
    /** devenir : recul calculé (date de la procédure → date du suivi), modifiable ; aide-mémoire Engel / ILAE */
    renderDxOutcomes(box) {
      const d = this.dossier, ob = box || this._outBox || $('dxOutcomes'); if (!ob || !ob.isConnected) return; this._outBox = ob; ob.innerHTML = '';
      if (!d.outcomes.length) ob.innerHTML = '<div class="hint">Aucun suivi.</div>';
      const engelOpts = V.engelMemo.flatMap(([, , subs]) => subs).map(([k, t]) => [k, k + ' · ' + t]), ilaeOpts = V.ilaeMemo.map(([k, t]) => [k, k + ' · ' + t]);
      for (const o of d.outcomes.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
        const c = h('div', 'subcard'), auto = S.outcomeMonthsAuto(d, o), proc = S.outcomeProcedure(d, o);
        c.innerHTML = `<div class="form grid2"><label>Date du suivi <input type="date" data-f="date" value="${esc(o.date)}"></label>
          <label>Recul (mois) <span class="inrow"><input type="number" step="0.1" min="0" class="months${o.monthsManual ? '' : ' auto'}" value="${esc(o.monthsManual ? o.months : auto)}" title="${o.monthsManual ? 'valeur saisie' : 'calculé : date de la procédure → date du suivi'}">${o.monthsManual ? '<button class="mini-btn reauto" title="revenir au calcul depuis les dates">↺ auto</button>' : '<span class="badge" title="calculé depuis les dates">auto</span>'}</span></label>
          <label>Engel <span class="inrow"><select data-f="engel" class="wide">${[['', '—']].concat(engelOpts).map(([k, l]) => `<option value="${esc(k)}"${o.engel === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select><button class="mini-btn memo" data-memo="engel" title="aide-mémoire : classification d’Engel">?</button></span></label>
          <label>ILAE <span class="inrow"><select data-f="ilae" class="wide">${[['', '—']].concat(ilaeOpts).map(([k, l]) => `<option value="${esc(k)}"${String(o.ilae) === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select><button class="mini-btn memo" data-memo="ilae" title="aide-mémoire : classification ILAE du devenir">?</button></span></label>
          <label class="span2">Procédure <select data-f="procedureId">${opts(Object.assign({ '': proc && !o.procedureId ? '— (par défaut : ' + V.procedure[proc.type] + ' ' + fmtDate(proc.date) + ')' : '—' }, Object.fromEntries(d.procedures.map(p => [p.id, V.procedure[p.type] + ' ' + fmtDate(p.date)]))), o.procedureId || '')}</select></label>
          <label class="span2">Traitements, notes <input data-f="notes" value="${esc(o.notes)}"></label></div><div class="btnrow"><button class="danger mini-btn del">supprimer</button></div>`;
        this.bindFields(c, o, 'outcome', k => { if (k === 'date' || k === 'engel') this.renderParcours(); if (k === 'date' || k === 'procedureId') this.renderDxOutcomes(ob); });
        const mi = c.querySelector('input.months'); mi.oninput = () => { o.months = mi.value === '' ? '' : +mi.value; o.monthsManual = mi.value !== ''; mi.classList.toggle('auto', !o.monthsManual); this.touch('outcome', o.id, 'recul'); };
        mi.onchange = () => this.renderDxOutcomes(ob);
        const ra = c.querySelector('.reauto'); if (ra) ra.onclick = () => { o.monthsManual = false; o.months = ''; this.touch('outcome', o.id, 'recul'); this.renderDxOutcomes(ob); };
        c.querySelectorAll('.memo').forEach(b => b.onclick = e => { e.preventDefault(); this.outcomeMemo(b.dataset.memo, b); });
        c.querySelector('.del').onclick = () => { if (confirm('Supprimer ce suivi ?')) { S.remove(d, 'outcome', o.id); this.touch(); if (d.outcomes.length) this.renderDxOutcomes(ob); else this.go({ stage: 'dossier' }); } };
        ob.appendChild(c);
      }
    },
    /** aide-mémoire des classifications du devenir post-chirurgical */
    outcomeMemo(kind, anchor) {
      const panel = h('div', 'cell-panel memo-pop');
      panel.innerHTML = kind === 'engel'
        ? `<div class="ctx-head">Classification d’Engel</div><table class="memo">${V.engelMemo.map(([cl, t, subs]) => `<tr class="cl"><td><b>${cl}</b></td><td><b>${esc(t)}</b></td></tr>` + subs.map(([k, x]) => `<tr><td>${k}</td><td>${esc(x)}</td></tr>`).join('')).join('')}</table><div class="hint">Engel J Jr et al., 1993. Classe I = libre de crises invalidantes.</div>`
        : `<div class="ctx-head">Classification ILAE du devenir</div><table class="memo">${V.ilaeMemo.map(([k, x]) => `<tr><td><b>${k}</b></td><td>${esc(x)}</td></tr>`).join('')}</table><div class="hint">Wieser HG et al., Epilepsia 2001 ; à coter chaque année, en jours de crise (référence : les 12 mois avant l’intervention).</div>`;
      const r = anchor.getBoundingClientRect(); this.popupMenu([{ node: panel }], Math.min(r.left, window.innerWidth - 470), r.bottom + 4);
    },
    /** frise du parcours (façon LifeLines, Plaisant 1996) : une piste par type d'événement, clic = ouvrir */
    renderDxTimeline() {
      const d = this.dossier, box = $('dxTimeline'); if (!box || !d) return;
      const items = [];
      const day = s => { if (!s) return NaN; const t = Date.parse(String(s).length <= 10 ? s + 'T12:00:00' : s); return isNaN(t) ? NaN : t; };
      const P = d.patient, ageTxt = t => { const a = isNaN(t) ? null : S.ageAt(P, new Date(t).toISOString().slice(0, 10)); return a == null ? '' : a + ' ans'; };
      for (const ex of d.explorations) { const a = ageTxt(day(ex.start)); items.push({ lane: 0, t0: day(ex.start), t1: day(ex.end) || day(ex.start), kind: 'expl', id: ex.id, text: ex.label + (a ? ' · ' + a : ''), cls: 'k-' + ex.kind }); }
      for (const sz of d.seizures) { const ses = S.byId(d.sessions, sz.sessionId); items.push({ lane: 1, t0: day(sz.datetime) || day(ses && ses.date), kind: 'sz', id: sz.id, text: sz.label, cls: 'hab-' + (sz.habitual === 'yes' ? 'y' : sz.habitual === 'no' ? 'n' : 'u') }); }
      for (const im of d.imaging) items.push({ lane: 2, t0: day(im.date), kind: 'img', id: im.id, text: V.modality[im.modality] || im.modality, cls: 'm-' + im.modality });
      for (const x of d.exams || []) if (x.kind !== 'mri' || !(x.imagingIds || []).length) items.push({ lane: 2, t0: day(x.date), kind: 'exam', id: x.id, text: ({ eeg: 'EEG', neuropsy: 'neuropsy', mri: 'IRM' }[x.kind] || V.exam[x.kind] || x.kind), cls: 'x-' + x.kind });
      for (const m of d.meetings) items.push({ lane: 3, t0: day(m.date), kind: 'meet', id: m.id, text: 'staff', cls: '' });
      for (const x of d.decisions) items.push({ lane: 3, t0: day(x.date), kind: 'dec', id: x.id, text: V.decision[x.type], cls: 'dec' });
      for (const p of d.procedures) items.push({ lane: 4, t0: day(p.date), kind: 'proc', id: p.id, text: V.procedure[p.type], cls: '' });
      for (const o of d.outcomes) items.push({ lane: 5, t0: day(o.date), kind: 'out', id: o.id, text: 'Engel ' + (o.engel || '?'), cls: 'engel-' + String(o.engel || '').charAt(0) });
      const ts = items.flatMap(i => [i.t0, i.t1]).filter(x => !isNaN(x));
      const lanes = ['Explorations', 'Crises', 'Imagerie, bilans', 'Staffs, décisions', 'Procédures', 'Devenir'];
      if (!ts.length) { box.innerHTML = '<div class="hint" style="padding:8px">La chronologie du parcours apparaîtra ici (dates des explorations, crises, images, staffs, procédures, suivis).</div>'; return; }
      const W = Math.max(600, box.clientWidth || 1000), LW = 118, DAY = 864e5;
      // étendue complète (F0–F1) et fenêtre affichée (zoom, v4.19 : glisser sur la frise pour zoomer, minicarte en bas à gauche)
      let F0 = Math.min(...ts), F1 = Math.max(...ts); if (F1 - F0 < 45 * DAY) { const m = (F0 + F1) / 2; F0 = m - 23 * DAY; F1 = m + 23 * DAY; }
      const padF = (F1 - F0) * 0.04; F0 -= padF; F1 += padF;
      const Z = (this.ui.tlZoom = this.ui.tlZoom || {}), zk = d.id; let zv = Z[zk];
      if (zv && (zv[1] - zv[0] < 5 * DAY || zv[0] >= F1 || zv[1] <= F0)) zv = Z[zk] = null;
      const t0 = zv ? Math.max(F0 - 365 * DAY, zv[0]) : F0, t1 = zv ? Math.min(F1 + 365 * DAY, zv[1]) : F1, zoomed = !!zv;
      const X = t => LW + (t - t0) / (t1 - t0) * (W - LW - 10), Tx = x => t0 + (x - LW) / (W - LW - 10) * (t1 - t0);
      // rangées par piste (dans la fenêtre) : un objet descend d'une rangée s'il chevauche le précédent (étiquette comprise)
      const ends = lanes.map(() => []), tw = s => 7 + String(s).length * 6.2, vis = it => !isNaN(it.t0) && (it.kind === 'expl' ? Math.max(it.t0, isNaN(it.t1) ? it.t0 : it.t1) >= t0 - 2 * DAY : it.t0 >= t0 - 2 * DAY) && it.t0 <= t1 + 2 * DAY;
      for (const it of items.filter(vis).sort((a, b) => a.t0 - b.t0)) {
        const x0 = Math.max(LW, X(it.t0)) - (it.kind === 'expl' ? 0 : 7), x1 = it.kind === 'expl' ? Math.max(X(isNaN(it.t1) ? it.t0 : it.t1), x0 + tw(it.text)) : it.kind === 'sz' ? x0 + 14 : x0 + 16 + tw(it.text);
        const E = ends[it.lane]; let r = E.findIndex(e => e < x0 - 3); if (r < 0) { r = E.length; E.push(0); } E[r] = x1; it.row = r;
      }
      const rows = ends.map(E => Math.max(1, E.length)), laneY = []; let y = 22; rows.forEach((n, k) => { laneY[k] = y; y += 8 + n * 18; });
      const H = y + 8 + (zoomed ? 50 : 0), Y = (k, r) => laneY[k] + 13 + (r || 0) * 18;
      let svg = `<svg width="${W}" height="${H}" class="ll${zoomed ? ' zoomed' : ''}"><defs><clipPath id="llClip"><rect x="${LW - 9}" y="0" width="${W - LW + 9}" height="${H}"/></clipPath></defs><rect class="ll-bg" x="${LW}" y="0" width="${W - LW - 8}" height="${y}" fill="transparent"/>`;
      lanes.forEach((l, k) => { svg += `<text x="6" y="${Y(k) + 4}" class="ll-lane">${l}</text><line x1="${LW}" x2="${W - 8}" y1="${laneY[k] + 4 + rows[k] * 9 + 4}" y2="${laneY[k] + 4 + rows[k] * 9 + 4}" class="ll-axis"/>`; });
      svg += '<g clip-path="url(#llClip)">';
      // graduations : jours, semaines, mois, trimestres ou années selon la fenêtre ; âge du patient quand il change
      const span = t1 - t0, unit = span > 3 * 365 * DAY ? 'y' : span > 400 * DAY ? 'q' : span > 75 * DAY ? 'm' : span > 18 * DAY ? 'w' : 'd';
      const dt = new Date(t0); dt.setHours(0, 0, 0, 0); if (unit === 'y' || unit === 'q' || unit === 'm') dt.setDate(1); if (unit === 'y') dt.setMonth(0); if (unit === 'q') dt.setMonth(dt.getMonth() - dt.getMonth() % 3); if (unit === 'w') dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
      const next = () => unit === 'y' ? dt.setFullYear(dt.getFullYear() + 1) : unit === 'q' ? dt.setMonth(dt.getMonth() + 3) : unit === 'm' ? dt.setMonth(dt.getMonth() + 1) : dt.setDate(dt.getDate() + (unit === 'w' ? 7 : 1));
      const lab = () => unit === 'y' ? String(dt.getFullYear()) : unit === 'q' || unit === 'm' ? dt.toLocaleDateString(SV.LOC, { month: 'short', year: '2-digit' }) : dt.toLocaleDateString(SV.LOC, { day: 'numeric', month: 'short' });
      let lastAgeX = -1e9, lastAge = null, lastLabX = -1e9;
      for (let guard = 0; dt.getTime() < t1 && guard < 400; next(), guard++) {
        const x = X(dt.getTime()); if (x < LW) continue; const a = S.ageAt(P, dt.toISOString().slice(0, 10)), L0 = lab(), showLab = x - lastLabX >= Math.max(42, L0.length * 6.2 + 8);
        const showAge = showLab && a != null && x - lastAgeX >= 150 && a !== lastAge; if (showAge) { lastAgeX = x; lastAge = a; } if (showLab) lastLabX = x;
        svg += `<line x1="${x}" x2="${x}" y1="14" y2="${y - 2}" class="ll-tick"/>${showLab ? `<text x="${x + 3}" y="12" class="ll-date">${L0}${showAge ? ` <tspan class="ll-age">(${a} ans)</tspan>` : ''}</text>` : ''}`;
      }
      const tday = Date.now(); if (tday > t0 && tday < t1) svg += `<line x1="${X(tday)}" x2="${X(tday)}" y1="14" y2="${y - 2}" class="ll-today"/><text x="${X(tday) + 3}" y="${y - 4}" class="ll-date">aujourd’hui</text>`;
      for (const it of items) {
        if (!vis(it)) continue; const x0 = X(it.t0), yy = Y(it.lane, it.row), tip = esc(it.text + ' · ' + new Date(it.t0).toLocaleDateString(SV.LOC));
        if (it.kind === 'expl') { const xa = Math.max(LW - 6, x0), x1 = Math.max(xa + 8, X(isNaN(it.t1) ? it.t0 : it.t1)); const tx = Math.max(LW, Math.min(xa + 4, W - 10 - tw(it.text))); svg += `<g class="ll-it ${it.cls}" data-k="${it.kind}" data-id="${it.id}"><title>${tip}</title><rect x="${xa}" y="${yy - 8}" width="${x1 - xa}" height="16" rx="4"/><text x="${tx}" y="${yy + 4}">${esc(it.text)}</text></g>`; }
        else if (it.kind === 'exam') svg += `<g class="ll-it ll-exam ${it.cls}" data-k="exam" data-id="${it.id}"><title>${tip}</title><circle cx="${x0}" cy="${yy}" r="5"/><text x="${x0 + 8}" y="${yy + 4}">${esc(it.text)}</text></g>`;
        else if (it.kind === 'sz') svg += `<circle class="ll-it ll-sz ${it.cls}" data-k="sz" data-id="${it.id}" cx="${x0}" cy="${yy}" r="5"><title>${tip}</title></circle>`;
        else if (it.kind === 'img') svg += `<g class="ll-it ll-img ${it.cls}" data-k="img" data-id="${it.id}"><title>${tip}</title><path d="M${x0} ${yy - 7}L${x0 + 7} ${yy}L${x0} ${yy + 7}L${x0 - 7} ${yy}Z"/><text x="${x0 + 9}" y="${yy + 4}">${esc(it.text)}</text></g>`;
        else if (it.kind === 'meet') svg += `<g class="ll-it ll-meet" data-k="meet" data-id="${it.id}"><title>${tip}</title><path d="M${x0} ${yy + 9}V${yy - 9}L${x0 + 11} ${yy - 5}L${x0} ${yy - 1}"/></g>`;
        else if (it.kind === 'dec') svg += `<g class="ll-it ll-dec" data-k="dec" data-id="${it.id}"><title>${tip}</title><text x="${x0 + 13}" y="${yy + 4}">→ ${esc(it.text)}</text></g>`;
        else if (it.kind === 'proc') svg += `<g class="ll-it ll-proc" data-k="proc" data-id="${it.id}"><title>${tip}</title><path d="M${x0} ${yy - 8}L${x0 + 2.5} ${yy - 2.5}L${x0 + 8} ${yy - 2}L${x0 + 3.5} ${yy + 2}L${x0 + 5} ${yy + 8}L${x0} ${yy + 4.5}L${x0 - 5} ${yy + 8}L${x0 - 3.5} ${yy + 2}L${x0 - 8} ${yy - 2}L${x0 - 2.5} ${yy - 2.5}Z"/><text x="${x0 + 10}" y="${yy + 4}">${esc(it.text)}</text></g>`;
        else if (it.kind === 'out') svg += `<g class="ll-it ll-out ${it.cls}" data-k="out" data-id="${it.id}"><title>${tip}</title><rect x="${x0 - 6}" y="${yy - 6}" width="12" height="12" rx="2"/><text x="${x0 + 9}" y="${yy + 4}">${esc(it.text)}</text></g>`;
      }
      svg += '</g>';
      // minicarte (fenêtre zoomée) : tout le parcours, une rangée de points par piste, cadre de la fenêtre (glisser pour se déplacer)
      const MW = 230, MH = 40, MX = 6, MY = H - MH - 4, mX = t => MX + 4 + (t - F0) / (F1 - F0) * (MW - 8);
      if (zoomed) {
        svg += `<g class="ll-mini" transform="translate(0,0)"><rect class="ll-mini-bg" x="${MX}" y="${MY}" width="${MW}" height="${MH}" rx="6"/>`;
        for (const it of items) if (!isNaN(it.t0)) svg += it.kind === 'expl' ? `<rect x="${mX(it.t0)}" y="${MY + 5 + it.lane * 5}" width="${Math.max(2, mX(isNaN(it.t1) ? it.t0 : it.t1) - mX(it.t0))}" height="3" class="ll-mini-it e"/>` : `<rect x="${mX(it.t0) - 1}" y="${MY + 5 + it.lane * 5}" width="2.5" height="3" class="ll-mini-it"/>`;
        const ya = new Date(F0); ya.setMonth(0, 1); ya.setHours(0, 0, 0, 0); const ystep = F1 - F0 > 12 * 365 * DAY ? 5 : F1 - F0 > 5 * 365 * DAY ? 2 : 1; let gy = 0;
        for (ya.setFullYear(ya.getFullYear() + 1); ya.getTime() < F1 && gy < 40; ya.setFullYear(ya.getFullYear() + ystep), gy++) if (ya.getFullYear() % ystep === 0) svg += `<line x1="${mX(ya.getTime())}" x2="${mX(ya.getTime())}" y1="${MY + 2}" y2="${MY + MH - 9}" class="ll-mini-tk"/><text x="${mX(ya.getTime()) + 2}" y="${MY + MH - 2}" class="ll-mini-tx">${ya.getFullYear()}</text>`;
        svg += `<rect class="ll-mini-win" x="${Math.max(MX, mX(t0))}" y="${MY + 1}" width="${Math.max(4, Math.min(MX + MW, mX(t1)) - Math.max(MX, mX(t0)))}" height="${MH - 2}" rx="3"><title>fenêtre affichée : glisser pour se déplacer</title></rect></g>`;
      }
      svg += '</svg>';
      box.innerHTML = `<div class="ll-tools">${zoomed ? `<span class="muted small">${esc(new Date(t0).toLocaleDateString(SV.LOC))} → ${esc(new Date(t1).toLocaleDateString(SV.LOC))}</span>` : '<span class="muted small" title="glisser sur la frise pour zoomer sur une période ; Ctrl + molette pour zoomer ; double-clic pour tout revoir">glisser pour zoomer</span>'}<button class="mini-btn" data-z="out" title="dézoomer"${zoomed ? '' : ' disabled'}>−</button><button class="mini-btn" data-z="in" title="zoomer (centre)">+</button><button class="mini-btn" data-z="all" title="tout le parcours (double-clic)"${zoomed ? '' : ' disabled'}>⟲</button></div>` + svg;
      box.style.position = 'relative';
      const setZ = (a, b) => { const minS = 7 * DAY; if (b - a < minS) { const m = (a + b) / 2; a = m - minS / 2; b = m + minS / 2; } Z[zk] = a <= F0 && b >= F1 ? null : [a, b]; this.renderDxTimeline(); };
      const zoomBy = (f, c) => { c = c == null ? (t0 + t1) / 2 : c; setZ(c - (c - t0) * f, c + (t1 - c) * f); };
      box.querySelectorAll('[data-z]').forEach(b => b.onclick = () => b.dataset.z === 'all' ? setZ(F0, F1) : zoomBy(b.dataset.z === 'in' ? 0.5 : 2));
      const sv = box.querySelector('svg.ll'), pt = e => { const r = sv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      sv.addEventListener('wheel', e => { if (!(e.ctrlKey || e.metaKey || e.altKey)) return; e.preventDefault(); const [x] = pt(e); zoomBy(e.deltaY < 0 ? 0.7 : 1 / 0.7, x > LW ? Tx(x) : null); }, { passive: false });
      sv.addEventListener('dblclick', e => { if (e.target.closest('.ll-it, .ll-mini')) return; setZ(F0, F1); });
      // glisser : sur la minicarte = déplacer la fenêtre ; ailleurs (hors objets) = cadre de zoom ; Maj + glisser = déplacer
      let drag = null;
      sv.addEventListener('pointerdown', e => {
        if (e.button !== 0) return; const [x, yy] = pt(e), inMini = zoomed && x >= MX && x <= MX + MW && yy >= MY && yy <= MY + MH;
        if (!inMini && (e.target.closest('.ll-it') || x < LW || yy > y)) return;
        e.preventDefault(); try { sv.setPointerCapture(e.pointerId); } catch (_) { }
        drag = inMini ? { mode: 'mini', x0: x, a: t0, b: t1 } : e.shiftKey && zoomed ? { mode: 'pan', x0: x, a: t0, b: t1 } : { mode: 'brush', x0: x };
        if (inMini) { const c = F0 + (x - MX - 4) / (MW - 8) * (F1 - F0); if (c < t0 || c > t1) { const h2 = (t1 - t0) / 2; drag.a = c - h2; drag.b = c + h2; } }
      });
      sv.addEventListener('pointermove', e => {
        if (!drag) return; const [x] = pt(e);
        if (drag.mode === 'brush') { let r = sv.querySelector('.ll-brush'); if (!r) { r = document.createElementNS('http://www.w3.org/2000/svg', 'rect'); r.setAttribute('class', 'll-brush'); r.setAttribute('y', 14); r.setAttribute('height', y - 16); sv.appendChild(r); } const a = Math.max(LW, Math.min(drag.x0, x)), b = Math.min(W - 10, Math.max(drag.x0, x)); r.setAttribute('x', a); r.setAttribute('width', Math.max(0, b - a)); drag.x1 = x; return; }
        const dtm = drag.mode === 'mini' ? (x - drag.x0) / (MW - 8) * (F1 - F0) : -(x - drag.x0) / (W - LW - 10) * (t1 - t0);
        drag.na = drag.a + dtm; drag.nb = drag.b + dtm; const g = sv.querySelector('.ll-mini-win'); if (g) g.setAttribute('x', Math.max(MX, mX(drag.na)));
      });
      const end = () => { if (!drag) return; const D = drag; drag = null;
        if (D.mode === 'brush') { const r = sv.querySelector('.ll-brush'); if (r) r.remove(); if (D.x1 != null && Math.abs(D.x1 - D.x0) > 8) { const a = Tx(Math.max(LW, Math.min(D.x0, D.x1))), b = Tx(Math.min(W - 10, Math.max(D.x0, D.x1))); setZ(a, b); } return; }
        if (D.na != null) setZ(D.na, D.nb); else if (D.mode === 'mini') setZ(D.a, D.b); };
      sv.addEventListener('pointerup', end); sv.addEventListener('pointercancel', () => { drag = null; const r = sv.querySelector('.ll-brush'); if (r) r.remove(); });
      box.querySelectorAll('.ll-it').forEach(g => g.onclick = () => { const k = g.dataset.k, id = g.dataset.id; if (k === 'sz') this.openSeizure(id); else if (k === 'meet' || k === 'dec') { const m = k === 'meet' ? id : (S.byId(d.decisions, id) || {}).meetingId; if (m) this.go({ stage: 'meet:' + m }); } else if (k === 'img') this.go({ stage: 'dossier', view: 'imagerie' }); else if (k === 'exam') { this.ui.exOpen = id; this.go({ stage: 'dossier', view: 'bilans' }); } else if (k === 'expl') this.go({ stage: 'ex:' + id }); else if (k === 'proc') this.go({ stage: 'proc:' + id }); else if (k === 'out') this.go({ stage: 'followup' }); });
    },
  };
  Object.assign(SV.app, M);
})(window.SV = window.SV || {});
