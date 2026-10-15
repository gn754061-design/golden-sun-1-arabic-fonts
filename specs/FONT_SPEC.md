# Golden Sun (GBA) Arabic translation — font values, ROM layout and build

Every value below was read from or written to the ROM and then verified. Nothing is guessed.
This is the document to keep when continuing this work.

## 1. ROM layout (file offsets == GBA address minus 0x08000000)

| region | offset | size | what |
|---|---|---|---|
| dialogue font | 0x31E24 | 8192 B (256 glyphs x 32 B) | the font the dialogue renders from |
| menu font (latin) | 0x320FB0 | 4096 B (128 x 32) | menu/HUD text, codes 0x00..0x7F |
| menu font (arabic) | 0x321FB0 | 4096 B (128 x 32) | menu/HUD text, codes 0x80..0xFF |
| **width table** | 0x370D4 | 224 entries | advance px per code, base code 0x20 |
| char-code check | 0x155F0 | 1 B | patched 0x6F -> 0xDF so codes 0x80..0xFF are allowed |
| huffman pointer table | 0x3842C | 8 B | uint32 -> tree table, +4 -> tree offsets |
| string table | 0x736B8 | 42 x 8 B | uint32 block data ptr + uint32 lengths ptr |
| free area | 0x800000 | about 0.3 MB used | trees + offsets + 42 string blocks + lengths |

### dialogue glyph format
One glyph = 32 bytes:

```
byte 0        advance width in px. The engine actually reads the width from the WIDTH
              TABLE, so this byte is only used by our tools.
bytes 1..31   15 rows x 2 bytes. Each row is 16 px wide, 1bpp, MSB = leftmost pixel.
              The renderer starts at row 4, so the visible band is rows 4..14.
```

Menu font glyph = 8x8 4bpp tile, palette 1 = ink, 3 = shadow at +1,+1, 4 = background.

### width table
`W(code) = rom[0x370D4 + (code - 0x20)]`, 224 entries covering codes 0x20..0xFF.
It is read for BOTH font families, so menu and dialogue advances must stay in sync.
Known values: latin letters 7 px, digits 7 px, space 3 px (set by fix_space.mjs, otherwise 5 px),
arabic letters 7 px, . , ? 6 px, colon 7 px, {18} separator 6 px.

## 2. arabic font codes (132 total)
`translation/font_codes.json` is the single source of truth.

Codes 0x60 and 0x7E hold two extra letter forms; the rest runs 0x80..0xFD with
0xFE = arabic comma and 0xFF = arabic question mark. **Six letter forms were moved to
ASCII-range codes** (see section 2.1), jeem-med moved to 0x7F, and the veh forms were
added at 0xDE/0xDF:

| letter | forms:code |
|---|---|
| ب | isol:**0x3C** - fin:0x81 - init:**0x5B** - med:0x83 |
| ت | isol:**0x5D** - fin:0x85 - init:**0x3E** - med:0x87 - marbuta-isol:0x60 - marbuta-fin:0x7E |
| ث | isol:**0x7B** - fin:0x89 - init:**0x7C** - med:0x8B |
| ج | isol:0x8C - fin:0x8D - init:0x8E - med:**0x7F** |
| ح | isol:0x90 - fin:0x91 - init:0x92 - med:0x93 |
| خ | isol:0x94 - fin:0x95 - init:0x96 - med:0x97 |
| س | isol:0x98 - fin:0x99 - init:0x9A - med:0x9B |
| ش | isol:0x9C - fin:0x9D - init:0x9E - med:0x9F |
| ص | isol:0xA0 - fin:0xA1 - init:0xA2 - med:0xA3 |
| ض | isol:0xA4 - fin:0xA5 - init:0xA6 - med:0xA7 |
| ط | isol:0xA8 - fin:0xA9 - init:0xAA - med:0xAB |
| ظ | isol:0xAC - fin:0xAD - init:0xAE - med:0xAF |
| ع | isol:0xB0 - fin:0xB1 - init:0xB2 - med:0xB3 |
| غ | isol:0xB4 - fin:0xB5 - init:0xB6 - med:0xB7 |
| ف | isol:0xB8 - fin:0xB9 - init:0xBA - med:0xBB |
| ق | isol:0xBC - fin:0xBD - init:0xBE - med:0xBF |
| ك | isol:0xC0 - fin:0xC1 - init:0xC2 - med:0xC3 |
| ل | isol:0xC4 - fin:0xC5 - init:0xC6 - med:0xC7 - alef-isol:0xF5 - alef-fin:0xF6 - alef-hamza-isol:0xF7 - alef-hamza-fin:0xF8 - alef-below-isol:0xF9 - alef-below-fin:0xFA - alef-madda-isol:0xFB - alef-madda-fin:0xFC |
| م | isol:0xC8 - fin:0xC9 - init:0xCA - med:0xCB |
| ن | isol:0xCC - fin:0xCD - init:0xCE - med:0xCF |
| ه | isol:0xD0 - fin:0xD1 - init:0xD2 - med:0xD3 |
| ي | isol:0xD4 - fin:0xD5 - init:0xD6 - med:0xD7 - hamza-isol:0xD8 - hamza-fin:0xD9 - hamza-init:0xDA - hamza-med:0xDB |
| ا | isol:0xDC - fin:0xDD - maqsura-isol:0xEA - maqsura-fin:0xEB - madda-isol:0xED - madda-fin:0xEE - hamza-isol:0xEF - hamza-fin:0xF0 - hamza-below-isol:0xF3 - hamza-below-fin:0xF4 |
| د | isol:0xE0 - fin:0xE1 |
| ذ | isol:0xE2 - fin:0xE3 |
| ر | isol:0xE4 - fin:0xE5 |
| ز | isol:0xE6 - fin:0xE7 |
| و | isol:0xE8 - fin:0xE9 - hamza-isol:0xF1 - hamza-fin:0xF2 |
| ء | isol:0xEC |
| ڤ | isol:**0xDE** - connected (init/med/fin): **0xDF** |
| ـ | base:0xFD |
| ، | ar:0xFE |
| ؟ | ar:0xFF |
| « » | latin-1 guillemets rendered from **0x40 / 0x5E** (the vanilla glyphs) |

### 2.1 RESERVED codes — no Arabic letter form may occupy these

| code(s) | what the engine draws there |
|---|---|
| 0x80 / 0x82 / 0x84 / 0x86 / 0x88 / 0x8A (menu font) | the **`[26]` button images** A/B/L/R/Start/Select — byte-identical to the vanilla font. The six letter forms that used to sit there were moved to 0x3C/0x5B/0x5D/0x3E/0x7B/0x7C (move_btn_forms.mjs), otherwise the buttons print Arabic letters. |
| 0x8F (both fonts) | the **HP/PP bar**: a 9px solid row with advance 7 (2px overlap) so a row of them is continuous. jeem-med was moved off it to 0x7F (fix_bar_glyph.mjs + fix_codes_barglyph.mjs). |
| 0x18 (dialogue font) | the {18} phrase separator: a 2x2 dot at rows 9-10, advance 6 (draw_dot_18.mjs). The earlier long dash merged with the next syllable into a "ج + ا" blob. |
| 0x40 / 0x5E (dialogue font) | the guillemets « » (copied from the vanilla 0xAB/0xBB). |

## 3. build chain (scripts/build/)
1. `ar_build_text.mjs` shapes each Arabic string with `ar_shaping.mjs`, reverses it to visual
   order, keeps the control codes, **keeps a leading `{09}{xx}` effect command at the string
   start** (the reversal would otherwise move it to the end and effects like shaky/bold would
   apply to nothing), moves the terminal code (0x1E) to the end, and falls back to the
   original English when a slot has no translation. A paired-token safety net restores the
   original's trailing control codes (e.g. `{02}`) only when genuinely absent.
   Output: `strings.txt` — 10722 lines, control bytes written as \xNN.
2. `build_fresh.mjs <tsv> <baseRom> <outRom>` runs 1 + packing + injection + fix_space +
   the whole verification battery in one shot.
3. `fix_bar_glyph.mjs` (jeem-med 0x8F -> 0x7F, vanilla bar restored at 0x8F in both fonts).
4. The six moved letter-form glyphs + the guillemets are copied to their new codes in the
   dialogue font (see the fresh31 font procedure), then `regen_ui_font_baseline.mjs`
   regenerates the 8x8 menu font **bottom-anchored** (the old `gen_ui_font_small.mjs`
   top-anchored each glyph, which made letters float on different baselines), then the six
   vanilla buttons + the bar + the hint slots 0x01-0x06 are restored in the menu font.

## 4. verification (scripts/verify/)
| check | tool | expected |
|---|---|---|
| round-trip | `roundtrip_check.mjs` | 0 of 10722 mismatches |
| **control tokens (strict)** | `check_built_cmds.mjs strings.txt ctrl_fix_changes.json` | 0 unintended; 75 intentional (66 `{19}` removals + 13 `{1d}` strips, whitelisted) |
| control multiset (legacy) | `check_built_ctrl.mjs` | the intentional #4581 |
| arabic hygiene | `validate_main.mjs` | foreign=0, asciiPunct=0, latin = the intentional labels |
| 0x1E position | `qa_1e_position.mjs` | 620/620 at the end of the string |
| line fit | `qa_linebreaks.mjs` | widest arabic line <= widest english line (164 < 184 px) |
| label fit | `qa_label_overflow.mjs` | 0 overflowing fixed-width labels |
| unpacked dump | `gs_unpack_strings.mjs` | the same 10722 strings back from the ROM |

**Lesson (the reason for check_built_cmds.mjs):** the old multiset check could not see a
PARAM command that lost its parameter byte — the dropped control byte usually reappeared
as a stray newline elsewhere in the same string, so 95 corrupted strings passed
verification for months. Always compare **paired (command, param) tokens**.

After every build also diff the font regions against the base ROM: 0x31E24..0x33E24,
0x320FB0..0x322FB0 and 0x370D4+224, plus only 0x800000.. must change.

## 5. build log
| ROM | content |
|---|---|
| fresh16 | the build the user approved: RTL shaping, 0x1E moved to the end, 3 px space, button glyphs, weapon descriptions, the 745 dead "?" slots |
| fresh17 | typos (السيد, أوه), #4581 {03}{03} -> {03}, the two untranslated dialogues #8154 / #8596 |
| fresh18/19 | REJECTED: moving the original font back to 0x31E24 broke the dialogue font |
| fresh20 | the user-approved release: the 0x8F bar glyph restored, jeem-med moved to 0x7F, shortened status labels |
| fresh21-23 | label work (HP/PP labels back to Latin in fresh22, 54 more labels shortened in fresh23) — **but fresh23 lost fresh20's font state** (jeem back on 0x8F), which made the HP/PP bars render as rows of "ج" |
| fresh24 | **the control-code repair**: 95 strings whose `{11}`/`{1d}`/`{1a}` commands had lost their parameter byte (the build consumed the next text byte) — restored from the original; `{1d}` stripped from 13 item names; `{19}` removed from 66; the password keyboard rows reverted to English; the ar_build_text safety net hardened; check_built_cmds.mjs added |
| fresh25 | the veh letter (ڤ) drawn in both fonts (0xDE/0xDF) — 90 strings no longer print "?" |
| fresh26/27 | the guillemets « » mapped to the vanilla glyphs (0x40/0x5E); the Arabic semicolon fixed; the toFontCodes Latin-1 passthrough bug fixed |
| fresh28 | the menu font regenerated BASELINE-ALIGNED (letters no longer float up/down); the HP/PP recovery labels reverted to English |
| fresh29 | alignment + Arabic HP/PP recovery labels (later reverted again) |
| fresh30 | fresh20 font state restored: jeem-med back to 0x7F, the vanilla bar at 0x8F in both fonts |
| fresh31 | the `[26]` button images restored (Arabic letters had taken the UI-font button slots; the six letter forms moved to 0x3C/0x5B/0x5D/0x3E/0x7B/0x7C); the vanilla hint slots 0x01-0x06 restored |
| **fresh32 (current)** | the shaky-effect fix: a leading `{09}{xx}` stays at the string start so grunt strings jitter; every previous fix preserved |

## 6. font tools (scripts/font/)
| tool | what it does |
|---|---|
| fontgen.ps1 / fontgen2.ps1 / fontgen3.ps1 | render the Arabic letters into the 16x15 1bpp glyphs |
| fix_font.mjs | patch single glyphs inside the font binary |
| fix_uifont_haa.mjs | fix the haa glyph inside the menu font |
| **regen_ui_font_baseline.mjs** | regenerate the 8x8 menu font **bottom-anchored** (common baseline) + sync widths |
| gen_ui_font_small.mjs | the OLD menu-font generator (top-anchored — superseded, kept for reference) |
| fix_codes_barglyph.mjs | move one letter form to a free font code |
| fix_bar_glyph.mjs | restore the vanilla HP/PP bar at 0x8F and move the letter off it |
| **fix_veh_glyph.mjs** | draw the veh (ڤ) glyphs in both fonts + copy the vanilla guillemets to 0x40/0x5E |
| **move_btn_forms.mjs** | move the 6 letter forms off the button slots in ar_codes.json |
| draw_dot_18.mjs | redraw the {18} separator as a 2x2 dot |

## 7. translation tools (scripts/translation/)
| tool | what it does |
|---|---|
| fix_typos_fix8.mjs | the fresh17 typo / blank-line / missing-dialogue fixes |
| fix_hp_labels.mjs | restore the 15 fixed-width HP/PP labels to their Latin form |
| fix_labels2.mjs | the 54 shortened labels and item/bestiary names |
| shorten_hints.mjs, shorten_menu.mjs | shorten the hint strings and menu labels |
| **fix_ctrl_params.mjs** | repair PARAM commands that lost their parameter byte, strip `{1d}`, remove `{19}`, revert the password keyboard rows — logs every change to ctrl_fix_changes.json |

## 8. known limitations
- A savestate carries its own VRAM tiles, so loading one shows cached tiles until the game
  redraws them (the reason a reloaded menu can look stale).
- Windows blocks a background process from stealing window focus, so automated key input
  into the emulator only reliably reaches the d-pad; menu testing stayed manual.
- The status screen shows a "?" in the class line before any Djinn class is set — that is
  the game's own placeholder, present in the English version too.
- Emulator used: mGBA 0.10.5.
