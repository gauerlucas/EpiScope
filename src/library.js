/* EpiScope — library.js : bibliothèque des dossiers patients (stockage), dans le navigateur.
 *
 * Deux modes, même interface :
 *   - « dossier » : un répertoire choisi par l'utilisateur (disque local, partage réseau du service, dossier synchronisé)
 *     via l'API File System Access (Chrome, Edge). Un sous-répertoire par patient :
 *         <bibliothèque>/<pseudonyme>/dossier.json · journal dans dossier.json · imaging/*.nii.gz · derivatives/… · .lock
 *   - « navigateur » : IndexedDB du poste (repli : Firefox, ou avant d'avoir choisi un répertoire).
 * Un dossier s'exporte en un seul fichier <pseudonyme>.episcope (archive ZIP : dossier.json + fichiers ; « léger » =
 * sans les images d'origine) qu'un collègue ouvre dans sa copie d'EpiScope (Importer), par mail ou clé USB.
 * Écriture : dossier.json est réécrit en entier (écriture atomique de l'API) après vérification de la révision sur
 * disque ; si un autre poste a enregistré entre-temps, notre version est mise de côté (dossier.conflict-*.json)
 * au lieu d'écraser la sienne. Un verrou (.lock) signale qu'un dossier est ouvert ailleurs.
 * v1.0.1 — rien ne se perd : avant chaque réécriture, l'état précédent peut être rangé dans history/ (history.js :
 * motifs, espacement, rétention) ; un fichier retiré du dossier va dans trash/<chemin> (restaurable avec l'objet
 * depuis la corbeille du dossier, store.js) ; un patient supprimé est marqué « deleted » et caché, purgé seulement
 * depuis la corbeille de la bibliothèque. Un dossier écrit par une version plus récente s'ouvre en lecture seule.   */
(function (SV) {
  'use strict';
  const S = SV.Store, enc = new TextEncoder(), dec = new TextDecoder();
  const DB_NAME = 'episcope', DB_VER = 2;   // v2 : magasin « history »
  const SESSION = Math.random().toString(36).slice(2, 10);
  const H = SV.History, TRASH = 'trash';
  const replacer = (k, v) => k === '_base' || k === '_snap' || k === '_readonly' || k === '_migrated' ? undefined : v;
  const appVersion = () => (window.EPISCOPE_BRAND && window.EPISCOPE_BRAND.version) || '0.0.0';
  const appBuild = () => (window.EPISCOPE_BRAND && window.EPISCOPE_BRAND.build) || '';
  const sanitize = s => (String(s || 'patient').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\w\-. ]+/g, '_').trim().slice(0, 60) || 'patient');

  // ---------------------------------------------------------------- IndexedDB minimal
  let _db = null;
  function idb() {
    if (_db) return _db;
    const p = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, DB_VER);
      r.onupgradeneeded = () => { const db = r.result; for (const s of ['dossiers', 'files', 'meta', 'history']) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s); };
      // connexion fermée par le navigateur (autre onglet, stockage réinitialisé) : rouverte à la transaction suivante
      r.onsuccess = () => { const db = r.result; db.onclose = () => { if (_db === p) _db = null; }; db.onversionchange = () => { try { db.close(); } catch (e) { /* déjà fermée */ } if (_db === p) _db = null; }; res(db); };
      r.onerror = () => { if (_db === p) _db = null; rej(r.error); };
    });
    return _db = p;
  }
  async function tx(store, mode, fn, again) {
    const db = await idb(); let t;
    try { t = db.transaction(store, mode); } catch (e) { if (!again && e && e.name === 'InvalidStateError') { _db = null; return tx(store, mode, fn, true); } throw e; }
    return new Promise((res, rej) => { const s = t.objectStore(store); let out; const r = fn(s); if (r && 'onsuccess' in r) r.onsuccess = () => { out = r.result; }; t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
  }
  const idbGet = (store, key) => tx(store, 'readonly', s => s.get(key));
  const idbPut = (store, key, v) => tx(store, 'readwrite', s => s.put(v, key));
  const idbDel = (store, key) => tx(store, 'readwrite', s => s.delete(key));
  const idbKeys = store => tx(store, 'readonly', s => s.getAllKeys());

  // ---------------------------------------------------------------- répertoires (File System Access)
  async function dirAt(root, path, create) { let d = root; for (const p of path.split('/').filter(Boolean)) d = await d.getDirectoryHandle(p, { create: !!create }); return d; }
  async function fileHandle(root, path, create) { const parts = path.split('/').filter(Boolean), name = parts.pop(); const d = await dirAt(root, parts.join('/'), create); return d.getFileHandle(name, { create: !!create }); }
  async function writeFileAt(root, path, data) { const fh = await fileHandle(root, path, true), w = await fh.createWritable(); await w.write(data); await w.close(); }
  async function readFileAt(root, path) { try { return await (await fileHandle(root, path, false)).getFile(); } catch (e) { return null; } }
  async function removeAt(root, path) { const parts = path.split('/').filter(Boolean), name = parts.pop(); const dir = await dirAt(root, parts.join('/')); await dir.removeEntry(name); }
  /** déplace un fichier (API move si disponible, sinon copie puis suppression) */
  async function moveAt(root, from, to) {
    const src = await fileHandle(root, from, false), parts = to.split('/').filter(Boolean), name = parts.pop(), dst = await dirAt(root, parts.join('/'), true);
    if (typeof src.move === 'function') { try { await src.move(dst, name); return; } catch (e) { /* repli : copie */ } }
    await writeFileAt(root, to, await src.getFile()); await removeAt(root, from);
  }
  async function listTree(dir, prefix, out) { out = out || []; for await (const [name, h] of dir.entries()) { const p = prefix ? prefix + '/' + name : name; if (h.kind === 'directory') await listTree(h, p, out); else out.push(p); } return out; }

  /** v1.1.0 : nom du répertoire d'un nouveau patient = « sub-<code> » (BIDS), jamais le pseudonyme saisi (qui peut être un nom) ;
   *  les répertoires existants gardent leur nom (renommage avec la disposition BIDS) */
  const dirName = d => d.subject && d.subject.label ? 'sub-' + d.subject.label : 'patient-' + String(d.id).replace(/[^\w-]/g, '');
  const Library = {
    mode: 'browser', root: null, rootName: '', dirs: new Map(), pendingHandle: null, onchange: null,
    get user() { try { return localStorage.getItem('sv_user') || ''; } catch (e) { return ''; } },
    set user(v) { try { localStorage.setItem('sv_user', v || ''); } catch (e) { } S.user = v || ''; },
    supportsFolder() { return typeof window.showDirectoryPicker === 'function'; },

    /** au démarrage : répertoire mémorisé (il faudra peut-être redemander l'autorisation par un clic) */
    async init() {
      S.user = this.user;
      try {
        const h = await idbGet('meta', 'root');
        if (h && h.kind === 'directory') {
          const p = h.queryPermission ? await h.queryPermission({ mode: 'readwrite' }) : 'prompt';
          if (p === 'granted') { this.mode = 'folder'; this.root = h; this.rootName = h.name; }
          else this.pendingHandle = h;
        }
      } catch (e) { console.warn('bibliothèque : ', e); }
      return this.mode;
    },
    /** redemande l'autorisation sur le répertoire mémorisé (appel depuis un clic) */
    async reopen() {
      const h = this.pendingHandle; if (!h) return false;
      const p = await h.requestPermission({ mode: 'readwrite' });
      if (p !== 'granted') return false;
      this.mode = 'folder'; this.root = h; this.rootName = h.name; this.pendingHandle = null; this.dirs.clear(); return true;
    },
    async chooseFolder() {
      if (!this.supportsFolder()) throw new Error('ce navigateur ne permet pas de choisir un répertoire (utilisez Chrome ou Edge)');
      const h = await window.showDirectoryPicker({ id: 'episcope-library', mode: 'readwrite' });
      this.mode = 'folder'; this.root = h; this.rootName = h.name; this.pendingHandle = null; this.dirs.clear();
      try { await idbPut('meta', 'root', h); } catch (e) { }
      return h.name;
    },
    async useBrowser() { this.mode = 'browser'; this.root = null; this.rootName = ''; this.dirs.clear(); try { await idbDel('meta', 'root'); } catch (e) { } },
    describe() { return this.mode === 'folder' ? 'Répertoire « ' + this.rootName + ' »' : 'Ce navigateur (stockage local du poste)'; },

    // ------------------------------------------------------------ réglages de la bibliothèque (v1.1.0)
    /** episcope_library.json à la racine (répertoire) ou meta/library (navigateur) : préfixe de site des codes de sujet,
     *  nombre de chiffres, nom du centre, compteur. null si la bibliothèque n'a pas encore été initialisée. */
    async settings() {
      try {
        if (this.mode === 'folder') { const f = await readFileAt(this.root, 'episcope_library.json'); return f ? JSON.parse(await f.text()) : null; }
        return (await idbGet('meta', 'library')) || null;
      } catch (e) { console.warn('réglages de la bibliothèque', e); return null; }
    },
    async saveSettings(st) {
      st = Object.assign({ format: 'episcope-library', v: 1, site: 'HFAR', digits: 4, center: '', next: 1, created: S.now() }, st, { site: S.cleanSite(st.site) || 'HFAR', updated: S.now() });
      if (this.mode === 'folder') {
        await writeFileAt(this.root, 'episcope_library.json', new Blob([JSON.stringify(st, null, 1)]));
        // racine d'un jeu BIDS : description et liste des zones propres à EpiScope (écrites une fois, jamais écrasées)
        if (!(await readFileAt(this.root, 'dataset_description.json'))) await writeFileAt(this.root, 'dataset_description.json', new Blob([JSON.stringify({ Name: st.center ? 'EpiScope — ' + st.center : 'Bibliothèque EpiScope', BIDSVersion: SV.BIDS ? SV.BIDS.VERSION : '1.10.0', DatasetType: 'raw', GeneratedBy: [{ Name: 'EpiScope' }] }, null, 1)]));
        if (!(await readFileAt(this.root, '.bidsignore'))) await writeFileAt(this.root, '.bidsignore', new Blob(['episcope_library.json\n*/dossier.json\n*/dossier.conflict-*\n*/.lock\n*/history/\n*/trash/\n*/ieeg/\n*/imaging/\n*/gallery/\n*/attachments/\nexports/\n*/staff/\n*/derivatives/\n']));
      } else await idbPut('meta', 'library', st);
      return st;
    },
    /** fichier à la racine de la bibliothèque (répertoire seulement : rapports d'export…) ; navigateur : rien */
    async writeRootFile(path, data) { if (this.mode !== 'folder') return false; await writeFileAt(this.root, path, data instanceof Blob ? data : new Blob([data])); return true; },
    /** codes déjà attribués dans la bibliothèque (corbeille comprise) */
    async subjectsInUse() {
      const all = (await this.list()).concat(await this.list({ deleted: true }));
      return all.filter(x => x.subject).map(x => ({ id: x.id, label: x.subject, n: x.subjectN, site: x.site }));
    },
    /** prochain code de sujet : max(compteur, plus grand numéro déjà attribué pour ce préfixe + 1), compteur avancé aussitôt
     *  (répertoire partagé : relu juste avant, le contrôle des doublons à la liste rattrape un attribution simultanée) */
    async nextSubject() {
      let st = await this.settings(); if (!st) st = await this.saveSettings({});
      const used = await this.subjectsInUse(), mx = Math.max(0, ...used.filter(u => u.site === st.site).map(u => u.n || 0));
      const n = Math.max(st.next || 1, mx + 1); await this.saveSettings(Object.assign(st, { next: n + 1 }));
      return S.makeSubject(st.site, n, st.digits);
    },

    // ------------------------------------------------------------ dossiers
    /** dossiers de la bibliothèque ; opts.deleted : ceux de la corbeille de la bibliothèque */
    async list(opts) {
      const out = [];
      if (this.mode === 'folder') {
        this.dirs.clear();
        for await (const [name, h] of this.root.entries()) {
          if (h.kind !== 'directory' || name.startsWith('.')) continue;
          try { const f = await (await h.getFileHandle('dossier.json')).getFile(); const d = JSON.parse(await f.text()); if (d.format !== 'episcope-dossier') continue; this.dirs.set(d.id, name); if (!!d.deleted !== !!(opts && opts.deleted)) continue; out.push(Object.assign(S.summary(d), { dir: name, lock: await this.lockInfo(d.id), deleted: d.deleted || null })); } catch (e) { }
        }
      } else {
        for (const k of await idbKeys('dossiers')) { const d = await idbGet('dossiers', k); if (d && d.format === 'episcope-dossier' && !!d.deleted === !!(opts && opts.deleted)) out.push(Object.assign(S.summary(d), { deleted: d.deleted || null })); }
      }
      return out.sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
    },
    async dirOf(id, create, pseudo) {
      if (this.dirs.has(id)) return this.root.getDirectoryHandle(this.dirs.get(id), { create: !!create });
      if (!this.dirs.size) await this.list();
      if (this.dirs.has(id)) return this.root.getDirectoryHandle(this.dirs.get(id), { create: !!create });
      if (!create) throw new Error('dossier introuvable dans la bibliothèque');
      let name = sanitize(pseudo), k = 1; const used = new Set(this.dirs.values());
      // un répertoire du même nom peut exister (autre patient) : suffixe
      for (;;) { let taken = used.has(name); if (!taken) { try { const h = await this.root.getDirectoryHandle(name); const f = await (await h.getFileHandle('dossier.json')).getFile(); const d = JSON.parse(await f.text()); taken = d.id !== id; } catch (e) { taken = false; } } if (!taken) break; name = sanitize(pseudo) + '_' + (++k); }
      this.dirs.set(id, name); return this.root.getDirectoryHandle(name, { create: true });
    },
    /** dossier.json tel qu'il est sur le disque, sans conversion (essai à blanc d'une migration) */
    async loadRaw(id) {
      if (this.mode === 'folder') { const dir = await this.dirOf(id); const f = await (await dir.getFileHandle('dossier.json')).getFile(); return JSON.parse(await f.text()); }
      return JSON.parse(JSON.stringify(await idbGet('dossiers', id)));
    },
    async load(id) {
      let d;
      if (this.mode === 'folder') { const dir = await this.dirOf(id); const f = await (await dir.getFileHandle('dossier.json')).getFile(); d = JSON.parse(await f.text()); }
      else d = await idbGet('dossiers', id);
      if (!d) throw new Error('dossier introuvable');
      d = S.normalize(d); d._base = d.revision || 0; d._readonly = !!(d.minReader && S.cmpVersion(d.minReader, appVersion()) > 0); return d;
    },
    /** enregistre ; renvoie {ok, conflict?, readonly?, snapshot?} — en cas de conflit, notre version est mise de côté sans
     *  écraser ; l'état précédent est rangé dans history/ selon History.due (motif d._snap, ouverture, toutes les 10 min) */
    async save(d) {
      if (d._readonly) return { ok: false, readonly: true };
      const prevBase = d._base || 0, reason0 = d._snap || null; d.updated = S.now(); d.revision = (d.revision || 0) + 1;
      d.writer = { app: appVersion(), build: appBuild() };
      try { S.stampAll(d); } catch (e) { console.warn('heures absolues', e); }   // v1.1.0 : heure absolue des marques, début absolu des crises
      const json = JSON.stringify(d, replacer); let prevTxt = null, snapshot = null;
      if (this.mode === 'folder') {
        const dir = await this.dirOf(d.id, true, dirName(d));
        let disk = null; try { prevTxt = await (await (await dir.getFileHandle('dossier.json')).getFile()).text(); disk = JSON.parse(prevTxt); } catch (e) { prevTxt = null; }
        if (disk && disk.id === d.id && (disk.revision || 0) > prevBase) {
          const name = 'dossier.conflict-' + sanitize(this.user || 'poste') + '-' + Date.now().toString(36) + '.json';
          const fh = await dir.getFileHandle(name, { create: true }), w = await fh.createWritable(); await w.write(json); await w.close();
          d.revision = prevBase; return { ok: false, conflict: true, file: name, diskRevision: disk.revision, diskUpdated: disk.updated };
        }
        if (disk && disk.id === d.id) snapshot = await this.snapshot(d, prevTxt, disk, reason0);
        const fh = await dir.getFileHandle('dossier.json', { create: true }), w = await fh.createWritable(); await w.write(json); await w.close();
      } else {
        const disk = await idbGet('dossiers', d.id); if (disk) snapshot = await this.snapshot(d, JSON.stringify(disk), disk, reason0);
        await idbPut('dossiers', d.id, JSON.parse(json));
      }
      if (d._snap === reason0) delete d._snap;
      d._base = d.revision; return { ok: true, snapshot };
    },

    // ------------------------------------------------------------ historique des révisions (history/)
    _lastSnap: new Map(),
    /** range l'état précédent (texte JSON) si History.due le demande ; renvoie le nom écrit ou null */
    async snapshot(d, prevTxt, prev, reason, force) {
      if (!H || !prevTxt) return null;
      const why = force ? reason : H.due(reason, this._lastSnap.has(d.id) ? this._lastSnap.get(d.id) : null, Date.now()); if (!why) return null;
      const name = H.name(prev.revision || 0, prev.updated, why);
      try {
        const gz = await H.gzip(prevTxt);
        if (this.mode === 'folder') await writeFileAt(await this.dirOf(d.id, true, dirName(d)), H.DIR + '/' + name, new Blob([gz]));
        else await idbPut('history', d.id + '/' + name, new Blob([gz]));
        this._lastSnap.set(d.id, Date.now()); await this.pruneHistory(d);
        return name;
      } catch (e) { console.warn('historique : instantané impossible', e); return null; }
    },
    /** point de restauration volontaire : l'état enregistré actuel, motif « manual » */
    async restorePoint(d) {
      const r = await this.save(d); if (!r.ok) return r;
      const txt = JSON.stringify(d, replacer), name = await this.snapshot(d, txt, d, 'manual', true); return { ok: !!name, name };
    },
    /** révisions rangées : [{ name, rev, t, reason, pinned, size }] (plus récentes d'abord) */
    async listHistory(d) {
      let names = [], sizes = {};
      if (this.mode === 'folder') { try { const dir = await dirAt(await this.dirOf(d.id), H.DIR); for await (const [n, h] of dir.entries()) if (h.kind === 'file') { names.push(n); try { sizes[n] = (await h.getFile()).size; } catch (e) { } } } catch (e) { names = []; } }
      else { const pre = d.id + '/'; names = (await idbKeys('history')).map(String).filter(k => k.startsWith(pre)).map(k => k.slice(pre.length)); }
      return names.map(n => { const p = H.parse(n); return p && Object.assign(p, { size: sizes[n] || null }); }).filter(Boolean).sort((a, b) => b.ms - a.ms || b.rev - a.rev);
    },
    /** relit une révision rangée (objet dossier normalisé, jamais enregistré tel quel) */
    async readHistory(d, name) {
      let b = null;
      if (this.mode === 'folder') b = await readFileAt(await this.dirOf(d.id), H.DIR + '/' + name); else b = await idbGet('history', d.id + '/' + name);
      if (!b) throw new Error('révision introuvable : ' + name);
      return S.normalize(JSON.parse(await H.gunzip(new Uint8Array(await b.arrayBuffer()))));
    },
    /** rétention (History.keep) : supprime les révisions devenues inutiles */
    async pruneHistory(d) {
      const L = await this.listHistory(d), keep = H.keep(L.map(x => x.name), Date.now());
      for (const x of L) if (!keep.has(x.name)) { try { if (this.mode === 'folder') await removeAt(await this.dirOf(d.id), H.DIR + '/' + x.name); else await idbDel('history', d.id + '/' + x.name); } catch (e) { } }
    },

    /** v1.0.1 : supprimer un patient = le mettre dans la corbeille de la bibliothèque (dossier marqué, caché de la liste) */
    async remove(id) {
      const d = await this.load(id); d.deleted = { at: S.now(), by: this.user || '' }; d._snap = 'trash'; d._base = d.revision || 0; d._readonly = false;
      const r = await this.save(d); if (!r.ok) throw new Error(r.conflict ? 'dossier modifié ailleurs entre-temps : réessayer' : 'enregistrement impossible');
      return d.deleted;
    },
    async undelete(id) { const d = await this.load(id); delete d.deleted; d._base = d.revision || 0; d._readonly = false; S.log(d, 'restore', 'dossier', d.id, 'sorti de la corbeille', this.user); await this.save(d); return d; },
    /** suppression définitive d'un patient de la corbeille (répertoire et fichiers) */
    async purge(id) {
      if (this.mode === 'folder') { if (!this.dirs.size) await this.list(); const name = this.dirs.get(id); if (name) await this.root.removeEntry(name, { recursive: true }); this.dirs.delete(id); }
      else { await idbDel('dossiers', id); for (const st of ['files', 'history']) for (const k of await idbKeys(st)) if (String(k).startsWith(id + '/')) await idbDel(st, k); }
    },

    // ------------------------------------------------------------ fichiers d'un dossier (images, dérivés)
    async writeFile(d, path, data) {
      const blob = data instanceof Blob ? data : new Blob([typeof data === 'string' ? enc.encode(data) : data]);
      if (this.mode === 'folder') { const dir = await this.dirOf(d.id, true, dirName(d)); await writeFileAt(dir, path, blob); }
      else await idbPut('files', d.id + '/' + path, blob);
    },
    async readFile(d, path) {
      if (this.mode === 'folder') { try { const dir = await this.dirOf(d.id); return await readFileAt(dir, path); } catch (e) { return null; } }
      const b = await idbGet('files', d.id + '/' + path); return b || null;
    },
    async readBytes(d, path) { const b = await this.readFile(d, path); return b ? new Uint8Array(await b.arrayBuffer()) : null; },
    async listFiles(d) {
      if (this.mode === 'folder') { try { const dir = await this.dirOf(d.id); return (await listTree(dir, '')).filter(p => p !== 'dossier.json'); } catch (e) { return []; } }
      const pre = d.id + '/'; return (await idbKeys('files')).map(String).filter(k => k.startsWith(pre)).map(k => k.slice(pre.length));
    },
    /** v1.0.1 : un fichier retiré va dans trash/<chemin> (restaurable avec l'objet qui le cite, voir store.restoreTrash) */
    async removeFile(d, path) {
      if (!path || path.startsWith(TRASH + '/')) return;
      if (this.mode === 'folder') { try { await moveAt(await this.dirOf(d.id), path, TRASH + '/' + path); } catch (e) { } }
      else { const k = d.id + '/' + path, b = await idbGet('files', k); if (b) { await idbPut('files', d.id + '/' + TRASH + '/' + path, b); await idbDel('files', k); } }
    },
    /** v1.1.0 : renomme un fichier du dossier (noms BIDS) ; refuse d'écraser un fichier existant */
    async renameFile(d, from, to) {
      if (!from || !to || from === to) return;
      if (await this.readFile(d, to)) throw new Error('déjà présent : ' + to);
      if (this.mode === 'folder') { await moveAt(await this.dirOf(d.id), from, to); return; }
      const b = await idbGet('files', d.id + '/' + from); if (!b) throw new Error('absent : ' + from);
      await idbPut('files', d.id + '/' + to, b); await idbDel('files', d.id + '/' + from);
    },
    /** remet en place les fichiers d'une entrée de corbeille restaurée ; renvoie ceux qui manquent */
    async restoreFiles(d, paths) {
      const missing = [];
      for (const p of paths || []) {
        if (await this.readFile(d, p)) continue;
        try { if (this.mode === 'folder') await moveAt(await this.dirOf(d.id), TRASH + '/' + p, p); else { const b = await idbGet('files', d.id + '/' + TRASH + '/' + p); if (!b) throw new Error('absent'); await idbPut('files', d.id + '/' + p, b); await idbDel('files', d.id + '/' + TRASH + '/' + p); } }
        catch (e) { missing.push(p); }
      }
      return missing;
    },
    /** efface définitivement des fichiers de trash/ (corbeille vidée) */
    async purgeFiles(d, paths) {
      for (const p of paths || []) { try { if (this.mode === 'folder') await removeAt(await this.dirOf(d.id), TRASH + '/' + p); else await idbDel('files', d.id + '/' + TRASH + '/' + p); } catch (e) { } }
    },

    // ------------------------------------------------------------ verrou (répertoire partagé)
    async lockInfo(id) {
      if (this.mode !== 'folder') return null;
      try { const dir = await this.dirOf(id); const f = await readFileAt(dir, '.lock'); if (!f) return null; const L = JSON.parse(await f.text()); if (L.session === SESSION) return null; if (Date.now() - Date.parse(L.t) > 30 * 60000) return null; return L; } catch (e) { return null; }
    },
    async lock(d) { if (this.mode !== 'folder') return; try { const dir = await this.dirOf(d.id, true, dirName(d)); await writeFileAt(dir, '.lock', JSON.stringify({ user: this.user || 'poste', t: S.now(), session: SESSION })); } catch (e) { } },
    async unlock(d) { if (this.mode !== 'folder' || !d) return; try { const dir = await this.dirOf(d.id); const f = await readFileAt(dir, '.lock'); if (f) { const L = JSON.parse(await f.text()); if (L.session === SESSION) await dir.removeEntry('.lock'); } } catch (e) { } },

    // ------------------------------------------------------------ archive portable .episcope
    async exportBundle(d, opts) {
      // v1.1.0 : anon → copie anonymisée (S.anonymize), en-têtes EDF/BDF anonymisés, vidéos laissées de côté (visages),
      // historique et corbeille exclus comme toujours (bundlePolicy) ; skipped = fichiers non inclus
      const light = !!(opts && opts.light), anon = !!(opts && opts.anon), files = [], skipped = [], src = d; if (anon) d = S.anonymize(d);
      const meta = { format: 'episcope-bundle', schema: S.SCHEMA, created: S.now(), light, anon, by: anon ? '' : (this.user || ''), app: (window.EPISCOPE_BRAND && window.EPISCOPE_BRAND.name) || 'EpiScope', patient: anon ? S.subjectLabel(d) : S.displayName(d) };
      const vids = new Set(anon ? (d.gallery || []).filter(g => /^video\//.test(g.mime || '')).flatMap(g => [g.file]) : []);
      for (const p of await this.listFiles(src)) {
        if (!S.bundlePolicy(p, light)) continue; if (vids.has(p)) { skipped.push(p); continue; }
        let b = await this.readFile(src, p); if (!b) continue;
        if (anon && /\.(edf|bdf)$/i.test(p)) b = SV.BIDS.edfAnon(new Uint8Array(await b.arrayBuffer()));
        files.push({ name: p, data: b });
      }
      if (anon && vids.size) d.gallery = d.gallery.map(g => vids.has(g.file) ? Object.assign({}, g, { file: '', missing: 'vidéo non incluse (export anonymisé)' }) : g);
      meta.skipped = skipped.length;
      files.unshift({ name: 'dossier.json', data: JSON.stringify(d, replacer) }); files.unshift({ name: 'episcope.json', data: JSON.stringify(meta, null, 1) });
      return SV.Zip.write(files);
    },
    /** lit une archive .episcope ; renvoie {dossier, meta, files: Map(path → () => Promise<Uint8Array>)} sans l'importer */
    async readBundle(blob) {
      const z = await SV.Zip.read(blob);
      if (!z.has('dossier.json')) throw new Error('archive sans dossier.json : ce n’est pas un dossier EpiScope');
      const d = S.normalize(JSON.parse(await z.text('dossier.json'))), meta = z.has('episcope.json') ? JSON.parse(await z.text('episcope.json')) : {};
      const files = new Map(); for (const n of z.names) if (n !== 'dossier.json' && n !== 'episcope.json') files.set(n, () => z.bytes(n));
      return { dossier: d, meta, files };
    },
    /** importe une archive dans la bibliothèque courante ; mode 'replace' | 'copy' (nouvel identifiant) */
    async importBundle(bundle, mode) {
      const d = bundle.dossier;
      if (mode === 'copy') { d.id = S.uid('P'); d.patient.pseudo = d.patient.pseudo + ' (copie)'; }
      S.log(d, 'import', 'dossier', d.id, 'importé' + (bundle.meta.by ? ' (envoyé par ' + bundle.meta.by + ')' : ''), this.user);
      if (this.mode === 'folder') { const dir = await this.dirOf(d.id, true, dirName(d)); try { await dir.removeEntry('.lock'); } catch (e) { } }
      // la version locale remplacée est d'abord rangée dans l'historique (motif « import »)
      if (mode !== 'copy' && await this.exists(d.id)) { try { const loc = await this.load(d.id); await this.snapshot(d, JSON.stringify(loc, replacer), loc, 'import', true); } catch (e) { console.warn(e); } }
      d._base = Infinity; d.revision = Math.max(d.revision || 0, 0); // l'import remplace la version locale
      if (this.mode === 'folder') { const dir = await this.dirOf(d.id, true, dirName(d)); await writeFileAt(dir, 'dossier.json', new Blob([JSON.stringify(d, replacer)])); }
      else await idbPut('dossiers', d.id, JSON.parse(JSON.stringify(d, replacer)));
      d._base = d.revision;
      for (const [p, get] of bundle.files) await this.writeFile(d, p, await get());
      return d;
    },
    async exists(id) { if (this.mode === 'folder') { if (!this.dirs.size) await this.list(); return this.dirs.has(id); } return !!(await idbGet('dossiers', id)); },
  };

  SV.Library = Library;
})(window.SV = window.SV || {});
