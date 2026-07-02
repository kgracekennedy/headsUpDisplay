[CmdletBinding()]
param(
    [string] $Branch = "gh-pages",
    [string] $WorktreePath = "C:\tmp\headsUpDisplay-gh-pages",
    [switch] $SkipTests,
    [switch] $NoPush
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Invoke-Git {
    param(
        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]] $Arguments
    )

    & git @Arguments

    if ($LASTEXITCODE -ne 0) {
        throw "git $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
    }
}

function Get-GitOutput {
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

function Clear-DirectoryContents {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Path
    )

    Get-ChildItem -LiteralPath $Path -Force |
        Where-Object { $_.Name -ne ".git" } |
        Remove-Item -Recurse -Force
}

function Test-RegisteredWorktree {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Path
    )

    $normalizedTarget = [System.IO.Path]::GetFullPath($Path)
    $worktreeList = & git worktree list --porcelain

    if ($LASTEXITCODE -ne 0) {
        throw "git worktree list --porcelain failed with exit code $LASTEXITCODE."
    }

    foreach ($line in $worktreeList) {
        if (-not $line.StartsWith("worktree ")) {
            continue
        }

        $registeredPath = $line.Substring(9).Trim()
        $normalizedRegistered = [System.IO.Path]::GetFullPath($registeredPath)

        if ($normalizedRegistered.Equals($normalizedTarget, [System.StringComparison]::OrdinalIgnoreCase)) {
            return $true
        }
    }

    return $false
}

function Remove-RegisteredWorktree {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Path
    )

    if (Test-RegisteredWorktree -Path $Path) {
        Invoke-Git worktree remove --force $Path
    }
}

function Test-SafeWorktreePath {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Path
    )

    $fullPath = [System.IO.Path]::GetFullPath($Path)
    return $fullPath.StartsWith("C:\tmp\", [System.StringComparison]::OrdinalIgnoreCase)
}

$scriptDirectory = Split-Path -Parent $PSCommandPath
$repoRoot = Split-Path -Parent $scriptDirectory
$distPath = Join-Path $repoRoot "dist"
$resolvedWorktreePath = [System.IO.Path]::GetFullPath($WorktreePath)
$currentBranch = ""

if (-not (Test-SafeWorktreePath -Path $resolvedWorktreePath)) {
    throw "WorktreePath must stay under C:\tmp\ for safety. Current value: $resolvedWorktreePath"
}

Push-Location $repoRoot

try {
    $status = Get-GitOutput status --porcelain

    if ($status) {
        throw "Working tree must be clean before publishing. Commit or stash changes first."
    }

    $originUrl = Get-GitOutput remote get-url origin

    if (-not $originUrl) {
        throw "Remote 'origin' is not configured."
    }

    $currentBranch = Get-GitOutput branch --show-current

    if (-not $SkipTests) {
        & (Join-Path $scriptDirectory "test.ps1")

        if ($LASTEXITCODE -ne 0) {
            throw "Tests failed. Aborting Pages publish."
        }
    }

    & (Join-Path $scriptDirectory "build-site.ps1")

    if ($LASTEXITCODE -ne 0) {
        throw "Static site build failed. Aborting Pages publish."
    }

    if (-not (Test-Path -LiteralPath $distPath)) {
        throw "Build output directory not found at $distPath"
    }

    Remove-RegisteredWorktree -Path $resolvedWorktreePath
    Invoke-Git worktree prune

    if (Test-Path -LiteralPath $resolvedWorktreePath) {
        Remove-Item -LiteralPath $resolvedWorktreePath -Recurse -Force
    }

    $remoteBranchExists = [bool](Get-GitOutput ls-remote --heads origin $Branch)
    & git show-ref --verify --quiet "refs/heads/$Branch"
    $localBranchExists = $LASTEXITCODE -eq 0

    if ($remoteBranchExists) {
        Invoke-Git fetch origin $Branch
        Invoke-Git worktree add --force -B $Branch $resolvedWorktreePath "origin/$Branch"
    }
    elseif ($localBranchExists) {
        Invoke-Git worktree add --force $resolvedWorktreePath $Branch
    }
    else {
        Invoke-Git worktree add --force --detach $resolvedWorktreePath HEAD

        Push-Location $resolvedWorktreePath

        try {
            Invoke-Git checkout --orphan $Branch
            Clear-DirectoryContents -Path $resolvedWorktreePath
        }
        finally {
            Pop-Location
        }
    }

    Push-Location $resolvedWorktreePath

    try {
        Clear-DirectoryContents -Path $resolvedWorktreePath
        Copy-Item -Path (Join-Path $distPath "*") -Destination $resolvedWorktreePath -Recurse -Force
        New-Item -ItemType File -Path (Join-Path $resolvedWorktreePath ".nojekyll") -Force | Out-Null

        $sourceRevision = Get-GitOutput -C $repoRoot rev-parse --short HEAD
        Invoke-Git add -A
        & git diff --cached --quiet

        if ($LASTEXITCODE -eq 0) {
            Write-Host "No publish changes detected in $Branch."
        }
        else {
            Invoke-Git commit -m "Publish site from $sourceRevision"

            if (-not $NoPush) {
                Invoke-Git push -u origin $Branch
            }
            else {
                Write-Host "Skipping push because -NoPush was supplied."
            }
        }
    }
    finally {
        Pop-Location
    }
}
finally {
    Remove-RegisteredWorktree -Path $resolvedWorktreePath

    if (Test-Path -LiteralPath $resolvedWorktreePath) {
        Remove-Item -LiteralPath $resolvedWorktreePath -Recurse -Force
    }

    if ($currentBranch) {
        $activeBranch = Get-GitOutput branch --show-current

        if ($activeBranch -ne $currentBranch) {
            Invoke-Git switch $currentBranch
        }
    }

    Pop-Location
}
