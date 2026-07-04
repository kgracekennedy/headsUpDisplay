# GitHub Pages Publishing

This repository publishes the static site with the GitHub Actions workflow in `.github/workflows/deploy-pages.yml`.

## One-Time GitHub Setup

1. Open the repository on GitHub.
2. Go to `Settings -> Pages`.
3. Under `Build and deployment`, set `Source` to `GitHub Actions`.
4. Save.

## Publish Command

Run this from the repository root:

`pwsh -File .\scripts\publish-pages.ps1`

What it does:

- runs the test suite unless `-SkipTests` is supplied
- rebuilds `dist/` unless `-SkipBuild` is supplied
- confirms whether you are on `main`
- reminds you to push `main`, which is what triggers the real Pages deployment

## Day-to-Day Workflow

1. Edit the CSV files or app source on `main`.
2. Run `pwsh -File .\scripts\publish-pages.ps1`.
3. Commit the intended changes.
4. Push `main`.
5. Wait for the `Validate and Deploy via GitHub Actions` workflow to finish.

## Notes

- The site is no longer published from a `gh-pages` branch.
- The workflow queues Pages deployments instead of canceling one in progress, which avoids the `due to in progress deployment` API failure.
- If a deployment is already running, the next one waits for the active deployment to finish.
