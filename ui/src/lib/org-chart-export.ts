import type {
  EnterpriseRelationshipCategory,
  EnterpriseWorkflowPackDefinition,
} from "@paperclipai/shared";
import { createZipArchive } from "./zip";

const textEncoder = new TextEncoder();

const CARD_W = 200;
const CARD_H = 108;
const HEADER_H = 92;
const CROSS_COMPANY_STROKE = "#ef4444";
const DEFAULT_EDGE_STROKE = "rgba(148, 163, 184, 0.55)";

const relationshipCategoryStroke: Record<EnterpriseRelationshipCategory, string> = {
  matrix: "#60a5fa",
  delivery: "#34d399",
  decision: "#f59e0b",
  service: "#22c55e",
  asset: "#8b5cf6",
  data: "#06b6d4",
  governance: "#f97316",
  finance: "#eab308",
  communication: "#ec4899",
  custom: "#94a3b8",
};

const statusDotColor: Record<string, string> = {
  running: "#22d3ee",
  active: "#4ade80",
  paused: "#facc15",
  idle: "#facc15",
  error: "#f87171",
  terminated: "#a3a3a3",
};

const defaultDotColor = "#a3a3a3";

export type OrgChartExportFormat = "png" | "jpeg" | "docx" | "pdf" | "mermaid" | "json";

export interface OrgChartExportTreeNode {
  id: string;
  name: string;
  role: string;
  status: string;
  companyId?: string;
  companyName?: string | null;
  externalToCompany?: boolean;
  reports: OrgChartExportTreeNode[];
}

export interface OrgChartExportNode {
  id: string;
  name: string;
  role: string;
  status: string;
  companyId?: string;
  companyName?: string | null;
  externalToCompany?: boolean;
  x: number;
  y: number;
  depth: number;
  childCount: number;
  collapsed: boolean;
}

export interface OrgChartExportHierarchyEdge {
  parent: OrgChartExportNode;
  child: OrgChartExportNode;
  crossCompany: boolean;
}

export interface OrgChartExportSecondaryEdge {
  id: string;
  sourceAgentId: string;
  sourceAgentName: string;
  sourceCompanyId?: string | null;
  sourceCompanyName?: string | null;
  targetAgentId: string;
  targetAgentName: string;
  targetCompanyId?: string | null;
  targetCompanyName?: string | null;
  typeKey: string;
  typeLabel: string;
  category: EnterpriseRelationshipCategory;
  crossCompany: boolean;
  labelX?: number;
  labelY?: number;
  path?: string;
}

export interface OrgChartExportCompanyGroup {
  key: string;
  companyId?: string;
  companyName: string;
  x: number;
  y: number;
  width: number;
  height: number;
  nodeCount: number;
  external: boolean;
  accentColor: string;
}

export interface OrgChartExportPayload {
  fileBaseName: string;
  title: string;
  subtitle: string;
  companyId: string;
  companyName: string;
  viewMode: "hierarchy" | "enterprise";
  generatedAt: string;
  chartAccent: string;
  relationshipFilter: string;
  bounds: {
    width: number;
    height: number;
  };
  roots: OrgChartExportTreeNode[];
  nodes: OrgChartExportNode[];
  hierarchyEdges: OrgChartExportHierarchyEdge[];
  secondaryEdges: OrgChartExportSecondaryEdge[];
  companyGroups: OrgChartExportCompanyGroup[];
  workflowPacks: EnterpriseWorkflowPackDefinition[];
}

function normalizeFormatExtension(format: OrgChartExportFormat) {
  switch (format) {
    case "png":
      return "png";
    case "jpeg":
      return "jpeg";
    case "docx":
      return "docx";
    case "pdf":
      return "pdf";
    case "mermaid":
      return "mermaid";
    case "json":
      return "json";
  }
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeMermaid(value: string) {
  return escapeXml(value).replace(/\|/g, "&#124;");
}

function slugify(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "structure";
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(maxLength - 1, 1)).trimEnd()}...`;
}

function estimateTextWidth(value: string, perChar = 6.2, padding = 18) {
  return Math.max(Math.ceil(value.length * perChar + padding), 40);
}

function wrapText(value: string, maxLineLength: number, maxLines: number) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxLineLength) {
      current = next;
      continue;
    }

    if (current) {
      lines.push(current);
      current = word;
    } else {
      lines.push(word.slice(0, maxLineLength));
      current = word.slice(maxLineLength);
    }

    if (lines.length === maxLines) break;
  }

  if (lines.length < maxLines && current) {
    lines.push(current);
  }

  if (lines.length > maxLines) {
    lines.length = maxLines;
  }

  const rendered = lines.filter(Boolean);
  const consumedLength = rendered.join(" ").length;
  if (consumedLength < value.trim().length && rendered.length > 0) {
    rendered[rendered.length - 1] = truncateText(rendered[rendered.length - 1]!, maxLineLength);
  }

  return rendered.length > 0 ? rendered : [truncateText(value, maxLineLength)];
}

function makeNodeExportId(nodeId: string, index: number) {
  const safe = nodeId.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `n_${index}_${safe || "agent"}`;
}

function makeGroupExportId(groupKey: string, index: number) {
  const safe = groupKey.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `g_${index}_${safe || "company"}`;
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function buildJsonText(payload: OrgChartExportPayload) {
  return JSON.stringify(payload, null, 2);
}

function buildMermaidText(payload: OrgChartExportPayload) {
  const nodeIdMap = new Map<string, string>();
  payload.nodes.forEach((node, index) => {
    nodeIdMap.set(node.id, makeNodeExportId(node.id, index));
  });

  const lines: string[] = [
    "flowchart TD",
    `%% ${payload.title}`,
    `%% Generated ${payload.generatedAt}`,
    `%% View mode: ${payload.viewMode}`,
  ];

  const nodesByGroup = new Map<string, OrgChartExportNode[]>();
  payload.companyGroups.forEach((group) => nodesByGroup.set(group.key, []));

  for (const node of payload.nodes) {
    const groupKey =
      payload.companyGroups.find(
        (group) =>
          group.companyId
            ? group.companyId === node.companyId
            : group.companyName === (node.companyName ?? "Unknown company"),
      )?.key ?? "__ungrouped__";
    const collection = nodesByGroup.get(groupKey) ?? [];
    collection.push(node);
    nodesByGroup.set(groupKey, collection);
  }

  if (payload.viewMode === "enterprise" && payload.companyGroups.length > 0) {
    payload.companyGroups.forEach((group, groupIndex) => {
      const groupId = makeGroupExportId(group.key, groupIndex);
      lines.push(`  subgraph ${groupId}["${escapeMermaid(group.companyName)}"]`);
      const groupNodes = (nodesByGroup.get(group.key) ?? []).sort((left, right) =>
        left.y === right.y ? left.x - right.x : left.y - right.y,
      );
      groupNodes.forEach((node) => {
        const nodeId = nodeIdMap.get(node.id)!;
        const role = escapeMermaid(node.role);
        const label = `${escapeMermaid(node.name)}<br/>${role}`;
        lines.push(`    ${nodeId}["${label}"]`);
      });
      lines.push("  end");
    });
  } else {
    payload.nodes
      .slice()
      .sort((left, right) => (left.y === right.y ? left.x - right.x : left.y - right.y))
      .forEach((node) => {
        const nodeId = nodeIdMap.get(node.id)!;
        const label = `${escapeMermaid(node.name)}<br/>${escapeMermaid(node.role)}`;
        lines.push(`  ${nodeId}["${label}"]`);
      });
  }

  payload.hierarchyEdges.forEach((edge) => {
    const parentId = nodeIdMap.get(edge.parent.id);
    const childId = nodeIdMap.get(edge.child.id);
    if (!parentId || !childId) return;
    lines.push(`  ${parentId} --> ${childId}`);
  });

  payload.secondaryEdges.forEach((edge) => {
    const sourceId = nodeIdMap.get(edge.sourceAgentId);
    const targetId = nodeIdMap.get(edge.targetAgentId);
    if (!sourceId || !targetId) return;
    lines.push(`  ${sourceId} -. "${escapeMermaid(edge.typeLabel)}" .-> ${targetId}`);
  });

  return `${lines.join("\n")}\n`;
}

function buildHierarchyPath(source: OrgChartExportNode, target: OrgChartExportNode, offsetY: number) {
  const x1 = source.x + CARD_W / 2;
  const y1 = source.y + CARD_H + offsetY;
  const x2 = target.x + CARD_W / 2;
  const y2 = target.y + offsetY;
  const midY = (y1 + y2) / 2;
  return `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`;
}

function buildRelationshipPath(
  source: OrgChartExportNode,
  target: OrgChartExportNode,
  index: number,
  offsetY: number,
) {
  const x1 = source.x + CARD_W / 2;
  const y1 = source.y + CARD_H / 2 + offsetY;
  const x2 = target.x + CARD_W / 2;
  const y2 = target.y + CARD_H / 2 + offsetY;
  const horizontalDirection = x2 >= x1 ? 1 : -1;
  const verticalDirection = y2 >= y1 ? 1 : -1;
  const horizontalPull = Math.max(Math.abs(x2 - x1) * 0.25, 54);
  const verticalOffset = 46 + (index % 4) * 18;
  return [
    `M ${x1} ${y1}`,
    `C ${x1 + horizontalDirection * horizontalPull} ${y1 + verticalDirection * verticalOffset}`,
    `${x2 - horizontalDirection * horizontalPull} ${y2 - verticalDirection * verticalOffset}`,
    `${x2} ${y2}`,
  ].join(" ");
}

function getSvgSnapshot(payload: OrgChartExportPayload) {
  const width = Math.max(Math.ceil(payload.bounds.width), 960);
  const height = Math.max(Math.ceil(payload.bounds.height + HEADER_H), 720);
  const nodeMap = new Map(payload.nodes.map((node) => [node.id, node]));

  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none">`,
    "<defs>",
    '  <linearGradient id="paperclipChartBg" x1="0" y1="0" x2="1" y2="1">',
    '    <stop offset="0%" stop-color="#020617" />',
    '    <stop offset="55%" stop-color="#0f172a" />',
    '    <stop offset="100%" stop-color="#111827" />',
    "  </linearGradient>",
    '  <linearGradient id="paperclipHeaderAccent" x1="0" y1="0" x2="1" y2="0">',
    `    <stop offset="0%" stop-color="${payload.chartAccent}" />`,
    '    <stop offset="100%" stop-color="#38bdf8" />',
    "  </linearGradient>",
    '  <pattern id="paperclipGrid" width="28" height="28" patternUnits="userSpaceOnUse">',
    '    <path d="M 28 0 L 0 0 0 28" stroke="rgba(148,163,184,0.12)" stroke-width="1" />',
    "  </pattern>",
    '  <filter id="paperclipShadow" x="-20%" y="-20%" width="140%" height="160%">',
    '    <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="rgba(15,23,42,0.55)" />',
    "  </filter>",
    "</defs>",
    '  <rect width="100%" height="100%" fill="url(#paperclipChartBg)" />',
    '  <rect width="100%" height="100%" fill="url(#paperclipGrid)" opacity="0.6" />',
    `  <rect x="0" y="0" width="${width}" height="${HEADER_H}" fill="rgba(2,6,23,0.82)" />`,
    `  <rect x="0" y="${HEADER_H - 3}" width="${width}" height="3" fill="url(#paperclipHeaderAccent)" opacity="0.82" />`,
    `  <text x="28" y="34" fill="#f8fafc" font-family="Segoe UI, Arial, sans-serif" font-size="26" font-weight="700">${escapeXml(payload.title)}</text>`,
    `  <text x="28" y="58" fill="#cbd5e1" font-family="Segoe UI, Arial, sans-serif" font-size="13">${escapeXml(payload.subtitle)}</text>`,
    `  <text x="28" y="78" fill="#94a3b8" font-family="Segoe UI, Arial, sans-serif" font-size="11">Generated ${escapeXml(payload.generatedAt)} | ${escapeXml(payload.viewMode)} view | ${escapeXml(payload.companyName)}</text>`,
    `  <text x="${width - 28}" y="34" fill="#e2e8f0" font-family="Segoe UI, Arial, sans-serif" font-size="12" text-anchor="end">${payload.nodes.length} nodes</text>`,
    `  <text x="${width - 28}" y="54" fill="#94a3b8" font-family="Segoe UI, Arial, sans-serif" font-size="11" text-anchor="end">${payload.hierarchyEdges.length} hierarchy edges | ${payload.secondaryEdges.length} secondary links</text>`,
  ];

  payload.companyGroups.forEach((group) => {
    lines.push(
      `  <g>`,
      `    <rect x="${group.x}" y="${group.y + HEADER_H}" width="${group.width}" height="${group.height}" rx="26" fill="${group.accentColor}14" stroke="${group.accentColor}88" stroke-width="1.5" />`,
      `    <line x1="${group.x + 18}" y1="${group.y + HEADER_H + 46}" x2="${group.x + group.width - 18}" y2="${group.y + HEADER_H + 46}" stroke="${group.accentColor}66" stroke-width="1" />`,
      `    <text x="${group.x + 20}" y="${group.y + HEADER_H + 28}" fill="#f8fafc" font-family="Segoe UI, Arial, sans-serif" font-size="13" font-weight="700">${escapeXml(group.companyName)}</text>`,
      `    <text x="${group.x + 20}" y="${group.y + HEADER_H + 42}" fill="#cbd5e1" font-family="Segoe UI, Arial, sans-serif" font-size="10">${group.nodeCount} agent${group.nodeCount === 1 ? "" : "s"}</text>`,
      "  </g>",
    );
  });

  payload.hierarchyEdges.forEach((edge) => {
    lines.push(
      `  <path d="${buildHierarchyPath(edge.parent, edge.child, HEADER_H)}" stroke="${edge.crossCompany ? CROSS_COMPANY_STROKE : DEFAULT_EDGE_STROKE}" stroke-width="${edge.crossCompany ? 2.25 : 1.5}" stroke-linecap="round" stroke-linejoin="round" />`,
    );
  });

  payload.secondaryEdges.forEach((edge, index) => {
    const source = nodeMap.get(edge.sourceAgentId);
    const target = nodeMap.get(edge.targetAgentId);
    if (!source || !target) return;
    const stroke = edge.crossCompany
      ? CROSS_COMPANY_STROKE
      : relationshipCategoryStroke[edge.category];
    const labelWidth = Math.max(edge.typeLabel.length * 6.25 + 22, 92);
    const labelX = edge.labelX ?? (source.x + CARD_W / 2 + target.x + CARD_W / 2) / 2;
    const labelY =
      edge.labelY ?? (source.y + CARD_H / 2 + target.y + CARD_H / 2) / 2 - 14 - (index % 3) * 8;
    lines.push(
      `  <g>`,
      `    <path d="${edge.path ?? buildRelationshipPath(source, target, index, HEADER_H)}" stroke="${stroke}" stroke-width="2" stroke-dasharray="${edge.crossCompany ? "10 6" : "7 6"}" opacity="0.88" />`,
      `    <rect x="${labelX - labelWidth / 2}" y="${labelY + HEADER_H - 10}" width="${labelWidth}" height="20" rx="10" fill="rgba(15,23,42,0.84)" stroke="${stroke}" stroke-width="0.75" />`,
      `    <text x="${labelX}" y="${labelY + HEADER_H + 3}" text-anchor="middle" fill="#f8fafc" font-family="Segoe UI, Arial, sans-serif" font-size="10" font-weight="600">${escapeXml(edge.typeLabel)}</text>`,
      `  </g>`,
    );
  });

  payload.nodes.forEach((node) => {
    const accent = node.externalToCompany ? "#f59e0b" : payload.chartAccent;
    const dotColor = statusDotColor[node.status] ?? defaultDotColor;
    const nameLines = wrapText(node.name, 24, 2);
    const roleText = truncateText(node.role, 34);
    const companyText =
      node.companyName && (payload.viewMode === "enterprise" || node.externalToCompany)
        ? truncateText(node.companyName, 22)
        : null;
    const companyBadgeWidth = companyText ? estimateTextWidth(companyText, 5.4, 20) : 0;
    const helperTextParts = [
      node.childCount > 0
        ? node.collapsed
          ? `${node.childCount} hidden`
          : `${node.childCount} direct`
        : null,
    ].filter(Boolean);

    lines.push(`  <g transform="translate(${node.x} ${node.y + HEADER_H})" filter="url(#paperclipShadow)">`);
    lines.push(
      `    <rect x="0" y="0" width="${CARD_W}" height="${CARD_H}" rx="20" fill="rgba(15,23,42,0.92)" stroke="rgba(255,255,255,0.12)" />`,
      `    <rect x="0" y="0" width="${CARD_W}" height="4" rx="20" fill="${accent}" />`,
      `    <circle cx="28" cy="30" r="16" fill="rgba(2,6,23,0.76)" stroke="rgba(255,255,255,0.12)" />`,
      `    <text x="28" y="35" text-anchor="middle" fill="#e2e8f0" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="700">${escapeXml((node.name[0] ?? "?").toUpperCase())}</text>`,
      `    <circle cx="40" cy="42" r="5" fill="${dotColor}" stroke="#0f172a" stroke-width="2" />`,
    );

    nameLines.forEach((line, index) => {
      lines.push(
        `    <text x="54" y="${24 + index * 16}" fill="#f8fafc" font-family="Segoe UI, Arial, sans-serif" font-size="13" font-weight="700">${escapeXml(line)}</text>`,
      );
    });

    lines.push(
      `    <text x="54" y="58" fill="#94a3b8" font-family="Segoe UI, Arial, sans-serif" font-size="10">${escapeXml(roleText)}</text>`,
    );

    if (companyText) {
      lines.push(
        `    <rect x="54" y="66" width="${companyBadgeWidth}" height="16" rx="8" fill="rgba(226,232,240,0.08)" stroke="rgba(226,232,240,0.14)" />`,
        `    <text x="${54 + companyBadgeWidth / 2}" y="77" text-anchor="middle" fill="#e2e8f0" font-family="Segoe UI, Arial, sans-serif" font-size="9.5">${escapeXml(companyText)}</text>`,
      );
    }

    if (helperTextParts.length > 0) {
      lines.push(
        `    <text x="18" y="95" fill="#cbd5e1" font-family="Segoe UI, Arial, sans-serif" font-size="9.5">${escapeXml(helperTextParts.join(" | "))}</text>`,
      );
    }

    lines.push("  </g>");
  });

  lines.push("</svg>");

  return {
    svg: lines.join("\n"),
    width,
    height,
  };
}

async function renderSvgToCanvas(payload: OrgChartExportPayload) {
  const snapshot = getSvgSnapshot(payload);
  const largestDimension = Math.max(snapshot.width, snapshot.height);
  const scale = Math.max(Math.min(2, 8192 / largestDimension), 1);

  const blob = new Blob([snapshot.svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error("Failed to render the structure snapshot."));
      nextImage.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(snapshot.width * scale);
    canvas.height = Math.ceil(snapshot.height * scale);
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas rendering is not available in this browser.");
    }

    context.scale(scale, scale);
    context.drawImage(image, 0, 0, snapshot.width, snapshot.height);

    return {
      canvas,
      width: snapshot.width,
      height: snapshot.height,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function concatUint8Arrays(chunks: Uint8Array[]) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

function toBlobArrayBuffer(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function createPdfFromJpeg(
  jpegBytes: Uint8Array,
  imageWidth: number,
  imageHeight: number,
  pageWidth: number,
  pageHeight: number,
) {
  const chunks: Uint8Array[] = [];
  const objectOffsets: number[] = [0];
  let position = 0;

  const push = (content: string | Uint8Array) => {
    const chunk = typeof content === "string" ? textEncoder.encode(content) : content;
    chunks.push(chunk);
    position += chunk.length;
  };

  const openObject = (id: number) => {
    objectOffsets[id] = position;
    push(`${id} 0 obj\n`);
  };

  const closeObject = () => push("endobj\n");

  push(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  openObject(1);
  push("<< /Type /Catalog /Pages 2 0 R >>\n");
  closeObject();

  openObject(2);
  push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>\n");
  closeObject();

  openObject(3);
  push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /ProcSet [/PDF /ImageC] /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\n`,
  );
  closeObject();

  openObject(4);
  push(
    `<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`,
  );
  push(jpegBytes);
  push("\nendstream\n");
  closeObject();

  const contentStream = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ\n`;
  openObject(5);
  push(`<< /Length ${textEncoder.encode(contentStream).length} >>\nstream\n${contentStream}endstream\n`);
  closeObject();

  const xrefOffset = position;
  push(`xref\n0 6\n0000000000 65535 f \n`);
  for (let index = 1; index <= 5; index += 1) {
    push(`${String(objectOffsets[index] ?? 0).padStart(10, "0")} 00000 n \n`);
  }
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  return concatUint8Arrays(chunks);
}

function buildDocxDocumentXml(payload: OrgChartExportPayload) {
  const lines: string[] = [];

  const pushParagraph = (text: string, options?: { bold?: boolean; size?: number; indent?: number }) => {
    const props: string[] = [];
    if (options?.indent) {
      props.push(`<w:ind w:left="${options.indent}" />`);
    }

    const runProps: string[] = [];
    if (options?.bold) runProps.push("<w:b />");
    if (options?.size) runProps.push(`<w:sz w:val="${options.size}" />`);

    lines.push(
      "<w:p>",
      props.length > 0 ? `<w:pPr>${props.join("")}</w:pPr>` : "",
      "<w:r>",
      runProps.length > 0 ? `<w:rPr>${runProps.join("")}</w:rPr>` : "",
      `<w:t xml:space="preserve">${escapeXml(text)}</w:t>`,
      "</w:r>",
      "</w:p>",
    );
  };

  const pushBlank = () => lines.push("<w:p />");

  const walkTree = (nodes: OrgChartExportTreeNode[], depth = 0) => {
    nodes.forEach((node) => {
      const companySuffix = node.companyName ? ` [${node.companyName}]` : "";
      pushParagraph(`${node.name}${companySuffix} - ${node.role}`, {
        indent: depth * 420,
      });
      if (node.reports.length > 0) {
        walkTree(node.reports, depth + 1);
      }
    });
  };

  pushParagraph(payload.title, { bold: true, size: 34 });
  pushParagraph(payload.subtitle, { size: 20 });
  pushParagraph(`Generated ${payload.generatedAt}`, { size: 18 });
  pushParagraph(`View mode: ${payload.viewMode}`, { size: 18 });
  pushParagraph(`Company: ${payload.companyName}`, { size: 18 });
  pushBlank();

  pushParagraph("Summary", { bold: true, size: 24 });
  pushParagraph(`Visible nodes: ${payload.nodes.length}`);
  pushParagraph(`Hierarchy edges: ${payload.hierarchyEdges.length}`);
  pushParagraph(`Secondary links: ${payload.secondaryEdges.length}`);
  pushParagraph(`Relationship filter: ${payload.relationshipFilter}`);
  pushBlank();

  pushParagraph("Visible hierarchy", { bold: true, size: 24 });
  walkTree(payload.roots);

  if (payload.secondaryEdges.length > 0) {
    pushBlank();
    pushParagraph("Secondary enterprise links", { bold: true, size: 24 });
    payload.secondaryEdges.forEach((edge) => {
      const sourceCompany = edge.sourceCompanyName ? ` [${edge.sourceCompanyName}]` : "";
      const targetCompany = edge.targetCompanyName ? ` [${edge.targetCompanyName}]` : "";
      pushParagraph(
        `${edge.sourceAgentName}${sourceCompany} -> ${edge.typeLabel} -> ${edge.targetAgentName}${targetCompany}`,
      );
    });
  }

  if (payload.workflowPacks.length > 0) {
    pushBlank();
    pushParagraph("Workflow packs", { bold: true, size: 24 });
    payload.workflowPacks.forEach((pack) => {
      pushParagraph(`${pack.label} - ${pack.description}`);
    });
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${lines.join("")}
    <w:sectPr>
      <w:pgSz w:w="15840" w:h="12240" w:orient="landscape" />
      <w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360" w:gutter="0" />
    </w:sectPr>
  </w:body>
</w:document>`;
}

function buildDocxArchive(payload: OrgChartExportPayload) {
  const coreCreated = new Date(payload.generatedAt).toISOString();
  const files = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
  <Default Extension="xml" ContentType="application/xml" />
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml" />
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml" />
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml" />
</Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml" />
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml" />
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml" />
</Relationships>`,
    "docProps/core.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(payload.title)}</dc:title>
  <dc:creator>Paperclip Org Export</dc:creator>
  <cp:lastModifiedBy>Paperclip Org Export</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${coreCreated}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${coreCreated}</dcterms:modified>
</cp:coreProperties>`,
    "docProps/app.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Paperclip</Application>
</Properties>`,
    "word/document.xml": buildDocxDocumentXml(payload),
  };

  return createZipArchive(files, "");
}

async function exportJson(payload: OrgChartExportPayload) {
  downloadBlob(
    `${payload.fileBaseName}.${normalizeFormatExtension("json")}`,
    new Blob([buildJsonText(payload)], { type: "application/json;charset=utf-8" }),
  );
}

async function exportMermaid(payload: OrgChartExportPayload) {
  downloadBlob(
    `${payload.fileBaseName}.${normalizeFormatExtension("mermaid")}`,
    new Blob([buildMermaidText(payload)], { type: "text/plain;charset=utf-8" }),
  );
}

async function exportPng(payload: OrgChartExportPayload) {
  const rendered = await renderSvgToCanvas(payload);
  const blob = await new Promise<Blob>((resolve, reject) => {
    rendered.canvas.toBlob(
      (nextBlob) => {
        if (!nextBlob) {
          reject(new Error("Failed to generate the PNG export."));
          return;
        }
        resolve(nextBlob);
      },
      "image/png",
      1,
    );
  });
  downloadBlob(`${payload.fileBaseName}.${normalizeFormatExtension("png")}`, blob);
}

async function exportJpeg(payload: OrgChartExportPayload) {
  const rendered = await renderSvgToCanvas(payload);
  const blob = await new Promise<Blob>((resolve, reject) => {
    rendered.canvas.toBlob(
      (nextBlob) => {
        if (!nextBlob) {
          reject(new Error("Failed to generate the JPEG export."));
          return;
        }
        resolve(nextBlob);
      },
      "image/jpeg",
      0.94,
    );
  });
  downloadBlob(`${payload.fileBaseName}.${normalizeFormatExtension("jpeg")}`, blob);
}

async function exportPdf(payload: OrgChartExportPayload) {
  const rendered = await renderSvgToCanvas(payload);
  const jpegBlob = await new Promise<Blob>((resolve, reject) => {
    rendered.canvas.toBlob(
      (nextBlob) => {
        if (!nextBlob) {
          reject(new Error("Failed to generate the PDF snapshot."));
          return;
        }
        resolve(nextBlob);
      },
      "image/jpeg",
      0.94,
    );
  });

  const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
  const pdfBytes = createPdfFromJpeg(
    jpegBytes,
    rendered.canvas.width,
    rendered.canvas.height,
    rendered.width,
    rendered.height,
  );

  downloadBlob(
    `${payload.fileBaseName}.${normalizeFormatExtension("pdf")}`,
    new Blob([toBlobArrayBuffer(pdfBytes)], { type: "application/pdf" }),
  );
}

async function exportDocx(payload: OrgChartExportPayload) {
  const archive = buildDocxArchive(payload);
  downloadBlob(
    `${payload.fileBaseName}.${normalizeFormatExtension("docx")}`,
    new Blob(
      [toBlobArrayBuffer(archive)],
      {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    ),
  );
}

export async function downloadOrgChartExport(
  format: OrgChartExportFormat,
  payload: OrgChartExportPayload,
) {
  switch (format) {
    case "json":
      return exportJson(payload);
    case "mermaid":
      return exportMermaid(payload);
    case "png":
      return exportPng(payload);
    case "jpeg":
      return exportJpeg(payload);
    case "pdf":
      return exportPdf(payload);
    case "docx":
      return exportDocx(payload);
  }
}

export function buildOrgChartExportBaseName(
  companyName: string,
  title: string,
  viewMode: "hierarchy" | "enterprise",
  generatedAt: Date,
) {
  const timestamp = [
    generatedAt.getFullYear(),
    String(generatedAt.getMonth() + 1).padStart(2, "0"),
    String(generatedAt.getDate()).padStart(2, "0"),
    "-",
    String(generatedAt.getHours()).padStart(2, "0"),
    String(generatedAt.getMinutes()).padStart(2, "0"),
    String(generatedAt.getSeconds()).padStart(2, "0"),
  ].join("");

  return `${slugify(companyName)}-${slugify(title)}-${viewMode}-${timestamp}`;
}
