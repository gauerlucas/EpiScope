## Quoi et pourquoi

<!-- En deux ou trois phrases : ce que change cette demande de fusion, pour qui, et pourquoi. -->

## Vérifié

- [ ] `node tools/tests/run_all.mjs` vert (la CI le refait)
- [ ] parcours Playwright concernés (`tools/tests/test_*.py`) ou essai à la main décrit ci-dessous
- [ ] `python3 tools/build.py` : `dist/EpiScope.html` se construit et s'ouvre

## Avant de fusionner

- [ ] aucune donnée de patient (fichier, nom, chemin, capture, valeur) — `python3 tools/check_no_data.py`
- [ ] `CHANGELOG.md` : entrée sous la version en cours
- [ ] modèle du dossier modifié ? `normalize` pour les anciens dossiers + test dans `test_store.mjs` / `test_safety.mjs`
- [ ] textes d'interface nouveaux : traduction anglaise (`tools/i18n_extract.py`, `assets/i18n_en.json`)
- [ ] manuel (`docs/manuel/`) à jour si l'usage change

## Essai à la main

<!-- Étapes pour vérifier dans l'application (sur une copie de bibliothèque de test, jamais sur des données réelles). -->
