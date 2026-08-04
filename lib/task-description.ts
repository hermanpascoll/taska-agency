import type { TaskAttachment } from "@/lib/types";

const attachmentToken = /\{\{taska-attachment:([^}]+)\}\}/g;

export type TaskDescriptionBlock =
  | { type: "text"; text: string }
  | { type: "attachment"; attachmentId: string };

export function parseTaskDescription(
  description: string,
  attachments: TaskAttachment[] = [],
): TaskDescriptionBlock[] {
  const blocks: TaskDescriptionBlock[] = [];
  const referenced = new Set<string>();
  let cursor = 0;

  for (const match of description.matchAll(attachmentToken)) {
    const index = match.index ?? 0;
    const text = description.slice(cursor, index).replace(/^\n\n|\n\n$/g, "");
    if (text) blocks.push({ type: "text", text });
    const attachmentId = match[1];
    if (attachmentId) {
      blocks.push({ type: "attachment", attachmentId });
      referenced.add(attachmentId);
    }
    cursor = index + match[0].length;
  }

  const trailingText = description.slice(cursor).replace(/^\n\n|\n\n$/g, "");
  if (trailingText || blocks.length === 0) {
    blocks.push({ type: "text", text: trailingText });
  }

  for (const attachment of attachments) {
    if (!attachment.deletedAt && !referenced.has(attachment.id)) {
      blocks.push({ type: "attachment", attachmentId: attachment.id });
    }
  }

  return blocks;
}

export function serializeTaskDescription(blocks: TaskDescriptionBlock[]) {
  return blocks
    .map((block) =>
      block.type === "text"
        ? block.text.trim()
        : `{{taska-attachment:${block.attachmentId}}}`,
    )
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

export function taskDescriptionPlainText(description: string) {
  return description
    .replace(attachmentToken, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function appendDescriptionAttachments(
  description: string,
  attachmentIds: string[],
) {
  const blocks = parseTaskDescription(description);
  const existing = new Set(
    blocks.flatMap((block) =>
      block.type === "attachment" ? [block.attachmentId] : [],
    ),
  );
  for (const attachmentId of attachmentIds) {
    if (!existing.has(attachmentId)) {
      blocks.push({ type: "attachment", attachmentId });
    }
  }
  return serializeTaskDescription(blocks);
}
