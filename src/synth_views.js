/* EpiScope — synth_views.js : vues de la synthèse des crises d'une exploration (phase 1), en deux parties.
 *   1. Régions candidates : le score d'origine consensuel de chaque région (crises habituelles comptées double) peint sur le
 *      cortex et les structures profondes (rampe d'activation), faces latérale et médiale de l'hémisphère favorisé (et la face
 *      latérale de l'autre si la latéralisation est incertaine) ;
 *   2. Réseaux des hypothèses récurrentes : pour chacune (au plus trois), le réseau de mise en jeu (nœuds, faisceaux, liens de
 *      synchronisation, étiquettes) et la dynamique conditionnée à son origine, calculés sur la crise où elle a le meilleur score.
 *   Calcul dans la file de la vue 3D (viewerTask) sans toucher à l'espace de travail ; la vue 3D est rendue telle quelle.
 *   Les vues servent à l'onglet « Synthèse des crises », au rapport de la phase 1 et à la diapositive de synthèse du staff.  */
(function (SV) {
  'use strict';
  const $ = id => document.getElementById(id), S = SV.Store, V = S.V;
  const esc = SV.U.esc;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const hash = s => { let x = 5381; for (let i = 0; i < s.length; i++) x = ((x << 5) + x + s.charCodeAt(i)) | 0; return (x >>> 0).toString(36); };
  const RAMP_CSS = 'linear-gradient(90deg, rgb(255,230,150), rgb(255,196,70), rgb(255,120,55), rgb(214,40,70), rgb(140,25,95))';
  const BASE = { inflate: 0, opacity: 1, sub: true, subFilter: 'all', subOpacity: 0.95, subHemi: 'both', subFams: null, fibers: false, nodes: false, sync: false, netLabels: false, hubLabels: false, electrodes: false, labels: false, thermo: false, stims: false, ccep: false, quant: null, neutral: false, tilt: 0, frontGlass: true, hyps: [], paint: null, zones: null, borders: false, hemi: 'both', elecHemi: 'both', probe: false, rois: false, title: '', viewFr: '', slices3d: false, clip: '' };
  const HF = h => h === 'L' ? 'G' : 'D';

  const M = {
    /** signature des vues : crises (séquences, paramètres), lésions, dominance, anatomie affichée */
    synthSig(cons) { const d = this.dossier; return hash(JSON.stringify([cons.per.map(p => [p.sz.id, p.sz.events, p.sz.habitual, p.sz.eeg_onset, p.sz.params]), S.lesionRegions(d), d.patient.dominant, this.anatMode, !!(this.atlas && this.atlas.patient)])); },
    /** vues de synthèse, mises en cache pour la session ; o = { nHyp, shot } → Promise<{ cand: [{title, img}], hyps: [...], fav, both }> */
    synthViews(cons, o) {
      const C = this._synCache || (this._synCache = new Map()), key = this.synthSig(cons) + ':' + JSON.stringify(o || {});
      if (C.has(key)) return C.get(key);
      const p = this.viewerTask(() => this.synthShots(cons, o)).catch(e => { console.error(e); C.delete(key); return null; });
      C.set(key, p); return p;
    },
    /** peinture des régions candidates : score consensuel au-dessus de 45 % du meilleur, rampe d'activation */
    synthCandPaint(cons, A) {
      A = A || this.atlas; let mx = 1e-6; for (let i = 1; i < A.N; i++) if (cons.region[i] > mx) mx = cons.region[i];
      const map = new Map(); for (let i = 1; i < A.N; i++) { const v = cons.region[i] / mx; if (v >= 0.45) { const u = (v - 0.45) / 0.55, c = SV.rampColor(0.35 + 0.65 * u); map.set(i, [c[0], c[1], c[2], 0.6 + 0.4 * u]); } }
      return map;
    },
    /** à appeler dans la file de la vue 3D */
    async synthShots(cons, o) {
      o = Object.assign({ nHyp: 3, shot: { scale: 1.5, crop: true, format: 'jpeg', quality: 0.9 } }, o || {});
      const V3 = this.viewer, A = this.atlas, out = { cand: [], hyps: [], fav: cons.pL >= 0.5 ? 'L' : 'R', both: cons.pL > 0.3 && cons.pL < 0.7 };
      if (!V3 || V3.mode !== 'webgl' || !cons.n) return out;
      const restore = { layout: V3.layoutName, active: V3.active, linked: V3.linked, cfgs: V3.cells.map(c => Object.assign({}, c.cfg, { hyps: c.cfg.hyps.slice() })), act: V3.activation, hyps: V3.hypActs, hl: V3.highlight, paint: V3.paints && V3.paints.synthCand };
      const shot = () => V3.snapshot(Object.assign({}, o.shot));
      try {
        V3.setLinked(false); V3.setLayout('single');
        // 1. régions candidates
        V3.setPaint('synthCand', this.synthCandPaint(cons, A));
        V3.setCellConfig(0, Object.assign({}, BASE, { paint: 'synthCand', borders: true, subFilter: 'noCb' }), true);
        const f = out.fav, views = [[f === 'L' ? 'latL' : 'latR', 'face latérale ' + HF(f)], [f === 'L' ? 'medL' : 'medR', 'face médiale ' + HF(f)]];
        if (out.both) views.push([f === 'L' ? 'latR' : 'latL', 'face latérale ' + HF(f === 'L' ? 'R' : 'L')]);
        for (const [v, t] of views) { V3.setView(v, false); await wait(140); out.cand.push({ title: t, img: shot() }); }
        V3.setPaint('synthCand', null);
        // 2. réseaux des hypothèses récurrentes (crise où l'hypothèse a le meilleur score)
        for (const [k, e] of cons.hyps.slice(0, o.nHyp).entries()) {
          const r = this.seizureModel(e.sz), H = r.hypotheses.find(x => x.name === e.name && x.hemi === e.hemi) || null; if (!H) continue;
          SV.Model.hypothesisDynamics(r, H);
          const key = 'h' + (90 + k), labels = H.trajectory.filter(n => n.origin || n.signs.length).slice(0, 9).map(n => ({ region: n.region, text: esc(A.label(n.region).replace(/ [GD]$/, '')), sub: n.origin ? 'H' + (k + 1) + ' · origine supposée' : n.signs.slice(0, 3).map(s => s.label_fr).join(', ') + (n.signs.length > 3 ? ' …' : ''), origin: !!n.origin }));
          V3.setLayer(key, Object.assign({}, H.network, { labels, _hyp: H }), SV.hypColor(k));
          const tH = Math.min(r.tmax, H.trajectory[H.trajectory.length - 1].t + 2), kk = Math.max(0, Math.min(r.T - 1, Math.round((tH - r.tmin) / r.params.step)));
          V3.setActivations(r.A.subarray(kk * r.N, (kk + 1) * r.N), { [key]: H.A.subarray(kk * r.N, (kk + 1) * r.N) }, null); if (V3.setTime) V3.setTime(tH);
          V3.setCellConfig(0, Object.assign({}, BASE, { hyps: [key], opacity: 0.3, fibers: true, nodes: true, sync: true, netLabels: true }), true);
          const imgs = []; for (const [v, t] of [[H.hemi === 'L' ? 'latL' : 'latR', 'latérale ' + HF(H.hemi)], [H.hemi === 'L' ? 'medL' : 'medR', 'médiale ' + HF(H.hemi)]]) { V3.setView(v, false); await wait(160); imgs.push({ title: t, img: shot() }); }
          V3.removeLayer(key);
          out.hyps.push({ k, name: e.name, hemi: e.hemi, color: SV.hypCss(k), top: e.top, n: e.n, seizureId: e.sz.id, seizure: e.sz.label, origin: A.label(H.origin), path: H.trajectory.slice(0, 8).map(n => A.label(n.region)), imgs });
        }
      } finally {
        if (restore.paint) V3.setPaint('synthCand', restore.paint);
        V3.setLayout(restore.layout); restore.cfgs.forEach((cfg, i) => V3.setCellConfig(i, cfg, true)); V3.setActive(restore.active); V3.setLinked(restore.linked);
        V3.setActivations(restore.act, restore.hyps, restore.hl); if (V3.setTime) V3.setTime(this.ui.t || 0);
      }
      return out;
    },
    /** légende de la peinture des régions candidates */
    synthLegendHtml() { return `<div class="syn-leg"><i style="background:${RAMP_CSS}"></i><span>score d’origine consensuel, de 45 % du meilleur score au meilleur</span></div>`; },
    /** ouvre la crise représentative d'une hypothèse dans l'espace de travail, réseau affiché */
    synthOpen3d(hy) {
      if (!hy || !hy.seizureId) return; this.go({ seizureId: hy.seizureId, view: 'crise' });
      setTimeout(() => {
        const r = this.result; if (!r) return; const H = r.hypotheses.find(x => x.name === hy.name && x.hemi === hy.hemi); if (!H) return;
        const V3 = this.viewer, cfg = V3.activeCfg; if (!cfg.hyps.includes('h' + H.index) && this.toggleHypothesis) this.toggleHypothesis(H.index);
        this.setTime(Math.min(r.tmax, H.trajectory[H.trajectory.length - 1].t + 2));
      }, 450);
    },
    /** carte « visualisation de la synthèse » (onglet Synthèse des crises) */
    renderSynthViz(host, cons) {
      if (!host) return;
      host.innerHTML = `<div class="card-h">Visualisation de la synthèse <span class="muted">régions candidates et réseaux des hypothèses récurrentes du modèle</span><span class="spacer"></span><button class="mini-btn" data-a="re" title="recalculer les vues">↻</button></div>
        <div class="syn-viz"><div class="syn-part"><div class="sub-h">Régions candidates <span class="muted">(consensus de ${cons.n} crise${cons.n > 1 ? 's' : ''})</span></div><div class="syn-imgs" data-p="cand"><div class="hint">calcul des vues…</div></div>${this.synthLegendHtml()}</div>
          <div class="syn-part"><div class="sub-h">Réseaux des hypothèses récurrentes</div><div class="seg syn-tabs"></div><div class="syn-imgs" data-p="net"><div class="hint">calcul des vues…</div></div><div class="syn-net-info muted small"></div></div></div>`;
      host.querySelector('[data-a=re]').onclick = () => { this._synCache = new Map(); this.renderSynthViz(host, cons); };
      const fig = (v, big) => `<figure class="syn-fig${big ? ' big' : ''}"><img src="${v.img}" alt=""><figcaption>${esc(v.title)}</figcaption></figure>`;
      this.synthViews(cons).then(R => {
        if (!host.isConnected) return;
        const cb = host.querySelector('[data-p=cand]'), nb = host.querySelector('[data-p=net]'), tabs = host.querySelector('.syn-tabs'), info = host.querySelector('.syn-net-info');
        if (!R || !R.cand.length) { cb.innerHTML = '<div class="hint">Vues indisponibles (rendu 3D logiciel ou aucune crise).</div>'; nb.innerHTML = ''; return; }
        cb.innerHTML = R.cand.map(v => fig(v)).join('');
        if (!R.hyps.length) { nb.innerHTML = '<div class="hint">Aucune hypothèse récurrente.</div>'; return; }
        let cur = 0;
        const show = k => { cur = k; const hy = R.hyps[k]; tabs.querySelectorAll('button').forEach((b, j) => b.classList.toggle('on', j === k)); nb.innerHTML = hy.imgs.map(v => fig(v)).join('');
          info.innerHTML = `<b style="color:${hy.color}">H${k + 1}</b> ${esc(hy.name)} ${hy.hemi === 'L' ? 'gauche' : 'droit'} · origine supposée ${esc(hy.origin)} · H1 dans ${hy.top}/${cons.n} crise${cons.n > 1 ? 's' : ''}, présente dans ${hy.n} · réseau calculé sur ${esc(hy.seizure)} <span class="muted small">— clic sur une vue : 3D manipulable</span>`;
          // v5.1 : un clic sur une vue du réseau ouvre la crise en 3D (réseau affiché) ; plus de bouton séparé
          nb.querySelectorAll('.syn-fig img').forEach(im => { im.title = 'ouvrir en 3D (réseau affiché, manipulable)'; im.style.cursor = 'pointer'; im.onclick = () => this.synthOpen3d(hy); }); };
        tabs.innerHTML = R.hyps.map((hy, k) => `<button style="--hue:${hy.color}"><b style="color:${hy.color}">H${k + 1}</b> ${esc(hy.name)} ${HF(hy.hemi)}</button>`).join('');
        tabs.querySelectorAll('button').forEach((b, k) => b.onclick = () => show(k));
        cb.querySelectorAll('.syn-fig img').forEach(im => im.onclick = () => this.synthZoom(im.src, im.closest('figure').querySelector('figcaption').textContent));
        show(cur);
      });
    },
    /** vue en grand (clic ou Échap pour fermer) */
    synthZoom(src, cap) {
      const z = document.createElement('div'); z.className = 'syn-zoom'; z.innerHTML = `<img src="${src}" alt=""><div>${esc(cap || '')}</div>`;
      const close = () => { z.remove(); document.removeEventListener('keydown', key, true); }, key = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
      z.onclick = close; document.addEventListener('keydown', key, true); document.body.appendChild(z);
    },
    /** HTML des vues de synthèse pour un rapport (vues déjà calculées) */
    synthReportHtml(R, cons) {
      if (!R || !R.cand.length) return '';
      const fig = v => `<figure><img class="zoomable" src="${v.img}" alt=""><figcaption>${esc(v.title)}</figcaption></figure>`;
      return `<div class="views">${R.cand.map(fig).join('')}</div><p class="m">Régions candidates : score d’origine consensuel (crises habituelles comptées double), de l’orangé (45 % du meilleur score) au lie-de-vin (meilleur score).</p>`;
    },
    synthReportHypHtml(R, cons) {
      if (!R || !R.hyps.length) return '';
      const fig = v => `<figure><img class="zoomable" src="${v.img}" alt=""><figcaption>${esc(v.title)}</figcaption></figure>`;
      return R.hyps.map(hy => `<h5 style="color:${hy.color}">H${hy.k + 1} · ${esc(hy.name)} ${hy.hemi === 'L' ? 'gauche' : 'droit'} <span class="m">— H1 dans ${hy.top}/${cons.n} crise${cons.n > 1 ? 's' : ''}, présente dans ${hy.n} ; origine supposée ${esc(hy.origin)} ; réseau calculé sur ${esc(hy.seizure)}</span></h5><div class="views">${hy.imgs.map(fig).join('')}</div>`).join('');
    },
  };
  Object.assign(SV.app, M);
})(window.SV = window.SV || {});
