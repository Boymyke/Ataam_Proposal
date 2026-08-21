# Ferrn Private Work Archive

A premium password-protected archive for Ferrn websites and project proposals.

## What this build does

- Premium black + `#FF4100` Ferrn interface using Poppins.
- Password gate with **Access denied** feedback and shake animation on a wrong password.
- Private archive page with filters for websites / proposals, search, featured cards and responsive mobile layout.
- Separate `/admin.html` page to add, edit and delete work, and to change the archive password.
- Ferrn logo and generated favicon included.
- Project links and the password hash are stored together as one private CSV record in **Netlify Blobs** — not in your GitHub repository.
- Password checking happens server-side. The raw password is never stored in the CSV; a secure `scrypt` hash is stored instead.

## Important security note

A normal HTML/JavaScript site cannot securely hide a CSV or password if the browser can download that file. If `vault.csv` lives in the public GitHub repo or publish folder, anyone can read it.

This project therefore uses a Netlify Function + Netlify Blobs. The frontend calls `/api/vault`; the function reads/writes the private CSV in backend storage and creates an HttpOnly session cookie after a correct password.

Never commit real environment variable values, passwords, API tokens, or session secrets to this repository.

## Deploy on Netlify

1. Push this folder to a GitHub repository.
2. Import the repository into Netlify.
3. In **Netlify → Site configuration → Environment variables**, add:
   - `INITIAL_VAULT_PASSWORD` = a strong private password that is not committed to GitHub.
   - `SESSION_SECRET` = a long random secret (at least 32 characters).
4. Deploy.
5. Open the site and sign in with the private password configured in `INITIAL_VAULT_PASSWORD`.
6. Go to **Manage** to add all website/proposal links and optionally cover-image URLs.
7. Use the **Access password** panel on `admin.html` whenever you want to change the password.

After the first request, the backend creates one CSV record named `vault.csv` in the `ferrn-private-archive` Netlify Blob store. It contains both the password hash and your work links. It is not committed to GitHub.

## Local development

Install Netlify CLI if needed:

```bash
npm install
npm install -g netlify-cli
```

Create a local `.env` file (already ignored by Git):

```env
INITIAL_VAULT_PASSWORD="replace-with-a-private-password"
SESSION_SECRET="replace-with-a-long-random-secret"
```

Then run:

```bash
netlify dev
```

Do **not** open `index.html` directly with `file://`, because the secure backend API needs Netlify Functions.

## Files

- `index.html` — password access screen
- `vault.html` — private portfolio/proposal archive
- `admin.html` — archive and password manager
- `styles.css` — full responsive design system
- `js/` — frontend behaviour
- `netlify/functions/vault.mjs` — secure auth + CSV backend
- `netlify.toml` — routing and security headers
- `assets/` — Ferrn logo + favicon
