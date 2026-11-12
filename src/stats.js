/* EpiScope — stats.js : lois et tests élémentaires (v4.18), sans dépendance, utilisables dans les workers et les tests.
 *   normCdf (loi normale, approximation d'erf à 1,5e-7), tCdf / tInv (Student : bêta incomplète régularisée par fraction
 *   continue, quantile par dichotomie), welch (t de Welch et degrés de liberté de Welch–Satterthwaite), robustZ (médiane et
 *   MAD × 1,4826), correction de Bonferroni et taux de fausses découvertes de Benjamini–Hochberg (1995).                 */
(function (factory) {
  const G = typeof window !== 'undefined' ? (window.SV = window.SV || {}) : (globalThis.SV = globalThis.SV || {});
  factory(G); (G._factories = G._factories || {}).stats = factory;
})(function (SV) {
  'use strict';
  function erf(x) {   // Abramowitz et Stegun 7.1.26
    const s = x < 0 ? -1 : 1, a = Math.abs(x), t = 1 / (1 + 0.3275911 * a);
    return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a));
  }
  const normCdf = z => 0.5 * (1 + erf(z / Math.SQRT2));
  function lgamma(x) {   // Lanczos (g = 7, 9 coefficients)
    const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
    x -= 1; let a = c[0]; const t = x + 7.5; for (let i = 1; i < 9; i++) a += c[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  function betacf(a, b, x) {   // fraction continue de la bêta incomplète (Numerical Recipes)
    const EPS = 3e-14, FP = 1e-300; let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap; if (Math.abs(d) < FP) d = FP; d = 1 / d; let h = d;
    for (let m = 1; m <= 300; m++) {
      const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2)); d = 1 + aa * d; if (Math.abs(d) < FP) d = FP; c = 1 + aa / c; if (Math.abs(c) < FP) c = FP; d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2)); d = 1 + aa * d; if (Math.abs(d) < FP) d = FP; c = 1 + aa / c; if (Math.abs(c) < FP) c = FP; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }
  /** bêta incomplète régularisée I_x(a, b) */
  function ibeta(x, a, b) {
    if (x <= 0) return 0; if (x >= 1) return 1;
    const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
  }
  /** P(T ≤ t), T de Student à df degrés de liberté (df réel > 0) */
  function tCdf(t, df) {
    if (!(df > 0)) return NaN; if (!isFinite(t)) return t > 0 ? 1 : 0; if (df > 1e7) return normCdf(t);
    const p = 0.5 * ibeta(df / (df + t * t), df / 2, 0.5); return t >= 0 ? 1 - p : p;
  }
  /** quantile de Student : t tel que P(T ≤ t) = p */
  function tInv(p, df) {
    if (!(p > 0 && p < 1)) return p >= 1 ? Infinity : -Infinity; if (p < 0.5) return -tInv(1 - p, df);
    let lo = 0, hi = 4; while (tCdf(hi, df) < p && hi < 1e7) hi *= 2;
    for (let i = 0; i < 200 && hi - lo > 1e-10 * Math.max(1, hi); i++) { const m = (lo + hi) / 2; if (tCdf(m, df) < p) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  const mean = a => { let s = 0; for (const v of a) s += v; return a.length ? s / a.length : NaN; };
  const variance = (a, m) => { if (m == null) m = mean(a); let s = 0; for (const v of a) s += (v - m) * (v - m); return a.length > 1 ? s / (a.length - 1) : 0; };
  /** t de Welch entre deux échantillons résumés (moyennes, variances, effectifs) : { t, df, p (bilatéral), p1 (unilatéral, m1 > m2) } */
  function welch(m1, v1, n1, m2, v2, n2) {
    const a = v1 / n1, b = v2 / n2, se = Math.sqrt(a + b); if (!(se > 0)) return { t: m1 === m2 ? 0 : (m1 > m2 ? Infinity : -Infinity), df: Math.max(1, n1 + n2 - 2), p: m1 === m2 ? 1 : 0, p1: m1 > m2 ? 0 : 1 };
    const t = (m1 - m2) / se, df = (a + b) * (a + b) / ((n1 > 1 ? a * a / (n1 - 1) : 0) + (n2 > 1 ? b * b / (n2 - 1) : 0) || 1e-300), c = tCdf(t, Math.max(1, df));
    return { t, df: Math.max(1, df), p: 2 * Math.min(c, 1 - c), p1: 1 - c };
  }
  function welchSamples(x, y) { const m1 = mean(x), m2 = mean(y); return welch(m1, variance(x, m1), x.length, m2, variance(y, m2), y.length); }
  function median(a) { const s = Float64Array.from(a).sort(), n = s.length; return n ? (n & 1 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; }
  /** z robustes : (x − médiane) / (1,4826 × MAD) ; { z, med, sd } */
  function robustZ(a) { const med = median(a), mad = median(a.map(v => Math.abs(v - med))), sd = 1.4826 * mad || Math.sqrt(variance(a)) || 1; return { z: a.map(v => (v - med) / sd), med, sd }; }
  /** p ajustés : Bonferroni (min(1, m·p)) ou Benjamini–Hochberg (q de chaque test, montée par le haut) */
  function bonferroni(ps) { const m = ps.length; return ps.map(p => Math.min(1, p * m)); }
  function bh(ps) {
    const m = ps.length, o = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]), q = new Array(m); let mn = 1;
    for (let k = m - 1; k >= 0; k--) { mn = Math.min(mn, o[k][0] * m / (k + 1)); q[o[k][1]] = Math.min(1, mn); }
    return q;
  }
  function adjust(ps, how) { return how === 'bonf' ? bonferroni(ps) : how === 'fdr' ? bh(ps) : ps.slice(); }
  SV.Stat = { erf, normCdf, lgamma, ibeta, tCdf, tInv, mean, variance, welch, welchSamples, median, robustZ, bonferroni, bh, adjust };
});
