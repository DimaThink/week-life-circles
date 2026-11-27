# Week Life Circles

A life-in-weeks journal for [Obsidian](https://obsidian.md) · **[week.dth.ink](https://week.dth.ink)**

Week Life Circles draws your life as a grid: 52 weeks down, one column per year, one circle per week. Write a note for a week, choose what kind of week it was, and its circle fills in with that colour or a small image. Click a filled circle to open its note, or an empty one to create it. A second view does the same for single days, and every note is a plain Markdown file in your vault.

## Screenshots

**The week grid** — one circle per week of your life, colored by what kind of week it was, with image circles for trips and milestones:

<img src="docs/screenshots/week-grid.png" alt="The week grid" height="540">

**Creating a week note** — pick a circle, and optionally attach photos (including from an Immich server):

<img src="docs/screenshots/create-week.png" alt="The Create week file dialog with the circle picker" width="760">

**Every circle links to its note:**

<img src="docs/screenshots/week-link.png" alt="A week circle showing the note it links to">


## How it counts

Weeks are *personal*, not calendar weeks: by default year `28`, week `01` starts on your
28th birthday. Each personal year has 52 weeks (the last one absorbs the extra
day or two). That is why the plugin needs your birth date before it shows anything.

Prefer a calendar-style grid? **Year starts** lets each year begin on your birthday
(default), on 1 January, or on any day you choose (e.g. 1 September for a school year).

## Features

- **Week grid** — every week of your life from a start age to an end age, as a
  staggered grid of circles. The current week pulses. Rows and columns can be swapped.
- **Day grid** — the next ten personal years, one circle per day. The row
  labels show the calendar date (the month's short name on the 1st), and each
  month's 1st is marked in every column (a thin ring in the honeycomb, a line in the aligned views).
- **Three views** — the first button at the top right of the grid switches
  between circles in a honeycomb (the default), squares in a plain aligned grid
  like the classic "life in weeks" poster, and circles in that same aligned grid.
  The choice applies to both grids and is remembered.
- **Circles** — each note carries one colored circle (or a small image, e.g. a
  flag for a trip). The set of circles is yours to edit in the settings: rename,
  recolor, reorder, delete, and upload images straight from your device (or pick
  one already in your vault) — with a live preview in your cell shape. Days can
  have a separate set of circles of their own.
- **Hover preview** — hovering a filled circle opens Obsidian's own note popover (the one links show), rendered with headings and photos, so you can recall a week without opening it. It uses the core *Page preview* plugin; in its settings, *Week Life Circles* can be set to require Cmd/Ctrl.
- **One-click notes** — clicking an empty circle opens a dialog: pick the circle,
  optionally attach photos or videos (uploaded, or picked from a photo folder in your vault
  by the week's dates), and the note is created from your template.
- **Circle as a property** — a note keeps its circle in a frontmatter property
  (`circle: work`, or `square: work` to draw a square) and no HTML in its text; the plugin
  draws it next to the note title by itself. Bases, Dataview and search can use the
  property. The command **Move circle markers into properties** converts older notes
  (after a dry run).
- **Multi-week notes** — one note can cover several weeks (`03-05.28` in its
  first lines, with one circle per week).
- **Templates** — the week and day note templates are plain text in the settings,
  with starter templates (Minimal, Journal, Reflection) in English, Ukrainian and Polish.
  A new install starts with the Journal template in your language. Dates are written in
  the format you choose.
- **Works on mobile** — including a floating button to open the grid. On a
  narrow screen the year columns page by decade: swipe sideways to flip exactly
  ten years (20–29, 30–39, …), scroll up and down as usual. The cells shrink a
  little so a whole decade fits the screen.
- **Follows your theme** — light or dark; every filled circle has a subtle
  contrasting ring, so white circles stay visible on a light background and
  black ones on a dark background.
- **English, Ukrainian, Polish** — the interface follows Obsidian's language, or the one you
  pick in the settings.
- **Optional Immich photo picker** — see below. Off by default.

## Getting started

1. Install and enable the plugin.
2. Open **Settings → Week Life Circles** and enter your **birth date** (`YYYY-MM-DD`)
   (until then the grid shows an **Open settings** button).
3. Open the grid: the ribbon icon, or the command **Open week calendar**.
4. Click the current week and create your first note.

## Where notes live

| What | Path (defaults) |
| --- | --- |
| Week note | `Week life calendar/28/07.28.md` (week `07` of personal year `28`) |
| Week attachments | Obsidian's attachment location (**Settings → Files and links**), named `07.28.jpg`, `07_2.28.jpg`, …; or a folder of your own with **Photo location → Own folder**, e.g. `Photos/{{yy}}` → `Photos/28/07.28.jpg` |
| Day note | `Week day status/2026-11-18.md`; with **Day note layout** also `Week day status/07.28/2026-11-18.md` (per week) or `Week day status/2026/11/2026-11-18.md` (per month) |

Installs from 1.9 or earlier keep the per-week day folders and photos in
`<week folder>/Attachments/{{yy}}`. Day notes are found anywhere inside the day folder, so a layout change never hides
older notes, and the day folder can be the core **Daily notes** folder.

### The circle of a note

A note keeps its circle in a frontmatter property:

- one circle: `circle: work`
- a note covering several weeks, one circle per week in order: `circle: [work, trip]`, or
  the block list Obsidian writes (`circle:` followed by `  - work` and `  - trip` lines)
- `square: work` instead of `circle: work` draws a square instead of a circle

A value names a circle by its key base name (`work` for `work.png`), its full key, or its
display name, ignoring case; values that match no circle are ignored. The property new
notes get is set in **Circle property** (`circle`, `square` or a name of your own, which
draws circles); `circle` and `square` are always read. Notes written by older versions may
instead have a marker in their first lines (`07.28 <span class="sq sq-work"></span> 18.11.2026`,
or an embed such as `![[england.png|14]]`); the grid still reads it.

The plugin draws the circle next to the note name at the top of the note (Obsidian's
*inline title*), in reading view, live preview and source mode: `● 07.28`. It is painted
beside the title, so the file name is never changed. A note covering several weeks shows one
circle per week, in order; a day note shows its first circle. With the inline title turned
off (**Settings → Appearance → Show inline title**), the circle is drawn after the first word
of the first line below the frontmatter instead (at the end of the line when it is a
heading). It uses the circle's colour or image with the same contrast ring as the grid,
follows changes to the property and to your circles at once, is not part of the note text
and does nothing when clicked. It is drawn only for notes in the week and day folders named
`WW.YY.md` or `YYYY-MM-DD.md`, and never for a note whose first lines still have a marker in
the text, so a note never shows its circle twice.

**Move circle markers into properties** (command palette) scans the week and day folders
and shows what it will do, with five examples; only after you confirm does it add the
property (via Obsidian's frontmatter API) to every note that has a marker but no property,
then remove the marker from the text (`07.28 <span …></span> 18.11.2026` becomes
`07.28 18.11.2026`; a line holding only the marker is removed). Notes whose marker is not
one of your circles (an old-style embed may be a photo) are left alone; running it again is
safe.

## Settings

| Setting | What it does |
| --- | --- |
| Language | Auto (follows Obsidian), English, Ukrainian or Polish: the settings, dialogs, buttons and notices. A language you pick also sets the month and weekday names; on Auto they follow Obsidian. Command names update after reloading the plugin. |
| Birth date | Needed before anything is shown; the default start of every grid year. |
| Year starts | On your birthday (default), on 1 January, or on a custom day (`MM-DD`). Existing notes keep their week/year numbers, so after a change they map to different dates. |
| Start from year | The first year of the week grid: the current year (default, moves forward on its own) or any year from 0 (your whole life) up to now. Notes from earlier years stay in your vault. |
| End age | Last personal year shown in the week grid. |
| Day grid years | How many years the day grid shows side by side, 1–30 (default 10). |
| Floating button on mobile | The round button that opens the grid (default on). |
| Week folder / Day folder | Where week and day notes are stored. |
| Day note layout | Where new day notes go inside the day folder: all in the folder (`YYYY-MM-DD.md`, default for new installs), a folder per week (`WW.YY/`, kept by installs from 1.9 or earlier) or per month (`YYYY/MM/`). |
| Photo location | Where photos uploaded with a new week go: Obsidian's attachment location (default for new installs) or **Own folder**, a path of your choice where `{{yy}}` and `{{ww}}` become the personal year and week (e.g. `Photos/{{yy}}`). Installs from 1.9 or earlier use `<week folder>/Attachments/{{yy}}`. |
| Photo width | Display width of embedded photos, default `600` px; `0` = no width (full size). Videos are embedded without one. |
| Photo folder in the vault | Off when empty. When set, the new week dialog lists the photos and videos in this folder (and its subfolders) taken that week — the date comes from `YYYY-MM-DD` or `YYYYMMDD` in the file name (e.g. `IMG_20261118_0930.jpg`), else from the file's creation date. Picked files are embedded where they are, not copied. |
| Week template path / Day template path | Optional path to a note used as the week or day template instead of the built-in one. The same `{{…}}` placeholders work in it (Templater tags are not interpreted by this plugin). |
| Date format | How dates are written into new notes, as a [moment.js format](https://momentjs.com/docs/#/displaying/format/) — default `DD.MM.YYYY`. Day note file names always stay `YYYY-MM-DD.md`. |
| Week template / Day template | Text of new notes; see the placeholders below. |
| Starter template | Pick Minimal, Journal or Reflection and **Load** it to replace the week template (after a confirmation), in the plugin's current language. |
| Circle property | The frontmatter property new notes keep their circle in: `circle` (default), `square` (drawn as a square) or **Custom…**, a name of your own (drawn as a circle). `{{circle}}` or `{{square}}` in a template picks the property for notes from that template. |
| Circles | **Restore defaults** brings back the seven default circles in one click. The list of circles, previewed in your cell shape. Each is a name plus a color, or an image. Rename, recolor, reorder (the first one is preselected for new notes) or delete them; **Replace image** uploads a new picture under the same file name, so existing notes keep working. A colour circle can become an image circle (upload or pick a picture) and back again; notes that already use it follow along and show its new look. **Add a circle**: pick a color, or upload an image (shrunk to a small PNG and saved to your attachments folder) or choose a PNG/JPG already in your vault. |
| Separate circles for days | Off by default. When on, a second circle list (**Day circles**, edited the same way) is used by day notes, the day grid and the new-day dialog; week notes keep the circles above. The day list starts as a copy of your circles at the time of the upgrade (the seven defaults on a new install), so day notes you already have keep their circles. Markers of both lists are coloured inside notes. |
| Immich | Optional photo picker, see below. |
| Configuration | **Export** copies all settings as one code; **Import** applies a pasted code, or fetches one from a URL you paste. Good for setting up a second device. |

## Template placeholders

| Placeholder | Week note | Day note |
| --- | --- | --- |
| `{{ww}}`, `{{yy}}` | week number (`07`) and personal year (`28`) | — |
| `{{circle}}`, `{{square}}` | writes nothing; the note gets its circle in the `circle` or `square` property | same |
| `{{date}}` | first day of the week | the day |
| `{{weekEnd}}` | last day of the week (week 52 runs up to the next year start) | — |
| `{{today}}` | the day the note is created | the day the note is created |
| `{{yesterday}}` | — | the day before |
| `{{weekday}}` | — | weekday name |
| `{{days}}` | one line per day of the week: `- Wed 18.11.2026 — ` (7 lines; week 52 may have 8–9) | — |
| `{{photos}}` | embeds of the attached photos/videos | — |

Dates use the **Date format** setting; one placeholder can carry its own format, e.g.
`{{date:YYYY-MM-DD}}` or `{{today:D MMMM}}`. Weekday and month names are written in Obsidian's
language, or in the plugin's language if you picked one.

Upgrading from 1.9 or earlier: `{{date}}` used to be the creation date in week notes and
`YYYY-MM-DD` in day notes. Your saved templates are rewritten once (`{{date}}` → `{{today}}` in
the week template, → `{{date:YYYY-MM-DD}}` in the day template), so new notes look as before.
Template *files* are not rewritten: use the `{{…}}` placeholders in them (Templater tags are
left as they are).

**Update the plugin on every synced device.** An older version still running on another device
drops the new settings when it saves, and would write `{{today}}` literally into new notes.

## Import / export configuration

Set up another device (e.g. a phone) without re-typing everything: on the
already-configured device, go to **Settings → Week Life Circles → Configuration
→ Copy config code**. On the other device, paste it into **Import config** and
press Apply — every setting fills in (both circle lists included).

The code is base64 of your settings and **includes your Immich API key**, so
treat it like a password. You can also paste a **URL** that returns the config
(raw JSON, or the same code) — the plugin fetches it only when you press Apply
(see the network disclosure below).

## Commands

- **Open week calendar**
- **Open day calendar**
- **Create next week file** — the week after the last one you wrote this year
- **Create week file** — any week, by number

## Optional Immich integration (network use)

If you run your own [Immich](https://immich.app) photo server, the "Create week
file" dialog can show that week's photos so you can pick some to attach.

**Disclosure.** The plugin touches the network in only two places, and each runs
*only* when you ask: this Immich picker, and **Import config** when you paste a
URL (it fetches that URL's text and reads it as your settings). There is no
telemetry and nothing is ever sent to the plugin author. For Immich specifically:

- It is **off by default**. Nothing is contacted until you enable it and enter a
  server URL and an API key.
- Requests go **only to the server URL you enter** — never to the plugin author
  or any third party. There is no telemetry.
- What is sent: your API key (as the `x-api-key` header) and the date range of
  the week you are creating. What is fetched: the list of assets in that range,
  their thumbnails, and the photos or videos you select, which are saved into
  your vault.
- The API key is stored in the plugin's `data.json` inside your vault, in plain
  text. Use a key with read-only permissions, and keep it in mind if you sync or
  share the vault.

Without Immich you can still attach photos by dropping files into the dialog.

## Installing manually

Download `main.js`, `manifest.json` and `styles.css` from the latest release and
put them in `<vault>/.obsidian/plugins/week-life-circles/`.

## Development

```
npm install
npm test        # unit tests (calendar math, parsing, templates, migration)
npm run build   # type-check and bundle to main.js
```

## License

[MIT](LICENSE)
