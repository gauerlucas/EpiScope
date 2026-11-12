/* EpiScope — eeg_cr.js : compte rendu de l'EEG de scalp (vidéo-EEG de phase 1, EEG standard, de sieste…).
 *   - rubriques (rythme de fond, intercritique, critique, post-critique, conclusion) avec phrases types à insérer et
 *     textes proposés d'après la carte et les crises saisies ;
 *   - épreuves d'activation : SLI (simple, ou réponse détaillée par fréquence), hyperpnée, autres méthodes (lecture à voix
 *     haute, calcul mental, musique…) ;
 *   - événements enregistrés : crises épileptiques, crises fonctionnelles dissociatives, autres manifestations ;
 *   - carte récapitulative 10-20 (système IFCN à 25 électrodes, inspirée de SCORE, Beniczky et al. 2017) : pointes, ondes
 *     lentes, début des crises, intensité 1 à 3 par électrode, rendue en carte d'amplitude (une tête par rubrique).
 *   Repris dans la présentation du staff et dans les comptes rendus (rapport du dossier, rapport SEEG).          */
(function (SV) {
  'use strict';
  const $ = id => document.getElementById(id), S = SV.Store;
  const esc = SV.U.esc;
  const br = s => esc(s).replace(/\n/g, '<br>');

  // ---------------------------------------------------------------- 10-20 : positions (tête de rayon 1, nez en haut)
  const P = (r, deg) => [r * Math.sin(deg * Math.PI / 180), r * Math.cos(deg * Math.PI / 180)];
  const POS = {
    Fp1: P(0.8, -18), Fp2: P(0.8, 18), F7: P(0.8, -54), F8: P(0.8, 54), T3: P(0.8, -90), T4: P(0.8, 90), T5: P(0.8, -126), T6: P(0.8, 126), O1: P(0.8, -162), O2: P(0.8, 162),
    F3: [-0.33, 0.43], F4: [0.33, 0.43], C3: [-0.4, 0], C4: [0.4, 0], P3: [-0.33, -0.43], P4: [0.33, -0.43], Fz: [0, 0.4], Cz: [0, 0], Pz: [0, -0.4],
    F9: P(0.97, -58), F10: P(0.97, 58), T9: P(0.97, -90), T10: P(0.97, 90), P9: P(0.97, -122), P10: P(0.97, 122),
  };
  const ALIAS = { T3: 'T7', T4: 'T8', T5: 'P7', T6: 'P8' };
  const REGION = { Fp: 'frontopolaire', F7: 'temporale antérieure', F8: 'temporale antérieure', F9: 'temporale antérieure', F10: 'temporale antérieure', T3: 'temporale moyenne', T4: 'temporale moyenne', T9: 'temporale moyenne', T10: 'temporale moyenne', T5: 'temporale postérieure', T6: 'temporale postérieure', P9: 'temporale postérieure', P10: 'temporale postérieure', F3: 'frontale', F4: 'frontale', C3: 'centrale', C4: 'centrale', P3: 'pariétale', P4: 'pariétale', O1: 'occipitale', O2: 'occipitale', Fz: 'frontale médiane', Cz: 'du vertex', Pz: 'pariétale médiane' };
  const regionOf = e => REGION[e] || REGION[e.slice(0, 2)] || e;
  const sideOf = e => /z$/.test(e) ? 'M' : (+e.replace(/\D/g, '') % 2 ? 'L' : 'R');
  /** rubriques de la carte : couleur, libellé */
  const CATS = [['spikes', 'Pointes', [230, 57, 70]], ['slow', 'Ondes lentes', [58, 134, 255]], ['ictal', 'Début des crises', [155, 93, 229]]];
  const css = (c, a) => `rgba(${c.join(',')},${a == null ? 1 : a})`;
  let uid = 0;

  /** carte d'amplitude d'une rubrique (SVG) : { [électrode]: 1–3 } ; opts.edit : électrodes cliquables, opts.size px */
  function headSVG(vals, cat, opts) {
    opts = opts || {}; const C = (CATS.find(c => c[0] === cat) || CATS[0])[2], id = 'eh' + (++uid), sz = opts.size || 180, V = vals || {};
    const xy = e => { const p = POS[e]; return [p[0], -p[1]]; };
    let s = `<svg class="eeg-head" viewBox="-1.22 -1.2 2.44 2.42" width="${sz}" height="${sz}" data-cat="${cat}"><defs><clipPath id="${id}c"><circle r="1"/></clipPath>`;
    for (const k of [1, 2, 3]) s += `<radialGradient id="${id}g${k}"><stop offset="0" stop-color="${css(C)}" stop-opacity="${[0, 0.38, 0.62, 0.88][k]}"/><stop offset="0.55" stop-color="${css(C)}" stop-opacity="${[0, 0.16, 0.3, 0.45][k]}"/><stop offset="1" stop-color="${css(C)}" stop-opacity="0"/></radialGradient>`;
    s += `</defs><path d="M-0.13 -0.985 L0 -1.15 L0.13 -0.985" class="eh-nose"/><path d="M-0.99 -0.16 C-1.1 -0.18 -1.12 0.18 -0.99 0.16 M0.99 -0.16 C1.1 -0.18 1.12 0.18 0.99 0.16" class="eh-ear"/><circle r="1" class="eh-skull"/>`;
    s += `<g clip-path="url(#${id}c)">${Object.entries(V).filter(([e, v]) => POS[e] && v > 0).map(([e, v]) => { const [x, y] = xy(e); return `<circle cx="${x.toFixed(3)}" cy="${y.toFixed(3)}" r="${(0.34 + 0.06 * v).toFixed(2)}" fill="url(#${id}g${Math.min(3, v)})"/>`; }).join('')}</g>`;
    for (const e of Object.keys(POS)) {
      const [x, y] = xy(e), v = V[e] || 0, small = /9|10/.test(e);
      s += `<g class="eh-el${v ? ' on' : ''}${opts.edit ? ' ed' : ''}" data-el="${e}"><title>${e}${ALIAS[e] ? ' (' + ALIAS[e] + ')' : ''}${v ? ' · ' + '+'.repeat(v) : ''}</title><circle cx="${x.toFixed(3)}" cy="${y.toFixed(3)}" r="${small ? 0.05 : 0.062}"${v ? ` style="fill:${css(C)}"` : ''}/>${small && !v ? '' : `<text x="${x.toFixed(3)}" y="${(y + (small ? 0.14 : 0.16)).toFixed(3)}">${e}</text>`}</g>`;
    }
    return s + '</svg>';
  }
  /** phrase de topographie d'une rubrique : « temporales antérieures et moyennes droites (max. F8, T4) » ;
   *  plural : accord au pluriel (après « pointes », « ondes lentes ») ; sinon pluriel seulement si plusieurs régions */
  function topoText(vals, plural) {
    const L = Object.entries(vals || {}).filter(([e, v]) => POS[e] && v > 0); if (!L.length) return '';
    const by = { R: [], L: [], M: [] }; for (const [e, v] of L) by[sideOf(e)].push([e, v]);
    const plur = t => t.split(' ').map(w => ['et', 'du', 'vertex'].includes(w.replace(/,$/, '')) || /s,?$/.test(w) ? w : w.replace(/e(,?)$/, 'es$1')).join(' ');
    const regsOf = arr => { arr.sort((a, b) => b[1] - a[1]); const r = [...new Set(arr.map(([e]) => regionOf(e)))]; return r.filter(x => x !== 'du vertex').concat(r.includes('du vertex') ? ['du vertex'] : []); };
    const words = regs => { const same = regs.length > 1 && regs.every(r => r.startsWith('temporale ')); return regs.map((r, i) => i > 0 && same ? r.replace(/^temporale /, '') : r).join(', ').replace(/, ([^,]*)$/, ' et $1'); };
    const maxOf = arr => arr.filter(([, v]) => v === arr[0][1]).map(([e]) => e);
    const part = (arr, side) => {
      if (!arr.length) return ''; const regs = regsOf(arr), pl = plural || regs.length > 1, R = words(regs);
      return `${pl ? plur(R) : R}${side === 'M' ? '' : side === 'R' ? (pl ? ' droites' : ' droite') : side === 'L' ? (pl ? ' gauches' : ' gauche') : ' bilatérales'} (max. ${maxOf(arr).join(', ')})`;
    };
    const rR = regsOf(by.R.slice()), rL = regsOf(by.L.slice());
    if (by.R.length && by.L.length && rR.join('|') === rL.join('|')) {   // même topographie des deux côtés : « bilatérales »
      const both = by.R.concat(by.L).sort((a, b) => b[1] - a[1]); return [part(both, 'B'), part(by.M, 'M')].filter(Boolean).join(', ');
    }
    return [part(by.R, 'R'), part(by.L, 'L'), part(by.M, 'M')].filter(Boolean).join(' ; ');
  }
  // ---------------------------------------------------------------- épreuves d'activation, événements
  const SLI = { '': '—', none: 'non réalisée', normal: 'sans particularité', drive: 'entraînement physiologique', ppr: 'réponse photoparoxystique', sz: 'crise photo-induite' };
  const SLI_F = [1, 3, 5, 7, 10, 12, 15, 18, 20, 25, 30, 40, 50, 60];
  const SLI_R = { drive: ['entraînement', '#7bd389'], ppr: ['photoparoxystique', '#e63946'], sz: ['crise', '#9b5de5'] };
  const HV = { '': '—', none: 'non réalisée', normal: 'sans particularité', slowing: 'ralentissement physiologique', activated: 'anomalies activées', sz: 'crise déclenchée', limited: 'mal réalisée' };
  const OTHER_ACT = [['sleepDep', 'privation de sommeil'], ['reading', 'lecture à voix haute'], ['calc', 'calcul mental'], ['music', 'musique'], ['praxis', 'praxies / mouvements'], ['startle', 'stimulation de sursaut'], ['games', 'jeux / écrans'], ['eyes', 'ouverture / fermeture des yeux'], ['trigger', 'facteur déclenchant rapporté']];
  const EVENTS = [['pnes', 'crises fonctionnelles dissociatives'], ['syncope', 'malaise / syncope'], ['movement', 'mouvements anormaux non épileptiques'], ['parasomnia', 'parasomnie'], ['sleepEvt', 'événement du sommeil (éveil confusionnel…)'], ['panic', 'attaque de panique'], ['otherEvt', 'autre manifestation']];
  const PHRASES = {
    background: ['Rythme de fond alpha postérieur à … Hz, symétrique, réactif à l’ouverture des yeux.', 'Organisation de la veille normale pour l’âge.', 'Ralentissement thêta-delta intermittent …', 'Asymétrie du rythme de fond, moins ample à …', 'Sommeil enregistré, bien structuré ; figures physiologiques présentes et symétriques.', 'Tracé de veille ralenti, peu réactif.'],
    interictal: ['Pas d’anomalie paroxystique intercritique.', 'Pointes et pointes-ondes …, activées par le sommeil.', 'Ondes lentes … (foyer lent).', 'Anomalies bilatérales indépendantes, prédominant à …', 'Activité delta rythmique intermittente temporale (TIRDA) …', 'Anomalies rares (< 1 par heure).', 'Anomalies abondantes, sub-continues au sommeil.'],
    ictal: ['Début électrique focal …, précédant le début clinique de … s.', 'Rythme thêta régional …, s’enrichissant en fréquence et en amplitude, puis diffusion …', 'Atténuation diffuse du tracé au début de la crise, puis …', 'Début non localisable (artefacts musculaires).', 'Pas de corrélat électrique au cours de l’événement.', 'Début latéralisé à …, non localisé.'],
    postictal: ['Ralentissement delta post-critique …, latéralisé à …', 'Pas de ralentissement post-critique.', 'Retour rapide au tracé de base.', 'Aphasie post-critique.'],
    conclusion: ['EEG de veille et de sommeil normal.', 'Épilepsie focale … : anomalies intercritiques et crises concordantes.', 'Événements enregistrés sans corrélat EEG, évocateurs de crises fonctionnelles dissociatives.'],
  };
  const FIELDS = [['background', 'Rythme de fond', 'organisation, asymétrie, réactivité, sommeil'], ['interictal', 'Anomalies intercritiques', 'type (pointes, pointes-ondes, ondes lentes…), topographie, veille / sommeil, abondance'], ['ictal', 'EEG critique', 'début, topographie, évolution, par crise ou pour l’ensemble'], ['postictal', 'Post-critique', 'ralentissement, latéralisation'], ['conclusion', 'Conclusion', '']];

  /** normalisation des champs ajoutés */
  function normEeg(E) {
    E.act = Object.assign({ sli: '', sliSpectrum: false, sliFreq: {}, sliText: '', hv: '', hvMin: '', hvText: '', other: [], otherText: '' }, E.act || {});
    E.events = Object.assign({ pnes: '', pnesText: '', other: [], otherText: '' }, E.events || {});
    E.map = Object.assign({ spikes: {}, slow: {}, ictal: {} }, E.map || {});
    return E;
  }
  const hasMap = E => !!E.map && CATS.some(([k]) => Object.values(E.map[k] || {}).some(v => v > 0));
  /** phrases des épreuves d'activation et des événements (comptes rendus) */
  function actText(E) {
    const A = E.act || {}, out = [];
    if (A.sli) { let t = 'SLI : ' + SLI[A.sli]; if (A.sliSpectrum) { const g = {}; for (const [f, r] of Object.entries(A.sliFreq || {})) (g[r] = g[r] || []).push(+f); const parts = Object.entries(g).map(([r, L]) => `${SLI_R[r] ? SLI_R[r][0] : r} à ${L.sort((a, b) => a - b).join(', ')} Hz`); if (parts.length) t += ' (' + parts.join(' ; ') + ')'; } if (A.sliText) t += ' — ' + A.sliText; out.push(t + '.'); }
    if (A.hv) out.push(`Hyperpnée${A.hvMin ? ' (' + A.hvMin + ' min)' : ''} : ${HV[A.hv]}${A.hvText ? ' — ' + A.hvText : ''}.`);
    if ((A.other || []).length || A.otherText) out.push(`Autres activations : ${(A.other || []).map(k => (OTHER_ACT.find(x => x[0] === k) || [k, k])[1]).join(', ')}${A.otherText ? ((A.other || []).length ? ' — ' : '') + A.otherText : ''}.`);
    return out;
  }
  function eventsText(E, nSz) {
    const X = E.events || {}, out = [];
    if (nSz != null) out.push(nSz ? `${nSz} crise${nSz > 1 ? 's' : ''} épileptique${nSz > 1 ? 's' : ''} enregistrée${nSz > 1 ? 's' : ''}.` : 'Aucune crise épileptique enregistrée.');
    if (X.pnes !== '' && X.pnes != null) out.push(+X.pnes ? `${X.pnes} crise${+X.pnes > 1 ? 's' : ''} fonctionnelle${+X.pnes > 1 ? 's' : ''} dissociative${+X.pnes > 1 ? 's' : ''} enregistrée${+X.pnes > 1 ? 's' : ''}${X.pnesText ? ' : ' + X.pnesText : ''}.` : 'Pas de crise fonctionnelle dissociative enregistrée.');
    const o = (X.other || []).filter(k => k !== 'pnes'); if (o.length || X.otherText) out.push(`Autres manifestations : ${o.map(k => (EVENTS.find(x => x[0] === k) || [k, k])[1]).join(', ')}${X.otherText ? (o.length ? ' — ' : '') + X.otherText : ''}.`);
    return out;
  }
  /** compte rendu EEG complet en HTML (rapports, présentation) ; opts.size : taille des têtes */
  function crHTML(ex, opts) {
    opts = opts || {}; const E = normEeg(ex.eeg || (ex.eeg = {})), d = SV.app && SV.app.dossier, nSz = d ? S.seizuresOfExploration(d, ex.id).filter(z => z.events.length).length : null;
    const rows = FIELDS.filter(([k]) => k !== 'conclusion' && E[k]).map(([k, l]) => `<dt>${l}</dt><dd>${br(E[k])}</dd>`), act = actText(E), evt = eventsText(E, ex.kind === 'phase1' ? nSz : null);
    if (act.length) rows.push(`<dt>Épreuves d’activation</dt><dd>${act.map(esc).join('<br>')}</dd>`);
    if (evt.length && (ex.kind === 'phase1' || (E.events.pnes !== '' || (E.events.other || []).length))) rows.push(`<dt>Événements enregistrés</dt><dd>${evt.map(esc).join('<br>')}</dd>`);
    const maps = hasMap(E) ? `<div class="eeg-maps">${CATS.filter(([k]) => Object.values(E.map[k] || {}).some(v => v > 0)).map(([k, l]) => `<figure>${headSVG(E.map[k], k, { size: opts.size || 150 })}<figcaption><b>${l}</b><br><span>${esc(topoText(E.map[k]))}</span></figcaption></figure>`).join('')}</div>` : '';
    if (E.synthInter) rows.push(`<dt>Synthèse intercritique</dt><dd>${br(E.synthInter)}</dd>`); if (E.synthIctal) rows.push(`<dt>Synthèse des crises</dt><dd>${br(E.synthIctal)}</dd>`);
    if (!rows.length && !maps && !E.conclusion) return '';
    // opts.afterInter (HTML : imagerie de source des pointes) après l'analyse visuelle de l'intercritique (anomalies, cartes)
    const k = opts.afterInter ? FIELDS.filter(([f]) => f !== 'conclusion' && E[f]).findIndex(([f]) => f === 'interictal') + 1 || Math.min(1, rows.length) : rows.length, dl = R => R.length ? `<dl class="eeg-dl">${R.join('')}</dl>` : '';
    return `<div class="eeg-cr">${dl(rows.slice(0, k))}${opts.afterInter ? maps + opts.afterInter + dl(rows.slice(k)) : dl(rows.slice(k)) + maps}${E.conclusion ? `<p class="eeg-concl"><b>Conclusion</b> : ${br(E.conclusion)}</p>` : ''}</div>`;
  }
  /** styles des têtes (rapports imprimables : couleurs fixes) */
  const PRINT_CSS = `.eeg-head .eh-skull{fill:#fff;stroke:#1d2330;stroke-width:.018}.eeg-head .eh-nose,.eeg-head .eh-ear{fill:none;stroke:#1d2330;stroke-width:.018}.eeg-head .eh-el circle{fill:#fff;stroke:#1d2330;stroke-width:.012}.eeg-head .eh-el text{font:600 .095px sans-serif;text-anchor:middle;fill:#1d2330}.eeg-maps{display:flex;flex-wrap:wrap;gap:14px;margin:8px 0}.eeg-maps figure{margin:0;text-align:center;max-width:200px;font-size:11px}.eeg-dl dt{font-weight:600;margin-top:6px}.eeg-dl dd{margin:0 0 4px 0}`;

  const M = {
    // ================================================================ compte rendu EEG, par partie (v5.1)
    /** Une partie du compte rendu de l'EEG de scalp, rendue dans host :
     *   'inter' : rythme de fond, anomalies intercritiques, épreuves d'activation, cartes « pointes » et « ondes lentes » ;
     *   'ictal' : EEG critique, post-critique, événements enregistrés, carte « début des crises » ;
     *   'synth' : synthèse intercritique, synthèse des crises, conclusion (textes proposés d'après le reste).
     *  Même objet ex.eeg qu'avant (comptes rendus, présentation inchangés). */
    eegPart(host, ex, part) {
      const E = normEeg(ex.eeg || (ex.eeg = {})), d = this.dossier, nSz = S.seizuresOfExploration(d, ex.id).filter(z => z.events.length).length;
      const touch = () => this.touch('exploration', ex.id, 'compte rendu EEG');
      const KEYS = { inter: ['background', 'interictal'], ictal: ['ictal', 'postictal'], synth: ['synthInter', 'synthIctal', 'conclusion'] }[part];
      const LAB = Object.assign(Object.fromEntries(FIELDS.map(f => [f[0], f])), { synthInter: ['synthInter', 'Synthèse intercritique', 'en une ou deux phrases'], synthIctal: ['synthIctal', 'Synthèse des crises', 'types de crises, sémiologie, début électrique'], conclusion: ['conclusion', 'Conclusion', 'origine probable, hypothèse(s), suite proposée'] });
      const SUG = { interictal: 'interictal', ictal: 'ictal', conclusion: 'conclusion', synthInter: 'interictal', synthIctal: 'ictal' };
      const cats = { inter: ['spikes', 'slow'], ictal: ['ictal'], synth: [] }[part];
      const ta = c => `<textarea class="grow" rows="1" ${c}`;
      host.innerHTML = `<div class="card form eeg-form">${KEYS.map(k => { const [, l, ph] = LAB[k]; return `<label><span class="srl">${l}<span class="spacer"></span>${PHRASES[k] ? `<button class="mini-btn" data-ph="${k}" title="phrases types à insérer">phrases ▾</button>` : ''}${SUG[k] ? `<button class="mini-btn" data-sug="${k}" title="d’après la carte, les épreuves et les crises saisies">proposer</button>` : ''}</span><textarea class="grow" data-f="${k}" rows="2" placeholder="${esc(ph)}">${esc(E[k] || '')}</textarea></label>`; }).join('')}</div>
        ${part === 'inter' ? `<div class="card eeg-act"><div class="card-h">Épreuves d’activation</div>
            <div class="ea-row"><span class="lbl">SLI</span><select data-a="sli">${Object.entries(SLI).map(([k, l]) => `<option value="${k}"${E.act.sli === k ? ' selected' : ''}>${l}</option>`).join('')}</select><label class="chip"><input type="checkbox" data-a="sliSpectrum"${E.act.sliSpectrum ? ' checked' : ''}> préciser le spectre</label>${ta(`data-a="sliText" placeholder="commentaire (yeux fermés, ouverts…)">${esc(E.act.sliText)}</textarea>`)}</div>
            <div class="sli-spec"${E.act.sliSpectrum ? '' : ' hidden'}>${SLI_F.map(f => { const r = E.act.sliFreq[f]; return `<button class="sli-f${r ? ' r-' + r : ''}" data-f="${f}" title="clic : entraînement → photoparoxystique → crise → rien">${f}<small>Hz</small></button>`; }).join('')}<span class="muted small">${Object.entries(SLI_R).map(([k, [l, c]]) => `<i class="sw" style="background:${c}"></i> ${l}`).join(' ')}</span></div>
            <div class="ea-row"><span class="lbl">Hyperpnée</span><select data-a="hv">${Object.entries(HV).map(([k, l]) => `<option value="${k}"${E.act.hv === k ? ' selected' : ''}>${l}</option>`).join('')}</select><input data-a="hvMin" value="${esc(E.act.hvMin)}" placeholder="min" style="width:56px">${ta(`data-a="hvText" placeholder="commentaire">${esc(E.act.hvText)}</textarea>`)}</div>
            <div class="ea-row wrap"><span class="lbl">Autres</span>${OTHER_ACT.map(([k, l]) => `<label class="chip"><input type="checkbox" data-oa="${k}"${E.act.other.includes(k) ? ' checked' : ''}> ${l}</label>`).join('')}${ta(`data-a="otherText" placeholder="résultat, autre méthode…">${esc(E.act.otherText)}</textarea>`)}</div></div>` : ''}
        ${part === 'ictal' ? `<div class="card eeg-evt"><div class="card-h">Événements enregistrés</div>
            <div class="ea-row"><span class="lbl">Crises épileptiques</span><b>${nSz}</b> <span class="muted small">saisies ci-dessus</span></div>
            <div class="ea-row"><span class="lbl">Crises fonctionnelles dissociatives</span><select data-e="pnes"><option value=""${E.events.pnes === '' ? ' selected' : ''}>—</option><option value="0"${String(E.events.pnes) === '0' ? ' selected' : ''}>aucune</option>${[1, 2, 3, 4, 5, 6, 8, 10].map(n => `<option value="${n}"${String(E.events.pnes) === String(n) ? ' selected' : ''}>${n}${n === 10 ? ' et plus' : ''}</option>`).join('')}</select>${ta(`data-e="pnesText" placeholder="sémiologie, contexte, absence de corrélat EEG…">${esc(E.events.pnesText)}</textarea>`)}</div>
            <div class="ea-row wrap"><span class="lbl">Autres manifestations</span>${EVENTS.filter(([k]) => k !== 'pnes').map(([k, l]) => `<label class="chip"><input type="checkbox" data-oe="${k}"${E.events.other.includes(k) ? ' checked' : ''}> ${l}</label>`).join('')}${ta(`data-e="otherText" placeholder="description">${esc(E.events.otherText)}</textarea>`)}</div></div>` : ''}
        ${cats.length ? `<div class="card eeg-mapcard"><div class="card-h">Carte 10-20 <span class="muted">clic : + → ++ → +++ → rien · clic droit : effacer</span></div>
            <div class="eeg-maps edit">${CATS.filter(([k]) => cats.includes(k)).map(([k, l, c]) => `<figure data-cat="${k}"><div class="em-h"><i class="sw" style="background:${css(c)}"></i> <b>${l}</b><span class="spacer"></span><button class="mini-btn" data-clr="${k}" title="effacer la carte">✕</button></div><div class="em-svg"></div><figcaption class="muted small"></figcaption></figure>`).join('')}</div></div>` : ''}`;
      this.bindFields(host.querySelector('.eeg-form'), E, 'exploration');
      host.querySelectorAll('[data-ph]').forEach(b => b.onclick = ev => { ev.preventDefault(); const k = b.dataset.ph, t = host.querySelector(`textarea[data-f="${k}"]`), r = b.getBoundingClientRect(); this.popupMenu([{ head: 'Insérer' }].concat(PHRASES[k].map(p => ({ label: p, run: () => { const pos = t.selectionStart != null && document.activeElement === t ? t.selectionStart : t.value.length, pre = t.value.slice(0, pos), post = t.value.slice(pos), sep = pre && !/\s$/.test(pre) ? ' ' : ''; t.value = pre + sep + p + post; E[k] = t.value; touch(); t.focus(); SV.Grow && SV.Grow.fit(t); const i = (pre + sep + p).indexOf('…'); if (i >= 0) t.setSelectionRange(i, i + 1); } }))), r.left, r.bottom + 4); });
      host.querySelectorAll('[data-sug]').forEach(b => b.onclick = ev => { ev.preventDefault(); const k = b.dataset.sug, tx = this.eegSuggest(ex, SUG[k]), t = host.querySelector(`textarea[data-f="${k}"]`); if (!tx) { this.toast('Rien à proposer : remplissez la carte (pointes, ondes lentes, début des crises) ou les crises', 3500); return; } if (t.value.trim() && !confirm('Remplacer le texte de la rubrique par la proposition ?')) return; t.value = tx; E[k] = tx; touch(); SV.Grow && SV.Grow.fit(t); });
      host.querySelectorAll('[data-a]').forEach(el => { const k = el.dataset.a; el.onchange = el.oninput = () => { E.act[k] = el.type === 'checkbox' ? el.checked : el.value; if (k === 'sliSpectrum') host.querySelector('.sli-spec').hidden = !el.checked; touch(); }; });
      host.querySelectorAll('.sli-f').forEach(b => b.onclick = () => { const f = b.dataset.f, seq = ['', 'drive', 'ppr', 'sz'], cur = E.act.sliFreq[f] || '', nx = seq[(seq.indexOf(cur) + 1) % seq.length]; if (nx) E.act.sliFreq[f] = nx; else delete E.act.sliFreq[f]; b.className = 'sli-f' + (nx ? ' r-' + nx : ''); touch(); });
      host.querySelectorAll('[data-oa]').forEach(c => c.onchange = () => { const k = c.dataset.oa; E.act.other = E.act.other.filter(x => x !== k).concat(c.checked ? [k] : []); touch(); });
      host.querySelectorAll('[data-e]').forEach(el => { const k = el.dataset.e; el.onchange = el.oninput = () => { E.events[k] = el.value; touch(); }; });
      host.querySelectorAll('[data-oe]').forEach(c => c.onchange = () => { const k = c.dataset.oe; E.events.other = E.events.other.filter(x => x !== k).concat(c.checked ? [k] : []); touch(); });
      const drawMap = k => {
        const fig = host.querySelector(`.eeg-maps figure[data-cat="${k}"]`); fig.querySelector('.em-svg').innerHTML = headSVG(E.map[k], k, { edit: true, size: 196 }); fig.querySelector('figcaption').textContent = topoText(E.map[k]) || '—';
        fig.querySelectorAll('.eh-el').forEach(g => { const e = g.dataset.el; g.onclick = () => { const v = ((E.map[k][e] || 0) + 1) % 4; if (v) E.map[k][e] = v; else delete E.map[k][e]; touch(); drawMap(k); }; g.oncontextmenu = ev => { ev.preventDefault(); delete E.map[k][e]; touch(); drawMap(k); }; });
      };
      cats.forEach(drawMap);
      host.querySelectorAll('[data-clr]').forEach(b => b.onclick = () => { const k = b.dataset.clr; if (Object.keys(E.map[k]).length && !confirm('Effacer cette carte ?')) return; E.map[k] = {}; touch(); drawMap(k); });
    },
    /** onglet Intercritique : phase 1 (EEG de scalp) ou SEEG (compte rendu intercritique + tracés) */
    renderInterView(box, st) { return st.kind === 'seeg' ? this.renderInterictalView(box, st) : this.renderP1InterView(box, st); },
    /** phase 1 › Intercritique : compte rendu (fond, anomalies, activation, cartes) et tracés ou captures intercritiques datés,
     *  en ordre chronologique avec la vigilance (pour suivre l'effet du sevrage d'un jour à l'autre) */
    renderP1InterView(box, st) {
      const ex = st.obj;
      box.innerHTML = `<div class="scr-inner wide"><div class="view-head"><h3>Intercritique · ${esc(ex.label)}</h3><span class="muted">EEG de scalp hors crises : repris au staff et dans les rapports</span></div>
        <div class="eeg-grid"><div class="eeg-col" id="p1Inter"></div><div class="eeg-col"><div class="card"><div class="card-h">Tracés et captures intercritiques <span class="muted">datés, veille / sommeil · Ctrl+V pour coller</span></div><div id="p1InterGal"></div></div></div></div></div>`;
      this.eegPart($('p1Inter'), ex, 'inter');
      if (this.renderGallery) this.renderGallery($('p1InterGal'), { explorationId: ex.id, filter: g => !g.seizureId && !['ictal', 'postictal', 'stim'].includes(g.kind), kind: 'interictal' });
    },
    /** textes proposés : intercritique (carte), critique (carte + crises), conclusion (tout) */
    eegSuggest(ex, k) {
      const E = normEeg(ex.eeg || (ex.eeg = {})), d = this.dossier, szs = S.seizuresOfExploration(d, ex.id).filter(z => z.events.length), sp = topoText(E.map.spikes, true), sl = topoText(E.map.slow, true), ic = topoText(E.map.ictal);
      if (k === 'interictal') { const t = []; if (sp) t.push(`Pointes et pointes-ondes ${sp}.`); if (sl) t.push(`Ondes lentes ${sl}.`); return t.join(' '); }
      if (k === 'ictal') { if (!ic && !szs.length) return ''; const hab = szs.filter(z => z.habitual === 'yes').length; return `${szs.length ? `${szs.length} crise${szs.length > 1 ? 's' : ''} enregistrée${szs.length > 1 ? 's' : ''}${hab ? ` (dont ${hab} habituelle${hab > 1 ? 's' : ''})` : ''}. ` : ''}${ic ? `Début électrique en région${/droites|gauches|bilatérales|;/.test(ic) ? 's' : ''} ${ic}.` : ''}`.trim(); }
      if (k === 'conclusion') {
        const t = [], pn = +E.events.pnes || 0;
        if (sp || sl) t.push(`Anomalies intercritiques : ${[sp && 'pointes ' + sp, sl && 'ondes lentes ' + sl].filter(Boolean).join(' ; ')}.`);
        if (szs.length) t.push(`${szs.length} crise${szs.length > 1 ? 's' : ''} épileptique${szs.length > 1 ? 's' : ''}${ic ? ` à début ${ic}` : ''}.`);
        if (pn) t.push(`${pn} crise${pn > 1 ? 's' : ''} fonctionnelle${pn > 1 ? 's' : ''} dissociative${pn > 1 ? 's' : ''}.`);
        if (E.act.sli === 'ppr' || E.act.sli === 'sz') t.push('Photosensibilité (' + SLI[E.act.sli] + ').');
        return t.join(' ');
      }
      return '';
    },
  };
  Object.assign(SV.app, M);
  SV.EegCR = { headSVG, topoText, crHTML, actText, eventsText, normEeg, hasMap, CATS, POS, PRINT_CSS, FIELDS };
})(window.SV = window.SV || {});
