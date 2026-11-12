/* EpiScope — ieeg_montage.js (v5.1) : montages du tracé SEEG (disposition des voies) et capture d'une page.
 *
 *   « Montage ▾ » (barre du tracé) :
 *   - par électrode : ordre du fichier, une bande par électrode ;
 *   - anatomique : une bande par région VEP (plot de la paire en substance grise ; deux régions différentes → le plot le plus
 *     profond), régions rangées par lobe et par face — temporal mésial, pôle temporal, temporal latéral, temporal basal,
 *     insula et opercules, frontal orbitaire, frontal latéral, frontal mésial et cingulaire, central, pariétal latéral,
 *     pariétal mésial, occipital, sous-cortical — puis la substance blanche ; gauche puis droite si l'implantation est
 *     bilatérale ;
 *   - montages enregistrés pour l'implantation (ex.montages) : réutilisés pour toutes les crises et tous les tracés
 *     intercritiques de la SEEG ;
 *   - substance grise : toutes les voies, une paire dès qu'un plot est en SG (règle de Marseille), ou les deux plots.
 *   Gouttière : glisser l'étiquette d'une voie la déplace (elle prend le groupe où elle tombe), glisser l'étiquette d'un groupe
 *   déplace le groupe (Alt + glisser en disposition par électrode) ; double-clic sur un groupe : le renommer.
 *   « Capture ▾ » : la page affichée → galerie (tracé, date et heure du début de la page), presse-papiers, PNG.          */
(function (SV) {
  'use strict';
  const S = SV.Store, Q = SV.Seeg, IE = SV.IEEG;
  const esc = SV.U.esc;
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const BLOCKS = [
    ['temporal mésial', ['Amygdala', 'Hippocampus-anterior', 'Hippocampus-posterior', 'Rhinal-cortex', 'Parahippocampal-cortex', 'Collateral-sulcus']],
    ['pôle temporal', ['Temporal-pole', 'T1-planum-polare']],
    ['temporal latéral', ['T1-lateral-anterior', 'T1-lateral-posterior', 'Gyrus-of-Heschl', 'T1-planum-temporale', 'STS-anterior', 'STS-posterior', 'T2-anterior', 'T2-posterior', 'ITS-anterior', 'ITS-posterior']],
    ['temporal basal', ['T3-anterior', 'T3-posterior', 'Fusiform-gyrus', 'Occipito-temporal-sulcus']],
    ['insula et opercules', ['Insula-gyri-brevi', 'Insula-gyri-longi', 'F3-pars-opercularis', 'Central-operculum', 'Parietal-operculum']],
    ['frontal orbitaire', ['Frontal-pole', 'Orbito-frontal-cortex', 'Gyrus-rectus', 'F3-Pars-Orbitalis']],
    ['frontal latéral', ['F3-Pars-triangularis', 'Inferior-frontal-sulcus', 'F2-rostral', 'F2-caudal', 'Middle-frontal-sulcus', 'SFS-rostral', 'SFS-caudal', 'F1-lateral-prefrontal', 'F1-lateral-premotor', 'Precentral-sulcus-inferior-part', 'Precentral-sulcus-superior-part']],
    ['frontal mésial et cingulaire', ['F1-mesial-prefrontal', 'PreSMA', 'SMA', 'Subcallosal-area', 'Anterior-cingulate-cortex', 'Middle-cingulate-cortex-anterior-part', 'Middle-cingulate-cortex-posterior-part', 'Paracentral-lobule']],
    ['central', ['Precentral-gyrus-head-face', 'Precentral-gyrus-upper-limb', 'Central-sulcus-head-face', 'Central-sulcus-upper-limb', 'Postcentral-gyrus', 'Postcentral-sulcus']],
    ['pariétal latéral', ['Superior-parietal-lobule-P1', 'Supramarginal-anterior', 'Supramarginal-posterior', 'Angular-gyrus', 'Intraparietal-sulcus']],
    ['pariétal mésial', ['Precuneus', 'Marginal-branch-of-the-cingulate-sulcus', 'Posterior-cingulate-cortex-dorsal', 'Posterior-cingulate-cortex-retrosplenial-gyrus', 'Parieto-occipital-sulcus']],
    ['occipital', ['Anterior-occipital-sulcus-and-preoccipital-notch', 'O3', 'O2', 'O1', 'Occipital-pole', 'Lingual-gyrus', 'Lingual-sulcus', 'Calcarine-sulcus', 'Cuneus']],
    ['sous-cortical', ['Thalamus', 'Caudate-nucleus', 'Putamen', 'Pallidum', 'Nucleus-accumbens', 'Cerebellar-cortex']],
  ];
  const FAM = new Map(); BLOCKS.forEach(([, fams], b) => fams.forEach((f, i) => FAM.set(f, [b, i])));
  const GM_OPTS = [['off', 'toutes les voies'], ['any', 'paire gardée si ≥ 1 plot en SG'], ['both', 'les deux plots en SG']];
  const LAY_NAME = { elec: 'par électrode', anat: 'anatomique', custom: 'modifié' };
  const pad = n => String(n).padStart(2, '0');
  const MONT_FR = { mono: 'monopolaire', bipolar: 'bipolaire', avg: 'référence moyenne', lap: 'laplacien', banana: 'double banane', trans: 'transverse', file: 'montage enregistré' };

  const M = {
    /** régions des plots de chaque dérivation (parcellation du patient, sinon gabarit) ; null sans électrode localisée */
    ieegDerAnat() {
      const V = this._iev, el = this.elecs || []; if (!el.length || !this.quantContactRegion) return null;
      const lab = this.quantLabeler ? this.quantLabeler() : null, map = this.ieegElecMap ? this.ieegElecMap() : {}; let known = 0;
      const out = V.D.map(d => {
        if (!d.seeg || d.k1 == null) return null; const e = Q.findElec(el, map[d.elec] || d.elec); if (!e) return null; known++;
        // région du groupe : plot dans une région VEP, sinon la plus proche à moins de 3 mm ; substance grise : centre du plot
        // dans une région VEP (sans tolérance)
        const ks = [d.k1, d.k2].filter(k => k != null), regs = ks.map(k => this.quantContactRegion(e, k, lab)), raw = ks.map(k => { const c = e.contacts && e.contacts[k - 1]; return c && c.label >= 1 && c.label <= 162; }), gm = raw.filter(Boolean);
        const inG = regs.map((r, j) => raw[j] ? r : 0), pick = inG.some(r => r > 0) ? inG : regs, ri = pick.findIndex(r => r > 0), deeper = pick.filter(r => r > 0).length > 1 ? pick[ks[0] <= ks[ks.length - 1] ? 0 : pick.length - 1] : ri >= 0 ? pick[ri] : 0;
        return { regs, region: deeper, any: gm.length > 0, both: gm.length === ks.length, elec: e.name, hemi: e.hemi };
      });
      return known ? out : null;
    },
    /** disposition courante → ordre (V.order), groupes (V.grpKey / V.grpName), blocs (V.blk), filtre SG (V.gmOk) */
    ieegLayoutCompute() {
      const V = this._iev; V.lay = V.lay || { kind: 'elec', gm: 'off' }; const L = V.lay, key = V.montage + '|' + JSON.stringify(L) + '|' + (V.custom ? V.custom.rev : '');
      if (V._layD === V.D && V._layKey === key) return; V._layD = V.D; V._layKey = key;
      const D = V.D, info = (L.kind === 'anat' || L.gm !== 'off') ? this.ieegDerAnat() : null;
      V.gmOk = info && L.gm !== 'off' ? D.map((d, i) => !d.seeg || !info[i] || (L.gm === 'both' ? info[i].both : info[i].any)) : null;
      V.order = null; V.grpKey = null; V.grpName = null; V.blk = null;
      if (L.kind === 'anat') {
        if (!info) { L.kind = 'elec'; if (this.toast) this.toast('Montage anatomique : électrodes non localisées (localisation, anatomie du patient ou schéma prévu)', 5000); return this.ieegLayoutCompute(); }
        const A = this.atlas, sides = new Map(); info.forEach(x => { if (x) sides.set(x.hemi, (sides.get(x.hemi) || 0) + 1); });
        const sideOrder = [...sides].sort((a, b) => b[1] - a[1]).map(x => x[0]), bil = sideOrder.length > 1, elecRank = new Map(); D.forEach(d => { if (!elecRank.has(d.elec)) elecRank.set(d.elec, elecRank.size); });
        const meta = D.map((d, i) => {
          const x = info[i]; if (!d.seeg) return { key: 'other', blk: 99, s: 9, f: 0, r: 0 };
          if (!x) return { key: 'nl', blk: 98, s: 8, f: 0, r: 0 };
          const s = Math.max(0, sideOrder.indexOf(x.hemi));
          if (!(x.region > 0)) return { key: 'wm', blk: 97, s: 7, f: 0, r: 0 };
          const reg = A.region(x.region), fb = (reg && FAM.get(reg.family)) || [BLOCKS.length, 0];
          return { key: 'r' + x.region, blk: s * 100 + fb[0], s, f: fb[1], r: x.region, name: A.label(x.region) };
        });
        const idx = D.map((d, i) => i).sort((a, b) => { const p = meta[a], q = meta[b]; return p.s - q.s || p.blk - q.blk || p.f - q.f || p.r - q.r || elecRank.get(D[a].elec) - elecRank.get(D[b].elec) || (D[a].k1 || 0) - (D[b].k1 || 0); });
        V.order = idx; V.grpKey = meta.map(m => m.key); V.blk = meta.map(m => m.blk);
        V.grpName = new Map(meta.map(m => [m.key, m.key === 'wm' ? 'Substance blanche' : m.key === 'nl' ? 'Non localisés' : m.key === 'other' ? 'Autres voies' : m.name]));
        if (!bil) for (const [k, v] of V.grpName) V.grpName.set(k, v.replace(/ [GD]$/, ''));
      } else if (L.kind === 'saved' || L.kind === 'custom') {
        const m = L.kind === 'saved' ? this.ieegMontages().find(x => x.id === L.id) : V.custom; if (!m) { L.kind = 'elec'; return this.ieegLayoutCompute(); }
        const pos = new Map(m.order.map((n, i) => [n, i])), big = m.order.length;
        V.order = D.map((d, i) => i).sort((a, b) => (pos.has(D[a].name) ? pos.get(D[a].name) : big + a) - (pos.has(D[b].name) ? pos.get(D[b].name) : big + b));
        if (m.groups) { V.grpKey = D.map(d => m.groups[d.name] || (d.seeg ? 'e:' + d.elec : 'other')); V.grpName = new Map(); for (const k of new Set(V.grpKey)) V.grpName.set(k, (m.labels && m.labels[k]) || (k.startsWith('e:') ? k.slice(2) : k === 'other' ? 'Autres voies' : k)); V.blk = m.blocks ? D.map(d => m.blocks[d.name] != null ? m.blocks[d.name] : 999) : null; }
      }
      if (V.labels && V.grpName) for (const [k, v] of Object.entries(V.labels)) if (V.grpName.has(k)) V.grpName.set(k, v);
      V.rank = new Int32Array(D.length); (V.order || D.map((d, i) => i)).forEach((li, r) => { V.rank[li] = r; });
      V._gl = new Map();
    },
    /** étiquette d'un groupe sur une ou deux lignes de la gouttière */
    ieegGroupLines(key) {
      const V = this._iev, C = V._gl || (V._gl = new Map()); if (C.has(key)) return C.get(key);
      const t = (V.grpName && V.grpName.get(key)) || String(key), out = [], max = 15; let cur = '';
      for (const w of t.split(/\s+/)) { if ((cur + ' ' + w).trim().length <= max) cur = (cur + ' ' + w).trim(); else { if (cur) out.push(cur); cur = w; } if (out.length === 2) break; }
      if (cur && out.length < 2) out.push(cur); if (out.length === 2 && t.length > out.join(' ').length) out[1] = out[1].slice(0, max - 1) + '…';
      const r = out.map(x => x.length > max ? x.slice(0, max - 1) + '…' : x); C.set(key, r); return r;
    },
    ieegMontages() { const ex = this.ieegEx(); return ex ? (ex.montages || []) : []; },
    /** disposition courante figée en montage « modifié » (noms des dérivations), base des déplacements */
    ieegToCustom() {
      const V = this._iev; if (V.lay.kind === 'custom' && V.custom) return V.custom;
      const order = (V.order || V.D.map((d, i) => i)).map(i => V.D[i].name), groups = V.grpKey ? Object.fromEntries(V.D.map((d, i) => [d.name, V.grpKey[i]])) : null;
      const labels = V.grpName ? Object.fromEntries(V.grpName) : null, blocks = V.blk ? Object.fromEntries(V.D.map((d, i) => [d.name, V.blk[i]])) : null;
      V.custom = { order, groups, labels, blocks, ref: V.montage, from: V.lay.kind === 'saved' ? V.lay.id : V.lay.kind, rev: 1 };
      V.lay = { kind: 'custom', gm: V.lay.gm }; return V.custom;
    },
    ieegLayoutChanged() {
      const V = this._iev; V._layKey = null; const vw = this.ieegVw(); vw.layout = Object.assign({}, V.lay); vw.custom = V.lay.kind === 'custom' ? V.custom : null; vw.labels = V.labels || null; V.dirty = true;
      this.ieegLanes(); this.ieegDraw(); this.ieegMontageBtn();
    },
    /** fin d'un glisser dans la gouttière : voie (ou groupe) insérée avant la ligne `pos` des voies affichées */
    ieegMoveLanes(src, pos, whole) {
      const V = this._iev, C = this.ieegToCustom(), D = V.D, name = D[src].name, gOf = n => C.groups ? C.groups[n] : (D.find(d => d.name === n) || {}).elec;
      const moving = whole ? C.order.filter(n => gOf(n) === gOf(name)) : [name], tgt = pos < V.lanes.length ? D[V.lanes[pos]].name : null; if (tgt && moving.includes(tgt)) return;
      const rest = C.order.filter(n => !moving.includes(n)), at = tgt ? rest.indexOf(tgt) : rest.length; rest.splice(at < 0 ? rest.length : at, 0, ...moving); C.order = rest;
      if (!whole && C.groups) { const before = pos > 0 ? D[V.lanes[pos - 1]].name : null, ref = before && before !== name ? before : tgt; if (ref) { C.groups[name] = C.groups[ref]; if (C.blocks) C.blocks[name] = C.blocks[ref]; } }
      C.rev++; this.ieegLayoutChanged();
    },
    /** double-clic sur un groupe : champ de saisie posé sur son étiquette */
    ieegRenameGroup(p, ev) {
      const V = this._iev, key = V.grpKey && V.grpKey[p.lane]; if (!key) return;
      const inp = h('input', 'ie-grpname'); inp.value = V.grpName.get(key) || key; const r = V.cv.getBoundingClientRect();
      Object.assign(inp.style, { left: (r.left + 4) + 'px', top: (ev.clientY - 12) + 'px' }); document.body.appendChild(inp); inp.focus(); inp.select();
      const done = ok => { if (!inp.isConnected) return; const v = inp.value.trim(); inp.remove(); if (!ok || !v) return; V.labels = Object.assign({}, V.labels, { [key]: v }); if (V.custom && V.custom.labels) V.custom.labels[key] = v; this.ieegLayoutChanged(); };
      inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); }; inp.onblur = () => done(true);
    },
    /** libellé du bouton « Montage » */
    ieegMontageBtn() {
      const V = this._iev, b = V && V.el.querySelector('.ie-lay'); if (!b) return; const L = V.lay || {};
      const nm = L.kind === 'saved' ? ((this.ieegMontages().find(m => m.id === L.id) || {}).name || '?') : LAY_NAME[L.kind] || '';
      b.innerHTML = `Montage : ${esc(nm)}${L.gm && L.gm !== 'off' ? ' · SG' : ''} ▾`; b.classList.toggle('on', L.kind !== 'elec' || (L.gm && L.gm !== 'off'));
    },
    ieegMontageMenu(anchor) {
      const V = this._iev, ex = this.ieegEx(), L = V.lay, mons = this.ieegMontages(), panel = h('div', 'cell-panel ie-laym');
      const opt = (k, id, label, title) => `<label class="ie-lo" title="${esc(title || '')}"><input type="radio" name="ielay" data-k="${k}"${id ? ` data-id="${id}"` : ''}${L.kind === k && (!id || L.id === id) ? ' checked' : ''}> ${label}</label>`;
      panel.innerHTML = `<div class="ctx-head">Montage du tracé</div>
        <div class="ie-lsec">Disposition</div>
        ${opt('elec', null, 'par électrode', 'ordre du fichier, une bande par électrode')}${opt('anat', null, 'anatomique — régions, lobes, faces', 'une bande par région VEP, rangées : temporal mésial, pôle, latéral, basal, insula, frontal, central, pariétal, occipital, sous-cortical, puis substance blanche')}
        ${mons.map(m => opt('saved', m.id, `${esc(m.name)} <span class="muted small">${m.ref === 'mono' ? 'monopolaire' : 'bipolaire'}</span>`, 'montage enregistré pour cette implantation')).join('')}
        ${L.kind === 'custom' ? opt('custom', null, 'modifié <span class="muted small">(non enregistré)</span>') : ''}
        <div class="ie-lsec">Substance grise</div>
        <div class="seg ie-gm">${GM_OPTS.map(([k, l]) => `<button data-gm="${k}" class="${(L.gm || 'off') === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="ie-lsec">Enregistrer pour ${esc(ex ? ex.label : 'cette SEEG')} <span class="muted small">— repris pour toutes ses crises et ses tracés intercritiques</span></div>
        <div class="row"><input class="ie-lname" placeholder="nom du montage (ex. temporal mésial G)" value="${esc(L.kind === 'saved' ? ((mons.find(m => m.id === L.id) || {}).name || '') : '')}"><button class="mini-btn primary ie-lsave">Enregistrer</button>${L.kind === 'saved' ? '<button class="mini-btn ie-ldel" title="supprimer ce montage">✕</button>' : ''}</div>
        <div class="hint">Gouttière : glisser une voie pour la déplacer, l’étiquette d’un groupe pour le groupe entier (Alt + glisser en disposition par électrode) ; double-clic sur un groupe pour le renommer.</div>`;
      panel.querySelectorAll('input[name=ielay]').forEach(r => r.onchange = () => { V.lay = { kind: r.dataset.k, id: r.dataset.id || null, gm: L.gm || 'off' }; const m = V.lay.kind === 'saved' && mons.find(x => x.id === V.lay.id); if (m) { if (m.gm) V.lay.gm = m.gm; if (m.ref && m.ref !== V.montage) { V.montage = m.ref; this.ieegSetMontage(); } } V.labels = null; this.closeMenu(); this.ieegLayoutChanged(); });
      panel.querySelectorAll('[data-gm]').forEach(b => b.onclick = () => { V.lay.gm = b.dataset.gm; this.closeMenu(); this.ieegLayoutChanged(); if (V.lay.gm !== 'off' && !V.gmOk) this.toast('Substance grise : électrodes non localisées, toutes les voies restent affichées', 4500); });
      panel.querySelector('.ie-lsave').onclick = () => {
        if (!ex) return; const name = panel.querySelector('.ie-lname').value.trim(); if (!name) { panel.querySelector('.ie-lname').focus(); return; }
        const C = V.lay.kind === 'custom' ? V.custom : (this.ieegToCustom(), V.custom); ex.montages = ex.montages || [];
        let m = ex.montages.find(x => x.name.toLowerCase() === name.toLowerCase()); if (!m) { m = { id: S.uid('mt') }; ex.montages.push(m); }
        Object.assign(m, { name, ref: V.montage, gm: V.lay.gm || 'off', order: C.order.slice(), groups: C.groups, labels: Object.assign({}, C.labels, V.labels), blocks: C.blocks, by: S.user || '', date: S.now() });
        V.lay = { kind: 'saved', id: m.id, gm: m.gm }; V.custom = null; this.touch('exploration', ex.id, 'montage ' + name); this.closeMenu(); this.ieegLayoutChanged(); this.toast(`Montage « ${name} » enregistré pour ${ex.label}`, 3000);
      };
      const del = panel.querySelector('.ie-ldel'); if (del) del.onclick = () => { const m = mons.find(x => x.id === L.id); if (!m || !confirm(`Supprimer le montage « ${m.name} » ?`)) return; ex.montages = ex.montages.filter(x => x !== m); V.lay = { kind: 'elec', gm: L.gm || 'off' }; this.touch('exploration', ex.id, 'montage supprimé'); this.closeMenu(); this.ieegLayoutChanged(); };
      const r = anchor.getBoundingClientRect(); this.popupMenu([{ node: panel }], Math.min(r.left, window.innerWidth - 470), r.bottom + 4);
    },
    // ---------------------------------------------------------------- capture d'une page
    ieegPageTime() {
      const V = this._iev, rec = V.rec, d0 = rec.startDate && rec.startTime ? new Date(`${rec.startDate}T${String(rec.startTime).slice(0, 8)}`) : null;
      if (!d0 || isNaN(d0)) { const s = Math.round(V.t); return { date: null, text: `t = ${Math.floor(s / 60)}:${pad(s % 60)}` }; }
      const t = new Date(d0.getTime() + V.t * 1000); return { date: `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`, text: `${t.toLocaleDateString(SV.LOC)} ${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}` };
    },
    ieegCaptureMenu(anchor) {
      const V = this._iev, url = () => V.cv.toDataURL('image/png'), T = this.ieegPageTime(), sc = V.rec.modality === 'scalp', title = `${V.rec.title} · ${T.text} · ${V.page} s · ${MONT_FR[V.montage] || V.montage}`;
      const items = [{ head: 'Capture de la page' }, { label: 'Ranger dans la galerie', run: async () => {
        const ex = this.ieegEx(), b = await (await fetch(url())).blob(), sz = V.rec.seizureId || null;
        const g = (await this.galleryAdd([new File([b], 'trace.png', { type: 'image/png' })], { explorationId: ex ? ex.id : null, seizureId: sz, kind: sz ? 'ictal' : 'interictal', modality: sc ? 'eeg' : 'seeg', title }))[0];
        if (g) { if (T.date) g.date = T.date; g.notes = g.notes || `Page de ${V.page} s du tracé ${V.rec.title}, début ${T.text}.`; g.src = { recId: V.rec.id, t: Math.round((V.t + V.page / 2) * 100) / 100, page: V.page, montage: V.montage };   // le tracé à cet instant, en un clic (cartes des tracés, staff)
          this.touch('gallery', g.id, g.title); this.toast('Page du tracé rangée dans la galerie (et sous le tracé dans Analyses)', 3000); }
      } }, { label: 'Copier (coller dans Word, PowerPoint)', run: async () => { const ok = SV.Clip && await SV.Clip.copyImage(url()); this.toast(ok ? 'Page copiée' : 'Copie impossible', 2000); } },
      { label: 'Enregistrer en PNG', run: () => { const a = document.createElement('a'); a.href = url(); a.download = `${String(V.rec.title).replace(/[^\w.-]+/g, '_')}_${T.text.replace(/[^\d]+/g, '')}.png`; a.click(); } }];
      const r = anchor.getBoundingClientRect(); this.popupMenu(items, Math.min(r.left, window.innerWidth - 320), r.bottom + 4);
    },
  };
  Object.assign(SV.app, M);

  const A = SV.app;
  // ouverture : boutons « Montage ▾ » et « Capture ▾ », disposition reprise du tracé
  const open0 = A.ieegOpen;
  A.ieegOpen = async function (rec) {
    const vw0 = rec && rec.view ? rec.view : {}, r = await open0.apply(this, arguments), V = this._iev; if (!V || V.rec !== rec) return r;
    V.lay = Object.assign({ kind: 'elec', gm: 'off' }, vw0.layout || {}); V.custom = vw0.custom || null; V.labels = vw0.labels || null; if (V.lay.kind === 'custom' && !V.custom) V.lay.kind = 'elec';
    const mont = V.el.querySelector('.ie-mont'); if (mont) {
      const lb = h('button', 'ie-lay', 'Montage ▾'); if (rec.modality === 'scalp') lb.hidden = true;   // dispositions anatomiques, substance grise : SEEG lb.title = 'disposition des voies : par électrode, anatomique (régions, lobes), montages enregistrés ; voies en substance grise'; mont.after(lb); lb.onclick = e => this.ieegMontageMenu(e.currentTarget);
      const theme = V.el.querySelector('.ie-theme'), cb = h('button', 'ie-cap', 'Capture ▾'); cb.title = 'capture de la page affichée : galerie (tracé, date et heure), presse-papiers, PNG'; if (theme) theme.before(cb); cb.onclick = e => this.ieegCaptureMenu(e.currentTarget);
    }
    V._layKey = null; this.ieegLanes(); this.ieegDraw(); this.ieegMontageBtn();
    return r;
  };
  // voies affichées : ordre et filtre de substance grise du montage
  const lanes0 = A.ieegLanes;
  A.ieegLanes = function () {
    const r = lanes0.apply(this, arguments), V = this._iev; if (!V || !V.D) return r;
    this.ieegLayoutCompute();
    if (V.order) V.lanes.sort((a, b) => V.rank[a] - V.rank[b]);
    if (V.gmOk) { V.lanes = V.lanes.filter(i => V.gmOk[i]); V.nHidden = V.D.length - V.lanes.length; }
    return r;
  };
  // gouttière : glisser-déposer des voies et des groupes, renommage des groupes
  const bc0 = A.ieegBindCanvas;
  A.ieegBindCanvas = function () {
    const r = bc0.apply(this, arguments), V = this._iev, cv = V.cv, down0 = cv.onpointerdown, move0 = cv.onpointermove, up0 = cv.onpointerup; let G = null;
    const dropPos = e => { const g = V.geo, y = e.clientY - cv.getBoundingClientRect().top; return Math.max(0, Math.min(V.lanes.length, Math.round((y - g.TOP) / g.laneH) + V.scroll)); };
    cv.onpointerdown = e => { const p = e.button === 0 ? this.ieegHit(e) : null; if (p && p.gutter && p.lane >= 0 && !e.shiftKey && !e.ctrlKey && !e.metaKey) { G = { p, y: e.clientY, moved: false, whole: V.grpKey ? p.x < 96 : e.altKey }; cv.setPointerCapture(e.pointerId); return; } return down0(e); };
    cv.onpointermove = e => { if (!G) return move0(e); if (!G.moved && Math.abs(e.clientY - G.y) < 5) return; G.moved = true; V.dropAt = dropPos(e); cv.style.cursor = 'grabbing'; this.ieegDraw(); };
    cv.onpointerup = e => {
      if (!G) return up0(e); const g = G; G = null; cv.style.cursor = '';
      if (g.moved) { const pos = V.dropAt; V.dropAt = null; if (pos != null) this.ieegMoveLanes(g.p.lane, pos, g.whole); else this.ieegDraw(); return; }
      V.selMark = null; this.ieegLaneClick(g.p.lane, e); this.ieegDraw(); if (V.ei) this.ieegEIRender(true);
    };
    cv.ondblclick = e => { const p = this.ieegHit(e); if (p && p.gutter && p.lane >= 0 && V.grpKey && p.x < 96) this.ieegRenameGroup(p, e); };
    return r;
  };
})(window.SV = window.SV || {});
