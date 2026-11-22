// node tools/tests/test_lint.mjs — v1.1.0 : contrôles statiques simples du code de src/.
//   1. Commentaire de fin de ligne qui avale du code : `instr;   // commentaire ; autre.instruction(…);` — la suite n'est
//      jamais exécutée (cause du bouton « Disposition » absent en 1.0.0). Écrire le commentaire au-dessus, ou /* … */.
//   2. Dessin d'un signal hors SV.Wave (polarité) : motif `yc - (… ) * ppu`.
import fs from 'fs'; import path from 'path';
const files = []; const walk = d => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) { if (f !== 'vendor') walk(p); } else if (f.endsWith('.js')) files.push(p); } }; walk('src');
const ALLOW = new Set(['src/electrodes.js:262']);   // phrase de commentaire, pas du code
const hits = [];
for (const f of files) fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
  let idx = -1; for (const m of line.matchAll(/\/\//g)) { const pre = line.slice(0, m.index); if ((pre.match(/'/g) || []).length % 2 || (pre.match(/"/g) || []).length % 2 || (pre.match(/`/g) || []).length % 2 || /[:\\]$/.test(pre) || /\/$/.test(pre)) continue; idx = m.index; break; }
  if (idx >= 0) { const c = line.slice(idx + 2); if (/[;{}]\s*(this|const|let|if|for|return|[A-Za-z_$][\w$]*\s*\.\s*[A-Za-z_$][\w$]*\s*(=|\())/.test(c) && /\)\s*;|=\s*[^=]/.test(c) && !ALLOW.has(`${f}:${i + 1}`)) hits.push(`${f}:${i + 1}  code dans un commentaire de fin de ligne : ${c.trim().slice(0, 100)}`); }
  if (/\byc\s*-\s*\(?[^;]*\)?\s*\*\s*ppu\b/.test(line) && !/SV\.Wave/.test(line)) hits.push(`${f}:${i + 1}  signal dessiné hors SV.Wave (polarité) : ${line.trim().slice(0, 100)}`);
});
if (hits.length) { console.error(hits.join('\n')); process.exit(1); }
console.log(`OK lint (${files.length} fichiers : commentaires, polarité)`);
