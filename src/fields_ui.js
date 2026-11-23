/* EpiScope — fields_ui.js (v2.1.0) : données de recherche saisies dans le dossier, sans alourdir les écrans existants.
 *
 *   histologyField(p, onChange)   procédure : diagnostics histologiques en vocabulaire fermé (pastilles) + texte libre
 *   devChipsHtml / bindDevChips   Développement : comorbidités développementales à trois états (non renseigné → oui → non)
 *   renderPathway(el)             Synthèse : statut final du parcours, motif si récusé, suggestion tirée du dossier
 *   stampRegions(ex, o)           région VEP de chaque plot figée (validation des électrodes, anatomie calculée ensuite)
 *   mniLine / mniBind / mniCompute transformation vers MNI305 (affine ou non linéaire), gabarits adaptés à l'âge
 * Les champs vivent dans store.js (création, normalisation, requêtes) ; ce module ne fait que les montrer.            */
(function (SV) {
  'use strict';
  const S = SV.Store, V = S.V, L = SV.Library, esc = SV.U.esc;
  const opts = (map, v) => Object.entries(map).map(([k, l]) => `<option value="${esc(k)}"${String(v) === k ? ' selected' : ''}>${esc(l)}</option>`).join('');
  const fmtD = iso => iso ? new Date(String(iso).length <= 10 ? iso + 'T12:00:00' : iso).toLocaleDateString(SV.LOC) : '';
  const TISSUE = { 200: 'white-matter', 201: 'CSF', 202: 'other', 0: 'n/a' };

  const M = {
    // ============================================================ histologie (procédure)
    histologyField(p, onChange) {
      const el = document.createElement('div'); el.className = 'histo span2';
      const draw = () => {
        const codes = p.histologyCodes || (p.histologyCodes = []);
        el.innerHTML = `<div class="histo-h"><b>Histologie</b> <span class="muted small">classification fermée (ILAE 2022 pour les FCD, ILAE 2013 pour la sclérose hippocampique, OMS 2021 pour les tumeurs) ; plusieurs diagnostics possibles</span></div>
          <div class="histo-row">${codes.map(k => `<span class="chip on histo-c" data-k="${esc(k)}" title="${esc(V.histology.find(g => g[0] === S.histologyGroup(k))[1])}">${esc(S.histologyLabel(k))} <button class="x" title="retirer">×</button></span>`).join('')}
            <select class="histo-add"><option value="">${codes.length ? '＋ autre diagnostic…' : '＋ diagnostic histologique…'}</option>${V.histology.map(([g, t, list]) => `<optgroup label="${esc(t)}">${list.filter(([k]) => !codes.includes(k)).map(([k, l]) => `<option value="${esc(k)}">${esc(l)}</option>`).join('')}</optgroup>`).join('')}</select></div>
          <input class="histo-t" value="${esc(p.histology || '')}" placeholder="précisions en texte libre (ex. gène, immunohistochimie, marges)">`;
        el.querySelectorAll('.histo-c .x').forEach(b => b.onclick = e => { e.preventDefault(); const k = b.closest('.histo-c').dataset.k; p.histologyCodes = codes.filter(x => x !== k); onChange(); draw(); });
        el.querySelector('.histo-add').onchange = e => { const k = e.target.value; if (!k) return; p.histologyCodes = codes.concat(k); onChange(); draw(); };
        el.querySelector('.histo-t').oninput = e => { p.histology = e.target.value; onChange(); };
      };
      draw(); return el;
    },

    // ============================================================ comorbidités développementales
    devChipsHtml(P) {
      const D = (P && P.dev) || S.newDev(), st = v => v === 'no' ? 'no' : v ? 'yes' : '';
      return `<div class="devc"><span class="devc-h" title="trois états : non renseigné (?) → oui → non ; pour une requête, « non renseigné » n’est pas « non »">Comorbidités développementales</span>${V.devComorb.map(([k, t, s]) => {
        const v = D[k] || '', c = st(v); return `<span class="devc-i"><button class="chip devc-b ${c === 'yes' ? 'on' : c === 'no' ? 'neg' : ''}" data-dk="${k}" title="${esc(t)} : ${esc(c === 'yes' ? 'oui' : c === 'no' ? 'non' : 'non renseigné')}">${c === 'no' ? '<s>' + esc(s) + '</s>' : esc(s)}${c ? '' : ' ?'}</button>${k === 'id' && c === 'yes' ? `<select class="devc-sev" title="sévérité (DSM-5)">${opts(V.idSeverity, v)}</select>` : ''}</span>`;
      }).join('')}</div>`;
    },
    bindDevChips(box, P, after) {
      const D = P.dev = Object.assign(S.newDev(), P.dev);
      box.querySelectorAll('.devc-b').forEach(b => b.onclick = e => { e.preventDefault(); const k = b.dataset.dk, v = D[k]; D[k] = !v ? 'yes' : v === 'no' ? '' : 'no'; this.touch('patient', null, 'comorbidités développementales'); after(); });
      const sv = box.querySelector('.devc-sev'); if (sv) sv.onchange = () => { D.id = sv.value; this.touch('patient', null, 'déficience intellectuelle'); after(); };
    },

    // ============================================================ statut final du parcours
    renderPathway(el) {
      if (!el) return; const d = this.dossier, W = d.pathway = Object.assign(S.newPathway(), d.pathway), sug = S.pathwaySuggest(d);
      const diff = sug.status && sug.status !== W.status;
      el.innerHTML = `<div class="pw"><span class="pw-h" title="statut explicite, lu par les requêtes de recherche ; le dossier propose une suggestion, jamais appliquée seule">Statut du parcours</span>
        <select class="pw-s">${opts(V.pathwayStatus, W.status)}</select>
        ${W.status === 'declined' ? `<select class="pw-r" title="motif de récusation"><option value="">motif…</option>${opts(V.declineReason, W.reason)}</select>` : ''}
        ${W.status ? `<input type="date" class="pw-d" value="${esc(W.date)}" title="date du statut">` : ''}
        ${W.status === 'declined' || W.status === 'lost' ? `<input class="pw-t" value="${esc(W.text)}" placeholder="précision">` : ''}
        ${diff ? `<span class="pw-sug muted small">le dossier suggère : <b>${esc(V.pathwayStatus[sug.status])}</b> (${esc(sug.why)}) <button class="mini-btn pw-apply">appliquer</button></span>` : ''}</div>`;
      const set = o => { S.setPathway(d, o); this.touch('dossier', d.id, 'statut du parcours'); this.renderPathway(el); };
      el.querySelector('.pw-s').onchange = e => set({ status: e.target.value, date: W.date || S.today() });
      const r = el.querySelector('.pw-r'); if (r) r.onchange = e => set({ reason: e.target.value });
      const dt = el.querySelector('.pw-d'); if (dt) dt.onchange = e => set({ date: e.target.value });
      const tx = el.querySelector('.pw-t'); if (tx) tx.onchange = e => set({ text: e.target.value });
      const ap = el.querySelector('.pw-apply'); if (ap) ap.onclick = e => { e.preventDefault(); set({ status: sug.status, date: W.date || S.today() }); };
    },

    // ============================================================ région VEP figée par plot
    /** étiquettes de chaque plot d'une électrode réelle : vote sur trois points de l'axe (±0,8 mm), comme realElectrode */
    contactLabelsOf(spec) {
      const A = this.patientAnat, R = spec && spec.real; if (!A || !A.labelWorld || !R || !R.contacts) return null;
      const tip = R.tip || R.contacts[0], entry = R.entry || R.contacts[R.contacts.length - 1], v = [entry[0] - tip[0], entry[1] - tip[1], entry[2] - tip[2]], nn = Math.hypot(...v) || 1, dir = v.map(x => x / nn);
      return R.contacts.map(c => {
        const votes = {}; for (const t of [-0.8, 0, 0.8]) { const l = A.labelWorld.labelAt(c[0] + dir[0] * t, c[1] + dir[1] * t, c[2] + dir[2] * t); votes[l] = (votes[l] || 0) + 1; }
        const code = +Object.keys(votes).sort((a, b) => votes[b] - votes[a] || +b - +a)[0]; return { code, name: code >= 1 && code <= 162 ? this.atlas.labelEn(code) : (TISSUE[code] || 'n/a') };
      });
    },
    /** fige les régions des plots d'une exploration ; o.force : réétiqueter aussi les plots déjà figés ; renvoie le nombre d'électrodes */
    stampRegions(ex, o) {
      o = o || {}; const d = this.dossier, A = this.patientAnat; if (!d || !ex || !A || !A.labelWorld) return 0; let n = 0;
      for (const spec of ex.electrodes || []) {
        if (!spec.real || !spec.real.contacts) continue; const st = S.contactRegionStatus(d, spec); if (!o.force && st === 'ok') continue; if (!o.force && st === 'stale' && !o.stale) continue;
        const lab = this.contactLabelsOf(spec); if (lab && S.stampContactRegions(d, spec, lab, { method: 'vote sur 3 points de l’axe (±0,8 mm), parcellation VEP du patient' })) n++;
      }
      if (n) S.log(d, 'edit', 'exploration', ex.id, `régions VEP figées pour ${n} électrode${n > 1 ? 's' : ''}`);
      return n;
    },
    regionStatusCounts() {
      const d = this.dossier, c = { ok: 0, missing: 0, stale: 0 }; for (const ex of (d && d.explorations) || []) for (const spec of ex.electrodes || []) { const s = S.contactRegionStatus(d, spec); if (s) c[s]++; } return c;
    },

    // ============================================================ transformation vers MNI305
    mniLine(an) {
      const M0 = an.mni, d = this.dossier, rc = this.regionStatusCounts(), ageT = this.ageTemplateFor ? this.ageTemplateFor() : null;
      const meth = !M0 ? 'affine 12 ddl (centres de structures)' : M0.method === 'affine' ? `affine 12 ddl — ${esc(M0.why || '')}` : `non linéaire (spline régularisée sur ${M0.n} repères${M0.template ? `, via le gabarit « ${esc(M0.template.name)} »` : ''}) : erreur de prédiction des repères exclus ${String(M0.loo.tps).replace('.', ',')} mm contre ${String(M0.loo.affine).replace('.', ',')} mm pour l’affine`;
      const youth = an.segmentation && an.segmentation.age != null && an.segmentation.age < 2 ? '<div class="note warn">Moins de 2 ans au T1 : myélinisation immature, segmentation et coordonnées MNI à interpréter avec prudence.</div>' : '';
      return `<div class="mni-l"><div class="muted" title="coordonnées MNI305 des exports (électrodes, résultats), de la cohorte et des requêtes ; l’affichage 3D « gabarit » reste affine">vers MNI305 : ${meth}</div>${youth}
        <div class="btnrow"><button class="mini-btn mni-go" title="spline de plaque mince 3D régularisée sur les centres des structures segmentées, λ choisi par validation croisée « un exclu » ; gardée seulement si elle prédit mieux que l’affine">${M0 && M0.method !== 'affine' ? 'Recalculer la transformation non linéaire' : 'Transformation non linéaire vers MNI305'}</button><button class="mini-btn mni-age" title="gabarits d’enfants (p. ex. NIHPD) installés dans la bibliothèque : patient → gabarit de l’âge → MNI305">Gabarits adaptés à l’âge${ageT ? ' (' + esc(ageT.name) + ')' : ''}…</button></div>
        ${rc.ok + rc.missing + rc.stale ? `<div class="muted small">régions des plots figées : ${rc.ok} électrode${rc.ok > 1 ? 's' : ''}${rc.missing ? ` · ${rc.missing} à étiqueter` : ''}${rc.stale ? ` · ${rc.stale} étiquetée${rc.stale > 1 ? 's' : ''} avec une anatomie antérieure` : ''}${rc.missing || rc.stale ? ' <button class="mini-btn mni-lab">Réétiqueter les plots</button>' : ''}</div>` : ''}</div>`;
    },
    mniBind(box) {
      const q = s => box.querySelector(s);
      if (q('.mni-go')) q('.mni-go').onclick = () => this.mniCompute();
      if (q('.mni-age')) q('.mni-age').onclick = () => this.ageTemplatesDialog();
      if (q('.mni-lab')) q('.mni-lab').onclick = () => { let n = 0; for (const ex of this.dossier.explorations) n += this.stampRegions(ex, { stale: true }); this.touch(); this.toast(`Régions VEP figées pour ${n} électrode${n > 1 ? 's' : ''} (anatomie du ${fmtD(this.dossier.anatomy.date)})`, 4000); this.renderImaging && this.renderImaging(); };
    },
    /** repères du patient (centres des classes de la segmentation, monde du T1) ; calculés depuis la segmentation enregistrée s'ils manquent */
    mniLandmarks() {
      const an = this.dossier.anatomy, A = this.patientAnat; if (an.landmarks) return an.landmarks;
      if (!A || !A.segVol) return null; an.landmarks = SV.Anat.roundLm(SV.Anat.centroids(A.segVol.data, A.segVol.dims, A.segVol.affine, 50)); return an.landmarks;
    },
    async mniCompute(o) {
      o = o || {}; const d = this.dossier, an = d && d.anatomy; if (!an || an.status !== 'done') return null;
      try {
        const lm = this.mniLandmarks(), tpl = this.anatAsset && this.anatAsset('template_anat'); if (!lm || !tpl) throw new Error('segmentation du patient ou repères du gabarit indisponibles');
        const direct = SV.Warp.estimate(lm, tpl.centroids), pack = o.direct ? null : this.ageTemplateFor();
        let R = Object.assign({}, direct, { target: 'MNI305', template: null, date: S.now() });
        if (pack) {
          const toPack = SV.Warp.estimate(lm, pack.landmarks), steps = toPack.steps.concat(pack.toMNI.steps);
          R = Object.assign({}, toPack, { steps, method: 'chain', target: 'MNI305', template: { id: pack.id, name: pack.name, ageMin: pack.ageMin, ageMax: pack.ageMax, toMNI: pack.toMNI.method }, direct: { method: direct.method, loo: direct.loo }, date: S.now(),
            why: `patient → « ${pack.name} » : ${toPack.why} ; « ${pack.name} » → MNI305 : ${pack.toMNI.method === 'affine' ? 'affine' : 'non linéaire'}` });
        }
        delete R.grid; an.mni = R; S.log(d, 'compute', 'dossier', d.id, 'transformation vers MNI305 : ' + (R.method === 'chain' ? 'chaîne par gabarit de l’âge' : R.method === 'tps' ? 'non linéaire' : 'affine'));
        this.touch(); if (!o.quiet) { this.toast(R.method === 'affine' ? 'Affine gardée : ' + R.why : 'Transformation vers MNI305 enregistrée — ' + R.why, 7000); this.renderImaging && this.renderImaging(); }
        return R;
      } catch (e) { console.warn('MNI', e); if (!o.quiet) this.toast('Transformation non linéaire impossible : ' + (e.message || e), 6000); return null; }
    },

    // ============================================================ gabarits adaptés à l'âge (réglages de la bibliothèque)
    /** gabarit installé couvrant l'âge du patient au T1 (null : MNI305 directement) */
    ageTemplateFor() {
      const d = this.dossier, an = d && d.anatomy, age = an && an.segmentation ? an.segmentation.age : null, list = (this._libTemplates || []).filter(t => !t.off);
      return age == null ? null : list.find(t => age >= t.ageMin && age < t.ageMax) || null;
    },
    async loadAgeTemplates() { const st = await L.settings(); this._libTemplates = (st && st.templates) || []; return this._libTemplates; },
    async ageTemplatesDialog() {
      const d = this.dossier, an = d.anatomy, list = await this.loadAgeTemplates(), m = document.createElement('div'); m.className = 'modal';
      const canMake = an && an.status === 'done' && an.mni && an.mni.target === 'MNI305' && !an.mni.template;
      m.innerHTML = `<div class="modal-card" style="max-width:640px"><div class="modal-head"><b>Gabarits adaptés à l’âge</b><span class="spacer"></span><button class="close">✕</button></div><div class="prov-body">
        <div class="hint">Chez l’enfant, la transformation peut passer par un gabarit de son âge : patient → gabarit de l’âge (mêmes repères anatomiques), puis gabarit → MNI305. Les coordonnées restent exprimées en MNI305, commun à la cohorte. Un gabarit se crée ici à partir d’un dossier dont le « T1 » est l’image du gabarit (p. ex. NIHPD 4,5–8,5 ans, Fonov et al. 2011, licence de diffusion libre), une fois son anatomie et sa transformation vers MNI305 calculées : il est rangé dans les réglages de la bibliothèque, partagé par tous ses dossiers.</div>
        <table class="mini-tab"><tr><th>gabarit</th><th>âges</th><th>repères</th><th>vers MNI305</th><th></th></tr>${list.map((t, i) => `<tr class="${t.off ? 'muted' : ''}"><td>${esc(t.name)}</td><td>${t.ageMin}–${t.ageMax} ans</td><td>${Object.keys(t.landmarks || {}).length}</td><td>${t.toMNI.method === 'affine' ? 'affine' : 'non linéaire'} (${String((t.toMNI.loo || {})[t.toMNI.method === 'affine' ? 'affine' : 'tps'] || '—').replace('.', ',')} mm)</td><td><button class="mini-btn at-off" data-i="${i}">${t.off ? 'réactiver' : 'désactiver'}</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">aucun gabarit installé : MNI305 directement</td></tr>'}</table>
        ${canMake ? `<div class="form grid2" style="margin-top:10px"><label class="span2">Créer un gabarit à partir de ce dossier — nom <input class="at-n" placeholder="ex. NIHPD 4,5–8,5 ans"></label><label>Âge minimal (ans) <input class="at-a" type="number" step="0.5" min="0"></label><label>Âge maximal (ans) <input class="at-b" type="number" step="0.5" min="0"></label><label class="span2">Source et licence <input class="at-s" placeholder="ex. NIHPD asymétrique, Fonov et al., NeuroImage 2011"></label></div><div class="btnrow"><button class="primary at-make">Créer le gabarit</button></div>` : `<div class="muted small" style="margin-top:8px">Pour créer un gabarit : dossier dont le T1 est l’image du gabarit, anatomie calculée, puis « Transformation non linéaire vers MNI305 » (sans gabarit d’âge).</div>`}
        <div class="btnrow"><span class="spacer"></span>${an && an.mni ? '<button class="mini-btn at-redo">Recalculer la transformation de ce dossier</button>' : ''}<button class="at-close">Fermer</button></div></div></div>`;
      document.body.appendChild(m); const q = s => m.querySelector(s), close = () => m.remove(); q('.close').onclick = close; q('.at-close').onclick = close;
      const save = async L2 => { const st = (await L.settings()) || {}; st.templates = L2; await L.saveSettings(st); this._libTemplates = L2; };
      m.querySelectorAll('.at-off').forEach(b => b.onclick = async () => { const L2 = list.slice(), t = L2[+b.dataset.i]; t.off = !t.off; await save(L2); close(); this.ageTemplatesDialog(); });
      if (q('.at-redo')) q('.at-redo').onclick = async () => { close(); await this.mniCompute(); };
      if (q('.at-make')) q('.at-make').onclick = async () => {
        const name = q('.at-n').value.trim(), a = +q('.at-a').value, b = +q('.at-b').value; if (!name || !(b > a) || a < 0) { this.toast('Nom et tranche d’âge (minimum < maximum) à renseigner', 4000); return; }
        const t = { id: 'tpl-' + Date.now().toString(36), name, ageMin: a, ageMax: b, source: q('.at-s').value.trim(), created: S.now(), landmarks: an.landmarks, toMNI: { method: an.mni.method, steps: an.mni.steps, loo: an.mni.loo, n: an.mni.n } };
        await save(list.concat(t)); S.log(d, 'compute', 'dossier', d.id, 'gabarit adapté à l’âge créé : ' + name); this.toast(`Gabarit « ${name} » installé dans la bibliothèque (${a}–${b} ans)`, 5000); close();
      };
    },
  };
  Object.assign(SV.app, M);
})(window.SV = window.SV || {});
