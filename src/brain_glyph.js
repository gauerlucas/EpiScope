/* EpiScope — brain_glyph.js (v3.4.0) : petites vignettes de cerveau et icônes de colonnes.
 *
 *   SV.Glyph.maps(atlas)          : cartes d'étiquettes (régions VEP) des faces latérale et mésiale de chaque hémisphère du
 *                                   gabarit, par rastérisation des triangles du pial avec tampon de profondeur (calcul unique) ;
 *   SV.Glyph.regions(atlas, set, side, o) : vignette (data URL) face latérale + face mésiale de l'hémisphère `side`, les
 *                                   régions de `set` colorées (o.color), le reste du cortex en gris clair, contour sombre ;
 *   SV.Glyph.icon(key)            : icône (SVG en ligne, sans emoji) d'une colonne du tableau de concordance.
 * Sert au tableau de concordance (une vignette par ligne : on lit la région sur le cerveau, côté sans ambiguïté). */
(function (SV) {
  'use strict';
  const W = 84, H = 56, W0 = W, H0 = H;   // une face ; la vignette met latérale et mésiale côte à côte
  const BOX = [-112, 78, -58, 86];   // boîte sagittale (y0, y1, z0, z1 ; coordonnées MNI, mm)
  let cache = null; const urls = new Map();

  /** rastérise un hémisphère vu de dehors (lat) ou de dedans (med) → étiquettes par pixel (0 = fond) */
  function raster(Hm, lh, face, o) {
    o = o || {}; const W = o.W || W0, H = o.H || H0, Y0 = o.box ? o.box[0] : BOX[0], Y1 = o.box ? o.box[1] : BOX[1], Z0 = o.box ? o.box[2] : BOX[2], Z1 = o.box ? o.box[3] : BOX[3], keep = o.keep || null;
    const P = Hm.pial, F = Hm.faces, L = Hm.labels, lab = new Uint8Array(W * H), dep = new Float32Array(W * H).fill(-1e9);
    // vue de dehors : profondeur = -x pour le gauche (on regarde depuis -x), +x pour le droit ; vue mésiale : l'inverse
    const sgn = (lh ? -1 : 1) * (face === 'lat' ? 1 : -1);
    // orientation des images : antérieur à gauche pour la face latérale gauche et la mésiale droite (comme vues de dehors)
    const flip = (lh && face === 'lat') || (!lh && face === 'med');
    const px = y => { const t = (y - Y0) / (Y1 - Y0); return (flip ? 1 - t : t) * (W - 1); }, py = z => (1 - (z - Z0) / (Z1 - Z0)) * (H - 1);
    const X = new Float32Array(Hm.n), Yp = new Float32Array(Hm.n), D = new Float32Array(Hm.n);
    for (let v = 0; v < Hm.n; v++) { X[v] = px(P[v * 3 + 1]); Yp[v] = py(P[v * 3 + 2]); D[v] = sgn * P[v * 3]; }
    for (let f = 0; f < F.length; f += 3) {
      const a = F[f], b = F[f + 1], c = F[f + 2]; if (keep && !(keep(L[a]) || keep(L[b]) || keep(L[c]))) continue;
      const x0 = Math.max(0, Math.floor(Math.min(X[a], X[b], X[c]))), x1 = Math.min(W - 1, Math.ceil(Math.max(X[a], X[b], X[c])));
      const y0 = Math.max(0, Math.floor(Math.min(Yp[a], Yp[b], Yp[c]))), y1 = Math.min(H - 1, Math.ceil(Math.max(Yp[a], Yp[b], Yp[c])));
      const den = (Yp[b] - Yp[c]) * (X[a] - X[c]) + (X[c] - X[b]) * (Yp[a] - Yp[c]); if (Math.abs(den) < 1e-9) continue;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const w0 = ((Yp[b] - Yp[c]) * (x - X[c]) + (X[c] - X[b]) * (y - Yp[c])) / den, w1 = ((Yp[c] - Yp[a]) * (x - X[c]) + (X[a] - X[c]) * (y - Yp[c])) / den, w2 = 1 - w0 - w1;
        if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;
        const z = w0 * D[a] + w1 * D[b] + w2 * D[c], i = x + W * y; if (z <= dep[i]) continue;
        dep[i] = z; lab[i] = L[w0 >= w1 && w0 >= w2 ? a : w1 >= w2 ? b : c] || 255;   // 255 : cortex sans étiquette (mur médian)
      }
    }
    return o.W ? { lab, W, H, box: [Y0, Y1, Z0, Z1], flip, px, py } : lab;
  }
  function maps(atlas) {
    if (cache && cache.atlas === atlas) return cache; if (!atlas || !atlas.hemis || !atlas.hemis.lh) return null;
    cache = { atlas, L: { lat: raster(atlas.hemis.lh, true, 'lat'), med: raster(atlas.hemis.lh, true, 'med') }, R: { lat: raster(atlas.hemis.rh, false, 'lat'), med: raster(atlas.hemis.rh, false, 'med') } }; urls.clear();
    return cache;
  }
  const hex = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  /** vignette latérale + mésiale de l'hémisphère side ('L' | 'R'), régions de set colorées */
  function regions(atlas, set, side, o) {
    o = o || {}; const M = maps(atlas); if (!M || typeof document === 'undefined') return '';
    const S = set instanceof Set ? set : new Set(set || []), key = [side, o.color || '', o.bg || '', [...S].sort((a, b) => a - b).join(',')].join('|'); if (urls.has(key)) return urls.get(key);
    const gap = 4, cv = document.createElement('canvas'); cv.width = 2 * W + gap; cv.height = H; const g = cv.getContext('2d'), img = g.createImageData(cv.width, H);
    const col = hex(o.color || '#d4572a'), base = hex(o.base || '#d9dde3'), edge = hex(o.edge || '#5b6470');
    const paint = (lab, dx) => {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const l = lab[x + W * y]; if (!l) continue; const on = S.has(l);
        const nb = (xx, yy) => xx < 0 || yy < 0 || xx >= W || yy >= H ? 0 : lab[xx + W * yy];
        const border = [nb(x - 1, y), nb(x + 1, y), nb(x, y - 1), nb(x, y + 1)].some(v => !v), rb = on && [nb(x - 1, y), nb(x + 1, y), nb(x, y - 1), nb(x, y + 1)].some(v => v && !S.has(v));
        const c = border ? edge : rb ? col.map(v => Math.round(v * 0.7)) : on ? col : base, i = 4 * (dx + x + cv.width * y);
        img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
      }
    };
    paint(M[side].lat, 0); paint(M[side].med, W + gap); g.putImageData(img, 0, 0);
    const u = cv.toDataURL('image/png'); urls.set(key, u); return u;
  }

  // ---------------------------------------------------------------- icônes (traits, couleur du texte)
  const P = {
    semio: '<circle cx="12" cy="5.5" r="2.8"/><path d="M5.5 21v-5.5a6.5 6.5 0 0 1 13 0V21"/><path d="M9 21v-4M15 21v-4"/>',
    eeg_ii: '<path d="M2 13h4l1.5-6 3 12 2.5-9 1.5 3H22"/>',
    eeg_ic: '<path d="M2 12h2l1.5-3 1.5 6 1.5-8 1.5 10 1.5-12 1.5 12 1.5-9 1.5 6 1.5-3H22"/>',
    mri: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 6c-4 0-6 2.5-6 6s2 6 6 6 6-2.5 6-6-2-6-6-6z"/><path d="M12 6v12"/>',
    pet: '<circle cx="12" cy="12" r="2.6"/><circle cx="12" cy="12" r="6.2" opacity=".6"/><circle cx="12" cy="12" r="9.6" opacity=".3"/>',
    neuropsy: '<path d="M14.5 21v-3.2h2.2a2 2 0 0 0 2-2v-2.6l2-.9-2-3.8A7.4 7.4 0 1 0 7 16.4V21"/><path d="M10 9.5h4M12 7.5v4"/>',
    seeg_ii: '<path d="M3 21L9.5 14.5"/><circle cx="4.8" cy="19.2" r="1.4"/><circle cx="7.6" cy="16.4" r="1.4"/><path d="M11 9h2.5l1.5-6 2 10 1.5-4H22"/>',
    seeg_ic: '<path d="M3 21L9.5 14.5"/><circle cx="4.8" cy="19.2" r="1.4"/><circle cx="7.6" cy="16.4" r="1.4"/><path d="M11 8h1l1-2 1 4 1-6 1 8 1-8 1 6 1-3h2"/>',
    seeg_q: '<path d="M4 20L20 4"/><circle cx="7.5" cy="16.5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="16.5" cy="7.5" r="1.7"/><path d="M15 18h6M18 15v6"/>',
    seeg_stim: '<path d="M13 2L5 13.5h6L10 22l9-12.5h-6z"/>',
    conc: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    custom: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  };
  function icon(key, o) { o = o || {}; const p = P[key] || P.custom; return `<svg class="gl-ic" viewBox="0 0 24 24" width="${o.size || 18}" height="${o.size || 18}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`; }

  /** vue sagittale d'un hémisphère à la taille voulue : { lab, W, H, box, flip, px(y), py(z) } ; o.keep(étiquette) : faces gardées */
  function view(atlas, side, face, o) { if (!atlas || !atlas.hemis) return null; return raster(side === 'L' ? atlas.hemis.lh : atlas.hemis.rh, side === 'L', face, Object.assign({ W: 420, H: 300 }, o || {})); }
  SV.Glyph = { maps, regions, icon, view, W, H, BOX };
})(window.SV = window.SV || {});
