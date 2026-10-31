import { useCallback, useEffect, useState } from "react";
import { DevPlanSection } from "./DevPlanSection";
import { describeFailure, type Failure } from "./failure";
import { listFileNames, readFile } from "./github";
import { getProjectItems, type InboxItem } from "./inbox";
import { toKeyedItems } from "./keys";
import { ProjectItemsSection } from "./ProjectItemsSection";
import { ProjectRoadmapSection } from "./ProjectRoadmapSection";
import {
  loadProjects,
  type ProjectLine,
  type ProjectSummary,
  parseProjectBody,
  type Segment,
} from "./projects";
import type { Settings } from "./settings";
import { CloseIcon } from "./ui";
import { useDevPlan } from "./useDevPlan";
import { type ProjectRoadmapState, useProjectRoadmap } from "./useProjectRoadmap";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; projects: ProjectSummary[] }
  | { status: "error"; failure: Failure };

type Props = {
  settings: Settings;
  /** 受信箱の全件。読み終えていなければ undefined。 */
  inboxItems: InboxItem[] | undefined;
  onClose: () => void;
  onOpenSettings: () => void;
};

const getLoadedProjects = (load: LoadState): ProjectSummary[] | undefined => {
  const isReady = load.status === "ready";
  if (isReady) {
    return load.projects;
  }
  return undefined;
};

const toSegmentKey = (segment: Segment): string => {
  const isLink = segment.kind === "link";
  if (isLink) {
    return `link:${segment.href}:${segment.text}`;
  }
  return `text:${segment.text}`;
};

const toLineKey = (line: ProjectLine): string => {
  const isBlank = line.kind === "blank";
  if (isBlank) {
    return "blank";
  }
  const text = line.segments.map((segment) => segment.text).join("");
  return `${line.kind}:${text}`;
};

/**
 * 本文の行の一部を描画する。`link` は別のタブで開く。
 *
 * @remarks key は持たない。並べる側 (`SegmentsView`) が付ける。
 */
export const SegmentView = (props: { segment: Segment }) => {
  const { segment } = props;
  const isLink = segment.kind === "link";
  if (isLink) {
    return (
      <a href={segment.href} target="_blank" rel="noreferrer">
        {segment.text}
      </a>
    );
  }
  return <span>{segment.text}</span>;
};

const SegmentsView = ({ segments }: { segments: readonly Segment[] }) => (
  <>
    {toKeyedItems(segments, toSegmentKey).map(({ key, item }) => (
      <SegmentView key={key} segment={item} />
    ))}
  </>
);

/**
 * プロジェクトの本文の 1 行を描画する。
 *
 * @remarks key は持たない。並べる側 (`ProjectBody`) が `toKeyedItems` で付ける。
 */
export const ProjectLineView = (props: { line: ProjectLine }) => {
  const { line } = props;
  switch (line.kind) {
    case "heading": {
      const isMajor = line.level <= 2;
      if (isMajor) {
        return (
          <p className="project-heading">
            <SegmentsView segments={line.segments} />
          </p>
        );
      }
      return (
        <p className="project-subheading">
          <SegmentsView segments={line.segments} />
        </p>
      );
    }
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

const getSelectedItems = (
  inboxItems: readonly InboxItem[] | undefined,
  project: ProjectSummary,
): InboxItem[] | undefined => {
  if (inboxItems === undefined) {
    return undefined;
  }
  return getProjectItems(inboxItems, project.slug);
};

// 連携プロジェクトは進み具合、どのプロジェクトもタスクと質問、最後に本文を並べる。
const ProjectDetail = (props: {
  project: ProjectSummary;
  roadmap: ProjectRoadmapState;
  inboxItems: InboxItem[] | undefined;
}) => {
  const { project, roadmap, inboxItems } = props;
  const items = getSelectedItems(inboxItems, project);
  return (
    <>
      <ProjectRoadmapSection roadmap={roadmap} />
      <ProjectItemsSection items={items} />
      <section className="section" aria-labelledby="project-body-title">
        <div className="section-head">
          <h3 id="project-body-title" className="section-title">
            メモ
          </h3>
        </div>
        <ProjectBody project={project} />
      </section>
    </>
  );
};

/**
 * `projects/*.md` を一覧にして、タップでそのプロジェクトの進み具合、タスクと質問、本文を見るシート。読むだけで書かない。
 */
export const ProjectsSheet = ({ settings, inboxItems, onClose, onOpenSettings }: Props) => {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [selected, setSelected] = useState<ProjectSummary | undefined>(undefined);
  const devPlan = useDevPlan(settings, getLoadedProjects(load));
  const roadmap = useProjectRoadmap();
  const isListing = selected === undefined;

  const selectProject = (project: ProjectSummary): void => {
    setSelected(project);
    roadmap.load(settings, project);
  };

  const backToList = (): void => {
    setSelected(undefined);
    roadmap.reset();
  };

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
              onClick={backToList}
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

        {isListing && <DevPlanSection plan={devPlan} />}

        {selected !== undefined ? (
          <ProjectDetail project={selected} roadmap={roadmap.state} inboxItems={inboxItems} />
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
                  onClick={() => selectProject(project)}
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
