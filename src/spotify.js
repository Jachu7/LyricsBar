import GObject from 'gi://GObject';
import Soup from 'gi://Soup?version=3.0';
import GLib from 'gi://GLib';

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

export const SpotifyClient = GObject.registerClass({
    GTypeName: 'BarLyricsSpotifyClient',
}, class SpotifyClient extends GObject.Object {
    _init(authManager) {
        super._init();
        this._authManager = authManager;
        this._session = new Soup.Session();
        this._session.user_agent = 'LyricsBar/1.0';
    }

    async getCurrentTrack(isRetry = false) {
        const token = await this._authManager.getAccessToken();
        if (!token) return null;

        try {
            const message = Soup.Message.new('GET', `${SPOTIFY_API_BASE}/me/player/currently-playing`);
            message.request_headers.append('Authorization', `Bearer ${token}`);

            const bytes = await this._session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null);
            const status = message.get_status();

            if (status === 200) {
                const decoder = new TextDecoder();
                const data = JSON.parse(decoder.decode(bytes.get_data()));

                if (!data || !data.item) return null;

                return {
                    id: data.item.id,
                    title: data.item.name,
                    artist: (data.item.artists || []).map(a => a.name).join(', '),
                    album: data.item.album?.name || '',
                    duration: data.item.duration_ms / 1000,
                    progress: data.progress_ms / 1000,
                    isPlaying: data.is_playing,
                    image: data.item.album?.images?.[0]?.url,
                };
            } else if (status === 204) {
                return null;
            } else if (status === 401) {
                console.warn('[LyricsBar] Token expired (401).');
                this._authManager.invalidateToken();
                if (!isRetry) {
                    return this.getCurrentTrack(true);
                }
                return null;
            } else if (status === 429) {
                console.warn('[LyricsBar] Rate limited (429). Backing off.');
                return null;
            } else {
                console.error(`[LyricsBar] Spotify API error: ${status}`);
                return null;
            }
        } catch (e) {
            console.error('[LyricsBar] Failed to fetch track:', e);
            return null;
        }
    }

    async getUserProfile(isRetry = false) {
        const token = await this._authManager.getAccessToken();
        if (!token) return null;

        try {
            const message = Soup.Message.new('GET', `${SPOTIFY_API_BASE}/me`);
            message.request_headers.append('Authorization', `Bearer ${token}`);

            const bytes = await this._session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null);
            const status = message.get_status();

            if (status === 200) {
                const decoder = new TextDecoder();
                return JSON.parse(decoder.decode(bytes.get_data()));
            } else if (status === 401) {
                console.warn('[LyricsBar] Token expired during profile fetch (401).');
                this._authManager.invalidateToken();
                if (!isRetry) {
                    return this.getUserProfile(true);
                }
            }
            return null;
        } catch (e) {
            console.error('[LyricsBar] Failed to fetch user profile:', e);
            return null;
        }
    }

    destroy() {
        if (this._session) {
            this._session.abort();
            this._session = null;
        }
    }
});
