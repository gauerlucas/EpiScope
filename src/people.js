/* EpiScope — people.js (v5.1) : annuaire des utilisateurs de la bibliothèque partagée, participants des staffs.
 *
 *   L'annuaire est rangé avec la bibliothèque, pas dans un dossier patient : <bibliothèque>/.episcope/users.json en mode
 *   « dossier » (partage réseau : le même pour tous les postes), IndexedDB du poste sinon. Chaque utilisateur : nom, prénom,
 *   fonction (liste ou texte libre), initiales (journal des dossiers), « participant habituel des staffs ». L'utilisateur
 *   du poste est retenu localement (sv_user_id) ; ses initiales signent le journal, comme avant.
 *   Staff : m.participantIds (annuaire) + m.participantsExtra (texte libre) ; m.participants reste la ligne lisible
 *   reprise par les comptes rendus et la présentation.                                                            */
(function (SV) {
  'use strict';
  const L = SV.Library, A = SV.app, U = SV.U, esc = U.esc, h = U.h;
  const ROLES = ['Neurologue', 'Neuropédiatre', 'Neurochirurgien', 'Neuropsychologue', 'Radiologue', 'Neurophysiologiste', 'Psychiatre', 'IDE', 'Interne'];
  const FILE = '.episcope/users.json', LS_ME = 'sv_user_id';
  const lsGet = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }, lsSet = (k, v) => { try { localStorage.setItem(k, v || ''); } catch (e) { } };
  async function idb(mode, fn) { return new Promise((res, rej) => { const r = indexedDB.open('episcope', 1); r.onupgradeneeded = () => { const x = r.result; for (const s of ['dossiers', 'files', 'meta']) if (!x.objectStoreNames.contains(s)) x.createObjectStore(s); }; r.onsuccess = () => { const t = r.result.transaction('meta', mode), s = t.objectStore('meta'); let out; const q = fn(s); if (q) q.onsuccess = () => { out = q.result; }; t.oncomplete = () => { r.result.close(); res(out); }; t.onerror = () => rej(t.error); }; r.onerror = () => rej(r.error); }); }
  async function read() {
    try {
      if (L.mode === 'folder' && L.root) { const d = await L.root.getDirectoryHandle('.episcope', { create: false }); const f = await (await d.getFileHandle('users.json')).getFile(); return JSON.parse(await f.text()); }
      return (await idb('readonly', s => s.get('users'))) || null;
    } catch (e) { return null; }
  }
  async function write(dir) {
    dir.updated = new Date().toISOString();
    if (L.mode === 'folder' && L.root) { const d = await L.root.getDirectoryHandle('.episcope', { create: true }); const w = await (await d.getFileHandle('users.json', { create: true })).createWritable(); await w.write(JSON.stringify(dir, null, 1)); await w.close(); return; }
    await idb('readwrite', s => s.put(dir, 'users'));
  }
  const People = {
    ROLES, dir: { users: [] },
    async load() { const d = await read(); this.dir = d && Array.isArray(d.users) ? d : { users: [] }; this.syncInitials(); return this.dir; },
    /** relit l'annuaire avant d'écrire (un autre poste a pu l'enrichir), applique fn, enregistre */
    async update(fn) { const cur = (await read()) || { users: [] }; cur.users = cur.users || []; fn(cur); await write(cur); this.dir = cur; this.syncInitials(); },
    me() { const id = lsGet(LS_ME); return this.dir.users.find(u => u.id === id) || null; },
    setMe(id) { lsSet(LS_ME, id); this.syncInitials(); },
    syncInitials() { const m = this.me(); if (m && m.initials) L.user = m.initials; },
    byId(id) { return this.dir.users.find(u => u.id === id) || null; },
    role(u) { return u.role === 'autre' ? (u.roleOther || '') : (u.role || ''); },
    initialsOf(u) { return (u.initials || ((u.first || '').charAt(0) + (u.last || '').charAt(0))).toUpperCase(); },
    label(u, short) { const n = [u.first, u.last].filter(Boolean).join(' ') || u.initials || '?'; const r = this.role(u); return short ? n : n + (r ? ' (' + r.toLowerCase() + ')' : ''); },
    /** ligne « participants » d'un staff, d'après l'annuaire et le texte libre */
    /** v5.2 — personnes du staff : celles cochées, sinon (staff jamais réglé) les membres habituels de la réunion, comme « Préparer » */
    idsOf(m) { const U = this.dir.users || []; return m.participantIds || (U.length && !m.participants ? U.filter(u => u.rcp).map(u => u.id) : []); },
    participantsText(m) { const ids = m.participantIds || []; const names = ids.map(id => this.byId(id)).filter(Boolean).map(u => this.label(u)); if (m.participantsExtra) names.push(m.participantsExtra); return names.join(', '); },
  };
  SV.People = People;

  const M = {
    /** fenêtre « Utilisateurs » : annuaire partagé de la bibliothèque, choix de l'utilisateur du poste */
    async peopleDialog() {
      await People.load();
      const m = h('div', 'modal'), card = h('div', 'modal-card wide people'); m.appendChild(card); document.body.appendChild(m);
      let rows = JSON.parse(JSON.stringify(People.dir.users)), me = lsGet(LS_ME);
      const roleSel = u => `<select data-k="role">${ROLES.map(r => `<option${u.role === r ? ' selected' : ''}>${r}</option>`).join('')}<option value="autre"${u.role === 'autre' ? ' selected' : ''}>autre…</option></select>${u.role === 'autre' ? `<input data-k="roleOther" value="${esc(u.roleOther || '')}" placeholder="fonction">` : ''}`;
      const draw = () => {
        card.innerHTML = `<div class="modal-head"><span>Utilisateurs de la bibliothèque</span><button class="close">✕</button></div>
          <div class="help"><div class="hint">Annuaire commun à tous les postes qui ouvrent ${esc(L.describe())}. « Moi » : l’utilisateur de ce poste (ses initiales signent le journal des dossiers). « Staff » : proposé d’office comme participant des RCP.</div>
          <table class="ppl-t"><tr><th>moi</th><th>Prénom</th><th>Nom</th><th>Fonction</th><th>Initiales</th><th title="participant habituel des staffs">staff</th><th></th></tr>
          ${rows.map((u, i) => `<tr data-i="${i}"><td><input type="radio" name="pplMe" ${u.id === me ? 'checked' : ''}></td><td><input data-k="first" value="${esc(u.first || '')}"></td><td><input data-k="last" value="${esc(u.last || '')}"></td><td class="ppl-role">${roleSel(u)}</td><td><input data-k="initials" value="${esc(u.initials || '')}" style="width:60px" placeholder="${esc(People.initialsOf(u))}"></td><td><input type="checkbox" data-k="rcp"${u.rcp ? ' checked' : ''}></td><td><b class="x" data-rm="${i}" title="retirer de l’annuaire">✕</b></td></tr>`).join('')}</table>
          <button class="mini-btn" data-a="add">+ utilisateur</button></div>
          <div class="modal-foot"><button class="primary ok">Enregistrer</button><button class="cancel">Annuler</button></div>`;
        card.querySelectorAll('tr[data-i]').forEach(tr => { const u = rows[+tr.dataset.i];
          tr.querySelectorAll('[data-k]').forEach(el => { el[el.type === 'checkbox' || el.tagName === 'SELECT' ? 'onchange' : 'oninput'] = () => { u[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value; if (el.dataset.k === 'role') draw(); }; });
          tr.querySelector('[name=pplMe]').onchange = () => { me = u.id; };
        });
        card.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { rows.splice(+b.dataset.rm, 1); draw(); });
        card.querySelector('[data-a=add]').onclick = () => { rows.push({ id: SV.Store.uid('U'), first: '', last: '', role: 'Neurologue', initials: '', rcp: true }); draw(); const ins = card.querySelectorAll('tr[data-i] [data-k=first]'); if (ins.length) ins[ins.length - 1].focus(); };
        card.querySelector('.close').onclick = card.querySelector('.cancel').onclick = () => m.remove();
        card.querySelector('.ok').onclick = async () => {
          rows = rows.filter(u => u.first || u.last || u.initials); rows.forEach(u => { u.initials = (u.initials || People.initialsOf(u)).toUpperCase(); });
          try { await People.update(dir => { const keep = new Map(rows.map(u => [u.id, u])); dir.users = dir.users.filter(u => keep.has(u.id)).map(u => keep.get(u.id)).concat(rows.filter(u => !dir.users.some(x => x.id === u.id))); }); }
          catch (e) { this.toast('Annuaire non enregistré : ' + e.message, 6000); return; }
          if (me) People.setMe(me); m.remove(); this.toast('Annuaire enregistré (' + People.dir.users.length + ' utilisateur' + (People.dir.users.length > 1 ? 's' : '') + ')', 2500);
          if (this.ui.screen === 'patients' && this.renderPatients) this.renderPatients(); if (this.ui.screen === 'staff' && this.renderStaff) this.renderStaff();
        };
      };
      draw();
    },
    /** participants d'un staff en pastilles : annuaire (clic : présent / absent), texte libre pour les autres */
    peopleChips(host, m, onChange) {
      const U0 = People.dir.users; if (!m.participantIds) { m.participantIds = People.idsOf(m); if (m.participantIds.length && !m.participants) m.participants = People.participantsText(m); }   // v5.2 : la ligne lisible suit les membres habituels cochés d'office
      const draw = () => {
        const on = new Set(m.participantIds), list = U0.slice().sort((a, b) => (b.rcp - a.rcp) || String(a.last || '').localeCompare(String(b.last || ''), 'fr'));
        host.innerHTML = `${list.map(u => `<button class="pchip-p${on.has(u.id) ? ' on' : ''}" data-u="${esc(u.id)}" title="${esc(People.label(u))}">${esc(People.label(u, true))}<small>${esc(People.role(u))}</small></button>`).join('')}
          <input class="ppl-extra" value="${esc(m.participantsExtra != null ? m.participantsExtra : (U0.length ? '' : m.participants || ''))}" placeholder="${U0.length ? 'autres participants…' : 'participants (annuaire : ⋯ › Utilisateurs)'}"><button class="mini-btn" data-a="ppl" title="annuaire des utilisateurs (nom, fonction, participants habituels)">annuaire…</button>`;
        host.querySelectorAll('[data-u]').forEach(b => b.onclick = () => { const id = b.dataset.u, s = new Set(m.participantIds); if (s.has(id)) s.delete(id); else s.add(id); m.participantIds = [...s]; m.participants = People.participantsText(m); onChange(); draw(); });
        host.querySelector('.ppl-extra').oninput = e => { m.participantsExtra = e.target.value; m.participants = People.participantsText(m); onChange(); };
        host.querySelector('[data-a=ppl]').onclick = () => this.peopleDialog();
      };
      draw();
    },
  };
  Object.assign(A, M);
  // l'annuaire suit la bibliothèque : relu à l'ouverture, au choix d'un répertoire, au retour au stockage du navigateur
  for (const k of ['init', 'reopen', 'chooseFolder', 'useBrowser']) SV.Hooks.wrap(L, k, async function (orig) { const r = await orig(); try { await People.load(); } catch (e) { } return r; }, 'people');
  People.load();
})(window.SV = window.SV || {});
