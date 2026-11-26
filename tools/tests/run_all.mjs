// node tools/tests/run_all.mjs [--heavy]   — v1.0.1 : tous les tests Node du dépôt, depuis la racine.
//   Rapides (CI, ~45 s) : autonomes, données synthétiques générées par les tests eux-mêmes.
//   Lourds (--heavy, à la main) : demandent des données d'exemple externes (image T1 de brainchop, tf.js…) indiquées par
//   des variables d'environnement ; ignorés avec leur motif quand elles manquent.
// Aucun test ne lit de données de patient : le garde-fou tools/check_no_data.py refuse ces fichiers dans le dépôt.
import { spawnSync } from 'child_process'; import fs from 'fs';

const QUICK = ['lint', 'store', 'safety', 'provenance', 'identity', 'anon_export', 'concordance_inputs', 'network_rank', 'bids', 'staff_notes', 'clock', 'research', 'migrate3', 'phases', 'seizure_board', 'rec_slots', 'methods_golden', 'wave_montage', 'timemap', 'v51', 'v52', 'zip', 'nifti', 'growth', 'esi', 'plan_traj', 'pvc', 'sleep', 'ieeg', 'spikenet', 'spikenet2', 'research_fields', 'template_space', 'surfaces', 'v32', 'bem', 'dicom'];
const NEEDS = { dicom: 'python3 -c "import pydicom, numpy"' };   // dépendance Python (CI : pip install pydicom numpy)
const HEAVY = {
  coreg: ['EPISCOPE_BRAINCHOP', 'image T1 et étiquettes de brainchop v3 (t1_c.nii.gz, labels.nii.gz)'],
  harmonize: ['EPISCOPE_BRAINCHOP', 'image T1 de brainchop v3'],
  segatlas: ['EPISCOPE_BRAINCHOP', 'image T1 et étiquettes de brainchop v3'],
  meshnet: ['EPISCOPE_TFJS', '@tensorflow/tfjs installé hors dépôt (~25 min)'],
  mesh: ['EPISCOPE_HEAVY', 'maillages complets (~minutes), écrit dans un dossier temporaire'],
  ctelec: ['EPISCOPE_CT', 'scanner synthétique (python tools/tests/make_synth_ct.py <dossier>) : dossier en argument'],
};
const heavy = process.argv.includes('--heavy');
let fail = 0, ran = 0; const t0 = Date.now(), rows = [];
const run = (name, args) => {
  const f = `tools/tests/test_${name}.mjs`; if (!fs.existsSync(f)) { rows.push([name, 'absent']); fail++; return; }
  const t = Date.now(), r = spawnSync(process.execPath, [f, ...(args || [])], { encoding: 'utf8', timeout: 20 * 60e3 });
  const ok = r.status === 0; ran++; if (!ok) fail++;
  rows.push([name, ok ? 'ok' : 'ÉCHEC', ((Date.now() - t) / 1000).toFixed(1) + ' s']);
  if (!ok) process.stdout.write(`\n--- ${name} ---\n${(r.stdout || '').slice(-1500)}${(r.stderr || '').slice(-2500)}\n`);
};
for (const n of QUICK) {
  if (NEEDS[n] && spawnSync('sh', ['-c', NEEDS[n]]).status !== 0) { rows.push([n, 'ignoré', 'dépendance manquante : ' + NEEDS[n]]); continue; }
  run(n);
}
for (const [n, [env, what]] of Object.entries(HEAVY)) {
  if (!heavy) { rows.push([n, 'lourd', what]); continue; }
  if (!process.env[env]) { rows.push([n, 'ignoré', `${env} non défini — ${what}`]); continue; }
  run(n, process.env[env].split(' ').filter(Boolean));
}
for (const r of rows) console.log(r[0].padEnd(14), r.slice(1).join('  '));
console.log(`\n${ran} test(s) exécuté(s), ${fail} échec(s), ${((Date.now() - t0) / 1000).toFixed(0)} s`);
process.exit(fail ? 1 : 0);
