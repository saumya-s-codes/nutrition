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
Amounts are stored in one base unit per type (teaspoons for volume, ounces for weight) and shown in friendly units. Anything you count (apples, cans, cloves, slices, bags) is just "each". An ingredient can't mix types, so honey in tbsp in one recipe and oz in another is blocked with a message.

## How warnings work
Only physical things (ingredient stock and cooked servings) have dates. Sides read their status from them, and meal slots never change it.
- **Yellow, use soon:** you would have to eat about one serving a day, or more, to get through it before its eat-by date. The eat-by day itself is still fine. Cooked leftovers say "eat by", raw food you still have to cook says "cook by".
- **Red, something is wrong:** something is past its eat-by date, or something the side needs is in your shopping cart (a missing ingredient). Tap the chip for a "why" sheet with one-tap fixes: throw out what expired, mark an ingredient as bought, or remove the side from the week.
- Expired food keeps counting in the fridge and the cart until you throw it out, which is logged in the Diary with its reason.
- Eating always uses the batch that expires first.

## Shopping: whole units
Everything in the cart is bought in whole **units**: one jar, can, bag or tub. Each cart card shows what you'll buy with its default unit size and price (for example "Buy 1 unit of 1½ cups, $6.50"). Tap a card to change what one unit holds (for example 24 tbsp, or 2 each for a two-serving tub) or its price; both save as you type. The cart rounds up, so needing half a can still means one can, and the rest stays in your fridge. Sizes and prices save as you type and are remembered per ingredient. Starting sizes for common items live in `PACKS` in `data.js`.

## The virtual fridge
The Fridge page shows one tile per food, soonest-to-expire first. A tile has a chip for each state it's in, for example "2 cooked · 1d" and "3 raw · 19d" for carrots. Tap a tile for its sheet: when it has both cooked servings and raw stock, a Cooked / Raw switch at the top flips between them, and each side has its own bought-or-cooked date, expiry date and "keeps for" days. Change any one of the three and the others follow, so you can type the date printed on the package. Typing "keeps for" on a raw item also becomes the default for that ingredient next time. Each item has its own storage note and icon.
