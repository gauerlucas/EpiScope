---
id: faq
title: Questions fréquentes et dépannage
short: Questions fréquentes
group: ref
order: 30
lead: Les questions que posent le plus souvent les collègues, et quoi faire quand quelque chose ne marche pas.
---

# Questions fréquentes et dépannage

## Prise en main

**Faut-il installer quelque chose ?**
Non. `EpiScope.html` s'ouvre dans Edge ou Chrome, y compris depuis une clé USB, un partage réseau ou une machine virtuelle sans carte graphique.

**Mes données partent-elles sur Internet ?**
Non. EpiScope ne se connecte à rien. La seule exception, sur votre accord explicite, est le téléchargement unique de l'outil de conversion vidéo (ffmpeg) pour lire un format ancien ; la vidéo elle-même ne quitte pas le poste.

**Faut-il tout remplir ?**
Non. Chaque écran est utile seul. Un staff peut se préparer avec deux crises et un compte rendu d'IRM.

**Comment passer l'application en anglais ?**
[[⋯]] › *Langue* › *English*. Le choix est mémorisé sur le poste ; les données saisies ne sont pas traduites.

## Problèmes courants

**La vue 3D est lente ou noire.**
Le poste n'a peut-être pas d'accélération graphique (machine virtuelle) : EpiScope passe en rendu logiciel, plus lent. Réduisez le nombre de vues ([[1 vue ▾]]), fermez les autres onglets du navigateur, ou utilisez la densité compacte.

**Le point d'enregistrement est rouge.**
Le dossier est peut-être ouvert par un collègue (verrou), ou le répertoire n'est plus accessible (partage déconnecté). Survolez le point pour le détail. Rien n'est perdu : les modifications sont gardées et réécrites dès que possible.

**« Dossier ouvert par un collègue ».**
Un verrou est posé quand un dossier est ouvert. S'il reste après une fermeture brutale, il expire tout seul au bout de quelques minutes.

**Le recalage d'une image est faux.**
Utilisez [[repères…]] ou [[ajuster]] dans l'écran Imagerie (voir [Si le recalage échoue](@imagerie#si-le-recalage-echoue)).

**La segmentation déborde ou oublie une région.**
Essayez [[Autre méthode…]] (comparer les méthodes et choisir), ou importez une segmentation FreeSurfer. Chez le jeune enfant, préférez l'atlas de type SPM.

**Un tracé EDF ne s'ouvre pas.**
Vérifiez qu'il s'agit d'un EDF ou BDF standard (export depuis le logiciel d'acquisition). Un fichier tronqué est lu jusqu'au dernier échantillon complet, avec un avertissement. Les `.TRC` Micromed natifs doivent être exportés en EDF depuis Brainquick.

**Les pointes détectées sont surtout des artefacts.**
Relisez les groupes et supprimez ceux d'artefacts ; montez le seuil de SpikeNet ; ou activez le filtre propre au patient (« Apprendre de ma relecture »).

**Le diaporama du staff est trop long.**
Dans *Préparer*, décochez les explorations ou les crises à ne pas montrer, et ne cochez que les captures utiles.

**J'ai effacé quelque chose par erreur.**
Le journal du dossier dit quoi et quand. Pour les retouches de pointes et de sommeil, <kbd>Ctrl</kbd>+<kbd>Z</kbd>. Sinon, revenez à la sauvegarde du répertoire.

## Signaler un problème

Notez ce que vous faisiez, l'écran, et faites une capture ([[Capture ▾]] ou <kbd>Win</kbd>+<kbd>Maj</kbd>+<kbd>S</kbd>). Les crédits ([[⋯]] › *Crédits et sources*) indiquent les auteurs de l'application.
