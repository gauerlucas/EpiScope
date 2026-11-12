/* EpiScope — csv.js : lecture/écriture CSV (RFC 4180, UTF-8, séparateur , ou ;) */
(function (SV) {
  'use strict';

  function detectSep(text) {
    const head = text.split(/\r?\n/, 1)[0] || '';
    const c = (head.match(/,/g) || []).length, s = (head.match(/;/g) || []).length;
    return s > c ? ';' : ',';
  }

  /** parseRows(text, sep?) → lignes de cellules (tableau de tableaux), guillemets RFC 4180 */
  function parseRows(text, sep) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    sep = sep || detectSep(text);
    const rows = []; let row = [], field = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += ch; }
      else if (ch === '"') q = true;
      else if (ch === sep) { row.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
      else field += ch;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => !(r.length === 1 && r[0].trim() === '')).map(r => r.map(c => c.trim()));
  }
  /** parseCSV(text) → {fields:[...], rows:[{...}]} */
  function parseCSV(text, sep) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    sep = sep || detectSep(text);
    const rows = []; let row = [], field = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
        else field += ch;
      } else if (ch === '"') q = true;
      else if (ch === sep) { row.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += ch;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    const fields = (rows.shift() || []).map(f => f.trim());
    const out = [];
    for (const r of rows) {
      if (r.length === 1 && r[0].trim() === '') continue;
      const o = {};
      fields.forEach((f, k) => { o[f] = (r[k] === undefined ? '' : r[k]).trim(); });
      out.push(o);
    }
    return { fields, rows: out };
  }

  function esc(v) {
    v = v === null || v === undefined ? '' : String(v);
    return /[",\n\r;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  /** toCSV(rows, fields?) → string */
  function toCSV(rows, fields) {
    fields = fields || (rows.length ? Object.keys(rows[0]) : []);
    const lines = [fields.map(esc).join(',')];
    for (const r of rows) lines.push(fields.map(f => esc(r[f])).join(','));
    return '﻿' + lines.join('\r\n');
  }

  SV.csv = { parseCSV, parseRows, toCSV }; SV.CSV = SV.csv;
})(window.SV = window.SV || {});
