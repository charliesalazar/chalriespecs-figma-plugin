# Selection Specs Generator

`Selection Specs Generator` is a no-build Figma plugin prototype that turns the current selection into implementation-ready specs, Markdown, and structured JSON.

## What it does

- Watches the current Figma selection
- Extracts key layer details for each selected node
- Displays the results in a compact plugin UI
- Lets you copy either Markdown or JSON for handoff, docs, or downstream tooling

## Specs captured today

- Layer name, type, visibility, and lock state
- Position, size, rotation, and opacity
- Constraints and layout sizing
- Auto layout direction, gap, padding, and alignment
- Corner radius
- Fills, strokes, stroke weight, and effects
- Shared Figma style references for fill, stroke, effect, grid, and text styles when present
- Text content and typography details for text layers

## Files

- `manifest.json`: Figma plugin manifest
- `code.js`: plugin runtime that reads the selection and generates specs
- `ui.html`: plugin interface and copy-to-clipboard flow

## Run it in Figma

1. Open the Figma desktop app.
2. Go to `Plugins` -> `Development` -> `Import plugin from manifest...`
3. Select [manifest.json](/Users/carlossalazar/chalriespecs-figma-plugin/manifest.json).
4. Run `Selection Specs Generator` from the Development plugins list.
5. Select layers on the canvas and watch the spec panel update.

## Good next extensions

- Group nested child layers into a component tree
- Flag spacing inconsistencies and missing styles
- Detect design tokens and map raw values to token names
- Add redline overlays or measurements between selected nodes
