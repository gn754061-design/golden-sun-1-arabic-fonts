// Regenerate the Arabic menu font (0x321FB0, 8x8 4bpp) BASELINE-ALIGNED.
//
// Problem with the previous generator (gen_ui_font_small.mjs): each glyph's ink box was
// anchored to the TOP of its 8x8 cell, so letters with different ink heights sat on
// different baselines - words like "قميص" showed letters floating up and down.
//
// Fix: bottom-anchor every glyph's ink box at row 6 of the cell (row 7 stays empty so
// menu lines keep a 1px gap), scaling down only when the ink box is taller than 7 rows
// or wider than 6 columns. Advance = ink width + 1, written to the SHARED width table
// at 0x370D4 (both font families read it).
//
// The source glyphs are read from the ROM's own dialogue font (0x31E24), so the menu
// font always matches the dialogue font actually shipped (veh, guillemets, ...).
//
// usage: node regen_ui_font_baseline.mjs <inRom> <outRom> [--dry]
import fs from 'fs';
import crypto from 'crypto';

const IN = process.argv[2] || 'GoldenSun_Arabic_v15_fresh27.gba';
const OUT = process.argv[3] || 'GoldenSun_Arabic_v15_fresh28.gba';
const dry = process.argv.includes('--dry');

const DF = 0x31e24;            // dialogue font (1bpp, 16px x 15 rows)
const UB = 0x321fb0;           // menu arabic font base (8x8 4bpp)
const LB = 0x320fb0;           // menu latin font base (only used by codes 0x60/0x7E)
const WTAB = 0x370d4, WBASE = 0x20;
const MAX_ROWS = 7;            // ink rows inside the 8px cell
const MAX_COLS = 6;            // ink columns
const BASE_ROW = MAX_ROWS - 1; // ink box bottom lands here (row 6)

const rom = Buffer.from(fs.readFileSync(IN));
if (rom.length !== 0x2000000) throw new Error('base ROM is not 32MB');
const names = JSON.parse(fs.readFileSync('./ar_codes.json', 'utf8'));

function dialogGlyph(code) {
  const o = DF + code * 32;
  const rows = [];
  for (let r = 1; r <= 15; r++) {
    // row r occupies bytes 2r-1 (high) and 2r (low); the previous generator read at
    // o + r*2 which mixed each row with the next one
    const hw = (rom[o + 2 * r - 1] << 8) | rom[o + 2 * r];
    const bits = [];
    for (let x = 0; x < 16; x++) bits.push((hw >> (15 - x)) & 1);
    rows.push(bits);
  }
  return rows;
}
function inkBox(rows) {
  let minX = 99, maxX = -1, minY = 99, maxY = -1;
  rows.forEach((r, y) => r.forEach((v, x) => { if (v) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; } }));
  return maxX < 0 ? null : { minX, maxX, minY, maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
}
function smallGlyph(code) {
  const rows = dialogGlyph(code);
  const bb = inkBox(rows);
  const grid = Array.from({ length: 8 }, () => new Array(8).fill(0));
  if (!bb) return { grid, w: 1 };
  const sx = bb.w > MAX_COLS ? MAX_COLS / bb.w : 1;
  const sy = bb.h > MAX_ROWS ? MAX_ROWS / bb.h : 1;
  let newW = 0;
  for (let y = bb.minY; y <= bb.maxY; y++) {
    // bottom-anchored: the ink box's lowest row maps to BASE_ROW
    const ny = BASE_ROW - Math.round((bb.maxY - y) * sy);
    if (ny < 0 || ny >= 8) continue;
    for (let x = bb.minX; x <= bb.maxX; x++) {
      if (!rows[y][x]) continue;
      const nx = Math.round((x - bb.minX) * sx);
      if (nx >= 8) continue;
      grid[ny][nx] = 1;
      if (nx + 1 > newW) newW = nx + 1;
    }
  }
  // 8px readability: close vertical gaps so dots sit on their letter bodies instead
  // of floating a row away (checked at the game's 3x scale the gap is very visible).
  for (let y = 1; y < BASE_ROW; y++) {
    if (grid[y].some(v => v)) continue;
    for (let yy = y; yy > 0; yy--) grid[yy] = grid[yy - 1].slice();
    grid[0] = new Array(8).fill(0);
  }
  return { grid, w: newW };
}
function toBytes(grid) {
  const out = Array.from({ length: 8 }, () => new Array(8).fill(0));
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (grid[y][x]) out[y][x] = 1;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    if (out[y][x] === 1 && y + 1 < 8 && x + 1 < 8 && out[y + 1][x + 1] === 0) out[y + 1][x + 1] = 2;
  }
  const bytes = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x += 2) {
    const l = out[y][x], r = out[y][x + 1];
    bytes.push(((r === 1 ? 1 : r === 2 ? 3 : 4) << 4) | (l === 1 ? 1 : l === 2 ? 3 : 4));
  }
  return bytes;
}
let patched = 0, widthSum = 0;
const preview = [];
for (const e of names) {
  const { grid, w } = smallGlyph(e.code);
  const bytes = toBytes(grid);
  const arab = e.code >= 0x80;
  const o = (arab ? UB : LB) + (arab ? e.code - 0x80 : e.code) * 32;
  Buffer.from(bytes).copy(rom, o);
  const newW = Math.max(1, w + 1);
  rom[WTAB + (e.code - WBASE)] = newW;
  widthSum += newW;
  patched++;
  if (preview.length < 3) preview.push({ name: e.name, grid });
}
if (!dry) {
  fs.writeFileSync(OUT, rom);
  console.log('regenerated ' + patched + ' menu glyphs (baseline-aligned) -> ' + OUT);
  console.log('  sha1 = ' + crypto.createHash('sha1').update(rom).digest('hex'));
} else {
  console.log('(dry run) would regenerate ' + patched + ' glyphs, width sum=' + widthSum);
}
for (const p of preview) {
  console.log('--- ' + p.name + ' ---');
  console.log(p.grid.map(r => '  ' + r.map(v => v ? '#' : '.').join('')).join('\n'));
}
