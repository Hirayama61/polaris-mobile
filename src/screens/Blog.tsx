import { useCallback, useState } from "react";
import { BLOG_STAGE_LABELS, type BlogPost } from "../blog";
import type { Settings } from "../settings";
import { StateCard } from "../ui";
import { useBlogPosts } from "../useBlogPosts";
import { BlogIdeaSheet } from "./BlogIdeaSheet";
import { BlogPostView } from "./BlogPostView";
import { FailureAction, UnconfiguredCard } from "./common";

type Props = {
  settings: Settings;
  isOnline: boolean;
  onOpenSettings: () => void;
};

const BlogRow = (props: { post: BlogPost; onSelect: () => void }) => {
  const { post, onSelect } = props;
  return (
    <button type="button" className="project-row" onClick={onSelect}>
      <span className="blog-row-title">{post.title}</span>
      <span className={`badge blog-stage blog-stage-${post.stage}`}>{BLOG_STAGE_LABELS[post.stage]}</span>
      <span className="project-chevron" aria-hidden="true" />
    </button>
  );
};

/**
 * `writing/blog/` の記事を段階つきの一覧にし、タップで本文と一言・公開の欄を開く。
 *
 * 新しいアイデアは「アイデアを書く」のシートで ideas に書く。
 *
 * @remarks 思いつき (inbox) のシートは持たない。
 */
export const BlogScreen = (props: Props) => {
  const { settings, isOnline, onOpenSettings } = props;
  const { state, reload } = useBlogPosts(settings);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [isIdeaOpen, setIsIdeaOpen] = useState(false);
  const closeIdea = useCallback(() => setIsIdeaOpen(false), []);

  if (state.status === "unconfigured") {
    return <UnconfiguredCard onOpenSettings={onOpenSettings} />;
  }
  if (state.status === "loading") {
    return (
      <div className="skeleton" role="status" aria-busy="true" aria-label="読み込み中">
        <div className="skeleton-line skeleton-title" />
        <div className="skeleton-line" />
        <div className="skeleton-line skeleton-short" />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <StateCard
        title="ブログの一覧を読めませんでした"
        tone="error"
        action={<FailureAction failure={state.failure} onRetry={reload} onOpenSettings={onOpenSettings} />}
      >
        <p>{state.failure.reason}</p>
        <p>{state.failure.hint}</p>
      </StateCard>
    );
  }

  const selected = state.posts.find((post) => post.id === selectedId);
  if (selected !== undefined) {
    return (
      <BlogPostView
        key={selected.id}
        settings={settings}
        isOnline={isOnline}
        post={selected}
        onBack={() => setSelectedId(undefined)}
        onSaved={reload}
        onOpenSettings={onOpenSettings}
      />
    );
  }

  const hasPosts = state.posts.length > 0;
  return (
    <>
      <section className="section" aria-labelledby="blog-title">
        <div className="section-head">
          <h2 id="blog-title" className="section-title">
            記事
          </h2>
          {hasPosts && <span className="section-meta">{state.posts.length} 本</span>}
        </div>
        {hasPosts && (
          <ul className="panel project-list">
            {state.posts.map((post) => (
              <li key={post.id}>
                <BlogRow post={post} onSelect={() => setSelectedId(post.id)} />
              </li>
            ))}
          </ul>
        )}
        {!hasPosts && <p className="panel panel-empty muted">まだ記事がありません。</p>}
      </section>

      <section className="section">
        <p className="field-hint">
          新しいアイデアは「アイデアを書く」から。writing/blog/ideas に入り、ここに「構成待ち」で並びます。
        </p>
        <button type="button" className="button button-block" onClick={() => setIsIdeaOpen(true)}>
          アイデアを書く
        </button>
      </section>

      {isIdeaOpen && (
        <BlogIdeaSheet
          settings={settings}
          isOnline={isOnline}
          onClose={closeIdea}
          onSent={reload}
          onOpenSettings={onOpenSettings}
        />
      )}
    </>
  );
};
