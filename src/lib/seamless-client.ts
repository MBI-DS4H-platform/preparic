import type { ShareConnector } from './seamless.svelte';

/** Vite can serve the page before the backend can serve its client script. */
export async function loadSeamlessClient(): Promise<ShareConnector> {
  while (!window.connect_seamless) {
    await new Promise<void>(resolve => {
      const script = document.createElement('script');
      script.src = '/seamless-client.js';
      script.onload = script.onerror = () => {
        script.remove();
        resolve();
      };
      document.head.appendChild(script);
    });
    if (!window.connect_seamless) {
      await new Promise<void>(resolve => setTimeout(resolve, 1000));
    }
  }
  return window.connect_seamless;
}
