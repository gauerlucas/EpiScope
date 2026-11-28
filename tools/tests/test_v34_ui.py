#!/usr/bin/env python3
"""v3.4.0 — interface (Chromium headless, Playwright ; électrodes du cas d'exemple synthétique, données générées ici) :
   pointage intercritique (catégories visibles), analyse visuelle dans Analyses (3D, coupes), rapport SEEG et diaporama ;
   liste des images de l'écran Imagerie ; développement actuel sans pastilles ; concordance (sources des pointes, plots
   pointés, vignettes, icônes, hémisphères séparés) ; hypothèse modifiée pendant le staff ; diapositives patient
   recomposées ; EEG intercritique sans les crises, bandeau des jours, captures en diaporama ; synthèse de
   l'électrophysiologie ; staff précédent avant l'implantation ; schéma d'implantation 2D (grille de Talairach, faces).
   python3 tools/tests/test_v34_ui.py   (après python3 tools/build.py)"""
import re
import os, sys, json
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'tools', 'tests', 'out'); os.makedirs(OUT, exist_ok=True)
FX = json.load(open(os.path.join(ROOT, 'tools/tests/fixtures/exemple_seeg_temporal_mesial_gauche.json'), encoding='utf-8'))
fails = []
def check(c, msg):
    print(('ok    ' if c else 'ÉCHEC ') + msg)
    if not c: fails.append(msg)

SETUP = """async (E) => {
  const S = SV.Store, L = SV.Library, d = S.newDossier({ pseudo: 'V33UI' }), P = d.patient, C = P.clin = P.clin || {};
  P.sex = 'M'; P.birthDate = '2005-03-02'; P.handedness = 'R'; P.dominant = 'L'; P.dominanceMethod = 'presumed'; P.onsetAge = 3;
  C.edinburgh = 80; C.pointingR = 8; C.pointingL = 0; C.eye = 'R'; C.familyLeftHanded = 'non';
  C.lifestyle = '- Scolarisé en CE2\\n- Vit avec ses parents et un frère\\n- Pratique la natation';
  C.subjective = 'Sensation ascendante épigastrique, puis impression d’étrangeté.'; C.objective = 'Mouvements hypermoteurs, cri.'; C.duration = '10 s'; C.longestFree = '18 mois';
  C.antecedentsText = '- Asthme\\n- Ténotomie'; C.birth = { gaWeeks: 39, gaDays: 0, weight: '3350', length: '52', hc: '35', mode: 'vaginal', apgar: '10-10' };
  C.milestones = { sit: { months: 6 }, walk: { months: 15 } };
  C.anthro = [{ id: 'w1', date: '2016-03-01', weight: '30', height: '135', hc: '', note: '' }, { id: 'w2', date: '2019-03-01', weight: '45', height: '154', hc: '', note: '' }];
  const ex1 = S.addExploration(d, { kind: 'phase1', start: '2020-07-01', end: '2020-07-05' }); ex1.eeg = ex1.eeg || {};
  Object.assign(ex1.eeg, { background: 'Rythme alpha postérieur à 9 Hz.', interictal: 'Pointes frontopolaires gauches au sommeil.', ictal: 'Pointes Fp1 puis thêta diffus.', postictal: 'Ralentissement bifrontal.', synthInter: 'Pointes frontopolaires gauches.', synthIctal: 'Début frontopolaire gauche.', conclusion: 'Implication frontopolaire gauche.' });
  ex1.eeg.map = { spikesS: { Fp1: 2, F3: 1 }, ictal: { Fp1: 2 } };
  for (const [i, t] of [[0, '2020-07-01T14:56'], [1, '2020-07-05T03:10']].map(x => x)) { const z = S.addSeizure(d, ex1.id, { datetime: t, habitual: 'yes', vigilance: 'sleep' }); z.events = [{ id: 1, sign_id: 'aura_epigastric', t: 0, dt: 1, dur: 5, side: '', topography: '', conf: 1, note: '' }, { id: 2, sign_id: 'hyperkinetic', t: 4, dt: 1, dur: 6, side: '', topography: '', conf: 1, note: '' }]; }
  // captures intercritiques (petites images générées)
  const png = async (col) => { const c = document.createElement('canvas'); c.width = 160; c.height = 90; const g = c.getContext('2d'); g.fillStyle = col; g.fillRect(0, 0, 160, 90); g.strokeStyle = '#000'; for (let k = 0; k < 8; k++) { g.beginPath(); for (let x = 0; x < 160; x += 4) g.lineTo(x, 10 + 10 * k + 3 * Math.sin(x / 7 + k)); g.stroke(); } const b = await new Promise(r => c.toBlob(r, 'image/png')); return new Uint8Array(await b.arrayBuffer()); };
  for (const [k, day, vig] of [[0, '2020-07-02', 'S'], [1, '2020-07-03', 'V']]) { const g = S.addGalleryItem(d, { explorationId: ex1.id, kind: 'interictal', title: 'Pointes ' + (k + 1), date: day, vigilance: vig }); g.file = 'gallery/' + g.id + '.png'; const u8 = await png(k ? '#eef' : '#fee'); g.w = 160; g.h = 90; await L.writeFile(d, g.file, u8); }
  const m1 = S.addMeeting ? S.addMeeting(d, { kind: 'post_phase1', date: '2020-09-01' }) : null;
  const ex2 = S.addExploration(d, { kind: 'seeg', start: '2021-05-30', end: '2021-06-10' }); ex2.electrodes = E;
  const zs = S.addSeizure(d, ex2.id, { datetime: '2021-06-02T10:00', habitual: 'yes' }); zs.seeg = Object.assign(zs.seeg || {}, { onset: { 'A’1': 'onset', 'A’2': 'onset', 'B’1': 'early' } });
  const dec = m1 ? S.addDecision(d, { meetingId: m1.id, type: 'seeg', date: '2020-09-01' }) : null; if (dec) dec.createdExplorationId = ex2.id;
  if (m1) { m1.conclusion = 'SEEG frontale et temporale gauche.'; S.addHypothesis(d, { meetingId: m1.id, title: 'Cingulaire gauche', side: 'L', ez: [1], prop: [], confidence: 'medium' }); }
  const I = ex2.inter = S.normalizeInter(ex2.inter); I.lesional = { 'A’1': 1, 'A’2': 1 }; const g1 = S.addInterGroup(ex2, { label: 'Réseau 1', contacts: ['A’1', 'A’2', 'A’3'], freq: 'frequent' }); S.addInterGroup(ex2, { label: 'Réseau 2', contacts: ['B’1', 'B’2'], freq: 'rare', vig: 'S' });
  const m2 = S.addMeeting ? S.addMeeting(d, { kind: 'post_seeg', date: '2021-07-10' }) : null;
  await L.save(d); await SV.app.openDossier(d.id, { quiet: true });
  return { d: d.id, ex1: ex1.id, ex2: ex2.id, m1: m1 && m1.id, m2: m2 && m2.id };
}"""

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': 1700, 'height': 1000}, locale='fr-FR'); errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
    pg.goto('file://' + os.path.join(ROOT, 'dist', 'EpiScope.html')); pg.wait_for_timeout(2500)
    ids = pg.evaluate(SETUP, FX['electrodes']); pg.wait_for_timeout(1500)
    check(bool(ids['m1'] and ids['m2']), f'dossier synthétique : deux staffs {ids}')

    # ---------------------------------------------------------------- dossier : imagerie, développement
    pg.evaluate("() => SV.app.go({ stage: 'dossier', view: 'developpement' })"); pg.wait_for_timeout(900)
    r = pg.evaluate("() => ({ chips: document.querySelectorAll('.devc-b').length, scale: document.body.innerText.includes('seule une échelle standardisée') })")
    check(r['chips'] == 0 and not r['scale'], f'développement actuel : sans pastilles ni phrase sur les échelles {r}')
    pg.evaluate("() => SV.app.go({ stage: 'dossier', view: 'imagerie' })"); pg.wait_for_timeout(900)
    r = pg.evaluate("() => { const s = document.querySelector('.im-left details.im-cat summary'); if (!s) return null; const cs = getComputedStyle(s.closest('details')); return { disp: cs.display, radius: cs.borderRadius }; }")
    check(r is None or r['radius'] in ('0px', '') or 'flex' not in r['disp'], f'liste des images : catégories sans le style des pastilles intercritiques {r}')

    # ---------------------------------------------------------------- intercritique : catégories visibles, analyse visuelle
    pg.evaluate("(id) => SV.app.go({ stage: 'ex:' + id, view: 'inter' })", ids['ex2']); pg.wait_for_timeout(1500)
    n0 = pg.evaluate("() => document.querySelectorAll('#inMarks .im-c[style*=gradient]').length")
    pg.click('#inMarks [data-show=one]'); pg.wait_for_timeout(300)
    n1 = pg.evaluate("() => ({ g: document.querySelectorAll('#inMarks .im-c[style*=gradient]').length, les: document.querySelectorAll('#inMarks .im-c.les').length })")
    check(n0 >= 5 and n1['g'] == 0 and n1['les'] == 2, f'grille : catégories superposées ({n0} plots colorés), puis la catégorie choisie seule {n1}')
    pg.click('#inMarks [data-show=all]'); pg.wait_for_timeout(300)
    pg.evaluate("(id) => SV.app.go({ stage: 'ex:' + id, view: 'analyses' })", ids['ex2']); pg.wait_for_timeout(2500)
    r = pg.evaluate("() => ({ rows: [...document.querySelectorAll('#tab-quant .ivx-row')].map(x => x.dataset.iv), wm: SV.app.ui.wm })")
    check(len(r['rows']) == 4 and r['rows'][0] == 'all', f'Analyses : analyse visuelle (toutes, rythme lésionnel, deux groupes) {r}')
    r = pg.evaluate("""async () => { const A = SV.app; document.querySelector('#tab-quant .ivx-row[data-iv=all] .qx-eye').click(); await new Promise(r => setTimeout(r, 500));
      const V3 = A.viewer, mk = (V3.markers || []).filter(m => m.kind === 'inter'); return { cfg: V3.activeCfg.inter, all: mk.filter(m => m.set === 'all').length, cols: [...new Set(mk.filter(m => m.set === 'all').map(m => m.color.join(',')))].length }; }""")
    check(r['cfg'] == 'all' and r['all'] == 5 and r['cols'] >= 2, f'vue 3D : plots pointés colorés par catégorie {r}')
    pg.screenshot(path=os.path.join(OUT, 'v34_analyses_visuel.png'))

    # ---------------------------------------------------------------- staff après la SEEG : diaporama
    pg.evaluate("(id) => { const A = SV.app; A.ui.meetingId = id; A.openPresentation(SV.Store.byId(A.dossier.meetings, id)); }", ids['m2']); pg.wait_for_timeout(2000)
    keys = pg.evaluate("() => SV.app._pres.slides.map(s => s.key || s.kind)")
    print('diapositives :', keys)
    for k in ['dev', 'history', 'life', 'hx', 'eegint:' + ids['ex1'], 'iim:' + ids['ex1'], 'syn:' + ids['ex1'], 'prevconc:' + ids['m1'], 'seegint:' + ids['ex2'], 'seegsyn:' + ids['ex2'], 'concord']:
        check(k in keys, f'diapositive présente : {k}')
    IMPL = 'impl:' + ids['ex2'] if 'impl:' + ids['ex2'] in keys else 'implplan:' + ids['ex2']
    check(IMPL in keys and keys.index('prevconc:' + ids['m1']) < keys.index(IMPL), f'staff précédent avant l’implantation ({IMPL.split(":")[0]})')
    def show(key, wait=1200):
        pg.evaluate("(k) => { const P = SV.app._pres, i = P.slides.findIndex(s => s.key === k); SV.app.presentShow(i); }", key); pg.wait_for_timeout(wait)
    show('dev'); r = pg.evaluate("() => ({ ms: document.querySelectorAll('#presentation .pr-ms tr').length, mes: [...document.querySelectorAll('#presentation h4')].some(h => /Mesures/.test(h.textContent)), charts: document.querySelectorAll('#presentation .pr-devg figure').length, d0: [...document.querySelectorAll('#presentation .pr-devg svg')].every(x => x.dataset.d0 === '0'), adult: document.querySelectorAll('#presentation .pr-devg .gr-adl').length })")
    check(r['ms'] == 2 and not r['mes'] and r['charts'] == 3 and r['d0'] and r['adult'] == 3, f'développement : étapes résumées, courbes poids / taille / IMC de la naissance à l’âge actuel (adulte en pointillés), pas de tableau des mesures {r}'); pg.screenshot(path=os.path.join(OUT, 'v34_pr_dev.png'))
    show('history'); r = pg.evaluate("() => ({ grid: getComputedStyle(document.querySelector('#presentation .pr-ant')).gridTemplateColumns, lat: document.querySelectorAll('#presentation .pr-lat').length })")
    check(r['lat'] >= 3, f'antécédents : latéralité en pictogrammes {r}'); pg.screenshot(path=os.path.join(OUT, 'v34_pr_ant.png'))
    show('life'); check(pg.evaluate("() => document.querySelectorAll('#presentation .pr-lifec').length") == 3, 'mode de vie : trois cartes en grand'); pg.screenshot(path=os.path.join(OUT, 'v34_pr_life.png'))
    show('hx'); r = pg.evaluate("() => ({ tiles: document.querySelectorAll('#presentation .pr-hxt').length, ed: document.querySelectorAll('#presentation [data-ed^=\"clin:-:\"]').length })")
    check(r['tiles'] >= 3 and r['ed'] >= 3, f'histoire : repères en tuiles, champs modifiables depuis le staff {r}'); pg.screenshot(path=os.path.join(OUT, 'v34_pr_hx.png'))
    show('eegint:' + ids['ex1']); r = pg.evaluate("() => { const t = document.querySelector('#presentation .pr-body, #presentation').innerText; return { ictal: /EEG critique|Post-critique|Début des crises|Synthèse des crises/.test(t), ii: document.querySelectorAll('#presentation .tl-ii').length, sz: document.querySelectorAll('#presentation .tl-sz').length, th: document.querySelectorAll('#presentation .pr-thumb').length }; }")
    check(not r['ictal'] and r['ii'] == 2 and r['sz'] == 0 and r['th'] == 2, f'EEG intercritique : sans les crises, bandeau des jours (captures), vignettes {r}'); pg.screenshot(path=os.path.join(OUT, 'v34_pr_eegint.png'))
    pg.click('#presentation .pr-thumb >> nth=1'); pg.wait_for_timeout(1200)
    r = pg.evaluate("() => { const P = SV.app._pres, s = P.slides[P.i]; return { key: s.key, mi: s.mi, img: !!document.querySelector('#presentation .pr-mview img') }; }")
    check(r['key'] == 'iim:' + ids['ex1'] and r['mi'] == 1 and r['img'], f'vignette → captures en diaporama, à la bonne capture {r}')
    show('syn:' + ids['ex1'], 2500); r = pg.evaluate("() => ({ isyn: !!document.querySelector('#presentation .pr-isyn'), ii: document.querySelectorAll('#presentation .tl-ii').length, sz: document.querySelectorAll('#presentation .tl-sz').length })")
    check(r['isyn'] and r['ii'] == 2 and r['sz'] == 2, f'synthèse de l’électrophysiologie : crises et intercritique sous le bandeau {r}'); pg.screenshot(path=os.path.join(OUT, 'v34_pr_syn.png'))
    show('prevconc:' + ids['m1']); r = pg.evaluate("() => ({ prev: !!document.querySelector('#presentation .pr-prev'), concl: document.querySelector('#presentation .pr-prev') && document.querySelector('#presentation .pr-prev').innerText.includes('SEEG frontale'), bar: !!document.querySelector('#presentation .pr-concbar') })")
    check(r['prev'] and r['concl'] and not r['bar'], f'staff précédent : concordance, hypothèses et conclusion, en lecture seule {r}')
    show(IMPL, 6000)
    pg.click('#presentation [data-i2d="1"]'); pg.wait_for_timeout(2500)
    r = pg.evaluate("""() => { const q = s => document.querySelectorAll('#presentation ' + s);
      // planche dessinée (chemins vectoriels) calée sur le gabarit : marqueurs dans la silhouette du dessin, sans quadrillage ni CA-CP
      const box = (fig, k) => { const svg = document.querySelectorAll('#presentation .i2d.' + fig + ' svg')[k || 0]; const bg = svg && svg.querySelector('.i2d-bg'); return bg ? { svg, b: bg.getBBox() } : null; };
      const inside = (fig, sel) => { const B = box(fig); if (!B) return null; const b = B.b, pts = [...B.svg.querySelectorAll(sel)].map(c => [+c.getAttribute('cx'), +c.getAttribute('cy')]);
        return { n: pts.length, out: pts.filter(([x, y]) => x < b.x - 2 || x > b.x + b.width + 2 || y < b.y - 2 || y > b.y + b.height + 2).length }; };
      const lab = (() => { const B = box('inf'); if (!B) return null; const r = B.b.x + B.b.width; return [...B.svg.querySelectorAll('.ie-n')].map(t => +t.getAttribute('x') > r).filter(v => !v).length; })();
      const hs = [...q('.i2d-hemi')], vh = window.innerHeight;
      return { bi: q('.pr-i2d.bi').length, hemi: hs.length, titles: hs.map(h => h.querySelector('.i2d-h').innerText.split(/\s+/).slice(0, 3).join(' ')), visible: hs.every(h => h.getBoundingClientRect().bottom <= vh),
        grid: q('.tg-v, .tg-l, .tg-t, .tg-ac').length, bg: q('.i2d .i2d-bg').length, mir: q('.i2d svg > g[transform]').length, cap: q('.i2d figcaption').length, listTxt: [...q('.i2d-e')].map(e => e.textContent), dg: [...q('.i2d.tal .i2d-dg')].filter(p => (p.getAttribute('d') || '').length > 100).length, deepImg: q('.i2d.tal .i2d-deep').length, strokes: [...q('.i2d.tal .i2d-bl, .i2d.tal .i2d-gl')].filter(p => (p.getAttribute('d') || '').length > 500).length,
        ent: q('.i2d.tal .ie-e').length, fillL: (() => { const e = document.querySelector('#presentation .i2d-hemi.sL .ie-e'); return !!e && getComputedStyle(e).fill.replace(/\\s/g, '') === 'rgb(142,27,27)'; })(), fillR: (() => { const e = document.querySelector('#presentation .i2d-hemi.sR .ie-e'); return !!e && getComputedStyle(e).fill.replace(/\\s/g, '') === 'rgb(23,63,140)'; })(), faces: q('.i2d-faces figure').length, mes: q('.i2d.med .ie-e').length, mesDots: q('.i2d.med .ie-c').length, insM: q('.i2d.ins .ie-e').length, inf: q('.i2d.inf .ie-c').length, infLabIn: lab, list: q('.i2d-e').length,
        tal: inside('tal', '.ie-c'), med: inside('med', '.ie-e') }; }""")
    print('planche', r)
    ok_in = all(t and t['n'] > 0 and t['out'] == 0 for t in (r['tal'], r['med']))
    check(r['bi'] == 1 and r['hemi'] == 2 and r['titles'][0].endswith('GAUCHE') and r['titles'][1].endswith('DROIT') and r['visible'], f'implantation bilatérale : deux hémisphères l’un au-dessus de l’autre sur la même page, titrés GAUCHE / DROIT {r["titles"]} visibles={r["visible"]}')
    check(r['grid'] == 0 and r['bg'] == 10 and r['mir'] == 5 and r['cap'] == 0 and r['dg'] == 2 and all(' : ' in t and '—' not in t and not t.endswith((' G', ' D')) and not re.search(r'\b\d+$', t.split(' : ')[0]) for t in r['listTxt']) and r['fillL'] and r['fillR'] and r['deepImg'] == 4 and r['strokes'] == 4 and r['ent'] >= 9 and r['list'] >= 9 and r['faces'] == 8 and ok_in, f'schéma 2D sur la planche dessinée : projection latérale sur la planche de Talairach recalée (en gris insula, gyrus droit, repères mésiaux ; amygdale / hippocampe), sans légende sous les vues, liste « nom : cible profonde – cible externe », marqueurs pleins rouge foncé à gauche, bleu foncé à droite, faces latérale / mésiale / insula / inférieure, droit en miroir, sans quadrillage ni CA-CP {dict((k, v) for k, v in r.items() if k not in ("tal", "med", "titles", "listTxt"))}')
    check(r['mes'] > 0 and r['mesDots'] == 0 and r['insM'] > 0 and r['inf'] > 0 and r['infLabIn'] == 0, f'faces mésiale et insula : un cercle nommé par électrode ; face inférieure : étiquettes hors du cortex {r["mes"]}, {r["insM"]}, {r["infLabIn"]}')
    pg.screenshot(path=os.path.join(OUT, 'v34_pr_impl2d.png'))
    pg.click('#presentation [data-i2d="0"]'); pg.wait_for_timeout(1500)
    show('seegint:' + ids['ex2'], 6000); r = pg.evaluate("() => ({ views: document.querySelectorAll('#presentation .pr-iv img').length, leg: document.querySelectorAll('#presentation .pr-ivleg tr').length })")
    check(r['views'] >= 1 and r['leg'] == 3, f'intercritique SEEG : vue colorée par catégorie et légende {r}'); pg.screenshot(path=os.path.join(OUT, 'v34_pr_seegint.png'))
    show('concord', 1500); r = pg.evaluate("() => ({ glyph: document.querySelectorAll('#presentation .pr-glyph').length, icons: document.querySelectorAll('#presentation .pr-conc th svg').length, bands: [...document.querySelectorAll('#presentation .pr-band')].map(x => x.innerText.trim()), scroll: (() => { const w = document.querySelector('#presentation .pr-concw'); return w ? w.scrollHeight > w.clientHeight + 4 : null; })(), ii: [...document.querySelectorAll('#presentation td.cc[data-col=eeg_ii]')].filter(td => td.innerText.trim()).length, sii: [...document.querySelectorAll('#presentation td.cc[data-col=seeg_ii]')].filter(td => td.innerText.trim()).length, sic: [...document.querySelectorAll('#presentation td.cc[data-col=seeg_ic]')].filter(td => td.innerText.trim()).length })")
    check(r['glyph'] >= 2 and r['icons'] >= 7 and len(r['bands']) >= 1 and r['ii'] >= 1 and r['sii'] >= 1 and r['sic'] >= 1, f'concordance : vignettes, icônes, hémisphères séparés, colonnes SEEG intercritique (plots pointés) et SEEG critique (plots de début) {r}'); pg.screenshot(path=os.path.join(OUT, 'v34_pr_conc.png'))
    # hypothèse : ajoutée depuis la concordance, puis modifiée pendant le staff
    pg.click('#presentation .pr-concbar [data-a=hyp]'); pg.wait_for_timeout(400)
    pg.click('.ctx-menu .ctx-item:has-text("Hypothèse vide")'); pg.wait_for_timeout(1500)
    r = pg.evaluate("() => { const P = SV.app._pres; return { key: P.slides[P.i].key, bar: !!document.querySelector('#presentation .pr-hypbar') }; }")
    check(r['key'].startswith('hyp:') and r['bar'], f'hypothèse ajoutée pendant le staff, avec ses commandes {r}')
    pg.click('#presentation .pr-hypbar [data-st=confirmed]'); pg.wait_for_timeout(1200)
    r = pg.evaluate("() => { const A = SV.app, P = A._pres, id = P.slides[P.i].key.slice(4), H = SV.Store.byId(A.dossier.hypotheses, id); return H && { st: H.status, m: H.meetingId === P.m.id }; }")
    check(r and r['st'] == 'confirmed' and r['m'], f'statut de l’hypothèse modifié depuis la diapositive {r}')
    pg.click('#presentation .pr-hypbar [data-a=args]'); pg.wait_for_timeout(300)
    pg.fill('#presentation .pr-ht', 'Frontopolaire gauche'); pg.fill('#presentation .pr-af', 'pointes Fp1\nsémiologie hypermotrice'); pg.click('#presentation .pr-split [data-a=ok]'); pg.wait_for_timeout(1200)
    r = pg.evaluate("() => { const A = SV.app, P = A._pres, id = P.slides[P.i].key.slice(4), H = SV.Store.byId(A.dossier.hypotheses, id); return H && { t: H.title, a: H.argsFor.map(x => x.text) }; }")
    check(r and r['t'] == 'Frontopolaire gauche' and r['a'] == ['pointes Fp1', 'sémiologie hypermotrice'], f'titre et arguments modifiés depuis la diapositive {r}')
    pg.screenshot(path=os.path.join(OUT, 'v34_pr_hyp.png'))
    pg.evaluate("() => SV.app.closePresentation()"); pg.wait_for_timeout(500)

    errs = [e for e in errs if 'favicon' not in e]
    check(not errs, 'aucune erreur dans la console' + ('' if not errs else ' : ' + ' | '.join(errs[:5])))
    b.close()
print(f"\n{'ÉCHECS : ' + str(len(fails)) if fails else 'tout est ok'}")
sys.exit(1 if fails else 0)
