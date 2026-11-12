#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Données de gabarit pour la parcellation VEP du patient → assets/template_anat.json

EpiScope segmente le T1 du patient avec le modèle MeshNet aparc+aseg 104 classes (Desikan-Killiany + structures
profondes), puis : (1) ajuste une transformation affine patient → gabarit (fsaverage = MNI305) sur les centroïdes des
structures ; (2) attribue à chaque voxel de cortex la région VEP du gabarit la plus proche *compatible avec sa région
Desikan* (les régions VEP subdivisent les régions de Desikan). Ce script prépare, une fois pour toutes, les deux
ingrédients côté gabarit, à partir de la segmentation MeshNet du gabarit MNI152 2009a (même modèle, mêmes biais) :
  - centroïdes de chaque classe dans l'espace fsaverage (tkrRAS = MNI305) ;
  - table de compatibilité Desikan → régions VEP (co-occurrence dans le volume VEP du gabarit).

    python tools/make_template_anat.py [seg_mni_104.nii.gz]

Transformation MNI305 → MNI152 : FreeSurfer, « CoordinateSystems » (matrice publiée).
"""
import sys, os, json, base64, numpy as np, nibabel as nib

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
seg_path = sys.argv[1] if len(sys.argv) > 1 else '/tmp/claude-0/meshnet_mni_104.nii.gz'
M305_152 = np.array([[1.0022, 0.0071, -0.0177, 0.0528], [-0.0146, 0.9990, 0.0027, -1.5519], [0.0129, 0.0094, 1.0027, -1.2012], [0, 0, 0, 1]])
names = json.load(open(os.path.join(ROOT, 'assets', 'models', 'model21_104class.json')))['labels']

seg = nib.load(seg_path); S = np.asarray(seg.dataobj).astype(np.int16); A = seg.affine
# volume VEP du gabarit (fsaverage tkrRAS, 2 mm, RLE)
vj = json.load(open(os.path.join(ROOT, 'assets', 'vep_volume.json')))
rv = np.frombuffer(base64.b64decode(vj['rle_values']), np.uint8); rn = np.frombuffer(base64.b64decode(vj['rle_lengths']), np.uint16)
vol = np.repeat(rv, rn.astype(np.int64)).reshape(vj['dims'])
i0, j0, k0 = vj['offset_vox']
ii, jj, kk = np.nonzero(vol)
lab = vol[ii, jj, kk].astype(int)
x = 128 - 2.0 * (ii + i0); z = 128 - 2.0 * (jj + j0); y = 2.0 * (kk + k0) - 128          # tkrRAS (= MNI305) des voxels VEP
P305 = np.stack([x, y, z, np.ones_like(x)]); P152 = M305_152 @ P305
V = np.linalg.inv(A) @ P152; vi = np.round(V[:3]).astype(int)
ok = np.all((vi >= 0) & (vi < np.array(S.shape)[:, None]), axis=0)
dk = np.zeros(len(lab), int); dk[ok] = S[vi[0, ok], vi[1, ok], vi[2, ok]]
# co-occurrence VEP × Desikan sur les sommets de fsaverage5 (même maillage que les étiquettes VEP de brain_meshes.json) :
# parcellation aparc de l'ENIGMA Toolbox (tools/data/aparc_fsa5.csv). La segmentation MeshNet du gabarit MNI, trop
# imprécise pour le cortex (gabarit moyen flou), ne sert qu'aux structures profondes.
APARC = ['unknown', 'bankssts', 'caudalanteriorcingulate', 'caudalmiddlefrontal', 'corpuscallosum', 'cuneus', 'entorhinal', 'fusiform', 'inferiorparietal', 'inferiortemporal', 'isthmuscingulate', 'lateraloccipital', 'lateralorbitofrontal', 'lingual', 'medialorbitofrontal', 'middletemporal', 'parahippocampal', 'paracentral', 'parsopercularis', 'parsorbitalis', 'parstriangularis', 'pericalcarine', 'postcentral', 'posteriorcingulate', 'precentral', 'precuneus', 'rostralanteriorcingulate', 'rostralmiddlefrontal', 'superiorfrontal', 'superiorparietal', 'superiortemporal', 'supramarginal', 'frontalpole', 'temporalpole', 'transversetemporal', 'insula']
mesh = json.load(open(os.path.join(ROOT, 'assets', 'brain_meshes.json')))
aparc = np.loadtxt(os.path.join(ROOT, 'tools', 'data', 'aparc_fsa5.csv')).astype(int)
C = np.zeros((163, len(names)), np.int64)
for hi, h in enumerate(['lh', 'rh']):
    H = mesh['hemis'][h]; n = H['n_vertices']; VL = np.frombuffer(base64.b64decode(H['labels']), np.uint8)
    a = aparc[hi * n:(hi + 1) * n] - (35 if hi else 0); a[a < 0] = 0
    for v, l in zip(VL, a):
        if not v or not l or APARC[l] == 'corpuscallosum': continue
        d = names.index('ctx-%s-%s' % (h, APARC[l]))
        C[v, d] += 1
allowed = {}
cort = [d for d, n in enumerate(names) if n.startswith('ctx-')]
for d in cort:
    col = C[1:145, d]; tot = col.sum()
    ok_v = [v + 1 for v in range(144) if tot and (col[v] / tot >= 0.04 or (C[v + 1].sum() and C[v + 1, d] / C[v + 1].sum() >= 0.10))]
    hemi = 'L' if '-lh-' in names[d] else 'R'
    allowed[d] = [v for v in ok_v if (v <= 72) == (hemi == 'L')]
# chaque région VEP corticale est permise au moins dans la classe de Desikan (même côté) qui la contient le plus
for v in range(1, 145):
    cand = [d for d in cort if ('-lh-' in names[d]) == (v <= 72)]
    if not C[v, cand].sum(): continue
    d = cand[int(np.argmax(C[v, cand]))]
    if v not in allowed[d]: allowed[d].append(v)
for d in cort: allowed[d].sort()
SUB = {'Left-Hippocampus': [145, 146], 'Left-Amygdala': [147], 'Left-Thalamus-Proper*': [148], 'Left-Caudate': [149], 'Left-Putamen': [150], 'Left-Pallidum': [151], 'Left-Accumbens-area': [152], 'Left-Cerebellum-Cortex': [153],
       'Right-Hippocampus': [154, 155], 'Right-Amygdala': [156], 'Right-Thalamus-Proper*': [157], 'Right-Caudate': [158], 'Right-Putamen': [159], 'Right-Pallidum': [160], 'Right-Accumbens-area': [161], 'Right-Cerebellum-Cortex': [162]}
for d, n in enumerate(names):
    if n in SUB: allowed[d] = SUB[n]
# codes « tissu » du volume VEP pour les autres classes
tissue = {}
for d, n in enumerate(names):
    if d == 0: continue
    if 'White-Matter' in n or n.startswith('CC_'): tissue[d] = 200
    elif 'Vent' in n or n == 'CSF': tissue[d] = 201
    elif d not in allowed: tissue[d] = 202
# centroïdes des classes dans l'espace fsaverage (MNI305) : structures profondes, substance blanche, ventricules depuis la
# segmentation MeshNet du gabarit ; classes corticales depuis les voxels VEP du ruban cortical du gabarit, chaque région VEP
# répartie entre les classes de Desikan au prorata des sommets partagés (centre « de ruban », comparable à celui du patient)
Mi = np.linalg.inv(M305_152); cents = {}
for d in range(1, len(names)):
    if d in cort: continue
    idx = np.argwhere(S == d)
    if len(idx) < 20: continue
    w = A[:3, :3] @ idx.T + A[:3, 3:4]; w = Mi[:3, :3] @ w + Mi[:3, 3:4]
    cents[d] = [round(float(c), 2) for c in w.mean(1)] + [int(len(idx))]
vc = {}
for v in range(1, 145):
    m = lab == v
    if m.sum(): vc[v] = (np.array([x[m].mean(), y[m].mean(), z[m].mean()]), int(m.sum()))
for d in cort:
    acc = np.zeros(3); wt = 0.0
    for v in range(1, 145):
        if v not in vc or not C[v].sum() or not C[v, d]: continue
        f = C[v, d] / C[v].sum(); acc += f * vc[v][1] * vc[v][0]; wt += f * vc[v][1]
    if wt >= 20: cents[d] = [round(float(c), 2) for c in acc / wt] + [int(round(wt * 8))]   # voxels de 2 mm → effectif en mm³
# contrôle : part des voxels VEP corticaux tombant dans une classe compatible
hit = sum(int(C[v, d]) for d in cort for v in allowed[d]); tot = int(C[1:145][:, cort].sum())   # sommets fsaverage5 dont la région VEP est permise dans leur classe
out = {'version': 1, 'source': os.path.basename(seg_path), 'space': 'fsaverage tkrRAS (MNI305)', 'mni305_to_mni152': M305_152.round(4).tolist(),
       'labels': names, 'cortex_source': 'aparc fsaverage5 (ENIGMA Toolbox) × VEP', 'centroids': cents, 'allowed': allowed, 'tissue': tissue, 'check_cortical_compatible': round(hit / max(1, tot), 3)}
json.dump(out, open(os.path.join(ROOT, 'assets', 'template_anat.json'), 'w'), separators=(',', ':'))
print('classes avec centroïde', len(cents), '· régions corticales permises par classe (moy.)', round(np.mean([len(v) for d, v in allowed.items() if d in cort]), 2),
      '· sommets fsaverage5 compatibles', out['check_cortical_compatible'])
missing = [v for v in range(1, 145) if not any(v in allowed[d] for d in cort)]
print('régions VEP corticales jamais permises :', missing)
