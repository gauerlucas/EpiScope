/* EpiScope — work.js : workers de calcul (imagerie) créés à partir des fabriques de modules, sans fichier séparé.
 *
 * Un module d'imagerie s'enregistre ainsi :
 *     (function (factory) { const G = ...SV...; factory(G); (G._factories = G._factories || {}).nom = factory; })(function (SV) { ... });
 * La fabrique ne doit dépendre que de SV et des API standard : son texte (factory.toString()) est recopié dans un Blob,
 * ce qui permet de lancer des workers depuis un fichier ouvert en file:// (pas de requête réseau, pas de CORS).
 *
 *   const pool = SV.Work.pool(['nifti', 'meshnet'], n);       // n workers (défaut : cœurs − 1, 1 à 8)
 *   const r = await pool.call('MeshNet.convSlab', [args...], transferables, onProgress);
 *   pool.close();
 * Dans le worker, la méthode appelée reçoit (...args, progress) où progress(x) renvoie une progression au demandeur.
 * Sans Worker (Node, tests), SV.Work.available est faux : les modules exécutent alors le calcul dans le fil courant. */
(function (factory) {
  const G = typeof window !== 'undefined' ? (window.SV = window.SV || {}) : (globalThis.SV = globalThis.SV || {});
  factory(G); (G._factories = G._factories || {}).work = factory;
})(function (SV) {
  'use strict';
  const available = typeof Worker !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined' && !!URL.createObjectURL;

  /** objets transférables trouvés dans une valeur (ArrayBuffer des TypedArray) */
  function transferablesOf(v, out, seen) {
    out = out || []; seen = seen || new Set();
    if (!v || typeof v !== 'object') return out;
    if (ArrayBuffer.isView(v)) { if (!seen.has(v.buffer) && v.buffer.byteLength) { seen.add(v.buffer); out.push(v.buffer); } return out; }
    if (v instanceof ArrayBuffer) { if (!seen.has(v)) { seen.add(v); out.push(v); } return out; }
    if (Array.isArray(v)) { for (const x of v) transferablesOf(x, out, seen); return out; }
    for (const k in v) transferablesOf(v[k], out, seen);
    return out;
  }

  function workerSource(names) {
    const F = SV._factories || {};
    const parts = names.map(n => { if (!F[n]) throw new Error('module inconnu pour worker : ' + n); return '(' + F[n].toString() + ')(self.SV);'; });
    return `self.SV = {}; self.SV._inWorker = true;\n${parts.join('\n')}\n` +
      `const __tr = ${transferablesOf.toString()};\n` +
      `self.onmessage = async (e) => { const { id, method, args } = e.data; try {` +
      ` const fn = method.split('.').reduce((o, k) => o && o[k], self.SV); if (typeof fn !== 'function') throw new Error('méthode inconnue : ' + method);` +
      ` const res = await fn(...(args || []), (p) => self.postMessage({ id, progress: p }));` +
      ` self.postMessage({ id, result: res }, __tr(res)); } catch (err) { self.postMessage({ id, error: (err && err.message) || String(err) }); } };`;
  }

  const urls = new Map();
  function spawn(names) {
    const key = names.join('+'); let url = urls.get(key);
    if (!url) { url = URL.createObjectURL(new Blob([workerSource(names)], { type: 'text/javascript' })); urls.set(key, url); }
    return new Worker(url);
  }

  /** groupe de workers : les appels sont répartis sur le premier worker libre (file d'attente FIFO) */
  function pool(names, n) {
    const size = Math.max(1, Math.min(8, n || Math.max(1, ((typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 2) - 1)));
    const workers = [], idle = [], queue = [], pending = new Map(); let nextId = 1, closed = false, respawns = 0;
    // un worker en erreur (mémoire épuisée, exception non rattrapée) est remplacé : ne jamais le remettre en service
    const attach = w => {
      w.onmessage = e => {
        const { id, progress, result, error } = e.data, p = pending.get(id); if (!p) return;
        if (progress !== undefined) { if (p.onProgress) p.onProgress(progress); return; }
        pending.delete(id); idle.push(w); pump();
        if (error) p.reject(new Error(error)); else p.resolve(result);
      };
      w.onerror = e => {
        e.preventDefault && e.preventDefault();
        for (const [id, p] of pending) if (p.w === w) { pending.delete(id); p.reject(new Error(e.message || 'erreur du worker (mémoire ?)')); }
        try { w.terminate(); } catch (x) { }
        const k = idle.indexOf(w); if (k >= 0) idle.splice(k, 1);
        const i = workers.indexOf(w); if (closed || ++respawns > 2 * size) { if (i >= 0) workers.splice(i, 1); if (!workers.length) for (const j of queue.splice(0)) j.reject(new Error(e.message || 'workers indisponibles')); return; }   // pas de boucle si le script lui-même échoue
        const nw = spawn(names); attach(nw); if (i >= 0) workers[i] = nw; idle.push(nw); pump();
      };
    };
    for (let i = 0; i < size; i++) { const w = spawn(names); workers.push(w); idle.push(w); attach(w); }
    function pump() {
      while (idle.length && queue.length && !closed) {
        const job = queue.shift(), w = idle.shift(); job.w = w; pending.set(job.id, job);
        w.postMessage({ id: job.id, method: job.method, args: job.args }, job.transfer || []);
      }
    }
    return {
      size,
      call(method, args, transfer, onProgress) { return new Promise((resolve, reject) => { if (closed) return reject(new Error('groupe de workers fermé')); queue.push({ id: nextId++, method, args, transfer, onProgress, resolve, reject }); pump(); }); },
      close() { closed = true; for (const w of workers) w.terminate(); for (const [, p] of pending) p.reject(new Error('annulé')); pending.clear(); queue.length = 0; },
    };
  }

  /** exécute une méthode d'un module dans un worker unique (création + fermeture) ; repli dans le fil courant */
  async function run(names, method, args, transfer, onProgress) {
    if (!available) { const fn = method.split('.').reduce((o, k) => o && o[k], SV); return fn(...(args || []), onProgress || (() => {})); }
    const p = pool(names, 1); try { return await p.call(method, args, transfer, onProgress); } finally { p.close(); }
  }

  SV.Work = { available, pool, run, transferablesOf };
});
