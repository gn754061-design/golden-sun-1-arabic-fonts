# render_rooyin.ps1 — render every needed glyph form from Rooyin at design size 10 (1:1)
param([string]$Out = "C:\Users\user\Desktop\game\GS_Arabic_Fresh\fonts\rooyin_render.txt")
Add-Type -AssemblyName System.Drawing
$fc = New-Object System.Drawing.Text.PrivateFontCollection
$fc.AddFontFile("C:\Users\user\Desktop\game\GS_Arabic_Fresh\fonts\RooyinFree-Regular.ttf")
$fam = $fc.Families[0]
$SIZE = 10
$bmpW = 40; $bmpH = 40
$cps = @()
foreach ($line in (Get-Content "C:\Users\user\Desktop\game\GS_Arabic_Fresh\fonts\render_list.txt")) {
  $t = $line.Trim()
  if ($t.Length -gt 0) { $cps += [Convert]::ToInt32($t, 16) }
}
$sb = New-Object System.Text.StringBuilder
foreach ($cp in $cps) {
  $bmp = New-Object System.Drawing.Bitmap($bmpW, $bmpH)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::White)
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::SingleBitPerPixel
  $f = New-Object System.Drawing.Font($fam, $SIZE, [System.Drawing.GraphicsUnit]::Pixel)
  $g.DrawString(([string][char]$cp), $f, [System.Drawing.Brushes]::Black, (New-Object System.Drawing.PointF(12, 12)))
  # extract the ink bbox
  $minx = 999; $maxx = -1; $miny = 999; $maxy = -1
  for ($y = 0; $y -lt $bmpH; $y++) {
    for ($x = 0; $x -lt $bmpW; $x++) {
      if ($bmp.GetPixel($x, $y).R -lt 128) { if ($x -lt $minx) { $minx = $x }; if ($x -gt $maxx) { $maxx = $x }; if ($y -lt $miny) { $miny = $y }; if ($y -gt $maxy) { $maxy = $y } }
    }
  }
  if ($maxy -lt $miny) {
    [void]$sb.Append("cp " + $cp.ToString("x") + " EMPTY`n")
  } else {
    [void]$sb.Append("cp " + $cp.ToString("x") + " " + $minx + " " + $miny + " " + ($maxx - $minx + 1) + " " + ($maxy - $miny + 1) + "`n")
    for ($y = $miny; $y -le $maxy; $y++) {
      $s = ""
      for ($x = $minx; $x -le $maxx; $x++) { $s += $(if ($bmp.GetPixel($x, $y).R -lt 128) { "#" } else { "." }) }
      [void]$sb.Append($s + "`n")
    }
  }
  $g.Dispose(); $bmp.Dispose()
}
[IO.File]::WriteAllText($Out, $sb.ToString())
Write-Output ("rendered " + $cps.Length + " glyphs -> " + $Out)
