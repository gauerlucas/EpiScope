// node tools/tests/test_clock.mjs — v1.1.0 : temps absolu enregistré (rec.clock, heures absolues des marques, début absolu
// des crises, recalage si la lecture du fichier change) ; EDF+D synthétique (make_synth_edfd.py), aucune donnée de patient
import fs from 'fs'; import vm from 'vm'; import os from 'os'; import path from 'path'; import assert from 'assert'; import { execSync } from 'child_process';
globalThis.window = globalThis; globalThis.SV = globalThis.SV || {};
for (const f of ['src/core.js', 'src/esi.js', 'src/ieeg.js', 'src/store.js']) vm.runInThisContext(fs.readFileSync(f, 'utf8'), { filename: f });
const IE = SV.IEEG, S = SV.Store;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'episcope-clock-')), file = path.join(tmp, 'nuit.edf');
execSync(`python3 tools/tests/make_synth_edfd.py ${file}`, { stdio: 'ignore' });
const r = IE.readEDF(new Uint8Array(fs.readFileSync(file))), mem = Object.assign({}, r, { duration: r.nSamples / r.fs });
const ck = IE.clockOf(mem);
assert.equal(ck.start, '2021-06-02T23:30:00.000'); assert.equal(ck.blocks.length, 3);
assert.deepEqual(JSON.parse(JSON.stringify(ck)), ck, 'horloge sérialisable (dossier.json)');
// mêmes heures que la visionneuse (timeMap), sans relire le fichier
assert.equal(S.clockAbs(ck, 421), '2021-06-02T23:37:00.000'); assert.equal(S.clockAbs(ck, 751), '2021-06-02T23:57:30.000');
assert.equal(S.clockAbs(ck, 1200), '2021-06-03T00:04:59.000', 'passage de minuit');
assert.equal(S.clockAbs(ck, 421.25), '2021-06-02T23:37:00.250', 'millisecondes');
assert.equal(S.clockT(ck, '2021-06-02T23:57:30.000'), 751); assert.equal(S.clockT(ck, '2021-06-02T23:46:40'), null, 'dans la coupure');
assert.equal(S.clockT(ck, '2021-06-01T10:00:00'), null, 'hors du tracé');
assert.equal(S.isoDiff('2021-06-02T23:30:00', '2021-06-03T00:04:59'), 2099); assert.equal(S.isoAdd('2021-06-02T23:59:59.500', 1), '2021-06-03T00:00:00.500');
assert.equal(S.clockAbs({ start: null, blocks: [] }, 3), null, 'sans horloge');
// marques : heure absolue enregistrée, début absolu des crises
const d = S.newDossier({ pseudo: 'CLOCK' }), ex = S.addExploration(d, { kind: 'seeg' });
const z1 = S.addSeizure(d, ex.id, { label: 'Crise 1' }), z2 = S.addSeizure(d, ex.id, { label: 'Crise 2' });
const rec = { id: 'R1', clock: ck, seizureId: z1.id, marks: { onset: 421, end: 450, user: [{ t: 430, label: 'clonies' }] }, bySz: { [z2.id]: { marks: { onset: 751, end: 760, user: [] } } }, imarks: [{ t: 100 }] };
ex.recordings = [rec]; S.stampAll(d);
assert.equal(rec.marks.abs.onset, '2021-06-02T23:37:00.000'); assert.equal(rec.marks.user[0].abs, '2021-06-02T23:37:09.000'); assert.equal(rec.imarks[0].abs, '2021-06-02T23:31:40.000');
assert.equal(z1.onsetAbs, '2021-06-02T23:37:00.000'); assert.equal(z2.onsetAbs, '2021-06-02T23:57:30.000', 'autre crise du même tracé');
// lecture changée (ex. bloc recouvert écarté : tout ce qui suit avance d'1 s dans le temps du tracé) → marques recalées par l'heure absolue
const ck2 = JSON.parse(JSON.stringify(ck)); ck2.blocks[1].t0 -= 1; ck2.blocks[1].t1 -= 1; ck2.blocks[2].t0 -= 1; ck2.blocks[2].t1 -= 1; ck2.blocks[0].t1 -= 1;
const n = S.rebaseMarks(rec, ck2);
assert.equal(rec.marks.onset, 420); assert.equal(rec.bySz[z2.id].marks.onset, 750); assert.equal(rec.marks.user[0].t, 429); assert.ok(n >= 5, 'marques recalées : ' + n);
assert.equal(rec.clock, ck2); S.stampMarks(rec); assert.equal(rec.marks.abs.onset, '2021-06-02T23:37:00.000', 'heure absolue inchangée');
// synchronisation vidéo : tracé à 23:30:00, vidéo commencée à 23:35:43, crise à 23:37:00 (recette du plan, en plus court)
assert.equal(S.videoStartFromName('cam1_20210602_233543.mp4'), '2021-06-02T23:35:43.000'); assert.equal(S.videoStartFromName('2021-06-02 23.35.43 clip.mov'), '2021-06-02T23:35:43.000');
assert.equal(S.videoStartFromName('20210602233543.mp4'), '2021-06-02T23:35:43.000'); assert.equal(S.videoStartFromName('video crise.mp4'), null); assert.equal(S.videoStartFromName('20211302_233543'), null, 'mois impossible');
d.gallery.push({ id: 'G1', mime: 'video/mp4', duration: 600 }, { id: 'G2', mime: 'video/mp4', duration: 600 });
const L1 = S.addSyncLink(d, { galleryId: 'G1', recordingId: 'R1', start: '2021-06-02T23:35:43.000', method: 'filename' });
assert.equal(S.videoT(L1, z1.onsetAbs), 77, 'crise à 77 s dans la vidéo'); assert.equal(S.videoAbs(L1, 77), '2021-06-02T23:37:00.000');
assert.deepEqual(S.videosAt(d, '2021-06-02T23:37:00').map(x => x.g.id), ['G1']); assert.deepEqual(S.videosAt(d, '2021-06-02T23:31:00'), [], 'avant le début de la vidéo');
// points : décalage seul, puis décalage + dérive (horloge vidéo qui avance de 1 s par heure)
assert.deepEqual(S.fitSync([{ tv: 10, abs: '2021-06-02T23:36:00.000' }]), { start: '2021-06-02T23:35:50.000', drift: 0 });
const f2 = S.fitSync([{ tv: 0, abs: '2021-06-02T22:00:00.000' }, { tv: 3600, abs: '2021-06-02T23:00:01.000' }]);
assert.equal(f2.start, '2021-06-02T22:00:00.000'); assert.ok(Math.abs(f2.drift - 1 / 3600) < 1e-6, 'dérive ' + f2.drift);
const L2 = S.addSyncLink(d, Object.assign({ galleryId: 'G2', method: 'points' }, f2)); assert.equal(S.videoAbs(L2, 3600), '2021-06-02T23:00:01.000'); assert.equal(S.videoT(L2, '2021-06-02T23:00:01.000'), 3600);
assert.equal(S.addSyncLink(d, { galleryId: 'G1', start: '2021-06-02T23:35:44.000' }).start, '2021-06-02T23:35:44.000'); assert.equal(d.syncLinks.length, 2, 'un lien par vidéo');
const dn = JSON.parse(JSON.stringify(d)); delete dn.syncLinks; S.normalize(dn); assert.deepEqual(dn.syncLinks, []);
fs.rmSync(tmp, { recursive: true, force: true });
console.log('OK clock');
