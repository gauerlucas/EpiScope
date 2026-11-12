/* EpiScope — rec_cards.js (v5.7, v5.8) : onglet Analyses — une carte par tracé importé (scalp ou SEEG), ses post-traitements dessous.
 *
 *   Trois usages : le neurologue qui monte le dossier au fil des jours (import, relecture, essais d'analyse, captures), celui
 *   qui fait la synthèse un mois plus tard (retrouver vite ce qui compte, étoiler ce qui ira au staff et au compte rendu), les
 *   collègues du staff (un clic pour revoir le tracé à l'instant montré, voir staff_present.js).
 *   - tracés rangés par jour (J1, J2… depuis le début de l'exploration) dans l'ordre de leur début (en-tête EDF / BrainVision,
 *     sinon date d'import) ; filtres crises / intercritique et veille / sommeil (une nuit avec deux crises est des quatre) ;
 *   - en-tête : titre, heure de début et durée, nature, vigilance (stadification, sinon choisie dans ⋯), pastilles des crises
 *     du tracé (clic : le tracé au début de la crise ; ✎ : sa fiche et sa sémiologie ; ▶ : sa vidéo) ; un début de crise annoté
 *     dans le fichier sans crise décrite propose « ＋ crise » (fiche créée à l'heure du tracé, puis la sémiologie) ;
 *   - post-traitements : pointes (détecteur, groupes), sommeil (hypnogramme), imagerie de source (★ : retenue pour le staff
 *     et les comptes rendus), jeux d'analyse SEEG, captures de pages du tracé (clic : le tracé à cet instant) ;
 *   - à l'import, une crise du dossier dont l'heure tombe dans le tracé lui est rattachée (début posé à cette heure).      */
(function (SV) {
  'use strict';
  const A = SV.app, ST = SV.Store, U = SV.U, esc = U.esc, h = U.h, $ = U.$;
  const pad = n => String(n).padStart(2, '0'), hm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const dur = s => { s = Math.round(s || 0); return s >= 3600 ? `${Math.floor(s / 3600)} h ${pad(Math.floor(s % 3600 / 60))}` : s >= 60 ? `${Math.floor(s / 60)} min` : `${s} s`; };
  const clock = t => { const s = Math.max(0, Math.round(t || 0)); return s >= 3600 ? `${Math.floor(s / 3600)}:${pad(Math.floor(s % 3600 / 60))}:${pad(s % 60)}` : `${Math.floor(s / 60)}:${pad(s % 60)}`; };
  const VIG = { wake: 'veille', nrem: 'sommeil', rem: 'sommeil paradoxal', mixed: 'veille et sommeil' };
  const isVid = g => /^video\//.test((g && g.mime) || '');

  const M = {
    /** nature d'un tracé : début (Date), crises, critique / intercritique, vigilance (choisie, sinon d'après la stadification) */
    recInfo(r) {
      const t0 = this.ieegRecStart ? this.ieegRecStart(r) : null, szIds = this.ieegRecSeizures ? this.ieegRecSeizures(r) : [], ict = szIds.length > 0 || this.ieegKind(r) === 'ictal';
      const inter = !ict || r.inter === true || (r.inter !== false && (r.duration || 0) >= 1800);   // tracé long avec crises : aussi intercritique
      let vig = r.vigil || '', auto = false; const st = r.sleep && r.sleep.stages;
      if (!vig && st && st.length) { const sl = (String(st).match(/[123R]/g) || []).length / st.length; vig = sl > 0.9 ? 'nrem' : sl < 0.05 ? 'wake' : 'mixed'; auto = true; }
      return { t0, when: t0 || (r.created ? new Date(r.created) : null), szIds, ict, inter, vig, auto, wake: vig === 'wake' || vig === 'mixed', sleep: ['nrem', 'rem', 'mixed'].includes(vig) };
    },
    /** carte des tracés d'une exploration, insérée en tête de box ; o.kind 'scalp' | 'seeg' */
    recCardsRender(box, ex, o) {
      const d = this.dossier, recs = ex.recordings || (ex.recordings = []), F = (this.ui.recF = this.ui.recF || {})[ex.id] || (this.ui.recF[ex.id] = { k: '', v: '' }), closed = this.ui.recClosed || (this.ui.recClosed = {});
      const info = new Map(recs.map(r => [r, this.recInfo(r)])), pass = r => { const I = info.get(r); return (!F.k || (F.k === 'ict' ? I.ict : I.inter)) && (!F.v || (F.v === 'wake' ? I.wake : I.sleep)); };
      const n = f => recs.filter(r => f(info.get(r))).length, scalp = o.kind === 'scalp';
      const seg = (key, L) => `<span class="seg rc-f" data-f="${key}">${L.map(([v, l, c]) => `<button data-v="${v}" class="${F[key] === v ? 'on' : ''}">${l}${c != null ? ` <span class="m">${c}</span>` : ''}</button>`).join('')}</span>`;
      // jours : J1 = début de l'exploration (sinon le premier tracé)
      const sorted = recs.filter(pass).sort((a, b) => (info.get(a).when || 0) - (info.get(b).when || 0)), first = ex.start ? new Date(ex.start + 'T00:00') : (info.get(sorted[0]) || {}).when;
      const day = w => { if (!w) return { k: '~', l: 'date inconnue' }; const k = `${w.getFullYear()}-${pad(w.getMonth() + 1)}-${pad(w.getDate())}`, j = first ? Math.round((new Date(k + 'T00:00') - new Date(first.getFullYear(), first.getMonth(), first.getDate())) / 864e5) + 1 : null;
        return { k, l: `${j != null && j >= 1 && j <= 90 ? 'J' + j + ' · ' : ''}${w.toLocaleDateString(SV.LOC, Object.assign({ weekday: 'short', day: 'numeric', month: 'short' }, first && w.getFullYear() !== first.getFullYear() ? { year: 'numeric' } : {}))}` }; };   // J1 = début de l'exploration
      let list = '', cur = null; for (const r of sorted) { const D = day(info.get(r).when); if (D.k !== cur) { cur = D.k; list += `<div class="rc-day">${esc(D.l)}</div>`; } list += this.recCardHtml(r, info.get(r), ex, o, !!closed[r.id]); }
      const orphans = (ex.esi || []).filter(x => !recs.some(r => r.id === x.recId));
      const card = h('div', 'ie-card rc-card');
      card.innerHTML = `<div class="ie-head"><b>${scalp ? 'Tracés EEG de scalp' : 'Tracés SEEG'}</b><span class="muted">${recs.length || ''}</span><span class="spacer"></span><button class="rc-add${recs.length ? '' : ' primary'}">＋ Importer un tracé…</button><input type="file" class="rc-file" multiple hidden accept=".vhdr,.vmrk,.eeg,.edf,.bdf,.tsv,.json"></div>
        ${recs.length ? `<div class="rc-filters">${seg('k', [['', 'Tous', recs.length], ['ict', 'Crises', n(I => I.ict)], ['inter', 'Intercritique', n(I => I.inter)]])}${seg('v', [['', 'Toute vigilance'], ['wake', 'Veille', n(I => I.wake)], ['sleep', 'Sommeil', n(I => I.sleep)]])}</div>` : ''}
        ${recs.length ? list || '<div class="hint">Aucun tracé ne répond aux filtres.</div>' : `<div class="hint">EDF / BDF, BrainVision (.vhdr + .eeg + .vmrk)${scalp ? ' : électrodes 10-20 reconnues par leur nom (Fp1… O2, T3/T7…)' : ', ou .eeg d’un dossier BIDS (channels.tsv, _ieeg.json)'}. Le fichier est rangé dans le dossier du patient ; rien ne quitte le poste. Une crise du dossier dont l’heure tombe dans le tracé lui est rattachée.</div>`}
        ${o.after || ''}
        ${orphans.length ? `<div class="rc-day">Autres résultats</div><div class="rc-post">${this.esiRowsHtml(orphans)}</div>` : ''}
        ${scalp ? `<div class="hint small">Modèle de tête : ${this.esiHeadCfg().model === 'bem' ? 'BEM réaliste à 3 couches' : 'sphère à 3 couches'} sur ${this.patientAnat ? 'l’IRM du patient (vue 3D en « Patient »)' : 'la tête du gabarit'}. <a href="#" class="esi-hd">Modèle de tête…</a></div>` : ''}`;
      box.insertBefore(card, box.firstChild);
      this.recCardsBind(card, ex, o);
    },
    recCardHtml(r, I, ex, o, shut) {
      const d = this.dossier, SZ = d.seizures || [], mkOf = id => (r.seizureId === id ? r.marks : ((r.bySz || {})[id] || {}).marks) || {}, scalp = o.kind === 'scalp';
      const meta = [I.t0 ? hm(I.t0) : '', dur(r.duration), `${r.nch} voies`].filter(Boolean).join(' · ');
      const sz = I.szIds.map(id => { const z = ST.byId(SZ, id), m = mkOf(id), vid = z && this.videoLinked && this.videoLinked(z); return z ? `<span class="rc-sz"><button class="rc-szgo" data-sz="${id}" title="Ouvrir le tracé au début de ${esc(z.label)}">${esc(z.label)}${m.onset != null ? ' · ' + clock(m.onset) : ' · <i>début ?</i>'}</button><button class="rc-szinfo" data-sz="${id}" title="Fiche et sémiologie de ${esc(z.label)}">✎</button>${vid ? `<button class="rc-szvid" data-sz="${id}" title="Vidéo de ${esc(z.label)}">▶</button>` : ''}</span>` : ''; }).join('');
      const free = !r.seizureId && r.marks && r.marks.onset != null ? `<button class="rc-szadd" title="Début de crise annoté dans le fichier, sans crise décrite : créer la fiche de la crise (date et heure du tracé), puis décrire sa sémiologie">＋ crise annotée à ${clock(r.marks.onset)}</button>` : '';
      const tags = `${I.ict ? '<span class="rc-k ict">crise' + (I.szIds.length > 1 ? 's' : '') + '</span>' : ''}${I.inter ? '<span class="rc-k">intercritique</span>' : ''}${I.vig ? `<span class="rc-k vig" title="${I.auto ? 'd’après la stadification du sommeil' : 'vigilance choisie (⋯)'}">${VIG[I.vig]}</span>` : ''}`;
      const post = shut ? '' : this.recPostHtml(r, ex, o);
      return `<div class="rc${shut ? ' closed' : ''}" data-r="${r.id}"><div class="rc-h"><button class="rc-fold" title="replier / déplier">${shut ? '▸' : '▾'}</button><div class="rc-t"><b title="${esc(r.title)}">${esc(r.title)}</b><span class="rc-m">${esc(meta)}</span></div>
          ${scalp ? `<button class="rc-elec${this._esiElecOnly && this._esiElecOnly.rec === r ? ' on' : ''}" title="Électrodes de ce tracé sur le scalp du modèle de tête (3D) : vérifier, replacer à la souris, clic droit : exclure">Électrodes</button>` : ''}<button class="rc-open" title="Ouvrir le tracé : relecture, marques, panneau d’analyse">Ouvrir</button><button class="rc-more" title="Nature, vigilance, crises, renommer, supprimer">⋯</button></div>
        <div class="rc-tags">${tags}${sz}${free}${(r.warnings || []).length ? `<span class="rc-warn" title="${esc(r.warnings.join('\n'))}">⚠</span>` : ''}</div>
        ${post ? `<div class="rc-post">${post}</div>` : ''}</div>`;
    },
    /** post-traitements d'un tracé : pointes, sommeil, sources, jeux SEEG, captures */
    recPostHtml(r, ex, o) {
      const d = this.dossier, out = [], Lr = r.esp && r.esp.last;
      if (Lr && o.kind === 'scalp') { const det = { spikenet: 'SpikeNet', janca: 'Janča', morph: 'morphologique', ext: 'externe' }[Lr.det] || Lr.det || '', mins = Lr.mins || ((Lr.end || 0) - (Lr.start || 0)) / 60;
        out.push(`<div class="rc-p click" data-go="esp" title="Ouvrir le tracé sur les pointes (groupes, moyenne, source)"><span class="rc-pk">Pointes</span><span class="rc-pv">${[esc(det), `${Lr.n} pointe${Lr.n > 1 ? 's' : ''}${mins > 0 ? ` en ${Math.round(mins)} min` : ''}`, `${Lr.clusters.length} groupe${Lr.clusters.length > 1 ? 's' : ''}`, (m => m ? `◆ ${m} ajoutée${m > 1 ? 's' : ''} à la main` : '')(Lr.events.filter(e => e.m && !e.x).length)].filter(Boolean).join(' · ')}</span><span class="rc-cl">${Lr.clusters.slice(0, 8).map(c => `<i style="background:${this.esiClColor(c.k)}" title="groupe ${c.k + 1} : ${c.n} pointes (${c.rate}/min)"></i>`).join('')}</span></div>`); }
      const S = r.sleep; if (S && S.stages && this.slpStats) { const T = this.slpStats(S);
        out.push(`<div class="rc-p click" data-go="slp" title="Ouvrir le tracé sur la stadification du sommeil"><span class="rc-pk">Sommeil</span><span class="rc-hyp">${this.slpHypnoSvg(S, 260, 34, true)}</span><span class="rc-pv">sommeil ${dur(T.tst * 60)} · N3 ${Math.round(T.pct('3') * 100)} % · SP ${Math.round(T.pct('R') * 100)} %${(n => n ? ` · ${n} époque${n > 1 ? 's' : ''} corrigée${n > 1 ? 's' : ''}` : '')(this.slpEdits(S).n)}</span></div>`); }
      if (o.kind === 'seeg') { const sets = this.recSeegSets(r); if (sets.length) out.push(`<div class="ie-sets qx-list">${sets.map(q => this.quantRowHtml(q, { label: q.name.replace(' · ' + r.title, '').replace(/ · $/, '') || q.name })).join('')}</div>`); }
      const es = (ex.esi || []).filter(x => x.recId === r.id); if (es.length) out.push(this.esiRowsHtml(es));
      const caps = (d.gallery || []).filter(g => g.src && g.src.recId === r.id).sort((a, b) => a.src.t - b.src.t);
      if (caps.length) out.push(`<div class="rc-p"><span class="rc-pk">Captures</span><span class="rc-caps">${caps.map(g => `<button class="rc-cap" data-g="${g.id}" title="${esc(g.title || '')} — ouvrir le tracé à cet instant">${clock(g.src.t)}</button>`).join('')}</span></div>`);
      if (!out.length) out.push(`<div class="rc-none">${o.kind === 'scalp' ? 'Ouvrir le tracé : pointes → source, début de crise → source, sommeil.' : 'Ouvrir le tracé : EI, cEI, PEI, h², pointes et HFO…'}</div>`);
      return out.join('');
    },
    recSeegSets(r) { return ((this.state && this.state.quant) || []).filter(q => q.ieeg === r.id && !q.eimax && !q.smax).sort((a, b) => this.quantMethodRank(a) - this.quantMethodRank(b)); },
    recCardsBind(card, ex, o) {
      const recs = ex.recordings, F = this.ui.recF[ex.id], closed = this.ui.recClosed, re = () => this.renderQuant(), touch = what => this.touch('exploration', ex.id, what || 'tracé');
      const inp = card.querySelector('.rc-file'); card.querySelector('.rc-add').onclick = () => { inp.value = ''; inp.click(); }; inp.onchange = () => { if (inp.files.length) this.ieegImport([...inp.files]); };
      card.ondragover = e => { if ([...(e.dataTransfer.items || [])].some(i => i.kind === 'file')) { e.preventDefault(); card.classList.add('drag'); } }; card.ondragleave = () => card.classList.remove('drag');
      card.ondrop = e => { e.preventDefault(); card.classList.remove('drag'); const f = [...e.dataTransfer.files]; if (f.length) this.ieegImport(f); };
      card.querySelectorAll('.rc-f').forEach(s => s.querySelectorAll('button').forEach(b => b.onclick = () => { F[s.dataset.f] = b.dataset.v; re(); }));
      const hd = card.querySelector('.esi-hd'); if (hd) hd.onclick = e => { e.preventDefault(); this.esiHeadDialog(); };
      card.querySelectorAll('.qx-row').forEach(el => { const q = ((this.state && this.state.quant) || []).find(x => x.id === el.dataset.q); if (q) this.quantRowBind(el, q); });
      this.esiRowsBind(card, ex);
      card.querySelectorAll('.rc').forEach(row => {
        const r = recs.find(x => x.id === row.dataset.r); if (!r) return; const q = s => row.querySelector(s);
        q('.rc-fold').onclick = () => { if (closed[r.id]) delete closed[r.id]; else closed[r.id] = true; re(); };
        q('.rc-open').onclick = () => this.ieegOpen(r); const el = q('.rc-elec'); if (el) el.onclick = () => this.esiElecOnly(r);
        q('.rc-more').onclick = e => this.recMenu(r, ex, e.currentTarget.getBoundingClientRect());
        row.querySelectorAll('.rc-szgo').forEach(b => b.onclick = async () => { if (r.seizureId !== b.dataset.sz && this.ieegSetSeizure) { this.ieegSetSeizure(r, b.dataset.sz); touch('tracé : crise active'); } await this.recOpenAt(r, r.marks && r.marks.onset); });
        row.querySelectorAll('.rc-szinfo').forEach(b => b.onclick = () => this.openSeizure(b.dataset.sz));
        row.querySelectorAll('.rc-szvid').forEach(b => b.onclick = () => { const z = ST.byId(this.dossier.seizures, b.dataset.sz), g = z && this.videoLinked(z); this.openSeizure(z.id); if (g && this.videoOpen) setTimeout(() => this.videoOpen(g), 400); });
        const add = q('.rc-szadd'); if (add) add.onclick = () => { const sz = this.ieegNewSeizureAt(r, r.marks.onset); if (!sz) return; re(); this.seizureInfoDialog(sz, { then: () => this.openSeizure(sz.id) }); };
        row.querySelectorAll('.rc-p[data-go]').forEach(p => p.onclick = () => this.recOpenAt(r, null, { meth: p.dataset.go }));
        row.querySelectorAll('.rc-cap').forEach(b => b.onclick = () => { const g = ST.byId(this.dossier.gallery, b.dataset.g); if (g) this.recOpenAt(r, g.src.t, { montage: g.src.montage }); });
      });
    },
    /** ⋯ d'un tracé : nature, vigilance, crises rattachées, renommer, supprimer */
    recMenu(r, ex, b) {
      const d = this.dossier, I = this.recInfo(r), touch = what => { this.touch('exploration', ex.id, what || 'tracé'); this.renderQuant(); }, szs = ST.seizuresOfExploration(d, ex.id), inRec = new Set(I.szIds);
      const nat = I.ict && I.inter ? 'both' : I.ict ? 'ict' : 'inter';
      this.popupMenu([{ head: r.title },
        { group: 'Nature', options: [['ict', 'crise(s)'], ['inter', 'intercritique'], ['both', 'crises et intercritique']].map(([k, l]) => ({ label: l, on: nat === k, run: () => { r.kind = k === 'inter' ? 'inter' : 'ictal'; r.inter = k === 'ict' ? false : k === 'both' ? true : null; touch(); } })) },
        { group: 'Vigilance', options: [['', I.auto ? `d’après la stadification (${VIG[I.vig]})` : 'non précisée'], ['wake', 'veille'], ['nrem', 'sommeil lent'], ['rem', 'sommeil paradoxal'], ['mixed', 'veille et sommeil']].map(([k, l]) => ({ label: l, on: (r.vigil || '') === k, run: () => { r.vigil = k; touch(); } })) },
        szs.length ? { sep: true } : null, szs.length ? { head: 'Crises de ce tracé' } : null,
        ...szs.map(z => ({ label: (inRec.has(z.id) ? '✓ ' : '') + z.label + (z.datetime && String(z.datetime).length > 10 ? ' · ' + String(z.datetime).slice(5, 16).replace('T', ' ') : ''), run: () => {
          if (inRec.has(z.id)) { const m = (r.seizureId === z.id ? r.marks : ((r.bySz || {})[z.id] || {}).marks) || {}; if ((m.onset != null || m.end != null) && !confirm(`Retirer ${z.label} de ce tracé ? Ses marques et ses analyses dans ce tracé seront effacées.`)) return; }
          this.szLinkRec(r, z, !inRec.has(z.id)); touch('tracé : crises'); } })),
        { sep: true }, { label: 'Renommer…', run: () => { const t = prompt('Titre du tracé', r.title); if (t && t.trim()) { r.title = t.trim(); touch(); } } },
        { label: 'Supprimer le tracé…', danger: true, run: () => this.ieegRemove(r) }].filter(Boolean), b.left - 200, b.bottom + 4);
    },
    /** ouvre un tracé (visionneuse) à l'instant t, éventuellement sur un panneau d'analyse (esp, slp, esz…) ou un montage */
    async recOpenAt(rec, t, o) {
      o = o || {}; await this.ieegOpen(rec); const V = this._iev; if (!V || V.rec !== rec) return;
      if (o.montage && V.montage !== o.montage && [...V.el.querySelectorAll('.ie-mont button')].some(b => b.dataset.m === o.montage)) { V.montage = o.montage; this.ieegSetMontage(); }
      if (t != null) this.ieegGotoT(null, t);
      if (o.meth) this.ieegEIPanel(true, o.meth);
    },
    /** depuis le staff ou un rapport : le tracé d'une exploration à l'instant t (la présentation reprend à la même diapositive) */
    recReview(exId, recId, t, o) {
      const d = this.dossier, ex = d && ST.byId(d.explorations, exId), rec = ex && (ex.recordings || []).find(r => r.id === recId); if (!rec) return this.toast('Tracé introuvable dans le dossier', 3000);
      const open = () => this.recOpenAt(rec, t, o), loc = { stage: 'ex:' + ex.id, view: 'analyses' };
      if (this._pres) this.presentReview(loc, false, open); else { this.go(loc); setTimeout(open, 300); }
    },
    /** à l'import : crises du dossier (date et heure) qui tombent dans le tracé, rattachées → [[crise, t]] */
    recAutoLink(rec, ex) {
      const d = this.dossier; if (!d || !ex || !this.ieegRecStart(rec)) return []; const taken = new Set((ex.recordings || []).filter(r => r !== rec).flatMap(r => this.ieegRecSeizures(r))), out = [];
      for (const z of ST.seizuresOfExploration(d, ex.id)) {
        if (taken.has(z.id) || this.ieegRecSeizures(rec).includes(z.id)) continue; const t = this.szRecOffset(rec, z); if (t == null) continue;
        const on = rec.marks && rec.marks.onset; if (!rec.seizureId && on != null && Math.abs(on - t) > 180) { rec.bySz = rec.bySz || {}; rec.bySz[z.id] = { marks: { onset: t, end: null, user: [] } }; rec.kind = 'ictal'; }   // le début du fichier est celui d'une autre crise
        else this.szLinkRec(rec, z, true);
        out.push([z, t]);
      }
      return out;
    },
  };
  Object.assign(A, M);

  // import (scalp et SEEG) : crises rattachées d'après leur heure
  const im0 = A.ieegImport; A.ieegImport = async function (files) {
    const ex = this.ieegEx(), before = new Set(((ex && ex.recordings) || []).map(r => r.id)), last = await im0.apply(this, arguments); if (!ex) return last;
    const L = []; for (const r of ex.recordings || []) if (!before.has(r.id)) L.push(...this.recAutoLink(r, ex).map(([z, t]) => `${z.label} → ${r.title} (${clock(t)})`));
    if (L.length) { if (ST.renumberSeizures) ST.renumberSeizures(this.dossier, ex.id); this.touch('exploration', ex.id, 'tracé : crises rattachées'); this.toast(`Rattachée${L.length > 1 ? 's' : ''} d’après l’heure : ${L.join(' ; ')}`, 7000); this.renderQuant(); }
    return last;
  };
})(window.SV);
