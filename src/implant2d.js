/* EpiScope — implant2d.js (v3.4.0 ; planche d'implantation dessinée : v3.4.1) : schéma d'implantation « classique », en 2D,
 * à côté des vues 3D.
 *
 * Fond : la planche vierge d'implantation de l'équipe (dessin au trait, vectorisé par tools/make_implant_sheet.py →
 * src/implant_sheet.js) — faces latérale et mésiale (en miroir : antérieur du même côté que la latérale), insula
 * (opercules retirés), face inférieure ; hémisphère droit : planche en miroir. Chaque dessin est calé sur le gabarit MNI par
 * ses repères (pôles frontal et occipital, vertex, bas du lobe temporal ; limites de l'insula ; ligne médiane et bord latéral
 * de la face inférieure) mis en correspondance avec les limites du cortex du maillage chargé (transformation affine par axe).
 *
 * Pour chaque hémisphère implanté :
 *   - projection latérale composée (vue « tal » de la planche) : la planche de Talairach (grille proportionnelle) vectorisée
 *     et recalée — Talairach → MNI par morceaux (pôles, VCA, VCP, vertex, plan CA-CP), puis spline de plaque mince sur le
 *     contour plus rond de la face latérale du gabarit — : sillons de la face latérale en noir ; en gris, insula, gyrus droit
 *     et repères de la face mésiale (cingulaire, paracentral, pariéto-occipital, calcarine) ; amygdale et hippocampe du
 *     gabarit en bleu clair ; points d'entrée des électrodes (cercles nommés) et tous les plots (« MIP ») ; oblique (≥ 15°) :
 *     trajectoire en pointillés ;
 *   - faces séparées : latérale (entrées, plots de la convexité) ; mésiale (régions mésiales ou plots à moins de 20 mm de la
 *     ligne médiane) et insula : un marqueur nommé par électrode au centre de ses plots sur la face ; face inférieure : toutes
 *     les électrodes vues d'en bas, trajectoire prolongée hors du cortex jusqu'à l'étiquette ;
 *   - marqueurs pleins, rouge foncé à gauche, bleu foncé à droite ;
 *   - implantation bilatérale : les deux hémisphères l'un au-dessus de l'autre (présentation compacte, titres GAUCHE / DROIT) ;
 *   - pas de légende sous les vues ; liste des électrodes : nom, cible profonde – cible externe (région du plot le plus
 *     superficiel).
 * Coordonnées : MNI (anatomie du patient : ramenées par l'affine patient → gabarit). */
(function (SV) {
  'use strict';
  const esc = SV.U.esc;
  const ap = (T, p) => T ? [T[0] * p[0] + T[1] * p[1] + T[2] * p[2] + T[3], T[4] * p[0] + T[5] * p[1] + T[6] * p[2] + T[7], T[8] * p[0] + T[9] * p[1] + T[10] * p[2] + T[11]] : p;
  const extCache = new WeakMap();

  /** limites du cortex d'un hémisphère (mm) : tout le pial, et l'insula seule (sommets insulaires latéraux, |x| ≥ 31 mm, plus
   *  grande composante connexe : sans la bande du fond du sillon circulaire inférieur ni le seuil) */
  function extents(Hm, lobe) {
    if (extCache.has(Hm)) return extCache.get(Hm);
    const P = Hm.pial, F = Hm.faces, n = Hm.n, all = { ymin: 1e9, ymax: -1e9, zmin: 1e9, zmax: -1e9, xmax: 0 }, on = new Uint8Array(n);
    for (let v = 0; v < n; v++) {
      const x = Math.abs(P[v * 3]), y = P[v * 3 + 1], z = P[v * 3 + 2];
      if (y < all.ymin) all.ymin = y; if (y > all.ymax) all.ymax = y; if (z < all.zmin) all.zmin = z; if (z > all.zmax) all.zmax = z; if (x > all.xmax) all.xmax = x;
      if (lobe(Hm.labels[v]) === 'insula' && x >= 31) on[v] = 1;
    }
    const par = new Int32Array(n).map((_, i) => i), find = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
    for (let f = 0; f < F.length; f += 3) { const a = F[f], b = F[f + 1], c = F[f + 2]; if (on[a] && on[b] && on[c]) { par[find(b)] = find(a); par[find(c)] = find(a); } }
    const size = new Map(); for (let v = 0; v < n; v++) if (on[v]) { const r = find(v); size.set(r, (size.get(r) || 0) + 1); }
    let best = -1, bs = 0; for (const [r, c] of size) if (c > bs) { bs = c; best = r; }
    const ins = { ymin: 1e9, ymax: -1e9, zmin: 1e9, zmax: -1e9 };
    for (let v = 0; v < n; v++) if (on[v] && find(v) === best) { const y = P[v * 3 + 1], z = P[v * 3 + 2]; if (y < ins.ymin) ins.ymin = y; if (y > ins.ymax) ins.ymax = y; if (z < ins.zmin) ins.zmin = z; if (z > ins.zmax) ins.zmax = z; }
    const keepV = new Uint8Array(n); for (let v = 0; v < n; v++) if (on[v] && find(v) === best) keepV[v] = 1;
    const r = { all, ins: ins.ymax > ins.ymin ? ins : all, insV: keepV }; extCache.set(Hm, r); return r;
  }
  /** vue de la planche calée sur le gabarit : { W, H, d, mirror, px(p), py(p) } — p en mm MNI ; vue inférieure : (|x|, y) */
  function sheetView(key, side, E) {
    const V = SV.ImplantSheet && SV.ImplantSheet[key]; if (!V) return null;
    const L = V.lm, mir = side === 'R', fx = X => mir ? V.W - X : X;
    if (key === 'inf') {
      const e = E.all, kx = (L.lat - L.mid) / e.xmax, ky = (L.p - L.a) / (e.ymax - e.ymin);
      return { key, W: V.W, H: V.H, d: V.d, lm: L, mirror: mir, fx, rx: p => L.mid + Math.abs(p[0]) * kx, px: p => fx(L.mid + Math.abs(p[0]) * kx), py: p => L.a + (e.ymax - p[1]) * ky };
    }
    const dg = V.dg || '', ds = V.ds || '', dgs = V.dgs || '', e = key === 'ins' ? E.ins : E.all, kx = (L.p - L.a) / (e.ymax - e.ymin), ky = (L.bot - L.top) / (e.zmax - e.zmin);
    // X = x0 + kx (ymax − y) ; Y = y0 + ky (zmax − z) : coefficients gardés pour superposer deux dessins (face mésiale sur la latérale)
    return { key, W: V.W, H: V.H, d: V.d, dg, ds, dgs, lm: L, mirror: mir, fx, lin: { kx, ky, y0: L.top, ymax: e.ymax, zmax: e.zmax },
      rx: p => L.a + (e.ymax - p[1]) * kx, px: p => fx(L.a + (e.ymax - p[1]) * kx), py: p => L.top + (e.zmax - p[2]) * ky };
  }
  /** amygdale et hippocampe du gabarit dans le cadre d'une vue sagittale (non miroir) : silhouettes vectorielles (projection
   *  sagittale précalculée par tools/make_implant_sheet.py, coordonnées MNI y, z) — repères profonds de la projection latérale */
  function deepPaths(side, V) {
    const D = SV.ImplantSheet.deep && SV.ImplantSheet.deep[side]; if (!D) return '';
    const P = pts => 'M' + pts.map(([y, z]) => { const q = [0, y, z]; return V.rx(q).toFixed(1) + ' ' + V.py(q).toFixed(1); }).join('L') + 'Z';
    return ['hip', 'amy'].filter(k => D[k] && D[k].length > 2).map(k => `<path d="${P(D[k])}" class="i2d-deep i2d-${k}"/>`).join('');
  }
  const M = {
    /** électrodes en coordonnées MNI : { name, hemi, entry, tip, contacts: [{ k, p, label }], oblique, n, length, target } */
    implant2dElectrodes(els) {
      const T = this.anatMode === 'patient' && this.patientAnat && this.patientAnat.toTemplate ? Array.from(this.patientAnat.toTemplate) : null, A = this.atlas;
      return (els || []).filter(e => e && e.contacts && e.contacts.length).map(e => ({
        name: e.name, hemi: e.hemi, entry: e.entry ? ap(T, e.entry) : null, tip: e.tip ? ap(T, e.tip) : ap(T, e.contacts[0].xyz),
        contacts: e.contacts.map(c => ({ k: c.k, p: ap(T, c.xyz), label: c.label })), oblique: (e.obliquity || 0) >= 15, n: e.nContacts || e.contacts.length, length: e.length || null,
        target: e.targetIndex && A ? A.label(e.targetIndex) : '',
        // cible externe : région du plot le plus superficiel
        outer: (() => { if (!A) return ''; const c = e.contacts.reduce((m, c) => (!m || (+c.k || 0) > (+m.k || 0) ? c : m), null); return c && c.label ? A.label(c.label) : ''; })(),
      }));
    },
    /** schéma 2D d'un hémisphère sur la planche d'implantation : projection latérale, faces latérale / mésiale / insula /
     *  inférieure, liste des électrodes */
    implant2dHtml(els, side) {
      const A = this.atlas; if (!A || !A.hemis || !SV.ImplantSheet) return '<div class="hint">Gabarit indisponible.</div>';
      const E = this.implant2dElectrodes(els).filter(e => e.hemi === side); if (!E.length) return '';
      const lobe = l => { const r = A.regions[l], m = r && A.db && A.db.regionByFamily.get(r.family); return m ? m.lobe : ''; };
      const sys = l => { const r = A.regions[l], m = r && A.db && A.db.regionByFamily.get(r.family); return m ? m.system : ''; };
      const X = extents(side === 'L' ? A.hemis.lh : A.hemis.rh, lobe), nm = side === 'L' ? 'gauche' : 'droit', nf = side === 'L' ? 'gauche' : 'droite', pad = 14;
      // plots d'une face : points d'entrée (cercles nommés) et plots ; o.mark : un cercle nommé par électrode au centre de ses
      // plots sur la face (faces mésiale et insula : même marqueur, aussi lisible que les entrées de la face latérale)
      const elecG = (V, sel, o) => {
        o = o || {}; let g = '';
        for (const e of E) {
          const C = e.contacts.filter(c => sel(c, e)), ent = e.entry && o.entry !== false ? e.entry : null;
          if (o.mark) {
            if (!C.length) continue; const m = [0, 1, 2].map(k => C.reduce((s2, c) => s2 + c.p[k], 0) / C.length);
            g += `<circle cx="${V.px(m)}" cy="${V.py(m)}" r="${o.re || 7}" class="ie-e"><title>${esc(e.name)} : ${C.length} plot${C.length > 1 ? 's' : ''}</title></circle><text x="${V.px(m) + 9}" y="${V.py(m) - 8}" class="ie-n">${esc(e.name)}</text>`;
            continue;
          }
          if (e.oblique && o.traj !== false && e.entry && e.tip) g += `<line x1="${V.px(e.entry)}" y1="${V.py(e.entry)}" x2="${V.px(e.tip)}" y2="${V.py(e.tip)}" class="ie-traj"/>`;
          for (const c of C) g += `<circle cx="${V.px(c.p)}" cy="${V.py(c.p)}" r="${o.r || 2.4}" class="ie-c"><title>${esc(e.name + c.k)}</title></circle>`;
          if (ent) g += `<circle cx="${V.px(ent)}" cy="${V.py(ent)}" r="${o.re || 5.5}" class="ie-e"/>`;
          const lp = ent || (C.length ? C[C.length - 1].p : null); if (lp) g += `<text x="${V.px(lp) + 7}" y="${V.py(lp) - 6}" class="ie-n">${esc(e.name)}</text>`;
        }
        return g;
      };
      // face inférieure : plots, trajectoire prolongée en dehors du cortex (bord latéral du dessin), cercle et étiquette hors du
      // dessin ; étiquettes espacées verticalement (12 px au moins)
      const OUT = 34;
      const infG = (V, sel) => {
        const R = []; let g = '';
        for (const e of E) {
          const C = e.contacts.filter(c => sel(c)); if (!C.length) continue;
          const pts = C.map(c => [V.rx(c.p), V.py(c.p)]).sort((a, b) => a[0] - b[0]), a = pts[0], b = pts[pts.length - 1], xo = V.lm.lat + OUT;
          const yo = Math.abs(b[0] - a[0]) > 4 ? b[1] + (b[1] - a[1]) / (b[0] - a[0]) * (xo - b[0]) : b[1];
          R.push({ e, pts, a, xo, yo: Math.max(4, Math.min(V.H - 4, yo)) });
        }
        R.sort((p, q) => p.yo - q.yo); for (let k = 1; k < R.length; k++) if (R[k].yo - R[k - 1].yo < 12) R[k].yo = R[k - 1].yo + 12;
        for (const r of R) {
          g += `<line x1="${V.fx(r.a[0])}" y1="${r.a[1]}" x2="${V.fx(r.xo)}" y2="${r.yo}" class="ie-out"/>`;
          for (const [x, y] of r.pts) g += `<circle cx="${V.fx(x)}" cy="${y}" r="2.4" class="ie-c"/>`;
          g += `<circle cx="${V.fx(r.xo)}" cy="${r.yo}" r="5" class="ie-e"/><text x="${V.fx(r.xo + (V.mirror ? -8 : 8))}" y="${r.yo + 4}" class="ie-n"${V.mirror ? ' text-anchor="end"' : ''}>${esc(r.e.name)}</text>`;
        }
        return g;
      };
      const fig = (V, inner, cls, title, o) => {
        o = o || {}; const padL = pad + (o.left || 0), padR = pad + (o.right || 0), bgT = V.mirror ? ` transform="translate(${V.W} 0) scale(-1 1)"` : '';
        return `<figure class="i2d ${cls}"><svg viewBox="${-padL} ${-pad} ${V.W + padL + padR} ${V.H + 2 * pad}" preserveAspectRatio="xMidYMid meet" role="img"><title>${esc(title)}</title><g${bgT}>${o.under || ''}<path d="${V.d}" class="i2d-bg"/>${o.over || ''}</g>${inner}</svg></figure>`;
      };
      const Vt = sheetView('tal', side, X), Vl = sheetView('lat', side, X), Vm = sheetView('med', side, X), Vi = sheetView('ins', side, X), Vf = sheetView('inf', side, X);
      const MED = new Set(['mesial_temporal', 'prefrontal_mesial', 'posterior_medial']);
      const isIns = c => lobe(c.label) === 'insula', med = c => !isIns(c) && (Math.abs(c.p[0]) < 20 || MED.has(sys(c.label)) || lobe(c.label) === 'cingulate');
      // projection latérale : contour de la face latérale de la planche ; planche de Talairach recalée en lignes d'épaisseur
      // constante (sillons de la face latérale en noir ; insula avec ses sillons, gyrus droit et repères de la face mésiale en
      // gris) ; silhouettes de l'amygdale et de l'hippocampe du gabarit en bleu
      const under = `${deepPaths(side, Vt)}<path d="${Vt.dg}" class="i2d-dg"/><path d="${Vt.dgs}" class="i2d-gl"/>`, over = `<path d="${Vt.ds}" class="i2d-bl"/>`;
      const tal = fig(Vt, elecG(Vt, () => true), 'tal', `Hémisphère ${nm}, projection latérale (planche de Talairach)`, { under, over });
      const lat = fig(Vl, elecG(Vl, c => !med(c) && !isIns(c), { traj: false, r: 3.6, re: 7 }), 'lat', `Face latérale ${nf} : entrées, plots de la convexité`);
      const mes = fig(Vm, elecG(Vm, med, { mark: true }), 'med', `Face mésiale ${nf} (en miroir) : électrodes atteignant les régions mésiales, ou à moins de 20 mm de la ligne médiane`);
      const ins = fig(Vi, elecG(Vi, isIns, { mark: true }), 'ins', `Insula ${nf} (opercules retirés)`);
      const inf = fig(Vf, infG(Vf, () => true), 'inf', `Face inférieure ${nf} : toutes les électrodes, vues d’en bas`, side === 'R' ? { left: 70 } : { right: 70 });
      // liste : nom, cible profonde – cible externe (sans le nombre de plots)
      const sfx = side === 'L' ? / (G|L)$/ : / (D|R)$/, clean = l => (!l || /^[—–-]$/.test(l) ? '' : l.replace(sfx, ''));
      const tgt = e => { const t = clean(e.target), o = clean(e.outer); return o && o !== t ? (t ? t + ' – ' + o : o) : t; };
      const tab = `<div class="i2d-t">${E.slice().sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true })).map(e => `<span class="i2d-e" title="${esc((e.oblique ? 'oblique · ' : '') + (e.length ? Math.round(e.length) + ' mm' : ''))}"><b>${esc(e.name)}</b>${e.oblique ? '<span class="muted"> ⟋</span>' : ''} : ${esc(tgt(e))}</span>`).join('')}</div>`;
      return `<div class="i2d-hemi s${side}"><div class="i2d-h"><span class="pr-sidebadge pr-side${side}">${side === 'L' ? 'G' : 'D'}</span> ${side === 'L' ? 'Hémisphère GAUCHE' : 'Hémisphère DROIT'} <span class="muted">${E.length} électrode${E.length > 1 ? 's' : ''}</span></div><div class="i2d-grid">${tal}<div class="i2d-faces">${lat}${mes}${ins}${inf}</div></div>${tab}</div>`;
    },
  };
  Object.assign(SV.app, M);
})(window.SV = window.SV || {});
