param(
  [string]$Codes = "ar_codes.json",
  [string]$BaseRom = "original\dialogue_font.bin",
  [int]$Size = 14,
  [int]$Baseline = 12,
  [string]$Family = "Segoe UI",
  [int]$Thicken = 1,
  [int]$PadRight = 1,
  [int]$MaxInk = 0,
  [string]$Out = "ar_font_v16.bin",
  [string]$FontBaseHex = "0x0",
  [string[]]$Only
)
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'
$fontBase = [Convert]::ToInt64($FontBaseHex.Substring(2), 16)
$rom = [System.IO.File]::ReadAllBytes($BaseRom)
$font = New-Object byte[] 8192
[Array]::Copy($rom, $fontBase, $font, 0, 8192)
$codeList = Get-Content $Codes -Raw -Encoding UTF8 | ConvertFrom-Json
Write-Output ("codes=" + $codeList.Count)

$CW = 24; $CH = 22
$fnt = New-Object System.Drawing.Font($Family, $Size, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$sf = New-Object System.Drawing.StringFormat([System.Drawing.StringFormatFlags]::MeasureTrailingSpaces -bor [System.Drawing.StringFormatFlags]::NoWrap)
$fam = New-Object System.Drawing.FontFamily($Family)
$em = $fam.GetEmHeight([System.Drawing.FontStyle]::Bold)
$asc = $fam.GetCellAscent([System.Drawing.FontStyle]::Bold)
$ascPx = [double]$asc * $Size / $em
$drawY = [single]($Baseline - $ascPx)
Write-Output ("ascentPx=" + $ascPx + " drawY=" + $drawY)
$script:map = New-Object 'bool[,]' $CH, $CW

function Render-CP([int]$cp) {
  $bmp = New-Object System.Drawing.Bitmap $CW, $CH
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::SingleBitPerPixelGridFit
  $g.Clear([System.Drawing.Color]::White)
  $chr = [string][char]$cp
  $g.DrawString($chr, $fnt, [System.Drawing.Brushes]::Black, [single]2, $drawY, $sf)
  for ($y = 0; $y -lt $CH; $y++) {
    for ($x = 0; $x -lt $CW; $x++) {
      $script:map[$y, $x] = ($bmp.GetPixel($x, $y).R -lt 140)
    }
  }
  $g.Dispose(); $bmp.Dispose()
}

function Dilate-Map([int]$passes) {
  for ($p = 0; $p -lt $passes; $p++) {
    $out = New-Object 'bool[,]' $CH, $CW
    for ($y = 0; $y -lt $CH; $y++) {
      for ($x = 0; $x -lt $CW; $x++) {
        if ($script:map[$y, $x]) {
          $out[$y, $x] = $true
          if ($x + 1 -lt $CW) { $out[$y, ($x + 1)] = $true }
          if ($y + 1 -lt $CH) { $out[($y + 1), $x] = $true }
          if ($x + 1 -lt $CW -and $y + 1 -lt $CH) { $out[($y + 1), ($x + 1)] = $true }
        }
      }
    }
    $script:map = $out
  }
}

$n = 0
$report = @()
foreach ($e in $codeList) {
  if ($Only -and ($Only -notcontains $e.name) -and ($Only -notcontains ("0x" + $e.code.ToString('x')))) { continue }
  Render-CP ([int]$e.cp)
  Dilate-Map $Thicken
  $x0 = 99; $x1 = -1; $y0 = 99; $y1 = -1
  for ($y = 0; $y -lt $CH; $y++) {
    for ($x = 0; $x -lt $CW; $x++) {
      if ($script:map[$y, $x]) {
        if ($x -lt $x0) { $x0 = $x }
        if ($x -gt $x1) { $x1 = $x }
        if ($y -lt $y0) { $y0 = $y }
        if ($y -gt $y1) { $y1 = $y }
      }
    }
  }
  if ($x1 -lt 0) { Write-Output ("EMPTY: " + $e.name); continue }
  $inkW = $x1 - $x0 + 1
  $inkH = $y1 - $y0 + 1
  $bytes = New-Object byte[] 32
  $anyInk = $false
  for ($y = 0; $y -lt 15; $y++) {
    for ($x = 0; $x -lt 16; $x++) {
      $sx = $x0 + $x
      if ($sx -ge $CW) { continue }
      if ($script:map[$y, $sx]) {
        $anyInk = $true
        $bi = 1 + $y * 2
        if ($x -lt 8) { $bytes[$bi] = $bytes[$bi] -bor (1 -shl (7 - $x)) }
        else { $bytes[$bi + 1] = $bytes[$bi + 1] -bor (1 -shl (15 - $x)) }
      }
    }
  }
  if (-not $anyInk) { Write-Output ("NO-INK-AFTER-SHIFT: " + $e.name); continue }
  # horizontal compression if the ink is wider than allowed
  if ($MaxInk -gt 0 -and $inkW -gt $MaxInk) {
    $ratio = [double]$MaxInk / [double]$inkW
    $newMap = New-Object 'bool[,]' $CH, $MaxInk
    for ($ox = 0; $ox -lt $MaxInk; $ox++) {
      $sx0 = [int][math]::Floor($x0 + $ox * $inkW / $MaxInk)
      $sx1 = [int][math]::Ceiling($x0 + ($ox + 1) * $inkW / $MaxInk)
      if ($sx1 -le $sx0) { $sx1 = $sx0 + 1 }
      for ($y = 0; $y -lt $CH; $y++) {
        $any2 = $false
        for ($sx = $sx0; $sx -lt $sx1; $sx++) { if ($sx -lt $CW -and $script:map[$y, $sx]) { $any2 = $true; break } }
        if ($any2) { $newMap[$y, $ox] = $true }
      }
    }
    # rebuild bytes from the compressed map, rows 0..14
    $bytes = New-Object byte[] 32
    for ($y = 0; $y -lt 15; $y++) {
      for ($x = 0; $x -lt [math]::Min(16, $MaxInk); $x++) {
        if ($newMap[$y, $x]) {
          $bi = 1 + $y * 2
          if ($x -lt 8) { $bytes[$bi] = $bytes[$bi] -bor (1 -shl (7 - $x)) }
          else { $bytes[$bi + 1] = $bytes[$bi + 1] -bor (1 -shl (15 - $x)) }
        }
      }
    }
    $inkW = $MaxInk
  }
  $w = $inkW + $PadRight
  if ($w -gt 16) { $w = 16 }
  if ($w -lt 2) { $w = 2 }
  $bytes[0] = [byte]$w
  [Array]::Copy($bytes, 0, $font, ([int]$e.code) * 32, 32)
  $n++
  $report += ("0x{0:x2} {1,-24} inkW={2} inkH={3} w={4}" -f $e.code, $e.name, $inkW, $inkH, $w)
}
[System.IO.File]::WriteAllBytes((Join-Path (Get-Location) $Out), $font)
Write-Output ("wrote {0} glyphs={1} size={2} baseline={3}" -f $Out, $n, $Size, $Baseline)
$report | ForEach-Object { Write-Output $_ }



