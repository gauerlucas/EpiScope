#!/usr/bin/env python3
"""
make_meshes.py — builds assets/brain_meshes.json for EpiScope.

Sources
  * fsaverage5 surfaces bundled with nilearn (pial, inflated, flat, sulc)
  * VEP cortical annotation on fsaverage (lh/rh.aparc.vep.annot): fsaverage5
    vertices are the first 10242 vertices of fsaverage, so labels[:10242] apply.
  * VEP subcortical segmentation aparc+aseg.vep.mgz (fsaverage conformed space)

Canonical region ordering (the app depends on it):
  0           Unknown
  1..72       Left cortical, annot order
  73..144     Right cortical, annot order
  145..153    Left subcortical: Hippocampus-anterior, Hippocampus-posterior, Amygdala,
              Thalamus, Caudate-nucleus, Putamen, Pallidum, Nucleus-accumbens, Cerebellar-cortex
  154..162    Right subcortical, same order

Usage
  python3 tools/make_meshes.py [--annot-dir DIR] [--aseg FILE] [--lut FILE] [--out assets/brain_meshes.json]
"""
import argparse
import base64
import csv
import json
import os
import sys

import numpy as np
import nibabel as nib
from nilearn import datasets
from nilearn.surface import load_surf_mesh, load_surf_data
from scipy import ndimage
from skimage import measure

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

SUBCORTICAL_ORDER = [
    "Hippocampus-anterior", "Hippocampus-posterior", "Amygdala", "Thalamus",
    "Caudate-nucleus", "Putamen", "Pallidum", "Nucleus-accumbens", "Cerebellar-cortex",
]
# label values in aparc+aseg.vep.mgz (list = accepted alternatives)
SUBCORTICAL_LABELS = {
    "L": {
        "Hippocampus-anterior": [71073], "Hippocampus-posterior": [71074], "Amygdala": [18],
        "Thalamus": [9, 10], "Caudate-nucleus": [71075, 11], "Putamen": [12], "Pallidum": [13],
        "Nucleus-accumbens": [71076, 26], "Cerebellar-cortex": [71077, 8],
    },
    "R": {
        "Hippocampus-anterior": [72073], "Hippocampus-posterior": [72074], "Amygdala": [54],
        "Thalamus": [48, 49], "Caudate-nucleus": [72075, 50], "Putamen": [51], "Pallidum": [52],
        "Nucleus-accumbens": [72076, 58], "Cerebellar-cortex": [72077, 47],
    },
}
# target face counts after simplification
SUBCORTICAL_TARGET_FACES = {"Cerebellar-cortex": 3000, "Thalamus": 3000}
SUBCORTICAL_TARGET_DEFAULT = 1500

# hand-written anatomical neighbours (family names, applied to both hemispheres)
EXTRA_ADJACENCY = [
    ("Hippocampus-anterior", "Amygdala"),
    ("Hippocampus-anterior", "Hippocampus-posterior"),
    ("Hippocampus-anterior", "Rhinal-cortex"),
    ("Hippocampus-posterior", "Parahippocampal-cortex"),
    ("Amygdala", "Rhinal-cortex"),
    ("Amygdala", "Temporal-pole"),
    ("Thalamus", "Caudate-nucleus"),
    ("Thalamus", "Putamen"),
    ("Thalamus", "Pallidum"),
    ("Caudate-nucleus", "Putamen"),
    ("Putamen", "Pallidum"),
    ("Caudate-nucleus", "Nucleus-accumbens"),
    ("Nucleus-accumbens", "Subcallosal-area"),
    ("Putamen", "Insula-gyri-brevi"),
    ("Putamen", "Insula-gyri-longi"),
    ("Amygdala", "Insula-gyri-brevi"),
    ("Cerebellar-cortex", "Thalamus"),
]

TKR_AFFINE = np.array([[-1, 0, 0, 128], [0, 0, 1, -128], [0, -1, 0, 128], [0, 0, 0, 1]], dtype=float)


def b64(arr, dtype):
    a = np.ascontiguousarray(np.asarray(arr, dtype=dtype))
    if a.dtype.byteorder == ">":
        a = a.byteswap().newbyteorder("<")
    a = a.astype(a.dtype.newbyteorder("<"))
    return base64.b64encode(a.tobytes()).decode("ascii")


def read_lut(path):
    lut = {}
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split()
            if len(parts) < 5:
                continue
            try:
                idx = int(parts[0])
            except ValueError:
                continue
            lut[idx] = (parts[1], [int(parts[2]), int(parts[3]), int(parts[4])])
    return lut


def mesh_from_mask(mask, step_size, target_faces):
    """Marching cubes on a smoothed binary mask; returns (verts voxel coords, faces)."""
    padded = np.pad(mask.astype(np.float32), 2)
    sm = ndimage.gaussian_filter(padded, sigma=1.0)
    if sm.max() < 0.5:
        sm = padded  # tiny structure: fall back to unsmoothed
    verts, faces, _, _ = measure.marching_cubes(sm, level=0.5, step_size=step_size)
    verts = verts - 2.0  # remove padding
    try:
        import fast_simplification
        if len(faces) > target_faces:
            v2, f2 = fast_simplification.simplify(verts.astype(np.float32), faces.astype(np.int64),
                                                  target_count=target_faces)
            verts, faces = np.asarray(v2), np.asarray(f2)
    except ImportError:
        pass
    return verts.astype(np.float32), faces.astype(np.int64)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--annot-dir", default="/mnt/user-data/uploads/EpiScope/old_version/fsaverage")
    ap.add_argument("--aseg", default="/mnt/user-data/uploads/EpiScope/old_version/fsaverage/aparc+aseg.vep.mgz")
    ap.add_argument("--lut", default="/home/claude/_ext/VEP_atlas_shared/data/VepFreeSurferColorLut.txt")
    ap.add_argument("--out", default=os.path.join(ROOT, "assets", "brain_meshes.json"))
    ap.add_argument("--table", default=os.path.join(ROOT, "assets", "regions_table.csv"))
    args = ap.parse_args()

    lut = read_lut(args.lut) if os.path.exists(args.lut) else {}
    fs = datasets.fetch_surf_fsaverage("fsaverage5")

    regions = [{"index": 0, "name": "Unknown", "hemi": "", "family": "Unknown", "type": "none",
                "centroid": None, "color": [0, 0, 0], "n_vertices": 0}]
    hemis = {}
    adjacency = set()
    n_cort = None
    cort_data = {}

    # ---------------- cortical hemispheres ----------------
    for hemi, hk, side, prefix in [("lh", "left", "L", "Left-"), ("rh", "right", "R", "Right-")]:
        labels_full, ctab, names = nib.freesurfer.read_annot(os.path.join(args.annot_dir, f"{hemi}.aparc.vep.annot"))
        names = [n.decode() if isinstance(n, bytes) else n for n in names]
        assert names[0] == "Unknown", names[0]
        n_cort = len(names) - 1
        pial = load_surf_mesh(fs[f"pial_{hk}"])
        infl = load_surf_mesh(fs[f"infl_{hk}"])
        sulc = load_surf_data(fs[f"sulc_{hk}"])
        flat = None
        try:
            flat_m = load_surf_mesh(fs[f"flat_{hk}"])
            flat = np.asarray(flat_m.coordinates, dtype=np.float32)
        except Exception as e:  # noqa
            print(f"[{hemi}] flat surface unavailable: {e}")
        nv = pial.coordinates.shape[0]
        labels = np.asarray(labels_full[:nv]).copy()
        labels[labels < 0] = 0
        cort_data[hemi] = dict(labels=labels, faces=np.asarray(pial.faces), pial=np.asarray(pial.coordinates),
                               names=names, side=side, prefix=prefix)
        offset = 0 if side == "L" else n_cort
        for k in range(1, len(names)):
            idx = offset + k
            vmask = labels == k
            cnt = int(vmask.sum())
            if cnt == 0:
                print(f"WARNING: region {prefix}{names[k]} has 0 vertices on fsaverage5")
                cen = None
            else:
                cen = [round(float(x), 2) for x in np.asarray(pial.coordinates)[vmask].mean(axis=0)]
            lut_key = (71000 if side == "L" else 72000) + k
            if lut_key in lut:
                color = lut[lut_key][1]
            else:
                color = [int(ctab[k][0]), int(ctab[k][1]), int(ctab[k][2])]
            regions.append({"index": idx, "name": prefix + names[k], "hemi": side, "family": names[k],
                            "type": "cortical", "centroid": cen, "color": color, "n_vertices": cnt})
        # region index per vertex (global index)
        glabels = np.where(labels > 0, labels + offset, 0).astype(np.uint8)
        # adjacency from mesh edges
        f = np.asarray(pial.faces)
        edges = np.vstack([f[:, [0, 1]], f[:, [1, 2]], f[:, [0, 2]]])
        la, lb = glabels[edges[:, 0]], glabels[edges[:, 1]]
        m = (la != lb) & (la > 0) & (lb > 0)
        for a, b in zip(la[m], lb[m]):
            adjacency.add((int(min(a, b)), int(max(a, b))))
        sulc_i8 = np.clip(np.round(sulc / max(np.abs(sulc).max(), 1e-6) * 127), -127, 127).astype(np.int8)
        hemis[hemi] = {
            "n_vertices": int(nv),
            "n_faces": int(f.shape[0]),
            "pial": b64(np.asarray(pial.coordinates, dtype=np.float32).ravel(), np.float32),
            "inflated": b64(np.asarray(infl.coordinates, dtype=np.float32).ravel(), np.float32),
            "flat": b64(flat[:, :2].ravel(), np.float32) if flat is not None else None,
            "faces": b64(f.ravel(), np.uint16),
            "sulc": b64(sulc_i8, np.int8),
            "labels": b64(glabels, np.uint8),
        }
        print(f"[{hemi}] {nv} vertices, {f.shape[0]} faces, unknown vertices={(glabels == 0).sum()}, "
              f"flat={'yes' if flat is not None else 'no'}")

    # ---------------- subcortical ----------------
    img = nib.load(args.aseg)
    vol = np.asarray(img.dataobj).astype(np.int64)
    aff = np.asarray(img.affine)
    if not np.allclose(aff, TKR_AFFINE):
        print("NOTE: aseg affine differs from canonical tkr affine; using the file's affine")
    subcortical = []
    base = 2 * n_cort
    for si, side in enumerate(["L", "R"]):
        for k, fam in enumerate(SUBCORTICAL_ORDER):
            idx = base + 1 + si * len(SUBCORTICAL_ORDER) + k
            mask = np.isin(vol, SUBCORTICAL_LABELS[side][fam])
            nvox = int(mask.sum())
            name = ("Left-" if side == "L" else "Right-") + fam
            lut_key = None
            for cand in SUBCORTICAL_LABELS[side][fam]:
                if cand in lut:
                    lut_key = cand
                    break
            color = lut[lut_key][1] if lut_key is not None else [200, 200, 200]
            if nvox == 0:
                print(f"WARNING: subcortical {name} has no voxels")
                regions.append({"index": idx, "name": name, "hemi": side, "family": fam, "type": "subcortical",
                                "centroid": None, "color": color, "n_vertices": 0})
                continue
            ijk = np.argwhere(mask)
            cen_vox = ijk.mean(axis=0)
            cen = [round(float(x), 2) for x in (aff @ np.append(cen_vox, 1.0))[:3]]
            # crop to bounding box for speed
            lo = ijk.min(axis=0) - 3
            hi = ijk.max(axis=0) + 4
            lo = np.clip(lo, 0, None)
            sub = mask[lo[0]:hi[0], lo[1]:hi[1], lo[2]:hi[2]]
            step = 1
            target = SUBCORTICAL_TARGET_FACES.get(fam, SUBCORTICAL_TARGET_DEFAULT)
            try:
                import fast_simplification  # noqa
            except ImportError:
                step = 4 if fam in ("Cerebellar-cortex", "Thalamus") else 2
            verts, faces = mesh_from_mask(sub, step, target)
            verts = verts + lo  # back to full-volume voxel coords
            xyz = (aff @ np.c_[verts, np.ones(len(verts))].T).T[:, :3].astype(np.float32)
            regions.append({"index": idx, "name": name, "hemi": side, "family": fam, "type": "subcortical",
                            "centroid": cen, "color": color, "n_vertices": int(len(xyz))})
            subcortical.append({"region_index": idx, "name": name, "n_vertices": int(len(xyz)),
                                "n_faces": int(len(faces)),
                                "vertices": b64(xyz.ravel(), np.float32),
                                "faces": b64(faces.ravel(), np.uint16)})
            print(f"[sub] {name}: {nvox} voxels -> {len(xyz)} vertices, {len(faces)} faces")

    assert len(regions) == 163, len(regions)
    name_to_idx = {r["name"]: r["index"] for r in regions}
    for a, b in EXTRA_ADJACENCY:
        for prefix in ("Left-", "Right-"):
            ia, ib = name_to_idx.get(prefix + a), name_to_idx.get(prefix + b)
            if ia is None or ib is None:
                print(f"WARNING: extra adjacency not resolved: {prefix}{a} - {prefix}{b}")
                continue
            adjacency.add((min(ia, ib), max(ia, ib)))

    # centroid distances
    cents = np.zeros((163, 3))
    valid = np.zeros(163, dtype=bool)
    for r in regions:
        if r["centroid"] is not None:
            cents[r["index"]] = r["centroid"]
            valid[r["index"]] = True
    d = np.sqrt(((cents[:, None, :] - cents[None, :, :]) ** 2).sum(-1))
    d[~valid, :] = 0
    d[:, ~valid] = 0
    np.fill_diagonal(d, 0)

    out = {
        "version": 1,
        "space": "fsaverage tkrRAS mm",
        "n_regions": 162,
        "regions": regions,
        "hemis": hemis,
        "subcortical": subcortical,
        "adjacency": sorted(list(adjacency)),
        "centroid_distances": b64(d.astype(np.float32).ravel(), np.float32),
    }
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    size = os.path.getsize(args.out)
    print(f"wrote {args.out}: {size/1e6:.2f} MB; adjacency pairs={len(adjacency)}; "
          f"subcortical faces total={sum(s['n_faces'] for s in subcortical)}")

    with open(args.table, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["index", "name", "hemi", "family", "type", "cx", "cy", "cz", "r", "g", "b", "n_vertices"])
        for r in regions:
            c = r["centroid"] or ["", "", ""]
            w.writerow([r["index"], r["name"], r["hemi"], r["family"], r["type"], c[0], c[1], c[2],
                        r["color"][0], r["color"][1], r["color"][2], r["n_vertices"]])
    print(f"wrote {args.table}")


if __name__ == "__main__":
    sys.exit(main())
