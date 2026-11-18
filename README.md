# Standupper

A SvelteKit app on Cloudflare Workers + D1 to help software teams manage their daily standup meetings, styled neo-brutalist: paper background, thick ink borders, hard shadows, and loud flat color.

## Features

- Create and join standup sessions
- Manage team members
- Randomized speaking order with timer
- Neo-brutalist interface with five selectable accent colors
- Seasonal and holiday site themes (Automatic, Standard, plus 12 seasonal ones), selectable per standup
- Simple, intuitive user experience

## Design

Neo-brutalism:

- Cream paper background with a faint dot grid; cards with 3px ink borders and hard offset shadows (no blur, no gradients)
- Archivo Black display type, Space Grotesk body, Space Mono for labels and data
- Sticker-style section labels and highlighter-mark accent text
- The current speaker sits on a slightly rotated accent card — the page's one loud moment
- Buttons physically "press" (translate into their shadow) on hover/click
- Five flat accent colors (green, red, blue, yellow, purple) selectable per standup

## Themes

Themes change the paper, ink, background pattern and seasonal decorations. They never touch the accent color, so every color works with every theme.

- **Automatic** (default): follows the viewer's local calendar (table below), Standard otherwise. The home page always uses Automatic.
- **Standard**: the original look.

| Theme                 | Automatic dates                                                       | Look                                                                     |
| --------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 🎆 New Year           | Jan 1–7                                                               | Champagne paper, gold glitter, falling sparkles and confetti             |
| 💘 Valentine's        | Feb 10–14                                                             | Blush paper, wine ink, pink polka dots, rising hearts                    |
| ☘️ St. Patrick's      | Mar 14–17                                                             | Mint paper, green tartan, falling shamrocks                              |
| 🌷 Spring             | Mar 20 – Apr 30                                                       | Pastel sage paper, pink and lilac dots, falling blossoms                 |
| 🪅 Cinco de Mayo      | May 1–5                                                               | Warm paper, green/red bands, confetti, peppers and piñatas               |
| 🇺🇸 USA                | Memorial Day week (Mon–Fri), Jun 29 – Jul 5, Labor Day week (Mon–Fri) | White paper, navy ink, red stripes, stars and fireworks                  |
| ☀️ Summer             | Jun 21 – Aug 31 (USA wins during the July 4th week)                   | Sunny paper, teal waves, rising palms, watermelon and shades             |
| 🎃 Halloween          | Oct 31                                                                | Pumpkin paper, dark purple ink, diagonal stripes, rising ghosts and bats |
| 💀 Día de los Muertos | Nov 1–2                                                               | Marigold paper, magenta diamonds, marigolds, skulls and candles          |
| 🍂 Autumn             | Rest of November                                                      | Kraft paper, brown ink, flannel background, falling leaves               |
| 🦃 Thanksgiving       | Mon–Fri of Thanksgiving week                                          | Harvest paper, orange plaid, leaves, corn and pie                        |
| 🎄 Winter             | December                                                              | Icy paper, navy ink, snowy dots, falling snow                            |

The date rules live in `src/lib/season.ts`. Themes are applied via `<html data-theme="…">` (see `src/lib/themes.svelte.ts` and `src/lib/style.css`). To avoid a flash of the wrong theme, `src/hooks.server.ts` splices `seasonalTheme()` into an inline script in `src/app.html` that sets the theme before first paint, so that function must stay self-contained (a unit test checks this). Falling particles are hidden when the viewer prefers reduced motion.

## Stack

- **SvelteKit 3 / Svelte 5** with `@sveltejs/adapter-cloudflare`, deployed as the `standupper` Worker at https://standupper.stup.dev
- **Cloudflare D1** (`standupper` database, binding `DB`), schema in `migrations/`
- **Tailwind CSS v4** compiled by Vite. `src/lib/style.css` (the hand-written theme) sits in the `components` layer so utilities still override it, and `src/routes/layout.css` restores the two Tailwind v3 behaviours the UI relies on (hover on touch, pointer cursor on buttons)
- **`standupper-cleanup` Worker** (`workers/cleanup/`): daily Cron Trigger that deletes standups not opened in 90 days. It's a separate Worker because the SvelteKit adapter owns the main Worker's entry point.

Pages are client-rendered (`ssr = false`), like the original React SPA.

## Project Structure

```
├── migrations/0001_init.sql         # D1 schema
├── src/
│   ├── app.html                     # Shell + pre-paint theme script
│   ├── hooks.server.ts              # Inlines seasonalTheme() into the shell
│   ├── lib/
│   │   ├── components/              # SessionPage, StandupPage, CompletePage
│   │   ├── server/db.ts             # D1 queries (shared with the cleanup Worker)
│   │   ├── server/http.ts           # D1 binding + { error } responses
│   │   ├── jokes.ts                 # crocs.dad joke prefetch
│   │   ├── season.ts                # Automatic theme date rules
│   │   ├── themes.svelte.ts         # Colors, theme metadata, StandupAppearance
│   │   ├── style.css                # Neo-brutalist theme
│   │   └── types.ts                 # Shared types
│   └── routes/
│       ├── +page.svelte             # Home
│       ├── session|standup|complete/[id]/
│       └── api/                     # JSON API (same paths/shapes as the Val Town version)
├── workers/cleanup/                 # Cron Worker
└── scripts/                         # Val Town -> D1 data migration
```

## API

| Method | Path                               | Body                                          |
| ------ | ---------------------------------- | --------------------------------------------- |
| POST   | `/api/standups`                    | `{ name }`                                    |
| GET    | `/api/standups/:id`                |                                               |
| PUT    | `/api/standups/:id`                | `{ timer_duration_minutes?, color?, theme? }` |
| GET    | `/api/standups/:id/session`        | (also bumps `last_login`)                     |
| PUT    | `/api/standups/:id/users/inactive` | `{ mode: "all" \| "none" \| "invert" }`       |
| POST   | `/api/users`                       | `{ name, standup_id }`                        |
| PUT    | `/api/users/:id`                   | `{ name?, inactive?, starred? }`              |
| DELETE | `/api/users/:id`                   |                                               |

Errors are `{ "error": "…" }` with a 400/404 status.

## Data Model

### standups

- `id`: UUID v4 (primary key)
- `name`: TEXT
- `last_login`: TEXT (ISO timestamp of the last session load; drives the 90-day cleanup)
- `timer_duration_minutes`: INTEGER, 0 = no time limit
- `color`: accent color (`green`, `red`, `blue`, `yellow`, `purple`)
- `theme`: site theme choice (`automatic`, `standard`, or any id in `THEME_CHOICES`)

### users

- `id`: INTEGER autoincrement (primary key)
- `name`: TEXT
- `standup_id`: references `standups.id`, `ON DELETE CASCADE`
- `inactive`, `starred`: 0/1. At most one starred user per standup; the starred user delivers the joke.

On Val Town, `color` was stored in a column named `theme` and `theme` in `season_theme`; they were renamed in the move.

## Development

```sh
npm install
npm run db:migrate:local
npm run build && npx wrangler dev   # full Worker + local D1 on :8787
npm test                            # unit tests
npm run check                       # svelte-check
```

## Deploy

```sh
npm run deploy           # build, apply D1 migrations, deploy the app Worker
npm run deploy:cleanup   # deploy the cron Worker
```

## Usage

1. **Create Standup**: Enter a name and create a new standup session
2. **Join Standup**: Enter an existing session ID to join
3. **Manage Users**: Add team members
4. **Run Standup**: Start the meeting with randomized order and timer
5. **Navigate**: Use "Next" to proceed, "Previous" to go back to the last person, "Experience Bij!" to eliminate a person, or "Yeet" to move someone to the end
