"""Réimplémentation de référence (PyTorch) de l'architecture Net1D de SpikeNet2, écrite d'après la lecture du code
public (bdsp-core/SpikeNet2, sleeplib/Resnet_15/net1d.py) : sert à produire des points de contrôle synthétiques
(poids aléatoires) et les sorties attendues pour vérifier la réimplémentation JavaScript. Aucun poids réel."""
import torch, torch.nn as nn, torch.nn.functional as F

class PadConv(nn.Module):
    def __init__(s, cin, cout, k, stride, groups=1):
        super().__init__(); s.k, s.st = k, stride; s.conv = nn.Conv1d(cin, cout, k, stride, groups=groups)
    def forward(s, x):
        L = x.shape[-1]; o = (L + s.st - 1) // s.st; p = max(0, (o - 1) * s.st + s.k - L)
        return s.conv(F.pad(x, (p // 2, p - p // 2)))

class PadPool(nn.Module):
    def __init__(s, k): super().__init__(); s.k = k; s.pool = nn.MaxPool1d(k)
    def forward(s, x): p = max(0, s.k - 1); return s.pool(F.pad(x, (p // 2, p - p // 2)))

swish = lambda x: x * torch.sigmoid(x)

class Block(nn.Module):
    def __init__(s, cin, cout, ratio, k, stride, groups, down, first):
        super().__init__(); s.cin, s.cout, s.down, s.first = cin, cout, down, first; st = stride if down else 1; mid = int(cout * ratio)
        s.bn1 = nn.BatchNorm1d(cin); s.conv1 = PadConv(cin, mid, 1, 1)
        s.bn2 = nn.BatchNorm1d(mid); s.conv2 = PadConv(mid, mid, k, st, groups)
        s.bn3 = nn.BatchNorm1d(mid); s.conv3 = PadConv(mid, cout, 1, 1)
        s.se_fc1 = nn.Linear(cout, cout // 2); s.se_fc2 = nn.Linear(cout // 2, cout)
        if down: s.max_pool = PadPool(st)
    def forward(s, x):
        idt, out = x, x
        if not s.first: out = swish(s.bn1(out))
        out = s.conv1(out); out = s.conv2(swish(s.bn2(out))); out = s.conv3(swish(s.bn3(out)))
        se = torch.sigmoid(s.se_fc2(swish(s.se_fc1(out.mean(-1))))); out = out * se[:, :, None]
        if s.down: idt = s.max_pool(idt)
        if s.cout != s.cin:
            c1 = (s.cout - s.cin) // 2; idt = F.pad(idt.transpose(-1, -2), (c1, s.cout - s.cin - c1)).transpose(-1, -2)
        return out + idt

class Stage(nn.Module):
    def __init__(s, cin, cout, ratio, k, stride, groups, i_stage, m):
        super().__init__(); s.block_list = nn.ModuleList([Block(cin if i == 0 else cout, cout, ratio, k, stride if i == 0 else 1, groups, i == 0, i_stage == 0 and i == 0) for i in range(m)])
    def forward(s, x):
        for b in s.block_list: x = b(x)
        return x

class Net1D(nn.Module):
    def __init__(s, cin=37, base=64, ratio=1, filters=(64, 160, 160, 400, 400, 1024, 1024), blocks=(2, 2, 2, 3, 3, 4, 4), k=16, stride=2, gw=16):
        super().__init__(); s.first_conv = PadConv(cin, base, k, 2); s.first_bn = nn.BatchNorm1d(base)
        s.stage_list = nn.ModuleList(); c = base
        for i, (f, m) in enumerate(zip(filters, blocks)): s.stage_list.append(Stage(c, f, ratio, k, stride, f // gw, i, m)); c = f
        s.dense = nn.Linear(c, 1)
    def forward(s, x):
        x = swish(s.first_bn(s.first_conv(x)))
        for st in s.stage_list: x = st(x)
        return torch.sigmoid(s.dense(x.mean(-1)))
