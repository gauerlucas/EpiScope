---
id: ecran
title: Se repérer à l'écran
short: Se repérer à l'écran
group: start
order: 30
lead: Tous les écrans d'EpiScope sont bâtis de la même façon : une barre du haut pour le parcours du patient, une barre d'onglets pour les vues de l'étape, puis l'espace de travail.
---

# Se repérer à l'écran

!!! bref
    - **En haut** : le patient et son parcours, étape par étape.
    - **Juste en dessous** : les vues de l'étape ouverte.
    - **Au centre** : un formulaire, ou le cerveau en 3D avec ses panneaux.

![Les repères de l'écran. ① liste des patients ; ② patient ouvert ; ③ parcours du patient ; ④ ajouter une étape ; ⑤ rapport de l'étape ; ⑥ état de l'enregistrement ; ⑦ thème clair ou sombre ; ⑧ aide ; ⑨ menu général ; ⑩ vues de l'étape.](shot:ecran-reperes)

## La barre du haut

| Élément | Rôle |
|---|---|
| [[Patients]] | Revient à la liste des patients (<kbd>F9</kbd>). |
| Nom du patient ▾ | Exporter le dossier, changer de patient. |
| Parcours | Les étapes du patient dans l'ordre chronologique : Dossier, Phase 1, Staff, SEEG, Chirurgie, Suivi. La pastille de couleur indique l'état (en cours, terminée). |
| [[+]] | Ajoute une étape : vidéo-EEG de scalp, SEEG, staff, chirurgie ou autre procédure, suivi, autre exploration. |
| [[Rapport]] | Produit le document de l'étape ouverte. Son nom change avec l'étape : *Rapport du dossier*, *Rapport Phase 1*, *Rapport SEEG*, *Compte rendu du staff*. |
| ● | Vert : enregistré. Bleu : enregistrement en cours. Rouge : problème (dossier ouvert ailleurs, disque plein). |
| [[◐]] | Thème clair ou sombre. Les vues d'imagerie restent toujours sur fond noir. |
| [[?]] | Ouvre ce manuel à la page de l'écran en cours (<kbd>F1</kbd>). |
| [[⋯]] | Importer ou exporter, base de référence, densité de l'affichage, **manuel d'utilisation**, crédits, mentions légales, **langue**. |

## Les vues d'une étape

Sous la barre du haut, chaque étape a ses onglets, dans l'ordre où l'on s'en sert. Par exemple, pour une SEEG : *Planification · Localisation · Intercritique · Crises · Analyses · Stimulations · Thermocoagulations · Galerie · Rapport SEEG*. Le numéro devant chaque onglet de la SEEG rappelle l'ordre habituel du travail.

## L'espace de travail 3D

Les vues qui montrent le cerveau (une crise, la planification, les analyses, les stimulations, les thermocoagulations) partagent le même espace de travail :

- **à gauche**, la saisie (signes d'une crise, par exemple) ;
- **au centre**, la vue 3D, avec sa barre d'outils ;
- **à droite**, le panneau d'analyse et ses onglets ;
- **en bas**, pour une crise, la frise des signes.

![L'espace de travail d'une crise. Les panneaux se replient (‹ ›) pour agrandir la vue 3D.](shot:crise-workspace)

### La barre d'outils de la vue 3D

| Bouton | Effet |
|---|---|
| [[1 vue ▾]] | Une vue, deux vues, quatre faces ou mosaïque. Chaque vue garde ses propres réglages. |
| [[Lat. G]] [[Méd. G]] … [[Post.]] | Orientation : latérale ou médiale de chaque hémisphère, dessus, dessous, avant, arrière. |
| [[Gabarit]] / [[Patient]] | Cerveau moyen (fsaverage) ou anatomie du patient, si elle a été calculée. |
| [[Affichage ▾]] | Gonflement du cortex, opacité, structures profondes, réseau, électrodes, étiquettes. |
| [[Coupes IRM]] | Ouvre les coupes du patient à côté de la 3D, synchronisées avec elle. |
| [[Capture ▾]] | Image de la vue, à coller dans un document ou à ranger dans la galerie. |

### À la souris

- **Glisser** : tourner le cerveau. **Clic droit glissé** : déplacer. **Molette** : zoomer.
- **Survoler une région** : son nom et sa plausibilité à l'instant affiché ; survoler un plot : son électrode, sa région et, en SEEG, ce qu'on y a mesuré.
- Les boutons d'orientation ([[Lat. G]], [[Sup.]]…) remettent la vue d'aplomb.

## Les coupes

Partout où des coupes d'IRM sont affichées (écran Imagerie, volet [[Coupes IRM]], localisation, stimulations), les mêmes gestes s'appliquent, à la manière de MRIcroGL : la molette passe à la coupe suivante, <kbd>Ctrl</kbd>+molette zoome autour du réticule, le double-clic recadre, <kbd>Maj</kbd>+glisser règle le contraste. Le détail est dans [Lire les coupes](@imagerie#lire-les-coupes).

## Adapter l'affichage

- **Densité** : [[⋯]] › *Densité de l'affichage* : compacte pour un portable, large pour un grand écran ou un vidéoprojecteur.
- **Langue** : [[⋯]] › *Langue* : français ou anglais. Le choix est mémorisé sur le poste.
- **Mode présentation de la 3D** : <kbd>F2</kbd> hors staff affiche la vue 3D seule, en plein écran.

??? plus
    Les raccourcis clavier sont réunis dans la page [Raccourcis clavier](@raccourcis). Ceux qu'on retient vite : <kbd>F9</kbd> patients, <kbd>F4</kbd> dossier, <kbd>F7</kbd> imagerie, <kbd>F6</kbd> staff, <kbd>F2</kbd> présenter, <kbd>F1</kbd> aide.
