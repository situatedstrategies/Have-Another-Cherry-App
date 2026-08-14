# Have Another Cherry — Marketing Site

A static, multi-page marketing site for [haveanothercherry.com](https://haveanothercherry.com),
built to deploy on **Cloudflare Pages**. It links visitors to the live web app.

> This site is completely separate from the app in the repo root (which deploys to
> Firebase App Hosting). Nothing here touches the app build.

## Pages

| File            | URL           | Purpose |
| --------------- | ------------- | ------- |
| `index.html`    | `/`           | Hero / landing page |
| `features.html` | `/features`   | Free vs Premium highlights + pricing (`#pricing`) |
| `about.html`    | `/about`      | About Olivia (founder) and Matt (developer) |
| `privacy.html`  | `/privacy`    | Privacy Policy (full legal language) |
| `terms.html`    | `/terms`      | Terms of Service |
| `404.html`      | (fallback)    | Not-found page |

**Legal:** `privacy.html` and `terms.html` are plain-language templates describing how the app
works today. They are **not legal advice** — fill in the `[bracketed]` placeholders (business
mailing address, governing-law state) and have counsel review them before launch. The privacy/legal
contact is `olivia@situatedstrategies.org`; the product is owned by **Situated Strategies LLC**.

Shared files: `styles.css` (design system), `main.js` (mobile nav), `assets/` (logo + screenshots),
plus `_headers`, `robots.txt`, `sitemap.xml`.

No build step — it's plain HTML/CSS/JS. Open any page directly in a browser to preview.

## Deploy to Cloudflare Pages

1. Push this repo to GitHub (already the case).
2. In the Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
3. Select this repository and the branch you want to deploy.
4. Build settings:
   - **Framework preset:** `None`
   - **Build command:** *(leave blank)*
   - **Build output directory:** `marketing`
5. Deploy. Cloudflare serves `features.html` at `/features` automatically (clean URLs).
6. Add your custom domain `haveanothercherry.com` under the project's **Custom domains** tab.

## Replace the placeholders

Everything a launch needs to swap is clearly marked. Search the files for these:

- **`Replaceable mockup`** — the "screenshots" are HTML/CSS mockups of the app. To use a real
  screenshot, drop a PNG into `assets/screenshots/` and replace the mockup block. For example, in
  `index.html` replace the whole `<div class="browser">…</div>` hero mockup with:

  ```html
  <img class="browser" src="assets/screenshots/dashboard.png" alt="Have Another Cherry dashboard" />
  ```

  Suggested files: `dashboard.png`, `receipt-scan.png`, `stats.png`, `settle.png`.

- **`PRICE PLACEHOLDER`** — in `features.html`, the Free / Premium prices. Currently
  `$0`, `$4.99/mo`, and `$39/yr` (suggested placeholders). Change the numbers in those spans.

- **`EDIT ME`** — bios and links on `about.html`, and the "last updated" date / legal note on
  `privacy.html`.

- **App login link** — every "Log in" / "Open the app" button points to the live app URL:
  `https://have-another-cherry--gen-lang-client-0987674990.us-east4.hosted.app/`.
  Once `app.haveanothercherry.com` DNS is live, find-and-replace that URL across the `marketing/`
  folder. (Look for the `APP LOGIN LINK` comment in `index.html`.)

## Design system

Matches the app: cherry red `#C41200`, off-white `#F4F4F5`, Inter (body), Lora (display),
JetBrains Mono (numbers). Tokens live at the top of `styles.css`.
