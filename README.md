# Heads Up Display

Static family checklist and reminder board for a shared household iPad.

## Editing Data
The editable source lives under `data/source/` as four Excel-friendly CSV files:

- `app_config.csv` for app title, timezone, and slide duration
- `slides.csv` for slide definitions, colors, rewards, and schedule links
- `slide_items.csv` for checklist items and reminder lines
- `schedule_groups.csv` for reusable time-window rules

These files are designed to map directly to workbook sheets if you later want one `.xlsx` authoring file. For now, the CSVs open cleanly in Excel and are the source of truth.

## Local Commands
Run these from `headsUpDisplay/`:

- `pwsh -File .\scripts\build-site.ps1`
  Builds the static app into `dist/` and regenerates `data/generated/household-data.json`.

- `pwsh -File .\scripts\test.ps1`
  Runs the Node-based test suite for CSV parsing, schedule logic, and checklist reset behavior.

- `pwsh -File .\scripts\dev-site.ps1`
  Builds the app and serves `dist/` locally at `http://localhost:4173`.

- `pwsh -File .\scripts\publish-pages.ps1`
  Runs tests, rebuilds the static site, and publishes the built output to the `gh-pages` branch for GitHub Pages.

The PowerShell wrappers locate `node.exe` from a standard install or the Adobe-bundled runtime available on this machine.

Keep the iPad/device timezone aligned with `app_config.csv`. The current schedule logic assumes the device clock matches the configured household timezone.

## Deployment
This project now uses branch-based GitHub Pages publishing instead of the `deploy-pages` action.

One-time GitHub setup:

1. Commit and push your source changes on `main`
2. Run `pwsh -File .\scripts\publish-pages.ps1` once to create and push the `gh-pages` branch
3. Open `Settings -> Pages`
4. Set `Source` to `Deploy from a branch`
5. Choose branch `gh-pages`
6. Choose folder `/(root)`
7. Save

Publishing flow from this computer:

1. Make your CSV or app changes on `main`
2. Commit and push `main`
3. Run `pwsh -File .\scripts\publish-pages.ps1`
4. GitHub Pages will publish from the updated `gh-pages` branch

The workflow in `.github/workflows/deploy-pages.yml` now only validates tests and build output on `main`.

## Notes
- The original seed CSV exports remain in `data/` for reference.
- Text fields that contain commas must be quoted in CSV, such as `"Prep camp bins, coffee, and hand towels before bed."`
