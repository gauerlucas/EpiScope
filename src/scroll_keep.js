/* EpiScope — positions de défilement conservées quand un panneau se redessine (v4.6)
 * Un clic sur un plot (début de crise, stimulations, thermocoagulations, analyses, localisation…) redessine tout le
 * panneau : sans précaution, les listes défilantes (plots d'électrodes, tableaux) remontent en haut à chaque clic.
 * keepScroll(root, fn) relève avant fn() la position des zones défilées (root, ses ancêtres, ses descendants repérés par
 * id ou classes + rang) et la rétablit après — tout de suite et à l'image suivante (contenu mis en page plus tard).
 */
(function (SV) {
  'use strict';
  const keyOf = (el, root) => {
    if (el.id) return '#' + el.id;
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(c => c && !/^(on|sel|active|open)$/.test(c)) : [];
    const sel = el.tagName.toLowerCase() + cls.map(c => '.' + CSS.escape(c)).join('');
    return sel + '@' + Array.prototype.indexOf.call(root.querySelectorAll(sel), el);
  };
  const find = (root, key) => {
    if (key[0] === '#') return root.querySelector(key) || document.getElementById(key.slice(1));
    const at = key.lastIndexOf('@'); return root.querySelectorAll(key.slice(0, at))[+key.slice(at + 1)] || null;
  };
  function keepScroll(root, fn) {
    if (!root || !root.querySelectorAll) return fn();
    const anc = [], desc = [];
    for (let el = root; el && el !== document.documentElement; el = el.parentElement) if (el.scrollTop || el.scrollLeft) anc.push([el, el.scrollTop, el.scrollLeft]);
    for (const el of root.querySelectorAll('*')) if (el.scrollTop > 0 || el.scrollLeft > 0) desc.push([keyOf(el, root), el.scrollTop, el.scrollLeft]);
    // ancêtres : rétablis aussitôt seulement (une navigation qui remet la page en haut juste après garde le dernier mot)
    const putAnc = () => { for (const [el, t, l] of anc) if (el.isConnected) { if (el.scrollTop !== t) el.scrollTop = t; if (el.scrollLeft !== l) el.scrollLeft = l; } };
    const putDesc = () => { for (const [k, t, l] of desc) { const el = find(root, k); if (el) { if (el.scrollTop !== t) el.scrollTop = t; if (el.scrollLeft !== l) el.scrollLeft = l; } } };
    let r;
    try { r = fn(); } finally { putAnc(); if (desc.length) { putDesc(); requestAnimationFrame(putDesc); if (r && typeof r.then === 'function') r.then(putDesc, () => { }); } }
    return r;
  }
  SV.keepScroll = keepScroll;

  // panneaux redessinés à chaque clic : le conteneur est un onglet fixe, ou la boîte passée en premier argument
  const A = SV.app, TABS = { renderSeegSeizure: 'tab-seegsz', renderStims: 'tab-stims', renderThermo: 'tab-thermo', renderQuant: 'tab-quant' };
  for (const [name, id] of Object.entries(TABS)) { const f = A[name]; if (typeof f !== 'function') continue; A[name] = function () { return keepScroll(document.getElementById(id), () => f.apply(this, arguments)); }; }
  for (const name of ['renderLocalisationView', 'renderElectrodeCard', 'renderInterictalView', 'renderExamsView']) {
    const f = A[name]; if (typeof f !== 'function') continue;
    A[name] = function (box) { return box && box.nodeType === 1 && box.isConnected ? keepScroll(box, () => f.apply(this, arguments)) : f.apply(this, arguments); };
  }
})(window.SV = window.SV || {});
