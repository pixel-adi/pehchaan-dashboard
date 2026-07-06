# Pehchaan — Updates & Revenue Dashboard

Static React (Vite) dashboard. Upload the Pehchaan Excel and it renders
daily/cumulative trends, KPIs, revenue, and manual entry for email + downloads.

## Run locally
    npm install
    npm run dev
Open the URL it prints (usually http://localhost:5173).

## Deploy to GitHub Pages (automatic)
1. Create a new GitHub repo, e.g. `pehchaan-dashboard`.
2. Push this folder to the `main` branch.
3. In the repo: Settings → Pages → Build and deployment →
   Source = "GitHub Actions".
4. Every push to `main` builds and publishes automatically.
   Live URL: https://<your-username>.github.io/<repo-name>/

That's it — the included workflow (.github/workflows/deploy.yml) handles the build.

## Access password
Set in src/PehchaanDashboard.jsx, line 1: `const ACCESS_CODE = "Pehchaan@2026"`.
Change the string to set your own, or set it to `null` to remove the gate.
Note: this is a Phase-1 client-side gate — the password is visible to anyone
who opens the code. Real protection comes with the Phase-2 Apps Script backend.

## Notes
- Manual entries (email / downloads) live in-session and reset on reload.
  Persistence arrives in Phase 2.
- `base: "./"` in vite.config.js keeps asset paths relative, so it works on
  any repo name without extra config.
