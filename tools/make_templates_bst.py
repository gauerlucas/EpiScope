#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
EpiScope v3.3.0 — surfaces du gabarit tirées du modèle ICBM152_2026 de Brainstorm (ICBM 152 NLin 2009c asymétrique traité
par FreeSurfer 8.2.0, T1 seul ; Tadel et al. 2011, Fischl 2012), dans le même espace que MNI 2009b (MNI152NLin2009bAsym).
Remplace les surfaces piales segmentées sur le T1 2009b (v3.0.0) et les structures profondes de MeshNet ; les régions VEP du
gabarit (assets/vep_volume.json) restent la référence des étiquettes : régions des sommets du cortex, découpe des structures
profondes (hippocampe antérieur / postérieur…).

    python3 tools/make_templates_bst.py extract <ICBM152_2026.zip ou dossier dézippé> <dossier de travail>
    node    tools/make_templates_bst.mjs <dossier de travail>
    python3 tools/make_templates_bst.py assets <dossier de travail>

extract : lit les .mat de Brainstorm (aucun accès réseau ; le modèle est téléchargé par l'utilisateur, jamais versé au dépôt) :
  bst_cortex.json   surfaces piales haute résolution des deux hémisphères en coordonnées MNI (mm) ;
  sub_vep.nii.gz    structures profondes et cervelet de l'aseg FreeSurfer du gabarit, numérotées en régions VEP 145–162
                    (hippocampe partagé entre antérieur et postérieur d'après la région VEP la plus proche) ;
  vep_2mm.nii.gz    régions VEP du gabarit (assets/vep_volume.json) en NIfTI, pour les étiquettes des sommets ;
  bst_info.json     fichiers lus, contrôles (étendue, écart aux anciennes surfaces, volumes des structures).
assets : bst_meshes.json (étape Node) → assets/brain_meshes.json (centres, distances, adjacence reprise telle quelle).
"""
import sys, os, io, json, base64, zipfile, tempfile, re
import numpy as np
from scipy import io as sio
from scipy import ndimage as ndi

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from nifti_min import nii_write  # noqa: E402

SPACE = 'MNI152NLin2009bAsym'
SOURCE = ('Surfaces piales et structures profondes : modèle ICBM152_2026 de Brainstorm (ICBM 152 NLin 2009c asymétrique, '
          'FreeSurfer 8.2.0, T1 seul ; Tadel et al. 2011) ; régions VEP et coordonnées : MNI ICBM 152 NLin 2009b asymétrique '
          '(Fonov et al. 2009, 2011) ; tools/make_templates_bst.py')
LICENSE = ('Modèle ICBM152 de Brainstorm (https://neuroimage.usc.edu/brainstorm), redistribuable avec mention : Tadel F, Baillet S, '
           'Mosher JC, Pantazis D, Leahy RM. Brainstorm: a user-friendly application for MEG/EEG analysis. Comput Intell '
           'Neurosci 2011 ; FreeSurfer (Fischl B. NeuroImage 2012). ICBM 152 NLin 2009 : Copyright (C) 1993–2004 Louis Collins, '
           'McConnell Brain Imaging Centre, Montreal Neurological Institute, McGill University. Usage, copie, modification et '
           'distribution permis avec cet avis (licence du MNI).')

# aseg FreeSurfer → familles VEP (gauche ; droite = +9) ; cervelet = écorce + substance blanche (surface externe)
ASEG = {'L': {17: (145, 146), 18: (147,), 10: (148,), 11: (149,), 12: (150,), 13: (151,), 26: (152,), 8: (153,), 7: (153,)},
        'R': {53: (154, 155), 54: (156,), 49: (157,), 50: (158,), 51: (159,), 52: (160,), 58: (161,), 47: (162,), 46: (162,)}}
NAMES = {17: 'hippocampus', 53: 'hippocampus', 18: 'amygdala', 54: 'amygdala', 10: 'thalamus', 49: 'thalamus', 11: 'caudate',
         50: 'caudate', 12: 'putamen', 51: 'putamen', 13: 'pallidum', 52: 'pallidum', 26: 'accumbens', 58: 'accumbens',
         8: 'cerebellum', 47: 'cerebellum', 7: 'cerebellum', 46: 'cerebellum'}
b64 = lambda a, t: base64.b64encode(np.ascontiguousarray(a, dtype=t).tobytes()).decode('ascii')


# ---------------------------------------------------------------------------------------------------- lecture Brainstorm
class Source:
    """.mat du modèle : archive .zip (lue sans extraction) ou dossier"""
    def __init__(self, path):
        self.path = path
        if os.path.isdir(path):
            self.files = {os.path.relpath(os.path.join(d, f), path).replace('\\', '/'): os.path.join(d, f)
                          for d, _, fs in os.walk(path) for f in fs if f.lower().endswith('.mat')}
            self.zip = None
        else:
            self.zip = zipfile.ZipFile(path)
            self.files = {n: n for n in self.zip.namelist() if n.lower().endswith('.mat')}

    def find(self, pattern):
        rx = re.compile(pattern, re.I)
        return sorted(n for n in self.files if rx.search(os.path.basename(n)))

    def load(self, name, **kw):
        kw = dict(squeeze_me=True, struct_as_record=False, **kw)
        if self.zip is None: return sio.loadmat(self.files[name], **kw)
        return sio.loadmat(io.BytesIO(self.zip.read(name)), **kw)


def field(o, k, default=None):
    return getattr(o, k, default) if not isinstance(o, dict) else o.get(k, default)


def mri_world(sMri):
    """transformations de Brainstorm (cs_convert.m) : SCS (m) → MNI (mm) et voxel (0-based) → MNI (mm)"""
    vs = np.atleast_1d(np.asarray(sMri['Voxsize'], float)).ravel()
    if vs.size == 1: vs = np.repeat(vs, 3)
    T = np.asarray(sMri.get('InitTransf', []), dtype=object); vox2ras = None
    if T.size:
        for row in np.atleast_2d(T):
            if str(row[0]).lower() == 'vox2ras': vox2ras = np.asarray(row[1], float)
    if vox2ras is None:
        # ICBM152_2026 : InitTransf vide ; NCS (MNI linéaire) : mni (mm) = R · mri (mm) + T, mri = voxel (1-based) × taille
        ncs = sMri['NCS']; Rn = np.asarray(field(ncs, 'R'), float); Tn = np.asarray(field(ncs, 'T'), float).ravel()
        vox2ras = np.eye(4); vox2ras[:3, :3] = Rn @ np.diag(vs); vox2ras[:3, 3] = Rn @ vs + Tn
    scs = sMri['SCS']; R = np.asarray(field(scs, 'R'), float); t = np.asarray(field(scs, 'T'), float).ravel()
    mri2scs = np.eye(4); mri2scs[:3, :3] = R; mri2scs[:3, 3] = t / 1000            # MRI (m) → SCS (m)
    scs2mri = np.linalg.inv(mri2scs)

    def scs_to_mni(P):                                                              # P : n × 3, m
        Pm = (scs2mri @ np.c_[P, np.ones(len(P))].T)[:3].T * 1000                   # MRI (mm)
        vox0 = Pm / vs - 1                                                          # voxels de Brainstorm (1-based) → 0-based
        return (vox2ras @ np.c_[vox0, np.ones(len(vox0))].T)[:3].T
    return scs_to_mni, vox2ras, vs


def scouts(tess, atlas_name='Structures'):
    A = np.atleast_1d(field(tess, 'Atlas', []))
    for a in A:
        if str(field(a, 'Name', '')).lower() == atlas_name.lower():
            return [(str(field(s, 'Label', '')), np.atleast_1d(np.asarray(field(s, 'Vertices', []), int)) - 1) for s in np.atleast_1d(field(a, 'Scouts', []))]
    return []


def split_hemis(V, F, sc):
    """sommets gauche / droite : scouts « Structures » (Cortex L / R, lh / rh) sinon composantes connexes, côté par x moyen"""
    side = np.full(len(V), -1, int)
    for lab, idx in sc:
        l = lab.lower().strip()
        if re.search(r'(^lh|left|\bl$| l$|\bl\b)', l): side[idx] = 0
        elif re.search(r'(^rh|right|\br$| r$|\br\b)', l): side[idx] = 1
    if (side < 0).any():
        import scipy.sparse as sp, scipy.sparse.csgraph as cg
        n = len(V); e = np.r_[F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]]
        G = sp.coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(n, n))
        nc, lab = cg.connected_components(G, directed=False)
        for c in range(nc):
            m = lab == c
            if m.sum() > 1000: side[m] = 0 if V[m, 0].mean() < 0 else 1
    out = {}
    for s, h in ((0, 'lh'), (1, 'rh')):
        keep = side == s; ff = F[keep[F].all(1)]; used = np.unique(ff); remap = -np.ones(len(V), int); remap[used] = np.arange(len(used))
        out[h] = {'pos': V[used], 'faces': remap[ff]}
    return out


def decode_vep():
    """assets/vep_volume.json → (volume uint8, affine) ; grille : i = (128 − x)/2 − off0, j = (128 − z)/2 − off1, k = (y + 128)/2 − off2"""
    j = json.load(open(os.path.join(ROOT, 'assets', 'vep_volume.json')))
    rv = np.frombuffer(base64.b64decode(j['rle_values']), np.uint8); rn = np.frombuffer(base64.b64decode(j['rle_lengths']), np.uint16)
    a = np.repeat(rv, rn.astype(int)).reshape(j['dims']); o = j['offset_vox']
    A = np.array([[-2, 0, 0, 128 - 2 * o[0]], [0, 0, 2, 2 * o[2] - 128], [0, -2, 0, 128 - 2 * o[1]], [0, 0, 0, 1]], float)
    return a, A


def mesh_volume(P, F):
    a, b, c = P[F[:, 0]], P[F[:, 1]], P[F[:, 2]]
    return float(np.einsum('ij,ij->i', a, np.cross(b, c)).sum() / 6)


def extract(src_path, work):
    os.makedirs(work, exist_ok=True)
    S = Source(src_path); info = {'source': os.path.basename(src_path), 'files': sorted(S.files)}
    t1 = S.find(r'^subjectimage_T1\.mat$') or S.find(r'^subjectimage_.*T1.*\.mat$')
    if not t1: raise SystemExit('subjectimage_T1.mat introuvable dans ' + src_path)
    sMri = S.load(t1[0], variable_names=['Voxsize', 'InitTransf', 'SCS', 'NCS', 'Comment'])
    scs_to_mni, vox2ras, vs = mri_world(sMri); info['t1'] = t1[0]; info['voxsize'] = vs.tolist()

    # ------------------------------------------------ cortex : surface piale la plus fine
    cand = []
    for n in S.find(r'^tess_.*pial.*\.mat$') or S.find(r'^tess_cortex.*\.mat$'):
        if 'mid' in n.lower() or 'white' in n.lower(): continue
        t = S.load(n, variable_names=['Vertices', 'Comment']); cand.append((len(t['Vertices']), n))
    if not cand: raise SystemExit('aucune surface piale (tess_cortex_pial_*.mat)')
    nv, pial = max(cand); info['pial'] = pial; info['pial_vertices'] = int(nv)
    tess = S.load(pial)
    V = scs_to_mni(np.asarray(tess['Vertices'], float)); F = np.asarray(tess['Faces'], int) - 1
    H = split_hemis(V, F, scouts(tess))
    old = json.load(open(os.path.join(ROOT, 'assets', 'brain_meshes.json')))
    cortex = {}
    for h in ('lh', 'rh'):
        P, Fh = H[h]['pos'], H[h]['faces']
        if mesh_volume(P, Fh) < 0: Fh = Fh[:, [0, 2, 1]]                         # faces orientées vers l'extérieur
        O = np.frombuffer(base64.b64decode(old['hemis'][h]['pial']), np.float32).reshape(-1, 3)
        from scipy.spatial import cKDTree
        d = cKDTree(O).query(P)[0]
        info[h] = {'vertices': int(len(P)), 'faces': int(len(Fh)), 'bbox': [P.min(0).round(1).tolist(), P.max(0).round(1).tolist()],
                   'old_bbox': [O.min(0).round(1).tolist(), O.max(0).round(1).tolist()],
                   'dist_to_old_mm': {'median': round(float(np.median(d)), 2), 'p95': round(float(np.percentile(d, 95)), 2)},
                   'volume_cm3': round(mesh_volume(P, Fh) / 1000, 1)}
        cortex[h] = {'pos': np.round(P, 3).ravel().tolist(), 'faces': Fh.ravel().tolist()}
        print(h, info[h])
    json.dump(cortex, open(os.path.join(work, 'bst_cortex.json'), 'w'), separators=(',', ':'))

    # ------------------------------------------------ aseg du gabarit → structures VEP 145–162
    vep, Av = decode_vep(); nii_write(os.path.join(work, 'vep_2mm.nii.gz'), vep.astype(np.uint8), Av)
    asegs = [n for n in S.find(r'^subjectimage_.*aseg.*\.mat$') if 'aparc' not in n.lower()]
    if not asegs: raise SystemExit('aseg absent du modèle (subjectimage_*aseg*.mat) : voir le repli CAT12 dans make_templates_bst.py')
    at = S.load(asegs[0]); info['aseg'] = asegs[0]
    cube = np.asarray(at['Cube']).astype(np.int32)
    if cube.ndim == 4: cube = cube[..., 0]
    labels = {}
    for row in np.atleast_2d(np.asarray(at.get('Labels', []), dtype=object)):
        try: labels[int(row[0])] = str(row[1])
        except (ValueError, TypeError, IndexError): pass
    for code, nm in NAMES.items():                                                  # contrôle des codes FreeSurfer
        if code in labels and nm[:5] not in labels[code].lower().replace(' ', '').replace('-', ''):
            print('attention : code aseg', code, '=', labels[code], '(attendu :', nm + ')')
    info['aseg_labels'] = {str(k): labels.get(k) for k in sorted(NAMES)}
    sub = np.zeros(cube.shape, np.uint8)
    # régions VEP du gabarit ré-échantillonnées sur la grille de l'aseg (voisin le plus proche)
    ii, jj, kk = np.nonzero(np.isin(cube, list(NAMES)))
    W = (vox2ras @ np.c_[ii, jj, kk, np.ones(len(ii))].T)
    Vi = np.round(np.linalg.inv(Av) @ W)[:3].astype(int)
    for side, M in ASEG.items():
        for code, fam in M.items():
            m = cube[ii, jj, kk] == code
            if not m.any(): print('aseg sans', code, NAMES[code]); continue
            if len(fam) == 1: sub[ii[m], jj[m], kk[m]] = fam[0]; continue
            # famille partagée (hippocampe) : région VEP la plus proche (transformée de distance sur la grille VEP)
            inside = np.isin(vep, fam); _, idx = ndi.distance_transform_edt(~inside, return_indices=True)
            q = Vi[:, m]; q = np.clip(q, 0, np.array(vep.shape)[:, None] - 1)
            near = idx[:, q[0], q[1], q[2]]; sub[ii[m], jj[m], kk[m]] = vep[near[0], near[1], near[2]]
    vox_mm3 = float(abs(np.linalg.det(vox2ras[:3, :3])))
    info['structures_cm3'] = {str(v): round(float((sub == v).sum()) * vox_mm3 / 1000, 2) for v in range(145, 163)}
    print('structures (cm³)', info['structures_cm3'])
    nii_write(os.path.join(work, 'sub_vep.nii.gz'), sub, vox2ras)
    json.dump(info, open(os.path.join(work, 'bst_info.json'), 'w'), indent=1, ensure_ascii=False)
    print('extraction terminée →', work)


# ---------------------------------------------------------------------------------------------------- assets/brain_meshes.json
def assets(work):
    """même assemblage que make_templates_assets.py (bloc brain_meshes.json), sur bst_meshes.json"""
    old_mesh = json.load(open(os.path.join(ROOT, 'assets', 'brain_meshes.json')))
    M = json.load(open(os.path.join(work, 'bst_meshes.json')))
    regions = [dict(r) for r in old_mesh['regions']]; acc = {}; hemis = {}
    for h in ('lh', 'rh'):
        Hh = M['hemis'][h]; P = np.array(Hh['pial'], np.float32).reshape(-1, 3); L = np.array(Hh['labels'], np.uint8)
        if Hh['n'] > 65535: raise SystemExit('plus de 65 535 sommets : faces en uint16 impossibles')
        for v in np.unique(L):
            if v: acc[int(v)] = (P[L == v].mean(0), int((L == v).sum()))
        s = np.array(Hh['sulc'], np.float32); s8 = np.clip(np.round(s / max(np.abs(s).max(), 1e-6) * 127), -127, 127)
        hemis[h] = {'n_vertices': Hh['n'], 'n_faces': len(Hh['faces']) // 3, 'pial': b64(P.ravel(), np.float32),
                    'inflated': b64(np.array(Hh['inflated'], np.float32), np.float32), 'flat': None,
                    'faces': b64(np.array(Hh['faces']), np.uint16), 'sulc': b64(s8, np.int8), 'labels': b64(L, np.uint8)}
    sub = []
    for s in M['subcortical']:
        V = np.array(s['vertices'], np.float32).reshape(-1, 3); F = np.array(s['faces'])
        acc[s['index']] = (V.mean(0), int(len(V)))
        sub.append({'region_index': s['index'], 'name': s['name'], 'n_vertices': int(len(V)), 'n_faces': int(len(F) // 3),
                    'vertices': b64(V.ravel(), np.float32), 'faces': b64(F, np.uint16)})
    for r in regions:
        if not r['index']: continue
        if r['index'] in acc: c, n = acc[r['index']]; r['centroid'] = [round(float(x), 2) for x in c]; r['n_vertices'] = n
        else: r['centroid'] = None; r['n_vertices'] = 0; print('région sans sommet :', r['name'])
    cents = np.zeros((len(regions), 3)); valid = np.zeros(len(regions), bool)
    for r in regions:
        if r['centroid'] is not None: cents[r['index']] = r['centroid']; valid[r['index']] = True
    D = np.sqrt(((cents[:, None] - cents[None]) ** 2).sum(-1)); D[~valid] = 0; D[:, ~valid] = 0; np.fill_diagonal(D, 0)
    out = {'version': 2, 'space': SPACE + ' mm', 'source': SOURCE, 'license': LICENSE,
           'n_regions': 162, 'regions': regions, 'hemis': hemis, 'subcortical': sub, 'adjacency': old_mesh['adjacency'],
           'centroid_distances': b64(D.astype(np.float32).ravel(), np.float32)}
    p = os.path.join(ROOT, 'assets', 'brain_meshes.json'); json.dump(out, open(p, 'w'), separators=(',', ':'))
    print('brain_meshes.json', round(os.path.getsize(p) / 1e6, 2), 'Mo')


if __name__ == '__main__':
    if len(sys.argv) < 3 or sys.argv[1] not in ('extract', 'assets'):
        print(__doc__); sys.exit(1)
    if sys.argv[1] == 'extract': extract(sys.argv[2], sys.argv[3])
    else: assets(sys.argv[2])
