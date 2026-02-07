import addStyle from "roamjs-components/dom/addStyle";
import runExtension from "roamjs-components/util/runExtension";
import { createBlock, createPage } from "roamjs-components/writes";

type StickyNoteLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
  rotation: number;
};

type StickyNoteLayouts = Record<string, StickyNoteLayout>;

type StickyNoteMeta = {
  titleUid: string;
  titleText: string;
};

type ReactLike = {
  createElement: (component: unknown, props: Record<string, unknown>) => unknown;
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

const PAGE_TITLE = "roam/js/sticky-note";
const STORAGE_KEY = "roam-sticky-note-layouts";
const COMMAND_LABEL = "Sticky Notes: Create Sticky Note";
const NOTE_CLASS = "roamjs-sticky-note";
const NOTE_MINIMIZED_CLASS = "roamjs-sticky-note--minimized";
const NOTE_DRAGGING_CLASS = "roamjs-sticky-note--dragging";

const logRoamMutationError = ({
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

const randomRotation = (): number =>
  Math.round((Math.random() * 3 - 1.5) * 10) / 10;

const normalizeLayout = (layout: StickyNoteLayout): StickyNoteLayout => ({
  ...layout,
  rotation: Number.isFinite(layout.rotation) ? layout.rotation : randomRotation(),
});

const getLayouts = (): StickyNoteLayouts => {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as StickyNoteLayouts;
    return Object.fromEntries(
      Object.entries(parsed).map(([uid, layout]) => [uid, normalizeLayout(layout)])
    );
  } catch {
    return {};
  }
};

const setLayouts = (layouts: StickyNoteLayouts): void => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts));
};

const getPageUid = (): string | null => {
  const result = window.roamAlphaAPI.q(
    `[:find ?uid :where [?p :node/title "${PAGE_TITLE}"] [?p :block/uid ?uid]]`
  ) as [string][];
  return result.length ? result[0][0] : null;
};

const ensurePageUid = async (): Promise<string> => {
  const existing = getPageUid();
  if (existing) {
    return existing;
  }
  return createPage({ title: PAGE_TITLE });
};

const fetchStickyNoteUids = (): string[] => {
  const result = window.roamAlphaAPI.q(
    `[:find ?uid ?order
      :where
        [?p :node/title "${PAGE_TITLE}"]
        [?p :block/children ?c]
        [?c :block/uid ?uid]
        [?c :block/order ?order]]`
  ) as [string, number][];
  return result
    .sort((a, b) => a[1] - b[1])
    .map((entry) => entry[0]);
};

const fetchBlockText = (uid: string): string => {
  const result = window.roamAlphaAPI.q(
    `[:find ?text
      :in $ ?uid
      :where
        [?b :block/uid ?uid]
        [(get-else $ ?b :block/string "") ?text]]`,
    uid
  ) as [string][];
  return result.length ? result[0][0] : "";
};

const ensureStickyNoteMeta = async (noteUid: string): Promise<StickyNoteMeta> => {
  const noteText = fetchBlockText(noteUid).trim();

  if (noteText) {
    return {
      titleUid: noteUid,
      titleText: noteText,
    };
  }

  try {
    await window.roamAlphaAPI.updateBlock({
      block: { uid: noteUid, string: "Sticky Note" },
    });
  } catch (error) {
    logRoamMutationError({ operation: "updateBlock", uid: noteUid, error });
  }
  return {
    titleUid: noteUid,
    titleText: "Sticky Note",
  };
};

const mountRoamBlock = ({
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

const defaultLayout = (
  index: number,
  viewportWidth: number,
  viewportHeight: number
): StickyNoteLayout => {
  const width = 240;
  const height = 220;
  const offset = 30 * index;
  const x = Math.min(100 + offset, Math.max(20, viewportWidth - width - 20));
  const y = Math.min(120 + offset, Math.max(20, viewportHeight - height - 20));
  return {
    x,
    y,
    width,
    height,
    minimized: false,
    rotation: randomRotation(),
  };
};

const applyLayout = (
  note: HTMLElement,
  layout: StickyNoteLayout
): void => {
  note.style.left = `${layout.x}px`;
  note.style.top = `${layout.y}px`;
  note.style.width = `${layout.width}px`;
  note.style.height = `${layout.height}px`;
  note.style.transform = `rotate(${layout.rotation}deg)`;
  note.classList.toggle(NOTE_MINIMIZED_CLASS, layout.minimized);
};

const mutateLayout = (
  layouts: StickyNoteLayouts,
  uid: string,
  next: Partial<StickyNoteLayout>
): void => {
  const current = layouts[uid];
  layouts[uid] = {
    ...(current || defaultLayout(0, window.innerWidth, window.innerHeight)),
    ...next,
  };
};

const getStickyRenderedIdFromUid = ({
  uid,
  root = document,
}: {
  uid: string;
  root?: ParentNode;
}): string | null => {
  const el = root.querySelector(
    `.roamjs-sticky-note__embedded-root [id^="block-input-"][id$="-${uid}"]`
  ) as HTMLElement | null;
  return el?.id || null;
};

const getStickyWindowIdFromUid = ({
  uid,
  root = document,
}: {
  uid: string;
  root?: ParentNode;
}): string | null => {
  const id = getStickyRenderedIdFromUid({ uid, root });
  if (!id) {
    return null;
  }
  const match = id.match(/^block-input-(.+)-([A-Za-z0-9_-]{9})$/);
  return match ? match[1] : null;
};

const focusStickyRenderedUid = ({
  uid,
  root = document,
}: {
  uid: string;
  root?: ParentNode;
}): boolean => {
  const windowId = getStickyWindowIdFromUid({ uid, root });
  if (!windowId) {
    return false;
  }
  window.roamAlphaAPI.ui.setBlockFocusAndSelection({
    location: {
      "block-uid": uid,
      "window-id": windowId,
    },
  });
  return true;
};

const focusStickyRenderedUidWithRetries = ({
  uid,
  root,
}: {
  uid: string;
  root: ParentNode;
}): void => {
  const timerIds: number[] = [];
  let focused = false;
  [60, 140, 280, 520, 900].forEach((delay) => {
    const timerId = window.setTimeout(() => {
      if (focused) {
        return;
      }
      focused = focusStickyRenderedUid({ uid, root });
      if (focused) {
        timerIds.forEach((id) => {
          if (id !== timerId) {
            window.clearTimeout(id);
          }
        });
      }
    }, delay);
    timerIds.push(timerId);
  });
};

const createStickyNoteElement = ({
  uid,
  layout,
  layouts,
  meta,
  resizeObservers,
  blockUnmounts,
}: {
  uid: string;
  layout: StickyNoteLayout;
  layouts: StickyNoteLayouts;
  meta: StickyNoteMeta;
  resizeObservers: Set<ResizeObserver>;
  blockUnmounts: Set<() => void>;
}): HTMLDivElement => {
  const note = document.createElement("div");
  note.className = NOTE_CLASS;
  note.dataset.uid = uid;
  applyLayout(note, layout);

  const header = document.createElement("div");
  header.className = "roamjs-sticky-note__header";

  const title = document.createElement("input");
  title.className = "roamjs-sticky-note__title";
  title.type = "text";
  title.value = meta.titleText || "Sticky Note";
  title.setAttribute("aria-label", "Sticky note title");
  const measureTitleWidth = (value: string): number => {
    const text = value.trim() || "Sticky Note";
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return Math.max(36, text.length * 8);
    }
    const computed = window.getComputedStyle(title);
    ctx.font = `${computed.fontWeight} ${computed.fontSize} ${computed.fontFamily}`;
    return Math.max(36, Math.ceil(ctx.measureText(text).width) + 10);
  };
  const syncTitleWidth = (): void => {
    title.style.width = `${measureTitleWidth(title.value)}px`;
  };
  syncTitleWidth();

  const actions = document.createElement("div");
  actions.className = "roamjs-sticky-note__actions";

  const minimizeButton = document.createElement("button");
  minimizeButton.type = "button";
  minimizeButton.className = "bp3-button bp3-minimal roamjs-sticky-note__button";
  minimizeButton.setAttribute(
    "aria-label",
    layout.minimized ? "Expand sticky note" : "Minimize sticky note"
  );
  minimizeButton.textContent = layout.minimized ? "▢" : "–";

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "bp3-button bp3-minimal roamjs-sticky-note__button";
  deleteButton.setAttribute("aria-label", "Delete sticky note");
  deleteButton.textContent = "✕";

  actions.append(minimizeButton, deleteButton);
  header.append(title, actions);

  const content = document.createElement("div");
  content.className = "roamjs-sticky-note__content";

  note.append(header, content);
  syncTitleWidth();
  window.requestAnimationFrame(syncTitleWidth);
  window.setTimeout(syncTitleWidth, 80);

  const blockContainer = document.createElement("div");
  blockContainer.className = "roamjs-sticky-note__embedded-root";
  content.append(blockContainer);
  const unmountBlock = mountRoamBlock({ uid, el: blockContainer, open: true });
  const hideEmbeddedRootTitle = (): void => {
    const rootMain = blockContainer.querySelector(
      ".rm-level-0 > .rm-block-main, .rm-block-main"
    ) as HTMLElement | null;
    if (rootMain) {
      rootMain.style.display = "none";
    }
  };
  hideEmbeddedRootTitle();
  const embedObserver = new MutationObserver(() => hideEmbeddedRootTitle());
  embedObserver.observe(blockContainer, { childList: true, subtree: true });
  const cleanupEmbeddedBlock = (): void => {
    embedObserver.disconnect();
    unmountBlock();
  };
  blockUnmounts.add(cleanupEmbeddedBlock);

  const commitTitle = (): void => {
    const nextTitle = title.value.trim() || "Sticky Note";
    if (title.value !== nextTitle) {
      title.value = nextTitle;
    }
    syncTitleWidth();
    void window.roamAlphaAPI
      .updateBlock({
        block: { uid: meta.titleUid, string: nextTitle },
      })
      .catch((error) => {
        logRoamMutationError({
          operation: "updateBlock",
          uid: meta.titleUid,
          error,
        });
      });
  };

  title.addEventListener("input", syncTitleWidth);
  title.addEventListener("blur", commitTitle);
  title.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      title.blur();
    }
  });

  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let isDragging = false;
  let previousBodyUserSelect = "";
  let resizePersistTimeout: number | null = null;

  const scheduleLayoutPersistence = (): void => {
    if (resizePersistTimeout) {
      window.clearTimeout(resizePersistTimeout);
    }
    resizePersistTimeout = window.setTimeout(() => {
      resizePersistTimeout = null;
      setLayouts(layouts);
    }, 250);
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!isDragging) {
      return;
    }
    const x = event.clientX - dragOffsetX;
    const y = event.clientY - dragOffsetY;
    note.style.left = `${x}px`;
    note.style.top = `${y}px`;
    mutateLayout(layouts, uid, { x, y });
  };

  const onPointerUp = (): void => {
    if (!isDragging) {
      return;
    }
    isDragging = false;
    note.classList.remove(NOTE_DRAGGING_CLASS);
    document.body.style.userSelect = previousBodyUserSelect;
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
    setLayouts(layouts);
  };

  const onPointerDown = (event: PointerEvent): void => {
    const target = event.target as HTMLElement;
    if (target.closest("button, input, textarea, [contenteditable='true']")) {
      return;
    }
    isDragging = true;
    dragOffsetX = event.clientX - note.offsetLeft;
    dragOffsetY = event.clientY - note.offsetTop;
    note.classList.add(NOTE_DRAGGING_CLASS);
    previousBodyUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  };

  header.addEventListener("pointerdown", onPointerDown);

  minimizeButton.addEventListener("click", () => {
    const nextMinimized = !note.classList.contains(NOTE_MINIMIZED_CLASS);
    note.classList.toggle(NOTE_MINIMIZED_CLASS, nextMinimized);
    minimizeButton.textContent = nextMinimized ? "▢" : "–";
    minimizeButton.setAttribute(
      "aria-label",
      nextMinimized ? "Expand sticky note" : "Minimize sticky note"
    );
    mutateLayout(layouts, uid, { minimized: nextMinimized });
    setLayouts(layouts);
    window.requestAnimationFrame(() => {
      const activeElement = document.activeElement as HTMLElement | null;
      activeElement?.blur();
    });
  });

  const resizeObserver = new ResizeObserver((entries) => {
    entries.forEach((entry) => {
      if (!(entry.target instanceof HTMLElement)) {
        return;
      }
      if (entry.target.classList.contains(NOTE_MINIMIZED_CLASS)) {
        return;
      }
      mutateLayout(layouts, uid, {
        width: Math.round(entry.target.offsetWidth),
        height: Math.round(entry.target.offsetHeight),
      });
      scheduleLayoutPersistence();
    });
  });
  resizeObservers.add(resizeObserver);
  resizeObserver.observe(note);

  deleteButton.addEventListener("click", async () => {
    deleteButton.disabled = true;
    try {
      await window.roamAlphaAPI.deleteBlock({ block: { uid } });
    } catch (error) {
      deleteButton.disabled = false;
      logRoamMutationError({ operation: "deleteBlock", uid, error });
      return;
    }

    if (resizePersistTimeout) {
      window.clearTimeout(resizePersistTimeout);
      resizePersistTimeout = null;
    }
    resizeObserver.disconnect();
    resizeObservers.delete(resizeObserver);
    cleanupEmbeddedBlock();
    blockUnmounts.delete(cleanupEmbeddedBlock);
    note.remove();
    delete layouts[uid];
    setLayouts(layouts);
  });

  return note;
};

export default runExtension(async ({ extensionAPI }) => {
  const stickyNoteDebug = window as unknown as {
    roamjsStickyNoteDebug?: {
      getStickyRenderedIdFromUid: typeof getStickyRenderedIdFromUid;
      getStickyWindowIdFromUid: typeof getStickyWindowIdFromUid;
      focusStickyRenderedUid: typeof focusStickyRenderedUid;
      focusStickyRenderedUidWithRetries: typeof focusStickyRenderedUidWithRetries;
    };
  };
  stickyNoteDebug.roamjsStickyNoteDebug = {
    getStickyRenderedIdFromUid,
    getStickyWindowIdFromUid,
    focusStickyRenderedUid,
    focusStickyRenderedUidWithRetries,
  };

  extensionAPI.settings.panel.create({
    tabTitle: "Extension",
    settings: [
      {
        id: "enabled",
        name: "Enable",
        description: "Turn the extension on or off",
        action: { type: "switch" },
      },
    ],
  });

  const enabled = extensionAPI.settings.get("enabled") as boolean | undefined;
  if (enabled === false) return;

  const style = addStyle(
    `
    .${NOTE_CLASS} {
      position: absolute;
      background: #f8e88b;
      border: 1px solid #e5d671;
      border-radius: 10px;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
      display: flex;
      flex-direction: column;
      resize: both;
      overflow: hidden;
      min-width: 180px;
      min-height: 160px;
      pointer-events: auto;
      z-index: 1;
      transition: box-shadow 120ms ease;
      transform-origin: center center;
    }

    .${NOTE_DRAGGING_CLASS} {
      box-shadow: 0 14px 28px rgba(0, 0, 0, 0.32);
    }

    .${NOTE_CLASS}::after {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: 10px;
      pointer-events: none;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.35);
    }

    .${NOTE_CLASS} .roamjs-sticky-note__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 10px;
      cursor: grab;
      user-select: none;
      font-weight: 600;
      color: #5a4b1d;
      background: rgba(255, 255, 255, 0.4);
    }

    .${NOTE_CLASS} .roamjs-sticky-note__header:active {
      cursor: grabbing;
    }

    .${NOTE_CLASS} .roamjs-sticky-note__title {
      font-size: 13px;
      font-weight: 600;
      color: #5a4b1d;
      background: transparent;
      border: none;
      outline: none;
      flex: 0 0 auto;
      min-width: 0;
      max-width: calc(100% - 60px);
      margin-right: 8px;
      padding: 0 1px;
      box-sizing: border-box;
    }

    .${NOTE_CLASS} .roamjs-sticky-note__title:focus {
      background: rgba(255, 255, 255, 0.55);
      border-radius: 4px;
    }

    .${NOTE_CLASS} .roamjs-sticky-note__actions {
      display: flex;
      gap: 4px;
    }

    .${NOTE_CLASS} .roamjs-sticky-note__button {
      min-width: 24px;
      height: 24px;
      padding: 0;
      color: #5a4b1d;
    }

    .${NOTE_CLASS} .roamjs-sticky-note__button:focus,
    .${NOTE_CLASS} .roamjs-sticky-note__button:focus-visible,
    .${NOTE_CLASS} .roamjs-sticky-note__button.bp3-active,
    .${NOTE_CLASS} .roamjs-sticky-note__button.bp3-active:focus {
      outline: none !important;
      box-shadow: none !important;
    }

    .${NOTE_CLASS} .roamjs-sticky-note__content {
      padding: 6px 10px 12px;
      flex: 1;
      overflow: auto;
    }

    .${NOTE_CLASS} .roamjs-sticky-note__embedded-root {
      width: 100%;
      min-width: 0;
    }

    .${NOTE_CLASS} .roamjs-sticky-note__embedded-root > .roam-block-container {
      width: 100%;
      min-width: 0;
    }

    .${NOTE_CLASS} .roamjs-sticky-note__embedded-root > .roam-block-container > .rm-block-main {
      display: none;
    }

    .${NOTE_CLASS} .roamjs-sticky-note__embedded-root .roam-block-container > .rm-block-children.rm-level-1 {
      margin-left: 0 !important;
    }

    .${NOTE_CLASS} .roamjs-sticky-note__embedded-root .roam-block-container,
    .${NOTE_CLASS} .roamjs-sticky-note__embedded-root .rm-level-0,
    .${NOTE_CLASS} .roamjs-sticky-note__embedded-root .rm-block-main,
    .${NOTE_CLASS} .roamjs-sticky-note__embedded-root .roam-block {
      width: 100%;
      min-width: 0;
      max-width: 100%;
    }

    .${NOTE_CLASS} .roamjs-sticky-note__embedded-root .rm-block-separator {
      display: none;
    }

    .${NOTE_CLASS} .roamjs-sticky-note__embedded-root .rm-multibar {
      display: none;
    }

    .${NOTE_MINIMIZED_CLASS} {
      height: auto !important;
      min-height: 0 !important;
      resize: none;
    }

    .${NOTE_MINIMIZED_CLASS} .roamjs-sticky-note__content {
      display: none;
    }
  `,
    "roamjs-sticky-note-style"
  );

  const container = document.createElement("div");
  container.id = "roamjs-sticky-note-container";
  container.style.position = "fixed";
  container.style.left = "0";
  container.style.top = "0";
  container.style.width = "100%";
  container.style.height = "100%";
  container.style.pointerEvents = "none";
  container.style.zIndex = "2147483000";
  document.body.append(container);

  const layouts = getLayouts();
  const resizeObservers = new Set<ResizeObserver>();
  const blockUnmounts = new Set<() => void>();
  await ensurePageUid();
  const existingUids = fetchStickyNoteUids();

  for (const [index, uid] of existingUids.entries()) {
    const meta = await ensureStickyNoteMeta(uid);
    const layout =
      layouts[uid] ||
      defaultLayout(index, window.innerWidth, window.innerHeight);
    layouts[uid] = layout;
    const note = createStickyNoteElement({
      uid,
      layout,
      layouts,
      meta,
      resizeObservers,
      blockUnmounts,
    });
    container.append(note);
  }
  for (const key of Object.keys(layouts)) {
    if (!existingUids.includes(key)) {
      delete layouts[key];
    }
  }
  setLayouts(layouts);

  const createStickyNote = async (): Promise<void> => {
    const pageUid = await ensurePageUid();
    const uid = await createBlock({
      parentUid: pageUid,
      order: "last",
      node: { text: "Sticky Note" },
    });
    const firstContentUid = await createBlock({
      parentUid: uid,
      order: 0,
      node: { text: "" },
    });
    const layout = defaultLayout(
      Object.keys(layouts).length,
      window.innerWidth,
      window.innerHeight
    );
    layouts[uid] = layout;
    setLayouts(layouts);
    const note = createStickyNoteElement({
      uid,
      layout,
      layouts,
      meta: { titleUid: uid, titleText: "Sticky Note" },
      resizeObservers,
      blockUnmounts,
    });
    container.append(note);
    focusStickyRenderedUidWithRetries({ uid: firstContentUid, root: note });
  };

  await extensionAPI.ui.commandPalette.addCommand({
    label: COMMAND_LABEL,
    callback: createStickyNote,
  });

  return {
    elements: [style],
    commands: [COMMAND_LABEL],
    unload: () => {
      delete stickyNoteDebug.roamjsStickyNoteDebug;
      resizeObservers.forEach((observer) => observer.disconnect());
      resizeObservers.clear();
      blockUnmounts.forEach((unmount) => unmount());
      blockUnmounts.clear();
      container.remove();
    },
  };
});
