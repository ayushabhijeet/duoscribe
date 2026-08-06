# Changelog

## v1.3.0

- Focus either pane full-width instead of the split view — Cmd/Ctrl+Shift+1 for the raw pane, Cmd/Ctrl+Shift+2 for preview, toggle buttons in the toolbar, or via the command palette. Pressing the active one again returns to the split.

## v1.2.0

- Syntax-highlighted fenced code blocks (highlight.js)
- Mermaid diagram rendering for ` ```mermaid ` fenced blocks
- Clickable GFM task list checkboxes that write back to the raw markdown
- Manual light/dark/system theme toggle (independent of OS preference)
- Command palette (Cmd/Ctrl+K) for Save, Find, Close Tab, Toggle Theme, Toggle Outline, jumping between open tabs, Open File/Folder, and Export as HTML/PDF
- Outline / table-of-contents panel (Cmd/Ctrl+Shift+O) — click a heading to jump to it
- Paste an image from the clipboard directly into the editor — it's saved next to the file in an `assets/` folder and linked automatically
- Spellcheck toggle under Edit > Spellcheck (off by default, matching prior behavior)
- "Open Folder..." moved to Cmd/Ctrl+Alt+O to free up Cmd/Ctrl+K and Cmd/Ctrl+Shift+O for the command palette and outline panel
- Automated CI and tagged-release builds via GitHub Actions
- Help > Check for Updates, plus a silent check a few seconds after launch — checks GitHub Releases and prompts if a newer version is out

## v1.1.0

- Draggable, resizable split between the raw and rendered panes (double-click the divider to reset to 50/50)
- Fixed drag-and-drop, which Electron 32 silently broke by removing `File.prototype.path`
- Fixed sidebar folders re-expanding every time a file was clicked
- First public release, under the MIT license
