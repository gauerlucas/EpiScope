#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
EpiScope v3.0.0 — volumes du gabarit MNI ICBM 152 NLin 2009b asymétrique (étape « vol » de tools/make_templates.mjs).

    python3 tools/make_templates_vol.py <dossier des gabarits> <dossier de travail>

Entrées (dossier de travail, produites par `node tools/make_templates.mjs … --stage=seg`) : t1_1mm.nii.gz (T1 2009b ramené
de 0,5 à 1 mm), mask.nii.gz (cerveau, mindgrab), seg_104.nii.gz (MeshNet aparc+aseg 104 classes), sur la grille conformée.
Le T1 haute résolution est relu dans <dossier des gabarits>.

La segmentation MeshNet du gabarit moyen est fiable pour les noyaux gris, les hippocampes, les amygdales et les ventricules
(composante principale de chaque classe), pas pour l'identité des régions corticales ni pour la fosse postérieure (gabarit
flou : étiquettes corticales dans le cervelet, îlots sous la base du crâne). Le reste est donc construit ainsi, sur une grille
de 1 mm de l'espace MNI 2009b (celle des gabarits NIHPD, décalée de 0,25 mm) :
  1. tissus : masque du cerveau et probabilités de LCR, SG, SB du gabarit MNI 2009c asymétrique (même espace, 152 sujets ;
     <dossier des gabarits>/mni_icbm152_nlin_asym_09c_nifti/mni_icbm152_nlin_asym_09c/…), à défaut masque mindgrab et
     mélange de 3 gaussiennes sur le T1 (probabilités a posteriori) ; le mélange, dans le masque mindgrab, donne aussi le
     seuil de la limite piale ;
  2. compartiments (hémisphère gauche / droit, cervelet gauche / droit, tronc) : région de substance grise la plus proche du
     volume VEP de l'ancien gabarit (fsaverage = MNI305) transporté par la matrice publiée MNI305 → MNI152 (FreeSurfer,
     « CoordinateSystems ») ;
  3. régions VEP : voxels de SG d'un hémisphère → région corticale VEP la plus proche de ce côté (correspondance
     stéréotaxique fsaverage ↔ 2009b, quelques millimètres) ; noyaux gris, hippocampes (antérieur / postérieur d'après
     l'ancien gabarit), amygdales : MeshNet ; SB → 200, ventricules → 201, tronc → 202, cortex cérébelleux → 153 / 162 ;
  4. 104 classes (méthode atlas, repères du recalage) : chaque région VEP → classe de Desikan qui la contient le plus sur
     fsaverage5 (aparc de l'ENIGMA Toolbox), structures profondes et ventricules de MeshNet, SB / cervelet / tronc par
     compartiment et tissu.
Sorties (dossier de travail) : tissue_1mm.nii.gz (4D aplati : gm, wm, csf en uint8 ×3 fichiers), comp_1mm.nii.gz,
vep_1mm.nii.gz, seg104_1mm.nii.gz, vol_info.json. Aucune bibliothèque NIfTI requise (numpy, scipy).
"""
import sys, os, json, base64
import numpy as np
from scipy import ndimage as ndi

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC, WORK = sys.argv[1], sys.argv[2]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from nifti_min import nii_read, nii_write  # noqa: E402


def resample_nearest(src, As, dims, A):
    """valeurs de src (affine As) aux centres des voxels de la grille (dims, A), plus proche voisin"""
    ii, jj, kk = np.meshgrid(*[np.arange(n) for n in dims], indexing='ij')
    P = A @ np.stack([ii.ravel(), jj.ravel(), kk.ravel(), np.ones(ii.size)])
    V = np.round(np.linalg.inv(As) @ P)[:3].astype(int)
    ok = np.all((V >= 0) & (V < np.array(src.shape)[:, None]), 0)
    out = np.zeros(ii.size, src.dtype); out[ok] = src[V[0, ok], V[1, ok], V[2, ok]]
    return out.reshape(dims), P


names = json.load(open(os.path.join(ROOT, 'assets', 'models', 'model21_104class.json')))['labels']
NI = {n: i for i, n in enumerate(names)}
t1, A = nii_read(os.path.join(WORK, 't1_1mm.nii.gz')); dims = t1.shape
m_c, Ac = nii_read(os.path.join(WORK, 'mask.nii.gz')); s_c, _ = nii_read(os.path.join(WORK, 'seg_104.nii.gz'))
brain, P = resample_nearest(m_c.astype(np.uint8), Ac, dims, A)
S, _ = resample_nearest(s_c.astype(np.uint8), Ac, dims, A)
brain = ndi.binary_fill_holes(ndi.binary_closing(brain > 0, iterations=2))
# MNI 2009c asymétrique (même espace, 1 mm) : masque du cerveau et probabilités des tissus officiels (152 sujets), s'ils sont
# fournis ; sinon masque mindgrab et mélange de gaussiennes sur le T1 de 2009b
C09 = os.path.join(SRC, 'mni_icbm152_nlin_asym_09c_nifti', 'mni_icbm152_nlin_asym_09c')
HAS09C = os.path.exists(os.path.join(C09, 'mni_icbm152_gm_tal_nlin_asym_09c.nii'))


def from09c(name, order=1):
    a, Aa = nii_read(os.path.join(C09, 'mni_icbm152_%s.nii' % name))
    return ndi.map_coordinates(a.astype(np.float32), (np.linalg.inv(Aa) @ P)[:3], order=order, mode='constant', cval=0).reshape(dims)


brain_mg = brain
if HAS09C:
    brain = from09c('t1_tal_nlin_asym_09c_mask') > 0.5
    brain = ndi.binary_fill_holes(ndi.binary_closing(brain, iterations=1))
print('cerveau', int(brain.sum()), 'mm³', '(masque 2009c)' if HAS09C else '(mindgrab)')

# ---------------------------------------------------------------- 1. tissus (EM, 3 gaussiennes)
x = t1[brain_mg].astype(np.float64)   # masque mindgrab (LCR périphérique compris) : seuil de la limite piale
mu = np.percentile(x, [8, 45, 85]); sd = np.array([x.std() / 4] * 3); w = np.array([0.2, 0.4, 0.4])
for it in range(60):
    L = np.stack([w[c] / sd[c] * np.exp(-0.5 * ((x - mu[c]) / sd[c]) ** 2) for c in range(3)]) + 1e-300
    R = L / L.sum(0)
    nk = R.sum(1); mu_n = (R * x).sum(1) / nk; sd = np.sqrt((R * (x - mu_n[:, None]) ** 2).sum(1) / nk) + 1e-3; w = nk / nk.sum()
    if np.abs(mu_n - mu).max() < 1e-4: mu = mu_n; break
    mu = mu_n
order = np.argsort(mu); mu, sd, w, R = mu[order], sd[order], w[order], R[order]
print('tissus (LCR, SG, SB) : moyennes', mu.round(1), 'écarts', sd.round(1), 'poids', w.round(3))
prob = np.zeros((3,) + dims, np.float32)
for c in range(3): prob[c][brain_mg] = R[c]
prob[:, ~brain] = 0
if HAS09C:   # probabilités officielles (LCR, SG, SB) ; le mélange de gaussiennes ne sert plus qu'au seuil de la limite piale
    prob = np.stack([from09c('%s_tal_nlin_asym_09c' % k) for k in ('csf', 'gm', 'wm')]).clip(0, 1).astype(np.float32); prob[:, ~brain] = 0
    print('tissus : probabilités MNI 2009c (volumes LCR, SG, SB en ml)', [round(float(prob[k].sum()) / 1000) for k in range(3)])
# seuil de la limite piale (T1 0,5 mm) : milieu des moyennes LCR / SG du mélange — plus haut que le demi-volume partiel
# SG + SB = 0,5 de 2009c (≈ 42), il ouvre les sillons du gabarit moyen (aire ≈ 1 000 cm² par hémisphère, comme un cerveau
# individuel, contre ≈ 800 cm² au demi-volume partiel)
PIAL = float(0.5 * (mu[0] + mu[1]))
csf, gm, wm = prob
tis = np.argmax(prob, 0); tis[~brain] = -1          # 0 LCR, 1 SG, 2 SB

# ---------------------------------------------------------------- 2. ancien volume VEP transporté (MNI305 → MNI152)
tpl_old = json.load(open(os.path.join(ROOT, 'tools', 'data', 'template_anat_fsaverage.json')))
M = np.array(tpl_old['mni305_to_mni152']); M = np.vstack([M[:3], [0, 0, 0, 1]]) if M.shape[0] == 3 else M
vj = json.load(open(os.path.join(ROOT, 'tools', 'data', 'vep_volume_fsaverage.json')))
rv = np.frombuffer(base64.b64decode(vj['rle_values']), np.uint8); rn = np.frombuffer(base64.b64decode(vj['rle_lengths']), np.uint16)
OLD = np.repeat(rv, rn.astype(np.int64)).reshape(vj['dims']); i0, j0, k0 = vj['offset_vox']
Q = np.linalg.inv(M) @ P
vi = np.round((128 - Q[0]) / 2).astype(int) - i0; vjj = np.round((128 - Q[2]) / 2).astype(int) - j0; vk = np.round((Q[1] + 128) / 2).astype(int) - k0
ok = (vi >= 0) & (vjj >= 0) & (vk >= 0) & (vi < OLD.shape[0]) & (vjj < OLD.shape[1]) & (vk < OLD.shape[2])
OV = np.zeros(Q.shape[1], np.uint8); OV[ok] = OLD[vi[ok], vjj[ok], vk[ok]]; OV = OV.reshape(dims)


def nearest_of(labels_mask):
    """étiquette OV du voxel le plus proche appartenant à labels_mask"""
    _, (a, b, c) = ndi.distance_transform_edt(~labels_mask, return_indices=True)
    return OV[a, b, c]


GM_OLD = ((OV >= 1) & (OV <= 162)) | (OV == 202)
NG = nearest_of(GM_OLD)
comp = np.zeros(dims, np.uint8)                       # 1 hémisphère G, 2 D, 3 cervelet G, 4 D, 5 tronc
comp[((NG >= 1) & (NG <= 72)) | ((NG >= 145) & (NG <= 152))] = 1
comp[((NG >= 73) & (NG <= 144)) | ((NG >= 154) & (NG <= 161))] = 2
comp[NG == 153] = 3; comp[NG == 162] = 4; comp[NG == 202] = 5
comp[~brain] = 0

# ---------------------------------------------------------------- 3. régions VEP
def main_comp(mask):
    L, n = ndi.label(mask, structure=np.ones((3, 3, 3)))
    if n <= 1: return mask
    sz = np.bincount(L.ravel()); sz[0] = 0; return L == np.argmax(sz)


VEP = np.zeros(dims, np.uint8); SEG = np.zeros(dims, np.uint8)
DEEP = [('Thalamus-Proper*', 148), ('Caudate', 149), ('Putamen', 150), ('Pallidum', 151), ('Accumbens-area', 152), ('Amygdala', 147), ('Hippocampus', 145)]
deep = np.zeros(dims, bool)
for side, sh, cside in (('Left', 0, 1), ('Right', 9, 2)):
    for nm, v in DEEP:
        d = NI[side + '-' + nm]; m = main_comp(S == d) & brain
        deep |= m; SEG[m] = d
        if nm == 'Hippocampus':                      # antérieur / postérieur : le plus proche de l'ancien 145 / 146 (154 / 155)
            hp = nearest_of((OV == 145 + sh) | (OV == 146 + sh)); VEP[m] = hp[m]
        else: VEP[m] = v + sh
    for nm in ('Lateral-Ventricle', 'Inf-Lat-Vent'):
        d = NI[side + '-' + nm]; m = main_comp(S == d) & brain & ~deep; SEG[m] = d; VEP[m] = 201
for nm in ('3rd-Ventricle', '4th-Ventricle'):
    d = NI[nm]; m = main_comp(S == d) & brain & ~deep; SEG[m] = d; VEP[m] = 201
free = brain & (SEG == 0)
NL = nearest_of((OV >= 1) & (OV <= 72)); NR = nearest_of((OV >= 73) & (OV <= 144))
# substance grise d'un hémisphère : région corticale VEP la plus proche du même côté
for c, N in ((1, NL), (2, NR)):
    m = free & (comp == c) & (tis == 1); VEP[m] = N[m]
    m = free & (comp == c) & (tis == 2); VEP[m] = 200
m = free & ((comp == 3) | (comp == 4)) & (tis == 1); VEP[m & (comp == 3)] = 153; VEP[m & (comp == 4)] = 162
VEP[free & ((comp == 3) | (comp == 4)) & (tis == 2)] = 200
VEP[free & (comp == 5) & (tis >= 1)] = 202

# ---------------------------------------------------------------- 4. 104 classes
# co-occurrence régions VEP × classes de Desikan sur fsaverage5 (tools/data/vep_aparc_fsa5.json)
C = np.zeros((163, len(names)), np.int64)
for v, row in json.load(open(os.path.join(ROOT, 'tools', 'data', 'vep_aparc_fsa5.json')))['counts'].items():
    for d, c in row.items(): C[int(v), int(d)] = c
v2d = {}
for v in range(1, 145):
    cand = [d for d, nm in enumerate(names) if nm.startswith('ctx-' + ('lh' if v <= 72 else 'rh') + '-')]
    if C[v, cand].sum(): v2d[v] = cand[int(np.argmax(C[v, cand]))]
for v, d in v2d.items(): SEG[(VEP == v) & (SEG == 0)] = d
for c, side in ((1, 'Left'), (2, 'Right')):
    SEG[(VEP == 200) & (comp == c) & (SEG == 0)] = NI[side + '-Cerebral-White-Matter']
for c, side in ((3, 'Left'), (4, 'Right')):
    SEG[(VEP == 153 + 9 * (c - 3)) & (SEG == 0)] = NI[side + '-Cerebellum-Cortex']
    SEG[(VEP == 200) & (comp == c) & (SEG == 0)] = NI[side + '-Cerebellum-White-Matter']
SEG[(VEP == 202) & (SEG == 0)] = NI['Brain-Stem']

nii_write(os.path.join(WORK, 'vep_1mm.nii.gz'), VEP, A); nii_write(os.path.join(WORK, 'seg104_1mm.nii.gz'), SEG, A)
nii_write(os.path.join(WORK, 'comp_1mm.nii.gz'), comp, A)
for k, nm in enumerate(('csf', 'gm', 'wm')): nii_write(os.path.join(WORK, 'p%s_1mm.nii.gz' % nm), np.clip(np.round(prob[k] * 255), 0, 255).astype(np.uint8), A)
nii_write(os.path.join(WORK, 'brain_1mm.nii.gz'), brain.astype(np.uint8), A)
cnt = {int(v): int(c) for v, c in zip(*np.unique(VEP, return_counts=True))}
missing = [v for v in range(1, 163) if v not in cnt]
json.dump({'tissue': {'mu': mu.tolist(), 'sd': sd.tolist(), 'w': w.tolist(), 'pial': PIAL, 'source': 'MNI 2009c' if HAS09C else 'mélange de gaussiennes'}, 'vep_counts': cnt, 'missing': missing, 'v2d': v2d,
           'seg_classes': int(len(np.unique(SEG)) - 1)}, open(os.path.join(WORK, 'vol_info.json'), 'w'), indent=1)
print('régions VEP absentes', missing, '· classes 104 présentes', len(np.unique(SEG)) - 1)
