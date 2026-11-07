# Reads ANTHROPIC_API_KEY from repo-root .env and writes Assets/Scripts/AI/LocalSecrets.ts.
# LocalSecrets.ts is TRACKED as an empty stub (so a clean clone compiles). After writing a real key this script
# marks it `git update-index --skip-worktree` so the key cannot be committed by accident.
#   .\tools\sync-env.ps1          write the key from .env, mark skip-worktree
#   .\tools\sync-env.ps1 -Reset   write the empty stub back and clear skip-worktree
param([switch]$Reset)
$root = Split-Path -Parent $PSScriptRoot
$rel = "Miseflow/Assets/Scripts/AI/LocalSecrets.ts"
$out = Join-Path $root ($rel -replace '/', '\')
$utf8 = New-Object System.Text.UTF8Encoding($false)

$stubHeader = "// Commit-safe stub (tracked). Empty = live AI disabled. tools/sync-env.ps1 overwrites this locally from .env`r`n" +
  "// and marks it git skip-worktree so a real key cannot be committed. Run tools/sync-env.ps1 -Reset to restore.`r`n" +
  "// Warning: a key embedded in a Lens is extractable. Local preview/recording only; never publish.`r`n"

function Set-SkipWorktree([bool]$on) {
  $flag = if ($on) { "--skip-worktree" } else { "--no-skip-worktree" }
  Push-Location $root
  try { git update-index $flag -- $rel 2>$null } finally { Pop-Location }
}

if ($Reset) {
  [System.IO.File]::WriteAllText($out, $stubHeader + "export const ANTHROPIC_API_KEY = `"`";`r`n", $utf8)
  Set-SkipWorktree $false
  Write-Host "LocalSecrets.ts reset to the empty stub; skip-worktree cleared."
  exit 0
}

$envFile = Join-Path $root ".env"
if (-not (Test-Path $envFile)) { Write-Error "Missing $envFile. Copy .env.example to .env and set ANTHROPIC_API_KEY."; exit 1 }
$key = $null
foreach ($line in Get-Content $envFile) {
  $l = $line.Trim()
  if ($l -eq "" -or $l.StartsWith("#")) { continue }
  if ($l -match '^(?:export\s+)?ANTHROPIC_API_KEY\s*=\s*(.*)$') {
    $v = $Matches[1].Trim()
    if ($v.Length -ge 2 -and (($v[0] -eq '"' -and $v[-1] -eq '"') -or ($v[0] -eq "'" -and $v[-1] -eq "'"))) { $v = $v.Substring(1, $v.Length - 2) }
    $key = $v.Trim()
  }
}
if ([string]::IsNullOrWhiteSpace($key)) { Write-Error "ANTHROPIC_API_KEY is missing or empty in .env"; exit 1 }
$esc = $key.Replace('\', '\\').Replace('"', '\"')
# Mark skip-worktree BEFORE writing so the real key is never visible to git status/add.
Set-SkipWorktree $true
[System.IO.File]::WriteAllText($out, $stubHeader + "export const ANTHROPIC_API_KEY = `"$esc`";`r`n", $utf8)
Write-Host "Wrote LocalSecrets.ts (key length $($key.Length)). Value not shown."
Write-Host "REMINDER: LocalSecrets.ts is now marked skip-worktree (git ignores your local key). Never publish a Lens built with a real key. Undo with: .\tools\sync-env.ps1 -Reset"
