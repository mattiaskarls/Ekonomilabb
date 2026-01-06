import type { APIRoute } from "astro";
import { GLOSSARY } from "../data/ordlista";

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify(GLOSSARY), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // Lagom cache för dev + prod, men ändå uppdaterbart snabbt
      "Cache-Control": "public, max-age=300",
    },
  });
};
