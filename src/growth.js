/* EpiScope — growth.js : croissance et développement de l'enfant (v4.19, Dossier › Développement et examen clinique).
 *   - OMS : z-score et centile du poids, de la taille, de l'IMC et du périmètre crânien pour l'âge et le sexe (méthode LMS
 *     de Cole ; au-delà de ±3 DS, extrapolation linéaire de l'OMS pour le poids et l'IMC) ; courbes de centiles ;
 *   - INTERGROWTH-21st, nouveau-né : centile du poids, de la taille et du PC de naissance pour l'âge gestationnel
 *     (33+0 à 42+6 SA : loi skew-t de type 3 de Fernández et Steel ; 24+0 à 32+6 SA : modèles des très grands prématurés) ;
 *   - acquisitions psychomotrices : fenêtres de l'OMS (6 acquisitions motrices, 1er–99e centile, médiane) et repères du CDC
 *     2022 (âge où ≥ 75 % des enfants ont acquis), âge de développement par domaine (indicatif), âge corrigé du prématuré.
 * Données : src/growth_data.js (tools/make_growth.py). Tout est indicatif : ni échelle de développement validée, ni
 * diagnostic.                                                                                                          */
(function (factory) {
  const G = typeof window !== 'undefined' ? (window.SV = window.SV || {}) : (globalThis.SV = globalThis.SV || {});
  factory(G);
})(function (SV) {
  'use strict';
  const DATA = () => SV.GrowthData || { who: {}, ig: {}, igEarly: {} }, MONTH = 30.4375;
  const normCdf = z => SV.Stat ? SV.Stat.normCdf(z) : 0.5 * (1 + Math.tanh(0.7978845608 * (z + 0.044715 * z * z * z)));
  /** quantile de la loi normale (Acklam, |erreur| < 1,2e-9) */
  function probit(p) {
    if (!(p > 0 && p < 1)) return p <= 0 ? -Infinity : Infinity;
    const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239], b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572], c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783], d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    const pl = 0.02425;
    if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > 1 - pl) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    const q = p - 0.5, r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  const day = s => { if (!s) return NaN; const t = Date.parse(String(s).length <= 10 ? String(s).slice(0, 10) + 'T12:00:00' : s); return isNaN(t) ? NaN : t; };
  /** naissance : date exacte (P.birthDate) sinon milieu du mois ou de l'année de naissance */
  function birthTime(P) {
    if (!P) return NaN; if (P.birthDate) return day(P.birthDate); if (!P.birthYear) return NaN;
    return P.birthMonth ? Date.UTC(+P.birthYear, +P.birthMonth - 1, 15, 12) : Date.UTC(+P.birthYear, 6, 1, 12);
  }
  /** âge en jours à une date (null si naissance inconnue) */
  function ageDays(P, date) { const b = birthTime(P), t = date ? day(date) : Date.now(); return isNaN(b) || isNaN(t) ? null : (t - b) / 864e5; }
  /** âge corrigé (prématuré, jusqu'à 2 ans d'âge chronologique) : âge − (40 SA − terme) */
  function correctedDays(P, ga, date) { const a = ageDays(P, date); if (a == null) return null; const w = +((ga || {}).weeks); if (!(w > 0) || w >= 37 || a > 730) return a; return a - (40 * 7 - (w * 7 + (+(ga.days) || 0))); }
  const fmtAge = days => { if (days == null || !isFinite(days)) return '—'; const m = days / MONTH; if (m < 1) return Math.round(days / 7) + ' sem.'; if (m < 24) return (Math.round(m * 2) / 2).toString().replace('.', ',') + ' mois'; const y = Math.floor(m / 12), mm = Math.floor(m - 12 * y); return y + ' an' + (y > 1 ? 's' : '') + (mm ? ' ' + mm + ' mois' : ''); };

  // ---------------------------------------------------------------- OMS (LMS)
  const IND = { wt: { fr: 'poids', unit: 'kg', max: 3683 }, ht: { fr: 'taille', unit: 'cm', max: 6970 }, bmi: { fr: 'IMC', unit: 'kg/m²', max: 6970 }, hc: { fr: 'périmètre crânien', unit: 'cm', max: 1856 } };
  function lms(ind, sex, d) {
    const T = (DATA().who[ind] || {})[sex === 'F' ? 'F' : 'M']; if (!T || d == null || d < 0 || d > T.d[T.d.length - 1] + 0.5) return null;
    const A = T.d; let i = 0; while (i < A.length - 2 && A[i + 1] < d) i++; const f = Math.max(0, Math.min(1, (d - A[i]) / (A[i + 1] - A[i] || 1)));
    return { L: T.L[i] + f * (T.L[i + 1] - T.L[i]), M: T.M[i] + f * (T.M[i + 1] - T.M[i]), S: T.S[i] + f * (T.S[i + 1] - T.S[i]) };
  }
  const yOf = (P, z) => Math.abs(P.L) < 1e-9 ? P.M * Math.exp(P.S * z) : P.M * Math.pow(1 + P.L * P.S * z, 1 / P.L);
  /** z-score OMS ; poids et IMC : au-delà de ±3 DS, écart rapporté à la distance entre 2 et 3 DS (méthode de l'OMS) */
  function whoZ(ind, sex, d, y) {
    const P = lms(ind, sex, d); if (!P || !(y > 0)) return null;
    let z = Math.abs(P.L) < 1e-9 ? Math.log(y / P.M) / P.S : (Math.pow(y / P.M, P.L) - 1) / (P.L * P.S);
    if ((ind === 'wt' || ind === 'bmi') && Math.abs(z) > 3) { const s = z > 0 ? 1 : -1, y3 = yOf(P, 3 * s), y2 = yOf(P, 2 * s); z = s * 3 + (y - y3) / Math.abs(y3 - y2); }
    return z;
  }
  function whoValue(ind, sex, d, z) { const P = lms(ind, sex, d); return P ? yOf(P, z) : null; }

  // ---------------------------------------------------------------- INTERGROWTH-21st (naissance)
  const igRow = (v, sex, ga) => { const T = (DATA().ig[v] || {})[sex === 'F' ? 'F' : 'M']; if (!T) return null; const i = Math.round(ga) - T.ga0; return i >= 0 && i < T.mu.length ? { mu: T.mu[i], sigma: T.sigma[i], nu: T.nu[i], tau: T.tau[i] } : null; };
  const tCdf = (t, df) => SV.Stat ? SV.Stat.tCdf(t, df) : normCdf(t), tInv = (p, df) => SV.Stat ? SV.Stat.tInv(p, df) : probit(p);
  /** loi skew-t de type 3 (gamlss.dist ST3) : fonction de répartition et quantile */
  function pST3(q, P) { const k = 1 + P.nu * P.nu; return q < P.mu ? 2 * tCdf(P.nu * (q - P.mu) / P.sigma, P.tau) / k : (1 + 2 * P.nu * P.nu * (tCdf((q - P.mu) / (P.sigma * P.nu), P.tau) - 0.5)) / k; }
  function qST3(p, P) { const k = 1 + P.nu * P.nu; return p < 1 / k ? P.mu + (P.sigma / P.nu) * tInv(p * k / 2, P.tau) : P.mu + P.sigma * P.nu * tInv((p * k - 1) / (2 * P.nu * P.nu) + 0.5, P.tau); }
  /** très grands prématurés (24+0 – 32+6 SA) : moyenne linéaire (poids : log, racine de l'âge), écart-type constant */
  function igEarly(v, sex, ga) { const E = DATA().igEarly[v]; if (!E) return null; const w = ga / 7, x = v === 'wt' ? Math.sqrt(w) : w; return { mu: E.coefs[0] + E.coefs[1] * x + E.coefs[2] * (sex === 'M' ? 1 : 0), sd: E.sigma, log: v === 'wt' }; }
  /** centile (0–1) d'une mesure de naissance : v 'wt' (kg) | 'len' (cm) | 'hc' (cm), ga en jours */
  function igP(v, sex, ga, y) {
    if (!(y > 0) || !(ga >= 168) || ga > 300.5) return null;
    if (ga < 231) { const E = igEarly(v, sex, ga); return E ? normCdf(((E.log ? Math.log(y) : y) - E.mu) / E.sd) : null; }
    const P = igRow(v, sex, ga); return P ? pST3(y, P) : null;
  }
  function igValue(v, sex, ga, p) {
    if (!(ga >= 168) || ga > 300.5) return null;
    if (ga < 231) { const E = igEarly(v, sex, ga); if (!E) return null; const y = E.mu + E.sd * probit(p); return E.log ? Math.exp(y) : y; }
    const P = igRow(v, sex, ga); return P ? qST3(p, P) : null;
  }
  const IGV = { wt: { fr: 'poids', unit: 'kg' }, len: { fr: 'taille', unit: 'cm' }, hc: { fr: 'PC', unit: 'cm' } };
  /** classement usuel du poids de naissance : < 10e centile PAG, > 90e GAG */
  const sizeClass = p => p == null ? '' : p < 0.03 ? 'très petit pour l’âge gestationnel (< 3e centile)' : p < 0.10 ? 'petit pour l’âge gestationnel (< 10e centile)' : p > 0.97 ? 'très gros pour l’âge gestationnel (> 97e centile)' : p > 0.90 ? 'gros pour l’âge gestationnel (> 90e centile)' : 'eutrophe';

  // ---------------------------------------------------------------- acquisitions psychomotrices
  /** who : fenêtre OMS (mois : 1er centile, médiane, 99e centile ; Wijnhoven et al., WHO Motor Development Study 2006) ;
   *  cdc : âge (mois) où ≥ 75 % des enfants ont acquis (Zubler et al., Pediatrics 2022 ; listes « Learn the Signs. Act Early. » de
   *  cdc.gov/act-early/milestones, vérifiées en novembre 2026) ; libellés traduits et abrégés */
  const DOMAINS = { gross: 'motricité globale', fine: 'motricité fine', lang: 'langage', social: 'socialisation, relation', cog: 'cognition, autonomie' };
  const MILESTONES = [
    { k: 'head', dom: 'gross', fr: 'tient sa tête (porté, sans soutien)', cdc: 4 },
    { k: 'roll', dom: 'gross', fr: 'se retourne du ventre sur le dos', cdc: 6 },
    { k: 'sit', dom: 'gross', fr: 'tient assis sans appui', who: [3.8, 5.9, 9.2] },
    { k: 'standAssist', dom: 'gross', fr: 'debout avec appui', who: [4.8, 7.4, 11.4] },
    { k: 'crawl', dom: 'gross', fr: 'marche à quatre pattes', who: [5.2, 8.3, 13.5] },
    { k: 'walkAssist', dom: 'gross', fr: 'marche tenu', who: [5.9, 9.0, 13.7] },
    { k: 'standAlone', dom: 'gross', fr: 'tient debout seul', who: [6.9, 10.8, 16.9] },
    { k: 'walk', dom: 'gross', fr: 'marche seul', who: [8.2, 12.0, 17.6] },
    { k: 'run', dom: 'gross', fr: 'court', cdc: 24 },
    { k: 'jump', dom: 'gross', fr: 'saute à pieds joints', cdc: 30 },
    { k: 'hop', dom: 'gross', fr: 'saute à cloche-pied', cdc: 60 },
    { k: 'grasp', dom: 'fine', fr: 'tient un jouet mis dans la main', cdc: 4 },
    { k: 'transfer', dom: 'fine', fr: 'passe un objet d’une main à l’autre', cdc: 9 },
    { k: 'pincer', dom: 'fine', fr: 'pince pouce-index', cdc: 12 },
    { k: 'scribble', dom: 'fine', fr: 'gribouille', cdc: 18 },
    { k: 'spoon', dom: 'fine', fr: 'mange à la cuillère', cdc: 24 },
    { k: 'coo', dom: 'lang', fr: 'gazouille, vocalise (« ooo », « aah »)', cdc: 4 },
    { k: 'babble', dom: 'lang', fr: 'babille (« mamama », « bababa »)', cdc: 9 },
    { k: 'mama', dom: 'lang', fr: 'dit « papa » ou « maman » (nom particulier)', cdc: 12 },
    { k: 'words3', dom: 'lang', fr: 'dit au moins 3 mots en plus de papa / maman', cdc: 18 },
    { k: 'twoWords', dom: 'lang', fr: 'associe 2 mots (« encore lait »)', cdc: 24 },
    { k: 'words50', dom: 'lang', fr: 'environ 50 mots', cdc: 30 },
    { k: 'point', dom: 'lang', fr: 'pointe du doigt pour demander, pour être aidé', cdc: 15 },
    { k: 'conversation', dom: 'lang', fr: 'converse (au moins 2 échanges), dit son prénom', cdc: 36 },
    { k: 'sentence4', dom: 'lang', fr: 'phrases de 4 mots ou plus', cdc: 48 },
    { k: 'story', dom: 'lang', fr: 'raconte une histoire (au moins 2 événements)', cdc: 60 },
    { k: 'smile', dom: 'social', fr: 'sourit en réponse', cdc: 2 },
    { k: 'laugh', dom: 'social', fr: 'rit', cdc: 6 },
    { k: 'stranger', dom: 'social', fr: 'réagit aux inconnus (timide, inquiet)', cdc: 9 },
    { k: 'games', dom: 'social', fr: 'jeux d’imitation (bravo, coucou)', cdc: 12 },
    { k: 'joinPlay', dom: 'social', fr: 'rejoint les autres enfants pour jouer', cdc: 36 },
    { k: 'objPerm', dom: 'cog', fr: 'cherche un objet qui a disparu de sa vue', cdc: 9 },
    { k: 'dress', dom: 'cog', fr: 'met seul certains vêtements', cdc: 36 },
    { k: 'drawPerson', dom: 'cog', fr: 'dessine un bonhomme (3 parties du corps ou plus)', cdc: 48 },
    { k: 'count10', dom: 'cog', fr: 'compte jusqu’à 10', cdc: 60 },
  ];
  const refAge = m => m.who ? m.who[1] : m.cdc;
  const lateAge = m => m.who ? m.who[2] : m.cdc;
  /** acquisition d'une étape : { months (âge d'acquisition, mois), no (non acquise) } → { cls, txt } ; ageM : âge (corrigé) actuel */
  function judge(m, a, ageM) {
    if (a && a.months !== '' && a.months != null && isFinite(+a.months)) {
      const x = +a.months;
      if (m.who) return x < m.who[0] ? { cls: 'early', txt: 'précoce (< 1er centile OMS)' } : x <= m.who[2] ? { cls: 'ok', txt: 'dans la fenêtre OMS' } : { cls: 'late', txt: 'tardif (> 99e centile OMS)' };
      return x <= m.cdc ? { cls: 'ok', txt: 'avant l’âge où 75 % l’ont acquis' } : x <= m.cdc * 1.33 + 1 ? { cls: 'mid', txt: 'un peu après l’âge où 75 % l’ont acquis' } : { cls: 'late', txt: 'tardif' };
    }
    if (a && a.no) return ageM != null && ageM > lateAge(m) ? { cls: 'late', txt: 'non acquis (âge dépassé)' } : { cls: 'na', txt: 'non encore acquis' };
    return { cls: '', txt: '' };
  }
  /** âge de développement indicatif par domaine : âge de référence de la plus avancée des étapes acquises (mois) */
  function devAges(acq) {
    const out = {}; for (const k of Object.keys(DOMAINS)) { let best = null; for (const m of MILESTONES) if (m.dom === k) { const a = acq[m.k]; if (a && a.months !== '' && a.months != null && isFinite(+a.months)) best = Math.max(best || 0, refAge(m)); } out[k] = best; }
    return out;
  }

  // ---------------------------------------------------------------- graphiques (SVG, chaînes : écran et compte rendu)
  const esc = SV.U.esc;
  const fmt = (v, k) => (Math.round(v * Math.pow(10, k || 0)) / Math.pow(10, k || 0)).toString().replace('.', ',');
  /** courbe OMS d'un indicateur : centiles 3, 15, 50, 85, 97, points du patient [{ d (jours), y, id }] ; o { w, h, d0, d1 } ;
   *  géométrie portée par le SVG (data-x0, x1, y0, y1, d0, d1, lo, hi) pour placer un point au clic, data-id sur les points */
  function whoChart(ind, sex, pts, o) {
    o = o || {}; const W = o.w || 520, H = o.h || 300, ml = 40, mr = 44, mt = 12, mb = 30, T = (DATA().who[ind] || {})[sex === 'F' ? 'F' : 'M'];
    if (!T) return '<div class="hint">Référence OMS indisponible.</div>';
    const dmax = T.d[T.d.length - 1], ds = pts.filter(p => p.d != null && p.y > 0), lastD = Math.max(ds.length ? Math.max(...ds.map(p => p.d)) : 0, o.dNow > 0 ? o.dNow : 0);   // dNow : âge actuel (graphique cliquable)
    const d1 = Math.min(dmax, o.d1 || (lastD <= 730 ? 730 : lastD <= 1826 ? 1826 : Math.min(dmax, Math.ceil((lastD + 365) / 365.25) * 365.25))), d0 = o.d0 != null ? o.d0 : (d1 > 1900 && ds.every(p => p.d > 1700) ? 1826 : 0);
    const P = [0.03, 0.15, 0.5, 0.85, 0.97], ages = []; for (let i = 0; i <= 120; i++) ages.push(d0 + (d1 - d0) * i / 120);
    const curves = P.map(p => ages.map(d => whoValue(ind, sex, d, probit(p))));
    let lo = Infinity, hi = -Infinity; for (const c of curves) for (const v of c) if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); } for (const p of ds) if (p.d >= d0 && p.d <= d1) { lo = Math.min(lo, p.y); hi = Math.max(hi, p.y); }
    const pad = (hi - lo) * 0.06; lo -= pad; hi += pad;
    const X = d => ml + (d - d0) / (d1 - d0) * (W - ml - mr), Y = v => mt + (hi - v) / (hi - lo) * (H - mt - mb);
    let s = `<svg class="gr-chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(IND[ind].fr)} pour l’âge (OMS)" data-ind="${ind}" data-x0="${ml}" data-x1="${W - mr}" data-y0="${mt}" data-y1="${H - mb}" data-d0="${d0}" data-d1="${d1}" data-lo="${lo}" data-hi="${hi}">`;
    // axe des âges : mois avant 2 ans, années ensuite
    const yearly = d1 - d0 > 800, step = yearly ? (d1 - d0 > 3000 ? 2 * 365.25 : 365.25) : 3 * MONTH;
    for (let d = Math.ceil(d0 / step) * step; d <= d1 + 1; d += step) s += `<line x1="${X(d)}" x2="${X(d)}" y1="${mt}" y2="${H - mb}" class="gr-grid"/><text x="${X(d)}" y="${H - mb + 13}" class="gr-tick" text-anchor="middle">${yearly ? Math.round(d / 365.25) + ' a' : Math.round(d / MONTH) + ' m'}</text>`;
    const ys = Math.pow(10, Math.floor(Math.log10((hi - lo) / 4))), yst = [1, 2, 5, 10].map(k => k * ys).find(k => (hi - lo) / k <= 7) || 10 * ys;
    for (let v = Math.ceil(lo / yst) * yst; v <= hi; v += yst) s += `<line x1="${ml}" x2="${W - mr}" y1="${Y(v)}" y2="${Y(v)}" class="gr-grid"/><text x="${ml - 4}" y="${Y(v) + 3}" class="gr-tick" text-anchor="end">${fmt(v, yst < 1 ? 1 : 0)}</text>`;
    s += `<path d="M${ages.map((d, i) => X(d) + ',' + Y(curves[0][i])).join('L')}L${ages.slice().reverse().map((d, i) => X(d) + ',' + Y(curves[4][ages.length - 1 - i])).join('L')}Z" class="gr-band"/>`;
    curves.forEach((c, k) => { s += `<path d="M${ages.map((d, i) => X(d) + ',' + Y(c[i])).join('L')}" class="gr-c${k === 2 ? ' med' : ''}"/><text x="${W - mr + 3}" y="${Y(c[c.length - 1]) + 3}" class="gr-pl">P${Math.round(P[k] * 100)}</text>`; });
    const inR = ds.filter(p => p.d >= d0 && p.d <= d1).sort((a, b) => a.d - b.d);
    if (inR.length > 1) s += `<path d="M${inR.map(p => X(p.d) + ',' + Y(p.y)).join('L')}" class="gr-pts-l"/>`;
    for (const p of inR) { const z = whoZ(ind, sex, p.d, p.y); s += `<circle cx="${X(p.d)}" cy="${Y(p.y)}" r="4" class="gr-pt${z != null && Math.abs(z) > 2 ? ' out' : ''}"${p.id ? ` data-id="${esc(p.id)}"` : ''}><title>${esc(fmtAge(p.d))} : ${fmt(p.y, 1)} ${IND[ind].unit}${z != null ? ` · z ${fmt(z, 2)} · P${fmt(100 * normCdf(z), 0)}` : ''}</title></circle>`; }
    if (o.interactive) s += `<g class="gr-cur" style="display:none"><line class="gr-curl" y1="${mt}" y2="${H - mb}"/><line class="gr-curh" x1="${ml}" x2="${W - mr}"/><circle class="gr-curp" r="3.5"/><text class="gr-curt"></text></g>`;
    s += `<text x="${ml}" y="${H - 3}" class="gr-ax">âge</text><text x="4" y="${mt + 2}" class="gr-ax">${esc(IND[ind].unit)}</text></svg>`;
    return s;
  }
  /** courbe INTERGROWTH-21st à la naissance (24–42 SA) : centiles 3, 10, 50, 90, 97 et point du nouveau-né */
  function igChart(v, sex, gaDays, y, o) {
    o = o || {}; const W = o.w || 300, H = o.h || 190, ml = 34, mr = 30, mt = 10, mb = 26, g0 = 168, g1 = 300;
    const P = [0.03, 0.1, 0.5, 0.9, 0.97], G = []; for (let g = g0; g <= g1; g += 3) G.push(g);
    const C = P.map(p => G.map(g => igValue(v, sex, g, p)));
    let lo = Infinity, hi = -Infinity; for (const c of C) for (const x of c) if (x != null) { lo = Math.min(lo, x); hi = Math.max(hi, x); } if (y > 0) { lo = Math.min(lo, y); hi = Math.max(hi, y); }
    const X = g => ml + (g - g0) / (g1 - g0) * (W - ml - mr), Yv = x => mt + (hi - x) / (hi - lo) * (H - mt - mb);
    let s = `<svg class="gr-chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(IGV[v].fr)} de naissance (INTERGROWTH-21st)">`;
    for (let w = 24; w <= 42; w += 2) s += `<line x1="${X(w * 7)}" x2="${X(w * 7)}" y1="${mt}" y2="${H - mb}" class="gr-grid"/><text x="${X(w * 7)}" y="${H - mb + 12}" class="gr-tick" text-anchor="middle">${w}</text>`;
    s += `<line x1="${X(231)}" x2="${X(231)}" y1="${mt}" y2="${H - mb}" class="gr-sep"><title>33 SA : changement de référence (très grands prématurés / nouveau-né)</title></line>`;
    s += `<path d="M${G.map((g, i) => X(g) + ',' + Yv(C[0][i])).join('L')}L${G.slice().reverse().map((g, i) => X(g) + ',' + Yv(C[4][G.length - 1 - i])).join('L')}Z" class="gr-band"/>`;
    C.forEach((c, k) => { s += `<path d="M${G.map((g, i) => X(g) + ',' + Yv(c[i])).join('L')}" class="gr-c${k === 2 ? ' med' : ''}"/><text x="${W - mr + 3}" y="${Yv(c[c.length - 1]) + 3}" class="gr-pl">P${Math.round(P[k] * 100)}</text>`; });
    if (y > 0 && gaDays >= g0 && gaDays <= g1 + 0.5) { const p = igP(v, sex, gaDays, y); s += `<circle cx="${X(gaDays)}" cy="${Yv(y)}" r="4.5" class="gr-pt${p != null && (p < 0.1 || p > 0.9) ? ' out' : ''}"><title>${fmt(y, v === 'wt' ? 2 : 1)} ${IGV[v].unit} à ${Math.floor(gaDays / 7)}+${Math.round(gaDays % 7)} SA${p != null ? ' · P' + fmt(100 * p, 0) : ''}</title></circle>`; }
    s += `<text x="${ml}" y="${H - 3}" class="gr-ax">SA</text><text x="3" y="${mt + 2}" class="gr-ax">${esc(IGV[v].unit)}</text></svg>`;
    return s;
  }
  /** frise des acquisitions : fenêtre OMS (barre 1er–99e centile, médiane) ou repère CDC (75 %), acquisition de l'enfant (point) ;
   *  ageM : âge (corrigé) actuel en mois ; o { dom, w, corrected, interactive (lignes cliquables : data-mk, géométrie data-*) } */
  function milestoneChart(acq, ageM, o) {
    o = o || {}; const list = MILESTONES.filter(m => !o.dom || m.dom === o.dom), W = o.w || 620, rowH = 15, ml = 230, mr = 16, mt = 16, H = mt + list.length * rowH + 22;
    const ac = list.map(m => acq[m.k] || {}), xs = ac.filter(a => a.months !== '' && a.months != null && isFinite(+a.months)).map(a => +a.months);
    const amax = Math.max(18, Math.min(72, Math.ceil(Math.max(ageM || 0, ...xs, ...list.filter(m => m.who || m.cdc <= Math.max(24, (ageM || 0) + 6)).map(lateAge)) / 6) * 6 + 2));
    const X = m => ml + Math.min(amax, m) / amax * (W - ml - mr);
    let s = `<svg class="ms-chart${o.interactive ? ' ms-int' : ''}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" data-x0="${ml}" data-x1="${W - mr}" data-amax="${amax}" data-mt="${mt}" data-rowh="${rowH}" data-keys="${list.map(m => m.k).join(',')}">`;
    const st = amax > 36 ? 12 : 3; for (let m = 0; m <= amax; m += st) s += `<line x1="${X(m)}" x2="${X(m)}" y1="${mt - 4}" y2="${H - 20}" class="gr-grid"/><text x="${X(m)}" y="${H - 8}" class="gr-tick" text-anchor="middle">${m}</text>`;
    s += `<text x="${ml - 10}" y="${H - 8}" class="gr-ax" text-anchor="end">âge (mois)</text>`;
    if (ageM != null && ageM >= 0 && ageM <= amax) s += `<line x1="${X(ageM)}" x2="${X(ageM)}" y1="${mt - 8}" y2="${H - 20}" class="ms-now"/><text x="${X(ageM) + 3}" y="${mt - 6}" class="gr-tick">âge${o.corrected ? ' corrigé' : ''}</text>`;
    let dom = null;
    list.forEach((m, i) => {
      const y = mt + i * rowH + rowH / 2, a = ac[i], J = judge(m, a, ageM);
      if (m.dom !== dom) { dom = m.dom; if (i) s += `<line x1="4" x2="${W - mr}" y1="${y - rowH / 2}" y2="${y - rowH / 2}" class="ms-sep"/>`; }
      if (o.interactive) s += `<rect x="4" y="${y - rowH / 2}" width="${W - mr - 4}" height="${rowH}" class="ms-hit" data-mk="${m.k}"/>`;
      s += `<text x="${ml - 6}" y="${y + 3.5}" class="ms-lab" text-anchor="end">${esc(m.fr.length > 40 ? m.fr.slice(0, 39) + '…' : m.fr)}</text>`;
      if (m.who) s += `<rect x="${X(m.who[0])}" y="${y - 4}" width="${X(m.who[2]) - X(m.who[0])}" height="8" rx="4" class="ms-win"><title>OMS : 1er centile ${fmt(m.who[0], 1)} mois, médiane ${fmt(m.who[1], 1)}, 99e centile ${fmt(m.who[2], 1)}</title></rect><line x1="${X(m.who[1])}" x2="${X(m.who[1])}" y1="${y - 5}" y2="${y + 5}" class="ms-med"/>`;
      else if (m.cdc <= amax) s += `<path d="M${X(m.cdc)} ${y - 5}L${X(m.cdc) + 4} ${y}L${X(m.cdc)} ${y + 5}L${X(m.cdc) - 4} ${y}Z" class="ms-cdc"><title>CDC 2022 : acquis par au moins 75 % des enfants à ${m.cdc} mois</title></path>`;
      if (a.months !== '' && a.months != null && isFinite(+a.months)) s += `<circle cx="${X(+a.months)}" cy="${y}" r="4" class="ms-pt ${J.cls}" data-mk="${m.k}"><title>acquis à ${fmt(+a.months, 1)} mois — ${esc(J.txt)}</title></circle>`;
      else if (a.no && ageM != null) s += `<path d="M${X(0) + 2} ${y}H${X(ageM) - 3}" class="ms-no ${J.cls}"/><text x="${X(ageM) + 4}" y="${y + 3.5}" class="ms-nolab ${J.cls}">non acquis</text>`;
    });
    if (o.interactive) s += `<g class="gr-cur" style="display:none"><line class="gr-curl" y1="${mt - 4}" y2="${H - 20}"/><text class="gr-curt"></text></g>`;
    return s + '</svg>';
  }

  SV.Growth = { probit, normCdf, ageDays, birthTime, correctedDays, fmtAge, MONTH, IND, IGV, lms, whoZ, whoValue, igP, igValue, pST3, qST3, sizeClass, DOMAINS, MILESTONES, refAge, lateAge, judge, devAges, whoChart, igChart, milestoneChart };
});
