#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
EpiScope v3.0.0 — fichiers du gabarit MNI ICBM 152 NLin 2009b asymétrique dans assets/ (dernière étape de
tools/make_templates.mjs ; voir ce fichier pour l'enchaînement).

    python3 tools/make_templates_assets.py <dossier des gabarits> <dossier de travail>

Lit le dossier de travail (meshes.json, vep_1mm, seg104_1mm, p{gm,wm,csf}_1mm, brain_1mm, t1_1mm) et écrit :
  assets/brain_meshes.json  surfaces piales / gonflées (≈ 32 000 sommets par hémisphère), profondeur sulcale, régions VEP des
                            sommets, structures profondes, centres des régions, distances ; adjacence des régions reprise
                            telle quelle (a priori anatomique, indépendant de l'espace) ;
  assets/vep_volume.json    parcellation VEP 2 mm (même convention de grille qu'avant : i = (128 − x)/2, j = (128 − z)/2,
                            k = (y + 128)/2, coordonnées MNI 2009b) ;
  assets/template_anat.json centres des 104 classes (repères du recalage patient → gabarit et de la transformation vers MNI) ;
                            tables de compatibilité Desikan → VEP et codes de tissu inchangés ;
  assets/template_spm.json  T1 extrait du crâne, probabilités des tissus et 104 classes sur une grille de 2 mm (méthode atlas,
                            coupes du gabarit).
"""
import sys, os, json, gzip, struct, base64
import numpy as np
from scipy import ndimage as ndi

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC, WORK = sys.argv[1], sys.argv[2]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from nifti_min import nii_read  # noqa: E402

SPACE = 'MNI152NLin2009bAsym'
SOURCE = 'MNI ICBM 152 NLin 2009b asymétrique (Fonov et al. 2009, 2011), T1 0,5 mm'
LICENSE = ('ICBM 152 NLin 2009 : Copyright (C) 1993–2004 Louis Collins, McConnell Brain Imaging Centre, Montreal Neurological '
           'Institute, McGill University. Usage, copie, modification et distribution permis avec cet avis (licence du MNI).')
b64 = lambda a, t: base64.b64encode(np.ascontiguousarray(a, dtype=t).tobytes()).decode('ascii')
W = lambda f: os.path.join(WORK, f)
old_mesh = json.load(open(os.path.join(ROOT, 'assets', 'brain_meshes.json')))
old_anat = json.load(open(os.path.join(ROOT, 'tools', 'data', 'template_anat_fsaverage.json')))
names = json.load(open(os.path.join(ROOT, 'assets', 'models', 'model21_104class.json')))['labels']
M = json.load(open(W('meshes.json')))
vep, A1 = nii_read(W('vep_1mm.nii.gz')); seg, _ = nii_read(W('seg104_1mm.nii.gz'))

# ---------------------------------------------------------------- brain_meshes.json
regions = [dict(r) for r in old_mesh['regions']]
acc = {}
hemis = {}
for h in ('lh', 'rh'):
    H = M['hemis'][h]; P = np.array(H['pial'], np.float32).reshape(-1, 3); L = np.array(H['labels'], np.uint8)
    for v in np.unique(L):
        if v: acc[int(v)] = (P[L == v].mean(0), int((L == v).sum()))
    s = np.array(H['sulc'], np.float32); s8 = np.clip(np.round(s / max(np.abs(s).max(), 1e-6) * 127), -127, 127)
    hemis[h] = {'n_vertices': H['n'], 'n_faces': len(H['faces']) // 3, 'pial': b64(P.ravel(), np.float32),
                'inflated': b64(np.array(H['inflated'], np.float32), np.float32), 'flat': None,
                'faces': b64(np.array(H['faces']), np.uint16), 'sulc': b64(s8, np.int8), 'labels': b64(L, np.uint8)}
sub = []
for s in M['subcortical']:
    V = np.array(s['vertices'], np.float32).reshape(-1, 3); F = np.array(s['faces'])
    acc[s['index']] = (V.mean(0), int(len(V)))
    sub.append({'region_index': s['index'], 'name': s['name'], 'n_vertices': int(len(V)), 'n_faces': int(len(F) // 3), 'vertices': b64(V.ravel(), np.float32), 'faces': b64(F, np.uint16)})
for r in regions:
    if not r['index']: continue
    if r['index'] in acc: c, n = acc[r['index']]; r['centroid'] = [round(float(x), 2) for x in c]; r['n_vertices'] = n
    else: r['centroid'] = None; r['n_vertices'] = 0; print('région sans sommet :', r['name'])
cents = np.zeros((len(regions), 3)); valid = np.zeros(len(regions), bool)
for r in regions:
    if r['centroid'] is not None: cents[r['index']] = r['centroid']; valid[r['index']] = True
D = np.sqrt(((cents[:, None] - cents[None]) ** 2).sum(-1)); D[~valid] = 0; D[:, ~valid] = 0; np.fill_diagonal(D, 0)
out = {'version': 2, 'space': SPACE + ' mm', 'source': SOURCE + ' ; surfaces EpiScope (tools/make_templates.mjs)', 'license': LICENSE,
       'n_regions': 162, 'regions': regions, 'hemis': hemis, 'subcortical': sub, 'adjacency': old_mesh['adjacency'],
       'centroid_distances': b64(D.astype(np.float32).ravel(), np.float32)}
p = os.path.join(ROOT, 'assets', 'brain_meshes.json'); json.dump(out, open(p, 'w'), separators=(',', ':'))
print('brain_meshes.json', round(os.path.getsize(p) / 1e6, 2), 'Mo')

# ---------------------------------------------------------------- vep_volume.json (2 mm, grille centrée sur 128)
N = 128
ii, jj, kk = np.meshgrid(np.arange(N), np.arange(N), np.arange(N), indexing='ij')
X = 128 - 2.0 * ii; Z = 128 - 2.0 * jj; Y = 2.0 * kk - 128
Ai = np.linalg.inv(A1); acc8 = []
for dx in (-0.5, 0.5):
    for dy in (-0.5, 0.5):
        for dz in (-0.5, 0.5):
            Vx = Ai @ np.stack([(X + dx).ravel(), (Y + dy).ravel(), (Z + dz).ravel(), np.ones(X.size)])
            V = np.round(Vx[:3]).astype(int); ok = np.all((V >= 0) & (V < np.array(vep.shape)[:, None]), 0)
            l = np.zeros(X.size, np.uint8); l[ok] = vep[V[0, ok], V[1, ok], V[2, ok]]; acc8.append(l)
acc8 = np.stack(acc8)                                   # 8 sous-voxels de 1 mm par voxel de 2 mm
G = np.zeros(X.size, np.uint8); nz = (acc8 > 0).sum(0)
# mode des étiquettes non nulles quand au moins 4 sous-voxels sont dans le cerveau (régions corticales prioritaires à égalité)
best = np.zeros(X.size, np.uint8); bc = np.zeros(X.size, np.int8)
for v in [int(u) for u in np.unique(acc8) if u]:
    c = (acc8 == v).sum(0).astype(np.int8) + (np.int8(1) if 1 <= v <= 144 else np.int8(0)) * ((acc8 == v).any(0))
    upd = c > bc; best[upd] = v; bc[upd] = c[upd]
G[nz >= 4] = best[nz >= 4]; G = G.reshape(N, N, N)
nzI = np.argwhere(G); lo = nzI.min(0); hi = nzI.max(0) + 1
C = G[lo[0]:hi[0], lo[1]:hi[1], lo[2]:hi[2]].ravel()
ch = np.flatnonzero(np.diff(C)) + 1; starts = np.r_[0, ch]; lens = np.diff(np.r_[starts, C.size])
vals, lns = [], []
for s0, n in zip(starts, lens):
    while n > 65535: vals.append(C[s0]); lns.append(65535); n -= 65535
    vals.append(C[s0]); lns.append(n)
out = {'version': 2, 'space': SPACE + ' mm', 'voxel_mm': 2, 'dims': (hi - lo).tolist(), 'offset_vox': lo.tolist(),
       'labels_note': old_mesh.get('labels_note') or json.load(open(os.path.join(ROOT, 'tools', 'data', 'vep_volume_fsaverage.json')))['labels_note'],
       'grid_note': 'i = round((128 − x)/2) − off[0], j = round((128 − z)/2) − off[1], k = round((y + 128)/2) − off[2] ; x, y, z en mm MNI 2009b',
       'rle_values': b64(np.array(vals, np.uint8), np.uint8), 'rle_lengths': b64(np.array(lns, np.uint16), np.uint16)}
p = os.path.join(ROOT, 'assets', 'vep_volume.json'); json.dump(out, open(p, 'w'), separators=(',', ':'))
print('vep_volume.json', round(os.path.getsize(p) / 1e3), 'ko', out['dims'], out['offset_vox'])

# ---------------------------------------------------------------- template_anat.json
# co-occurrence régions VEP × classes de Desikan sur fsaverage5 (tools/data/vep_aparc_fsa5.json)
Cm = np.zeros((163, len(names)), np.int64); NI = {n: i for i, n in enumerate(names)}
for v, row in json.load(open(os.path.join(ROOT, 'tools', 'data', 'vep_aparc_fsa5.json')))['counts'].items():
    for d, c in row.items(): Cm[int(v), int(d)] = c
cort = [d for d, n in enumerate(names) if n.startswith('ctx-')]
world = lambda idx: (A1[:3, :3] @ idx.T + A1[:3, 3:4])
cent = {}
for d in range(1, len(names)):
    if d in cort: continue
    idx = np.argwhere(seg == d)
    if len(idx) >= 20: cent[str(d)] = [round(float(c), 2) for c in world(idx).mean(1)] + [int(len(idx))]
vc = {}
for v in range(1, 145):
    idx = np.argwhere(vep == v)
    if len(idx): vc[v] = (world(idx).mean(1), len(idx))
for d in cort:
    a3 = np.zeros(3); wt = 0.0
    for v in range(1, 145):
        if v not in vc or not Cm[v].sum() or not Cm[v, d]: continue
        f = Cm[v, d] / Cm[v].sum(); a3 += f * vc[v][1] * vc[v][0]; wt += f * vc[v][1]
    if wt >= 20: cent[str(d)] = [round(float(c), 2) for c in a3 / wt] + [int(round(wt))]
out = dict(old_anat)
out.pop('mni305_to_mni152', None)
out.update({'version': 2, 'source': SOURCE + ' ; noyaux gris et ventricules : MeshNet 104 classes ; cortex : régions VEP du gabarit × aparc fsaverage5',
            'space': SPACE, 'mni': SPACE, 'centroids': cent, 'license': LICENSE})
p = os.path.join(ROOT, 'assets', 'template_anat.json'); json.dump(out, open(p, 'w'), separators=(',', ':'))
print('template_anat.json : centres', len(cent))

# ---------------------------------------------------------------- template_spm.json (grille 2 mm RAS)
t1, _ = nii_read(W('t1_1mm.nii.gz')); brain, _ = nii_read(W('brain_1mm.nii.gz'))
pr = {k: nii_read(W('p%s_1mm.nii.gz' % k))[0].astype(np.float32) for k in ('gm', 'wm', 'csf')}
VOX = 2.0; lo = np.array([-90.0, -126.0, -72.0]); hi = np.array([90.0, 92.0, 96.0])
dims = (np.round((hi - lo) / VOX).astype(int) + 1).tolist()
A2 = np.array([[VOX, 0, 0, lo[0]], [0, VOX, 0, lo[1]], [0, 0, VOX, lo[2]], [0, 0, 0, 1.0]])
gi, gj, gk = np.meshgrid(*[np.arange(n) for n in dims], indexing='ij')
P2 = A2 @ np.stack([gi.ravel(), gj.ravel(), gk.ravel(), np.ones(gi.size)]); V2 = (Ai @ P2)[:3]
smp = lambda vol, order: ndi.map_coordinates(vol.astype(np.float32), V2, order=order, mode='constant', cval=0).reshape(dims)
bm = ndi.gaussian_filter(brain.astype(np.float32), 0.7)
t1b = smp(ndi.gaussian_filter(t1 * (bm > 0.5), 0.85), 1); br2 = smp(bm, 1) > 0.5
t1n = np.clip(t1b / max(1.0, np.percentile(t1b[br2], 99.5)) * 220, 0, 255)
tp = {k: np.clip(smp(ndi.gaussian_filter(v, 1.0), 1), 0, 255) for k, v in pr.items()}
s2 = np.zeros(gi.size, np.uint8); Vn = np.round(V2).astype(int); ok = np.all((Vn >= 0) & (Vn < np.array(seg.shape)[:, None]), 0)
s2[ok] = seg[Vn[0, ok], Vn[1, ok], Vn[2, ok]]; s2 = s2.reshape(dims)


def b64nii(data, dtype):
    a = np.asarray(data).astype(dtype); h = bytearray(352); struct.pack_into('<i', h, 0, 348); struct.pack_into('<8h', h, 40, 3, *a.shape, 1, 1, 1, 1)
    struct.pack_into('<hh', h, 70, 2, 8); struct.pack_into('<8f', h, 76, 1, VOX, VOX, VOX, 0, 0, 0, 0); struct.pack_into('<f', h, 108, 352)
    struct.pack_into('<2f', h, 112, 1, 0); struct.pack_into('<hh', h, 252, 1, 1); struct.pack_into('<12f', h, 280, *A2[:3].ravel()); h[344:348] = b'n+1\0'
    h[123] = 2                                                                    # xyzt_units : mm
    return base64.b64encode(gzip.compress(bytes(h) + np.ascontiguousarray(a.transpose(2, 1, 0)).tobytes(), 9)).decode('ascii')


old_spm = json.load(open(os.path.join(ROOT, 'assets', 'template_spm.json')))
out = {'version': 2, 'space': SPACE, 'vox': VOX, 'dims': dims, 'affine': A2.tolist(),
       'source': SOURCE + ' (extrait du crâne) ; masque et probabilités des tissus : MNI ICBM 152 NLin 2009c asymétrique (même espace) ; 104 classes : tools/make_templates_vol.py',
       'license': LICENSE, 'labels': old_spm.get('labels', 'model21_104class'),
       't1': b64nii(t1n, np.uint8), 'gm': b64nii(tp['gm'], np.uint8), 'wm': b64nii(tp['wm'], np.uint8), 'csf': b64nii(tp['csf'], np.uint8), 'seg': b64nii(s2, np.uint8)}
p = os.path.join(ROOT, 'assets', 'template_spm.json'); json.dump(out, open(p, 'w'), separators=(',', ':'))
print('template_spm.json', round(os.path.getsize(p) / 1e3), 'ko · grille', dims)
