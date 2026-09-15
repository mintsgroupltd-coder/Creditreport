# Deploying to Render (step by step)

This project includes a `render.yaml` "Blueprint" that describes all three
pieces Render needs to create: a Postgres database, the backend API, and the
frontend static site. Once the code is on GitHub, Render can read that file
and set almost everything up in one go.

You don't need to share any credentials with anyone to do this — it's just
you, GitHub, and Render.

## 1. Create a GitHub repository

1. Go to [github.com/new](https://github.com/new).
2. Name it something like `credit-report-analyzer`. Keep it **private** if
   you'd rather not make the code public (Render works fine with private
   repos once you connect your GitHub account).
3. Leave "Initialize with a README" **unchecked** — you already have one.
4. Click **Create repository** and keep the page open; it shows you the
   commands from step 2 with your exact repo URL filled in.

## 2. Push this code to it

Unzip the project you downloaded, open a terminal in that folder, and run:

```bash
cd credit-report-analyzer
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

Replace `<your-username>/<your-repo>` with the URL GitHub showed you in step 1.
If this is your first time pushing from this machine, GitHub will prompt you
to sign in (it no longer accepts your account password for this — if asked
for a password, use a [personal access token](https://github.com/settings/tokens)
or let it open the browser-based sign-in flow).

## 3. Deploy the Blueprint on Render

1. Go to the [Render Dashboard](https://dashboard.render.com/) and sign in
   (or create a free account).
2. Click **New +** → **Blueprint**.
3. Connect your GitHub account if you haven't already, then select the
   repository you just pushed.
4. Render will detect `render.yaml` and show you a plan: one Postgres
   database (`credit-report-db`), one web service (`credit-report-api`),
   and one static site (`credit-report-frontend`). Click **Apply**.
5. Render will build all three. The database and the API usually finish
   first; the API's first boot also runs `prisma migrate deploy`, which
   creates all the tables.

## 4. Connect the two services to each other

The blueprint deliberately leaves two values blank (marked `sync: false`)
because they depend on the URLs Render assigns, which you only know after
the first deploy:

1. Once both services show a URL (e.g. `credit-report-api.onrender.com` and
   `credit-report-frontend.onrender.com`), open **credit-report-api** →
   **Environment** and set:
   - `CORS_ORIGIN` = `https://credit-report-frontend.onrender.com` (your
     actual frontend URL, no trailing slash)
2. Open **credit-report-frontend** → **Environment** and set:
   - `VITE_API_BASE_URL` = `https://credit-report-api.onrender.com/api`
     (your actual backend URL, **with** the `/api` suffix)
3. Saving either variable triggers a redeploy of that service automatically.

## 5. Try it

Open your frontend URL. You should see the login page. You can sign up a
new account, or load the demo data first (see below) and log in as
`demo@example.com` / `demo-password-123`.

### Optional: load the demo/seed data

The seed script creates a synthetic demo user with a fully analysed sample
report, useful for seeing the dashboard populated without uploading a real
PDF. To run it against your live Render database:

1. On the **credit-report-api** service page, open the **Shell** tab (Render
   gives every web service an in-browser shell).
2. Run:
   ```bash
   npm run seed
   ```

### Notes on the free plan

- Render's free web services spin down after periods of inactivity and take
  a few seconds to wake back up on the next request — the first request
  after a quiet period will feel slow, that's expected.
- Render's free Postgres plan is meant for development/demo use rather than
  production data; check Render's current pricing page before storing
  anything you care about long-term.
- If you'd rather use Railway instead of Render, the same `backend/` and
  `frontend/` folders work there too — the commands in `render.yaml` are a
  good reference for the build/start commands to use on any platform, git
  based or otherwise.
