/* EpiScope — loc_edit.js : SEEG › Localisation, carte unique « Reconstruction et vérification ».
 *   - une liste des électrodes reconstruites (détectées sur le scanner, saisies à la main, ou réelles déjà enregistrées) :
 *     un clic aligne les coupes sur l'électrode ; statut « validée » ✓ ou « à corriger » ⚠ ; suppression ✕ ;
 *   - électrode refaite (pointe + entrée) : elle remplace sa reconstruction (même nom, même identifiant), jamais de doublon ;
 *   - édition des plots dans les coupes alignées (✎ plots) : glisser un anneau le déplace de quelques mm (électrode courbée),
 *     un clic ailleurs ajoute un plot (rangé le long de l'axe), un clic droit retire le plot ; ↶ annule ;
 *   - opacité des plots et des hampes (le métal du scanner reste lisible) ;
 *   - scanner importé depuis la Localisation : rangé dans le dossier (CT post-implantation) puis recalé sur le T1 ; une image
 *     déjà importée par Dossier › Imagerie peut être désignée comme scanner.                                              */
(function (SV) {
  'use strict';
  const $ = id => document.getElementById(id), S = SV.Store;
  const esc = SV.U.esc;
  const nn = s => String(s || '').trim().replace(/['’‘´`]/g, '’').replace(/\s+/g, '').toUpperCase();
  const D = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const unit = a => { const n = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };
  const r2 = c => c.map(v => Math.round(v * 100) / 100);
  const MODEL_N = [5, 8, 10, 12, 15, 18];
  const ST = { ok: 'validée', fix: 'à corriger', '': 'à vérifier' };
  const hasReal = s => !!(s && s.real && s.real.contacts && s.real.contacts.length);

  const M = {
    /** lignes de la liste : éléments détectés / saisis (avant ou après enregistrement), sinon électrodes réelles ;
     *  key = clé des coupes (worldElectrodes), row = identifiant de ligne */
    locRows(ex) {
      if (!ex) return [];
      const W = this.ui.ce || {}, det = ex.ctDetect && (!W.ctId || ex.ctDetect.imagingId === W.ctId) ? ex.ctDetect : null;
      const reals = ex.electrodes.filter(hasReal);
      if (det && det.items.length) {
        const wl = this.worldElectrodes ? new Set(this.worldElectrodes().list.map(e => e.key)) : new Set(), used = new Set();
        const rows = det.items.map((it, i) => {
          const spec = reals.find(s => s.id === it.planId && !used.has(s.id)) || reals.find(s => nn(s.name) === nn(it.name) && !used.has(s.id)) || null; if (spec) used.add(spec.id);
          return { key: wl.has('d:' + it.id) || !spec ? 'd:' + it.id : 'r:' + spec.id, row: 'd:' + it.id, i, name: it.name, n: it.contacts.length, it, spec, status: it.status || (it.checked ? 'ok' : ''), kind: 'detected' };
        });
        // enregistrées mais absentes de la liste (reconstruction refaite sous un autre nom, élément retiré…) : montrées pour être retirées
        for (const e of reals) if (!used.has(e.id)) rows.push({ key: 'r:' + e.id, row: 'r:' + e.id, name: e.name, n: e.real.contacts.length, spec: e, status: e.real.status || (e.real.checked ? 'ok' : ''), kind: 'real', orphan: true });
        return rows;
      }
      return reals.map(e => ({ key: 'r:' + e.id, row: 'r:' + e.id, name: e.name, n: e.real.contacts.length, spec: e, status: e.real.status || (e.real.checked ? 'ok' : ''), kind: 'real' }));
    },
    /** électrodes réelles déjà enregistrées → éléments de la liste (pour les refaire ou les corriger) */
    locSeedDet(ex, ct, det) {
      for (const s of ex.electrodes.filter(hasReal)) {
        const R = s.real, C = R.contacts.map(c => c.slice()), tip = (R.tip || C[0]).slice(), entry = (R.entry || C[C.length - 1]).slice();
        det.items.push({ id: 'r' + s.id, name: s.name, hemi: s.hemi, planId: s.id, plan: 'enregistrée', tip, entry, dir: unit(sub(entry, tip)), length: D(tip, entry), n: C.length, nObs: C.length, contacts: C, score: 1, manual: R.source === 'manual', edited: !!R.edited, status: R.status || (R.checked ? 'ok' : ''), checked: !!R.checked });
      }
      if (det.items.length) det.validated = det.validated || S.now();
    },

    // ---------------------------------------------------------------- liste
    renderLocList(lb, ct, ex, box) {
      if (!lb) return; const W = this.ui.ce = this.ui.ce || {}, rows = this.locRows(ex);
      if (!ex || !rows.length) { lb.innerHTML = ex ? '<div class="hint">Aucune électrode reconstruite pour ce scanner : « Détecter les électrodes », ou « + à la main » (pointe puis entrée dans les coupes).</div>' : ''; return; }
      const det = ex.ctDetect && ex.ctDetect.imagingId === ct.id ? ex.ctDetect : null, st = this.slvState ? this.slvState() : {};
      const planned = ex.electrodes.filter(e => e.target || hasReal(e) || (e.plan && e.plan.tip)).map(e => e.name);
      const selRow = W.sel != null && det && det.items[W.sel] ? 'd:' + det.items[W.sel].id : W.selRow || null;
      const nOk = rows.filter(r => r.status === 'ok').length, nFix = rows.filter(r => r.status === 'fix').length;
      const dup = new Set(), seen = new Set(); for (const r of rows) { const k = nn(r.name); if (seen.has(k)) dup.add(k); seen.add(k); }
      const E = SV.Electrodes, maker = this.exMaker(ex);
      // modèles : la marque de l'implantation d'abord, puis l'autre marque (une électrode peut en venir : it.maker, v5)
      const opts = r => { const cur = this.locModelOf(ex, r.it), own = this.locMakerOf(ex, r.it), order = [maker].concat(Object.keys(E.MAKERS).filter(k => k !== maker)); let html = '';
        const o = m => `<option value="${m.id}"${cur && cur.id === m.id ? ' selected' : ''} title="${esc(m.label || '')}">${m.maker !== maker ? m.maker + ' · ' : ''}${m.n} plots${m.groups ? ` · ${m.groups.size === 5 ? '3×5' : '3×6'}, ${m.groups.gap} mm` : m.hd ? ' · HD 1 mm' : m.pitch !== 3.5 ? ` · pas ${m.pitch}` : ''}</option>`;
        for (const mk of order) { const models = E.MODELS.filter(m => m.maker === mk), std = models.filter(m => !m.groups && !m.hd && m.pitch === 3.5), special = models.filter(m => m.groups || m.hd || m.pitch !== 3.5);
          html += `<optgroup label="${esc(E.MAKERS[mk])}${mk === maker ? ' (implantation)' : own === mk ? ' (cette électrode)' : ''}">${std.map(o).join('')}</optgroup><optgroup label="${esc(E.MAKERS[mk])} · groupes espacés, haute résolution">${special.map(o).join('')}</optgroup>`; }
        return html + (cur ? '' : `<option value="" selected>${r.n} plots</option>`); };
      const len = r => { const o = r.it || r.spec.real, t = o.tip || o.contacts[0], e = o.entry || o.contacts[o.contacts.length - 1]; return D(t, e); };
      const alpha = st.elecAlpha != null ? st.elecAlpha : 1;
      lb.innerHTML = `<div class="lc-sum"><b>${rows.length}</b> électrode${rows.length > 1 ? 's' : ''} · <span class="lc-k ok">${nOk} validée${nOk > 1 ? 's' : ''}</span>${nFix ? ` · <span class="lc-k fix">${nFix} à corriger</span>` : ''}${rows.length - nOk - nFix ? ` · <span class="muted">${rows.length - nOk - nFix} à vérifier</span>` : ''}${det && det.dirty && det.validated ? ' · <span class="badge warn">modifications à enregistrer</span>' : ''}</div>
        <div class="lc-list">${rows.map(r => {
          const sel = r.row === selRow, cur = st.elec && st.elec === r.key, o = r.it;
          return `<div class="lc-row st-${r.status || 'none'}${sel ? ' sel' : ''}${cur ? ' cur' : ''}${dup.has(nn(r.name)) ? ' dup' : ''}" data-row="${r.row}">
            <span class="lc-dot" title="${ST[r.status || '']}"></span>
            ${o ? `<input class="nm" list="cePlanned" value="${esc(r.name)}" title="nom (d’après le schéma)">` : `<b class="nm">${esc(r.name)}</b>`}
            ${o ? `<select class="n${o.maker && o.maker !== maker ? ' other-maker' : ''}" title="modèle d’électrode : les plots sont posés depuis la pointe aux cotes du catalogue (pas, groupes espacés, HD) ; un modèle de l’autre marque donne sa marque à cette seule électrode (${esc(E.MAKERS[maker])} pour le reste de l’implantation)">${opts(r)}</select>` : `<span class="small">${r.n} plots${r.spec && r.spec.model ? ' · ' + esc(r.spec.model.replace(/^(DIXI|Alcis) /, '')) : ''}</span>`}
            ${o ? `<select class="side" title="côté d’implantation : sortie du crâne et majorité des plots (la pointe seule ne décide pas) — modifiable ici"><option value="L"${o.hemi === 'L' ? ' selected' : ''}>G</option><option value="R"${o.hemi !== 'L' ? ' selected' : ''}>D</option></select>${o.hemiGeo && o.hemiGeo !== o.hemi ? `<span class="badge warn lc-side" title="d’après la géométrie (sortie du crâne, plots) cette électrode est ${o.hemiGeo === 'L' ? 'à gauche' : 'à droite'} ; le côté retenu vient du schéma — à vérifier">côté ?</span>` : ''}` : `<span class="muted small lc-side" title="côté enregistré">${r.spec.hemi === 'L' ? 'G' : 'D'}</span>`}
            ${r.orphan ? '<span class="badge warn lc-orph" title="enregistrée dans l’exploration mais absente de la reconstruction (doublon d’une électrode refaite ?) : ✕ pour la retirer">hors liste</span>' : ''}<span class="muted small lc-info" title="${esc(o && o.plan ? o.plan : '')}">${len(r).toFixed(0)} mm${o ? ' · ' + (o.manual ? 'man.' : Math.round((o.score || 0) * 100) + ' %') : ''}${(o ? o.edited : r.spec.real.edited) ? ' · ✎' : ''}${r.spec ? ' · <span title="enregistrée dans l’exploration">●</span>' : ''}</span>
            <span class="spacer"></span>
            <span class="seg lc-stat"><button data-s="ok" class="${r.status === 'ok' ? 'on' : ''}" title="validée">✓</button><button data-s="fix" class="${r.status === 'fix' ? 'on' : ''}" title="à corriger">⚠</button></span>
            <button class="mini-btn lc-del" data-a="del" title="supprimer cette électrode reconstruite">✕</button></div>
            ${sel ? `<div class="lc-acts" data-row="${r.row}"><button class="mini-btn" data-a="view" title="centrer les coupes sur la pointe">◎</button>${o ? `<button class="mini-btn" data-a="tip" title="pointe = position du curseur (Brainstorm : Set tip)">P⌖</button><button class="mini-btn" data-a="entry" title="entrée = position du curseur (Set entry)">E⌖</button><button class="mini-btn" data-a="refine" title="ajuster la droite et les plots sur le métal du scanner">affiner</button>` : ''}<button class="mini-btn" data-a="redo" title="refaire cette électrode : cliquer la pointe puis l’entrée ; elle remplace la reconstruction actuelle (même nom)">↻ refaire</button><button class="mini-btn${this.ui.plotEdit && cur ? ' on primary' : ''}" data-a="pedit" title="déplacer, ajouter ou retirer des plots dans les coupes alignées">✎ plots</button></div>` : ''}`;
        }).join('')}</div><datalist id="cePlanned">${planned.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
        <div class="btnrow lc-nav"><button class="mini-btn" id="locPrev">◀ précédente</button><button class="mini-btn primary" id="locNext" title="électrode courante validée, puis la suivante à vérifier">✓ validée, suivante ▶</button><span class="spacer"></span><label class="lc-op" title="opacité des plots et des hampes dans les coupes">opacité <input type="range" class="loc-eop" min="10" max="100" step="5" value="${Math.round(alpha * 100)}"></label></div>
        <div class="hint">Cliquez une électrode : les coupes s’alignent sur sa trajectoire (◀ ▶ d’un plot à l’autre). <b>✎ plots</b> : glisser un anneau pour le déplacer, clic ailleurs = plot ajouté, clic droit = plot retiré.</div>`;
      const rowOf = el => rows.find(r => r.row === el.dataset.row);
      lb.querySelectorAll('.lc-row').forEach(el => {
        const r = rowOf(el);
        el.onclick = ev => { if (ev.target.closest('input,select,button')) return; this.locCheckRow(ex, r); };
        const nm = el.querySelector('input.nm'); if (nm) nm.onchange = e => {
          const v = e.target.value.trim(); if (!v) { e.target.value = r.name; return; }
          if (rows.some(x => x !== r && nn(x.name) === nn(v))) this.toast(`${v} : nom déjà porté par une autre électrode de la liste (une seule des deux peut être enregistrée)`, 5000);
          r.it.name = v; if (det) det.dirty = true; this.touch('exploration', ex.id, 'électrode ' + v); this.renderElectrodeCard(box); this.sliceMarkers();
        };
        const sd = el.querySelector('select.side'); if (sd) sd.onchange = e => { r.it.hemi = e.target.value; r.it.hemiManual = true; if (det) det.dirty = true; this.touch('exploration', ex.id, 'électrode ' + r.it.name + ' : côté'); this.renderElectrodeCard(box); };
        const n = el.querySelector('select.n'); if (n) n.onchange = e => { const it = r.it, m = this.locApplyModel(ex, it, e.target.value || null); if (det) det.dirty = true; this.touch(); this.locRefreshSlices(); this.renderElectrodeCard(box); if (m) this.toast(`${it.name} : ${m.id} — ${m.label} ; « affiner » ajuste la droite sur le métal avec ce gabarit`, 4000); };
        el.querySelectorAll('[data-s]').forEach(b => b.onclick = () => this.locSetStatus(ex, r, b.dataset.s));
        el.querySelector('[data-a=del]').onclick = () => this.locDeleteRow(ex, r);
      });
      const acts = lb.querySelector('.lc-acts');
      if (acts) { const r = rowOf(acts); acts.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => {
        const a = b.dataset.a, it = r.it, S3 = this.slices;
        if (a === 'view') { const o = it || r.spec.real; if (S3) S3.setCursor(o.contacts[0]); return; }
        if (a === 'redo') { W.pick = 'tip'; W.manual = {}; W.redo = r.row; W.redoName = r.name; if (S3) S3.pickMode = 'elec'; this.renderElectrodeCard(box); return; }
        if (a === 'pedit') { const st2 = this.slvState(); if (st2.elec !== r.key) this.locCheckRow(ex, r); this.ui.plotEdit = !(this.ui.plotEdit && this.slvState().elec === r.key); if (this.slvState().elec) { this.electrodeCheckMarkers(); this.renderImagingBar(); } this.renderElectrodeCard(box); if (this.ui.plotEdit) this.toast('Édition des plots : glisser un anneau · clic ailleurs = plot ajouté · clic droit = plot retiré · ↶ annule', 5000); return; }
        if (!it || !S3) return;
        if (a === 'tip' || a === 'entry') { const p = S3.cursor.slice(); if (a === 'tip') it.tip = p; else it.entry = p; it.dir = unit(sub(it.entry, it.tip)); it.length = D(it.tip, it.entry); const m = this.locModelOf(ex, it); it.contacts = SV.CTElec.contacts(it.tip, it.dir, it.n, m ? m.offsets : null); it.manual = true; it.edited = false; }
        else if (a === 'refine') await this.refineItem(ct, it);
        if (det) det.dirty = true; this.touch(); this.locRefreshSlices(); this.renderElectrodeCard(box);
      }); }
      const idx = Math.max(0, rows.findIndex(r => r.key === st.elec || r.row === selRow));
      $('locPrev').onclick = () => { const r = rows[Math.max(0, idx - 1)]; if (r) this.locCheckRow(ex, r); };
      $('locNext').onclick = () => {
        const cur = rows.find(r => r.key === st.elec) || rows.find(r => r.row === selRow); if (cur && cur.status !== 'ok') this.locSetStatus(ex, cur, 'ok', true);
        const nx = rows.slice(idx + 1).find(r => !r.status) || rows.find(r => !r.status && r !== cur);
        if (nx) this.locCheckRow(ex, nx); else { this.renderElectrodeCard(box); this.toast('Toutes les électrodes sont vérifiées', 2500); }
      };
      lb.querySelector('.loc-eop').oninput = e => this.setElecAlpha(+e.target.value / 100);
      const sr = lb.querySelector('.lc-row.sel'); if (sr && sr.scrollIntoView && this._locScrollSel) { this._locScrollSel = false; sr.scrollIntoView({ block: 'nearest' }); }
    },
    /** une ligne : sélection, coupes alignées sur l'électrode */
    locCheckRow(ex, r) {
      const W = this.ui.ce = this.ui.ce || {}; if (r && !r.row) r = this.locRows(ex).find(x => x.it === r) || null; if (!r) return;
      W.sel = r.i != null ? r.i : null; W.selRow = r.row; this._locScrollSel = true;
      const st = this.slvState(); st.elecK = 0; st.pair = null;
      const ok = this.checkElectrode && this.checkElectrode(r.key, !!this._locHinted); this._locHinted = true;
      if (!ok && this.slices) { const o = r.it || r.spec.real; this.slices.setCursor(o.contacts[0]); }
      if ($('imElec') && this.ui.screen === 'loc') this.renderElectrodeCard($('imElec'));
    },
    /** électrode choisie dans l'encart (clic sur sa hampe) ou ailleurs par son nom : ligne alignée, champ du nom prêt à renommer */
    selectElectrodeByName(name) {
      const W = this.worldElectrodes ? this.worldElectrodes() : null, ex = W && W.ex; if (!ex) return false;
      const E = W.list.find(e => e.name === name) || W.list.find(e => nn(e.name) === nn(name)); if (!E) return false;
      if (this.ui.screen === 'loc') { const r = this.locRows(ex).find(x => x.key === E.key) || this.locRows(ex).find(x => nn(x.name) === nn(E.name)); if (r) { this.locCheckRow(ex, r); setTimeout(() => { const inp = document.querySelector(`#ceList .lc-row.sel input.nm`); if (inp) { inp.focus(); inp.select(); } }, 60); return true; } }
      if (this.checkElectrode) { this.checkElectrode(E.key, true); this.renderImagingBar && this.renderImagingBar(); return true; }
      return false;
    },
    locSetStatus(ex, r, s, force) {
      const v = !force && r.status === s ? '' : s;
      if (r.it) { r.it.status = v; r.it.checked = v === 'ok'; }
      if (r.spec && r.spec.real) { r.spec.real.status = v; r.spec.real.checked = v === 'ok'; }
      r.status = v; this.touch('exploration', ex.id, `${r.name} : ${ST[v]}`);
      if ($('imElec') && this.ui.screen === 'loc') this.renderElectrodeCard($('imElec'));
    },
    /** suppression : élément de la liste et, s'il était enregistré, ses plots réels (l'électrode prévue du schéma reste) */
    locDeleteRow(ex, r) {
      const W = this.ui.ce || {}, real = r.spec && hasReal(r.spec), twin = real && ex.electrodes.some(s => s !== r.spec && nn(s.name) === nn(r.spec.name)), keepSpec = real && !twin && (r.spec.target || (r.spec.plan && r.spec.plan.tip));
      if (real && !confirm(`Supprimer la reconstruction de ${r.name} ? Ses plots réels sont retirés de ${ex.label}${keepSpec ? ' (l’électrode prévue du schéma reste)' : ''}.`)) return;
      const det = ex.ctDetect; if (r.it && det) det.items.splice(det.items.indexOf(r.it), 1);
      if (real) { if (keepSpec) delete r.spec.real; else ex.electrodes.splice(ex.electrodes.indexOf(r.spec), 1); }
      else if (det && det.validated) det.dirty = true;
      W.sel = null; W.selRow = null; const st = this.slvState(); if (st.elec === r.key && this.exitElectrodeCheck) this.exitElectrodeCheck();
      this.toast(`${r.name} supprimée${real ? ' (plots réels retirés de ' + ex.label + ')' : ''}`, 3000);
      this.locAfterEdit(ex, { real });
    },
    cancelElecPick() {
      const W = this.ui.ce || {}; W.pick = null; W.redo = null; W.redoName = null; if (this.slices) this.slices.pickMode = null;
      if (this.ui.screen === 'loc' && $('imElec')) this.renderElectrodeCard($('imElec')); else if (this.ui.screen === 'imaging' && this.renderElecCard) this.renderElecCard();
    },
    locRefreshSlices() { const st = this.slvState ? this.slvState() : {}; if (st.elec && this.electrodeCheckMarkers) { if (this.findWorldElectrode(st.elec)) { this.stepElectrode(0); } else this.exitElectrodeCheck(); } else if (this.sliceMarkers) this.sliceMarkers(); },
    /** après une modification : dossier, électrodes de la vue 3D, BIDS (différé), liste et coupes */
    locAfterEdit(ex, o) {
      o = o || {}; this.touch('exploration', ex.id, 'électrodes réelles corrigées');
      if (o.real) {
        if (this.ctx && this.ctx.explorationId === ex.id) { if (this.state.electrodes !== ex.electrodes) { const w = S.toWorkspace(this.dossier, this.ctx); if (w) this.state.electrodes = w.electrodes; } if (this.rebuildElectrodes) this.rebuildElectrodes(); }
        clearTimeout(this._locBids); this._locBids = setTimeout(() => { Promise.resolve(this.exportElectrodesBids(ex, false)).catch(() => { }); }, 1500);
      }
      if (this.ui.screen === 'loc' && $('imElec')) this.renderElectrodeCard($('imElec'));
      this.locRefreshSlices();
    },

    // ---------------------------------------------------------------- édition des plots dans les coupes
    locEditable(E) { return !!E && E.kind !== 'planned' && this.ui.screen === 'loc'; },
    /** élément de la liste et spécification réelle correspondant à une électrode des coupes */
    locTarget(E) {
      const ex = this.worldElectrodes().ex; if (!ex || !E) return null; const det = ex.ctDetect;
      if (E.kind === 'detected') { const it = det && det.items.find(x => x.id === E.id); if (!it) return null; return { ex, it, spec: ex.electrodes.find(s => hasReal(s) && (s.id === it.planId || nn(s.name) === nn(it.name))) || null, name: it.name }; }
      if (E.kind === 'real') { const spec = ex.electrodes.find(s => s.id === E.id); if (!hasReal(spec)) return null; return { ex, it: (det && det.items.find(x => x.planId === spec.id || nn(x.name) === nn(spec.name))) || null, spec, name: spec.name }; }
      return null;
    },
    locContactEdit(kind, m, p) {
      const st = this.slvState(), E = this.findWorldElectrode(st.elec); if (!E) return;
      if (kind === 'select') { st.elecK = m.edit; st.pair = null; this.stepElectrode(0); return; }
      const T = this.locTarget(E); if (!T) { this.electrodeCheckMarkers(); return; }
      const R = T.spec && T.spec.real, base = E.kind === 'real' ? (R || T.it) : (T.it || R), C = base.contacts.map(c => c.slice());
      const tip0 = (base.tip || C[0]).slice(), ent0 = (base.entry || C[C.length - 1]).slice(), ax = unit(sub(ent0, tip0)), along = q => dot(sub(q, tip0), ax);
      let k = m ? m.edit : null, msg = '';
      if (kind === 'move') { C[k] = r2(p); msg = `${T.name}${k + 1} déplacé de ${D(base.contacts[k], p).toFixed(1)} mm`; }
      else if (kind === 'delete') { if (C.length <= 2) { this.toast('Une électrode garde au moins deux plots', 2500); return; } C.splice(k, 1); msg = `${T.name}${k + 1} retiré — les plots suivants sont renumérotés`; st.elecK = Math.min(k, C.length - 1); }
      else if (kind === 'add') {
        if (C.some(c => D(c, p) < 1.5)) { this.toast('Un plot est déjà à cet endroit', 2000); return; }
        const t = along(p), off = D(p, [tip0[0] + ax[0] * t, tip0[1] + ax[1] * t, tip0[2] + ax[2] * t]);
        if (off > 10) { this.toast('Cliquez près de l’électrode (à moins de 10 mm de son axe) pour ajouter un plot', 3500); return; }
        k = C.findIndex(c => along(c) > t); if (k < 0) k = C.length; C.splice(k, 0, r2(p)); st.elecK = k; msg = `plot ajouté : ${T.name}${k + 1} (${C.length} plots)`;
      } else return;
      this.locPushUndo(T);
      const geom = o => {
        o.contacts = C.map(c => c.slice()); o.tip = C[0].slice();
        o.entry = along(ent0) >= along(C[C.length - 1]) ? ent0.slice() : C[C.length - 1].slice(); o.edited = true;
      };
      if (T.it) { geom(T.it); T.it.n = C.length; T.it.dir = unit(sub(T.it.entry, T.it.tip)); T.it.length = D(T.it.tip, T.it.entry); T.it.manual = true; }
      if (R) { geom(R); R.contacts = R.contacts.map(r2); R.tip = r2(R.tip); R.entry = r2(R.entry); R.n = C.length; const mm = SV.Electrodes.modelFor(T.spec.maker || this.exMaker(T.ex), C.length); if (mm && !(SV.Electrodes.modelById(T.spec.model) || {}).groups) T.spec.model = mm.id; }
      this.locAfterEdit(T.ex, { real: !!R }); this.renderImagingBar(); this.toast(msg, 2500);
    },
    locPushUndo(T) {
      const keep = o => o ? JSON.stringify({ contacts: o.contacts, tip: o.tip, entry: o.entry, dir: o.dir, length: o.length, n: o.n, edited: o.edited, manual: o.manual }) : null;
      const u = this._locUndo = this._locUndo || []; u.push({ ex: T.ex, it: T.it, itS: keep(T.it), spec: T.spec, realS: T.spec && T.spec.real ? JSON.stringify(T.spec.real) : null }); if (u.length > 40) u.shift();
    },
    locUndoN() { return (this._locUndo || []).length; },
    locUndo() {
      const u = (this._locUndo || []).pop(); if (!u) return;
      if (u.it && u.itS) Object.assign(u.it, JSON.parse(u.itS)); if (u.spec && u.realS) u.spec.real = JSON.parse(u.realS);
      const st = this.slvState(), E = st.elec && this.findWorldElectrode(st.elec); if (E) st.elecK = Math.min(st.elecK || 0, E.pts.length - 1);
      this.locAfterEdit(u.ex, { real: !!u.realS }); this.renderImagingBar(); this.toast('Modification des plots annulée', 1800);
    },
    /** opacité des électrodes dans les coupes (propre à la vue, retrouvée en y revenant) */
    setElecAlpha(a) {
      const st = this.slvState(); st.elecAlpha = Math.max(0.1, Math.min(1, a)); if (this.slices && this.slices.setMarkerAlpha) this.slices.setMarkerAlpha(st.elecAlpha);
      document.querySelectorAll('.loc-eop, .ip-layers .eop, .ip-multi .eop').forEach(x => { if (+x.value !== Math.round(st.elecAlpha * 100)) x.value = Math.round(st.elecAlpha * 100); });
    },

    // ---------------------------------------------------------------- scanner importé depuis la Localisation
    /** scanner post-implantation : même import que l'Imagerie (NIfTI, fichiers ou dossier DICOM), puis recalage */
    locPickCT(anchor) { this.imagePickMenu(anchor || document.querySelector('#locAddCT, #locAddCT2') || document.body, files => this.locImportCT(files)); },
    async locImportCT(files) {
      const d = this.dossier; if (!d || !files.length) return; if (!S.refImaging(d)) { this.toast('Importez d’abord le T1 de référence (Dossier › Imagerie)', 4000); return; }
      const added = await this.importFiles(files, { modality: 'CT', timepoint: 'postimplant', noRender: true }); if (!added || !added.length) return;
      const W = this.ui.ce = this.ui.ce || {}; W.ctId = added[added.length - 1].id; if (this.slvReset) this.slvReset(); this.refreshImagingScreen();
      for (const im of added) await this.coregImage(im, true);
      if (this.slvReset) this.slvReset(); this.refreshImagingScreen();
      const ok = added.filter(im => im.coreg && im.coreg.T).length;
      this.toast(ok ? `Scanner importé et recalé sur le T1 (${added.length > 1 ? added.length + ' images' : esc(added[0].label)}) : vérifiez la superposition, puis « Détecter les électrodes »` : 'Scanner importé ; le recalage a échoué : « recaler sur le T1 » ou « ajuster »', 6000);
    },
    async locUseAsCT(im) {
      if (!im) return; im.modality = 'CT'; im.timepoint = 'postimplant'; this.touch('imaging', im.id, 'scanner post-implantation');
      const W = this.ui.ce = this.ui.ce || {}; W.ctId = im.id; if (this.slvReset) this.slvReset(); this.refreshImagingScreen();
      if (!(im.coreg && im.coreg.T)) { await this.coregImage(im, true); if (this.slvReset) this.slvReset(); this.refreshImagingScreen(); }
    },
  };
  Object.assign(SV.app, M);
})(window.SV = window.SV || {});
