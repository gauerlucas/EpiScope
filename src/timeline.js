/* EpiScope — timeline.js : frise sémiologique interactive (SVG) */
(function (SV) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };

  class Timeline {
    constructor(container, cb) {
      this.el = container; this.cb = cb || {}; this.events = []; this.t = 0; this.selected = null;
      this.svg = el('svg', { class: 'sv-tl', width: '100%', height: '100%' }, container);
      this.gDensity = el('g', {}, this.svg); this.gAxis = el('g', {}, this.svg); this.gEvents = el('g', {}, this.svg); this.gPlay = el('g', {}, this.svg);
      this.pad = { l: 14, r: 14, top: 22, bottom: 18 }; this.laneH = 22;
      // re-rendu seulement si la largeur change (un changement de hauteur — ascenseur, redimensionnement — ne touche pas au tracé)
      this._ro = new ResizeObserver(() => { const w = this.width; if (w !== this._lastW) { this._lastW = w; this.render(); } }); this._ro.observe(container);
      // pointeur : glisser une barre (déplacer), ses bords (début, fin), la tête de lecture ; double-clic = paramètres
      this.svg.addEventListener('pointerdown', e => this._down(e));
      this.svg.addEventListener('pointermove', e => this._move(e));
      this.svg.addEventListener('pointerup', e => this._up(e)); this.svg.addEventListener('pointercancel', e => this._up(e, true));
      this.svg.addEventListener('pointerleave', () => { if (!this._dg && !this._dragPlay) this.svg.style.cursor = ''; });
      this.svg.addEventListener('contextmenu', e => e.preventDefault());
    }
    setData(events, opts) { this.events = events; this.opts = Object.assign({}, this.opts || {}, opts || {}); this.render(); }
    setTime(t) { this.t = t; this._renderPlayhead(); }
    setSelected(id) { this.selected = id; if (this._dg) { this._pending = true; return; } if (this._recs) { for (const R of this._recs.values()) R.g.classList.toggle('sel', R.ev.id === id); return; } this.render(); }

    get width() { return this.el.clientWidth || 600; }
    x(t) { const o = this.opts || { tmin: -5, tmax: 60 }; return this.pad.l + (t - o.tmin) / (o.tmax - o.tmin) * (this.width - this.pad.l - this.pad.r); }
    tOf(x) { const o = this.opts || { tmin: -5, tmax: 60 }; return o.tmin + (x - this.pad.l) / (this.width - this.pad.l - this.pad.r) * (o.tmax - o.tmin); }
    _seekFromEvent(e) { const r = this.svg.getBoundingClientRect(); const t = Math.max(this.opts.tmin, Math.min(this.opts.tmax, this.tOf(e.clientX - r.left))); if (this.cb.onSeek) this.cb.onSeek(t); }

    _lanes() {
      const evs = this.events.slice().sort((a, b) => a.t - b.t), lanes = [];
      const pxPerS = (this.width - this.pad.l - this.pad.r) / (this.opts.tmax - this.opts.tmin);
      for (const ev of evs) {
        const txt = (this.opts.labelOf ? this.opts.labelOf(ev) : ev.sign_id) + (ev.side ? ' xx' : ''), w = Math.max(ev.dur || 0, 1) * pxPerS;
        const labelEnd = w >= txt.length * 6.6 + 10 ? 0 : (w + txt.length * 6.6 + 14) / pxPerS;
        const end = ev.t + Math.max(Math.max(ev.dur || 0, 1), labelEnd) + (this.opts.tmax - this.opts.tmin) * 0.02;
        let k = lanes.findIndex(l => l < ev.t);
        if (k < 0) { k = lanes.length; lanes.push(end); } else lanes[k] = end;
        ev._lane = k;
      }
      return lanes.length;
    }

    render() {
      if (!this.opts) return;
      if (this._dg) { this._pending = true; return; }   // glisser en cours : redessin à la fin (la barre saisie reste en place)
      const W = this.width, nl = this._lanes(), H = this.pad.top + Math.max(nl, 2) * this.laneH + this.pad.bottom + 16;
      this.svg.setAttribute('height', H); this.svg.style.height = H + 'px'; this._lastW = W;
      // densité réseau
      this.gDensity.innerHTML = '';
      if (this.opts.density && this.opts.times) {
        const d = this.opts.density, ts = this.opts.times, max = Math.max(1e-6, ...d), y0 = H - this.pad.bottom - 2, hh = 14;
        let path = `M${this.x(ts[0])},${y0}`; for (let i = 0; i < ts.length; i++) path += ` L${this.x(ts[i])},${y0 - hh * d[i] / max}`; path += ` L${this.x(ts[ts.length - 1])},${y0} Z`;
        el('path', { d: path, class: 'sv-tl-density' }, this.gDensity);
      }
      // axe
      this.gAxis.innerHTML = '';
      const span = this.opts.tmax - this.opts.tmin, stepT = span > 240 ? 60 : span > 120 ? 30 : span > 60 ? 10 : span > 25 ? 5 : 1;
      const yAx = this.pad.top - 6;
      el('line', { x1: this.pad.l, x2: W - this.pad.r, y1: yAx, y2: yAx, class: 'sv-tl-axis', 'data-axis': 1 }, this.gAxis);
      el('rect', { x: 0, y: 0, width: W, height: H, fill: 'transparent', 'data-axis': 1, class: 'sv-tl-bg' }, this.gAxis);
      for (let t = Math.ceil(this.opts.tmin / stepT) * stepT; t <= this.opts.tmax; t += stepT) {
        el('line', { x1: this.x(t), x2: this.x(t), y1: yAx - 4, y2: H - this.pad.bottom, class: 'sv-tl-grid' + (t === 0 ? ' zero' : ''), 'data-axis': 1 }, this.gAxis);
        el('text', { x: this.x(t) + 3, y: yAx - 7, class: 'sv-tl-tick' }, this.gAxis).textContent = fmtT(t);
      }
      if (this.opts.seizureEnd != null) {
        el('line', { x1: this.x(this.opts.seizureEnd), x2: this.x(this.opts.seizureEnd), y1: yAx - 4, y2: H - this.pad.bottom, class: 'sv-tl-eeg end' }, this.gAxis);
        el('text', { x: this.x(this.opts.seizureEnd) + 4, y: H - this.pad.bottom + 12, class: 'sv-tl-tick eeg' }, this.gAxis).textContent = 'fin clinique';
      }
      if (this.opts.eegOnset != null) {
        el('line', { x1: this.x(this.opts.eegOnset), x2: this.x(this.opts.eegOnset), y1: yAx - 4, y2: H - this.pad.bottom, class: 'sv-tl-eeg' }, this.gAxis);
        el('text', { x: this.x(this.opts.eegOnset) + 4, y: H - this.pad.bottom + 12, class: 'sv-tl-tick eeg' }, this.gAxis).textContent = 'début EEG';
      }
      // événements : une barre par signe (déplacer), ses bords (allonger, raccourcir), son nom
      this.gEvents.innerHTML = ''; this._recs = new Map();
      for (const ev of this.events) {
        const y = this.pad.top + ev._lane * this.laneH, col = this.opts.colorOf ? this.opts.colorOf(ev) : '#888';
        const g = el('g', { class: 'sv-ev' + (ev.id === this.selected ? ' sel' : '') }, this.gEvents); g.dataset.id = String(ev.id);
        const R = { ev, g, y, col, unc: el('rect', { y: y + 7, height: this.laneH - 14, class: 'sv-ev-unc', fill: col }, g), bar: el('rect', { y: y + 2, height: this.laneH - 6, rx: 5, class: 'sv-ev-bar', fill: col }, g),
          gl: el('rect', { y: y + 6, width: 2, height: this.laneH - 14, rx: 1, class: 'sv-ev-grip' }, g), gr: el('rect', { y: y + 6, width: 2, height: this.laneH - 14, rx: 1, class: 'sv-ev-grip' }, g),
          label: el('text', { y: y + this.laneH / 2 + 2 }, g) };
        R.txt = (this.opts.labelOf ? this.opts.labelOf(ev) : ev.sign_id) + (ev.side ? ' ' + ({ L: 'G', R: 'D', B: 'bil.' }[ev.side] || '') : '');
        R.label.textContent = R.txt;
        this._place(R); this._recs.set(String(ev.id), R);
        g.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); if (this.cb.onContext) this.cb.onContext(ev, e); });
      }
      this._renderPlayhead();
    }

    /** position d'une barre d'après l'événement (et son brouillon pendant un glisser) */
    _place(R, d) {
      const ev = R.ev, t = d ? d.t : ev.t, dur = d ? d.dur : ev.dur, x0 = this.x(t), x1 = this.x(t + Math.max(dur || 0, 1)), w = Math.max(6, x1 - x0);
      R.x0 = x0; R.x1 = x0 + w;
      R.bar.setAttribute('x', x0); R.bar.setAttribute('width', w);
      if (ev.dt > 0.5) { R.unc.setAttribute('x', this.x(t - ev.dt)); R.unc.setAttribute('width', Math.max(0, this.x(t + ev.dt) - this.x(t - ev.dt))); R.unc.style.display = ''; } else R.unc.style.display = 'none';
      R.gl.setAttribute('x', x0 + 3); R.gr.setAttribute('x', x0 + w - 5);
      const fits = w >= R.txt.length * 6.6 + 10; R.label.setAttribute('x', fits ? x0 + 7 : x0 + w + 6); R.label.setAttribute('class', 'sv-ev-label' + (fits ? '' : ' out'));
    }
    /** barre sous le pointeur et zone saisie : bord gauche (début), bord droit (fin), milieu (déplacer) */
    _hit(e) {
      // géométrie plutôt que cible : la tête de lecture posée sur une barre ne la masque pas
      if (!this._recs) return null; const r = this.svg.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top; let R = null, lab = false;
      for (const Q of this._recs.values()) { if (py < Q.y + 1 || py > Q.y + this.laneH - 3) continue; if (px >= Q.x0 - 3 && px <= Q.x1 + 3) { R = Q; break; } if (/\bout\b/.test(Q.label.getAttribute('class') || '') && px > Q.x1 && px < Q.x1 + 8 + Q.txt.length * 6.6) { R = Q; lab = true; } }
      if (!R) return null; if (lab) return { R, mode: 'move' };
      const w = R.x1 - R.x0, edge = Math.max(5, Math.min(10, w / 4));
      const mode = w < 14 ? (px >= R.x1 - 4 ? 'end' : 'move') : px <= R.x0 + edge ? 'start' : px >= R.x1 - edge ? 'end' : 'move';
      return { R, mode };
    }
    _down(e) {
      if (e.button !== 0) return;
      const H = this._hit(e);
      if (H) {
        e.preventDefault(); e.stopPropagation(); try { this.svg.setPointerCapture(e.pointerId); } catch (_) { }
        const ev = H.R.ev; this._dg = { R: H.R, mode: this.cb.onChange ? H.mode : null, cx: e.clientX, start: { t: ev.t, dur: ev.dur || 1 }, moved: false, draft: null };
        this.svg.classList.add('dragging'); H.R.g.classList.add('grabbed'); this.svg.style.cursor = H.mode === 'move' ? 'grabbing' : 'ew-resize';
        return;
      }
      if (e.target === this.svg || (e.target.dataset && e.target.dataset.axis) || e.target.closest('.sv-tl-playlab, .sv-tl-density')) { e.preventDefault(); this._seekFromEvent(e); this._dragPlay = true; try { this.svg.setPointerCapture(e.pointerId); } catch (_) { } this.svg.classList.add('scrubbing'); }
    }
    _move(e) {
      if (this._dragPlay) { this._seekFromEvent(e); return; }
      const D = this._dg;
      if (!D) { const H = this._hit(e); this.svg.style.cursor = !H ? '' : !this.cb.onChange ? 'pointer' : H.mode === 'move' ? 'grab' : 'ew-resize'; return; }
      if (!D.mode) return;
      const dx = e.clientX - D.cx; if (!D.moved && Math.abs(dx) < 3) return; D.moved = true;
      const pxPerS = (this.width - this.pad.l - this.pad.r) / (this.opts.tmax - this.opts.tmin), dtm = dx / pxPerS, st = D.start;
      // pas de 0,1 s ; aimant (6 px) : tête de lecture, 0, début EEG, bords des autres signes — Alt : sans aimant
      const step = v => Math.round(v * 10) / 10, mag = e.altKey ? [] : [this.t, 0, this.opts.eegOnset, this.opts.seizureEnd].concat(...this.events.filter(x => x !== D.R.ev).map(x => [x.t, x.t + Math.max(x.dur || 0, 1)])).filter(v => v != null);
      const mg = v => { let b = null, bd = 6 / pxPerS; for (const m of mag) { const dd = Math.abs(m - v); if (dd < bd) { bd = dd; b = m; } } return b; }, snap = v => { const m = mg(v); return m != null ? m : step(v); };
      let t = st.t, dur = st.dur;
      if (D.mode === 'move') { const a = st.t + dtm, ms = mg(a), me = mg(a + st.dur); t = ms != null && (me == null || Math.abs(ms - a) <= Math.abs(me - st.dur - a)) ? ms : me != null ? me - st.dur : step(a); }
      else if (D.mode === 'end') dur = Math.max(0.2, snap(st.t + st.dur + dtm) - st.t);
      else { const t1 = Math.min(st.t + st.dur - 0.2, snap(st.t + dtm)); dur = st.t + st.dur - t1; t = t1; }
      t = Math.max(this.opts.tmin - 60, t); D.draft = { t: Math.round(t * 10) / 10, dur: Math.round(dur * 10) / 10 };
      this._place(D.R, D.draft); this._tip(D.R, D.draft, D.mode);
      // l'application suit au plus une fois par image (3D, liste), sans redessiner la frise
      if (!D.raf) D.raf = requestAnimationFrame(() => { D.raf = 0; if (this._dg === D && D.draft) this.cb.onChange(D.R.ev, { t: D.draft.t, dur: D.draft.dur }); });
    }
    _up(e, cancel) {
      if (this._dragPlay) { this._dragPlay = false; this.svg.classList.remove('scrubbing'); return; }
      const D = this._dg; if (!D) return; this._dg = null;
      if (D.raf) cancelAnimationFrame(D.raf);
      this.svg.classList.remove('dragging'); D.R.g.classList.remove('grabbed'); this.svg.style.cursor = ''; if (this._tipG) this._tipG.style.display = 'none';
      const ev = D.R.ev;
      if (D.moved && D.draft && !cancel) this.cb.onChange(ev, { t: D.draft.t, dur: D.draft.dur });
      if (this._pending || D.moved) { this._pending = false; this.render(); }
      if (!D.moved && !cancel) {   // clic : sélection ; second clic rapide sur le même signe : paramètres
        const now = performance.now(), L = this._lastClick;
        if (L && L.id === ev.id && now - L.t < 450) { this._lastClick = null; if (this.cb.onEdit) this.cb.onEdit(ev); }
        else { this._lastClick = { id: ev.id, t: now }; if (this.cb.onSelect) this.cb.onSelect(ev); }
      }
    }
    /** bulle pendant le glisser : début → fin (durée) */
    _tip(R, d, mode) {
      if (!this._tipG) { this._tipG = el('g', { class: 'sv-tl-tip' }, this.svg); el('rect', { rx: 6, height: 17 }, this._tipG); el('text', { y: 12 }, this._tipG); }
      const G = this._tipG, txt = mode === 'move' ? `${fmtT(d.t, true)} → ${fmtT(d.t + d.dur, true)}` : mode === 'end' ? `fin ${fmtT(d.t + d.dur, true)} · ${d.dur.toFixed(1).replace('.', ',')} s` : `début ${fmtT(d.t, true)} · ${d.dur.toFixed(1).replace('.', ',')} s`;
      const tx = G.querySelector('text'); tx.textContent = txt; const w = txt.length * 6.4 + 12; G.querySelector('rect').setAttribute('width', w); tx.setAttribute('x', 6);
      const x = Math.max(2, Math.min(this.width - w - 2, (mode === 'end' ? R.x1 : R.x0) - w / 2)), y = Math.max(0, R.y - 17);
      G.setAttribute('transform', `translate(${x},${y})`); G.style.display = '';
    }

    _renderPlayhead() {
      if (!this.opts) return; this.gPlay.innerHTML = '';
      const H = +this.svg.getAttribute('height') || 80, x = this.x(this.t);
      el('line', { x1: x, x2: x, y1: this.pad.top - 12, y2: H - this.pad.bottom, class: 'sv-tl-play' }, this.gPlay);
      el('rect', { x: x - 5, y: this.pad.top - 12, width: 10, height: H - this.pad.bottom - this.pad.top + 12, fill: 'transparent', 'data-axis': 1, class: 'sv-tl-playgrab' }, this.gPlay);
      const lab = el('g', { class: 'sv-tl-playlab', transform: `translate(${x},${this.pad.top - 20})` }, this.gPlay);
      el('rect', { x: -22, y: -6, width: 44, height: 16, rx: 8 }, lab);
      el('text', { x: 0, y: 6, 'text-anchor': 'middle' }, lab).textContent = fmtT(this.t, true);
    }
  }
  function fmtT(t, dec) { const s = Math.abs(t), m = Math.floor(s / 60), r = s - m * 60; const txt = m ? `${m}:${(dec ? r.toFixed(1) : Math.round(r)).toString().padStart(dec ? 4 : 2, '0')}` : (dec ? r.toFixed(1) : String(Math.round(r))) + ' s'; return (t < 0 ? '−' : '') + txt; }
  SV.Timeline = Timeline; SV.fmtT = fmtT;
})(window.SV = window.SV || {});
