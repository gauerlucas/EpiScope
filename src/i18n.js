/* EpiScope — i18n.js (v5.9) : interface en français ou en anglais (⋯ › Langue), mémorisée sur ce poste.
 *   L'interface est écrite en français ; en anglais, chaque texte affiché (nœuds de texte, title, placeholder, aria-label,
 *   alt, boîtes confirm / alert / prompt, textes dessinés sur les canevas) passe par le dictionnaire assets/i18n_en.json :
 *   clé exacte, sinon gabarit à trous {} (« {} pointes en {} » → « {} spikes in {} », trous traduits à leur tour),
 *   sinon morceaux séparés par « · », « — », « : »… traduits un à un. Clés extraites par tools/i18n_extract.py.
 *   SV.LOC : paramètres régionaux des dates et heures (fr-FR / en-GB) ; SV.I18n.t(s) : traduction d'une chaîne. */
(function (SV) {
  'use strict';
  let lang = 'fr';
  try { lang = localStorage.getItem('sv_lang') || ((navigator.language || 'fr').toLowerCase().startsWith('fr') ? 'fr' : 'en'); } catch (e) { }
  if (lang !== 'en') lang = 'fr';
  SV.LOC = lang === 'en' ? 'en-GB' : 'fr-FR';
  const EN = lang === 'en';
  const I = SV.I18n = { lang, t: s => s, html: s => s, apply() { }, set(l) { try { localStorage.setItem('sv_lang', l); } catch (e) { } location.reload(); } };
  document.documentElement.lang = lang;
  if (!EN) return;

  // ---- dictionnaire (bundle de développement : SV_ASSETS ; fichier unique : <script id="sv-asset-i18n_en">)
  let raw = {};
  try { const el = document.getElementById('sv-asset-i18n_en'); raw = el ? JSON.parse(el.textContent) : (window.SV_ASSETS && window.SV_ASSETS.i18n_en) || {}; } catch (e) { console.warn('i18n : dictionnaire illisible', e); }
  const WS = /\s+/g, EDGE = /^([\s·:,;—–|/✕▾▸◉✎✓•↺…☰▶◀‹›⟲⤢＋+⚠ⓘ]*)([\s\S]*?)([\s·:,;—–|/✕▾▸◉✎✓•↺…☰▶◀‹›⟲⤢ⓘ]*)$/, LET = /[A-Za-zÀ-ÿ]{2}/;
  const exact = new Map(), byWord = new Map(), loose = [];
  const words = s => (s.toLowerCase().match(/[a-zà-ÿœ’']{3,}/g) || []);
  const FW = /^ (?:(?:de|du|des|à|au|aux|et|en|sur|dans|pour|par|avec|sans|le|la|les|un|une)(?=[\s,.;:)]|$)|[dl]’)/i;   // mots outils : le trou n'est pas un compte
  for (const [k, v] of Object.entries(raw)) {
    if (!v) continue;
    if (!k.includes('{}')) { exact.set(k, v); continue; }
    // « {} crises », « {} paire{} », « {} · {} crises » : un trou en tête de segment suivi d'un nom est un nombre
    // (sinon « choisir une paire » deviendrait « … pair », « IIIA · réduction notable des crises » « … des seizures »)
    const parts = k.split('{}');
    const num = i => i === 1 ? parts[0] === '' && /^ [a-zà-ÿ]/i.test(parts[1] || '') && !FW.test(parts[1])
      : /[·,:;—–(|] ?$/.test(parts[i - 1]) && /^ [a-zà-ÿ]/i.test(parts[i]) && !FW.test(parts[i]);
    const re = new RegExp('^' + parts.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).reduce((a, p, i) => a + (i ? (num(i) ? '([\\d.,/±%~≈≥≤<> –-]+?(?: ?(?:min|ms|s|h|mm|cm|Hz|mA|°))?)' : '(.*?)') : '') + p, '') + '$');
    const w = words(parts.join(' ')).sort((a, b) => b.length - a.length)[0];
    const P = { re, v, n: parts.length - 1, lit: parts.join('').length };
    if (!w) { loose.push(P); continue; }   // gabarit sans mot de 3 lettres (« né(e) à {} SA, {} g ») : essayé à chaque fois
    (byWord.get(w) || byWord.set(w, []).get(w)).push(P);
  }
  // libellés de la base de référence : signes (label_en), régions VEP (nom anglais de la famille), côté G / D
  try {
    const el = document.getElementById('sv-db'), db = el ? JSON.parse(el.textContent) : window.SV_DB || {};
    for (const x of db.signs || []) if (x.label_fr && x.label_en && !exact.has(x.label_fr)) exact.set(x.label_fr, x.label_en);
    for (const x of db.regions || []) if (x.label_fr && x.family) { const en = x.family.replace(/-/g, ' '); if (!exact.has(x.label_fr)) exact.set(x.label_fr, en); exact.set(x.label_fr + ' G', en + ' L'); exact.set(x.label_fr + ' D', en + ' R'); }
  } catch (e) { }
  /** s découpé à chaque sep hors parenthèses */
  function split(s, sep) {
    if (!s.includes(sep)) return [s]; const out = []; let d = 0, a = 0;
    for (let i = 0; i < s.length; i++) { const c = s[i]; if (c === '(' || c === '[') d++; else if ((c === ')' || c === ']') && d) d--; else if (!d && s.startsWith(sep, i)) { out.push(s.slice(a, i)); a = i + sep.length; i += sep.length - 1; } }
    out.push(s.slice(a)); return out;
  }
  for (const [k, v] of [...exact]) if (/\d %/.test(k)) exact.set(k.replace(/(\d) %/g, '$1%'), v);
  const cache = new Map(), done = new Set(), SEPS = [' · ', ' — ', ' – ', ' : ', ' ; ', ' | ', ', ', ' / ', ' → ', ' > '], SEPS2 = SEPS.filter(x => x !== ' : ' && x !== ' ; ');   // « Acquisition : {}. » reste aux gabarits (ponctuation anglaise)
  /** gabarit le plus précis (le plus de texte fixe) parmi ceux qui reconnaissent s : « Groupe {} : pointe moyennée ({}) » avant « Groupe {} » */
  function pattern(s) {
    const seen = new Set(); let best = null, bm = null;
    const tryP = P => { if (best && P.lit <= best.lit) return; const m = s.match(P.re); if (m) { best = P; bm = m; } };
    for (const w of words(s)) { if (seen.has(w)) continue; seen.add(w); const L = byWord.get(w); if (L) L.forEach(tryP); }
    loose.forEach(tryP);
    if (!best) return null;   // {} : trou suivant traduit ; {-} : trou suivant omis (accords du français) ; {2} : trou n° 2
    let i = 0; const g = j => { const x = bm[j] || ''; const t = core(x, 1); return t == null ? x : t; };
    return best.v.replace(/\{(-|\d?)\}/g, (_, k) => k === '-' ? (++i, '') : k ? g(+k) : g(++i));
  }
  /** traduction du cœur d'un texte (espaces réduits, sans ponctuation de bord) ; null : rien trouvé */
  function core(s, depth) {
    if (!s || !LET.test(s)) return null;
    let r = exact.get(s); if (r != null) return r;
    if (depth > 3) return null;
    for (const sep of SEPS2) {   // morceaux tous connus (ou codes : « IIIB », « 3 ») : avant les gabarits génériques
      const parts = split(s, sep); if (parts.length < 2) continue;
      if (parts.every(p => { const q = p.trim(); return exact.has(q) || /^[A-Z0-9][A-Z0-9.–-]*$/.test(q); }) && parts.some(p => exact.has(p.trim())))
        return parts.map(p => { const q = p.trim(); return exact.has(q) ? p.replace(q, exact.get(q)) : p; }).join(sep);
    }
    r = pattern(s); if (r != null) return r;
    for (const sep of SEPS) {   // morceaux séparés hors parenthèses
      const parts = split(s, sep); if (parts.length < 2) continue; let any = false;
      const out = parts.map(p => { const q = p.trim(); const t = core(q, depth + 1); if (t != null) { any = true; return p.replace(q, t); } return p; });
      if (any) return out.join(sep);
    }
    const wm = s.match(/^\(([^()]+)\)$/);   // « (bipolaire · crise annotée) »
    if (wm) { const t = core(wm[1], depth + 1); if (t != null) return '(' + t + ')'; }
    const pm = s.match(/^(.*?)\s*\(([^()]*)\)$/);   // « libellé (précision) »
    if (pm && pm[1]) { const a = core(pm[1], depth + 1), b = core(pm[2], depth + 1); if (a != null || b != null) return (a == null ? pm[1] : a) + ' (' + (b == null ? pm[2] : b) + ')'; }
    const am = s.match(/^([A-Z][A-Z0-9-]*(?: \([A-Z]+\))?) ([a-zà-ÿ][a-zà-ÿ-]+)$/);   // « FLAIR pré-opératoire » → « pre-operative FLAIR »
    if (am && exact.has(am[2])) return exact.get(am[2]) + ' ' + am[1];
    const sm = s.match(/^(.*[A-Za-zÀ-ÿ].*) (G|D|bil\.)$/);   // « libellé G », « signe bil. »
    if (sm) { const t = core(sm[1], depth + 1); if (t != null) return t + ' ' + ({ G: 'L', D: 'R' }[sm[2]] || sm[2]); }
    const nm = s.match(/^([\d–.,-]+ )(.*[A-Za-zÀ-ÿ].*)$/) || s.match(/^(.*[A-Za-zÀ-ÿ].*?)( [\d–.,-]+(?: ?%)?)$/);   // « 2–3 libellé », « libellé 4 », « région G 27 % »
    if (nm) { const lead = /^[\d]/.test(nm[1]), t = core(lead ? nm[2] : nm[1], depth + 1); if (t != null) return lead ? nm[1] + t : t + nm[2]; }
    return null;
  }
  const typo = s => s.replace(/(\d),(\d)/g, '$1.$2').replace(/(\d)[   ]%/g, '$1%').replace(/«\s*/g, '“').replace(/\s*»/g, '”').replace(/’/g, '’');
  /** texte affiché → anglais (bords et espaces gardés) */
  function t(text) {
    if (text == null) return text; const s = String(text); if (!LET.test(s) || done.has(s)) return s;   // un texte déjà traduit n'est pas retraduit
    const c = cache.get(s); if (c !== undefined) return c;
    const m = s.match(EDGE), k = m[2].replace(WS, ' '), k0 = s.trim().replace(WS, ' ');
    let r = k0 !== k && exact.has(k0) ? null : core(k, 0);
    if (r == null && k0 !== k && exact.has(k0)) { m[1] = s.match(/^\s*/)[0]; m[3] = s.match(/\s*$/)[0]; r = exact.get(k0); } if (r == null && I.miss && FRW.test(k)) I.miss.set(k, (I.miss.get(k) || 0) + 1); r = r == null ? s : m[1] + r + m[3]; r = typo(r);
    if (cache.size > 30000) { cache.clear(); done.clear(); } cache.set(s, r); if (r !== s) done.add(r); return r;
  }
  const lines = s => String(s).split('\n').map(t).join('\n');
  I.t = t;
  // relevé des textes restés en français (développement : localStorage sv_i18n_debug = 1 ; SV.I18n.miss)
  const FRW = /[éèêàâîôûùçœ]|\b(le|la|les|des|du|une|et|pour|sur|dans|avec|sans|pas|est|aux)\b/i;
  try { if (localStorage.getItem('sv_i18n_debug')) { I.miss = new Map(JSON.parse(localStorage.getItem('sv_i18n_miss') || '[]')); setInterval(() => { try { localStorage.setItem('sv_i18n_miss', JSON.stringify([...I.miss])); } catch (e) { } }, 3000); } } catch (e) { }

  // ---- DOM : nœuds de texte et attributs, au premier affichage puis à chaque changement
  const ATTRS = ['title', 'placeholder', 'aria-label', 'alt'], SKIP = /^(SCRIPT|STYLE|TEXTAREA|CODE|PRE)$/;
  /** zone de saisie : son contenu (saisi) n'est jamais traduit, mais son placeholder et son title le sont */
  const taAttrs = el => el.tagName === 'TEXTAREA' && !el.classList.contains('notr') && !el.hasAttribute('data-notr') && !skip(el.parentElement);
  const skip = el => { for (let e = el; e && e.nodeType === 1; e = e.parentElement) { if (SKIP.test(e.tagName) || e.isContentEditable || e.classList.contains('notr') || e.hasAttribute('data-notr')) return true; } return false; };
  function textNode(n) { const v = n.nodeValue; if (!v || !LET.test(v) || skip(n.parentElement)) return; const r = t(v); if (r !== v) n.nodeValue = r; }
  function attrs(el) { for (const a of ATTRS) { const v = el.getAttribute && el.getAttribute(a); if (v && LET.test(v)) { const r = lines(v); if (r !== v) el.setAttribute(a, r); } } if (el.tagName === 'INPUT' && /^(button|submit|reset)$/.test(el.type) && el.value) { const r = t(el.value); if (r !== el.value) el.value = r; } }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) return textNode(root);
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1) { if (skip(root)) { if (taAttrs(root)) attrs(root); return; } attrs(root); }
    const it = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, { acceptNode: n => {
      if (n.nodeType === 1 && SKIP.test(n.tagName)) { if (taAttrs(n)) attrs(n); return NodeFilter.FILTER_REJECT; } return NodeFilter.FILTER_ACCEPT; } });
    let n; while ((n = it.nextNode())) { if (n.nodeType === 3) textNode(n); else if (!(n.isContentEditable || n.classList.contains('notr'))) attrs(n); }
  }
  I.apply = walk;
  /** gabarit HTML (compte rendu, diaporama exporté) traduit avant d'être écrit dans une autre fenêtre */
  I.html = s => { try { const d = new DOMParser().parseFromString(String(s), 'text/html'); walk(d.documentElement); d.documentElement.lang = 'en'; if (d.title) d.title = t(d.title); return '<!doctype html>\n' + d.documentElement.outerHTML; } catch (e) { return s; } };
  const mo = new MutationObserver(list => {
    for (const r of list) {
      if (r.type === 'childList') r.addedNodes.forEach(walk);
      else if (r.type === 'characterData') textNode(r.target);
      else if (r.type === 'attributes' && (!skip(r.target) || taAttrs(r.target))) attrs(r.target);
    }
  });
  const start = () => { walk(document.body); if (document.title) document.title = t(document.title); mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS }); };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  // ---- boîtes natives et canevas
  const wc = window.confirm, wa = window.alert, wp = window.prompt;
  window.confirm = m => wc.call(window, lines(m)); window.alert = m => wa.call(window, lines(m)); window.prompt = (m, d) => wp.call(window, lines(m), d);
  const C2 = window.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype;
  if (C2) for (const f of ['fillText', 'strokeText', 'measureText']) { const o = C2[f]; C2[f] = function (s, ...a) { return o.call(this, typeof s === 'string' && LET.test(s) ? (exact.get(s.trim()) != null ? s.replace(s.trim(), exact.get(s.trim())) : s) : s, ...a); }; }
  const st = Object.getOwnPropertyDescriptor(Document.prototype, 'title');
  if (st && st.set) Object.defineProperty(document, 'title', { get() { return st.get.call(document); }, set(v) { st.set.call(document, t(v)); }, configurable: true });
})(window.SV = window.SV || {});
