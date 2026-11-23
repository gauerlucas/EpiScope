"""Point de contrôle SpikeNet2 SYNTHÉTIQUE (poids aléatoires, architecture réduite) enregistré par PyTorch Lightning, comme
le vrai « new_weights.ckpt » (state_dict préfixé « model. », état de l'optimiseur Adam, hyperparamètres, rappels), et
sorties attendues : sert à vérifier src/spikenet2.js (lecture du .ckpt, entrée du réseau, calcul) sans les vrais poids.

  pip install torch pytorch_lightning
  python3 tools/tests/make_synth_spikenet2.py            → tools/tests/fixtures/spikenet2_synth.ckpt + spikenet2_synth.json
  python3 tools/tests/make_synth_spikenet2.py --full OUT → point de contrôle aléatoire de taille réelle (mesure du temps de calcul ; jamais commité)"""
import os, sys, json, numpy as np, torch, pytorch_lightning as pl
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ref_spikenet2 import Net1D
torch.manual_seed(7); np.random.seed(7)
FULL = '--full' in sys.argv
MONO = ['Fp1', 'F3', 'C3', 'P3', 'F7', 'T3', 'T5', 'O1', 'Fz', 'Cz', 'Pz', 'Fp2', 'F4', 'C4', 'P4', 'F8', 'T4', 'T6', 'O2']
BIP = ['Fp1-F7', 'F7-T3', 'T3-T5', 'T5-O1', 'Fp2-F8', 'F8-T4', 'T4-T6', 'T6-O2', 'Fp1-F3', 'F3-C3', 'C3-P3', 'P3-O1', 'Fp2-F4', 'F4-C4', 'C4-P4', 'P4-O2', 'Fz-Cz', 'Cz-Pz']

class ResNet(pl.LightningModule):
    def __init__(self, lr=1e-4, n_channels=37, **kw):
        super().__init__(); self.save_hyperparameters(); self.lr = lr
        self.model = Net1D() if FULL else Net1D(cin=n_channels, base=8, filters=(8, 16, 16, 32, 32, 48, 48), blocks=(2, 1, 1, 2, 1, 1, 2), k=16, gw=4)
    def forward(self, x): return self.model(x)
    def training_step(self, b, i): x, y = b; return torch.nn.functional.binary_cross_entropy(self(x), y.view(-1, 1))
    def configure_optimizers(self): return torch.optim.Adam(self.parameters(), lr=self.lr)

def prep(raw):
    """CDAC_combine_montage + extremes_remover(2000, 20) + normalisation par le 95e centile (code des auteurs, réécrit)"""
    bi = np.array([[MONO.index(a), MONO.index(b)] for a, b in (p.split('-') for p in BIP)])
    x = np.vstack([raw[bi[:, 0]] - raw[bi[:, 1]], raw - raw.mean(0, keepdims=True)]).astype(np.float64)
    for c in range(x.shape[0]):
        pp = x[c].max() - x[c].min()
        if pp < 20 or pp > 2000: x[c] = 0
    return x / (np.quantile(np.abs(x), 0.95, method='linear', axis=-1, keepdims=True) + 1e-8)

m = ResNet()
X = torch.randn(32, 37, 128); Y = torch.rand(32)
tr = pl.Trainer(max_steps=1, accelerator='cpu', logger=False, enable_checkpointing=False, enable_progress_bar=False, enable_model_summary=False)
tr.fit(m, torch.utils.data.DataLoader(torch.utils.data.TensorDataset(X, Y), batch_size=16))
with torch.no_grad():                                         # statistiques des normalisations non triviales
    for mod in m.modules():
        if isinstance(mod, torch.nn.BatchNorm1d): mod.running_mean.uniform_(-0.5, 0.5); mod.running_var.uniform_(0.5, 2.0); mod.weight.uniform_(0.5, 1.5); mod.bias.uniform_(-0.3, 0.3)
out = sys.argv[sys.argv.index('--full') + 1] if FULL else os.path.join(os.path.dirname(__file__), 'fixtures', 'spikenet2_synth.ckpt')
tr.save_checkpoint(out)
if FULL: print('point de contrôle de taille réelle :', out, os.path.getsize(out) // 1e6, 'Mo'); sys.exit(0)
# fenêtres brutes (µV) : bruit, pointe, voie plate (mise à zéro), voie saturée
t = np.arange(128) / 128.; raws = []
for w in range(4):
    r = np.random.randn(19, 128) * 15 + 10 * np.sin(2 * np.pi * 9 * t + np.arange(19)[:, None])
    if w == 1: r[12] += -150 * np.exp(-((t - 0.5) / 0.02) ** 2); r[13] += -110 * np.exp(-((t - 0.5) / 0.02) ** 2)
    if w == 2: r[:] = 0.1 * np.random.randn(19, 128)
    if w == 3: r[0] += 3000 * (t > 0.5)
    raws.append(r)
inp = np.stack([prep(r) for r in raws]).astype(np.float32)
m.eval()
with torch.no_grad(): p = m(torch.from_numpy(inp)).numpy()[:, 0]
json.dump({'raw': [r.astype(np.float32).ravel().tolist() for r in raws], 'inp': inp.ravel().tolist(), 'p': p.tolist()}, open(out.replace('.ckpt', '.json'), 'w'))
print(out, os.path.getsize(out), 'octets ; p =', p)
