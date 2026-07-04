[CmdletBinding()]
param(
    [switch] $SkipTests,
    [switch] $SkipBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Invoke-Git {
    param(
        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]] $Arguments
    )

    $output = & git @Arguments

    if ($LASTEXITCODE -ne 0) {
        throw "git $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
    }

    return ($output -join "`n").Trim()
}

$scriptDirectory = Split-Path -Parent $PSCommandPath
$repoRoot = Split-Path -Parent $scriptDirectory

Push-Location $repoRoot

try {
    $workflowPath = Join-Path $repoRoot ".github\workflows\deploy-pages.yml"

    if (-not (Test-Path -LiteralPath $workflowPath)) {
        throw "GitHub Pages workflow not found at $workflowPath"
    }

    if (-not $SkipTests) {
        & (Join-Path $scriptDirectory "test.ps1")

        if ($LASTEXITCODE -ne 0) {
            throw "Tests failed. Aborting deploy preparation."
        }
    }

    if (-not $SkipBuild) {
        & (Join-Path $scriptDirectory "build-site.ps1")

        if ($LASTEXITCODE -ne 0) {
            throw "Static site build failed. Aborting deploy preparation."
        }
    }

    $currentBranch = Invoke-Git -Arguments @("branch", "--show-current")
    $status = Invoke-Git -Arguments @("status", "--short")

    Write-Host "Local deployment preparation completed."
    Write-Host "GitHub Pages is deployed by GitHub Actions from the main branch."

    if ($currentBranch -ne "main") {
        Write-Warning "Current branch is '$currentBranch'. Pages deploy only runs automatically from 'main'."
    }

    if ($status) {
        Write-Warning "Working tree has uncommitted changes. Commit and push the intended changes before expecting a Pages deploy."
    }

    Write-Host ""
    Write-Host "Next step:"
    Write-Host "  git push origin main"
    Write-Host ""
    Write-Host "After the push completes, GitHub Actions will queue the Pages deployment automatically."
}
finally {
    Pop-Location
}
