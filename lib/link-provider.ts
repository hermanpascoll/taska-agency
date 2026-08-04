export type LinkProvider =
  | "drive"
  | "youtube"
  | "figma"
  | "notion"
  | "dropbox"
  | "onedrive"
  | "vimeo";

export const linkProviderLabels: Record<LinkProvider, string> = {
  drive: "Google Drive",
  youtube: "YouTube",
  figma: "Figma",
  notion: "Notion",
  dropbox: "Dropbox",
  onedrive: "Microsoft OneDrive",
  vimeo: "Vimeo",
};

export function linkProviderForUrl(value: string): LinkProvider | null {
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (
      host === "drive.google.com" ||
      host === "docs.google.com" ||
      host.endsWith(".googleusercontent.com")
    ) return "drive";
    if (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be") return "youtube";
    if (host === "figma.com" || host.endsWith(".figma.com")) return "figma";
    if (host === "notion.so" || host.endsWith(".notion.site")) return "notion";
    if (host === "dropbox.com" || host.endsWith(".dropbox.com")) return "dropbox";
    if (host === "1drv.ms" || host.endsWith(".sharepoint.com") || host === "onedrive.live.com") return "onedrive";
    if (host === "vimeo.com" || host.endsWith(".vimeo.com")) return "vimeo";
    return null;
  } catch {
    return null;
  }
}
