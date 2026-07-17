# Chicago Transit Mobility

A static project site built by Codex from `chicago_transit_mobility.ipynb`. The original notebook was written manually by Hugo Nunez. It maps Chicago-area transit job accessibility alongside tract-level upward-mobility outcomes and carries the complete notebook in an on-site reader.

The site is designed for GitHub Pages: it has no server, database, API key, or paid service. The browser loads a 1.8 MB simplified GeoJSON file and the relevant metrics only.

## What is included

- Interactive tract map with six measures, a 5–60 minute transit threshold, county focus, tract search, hover values, and two-tract comparison.
- Analysis view that renders the narrative, code, tables, and saved chart outputs directly in the site.
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

## Data notes

- Transit accessibility: UMN Accessibility Observatory, *Access Across America: Transit 2024*.
- Upward mobility: Opportunity Insights, `kfr_pooled_pooled_p25`, shown as adult income percentile for children whose parents were at the 25th percentile.
- Geography: transit/TIGER use 2020 tract definitions while Opportunity Atlas tract outcomes use 2010 definitions. Exact GEOID matching yields 1,893 tracts with usable mobility estimates.
- Interpretation: the estimates describe children who grew up in each tract. The regression is observational, not a causal estimate of transit's effect.

The full 2.5 GB national Atlas table is not duplicated here because it is unsuitable for GitHub and unnecessary for the static site. `data/source/opportunity_atlas_chicago.csv` contains the relevant Chicago rows and columns.
