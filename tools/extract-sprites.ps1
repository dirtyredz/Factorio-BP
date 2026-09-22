# Pulls entity icons out of the local Factorio install into sprites/.
# Factorio icons are mipmap strips (64 + 32 + 16 + 8 = 120 px wide); the
# leftmost 64x64 square is the full-res image, the rest are shrunken copies.
# Mod icons live inside the mod .zip and are read out without unpacking it.
#
# These are Wube's (and mod authors') assets. This tool is free and non-commercial,
# so publishing them is fine -- deploy.ps1 ships them to the public Pages site.
# (Reverses an earlier "local use only" rule; the owner settled it 2026-09-14 -- see CLAUDE.md.)

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root  = Split-Path -Parent $PSScriptRoot
$game  = "C:\Program Files (x86)\Steam\steamapps\common\Factorio"
$mods  = "$env:APPDATA\Factorio\mods"
$out   = Join-Path $root "sprites"
if (-not (Test-Path $out)) { New-Item -ItemType Directory $out | Out-Null }

# name -> icon path as Factorio writes it, from data-raw-dump.json
$icons = [ordered]@{
  "straight-rail"        = "__base__/graphics/icons/rail.png"
  "curved-rail-a"        = "__base__/graphics/icons/curved-rail.png"
  "curved-rail-b"        = "__base__/graphics/icons/curved-rail-b.png"
  "half-diagonal-rail"   = "__base__/graphics/icons/half-diagonal-rail.png"
  "bulk-inserter"        = "__base__/graphics/icons/bulk-inserter.png"
  "fast-transport-belt"  = "__base__/graphics/icons/fast-transport-belt.png"
  "steel-chest"          = "__aai-containers__/graphics/icons/container-1-base.png"
  "rail-signal"          = "__base__/graphics/icons/rail-signal.png"
  "rail-chain-signal"    = "__base__/graphics/icons/rail-chain-signal.png"
  "medium-electric-pole" = "__base__/graphics/icons/medium-electric-pole.png"
  "big-electric-pole"    = "__base__/graphics/icons/big-electric-pole.png"
  "decider-combinator"   = "__base__/graphics/icons/decider-combinator.png"
  "train-stop"           = "__base__/graphics/icons/train-stop.png"
}

# Returns a Bitmap for a __mod__/path icon reference, or $null.
function Get-IconBitmap($ref) {
  if ($ref -notmatch '^__([^_]+(?:[-_][^_]+)*)__/(.+)$') { return $null }
  $mod = $matches[1]; $rel = $matches[2]

  # Shipped data mods sit unpacked under data\<mod>\.
  $direct = Join-Path $game "data\$mod\$rel"
  if (Test-Path $direct) { return [System.Drawing.Image]::FromFile($direct) }

  # Everything else is a versioned .zip in the mods folder.
  $zip = Get-ChildItem $mods -Filter "$mod`_*.zip" -ErrorAction SilentlyContinue |
         Sort-Object Name | Select-Object -Last 1
  if (-not $zip) { return $null }
  $arch = [System.IO.Compression.ZipFile]::OpenRead($zip.FullName)
  try {
    # Entries are prefixed with the mod's root folder, which carries the version.
    $entry = $arch.Entries | Where-Object { $_.FullName -like "*/$rel" } | Select-Object -First 1
    if (-not $entry) { return $null }
    $ms = New-Object System.IO.MemoryStream
    $s = $entry.Open(); $s.CopyTo($ms); $s.Close()
    $ms.Position = 0
    return [System.Drawing.Image]::FromStream($ms)
  } finally { $arch.Dispose() }
}

$total = 0
foreach ($name in $icons.Keys) {
  $src = Get-IconBitmap $icons[$name]
  if (-not $src) { Write-Warning "$name : could not resolve $($icons[$name])"; continue }

  # Take only the first mip level, whatever the strip length.
  $side = $src.Height
  $bmp  = New-Object System.Drawing.Bitmap($side, $side)
  $g    = [System.Drawing.Graphics]::FromImage($bmp)
  $g.DrawImage($src, (New-Object System.Drawing.Rectangle(0, 0, $side, $side)),
                     0, 0, $side, $side, [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()

  $path = Join-Path $out "$name.png"
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose(); $src.Dispose()

  $kb = [math]::Round((Get-Item $path).Length / 1KB, 1)
  $total += (Get-Item $path).Length
  "{0,-22} {1}x{1}  {2} KB" -f $name, $side, $kb
}
"" ; "{0} icons, {1} KB total" -f $icons.Count, [math]::Round($total / 1KB, 1)
