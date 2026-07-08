// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  output: 'server',
  adapter: vercel(),
  site: 'https://goldenpurple.cz',
  vite: {
    build: {
      // Nikdy neinlinovat skripty do HTML — nutné pro CSP bez 'unsafe-inline'
      assetsInlineLimit: 0,
    },
  },
  integrations: [
    sitemap({
      // coming-soon a all-assets jsou noindex — v sitemapě by byly rozporný signál
      filter: (page) => !page.includes('/coming-soon') && !page.includes('/all-assets'),
    }),
  ],
});
