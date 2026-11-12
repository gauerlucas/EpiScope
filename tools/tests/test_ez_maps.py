#!/usr/bin/env python3
"""v4.18 — cartes sur l'IRM, sur des données synthétiques (aucune donnée patient) :
  T1 synthétique (sphère), électrodes réelles posées dans le monde du T1, crise synthétique (synthFP : empreinte sur B’, activité
  rapide d'une bande sur A’), anatomie factice (parcellation VEP par hémisphère et tranches), TEP synthétique (hypofixation d'une
  région à gauche) :
  - onglet EM → jeu → « Carte sur l'IRM » : image dérivée (t étalés autour des plots, seuil t critique), calque des coupes ;
  - Imagerie › Post-traitement : carte d'asymétrie G/D (z robuste, t de Welch, depuis la TEP recalée puis depuis la PVC GTM),
    palette chaud / froid, versions accumulées sous la TEP, « Cartes calculées » (calque, tableau, suppression).
    python3 tools/tests/test_ez_maps.py        (après python3 tools/build.py)"""
import os, sys, json, glob, tempfile, atexit, shutil, subprocess
import numpy as np, nibabel as nib
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
URL = 'file://' + os.path.join(ROOT, 'dist', 'EpiScope.html')
OUT = tempfile.mkdtemp(prefix='ezmaps_'); atexit.register(shutil.rmtree, OUT, True)
fails, errs = [], []
def check(c, msg):
    print(('  ok    ' if c else '  ÉCHEC  ') + msg)
    if not c: fails.append(msg[:90])

# T1 synthétique : 96³ voxels de 2 mm centrés sur l'origine, cerveau (r < 70 mm), scalp
N = 96; A = np.diag([2.0, 2.0, 2.0, 1.0]); A[:3, 3] = -N
g = (np.indices((N, N, N)).transpose(1, 2, 3, 0) * 2.0 - N + 1.0); r = np.linalg.norm(g, axis=-1)
rng = np.random.default_rng(3); t1 = np.where(r < 70, 100, np.where(r < 80, 150, 0)).astype(np.float32) + rng.normal(0, 3, (N, N, N)).astype(np.float32)
t1p = os.path.join(OUT, 'sub-ez_T1w.nii.gz'); nib.save(nib.Nifti1Image(np.clip(t1, 0, None), A), t1p)
# crise synthétique (électrodes B’, A’, TP’, OR’, 6 plots)
edir = os.path.join(OUT, 'fp'); os.makedirs(edir)
js = "import { synthFP, writeBrainVision } from '%s'; writeBrainVision(process.argv[1], 'sub-ez_task-ictal_run-01', synthFP({}));" % os.path.join(ROOT, 'tools', 'tests', 'synth_seeg.mjs')
subprocess.run(['node', '--input-type=module', '-e', js, edir], check=True)

with sync_playwright() as p:
    prof = tempfile.mkdtemp(); atexit.register(shutil.rmtree, prof, True)
    ctx = p.chromium.launch_persistent_context(prof, headless=True, accept_downloads=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--max-old-space-size=4000'], viewport={'width': 1600, 'height': 1000})
    pg = ctx.pages[0] if ctx.pages else ctx.new_page(); pg.set_default_timeout(120_000)
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text)); pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e) + ' ' + (getattr(e, 'stack', '') or '')[:600]))
    pg.on('dialog', lambda d: d.accept(d.default_value or 'EZ-TEST') if d.type == 'prompt' else d.accept())
    pg.goto(URL); pg.wait_for_timeout(2500); pg.keyboard.press('Escape')
    pg.click('#pNew'); pg.wait_for_timeout(1500)
    pg.evaluate("()=>SV.app.go({stage:'dossier', view:'imagerie'})"); pg.wait_for_timeout(1200)
    pg.set_input_files('#fileNifti', [t1p]); pg.wait_for_function("()=>SV.app.dossier.imaging.length>=1 && SV.Store.refImaging(SV.app.dossier)", timeout=120_000); pg.wait_for_timeout(1500)
    # exploration SEEG : électrodes réelles (plots au pas de 3,5 mm, de 20 à 37,5 mm de la ligne médiane, à gauche)
    exid = pg.evaluate("""()=>{ const S=SV.Store, d=SV.app.dossier, ex=S.addExploration(d, { kind:'seeg', start:'2026-01-10' });
        // schéma (cible sur le gabarit, coordonnées fsaverage) + position réelle dans le monde du T1
        ex.electrodes = [['B’', 0, 10, [-28, -20, -14]], ['A’', -20, 0, [-24, -4, -20]], ['TP’', 20, -10, [-36, 12, -30]], ['OR’', 40, 20, [-22, 30, -14]]].map(([n, y, z, T]) => { const c = [0,1,2,3,4,5].map(k => [-20 - 3.5*k, y, z]); return { id: S.uid('e'), name: n, hemi: 'L', target: T, real: { contacts: c, tip: c[0], entry: c[5], n: 6, source: 'manual' } }; });
        SV.app.touch(); return ex.id; }""")
    pg.evaluate("id=>SV.app.go({stage:'ex:'+id, view:'analyses'})", exid); pg.wait_for_timeout(2000)
    pg.set_input_files('#tab-quant .ie-file', sorted(glob.glob(os.path.join(edir, '*'))))
    pg.wait_for_function("()=>(SV.app.ieegEx().recordings||[]).length>0", timeout=120_000); pg.wait_for_timeout(800)
    pg.click('.ie-rec .ie-ei'); pg.wait_for_function("()=>SV.app._iev && document.querySelector('.ie-mb .p-er')", timeout=120_000); pg.wait_for_timeout(400)
    pg.click('.ie-mt button[data-m=em]'); pg.wait_for_timeout(300)
    btn0 = pg.evaluate("()=>{ const b=document.querySelector('.ie-mb .e-mri'); return [b.disabled, b.title] }")
    pg.click('.ie-mb .e-run'); pg.wait_for_function("()=>SV.app._iev.rec.em.last && SV.app._iev.rec.em.last.rows && !SV.app._iev.mbusy", timeout=300_000); pg.wait_for_timeout(300)
    pg.click('.ie-mb .e-save'); pg.wait_for_timeout(800)
    em = pg.evaluate("()=>{ const A=SV.app, L=A._iev.rec.em.last, q=A.state.quant.find(x=>x.method==='em'); return { tc: L.tCrit, sig: L.rows.filter(r=>r.sig).map(r=>r.name), keys: Object.keys(q.values).length, pos: Object.keys(q.values).filter(k=>A.quantWorldPos(k)).length } }")
    check(btn0[0] and 'anatomie' in btn0[1] and len(em['sig']) >= 2 and all(x.startswith('B’') for x in em['sig']) and em['keys'] == 20 and em['pos'] == 20, f'EM : « Carte sur l’IRM » inactive sans anatomie ; voies significatives sur B’ ; 20 plots localisés dans le monde du T1 ({btn0}, {em})')
    # anatomie factice sur la grille du T1 : 8 familles VEP (tranches en z), gauche x < 0
    pg.evaluate("""async () => { const A=SV.app, d=A.dossier, ref=SV.Store.refImaging(d), v=await A.imagingVolume(ref), [nx,ny,nz]=v.dims, fams=[...A.atlas.famIndex.values()].filter(x=>x.L&&x.R).slice(0,8), lab=new Uint8Array(nx*ny*nz), M=Array.from(v.affine);
        for (let k=0,q=0;k<nz;k++) for (let j=0;j<ny;j++) for (let i=0;i<nx;i++,q++) { const x=M[0]*i+M[1]*j+M[2]*k+M[3], y=M[4]*i+M[5]*j+M[6]*k+M[7], z=M[8]*i+M[9]*j+M[10]*k+M[11]; if (Math.hypot(x,y,z)>=70) continue; const f=fams[Math.min(7, Math.max(0, Math.floor((z+70)/140*8)))]; lab[q] = x<0 ? f.L : f.R; }
        window.__fams = fams; const I=SV.Mat4.identity(); window.__anat = { vepVol: { dims: v.dims.slice(), affine: Float64Array.from(v.affine), pixdim: v.pixdim.slice(0,3), data: lab }, fromDisplay: I, toDisplay: I, fromTemplate: I, toTemplate: I, center: [0, 0, 0] }; }   // repères factices (identité) pour les vues qui en ont besoin""")
    pg.evaluate("async ()=>{ SV.app.patientAnat = window.__anat; await SV.app.ieegEMMap(); }"); pg.wait_for_timeout(500)
    mp = pg.evaluate("""async ()=>{ const A=SV.app, im=A.dossier.imaging.find(i=>i.derived && i.derived.kind==='em'); if (!im) return null; const v=await A.imagingVolume(im), Mi=SV.Mat4.inv(v.affine), at=(x,y,z)=>{ const q=SV.Mat4.apply(Mi,x,y,z); return SV.Vol.sampleVox(v, q[0], q[1], q[2], NaN); };
        const st=A.slvState(), L=A.slices && A.slices.layers.find(l=>l.id==='ov:'+im.id); return { cm: im.derived.cmap, thr: im.derived.thr, pts: im.derived.nPts, b12: at(-21.75, 0, 10), far: at(30, 30, -40), out: at(0, 0, 76), ov: (st.overlays||[]).some(o=>o.id===im.id), kind: L ? L.kind : null, thrL: L ? L.threshold : null }; }""")
    check(mp and mp['cm'] == 'hot' and mp['pts'] == 20 and mp['b12'] > mp['thr'] and mp['far'] == 0 and (mp['out'] == 0 or mp['out'] != mp['out']) and mp['ov'] and abs(mp['thr'] - em['tc']) < 1e-9 and (mp['kind'] in (None, 'hot')) and (mp['thrL'] is None or abs(mp['thrL'] - mp['thr']) < 1e-9), f'carte EM sur l’IRM : t au-dessus du seuil près de B’1-B’2, nulle loin des plots et hors du cerveau ; calque « chaud » seuillé au t critique ({mp})')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(800)
    # TEP synthétique recalée (identité) : 10 dans le cerveau, 6,5 dans la 1re famille à gauche
    pg.evaluate("()=>SV.app.go({stage:'dossier', view:'imagerie'})"); pg.wait_for_timeout(2000)
    pet = pg.evaluate("""async () => { const A=SV.app, d=A.dossier, ref=SV.Store.refImaging(d), v=await A.imagingVolume(ref), lab=window.__anat.vepVol.data, f0=window.__fams[0], data=new Float32Array(lab.length); let s=7;
        for (let q=0;q<lab.length;q++) { if (!lab[q]) continue; s=(s*1103515245+12345)&0x7fffffff; data[q]=(lab[q]===f0.L ? 6.5 : 10) + (s/0x7fffffff-0.5)*2; }
        const vol={ dims: v.dims.slice(), pixdim: v.pixdim.slice(0,3), affine: Float64Array.from(v.affine), data, slope: 1, inter: 0 }, u8=await SV.Nifti.encodeGz(vol);
        const im=SV.Store.addImaging(d, { modality:'PET', timepoint:'preop', date:'2026-01-02', label:'TEP synthétique', bytes: u8.length, dims: vol.dims, pixdim: vol.pixdim, nt:1, coreg:{ T:[1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1], refId: ref.id, method:'test', date: SV.Store.now(), text:'test' } });
        im.file='imaging/'+im.id+'.nii.gz'; await SV.Library.writeFile(d, im.file, u8); A.touch(); await A.renderImaging(); return im.id; }"""); pg.wait_for_timeout(800)
    ac = pg.evaluate("()=>({ form: !!document.querySelector('#imAsym [data-a=asym]'), srcs: [...document.querySelectorAll('#imAsym [data-q=src] option')].map(o=>o.value), maps: document.querySelectorAll('#imMaps .im-der-row').length })")
    check(ac['form'] and ac['srcs'] == ['n:' + pet] and ac['maps'] == 1, f'Post-traitement : section « Carte d’asymétrie » (TEP recalée), carte EM listée dans « Cartes calculées » ({ac})')
    def run_asym(stat, key=None):
        n0 = pg.evaluate("()=>SV.app.dossier.imaging.filter(i=>i.derived && i.derived.kind==='asym').length")
        if key: pg.select_option('#imAsym [data-q=src]', key); pg.wait_for_timeout(200)
        pg.select_option('#imAsym [data-q=stat]', stat); pg.wait_for_timeout(300)
        pg.click('#imAsym [data-a=asym]')
        pg.wait_for_function("n=>SV.app.dossier.imaging.filter(i=>i.derived && i.derived.kind==='asym').length>n", arg=n0, timeout=300_000); pg.wait_for_timeout(1500)
        return pg.evaluate("""pid=>{ const A=SV.app, im=A.dossier.imaging.filter(i=>i.derived && i.derived.kind==='asym').pop(), D=im.derived, f0=window.__fams[0], L=A.slices && A.slices.layers.find(l=>l.id==='ov:'+im.id);
            return { from: D.from === pid, src: D.src, cm: D.cmap, win: D.win, sig: D.rows.filter(r=>r.sig).map(r=>[r.cL===f0.L, Math.round(r.ai)]), n: D.rows.length, kind: L && L.kind, short: D.short, id: im.id } }""", pet)
    az = run_asym('z')
    check(az['from'] and az['src'] == 'native' and az['cm'] == 'div' and az['win'][0] == -az['win'][1] and az['sig'] == [[True, -42]] and az['n'] == 8 and az['kind'] == 'div', f'asymétrie (z robuste, FDR) depuis la TEP recalée : seule la région hypofixante à gauche retenue (AI −42 %), carte chaud / froid au-dessus du T1 ({az})')
    at = run_asym('t')
    if os.environ.get('EZ_SHOTS'): pg.evaluate("()=>{ const h=document.querySelector('#scr-imaging .ip-host'); if (h) h.scrollIntoView(); }"); pg.wait_for_timeout(500); pg.screenshot(path=os.path.join(os.environ['EZ_SHOTS'], 'ez_asym.png'))
    vals = pg.evaluate("""async id=>{ const A=SV.app, im=SV.Store.byId(A.dossier.imaging, id), v=await A.imagingVolume(im), Mi=SV.Mat4.inv(v.affine), at=(x,y,z)=>{ const q=SV.Mat4.apply(Mi,x,y,z); return SV.Vol.sampleVox(v, q[0], q[1], q[2], NaN); }; return [at(-30, 0, -62), at(30, 0, -62), at(-30, 0, 30), at(0, 0, 80)]; }""", at['id'])
    check(at['sig'] == [[True, -42]] and vals[0] < -30 and vals[1] > 30 and vals[2] == 0 and (vals[3] == 0 or vals[3] != vals[3]), f'asymétrie (t de Welch, n efficace) : même région ; carte froide à gauche, chaude dans l’homologue droit, nulle ailleurs ({at["sig"]}, {[round(x, 1) if x == x else None for x in vals]})')
    # PVC (GTM) puis asymétrie sur les valeurs corrigées : version accumulée sous la TEP
    pg.evaluate("pid=>SV.app.runPvc(SV.Store.byId(SV.app.dossier.imaging, pid), { method:'gtm', regions:'vep', fwhm: 6, res: 3, iters: 5 })", pet)
    pg.wait_for_function("()=>SV.app.dossier.imaging.some(i=>i.derived && i.derived.kind==='pvc')", timeout=300_000); pg.wait_for_timeout(1500)
    pk = pg.evaluate("()=>{ const x=SV.app.dossier.imaging.find(i=>i.derived && i.derived.kind==='pvc'); return 'd:'+x.id }")
    ap = run_asym('z', pk)
    steps = pg.evaluate("pid=>[...document.querySelectorAll('.im-pipe[data-im=\"'+pid+'\"] [data-step]')].map(b=>b.textContent)", pet)
    check(ap['src'].startswith('PVC GTM') and len(ap['sig']) == 1 and ap['sig'][0][0] and ap['sig'][0][1] <= -40 and 'Asym. z · PVC GTM' in ap['short'] and sum('Asym' in s for s in steps) == 3 and any('PVC GTM' in s for s in steps), f'asymétrie sur les valeurs de la PVC (GTM) ; versions accumulées sous la TEP : {steps} ({ap})')
    # cartes calculées : calque, tableau, suppression
    pg.evaluate("()=>SV.app.renderImaging()"); pg.wait_for_timeout(1200)
    rows = pg.locator('#imMaps .im-der-row').count()
    first = pg.locator('#imMaps .im-der-row').nth(1); first.locator('[data-a=tab]').click(); pg.wait_for_timeout(400)
    tb = pg.evaluate("()=>{ const m=document.querySelector('.modal .pvc-tab'); return m ? { rows: m.querySelectorAll('tbody tr').length, hypo: [...m.querySelectorAll('tbody tr')].filter(r=>/hypo G/.test(r.textContent)).length } : null }")
    pg.locator('.modal .pvc-tab .close').first.click(); pg.wait_for_timeout(300)
    onb = pg.evaluate("()=>{ const r=document.querySelectorAll('#imMaps .im-der-row')[0], id=r.dataset.id, cb=r.querySelector('[data-a=on]'); cb.checked=!cb.checked; cb.dispatchEvent(new Event('change')); return [id, cb.checked] }"); pg.wait_for_timeout(1200)
    ov = pg.evaluate("id=>(SV.app.slvState().overlays||[]).some(o=>o.id===id)", onb[0])
    nb = pg.evaluate("()=>SV.app.dossier.imaging.length")
    pg.locator('#imMaps .im-der-row').nth(0).locator('[data-a=rm]').click(); pg.wait_for_timeout(1500)
    na = pg.evaluate("()=>SV.app.dossier.imaging.length")
    cms = pg.evaluate("()=>[...document.querySelectorAll('#imMaps [data-a=on]')].map(c=>c.checked)")
    check(rows == 4 and cms.count(True) == 1 and tb and tb['rows'] == 8 and tb['hypo'] == 1 and ov == onb[1] and na == nb - 1, f'« Cartes calculées » : {rows} cartes (EM + 3 asymétries), tableau des paires (1 hypofixation G), calque coché / décoché, suppression ({tb}, {onb}, {ov}, {nb}→{na})')
    if os.environ.get('EZ_SHOTS'): pg.screenshot(path=os.path.join(os.environ['EZ_SHOTS'], 'ez_imaging.png'))
    pg.evaluate("()=>{ SV.app.patientAnat = null; }")
    ctx.close()
real = [e for e in errs if 'favicon' not in e]
print('erreurs console :', real[:10])
if real: fails.append('erreurs console')
print('\n%d échec(s)' % len(fails) + (' : ' + ' ; '.join(fails) if fails else ''))
sys.exit(1 if fails else 0)
