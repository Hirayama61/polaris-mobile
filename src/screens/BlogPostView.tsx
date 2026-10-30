import {
  BLOG_STAGE_LABELS,
  type BlogPost,
  extractComment,
  getCommentFolder,
  getLatestText,
  toBlogPath,
} from "../blog";
import { toKeyedItems } from "../keys";
import { ProjectLineView } from "../ProjectsSheet";
import { type ProjectLine, parseProjectBody, stripFrontmatter } from "../projects";
import type { Settings } from "../settings";
import { BlogCommentForm } from "./BlogCommentForm";
import { BlogPublishForm } from "./BlogPublishForm";

type Props = {
  settings: Settings;
  isOnline: boolean;
  post: BlogPost;
  onBack: () => void;
  onSaved: () => void;
  onOpenSettings: () => void;
};

const toLineKey = (line: ProjectLine): string => {
  const isBlank = line.kind === "blank";
  if (isBlank) {
    return "blank";
  }
  return `${line.kind}:${line.segments.map((segment) => segment.text).join("")}`;
};

/**
 * 1 本の記事のいちばん進んだ版の本文を出し、一言と公開の欄を並べる。
 *
 * @remarks 一覧の読み直しは持たない。保存したら `onSaved` で一覧を持つ側に知らせる。
 */
export const BlogPostView = (props: Props) => {
  const { settings, isOnline, post, onBack, onSaved, onOpenSettings } = props;
  const lines = parseProjectBody(stripFrontmatter(getLatestText(post.files) ?? ""), undefined);
  const hasBody = lines.some((line) => line.kind !== "blank");
  const commentFolder = getCommentFolder(post);
  const canPublish = post.stage === "drafting";

  return (
    <>
      <div className="blog-head">
        <button type="button" className="icon-button sheet-back" aria-label="一覧に戻る" onClick={onBack}>
          <span className="back-chevron" aria-hidden="true" />
        </button>
        <h2 className="blog-title">{post.title}</h2>
        <span className={`badge blog-stage blog-stage-${post.stage}`}>{BLOG_STAGE_LABELS[post.stage]}</span>
      </div>

      <section className="section" aria-label="本文">
        {hasBody && (
          <div className="panel project-body">
            {toKeyedItems(lines, toLineKey).map(({ key, item }) => (
              <ProjectLineView key={key} line={item} />
            ))}
          </div>
        )}
        {!hasBody && <p className="panel panel-empty muted">本文がありません。</p>}
      </section>

      {commentFolder !== undefined && (
        <BlogCommentForm
          settings={settings}
          isOnline={isOnline}
          path={toBlogPath(commentFolder, post.id)}
          initialComment={extractComment(post.files[commentFolder] ?? "")}
          onSaved={onSaved}
          onOpenSettings={onOpenSettings}
        />
      )}

      {canPublish && (
        <BlogPublishForm
          settings={settings}
          isOnline={isOnline}
          path={toBlogPath("draft", post.id)}
          onSaved={onSaved}
          onOpenSettings={onOpenSettings}
        />
      )}
    </>
  );
};
