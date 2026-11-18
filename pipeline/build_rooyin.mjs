// build_rooyin.mjs — assemble the ROM font from the Rooyin render (1:1 pixel data)
//   render origin row 12 + ascender(1400/2000) at size 10  =>  baseline at row 19
//   target grid: baseline row 11  =>  row shift = 11 - 19 = -8
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = process.env.GS_DIR || __dirname;

const findFile = (relPaths) => {
  for (const rel of relPaths) {
    const full = path.resolve(DIR, rel);
    if (fs.existsSync(full)) return full;
  }
  return path.resolve(DIR, relPaths[0]);
};

const labelsPath = findFile(['render_labels.json', 'fonts/render_labels.json']);
const renderTxtPath = findFile(['rooyin_render.txt', 'fonts/rooyin_render.txt']);

const labels = JSON.parse(fs.readFileSync(labelsPath, 'utf8'));

// ── parse the render file ──
const lines = fs.readFileSync(renderTxtPath, 'utf8').split('\n');
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
  // glyph width = ink rightmost column + 1 (the game adds 1 px tracking itself)
  let maxCol = -1;
  for (let y = 1; y < GH; y++) for (let x = 0; x < GW; x++) if (g[y][x]) maxCol = Math.max(maxCol, x);
  const w = maxCol + 1;
  return { g, w };
}

function parseLabel(lbl) {
  const [ch, form] = lbl.split(':');
  // map Arabic letter name or char to key
  const nameMap = {
    'ـ': 'tatweel',
    'ا': 'alef', 'أ': 'alefHA', 'إ': 'alefHB', 'آ': 'alefMA',
    'ب': 'beh', 'ت': 'teh', 'ث': 'theh', 'ج': 'jeem', 'ح': 'hah', 'خ': 'khah',
    'د': 'dal', 'ذ': 'dhal', 'ر': 'reh', 'ز': 'zain', 'س': 'seen', 'ش': 'sheen',
    'ص': 'sad', 'ض': 'dad', 'ط': 'tah', 'ظ': 'zah', 'ع': 'ain', 'غ': 'ghain',
    'ف': 'feh', 'ق': 'qaf', 'ك': 'kaf', 'ل': 'lam', 'م': 'meem', 'ن': 'noon',
    'ه': 'heh', 'و': 'waw', 'ي': 'yeh', 'ى': 'maksura', 'ة': 'tehM', 'ء': 'hamza',
    'ؤ': 'wawH', 'ئ': 'yehH', 'لا': 'lamalef', 'لأ': 'lamalefHA', 'لإ': 'lamalefHB', 'لآ': 'lamalefMA',
    '،': 'comma', '؛': 'semicolon', '؟': 'question', '٪': 'percent', '«': 'guillemetL', '»': 'guillemetR',
    'ـ': 'tatweel', 'ڤ': 'veh'
  };
  return { ch, key: nameMap[ch] || ch, form: form || 'iso' };
}

// ── assign codes in the 0x44..0xDF range (leaving stock Latin undisturbed where possible) ──
// We place the Arabic forms sequentially into 0x44..
let nextCode = 0x44;
const pool = [];
// reserve spacer at 0x44
pool.push({ code: nextCode++, label: 'spacer', ch: ' ', key: 'space_ar', form: 'iso', glyph: { g: Array.from({ length: GH }, () => Array(GW).fill(0)), w: 4 } });

const forms = [];
const map = {};
function add(label, ch, key, form, glyph) {
  const code = nextCode++;
  const entry = { code, label, ch, key, form, glyph };
  forms.push(entry);
  map[code] = { ch, key, form, label };
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
const romPath = process.env.ROM_PATH || path.resolve(DIR, 'rom/base_clean.gba');
let rom;
if (fs.existsSync(romPath)) {
  rom = fs.readFileSync(romPath);
} else {
  const existingFont = findFile(['ar_font_new.bin', 'ar_font_final.bin']);
  if (fs.existsSync(existingFont)) {
    console.warn(`[WARN] ROM not found at ${romPath}; using existing font template from ${path.basename(existingFont)}`);
    rom = Buffer.alloc(0x40000);
    fs.readFileSync(existingFont).copy(rom, 0x31e24);
  } else {
    throw new Error(`Clean ROM required to extract base font. Please set ROM_PATH environment variable or place clean ROM at ${romPath}`);
  }
}
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
fs.writeFileSync(path.resolve(DIR, 'ar_font_new.bin'), GH32);
fs.writeFileSync(path.resolve(DIR, 'ar_font_map.json'), JSON.stringify(map, null, 1));

// width table 0x370D4
let wt;
if (fs.existsSync(romPath)) {
  wt = Buffer.from(rom.slice(0x370d4, 0x370d4 + 0xe0));
} else {
  const existingWtbl = findFile(['ar_font_widthtbl.bin']);
  if (fs.existsSync(existingWtbl)) {
    wt = Buffer.from(fs.readFileSync(existingWtbl));
  } else {
    wt = Buffer.alloc(0xe0);
  }
}
for (const f of forms) wt[f.code - 0x20] = f.glyph.w;
fs.writeFileSync(path.resolve(DIR, 'ar_font_widthtbl.bin'), wt);
fs.writeFileSync(path.resolve(DIR, 'ar_font_widthtbl.json'), JSON.stringify(Object.fromEntries(forms.map(f => ['0x' + f.code.toString(16), f.glyph.w])), null, 1));

// ── self-check: no ink in row 0, all widths sane ──
let bad = 0;
for (const f of forms) for (let x = 0; x < GW; x++) if (f.glyph.g[0][x]) { bad++; console.log('ROW0 INK in ' + f.label); }
console.log(bad === 0 ? 'row 0 clean on all ' + forms.length + ' glyphs' : 'ROW0 PROBLEMS: ' + bad);
const outJsonDir = fs.existsSync(path.resolve(DIR, 'fonts')) ? path.resolve(DIR, 'fonts') : DIR;
fs.writeFileSync(path.resolve(outJsonDir, 'rooyin_font.json'), JSON.stringify({ map, forms: forms.map(f => ({ label: f.label, code: f.code, w: f.glyph.w, rows: f.glyph.g })) }, null, 1));
console.log('wrote ar_font_new.bin / ar_font_map.json / ar_font_widthtbl.bin');
