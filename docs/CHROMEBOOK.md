# Open Platewise on a Chromebook

Node.js 24 and npm must be installed in your Chromebook's Linux environment.
If `node --version` starts with `v24`, that part is complete.

## 1. Download the app

Open https://github.com/dhyanshaj/Calorie-tracker in Chrome.
Make sure the selected branch is **main**. Click the green **Code** button,
then **Download ZIP**. The file is called `Calorie-tracker-main.zip`.

## 2. Move the app into Linux files

Open your Chromebook's **Files** app and find the ZIP under **Downloads**.
Right-click it and choose **Extract all** if available. Alternatively,
double-click the ZIP to open it, then copy the `Calorie-tracker-main` folder
inside it into **Linux files** in the Files app's left sidebar.

The result should be **Linux files → Calorie-tracker-main → package.json**.
If extraction creates an extra enclosing folder, move the inner folder that
contains `package.json` directly into **Linux files**.

## 3. Start the app

Open **Terminal**, then select **penguin** under Linux if needed.
At the prompt ending in `@penguin:~$`, run these commands one at a time:

```bash
cd ~/Calorie-tracker-main
npm ci
npm run dev
```

Wait for `Platewise listening on port 3000`. Leave this terminal open.

## 4. Open it in Chrome

Type `http://localhost:3000` into Chrome's address bar on this Chromebook.
Create your app account and complete the profile. This address opens the app
running on your Chromebook; it is not a page inside GitHub.

Description-based estimates, manual foods, nutrition plans, and your saved
diary work without an API key. Photo recognition needs a server-side
`MEAL_VISION_API_KEY`; see the main README for optional integration setup.

## Next time

Your meals remain saved in the project's `.data` folder. Do not delete that
folder or replace it with another copy when updating the app.

To stop the app, press **Ctrl+C** in Terminal. To start it again:

```bash
cd ~/Calorie-tracker-main
npm run dev
```

If you see `No such file or directory`, check the folder name and location in
**Linux files**. If you see `nvm` or `npm` not found, close and reopen Terminal,
then check `node --version` again.
