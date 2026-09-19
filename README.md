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
| **Switching workouts** | *Do a different workout* under the Start button opens a picker for all four rotation days, showing when you last did each. Picking one moves the rotation to it — use it when you train out of order or repeat a day elsewhere. |
| **Rest timer** | Starts itself when you tick a set — 3:00 after heavy compounds, 2:00 after moderate work, 1:15 after isolation. **+30s** extends it, **Skip** ends it, and each exercise has a *Rest* button to start one by hand (warm-ups). It chimes at zero; Settings can silence it. |
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

> **iOS note:** web audio is muted while the screen is locked, so keep the app
> open during a set for the rest-timer chime to sound. The countdown itself is
> computed from a timestamp, so it stays accurate even if you switch apps.

## Sharing your progress

Nothing is uploaded — nobody, including any AI assistant, can see your log
unless you send it. Two ways to share:

- **Progress → Copy check-in summary** puts a short plain-text digest on your
  clipboard (lifts and estimated 1RMs, weekly sets per muscle, bodyweight trend,
  recent sessions). Small enough to paste straight into a message.
- **Settings → Export JSON** gives you the complete log as a file, for backup or
  for deeper analysis.

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
