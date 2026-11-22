/* EpiScope — migrate_ui.js (v2.0.0) : essai à blanc de la conversion au format 2.0 (schéma 3 : plus de séances, crises
 * rattachées à leur exploration ou au dossier). Chaque dossier.json de l'ancien format est relu tel quel, converti sur
 * une copie en mémoire (S.migrate3) et le rapport affiché ; rien n'est écrit. La conversion réelle se fait à l'ouverture
 * du dossier (S.normalize), l'état d'avant étant épinglé dans l'historique (motif « migrate »).                       */
(function (SV) {
  'use strict';
  const S = SV.Store, L = SV.Library, A = SV.app, esc = SV.U.esc;
  const M = {
    /** rows : résumés de la liste des patients (oldFormat) */
    async migrationDryRun(rows) {
      document.querySelectorAll('#migDlg').forEach(x => x.remove());
      const box = document.createElement('div'); box.className = 'modal'; box.id = 'migDlg';
      box.innerHTML = `<div class="modal-card"><div class="modal-head"><span>Format 2.0 : essai à blanc</span><button class="close">✕</button></div><div class="mig-body hint">Lecture des dossiers…</div>
        <div class="btnrow"><span class="spacer"></span><button class="close">Fermer</button></div></div>`;
      document.body.appendChild(box); box.hidden = false; box.querySelectorAll('.close').forEach(b => b.onclick = () => box.remove());
      const out = [];
      for (const x of rows || []) {
        try { const raw = await L.loadRaw(x.id), R = S.migrate3(JSON.parse(JSON.stringify(raw))); out.push({ x, R }); }
        catch (e) { out.push({ x, err: e.message }); }
      }
      const tot = k => out.reduce((n, o) => n + (o.R ? o.R[k] : 0), 0);
      const body = box.querySelector('.mig-body'); body.className = 'mig-body';
      body.innerHTML = `<p class="muted small">Rien n’est écrit. À l’ouverture de chaque dossier : les crises sont rattachées à l’exploration de leur séance (date de la séance reprise si la crise n’en a pas), les notes et fichiers des séances sont versés, datés, dans les notes de l’exploration, et l’état d’avant reste dans l’historique du dossier. Une version antérieure d’EpiScope ouvrira ensuite ces dossiers en lecture seule.</p>
        <table class="ptable"><thead><tr><th>Code</th><th>Patient</th><th>Séances</th><th>Crises</th><th>Notes versées</th><th title="crises dont la séance n’avait pas d’exploration : deviennent des crises rapportées (dossier)">Sans exploration</th><th>Corbeille</th></tr></thead><tbody>
        ${out.map(({ x, R, err }) => `<tr><td class="mono">${esc(x.subject || '—')}</td><td>${esc(this.dnameSum ? this.dnameSum(x) : x.pseudo || '')}</td>${err ? `<td colspan="5" class="warn">illisible : ${esc(err)}</td>` : `<td>${R.sessions}</td><td>${R.seizures}</td><td>${R.notes}</td><td>${R.orphans ? `<b>${R.orphans}</b>` : 0}</td><td>${R.trash}</td>`}</tr>`).join('')}
        </tbody><tfoot><tr><td></td><td><b>Total</b></td><td>${tot('sessions')}</td><td>${tot('seizures')}</td><td>${tot('notes')}</td><td>${tot('orphans')}</td><td>${tot('trash')}</td></tr></tfoot></table>`;
      return out;
    },
  };
  Object.assign(A, M);
})(window.SV);
