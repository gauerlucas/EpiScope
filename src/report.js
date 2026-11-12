/* EpiScope — report.js : rapports HTML autonomes (imprimables en PDF depuis le navigateur).
 *
 *   build(ctx)            rapport d'une crise (bouton Rapport sans dossier, ou « crise ouverte seule ») ;
 *   wrap(head, body)      document complet : bandeau, styles, visionneuse des images (agrandir, télécharger, imprimer en A4) ;
 *   seizure(ctx, o)       fragment « crise » : séquence, latéralisation, hypothèses (et leur réseau), origines, cibles,
 *                         dynamique ; o.lv = niveau du premier titre (2 : rapport de crise ; 4 : rapport de dossier) ;
 *   implantation(ctx, o)  fragment « schéma d'implantation » (vues SEEG + table) ;
 *   seeg(G, o)            fragments stimulations, thermocoagulations, quantifications.
 * Le rapport de dossier (report_ui.js) assemble ces fragments dans l'ordre du parcours.                           */
(function (SV) {
  'use strict';
  const esc = SV.U.esc;
  const slug = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
  const IMG = (u, name, light) => `<img src="${u}" data-name="${esc(name)}" class="zoomable${light ? ' light' : ''}" title="Cliquer pour agrandir, télécharger ou imprimer en A4 paysage">`;
  const H = (lv, txt, attrs) => `<h${Math.min(6, lv)}${attrs ? ' ' + attrs : ''}>${txt}</h${Math.min(6, lv)}>`;
  const sideFr = s => ({ L: 'gauche', R: 'droite', B: 'bilatéral' }[s] || '—');

  // ------------------------------------------------------------------------------------------------ crise
  function seizure(ctx, o) {
    o = Object.assign({ lv: 2, targets: true, dynamics: true, hypViews: true }, o || {});
    const { db, atlas, result } = ctx, lat = result.lateralization, pL = Math.round(lat.pL * 100), L = o.lv;
    const base = slug(ctx.caseName || 'cas');
    const evRows = ctx.events.slice().sort((a, b) => a.t - b.t).map(e => {
      const s = db.signById.get(e.sign_id); if (!s) return '';
      return `<tr><td class="mono">${SV.fmtT(e.t)}</td><td class="mono">${e.dur ? SV.fmtT(e.dur) : ''}</td><td>${esc(s.label_fr)}</td><td>${sideFr(e.side)}</td><td>${esc(SV.TOPO_LABELS[e.topography] || '')}</td><td>${e.conf === 1 || e.conf == null ? 'certain' : e.conf >= 0.75 ? 'probable' : 'douteux'}</td><td>${esc(e.note || '')}</td></tr>`;
    }).join('');
    const cands = result.candidates.slice(0, o.nCand || 10).map((c, i) => `<tr><td>${i + 1}</td><td>${esc(atlas.label(c.region))}${c.silent ? ' <span class="b">silencieuse possible</span>' : ''}</td><td class="mono">${c.score.toFixed(2)}</td><td>${c.explain.filter(x => x.value > 0.15).map(x => esc(x.sign.label_fr) + (x.direct ? '' : x.via ? ' (via relais)' : ' (lien direct)')).join(' · ')}</td></tr>`).join('');
    const targets = ['L', 'R'].map(hm => {
      const list = result.targets.filter(t => atlas.hemiOf[t.region] === hm); if (!list.length) return '';
      return `${H(L + 1, 'Hémisphère ' + (hm === 'L' ? 'gauche' : 'droit'))}<ul>${list.map(t => `<li><b>${esc(atlas.label(t.region))}</b> <span class="m">— ${[...t.reasons].join(', ')}</span></li>`).join('')}</ul>`;
    }).join('');
    const snaps = (ctx.snapshots || []).map(sn => `<figure><figcaption>${esc(sn.title)}</figcaption><div class="imgs">${sn.imgs.map((u, k) => IMG(u, `EpiScope_${base}_${slug(sn.title)}_${k ? 'medial' : 'lateral'}`)).join('')}</div></figure>`).join('');
    const hc = i => ctx.hypColor ? ctx.hypColor(i) : '#999';
    let html = '';
    if (o.meta) html += o.meta;
    html += `${H(L, 'Séquence sémiologique')}<div class="tl">${ctx.timelineSVG || ''}</div>
<table><tr><th>t</th><th>durée</th><th>signe</th><th>côté</th><th>topographie</th><th>certitude</th><th>note</th></tr>${evRows}</table>
${o.dynamics && snaps ? `${H(L, 'Dynamique d\'activation')}<p class="m">Surfaces colorées par la plausibilité d'activation (cortex et structures profondes) une demi-seconde après chaque signe, faces latérale et médiale de l'hémisphère favorisé.</p>${snaps}` : ''}
${H(L, 'Latéralisation')}<div class="lat"><span class="L" style="width:${pL}%">G ${pL} %</span><span class="R" style="width:${100 - pL}%">D ${100 - pL} %</span></div>
<div class="m">${lat.votes.length ? lat.votes.map(v => esc(v.sign.label_fr) + ' → ' + (v.hemi === 'L' ? 'G' : 'D')).join(' · ') : 'aucun signe latéralisant saisi'}</div>
${H(L, esc(o.hypTitle || 'Hypothèses du réseau épileptogène'))}
${result.latency != null ? `<p class="m">Latence clinique ${SV.fmtT(result.latency)} entre le début EEG et le premier signe.</p>` : ''}
<table><tr><th>#</th><th>réseau</th><th>score</th><th>ordre</th><th>trajectoire (origine → relais → zones [signes])</th><th>n'explique pas</th></tr>${result.hypotheses.map(Hy => `<tr style="border-left:4px solid ${hc(Hy.index)}"><td><b style="color:${hc(Hy.index)}">H${Hy.index + 1}</b></td><td>${esc(Hy.name)} ${Hy.hemi === 'L' ? 'G' : 'D'}${Hy.silent ? ' <span class="b">origine silencieuse ?</span>' : ''}</td><td class="mono">${Hy.score.toFixed(2)}</td><td class="mono">${Hy.nPairs > 0 ? Math.round(Hy.conc * 100) + ' %' : '—'}</td><td>${Hy.trajectory.map(n => (n.origin ? '◉ ' : n.relay ? '° ' : '') + esc(atlas.label(n.region)) + (n.signs.length ? ' [' + n.signs.map(x => esc(x.label_fr)).join(', ') + ']' : '') + ' (' + SV.fmtT(n.t) + ')').join(' → ')}</td><td>${Hy.unexplained.map(x => esc(x.label_fr)).join(', ')}</td></tr>`).join('')}</table>
<p class="m">◉ origine supposée · ° relais de propagation · « ordre » = concordance entre l'ordre d'apparition des signes et l'éloignement des zones depuis l'origine.</p>`;
    if (o.hypViews && ctx.hypothesisViews && ctx.hypothesisViews.length) html += `${H(L + 1, 'Réseau de chaque hypothèse')}
<p class="m">Dynamique conditionnée à l'origine de l'hypothèse, vue à la fin de sa trajectoire ; cortex en verre (première couche), structures profondes visibles. Grosses sphères étiquetées ◆ = hubs du graphe de mise en jeu ; faisceaux denses = liens principaux ; pointillés = synchronisation.</p>
${ctx.hypothesisViews.map(v => `<figure class="hv" style="border-left:4px solid ${v.color}"><figcaption><b style="color:${v.color}">H${v.index + 1}</b> ${esc(v.name)} ${v.hemi === 'L' ? 'gauche' : 'droit'} <span class="m">— origine supposée ${esc(v.origin)} · t = ${SV.fmtT(v.t)}</span></figcaption><div class="imgs">${v.imgs.map((u, k) => IMG(u, `EpiScope_${base}_H${v.index + 1}_${k ? 'medial' : 'lateral'}`)).join('')}</div></figure>`).join('')}`;
    html += `${H(L, 'Régions d\'origine candidates')}<table><tr><th>#</th><th>région (VEP)</th><th>score</th><th>explique</th></tr>${cands}</table>`;
    if (o.targets) html += `${H(L, 'Cibles d\'implantation à discuter')}${targets || '<p class="m">—</p>'}`;
    return html;
  }

  // ------------------------------------------------------------------------------------------------ vues SEEG (grille)
  function fig(v, style, base) { return `<figure${style ? ` style="${style}"` : ''}><figcaption>${esc(v.title)}</figcaption>${IMG(v.img, `EpiScope_${base}_${slug(v.name || v.title)}`, true)}</figure>`; }
  /** grille SEEG : une colonne par hémisphère (latérale en haut, mésiale en miroir en bas), vue supérieure à droite sur deux rangées */
  function views(list, base) {
    if (!list || !list.length) return '';
    if (!list.some(v => v.face)) return `<div class="imgs wrap light">${list.map(v => fig(v, '', base)).join('')}</div>`;
    const hs = ['L', 'R'].filter(hm => list.some(v => v.hemi === hm)), n = hs.length + 1, sup = list.find(v => v.face === 'sup'), inf = list.find(v => v.face === 'inf'), ant = list.find(v => v.face === 'ant');
    let cells = '';
    hs.forEach((hm, i) => { for (const [face, row] of [['lat', 1], ['med', 2]]) { const v = list.find(x => x.hemi === hm && x.face === face); if (v) cells += fig(v, `grid-column:${i + 1};grid-row:${row}`, base); } });
    if (sup) cells += fig(sup, `grid-column:${n};grid-row:1 / span 2;align-self:center`, base);
    if (inf) cells += fig(inf, `grid-column:${n};grid-row:1`, base);   // implantation : inférieur (radiologique) au-dessus de la vue de face
    if (ant) cells += fig(ant, `grid-column:${n};grid-row:2`, base);
    return `<div class="sgrid light" style="grid-template-columns:repeat(${n},1fr)">${cells}</div>`;
  }

  // ------------------------------------------------------------------------------------------------ schéma d'implantation
  function implantation(ctx, o) {
    o = Object.assign({ lv: 2 }, o || {}); const base = slug(ctx.caseName || 'cas');
    if (!ctx.electrodes || !ctx.electrodes.length) return '';
    const realN = ctx.electrodes.filter(e => e.real).length;
    return `${H(o.lv, esc(o.title || 'Schéma d\'implantation SEEG (gabarit fsaverage)'))}
<p class="m">${esc(o.intro || 'Nomenclature conventionnelle (prime = gauche) : électrodes orthogonales au plan sagittal, sauf les insulaires obliques Ia / Im / Ip et l\'OR fronto-orbitaire ; modèles DIXI / Alcis. Une colonne par hémisphère : face latérale en haut, face mésiale en miroir en bas ; à droite, vue supérieure (ou, pour l’implantation, vues inférieure en convention radiologique et de face) ; cortex en verre non coloré ; repères D/G, A/P, S/I.')}</p>
${views(ctx.implantation, base)}
<table><tr><th>électrode</th><th>cible</th><th>modèle</th><th>plots</th><th>long.</th><th>échantillonnage (plot 1 = pointe)</th>${ctx.electrodes.some(e => e.tests) ? '<th>teste</th>' : ''}${realN ? '<th>état</th>' : '<th>cible / entrée (x,y,z)</th>'}<th>remarques</th></tr>${ctx.electrodes.map(e => `<tr><td class="mono"><b>${esc(e.name)}</b></td><td>${esc(e.fr)}</td><td>${esc(e.model)}</td><td class="mono">${e.n}</td><td class="mono">${e.length.toFixed(0)} mm</td><td>${esc(e.contacts)}</td>${ctx.electrodes.some(x => x.tests) ? `<td>${esc(e.tests || '')}</td>` : ''}${realN ? `<td>${e.real ? 'réelle (scanner)' : 'prévue'}${e.origin ? '<div class="m">' + esc(e.origin) + '</div>' : ''}</td>` : `<td class="mono">${e.target ? e.target.map(v => v.toFixed(0)).join(',') : '—'} / ${e.entry.map(v => v.toFixed(0)).join(',')}</td>`}<td>${esc(e.issues)}</td></tr>`).join('')}</table>`;
  }

  // ------------------------------------------------------------------------------------------------ SEEG
  function seeg(G, o) {
    o = Object.assign({ lv: 2 }, o || {}); G = G || {}; const L = o.lv, base = slug(o.caseName || 'cas'); let out = '';
    const dot = c => `<i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${c};vertical-align:middle;margin-right:4px"></i>`;
    if (G.stims) {
      const RESPC = { none: '#808a96', clin: '#50a0ff', ad: '#ffa03c', sz: '#e63c3c' }, C = G.stims.respColors || RESPC;
      const dots = types => types.map(t => `<i title="${esc(t.fr)}" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${t.color};margin-right:2px;vertical-align:middle"></i>`).join('');
      const spark = (hist, maxT) => {
        const W = 140, Hh = 34, x0 = 7, x1 = W - 7, top = Math.max(maxT, 1), bx = mA => x0 + (x1 - x0) * mA / top, byA = new Map();
        for (const hh of hist) { const k = Math.round(hh.mA * 10) / 10; (byA.get(k) || byA.set(k, []).get(k)).push(hh); }
        let svg = `<svg width="${W}" height="${Hh + 12}" viewBox="0 0 ${W} ${Hh + 12}" style="vertical-align:middle"><line x1="${x0}" y1="${Hh}" x2="${x1}" y2="${Hh}" stroke="#c8ccd2"/>`;
        for (const [mA, list] of byA) {
          const RO = ['none', 'func', 'clin', 'subj', 'ad', 'sz']; list.sort((a, b) => RO.indexOf(a.types[0]) - RO.indexOf(b.types[0]));
          list.forEach((hh, k) => { const y = Hh - 9 * (k + 1), main = hh.types[0]; svg += `<rect x="${bx(mA) - 5}" y="${y}" width="10" height="8" rx="1.5" fill="${C[main]}"${hh.types.length > 1 ? ` stroke="${C[hh.types[1]]}" stroke-width="1.6"` : ''}/>`; });
        }
        return svg + `<text x="${x0}" y="${Hh + 10}" font-size="8" fill="#888">0</text><text x="${x1}" y="${Hh + 10}" font-size="8" fill="#888" text-anchor="end">${(Math.round(top * 10) / 10).toLocaleString(SV.LOC)} mA</text></svg>`;
      };
      const table = mode => {
        const P = (G.stims.pairs || []).filter(r => r.mode === mode); if (!P.length) return '<p class="m">—</p>';
        let html = '<table class="stimtab"><tr><th>paire</th><th>structures</th><th>réponses</th><th>intensité efficace</th><th>intensités testées</th><th>détail</th><th>date · heure</th></tr>', grp = null;
        const GF = { sz: 'Crises déclenchées', ad: 'Post-décharges', subj: 'Réponses subjectives', func: 'Réponses fonctionnelles', clin: 'Réponses fonctionnelles', none: 'Sans réponse' };
        for (const r of P) {
          if (r.top !== grp) { grp = r.top; html += `<tr class="grp"><td colspan="7"><i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${C[grp]};margin-right:6px;vertical-align:middle"></i>${GF[grp]}</td></tr>`; }
          html += `<tr><td class="mono"><b>${esc(r.key)}</b></td><td>${esc(r.struct)}</td><td style="white-space:nowrap">${dots(r.types)}</td><td>${r.ranges.length ? r.ranges.map(x => `<div style="white-space:nowrap"><span style="color:${x.color}">●</span> ${esc(x.fr)} : <b class="mono">${esc(x.txt)}</b></div>`).join('') : '<span class="m">—</span>'}</td><td>${spark(r.hist, r.maxT)}<div class="m" style="font-size:10.5px">${esc(r.tested)}</div></td><td>${esc(r.detail)}${r.notes ? `<div class="m"><i>${esc(r.notes)}</i></div>` : ''}</td><td class="mono" style="font-size:11px">${esc(r.when)}</td></tr>`;
        }
        html += '</table>';
        const rows = G.stims.rows.filter(r => r.mode === mode).slice().sort((a, b) => (a.t || '').localeCompare(b.t || ''));
        html += `<details class="stimlog"><summary>Journal détaillé (${rows.length} stimulation${rows.length > 1 ? 's' : ''}, ordre chronologique)</summary><table><tr><th>paire</th><th>mA</th><th>ms · s</th><th>réponses</th><th>détail</th><th>note</th><th>date · heure</th></tr>${rows.map(r => `<tr><td class="mono"><b>${esc(r.p.key)}</b></td><td class="mono">${SV.Seeg.fmtA(r.mA)}</td><td class="mono">${r.pulse} · ${r.dur}</td><td style="white-space:nowrap">${dots(SV.Seeg.stimTypes(r).map(t => ({ fr: SV.Seeg.RESP[t].fr, color: C[t] })))}</td><td>${esc(r.summary)}</td><td>${esc(r.note || '')}</td><td class="mono">${esc(r.date)}${r.date && r.time ? ' · ' : ''}${esc(r.time)}</td></tr>`).join('')}</table></details>`;
        return html;
      };
      out += `${H(L, (o.titles && o.titles.stims) || 'Stimulations corticales')}
<p class="m">Stimulation bipolaire entre plots contigus. <b>Trains 50 Hz</b> (cartographie fonctionnelle, sémiologie provoquée) et <b>chocs 1 Hz</b> (réponse électrique, crises déclenchées, CCEP), par intensités croissantes. Une ligne par paire et par mode, groupées par réponse la plus forte, puis par électrode et du plot le plus profond vers l'extérieur ; « min X mA » = réponse obtenue à X et à toutes les intensités supérieures testées, « [X–Y] mA » = réponse entre X et Y mais pas au-delà.</p>
${G.stims.elecViews && G.stims.elecViews.length ? `${H(L + 1, 'Crises et post-décharges')}<p class="m"><span style="color:${C.sz}">●</span> crise déclenchée · <span style="color:${C.ad}">●</span> post-décharge sans crise (une pastille par paire).</p>${views(G.stims.elecViews, base)}` : ''}
${G.stims.subjViews && G.stims.subjViews.length ? `${H(L + 1, 'Réponses subjectives')}<p class="m"><span style="color:${C.subj}">●</span> paire dont la stimulation a produit une réponse subjective (« début de crise », sensation bizarre, déjà-vu…).</p>${views(G.stims.subjViews, base)}` : ''}
${G.stims.funcViews && G.stims.funcViews.length ? `${H(L + 1, 'Réponses fonctionnelles')}<p class="m"><span style="color:${C.func}">●</span> paire dont la stimulation a produit une réponse fonctionnelle (manque du mot, sensation somesthésique, clonies…).</p>${views(G.stims.funcViews, base)}` : ''}${G.stims.clinViews && G.stims.clinViews.length ? views(G.stims.clinViews, base) : ''}
${H(L + 1, 'Trains 50 Hz — réponses fonctionnelles')}${table('train')}
${H(L + 1, 'Chocs 1 Hz — réponses électriques')}${table('shock')}${G.stims.ccepViews && G.stims.ccepViews.length ? `${H(L + 1, 'Réseau des potentiels évoqués cortico-corticaux (CCEP)')}<p class="m">Liens dirigés des plots stimulés vers les plots de recueil (${G.stims.nCcep} lien${G.stims.nCcep > 1 ? 's' : ''}).</p>${views(G.stims.ccepViews, base)}` : ''}`;
    }
    if (G.thermo) {
      out += `${H(L, (o.titles && o.titles.thermo) || 'Thermocoagulations')}<p class="m">Cibles de thermocoagulation (volume théorique entre les deux plots) : réalisées en rouge, validées par le chirurgien en orange, planifiées en jaune ; pour chaque cible, les stimulations préalables sont rappelées.</p>${views(G.thermo.views, base)}
<table><tr><th>paire</th><th>étape</th><th>structures</th><th>date</th><th>stimulations préalables</th><th>note</th></tr>${G.thermo.rows.map(r => `<tr><td class="mono"><b>${esc(r.key)}</b></td><td><span style="color:${r.statusColor || '#e12d37'}">●</span> ${esc(r.statusFr || 'réalisée')}${r.validatedBy ? `<br><span class="m">${esc(r.validatedBy)}</span>` : ''}</td><td>${esc(r.struct)}</td><td class="mono">${esc(r.date)}</td><td>${esc(r.stims)}</td><td>${esc(r.note)}</td></tr>`).join('')}</table>`;
    }
    if (G.quant && G.quant.length) {
      const grouped = G.quant.some(q => q.group), lv = grouped ? L + 2 : L + 1; let g0 = null;
      out += `${H(L, (o.titles && o.titles.quant) || 'Quantifications')}` + G.quant.map(q => `${grouped && q.group !== g0 ? (g0 = q.group, H(L + 1, esc(q.group || 'Autres analyses'))) : ''}${quantSet(q, { lv, base })}`).join('');
    }
    return out;
  }

  // ------------------------------------------------------------------------------------------------ jeu d'analyse (quantification)
  const fmtV = v => (+v).toLocaleString(SV.LOC, { maximumFractionDigits: 3 });
  /** tableau resserré : plots au-dessus du seuil de la méthode (EI : zone épileptogène ≥ 0,4 puis zone de propagation
   *  0,1–0,4), sinon les 10 valeurs les plus hautes ; tableau complet replié */
  function quantTable(q) {
    const rows = (q.rows || []).slice().sort((a, b) => b.value - a.value), thr = q.thr != null && isFinite(q.thr) ? +q.thr : null, pz = thr != null && q.pz != null && isFinite(q.pz) ? +q.pz : null;
    const top = thr != null ? rows.filter(r => +r.value >= thr) : rows.slice(0, 10), prop = pz != null ? rows.filter(r => +r.value > pz && +r.value < thr) : [];
    const dot = c => `<i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${c};vertical-align:middle;margin-right:4px"></i>`;
    const zone = r => pz == null ? '' : `<td>${+r.value >= thr ? '<b>EZ</b>' : +r.value > pz ? 'PZ' : ''}</td>`;
    const head = `<tr><th>plot</th><th>structures</th><th>${esc(q.name)}</th>${pz != null ? '<th title="EZ : zone épileptogène ; PZ : zone de propagation">zone</th>' : ''}</tr>`, row = r => `<tr><td class="mono"><b>${esc(r.key)}</b></td><td>${esc(r.struct)}</td><td class="mono">${dot(r.color)}${fmtV(r.value)}</td>${zone(r)}</tr>`;
    const shown = top.length + prop.length;
    const lead = thr != null ? (top.length ? `${top.length} plot${top.length > 1 ? 's' : ''} ≥ ${fmtV(thr)}${pz != null ? ' (zone épileptogène)' : ''}` : `aucun plot ≥ ${fmtV(thr)}`) + (pz != null ? ` · ${prop.length} entre ${fmtV(pz)} et ${fmtV(thr)} (zone de propagation)` : '') : `${top.length} valeur${top.length > 1 ? 's' : ''} les plus élevées`;
    return `<p class="m qlead">${lead}${rows.length > shown ? ` (sur ${rows.length} plots)` : ''}</p>${shown ? `<table class="qtop">${head}${top.concat(prop).map(row).join('')}</table>` : ''}${rows.length > shown ? `<details class="qfull"><summary>Tableau complet (${rows.length} plots)</summary><table>${head}${rows.map(row).join('')}</table></details>` : ''}`;
  }
  /** un jeu : titre, réseau éventuel, échelle, vues, tableau resserré ; o { lv, base, title } */
  function quantSet(q, o) {
    o = o || {}; const base = slug(o.base || 'cas');
    return `${H(o.lv || 3, esc(o.title || q.name) + (q.unit ? ` (${esc(q.unit)})` : '') + ` <span class="m">— ${(q.rows || []).length} plots${q.source ? ' · ' + esc(q.source) : ''}</span>`)}${q.net ? `<p class="m">Liens : ${esc(q.net)} — flèche de la voie qui précède vers celle qui suit.</p>` : ''}
${q.views && q.views.length || q.mode ? `<div class="m" style="display:flex;align-items:center;gap:8px;margin:4px 0 8px"><span class="mono">${fmtV(q.min)}</span><i style="display:inline-block;width:160px;height:10px;border-radius:5px;background:${q.mode === 'size' ? '#ffc85a' : q.cmapCss}"></i><span class="mono">${fmtV(q.max)}</span><span>${q.mode === 'size' ? 'taille ∝ valeur' : q.mode === 'both' ? 'couleur et taille ∝ valeur' : 'couleur'}</span></div>` : ''}
${q.views && q.views.length ? views(q.views, base) : ''}${quantTable(q)}${q.regions && q.regions.length ? regionTable(q.regions) : ''}`;
  }
  /** régions candidates d'un jeu « empreinte connectivité » */
  function regionTable(R) {
    return `<p class="m qlead">Régions candidates (empreinte connectivité : reliées aux voies à l’empreinte la plus nette, échantillonnées ou non)</p><table class="qtop"><tr><th>région</th><th>score</th><th>SEEG</th><th>reliée à</th></tr>${R.slice(0, 8).map(x => `<tr><td><b>${esc(x.name)}</b></td><td class="mono">${fmtV(x.score)}</td><td>${x.sampled ? 'échantillonnée' : '<b>non échantillonnée</b>'}</td><td class="m">${(x.via || []).map(([n, f]) => `${esc(n)} ${Math.round(f * 100)} %`).join(' · ')}</td></tr>`).join('')}</table>`;
  }

  // ------------------------------------------------------------------------------------------------ document
  const STYLE = `.eeg-head .eh-skull{fill:#fff;stroke:#1d2330;stroke-width:.018}.eeg-head .eh-nose,.eeg-head .eh-ear{fill:none;stroke:#1d2330;stroke-width:.018}.eeg-head .eh-el circle{fill:#fff;stroke:#1d2330;stroke-width:.012}.eeg-head .eh-el text{font:600 .095px sans-serif;text-anchor:middle;fill:#1d2330}.eeg-maps{display:flex;flex-wrap:wrap;gap:14px;margin:8px 0}.eeg-maps figure{margin:0;text-align:center;max-width:210px;font-size:11px;break-inside:avoid}.eeg-dl dt{font-weight:600;margin-top:6px}.eeg-dl dd{margin:0 0 4px 0}.eeg-concl{margin-top:6px}.galimgs{display:grid;grid-template-columns:1fr;gap:10px;margin:8px 0}.galfig{margin:0;break-inside:avoid}.galfig img{width:100%;border:1px solid #d9dee6;border-radius:6px}.galfig figcaption{font-size:11.5px;color:#5b6576;margin-top:3px}.esl-blk{margin:8px 0 14px;break-inside:avoid}.esl-h{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;margin-bottom:4px}.esl-sm{color:#5b6576;font-size:11.5px}.esi-dot{display:inline-block;width:10px;height:10px;border-radius:50%}.esl-row{display:grid;grid-template-columns:auto minmax(0,1fr);grid-template-areas:"tr tx" "v v";gap:8px 14px;align-items:center}.esl-row img.esl-trace{grid-area:tr;height:60mm;width:auto;max-width:100mm;border:1px solid #d9dee6;border-radius:4px;background:#fff}.esl-row img.esl-trace.old{height:40mm}.esl-txt{grid-area:tx;display:flex;gap:10px;align-items:center;font-size:11.5px;line-height:1.45}.esl-topo{width:30mm;height:auto;flex:none}.esl-v{grid-area:v;display:flex;gap:8px;height:58mm;min-width:0}.esl-v:empty{display:none}.esl-v img{height:100%;width:auto;min-width:0;flex:0 1 auto;object-fit:contain;border-radius:4px}.esi-conc{font-size:11px;padding-left:6px;border-left:3px solid #8a93a3}.esi-conc.ok{border-left-color:#2e9e5b}.esi-conc.mid{border-left-color:#c8a35a}.esi-conc.ko{border-left-color:#c0392b}
dl.zones{display:grid;grid-template-columns:minmax(180px,28%) 1fr;gap:6px 14px;margin:8px 0}dl.zones dt{font-weight:600}dl.zones dd{margin:0}ol.elist>li{margin:6px 0}ol.elist ul{margin:2px 0 0;padding-left:18px;color:#2a3140}
.tblock{margin:6px 0 10px}.tblock .tb-h{margin:0 0 3px}.tblock p{margin:2px 0}.tblock ul,h3+ul{margin:3px 0 6px;padding-left:20px}
table.lestab tr.les-main td{border-top:2px solid #e3e6ea;background:#fafbfc}table.lestab tr.roi-sub td:first-child{padding-left:18px}table.lestab tr.roi-img td{border-bottom:1px solid #e3e6ea;padding:2px 6px 8px}
.roiv{display:grid;gap:4px;margin:2px 0}.roiv-row{display:flex;align-items:center;gap:6px}.roiv-m{width:74px;font-size:11px;color:#5b6576;text-align:right;flex:none}.roiv img{width:150px;height:150px;border-radius:6px;background:#000;cursor:zoom-in}
.gr-rep{margin:6px 0 10px}.gr-rep.two{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.gr-rep figure{margin:0}.gr-rep svg{max-width:100%;height:auto;background:#fff;border:1px solid #e3e6ea;border-radius:6px}
.gr-grid{stroke:#eceff3}.gr-tick{fill:#777;font-size:10px}.gr-ax{fill:#999;font-size:10px}.gr-pl{fill:#888;font-size:9.5px}.gr-band{fill:rgba(42,159,201,.10)}.gr-c{fill:none;stroke:rgba(42,159,201,.55)}.gr-c.med{stroke:#2a9fc9;stroke-width:1.8}.gr-pt{fill:#e08a00;stroke:#333}.gr-pt.out{fill:#d33}.gr-pts-l{fill:none;stroke:#e08a00;stroke-width:1.3}.gr-sep{stroke:#aaa;stroke-dasharray:3 3}
.ms-lab{fill:#222;font-size:10.5px}.ms-sep{stroke:#e3e6ea}.ms-win{fill:rgba(47,143,78,.18);stroke:rgba(47,143,78,.5)}.ms-med{stroke:#2f8f4e;stroke-width:1.6}.ms-cdc{fill:rgba(42,159,201,.8)}.ms-now{stroke:#e08a00;stroke-dasharray:4 3}.ms-pt{fill:#2f8f4e;stroke:#333}.ms-pt.late{fill:#d33}.ms-pt.mid{fill:#e08a00}.ms-pt.early{fill:#2a9fc9}.ms-no{stroke:#999;stroke-dasharray:2 3}.ms-no.late{stroke:#d33}.ms-nolab{fill:#888;font-size:9.5px}.ms-nolab.late{fill:#d33}
.anttab td.no{color:#2f8f4e}.anttab td.yes{color:#c0392b;font-weight:600}.ant-pos{margin:3px 0 4px;padding-left:20px}.ant-neg{margin:3px 0;color:#444}.ant-neg span{color:#2f8f4e;font-weight:600}.ped-notes td{padding:2px 8px 2px 0;vertical-align:top}.ped-notes td:first-child{font-weight:600;white-space:nowrap}.ped-st{color:#c0392b;font-size:.9em}.ped-rep{overflow-x:auto;color:#1d2330;margin:6px 0}.ped-rep svg{max-width:100%;height:auto}.dtab td{padding:3px 6px}

body{font:13px/1.45 Arial,"Liberation Sans","Segoe UI",system-ui,sans-serif;color:#14233a;margin:28px auto;max-width:1000px;padding:0 20px}
h1{font-size:22px;margin:0 0 2px}h1,h2,h3{font-family:Aleo,Georgia,serif}h2{font-size:17px;font-weight:600;color:#19518e;margin:30px 0 8px;border-bottom:2px solid #afa186;padding-bottom:3px}
h3{font-size:14.5px;margin:20px 0 6px;color:#222;border-bottom:1px solid #e3e6ea;padding-bottom:2px}h4{font-size:13.5px;margin:14px 0 4px;color:#333}h5{font-size:12.5px;margin:10px 0 4px;color:#555}
.rhead{display:flex;align-items:center;gap:22px;margin:-28px -20px 18px;padding:18px 26px 16px;background:linear-gradient(135deg,#0f3d6e 0%,#19518e 75%,#1d5c9c 100%);color:#f2f0ea;border-bottom:3px solid #afa186;border-radius:0 0 14px 14px}
.rhead .logo{width:84px;height:84px;object-fit:contain;flex:none;filter:drop-shadow(0 0 14px rgba(255,180,110,.25))}.rhead .appname{font-family:"Bodoni Moda","Didot","Bodoni MT","Georgia",serif;font-weight:500;font-size:34px;line-height:1;letter-spacing:.3px}.rhead .tagline{font-size:10px;letter-spacing:.3em;text-transform:uppercase;color:#c9c4b8;margin-top:6px}
.rhead .rtitle{margin-left:auto;text-align:right;max-width:52%}.rhead h1{font-size:20px;font-weight:600;margin:0;color:#fff}.rhead .sub{font-size:11px;color:#d6dfeb;margin-top:4px;letter-spacing:.04em}
.rmeta{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 16px}.rmeta span{font-size:11px;color:#444;background:#f3f4f6;border:1px solid #e1e4e8;border-radius:999px;padding:2px 9px}
@media print{.rhead{-webkit-print-color-adjust:exact;print-color-adjust:exact;margin:0 0 14px;border-radius:0}}
table{border-collapse:collapse;width:100%;font-size:12.5px}th,td{text-align:left;padding:4px 6px;border-bottom:1px solid #e3e6ea;vertical-align:top}th{background:#f4f6f8;font-weight:600}
.mono{font-family:Consolas,Menlo,monospace}td.mono{white-space:nowrap}.b{display:inline-block;font-size:10.5px;border:1px solid #a48cff;color:#5a3fcf;border-radius:999px;padding:0 6px;margin-left:4px}.m{color:#666}
figure{margin:10px 0;page-break-inside:avoid}figcaption{font-weight:600;margin-bottom:4px}.imgs{display:flex;gap:8px;align-items:center}.caps{display:flex;flex-wrap:wrap;gap:10px;margin:6px 0 10px}.caps figure{width:calc(33.3% - 7px);margin:0}.caps figure img{width:100%;border-radius:6px;border:1px solid #d6dae1;background:#111;cursor:zoom-in}.caps figcaption{font-weight:400;font-size:11.5px;color:#555;margin:3px 0 0}.views{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0}.views figure{width:calc(33.3% - 6px);margin:0}.views img{width:100%;border-radius:8px;background:#0d1016;cursor:zoom-in}.views figcaption{font-weight:400;font-size:11.5px;color:#555}.imgs img{width:calc(50% - 4px);border-radius:8px;background:#0d1016}.imgs.three{justify-content:center}.imgs.three img{width:auto;height:250px;max-width:calc(33.3% - 6px);object-fit:contain}.imgs.wrap{flex-wrap:wrap}.imgs.wrap figure{width:calc(33.3% - 6px);margin:0}.imgs.wrap img{width:100%}.imgs.light img{background:#fff;border:1px solid #e3e6ea}.imgs.three img{width:calc(33.3% - 6px)}
.stimtab tr.grp td{background:#f7f8fa;font-weight:600;font-size:12px;padding-top:7px}.stimlog{margin:6px 0 12px}.stimlog summary{cursor:pointer;color:#555;font-size:12px}.stimlog table{margin-top:6px}@media print{.stimlog{display:none}}.sgrid{display:grid;gap:8px;margin:8px 0}.sgrid figure{margin:0}.sgrid img{width:100%;border-radius:8px;background:#fff;border:1px solid #e3e6ea}figure.hv{padding-left:8px}
.lat{display:flex;height:16px;border-radius:8px;overflow:hidden;width:320px;font-size:11px;font-weight:600;margin:6px 0 10px}.lat span{display:flex;align-items:center;justify-content:center;color:#111}.lat .L{background:#8fb5ff}.lat .R{background:#ffb36b}
.tl svg{width:100%;background:#fff}.tl .sv-ev-label{fill:#111;font-size:11px;font-weight:600}.tl .sv-tl-tick{fill:#777;font-size:10px}.tl .sv-tl-grid{stroke:#eee}.tl .sv-tl-grid.zero{stroke:#999;stroke-dasharray:3 3}.tl .sv-tl-axis{stroke:#bbb}.tl .sv-tl-play,.tl .sv-tl-playlab{display:none}.tl .sv-tl-density{fill:rgba(76,201,240,.25)}.tl .sv-ev-unc{opacity:.2}.tl .sv-tl-eeg{stroke:#2a9fc9;stroke-dasharray:4 3}.tl .sv-tl-tick.eeg{fill:#2a9fc9}
.foot{margin-top:30px;color:#777;font-size:11px;border-top:1px solid #ddd;padding-top:8px}
img.zoomable{cursor:zoom-in}.hint{color:#666;font-size:11.5px;margin:4px 0 8px}
.toc{border:1px solid #e3e6ea;border-radius:10px;padding:8px 14px;margin:8px 0 18px;background:#fafbfc;columns:2}.toc>b{column-span:all;display:block}.toc ul{margin:4px 0;padding:0;list-style:none}.toc li{margin:1px 0;break-inside:avoid}.toc li.l2{font-weight:600;margin-top:4px}.toc li.l3{padding-left:14px}.toc a{color:#1d4f9c;text-decoration:none}.toc .m{font-size:11.5px}
h3.szband{border-bottom:none;font-size:14px;color:#1a1d23}details.qfull{margin:4px 0 12px}details.qfull summary{cursor:pointer;color:#555;font-size:12px}details.qfull table{margin-top:6px}table.qtop{margin-bottom:4px}p.qlead{margin:6px 0 4px}@media print{details.qfull{display:none}}
.callout{border-left:4px solid #afa186;background:#f6f3ec;padding:8px 12px;border-radius:0 8px 8px 0;margin:10px 0 16px}.callout p{margin:3px 0}
.exband{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}.exband .k{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#fff;background:#3b5f9e;border-radius:4px;padding:1px 7px}.exband .k.seeg{background:#8a4fbf}.exband .k.phase1{background:#2f8a6b}
.szband{background:#f4f6f8;border-radius:8px;padding:5px 10px;margin:18px 0 6px;display:flex;gap:10px;flex-wrap:wrap;align-items:baseline}.szband b{font-size:14px}
.chip{display:inline-block;font-size:11px;border:1px solid #d7dbe1;border-radius:999px;padding:0 7px;margin:0 3px 2px 0;color:#444}
.conc td.lv{text-align:center;font-weight:600}.vpp{background:#cfeedd}.vp{background:#e7f6ee}.vm{background:#f8dcdc}.vq{background:#fff3cf}.nt{font-weight:400;font-size:10.5px;color:#5b6576;text-align:left}
.hyp{border-left:4px solid #4ea8ff;padding:2px 12px;margin:10px 0;break-inside:avoid}.hyp h4{margin-top:6px}.shots img{height:170px;margin-right:8px;border-radius:6px;background:#0d1016}
.smx td,.smx th{text-align:center;padding:2px 4px;font-size:11.5px}.smx td:first-child,.smx th:first-child{text-align:left}.smx th.hab{color:#2f8a6b}
.regchip{display:inline-block;font-size:11.5px;border-radius:4px;padding:0 5px;margin:1px 2px;background:#eef1f5}.regchip.ez{background:#fde2d6}
#lb{display:none;position:fixed;inset:0;background:rgba(8,10,14,.9);z-index:50;flex-direction:column;align-items:center;justify-content:center;gap:10px}#lb.on{display:flex}
#lb img{max-width:96vw;max-height:86vh;background:#0d1016;border-radius:6px;box-shadow:0 10px 40px rgba(0,0,0,.6)}#lb img.light{background:#fff}
#lb .lb-bar{display:flex;gap:10px;align-items:center}#lb .lb-bar a,#lb .lb-bar button{font:13px "Segoe UI",system-ui,sans-serif;color:#fff;background:#2a3444;border:1px solid #4a5668;border-radius:8px;padding:6px 12px;text-decoration:none;cursor:pointer}
#lb .lb-bar a:hover,#lb .lb-bar button:hover{background:#3a4658}#lb .lb-bar span{color:#aab;font-size:12px}
@media print{body{margin:0}h2,h3,h4{page-break-after:avoid}.pb{page-break-before:always}.toc{display:none}
 body.lb-print>*:not(#lb){display:none!important} body.lb-print #lb{display:flex;position:static;background:#fff;height:auto}
 body.lb-print #lb img{max-width:100%;max-height:185mm;width:auto;box-shadow:none;border-radius:0} body.lb-print #lb .lb-bar{display:none}}`;
  /** v5 — copie riche depuis le rapport ouvert dans le navigateur : bouton ⧉ sur chaque tableau et figure (HTML + texte,
   *  collage dans Word / PowerPoint / mail) ; absent à l'impression */
  const CLIPJS = `<style>
.cpw{position:relative}.cpb{position:absolute;top:2px;right:2px;z-index:30;width:24px;height:24px;border-radius:6px;border:1px solid #cfd5de;background:#fff;color:#6b7484;cursor:pointer;font:13px/22px system-ui;text-align:center;opacity:0;transition:opacity .15s}
.cpw:hover>.cpb{opacity:.9}.cpb:hover{color:#0d1016;border-color:#4cc9f0}.cpb.ok{color:#1d9a4a;border-color:#1d9a4a;opacity:1}@media print{.cpb{display:none!important}}
</style>
<script>
(function(){
  var CSS='table{border-collapse:collapse;font:10.5pt Calibri,Arial,sans-serif}th,td{border:1px solid #999;padding:2px 6px;vertical-align:top}th{background:#eee;text-align:left}';
  function txt(el){var rows=[].slice.call(el.querySelectorAll('tr'));if(rows.length)return rows.map(function(tr){return [].slice.call(tr.children).map(function(td){return td.innerText.replace(/\\s+/g,' ').trim();}).join('\\t');}).join('\\n');return el.innerText;}
  function clone(el){var c=el.cloneNode(true);[].slice.call(c.querySelectorAll('button,.cpb,details,[hidden]')).forEach(function(x){x.remove();});[].slice.call(c.querySelectorAll('canvas')).forEach(function(cv){try{var im=document.createElement('img');im.src=cv.toDataURL('image/png');cv.replaceWith(im);}catch(e){cv.remove();}});return c;}
  function copy(el,b){var c=clone(el),html='<!doctype html><html><head><meta charset="utf-8"><style>'+CSS+'</style></head><body>'+c.outerHTML+'</body></html>',t=txt(c);
    var done=function(ok){b.textContent=ok?'✓':'✗';b.classList.toggle('ok',ok);setTimeout(function(){b.textContent='⧉';b.classList.remove('ok');},1400);};
    if(navigator.clipboard&&window.ClipboardItem){navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([html],{type:'text/html'}),'text/plain':new Blob([t],{type:'text/plain'})})]).then(function(){done(true);},function(){navigator.clipboard.writeText(t).then(function(){done(true);},function(){done(false);});});}
    else if(navigator.clipboard)navigator.clipboard.writeText(t).then(function(){done(true);},function(){done(false);});}
  [].slice.call(document.querySelectorAll('table, figure, .fig, .views, .shot, .hyp, .card')).forEach(function(el){if(el.closest('#lb,#stoc,.cpw'))return;var b=document.createElement('button');b.className='cpb';b.type='button';b.textContent='⧉';b.title='Copier (texte mis en forme) — collage dans Word, PowerPoint, mail';b.onclick=function(e){e.stopPropagation();e.preventDefault();copy(el,b);};el.classList.add('cpw');el.appendChild(b);});
})();
</script>`;
  /** sommaire latéral qui suit la lecture (titres h2 / h3) : section en cours surlignée, clic pour s'y rendre ; replié en bouton
   *  sur un écran étroit ; absent à l'impression (le sommaire statique éventuel est alors masqué à l'écran) */
  const SIDETOC = `<style>
#stoc{box-sizing:border-box;position:fixed;top:24px;left:16px;width:228px;max-height:calc(100vh - 48px);overflow:auto;font:12px/1.4 "Segoe UI",system-ui,sans-serif;background:rgba(255,255,255,.96);border:1px solid #e6e9ee;border-radius:12px;padding:10px 8px 12px 10px;z-index:40;box-shadow:0 6px 24px rgba(16,24,40,.08);scrollbar-width:thin}
#stoc>b{display:block;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#8a93a3;margin:0 0 8px 8px}
#stoc a{display:block;color:#4a5363;text-decoration:none;padding:3px 8px;border-radius:6px;border-left:2px solid transparent;margin:1px 0;transition:background .15s}
#stoc a.l3{padding-left:20px;font-size:11.5px;color:#6b7484}#stoc a:hover{background:#f1f3f6}
#stoc a.par{color:#0d1016;font-weight:600}#stoc a.on{color:#19518e;font-weight:600;border-left-color:#19518e;background:#eef3f9}
#stocBtn{position:fixed;left:16px;bottom:16px;z-index:41;display:none;font:12.5px "Segoe UI",system-ui,sans-serif;background:#fff;border:1px solid #d6dae1;border-radius:999px;padding:7px 14px;cursor:pointer;box-shadow:0 4px 14px rgba(16,24,40,.12)}
body.stoc-narrow #stoc{display:none;top:auto;bottom:62px;max-height:min(70vh,calc(100vh - 90px))}body.stoc-narrow #stoc.open{display:block}body.stoc-narrow #stocBtn{display:block}
body.stoc .toc{display:none}
@media print{#stoc,#stocBtn{display:none!important}body.stoc .toc{display:none}}
</style>
<script>
(function(){
  var hs=[].slice.call(document.querySelectorAll('h2,h3')).filter(function(h){return !h.closest('header,#lb,details,.toc,#stoc')&&h.textContent.trim();});
  if(hs.length<3)return;
  var nav=document.createElement('nav');nav.id='stoc';var TOC=document.documentElement.lang==='en'?'Contents':'Sommaire';nav.innerHTML='<b>'+TOC+'</b>';var btn=document.createElement('button');btn.id='stocBtn';btn.textContent='☰ '+TOC;
  var links=hs.map(function(h,i){if(!h.id)h.id='sec'+(i+1);var a=document.createElement('a');a.href='#'+h.id;a.className=h.tagName==='H3'?'l3':'l2';var t=h.cloneNode(true);[].slice.call(t.querySelectorAll('.m,small,.chip')).forEach(function(x){x.remove();});a.textContent=t.textContent.trim().replace(/\\s+/g,' ').slice(0,70);a.title=a.textContent;
    a.onclick=function(e){e.preventDefault();h.scrollIntoView({behavior:'smooth',block:'start'});history.replaceState(null,'','#'+h.id);nav.classList.remove('open');};nav.appendChild(a);return a;});
  document.body.appendChild(nav);document.body.appendChild(btn);document.body.classList.add('stoc');
  btn.onclick=function(){nav.classList.toggle('open');};
  // placement : à gauche du texte avec une marge franche (≥ 44 px), sous le bandeau tant qu'il est visible ; s'il n'y a pas la
  // place, bouton « Sommaire » en bas à gauche (le volet s'ouvre au-dessus), jamais sur le bandeau ni sur le texte
  var head=document.querySelector('header.rhead'),GAP=44;
  function place(){var L=document.body.getBoundingClientRect().left,W=Math.min(236,L-GAP-14),narrow=W<168;document.body.classList.toggle('stoc-narrow',narrow);
    if(narrow){nav.style.left='16px';nav.style.top='';nav.style.width='';return;}nav.style.width=W+'px';nav.style.left=(L-GAP-W)+'px';
    var hb=head?head.getBoundingClientRect().bottom:0;nav.style.top=Math.max(24,hb+18)+'px';nav.style.maxHeight='calc(100vh - '+(Math.max(24,hb+18)+24)+'px)';}
  window.addEventListener('resize',place);
  var cur=-1,pend=false;function spy(){pend=false;place();var k=0;for(var i=0;i<hs.length;i++){if(hs[i].getBoundingClientRect().top<=90)k=i;else break;}
    if(window.innerHeight+window.scrollY>=document.body.scrollHeight-4)k=hs.length-1;if(k===cur)return;cur=k;
    links.forEach(function(a,i){a.classList.toggle('on',i===k);a.classList.remove('par');});var p=k;while(p>=0&&hs[p].tagName!=='H2')p--;if(p>=0&&p!==k)links[p].classList.add('par');
    var a=links[k],r=a.getBoundingClientRect(),R=nav.getBoundingClientRect();if(r.top<R.top+24||r.bottom>R.bottom-8)nav.scrollTop+=r.top-R.top-R.height/3;}
  window.addEventListener('scroll',function(){if(!pend){pend=true;requestAnimationFrame(spy);}},{passive:true});place();spy();
})();
</script>`;
  const LIGHTBOX = `<div id="lb"><img alt=""><div class="lb-bar"><a id="lbDl" download>Télécharger l'image</a><button id="lbPrint">Imprimer cette vue (A4 paysage)</button><button id="lbClose">Fermer</button><span>Échap pour fermer · clic hors de l'image pour fermer</span></div></div>
<script>
(function(){
  var lb=document.getElementById('lb'),img=lb.querySelector('img'),dl=document.getElementById('lbDl');
  function open(i){img.src=i.src;img.className=i.classList.contains('light')?'light':'';dl.href=i.src;dl.download=(i.dataset.name||'EpiScope_vue')+(i.src.indexOf('image/jpeg')>0?'.jpg':'.png');lb.classList.add('on');}
  Array.prototype.forEach.call(document.querySelectorAll('img.zoomable'),function(i){i.addEventListener('click',function(){open(i);});});
  document.getElementById('lbClose').onclick=function(){lb.classList.remove('on');};
  lb.addEventListener('click',function(e){if(e.target===lb)lb.classList.remove('on');});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')lb.classList.remove('on');});
  document.getElementById('lbPrint').onclick=function(){var st=document.createElement('style');st.textContent='@page{size:A4 landscape;margin:8mm}';document.head.appendChild(st);document.body.classList.add('lb-print');window.print();setTimeout(function(){document.body.classList.remove('lb-print');st.remove();},800);};
})();
</script>`;
  /** document complet : head = { title, subtitle, brand, logo, font, meta: [texte des pastilles], foot } */
  function wrap(head, body) {
    const B = Object.assign({ name: 'EpiScope', tagline: 'Visualize seizures', credit: '', year: new Date().getFullYear() }, head.brand || {});
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(B.name)} — ${esc(head.title || 'rapport')}</title>
<style>${head.font ? `@font-face{font-family:"Bodoni Moda";src:url(${head.font}) format("woff2");font-weight:500}` : ''}${head.serif ? `@font-face{font-family:"Aleo";src:url(${head.serif}) format("woff2");font-weight:100 900}` : ''}${STYLE}</style></head><body>
<header class="rhead">${head.logo ? `<img class="logo" src="${head.logo}" alt="">` : ''}<div><div class="appname">${esc(B.name)}</div><div class="tagline">${esc(B.tagline)}</div></div><div class="rtitle"><h1>${esc(head.title || '')}</h1><div class="sub">${esc(head.subtitle || '')} · ${new Date().toLocaleDateString(SV.LOC, { day: 'numeric', month: 'long', year: 'numeric' })}</div></div></header>
${head.meta && head.meta.length ? `<div class="rmeta">${head.meta.map(m => `<span>${esc(m)}</span>`).join('')}</div>` : ''}
${body}
${LIGHTBOX}
${SIDETOC}
${CLIPJS}
<div class="foot">${esc(B.name)} ${B.credit ? '(' + esc(B.credit) + ' ' + B.year + ')' : ''}, prototype de recherche non validé pour un usage clinique. ${esc(head.foot || 'Les plausibilités affichées résultent d\'une base de référence éditable (littérature SEEG et stimulation, Semio2Brain) et d\'un modèle de propagation sur réseau ; elles alimentent la discussion anatomo-électro-clinique et ne constituent pas une localisation.')}</div>
</body></html>`;
  }
  function paramsLine(p, connectome) { return `<div class="mono m">gain de propagation ${p.prop_gain} · persistance ${p.persist} · λ distance ${p.dist_lambda} mm · homotopique ${p.homotopic} · poids Semio2Brain ${p.s2b_weight} · τ origine ${p.onset_tau} s · relais ${p.relay_gain}${connectome ? ' · ' + esc(connectome) : ''}</div>`; }

  /** rapport d'une crise (format historique) */
  function build(ctx) {
    const { db } = ctx, meta = [`dominance hémisphérique ${ctx.patient.dominant === 'R' ? 'droite' : 'gauche'}`];
    if (ctx.patient.eeg_onset != null) meta.push(`début EEG à ${SV.fmtT(ctx.patient.eeg_onset)} du premier signe`);
    if (ctx.patient.seizure_end != null) meta.push(`fin clinique à ${SV.fmtT(ctx.patient.seizure_end)}`);
    if (ctx.patient.state) meta.push(ctx.patient.state === 'sleep' ? 'sommeil' : 'veille');
    meta.push('atlas VEP (fsaverage5)', `base ${db.meta.version || ''} (${(db.meta.built || '').slice(0, 10)})`, new Date().toLocaleString(SV.LOC));
    const body = seizure(ctx, { lv: 2 }) + implantation(ctx, { lv: 2 }) + seeg(ctx.seeg, { lv: 2, caseName: ctx.caseName }) + `<h2>Paramètres du modèle</h2>${paramsLine(ctx.result.params, ctx.connectome)}`;
    return wrap({ title: ctx.caseName || 'cas sans nom', subtitle: 'Compte rendu anatomo-électro-clinique', brand: ctx.brand, logo: ctx.logo, font: ctx.font, meta }, body);
  }

  SV.Report = { build, wrap, seizure, implantation, seeg, views, quantSet, quantTable, paramsLine, esc, slug, IMG, SIDETOC };
})(window.SV = window.SV || {});
