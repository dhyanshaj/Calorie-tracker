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
`MEAL_VISION_API_KEY`; follow the [photo-recognition setup guide](PHOTO-SETUP.md)
to create your key and save it securely on your Chromebook.

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

## Update an existing installation without losing your diary

Your Chromebook copy does not update automatically when code changes on GitHub.

1. In the Terminal running the app, press **Ctrl+C** to stop it.
2. Download a fresh ZIP from the repository's **main** branch using **Code → Download ZIP**.
3. Open that ZIP in the **Files** app, then open the `Calorie-tracker-main` folder **inside** it.
4. Select the contents of that inner folder with **Ctrl+A**, then **Ctrl+C**.
5. Open **Linux files → your existing Calorie-tracker-main folder**, then paste with **Ctrl+V**. Replace matching source files and merge matching subfolders if prompted. Copy the contents into the existing folder; do not delete or replace the outer app folder.
6. Keep the existing hidden **`.data`** folder (your account and meals) and **`.env`** file (your configuration). The GitHub ZIP does not contain either one.
7. In Terminal, run:

   ```bash
   cd ~/Calorie-tracker-main
   npm ci
   npm run dev
   ```

8. Refresh `localhost:3000` in Chrome. Open **My nutrition plan** to see the 30-day meal planner. Press **Start my free plan** when you are ready to begin the 30-calendar-day free period and save checklist progress.

Photo recognition is optional and has separate provider billing; see
[photo setup](PHOTO-SETUP.md). Accepting ₹499 monthly subscriptions
also needs merchant configuration and a hosted server; see
[payment setup](PAYMENTS.md). You do not need either integration to try local
description estimates, meal planning, and the diary.
