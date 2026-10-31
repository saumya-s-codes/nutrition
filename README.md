# Meal Loop

Plan the week, cook, eat, log. A static PWA: no build step, no backend, all data stays on your device.

## Deploy to GitHub Pages
1. Create a new GitHub repo and upload everything in this folder (keep the folder structure, including `.nojekyll`).
2. In the repo go to **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, pick `main` and `/ (root)`, then Save.
3. After a minute your app is live at `https://YOUR-USERNAME.github.io/REPO-NAME/`.
4. On your iPhone, open that link in Safari, tap Share, then **Add to Home Screen**. On Android, use Chrome's **Install app**.

## Updating
Edit files, commit, and bump `VERSION` in `sw.js` (for example `meal-loop-v13`) and `APP_VERSION` at the top of `app.js` (for example `1.13`) so phones pick up the new files. The version shows at the bottom of Settings.

## Run locally
`python3 -m http.server 8000` in this folder, then open http://localhost:8000.

## Notes
- Data lives in the browser's local storage. Use **… → Export backup** in the app now and then.
- Edit the starter library in `data.js` (modules, pack sizes like "1 bottle = 24 tbsp", shelf lives).
- Flag thresholds are in the app under **… → Settings**.

## Units
Amounts are stored in one base unit per type (teaspoons for volume, ounces for weight, or the count unit itself) and shown in friendly units. So 1 tbsp and 1 tsp of honey both come out of the same bottle. An ingredient can't mix types (for example honey in tbsp in one recipe and oz in another); the editor will tell you to pick a matching unit.
