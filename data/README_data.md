# Base de référence EpiScope — comment l'éditer

Les CSV de ce dossier sont la **source canonique**. Ils s'ouvrent dans Excel ou LibreOffice (UTF-8, séparateur virgule ; un point-virgule est accepté à l'import). Après modification : `python tools/build.py` (ou, sans Python, importer les CSV dans l'application via **Base → Importer CSV** puis **Exporter l'app avec cette base**).

| Fichier | Rôle | Colonnes |
|---|---|---|
| `signs.csv` | vocabulaire des signes | `id` (stable, snake_case), `category`, `label_fr`, `label_en`, `subjective` (1/0), `topography` (face\|UL\|LL\|trunk\|hemibody), `laterality_rule` (contra, ipsi, none, dominant, nondominant), `default_duration_s`, `key`, `synonyms` (;), `notes` |
| `sign_region_priors.csv` | régions VEP impliquées par signe | `sign_id`, `family` (nom VEP sans hémisphère), `topography` ('' ou une topographie), `weight` (0–1), `role` (symptomatogenic, onset, both), `source`, `notes` |
| `regions.csv` | métadonnées des 81 familles VEP | `family`, `label_fr`, `lobe`, `system`, `ez_prior` (facteur, 1 = neutre), `notes` |
| `network_edges.csv` | liens longue distance | `family_a`, `family_b`, `weight` (0–1), `kind` (structural, functional, both), `name`, `source`, `notes` |
| `semio2brain_category_map.csv` | catégories SemioDict → signes | `semio2brain_category`, `sign_ids` (\|), `blend` |
| `evidence_semio2brain.csv` | dérivée (ne pas éditer à la main) | voir `README_semio2brain.md` ; régénérer avec `tools/extract_semio2brain.py` |

## Règles de poids (`sign_region_priors.csv`)

- 1,0 : zone symptomatogène classique (clonies de la main → gyrus précentral membre supérieur).
- 0,6 : région fréquemment impliquée quand le signe est présent.
- 0,3 : possible, secondaire ; 0,15 : occasionnelle.
- Les poids d'un même signe sont comparés entre eux (normalisation par le moteur) : ajouter une région à 0,3 ne change pas l'ordre des régions à 1,0.
- `role = onset` sert à documenter qu'une région est une origine statistiquement associée (ex. hippocampe pour les automatismes) sans produire le signe ; le moteur ne distingue pas encore les rôles dans le calcul, mais la colonne prépare cette distinction.
- Une ligne avec `topography` ne s'applique qu'à cette topographie ; si l'événement n'en précise pas, elle compte à 0,6.

## Familles VEP (81)

Corticales (72) : Frontal-pole, Orbito-frontal-cortex, Gyrus-rectus, F3-Pars-Orbitalis, F3-Pars-triangularis, F3-pars-opercularis, Inferior-frontal-sulcus, F2-rostral, F2-caudal, Middle-frontal-sulcus, SFS-rostral, SFS-caudal, F1-mesial-prefrontal, PreSMA, SMA, F1-lateral-prefrontal, F1-lateral-premotor, Subcallosal-area, Precentral-sulcus-inferior-part, Precentral-sulcus-superior-part, Precentral-gyrus-head-face, Precentral-gyrus-upper-limb, Central-sulcus-head-face, Central-sulcus-upper-limb, Paracentral-lobule, Central-operculum, Parietal-operculum, Anterior-cingulate-cortex, Middle-cingulate-cortex-anterior-part, Middle-cingulate-cortex-posterior-part, Posterior-cingulate-cortex-dorsal, Posterior-cingulate-cortex-retrosplenial-gyrus, Insula-gyri-brevi, Insula-gyri-longi, Temporal-pole, T1-planum-polare, Gyrus-of-Heschl, T1-planum-temporale, T1-lateral-anterior, T1-lateral-posterior, STS-anterior, STS-posterior, ITS-anterior, ITS-posterior, T2-anterior, T2-posterior, T3-anterior, T3-posterior, Fusiform-gyrus, Occipito-temporal-sulcus, Collateral-sulcus, Lingual-sulcus, Parahippocampal-cortex, Rhinal-cortex, Postcentral-gyrus, Postcentral-sulcus, Superior-parietal-lobule-P1, Supramarginal-anterior, Supramarginal-posterior, Angular-gyrus, Intraparietal-sulcus, Precuneus, Marginal-branch-of-the-cingulate-sulcus, Parieto-occipital-sulcus, Anterior-occipital-sulcus-and-preoccipital-notch, O3, O2, O1, Occipital-pole, Lingual-gyrus, Calcarine-sulcus, Cuneus.

Sous-corticales (9) : Hippocampus-anterior, Hippocampus-posterior, Amygdala, Thalamus, Caudate-nucleus, Putamen, Pallidum, Nucleus-accumbens, Cerebellar-cortex.

Les scripts `tools/seed/*.py` ont généré la version initiale de ces tables ; ils **écrasent** les CSV et ne doivent plus être relancés une fois les tables éditées à la main.
