/* EpiScope — viewer_slices3d.js : imagerie du patient dans la vue 3D (fusion du modèle et des images réelles).
 *   - trois coupes orthogonales texturées (axiale, coronale, sagittale) passant par le curseur de la visionneuse en coupes,
 *     image de base (T1), superposition (TEP, FLAIR, CT…) et parcellation VEP colorée par l'activation ;
 *   - découpe du cortex et des structures profondes par un plan (clip : 'axial' garde le dessous du plan axial,
 *     'coronal' l'arrière, 'sagittal' le côté opposé à la caméra), à la manière d'une neuronavigation.
 * Réglages par vue : cfg.slices3d (bool), cfg.clip ('' | 'axial' | 'coronal' | 'sagittal').                          */
(function (SV) {
  'use strict';
  const P = SV.Viewer3D && SV.Viewer3D.prototype; if (!P) return;
  const RES = 256;   // échantillons par côté de coupe (1 mm pour un champ de 256 mm) ; 384 dès qu'une image sous-millimétrique (CT) est visible (v4.21)
  const RES_FINE = 384;
  const finest = S => { let f = Infinity; for (const L of [S.base].concat(S.overlays || (S.overlay ? [S.overlay] : []))) if (L && L.vol && L.vol.pixdim) f = Math.min(f, ...L.vol.pixdim.slice(0, 3).map(Math.abs).filter(x => x > 0)); return f; };
  Object.assign(P, {
    /** source des coupes : { base: {vol, T?, win}, overlays?: [{vol, T?, win, kind, opacity, threshold}] (ou overlay), labels?: {vol, color(l) → [r,g,b,a]|null, opacity}, fov } */
    setSliceSource(src) { this._sl = src ? Object.assign({ fov: 256 }, src) : null; this._slDirty = true; if (!src) this._slClear(); else this._slEnsure(); },
    setSliceCursor(p) { this._slCursor = p ? p.slice() : null; this._slDirty = true; if (this.mode === 'canvas') this._draw && this._draw(); },
    refreshSlices() { this._slDirty = true; },
    /** repère actif (curseur des coupes, paire choisie en stimulation / thermocoagulation) : halo blanc visible à travers le
     *  cortex, de taille fixe en mm (size, 12 par défaut) ; p (espace de la vue) ou null */
    setProbe(p, o) {
      if (this.mode !== 'webgl') return; const THREE = window.THREE;
      if (!this._probe) {
        const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d');
        const gr = g.createRadialGradient(64, 64, 26, 64, 64, 63); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.62, 'rgba(255,255,255,.30)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
        g.beginPath(); g.arc(64, 64, 46, 0, Math.PI * 2); g.lineWidth = 12; g.strokeStyle = 'rgba(0,0,0,.42)'; g.stroke(); g.lineWidth = 6.5; g.strokeStyle = '#ffffff'; g.stroke();
        const tex = new THREE.CanvasTexture(cv); if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
        const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true }));
        m.renderOrder = 20; m.userData = { kind: 'probe' }; m.raycast = () => {}; this.root.add(m); this._probe = m;
      }
      this._probe.scale.setScalar((o && o.size) || 12);
      this._probeOn = !!p; this._probe.visible = !!p; if (p) this._probe.position.set(p[0], p[1], p[2]);
    },
    _slClear() { if (!this._slMeshes) return; for (const m of Object.values(this._slMeshes)) { this.root.remove(m); m.geometry.dispose(); m.material.map && m.material.map.dispose(); m.material.dispose(); } this._slMeshes = null; this._slRes = 0; },
    _slEnsure(res) {
      if (this.mode !== 'webgl') return; const THREE = window.THREE; res = res || (this._sl ? this._slResOf(this._sl) : RES);
      if (this._slMeshes && this._slRes === res) return; const vis = this._slMeshes ? Object.values(this._slMeshes).some(m => m.visible) : false; this._slClear(); this._slMeshes = {}; this._slRes = res; this._slDirty = true;
      for (const k of ['axial', 'coronal', 'sagittal']) {
        const data = new Uint8Array(res * res * 4), tex = new THREE.DataTexture(data, res, res, THREE.RGBAFormat); tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
        const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, transparent: true, alphaTest: 0.02, depthWrite: true });
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); m.renderOrder = 0; m.frustumCulled = false; m.visible = vis; m.userData = { kind: 'slice', plane: k, data };
        this.root.add(m); this._slMeshes[k] = m;
      }
    },
    /** résolution des textures : fine dès qu'une image visible a des voxels < 0,85 mm (artefacts métalliques du CT) */
    _slResOf(S) { const f = finest(S); return f < 0.85 && S.fov / f > RES ? RES_FINE : RES; },
    /** recalcule les textures (curseur ou source changés) ; échantillonnage CPU, 3 × 65 000 points (3 × 147 000 en rendu fin) */
    _slUpdate() {
      if (!this._sl || !this._slMeshes || !this._slCursor || !this._slDirty) return;
      const want = this._slResOf(this._sl); if (want !== this._slRes) this._slEnsure(want); this._slDirty = false;
      const S = this._sl, c = this._slCursor, fov = S.fov, h = fov / 2, RES = this._slRes, M4 = SV.Mat4, CM = (SV.Slices && SV.Slices.CMAPS) || {}, SH = SV.Slices && SV.Slices.shade;
      const prep = L => L ? Object.assign({ M: M4.mul(M4.inv(L.vol.affine), L.T ? M4.inv(M4.from(L.T)) : M4.identity()) }, L) : null;
      const B = prep(S.base), Os = (S.overlays || (S.overlay ? [S.overlay] : [])).map(prep), Lb = prep(S.labels);
      const axes = { axial: [0, 1, 2], coronal: [0, 2, 1], sagittal: [1, 2, 0] };
      for (const k in axes) {
        const [u, v, n] = axes[k], m = this._slMeshes[k], data = m.userData.data;
        for (let j = 0; j < RES; j++) for (let i = 0; i < RES; i++) {
          const p = c.slice(); p[u] = c[u] - h + (i + 0.5) * fov / RES; p[v] = c[v] - h + (j + 0.5) * fov / RES; const o = (j * RES + i) * 4;
          let R = 0, G = 0, Bc = 0, A = 0;
          if (B) { const q = M4.apply(B.M, p[0], p[1], p[2]), x = SV.Vol.sampleVox(B.vol, q[0], q[1], q[2], NaN); if (x === x) { const t = Math.max(0, Math.min(1, (x - B.win[0]) / (B.win[1] - B.win[0] || 1))); R = G = Bc = 255 * t; A = t > 0.02 ? 255 : 0; } }
          if (A) for (const O of Os) { const q = M4.apply(O.M, p[0], p[1], p[2]), x = SV.Vol.sampleVox(O.vol, q[0], q[1], q[2], NaN); if (x !== x) continue; const t = (x - O.win[0]) / (O.win[1] - O.win[0] || 1), sh = O.kind === 'gray' ? (t > 0.02 && (O.threshold == null || x >= O.threshold) ? CM.gray(t).concat([Math.min(1, t * 3)]) : null) : SH ? SH(O.kind, t, x, O.threshold) : null; if (sh) { const a = O.opacity * sh[3]; R += (sh[0] - R) * a; G += (sh[1] - G) * a; Bc += (sh[2] - Bc) * a; } }
          if (Lb && A) { const q = M4.apply(Lb.M, p[0], p[1], p[2]), l = SV.Vol.nearestVox(Lb.vol, q[0], q[1], q[2]); if (l) { const col = Lb.color(l); if (col) { const a = (Lb.opacity == null ? 0.6 : Lb.opacity) * (col[3] == null ? 1 : col[3]); R += (col[0] - R) * a; G += (col[1] - G) * a; Bc += (col[2] - Bc) * a; } } }
          data[o] = R; data[o + 1] = G; data[o + 2] = Bc; data[o + 3] = A;
        }
        m.material.map.needsUpdate = true;
        // plan : centré sur le curseur, orienté selon la coupe
        m.scale.set(fov, fov, 1); m.position.set(c[0], c[1], c[2]); m.rotation.set(0, 0, 0);
        if (k === 'coronal') m.rotation.set(Math.PI / 2, 0, 0); else if (k === 'sagittal') m.rotation.set(Math.PI / 2, Math.PI / 2, 0);
      }
    },
    /** appliqué par _applyCfg avant le rendu de chaque vue */
    _applySliceCfg(cfg) {
      const THREE = window.THREE, on = !!cfg.slices3d && !!this._sl && !!this._slCursor;
      if (this._slMeshes) { if (on) this._slUpdate(); for (const k in this._slMeshes) this._slMeshes[k].visible = on; }
      // découpe du cortex et des structures profondes par le plan du curseur
      const c = this._slCursor, key = cfg.clip && c ? cfg.clip + ':' + c.map(v => v.toFixed(1)).join(',') : '';
      let planes = [];
      if (key) {
        if (!this._clipCache || this._clipCache.key !== key) {
          const n = cfg.clip === 'axial' ? new THREE.Vector3(0, 0, -1) : cfg.clip === 'coronal' ? new THREE.Vector3(0, -1, 0) : new THREE.Vector3(1, 0, 0);
          const pl = new THREE.Plane(n, 0); pl.constant = -n.dot(new THREE.Vector3(c[0], c[1], c[2])); this._clipCache = { key, planes: [pl] };
        }
        planes = this._clipCache.planes;
        if (cfg.clip === 'sagittal') { const pl = planes[0], cam = this._curCam; if (cam) { const side = cam.position.x > c[0] ? 1 : -1; if (Math.sign(-pl.normal.x) !== side) { pl.normal.x = -pl.normal.x; pl.constant = -pl.normal.x * c[0]; } } }
      }
      const set = mat => { const want = planes.length ? planes : null; if ((mat.clippingPlanes || null) !== want) { mat.clippingPlanes = want; mat.needsUpdate = true; } };
      for (const h of ['lh', 'rh']) { const m = this.hemiMesh && this.hemiMesh[h]; if (m) { set(m.material); set(m.userData.depthMesh.material); set(this.borderLines[h].material); } }
      for (const m of this.subMesh || []) set(m.material);
    },
  });
  if (SV.Viewer3D.markDirtyOnCall) SV.Viewer3D.markDirtyOnCall(P);
  // caméra de la vue en cours de rendu (pour orienter la découpe sagittale)
  const render0 = P._renderAll;
  P._renderAll = function (cd) { const r = this.renderer; if (!r) return render0.call(this, cd); const orig = r.render.bind(r); r.render = (scene, cam) => { this._curCam = cam; return orig(scene, cam); }; try { render0.call(this, cd); } finally { r.render = orig; } };
})(window.SV = window.SV || {});
