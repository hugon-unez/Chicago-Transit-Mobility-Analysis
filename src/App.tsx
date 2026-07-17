import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type Map as MapLibreMap, type MapGeoJSONFeature } from "maplibre-gl";
import NotebookView from "./NotebookView";
import type { AtlasSummary, MetricKey, TractProperties, ViewKey } from "./types";

const METRICS: Record<
  MetricKey,
  {
    label: string;
    shortLabel: string;
    description: string;
    low: string;
    high: string;
    colors: [string, string, string, string, string];
  }
> = {
  mobility: {
    label: "Upward mobility",
    shortLabel: "Adult income rank",
    description: "Average adult income percentile for children raised by parents at the 25th percentile.",
    low: "Lower rank",
    high: "Higher rank",
    colors: ["#f5e6d1", "#ddc99f", "#a6bd9b", "#4d927f", "#0a615e"],
  },
  jobs: {
    label: "Jobs reachable by transit",
    shortLabel: "Accessible jobs",
    description: "Weighted average number of jobs reachable during the morning departure window.",
    low: "Fewer jobs",
    high: "More jobs",
    colors: ["#f3efd9", "#cdd4f5", "#909bd8", "#5d6cc8", "#2a327c"],
  },
  transit_added: {
    label: "Network reach",
    shortLabel: "60–10 minute reach",
    description: "Log-scale growth in reachable jobs between a 10- and 60-minute transit trip.",
    low: "Lower reach",
    high: "Higher reach",
    colors: ["#f8eccb", "#e8c98a", "#d59f66", "#b66557", "#7d3047"],
  },
  parent_rank: {
    label: "Mean parent income rank",
    shortLabel: "Parent income",
    description: "Mean national household income rank of parents represented in the Atlas sample.",
    low: "Lower rank",
    high: "Higher rank",
    colors: ["#f1ead9", "#d5d5ae", "#9fbb91", "#599a7d", "#1e6d68"],
  },
  frac_black: {
    label: "Share of Atlas children who are Black",
    shortLabel: "Black child share",
    description: "Black children as a share of children represented in the pooled Atlas sample.",
    low: "Lower share",
    high: "Higher share",
    colors: ["#f2ede4", "#dacfb9", "#b5a68b", "#84735f", "#4f4038"],
  },
  density: {
    label: "Atlas sample density",
    shortLabel: "Children per mi²",
    description: "Children represented in the Atlas sample divided by 2020 tract land area.",
    low: "Lower density",
    high: "Higher density",
    colors: ["#f5efe2", "#d8d3b3", "#a7b48e", "#6d8d72", "#3f625c"],
  },
};

const COUNTY_BOUNDS: Record<string, [[number, number], [number, number]]> = {
  Cook: [[-88.27, 41.47], [-87.52, 42.16]],
  DuPage: [[-88.26, 41.68], [-87.91, 42.07]],
  Kane: [[-88.61, 41.72], [-88.23, 42.16]],
  Kendall: [[-88.60, 41.46], [-88.24, 41.73]],
  Lake: [[-88.20, 42.15], [-87.78, 42.50]],
  McHenry: [[-88.71, 42.15], [-88.19, 42.50]],
  Will: [[-88.26, 41.20], [-87.52, 41.73]],
};

const ALL_BOUNDS: [[number, number], [number, number]] = [[-88.78, 41.16], [-87.47, 42.53]];

function metricProperty(metric: MetricKey, threshold: number) {
  return metric === "jobs" ? `jobs_${threshold}` : metric;
}

function formatValue(metric: MetricKey, value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "No estimate";
  if (metric === "mobility" || metric === "parent_rank") return `${value.toFixed(1)} percentile`;
  if (metric === "frac_black") return `${(value * 100).toFixed(1)}%`;
  if (metric === "density") return `${Math.round(value).toLocaleString()} children / mi²`;
  if (metric === "jobs") return `${Math.round(value).toLocaleString()} jobs`;
  return `${value.toFixed(2)} log-point gain`;
}

function colorExpression(
  summary: AtlasSummary,
  metric: MetricKey,
  threshold: number,
): maplibregl.ExpressionSpecification {
  const property = metricProperty(metric, threshold);
  const range = summary.ranges[property];
  const colors = METRICS[metric].colors;
  const lower = range.p05;
  const upper = range.p95;
  const step = (upper - lower) / 4;
  const ramp: maplibregl.ExpressionSpecification = [
    "interpolate",
    ["linear"],
    ["to-number", ["get", property]],
    lower,
    colors[0],
    lower + step,
    colors[1],
    lower + step * 2,
    colors[2],
    lower + step * 3,
    colors[3],
    upper,
    colors[4],
  ];
  return metric === "jobs"
    ? ramp
    : ["case", ["to-boolean", ["get", "has_atlas"]], ramp, "#d8d5cf"];
}

function Header({ view, onView }: { view: ViewKey; onView: (view: ViewKey) => void }) {
  return (
    <header className="site-header">
      <button className="brand" onClick={() => onView("map")} aria-label="Open the map">
        <span>
          <strong>Transit Access &amp; Upward Mobility</strong>
          <em>Chicago</em>
        </span>
      </button>
      <nav aria-label="Primary navigation">
        {(["map", "notebook", "about"] as ViewKey[]).map((item) => (
          <button className={view === item ? "active" : ""} key={item} onClick={() => onView(item)}>
            {item === "map" ? "Map" : item === "notebook" ? "Analysis" : "About"}
          </button>
        ))}
      </nav>
    </header>
  );
}

function MetricLegend({ summary, metric, threshold }: { summary: AtlasSummary; metric: MetricKey; threshold: number }) {
  const range = summary.ranges[metricProperty(metric, threshold)];
  return (
    <div className="legend" aria-label={`${METRICS[metric].label} map legend`}>
      <div className="legend-labels">
        <span>{METRICS[metric].low}</span>
        <span>{METRICS[metric].high}</span>
      </div>
      <div className="legend-ramp" style={{ background: `linear-gradient(90deg, ${METRICS[metric].colors.join(",")})` }} />
      <div className="legend-values">
        <span>{formatValue(metric, range.p05)}</span>
        <span>Middle: {formatValue(metric, range.median)}</span>
        <span>{formatValue(metric, range.p95)}</span>
      </div>
      <p><span className="missing-swatch" /> No Atlas estimate</p>
    </div>
  );
}

function DetailsCard({ tract, threshold, onRemove }: { tract: TractProperties; threshold: number; onRemove: () => void }) {
  return (
    <article className="tract-card">
      <button className="remove-tract" onClick={onRemove} aria-label={`Remove tract ${tract.geoid}`}>×</button>
      <span className="eyebrow">{tract.county} County</span>
      <h3>Tract {tract.geoid.slice(-6)}</h3>
      <dl>
        <div><dt>Adult income rank</dt><dd>{formatValue("mobility", tract.mobility)}</dd></div>
        <div><dt>{threshold}-minute jobs</dt><dd>{formatValue("jobs", tract[`jobs_${threshold}`])}</dd></div>
        <div><dt>Network reach</dt><dd>{formatValue("transit_added", tract.transit_added)}</dd></div>
        <div><dt>Mean parent rank</dt><dd>{formatValue("parent_rank", tract.parent_rank)}</dd></div>
        <div><dt>Black child share</dt><dd>{formatValue("frac_black", tract.frac_black)}</dd></div>
      </dl>
    </article>
  );
}

function MapView({ summary }: { summary: AtlasSummary }) {
  const mapNode = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const allFeatures = useRef<GeoJSON.Feature<GeoJSON.Geometry, TractProperties>[]>([]);
  const selectedIdsRef = useRef<string[]>([]);
  const [metric, setMetric] = useState<MetricKey>("jobs");
  const [threshold, setThreshold] = useState(30);
  const metricRef = useRef<MetricKey>("jobs");
  const thresholdRef = useRef(30);
  const [county, setCounty] = useState("All counties");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<TractProperties[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);

  useEffect(() => {
    if (!mapNode.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapNode.current,
      bounds: ALL_BOUNDS,
      fitBoundsOptions: { padding: 34 },
      attributionControl: false,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm", paint: { "raster-opacity": 0.42, "raster-saturation": -0.75 } }],
      },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

    map.on("load", async () => {
      const response = await fetch(`${import.meta.env.BASE_URL}data/tracts.geojson`);
      const geojson = (await response.json()) as GeoJSON.FeatureCollection<GeoJSON.Geometry, TractProperties>;
      allFeatures.current = geojson.features;
      map.addSource("tracts", { type: "geojson", data: geojson, promoteId: "geoid" });
      map.addLayer({
        id: "tract-fill",
        type: "fill",
        source: "tracts",
        paint: { "fill-color": colorExpression(summary, "jobs", 30), "fill-opacity": 0.78 },
      });
      map.addLayer({
        id: "tract-outline",
        type: "line",
        source: "tracts",
        paint: {
          "line-color": ["case", ["boolean", ["feature-state", "selected"], false], "#f2a900", "rgba(255,255,255,.72)"],
          "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 3, 0.45],
        },
      });
      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
      map.on("mousemove", "tract-fill", (event) => {
        const feature = event.features?.[0] as MapGeoJSONFeature | undefined;
        if (!feature) return;
        map.getCanvas().style.cursor = "pointer";
        const properties = feature.properties as unknown as TractProperties;
        const activeMetric = metricRef.current;
        const value = (properties as unknown as Record<string, number | null>)[metricProperty(activeMetric, thresholdRef.current)];
        popup
          .setLngLat(event.lngLat)
          .setHTML(`<strong>${properties.county} County</strong><span>Tract ${properties.geoid.slice(-6)}</span><b>${formatValue(activeMetric, value)}</b>`)
          .addTo(map);
      });
      map.on("mouseleave", "tract-fill", () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });
      map.on("click", "tract-fill", (event) => {
        const feature = event.features?.[0] as MapGeoJSONFeature | undefined;
        if (!feature) return;
        const properties = feature.properties as unknown as TractProperties;
        setSelected((current) => {
          if (current.some((item) => item.geoid === properties.geoid)) return current;
          const next = current.length >= 2 ? [current[1], properties] : [...current, properties];
          return next;
        });
      });
      setMapReady(true);
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [summary]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map?.getLayer("tract-fill")) return;
    metricRef.current = metric;
    thresholdRef.current = threshold;
    map.setPaintProperty("tract-fill", "fill-color", colorExpression(summary, metric, threshold));
  }, [mapReady, metric, threshold, summary]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const nextIds = selected.map((item) => item.geoid);
    for (const geoid of selectedIdsRef.current.filter((id) => !nextIds.includes(id))) {
      map.setFeatureState({ source: "tracts", id: geoid }, { selected: false });
    }
    for (const geoid of nextIds.filter((id) => !selectedIdsRef.current.includes(id))) {
      map.setFeatureState({ source: "tracts", id: geoid }, { selected: true });
    }
    selectedIdsRef.current = nextIds;
  }, [selected, mapReady]);

  function selectCounty(nextCounty: string) {
    setCounty(nextCounty);
    const map = mapRef.current;
    if (!map) return;
    map.fitBounds(nextCounty === "All counties" ? ALL_BOUNDS : COUNTY_BOUNDS[nextCounty], { padding: 46, duration: 900 });
  }

  function runSearch(event: React.FormEvent) {
    event.preventDefault();
    const normalized = query.replace(/\D/g, "");
    const feature = allFeatures.current.find((item) => item.properties.geoid === normalized || item.properties.geoid.endsWith(normalized));
    if (!feature) return;
    setSelected((current) => current.some((item) => item.geoid === feature.properties.geoid) ? current : [...current.slice(-1), feature.properties]);
    const geometry = feature.geometry;
    if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") return;
    const coordinates = geometry.type === "Polygon" ? geometry.coordinates.flat() : geometry.coordinates.flat(2);
    const bounds = coordinates.reduce((acc, point) => acc.extend(point as [number, number]), new maplibregl.LngLatBounds());
    mapRef.current?.fitBounds(bounds, { padding: 100, maxZoom: 12, duration: 900 });
  }

  return (
    <main className={`map-page ${panelOpen ? "" : "panel-closed"}`}>
      <aside className="control-panel">
        <div className="panel-heading">
          <h1>Transit Access &amp; Upward Mobility in Chicago</h1>
          <p>Explore whether access to more jobs by transit is related to upward mobility across Chicago-area neighborhoods.</p>
        </div>
        {metric === "jobs" && (
          <div className="threshold-control primary-control">
            <span className="control-kicker">Jobs reachable within</span>
            <div><label htmlFor="threshold">Travel time</label><output><strong>{threshold}</strong> min</output></div>
            <input id="threshold" type="range" min="5" max="60" step="5" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} />
            <div className="range-labels"><span>5 min</span><span>60 min</span></div>
          </div>
        )}
        <div className="control-group layer-control">
          <label htmlFor="metric">Map layer</label>
          <select id="metric" value={metric} onChange={(event) => setMetric(event.target.value as MetricKey)}>
            {(Object.keys(METRICS) as MetricKey[]).map((key) => <option value={key} key={key}>{METRICS[key].shortLabel}</option>)}
          </select>
          <p>{METRICS[metric].description}</p>
        </div>
        <div className="location-controls">
          <div className="control-group">
            <label htmlFor="county">Area</label>
            <select id="county" value={county} onChange={(event) => selectCounty(event.target.value)}>
              <option>All counties</option>
              {Object.keys(COUNTY_BOUNDS).map((name) => <option key={name}>{name}</option>)}
            </select>
          </div>
          <form className="tract-search" onSubmit={runSearch}>
            <label htmlFor="tract-search">Tract GEOID</label>
            <div><input id="tract-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="17031010100" /><button>Go</button></div>
          </form>
        </div>
        <MetricLegend summary={summary} metric={metric} threshold={threshold} />
        <div className="panel-footer"><span>Click one or two tracts to compare.</span><a href={`${import.meta.env.BASE_URL}data/tract_metrics.csv`} download>data.csv</a></div>
      </aside>
      <button className="panel-toggle" onClick={() => setPanelOpen((open) => !open)} aria-label={panelOpen ? "Hide controls" : "Show controls"}>{panelOpen ? "‹" : "›"}</button>
      <section className="map-stage" aria-label="Interactive tract map">
        {!mapReady && <div className="map-loading">Preparing 2,070 tract shapes…</div>}
        <div className="map-canvas" ref={mapNode} />
        {selected.length > 0 && (
          <div className={`comparison-drawer ${selected.length === 2 ? "two" : ""}`}>
            <header><div><span className="eyebrow">Selected neighborhoods</span><h2>{selected.length === 1 ? "Choose another tract to compare" : "Side-by-side comparison"}</h2></div><button onClick={() => setSelected([])}>Clear</button></header>
            <div className="tract-grid">
              {selected.map((tract) => <DetailsCard key={tract.geoid} tract={tract} threshold={threshold} onRemove={() => setSelected((items) => items.filter((item) => item.geoid !== tract.geoid))} />)}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function CorrelationChart({ summary }: { summary: AtlasSummary }) {
  const width = 760;
  const height = 320;
  const pad = { left: 58, right: 28, top: 22, bottom: 48 };
  const x = (threshold: number) => pad.left + ((threshold - 5) / 55) * (width - pad.left - pad.right);
  const minY = -0.55;
  const maxY = 0.05;
  const y = (value: number) => pad.top + ((maxY - value) / (maxY - minY)) * (height - pad.top - pad.bottom);
  const line = (key: "pearson" | "spearman") => summary.correlations.map((row, index) => `${index ? "L" : "M"}${x(row.threshold)},${y(row[key])}`).join(" ");
  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Negative correlation between accessible jobs and upward mobility strengthens at longer transit travel thresholds">
        {[0, -0.1, -0.2, -0.3, -0.4, -0.5].map((tick) => <g key={tick}><line x1={pad.left} x2={width-pad.right} y1={y(tick)} y2={y(tick)} className="grid-line" /><text x={pad.left-10} y={y(tick)+4} textAnchor="end">{tick.toFixed(1)}</text></g>)}
        {summary.thresholds.map((tick) => <text key={tick} x={x(tick)} y={height-18} textAnchor="middle">{tick}</text>)}
        <path d={line("pearson")} className="chart-line pearson" />
        <path d={line("spearman")} className="chart-line spearman" />
        {summary.correlations.map((row) => <circle key={`p${row.threshold}`} cx={x(row.threshold)} cy={y(row.pearson)} r="4" className="pearson-point" />)}
        {summary.correlations.map((row) => <rect key={`s${row.threshold}`} x={x(row.threshold)-3.5} y={y(row.spearman)-3.5} width="7" height="7" className="spearman-point" />)}
        <text x={width/2} y={height-1} textAnchor="middle" className="axis-title">Travel-time threshold (minutes)</text>
      </svg>
      <div className="chart-key"><span className="pearson-key">Pearson</span><span className="spearman-key">Spearman</span></div>
    </div>
  );
}

function AnalysisView({ summary }: { summary: AtlasSummary }) {
  const regression = summary.regression;
  return (
    <main className="content-page analysis-page">
      <header className="page-intro">
        <span className="eyebrow">Notebook findings</span>
        <h1>A transit gradient that disappears under controls</h1>
        <p>Well-connected tracts initially appear to have lower upward mobility. The notebook shows that this pattern reflects Chicago’s residential geography—not evidence that transit reduces opportunity.</p>
      </header>
      <section className="stat-strip">
        <article><strong>{summary.counts.transitTracts.toLocaleString()}</strong><span>Transit tracts mapped</span></article>
        <article><strong>{summary.counts.matchedAtlasTracts.toLocaleString()}</strong><span>Usable mobility estimates</span></article>
        <article><strong>{regression.transitAddedCoefficient.toFixed(2)}</strong><span>Controlled network-reach coefficient</span></article>
        <article><strong>{regression.rSquared.toFixed(2)}</strong><span>Final model R²</span></article>
      </section>
      <section className="analysis-grid">
        <article className="analysis-card chart-card">
          <div className="section-heading"><span className="number">01</span><div><h2>The raw relationship gets more negative</h2><p>At longer trip windows, transit access increasingly distinguishes the urban core from affluent peripheral suburbs.</p></div></div>
          <CorrelationChart summary={summary} />
        </article>
        <article className="analysis-card finding-card">
          <span className="number">02</span>
          <h2>Composition explains the gradient</h2>
          <p>Adding mean parent income to the model eliminates both raw access relationships. The negative association was largely about who lives in well-connected neighborhoods.</p>
          <blockquote>“What looked like a transit gradient was the geography of who lives near transit.”</blockquote>
        </article>
        <article className="analysis-card finding-card accent">
          <span className="number">03</span>
          <h2>Network reach is statistically zero</h2>
          <p>In the preferred decomposition, local access and network-added reach enter separately. The network-reach estimate is {regression.transitAddedCoefficient.toFixed(2)} income-rank points, with a 95% confidence interval from {regression.transitAddedCILower.toFixed(2)} to {regression.transitAddedCIUpper.toFixed(2)}.</p>
          <div className="null-meter"><span style={{ left: `${Math.max(0, Math.min(100, ((regression.transitAddedCoefficient + 5) / 10) * 100))}%` }} /><i /></div>
          <small>Controlled OLS with robust HC3 standard errors and county fixed effects; n = {regression.n.toLocaleString()}.</small>
        </article>
      </section>
    </main>
  );
}

function AboutView() {
  return (
    <main className="about-page-minimal">
      <article>
        <h1>About</h1>
        <p>
          I decided to undertake this project as it sits at the intersection of a few things I care about. I am originally from Chicago and am an avid fan of public transit systems (Paris has been my favorite so far, but I am looking forward to exploring Hong Kong's in August 2026). Having grown up in a low-income household, upward mobility is also a very personal issue for me.
        </p>
        <p>
          A persistent debate in Chicago politics has been whether to fund the extension of the CTA Red Line to better serve the historically underdeveloped South Side. While the extension will increase access to opportunities for the neighborhood, I found myself wondering about the long-term effects of such a system on the neighborhood's mobility. This is the question I set out to explore
        </p>
      </article>
    </main>
  );
}

export default function App() {
  const [view, setView] = useState<ViewKey>("map");
  const [summary, setSummary] = useState<AtlasSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/summary.json`)
      .then((response) => {
        if (!response.ok) throw new Error("Summary data could not be loaded.");
        return response.json();
      })
      .then(setSummary)
      .catch((reason) => setError(String(reason)));
  }, []);

  const content = useMemo(() => {
    if (error) return <main className="loading-state">{error}</main>;
    if (view === "notebook") return <NotebookView />;
    if (view === "about") return <AboutView />;
    if (!summary) return <main className="loading-state">Loading the map…</main>;
    return <MapView summary={summary} />;
  }, [view, summary, error]);

  return <div className="app-shell"><Header view={view} onView={setView} />{content}</div>;
}
