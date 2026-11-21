import { useEffect, useId, useMemo, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { getActiveViewer } from "@/api";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { t, type Locale } from "@/i18n";
import type { AccountMetadata, AccountView } from "@/types";
import { saveMetadataPatch } from "./inline-metadata-controls";

type AccountInlineNotesProps = {
  account: AccountView;
  locale: Locale;
  onSaved: (metadata: AccountMetadata) => void;
};

type Draft = { notes: string; locale: Locale; viewer: string | null } & (
  | { state: "pending" | "saving" | "error" }
  | { state: "saved"; updatedAt: string; savedAt: number }
);

const SAVE_DELAY_MS = 600;
const SAVED_FEEDBACK_MS = 2_200;

function createNotesStore(email: string, onSaved: AccountInlineNotesProps["onSaved"]) {
  const listeners = new Set<() => void>();
  let draft: Draft | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let saving = false;

  function update(next: Draft | undefined) {
    draft = next;
    listeners.forEach((listener) => listener());
  }

  function clearTimer() {
    clearTimeout(timer);
    timer = undefined;
  }

  async function save() {
    if (saving || timer !== undefined || draft?.state !== "pending") return;
    if (draft.viewer !== getActiveViewer()) {
      update(undefined);
      return;
    }
    const request: Draft = { ...draft, state: "saving" };
    saving = true;
    update(request);
    try {
      const metadata = await saveMetadataPatch(email, { notes: request.notes });
      onSaved(metadata);
      if (draft?.notes === request.notes) {
        clearTimer();
        update({ ...request, state: "saved", updatedAt: metadata.updatedAt, savedAt: Date.now() });
      }
    } catch {
      if (draft === request) {
        update({ ...request, state: "error" });
        if (!listeners.size) {
          toast.error(t(request.locale, "page.saveFailed"), { description: email });
        }
      }
    } finally {
      saving = false;
      if (draft?.state === "pending") void save();
    }
  }

  function flush() {
    clearTimer();
    void save();
  }

  return {
    getSnapshot: () => draft,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (!listeners.size) flush();
      };
    },
    change(notes: string, locale: Locale) {
      clearTimer();
      timer = setTimeout(flush, SAVE_DELAY_MS);
      update({ notes, locale, viewer: getActiveViewer(), state: "pending" });
    },
    flush,
    retry() {
      if (draft?.state !== "error") return;
      update({ ...draft, state: "pending" });
      flush();
    },
    acknowledge(saved: Draft) {
      if (draft === saved) update(undefined);
    }
  };
}

// Both responsive views stay mounted. The directory's stable callback scopes
// their shared drafts to that directory, including when a filter hides a row.
const notesByDirectory = new WeakMap<AccountInlineNotesProps["onSaved"], Map<string, ReturnType<typeof createNotesStore>>>();

function getNotesStore(email: string, onSaved: AccountInlineNotesProps["onSaved"]) {
  let accounts = notesByDirectory.get(onSaved);
  if (!accounts) {
    accounts = new Map();
    notesByDirectory.set(onSaved, accounts);
  }
  let store = accounts.get(email);
  if (!store) {
    store = createNotesStore(email, onSaved);
    accounts.set(email, store);
  }
  return store;
}

export function AccountInlineNotes({ account, locale, onSaved }: AccountInlineNotesProps) {
  const { email, metadata } = account;
  const id = useId();
  const store = useMemo(() => getNotesStore(email, onSaved), [email, onSaved]);
  const draft = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const acknowledged = draft?.state === "saved" && (metadata.notes === draft.notes || metadata.updatedAt > draft.updatedAt);

  useEffect(() => {
    if (!acknowledged) return;
    const remaining = Math.max(0, SAVED_FEEDBACK_MS - (Date.now() - draft.savedAt));
    const timeout = window.setTimeout(() => store.acknowledge(draft), remaining);
    return () => window.clearTimeout(timeout);
  }, [acknowledged, draft, store]);

  const failed = draft?.state === "error";
  const saved = draft?.state === "saved" && Date.now() - draft.savedAt < SAVED_FEEDBACK_MS;
  const german = locale === "de";

  return (
    <Field className="min-w-0 gap-1" data-invalid={failed || undefined} onDoubleClick={(event) => event.stopPropagation()}>
      <div className="flex flex-wrap items-center justify-between gap-x-2">
        <FieldLabel htmlFor={id}>{german ? "Notizen" : "Notes"}</FieldLabel>
        <span className="text-xs text-muted-foreground" role="status">
          {saved && <span className="testmails-note-saved">{t(locale, "page.saved")}</span>}
        </span>
      </div>
      <Textarea
        id={id}
        data-testmails-search-input
        className="min-h-16 max-h-56 px-2 py-1 md:min-h-14"
        rows={2}
        maxLength={4000}
        value={acknowledged ? metadata.notes : draft?.notes ?? metadata.notes}
        placeholder={german ? "Bestätigte Sitzung: Client-ID … · Counselor-ID … · Testlauf …" : "Confirmed session: client ID … · counsellor ID … · test run …"}
        aria-invalid={failed || undefined}
        aria-describedby={failed ? `${id}-error` : undefined}
        onChange={(event) => store.change(event.currentTarget.value, locale)}
        onBlur={store.flush}
      />
      {failed && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <FieldError id={`${id}-error`}>{t(locale, "page.saveFailed")}</FieldError>
          <Button type="button" size="sm" variant="outline" onClick={store.retry}>
            {german ? "Erneut versuchen" : "Retry"}
          </Button>
        </div>
      )}
    </Field>
  );
}
