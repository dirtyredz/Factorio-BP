# Lays every extracted sprite out on a labelled grid so they can be eyeballed.
# Each cell is drawn at a fixed tiles-per-cell scale with the entity centre
# marked, which is what catches a wrong frame or a bad shift.
#
#   .\tools\contact-sheet.ps1 [outfile.png]

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$out  = Join-Path $root "sprites"
$dest = if ($args[0]) { $args[0] } else { Join-Path $root "sheet.png" }

$manifest = Get-Content (Join-Path $out "entities.json") -Raw | ConvertFrom-Json

$cell = 120; $pad = 20; $tile = 14   # screen px per tile inside a cell
$rows = @()
foreach ($name in $manifest.PSObject.Properties.Name) {
  $dirs = $manifest.$name.dirs
  $rows += ,@($name, @($dirs.PSObject.Properties.Name | Sort-Object { [int]$_ }))
}

$cols = [int](($rows | ForEach-Object { $_[1].Count } | Measure-Object -Maximum).Maximum)
$W = [int]($pad + $cols * $cell + 160)
$H = [int]($pad + $rows.Count * ($cell + $pad))
Write-Host "canvas ${W}x${H}, $($rows.Count) rows, $cols cols"

$sheet = New-Object System.Drawing.Bitmap -ArgumentList @($W, $H)
$g = [System.Drawing.Graphics]::FromImage($sheet)
$g.Clear([System.Drawing.Color]::FromArgb(255, 32, 34, 38))
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$fName = New-Object System.Drawing.Font("Consolas", 9)
$fDir  = New-Object System.Drawing.Font("Consolas", 7)
$white = [System.Drawing.Brushes]::White
$grey  = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255,150,150,160))
$mark  = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(180,255,0,255), 1)

$y = $pad
foreach ($row in $rows) {
  $name = $row[0]; $dirs = $row[1]
  $g.DrawString($name, $fName, $white, 4, $y + $cell/2 - 8)
  $x = 160
  foreach ($d in $dirs) {
    $info = $manifest.$name.dirs.$d
    $img = [System.Drawing.Image]::FromFile((Join-Path $out $info.file))
    # Cell centre is the entity centre; the sprite hangs off it by ox/oy.
    $cx = $x + $cell/2; $cy = $y + $cell/2
    $g.DrawImage($img,
      [float]($cx + $info.ox * $tile), [float]($cy + $info.oy * $tile),
      [float]($info.w * $tile),        [float]($info.h * $tile))
    $img.Dispose()
    # Crosshair at the entity's own position.
    $g.DrawLine($mark, [float]($cx-4), [float]$cy, [float]($cx+4), [float]$cy)
    $g.DrawLine($mark, [float]$cx, [float]($cy-4), [float]$cx, [float]($cy+4))
    $g.DrawString("d$d", $fDir, $grey, $x + 2, $y + $cell - 12)
    $x += $cell
  }
  $y += $cell + $pad
}
$g.Dispose()
$sheet.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)
$sheet.Dispose()
"wrote $dest ({0}x{1})" -f $W, $H
