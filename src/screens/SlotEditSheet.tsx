import { type FormEvent, type PropsWithChildren, useEffect, useRef, useState } from "react";
import {
  findSameScheduleRow,
  insertScheduleRow,
  removeScheduleRow,
  type ScheduleRow,
  setScheduleRow,
  splitScheduleTime,
} from "../daily";
import type { Failure } from "../failure";
import type { Settings } from "../settings";
import { checkSlotInput, type SlotInputCheck } from "../slotInput";
import { CloseIcon } from "../ui";
import type { useDaily } from "../useDaily";
import { SlotChangedError, type SlotSaveState, useSlotSave } from "./useSlotSave";

type FrameProps = PropsWithChildren<{
  title: string;
  isBusy: boolean;
  onClose: () => void;
}>;

const SLOT_SHEET_TITLE_ID = "slot-sheet-title";

/**
 * コマを直すシートの枠。外側のタップと Esc で閉じる。
 *
 * @remarks 配置だけを持つ。書いている間は閉じさせない。閉じると書いた結果を受け取れないため。
 */
const SlotSheetFrame = (props: FrameProps) => {
  const { title, isBusy, onClose, children } = props;
  const isBusyRef = useRef(isBusy);
  isBusyRef.current = isBusy;
  const close = (): void => {
    if (!isBusy) {
      onClose();
    }
  };

  useEffect(() => {
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && !isBusyRef.current) {
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

  return (
    <div className="sheet-backdrop">
      <button type="button" className="sheet-scrim" aria-hidden="true" tabIndex={-1} onClick={close} />
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={SLOT_SHEET_TITLE_ID}>
        <div className="sheet-head">
          <h2 id={SLOT_SHEET_TITLE_ID} className="sheet-title">
            {title}
          </h2>
          <button type="button" className="icon-button" aria-label="閉じる" disabled={isBusy} onClick={close}>
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

type FieldsProps = {
  start: string;
  end: string;
  what: string;
  invalidField: "time" | "what" | null;
  isDisabled: boolean;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  onWhatChange: (value: string) => void;
};

/**
 * コマの時刻とやることの入力欄。
 *
 * @remarks 入力の確かめ方は持たない。誤りのある欄は `invalidField` で受け取る。
 */
const SlotFields = (props: FieldsProps) => {
  const { start, end, what, invalidField, isDisabled, onStartChange, onEndChange, onWhatChange } = props;
  const isTimeInvalid = invalidField === "time";
  const isWhatInvalid = invalidField === "what";
  return (
    <>
      <div className="field-row">
        <label className="field">
          <span className="field-label">開始</span>
          <input
            className="input"
            type="time"
            aria-invalid={isTimeInvalid}
            disabled={isDisabled}
            value={start}
            onChange={(event) => onStartChange(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">終了</span>
          <input
            className="input"
            type="time"
            aria-invalid={isTimeInvalid}
            disabled={isDisabled}
            value={end}
            onChange={(event) => onEndChange(event.target.value)}
          />
        </label>
      </div>
      <label className="field">
        <span className="field-label">やること</span>
        <input
          className="input"
          type="text"
          enterKeyHint="done"
          aria-invalid={isWhatInvalid}
          disabled={isDisabled}
          value={what}
          placeholder="例: 散歩"
          onChange={(event) => onWhatChange(event.target.value)}
        />
      </label>
    </>
  );
};

type MessageProps = {
  check: SlotInputCheck | null;
  save: SlotSaveState;
  onReload: () => void;
  onOpenSettings: () => void;
};

const FailureMessage = (props: { failure: Failure; onOpenSettings: () => void }) => {
  const { failure, onOpenSettings } = props;
  const isSettingsAction = failure.action === "settings";
  return (
    <div className="message message-error" role="alert">
      <p>{failure.reason}</p>
      <p>{failure.hint}</p>
      {isSettingsAction && (
        <button type="button" className="button button-small" onClick={onOpenSettings}>
          設定を開く
        </button>
      )}
    </div>
  );
};

/**
 * 入力の誤り、書けなかった理由、行が変わっていたことを知らせる。
 *
 * @remarks どれを出すかは受け取った状態だけで決める。
 */
const SlotMessage = (props: MessageProps) => {
  const { check, save, onReload, onOpenSettings } = props;
  const isInvalid = check?.kind === "invalid";
  const isStale = save.status === "stale";
  const isFailed = save.status === "error";
  return (
    <>
      {isInvalid && (
        <p className="field-hint field-hint-error" role="alert">
          {check.message}
        </p>
      )}
      {isStale && (
        <div className="message message-error" role="alert">
          <p>このコマは、開いた後に変わっていました。上書きしていません。</p>
          <p>読み直してから、もう一度直してください。</p>
          <button type="button" className="button button-small" onClick={onReload}>
            読み直す
          </button>
        </div>
      )}
      {isFailed && <FailureMessage failure={save.failure} onOpenSettings={onOpenSettings} />}
    </>
  );
};

const NO_CHECK = null;

// 入力欄の値と、最後に押したときの確かめた結果。
const useSlotForm = (initialTime: string, initialWhat: string) => {
  const initial = splitScheduleTime(initialTime);
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [what, setWhat] = useState(initialWhat);
  const [check, setCheck] = useState<SlotInputCheck | null>(NO_CHECK);
  const invalidField = check?.kind === "invalid" ? check.field : null;
  const submit = (): SlotInputCheck => {
    const next = checkSlotInput(start, end, what);
    setCheck(next);
    return next;
  };
  return { start, end, what, check, invalidField, setStart, setEnd, setWhat, submit };
};

type AddProps = {
  settings: Settings;
  date: string;
  isOnline: boolean;
  daily: ReturnType<typeof useDaily>;
  onClose: () => void;
  onOpenSettings: () => void;
};

/**
 * 時間割にコマを 1 つ足すシート。時刻の順の位置に入れる。
 */
export const AddSlotSheet = (props: AddProps) => {
  const { settings, date, isOnline, daily, onClose, onOpenSettings } = props;
  const form = useSlotForm("", "");
  const { save, isSaving, run } = useSlotSave(settings, date, isOnline, daily, onClose);
  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    const check = form.submit();
    if (check.kind !== "ok") {
      return;
    }
    run("足す", (current) => {
      const next = insertScheduleRow(current, check.time, check.what);
      if (next === current) {
        throw new Error("今日の daily に時間割の表が無いため、足せませんでした。");
      }
      return next;
    });
  };
  const submitLabel = isSaving ? "保存中…" : "足す";
  return (
    <SlotSheetFrame title="コマを足す" isBusy={isSaving} onClose={onClose}>
      <form className="sheet-form" onSubmit={handleSubmit}>
        <SlotFields
          start={form.start}
          end={form.end}
          what={form.what}
          invalidField={form.invalidField}
          isDisabled={isSaving}
          onStartChange={form.setStart}
          onEndChange={form.setEnd}
          onWhatChange={form.setWhat}
        />
        <SlotMessage check={form.check} save={save} onReload={daily.reload} onOpenSettings={onOpenSettings} />
        <button type="submit" className="button button-primary button-block" disabled={isSaving}>
          {submitLabel}
        </button>
      </form>
    </SlotSheetFrame>
  );
};

type ChangeProps = AddProps & { row: ScheduleRow };

/**
 * 時間割のコマ 1 つの時刻とやることを直す、または消すシート。
 *
 * @remarks 書く直前の daily で開いたときと同じ行を探し、変わっていたら上書きしない。
 */
export const ChangeSlotSheet = (props: ChangeProps) => {
  const { settings, date, isOnline, daily, row, onClose, onOpenSettings } = props;
  const form = useSlotForm(row.time, row.what);
  const { save, isSaving, run } = useSlotSave(settings, date, isOnline, daily, onClose);
  const handleReload = (): void => {
    daily.reload();
    onClose();
  };
  const sameRowLine = (current: string): number => {
    const same = findSameScheduleRow(current, row);
    if (same === undefined) {
      throw new SlotChangedError();
    }
    return same.line;
  };
  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    const check = form.submit();
    if (check.kind !== "ok") {
      return;
    }
    run("直す", (current) => setScheduleRow(current, sameRowLine(current), check.time, check.what));
  };
  const handleRemove = (): void => {
    run("消す", (current) => removeScheduleRow(current, sameRowLine(current)));
  };
  const submitLabel = isSaving ? "保存中…" : "保存";
  return (
    <SlotSheetFrame title="コマを直す" isBusy={isSaving} onClose={onClose}>
      <form className="sheet-form" onSubmit={handleSubmit}>
        <SlotFields
          start={form.start}
          end={form.end}
          what={form.what}
          invalidField={form.invalidField}
          isDisabled={isSaving}
          onStartChange={form.setStart}
          onEndChange={form.setEnd}
          onWhatChange={form.setWhat}
        />
        <p className="field-hint">保存すると「誰」は「あなた」になります。実績はそのまま残ります。</p>
        <SlotMessage check={form.check} save={save} onReload={handleReload} onOpenSettings={onOpenSettings} />
        <button type="submit" className="button button-primary button-block" disabled={isSaving}>
          {submitLabel}
        </button>
        <button
          type="button"
          className="button button-danger button-block"
          disabled={isSaving}
          onClick={handleRemove}
        >
          このコマを消す
        </button>
      </form>
    </SlotSheetFrame>
  );
};
