# Going live — complete step-by-step guide

Assumes zero prior experience with any of these tools. Total time: ~30–45
minutes. You'll end up with a live URL like `your-shop.vercel.app` (or your
own domain) that you and your staff can open on any phone.

Three free accounts needed: **GitHub** (holds your code), **Supabase**
(database + login), **Vercel** (hosts the live site). All have free tiers
that are enough for a single shop.

---

## Part 1 — Put the code on GitHub

Vercel deploys by connecting to a GitHub repository, so the code needs to
live there first.

1. Go to [github.com](https://github.com) → **Sign up** (skip if you already
   have an account).
2. Once logged in, click the **+** icon top-right → **New repository**.
   - Repository name: `shop-billing` (or anything you like)
   - Keep it **Private** (your code, your choice, but private is safer for
     a business app)
   - Don't check "Add a README" — leave everything else default
   - Click **Create repository**
3. GitHub now shows you a page with commands. You have two options:

   **Option A — no command line, drag and drop (easiest):**
   - Unzip the `shop-billing-app.zip` file you downloaded on your computer.
   - On the new repo's GitHub page, click **uploading an existing file**.
   - Drag the *contents* of the unzipped `shop-billing` folder in (not the
     folder itself — select everything inside it).
   - Scroll down, click **Commit changes**.
   - ⚠️ GitHub's web upload can be slow/flaky with hundreds of files. If it
     stalls, use Option B.

   **Option B — command line (more reliable):**
   ```bash
   cd path/to/unzipped/shop-billing
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/shop-billing.git
   git push -u origin main
   ```
   Replace `YOUR-USERNAME` with your actual GitHub username (shown on the
   repo page). It'll prompt you to log in the first time.

---

## Part 2 — Set up Supabase (database + login)

1. Go to [supabase.com](https://supabase.com) → **Start your project** →
   sign up (GitHub login works and is fastest).
2. Click **New project**.
   - Organization: use the default one it creates for you
   - Name: `shop-billing` (anything)
   - Database password: click **Generate a password**, then **copy it
     somewhere safe** (a notes app) — you likely won't need it again, but
     keep it just in case
   - Region: pick the one closest to you — for India, **Mumbai (South
     Asia)** if available; otherwise the nearest option
   - Click **Create new project** and wait ~2 minutes while it provisions

3. **Run the database schema:**
   - In the left sidebar, click the **SQL Editor** icon (looks like `>_`)
   - Click **New query**
   - Open `supabase/schema.sql` from the unzipped project folder on your
     computer, select all, copy it
   - Paste it into the Supabase SQL editor
   - Click **Run** (bottom right, or Ctrl/Cmd+Enter)
   - You should see "Success. No rows returned" — this created all the
     tables (shops, products, bills, vendors, purchases, etc.)

4. **Get your API keys:**
   - Left sidebar → **Project Settings** (gear icon) → **API**
   - You need three values, copy each somewhere safe (a notes app, not
     shared anywhere public):
     - **Project URL** — looks like `https://abcdefgh.supabase.co`
     - **anon / public** key — long string under "Project API keys"
     - **service_role** key — also under "Project API keys", click "reveal"
       — ⚠️ this one is powerful, never share it or put it in any
       public-facing code

5. **Note your region** (needed in Part 3): Project Settings → General →
   check the **Region** field, e.g. "South Asia (Mumbai)".

---

## Part 3 — Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) → **Sign up** → choose
   **Continue with GitHub** (this lets Vercel see your repos).
2. Once logged in, click **Add New...** → **Project**.
3. Find your `shop-billing` repo in the list → click **Import**.
4. On the configuration screen:
   - **Framework Preset**: should auto-detect "Next.js" — leave it
   - **Root Directory**: leave as `./` unless you nested the folder
   - Expand **Environment Variables** and add all three, one at a time
     (name on the left, value on the right — paste the values you saved
     from Supabase in Part 2 step 4):

     | Name | Value |
     |---|---|
     | `NEXT_PUBLIC_SUPABASE_URL` | your Project URL |
     | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your anon/public key |
     | `SUPABASE_SERVICE_ROLE_KEY` | your service_role key |

   - Click **Deploy**.
5. Wait ~2 minutes. When it finishes, click **Visit** — you should land on
   the app's login page. 🎉 It's live.

6. **Match the region to Supabase** (makes the app noticeably faster —
   optional but recommended):
   - Open the `vercel.json` file in your GitHub repo (click it, then the
     pencil/edit icon), or edit it locally and push again
   - Change `"bom1"` to the region code matching what you noted in Part 2
     step 5. Common codes: Mumbai → `bom1`, Singapore → `sin1`, US East →
     `iad1`, Europe → `fra1`. [Full list here](https://vercel.com/docs/edge-network/regions).
   - Commit the change — Vercel automatically redeploys on every push to
     `main`.

---

## Part 4 — First-time setup inside the app

Open your live URL (e.g. `shop-billing-xyz.vercel.app`):

1. Click **Set one up** → fill in your shop name, your name, an email, and
   a password → **Create shop**. You're now logged in as the owner.
2. Go to **More → GST & shop profile**:
   - Fill in your **State** (required — billing is blocked until this is
     set, since it decides CGST+SGST vs IGST on every invoice)
   - Add your **GSTIN** if you have one, and pick **Regular** or
     **Composition** scheme
   - Save
3. Go to **More → Products** → add your first few products (name, price,
   GST%, HSN code, unit).
4. Go to **More → Customers** → optionally add regular customers (GSTIN if
   they're a business, so they show up correctly as B2B in GSTR-1).
5. Go to **More → Vendors** → add your suppliers if you'll be logging
   purchases.
6. Go to **More → Staff** → create logins for other staff members (they'll
   use the email/password you set for them to log in).
7. Try **Sell** → build a test bill → **Complete ticket** → generate the
   invoice → confirm it prints correctly.
8. Try **Buy** → log a test purchase from a vendor.
9. Check **Reports** → GSTR-1 / GSTR-3B for the current month — the test
   bill/purchase should show up.

---

## Everyday use after this

- The live URL works on any phone's browser — for a faster feel, staff can
  open it in Chrome/Safari and use "Add to Home Screen" so it behaves like
  an app icon.
- Every `git push` to the `main` branch on GitHub automatically redeploys
  the live site within ~1–2 minutes — this matters if you ever come back to
  customize something.
- Supabase's free tier pauses a project after a week of no activity — if
  the app suddenly stops loading data after a quiet week, go to your
  Supabase dashboard and click **Restore project** (takes under a minute).

---

## Troubleshooting

**"Add your shop's state before billing" won't go away**
→ More → GST & shop profile → make sure State is selected and you clicked
Save.

**Login page loads but signing up fails / spins forever**
→ Double check all three environment variables in Vercel (Project Settings
→ Environment Variables) exactly match what Supabase showed you — a common
mistake is swapping the anon key and service_role key. After fixing, go to
Vercel's **Deployments** tab → the three-dot menu on the latest deployment →
**Redeploy**.

**"relation does not exist" or similar database errors**
→ The schema wasn't run, or was only partially run. Go back to Supabase SQL
Editor, re-paste all of `supabase/schema.sql`, and run it again — it's safe
to run more than once.

**Changes you make in the code don't show up on the live site**
→ Make sure you `git push`ed to the `main` branch specifically, and check
Vercel's **Deployments** tab to confirm a new deployment actually ran (and
didn't fail — click it to see the build log if it did).

**Need to see error details from a live crash**
→ Vercel dashboard → your project → **Logs** tab shows real-time server
errors as they happen.

---

## Costs at this scale

- **GitHub**: free (private repos included)
- **Supabase**: free tier covers a single small shop comfortably (500MB
  database, generous request limits); upgrade only if you outgrow it
- **Vercel**: free "Hobby" tier is enough for one shop's traffic; their
  Terms restrict Hobby to non-commercial/personal use, so if this becomes a
  real commercial operation, budget for their Pro plan (~$20/month) to stay
  within terms
