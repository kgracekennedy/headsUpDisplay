param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $NodeArguments
)

$command = Get-Command node -ErrorAction SilentlyContinue

if ($command) {
    & $command.Source @NodeArguments
    exit $LASTEXITCODE
}

$candidates = @(
    "C:\Program Files\nodejs\node.exe",
    "C:\Program Files (x86)\nodejs\node.exe",
    "C:\Program Files\Adobe\Adobe Creative Cloud Experience\libs\node.exe",
    "C:\Program Files\Common Files\Adobe\Creative Cloud Libraries\libs\node.exe"
)

foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
        & $candidate @NodeArguments
        exit $LASTEXITCODE
    }
}

throw "Node.js executable not found. Install Node.js or update scripts/run-node.ps1 with the local path."
