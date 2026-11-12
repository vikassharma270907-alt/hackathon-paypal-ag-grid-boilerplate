import { describe, it, expect } from 'vitest';
import {
  parseYouTubeUrl,
  buildPrivacyEnhancedEmbedUrl,
  buildDirectWatchUrl,
} from '../src/lib/youtube-parser';

describe('YouTube Parser Utility Suite', () => {
  const TARGET_URL = 'https://www.youtube.com/watch?v=JPJOOVRnrSQ&list=PLtestList123&pp=xyz';

  it('parses combined video + playlist + query context URL', () => {
    const res = parseYouTubeUrl(TARGET_URL);

    expect(res.isValid).toBe(true);
    expect(res.videoId).toBe('JPJOOVRnrSQ');
    expect(res.playlistId).toBe('PLtestList123');
    expect(res.contextParam).toBe('xyz');
    expect(res.canonicalUrl).toContain('JPJOOVRnrSQ');
    expect(res.canonicalUrl).toContain('PLtestList123');
  });

  it('parses isolated watch video URL', () => {
    const res = parseYouTubeUrl('https://www.youtube.com/watch?v=JPJOOVRnrSQ');

    expect(res.isValid).toBe(true);
    expect(res.videoId).toBe('JPJOOVRnrSQ');
    expect(res.playlistId).toBeNull();
    expect(res.contextParam).toBeNull();
  });

  it('parses standalone playlist URL', () => {
    const res = parseYouTubeUrl('https://www.youtube.com/playlist?list=PLtestList123');

    expect(res.isValid).toBe(true);
    expect(res.videoId).toBeNull();
    expect(res.playlistId).toBe('PLtestList123');
  });

  it('parses youtu.be shortlink', () => {
    const res = parseYouTubeUrl('https://youtu.be/JPJOOVRnrSQ?list=PLtestList123');

    expect(res.isValid).toBe(true);
    expect(res.videoId).toBe('JPJOOVRnrSQ');
    expect(res.playlistId).toBe('PLtestList123');
  });

  it('parses bare 11-char video ID', () => {
    const res = parseYouTubeUrl('JPJOOVRnrSQ');

    expect(res.isValid).toBe(true);
    expect(res.videoId).toBe('JPJOOVRnrSQ');
  });

  it('rejects invalid or non-YouTube URLs', () => {
    expect(parseYouTubeUrl('https://vimeo.com/123456').isValid).toBe(false);
    expect(parseYouTubeUrl('').isValid).toBe(false);
  });

  it('builds privacy-enhanced embed URL with custom parameters', () => {
    const embedUrl = buildPrivacyEnhancedEmbedUrl({
      videoId: 'JPJOOVRnrSQ',
      playlistId: 'PLtestList123',
      options: {
        startTimeSeconds: 125,
        captionLanguage: 'fr',
        autoplay: true,
      },
    });

    expect(embedUrl).toContain('https://www.youtube-nocookie.com/embed/JPJOOVRnrSQ');
    expect(embedUrl).toContain('list=PLtestList123');
    expect(embedUrl).toContain('start=125');
    expect(embedUrl).toContain('cc_lang_pref=fr');
    expect(embedUrl).toContain('cc_load_policy=1');
    expect(embedUrl).toContain('autoplay=1');
  });

  it('builds direct watch fallback URL with context parameter', () => {
    const watchUrl = buildDirectWatchUrl({
      videoId: 'JPJOOVRnrSQ',
      playlistId: 'PLtestList123',
      contextParam: 'xyz',
    });

    expect(watchUrl).toBe('https://www.youtube.com/watch?v=JPJOOVRnrSQ&list=PLtestList123&pp=xyz');
  });
});
