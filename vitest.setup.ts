import "@testing-library/jest-dom/vitest";

// ProseMirror asks the browser for caret geometry while typing. JSDOM does not
// implement those layout APIs, so provide harmless rectangles for editor tests.
const emptyRect = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  toJSON: () => ({}),
} as DOMRect;

if (typeof document !== "undefined") {
  if (!document.elementFromPoint) {
    document.elementFromPoint = () => null;
  }

  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  }

  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = () => emptyRect;
  }

  if (!HTMLElement.prototype.getClientRects) {
    HTMLElement.prototype.getClientRects = () => [] as unknown as DOMRectList;
  }
}
