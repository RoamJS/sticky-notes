import { createPage } from "roamjs-components/writes";

import { PAGE_TITLE } from "./constants";

export type StickyNoteMeta = {
  titleUid: string;
  titleText: string;
};

export type StickyNoteRecord = {
  uid: string;
  text: string;
};

type ReactLike = {
  createElement: (
    component: unknown,
    props: Record<string, unknown>,
  ) => unknown;
};

type ReactDomLike = {
  render: (element: unknown, container: Element) => void;
  unmountComponentAtNode: (container: Element) => boolean;
};

type RoamReactApi = {
  Block: (props: {
    uid: string;
    open?: boolean;
    zoomPath?: boolean;
    zoomStartAfterUid?: string;
  }) => unknown;
};

export const logRoamMutationError = ({
  operation,
  uid,
  error,
}: {
  operation: "updateBlock" | "deleteBlock";
  uid: string;
  error: unknown;
}): void => {
  console.error(`[sticky-note] Failed to ${operation} for block ${uid}`, error);
};

const getPageUid = (): string | null => {
  const page = window.roamAlphaAPI.pull("[:block/uid]", [
    ":node/title",
    PAGE_TITLE,
  ]) as { ":block/uid"?: string } | null;
  return page?.[":block/uid"] || null;
};

export const ensurePageUid = async (): Promise<string> => {
  const existing = getPageUid();
  if (existing) {
    return existing;
  }
  return createPage({ title: PAGE_TITLE });
};

export const fetchStickyNoteRecords = (): StickyNoteRecord[] => {
  const result = window.roamAlphaAPI.q(
    `[:find ?uid ?order ?text
      :where
        [?p :node/title "${PAGE_TITLE}"]
        [?p :block/children ?c]
        [?c :block/uid ?uid]
        [?c :block/order ?order]
        [(get-else $ ?c :block/string "") ?text]]`,
  ) as [string, number, string][];

  return result
    .sort((a, b) => a[1] - b[1])
    .map(([uid, , text]) => ({ uid, text }));
};

/**
 * Maps a raw sticky note record to display metadata.
 * Empty titles default to "Sticky Note" client-side only — we intentionally
 * skip the database write that the old `ensureStickyNoteMeta` performed,
 * to avoid unnecessary Roam API calls at startup. The title is persisted
 * to Roam when the user edits it (via `commitTitle` in the UI).
 */
export const toStickyNoteMeta = ({
  uid,
  text,
}: {
  uid: string;
  text: string;
}): StickyNoteMeta => ({
  titleUid: uid,
  titleText: text.trim() || "Sticky Note",
});

export const mountRoamBlock = ({
  uid,
  el,
  open,
}: {
  uid: string;
  el: HTMLElement;
  open?: boolean;
}): (() => void) => {
  const globalWindow = window as unknown as {
    React?: ReactLike;
    ReactDOM?: ReactDomLike;
    roamAlphaAPI?: { ui?: { react?: RoamReactApi } };
  };
  const React = globalWindow.React;
  const ReactDOM = globalWindow.ReactDOM;
  const Block = globalWindow.roamAlphaAPI?.ui?.react?.Block;
  if (!React || !ReactDOM || !Block) {
    return () => undefined;
  }

  ReactDOM.render(React.createElement(Block, { uid, open }), el);
  return () => {
    ReactDOM.unmountComponentAtNode(el);
  };
};
