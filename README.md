# Golden Sun - Arabic Font Assets

Arabic glyph assets and the generator pipeline used for the *Golden Sun: The Lost Age*
(GBA) fan translation.

`pipeline/` holds the current build: the Rooyin pixel font (SIL OFL, unmodified),
the rasteriser, the Arabic shaper, the generated 8-bpp bitmap, the codepoint map and
the width table. `maps/` keeps the earlier extracted codepoint maps.

## Pipeline contents

| File | Purpose |
| --- | --- |
| `pipeline/build_rooyin.mjs` | Rasterises the TTF and assembles the game font binary, map and width table |
| `pipeline/ar_shape.mjs` | Arabic shaper: logical string to presentation forms (joining, RTL) |
| `pipeline/render_rooyin.ps1` | Renders each shape 1:1 from the TTF at 10 px via GDI+ |
| `pipeline/ar_font_new.bin` | Generated font, 256 chars x 32 bytes |
| `pipeline/ar_font_map.json` | Codepoint to shape map (133 entries) |
| `pipeline/ar_font_widthtbl.bin` | Width table, codepoints 0x20-0xFF |
| `pipeline/FONT_VALUES.*` | Per-glyph measurements (txt / json / csv) |
| `pipeline/FONT_REPORT.md` | Font audit report |
| `pipeline/POP_ANALYSIS.md` | Glyph population analysis |
| `pipeline/FIXES_PROPOSED.md` | Proposed fixes |
| `pipeline/RooyinFree-Regular.ttf` | Source font, unmodified |
| `pipeline/Rooyin-OFL.txt` | SIL Open Font License 1.1 |

The reusable, documented version of this pipeline lives in the companion repository
`arabic-gba-glyphs`.

## Licence

Rooyin is Copyright 2025 The Rooyin-Perfect Project Authors (https://Fontiran.com/Rooyin),
licensed under the SIL Open Font License 1.1 with Reserved Font Names "Rooyin". The TTF
here is redistributed unmodified under that licence. The generator scripts and the
generated bitmaps are MIT licensed (see `LICENSE`).

*Golden Sun* is a trademark of Nintendo and Camelot Software Planning. Non-commercial
fan project.
