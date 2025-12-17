import { defineCollection, z } from "astro:content";

/* ======================
   Kunskap (artiklar)
====================== */
const kunskapCollection = defineCollection({
  schema: z.object({
    title: z.string(),
    date: z.date(),
    tags: z.array(z.string()).optional(),
    excerpt: z.string(),
  }),
});

/* ======================
   Resurser (böcker, tjänster, verktyg)
====================== */
const resurserCollection = defineCollection({
  schema: z.object({
    title: z.string(),
    date: z.date(),
    excerpt: z.string(),
    tags: z.array(z.string()).optional(),

    // Typ av resurs
    type: z.enum(["bok", "tjänst", "verktyg"]),

    // Bild (bokomslag, logotyp etc)
    coverImage: z.string(),

    // Affiliate-/köplänkar
    links: z
      .array(
        z.object({
          label: z.string(),
          url: z.string().url(),
        })
      )
      .optional(),

    // Valfritt: markera utvalda resurser
    featured: z.boolean().optional(),
  }),
});

export const collections = {
  kunskap: kunskapCollection,
  resurser: resurserCollection,
};
