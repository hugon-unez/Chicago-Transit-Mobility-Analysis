# Data inventory

## Compact source extracts

- `source/opportunity_atlas_chicago.csv`: Chicago-area Opportunity Atlas rows and the seven variables used by the notebook/site.
- `source/transit_chicago.csv`: tract, travel-time threshold, and reachable-job estimate for the seven-county study area.
- `source/tract_metrics.csv`: one-row-per-tract table used for downloads and verification.

## Browser assets

The deployable copies are under `public/data/`:

- `tracts.geojson`: simplified 2020 tract geometry plus all mapped measures (about 1.8 MB).
- `summary.json`: correlations, model estimate, ranges, and record counts.
- `tract_metrics.csv`: downloadable tract table.

## Raw sources intentionally left outside this repository

- `../tract_outcomes_early.csv` (2.5 GB)
- `../Illinois/Illinois_17_transit_census_tract_2024.csv`
- `../tl_2020_17_tract.zip`

`scripts/prepare_data.py` reads those files without modifying them. The original files remain available for the full notebook and future regenerations.
