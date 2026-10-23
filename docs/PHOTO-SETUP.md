# Enable meal-photo recognition

This setup is for the app owner. App users do not enter API keys into the signup
or meal form. The owner’s server performs the image-service requests.

## 1. Create an OpenAI API key

Open these pages in Chrome:

- API keys: https://platform.openai.com/api-keys
- API billing: https://platform.openai.com/settings/organization/billing/overview

Sign in, create a project API key, and enable API billing/credits as required by
your account. A ChatGPT subscription does not include OpenAI API usage. Set
spending alerts and monitor API usage. Do not paste the key into chat, GitHub,
screenshots, browser code, or the meal description.

## 2. Add the key on your Chromebook

If the app is running, press **Ctrl+C** in its Linux Terminal to stop it.
Then run these two commands one at a time:

```bash
cd ~/Calorie-tracker-main
nano .env
```

If Terminal says nano is not installed, run `sudo apt install -y nano`, then
run `nano .env` again.

Inside the editor, add or update these lines:

```dotenv
MEAL_VISION_API_KEY=PASTE_YOUR_REAL_KEY_HERE
MEAL_VISION_MODEL=gpt-4.1-mini
```

Replace `PASTE_YOUR_REAL_KEY_HERE` with your actual key. Keep other settings
already in the file. Save with **Ctrl+O**, press **Enter**, then exit with
**Ctrl+X**. Do not share the contents of this file.

Back in Terminal, run:

```bash
chmod 600 .env
npm run dev
```

Open the app in Chrome on your Chromebook, upload a real meal photo, optionally
add a description, and press **Estimate my meal**. Review the identified foods,
portions, and assumptions before saving. A configured-key indicator means a
key is present; a successful real meal request verifies the integration.

## Cloud environment versus your Chromebook

A key entered in this chat’s cloud environment settings does **not** update
your Chromebook’s `.env` file. Configure the machine where you run the app.
For a hosted website, use the host’s encrypted server environment/secret manager
instead of distributing the key to visitors. The cloud draft already declares
an optional `MEAL_VISION_API_KEY` requirement for `api.openai.com`; enter its
value securely in environment settings if you run there.

The Node startup scripts enable standard environment-proxy support for cloud
machines that supply HTTPS_PROXY/HTTP_PROXY. TLS verification remains enabled.
No proxy is required on an ordinary Chromebook internet connection.

## If the request fails

- **401 / key rejected:** check that a real key was saved on the machine running
  the app, that it belongs to the intended OpenAI project, and that it has not
  been revoked. Restart the app after changing it.
- **429 / quota:** inspect API billing, usage limits, and available credits.
- **Connection failure:** allow HTTPS access to `api.openai.com` and inspect
  proxy/network settings. Do not disable TLS verification.
- **Unsupported photo:** use a JPEG, PNG, or WebP under 8 MB and 24 megapixels.

Send error messages for help, but never the API key or the `.env` file.

Photos are decoded in memory, resized, and stripped of metadata. They are not
saved in the app’s database. OpenAI processes the image and description under
its [API data policy](https://platform.openai.com/docs/guides/your-data).
`store: false` is requested; it does not guarantee zero provider retention.

## Start the photo allowance

Open **Plus membership** to explicitly start the 30-calendar-day trial when you
are ready. It includes 100 successful photo analyses. Paid monthly and annual
Plus each reset 100 analyses monthly. Basic description/manual tracking stays
free. In production, first verify your email in **Account & privacy**. The owner
must configure the email service using [LAUNCH.md](LAUNCH.md).

A server-side key is not evidence of real-food accuracy. After a successful
real meal request, follow [PHOTO-VALIDATION.md](PHOTO-VALIDATION.md) for weighed-meal
benchmarks. The app's uncertainty labels are qualitative; photos cannot reveal
exact cooking oil, recipe ingredients, edible meat yields or weights.
