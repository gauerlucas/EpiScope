#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gabarit de la segmentation « atlas » (type SPM / CAT12) d'EpiScope → assets/template_spm.json

La méthode atlas (src/imaging/atlas.js) segmente le T1 du patient sans réseau de neurones : recalage affine du cerveau
du patient sur un gabarit, puis classification des tissus (mélange de gaussiennes avec a priori spatiaux et champ de biais,
dans l'esprit de la segmentation unifiée de SPM, Ashburner & Friston 2005) et étiquettes reprises du gabarit. Il lui faut,
sur une même grille de 2 mm dans l'espace fsaverage tkrRAS (= MNI305, celui du volume VEP et de template_anat.json) :
  - t1  : T1 moyen du cerveau (MNI ICBM152 2009a non linéaire symétrique, extrait du crâne ; Fonov et al. 2011) ;
  - gm, wm, csf : probabilités a priori des tissus (mêmes sources ; LCR = cerveau − SG − SB) ;
  - seg : étiquettes dans les classes du modèle MeshNet aparc+aseg 104 : cortex de Desikan d'après le volume VEP du gabarit
          (chaque région VEP → classe de Desikan qui la contient le plus sur fsaverage5, table aparc_fsa5 de l'ENIGMA
          Toolbox), structures profondes, substance blanche, ventricules, cervelet et tronc d'après la segmentation MeshNet
          du gabarit MNI152 2009a (même modèle que le patient).
Chaque volume est un NIfTI gzip en base64 (affine : voxel → tkrRAS), décodé par SV.Nifti.read.

    python tools/make_template_spm.py [seg_mni_104.nii.gz] [dossier_des_gabarits_nilearn]

Sources : templates ICBM152 2009a distribués avec nilearn (BSD ; © 1993–2009 Louis Collins, McConnell Brain Imaging
Centre, Montreal Neurological Institute, McGill University — copie et usage permis avec cette mention).
"""
import sys, os, json, base64, gzip, io, numpy as np, nibabel as nib
from scipy import ndimage as ndi

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
seg_path = sys.argv[1] if len(sys.argv) > 1 else '/tmp/claude-0/meshnet_mni_104.nii.gz'
NIL = sys.argv[2] if len(sys.argv) > 2 else '/home/claude/pkgs/nilearn/x/nilearn/datasets/data'
tpl = json.load(open(os.path.join(ROOT, 'assets', 'template_anat.json')))
M305_152 = np.array(tpl['mni305_to_mni152'] + [[0, 0, 0, 1]])[:4] if len(tpl['mni305_to_mni152']) == 3 else np.array(tpl['mni305_to_mni152'])
names = json.load(open(os.path.join(ROOT, 'assets', 'models', 'model21_104class.json')))['labels']
idx = {n: i for i, n in enumerate(names)}

# grille de 2 mm (RAS) autour du cerveau du gabarit : x −80…80, y −120…88, z −74…92 (tkrRAS)
VOX = 2.0; lo = np.array([-80.0, -120.0, -74.0]); hi = np.array([80.0, 88.0, 92.0])
dims = (np.round((hi - lo) / VOX).astype(int) + 1).tolist()
A = np.array([[VOX, 0, 0, lo[0]], [0, VOX, 0, lo[1]], [0, 0, VOX, lo[2]], [0, 0, 0, 1.0]])
ii, jj, kk = np.meshgrid(*[np.arange(n) for n in dims], indexing='ij')
P305 = np.stack([lo[0] + VOX * ii, lo[1] + VOX * jj, lo[2] + VOX * kk, np.ones_like(ii, dtype=float)]).reshape(4, -1)
P152 = M305_152 @ P305

def sample(path, order):
    im = nib.load(path); d = np.asarray(im.dataobj).astype(np.float32); V = np.linalg.inv(im.affine) @ P152
    return ndi.map_coordinates(d, V[:3], order=order, mode='constant', cval=0).reshape(dims)

t1 = sample(os.path.join(NIL, 'mni_icbm152_t1_tal_nlin_sym_09a_converted.nii.gz'), 1)
gm = sample(os.path.join(NIL, 'mni_icbm152_gm_tal_nlin_sym_09a_converted.nii.gz'), 1)
wm = sample(os.path.join(NIL, 'mni_icbm152_wm_tal_nlin_sym_09a_converted.nii.gz'), 1)
brain = ndi.binary_fill_holes(ndi.binary_closing(t1 > 4, iterations=2))
csf = np.clip(255.0 * ndi.gaussian_filter(brain.astype(np.float32), 0.6) - gm - wm, 0, 255)

# étiquettes : MeshNet du gabarit pour tout ce qui n'est pas cortex
S = sample(seg_path, 0).astype(np.int16)
# cortex : volume VEP du gabarit (tkrRAS, 2 mm, RLE) → classe de Desikan la plus fréquente de chaque région VEP
vj = json.load(open(os.path.join(ROOT, 'assets', 'vep_volume.json')))
rv = np.frombuffer(base64.b64decode(vj['rle_values']), np.uint8); rn = np.frombuffer(base64.b64decode(vj['rle_lengths']), np.uint16)
vol = np.repeat(rv, rn.astype(np.int64)).reshape(vj['dims']); i0, j0, k0 = vj['offset_vox']
vi = np.round((128 - P305[0]) / 2).astype(int) - i0; vjj = np.round((128 - P305[2]) / 2).astype(int) - j0; vk = np.round((P305[1] + 128) / 2).astype(int) - k0
ok = (vi >= 0) & (vjj >= 0) & (vk >= 0) & (vi < vol.shape[0]) & (vjj < vol.shape[1]) & (vk < vol.shape[2])
VEP = np.zeros(P305.shape[1], np.int16); VEP[ok] = vol[vi[ok], vjj[ok], vk[ok]]; VEP = VEP.reshape(dims)
APARC = ['unknown', 'bankssts', 'caudalanteriorcingulate', 'caudalmiddlefrontal', 'corpuscallosum', 'cuneus', 'entorhinal', 'fusiform', 'inferiorparietal', 'inferiortemporal', 'isthmuscingulate', 'lateraloccipital', 'lateralorbitofrontal', 'lingual', 'medialorbitofrontal', 'middletemporal', 'parahippocampal', 'paracentral', 'parsopercularis', 'parsorbitalis', 'parstriangularis', 'pericalcarine', 'postcentral', 'posteriorcingulate', 'precentral', 'precuneus', 'rostralanteriorcingulate', 'rostralmiddlefrontal', 'superiorfrontal', 'superiorparietal', 'superiortemporal', 'supramarginal', 'frontalpole', 'temporalpole', 'transversetemporal', 'insula']
mesh = json.load(open(os.path.join(ROOT, 'assets', 'brain_meshes.json')))
aparc = np.loadtxt(os.path.join(ROOT, 'tools', 'data', 'aparc_fsa5.csv')).astype(int)
C = np.zeros((163, len(names)), np.int64)
for hi_, h in enumerate(['lh', 'rh']):
    H = mesh['hemis'][h]; n = H['n_vertices']; VL = np.frombuffer(base64.b64decode(H['labels']), np.uint8)
    a = aparc[hi_ * n:(hi_ + 1) * n] - (35 if hi_ else 0); a[a < 0] = 0
    for v, l in zip(VL, a):
        if not v or not l or APARC[l] == 'corpuscallosum': continue
        C[v, idx['ctx-%s-%s' % (h, APARC[l])]] += 1
v2d, compat = {}, {}
for v in range(1, 145):
    cand = [d for d, nm in enumerate(names) if nm.startswith('ctx-' + ('lh' if v <= 72 else 'rh') + '-')]
    tot = C[v, cand].sum()
    if tot: v2d[v] = cand[int(np.argmax(C[v, cand]))]; compat[v] = set(d for d in cand if C[v, d] >= 0.05 * tot)
seg = S.copy()
cortS = np.isin(S, [i for i, nm in enumerate(names) if nm.startswith('ctx-')])
deep = np.isin(S, [i for i, nm in enumerate(names) if any(k in nm for k in ('Thalamus', 'Caudate', 'Putamen', 'Pallidum', 'Hippocampus', 'Amygdala', 'Accumbens', 'VentralDC', 'Vent', 'Brain-Stem', 'Cerebellum'))])
# ruban VEP : classe de Desikan de MeshNet si elle est compatible avec la région VEP (≥ 5 % des sommets partagés), sinon la
# classe majoritaire de la région VEP — toutes les classes de Desikan restent représentées (petites régions comprises)
for v, d in v2d.items():
    m = (VEP == v) & ~deep
    keep = m & np.isin(S, list(compat[v])); seg[m] = d; seg[keep] = S[keep]
# cortex MeshNet restant hors du ruban VEP : classe de Desikan du voxel VEP cortical le plus proche (même côté)
cortV = (VEP >= 1) & (VEP <= 144)
if cortV.any():
    _, (ni, nj, nk) = ndi.distance_transform_edt(~cortV, return_indices=True)
    rest = cortS & ~cortV & ~deep
    near = VEP[ni[rest], nj[rest], nk[rest]]
    seg[rest] = np.array([v2d.get(int(v), 0) for v in near], np.int16)
seg[(seg > 0) & ~brain & (gm + wm < 25)] = 0

def b64nii(data, dtype):
    im = nib.Nifti1Image(np.asarray(data).astype(dtype), A); im.header.set_xyzt_units('mm')
    bio = io.BytesIO(); im.to_file_map({'image': nib.FileHolder(fileobj=bio), 'header': nib.FileHolder(fileobj=bio)})
    return base64.b64encode(gzip.compress(bio.getvalue(), 9)).decode('ascii')

t1n = np.clip(t1 / max(1.0, np.percentile(t1[brain], 99.5)) * 220, 0, 255)
out = {'version': 1, 'space': 'fsaverage tkrRAS (MNI305)', 'vox': VOX, 'dims': dims, 'affine': A.tolist(),
       'source': 'MNI ICBM152 2009a non linéaire symétrique (Fonov et al. 2011, via nilearn) ; cortex de Desikan d’après le volume VEP × aparc fsaverage5 (ENIGMA) ; autres classes : MeshNet aparc+aseg 104 du gabarit',
       'license': 'ICBM152 2009 : © 1993–2009 Louis Collins, McConnell Brain Imaging Centre, MNI, McGill University (copie et usage permis avec cette mention)',
       'labels': 'model21_104class',
       't1': b64nii(t1n, np.uint8), 'gm': b64nii(np.clip(gm, 0, 255), np.uint8), 'wm': b64nii(np.clip(wm, 0, 255), np.uint8), 'csf': b64nii(csf, np.uint8), 'seg': b64nii(seg, np.uint8)}
p = os.path.join(ROOT, 'assets', 'template_spm.json'); json.dump(out, open(p, 'w'), separators=(',', ':'))
nc = int(np.isin(seg, [i for i, nm in enumerate(names) if nm.startswith('ctx-')]).sum())
print(p, round(os.path.getsize(p) / 1e3), 'ko · grille', dims, '· voxels cerveau', int(brain.sum()), '· cortex étiqueté', nc, '· classes', len(np.unique(seg)) - 1)
