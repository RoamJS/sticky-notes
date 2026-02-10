<a href="https://roamjs.com/">
    <img src="https://avatars.githubusercontent.com/u/138642184" alt="RoamJS Logo" title="RoamJS" align="right" height="60" />
</a>

# Sticky Notes

**Quick, ephemeral notes that float on top of your Roam Research graph.** Jot something down, drag it wherever you want, and when you're done—remove it. No clutter, no permanent page unless you want one.

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/RoamJS/sticky-notes)

<video src="https://firebasestorage.googleapis.com/v0/b/firescript-577a2.appspot.com/o/imgs%2Fapp%2Froamjs%2FjVlEuX3hF6.mp4?alt=media" controls muted playsinline width="100%"></video>

## What are Sticky Notes?

Sticky Notes are lightweight notes that sit in a layer above your Roam graph. They're meant for **quick, temporary capture**: ideas you're playing with, reminders for the current session, or scratch space while you work. When you delete a sticky note, it's gone—the block is removed from your graph. No archive, no cleanup later.

## Features

- **Full Roam inside every note** — Each sticky is a real Roam block. Use **tags** `#like-this`, **images**, **embeds**, **links**, and everything else you normally do in Roam.
- **Drag anywhere** — Grab the note by the header bar and drag it anywhere on your screen. Position and size are remembered for your session.
- **Resize** — Drag the corner or edge of a note to make it bigger or smaller.
- **Minimize** — Collapse a note to just its title bar when you want it out of the way but still visible.
- **Ephemeral by design** — Delete a note with the ✕ button and the block is removed from Roam. Perfect for throwaway thoughts and temporary scratch space.

## How to use

1. **Create a sticky note** — Open the command palette (`Ctrl/Cmd + Shift + P`), run **"Sticky Notes: Create Sticky Note"**, and a new note appears.
2. **Move it** — Click and drag the colored header bar to place the note wherever you like.
3. **Edit** — Type in the note as you would in any Roam block. Use `#tags`, `/commands`, images, and links.
4. **Remove it** — Click the **✕** on the note when you're done. The note and its content are deleted from your graph.

Sticky notes are stored under a single Roam page (`roam/js/sticky-note`) so they stay in your graph while they exist, but the extension is built so you can treat them as disposable: create, use, delete.
