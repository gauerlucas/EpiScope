/* EpiScope — anat_ui.js : anatomie du patient calculée sur son T1, sans logiciel externe, et bascule gabarit ↔ patient.
 *
 * Chaîne (Dossier › Imagerie → « Calculer l'anatomie », ou « Recaler tout + anatomie ») :
 *   1. T1 de référence « conformé » (256³, 1 mm, LIA ; SV.MeshNet.conform, dans un worker) ;
 *   2. segmentation aparc+aseg 104 classes (MeshNet, modèles brainchop ; prémodèle de recadrage SB/SG), multi-fil ;
 *   3. recalage affine sur le gabarit fsaverage (centres de ~100 structures), parcellation VEP du patient
 *      (SV.Anat.prepare) et transformation rigide « d'affichage » (cerveau orienté comme le gabarit, à sa taille) ;
 *   4. surfaces piales et gonflées des deux hémisphères, profondeur sulcale, région VEP par sommet, structures profondes
 *      (3 workers en parallèle : SV.Anat.hemisphere ×2, SV.Anat.structures) ;
 *   5. dérivés rangés dans le dossier (derivatives/anat/) : segmentation et parcellation VEP en NIfTI (+ tables .tsv, style
 *      BIDS « dseg »), surfaces (format binaire EpiScope ; export GIfTI à la demande). L'archive « légère » les garde.
 * Le dossier décrit la chaîne dans d.anatomy (méthode, transformations, contrôle qualité, durées).
 *
 * Espaces : « monde » = RAS scanner du T1 de référence (plots réels, NIfTI) ; « affichage » = monde × toDisplay (rigide) ;
 * « gabarit » = fsaverage tkrRAS (MNI305), monde × toTemplate (affine). La vue 3D travaille en affichage (anatomie du
 * patient) ou en gabarit ; les coupes 3D suivent.                                                                     */
(function (SV) {
  'use strict';
  const $ = id => document.getElementById(id), S = SV.Store, L = SV.Library, M4 = SV.Mat4;
  const esc = SV.U.esc;
  const DIR = 'derivatives/anat/';
  const subLabel = d => ((d.patient && d.patient.pseudo) || 'patient').replace(/[^A-Za-z0-9]/g, '') || 'patient';
  const fmtS = ms => ms >= 60000 ? Math.floor(ms / 60000) + ' min ' + String(Math.round(ms / 1000) % 60).padStart(2, '0') + ' s' : Math.round(ms / 1000) + ' s';

  // ---- méthodes de segmentation du T1 (v4.19) : choisies une à une, en cascade, ou comparées puis choisies à la main
  const SEG_NAME = { auto: 'automatique (cascade contrôlée)', net: 'réseau MeshNet tel quel', bias: 'réseau après correction du biais', smooth: 'réseau sur image corrigée et lissée', atlas: 'atlas MNI (type SPM, sans réseau)', compare: 'comparer et choisir à la main', import: 'segmentation importée', user: 'choix manuel' };
  const SEG_SHORT = { net: 'réseau', bias: 'biais corrigé', smooth: 'image lissée', atlas: 'atlas', import: 'importée' };
  const SEG_HINT = {
    auto: 'réseau tel quel ; si le contrôle de qualité échoue : biais corrigé, image lissée, puis atlas (atlas en premier avant 2 ans) ; la première satisfaisante, sinon la meilleure',
    net: 'brainchop / MeshNet sur le T1 conformé (prémodèle SB / SG pour le recadrage) : rapide, le plus précis sur un T1 adulte standard',
    bias: 'champ de biais estimé dans le cerveau (masque mindgrab, mélange de gaussiennes), indépendant du réseau, puis réseau sur l’image corrigée — T1 hétérogènes, antennes de surface (le masque du cerveau se calcule une fois par session : quelques minutes)',
    smooth: 'image corrigée du biais puis légèrement lissée (σ 0,6 mm) — acquisitions < 1 mm à texture fine que le réseau ne reconnaît pas',
    atlas: 'recalage affine sur le gabarit MNI, tissus par mélange de gaussiennes à a priori spatiaux avec champ de biais (esprit SPM) — enfants, nourrissons (contraste inversé), cerveaux atypiques ; frontières de Desikan approximatives',
    compare: 'calcule les quatre méthodes, affiche les résultats côte à côte (coupes, contrôle de qualité) ; vous choisissez celle qui est gardée',
  };
  const SEG_TEXT = c => {
    const net = 'MeshNet aparc+aseg 104 classes (brainchop, Masoud et al. 2023 / Fedorov et al. 2017) sur T1 conformé';
    if (c.id === 'net') return net;
    if (c.id === 'bias') return net + ', après correction du biais de champ (EM 3 classes dans le masque mindgrab)';
    if (c.id === 'smooth') return net + ', sur l’image corrigée du biais et lissée (σ 0,6 mm)';
    if (c.id === 'atlas') return 'segmentation atlas sans réseau (recalage affine 12 ddl sur MNI ICBM152 2009a, mélange de gaussiennes à a priori spatiaux avec champ de biais, champ de Markov ; esprit de la segmentation unifiée de SPM, Ashburner & Friston 2005), étiquettes du modèle aparc+aseg 104';
    if (c.id === 'import') return 'segmentation importée (' + ((c.info && c.info.import && c.info.import.source) || 'fichier externe') + ')' + (c.info && c.info.atlas ? ', complétée par le gabarit MNI (méthode atlas à tissus imposés)' : '');
    return c.name || c.id;
  };
  /** âge (années, décimal) à une date ; mois de naissance inconnu → milieu d'année */
  function ageYears(P, date) {
    if (!P || !P.birthYear) return null; const d = date ? new Date(String(date).slice(0, 10) + 'T12:00:00') : new Date(); if (isNaN(d)) return null;
    const b = +P.birthYear + (P.birthMonth ? (+P.birthMonth - 0.5) / 12 : 0.5), a = d.getFullYear() + (d.getMonth() + d.getDate() / 31) / 12 - b;
    return a >= 0 && a < 130 ? a : null;
  }
  /** limites du contrôle de qualité selon l'âge : volume étiqueté (mm³), échelles patient → gabarit adulte, recalage (mm) */
  function segLimits(age) {
    const L = { unlabeled: 0.05, rms: 6.5, extent: 158, vmin: 8.5e5, vmax: 1.6e6, smin: 0.8, smax: 1.3, band: 'adulte' };
    if (age == null) return Object.assign(L, { band: 'âge inconnu (limites adultes)' });
    if (age < 0.5) return Object.assign(L, { rms: 8.5, vmin: 3e5, vmax: 9e5, smin: 0.95, smax: 1.8, band: 'moins de 6 mois' });
    if (age < 2) return Object.assign(L, { rms: 8, vmin: 4.5e5, vmax: 1.3e6, smin: 0.9, smax: 1.6, band: '6 mois à 2 ans' });
    if (age < 6) return Object.assign(L, { rms: 7.5, vmin: 7e5, vmax: 1.5e6, smin: 0.85, smax: 1.45, band: '2 à 6 ans' });
    if (age < 12) return Object.assign(L, { rms: 7, vmin: 8.5e5, vmax: 1.6e6, smin: 0.8, smax: 1.35, band: '6 à 12 ans' });
    return Object.assign(L, { band: age < 18 ? '12 à 18 ans' : 'adulte' });
  }

  /** données embarquées (modèles MeshNet, table du gabarit) : window.SV_ASSETS (développement) ou <script id="sv-asset-…"> */
  const ASSETS = {};
  function asset(name) {
    if (ASSETS[name]) return ASSETS[name];
    const w = window.SV_ASSETS && window.SV_ASSETS[name]; if (w) return (ASSETS[name] = w);
    const el = document.getElementById('sv-asset-' + name); if (!el) return null;
    return (ASSETS[name] = JSON.parse(el.textContent));
  }

  const M = {
    asset,
    anatMode: 'template',
    // ================================================================ calcul
    anatAvailable() { return !!(SV.MeshNet && SV.Anat && SV.Mesh && SV.VolOps && asset('model21_104class') && asset('template_anat')); },
    /** chaîne complète (v4.19) : segmentation par la méthode choisie (opts.mode : 'auto' cascade contrôlée, 'net', 'bias',
     *  'smooth', 'atlas', 'compare' — toutes, puis choix à la main —, 'import' avec opts.files), puis parcellation VEP,
     *  surfaces et dérivés (finishAnatomy). Les segmentations calculées restent en mémoire pendant la session (segCtx) :
     *  passer de l'une à l'autre ne refait que la fin de la chaîne. */
    async computeAnatomy(opts) {
      opts = opts || {};
      const d = this.dossier, ref = d && S.refImaging(d);
      if (!ref) { this.toast('Ajoutez d’abord un T1 de référence'); return; }
      if (!this.anatAvailable()) { this.toast('Module d’anatomie absent de cette version'); return; }
      if (this.ui.anatJob) { this.toast('Calcul de l’anatomie déjà en cours'); return; }
      const mode = opts.mode || (d.settings && d.settings.segMethod) || 'auto';
      const job = this.jobStart('Anatomie du patient' + (mode !== 'auto' ? ' · ' + (SEG_NAME[mode] || mode) : '')), t0 = performance.now(), T = {}; let t1 = t0;
      const lap = k => { const t = performance.now(); T[k] = Math.round(t - t1); t1 = t; };
      this.ui.anatJob = { started: Date.now(), message: 'préparation', mode }; this.renderAnatCard();
      const prog = this._anatProg(job);
      try {
        const ctx = await this.segContext(ref, prog(0, 0.03)); lap('conform');
        let cand;
        if (mode === 'import') cand = await this.segImport(ctx, opts.files || [], prog(0.03, 0.62));
        else {
          const young = ctx.age != null && ctx.age < 2, list = mode === 'auto' ? (young ? ['atlas', 'net', 'bias', 'smooth'] : ['net', 'bias', 'smooth', 'atlas']) : mode === 'compare' ? ['net', 'bias', 'smooth', 'atlas'] : [mode];
          cand = await this.segRun(ctx, list, prog(0.03, mode === 'compare' ? 1 : 0.62), { stopOnOk: mode === 'auto', force: !!opts.force });
        }
        lap('segmentation');
        if (mode === 'compare') {
          this.ui.anatJob = null; job.done(`${ctx.list.length} segmentations calculées en ${fmtS(performance.now() - t0)} : choisissez celle à garder`);
          this.renderAnatCard(); this.openSegChooser(); return;
        }
        cand.chosenBy = mode === 'auto' ? 'auto' : mode === 'import' ? 'import' : 'method';
        await this.finishAnatomy(ctx, cand, { job, prog, T, t0, lap });
      } catch (e) {
        console.error(e); this.ui.anatJob = null; job.fail(e.message); this.renderAnatCard();
      }
    },
    _anatProg(job) {
      return (a, b) => (p, msg) => { const f = typeof p === 'number' ? p : p && p.fraction != null ? p.fraction : 0, m = msg || (p && p.message) || ''; job.progress(a + (b - a) * Math.max(0, Math.min(1, f)), m); if (m && this.ui.anatJob) { this.ui.anatJob.message = m; this.ui.anatJob.fraction = a + (b - a) * f; const el = $('anJobMsg'); if (el) el.textContent = m; } };
    },
    /** segmentation choisie à la main (fenêtre de comparaison, ou résultat déjà calculé pendant la session) */
    async useSegCandidate(id) {
      const d = this.dossier, ctx = this.ui.segCtx, cand = ctx && ctx.list.find(c => c.id === id), ref = d && S.refImaging(d);
      if (!cand || !ref || ctx.refId !== ref.id) { this.toast('Résultat introuvable (T1 de référence changé ?) : recalculez'); return; }
      if (this.ui.anatJob) { this.toast('Calcul de l’anatomie déjà en cours'); return; }
      const job = this.jobStart('Anatomie du patient · ' + cand.name), t0 = performance.now(), T = {}; let t1 = t0;
      const lap = k => { const t = performance.now(); T[k] = Math.round(t - t1); t1 = t; };
      this.ui.anatJob = { started: Date.now(), message: 'parcellation VEP et surfaces', mode: 'user' }; this.renderAnatCard();
      cand.chosenBy = 'user';
      try { await this.finishAnatomy(ctx, cand, { job, prog: this._anatProg(job), T, t0, lap }); }
      catch (e) { console.error(e); this.ui.anatJob = null; job.fail(e.message); this.renderAnatCard(); }
    },
    /** contexte de segmentation du T1 de référence : volume conformé, âge à la date du T1 (contrôle de qualité adapté),
     *  masque du cerveau et image corrigée du biais (calculés une fois), résultats déjà obtenus */
    async segContext(ref, pr) {
      const d = this.dossier; let ctx = this.ui.segCtx;
      if (ctx && ctx.refId === ref.id && ctx.dossierId === d.id) { const age = ageYears(d.patient, ref.date); if (age !== ctx.age) { ctx.age = age; ctx.limits = segLimits(age); } return ctx; }
      const vol = await this.imagingVolume(ref), W = SV.Work.available;
      pr(0, 'conformation du T1 (256³, 1 mm)');
      const conf = W ? await SV.Work.run(['nifti', 'meshnet'], 'MeshNet.conform', [vol, { mode: 'niivue' }]) : SV.MeshNet.conform(vol, { mode: 'niivue' });
      const age = ageYears(d.patient, ref.date);
      return (this.ui.segCtx = { refId: ref.id, dossierId: d.id, conf, age, limits: segLimits(age), list: [], brain: null, bias: null });
    },
    _segKit() {
      const W = SV.Work.available, nw = Math.max(1, Math.min(8, ((navigator && navigator.hardwareConcurrency) || 4) - 1));
      const model = SV.MeshNet.loadModel(asset('model21_104class')), pre = asset('model5_gw_ae') ? SV.MeshNet.loadModel(asset('model5_gw_ae')) : null;
      let pool = null;
      return { W, nw, model, pre, meta: { names: model.labels, fsCodes: model.fsCodes, hemi: model.hemi }, getPool: () => pool || (pool = W ? SV.Work.pool(['meshnet'], nw) : null), close: () => { if (pool) { pool.close(); pool = null; } } };
    },
    /** méthodes l'une après l'autre ; stopOnOk : la première qui passe le contrôle de qualité (cascade), sinon la meilleure */
    async segRun(ctx, methods, pr, o) {
      o = o || {}; const K = this._segKit(), n = methods.length;
      try {
        for (let m = 0; m < n; m++) {
          const id = methods[m], sub = (p, msg) => pr((m + Math.max(0, Math.min(1, typeof p === 'number' ? p : (p && p.fraction) || 0))) / n, (n > 1 ? `${m + 1}/${n} · ${SEG_SHORT[id]} — ` : '') + (msg || (p && p.message) || ''));
          let c = !o.force && ctx.list.find(x => x.id === id);
          if (!c) { c = await this.segMethod(ctx, id, K, sub); c.q = await this.segJudge(c, ctx); ctx.list = ctx.list.filter(x => x.id !== id).concat([c]); }
          if (o.stopOnOk && c.q.ok) { c.reason = m ? `contrôle de qualité satisfaisant (${SEG_SHORT[id]})` : 'contrôle de qualité satisfaisant'; return c; }
          if (o.stopOnOk && m < n - 1) sub(1, `contrôle de qualité : ${c.q.why.join(', ')} → ${SEG_SHORT[methods[m + 1]]}`);
        }
      } finally { K.close(); }
      const tried = ctx.list.filter(c => methods.includes(c.id)), best = tried.slice().sort((a, b) => (b.q.ok - a.q.ok) || (a.q.score - b.q.score))[0];
      best.reason = n === 1 ? 'méthode choisie' : best.q.ok ? 'contrôle de qualité satisfaisant' : `meilleur score des ${n} méthodes`;
      return best;
    },
    /** masque du cerveau (mindgrab, cerveau + LCR ; repli : prémodèle SB/SG dilaté) et enveloppe dilatée (jamais le cou ni le scalp) */
    async segBrain(ctx, K, pr) {
      if (ctx.brain) return ctx.brain;
      const mg = asset('mindgrab'), conf = ctx.conf; let mask, source;
      if (mg) { pr(0, 'masque du cerveau (mindgrab)'); mask = (await SV.MeshNet.segmentPass(conf, SV.MeshNet.loadModel(mg), { pool: K.getPool(), workers: K.W ? K.nw : 0, onProgress: pr })).labels; source = 'mindgrab'; }
      else { if (!K.pre) throw new Error('ni mindgrab ni prémodèle : masque du cerveau impossible'); pr(0, 'masque du cerveau (prémodèle SB/SG)'); mask = (await SV.MeshNet.segmentPass(conf, K.pre, { pool: K.getPool(), workers: K.W ? K.nw : 0, onProgress: pr })).labels; source = 'prémodèle SB/SG dilaté'; }
      const env = K.W ? await SV.Work.run(['meshnet'], 'MeshNet.envelope', [mask, 4, 1]) : SV.MeshNet.envelope(mask, 4, 1);
      if (source !== 'mindgrab') mask = K.W ? await SV.Work.run(['meshnet'], 'MeshNet.envelope', [mask, 3, 1]) : SV.MeshNet.envelope(mask, 3, 1);
      let n = 0; for (let o = 0; o < mask.length; o++) if (mask[o]) n++;
      if (n < 150000) throw new Error(`masque du cerveau trop petit (${Math.round(n / 1000)} cm³, ${source}) : T1 atypique ?`);
      return (ctx.brain = { mask, env, source, cm3: Math.round(n / 1000) });
    },
    async segMethod(ctx, id, K, pr) {
      const t0 = performance.now(), conf = ctx.conf, W = K.W, info = {};
      const pass = (img, envl, p) => SV.MeshNet.segmentPass(conf, K.model, { image: img || undefined, premodel: K.pre, envelope: envl || undefined, pool: K.getPool(), workers: W ? K.nw : 0, onProgress: p });
      let r;
      if (id === 'net') { pr(0, 'réseau MeshNet aparc+aseg (brainchop)'); r = await pass(null, null, (f, m) => pr(f, m)); }
      else if (id === 'bias' || id === 'smooth') {
        const B = await this.segBrain(ctx, K, (f, m) => pr(0.25 * f, m));
        if (!ctx.bias) { pr(0.25, 'correction du biais de champ (sans réseau, masque ' + B.source + ')'); ctx.bias = W ? await SV.Work.run(['segatlas'], 'SegAtlas.biasCorrect', [conf.data, B.mask, {}]) : SV.SegAtlas.biasCorrect(conf.data, B.mask, {}); }
        if (ctx.bias.stats.skipped) throw new Error('correction du biais impossible : ' + ctx.bias.stats.skipped);
        let img = ctx.bias.data; info.harmonize = Object.assign({}, ctx.bias.stats);
        if (id === 'smooth') { pr(0.32, 'lissage léger de l’image corrigée (σ 0,6 mm)'); img = W ? await SV.Work.run(['meshnet'], 'MeshNet.smoothImage', [img, 0.6]) : SV.MeshNet.smoothImage(img, 0.6); info.harmonize.smooth = 0.6; }
        r = await pass(img, B.env, (f, m) => pr(0.35 + 0.65 * f, (m || '') + (id === 'smooth' ? ' (image corrigée, lissée)' : ' (image corrigée)')));
        info.brainMask = B.source;
      } else if (id === 'atlas') {
        const B = await this.segBrain(ctx, K, (f, m) => pr(0.3 * f, m)), tj = asset('template_spm');
        if (!tj) throw new Error('gabarit de la méthode atlas absent de cette version');
        const args = [conf, B.mask, tj, K.meta, {}], p2 = p => pr(0.3 + 0.7 * ((p && p.fraction) || 0), p && p.message);
        r = W ? await SV.Work.run(['nifti', 'coreg', 'meshnet', 'segatlas'], 'SegAtlas.segment', args, [], p2) : await SV.SegAtlas.segment(...args, p2);
        info.atlas = r.atlas; info.harmonize = r.harmonize; info.brainMask = B.source;
      } else throw new Error('méthode de segmentation inconnue : ' + id);
      return { id, name: SEG_NAME[id], labels: r.labels, coverage: r.coverage || null, info, ms: Math.round(performance.now() - t0) };
    },
    /** segmentation faite ailleurs, dans l'espace du T1 de référence : aparc+aseg / DKT+aseg (FreeSurfer, FastSurfer),
     *  aseg seul, carte de tissus (CAT12 p0, Brainstorm « tissues », SPM c1/c2/c3 → méthode atlas à tissus imposés) */
    async segImport(ctx, files, pr) {
      if (!files || !files.length) throw new Error('aucun fichier choisi');
      const t0 = performance.now(), K = this._segKit(), conf = ctx.conf, W = K.W;
      pr(0, 'lecture de la segmentation importée');
      const fl = []; for (const f of files) fl.push({ name: f.name, bytes: f.bytes instanceof Uint8Array ? f.bytes : new Uint8Array(await f.arrayBuffer()) });   // File.bytes() existe aussi (méthode)
      const I = W ? await SV.Work.run(['nifti', 'segatlas'], 'SegAtlas.fromImport', [fl, conf, K.meta]) : await SV.SegAtlas.fromImport(fl, conf, K.meta);
      if (I.info.inHead != null && I.info.inHead < 0.6) throw new Error(`la segmentation ne tombe pas dans la tête du T1 de référence (${Math.round(100 * I.info.inHead)} % des voxels) : elle doit être dans l’espace de ce T1 (FreeSurfer : volumes de mri/ ; SPM / CAT12 : images natives)`);
      let labels, atlas = null;
      if (I.kind === 'aparcaseg') labels = W ? await SV.Work.run(['meshnet'], 'MeshNet.largestComponent', [I.labels, [256, 256, 256], false]) : SV.MeshNet.largestComponent(I.labels, [256, 256, 256], false);
      else {
        const tj = asset('template_spm'); if (!tj) throw new Error('gabarit de la méthode atlas absent : seul aparc+aseg peut être importé');
        pr(0.15, I.kind === 'aseg' ? 'cortex de Desikan à partir du gabarit (structures importées)' : 'étiquettes à partir du gabarit (tissus importés)');
        const args = [conf, I.tissue, tj, K.meta, { tissue: I.tissue, labelsIn: I.labelsIn || null }], p2 = p => pr(0.15 + 0.85 * ((p && p.fraction) || 0), p && p.message);
        const r = W ? await SV.Work.run(['nifti', 'coreg', 'meshnet', 'segatlas'], 'SegAtlas.segment', args, [], p2) : await SV.SegAtlas.segment(...args, p2);
        labels = r.labels; atlas = r.atlas;
      }
      for (const f of fl) await L.writeFile(this.dossier, DIR + 'import/' + f.name.replace(/[^\w.+-]/g, '_'), f.bytes);
      const c = { id: 'import', name: 'importée (' + I.info.source + ')', labels, coverage: null, info: { import: I.info, atlas }, ms: Math.round(performance.now() - t0) };
      c.q = await this.segJudge(c, ctx); ctx.list = ctx.list.filter(x => x.id !== 'import').concat([c]); c.reason = 'segmentation importée';
      return c;
    },
    /** contrôle de qualité (limites selon l'âge à la date du T1) : recalage des centroïdes sur le gabarit, proportions,
     *  étendue, volume étiqueté, tissu du prémodèle sans étiquette */
    async segJudge(c, ctx) {
      const Lm = ctx.limits, tpl = asset('template_anat'), args = [c.labels, [256, 256, 256], Array.from(ctx.conf.affine), tpl];
      const q = Object.assign({}, SV.Work.available ? await SV.Work.run(['nifti', 'anat'], 'Anat.segQuality', args) : SV.Anat.segQuality(...args)), why = [], cov = c.coverage;
      q.unlabeled = cov ? cov.unlabeled : 0; q.grayUnlabeled = cov ? cov.grayUnlabeled : 0;
      if (q.unlabeled > Lm.unlabeled) why.push(`${(100 * q.unlabeled).toFixed(1)} % du tissu sans étiquette`);
      if (q.rms != null && q.rms > Lm.rms) why.push(`recalage sur le gabarit ${q.rms.toFixed(1)} mm`);
      const badS = q.scales && q.scales.some(x => x < Lm.smin || x > Lm.smax); if (badS) why.push('proportions anormales (' + q.scales.map(x => x.toFixed(2)).join(' / ') + ')');
      if (q.extent != null && q.extent > Lm.extent) why.push(`étendue ${q.extent} mm (cou ou scalp ?)`);
      if (q.volume != null && (q.volume < Lm.vmin || q.volume > Lm.vmax)) why.push(`volume étiqueté ${(q.volume / 1000).toFixed(0)} cm³ (attendu ${Lm.vmin / 1000}–${Lm.vmax / 1000} pour ${Lm.band})`);
      q.ok = !why.length; q.why = why;
      q.score = (q.rms != null ? q.rms : 6) + 40 * q.unlabeled + (q.extent > Lm.extent ? (q.extent - Lm.extent) / 2 : 0) + (badS ? 10 : 0) + (q.volume < Lm.vmin || q.volume > Lm.vmax ? 5 : 0);
      // volumes SG / SB (cm³) pour la comparaison
      const names = (asset('model21_104class') || {}).labels || [], cls = names.map(n => !n || n === 'BG' ? 0 : /^ctx-|Thalamus|Caudate|Putamen|Pallidum|Hippocampus|Amygdala|Accumbens|VentralDC|Cerebellum-Cortex/.test(n) ? 1 : /White-Matter|Brain-Stem|^CC_/.test(n) ? 2 : 3), v = [0, 0, 0, 0];
      for (let o = 0; o < c.labels.length; o++) { const l = c.labels[o]; if (l) v[cls[l] || 0]++; }
      q.gm = Math.round(v[1] / 1000); q.wm = Math.round(v[2] / 1000); q.csf = Math.round(v[3] / 1000);
      return q;
    },
    /** fin de chaîne pour la segmentation retenue : parcellation VEP, surfaces, structures profondes, dérivés, dossier */
    async finishAnatomy(ctx, cand, X) {
      const d = this.dossier, ref = S.refImaging(d), { job, prog, T, t0, lap } = X, W = SV.Work.available; let pool = null;
      try {
        const mdl = asset('model21_104class'), seg = { labels: cand.labels, dims: [256, 256, 256], affine: Float64Array.from(ctx.conf.affine), labelNames: mdl.labels, fsCodes: mdl.fsCodes, hemi: mdl.hemi };
        const tpl = asset('template_anat'), tv = { dims: this.vol.dims, off: this.vol.off, vox: this.vol.vox, data: this.vol.data };
        const meta = { names: seg.labelNames, hemi: seg.hemi }, affine = Array.from(seg.affine);
        prog(0.62, 0.7)(0, 'recalage sur le gabarit, parcellation VEP');
        const P = await SV.Work.run(['nifti', 'anat'], 'Anat.prepare', [seg.labels, seg.dims, affine, meta, tpl, tv], [], prog(0.62, 0.7));
        lap('parcellation');
        const Ad = Array.from(M4.mul(M4.from(P.toDisplay), M4.from(affine))), names = this.atlas.regions.map(r => r.name);
        pool = W ? SV.Work.pool(['nifti', 'volops', 'mesh', 'anat'], 3) : null;
        const call = (m, a, pr) => pool ? pool.call(m, a, [], pr) : Promise.resolve().then(() => m.split('.').reduce((o, k) => o[k], SV)(...a, pr));
        const fr = [0, 0, 0], upd = (i, msg) => p => { fr[i] = (p && p.fraction) || fr[i]; prog(0.7, 0.96)((fr[0] + fr[1] + fr[2]) / 3, msg); };
        const [lh, rh, sub] = await Promise.all([
          call('Anat.hemisphere', [seg.labels, P.vep, seg.dims, Ad, meta, 'L', {}], upd(0, 'surface de l’hémisphère gauche')),
          call('Anat.hemisphere', [seg.labels, P.vep, seg.dims, Ad, meta, 'R', {}], upd(1, 'surface de l’hémisphère droit')),
          call('Anat.structures', [P.vep, seg.dims, Ad, names], upd(2, 'structures profondes'))]);
        if (pool) { pool.close(); pool = null; }
        lap('surfaces');
        prog(0.96, 1)(0, 'enregistrement dans le dossier');
        const base = DIR + 'sub-' + subLabel(d), A4 = M4.from(affine);
        const segVol = { dims: seg.dims, pixdim: [1, 1, 1], affine: A4, data: seg.labels, slope: 1, inter: 0 }, vepVol = { dims: seg.dims, pixdim: [1, 1, 1], affine: A4, data: P.vep, slope: 1, inter: 0 };
        const files = { seg: base + '_desc-aparcaseg_dseg.nii.gz', segTsv: base + '_desc-aparcaseg_dseg.tsv', vep: base + '_atlas-VEP_dseg.nii.gz', vepTsv: base + '_atlas-VEP_dseg.tsv', surf: base + '_space-display_surfaces.episcope', json: base + '_anat.json' };
        const centroids = Object.assign({}, P.centroids, SV.Anat.vertexCentroids([lh, rh]));
        const pk = { version: 1, space: 'display', toDisplay: P.toDisplay, centroids, sub: sub.map(s => ({ index: s.index, name: s.name, volume: Math.round(s.volume) })) };
        for (const [h, H] of [['lh', lh], ['rh', rh]]) { pk[h + '_pial'] = H.pial; pk[h + '_inflated'] = H.inflated; pk[h + '_faces'] = H.faces; pk[h + '_sulc'] = H.sulc; pk[h + '_labels'] = H.labels; }
        for (const s of sub) { pk['sub' + s.index + '_pos'] = s.vertices; pk['sub' + s.index + '_faces'] = s.faces; }
        await L.writeFile(d, files.surf, SV.Mesh.pack(pk));
        await L.writeFile(d, files.seg, await SV.Nifti.encodeGz(segVol));
        await L.writeFile(d, files.vep, await SV.Nifti.encodeGz(vepVol));
        await L.writeFile(d, files.segTsv, 'index\tname\tfreesurfer_code\themisphere\n' + seg.labelNames.map((n, i) => `${i}\t${n}\t${seg.fsCodes ? seg.fsCodes[i] : ''}\t${seg.hemi[i] || ''}`).join('\n') + '\n');
        await L.writeFile(d, files.vepTsv, 'index\tname\n' + this.atlas.regions.filter(r => r.index).map(r => `${r.index}\t${r.name}`).concat(['200\twhite-matter', '201\tCSF', '202\tother']).join('\n') + '\n');
        const present = new Set(Object.keys(centroids).map(Number)), missing = this.atlas.regions.filter(r => r.index && !present.has(r.index)).map(r => r.name);
        const step = c => ({ id: c.id, name: c.name, ok: c.q.ok, why: c.q.why, rms: c.q.rms, unlabeled: +(c.q.unlabeled || 0).toFixed(4), score: +c.q.score.toFixed(2), extent: c.q.extent, volume: c.q.volume, scales: c.q.scales, gm: c.q.gm, wm: c.q.wm, ms: c.ms });
        const info = {
          status: 'done', date: S.now(), refImagingId: ref.id, refLabel: ref.label, files,
          method: SEG_TEXT(cand) + ' ; parcellation VEP par recalage affine sur fsaverage et contrainte Desikan ; surfaces par marching cubes à topologie corrigée',
          model: mdl.name, toTemplate: Array.from(P.toTemplate), toDisplay: Array.from(P.toDisplay), fit: P.fit, midX: P.midX, brainCenter: P.brainCenter,
          qc: { vertices: [lh.n, rh.n], area: [Math.round(lh.info.area), Math.round(rh.info.area)], genus: [lh.info.genus, rh.info.genus], regions: 162 - missing.length, missing, structures: sub.length, labelsSearch: P.counts, coverage: cand.coverage || null },
          segmentation: { method: cand.id, name: cand.name, chosenBy: cand.chosenBy || 'method', reason: cand.reason || '', ok: cand.q.ok, why: cand.q.why, age: ctx.age == null ? null : +ctx.age.toFixed(3), limits: ctx.limits.band, brainMask: (cand.info && cand.info.brainMask) || null, atlas: (cand.info && cand.info.atlas) || null, import: (cand.info && cand.info.import) || null, tried: ctx.list.map(step) },
          harmonize: (cand.info && cand.info.harmonize) || null,
          cascade: { steps: ctx.list.map(step), chosen: cand.name, reason: cand.reason || '' },
          timings: Object.assign(T, { total: Math.round(performance.now() - t0) }), workers: W ? Math.max(1, Math.min(8, ((navigator && navigator.hardwareConcurrency) || 4) - 1)) : 0,
        };
        await L.writeFile(d, files.json, JSON.stringify(Object.assign({ Name: 'EpiScope anatomy', Sources: [ref.file] }, info), null, 2));
        d.anatomy = info;
        S.log(d, 'compute', 'imaging', ref.id, `anatomie du patient · ${cand.name} (${fmtS(info.timings.total)})`); this.touch(); await this.flushSave();
        this.patientAnat = this.buildPatientAnat(d, { mesh: pk, vepVol, segVol, meta: { names: seg.labelNames, colors: mdl.colors || null } }); if (this.fixElectrodeSides) this.fixElectrodeSides(d);
        this.ui.anatJob = null;
        job.done(`Anatomie du patient prête (${cand.name}) en ${fmtS(info.timings.total)} — bouton « Patient » pour l’afficher`);
        this.updateAnatSwitch();
        const dlg = document.getElementById('segChooser'); if (dlg) this.openSegChooser();
        if (this.ui.screen === 'imaging') this.renderImaging();
      } finally { if (pool) pool.close(); }
    },

    // ================================================================ comparer et choisir la segmentation (v4.19)
    openSegChooser() {
      const ctx = this.ui.segCtx, d = this.dossier, ref = d && S.refImaging(d);
      if (!ctx || !ctx.list.length || !ref || ctx.refId !== ref.id) { this.toast('Aucune segmentation calculée pendant cette session pour ce T1 : « Comparer et choisir » les calcule'); return; }
      const old = document.getElementById('segChooser'), keep = old && old._st; if (old) old.remove();
      const mdl = asset('model21_104class'), cols = mdl.colors || [], cur = d.anatomy && d.anatomy.status === 'done' && d.anatomy.refImagingId === ref.id && d.anatomy.segmentation ? d.anatomy.segmentation.method : null;
      const A = M4.from(ctx.conf.affine), Ai = M4.inv(A), img = ctx.conf.data;
      // centre du cerveau (masque ou première segmentation) et fenêtre des intensités
      const m0 = (ctx.brain && ctx.brain.mask) || ctx.list[0].labels; let cx = 0, cy = 0, cz = 0, n = 0; const H = new Float64Array(256);
      for (let o = 0; o < m0.length; o += 3) if (m0[o]) { cx += o % 256; cy += ((o / 256) | 0) % 256; cz += (o / 65536) | 0; n++; H[img[o]]++; }
      const C = M4.apply(A, cx / n, cy / n, cz / n); let acc = 0, hi = 255; for (let v = 0; v < 256; v++) { acc += H[v]; if (acc >= 0.995 * n) { hi = v; break; } }
      const st = keep || { pos: [0, 0, 0], op: 0.45, contour: false };
      const VIEWS = [['axial', 'axiale', [-1, 0, 0], [0, 1, 0], [0, 0, 1]], ['coronal', 'coronale', [-1, 0, 0], [0, 0, 1], [0, 1, 0]], ['sagittal', 'sagittale', [0, -1, 0], [0, 0, 1], [1, 0, 0]]];
      const S0 = 170, FOV = 190, step = FOV / S0;
      const draw = (cv, lab, vi) => {
        const [, , U, Vv, Nn] = VIEWS[vi], off = st.pos[vi], g = cv.getContext('2d'), im = g.createImageData(S0, S0), L2 = new Uint8Array(S0 * S0);
        for (let r = 0; r < S0; r++) for (let c = 0; c < S0; c++) {
          const u = (c - S0 / 2) * step, v = (S0 / 2 - r) * step, p = [C[0] + U[0] * u + Vv[0] * v + Nn[0] * off, C[1] + U[1] * u + Vv[1] * v + Nn[1] * off, C[2] + U[2] * u + Vv[2] * v + Nn[2] * off];
          const q = M4.apply(Ai, p[0], p[1], p[2]), i = Math.round(q[0]), j = Math.round(q[1]), k = Math.round(q[2]), o = 4 * (r * S0 + c);
          let val = 0, l = 0; if (i >= 0 && j >= 0 && k >= 0 && i < 256 && j < 256 && k < 256) { const t = i + 256 * (j + 256 * k); val = img[t]; l = lab ? lab[t] : 0; }
          const gv = Math.min(255, 255 * val / Math.max(1, hi)); im.data[o] = im.data[o + 1] = im.data[o + 2] = gv; im.data[o + 3] = 255; L2[r * S0 + c] = l;
        }
        for (let r = 0; r < S0; r++) for (let c = 0; c < S0; c++) {
          const l = L2[r * S0 + c]; if (!l || !cols[l]) continue;
          if (st.contour && r > 0 && c > 0 && r < S0 - 1 && c < S0 - 1 && L2[r * S0 + c - 1] === l && L2[r * S0 + c + 1] === l && L2[(r - 1) * S0 + c] === l && L2[(r + 1) * S0 + c] === l) continue;
          const o = 4 * (r * S0 + c), a = st.contour ? 0.9 : st.op; for (let ch = 0; ch < 3; ch++) im.data[o + ch] = im.data[o + ch] * (1 - a) + cols[l][ch] * a;
        }
        g.putImageData(im, 0, 0);
      };
      const pct = x => (100 * x).toFixed(1).replace('.', ',') + ' %';
      const card = c => { const q = c.q || {}; return `<div class="sc-cand${q.ok ? ' ok' : ' warn'}${c.id === cur ? ' cur' : ''}" data-id="${esc(c.id)}">
          <div class="sc-h"><b>${esc(c.name)}</b>${c.id === cur ? ' <span class="sc-badge">retenue</span>' : ''}<span class="spacer"></span><span class="${q.ok ? 'sc-ok' : 'sc-ko'}" title="${esc((q.why || []).join('\n') || 'contrôle de qualité satisfaisant')}">${q.ok ? '✓ contrôle satisfaisant' : '✗ ' + esc((q.why || [])[0] || 'à vérifier')}</span></div>
          <div class="sc-views">${VIEWS.map((v, i) => `<canvas width="${S0}" height="${S0}" data-v="${i}" title="coupe ${v[1]}"></canvas>`).join('')}</div>
          <div class="muted small">étiqueté ${q.volume ? Math.round(q.volume / 1000) : '—'} cm³ (SG ${q.gm || '—'}, SB ${q.wm || '—'}) · recalage ${q.rms != null ? q.rms.toFixed(1) + ' mm' : '—'} · échelles ${q.scales ? q.scales.map(x => x.toFixed(2)).join('/') : '—'}${c.coverage ? ' · sans étiquette ' + pct(c.coverage.unlabeled) : ''} · ${fmtS(c.ms || 0)}</div>
          ${c.info && c.info.atlas && c.info.atlas.em ? `<div class="muted small">atlas : ${esc(c.info.atlas.em.contrast)} · LCR ${c.info.atlas.em.volumes.csf} / SG ${c.info.atlas.em.volumes.gm} / SB ${c.info.atlas.em.volumes.wm} cm³ · échelles du gabarit ${c.info.atlas.reg.scales.join('/')}</div>` : ''}
          <div class="btnrow"><span class="spacer"></span><button class="${c.id === cur ? '' : 'primary '}sc-use" data-use="${esc(c.id)}"${this.ui.anatJob ? ' disabled' : ''}>${c.id === cur ? 'Recalculer avec celle-ci' : 'Choisir celle-ci'}</button></div></div>`; };
      const panel = document.createElement('div'); panel.className = 'modal'; panel.id = 'segChooser'; panel._st = st;
      const rng = (i, nm) => `<label class="sc-rng">${nm} <input type="range" min="-60" max="60" step="1" value="${st.pos[i]}" data-p="${i}"><span>${st.pos[i] > 0 ? '+' : ''}${st.pos[i]} mm</span></label>`;
      panel.innerHTML = `<div class="modal-card sc-card"><div class="modal-head"><span>Segmentation du T1 : comparer et choisir</span><button class="close">✕</button></div>
        <div class="sc-tools">${rng(0, 'axiale')}${rng(1, 'coronale')}${rng(2, 'sagittale')}<label class="sc-rng">étiquettes <input type="range" min="0" max="1" step="0.05" value="${st.op}" data-op></label><label class="chip"><input type="checkbox" data-ct${st.contour ? ' checked' : ''}> contours</label><span class="spacer"></span><span class="muted small">convention radiologique · ${esc(ctx.limits.band)}${ctx.brain ? ' · masque ' + esc(ctx.brain.source) + ' ' + ctx.brain.cm3 + ' cm³' : ''}</span></div>
        <div class="sc-grid">${ctx.list.map(card).join('')}</div>
        <div class="btnrow sc-foot"><span class="muted small">Choisir une segmentation lance la parcellation VEP et les surfaces (≈ 1 min). Les autres résultats restent disponibles jusqu’à la fermeture du dossier.</span><span class="spacer"></span><button class="close">Fermer</button></div></div>`;
      document.body.appendChild(panel); panel.hidden = false;
      const redraw = () => panel.querySelectorAll('.sc-cand').forEach(el => { const c = ctx.list.find(x => x.id === el.dataset.id); el.querySelectorAll('canvas').forEach(cv => draw(cv, c && c.labels, +cv.dataset.v)); });
      let raf = 0; const later = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; redraw(); }); };
      redraw();
      const close = () => panel.remove(); panel.querySelectorAll('.close').forEach(b => b.onclick = close); panel.onclick = e => { if (e.target === panel) close(); };
      const onKey = e => { if (e.key === 'Escape' && document.body.contains(panel)) { e.stopPropagation(); close(); document.removeEventListener('keydown', onKey, true); } }; document.addEventListener('keydown', onKey, true);
      panel.querySelectorAll('[data-p]').forEach(r => r.oninput = () => { st.pos[+r.dataset.p] = +r.value; r.nextElementSibling.textContent = (r.value > 0 ? '+' : '') + r.value + ' mm'; later(); });
      panel.querySelector('[data-op]').oninput = e => { st.op = +e.target.value; later(); };
      panel.querySelector('[data-ct]').onchange = e => { st.contour = e.target.checked; later(); };
      panel.querySelectorAll('[data-use]').forEach(b => b.onclick = () => { panel.querySelectorAll('[data-use]').forEach(x => { x.disabled = true; }); this.useSegCandidate(b.dataset.use); });
    },
    /** fichiers de segmentation à importer (sélection multiple : c1/c2/c3, p1/p2/p3) */
    pickSegImport() {
      const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true; inp.accept = '.nii,.gz,.mgz,.mgh';
      inp.onchange = () => { const fs = Array.from(inp.files || []); if (fs.length) this.computeAnatomy({ mode: 'import', files: fs }); };
      inp.click();
    },

    // ================================================================ chargement / objet « anatomie du patient »
    async loadPatientAnatomy(d) {
      this.patientAnat = null; this._brainMask = null;
      if (this.ui.segCtx && (!d || this.ui.segCtx.dossierId !== d.id)) this.ui.segCtx = null;   // segmentations de la session : un seul dossier
      const an = d.anatomy;
      if (an && an.status === 'done' && an.files) {
        try {
          const [surf, vep, seg] = await Promise.all([L.readBytes(d, an.files.surf), L.readBytes(d, an.files.vep), L.readBytes(d, an.files.seg)]);
          if (!surf || !vep) throw new Error('fichiers dérivés absents du dossier');
          const mesh = SV.Mesh.unpack(surf), vepVol = await SV.Nifti.read(vep), segVol = seg ? await SV.Nifti.read(seg) : null, mdl = asset('model21_104class');
          this.patientAnat = this.buildPatientAnat(d, { mesh, vepVol, segVol, meta: { names: mdl ? mdl.labels : null, colors: mdl ? mdl.colors : null } });
          if (this.fixElectrodeSides) this.fixElectrodeSides(d);
        } catch (e) { console.warn('anatomie du patient', e); this.toast('Anatomie du patient illisible : ' + e.message, 5000); }
      }
      this.updateAnatSwitch();
      const want = (d.settings && d.settings.anatomy) || 'template';
      this.setAnatomy(this.patientAnat && want === 'patient' ? 'patient' : 'template', true);
    },
    /** objet anatomie : atlas pour la vue 3D (même interface que SV.Atlas, hérite du gabarit : régions, adjacence,
     *  connectivité), volumes d'étiquettes, transformations entre espaces */
    buildPatientAnat(d, { mesh, vepVol, segVol, meta }) {
      const an = d.anatomy, D = M4.from(an.toDisplay), Di = M4.inv(D), T = M4.from(an.toTemplate), Ti = M4.inv(T), dispFromTpl = M4.mul(D, Ti), tplFromDisp = M4.mul(T, Di);
      const tpl = this.atlas, atlas = Object.create(tpl);
      atlas.patient = true; atlas.hemis = {};
      for (const h of ['lh', 'rh']) atlas.hemis[h] = { n: mesh[h + '_pial'].length / 3, pial: mesh[h + '_pial'], inflated: mesh[h + '_inflated'], flat: null, faces: mesh[h + '_faces'], sulc: mesh[h + '_sulc'], labels: mesh[h + '_labels'] };
      atlas.subcortical = (mesh.sub || []).filter(s => mesh['sub' + s.index + '_pos']).map(s => ({ index: s.index, name: s.name, vertices: mesh['sub' + s.index + '_pos'], faces: mesh['sub' + s.index + '_faces'] }));
      const C = mesh.centroids || {};
      atlas.regions = tpl.regions.map(r => { if (!r.index) return r; const c = C[r.index]; return Object.assign({}, r, { centroid: c ? [c[0], c[1], c[2]] : r.centroid ? M4.apply(dispFromTpl, r.centroid[0], r.centroid[1], r.centroid[2]) : null, absent: !c }); });
      const midX = an.midX || 0;
      return {
        atlas, vepVol, segVol, meta: meta || {}, info: an,
        toDisplay: D, fromDisplay: Di, toTemplate: T, fromTemplate: Ti, dispFromTemplate: dispFromTpl, templateFromDisplay: tplFromDisp,
        labelVol: SV.Anat.labelVolume(vepVol, Di),   // étiquettes VEP du patient, point en coordonnées d'affichage
        labelWorld: SV.Anat.labelVolume(vepVol),     // id., point en coordonnées monde (T1)
        center: an.brainCenter, midX,
        sideOf: p => { const q = M4.apply(D, p[0], p[1], p[2]); return q[0] < midX ? 'L' : 'R'; },
        lateral: p => M4.apply(D, p[0], p[1], p[2])[0] - midX,   // abscisse signée (mm) par rapport à la ligne médiane du patient
      };
    },
    /** masque du cerveau dilaté (monde du T1) pour la détection des électrodes : limite les faux plots (os, câbles) */
    async anatBrainMask(r) {
      r = r == null ? 4 : r; const A = this.patientAnat; if (!A || !A.segVol) return null; this._brainMask = this._brainMask || {}; if (this._brainMask[r]) return this._brainMask[r];
      const sv = A.segVol, m = new Uint8Array(sv.data.length); for (let i = 0; i < m.length; i++) if (sv.data[i]) m[i] = 1;
      const dil = !r ? m : SV.Work.available ? await SV.Work.run(['volops'], 'VolOps.dilate', [m, sv.dims, r, {}]) : SV.VolOps.dilate(m, sv.dims, r, {});
      return (this._brainMask[r] = { dims: sv.dims, affine: sv.affine, data: dil });
    },

    // ================================================================ bascule gabarit ↔ patient
    /** espace de la vue 3D → gabarit (pose d'électrode prévue au clic, réglages) */
    viewToTemplate(p) { const A = this.patientAnat; return this.anatMode === 'patient' && A && p ? M4.apply(A.templateFromDisplay, p[0], p[1], p[2]) : p; },
    /** monde du T1 → espace de la vue 3D */
    worldToView(p) { const A = this.patientAnat; if (!A || !p) return null; return M4.apply(this.anatMode === 'patient' ? A.toDisplay : A.toTemplate, p[0], p[1], p[2]); },
    setAnatomy(mode, quiet) {
      if (mode === 'patient' && !this.patientAnat) {
        if (!quiet) this.toast(this.ui.anatJob ? 'Anatomie du patient en cours de calcul…' : this.dossier && S.refImaging(this.dossier) ? 'Anatomie du patient : à calculer dans l’écran Imagerie (F7)' : 'Anatomie du patient : importez d’abord son T1 (écran Imagerie, F7)', 4000);
        mode = 'template';
      }
      const changed = this.anatMode !== mode; this.anatMode = mode;
      if (this.viewer && this.viewer.setAtlas) this.viewer.setAtlas(mode === 'patient' ? this.patientAnat.atlas : this.atlas);
      if (!quiet && this.dossier && this.dossier.settings && this.dossier.settings.anatomy !== mode) { this.dossier.settings.anatomy = mode; if (this.scheduleSave) this.scheduleSave(); }
      this.updateAnatSwitch();
      if (changed || !quiet) { this.rebuildElectrodes(); if (this.updateSlices3d) this.updateSlices3d(); }
    },
    updateAnatSwitch() {
      const ok = !!this.patientAnat;
      document.querySelectorAll('#anatSwitch [data-anat]').forEach(b => {
        b.classList.toggle('on', b.dataset.anat === this.anatMode);
        if (b.dataset.anat === 'patient') { b.classList.toggle('dim', !ok); b.title = ok ? 'Anatomie du patient (surfaces et parcellation VEP calculées sur son T1)' : this.ui.anatJob ? 'Calcul de l’anatomie en cours…' : 'Anatomie du patient non calculée : écran Imagerie'; }
      });
    },

    // ================================================================ carte « Anatomie du patient » (écran Imagerie)
    /** contrôle qualité de la segmentation : méthode retenue et tentatives, correction des intensités, méthode atlas, import,
     *  tissu resté sans étiquette (alerte au-delà de 6 %), âge */
    anatQcLine(an) {
      const h = an.harmonize, cv = (an.qc || {}).coverage, pct = x => (100 * x).toFixed(1).replace('.', ',') + ' %', out = [], G = an.segmentation;
      const K = an.cascade, BY = { auto: 'cascade automatique', user: 'choisie à la main', method: 'méthode choisie', import: 'importée' };
      if (K && K.steps && K.steps.length) out.push(`<div class="muted" title="${esc(K.steps.map(s0 => `${s0.name} : ${s0.ok ? 'contrôle satisfaisant' : (s0.why || []).join(', ')} (recalage ${s0.rms} mm${s0.unlabeled ? `, ${(100 * s0.unlabeled).toFixed(1)} % sans étiquette` : ''}${s0.gm ? `, SG ${s0.gm} / SB ${s0.wm} cm³` : ''})`).join('\n'))}">segmentation : ${K.steps.map(s0 => `${esc(SEG_SHORT[s0.id] || s0.name)} ${s0.ok ? '✓' : '✗'}`).join(' · ')} · retenue : <b>${esc(K.chosen)}</b>${G && G.chosenBy && G.chosenBy !== 'import' ? ` <span class="small">(${esc(BY[G.chosenBy] || G.chosenBy)})</span>` : ''}</div>`);
      if (h && !h.skipped && h.field) out.push(`<div class="muted" title="${esc(h.method || 'biais de champ (inhomogénéité lente des intensités) corrigé')} ; référence ramenée à ${h.target}${h.retry ? ` ; second passage sur l’image lissée (${h.smooth || 0.6} mm) : tissu sans étiquette ${pct(h.retry.unlabeled[0])} → ${pct(h.retry.unlabeled[1])}, ${h.retry.kept === 'lissée' ? 'gardé' : 'non retenu'}` : ''}">intensités corrigées : biais ${pct(h.field[0])} à +${pct(h.field[1])}${h.wmBefore != null ? `, SB ${h.wmBefore} → ${h.wmAfter}` : ''}${h.cvBefore != null ? `, hétérogénéité ${pct(h.cvBefore)} → ${pct(h.cvAfter)}` : ''}${h.smooth ? ' · image lissée' : ''}</div>`);
      else if (!h && !K && ((an.qc || {}).missing || []).length) out.push('<div class="note">Anatomie calculée par une version ancienne, avant l’harmonisation des intensités : des régions manquent — « recalculer » corrige souvent une segmentation incomplète (lobes frontaux, vertex).</div>');
      const At = G && G.atlas; if (At && At.reg) out.push(`<div class="muted" title="recalage affine 12 ddl du gabarit MNI ICBM152 2009a sur le cerveau du patient (NMI ${At.reg.nmi}) ; tissus par EM à a priori spatiaux (α ${At.em ? At.em.alpha : '—'}), champ de Markov (β ${At.em ? At.em.beta : '—'}) ; frontières de Desikan issues du gabarit (approximatives)">atlas : échelles du gabarit ${At.reg.scales.join(' / ')}${At.em ? ` · LCR ${At.em.volumes.csf} / SG ${At.em.volumes.gm} / SB ${At.em.volumes.wm} cm³ · ${esc(At.em.contrast)}` : ' · tissus importés'}</div>`);
      if (G && G.import) out.push(`<div class="muted">import : ${esc(G.import.source)} · ${esc((G.import.files || []).join(', '))}${G.import.unmapped && G.import.unmapped.length ? ` · codes ignorés ${esc(G.import.unmapped.slice(0, 8).join(', '))}` : ''}</div>`);
      const ch = K && K.steps ? K.steps.find(s0 => s0.name === K.chosen) : null;
      if (ch && !ch.ok) out.push(`<div class="note warn">Segmentation à vérifier dans les coupes : ${esc((ch.why || []).join(', '))}${K.steps.length > 1 ? ' — aucune des méthodes essayées n’a passé le contrôle de qualité ; la meilleure est gardée' : ''}. « Autre méthode… » permet d’en essayer une autre ou de comparer.</div>`);
      else if (cv) out.push(cv.unlabeled > 0.06 ? `<div class="note warn">Segmentation incomplète : ${pct(cv.unlabeled)} du tissu cérébral sans étiquette (substance grise : ${pct(cv.grayUnlabeled)}). Vérifiez les contours dans les coupes ; image de qualité limitée ?</div>` : `<div class="muted">tissu cérébral sans étiquette : ${pct(cv.unlabeled)}</div>`);
      if (G && G.age != null && G.age < 18) out.push(`<div class="muted">contrôle de qualité adapté à l’âge : ${esc(G.limits || '')} (${G.age < 2 ? Math.round(12 * G.age) + ' mois' : Math.floor(G.age) + ' ans'} à la date du T1)</div>`);
      return out.join('');
    },
    /** choix de la méthode (sélecteur, rappel du réglage du dossier) */
    _segMethodRow(prefix, exclude) {
      const d = this.dossier, cur = (d.settings && d.settings.segMethod) || 'auto', ids = ['auto', 'net', 'bias', 'smooth', 'atlas', 'compare'].filter(k => k !== exclude), sel = ids.includes(cur) ? cur : ids[0];
      return `<div class="an-meth"><label>Méthode <select id="${prefix}Meth">${ids.map(k => `<option value="${k}"${k === sel ? ' selected' : ''}>${esc(SEG_NAME[k])}</option>`).join('')}</select></label><div class="muted small" id="${prefix}Hint">${esc(SEG_HINT[sel])}</div></div>`;
    },
    _bindSegMethod(prefix) {
      const s = $(prefix + 'Meth'); if (!s) return;
      s.onchange = () => { const h = $(prefix + 'Hint'); if (h) h.textContent = SEG_HINT[s.value] || ''; const d = this.dossier; d.settings = d.settings || {}; if (d.settings.segMethod !== s.value) { d.settings.segMethod = s.value; if (this.scheduleSave) this.scheduleSave(); } };
    },
    /** note d'âge : nourrisson (myélinisation immature), enfant */
    _segAgeNote(ref) {
      const a = ageYears(this.dossier.patient, ref.date); if (a == null || a >= 18) return '';
      if (a < 2) return `<div class="note warn">Nourrisson (${Math.max(0, Math.round(12 * a))} mois à la date du T1) : myélinisation immature, contraste SB / SG faible ou inversé — le réseau, entraîné sur des adultes, échoue souvent. Méthode atlas (essayée en premier par la cascade) ou segmentation importée (Infant FreeSurfer, iBEAT…) recommandées ; vérifiez les coupes.</div>`;
      return `<div class="muted small">Enfant (${Math.floor(a)} ans à la date du T1) : contrôle de qualité adapté à l’âge (volume, proportions) ; en cas d’échec, essayez la méthode atlas ou comparez.</div>`;
    },
    renderAnatomyCard(box) {
      const d = this.dossier, ref = S.refImaging(d), an = d.anatomy, job = this.ui.anatJob, A = this.patientAnat;
      if (!this.anatAvailable()) { box.innerHTML = '<div class="hint">Module d’anatomie absent de cette version.</div>'; return; }
      if (!ref) { box.innerHTML = '<div class="hint">Ajoutez le T1 3D pré-opératoire : l’anatomie du patient (surfaces, parcellation VEP) en est tirée.</div>'; return; }
      if (job) { box.innerHTML = `<div class="note"><b>Calcul en cours</b>${job.mode && job.mode !== 'auto' ? ` · ${esc(SEG_NAME[job.mode] || '')}` : ''} · <span id="anJobMsg">${esc(job.message || '')}</span></div><div class="hint">Segmentation sur le poste (aucune donnée ne sort), puis surfaces. Comptez quelques minutes par méthode ; l’application reste utilisable.</div>`; return; }
      const ctx = this.ui.segCtx, nC = ctx && ctx.refId === ref.id && ctx.dossierId === d.id ? ctx.list.length : 0;
      const cmpB = nC ? `<button id="anCmp" class="mini-btn" title="segmentations calculées pendant cette session pour ce T1 : coupes côte à côte, contrôle de qualité, choix">Résultats calculés (${nC})</button>` : '';
      const impB = `<button id="anImp" class="mini-btn" title="segmentation faite ailleurs, dans l’espace de ce T1 : aparc+aseg ou aseg (FreeSurfer, FastSurfer ; .mgz, .nii), p0 (CAT12), « tissues » (Brainstorm), c1 + c2 + c3 (SPM)">Importer une segmentation…</button>`;
      const bindCommon = () => { const i = $('anImp'); if (i) i.onclick = () => this.pickSegImport(); const c = $('anCmp'); if (c) c.onclick = () => this.openSegChooser(); };
      const stale = an && an.status === 'done' && an.refImagingId !== ref.id;
      if (!an || an.status !== 'done') {
        box.innerHTML = `<div class="hint">Segmentation du T1 de référence (104 structures : cortex de Desikan, noyaux, substance blanche, ventricules), parcellation VEP du patient, surfaces corticales et structures profondes. Tout est calculé sur ce poste et rangé dans le dossier.</div>${this._segAgeNote(ref)}${this._segMethodRow('an')}<div class="btnrow"><button id="anGo" class="primary">Calculer l’anatomie</button>${impB}${cmpB}</div>`;
        this._bindSegMethod('an'); bindCommon();
        $('anGo').onclick = () => this.computeAnatomy({ mode: $('anMeth').value }); return;
      }
      const q = an.qc || {}, fit = an.fit || {}, curM = an.segmentation ? an.segmentation.method : null;
      box.innerHTML = `<div class="an-sum"><div><b>${q.regions || '—'}</b>/162 régions VEP · ${q.structures || 0} structures profondes</div>
          <div class="muted">${(q.vertices || []).map(n => (n / 1000).toFixed(0) + ' k').join(' + ')} sommets · recalage gabarit ${fit.rms ? fit.rms.toFixed(1) + ' mm (' + fit.n + ' structures)' : '—'} · ${an.timings ? fmtS(an.timings.total) : ''}</div>
          <div class="muted">${esc(new Date(an.date).toLocaleDateString(SV.LOC))} · T1 ${esc(an.refLabel || '')}</div>
          ${this.anatQcLine(an)}
          ${q.missing && q.missing.length ? `<div class="note warn">Régions non retrouvées : ${esc(q.missing.slice(0, 6).join(', '))}${q.missing.length > 6 ? '…' : ''} (lésion, résection, ou segmentation à vérifier dans les coupes)</div>` : ''}
          ${stale ? '<div class="note warn">Calculée sur un autre T1 que la référence actuelle : à recalculer.</div>' : ''}
          ${!A ? '<div class="note warn">Fichiers dérivés absents ou illisibles (archive incomplète ?) : recalculez.</div>' : ''}</div>
        <div class="btnrow"><button id="anShow" class="primary"${A ? '' : ' disabled'}>Voir en 3D</button><button id="anSlices"${A ? '' : ' disabled'} title="parcellation VEP du patient dans les coupes">Coupes VEP</button><button id="anSeg" class="mini-btn"${A ? '' : ' disabled'} title="segmentation aparc+aseg dans les coupes">aparc+aseg</button><span class="spacer"></span><button id="anGii" class="mini-btn"${A ? '' : ' disabled'} title="surfaces piales (GIfTI, coordonnées du T1) pour Brainstorm, 3D Slicer, FreeSurfer…">GIfTI</button><button id="anOther" class="mini-btn" title="essayer une autre méthode de segmentation, comparer, importer">Autre méthode…</button></div>
        <div id="anOtherBox" class="an-other"${this.ui.anOther ? '' : ' hidden'}>${this._segAgeNote(ref)}${this._segMethodRow('anO', curM === 'import' ? null : curM)}<div class="btnrow"><button id="anOGo" class="primary">Calculer avec cette méthode</button>${impB}${cmpB}<span class="spacer"></span><button id="anRedo" class="mini-btn" title="refaire la segmentation retenue (même méthode)">recalculer</button></div></div>`;
      $('anOther').onclick = () => { this.ui.anOther = !this.ui.anOther; $('anOtherBox').hidden = !this.ui.anOther; };
      this._bindSegMethod('anO'); bindCommon();
      $('anOGo').onclick = () => { const m = $('anOMeth').value; if (m === 'compare' || confirm(`Recalculer l’anatomie avec la méthode « ${SEG_NAME[m]} » ? (quelques minutes ; l’anatomie actuelle est remplacée à la fin)`)) this.computeAnatomy({ mode: m }); };
      $('anRedo').onclick = () => { if (confirm('Recalculer l’anatomie du patient ? (quelques minutes)')) this.computeAnatomy({ mode: curM && curM !== 'import' ? curM : 'auto', force: true }); };
      if (A) {
        $('anShow').onclick = () => { this.setAnatomy('patient'); this.showScreen && this.showScreen(null); };
        $('anSlices').onclick = () => { this.slvState().labels = 'vep'; this.renderSliceView(); };
        $('anSeg').onclick = () => { this.slvState().labels = 'seg'; this.renderSliceView(); };
        $('anGii').onclick = () => this.exportSurfacesGifti();
      }
    },
    /** surfaces piales en GIfTI, ramenées dans le monde du T1 (+ étiquettes VEP par sommet), téléchargées et rangées dans derivatives/anat */
    async exportSurfacesGifti() {
      const A = this.patientAnat, d = this.dossier; if (!A || !SV.Mesh.toGifti) return;
      const base = DIR + 'sub-' + subLabel(d), Di = A.fromDisplay;
      for (const [h, H] of [['L', A.atlas.hemis.lh], ['R', A.atlas.hemis.rh]]) {
        const P = new Float32Array(H.pial.length); for (let i = 0; i < P.length; i += 3) { const q = M4.apply(Di, H.pial[i], H.pial[i + 1], H.pial[i + 2]); P[i] = q[0]; P[i + 1] = q[1]; P[i + 2] = q[2]; }
        const g = await SV.Mesh.toGifti({ pos: P, faces: H.faces }, { kind: 'surface' }), name = `${base}_hemi-${h}_pial.surf.gii`;
        await L.writeFile(d, name, g); this.download(name.split('/').pop(), g, 'application/xml');
        try { const gl = await SV.Mesh.toGifti({ pos: P, faces: H.faces }, { kind: 'label', labels: Int32Array.from(H.labels), labelTable: this.atlas.regions.map(r => ({ key: r.index, name: r.name, color: r.color })) }); const ln = `${base}_hemi-${h}_atlas-VEP_dseg.label.gii`; await L.writeFile(d, ln, gl); this.download(ln.split('/').pop(), gl, 'application/xml'); } catch (e) { console.warn('GIfTI étiquettes', e); }
      }
      this.toast('Surfaces GIfTI (espace du T1) enregistrées dans le dossier et téléchargées', 4000);
    },

    // ================================================================ coupes de l'IRM dans la vue 3D (fusion modèle ↔ imagerie)
    slices3dShown() { return !!(this.viewer && this.viewer.cells && this.viewer.cells.some(c => c.cfg.slices3d || c.cfg.clip)); },
    /** curseur des coupes 3D (espace de la vue) ; sync : recopié dans les coupes de l'écran Imagerie (monde) */
    setSlices3dCursor(pView, sync) {
      if (!this.viewer || !this.viewer.setSliceCursor) return; this._sl3Cursor = pView.slice(); this.viewer.setSliceCursor(pView);
      if (sync && this.slices) { const w = this.viewToSlv(pView); if (w) this.slices.setCursor(w, true); }
    },
    /** source des coupes 3D — anatomie du patient : son T1 de référence (+ superpositions et étiquettes de la visionneuse en
     *  coupes) dans l'espace d'affichage ; gabarit (v5.1) : T1 MNI ICBM152 et parcellation VEP du gabarit, sans T1 ni
     *  anatomie du patient */
    async updateSlices3d(explicit) {
      const V = this.viewer; if (!V || !V.setSliceSource) return;
      const d = this.dossier, ref = d && S.refImaging(d), A = this.patientAnat;
      if (!this.slices3dShown()) { V.setSliceSource(null); return; }
      this._winCache = this._winCache || new Map();
      const win = vol => { let w = this._winCache.get(vol); if (!w) { const q = SV.Vol.quantiles(vol, [0.02, 0.995]); w = [q[0], q[1]]; this._winCache.set(vol, w); } return w; };
      const sv = this.slvState && d ? this.slvState() : (this.ui.slv || {});
      if (this.anatMode !== 'patient' || !A) {
        try {
          const T = await this.tplVolumes(), I = M4.identity(), src = { base: { id: 'base', vol: T.t1, T: I, win: win(T.t1) }, overlays: [], fov: 230 };
          const lab = sv.labels && sv.labels !== 'none' && sv.labels !== 'seg' ? this.sliceLabelLayer(sv.labels, 'tpl') : null;
          if (lab && lab.lut) src.labels = { vol: lab.vol, T: I, color: l => lab.lut.get(l) || null, opacity: sv.labOpacity == null ? 0.45 : sv.labOpacity };
          V.setSliceSource(src);
          const cur = this.slices && this.slices.cursor ? this.slvToView(this.slices.cursor) : null;
          if (!this._sl3Cursor || explicit) this.setSlices3dCursor(cur || [0, -18, 12]); else V.setSliceCursor(this._sl3Cursor);
        } catch (e) { console.warn('coupes 3D', e); V.setSliceSource(null); if (explicit) this.toast('Coupes IRM : ' + e.message, 4000); }
        return;
      }
      if (!ref) { V.setSliceSource(null); return; }
      try {
        const toView = A.toDisplay, base = await this.imagingVolume(ref);
        // mêmes calques que la visionneuse en coupes : image de base, superpositions visibles (dans l'ordre), fenêtres réglées
        const reg = im => im === ref || !!(im.coreg && im.coreg.T), Tof = im => im === ref ? toView : M4.mul(toView, M4.from(im.coreg.T));
        const bIm = (sv.base && S.byId(d.imaging, sv.base)) || ref, baseIm = reg(bIm) ? bIm : ref, bvol = baseIm === ref ? base : await this.imagingVolume(baseIm);
        const src = { base: { id: 'base', vol: bvol, T: Tof(baseIm), win: (baseIm === bIm && sv.baseWin) || win(bvol) }, overlays: [], fov: 230 };
        for (const o of sv.overlays || []) {
          const im = S.byId(d.imaging, o.id); if (!im || o.on === false || im === baseIm || !reg(im)) continue;
          const vol = await this.imagingVolume(im), ct = im.modality === 'CT';
          const D0 = im.derived || {}; src.overlays.push({ id: o.id, vol, T: Tof(im), kind: o.kind || (this.imagingKind ? this.imagingKind(im) : ct ? 'hot' : 'cool'), win: o.win || (ct ? [500, 3000] : D0.win ? D0.win.slice() : win(vol)), threshold: ct ? (o.threshold == null ? 500 : o.threshold) : D0.thr != null ? D0.thr : null, opacity: o.opacity == null ? (D0.cmap ? 0.8 : 0.5) : o.opacity });
        }
        const lab = sv.labels && sv.labels !== 'none' ? this.sliceLabelLayer(sv.labels, 'pat') : null;
        if (lab && lab.lut) src.labels = { vol: lab.vol, T: toView, color: l => lab.lut.get(l) || null, opacity: sv.labOpacity == null ? 0.45 : sv.labOpacity };
        V.setSliceSource(src);
        const cur = this.slices && this.slices.cursor ? this.slvToView(this.slices.cursor) : null;
        if (!this._sl3Cursor || explicit) this.setSlices3dCursor(cur || M4.apply(toView, ...(A.center || [0, 0, 0])));
        else V.setSliceCursor(this._sl3Cursor);
        if (explicit && V.activeCfg && V.activeCfg.inflate > 0.05) this.toast('Coupes IRM : à lire sur la surface piale (gonflement à 0)', 3500);
      } catch (e) { console.warn('coupes 3D', e); this.toast('Coupes IRM : ' + e.message, 4000); }
    },

    // ================================================================ couches d'étiquettes des coupes
    _vepLut(alpha) {
      const lut = new Map(); for (const r of this.atlas.regions) if (r.index && r.color) lut.set(r.index, [r.color[0], r.color[1], r.color[2], alpha == null ? 1 : alpha]); return lut;
    },
    /** space : 'tpl' (gabarit MNI : parcellation VEP du gabarit) ou 'pat' ; par défaut celui des coupes */
    sliceLabelLayer(kind, space) {
      const A = this.patientAnat, vv = this.vepVolFor(space), label = v => v >= 1 && v <= 162 ? this.atlas.label(v) : v === 200 ? 'substance blanche' : v === 201 ? 'LCR' : 'autre';
      if (kind === 'vep' && vv) return { id: 'lab', name: 'VEP', vol: vv, kind: 'labels', lut: this._vepLut(), names: label };
      if (kind === 'seg' && A && A.segVol && (space || this.slvSpace()) !== 'tpl') {
        const cols = A.meta.colors, names = A.meta.names || [], lut = new Map(); if (cols) cols.forEach((c, i) => { if (i) lut.set(i, [c[0], c[1], c[2], 1]); });
        return { id: 'lab', name: 'aparc+aseg', vol: A.segVol, kind: 'labels', lut: cols ? lut : null, names: v => names[v] || v };
      }
      if (kind === 'act' && vv && this.result) {
        const act = this.activationAt(this.ui.t || 0, 'global'), lut = new Map();
        for (let i = 1; i < act.length; i++) if (act[i] >= 0.08) { const c = SV.colorRamp ? SV.colorRamp(act[i]) : [255, Math.round(220 * (1 - act[i])), 40]; lut.set(i, [c[0], c[1], c[2], Math.min(1, 0.35 + act[i])]); }
        return { id: 'lab', name: 'activation', vol: vv, kind: 'labels', lut, names: v => label(v) + (act[v] != null && v <= 162 ? ' · ' + act[v].toFixed(2) : '') };
      }
      // v5.2 : intervention (proposée ou réalisée) — mêmes couleurs que ses vues 3D : résection, partielle, ZE comprise, ZE hors résection
      if (kind === 'surg' && vv && this._slvSurg && this.surgeryPaint) {
        const G = this._slvSurg, lut = new Map(); for (const [r, c] of this.surgeryPaint(G.regions || [], G.extent || {}, G.hyps || [])) lut.set(r, [c[0], c[1], c[2], 1]);
        return lut.size ? { id: 'lab', name: 'intervention', vol: vv, kind: 'labels', lut, names: label } : null;
      }
      if (kind === 'lesion' && vv) {
        const regs = new Set(S.lesionRegions ? S.lesionRegions(this.dossier) : []), lut = new Map(); for (const r of regs) lut.set(r, [255, 70, 200, 1]);
        return regs.size ? { id: 'lab', name: 'lésion', vol: vv, kind: 'labels', lut, names: label } : null;
      }
      return null;
    },
  };
  Object.assign(SV.app, M);
  SV.AnatUI = { asset };
})(window.SV = window.SV || {});
