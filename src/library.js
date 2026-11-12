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
 * au lieu d'écraser la sienne. Un verrou (.lock) signale qu'un dossier est ouvert ailleurs.                       */
(function (SV) {
  'use strict';
  const S = SV.Store, enc = new TextEncoder(), dec = new TextDecoder();
  const DB_NAME = 'episcope', DB_VER = 1;
  const SESSION = Math.random().toString(36).slice(2, 10);
  const sanitize = s => (String(s || 'patient').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\w\-. ]+/g, '_').trim().slice(0, 60) || 'patient');

  // ---------------------------------------------------------------- IndexedDB minimal
  let _db = null;
  function idb() {
    if (_db) return _db;
    const p = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, DB_VER);
      r.onupgradeneeded = () => { const db = r.result; for (const s of ['dossiers', 'files', 'meta']) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s); };
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
  async function listTree(dir, prefix, out) { out = out || []; for await (const [name, h] of dir.entries()) { const p = prefix ? prefix + '/' + name : name; if (h.kind === 'directory') await listTree(h, p, out); else out.push(p); } return out; }

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

    // ------------------------------------------------------------ dossiers
    async list() {
      const out = [];
      if (this.mode === 'folder') {
        this.dirs.clear();
        for await (const [name, h] of this.root.entries()) {
          if (h.kind !== 'directory' || name.startsWith('.')) continue;
          try { const f = await (await h.getFileHandle('dossier.json')).getFile(); const d = JSON.parse(await f.text()); if (d.format !== 'episcope-dossier') continue; this.dirs.set(d.id, name); out.push(Object.assign(S.summary(d), { dir: name, lock: await this.lockInfo(d.id) })); } catch (e) { }
        }
      } else {
        for (const k of await idbKeys('dossiers')) { const d = await idbGet('dossiers', k); if (d && d.format === 'episcope-dossier') out.push(S.summary(d)); }
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
    async load(id) {
      let d;
      if (this.mode === 'folder') { const dir = await this.dirOf(id); const f = await (await dir.getFileHandle('dossier.json')).getFile(); d = JSON.parse(await f.text()); }
      else d = await idbGet('dossiers', id);
      if (!d) throw new Error('dossier introuvable');
      d = S.normalize(d); d._base = d.revision || 0; return d;
    },
    /** enregistre ; renvoie {ok, conflict?} — en cas de conflit, notre version est mise de côté sans écraser */
    async save(d) {
      const prevBase = d._base || 0; d.updated = S.now(); d.revision = (d.revision || 0) + 1;
      const json = JSON.stringify(d, (k, v) => k === '_base' ? undefined : v);
      if (this.mode === 'folder') {
        const dir = await this.dirOf(d.id, true, d.patient.pseudo);
        let disk = null; try { disk = JSON.parse(await (await (await dir.getFileHandle('dossier.json')).getFile()).text()); } catch (e) { }
        if (disk && disk.id === d.id && (disk.revision || 0) > prevBase) {
          const name = 'dossier.conflict-' + sanitize(this.user || 'poste') + '-' + Date.now().toString(36) + '.json';
          const fh = await dir.getFileHandle(name, { create: true }), w = await fh.createWritable(); await w.write(json); await w.close();
          d.revision = prevBase; return { ok: false, conflict: true, file: name, diskRevision: disk.revision, diskUpdated: disk.updated };
        }
        const fh = await dir.getFileHandle('dossier.json', { create: true }), w = await fh.createWritable(); await w.write(json); await w.close();
      } else await idbPut('dossiers', d.id, JSON.parse(json));
      d._base = d.revision; return { ok: true };
    },
    async remove(id) {
      if (this.mode === 'folder') { const name = this.dirs.get(id); if (name) await this.root.removeEntry(name, { recursive: true }); this.dirs.delete(id); }
      else { await idbDel('dossiers', id); for (const k of await idbKeys('files')) if (String(k).startsWith(id + '/')) await idbDel('files', k); }
    },

    // ------------------------------------------------------------ fichiers d'un dossier (images, dérivés)
    async writeFile(d, path, data) {
      const blob = data instanceof Blob ? data : new Blob([typeof data === 'string' ? enc.encode(data) : data]);
      if (this.mode === 'folder') { const dir = await this.dirOf(d.id, true, d.patient.pseudo); await writeFileAt(dir, path, blob); }
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
    async removeFile(d, path) {
      if (this.mode === 'folder') { try { const parts = path.split('/'), name = parts.pop(); const dir = await dirAt(await this.dirOf(d.id), parts.join('/')); await dir.removeEntry(name); } catch (e) { } }
      else await idbDel('files', d.id + '/' + path);
    },

    // ------------------------------------------------------------ verrou (répertoire partagé)
    async lockInfo(id) {
      if (this.mode !== 'folder') return null;
      try { const dir = await this.dirOf(id); const f = await readFileAt(dir, '.lock'); if (!f) return null; const L = JSON.parse(await f.text()); if (L.session === SESSION) return null; if (Date.now() - Date.parse(L.t) > 30 * 60000) return null; return L; } catch (e) { return null; }
    },
    async lock(d) { if (this.mode !== 'folder') return; try { const dir = await this.dirOf(d.id, true, d.patient.pseudo); await writeFileAt(dir, '.lock', JSON.stringify({ user: this.user || 'poste', t: S.now(), session: SESSION })); } catch (e) { } },
    async unlock(d) { if (this.mode !== 'folder' || !d) return; try { const dir = await this.dirOf(d.id); const f = await readFileAt(dir, '.lock'); if (f) { const L = JSON.parse(await f.text()); if (L.session === SESSION) await dir.removeEntry('.lock'); } } catch (e) { } },

    // ------------------------------------------------------------ archive portable .episcope
    async exportBundle(d, opts) {
      const light = !!(opts && opts.light), files = [];
      const meta = { format: 'episcope-bundle', schema: S.SCHEMA, created: S.now(), light, by: this.user || '', app: (window.EPISCOPE_BRAND && window.EPISCOPE_BRAND.name) || 'EpiScope', patient: d.patient.pseudo };
      files.push({ name: 'episcope.json', data: JSON.stringify(meta, null, 1) });
      files.push({ name: 'dossier.json', data: JSON.stringify(d, (k, v) => k === '_base' ? undefined : v) });
      for (const p of await this.listFiles(d)) { if (!S.bundlePolicy(p, light)) continue; const b = await this.readFile(d, p); if (b) files.push({ name: p, data: b }); }
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
      if (this.mode === 'folder') { const dir = await this.dirOf(d.id, true, d.patient.pseudo); try { await dir.removeEntry('.lock'); } catch (e) { } }
      d._base = Infinity; d.revision = Math.max(d.revision || 0, 0); // l'import remplace la version locale
      if (this.mode === 'folder') { const dir = await this.dirOf(d.id, true, d.patient.pseudo); await writeFileAt(dir, 'dossier.json', new Blob([JSON.stringify(d, (k, v) => k === '_base' ? undefined : v)])); }
      else await idbPut('dossiers', d.id, JSON.parse(JSON.stringify(d, (k, v) => k === '_base' ? undefined : v)));
      d._base = d.revision;
      for (const [p, get] of bundle.files) await this.writeFile(d, p, await get());
      return d;
    },
    async exists(id) { if (this.mode === 'folder') { if (!this.dirs.size) await this.list(); return this.dirs.has(id); } return !!(await idbGet('dossiers', id)); },
  };

  SV.Library = Library;
})(window.SV = window.SV || {});
