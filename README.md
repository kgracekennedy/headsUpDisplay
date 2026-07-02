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

The PowerShell wrappers locate `node.exe` from a standard install or the Adobe-bundled runtime available on this machine.

Keep the iPad/device timezone aligned with `app_config.csv`. The current schedule logic assumes the device clock matches the configured household timezone.

## Deployment
GitHub Pages deployment is handled by `.github/workflows/deploy-pages.yml`. The workflow runs tests, builds the static site, and uploads `dist/`.

## Notes
- The original seed CSV exports remain in `data/` for reference.
- Text fields that contain commas must be quoted in CSV, such as `"Prep camp bins, coffee, and hand towels before bed."`
