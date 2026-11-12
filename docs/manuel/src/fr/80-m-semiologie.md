---
id: m-semiologie
title: Le modèle sémiologie → régions
short: Sémiologie → régions
group: more
order: 10
lead: Comment EpiScope passe d'une suite de signes horodatés à des régions candidates et à des hypothèses de réseau, sur quelles données il s'appuie, et ce qu'il ne fait pas.
---

# Le modèle sémiologie → régions

!!! bref
    - Un signe n'est pas une étiquette lobaire : c'est l'expression, à un instant, d'une décharge qui implique une ou plusieurs **zones symptomatogènes**.
    - La **succession** des signes dessine une trajectoire dans un réseau ; l'origine est la région qui explique le mieux **toute** la séquence, même si elle est silencieuse.
    - Les scores sont des **plausibilités** issues de la littérature, pas des probabilités de zone épileptogène.

## Le raisonnement

{refs: talairach vepatlas semio2brain maillard2004}

EpiScope reprend la lecture anatomo-électro-clinique de l'école de Sainte-Anne et de Marseille (Talairach, Bancaud, Chauvel, Bartolomei). Le cerveau est découpé selon l'**atlas VEP** (*Virtual Epileptic Patient*) : 162 régions corticales et des structures profondes, pensées pour l'épilepsie.

Pour chaque région et chaque pas de 0,5 s, une **plausibilité d'activation** (de 0 à 1) combine trois sources :

1. **L'évidence directe** : la base de référence associe chaque signe aux régions qui peuvent le produire (*priors* signe → région), pondérées par la règle de latéralité du signe, le côté saisi, la topographie et la certitude. Elle est mêlée à l'évidence statistique de **Semio2Brain** (11 230 localisations chez 4 643 patients, issues de 309 publications).
2. **Les relais** : entre deux zones symptomatogènes successives, le chemin de connectivité le plus plausible (voisinage, distance, liens longue distance connus, connectome du patient s'il est chargé) s'active progressivement.
3. **La propagation et la persistance** : une région active le reste un temps, et la décharge gagne ses voisines.

Les signes sont lus selon leur **phase** (précoce, intermédiaire, tardive) : des automatismes oro-alimentaires tardifs n'ont pas la même valeur que précoces. Les régions ont un **rôle** : les noyaux gris centraux ou le thalamus sont recrutés, mais ne sont jamais proposés comme origine.

## Les régions d'origine candidates

{refs: proix2017 bonini2014}

Le classement mesure la capacité de chaque région à atteindre, par la connectivité, les zones symptomatogènes de chaque signe, les signes précoces pesant davantage. Il intègre :

- la **latéralisation** globale (votes des signes latéralisants, y compris post-critiques) ;
- la **latence clinique** : si le début EEG précède nettement le premier signe, une origine silencieuse à un ou deux relais de la première zone symptomatogène est favorisée ;
- la **concordance d'ordre** : les zones symptomatogènes doivent apparaître de plus en plus loin de l'origine au fil des signes ; une séquence lue à l'envers ne donne pas les mêmes hypothèses.

Les **hypothèses de réseau** (H1 à H4) sont des trajectoires — origine, relais, zones dans l'ordre des signes — nommées d'après les systèmes traversés (« cingulaire → temporal gauche »).

## La synthèse de plusieurs crises

La synthèse d'une exploration fait le **consensus** des crises (les crises habituelles comptent double) : régions candidates retrouvées d'une crise à l'autre, latéralisation commune, hypothèses récurrentes. C'est elle qui préremplit la colonne *Sémiologie* de la concordance au staff.

## La base de référence

{refs: ilae2022semio ilae2025 semio2brain}

La base est éditable : [[⋯]] › *Base de référence*. Chaque signe a ses lignes (région VEP, topographie, poids, rôle, source, notes). Les priors viennent de la littérature de SEEG et de stimulation, du glossaire ILAE 2022 et de Semio2Brain, avec une part d'avis d'expert signalée dans la colonne *source*. Voir [Données et confidentialité](@donnees#la-base-de-reference).

## Limites

- Les priors sont un amorçage, faits pour être discutés et corrigés.
- Aucune base publique ne donne les latences entre signes en secondes : la dynamique est inférée des temps saisis, pas apprise.
- L'atlas VEP n'a ni hypothalamus (crises gélastiques) ni tronc cérébral.
- Le connectome normatif est géométrique et curé, pas tractographique.
- EpiScope nourrit la discussion ; il ne localise pas.
