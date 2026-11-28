/* EpiScope — implant2d.js (v3.4.0) : schéma d'implantation « classique », en 2D, à côté des vues 3D.
 *
 * Pour chaque hémisphère implanté :
 *   - grille proportionnelle de Talairach sur la projection sagittale de l'hémisphère (gabarit MNI 2009b) : ligne CA-CP,
 *     verticales VCA et VCP ; colonnes A–D en avant de VCA, E entre VCA et VCP, F–I en arrière de VCP ; rangées 1–8
 *     au-dessus de CA-CP, 9–12 en dessous. Points d'entrée des électrodes (cercles nommés) et plots projetés (« MIP ») ;
 *     électrode oblique (≥ 15° de l'orthogonale) : trajectoire intracérébrale en pointillés ;
 *   - faces latérale et mésiale séparées, et l'insula seule (opercules retirés) : chaque plot sur la face qui le porte
 *     (latérale : cortex de la convexité ; mésiale : régions mésiales ou plots à moins de 20 mm de la ligne médiane ;
 *     insula : plots en région insulaire), point d'entrée sur la face latérale ;
 *   - tableau des électrodes (nom, plots, longueur intracérébrale, cible).
 * Coordonnées : MNI (anatomie du patient : ramenées par l'affine patient → gabarit). CA et CP du gabarit : valeurs usuelles
 * du MNI 152 (CA ≈ (0, 2, −4), CP ≈ (0, −26, −2)), la grille suit les limites du cerveau du gabarit. */
(function (SV) {
  'use strict';
  const esc = SV.U.esc, AC = [0, 2, -4], PC = [0, -26, -2];
  const ap = (T, p) => T ? [T[0] * p[0] + T[1] * p[1] + T[2] * p[2] + T[3], T[4] * p[0] + T[5] * p[1] + T[6] * p[2] + T[7], T[8] * p[0] + T[9] * p[1] + T[10] * p[2] + T[11]] : p;
  const COLS = 'ABCDEFGHI';
  const bg = new Map();

  /** fond : silhouette grise de la face, limites des régions en trait fin (data URL), mis en cache */
  function bgUrl(V, key) {
    if (bg.has(key)) return bg.get(key); if (typeof document === 'undefined') return '';
    const { lab, W, H } = V, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d'), img = g.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const l = lab[x + W * y]; if (!l) continue; const nb = (xx, yy) => xx < 0 || yy < 0 || xx >= W || yy >= H ? 0 : lab[xx + W * yy];
      const out = !nb(x - 1, y) || !nb(x + 1, y) || !nb(x, y - 1) || !nb(x, y + 1), edge = !out && (nb(x + 1, y) !== l || nb(x, y + 1) !== l);
      const c = out ? [40, 46, 56] : edge ? [150, 158, 170] : [236, 238, 241], i = 4 * (x + W * y); img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0); const u = cv.toDataURL('image/png'); bg.set(key, u); return u;
  }
  /** limites (mm) de la silhouette d'une vue : y min / max, z min / max */
  function extent(V) {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (let y = 0; y < V.H; y++) for (let x = 0; x < V.W; x++) if (V.lab[x + V.W * y]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const [Y0, Y1, Z0, Z1] = V.box, toY = px => { const t = px / (V.W - 1); return Y0 + (V.flip ? 1 - t : t) * (Y1 - Y0); }, toZ = py => Z1 - py / (V.H - 1) * (Z1 - Z0);
    const ya = toY(x0), yb = toY(x1); return { ymin: Math.min(ya, yb), ymax: Math.max(ya, yb), zmin: toZ(y1), zmax: toZ(y0) };
  }

  /** boîte sagittale de l'insula (± 8 mm) : la vue de l'insula la montre en grand, aux proportions justes */
  function insBox(A, side, lobe) {
    const Hm = side === 'L' ? A.hemis.lh : A.hemis.rh, keep = l => lobe(l) === 'insula';
    let y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let v = 0; v < Hm.n; v++) { if (!keep(Hm.labels[v])) continue; const y = Hm.pial[v * 3 + 1], z = Hm.pial[v * 3 + 2]; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    if (y1 < y0) return { W: 360, H: 260, keep };
    y0 -= 8; y1 += 8; z0 -= 8; z1 += 8; const W = 300;
    return { W, H: Math.round(W * (z1 - z0) / (y1 - y0)), box: [y0, y1, z0, z1], keep };
  }
  const M = {
    /** électrodes en coordonnées MNI : { name, hemi, entry, tip, contacts: [{ k, p, label }], oblique, n, length, target } */
    implant2dElectrodes(els) {
      const T = this.anatMode === 'patient' && this.patientAnat && this.patientAnat.toTemplate ? Array.from(this.patientAnat.toTemplate) : null, A = this.atlas;
      return (els || []).filter(e => e && e.contacts && e.contacts.length).map(e => ({
        name: e.name, hemi: e.hemi, entry: e.entry ? ap(T, e.entry) : null, tip: e.tip ? ap(T, e.tip) : ap(T, e.contacts[0].xyz),
        contacts: e.contacts.map(c => ({ k: c.k, p: ap(T, c.xyz), label: c.label })), oblique: (e.obliquity || 0) >= 15, n: e.nContacts || e.contacts.length, length: e.length || null,
        target: e.targetIndex && A ? A.label(e.targetIndex) : '',
      }));
    },
    /** schéma 2D d'un hémisphère : grille de Talairach (projection sagittale), faces latérale / mésiale / insula, tableau */
    implant2dHtml(els, side) {
      const A = this.atlas, G = SV.Glyph; if (!A || !G) return '<div class="hint">Gabarit indisponible.</div>';
      const E = this.implant2dElectrodes(els).filter(e => e.hemi === side); if (!E.length) return '';
      const lobe = l => { const r = A.regions[l], m = r && A.db && A.db.regionByFamily.get(r.family); return m ? m.lobe : ''; };
      const Vl = G.view(A, side, 'lat', { W: 520, H: 380 }), Vm = G.view(A, side, 'med', { W: 360, H: 260 }), Vi = G.view(A, side, 'lat', insBox(A, side, lobe));
      const Vlat = G.view(A, side, 'lat', { W: 360, H: 260 });
      const ext = extent(Vl), px = (V, p) => V.px(p[1]), py = (V, p) => V.py(p[2]);
      const nm = side === 'L' ? 'gauche' : 'droit';
      // grille de Talairach
      const xs = []; for (let k = 0; k <= 4; k++) xs.push(ext.ymax - k * (ext.ymax - AC[1]) / 4); xs.push(PC[1]); for (let k = 1; k <= 4; k++) xs.push(PC[1] - k * (PC[1] - ext.ymin) / 4);
      const zs = []; for (let k = 0; k <= 8; k++) zs.push(ext.zmax - k * (ext.zmax - AC[2]) / 8); for (let k = 1; k <= 4; k++) zs.push(AC[2] - k * (AC[2] - ext.zmin) / 4);
      const X = y => Vl.px(y), Y = z => Vl.py(z), pad = 26;
      let grid = '';
      xs.forEach((y, i) => { const vca = Math.abs(y - AC[1]) < 1e-6, vcp = Math.abs(y - PC[1]) < 1e-6; grid += `<line x1="${X(y)}" x2="${X(y)}" y1="${Y(ext.zmax)}" y2="${Y(ext.zmin)}" class="${vca || vcp ? 'tg-v' : 'tg-l'}"/>`; });
      zs.forEach(z => { const acpc = Math.abs(z - AC[2]) < 1e-6; grid += `<line x1="${X(ext.ymin)}" x2="${X(ext.ymax)}" y1="${Y(z)}" y2="${Y(z)}" class="${acpc ? 'tg-v' : 'tg-l'}"/>`; });
      // étiquettes : colonnes dans l'ordre antérieur → postérieur (A en avant)
      for (let i = 0; i < xs.length - 1; i++) grid += `<text x="${(X(xs[i]) + X(xs[i + 1])) / 2}" y="${Y(ext.zmax) - 8}" class="tg-t">${COLS[i]}</text>`;
      for (let i = 0; i < zs.length - 1; i++) grid += `<text x="${Math.min(X(ext.ymin), X(ext.ymax)) - 8}" y="${(Y(zs[i]) + Y(zs[i + 1])) / 2 + 4}" class="tg-t" text-anchor="end">${i + 1}</text>`;
      grid += `<circle cx="${X(AC[1])}" cy="${Y(AC[2])}" r="3" class="tg-ac"/><circle cx="${X(PC[1])}" cy="${Y(PC[2])}" r="3" class="tg-ac"/><text x="${X(AC[1]) + 4}" y="${Y(AC[2]) + 13}" class="tg-s">CA</text><text x="${X(PC[1]) + 4}" y="${Y(PC[2]) + 13}" class="tg-s">CP</text>`;
      const elecG = (V, sel, o) => {
        o = o || {}; let g = '';
        for (const e of E) {
          const C = e.contacts.filter(c => sel(c, e)); const ent = e.entry && (o.entry !== false) ? e.entry : null;
          if (e.oblique && o.traj !== false && e.entry && e.tip) g += `<line x1="${px(V, e.entry)}" y1="${py(V, e.entry)}" x2="${px(V, e.tip)}" y2="${py(V, e.tip)}" class="ie-traj"/>`;
          for (const c of C) g += `<circle cx="${px(V, c.p)}" cy="${py(V, c.p)}" r="${o.r || 2.3}" class="ie-c"><title>${esc(e.name + c.k)}</title></circle>`;
          if (ent) g += `<circle cx="${px(V, ent)}" cy="${py(V, ent)}" r="5.5" class="ie-e"/>`;
          const lp = ent || (C.length ? C[C.length - 1].p : null); if (lp && (ent || C.length)) g += `<text x="${px(V, lp) + 7}" y="${py(V, lp) - 6}" class="ie-n">${esc(e.name)}</text>`;
        }
        return g;
      };
      const svg = (V, inner, cls, title, url) => `<figure class="i2d ${cls}"><svg viewBox="${-pad} ${-pad} ${V.W + 2 * pad} ${V.H + 2 * pad}" preserveAspectRatio="xMidYMid meet"><image href="${url}" x="0" y="0" width="${V.W}" height="${V.H}"/>${inner}</svg><figcaption>${esc(title)}</figcaption></figure>`;
      const tal = svg(Vl, `<g class="tg">${grid}</g>${elecG(Vl, () => true)}`, 'tal', `Grille de Talairach, hémisphère ${nm} (projection sagittale ; obliques en pointillés)`, bgUrl(Vl, 'tal' + side));
      const sys = l => { const r = A.regions[l], m = r && A.db && A.db.regionByFamily.get(r.family); return m ? m.system : ''; };
      const MED = new Set(['mesial_temporal', 'prefrontal_mesial', 'posterior_medial']);
      const isIns = c => lobe(c.label) === 'insula', med = c => !isIns(c) && (Math.abs(c.p[0]) < 20 || MED.has(sys(c.label)) || lobe(c.label) === 'cingulate');
      const lat = svg(Vlat, elecG(Vlat, c => !med(c) && !isIns(c), { traj: false }), 'lat', `Face latérale ${side === 'L' ? 'gauche' : 'droite'} : entrées, plots de la convexité`, bgUrl(Vlat, 'lat' + side));
      const mes = svg(Vm, elecG(Vm, med, { entry: false, traj: false }), 'med', `Face mésiale ${side === 'L' ? 'gauche' : 'droite'} : régions mésiales, ou plots à moins de 20 mm de la ligne médiane`, bgUrl(Vm, 'med' + side));
      const ins = svg(Vi, elecG(Vi, isIns, { entry: false, traj: false }), 'ins', `Insula ${side === 'L' ? 'gauche' : 'droite'} (opercules retirés)`, bgUrl(Vi, 'ins' + side));
      const tab = `<div class="i2d-t">${E.slice().sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true })).map(e => `<span class="i2d-e" title="${esc((e.oblique ? 'oblique · ' : '') + (e.length ? Math.round(e.length) + ' mm' : ''))}"><b>${esc(e.name)}</b>${e.oblique ? '<span class="muted"> ⟋</span>' : ''} <span class="mono">${e.n}</span> ${esc(e.target || '')}</span>`).join('')}</div>`;
      return `<div class="i2d-hemi"><div class="i2d-h">Implantation ${side === 'L' ? 'gauche' : 'droite'} <span class="muted">${E.length} électrode${E.length > 1 ? 's' : ''}</span></div><div class="i2d-grid">${tal}<div class="i2d-faces">${lat}${mes}${ins}</div></div>${tab}</div>`;
    },
  };
  Object.assign(SV.app, M);
})(window.SV = window.SV || {});
