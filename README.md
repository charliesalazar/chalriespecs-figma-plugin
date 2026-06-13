# Selection Specs Generator

`Selection Specs Generator` is a no-build Figma development plugin that turns the current selection into implementation-ready specs. It shows the specs in the plugin panel, copies them as Markdown or JSON, and places generated spec annotations directly on the canvas beside the selected layer.

## What it does

- Watches the current Figma selection
- Extracts layer details for selected nodes
- Places or updates a specs card beside a single selected frame or layer
- Adds a visual specs overlay with size, padding, stroke, icon, and text callouts
- Displays the same data in a compact plugin UI
- Copies either Markdown or JSON for handoff, docs, or downstream tooling
- Reports runtime errors in the plugin panel when Figma exposes unexpected node data

## Specs captured

- Layer name, type, visibility, and lock state
- Position, size, rotation, and opacity
- Constraints and layout sizing
- Auto layout direction, gap, padding, alignment, and wrapping
- Corner radius
- Fills, strokes, stroke weight, and effects
- Shared Figma style references for fill, stroke, effect, grid, and text styles
- Text content and typography details for text layers

## Repository files

- `manifest.json`: Figma plugin manifest
- `code.js`: Plugin runtime that reads the selection and creates canvas output
- `ui.html`: Plugin interface and copy-to-clipboard flow

This plugin does not use a build step, package manager, or bundled dependencies.

## Install locally in Figma

1. Open the Figma desktop app.
2. Go to `Plugins` -> `Development` -> `Import plugin from manifest...`
3. Select `manifest.json` from this repository.
4. Run `Selection Specs Generator` from `Plugins` -> `Development`.

## Use the plugin

1. Select one frame or layer on the Figma canvas.
2. Click `Place On Canvas`.
3. The plugin creates or updates:
   - `Specs / <Layer name>`
   - `Visual Specs / <Layer name>`
4. Use `Copy Markdown` or `Copy JSON` when you want the same data outside Figma.

The canvas placement flow expects exactly one selected node. The panel can still preview data for multiple selected layers, but it will not place a single canvas specs card until the selection is narrowed to one node.

## Development workflow

Because this is a no-build plugin, edits to `code.js` and `ui.html` are picked up by rerunning the development plugin.

After changing files:

1. Close the plugin window in Figma.
2. Run `Plugins` -> `Development` -> `Selection Specs Generator` again.
3. If Figma still appears to use old code, re-import `manifest.json`.

Quick syntax check:

```sh
node --check code.js
```

## Troubleshooting

### Plugin still shows the old behavior

Close and rerun the development plugin. Figma can keep a running plugin instance alive, so file edits are not always reflected until the plugin is restarted.

### `Place On Canvas` is disabled

Select exactly one layer or frame. The placement flow needs one target so it can position the specs card and visual overlay beside that node.

### A runtime error appears in the panel

The plugin now surfaces the last Figma runtime error in the status area. Copy the exact `Last error:` text when debugging; it usually points to a specific node property or unsupported selection type.

### Existing specs do not update

Select the original source node, not the generated `Specs / ...` or `Visual Specs / ...` frame. The plugin stores source-node metadata on generated frames so it can update the matching output.

## Current limitations

- Visual overlay callouts are tuned for compact button-like components.
- Icon callouts currently look for a descendant named `pizza icon`.
- The plugin reads raw Figma values; it does not map styles to design token names yet.
- Generated specs are intended for inspection and handoff, not as final production code.

## Good next extensions

- Generalize icon detection beyond `pizza icon`
- Group nested child layers into a component tree
- Flag spacing inconsistencies and missing styles
- Detect design tokens and map raw values to token names
- Add redline overlays or measurements between arbitrary selected nodes
