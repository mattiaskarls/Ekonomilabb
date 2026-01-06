import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

import { remarkGlossary } from "./src/remark/remarkGlossary";
import { GLOSSARY } from "./src/data/ordlista";

export default defineConfig({
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
    remarkPlugins: [
      [/** @type {any} */ (remarkGlossary), { terms: new Set(Object.keys(GLOSSARY)) }],
    ],
  },
});