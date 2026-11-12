import { describe, it, expect } from 'vitest';
import { fetchNoembedMetadata, isYouTubeOEmbedSupported } from '../src/lib/noembed-service';

describe('Noembed Service Layer', () => {
  it('validates supported YouTube URLs', () => {
    expect(isYouTubeOEmbedSupported('https://www.youtube.com/watch?v=JPJOOVRnrSQ')).toBe(true);
    expect(isYouTubeOEmbedSupported('https://www.youtube.com/playlist?list=PLtestList123')).toBe(true);
    expect(isYouTubeOEmbedSupported('https://invalid-site.com/foo')).toBe(false);
  });

  it('returns graceful fallback metadata when network or endpoint fails', async () => {
    // Force a network failure by fetching an invalid domain or aborting immediately
    const abortCtrl = new AbortController();
    abortCtrl.abort();

    const result = await fetchNoembedMetadata('https://www.youtube.com/watch?v=JPJOOVRnrSQ', {
      signal: abortCtrl.signal,
    });

    expect(result.isFallback).toBe(true);
    expect(result.provider_name).toBe('YouTube');
    expect(result.title).toContain('RestockPilot');
    expect(result.html).toContain('youtube-nocookie.com/embed/JPJOOVRnrSQ');
    expect(result.error).toBeDefined();
  });

  it('rejects completely invalid URLs and returns structured error', async () => {
    const result = await fetchNoembedMetadata('not-a-url');
    expect(result.isFallback).toBe(true);
    expect(result.error).toContain('Invalid or unsupported');
  });
});
