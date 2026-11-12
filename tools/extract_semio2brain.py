#!/usr/bin/env python3
"""
extract_semio2brain.py — derives sign → VEP-family evidence from the Semio2Brain database.

Input : the Semio2Brain spreadsheet (sheet "Main"), v1.2.x
        (Alim-Marvasti et al., Brain Communications 2022; Zenodo doi:10.5281/zenodo.4606589, MIT)
        and the SVT SemioDict regex taxonomy (semiology_dictionary.yaml).
Output: data/evidence_semio2brain.csv                 (category, family, filter, count, score, prob, n_rows, n_patients_category)
        data/evidence_semio2brain_lateralisation.csv  (category, filter, CL, IL, BL, DomH, NonDomH, n_lateralising)

Method
  1. Each row of "Main" is one (paper, reported semiology) datapoint. The 'Reference' column is forward-filled.
  2. Rows are classified into SemioDict leaf categories by case-insensitive regex search applied to
     'Semiology Category' first, then 'Reported Semiology'. A row can belong to several categories.
  3. The ~100 Semio2Brain localisation columns (lobe → sub-lobe → gyrus) are crosswalked to VEP region
     families (hemisphere-agnostic). The count in a column is distributed over its families in
     proportion to the crosswalk weights.
  4. Per category and filter: count per family; score = count / max(count) (top family = 1);
     prob = count / sum(count).
Filters: all | seizure_free (postoperative seizure-free ground truth) | spontaneous (SS flag)
         | sublobar (all rows, but lobe-level and multi-lobe columns such as TL/FL/FT are ignored).

Usage
  python3 tools/extract_semio2brain.py --xlsx "Semio2Brain Database.xlsx" --yaml semiology_dictionary.yaml
"""
import argparse
import csv
import os
import re
import sys
from collections import Counter, defaultdict

import numpy as np
import pandas as pd
import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

TEMPORAL = ["Temporal-pole", "T1-planum-polare", "Gyrus-of-Heschl", "T1-planum-temporale",
            "T1-lateral-anterior", "T1-lateral-posterior", "STS-anterior", "STS-posterior",
            "ITS-anterior", "ITS-posterior", "T2-anterior", "T2-posterior", "T3-anterior", "T3-posterior",
            "Fusiform-gyrus", "Occipito-temporal-sulcus", "Collateral-sulcus", "Parahippocampal-cortex",
            "Rhinal-cortex", "Hippocampus-anterior", "Hippocampus-posterior", "Amygdala"]
FRONTAL = ["Frontal-pole", "Orbito-frontal-cortex", "Gyrus-rectus", "F3-Pars-Orbitalis", "F3-Pars-triangularis",
           "F3-pars-opercularis", "Inferior-frontal-sulcus", "F2-rostral", "F2-caudal", "Middle-frontal-sulcus",
           "SFS-rostral", "SFS-caudal", "F1-mesial-prefrontal", "PreSMA", "SMA", "F1-lateral-prefrontal",
           "F1-lateral-premotor", "Subcallosal-area", "Precentral-sulcus-inferior-part",
           "Precentral-sulcus-superior-part", "Precentral-gyrus-head-face", "Precentral-gyrus-upper-limb",
           "Central-sulcus-head-face", "Central-sulcus-upper-limb", "Paracentral-lobule", "Central-operculum"]
PARIETAL = ["Postcentral-gyrus", "Postcentral-sulcus", "Superior-parietal-lobule-P1", "Supramarginal-anterior",
            "Supramarginal-posterior", "Angular-gyrus", "Intraparietal-sulcus", "Precuneus",
            "Marginal-branch-of-the-cingulate-sulcus", "Parietal-operculum", ("Parieto-occipital-sulcus", 0.5)]
OCCIPITAL = ["O1", "O2", "O3", "Occipital-pole", "Lingual-gyrus", "Calcarine-sulcus", "Cuneus",
             "Anterior-occipital-sulcus-and-preoccipital-notch", "Parieto-occipital-sulcus", "Lingual-sulcus"]
CINGULATE = ["Anterior-cingulate-cortex", "Middle-cingulate-cortex-anterior-part",
             "Middle-cingulate-cortex-posterior-part", "Posterior-cingulate-cortex-dorsal",
             "Posterior-cingulate-cortex-retrosplenial-gyrus"]


def _norm(items):
    out = []
    for it in items:
        if isinstance(it, tuple):
            out.append((it[0], float(it[1])))
        else:
            out.append((it, 1.0))
    return out


def _union(*lists):
    seen = {}
    for lst in lists:
        for fam, w in _norm(lst):
            seen[fam] = max(seen.get(fam, 0), w)
    return list(seen.items())


# Semio2Brain localisation column (matched by normalised prefix) -> list of (family, weight)
CROSSWALK = {
    "TL": TEMPORAL,
    "Anterior (temporal pole)": [("Temporal-pole", 1), ("T1-planum-polare", 0.5)],
    "Lateral Temporal": ["T1-lateral-anterior", "T1-lateral-posterior", "T2-anterior", "T2-posterior",
                         "T3-anterior", "T3-posterior", "STS-anterior", "STS-posterior", "ITS-anterior",
                         "ITS-posterior", "Gyrus-of-Heschl", "T1-planum-temporale"],
    "STG": ["T1-lateral-anterior", "T1-lateral-posterior", "T1-planum-temporale", "T1-planum-polare",
            "Gyrus-of-Heschl"],
    "Transverse Temporal Gyrus": ["Gyrus-of-Heschl"],
    "Planum Temporale": ["T1-planum-temporale"],
    "Planum Polare": ["T1-planum-polare"],
    "MTG": ["T2-anterior", "T2-posterior", "STS-anterior", "STS-posterior"],
    "ITG": ["T3-anterior", "T3-posterior", "ITS-anterior", "ITS-posterior"],
    "Mesial Temporal": ["Hippocampus-anterior", "Hippocampus-posterior", "Amygdala", "Rhinal-cortex",
                        "Parahippocampal-cortex"],
    "Ant Mesial Temporal": ["Amygdala", "Hippocampus-anterior", "Rhinal-cortex"],
    "Post Mesial Temporal": ["Hippocampus-posterior", "Parahippocampal-cortex"],
    "Enthorinal Cortex": ["Rhinal-cortex"],
    "Fusiform": [("Fusiform-gyrus", 1), ("Occipito-temporal-sulcus", 0.5), ("Collateral-sulcus", 0.5)],
    "OTMG (fusiform)": [("Fusiform-gyrus", 1), ("Occipito-temporal-sulcus", 0.5), ("Collateral-sulcus", 0.5)],
    "Basal (including Fusiform OTMG)": [("Fusiform-gyrus", 1), ("Occipito-temporal-sulcus", 0.5),
                                        ("Collateral-sulcus", 0.5)],
    "AMYGD": ["Amygdala"],
    "PARAHIPPOCAMPUS": ["Parahippocampal-cortex"],
    "HIPPOCAMPUS": ["Hippocampus-anterior", "Hippocampus-posterior"],
    "Posterior Temporal": ["T1-lateral-posterior", "T2-posterior", "T3-posterior", "STS-posterior", "ITS-posterior"],
    "FL": FRONTAL,
    "frontal pole": ["Frontal-pole"],
    "Pre-frontal": ["Frontal-pole", "Orbito-frontal-cortex", "Gyrus-rectus", "F3-Pars-Orbitalis",
                    "F3-Pars-triangularis", "F2-rostral", "SFS-rostral", "F1-mesial-prefrontal",
                    "F1-lateral-prefrontal", "Inferior-frontal-sulcus", "Middle-frontal-sulcus",
                    "Subcallosal-area", "Anterior-cingulate-cortex"],
    "DL-PFC": ["F2-rostral", "F1-lateral-prefrontal", "SFS-rostral", "Middle-frontal-sulcus", "Inferior-frontal-sulcus"],
    "gyrus rectus": ["Gyrus-rectus"],
    "Orbito-frontal": [("Orbito-frontal-cortex", 1), ("Gyrus-rectus", 0.5), ("F3-Pars-Orbitalis", 0.5)],
    "Ant OF": ["Orbito-frontal-cortex", "Frontal-pole"],
    "Post OF": ["Orbito-frontal-cortex", "Subcallosal-area"],
    "Lat OF": ["Orbito-frontal-cortex", "F3-Pars-Orbitalis"],
    "Med OF": ["Gyrus-rectus", "Orbito-frontal-cortex"],
    "Medial Frontal": ["F1-mesial-prefrontal", "PreSMA", "SMA", "Anterior-cingulate-cortex",
                       "Middle-cingulate-cortex-anterior-part", "Paracentral-lobule"],
    "Primary Motor Cortex": ["Precentral-gyrus-head-face", "Precentral-gyrus-upper-limb", "Central-sulcus-head-face",
                             "Central-sulcus-upper-limb", ("Paracentral-lobule", 0.5)],
    "medial precentral": ["Paracentral-lobule"],
    "Rolandic Operculum": ["Central-operculum"],
    "SFG (F1)": ["F1-mesial-prefrontal", "F1-lateral-prefrontal", "F1-lateral-premotor", "PreSMA", "SMA",
                 "SFS-rostral", "SFS-caudal"],
    "Med SFG": ["F1-mesial-prefrontal", "PreSMA", "SMA"],
    "Post SFG": ["SMA", "PreSMA", "F1-lateral-premotor", "SFS-caudal"],
    "Ant SFG": ["F1-mesial-prefrontal", "F1-lateral-prefrontal", "SFS-rostral"],
    "MFG (F2)": ["F2-rostral", "F2-caudal", "Middle-frontal-sulcus"],
    "Ant MFG": ["F2-rostral"],
    "Mid MFG": ["F2-rostral", "F2-caudal"],
    "Post MFG": ["F2-caudal", "Precentral-sulcus-superior-part"],
    "IFG (F3)": ["F3-Pars-Orbitalis", "F3-Pars-triangularis", "F3-pars-opercularis", "Inferior-frontal-sulcus"],
    "Pars orbitalis": ["F3-Pars-Orbitalis"],
    "Pars Triangularis": ["F3-Pars-triangularis"],
    "Pars opercularis": ["F3-pars-opercularis"],
    "Premotor frontal": ["F1-lateral-premotor", "F2-caudal", "SFS-caudal", "Precentral-sulcus-inferior-part",
                         "Precentral-sulcus-superior-part", "SMA", "PreSMA"],
    "Ant Premotor": ["F2-caudal", "SFS-caudal", "F1-lateral-premotor"],
    "Lateral Premotor": ["F1-lateral-premotor", "F2-caudal", "Precentral-sulcus-superior-part",
                         "Precentral-sulcus-inferior-part"],
    "Ventro-lateral premotor": ["Precentral-sulcus-inferior-part", "F3-pars-opercularis", "Central-operculum"],
    "Dorso-lateral premotor": ["F1-lateral-premotor", "F2-caudal", "Precentral-sulcus-superior-part"],
    "Medial Premotor": [("PreSMA", 1), ("SMA", 1), ("F1-mesial-prefrontal", 0.5)],
    "SMA (": [("SMA", 1), ("PreSMA", 0.5)],
    "SSMA": ["SMA", "Paracentral-lobule"],
    "CING": CINGULATE,
    "Cingulum (WM)": CINGULATE,
    "Ant Cing": [("Anterior-cingulate-cortex", 1), ("Subcallosal-area", 0.3)],
    "Ventr Ant Cing": ["Anterior-cingulate-cortex", "Subcallosal-area"],
    "Dorsal Ant Cing": ["Anterior-cingulate-cortex", "Middle-cingulate-cortex-anterior-part"],
    "Middle Cingulate": ["Middle-cingulate-cortex-anterior-part", "Middle-cingulate-cortex-posterior-part"],
    "Post Cing": ["Posterior-cingulate-cortex-dorsal", "Posterior-cingulate-cortex-retrosplenial-gyrus"],
    "Isthmus": ["Posterior-cingulate-cortex-retrosplenial-gyrus"],
    "PL": PARIETAL,
    "Primary Sensory Cortex": [("Postcentral-gyrus", 1), ("Postcentral-sulcus", 1), ("Central-sulcus-head-face", 0.5),
                               ("Central-sulcus-upper-limb", 0.5), ("Paracentral-lobule", 0.5)],
    "medial anterior parietal": ["Paracentral-lobule", "Marginal-branch-of-the-cingulate-sulcus"],
    "Sup. pariet. lobule": ["Superior-parietal-lobule-P1", "Intraparietal-sulcus"],
    "Precuneus": [("Precuneus", 1), ("Parieto-occipital-sulcus", 0.3)],
    "Inferior Parietal Lobule": ["Supramarginal-anterior", "Supramarginal-posterior", "Angular-gyrus",
                                 "Intraparietal-sulcus"],
    "Supramarg gyrus": ["Supramarginal-anterior", "Supramarginal-posterior"],
    "Angular gyrus": ["Angular-gyrus"],
    "parietal operculum": ["Parietal-operculum"],
    "OL": OCCIPITAL,
    "Mesial Occipital": ["Lingual-gyrus", "Calcarine-sulcus", "Cuneus", "Lingual-sulcus"],
    "Lingual gyrus": ["Lingual-gyrus", "Lingual-sulcus"],
    "Cuneus": ["Cuneus"],
    "Calcarine Cortex": [("Calcarine-sulcus", 1), ("Occipital-pole", 0.5)],
    "Lateral Occipital": ["O1", "O2", "O3", "Anterior-occipital-sulcus-and-preoccipital-notch"],
    "Posterior Occipital Gyrus": ["Occipital-pole", "O2"],
    "Superior Occipital Gyrus": ["O1"],
    "Middle Occipital Gyrus": ["O2"],
    "Inferior Occipital Gyrus": ["O3"],
    "INSULA": ["Insula-gyri-brevi", "Insula-gyri-longi"],
    "Ant Ins": ["Insula-gyri-brevi"],
    "Anterior Short Gyrus": ["Insula-gyri-brevi"],
    "Middle Short Gyrus": ["Insula-gyri-brevi"],
    "Post short gyrus": ["Insula-gyri-brevi"],
    "Insular pole": ["Insula-gyri-brevi"],
    "Precentral gyrus": [("Insula-gyri-brevi", 0.5), ("Insula-gyri-longi", 0.5)],  # insular precentral gyrus
    "Postcentral gyrus": ["Insula-gyri-longi"],  # insular postcentral gyrus
    "Posterior long gyrus": ["Insula-gyri-longi"],
    "Hypothalamus": ["Hypothalamus"],  # no VEP region: kept for inspection
    "Sub-Callosal Cortex": ["Subcallosal-area"],
    "Cerebellum": ["Cerebellar-cortex"],
    "Hemisphere": ["Cerebellar-cortex"],
    "Vermis": ["Cerebellar-cortex"],
    "FT": _union(FRONTAL, TEMPORAL),
    "TO": _union(["T1-lateral-posterior", "T2-posterior", "T3-posterior", "STS-posterior", "ITS-posterior",
                  "Fusiform-gyrus", "Occipito-temporal-sulcus"], OCCIPITAL),
    "TP": ["T1-lateral-posterior", "T2-posterior", "STS-posterior", "Supramarginal-anterior",
           "Supramarginal-posterior", "Angular-gyrus"],
    "FTP": _union(FRONTAL, TEMPORAL, PARIETAL),
    "TPO Junction": ["Angular-gyrus", "Supramarginal-posterior", "T1-lateral-posterior", "STS-posterior",
                     "T2-posterior", "O2", "Anterior-occipital-sulcus-and-preoccipital-notch"],
    "PO": _union(["Precuneus", "Superior-parietal-lobule-P1", "Angular-gyrus", "Intraparietal-sulcus",
                  "Parieto-occipital-sulcus"], OCCIPITAL),
    "FP": _union(FRONTAL, PARIETAL),
    "Perisylvian": ["Central-operculum", "Parietal-operculum", "F3-pars-opercularis", "T1-planum-temporale",
                    "Gyrus-of-Heschl", "T1-lateral-anterior", "T1-lateral-posterior", "Supramarginal-anterior",
                    "Insula-gyri-brevi", "Insula-gyri-longi"],
}

# crosswalk keys that are lobe-level or multi-lobe (ignored by the "sublobar" filter)
LOBE_LEVEL_KEYS = {"TL", "FL", "PL", "OL", "CING", "Cingulum (WM)", "INSULA", "FT", "TO", "TP", "FTP",
                   "TPO Junction", "PO", "FP", "Perisylvian", "Cerebellum"}

# Columns whose names start the same way (e.g. "Precuneus (medial ...)" vs insular "Precentral gyrus") are
# matched on exact normalised prefix; the exact-first matching below handles ambiguity.


def norm_col(c):
    return re.sub(r"\s+", " ", str(c).replace("\n", " ").replace("\xa0", " ")).strip()


def match_crosswalk(col):
    n = norm_col(col)
    # exact match first
    for key in CROSSWALK:
        if n.lower() == key.lower():
            return key
    # then prefix match, longest key first
    for key in sorted(CROSSWALK, key=len, reverse=True):
        if n.lower().startswith(key.lower()):
            return key
    return None


def load_semiodict(path):
    d = yaml.safe_load(open(path))
    leaves = {}

    def walk(x, path):
        if isinstance(x, dict):
            for k, v in x.items():
                walk(v, path + [k])
        elif isinstance(x, list):
            leaves[path[-1]] = [re.compile(p, re.IGNORECASE) for p in x]

    walk(d, [])
    return leaves


def classify(text, leaves):
    cats = []
    if not isinstance(text, str) or not text.strip():
        return cats
    for cat, pats in leaves.items():
        for p in pats:
            try:
                if p.search(text):
                    cats.append(cat)
                    break
            except re.error:
                continue
    return cats


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--xlsx", default="/mnt/user-data/uploads/EpiScope/old_version/sources_semiologie_crises/Semio2Brain Database.xlsx")
    ap.add_argument("--yaml", default="/home/claude/_ext/Semiology-Visualisation-Tool/resources/semiology_dictionary.yaml")
    ap.add_argument("--out", default=os.path.join(ROOT, "data", "evidence_semio2brain.csv"))
    ap.add_argument("--out-lat", default=os.path.join(ROOT, "data", "evidence_semio2brain_lateralisation.csv"))
    args = ap.parse_args()

    df = pd.read_excel(args.xlsx, sheet_name="Main", header=1)
    df["Reference"] = df["Reference"].ffill()
    cols = list(df.columns)
    loc_cols = cols[cols.index("TL"):cols.index("Perisylvian") + 1]
    unmatched = []
    col_map = {}
    for c in loc_cols:
        key = match_crosswalk(c)
        if key is None:
            unmatched.append(c)
        else:
            col_map[c] = _norm(CROSSWALK[key])
    # sanity: every crosswalk key used?
    used_keys = set()
    for c in col_map:
        used_keys.add(match_crosswalk(c))
    unused_keys = [k for k in CROSSWALK if k not in used_keys]

    leaves = load_semiodict(args.yaml)
    cat_lists = []
    unclassified = Counter()
    for _, row in df.iterrows():
        cats = classify(row.get("Semiology Category"), leaves)
        if not cats:
            cats = classify(row.get("Reported Semiology"), leaves)
        if not cats:
            txt = row.get("Semiology Category")
            if not isinstance(txt, str) or not txt.strip():
                txt = row.get("Reported Semiology")
            if isinstance(txt, str) and txt.strip():
                unclassified[txt.strip()] += 1
                cats = ["Unclassified"]
        cat_lists.append(cats)
    df = df.copy()
    df["_cats"] = cat_lists

    def flag(colname):
        s = df[colname]
        return s.notna() & (s.astype(str).str.strip().str.lower().isin(["y", "yes", "1", "1.0", "true"]) | (pd.to_numeric(s, errors="coerce").fillna(0) > 0))

    filters = {
        "all": pd.Series(True, index=df.index),
        "seizure_free": flag("Post-op Sz Freedom (Engel Ia, Ib; ILAE 1, 2)"),
        "spontaneous": flag("Spontaneous Semiology (SS)"),
        # same rows as "all" but lobe-level and multi-lobe columns are ignored (see LOBE_LEVEL_KEYS)
        "sublobar": pd.Series(True, index=df.index),
    }
    locvals = df[loc_cols].apply(pd.to_numeric, errors="coerce").fillna(0.0)
    localising = pd.to_numeric(df["Localising"], errors="coerce").fillna(0.0)
    lateralising = pd.to_numeric(df["Lateralising"], errors="coerce").fillna(0.0)
    lat_cols = {"CL": "CL", "IL": "IL", "BL": "BL (Non-lateralising)", "DomH": "DomH", "NonDomH": "NonDomH"}
    latvals = {k: pd.to_numeric(df[v], errors="coerce").fillna(0.0) for k, v in lat_cols.items()}

    rows_out = []
    lat_out = []
    all_cats = sorted({c for cl in cat_lists for c in cl})
    for fname, fmask in filters.items():
        for cat in all_cats:
            cmask = df["_cats"].apply(lambda cl: cat in cl) & fmask
            n_rows = int(cmask.sum())
            if n_rows == 0:
                continue
            fam_count = defaultdict(float)
            sub = locvals[cmask]
            colsum = sub.sum(axis=0)
            for c in loc_cols:
                total = float(colsum[c])
                if total <= 0 or c not in col_map:
                    continue
                if fname == "sublobar" and match_crosswalk(c) in LOBE_LEVEL_KEYS:
                    continue
                fams = col_map[c]
                wsum = sum(w for _, w in fams)
                for fam, w in fams:
                    fam_count[fam] += total * w / wsum
            n_pat = float(localising[cmask].sum())
            if fam_count:
                mx = max(fam_count.values())
                tot = sum(fam_count.values())
                for fam, cnt in sorted(fam_count.items(), key=lambda kv: -kv[1]):
                    if cnt <= 0:
                        continue
                    rows_out.append([cat, fam, fname, round(cnt, 4), round(cnt / mx, 4), round(cnt / tot, 4),
                                     n_rows, round(n_pat, 1)])
            lat_out.append([cat, fname] + [round(float(latvals[k][cmask].sum()), 1) for k in lat_cols] +
                           [round(float(lateralising[cmask].sum()), 1)])

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["category", "family", "filter", "count", "score", "prob", "n_rows", "n_patients_category"])
        w.writerows(rows_out)
    with open(args.out_lat, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["category", "filter", "CL", "IL", "BL", "DomH", "NonDomH", "n_lateralising"])
        w.writerows(lat_out)

    print(f"rows in Main: {len(df)}; localisation columns: {len(loc_cols)} (mapped {len(col_map)})")
    print(f"wrote {args.out} ({len(rows_out)} rows) and {args.out_lat} ({len(lat_out)} rows)")
    print("categories:", all_cats)
    print("UNMATCHED localisation columns:", [norm_col(c) for c in unmatched])
    print("UNUSED crosswalk keys:", unused_keys)
    print(f"unclassified rows: {sum(unclassified.values())} ({len(unclassified)} distinct strings). Top 30:")
    for s, n in unclassified.most_common(30):
        print(f"  {n:4d}  {s[:90]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
