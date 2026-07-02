$testFiles = Get-ChildItem "$PSScriptRoot\..\tests" -Filter *.test.mjs -Recurse | Select-Object -ExpandProperty FullName

if (-not $testFiles) {
    throw "No test files were found under tests\."
}

& "$PSScriptRoot\run-node.ps1" "--test" "--test-isolation=none" @testFiles
exit $LASTEXITCODE
