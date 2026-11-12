#!/usr/bin/env python3
"""Manuel d'utilisation d'EpiScope, en français et en anglais, consultable hors ligne.

    python3 tools/build_manual.py          → docs/manuel/EpiScope_manuel.html (fichier unique, deux langues)
                                             et assets/manual.json (repris par tools/build.py dans l'application)
    python3 tools/build_manual.py --pdf    → en plus : docs/manuel/EpiScope_Manuel_FR.pdf, EpiScope_Manual_EN.pdf
                                             et le mémo de démarrage (EpiScope_Demarrage_rapide_FR.pdf, EpiScope_Quick_start_EN.pdf)

Sources : docs/manuel/src/<langue>/*.md (une page par fichier) et docs/manuel/img/<langue>/*.webp (captures).
En plus du Markdown :
    en-tête      ---\\nid: seeg\\ntitle: SEEG\\ngroup: path\\norder: 40\\nctx: seeg/loc>localiser, seeg/analyses>quantifier\\n---
                 group : start (Démarrer), path (Parcours), more (Pour en savoir plus), ref (Référence) ;
                 ctx : écrans de l'application (étape/vue) dont l'aide « ? » ouvre cette page, à l'ancre donnée après >
    [[Bouton]]   élément de l'interface              ![légende](shot:nom)   capture img/<langue>/nom.webp ({.half} : demi-largeur)
    [texte](@page#ancre)   renvoi interne            !!! bref | astuce | attention | methode   encadrés
    ??? plus "Pour aller plus loin"   repli
    {refs: ei cei}         références des Crédits (src/credits.js, clés de REFS), placées sous le titre de la méthode"""
import os, re, sys, json, base64, html, unicodedata, datetime
import markdown

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
D = lambda *p: os.path.join(ROOT, *p)
MAN = D('docs', 'manuel')
_BRAND = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()   # source unique : EPISCOPE_BRAND d'index.html
_b = lambda k, d='': (re.search(k + r": '([^']*)'", _BRAND) or [None, d])[1]
VERSION, AUTHOR, ORCID = _b('version', '?'), _b('author', 'Lucas Gauer'), _b('orcid')
BYLINE = AUTHOR + (' · ORCID ' + ORCID if ORCID else '')
FOOTLINE = AUTHOR + (' · <a href="https://orcid.org/%s">ORCID %s</a>' % (ORCID, ORCID) if ORCID else '')
LANGS = ['fr', 'en']
GROUPS = [('start', {'fr': 'Démarrer', 'en': 'Get started'}), ('path', {'fr': 'Le parcours du patient', 'en': 'The patient pathway'}),
          ('more', {'fr': 'Pour en savoir plus', 'en': 'Learn more'}), ('ref', {'fr': 'Référence', 'en': 'Reference'})]
UI = {
    'fr': {'title': 'Manuel d’utilisation', 'search': 'Rechercher dans le manuel…', 'search_s': 'Rechercher…', 'onpage': 'Sur cette page', 'prev': 'Précédent', 'next': 'Suivant',
           'print': 'Imprimer ou enregistrer en PDF', 'theme': 'Thème clair / sombre', 'menu': 'Sommaire', 'noresult': 'Aucun résultat',
           'bref': 'En bref', 'astuce': 'Astuce', 'attention': 'Attention', 'methode': 'Méthode', 'plus': 'Pour aller plus loin',
           'missing': 'capture à venir', 'cover': 'Manuel d’utilisation', 'toc': 'Sommaire', 'version': 'version', 'zoom': 'Cliquer pour agrandir',
           'month': ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
           'tagline': 'Sémiologie, EEG, imagerie, SEEG et staff : le dossier de chirurgie de l’épilepsie'},
    'en': {'title': 'User manual', 'search': 'Search the manual…', 'search_s': 'Search…', 'onpage': 'On this page', 'prev': 'Previous', 'next': 'Next',
           'print': 'Print or save as PDF', 'theme': 'Light / dark theme', 'menu': 'Contents', 'noresult': 'No results',
           'bref': 'In short', 'astuce': 'Tip', 'attention': 'Caution', 'methode': 'Method', 'plus': 'Learn more',
           'missing': 'screenshot to come', 'cover': 'User manual', 'toc': 'Contents', 'version': 'version', 'zoom': 'Click to enlarge',
           'month': ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
           'tagline': 'Semiology, EEG, imaging, SEEG and MDT meetings: the epilepsy surgery record'},
}
warnings = []

def load_refs():
    """références vérifiées de la fenêtre Crédits (src/credits.js, objet REFS au format JSON) : une seule source"""
    s = open(D('src', 'credits.js'), encoding='utf-8').read()
    i = s.index('const REFS = ') + len('const REFS = '); d = 0
    for j in range(i, len(s)):
        if s[j] == '{': d += 1
        elif s[j] == '}':
            d -= 1
            if not d: break
    return json.loads(s[i:j + 1])
REFS = load_refs()

def ref_html(k):
    r = REFS[k]; e = html.escape
    t = r.get('t', ''); t = t if t[-1:] in '.?!' else t + '.'
    j = r.get('j', ''); src = ('<i>%s</i>' % e(j)) if j and not j.startswith('In:') else e(j)
    num = '%s%s%s' % (r.get('y', ''), (';' + e(r['v'])) if r.get('v') else '', (':' + e(r['p'])) if r.get('p') else '')
    link = ('<a href="https://doi.org/%s">doi:%s</a>' % (e(r['doi']), e(r['doi']))) if r.get('doi') else ('<a href="%s">%s</a>' % (e(r['url']), e(r['url']))) if r.get('url') else ''
    return '<p>%s. %s %s %s.%s</p>' % (e(r.get('a', '')).rstrip('.'), e(t), src, num, (' ' + link) if link else '')

def refs_block(m, where):
    keys = m.group(1).replace(',', ' ').split()
    bad = [k for k in keys if k not in REFS]
    if bad: warnings.append('%s : référence inconnue %s' % (where, ', '.join(bad)))
    return '\n<div class="refs">%s</div>\n' % ''.join(ref_html(k) for k in keys if k in REFS)

def slug(s):
    s = unicodedata.normalize('NFKD', re.sub(r"['’]", '', html.unescape(re.sub(r'<[^>]+>', '', s)))).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')[:60] or 's'

def front(text):
    m = re.match(r'---\n(.*?)\n---\n', text, re.S)
    meta = {}
    if m:
        for line in m.group(1).splitlines():
            if ':' in line: k, v = line.split(':', 1); meta[k.strip()] = v.strip().strip('"')
        text = text[m.end():]
    return meta, text

def b64(path, mime):
    with open(path, 'rb') as f: return 'data:%s;base64,%s' % (mime, base64.b64encode(f.read()).decode())

def page_html(lang, meta, body, shots):
    pid = meta['id']; u = UI[lang]
    body = re.sub(r'\[\[(.+?)\]\]', lambda m: '<span class="ui">%s</span>' % m.group(1), body)
    body = re.sub(r'^\{refs:\s*([^}]+)\}\s*$', lambda m: refs_block(m, lang + '/' + pid), body, flags=re.M)
    body = re.sub(r'^(!!!|\?\?\?) (bref|astuce|attention|methode|plus)\s*$', lambda m: '%s %s "%s"' % (m.group(1), m.group(2), u[m.group(2)]), body, flags=re.M)
    md = markdown.Markdown(extensions=['extra', 'admonition', 'pymdownx.details', 'sane_lists', 'toc'],
                           extension_configs={'toc': {'slugify': lambda s, sep: lang + '--' + pid + '--' + slug(s), 'toc_depth': '2-3'}})
    h = md.convert(body)
    h = re.sub(r'<(h[1-6]) id="(?!%s--%s--)([^"]+)"' % (lang, pid), lambda m: '<%s id="%s--%s--%s"' % (m.group(1), lang, pid, m.group(2)), h)   # ancres posées à la main {#…}
    def fig(m):
        attrs = m.group(0); alt = re.search(r'alt="([^"]*)"', attrs); name = re.search(r'src="shot:([\w\-]+)"', attrs).group(1)
        cls = re.search(r'class="([^"]*)"', attrs); cap = html.unescape(alt.group(1)) if alt else ''   # légende : HTML permis ([[Bouton]])
        alt_txt = html.escape(re.sub(r'<[^>]+>', '', cap), quote=True)
        src = None
        for l in [lang] + [x for x in LANGS if x != lang]:
            p = os.path.join(MAN, 'img', l, name + '.webp')
            if os.path.exists(p): src = l + '/' + name; shots.add(src); break
        if not src:
            warnings.append('%s/%s : capture absente « %s »' % (lang, pid, name))
            return '<figure class="shot missing %s"><div class="ph">%s · %s</div><figcaption>%s</figcaption></figure>' % (cls.group(1) if cls else '', name, u['missing'], cap)
        if not src.startswith(lang + '/'): warnings.append('%s/%s : capture « %s » reprise de l’autre langue' % (lang, pid, name))
        return '<figure class="shot %s"><img data-img="%s" alt="%s" title="%s"><figcaption>%s</figcaption></figure>' % (cls.group(1) if cls else '', src, alt_txt, u['zoom'], cap)
    h = re.sub(r'<p>\s*(<img [^>]*src="shot:[^>]*>)\s*</p>', lambda m: fig(re.match(r'.*', m.group(1))), h)
    h = re.sub(r'<img [^>]*src="shot:[^>]*>', fig, h)
    h = re.sub(r'href="@([\w\-]+)(?:#([\w\-]+))?"', lambda m: 'href="#/%s/%s%s" class="xref"' % (lang, m.group(1), '/' + m.group(2) if m.group(2) else ''), h)
    h = re.sub(r'<div class="admonition (\w+)">\s*<p class="admonition-title">([^<]*)</p>', r'<div class="call \1"><p class="call-t">\2</p>', h)
    h = re.sub(r'<details class="plus">', '<details class="plus">', h)
    return h

def section_index(lang, pid, ptitle, h):
    out = []; parts = re.split(r'(<h2 id="[^"]+">.*?</h2>)', h)
    cur_t, cur_a, buf = ptitle, '', []
    def flush():
        txt = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', ' '.join(buf)))).strip()
        if txt or cur_a: out.append({'p': pid, 'a': cur_a, 't': cur_t, 'pt': ptitle, 'x': txt[:4000]})
    for part in parts:
        m = re.match(r'<h2 id="([^"]+)">(.*?)</h2>', part)
        if m: flush(); cur_a = m.group(1).split('--', 2)[2]; cur_t = html.unescape(re.sub(r'<[^>]+>', '', m.group(2))); buf = []
        else: buf.append(part)
    flush(); return out

def load():
    pages = {l: [] for l in LANGS}; shots = set(); ctx = {}
    for l in LANGS:
        d = os.path.join(MAN, 'src', l)
        if not os.path.isdir(d): continue
        for fn in sorted(os.listdir(d)):
            if not fn.endswith('.md'): continue
            meta, body = front(open(os.path.join(d, fn), encoding='utf-8').read())
            meta.setdefault('id', re.sub(r'^\d+[-_]', '', fn[:-3])); meta.setdefault('group', 'path'); meta.setdefault('order', '50')
            if not meta.get('title'): m = re.search(r'^# (.+)$', body, re.M); meta['title'] = m.group(1) if m else meta['id']
            body = re.sub(r'^# .+\n', '', body, count=1, flags=re.M)
            h = page_html(l, meta, body, shots)
            pages[l].append({'id': meta['id'], 'title': meta['title'], 'group': meta['group'], 'order': float(meta['order']), 'short': meta.get('short', meta['title']),
                             'lead': meta.get('lead', ''), 'html': h, 'idx': section_index(l, meta['id'], meta['title'], h)})
            for c in filter(None, (x.strip() for x in meta.get('ctx', '').split(','))):
                k, _, a = c.partition('>'); ctx.setdefault(k.strip(), meta['id'] + ('/' + a.strip() if a.strip() else ''))
        gorder = {g: i for i, (g, _) in enumerate(GROUPS)}
        pages[l].sort(key=lambda p: (gorder.get(p['group'], 9), p['order']))
    for l in LANGS:   # renvois internes : page et ancre existent
        anchors = {p['id']: set(re.findall(r'id="%s--%s--([\w\-]+)"' % (l, p['id']), p['html'])) for p in pages[l]}
        for p in pages[l]:
            for pg, a in re.findall(r'href="#/%s/([\w\-]+)(?:/([\w\-]+))?"' % l, p['html']):
                if pg not in anchors or (a and a not in anchors[pg]): warnings.append('%s/%s : renvoi cassé → %s%s' % (l, p['id'], pg, '#' + a if a else ''))
        for k, v in ctx.items():
            pg, _, a = v.partition('/')
            if pages[l] and (pg not in anchors or (a and a not in anchors[pg])): warnings.append('%s : écran %s → ancre absente %s' % (l, k, v))
    ids = {l: [p['id'] for p in pages[l]] for l in LANGS}
    if ids['fr'] != ids['en']: warnings.append('pages différentes : fr %s / en %s' % (set(ids['fr']) ^ set(ids['en']), ''))
    return pages, shots, ctx

CSS = r"""
@font-face{font-family:"Aleo";src:url(%ALEO%) format("woff2");font-weight:100 900;font-display:swap}
@font-face{font-family:"Bodoni Moda";src:url(%BODONI%) format("woff2");font-weight:500;font-display:swap}
:root{--navy:#19518e;--navy2:#123e6e;--beige:#afa186;--sand:#8a7a56;--bg:#f6f4ef;--paper:#fffefb;--ink:#17253a;--ink2:#36445a;--muted:#667185;--faint:#8b93a1;
--line:#e4dfd5;--soft:#efebe3;--accent:#19518e;--link:#1d5fa6;--mark:#fdf0b5;--code:#f0ece4;--shadow:0 1px 2px rgba(20,35,58,.06),0 6px 22px rgba(20,35,58,.07);
--serif:"Aleo",Georgia,"Times New Roman",serif;--sans:Arial,"Liberation Sans","Helvetica Neue",system-ui,sans-serif;--brand:"Bodoni Moda","Didot","Bodoni MT",Georgia,serif;
--bref:#e8eff8;--astuce:#f4efe2;--attention:#fbeceb;--methode:#eef1ee;color-scheme:light}
:root[data-theme=dark]{--bg:#0b121d;--paper:#101927;--ink:#e6ebf2;--ink2:#c9d2de;--muted:#93a1b4;--faint:#6b788a;--line:#223148;--soft:#162131;--accent:#cdb98f;--link:#8fbde9;--mark:#5a4a14;--code:#172333;
--shadow:0 1px 2px rgba(0,0,0,.3),0 8px 26px rgba(0,0,0,.25);--bref:#13253b;--astuce:#262214;--attention:#2d1719;--methode:#16241d;color-scheme:dark}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#0b121d;--paper:#101927;--ink:#e6ebf2;--ink2:#c9d2de;--muted:#93a1b4;--faint:#6b788a;--line:#223148;--soft:#162131;--accent:#cdb98f;--link:#8fbde9;--mark:#5a4a14;--code:#172333;
--shadow:0 1px 2px rgba(0,0,0,.3),0 8px 26px rgba(0,0,0,.25);--bref:#13253b;--astuce:#262214;--attention:#2d1719;--methode:#16241d;color-scheme:dark}}
*{box-sizing:border-box}html{scroll-padding-top:72px}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.62 var(--sans);-webkit-font-smoothing:antialiased}
a{color:var(--link);text-decoration-thickness:1px;text-underline-offset:2px}
.top{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:14px;height:58px;padding:0 18px;background:var(--navy);color:#fff;border-bottom:1px solid #0f3d6e}
:root[data-theme=dark] .top{background:#0e1a2b;border-bottom-color:#c3b38e33}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]) .top{background:#0e1a2b;border-bottom-color:#c3b38e33}}
.top .burger{display:none}
.brand{display:flex;align-items:baseline;gap:10px;color:#fff;text-decoration:none;white-space:nowrap}
.brand b{font:500 25px/1 var(--brand);letter-spacing:.3px}.brand span{font:500 14px/1 var(--serif);color:#e3d6b5;letter-spacing:.2px}
.top .sp{flex:1}
.srch{position:relative;width:min(340px,34vw)}
.srch input{width:100%;height:34px;border-radius:17px;border:1px solid rgba(255,255,255,.28);background:rgba(255,255,255,.1);color:#fff;padding:0 14px 0 34px;font:14px var(--sans);outline:none}
.srch input::placeholder{color:#c9d6e6}.srch input:focus{background:rgba(255,255,255,.18);border-color:#fff}
.srch svg{position:absolute;left:12px;top:9px;width:16px;height:16px;stroke:#d8e2ef;fill:none;stroke-width:2}
.res{position:absolute;top:40px;left:0;width:min(520px,92vw);max-height:70vh;overflow:auto;background:var(--paper);color:var(--ink);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow);padding:6px;display:none}
.res.on{display:block}.res a{display:block;padding:8px 10px;border-radius:8px;color:var(--ink);text-decoration:none}.res a:hover,.res a.sel{background:var(--soft)}
.res b{display:block;font:600 14px var(--sans)}.res small{color:var(--muted);font-size:12.5px}.res .sn{display:block;font-size:13px;color:var(--ink2);margin-top:2px}
.res mark{background:var(--mark);color:inherit;border-radius:2px}.res .none{padding:10px;color:var(--muted)}
.tbtn{height:32px;min-width:32px;border-radius:8px;border:1px solid rgba(255,255,255,.28);background:transparent;color:#fff;font:600 13px var(--sans);cursor:pointer;padding:0 9px;display:inline-flex;align-items:center;justify-content:center;gap:6px}
.tbtn:hover{background:rgba(255,255,255,.14)}.lang{display:inline-flex;border:1px solid rgba(255,255,255,.28);border-radius:8px;overflow:hidden}
.lang button{border:0;background:transparent;color:#d8e2ef;font:600 12.5px var(--sans);padding:0 10px;height:30px;cursor:pointer}.lang button.on{background:#fff;color:var(--navy)}
.wrap{display:grid;grid-template-columns:278px minmax(0,1fr) 230px;max-width:1500px;margin:0 auto}
.side{position:sticky;top:58px;height:calc(100vh - 58px);overflow:auto;padding:22px 14px 40px 22px;border-right:1px solid var(--line)}
.side h4{margin:20px 0 6px;font:700 11.5px var(--sans);letter-spacing:.09em;text-transform:uppercase;color:var(--sand)}
:root[data-theme=dark] .side h4{color:var(--accent)}
.side h4:first-child{margin-top:0}
.side a{display:block;padding:5px 10px;border-radius:7px;color:var(--ink2);text-decoration:none;font-size:14.5px;line-height:1.35}
.side a:hover{background:var(--soft)}.side a.on{background:var(--soft);color:var(--ink);font-weight:700;box-shadow:inset 3px 0 0 var(--navy)}
:root[data-theme=dark] .side a.on{box-shadow:inset 3px 0 0 var(--accent)}
.side .sub a{font-size:13.2px;padding:3px 10px 3px 22px;color:var(--muted)}.side .sub a.on{font-weight:600;color:var(--ink);box-shadow:none}
main{min-width:0;padding:34px 48px 60px}
article{max-width:820px;margin:0 auto}
article h1{font:600 36px/1.15 var(--serif);color:var(--navy);margin:0 0 6px;letter-spacing:-.2px}
:root[data-theme=dark] article h1{color:var(--ink)}
.lead{font-size:18.5px;line-height:1.5;color:var(--ink2);margin:6px 0 26px}
article h2{font:600 25px/1.25 var(--serif);margin:42px 0 12px;padding-top:6px;color:var(--ink)}
article h3{font:700 18px/1.3 var(--sans);margin:28px 0 8px;color:var(--ink)}
article h2+h3{margin-top:10px}
article p,article li{color:var(--ink)}article li{margin:4px 0}
article ul,article ol{padding-left:24px}
article table{border-collapse:collapse;width:100%;margin:16px 0;font-size:14.5px;background:var(--paper);border:1px solid var(--line);border-radius:10px;overflow:hidden}
article th{background:var(--soft);text-align:left;font-weight:700}article th,article td{padding:8px 12px;border-bottom:1px solid var(--line);vertical-align:top}
article tr:last-child td{border-bottom:0}
code{font:13.5px "Cascadia Mono",Consolas,Menlo,monospace;background:var(--code);padding:1px 5px;border-radius:5px}
kbd{display:inline-block;font:600 12.5px var(--sans);padding:1px 7px;border:1px solid var(--line);border-bottom-width:2px;border-radius:6px;background:var(--paper);color:var(--ink);white-space:nowrap}
.ui{font-weight:700;color:var(--ink);background:var(--soft);border:1px solid var(--line);border-radius:6px;padding:0 6px;white-space:nowrap;font-size:.94em}
figure.shot{margin:22px 0 26px}figure.shot img{display:block;max-width:100%;height:auto;border-radius:10px;border:1px solid var(--line);box-shadow:var(--shadow);cursor:zoom-in;background:var(--paper)}
figure.shot figcaption{font-size:13.5px;color:var(--muted);margin-top:8px;line-height:1.45}
figure.half{max-width:420px}figure.third{max-width:300px}
figure.missing .ph{height:170px;display:grid;place-items:center;border:1.5px dashed var(--line);border-radius:10px;color:var(--faint);font-size:13px}
.refs{margin:-2px 0 16px;padding:4px 0 4px 12px;border-left:3px solid var(--sand);font-size:12.5px;line-height:1.45;color:var(--muted)}.refs p{margin:3px 0}.refs i{font-style:italic}.refs a{color:inherit;text-decoration:underline;text-decoration-color:color-mix(in srgb,currentColor 35%,transparent);overflow-wrap:break-word}
.call{border-radius:12px;padding:14px 18px 6px;margin:20px 0;border:1px solid var(--line);background:var(--paper)}
.call .call-t{margin:0 0 6px;font:700 12px var(--sans);letter-spacing:.08em;text-transform:uppercase}
.call.bref{background:var(--bref);border-color:transparent;box-shadow:inset 4px 0 0 var(--navy)}.call.bref .call-t{color:var(--navy)}
:root[data-theme=dark] .call.bref{box-shadow:inset 4px 0 0 var(--accent)}:root[data-theme=dark] .call.bref .call-t{color:var(--accent)}
.call.astuce{background:var(--astuce);border-color:transparent;box-shadow:inset 4px 0 0 var(--beige)}.call.astuce .call-t{color:var(--sand)}
.call.attention{background:var(--attention);border-color:transparent;box-shadow:inset 4px 0 0 #c0262d}.call.attention .call-t{color:#b0262d}
.call.methode{background:var(--methode);border-color:transparent;box-shadow:inset 4px 0 0 #3d7a5a}.call.methode .call-t{color:#3d7a5a}
.call p:last-child,.call ul:last-child{margin-bottom:10px}
details.plus{border:1px solid var(--line);border-radius:12px;background:var(--paper);margin:18px 0;padding:0 18px}
details.plus>summary{cursor:pointer;padding:12px 0;font-weight:700;color:var(--ink2);list-style:none}
details.plus>summary::before{content:"＋";display:inline-block;width:22px;color:var(--sand)}details.plus[open]>summary::before{content:"－"}
details.plus[open]{padding-bottom:6px}
.cards>ul,.cards>ol{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(235px,1fr));gap:12px;margin:16px 0 22px}
.cards li{margin:0}.cards li>a{display:block;height:100%;padding:14px 16px;border:1px solid var(--line);border-radius:12px;background:var(--paper);color:var(--ink2);text-decoration:none;box-shadow:0 1px 1px rgba(20,35,58,.03);font-size:14.5px;line-height:1.45;transition:border-color .15s,transform .15s}
.cards li>a:hover{border-color:var(--navy);transform:translateY(-1px)}:root[data-theme=dark] .cards li>a:hover{border-color:var(--accent)}
.cards li>a strong{display:block;font:600 16.5px/1.3 var(--serif);color:var(--ink);margin-bottom:3px}
.steps>ol{counter-reset:st;list-style:none;padding:0}.steps>ol>li{counter-increment:st;position:relative;padding:2px 0 8px 52px;margin:0 0 16px}
.steps>ol>li::before{content:counter(st);position:absolute;left:0;top:0;width:36px;height:36px;border-radius:50%;background:var(--navy);color:#fff;font:600 17px/36px var(--serif);text-align:center}
:root[data-theme=dark] .steps>ol>li::before{background:var(--accent);color:#1b1709}
.time{display:inline-block;font:700 12px var(--sans);color:var(--sand);border:1px solid var(--beige);border-radius:999px;padding:1px 9px;margin-left:6px;vertical-align:2px;letter-spacing:.03em}
.pn{max-width:820px;margin:48px auto 0;display:flex;gap:12px;justify-content:space-between;border-top:1px solid var(--line);padding-top:20px}
.pn a{flex:1;max-width:48%;padding:12px 16px;border:1px solid var(--line);border-radius:12px;text-decoration:none;color:var(--ink);background:var(--paper)}
.pn a:hover{border-color:var(--navy)}.pn small{display:block;color:var(--muted);font-size:12.5px}.pn b{font:600 16px var(--serif)}.pn .nx{text-align:right;margin-left:auto}
.toc{position:sticky;top:58px;height:calc(100vh - 58px);overflow:auto;padding:34px 18px 30px 8px;font-size:13.5px}
.toc h5{margin:0 0 8px;font:700 11.5px var(--sans);letter-spacing:.09em;text-transform:uppercase;color:var(--faint)}
.toc a{display:block;padding:3px 0 3px 12px;border-left:2px solid var(--line);color:var(--muted);text-decoration:none;line-height:1.35}
.toc a.h3{padding-left:24px;font-size:12.8px}.toc a.on{border-left-color:var(--navy);color:var(--ink);font-weight:600}
:root[data-theme=dark] .toc a.on{border-left-color:var(--accent)}
.lb{position:fixed;inset:0;z-index:50;background:rgba(8,14,24,.86);display:none;align-items:center;justify-content:center;padding:24px;cursor:zoom-out}
.lb.on{display:flex}.lb img{max-width:100%;max-height:100%;border-radius:8px;box-shadow:0 10px 40px rgba(0,0,0,.5)}
.cover,.ptoc{display:none}
.foot{max-width:820px;margin:40px auto 0;color:var(--faint);font-size:12.5px;text-align:center}
@media (max-width:1180px){.wrap{grid-template-columns:262px minmax(0,1fr)}.toc{display:none}main{padding:30px 34px 50px}}
@media (max-width:820px){.wrap{display:block}.side{position:fixed;top:58px;left:0;bottom:0;width:min(320px,86vw);height:auto;background:var(--paper);z-index:30;transform:translateX(-102%);transition:transform .2s;box-shadow:var(--shadow)}
body.drawer .side{transform:none}.top .burger{display:inline-flex}.srch{width:auto;flex:1}.brand span,.tbtn.pr{display:none}main{padding:22px 18px 44px}
article h1{font-size:29px}article h2{font-size:22px}.lead{font-size:17px}}
@media (max-width:520px){.brand{display:none}.brand b{font-size:21px}.lang button{padding:0 7px}.top{gap:8px;padding:0 10px}}
body.embed .tbtn.pr{display:none}body.embed .brand span{display:none}
@page{size:A4;margin:15mm 15mm 17mm}
@media print{
html{scroll-padding-top:0}body{background:#fff;color:#111;font-size:10.6pt;line-height:1.5}
.top,.side,.toc,.pn,.lb,.foot{display:none!important}.wrap{display:block}main{padding:0}article{max-width:none}
article:not(.pr-on){display:none!important}article.pr-on{display:block!important;break-before:page}
article h1{font-size:23pt;color:#19518e}article h2{font-size:15pt;break-after:avoid;margin-top:22pt}article h3{font-size:12pt;break-after:avoid}
figure.shot{break-inside:avoid}figure.shot img{box-shadow:none;max-height:120mm;width:auto}
.call,details.plus,table,.cards li{break-inside:avoid}details.plus>summary::before{content:""}
details.plus:not([open])>*:not(summary){display:block}
.cards>ul{grid-template-columns:repeat(2,1fr)}a{color:inherit;text-decoration:none}
.cover{display:flex;flex-direction:column;justify-content:space-between;height:265mm;padding:20mm 6mm 6mm}
.cover .cb{display:flex;align-items:center;gap:10mm}.cover .cb img{width:42mm}.cover h1{font:500 46pt/1 var(--brand);margin:0;color:#14233a}
.cover h2{font:600 22pt var(--serif);color:#19518e;margin:6mm 0 3mm}.cover p{color:#555;font-size:12pt;max-width:140mm}
.cover .co{display:flex;justify-content:space-between;align-items:flex-end;color:#666;font-size:10pt}
.ptoc{display:block;break-before:page}.ptoc h2{font:600 20pt var(--serif);color:#19518e}.ptoc h4{margin:12pt 0 4pt;font-size:9pt;letter-spacing:.08em;text-transform:uppercase;color:#8a7a56}
.ptoc a{display:block;padding:2.5pt 0;border-bottom:.5pt dotted #ccc;font-size:11pt}
body:not(.print-all) .cover,body:not(.print-all) .ptoc{display:none}}
"""

JS = r"""
(function(){
'use strict';
const P = JSON.parse(document.getElementById('pages').textContent), CTX = JSON.parse(document.getElementById('ctx').textContent);
const IDX = JSON.parse(document.getElementById('idx').textContent), UI = JSON.parse(document.getElementById('ui').textContent);
let IMG = null; const img = () => IMG || (IMG = JSON.parse(document.getElementById('imgs').textContent));
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };
if (window.parent !== window) document.body.classList.add('embed');
let lang = 'fr', page = null;
const th = store('episcope_manual_theme'); if (th) document.documentElement.dataset.theme = th;
function parse() {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, '')).split('/');
  if (h[0] === 'print') return { print: true, lang: P[h[1]] ? h[1] : 'fr', page: h[2] || null };
  const l = P[h[0]] ? h[0] : (store('episcope_manual_lang') || ((navigator.language || 'fr').startsWith('fr') ? 'fr' : 'en'));
  const ids = P[l].map(p => p.id); return { lang: l, page: ids.includes(h[1]) ? h[1] : ids[0], anchor: h[2] || '' };
}
function loadImgs(root) { const M = img(); root.querySelectorAll('img[data-img]').forEach(i => { if (!i.src) i.src = M[i.dataset.img] || ''; }); }
function side() {
  const groups = {}; P[lang].forEach(p => (groups[p.group] = groups[p.group] || []).push(p));
  let h = ''; for (const [g, label] of UI.groups) { if (!groups[g]) continue; h += '<h4>' + label[lang] + '</h4>';
    for (const p of groups[g]) { h += '<a href="#/' + lang + '/' + p.id + '" data-p="' + p.id + '">' + p.short + '</a>';
      if (p.id === page) { const art = $('#' + lang + '--' + p.id); const hs = art ? [...art.querySelectorAll('h2')] : [];
        if (hs.length > 1) h += '<div class="sub">' + hs.map(x => '<a href="#/' + lang + '/' + p.id + '/' + x.id.split('--')[2] + '" data-a="' + x.id + '">' + x.textContent + '</a>').join('') + '</div>'; } } }
  $('.side').innerHTML = h; $$('.side a[data-p="' + page + '"]').forEach(a => a.classList.add('on'));
}
function toc(art) {
  const hs = [...art.querySelectorAll('h2,h3')]; const t = $('.toc');
  t.innerHTML = hs.length > 1 ? '<h5>' + UI.t[lang].onpage + '</h5>' + hs.map(x => '<a class="' + x.tagName.toLowerCase() + '" href="#/' + lang + '/' + page + '/' + x.id.split('--')[2] + '" data-a="' + x.id + '">' + x.textContent + '</a>').join('') : '';
}
function pn() {
  const L = P[lang], i = L.findIndex(p => p.id === page), a = L[i - 1], b = L[i + 1];
  $('.pn').innerHTML = (a ? '<a href="#/' + lang + '/' + a.id + '"><small>← ' + UI.t[lang].prev + '</small><b>' + a.title + '</b></a>' : '') + (b ? '<a class="nx" href="#/' + lang + '/' + b.id + '"><small>' + UI.t[lang].next + ' →</small><b>' + b.title + '</b></a>' : '');
}
function chrome() {
  document.documentElement.lang = lang; $$('.lang button').forEach(b => b.classList.toggle('on', b.dataset.l === lang));
  $('#q').placeholder = innerWidth < 600 ? UI.t[lang].search_s : UI.t[lang].search; $('.tbtn.pr').title = UI.t[lang].print; $('.tbtn.th').title = UI.t[lang].theme; $('.burger').title = UI.t[lang].menu;
  $('.brand span').textContent = UI.t[lang].title;
}
function render() {
  const r = parse();
  if (r.print) return printAll(r.lang, r.page);
  document.body.classList.remove('print-all'); $$('article.pr-on').forEach(a => a.classList.remove('pr-on'));
  const changed = r.lang !== lang || r.page !== page; lang = r.lang; page = r.page; store('episcope_manual_lang', lang);
  $$('article').forEach(a => a.hidden = !(a.dataset.lang === lang && a.dataset.page === page));
  const art = $('#' + lang + '--' + page); loadImgs(art); chrome(); side(); toc(art); pn();
  const p = P[lang].find(x => x.id === page); document.title = p.title + ' · EpiScope — ' + UI.t[lang].title;
  const target = r.anchor && document.getElementById(lang + '--' + page + '--' + r.anchor);
  if (target) target.scrollIntoView(); else if (changed) window.scrollTo(0, 0);
  document.body.classList.remove('drawer'); spy();
}
function spy() {
  const art = $('#' + lang + '--' + page); if (!art) return; const hs = [...art.querySelectorAll('h2,h3')]; let cur = null;
  for (const h of hs) { if (h.getBoundingClientRect().top < 110) cur = h.id; else break; }
  $$('.toc a,.side .sub a').forEach(a => a.classList.toggle('on', a.dataset.a === cur));
}
addEventListener('scroll', () => requestAnimationFrame(spy), { passive: true });
addEventListener('hashchange', render);
// Liens internes routés ici : dans la fenêtre d'aide (iframe srcdoc), un lien « #… » se résout sur l'URL de l'application
// et rechargerait celle-ci dans l'iframe. Les liens externes s'ouvrent dans un onglet.
document.addEventListener('click', e => {
  const a = e.target.closest('a[href]'); if (!a) return; const h = a.getAttribute('href');
  if (h[0] === '#') { e.preventDefault(); if (location.hash === h) render(); else location.hash = h; }
  else if (/^(https?:|mailto:)/.test(h)) { e.preventDefault(); window.open(h, '_blank', 'noopener'); }
}, true);
// ---- recherche
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const NX = {}; for (const l in IDX) NX[l] = IDX[l].map(e => ({ e, t: norm(e.t), pt: norm(e.pt), x: norm(e.x) }));
let sel = -1;
function search(q) {
  const box = $('.res'), w = norm(q).split(/\s+/).filter(x => x.length > 1); sel = -1;
  if (!w.length) { box.classList.remove('on'); return; }
  const out = [];
  for (const n of NX[lang]) {
    let s = 0, ok = true; for (const x of w) { const a = n.t.includes(x), b = n.pt.includes(x), c = n.x.indexOf(x); if (!a && !b && c < 0) { ok = false; break; } s += (a ? 6 : 0) + (b ? 3 : 0) + (c >= 0 ? 1 + Math.min(3, n.x.split(x).length - 2) * .3 : 0); }
    if (ok) out.push([s, n]);
  }
  out.sort((a, b) => b[0] - a[0]);
  const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const hl = s => { let r = esc(s); for (const x of w) r = r.replace(new RegExp('(' + x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').split('').map(ch => ch + '[\\u0300-\\u036f]?').join('') + ')', 'gi'), '<mark>$1</mark>'); return r; };
  box.innerHTML = out.slice(0, 14).map(([, n]) => { const i = n.x.indexOf(w[0]), a = Math.max(0, i - 50); const sn = i >= 0 ? (a ? '…' : '') + n.e.x.slice(a, a + 150) + '…' : '';
    return '<a href="#/' + lang + '/' + n.e.p + (n.e.a ? '/' + n.e.a : '') + '"><b>' + hl(n.e.t) + '</b>' + (n.e.t !== n.e.pt ? '<small>' + esc(n.e.pt) + '</small>' : '') + '<span class="sn">' + hl(sn) + '</span></a>'; }).join('') || '<div class="none">' + UI.t[lang].noresult + '</div>';
  box.classList.add('on');
}
const q = $('#q');
q.addEventListener('input', () => search(q.value));
q.addEventListener('keydown', e => { const as = $$('.res a'); if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, Math.min(as.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1))); as.forEach((a, i) => a.classList.toggle('sel', i === sel)); }
  else if (e.key === 'Enter') { const a = as[Math.max(0, sel)]; if (a) { location.hash = a.getAttribute('href'); $('.res').classList.remove('on'); q.blur(); } } else if (e.key === 'Escape') { $('.res').classList.remove('on'); q.blur(); } });
document.addEventListener('click', e => { if (!e.target.closest('.srch')) $('.res').classList.remove('on'); if (e.target.closest('.res a')) $('.res').classList.remove('on'); });
document.addEventListener('keydown', e => { if ((e.key === '/' || (e.key === 'k' && (e.ctrlKey || e.metaKey))) && document.activeElement !== q) { e.preventDefault(); q.focus(); q.select(); } if (e.key === 'Escape') { $('.lb').classList.remove('on'); document.body.classList.remove('drawer'); } });
// ---- commandes
$$('.lang button').forEach(b => b.onclick = () => { location.hash = '#/' + b.dataset.l + '/' + page; });
$('.tbtn.th').onclick = () => { const dark = getComputedStyle(document.documentElement).colorScheme === 'dark'; const t = dark ? 'light' : 'dark'; document.documentElement.dataset.theme = t; store('episcope_manual_theme', t); };
$('.burger').onclick = () => document.body.classList.toggle('drawer');
$('.tbtn.pr').onclick = () => { location.hash = '#print/' + lang; setTimeout(() => window.print(), 400); };
addEventListener('afterprint', () => { if (/^#print/.test(location.hash)) location.hash = '#/' + lang + '/' + (page || P[lang][0].id); });
document.addEventListener('click', e => { const i = e.target.closest('figure.shot img'); if (i) { $('.lb img').src = i.src; $('.lb').classList.add('on'); } else if (e.target.closest('.lb')) $('.lb').classList.remove('on'); });
function printAll(l, only) {
  lang = l; chrome(); document.body.classList.toggle('print-all', !only);
  $$('article').forEach(a => { const on = a.dataset.lang === l && (!only || a.dataset.page === only); a.classList.toggle('pr-on', on); a.hidden = !on; if (on) { loadImgs(a); a.querySelectorAll('details').forEach(d => d.open = true); } });
  $('.cover h2').textContent = UI.t[l].cover; $('.cover p').textContent = UI.t[l].tagline; $('.cover .ver').textContent = UI.date[l];
  const groups = {}; P[l].forEach(p => (groups[p.group] = groups[p.group] || []).push(p));
  $('.ptoc').innerHTML = '<h2>' + UI.t[l].toc + '</h2>' + UI.groups.filter(([g]) => groups[g]).map(([g, lab]) => '<h4>' + lab[l] + '</h4>' + groups[g].map(p => '<a>' + p.title + '</a>').join('')).join('');
  document.title = 'EpiScope — ' + UI.t[l].cover;
}
// ---- aide contextuelle depuis l'application : { type: 'episcope-manual', lang, key | page, anchor }
function resolve(key) { let k = String(key || ''); while (k) { if (CTX[k]) return CTX[k]; k = k.includes('/') ? k.slice(0, k.lastIndexOf('/')) : ''; } return ''; }
addEventListener('message', e => { const m = e.data; if (!m || m.type !== 'episcope-manual') return; const l = P[m.lang] ? m.lang : lang; if (m.theme && !store('episcope_manual_theme')) document.documentElement.dataset.theme = m.theme;
  const t = m.page ? m.page + (m.anchor ? '/' + m.anchor : '') : resolve(m.key) || P[l][0].id; location.hash = '#/' + l + '/' + t; });
window.EpiManual = { go: (l, key) => { location.hash = '#/' + (P[l] ? l : lang) + '/' + (resolve(key) || P[lang][0].id); }, resolve };
render();
})();
"""

def build(pdf=False):
    pages, shots, ctx = load()
    if not pages['fr']: sys.exit('aucune page dans docs/manuel/src/fr')
    now = datetime.date.today()
    dates = {l: '%s %s · %s %d' % (UI[l]['version'], VERSION, UI[l]['month'][now.month - 1], now.year) for l in LANGS}
    imgs = {s: b64(os.path.join(MAN, 'img', *s.split('/')) + '.webp', 'image/webp') for s in sorted(shots)}
    meta = {l: [{k: p[k] for k in ('id', 'title', 'group', 'short')} for p in pages[l]] for l in LANGS}
    idx = {l: [e for p in pages[l] for e in p['idx']] for l in LANGS}
    ui = {'groups': [[g, lab] for g, lab in GROUPS], 't': UI, 'date': dates}
    arts = []
    for l in LANGS:
        for p in pages[l]:
            lead = '<p class="lead">%s</p>' % p['lead'] if p['lead'] else ''
            arts.append('<article id="%s--%s" data-lang="%s" data-page="%s" hidden><h1>%s</h1>%s%s</article>' % (l, p['id'], l, p['id'], p['title'], lead, p['html']))
    j = lambda o: json.dumps(o, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    css = CSS.replace('%ALEO%', b64(D('assets', 'Aleo-var.woff2'), 'font/woff2')).replace('%BODONI%', b64(D('assets', 'BodoniModa-500.woff2'), 'font/woff2'))
    brain = b64(D('assets', 'logo_brain.webp'), 'image/webp')
    out = f"""<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>EpiScope — Manuel d’utilisation · User manual</title><link rel="icon" href="{b64(D('assets', 'favicon.png'), 'image/png')}">
<script>try{{var t=localStorage.getItem('episcope_manual_theme');if(t)document.documentElement.dataset.theme=t}}catch(e){{}}</script>
<style>{css}</style></head><body>
<header class="top"><button class="tbtn burger" aria-label="menu">☰</button><a class="brand" href="#/"><b>EpiScope</b><span></span></a>
<div class="srch"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="q" type="search" autocomplete="off"><div class="res"></div></div>
<span class="sp"></span><div class="lang"><button data-l="fr">FR</button><button data-l="en">EN</button></div>
<button class="tbtn th" aria-label="theme"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 0 0 17z" fill="currentColor"/></svg></button><button class="tbtn pr" aria-label="print"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M7 9V3h10v6M7 17H4v-7h16v7h-3"/><path d="M7 14h10v7H7z"/></svg></button></header>
<div class="cover"><div><div class="cb"><img src="{brain}" alt=""><h1>EpiScope</h1></div><h2></h2><p></p></div><div class="co"><span class="ver"></span><span>{BYLINE}</span></div></div>
<div class="ptoc"></div>
<div class="wrap"><nav class="side"></nav><main>{''.join(arts)}<nav class="pn"></nav><div class="foot">EpiScope · {FOOTLINE}</div></main><aside class="toc"></aside></div>
<div class="lb"><img alt=""></div>
<script type="application/json" id="pages">{j(meta)}</script><script type="application/json" id="ctx">{j(ctx)}</script>
<script type="application/json" id="idx">{j(idx)}</script><script type="application/json" id="ui">{j(ui)}</script>
<script type="application/json" id="imgs">{j(imgs)}</script>
<script>{JS}</script></body></html>"""
    os.makedirs(MAN, exist_ok=True)
    with open(os.path.join(MAN, 'EpiScope_manuel.html'), 'w', encoding='utf-8') as f: f.write(out)
    with open(D('assets', 'manual.json'), 'w', encoding='utf-8') as f: f.write(json.dumps({'html': out, 'ctx': ctx}, ensure_ascii=False))
    n = {l: len(pages[l]) for l in LANGS}
    print('docs/manuel/EpiScope_manuel.html  %.1f Mo · pages fr %d, en %d · %d captures · %d écrans reliés' % (len(out.encode()) / 1e6, n['fr'], n['en'], len(imgs), len(ctx)))
    for w in warnings: print('  ·', w)
    if pdf: make_pdf()

def make_pdf():
    from playwright.sync_api import sync_playwright
    url = 'file://' + os.path.join(MAN, 'EpiScope_manuel.html')
    jobs = [('fr', None, 'EpiScope_Manuel_FR.pdf'), ('en', None, 'EpiScope_Manual_EN.pdf'), ('fr', 'demarrage', 'EpiScope_Demarrage_rapide_FR.pdf'), ('en', 'demarrage', 'EpiScope_Quick_start_EN.pdf')]
    foot = '<div style="width:100%;font:8px Arial;color:#888;padding:0 15mm;display:flex;justify-content:space-between"><span>EpiScope — {t}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>'
    import io
    from PIL import Image
    jpegs = {}
    for l in LANGS:
        d = os.path.join(MAN, 'img', l)
        for fn in sorted(os.listdir(d)) if os.path.isdir(d) else []:
            if not fn.endswith('.webp'): continue
            im = Image.open(os.path.join(d, fn)).convert('RGB'); im.thumbnail((1400, 1400)); bio = io.BytesIO(); im.save(bio, 'JPEG', quality=80, optimize=True)
            jpegs[l + '/' + fn[:-5]] = 'data:image/jpeg;base64,' + base64.b64encode(bio.getvalue()).decode()
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page()
        for l, only, fn in jobs:
            pg.goto(url + '#print/' + l + ('/' + only if only else '')); pg.wait_for_timeout(800)
            pg.evaluate("m=>document.querySelectorAll('img[data-img]').forEach(i=>{if(m[i.dataset.img])i.src=m[i.dataset.img]})", jpegs)   # JPEG pour l'impression : PDF plus léger
            pg.evaluate("async()=>{for(const i of document.images){if(!i.complete)await new Promise(r=>{i.onload=i.onerror=r})}}")
            pg.pdf(path=os.path.join(MAN, fn), format='A4', print_background=True, display_header_footer=True, header_template='<span></span>',
                   footer_template=foot.replace('{t}', UI[l]['title']), margin={'top': '15mm', 'bottom': '17mm', 'left': '15mm', 'right': '15mm'})
            print('docs/manuel/%s  %.1f Mo' % (fn, os.path.getsize(os.path.join(MAN, fn)) / 1e6))
        b.close()

if __name__ == '__main__':
    build('--pdf' in sys.argv)
