/* EpiScope — spikenet2_ui.js (v2.1.0) : ajouter les poids de SpikeNet2 à la bibliothèque et les utiliser dans « Pointes → source ».
 *
 *   sn2Dialog()            fenêtre « Poids de SpikeNet2 » : état, licence, installation depuis un point de contrôle .ckpt, retrait
 *   sn2Head()              en-tête des poids installés (architecture, empreinte, date) ou null ; mis en cache (sn2Refresh)
 *   sn2Weights()           poids (ArrayBuffer EPSN2) pour un calcul, gardés en mémoire le temps de la session
 *   sn2ScanD(D, step, ...) balayage des 19 voies déjà filtrées à 128 Hz, réparti sur des workers qui chargent les poids une fois
 *   sn2SettingsRow(el)     ligne de la fenêtre « Réglages de la bibliothèque »
 *
 * Les poids restent dans la bibliothèque de l'utilisateur (Library.putModel : models/spikenet2.epsn2 ou base du navigateur) :
 * jamais dans un dossier patient, un export, une archive .episcope ni dans le fichier EpiScope.html.                    */
(function () {
  'use strict';
  const A = SV.app, L = SV.Library, esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const NAME = 'spikenet2', mo = n => (n / 1048576).toLocaleString(SV.LOC, { maximumFractionDigits: 0 }) + ' Mo';
  const LICENCE = 'Les poids de SpikeNet2 ne sont pas fournis avec EpiScope. La BDSP (bdsp.io) les distribue à des utilisateurs accrédités, sous une licence restreinte (BDSP Restricted Health Data License) : les ajouter ici suppose que votre accord avec la BDSP permet leur usage sur ce poste. Ils restent dans votre bibliothèque (dossier « models ») ; EpiScope ne les copie jamais dans un dossier patient, un export, une archive ni dans son propre fichier.';
  let head = undefined, weights = null;

  const M = {
    /** en-tête des poids installés (null : aucun) ; undefined tant que la bibliothèque n'a pas été lue */
    sn2Head() { if (head === undefined) this.sn2Refresh(); return head || null; },
    async sn2Refresh() {
      const h = L.modelHead ? await L.modelHead(NAME) : null; let H = null;
      if (h) { try { H = Object.assign(SV.SpikeNet2.header(h.head), { size: h.size }); } catch (e) { H = { broken: String(e.message || e), size: h.size }; } }
      const changed = JSON.stringify(H) !== JSON.stringify(head); head = H; if (!H) weights = null;
      if (changed && this._iev && this._iev.meth === 'esp' && this.esiRender) this.esiRender();
      return H;
    },
    async sn2Weights() {
      const H = await this.sn2Refresh(); if (!H || H.broken) return null;
      if (weights && SV.SpikeNet2.header(weights).sha === H.sha) return weights;
      weights = await L.getModel(NAME); return weights;
    },
    /** D : 19 voies à 128 Hz (spikenet.js : prep) → probabilités, une fenêtre tous les `step` échantillons ; prog(f) */
    async sn2ScanD(buf, D, step, prog, cancelled) {
      const N = SV.SpikeNet2, n = D[0].length, CH = 128 * 60;
      if (!(SV.Work && SV.Work.available)) return N.scan(buf, D, step, {}, prog).p;
      const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 2, pool = SV.Work.pool(['spikenet2'], Math.max(1, Math.min(4, cores - 1)));
      try {
        // chaque worker reçoit sa copie des poids (appels lancés ensemble : un par worker libre), puis les fenêtres par minutes
        await Promise.all(Array.from({ length: pool.size }, () => { const c = buf.slice(0); return pool.call('SpikeNet2.init', [c], [c]); }));
        const jobs = []; let done = 0;
        for (let s0 = 0; s0 + N.W <= n; s0 += CH) {
          const e = Math.min(n, s0 + CH + N.W - step), sl = D.map(d => d.slice(s0, e));
          jobs.push(pool.call('SpikeNet2.scan', [null, sl, step, {}], sl.map(x => x.buffer)).then(r => { if (prog) prog((++done) / jobs.length); return r.p; }));
        }
        const parts = await Promise.all(jobs); if (cancelled && cancelled()) return new Float32Array(0);
        const P = new Float32Array(parts.reduce((q, x) => q + x.length, 0)); let o = 0; for (const x of parts) { P.set(x, o); o += x.length; } return P;
      } finally { pool.close(); }
    },
    /** fenêtre « Poids de SpikeNet2 » */
    async sn2Dialog() {
      const H = await this.sn2Refresh(), m = document.createElement('div'); m.className = 'modal';
      const state = !H ? '<b>Non installés.</b> Le détecteur SpikeNet2 reste indisponible ; SpikeNet (première version, livré avec EpiScope) fonctionne sans rien ajouter.'
        : H.broken ? `<b>Fichier de poids illisible</b> (${esc(H.broken)}) : réinstaller à partir du point de contrôle.`
        : `<b>Installés</b> le ${new Date(H.installed || Date.now()).toLocaleDateString(SV.LOC)} · ${(H.nParams / 1e6).toLocaleString(SV.LOC, { maximumFractionDigits: 1 })} millions de paramètres, ${H.cfg.stages.length} étages · ${mo(H.size || 0)} · empreinte <span class="mono">${esc(H.sha.slice(0, 16))}</span>${H.source ? ' · d’après « ' + esc(H.source) + ' »' : ''}`;
      m.innerHTML = `<div class="modal-card" style="max-width:600px"><div class="modal-head"><b>Poids de SpikeNet2</b><span class="spacer"></span><button class="close">✕</button></div><div class="prov-body">
        <p class="sn2-state">${state}</p>
        <div class="hint">SpikeNet2 (Li et al., NEJM AI 2025) détecte les pointes de l’EEG de scalp avec un réseau résiduel entraîné sur plus de 17 000 EEG, avec une recherche des faux positifs difficiles (artefacts). Il s’emploie comme SpikeNet : 19 électrodes 10-20, fenêtres de 1 s, seuil de probabilité. Calcul sur ce poste, plus long que SpikeNet (de l’ordre de quelques minutes par heure d’EEG).</div>
        <div class="hint">${LICENCE}</div>
        <div class="hint">Fichier attendu : le point de contrôle de SpikeNet2 publié par les auteurs (« new_weights.ckpt », PyTorch Lightning, environ 370 Mo). Seul le réseau est lu (environ 120 Mo rangés) ; l’état d’apprentissage contenu dans le fichier est ignoré.</div>
        <div class="sn2-prog small muted"></div>
        <div class="btnrow"><button class="primary sn2-add">${H ? 'Remplacer à partir d’un point de contrôle…' : 'Ajouter à partir d’un point de contrôle…'}</button>${H ? '<button class="sn2-del">Retirer les poids</button>' : ''}<span class="spacer"></span><button class="sn2-close">Fermer</button></div>
        <input type="file" class="sn2-file" accept=".ckpt,.pt,.pth" hidden></div></div>`;
      document.body.appendChild(m);
      const q = s => m.querySelector(s), close = () => m.remove(), prog = q('.sn2-prog');
      q('.close').onclick = close; q('.sn2-close').onclick = close;
      q('.sn2-add').onclick = () => q('.sn2-file').click();
      if (q('.sn2-del')) q('.sn2-del').onclick = async () => {
        if (!confirm('Retirer les poids de SpikeNet2 de la bibliothèque ?\nLe fichier est rangé dans models/trash (récupérable) ; les détections déjà faites restent.')) return;
        await L.removeModel(NAME); weights = null; await this.sn2Refresh(); this.toast('Poids de SpikeNet2 retirés (rangés dans models/trash)', 4000); close();
      };
      q('.sn2-file').onchange = async e => {
        const f = e.target.files && e.target.files[0]; if (!f) return; const btns = m.querySelectorAll('button'); btns.forEach(b => { b.disabled = true; });
        try {
          prog.textContent = 'Lecture du point de contrôle…';
          const R = await SV.SpikeNet2.readCkpt(f, p => { prog.textContent = `Lecture du réseau : ${Math.round(p * 100)} %`; });
          prog.textContent = 'Vérification et rangement…';
          const buf = await SV.SpikeNet2.pack(R, { installed: SV.Store.now(), source: String(f.name || '').split(/[\\/]/).pop().slice(0, 80), by: L.user || '' });
          SV.SpikeNet2.load(buf); await L.putModel(NAME, buf); weights = buf; await this.sn2Refresh();
          this.toast('Poids de SpikeNet2 ajoutés à la bibliothèque : le détecteur est disponible dans « Pointes → source ».', 6000); close();
        } catch (err) { console.warn('SpikeNet2', err); prog.textContent = 'Échec : ' + (err && err.message || err); btns.forEach(b => { b.disabled = false; }); }
      };
    },
    /** encadré du détecteur dans les réglages de « Pointes → source » */
    sn2HintHtml() {
      const H = this.sn2Head(), ok = H && !H.broken;
      return `<div class="hint">SpikeNet2 (Li et al., NEJM AI 2025) : réseau résiduel entraîné sur plus de 17 000 EEG de scalp, avec recherche des faux positifs difficiles ; 18 voies en double banane et 19 en référence moyenne, 128 Hz, fenêtres de 1 s tous les 250 ms ; sortie = probabilité de pointe. ${ok ? `Poids installés dans la bibliothèque (empreinte <span class="mono">${esc(H.sha.slice(0, 12))}</span>).` : '<b>Poids non installés</b> : ils ne sont pas fournis avec EpiScope.'} <button class="e-sn2 small">${ok ? 'Poids de SpikeNet2…' : 'Ajouter les poids de SpikeNet2…'}</button></div>`;
    },
    /** ligne de la fenêtre « Réglages de la bibliothèque » */
    async sn2SettingsRow(el) {
      if (!el) return; const H = await this.sn2Refresh();
      el.innerHTML = `<div class="ctrl-row" style="margin-top:8px"><span>Modèles ajoutés : <b>SpikeNet2</b> — ${H && !H.broken ? 'poids installés' : 'poids non installés'}</span><span class="spacer"></span><button class="sn2-open">Gérer…</button></div>`;
      el.querySelector('.sn2-open').onclick = () => this.sn2Dialog();
    },
  };
  Object.assign(A, M);
})();
