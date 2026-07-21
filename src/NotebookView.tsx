import { Fragment, useEffect, useState } from "react";

type NotebookCell = {
  cell_type: "markdown" | "code";
  source: string[];
  execution_count?: number | null;
  outputs?: Array<{
    output_type: string;
    text?: string[];
    data?: Record<string, string | string[]>;
  }>;
};

type Notebook = { cells: NotebookCell[] };

const NOTEBOOK_PATH = `${import.meta.env.BASE_URL}notebook/chicago_transit_mobility.ipynb`;
const APPENDIX_NOTEBOOK_PATH = `${import.meta.env.BASE_URL}notebook/chicago_transit_mobility_original_with_crosswalk_appendix.ipynb`;

function headingId(text: string) {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function inlineText(text: string) {
  const pieces = text.split(/(`[^`]+`|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*)/g);
  return pieces.map((piece, index) => {
    const link = piece.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const isAnchor = link[2].startsWith("#");
      return (
        <a key={index} href={link[2]} target={isAnchor ? undefined : "_blank"} rel={isAnchor ? undefined : "noreferrer"}>
          {link[1]}
        </a>
      );
    }
    if (piece.startsWith("`") && piece.endsWith("`")) {
      return <code key={index}>{piece.slice(1, -1)}</code>;
    }
    if (piece.startsWith("**") && piece.endsWith("**")) {
      return <strong key={index}>{piece.slice(2, -2)}</strong>;
    }
    return <Fragment key={index}>{piece}</Fragment>;
  });
}

function MarkdownCell({ source }: { source: string }) {
  const blocks = source.trim().split(/\n\s*\n/);
  return (
    <div className="markdown-cell">
      {blocks.map((block, index) => {
        if (block.startsWith("### ")) {
          const text = block.slice(4);
          return <h3 id={headingId(text)} key={index}>{inlineText(text)}</h3>;
        }
        if (block.startsWith("## ")) {
          const text = block.slice(3);
          return <h2 id={headingId(text)} key={index}>{inlineText(text)}</h2>;
        }
        if (block.startsWith("# ")) {
          const text = block.slice(2);
          return <h1 id={headingId(text)} key={index}>{inlineText(text)}</h1>;
        }
        const lines = block.split("\n");
        if (lines.every((line) => /^\s*[-*]\s+/.test(line))) {
          return (
            <ul key={index}>
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>{inlineText(line.replace(/^\s*[-*]\s+/, ""))}</li>
              ))}
            </ul>
          );
        }
        return <p key={index}>{inlineText(lines.join(" "))}</p>;
      })}
    </div>
  );
}

function Output({ output }: { output: NonNullable<NotebookCell["outputs"]>[number] }) {
  const data = output.data ?? {};
  if (data["image/png"]) {
    const image = Array.isArray(data["image/png"])
      ? data["image/png"].join("")
      : data["image/png"];
    return <img className="notebook-output-image" src={`data:image/png;base64,${image}`} alt="Notebook chart" />;
  }
  if (data["text/html"]) {
    const html = Array.isArray(data["text/html"])
      ? data["text/html"].join("")
      : data["text/html"];
    return <div className="notebook-html-output" dangerouslySetInnerHTML={{ __html: html }} />;
  }
  const text = output.text ?? data["text/plain"];
  if (!text) return null;
  return <pre className="notebook-text-output">{Array.isArray(text) ? text.join("") : text}</pre>;
}

export default function NotebookView() {
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(NOTEBOOK_PATH)
      .then((response) => {
        if (!response.ok) throw new Error("Notebook could not be loaded.");
        return response.json();
      })
      .then(setNotebook)
      .catch((reason) => setError(String(reason)));
  }, []);

  if (error) return <div className="loading-state">{error}</div>;
  if (!notebook) return <div className="loading-state">Opening the analysis…</div>;

  return (
    <main className="notebook-page">
      <header className="page-intro notebook-intro">
        <div>
          <span className="eyebrow">Analysis</span>
          <h1>Transit access and upward mobility</h1>
          <p>
            Read the narrative, code, results, and charts without leaving the project. The original
            Jupyter file remains available for editing and download.
          </p>
        </div>
        <div className="notebook-actions">
          <a className="button secondary" href={NOTEBOOK_PATH} download>
            Download .ipynb
          </a>
          <a className="button secondary" href={APPENDIX_NOTEBOOK_PATH} download>
            Download original + appendix
          </a>
        </div>
      </header>
      <article className="notebook-document">
        {notebook.cells.map((cell, index) => (
          <section className={`notebook-cell ${cell.cell_type}`} key={index}>
            {cell.cell_type === "markdown" ? (
              <MarkdownCell source={cell.source.join("")} />
            ) : (
              <>
                <details>
                  <summary>
                    Code {cell.execution_count ? `· executed ${cell.execution_count}` : ""}
                  </summary>
                  <pre className="notebook-code"><code>{cell.source.join("")}</code></pre>
                </details>
                {cell.outputs?.map((output, outputIndex) => <Output key={outputIndex} output={output} />)}
              </>
            )}
          </section>
        ))}
      </article>
    </main>
  );
}
