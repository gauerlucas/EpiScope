"""Exporte SpikeNet1.o (Jing et al., JAMA Neurol 2020 ; github.com/bdsp-core/SpikeNet1, CC BY-NC 4.0, usage non commercial)
vers assets/models/spikenet1.json pour sa ré-implémentation JavaScript (src/spikenet.js).

  - poids Keras (model/spikenet1.o_weights.h5) relus avec h5py, normalisations par lot fondues dans les convolutions
    (échelle et biais), conv2d_1 et conv2d_2 (linéaires, sans biais, sans activation entre elles) composées en un tableau
    C[j][i][o] (8 × 8 × 32) qui permet le calcul exact aux bords des fenêtres (remplissage par des zéros de Keras) ;
  - filtres de run_spikenet.py (mne.filter.filter_data passe-haut 0,5 Hz puis notch_filter, RIF « firwin » à phase nulle)
    à 128 Hz, sous forme de réponses impulsionnelles en cascade (notch 50 Hz et 60 Hz).
Usage : python3 tools/export_spikenet1.py <dossier SpikeNet1> → assets/models/spikenet1.json"""
import sys, json, base64, h5py, numpy as np
from mne.filter import filter_data, notch_filter
src = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/bdsp-core/spikenet1'
W = h5py.File(src + '/model/spikenet1.o_weights.h5', 'r')
g = lambda l, k: np.array(W[l][l][k + ':0'], dtype=np.float64)
def bn(l):
    sc = g(l, 'gamma') / np.sqrt(g(l, 'moving_variance') + 1e-3); return sc, g(l, 'beta') - g(l, 'moving_mean') * sc
b64 = lambda a: base64.b64encode(np.ascontiguousarray(a, dtype=np.float32).tobytes()).decode()
k1 = g('conv2d_1', 'kernel')[:, 0, 0, :]            # (8, 32)
k2 = g('conv2d_2', 'kernel')[:, 0, :, :]            # (8, 32, 32)
s1, b1 = bn('batch_normalization_1')
C = np.einsum('jfo,if->jio', k2, k1) * s1           # (8 j, 8 i, 32) : conv2 ∘ conv1, échelle de la normalisation fondue
W3 = g('conv2d_3', 'kernel')[0]                     # (37, 32, 32)
L = {}
for n, (c, b) in {'4': ('conv2d_4', 'batch_normalization_2'), '5': ('conv2d_5', 'batch_normalization_3'), '6': ('conv2d_6', 'batch_normalization_4'), '7': ('conv2d_7', 'batch_normalization_5'), '8': ('conv2d_8', 'batch_normalization_6')}.items():
    k = g(c, 'kernel')[:, 0]; s, bb = bn(b); L['w' + n] = b64(k * s); L['b' + n] = b64(bb); L['s' + n] = list(k.shape)
# filtres à 128 Hz : réponse impulsionnelle (impulsion au centre d'un long signal ; le remplissage des bords n'y intervient pas)
N = 8193; d = np.zeros((1, N)); d[0, N // 2] = 1
hp = filter_data(d, 128., 0.5, None, method='fir', verbose=False)
filt = {}
for f0 in (50, 60):
    h = notch_filter(hp, 128., f0, method='fir', verbose=False)[0]; nz = np.nonzero(np.abs(h) > 1e-12)[0]; r = max(N // 2 - nz[0], nz[-1] - N // 2)
    filt[str(f0)] = b64(h[N // 2 - r:N // 2 + r + 1])
hp0 = hp[0]; nz = np.nonzero(np.abs(hp0) > 1e-12)[0]; r = max(N // 2 - nz[0], nz[-1] - N // 2); filt['0'] = b64(hp0[N // 2 - r:N // 2 + r + 1])
J = dict(name='SpikeNet1.o', src='Jing J et al., JAMA Neurol 2020;77:103-108 (doi:10.1001/jamaneurol.2019.3485) — github.com/bdsp-core/SpikeNet1, licence CC BY-NC 4.0 (usage non commercial, attribution)',
         fs=128, win=128, mono=['Fp1','F3','C3','P3','F7','T3','T5','O1','Fz','Cz','Pz','Fp2','F4','C4','P4','F8','T4','T6','O2'],
         bip=['Fp1-F7','F7-T3','T3-T5','T5-O1','Fp2-F8','F8-T4','T4-T6','T6-O2','Fp1-F3','F3-C3','C3-P3','P3-O1','Fp2-F4','F4-C4','C4-P4','P4-O2','Fz-Cz','Cz-Pz'],
         C=b64(C), b1=b64(b1), w3=b64(W3), wd=b64(g('dense_1', 'kernel')[:, 0]), bd=float(g('dense_1', 'bias')[0]), filt=filt, **L)
json.dump(J, open('assets/models/spikenet1.json', 'w'), separators=(',', ':'))
print('spikenet1.json', sum(len(v) for v in J.values() if isinstance(v, str)) // 1024, 'ko ; filtres', {k: len(base64.b64decode(v)) // 4 for k, v in filt.items()})
