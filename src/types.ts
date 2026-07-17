export type MetricKey =
  | "mobility"
  | "jobs"
  | "transit_added"
  | "parent_rank"
  | "frac_black"
  | "density";

export type ViewKey = "map" | "notebook" | "about";

export interface TractProperties {
  geoid: string;
  county: string;
  has_atlas: boolean;
  mobility: number | null;
  parent_rank: number | null;
  frac_black: number | null;
  density: number | null;
  transit_added: number | null;
  [key: `jobs_${number}`]: number | null;
}

export interface AtlasSummary {
  thresholds: number[];
  counts: {
    transitTracts: number;
    matchedAtlasTracts: number;
    analysisTracts: number;
  };
  correlations: Array<{
    threshold: number;
    pearson: number;
    spearman: number;
  }>;
  regression: {
    transitAddedCoefficient: number;
    transitAddedSE: number;
    transitAddedCILower: number;
    transitAddedCIUpper: number;
    rSquared: number;
    n: number;
  };
  ranges: Record<
    string,
    { min: number; max: number; p05: number; median: number; p95: number }
  >;
}
