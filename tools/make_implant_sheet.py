#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Planche vierge d'implantation (dessin au trait de l'équipe de l'auteur, libre) → src/implant_sheet.js (v3.4.1)

Vue « tal » : projection latérale composée (voir composite()) ; deep : silhouettes sagittales de l'amygdale et de l'hippocampe
du gabarit (deep_silhouettes(), coordonnées MNI y, z)

Quatre vues d'un hémisphère gauche, dessinées à la main : face latérale, face mésiale (en miroir, antérieur à gauche comme la
latérale), insula (opercules retirés), face inférieure (ligne médiane à gauche, antérieur en haut). Chaque vue est découpée,
agrandie, seuillée (les repères gris de pliage de la page disparaissent) puis vectorisée par potrace (potracer, pure Python) :
chemins SVG remplis, coordonnées en pixels de la planche relatives au coin de la vue.

Calage sur le gabarit MNI (fait à l'exécution, dans implant2d.js, sur le maillage chargé) : repères de chaque dessin en
pixels (lm), mis en correspondance avec les limites du cortex du gabarit —
  latérale / mésiale : a = pôle frontal (y max), p = pôle occipital (y min), top = vertex (z max), bot = bas du lobe temporal
  (z min) ; insula : limites de l'insula gardée (antérieur, postérieur, haut, bas) ; inférieure : mid = ligne médiane
  (|x| = 0), lat = bord latéral (|x| max), a = pôle frontal, p = pôle occipital.
Hémisphère droit : chaque vue en miroir horizontal.

    pip install potracer pillow numpy
    python3 tools/make_implant_sheet.py planche.png talairach.png
    (planche de l'équipe de 1344 × 930 px ; planche de Talairach avec sa grille A–I × 1–12, CA-CP, VCA, VCP)
"""
import sys, os, json
import numpy as np
from PIL import Image
import potrace
from scipy import ndimage as ndi
from skimage import measure

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
K = 4            # agrandissement avant seuillage (traits plus lisses)
THR = 140        # seuil des traits (les repères de pliage valent ~163)
# boîtes des vues (x0, y0, x1, y1, pixels de la planche) et repères (pixels de la planche)
VIEWS = {
    'lat': {'box': (448, 56, 1036, 482), 'lm': {'a': 458, 'p': 1022, 'top': 66, 'bot': 430}},
    'med': {'box': (434, 488, 1024, 868), 'lm': {'a': 443, 'p': 1012, 'top': 498, 'bot': 860}},
    'ins': {'box': (1040, 236, 1336, 416), 'lm': {'a': 1049, 'p': 1327, 'top': 244, 'bot': 409}},
    'inf': {'box': (1054, 426, 1282, 856), 'lm': {'mid': 1085, 'lat': 1273, 'a': 433, 'p': 848}},
}

def lines(img, box):
    """traits sombres de la vue, agrandie K fois (booléens)"""
    x0, y0, x1, y1 = box
    c = img.crop(box).resize(((x1 - x0) * K, (y1 - y0) * K), Image.LANCZOS)
    return np.array(c.convert('L')) < THR

def trace(img, box, mask=None):
    m = lines(img, box) if mask is None else mask
    bmp = potrace.Bitmap(~m)   # potracer : les pixels « faux » sont tracés (ici, les traits sombres)
    path = bmp.trace(turdsize=6 * K * K // 4, alphamax=1.0, opticurve=True, opttolerance=0.3)
    f = lambda p: f'{p.x / K:.1f} {p.y / K:.1f}'
    d = []
    for cv in path:
        d.append('M' + f(cv.start_point))
        for seg in cv.segments:
            if seg.is_corner: d.append('L' + f(seg.c) + 'L' + f(seg.end_point))
            else: d.append('C' + f(seg.c1) + ' ' + f(seg.c2) + ' ' + f(seg.end_point))
        d.append('Z')
    return ''.join(d)

# Projection latérale composée : la planche de Talairach (grille proportionnelle, libre) vectorisée et recalée sur la face
# latérale de la planche de l'équipe. Couches : traits noirs (contour, sillons de la face latérale) et gris (repères de la
# face mésiale, insula) ; la grille, les lignes rouges (CA-CP, VCA, VCP) et les ventricules (bleu) sont retirés, les traits
# coupés par la grille sont recousus. Calage : (1) correspondance proportionnelle de Talairach → MNI, par morceaux — pôle
# frontal → VCA → VCP → pôle occipital, vertex → plan CA-CP → bas du lobe temporal, avec CA (0, 2, −4) et CP (0, −26, −2) —
# puis MNI → face latérale de la planche (même calage que les plots) ; (2) spline de plaque mince ajustée sur les deux
# contours (silhouette de Talairach → silhouette de la planche, plus ronde, cervelet exclu), CA et CP tenus fixes. La base
# du lobe frontal sous le sillon orbitaire latéral (gyrus droit, plus médial et plus bas) passe en gris.
AC, PC = (2.0, -4.0), (-26.0, -2.0)

def groups(idx):
    g = []
    for i in idx:
        if g and i - g[-1][-1] <= 1: g[-1].append(i)
        else: g.append([i])
    return g

def talairach_layers(path):
    """couches de la planche de Talairach (pixels de l'image) : noir, gris, repères de la grille"""
    A = np.array(Image.open(path).convert('RGB')).astype(int)
    v = A.max(2); s = A.max(2) - A.min(2); H, W = v.shape
    red = (A[..., 0] - A[..., 1] > 60); ink = (v < 215) | red
    # cadre de la grille : lignes et colonnes presque entièrement encrées
    R = [y for y in range(H) if ink[y, int(W * .06):int(W * .99)].mean() > 0.55]; C = [x for x in range(W) if ink[int(H * .01):int(H * .92), x].mean() > 0.55]
    RG = [(min(g) - 1, max(g) + 1) for g in groups(R)]; CG = [(min(g) - 1, max(g) + 1) for g in groups(C)]
    assert len(RG) == 13 and len(CG) >= 10, f'grille de Talairach attendue (13 lignes, 10 colonnes) : {len(RG)} × {len(CG)}'
    x0, x1, y0, y1 = CG[0][1], CG[-1][0], RG[0][1], RG[-1][0]
    grid = np.zeros_like(v, bool)
    for a, b in RG: grid[a:b + 1, :] = True
    for a, b in CG: grid[:, a:b + 1] = True
    grid |= ndi.binary_dilation(red, iterations=1)
    inner = np.zeros_like(v, bool); inner[y0 + 1:y1, x0 + 1:x1] = True
    low = s < 30
    black = (v < 120) & low & inner & ~grid
    gray = (v >= 122) & (v <= 200) & low & inner & ~grid & ~ndi.binary_dilation(v < 110, iterations=1)
    def fill(m):
        m = m.copy()
        for gs, axis in ((RG, 0), (CG, 1)):
            for a, b in gs:
                t, u = a - 1, b + 1; n = u - t
                if t < 0 or u >= (H if axis == 0 else W): continue
                for q in range(3, (W if axis == 0 else H) - 3):
                    if not (m[t, q] if axis == 0 else m[q, t]): continue
                    for e in (0, -1, 1, -2, 2, -3, 3, -4, 4):
                        if m[u, q + e] if axis == 0 else m[q + e, u]:
                            for k in range(1, n):
                                if axis == 0: m[t + k, int(round(q + e * k / n))] = True
                                else: m[int(round(q + e * k / n)), t + k] = True
                            break
        return m
    def clean(m, minsz):
        lab, n = ndi.label(m, structure=np.ones((3, 3))); sz = ndi.sum(m, lab, range(1, n + 1)); k = np.zeros(n + 1, bool); k[1:] = sz >= minsz; return k[lab]
    black = clean(fill(black), 20); gray = clean(fill(gray), 25)
    cen = lambda g: (g[0] + g[1]) / 2
    # colonnes : A–D devant VCA, E entre VCA et VCP, F–I derrière ; lignes : 1–8 au-dessus de CA-CP, 9–12 dessous
    ref = {'front': x0, 'vca': cen(CG[4]), 'vcp': cen(CG[5]), 'occ': x1, 'top': y0, 'acpc': cen(RG[8]), 'bot': y1}
    return black, gray, ref

def mni_extents():
    import base64
    M = json.load(open(os.path.join(ROOT, 'assets', 'brain_meshes.json'), encoding='utf-8'))
    P = np.frombuffer(base64.b64decode(M['hemis']['lh']['pial']), dtype=np.float32).reshape(-1, 3)
    return dict(ymin=float(P[:, 1].min()), ymax=float(P[:, 1].max()), zmin=float(P[:, 2].min()), zmax=float(P[:, 2].max()))

def silhouette(img, box):
    m = lines(img, box); f = ndi.binary_fill_holes(m)
    lab, n = ndi.label(f); sz = ndi.sum(f, lab, range(1, n + 1)); return lab == (1 + int(np.argmax(sz))), m

def by_angle(C, cx, cy, sx, sy, keep=None):
    """points d'un contour (x, y) par angle (pas de 5°) autour de (cx, cy), axes normalisés par (sx, sy)"""
    u = (C[:, 0] - cx) / sx; w = (C[:, 1] - cy) / sy; ang = np.arctan2(w, u); rad = np.hypot(u, w); out = []
    for t in np.radians(np.arange(-180, 180, 5)):
        d = np.abs((ang - t + np.pi) % (2 * np.pi) - np.pi); k = np.where(d < np.radians(2.5))[0]
        if not len(k): out.append(None); continue
        i = k[np.argmax(rad[k])]; out.append(tuple(C[i]) if keep is None or keep(C[i]) else None)
    return out

def tps(src, dst, lam=2.0):
    src, dst = np.asarray(src, float), np.asarray(dst, float); n = len(src)
    U = lambda r: np.where(r > 0, r * r * np.log(r + 1e-12), 0.0)
    Kx = U(np.linalg.norm(src[:, None] - src[None], axis=2)) + lam * np.eye(n); P = np.hstack([np.ones((n, 1)), src])
    A = np.zeros((n + 3, n + 3)); A[:n, :n] = Kx; A[:n, n:] = P; A[n:, :n] = P.T
    W = np.linalg.solve(A, np.vstack([dst, np.zeros((3, 2))]))
    return lambda q: (lambda q: U(np.linalg.norm(q[:, None] - src[None], axis=2)) @ W[:n] + np.hstack([np.ones((len(q), 1)), q]) @ W[n:])(np.asarray(q, float))

def trace_mask(m, f, k):
    """potrace d'un masque agrandi k fois, chaque point passé par f (tableau n × 2 → n × 2) — chemin SVG"""
    path = potrace.Bitmap(~m).trace(turdsize=4 * k * k, alphamax=1.0, opticurve=True, opttolerance=0.3)
    d = []
    for cv in path:
        segs = [cv.start_point] + [p for sg in cv.segments for p in ((sg.c, sg.end_point) if sg.is_corner else (sg.c1, sg.c2, sg.end_point))]
        Q = f(np.array([[p.x / k, p.y / k] for p in segs])); it = iter(Q[1:]); out = [f'M{Q[0][0]:.1f} {Q[0][1]:.1f}']
        for sg in cv.segments:
            if sg.is_corner: a = next(it); b = next(it); out.append(f'L{a[0]:.1f} {a[1]:.1f}L{b[0]:.1f} {b[1]:.1f}')
            else: a = next(it); b = next(it); c = next(it); out.append(f'C{a[0]:.1f} {a[1]:.1f} {b[0]:.1f} {b[1]:.1f} {c[0]:.1f} {c[1]:.1f}')
        d.append(''.join(out) + 'Z')
    return ''.join(d)


# traits de la planche de Talairach rendus en lignes d'épaisseur constante : squelette du masque (agrandi, lissé), découpé en
# polylignes entre extrémités et jonctions (boucles comprises), petites barbes retirées, puis chaque point recalé, polyligne
# simplifiée (Douglas-Peucker) et arrondie (Chaikin) — chemins SVG non remplis
N8 = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]

def skeleton_lines(m, minlen):
    from skimage.morphology import skeletonize
    S = skeletonize(m); H, W = S.shape
    deg = ndi.convolve(S.astype(int), np.ones((3, 3), int), mode='constant') - 1; deg[~S] = 0
    nb = lambda y, x: [(y + a, x + b) for a, b in N8 if 0 <= y + a < H and 0 <= x + b < W and S[y + a, x + b]]
    seen = set(); lines = []
    def walk(p, q):
        L = [p, q]; seen.add((p, q)); seen.add((q, p))
        while deg[L[-1]] == 2:
            nx = [r for r in nb(*L[-1]) if r != L[-2] and (L[-1], r) not in seen]
            if not nx: break
            r = nx[0]; seen.add((L[-1], r)); seen.add((r, L[-1])); L.append(r)
        return L
    nodes = list(zip(*np.nonzero(S & (deg != 2))))
    for p in nodes:
        for q in nb(*p):
            if (p, q) not in seen: lines.append(walk(p, q))
    # boucles fermées (aucun nœud)
    for p in zip(*np.nonzero(S & (deg == 2))):
        for q in nb(*p):
            if (p, q) not in seen: lines.append(walk(p, q))
    out = []
    for L in lines:
        e0, e1 = deg[L[0]], deg[L[-1]]
        spur = (e0 == 1) != (e1 == 1) and min(e0, e1) == 1
        if len(L) < (minlen * 3 if spur else minlen): continue
        out.append((np.array(L, float)[:, ::-1], e0 == 1, e1 == 1))
    return out

def rdp(P, eps):
    if len(P) < 3: return P
    a, b = P[0], P[-1]; ab = b - a; n = np.hypot(*ab)
    d = np.abs(ab[0] * (P[:, 1] - a[1]) - ab[1] * (P[:, 0] - a[0])) / n if n > 1e-9 else np.hypot(*(P - a).T)
    i = int(np.argmax(d))
    if d[i] <= eps: return np.array([a, b])
    return np.vstack([rdp(P[:i + 1], eps)[:-1], rdp(P[i:], eps)])

def chaikin(P, it=2):
    closed = len(P) > 3 and np.hypot(*(P[0] - P[-1])) < 1e-6
    for _ in range(it):
        Q = P[:-1] if closed else P; A, B = Q, np.roll(Q, -1, 0)
        if not closed: A, B = Q[:-1], Q[1:]
        N = np.empty((2 * len(A), 2)); N[0::2] = .75 * A + .25 * B; N[1::2] = .25 * A + .75 * B
        P = np.vstack([N, N[:1]]) if closed else np.vstack([Q[:1], N, Q[-1:]])
    return P

def join_gaps(lines, gap, ang=65):
    """recoud les trous : deux extrémités libres à moins de gap px, le trou prolongeant à peu près les deux traits"""
    L = [[l, a, b] for l, a, b in lines]
    def tang(P, start):
        Q = P if start else P[::-1]; n = min(len(Q) - 1, 12); v = Q[0] - Q[n]; return v / (np.hypot(*v) + 1e-9)
    while True:
        best = None
        for i in range(len(L)):
            for si in (0, 1):
                if not L[i][1 + si]: continue
                pi = L[i][0][0 if si == 0 else -1]; ti = tang(L[i][0], si == 0)
                for j in range(len(L)):
                    if j == i: continue
                    for sj in (0, 1):
                        if not L[j][1 + sj]: continue
                        pj = L[j][0][0 if sj == 0 else -1]; g = pj - pi; dist = np.hypot(*g)
                        if dist > gap or dist < 1e-6: continue
                        tj = tang(L[j][0], sj == 0); u = g / dist
                        if np.degrees(np.arccos(np.clip(ti @ u, -1, 1))) > ang or np.degrees(np.arccos(np.clip(-tj @ u, -1, 1))) > ang: continue
                        if best is None or dist < best[0]: best = (dist, i, si, j, sj)
        if best is None: return [tuple(x) for x in L]
        _, i, si, j, sj = best
        A, fa0, fa1 = L[i]; B, fb0, fb1 = L[j]
        if si == 0: A, fa0, fa1 = A[::-1], fa1, fa0
        if sj == 1: B, fb0, fb1 = B[::-1], fb1, fb0
        L[i] = [np.vstack([A, B]), fa0, fb1]; del L[j]

def smooth_line(P, k):
    """lissage par spline (scipy splprep), extrémités tenues ; renvoie des points denses"""
    from scipy.interpolate import splprep, splev
    _, idx = np.unique(np.round(P, 3), axis=0, return_index=True); P = P[np.sort(idx)]
    if len(P) < 6: return P
    closed = len(P) > 12 and np.hypot(*(P[0] - P[-1])) <= 2 * k
    w = np.ones(len(P)); w[0] = w[-1] = 30
    try:
        tck, _ = splprep(P.T, w=w, s=len(P) * (0.9 * k) ** 2, per=1 if closed else 0, k=3)
    except Exception:
        return P
    n = max(8, int(np.sum(np.hypot(*np.diff(P, axis=0).T)) / (1.5 * k)))
    return np.stack(splev(np.linspace(0, 1, n), tck), 1)

def stroke_path(lines, f, k, eps=0.25, gap=None):
    lines = join_gaps(lines, gap if gap is not None else 10 * k)
    d = []
    for L, _, _ in lines:
        Q = f(smooth_line(L, k) / k); Q = rdp(Q, eps)
        d.append('M' + 'L'.join(f'{x:.1f} {y:.1f}' for x, y in Q))
    return ''.join(d)

def line_width(m, k):
    """épaisseur médiane des traits d'un masque agrandi k fois (pixels de la planche)"""
    from skimage.morphology import skeletonize
    D = ndi.distance_transform_edt(m); return float(np.median(D[skeletonize(m)]) * 2 / k)

# sillons de l'insula (pixels de la planche de Talairach) : traits en éventail depuis le limen (sommet antéro-inférieur), entre
# les trois gyri courts antérieurs (deux traits), sillon central de l'insula, entre les deux gyri longs postérieurs — de 35 à
# 88 % du chemin du limen vers le bord supérieur de l'insula dessinée
LIMEN = (255, 362)
INS_SULCI = [(226, 251), (257, 239), (306, 223), (366, 207)]

def insula_sulci(f, t0=0.38, t1=0.88):
    d = []; a = np.array(LIMEN, float)
    for u in INS_SULCI:
        u = np.array(u, float); Q = f(np.linspace(a + (u - a) * t0, a + (u - a) * t1, 12))
        d.append('M' + 'L'.join(f'{x:.1f} {y:.1f}' for x, y in Q))
    return ''.join(d)

def deep_silhouettes():
    """silhouettes (projection sagittale, coordonnées MNI y, z en mm) de l'hippocampe et de l'amygdale de chaque côté"""
    import base64
    M = json.load(open(os.path.join(ROOT, 'assets', 'brain_meshes.json'), encoding='utf-8'))
    out = {}
    for side, pre in (('L', 'Left-'), ('R', 'Right-')):
        out[side] = {}
        for key, pat in (('hip', 'Hippocampus'), ('amy', 'Amygdala')):
            res = 0.25; Ps = []; Fs = []
            for S in M['subcortical']:
                if S['name'].startswith(pre) and pat in S['name']:
                    P = np.frombuffer(base64.b64decode(S['vertices']), dtype=np.float32).reshape(-1, 3)[:, 1:]
                    F = np.frombuffer(base64.b64decode(S['faces']), dtype=np.uint16 if len(base64.b64decode(S['faces'])) == S['n_faces'] * 6 else np.uint32).reshape(-1, 3)
                    Fs.append(F + sum(len(p) for p in Ps)); Ps.append(P)
            P = np.vstack(Ps); F = np.vstack(Fs); y0, z0 = P.min(0) - 2
            G = Image.new('L', (int((P[:, 0].max() - y0 + 2) / res) + 1, int((P[:, 1].max() - z0 + 2) / res) + 1), 0)
            from PIL import ImageDraw
            dr = ImageDraw.Draw(G)
            for t in F: dr.polygon([((P[v, 0] - y0) / res, (P[v, 1] - z0) / res) for v in t], fill=255)
            g = ndi.binary_fill_holes(np.array(G) > 0)
            C = max(measure.find_contours(g.astype(float), 0.5), key=len)
            Q = np.stack([C[:, 1] * res + y0, C[:, 0] * res + z0], 1)
            Q = rdp(Q, 0.15); out[side][key] = [[round(float(a), 2), round(float(b), 2)] for a, b in Q]
    return out

def composite(img, tal_path):
    L = VIEWS['lat']; bx, by = L['box'][0], L['box'][1]; E = mni_extents()
    black, gray, R = talairach_layers(tal_path)
    lm = {n: v - (bx if n in ('a', 'p') else by) for n, v in L['lm'].items()}
    kx = (lm['p'] - lm['a']) / (E['ymax'] - E['ymin']); ky = (lm['bot'] - lm['top']) / (E['zmax'] - E['zmin'])
    zacpc = (AC[1] + PC[1]) / 2
    def tal2mni(q):
        x, y = q[:, 0], q[:, 1]
        Y = np.where(x < R['vca'], E['ymax'] + (x - R['front']) / (R['vca'] - R['front']) * (AC[0] - E['ymax']),
            np.where(x < R['vcp'], AC[0] + (x - R['vca']) / (R['vcp'] - R['vca']) * (PC[0] - AC[0]), PC[0] + (x - R['vcp']) / (R['occ'] - R['vcp']) * (E['ymin'] - PC[0])))
        Z = np.where(y < R['acpc'], E['zmax'] + (y - R['top']) / (R['acpc'] - R['top']) * (zacpc - E['zmax']), zacpc + (y - R['acpc']) / (R['bot'] - R['acpc']) * (E['zmin'] - zacpc))
        return np.stack([Y, Z], 1)
    mni2lat = lambda q: np.stack([lm['a'] + (E['ymax'] - q[:, 0]) * kx, lm['top'] + (E['zmax'] - q[:, 1]) * ky], 1)
    lin = lambda q: mni2lat(tal2mni(q))
    # contours : Talairach (silhouette des traits noirs) recalé linéairement, et planche de l'équipe (cervelet exclu)
    # silhouette : fermeture par un disque de 14 px (le contour de la planche a des coupures aux lignes de la grille)
    r = 14; yy0, xx0 = np.ogrid[-r:r + 1, -r:r + 1]; pad = np.pad(black, r + 2)
    silT = ndi.binary_fill_holes(ndi.binary_closing(pad, structure=xx0 * xx0 + yy0 * yy0 <= r * r)[r + 2:-r - 2, r + 2:-r - 2])
    CT = lin(max(measure.find_contours(silT.astype(float), 0.5), key=len)[:, ::-1])
    silL, mL = silhouette(img, L['box']); CL = max(measure.find_contours(silL.astype(float), 0.5), key=len)[:, ::-1] / K
    cx, cy, sx, sy = (lm['a'] + lm['p']) / 2, lm['top'] + 0.55 * (lm['bot'] - lm['top']), (lm['p'] - lm['a']), (lm['bot'] - lm['top'])
    aT = by_angle(CT, cx, cy, sx, sy); aL = by_angle(CL, cx, cy, sx, sy, keep=lambda p: p[1] <= lm['bot'] + 2)
    pairs = [(t, l) for t, l in zip(aT, aL) if t and l]
    anc = [mni2lat(np.array([AC]))[0], mni2lat(np.array([PC]))[0]]
    f2 = tps([t for t, _ in pairs] + anc, [l for _, l in pairs] + anc, lam=4.0)
    warp = lambda q: f2(lin(q))
    # contour : celui de la planche de l'équipe (net, fermé, cervelet et bord temporal compris) ; base du lobe frontal en
    # avant du pôle temporal et sous le sillon orbitaire latéral (gyrus droit, plus médial et plus bas) en gris
    er = ndi.binary_erosion(ndi.binary_fill_holes(mL), iterations=7 * K // 2); band = mL & ~er
    lab, _ = ndi.label(mL & er, structure=np.ones((3, 3))); yy, xx = np.nonzero(lab)
    qx, qy = (848 - bx) * K, (401 - by) * K; i = np.argmin((xx - qx) ** 2 + (yy - qy) ** 2); cereb = lab == lab[yy[i], xx[i]]
    rows, cols = np.mgrid[0:mL.shape[0], 0:mL.shape[1]]
    rect = band & (cols < (612 - bx) * K) & (rows > (300 - by) * K)
    # Talairach : traits noirs intérieurs (sans son contour), gris (repères mésiaux, insula) — en lignes d'épaisseur constante
    inner = black & ndi.binary_erosion(silT, iterations=6)
    k = 3
    def up(m):
        g = np.array(Image.fromarray((m * 255).astype(np.uint8)).resize((m.shape[1] * k, m.shape[0] * k), Image.BICUBIC)).astype(float)
        return ndi.gaussian_filter(g, 1.6) > 120
    print('vue composée : planche de Talairach recalée,', len(pairs), 'paires de contour ; épaisseur des traits de la planche', round(line_width(mL, K), 2))
    ident = lambda q: q
    d = trace_mask((band & ~rect) | cereb, ident, K)
    dg = trace_mask(rect, ident, K)
    ds = stroke_path(skeleton_lines(up(inner), 6 * k), warp, k)
    dgs = stroke_path(skeleton_lines(up(gray), 6 * k), warp, k) + insula_sulci(warp)
    return d, dg, ds, dgs


def main(src, tal):
    img = Image.open(src).convert('RGB')
    assert img.size == (1344, 930), f'planche attendue de 1344 × 930 px, reçue {img.size}'
    out = {}
    for k, V in VIEWS.items():
        x0, y0, x1, y1 = V['box']
        horiz = ('mid', 'lat') if k == 'inf' else ('a', 'p')
        lm = {n: v - (x0 if n in horiz else y0) for n, v in V['lm'].items()}
        out[k] = {'W': x1 - x0, 'H': y1 - y0, 'lm': lm, 'd': trace(img, V['box'])}
    d, dg, ds, dgs = composite(img, tal)
    out['tal'] = dict(out['lat'], d=d, dg=dg, ds=ds, dgs=dgs)
    out['deep'] = deep_silhouettes()
    txt = ('/* généré par tools/make_implant_sheet.py — ne pas éditer. Planche vierge d’implantation SEEG (dessin au trait de\n'
           ' * l’équipe de l’auteur, libre) : faces latérale, mésiale (miroir), insula, face inférieure d’un hémisphère gauche,\n'
           ' * vectorisées ; repères de calage sur le gabarit MNI (lm, pixels de la vue). */\n'
           '(function (SV) {\n  SV.ImplantSheet = ' + json.dumps(out, separators=(',', ':'), ensure_ascii=False) + ';\n})(window.SV = window.SV || {});\n')
    p = os.path.join(ROOT, 'src', 'implant_sheet.js'); open(p, 'w', encoding='utf-8').write(txt)
    print(p, len(txt) // 1024, 'Ko', {k: len(v['d']) for k, v in out.items() if 'd' in v})

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
