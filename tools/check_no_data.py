#!/usr/bin/env python3
"""Garde-fou (v1.0.1) : aucune donnée de patient ni enregistrement dans le dépôt.

  python3 tools/check_no_data.py            → fichiers suivis par git (CI)
  python3 tools/check_no_data.py --staged   → fichiers prêts à être commités (hook .githooks/pre-commit)

Refuse : tracés (EDF, BDF, BrainVision, Micromed TRC), imagerie (DICOM, NIfTI, MGZ), vidéos, archives .episcope,
dossier.json, et tout fichier de plus de 3 Mo hors des ressources livrées (assets/, vendor/, docs/banner/).
Seule exception : tools/tests/fixtures/ (fixtures synthétiques, petites)."""
import os, re, subprocess, sys

DATA = re.compile(r'\.(edf|bdf|eeg|vhdr|vmrk|trc|dcm|ima|nii|nii\.gz|mgz|mp4|mov|avi|mkv|webm|m4v|episcope)$', re.I)
ALLOW_BIG = ('assets/', 'vendor/', 'docs/banner/', 'docs/manuel/img/')
MAX = 3_000_000

def files(staged):
    cmd = ['git', 'diff', '--cached', '--name-only', '--diff-filter=ACMR'] if staged else ['git', 'ls-files']
    return [f for f in subprocess.run(cmd, capture_output=True, text=True, check=True).stdout.splitlines() if f]

def main():
    bad = []
    for f in files('--staged' in sys.argv):
        if f.startswith('tools/tests/fixtures/'):
            continue
        name = os.path.basename(f)
        if DATA.search(f) or name == 'dossier.json' or re.match(r'dossier\.(conflict|r\d+)', name):
            bad.append((f, 'type de fichier de données (patient, tracé, image, vidéo)'))
        elif os.path.isfile(f) and os.path.getsize(f) > MAX and not f.startswith(ALLOW_BIG):
            bad.append((f, f'fichier de {os.path.getsize(f) / 1e6:.1f} Mo hors des ressources livrées'))
    if bad:
        print('Refusé : ces fichiers ne doivent pas aller dans le dépôt (données de patients ou fichiers lourds) :')
        for f, why in bad:
            print(f'  {f}  — {why}')
        print('Retirez-les (git restore --staged <fichier>) ; les données de test restent sur le poste.')
        return 1
    return 0

if __name__ == '__main__':
    sys.exit(main())
