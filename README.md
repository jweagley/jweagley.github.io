# Professional Portfolio

A simple, fast, dependency-free portfolio website built with plain HTML, CSS, and a
little JavaScript. No build tools required — it runs directly on GitHub Pages.

## Pages

| File | Page |
|------|------|
| `index.html` | Home / About |
| `research.html` | Research & Presentations |
| `instructional-design.html` | Instructional Design |
| `code.html` | Code |
| `course-schedule/` | Course Schedule Builder (Purdue calendar → Word schedule) |

Shared styling lives in `assets/css/styles.css`; shared behavior in `assets/js/main.js`.

## Editing content

Everything is hand-editable HTML. Look for text marked with a dashed
`placeholder` box — those are the spots to replace with your own content.

1. **Your name & links** — search each `.html` file for `Your Name` and the footer
   links (LinkedIn, ORCID, Google Scholar, GitHub) and fill them in. Your email is
   already set to `jweagley@purdue.edu`.
2. **Photo** — drop a square image at `assets/img/headshot.jpg`.
3. **CV** — drop your CV at `assets/cv.pdf` (linked from the home page).
4. **Add items** — copy an existing `<li class="item">` (research/talks) or
   `<article class="card">` (ID/code) block and edit it.

## Changing the look

Open `assets/css/styles.css`. The colors, fonts, and spacing are defined once as
CSS variables at the top (`:root { ... }`). Change `--accent` to re-theme the whole
site. Light and dark modes are both supported automatically.

## Preview locally

Just open `index.html` in your browser. (Or run a local server:
`python3 -m http.server` then visit http://localhost:8000.)

## Publish on GitHub Pages

1. Create a new repository on GitHub.
   - For a site at `https://<username>.github.io/`, name the repo
     `<username>.github.io`.
   - For a project site at `https://<username>.github.io/<repo>/`, name it anything.
2. Push these files to the repository's default branch:

   ```bash
   git init
   git add .
   git commit -m "Initial portfolio site"
   git branch -M main
   git remote add origin https://github.com/<username>/<repo>.git
   git push -u origin main
   ```

3. On GitHub: **Settings → Pages → Build and deployment**.
   Set **Source** to *Deploy from a branch*, choose `main` / `root`, and save.
4. Wait a minute, then visit the URL GitHub shows on that page.

The `.nojekyll` file tells GitHub Pages to serve the files as-is (no Jekyll processing).
