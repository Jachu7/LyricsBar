import GLib from 'gi://GLib';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {AuthManager} from './src/auth.js';
import {SpotifyClient} from './src/spotify.js';
import {LyricsFetcher} from './src/lyrics.js';
import {SpotifyStatusIndicator} from './src/ui.js';

export default class LyricsBarExtension extends Extension {
    enable() {
        console.log('[LyricsBar] Extension enabling...');

        this._settings = this.getSettings();
        this._authManager = new AuthManager(this._settings);
        this._spotifyClient = new SpotifyClient(this._authManager);
        this._lyricsFetcher = new LyricsFetcher();

        // Create indicator, passing settings for live updates
        this._indicator = new SpotifyStatusIndicator(this._settings);

        // Add to panel at configured position and index
        const position = this._settings.get_string('panel-position');
        const panelBox = position === 'left' ? 'left' : position === 'right' ? 'right' : 'center';
        const panelIndex = this._settings.get_int('panel-index');
        Main.panel.addToStatusArea(this.uuid, this._indicator, panelIndex, panelBox);

        // State
        this._currentTrack = null;
        this._currentLyrics = null;
        this._lastProgress = 0;
        this._lastUpdateTime = 0;
        this._isPlaying = false;

        // Start polling
        this._startPolling();

        // Check if we already have a valid token (e.g. from keyring)
        this._checkExistingAuth();

        // Auth trigger from prefs
        this._settingsIds = [];
        const authId = this._settings.connect('changed::auth-trigger', () => {
            const triggered = this._settings.get_boolean('auth-trigger');
            if (triggered) {
                this._settings.set_boolean('auth-trigger', false);
                console.log('[LyricsBar] Starting authentication...');
                this._authManager.authenticate().catch((e) => {
                    console.error('[LyricsBar] Auth error:', e);
                });
            }
        });
        this._settingsIds.push(authId);

        // Logout trigger from prefs
        const logoutId = this._settings.connect('changed::logout-trigger', () => {
            const triggered = this._settings.get_boolean('logout-trigger');
            if (triggered) {
                this._settings.set_boolean('logout-trigger', false);
                console.log('[LyricsBar] Logging out...');
                this._authManager.logout();
                this._settings.set_string('authenticated-user', '');
                this._currentTrack = null;
                this._currentLyrics = null;
                this._isPlaying = false;
                this._indicator.update(null, null);
                Main.notify('LyricsBar', 'Logged out from Spotify');
            }
        });
        this._settingsIds.push(logoutId);

        // Listen for poll interval changes
        const pollId = this._settings.connect('changed::poll-interval', () => {
            this._restartPolling();
        });
        this._settingsIds.push(pollId);

        // Live panel repositioning
        const posId = this._settings.connect('changed::panel-position', () => {
            this._repositionIndicator();
        });
        this._settingsIds.push(posId);

        const idxId = this._settings.connect('changed::panel-index', () => {
            this._repositionIndicator();
        });
        this._settingsIds.push(idxId);

        this._authManager.connect('authenticated', () => {
            console.log('[LyricsBar] Authenticated!');
            // Fetch user profile to confirm login
            this._fetchUserProfile();
            this._fetchState();
        });

        this._authManager.connect('auth-failed', (_obj, msg) => {
            console.error('[LyricsBar] Auth failed:', msg);
            Main.notify('LyricsBar', `Authentication failed: ${msg}`);
        });

        console.log('[LyricsBar] Extension enabled.');
    }

    disable() {
        console.log('[LyricsBar] Extension disabling...');

        this._stopPolling();

        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }

        if (this._settings && this._settingsIds) {
            for (const id of this._settingsIds) {
                this._settings.disconnect(id);
            }
            this._settingsIds = null;
            this._settings = null;
        }

        if (this._authManager) {
            this._authManager.destroy();
            this._authManager = null;
        }

        this._spotifyClient = null;
        this._lyricsFetcher = null;
    }

    _startPolling() {
        const interval = this._settings.get_int('poll-interval');

        this._pollTimeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, interval, () => {
            this._fetchState();
            return GLib.SOURCE_CONTINUE;
        });

        // Update UI every 200ms for smooth lyric sync
        this._uiTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
            this._updateUI();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _stopPolling() {
        if (this._pollTimeout) {
            GLib.source_remove(this._pollTimeout);
            this._pollTimeout = null;
        }
        if (this._uiTimeout) {
            GLib.source_remove(this._uiTimeout);
            this._uiTimeout = null;
        }
    }

    _restartPolling() {
        this._stopPolling();
        this._startPolling();
    }

    _repositionIndicator() {
        if (!this._indicator) return;

        const container = this._indicator.container;
        if (!container) return;

        // Remove from current parent box
        const currentParent = container.get_parent();
        if (currentParent) {
            currentParent.remove_child(container);
        }

        // Determine target box
        const position = this._settings.get_string('panel-position');
        let targetBox;
        if (position === 'left') {
            targetBox = Main.panel._leftBox;
        } else if (position === 'right') {
            targetBox = Main.panel._rightBox;
        } else {
            targetBox = Main.panel._centerBox;
        }

        // Insert at the specified index
        const index = this._settings.get_int('panel-index');
        const nChildren = targetBox.get_n_children();
        const clampedIndex = Math.min(index, nChildren);
        targetBox.insert_child_at_index(container, clampedIndex);

        console.log(`[LyricsBar] Repositioned to ${position}, index ${clampedIndex}`);
    }

    async _checkExistingAuth() {
        try {
            const token = await this._authManager.getAccessToken();
            if (token) {
                console.log('[LyricsBar] Found existing valid token in keyring');
                this._fetchUserProfile();
            } else {
                // No valid token — clear any stale username
                this._settings.set_string('authenticated-user', '');
            }
        } catch (e) {
            console.error('[LyricsBar] Error checking existing auth:', e);
        }
    }

    async _fetchState() {
        try {
            const track = await this._spotifyClient.getCurrentTrack();

            if (!track) {
                this._isPlaying = false;
                this._currentTrack = null;
                return;
            }

            this._isPlaying = track.isPlaying;
            this._lastProgress = track.progress;
            this._lastUpdateTime = GLib.get_monotonic_time() / 1000000;

            if (!this._currentTrack || this._currentTrack.id !== track.id) {
                this._currentTrack = track;
                this._currentLyrics = null;
                this._fetchLyrics(track);
            } else {
                this._currentTrack.isPlaying = track.isPlaying;
            }
        } catch (e) {
            console.error('[LyricsBar] Error in poll loop:', e);
        }
    }

    async _fetchUserProfile() {
        try {
            const profile = await this._spotifyClient.getUserProfile();
            if (profile && profile.display_name) {
                this._settings.set_string('authenticated-user', profile.display_name);
                Main.notify('LyricsBar', `Logged in as ${profile.display_name}`);
                console.log(`[LyricsBar] Logged in as: ${profile.display_name}`);
            } else {
                this._settings.set_string('authenticated-user', 'Spotify User');
                Main.notify('LyricsBar', 'Successfully logged in to Spotify!');
            }
        } catch (e) {
            console.error('[LyricsBar] Failed to fetch user profile:', e);
            this._settings.set_string('authenticated-user', 'Spotify User');
            Main.notify('LyricsBar', 'Successfully logged in to Spotify!');
        }
    }

    async _fetchLyrics(track) {
        try {
            const lyrics = await this._lyricsFetcher.fetchLyrics(track);
            if (this._currentTrack && this._currentTrack.id === track.id) {
                this._currentLyrics = lyrics;
            }
        } catch (e) {
            console.error('[LyricsBar] Error fetching lyrics:', e);
        }
    }

    _updateUI() {
        if (!this._isPlaying || !this._currentTrack) {
            this._indicator.update(null, null);
            return;
        }

        const now = GLib.get_monotonic_time() / 1000000;
        const elapsed = now - this._lastUpdateTime;
        const offset = this._settings.get_double('lyrics-offset');
        const estimatedProgress = this._lastProgress + elapsed + offset;

        let currentLine = null;
        if (this._currentLyrics) {
            for (let i = 0; i < this._currentLyrics.length; i++) {
                if (estimatedProgress >= this._currentLyrics[i].time) {
                    currentLine = this._currentLyrics[i].text;
                } else {
                    break;
                }
            }
        }

        this._indicator.update(this._currentTrack, currentLine);
    }
}
