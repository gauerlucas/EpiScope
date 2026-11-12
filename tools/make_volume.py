#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Volume d'étiquettes VEP (gabarit fsaverage) pour le module d'électrodes → assets/vep_volume.json

Source : aparc+aseg.vep.mgz (256³, 1 mm, espace tkrRAS : i = 128 − x, j = 128 − z, k = y + 128).
Sortie : volume 2 mm (mode des blocs 2×2×2), recadré sur le cerveau, étiquettes = index canonique des 162 régions
(0 = hors cerveau, 200 = substance blanche, 201 = LCR/ventricules, 202 = autre tissu), encodé en RLE + base64.

    python tools/make_volume.py [chemin/aparc+aseg.vep.mgz]
"""
import sys, os, json, base64, numpy as np, nibabel as nib

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
src = sys.argv[1] if len(sys.argv) > 1 else '/mnt/user-data/uploads/EpiScope/old_version/fsaverage/aparc+aseg.vep.mgz'
img = nib.load(src); vol = np.asarray(img.dataobj).astype(np.int32)
assert vol.shape == (256, 256, 256)

SUB_L = {71073: 145, 71074: 146, 18: 147, 9: 148, 10: 148, 71075: 149, 12: 150, 13: 151, 71076: 152, 71077: 153}
SUB_R = {72073: 154, 72074: 155, 54: 156, 48: 157, 49: 157, 72075: 158, 51: 159, 52: 160, 72076: 161, 72077: 162}
WM = {2, 41, 251, 252, 253, 254, 255, 7, 46}
CSF = {4, 5, 14, 15, 43, 44, 31, 63, 24, 72}
lut = np.zeros(80000, dtype=np.uint8)
for k in range(1, 73): lut[71000 + k] = k; lut[72000 + k] = 72 + k
for v, i in SUB_L.items(): lut[v] = i
for v, i in SUB_R.items(): lut[v] = i
for v in WM: lut[v] = 200
for v in CSF: lut[v] = 201
for v in (16, 28, 60, 8, 47, 17, 53, 26, 58, 11, 50, 30, 62, 77, 85, 1000, 2000): lut[v] = max(lut[v], 202) if lut[v] == 0 else lut[v]
lab = lut[np.clip(vol, 0, 79999)]

# mode des blocs 2×2×2
def block_mode(a):
    s = a.shape; b = a.reshape(s[0] // 2, 2, s[1] // 2, 2, s[2] // 2, 2).transpose(0, 2, 4, 1, 3, 5).reshape(s[0] // 2, s[1] // 2, s[2] // 2, 8)
    out = np.zeros(b.shape[:3], dtype=np.uint8)
    # vote : la valeur la plus fréquente du bloc ; priorité aux étiquettes corticales/sous-corticales sur SB en cas d'égalité
    for idx in np.ndindex(b.shape[:3]):
        vals, counts = np.unique(b[idx], return_counts=True)
        best = counts.max(); cands = vals[counts == best]
        pick = cands[0]
        for c in cands:
            if 1 <= c <= 162: pick = c; break
        out[idx] = pick
    return out
lab2 = block_mode(lab)          # 128³ à 2 mm
nz = np.argwhere(lab2 > 0)
i0, j0, k0 = nz.min(0); i1, j1, k1 = nz.max(0) + 1
crop = lab2[i0:i1, j0:j1, k0:k1]
flat = crop.ravel(order='C')
# RLE : paires (valeur, longueur) sur uint8/uint16
runs_v, runs_n = [], []
cur, n = int(flat[0]), 0
for v in flat:
    v = int(v)
    if v == cur and n < 65535: n += 1
    else: runs_v.append(cur); runs_n.append(n); cur, n = v, 1
runs_v.append(cur); runs_n.append(n)
rv = np.array(runs_v, dtype=np.uint8); rn = np.array(runs_n, dtype=np.uint16)
out = {
    'version': 1, 'space': 'fsaverage tkrRAS mm', 'voxel_mm': 2, 'dims': [int(i1 - i0), int(j1 - j0), int(k1 - k0)],
    'offset_vox': [int(i0), int(j0), int(k0)],   # indices (à 2 mm) dans le volume 128³ ; voxel 1 mm = 2*index
    'labels_note': '0 hors cerveau, 1-162 régions VEP (ordre canonique), 200 substance blanche, 201 LCR, 202 autre',
    'rle_values': base64.b64encode(rv.tobytes()).decode('ascii'), 'rle_lengths': base64.b64encode(rn.tobytes()).decode('ascii'),
}
os.makedirs(os.path.join(ROOT, 'assets'), exist_ok=True)
with open(os.path.join(ROOT, 'assets', 'vep_volume.json'), 'w') as f: json.dump(out, f)
print('dims', out['dims'], 'offset', out['offset_vox'], 'runs', len(rv), 'json', os.path.getsize(os.path.join(ROOT, 'assets', 'vep_volume.json')) // 1024, 'KB')
# vérification : point médian de l'hippocampe antérieur gauche
import csv
rows = {r['name']: r for r in csv.DictReader(open(os.path.join(ROOT, 'assets', 'regions_table.csv')))}
def label_at(x, y, z):
    i, j, k = int(round((128 - x) / 2)) - i0, int(round((128 - z) / 2)) - j0, int(round((y + 128) / 2)) - k0
    return int(crop[i, j, k]) if 0 <= i < crop.shape[0] and 0 <= j < crop.shape[1] and 0 <= k < crop.shape[2] else -1
for n in ['Left-Hippocampus-anterior', 'Left-Amygdala', 'Right-Precuneus', 'Left-Insula-gyri-brevi', 'Left-T2-anterior']:
    r = rows[n]; print(n, '→ label', label_at(float(r['cx']), float(r['cy']), float(r['cz'])), 'attendu', r['index'])
