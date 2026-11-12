/* EpiScope — sleep_ui.js (v5.5) : onglet « Sommeil » de la visionneuse d'un EEG de scalp (calcul : sleep.js, YASA).
 *   Dérivation : C4-A1 / C3-A2 (ou M1/M2) d'abord, comme pour le modèle ; sinon C4–T3, C3–T4, C4 ou C3 de l'enregistrement.
 *   Modèle « EEG + âge et sexe » si le dossier les donne (âge à la date du tracé), sinon « EEG seul ».
 *   Résultat rangé dans le tracé : rec.sleep = { at, chan, model, epoch: 30, stages: 'W12R3…' (une lettre par époque, cotation
 *   retenue), auto (cotation du modèle), rev ('0' / '1' : époque relue), conf: [%] }.
 *   v5.8 — relecture époque par époque : pages de 30 s calées sur les époques, touches W / 1 / 2 / 3 / R (cote et passe à la
 *   suivante), ← →, Ctrl+Z, clic sur l'hypnogramme ; époques corrigées marquées, retour à la cotation automatique.
 *   Affichage : hypnogramme (panneau et aperçu), bande des stades en haut du tracé, teinte de fond facultative ;
 *   taux des pointes par stade (groupes de « Pointes → source ») ; signets : endormissement, 1er N3, 1er sommeil paradoxal.  */
(function (SV) {
  'use strict';
  const A = SV.app, E = SV.ESI, IE = SV.IEEG, ST = SV.Store, DR = SV.IeegDraw;
  const { esc, nf, clock } = DR, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const CODE = { W: 'W', N1: '1', N2: '2', N3: '3', R: 'R' }, NAME = { W: 'Éveil', 1: 'N1', 2: 'N2', 3: 'N3', R: 'Paradoxal' };
  const COLS = { W: '#f2c14e', R: '#e46aa6', 1: '#7fd1f0', 2: '#3d8fd6', 3: '#2a4f9e' }, ROW = { W: 0, R: 1, 1: 2, 2: 3, 3: 4 };
  const rgba = (hex, a) => `rgba(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(',')},${a})`;
  const REF = 'Vallat & Walker, eLife 2021 (YASA) ; règles AASM';

  const M = {
    /** dérivations possibles pour la stadification, la meilleure d'abord : [{ key, label, a, b (indices de voies, b −1), avg }] */
    slpDerivs(rec) {
      const ch = (rec.channels || []).map(c => c.name), idx = new Map(), out = [];
      ch.forEach((n, i) => { const k = E.stdName(n) || (/^(EEG\s*)?(A1|A2|M1|M2)([-_ ]?REF)?$/i.test(n.trim()) ? n.trim().replace(/^EEG\s*/i, '').replace(/[-_ ]?REF$/i, '').toUpperCase() : null); if (k && !idx.has(k)) idx.set(k, i); });
      const g = n => idx.has(n) ? idx.get(n) : null, add = (a, b, why) => { const ia = g(a), ib = b ? g(b) : -1; if (ia == null || ib == null) return; out.push({ key: a + (b ? '-' + b : ''), label: a + (b ? '–' + b : ' (réf. d’enregistrement)') + (why ? ' · ' + why : ''), a: ia, b: ib }); };
      for (const [a, b] of [['C4', 'A1'], ['C3', 'A2'], ['C4', 'M1'], ['C3', 'M2']]) add(a, b, 'recommandée');
      for (const [a, b] of [['C4', 'T3'], ['C4', 'T7'], ['C3', 'T4'], ['C3', 'T8']]) add(a, b, '');
      add('C4'); add('C3'); add('Cz');
      if (!out.length) ch.forEach((n, i) => { const p = E.bipName(n); if (p && /^C[34z]$/i.test(p[0])) out.push({ key: p.join('-'), label: p.join('–') + ' (bipolaire enregistré, non recommandé)', a: i, b: -1 }); });
      return out;
    },
    /** âge (à la date du tracé) et sexe du dossier → { age, male } ou null */
    slpDemo(rec) { const P = this.dossier && this.dossier.patient; if (!P || !P.birthYear || !/^[MF]$/.test(P.sex || '')) return null; const d = this.ieegRecStart ? this.ieegRecStart(rec) : null, a = ST.ageAt(P, d ? d.toISOString().slice(0, 10) : null); return a != null && a > 0 && a < 120 ? { age: a, male: P.sex === 'M' } : null; },
    /** corrections à la main : époques dont le stade diffère de la cotation automatique, époques relues */
    slpEdits(S) { if (!S || !S.stages || !S.auto) return { n: 0, seen: 0 }; let n = 0; for (let k = 0; k < S.stages.length; k++) if (S.stages[k] !== S.auto[k]) n++; return { n, seen: (String(S.rev || '').match(/1/g) || []).length }; },
    /** relecture époque par époque : page de 30 s calée sur les époques ; W / 1 / 2 / 3 / R cotent l'époque et passent à la suivante */
    slpReview(on) {
      const V = this._iev; if (!V) return; V.slpRev = on; const sel = V.el.querySelector('.ie-page');
      if (on) { V.slpPage0 = V.page; V.page = 30; V.t = Math.floor((V.t + 15) / 30) * 30; if (sel) sel.value = '30'; }
      else if (V.slpPage0) { V.page = V.slpPage0; if (sel) sel.value = String(V.page); }
      V.t = clamp(V.t, 0, Math.max(0, V.mem.duration - V.page)); this.ieegDraw(); this.slpRender();
    },
    slpEpoch(V) { return Math.max(0, Math.floor((V.t + Math.min(V.page, 30) / 2) / 30)); },   // époque au centre de la page
    slpGoEpoch(k) { const V = this._iev, S = V.rec.sleep; if (!S || !S.stages) return; k = clamp(k, 0, S.stages.length - 1); if (!V.slpRev) { V.t = clamp(k * 30 + 15 - V.page / 2, 0, Math.max(0, V.mem.duration - V.page)); } else V.t = clamp(k * 30, 0, Math.max(0, V.mem.duration - V.page)); this.ieegDraw(); this.slpRender(); },
    slpSet(c) {
      const V = this._iev, S = V.rec.sleep; if (!S || !S.stages) return; const k = this.slpEpoch(V); if (k >= S.stages.length) return;
      if (!S.auto) S.auto = S.stages; const rev = (S.rev || '').padEnd(S.stages.length, '0');
      (V.slpUndo = V.slpUndo || []).push({ k, c: S.stages[k], r: rev[k] }); S.stages = S.stages.slice(0, k) + c + S.stages.slice(k + 1); S.rev = rev.slice(0, k) + '1' + rev.slice(k + 1); V.dirty = true;
      this.slpGoEpoch(k + 1);
    },
    slpRevert() { const V = this._iev, S = V.rec.sleep; if (!S || !S.auto || !confirm('Revenir à la cotation automatique ? Les corrections à la main seront perdues.')) return; S.stages = S.auto; S.rev = ''; V.dirty = true; this.ieegDraw(); this.slpRender(); },
    slpParams(rec) { rec.sleep = rec.sleep || {}; return rec.sleep.params || (rec.sleep.params = { chan: null, bg: false }); },
    async slpCompute() {
      const V = this._iev, rec = V.rec, P = this.slpParams(rec), D = this.slpDerivs(rec), d = D.find(x => x.key === P.chan) || D[0];
      if (!d) { this.toast('Aucune électrode centrale (C3, C4, Cz) dans ce tracé', 5000); return; }
      if (V.mem.duration < 300) this.toast('Moins de 5 minutes : stadification peu fiable', 4000);
      const demo = this.slpDemo(rec), model = this.asset(demo ? 'yasa_eeg_demo' : 'yasa_eeg'); if (!model) { this.toast('Modèle de stadification absent de cette version', 5000); return; }
      const nEd = this.slpEdits(rec.sleep).n; if (nEd && !confirm(`Recalculer la stadification ? Les ${nEd} époques corrigées à la main seront perdues.`)) return;
      V.mbusy = 'slp'; V.mprog = 0; this.slpRender();
      try {
        const x = IE.deriveSignal(V.mem.data, { a: d.a, b: d.b }, 0, V.mem.nSamples), fs = V.mem.fs;
        const Fe = SV.Work && SV.Work.available ? await SV.Work.run(['sleep'], 'Sleep.features', [x, fs, demo || {}], [], p => { V.mprog = p; this.ieegMProg(); }) : SV.Sleep.features(x, fs, demo || {});
        if (this._iev !== V) return;
        const Mo = this._slpModel && this._slpModel.src === model ? this._slpModel.M : (this._slpModel = { src: model, M: SV.Sleep.loadModel(model) }).M, pr = SV.Sleep.predict(Mo, Fe);
        const st = pr.map(p => CODE[p.stage]).join('');
        Object.assign(rec.sleep, { at: ST.now(), chan: d.key, model: demo ? `EEG + âge (${demo.age} ans) et sexe` : 'EEG seul', epoch: 30, stages: st, auto: st, rev: '', conf: pr.map(p => Math.round(Math.max(...p.p) * 100)) });
        V.show.slp = V.show.slp !== false; V.dirty = true;
      } catch (e) { console.error(e); this.toast('Stadification : ' + e.message, 6000); }
      finally { if (this._iev === V) { V.mbusy = null; this.slpRender(); this.ieegDraw(); } }
    },
    /** stade au temps t (s) ou null */
    slpAt(rec, t) { const S = rec && rec.sleep; if (!S || !S.stages) return null; const k = Math.floor(t / (S.epoch || 30)); return k >= 0 && k < S.stages.length ? S.stages[k] : null; },
    /** minutes de chaque stade dans [a, b] hors fenêtres W (crises) → { W, 1, 2, 3, R } */
    slpMinutes(rec, a, b, W) { const S = rec.sleep, ep = S.epoch || 30, out = { W: 0, 1: 0, 2: 0, 3: 0, R: 0 }; for (let k = 0; k < S.stages.length; k++) { const u = Math.max(a, k * ep), v = Math.min(b, (k + 1) * ep); if (v <= u) continue; let d = v - u; for (const [p, q] of W || []) d -= Math.max(0, Math.min(v, q) - Math.max(u, p)); out[S.stages[k]] += Math.max(0, d) / 60; } return out; },
    /** résumé (AASM) : durées, efficacité, latences, part de chaque stade du temps de sommeil */
    slpStats(S) {
      const ep = (S.epoch || 30) / 60, st = S.stages, n = st.length, cnt = { W: 0, 1: 0, 2: 0, 3: 0, R: 0 }; for (const c of st) cnt[c]++;
      const on = st.search(/[123R]/), lat = c => { const i = st.indexOf(c, Math.max(0, on)); return i < 0 || on < 0 ? null : (i - on) * ep; }, last = Math.max(st.lastIndexOf('1'), st.lastIndexOf('2'), st.lastIndexOf('3'), st.lastIndexOf('R'));
      const tst = (cnt[1] + cnt[2] + cnt[3] + cnt.R) * ep, spt = on >= 0 ? (last - on + 1) * ep : 0, unsure = (S.conf || []).filter(p => p < 50).length;
      return { trt: n * ep, tst, se: n ? tst / (n * ep) : 0, sol: on < 0 ? null : on * ep, waso: on < 0 ? 0 : spt - tst, n3: lat('3'), rem: lat('R'), pct: k => tst ? cnt[k] * ep / tst : 0, min: k => cnt[k] * ep, unsure };
    },
    slpHypnoSvg(S, w, h, light, cur) {
      const st = S.stages, n = st.length, rows = ['W', 'R', '1', '2', '3'], y = c => 6 + ROW[c] * (h - 16) / 4, x = k => 34 + k * (w - 40) / n; let path = '';
      for (let k = 0; k < n; k++) { const c = st[k]; path += (k ? `L${x(k).toFixed(1)},${y(c).toFixed(1)}` : `M${x(0).toFixed(1)},${y(c).toFixed(1)}`) + `L${x(k + 1).toFixed(1)},${y(c).toFixed(1)}`; }
      const hrs = []; for (let t = 3600; t < n * 30; t += 3600) hrs.push(t);
      return `<svg class="slp-hyp" viewBox="0 0 ${w} ${h}" width="100%" preserveAspectRatio="none">${rows.map(c => `<text x="2" y="${y(c) + 3.5}" font-size="9" fill="${COLS[c]}">${NAME[c] === 'Paradoxal' ? 'SP' : NAME[c] === 'Éveil' ? 'Év' : NAME[c]}</text><line x1="34" x2="${w - 6}" y1="${y(c)}" y2="${y(c)}" stroke="${light ? '#0002' : '#fff1'}"/>`).join('')}
        ${hrs.map(t => `<line x1="${x(t / 30)}" x2="${x(t / 30)}" y1="2" y2="${h - 8}" stroke="${light ? '#0003' : '#fff2'}" stroke-dasharray="2 3"/><text x="${x(t / 30) + 2}" y="${h - 1}" font-size="8" fill="${light ? '#0008' : '#fff8'}">${t / 3600} h</text>`).join('')}
        ${[...st].map((c, k) => c === 'R' ? `<rect x="${x(k)}" y="${y('R') - 2.5}" width="${Math.max(0.8, x(k + 1) - x(k))}" height="5" fill="${COLS.R}"/>` : '').join('')}<path d="${path}" fill="none" stroke="${light ? '#14233a' : '#e9eef6'}" stroke-width="1.1"/>${S.auto ? [...st].map((c, k) => c !== S.auto[k] ? `<rect x="${x(k)}" y="${h - 7}" width="${Math.max(1, x(k + 1) - x(k))}" height="3" fill="#e8590c"/>` : '').join('') : ''}${cur != null ? `<rect x="${x(cur) - 0.5}" y="1" width="${Math.max(2, x(cur + 1) - x(cur) + 1)}" height="${h - 9}" fill="none" stroke="${light ? '#14233a' : '#fff'}" stroke-width="1"/>` : ''}</svg>`;   // orange : époques corrigées
    },
    slpRender() {
      const V = this._iev; if (!V || V.meth !== 'slp') return; V.slpShown = this.slpEpoch(V); const side = V.sb, rec = V.rec, S = rec.sleep || {}, P = this.slpParams(rec), D = this.slpDerivs(rec), demo = this.slpDemo(rec), busy = V.mbusy === 'slp';
      let body = `<div class="ie-sec"><div class="ctrl-row"><label title="Le modèle a été entraîné sur C4-M1 / C3-M2 : les autres dérivations sont moins fiables">dérivation <select class="s-ch">${D.map(d => `<option value="${esc(d.key)}"${(P.chan || (D[0] || {}).key) === d.key ? ' selected' : ''}>${esc(d.label)}</option>`).join('') || '<option>aucune électrode centrale</option>'}</select></label></div>
          <div class="hint">Modèle ${demo ? `EEG + âge (${demo.age} ans) et sexe (dossier)` : 'EEG seul (âge ou sexe absent du dossier)'} ; époques de 30 s ; tracé entier (${nf(V.mem.duration / 3600, 1)} h).</div>
          ${busy ? this.ieegBusyHtml('Stadification') : `<div class="btnrow"><button class="s-go primary"${D.length ? '' : ' disabled'}>${S.stages ? 'Recalculer' : 'Stadifier le sommeil'}</button></div>`}</div>`;
      if (S.stages && !busy) {
        const T = this.slpStats(S), pc = k => Math.round(T.pct(k) * 100) + ' %', mn = v => v == null ? '—' : nf(v, 0) + ' min';
        const ED = this.slpEdits(S), k = this.slpEpoch(V), t0r = this.ieegRecStart ? this.ieegRecStart(rec) : null, aut = S.auto ? S.auto[k] : S.stages[k];
        body += `<div class="ie-sec slp-rev${V.slpRev ? ' on' : ''}"><div class="ctrl-row"><label title="Page de 30 s calée sur les époques ; touches W, 1, 2, 3, R : coter l'époque et passer à la suivante ; ← → : époque précédente / suivante"><input type="checkbox" class="s-rev"${V.slpRev ? ' checked' : ''}> relire et corriger, époque par époque</label></div>
          ${V.slpRev && k < S.stages.length ? `<div class="slp-ep"><b>Époque ${k + 1}</b> / ${S.stages.length} · ${clock(k * 30)}${t0r ? ' · ' + new Date(t0r.getTime() + k * 30000).toLocaleTimeString(SV.LOC) : ''} · automatique : ${NAME[aut]}${(S.conf || [])[k] != null ? ` (${S.conf[k]} %)` : ''}${S.stages[k] !== aut ? ` → <b>${NAME[S.stages[k]]}</b>` : ''}</div>
            <div class="slp-keys">${['W', '1', '2', '3', 'R'].map(c => `<button data-st="${c}" class="${S.stages[k] === c ? 'on' : ''}" style="--c:${COLS[c]}" title="touche ${c}">${NAME[c] === 'Paradoxal' ? 'SP' : NAME[c]}<small>${c}</small></button>`).join('')}<span class="spacer"></span><button class="s-ep" data-d="-1" title="époque précédente (←)">◀</button><button class="s-ep" data-d="1" title="époque suivante (→)">▶</button></div>` : ''}
          ${ED.n || ED.seen ? `<div class="hint small"><b>${ED.n}</b> époque${ED.n > 1 ? 's' : ''} corrigée${ED.n > 1 ? 's' : ''} · ${ED.seen} / ${S.stages.length} relues${ED.n ? ' — <a href="#" class="s-revert">revenir à la cotation automatique</a>' : ''}</div>` : ''}</div>`;
        body += `<div class="ie-sec"><div class="ie-sh">Hypnogramme <span class="muted">${esc(S.chan)} · ${esc(S.model)}${ED.n ? ` · ${ED.n} corrigée${ED.n > 1 ? 's' : ''} à la main` : ''}</span></div><div class="slp-hypw" title="Clic : aller à cette époque">${this.slpHypnoSvg(S, 340, 92, V.light, V.slpRev ? k : null)}</div>
          <table class="slp-tab"><tr><td>temps d’enregistrement</td><td>${mn(T.trt)}</td><td>temps de sommeil</td><td>${mn(T.tst)}</td></tr><tr><td>efficacité</td><td>${Math.round(T.se * 100)} %</td><td>latence d’endormissement</td><td>${mn(T.sol)}</td></tr><tr><td>éveil intra-sommeil</td><td>${mn(T.waso)}</td><td>latences N3 · SP</td><td>${mn(T.n3)} · ${mn(T.rem)}</td></tr></table>
          <div class="slp-bars">${['1', '2', '3', 'R'].map(k => `<span style="--c:${COLS[k]}"><i style="width:${Math.round(T.pct(k) * 100)}%"></i><b>${NAME[k]}</b> ${pc(k)} · ${mn(T.min(k))}</span>`).join('')}<span style="--c:${COLS.W}"><i style="width:${Math.round(T.min('W') / (T.trt || 1) * 100)}%"></i><b>Éveil</b> ${mn(T.min('W'))}</span></div>
          ${T.unsure ? `<div class="hint">${T.unsure} époque${T.unsure > 1 ? 's' : ''} incertaine${T.unsure > 1 ? 's' : ''} (probabilité du stade retenu &lt; 50 %).</div>` : ''}
          <div class="ctrl-row"><label><input type="checkbox" class="s-show"${V.show.slp !== false ? ' checked' : ''}> bande des stades sur le tracé</label><label title="Teinte de fond du tracé selon le stade"><input type="checkbox" class="s-bg"${P.bg ? ' checked' : ''}> fond coloré</label><span class="spacer"></span><button class="s-csv" title="Une ligne par époque de 30 s">CSV</button></div>
          <div class="hint">Cotation automatique à relire, surtout N1 et les transitions (accord médian ≈ 85 % avec les experts dans la validation de YASA, moindre sur des nuits d’autres centres ; moins sûr chez l’enfant de moins de 5 ans, sous traitement sédatif ou avec un tracé très anormal). Les pointes par stade s’affichent dans l’onglet « Pointes → source ».</div></div>`;
      }
      side.innerHTML = this.ieegMHead('Stades du sommeil', REF, 'Portage fidèle de YASA (Vallat & Walker, eLife 2021) : une voie EEG centrale rééchantillonnée à 100 Hz, filtrée 0,4–30 Hz, époques de 30 s ; 21 descripteurs temporels, spectraux (Welch), d’entropie et fractals, lissés sur 7,5 min et 2 min ; classifieur LightGBM de YASA (2 000 arbres) entraîné sur des milliers de polysomnographies cotées selon l’AASM.', '', '') + body;
      this.ieegBindCommon(side);
      const q = s => side.querySelector(s); const ch = q('.s-ch'); if (ch) ch.onchange = () => { P.chan = ch.value; V.dirty = true; };
      const go = q('.s-go'); if (go) go.onclick = () => this.slpCompute();
      const rv = q('.s-rev'); if (rv) rv.onchange = () => this.slpReview(rv.checked); const rt = q('.s-revert'); if (rt) rt.onclick = e => { e.preventDefault(); this.slpRevert(); };
      side.querySelectorAll('[data-st]').forEach(b => b.onclick = () => this.slpSet(b.dataset.st)); side.querySelectorAll('.s-ep').forEach(b => b.onclick = () => this.slpGoEpoch(this.slpEpoch(V) + +b.dataset.d));
      const hw = q('.slp-hypw'); if (hw) hw.onclick = e => { const r = hw.getBoundingClientRect(), u = (e.clientX - r.left) / r.width * 340; if (u < 34) return; this.slpGoEpoch(Math.floor((u - 34) / (340 - 40) * S.stages.length)); };
      const sh = q('.s-show'); if (sh) sh.onchange = () => { V.show.slp = sh.checked; (rec.view = rec.view || {}).show = V.show; V.dirty = true; this.ieegDraw(); };
      const bg = q('.s-bg'); if (bg) bg.onchange = () => { P.bg = bg.checked; V.dirty = true; this.ieegDraw(); };
      const cv = q('.s-csv'); if (cv) cv.onclick = () => { const t0 = this.ieegRecStart ? this.ieegRecStart(rec) : null, rows = ['epoque;debut_s;heure;stade;probabilite;stade_automatique;corrige'].concat([...S.stages].map((c, k) => `${k + 1};${k * 30};${t0 ? new Date(t0.getTime() + k * 30000).toLocaleTimeString(SV.LOC) : ''};${NAME[c]};${(S.conf || [])[k] || ''};${NAME[(S.auto || S.stages)[k]]};${S.auto && S.auto[k] !== c ? 'oui' : ''}`)); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' })); a.download = String(rec.title).replace(/[^\w.-]+/g, '_') + '_hypnogramme.csv'; a.click(); };
    },
  };
  Object.assign(A, M);

  // ---------------------------------------------------------------- greffes
  // relecture du sommeil : W / 1 / 2 / 3 / R cotent l'époque affichée ; ← → : époque précédente / suivante ; Ctrl+Z : annuler
  const ky0 = A.ieegKey; A.ieegKey = function (e) {
    const V = this._iev, tg = e.target; if (V && V.slpRev && V.meth === 'slp' && V.rec.sleep && V.rec.sleep.stages && !(tg && /INPUT|TEXTAREA|SELECT/.test(tg.tagName)) && !e.altKey) {
      const m = { w: 'W', 0: 'W', 1: '1', 2: '2', 3: '3', 4: '3', r: 'R', 5: 'R' }[e.key.toLowerCase()];
      const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      if (m && !e.ctrlKey && !e.metaKey) { this.slpSet(m); return stop(); }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { this.slpGoEpoch(this.slpEpoch(V) + (e.key === 'ArrowRight' ? 1 : -1)); return stop(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && (V.slpUndo || []).length) { const u = V.slpUndo.pop(), S = V.rec.sleep, k = u.k; S.stages = S.stages.slice(0, k) + u.c + S.stages.slice(k + 1); S.rev = (S.rev || '').slice(0, k) + u.r + (S.rev || '').slice(k + 1); V.dirty = true; this.slpGoEpoch(k); return stop(); }
    }
    return ky0.apply(this, arguments);
  };
  const sc = V => !!(V && V.rec && V.rec.modality === 'scalp');
  const ml0 = A.ieegMethList; A.ieegMethList = function () { const L = ml0.apply(this, arguments), V = this._iev; return sc(V) ? L.concat(['slp']) : L; };
  const mr0 = A.ieegMethRender; A.ieegMethRender = function () { const V = this._iev; if (V && V.meth === 'slp') { this.ieegTabs(); return this.slpRender(); } return mr0.apply(this, arguments); };
  // bande des stades en haut du tracé (et fond coloré facultatif)
  A.ieegPaintBg = function (g, o) {
    const V = this._iev, S = V && V.rec.sleep; if (!S || !S.stages || V.show.slp === false) return; const ep = S.epoch || 30, k0 = Math.max(0, Math.floor(o.t0 / ep)), k1 = Math.min(S.stages.length - 1, Math.floor((o.t0 + o.page) / ep)), bg = S.params && S.params.bg;
    g.save(); g.font = '600 9.5px system-ui, sans-serif'; g.textBaseline = 'middle';
    for (let k = k0; k <= k1; k++) { const c = S.stages[k], a = Math.max(o.x0, o.X(k * ep)), b = Math.min(o.x0 + o.pw, o.X((k + 1) * ep)); if (b <= a) continue;
      if (bg) { g.fillStyle = rgba(COLS[c], V.light ? 0.08 : 0.07); g.fillRect(a, o.TOP, b - a, o.H - o.TOP); }
      g.fillStyle = rgba(COLS[c], 0.85); g.fillRect(a, o.TOP - 5, b - a, 4); if (b - a > 34) { g.fillStyle = COLS[c]; g.fillText(NAME[c] === 'Paradoxal' ? 'SP' : NAME[c], a + 3, o.TOP - 11); } }
    if (V.slpRev && V.meth === 'slp') { const k = this.slpEpoch(V), a = Math.max(o.x0, o.X(k * ep)), b = Math.min(o.x0 + o.pw, o.X((k + 1) * ep));
      if (b > a) { g.strokeStyle = V.light ? '#14233a' : '#e9eef6'; g.lineWidth = 1.2; g.setLineDash([4, 3]); g.strokeRect(a + 0.5, o.TOP - 6, b - a - 1, o.H - o.TOP + 5); }
      if (V.slpShown !== k) { V.slpShown = k; clearTimeout(V._slpT); V._slpT = setTimeout(() => this.slpRender(), 0); } }
    g.restore();
  };
  // hypnogramme dans l'aperçu (bande basse)
  A.ieegOvwBg = function (g, X, H) { const V = this._iev, S = V && V.rec.sleep; if (!S || !S.stages || V.show.slp === false) return; const ep = S.epoch || 30; for (let k = 0; k < S.stages.length; k++) { const c = S.stages[k], a = X(k * ep), b = X((k + 1) * ep); g.fillStyle = rgba(COLS[c], 0.85); g.fillRect(a, H - 4 - ROW[c] * 0.6, Math.max(1, b - a + 0.3), 3); } };
  // signets : endormissement, 1er N3, 1er sommeil paradoxal
  A.ieegMarkExtra = function (L) { const V = this._iev, S = V && V.rec.sleep; if (!S || !S.stages) return; const ep = S.epoch || 30, on = S.stages.search(/[123R]/); if (on < 0) return; L.push({ t: on * ep, label: 'endormissement', kind: 'sleep' }); for (const [c, l] of [['3', '1er N3'], ['R', '1er sommeil paradoxal']]) { const i = S.stages.indexOf(c, on); if (i >= 0) L.push({ t: i * ep, label: l, kind: 'sleep' }); } };
})(window.SV);
