// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  output: 'server',
  adapter: vercel(),
  site: 'https://goldenpurple.cz',
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/coming-soon'),
    }),
  ],
});
