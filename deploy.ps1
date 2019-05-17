param([Parameter(Mandatory)][string] $npmToken, [switch] $details)

$ErrorActionPreference = "Continue"

function Set-NpmToken() {
  "//registry.npmjs.org/:_authToken=$npmToken" | Out-File "$(Get-Location)\.npmrc" -Encoding ASCII
}

function Get-Tarball() {
  return (Get-ChildItem -Filter *.tgz | Select-Object -First 1).Name
}

function Run($command) {
  Write-Host "> " -ForegroundColor Cyan -NoNewLine
  Write-Host $command -ForegroundColor Yellow

  # Capture stderr (2>) and stdout (&1) into the same stream
  $output = (iex $command) 2>&1

  if($details -and ![string]::IsNullOrWhiteSpace($output)) {
    Write-Host $output
  }
}

$repo = Split-Path -parent $PSCommandPath

foreach($package in "totem-timeline", "totem-timeline-react", "totem-timeline-signalr") {
  cd "$repo\src\$package\dist"

  Run "Set-NpmToken"
  Run "npm publish $(Get-Tarball)"
}