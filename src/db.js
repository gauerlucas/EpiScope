/* EpiScope — db.js : base de référence (signes, priors signe→région, régions, liens réseau,
   évidence Semio2Brain). Tout est éditable à chaud ; les CSV de data/ sont la source canonique. */
(function (SV) {
  'use strict';

  const CATEGORIES = [
    { id: 'aura_sensory', fr: 'Auras sensorielles', color: '#f2b84b' },
    { id: 'aura_experiential', fr: 'Expérientiel / psychique', color: '#d98cf0' },
    { id: 'awareness', fr: 'Conscience', color: '#8fb5ff' },
    { id: 'language', fr: 'Langage', color: '#6fd6c9' },
    { id: 'motor_elementary', fr: 'Moteur élémentaire', color: '#ff7a59' },
    { id: 'motor_complex', fr: 'Automatismes / moteur complexe', color: '#ffb36b' },
    { id: 'autonomic', fr: 'Végétatif', color: '#9fe08a' },
    { id: 'postictal', fr: 'Post-critique', color: '#9aa4b2' },
  ];
  const TOPO_LABELS = { face: 'Face', UL: 'Membre sup.', LL: 'Membre inf.', trunk: 'Tronc', hemibody: 'Hémicorps' };
  const LAT_LABELS = { contra: 'controlatéral', ipsi: 'ipsilatéral', none: 'non latéralisant', dominant: 'hémisphère dominant', nondominant: 'hémisphère non dominant' };

  class DB {
    constructor(raw) { this.load(raw); }

    load(raw) {
      this.raw = raw;
      this.meta = raw.meta || {};
      this.signs = (raw.signs || []).map(s => Object.assign({}, s, {
        subjective: String(s.subjective) === '1' || s.subjective === true,
        default_duration_s: parseFloat(s.default_duration_s) || 10,
        lateralizing_value: s.lateralizing_value === '' || s.lateralizing_value == null ? (s.laterality_rule && s.laterality_rule !== 'none' ? 0.7 : 0) : parseFloat(s.lateralizing_value) || 0,
        topography_list: (s.topography || '').split('|').map(x => x.trim()).filter(Boolean),
      }));
      this.signById = new Map(this.signs.map(s => [s.id, s]));
      this.regions = raw.regions || [];
      this.regionByFamily = new Map(this.regions.map(r => [r.family, r]));
      this.priors = (raw.priors || []).map(p => Object.assign({}, p, { weight: parseFloat(p.weight) || 0 }))
        .filter(p => this.signById.has(p.sign_id) && this.regionByFamily.has(p.family));
      this.edges = (raw.edges || []).map(e => Object.assign({}, e, { weight: parseFloat(e.weight) || 0 }))
        .filter(e => this.regionByFamily.has(e.family_a) && this.regionByFamily.has(e.family_b) && e.weight > 0);
      this.s2bMap = raw.s2b_map || [];
      this.s2b = raw.s2b || [];
      this.s2bFilter = raw.s2b_filter || 'spontaneous';
      this._index();
    }

    _index() {
      this.priorsBySign = new Map();
      for (const p of this.priors) {
        if (!this.priorsBySign.has(p.sign_id)) this.priorsBySign.set(p.sign_id, []);
        this.priorsBySign.get(p.sign_id).push(p);
      }
      // Semio2Brain : category → sign_ids, puis score par (sign, family) = max sur catégories
      this.s2bBySign = new Map();
      const catToSigns = new Map();
      for (const m of this.s2bMap) catToSigns.set(m.semio2brain_category, { ids: m.sign_ids.split('|'), blend: parseFloat(m.blend) || 1 });
      for (const row of this.s2b) {
        const m = catToSigns.get(row.category); if (!m) continue;
        const sc = (parseFloat(row.score) || 0) * m.blend;
        for (const id of m.ids) {
          if (!this.s2bBySign.has(id)) this.s2bBySign.set(id, new Map());
          const fm = this.s2bBySign.get(id);
          fm.set(row.family, Math.max(fm.get(row.family) || 0, sc));
        }
      }
    }

    category(id) { return CATEGORIES.find(c => c.id === id) || { id, fr: id, color: '#888' }; }
    /** le signe désigne-t-il une zone symptomatogène propre ? (faux si toutes ses lignes sont de rôle propagation, ex. généralisation) */
    hasSymptomatogenic(signId) { const rows = this.priorsBySign.get(signId) || []; return rows.some(r => r.role !== 'propagation'); }
    signsOf(cat) { return this.signs.filter(s => s.category === cat); }

    /** recherche plein texte simple sur libellés + synonymes */
    search(q) {
      q = (q || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      if (!q) return this.signs;
      const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      return this.signs.filter(s => norm(s.label_fr + ' ' + s.label_en + ' ' + s.synonyms + ' ' + s.id).includes(q));
    }

    /** Poids par famille pour un signe donné et une topographie d'événement (sans hémisphère).
     *  Combine priors curés (max par famille) et Semio2Brain (noisy-OR, pondéré par s2bWeight).
     *  ctx.phase ('early'|'mid'|'late') module les lignes à phase ; ctx.forOnset pondère par rôle
     *  (onset/both 1, symptomatogenic 0.9, propagation 0.35) pour le score d'origine. */
    familyWeights(signId, topography, s2bWeight, ctx) {
      ctx = ctx || {};
      const out = new Map();
      const rows = this.priorsBySign.get(signId) || [];
      const ROLE_ONSET = { onset: 1, both: 1, symptomatogenic: 0.9, propagation: 0.35 };
      for (const p of rows) {
        let w = p.weight;
        if (p.topography) {
          if (topography) { if (p.topography !== topography) continue; }
          else w *= 0.6; // topographie inconnue : les lignes spécifiques comptent partiellement
        }
        if (p.phase && ctx.phase) {
          if (p.phase !== ctx.phase) w *= ctx.phase === 'mid' ? 0.7 : 0.35;
        }
        if (ctx.forOnset) w *= ROLE_ONSET[p.role] == null ? 0.9 : ROLE_ONSET[p.role];
        if (w > (out.get(p.family) || 0)) out.set(p.family, w);
      }
      if (s2bWeight > 0) {
        const fm = this.s2bBySign.get(signId);
        if (fm) for (const [fam, sc] of fm) {
          const b = sc * s2bWeight, a = out.get(fam) || 0;
          out.set(fam, 1 - (1 - a) * (1 - b));
        }
      }
      return out;
    }

    // ---------- édition
    setPriors(signId, rows) {
      this.priors = this.priors.filter(p => p.sign_id !== signId).concat(rows.map(r => Object.assign({ sign_id: signId, phase: '' }, r, { weight: parseFloat(r.weight) || 0 })));
      this._index();
    }
    upsertSign(sign) {
      const i = this.signs.findIndex(s => s.id === sign.id);
      const s = Object.assign({}, sign, { topography_list: (sign.topography || '').split('|').map(x => x.trim()).filter(Boolean), default_duration_s: parseFloat(sign.default_duration_s) || 10, lateralizing_value: sign.laterality_rule === 'none' ? 0 : (parseFloat(sign.lateralizing_value) || 0.7) });
      if (i >= 0) this.signs[i] = s; else this.signs.push(s);
      this.signById = new Map(this.signs.map(x => [x.id, x]));
      this._index();
    }
    removeSign(id) {
      this.signs = this.signs.filter(s => s.id !== id); this.signById.delete(id);
      this.priors = this.priors.filter(p => p.sign_id !== id); this._index();
    }
    setEdges(edges) { this.edges = edges.map(e => Object.assign({}, e, { weight: parseFloat(e.weight) || 0 })).filter(e => e.weight > 0); }

    /** export de l'état courant au format du bundle (réinjectable) */
    toJSON() {
      return {
        meta: Object.assign({}, this.meta, { exported: new Date().toISOString() }),
        signs: this.signs.map(s => { const o = Object.assign({}, s); delete o.topography_list; o.subjective = s.subjective ? '1' : '0'; return o; }),
        priors: this.priors, regions: this.regions, edges: this.edges,
        s2b_map: this.s2bMap, s2b: this.s2b, s2b_filter: this.s2bFilter,
      };
    }
    csvSigns() { return SV.csv.toCSV(this.toJSON().signs, ['id', 'category', 'label_fr', 'label_en', 'subjective', 'topography', 'laterality_rule', 'lateralizing_value', 'default_duration_s', 'key', 'synonyms', 'notes']); }
    csvPriors() { return SV.csv.toCSV(this.priors, ['sign_id', 'family', 'topography', 'phase', 'weight', 'role', 'source', 'notes']); }
    csvEdges() { return SV.csv.toCSV(this.edges, ['family_a', 'family_b', 'weight', 'kind', 'name', 'source', 'notes']); }
    csvRegions() { return SV.csv.toCSV(this.regions, ['family', 'label_fr', 'lobe', 'system', 'ez_prior', 'notes']); }
  }

  SV.DB = DB; SV.CATEGORIES = CATEGORIES; SV.TOPO_LABELS = TOPO_LABELS; SV.LAT_LABELS = LAT_LABELS;
})(window.SV = window.SV || {});
