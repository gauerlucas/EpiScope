/* EpiScope — identity_ui.js (v1.1.0) : identité des patients et codes neutres.
 *   - Réglages de la bibliothèque (préfixe de site, défaut HFAR ; nombre de chiffres ; nom du centre) : demandés à la première
 *     création d'un patient, modifiables ensuite (préfixe figé dès qu'un code a été attribué) — bouton « Réglages » des Patients.
 *   - Code neutre attribué à la création (HFAR0007) et aux anciens dossiers à leur première ouverture (journal).
 *   - Zone « Identité » du dossier (nom, prénom, date de naissance, IPP) : seul endroit des données identifiantes ; masquable à
 *     l'écran (projection) ; jamais reprise dans les noms de fichiers, les instantanés ni les exports de recherche.
 *   - Table de correspondance code ↔ identité (CSV), avec avertissement et trace dans le journal de chaque dossier.
 *   Modèle : store.js (subject, identity, makeSubject) ; stockage : library.js (settings, nextSubject).               */
(function (SV) {
  'use strict';
  const S = SV.Store, L = SV.Library, A = SV.app, esc = SV.U.esc, $ = id => document.getElementById(id);
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } };

  const M = {
    // ---------------------------------------------------------------- nom affiché et masquage
    /** masquage des noms à l'écran (partage d'écran, enseignement) : réglage du poste */
    setAnon(v) { lsSet('sv_anon', v ? '1' : '0'); document.body.classList.toggle('anon-names', !!v); this.refreshNames(); },
    /** nom affiché d'un dossier (Prénom NOM, ou code si les noms sont masqués ou si force vaut vrai) */
    dname(d, force) { return S.displayName(d, force || this.anon); },
    /** même chose pour une ligne de la liste des patients (résumé) */
    dnameSum(x) { return this.anon ? (x.subject || 'Patient') : (x.display || x.pseudo || x.subject || 'Patient'); },
    /** nom de fichier d'un export : toujours le code (jamais le nom), sinon l'identifiant interne */
    fileStem(d) { return S.subjectLabel(d) || ('patient_' + String(d.id || '').slice(-6)); },
    refreshNames() {
      if (this.updateCrumbs) this.updateCrumbs(); if (this.dossier && this.renderSubbar) this.renderSubbar(); const scr = this.ui && this.ui.screen;
      if (scr === 'patients' && this.renderPatients) this.renderPatients(); else if (this.dossier && this.loc && this.go) this.go(this.loc);
    },
    /** fenêtre des réglages de la bibliothèque ; renvoie les réglages enregistrés, ou null si annulée */
    async librarySettingsDialog(first) {
      const st = (await L.settings()) || { site: 'HFAR', digits: 4, center: '' }, used = await L.subjectsInUse(), locked = used.length > 0;
      return new Promise(res => {
        const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div class="modal-card" style="max-width:560px"><div class="modal-head"><b>${first ? 'Initialiser la bibliothèque' : 'Réglages de la bibliothèque'}</b><span class="spacer"></span><button class="close">✕</button></div><div class="prov-body">
          <div class="hint">Chaque patient reçoit un code neutre : <b>préfixe du centre + numéro</b> (ex. HFAR0007). Ce code nomme les fichiers (format BIDS « sub-HFAR0007 ») et sert dans les exports de recherche ; l’identité reste dans le dossier et ne sort que par la table de correspondance.</div>
          <div class="form grid2" style="margin-top:10px"><label>Préfixe du centre <input class="ls-site mono" value="${esc(st.site)}" maxlength="8"${locked ? ' disabled title="des codes ont déjà été attribués : le préfixe ne change plus"' : ''}></label>
          <label>Chiffres du numéro <select class="ls-dig"${locked ? ' disabled title="des codes ont déjà été attribués : le nombre de chiffres ne change plus"' : ''}>${[3, 4, 5].map(n => `<option${n === (st.digits || 4) ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
          <label class="span2">Nom du centre <input class="ls-center" value="${esc(st.center || '')}" placeholder="ex. service de neurochirurgie pédiatrique"></label></div>
          <div class="hint ls-ex"></div>${locked ? `<div class="hint">${used.length} code${used.length > 1 ? 's' : ''} déjà attribué${used.length > 1 ? 's' : ''} ; prochain numéro : ${Math.max(st.next || 1, 1 + Math.max(0, ...used.map(u => u.n || 0)))}.</div>` : ''}
          <div class="btnrow"><button class="primary ls-ok">Enregistrer</button>${first ? '' : '<button class="ls-cancel">Annuler</button>'}</div></div></div>`;
        document.body.appendChild(m);
        const ex = () => { m.querySelector('.ls-ex').textContent = 'Exemple : ' + S.makeSubject(m.querySelector('.ls-site').value, Math.max(1, st.next || 1), +m.querySelector('.ls-dig').value).label; };
        m.querySelector('.ls-site').oninput = ex; m.querySelector('.ls-dig').onchange = ex; ex();
        const done = v => { m.remove(); res(v); };
        m.querySelector('.close').onclick = () => done(null); const c = m.querySelector('.ls-cancel'); if (c) c.onclick = () => done(null);
        m.querySelector('.ls-ok').onclick = async () => { const site = S.cleanSite(m.querySelector('.ls-site').value); if (!site) { m.querySelector('.ls-site').focus(); return; }
          const out = await L.saveSettings(Object.assign(st, { site: locked ? st.site : site, digits: locked ? st.digits : +m.querySelector('.ls-dig').value, center: m.querySelector('.ls-center').value.trim() })); this.toast(`Bibliothèque : codes ${S.makeSubject(out.site, out.next || 1, out.digits).label}…`, 3000); done(out); };
      });
    },
    /** réglages présents, sinon demandés (première création d'un patient) ; vrai si l'on peut continuer */
    async ensureLibrarySettings() { if (await L.settings()) return true; return !!(await this.librarySettingsDialog(true)); },
    /** ancien dossier sans code : code attribué à l'ouverture */
    async ensureSubject(d) {
      if (!d || d.subject || d._readonly) return;
      try { if (!(await L.settings())) await L.saveSettings({}); d.subject = await L.nextSubject(); S.log(d, 'edit', 'dossier', d.id, 'code attribué : ' + d.subject.label, L.user); this.touch(); this.toast(`Code attribué à ce dossier : ${d.subject.label}`, 3500); }
      catch (e) { console.warn('code du sujet', e); }
    },
    /** zone « Identité » en tête de la carte du patient */
    identityHtml(d) {
      const I = d.identity || {}, hide = this.anon;
      return `<div class="idz span2${hide ? ' hide' : ''}"><div class="idz-h"><span title="code neutre du sujet : identifiant des fichiers et des exports">Code <b class="mono">${esc(S.subjectLabel(d) || '—')}</b></span><span class="spacer"></span><span class="muted small">🔒 identité — usage interne, jamais exportée hors de la table de correspondance</span>${!I.lastName && !I.firstName && d.patient.pseudo && d.patient.pseudo !== S.subjectLabel(d) ? `<button class="mini-btn idz-from" title="remplir nom et prénom à partir du pseudonyme « ${esc(d.patient.pseudo)} » (mots en capitales = nom)">reprendre le pseudonyme</button>` : ''}<button class="mini-btn idz-eye" title="masquer / afficher les noms des patients à l’écran sur ce poste (projection, enseignement) : le code du sujet les remplace partout">${hide ? 'afficher les noms' : 'masquer les noms'}</button></div>
        <div class="idz-f"><label>Nom <input data-f="lastName" value="${esc(I.lastName)}" autocomplete="off"></label><label>Prénom <input data-f="firstName" value="${esc(I.firstName)}" autocomplete="off"></label><label class="idz-row">Date de naissance <input type="date" data-f="birthDate" value="${esc(I.birthDate)}"></label><label class="idz-row">IPP <input data-f="ipp" value="${esc(I.ipp)}" autocomplete="off"></label></div></div>`;
    },
    /** mois et année de naissance du patient : repris de la date de naissance de l'identité quand elle est remplie */
    lockBirthFields(box, d) {
      const has = /^\d{4}-\d{2}-\d{2}$/.test((d.identity || {}).birthDate || ''), P = d.patient;
      for (const f of ['birthMonth', 'birthYear']) { const el = box.querySelector(`[data-f="${f}"]`); if (!el) continue; el.disabled = has; el.title = has ? 'd’après la date de naissance de la zone Identité' : (f === 'birthMonth' ? 'mois (facultatif : pour l’âge exact sur la frise)' : 'année'); if (has) el.value = P[f] || ''; }
    },
    /** table de correspondance : un CSV, tous les dossiers (corbeille comprise), trace dans chaque journal */
    async exportIdentityTable() {
      if (!confirm('La table de correspondance relie chaque code à l’identité du patient (nom, prénom, date de naissance, IPP).\nC’est un fichier identifiant : à garder dans le système d’information du centre, jamais joint à un partage de recherche.\n\nExporter la table ?')) return;
      const all = (await L.list()).concat(await L.list({ deleted: true })), rows = [['code', 'pseudonyme', 'nom', 'prénom', 'date de naissance', 'IPP', 'créé le', 'à la corbeille']];
      for (const x of all) {
        let d; try { d = await L.load(x.id); } catch (e) { continue; } const I = d.identity || {};
        rows.push([S.subjectLabel(d), d.patient.pseudo || '', I.lastName || '', I.firstName || '', I.birthDate || '', I.ipp || '', (d.created || '').slice(0, 10), d.deleted ? 'oui' : '']);
        if (!d._readonly && !d.deleted) { S.log(d, 'export', 'dossier', d.id, 'table de correspondance exportée', L.user); try { await L.save(d); } catch (e) { } }
      }
      const q = v => /[;"\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
      rows.splice(1, rows.length - 1, ...rows.slice(1).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
      this.download(`table_correspondance_${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + rows.map(r => r.map(q).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
      this.toast(`Table de correspondance : ${rows.length - 1} patient${rows.length > 2 ? 's' : ''}`, 3000);
    },
  };
  Object.assign(A, M);
  /** masquage des noms (réglage du poste) : propriété calculée, Object.assign ne copierait que sa valeur */
  Object.defineProperty(A, 'anon', { get() { return lsGet('sv_anon') === '1'; }, configurable: true });
  try { document.body.classList.toggle('anon-names', A.anon); } catch (e) { }

  // carte du patient : zone « Identité » en tête, liée à d.identity
  SV.Hooks.wrap(A, 'renderDxPatient', function (orig) {
    const r = orig(), d = this.dossier, box = $('dxPatient'); if (!d || !box) return r;
    if (S.syncBirth(d)) this.touch('patient', null, 'date de naissance reprise de l’identité');
    box.insertAdjacentHTML('afterbegin', this.identityHtml(d)); const z = box.querySelector('.idz'); this.lockBirthFields(box, d);
    this.bindFields(z.querySelector('.idz-f'), d.identity, 'identity', k => { if (k === 'birthDate') { if (S.syncBirth(d)) this.renderDxTimeline && this.renderDxTimeline(); this.lockBirthFields(box, d); } if (k === 'lastName' || k === 'firstName') { this.updateCrumbs && this.updateCrumbs(); this.renderSubbar && this.renderSubbar(); const h = box.closest('.scr-inner'); const h2 = h && h.querySelector('h2'); if (h2) h2.textContent = this.dname(d); } });
    const fr = z.querySelector('.idz-from'); if (fr) fr.onclick = e => { e.preventDefault(); Object.assign(d.identity, S.parseName(d.patient.pseudo)); this.touch('identity', null, 'identité reprise du pseudonyme'); this.renderDxPatient(); this.updateCrumbs && this.updateCrumbs(); };
    z.querySelector('.idz-eye').onclick = e => { e.preventDefault(); this.setAnon(!this.anon); };
    return r;
  }, 'identity_ui');
  // ouverture d'un dossier : code attribué s'il manque
  SV.Hooks.wrap(A, 'openDossier', async function (orig) { const r = await orig(); if (this.dossier) await this.ensureSubject(this.dossier); return r; }, 'identity_ui');
  // Patients : bouton « Réglages » de la bibliothèque
  SV.Hooks.wrap(A, 'renderPatients', async function (orig) {
    const r = await orig(), bar = document.querySelector('#scr-patients .lib-bar') || document.querySelector('.lib-bar');
    if (bar && !bar.querySelector('.ls-btn') && !L.pendingHandle) { const b = document.createElement('button'); b.className = 'ls-btn'; b.textContent = 'Réglages…'; b.title = 'préfixe des codes de sujet, nom du centre'; b.onclick = async () => { if (await this.librarySettingsDialog(false)) this.renderPatients(); }; bar.appendChild(b); }
    if (bar && !bar.querySelector('.anon-btn')) { const b = document.createElement('button'); b.className = 'anon-btn' + (this.anon ? ' on' : ''); b.textContent = this.anon ? 'Afficher les noms' : 'Masquer les noms'; b.title = 'sur ce poste : remplace les noms des patients par leur code partout à l’écran (projection, enseignement, partage d’écran)'; b.onclick = () => this.setAnon(!this.anon); bar.appendChild(b); }
    return r;
  }, 'identity_ui');
})(window.SV = window.SV || {});
