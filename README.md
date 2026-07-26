# China Trip Map

Static prototype of an interactive China trip map built with HTML, CSS, JavaScript, and Leaflet.

## Local Preview

From this folder:

```bash
python3 -m http.server 8123 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:8123
```

## Publish With GitHub Pages

1. Create a new public GitHub repository, for example `china-trip-map`.
2. In Terminal, open this folder:

```bash
cd "/Users/yutongwang/Documents/Trip to china/china-trip-map"
```

3. Initialize and push the repo:

```bash
git init
git add .
git commit -m "Initial China trip map"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/china-trip-map.git
git push -u origin main
```

4. In GitHub, open the repository and go to `Settings` -> `Pages`.
5. Under `Build and deployment`, choose:

```text
Source: Deploy from a branch
Branch: main
Folder: / (root)
```

6. Save and wait for GitHub Pages to finish deploying.
7. Your site URL will be:

```text
https://YOUR-USERNAME.github.io/china-trip-map/
```

## Notes

- This project is a static site, so no build step is required.
- `.nojekyll` is included so GitHub Pages serves the site directly without Jekyll processing.
- If this folder lives inside another git repo on your machine, initialize git from inside this folder so it becomes its own separate GitHub Pages project.
