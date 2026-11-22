#!/usr/bin/env python3
"""EDF+D synthétique (aucune donnée de patient) pour les tests de navigation dans les tracés longs.

    python3 tools/tests/make_synth_edfd.py <fichier.edf>

Deux électrodes SEEG (A’1–10, B’1–10 sans B’6 : plot absent), 256 Hz, enregistrements de 1 s, début le 02/06/2021 à
23:30:00 ; trois blocs : 0–600 s, un enregistrement répété (recouvrement d'1 s à 300 s), une coupure de 900 s, puis
600 s (le tracé passe minuit) ; deux crises annotées (EDF+ TAL) : « Crise » à 420 s et « Fin de crise » à 470 s, puis
« Crise » à 1 650 s (temps réel) et « Fin de crise » à 1 700 s ; un clignement (déflexion positive) à 10 s sur A’1."""
import math, random, struct, sys

FS, NREC_A, NREC_B, GAP = 256, 600, 600, 900
random.seed(7)
names = [f"A'{k}" for k in range(1, 11)] + [f"B'{k}" for k in range(1, 11) if k != 6]
ns = len(names) + 1   # + EDF Annotations
ANN_SPR = 60          # 120 octets par enregistrement pour les TAL

def onsets():
    t = []
    for r in range(NREC_A):
        t.append(float(r))
        if r == 300: t.append(float(r))   # recouvrement : même horodatage deux fois
    for r in range(NREC_B): t.append(float(NREC_A + GAP + r))
    return t

def signal(ch, treal, i):
    x = 20 * math.sin(2 * math.pi * 9 * (treal + i / FS) + ch) + random.gauss(0, 8)
    for on in (420.0, NREC_A + GAP + 150.0):
        tt = treal + i / FS - on
        if 0 <= tt < 50 and ch < 5: x += 120 * math.sin(2 * math.pi * (30 - tt * 0.4) * tt)
    tt = treal + i / FS - 10.0
    if ch == 0 and 0 <= tt < 0.4: x += 300 * math.sin(math.pi * tt / 0.4)   # clignement : positif
    return x

def main(path):
    T = onsets(); nrec = len(T)
    events = {420.0: 'Crise', 470.0: 'Fin de crise', float(NREC_A + GAP + 150): 'Crise', float(NREC_A + GAP + 200): 'Fin de crise'}
    hdr = b'0'.ljust(8) + b'X X X X'.ljust(80) + b'Startdate 02-JUN-2021 X X X'.ljust(80) + b'02.06.21' + b'23.30.00'
    hdr += str(256 * (ns + 1)).encode().ljust(8) + b'EDF+D'.ljust(44) + str(nrec).encode().ljust(8) + b'1'.ljust(8) + str(ns).encode().ljust(4)
    lab = [('EEG ' + n).encode('latin1').ljust(16) for n in names] + [b'EDF Annotations'.ljust(16)]
    f = lambda vals: b''.join(vals)
    sh = f(lab) + f([b'Monopolar'.ljust(80)] * (ns - 1) + [b''.ljust(80)]) + f([b'uV'.ljust(8)] * (ns - 1) + [b''.ljust(8)])
    sh += f([b'-3200'.ljust(8)] * (ns - 1) + [b'-1'.ljust(8)]) + f([b'3200'.ljust(8)] * (ns - 1) + [b'1'.ljust(8)])
    sh += f([b'-32768'.ljust(8)] * ns) + f([b'32767'.ljust(8)] * ns) + f([b''.ljust(80)] * ns)
    sh += f([str(FS).encode().ljust(8)] * (ns - 1) + [str(ANN_SPR).encode().ljust(8)]) + f([b''.ljust(32)] * ns)
    out = bytearray(hdr + sh); assert len(out) == 256 * (ns + 1)
    g = 6400 / 65535
    for r, t0 in enumerate(T):
        for ch in range(ns - 1):
            out += struct.pack('<%dh' % FS, *[max(-32768, min(32767, int(round(signal(ch, t0, i) / g)))) for i in range(FS)])
        tal = ('+%g\x14\x14\x00' % t0).encode()
        for on, txt in events.items():
            if t0 <= on < t0 + 1 and not (r > 0 and T[r - 1] == t0): tal += ('+%g\x14%s\x14\x00' % (on, txt)).encode('latin1')
        out += tal.ljust(ANN_SPR * 2, b'\x00')
    open(path, 'wb').write(out)
    print(path, len(out) // 1_000_000, 'Mo', nrec, 'enregistrements')

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'synth_edfd.edf')
