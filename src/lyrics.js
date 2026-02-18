import GObject from 'gi://GObject';
import Soup from 'gi://Soup?version=3.0';
import GLib from 'gi://GLib';

const LRCLIB_API = 'https://lrclib.net/api';

export const LyricsFetcher = GObject.registerClass({
    GTypeName: 'BarLyricsLyricsFetcher',
}, class LyricsFetcher extends GObject.Object {
    _init() {
        super._init();
        this._session = new Soup.Session();
        this._session.user_agent = 'LyricsBar/1.0';
    }

    async fetchLyrics(track, cancellable = null) {
        if (!track) return null;

        try {
            // 1) Try exact match first (fastest)
            const exactResult = await this._fetchExact(track, cancellable);
            if (exactResult) return exactResult;

            // 2) Fallback: search by title + artist (more flexible)
            console.log(`[LyricsBar] Exact match failed, trying search for: ${track.artist} - ${track.title}`);
            const searchResult = await this._fetchSearch(track, cancellable);
            if (searchResult) return searchResult;

            return null;
        } catch (e) {
            console.error('[LyricsBar] Failed to fetch lyrics:', e);
            return null;
        }
    }

    async _fetchExact(track, cancellable = null) {
        const params = [
            `track_name=${encodeURIComponent(track.title)}`,
            `artist_name=${encodeURIComponent(track.artist)}`,
            `album_name=${encodeURIComponent(track.album)}`,
            `duration=${Math.round(track.duration)}`,
        ].join('&');

        const url = `${LRCLIB_API}/get?${params}`;
        const data = await this._request(url, cancellable);

        if (data && data.syncedLyrics) {
            return this._parseSyncedLyrics(data.syncedLyrics);
        }
        return null;
    }

    async _fetchSearch(track, cancellable = null) {
        // Search with just title and artist — more forgiving
        const params = [
            `track_name=${encodeURIComponent(track.title)}`,
            `artist_name=${encodeURIComponent(track.artist)}`,
        ].join('&');

        const url = `${LRCLIB_API}/search?${params}`;
        const data = await this._request(url, cancellable);

        if (data && Array.isArray(data) && data.length > 0) {
            // Find the best match: prefer synced lyrics, closest duration
            const targetDuration = track.duration;
            let best = null;
            let bestScore = -1;

            for (const result of data) {
                if (!result.syncedLyrics) continue;

                // Score: closer duration = higher score
                const durationDiff = Math.abs((result.duration || 0) - targetDuration);
                const score = 1000 - durationDiff; // Lower diff = higher score

                if (score > bestScore) {
                    bestScore = score;
                    best = result;
                }
            }

            // If no synced result found via scoring, try plain lyrics
            if (!best) {
                best = data.find(r => r.plainLyrics);
            }

            if (best) {
                if (best.syncedLyrics) {
                    return this._parseSyncedLyrics(best.syncedLyrics);
                } else if (best.plainLyrics) {
                    return [{time: 0, text: best.plainLyrics}];
                }
            }
        }
        return null;
    }

    async _request(url, cancellable = null) {
        try {
            const message = Soup.Message.new('GET', url);
            const bytes = await this._session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, cancellable);
            const status = message.get_status();

            if (status === 200) {
                const decoder = new TextDecoder();
                return JSON.parse(decoder.decode(bytes.get_data()));
            } else if (status === 429) {
                console.warn(`[LyricsBar] LRCLIB rate limited (429) for ${url}`);
                return null;
            }
            return null;
        } catch (e) {
            console.error(`[LyricsBar] Request failed for ${url}:`, e);
            return null;
        }
    }

    _parseSyncedLyrics(lrcString) {
        const lines = lrcString.split('\n');
        const lyrics = [];
        const regex = /^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;

        for (const line of lines) {
            const match = line.match(regex);
            if (match) {
                const minutes = parseInt(match[1]);
                const seconds = parseInt(match[2]);
                const frac = match[3];
                // Handle both .XX (hundredths) and .XXX (milliseconds)
                const fractional = frac.length === 3
                    ? parseInt(frac) / 1000
                    : parseInt(frac) / 100;
                const text = match[4].trim();

                const time = minutes * 60 + seconds + fractional;

                if (text) {
                    lyrics.push({time, text});
                }
            }
        }
        return lyrics;
    }

    destroy() {
        if (this._session) {
            this._session.abort();
            this._session = null;
        }
    }
});
