import {
  parseTaskDescription,
  type TaskDescriptionBlock,
} from "@/lib/task-description";
import type { TaskAttachment } from "@/lib/types";

const htmlTag = /<\/?[a-z][\s\S]*?>/i;

export function isRichTextDescription(value: string) {
  return htmlTag.test(value);
}

export function escapeRichTextHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function inlineLegacyFormatting(value: string) {
  return escapeRichTextHtml(value)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<u>$1</u>")
    .replace(/~~(.+?)~~/g, "<s>$1</s>")
    .replace(/==(.+?)==/g, "<mark>$1</mark>")
    .replace(/(^|\s)\*([^*\n]+)\*(?=\s|$)/g, "$1<em>$2</em>");
}

function legacyTextBlockToHtml(text: string) {
  const lines = text.split("\n");
  const html: string[] = [];
  let list: "ul" | "ol" | null = null;

  const closeList = () => {
    if (!list) return;
    html.push(`</${list}>`);
    list = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (bullet || ordered) {
      const nextList = bullet ? "ul" : "ol";
      if (list !== nextList) {
        closeList();
        list = nextList;
        html.push(`<${list}>`);
      }
      html.push(`<li><p>${inlineLegacyFormatting((bullet ?? ordered)?.[1] ?? "")}</p></li>`);
      continue;
    }

    closeList();
    if (!line.trim()) {
      html.push("<p></p>");
    } else if (line.startsWith("### ")) {
      html.push(`<h3>${inlineLegacyFormatting(line.slice(4))}</h3>`);
    } else if (line.startsWith("## ")) {
      html.push(`<h2>${inlineLegacyFormatting(line.slice(3))}</h2>`);
    } else if (line.startsWith("# ")) {
      html.push(`<h1>${inlineLegacyFormatting(line.slice(2))}</h1>`);
    } else if (line.startsWith("> ")) {
      html.push(`<blockquote><p>${inlineLegacyFormatting(line.slice(2))}</p></blockquote>`);
    } else {
      html.push(`<p>${inlineLegacyFormatting(line)}</p>`);
    }
  }
  closeList();
  return html.join("") || "<p></p>";
}

export function attachmentImageHtml(
  attachment: TaskAttachment,
  src: string,
) {
  return `<img src="${escapeRichTextHtml(src)}" alt="${escapeRichTextHtml(
    attachment.name,
  )}" title="${escapeRichTextHtml(
    attachment.name,
  )}" data-attachment-id="${escapeRichTextHtml(attachment.id)}">`;
}

export function descriptionBlocksToHtml(
  blocks: TaskDescriptionBlock[],
  attachments: TaskAttachment[],
  attachmentUrls: Map<string, string>,
) {
  const attachmentById = new Map(
    attachments.map((attachment) => [attachment.id, attachment]),
  );
  return blocks
    .map((block) => {
      if (block.type === "text") return legacyTextBlockToHtml(block.text);
      const attachment = attachmentById.get(block.attachmentId);
      const src = attachmentUrls.get(block.attachmentId);
      if (!attachment || !src || !attachment.mimeType.startsWith("image/")) {
        return "";
      }
      return attachmentImageHtml(attachment, src);
    })
    .join("") || "<p></p>";
}

export function legacyDescriptionToHtml(
  description: string,
  attachments: TaskAttachment[],
  attachmentUrls: Map<string, string>,
) {
  if (isRichTextDescription(description)) return description || "<p></p>";
  return descriptionBlocksToHtml(
    parseTaskDescription(description, attachments),
    attachments,
    attachmentUrls,
  );
}
