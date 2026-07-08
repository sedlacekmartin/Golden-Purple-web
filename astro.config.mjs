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
      filter: (page) => !page.includes('/coming-soon'),
    }),
  ],
});
