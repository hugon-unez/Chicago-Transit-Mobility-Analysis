# Chicago Transit Mobility

A static project site built by Codex from `chicago_transit_mobility.ipynb`. The original notebook was written manually by Hugo Nunez. It maps Chicago-area transit job accessibility alongside tract-level upward-mobility outcomes and carries the complete notebook in an on-site reader.

The site is designed for GitHub Pages: it has no server, database, API key, or paid service. The browser loads a 1.8 MB simplified GeoJSON file and the relevant metrics only.

## What is included

- Interactive tract map with six measures, a 5–60 minute transit threshold, county focus, tract search, hover values, and two-tract comparison.
- Notebook view that renders the narrative, code, tables, and saved chart outputs directly in the site.
- Compact Chicago-only extracts derived from the 2.5 GB Opportunity Atlas source table.
- Data-preparation script, codebook, GitHub Pages workflow, and source notebook.

## Repository layout

```text
chicago-mobility-atlas/
├── .github/workflows/pages.yml       # prepared deployment workflow (not run locally)
├── data/source/                      # compact, analysis-ready CSV extracts
├── notebook/                         # editable Jupyter notebook copy
├── public/data/                      # optimized browser assets
├── public/notebook/                  # notebook copy read by the site
├── references/                       # source codebook
├── scripts/prepare_data.py           # regenerates extracts and web assets
├── scripts/render_notebook.sh        # syncs notebook edits into the site
└── src/                              # website source
```

The original files one directory above this repository were not moved, changed, or deleted.

## Work locally

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open the local address printed by Vite. Create a production build with:

```bash
npm run build
```

The GitHub-Pages-ready output is written to `dist-pages/`.

## Edit the notebook prose

Edit `notebook/chicago_transit_mobility.ipynb` in Jupyter or VS Code. Its existing outputs are what the website reader displays. After saving, sync it into the site:

```bash
npm run notebook:sync
```

Then reload the local site and open **Notebook**. You do not need to convert the notebook to HTML.

If you prefer to keep editing the original notebook in the parent directory, copy it into `notebook/` and run the same sync command. This repository intentionally does not overwrite the original.

## Regenerate the map data

The default command reads the original source files from the parent directory:

```bash
npm run data
```

Equivalent explicit usage:

```bash
../.venv/bin/python scripts/prepare_data.py \
  --atlas ../tract_outcomes_early.csv \
  --transit ../Illinois/Illinois_17_transit_census_tract_2024.csv \
  --tracts ../tl_2020_17_tract.zip
```

The script never writes to or alters those source files. It outputs compact CSVs under `data/source/`, plus `public/data/tracts.geojson` and `public/data/summary.json`. Run `npm run notebook:sync` separately when the notebook changes.

## Prepare GitHub Pages later

Nothing has been pushed or deployed. When you are ready:

1. Push this repository to GitHub.
2. In the repository settings, open **Pages** and choose **GitHub Actions** as the source.
3. Merge the finished work into `main` or run the included workflow manually.

The workflow builds the same `dist-pages/` folder and uploads it to Pages. The Vite base path is relative, so both a user site and a project subdirectory work without editing source code.

## Data notes

- Transit accessibility: UMN Accessibility Observatory, *Access Across America: Transit 2024*.
- Upward mobility: Opportunity Insights, `kfr_pooled_pooled_p25`, shown as adult income percentile for children whose parents were at the 25th percentile.
- Geography: transit/TIGER use 2020 tract definitions while Opportunity Atlas tract outcomes use 2010 definitions. Exact GEOID matching yields 1,893 tracts with usable mobility estimates.
- Interpretation: the estimates describe children who grew up in each tract. The regression is observational, not a causal estimate of transit's effect.

The full 2.5 GB national Atlas table is not duplicated here because it is unsuitable for GitHub and unnecessary for the static site. `data/source/opportunity_atlas_chicago.csv` contains the relevant Chicago rows and columns.
