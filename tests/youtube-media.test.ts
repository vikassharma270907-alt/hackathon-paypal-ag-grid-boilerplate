import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseYouTubeUrl,
  parseTimestampToSeconds,
  buildPrivacyEmbedUrl,
  buildPrivacyEnhancedEmbedUrl,
  buildDirectWatchUrl,
} from '../src/lib/youtube-parser';
import {
  resolveNoembedMetadata,
  clearMetadataCache,
  isUrlSupportedByNoembed,
} from '../src/lib/noembed-service';

describe('YouTube Video & Playlist UI Integration Blueprint', () => {
  beforeEach(() => {
    clearMetadataCache();
  });

  describe('Tier 01: Input URL Parsing & Direct Access Diagnostics', () => {
    it('deconstructs the target combined URL with video, playlist, and pp=xyz context', () => {
      const targetUrl =
        'https://www.youtube.com/watch?v=JPJOOVRnrSQ&list=PLtestList123&pp=xyz';
      const parsed = parseYouTubeUrl(targetUrl);

      expect(parsed.isValid).toBe(true);
      expect(parsed.videoId).toBe('JPJOOVRnrSQ');
      expect(parsed.playlistId).toBe('PLtestList123');
      expect(parsed.contextParam).toBe('xyz');
      expect(parsed.playbackContextParam).toBe('xyz');
      expect(parsed.canonicalUrl).toContain('JPJOOVRnrSQ');
      expect(parsed.canonicalUrl).toContain('PLtestList123');
      expect(parsed.canonicalUrl).toContain('pp=xyz');
      expect(parsed.privacyEmbedUrl).toContain('youtube-nocookie.com/embed/JPJOOVRnrSQ');
      expect(parsed.privacyEmbedUrl).toContain('list=PLtestList123');
      expect(parsed.diagnostics.urlType).toBe('watch');
      expect(parsed.diagnostics.hasVideoId).toBe(true);
      expect(parsed.diagnostics.hasPlaylistId).toBe(true);
      expect(parsed.diagnostics.hasContextParam).toBe(true);
    });

    it('correctly parses shortlinks with timestamp queries (youtu.be/...)', () => {
      const shortUrl = 'https://youtu.be/JPJOOVRnrSQ?t=90';
      const parsed = parseYouTubeUrl(shortUrl);

      expect(parsed.isValid).toBe(true);
      expect(parsed.videoId).toBe('JPJOOVRnrSQ');
      expect(parsed.startTimestamp).toBe(90);
      expect(parsed.diagnostics.urlType).toBe('shortlink');
      expect(parsed.privacyEmbedUrl).toContain('start=90');
    });

    it('correctly parses playlist-only container URLs', () => {
      const playlistUrl = 'https://www.youtube.com/playlist?list=PLtestList123';
      const parsed = parseYouTubeUrl(playlistUrl);

      expect(parsed.isValid).toBe(true);
      expect(parsed.videoId).toBeNull();
      expect(parsed.playlistId).toBe('PLtestList123');
      expect(parsed.diagnostics.urlType).toBe('playlist');
      expect(parsed.diagnostics.embedSupportStatus).toBe('playlist_container');
      expect(parsed.privacyEmbedUrl).toContain('/embed/videoseries?list=PLtestList123');
    });

    it('rejects invalid or non-YouTube URLs safely with diagnostics', () => {
      const invalidUrl = 'https://example.com/not-a-video';
      const parsed = parseYouTubeUrl(invalidUrl);

      expect(parsed.isValid).toBe(false);
      expect(parsed.videoId).toBeNull();
      expect(parsed.playlistId).toBeNull();
      expect(parsed.diagnostics.urlType).toBe('invalid');
      expect(parsed.diagnostics.directScrapeRisk).toContain('Non-YouTube domain');
    });

    it('parses diverse timestamp formats into integer seconds', () => {
      expect(parseTimestampToSeconds(90)).toBe(90);
      expect(parseTimestampToSeconds('90')).toBe(90);
      expect(parseTimestampToSeconds('90s')).toBe(90);
      expect(parseTimestampToSeconds('1m30s')).toBe(90);
      expect(parseTimestampToSeconds('1h2m3s')).toBe(3723);
      expect(parseTimestampToSeconds(null)).toBeNull();
      expect(parseTimestampToSeconds('invalid')).toBeNull();
    });
  });

  describe('Tier 02: Noembed oEmbed Metadata Resolution Layer', () => {
    it('validates supported provider URLs before firing requests', () => {
      expect(isUrlSupportedByNoembed('https://www.youtube.com/watch?v=JPJOOVRnrSQ')).toBe(true);
      expect(isUrlSupportedByNoembed('https://youtu.be/JPJOOVRnrSQ')).toBe(true);
      expect(isUrlSupportedByNoembed('https://unknown-domain.io/item')).toBe(false);
    });

    it('resolves normalized metadata conforming to the guaranteed contract', async () => {
      const targetUrl = 'https://www.youtube.com/watch?v=JPJOOVRnrSQ';
      const metadata = await resolveNoembedMetadata(targetUrl);

      expect(metadata).toBeDefined();
      expect(metadata.title).toBeDefined();
      expect(typeof metadata.title).toBe('string');
      expect(metadata.title.length).toBeGreaterThan(0);
      expect(metadata.providerName).toBe('YouTube');
      expect(metadata.provider_name).toBe('YouTube');
      expect(metadata.canonicalUrl).toContain('JPJOOVRnrSQ');
      expect(metadata.type).toBe('video');
      expect(metadata.resolvedAt).toBeDefined();
    });

    it('utilizes in-memory caching for repeated metadata queries', async () => {
      const targetUrl = 'https://www.youtube.com/watch?v=JPJOOVRnrSQ';
      const first = await resolveNoembedMetadata(targetUrl);
      const second = await resolveNoembedMetadata(targetUrl);

      expect(first.title).toBe(second.title);
      expect(second.fromCache).toBe(true);
    });

    it('provides graceful fallback metadata for playlist URLs where Noembed oEmbed has no matching provider', async () => {
      const playlistUrl = 'https://www.youtube.com/playlist?list=PLtestList123';
      const metadata = await resolveNoembedMetadata(playlistUrl);

      expect(metadata).toBeDefined();
      expect(metadata.providerName).toBe('YouTube');
      expect(metadata.playlistId).toBe('PLtestList123');
      expect(metadata.canonicalUrl).toContain('PLtestList123');
      expect(metadata.embedHtml).toContain('youtube-nocookie.com/embed/videoseries?list=PLtestList123');
    });
  });

  describe('Tier 03: YouTube Privacy-Enhanced Embed & Compliance Layer', () => {
    it('constructs privacy-enhanced embed URL with youtube-nocookie.com domain', () => {
      const embedUrl = buildPrivacyEnhancedEmbedUrl({
        videoId: 'JPJOOVRnrSQ',
        playlistId: 'PLtestList123',
        options: {
          startTimeSeconds: 45,
          captionLanguage: 'en',
          forceCaptions: true,
          autoplay: true,
        },
      });

      expect(embedUrl).toContain('https://www.youtube-nocookie.com/embed/JPJOOVRnrSQ');
      expect(embedUrl).toContain('list=PLtestList123');
      expect(embedUrl).toContain('start=45');
      expect(embedUrl).toContain('cc_lang_pref=en');
      expect(embedUrl).toContain('cc_load_policy=1');
      expect(embedUrl).toContain('autoplay=1');
      expect(embedUrl).toContain('mute=1');
    });

    it('builds direct external watch URLs for restriction fallback cards', () => {
      const watchUrl = buildDirectWatchUrl({
        videoId: 'JPJOOVRnrSQ',
        playlistId: 'PLtestList123',
        contextParam: 'xyz',
      });

      expect(watchUrl).toBe(
        'https://www.youtube.com/watch?v=JPJOOVRnrSQ&list=PLtestList123&pp=xyz'
      );
    });

    it('supports standard embed domain when privacyEnhanced is explicitly disabled', () => {
      const embedUrl = buildPrivacyEmbedUrl({
        videoId: 'JPJOOVRnrSQ',
        privacyEnhanced: false,
      });

      expect(embedUrl).toContain('https://www.youtube.com/embed/JPJOOVRnrSQ');
      expect(embedUrl).not.toContain('nocookie');
    });
  });
});
