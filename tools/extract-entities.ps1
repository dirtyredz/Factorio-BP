# Stage 2 of sprite extraction: executes sprites/recipe.json, compositing each
# entity's layers into one PNG per direction. Source sheets are cached because
# the rail art is a handful of very large files hit ~40 times each.
#
# Game assets. This tool is free and non-commercial, so publishing them is fine --
# deploy.ps1 ships them to the public Pages site. (Reverses an earlier "local use
# only" rule; the owner settled it 2026-09-14 -- see CLAUDE.md.)

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root   = Split-Path -Parent $PSScriptRoot
$out    = Join-Path $root "sprites"
$recipe = Get-Content (Join-Path $out "recipe.json") -Raw | ConvertFrom-Json

$cache = @{}
function Get-Sheet($src) {
  $key = if ($src.zip) { "$($src.zip)|$($src.entry)" } else { $src.file }
  if ($cache.ContainsKey($key)) { return $cache[$key] }

  $bmp = $null
  if ($src.zip) {
    $arch = [System.IO.Compression.ZipFile]::OpenRead($src.zip)
    try {
      $entry = $arch.Entries | Where-Object { $_.FullName -like "*/$($src.entry)" } | Select-Object -First 1
      if ($entry) {
        $ms = New-Object System.IO.MemoryStream
        $s = $entry.Open(); $s.CopyTo($ms); $s.Close(); $ms.Position = 0
        $bmp = [System.Drawing.Image]::FromStream($ms)
      }
    } finally { $arch.Dispose() }
  } elseif (Test-Path $src.file) {
    $bmp = [System.Drawing.Image]::FromFile($src.file)
  }
  $cache[$key] = $bmp
  return $bmp
}

$made = 0; $failed = 0
foreach ($r in $recipe) {
  if ($r.px -lt 1 -or $r.py -lt 1) { Write-Warning "$($r.out): empty canvas"; $failed++; continue }

  $canvas = New-Object System.Drawing.Bitmap($r.px, $r.py)
  $g = [System.Drawing.Graphics]::FromImage($canvas)
  $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

  $ok = $true
  foreach ($L in $r.layers) {
    $sheet = Get-Sheet $L.src
    if (-not $sheet) { Write-Warning "$($r.out): missing source"; $ok = $false; break }

    # Clamp the crop to the sheet -- a bad index would otherwise draw garbage.
    if (($L.sx + $L.sw) -gt $sheet.Width -or ($L.sy + $L.sh) -gt $sheet.Height) {
      Write-Warning ("{0}: crop {1},{2} {3}x{4} outside {5}x{6} sheet" -f `
        $r.out, $L.sx, $L.sy, $L.sw, $L.sh, $sheet.Width, $sheet.Height)
      $ok = $false; break
    }

    $dst = New-Object System.Drawing.RectangleF(
      [float](($L.dx - $r.originX) * $r.ppt), [float](($L.dy - $r.originY) * $r.ppt),
      [float]($L.dw * $r.ppt),                [float]($L.dh * $r.ppt))
    $g.DrawImage($sheet, $dst,
      (New-Object System.Drawing.RectangleF([float]$L.sx, [float]$L.sy, [float]$L.sw, [float]$L.sh)),
      [System.Drawing.GraphicsUnit]::Pixel)
  }
  $g.Dispose()

  if ($ok) {
    $canvas.Save((Join-Path $out $r.out), [System.Drawing.Imaging.ImageFormat]::Png)
    $made++
  } else { $failed++ }
  $canvas.Dispose()
}

foreach ($b in $cache.Values) { if ($b) { $b.Dispose() } }

$bytes = (Get-ChildItem $out -Filter "*_*.png" | Measure-Object Length -Sum).Sum
"{0} sprites written, {1} failed, {2} KB" -f $made, $failed, [math]::Round($bytes/1KB)
