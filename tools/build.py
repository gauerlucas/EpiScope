#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Build de EpiScope.

  python tools/build.py            → data/bundle.js (pour index.html en mode développement)
                                     + dist/EpiScope.html (fichier unique, autonome, à copier
                                     sur clé USB / partage réseau et à ouvrir dans Edge ou Chrome)

Entrées : data/*.csv (base de référence éditable), assets/brain_meshes.json (maillages VEP),
          vendor/three.iife.js, src/*.js, styles/app.css, index.html (gabarit).

Aucune dépendance hors bibliothèque standard.
"""
import csv, json, os, re, sys, datetime

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
D = lambda *p: os.path.join(ROOT, *p)

# (ordre des modules : lu dans index.html depuis la v5 ; la liste ci-dessous n'est plus utilisée que comme mémoire)
SRC_ORDER_V4 = ['nifti.js', 'work.js', 'stats.js', 'imaging/coreg.js', 'imaging/meshnet.js', 'imaging/volops.js', 'imaging/pvc.js', 'imaging/mesh.js', 'zip.js', 'imaging/ctelec.js', 'imaging/anat.js', 'imaging/segatlas.js', 'store.js', 'library.js', 'csv.js', 'db.js', 'atlas.js', 'model.js', 'electrodes.js', 'seeg.js', 'viewer3d.js', 'slices.js', 'viewer_slices3d.js', 'timeline.js', 'report.js', 'app.js', 'seeg_ui.js', 'patient_ui.js', 'staff_ui.js', 'synth_views.js', 'pres3d.js', 'imaging_ui.js', 'imaging_panel.js', 'elec_real.js', 'anat_ui.js', 'imaging_post.js', 'coreg_ui.js', 'dicom.js', 'implant_ui.js', 'surgery.js', 'report_ui.js', 'views.js', 'pedigree.js', 'clinical_ui.js', 'growth_data.js', 'growth.js', 'dev_ui.js', 'vendor/webm-muxer.js', 'video_conv.js', 'gallery.js', 'nav.js', 'credits.js', 'seeg_flow.js', 'stim3d.js', 'implant_layers.js', 'eeg_cr.js', 'thermo_flow.js', 'view2_ui.js', 'plan_ui.js', 'implant_projects.js', 'loc_edit.js', 'seeg_report.js', 'staff_present.js', 'video_annot.js', 'plan_traj.js', 'plan_panel.js', 'ieeg.js', 'ieeg_methods.js', 'ieeg_ui.js', 'ieeg_methods_ui.js', 'quant_view.js', 'ieeg_conn_ui.js', 'ieeg_ez_ui.js', 'quant_trace.js', 'scroll_keep.js']
IMAGING_ASSETS = [('model21_104class', 'assets/models/model21_104class.json'), ('model5_gw_ae', 'assets/models/model5_gw_ae.json'), ('template_anat', 'assets/template_anat.json'), ('mindgrab', 'assets/models/mindgrab.json'), ('template_spm', 'assets/template_spm.json'), ('yasa_eeg', 'assets/models/yasa_eeg.json'), ('yasa_eeg_demo', 'assets/models/yasa_eeg_demo.json'), ('spikenet1', 'assets/models/spikenet1.json'), ('i18n_en', 'assets/i18n_en.json'), ('manual', 'assets/manual.json')]
S2B_FILTERS = ('spontaneous', 'sublobar')   # filtres Semio2Brain embarqués (voir README_semio2brain.md)
S2B_MIN_SCORE = 0.05

def read_csv(name):
    with open(D('data', name), encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))

def build_db():
    db = {
        'meta': {'name': 'EpiScope reference DB', 'built': datetime.datetime.now().isoformat(timespec='seconds'),
                 'atlas': 'VEP (Wang et al. 2021, J Neurosci Methods) on fsaverage5', 'version': '0.1'},
        'signs': read_csv('signs.csv'),
        'priors': read_csv('sign_region_priors.csv'),
        'regions': read_csv('regions.csv'),
        'edges': read_csv('network_edges.csv'),
        's2b_map': read_csv('semio2brain_category_map.csv'),
        's2b_filter': S2B_FILTERS[0],
    }
    s2b = []
    if os.path.exists(D('data', 'evidence_semio2brain.csv')):
        for r in read_csv('evidence_semio2brain.csv'):
            if r['filter'] != S2B_FILTERS[0] or r['category'] == 'Unclassified': continue
            if float(r['score']) < S2B_MIN_SCORE: continue
            s2b.append({'category': r['category'], 'family': r['family'], 'score': round(float(r['score']), 3), 'n': r['n_patients_category']})
    db['s2b'] = s2b
    return db

def main():
    db = build_db()
    with open(D('assets', 'brain_meshes.json'), encoding='utf-8') as f: mesh = f.read()
    with open(D('assets', 'vep_volume.json'), encoding='utf-8') as f: volume = f.read()
    db_json = json.dumps(db, ensure_ascii=False, separators=(',', ':'))
    # données d'imagerie embarquées : modèles MeshNet (segmentation), table du gabarit (parcellation VEP du patient)
    assets = {}
    for name, path in IMAGING_ASSETS:
        if os.path.exists(D(*path.split('/'))):
            with open(D(*path.split('/')), encoding='utf-8') as f: assets[name] = f.read()
        else: print('attention : %s absent, non embarqué (manuel : python3 tools/build_manual.py ; modèles : tools/make_models.py)' % path)
    # 1. bundle de développement
    os.makedirs(D('data'), exist_ok=True)
    with open(D('data', 'bundle.js'), 'w', encoding='utf-8') as f:
        f.write('/* généré par tools/build.py — ne pas éditer ; éditez les CSV de data/ */\n')
        f.write('window.SV_DB=' + db_json + ';\n')
        f.write('window.SV_MESH=' + mesh + ';\n')
        f.write('window.SV_VOL=' + volume + ';\n')
        f.write('window.SV_ASSETS={' + ','.join('%s:%s' % (json.dumps(k), v) for k, v in assets.items()) + '};\n')
    # 2. fichier unique
    with open(D('index.html'), encoding='utf-8') as f: html = f.read()
    # ordre des modules et des feuilles de style : celui d'index.html (source unique)
    css_files = re.findall(r'<link rel="stylesheet" href="(styles/[A-Za-z0-9_\-/.]+\.css)">', html)
    css = ''
    for cf in css_files:
        with open(D(*cf.split('/')), encoding='utf-8') as f: css += '\n/* ---- %s ---- */\n' % cf + f.read()
    src_files = re.findall(r'<script src="src/([A-Za-z0-9_/.\-]+\.js)"></script>', html)
    with open(D('vendor', 'three.iife.js'), encoding='utf-8') as f: three = f.read()
    src = ''
    for name in src_files:
        tag = re.sub(r'\.js$', '', name.split('/')[-1])
        with open(D('src', name), encoding='utf-8') as f: src += '\n/* ---- %s ---- */\nif(window.SV&&SV.Hooks)SV.Hooks.current=%s;\n' % (name, json.dumps(tag)) + f.read()
    def safe(s): return s.replace('</script', '<\\/script')
    out = html
    out = re.sub(r'(\s*<link rel="stylesheet" href="styles/[A-Za-z0-9_\-/.]+\.css">)+', lambda m: '\n<style>\n' + css + '\n</style>', out, count=1)
    out = re.sub(r'\s*<script>if\(window\.SV&&SV\.Hooks\)SV\.Hooks\.current=[^<]*</script>', '', out)
    # images de marque (logo, favicon) incorporées en data URI
    import base64, mimetypes
    def inline_asset(m):
        path = D(*m.group(2).split('/'))
        if not os.path.exists(path): return m.group(0)
        mime = mimetypes.guess_type(path)[0] or 'application/octet-stream'
        if path.endswith('.webp'): mime = 'image/webp'
        if path.endswith('.woff2'): mime = 'font/woff2'
        with open(path, 'rb') as f: data = base64.b64encode(f.read()).decode('ascii')
        return '%s="data:%s;base64,%s"' % (m.group(1), mime, data)
    out = re.sub(r'(src|href)="(assets/[A-Za-z0-9_\-]+\.(?:webp|png|svg|jpg|woff2))"', inline_asset, out)
    out = re.sub(r'<script src="vendor/three.iife.js"></script>', lambda m: '<script>' + safe(three) + '</script>', out)
    out = re.sub(r'<script src="data/bundle.js"></script>',
                 lambda m: '<script id="sv-db" type="application/json">' + safe(db_json) + '</script>\n'
                           '<script id="sv-mesh" type="application/json">' + safe(mesh) + '</script>\n'
                           '<script id="sv-vol" type="application/json">' + safe(volume) + '</script>' +
                           ''.join('\n<script id="sv-asset-%s" type="application/json">%s</script>' % (k, safe(v)) for k, v in assets.items()), out)
    out = re.sub(r'(\s*<script src="src/[A-Za-z0-9_/.-]+\.js"></script>)+', lambda m: '\n<script>' + safe(src) + '</script>', out, count=1)
    os.makedirs(D('dist'), exist_ok=True)
    # contrôle de syntaxe (node --check) : une erreur dans un module bloquerait toute l'application
    import shutil, subprocess, tempfile
    if shutil.which('node'):
        with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8') as tf: tf.write(src); tmp = tf.name
        r = subprocess.run(['node', '--check', tmp], capture_output=True, text=True); os.unlink(tmp)
        if r.returncode: print(r.stderr[:2000]); sys.exit('erreur de syntaxe dans les sources : dist/EpiScope.html non écrit')
    with open(D('dist', 'EpiScope.html'), 'w', encoding='utf-8') as f: f.write(out)
    print('data/bundle.js  %.1f MB' % (os.path.getsize(D('data', 'bundle.js')) / 1e6))
    print('dist/EpiScope.html  %.1f MB  (%d signes, %d priors, %d liens, %d lignes Semio2Brain)' % (
        os.path.getsize(D('dist', 'EpiScope.html')) / 1e6, len(db['signs']), len(db['priors']), len(db['edges']), len(db['s2b'])))

if __name__ == '__main__':
    main()
