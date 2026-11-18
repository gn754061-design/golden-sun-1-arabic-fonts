# render_rooyin.ps1 — render every needed glyph form from Rooyin at design size 10 (1:1)
param(
  [string]$Out = "$PSScriptRoot\rooyin_render.txt",
  [string]$FontPath = "$PSScriptRoot\RooyinFree-Regular.ttf",
  [string]$LabelsPath = "$PSScriptRoot\render_labels.json"
)
Add-Type -AssemblyName System.Drawing
$fc = New-Object System.Drawing.Text.PrivateFontCollection
if (-not (Test-Path $FontPath)) {
  Write-Error "Font file not found: $FontPath"
  exit 1
}
$fc.AddFontFile($FontPath)
$fam = $fc.Families[0]
$SIZE = 10
$bmpW = 40; $bmpH = 40
$cps = @()

if (Test-Path $LabelsPath) {
  $labels = Get-Content $LabelsPath -Raw | ConvertFrom-Json
  foreach ($prop in $labels.PSObject.Properties) {
    $cps += [Convert]::ToInt32($prop.Name, 16)
  }
} else {
  Write-Error "Labels file not found: $LabelsPath"
  exit 1
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
