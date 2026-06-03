// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import icon from 'astro-icon';

const isBuild = process.argv.includes('build');
const adapter = isBuild
  ? (await import('@astrojs/cloudflare')).default({
      imageService: 'cloudflare',
    })
  : undefined;

// https://astro.build/config
export default defineConfig({
  output: 'hybrid',
  adapter,
  integrations: [icon(), react()],
  vite: {
    plugins: [tailwindcss()],
    ssr: {
      external: ['postgres'],
    },
    resolve: {
      alias: {
        'node:events': 'events',
        'node:buffer': 'buffer',
      },
    },
  },
});
