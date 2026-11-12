/* EpiScope — legal.js (v5.9) : « Mentions légales » (pied de la liste des patients, menu ⋯) — auteur, statut de prototype de
 *   recherche, propriété intellectuelle et citation, méthodes et composants de tiers avec leurs licences, données personnelles,
 *   absence de garantie. Texte rédigé en français et en anglais (pas de traduction automatique : classe notr). Les liens
 *   « Aide · Crédits · Mentions légales » du pied de page passent par data-foot. */
(function (SV) {
  'use strict';
  const esc = SV.U.esc;
  const A = (u, t) => `<a href="${esc(u)}" target="_blank" rel="noopener">${t}</a>`;

  function cite(B, en) {
    const parts = (B.author || '').trim().split(/\s+/), last = parts.pop() || '', ini = parts.map(p => p[0]).join('');
    return `${last}${ini ? ' ' + ini : ''}. ${B.name} — ${B.tagline}${B.version ? ', version ' + B.version : ''} [${en ? 'software' : 'logiciel'}]. 2026.${B.orcid ? ' ORCID ' + B.orcid + '.' : ''}`;
  }

  function body(B, en) {
    const orcid = B.orcid ? A('https://orcid.org/' + B.orcid, 'ORCID ' + esc(B.orcid)) : '';
    const c = esc(cite(B, en));
    if (en) return `
      <h3>Publisher and author</h3>
      <p>EpiScope is designed by ${esc(B.author)}${orcid ? ' (' + orcid + ')' : ''}, in a personal capacity, and does not commit his employer. The application is entirely vibe-coded by Claude (Opus 5.5, Anthropic) and comes with no guarantee of durability or maintenance.</p>
      <h3>Status</h3>
      <p>EpiScope is a <b>research prototype</b>. It is not a medical device: it does not carry a CE mark under Regulation (EU) 2017/745 and has not been validated for clinical use. It must not be used to make a diagnosis or to decide on a treatment or an operation. Its results (semiological localisation, SEEG quantification, spike detection, source imaging, sleep staging, image segmentation and registration…) support discussion and must be checked by a qualified professional against the original data.</p>
      <h3>Intellectual property</h3>
      <p>© 2026 ${esc(B.author)}. The design, code, interface, texts and manual of EpiScope are the intellectual property of their author. The code is released under the MIT licence (LICENSE file): you may use, copy, share and adapt it, provided the copyright notice and the licence text are kept. Please cite EpiScope in any publication, communication or presentation that relies on it:</p>
      <blockquote class="lg-cite">${c}</blockquote><p><button type="button" class="mini-btn lg-copy">Copy the citation</button></p>
      <h3>Third-party methods and components</h3>
      <p>EpiScope re-implements in JavaScript published methods (epileptogenicity index, cEI, h², epileptogenic zone fingerprint, spike detection, source imaging, sleep staging, partial volume correction…). These methods belong to their authors: cite the original papers, listed under <a href="#" data-foot="credits">Credits</a>, when you publish results obtained with them. Any discrepancy with the original implementations is EpiScope's, not theirs.</p>
      <p>Embedded components keep their own licence, which prevails over EpiScope's for what concerns them:</p>
      <ul>
        <li>three.js, webm-muxer, brainchop models, Semio2Brain: MIT; NiiVue conformation: BSD-2; Desikan parcellation (ENIGMA Toolbox) and YASA sleep-staging model: BSD-3; Bodoni Moda and Aleo fonts: SIL Open Font License 1.1;</li>
        <li>SpikeNet network weights (Jing et al., 2020): CC BY-NC 4.0, non-commercial use only, citation required. The EpiScope.html file, which embeds them, therefore cannot be used for commercial purposes;</li>
        <li>templates and surfaces (MNI ICBM152 2009, FreeSurfer fsaverage, via nilearn), reference data (WHO growth curves, INTERGROWTH-21st, CDC milestones), electrode catalogues: terms of their publishers;</li>
        <li>ffmpeg.wasm (GPL) is not embedded: it is downloaded only when you ask for a video to be converted.</li>
      </ul>
      <h3>Personal data</h3>
      <p>EpiScope runs entirely on the computer where the HTML file is located: no data is sent to the author or to any server (no account, no analytics). Records are saved in the folder chosen by the user or in the browser's storage. The department using it remains responsible for processing these data (GDPR, hospital rules): prefer pseudonyms and restrict access to the shared folder to the clinicians involved. The only network request is the optional download of ffmpeg.wasm (cdn.jsdelivr.net) to convert a video; the video itself never leaves the computer.</p>
      <h3>No warranty</h3>
      <p>EpiScope is provided “as is”, without warranty of any kind. The author cannot be held liable for any consequence of its use.</p>
      <h3>Contact</h3>
      <p>${orcid ? 'Author profile: ' + orcid + '.' : esc(B.author)}</p>`;
    return `
      <h3>Éditeur et auteur</h3>
      <p>EpiScope est conçu par ${esc(B.author)}${orcid ? ' (' + orcid + ')' : ''}, à titre personnel et n’engage pas son employeur. L’application est totalement vibe-codée par Claude (version Opus 5.5, Anthropic) et n’a aucune garantie de pérennité ou maintenance.</p>
      <h3>Statut de l’outil</h3>
      <p>EpiScope est un <b>prototype de recherche</b>. Ce n’est pas un dispositif médical : il ne porte pas de marquage CE au titre du règlement (UE) 2017/745 et n’est pas validé pour un usage clinique. Il ne doit pas servir à poser un diagnostic ni à décider d’un traitement ou d’une intervention. Ses résultats (localisation sémiologique, quantifications SEEG, détection de pointes, imagerie de source, stades de sommeil, segmentation et recalage d’images…) sont des aides à la discussion, à vérifier par un professionnel qualifié sur les données d’origine.</p>
      <h3>Propriété intellectuelle</h3>
      <p>© 2026 ${esc(B.author)}. La conception, le code, l’interface, les textes et le manuel d’EpiScope sont la propriété intellectuelle de leur auteur. Le code est diffusé sous licence MIT (fichier LICENSE) : vous pouvez l’utiliser, le copier, le partager et l’adapter, à condition de conserver la mention de copyright et le texte de la licence. Merci de citer EpiScope dans toute publication, communication ou présentation qui s’appuie sur lui :</p>
      <blockquote class="lg-cite">${c}</blockquote><p><button type="button" class="mini-btn lg-copy">Copier la citation</button></p>
      <h3>Méthodes et composants de tiers</h3>
      <p>EpiScope réécrit en JavaScript des méthodes publiées (indice d’épileptogénicité, cEI, h², empreinte de la zone épileptogène, détection de pointes, imagerie de source, stades de sommeil, correction de l’effet de volume partiel…). Ces méthodes restent celles de leurs auteurs : citez les articles princeps, listés dans les <a href="#" data-foot="credits">Crédits</a>, lorsque vous publiez des résultats obtenus avec elles. Les écarts éventuels avec les implémentations d’origine sont ceux d’EpiScope, pas les leurs.</p>
      <p>Les composants embarqués gardent leur propre licence, qui prime sur celle d’EpiScope pour ce qui les concerne :</p>
      <ul>
        <li>three.js, webm-muxer, modèles de brainchop, Semio2Brain : MIT ; conformation de NiiVue : BSD-2 ; parcellation de Desikan (ENIGMA Toolbox) et modèle de stades de sommeil de YASA : BSD-3 ; polices Bodoni Moda et Aleo : SIL Open Font License 1.1 ;</li>
        <li>poids du réseau SpikeNet (Jing et al., 2020) : CC BY-NC 4.0, usage non commercial et citation obligatoire. Le fichier EpiScope.html, qui les embarque, ne peut donc pas être utilisé à des fins commerciales ;</li>
        <li>gabarits et surfaces (MNI ICBM152 2009, fsaverage de FreeSurfer, via nilearn), données de référence (courbes de croissance de l’OMS, INTERGROWTH-21st, repères du CDC), catalogues d’électrodes : conditions de leurs éditeurs ;</li>
        <li>ffmpeg.wasm (GPL) n’est pas embarqué : il n’est téléchargé que si l’on demande la conversion d’une vidéo.</li>
      </ul>
      <h3>Données personnelles</h3>
      <p>EpiScope fonctionne entièrement sur le poste où se trouve le fichier HTML : aucune donnée n’est envoyée à l’auteur ni à un serveur (pas de compte, pas de mesure d’audience). Les dossiers sont enregistrés dans le répertoire choisi par l’utilisateur ou dans le stockage du navigateur. Le service qui l’utilise reste responsable du traitement de ces données (RGPD, règles de l’établissement) : préférez les pseudonymes et réservez l’accès au répertoire partagé aux soignants concernés. Seule requête réseau : le téléchargement facultatif de ffmpeg.wasm (cdn.jsdelivr.net) pour convertir une vidéo ; la vidéo elle-même ne quitte pas le poste.</p>
      <h3>Absence de garantie</h3>
      <p>EpiScope est fourni « en l’état », sans garantie d’aucune sorte. L’auteur ne saurait être tenu responsable des conséquences de son utilisation.</p>
      <h3>Contact</h3>
      <p>${orcid ? 'Profil de l’auteur : ' + orcid + '.' : esc(B.author)}</p>`;
  }

  const M = {
    openLegal() {
      const old = document.getElementById('legalDialog'); if (old) old.remove();
      const B = this.brand(), en = SV.I18n && SV.I18n.lang === 'en';
      const panel = document.createElement('div'); panel.className = 'modal'; panel.id = 'legalDialog';
      panel.innerHTML = `<div class="modal-card lg-card notr" lang="${en ? 'en' : 'fr'}"><div class="modal-head"><span>${en ? 'Legal notice' : 'Mentions légales'}</span><button class="close" title="${en ? 'Close' : 'Fermer'}">✕</button></div>
        <div class="lg-body">${body(B, en)}</div>
        <div class="btnrow"><span class="spacer"></span><button class="primary close">${en ? 'Close' : 'Fermer'}</button></div></div>`;
      document.body.appendChild(panel); panel.hidden = false;
      const close = () => { panel.remove(); document.removeEventListener('keydown', onKey, true); };
      const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
      document.addEventListener('keydown', onKey, true);
      panel.querySelectorAll('.close').forEach(b => b.onclick = close); panel.onclick = e => { if (e.target === panel) close(); };
      panel.querySelector('.lg-copy').onclick = async () => {
        const t = cite(B, en), ok = () => this.toast && this.toast(en ? 'Citation copied' : 'Citation copiée');
        try { await navigator.clipboard.writeText(t); ok(); } catch (e) { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); ok(); }
      };
    },
  };
  Object.assign(SV.app, M);

  // liens « Aide · Crédits · Mentions légales » (pied de la liste des patients, renvois internes)
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-foot]'); if (!b) return; e.preventDefault();
    const a = b.dataset.foot, app = SV.app;
    if (a === 'help') app.openManual && app.openManual('home');
    else if (a === 'credits') { const l = document.getElementById('legalDialog'); if (l) l.remove(); app.openCredits && app.openCredits(); }
    else if (a === 'legal') app.openLegal();
  });
  SV.Legal = { cite };
})(window.SV = window.SV || {});
