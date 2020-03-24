param([Parameter(Mandatory)][string] $version, [switch] $details)

$ErrorActionPreference = "Continue"

function Remove-DistFolder() {
  $dist = "$(Get-Location)\dist"

  if(Test-Path $dist) {
    Remove-Item $dist -Recurse
  }
}

function Replace-InPackageJson($pairs) {
  $packageJson = "$(Get-Location)\package.json"

  $content = Get-Content $packageJson

  foreach($property in $pairs.Keys) {
    $value = $pairs[$property]

    $match = "`"$property`": `".*?`""
    $replace = "`"$property`": `"$value`""

    $content = $content -replace $match, $replace
  }

  [System.IO.File]::WriteAllLines($packageJson, $content)
}

function Replace-PreBuildVersions() {
  Replace-InPackageJson @{
    "totem-timeline" = "file:../totem-timeline/dist/totem-timeline-$version.tgz"
  }
}

function Replace-PostBuildVersions() {
  Replace-InPackageJson @{
    "version" = $version;
    "totem-timeline" = "^$version";
  }
}

function Run($prefix, $command) {
  Write-Host "$prefix> " -ForegroundColor Cyan -NoNewLine
  Write-Host $command -ForegroundColor Yellow

  # Capture stderr (2>) and stdout (&1) into the same stream
  $output = (iex $command) 2>&1
  $success = $?

  if($details -and ![string]::IsNullOrWhiteSpace($output)) {
    Write-Host $output
  }

  if(!$success) {
    throw "Command returned a non-success exit code: $LastExitCode"
  }
}

$repo = Split-Path -parent $PSCommandPath

Write-Host ""

foreach($package in "totem-timeline", "totem-timeline-signalr", "totem-timeline-vue") {
  cd "$repo\src\$package"

  Run $package "Remove-DistFolder"
  Run $package "Replace-PreBuildVersions"
  Run $package "npm install --no-progress"
  Run $package "webpack"
  Run $package "copy package.json dist"
  Run $package "copy readme.md dist"
  Run $package "cd dist"
  Run "$package\dist" "Replace-PostBuildVersions"
  Run "$package\dist" "npm pack`n"
}