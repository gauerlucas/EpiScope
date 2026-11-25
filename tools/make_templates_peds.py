#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
EpiScope v3.0.0 — repères des gabarits pédiatriques NIHPD asymétriques (4,5–8,5 ; 7–11 ; 7,5–13,5 ; 10–14 ; 13–18,5 ans ;
Fonov et al. 2011, NeuroImage 54 ; licence du MNI) pour la chaîne « patient → gabarit de l'âge → MNI 2009b ».

    python3 tools/make_templates_peds.py <dossier des gabarits> <dossier de travail>

Les gabarits NIHPD sont dans l'espace stéréotaxique MNI (même grille de 1 mm que 2009b) : les étiquettes du gabarit 2009b
(tools/make_templates_vol.py) y sont reportées par proximité, contraintes par les tissus propres à chaque tranche d'âge
(probabilités gm / wm / csf et masque livrés avec le gabarit) :
  - substance grise d'un hémisphère → région corticale VEP la plus proche du même côté dans 2009b ;
  - noyaux gris, hippocampes, amygdales : étiquette 2009b au voxel si le voxel est de la substance grise ;
  - ventricules : étiquette 2009b au voxel si le voxel est du LCR ; substance blanche par hémisphère ; cervelet, tronc.
Les centres des 104 classes (même définition que template_anat.json : cortex = centres des régions VEP répartis entre
les classes de Desikan, tools/data/vep_aparc_fsa5.json) suivent donc la géométrie du cerveau de l'enfant (ruban cortical,
ventricules, substance blanche). Sortie : <travail>/peds_landmarks.json ; `node tools/make_templates.mjs … --stage=peds`
calcule ensuite la transformation de chaque gabarit vers 2009b et écrit assets/templates_peds.json.
"""
import sys, os, json, glob, re
import numpy as np
from scipy import ndimage as ndi

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from nifti_min import nii_read  # noqa: E402

SRC, WORK = sys.argv[1], sys.argv[2]
names = json.load(open(os.path.join(ROOT, 'assets', 'models', 'model21_104class.json')))['labels']
NI = {n: i for i, n in enumerate(names)}
cort = [d for d, n in enumerate(names) if n.startswith('ctx-')]
Cm = np.zeros((163, len(names)), np.int64)
for v, row in json.load(open(os.path.join(ROOT, 'tools', 'data', 'vep_aparc_fsa5.json')))['counts'].items():
    for d, c in row.items(): Cm[int(v), int(d)] = c
VEP, A9 = nii_read(os.path.join(WORK, 'vep_1mm.nii.gz')); SEG, _ = nii_read(os.path.join(WORK, 'seg104_1mm.nii.gz')); COMP, _ = nii_read(os.path.join(WORK, 'comp_1mm.nii.gz'))


def to_grid(vol, dims, A):
    ii, jj, kk = np.meshgrid(*[np.arange(n) for n in dims], indexing='ij')
    V = np.round(np.linalg.inv(A9) @ (A @ np.stack([ii.ravel(), jj.ravel(), kk.ravel(), np.ones(ii.size)])))[:3].astype(int)
    ok = np.all((V >= 0) & (V < np.array(vol.shape)[:, None]), 0); out = np.zeros(ii.size, vol.dtype); out[ok] = vol[V[0, ok], V[1, ok], V[2, ok]]
    return out.reshape(dims)


DEEP = [NI[s + '-' + n] for s in ('Left', 'Right') for n in ('Thalamus-Proper*', 'Caudate', 'Putamen', 'Pallidum', 'Accumbens-area', 'Amygdala', 'Hippocampus')]
VENT = [NI[n] for n in ('Left-Lateral-Ventricle', 'Left-Inf-Lat-Vent', 'Right-Lateral-Ventricle', 'Right-Inf-Lat-Vent', '3rd-Ventricle', '4th-Ventricle')]
out = {}
for t1p in sorted(glob.glob(os.path.join(SRC, 'nihpd_asym_all_nifti', 'nihpd_asym_*_t1w.nii'))):
    rng = re.search(r'nihpd_asym_([0-9.]+)-([0-9.]+)_t1w', t1p); a0, a1 = float(rng.group(1)), float(rng.group(2)); base = t1p[:-8]
    mask, A = nii_read(base + '_mask.nii'); dims = mask.shape
    P = np.stack([nii_read(base + '_%s.nii' % k)[0] for k in ('csf', 'gm', 'wm')])
    brain = mask > 0.5; tis = np.argmax(P, 0); tis[~brain] = -1
    vep, seg, comp = to_grid(VEP, dims, A), to_grid(SEG, dims, A), to_grid(COMP, dims, A)
    # compartiment le plus proche (le cerveau de l'enfant déborde ou reste en deçà de celui de l'adulte)
    _, (a, b, c) = ndi.distance_transform_edt(comp == 0, return_indices=True); comp = comp[a, b, c]; comp[~brain] = 0
    lab = np.zeros(dims, np.int16); v2 = np.zeros(dims, np.int16)
    for d in DEEP: m = (seg == d) & (tis == 1); lab[m] = d
    for d in VENT: m = (seg == d) & (tis == 0); lab[m] = d
    for side, cs, lo, hi in (('Left', 1, 1, 72), ('Right', 2, 73, 144)):
        _, (a, b, c) = ndi.distance_transform_edt(~((vep >= lo) & (vep <= hi)), return_indices=True); near = vep[a, b, c]
        m = (comp == cs) & (tis == 1) & (lab == 0); v2[m] = near[m]
        lab[(comp == cs) & (tis == 2) & (lab == 0)] = NI[side + '-Cerebral-White-Matter']
    for side, cs in (('Left', 3), ('Right', 4)):
        lab[(comp == cs) & (tis == 1) & (lab == 0)] = NI[side + '-Cerebellum-Cortex']; lab[(comp == cs) & (tis == 2) & (lab == 0)] = NI[side + '-Cerebellum-White-Matter']
    lab[(comp == 5) & (tis >= 1) & (lab == 0)] = NI['Brain-Stem']
    world = lambda idx: (A[:3, :3] @ idx.T + A[:3, 3:4])
    cent = {}
    for d in range(1, len(names)):
        if d in cort: continue
        idx = np.argwhere(lab == d)
        if len(idx) >= 20: cent[str(d)] = [round(float(x), 2) for x in world(idx).mean(1)] + [int(len(idx))]
    vc = {}
    for v in range(1, 145):
        idx = np.argwhere(v2 == v)
        if len(idx): vc[v] = (world(idx).mean(1), len(idx))
    for d in cort:
        acc = np.zeros(3); wt = 0.0
        for v in range(1, 145):
            if v not in vc or not Cm[v].sum() or not Cm[v, d]: continue
            f = Cm[v, d] / Cm[v].sum(); acc += f * vc[v][1] * vc[v][0]; wt += f * vc[v][1]
        if wt >= 20: cent[str(d)] = [round(float(x), 2) for x in acc / wt] + [int(round(wt))]
    key = '%04.1f-%04.1f' % (a0, a1)
    out[key] = {'ageMin': a0, 'ageMax': a1, 'brain_ml': round(float(brain.sum()) / 1000, 1), 'landmarks': cent}
    print('NIHPD', key, 'cerveau', out[key]['brain_ml'], 'ml · repères', len(cent))
json.dump(out, open(os.path.join(WORK, 'peds_landmarks.json'), 'w'))
