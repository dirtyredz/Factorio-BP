# Deploy the tool to Cloudflare Pages.
#
#   project : factorio-bp-tools
#   live    : https://factorio-bp-tools.dirtyredz.com  (also factorio-bp-tools.pages.dev)
#
# A `git push` does NOT deploy — GitHub only stores the code. The live site is a
# separate Cloudflare Pages copy that updates ONLY when this script runs.
#
# It publishes ONLY index.html + sprites/*.png. Never the blueprints (real strings),
# the docs, or the source — those were exposed once and must not be again. The sprite
# JSON is a dev artifact (the SPRITES table is inlined into index.html) so it is left
# out too.
#
# Prereqs, one-time: install Node, then `npx wrangler login` (opens a browser).
# Usage:  ./deploy.ps1

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$dist = Join-Path $root 'dist'

if (-not (Test-Path (Join-Path $root 'index.html'))) { throw 'index.html not found — run from the repo root.' }

# Clear dist/ and PROVE it is gone. A partial delete that left, say, a blueprints file behind
# would be published by the wrangler call below - this script's one guarantee is that only the
# page and the PNGs ship, so a failed cleanup must stop the deploy, never be swallowed.
if (Test-Path -LiteralPath $dist) { Remove-Item -LiteralPath $dist -Recurse -Force }
if (Test-Path -LiteralPath $dist) { throw 'dist/ could not be cleared - refusing to deploy in case stale files remain.' }
New-Item -ItemType Directory -Path (Join-Path $dist 'sprites') | Out-Null
Copy-Item (Join-Path $root 'index.html') $dist
Copy-Item (Join-Path $root 'sprites\*.png') (Join-Path $dist 'sprites')

$png = (Get-ChildItem (Join-Path $dist 'sprites') -Filter *.png).Count
Write-Host "Staged index.html + $png sprites into dist/. Deploying to factorio-bp-tools..."

npx wrangler pages deploy $dist --project-name factorio-bp-tools
