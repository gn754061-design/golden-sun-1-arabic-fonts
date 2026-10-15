# -*- coding: utf-8 -*-
"""
Golden Sun 1 (GBA) — font extractor.
Produces the complete font package from the two source ROMs:

  * ORIGINAL (stock game) fonts  <- stock ROM "Golden Sun (USA, Europe).gba"
        dialogue font @ 0x31E24     8192 B  (256 glyphs x 32 B, 16x15 1bpp)
        ui font       @ 0x320FB0     4096 B  (codes 0x00-0x7F, 8x8 4bpp tiles)
                       0x321FB0     4096 B  (codes 0x80-0xFF)
        width table   @ 0x370D4       224 B  (advance px for codes 0x20..0xFF)

  * ARABIC (final translation) fonts <- GoldenSun_Arabic_v15_fresh34.gba
        same three regions, same offsets.

Run:  python extract_fonts.py
"""
import hashlib
import os
import shutil
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))

GS_WORK = r"C:\Users\reva4\Desktop\Games & Shortcuts\Games\game"
STOCK_ROM = os.path.join(GS_WORK, "Golden Sun (USA, Europe).gba")
FINAL_ROM = os.path.join(GS_WORK, "ar_pipeline", "GoldenSun_Arabic_v15_fresh34.gba")
SRC_FONTGEN = os.path.join(GS_WORK, "goldensun-arabic-translation", "scripts", "font", "fontgen3.ps1")
SRC_REGEN_UI = os.path.join(GS_WORK, "goldensun-arabic-translation", "scripts", "font", "regen_ui_font_baseline.mjs")
SRC_SPEC_MD = os.path.join(GS_WORK, "goldensun-arabic-translation", "FONT_SPEC.md")
SRC_SPEC_JSON = os.path.join(GS_WORK, "goldensun-arabic-translation", "font_spec.json")
SRC_CODES = os.path.join(GS_WORK, "ar_pipeline", "ar_codes.json")
SRC_FONT_MAP = os.path.join(GS_WORK, "GS_Arabic_Final", "ar_font_map.json")
SRC_WORDS_PNG = os.path.join(GS_WORK, "GS_Arabic_Final", "ar_font_words.png")

DLG_OFF, DLG_LEN = 0x31E24, 8192
UI_OFF, UI_LEN = 0x320FB0, 8192          # latin half + arabic half, 4096 each
WT_OFF, WT_LEN = 0x370D4, 224


def region(path, off, ln):
    with open(path, "rb") as f:
        f.seek(off)
        return f.read(ln)


def sha(b):
    return hashlib.sha256(b).hexdigest()


def check_rom_header(data):
    title = data[0xA0:0xAC].decode("ascii", "replace").strip("\x00")
    assert "GOLDEN_SUN_A" in title.replace(" ", "_").upper(), "not a Golden Sun 1 ROM: %r" % title
    return title


# ---------------------------------------------------------------- glyph decode
def dlg_glyph(buf, code):
    """32-byte glyph -> (advance, 15 rows x 16 px, 1bpp).
    byte 0 = advance; bytes 1..31 = 15 rows, each 2 bytes:
    first byte = px 0..7, second byte = px 8..15, MSB = leftmost."""
    g = buf[code * 32:(code + 1) * 32]
    adv = g[0]
    pix = [[0] * 16 for _ in range(15)]
    for r in range(15):
        b0, b1 = g[1 + r * 2], g[1 + r * 2 + 1]
        for x in range(8):
            pix[r][x] = (b0 >> (7 - x)) & 1
            pix[r][8 + x] = (b1 >> (7 - x)) & 1
    return adv, pix


def ui_glyph(buf, code):
    """32-byte 4bpp tile -> 8x8 pixel values (1=ink, 3=shadow, 4=bg)."""
    t = buf[code * 32:(code + 1) * 32]
    pix = [[0] * 8 for _ in range(8)]
    for y in range(8):
        for x in range(8):
            b = t[y * 4 + x // 2]
            pix[y][x] = (b & 0x0F) if x % 2 == 0 else (b >> 4) & 0x0F
    return pix


# --------------------------------------------------------------------- atlases
def font_px(size=9):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def dlg_atlas(buf, title, out_png):
    cell_w, cell_h = 17, 26          # 16 px glyph + 1 gap, 15 rows + label
    mx, my = 30, 30
    W = mx + 16 * cell_w
    H = my + 16 * cell_h
    img = Image.new("RGB", (W, H), (250, 250, 252))
    d = ImageDraw.Draw(img)
    f = font_px(9)
    try:
        fb = font_px(11)
        d.text((4, 6), title, fill=(20, 20, 30), font=fb)
    except Exception:
        pass
    for code in range(256):
        col, row = code % 16, code // 16
        adv, pix = dlg_glyph(buf, code)
        x0 = mx + col * cell_w
        y0 = my + row * cell_h
        for r in range(15):
            for x in range(16):
                if pix[r][x]:
                    d.point((x0 + x, y0 + r), fill=(15, 15, 25))
        d.text((x0, y0 + 16), "%02X" % code, fill=(60, 60, 80), font=f)
        d.text((x0, y0 + 22), "w%d" % adv, fill=(120, 120, 140), font=f)
    img = img.resize((W * 2, H * 2), Image.NEAREST)
    img.save(out_png)
    return img


def ui_atlas(buf, title, out_png):
    cell_w, cell_h = 9, 16           # 8 px tile + 1 gap, label row
    mx, my = 24, 24
    W = mx + 16 * cell_w
    H = my + 16 * cell_h
    img = Image.new("RGB", (W, H), (250, 250, 252))
    d = ImageDraw.Draw(img)
    f = font_px(8)
    for code in range(256):
        col, row = code % 16, code // 16
        pix = ui_glyph(buf, code)
        x0 = mx + col * cell_w
        y0 = my + row * cell_h
        for yy in range(8):
            for xx in range(8):
                v = pix[yy][xx]
                if v == 1:
                    c = (15, 15, 25)
                elif v == 3:
                    c = (150, 150, 150)
                else:
                    c = (255, 255, 255)
                d.point((x0 + xx, y0 + yy), fill=c)
        d.text((x0 - 1, y0 + 9), "%02X" % code, fill=(60, 60, 80), font=f)
    img = img.resize((W * 3, H * 3), Image.NEAREST)
    img.save(out_png)
    return img


def width_table_txt(wt):
    lines = ["Golden Sun 1 — character advance widths (width table @ ROM 0x370D4)",
             "code  adv  ascii", "-" * 30]
    for i, w in enumerate(wt):
        code = 0x20 + i
        ch = chr(code) if 0x20 <= code <= 0x7E else "."
        lines.append("0x%02X  %3d  %s" % (code, w, ch))
    return "\n".join(lines) + "\n"


# ----------------------------------------------------------------------- main
def build():
    for p in (STOCK_ROM, FINAL_ROM):
        if not os.path.exists(p):
            sys.exit("missing source ROM: %s" % p)

    stock = open(STOCK_ROM, "rb").read()
    final = open(FINAL_ROM, "rb").read()
    print("stock ROM header :", check_rom_header(stock))
    print("final ROM header :", check_rom_header(final))

    # ---- 0. clean the previous (wrong) contents of this folder
    for sub in ("original", "arabic", "maps", "specs", "generator"):
        d = os.path.join(HERE, sub)
        if os.path.isdir(d):
            shutil.rmtree(d)
    for junk in ("eu_large.png", "eu_small.png"):
        p = os.path.join(HERE, junk)
        if os.path.exists(p):
            os.remove(p)
            print("removed wrong file:", junk)
    for sub in ("original", "arabic", "maps", "specs", "generator"):
        os.makedirs(os.path.join(HERE, sub), exist_ok=True)

    report = []

    def emit(label, blob, rel):
        path = os.path.join(HERE, rel)
        with open(path, "wb") as f:
            f.write(blob)
        report.append((label, rel, "%d B" % len(blob), sha(blob)[:16]))
        return path

    # ---- 1. original (vanilla) fonts
    o = os.path.join("original")
    dlg_o = stock[DLG_OFF:DLG_OFF + DLG_LEN]
    ui_o = stock[UI_OFF:UI_OFF + UI_LEN]
    wt_o = stock[WT_OFF:WT_OFF + WT_LEN]
    emit("vanilla dialogue font", dlg_o, o + r"\dialogue_font.bin")
    emit("vanilla ui font (both halves)", ui_o, o + r"\ui_font.bin")
    emit("vanilla width table", wt_o, o + r"\width_table.bin")
    with open(os.path.join(HERE, o, "width_table.txt"), "w", encoding="utf-8") as f:
        f.write(width_table_txt(wt_o))
    dlg_atlas(dlg_o, "GS1 original dialogue font @0x31E24",
              os.path.join(HERE, o, "atlas_dialogue.png"))
    ui_atlas(ui_o, "x", os.path.join(HERE, o, "atlas_ui.png"))

    # ---- 2. arabic (final translation) fonts
    a = os.path.join("arabic")
    dlg_a = final[DLG_OFF:DLG_OFF + DLG_LEN]
    ui_a = final[UI_OFF:UI_OFF + UI_LEN]
    wt_a = final[WT_OFF:WT_OFF + WT_LEN]
    emit("arabic dialogue font", dlg_a, a + r"\dialogue_font.bin")
    emit("arabic ui font (both halves)", ui_a, a + r"\ui_font.bin")
    emit("arabic width table", wt_a, a + r"\width_table.bin")
    with open(os.path.join(HERE, a, "width_table.txt"), "w", encoding="utf-8") as f:
        f.write(width_table_txt(wt_a))
    dlg_atlas(dlg_a, "GS1 arabic dialogue font (fresh34) @0x31E24",
              os.path.join(HERE, a, "atlas_dialogue.png"))
    ui_atlas(ui_a, "x", os.path.join(HERE, a, "atlas_ui.png"))

    # ---- 3. sanity check: render a few glyphs and assert the vanilla 'A' is an 'A'
    adv, a_pix = dlg_glyph(dlg_o, 0x41)
    ink = sum(sum(r) for r in a_pix)
    assert 15 < ink < 60, "vanilla glyph 0x41 does not look like 'A' (%d px)" % ink
    assert any(a_pix[4]) and any(a_pix[11]), "vanilla 'A' ink outside band rows 4..14"
    print("\nvanilla 'A' (0x41) width=%d ink=%d px" % (adv, ink))
    for r in range(4, 12):
        print("   " + "".join("#" if a_pix[r][x] else "." for x in range(16)))

    ar_codes = set()
    for i in range(256):
        g = dlg_a[i * 32:(i + 1) * 32]
        if any(g[j] != 0 for j in range(1, 32)):
            ar_codes.add(i)
    print("arabic font: %d / 256 glyph slots carry ink" % len(ar_codes))

    # ---- 4. maps
    for src, dest in ((SRC_CODES, "maps\\arabic_font_codes.json"),
                      (SRC_FONT_MAP, "maps\\ar_font_map.json"),
                      (SRC_SPEC_MD, "specs\\FONT_SPEC.md"),
                      (SRC_SPEC_JSON, "specs\\font_spec.json"),
                      (SRC_WORDS_PNG, "arabic\\words_sample.png")):
        if os.path.exists(src):
            dst = os.path.join(HERE, dest)
            shutil.copyfile(src, dst)
            report.append(("copied", dest, "%d B" % os.path.getsize(dst), ""))
        else:
            print("WARN missing:", src)

    # ---- 5. generator toolchain (defaults repointed at this package)
    if os.path.exists(SRC_FONTGEN):
        txt = open(SRC_FONTGEN, encoding="utf-8").read()
        txt = txt.replace('[string]$BaseRom = "C:\\Users\\reva4\\Desktop\\game\\Golden Sun (USA, Europe).gba"',
                          '[string]$BaseRom = "original\\dialogue_font.bin"')
        txt = txt.replace('[string]$FontBaseHex = "0x31E24"', '[string]$FontBaseHex = "0x0"')
        with open(os.path.join(HERE, "generator", "fontgen3.ps1"), "w", encoding="utf-8") as f:
            f.write(txt)
        report.append(("generator", "generator\\fontgen3.ps1", "", ""))
    if os.path.exists(SRC_REGEN_UI):
        shutil.copyfile(SRC_REGEN_UI, os.path.join(HERE, "generator", "regen_ui_font_baseline.mjs"))
        report.append(("generator", "generator\\regen_ui_font_baseline.mjs", "", ""))

    # ---- 6. report
    print("\n=== package contents ===")
    for label, rel, size, h in report:
        print("%-34s %-42s %-9s %s" % (label, rel, size, h))
    print("\nOK ->", HERE)


if __name__ == "__main__":
    build()
