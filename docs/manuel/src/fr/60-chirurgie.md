---
id: chirurgie
title: Chirurgie et suivi
group: path
order: 60
ctx: procedure>lintervention, procedure/intervention>lintervention, followup>le-suivi, followup/suivi>le-suivi
lead: L'intervention décidée en staff, les régions réséquées sur l'anatomie du patient, puis le devenir selon Engel et l'ILAE, avec le recul calculé tout seul.
---

# Chirurgie et suivi

!!! bref
    - **Où ?** Étapes **Chirurgie** et **Suivi** du parcours (créées par une décision de staff ou par [[+]]).
    - **Minimum** : le type d'intervention, la date, le côté ; puis une évaluation du devenir.

## L'intervention

L'onglet [[Intervention]] décrit la procédure : type (résection ou corticectomie, lobectomie, déconnexion, thermocoagulation, laser, neuromodulation…), date, côté, description, histologie, complications et notes.

- **Intervention type** : lobectomie temporale antérieure réglée, résection antéro-mésiale, amygdalo-hippocampectomie sélective, **hémisphérotomie**, **résection temporale + déconnexion pariéto-occipitale**, lésionectomie ou résection sur mesure. Le côté choisi donne les régions ; pour une déconnexion, les régions laissées en place mais déconnectées sont notées *déconnecté* et peintes en violet (hémisphérotomie : tout le cortex de l'hémisphère ; résection temporale + déconnexion pariéto-occipitale : lobe temporal emporté, cortex pariétal en arrière du gyrus postcentral, occipital et pariétal médial déconnectés).
- **Régions réséquées ou déconnectées** : choisies dans la liste ou reprises des hypothèses retenues ; la vue 3D montre l'intervention face à la zone épileptogène (comprise ou non).
- **Coupes IRM** : l'IRM post-opératoire associée se superpose au T1 pré-opératoire ; les régions de l'intervention y sont colorées.

### Histologie

{refs: najm2022fcd blumcke2013hs who2021cns}

Les diagnostics se choisissent dans une liste fermée — dysplasies corticales focales selon la classification ILAE 2022 (types I à III, mMCD, MOGHE), sclérose hippocampique ILAE type 1 à 3, tumeurs épileptogènes selon l'OMS 2021 (gangliogliome, DNET, PLNTY…), cavernome, tuber, cicatrice gliale… — plusieurs à la fois en cas de double pathologie. Le texte libre reste à côté pour les précisions (gène, immunohistochimie). Une requête porte sur les codes, pas sur le texte.

### Contacts dans la résection

{refs: arnold2022cavity}

La carte **Contacts dans la résection** montre les électrodes réelles de la SEEG de référence, un bouton par contact : un clic le déclare dans la résection (rouge), le survol rappelle sa région VEP. Sur une IRM post-opératoire importée et recalée, [[Segmenter la cavité]] compare l'image à la parcellation pré-opératoire du patient : le parenchyme devenu LCR forme la cavité. Les intensités sont rapportées à celles du patient sur l'IRM post-opératoire (LCR 0, substance blanche 1 ; le contrôle affiche la place du cortex, attendue entre 0,3 et 0,9). Les composantes trouvées se gardent ou s'écartent, avec leur volume et la part de chaque région emportée ; [[Retenir cette cavité et déduire les contacts]] range le masque (visible dans les coupes) et marque les contacts compris dans la cavité (violet, tolérance 1,5 mm). Les contacts situés de 1,5 à 5 mm de la cavité sont signalés **en bordure** (pointillé, liste « à vérifier ») sans être ajoutés. Les contacts déclarés à la main restent ; ceux d'une cavité précédente sont remplacés.

!!! attention
    La cavité montre le tissu vidé. Elle ne voit ni le tissu laissé en place mais déconnecté, ni une cavité affaissée ou comblée, et le déplacement du cerveau après l'intervention (cortex éloigné de la voûte, liquide à sa place) peut la faire déborder sur des contacts restés en tissu sain. Vérifiez-la dans les coupes et corrigez les contacts au clic : la déclaration à la main fait foi.

![L'intervention : type, régions réséquées, coupes pré / post-opératoires.](shot:chirurgie)

## Le suivi

{refs: engel ilaeoutcome}

L'onglet [[Suivi]] reçoit les évaluations successives : date, **Engel** (IA à IVC) et **ILAE** (1 à 6), avec leur aide-mémoire (bouton ?), traitements et notes. Le **recul** est calculé de la date de l'intervention à celle de l'évaluation (modifiable). Les **bilans de suivi** (neuropsychologie, imagerie post-opératoire…) se rangent avec les autres bilans du dossier.

![Le suivi : Engel, ILAE, recul et bilans de suivi.](shot:suivi)
