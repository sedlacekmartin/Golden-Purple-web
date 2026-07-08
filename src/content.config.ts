import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    image: z.string().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

const prace = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/prace' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    client: z.string(),
    tags: z.array(z.string()).default([]),
    image: z.string().optional(),
    heroImage: z.string().optional(),
    pubDate: z.coerce.date(),
    yearLabel: z.string().optional(),
    draft: z.boolean().default(false),
    order: z.number().default(99),
  }),
});

export const collections = { blog, prace };
