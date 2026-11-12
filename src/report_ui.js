/* EpiScope — report_ui.js : rapport du dossier patient et compte rendu de staff.
 *
 * Bouton « Rapport » : une fenêtre demande ce qu'il faut inclure — la crise ouverte seule, ou le dossier : patient,
 * chronologie, chaque exploration (phase 1, SEEG…) avec la synthèse de ses crises, chaque crise (sélection), le schéma
 * d'implantation (proposé, prévu ou réel), les données SEEG (stimulations, thermocoagulations, quantifications), les
 * staffs, la chirurgie et le devenir ; vues 3D ou non, dynamique à chaque signe ou non.
 * Ordre logique : patient → chronologie → explorations dans l'ordre du parcours (synthèse des crises, crises,
 * implantation, SEEG) chacune suivie des staffs qui l'ont discutée → chirurgie et devenir.
 * Compte rendu de staff : même rapport, limité aux explorations prises en compte par le staff, précédé de la
 * conclusion et des décisions, suivi du staff complet (concordance, hypothèses, décisions et leurs vues).
 * Chaque crise est rejouée dans l'espace de travail (modèle, vues), puis le contexte de départ est restauré ; rien
 * n'est réécrit dans le dossier pendant la génération.                                                              */
(function (SV) {
  'use strict';
  const $ = id => document.getElementById(id), S = SV.Store, V = S.V, R = SV.Report;
  const esc = SV.U.esc;
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const fmtDate = s => { if (!s) return ''; const d = new Date(String(s).length <= 10 ? s + 'T12:00:00' : s); return isNaN(d) ? String(s) : d.toLocaleDateString(SV.LOC); };
  const fmtDT = s => { if (!s) return ''; const d = new Date(String(s).length <= 10 ? s + 'T12:00:00' : s); return isNaN(d) ? String(s) : String(s).length > 10 && !/T00:00/.test(s) ? d.toLocaleString(SV.LOC, { dateStyle: 'short', timeStyle: 'short' }) : d.toLocaleDateString(SV.LOC); };
  const SHOT = { scale: 2, crop: true }, SHOT_LIGHT = { scale: 1.6, crop: true };   // rapport de dossier : images ×2 (taille du fichier)
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const SYSTEMS = ['mesial_temporal', 'lateral_temporal', 'basal_temporal', 'insulo_opercular', 'orbitofrontal', 'prefrontal_mesial', 'prefrontal_lateral', 'premotor', 'central', 'parietal_lateral', 'posterior_medial', 'occipital'];
  const SYS_FR = { mesial_temporal: 'temporal mésial', lateral_temporal: 'temporal latéral', basal_temporal: 'temporal basal', insulo_opercular: 'insulo-operculaire', central: 'central (rolandique)', premotor: 'prémoteur / AMS', prefrontal_lateral: 'préfrontal latéral', prefrontal_mesial: 'préfrontal mésial / cingulaire ant.', orbitofrontal: 'orbitofrontal', posterior_medial: 'pariétal médian / cingulaire post.', parietal_lateral: 'pariétal latéral', occipital: 'occipital' };
  const LV_SCORE = { '++': 2, '+': 1, '0': 0, '−': -1, '?': 0, '': 0 };

  const M = {
    /** l'exploration a-t-elle un compte rendu rédigé (EEG de scalp, ou intercritique / synthèse SEEG) ? */
    exCrAvailable(ex) {
      if (ex.kind === 'seeg') { const I = ex.inter || {}, R0 = ex.report || {}; return !!(I.wake || I.sleep || I.slow || I.physiological || (I.spikes || []).length || (R0.ezRegions || []).length || (R0.propRegions || []).length || Object.entries(R0).some(([k, v]) => k !== 'proposal' && typeof v === 'string' && v.trim())); }
      return !!(SV.EegCR && SV.EegCR.crHTML(ex));
    },
    // ================================================================ fenêtre de choix
    /** preset : { staff: meeting } pour le compte rendu de staff */
    reportDialog(preset) {
      const d = this.dossier;
      if (!d) { this.report(); return; }
      preset = preset || {}; const m = preset.staff || null;
      const exs = S.explorationsSorted(d), ms = d.meetings.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const scopeIds = m && this.staffScope ? this.staffScope(m).ids : preset.exploration ? [preset.exploration.id] : exs.map(e => e.id);
      const cur = this.ctx && this.ctx.seizureId ? S.byId(d.seizures, this.ctx.seizureId) : null;
      const box = h('div', 'modal'), card = h('div', 'modal-card report-dlg');
      const exRow = ex => {
        const szs = S.seizuresOfExploration(d, ex.id).filter(z => z.events.length), on = scopeIds.includes(ex.id), it = S.implantations(d).find(x => x.ex === ex);
        const hasSeeg = ex.stims.length || ex.thermo.length || ex.quant.length;
        return `<div class="rd-ex" data-ex="${ex.id}"><label class="rd-h"><input type="checkbox" data-k="ex"${on ? ' checked' : ''}> <b>${esc(ex.label)}</b> <span class="muted">${esc(V.exploration[ex.kind])} · ${fmtDate(ex.start)}${ex.end ? ' → ' + fmtDate(ex.end) : ''} · ${szs.length} crise${szs.length > 1 ? 's' : ''}</span></label>
          <div class="rd-sub">${szs.length > 1 ? `<label><input type="checkbox" data-k="synth"${on ? ' checked' : ''}> synthèse des crises</label>` : ''}
            ${szs.length ? `<div class="rd-szs"><span class="muted">crises :</span> ${szs.map(z => `<label class="chip"><input type="checkbox" data-sz="${z.id}"${on ? ' checked' : ''}> ${esc(z.label)}${z.habitual === 'yes' ? ' <i>hab.</i>' : ''}</label>`).join('')} <a href="#" data-a="hab">habituelles seules</a> · <a href="#" data-a="all">toutes</a></div>` : ''}
            ${this.exCrAvailable(ex) ? `<label><input type="checkbox" data-k="cr"${on ? ' checked' : ''}> compte rendu ${ex.kind === 'seeg' ? 'SEEG (intercritique, synthèse et conclusion)' : 'EEG (onglet « EEG »)'}</label>` : ''}
            ${it ? `<label><input type="checkbox" data-k="implant"${on ? ' checked' : ''}> ${esc(V.implantStatus[it.status])} (${it.n} électrode${it.n > 1 ? 's' : ''})</label>` : ''}
            ${(ex.esi || []).length ? `<label><input type="checkbox" data-k="esi"${on ? ' checked' : ''}> imagerie de source (${ex.esi.length} résultat${ex.esi.length > 1 ? 's' : ''} : pointes après l’intercritique, début de crise après chaque crise)</label>` : ''}
            ${hasSeeg ? `<label><input type="checkbox" data-k="seeg"${on ? ' checked' : ''}> SEEG : ${ex.stims.length} stimulation${ex.stims.length > 1 ? 's' : ''}, ${ex.thermo.length} thermocoagulation${ex.thermo.length > 1 ? 's' : ''}, ${ex.quant.length} quantification${ex.quant.length > 1 ? 's' : ''}</label>` : ''}</div></div>`;
      };
      card.innerHTML = `<div class="modal-head"><span>${m ? 'Compte rendu du staff du ' + fmtDate(m.date) : 'Rapport'} — ${esc(d.patient.pseudo)}</span><button class="close">✕</button></div>
        <div class="help rd-body">
          ${!m ? `<label class="rd-scope"><input type="radio" name="rdscope" value="seizure"${cur ? '' : ' disabled'}> <b>Crise ouverte seule</b> <span class="muted">${cur ? esc(S.contextOf(d, cur.id).exploration.label + ' · ' + cur.label) : '(aucune crise ouverte)'}</span></label>
          <label class="rd-scope"><input type="radio" name="rdscope" value="dossier" checked> <b>Dossier du patient</b> <span class="muted">choisissez le contenu :</span></label>` : `<div class="hint">Le compte rendu reprend les rapports des explorations discutées (crises, synthèse, implantation, SEEG), puis le staff : concordance, hypothèses, décisions et conclusion.</div>`}
          <div class="rd-tree">
            <label><input type="checkbox" data-g="patient" checked> Patient : histoire, lésions, imagerie</label>
            ${!m ? '<label><input type="checkbox" data-g="chrono" checked> Chronologie du parcours</label>' : ''}
            ${exs.map(exRow).join('') || '<div class="hint">Aucune exploration.</div>'}
            ${ms.length ? `<div class="rd-ex"><span class="rd-h"><b>Staffs</b></span><div class="rd-sub">${ms.map(x => `<label class="chip"><input type="checkbox" data-mt="${x.id}"${!m || x.id === m.id ? ' checked' : ''}> ${fmtDate(x.date)} · ${esc(V.meeting[x.kind])}</label>`).join('')}</div></div>` : ''}
            ${d.procedures.length || d.outcomes.length ? `<label><input type="checkbox" data-g="surgery"${!m || m.kind === 'post_surgery' ? ' checked' : ''}> Chirurgie et devenir (${d.procedures.length} procédure${d.procedures.length > 1 ? 's' : ''}, ${d.outcomes.length} suivi${d.outcomes.length > 1 ? 's' : ''})</label>` : ''}
          </div>
          <div class="rd-opts"><b>Images</b> <label><input type="checkbox" data-o="images" checked> vues 3D (réseaux des hypothèses, implantation, SEEG, chirurgie)</label> <label title="une vue latérale et médiale après chaque signe : rapport plus long à produire et plus lourd"><input type="checkbox" data-o="dynamics"> dynamique à chaque signe</label> <label><input type="checkbox" data-o="params"> paramètres du modèle</label></div>
        </div><div class="modal-foot"><button class="primary ok">Générer le rapport</button><button class="cancel">Annuler</button></div>`;
      const close = () => box.remove();
      card.querySelector('.close').onclick = card.querySelector('.cancel').onclick = close;
      const tree = card.querySelector('.rd-tree'), syncScope = () => { const sc = (card.querySelector('input[name=rdscope]:checked') || {}).value || 'dossier'; tree.classList.toggle('off', sc === 'seizure'); };
      card.querySelectorAll('input[name=rdscope]').forEach(r => r.onchange = syncScope); syncScope();
      card.querySelectorAll('.rd-ex[data-ex]').forEach(row => {
        const main = row.querySelector('[data-k=ex]'), subs = () => row.querySelectorAll('.rd-sub input');
        main.onchange = () => subs().forEach(x => { x.checked = main.checked; });
        subs().forEach(x => x.addEventListener('change', () => { if (x.checked) main.checked = true; }));
        row.querySelectorAll('[data-a]').forEach(a => a.onclick = e => { e.preventDefault(); row.querySelectorAll('[data-sz]').forEach(c => { const z = S.byId(d.seizures, c.dataset.sz); c.checked = a.dataset.a === 'all' || (z && z.habitual === 'yes'); }); main.checked = true; });
      });
      card.querySelector('.modal-foot .ok').onclick = () => {
        const sc = m ? 'dossier' : (card.querySelector('input[name=rdscope]:checked') || {}).value;
        const g = k => { const x = card.querySelector(`[data-g=${k}]`); return !!(x && x.checked); }, o = k => !!card.querySelector(`[data-o=${k}]`).checked;
        const opts = { staff: m, patient: g('patient'), chrono: g('chrono'), surgery: g('surgery'), images: o('images'), dynamics: o('dynamics'), params: o('params'), ex: {}, meetings: [...card.querySelectorAll('[data-mt]')].filter(x => x.checked).map(x => x.dataset.mt) };
        card.querySelectorAll('.rd-ex[data-ex]').forEach(row => { const q = k => { const x = row.querySelector(`[data-k=${k}]`); return !!(x && x.checked); }; if (!q('ex')) return; opts.ex[row.dataset.ex] = { synth: q('synth'), cr: q('cr'), esi: q('esi'), implant: q('implant'), seeg: q('seeg'), seizures: [...row.querySelectorAll('[data-sz]')].filter(x => x.checked).map(x => x.dataset.sz) }; });
        close();
        if (sc === 'seizure') this.report(); else this.dossierReport(opts);
      };
      box.appendChild(card); document.body.appendChild(box); box.hidden = false;
    },

    // ================================================================ collecte (espace de travail rejoué)
    /** vues d'une crise chargée dans l'espace de travail : dynamique (option), réseau de chaque hypothèse, frise */
    async captureSeizureViews(o) {
      o = Object.assign({ images: true, dynamics: true, shot: SHOT }, o || {});
      const V3 = this.viewer, snaps = [], hypViews = [], r = this.result, sh = o.shot;
      if (o.images && r) {
        V3.setLayout('single');
        if (o.dynamics) {
          V3.setCellConfig(0, { inflate: 0, opacity: 1, sub: true, fibers: false, nodes: false, sync: false, netLabels: false, electrodes: false, thermo: false, stims: false, ccep: false, quant: null, neutral: false, tilt: 0, frontGlass: true, subFilter: 'all', subOpacity: 0.95, subHemi: 'both', subFams: null, hyps: [], paint: null, rois: false, zones: null, probe: false }, true);
          const fav = r.lateralization.pL >= 0.5 ? 'L' : 'R';
          const ictal = this.state.events.filter(e => (this.db.signById.get(e.sign_id) || {}).category !== 'postictal').sort((a, b) => a.t - b.t).slice(0, 8);
          const shots = async t => { this.setTime(t); const imgs = []; for (const v of [fav === 'L' ? 'latL' : 'latR', fav === 'L' ? 'medL' : 'medR']) { V3.setView(v, false); await wait(120); imgs.push(V3.snapshot(Object.assign({ format: 'jpeg', quality: 0.88 }, sh))); } return imgs; };
          for (const ev of ictal) snaps.push({ title: `${SV.fmtT(ev.t)} — ${this.db.signById.get(ev.sign_id).label_fr}`, imgs: await shots(ev.t + 0.5) });
          if (ictal.length) snaps.push({ title: 'Fin de séquence', imgs: await shots(r.tmax - 2) });
        }
        for (const Hy of r.hypotheses.slice(0, o.nHyp || 4)) {
          this.ensureHypLayer(Hy.index);
          V3.setCellConfig(0, { hyps: ['h' + Hy.index], opacity: 0.3, sub: true, fibers: true, nodes: true, sync: true, netLabels: true, electrodes: false, inflate: 0, thermo: false, stims: false, ccep: false, quant: null, neutral: false, tilt: 0, frontGlass: true, subFilter: 'all', subOpacity: 0.95, subHemi: 'both', subFams: null, paint: null, rois: false, zones: null, probe: false }, true);
          const tH = Math.min(r.tmax, Hy.trajectory[Hy.trajectory.length - 1].t + 2); this.setTime(tH);
          const imgs = []; for (const v of [Hy.hemi === 'L' ? 'latL' : 'latR', Hy.hemi === 'L' ? 'medL' : 'medR']) { V3.setView(v, false); await wait(150); imgs.push(V3.snapshot(Object.assign({ format: 'jpeg', quality: 0.9 }, sh))); }
          hypViews.push({ index: Hy.index, name: Hy.name, hemi: Hy.hemi, color: SV.hypCss(Hy.index), t: tH, origin: this.atlas.label(Hy.origin), imgs });
        }
        V3.setCellConfig(0, { hyps: [] }, true);
      }
      // frise rendue hors écran à largeur fixe
      const off = document.createElement('div'); off.style.cssText = 'position:absolute;left:-10000px;top:0;width:1000px;height:auto;overflow:visible'; document.body.appendChild(off);
      const tlr = new SV.Timeline(off, {}); tlr.setData(this.tl.events, this.tl.opts); tlr.setTime(this.ui.t); tlr.render();
      const svg = tlr.svg.cloneNode(true), tlH = +tlr.svg.getAttribute('height') || 200; if (tlr._ro) tlr._ro.disconnect(); off.remove();
      svg.setAttribute('viewBox', `0 0 1000 ${tlH}`); svg.setAttribute('width', '100%'); svg.removeAttribute('height'); svg.style.height = 'auto';
      return { snaps, hypViews, svg: svg.outerHTML };
    },
    /** tableau des électrodes ouvertes (rapport) */
    electrodeRows() {
      return this.elecs.map(e => { const spec = (this.state.electrodes || []).find(s => s.id === e.id) || {}; return { name: e.name, fr: (this.elecDesc ? this.elecDesc(e) : e.fr) || e.code, model: e.model, n: e.nContacts, length: e.length, contacts: SV.Electrodes.contactSummary(e, this.atlas), tests: this.result && this.result.hypotheses.length ? this.electrodeTests(e).join(', ') : '', issues: (e.issues || []).map(i => i.text).join(' ; '), target: e.target, entry: e.entry, real: !!spec.real, origin: spec.origin && spec.origin.label ? 'origine : ' + spec.origin.label : '' }; });
    },
    brandHead() { const logoEl = document.querySelector('#splash img'), B = this.brand(); return { brand: B, logo: logoEl && /^data:/.test(logoEl.src) ? logoEl.src : null, font: this.brandFont || null, serif: this.serifFont || null }; },
    /** charge un contexte du dossier sans rien réécrire (génération du rapport) */
    loadForReport(ctx) { this.ctx = null; this.openContext(ctx, true); clearTimeout(this._ct); this.compute(); },

    // ================================================================ rapport du dossier
    async dossierReport(opts) {
      const d = this.dossier; if (!d || this._reportBusy) return;
      const job = this.jobStart ? this.jobStart(opts.staff ? 'Compte rendu de staff' : 'Rapport du dossier') : { progress() {}, done() {}, fail() {} };
      const orig = this.ctx ? Object.assign({}, this.ctx) : null, screen = this.ui.screen, anat = this.anatMode, loc0 = this.loc ? Object.assign({}, this.loc) : null;
      const restoreV = { layout: this.viewer.layoutName, active: this.viewer.active, cfgs: this.viewer.cells.map(c => Object.assign({}, c.cfg, { hyps: c.cfg.hyps.slice() })) };
      if (this.ctx) this.persistWorkspace(); await this.flushSave();
      this._reportBusy = true; const sh = opts.images ? SHOT : null;
      let html = '';
      try {
        html = await this.viewerTask(async () => {
          const toc = [], body = [], A = this.atlas, exs = S.explorationsSorted(d), m = opts.staff;
          const shownIds = new Set(m && this.presentGalleryList ? this.presentGalleryList(m, this.staffScope(m)).map(g => g.id) : []);
          const lesCaps = new Set((d.lesions || []).flatMap(l => l.galleryIds || []));
          await this.reportPrepCaps(d, g => g.examId || shownIds.has(g.id) || lesCaps.has(g.id));
          if (opts.patient) { job.progress(0.01, 'ROI annotées : coupes T1 / FLAIR'); await this.reportPrepRois(d); }
          const anchor = (id, txt, lv) => { toc.push({ id, txt, lv }); return `id="${id}"`; };
          const nSz = Object.values(opts.ex).reduce((s, x) => s + x.seizures.length, 0); let kSz = 0;
          // ---- staff : conclusion et décisions en tête
          if (m) body.push(this.reportStaffCallout(m));
          if (opts.patient) body.push(`<h2 ${anchor('patient', 'Patient')}>Patient</h2>` + this.reportPatient(d));
          if (opts.chrono) body.push(`<h2 ${anchor('chrono', 'Chronologie du parcours')}>Chronologie du parcours</h2>` + this.reportChrono(d));
          // staffs rattachés aux explorations : après la dernière exploration commencée avant le staff
          const meetings = d.meetings.filter(x => opts.meetings.includes(x.id) && (!m || x.id !== m.id)).sort((a, b) => String(a.date).localeCompare(String(b.date)));
          const meetAfter = ex => { const i = exs.indexOf(ex), next = exs[i + 1]; return meetings.filter(x => (!ex.start || String(x.date) >= String(ex.start)) && (!next || !next.start || String(x.date) < String(next.start))); };
          const early = meetings.filter(x => !exs.some(ex => !ex.start || String(x.date) >= String(ex.start)));
          for (const x of early) body.push(await this.reportMeetingSection(x, opts, anchor, 2));
          for (const ex of exs) {
            const eo = opts.ex[ex.id];
            if (eo) {
              let part = `<h2 class="pb" ${anchor('ex_' + ex.id, ex.label)}><span class="exband">${String(ex.label).toLowerCase().startsWith(V.explorationShort[ex.kind].toLowerCase()) ? '' : `<span class="k ${ex.kind}">${esc(V.explorationShort[ex.kind])}</span>`}${esc(ex.label)} <span class="m" style="font-size:12px;font-weight:400">${fmtDate(ex.start)}${ex.end ? ' → ' + fmtDate(ex.end) : ''}${ex.center ? ' · ' + esc(ex.center) : ''}</span></span></h2>`;
              const szs = S.seizuresOfExploration(d, ex.id).filter(z => z.events.length && eo.seizures.includes(z.id));
              part += this.reportSessions(ex);
              // imagerie de source : pointes après l'analyse visuelle de l'intercritique, début de crise après chaque crise (ou à la
              // synthèse s'il n'est pas rattaché à l'une des crises du rapport)
              const ES = eo.esi && this.esiReportHtml ? this.esiKept(ex.esi || []) : [], esiHtml = (L, t, lv) => L.length ? this.esiReportHtml(L, { images: opts.images, base: ex.label, title: t, lv }) : '';
              if (ES.length) { this.loadForReport({ explorationId: ex.id }); await wait(30); }
              const esiSp = await esiHtml(ES.filter(r => r.kind === 'spike'), 'Pointes intercritiques : types et sources', 4), szIn = new Set(szs.map(z => z.id)), esiAgg = await esiHtml(ES.filter(r => r.kind !== 'spike' && !szIn.has(r.seizureId)), 'Début des crises : sources' + (szs.length > 1 ? ' (ensemble des crises)' : ''), 4);
              let spDone = !esiSp;
              if (eo.cr && ex.kind !== 'seeg' && SV.EegCR) { const c = SV.EegCR.crHTML(ex, { afterInter: esiSp }); if (c) { part += `<h3 ${anchor('eeg_' + ex.id, 'Compte rendu EEG', 3)}>Compte rendu EEG</h3>` + c; spDone = true; } }
              if (!spDone && ex.kind !== 'seeg') { part += `<h3 ${anchor('esisp_' + ex.id, 'Imagerie de source intercritique', 3)}>Imagerie de source intercritique</h3>` + esiSp; spDone = true; }
              for (const sz of szs) {
                job.progress((kSz++) / Math.max(1, nSz) * 0.85, `${ex.label} · ${sz.label}`);
                this.loadForReport({ seizureId: sz.id }); await wait(30);
                const cap = await this.captureSeizureViews({ images: opts.images, dynamics: opts.dynamics, shot: sh || SHOT, nHyp: 2 });
                const il = S.ilaeText(S.deriveIlae(sz, this.db));
                part += `<div class="szband" ${anchor('sz_' + sz.id, sz.label, 3)}><b>${esc(sz.label)}</b><span class="m">${esc(fmtDT(sz.datetime))}</span>${sz.habitual === 'yes' ? '<span class="chip">habituelle</span>' : sz.habitual === 'no' ? '<span class="chip">non habituelle</span>' : ''}${il ? `<span class="chip">ILAE 2025 : ${esc(il)}</span>` : ''}${sz.vigilance ? `<span class="chip">${esc(V.vigilance[sz.vigilance])}</span>` : ''}${sz.eeg_onset != null ? `<span class="chip">début EEG ${SV.fmtT(sz.eeg_onset)}</span>` : ''}</div>${sz.notes ? `<p>${esc(sz.notes)}</p>` : ''}`;
                part += R.seizure({ caseName: sz.label, patient: this.state.patient, events: this.state.events, db: this.db, atlas: A, result: this.result, snapshots: cap.snaps, timelineSVG: cap.svg, hypothesisViews: cap.hypViews, hypColor: i => SV.hypCss(i) }, { lv: 4, targets: false, dynamics: opts.dynamics, hypViews: opts.images, nCand: 6, hypTitle: 'Hypothèses du réseau épileptogène de la ' + String(sz.label).replace(/^Crise/, 'crise') });
                const ESz = ES.filter(r => r.kind !== 'spike' && r.seizureId === sz.id); if (ESz.length) { this.loadForReport({ explorationId: ex.id }); await wait(30); part += await esiHtml(ESz, 'Début de la crise : sources', 4); }
              }
              // synthèse des crises : après le détail de chaque crise
              if (eo.synth && szs.length > 1) {
                job.progress(Math.min(0.9, kSz / Math.max(1, nSz) * 0.85), `${ex.label} · synthèse des crises`);
                const cons = this.consensus({ seizures: szs.map(sz => ({ sz, ex })) }), SR = opts.images && this.synthShots ? await this.synthShots(cons, { nHyp: 3, shot: Object.assign({ format: 'jpeg', quality: 0.88 }, sh || SHOT) }) : null;
                part += `<h3 ${anchor('syn_' + ex.id, 'Synthèse des crises', 3)}>Synthèse des crises</h3>` + this.reportSynthesis(ex, szs, cons, SR);
              }
              if (esiAgg) part += (eo.synth && szs.length > 1 ? '' : `<h3 ${anchor('esisz_' + ex.id, 'Imagerie de source critique', 3)}>Imagerie de source critique</h3>`) + esiAgg;
              if (eo.implant || eo.seeg) {
                job.progress(Math.min(0.9, kSz / Math.max(1, nSz) * 0.85 + 0.02), `${ex.label} · implantation`);
                this.loadForReport({ explorationId: ex.id }); await wait(30);
                const it = S.implantations(d).find(x => x.ex === ex), src = ex.implant && ex.implant.source;
                if (eo.implant && this.elecs.length) {
                  const imgs = opts.images && this.seegShots ? await this.seegShots({}, sh, 'implantation_' + ex.label) : [];
                  const st = it ? it.status : 'proposed', tit = { proposed: 'Schéma d’implantation proposé', planned: 'Implantation prévue', real: 'Implantation réelle' }[st];
                  part += `<div ${anchor('impl_' + ex.id, tit, 3)}></div>` + R.implantation({ caseName: ex.label, electrodes: this.electrodeRows(), implantation: imgs }, { lv: 3, title: tit + (it ? ` — ${it.status === 'real' ? it.nReal + '/' + it.n + ' électrodes localisées' : it.n + ' électrodes'}` : ''), intro: (src && (src.label || src.explorationId) ? `Schéma repris de ${src.label || ''}${src.meetingId ? ' (décision du staff du ' + fmtDate((S.byId(d.meetings, src.meetingId) || {}).date) + ')' : ''}. ` : '') + (this.anatMode === 'patient' && this.patientAnat ? 'Vues sur l’anatomie du patient. ' : 'Vues sur le gabarit fsaverage. ') + 'Une colonne par hémisphère implanté, avec ses seules électrodes : face latérale en haut, mésiale en miroir en bas ; à droite, les deux hémisphères vus d’en bas (convention radiologique) et de face ; repères D/G, A/P, S/I sur chaque vue.' });
                  if (src && src.explorationId) { const fx = S.byId(d.explorations, src.explorationId); if (fx) { const c = S.compareImplantations(fx.electrodes, ex.electrodes); if (c.onlyA.length || c.onlyB.length) part += `<p class="m">Par rapport à ${esc(fx.label)} : ${c.common.length} électrodes communes${c.onlyA.length ? ' · non reprises : ' + esc(c.onlyA.join(', ')) : ''}${c.onlyB.length ? ' · ajoutées : ' + esc(c.onlyB.join(', ')) : ''}.</p>`; } }
                }
                if (eo.seeg && this.seegReport) { const G = await this.seegReport(sh || SHOT_LIGHT); if (G && (G.stims || G.thermo || (G.quant && G.quant.length))) part += `<div ${anchor('seeg_' + ex.id, 'Données SEEG', 3)}></div>` + R.seeg(G, { lv: 3, caseName: ex.label }); }
              }
              if (eo.cr && ex.kind === 'seeg' && this.seegCrHTML) { const c = this.seegCrHTML(ex, { afterInter: esiSp }); if (c) { part += `<h3 ${anchor('seegcr_' + ex.id, 'Compte rendu SEEG', 3)}>Compte rendu SEEG</h3>` + c; spDone = true; } }
              if (!spDone) part += `<h3 ${anchor('esisp_' + ex.id, 'Imagerie de source intercritique', 3)}>Imagerie de source intercritique</h3>` + esiSp;
              body.push(part);
            }
            for (const x of meetAfter(ex)) body.push(await this.reportMeetingSection(x, opts, anchor, 2));
          }
          if (m) body.push(await this.reportMeetingSection(m, opts, anchor, 2, true));
          if (opts.surgery) { job.progress(0.92, 'chirurgie et devenir'); body.push(`<h2 class="pb" ${anchor('surgery', 'Chirurgie et devenir')}>Chirurgie et devenir</h2>` + await this.reportSurgery(d, opts)); }
          if (opts.params) body.push(`<h2 ${anchor('params', 'Paramètres du modèle')}>Paramètres du modèle</h2>${R.paramsLine(Object.assign({}, SV.Model.DEFAULT_PARAMS || {}, this.state.params || {}), '')}<p class="m">Paramètres par défaut ou propres à chaque crise (réglages de l’espace de travail).</p>`);
          const tocHtml = toc.length > 2 ? `<nav class="toc"><b>Sommaire</b><ul>${toc.filter(t => (t.lv || 2) <= 3).map(t => `<li class="l${t.lv || 2}"><a href="#${t.id}">${esc(t.txt)}</a></li>`).join('')}</ul></nav>` : '';
          const P = d.patient, st = S.stage(d), head = Object.assign(this.brandHead(), {
            title: m ? `Staff du ${fmtDate(m.date)} — ${P.pseudo}` : `Dossier — ${P.pseudo}`,
            subtitle: m ? 'Compte rendu de réunion de concertation' : 'Rapport du parcours pré-chirurgical',
            meta: [st.text, `${d.explorations.length} exploration${d.explorations.length > 1 ? 's' : ''}`, `${d.seizures.length} crise${d.seizures.length > 1 ? 's' : ''}`, 'atlas VEP' + (this.patientAnat ? ' · anatomie du patient calculée' : ''), `base ${this.db.meta.version || ''}`],
          });
          return R.wrap(head, tocHtml + body.join('\n'));
        });
        const name = (opts.staff ? `Staff_${(d.patient.pseudo || 'patient')}_${opts.staff.date || ''}` : `EpiScope_dossier_${d.patient.pseudo || 'patient'}`).replace(/[^\w\-]+/g, '_') + '.html';
        this.download(name, SV.I18n.html(html), 'text/html');
        job.done('Rapport téléchargé : ouvrez-le puis Imprimer → PDF');
      } catch (e) { console.error(e); job.fail(e.message); }
      finally {
        this._reportBusy = false;
        this.ctx = null; if (orig) this.openContext(orig, true);
        this.viewer.setLayout(restoreV.layout); restoreV.cfgs.forEach((cfg, i) => this.viewer.setCellConfig(i, cfg, true)); this.viewer.setActive(restoreV.active);
        if (this.anatMode !== anat && this.setAnatomy) this.setAnatomy(anat, true);
        if (loc0 && this.go) this.go(loc0); else this.showScreen(screen);
      }
    },

    // ================================================================ fragments du dossier
    reportPatient(d) {
      const P = d.patient, A = this.atlas, F = P.sex === 'F';
      const lines = [[F ? 'Patiente' : P.sex === 'M' ? 'Patient' : 'Patient(e)', P.birthYear ? (F ? 'née en ' : 'né(e) en ') + P.birthYear : ''].filter(Boolean).join(', '),
        P.handedness ? (F ? { R: 'droitière', L: 'gauchère', A: 'ambidextre' } : V.handedness)[P.handedness] : '', 'dominance du langage ' + (V.dominance[P.dominant || '?'] || '?') + (P.dominanceMethod ? ' (' + V.dominanceMethod[P.dominanceMethod] + ')' : ''),
        S.onsetText(P) ? 'premières crises à ' + S.onsetText(P) : '', S.etiologyText(P) ? 'étiologie ' + S.etiologyText(P) : '', P.mri ? 'IRM ' + V.mri[P.mri] : '', P.frequency ? 'fréquence actuelle des crises : ' + P.frequency + (P.frequencyDate ? ' (' + S.fmtPartial(P.frequencyDate) + ')' : '') : ''].filter(Boolean);
      let html = `<p>${esc(lines.join(' · '))}</p>` + this.reportHistory(d) + this.reportExams(d);
      if (d.imaging.length) html += `<h3>Imagerie</h3><table><tr><th>modalité</th><th>temps</th><th>date</th><th>fichier</th><th>recalage</th></tr>${d.imaging.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).map(im => `<tr><td>${esc(V.modality[im.modality] || im.modality)}${im.ref ? ' <span class="chip">référence</span>' : ''}</td><td>${esc(V.timepoint[im.timepoint] || '')}</td><td class="mono">${fmtDate(im.date)}</td><td class="m">${esc(im.label || '')}</td><td class="m">${im.ref ? '—' : im.coreg && im.coreg.T ? esc(im.coreg.text || 'recalée') : 'non recalée'}</td></tr>`).join('')}</table>`;
      html += this.reportLesions(d);
      if (d.anatomy && d.anatomy.status === 'done') { const q = d.anatomy.qc || {}; html += `<p class="m">Anatomie du patient calculée le ${fmtDate(d.anatomy.date)} sur le T1 de référence : ${q.regions || '?'}/162 régions VEP, ${q.structures || 0} structures profondes${d.anatomy.fit ? ', recalage sur le gabarit ' + d.anatomy.fit.rms.toFixed(1) + ' mm' : ''}${q.missing && q.missing.length ? ' ; non retrouvées : ' + esc(q.missing.join(', ')) : ''}.</p>`; }
      return html;
    },
    /** Lésions (v4.19) : une ligne par lésion, puis ses ROI annotées (une ligne chacune, avec les coupes axiale, coronale et
     *  sagittale centrées sur la ROI : T1, FLAIR, T1 + FLAIR) et ses captures ; ROI libres (sans lésion) à la suite */
    reportLesions(d) {
      const A = this.atlas, R = d.rois || [], free = R.filter(r => !r.lesionId || !S.byId(d.lesions, r.lesionId)); if (!d.lesions.length && !R.length) return '';
      const roiRow = (r, sub) => `<tr class="${sub ? 'roi-sub' : 'roi-free'}"><td>${sub ? '↳ ' : ''}<b style="color:${esc(r.color)}">${r.kind === 'arrow' ? '➘' : '◯'} ${esc(r.label)}</b>${sub ? '' : ' <span class="m">(ROI libre)</span>'}</td><td colspan="2" class="m">${esc(V.roiKind[r.kind] || r.kind)}${r.kind === 'sphere' ? ' ' + r.r + ' mm' : ''}</td><td class="m mono">${r.p.map(v => v.toFixed(0)).join(', ')} mm${(this.patientAnat && this.patientAnat.labelWorld) ? (() => { const v = SV.Vol.labelWorld(this.patientAnat.vepVol, r.p); return v >= 1 && v <= 162 ? ` <span class="regchip">${esc(A.label(v))}</span>` : ''; })() : ''}</td><td colspan="2">${esc(r.notes || '')}${r.date ? ` <span class="m">${fmtDate(r.date)}${r.by ? ' · ' + esc(r.by) : ''}</span>` : ''}</td></tr>${(this._repRois || new Map()).get(r.id) ? `<tr class="roi-img"><td colspan="6">${this._repRois.get(r.id)}</td></tr>` : ''}`;
      let html = `<h3>Lésions</h3><table class="lestab"><tr><th>lésion · ROI</th><th>type</th><th>côté</th><th>régions · position</th><th>source · confiance</th><th>notes</th></tr>`;
      for (const l of d.lesions) {
        const caps = (l.galleryIds || []).map(id => S.byId(d.gallery || [], id)).filter(Boolean);
        html += `<tr class="les-main"><td><b>${esc(l.label || V.lesionType[l.type] || '')}</b></td><td>${esc(V.lesionType[l.type] || l.type)}</td><td>${esc({ L: 'G', R: 'D', B: 'bil.' }[l.side] || '')}</td><td>${(l.regions || []).map(r => `<span class="regchip">${esc(A.label(r))}</span>`).join('')}</td><td class="m">${esc([V.lesionSource[l.source], V.confidence[l.confidence]].filter(Boolean).join(' · '))}</td><td>${esc(l.notes || '')}</td></tr>`;
        if (caps.length) html += `<tr class="roi-img"><td colspan="6">${this.reportCapsHtml(caps)}</td></tr>`;
        for (const r of R.filter(x => x.lesionId === l.id)) html += roiRow(r, true);
      }
      for (const r of free) html += roiRow(r, false);
      html += '</table>';
      if (R.length && (this._repRois || new Map()).size) html += `<p class="m">Coupes centrées sur chaque ROI (champ de 70 mm, convention radiologique : la droite du patient à gauche) ; T1 + FLAIR : hypersignal FLAIR (au-delà du 90e centile de la tête) en orange sur le T1 ; repère cercle (ROI sphérique, tracé au-delà de son bord) ou flèche (arrêtée avant le point), semi-transparent, de couleur choisie pour chaque contraste, afin de ne pas masquer une anomalie discrète.</p>`;
      return html;
    },
    /** coupes de chaque ROI : T1 de référence, FLAIR recalé, fusion T1 + FLAIR (si présents) ; images JPEG dans this._repRois */
    async reportPrepRois(d) {
      const out = this._repRois = new Map(), R = d.rois || []; if (!R.length) return out;
      const ref = S.refImaging(d); if (!ref) return out;
      let t1 = null, fl = null, flIm = (d.imaging || []).filter(im => im.modality === 'FLAIR' && im.coreg && im.coreg.T && !im.derived).sort((a, b) => (b.timepoint === 'preop') - (a.timepoint === 'preop'))[0];
      try { t1 = await this.imagingVolume(ref); } catch (e) { console.warn('ROI : T1', e); return out; }
      if (flIm) try { fl = await this.imagingVolume(flIm); } catch (e) { fl = null; }
      // fenêtres : 2e–99,5e centile ; fusion : hypersignal FLAIR = au-delà du 90e centile des voxels de la tête (rampe jusqu'au 99,7e)
      const headQ = (v, qs) => { const d0 = v.data, st = Math.max(1, Math.floor(d0.length / 4e5)), sl = v.slope || 1, ic = v.inter || 0, a = []; let mx = -Infinity; for (let i = 0; i < d0.length; i += st) { const x = d0[i] * sl + ic; a.push(x); if (x > mx) mx = x; } const h = a.filter(x => x > 0.08 * mx).sort((x, y) => x - y); return qs.map(q => h.length ? h[Math.min(h.length - 1, Math.floor(q * h.length))] : 0); };
      const M4 = SV.Mat4, Q = v => SV.Vol.quantiles(v, [0.02, 0.995]), w1 = Q(t1), w2 = fl ? Q(fl) : null, hf = fl ? headQ(fl, [0.9, 0.997]) : null, T1i = M4.inv(t1.affine), Fi = fl ? M4.mul(M4.inv(fl.affine), M4.inv(M4.from(flIm.coreg.T))) : null;
      const VIEWS = [['axiale', [-1, 0, 0], [0, 1, 0], [0, 0, 1]], ['coronale', [-1, 0, 0], [0, 0, 1], [0, 1, 0]], ['sagittale', [0, -1, 0], [0, 0, 1], [1, 0, 0]]];
      const N = 220, FOV = 70, step = FOV / N, COL = { T1: [255, 210, 63], FLAIR: [51, 214, 255], 'T1 + FLAIR': [124, 255, 107] };
      const shot = (r, vi, mode) => {
        const [, U, Vv, Nn] = VIEWS[vi], cv = document.createElement('canvas'); cv.width = cv.height = N; const g = cv.getContext('2d'), im = g.createImageData(N, N);
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
          const u = (x - N / 2) * step, v = (N / 2 - y) * step, p = [r.p[0] + U[0] * u + Vv[0] * v, r.p[1] + U[1] * u + Vv[1] * v, r.p[2] + U[2] * u + Vv[2] * v], o = 4 * (y * N + x);
          let a = 0, b = 0; const q1 = M4.apply(T1i, p[0], p[1], p[2]); a = SV.Vol.sampleVox(t1, q1[0], q1[1], q1[2], 0);
          if (mode !== 'T1' && fl) { const q2 = M4.apply(Fi, p[0], p[1], p[2]); b = SV.Vol.sampleVox(fl, q2[0], q2[1], q2[2], 0); }
          const nT = Math.max(0, Math.min(1, (a - w1[0]) / (w1[1] - w1[0] || 1))), nF = w2 ? Math.max(0, Math.min(1, (b - w2[0]) / (w2[1] - w2[0] || 1))) : 0;
          if (mode === 'FLAIR') { im.data[o] = im.data[o + 1] = im.data[o + 2] = 255 * nF; }
          else if (mode === 'T1 + FLAIR') { const al = 0.7 * Math.max(0, Math.min(1, (b - hf[0]) / Math.max(1e-6, hf[1] - hf[0]))), gv = 255 * nT; im.data[o] = gv * (1 - al) + 255 * al; im.data[o + 1] = gv * (1 - al) + 110 * al; im.data[o + 2] = gv * (1 - al); }
          else im.data[o] = im.data[o + 1] = im.data[o + 2] = 255 * nT;
          im.data[o + 3] = 255;
        }
        g.putImageData(im, 0, 0);
        // repère : cercle au-delà du bord de la ROI (sphère) ou flèche arrêtée avant le point — semi-transparent, sans masquer la zone
        const c = COL[mode], cx = N / 2, cy = N / 2, px = 1 / step, line = (w, col) => { g.lineWidth = w; g.strokeStyle = col; };
        g.save(); g.lineCap = 'round';
        if (r.kind === 'arrow') {
          const ux = -0.7071, uy = -0.7071, gap = 3.5 * px, L = 15 * px, hx = cx + ux * gap, hy = cy + uy * gap, tx = cx + ux * (gap + L), ty = cy + uy * (gap + L);
          for (const [w, col] of [[4, 'rgba(0,0,0,.35)'], [1.8, `rgba(${c},.85)`]]) { line(w, col); g.beginPath(); g.moveTo(tx, ty); g.lineTo(hx, hy); g.stroke(); g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx - ux * -7 + uy * 4.5, hy - uy * -7 - ux * 4.5); g.moveTo(hx, hy); g.lineTo(hx - ux * -7 - uy * 4.5, hy - uy * -7 + ux * 4.5); g.stroke(); }
        } else {
          const rr = ((r.r || 5) + 3) * px;
          for (const [w, col] of [[3.5, 'rgba(0,0,0,.3)'], [1.5, `rgba(${c},.8)`]]) { line(w, col); g.setLineDash([7, 4]); g.beginPath(); g.arc(cx, cy, rr, 0, 2 * Math.PI); g.stroke(); }
        }
        g.restore(); g.font = '600 11px Segoe UI, sans-serif'; g.fillStyle = 'rgba(255,255,255,.85)'; g.fillText(VIEWS[vi][0], 6, N - 7); g.fillStyle = `rgba(${c},.95)`; g.fillText(mode, 6, 14);
        return cv.toDataURL('image/jpeg', 0.9);
      };
      const modes = ['T1'].concat(fl ? ['FLAIR', 'T1 + FLAIR'] : []), slug = s0 => String(s0 || 'ROI').replace(/[^\w\-]+/g, '_');
      for (const r of R) {
        try { out.set(r.id, `<div class="roiv">${modes.map(m => `<div class="roiv-row"><span class="roiv-m">${esc(m)}</span>${[0, 1, 2].map(vi => `<img class="zoomable" src="${shot(r, vi, m)}" data-name="EpiScope_${slug(r.label)}_${slug(m)}_${VIEWS[vi][0]}" alt="">`).join('')}</div>`).join('')}</div>${!fl ? '<div class="m">Pas de FLAIR recalé sur le T1 de référence : coupes T1 seules.</div>' : ''}`); }
        catch (e) { console.warn('ROI', r.label, e); }
      }
      return out;
    },
    /** histoire clinique structurée (antécédents, arbre généalogique, latéralité, histoire de l'épilepsie, traitements, examen) */
    /** o.noDev : sans le développement (diaporama du staff : diapositive à part) */
    /** v5.2 — histoire clinique en morceaux (HTML), repris par le compte rendu et par le diaporama du staff :
     *  life (mode de vie) · antPers (antécédents personnels : positifs détaillés, négatifs sur une ligne) · antMed
     *  (médico-chirurgicaux) · comorb · family (épilepsie familiale, arbre, remarques par apparenté) · lat · hx · tt · exam.
     *  o.skipAnt : antécédents montrés ailleurs (grossesse et naissance, dans la page du développement) */
    historyParts(d, o) {
      o = o || {}; const P = d.patient, C = P.clin || {}, Cl = SV.Clinical || {}, para = (t, v) => v ? `<p><b>${t}</b> : ${esc(v).replace(/\n/g, '<br>')}</p>` : '';
      // texte saisi sur plusieurs lignes : retour à la ligne après l'intitulé ; lignes « - », « • », « * » → liste à puces
      const txtBlock = v => { const L = String(v || '').split(/\n/), out = []; let ul = null; for (const ln of L) { const m = /^\s*(?:[-•*–]|\d+[.)])\s+(.*)$/.exec(ln); if (m) { (ul = ul || []).push(m[1]); continue; } if (ul) { out.push(`<ul>${ul.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`); ul = null; } if (ln.trim()) out.push(`<p>${esc(ln)}</p>`); } if (ul) out.push(`<ul>${ul.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`); return out.join(''); };
      const dated = L => (L || []).filter(x => x.text).slice().sort((x, y) => String(x.date || '').localeCompare(String(y.date || '')));
      const datedTable = L => `<table class="dtab">${L.map(x => `<tr><td class="mono" style="width:90px">${esc(S.fmtPartial(x.date) || '—')}</td><td>${esc(x.text)}</td></tr>`).join('')}</table>`;
      const A0 = C.antecedents || {}, skip = new Set(o.skipAnt || []);
      const ant = (V.antecedents || []).filter(([k]) => !skip.has(k)).map(([k, l]) => [k, l, A0[k] || {}]).filter(([, , a]) => a.v || a.text);
      const fam = ant.find(([k]) => k === 'family'), pers = ant.filter(([k]) => k !== 'family');
      const yes = pers.filter(([, , a]) => a.v === 'yes' || (!a.v && a.text)), no = pers.filter(([, , a]) => a.v === 'no'), unk = pers.filter(([, , a]) => a.v && a.v !== 'yes' && a.v !== 'no');
      const line = (t, L) => L.length ? `<p class="ant-neg"><span>${t}</span> ${L.map(([, l, a]) => esc(l) + (a.text ? ` (${esc(a.text)})` : '')).join(' · ')}</p>` : '';
      const H = {};
      H.life = C.lifestyle ? txtBlock(C.lifestyle) : '';
      H.antPers = (yes.length ? `<ul class="ant-pos">${yes.map(([, l, a]) => `<li><b>${esc(l)}</b>${a.text ? ' — ' + esc(a.text) : ''}</li>`).join('')}</ul>` : '') + line('Pas de :', no) + line('Non précisé :', unk);
      H.antMed = C.antecedentsText ? txtBlock(C.antecedentsText) : '';
      const co = dated(C.comorbHistory); H.comorb = co.length ? datedTable(co) : C.comorbidities ? txtBlock(C.comorbidities) : '';
      // antécédents familiaux : épilepsie dans la famille, arbre, remarques nommées par le lien de parenté au cas index
      const ped = C.pedigree, Pd = SV.Pedigree, hasPed = !!(Pd && Pd.hasContent(ped)), pm = hasPed ? (ped.v === 3 ? ped : Pd.migrate(JSON.parse(JSON.stringify(ped)))) : null;
      const notes = pm ? pm.persons.filter(q => q.notes && !q.ghost) : [], kin = q => q.label || (q.id === 'proband' ? 'cas index' : Pd.kinship(pm, q));
      const famLine = fam ? `<p class="ant-fam"><b>Épilepsie dans la famille</b> : ${fam[2].v === 'yes' ? 'oui' : fam[2].v === 'no' ? 'non' : 'non précisé'}${fam[2].text ? ' — ' + esc(fam[2].text) : ''}</p>` : '';
      H.pedSvg = hasPed ? Pd.svg(pm, P) : '';
      H.pedNotes = hasPed ? `${notes.length ? `<table class="ped-notes">${notes.map(q => `<tr><td>${esc(kin(q))}</td><td>${esc(q.notes)}${q.status && q.status !== 'none' ? ` <span class="ped-st">${esc(V.pedStatus[q.status] || '')}</span>` : ''}</td></tr>`).join('')}</table>` : ''}${Pd.consanguinities(pm).map(c => `<p>Union consanguine : ${esc(kin(Pd.byId(pm, c.a)))} et ${esc(kin(Pd.byId(pm, c.b)))}${c.rel ? ` — ${esc(c.rel.label)} (coefficient de consanguinité des enfants F = ${c.rel.F})` : ' (déclarée)'}.</p>`).join('')}${para('Remarques', ped.notes)}` : '';
      H.famLine = famLine;
      H.family = famLine || hasPed ? famLine + (hasPed ? `<div class="ped-rep">${H.pedSvg}</div>${H.pedNotes}` : '') : '';
      const lat = [P.handedness ? 'latéralité manuelle : ' + (V.handedness[P.handedness] || P.handedness) : '', C.edinburgh !== '' && C.edinburgh != null ? `Edinburgh ${C.edinburgh > 0 ? '+' : ''}${C.edinburgh} %` : '', C.pointingR !== '' || C.pointingL !== '' ? `test de pointage ${C.pointingR || 0} droite / ${C.pointingL || 0} gauche` : '', C.eye ? 'œil directeur ' + (C.eye === 'R' ? 'droit' : 'gauche') : '', C.familyLeftHanded ? 'gaucherie familiale : ' + C.familyLeftHanded : '', P.dominant ? 'dominance du langage ' + (V.dominance[P.dominant] || '?') + (P.dominanceMethod ? ' (' + V.dominanceMethod[P.dominanceMethod] + ')' : '') : ''].filter(Boolean);
      H.lat = lat.length ? `<p>${esc(lat.join(' · '))}</p>` : '';
      const hx = [['Premières crises à', S.onsetText(P)], ['Mode de début', C.onsetMode ? (Cl.ONSET_MODE || {})[C.onsetMode] || '' : ''], ['Étiologie', S.etiologyText(P)], ['Type(s) de crises', C.seizureTypes], ['Manifestations subjectives', C.subjective], ['Manifestations objectives', C.objective], ['Perte de contact', C.contact ? (Cl.CONTACT || {})[C.contact] || '' : ''], ['Durée', C.duration], ['Post-critique', C.postictal], ['Horaire', C.timing ? (Cl.TIMING || {})[C.timing] || '' : ''], ['Facteurs déclenchants', C.triggers], ['Généralisations tonico-cloniques', C.fbtcs], ['Plus longue période sans crise', C.longestFree]].filter(([, v]) => v);
      const fq = dated(C.freqHistory);
      H.hx = hx.length || P.history || fq.length ? `${P.history ? `<p>${esc(P.history).replace(/\n/g, '<br>')}</p>` : ''}${hx.length ? `<table>${hx.map(([l, v]) => `<tr><td style="width:30%">${esc(l)}</td><td>${esc(v).replace(/\n/g, '<br>')}</td></tr>`).join('')}</table>` : ''}${fq.length ? `<h4>Fréquence des crises</h4>${datedTable(fq)}` : ''}` : '';
      const aed = (d.aedHistory || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
      H.tt = P.aeds || aed.length || C.intolerances ? `${P.aeds ? `<div class="tblock"><p class="tb-h"><b>Traitement actuel</b>${P.aedsSince ? ` <span class="m">(depuis ${esc(S.fmtPartial(P.aedsSince))})</span>` : ''}</p>${txtBlock(P.aeds)}</div>` : ''}${aed.length ? `<table><tr><th>début</th><th>fin</th><th>traitement</th><th>effet</th></tr>${aed.map(a => `<tr><td class="mono">${esc(S.fmtPartial(a.date || ''))}</td><td class="mono">${esc(S.fmtPartial(a.end || ''))}</td><td>${esc(a.text)}</td><td class="m">${esc(a.effect || '')}</td></tr>`).join('')}</table>` : ''}${para('Intolérances', C.intolerances)}` : '';
      const ex = dated(C.examHistory); H.exam = ex.length ? datedTable(ex) : C.neuroExam ? txtBlock(C.neuroExam) : '';
      return H;
    },
    reportHistory(d, o) {
      const H = this.historyParts(d), sub = (t, v) => v ? `<div class="tblock"><p class="tb-h"><b>${t}</b></p>${v}</div>` : '';
      let html = '';
      if (H.life) html += `<h3>Mode de vie</h3>${H.life}`;
      if (H.antPers || H.antMed) html += `<h3>Antécédents personnels</h3>${H.antPers}${sub('Antécédents médico-chirurgicaux notables', H.antMed)}`;
      if (H.family) html += `<h3>Antécédents familiaux</h3>${H.family}`;
      if (H.lat) html += `<h3>Latéralité et dominance</h3>${H.lat}`;
      if (H.hx) html += `<h3>Histoire de l’épilepsie</h3>${H.hx}`;
      if (H.tt) html += `<h3>Traitements</h3>${H.tt}`;
      html += this.reportDevelopment && !(o && o.noDev) ? this.reportDevelopment(d) : '';
      if (H.exam || H.comorb) html += `<h3>Examen et comorbidités</h3>${H.exam ? '<h4>Examen neurologique</h4>' + H.exam : ''}${H.comorb ? '<h4>Comorbidités</h4>' + H.comorb : ''}`;
      return html;
    },
    /** bilans datés, par type (EEG de scalp, IRM, TEP, neuropsychologie…) ; upTo : date limite (staff) */
    reportExams(d, upTo) {
      const X = (d.exams || []).filter(x => !upTo || !x.date || String(x.date) <= String(upTo)); if (!X.length) return '';
      let html = '<h3>Bilans</h3>';
      for (const [k, l] of Object.entries(V.exam)) {
        const L = X.filter(x => x.kind === k).sort((a, b) => String(a.date).localeCompare(String(b.date))); if (!L.length) continue;
        html += `<h4>${esc(l.charAt(0).toUpperCase() + l.slice(1))}</h4><ul>${L.map(x => `<li><b>${fmtDate(x.date)}</b>${x.title ? ' — ' + esc(x.title) : ''}${x.kind === 'neuropsy' ? `<ul>${V.neuroDomains.filter(([dk]) => (x.domains || {})[dk]).map(([dk, dl]) => `<li><b>${esc(dl)}</b> : ${esc(x.domains[dk])}</li>`).join('')}</ul>` : x.text ? `<br>${esc(x.text).replace(/\n/g, '<br>')}` : ''}${x.conclusion ? `<br><i>${esc(x.conclusion)}</i>` : ''}${x.side && x.kind !== 'psy' && x.kind !== 'fmri' ? ` <span class="m">(${esc({ L: 'gauche', R: 'droite', B: 'bilatéral', N: 'non latéralisant' }[x.side] || '')})</span>` : ''}${x.kind === 'fmri' && x.langDom ? ` <span class="m">(dominance du langage : ${esc(V.langDom[x.langDom] || x.langDom)})</span>` : ''}${(x.attachments || []).length ? `<br><span class="m">pièces jointes : ${x.attachments.map(a => esc(a.name)).join(', ')}</span>` : ''}${this.reportCapsHtml(d.gallery.filter(g => g.examId === x.id))}</li>`).join('')}</ul>`;
      }
      return html;
    },
    /** captures préparées pour un rapport (images composées, annotations comprises) : appelé avant la rédaction */
    async reportPrepCaps(d, filter) {
      const C = this._repCaps = new Map();
      for (const g of (d.gallery || []).filter(filter || (g => g.examId))) { try { const u = await this.galleryComposite(g, 1800, 'image/jpeg'); if (u) C.set(g.id, u); } catch (e) { } }
      return C;
    },
    /** vignettes cliquables (agrandir, télécharger, imprimer) des captures données */
    reportCapsHtml(G) {
      if (!G || !G.length) return '';
      const C = this._repCaps || new Map(), ok = G.filter(g => C.has(g.id)), rest = G.filter(g => !C.has(g.id));
      const isV = g => /^video\//.test(g.mime || '');
      return (ok.length ? `<div class="caps">${ok.map(g => `<figure><img class="zoomable" src="${C.get(g.id)}" data-name="${esc(('EpiScope_' + (g.title || 'capture')).replace(/[^\w\-]+/g, '_'))}" title="Cliquer pour agrandir, télécharger ou imprimer" alt=""><figcaption>${esc(g.title || (isV(g) ? 'vidéo' : 'capture'))}${g.date ? ' · ' + fmtDate(g.date) : ''}${g.notes ? ' — ' + esc(g.notes) : ''}</figcaption></figure>`).join('')}</div>` : '') + (rest.length ? `<br><span class="m">captures liées : ${rest.map(g => esc(g.title || 'capture')).join(', ')}</span>` : '');
    },
    reportChrono(d) {
      const rows = [];
      for (const ex of d.explorations) rows.push([ex.start, `${ex.label} (${V.exploration[ex.kind]})${ex.end ? ' → ' + fmtDate(ex.end) : ''}`, `${S.seizuresOfExploration(d, ex.id).length} crise(s)${ex.electrodes.length ? ', ' + ex.electrodes.length + ' électrodes' : ''}`]);
      for (const im of d.imaging) rows.push([im.date, `${V.modality[im.modality] || im.modality} ${V.timepoint[im.timepoint] || ''}`, '']);
      for (const m of d.meetings) rows.push([m.date, `Staff — ${V.meeting[m.kind]}`, d.decisions.filter(x => x.meetingId === m.id).map(x => V.decision[x.type] + ' (' + V.decisionStatus[x.status] + ')').join(', ')]);
      for (const p of d.procedures) rows.push([p.date, this.surgeryLabel ? (this.surgeryLabel(p) || V.procedure[p.type]) : V.procedure[p.type], p.histology ? 'histologie : ' + p.histology : '']);
      for (const o of d.outcomes) { const mo = S.outcomeMonths(d, o); rows.push([o.date, 'Suivi', `Engel ${o.engel || '?'} · ILAE ${o.ilae || '?'}${mo !== '' ? ' · ' + mo + ' mois' : ''}`]); }
      rows.sort((a, b) => String(a[0] || '9999').localeCompare(String(b[0] || '9999')));
      return `<table><tr><th>date</th><th>étape</th><th>détail</th></tr>${rows.map(r => `<tr><td class="mono">${r[0] ? fmtDate(r[0]) : '—'}</td><td>${esc(r[1])}</td><td class="m">${esc(r[2])}</td></tr>`).join('')}</table>`;
    },
    reportSessions(ex) {
      const d = this.dossier, ses = S.sessionsOf(d, ex.id); if (!ses.length) return '';
      return `<p class="m">${ses.map(s => `${esc(s.label)} ${fmtDate(s.date)} : ${S.seizuresOfSession(d, s.id).length} crise(s)${(s.files || []).length ? ' · ' + esc(s.files.map(f => f.name || f).join(', ')) : ''}`).join(' — ')}</p>${ex.notes ? `<p>${esc(ex.notes)}</p>` : ''}`;
    },
    /** synthèse des crises d'une exploration : crises (consensus), comparaison des séquences, latéralisation, hypothèses
     *  récurrentes du modèle (et leurs réseaux), origines candidates (et leur carte) ; SR : vues de synthesis (synthShots) */
    reportSynthesis(ex, szs, cons, SR) {
      const A = this.atlas, pL = Math.round((cons = cons || this.consensus({ seizures: szs.map(sz => ({ sz, ex })) })).pL * 100), hab = szs.filter(z => z.habitual === 'yes').length;
      const top = []; for (let i = 1; i < A.N; i++) if (cons.region[i] >= 0.2) top.push(i); top.sort((a, b) => cons.region[b] - cons.region[a]);
      const ilae = new Map(); for (const z of szs) { const t = S.ilaeText(S.deriveIlae(z, this.db)) || '—'; ilae.set(t, (ilae.get(t) || 0) + 1); }
      let html = `<p>${szs.length} crises${hab ? ` dont ${hab} habituelle${hab > 1 ? 's' : ''}` : ''} (consensus : habituelles comptées double). ${[...ilae].map(([t, n]) => `${n} × ${esc(t)}`).join(' ; ')}.</p>`;
      // comparaison des séquences : rang d'apparition et côté de chaque signe
      const per = cons.per.slice(0, 14), rows = new Map();
      per.forEach(({ sz }, j) => sz.events.slice().sort((a, b) => a.t - b.t).forEach((e, k) => { const r = rows.get(e.sign_id) || { id: e.sign_id, cells: [], rank: 0, n: 0 }; r.cells[j] = { k: k + 1, side: e.side }; r.rank += k; r.n++; rows.set(e.sign_id, r); }));
      const list = [...rows.values()].sort((a, b) => b.n - a.n || a.rank / a.n - b.rank / b.n).slice(0, 20);
      html += `<h4>Comparaison des séquences (rang d’apparition · côté)</h4><table class="smx"><tr><th>signe</th>${per.map(({ sz }) => `<th class="${sz.habitual === 'yes' ? 'hab' : ''}">${esc(sz.label.replace(/^Crise\s*/, 'C'))}</th>`).join('')}</tr>${list.map(r => `<tr><td>${esc((this.db.signById.get(r.id) || {}).label_fr || r.id)}</td>${per.map((_, j) => { const c = r.cells[j]; return `<td>${c ? `<b>${c.k}</b>${c.side ? ' ' + { L: 'G', R: 'D', B: 'bil' }[c.side] : ''}` : ''}</td>`; }).join('')}</tr>`).join('')}</table>`;
      html += `<h4>Latéralisation (consensus)</h4><div class="lat"><span class="L" style="width:${pL}%">G ${pL} %</span><span class="R" style="width:${100 - pL}%">D ${100 - pL} %</span></div>`;
      html += `<h4>Hypothèses récurrentes du modèle</h4><ul>${cons.hyps.slice(0, 4).map(x => `<li><b>${esc(x.name)}</b> ${x.hemi === 'L' ? 'gauche' : 'droit'} <span class="m">— H1 dans ${x.top}/${cons.n} crise${cons.n > 1 ? 's' : ''}, présente dans ${x.n}</span></li>`).join('')}</ul>${SR && this.synthReportHypHtml ? `<p class="m">Réseau de mise en jeu de chaque hypothèse récurrente, calculé sur la crise où elle a le meilleur score (dynamique conditionnée à son origine, fin de trajectoire).</p>` + this.synthReportHypHtml(SR, cons) : ''}`;
      html += `<h4>Origines candidates (consensus)</h4><table><tr><th>région</th><th>score consensuel</th></tr>${top.slice(0, 8).map(i => `<tr><td>${esc(A.label(i))}</td><td class="mono">${cons.region[i].toFixed(2)}</td></tr>`).join('')}</table>${SR && this.synthReportHtml ? this.synthReportHtml(SR, cons) : ''}`;
      return html;
    },
    reportStaffCallout(m) {
      const d = this.dossier, A = this.atlas, dec = d.decisions.filter(x => x.meetingId === m.id);
      return `<div class="callout"><p><b>${esc(V.meeting[m.kind])}</b> — ${fmtDate(m.date)}${m.participants ? ' · ' + esc(m.participants) : ''} · ${m.status === 'final' ? 'validé' : 'brouillon'}</p>${m.question ? `<p><b>Question posée</b> : ${esc(m.question)}</p>` : ''}${m.conclusion ? `<p><b>Conclusion</b> : ${esc(m.conclusion).replace(/\n/g, '<br>')}</p>` : ''}${dec.length ? `<p><b>Décision${dec.length > 1 ? 's' : ''}</b> : ${dec.map(x => `${esc(V.decision[x.type])}${x.text ? ' — ' + esc(x.text) : ''}${x.targets.length ? ' <span class="m">(' + x.targets.slice(0, 6).map(r => esc(A.label(r))).join(', ') + (x.targets.length > 6 ? '…' : '') + ')</span>' : ''} [${esc(V.decisionStatus[x.status])}]`).join(' ; ')}</p>` : ''}</div>`;
    },
    /** staff complet : explorations discutées, concordance, hypothèses (et vues), décisions (implantation, chirurgie) */
    async reportMeetingSection(m, opts, anchor, lv, focus) {
      const d = this.dossier, A = this.atlas, L = r => esc(A.label(r)), scope = this.staffScope(m), cons = this.consensus(scope), hyps = this.meetingHypotheses(m), dec = d.decisions.filter(x => x.meetingId === m.id);
      const sc0 = this._scope; this._scope = scope;   // colonnes SEEG par défaut selon les explorations du staff
      let html = `<h${lv} class="${focus ? 'pb' : ''}" ${anchor('mt_' + m.id, 'Staff du ' + fmtDate(m.date))}>Staff du ${fmtDate(m.date)} — ${esc(V.meeting[m.kind])}</h${lv}>
        <p class="m">${m.participants ? 'Participants : ' + esc(m.participants) + ' · ' : ''}${m.status === 'final' ? 'validé' : 'brouillon'} · explorations prises en compte : ${scope.explorations.map(e => esc(e.label)).join(', ') || '—'}${cons.n ? ` · latéralisation clinique (consensus de ${cons.n} crise${cons.n > 1 ? 's' : ''}) : G ${Math.round(cons.pL * 100)} % / D ${100 - Math.round(cons.pL * 100)} %` : ''}</p>`;
      // concordance
      const cols = this.meetingColumns(m), auto = this.concordanceAuto(m, scope, cons), man = m.concordance.cells || {};
      let conc = `<table class="conc"><tr><th>Système</th>${cols.map(c => `<th>${esc(c.label)}</th>`).join('')}<th>Σ</th></tr>`; let nrow = 0;
      for (const sys of SYSTEMS) for (const side of ['L', 'R']) { const k = sys + ':' + side, cells = cols.map(c => (man[k] && man[k][c.key] && man[k][c.key].v !== undefined) ? man[k][c.key] : (auto[k] && auto[k][c.key]) || null); if (!cells.some(c => c && c.v && c.v !== '0')) continue; nrow++; const sc = cells.reduce((s, c) => s + (c ? LV_SCORE[c.v] || 0 : 0), 0); conc += `<tr><td>${esc(SYS_FR[sys])} ${side === 'L' ? 'G' : 'D'}</td>${cells.map(c => `<td class="lv${c && c.v ? ' v' + ({ '++': 'pp', '+': 'p', '0': 'z', '−': 'm', '?': 'q' }[c.v]) : ''}">${c && c.v ? esc(c.v) : ''}${c && c.note ? `<div class="nt">${esc(c.note)}</div>` : ''}</td>`).join('')}<td><b>${sc > 0 ? '+' + sc : sc}</b></td></tr>`; }
      conc += '</table>'; this._scope = sc0;
      html += `<h${lv + 1}>Concordance anatomo-électro-clinique</h${lv + 1}>${nrow ? conc : '<p class="m">—</p>'}`;
      // captures présentées (cochées dans « Préparer », sinon toutes celles des explorations prises en compte)
      const shown = this.presentGalleryList ? this.presentGalleryList(m, scope).filter(g => !g.examId) : [];
      if (shown.length && (focus || (m.galleryIds || []).length)) html += `<h${lv + 1}>Captures présentées</h${lv + 1}>${this.reportCapsHtml(shown)}`;
      // hypothèses
      html += `<h${lv + 1}>Hypothèses</h${lv + 1}>`;
      if (!hyps.length) html += '<p class="m">—</p>';
      for (let i = 0; i < hyps.length; i++) {
        const H = hyps[i], lin = d.hypotheses.filter(x => x.lineage === H.lineage).sort((a, b) => a.version - b.version);
        const shots = opts.images && H.ez.length ? await this._hypothesisShots(H, i, { scale: 2 }) : [];
        html += `<div class="hyp" style="border-left-color:${SV.hypCss(i)}"><h${lv + 2}><span style="color:${SV.hypCss(i)}">H${i + 1}</span> ${esc(H.title)} <small class="m">v${H.version} · ${esc(V.hypStatus[H.status])} · ${esc(V.confidenceText[H.confidence] || '')}</small></h${lv + 2}>
          <p><b>Zone épileptogène</b> : ${H.ez.map(r => `<span class="regchip ez">${L(r)}</span>`).join('') || '—'}${H.prop.length ? '<br><b>Propagation</b> : ' + H.prop.map(r => `<span class="regchip">${L(r)}</span>`).join('') : ''}</p>
          ${H.argsFor.filter(a => a.text).length ? '<p><b>Pour</b> : ' + H.argsFor.filter(a => a.text).map(a => esc(a.text)).join(' ; ') + '</p>' : ''}${H.argsAgainst.filter(a => a.text).length ? '<p><b>Contre</b> : ' + H.argsAgainst.filter(a => a.text).map(a => esc(a.text)).join(' ; ') + '</p>' : ''}
          ${lin.length > 1 ? `<p class="m">Historique : ${lin.map(x => `v${x.version} (${esc(V.hypStatus[x.status])}, ${fmtDate((S.byId(d.meetings, x.meetingId) || {}).date || x.created)})`).join(' → ')}</p>${this.hypDiff(lin[lin.length - 2], H)}` : ''}
          ${H.notes ? '<p>' + esc(H.notes) + '</p>' : ''}${shots.length ? `<div class="imgs">${shots.map((u, k) => R.IMG(u, `Staff_H${i + 1}_${k ? 'medial' : 'lateral'}`)).join('')}</div>` : ''}</div>`;
      }
      // décisions
      html += `<h${lv + 1}>Décisions</h${lv + 1}>`;
      if (!dec.length) html += '<p class="m">—</p>';
      for (const x of dec) {
        const ex = x.createdExplorationId && S.byId(d.explorations, x.createdExplorationId), pr = x.procedureId && S.byId(d.procedures, x.procedureId), dh = d.hypotheses.filter(H => x.hypothesisIds.includes(H.id));
        html += `<div class="hyp" style="border-left-color:#f2b84b"><h${lv + 2}>${esc(V.decision[x.type])}${x.text ? ' — ' + esc(x.text) : ''} <small class="m">${esc(V.decisionStatus[x.status])}${x.date ? ' · ' + fmtDate(x.date) : ''}</small></h${lv + 2}>
          ${dh.length ? `<p><b>Hypothèses</b> : ${dh.map(H => esc(H.title)).join(' · ')}</p>` : ''}`;
        if (['surgery', 'litt'].includes(x.type) && x.targets.length && this.surgeryShots) {
          const cov = this.surgeryCoverage(x.targets, dh);
          html += `<p><b>Intervention proposée</b> : ${esc(this.surgeryLabel(x) || '')}${x.targets.length ? ' — ' + x.targets.map(r => `<span class="regchip">${L(r)}${x.extent && x.extent[r] ? ' (partiel)' : ''}</span>`).join('') : ''}</p>${cov.length ? `<p class="m">${cov.map(c => `${esc(c.H.title)} : ZE ${c.in.length}/${c.H.ez.length} dans la résection${c.out.length ? ' (hors : ' + c.out.map(L).join(', ') + ')' : ''}`).join(' · ')}</p>` : ''}`;
          if (opts.images) { const imgs = await this._surgeryShots(x.targets, x.extent || {}, dh, x.side, { scale: 1.6 }); html += `<div class="imgs three">${imgs.map((u, k) => R.IMG(u, `Staff_chirurgie_${['lateral', 'inferieur', 'medial'][k]}`)).join('')}</div><p class="m">Rouge : résection ; orangé : résection partielle ; rouge sombre : ZE comprise ; bleu : ZE hors résection.</p>`; }
        } else if (x.targets.length) html += `<p><b>Cibles</b> : ${x.targets.map(r => `<span class="regchip">${L(r)}</span>`).join('')}</p>`;
        if (ex) html += `<p class="m">→ ${esc(ex.label)} : ${ex.electrodes.length} électrode${ex.electrodes.length > 1 ? 's' : ''}${ex.implant && ex.implant.source && ex.implant.source.label ? ' (' + (ex.implant.source.kind === 'import' ? 'schéma repris de ' : '') + esc(ex.implant.source.label) + ')' : ''} : <span class="mono">${esc(ex.electrodes.map(e => e.name).join(' '))}</span></p>`;
        // schéma d'implantation décidé : vues latérale et médiale de chaque hémisphère implanté (ses seules électrodes), inférieure (radiologique) et de face
        if (ex && ex.electrodes.length && opts.images && this.seegShots && !(opts.ex && opts.ex[ex.id] && opts.ex[ex.id].implant)) {
          this.loadForReport({ explorationId: ex.id }); await wait(30);
          if (this.elecs && this.elecs.length) { const imgs = await this.seegShots({}, SHOT_LIGHT || SHOT, 'implantation_' + ex.label); html += `<div class="dec-impl">${R.views ? R.views(imgs, 'Staff_' + ex.label) : ''}</div><p class="m">Schéma d’implantation de ${esc(ex.label)} : une colonne par hémisphère implanté (ses seules électrodes), face latérale en haut, mésiale en miroir en bas ; à droite, les deux hémisphères vus d’en bas (convention radiologique) et de face.</p>`; }
        }
        if (pr) html += `<p class="m">→ procédure : ${esc(this.surgeryLabel ? this.surgeryLabel(pr) || V.procedure[pr.type] : V.procedure[pr.type])}${pr.date ? ' le ' + fmtDate(pr.date) : ' (date à préciser)'}</p>`;
        html += '</div>';
      }
      if (m.conclusion) html += `<h${lv + 1}>Conclusion</h${lv + 1}><p>${esc(m.conclusion).replace(/\n/g, '<br>')}</p>`;
      return html;
    },
    async reportSurgery(d, opts) {
      const A = this.atlas; let html = '';
      for (const p of d.procedures.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
        const hy = S.latestHypotheses(d).filter(H => ['confirmed', 'testing', 'proposed'].includes(H.status));
        html += `<h3>${esc((this.surgeryLabel && this.surgeryLabel(p)) || V.procedure[p.type])}${p.date ? ' — ' + fmtDate(p.date) : ''}</h3><p>${p.regions.length ? p.regions.map(r => `<span class="regchip">${esc(A.label(r))}${p.extent && p.extent[r] ? ' (partiel)' : ''}</span>`).join('') : ''}</p>
          <p class="m">${[p.target && p.target !== this.surgeryLabel(p) ? esc(p.target) : '', p.histology ? 'histologie : ' + esc(p.histology) : '', p.complications ? 'complications : ' + esc(p.complications) : ''].filter(Boolean).join(' · ')}</p>`;
        if (opts.images && p.regions.length && this._surgeryShots) { const imgs = await this._surgeryShots(p.regions, p.extent || {}, hy, p.side, { scale: 1.6 }); html += `<div class="imgs three">${imgs.map((u, k) => R.IMG(u, `Chirurgie_${['lateral', 'inferieur', 'medial'][k]}`)).join('')}</div>`; }
      }
      if (d.outcomes.length) html += `<h3>Devenir</h3><table><tr><th>date</th><th>recul</th><th>Engel</th><th>ILAE</th><th>procédure</th><th>notes</th></tr>${d.outcomes.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).map(o => { const mo = S.outcomeMonths(d, o), p = S.outcomeProcedure(d, o), en = V.engelMemo.flatMap(x => x[2]).find(x => x[0] === o.engel), il = V.ilaeMemo.find(x => x[0] === String(o.ilae)); return `<tr><td class="mono">${fmtDate(o.date)}</td><td class="mono">${mo !== '' ? mo + ' mois' : '—'}</td><td><b>${esc(o.engel || '—')}</b>${en ? ' <span class="m">' + esc(en[1]) + '</span>' : ''}</td><td><b>${esc(o.ilae || '—')}</b>${il ? ' <span class="m">' + esc(il[1]) + '</span>' : ''}</td><td class="m">${p ? esc((this.surgeryLabel && this.surgeryLabel(p)) || V.procedure[p.type]) : ''}</td><td class="m">${esc(o.notes || '')}</td></tr>`; }).join('')}</table>`;
      return html || '<p class="m">—</p>';
    },
  };
  Object.assign(SV.app, M);
})(window.SV = window.SV || {});
