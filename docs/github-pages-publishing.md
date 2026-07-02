# GitHub Pages Publishing

This repository publishes the static site from the `gh-pages` branch.

## One-Time GitHub Setup

1. Commit and push your source changes on `main`.
2. Run `pwsh -File .\scripts\publish-pages.ps1` once to create and push the `gh-pages` branch.
3. Open the repository on GitHub.
4. Go to `Settings -> Pages`.
5. Under `Build and deployment`, set `Source` to `Deploy from a branch`.
6. Set `Branch` to `gh-pages` and folder to `/(root)`.
7. Save.

## Publish Command

Run this from the repository root:

`pwsh -File .\scripts\publish-pages.ps1`

What it does:

- verifies the working tree is clean
- runs the test suite
- rebuilds `dist/`
- copies the built site into a temporary worktree
- commits the static output to `gh-pages`
- pushes `gh-pages` to `origin`

## Day-to-Day Workflow

1. Edit the CSV files or app source on `main`.
2. Commit and push `main`.
3. Run `pwsh -File .\scripts\publish-pages.ps1`.
4. Wait a minute or two for GitHub Pages to refresh.

## Notes

- The publish script uses `C:\tmp\headsUpDisplay-gh-pages` as a temporary worktree path.
- Use `-NoPush` if you want to verify the local publish branch update without sending it to GitHub.
- The GitHub Actions workflow only validates tests and build output; it does not deploy Pages.
