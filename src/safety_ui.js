/* EpiScope — safety_ui.js (v1.0.1) : « rien ne se perd » côté interface.
 *   - Dossier › Journal : corbeille du dossier (éléments supprimés, restaurables avec leurs fichiers ; vider) et versions
 *     enregistrées (history/ : aperçu en chiffres, restauration, téléchargement, point de restauration volontaire) ;
 *   - Patients : corbeille de la bibliothèque (patients supprimés : restaurer, supprimer définitivement) ;
 *   - dossier écrit par une version plus récente d'EpiScope : lecture seule, bandeau ;
 *   - stockage du navigateur : demande de stockage persistant, avertissement à la création d'un patient.
 *   Modèle : store.js (remove / discard / restoreTrash / purgeTrash) ; stockage : library.js (save, history, trash/).   */
(function (SV) {
  'use strict';
  const S = SV.Store, L = SV.Library, Hs = SV.History, A = SV.app;
  const esc = SV.U.esc, $ = id => document.getElementById(id);
  const fmtDT = s => { if (!s) return ''; const d = new Date(s); return isNaN(d) ? String(s) : d.toLocaleString(SV.LOC, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
  const KIND = { exploration: 'exploration', session: 'séance', seizure: 'crise', imaging: 'image', lesion: 'lésion', meeting: 'staff', hypothesis: 'hypothèse', decision: 'décision', procedure: 'procédure', outcome: 'suivi', exam: 'bilan', gallery: 'capture', aed: 'traitement', roi: 'ROI', recording: 'tracé', attachment: 'pièce jointe' };
  const kb = n => n == null ? '' : n > 1e6 ? (n / 1e6).toFixed(1) + ' Mo' : Math.max(1, Math.round(n / 1e3)) + ' ko';
  const countOf = d => `${d.explorations.length} exploration${d.explorations.length > 1 ? 's' : ''} · ${d.seizures.length} crise${d.seizures.length > 1 ? 's' : ''} · ${(d.meetings || []).length} staff${(d.meetings || []).length > 1 ? 's' : ''} · ${d.imaging.length} image${d.imaging.length > 1 ? 's' : ''} · ${(d.gallery || []).length} capture${(d.gallery || []).length > 1 ? 's' : ''}`;

  const M = {
    // ================================================================ Dossier › Journal : corbeille et versions
    renderSafetyCards(host) {
      const d = this.dossier; if (!d || !host) return;
      const wrap = document.createElement('div'); wrap.className = 'safety'; const head = host.querySelector('.view-head'); if (head) head.after(wrap); else host.prepend(wrap);
      const T = (d.trash || []).slice().reverse();
      wrap.innerHTML = `<div class="card sf-trash"><div class="card-h">Corbeille du dossier <span class="muted">${T.length ? T.length + ' élément' + (T.length > 1 ? 's' : '') + ' supprimé' + (T.length > 1 ? 's' : '') + ', restaurable' + (T.length > 1 ? 's' : '') + ' avec leurs fichiers' : 'vide'}</span><span class="spacer"></span>${T.length ? '<button class="mini-btn danger" data-a="purge" title="efface définitivement les éléments de la corbeille et leurs fichiers">Vider la corbeille…</button>' : ''}</div>
          ${T.length ? `<table class="sf-t"><tbody>${T.map(e => `<tr data-id="${esc(e.id)}"><td class="muted">${esc(fmtDT(e.t))}${e.user ? ' · ' + esc(e.user) : ''}</td><td>${esc(KIND[e.kind] || e.kind)} <b>${esc(e.label || '')}</b>${e.items.length > 1 ? ` <span class="muted small">(+ ${e.items.length - 1} élément${e.items.length > 2 ? 's' : ''} lié${e.items.length > 2 ? 's' : ''})</span>` : ''}${(e.files || []).length ? ` <span class="muted small">· ${e.files.length} fichier${e.files.length > 1 ? 's' : ''}</span>` : ''}</td><td class="acts"><button class="mini-btn primary" data-a="restore">Restaurer</button></td></tr>`).join('')}</tbody></table>` : '<div class="hint">Tout ce qui est supprimé (exploration, crise, staff, tracé, image, capture, pièce jointe…) arrive ici, avec ses liens et ses fichiers, et peut être remis en place.</div>'}</div>
        <div class="card sf-hist"><div class="card-h">Versions enregistrées <span class="muted sf-hn">…</span><span class="spacer"></span><button class="mini-btn" data-a="point" title="range l'état actuel du dossier comme version à garder (jamais supprimée automatiquement)">Créer un point de restauration</button></div><div class="sf-hl hint">Lecture de l'historique…</div></div>`;
      wrap.querySelectorAll('.sf-trash [data-a=restore]').forEach(b => b.onclick = () => this.trashRestore(b.closest('tr').dataset.id));
      const pg = wrap.querySelector('[data-a=purge]'); if (pg) pg.onclick = () => this.trashPurge();
      wrap.querySelector('[data-a=point]').onclick = async () => { const r = await L.restorePoint(d); this.setSaveState(r.ok ? 'saved' : 'error'); this.toast(r.ok ? 'Point de restauration créé' : 'Point de restauration impossible', 3000); this.renderHistoryList(wrap); };
      this.renderHistoryList(wrap);
    },
    async renderHistoryList(wrap) {
      const d = this.dossier, box = wrap.querySelector('.sf-hl'), hn = wrap.querySelector('.sf-hn'); if (!box) return;
      let H = []; try { H = await L.listHistory(d); } catch (e) { box.textContent = 'Historique illisible : ' + e.message; return; }
      hn.textContent = H.length ? `${H.length} version${H.length > 1 ? 's' : ''} antérieure${H.length > 1 ? 's' : ''} · rétention : tout pendant 48 h, puis une par jour (90 j), puis une par mois ; les points de restauration sont gardés` : 'aucune pour l’instant';
      box.className = 'sf-hl';
      box.innerHTML = H.length ? `<table class="sf-t"><tbody>${H.slice(0, 60).map(x => `<tr data-n="${esc(x.name)}"><td class="muted">${esc(fmtDT(x.t))}</td><td>version ${x.rev} · ${esc((Hs.LABEL || {})[x.reason] || x.reason)}${x.pinned ? ' <span class="badge">gardée</span>' : ''} <span class="muted small sf-sum"></span></td><td class="muted small">${kb(x.size)}</td><td class="acts"><button class="mini-btn" data-a="peek" title="contenu de cette version, en chiffres">Aperçu</button><button class="mini-btn" data-a="dl" title="télécharger le dossier.json de cette version">⤓</button><button class="mini-btn primary" data-a="back">Restaurer…</button></td></tr>`).join('')}</tbody></table>${H.length > 60 ? `<div class="hint">${H.length - 60} versions plus anciennes dans le répertoire history/ du patient.</div>` : ''}`
        : '<div class="hint">Avant chaque enregistrement, l’état précédent est rangé ici (à l’ouverture du dossier, puis toutes les 10 minutes de travail, et toujours avant une suppression, une restauration ou un import).</div>';
      box.querySelectorAll('tr[data-n]').forEach(tr => {
        const n = tr.dataset.n, A0 = a => tr.querySelector(`[data-a=${a}]`);
        A0('peek').onclick = async () => { try { const o = await L.readHistory(d, n); tr.querySelector('.sf-sum').textContent = '— ' + countOf(o) + ' · ' + (o.journal || []).length + ' entrées de journal'; } catch (e) { this.toast(e.message, 4000); } };
        A0('dl').onclick = async () => { try { const o = await L.readHistory(d, n); this.download(`${this.fileStem(d)}_${n.replace(/\.gz$/, '')}`, JSON.stringify(o, null, 1), 'application/json'); } catch (e) { this.toast(e.message, 4000); } };
        A0('back').onclick = () => this.restoreRevision(n);
      });
    },
    async trashRestore(id) {
      const d = this.dossier; if (!d) return;
      if (this.persistWorkspace && this.ctx) this.persistWorkspace();
      const r = S.restoreTrash(d, id); if (!r.ok) { this.toast('Élément introuvable dans la corbeille', 3000); return; }
      const lost = await L.restoreFiles(d, r.entry.files || []);
      this.touch(); await this.flushSave();
      const msg = `« ${r.entry.label || KIND[r.entry.kind] || 'élément'} » restauré` + (r.missing.length ? ` — ${r.missing.length} élément(s) sans parent (supprimé depuis) : ${r.missing.join(', ')}` : '') + (lost.length ? ` — ${lost.length} fichier(s) introuvable(s)` : '');
      this.toast(msg, r.missing.length || lost.length ? 7000 : 3500);
      if (this.ctx && this.openContext) { try { this.openContext(this.ctx, true); } catch (e) { } }
      this.go({ stage: 'dossier', view: 'journal' });
    },
    async trashPurge() {
      const d = this.dossier, n = (d.trash || []).length; if (!n) return;
      if (!confirm(`Effacer définitivement les ${n} élément(s) de la corbeille et leurs fichiers ?\nUne version du dossier avant la purge reste dans l’historique, mais les fichiers effacés ne pourront pas être récupérés.`)) return;
      const P = S.purgeTrash(d); this.touch(); await this.flushSave(); await L.purgeFiles(d, P.files);
      this.toast(`Corbeille vidée : ${P.n} élément(s), ${P.files.length} fichier(s) effacé(s)`, 3500); this.go({ stage: 'dossier', view: 'journal' });
    },
    /** remplace le dossier par une version de l'historique ; l'état actuel est d'abord rangé (motif « restore », gardé) */
    async restoreRevision(name) {
      const d = this.dossier; if (!d) return;
      let o; try { o = await L.readHistory(d, name); } catch (e) { this.toast(e.message, 4000); return; }
      if (!confirm(`Revenir à la version ${Hs.parse(name).rev} du ${fmtDT(Hs.parse(name).t)} ?\n\nContenu : ${countOf(o)}\nActuel : ${countOf(d)}\n\nL’état actuel est d’abord rangé dans l’historique (version gardée) : ce retour en arrière peut lui-même être annulé.`)) return;
      if (this.persistWorkspace && this.ctx) this.persistWorkspace(); await this.flushSave();
      if (this._saveState === 'conflict' || this._saveState === 'error') { this.toast('Enregistrement en échec : restauration annulée', 5000); return; }
      o.id = d.id; o.revision = d.revision; o._base = d._base; o._snap = 'restore'; o.ui = d.ui; delete o.deleted;
      S.log(o, 'restore', 'dossier', o.id, 'retour à la version ' + Hs.parse(name).rev + ' (' + fmtDT(Hs.parse(name).t) + ')', L.user);
      const r = await L.save(o); if (!r.ok) { this.toast(r.conflict ? 'Dossier modifié ailleurs : restauration annulée (rien n’a été écrasé)' : 'Restauration impossible', 6000); return; }
      const lost = await L.restoreFiles(o, [...S.filesUsed(o)].filter(Boolean));
      const id = d.id; this.dossier = null; this.ctx = null;
      await this.openDossier(id, { quiet: true, loc: { stage: 'dossier', view: 'journal' } });
      this.toast(`Version ${Hs.parse(name).rev} restaurée${lost.length ? ` — ${lost.length} fichier(s) cité(s) introuvable(s)` : ''}`, lost.length ? 7000 : 3500);
    },

    // ================================================================ Patients : corbeille de la bibliothèque
    async renderLibraryTrash(anchor) {
      let list = []; try { list = await L.list({ deleted: true }); } catch (e) { this.toast(e.message, 4000); return; }
      const box = document.createElement('div'); box.className = 'card sf-libtrash';
      box.innerHTML = `<div class="card-h">Corbeille de la bibliothèque <span class="muted">${list.length ? list.length + ' patient' + (list.length > 1 ? 's' : '') : 'vide'}</span><span class="spacer"></span><button class="mini-btn" data-a="close">Fermer</button></div>
        ${list.length ? `<table class="sf-t"><tbody>${list.map(x => `<tr data-id="${esc(x.id)}"><td><b>${esc(this.dnameSum(x))}</b></td><td class="muted">supprimé le ${esc(fmtDT(x.deleted && x.deleted.at))}${x.deleted && x.deleted.by ? ' par ' + esc(x.deleted.by) : ''}</td><td class="muted">${x.nExpl} expl. · ${x.nSeizures} crises · ${x.nImaging} images</td><td class="acts"><button class="mini-btn primary" data-a="undel">Restaurer</button><button class="mini-btn danger" data-a="purge">Supprimer définitivement…</button></td></tr>`).join('')}</tbody></table>` : '<div class="hint">Un patient supprimé arrive ici avec tous ses fichiers ; rien n’est effacé tant qu’il n’est pas supprimé définitivement d’ici.</div>'}`;
      const old = document.querySelector('.sf-libtrash'); if (old) old.remove();
      anchor.after(box);
      box.querySelector('[data-a=close]').onclick = () => box.remove();
      box.querySelectorAll('tr[data-id]').forEach(tr => {
        const x = list.find(y => y.id === tr.dataset.id);
        tr.querySelector('[data-a=undel]').onclick = async () => { await L.undelete(x.id); this.toast(`« ${this.dnameSum(x)} » restauré`, 3000); this.renderPatients(); };
        tr.querySelector('[data-a=purge]').onclick = async () => {
          const typed = prompt(`Supprimer DÉFINITIVEMENT « ${this.dnameSum(x)} » et TOUS ses fichiers (imagerie, tracés, vidéos, historique) ?\nCette opération ne peut pas être annulée. Exportez d’abord le dossier si besoin.\nTapez ${x.subject ? 'le code ' + x.subject : 'le pseudonyme'} pour confirmer :`);
          if (typed !== (x.subject || x.pseudo)) { if (typed != null) this.toast('Saisie différente : rien n’a été supprimé', 3000); return; }
          await L.purge(x.id); this.toast(`« ${this.dnameSum(x)} » supprimé définitivement`, 3500); this.renderPatients();
        };
      });
    },

    // ================================================================ lecture seule, stockage du navigateur
    readonlyNotice(d) {
      if (!d || !d._readonly) return;
      this.toast(`Ce dossier a été enregistré par une version plus récente d’EpiScope (${esc((d.writer && d.writer.app) || d.minReader)}) : ouvert en lecture seule. Mettez EpiScope à jour pour le modifier.`, 9000);
    },
    async requestPersistentStorage() {
      try { if (L.mode === 'browser' && navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); } catch (e) { /* non disponible */ }
    },
    /** à la création d'un patient en mode navigateur : avertissement (données réelles → répertoire) ; renvoie vrai pour continuer */
    browserModeOk() {
      if (L.mode !== 'browser') return true;
      return confirm('Attention : la bibliothèque est dans le stockage de ce navigateur, sur ce poste.\nLe navigateur peut l’effacer (nettoyage, profil, mise à jour) et elle n’est pas sauvegardée.\n\nPour un vrai patient, choisissez d’abord un répertoire (Patients › « Choisir un répertoire », de préférence le partage réseau de l’équipe).\n\nCréer quand même ce dossier dans le navigateur (essai, démonstration) ?');
    },
  };
  Object.assign(SV.app, M);
})(window.SV = window.SV || {});
