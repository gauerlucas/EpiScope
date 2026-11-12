#!/usr/bin/env python3
"""Scanner post-implantation synthétique à partir d'un T1 réel (tests de SV.CTElec) :
crâne, cerveau, électrodes DIXI (plots 2 mm au pas de 3,5 mm, fils, vis d'ancrage), flou de reconstruction, bruit.
Sorties : ct.nii.gz (grille 0,6 mm, champ et orientation différents du T1), truth.json (plots en monde T1),
brainmask.nii.gz (grille du T1, cerveau dilaté)."""
import json, sys, numpy as np, nibabel as nib
from scipy import ndimage as ndi
out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/claude-0/ct'
t1 = nib.load('/home/claude/neuroneural/brainchop/v3/data/t1_c.nii.gz'); lab = np.asarray(nib.load('/home/claude/neuroneural/brainchop/v3/data/labels.nii.gz').dataobj).astype(np.int16)
A1 = t1.affine; T1 = np.asarray(t1.dataobj).astype(np.float32)
brain = ndi.binary_fill_holes(lab > 0); head = ndi.binary_fill_holes(ndi.binary_closing(T1 > 25, iterations=3))
brain_d = ndi.binary_dilation(brain, iterations=3)
skull = ndi.binary_dilation(brain, iterations=8) & ~ndi.binary_dilation(brain, iterations=2) & head
nib.save(nib.Nifti1Image(brain_d.astype(np.uint8), A1), f'{out}/brainmask.nii.gz')
# grille du scanner : 0,6 mm, RAS, champ 200 × 230 × 170 mm, décalée et tournée de quelques degrés par rapport au T1
rng = np.random.default_rng(7)
ang = np.deg2rad([4, -3, 6]); cx, cy, cz = np.cos(ang); sx, sy, sz = np.sin(ang)
R = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]]) @ np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]]) @ np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
vox = 0.6; dims = (334, 384, 284)
ctr = A1[:3, :3] @ (np.array(T1.shape) / 2) + A1[:3, 3]   # centre du T1 (monde)
Act = np.eye(4); Act[:3, :3] = R * vox; Act[:3, 3] = ctr + np.array([3, -5, 8]) - R @ (np.array(dims) * vox / 2)
# tissus (HU) échantillonnés sur la grille du scanner (par tranches pour limiter la mémoire)
hu = np.full(dims, -1000, np.float32)
Ainv1 = np.linalg.inv(A1); headf, brainf, csf, skullf, T1f = head.astype(np.float32), brain.astype(np.float32), (lab == 1).astype(np.float32), skull.astype(np.float32), T1
ii, jj = np.meshgrid(np.arange(dims[0]), np.arange(dims[1]), indexing='ij')
for k in range(dims[2]):
    W = Act[:3, :3] @ np.stack([ii.ravel(), jj.ravel(), np.full(ii.size, k)]) + Act[:3, 3:4]
    V1 = Ainv1[:3, :3] @ W + Ainv1[:3, 3:4]
    sm = lambda vol, o=0: ndi.map_coordinates(vol, V1, order=o, mode='constant', cval=0).reshape(dims[:2])
    sl = np.full(dims[:2], -1000, np.float32); h = sm(headf) > 0.5; sl[h] = 40
    bb = sm(brainf) > 0.5; t = sm(T1f, 1); sl[bb] = 35 + 0.03 * (t[bb] - 120); sl[sm(csf) > 0.5] = 8; sl[sm(skullf) > 0.5] = 1400
    hu[:, :, k] = sl
del ii, jj
# électrodes : (cible, point d'entrée sur le cerveau) en monde T1, à la main pour couvrir les deux hémisphères
truth = []
cm = np.argwhere(brain).mean(0); C = A1[:3, :3] @ cm + A1[:3, 3]
targets = [(-25, -8, -20, 12), (-28, -20, -16, 10), (-30, -32, -10, 10), (-35, 5, 0, 15), (-40, -15, 15, 8), (-10, 30, 30, 12), (26, -10, -20, 12), (34, 0, 2, 15), (12, -50, 30, 8), (-8, 10, 50, 5)]
for (x, y, z, n) in targets:
    tgt = C + np.array([x, y, z]) - np.array([0, 0, 0])
    side = 1 if x > 0 else -1
    d = np.array([side, rng.uniform(-0.15, 0.15), rng.uniform(-0.1, 0.25)]); d /= np.linalg.norm(d)   # vers l'extérieur
    if (x, y) == (-8, 10): d = np.array([-0.3, 0.1, 1.0]); d /= np.linalg.norm(d)
    tip = tgt.copy(); contacts = [tip + d * (1 + k * 3.5) for k in range(n)]
    truth.append({'tip': tip.tolist(), 'dir': d.tolist(), 'n': n, 'contacts': [c.tolist() for c in contacts]})
truth_json = {'electrodes': truth}
Ainv = np.linalg.inv(Act)
def paint(p0, p1, r, val):
    # cylindre de p0 à p1 (monde) de rayon r : valeur max (vectorisé sur la boîte englobante)
    L = np.linalg.norm(p1 - p0)
    if L < 0.3: return
    u = (p1 - p0) / L
    corners = np.array([p0 + o for o in [np.array([dx, dy, dz]) for dx in (-r - 1, r + 1) for dy in (-r - 1, r + 1) for dz in (-r - 1, r + 1)]] + [p1 + o for o in [np.array([dx, dy, dz]) for dx in (-r - 1, r + 1) for dy in (-r - 1, r + 1) for dz in (-r - 1, r + 1)]])
    vv = (Ainv[:3, :3] @ corners.T + Ainv[:3, 3:4]).T
    lo = np.maximum(np.floor(vv.min(0)).astype(int), 0); hi = np.minimum(np.ceil(vv.max(0)).astype(int) + 1, dims)
    if np.any(hi <= lo): return
    gi, gj, gk = np.meshgrid(*[np.arange(lo[t], hi[t]) for t in range(3)], indexing='ij')
    Wb = (Act[:3, :3] @ np.stack([gi.ravel(), gj.ravel(), gk.ravel()]) + Act[:3, 3:4]).T - p0
    t = Wb @ u; dd = np.linalg.norm(Wb - np.outer(t, u), axis=1); m = (dd <= r) & (t >= 0) & (t <= L)
    sub = hu[lo[0]:hi[0], lo[1]:hi[1], lo[2]:hi[2]]; flat = sub.reshape(-1); flat[m] = np.maximum(flat[m], val); hu[lo[0]:hi[0], lo[1]:hi[1], lo[2]:hi[2]] = flat.reshape(sub.shape)
for e in truth:
    tip = np.array(e['tip']); d = np.array(e['dir']); n = e['n']
    for k in range(n): c = tip + d * (1 + k * 3.5); paint(c - d * 1.0, c + d * 1.0, 0.5, 9000)
    end = tip + d * (2 + (n - 1) * 3.5); exitp = end
    # fil jusqu'au crâne puis vis d'ancrage (dans l'os, hors du masque cérébral)
    s = 0
    while True:
        q = end + d * s; vq = np.linalg.inv(A1) @ np.append(q, 1); ii = np.round(vq[:3]).astype(int)
        if s > 120 or not (0 <= ii[0] < 256 and 0 <= ii[1] < 256 and 0 <= ii[2] < 256) or not brain_d[tuple(ii)]: break
        s += 0.5
    paint(end, end + d * s, 0.2, 4500)
    paint(end + d * (s + 2), end + d * (s + 14), 1.0, 9000)
hu = ndi.gaussian_filter(hu, 0.45 / vox) + rng.normal(0, 15, dims)
img = nib.Nifti1Image(np.clip(hu, -1024, 3071).astype(np.int16), Act); img.header.set_xyzt_units('mm')
nib.save(img, f'{out}/ct.nii.gz'); json.dump(truth_json, open(f'{out}/truth.json', 'w'))
print('CT', dims, 'électrodes', len(truth), 'centre cerveau', C.round(1).tolist())
