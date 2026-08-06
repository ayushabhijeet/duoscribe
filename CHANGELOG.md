# Changelog

## v1.2.0

- Syntax-highlighted fenced code blocks (highlight.js)
- Mermaid diagram rendering for ` ```mermaid ` fenced blocks
- Clickable GFM task list checkboxes that write back to the raw markdown
- Manual light/dark/system theme toggle (independent of OS preference)
- Help > Check for Updates, plus a silent check a few seconds after launch — checks GitHub Releases and prompts if a newer version is out

## v1.1.0

- Draggable, resizable split between the raw and rendered panes (double-click the divider to reset to 50/50)
- Fixed drag-and-drop, which Electron 32 silently broke by removing `File.prototype.path`
- Fixed sidebar folders re-expanding every time a file was clicked
- First public release, under the MIT license
