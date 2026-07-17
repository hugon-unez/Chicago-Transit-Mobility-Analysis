#!/usr/bin/env python3
"""Create compact, static web assets from the notebook's source data.

The full Opportunity Atlas tract file is several gigabytes. This script reads
it in chunks, keeps only the Chicago-area rows and variables used by the
analysis, and writes a small source extract plus a simplified GeoJSON file for
the browser. Source files are never modified.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import statsmodels.formula.api as smf


CHICAGO_COUNTIES = {
    "17031": "Cook",
    "17043": "DuPage",
    "17089": "Kane",
    "17093": "Kendall",
    "17097": "Lake",
    "17111": "McHenry",
    "17197": "Will",
}
THRESHOLDS = list(range(5, 61, 5))
ATLAS_COLUMNS = [
    "state",
    "county",
    "tract",
    "kfr_pooled_pooled_p25",
    "par_rank_pooled_pooled_mean",
    "kid_pooled_pooled_n",
    "kid_black_pooled_n",
]


def parse_args() -> argparse.Namespace:
    root = Path(__file__).resolve().parents[1]
    source_root = root.parent
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--atlas",
        type=Path,
        default=source_root / "tract_outcomes_early.csv",
        help="Full Opportunity Atlas tract outcomes CSV.",
    )
    parser.add_argument(
        "--transit",
        type=Path,
        default=source_root / "Illinois" / "Illinois_17_transit_census_tract_2024.csv",
        help="Illinois tract-level transit accessibility CSV.",
    )
    parser.add_argument(
        "--tracts",
        type=Path,
        default=source_root / "tl_2020_17_tract.zip",
        help="2020 Illinois TIGER/Line tract archive.",
    )
    parser.add_argument("--output", type=Path, default=root)
    return parser.parse_args()


def load_chicago_atlas(path: Path) -> pd.DataFrame:
    parts: list[pd.DataFrame] = []
    county_ints = {int(code[2:]) for code in CHICAGO_COUNTIES}
    for chunk in pd.read_csv(path, usecols=ATLAS_COLUMNS, chunksize=50_000):
        keep = (chunk["state"] == 17) & chunk["county"].isin(county_ints)
        if keep.any():
            parts.append(chunk.loc[keep].copy())
    atlas = pd.concat(parts, ignore_index=True)
    atlas["geoid"] = (
        atlas["state"].astype("Int64").astype(str).str.zfill(2)
        + atlas["county"].astype("Int64").astype(str).str.zfill(3)
        + atlas["tract"].astype("Int64").astype(str).str.zfill(6)
    )
    return atlas.drop_duplicates("geoid")


def serializable(value):
    if pd.isna(value):
        return None
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        return float(value)
    return value


def main() -> None:
    args = parse_args()
    root = args.output.resolve()
    source_dir = root / "data" / "source"
    public_data = root / "public" / "data"
    source_dir.mkdir(parents=True, exist_ok=True)
    public_data.mkdir(parents=True, exist_ok=True)

    transit = pd.read_csv(args.transit, dtype={"Census ID": str})
    transit["county_geoid"] = transit["Census ID"].str[:5]
    transit = transit[transit["county_geoid"].isin(CHICAGO_COUNTIES)].copy()
    transit = transit[["Census ID", "Threshold", "Weighted_average_total_jobs"]]
    transit = transit.rename(
        columns={"Census ID": "geoid", "Weighted_average_total_jobs": "jobs"}
    )
    transit.to_csv(source_dir / "transit_chicago.csv", index=False)

    atlas = load_chicago_atlas(args.atlas)
    atlas.to_csv(source_dir / "opportunity_atlas_chicago.csv", index=False)

    wide_jobs = transit.pivot(index="geoid", columns="Threshold", values="jobs")
    wide_jobs = wide_jobs.reindex(columns=THRESHOLDS)
    wide_jobs.columns = [f"jobs_{minute}" for minute in THRESHOLDS]
    wide_jobs = wide_jobs.reset_index()

    metrics = wide_jobs.merge(atlas, on="geoid", how="left", validate="one_to_one")
    metrics["mobility"] = metrics["kfr_pooled_pooled_p25"] * 100
    metrics["parent_rank"] = metrics["par_rank_pooled_pooled_mean"] * 100
    metrics["frac_black"] = metrics["kid_black_pooled_n"] / metrics["kid_pooled_pooled_n"]
    for minute in THRESHOLDS:
        metrics[f"log_jobs_{minute}"] = np.log10(metrics[f"jobs_{minute}"] + 1)
    metrics["transit_added"] = metrics["log_jobs_60"] - metrics["log_jobs_10"]
    metrics["county_geoid"] = metrics["geoid"].str[:5]
    metrics["county"] = metrics["county_geoid"].map(CHICAGO_COUNTIES)

    tracts = gpd.read_file(args.tracts)[["GEOID", "ALAND", "geometry"]]
    tracts = tracts[tracts["GEOID"].str[:5].isin(CHICAGO_COUNTIES)].copy()
    tracts["land_sq_miles"] = tracts["ALAND"] / 2_589_988.110336
    metrics = metrics.merge(
        tracts[["GEOID", "land_sq_miles"]],
        left_on="geoid",
        right_on="GEOID",
        how="left",
        validate="one_to_one",
    )
    metrics["density"] = metrics["kid_pooled_pooled_n"] / metrics["land_sq_miles"]
    metrics["log_density"] = np.log10(metrics["density"] + 1)

    metric_columns = [
        "geoid",
        "county",
        "mobility",
        "parent_rank",
        "frac_black",
        "density",
        "transit_added",
        *[f"jobs_{minute}" for minute in THRESHOLDS],
    ]
    metrics[metric_columns].to_csv(source_dir / "tract_metrics.csv", index=False)

    regression = metrics.replace([np.inf, -np.inf], np.nan).dropna(
        subset=[
            "mobility",
            "log_jobs_10",
            "transit_added",
            "parent_rank",
            "frac_black",
            "log_density",
            "county_geoid",
        ]
    )
    model = smf.ols(
        "mobility ~ log_jobs_10 + transit_added + parent_rank + frac_black"
        " + log_density + C(county_geoid)",
        data=regression,
    ).fit(cov_type="HC3")
    added_ci = model.conf_int().loc["transit_added"]

    corr_rows = []
    for minute in THRESHOLDS:
        usable = metrics[["mobility", f"log_jobs_{minute}"]].dropna()
        corr_rows.append(
            {
                "threshold": minute,
                "pearson": usable["mobility"].corr(usable[f"log_jobs_{minute}"]),
                "spearman": usable["mobility"].corr(
                    usable[f"log_jobs_{minute}"], method="spearman"
                ),
            }
        )

    ranges = {}
    range_columns = ["mobility", "parent_rank", "frac_black", "density", "transit_added"]
    range_columns += [f"jobs_{minute}" for minute in THRESHOLDS]
    for column in range_columns:
        values = metrics[column].dropna()
        ranges[column] = {
            "min": float(values.min()),
            "max": float(values.max()),
            "p05": float(values.quantile(0.05)),
            "median": float(values.median()),
            "p95": float(values.quantile(0.95)),
        }

    summary = {
        "generatedFrom": {
            "atlas": args.atlas.name,
            "transit": args.transit.name,
            "tracts": args.tracts.name,
        },
        "counties": CHICAGO_COUNTIES,
        "thresholds": THRESHOLDS,
        "counts": {
            "transitTracts": int(metrics["geoid"].nunique()),
            "matchedAtlasTracts": int(metrics["mobility"].notna().sum()),
            "analysisTracts": int(len(regression)),
        },
        "correlations": corr_rows,
        "regression": {
            "transitAddedCoefficient": float(model.params["transit_added"]),
            "transitAddedSE": float(model.bse["transit_added"]),
            "transitAddedCILower": float(added_ci.iloc[0]),
            "transitAddedCIUpper": float(added_ci.iloc[1]),
            "rSquared": float(model.rsquared),
            "n": int(model.nobs),
        },
        "ranges": ranges,
    }
    (public_data / "summary.json").write_text(json.dumps(summary, indent=2))

    web = tracts.merge(metrics, left_on="GEOID", right_on="geoid", how="inner")
    web = web.to_crs(3435)
    web["geometry"] = web.geometry.simplify(200, preserve_topology=True)
    web = web.to_crs(4326)
    web["has_atlas"] = web["mobility"].notna()
    web_columns = [
        "geoid",
        "county",
        "has_atlas",
        "mobility",
        "parent_rank",
        "frac_black",
        "density",
        "transit_added",
        *[f"jobs_{minute}" for minute in THRESHOLDS],
        "geometry",
    ]
    web = web[web_columns]
    geojson = json.loads(web.to_json(drop_id=True))
    for feature in geojson["features"]:
        feature["properties"] = {
            key: serializable(value) for key, value in feature["properties"].items()
        }
    (public_data / "tracts.geojson").write_text(
        json.dumps(geojson, separators=(",", ":"))
    )

    print(f"Wrote {len(web):,} tract features")
    print(f"Matched mobility outcomes: {metrics['mobility'].notna().sum():,}")
    print(f"Web GeoJSON: {(public_data / 'tracts.geojson').stat().st_size / 1_000_000:.1f} MB")


if __name__ == "__main__":
    main()
