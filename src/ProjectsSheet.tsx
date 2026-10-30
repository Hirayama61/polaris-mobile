import { useCallback, useEffect, useState } from "react";
import { describeFailure, type Failure } from "./failure";
import { listFileNames, readFile } from "./github";
import { toKeyedItems } from "./keys";
import {
  loadProjects,
  type ProjectLine,
  type ProjectSummary,
  parseProjectBody,
  type Segment,
} from "./projects";
import type { Settings } from "./settings";
import { CloseIcon } from "./ui";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; projects: ProjectSummary[] }
  | { status: "error"; failure: Failure };

type Props = {
  settings: Settings;
  onClose: () => void;
  onOpenSettings: () => void;
};

const toSegmentKey = (segment: Segment): string =>
  segment.kind === "link" ? `link:${segment.href}:${segment.text}` : `text:${segment.text}`;

const toLineKey = (line: ProjectLine): string =>
  line.kind === "blank" ? "blank" : `${line.kind}:${line.segments.map((segment) => segment.text).join("")}`;

const SegmentsView = ({ segments }: { segments: readonly Segment[] }) => (
  <>
    {toKeyedItems(segments, toSegmentKey).map(({ key, item: segment }) =>
      segment.kind === "link" ? (
        <a key={key} href={segment.href} target="_blank" rel="noreferrer">
          {segment.text}
        </a>
      ) : (
        <span key={key}>{segment.text}</span>
      ),
    )}
  </>
);

const ProjectLineView = ({ line }: { line: ProjectLine }) => {
  switch (line.kind) {
    case "heading":
      return (
        <p className={line.level <= 2 ? "project-heading" : "project-subheading"}>
          <SegmentsView segments={line.segments} />
        </p>
      );
    case "item":
      return (
        <p className="project-item">
          <SegmentsView segments={line.segments} />
        </p>
      );
    case "text":
      return (
        <p>
          <SegmentsView segments={line.segments} />
        </p>
      );
    case "blank":
      return <div className="project-gap" />;
  }
};

const ProjectBody = ({ project }: { project: ProjectSummary }) => {
  const lines = parseProjectBody(project.body, project.github);
  if (lines.length === 0 || lines.every((line) => line.kind === "blank")) {
    return <p className="muted">本文がありません。</p>;
  }
  return (
    <div className="project-body">
      {toKeyedItems(lines, toLineKey).map(({ key, item }) => (
        <ProjectLineView key={key} line={item} />
      ))}
    </div>
  );
};

/**
 * `projects/*.md` を一覧にして、タップで本文を読むシート。読むだけで書かない。
 */
export const ProjectsSheet = ({ settings, onClose, onOpenSettings }: Props) => {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [selected, setSelected] = useState<ProjectSummary | undefined>(undefined);

  const fetchProjects = useCallback(() => {
    if (settings.token === "") {
      return undefined;
    }
    setLoad({ status: "loading" });
    let isCancelled = false;
    loadProjects(
      (path) => listFileNames(settings, path),
      async (path) => {
        const file = await readFile(settings, path);
        return file.kind === "found" ? file.content : undefined;
      },
    )
      .then((projects) => {
        if (!isCancelled) {
          setLoad({ status: "ready", projects });
        }
      })
      .catch((error: unknown) => {
        if (!isCancelled) {
          setLoad({ status: "error", failure: describeFailure(error) });
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [settings]);

  useEffect(() => fetchProjects(), [fetchProjects]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    // 背面のスクロールを止める。
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const retiredStart = load.status === "ready" ? load.projects.findIndex((project) => project.isRetired) : -1;

  return (
    <div className="sheet-backdrop">
      <button type="button" className="sheet-scrim" aria-hidden="true" tabIndex={-1} onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="projects-title">
        <div className="sheet-head">
          {selected !== undefined && (
            <button
              type="button"
              className="icon-button sheet-back"
              aria-label="一覧に戻る"
              onClick={() => setSelected(undefined)}
            >
              <span className="back-chevron" aria-hidden="true" />
            </button>
          )}
          <h2 id="projects-title" className="sheet-title">
            {selected === undefined ? "プロジェクト" : selected.name}
          </h2>
          <button type="button" className="icon-button" aria-label="閉じる" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        {selected !== undefined ? (
          <ProjectBody project={selected} />
        ) : settings.token === "" ? (
          <div className="message message-error" role="alert">
            <p>トークンが未設定です。</p>
            <button type="button" className="button button-small" onClick={onOpenSettings}>
              設定を開く
            </button>
          </div>
        ) : load.status === "loading" ? (
          <div className="skeleton" role="status" aria-busy="true" aria-label="読み込み中">
            <div className="skeleton-line" />
            <div className="skeleton-line" />
            <div className="skeleton-line skeleton-short" />
          </div>
        ) : load.status === "error" ? (
          <div className="message message-error" role="alert">
            <p>{load.failure.reason}</p>
            <p>{load.failure.hint}</p>
            {load.failure.action === "settings" ? (
              <button type="button" className="button button-small" onClick={onOpenSettings}>
                設定を開く
              </button>
            ) : (
              <button type="button" className="button button-small" onClick={fetchProjects}>
                読み直す
              </button>
            )}
          </div>
        ) : load.projects.length === 0 ? (
          <p className="panel panel-empty muted">projects/ にプロジェクトがありません。</p>
        ) : (
          <ul className="panel project-list">
            {load.projects.map((project, index) => (
              <li key={project.slug}>
                {index === retiredStart && <p className="project-group">終了</p>}
                <button
                  type="button"
                  className={project.isRetired ? "project-row project-retired" : "project-row"}
                  onClick={() => setSelected(project)}
                >
                  <span className="turn-line">{project.name}</span>
                  <span className="project-chevron" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
