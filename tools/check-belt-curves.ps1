# Verifies the belt curve mapping without needing the game.
#
# A curve sprite joins two edges of its tile. Which two is implied by the key:
# "<to>c<from>" means the flow was travelling `from` and now travels `to`, so it
# ENTERS through the edge opposite `from`'s travel and LEAVES through `to`'s edge.
# Travelling east enters via the west edge, and so on.
#
# So: measure where the art actually meets the tile boundary and compare. If the
# index mapping in build-recipe.js is wrong, the edges won't line up.

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$dir = Join-Path $root "sprites"

# key -> expected edges, worked out from the key alone
$opposite = @{ 0 = 8; 4 = 12; 8 = 0; 12 = 4 }
$edgeName = @{ 0 = 'N'; 4 = 'E'; 8 = 'S'; 12 = 'W' }

$keys = @('0c4', '4c0', '0c12', '12c0', '4c8', '8c4', '12c8', '8c12')
$bad = 0

foreach ($k in $keys) {
  $parts = $k -split 'c'
  $to = [int]$parts[0]; $from = [int]$parts[1]
  $entry = $opposite[$from]
  $want = @($edgeName[$entry], $edgeName[$to]) | Sort-Object

  $file = Join-Path $dir ("fast-transport-belt_" + $k + ".png")
  if (-not (Test-Path $file)) { Write-Warning "missing $file"; $bad++; continue }
  $bmp = New-Object System.Drawing.Bitmap($file)

  # The frame is padded: a 1x1 tile centred in a 2x2 frame.
  $q = $bmp.Width / 4
  $lo = [int]$q; $hi = [int]($bmp.Width - $q) - 1

  # Fraction of each tile edge that the art actually covers.
  function Coverage($bmp, $fixed, $isRow, $lo, $hi) {
    $hit = 0; $n = 0
    for ($i = $lo; $i -le $hi; $i++) {
      $p = if ($isRow) { $bmp.GetPixel($i, $fixed) } else { $bmp.GetPixel($fixed, $i) }
      if ($p.A -gt 40) { $hit++ }
      $n++
    }
    return [math]::Round($hit / $n, 2)
  }

  $cov = @{
    N = Coverage $bmp $lo        $true  $lo $hi
    S = Coverage $bmp $hi        $true  $lo $hi
    W = Coverage $bmp $lo        $false $lo $hi
    E = Coverage $bmp $hi        $false $lo $hi
  }
  $bmp.Dispose()

  # The two most-covered edges are the ones the belt joins. Note this can only
  # prove WHICH edges are joined, not which way items flow along them: the two
  # curves sharing an edge pair are mirror images in time, not in space. The
  # flow direction within a pair is inferred from the prototype names.
  $got = ($cov.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 2 |
          ForEach-Object { $_.Key }) | Sort-Object

  $ok = ($got -join '') -eq ($want -join '')
  if (-not $ok) { $bad++ }
  "{0,-6} want {1,-4} got {2,-4} {3}   N={4} E={5} S={6} W={7}" -f `
    $k, ($want -join ''), ($got -join ''), $(if ($ok) { "ok" } else { "MISMATCH" }),
    $cov.N, $cov.E, $cov.S, $cov.W
}

""
if ($bad) { "$bad of $($keys.Count) wrong"; exit 1 } else { "all $($keys.Count) curves join the edges their key implies" }
