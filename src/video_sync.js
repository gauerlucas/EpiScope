/* EpiScope — video_sync.js (v1.1.0) : vidéos calées sur l'heure absolue des tracés.
 *   Modèle (store.js) : d.syncLinks — une entrée par vidéo de la galerie : début absolu, dérive, méthode, points.
 *   - Fenêtre « Heure de la vidéo » (galerie, panneau vidéo de la visionneuse) : début saisi (ou lu dans le nom du fichier
 *     à l'import), tracé associé, points de synchronisation (même évènement dans la vidéo et dans le tracé ; 1 point =
 *     décalage, 2 et plus = décalage + dérive), contrôle « crise → instant de la vidéo ».
 *   - Visionneuse de tracés : bouton « ▶ Vidéo » ; panneau flottant qui montre la vidéo couvrant le curseur (« pas de vidéo
 *     à 21:58 » sinon), la suit quand on navigue, et fait suivre le tracé pendant la lecture ; « 📍 Point de synchro »
 *     prend l'instant de la vidéo et l'heure du curseur ; plusieurs vidéos : la plus récente qui couvre l'instant, au choix.
 *   - Frise de la visionneuse : bandes bleues des vidéos calées.
 *   - Crises : une crise dont le début absolu est couvert par une vidéo calée y trouve sa vidéo et son t = 0
 *     (video_annot.js, sz.video), sans réglage.                                                                        */
(function (SV) {
  'use strict';
  const S = SV.Store, A = SV.app, esc = SV.U.esc, $ = id => document.getElementById(id);
  const isVideo = g => !!g && /^video\//.test(g.mime || '');
  const hms = iso => iso ? String(iso).slice(11, 19) + (/\.\d{3}$/.test(iso) && !/\.000$/.test(iso) ? ',' + iso.slice(20, 23) : '') : '—';
  const dmy = iso => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '';
  const mmss = s => { s = Math.max(0, s || 0); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s - 3600 * h - 60 * m; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + (r < 10 ? '0' : '') + r.toFixed(1).replace('.', ','); };
  const METH = { metadata: 'métadonnées du fichier', filename: 'nom du fichier', manual: 'saisie', points: 'points de synchronisation' };
  /** « 2021-06-02 23:35:43,250 », « 02/06/2021 23:35:43 », « 23:35:43 » (date par défaut) → ISO */
  function parseAbs(txt, dayIso) {
    const s = String(txt || '').trim().replace(',', '.');
    let m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(s);
    if (!m) { const m2 = /^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(s); if (m2) m = [m2[0], m2[3], m2[2], m2[1], m2[4], m2[5], m2[6], m2[7]]; }
    if (!m) { const m3 = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(s); const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(dayIso || ''); if (m3 && day) m = [m3[0], day[1], day[2], day[3], m3[1], m3[2], m3[3], m3[4]]; }
    if (!m) return null;
    return `${m[1]}-${m[2]}-${m[3]}T${String(m[4]).padStart(2, '0')}:${m[5]}:${m[6] || '00'}.${String(m[7] || '0').padEnd(3, '0').slice(0, 3)}`;
  }
  /** heure absolue → temps du tracé, ramené dans le tracé (avant le début : 0 ; dans une coupure : bloc suivant ; après : fin) */
  function absToTClamp(rec, iso, dur) {
    const ck = rec && rec.clock; if (!ck || !ck.start) return null; const r = S.isoDiff(ck.start, iso); if (r == null) return null;
    const B = ck.blocks || []; if (!B.length) return null; if (r <= B[0].r0) return B[0].t0;
    for (let i = 0; i < B.length; i++) { const b = B[i], e = b.r0 + (b.t1 - b.t0); if (r <= e) return b.t0 + (r - b.r0); if (i + 1 < B.length && r < B[i + 1].r0) return B[i + 1].t0; }
    return dur != null ? dur : B[B.length - 1].t1;
  }

  const M = {
    videoSyncOf(g) { return this.dossier && g ? S.syncOf(this.dossier, g.id) : null; },
    /** vidéos du dossier calées qui couvrent l'instant iso → [{ link, g, tv }], la plus récente d'abord */
    videosAtAbs(iso) { const d = this.dossier; return d && iso ? S.videosAt(d, iso).sort((a, b) => String(b.link.start).localeCompare(String(a.link.start))) : []; },
    /** fenêtre « Heure de la vidéo » ; o.tv / o.abs : point proposé (depuis la visionneuse) ; o.then : après enregistrement */
    async videoSyncDialog(g, o) {
      o = o || {}; const d = this.dossier; if (!d || !isVideo(g)) return;
      const L0 = S.syncOf(d, g.id), recs = [].concat(...(d.explorations || []).map(ex => (ex.recordings || []).filter(r => r.clock && r.clock.start).map(r => ({ r, ex }))));
      const st = { start: L0 ? L0.start : null, drift: L0 ? L0.drift || 0 : 0, method: L0 ? L0.method : 'manual', recordingId: (L0 && L0.recordingId) || o.recordingId || '', points: L0 ? JSON.parse(JSON.stringify(L0.points || [])) : [] };
      if (o.tv != null && o.abs) st.points.push({ tv: Math.round(o.tv * 1000) / 1000, abs: o.abs });
      const day0 = () => st.start || (recs.find(x => x.r.id === st.recordingId) || recs[0] || { r: { clock: {} } }).r.clock.start || '';
      const m = document.createElement('div'); m.className = 'modal'; m.style.zIndex = 400;
      m.innerHTML = `<div class="modal-card" style="max-width:640px"><div class="modal-head"><b>Heure de la vidéo</b> <span class="muted">${esc(g.title || g.name || 'vidéo')}${g.duration ? ' · ' + mmss(g.duration) : ''}</span><span class="spacer"></span><button class="close">✕</button></div><div class="prov-body">
        <div class="hint">Caler la vidéo sur l’heure des tracés : on donne l’heure de son début, ou on pose des points de synchronisation (le même évènement dans la vidéo et dans le tracé : artefact de mouvement, début clinique…). Avec deux points éloignés ou plus, la dérive de l’horloge de la caméra est corrigée.</div>
        <div class="form grid2" style="margin-top:8px"><label class="span2">Début de la vidéo (heure du poste d’acquisition) <input class="vs-start mono" placeholder="AAAA-MM-JJ HH:MM:SS ou JJ/MM/AAAA HH:MM:SS" value="${st.start ? esc(st.start.replace('T', ' ').replace(/\.000$/, '')) : ''}"></label>
          <label>Tracé associé <select class="vs-rec"><option value="">—</option>${recs.map(x => `<option value="${esc(x.r.id)}"${x.r.id === st.recordingId ? ' selected' : ''}>${esc(x.ex.label || '')} · ${esc(x.r.title || '')}</option>`).join('')}</select></label>
          <label>Méthode <input class="vs-meth" disabled></label></div>
        <div class="vs-drift hint"></div>
        <h4 style="margin:10px 0 4px">Points de synchronisation</h4><table class="mini vs-pts"><thead><tr><th>vidéo</th><th>heure</th><th>écart</th><th></th></tr></thead><tbody></tbody></table>
        <div class="row" style="gap:6px;margin-top:4px"><input class="vs-ptv mono" placeholder="vidéo (mm:ss)" style="width:110px"><input class="vs-pabs mono" placeholder="heure (HH:MM:SS)" style="width:150px"><button class="mini-btn vs-padd">ajouter le point</button><button class="mini-btn vs-fit" title="début et dérive calculés d’après les points">caler sur les points</button></div>
        <div class="vs-check hint" style="margin-top:8px"></div>
        <div class="btnrow"><button class="primary vs-ok">Enregistrer</button><button class="vs-cancel">Annuler</button></div></div></div>`;
      document.body.appendChild(m); const q = s => m.querySelector(s);
      const link = () => ({ start: st.start, drift: st.drift, method: st.method });
      const paint = () => {
        q('.vs-meth').value = METH[st.method] || st.method;
        q('.vs-drift').textContent = st.drift ? `Dérive de l’horloge de la vidéo : ${(st.drift * 3600).toFixed(2).replace('.', ',')} s par heure (corrigée).` : '';
        q('.vs-pts tbody').innerHTML = st.points.map((p, i) => { const e = st.start ? S.isoDiff(S.videoAbs(link(), p.tv), p.abs) : null; return `<tr><td class="mono">${mmss(p.tv)}</td><td class="mono">${esc(dmy(p.abs))} ${esc(hms(p.abs))}</td><td class="mono">${e == null ? '—' : (e >= 0 ? '+' : '−') + Math.abs(e).toFixed(2).replace('.', ',') + ' s'}</td><td><button class="mini-btn" data-i="${i}" title="retirer ce point">✕</button></td></tr>`; }).join('') || '<tr><td colspan="4" class="muted">aucun point</td></tr>';
        q('.vs-pts tbody').querySelectorAll('[data-i]').forEach(b => b.onclick = () => { st.points.splice(+b.dataset.i, 1); paint(); });
        const end = st.start && g.duration ? S.videoAbs(link(), g.duration) : null, cov = [];
        for (const z of d.seizures || []) if (z.onsetAbs) { const tv = st.start ? S.videoT(link(), z.onsetAbs) : null; cov.push(tv != null && tv >= 0 && tv <= (g.duration || 0) ? `${esc(z.label || 'crise')} (${hms(z.onsetAbs)}) → vidéo à ${mmss(tv)}` : tv != null && tv < 0 && tv > -3600 ? `${esc(z.label || 'crise')} (${hms(z.onsetAbs)}) : ${mmss(-tv)} <b>avant</b> le début de la vidéo` : ''); }
        q('.vs-check').innerHTML = st.start ? `Vidéo du ${esc(dmy(st.start))} ${esc(hms(st.start))}${end ? ' au ' + esc(hms(end)) : ''}.${cov.filter(Boolean).length ? '<br>' + cov.filter(Boolean).join('<br>') : ''}` : 'Début inconnu : saisissez l’heure du début ou posez un point.';
      };
      q('.vs-start').onchange = () => { const v = parseAbs(q('.vs-start').value, day0()); if (!v) { this.toast('Heure non reconnue : AAAA-MM-JJ HH:MM:SS', 3000); return; } st.start = v; st.method = 'manual'; st.drift = 0; paint(); };
      q('.vs-rec').onchange = () => { st.recordingId = q('.vs-rec').value; paint(); };
      q('.vs-padd').onclick = () => { const tv = (() => { const t = String(q('.vs-ptv').value).trim().replace(',', '.').split(':').map(Number); return t.some(isNaN) || !t.length ? null : t.reduce((a, x) => a * 60 + x, 0); })(), ab = parseAbs(q('.vs-pabs').value, day0()); if (tv == null || !ab) { this.toast('Point incomplet : instant de la vidéo (mm:ss) et heure (HH:MM:SS)', 3000); return; } st.points.push({ tv, abs: ab }); q('.vs-ptv').value = q('.vs-pabs').value = ''; paint(); };
      q('.vs-fit').onclick = () => { const f = S.fitSync(st.points); if (!f) { this.toast('Aucun point', 2000); return; } Object.assign(st, f, { method: 'points' }); q('.vs-start').value = st.start.replace('T', ' ').replace(/\.000$/, ''); paint(); };
      if (o.tv != null && o.abs) q('.vs-fit').onclick();
      paint();
      return new Promise(res => {
        const close = v => { m.remove(); res(v); };
        q('.close').onclick = q('.vs-cancel').onclick = () => close(null);
        q('.vs-ok').onclick = () => {
          if (!st.start) { this.toast('Début de la vidéo inconnu', 2500); return; }
          const L = S.addSyncLink(d, { galleryId: g.id, recordingId: st.recordingId || null, start: st.start, drift: st.drift, method: st.method, points: st.points });
          this.touch('gallery', g.id, `vidéo calée sur l’heure des tracés (${METH[L.method] || L.method})`); if (this._iev) this.ieegDraw(); if (o.then) o.then(L); close(L);
        };
      });
    },

    // ------------------------------------------------------------------ panneau vidéo de la visionneuse
    ieegVideoAbs() { const V = this._iev; if (!V || !V.rec.clock) return null; const t = V.cursor != null ? V.cursor : V.t + V.page * 0.3; return S.clockAbs(V.rec.clock, t); },
    ieegVideoToggle(open) {
      const V = this._iev; if (!V) return; open = open == null ? !V.vid : open;
      if (!open) { if (V.vid) { V.vid.el.pause(); V.vid.box.remove(); } V.vid = null; this.ieegVideoBtn(); return; }
      if (!V.rec.clock || !V.rec.clock.start) { this.toast('Heure réelle du tracé inconnue : impossible de caler une vidéo', 3500); return; }
      const box = document.createElement('div'); box.className = 'ie-vid';
      box.innerHTML = `<div class="ie-vid-h"><b>Vidéo</b><select class="ie-vid-sel" title="vidéos qui couvrent cet instant"></select><span class="spacer"></span><button class="mini-btn ie-vid-pt" title="point de synchronisation : l’instant affiché dans la vidéo correspond à l’heure du curseur du tracé">📍 point</button><button class="mini-btn ie-vid-set" title="heure de la vidéo, points de synchronisation">⚙</button><button class="mini-btn ie-vid-x" title="fermer">✕</button></div><video playsinline controls preload="auto"></video><div class="ie-vid-st muted small"></div>`;
      V.el.appendChild(box);
      V.vid = { box, el: box.querySelector('video'), g: null, link: null, follow: true };
      const vd = V.vid, el = vd.el;
      // déplacer le panneau par sa barre de titre (position gardée sur le poste)
      try { const p = JSON.parse(localStorage.getItem('sv_vidpos') || 'null'); if (p) { box.style.left = p.x + 'px'; box.style.top = p.y + 'px'; box.style.right = 'auto'; } } catch (e) { }
      box.querySelector('.ie-vid-h').onpointerdown = e => { if (e.target.closest('button,select')) return; const r = box.getBoundingClientRect(), pr = V.el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
        const mv = ev => { const x = Math.max(0, Math.min(pr.width - 120, ev.clientX - pr.left - dx)), y = Math.max(0, Math.min(pr.height - 60, ev.clientY - pr.top - dy)); box.style.left = x + 'px'; box.style.top = y + 'px'; box.style.right = 'auto'; };
        const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); try { localStorage.setItem('sv_vidpos', JSON.stringify({ x: parseFloat(box.style.left), y: parseFloat(box.style.top) })); } catch (e2) { } };
        document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up); };
      box.querySelector('.ie-vid-x').onclick = () => this.ieegVideoToggle(false);
      box.querySelector('.ie-vid-sel').onchange = e => this.ieegVideoShow(e.target.value);
      box.querySelector('.ie-vid-set').onclick = async () => { const g = vd.g || (d => (d.gallery || []).find(isVideo))(this.dossier); if (!g) { this.toast('Aucune vidéo dans la galerie de ce dossier', 3000); return; } await this.videoSyncDialog(g, { recordingId: V.rec.id }); this.ieegVideoFollow(true); };
      box.querySelector('.ie-vid-pt').onclick = async () => {
        const abs = this.ieegVideoAbs(); if (!abs) return;
        let g = vd.g; if (!g) { const vids = (this.dossier.gallery || []).filter(isVideo); if (!vids.length) { this.toast('Aucune vidéo dans la galerie de ce dossier', 3000); return; } g = vids.length === 1 ? vids[0] : await this.pickVideo(vids); if (!g) return; await this.ieegVideoLoad(g, null); }
        const L = await this.videoSyncDialog(g, { recordingId: V.rec.id, tv: el.currentTime || 0, abs }); if (L) this.ieegVideoFollow(true);
      };
      // lecture : le curseur du tracé suit la vidéo ; la page avance quand le curseur en sort
      el.addEventListener('timeupdate', () => {
        if (el.paused || !vd.link || this._iev !== V) return; const abs = S.videoAbs(vd.link, el.currentTime), t = abs && S.clockT(V.rec.clock, abs); if (t == null) return;
        vd.self = true; V.cursor = t; if (t < V.t || t > V.t + V.page) V.t = Math.max(0, Math.min(t - V.page * 0.2, V.mem.duration - V.page)); this.ieegDraw();
      });
      this.ieegVideoBtn(); this.ieegVideoFollow(true);
    },
    pickVideo(vids) {
      return new Promise(res => { const items = [{ head: 'Quelle vidéo caler ?' }].concat(vids.map(g => ({ label: (g.title || g.name || 'vidéo') + (g.duration ? ' · ' + mmss(g.duration) : ''), run: () => res(g) }))); const r = this._iev.vid.box.querySelector('.ie-vid-pt').getBoundingClientRect(); if (this.popupMenu) this.popupMenu(items, r.left, r.bottom + 4); else res(vids[0]); });
    },
    async ieegVideoLoad(g, tv) {
      const V = this._iev, vd = V && V.vid; if (!vd) return; const el = vd.el;
      if (!vd.g || vd.g.id !== g.id) { const url = await this.galleryMediaURL(g); if (!url) { this.toast('Fichier de la vidéo introuvable dans le dossier', 3500); return; } vd.g = g; el.src = url; }
      vd.link = S.syncOf(this.dossier, g.id);
      if (tv != null) { const go = () => { try { el.currentTime = Math.max(0, tv); } catch (e) { } }; if (el.readyState >= 1) go(); else el.addEventListener('loadedmetadata', go, { once: true }); }
    },
    async ieegVideoShow(gid) {
      const V = this._iev, vd = V && V.vid, abs = this.ieegVideoAbs(); if (!vd || !abs) return; const g = S.byId(this.dossier.gallery || [], gid); if (!g) return;
      const L = S.syncOf(this.dossier, gid); await this.ieegVideoLoad(g, L ? S.videoT(L, abs) : 0);
    },
    /** curseur ou page déplacés : la vidéo couvrant l'instant est chargée et placée ; sinon un message */
    async ieegVideoFollow(force) {
      const V = this._iev, vd = V && V.vid; if (!vd) return; if (vd.self) { vd.self = false; return; } if (!force && !vd.el.paused) return;
      const abs = this.ieegVideoAbs(), hits = this.videosAtAbs(abs), sel = vd.box.querySelector('.ie-vid-sel'), stEl = vd.box.querySelector('.ie-vid-st');
      sel.innerHTML = hits.map(x => `<option value="${esc(x.g.id)}">${esc(x.g.title || x.g.name || 'vidéo')}</option>`).join('') || '<option value="">—</option>'; sel.disabled = hits.length < 2;
      const cur = vd.g && hits.find(x => x.g.id === vd.g.id), pick = cur || hits[0];
      if (pick) { sel.value = pick.g.id; await this.ieegVideoLoad(pick.g, pick.tv); vd.el.hidden = false; vd.el.style.opacity = ''; stEl.textContent = `${hms(abs)} = vidéo ${mmss(pick.tv)}${pick.link.method === 'points' ? ' (points)' : ''}`; }
      else { vd.el.pause(); vd.el.hidden = !vd.g; vd.el.style.opacity = '0.3'; stEl.innerHTML = `Pas de vidéo calée à ${esc(hms(abs))}.${vd.g ? '' : ' « ⚙ » ou « 📍 point » pour caler une vidéo de la galerie.'}`; }
    },
    ieegVideoBtn() { const V = this._iev; if (!V) return; const b = V.el.querySelector('.ie-vidb'); if (b) b.classList.toggle('on', !!V.vid); },
    /** frise : bandes des vidéos calées (sous la règle) */
    ieegOvwVideos() {
      const V = this._iev, d = this.dossier; if (!V || !V.ovGeo || !V.rec.clock || !V.rec.clock.start || !d || !(d.syncLinks || []).length) return;
      const { GUT, pw, o0, o1 } = V.ovGeo, X = t => GUT + (t - o0) / (o1 - o0) * pw, g = V.ov.getContext('2d'), dur = V.mem.duration;
      g.save(); g.beginPath(); g.rect(GUT, 0, pw, V.ov.clientHeight); g.clip();
      let row = 0; for (const L of d.syncLinks) { const gi = S.byId(d.gallery || [], L.galleryId); if (!gi || !L.start) continue;
        const a = absToTClamp(V.rec, L.start, dur), b = absToTClamp(V.rec, S.videoAbs(L, gi.duration || 0), dur); if (a == null || b == null || b <= a) continue;
        const y = 16 + (row++ % 3) * 4; g.fillStyle = 'rgba(76,150,240,0.85)'; g.fillRect(X(a), y, Math.max(2, X(b) - X(a)), 3); }
      g.restore();
    },
  };
  Object.assign(A, M);
  A.videoParseAbs = parseAbs; A.videoAbsToT = absToTClamp;

  // visionneuse : bouton « ▶ Vidéo » à côté des marques ; panneau fermé avec la visionneuse
  SV.Hooks.wrap(A, 'ieegOpen', async function (orig) {
    const r = await orig(), V = this._iev; if (!V || !V.el || V.el.querySelector('.ie-vidb')) return r;
    const mlb = V.el.querySelector('.ie-mlb'); if (!mlb) return r;
    const b = document.createElement('button'); b.className = 'ie-vidb'; b.textContent = '▶ Vidéo'; b.title = 'vidéo calée sur l’heure du tracé : suit le curseur, et le tracé la suit pendant la lecture';
    b.onclick = () => this.ieegVideoToggle(); mlb.insertAdjacentElement('afterend', b); return r;
  }, 'video_sync');
  SV.Hooks.wrap(A, 'ieegClose', function (orig) { const V = this._iev; if (V && V.vid) { try { V.vid.el.pause(); } catch (e) { } } return orig(); }, 'video_sync');
  SV.Hooks.wrap(A, 'ieegPaintOverview', function (orig) { const r = orig(); try { this.ieegOvwVideos(); } catch (e) { console.warn('vidéos sur la frise', e); } return r; }, 'video_sync');
  SV.Hooks.wrap(A, 'ieegDraw', function (orig) { const r = orig(); const V = this._iev; if (V && V.vid) { clearTimeout(V.vid._ft); V.vid._ft = setTimeout(() => this.ieegVideoFollow(), 120); } return r; }, 'video_sync');
  // crise : vidéo calée qui couvre son début → vidéo et t = 0 trouvés sans réglage
  SV.Hooks.wrap(A, 'videoLinked', function (orig, sz) {
    const g = orig(sz); if (g || !sz || !sz.onsetAbs) return g;
    const hit = this.videosAtAbs(sz.onsetAbs)[0]; if (!hit) return g;
    sz.video = { galleryId: hit.g.id, t0: Math.round(hit.tv * 10) / 10, auto: true }; return hit.g;
  }, 'video_sync');
})(window.SV = window.SV || {});
