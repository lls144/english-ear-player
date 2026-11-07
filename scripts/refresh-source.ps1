$ErrorActionPreference='Stop'
& node (Join-Path $PSScriptRoot 'sync-notes.mjs') --preview
if ($LASTEXITCODE -ne 0) { throw 'Source sync preview failed.' }
