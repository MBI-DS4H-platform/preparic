import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Set by `preparic-start --collaborative`: listen on all interfaces and accept
// any Host header, so others can open the app by this machine's IP or name.
const collaborative = process.env.PREPARIC_COLLABORATIVE === '1';

export default defineConfig({
  base: './',
  plugins: [svelte()],
  server: {
    ...(collaborative && { host: '0.0.0.0', allowedHosts: true }),
    proxy: {
      '/preparic': { target: 'http://127.0.0.1:5813', ws: true },
      '/seamless-client.js': 'http://127.0.0.1:5813',
    },
  },
});
