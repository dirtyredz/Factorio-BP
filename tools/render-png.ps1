# Rasterises the draw list from render-png.js into a PNG.
#
#   node tools/render-png.js dropoff-a draw.json 32
#   .\tools\render-png.ps1 draw.json out.png
#
# Wires are drawn over the entities, the way the game layers them.

Add-Type -AssemblyName System.Drawing

$listFile = $args[0]
$dest = $args[1]
if (-not $listFile -or -not $dest) { throw "usage: render-png.ps1 <draw.json> <out.png>" }

$root = Split-Path -Parent $PSScriptRoot
$spriteDir = Join-Path $root "sprites"
$d = Get-Content $listFile -Raw | ConvertFrom-Json

$bmp = New-Object System.Drawing.Bitmap -ArgumentList @([int]$d.width, [int]$d.height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(255, 59, 59, 50))   # Factorio's dirt
$g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

# One tile grid, faint, so footprints stay readable.
$gridPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(20, 255, 255, 255), 1)
for ($x = 0; $x -lt $d.width; $x += $d.tile) { $g.DrawLine($gridPen, $x, 0, $x, $d.height) }
for ($y = 0; $y -lt $d.height; $y += $d.tile) { $g.DrawLine($gridPen, 0, $y, $d.width, $y) }

$cache = @{}
foreach ($s in $d.sprites) {
  if (-not $cache.ContainsKey($s.file)) {
    $p = Join-Path $spriteDir $s.file
    $cache[$s.file] = if (Test-Path $p) { [System.Drawing.Image]::FromFile($p) } else { $null }
  }
  $img = $cache[$s.file]
  if ($img) { $g.DrawImage($img, [float]$s.x, [float]$s.y, [float]$s.w, [float]$s.h) }
}

function New-WirePen($rgb, $kind) {
  $c = $rgb -split ','
  $pen = New-Object System.Drawing.Pen(
    [System.Drawing.Color]::FromArgb(240, [int]$c[0], [int]$c[1], [int]$c[2]),
    [float]([math]::Max(1.6, $d.tile / 18)))
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  return $pen
}

# Wires hang, so each is a quadratic through its control point. GDI+ only draws
# cubics, and a quadratic maps to one by pulling each control two thirds of the
# way from its end towards the quadratic's control point.
foreach ($w in $d.wires) {
  $pen = New-WirePen $w.rgb $w.kind
  $c1x = $w.x + 2.0 / 3.0 * ($w.cx - $w.x); $c1y = $w.y + 2.0 / 3.0 * ($w.cy - $w.y)
  $c2x = $w.x2 + 2.0 / 3.0 * ($w.cx - $w.x2); $c2y = $w.y2 + 2.0 / 3.0 * ($w.cy - $w.y2)
  $g.DrawBezier($pen, [float]$w.x, [float]$w.y, [float]$c1x, [float]$c1y,
    [float]$c2x, [float]$c2y, [float]$w.x2, [float]$w.y2)
  $pen.Dispose()
}

foreach ($w in $d.selfWires) {
  $pen = New-WirePen $w.rgb 'self'
  $pen.DashPattern = @(2, 2)
  $g.DrawEllipse($pen, [float]($w.x - $w.r), [float]($w.y - $w.r), [float]($w.r * 2), [float]($w.r * 2))
  $pen.Dispose()
}

$g.Dispose()
$bmp.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
foreach ($i in $cache.Values) { if ($i) { $i.Dispose() } }

"{0}  ({1}x{2}, {3} KB)" -f $dest, $d.width, $d.height, [math]::Round((Get-Item $dest).Length / 1KB)
