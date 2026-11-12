/* EpiScope — seeg_flow.js : la SEEG, étape par étape.
 *   Planification  : hypothèses à tester (couverture du schéma), proposition à partir des hypothèses du staff et des
 *                    crises, import de la planification chirurgicale (ROSA .ros, CSV/TSV, BIDS electrodes.tsv) —
 *                    repère de coordonnées choisi automatiquement (trajectoires dans le cerveau du patient), modifiable ;
 *   Localisation   : scanner post-implantation (recalage), reconstruction (détection, saisie Brainstorm), nommage
 *                    d'après le schéma (trouvées, manquantes, en plus), vérification électrode par électrode sur le
 *                    scanner (coupes dans l'axe, plots reconstruits cerclés, trajectoire prévue en pointillé) ;
 *   Intercritique  : rythme de fond, activités physiologiques, foyer lent, grapho-éléments ; activité par électrode ;
 *   Crises         : contacts de début et de propagation par crise (analyse visuelle), aspect électrique ;
 *   Stimulations / Thermocoagulations : la coupe de l'électrode courante suit la paire choisie ;
 *   Rapport SEEG   : synthèse (zones lésionnelle, irritative, d'initiation, épileptogène, fonctionnelle), proposition,
 *                    compte rendu imprimable dans l'ordre du compte rendu de monitoring vidéo-SEEG.              */
(function (SV) {
  'use strict';
  const $ = id => document.getElementById(id), S = SV.Store, V = S.V, M4 = SV.Mat4, Q = SV.Seeg;
  const esc = SV.U.esc;
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const opts = (map, v) => Object.entries(map).map(([k, l]) => `<option value="${esc(k)}"${String(v) === k ? ' selected' : ''}>${esc(l)}</option>`).join('');
  const fmtDate = s => { if (!s) return ''; const d = new Date(String(s).length <= 10 ? s + 'T12:00:00' : s); return isNaN(d) ? String(s) : d.toLocaleDateString(SV.LOC); };
  const D = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], unit = a => { const n = Math.hypot(...a) || 1; return a.map(x => x / n); };
  const MODEL_N = [5, 8, 10, 12, 15, 18];
  const normName = s => String(s || '').trim().replace(/['’‘´`]/g, '’').replace(/\s+/g, '').toUpperCase();
  /** SEEG, intercritique : phrases types (« … » = à compléter, sélectionné après insertion) */
  const IN_PH = {
    wake: ['Rythme de fond bien organisé et réactif.', 'Activité de fond normale sur l’ensemble des électrodes, sans asymétrie.', 'Rythme alpha postérieur recueilli sur les plots occipitaux (…), réactif à l’ouverture des yeux.', 'Rythme rolandique (mu, bêta) sur les plots du cortex sensori-moteur (…).', 'Ralentissement de l’activité de fond sur …', 'Activité de fond appauvrie (plots en substance blanche) sur …'],
    sleep: ['Organisation normale du sommeil lent : fuseaux et complexes K sur les plots …', 'Activation nette des anomalies intercritiques au sommeil lent.', 'Pas de modification notable des anomalies au sommeil.', 'Sommeil paradoxal enregistré, avec raréfaction des anomalies.', 'Extension des anomalies au sommeil vers …'],
    physiological: ['Pas d’activité physiologique particulière.', 'Rythme mu réactif à la mobilisation sur …', 'Rythme alpha occipital réactif à l’ouverture des yeux.', 'Activité thêta hippocampique physiologique.', 'Réponses évoquées / réactivité lors des tâches (langage, motricité) sur …'],
    slow: ['Pas de foyer lent.', 'Ralentissement delta polymorphe continu sur … (V, S).', 'Ondes lentes thêta intermittentes sur …', 'Activité delta rythmique intermittente sur …', 'Ralentissement post-critique transitoire sur …'],
    other: ['Activité évocatrice de dysplasie : pointes rythmiques quasi continues et bouffées d’activité rapide (« brushes ») sur …', 'Oscillations rapides intercritiques (HFO) sur …', 'DC-shifts intercritiques sur …', 'Plots peu informatifs (substance blanche, LCR) : …', 'Artefacts de mouvement ou de stimulation sur …', 'Pas d’autre anomalie.'],
    spike: ['pointes isolées', 'pointes-ondes', 'polypointes', 'pointes rythmiques en salves', 'pointes et activité rapide (aspect dysplasique)', 'décharges pseudo-rythmiques brèves', 'activité rapide intercritique', 'ondes lentes', 'pointes diffusant à …'],
    act: ['rythme de fond normal', 'pointes fréquentes', 'pointes rares', 'pointes-ondes en salves', 'activité rapide intercritique', 'ralentissement thêta-delta', 'plots en substance blanche, peu informatifs', 'plots silencieux', 'participation précoce aux crises'],
  };
  const ROLE_COL = { onset: '#ff4d5e', early: '#ff9f43', late: '#ffd23f' };

  // ---------------------------------------------------------------- lecture des fichiers de planification
  /** ROSA (.ros) : sections [TRAJECTORY] / [ELLIPS] ; ligne « nom … x y z … x y z longueur diamètre » (format non publié,
   *  d'après neurotechcenter/ROSATrajectoryExtraction) ; coordonnées dans l'espace d'affichage de ROSA (LPS) */
  function parseRos(text) {
    const out = { kind: 'ROSA', trajectories: [], volumes: [] }, parts = text.split(/\[([^\]\r\n]{1,40})\]/);
    for (let i = 1; i < parts.length; i += 2) {
      const tok = parts[i].trim(), body = parts[i + 1] || '';
      if (tok === 'TRAJECTORY' || tok === 'ELLIPS') {
        for (const ln of body.split(/\r?\n/).map(s => s.trim()).filter(Boolean)) {
          const t = ln.split(/\s+/); if (t.length < 11 || !isNaN(+t[0])) continue; const n = t.slice(1).map(Number);
          const a = [n[3], n[4], n[5]], b = [n[7], n[8], n[9]]; if (a.concat(b).some(v => !isFinite(v))) continue;
          out.trajectories.push({ name: t[0], a, b });
        }
      } else if (tok === 'VOLUME') { const v = body.trim().split(/\r?\n/)[0]; if (v) out.volumes.push(v.trim()); }
    }
    return out;
  }
  /** CSV / TSV : nom + entrée (x, y, z) + cible (x, y, z), en-têtes reconnus ; ou plots (BIDS electrodes.tsv : nom, x, y, z) */
  function parseTable(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim()); if (!lines.length) return { kind: 'CSV', trajectories: [] };
    const sep = (lines[0].match(/\t/g) || []).length ? '\t' : (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
    const rows = lines.map(l => l.split(sep).map(c => c.trim().replace(/^"|"$/g, '')));
    const num = v => { const x = +String(v).replace(',', '.'); return isFinite(x) ? x : NaN; };
    const head = rows[0].some(c => /[a-z]/i.test(c) && isNaN(num(c))) && rows.length > 1 && rows[1].some(c => isFinite(num(c))) ? rows[0].map(c => c.toLowerCase()) : null;
    const body = head ? rows.slice(1) : rows, find = re => head ? head.findIndex(c => re.test(c)) : -1;
    const iName = head ? Math.max(0, find(/^(name|nom|label|electrode|électrode|traj|contact)/)) : 0;
    const axis = (kw, ax) => find(new RegExp(`(${kw}).*[_\\s-]?${ax}$|^${ax}[_\\s-]?(${kw})`));
    const E = ['x', 'y', 'z'].map(ax => axis('entry|entr|start|ep|ext', ax)), T = ['x', 'y', 'z'].map(ax => axis('target|cible|tip|end|tp|pointe', ax));
    const out = { kind: 'CSV', trajectories: [] };
    if (E.every(i => i >= 0) && T.every(i => i >= 0)) { for (const r of body) { const a = E.map(i => num(r[i])), b = T.map(i => num(r[i])); if (a.concat(b).every(isFinite)) out.trajectories.push({ name: r[iName], a, b }); } return out; }
    const X = head ? [find(/^x$/), find(/^y$/), find(/^z$/)] : [-1, -1, -1];
    if (X.every(i => i >= 0)) {   // plots : regroupés par électrode (nom sans le numéro), pointe = plus petit numéro
      const g = new Map(); for (const r of body) { const nm = r[iName], m = String(nm).match(/^(.*?)(\d+)$/); if (!m) continue; const p = X.map(i => num(r[i])); if (!p.every(isFinite)) continue; const k = m[1].replace(/[-_\s]$/, ''); if (!g.has(k)) g.set(k, []); g.get(k).push({ k: +m[2], p }); }
      for (const [nm, L] of g) { L.sort((a, b) => a.k - b.k); if (L.length < 2) continue; out.trajectories.push({ name: nm, a: L[L.length - 1].p, b: L[0].p, contacts: L.map(x => x.p) }); }
      out.kind = 'plots'; return out;
    }
    for (const r of body) { const nums = r.map(num), i0 = isFinite(nums[0]) ? -1 : 0, v = nums.slice(i0 + 1).filter(isFinite); if (v.length >= 6) out.trajectories.push({ name: i0 === 0 ? r[0] : 'T' + (out.trajectories.length + 1), a: v.slice(0, 3), b: v.slice(3, 6) }); }
    return out;
  }

  const M = {
    // ================================================================ planification
    /** hypothèses à tester par la SEEG : celles de la décision du staff (dernière version), sinon celles encore ouvertes */
    planHyps(ex) {
      const d = this.dossier, lat = S.latestHypotheses(d), ids = ex.entryHypothesisIds || [];
      let H = lat.filter(x => ids.some(id => { const o = S.byId(d.hypotheses, id); return o && o.lineage === x.lineage; }));
      if (!H.length) H = lat.filter(x => ['proposed', 'testing', 'confirmed'].includes(x.status));
      return H.filter(x => x.ez.length);
    },
    /** pseudo-résultat pour « Proposer un schéma » en planification : hypothèses + crises des explorations précédentes */
    planResult() {
      const d = this.dossier, ex = this.ctx && S.byId(d.explorations, this.ctx.explorationId); if (!ex) return null;
      const hyps = this.planHyps(ex), szs = S.allSeizures(d).filter(z => z.events.length && S.contextOf(d, z.id).exploration.id !== ex.id).map(sz => ({ sz }));
      if (!hyps.length && !szs.length) return null; return this.hypResult(hyps, szs);
    },
    /** en-tête de l'onglet Schéma en planification : hypothèses testées et couverture, import de la planification */
    planHeader() {
      const d = this.dossier; if (!d || this.ui.wm !== 'plan' || !this.ctx) return null;
      const ex = S.byId(d.explorations, this.ctx.explorationId); if (!ex) return null;
      const hyps = this.planHyps(ex), cov = hyps.length ? this.hypCoverage(this.state.electrodes || [], hyps) : [], nPlan = (this.state.electrodes || []).filter(e => e.plan).length;
      const el = h('div', 'plan-head');
      el.innerHTML = `<div class="ph-row"><span class="lbl">À tester</span>${hyps.length ? cov.map((c, i) => `<span class="cov${c.ezMiss.length ? ' miss' : ' ok'}" title="${c.ezMiss.length ? 'ZE non échantillonnée : ' + esc(c.ezMiss.map(r => this.atlas.label(r)).join(', ')) : 'ZE échantillonnée'}"><b style="color:${SV.hypCss(i)}">H${i + 1}</b> ${esc(c.H.title)} · ZE ${c.ez.length}/${c.H.ez.length}</span>`).join('') : '<span class="muted small">aucune hypothèse du staff : « Proposer un schéma » part du modèle des crises</span>'}</div>
        <div class="ph-row"><button class="mini-btn primary" id="phImport" title="ROSA (.ros), CSV / TSV (nom, entrée x y z, cible x y z), BIDS electrodes.tsv">Importer la planification chirurgicale…</button><span class="muted small">${nPlan ? `${nPlan} électrode${nPlan > 1 ? 's' : ''} avec trajectoire chirurgicale` : 'trajectoires réelles décidées par les neurochirurgiens (ROSA, CSV)'}</span></div>`;
      el.querySelector('#phImport').onclick = () => this.planImportDialog(ex);
      return el;
    },

    // ---------------------------------------------------------------- import de la planification chirurgicale
    planImportDialog(ex) {
      const fi = h('input'); fi.type = 'file'; fi.accept = '.ros,.csv,.tsv,.txt'; fi.onchange = async () => { const f = fi.files[0]; if (!f) return; const txt = await f.text(); const P = /\.ros$/i.test(f.name) || /\[TRAJECTORY\]/.test(txt) ? parseRos(txt) : parseTable(txt); P.file = f.name; if (!P.trajectories.length) { this.toast('Aucune trajectoire lue dans ' + f.name, 5000); return; } this.planImportReview(ex, P); };
      fi.click();
    },
    /** repères candidats : RAS / LPS du T1, ou de chaque image recalée (ROSA : LPS centré sur l'image) ; score = cibles dans le cerveau, entrées en surface */
    async planCandidates(P) {
      const d = this.dossier, ref = S.refImaging(d), A = this.patientAnat, out = [];
      const lab = A && A.labelWorld ? p => A.labelWorld.labelAt(p[0], p[1], p[2]) : null, refVol = ref ? await this.imagingVolume(ref) : null;
      const inHead = p => { if (lab) return lab(p) > 0; if (!refVol) return false; const v = M4.apply(M4.inv(refVol.affine), p[0], p[1], p[2]); return v.every((x, k) => x >= 0 && x < refVol.dims[k]); };
      const add = (key, label, f) => { const T = P.trajectories.map(t => ({ a: f(t.a), b: f(t.b) })); let s = 0; for (const t of T) { const ia = inHead(t.a), ib = inHead(t.b); s += (ia !== ib ? 1 : 0) + (ib || ia ? 0.5 : 0); } out.push({ key, label, f, score: P.trajectories.length ? s / (1.5 * P.trajectories.length) : 0 }); };
      add('ras', 'RAS du T1 de référence (monde NIfTI)', p => p.slice());
      add('lps', 'LPS du T1 de référence (DICOM)', p => [-p[0], -p[1], p[2]]);
      for (const im of d.imaging) {
        const reg = im === ref || (im.coreg && im.coreg.T); if (!reg) continue;
        let vol; try { vol = await this.imagingVolume(im); } catch (e) { continue; }
        const T = im === ref ? M4.identity() : M4.from(im.coreg.T), c = M4.apply(vol.affine, (vol.dims[0] - 1) / 2, (vol.dims[1] - 1) / 2, (vol.dims[2] - 1) / 2), nm = `${V.modality[im.modality] || im.modality} ${fmtDate(im.date)}`;
        add('img:' + im.id + ':lpsc', `ROSA : LPS centré sur l’image ${nm}`, p => M4.apply(T, c[0] - p[0], c[1] - p[1], c[2] + p[2]));
        if (im !== ref) { add('img:' + im.id + ':ras', `RAS de l’image ${nm} (recalée)`, p => M4.apply(T, p[0], p[1], p[2])); add('img:' + im.id + ':lps', `LPS de l’image ${nm} (recalée)`, p => M4.apply(T, -p[0], -p[1], p[2])); }
      }
      return out.sort((a, b) => b.score - a.score);
    },
    async planImportReview(ex, P) {
      const d = this.dossier; if (!S.refImaging(d)) { this.toast('Importez d’abord le T1 du patient (Dossier › Imagerie) : les coordonnées sont rapportées à ses images', 5000); return; }
      const cands = await this.planCandidates(P); let cand = cands[0];
      const specs = this.state.electrodes || [], byName = new Map(specs.map(s => [normName(s.name), s]));
      const keepSpec = sp => !!sp.real || (this.state.stims || []).some(x => x.eid === sp.id) || (this.state.thermo || []).some(x => x.eid === sp.id);   // données rattachées : jamais retirée
      const m = h('div', 'modal'), card = h('div', 'modal-card wide plan-imp');
      const draw = () => {
        const T = P.trajectories.map(t => { let a = cand.f(t.a), b = cand.f(t.b); const A = this.patientAnat, cen = A && A.center ? A.center : null; if (cen && D(a, cen) < D(b, cen)) [a, b] = [b, a]; return { t, entry: a, tip: b, len: D(a, b), match: byName.get(normName(t.name)) }; });
        card.innerHTML = `<div class="modal-head"><span>Planification chirurgicale · ${esc(P.file)} (${esc(P.kind)}, ${P.trajectories.length} trajectoires)</span><button class="close">✕</button></div>
          <div class="help" style="padding:12px 16px">
            <label>Repère des coordonnées <select id="piConv">${cands.map(c => `<option value="${c.key}"${c === cand ? ' selected' : ''}>${esc(c.label)} — ${Math.round(c.score * 100)} %</option>`).join('')}</select></label>
            <div class="hint">Pourcentage : trajectoires dont la cible est dans le cerveau et l’entrée en surface${this.patientAnat ? '' : ' (anatomie du patient non calculée : contrôle sur l’étendue du T1 seulement)'}. Le format ROSA n’étant pas publié, vérifiez dans les coupes après l’import.</div>
            <table class="ce-table"><thead><tr><th>Trajectoire</th><th>Électrode du schéma</th><th>Longueur</th><th>Entrée (RAS)</th><th>Cible (RAS)</th></tr></thead><tbody>
              ${T.map((x, i) => `<tr><td><b>${esc(x.t.name)}</b></td><td><select data-i="${i}"><option value="">+ nouvelle électrode</option>${specs.map(s => `<option value="${s.id}"${x.match === s ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}<option value="-">ignorer</option></select></td><td class="mono">${x.len.toFixed(0)} mm</td><td class="mono small">${x.entry.map(v => v.toFixed(1)).join(', ')}</td><td class="mono small">${x.tip.map(v => v.toFixed(1)).join(', ')}</td></tr>`).join('')}</tbody></table>
            <div class="hint">${T.filter(x => x.match).length} trajectoire(s) appariée(s) au schéma par le nom ; les électrodes appariées gardent leur identifiant (stimulations, thermocoagulations suivent) et prennent la trajectoire chirurgicale.</div>
            ${(() => { const used = new Set(T.map(x => x.match && x.match.id).filter(Boolean)), absent = specs.filter(sp => !used.has(sp.id) && !keepSpec(sp)); return absent.length ? `<label class="chip" style="margin-top:8px"><input type="checkbox" id="piPrune" checked> la planification chirurgicale fait foi : retirer du schéma ${absent.length} électrode${absent.length > 1 ? 's' : ''} prévue${absent.length > 1 ? 's' : ''} qui n’y figure${absent.length > 1 ? 'nt' : ''} pas (${esc(absent.map(sp => sp.name).join(', '))})</label>` : ''; })()}
          </div><div class="modal-foot"><button class="primary ok">Appliquer au schéma</button><button class="cancel">Annuler</button></div>`;
        card.querySelector('.close').onclick = card.querySelector('.cancel').onclick = () => m.remove();
        card.querySelector('#piConv').onchange = e => { cand = cands.find(c => c.key === e.target.value); draw(); };
        card.querySelector('.modal-foot .ok').onclick = () => {
          const A = this.patientAnat, prune = card.querySelector('#piPrune') && card.querySelector('#piPrune').checked, used = new Set(); let nNew = 0, nUp = 0, nDel = 0;
          card.querySelectorAll('select[data-i]').forEach(sel => {
            const x = T[+sel.dataset.i]; if (sel.value === '-') return;
            const n = (x.t.contacts && x.t.contacts.length) || MODEL_N.find(k => 1 + (k - 1) * 3.5 >= x.len - 3) || 18;
            const plan = { tip: x.tip.map(v => +v.toFixed(2)), entry: x.entry.map(v => +v.toFixed(2)), n, source: P.kind, file: P.file, convention: cand.key, date: S.now() };
            let spec = sel.value ? specs.find(s => s.id === sel.value) : null;
            if (!spec) { const nm = String(x.t.name).replace(/'/g, '’'); spec = { id: S.uid('el'), code: nm.replace(/’/g, ''), name: nm, hemi: this.elecSideOf({ tip: x.tip, entry: x.entry }), auto: false, maker: 'DIXI', origin: { kind: 'plan', label: 'planification ' + P.kind } }; specs.push(spec); nNew++; } else nUp++;
            spec.plan = plan; used.add(spec.id);
          });
          if (prune) { const before = specs.length; for (let i = specs.length - 1; i >= 0; i--) if (!used.has(specs[i].id) && !keepSpec(specs[i])) specs.splice(i, 1); nDel = before - specs.length; }
          m.remove(); this.state.electrodes = specs; const ex2 = S.byId(d.explorations, this.ctx.explorationId); if (ex2) ex2.implant = Object.assign({}, ex2.implant, { plan: { file: P.file, kind: P.kind, convention: cand.key, date: S.now() } });
          this.rebuildElectrodes(); S.log(d, 'edit', 'exploration', ex.id, `planification chirurgicale importée (${P.file}) : ${nUp} électrodes mises à jour, ${nNew} ajoutées${nDel ? ', ' + nDel + ' retirées' : ''}`); this.touch();
          this.toast(`Planification importée : ${nUp} trajectoire(s) appliquée(s) au schéma, ${nNew} électrode(s) ajoutée(s)${nDel ? `, ${nDel} retirée(s)` : ''}${this.patientAnat ? '' : ' — calculez l’anatomie du patient pour les voir en 3D'}`, 6000);
        };
      };
      draw(); m.appendChild(card); document.body.appendChild(m); m.hidden = false;
    },

    // ================================================================ localisation
    renderLocalisationView(box, st) {
      const d = this.dossier, ex = st.obj, ref = S.refImaging(d), cts = d.imaging.filter(x => x.modality === 'CT');
      const W = this.ui.ce = Object.assign(this.ui.ce || {}, { exId: ex.id }); if (!W.ctId || !cts.some(c => c.id === W.ctId)) W.ctId = (cts.find(c => c.timepoint === 'postimplant') || cts[0] || {}).id || null;
      const ct = W.ctId && S.byId(d.imaging, W.ctId), reg = ct && ct.coreg && ct.coreg.T;
      this.slvState();   // réglages des coupes de la localisation de cette SEEG (scanner en base par défaut)
      box.innerHTML = `<div class="scr-inner wide loc"><div class="view-head"><h3>Localisation des électrodes · ${esc(ex.label)}</h3><span class="muted">scanner post-implantation → électrodes réelles, nommées d’après le schéma, vérifiées une à une</span></div>
        <div class="loc-grid"><div class="loc-col">
          <div class="card"><div class="card-h"><span class="stepn">1</span>Scanner post-implantation</div><div id="locCT"></div></div>
          <div class="card"><div class="card-h"><span class="stepn">2</span>Reconstruction et vérification</div><div id="locMatch"></div><div id="imElec"></div></div>
        </div><div class="card loc-main"><div class="loc-sl" id="locPanel"></div><div class="loc-3d" id="loc3d" hidden></div></div></div></div>`;
      const cb = $('locCT');
      if (!ref) cb.innerHTML = '<div class="hint">Importez d’abord le T1 de référence du patient (Dossier › Imagerie).</div>';
      else if (!cts.length) {
        // une image déjà importée (Dossier › Imagerie) peut être le scanner : on propose de l'utiliser plutôt que de réimporter
        const cand = d.imaging.filter(x => x !== ref && !['T1', 'T1c', 'T2', 'FLAIR', 'PET', 'SPECT'].includes(x.modality));
        cb.innerHTML = `<div class="hint">Importez le scanner post-implantation (NIfTI ou DICOM) : il est rangé dans le dossier (Imagerie), recalé sur le T1 de référence, puis les électrodes sont détectées.</div>
          ${cand.length ? `<div class="note">Image${cand.length > 1 ? 's' : ''} déjà dans le dossier : ${cand.map(x => `<span class="loc-cand"><b>${esc(V.modality[x.modality] || x.modality)}</b> ${fmtDate(x.date)} · ${esc(x.label || '')} <button class="mini-btn" data-useas="${x.id}">c’est le scanner</button></span>`).join(' ')}</div>` : ''}
          <div class="btnrow"><button class="primary" id="locAddCT" title="NIfTI, fichiers DICOM ou dossier DICOM (aussi : glisser-déposer)">Importer le scanner et le recaler ▾</button></div>`;
        $('locAddCT').onclick = e => this.locPickCT(e.currentTarget);
        cb.querySelectorAll('[data-useas]').forEach(b => b.onclick = () => this.locUseAsCT(S.byId(d.imaging, b.dataset.useas)));
      }
      else {
        cb.innerHTML = `<div class="form"><label>Scanner <select id="locCTsel">${cts.map(c => `<option value="${c.id}"${c === ct ? ' selected' : ''}>${esc(V.timepoint[c.timepoint] || '')} ${fmtDate(c.date)} · ${esc(c.label || '')}</option>`).join('')}</select></label></div>
          <div class="row-line">${reg ? `<span class="badge ok">recalé sur le T1</span> <span class="muted small">${esc(ct.coreg.text || '')}</span>` : `<span class="badge warn">à recaler</span> <span class="muted small">scanner importé dans Dossier › Imagerie, pas encore recalé : « recaler sur le T1 »</span>`}</div>
          <div class="btnrow"><button class="mini-btn${reg ? '' : ' primary'}" id="locReg">${reg ? 'recaler à nouveau' : 'recaler sur le T1'}</button>${reg ? '<button class="mini-btn" id="locNudge">ajuster</button>' : ''}<button class="mini-btn" id="locAddCT2">+ autre scanner…</button></div>`;
        $('locCTsel').onchange = e => { W.ctId = e.target.value; this.slvReset(); this.renderLocalisationView(box, st); };
        $('locReg').onclick = async () => { await this.coregImage(ct, true); this.slvReset(); this.renderLocalisationView(box, this.stageByKey(st.key)); };
        if ($('locNudge')) $('locNudge').onclick = () => this.nudgeCoreg(ct);
        $('locAddCT2').onclick = e => this.locPickCT(e.currentTarget);
      }
      if (ct) this.renderElectrodeCard($('imElec')); else $('imElec').innerHTML = '<div class="hint">—</div>';
      this.renderLocMatch(ex);
      if (this.mountImagingPanel) this.mountImagingPanel($('locPanel'));
      if (this.loc3dMount) this.loc3dMount();
    },
    /** électrodes de la localisation : détectées (avant validation), sinon réelles validées */
    locItems(ex) { return this.locRows(ex).map(r => Object.assign({}, r, { checked: r.status === 'ok' })); },
    renderLocMatch(ex) {
      const box = $('locMatch'); if (!box) return;
      const items = this.locItems(ex), plan = ex.electrodes.filter(e => e.target || e.plan || e.real), names = new Set(items.map(x => normName(x.name)));
      if (!items.length) { box.innerHTML = `<div class="hint">${plan.length ? `Schéma : ${plan.length} électrodes (${esc(plan.map(e => e.name).join(' '))}). Après la reconstruction, elles sont retrouvées ici par leur nom.` : 'Pas de schéma d’implantation : les électrodes reconstruites seront nommées E1, E2…'}</div>`; return; }
      const cnt = new Map(); for (const x of items) cnt.set(normName(x.name), (cnt.get(normName(x.name)) || 0) + 1); const dups = [...cnt].filter(([, n]) => n > 1).map(([k]) => items.find(x => normName(x.name) === k).name);
      const found = plan.filter(e => names.has(normName(e.name))), missing = plan.filter(e => !names.has(normName(e.name))), pn = new Set(plan.map(e => normName(e.name))), extra = items.filter(x => !pn.has(normName(x.name)));
      box.innerHTML = `<div class="match-sum"><span class="badge ok">${found.length}/${plan.length} retrouvées</span>${missing.length ? ` <span class="badge warn">${missing.length} manquante${missing.length > 1 ? 's' : ''}</span>` : ''}${extra.length ? ` <span class="badge">${extra.length} hors schéma</span>` : ''}${dups.length ? ` <span class="badge warn" title="deux reconstructions portent le même nom : renommez, ou retirez celle qui est en trop (✕)">doublon : ${esc(dups.join(', '))}</span>` : ''}</div>
        ${missing.length ? `<div class="small">Du schéma, non retrouvées : ${missing.map(e => `<span class="rchip miss">${esc(e.name)}</span>`).join('')} <span class="muted">— électrode non posée, non détectée (saisie « + à la main »), ou nom à corriger</span></div>` : ''}
        ${extra.length ? `<div class="small">Reconstruites hors schéma : ${extra.map(x => `<span class="rchip">${esc(x.name)}</span>`).join('')} <span class="muted">— renommez-les (liste du tableau) si elles correspondent à une électrode prévue</span></div>` : ''}
        ${!missing.length && !extra.length && !dups.length ? '<div class="small muted">Toutes les électrodes du schéma ont une reconstruction, et inversement.</div>' : ''}`;
    },
    /** rafraîchit l'écran courant après un calcul (Imagerie, Localisation) */
    refreshImagingScreen() { if (this.ui.screen === 'imaging') this.renderImaging(); else if (this.ui.screen === 'loc') { const st = this.currentStage(); if (st) this.renderLocalisationView($('scr-view'), this.stageByKey(st.key)); } },

    // ================================================================ intercritique
    /** menu de phrases types : insertion au curseur (ou à la fin), « … » sélectionné pour être complété */
    phraseMenu(btn, field, list, save, sep0) {
      if (!field || !list) return; const r = btn.getBoundingClientRect();
      this.popupMenu([{ head: 'Insérer' }].concat(list.map(p => ({ label: p, run: () => {
        const pos = field.selectionStart != null && document.activeElement === field ? field.selectionStart : field.value.length, pre = field.value.slice(0, pos), post = field.value.slice(pos);
        const sep = !pre.trim() ? '' : sep0 && !/[,.;:]\s*$/.test(pre) ? sep0 : /\s$/.test(pre) ? '' : ' ';
        field.value = pre + sep + p + post; if (save) save(field.value); field.focus(); const i = (pre + sep + p).lastIndexOf('…'); if (i >= pre.length) field.setSelectionRange(i, i + 1);
      } }))), Math.min(r.left, window.innerWidth - 460), r.bottom + 4);
    },
    renderInterictalView(box, st) {
      const d = this.dossier, ex = st.obj, I = ex.inter || (ex.inter = { spikes: [] }); I.spikes = I.spikes || []; ex.elecNotes = ex.elecNotes || {};
      const els = this.planElectrodes ? this.planElectrodes(ex.electrodes) : [];
      box.innerHTML = `<div class="scr-inner wide"><div class="view-head"><h3>EEG intercritique · ${esc(ex.label)}</h3><span class="muted">repris dans le rapport SEEG (V = veille, S = sommeil)</span></div>
        <div class="hx-grid"><div class="card form"><div class="card-h">Tracé de fond</div>
          <label>Acquisition <input data-f="sampling" value="${esc(I.sampling)}" placeholder="ex. 512 Hz, bande observable 0–200 Hz"></label>
          <label><span class="srl">Rythme de fond à la veille<span class="spacer"></span><button class="mini-btn" data-ph="wake" title="phrases types à insérer">phrases ▾</button></span><textarea data-f="wake" rows="2" placeholder="différenciation antéro-postérieure, rythme alpha (plots), réactivité…">${esc(I.wake)}</textarea></label>
          <label><span class="srl">Au sommeil<span class="spacer"></span><button class="mini-btn" data-ph="sleep" title="phrases types à insérer">phrases ▾</button></span><textarea data-f="sleep" rows="2" placeholder="fuseaux, complexes K, sur quels plots">${esc(I.sleep)}</textarea></label>
          <label><span class="srl">Activités physiologiques<span class="spacer"></span><button class="mini-btn" data-ph="physiological" title="phrases types à insérer">phrases ▾</button></span><textarea data-f="physiological" rows="2" placeholder="cortex moteur, langage, réactivités">${esc(I.physiological)}</textarea></label>
          <label><span class="srl">Foyer lent<span class="spacer"></span><button class="mini-btn" data-ph="slow" title="phrases types à insérer">phrases ▾</button></span><textarea data-f="slow" rows="2" placeholder="ralentissement thêta / delta : plots, V / S">${esc(I.slow)}</textarea></label>
          <label><span class="srl">Autres<span class="spacer"></span><button class="mini-btn" data-ph="other" title="phrases types à insérer">phrases ▾</button></span><textarea data-f="other" rows="2" placeholder="activité évocatrice de dysplasie (brushes), DC-shifts…">${esc(I.other)}</textarea></label></div>
          <div class="card"><div class="card-h">Grapho-éléments pathologiques <span class="spacer"></span><button class="mini-btn" id="inAdd">+ ligne</button></div><table class="aed spk" id="inSpk"></table><div class="hint">Une ligne par type d’activité : plots (ex. A’1-3, B’1-2), description, veille / sommeil. La zone irritative du rapport en est tirée.</div>
            <div class="sub-h">Tracés intercritiques <small class="muted">ordre chronologique : veille / sommeil, début / fin d’exploration (sevrage)</small></div><div id="inRecs"></div>
            <div class="sub-h">Captures intercritiques</div><div id="inGal"></div></div></div>
        <div class="card"><div class="card-h">Implantation et activité par électrode <span class="muted">localisation des plots (anatomie ${this.patientAnat ? 'du patient' : 'du gabarit'}) et activité recueillie</span></div><table class="enotes"><thead><tr><th>Électrode</th><th>Localisation des plots</th><th>Activité recueillie</th></tr></thead><tbody>
          ${els.length ? els.map(e => `<tr data-n="${esc(e.name)}"><td><b>${esc(e.name)}</b><div class="muted small">${e.nContacts} plots${e.real ? ' · réelle' : ' · prévue'}</div></td><td><textarea rows="2" data-k="loc" placeholder="${esc(SV.Electrodes.contactSummary(e, this.atlas))}">${esc((ex.elecNotes[e.name] || {}).loc || '')}</textarea></td><td class="inph"><textarea rows="2" data-k="act" placeholder="rythme, pointes, plots plats…">${esc((ex.elecNotes[e.name] || {}).act || '')}</textarea><button class="mini-btn" data-aph="1" title="termes types">▾</button></td></tr>`).join('') : '<tr><td colspan="3" class="hint">Aucune électrode : Planification ou Localisation.</td></tr>'}</tbody></table>
          <div class="hint">Laissez « Localisation » vide pour reprendre le texte proposé (grisé) d’après la parcellation VEP.</div></div></div>`;
      this.bindFields(box.querySelector('.card.form'), I, 'exploration');
      const draw = () => {
        const t = $('inSpk'); t.innerHTML = I.spikes.length ? `<thead><tr><th>plots</th><th>description</th><th>V/S</th><th></th></tr></thead><tbody>${I.spikes.map((s, i) => `<tr data-i="${i}"><td><input data-k="contacts" value="${esc(s.contacts)}" placeholder="A’3-5, B’1-2"></td><td class="inph"><input data-k="text" value="${esc(s.text)}" placeholder="pointes-ondes en salves…"><button class="mini-btn" data-sph="${i}" title="termes types">▾</button></td><td><select data-k="vig">${opts({ '': '—', V: 'V', S: 'S', VS: 'V, S' }, s.vig)}</select></td><td><b class="x" data-rm="${i}">✕</b></td></tr>`).join('')}</tbody>` : '<tr><td class="hint">—</td></tr>';
        t.querySelectorAll('tr[data-i]').forEach(tr => { const s = I.spikes[+tr.dataset.i]; tr.querySelectorAll('[data-k]').forEach(el => el.oninput = el.onchange = () => { s[el.dataset.k] = el.value; this.touch('exploration', ex.id, 'intercritique'); }); });
        t.querySelectorAll('[data-rm]').forEach(x => x.onclick = () => { I.spikes.splice(+x.dataset.rm, 1); this.touch(); draw(); });
        t.querySelectorAll('[data-sph]').forEach(b => b.onclick = ev => { ev.preventDefault(); const inp = b.previousElementSibling; this.phraseMenu(b, inp, IN_PH.spike, v => { I.spikes[+b.dataset.sph].text = v; this.touch('exploration', ex.id, 'intercritique'); }, ', '); });
      };
      $('inAdd').onclick = () => { I.spikes.push({ contacts: '', text: '', vig: 'VS' }); this.touch(); draw(); };
      draw();
      box.querySelectorAll('table.enotes tr[data-n]').forEach(tr => tr.querySelectorAll('textarea').forEach(ta => ta.oninput = () => { const n = tr.dataset.n; ex.elecNotes[n] = ex.elecNotes[n] || {}; ex.elecNotes[n][ta.dataset.k] = ta.value; this.touch('exploration', ex.id, 'électrode ' + n); }));
      box.querySelectorAll('[data-aph]').forEach(b => b.onclick = ev => { ev.preventDefault(); const ta = b.previousElementSibling; this.phraseMenu(b, ta, IN_PH.act, () => ta.oninput(), ', '); });
      box.querySelectorAll('.card.form [data-ph]').forEach(b => b.onclick = ev => { ev.preventDefault(); const k = b.dataset.ph, ta = box.querySelector(`.card.form textarea[data-f="${k}"]`); this.phraseMenu(b, ta, IN_PH[k], v => { I[k] = v; this.touch('exploration', ex.id, 'intercritique'); }); });
      if (this.renderGallery) this.renderGallery($('inGal'), { explorationId: ex.id, compact: true, kind: 'interictal', filter: g => g.kind === 'interictal' || g.kind === 'sleep' });
      // v5.1 : tracés intercritiques datés (plusieurs possibles : veille, sommeil, début / fin d'exploration selon le sevrage)
      const VIG = { wake: 'veille', nrem: 'sommeil lent', rem: 'sommeil paradoxal', mixed: 'veille et sommeil' }, MOM = { '': '—', start: 'début d’exploration', mid: 'en cours', end: 'fin d’exploration (sevrage)' };
      const recs = (ex.recordings || []).filter(r => this.ieegKind(r) === 'inter').sort((a, b) => String((a.startDate || '') + (a.startTime || '')).localeCompare(String((b.startDate || '') + (b.startTime || ''))));
      const rb = $('inRecs');
      rb.innerHTML = recs.length ? `<table class="sz-table inrec">${recs.map(r => `<tr data-r="${r.id}"><td><b>${esc(r.title)}</b><div class="muted small">${r.startDate ? fmtDate(r.startDate) + (r.startTime ? ' · ' + r.startTime.slice(0, 5) : '') : 'date inconnue'} · ${Math.round((r.duration || 0) / 60)} min</div></td><td>${esc(VIG[r.vigil] || 'vigilance : —')}</td><td><select data-k="moment" title="moment de l’exploration (effet du sevrage)">${Object.entries(MOM).map(([k, l]) => `<option value="${k}"${(r.moment || '') === k ? ' selected' : ''}>${l}</option>`).join('')}</select></td><td><button class="mini-btn" data-a="open">▶ revoir</button><button class="mini-btn" data-a="q">quantifier</button></td></tr>`).join('')}</table>`
        : '<div class="muted small">Aucun tracé intercritique : Analyses › importer un tracé (EDF, BrainVision), type « intercritique ».</div>';
      rb.querySelectorAll('tr[data-r]').forEach(tr => { const r = recs.find(x => x.id === tr.dataset.r);
        tr.querySelector('[data-k=moment]').onchange = e => { r.moment = e.target.value; this.touch('exploration', ex.id, 'tracé intercritique'); };
        tr.querySelector('[data-a=open]').onclick = () => this.ieegOpen(r, false); tr.querySelector('[data-a=q]').onclick = () => this.ieegOpen(r, true); });
    },

    // ================================================================ crise SEEG : contacts de début, aspect électrique
    currentSeizure() { const d = this.dossier; return d && this.ctx && this.ctx.seizureId ? S.byId(d.seizures, this.ctx.seizureId) : null; },
    renderSeegSeizure() {
      const box = $('tab-seegsz'); if (!box) return; const d = this.dossier, sz = this.currentSeizure();
      if (!sz) { box.innerHTML = '<div class="hint">Ouvrez une crise.</div>'; return; }
      const Z = sz.seeg = sz.seeg || { onset: {} }; Z.onset = Z.onset || {};
      const els = (this.elecs || []).slice().sort((a, b) => (a.hemi === b.hemi ? 0 : a.hemi === 'L' ? -1 : 1) || a.name.localeCompare(b.name, 'fr', { numeric: true }));
      const counts = { onset: 0, early: 0, late: 0 }; for (const r of Object.values(Z.onset)) counts[r] = (counts[r] || 0) + 1;
      const ses = S.contextOf(d, sz.id), list = S.seizuresOfExploration(d, ses.exploration.id), prev = list[list.findIndex(z => z.id === sz.id) - 1];
      box.innerHTML = `<div class="hint">Analyse visuelle : cliquez un plot pour le marquer <b style="color:${ROLE_COL.onset}">début</b> → <b style="color:${ROLE_COL.early}">propagation précoce</b> → <b style="color:${ROLE_COL.late}">tardive</b> → rien. Les marqueurs apparaissent dans la vue 3D ; la zone d’initiation du rapport SEEG en est tirée.</div>
        <div class="sz-roles"><span class="badge" style="border-color:${ROLE_COL.onset}">début ${counts.onset}</span><span class="badge" style="border-color:${ROLE_COL.early}">précoce ${counts.early}</span><span class="badge" style="border-color:${ROLE_COL.late}">tardive ${counts.late}</span><span class="spacer"></span>${prev && prev.seeg && Object.keys(prev.seeg.onset || {}).length ? `<button class="mini-btn" id="szCopy" title="reprendre les plots marqués dans ${esc(prev.label)}">copier ${esc(prev.label)}</button>` : ''}<button class="mini-btn" id="szClear">effacer</button></div>
        <div class="sz-elecs">${els.map(e => `<div class="sz-el"><b>${esc(e.name)}</b><span class="pchips">${e.contacts.map(c => { const k = e.name + c.k, r = Z.onset[k]; return `<button class="pchip sm role${r ? ' ' + r : ''}" data-k="${esc(k)}" title="${esc(e.name + c.k + ' · ' + (c.label >= 1 && c.label <= 162 ? this.atlas.label(c.label) : c.label === 200 ? 'substance blanche' : '—'))}">${c.k}</button>`; }).join('')}</span></div>`).join('') || '<div class="hint">Aucune électrode dans cette exploration.</div>'}</div>
        <div class="form"><label>Aspect du début <select id="szPat">${opts(V.seegPattern, Z.pattern || '')}</select></label>
          <label>Électrique <textarea id="szEl" rows="4" placeholder="pré-critique, début (plots, pattern), propagation, fin, post-critique">${esc(Z.electric || '')}</textarea></label>
          <label>Clinique <textarea id="szCl" rows="3" placeholder="description libre (la séquence saisie est reprise automatiquement dans le rapport)">${esc(Z.clinical || '')}</textarea></label></div>`;
      const save = () => { this.touch('seizure', sz.id, sz.label + ' (SEEG)'); if (this.refreshMarkers) this.refreshMarkers(); };
      box.querySelectorAll('.pchip.role').forEach(b => b.onclick = () => { const k = b.dataset.k, cyc = ['onset', 'early', 'late'], r = Z.onset[k], nx = r ? cyc[cyc.indexOf(r) + 1] : 'onset'; if (nx) Z.onset[k] = nx; else delete Z.onset[k]; save(); this.renderSeegSeizure(); });
      $('szPat').onchange = e => { Z.pattern = e.target.value; save(); };
      $('szEl').oninput = e => { Z.electric = e.target.value; save(); }; $('szCl').oninput = e => { Z.clinical = e.target.value; save(); };
      const cp = $('szCopy'); if (cp) cp.onclick = () => { Z.onset = Object.assign({}, prev.seeg.onset); if (!Z.pattern) Z.pattern = prev.seeg.pattern || ''; save(); this.renderSeegSeizure(); };
      $('szClear').onclick = () => { if (Object.keys(Z.onset).length && !confirm('Effacer les plots marqués de cette crise ?')) return; Z.onset = {}; save(); this.renderSeegSeizure(); };
    },
    /** plots de début sur l'ensemble des crises d'une SEEG : { 'A’1': { onset: n, early: n, late: n } }, nombre de crises analysées */
    onsetSummary(ex) {
      const d = this.dossier, out = {}; let n = 0;
      for (const sz of S.seizuresOfExploration(d, ex.id)) { const o = sz.seeg && sz.seeg.onset; if (!o || !Object.keys(o).length) continue; n++; for (const [k, r] of Object.entries(o)) { out[k] = out[k] || { onset: 0, early: 0, late: 0 }; out[k][r]++; } }
      return { contacts: out, n };
    },
    /** marqueurs 3D des plots de début (crise ouverte en mode crise SEEG ; toutes les crises en thermocoagulation) */
    onsetMarkers() {
      const d = this.dossier; if (!d || !this.elecs) return [];
      let map = null;
      if (this.ui.wm === 'semioSeeg') { const sz = this.currentSeizure(); map = sz && sz.seeg && sz.seeg.onset ? Object.fromEntries(Object.entries(sz.seeg.onset).map(([k, r]) => [k, { [r]: 1 }])) : null; }
      else if (this.ui.wm === 'thermo' && this.ctx) { const ex = S.byId(d.explorations, this.ctx.explorationId); if (ex) map = this.onsetSummary(ex).contacts; }
      if (!map) return [];
      const out = [], rgbOf = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
      for (const [k, cnt] of Object.entries(map)) {
        const m = k.match(/^(.*?)(\d+)$/); if (!m) continue; const e = Q.findElec(this.elecs, m[1]); if (!e) continue; const c = +m[2]; if (!e.contacts[c - 1]) continue;
        const role = cnt.onset ? 'onset' : cnt.early ? 'early' : 'late', tot = (cnt.onset || 0) + (cnt.early || 0) + (cnt.late || 0);
        out.push({ id: 'onset:' + k, kind: 'onset', eid: e.id, ks: [c], color: rgbOf(ROLE_COL[role]), radius: 1.7 + 0.25 * Math.min(4, tot - 1), opacity: 0.9, label: k, text: `${k} : ${V.seegRole[role]}${tot > 1 ? ` (${cnt.onset || 0} début, ${cnt.early || 0} précoce, ${cnt.late || 0} tardive)` : ''}` });
      }
      return out;
    },

    // ================================================================ stimulations, thermocoagulations : la coupe suit l'électrode
    seegDockFollow() {
      if (!this.ui.dock || !this.slices || !['stim', 'thermo'].includes(this.ui.wm)) return;
      const sg = this.ensureSeeg(), e = this.currentElec(this.ui.wm === 'stim' ? 'stimElec' : 'thermoElec'); if (!e) return;
      const key = this.worldKeyOf && this.worldKeyOf(e.id); if (!key) return;
      const P = this.ui.wm === 'stim' ? sg.pair : sg.tpair, st = this.slvState(), pair = P && P.elec === e.name ? [P.c1 - 1, P.c2 - 1] : null;
      st.pair = pair; if (pair) st.elecK = pair[0];
      if (st.elec !== key || !(this.slices.oblique || st.elecOrtho)) this.checkElectrode(key, true); else this.stepElectrode(0);
      this.slices.onStep = dir => {   // ← → dans la coupe : paire voisine (stimulations), plot voisin sinon
        if (this.ui.wm === 'stim' && sg.pair) { const c1 = Math.max(1, Math.min(e.nContacts - 1, sg.pair.c1 + dir)); sg.pair = { elec: e.name, c1, c2: c1 + 1 }; this.renderStims(); this.refreshMarkers(); }
        else if (this.ui.wm === 'thermo' && sg.tpair) { const c1 = Math.max(1, Math.min(e.nContacts - 1, sg.tpair.c1 + dir)); sg.tpair = { elec: e.name, c1, c2: c1 + 1 }; this.renderThermo(); this.refreshMarkers(); }
        else this.stepElectrode(dir);
      };
    },
  };
  Object.assign(SV.app, M);

  // ---------------------------------------------------------------- greffes sur les modules existants
  const A = SV.app;
  const rs0 = A.renderStims, rt0 = A.renderThermo, rm0 = A.refreshMarkers, re0 = A.renderElectrodes, pe0 = A.proposeElectrodes;
  A.renderStims = function () { rs0.apply(this, arguments); clearTimeout(this._dfT); this._dfT = setTimeout(() => this.seegDockFollow(), 30); this.onsetReminder($('tab-stims'), this.currentElec('stimElec'), '#stPairs'); };
  A.renderThermoCore = rt0;   // rendu de l'onglet (remplaçable) ; ci-dessous : coupe qui suit, plots de début
  A.renderThermo = function () {
    this.renderThermoCore.apply(this, arguments); clearTimeout(this._dfT); this._dfT = setTimeout(() => this.seegDockFollow(), 30);
    // plots de début de crise (toutes les crises de la SEEG) pour l'électrode courante : aide au choix des cibles
    this.onsetReminder($('tab-thermo'), this.currentElec('thermoElec'), '#tcPairs');
  };
  /** aide-mémoire des stimulations et des thermocoagulations : plots de l'électrode courante marqués au début des crises enregistrées */
  A.onsetReminder = function (box, e, after) {
    const d = this.dossier, ex = d && this.ctx && S.byId(d.explorations, this.ctx.explorationId); if (!box || !ex || !e) return;
    const old = box.querySelector('.onset-sum'); if (old) old.remove();
    const sum = this.onsetSummary(ex); if (!sum.n) return;
    const rows = Object.entries(sum.contacts).filter(([k]) => normName(k).startsWith(normName(e.name)) && /^\d+$/.test(k.slice(e.name.length))).sort((a, b) => +a[0].slice(e.name.length) - +b[0].slice(e.name.length));
    const el = h('div', 'onset-sum'); el.innerHTML = `<div class="sub-h">Début des crises enregistrées (${sum.n} crise${sum.n > 1 ? 's' : ''} analysée${sum.n > 1 ? 's' : ''})</div>${rows.length ? rows.map(([k, c]) => `<span class="badge" style="border-color:${ROLE_COL[c.onset ? 'onset' : c.early ? 'early' : 'late']}">${esc(k)} : ${c.onset ? c.onset + ' début' : ''}${c.early ? ' ' + c.early + ' précoce' : ''}${c.late ? ' ' + c.late + ' tardive' : ''}</span>`).join(' ') : `<span class="muted small">aucun plot de ${esc(e.name)} marqué au début des crises</span>`}`;
    const first = box.querySelector(after || '.pchips') || box.querySelector('.pchips'); if (first && first.parentNode) first.parentNode.insertBefore(el, first.nextSibling); else box.appendChild(el);
  };
  A.refreshMarkers = function () {
    rm0.apply(this, arguments);
    const extra = this.onsetMarkers ? this.onsetMarkers() : []; if (!extra.length || !this.viewer) return;
    this.viewer.setMarkers((this.viewer.markers || []).filter(m => m.kind !== 'onset').concat(extra));
  };
  A.renderElectrodes = function () { re0.apply(this, arguments); const box = $('tab-electrodes'), ph = this.planHeader && this.planHeader(); if (box && ph) box.insertBefore(ph, box.firstChild); };
  A.proposeElectrodes = function () {
    if (this.ui.wm === 'plan' && !(this.ctx && this.ctx.seizureId)) {
      const R = this.planResult(); if (!R) { this.toast('Rien sur quoi fonder la proposition : saisissez des crises (phase 1) ou des hypothèses (staff)', 5000); return; }
      // la proposition part des hypothèses ; l'affichage qui suit (tests des électrodes…) reprend le résultat de l'espace de travail
      const keep = this.result, rb = this.rebuildElectrodes; let need = false;
      this.result = R; this.rebuildElectrodes = () => { need = true; };
      try { pe0.apply(this, arguments); } finally { this.result = keep; this.rebuildElectrodes = rb; }
      if (need) this.rebuildElectrodes();
      return;
    }
    return pe0.apply(this, arguments);
  };
  SV.SeegFlow = { parseRos, parseTable, normName, ROLE_COL };
})(window.SV = window.SV || {});
