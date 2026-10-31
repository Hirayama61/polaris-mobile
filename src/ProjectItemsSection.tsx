import type { InboxItem } from "./inbox";

const ItemRow = (props: { item: InboxItem }) => {
  const { item } = props;
  const isQuestion = item.kind === "question";
  const isAnswered = item.kind === "question" && item.answered;
  return (
    <li className="dev-row">
      {isQuestion && <span className="tag inbox-question">質問</span>}
      <span className="dev-issue">{item.title}</span>
      {isAnswered && <span className="tag question-answered">回答済み</span>}
    </li>
  );
};

const getEmptyLabel = (isLoaded: boolean): string => {
  if (!isLoaded) {
    return "受信箱をまだ読めていません。";
  }
  return "todo のタスクと質問はありません。";
};

/**
 * 1 つのプロジェクトの todo のタスクと質問を並べる。読むだけで、開いて答えるのは受信箱から。
 *
 * @remarks 選び方と並びは持たない。`getProjectItems` の結果を受け取る。受信箱を読み終えていなければ undefined。
 */
export const ProjectItemsSection = (props: { items: InboxItem[] | undefined }) => {
  const { items } = props;
  const isLoaded = items !== undefined;
  const hasItems = isLoaded && items.length > 0;
  const emptyLabel = getEmptyLabel(isLoaded);
  return (
    <section className="section" aria-labelledby="project-items-title">
      <div className="section-head">
        <h3 id="project-items-title" className="section-title">
          タスクと質問
        </h3>
      </div>
      {hasItems ? (
        <ul className="panel dev-list">
          {items.map((item) => (
            <ItemRow key={item.id} item={item} />
          ))}
        </ul>
      ) : (
        <p className="panel panel-empty muted">{emptyLabel}</p>
      )}
    </section>
  );
};
