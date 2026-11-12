---
id: demarrage
title: Démarrage rapide
short: Démarrage rapide (10 min)
group: start
order: 10
ctx: start
lead: Six étapes, dix minutes. À la fin, vous aurez un patient, une crise décrite signe par signe, les régions candidates en 3D et un staff prêt à être présenté.
---

# Démarrage rapide

!!! bref
    - **Il vous faut** : Edge ou Chrome, le fichier `EpiScope.html` et, si possible, la vidéo d'une crise (sur un autre écran ou un autre ordinateur).
    - **Vous apprendrez** : créer un patient, saisir une crise, lire le résultat, présenter le dossier en staff, produire un compte rendu.
    - **Vous pourrez vous arrêter** après n'importe quelle étape : tout est déjà enregistré.

<div class="steps" markdown>

1. **Ouvrir EpiScope** <span class="time">1 min</span>

    Double-cliquez sur `EpiScope.html`. Au tout premier lancement, EpiScope demande où ranger les dossiers : choisissez un répertoire (sur votre disque ou sur le partage du service). Un sous-répertoire par patient y sera créé. Vous arrivez sur la **liste des patients**.

    ![La liste des patients. [[+ Nouveau patient]] en haut à droite ; [[Ouvrir]] sur chaque ligne.](shot:library)

2. **Créer un patient** <span class="time">30 s</span>

    Cliquez sur [[+ Nouveau patient]] et tapez un pseudonyme (par exemple `STR-0042`). Le dossier s'ouvre sur sa **Synthèse**, et le parcours du patient commence par une **Phase 1**.

    !!! attention
        N'utilisez pas le nom du patient comme pseudonyme si le répertoire est partagé avec d'autres équipes ou si vous comptez envoyer le dossier.

3. **Décrire une crise** <span class="time">4 min</span>

    Cliquez sur l'étape **Phase 1** dans la barre du haut, puis sur l'onglet [[Crises]] et sur [[+ Crise]]. L'écran de saisie s'ouvre.

    - Lancez la vidéo de la crise et appuyez sur <kbd>Espace</kbd> au moment du premier signe : c'est t = 0. Le chronomètre tourne avec la vidéo ; <kbd>Espace</kbd> le met en pause et le relance.
    - Pour chaque signe, tapez ses premières lettres (« épig », « automat », « dyston »…) puis <kbd>Entrée</kbd>. Le signe est horodaté au temps du chronomètre.
    - Les touches <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> fixent le côté du signe suivant : gauche, droite, bilatéral, inconnu.

    ![L'écran d'une crise : la saisie à gauche, le cerveau en 3D au centre, les résultats à droite, la frise des signes en bas.](shot:crise-workspace)

    Pas de vidéo sous la main ? Choisissez le mode [[Séquence]] (l'ordre des signes suffit) ou [[Manuel]] (temps recopiés d'un compte rendu).

4. **Lire le résultat** <span class="time">2 min</span>

    Appuyez sur [[▶ Lecture]] : la crise se rejoue sur le cerveau. Les régions s'allument quand elles deviennent plausibles, le réseau se dessine entre elles. À droite :

    - [[Réseau à t]] liste les régions plausiblement actives à l'instant affiché ;
    - [[Origine]] classe les régions d'où la crise peut être partie, avec la latéralisation ;
    - [[Cibles]] liste les régions compatibles avec les hypothèses, à discuter si l'on envisage une SEEG.

    ![L'onglet Origine : régions candidates et latéralisation, recalculées à chaque signe ajouté.](shot:crise-origine)

5. **Préparer et présenter le staff** <span class="time">2 min</span>

    Cliquez sur [[+]] au bout du parcours, puis **Staff**. L'onglet [[Préparer]] réunit la question posée, la synthèse, le tableau de concordance (déjà prérempli d'après le dossier), les hypothèses et la décision. Le jour du staff, [[▶ Présenter]] (ou <kbd>F2</kbd>) affiche le dossier en plein écran, en diapositives, sans un seul bouton d'édition.

    ![Le diaporama du staff : composé à partir du dossier, rien à préparer à la main.](shot:staff-presenter)

6. **Produire le compte rendu** <span class="time">30 s</span>

    Le bouton [[Rapport]] de la barre du haut produit le document de l'étape ouverte : rapport du dossier, rapport de phase 1, rapport SEEG ou compte rendu du staff. Il est téléchargé sous forme d'un fichier HTML autonome : ouvrez-le, il s'affiche dans le navigateur ; <kbd>Ctrl</kbd>+<kbd>P</kbd> l'enregistre en PDF.

</div>

## Et ensuite ?

Vous connaissez maintenant l'essentiel. Selon ce que vous voulez faire :

<div class="cards" markdown>

- [**Ajouter l'EEG** Compte rendu, carte 10-20, tracés EDF, détection des pointes.](@phase1#leeg-de-scalp)
- [**Ajouter l'imagerie** IRM, TEP et scanner, anatomie du patient en 3D.](@imagerie)
- [**Préparer une SEEG** Hypothèses, schéma d'implantation, électrodes réelles.](@seeg)
- [**Se repérer à l'écran** Les boutons de la barre du haut et des vues 3D.](@ecran)

</div>
