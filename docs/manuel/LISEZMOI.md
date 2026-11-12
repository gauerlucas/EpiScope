# Manuel d'utilisation d'EpiScope · EpiScope user manual

- **`EpiScope_manuel.html`** : le manuel complet, en français et en anglais, à ouvrir d'un double-clic (aucune connexion nécessaire). Sommaire, recherche (touche `/`), thème clair ou sombre, impression. / *The full manual, in French and English; double-click to open (works offline).*
- **`EpiScope_Manuel_FR.pdf`**, **`EpiScope_Manual_EN.pdf`** : la version imprimable. / *Printable version.*
- **`EpiScope_Demarrage_rapide_FR.pdf`**, **`EpiScope_Quick_start_EN.pdf`** : le démarrage rapide seul, à imprimer pour un nouveau collègue. / *The quick start alone, to print for a new colleague.*

Dans l'application, le même manuel s'ouvre par le bouton **?** de la barre du haut ou la touche **F1**, à la page de l'écran en cours. / *In the app, the same manual opens with the **?** button or **F1**, at the page for the current screen.*

Pour le modifier : éditer `src/<langue>/*.md` (et les captures `img/<langue>/*.webp`), puis `python3 tools/build_manual.py --pdf` et `python3 tools/build.py`. / *To edit it: change `src/<lang>/*.md` (and `img/<lang>/*.webp`), then run `python3 tools/build_manual.py --pdf` and `python3 tools/build.py`.*
