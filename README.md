# Dream Neet Academy

Astro 4 static site for Dream Neet Academy's 20-day Re-NEET guided self-study program.

## Stack

- Astro 4.16.19 with `output: "static"`
- TypeScript strict mode
- Tailwind CSS 4.3.0 via `@tailwindcss/vite`
- `@astrojs/tailwind` installed per project requirement, but not enabled because Astro 4's integration still uses Tailwind 3's PostCSS plugin API
- `@astrojs/cloudflare` installed per project requirement, but not enabled because Astro 4 rejects this adapter when `output: "static"` is set
- `astro-icon` using local SVG icons from `src/icons`
- Astro components only

## Commands

```sh
npm run dev
npm run build
npm run preview
```

## Cloudflare Pages

Build output is configured through `wrangler.toml`:

```toml
pages_build_output_dir = "dist"
```

Static cache rules live in `public/_headers`; canonical host redirects live in `public/_redirects`.
