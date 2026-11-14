// build_rooyin.mjs — assemble the ROM font from the Rooyin render (1:1 pixel data)
//   render origin row 12 + ascender(1400/2000) at size 10  =>  baseline at row 19
//   target grid: baseline row 11  =>  row shift = 11 - 19 = -8
import fs from 'fs';
const DIR = 'C:/Users/user/Desktop/game/GS_Arabic_Fresh';
const labels = JSON.parse(fs.readFileSync(DIR + '/fonts/render_labels.json', 'utf8'));

// ── parse the render file ──
const lines = fs.readFileSync(DIR + '/fonts/rooyin_render.txt', 'utf8').split('\n');
const renders = new Map();
{
  let cur = null;
  for (const l of lines) {
    if (!l.trim()) continue;
    if (l.startsWith('cp ')) {
      const f = l.trim().split(/\s+/);
      const cp = parseInt(f[1], 16);
      if (f[2] === 'EMPTY') { renders.set(cp, null); cur = null; continue; }
      cur = { cp, x: +f[2], y: +f[3], w: +f[4], h: +f[5], rows: [] };
      renders.set(cp, cur);
    } else if (cur) cur.rows.push(l);
  }
}
console.log('parsed renders: ' + renders.size);
// The render origin is (12,12) with ascender 1400/2000 -> the baseline is render row 19.
// Rooyin puts every letter's connector bar one row ABOVE the baseline (render row 18),
// so that row becomes the ROM grid's baseline row 11  =>  SHIFT = 11 - 18 = -7.
const SHIFT = -7;
const GH = 15, GW = 16;

function toGlyph(r, label) {
  if (!r || r.h <= 0) throw new Error('empty render for ' + label);
  const top0 = r.y + SHIFT, bottom0 = r.y + r.h - 1 + SHIFT;
  // per-glyph nudge: keep every ink pixel inside rows 1..14 (a lone deep descender or
  // a tall dotted letter can be moved a row without changing how it connects)
  let nudge = 0;
  if (bottom0 >= GH) nudge = -(bottom0 - (GH - 1));
  if (top0 + nudge < 1) nudge = 1 - top0;
  const g = Array.from({ length: GH }, () => Array(GW).fill(0));
  const top = top0 + nudge;
  for (let i = 0; i < r.h; i++) {
    for (let j = 0; j < r.w; j++) {
      if (r.rows[i][j] !== '#') continue;
      const y = top + i, x = j;
      if (y < 1) throw new Error(label + ': ink in row ' + y);
      if (y >= GH) throw new Error(label + ': ink in row ' + y);
      if (x >= GW) throw new Error(label + ': ink beyond column 15');
      g[y][x] = 1;
    }
  }
  // the yeh (and yeh+hamza) render at 1:1 with its two dots merged into one 3px
  // bar because they are 1 design px apart; split them into two distinct dots.
  if (/^[يئ]/.test(label)) {
    let bottomRow = -1;
    for (let y = GH - 1; y >= 1; y--) { if (g[y].some(v => v)) { bottomRow = y; break; } }
    if (bottomRow >= 1) {
      const cols = g[bottomRow].map((v, x) => v ? x : -1).filter(x => x >= 0);
      if (cols.length >= 3) {
        const first = cols[0], last = cols[cols.length - 1];
        const span = last - first;
        const dots = [];
        for (let c = first; c <= last; c += Math.max(2, Math.round(span / 2))) dots.push(c);
        g[bottomRow] = new Array(GW).fill(0);
        for (const d of dots) if (d < GW) g[bottomRow][d] = 1;
      }
    }
  }
  return { g, w: r.w, h: r.h, top, nudge };
}

// ── allocate codes (same pool rule as before) ──
const USED = new Set(['d', 'P', 'C', 'L', 'R', 'B', 'b', 'A', 'o', 'h']);
const freeAscii = [];
for (let c = 0x41; c <= 0x5a; c++) if (!USED.has(String.fromCharCode(c))) freeAscii.push(c);
for (let c = 0x61; c <= 0x7a; c++) if (!USED.has(String.fromCharCode(c))) freeAscii.push(c);
const ext = []; for (let c = 0x80; c <= 0xdd; c++) ext.push(c);
const pool = [...freeAscii, ...ext];

// ── map the rendered label to (letter, key, form) understood by ar_shape.mjs ──
const KEYS = {
  'ا': ['alef', 'ALEF'], 'أ': ['alefHA', 'ALEF WITH HAMZA ABOVE'], 'إ': ['alefHB', 'ALEF WITH HAMZA BELOW'],
  'آ': ['alefMA', 'ALEF WITH MADDA ABOVE'], 'ب': ['beh', 'BEH'], 'ت': ['teh', 'TEH'], 'ث': ['theh', 'THEH'],
  'ج': ['jeem', 'JEEM'], 'ح': ['hah', 'HAH'], 'خ': ['khah', 'KHAH'], 'د': ['dal', 'DAL'], 'ذ': ['dhal', 'THAL'],
  'ر': ['reh', 'REH'], 'ز': ['zain', 'ZAIN'], 'س': ['seen', 'SEEN'], 'ش': ['sheen', 'SHEEN'],
  'ص': ['sad', 'SAD'], 'ض': ['dad', 'DAD'], 'ط': ['tah', 'TAH'], 'ظ': ['zah', 'ZAH'], 'ع': ['ain', 'AIN'],
  'غ': ['ghain', 'GHAIN'], 'ف': ['feh', 'FEH'], 'ق': ['qaf', 'QAF'], 'ك': ['kaf', 'KAF'], 'ل': ['lam', 'LAM'],
  'م': ['meem', 'MEEM'], 'ن': ['noon', 'NOON'], 'ه': ['heh', 'HEH'], 'و': ['waw', 'WAW'], 'ي': ['yeh', 'YEH'],
  'ى': ['maksura', 'ALEF MAKSURA'], 'ة': ['tehM', 'TEH MARBUTA'], 'ء': ['hamza', 'HAMZA'], 'ئ': ['yehH', 'YEH WITH HAMZA ABOVE'],
  'ؤ': ['wawH', 'WAW WITH HAMZA ABOVE'], 'ڤ': ['veh', 'VEH'],
};
const PUNCT = { '،': 'arComma', '؛': 'arSemi', '؟': 'arQuestion', '«': 'guilOpen', '»': 'guilClose', 'ـ': 'tatweel' };
const LIG = { 'LAM WITH ALEF': 'lamalef', 'LAM WITH ALEF WITH HAMZA ABOVE': 'lamalefHA', 'LAM WITH ALEF WITH HAMZA BELOW': 'lamalefHB', 'LAM WITH ALEF WITH MADDA ABOVE': 'lamalefMA' };

function parseLabel(label) {
  if (label.startsWith('ligature ')) {
    const rest = label.slice('ligature '.length);
    let form = 'iso';
    if (rest.endsWith('FINAL')) form = 'fin';
    else if (rest.endsWith('INITIAL')) form = 'ini';
    else if (rest.endsWith('MEDIAL')) form = 'med';
    const base = rest.replace(/ (ISOLATED|FINAL|INITIAL|MEDIAL)$/, '');
    const key = LIG[base] || 'lig';
    return { ch: 'لا', key, form };
  }
  if (label.includes(':')) {
    const [ch, form] = label.split(':');
    const key = PUNCT[ch] || (KEYS[ch] ? KEYS[ch][0] : 'x');
    return { ch, key, form };
  }
  return { ch: label, key: PUNCT[label] || 'x', form: 'iso' };
}

const map = {}, forms = [];
// ── spacer glyphs: blank cells whose only job is visual separation ──
function addSpacer(label, key, ch, width) {
  const g = Array.from({ length: GH }, () => Array(GW).fill(0));
  map[pool[forms.length]] = { ch, key, form: 'iso' };
  forms.push({ ch, label, key, form: 'iso', code: pool[forms.length], glyph: { g, w: width } });
}
addSpacer('spacer', 'spacer', '', 2);   // 2 px gap, no ink

function add(label, ch, key, form, glyph) {
  const code = pool[forms.length];
  if (code === undefined) throw new Error('out of code slots at ' + label);
  map[code] = { ch, key, form };
  forms.push({ ch, label, key, form, code, glyph });
  return code;
}
for (const [cpHex, label] of Object.entries(labels)) {
  const cp = parseInt(cpHex, 16);
  const { ch, key, form } = parseLabel(label);
  const { g, w } = toGlyph(renders.get(cp), label);
  add(label, ch, key, form, { g, w });
}
console.log('forms built: ' + forms.length + ' · pool: ' + pool.length);
const widths = forms.map(f => f.glyph.w);
console.log('widths: min ' + Math.min(...widths) + ' · max ' + Math.max(...widths) + ' · avg ' + (widths.reduce((a, b) => a + b, 0) / widths.length).toFixed(2));

// ── pack into the ROM font format ──
const GH32 = Buffer.alloc(0x100 * 32);
const rom = fs.readFileSync(DIR + '/rom/base_clean.gba');
Buffer.from(rom.slice(0x31e24, 0x31e24 + 0x100 * 32)).copy(GH32);
for (const f of forms) {
  const buf = Buffer.alloc(32);
  buf[0] = f.glyph.w;
  for (let y = 0; y < GH; y++) {
    let b0 = 0, b1 = 0;
    for (let x = 0; x < 8; x++) if (f.glyph.g[y][x]) b0 |= 1 << (7 - x);
    for (let x = 8; x < GW; x++) if (f.glyph.g[y][x]) b1 |= 1 << (7 - (x - 8));
    buf[1 + 2 * y] = b0; buf[2 + 2 * y] = b1;
  }
  for (let i = 0; i < 32; i++) GH32[f.code * 32 + i] = buf[i];
}
fs.writeFileSync(DIR + '/ar_font_new.bin', GH32);
fs.writeFileSync(DIR + '/ar_font_map.json', JSON.stringify(map, null, 1));

// width table 0x370D4
const wt = Buffer.from(rom.slice(0x370d4, 0x370d4 + 0xe0));
for (const f of forms) wt[f.code - 0x20] = f.glyph.w;
fs.writeFileSync(DIR + '/ar_font_widthtbl.bin', wt);
fs.writeFileSync(DIR + '/ar_font_widthtbl.json', JSON.stringify(Object.fromEntries(forms.map(f => ['0x' + f.code.toString(16), f.glyph.w])), null, 1));

// ── self-check: no ink in row 0, all widths sane ──
let bad = 0;
for (const f of forms) for (let x = 0; x < GW; x++) if (f.glyph.g[0][x]) { bad++; console.log('ROW0 INK in ' + f.label); }
console.log(bad === 0 ? 'row 0 clean on all ' + forms.length + ' glyphs' : 'ROW0 PROBLEMS: ' + bad);
fs.writeFileSync(DIR + '/fonts/rooyin_font.json', JSON.stringify({ map, forms: forms.map(f => ({ label: f.label, code: f.code, w: f.glyph.w, rows: f.glyph.g })) }, null, 1));
console.log('wrote ar_font_new.bin / ar_font_map.json / ar_font_widthtbl.bin');
