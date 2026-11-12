/* EpiScope — video_conv.js : vidéos légères pour la galerie (revue rapide, format « écran »).
 *   - vidéo lisible par le navigateur mais lourde (Full HD, > 30 Mo) : réencodée dans le navigateur, sans rien télécharger
 *     (WebCodecs : image ≤ 1280 × 720, VP8 ~1,5 Mb/s, son Opus mono ; multiplexage WebM par webm-muxer) ;
 *   - format non lisible (AVI, WMV, MPEG-2, FLV…) : converti par ffmpeg (ffmpeg.wasm, @ffmpeg/core 0.12.10, ≈ 31 Mo)
 *     téléchargé une seule fois depuis cdn.jsdelivr.net après accord, puis gardé dans ce navigateur (IndexedDB) ;
 *     la conversion tourne dans un worker, la vidéo ne quitte jamais le poste. Sortie MP4 (H.264 + AAC) si le navigateur
 *     sait la lire, sinon WebM (VP8 + Opus).                                                                              */
(function (SV) {
  'use strict';
  const FF = { ver: '0.12.10', base: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/', size: 32.3e6 };
  const LIGHT = { maxW: 1280, maxH: 720, fps: 25, vbr: 1.5e6, abr: 64000 };
  const UNREADABLE = /\.(avi|wmv|asf|mpg|mpeg|m2v|vob|flv|3gp|3g2|mts|m2ts|ts|divx|xvid|dv|mxf|rm|rmvb)$/i;
  const VIDEO_NAME = /\.(mp4|webm|mov|m4v|ogv|mkv|avi|wmv|asf|mpg|mpeg|m2v|vob|flv|3gp|3g2|mts|m2ts|ts|divx|xvid|dv|mxf|rm|rmvb)$/i;
  const isVideoFile = f => !!f && (/^video\//.test(f.type || '') || VIDEO_NAME.test(f.name || ''));

  // ---------------------------------------------------------------- cache local des fichiers de ffmpeg (IndexedDB)
  const DB = 'episcope-tools';
  const idb = () => new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore('files'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  async function cacheGet(k) { try { const db = await idb(); return await new Promise((res, rej) => { const q = db.transaction('files').objectStore('files').get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => rej(q.error); }); } catch (e) { return null; } }
  async function cachePut(k, v) { try { const db = await idb(); await new Promise((res, rej) => { const t = db.transaction('files', 'readwrite'); t.objectStore('files').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); } catch (e) { } }
  async function ffCached() { return !!(await cacheGet('ffcore-wasm-' + FF.ver)) && !!(await cacheGet('ffcore-js-' + FF.ver)); }
  async function fetchBytes(url, onProg) {
    const r = await fetch(url); if (!r.ok) throw new Error(`téléchargement refusé (${r.status}) : ${url}`);
    const n = +r.headers.get('content-length') || 0; if (!r.body || !r.body.getReader) return new Uint8Array(await r.arrayBuffer());
    const rd = r.body.getReader(), parts = []; let got = 0;
    for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; if (onProg) onProg(n ? got / n : Math.min(0.95, got / FF.size)); }
    const out = new Uint8Array(got); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out;
  }
  async function ffAssets(onProg) {
    let js = await cacheGet('ffcore-js-' + FF.ver), wasm = await cacheGet('ffcore-wasm-' + FF.ver);
    if (!js) { js = new TextDecoder().decode(await fetchBytes(FF.base + 'ffmpeg-core.js')); await cachePut('ffcore-js-' + FF.ver, js); }
    if (!wasm) { const b = await fetchBytes(FF.base + 'ffmpeg-core.wasm', p => onProg && onProg(p)); wasm = b.buffer; await cachePut('ffcore-wasm-' + FF.ver, wasm); }
    return { js, wasm };
  }
  const WORKER = `self.onmessage = async e => {
    const { js, wasm, input, inName, args, outName } = e.data;
    try {
      importScripts(URL.createObjectURL(new Blob([js], { type: 'text/javascript' })));
      const core = await self.createFFmpegCore({ wasmBinary: wasm });
      core.setLogger(m => self.postMessage({ log: m.message }));
      core.setProgress(p => self.postMessage({ progress: p.progress, time: p.time }));
      core.FS.writeFile('/' + inName, new Uint8Array(input));
      core.exec(...args);
      let out = null; try { out = core.FS.readFile('/' + outName); } catch (err) { }
      if (!out || !out.length) throw new Error('ffmpeg n’a pas produit de vidéo (code ' + core.ret + ')');
      self.postMessage({ done: out.buffer }, [out.buffer]);
    } catch (err) { self.postMessage({ error: (err && err.message) || String(err) }); }
  };`;
  /** conversion par ffmpeg dans un worker ; onProg(fraction, texte) */
  async function ffmpegLight(file, onProg, o) {
    o = Object.assign({}, LIGHT, o || {});
    const A = await ffAssets(p => onProg && onProg(0.02 + 0.28 * p, `téléchargement de ffmpeg (une seule fois) : ${Math.round(p * 100)} %`));
    const mp4 = !!document.createElement('video').canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"'), outName = mp4 ? 'out.mp4' : 'out.webm';
    const ext = (String(file.name || 'video').match(/\.([a-z0-9]+)$/i) || [, 'bin'])[1].toLowerCase(), inName = 'in.' + ext;
    const vf = `scale='min(${o.maxW},iw)':'min(${o.maxH},ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2`;
    const args = ['-i', inName, '-vf', vf, '-r', String(o.fps), ...(mp4 ? ['-c:v', 'libx264', '-preset', 'superfast', '-crf', '28', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-ac', '1', '-movflags', '+faststart'] : ['-c:v', 'libvpx', '-b:v', '1.2M', '-deadline', 'realtime', '-cpu-used', '8', '-c:a', 'libopus', '-b:a', '64k', '-ac', '1']), outName];
    const input = await file.arrayBuffer(); if (onProg) onProg(0.32, 'conversion…');
    const w = new Worker(URL.createObjectURL(new Blob([WORKER], { type: 'text/javascript' })));
    try {
      const buf = await new Promise((res, rej) => {
        w.onmessage = e => { const m = e.data; if (m.progress != null && onProg) onProg(0.32 + 0.66 * Math.max(0, Math.min(1, m.progress)), `conversion : ${Math.round(Math.max(0, Math.min(1, m.progress)) * 100)} %`); else if (m.done) res(m.done); else if (m.error) rej(new Error(m.error)); };
        w.onerror = e => rej(new Error(e.message || 'erreur du worker ffmpeg'));
        w.postMessage({ js: A.js, wasm: A.wasm, input, inName, args, outName }, [input]);
      });
      return new File([buf], String(file.name || 'video').replace(/\.[^.]+$/, '') + (mp4 ? '.mp4' : '.webm'), { type: mp4 ? 'video/mp4' : 'video/webm' });
    } finally { w.terminate(); }
  }

  // ---------------------------------------------------------------- lecture par le navigateur, version légère native
  /** le navigateur sait-il lire la vidéo ? { ok, w, h, dur } */
  function probe(file, ms) {
    return new Promise(res => {
      const url = URL.createObjectURL(file), v = document.createElement('video'); let done = false; v.muted = true; v.preload = 'metadata';
      const end = ok => { if (done) return; done = true; const r = { ok: ok && v.videoWidth > 0, w: v.videoWidth || 0, h: v.videoHeight || 0, dur: isFinite(v.duration) ? v.duration : 0 }; v.removeAttribute('src'); v.load(); URL.revokeObjectURL(url); res(r); };
      v.onloadedmetadata = () => end(true); v.onerror = () => end(false); setTimeout(() => end(false), ms || 8000); v.src = url;
    });
  }
  const needsLight = (file, p) => p.ok && ((file.size || 0) > 30e6 || p.w > LIGHT.maxW || p.h > LIGHT.maxH);
  /** réencodage dans le navigateur (WebCodecs) ; null si le navigateur ne le permet pas */
  async function nativeLight(file, onProg, o) {
    o = Object.assign({}, LIGHT, o || {});
    if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined' || typeof WebMMuxer === 'undefined') return null;
    const url = URL.createObjectURL(file), v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
    try {
      await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error('vidéo illisible')); setTimeout(() => rej(new Error('vidéo trop longue à ouvrir')), 15000); });
      if (!v.requestVideoFrameCallback) return null;
      const sc = Math.min(1, o.maxW / v.videoWidth, o.maxH / v.videoHeight), W = Math.max(2, Math.round(v.videoWidth * sc / 2) * 2), H = Math.max(2, Math.round(v.videoHeight * sc / 2) * 2), dur = isFinite(v.duration) ? v.duration : 0;
      const vcfg = { codec: 'vp8', width: W, height: H, bitrate: o.vbr, framerate: o.fps };
      const sup = await VideoEncoder.isConfigSupported(vcfg).catch(() => ({ supported: false })); if (!sup.supported) return null;
      // son : décodé en entier (OfflineAudioContext à 48 kHz), mono, Opus ; sans son si le décodage échoue
      let audioChunks = [], hasAudio = false;
      try {
        if (typeof AudioEncoder !== 'undefined' && (file.size || 0) < 1.5e9) {
          if (onProg) onProg(0.02, 'son…');
          const ab = await file.arrayBuffer(), ac = new OfflineAudioContext(1, 1, 48000), buf = await ac.decodeAudioData(ab);
          const acfg = { codec: 'opus', sampleRate: 48000, numberOfChannels: 1, bitrate: o.abr };
          if ((await AudioEncoder.isConfigSupported(acfg).catch(() => ({}))).supported && buf.length) {
            const n = buf.length, mono = new Float32Array(n); for (let c = 0; c < buf.numberOfChannels; c++) { const x = buf.getChannelData(c); for (let i = 0; i < n; i++) mono[i] += x[i] / buf.numberOfChannels; }
            const aenc = new AudioEncoder({ output: (ch, meta) => audioChunks.push([ch, meta]), error: e => { throw e; } }); aenc.configure(acfg);
            for (let i = 0; i < n; i += 48000) { const len = Math.min(48000, n - i), ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: len, numberOfChannels: 1, timestamp: Math.round(i / 48000 * 1e6), data: mono.subarray(i, i + len) }); aenc.encode(ad); ad.close(); }
            await aenc.flush(); aenc.close(); hasAudio = audioChunks.length > 0;
          }
        }
      } catch (e) { audioChunks = []; hasAudio = false; }
      const target = new WebMMuxer.ArrayBufferTarget();
      const mux = new WebMMuxer.Muxer({ target, video: { codec: 'V_VP8', width: W, height: H, frameRate: o.fps }, audio: hasAudio ? { codec: 'A_OPUS', sampleRate: 48000, numberOfChannels: 1 } : undefined, firstTimestampBehavior: 'offset' });
      let ai = 0; const flushAudio = ts => { while (ai < audioChunks.length && audioChunks[ai][0].timestamp <= ts) { mux.addAudioChunk(audioChunks[ai][0], audioChunks[ai][1]); ai++; } };   // entrelacement par horodatage
      let err = null; const venc = new VideoEncoder({ output: (ch, meta) => { if (hasAudio) flushAudio(ch.timestamp); mux.addVideoChunk(ch, meta); }, error: e => { err = e; } }); venc.configure(vcfg);
      const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H }), g = cv.getContext('2d');
      const step = 1e6 / o.fps; let next = 0, k = 0, rate = Math.min(4, o.rate || 1), win = { t0: 0, n: 0 };
      v.currentTime = 0; v.playbackRate = rate;
      await new Promise((res, rej) => {
        const onFrame = (now, meta) => {
          if (err) { rej(err); return; }
          const t = Math.round((meta && meta.mediaTime != null ? meta.mediaTime : v.currentTime) * 1e6);
          if (t >= next - step / 2) { g.drawImage(v, 0, 0, W, H); const fr = new VideoFrame(cv, { timestamp: t }); venc.encode(fr, { keyFrame: k % (o.fps * 2) === 0 }); fr.close(); k++; win.n++; next = t + step; }
          // vitesse de lecture adaptée : assez d'images par seconde de vidéo (décodage logiciel lent → ralentir, sinon accélérer)
          if (t - win.t0 >= 1e6) { const got = win.n / ((t - win.t0) / 1e6); if (got < 0.85 * o.fps && rate > 0.25) rate = Math.max(0.25, rate * 0.6); else if (got >= 0.97 * o.fps && venc.encodeQueueSize < 3 && rate < 4) rate = Math.min(4, rate * 1.25); if (v.playbackRate !== rate) v.playbackRate = rate; win = { t0: t, n: 0 }; }
          if (onProg && dur) onProg(0.05 + 0.93 * Math.min(1, t / 1e6 / dur), `version légère : ${Math.round(100 * Math.min(1, t / 1e6 / dur))} %`);
          if (venc.encodeQueueSize > 6 && !v.paused) { v.pause(); const wait = () => { if (venc.encodeQueueSize > 1) setTimeout(wait, 15); else v.play().catch(rej); }; wait(); }
          if (!v.ended) v.requestVideoFrameCallback(onFrame);
        };
        v.onended = () => res(); v.onerror = () => rej(new Error('lecture interrompue'));
        v.requestVideoFrameCallback(onFrame); v.play().catch(rej);
      });
      await venc.flush(); venc.close(); if (hasAudio) flushAudio(Infinity); if (err) throw err; if (!k) return null;
      mux.finalize();
      return new File([target.buffer], String(file.name || 'video').replace(/\.[^.]+$/, '') + '_leger.webm', { type: 'video/webm' });
    } finally { v.removeAttribute('src'); v.load(); URL.revokeObjectURL(url); }
  }

  SV.VideoConv = { FF, LIGHT, UNREADABLE, isVideoFile, probe, needsLight, nativeLight, ffmpegLight, ffCached };
})(window.SV = window.SV || {});
