# Data Source Layout

The app reads JSON at runtime, but that JSON is generated from spreadsheet-friendly CSV source files.

## Files
- `data/source/app_config.csv`
  - `key`, `value`
- `data/source/slides.csv`
  - one row per slide
  - checklist and reminder slides both live here
- `data/source/slide_items.csv`
  - one row per checklist item or reminder line
  - use `item_type` of `check_item` or `text_line`
- `data/source/schedule_groups.csv`
  - one row per schedule rule
  - multiple rows can share the same `schedule_group_id`

## Scheduling Rules
Use schedule groups instead of repeating time windows on every slide.

Examples:
- `kids_am`
  - weekday row: `Weekdays`, `05:00`, `18:00`
  - weekend row: `Sat,Sun`, `07:00`, `15:00`
- `cleaner_monday`
  - `Mon`, `16:00`, `23:00`, `every_other_from_anchor`, `2026-06-29`

Supported `week_pattern` values:
- `all`
- `odd_weeks`
- `even_weeks`
- `every_other_from_anchor`

## CSV Editing Guidance
- Open the CSVs directly in Excel if that is the easiest editor for you.
- Quote any text cell that contains commas.
- Keep `slide_id` and `schedule_group_id` stable once the app is using them, because checklist progress is stored against those ids.
- Keep the device timezone aligned with `app_config.csv`, because version 1 uses the device clock for schedule activation.
- Add new reminder slides by:
  1. adding a row in `slides.csv`
  2. adding one or more `text_line` rows in `slide_items.csv`
  3. linking the slide to an existing or new `schedule_group_id`
