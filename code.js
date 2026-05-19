figma.showUI(__html__, {
  width: 440,
  height: 700,
  themeColors: true
});

// These keys let the plugin recognize spec cards it created earlier so it can
// update them instead of creating duplicates on every run.
const SPEC_CARD_ROLE = "spec-card";
// Shared plugin data needs a namespace plus a key. We keep both values short
// because they are just lookup labels stored on the generated card node.
const SPEC_CARD_NAMESPACE = "selection_specs_generator";
const SPEC_CARD_ROLE_KEY = "role";
const SPEC_CARD_SOURCE_KEY = "source-node-id";
const SPEC_CARD_WIDTH = 320;
const SPEC_CARD_GAP = 64;
const SPEC_CARD_PADDING = 16;

function round(value) {
  return Math.round(value * 100) / 100;
}

function isMixed(value) {
  return value === figma.mixed;
}

function formatPercent(value) {
  return `${round(value * 100)}%`;
}

function formatNumber(value) {
  return typeof value === "number" ? `${round(value)}` : "n/a";
}

function formatLength(value) {
  return typeof value === "number" ? `${round(value)} px` : "mixed";
}

// Figma exposes shared styles by id; this resolves the id into something
// human-readable so the spec output can reference the actual style name.
function getStyleReference(styleId) {
  if (!styleId || styleId === figma.mixed) {
    return null;
  }

  const style = figma.getStyleById(styleId);
  if (!style) {
    return {
      id: styleId,
      name: "Unknown style"
    };
  }

  return {
    id: style.id,
    key: style.key,
    name: style.name,
    type: style.type
  };
}

function rgbToHex(color) {
  const toChannel = (channel) =>
    Math.round(channel * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return `#${toChannel(color.r)}${toChannel(color.g)}${toChannel(color.b)}`;
}

function describePaint(paint) {
  if (!paint || paint.visible === false) {
    return null;
  }

  if (paint.type === "SOLID") {
    const alpha = typeof paint.opacity === "number" ? ` @ ${formatPercent(paint.opacity)}` : "";
    return `Solid ${rgbToHex(paint.color)}${alpha}`;
  }

  if (paint.type === "IMAGE") {
    const scaleMode = paint.scaleMode ? ` (${paint.scaleMode.toLowerCase()})` : "";
    return `Image fill${scaleMode}`;
  }

  if (paint.type === "EMOJI") {
    return "Emoji fill";
  }

  if (paint.type === "VIDEO") {
    return "Video fill";
  }

  if (paint.type.indexOf("GRADIENT_") === 0) {
    const stops = paint.gradientStops
      .map((stop) => `${rgbToHex(stop.color)} ${round(stop.position * 100)}%`)
      .join(", ");
    return `${paint.type.replace("GRADIENT_", "Gradient ").toLowerCase()} (${stops})`;
  }

  return paint.type;
}

function describePaintList(paints) {
  if (!Array.isArray(paints) || paints.length === 0) {
    return "None";
  }

  const visiblePaints = paints.map(describePaint).filter(Boolean);
  return visiblePaints.length ? visiblePaints.join(" | ") : "None";
}

function formatBoxShadowColor(color, opacity) {
  const red = Math.round(color.r * 255);
  const green = Math.round(color.g * 255);
  const blue = Math.round(color.b * 255);
  const alpha = round((typeof opacity === "number" ? opacity : 1) * 100) / 100;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function describeEffects(effects) {
  if (!Array.isArray(effects) || effects.length === 0) {
    return "None";
  }

  const visibleEffects = effects
    .filter((effect) => effect.visible !== false)
    .map((effect) => {
      if (effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW") {
        return `${effect.type.toLowerCase().replace(/_/g, " ")} ${round(effect.offset.x)}, ${round(effect.offset.y)}, blur ${round(effect.radius)}, spread ${round(effect.spread || 0)}, ${formatBoxShadowColor(effect.color, effect.color.a)}`;
      }

      if (effect.type === "LAYER_BLUR" || effect.type === "BACKGROUND_BLUR") {
        return `${effect.type.toLowerCase().replace(/_/g, " ")} ${round(effect.radius)}`;
      }

      return effect.type;
    });

  return visibleEffects.length ? visibleEffects.join(" | ") : "None";
}

function describeConstraints(node) {
  if (!("constraints" in node) || !node.constraints) {
    return "n/a";
  }

  return `${node.constraints.horizontal} / ${node.constraints.vertical}`;
}

function describeLayoutSizing(node) {
  const parts = [];

  if ("layoutSizingHorizontal" in node) {
    parts.push(`horizontal ${node.layoutSizingHorizontal.toLowerCase()}`);
  }

  if ("layoutSizingVertical" in node) {
    parts.push(`vertical ${node.layoutSizingVertical.toLowerCase()}`);
  }

  if ("layoutAlign" in node && node.layoutAlign) {
    parts.push(`align ${node.layoutAlign.toLowerCase()}`);
  }

  if ("layoutGrow" in node) {
    parts.push(`grow ${node.layoutGrow}`);
  }

  return parts.length ? parts.join(" | ") : "n/a";
}

function describeAutoLayout(node) {
  if (!("layoutMode" in node) || node.layoutMode === "NONE") {
    return "None";
  }

  const axis = node.layoutMode === "HORIZONTAL" ? "Horizontal" : "Vertical";
  const padding = [node.paddingTop, node.paddingRight, node.paddingBottom, node.paddingLeft]
    .map((value) => round(value))
    .join(" / ");
  const alignment = `${node.primaryAxisAlignItems.toLowerCase()} / ${node.counterAxisAlignItems.toLowerCase()}`;
  const gap = round(node.itemSpacing);
  const wrap = "layoutWrap" in node ? node.layoutWrap.toLowerCase() : "no-wrap";

  return `${axis}, gap ${gap}, padding ${padding}, align ${alignment}, ${wrap}`;
}

function describeCornerRadius(node) {
  if ("topLeftRadius" in node && "topRightRadius" in node && "bottomRightRadius" in node && "bottomLeftRadius" in node) {
    const values = [node.topLeftRadius, node.topRightRadius, node.bottomRightRadius, node.bottomLeftRadius].map((value) => round(value));
    if (values.every((value) => value === values[0])) {
      return `${values[0]} px`;
    }

    return values.join(" / ") + " px";
  }

  if ("cornerRadius" in node) {
    return isMixed(node.cornerRadius) ? "mixed" : `${round(node.cornerRadius)} px`;
  }

  return "n/a";
}

function describeText(node) {
  if (node.type !== "TEXT") {
    return null;
  }

  const fontName = isMixed(node.fontName)
    ? "mixed"
    : `${node.fontName.family} ${node.fontName.style}`;
  const fontSize = isMixed(node.fontSize) ? "mixed" : `${round(node.fontSize)} px`;
  const lineHeight =
    isMixed(node.lineHeight) || node.lineHeight === figma.mixed
      ? "mixed"
      : node.lineHeight.unit === "AUTO"
        ? "auto"
        : `${round(node.lineHeight.value)} ${node.lineHeight.unit.toLowerCase()}`;
  const letterSpacing =
    isMixed(node.letterSpacing) || node.letterSpacing === figma.mixed
      ? "mixed"
      : `${round(node.letterSpacing.value)} ${node.letterSpacing.unit.toLowerCase()}`;

  return {
    content: node.characters,
    fontName,
    fontSize,
    lineHeight,
    letterSpacing,
    textCase: node.textCase.toLowerCase(),
    textDecoration: node.textDecoration.toLowerCase(),
    horizontalAlign: node.textAlignHorizontal.toLowerCase(),
    verticalAlign: node.textAlignVertical.toLowerCase()
  };
}

// Different node types expose different style ids, so this normalizes them
// into one object that downstream formatters can read consistently.
function describeStyleRefs(node) {
  const styles = {};

  if ("fillStyleId" in node) {
    styles.fill = getStyleReference(node.fillStyleId);
  }

  if ("strokeStyleId" in node) {
    styles.stroke = getStyleReference(node.strokeStyleId);
  }

  if ("effectStyleId" in node) {
    styles.effect = getStyleReference(node.effectStyleId);
  }

  if ("gridStyleId" in node) {
    styles.grid = getStyleReference(node.gridStyleId);
  }

  if (node.type === "TEXT" && "textStyleId" in node) {
    styles.text = getStyleReference(node.textStyleId);
  }

  return styles;
}

function buildNodePath(node) {
  const names = [];
  let current = node;

  while (current && current.type !== "PAGE" && current.parent) {
    names.unshift(current.name);
    current = current.parent;
  }

  return names.join(" / ");
}

// This is the core normalization step: raw Figma node data becomes one stable
// spec object that both the UI panel and the on-canvas card can reuse.
function collectNodeSpec(node, index) {
  const spec = {
    id: node.id,
    order: index + 1,
    name: node.name,
    path: buildNodePath(node),
    type: node.type,
    visible: node.visible,
    locked: "locked" in node ? node.locked : false,
    width: "width" in node ? round(node.width) : null,
    height: "height" in node ? round(node.height) : null,
    x: "x" in node ? round(node.x) : null,
    y: "y" in node ? round(node.y) : null,
    rotation: "rotation" in node ? round(node.rotation) : null,
    opacity: "opacity" in node ? round(node.opacity) : 1,
    constraints: describeConstraints(node),
    sizing: describeLayoutSizing(node),
    autoLayout: describeAutoLayout(node),
    cornerRadius: describeCornerRadius(node),
    fills: "fills" in node ? describePaintList(node.fills) : "n/a",
    strokes: "strokes" in node ? describePaintList(node.strokes) : "n/a",
    strokeWeight: "strokeWeight" in node ? formatLength(node.strokeWeight) : "n/a",
    effects: "effects" in node ? describeEffects(node.effects) : "n/a",
    styles: describeStyleRefs(node),
    text: describeText(node)
  };

  return spec;
}

function formatStyleLine(label, styleRef) {
  if (!styleRef) {
    return `- ${label}: none`;
  }

  return `- ${label}: ${styleRef.name} (${styleRef.id})`;
}

function buildMarkdown(layers) {
  if (layers.length === 0) {
    return [
      "# Selection Specs",
      "",
      "Select one or more layers in Figma to generate specs.",
      "",
      "Suggested next step:",
      "- Select a component, frame, or text layer and reopen or refresh the plugin."
    ].join("\n");
  }

  const lines = [
    "# Selection Specs",
    "",
    `Generated: ${new Date().toLocaleString()}`,
    `Selected layers: ${layers.length}`,
    ""
  ];

  for (const layer of layers) {
    lines.push(`## ${layer.order}. ${layer.name}`);
    lines.push(`- Type: ${layer.type}`);
    lines.push(`- Path: ${layer.path}`);
    lines.push(`- Visible: ${layer.visible ? "Yes" : "No"}`);
    lines.push(`- Locked: ${layer.locked ? "Yes" : "No"}`);
    lines.push(`- Position: x ${formatNumber(layer.x)}, y ${formatNumber(layer.y)}`);
    lines.push(`- Size: ${formatNumber(layer.width)} x ${formatNumber(layer.height)} px`);
    lines.push(`- Rotation: ${formatNumber(layer.rotation)} deg`);
    lines.push(`- Opacity: ${formatPercent(layer.opacity)}`);
    lines.push(`- Constraints: ${layer.constraints}`);
    lines.push(`- Layout sizing: ${layer.sizing}`);
    lines.push(`- Auto layout: ${layer.autoLayout}`);
    lines.push(`- Corner radius: ${layer.cornerRadius}`);
    lines.push(`- Fills: ${layer.fills}`);
    lines.push(`- Strokes: ${layer.strokes}`);
    lines.push(`- Stroke weight: ${layer.strokeWeight}`);
    lines.push(`- Effects: ${layer.effects}`);
    lines.push(formatStyleLine("Fill style", layer.styles.fill));
    lines.push(formatStyleLine("Stroke style", layer.styles.stroke));
    lines.push(formatStyleLine("Effect style", layer.styles.effect));
    lines.push(formatStyleLine("Grid style", layer.styles.grid));

    if (layer.text) {
      lines.push(`- Text content: "${layer.text.content}"`);
      lines.push(`- Text font: ${layer.text.fontName}`);
      lines.push(`- Text size: ${layer.text.fontSize}`);
      lines.push(`- Line height: ${layer.text.lineHeight}`);
      lines.push(`- Letter spacing: ${layer.text.letterSpacing}`);
      lines.push(`- Text case: ${layer.text.textCase}`);
      lines.push(`- Text decoration: ${layer.text.textDecoration}`);
      lines.push(`- Text align: ${layer.text.horizontalAlign} / ${layer.text.verticalAlign}`);
      lines.push(formatStyleLine("Text style", layer.styles.text));
    }

    lines.push("");
  }

  return lines.join("\n");
}

function buildJsonPayload(layers, generatedAt) {
  return {
    generatedAt,
    selectedCount: layers.length,
    selection: layers
  };
}

// The canvas placement flow only makes sense for exactly one selected node.
// The UI uses this state both to enable/disable the button and to explain why.
function getSelectionState() {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    return {
      canPlace: false,
      message: "Select a single frame or layer to place specs beside it."
    };
  }

  if (selection.length > 1) {
    return {
      canPlace: false,
      message: "Select exactly one frame or layer to place a single specs card."
    };
  }

  const target = selection[0];

  if (!("width" in target) || !("height" in target)) {
    return {
      canPlace: false,
      message: `Selection type ${target.type} does not expose frame bounds for canvas specs.`
    };
  }

  return {
    canPlace: true,
    message: `Ready to place specs beside "${target.name}".`,
    target
  };
}

function getCanvasPosition(node) {
  return {
    x: round(node.absoluteTransform[0][2]),
    y: round(node.absoluteTransform[1][2])
  };
}

function truncate(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}...`;
}

function formatStyleRef(styleRef) {
  return styleRef ? styleRef.name : "none";
}

// The on-canvas card is intentionally shorter than the full panel output so it
// stays readable next to the frame instead of turning into a giant document.
function buildCanvasSpecLines(spec) {
  const lines = [
    `Type: ${spec.type}`,
    `Size: ${formatNumber(spec.width)} x ${formatNumber(spec.height)} px`,
    `Position: ${formatNumber(spec.x)}, ${formatNumber(spec.y)} px`,
    `Radius: ${spec.cornerRadius}`,
    `Fills: ${spec.fills}`,
    `Strokes: ${spec.strokes}`,
    `Effects: ${spec.effects}`,
    `Auto layout: ${spec.autoLayout}`,
    `Fill style: ${formatStyleRef(spec.styles.fill)}`,
    `Stroke style: ${formatStyleRef(spec.styles.stroke)}`,
    `Effect style: ${formatStyleRef(spec.styles.effect)}`
  ];

  if (spec.text) {
    lines.push(`Text: ${truncate(spec.text.content, 120)}`);
    lines.push(`Typography: ${spec.text.fontName}, ${spec.text.fontSize}, ${spec.text.lineHeight}`);
    lines.push(`Text style: ${formatStyleRef(spec.styles.text)}`);
  }

  return lines;
}

// Figma requires fonts to be loaded before text nodes can be edited.
async function createTextBlock(characters, options) {
  const text = figma.createText();
  await figma.loadFontAsync(text.fontName);
  text.fontSize = options.fontSize;
  text.characters = characters;
  text.fills = options.fills;
  text.textAutoResize = "HEIGHT";
  text.resize(options.width, Math.max(text.height, 16));

  if (options.letterSpacing) {
    text.letterSpacing = options.letterSpacing;
  }

  if (options.textCase) {
    text.textCase = options.textCase;
  }

  return text;
}

// Shared plugin data works in local development without a published plugin id.
// We only use it to connect a selected frame to its generated spec card.
function findExistingSpecCard(sourceNodeId) {
  // `findOne` scans the current page and returns the first node that matches.
  // We look for a frame we previously marked as a spec card for this source node.
  const existing = figma.currentPage.findOne((node) => {
    return (
      node.getSharedPluginData(SPEC_CARD_NAMESPACE, SPEC_CARD_ROLE_KEY) === SPEC_CARD_ROLE &&
      node.getSharedPluginData(SPEC_CARD_NAMESPACE, SPEC_CARD_SOURCE_KEY) === sourceNodeId
    );
  });

  return existing && existing.type === "FRAME" ? existing : null;
}

// This either creates a new card or rebuilds the existing one in place so the
// visual spec stays synced with the latest selected-frame data.
async function upsertCanvasSpecCard(target) {
  const spec = collectNodeSpec(target, 0);
  const existingCard = findExistingSpecCard(target.id);
  const card = existingCard || figma.createFrame();
  const innerWidth = SPEC_CARD_WIDTH - SPEC_CARD_PADDING * 2;
  const origin = getCanvasPosition(target);
  const eyebrow = await createTextBlock("LIVE SPECS", {
    width: innerWidth,
    fontSize: 11,
    fills: [{ type: "SOLID", color: { r: 0.055, g: 0.486, b: 0.4 } }],
    letterSpacing: { unit: "PERCENT", value: 14 },
    textCase: "UPPER"
  });
  const title = await createTextBlock(spec.name, {
    width: innerWidth,
    fontSize: 18,
    fills: [{ type: "SOLID", color: { r: 0.063, g: 0.165, b: 0.165 } }]
  });
  const body = await createTextBlock(buildCanvasSpecLines(spec).join("\n"), {
    width: innerWidth,
    fontSize: 12,
    fills: [{ type: "SOLID", color: { r: 0.224, g: 0.31, b: 0.302 } }]
  });

  for (const child of [...card.children]) {
    child.remove();
  }

  card.name = `Specs / ${spec.name}`;
  // Mark the card with shared data so future runs can find and update it.
  card.setSharedPluginData(SPEC_CARD_NAMESPACE, SPEC_CARD_ROLE_KEY, SPEC_CARD_ROLE);
  card.setSharedPluginData(SPEC_CARD_NAMESPACE, SPEC_CARD_SOURCE_KEY, target.id);
  card.fills = [{ type: "SOLID", color: { r: 0.985, g: 0.968, b: 0.929 } }];
  card.strokes = [{ type: "SOLID", color: { r: 0.839, g: 0.882, b: 0.867 } }];
  card.strokeWeight = 1;
  card.cornerRadius = 18;
  card.effects = [
    {
      type: "DROP_SHADOW",
      color: { r: 0.071, g: 0.145, b: 0.133, a: 0.12 },
      offset: { x: 0, y: 12 },
      radius: 24,
      spread: 0,
      visible: true,
      blendMode: "NORMAL"
    }
  ];
  card.clipsContent = false;

  card.appendChild(eyebrow);
  card.appendChild(title);
  card.appendChild(body);

  eyebrow.x = SPEC_CARD_PADDING;
  eyebrow.y = SPEC_CARD_PADDING;
  title.x = SPEC_CARD_PADDING;
  title.y = eyebrow.y + eyebrow.height + 8;
  body.x = SPEC_CARD_PADDING;
  body.y = title.y + title.height + 12;

  card.resize(SPEC_CARD_WIDTH, Math.ceil(body.y + body.height + SPEC_CARD_PADDING));
  card.x = origin.x + target.width + SPEC_CARD_GAP;
  card.y = origin.y;

  figma.currentPage.appendChild(card);
  figma.viewport.scrollAndZoomIntoView([target, card]);

  return card;
}

// The plugin UI is a read-only view of the current selection state. Every time
// selection changes or the user refreshes, we send a fresh payload to the UI.
function sendSelectionSpecs() {
  const selectionState = getSelectionState();
  const selection = figma.currentPage.selection;
  const layers = selection.map(collectNodeSpec);
  const generatedAt = new Date().toISOString();

  figma.ui.postMessage({
    type: "selection-specs",
    payload: {
      generatedAt,
      selectedCount: layers.length,
      layers,
      markdown: buildMarkdown(layers),
      json: JSON.stringify(buildJsonPayload(layers, generatedAt), null, 2),
      canPlace: selectionState.canPlace,
      placeMessage: selectionState.message
    }
  });
}

figma.on("selectionchange", () => {
  sendSelectionSpecs();

  const selectionState = getSelectionState();
  if (!selectionState.canPlace || !selectionState.target) {
    return;
  }

  if (!findExistingSpecCard(selectionState.target.id)) {
    return;
  }

  // If a card already exists for this node, keep it synced while the plugin is open.
  upsertCanvasSpecCard(selectionState.target).catch(() => {});
});

// The UI only sends small command messages; the runtime does the real Figma
// document work because only this context can create and edit canvas nodes.
figma.ui.onmessage = (message) => {
  if (!message || typeof message.type !== "string") {
    return;
  }

  if (message.type === "refresh") {
    sendSelectionSpecs();
  }

  if (message.type === "place-specs") {
    const selectionState = getSelectionState();

    if (!selectionState.canPlace || !selectionState.target) {
      figma.notify(selectionState.message, { error: true });
      sendSelectionSpecs();
      return;
    }

    upsertCanvasSpecCard(selectionState.target)
      .then(() => {
        figma.notify(`Specs placed beside "${selectionState.target.name}".`);
        sendSelectionSpecs();
      })
      .catch((error) => {
        figma.notify(`Could not place specs: ${error.message}`, { error: true });
      });
  }

  if (message.type === "copy-complete") {
    figma.notify("Specs copied to clipboard.");
  }

  if (message.type === "copy-json-complete") {
    figma.notify("JSON specs copied to clipboard.");
  }
};

sendSelectionSpecs();
