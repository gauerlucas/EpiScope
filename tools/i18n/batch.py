#!/usr/bin/env python3
"""Lots de traduction : python3 tools/i18n/batch.py show N [taille]  → clés du lot N (id<TAB>clé) ;
   python3 tools/i18n/batch.py merge fichier.txt → lignes « id<TAB>anglais » versées dans assets/i18n_en.json
   (« = » : identique au français ; contrôle du nombre de {})."""
import json, sys, os
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
K = json.load(open(os.path.join(R, 'tools', 'i18n', 'fr_keys.json'), encoding='utf-8'))
ENP = os.path.join(R, 'assets', 'i18n_en.json')
EN = json.load(open(ENP, encoding='utf-8')) if os.path.exists(ENP) else {}
SKIPP = os.path.join(R, 'tools', 'i18n', 'same.json')
SAME = set(json.load(open(SKIPP, encoding='utf-8'))) if os.path.exists(SKIPP) else set()
order = sorted(K, key=lambda k: (K[k], list(K).index(k)))
IDS = {k: i for i, k in enumerate(order)}
todo = [k for k in order if k not in EN and k not in SAME]
cmd = sys.argv[1]
if cmd == 'show':
    n, size = int(sys.argv[2]), int(sys.argv[3]) if len(sys.argv) > 3 else 9000
    # lots de ~size caractères sur la liste restante
    out, tot = [], 0
    for k in todo:
        if tot > size and out: break
        out.append(k); tot += len(k)
    print('# %d clés restantes ; lot : %d clés, %d car. ; fichiers : %s' % (len(todo), len(out), tot, sorted(set(K[k] for k in out))))
    for k in out: print('%d\t%s' % (IDS[k], k))
elif cmd == 'merge':
    bad = 0; n = 0
    for line in open(sys.argv[2], encoding='utf-8'):
        line = line.rstrip('\n')
        if not line.strip() or '\t' not in line: continue
        i, v = line.split('\t', 1); k = order[int(i)]
        if v.strip() == '=': SAME.add(k); n += 1; continue
        import re as _re
        nk = k.count('{}'); toks = _re.findall(r'\{(-|\d?)\}', v); num = [t for t in toks if t.isdigit()]
        ok = (len(toks) == nk and not num) or (num and set(map(int, num)) <= set(range(1, nk + 1)) and all(t for t in toks))
        if not ok: print('{} différents :', i, repr(k[:60]), '→', repr(v[:60])); bad += 1; continue
        EN[k] = v; n += 1
    json.dump(EN, open(ENP, 'w', encoding='utf-8'), ensure_ascii=False, indent=0, sort_keys=True)
    json.dump(sorted(SAME), open(SKIPP, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print('%d versées, %d rejetées ; %d traduites, %d identiques, %d restantes' % (n, bad, len(EN), len(SAME), len([k for k in order if k not in EN and k not in SAME])))
