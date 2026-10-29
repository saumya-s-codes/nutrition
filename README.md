# Crisper

Plan your week from your fridge, shop only for what you need, and log what you cook and eat.
A static web app: no server, no build step. It installs to the home screen and works offline.

## Deploy on GitHub Pages

1. On github.com, create a new repository (public is fine). Name it anything, for example `crisper`.
2. Upload the files from this zip to the **top level** of the repo (Add file → Upload files, drag in the files, then Commit).
   Upload the files themselves, not a folder that contains them. `index.html` has to sit at the top.
3. Go to **Settings → Pages**. Under "Build and deployment", set Source to **Deploy from a branch**, Branch to **main**, Folder to **/ (root)**, then Save.
4. Wait a minute or two. Your app will be at `https://YOUR-USERNAME.github.io/crisper/`.

Everything uses relative paths, so it works under the `/crisper/` address as is.

## Install it on your phone

- **iPhone:** open the link in Safari → Share → Add to Home Screen.
- **Android (Chrome):** menu → Install app.

## Your data

Data is saved on the phone. If the app is deleted, it goes too.
Use **Settings → Back up my data** to save a file, and **Restore from a backup** to load it again.
The app reminds you to back up once a week.

## Shipping an update

1. Edit `index.html`.
2. Change the version in **two places**: `APP_VERSION` near the top of the script in `index.html`, and `VERSION` at the top of `sw.js`. Update `APP_BUILD` to today's date.
3. Upload the changed files to the repo (Add file → Upload files, same names, then Commit).

People who already have the app see "A new version is ready" with an **Update** button.
Settings → About shows the version and has a **Check for updates** button. If an old copy gets stuck, **Settings → Refresh app** clears it. Data stays.
