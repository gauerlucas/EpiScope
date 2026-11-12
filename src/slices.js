/* EpiScope — slices.js : visionneuse en coupes de l'imagerie du patient, sans dépendance.
 *
 * Tout est exprimé dans le monde de l'image de référence (RAS du T1 pré-opératoire, mm). Chaque calque est un volume
 * (conventions de nifti.js) muni d'une transformation T monde(calque) → monde(référence) (recalage) :
 *   { id, name, vol, T?, kind: 'gray' | 'hot' | 'cool' | 'pet' | 'act' | 'labels' | 'mask' | 'metal', opacity, win: [lo, hi],
 *     lut?: Map(label → [r,g,b,a]), visible, threshold? }
 * Trois coupes, chacune définie par un repère { U (vers la droite de l'écran), V (vers le haut), N = U × V } :
 *   - orthogonales (axiale, coronale, sagittale), convention radiologique par défaut (droite du patient à gauche) ;
 *   - obliques (setOblique) : p. ex. alignées sur une électrode — deux coupes le long de l'axe, une coupe transverse.
 * Navigation à la manière de MRIcroGL : l'image reste immobile, le réticule suit exactement la souris (clic ou glisser),
 * les deux autres coupes changent de profondeur ; chaque coupe est centrée sur un point fixe (viewC, centre du volume,
 * ou milieu de l'électrode vérifiée) projeté sur le plan du curseur, puis décalée (pan) ; le zoom garde le réticule en place.
 * Interaction (mode choisi par setMode, boutons de la barre) :
 *   « curseur » : clic / glisser = curseur ; Maj + glisser = contraste ; clic droit ou milieu + glisser = déplacer ;
 *   « contraste » : glisser horizontalement = contraste (largeur de fenêtre), verticalement = luminosité (niveau), sur le
 *     calque choisi (wlTarget, sinon l'image de base) ; « déplacer » : glisser = déplacer la vue ;
 *   molette = coupe suivante ; Ctrl + molette = zoom ; double-clic = recentrer ; flèches ↑ ↓ = coupe, ← → = onStep.
 * Encart (setInset) : petit « cerveau de verre » (sommets du cortex projetés, électrodes, celle étudiée en surbrillance ;
 *   v4.21 : toutes les électrodes nommées, un clic sur l'une la choisit — onInsetPick(name)).
 * v4.21 : rendu à pleine résolution dès qu'un calque fin (voxel < 0,8 mm, scanner) est visible (le scanner n'est jamais
 *   rééchantillonné : échantillonné dans sa grille native) ; coupe suivante au pas du voxel le plus fin visible ; projection
 *   d'intensité maximale (L.mip = épaisseur en mm, L.mipPlanes = clés des coupes) ; poignées d'ajustement (setHandles :
 *   cadre autour de la tête de l'image mobile — bords : échelle sur l'axe, coins : échelle dans le plan, intérieur :
 *   déplacement, ⟳ : rotation dans le plan). */
(function (SV) {
  'use strict';
  const M4 = SV.Mat4;
  const ramp = stops => t => { t = t < 0 ? 0 : t > 1 ? 1 : t; for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) { const [t0, a] = stops[i - 1], [t1, b] = stops[i], f = (t - t0) / (t1 - t0 || 1); return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; } return stops[stops.length - 1][1]; };
  const CMAPS = {
    gray: t => { const v = 255 * (t < 0 ? 0 : t > 1 ? 1 : t); return [v, v, v]; },
    hot: ramp([[0, [0, 0, 0]], [0.35, [200, 20, 0]], [0.7, [255, 170, 0]], [1, [255, 255, 220]]]),
    pet: ramp([[0, [0, 0, 0]], [0.2, [40, 0, 120]], [0.4, [0, 90, 255]], [0.6, [0, 220, 120]], [0.8, [255, 220, 0]], [1, [255, 40, 0]]]),
    cool: ramp([[0, [0, 0, 60]], [0.5, [0, 140, 255]], [1, [200, 255, 255]]]),
    act: ramp([[0, [255, 230, 150]], [0.35, [255, 196, 70]], [0.6, [255, 120, 55]], [0.85, [214, 40, 70]], [1, [140, 25, 95]]]),
    green: ramp([[0, [0, 30, 0]], [1, [120, 255, 140]]]),
    metal: t => [120 + 135 * t, 230, 255],
    red: ramp([[0, [0, 0, 0]], [0.55, [205, 38, 30]], [1, [255, 178, 160]]]),   // v5.2 : T1 pré-opératoire sous la T1 post-opératoire
  };
  // chaud / froid (cartes signées : asymétrie, t) : centre de la fenêtre transparent, froid de bleu nuit à cyan, chaud de rouge sombre à jaune
  const COLD = ramp([[0, [10, 40, 170]], [0.5, [0, 120, 255]], [1, [120, 245, 255]]]), HOT = ramp([[0, [170, 0, 0]], [0.5, [255, 70, 0]], [1, [255, 240, 90]]]);
  CMAPS.div = t => { const u = (t - 0.5) * 2; return u >= 0 ? HOT(u) : COLD(-u); };
  /** couleur et opacité relative d'un voxel de calque (null : transparent) — palettes séquentielles : transparentes au bas de
   *  la fenêtre ; chaud / froid : transparente au centre (|v| < seuil ou |t − 0,5| ≤ 0,04) */
  function shade(kind, t, v, thr) {
    if (kind === 'div') { if (thr != null && Math.abs(v) < thr) return null; const u = Math.abs(t - 0.5) * 2; if (u <= 0.04) return null; const c = CMAPS.div(t); return [c[0], c[1], c[2], Math.min(1, u * 4)]; }
    if (thr != null && v < thr) return null;
    if (kind === 'gray') { const c = CMAPS.gray(t); return [c[0], c[1], c[2], 1]; }
    if (kind === 'grayt') { if (t <= 0.04) return null; const c = CMAPS.gray(t); return [c[0], c[1], c[2], Math.min(1, (t - 0.04) / 0.12)]; }   // gris, valeurs proches de 0 transparentes (cavité opératoire)
    if (t <= 0.02) return null; const c = (CMAPS[kind] || CMAPS.hot)(t); return [c[0], c[1], c[2], Math.min(1, t * 3)];
  }
  const CMAP_FR = { gray: 'gris', hot: 'chaud', pet: 'arc-en-ciel (TEP)', cool: 'froid', act: 'activation', green: 'vert', div: 'chaud / froid (signé)', red: 'rouge', grayt: 'gris, fond transparent' };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => { const n = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };
  const ORTHO0 = rad => [   // N : sens de la molette (vers le haut = supérieur, antérieur, droite)
    { key: 'axial', fr: 'axiale', U: [rad ? -1 : 1, 0, 0], V: [0, 1, 0], N: [0, 0, 1] },
    { key: 'coronal', fr: 'coronale', U: [rad ? -1 : 1, 0, 0], V: [0, 0, 1], N: [0, 1, 0] },
    { key: 'sagittal', fr: 'sagittale', U: [0, -1, 0], V: [0, 0, 1], N: [1, 0, 0] },
  ];
  /** coupes orthogonales, la coupe principale (grande fenêtre) en premier : axiale par défaut, coronale ou sagittale au choix */
  /** v5.1 — coupes « redressées » : align = { ex, ey, ez } (axes droite, antérieur, supérieur du repère AC-PC, dans le monde du
   *  T1) ; les coupes orthogonales suivent ce repère au lieu des axes du scanner (l'image n'est pas rééchantillonnée) */
  const ORTHO = (rad, main, al) => { let F = ORTHO0(rad); if (al) { const m = v => [0, 1, 2].map(k => v[0] * al.ex[k] + v[1] * al.ey[k] + v[2] * al.ez[k]); F = F.map(f => Object.assign({}, f, { U: m(f.U), V: m(f.V), N: m(f.N) })); }
    const i = Math.max(0, F.findIndex(f => f.key === main)); return [F[i]].concat(F.filter((f, k) => k !== i)); };
  const MAIN_FR = { axial: 'Ax', coronal: 'Cor', sagittal: 'Sag' };
  /** lettre d'orientation d'une direction monde (RAS : droite, antérieur, supérieur) */
  function dirLetter(d) {
    const L = [['D', 'G'], ['A', 'P'], ['S', 'I']], a = d.map(Math.abs), out = [];
    const ord = [0, 1, 2].sort((i, j) => a[j] - a[i]);
    for (const i of ord) if (a[i] >= 0.38 || !out.length) out.push(L[i][d[i] >= 0 ? 0 : 1]);
    return out.slice(0, 2).join('');
  }

  class Slices {
    constructor(container, opts) {
      this.el = container; this.opts = Object.assign({ radiological: true }, opts || {});
      this.layers = []; this.markers = []; this.shafts = []; this.rois = []; this.ellipsoids = []; this.cursor = [0, 0, 0]; this.zoom = 1; this.mode = 'cursor'; this.wlTarget = null;
      this.onCursor = null; this.onPick = null; this.onWindow = null; this.onStep = null; this.ref = null; this.labelName = null; this.pickMode = null; this.inset = null;
      this.markerAlpha = 1; this.editMarkers = false; this.editAdd = true; this.onMarkerEdit = null;   // opacité des plots et hampes ; édition des plots (glisser, clic = ajout, clic droit = retrait)
      this.handles = null; this.onInsetPick = null; this.fine = true;   // poignées d'ajustement du recalage ; clic sur l'encart ; rendu fin automatique
      this.el.classList.add('sv-slices'); this.el.tabIndex = 0; this.panes = [];
      this.mainKey = this.opts.main || 'axial'; this.contours = [];
      this.frames = ORTHO(this.opts.radiological, this.mainKey, this.align); this.pan = this.frames.map(() => [0, 0]);
      for (let i = 0; i < 3; i++) {
        const pane = document.createElement('div'); pane.className = 'sl-pane'; pane.dataset.idx = i; pane.dataset.plane = this.frames[i].key;
        const c = document.createElement('canvas'); pane.appendChild(c);
        const lab = document.createElement('div'); lab.className = 'sl-lab'; pane.appendChild(lab);
        const mx = document.createElement('button'); mx.className = 'sl-max'; mx.title = 'agrandir cette coupe / revenir aux trois coupes'; mx.textContent = '⤢'; mx.onclick = e => { e.stopPropagation(); this.maximize(this.maxIdx === i ? null : i); }; pane.appendChild(mx);
        if (i === 0) {   // coupe de la grande fenêtre : axiale, coronale ou sagittale
          const sw = document.createElement('div'); sw.className = 'sl-main'; sw.title = 'coupe de la grande fenêtre';
          sw.innerHTML = Object.entries(MAIN_FR).map(([k, l]) => `<button data-main="${k}">${l}</button>`).join('');
          sw.querySelectorAll('[data-main]').forEach(b => { b.onpointerdown = e => e.stopPropagation(); b.onclick = e => { e.stopPropagation(); this.setMain(b.dataset.main); }; });
          pane.appendChild(sw); this._mainSw = sw;
        }
        this.el.appendChild(pane); this.panes.push({ pane, canvas: c, ctx: c.getContext('2d'), lab });
        this._bind(i);
      }
      const ins = document.createElement('canvas'); ins.className = 'sl-inset'; ins.hidden = true; ins.title = 'repère : cortex du patient en transparence, électrodes (clic sur une électrode : la choisir ; ailleurs : réduire / agrandir)';
      ins.onclick = e => { const n = this._insetHit(e); if (n && this.onInsetPick) this.onInsetPick(n); else ins.classList.toggle('small'); };
      ins.onpointermove = e => { ins.style.cursor = this._insetHit(e) ? 'pointer' : ''; };
      this.el.appendChild(ins); this.insetCv = ins;
      this.info = document.createElement('div'); this.info.className = 'sl-info'; this.el.appendChild(this.info);
      this.el.addEventListener('keydown', e => this._key(e));
      // disposition : 2 × 2 (axiale sur deux lignes) si la place est large, axiale en haut si elle est haute (volet de la vue des crises)
      this._ro = new ResizeObserver(() => { const r = this.el.getBoundingClientRect(); this.el.classList.toggle('tall', r.height > r.width * 1.15); this.draw(); }); this._ro.observe(this.el);
      this._applyModeClass(); this._syncMainSw();
    }
    /** volume de référence (grille du monde affiché) ; le curseur est placé au centre */
    setReference(vol) { this.ref = vol; this.cursor = SV.Vol.center(vol); this.viewC = this.cursor.slice(); this.fov = Math.max(...vol.dims.map((d, k) => d * vol.pixdim[k])) * 0.92; this.draw(); }
    setLayers(list) { const old = new Map(this.layers.map(L => [L.id, L])); this.layers = list.map(L => this._prep(L, old.get(L.id))); this.draw(); }
    updateLayer(id, patch) { const L = this.layers.find(x => x.id === id); if (L) { Object.assign(L, patch); if (patch.vol || patch.T !== undefined) Object.assign(L, this._prep(L)); } this.draw(); }
    _prep(L, prev) {
      L.M = M4.mul(M4.inv(L.vol.affine), L.T ? M4.inv(M4.from(L.T)) : M4.identity());
      if (L.kind !== 'labels' && L.kind !== 'mask') {
        if (!L.autoWin) { const q = SV.Vol.quantiles(L.vol, [0.02, 0.995]); L.autoWin = [q[0], q[1]]; }
        if (!L.win) L.win = prev && prev.vol === L.vol && prev.win ? prev.win.slice() : L.autoWin.slice();
      }
      return Object.assign({ opacity: 1, visible: true }, L);
    }
    resetWindow(id) { const L = this.layers.find(x => x.id === (id || this.wlTarget)) || this.layers[0]; if (L && L.autoWin) { L.win = L.autoWin.slice(); if (this.onWindow) this.onWindow(L); this.draw(); } }
    setMarkers(list) { this.markers = list || []; this.draw(); }
    setShafts(list) { this.shafts = list || []; this.draw(); }
    /** opacité des électrodes (plots et hampes) : le métal du scanner reste lisible sous les anneaux */
    setMarkerAlpha(a) { this.markerAlpha = Math.max(0.05, Math.min(1, +a || 1)); this.draw(); }
    /** plot éditable (marqueur portant « edit ») le plus proche du point (x, y) de la vue i, dans la coupe affichée */
    _hitMarker(i, x, y, W, H) {
      const F = this._frame(i, W, H); let best = null, bd = 1e9;
      for (const m of this.markers) {
        if (m.edit == null) continue; const d = Math.abs(this._depth(F, m.p)), rad = m.r || 1.6; if (d > Math.max(2.2, rad + 0.5)) continue;
        const q = this._toScreen(F, m.p), rr = Math.max(2.5, Math.sqrt(Math.max(0, rad * rad - d * d)) / F.s), dd = Math.hypot(q[0] - x, q[1] - y);
        if (dd <= rr + 3 && dd < bd) { bd = dd; best = m; }
      }
      return best;
    }
    /** ellipsoïdes (volumes de thermocoagulation théoriques) : [{c, u (axe unitaire), a (demi-longueur), b (demi-diamètre),
     *  color: [r,g,b], style: 'planned'|'validated'|'done'|'rejected', label, sel}] ; la coupe en montre la section (ellipse) */
    setEllipsoids(list) { this.ellipsoids = list || []; this.draw(); }
    /** ROI annotées : [{ kind: 'sphere' | 'arrow', p: [x,y,z] monde, r (mm), label, color, sel }] — sphère creuse (cercle de
     *  section dans chaque coupe qu'elle traverse), flèche pointant le point (visible à ± 8 mm de la coupe, estompée) */
    setRois(list) { this.rois = list || []; this.draw(); }
    setCursor(p, silent) { this.cursor = p.slice(); this.draw(); if (!silent && this.onCursor) this.onCursor(this.cursor); }
    setMode(m) { this.mode = m || 'cursor'; this._applyModeClass(); }
    _applyModeClass() { this.el.classList.toggle('mode-wl', this.mode === 'wl'); this.el.classList.toggle('mode-pan', this.mode === 'pan'); }
    /** coupes orthogonales (radiologique : droite du patient à gauche de l'écran) */
    /** coupe de la grande fenêtre (axial | coronal | sagittal) ; onMain(key) prévient l'appelant */
    setMain(key, silent) {
      this.mainKey = MAIN_FR[key] ? key : 'axial'; this._syncMainSw(); if (this.oblique) return;
      const pans = new Map(this.frames.map((f, i) => [f.key, this.pan[i]]));
      this.frames = ORTHO(this.opts.radiological, this.mainKey, this.align); this.pan = this.frames.map(f => pans.get(f.key) || [0, 0]);
      this.panes.forEach((p, i) => { p.pane.dataset.plane = this.frames[i].key; }); this.draw(); if (!silent && this.onMain) this.onMain(this.mainKey);
    }
    _syncMainSw() { if (this._mainSw) this._mainSw.querySelectorAll('[data-main]').forEach(b => b.classList.toggle('on', b.dataset.main === this.mainKey)); }
    /** contours anatomiques : [{ kind: 'mesh', pos (monde, x y z…), faces, color } | { kind: 'mask', vol, inside (Uint8Array : étiquette → 1), color }] */
    setContours(list) { this.contours = list || []; this.draw(); }
    /** imagerie de source : { parts: [{ pos, faces, w (poids 0–1 par sommet), color ([r,g,b] ou chaleur) }], dips: [{ p, ci: { r, axes }, color: [r,g,b], ball }] } ou null */
    setSource(o) { this.source = o || null; this.draw(); }
    /** repère de redressement (AC-PC) ou null ; sans effet sur des coupes obliques en cours (électrode) */
    setAlign(al) { this.align = al && al.ex && al.ey && al.ez ? { ex: al.ex, ey: al.ey, ez: al.ez } : null; if (!this.oblique) { const pans = this.pan; this.frames = ORTHO(this.opts.radiological, this.mainKey, this.align); this.pan = pans && pans.length === this.frames.length ? pans : this.frames.map(() => [0, 0]); this.draw(); } }
    setOrtho(radiological) { if (radiological != null) this.opts.radiological = radiological; this.frames = ORTHO(this.opts.radiological, this.mainKey, this.align); this.oblique = null; this._syncMainSw(); if (this.ref) this.viewC = SV.Vol.center(this.ref); this.pan = this.frames.map(() => [0, 0]); this.panes.forEach((p, i) => { p.pane.dataset.plane = this.frames[i].key; }); this.el.classList.remove('oblique'); this.draw(); }
    /** coupes obliques : frames = [{ key, fr, U, V }] (U vers la droite, V vers le haut de l'écran) */
    setOblique(frames, info) { this.frames = frames.map(f => { const U = norm(f.U), V = norm(f.V); return Object.assign({}, f, { U, V }); }); this.oblique = info || true; this.pan = this.frames.map(() => [0, 0]); this.panes.forEach((p, i) => { p.pane.dataset.plane = this.frames[i].key; }); this.el.classList.add('oblique'); this.draw(); }
    maximize(i) { this.maxIdx = i == null ? null : i; this.panes.forEach((p, k) => p.pane.classList.toggle('max', k === this.maxIdx)); this.el.classList.toggle('has-max', this.maxIdx != null); this.draw(); }
    /** zoom autour du réticule : il garde sa place à l'écran dans chaque coupe */
    setZoom(z) {
      z = Math.max(0.5, Math.min(16, z)); const k = this.zoom / z;
      if (this.ref) this.frames.forEach((f, i) => { const F = this._frame(i, 1, 1), d = [this.cursor[0] - F.c[0], this.cursor[1] - F.c[1], this.cursor[2] - F.c[2]], u = dot(d, F.U), v = dot(d, F.V); this.pan[i] = [u - (u - this.pan[i][0]) * k, v - (v - this.pan[i][1]) * k]; });
      this.zoom = z; this.draw();
    }
    /** point montré au centre des coupes (projeté sur le plan du curseur) */
    setViewCenter(p) { this.viewC = p.slice(); this.pan = this.frames.map(() => [0, 0]); this.draw(); }
    resetView() { this.zoom = 1; if (this.ref && !this.oblique) this.viewC = SV.Vol.center(this.ref); this.pan = this.frames.map(() => [0, 0]); this.draw(); }
    /** encart « cerveau de verre » : { points: Float32Array monde (x,y,z…), views: [{U, V, title}], elecs: [{name, pts:[[x,y,z]], sel}], cursor } ou null */
    setInset(data) { this.inset = data; this.insetCv.hidden = !data; this.draw(); }

    // ---------------------------------------------------------------- géométrie des coupes
    _frame(i, W, H) {
      const f = this.frames[i], s = this.fov / this.zoom / Math.min(W, H), N = f.N || cross(f.U, f.V);
      const b = this.viewC || this.cursor, cu = this.cursor, t = (cu[0] - b[0]) * N[0] + (cu[1] - b[1]) * N[1] + (cu[2] - b[2]) * N[2];
      return { i, f, U: f.U, V: f.V, N, s, c: [b[0] + N[0] * t, b[1] + N[1] * t, b[2] + N[2] * t], pan: this.pan[i], W, H };   // centre fixe dans le plan, profondeur = curseur
    }
    _toWorld(F, x, y) { const a = F.pan[0] + (x - F.W / 2) * F.s, b = F.pan[1] + (F.H / 2 - y) * F.s, c = F.c; return [c[0] + F.U[0] * a + F.V[0] * b, c[1] + F.U[1] * a + F.V[1] * b, c[2] + F.U[2] * a + F.V[2] * b]; }
    _toScreen(F, p) { const d = [p[0] - F.c[0], p[1] - F.c[1], p[2] - F.c[2]]; return [F.W / 2 + (dot(d, F.U) - F.pan[0]) / F.s, F.H / 2 - (dot(d, F.V) - F.pan[1]) / F.s]; }
    _depth(F, p) { return (p[0] - F.c[0]) * F.N[0] + (p[1] - F.c[1]) * F.N[1] + (p[2] - F.c[2]) * F.N[2]; }

    // ---------------------------------------------------------------- rendu
    draw() { if (this._raf || this.destroyed) return; this._raf = requestAnimationFrame(() => { this._raf = null; for (let i = 0; i < 3; i++) this._drawPane(i); this._drawInfo(); this._drawInset(); }); }
    _drawPane(i) {
      const { canvas, ctx, lab, pane } = this.panes[i], dpr = Math.min(2, window.devicePixelRatio || 1);
      if (this.maxIdx != null && this.maxIdx !== i) return;
      const r = pane.getBoundingClientRect(), W = Math.max(40, Math.floor(r.width)), H = Math.max(40, Math.floor(r.height));
      // rendu à résolution réduite (0,6) puis agrandi : interactif même sans GPU ; dès qu'un calque fin est visible (scanner
      // 0,5 mm, T1 0,5 mm), la résolution de rendu suit le voxel le plus fin pour ne pas le dégrader (v4.21)
      const vis = this.layers.filter(L => L.visible && L.opacity > 0 && L.kind !== 'labels' && L.kind !== 'mask');
      const finest = vis.length ? Math.min(...vis.map(L => Math.min(...(L.vol.pixdim || [1, 1, 1]).slice(0, 3)))) : 1;
      const F0 = this._frame(i, W, H);   // F0.s : mm par pixel CSS
      let scale = 0.6; if (this.fine !== false && finest < 0.85) scale = Math.max(0.6, Math.min(1, F0.s / (dpr * finest)));
      if (W * H * dpr * dpr * scale * scale > 1.6e6) scale = Math.max(0.6, Math.sqrt(1.6e6 / (W * H * dpr * dpr)));   // plafond : la vue reste fluide
      const w = Math.max(32, Math.floor(W * dpr * scale)), hgt = Math.max(32, Math.floor(H * dpr * scale));
      if (canvas.width !== W * dpr || canvas.height !== H * dpr) { canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W + 'px'; canvas.style.height = H + 'px'; }
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      const fr = this.frames[i];
      if (!this.ref) { lab.textContent = fr.fr; return; }
      const F = this._frame(i, w, hgt);
      if (!this._off || this._off.width !== w || this._off.height !== hgt) { this._off = document.createElement('canvas'); this._off.width = w; this._off.height = hgt; this._offCtx = this._off.getContext('2d'); }
      const im = this._offCtx.createImageData(w, hgt), D = im.data;
      const layers = this.layers.filter(L => L.visible && L.opacity > 0);
      const du = [F.U[0] * F.s, F.U[1] * F.s, F.U[2] * F.s];
      // projection d'intensité maximale : calques à épaisseur (mm) sur les coupes demandées ; pas = voxel du calque
      const mipOf = L => { if (!(L.mip > 0) || (L.mipPlanes && !L.mipPlanes.includes(fr.key))) return null; const stp = Math.max(0.3, Math.min(...(L.vol.pixdim || [1, 1, 1]).slice(0, 3))), n = Math.min(120, Math.max(1, Math.round(L.mip / stp))); return { n, d: [F.N[0] * stp, F.N[1] * stp, F.N[2] * stp], o: -(n - 1) / 2 }; };
      const MIP = layers.map(mipOf);
      for (let y = 0; y < hgt; y++) {
        const p = this._toWorld(F, 0, y);
        for (let x = 0, o = y * w * 4; x < w; x++, o += 4) {
          let R = 0, G = 0, B = 0;
          const wx = p[0] + du[0] * x, wy = p[1] + du[1] * x, wz = p[2] + du[2] * x;
          for (const L of layers) {
            const Mv = L.M, vx = Mv[0] * wx + Mv[1] * wy + Mv[2] * wz + Mv[3], vy = Mv[4] * wx + Mv[5] * wy + Mv[6] * wz + Mv[7], vz = Mv[8] * wx + Mv[9] * wy + Mv[10] * wz + Mv[11];
            let rgb = null, a = L.opacity;
            if (L.kind === 'labels' || L.kind === 'mask') {
              const lv = SV.Vol.nearestVox(L.vol, vx, vy, vz); if (!lv) continue;
              const c = L.lut ? L.lut.get(lv) : null; if (L.lut && !c) continue;
              rgb = c || [255, 80, 80]; a *= c && c.length > 3 ? c[3] : 1;
            } else {
              let v;
              const mp = MIP[layers.indexOf(L)];
              if (mp) { v = NaN; for (let k = 0; k < mp.n; k++) { const t = mp.o + k, qx = Mv[0] * (wx + mp.d[0] * t) + Mv[1] * (wy + mp.d[1] * t) + Mv[2] * (wz + mp.d[2] * t) + Mv[3], qy = Mv[4] * (wx + mp.d[0] * t) + Mv[5] * (wy + mp.d[1] * t) + Mv[6] * (wz + mp.d[2] * t) + Mv[7], qz = Mv[8] * (wx + mp.d[0] * t) + Mv[9] * (wy + mp.d[1] * t) + Mv[10] * (wz + mp.d[2] * t) + Mv[11]; const u = SV.Vol.sampleVox(L.vol, qx, qy, qz, NaN); if (u === u && !(u <= v)) v = u; } }
              else v = SV.Vol.sampleVox(L.vol, vx, vy, vz, NaN);
              if (v !== v) continue;
              const t = (v - L.win[0]) / (L.win[1] - L.win[0] || 1), sh = shade(L.kind, t, v, L.threshold); if (!sh) continue;
              rgb = sh; a *= sh[3];
            }
            R += (rgb[0] - R) * a; G += (rgb[1] - G) * a; B += (rgb[2] - B) * a;
          }
          D[o] = R; D[o + 1] = G; D[o + 2] = B; D[o + 3] = 255;
        }
      }
      this._offCtx.putImageData(im, 0, 0);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(this._off, 0, 0, canvas.width, canvas.height);
      // superpositions vectorielles (pleine résolution)
      const Fs = this._frame(i, W, H); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (this.contours.length) this._drawContours(ctx, Fs, F);
      if (this.source) this._drawSource(ctx, Fs);
      for (const s of this.shafts) {
        const a = this._toScreen(Fs, s.a), b = this._toScreen(Fs, s.b), da = this._depth(Fs, s.a), db = this._depth(Fs, s.b);
        ctx.globalAlpha = this.markerAlpha; ctx.strokeStyle = s.color || 'rgba(120,220,255,.55)'; ctx.lineWidth = s.width || 1.5; ctx.setLineDash(s.dash ? [6, 4] : Math.min(Math.abs(da), Math.abs(db)) > 3 && da * db > 0 ? [3, 3] : []);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.globalAlpha = 1;
      const hT = this.markers.find(m => m.hline === 'tip'), hE = this.markers.find(m => m.hline === 'entry');
      if (hT && hE) { const a = this._toScreen(Fs, hT.p), b = this._toScreen(Fs, hE.p); ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.4; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.restore(); }   // trajectoire en cours de modification
      ctx.font = '11px ' + getComputedStyle(document.body).fontFamily;
      for (const m of this.markers) {
        const d = Math.abs(this._depth(Fs, m.p)), rad = m.r || 1.6; if (d > Math.max(2.2, rad + 0.5) && !m.always) continue;
        const q = this._toScreen(Fs, m.p), rr = Math.max(2.5, Math.sqrt(Math.max(0, rad * rad - d * d)) / Fs.s);
        ctx.globalAlpha = (d > Math.max(2.2, rad + 0.5) ? 0.35 : 1) * (m.solid ? 1 : this.markerAlpha);
        ctx.beginPath(); ctx.arc(q[0], q[1], rr, 0, Math.PI * 2);
        if (m.ring) {   // anneau : le métal du scanner reste visible au centre (vérification des plots)
          ctx.strokeStyle = 'rgba(0,0,0,.65)'; ctx.lineWidth = m.sel ? 4 : 3; ctx.stroke(); ctx.strokeStyle = m.color || 'rgba(255,200,80,.9)'; ctx.lineWidth = m.sel ? 2.2 : 1.4; ctx.stroke();
          if (m.halo) { ctx.save(); ctx.beginPath(); ctx.arc(q[0], q[1], rr + 4, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,255,255,.32)'; ctx.lineWidth = 4; ctx.stroke(); ctx.restore(); }   // sélection active : halo blanc
          if (m.num != null && rr >= 4.5) {   // numéro du plot dans l'anneau
            const fs = Math.max(7, Math.min(12, rr * (String(m.num).length > 1 ? 1.0 : 1.25))); ctx.save(); ctx.font = `700 ${fs}px ` + getComputedStyle(document.body).fontFamily; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText(String(m.num), q[0], q[1] + 0.5); ctx.fillStyle = m.sel ? '#bff0ff' : '#fff'; ctx.fillText(String(m.num), q[0], q[1] + 0.5); ctx.restore();
          }
        } else { ctx.fillStyle = m.color || 'rgba(255,200,80,.9)'; ctx.strokeStyle = m.sel ? '#fff' : 'rgba(0,0,0,.6)'; ctx.lineWidth = m.sel ? 2 : 1; ctx.fill(); ctx.stroke(); }
        ctx.globalAlpha = 1;
        if (m.label && (m.showLabel || d < 0.8) && !(m.always && d > Math.max(2.2, rad + 0.5))) { ctx.globalAlpha = Math.max(0.6, this.markerAlpha); ctx.fillStyle = '#fff'; ctx.shadowColor = '#000'; ctx.shadowBlur = 3; ctx.fillText(m.label, q[0] + rr + 3, q[1] + 4); ctx.shadowBlur = 0; ctx.globalAlpha = 1; }
      }
      for (const E of this.ellipsoids) this._drawEllipsoid(ctx, Fs, E);
      for (const R of this.rois) this._drawRoi(ctx, Fs, R);
      if (this.handles && !this.oblique) this._drawHandles(ctx, Fs, i);
      // réticule
      const q = this._toScreen(Fs, this.cursor); ctx.strokeStyle = 'rgba(76,201,240,.55)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(q[0], 0); ctx.lineTo(q[0], q[1] - 8); ctx.moveTo(q[0], q[1] + 8); ctx.lineTo(q[0], H); ctx.moveTo(0, q[1]); ctx.lineTo(q[0] - 8, q[1]); ctx.moveTo(q[0] + 8, q[1]); ctx.lineTo(W, q[1]); ctx.stroke();
      // repères d'orientation
      const neg = v => [-v[0], -v[1], -v[2]];
      ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = '600 12px ' + getComputedStyle(document.body).fontFamily;
      const lt = dirLetter(neg(fr.U)), rt = dirLetter(fr.U), tp = dirLetter(fr.V), bt = dirLetter(neg(fr.V));
      ctx.fillText(lt, 6, H / 2 + 4); ctx.fillText(rt, W - 8 - ctx.measureText(rt).width, H / 2 + 4); ctx.fillText(tp, W / 2 - ctx.measureText(tp).width / 2, 14); ctx.fillText(bt, W / 2 - ctx.measureText(bt).width / 2, H - 6);
      const along = fr.key === 'axial' ? `z = ${this.cursor[2].toFixed(1)} mm` : fr.key === 'coronal' ? `y = ${this.cursor[1].toFixed(1)} mm` : fr.key === 'sagittal' ? `x = ${this.cursor[0].toFixed(1)} mm` : (fr.sub || '');
      lab.textContent = `${fr.fr}${along ? ' · ' + along : ''}`;
    }
    /** contours : intersection d'un maillage avec le plan de coupe (segments), ou iso-contour 0,5 d'un masque d'étiquettes
     *  échantillonné en trilinéaire sur la grille de rendu (carrés marchants) */
    _drawContours(ctx, Fs, F) {
      for (const C of this.contours) {
        ctx.save(); ctx.strokeStyle = C.color || '#ff4d4d'; ctx.lineWidth = C.width || 1.3; ctx.globalAlpha = C.alpha == null ? 0.95 : C.alpha; ctx.beginPath();
        if (C.kind === 'mesh') {
          const P = C.pos, Fc = C.faces, N = Fs.N, c = Fs.c, d0 = N[0] * c[0] + N[1] * c[1] + N[2] * c[2];
          const dist = C._dist && C._dist.length === P.length / 3 ? C._dist : (C._dist = new Float32Array(P.length / 3));
          for (let v = 0, k = 0; v < dist.length; v++, k += 3) dist[v] = N[0] * P[k] + N[1] * P[k + 1] + N[2] * P[k + 2] - d0;
          const pt = (a, b) => { const t = dist[a] / (dist[a] - dist[b]), ka = 3 * a, kb = 3 * b; return this._toScreen(Fs, [P[ka] + (P[kb] - P[ka]) * t, P[ka + 1] + (P[kb + 1] - P[ka + 1]) * t, P[ka + 2] + (P[kb + 2] - P[ka + 2]) * t]); };
          for (let f = 0; f < Fc.length; f += 3) {
            const a = Fc[f], b = Fc[f + 1], e = Fc[f + 2], sa = dist[a] > 0, sb = dist[b] > 0, se = dist[e] > 0; if (sa === sb && sb === se) continue;
            const q = []; if (sa !== sb) q.push(pt(a, b)); if (sb !== se) q.push(pt(b, e)); if (se !== sa) q.push(pt(e, a));
            if (q.length >= 2) { ctx.moveTo(q[0][0], q[0][1]); ctx.lineTo(q[1][0], q[1][1]); }
          }
        } else if (C.kind === 'mask') {
          const w = F.W, hgt = F.H, g = new Float32Array(w * hgt), Mv = C._M || (C._M = M4.inv(C.vol.affine)), Vv = C.vol, dims = Vv.dims, data = Vv.data, inside = C.inside, nx = dims[0], nxy = dims[0] * dims[1];
          const at = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= dims[0] || y >= dims[1] || z >= dims[2]) ? 0 : inside[data[x + y * nx + z * nxy]] || 0;
          const du = [F.U[0] * F.s, F.U[1] * F.s, F.U[2] * F.s];
          for (let y = 0; y < hgt; y++) {
            const p = this._toWorld(F, 0, y);
            for (let x = 0; x < w; x++) {
              const wx = p[0] + du[0] * x, wy = p[1] + du[1] * x, wz = p[2] + du[2] * x;
              const vx = Mv[0] * wx + Mv[1] * wy + Mv[2] * wz + Mv[3], vy = Mv[4] * wx + Mv[5] * wy + Mv[6] * wz + Mv[7], vz = Mv[8] * wx + Mv[9] * wy + Mv[10] * wz + Mv[11];
              const x0 = Math.floor(vx), y0 = Math.floor(vy), z0 = Math.floor(vz), fx = vx - x0, fy = vy - y0, fz = vz - z0;
              const c00 = at(x0, y0, z0) * (1 - fx) + at(x0 + 1, y0, z0) * fx, c10 = at(x0, y0 + 1, z0) * (1 - fx) + at(x0 + 1, y0 + 1, z0) * fx;
              const c01 = at(x0, y0, z0 + 1) * (1 - fx) + at(x0 + 1, y0, z0 + 1) * fx, c11 = at(x0, y0 + 1, z0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1, z0 + 1) * fx;
              g[x + y * w] = (c00 * (1 - fy) + c10 * fy) * (1 - fz) + (c01 * (1 - fy) + c11 * fy) * fz;
            }
          }
          const sx = Fs.W / w, sy = Fs.H / hgt, lerp = (a, b) => (0.5 - a) / (b - a || 1e-6);
          for (let y = 0; y < hgt - 1; y++) for (let x = 0; x < w - 1; x++) {
            const a = g[x + y * w], b = g[x + 1 + y * w], cc = g[x + 1 + (y + 1) * w], dd = g[x + (y + 1) * w];
            const idx = (a > 0.5 ? 8 : 0) | (b > 0.5 ? 4 : 0) | (cc > 0.5 ? 2 : 0) | (dd > 0.5 ? 1 : 0); if (idx === 0 || idx === 15) continue;
            const T = [(x + lerp(a, b)) * sx, y * sy], R = [(x + 1) * sx, (y + lerp(b, cc)) * sy], B = [(x + lerp(dd, cc)) * sx, (y + 1) * sy], Lf = [x * sx, (y + lerp(a, dd)) * sy];
            const seg = (p, q) => { ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); };
            switch (idx) { case 1: case 14: seg(Lf, B); break; case 2: case 13: seg(B, R); break; case 3: case 12: seg(Lf, R); break; case 4: case 11: seg(T, R); break; case 5: seg(Lf, T); seg(B, R); break; case 6: case 9: seg(T, B); break; case 7: case 8: seg(Lf, T); break; case 10: seg(T, R); seg(Lf, B); break; }
          }
        }
        ctx.stroke(); ctx.restore();
      }
    }
    /** imagerie de source : ruban du cortex coupé, coloré par le poids de chaque sommet ; dipôles (bille si la coupe passe à
     *  moins de 6 mm, section de l'ellipsoïde de confiance) */
    _drawSource(ctx, Fs) {
      const S = this.source, N = Fs.N, c = Fs.c, d0 = N[0] * c[0] + N[1] * c[1] + N[2] * c[2], heat = SV.heatColor || (x => [255, 255 * x, 0]);
      ctx.save(); ctx.lineCap = 'round';
      for (const C of S.parts || []) {
        const P = C.pos, Fc = C.faces, w = C.w, bins = Array.from({ length: 8 }, () => []);
        const dist = C._dist && C._dist.length === P.length / 3 ? C._dist : (C._dist = new Float32Array(P.length / 3));
        for (let v = 0, k = 0; v < dist.length; v++, k += 3) dist[v] = N[0] * P[k] + N[1] * P[k + 1] + N[2] * P[k + 2] - d0;
        const pt = (a, b) => { const t = dist[a] / (dist[a] - dist[b]), ka = 3 * a, kb = 3 * b; return this._toScreen(Fs, [P[ka] + (P[kb] - P[ka]) * t, P[ka + 1] + (P[kb + 1] - P[ka + 1]) * t, P[ka + 2] + (P[kb + 2] - P[ka + 2]) * t]); };
        for (let f = 0; f < Fc.length; f += 3) {
          const a = Fc[f], b = Fc[f + 1], e = Fc[f + 2], x = Math.max(w[a], w[b], w[e]); if (x < 0.02) continue; const sa = dist[a] > 0, sb = dist[b] > 0, se = dist[e] > 0; if (sa === sb && sb === se) continue;
          const q = []; if (sa !== sb) q.push(pt(a, b)); if (sb !== se) q.push(pt(b, e)); if (se !== sa) q.push(pt(e, a)); if (q.length >= 2) bins[Math.min(7, Math.floor(x * 8))].push(q[0], q[1]);
        }
        bins.forEach((L, i) => { if (!L.length) return; const col = C.color || heat((i + 0.5) / 8); ctx.strokeStyle = `rgba(${col.map(Math.round).join(',')},${C.color ? 0.35 + 0.08 * i : 0.95})`; ctx.lineWidth = 3.2; ctx.beginPath(); for (let k = 0; k < L.length; k += 2) { ctx.moveTo(L[k][0], L[k][1]); ctx.lineTo(L[k + 1][0], L[k + 1][1]); } ctx.stroke(); });
      }
      for (const D of S.dips || []) {
        const rgb = D.color, d = Math.abs(this._depth(Fs, D.p));
        if (D.ci) this._drawEllipsoid(ctx, Fs, { c: D.p, axes: D.ci.axes, r: D.ci.r, color: rgb, style: 'validated' });
        if (D.ball && d < 6) { const q = this._toScreen(Fs, D.p); ctx.globalAlpha = d < 2 ? 1 : 0.45; ctx.beginPath(); ctx.arc(q[0], q[1], 5, 0, Math.PI * 2); ctx.fillStyle = `rgb(${rgb.join(',')})`; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 1.5; ctx.fill(); ctx.stroke(); ctx.globalAlpha = 1; }
      }
      ctx.restore();
    }
    _drawEllipsoid(ctx, F, E) {
      const u = E.u, ia = E.axes ? 0 : 1 / (E.a * E.a), ib = E.axes ? 0 : 1 / (E.b * E.b);
      const Q = E.axes ? v => { const o = [0, 0, 0]; E.axes.forEach((a, k) => { const t = dot(a, v) / (E.r[k] * E.r[k]); o[0] += t * a[0]; o[1] += t * a[1]; o[2] += t * a[2]; }); return o; }   // ellipsoïde quelconque (axes, demi-axes r)
        : v => { const k = (ia - ib) * dot(u, v); return [v[0] * ib + k * u[0], v[1] * ib + k * u[1], v[2] * ib + k * u[2]]; };
      const d = [F.c[0] - E.c[0], F.c[1] - E.c[1], F.c[2] - E.c[2]], QU = Q(F.U), QV = Q(F.V), Qd = Q(d);
      const A11 = dot(F.U, QU), A12 = dot(F.U, QV), A22 = dot(F.V, QV), b1 = dot(F.U, Qd), b2 = dot(F.V, Qd), c0 = dot(d, Qd), det = A11 * A22 - A12 * A12; if (det <= 1e-12) return;
      const s0 = -(A22 * b1 - A12 * b2) / det, t0 = -(-A12 * b1 + A11 * b2) / det, r = 1 - (c0 + b1 * s0 + b2 * t0); if (r <= 1e-4) return;   // le plan ne coupe pas le volume
      const tr = (A11 + A22) / 2, df = Math.sqrt(Math.max(0, (A11 - A22) * (A11 - A22) / 4 + A12 * A12)), l1 = tr + df, l2 = tr - df;
      const ang = Math.abs(A12) < 1e-12 ? (A11 >= A22 ? 0 : Math.PI / 2) : Math.atan2(l1 - A11, A12), e1 = [Math.cos(ang), Math.sin(ang)], e2 = [-e1[1], e1[0]], r1 = Math.sqrt(r / l1), r2 = Math.sqrt(r / Math.max(1e-9, l2));
      const col = E.color || [225, 45, 55], st = E.style || 'done', pts = [];
      for (let i = 0; i <= 48; i++) { const th = i / 48 * Math.PI * 2, s = s0 + r1 * Math.cos(th) * e1[0] + r2 * Math.sin(th) * e2[0], t = t0 + r1 * Math.cos(th) * e1[1] + r2 * Math.sin(th) * e2[1]; pts.push(this._toScreen(F, [F.c[0] + F.U[0] * s + F.V[0] * t, F.c[1] + F.U[1] * s + F.V[1] * t, F.c[2] + F.U[2] * s + F.V[2] * t])); }
      ctx.save(); ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath();
      ctx.fillStyle = `rgba(${col.join(',')},${{ planned: 0.1, validated: 0.18, done: 0.3, rejected: 0.06 }[st] || 0.2})`; ctx.fill();
      ctx.setLineDash(st === 'planned' ? [4, 3] : st === 'rejected' ? [2, 3] : []); ctx.lineWidth = E.sel ? 2.4 : 1.6;
      ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth += 1.2; ctx.stroke(); ctx.lineWidth -= 1.2; ctx.strokeStyle = `rgba(${col.join(',')},.95)`; ctx.stroke(); ctx.setLineDash([]);
      if (E.label && E.sel) { const top = pts.reduce((m, q) => q[1] < m[1] ? q : m, pts[0]); ctx.font = '600 11px ' + getComputedStyle(document.body).fontFamily; ctx.fillStyle = `rgb(${col.join(',')})`; ctx.shadowColor = '#000'; ctx.shadowBlur = 3; ctx.fillText(E.label, top[0] + 4, top[1] - 4); }
      ctx.restore();
    }
    _drawRoi(ctx, Fs, R) {
      const d = this._depth(Fs, R.p), q = this._toScreen(Fs, R.p), col = R.color || '#ff5ad1';
      const label = (x, y) => { if (!R.label) return; ctx.font = '600 12px ' + getComputedStyle(document.body).fontFamily; ctx.fillStyle = col; ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.fillText(R.label, x, y); ctx.shadowBlur = 0; };
      if (R.kind === 'arrow') {
        const ad = Math.abs(d); if (ad > 8) return; ctx.globalAlpha = ad <= 2 ? 1 : Math.max(0.25, 1 - (ad - 2) / 6);
        const L = 38, ux = -0.7071, uy = -0.7071, tx = q[0] + ux * L, ty = q[1] + uy * L, hx = q[0] + ux * 11, hy = q[1] + uy * 11, px = -uy * 6, py = ux * 6;
        for (const [w, c] of [[5, 'rgba(0,0,0,.65)'], [2.4, col]]) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke(); }
        ctx.fillStyle = col; ctx.strokeStyle = 'rgba(0,0,0,.65)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(q[0] - ux * 1, q[1] - uy * 1); ctx.lineTo(hx + px, hy + py); ctx.lineTo(hx - px, hy - py); ctx.closePath(); ctx.fill(); ctx.stroke();
        label(tx - 4 - (R.label ? ctx.measureText(R.label).width : 0), ty - 4); ctx.globalAlpha = 1; return;
      }
      const r = R.r || 5; if (Math.abs(d) >= r) return;
      const rr = Math.max(3, Math.sqrt(r * r - d * d) / Fs.s);
      ctx.setLineDash(R.sel ? [] : []); ctx.beginPath(); ctx.arc(q[0], q[1], rr, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0,0,0,.65)'; ctx.lineWidth = 4.5; ctx.stroke(); ctx.strokeStyle = col; ctx.lineWidth = 2.2; ctx.stroke();
      label(q[0] + rr * 0.72 + 4, q[1] - rr * 0.72 - 4);
    }
    /** poignées d'ajustement : H = { box: { c: [x,y,z], h: [hx,hy,hz] } (boîte alignée sur les axes du monde), color,
     *  onChange(kind, data, done) — kind 'scale' { axes: [a…], s }, 'rotate' { axis, deg }, 'translate' { d: [dx,dy,dz] } } ou null */
    setHandles(H) { this.handles = H || null; this.el.classList.toggle('with-handles', !!H); this.draw(); }
    /** rectangle de la boîte dans la vue i (coupes orthogonales : U, V = ± axes du monde) */
    _boxRect(F) {
      const H = this.handles; if (!H || !H.box) return null; const ax = v => { for (let k = 0; k < 3; k++) if (Math.abs(v[k]) > 0.99) return k; return -1; };
      const a = ax(F.U), b = ax(F.V); if (a < 0 || b < 0) return null; const c = H.box.c, h = H.box.h;
      const p0 = this._toScreen(F, c), su = F.U[a], sv = F.V[b], ux = h[a] / F.s, vy = h[b] / F.s;
      return { a, b, su, sv, cx: p0[0], cy: p0[1], x0: p0[0] - ux, x1: p0[0] + ux, y0: p0[1] - vy, y1: p0[1] + vy, n: 3 - a - b };
    }
    _handlePts(R) {
      const mx = (R.x0 + R.x1) / 2, my = (R.y0 + R.y1) / 2;
      return [{ k: 'l', x: R.x0, y: my, cur: 'ew-resize' }, { k: 'r', x: R.x1, y: my, cur: 'ew-resize' }, { k: 't', x: mx, y: R.y0, cur: 'ns-resize' }, { k: 'b', x: mx, y: R.y1, cur: 'ns-resize' },
        { k: 'tl', x: R.x0, y: R.y0, cur: 'nwse-resize' }, { k: 'tr', x: R.x1, y: R.y0, cur: 'nesw-resize' }, { k: 'bl', x: R.x0, y: R.y1, cur: 'nesw-resize' }, { k: 'br', x: R.x1, y: R.y1, cur: 'nwse-resize' }, { k: 'rot', x: mx, y: R.y0 - 24, cur: 'grab' }];
    }
    _hitHandle(i, x, y, W, H) {
      const R = this._boxRect(this._frame(i, W, H)); if (!R) return null;
      for (const h of this._handlePts(R)) if (Math.hypot(h.x - x, h.y - y) <= 9) return Object.assign({ R }, h);
      if (x > R.x0 + 8 && x < R.x1 - 8 && y > R.y0 + 8 && y < R.y1 - 8) return { k: 'move', R, cur: 'move' };
      return null;
    }
    _drawHandles(ctx, Fs, i) {
      const R = this._boxRect(Fs); if (!R) return; const col = this.handles.color || '#7fe3ff';
      ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.setLineDash([6, 4]); ctx.strokeRect(R.x0, R.y0, R.x1 - R.x0, R.y1 - R.y0); ctx.setLineDash([]);
      const mx = (R.x0 + R.x1) / 2; ctx.beginPath(); ctx.moveTo(mx, R.y0); ctx.lineTo(mx, R.y0 - 16); ctx.stroke();
      for (const h of this._handlePts(R)) {
        ctx.beginPath(); if (h.k === 'rot') ctx.arc(h.x, h.y, 6, 0, Math.PI * 2); else ctx.rect(h.x - 5, h.y - 5, 10, 10);
        ctx.fillStyle = h.k === 'rot' ? 'rgba(255,207,74,.95)' : (h.k.length === 1 ? col : '#ffffff'); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 1; ctx.stroke();
      }
      if (this.handles.label) { ctx.font = '11px ' + getComputedStyle(document.body).fontFamily; ctx.fillStyle = col; ctx.shadowColor = '#000'; ctx.shadowBlur = 3; ctx.fillText(this.handles.label, R.x0 + 4, R.y1 - 5); }
      ctx.restore();
    }
    /** électrode de l'encart sous le pointeur (nom) */
    _insetHit(e) {
      const H = this._insetHits; if (!H || !this.insetCv) return null; const r = this.insetCv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; let best = null, bd = 7;
      for (const s of H) for (let k = 0; k + 1 < s.pts.length; k++) { const [ax, ay] = s.pts[k], [bx, by] = s.pts[k + 1], vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1, t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / L2)), d = Math.hypot(ax + vx * t - x, ay + vy * t - y); if (d < bd) { bd = d; best = s.name; } }
      return best;
    }
    _drawInfo() {
      if (!this.ref) { this.info.textContent = ''; return; }
      const c = this.cursor, parts = [`${c.map(v => v.toFixed(1)).join(', ')} mm`];
      for (const L of this.layers) {
        if (!L.visible) continue; const v = M4.apply(L.M, c[0], c[1], c[2]);
        if (L.kind === 'labels' || L.kind === 'mask') { const lv = SV.Vol.nearestVox(L.vol, v[0], v[1], v[2]); if (lv && L.name) parts.push(`${L.name} : ${this.labelName ? this.labelName(L, lv) : lv}`); }
        else { const x = SV.Vol.sampleVox(L.vol, v[0], v[1], v[2], NaN); if (x === x) parts.push(`${L.name || L.id} ${Math.round(x * 10) / 10}`); }
      }
      if (this._wlShow) { const L = this._wlLayer(); if (L && L.win) parts.push(`◐ ${L.name || L.id} : fenêtre ${Math.round(L.win[1] - L.win[0])} · niveau ${Math.round((L.win[0] + L.win[1]) / 2)}`); }
      this.info.textContent = parts.join(' · ');
    }
    /** encart : nuage de points du cortex (verre) et électrodes, vues choisies côte à côte */
    _drawInset() {
      const D = this.inset, cv = this.insetCv; if (!D) return;
      const views = D.views || [], dpr = Math.min(2, window.devicePixelRatio || 1), vw = Math.round(Math.max(88, Math.min(150, (this.el.clientWidth - 24) / (2 * Math.max(1, views.length))))), w = vw * views.length, h = Math.round(vw * 0.8);
      if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px'; }
      const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(8,10,14,.82)'; g.fillRect(0, 0, w, h);
      const hits = []; this._insetHits = hits;
      views.forEach((V0, k) => {
        const U = V0.U, V = V0.V, P = D.points; let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
        if (D.bounds && D.bounds[k]) [u0, u1, v0, v1] = D.bounds[k];
        else { for (let i = 0; i < P.length; i += 3) { const u = P[i] * U[0] + P[i + 1] * U[1] + P[i + 2] * U[2], v = P[i] * V[0] + P[i + 1] * V[1] + P[i + 2] * V[2]; if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v; } (D.bounds = D.bounds || [])[k] = [u0, u1, v0, v1]; }
        const pad = 6, sc = Math.min((vw - 2 * pad) / (u1 - u0 || 1), (h - 2 * pad - 10) / (v1 - v0 || 1)), ox = k * vw + vw / 2 - sc * (u0 + u1) / 2, oy = (h + 8) / 2 + sc * (v0 + v1) / 2;
        const X = p => ox + sc * (p[0] * U[0] + p[1] * U[1] + p[2] * U[2]), Y = p => oy - sc * (p[0] * V[0] + p[1] * V[1] + p[2] * V[2]);
        g.fillStyle = 'rgba(210,215,225,.07)';
        for (let i = 0; i < P.length; i += 3) { const x = ox + sc * (P[i] * U[0] + P[i + 1] * U[1] + P[i + 2] * U[2]), y = oy - sc * (P[i] * V[0] + P[i + 1] * V[1] + P[i + 2] * V[2]); g.fillRect(x, y, 1.2, 1.2); }
        for (const e of (D.elecs || []).slice().sort((a, b) => (a.sel ? 1 : 0) - (b.sel ? 1 : 0))) {
          if (!e.pts.length) continue; g.strokeStyle = e.sel ? '#ffcf4a' : 'rgba(190,205,225,.78)'; g.lineWidth = e.sel ? 2.4 : 1.3;
          g.beginPath(); g.moveTo(X(e.pts[0]), Y(e.pts[0])); for (const p of e.pts) g.lineTo(X(p), Y(p)); g.stroke();
          hits.push({ name: e.name, pts: e.pts.map(p => [X(p), Y(p)]) });
          const q = e.pts[e.pts.length - 1];
          if (e.sel) { g.fillStyle = '#ffcf4a'; for (const p of e.pts) { g.beginPath(); g.arc(X(p), Y(p), 1.6, 0, 7); g.fill(); } g.fillStyle = '#fff'; g.font = '600 10px ' + getComputedStyle(document.body).fontFamily; g.fillText(e.name, X(q) + 3, Y(q) - 3); }
          else if (!this.insetCv.classList.contains('small')) { g.fillStyle = 'rgba(210,222,240,.85)'; g.font = '9px ' + getComputedStyle(document.body).fontFamily; g.fillText(e.name, X(q) + 2, Y(q) - 2); }
        }
        if (D.cursor) { g.strokeStyle = '#4cc9f0'; g.lineWidth = 1.5; g.beginPath(); g.arc(X(D.cursor), Y(D.cursor), 3.5, 0, 7); g.stroke(); }
        g.fillStyle = 'rgba(255,255,255,.6)'; g.font = '10px ' + getComputedStyle(document.body).fontFamily; g.fillText(V0.title || '', k * vw + 5, 11);
      });
    }

    // ---------------------------------------------------------------- interaction
    _wlLayer() { const L = this.layers.find(x => x.id === this.wlTarget && x.kind !== 'labels' && x.kind !== 'mask'); return L || this.layers.find(x => x.kind !== 'labels' && x.kind !== 'mask'); }
    _bind(i) {
      const { canvas } = this.panes[i];
      const at = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top, r.width, r.height]; };
      let drag = null;
      canvas.addEventListener('contextmenu', e => e.preventDefault());
      canvas.addEventListener('pointerdown', e => {
        this.el.focus({ preventScroll: true }); this._hover = i;
        canvas.setPointerCapture(e.pointerId); const [x, y, W, H] = at(e), F = this._frame(i, W, H);
        // édition des plots : un anneau se saisit quel que soit le mode de la souris (sauf contraste) ; ailleurs, un clic
        // sans déplacement ajoute un plot, un glisser garde l'action du mode (curseur ou déplacement de la vue)
        if (this.handles && e.button === 0 && !e.shiftKey && !this.oblique) {   // poignées d'ajustement du recalage (v4.21)
          const hh = this._hitHandle(i, x, y, W, H);
          if (hh) { drag = { kind: 'handle', h: hh, x, y, F }; canvas.style.cursor = hh.k === 'rot' ? 'grabbing' : hh.cur; return; }
        }
        if (this.editMarkers && this.onMarkerEdit && (e.button === 0 || e.button === 2) && !e.shiftKey && this.mode !== 'wl') {
          const m = this._hitMarker(i, x, y, W, H);
          if (m && e.button === 2) { this.onMarkerEdit('delete', m, null, this.frames[i].key); return; }
          if (m) { drag = { kind: 'marker', m, x, y, p0: m.p.slice(), off: this._depth(F, m.p), moved: false }; canvas.style.cursor = 'grabbing'; return; }
          if (e.button === 0 && this.editAdd !== false) { drag = { kind: 'add', x, y, p: this._toWorld(F, x, y), then: this.mode === 'pan' ? 'pan' : 'cursor', pan: this.pan[i].slice(), F }; return; }
        }
        if (e.button === 1 || e.button === 2 || (e.button === 0 && this.mode === 'pan')) { drag = { kind: 'pan', x, y, pan: this.pan[i].slice(), F }; return; }
        if ((e.shiftKey || this.mode === 'wl') && this._wlLayer()) { const L = this._wlLayer(); drag = { kind: 'wl', x, y, win: L.win.slice(), L }; this._wlShow = true; this._drawInfo(); return; }
        const p = this._toWorld(F, x, y);
        if (this.pickMode && this.onPick) { this.onPick(p, this.frames[i].key, e); return; }
        drag = { kind: 'cursor' }; this.setCursor(p);
      });
      canvas.addEventListener('pointermove', e => {
        this._hover = i;
        if (!drag) { const [x, y, W, H] = at(e); if (this.handles && !this.oblique) { const hh = this._hitHandle(i, x, y, W, H); if (hh) { canvas.style.cursor = hh.cur; return; } } if (this.editMarkers) { canvas.style.cursor = this._hitMarker(i, x, y, W, H) ? 'grab' : 'crosshair'; } else if (canvas.style.cursor) canvas.style.cursor = ''; return; }
        const [x, y, W, H] = at(e);
        if (drag.kind === 'handle') { this._dragHandle(drag, x, y, false); return; }
        if (drag.kind === 'marker') { const F = this._frame(i, W, H), q = this._toWorld(F, x, y); if (Math.hypot(x - drag.x, y - drag.y) > 2) drag.moved = true; drag.m.p = [q[0] + F.N[0] * drag.off, q[1] + F.N[1] * drag.off, q[2] + F.N[2] * drag.off]; this.draw();
          if (drag.m.live && this.onMarkerEdit && !this._liveRaf) { const m = drag.m; this._liveRaf = requestAnimationFrame(() => { this._liveRaf = 0; if (drag && drag.m === m) this.onMarkerEdit('drag', m, m.p.slice(), this.frames[i].key); }); }
          return; }
        if (drag.kind === 'add') { if (Math.hypot(x - drag.x, y - drag.y) > 4) { if (drag.then === 'pan') drag = { kind: 'pan', x: drag.x, y: drag.y, pan: drag.pan, F: drag.F }; else { drag = { kind: 'cursor' }; this.setCursor(this._toWorld(this._frame(i, W, H), x, y)); return; } } else return; }
        if (drag.kind === 'pan') { const F = drag.F; this.pan[i] = [drag.pan[0] - (x - drag.x) * F.s, drag.pan[1] + (y - drag.y) * F.s]; this.draw(); }
        else if (drag.kind === 'wl') {
          // horizontal : contraste (largeur de fenêtre, vers la droite = plus contrasté) ; vertical : luminosité (vers le haut = plus clair)
          const L = drag.L, w0 = drag.win[1] - drag.win[0], c0 = (drag.win[0] + drag.win[1]) / 2, ww = Math.max(1e-3, w0 * Math.exp(-(x - drag.x) / 180)), c = c0 + (y - drag.y) * w0 / 260;
          L.win = [c - ww / 2, c + ww / 2]; this.draw();
        } else if (drag.kind === 'cursor') { const F = this._frame(i, W, H); this.setCursor(this._toWorld(F, x, y)); }
      });
      canvas.addEventListener('pointerup', e => {
        if (drag && drag.kind === 'handle') { const [x, y] = at(e); this._dragHandle(drag, x, y, true); drag = null; canvas.style.cursor = ''; return; }
        if (drag && drag.kind === 'marker') { const m = drag.m, moved = drag.moved; canvas.style.cursor = 'grab'; drag = null; if (this.onMarkerEdit) this.onMarkerEdit(moved ? 'move' : 'select', m, m.p, this.frames[i].key); return; }
        if (drag && drag.kind === 'add') { const p = drag.p; drag = null; if (this.onMarkerEdit) this.onMarkerEdit('add', null, p, this.frames[i].key); return; }
        if (drag && drag.kind === 'wl' && this.onWindow) this.onWindow(drag.L); if (drag && drag.kind === 'wl') { this._wlShow = false; setTimeout(() => this._drawInfo(), 1500); } drag = null; });
      canvas.addEventListener('dblclick', () => this.resetView());
      canvas.addEventListener('wheel', e => {
        e.preventDefault(); this._hover = i;
        if (e.ctrlKey || e.metaKey) { this.setZoom(this.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)); return; }
        this._slice(i, (e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 5 : 1));
      }, { passive: false });
    }
    /** poignée en cours de glisser → changement demandé (échelle, rotation, déplacement), relatif au début du glisser */
    _dragHandle(drag, x, y, done) {
      const H = this.handles, h = drag.h, R = h.R, F = drag.F; if (!H || !H.onChange) return; const sgn = v => v < 0 ? -1 : 1;
      if (h.k === 'move') { const du = (x - drag.x) * F.s, dv = -(y - drag.y) * F.s, d = [0, 0, 0]; d[R.a] += du * sgn(F.U[R.a]); d[R.b] += dv * sgn(F.V[R.b]); H.onChange('translate', { d }, done); return; }
      if (h.k === 'rot') { const a0 = Math.atan2(drag.y - R.cy, drag.x - R.cx), a1 = Math.atan2(y - R.cy, x - R.cx); let deg = (a1 - a0) * 180 / Math.PI; // sens écran → sens monde selon l'orientation du repère
        const flip = (F.U[R.a] * F.V[R.b]) * ((R.a + 1) % 3 === R.b ? 1 : -1); H.onChange('rotate', { axis: R.n, deg: -deg * flip }, done); return; }
      const hu = Math.max(2, (R.x1 - R.x0) / 2), hv = Math.max(2, (R.y1 - R.y0) / 2), su = Math.abs(x - R.cx) / hu, sv = Math.abs(y - R.cy) / hv;
      if (h.k === 'l' || h.k === 'r') H.onChange('scale', { axes: [R.a], s: su }, done);
      else if (h.k === 't' || h.k === 'b') H.onChange('scale', { axes: [R.b], s: sv }, done);
      else H.onChange('scale', { axes: [R.a, R.b], s: (su + sv) / 2 }, done);
    }
    /** coupe suivante dans la vue i (pas = taille du voxel de référence) */
    _slice(i, n) { const F = this._frame(i, 1, 1), vis = this.layers.filter(L => L.visible && L.opacity > 0 && L.kind !== 'labels' && L.kind !== 'mask'), step = Math.max(0.2, Math.min(this.ref ? Math.min(...this.ref.pixdim) : 1, ...vis.map(L => Math.min(...(L.vol.pixdim || [1, 1, 1]).slice(0, 3))))), p = this.cursor.slice(); for (let k = 0; k < 3; k++) p[k] += F.N[k] * n * step; this.setCursor(p); }
    _key(e) {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); this._slice(this._hover == null ? 0 : this._hover, (e.key === 'ArrowUp' || e.key === 'PageUp' ? 1 : -1) * (e.shiftKey || /Page/.test(e.key) ? 5 : 1)); }
      else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && this.onStep) { e.preventDefault(); this.onStep(e.key === 'ArrowRight' ? 1 : -1); }
      else if (e.key === 'Escape' && this.maxIdx != null) this.maximize(null);
    }
    /** image PNG de la mosaïque (coupes visibles côte à côte) */
    snapshot() {
      const cs = this.panes.filter((p, k) => this.maxIdx == null || k === this.maxIdx).map(p => p.canvas), W = cs.reduce((s, c) => s + c.width, 0), H = Math.max(...cs.map(c => c.height));
      const out = document.createElement('canvas'); out.width = W; out.height = H; const g = out.getContext('2d'); let x = 0; for (const c of cs) { g.drawImage(c, x, 0); x += c.width; }
      if (this.inset && !this.insetCv.hidden) g.drawImage(this.insetCv, 8, 8);
      return out.toDataURL('image/png');
    }
    destroy() { this._ro.disconnect(); if (this._raf) cancelAnimationFrame(this._raf); this._raf = null; this.destroyed = true; this.el.innerHTML = ''; this.el.classList.remove('sv-slices', 'oblique', 'has-max', 'mode-wl', 'mode-pan', 'tall'); }
  }
  Slices.CMAPS = CMAPS; Slices.CMAP_FR = CMAP_FR; Slices.shade = shade; Slices.dirLetter = dirLetter;
  SV.Slices = Slices;
})(window.SV = window.SV || {});
