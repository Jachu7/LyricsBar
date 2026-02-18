import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

export const SpotifyStatusIndicator = GObject.registerClass({
    GTypeName: 'BarLyricsIndicator',
}, class SpotifyStatusIndicator extends PanelMenu.Button {
    _init(settings) {
        super._init(0.0, 'LyricsBar for Spotify', false);

        this._settings = settings;

        // Icon (hidden by default)
        this._icon = new St.Icon({
            icon_name: 'audio-x-generic-symbolic',
            style_class: 'system-status-icon',
        });

        // Lyrics label
        this._label = new St.Label({
            text: '',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'barlyrics-label',
        });

        this._box = new St.BoxLayout();
        this._box.add_child(this._icon);
        this._box.add_child(this._label);
        this.add_child(this._box);

        // Menu
        this._buildMenu();

        // Apply settings
        this._applySettings();

        // Listen for settings changes
        this._settingsChangedIds = [];
        const watchKeys = ['max-text-width', 'font-size', 'show-icon'];
        for (const key of watchKeys) {
            const id = this._settings.connect(`changed::${key}`, () => this._applySettings());
            this._settingsChangedIds.push(id);
        }
    }

    _applySettings() {
        // Max width + font size
        const maxWidth = this._settings.get_int('max-text-width');
        const fontSize = this._settings.get_int('font-size');
        let style = `max-width: ${maxWidth}px;`;
        if (fontSize > 0) {
            style += ` font-size: ${fontSize}px;`;
        }
        this._label.set_style(style);

        // Icon visibility
        const showIcon = this._settings.get_boolean('show-icon');
        if (showIcon) {
            this._icon.show();
        } else {
            this._icon.hide();
        }
    }

    _buildMenu() {
        this._infoItem = new PopupMenu.PopupMenuItem('Not playing', {reactive: false});
        this.menu.addMenuItem(this._infoItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const settingsItem = new PopupMenu.PopupMenuItem('Extension Settings');
        settingsItem.connect('activate', () => {
            try {
                const proc = Gio.Subprocess.new(
                    ['gnome-extensions', 'prefs', 'lyricsbar@Jachu7.github.io'],
                    Gio.SubprocessFlags.NONE
                );
                proc.wait_async(null, null);
            } catch (e) {
                console.error('[LyricsBar] Failed to open settings:', e);
            }
        });
        this.menu.addMenuItem(settingsItem);
    }

    update(track, currentLyric) {
        const hideWhenPaused = this._settings.get_boolean('hide-when-paused');
        const showFallback = this._settings.get_boolean('show-title-fallback');

        if (!track || (!track.isPlaying && hideWhenPaused)) {
            this._label.set_text('');
            this._infoItem.label.set_text('Not playing');
            return;
        }

        if (currentLyric) {
            this._label.set_text(currentLyric);
        } else if (showFallback) {
            this._label.set_text(`${track.artist} — ${track.title}`);
        } else {
            this._label.set_text('♪');
        }

        this._infoItem.label.set_text(`${track.artist} — ${track.title}`);
    }

    destroy() {
        if (this._settingsChangedIds) {
            for (const id of this._settingsChangedIds) {
                this._settings.disconnect(id);
            }
            this._settingsChangedIds = null;
        }
        super.destroy();
    }
});
