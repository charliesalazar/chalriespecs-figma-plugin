figma.showUI(__html__, {
  width: 440,
  height: 700,
  themeColors: true
});

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

function sendSelectionSpecs() {
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
      json: JSON.stringify(buildJsonPayload(layers, generatedAt), null, 2)
    }
  });
}

figma.on("selectionchange", sendSelectionSpecs);

figma.ui.onmessage = (message) => {
  if (!message || typeof message.type !== "string") {
    return;
  }

  if (message.type === "refresh") {
    sendSelectionSpecs();
  }

  if (message.type === "copy-complete") {
    figma.notify("Specs copied to clipboard.");
  }

  if (message.type === "copy-json-complete") {
    figma.notify("JSON specs copied to clipboard.");
  }
};

sendSelectionSpecs();
