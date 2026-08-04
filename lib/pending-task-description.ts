export type UploadedImageReplacement = {
  attachmentId: string;
  src: string;
};

function descriptionDocument(description: string) {
  return new DOMParser().parseFromString(description, "text/html");
}

export function descriptionWithoutDraftImages(
  description: string,
  draftImageIds: Set<string>,
) {
  if (!draftImageIds.size || typeof DOMParser === "undefined") {
    return description;
  }
  const document = descriptionDocument(description);
  for (const image of document.querySelectorAll<HTMLImageElement>(
    "img[data-attachment-id]",
  )) {
    if (
      image.dataset.attachmentId &&
      draftImageIds.has(image.dataset.attachmentId)
    ) {
      image.remove();
    }
  }
  return document.body.innerHTML || "<p></p>";
}

export function descriptionWithUploadedImages(
  description: string,
  draftImageIds: Set<string>,
  replacements: Map<string, UploadedImageReplacement>,
) {
  if (!draftImageIds.size || typeof DOMParser === "undefined") {
    return description;
  }
  const document = descriptionDocument(description);
  for (const image of document.querySelectorAll<HTMLImageElement>(
    "img[data-attachment-id]",
  )) {
    const temporaryId = image.dataset.attachmentId;
    if (!temporaryId || !draftImageIds.has(temporaryId)) continue;
    const replacement = replacements.get(temporaryId);
    if (!replacement) {
      image.remove();
      continue;
    }
    image.dataset.attachmentId = replacement.attachmentId;
    image.src = replacement.src;
  }
  return document.body.innerHTML || "<p></p>";
}
