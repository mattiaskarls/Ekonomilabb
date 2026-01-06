import type { Plugin } from "unified";
import { visit } from "unist-util-visit";

type Options = {
  terms: Set<string>;
};

const esc = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

export const remarkGlossary: Plugin<[Options]> = (options) => {
  const terms = options.terms;

  return (tree: any) => {
    visit(tree, "text", (node: any, index: number | undefined, parent: any) => {
  if (!parent || typeof node.value !== "string") return;
  if (typeof index !== "number") return;

  // Undvik länkar och kod
  if (parent.type === "link" || parent.type === "inlineCode" || parent.type === "code") return;

  const value: string = node.value;
  if (!value.includes("[[")) return;

  const parts: any[] = [];
  let last = 0;

  const re = /\[\[([^\]]+)\]\]/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(value))) {
    const rawLabel = (m[1] || "").trim();
    const key = rawLabel.toLowerCase();

    if (m.index > last) parts.push({ type: "text", value: value.slice(last, m.index) });

    if (terms.has(key)) {
      parts.push({
        type: "html",
        value: `<span class="glossary-term" data-glossary="${esc(
          key
        )}" tabindex="0">${esc(rawLabel)}<span class="glossary-i" aria-hidden="true">i</span></span>`,
      });
    } else {
      parts.push({ type: "text", value: m[0] });
    }

    last = m.index + m[0].length;
  }

  if (last < value.length) parts.push({ type: "text", value: value.slice(last) });

  parent.children.splice(index, 1, ...parts);
});

  };
};
