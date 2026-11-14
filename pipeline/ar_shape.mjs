// ar_shape.mjs — Arabic shaper: Unicode text (with {NN} control markers) -> glyph codes
// Reusable by the injector and by the width checker.
import fs from 'fs';

const DIR = 'C:/Users/user/Desktop/game/GS_Arabic_Fresh';
const FONT = fs.readFileSync(DIR + '/ar_font_new.bin');
const MAP = JSON.parse(fs.readFileSync(DIR + '/ar_font_map.json', 'utf8'));
const ROM = fs.readFileSync(DIR + '/rom/base_clean.gba');
const WTBL = 0x370d4;

// (key, form) -> glyph code, and key -> ch for the joining rules
const CODE = {};
const KEY2CH = {};
for (const [k, v] of Object.entries(MAP)) { CODE[v.key + '|' + v.form] = +k; if (v.form === 'iso') KEY2CH[v.ch] = v.key; }
const CH2KEY = KEY2CH;

const RIGHT = new Set(['alef', 'alefHA', 'alefHB', 'alefMA', 'dal', 'dhal', 'reh', 'zain', 'waw', 'wawH', 'tehM', 'lamalef', 'lamalefHA', 'lamalefHB', 'lamalefMA']);
// veh (ڤ) is an Arabic letter Rooyin only ships as an isolated glyph
// (no Presentation-Forms-B codepoint), so it renders unconnected (iso only):
// its isolated form still inks both connector edges, so neighbours still join.
const DUAL = new Set(['beh', 'teh', 'theh', 'noon', 'yeh', 'maksura', 'yehH', 'heh', 'feh', 'qaf', 'seen', 'sheen', 'sad', 'dad', 'hah', 'khah', 'lam', 'kaf', 'meem', 'ain', 'ghain', 'jeem', 'tah', 'zah', 'lamalef', 'lamalefHA', 'lamalefHB', 'lamalefMA']);
const NONE = new Set(['hamza']);
// letters that expose a right connector: the only neighbours a letter can join to.
// Arabic PUNCTUATION (U+060C ، U+061B ؛ U+061F ؟ …) lives in the same Unicode block
// but never joins, so it must NOT count here — otherwise "متعافى،" asks for a
// medial maksura that no font provides.
const JOINING = new Set([...DUAL, ...RIGHT]);

// advance width of a code. Control codes (< 0x20) are commands, not glyphs: no pen advance.
function widthOf(code) {
  if (code < 0x20) return 0;
  if (MAP[code]) return FONT[code * 32];
  return ROM[WTBL + (code - 0x20)];
}

const isAr = c => /[\u0600-\u06FF]/.test(c);
const ALEFS = ['ا', 'أ', 'إ', 'آ'];
const LIGKEY = { 'ا': 'lamalef', 'أ': 'lamalefHA', 'إ': 'lamalefHB', 'آ': 'lamalefMA' };
const isAlef = c => ALEFS.includes(c);

function shapeRun(chars) {
  const out = [];
  let prevSends = false;      // does the previous letter expose a left connector?
  // glyph code for (key, form); Rooyin only ships the forms Unicode encodes as
  // Presentation Forms-B codepoints, so rare joined positions (maksura before the
  // attached "ال") degrade to the nearest shipped form instead of failing.
  const glyph = (k, form) => CODE[k + '|' + form] ?? CODE[k + '|fin'] ?? CODE[k + '|iso'];
  // NOTE: the definite article "ال" is written ATTACHED to its word (CLDR
  // Arabic-Latin: "other than as the definite article, since no space is used"),
  // so no spacer glyph is emitted here — the article simply connects.
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i], k = CH2KEY[ch];
    if (!k) { out.push({ ch, code: null }); prevSends = false; continue; }
    // lam + alef ligature (and its hamza variants).
    // The ligature ends with an alef, which never connects leftwards, so it only
    // ever takes the isolated or final form (right connector for the previous letter).
    if (k === 'lam' && i + 1 < chars.length && ALEFS.includes(chars[i + 1])) {
      const lk = LIGKEY[chars[i + 1]];
      out.push({ ch: chars[i] + chars[i + 1], code: glyph(lk, prevSends ? 'fin' : 'iso') });
      prevSends = false;
      i++;
      continue;
    }
    const recv = prevSends;
    const send = i < chars.length - 1 && JOINING.has(CH2KEY[chars[i + 1]]);
    let form;
    if (DUAL.has(k)) {
      form = (recv && send) ? 'med' : (recv ? 'fin' : (send ? 'ini' : 'iso'));
      prevSends = (form === 'ini' || form === 'med');
    } else if (RIGHT.has(k)) {
      form = recv ? 'fin' : 'iso';
      prevSends = false;
    } else { out.push({ ch, code: glyph(k, 'iso') }); prevSends = false; continue; }
    out.push({ ch, code: glyph(k, form) });
  }
  return out;
}

// code of a standalone (non-Arabic) character: Arabic punctuation via its own slot,
// ASCII via its own code (width then falls back to the ROM width table), else null
function codeOfChar(ch) {
  const u = ch.codePointAt(0);
  if (MAP[CH2KEY_ISO[ch]]) return CH2KEY_ISO[ch];   // ، ؟ ؛ « » ـ etc.
  if (u >= 0x20 && u < 0x7f) return u;              // ASCII keeps its own code
  return null;
}
const CH2KEY_ISO = {};
for (const [k, v] of Object.entries(MAP)) if (v.form === 'iso') CH2KEY_ISO[v.ch] = +k;

// shape a translation line; segments between {NN} markers are reversed (RTL), markers kept in place
export function shapeLine(line) {
  const parts = [];
  let cur = '';
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '{' && /^\{[0-9A-Fa-f]{2}\}/.test(line.slice(i, i + 4))) {
      if (cur) { parts.push(cur); cur = ''; }
      parts.push('CTRL:' + line.slice(i, i + 4));
      i += 3;
    } else cur += line[i];
  }
  if (cur) parts.push(cur);
  const out = [];
  for (const p of parts) {
    if (p.startsWith('CTRL:')) { out.push({ ctrl: p.slice(5) }); continue; }
    const toks = p.match(/[\u0600-\u06FF]+|[^\u0600-\u06FF]+/g) || [];
    const shaped = [];
    for (const t of toks) {
      if (/^[\u0600-\u06FF]+$/.test(t)) shaped.push(...shapeRun([...t]));
      else for (const ch of t) shaped.push({ ch, code: codeOfChar(ch) });
    }
    out.push(...shaped.reverse());
  }
  return out;
}

// total advance of a shaped line (unmapped ASCII -> its own code if available)
export function shapedAdvance(shaped) {
  let w = 0;
  for (const it of shaped) {
    if (it.ctrl) { w += widthOf(0x20); continue; }
    w += widthOf(it.code);
  }
  return w;
}

// English advance using the ORIGINAL font's width table (codes from \xNN escapes)
export function englishAdvance(enLine) {
  let w = 0;
  let i = 0;
  while (i < enLine.length) {
    if (enLine[i] === '\\' && enLine[i + 1] === 'x') {
      const code = parseInt(enLine.slice(i + 2, i + 4), 16);
      w += ROM[WTBL + (code - 0x20)] || 0;
      i += 4;
      continue;
    }
    const c = enLine.charCodeAt(i);
    w += ROM[WTBL + (c - 0x20)] || 0;
    i++;
  }
  return w;
}

export function unmapped(shaped) { return shaped.filter(s => !s.ctrl && s.code === null); }
