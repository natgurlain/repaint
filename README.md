# Repaint

Restyle any website with your own CSS: a small, dependency-free browser extension for **Brave** (and any Chromium
browser). Edits show up live in your open tabs, and everything stays on your device.

- **Live editor.** A full-page CSS editor with syntax highlighting, color underlines, line numbers, auto-closing
  braces, Tab / Shift-Tab indenting and autosave. Every keystroke repaints matching open tabs within ~300 ms.
- **Per site or everywhere.** A style applies to a domain and its subdomains (`example.com` also covers
  `docs.example.com`), or to every site with `*`.
- **One-click quick styles.** Dark mode, reading width, calm (no animations), bigger text and no sticky bars, added
  for the current site straight from the popup.
- **Switches everywhere.** Turn single styles on and off, switch Repaint off for one site, or off everywhere. The
  toolbar drop turns gray where Repaint is off, and its badge shows how many styles paint the current tab.
- **Yours to keep.** Search, duplicate, delete, and import or export your styles as JSON.

## Privacy

The original Stylish extension was caught in 2018 sending its users' complete browsing history to its owners' servers.
Repaint has no servers, accounts, analytics or remote code. Styles live in `chrome.storage.local` in your browser and
only leave it when you export them yourself.

## Build

You need [Node.js](https://nodejs.org) 18 or newer. The only packages are TypeScript and the Chrome API type
definitions, used at build time. The extension itself ships plain JavaScript with no runtime dependencies.

```bash
npm install
```

```bash
npm run build
```

This writes the ready-to-load extension to `dist/`.

## Install in Brave

1. Open `brave://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `dist` folder.
4. Pin Repaint: click the puzzle-piece icon in the toolbar, then the pin next to Repaint.
5. Open any site, click the drop and pick a quick style, or press **New style for this site** to write your own.

The same steps work in Chrome (`chrome://extensions`), Edge and other Chromium browsers. After rebuilding, click the
reload arrow on Repaint's card in the extensions page; your styles are kept.

## How it works

| File | Role |
|---|---|
| `src/content.ts` | Runs on every page at `document_start`, injects one `<style>` per matching enabled style, moves them after the page's own styles once it has loaded, and updates them live when storage changes. |
| `src/background.ts` | Keeps each tab's toolbar icon (colored or gray) and badge count in sync. |
| `src/popup.ts` | Toolbar popup: current site, its styles, quick styles, site and global switches. |
| `src/editor.ts` | Full-page editor, list, search, import/export. |
| `src/highlight.ts` | Small lossless CSS tokenizer and highlighter used by the editor. |
| `src/shared.ts` | Data model, site matching, quick styles and DOM helpers. |
| `static/` | HTML, CSS, manifest and icons, copied to `dist/` as they are. |
| `scripts/make-icons.mjs` | Regenerates the toolbar icons (`node scripts/make-icons.mjs`). |

Quick styles are a starting point, not magic: "No sticky bars" and "Reading width" target common markup and may need
a tweak for a particular site. Open the style in the editor and adjust it.

## Author

Made by [@natgurlain](https://x.com/natgurlain). MIT licensed.
