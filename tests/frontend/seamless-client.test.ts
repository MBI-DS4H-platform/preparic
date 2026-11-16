import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSeamlessClient } from '../../src/lib/seamless-client';

function setup() {
  vi.useFakeTimers();
  const clientWindow = { connect_seamless: undefined as undefined | ReturnType<typeof vi.fn> };
  const scripts: Array<{
    src: string;
    onload: (() => void) | null;
    onerror: (() => void) | null;
    remove: ReturnType<typeof vi.fn>;
  }> = [];
  vi.stubGlobal('window', clientWindow);
  vi.stubGlobal('document', {
    createElement: vi.fn(() => ({ src: '', onload: null, onerror: null, remove: vi.fn() })),
    head: { appendChild: (script: typeof scripts[number]) => scripts.push(script) },
  });
  return { clientWindow, scripts };
}

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Seamless client startup', () => {
  it('uses an already available connector without requesting a script', async () => {
    const { clientWindow, scripts } = setup();
    const connector = vi.fn();
    clientWindow.connect_seamless = connector;
    expect(await loadSeamlessClient()).toBe(connector);
    expect(scripts).toHaveLength(0);
  });

  it('recovers from backend startup failures without reloading the page', async () => {
    const { clientWindow, scripts } = setup();
    const loaded = loadSeamlessClient();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(scripts).toHaveLength(attempt + 1);
      expect(scripts[attempt].src).toBe('/seamless-client.js');
      scripts[attempt].onerror!();
      await vi.advanceTimersByTimeAsync(999);
      expect(scripts).toHaveLength(attempt + 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(scripts[attempt].remove).toHaveBeenCalledOnce();
    }
    const connector = vi.fn();
    clientWindow.connect_seamless = connector;
    scripts[3].onload!();
    expect(await loaded).toBe(connector);
    expect(scripts[3].remove).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(5000);
    expect(scripts).toHaveLength(4);
  });

  it('retries a script response that did not install the connector', async () => {
    const { clientWindow, scripts } = setup();
    const loaded = loadSeamlessClient();
    scripts[0].onload!();
    await vi.advanceTimersByTimeAsync(1000);
    expect(scripts).toHaveLength(2);
    const connector = vi.fn();
    clientWindow.connect_seamless = connector;
    scripts[1].onload!();
    expect(await loaded).toBe(connector);
  });
});
