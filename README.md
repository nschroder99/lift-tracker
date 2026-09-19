# Ironlog

A workout logbook for an Upper/Lower **2-on / 1-off** hypertrophy block.
Static HTML, no build step, no server, no account. Your log lives in
`localStorage` on your phone.

![Upper A · Lower A · rest · Upper B · Lower B · rest](icons/icon-192.png)

## Put it on your phone

1. **Create the repo.** On GitHub, make a new repository named `lift-tracker`
   (public — GitHub Pages needs a paid plan for private repos).
2. **Push this folder:**

   ```bash
   git remote add origin https://github.com/YOUR-USERNAME/lift-tracker.git
   git branch -M main
   git push -u origin main
   ```

3. **Turn on Pages.** Repo → **Settings** → **Pages** → under *Build and
   deployment*, set **Source: Deploy from a branch**, **Branch: `main`**,
   folder **`/ (root)`** → Save. Give it a minute.
4. **Open it on your iPhone** at
   `https://YOUR-USERNAME.github.io/lift-tracker/`
5. **Add to Home Screen.** Share button → *Add to Home Screen*. It then opens
   full-screen with no Safari chrome and works without signal — a service
   worker caches the whole app.

## Using it

| | |
|---|---|
| **Today** | The next workout in the rotation, with a Start button. Tap an exercise to open it, fill in weight and reps, tap ✓. The rest timer starts itself. |
| **Last time** | The column left of your inputs is what you did on that same set number last session. That number is the target. |
| **RIR** | Reps in reserve — how many more you could have done. `2` means two left. Only useful if you're honest. |
| **Per side** | Plate math for barbell lifts, so you're not doing arithmetic between sets. |
| **Progress** | Weekly sets per muscle against the 10–20 set band, bodyweight trend, and estimated 1RM for the five main lifts. |

The rotation pointer **advances when you finish a session**, never on the
calendar — miss a day and nothing desyncs. Settings has a manual override if
you train out of order.

## Previewing locally

```bash
python3 -m http.server 4173
```

Then open <http://localhost:4173>. (Opening `index.html` as a `file://` URL
mostly works, but the service worker won't register.)

## Backup

Everything is stored in your browser only. **Settings → Export JSON** before you
clear browsing data or change phones; **Import** restores it. Nothing is ever
sent anywhere.

## Changing the program

Everything about the workouts lives in [`program.js`](program.js) — sets, rep
ranges, target RIR, coaching cues, substitutions. Edit that file and push; the
app picks it up. If you change any file, bump `CACHE` in [`sw.js`](sw.js) so
phones that already installed it pull the new version.

## Files

```
index.html     shell
styles.css     visual system (dark + light)
program.js     the workout program — edit this to change training
app.js         logging, progression, charts, storage
sw.js          offline cache
manifest.webmanifest / icons/   home-screen install
```
