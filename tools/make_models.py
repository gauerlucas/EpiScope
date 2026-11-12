#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Conversion des modèles MeshNet de brainchop (neuroneural/brainchop, licence MIT) au format embarqué d'EpiScope.

  python tools/make_models.py [--brainchop /home/claude/neuroneural/brainchop] [--out assets/models] [noms...]

Entrée : public/models/<nom>/model.json (tf.js « layers-model ») + fichier .bin + colormap(.json).
Sortie : assets/models/<nom>.json, lu par SV.MeshNet.loadModel (src/imaging/meshnet.js) :

  { "format": "episcope-meshnet/1", "name", "title", "source": {...},
    "settings": { "type", "normalization": "minmax"|"quantile", "cropPadding", "autoThreshold", "transpose",
                  "preModel": nom|null, "noPreModel": {...} | absent },
    "layers": [ { "name", "inC", "outC", "kernel": 3|1, "dilation", "activation": "linear"|"relu"|"elu"|"gelu",
                  "gn": bool (normalisation d'instance après la convolution, couches « _gn »), "bias": bool } ],
    "labels": [...], "colors": [[r,g,b], ...], "fsCodes": [code FreeSurferColorLUT | null], "hemi": ["L"|"R"|""],
    "weights": { "dtype": "float32", "endian": "little", "count", "sha256", "layout", "base64" } }

Disposition des poids (base64 d'un Float32Array petit-boutiste) : couches dans l'ordre, pour chacune le noyau Keras
[kd][kh][kw][inC][outC] (outC le plus rapide, ordre tf.js d'origine) puis le biais [outC] si "bias". Avec
"transpose": true (tous les modèles brainchop), (kd, kh, kw) ↔ axes voxel (i, j, k) de l'image conformée.
Les couches Activation de Keras sont fusionnées dans la convolution qui les précède.

Réglages : repris de brainchop-parameters.js (entrée « inferenceModelsList » citée pour chaque modèle).
Aucune dépendance hors bibliothèque standard.
"""
import argparse, base64, hashlib, json, os, re, struct, subprocess, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

# réglages brainchop (brainchop-parameters.js) ; id = entrée de inferenceModelsList
MODELS = {
    'model21_104class': dict(id=14, title='Aparc+Aseg 104 (Desikan-Killiany + aseg)', type='Atlas', colormap='colormap.json',
                             normalization='minmax', cropPadding=0, autoThreshold=0, preModel='model5_gw_ae',
                             noPreModel=dict(id=15, cropPadding=0, autoThreshold=0)),
    'model5_gw_ae': dict(id=1, title='Tissus SB/SG (léger) — prémodèle de recadrage', type='Segmentation', colormap='colormap3.json',
                         normalization='minmax', cropPadding=18, autoThreshold=0, preModel=None),
    'model30chan18cls': dict(id=4, title='Sous-cortical + SB/SG (18 classes)', type='Atlas', colormap='colormap.json',
                             normalization='minmax', cropPadding=0, autoThreshold=0.2, preModel=None,
                             withPreModel=dict(id=7, cropPadding=0, autoThreshold=0, preModel='model5_gw_ae')),
    'mindgrab': dict(id=16, title='Extraction du cerveau omnimodale (mindgrab)', type='Brain_Extraction', colormap='colormap.json',
                     normalization='minmax', cropPadding=20, autoThreshold=0.5, preModel=None),
}

# codes FreeSurferColorLUT (aparc+aseg) ; les régions corticales DK : 1000/2000 + indice
DK = ['bankssts', 'caudalanteriorcingulate', 'caudalmiddlefrontal', 'corpuscallosum', 'cuneus', 'entorhinal', 'fusiform',
      'inferiorparietal', 'inferiortemporal', 'isthmuscingulate', 'lateraloccipital', 'lateralorbitofrontal', 'lingual',
      'medialorbitofrontal', 'middletemporal', 'parahippocampal', 'paracentral', 'parsopercularis', 'parsorbitalis',
      'parstriangularis', 'pericalcarine', 'postcentral', 'posteriorcingulate', 'precentral', 'precuneus',
      'rostralanteriorcingulate', 'rostralmiddlefrontal', 'superiorfrontal', 'superiorparietal', 'superiortemporal',
      'supramarginal', 'frontalpole', 'temporalpole', 'transversetemporal', 'insula']
ASEG = {'BG': 0, 'Unknown': 0, 'background': 0, 'Left-Cerebral-White-Matter': 2, 'Left-Lateral-Ventricle': 4, 'Left-Inf-Lat-Vent': 5,
        'Left-Cerebellum-White-Matter': 7, 'Left-Cerebellum-Cortex': 8, 'Left-Thalamus-Proper': 10, 'Left-Thalamus': 10,
        'Left-Caudate': 11, 'Left-Putamen': 12, 'Left-Pallidum': 13, '3rd-Ventricle': 14, '4th-Ventricle': 15, 'Brain-Stem': 16,
        'Left-Hippocampus': 17, 'Left-Amygdala': 18, 'CSF': 24, 'Left-Accumbens-area': 26, 'Left-VentralDC': 28,
        'Right-Cerebral-White-Matter': 41, 'Right-Lateral-Ventricle': 43, 'Right-Inf-Lat-Vent': 44, 'Right-Cerebellum-White-Matter': 46,
        'Right-Cerebellum-Cortex': 47, 'Right-Thalamus-Proper': 49, 'Right-Thalamus': 49, 'Right-Caudate': 50, 'Right-Putamen': 51,
        'Right-Pallidum': 52, 'Right-Hippocampus': 53, 'Right-Amygdala': 54, 'Right-Accumbens-area': 58, 'Right-VentralDC': 60,
        'CC_Posterior': 251, 'CC_Mid_Posterior': 252, 'CC_Central': 253, 'CC_Mid_Anterior': 254, 'CC_Anterior': 255}


def fs_code(name):
    n = name.rstrip('*')
    m = re.match(r'ctx-(lh|rh)-(\w+)$', n)
    if m and m.group(2) in DK: return (1000 if m.group(1) == 'lh' else 2000) + DK.index(m.group(2)) + 1
    return ASEG.get(n)


def hemi(name):
    if re.match(r'(ctx-lh-|Left-)', name): return 'L'
    if re.match(r'(ctx-rh-|Right-)', name): return 'R'
    return ''


def git_commit(path):
    try: return subprocess.check_output(['git', '-C', path, 'rev-parse', '--short', 'HEAD'], text=True).strip()
    except Exception: return None


def convert(bc, name, out_dir):
    cfg = MODELS[name]
    d = os.path.join(bc, 'public', 'models', name)
    mj = json.load(open(os.path.join(d, 'model.json')))
    topo = mj['modelTopology'].get('model_config', mj['modelTopology'])
    klayers = topo['config']['layers']
    # poids : concaténation des fichiers du manifeste, dans l'ordre
    blob, specs = b'', []
    for wm in mj['weightsManifest']:
        for p in wm['paths']: blob += open(os.path.join(d, p), 'rb').read()
        specs += wm['weights']
    off, W = 0, {}
    for w in specs:
        if w['dtype'] != 'float32' or w.get('quantization'): raise SystemExit('%s : poids %s non float32' % (name, w['name']))
        n = 1
        for s in w['shape']: n *= s
        W[w['name']] = (w['shape'], blob[off:off + 4 * n]); off += 4 * n
    if off != len(blob): raise SystemExit('%s : taille du .bin incohérente (%d / %d)' % (name, off, len(blob)))
    # topologie : InputLayer, (Conv3D, Activation)*, Conv3D « output »
    layers, data, inC = [], b'', 1
    if klayers[0]['class_name'] != 'InputLayer' or klayers[0]['config']['batch_input_shape'][-1] != 1: raise SystemExit(name + ' : entrée inattendue')
    for L in klayers[1:]:
        c = L['config']
        if L['class_name'] == 'Activation':
            if not layers or layers[-1]['activation'] != 'linear': raise SystemExit(name + ' : activation orpheline')
            layers[-1]['activation'] = c['activation']; continue
        if L['class_name'] != 'Conv3D': raise SystemExit('%s : couche %s non prise en charge' % (name, L['class_name']))
        k = c['kernel_size']; dil = c['dilation_rate']
        if len(set(k)) != 1 or len(set(dil)) != 1 or c['strides'] != [1, 1, 1] or c['padding'] != 'same' or c.get('data_format', 'channels_last') != 'channels_last' or c.get('groups', 1) != 1:
            raise SystemExit('%s : Conv3D %s non prise en charge' % (name, c['name']))
        ks, kb = W[c['name'] + '/kernel']
        if ks != [k[0]] * 3 + [inC, c['filters']]: raise SystemExit('%s : forme du noyau %s inattendue %s' % (name, c['name'], ks))
        data += kb
        if c['use_bias']:
            bs, bb = W[c['name'] + '/bias']
            if bs != [c['filters']]: raise SystemExit(name + ' : biais inattendu')
            data += bb
        layers.append(dict(name=c['name'], inC=inC, outC=c['filters'], kernel=k[0], dilation=dil[0], activation=c['activation'],
                           gn=c['name'].endswith('_gn'), bias=bool(c['use_bias'])))
        inC = c['filters']
    for L in layers:
        if L['activation'] not in ('linear', 'relu', 'elu', 'gelu'): raise SystemExit('%s : activation %s non prise en charge' % (name, L['activation']))
    if layers[-1]['kernel'] != 1 or layers[-1]['activation'] != 'linear' or any(L['kernel'] != 3 for L in layers[:-1]):
        raise SystemExit(name + ' : topologie MeshNet attendue (3×3×3 … puis 1×1×1 linéaire)')
    cm = json.load(open(os.path.join(d, cfg['colormap'])))
    labels = cm['labels']
    if len(labels) != layers[-1]['outC']: raise SystemExit('%s : %d étiquettes pour %d classes' % (name, len(labels), layers[-1]['outC']))
    settings = dict(type=cfg['type'], brainchopId=cfg['id'], normalization=cfg['normalization'], cropPadding=cfg['cropPadding'],
                    autoThreshold=cfg['autoThreshold'], transpose=True, preModel=cfg['preModel'], postprocess=True)
    for k in ('noPreModel', 'withPreModel'):
        if k in cfg: settings[k] = cfg[k]
    count = len(data) // 4
    out = dict(format='episcope-meshnet/1', name=name, title=cfg['title'],
               source=dict(repo='https://github.com/neuroneural/brainchop', license='MIT', path='public/models/' + name, commit=git_commit(bc),
                           generatedBy=mj.get('generatedBy'), convertedBy=mj.get('convertedBy')),
               settings=settings, inputShape=klayers[0]['config']['batch_input_shape'][1:], layers=layers, labels=labels,
               colors=[[cm['R'][i], cm['G'][i], cm['B'][i]] for i in range(len(labels))],
               fsCodes=[fs_code(n) for n in labels] if name in ('model21_104class',) else None,
               hemi=[hemi(n) for n in labels],
               weights=dict(dtype='float32', endian='little', count=count, sha256=hashlib.sha256(data).hexdigest(),
                            layout='par couche : noyau [kd][kh][kw][inC][outC] (Keras/tf.js, outC le plus rapide) puis biais [outC] si bias',
                            base64=base64.b64encode(data).decode('ascii')))
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, name + '.json')
    with open(path, 'w', encoding='utf-8') as f: json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    params = count
    print('%-18s %2d couches  %7d paramètres  %8d octets  → %s' % (name, len(layers), params, os.path.getsize(path), os.path.relpath(path, ROOT)))
    return path


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    ap.add_argument('--brainchop', default='/home/claude/neuroneural/brainchop')
    ap.add_argument('--out', default=os.path.join(ROOT, 'assets', 'models'))
    ap.add_argument('names', nargs='*', default=list(MODELS))
    a = ap.parse_args()
    for n in a.names:
        if n not in MODELS: raise SystemExit('modèle inconnu : ' + n + ' (connus : ' + ', '.join(MODELS) + ')')
        convert(a.brainchop, n, a.out)


if __name__ == '__main__':
    main()
