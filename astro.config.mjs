// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import icon from 'astro-icon';
import { fileURLToPath } from 'node:url';

const eventsPolyfill = fileURLToPath(
  new URL('./node_modules/rollup-plugin-node-polyfills/polyfills/events.js', import.meta.url)
);
const bufferPolyfill = fileURLToPath(
  new URL('./node_modules/rollup-plugin-node-polyfills/polyfills/buffer-es6.js', import.meta.url)
);
const streamPolyfill = fileURLToPath(
  new URL('./node_modules/rollup-plugin-node-polyfills/polyfills/stream.js', import.meta.url)
);
const utilPolyfill = fileURLToPath(
  new URL('./node_modules/rollup-plugin-node-polyfills/polyfills/util.js', import.meta.url)
);
const processPolyfill = fileURLToPath(
  new URL('./node_modules/rollup-plugin-node-polyfills/polyfills/process-es6.js', import.meta.url)
);
const stringDecoderPolyfill = fileURLToPath(
  new URL('./node_modules/rollup-plugin-node-polyfills/polyfills/string-decoder.js', import.meta.url)
);

const isBuild = process.argv.includes('build');
const adapter = isBuild
  ? (await import('@astrojs/cloudflare')).default({
      imageService: 'compile',
    })
  : undefined;

// https://astro.build/config
export default defineConfig({
  output: 'hybrid',
  adapter,
  integrations: [icon(), react()],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        events: eventsPolyfill,
        'node:events': eventsPolyfill,
        buffer: bufferPolyfill,
        'node:buffer': bufferPolyfill,
        stream: streamPolyfill,
        'node:stream': streamPolyfill,
        util: utilPolyfill,
        process: processPolyfill,
        string_decoder: stringDecoderPolyfill,
      },
    },
  },
});
