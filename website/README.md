# Miso documentation site

The public docs for [Miso](https://github.com/pinkpixel-dev/miso), built with
[Astro](https://astro.build) and [Starlight](https://starlight.astro.build).

This is a separate npm project from Miso itself. It has its own `package.json`
and its own lockfile, and nothing in the app imports from it.

## Running it

```bash
cd website
npm install
npm run dev
```

The site is at <http://localhost:4321>.

| Command | Does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Builds into `dist/` |
| `npm run preview` | Serves the built output |
| `npm run check` | Type checks the Astro components |
| `npm run deploy` | Builds, then deploys to Cloudflare Pages |

## Deploying

The site is static, so there is no adapter and no Worker. Wrangler uploads
`dist/` and serves it.

```bash
npm run deploy
```

`wrangler.toml` holds the Pages project name and the output directory. Change
`name` there if the project is called something else in your Cloudflare account.

You need to be logged in first:

```bash
npx wrangler login
```

## Where the content lives

```text
src/
  content/docs/       Every page, one Markdown file per URL
    start/            Install and first run
    guides/           How to use each part of the studio
    models/           One page per model family
    reference/        Configuration, API, architecture
  components/         Starlight component overrides
  styles/theme.css    The whole theme
  assets/             Logo and screenshots
```

Adding a page means creating the Markdown file and adding it to the `sidebar`
array in `astro.config.mjs`. Starlight fails the build if the sidebar names a
slug that does not exist, so a typo does not ship.

## The theme

`src/styles/theme.css` is the only stylesheet. It maps Miso's own design tokens
from `src/client/styles.css` onto Starlight's CSS custom properties, so the docs
and the studio share a palette: warm charcoal surfaces, one amber accent, Space
Grotesk for headings and Public Sans for body text.

The app is dark only. The docs have a light theme as well, built from the same
hues, because people read documentation in daylight. Dark is the default
regardless of the operating system's setting, which is what the `ThemeProvider`
and `ThemeSelect` overrides are for.

Five components are overridden, each for a specific reason:

| Component | Why |
|---|---|
| `ThemeProvider` | Dark by default instead of following the OS |
| `ThemeSelect` | Same, and it has to be changed in both places |
| `SiteTitle` | The wordmark and the Docs tag |
| `Hero` | An asymmetric landing hero instead of the centred splash |
| `Footer` | Adds the Pink Pixel colophon under the pagination |

## Writing

Documentation voice follows the project's `AGENTS.md`: clear, explanatory, no
marketing language, and no em dashes.

Two things worth knowing before you edit a page.

Do not document what Miso does not do. audio.cpp supports models that Miso has
not vendored, and the docs say so explicitly on
`src/content/docs/models/choosing.md` rather than listing them as features.

Keep the README and the site in agreement. The root `README.md` stays a full
document in its own right. The site goes deeper rather than replacing it, so
when install steps change, both need the edit.
