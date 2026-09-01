# Joseph Moran — Personal Website

Personal portfolio site for Joseph Moran, Cadet at the United States Military Academy at West Point.

## Pages
- **Hero** — Full-screen landing with AI-generated background
- **About** — Bio and stats
- **Projects** — Clickable cards with modal detail views (sorted newest → oldest)
- **Travel** — Interactive dark-themed map with visit pins
- **Contact** — Links + contact form

## Deploy on Netlify
1. Go to [netlify.com](https://netlify.com)
2. Click **Add new site → Import from Git**
3. Connect GitHub and select **joseph-moran7433/Personal-Website**
4. Build command: *(leave blank)*
5. Publish directory: *(leave blank or set to `/`)*
6. Click **Deploy site**

## To Update
- **Add headshot**: Replace the placeholder in `#about` with `<img src="assets/headshot.jpg" alt="Joseph Moran">`
- **Add travel pins**: Edit the `pins` array in the script at the bottom of `index.html` — each entry takes a real `lat`/`lon` (the map projects them automatically, so pins always land in the right spot) plus a `type` (`home`/`work`/`glee`/`vacation`, which sets pin color and legend group) and an optional `tourGroup` to draw a connector line between stops on the same trip
- **Update LinkedIn URL**: Search for `linkedin.com/in/joseph-moran` and replace with your actual URL
- **Add hero image**: Upload `hero_bg.png` to the `assets/` folder
