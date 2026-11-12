/* EpiScope — manual.js (v5.9) : manuel d'utilisation dans une fenêtre compagnon, par-dessus l'application.
 *   Ouverture : bouton ? de la barre du haut, F1, ⋯ › Manuel d'utilisation ; la page affichée est celle de l'écran en cours
 *   (étape / vue → chapitre, table ctx du manuel). Trois tailles : fenêtre flottante (déplaçable, redimensionnable), volet à
 *   droite, plein écran ; ↗ ouvre le manuel dans un onglet. Le manuel (docs/manuel, construit par tools/build_manual.py)
 *   est embarqué : assets/manual.json → SV_ASSETS.manual ou <script id="sv-asset-manual">. Au premier lancement, une
 *   carte discrète propose le démarrage rapide. */
(function (SV) {
  'use strict';
  const LS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } };
  let asset = null;
  function manual() {
    if (asset) return asset;
    try { const el = document.getElementById('sv-asset-manual'); asset = el ? JSON.parse(el.textContent) : (window.SV_ASSETS && window.SV_ASSETS.manual) || null; } catch (e) { asset = null; }
    return asset;
  }
  function resolve(key) { const C = (manual() || {}).ctx || {}; let k = String(key || ''); while (k) { if (C[k]) return C[k]; k = k.includes('/') ? k.slice(0, k.lastIndexOf('/')) : ''; } return ''; }
  let blobUrl = null;
  const M = {
    /** écran en cours → clé du manuel (« library », « phase1/crise », « seeg/analyses », « meeting/presenter »…) */
    manualKey() {
      if (!this.dossier || (this.ui.screen && this.ui.screen === 'patients')) return 'library';
      if (this.ui.screen === 'imaging') return 'dossier/imagerie';
      const st = this.loc && this.currentStage && this.currentStage(); if (!st) return 'dossier';
      const kind = st.kind === 'other' ? 'phase1' : st.kind; return kind + '/' + (this.loc.view || '');
    },
    openManual(key) {
      const A = manual(); if (!A || !A.html) { this.toast('Manuel absent de cette version'); return; }
      key = key || this.manualKey(); LS('sv_manual_hint', '1'); const hint = document.getElementById('svManHint'); if (hint) hint.remove();
      let P = document.getElementById('svManual');
      const send = () => { const f = P.querySelector('iframe'); try { f.contentWindow.postMessage({ type: 'episcope-manual', lang: SV.I18n.lang, key, theme: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark' }, '*'); } catch (e) { } };
      if (P) { P.hidden = false; send(); P.querySelector('iframe').focus(); return; }
      P = document.createElement('div'); P.id = 'svManual'; P.className = 'sv-man';
      P.innerHTML = `<div class="sv-man-h"><b>Manuel d’utilisation</b><span class="spacer"></span>
        <button data-a="here" title="Aide sur l’écran en cours">⟲ cet écran</button><button data-a="float" title="Fenêtre flottante">▢</button><button data-a="dock" title="Volet à droite">◧</button><button data-a="full" title="Plein écran">⤢</button><button data-a="tab" title="Ouvrir dans un onglet du navigateur">↗</button><button data-a="close" title="Fermer (Échap)">✕</button></div>
        <iframe title="Manuel d’utilisation"></iframe>`;
      document.body.appendChild(P);
      const f = P.querySelector('iframe'); f.addEventListener('load', send, { once: true }); f.srcdoc = A.html;
      // garde-fou : si l'iframe quitte le manuel (lien mal formé), on y revient au lieu d'afficher l'application en gigogne
      f.addEventListener('load', () => { let u = ''; try { u = f.contentWindow.location.href; } catch (e) { } if (u && !u.startsWith('about:srcdoc')) { f.addEventListener('load', send, { once: true }); f.srcdoc = A.html; } });
      const geo = (() => { try { return JSON.parse(LS('sv_manual_geo') || 'null'); } catch (e) { return null; } })();
      const setMode = m => { P.dataset.mode = m; LS('sv_manual_mode', m); if (m === 'float' && geo) Object.assign(P.style, { left: geo.l + 'px', top: geo.t + 'px', width: geo.w + 'px', height: geo.h + 'px' }); else if (m !== 'float') P.style.cssText = ''; };
      setMode(LS('sv_manual_mode') || 'float');
      const save = () => { if (P.dataset.mode !== 'float') return; const r = P.getBoundingClientRect(); LS('sv_manual_geo', JSON.stringify({ l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) })); };
      new ResizeObserver(() => save()).observe(P);
      P.querySelector('.sv-man-h').addEventListener('click', e => {
        const a = e.target.closest('button') && e.target.closest('button').dataset.a; if (!a) return;
        if (a === 'close') P.hidden = true;
        else if (a === 'here') { key = this.manualKey(); send(); }
        else if (a === 'tab') {
          if (!blobUrl) blobUrl = URL.createObjectURL(new Blob([A.html], { type: 'text/html' }));
          window.open(blobUrl + '#/' + SV.I18n.lang + '/' + (resolve(key) || ''), '_blank');
        } else setMode(a);
      });
      // déplacer la fenêtre flottante par son en-tête
      P.querySelector('.sv-man-h').addEventListener('pointerdown', e => {
        if (P.dataset.mode !== 'float' || e.target.closest('button')) return;
        const r = P.getBoundingClientRect(), x0 = e.clientX - r.left, y0 = e.clientY - r.top; P.classList.add('drag');
        const mv = ev => { P.style.left = Math.max(0, Math.min(innerWidth - 120, ev.clientX - x0)) + 'px'; P.style.top = Math.max(0, Math.min(innerHeight - 40, ev.clientY - y0)) + 'px'; P.style.right = 'auto'; P.style.bottom = 'auto'; };
        const up = () => { P.classList.remove('drag'); removeEventListener('pointermove', mv); removeEventListener('pointerup', up); save(); };
        addEventListener('pointermove', mv); addEventListener('pointerup', up);
      });
    },
    /** premier lancement : carte discrète vers le démarrage rapide */
    manualHint() {
      if (LS('sv_manual_hint') || !manual() || document.getElementById('svManHint')) return;
      const c = document.createElement('div'); c.id = 'svManHint'; c.className = 'sv-man-hint';
      c.innerHTML = `<b>Première fois sur EpiScope ?</b><p>Le démarrage rapide montre l’essentiel en dix minutes. L’aide reste ensuite à portée de main : bouton <kbd>?</kbd> ou touche <kbd>F1</kbd>, sur chaque écran.</p><div class="btnrow"><button class="primary" data-a="go">Démarrage rapide</button><button data-a="no">Plus tard</button></div>`;
      document.body.appendChild(c);
      c.onclick = e => { const a = e.target.closest('button') && e.target.closest('button').dataset.a; if (a === 'go') this.openManual('start'); else if (a === 'no') { LS('sv_manual_hint', '1'); c.remove(); } };
    },
  };
  Object.assign(SV.app, M);
  addEventListener('keydown', e => {
    if (e.key === 'F1') { e.preventDefault(); SV.app.openManual(); }
    else if (e.key === 'Escape') { const P = document.getElementById('svManual'); if (P && !P.hidden && P.dataset.mode === 'full') P.hidden = true; }
  });
  addEventListener('load', () => setTimeout(() => { try { SV.app.manualHint(); } catch (e) { } }, 2600));
})(window.SV = window.SV || {});
