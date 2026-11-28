#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Poids pour l'âge du CDC (CDC 2000 Growth Charts, 2–20 ans) → src/growth_cdc.js (v3.4.0)

L'OMS ne donne pas de référence du poids pour l'âge après 10 ans ; EpiScope prend le relais du CDC entre 10 et 20 ans
(raccord progressif de 9 à 10 ans dans growth.js). Coefficients LMS (Box-Cox) par sexe, un point par mois de 24 à 240 mois.
Données du gouvernement des États-Unis (domaine public) : Kuczmarski RJ et al., 2000 CDC Growth Charts for the United
States: methods and development, Vital Health Stat 11 (246), 2002 — fichier wtage.csv du CDC
(https://www.cdc.gov/growthcharts/data/zscore/wtage.csv : colonnes Sex (1 garçon, 2 fille), Agemos, L, M, S).

    python3 tools/make_growth_cdc.py wtage.csv
    (accepte aussi une table JSON { measurement: { weight: { male: [{decimal_age, L, M, S}], female: [...] } } })
"""
import sys, os, csv, json
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
MONTH, YEAR = 30.4375, 365.25
src = sys.argv[1]
rows = {'M': [], 'F': []}
if src.endswith('.json'):
    T = json.load(open(src, encoding='utf-8'))['measurement']['weight']
    for sx, k in [('M', 'male'), ('F', 'female')]:
        rows[sx] = [(float(r['decimal_age']) * 12, float(r['L']), float(r['M']), float(r['S'])) for r in T[k]]
else:
    for r in csv.DictReader(open(src, encoding='utf-8-sig')):
        if not r.get('Sex') or r['Sex'].strip() not in ('1', '2'): continue
        rows['M' if r['Sex'].strip() == '1' else 'F'].append((float(r['Agemos']), float(r['L']), float(r['M']), float(r['S'])))
out = {'source': 'CDC 2000 Growth Charts (Kuczmarski et al. 2002), weight-for-age, 2–20 y — public domain'}
for sx in ('M', 'F'):
    R = sorted(rows[sx]); assert len(R) > 200, f'{sx}: {len(R)} lignes'
    def at(m):
        for a, b in zip(R, R[1:]):
            if a[0] <= m <= b[0]:
                f = (m - a[0]) / (b[0] - a[0] or 1); return [a[i] + f * (b[i] - a[i]) for i in (1, 2, 3)]
        return None
    months = [m for m in range(24, 241)] ; vals = [(m, at(m if m < 240 else 239.999)) for m in months]
    vals = [(m, v) for m, v in vals if v]
    out[sx] = {'d': [round(m * MONTH, 2) for m, _ in vals], 'L': [round(v[0], 5) for _, v in vals], 'M': [round(v[1], 4) for _, v in vals], 'S': [round(v[2], 5) for _, v in vals]}
txt = ('/* généré par tools/make_growth_cdc.py — ne pas éditer. Poids pour l’âge du CDC (CDC 2000 Growth Charts, 2–20 ans,\n'
       ' * Kuczmarski et al. 2002 ; domaine public) : relais de l’OMS après 10 ans. */\n'
       '(function (factory) { const G = typeof window !== \'undefined\' ? (window.SV = window.SV || {}) : (globalThis.SV = globalThis.SV || {}); factory(G); })(function (SV) {\n'
       '  SV.GrowthData = SV.GrowthData || {}; SV.GrowthData.cdc = { wt: ' + json.dumps(out, separators=(',', ':'), ensure_ascii=False) + ' };\n});\n')
p = os.path.join(ROOT, 'src', 'growth_cdc.js'); open(p, 'w', encoding='utf-8').write(txt)
print(p, len(txt) // 1024, 'Ko', {sx: len(out[sx]['d']) for sx in ('M', 'F')})
