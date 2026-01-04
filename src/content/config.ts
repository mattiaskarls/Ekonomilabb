import { defineCollection, z } from "astro:content";

export const collections = {
  kunskap: defineCollection({
    type: "content",
    schema: z.object({
      title: z.string(),
      excerpt: z.string(),
      date: z.date(),
      type: z.string().optional(),
      tags: z.array(z.string()).optional(),
      cta: z
        .object({
          title: z.string(),
          links: z.array(
            z.object({
              label: z.string(),
              href: z.string(),
            })
          ),
        })
        .optional(),
    }),
  }),

  resurser: defineCollection({
    type: "content",
    schema: z.object({
      title: z.string(),
      excerpt: z.string(),

      // 👇 ändringarna är här
      date: z.date().optional(),
      coverImage: z.string().optional(),

      type: z.enum(["tjänst", "verktyg", "bok"]),
      featured: z.boolean().optional(),
      links: z.array(
        z.object({
          label: z.string(),
          url: z.string().url(),
        })
      ),
    }),
  }),
};
