/* EpiScope — viewbar.js (v5) : barre de la vue 3D sur une seule rangée.
 *
 *   La deuxième rangée (gonflé, opacité, sans le fond, éléments affichés, « → toutes ») n'est plus affichée en permanence :
 *   ses réglages sont dans le menu « Affichage ▾ » (le même que celui de la planification et des deux vues, qui l'ont déjà).
 *   Les éléments de la rangée restent dans le DOM (identifiants inchangés : le code qui les lit ou les met à jour ne change
 *   pas) ; « SEEG ▾ » et « vues liées » remontent dans la première rangée. En mode présentation, la barre n'est pas
 *   affichée. */
(function (SV) {
  'use strict';
  const A = SV.app, $ = SV.U.$;
  function setup() {
    const bar = document.querySelector('.viewbar'); if (!bar || bar.dataset.v5) return; bar.dataset.v5 = '1';
    const r1 = bar.querySelector('.vrow:not(.sub)'), r2 = bar.querySelector('.vrow.sub'); if (!r1 || !r2) return;
    const btn = document.createElement('button'); btn.id = 'btnDisp'; btn.className = 'disp-btn'; btn.textContent = 'Affichage ▾';
    btn.title = 'Réglages de la vue 3D : gonflement, opacité du cortex, sans le fond, structures profondes, trajets / nœuds / liens du réseau, limites, électrodes, noms ; disposition ; copie vers toutes les vues ; réglages complets';
    const before = $('btn3dWL') || $('btnDock') || null;
    r1.insertBefore(btn, before);
    const seeg = $('seegChip'); if (seeg) r1.insertBefore(seeg, before);
    // v5.1 : « vues liées » et le contraste des coupes 3D (◐) passent dans « Affichage ▾ » ; « PNG » devient « Capture ▾ »
    const link = $('chkLink') && $('chkLink').closest('label'); if (link) r2.appendChild(link);
    const png = $('btnPng'); if (png) { png.textContent = 'Capture ▾'; png.title = 'capture de la vue : galerie (au staff, au compte rendu), presse-papiers, fichier PNG'; r1.appendChild(png); }
    document.body.classList.add('v5bar');
    btn.onclick = e => { e.stopPropagation(); if (A._menu && A._menu.dataset.disp) { A.closeMenu(); return; } A.planMenu(btn); const m = A._menu; if (m) { m.dataset.disp = '1'; const rr = btn.getBoundingClientRect(), w = m.getBoundingClientRect().width; m.style.left = Math.max(8, Math.min(rr.left, window.innerWidth - w - 8)) + 'px'; } };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup); else setup();
})(window.SV = window.SV || {});
