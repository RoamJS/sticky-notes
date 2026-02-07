import addStyle from "roamjs-components/dom/addStyle";
import runExtension from "roamjs-components/util/runExtension";
import { createBlock, createPage } from "roamjs-components/writes";

type StickyNoteLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
};

type StickyNoteLayouts = Record<string, StickyNoteLayout>;
type BlockChild = {
  uid: string;
  text: string;
};

type StickyNoteMeta = {
  titleUid: string;
  titleText: string;
  contentUids: string[];
};

const PAGE_TITLE = "Roam/js/sticky-note";
const STORAGE_KEY = "roam-sticky-note-layouts";
const COMMAND_LABEL = "Create Sticky Note";
const NOTE_CLASS = "roam-sticky-note";
const NOTE_MINIMIZED_CLASS = "roam-sticky-note--minimized";

const getLayouts = (): StickyNoteLayouts => {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as StickyNoteLayouts;
    return parsed;
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

const fetchBlockChildren = (uid: string): BlockChild[] => {
  const result = window.roamAlphaAPI.q(
    `[:find ?childUid ?text ?order
      :in $ ?uid
      :where
        [?b :block/uid ?uid]
        [?b :block/children ?c]
        [?c :block/uid ?childUid]
        [(get-else $ ?c :block/string "") ?text]
        [?c :block/order ?order]]`,
    uid
  ) as [string, string, number][];
  return result
    .sort((a, b) => a[2] - b[2])
    .map(([childUid, text]) => ({ uid: childUid, text }));
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
  const children = fetchBlockChildren(noteUid);

  if (noteText) {
    return {
      titleUid: noteUid,
      titleText: noteText,
      contentUids: children.map((c) => c.uid),
    };
  }

  const legacyTitleChild = children[0];
  if (legacyTitleChild) {
    return {
      titleUid: legacyTitleChild.uid,
      titleText: legacyTitleChild.text || "Sticky Note",
      contentUids: children.slice(1).map((c) => c.uid),
    };
  }

  window.roamAlphaAPI.updateBlock({
    block: { uid: noteUid, string: "Sticky Note" },
  });
  return {
    titleUid: noteUid,
    titleText: "Sticky Note",
    contentUids: [],
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
  note.classList.toggle(NOTE_MINIMIZED_CLASS, layout.minimized);
};

const updateLayout = (
  layouts: StickyNoteLayouts,
  uid: string,
  next: Partial<StickyNoteLayout>
): void => {
  const current = layouts[uid];
  layouts[uid] = {
    ...(current || defaultLayout(0, window.innerWidth, window.innerHeight)),
    ...next,
  };
  setLayouts(layouts);
};

const createStickyNoteElement = ({
  uid,
  layout,
  layouts,
  meta,
  resizeObservers,
}: {
  uid: string;
  layout: StickyNoteLayout;
  layouts: StickyNoteLayouts;
  meta: StickyNoteMeta;
  resizeObservers: Set<ResizeObserver>;
}): HTMLDivElement => {
  const note = document.createElement("div");
  note.className = NOTE_CLASS;
  note.dataset.uid = uid;
  applyLayout(note, layout);

  const header = document.createElement("div");
  header.className = "roam-sticky-note__header";

  const title = document.createElement("input");
  title.className = "roam-sticky-note__title";
  title.type = "text";
  title.value = meta.titleText || "Sticky Note";
  title.setAttribute("aria-label", "Sticky note title");

  const actions = document.createElement("div");
  actions.className = "roam-sticky-note__actions";

  const minimizeButton = document.createElement("button");
  minimizeButton.type = "button";
  minimizeButton.className = "bp3-button bp3-minimal roam-sticky-note__button";
  minimizeButton.setAttribute(
    "aria-label",
    layout.minimized ? "Expand sticky note" : "Minimize sticky note"
  );
  minimizeButton.textContent = layout.minimized ? "▢" : "–";

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "bp3-button bp3-minimal roam-sticky-note__button";
  deleteButton.setAttribute("aria-label", "Delete sticky note");
  deleteButton.textContent = "✕";

  actions.append(minimizeButton, deleteButton);
  header.append(title, actions);

  const content = document.createElement("div");
  content.className = "roam-sticky-note__content";

  note.append(header, content);

  meta.contentUids.forEach((contentUid) => {
    const blockContainer = document.createElement("div");
    content.append(blockContainer);
    window.roamAlphaAPI.ui.components.renderBlock({
      uid: contentUid,
      el: blockContainer,
    });
  });

  const commitTitle = (): void => {
    const nextTitle = title.value.trim() || "Sticky Note";
    if (title.value !== nextTitle) {
      title.value = nextTitle;
    }
    window.roamAlphaAPI.updateBlock({
      block: { uid: meta.titleUid, string: nextTitle },
    });
  };

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

  const onPointerMove = (event: PointerEvent): void => {
    if (!isDragging) {
      return;
    }
    const x = event.clientX - dragOffsetX;
    const y = event.clientY - dragOffsetY;
    note.style.left = `${x}px`;
    note.style.top = `${y}px`;
    updateLayout(layouts, uid, { x, y });
  };

  const onPointerUp = (): void => {
    if (!isDragging) {
      return;
    }
    isDragging = false;
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
  };

  const onPointerDown = (event: PointerEvent): void => {
    if ((event.target as HTMLElement).closest("button")) {
      return;
    }
    isDragging = true;
    dragOffsetX = event.clientX - note.offsetLeft;
    dragOffsetY = event.clientY - note.offsetTop;
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
    updateLayout(layouts, uid, { minimized: nextMinimized });
  });

  const resizeObserver = new ResizeObserver((entries) => {
    entries.forEach((entry) => {
      if (!(entry.target instanceof HTMLElement)) {
        return;
      }
      if (entry.target.classList.contains(NOTE_MINIMIZED_CLASS)) {
        return;
      }
      updateLayout(layouts, uid, {
        width: Math.round(entry.target.offsetWidth),
        height: Math.round(entry.target.offsetHeight),
      });
    });
  });
  resizeObservers.add(resizeObserver);
  resizeObserver.observe(note);

  deleteButton.addEventListener("click", () => {
    resizeObserver.disconnect();
    resizeObservers.delete(resizeObserver);
    note.remove();
    delete layouts[uid];
    setLayouts(layouts);
    window.roamAlphaAPI.deleteBlock({ block: { uid } });
  });

  return note;
};

export default runExtension(async ({ extensionAPI }) => {
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
      z-index: 1000;
    }

    .${NOTE_CLASS}::after {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: 10px;
      pointer-events: none;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.35);
    }

    .${NOTE_CLASS} .roam-sticky-note__header {
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

    .${NOTE_CLASS} .roam-sticky-note__header:active {
      cursor: grabbing;
    }

    .${NOTE_CLASS} .roam-sticky-note__title {
      font-size: 13px;
      font-weight: 600;
      color: #5a4b1d;
      background: transparent;
      border: none;
      outline: none;
      width: 100%;
      min-width: 0;
      margin-right: 8px;
      padding: 0;
    }

    .${NOTE_CLASS} .roam-sticky-note__title:focus {
      background: rgba(255, 255, 255, 0.55);
      border-radius: 4px;
      padding: 0 4px;
    }

    .${NOTE_CLASS} .roam-sticky-note__actions {
      display: flex;
      gap: 4px;
    }

    .${NOTE_CLASS} .roam-sticky-note__button {
      min-width: 24px;
      height: 24px;
      padding: 0;
      color: #5a4b1d;
    }

    .${NOTE_CLASS} .roam-sticky-note__content {
      padding: 6px 10px 12px;
      flex: 1;
      overflow: auto;
    }

    .${NOTE_MINIMIZED_CLASS} {
      height: auto !important;
      resize: none;
    }

    .${NOTE_MINIMIZED_CLASS} .roam-sticky-note__content {
      display: none;
    }
  `,
    "roam-sticky-note-style"
  );

  const container = document.createElement("div");
  container.id = "roam-sticky-note-container";
  container.style.position = "fixed";
  container.style.left = "0";
  container.style.top = "0";
  container.style.width = "100%";
  container.style.height = "100%";
  container.style.pointerEvents = "none";
  document.body.append(container);

  const layouts = getLayouts();
  const resizeObservers = new Set<ResizeObserver>();
  const pageUid = await ensurePageUid();
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
    });
    container.append(note);
  }
  setLayouts(layouts);

  const createStickyNote = async (): Promise<void> => {
    const uid = await createBlock({
      parentUid: pageUid,
      order: "last",
      node: { text: "Sticky Note" },
    });
    const contentUid = await createBlock({
      parentUid: uid,
      order: 0,
      node: { text: " " },
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
      meta: { titleUid: uid, titleText: "Sticky Note", contentUids: [contentUid] },
      resizeObservers,
    });
    container.append(note);
  };

  await extensionAPI.ui.commandPalette.addCommand({
    label: COMMAND_LABEL,
    callback: createStickyNote,
  });

  return {
    elements: [style],
    commands: [COMMAND_LABEL],
    unload: () => {
      resizeObservers.forEach((observer) => observer.disconnect());
      resizeObservers.clear();
      container.remove();
    },
  };
});
