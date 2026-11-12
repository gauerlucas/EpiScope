#!/usr/bin/env python3
"""Extraction des textes français de l'interface (src/*.js, index.html) pour la traduction anglaise.

    python3 tools/i18n_extract.py            → tools/i18n/fr_keys.json (clés à traduire) et l'état de assets/i18n_en.json

Une clé est le texte d'un nœud tel qu'il s'affiche : chaîne JS ou partie d'un gabarit `...` comprise entre deux balises,
espaces réduits, chaque ${…} remplacé par {} ; les attributs title, placeholder, aria-label et alt sont extraits de même.
La traduction (assets/i18n_en.json) associe à chaque clé son texte anglais, avec les mêmes {} dans le même ordre."""
import os, re, json, glob, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
D = lambda *p: os.path.join(ROOT, *p)
FR = re.compile(r"[éèêëàâîïôûùüçœÉÈÊÀÂÎÔÛÇŒ’«»]|\b(le|la|les|des|du|une|un|et|ou|pour|sur|dans|avec|sans|pas|est|sont|au|aux|ce|cette|ces|son|sa|ses|par|en|de|à|qui|que|ne|plus|tous|toutes|tout)\b", re.I)
CODE = re.compile(r"=>|\bfunction\b|\breturn\b|querySelector|\.style\.|\bconst\b|\blet\b|;\s*$|^\s*[.#][a-z][\w-]*(\s|$)|^[a-z]+:[a-z]|px\b|rgba?\(|var\(--|^https?:|\.(js|json|css|png|webp|nii|edf)\b|^[\w.-]+/[\w.+-]+$")
STRONG = re.compile(r"=>|\bfunction\b|\breturn\b|querySelector|\.style\.|\bconst\b|\blet\b|var\(--|rgba?\(")
ATTR = re.compile(r'''\b(title|placeholder|aria-label|alt|data-tip)\s*=\s*("([^"]*)"|'([^']*)')''')
WS = re.compile(r'\s+')
# mots français d'un seul mot, sans accent, affichés tels quels (les autres mots en minuscules sans accent sont des clés)
WORDS = set(open(os.path.join(os.path.dirname(__file__), 'i18n', 'words.txt'), encoding='utf-8').read().split()) if os.path.exists(os.path.join(os.path.dirname(__file__), 'i18n', 'words.txt')) else set()

def norm(s):
    return WS.sub(' ', s).strip()

def keep(s):
    s = norm(s)
    t = re.sub(r'\{\}', '', s)
    if len(re.sub(r'[^A-Za-zÀ-ÿ]', '', t)) < 2: return False
    if CODE.search(s) and not (len(s) > 40 and s.count(' ') > 5 and not STRONG.search(s)): return False   # une phrase qui cite un fichier reste une phrase
    if t in WORDS.union(w for w in WORDS) or (t.strip() in WORDS): return True
    if '{}' in s and re.fullmatch(r'\s*\{\}\s*[a-zà-ÿ’]{3,}\s*(\{\})?\s*', s) and t.strip() in WORDS | {'dossier', 'dossiers', 'crise', 'crises', 'patient', 'patients', 'pointe', 'pointes', 'plot', 'plots', 'voie', 'voies', 'électrode', 'électrodes', 'jour', 'jours', 'élément', 'éléments', 'image', 'images', 'capture', 'captures', 'tracé', 'tracés', 'groupe', 'groupes', 'paire', 'paires', 'stimulation', 'stimulations', 'séance', 'séances', 'exploration', 'explorations', 'signe', 'signes'}: return True
    if re.fullmatch(r'[a-z][A-Za-z0-9_.-]*', t) and not re.search(r'[éèêëàâîïôûùüçœ]', t) and t not in WORDS: return False   # identifiants, clés, classes
    if re.fullmatch(r'[\w-]+(\s+[\w-]+)*', t) and t == t.lower() and not FR.search(t) and ' ' not in t: return False
    return bool(FR.search(t) or re.match(r'[A-ZÀ-Ý][a-zà-ÿ]', t) or ' ' in t.strip())

class Lexer:
    """repère chaînes '…', "…" et gabarits `…${…}…` (imbriqués) en sautant commentaires et expressions régulières"""
    def __init__(self, src): self.s, self.i, self.out = src, 0, []
    def run(self):
        s, n = self.s, len(self.s); prev = ''
        while self.i < n:
            c = s[self.i]
            if c == '/' and s.startswith('//', self.i): self.i = s.find('\n', self.i) if s.find('\n', self.i) >= 0 else n; continue
            if c == '/' and s.startswith('/*', self.i): j = s.find('*/', self.i + 2); self.i = n if j < 0 else j + 2; continue
            if c in '\'"': self.out.append(('s', self.string(c))); prev = 'x'; continue
            if c == '`': self.out.append(('t', self.template())); prev = 'x'; continue
            if c == '/' and (prev in '(,=:[!&|?{};+-*%<>~^' or prev == ''):
                self.regex(); prev = 'x'; continue
            if not c.isspace():
                prev = c if not (c.isalnum() or c in '_$)].') else 'x'
                if c.isalpha():   # mots-clés après lesquels « / » ouvre une expression régulière
                    m = re.match(r'[A-Za-z_$][\w$]*', s[self.i:]); w = m.group(0); self.i += len(w)
                    prev = '(' if w in ('return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'throw') else 'x'; continue
            self.i += 1
        return self.out
    def string(self, q):
        s, i = self.s, self.i + 1; buf = []
        while i < len(s) and s[i] != q:
            if s[i] == '\\': buf.append(self.esc(s[i + 1] if i + 1 < len(s) else '')); i += 2; continue
            if s[i] == '\n': break
            buf.append(s[i]); i += 1
        self.i = i + 1; return ''.join(buf)
    def esc(self, c): return {'n': '\n', 't': '\t', 'r': ''}.get(c, c)
    def regex(self):
        s, i, cls = self.s, self.i + 1, False
        while i < len(s):
            c = s[i]
            if c == '\\': i += 2; continue
            if c == '[': cls = True
            elif c == ']': cls = False
            elif c == '/' and not cls: break
            elif c == '\n': break
            i += 1
        i += 1
        while i < len(s) and s[i].isalpha(): i += 1
        self.i = i
    def template(self):
        """renvoie le texte avec {} à la place des ${…} ; les chaînes internes aux ${…} sont lexées à part"""
        s, i = self.s, self.i + 1; buf = []
        while i < len(s) and s[i] != '`':
            if s[i] == '\\': buf.append(self.esc(s[i + 1])); i += 2; continue
            if s.startswith('${', i):
                depth, j = 1, i + 2
                while j < len(s) and depth:   # expression : on la lexe récursivement pour ses chaînes
                    c = s[j]
                    if c in '\'"`':
                        sub = Lexer(s); sub.i = j
                        if c == '`': self.out.append(('t', sub.template()))
                        else: self.out.append(('s', sub.string(c)))
                        self.out.extend(sub.out); j = sub.i; continue
                    if c == '{': depth += 1
                    elif c == '}': depth -= 1
                    j += 1
                buf.append('{}'); i = j; continue
            buf.append(s[i]); i += 1
        self.i = i + 1; return ''.join(buf)

def segments(text):
    """texte d'un gabarit → nœuds de texte (entre balises) et valeurs d'attributs à traduire"""
    out = []
    for m in ATTR.finditer(text): out.append(m.group(3) if m.group(3) is not None else m.group(4))
    for part in re.split(r'<[^<>]*>', text):
        if '<' in part or '>' in part: part = re.sub(r'[<>]', ' ', part)
        out.append(part)
    return out

def extract():
    keys = {}
    files = sorted(glob.glob(D('src', '*.js')) + glob.glob(D('src', 'imaging', '*.js')))
    SKIP_FILES = {'legal.js', 'i18n.js'}   # textes rédigés dans les deux langues (classe notr) ; le moteur de traduction lui-même
    for f in files:
        if os.path.basename(f) in SKIP_FILES: continue
        rel = os.path.relpath(f, ROOT)
        for kind, text in Lexer(open(f, encoding='utf-8').read()).run():
            for seg in segments(text):
                k = norm(seg.replace('&nbsp;', ' ').replace('&amp;', '&'))
                k = re.sub(r'^[\s·:,;—–|/]+|[\s·:,;—–|/]+$', '', k) if not re.fullmatch(r'[·—–].*', k) else k
                if k and keep(k): keys.setdefault(k, rel)
    import csv   # notes de la base de référence (localisation de chaque signe), affichées au survol des signes
    for r in csv.DictReader(open(D('data', 'signs.csv'), encoding='utf-8-sig')):
        k = norm(r.get('notes') or '')
        if k and keep(k): keys.setdefault(k, 'data/signs.csv')
    html = open(D('index.html'), encoding='utf-8').read()
    html = re.sub(r'<script.*?</script>', ' ', html, flags=re.S); html = re.sub(r'<style.*?</style>', ' ', html, flags=re.S); html = re.sub(r'<!--.*?-->', ' ', html, flags=re.S)
    for seg in segments(html):
        k = norm(seg)
        if k and keep(k): keys.setdefault(k, 'index.html')
    return keys

if __name__ == '__main__':
    keys = extract()
    os.makedirs(D('tools', 'i18n'), exist_ok=True)
    json.dump(keys, open(D('tools', 'i18n', 'fr_keys.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    en = {}
    if os.path.exists(D('assets', 'i18n_en.json')): en = json.load(open(D('assets', 'i18n_en.json'), encoding='utf-8'))
    todo = [k for k in keys if k not in en]
    print('%d clés, %d traduites, %d à traduire, %d caractères à traduire' % (len(keys), len(keys) - len(todo), len(todo), sum(map(len, todo))))
    if '--todo' in sys.argv:
        json.dump({k: keys[k] for k in todo}, open(D('tools', 'i18n', 'todo.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
