/* EpiScope — pedigree.js : arbre généalogique (Histoire clinique) — modèle, conversion des anciens arbres, rendu SVG, édition.
 *   v3 — patient.clin.pedigree = { v: 3, persons: [{ id, sex: 'M'|'F'|'U', status, deceased, count, label, notes, gen, x,
 *   ghost }], links: [{ id, type: 'union'|'filiation'|'sibling', a, b, consang, inh }], notes }.
 *   gen : génération (cas index = 0, parents −1, enfants +1) ; x : position horizontale (px) dans la rangée.
 *   Liens : union (a, b conjoints ; consang = consanguinité déclarée quand les ancêtres communs ne sont pas dessinés),
 *   filiation (a parent → b enfant ; inh = reprise des parents d'un frère ou d'une sœur ajouté(e) à côté), fratrie (a, b
 *   frères et sœurs, utile quand les parents ne sont pas dessinés). Au plus deux parents ; deux parents d'un même enfant
 *   sont toujours unis. La consanguinité d'une union est calculée : conjoints ayant un ancêtre commun dans l'arbre (frères
 *   et sœurs sans parents dessinés : parents virtuels communs) → double trait, lien de parenté et coefficient F des enfants.
 *   Les arbres v1 (lien au cas index) et v2 (père, mère, conjoints) sont convertis à la première lecture.
 *   Symboles usuels (Bennett 2008) : carré = homme, rond = femme, losange = sexe non précisé ; plein = atteint, demi =
 *   porteur, hachuré = atteinte possible, « ? » = statut inconnu ; barre oblique = décédé ; un nombre = groupe ; double
 *   trait d'union = consanguinité ; flèche = cas index.                                                            */
(function (SV) {
  'use strict';
  const esc = SV.U.esc;
  const SZ = 26, DX = 80, ROWH = 104, TOP = 26, PAD = 46, uid = () => 'I' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const lid = () => 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // ================================================================ anciens formats (v1 → v2 → v3)
  function toV2(ped) {
    if (!ped) return { v: 2, persons: [{ id: 'proband', proband: true }], partners: [], consanguinity: false, notes: '' };
    if (ped.v === 2) { if (!ped.persons.some(p => p.id === 'proband')) ped.persons.unshift({ id: 'proband', proband: true }); ped.partners = ped.partners || []; return ped; }
    const old = ped.persons || [], P = { id: 'proband', proband: true }, L = [P], by = r => old.filter(p => p.rel === r);
    const mk = (o, ghost) => { const p = Object.assign({ id: uid(), sex: 'U', status: 'none', count: 1, label: '', notes: '' }, o, ghost ? { ghost: true } : {}); delete p.rel; L.push(p); return p; };
    const keep = p => { const q = Object.assign({}, p); delete q.rel; q.fatherId = q.fatherId || null; q.motherId = q.motherId || null; L.push(q); return q; };
    const parents = (child, fa, mo) => { child.fatherId = fa ? fa.id : child.fatherId; child.motherId = mo ? mo.id : child.motherId; };
    let fa = by('father')[0], mo = by('mother')[0]; fa = fa ? keep(fa) : null; mo = mo ? keep(mo) : null;
    for (const x of by('father').slice(1).concat(by('mother').slice(1))) keep(Object.assign({}, x, { notes: [x.notes, '(second parent saisi : à relier)'].filter(Boolean).join(' ') }));   // v1 permettait deux pères : rien n'est perdu
    const needParents = by('sibling').length || by('gpPat').length || by('gpMat').length || by('unclePat').length || by('uncleMat').length || by('cousinPat').length || by('cousinMat').length;
    if (!fa && (needParents)) fa = mk({ sex: 'M' }, true); if (!mo && needParents) mo = mk({ sex: 'F' }, true);
    parents(P, fa, mo);
    for (const s of by('sibling')) parents(keep(s), fa, mo);
    for (const c of by('child')) { const q = keep(c); q.fatherId = 'proband'; }
    const side = (gpRel, uncleRel, cousinRel, par) => {
      const gps = by(gpRel).map(keep); let gF = gps.find(g => g.sex === 'M') || null, gM = gps.find(g => g.sex === 'F') || null;
      for (const g of gps) if (g !== gF && g !== gM) { if (!gF) gF = g; else if (!gM) gM = g; }
      const uncles = by(uncleRel).map(keep);
      if ((uncles.length || by(cousinRel).length) && par) { if (!gF) gF = mk({ sex: 'M' }, true); if (!gM) gM = mk({ sex: 'F' }, true); }
      if (par && (gF || gM)) parents(par, gF, gM);
      for (const u of uncles) parents(u, gF, gM);
      const cousins = by(cousinRel); if (cousins.length) { let u = uncles[0]; if (!u) { u = mk({ sex: 'U' }, true); parents(u, gF, gM); } for (const c of cousins) { const q = keep(c); if (u.sex === 'F') q.motherId = u.id; else q.fatherId = u.id; } }
    };
    side('gpPat', 'unclePat', 'cousinPat', fa); side('gpMat', 'uncleMat', 'cousinMat', mo);
    for (const o of by('other')) keep(o);
    ped.v = 2; ped.persons = L; ped.partners = ped.partners || []; return ped;
  }
  const v2ById = (ped, id) => ped.persons.find(p => p.id === id) || null;
  const v2Children = (ped, id) => ped.persons.filter(p => p.fatherId === id || p.motherId === id);
  /** conjoints d'un individu : unions déclarées et co-parents */
  function v2Partners(ped, id) {
    const out = [];
    for (const u of ped.partners || []) { if (u[0] === id && !out.includes(u[1])) out.push(u[1]); if (u[1] === id && !out.includes(u[0])) out.push(u[0]); }
    for (const c of v2Children(ped, id)) { const o = c.fatherId === id ? c.motherId : c.fatherId; if (o && !out.includes(o)) out.push(o); }
    return out.filter(x => v2ById(ped, x));
  }
  const v2Key = (a, b) => [a, b].sort().join('|');
  const v2UnionOf = (ped, a, b) => (ped.partners || []).find(u => v2Key(u[0], u[1]) === v2Key(a, b));
  // disposition v2 (barycentres) : positions initiales des arbres convertis
  function layoutV2(ped0, Pat) {
    const ped = ped0.v === 2 ? ped0 : toV2(JSON.parse(JSON.stringify(ped0 || {})));
    const persons = ped.persons.map(p => p.id === 'proband' ? Object.assign({}, p, { sex: Pat && (Pat.sex === 'M' || Pat.sex === 'F') ? Pat.sex : 'U', status: 'affected', count: 1, label: (Pat && Pat.pseudo) || 'cas index', proband: true }) : p);
    const map = new Map(persons.map(p => [p.id, p])), gen = new Map([['proband', 0]]), Q = ['proband'];
    const par = p => [p.fatherId, p.motherId].filter(x => x && map.has(x)), kids = id => persons.filter(p => p.fatherId === id || p.motherId === id);
    while (Q.length) { const id = Q.shift(), g = gen.get(id), p = map.get(id);
      const nb = [...par(p).map(x => [x, g - 1]), ...kids(id).map(c => [c.id, g + 1]), ...v2Partners(ped, id).map(x => [x, g])];
      for (const [x, gx] of nb) if (!gen.has(x)) { gen.set(x, gx); Q.push(x); } }
    const others = persons.filter(p => !gen.has(p.id)), gMin = Math.min(...gen.values()), gMax = Math.max(...gen.values());
    // unités : un individu et ses conjoints de la même génération ([conjoint 1, individu, conjoint 2])
    const rows = new Map(); for (let g = gMin; g <= gMax; g++) rows.set(g, []);
    const used = new Set();
    const order0 = persons.filter(p => gen.has(p.id)).sort((a, b) => (par(b).length - par(a).length) || persons.indexOf(a) - persons.indexOf(b));
    for (const p of order0) {
      if (used.has(p.id)) continue; const g = gen.get(p.id), sp = v2Partners(ped, p.id).filter(x => !used.has(x) && gen.get(x) === g);
      const isMale = p.sex === 'M' || (p.sex === 'U' && p.id !== 'proband' && map.get(sp[0]) && map.get(sp[0]).sex === 'F');
      const unit = sp.length >= 2 ? [sp[0], p.id, sp[1]] : sp.length === 1 ? (isMale ? [p.id, sp[0]] : [sp[0], p.id]) : [p.id];
      unit.forEach(x => used.add(x)); rows.get(g).push({ ids: unit, x: 0 });
    }
    const unitOf = new Map(); for (const [, R] of rows) for (const u of R) u.ids.forEach((id, k) => unitOf.set(id, { u, k }));
    const X = id => { const r = unitOf.get(id); return r ? r.u.x + r.k * DX : 0; };
    const width = u => (u.ids.length - 1) * DX;
    // rangée posée de gauche à droite sans chevauchement, puis décalée pour un écart moyen nul aux positions voulues
    const pack = (R, desired) => { let right = -Infinity; R.forEach((u, i) => { u.x = Math.max(desired[i], right + DX); right = u.x + width(u); });
      const shift = R.reduce((a, u, i) => a + (desired[i] - u.x), 0) / Math.max(1, R.length); R.forEach(u => { u.x += shift; }); };
    const bary = (u, f) => { const v = u.ids.map(f).flat().filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    // ordre initial : parcours en largeur (côté paternel à gauche)
    for (const [, R] of rows) R.forEach((u, i) => { u.x = i * (DX * 3); });
    for (let it = 0; it < 4; it++) {
      for (let g = gMin + 1; g <= gMax; g++) { const R = rows.get(g); R.forEach(u => { u.key = bary(u, id => par(map.get(id)).map(X)); if (u.key == null) u.key = bary(u, id => v2Partners(ped, id).flatMap(x => par(map.get(x) || {}).map(X))); if (u.key == null) u.key = u.x; }); R.sort((a, b) => a.key - b.key); }
      // remontée : seules les unités sans parents dans l'arbre (ancêtres, conjoints venus d'ailleurs) se rangent sur leurs enfants
      for (let g = gMax - 1; g >= gMin; g--) { const R = rows.get(g); R.forEach(u => { const up = bary(u, id => par(map.get(id)).map(X)); u.key = up != null ? up : bary(u, id => kids(id).map(c => X(c.id))); if (u.key == null) u.key = u.x; }); R.sort((a, b) => a.key - b.key); }
      for (const [, R] of rows) pack(R, R.map(u => u.key - width(u) / 2));
    }
    // familles : enfants centrés sous le milieu du couple, puis parents centrés au-dessus de leurs enfants
    const famCenter = c => { const ps = par(c).map(X); return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : null; };
    for (let it = 0; it < 3; it++) {
      for (let g = gMin + 1; g <= gMax; g++) {
        const R = rows.get(g), want = R.map(u => { const fam = new Map(); u.ids.forEach(id => { const c = map.get(id), fc = famCenter(c); if (fc != null) fam.set(id, fc); }); if (!fam.size) return u.x;
          const [id, fc] = [...fam][0], sibs = persons.filter(q => gen.get(q.id) === g && v2Key(q.fatherId || '', q.motherId || '') === v2Key(map.get(id).fatherId || '', map.get(id).motherId || '')).map(q => q.id), i = sibs.indexOf(id), n = sibs.length;
          return fc + (i - (n - 1) / 2) * DX - u.ids.indexOf(id) * DX; });
        pack(R, want);
      }
      for (let g = gMax - 1; g >= gMin; g--) { const R = rows.get(g), want = R.map(u => { const ks = u.ids.flatMap(id => kids(id).map(c => X(c.id))); if (!ks.length) return u.x; return (Math.min(...ks) + Math.max(...ks)) / 2 - width(u) / 2; }); pack(R, want); }
    }
    // coordonnées
    const nodes = [], lines = [], gy = g => TOP + (g - gMin) * ROWH;
    for (const [g, R] of rows) for (const u of R) u.ids.forEach((id, k) => nodes.push({ p: map.get(id), x: u.x + k * DX, g, unit: u }));
    const oy = gy(gMax + 1); others.forEach((p, i) => nodes.push({ p, x: i * DX, g: gMax + 1, other: true }));
    const minX = Math.min(...nodes.map(n => n.x)), maxX = Math.max(...nodes.map(n => n.x));
    for (const n of nodes) { n.cx = 40 + (n.x - minX); n.cy = n.other ? oy : gy(n.g); }
    const N = new Map(nodes.map(n => [n.p.id, n]));
    // unions (trait horizontal entre conjoints adjacents)
    for (const [, R] of rows) for (const u of R) for (let k = 0; k + 1 < u.ids.length; k++) { const a = N.get(u.ids[k]), b = N.get(u.ids[k + 1]), un = v2UnionOf(ped, a.p.id, b.p.id), cons = (un && un[2] && un[2].consang) || ((a.p.id === map.get('proband').fatherId && b.p.id === map.get('proband').motherId || b.p.id === map.get('proband').fatherId && a.p.id === map.get('proband').motherId) && ped.consanguinity);
      lines.push({ x1: a.cx + SZ / 2, y1: a.cy, x2: b.cx - SZ / 2, y2: b.cy, dbl: !!cons, dashed: !!(a.p.ghost || b.p.ghost) }); }
    // filiations : une fratrie par couple (ou parent seul)
    const fams = new Map(); for (const c of persons) { const ps = par(c); if (!ps.length || !N.has(c.id)) continue; const k = ps.slice().sort().join('|'); if (!fams.has(k)) fams.set(k, { ps, kids: [] }); fams.get(k).kids.push(N.get(c.id)); }
    for (const { ps, kids: ks } of fams.values()) {
      const pn = ps.map(id => N.get(id)).filter(Boolean); if (!pn.length) continue;
      const adj = pn.length === 2 && pn[0].unit === pn[1].unit && Math.abs(pn[0].x - pn[1].x) <= DX + 1;
      const top = pn.length === 2 ? [(pn[0].cx + pn[1].cx) / 2, adj ? pn[0].cy : pn[0].cy + SZ / 2] : [pn[0].cx, pn[0].cy + SZ / 2];
      const ys = ks[0].cy - SZ / 2 - 18, xs = ks.map(n => n.cx);
      lines.push({ x1: top[0], y1: top[1], x2: top[0], y2: ys }); lines.push({ x1: Math.min(top[0], ...xs), y1: ys, x2: Math.max(top[0], ...xs), y2: ys });
      for (const n of ks) lines.push({ x1: n.cx, y1: ys, x2: n.cx, y2: n.cy - SZ / 2 });
    }
    const W = 80 + (maxX - minX), H = (others.length ? oy : gy(gMax)) + 70;
    return { nodes, lines, W, H, otherY: others.length ? oy : null, ped };
  }


  // ================================================================ modèle v3
  const PERSON = { sex: 'U', status: 'none', count: 1, label: '', notes: '' };
  const fresh = () => ({ v: 3, persons: [Object.assign({ id: 'proband', proband: true, gen: 0, x: 0 }, PERSON)], links: [], notes: '' });
  const byId = (ped, id) => ped.persons.find(p => p.id === id) || null;
  const linksOf = (ped, id, type) => ped.links.filter(l => (!type || l.type === type) && (l.a === id || l.b === id));
  const parentsOf = (ped, id) => ped.links.filter(l => l.type === 'filiation' && l.b === id).map(l => l.a).filter(x => byId(ped, x));
  const childrenOf = (ped, id) => ped.links.filter(l => l.type === 'filiation' && l.a === id).map(l => l.b).filter(x => byId(ped, x));
  const partnersOf = (ped, id) => ped.links.filter(l => l.type === 'union' && (l.a === id || l.b === id)).map(l => l.a === id ? l.b : l.a).filter(x => byId(ped, x));
  const findLink = (ped, type, a, b) => ped.links.find(l => l.type === type && ((l.a === a && l.b === b) || (type !== 'filiation' && l.a === b && l.b === a))) || null;
  /** composantes de fratrie (liens « fratrie » explicites) : id → racine */
  function sibComp(ped) {
    const up = new Map(), f = x => { while (up.get(x) !== x) { up.set(x, up.get(up.get(x))); x = up.get(x); } return x; };
    for (const l of ped.links) if (l.type === 'sibling') { for (const x of [l.a, l.b]) if (!up.has(x)) up.set(x, x); up.set(f(l.a), f(l.b)); }
    const out = new Map(); for (const x of up.keys()) out.set(x, f(x)); return out;
  }
  const compMates = (comp, id) => comp.has(id) ? [...comp.keys()].filter(x => x !== id && comp.get(x) === comp.get(id)) : [];
  /** frères et sœurs : au moins un parent commun, ou même fratrie déclarée */
  function siblingsOf(ped, id, comp) {
    comp = comp || sibComp(ped); const ps = parentsOf(ped, id), out = new Set(compMates(comp, id));
    for (const p of ps) for (const c of childrenOf(ped, p)) if (c !== id) out.add(c);
    return [...out].filter(x => byId(ped, x));
  }

  /** v2 → v3 : générations et positions de la disposition v2, liens explicites, consanguinité déclarée sur l'union des parents */
  function fromV2(ped) {
    const Lt = layoutV2(ped, null), pos = new Map(Lt.nodes.map(n => [n.p.id, n]));
    const persons = ped.persons.map(p => { const n = pos.get(p.id), q = Object.assign({}, PERSON, { id: p.id, sex: p.sex || 'U', status: p.status || 'none', count: p.count || 1, label: p.label || '', notes: p.notes || '', gen: n ? n.g : 0, x: n ? n.cx : 0 });
      if (p.deceased) q.deceased = true; if (p.ghost) q.ghost = true; if (p.id === 'proband') q.proband = true; return q; });
    const out = { v: 3, persons, links: [], notes: ped.notes || '' }, ok = id => persons.some(p => p.id === id);
    const add = (t, a, b, o) => { if (ok(a) && ok(b) && a !== b && !findLink(out, t, a, b)) out.links.push(Object.assign({ id: lid(), type: t, a, b }, o || {})); };
    for (const u of ped.partners || []) add('union', u[0], u[1], u[2] && u[2].consang ? { consang: true } : null);
    for (const p of ped.persons) { if (p.fatherId) add('filiation', p.fatherId, p.id); if (p.motherId) add('filiation', p.motherId, p.id); if (p.fatherId && p.motherId) add('union', p.fatherId, p.motherId); }
    if (ped.consanguinity) {   // v1 / v2 : « parents apparentés » → consanguinité déclarée de l'union des parents du cas index
      const P0 = byId(out, 'proband'), ps = parentsOf(out, 'proband').map(id => byId(out, id));
      while (ps.length < 2) { const sex = ps.length && ps[0].sex === 'M' ? 'F' : ps.length && ps[0].sex === 'F' ? 'M' : ps.length ? 'U' : 'M';
        const q = Object.assign({}, PERSON, { id: uid(), sex, gen: P0.gen - 1, x: P0.x + (ps.length ? DX / 2 : -DX / 2), ghost: true }); persons.push(q); add('filiation', q.id, 'proband'); ps.push(q); }
      add('union', ps[0].id, ps[1].id); const u = findLink(out, 'union', ps[0].id, ps[1].id); if (u) u.consang = true;
    }
    return out;
  }
  /** lecture d'un arbre quel que soit son format ; renvoie un arbre v3 (nouvel objet pour v1 / v2) */
  function migrate(ped) {
    if (!ped) return fresh();
    if (ped.v !== 3) { if (ped.v !== 2) toV2(ped); return fromV2(ped); }
    ped.persons = ped.persons || []; ped.links = (ped.links || []).filter(l => byId(ped, l.a) && byId(ped, l.b));
    if (!byId(ped, 'proband')) ped.persons.unshift(Object.assign({ id: 'proband', proband: true, gen: 0, x: 0 }, PERSON));
    for (const p of ped.persons) { if (typeof p.gen !== 'number') p.gen = 0; if (typeof p.x !== 'number') p.x = Math.max(0, ...ped.persons.filter(q => typeof q.x === 'number' && q !== p).map(q => q.x)) + DX; }
    return ped;
  }

  // ================================================================ parenté et consanguinité
  /** parents d'un individu pour le calcul de parenté : les siens, ceux de ses frères et sœurs déclarés, sinon des parents
   *  virtuels communs à la fratrie (frères et sœurs dont les parents ne sont pas dessinés) */
  function parentsEff(ped, id, comp) {
    const out = new Set(parentsOf(ped, id)), mates = compMates(comp, id);
    for (const m of mates) for (const p of parentsOf(ped, m)) if (out.size < 2) out.add(p);
    if (mates.length) for (let k = 1; out.size < 2; k++) out.add('V' + k + ':' + comp.get(id));
    return [...out];
  }
  function ancestors(ped, id, comp) {
    const out = new Map([[id, 0]]), Q = [id];
    while (Q.length) { const x = Q.shift(), d = out.get(x); if (x.startsWith('V')) continue; for (const p of parentsEff(ped, x, comp)) if (!out.has(p)) { out.set(p, d + 1); Q.push(p); } }
    return out;
  }
  const frac = terms => { if (!terms.length) return ''; const K = Math.max(...terms); let num = terms.reduce((s, n) => s + 2 ** (K - n), 0), den = 2 ** K; while (num % 2 === 0 && den > 1) { num /= 2; den /= 2; } return num + '/' + den; };
  /** lien de parenté entre deux personnes de l'arbre : { label, F (coefficient de consanguinité de leurs enfants, texte), common } ou null */
  function relatedness(ped, a, b, comp) {
    comp = comp || sibComp(ped); const A = ancestors(ped, a, comp), B = ancestors(ped, b, comp);
    const common = [...A.keys()].filter(x => B.has(x)); if (!common.length) return null;
    const anc = new Map(common.map(c => [c, ancestors(ped, c, comp)]));
    const lca = common.filter(c => !common.some(d => d !== c && anc.get(d).has(c)));   // ancêtres communs les plus proches
    const terms = lca.map(c => A.get(c) + B.get(c) + 1), best = lca.slice().sort((x, y) => (A.get(x) + B.get(x)) - (A.get(y) + B.get(y)))[0];
    const da = A.get(best), db = B.get(best), lo = Math.min(da, db), hi = Math.max(da, db);
    const label = lo === 0 ? 'ascendant et descendant' : lo === 1 && hi === 1 ? (lca.length >= 2 ? 'frère et sœur' : 'demi-frère et demi-sœur') : lo === 1 && hi === 2 ? 'oncle ou tante et neveu ou nièce'
      : lo === 2 && hi === 2 ? (lca.length >= 2 ? 'cousins germains' : 'demi-cousins germains') : lo === 2 && hi === 3 ? 'cousins germains, une génération d’écart' : lo === 3 && hi === 3 ? 'cousins issus de germains' : 'apparentés (ancêtre commun à ' + da + ' et ' + db + ' générations)';
    return { label, F: frac(terms), common: lca.filter(c => !c.startsWith('V')) };
  }
  /** unions consanguines : calculées (ancêtre commun dans l'arbre) ou déclarées */
  function consanguinities(ped) {
    const comp = sibComp(ped), out = [];
    for (const l of ped.links) if (l.type === 'union') { const r = relatedness(ped, l.a, l.b, comp); if (r || l.consang) out.push({ link: l, a: l.a, b: l.b, rel: r, declared: !!l.consang }); }
    return out;
  }

  /** lien de parenté au cas index, en clair (libellé par défaut du symbole) */
  function kinship(ped, p) {
    if (p.id === 'proband') return 'cas index';
    const comp = sibComp(ped), f = p.sex === 'F', m = p.sex === 'M', n = p.count > 1, g = (a, b, c) => n ? c || a + 's' : f ? b : m ? a : a + ' / ' + b;
    const par = id => parentsOf(ped, id), pP = par('proband'), sexOf = id => (byId(ped, id) || {}).sex;
    const side = id => sexOf(id) === 'M' ? ' pat.' : sexOf(id) === 'F' ? ' mat.' : '';
    if (pP.includes(p.id)) return m ? 'père' : f ? 'mère' : 'parent';
    const sib = siblingsOf(ped, 'proband', comp);
    if (sib.includes(p.id)) { const sh = par(p.id).filter(x => pP.includes(x)), half = sh.length === 1 && (par(p.id).length === 2 || pP.length === 2) && !compMates(comp, 'proband').includes(p.id); return (half ? 'demi-' : '') + g('frère', 'sœur', 'frères / sœurs'); }
    for (const x of pP) if (par(x).includes(p.id)) return g('grand-père', 'grand-mère', 'grands-parents') + side(x);
    for (const x of pP) if (siblingsOf(ped, x, comp).includes(p.id)) return g('oncle', 'tante', 'oncles / tantes') + side(x);
    for (const x of pP) for (const u of siblingsOf(ped, x, comp)) if (par(p.id).includes(u)) return n ? 'cousins' : f ? 'cousine' : m ? 'cousin' : 'cousin(e)';
    if (par(p.id).includes('proband')) return g('fils', 'fille', 'enfants');
    if (par(p.id).some(x => par(x).includes('proband'))) return g('petit-fils', 'petite-fille', 'petits-enfants');
    if (par(p.id).some(x => sib.includes(x))) return g('neveu', 'nièce', 'neveux / nièces');
    if (partnersOf(ped, 'proband').includes(p.id)) return f ? 'conjointe' : m ? 'conjoint' : 'conjoint(e)';
    if (pP.some(x => partnersOf(ped, x).includes(p.id))) return f ? 'belle-mère' : m ? 'beau-père' : 'conjoint(e) d’un parent';
    if (sib.some(x => partnersOf(ped, x).includes(p.id))) return f ? 'belle-sœur' : m ? 'beau-frère' : 'conjoint(e) d’un frère ou d’une sœur';
    if (childrenOf(ped, 'proband').some(x => partnersOf(ped, x).includes(p.id))) return f ? 'belle-fille' : m ? 'gendre' : 'conjoint(e) d’un enfant';
    if (partnersOf(ped, 'proband').some(x => par(x).includes(p.id))) return f ? 'belle-mère' : m ? 'beau-père' : 'parent du conjoint';
    return 'apparenté';
  }

  // ================================================================ disposition et rendu
  /** coordonnées : rangée = génération, x = position enregistrée ; edit : une rangée et une colonne libres autour (ajouts) */
  function layout(ped0, Pat, edit) {
    const ped = ped0 && ped0.v === 3 ? ped0 : migrate(JSON.parse(JSON.stringify(ped0 || {})));
    const persons = ped.persons.map(p => p.id === 'proband' ? Object.assign({}, p, { sex: Pat && (Pat.sex === 'M' || Pat.sex === 'F') ? Pat.sex : (p.sex || 'U'), status: 'affected', count: 1, label: (Pat && Pat.pseudo) || 'cas index', proband: true }) : p);
    const gens = persons.map(p => p.gen), xs = persons.map(p => p.x);
    const g0 = Math.min(...gens) - (edit ? 1 : 0), g1 = Math.max(...gens) + (edit ? 1 : 0), x0 = Math.min(...xs) - (edit ? DX : 0), x1 = Math.max(...xs) + (edit ? DX : 0);
    const T = { x: x => x - x0 + PAD, y: g => TOP + (g - g0) * ROWH, mx: X => X + x0 - PAD, mg: Y => g0 + Math.round((Y - TOP) / ROWH) };
    const nodes = persons.map(p => ({ p, cx: T.x(p.x), cy: T.y(p.gen) })), N = new Map(nodes.map(n => [n.p.id, n])), lines = [];
    const comp = sibComp(ped), rel = new Map(consanguinities(ped).map(c => [c.link.id, c]));
    // unions
    for (const l of ped.links) if (l.type === 'union') {
      const A = N.get(l.a), B = N.get(l.b); if (!A || !B) continue; const [L, R] = A.cx <= B.cx ? [A, B] : [B, A], c = rel.get(l.id);
      const title = c ? (c.rel ? `Union consanguine : ${c.rel.label} (F des enfants = ${c.rel.F})` : 'Union consanguine (déclarée)') : 'Union';
      lines.push({ x1: L.cx + SZ / 2, y1: L.cy, x2: R.cx - SZ / 2, y2: R.cy, dbl: !!c, dashed: !!(A.p.ghost || B.p.ghost), links: [l.id], title });
    }
    // fratries : enfants d'un même couple (ou parent seul), ou frères et sœurs déclarés sans parents dessinés
    const groups = new Map();
    for (const n of nodes) {
      const id = n.p.id, ps = parentsOf(ped, id); let key = null;
      if (ps.length) key = 'p:' + ps.slice().sort().join('|');
      else if (comp.has(id)) { const w = compMates(comp, id).find(x => parentsOf(ped, x).length && byId(ped, x).gen === n.p.gen); key = w ? 'p:' + parentsOf(ped, w).slice().sort().join('|') : 's:' + comp.get(id); }
      if (key) { if (!groups.has(key)) groups.set(key, []); groups.get(key).push(n); }
    }
    for (const [key, ks0] of groups) {
      const gen = ks0[0].p.gen, ks = ks0.filter(n => n.p.gen === gen).sort((a, b) => a.cx - b.cx), ys = ks[0].cy - SZ / 2 - 18;
      let top = null; const pn = key.startsWith('p:') ? key.slice(2).split('|').map(id => N.get(id)).filter(Boolean) : [];
      if (pn.length === 2) top = [(pn[0].cx + pn[1].cx) / 2, (pn[0].cy + pn[1].cy) / 2]; else if (pn.length === 1) top = [pn[0].cx, pn[0].cy + SZ / 2];
      if (!top && ks.length < 2) continue;
      const kidLinks = n => ped.links.filter(l => (l.type === 'filiation' && l.b === n.p.id) || (l.type === 'sibling' && (l.a === n.p.id || l.b === n.p.id))).map(l => l.id);
      const all = [...new Set(ks.flatMap(kidLinks))], X = ks.map(n => n.cx).concat(top ? [top[0]] : []), xa = Math.min(...X), xb = Math.max(...X);
      if (top) lines.push({ x1: top[0], y1: top[1], x2: top[0], y2: ys, links: all.filter(i => (ped.links.find(l => l.id === i) || {}).type === 'filiation'), title: 'Filiation' });
      if (xb > xa) lines.push({ x1: xa, y1: ys, x2: xb, y2: ys, links: all, title: top ? 'Fratrie' : 'Fratrie (parents non dessinés)' });
      for (const n of ks) lines.push({ x1: n.cx, y1: ys, x2: n.cx, y2: n.cy - SZ / 2, links: kidLinks(n), title: top ? 'Filiation' : 'Fratrie' });
    }
    return { nodes, lines, W: (x1 - x0) + 2 * PAD, H: T.y(g1) + SZ / 2 + 44, T, ped };
  }

  const cut = (t, n) => { t = String(t); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
  /** symbole d'une personne (centre cx, cy) */
  function symbol(n, o) {
    const p = n.p, s = SZ, x = n.cx - s / 2, y = n.cy - s / 2, sex = p.sex || 'U', st = p.status || 'none';
    const shape = sex === 'M' ? `<rect x="${x}" y="${y}" width="${s}" height="${s}"/>` : sex === 'F' ? `<circle cx="${n.cx}" cy="${n.cy}" r="${s / 2}"/>` : `<polygon points="${n.cx},${y - 2} ${x + s + 2},${n.cy} ${n.cx},${y + s + 2} ${x - 2},${n.cy}"/>`;
    const clip = `pc_${o.uid}_${p.id}`, fill = st === 'affected' ? 'currentColor' : st === 'suspected' ? `url(#hatch_${o.uid})` : 'none';
    let g = `<g class="ped-n${p.ghost ? ' ghost' : ''}${p.proband ? ' proband' : ''}" data-id="${esc(p.id)}"><title>${esc((p.label || kinship(o.ped, p)) + (p.notes ? ' — ' + p.notes : ''))}</title><rect x="${x - 6}" y="${y - 6}" width="${s + 12}" height="${s + 30}" fill="#000" fill-opacity="0" pointer-events="all"/>`;
    if (st === 'carrier') g += `<clipPath id="${clip}"><rect x="${x - 3}" y="${y - 3}" width="${s / 2 + 3}" height="${s + 6}"/></clipPath><g clip-path="url(#${clip})" fill="currentColor" stroke="none">${shape}</g>`;
    g += `<g fill="${p.ghost ? 'none' : fill}" stroke="currentColor" stroke-width="1.8"${p.ghost ? ' stroke-dasharray="3 3" opacity=".45"' : ''}>${shape}</g>`;
    if (st === 'unknown' && !(p.count > 1)) g += `<text x="${n.cx}" y="${n.cy + 5}" text-anchor="middle" class="ped-q">?</text>`;
    if (p.count > 1) g += `<text x="${n.cx}" y="${n.cy + 5}" text-anchor="middle" class="ped-cnt">${p.count}</text>`;
    if (p.deceased) g += `<line x1="${x - 5}" y1="${y + s + 5}" x2="${x + s + 5}" y2="${y - 5}" stroke="currentColor" stroke-width="1.8"/>`;
    if (p.proband) g += `<path d="M${x - 24},${n.cy + 14} L${x - 4},${n.cy + 3}" stroke="currentColor" stroke-width="1.8" fill="none" marker-end="url(#arr_${o.uid})"/>`;
    // lien de parenté calculé : traduit avant le découpage en lignes (« grand-père mat. » → « maternal grandfather ») ; nom saisi : tel quel
    const auto = p.proband || !p.label, I = SV.I18n, tr = t => auto && t && I && I.lang === 'en' && typeof I.t === 'function' ? I.t(t) : t;
    const lab = tr(p.proband ? 'cas index' : (p.label || (p.ghost ? '' : kinship(o.ped, p))));
    // libellé sur deux lignes au plus (pas de chevauchement entre voisins à 80 px)
    let ly = n.cy + s / 2 + 14;
    if (lab) { const w = String(lab).split(' '), lines2 = []; let cur = ''; for (const x2 of w) { if ((cur + ' ' + x2).trim().length > 12 && cur) { lines2.push(cur); cur = x2; } else cur = (cur + ' ' + x2).trim(); } if (cur) lines2.push(cur);
      lines2.slice(0, 2).forEach((t, i) => { g += `<text x="${n.cx}" y="${ly}" text-anchor="middle" class="ped-l${auto ? ' notr' : ''}">${esc(cut(t, 13))}${i === 1 && lines2.length > 2 ? '…' : ''}</text>`; ly += 12; }); }
    if (p.notes && !p.ghost) g += `<text x="${n.cx}" y="${ly}" text-anchor="middle" class="ped-m">${esc(cut(p.notes, 15))}</text>`;
    return g + '</g>';
  }

  /** SVG de l'arbre (couleur = currentColor du conteneur) ; opts.edit : marges d'ajout et traits cliquables (data-links) */
  function svg(ped, P, opts) {
    opts = opts || {}; const Lt = layout(ped || null, P || {}, !!opts.edit), o = Object.assign({ uid: Math.random().toString(36).slice(2, 7), ped: Lt.ped }, opts);
    const defs = `<defs><pattern id="hatch_${o.uid}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke="currentColor" stroke-width="1.6"/></pattern><marker id="arr_${o.uid}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>`;
    const ln = Lt.lines.map(l => (l.dbl ? `<line x1="${l.x1}" y1="${l.y1 - 2.5}" x2="${l.x2}" y2="${l.y2 - 2.5}" stroke="currentColor" stroke-width="1.5"/><line x1="${l.x1}" y1="${l.y1 + 2.5}" x2="${l.x2}" y2="${l.y2 + 2.5}" stroke="currentColor" stroke-width="1.5"/>` : `<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke="currentColor" stroke-width="1.5"${l.dashed ? ' stroke-dasharray="4 3" opacity=".55"' : ''}/>`)
      + (opts.edit && l.links && l.links.length ? `<line class="ped-hit" data-links="${esc(l.links.join(' '))}" x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}"><title>${esc(l.title || '')}</title></line>` : '')).join('');
    return `<svg class="ped-svg${opts.edit ? ' ped-edit' : ''}" viewBox="0 0 ${Lt.W} ${Lt.H}" width="${Lt.W}" height="${Lt.H}" xmlns="http://www.w3.org/2000/svg">${defs}<style>.ped-l{font:11px system-ui,sans-serif;fill:currentColor}.ped-m{font:10px system-ui,sans-serif;fill:currentColor;opacity:.7}.ped-q,.ped-cnt{font:700 13px system-ui,sans-serif;fill:currentColor;paint-order:stroke;stroke:var(--bg2,#fff);stroke-width:3px}.ped-hit{stroke:transparent;stroke-width:12;cursor:pointer}</style>${ln}${Lt.nodes.map(n => symbol(n, o)).join('')}</svg>`;
  }

  // ================================================================ édition
  const opp = s => s === 'M' ? 'F' : s === 'F' ? 'M' : 'U';
  const Ed = {
    person(ped, o) { const p = Object.assign({ id: uid() }, PERSON, o || {}); ped.persons.push(p); return p; },
    link(ped, type, a, b, o) { if (!a || !b || a === b) return null; let l = findLink(ped, type, a, b); if (!l) { l = Object.assign({ id: lid(), type, a, b }, o || {}); ped.links.push(l); } return l; },
    /** filiation parent → enfant (générations voisines, deux parents au plus) ; deux parents d'un enfant sont unis */
    addFiliation(ped, parent, child, o) {
      const ps = parentsOf(ped, child), P = byId(ped, parent), C = byId(ped, child);
      if (ps.includes(parent)) return { ok: true };
      if (ps.length >= 2) return { err: 'Cette personne a déjà deux parents.' };
      if (!P || !C || P.gen !== C.gen - 1) return { err: 'Un parent est dans la rangée juste au-dessus de son enfant.' };
      const l = this.link(ped, 'filiation', parent, child, o); if (ps.length === 1) this.link(ped, 'union', ps[0], parent);
      return { ok: true, link: l };
    },
    /** les voisins s'écartent pour laisser la place (écart d'au moins DX), de part et d'autre de la personne placée */
    makeRoom(ped, p, tie) {
      const row = ped.persons.filter(q => q !== p && q.gen === p.gen), right = row.filter(q => q.x > p.x || (q.x === p.x && tie !== 'left')).sort((a, b) => a.x - b.x), left = row.filter(q => !right.includes(q)).sort((a, b) => b.x - a.x);
      let lim = p.x; for (const q of right) { if (q.x < lim + DX) q.x = lim + DX; lim = q.x; }
      lim = p.x; for (const q of left) { if (q.x > lim - DX) q.x = lim - DX; lim = q.x; }
    },
    /** où irait une personne ajoutée près de id : zone up (parent), down (enfant), left / right (même génération) */
    placement(ped, id, zone) {
      const A = byId(ped, id); if (!A) return { err: '?' };
      if (zone === 'up') {
        const ps = parentsOf(ped, id).map(x => byId(ped, x));
        if (ps.length >= 2) return { err: 'deux parents déjà', gen: A.gen - 1, x: A.x };
        if (ps.length === 1) return { kind: 'parent', gen: A.gen - 1, x: ps[0].x + (ps[0].x <= A.x ? DX : -DX) };
        const grp = [A].concat(compMates(sibComp(ped), id).map(x => byId(ped, x)).filter(q => q && q.gen === A.gen && !parentsOf(ped, q.id).length));
        return { kind: 'parent', gen: A.gen - 1, x: grp.reduce((s, q) => s + q.x, 0) / grp.length };
      }
      if (zone === 'down') {
        const sp = partnersOf(ped, id), co = sp.length === 1 ? byId(ped, sp[0]) : null;
        const kids = childrenOf(ped, id).filter(k => !co || parentsOf(ped, k).includes(co.id)).map(k => byId(ped, k));
        return { kind: 'child', gen: A.gen + 1, co: co && co.id, x: kids.length ? Math.max(...kids.map(k => k.x)) + DX : co ? (A.x + co.x) / 2 : A.x };
      }
      // même génération : à côté ; si la place est prise, dans l'intervalle (les voisins s'écartent à l'ajout)
      const sx = A.x + (zone === 'left' ? -DX : DX), taken = ped.persons.some(q => q !== A && q.gen === A.gen && Math.abs(q.x - sx) < DX * 0.6);
      return { kind: 'side', gen: A.gen, x: taken ? A.x + (zone === 'left' ? -DX : DX) / 2 : sx };
    },
    /** ajoute une personne près de id ; renvoie { p } ou { err } */
    addNear(ped, id, zone) {
      const A = byId(ped, id), pl = this.placement(ped, id, zone); if (pl.err) return { err: pl.err === 'deux parents déjà' ? 'Cette personne a déjà deux parents.' : pl.err };
      if (pl.kind === 'parent') {
        const ps = parentsOf(ped, id), q0 = ps[0] ? byId(ped, ps[0]) : null, p = this.person(ped, { gen: pl.gen, x: pl.x, sex: q0 ? opp(q0.sex) : 'U' });
        // parent de toute la fratrie qui a les mêmes parents (ou aucun)
        const key = ps.slice().sort().join('|'), mates = siblingsOf(ped, id).filter(m => byId(ped, m).gen === A.gen && parentsOf(ped, m).slice().sort().join('|') === key);
        for (const c of [id].concat(mates)) this.addFiliation(ped, p.id, c);
        this.makeRoom(ped, p, 'right'); return { p, kind: 'parent' };
      }
      if (pl.kind === 'child') { const p = this.person(ped, { gen: pl.gen, x: pl.x }); this.addFiliation(ped, id, p.id); if (pl.co) this.addFiliation(ped, pl.co, p.id); this.makeRoom(ped, p, 'right'); return { p, kind: 'child' }; }
      const p = this.person(ped, { gen: pl.gen, x: pl.x }); this.link(ped, 'sibling', id, p.id);
      for (const par of parentsOf(ped, id)) this.addFiliation(ped, par, p.id, { inh: true });
      this.makeRoom(ped, p, zone === 'left' ? 'left' : 'right'); return { p, kind: 'side', from: id };
    },
    /** lien tracé à la souris : filiation entre générations voisines ; union ou fratrie dans la même génération */
    connect(ped, a, b, type) {
      const A = byId(ped, a), B = byId(ped, b); if (!A || !B || a === b) return { err: '?' };
      if (A.gen === B.gen) { const t = type || 'union', other = t === 'union' ? 'sibling' : 'union', o = findLink(ped, other, a, b); if (o) ped.links = ped.links.filter(l => l !== o); return { link: this.link(ped, t, a, b) }; }
      if (Math.abs(A.gen - B.gen) === 1) { const [P, C] = A.gen < B.gen ? [A, B] : [B, A]; return this.addFiliation(ped, P.id, C.id); }
      return { err: 'Un lien relie la même génération (union, fratrie) ou deux générations voisines (parent, enfant).' };
    },
    /** fratrie → union : les parents repris lors de l'ajout « à côté » sont retirés */
    sibToUnion(ped, l) {
      ped.links = ped.links.filter(x => x !== l && !(x.type === 'filiation' && x.inh && (x.b === l.a || x.b === l.b)));
      return this.link(ped, 'union', l.a, l.b);
    },
    unionToSib(ped, l) { ped.links = ped.links.filter(x => x !== l); return this.link(ped, 'sibling', l.a, l.b); },
    removeLink(ped, l) { ped.links = ped.links.filter(x => x !== l); },
    /** retire un individu et ses liens (ses enfants restent) */
    remove(ped, p) { if (p.id === 'proband') return; ped.persons = ped.persons.filter(x => x !== p); ped.links = ped.links.filter(l => l.a !== p.id && l.b !== p.id); },
    move(ped, p, x) { p.x = x; this.makeRoom(ped, p, 'right'); },
    /** remise en ordre : enfants répartis sous leurs parents, ancêtres au-dessus de leurs enfants, rangées sans chevauchement */
    tidy(ped) {
      const rows = new Map(); for (const p of ped.persons) { if (!rows.has(p.gen)) rows.set(p.gen, []); rows.get(p.gen).push(p); }
      const gens = [...rows.keys()].sort((a, b) => a - b), X = id => byId(ped, id).x;
      const pack = (R, want) => { R.sort((a, b) => want.get(a) - want.get(b) || a.x - b.x); let right = -Infinity; const xs = R.map(p => { const v = Math.max(want.get(p), right + DX); right = v; return v; });
        const sh = R.reduce((s, p, i) => s + want.get(p) - xs[i], 0) / R.length; R.forEach((p, i) => { p.x = Math.round(xs[i] + sh); }); };
      for (let it = 0; it < 4; it++) {
        for (const g of gens) { const R = rows.get(g).slice().sort((a, b) => a.x - b.x), want = new Map(), fam = new Map();
          for (const p of R) { const ps = parentsOf(ped, p.id); if (ps.length) { const k = ps.slice().sort().join('|'); if (!fam.has(k)) fam.set(k, []); fam.get(k).push(p); } }
          for (const [k, kids] of fam) { const ids = k.split('|'), c = ids.reduce((s, id) => s + X(id), 0) / ids.length; kids.forEach((p, i) => want.set(p, c + (i - (kids.length - 1) / 2) * DX)); }
          for (const p of R) if (!want.has(p)) { const sp = partnersOf(ped, p.id).map(id => byId(ped, id)).find(q => q.gen === g && want.has(q)); want.set(p, sp ? want.get(sp) + (p.x < sp.x ? -DX : DX) : p.x); }
          pack(R, want); }
        for (const g of gens.slice().reverse()) { const R = rows.get(g).slice().sort((a, b) => a.x - b.x), want = new Map();
          for (const p of R) { const ks = childrenOf(ped, p.id);
            if (ks.length && !parentsOf(ped, p.id).length) { const xs = ks.map(X); let c = (Math.min(...xs) + Math.max(...xs)) / 2; const co = partnersOf(ped, p.id).find(id => byId(ped, id).gen === g && childrenOf(ped, id).some(k => ks.includes(k))); if (co) c += p.x < X(co) ? -DX / 2 : DX / 2; want.set(p, c); }
            else want.set(p, p.x); }
          pack(R, want); }
      }
    },
  };
  /** l'arbre contient-il quelque chose à montrer ? */
  const hasContent = ped => !!(ped && ((ped.persons || []).some(p => p.id !== 'proband') || (ped.links || []).length || ped.consanguinity || ped.notes));
  SV.Pedigree = { svg, layout, hasContent, migrate, kinship, relatedness, consanguinities, parentsOf, partnersOf, childrenOf, siblingsOf, linksOf, findLink, byId, Ed, SZ, DX, ROWH };
})(window.SV = window.SV || {});
