#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Normes de croissance d'EpiScope → src/growth_data.js (v4.19 : Dossier › Développement et examen clinique)

  - OMS (WHO Child Growth Standards 2006, 0–5 ans ; WHO Reference 2007, 5–19 ans) : coefficients LMS (Box-Cox) par sexe
    du poids (0–10 ans), de la taille (0–19 ans), de l'IMC (0–19 ans) et du périmètre crânien (0–5 ans ; pas de référence
    OMS au-delà) ; échantillonnés chaque semaine jusqu'à 13 semaines, puis chaque mois (interpolation linéaire des tables
    quotidiennes / mensuelles) ;
  - INTERGROWTH-21st, nouveau-né (Villar et al., Lancet 2014) : paramètres de la loi skew-t de type 3 (mu, sigma, nu, tau)
    par jour d'âge gestationnel de 33+0 à 42+6 SA, par sexe, pour le poids (kg), la taille (cm) et le PC (cm) ;
  - INTERGROWTH-21st, très grands prématurés (Villar et al., Lancet 2016) : modèles linéaires (24+0 à 32+6 SA).
Source des coefficients : paquet R growthstandards (ki-tools, licence MIT), fichiers data/who_coefs.rda, ig_coefs.rda,
ig_early_coefs.rda.

    python tools/make_growth.py [dossier data/ de growthstandards]
"""
import sys, os, json, numpy as np, rdata, warnings
warnings.filterwarnings('ignore')
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
D = sys.argv[1] if len(sys.argv) > 1 else '/tmp/claude-0/-home-claude/3749b250-4905-52c5-8d7c-f266e3baa205/scratchpad/dl/gs/data'
W = rdata.read_rda(os.path.join(D, 'who_coefs.rda'))['who_coefs']
IG = rdata.read_rda(os.path.join(D, 'ig_coefs.rda'))['ig_coefs']
IGE = rdata.read_rda(os.path.join(D, 'ig_early_coefs.rda'))['ig_early_coefs']
r = lambda a, k=5: [round(float(v), k) for v in a]
out = {'version': 1, 'who': {}, 'ig': {}, 'igEarly': {},
       'source': 'growthstandards (ki-tools, MIT) : WHO Child Growth Standards 2006, WHO Reference 2007, INTERGROWTH-21st (Villar 2014, 2016)'}
for key, name in [('wt', 'wtkg_agedays'), ('ht', 'htcm_agedays'), ('bmi', 'bmi_agedays'), ('hc', 'hcircm_agedays')]:
    out['who'][key] = {}
    for sx, s in [('M', 'Male'), ('F', 'Female')]:
        d = W[name][s]['data']; x = d['x'].to_numpy(float); xmax = x.max()
        ages = list(range(0, 92, 7)) + list(np.arange(4, int(xmax / 30.4375) + 1) * 30.4375)
        ages = np.array([a for a in ages if a <= xmax + 1e-6])
        out['who'][key][sx] = {'d': r(ages, 2), 'L': r(np.interp(ages, x, d['l'].to_numpy(float))), 'M': r(np.interp(ages, x, d['m'].to_numpy(float))), 'S': r(np.interp(ages, x, d['s'].to_numpy(float)))}
for key, name in [('wt', 'wtkg'), ('len', 'lencm'), ('hc', 'hcircm')]:
    out['ig'][key] = {}
    for sx, s in [('M', 'Male'), ('F', 'Female')]:
        d = IG[name][s].sort_values('ga')
        out['ig'][key][sx] = {'ga0': int(d['ga'].iloc[0]), 'mu': r(d['mu'], 6), 'sigma': r(d['sigma'], 6), 'nu': r(d['nu'], 6), 'tau': r(d['tau'], 5)}
    e = IGE[name]; out['igEarly'][key] = {'coefs': r(e['coefs'], 7), 'sigma': round(float(e['sigma'][0]), 7)}
txt = ('/* généré par tools/make_growth.py — ne pas éditer. Normes de croissance (OMS 2006 / 2007, INTERGROWTH-21st) :\n'
       ' * coefficients du paquet R growthstandards (ki-tools, licence MIT). */\n'
       '(function (factory) { const G = typeof window !== \'undefined\' ? (window.SV = window.SV || {}) : (globalThis.SV = globalThis.SV || {}); factory(G); })(function (SV) {\n'
       '  SV.GrowthData = ' + json.dumps(out, separators=(',', ':'), ensure_ascii=False) + ';\n});\n')
p = os.path.join(ROOT, 'src', 'growth_data.js'); open(p, 'w', encoding='utf-8').write(txt)
print(p, round(len(txt) / 1000), 'ko')
