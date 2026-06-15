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
const SPEC_CARD_LABEL_WIDTH = 78;
const VISUAL_SPEC_ROLE = "visual-spec";
const VISUAL_SPEC_ROLE_KEY = "role";
const VISUAL_SPEC_SOURCE_KEY = "source-node-id";
const VISUAL_SPEC_PADDING = 12;
let lastRuntimeError = "";

function round(value) {
  return Math.round(value * 100) / 100;
}

function formatError(error) {
  return error && error.message ? error.message : String(error);
}

function setRuntimeError(error) {
  lastRuntimeError = formatError(error);
}

function clearRuntimeError() {
  lastRuntimeError = "";
}

function isMixed(value) {
  return value === figma.mixed;
}

function formatEnum(value, fallback = "mixed") {
  return typeof value === "string" ? value.toLowerCase().replace(/_/g, "-") : fallback;
}

function formatRawNumber(value, fallback = "mixed") {
  return typeof value === "number" ? round(value) : fallback;
}

function formatPercent(value) {
  return typeof value === "number" ? `${round(value * 100)}%` : "mixed";
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
  if (!color || typeof color.r !== "number" || typeof color.g !== "number" || typeof color.b !== "number") {
    return "#000000";
  }

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
    const stops = Array.isArray(paint.gradientStops)
      ? paint.gradientStops
      .map((stop) => `${rgbToHex(stop.color)} ${round(stop.position * 100)}%`)
      .join(", ")
      : "no stops";
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
  if (!color || typeof color.r !== "number" || typeof color.g !== "number" || typeof color.b !== "number") {
    return "rgba(0, 0, 0, 1)";
  }

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
        const offsetX = effect.offset && typeof effect.offset.x === "number" ? round(effect.offset.x) : 0;
        const offsetY = effect.offset && typeof effect.offset.y === "number" ? round(effect.offset.y) : 0;
        const radius = typeof effect.radius === "number" ? round(effect.radius) : 0;
        const spread = typeof effect.spread === "number" ? round(effect.spread) : 0;
        const opacity = effect.color && typeof effect.color.a === "number" ? effect.color.a : 1;
        return `${effect.type.toLowerCase().replace(/_/g, " ")} ${offsetX}, ${offsetY}, blur ${radius}, spread ${spread}, ${formatBoxShadowColor(effect.color, opacity)}`;
      }

      if (effect.type === "LAYER_BLUR" || effect.type === "BACKGROUND_BLUR") {
        const radius = typeof effect.radius === "number" ? round(effect.radius) : 0;
        return `${effect.type.toLowerCase().replace(/_/g, " ")} ${radius}`;
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

  if ("layoutSizingHorizontal" in node && typeof node.layoutSizingHorizontal === "string") {
    parts.push(`horizontal ${node.layoutSizingHorizontal.toLowerCase()}`);
  }

  if ("layoutSizingVertical" in node && typeof node.layoutSizingVertical === "string") {
    parts.push(`vertical ${node.layoutSizingVertical.toLowerCase()}`);
  }

  if ("layoutAlign" in node && typeof node.layoutAlign === "string") {
    parts.push(`align ${node.layoutAlign.toLowerCase()}`);
  }

  if ("layoutGrow" in node && typeof node.layoutGrow === "number") {
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
    .map((value) => formatRawNumber(value))
    .join(" / ");
  const alignment = `${formatEnum(node.primaryAxisAlignItems)} / ${formatEnum(node.counterAxisAlignItems)}`;
  const gap = formatRawNumber(node.itemSpacing);
  const wrap = "layoutWrap" in node ? formatEnum(node.layoutWrap, "no-wrap") : "no-wrap";

  return `${axis}, gap ${gap}, padding ${padding}, align ${alignment}, ${wrap}`;
}

function describeCornerRadius(node) {
  if ("topLeftRadius" in node && "topRightRadius" in node && "bottomRightRadius" in node && "bottomLeftRadius" in node) {
    const rawValues = [node.topLeftRadius, node.topRightRadius, node.bottomRightRadius, node.bottomLeftRadius];
    if (rawValues.some((value) => typeof value !== "number")) {
      return "mixed";
    }

    const values = rawValues.map((value) => round(value));
    if (values.every((value) => value === values[0])) {
      return `${values[0]} px`;
    }

    return values.join(" / ") + " px";
  }

  if ("cornerRadius" in node) {
    return typeof node.cornerRadius === "number" ? `${round(node.cornerRadius)} px` : "mixed";
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
        : typeof node.lineHeight.value === "number" && typeof node.lineHeight.unit === "string"
          ? `${round(node.lineHeight.value)} ${node.lineHeight.unit.toLowerCase()}`
          : "mixed";
  const letterSpacing =
    isMixed(node.letterSpacing) || node.letterSpacing === figma.mixed
      ? "mixed"
      : typeof node.letterSpacing.value === "number" && typeof node.letterSpacing.unit === "string"
        ? `${round(node.letterSpacing.value)} ${node.letterSpacing.unit.toLowerCase()}`
        : "mixed";

  return {
    content: node.characters,
    fontName,
    fontSize,
    lineHeight,
    letterSpacing,
    textCase: formatEnum(node.textCase),
    textDecoration: formatEnum(node.textDecoration),
    horizontalAlign: formatEnum(node.textAlignHorizontal),
    verticalAlign: formatEnum(node.textAlignVertical)
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
    width: typeof node.width === "number" ? round(node.width) : null,
    height: typeof node.height === "number" ? round(node.height) : null,
    x: typeof node.x === "number" ? round(node.x) : null,
    y: typeof node.y === "number" ? round(node.y) : null,
    rotation: typeof node.rotation === "number" ? round(node.rotation) : null,
    opacity: typeof node.opacity === "number" ? round(node.opacity) : 1,
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

function collectNodeSpecSafely(node, index) {
  try {
    return collectNodeSpec(node, index);
  } catch (error) {
    setRuntimeError(error);
    return {
      id: node.id,
      order: index + 1,
      name: node.name || "Unknown layer",
      path: buildNodePath(node),
      type: node.type,
      visible: "visible" in node ? node.visible : true,
      locked: "locked" in node ? node.locked : false,
      width: typeof node.width === "number" ? round(node.width) : null,
      height: typeof node.height === "number" ? round(node.height) : null,
      x: typeof node.x === "number" ? round(node.x) : null,
      y: typeof node.y === "number" ? round(node.y) : null,
      rotation: null,
      opacity: 1,
      constraints: "n/a",
      sizing: "n/a",
      autoLayout: "n/a",
      cornerRadius: "n/a",
      fills: "Could not read",
      strokes: "Could not read",
      strokeWeight: "n/a",
      effects: "Could not read",
      styles: {},
      text: null,
      error: formatError(error)
    };
  }
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

function getFirstSolidPaint(node) {
  if (!("fills" in node) || !Array.isArray(node.fills)) {
    return null;
  }

  return node.fills.find((paint) => paint.type === "SOLID" && paint.visible !== false) || null;
}

function formatPaintValue(paint) {
  if (!paint || paint.type !== "SOLID") {
    return null;
  }

  const alpha = typeof paint.opacity === "number" ? ` ${formatPercent(paint.opacity)}` : "";
  return `${rgbToHex(paint.color)}${alpha}`;
}

function formatPaddingSummary(padding) {
  if (!padding) {
    return null;
  }

  if (padding.top === padding.right && padding.top === padding.bottom && padding.top === padding.left) {
    return `${padding.top} all`;
  }

  return `T ${padding.top} / R ${padding.right} / B ${padding.bottom} / L ${padding.left}`;
}

function hasUsefulValue(value) {
  return value && value !== "None" && value !== "n/a" && value !== "none";
}

function formatDisplayEnum(value, fallback = "n/a") {
  const normalized = formatEnum(value, fallback);
  const displayOverrides = {
    min: "Left",
    max: "Right"
  };

  if (displayOverrides[normalized]) {
    return displayOverrides[normalized];
  }

  return normalized
    .split("-")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function findExistingVisualSpec(sourceNodeId) {
  const existing = figma.currentPage.findOne((node) => {
    return (
      node.getSharedPluginData(SPEC_CARD_NAMESPACE, VISUAL_SPEC_ROLE_KEY) === VISUAL_SPEC_ROLE &&
      node.getSharedPluginData(SPEC_CARD_NAMESPACE, VISUAL_SPEC_SOURCE_KEY) === sourceNodeId
    );
  });

  return existing && existing.type === "FRAME" ? existing : null;
}

function removeChildren(node) {
  for (const child of [...node.children]) {
    child.remove();
  }
}

async function createVisualText(characters, width, fontSize, color, opts = {}) {
  const text = figma.createText();
  await figma.loadFontAsync(text.fontName);
  text.characters = characters;
  text.fontSize = fontSize;
  text.fills = [{ type: "SOLID", color }];
  text.textAutoResize = "WIDTH_AND_HEIGHT";
  if (opts.letterSpacing) {
    text.letterSpacing = opts.letterSpacing;
  }
  if (opts.textCase) {
    text.textCase = opts.textCase;
  }
  text.resize(width, Math.max(text.height, 16));
  return text;
}

function createVisualBand(x, y, width, height, color, opacity) {
  const band = figma.createRectangle();
  band.x = x;
  band.y = y;
  band.resize(Math.max(width, 1), Math.max(height, 1));
  band.fills = [{ type: "SOLID", color, opacity }];
  band.strokes = [];
  band.cornerRadius = 0;
  band.locked = false;
  return band;
}

function createVisualSurface(x, y, width, height, options) {
  const surface = figma.createFrame();
  surface.x = x;
  surface.y = y;
  surface.resize(width, height);
  surface.fills = [{ type: "SOLID", color: options.fill }];
  surface.strokes = [{ type: "SOLID", color: options.stroke }];
  surface.strokeWeight = options.strokeWeight || 1;
  surface.cornerRadius = options.cornerRadius || 0;
  surface.clipsContent = false;
  if (options.effects) {
    surface.effects = options.effects;
  }
  return surface;
}

async function createVisualLabel(text, x, y, color, width = 84) {
  const label = await createVisualText(text, width, 12, color);
  label.x = x;
  label.y = y;
  label.textAutoResize = "WIDTH_AND_HEIGHT";
  return label;
}

async function createVisualChip(text, x, y, color, fillColor, width = 88) {
  const chip = figma.createFrame();
  chip.x = x;
  chip.y = y;
  chip.resize(width, 24);
  chip.cornerRadius = 999;
  chip.fills = [{ type: "SOLID", color: fillColor }];
  chip.strokes = [{ type: "SOLID", color, opacity: 0.45 }];
  chip.strokeWeight = 1;
  chip.clipsContent = false;

  const label = await createVisualText(text, width - 18, 12, color);
  label.x = 9;
  label.y = 4;
  chip.appendChild(label);
  return chip;
}

async function createPillLabel(text, color, fillColor = null) {
  const pill = figma.createFrame();
  const pillWidth = Math.min(Math.max(text.length * 8 + 24, 96), 150);
  pill.fills = fillColor ? [{ type: "SOLID", color: fillColor }] : [];
  pill.strokes = [{ type: "SOLID", color }];
  pill.strokeWeight = 1;
  pill.cornerRadius = 999;
  pill.clipsContent = false;
  pill.resize(pillWidth, 24);

  const label = await createVisualText(text, pillWidth - 24, 12, color);
  label.x = 12;
  label.y = 5;

  pill.appendChild(label);
  return pill;
}

function findChildByType(node, type) {
  if (!("findOne" in node) || typeof node.findOne !== "function") {
    return null;
  }

  return node.findOne((child) => child.type === type);
}

function findNodeByName(node, needle) {
  if (!("findOne" in node) || typeof node.findOne !== "function") {
    return null;
  }

  const lowerNeedle = needle.toLowerCase();
  return node.findOne((child) => child.name.toLowerCase().includes(lowerNeedle));
}

function findFirstStrokeNode(node) {
  if (
    "strokes" in node &&
    Array.isArray(node.strokes) &&
    node.strokes.length > 0 &&
    "strokeWeight" in node
  ) {
    return node;
  }

  if (!("children" in node)) {
    return null;
  }

  for (const child of node.children) {
    const strokedChild = findFirstStrokeNode(child);
    if (strokedChild) {
      return strokedChild;
    }
  }

  return null;
}

function getRelativeRect(node, ancestor) {
  return {
    x: node.absoluteTransform[0][2] - ancestor.absoluteTransform[0][2],
    y: node.absoluteTransform[1][2] - ancestor.absoluteTransform[1][2],
    width: "width" in node ? node.width : 0,
    height: "height" in node ? node.height : 0
  };
}

function getPaddingValues(node) {
  if (
    typeof node.paddingTop !== "number" ||
    typeof node.paddingRight !== "number" ||
    typeof node.paddingBottom !== "number" ||
    typeof node.paddingLeft !== "number"
  ) {
    return null;
  }

  return {
    top: round(node.paddingTop),
    right: round(node.paddingRight),
    bottom: round(node.paddingBottom),
    left: round(node.paddingLeft)
  };
}

async function upsertVisualSpecOverlay(target, specCard = null) {
  const existing = findExistingVisualSpec(target.id);
  const overlay = existing || figma.createFrame();
  const origin = getCanvasPosition(target);
  const card = specCard || findExistingSpecCard(target.id);
  const padding = getPaddingValues(target);
  const isText = target.type === "TEXT";
  const textNode = isText ? target : findChildByType(target, "TEXT");
  const iconNode = findNodeByName(target, "pizza icon");
  const studyWidth = Math.max(target.width + 72, 184);
  const studyHeight = Math.max(target.height + 112, 160);
  const studyGap = 20;
  const topMargin = 108;
  const bottomMargin = 28;
  const leftMargin = 92;
  const targetLocalY = topMargin;
  const widthGuideY = targetLocalY - 28;
  const heightGuideY = targetLocalY;
  const overlayX = origin.x - leftMargin;
  const overlayY = origin.y - topMargin;
  const cardLocalBottom = card ? card.y - (origin.y - topMargin) + card.height : topMargin + target.height;
  const studyY = Math.max(cardLocalBottom + 20, topMargin + target.height + 168);
  const rowWidth = studyWidth * 3 + studyGap * 2;
  const targetGuideX = leftMargin;
  const cardLocalX = card ? card.x - overlayX : null;
  const studyStartX = cardLocalX !== null ? Math.max(cardLocalX, leftMargin) : Math.max(targetGuideX + target.width + 220, leftMargin + 240);
  const cardRight = card ? card.x - overlayX + card.width : targetGuideX + target.width;
  const overlayWidth = Math.max(targetGuideX + target.width + leftMargin, cardRight + leftMargin, studyStartX + rowWidth + leftMargin);
  const overlayHeight = studyY + studyHeight + bottomMargin;
  const paddingColor = { r: 0.98, g: 0.72, b: 0.34 };
  const paddingFill = { r: 1, g: 0.97, b: 0.9 };
  const strokeColor = { r: 0.97, g: 0.37, b: 0.29 };
  const strokeFill = { r: 1, g: 0.94, b: 0.93 };
  const textColor = { r: 0.53, g: 0.37, b: 0.92 };
  const textFill = { r: 0.96, g: 0.94, b: 1 };
  const sizeColor = { r: 0.33, g: 0.78, b: 0.73 };
  const radiusColor = { r: 0.98, g: 0.5, b: 0.18 };
  const radiusFill = { r: 1, g: 0.95, b: 0.88 };
  const cornerRadius = describeCornerRadius(target);

  removeChildren(overlay);

  overlay.name = `Visual Specs / ${target.name}`;
  overlay.setSharedPluginData(SPEC_CARD_NAMESPACE, VISUAL_SPEC_ROLE_KEY, VISUAL_SPEC_ROLE);
  overlay.setSharedPluginData(SPEC_CARD_NAMESPACE, VISUAL_SPEC_SOURCE_KEY, target.id);
  overlay.x = overlayX;
  overlay.y = overlayY;
  overlay.resize(Math.max(overlayWidth, 1), Math.max(overlayHeight, 1));
  overlay.fills = [];
  overlay.strokes = [];
  overlay.effects = [];
  overlay.clipsContent = false;
  overlay.opacity = 1;

  const heightGuideX = targetGuideX - 18;
  overlay.appendChild(createVisualBand(targetGuideX, widthGuideY, target.width, 2, sizeColor, 1));
  overlay.appendChild(createVisualBand(heightGuideX, heightGuideY, 2, target.height, sizeColor, 1));
  overlay.appendChild(await createVisualLabel(`${Math.round(target.width)} px`, targetGuideX + Math.max(target.width / 2 - 24, 0), widthGuideY - 16, sizeColor, 70));
  overlay.appendChild(await createVisualLabel(`${Math.round(target.height)} px`, Math.max(heightGuideX - 58, 4), heightGuideY + Math.max(target.height / 2 - 8, 0), sizeColor, 70));
  overlay.appendChild(await createVisualLabel(target.name, targetGuideX, widthGuideY - 28, { r: 0.39, g: 0.54, b: 0.98 }, 140));
  if (cornerRadius !== "n/a") {
    const radiusLabelX = targetGuideX + Math.max(target.width - 76, 0);
    const radiusLabelY = targetLocalY + target.height + 8;
    overlay.appendChild(createVisualBand(targetGuideX + target.width - 26, targetLocalY, 26, 3, radiusColor, 1));
    overlay.appendChild(createVisualBand(targetGuideX + target.width - 3, targetLocalY, 3, 26, radiusColor, 1));
    overlay.appendChild(createVisualBand(targetGuideX + target.width - 16, targetLocalY + 26, 3, 18, radiusColor, 1));
    overlay.appendChild(await createVisualChip(`Radius ${cornerRadius}`, radiusLabelX, radiusLabelY, radiusColor, radiusFill, 94));
  }

  const createStudyFrame = async (title, color, fill, x) => {
    const frame = createVisualSurface(x, studyY, studyWidth, studyHeight, {
      fill,
      stroke: color,
      strokeWeight: 1,
      cornerRadius: 16,
      effects: [
        {
          type: "DROP_SHADOW",
          color: { r: 0.071, g: 0.145, b: 0.133, a: 0.08 },
          offset: { x: 0, y: 8 },
          radius: 18,
          spread: 0,
          visible: true,
          blendMode: "NORMAL"
        }
      ]
    });
    const pill = await createPillLabel(title, color, { r: 1, g: 1, b: 1 });
    pill.x = Math.max((studyWidth - pill.width) / 2, 12);
    pill.y = 12;
    frame.appendChild(pill);
    return frame;
  };

  const createStudyClone = (frame) => {
    const clone = target.clone();
    clone.x = Math.max((studyWidth - target.width) / 2, 20);
    clone.y = 58;
    frame.appendChild(clone);
    return clone;
  };

  const paddingFrame = await createStudyFrame("Padding only", paddingColor, paddingFill, studyStartX);
  const strokeFrame = await createStudyFrame("Stroke only", strokeColor, strokeFill, studyStartX + studyWidth + studyGap);
  const textFrame = await createStudyFrame("Text only", textColor, textFill, studyStartX + (studyWidth + studyGap) * 2);

  overlay.appendChild(paddingFrame);
  overlay.appendChild(strokeFrame);
  overlay.appendChild(textFrame);

  const paddingClone = createStudyClone(paddingFrame);
  const strokeClone = createStudyClone(strokeFrame);
  const textClone = createStudyClone(textFrame);

  if (padding) {
    const topBand = createVisualBand(paddingClone.x, paddingClone.y, paddingClone.width, padding.top, paddingColor, 0.42);
    const rightBand = createVisualBand(
      paddingClone.x + Math.max(paddingClone.width - padding.right, 0),
      paddingClone.y,
      padding.right,
      paddingClone.height,
      paddingColor,
      0.42
    );
    const bottomBand = createVisualBand(
      paddingClone.x,
      paddingClone.y + Math.max(paddingClone.height - padding.bottom, 0),
      paddingClone.width,
      padding.bottom,
      paddingColor,
      0.42
    );
    const leftBand = createVisualBand(paddingClone.x, paddingClone.y, padding.left, paddingClone.height, paddingColor, 0.42);
    topBand.strokes = [{ type: "SOLID", color: paddingColor, opacity: 0.65 }];
    rightBand.strokes = [{ type: "SOLID", color: paddingColor, opacity: 0.65 }];
    bottomBand.strokes = [{ type: "SOLID", color: paddingColor, opacity: 0.65 }];
    leftBand.strokes = [{ type: "SOLID", color: paddingColor, opacity: 0.65 }];
    paddingFrame.appendChild(topBand);
    paddingFrame.appendChild(rightBand);
    paddingFrame.appendChild(bottomBand);
    paddingFrame.appendChild(leftBand);

    const topLabel = await createVisualLabel(`T ${padding.top}`, paddingClone.x + Math.max(paddingClone.width / 2 - 18, 0), 40, paddingColor, 54);
    const leftLabel = await createVisualLabel(`L ${padding.left}`, Math.max(paddingClone.x - 38, 4), paddingClone.y + Math.max(paddingClone.height / 2 - 10, 0), paddingColor, 54);
    const rightLabel = await createVisualLabel(`R ${padding.right}`, paddingClone.x + paddingClone.width + 6, paddingClone.y + Math.max(paddingClone.height / 2 - 10, 0), paddingColor, 54);
    const bottomLabel = await createVisualLabel(`B ${padding.bottom}`, paddingClone.x + Math.max(paddingClone.width / 2 - 18, 0), paddingClone.y + paddingClone.height + 14, paddingColor, 54);
    paddingFrame.appendChild(topLabel);
    paddingFrame.appendChild(leftLabel);
    paddingFrame.appendChild(rightLabel);
    paddingFrame.appendChild(bottomLabel);
  }

  if (iconNode) {
    const iconWidth = "width" in iconNode ? iconNode.width : null;
    const iconHeight = "height" in iconNode ? iconNode.height : null;
    const strokeNode = findFirstStrokeNode(iconNode);
    const strokeWeight = strokeNode && "strokeWeight" in strokeNode ? formatLength(strokeNode.strokeWeight) : null;
    const iconInClone = findNodeByName(strokeClone, "pizza icon");
    const iconRect = iconInClone ? getRelativeRect(iconInClone, strokeFrame) : null;
    const iconLineX = iconRect ? iconRect.x + Math.max(iconRect.width / 2, 0) : strokeClone.x + 20;
    const iconLineTop = iconRect ? iconRect.y + Math.max(iconRect.height, 0) + 4 : strokeClone.y + strokeClone.height + 8;
    const iconLabelY = Math.min(studyHeight - 42, strokeClone.y + strokeClone.height + 48);
    const iconLineHeight = Math.max(iconLabelY - iconLineTop - 8, 20);
    const iconCallout = await createVisualLabel(
      `icon ${iconWidth ? `${Math.round(iconWidth)} x ${Math.round(iconHeight)}` : "size"}${strokeWeight ? `, ${strokeWeight}` : ""}`,
      Math.max(iconLineX - 42, 16),
      iconLabelY,
      strokeColor,
      studyWidth - 32
    );
    strokeFrame.appendChild(iconCallout);
    strokeFrame.appendChild(createVisualBand(iconLineX, iconLineTop, 2, iconLineHeight, strokeColor, 1));
  }

  if (textNode) {
    const textInClone = findChildByType(textClone, "TEXT") || textNode;
    const textRect = getRelativeRect(textInClone, textFrame);
    const textSpec = describeText(textNode);
    const textLineX = textRect.x + Math.max(textRect.width / 2, 0);
    const textLineTop = textRect.y + Math.max(textRect.height, 0) + 4;
    const textLabelY = Math.min(studyHeight - 42, textClone.y + textClone.height + 48);
    const textLineHeight = Math.max(textLabelY - textLineTop - 8, 20);
    const textCallout = await createVisualLabel(
      textSpec ? `${textSpec.fontName}, ${textSpec.fontSize}` : "text style",
      Math.max(textLineX - 70, 16),
      textLabelY,
      textColor,
      studyWidth - 32
    );
    textFrame.appendChild(createVisualBand(textRect.x, textRect.y + Math.max(textRect.height, 0) + 1, Math.max(textRect.width, 1), 2, textColor, 1));
    textFrame.appendChild(createVisualBand(textLineX, textLineTop, 2, textLineHeight, textColor, 1));
    textFrame.appendChild(textCallout);
  }

  if (!existing) {
    figma.currentPage.appendChild(overlay);
  }

  return overlay;
}

// Figma requires fonts to be loaded before text nodes can be edited.
async function createTextBlock(characters, options) {
  const text = figma.createText();
  await figma.loadFontAsync(text.fontName);
  text.fontSize = options.fontSize;
  text.characters = String(characters);
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

function createSpecSwatch(color) {
  const swatch = figma.createRectangle();
  swatch.resize(12, 12);
  swatch.cornerRadius = 3;
  swatch.fills = [{ type: "SOLID", color }];
  swatch.strokes = [{ type: "SOLID", color: { r: 0.839, g: 0.882, b: 0.867 } }];
  swatch.strokeWeight = 1;
  return swatch;
}

async function createSpecPill(text, color) {
  const pill = figma.createFrame();
  const pillWidth = Math.min(Math.max(text.length * 8 + 22, 56), 144);
  pill.resize(pillWidth, 20);
  pill.cornerRadius = 999;
  pill.fills = [{ type: "SOLID", color, opacity: 0.1 }];
  pill.strokes = [{ type: "SOLID", color, opacity: 0.32 }];
  pill.strokeWeight = 1;
  pill.clipsContent = false;

  const label = await createTextBlock(text, {
    width: pillWidth - 16,
    fontSize: 11,
    fills: [{ type: "SOLID", color }]
  });
  label.x = 8;
  label.y = 3;
  pill.appendChild(label);
  return pill;
}

async function createSpecSectionTitle(text) {
  return createTextBlock(text, {
    width: SPEC_CARD_WIDTH - SPEC_CARD_PADDING * 2,
    fontSize: 10,
    fills: [{ type: "SOLID", color: { r: 0.055, g: 0.486, b: 0.4 } }],
    letterSpacing: { unit: "PERCENT", value: 10 },
    textCase: "UPPER"
  });
}

async function createSpecRow(label, value, options = {}) {
  const row = figma.createFrame();
  row.fills = [];
  row.strokes = [];
  row.clipsContent = false;

  const labelNode = await createTextBlock(label, {
    width: SPEC_CARD_LABEL_WIDTH,
    fontSize: 11,
    fills: [{ type: "SOLID", color: { r: 0.349, g: 0.439, b: 0.431 } }]
  });
  labelNode.x = 0;
  labelNode.y = 1;
  row.appendChild(labelNode);

  let valueX = SPEC_CARD_LABEL_WIDTH + 10;
  if (options.swatchColor) {
    const swatch = createSpecSwatch(options.swatchColor);
    swatch.x = valueX;
    swatch.y = 2;
    row.appendChild(swatch);
    valueX += 18;
  }

  const valueNode = await createTextBlock(value, {
    width: SPEC_CARD_WIDTH - SPEC_CARD_PADDING * 2 - valueX,
    fontSize: 11,
    fills: [{ type: "SOLID", color: { r: 0.063, g: 0.165, b: 0.165 } }]
  });
  valueNode.x = valueX;
  valueNode.y = 0;
  row.appendChild(valueNode);

  row.resize(SPEC_CARD_WIDTH - SPEC_CARD_PADDING * 2, Math.max(labelNode.height + 2, valueNode.height, 16));
  return row;
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
  const padding = getPaddingValues(target);
  const solidFill = getFirstSolidPaint(target);
  const fillValue = formatPaintValue(solidFill);
  const hasAutoLayout = "layoutMode" in target && target.layoutMode !== "NONE";
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
  const typePill = await createSpecPill(spec.type, { r: 0.055, g: 0.486, b: 0.4 });
  const sections = [
    {
      title: "Size & Position",
      rows: [
        ["Size", `${formatNumber(spec.width)} x ${formatNumber(spec.height)} px`],
        ["Position", `${formatNumber(spec.x)}, ${formatNumber(spec.y)} px`],
        ["Corner radius", spec.cornerRadius]
      ]
    },
    {
      title: "Appearance",
      rows: [
        fillValue ? ["Fill", fillValue, { swatchColor: solidFill.color }] : ["Fills", spec.fills],
        hasUsefulValue(spec.strokes) ? ["Stroke", spec.strokes] : null,
        hasUsefulValue(spec.effects) ? ["Effects", spec.effects] : null
      ].filter(Boolean)
    },
    {
      title: "Auto Layout",
      rows: hasAutoLayout
        ? [
          ["Direction", formatDisplayEnum(target.layoutMode)],
          ["Gap", typeof target.itemSpacing === "number" ? `${round(target.itemSpacing)} px` : "n/a"],
          ["Padding", formatPaddingSummary(padding) || "n/a"],
          ["Align", "primaryAxisAlignItems" in target ? `${formatDisplayEnum(target.primaryAxisAlignItems)} / ${formatDisplayEnum(target.counterAxisAlignItems)}` : "n/a"],
          ["Wrap", "layoutWrap" in target ? formatDisplayEnum(target.layoutWrap, "No wrap") : "No wrap"]
        ]
        : [["Mode", "None"]]
    }
  ];

  const styleRows = [
    spec.styles.fill ? ["Fill", spec.styles.fill.name] : null,
    spec.styles.stroke ? ["Stroke", spec.styles.stroke.name] : null,
    spec.styles.effect ? ["Effect", spec.styles.effect.name] : null,
    spec.styles.text ? ["Text", spec.styles.text.name] : null
  ].filter(Boolean);

  if (styleRows.length) {
    sections.push({
      title: "Styles",
      rows: styleRows
    });
  }

  if (spec.text) {
    sections.push({
      title: "Text",
      rows: [
        ["Content", truncate(spec.text.content, 80)],
        ["Type", `${spec.text.fontName}, ${spec.text.fontSize}`],
        ["Line", spec.text.lineHeight]
      ]
    });
  }

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
  card.appendChild(typePill);

  eyebrow.x = SPEC_CARD_PADDING;
  eyebrow.y = SPEC_CARD_PADDING;
  title.x = SPEC_CARD_PADDING;
  title.y = eyebrow.y + eyebrow.height + 8;
  typePill.x = SPEC_CARD_PADDING;
  typePill.y = title.y + title.height + 10;

  let cursorY = typePill.y + typePill.height + 18;
  for (const section of sections) {
    if (!section.rows.length) {
      continue;
    }

    const sectionTitle = await createSpecSectionTitle(section.title);
    sectionTitle.x = SPEC_CARD_PADDING;
    sectionTitle.y = cursorY;
    card.appendChild(sectionTitle);
    cursorY += sectionTitle.height + 7;

    for (const row of section.rows) {
      const rowNode = await createSpecRow(row[0], row[1], row[2] || {});
      rowNode.x = SPEC_CARD_PADDING;
      rowNode.y = cursorY;
      card.appendChild(rowNode);
      cursorY += rowNode.height + 5;
    }

    cursorY += 10;
  }

  card.resize(SPEC_CARD_WIDTH, Math.ceil(cursorY + SPEC_CARD_PADDING - 6));
  card.x = origin.x + target.width + SPEC_CARD_GAP;
  card.y = origin.y;

  figma.currentPage.appendChild(card);

  return card;
}

// The plugin UI is a read-only view of the current selection state. Every time
// selection changes or the user refreshes, we send a fresh payload to the UI.
function sendSelectionSpecs() {
  const selectionState = getSelectionState();
  const selection = figma.currentPage.selection;
  const layers = selection.map(collectNodeSpecSafely);
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
      placeMessage: selectionState.message,
      runtimeError: lastRuntimeError
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
  upsertCanvasSpecCard(selectionState.target)
    .then(() => {
      clearRuntimeError();
      sendSelectionSpecs();
    })
    .catch((error) => {
      setRuntimeError(error);
      sendSelectionSpecs();
    });
  if (findExistingVisualSpec(selectionState.target.id)) {
    upsertVisualSpecOverlay(selectionState.target).catch((error) => {
      setRuntimeError(error);
      sendSelectionSpecs();
    });
  }
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
      .then((card) => {
        return upsertVisualSpecOverlay(selectionState.target, card).then((overlay) => ({ card, overlay }));
      })
      .then(({ card, overlay }) => {
        clearRuntimeError();
        figma.viewport.scrollAndZoomIntoView([selectionState.target, card, overlay]);
        figma.notify(`Specs placed beside "${selectionState.target.name}".`);
        sendSelectionSpecs();
      })
      .catch((error) => {
        setRuntimeError(error);
        figma.notify(`Could not place specs: ${error.message}`, { error: true });
        sendSelectionSpecs();
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
