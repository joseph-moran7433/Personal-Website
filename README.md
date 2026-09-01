# Joseph Moran — Personal Website

Personal portfolio site for Joseph Moran, Cadet at the United States Military Academy at West Point.

## Pages
- **Hero** — Full-screen landing with a hand-built SVG illustration (Hudson Highlands + a winding road, inline in `#hero .hero-bg`) — a deliberately dark editorial band over an otherwise light site
- **About** — Bio, headshot, and stats; leadership cards expand on click to explain each role
- **Projects** — Clickable cards with modal detail views (sorted newest → oldest); code blocks stay a dark editor panel regardless of page theme
- **Travel** — Interactive map with visit pins on a dark "cork board" panel; click a legend category to filter and list places
- **Contact** — Links + contact form

## Theme
The site is a light, professional theme (`--bg`/`--surface`/`--text`/etc. in `:root`). Two components stay intentionally dark as accent panels: the hero band (`--hero-*` variables) and the travel board. Code blocks (`.code-block`) are hardcoded to a dark editor palette independent of the page theme.

## Deploy on Netlify
1. Go to [netlify.com](https://netlify.com)
2. Click **Add new site → Import from Git**
3. Connect GitHub and select **joseph-moran7433/Personal-Website**
4. Build command: *(leave blank)*
5. Publish directory: *(leave blank or set to `/`)*
6. Click **Deploy site**

## To Update
- **Swap headshot**: Replace `assets/headshot.jpg` with a new photo (matches the frame's 3:4 aspect ratio best)
- **Add travel pins**: Edit the `pins` array in the script at the bottom of `index.html` — each entry takes a real `lat`/`lon` (the map projects them automatically, so pins always land in the right spot) plus a `type` (`home`/`work`/`glee`/`vacation`, which sets pin color and legend group) and an optional `tourGroup` to draw a connector line between stops on the same trip
- **Update LinkedIn URL**: Search for `linkedin.com/in/joseph-moran2027` and replace with your actual URL
- **Change the hero illustration**: It's the inline `<svg>` inside `.hero-bg` in `index.html` — edit paths directly, or swap in a real image by giving `.hero-bg` a `background-image` again
