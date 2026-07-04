# Heads Up Display

Heads Up Display is a family checklist and reminder board that runs as a static website. You personalize it by editing a small set of CSV files, usually in Excel or another spreadsheet app, then rebuilding and republishing the site.

If your goal is "add another chore," "change the morning time window," or "add a new reminder slide," this README is the place to start.

## The Main Idea

The editable source of truth lives in `data/source/`:

| File | What it controls | Typical changes |
| --- | --- | --- |
| `app_config.csv` | App-wide settings | app title, timezone, slide duration |
| `slides.csv` | One row per slide | checklist vs reminder, titles, owner labels, colors, celebration text |
| `slide_items.csv` | The lines inside each slide | checklist items or reminder text |
| `schedule_groups.csv` | Time windows | when a slide is active |

The app also generates `data/generated/household-data.json` from those CSV files. Do not edit the generated JSON directly. It gets rebuilt from the CSVs.

## Quick Workflow

1. Open the CSV file you want to change in Excel, Numbers, Google Sheets, or another spreadsheet editor.
2. Make your edits.
3. Save it back as CSV.
4. Run:
   `powershell -ExecutionPolicy Bypass -File .\scripts\build-site.ps1`
5. If the result looks right, prepare the deploy:
   `powershell -ExecutionPolicy Bypass -File .\scripts\publish-pages.ps1`
6. Commit and push `main` to trigger the GitHub Pages deployment workflow.

If you only want to check for data mistakes before publishing, run:

`powershell -ExecutionPolicy Bypass -File .\scripts\test.ps1`

## Safe Editing Rules

- Edit the CSV files, not the generated JSON.
- Keep existing IDs stable when possible. Changing a `slide_id`, `item_id`, or `schedule_group_id` is more like creating a new thing than renaming a label.
- New IDs should be unique and simple. A good pattern is lowercase with underscores, such as `lilja_am_shoes`.
- `sort_order` controls display order. Lower numbers show up first.
- Use `true` or `false` in the `active` column to show or hide rows.
- Times use 24-hour format like `05:30`, `16:00`, or `23:15`.
- If you edit in Excel or another spreadsheet app, commas inside text are usually handled for you automatically.
- If you hand-edit raw CSV in a text editor, any field containing a comma must be wrapped in quotes.

## How The Files Connect

- `slides.csv` defines the slide itself.
- `slide_items.csv` attaches rows to a slide by matching `slide_id`.
- `slides.csv` attaches a slide to a schedule by matching `schedule_group_id`.
- `schedule_groups.csv` can be reused by more than one slide.

That last point matters: if two slides use the same `schedule_group_id`, changing that schedule changes both slides.

## Example: Add A Checklist Item

To add a new chore to an existing checklist:

1. Open `data/source/slide_items.csv`.
2. Find the rows for the checklist you want. For example, Lilja's morning checklist uses `slide_id` `lilja_am`.
3. Copy a nearby row and change the values.
4. Give the new row a new `item_id`.
5. Pick a `sort_order` that puts it where you want in the list.
6. Keep `item_type` as `check_item`.
7. Save the file and rebuild the site.

Example row:

```csv
slide_id,item_id,sort_order,item_type,text,day_selector,week_pattern,anchor_date,active,notes
lilja_am,lilja_am_shoes,75,check_item,Put on shoes,Weekdays,all,,true,
```

What each value means:

- `slide_id`: which checklist gets the new item
- `item_id`: unique ID for this item
- `sort_order`: where it appears in the list
- `item_type`: `check_item` for a checklist row
- `text`: what the child or parent sees on the screen
- `day_selector`: when it appears, such as `All`, `Weekdays`, or `Sat,Sun`
- `week_pattern`: usually `all`

After rebuilding, that item will appear on Lilja's morning checklist during the matching days.

## Example: Change A Time Window

To change when a slide appears:

1. Open `data/source/slides.csv`.
2. Find the slide and note its `schedule_group_id`.
3. Open `data/source/schedule_groups.csv`.
4. Find the row or rows with that `schedule_group_id`.
5. Change `start_time`, `end_time`, `day_selector`, or `week_pattern`.
6. Save and rebuild.

Example:

If a slide uses `school_launch_reminder`, this row controls its weekday timing:

```csv
schedule_group_id,label,sort_order,day_selector,start_time,end_time,week_pattern,anchor_date,active,notes
school_launch_reminder,School launch,10,Weekdays,05:30,09:00,all,,true,
```

If you change `end_time` from `09:00` to `09:30`, that reminder will stay visible 30 minutes longer.

Important: if you change a shared schedule group like `kids_am`, every slide linked to `kids_am` will change. If you want only one slide to behave differently, create a new `schedule_group_id` and point only that slide at the new schedule.

## Common Things You Can Change

### Change A Slide Title Or Celebration Message

Open `data/source/slides.csv`.

Useful columns:

- `title`: main slide heading
- `owner_label`: smaller label above the title
- `reward_message`: extra reward text kept in the data model
- `celebration_title`: short completion message shown when a checklist is complete

### Temporarily Hide A Slide Or Item

Set `active` to `false`.

You can do that in:

- `slides.csv` to hide a whole slide
- `slide_items.csv` to hide one checklist item or reminder line
- `schedule_groups.csv` to disable one schedule rule

### Add A New Reminder Slide

1. Add a row to `data/source/slides.csv` with `slide_type` set to `reminder`.
2. Reuse an existing `schedule_group_id` or create a new one in `schedule_groups.csv`.
3. Add one or more rows to `data/source/slide_items.csv` for that same `slide_id`.
4. Use `item_type` `text_line` for reminder content.

Example reminder item row:

```csv
slide_id,item_id,sort_order,item_type,text,day_selector,week_pattern,anchor_date,active,notes
new_reminder,new_reminder_line_1,10,text_line,Pack library books before bed.,All,all,,true,
```

### Change Colors

Open `data/source/slides.csv` and edit:

- `background_start`
- `background_end`
- `accent_color`
- `text_color`

Use 6-digit hex colors like `#8bc1ff`.

## Column Guide

### `app_config.csv`

| Column | Meaning |
| --- | --- |
| `key` | Setting name |
| `value` | Setting value |

Common keys:

- `app_title`
- `timezone`
- `default_slide_duration_sec`

### `slides.csv`

| Column | Meaning |
| --- | --- |
| `slide_id` | Unique ID for the slide |
| `sort_order` | Order in the rotation |
| `slide_type` | `checklist` or `reminder` |
| `title` | Main heading |
| `owner_label` | Smaller label above the title |
| `schedule_group_id` | Which schedule controls this slide |
| `reward_message` | Reward text stored with the slide |
| `celebration_title` | Completion banner text |
| `active` | `true` or `false` |

### `slide_items.csv`

| Column | Meaning |
| --- | --- |
| `slide_id` | Which slide this row belongs to |
| `item_id` | Unique ID for the item |
| `sort_order` | Order within the slide |
| `item_type` | `check_item` or `text_line` |
| `text` | What is shown on the screen |
| `day_selector` | Which days this row appears |
| `week_pattern` | Which weeks this row appears |
| `anchor_date` | Only used with `every_other_from_anchor` |
| `active` | `true` or `false` |

### `schedule_groups.csv`

| Column | Meaning |
| --- | --- |
| `schedule_group_id` | Shared schedule ID |
| `label` | Human-readable schedule name |
| `sort_order` | Order of rules within the same group |
| `day_selector` | Which days the rule applies |
| `start_time` | Start time in `HH:MM` |
| `end_time` | End time in `HH:MM` |
| `week_pattern` | Week rule |
| `anchor_date` | Only used with `every_other_from_anchor` |
| `active` | `true` or `false` |

## Supported Day And Week Rules

Useful `day_selector` values:

- `All`
- `Weekdays`
- `Weekends`
- comma-separated day names like `Mon,Wed,Fri`
- compact weekday/weekend forms such as `MTWRF` or `SASU`

Useful `week_pattern` values:

- `all`
- `odd_weeks`
- `even_weeks`
- `every_other_from_anchor`
- `first_and_third_weeks_of_month`

Only use `anchor_date` when `week_pattern` is `every_other_from_anchor`.

## Build, Preview, And Publish

Run these from the `headsUpDisplay` folder on this Windows machine:

- Build the app and regenerate the JSON:
  `powershell -ExecutionPolicy Bypass -File .\scripts\build-site.ps1`
- Run the automated tests:
  `powershell -ExecutionPolicy Bypass -File .\scripts\test.ps1`
- Build and serve the app locally:
  `powershell -ExecutionPolicy Bypass -File .\scripts\dev-site.ps1`
- Publish to GitHub Pages:
  `powershell -ExecutionPolicy Bypass -File .\scripts\publish-pages.ps1`

The published site is deployed by the GitHub Actions Pages workflow when `main` is pushed.

## Troubleshooting

- If your change does not appear, rebuild the site first.
- If the site looks stuck on an older version in a normal browser tab or installed phone app, open it in a private tab. If the private tab looks correct, the device is holding an older cached build.
- For a device with an older cached build, close the installed app, open the site in the browser, refresh it, and then reopen the installed app.
- If the installed app still looks stale after that, remove it from the home screen and add it again.
- If a slide disappears, check whether its `active` field is `false` or whether its `schedule_group_id` points to a missing schedule.
- If a checklist item never shows up, check `day_selector`, `week_pattern`, and `active`.
- If a reminder or checklist looks empty, make sure the slide has at least one matching row in `slide_items.csv`.
- Keep the device timezone aligned with the timezone in `app_config.csv`.
