/* EpiScope — bids_ui.js (v1.1.0) : retirer les noms de fichiers d'origine d'un dossier existant.
 *   Les exports des logiciels d'acquisition portent souvent le nom du patient ; avant v1.1.0, les tracés étaient rangés sous ce
 *   nom et leur titre le reprenait. Carte « Noms de fichiers d'origine » dans Dossier › Journal : liste des renommages prévus
 *   (plan pur : SV.BIDS.renamePlan), version épinglée « migration » avant d'appliquer, fichiers renommés (en-têtes BrainVision
 *   réécrits, ancien en-tête rangé dans trash/), titres neutres reportés partout (SV.BIDS.applyTitles).                    */
(function (SV) {
  'use strict';
  const B = SV.BIDS, L = SV.Library, S = SV.Store, A = SV.app, esc = SV.U.esc;
  const told = new Set();

  const M = {
    bidsPlan() { return this.dossier ? B.renamePlan(this.dossier) : { files: [], titles: [], n: 0 }; },
    renderBidsCard(host) {
      const d = this.dossier; if (!d || !host || d._readonly) return; const P = this.bidsPlan(); if (!P.n) return;
      const box = document.createElement('div'); box.className = 'card bids-card';
      const nf = P.files.length, nt = P.titles.length;
      box.innerHTML = `<div class="card-h">Noms de fichiers d’origine <span class="muted">${nf} fichier${nf > 1 ? 's' : ''} à renommer${nt ? ` · ${nt} titre${nt > 1 ? 's' : ''} à neutraliser` : ''}</span><span class="spacer"></span><button class="mini-btn primary" data-a="apply">Renommer selon BIDS</button></div>
        <div class="hint">Les fichiers exportés par les logiciels d’acquisition portent souvent le nom du patient. EpiScope les range désormais sous un nom BIDS fondé sur le code du sujet (ex. sub-HFAR0007_ses-seeg1_task-seizure_run-01_ieeg.edf) et donne aux tracés un titre neutre (type · date · run). Une version du dossier est épinglée avant le renommage.</div>
        <details><summary>Détail des changements</summary><table class="mini"><tbody>${P.files.map(f => `<tr><td class="mono">${esc(f.from.split('/').pop())}</td><td>→</td><td class="mono">${esc(f.to.split('/').pop())}</td></tr>`).join('')}${P.titles.map(t => `<tr><td>${esc(t.from || '—')}</td><td>→</td><td>${esc(t.to)}</td></tr>`).join('')}</tbody></table></details>`;
      const safety = host.querySelector('.safety'); if (safety) safety.prepend(box); else host.prepend(box);
      box.querySelector('[data-a=apply]').onclick = async e => { e.target.disabled = true; await this.bidsApply(); };
    },
    /** applique le plan au dossier ouvert ; renvoie { files, titles, errors } */
    async bidsApply() {
      const d = this.dossier; if (!d || d._readonly) return null; const P = this.bidsPlan(); if (!P.n) return { files: 0, titles: 0, errors: [] };
      await this.flushSave(); try { const r = await L.save(d); if (r && r.ok) await L.snapshot(d, JSON.stringify(d), d, 'migrate', true); } catch (e) { console.warn('version avant renommage', e); }
      const recs = new Map([].concat(...d.explorations.map(ex => ex.recordings || [])).map(r => [r.id, r])), errors = []; let nf = 0;
      for (const f of P.files) {
        const rec = recs.get(f.recId); if (!rec) continue;
        try {
          if (f.rewrite) { const b = await L.readFile(d, f.from); if (!b) throw new Error('fichier absent'); await L.writeFile(d, f.to, B.vhdrRename(new Uint8Array(await b.arrayBuffer()), f.rewrite.dataFile, f.rewrite.markerFile)); await L.removeFile(d, f.from); }
          else await L.renameFile(d, f.from, f.to);
          rec.files[f.key] = f.to; nf++;
        } catch (e) { errors.push(`${f.to.split('/').pop()} : ${e.message}`); }
      }
      const nt = B.applyTitles(d, P.titles.filter(t => t.kind === 'imaging' || !errors.length || P.files.filter(f => f.recId === t.id).every(f => recs.get(t.id).files[f.key] === f.to)), this.state && this.state.quant);
      S.log(d, 'edit', 'dossier', d.id, `noms de fichiers BIDS : ${nf} fichier${nf > 1 ? 's' : ''} renommé${nf > 1 ? 's' : ''}, ${nt} texte${nt > 1 ? 's' : ''} neutralisé${nt > 1 ? 's' : ''}`, L.user);
      this.touch(); await this.flushSave();
      this.toast(errors.length ? `Renommage partiel : ${errors.length} erreur${errors.length > 1 ? 's' : ''} — ${errors[0]}` : `Noms BIDS : ${nf} fichier${nf > 1 ? 's' : ''} renommé${nf > 1 ? 's' : ''}`, errors.length ? 8000 : 3500);
      if (document.querySelector('.bids-card') && this.go) this.go({ stage: 'dossier', view: 'journal' });
      return { files: nf, titles: nt, errors };
    },
  };
  Object.assign(A, M);

  SV.Hooks.wrap(A, 'renderSafetyCards', function (orig, host) { const r = orig(host); this.renderBidsCard(host); return r; }, 'bids_ui');
  // à l'ouverture : un rappel par dossier et par séance
  SV.Hooks.wrap(A, 'openDossier', async function (orig) {
    const r = await orig(), d = this.dossier;
    if (d && !d._readonly && !told.has(d.id)) { told.add(d.id); const P = this.bidsPlan(); if (P.files.length) this.toast(`Fichiers encore sous leur nom d’origine dans ce dossier : ${P.files.length} — Dossier › Journal › « Renommer selon BIDS »`, 6000); }
    return r;
  }, 'bids_ui');
})(window.SV = window.SV || {});
