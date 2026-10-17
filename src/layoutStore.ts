import type { OnloadArgs } from "roamjs-components/types";

import { NOTE_MINIMIZED_CLASS, STORAGE_KEY } from "./constants";

export type StickyNoteLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
  rotation: number;
};

export type StickyNoteLayouts = Record<string, StickyNoteLayout>;

const randomRotation = (): number =>
  Math.round((Math.random() * 3 - 1.5) * 10) / 10;

const normalizeLayout = (layout: StickyNoteLayout): StickyNoteLayout => ({
  ...layout,
  rotation: Number.isFinite(layout.rotation)
    ? layout.rotation
    : randomRotation(),
});

export const getLayouts = ({
  extensionSettings,
}: {
  extensionSettings: OnloadArgs["extensionAPI"]["settings"];
}): StickyNoteLayouts => {
  const raw = extensionSettings.get(STORAGE_KEY);
  if (typeof raw !== "string" || !raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as StickyNoteLayouts;
    return Object.fromEntries(
      Object.entries(parsed).map(([uid, layout]) => [
        uid,
        normalizeLayout(layout),
      ]),
    );
  } catch {
    return {};
  }
};

export const setLayouts = ({
  extensionSettings,
  layouts,
}: {
  extensionSettings: OnloadArgs["extensionAPI"]["settings"];
  layouts: StickyNoteLayouts;
}): void => {
  extensionSettings.set(STORAGE_KEY, JSON.stringify(layouts));
};

export const defaultLayout = (
  index: number,
  viewportWidth: number,
  viewportHeight: number,
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

export const applyLayout = (
  note: HTMLElement,
  layout: StickyNoteLayout,
): void => {
  note.style.left = `${layout.x}px`;
  note.style.top = `${layout.y}px`;
  note.style.width = `${layout.width}px`;
  note.style.height = `${layout.height}px`;
  note.style.transform = `rotate(${layout.rotation}deg)`;
  note.classList.toggle(NOTE_MINIMIZED_CLASS, layout.minimized);
};

export const mutateLayout = (
  layouts: StickyNoteLayouts,
  uid: string,
  next: Partial<StickyNoteLayout>,
): void => {
  const current = layouts[uid];
  layouts[uid] = {
    ...(current || defaultLayout(0, window.innerWidth, window.innerHeight)),
    ...next,
  };
};
