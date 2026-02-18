import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class LyricsBarPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window.set_default_size(500, 600);

        const settings = this.getSettings();

        // ── Account Page ──
        const authPage = new Adw.PreferencesPage({
            title: _('Account'),
            icon_name: 'dialog-password-symbolic',
        });

        const authGroup = new Adw.PreferencesGroup({
            title: _('Spotify Account'),
        });

        // Status row
        const statusRow = new Adw.ActionRow({
            title: _('Status'),
        });

        const statusLabel = new Gtk.Label({
            halign: Gtk.Align.END,
            valign: Gtk.Align.CENTER,
        });

        const updateStatus = () => {
            const user = settings.get_string('authenticated-user');
            if (user) {
                const escaped = GLib.markup_escape_text(user, -1);
                statusLabel.set_markup(`<span foreground="#4CAF50">✓ Logged in as <b>${escaped}</b></span>`);
                statusRow.set_subtitle('');
            } else {
                statusLabel.set_markup('<span foreground="#FF5252">✗ Not logged in</span>');
                statusRow.set_subtitle(_('Click "Log in" to connect your Spotify'));
            }
        };
        updateStatus();

        // Listen for changes (updates when extension sets authenticated-user)
        const statusId = settings.connect('changed::authenticated-user', updateStatus);
        window.connect('close-request', () => {
            settings.disconnect(statusId);
            return false;
        });

        statusRow.add_suffix(statusLabel);
        authGroup.add(statusRow);

        // Login button
        const loginButton = new Gtk.Button({
            label: _('Log in to Spotify'),
            margin_top: 10,
            margin_bottom: 4,
            halign: Gtk.Align.CENTER,
            css_classes: ['suggested-action'],
        });
        loginButton.connect('clicked', () => {
            settings.set_boolean('auth-trigger', true);
            Gio.Settings.sync();
        });
        authGroup.add(loginButton);

        // Logout button
        const logoutButton = new Gtk.Button({
            label: _('Log out'),
            margin_top: 4,
            margin_bottom: 10,
            halign: Gtk.Align.CENTER,
            css_classes: ['destructive-action'],
        });
        logoutButton.connect('clicked', () => {
            settings.set_boolean('logout-trigger', true);
            Gio.Settings.sync();
        });
        authGroup.add(logoutButton);

        authPage.add(authGroup);

        // ── Appearance Page ──
        const appearancePage = new Adw.PreferencesPage({
            title: _('Appearance'),
            icon_name: 'preferences-desktop-appearance-symbolic',
        });

        // -- Panel Group --
        const layoutGroup = new Adw.PreferencesGroup({
            title: _('Panel'),
        });

        // Side of Panel
        const positionRow = new Adw.ComboRow({
            title: _('Side of Panel'),
            subtitle: _('Where to show lyrics on the top bar'),
        });
        const positionModel = new Gtk.StringList();
        positionModel.append(_('Left'));
        positionModel.append(_('Center'));
        positionModel.append(_('Right'));
        positionRow.set_model(positionModel);

        const posMap = {'left': 0, 'center': 1, 'right': 2};
        const posMapReverse = ['left', 'center', 'right'];
        positionRow.set_selected(posMap[settings.get_string('panel-position')] ?? 1);
        positionRow.connect('notify::selected', () => {
            settings.set_string('panel-position', posMapReverse[positionRow.get_selected()]);
        });
        layoutGroup.add(positionRow);

        // Order in Panel
        const indexRow = new Adw.SpinRow({
            title: _('Order in Panel'),
            subtitle: _('Position within the chosen section (0 = default)'),
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 20,
                step_increment: 1,
                page_increment: 1,
                value: settings.get_int('panel-index'),
            }),
        });
        indexRow.connect('notify::value', () => {
            settings.set_int('panel-index', indexRow.get_value());
        });
        layoutGroup.add(indexRow);

        // Max Text Width
        const widthRow = new Adw.SpinRow({
            title: _('Max Text Width'),
            subtitle: _('Maximum width in pixels (100–800)'),
            adjustment: new Gtk.Adjustment({
                lower: 100,
                upper: 800,
                step_increment: 25,
                page_increment: 50,
                value: settings.get_int('max-text-width'),
            }),
        });
        widthRow.connect('notify::value', () => {
            settings.set_int('max-text-width', widthRow.get_value());
        });
        layoutGroup.add(widthRow);
        appearancePage.add(layoutGroup);

        // -- Text Group --
        const textGroup = new Adw.PreferencesGroup({
            title: _('Text'),
        });

        const fontRow = new Adw.SpinRow({
            title: _('Font Size'),
            subtitle: _('0 = system default'),
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 24,
                step_increment: 1,
                page_increment: 2,
                value: settings.get_int('font-size'),
            }),
        });
        fontRow.connect('notify::value', () => {
            settings.set_int('font-size', fontRow.get_value());
        });
        textGroup.add(fontRow);

        const iconRow = new Adw.SwitchRow({
            title: _('Show Music Icon'),
            subtitle: _('Display a ♪ icon next to the text'),
        });
        iconRow.set_active(settings.get_boolean('show-icon'));
        iconRow.connect('notify::active', () => {
            settings.set_boolean('show-icon', iconRow.get_active());
        });
        textGroup.add(iconRow);
        appearancePage.add(textGroup);

        // ── Behavior Page ──
        const behaviorPage = new Adw.PreferencesPage({
            title: _('Behavior'),
            icon_name: 'preferences-system-symbolic',
        });

        const behaviorGroup = new Adw.PreferencesGroup({
            title: _('Playback'),
        });

        const fallbackRow = new Adw.SwitchRow({
            title: _('Show Artist — Title'),
            subtitle: _('Show track info when no synced lyrics are available'),
        });
        fallbackRow.set_active(settings.get_boolean('show-title-fallback'));
        fallbackRow.connect('notify::active', () => {
            settings.set_boolean('show-title-fallback', fallbackRow.get_active());
        });
        behaviorGroup.add(fallbackRow);

        const hideRow = new Adw.SwitchRow({
            title: _('Hide When Paused'),
            subtitle: _('Clear the top bar text when Spotify is paused'),
        });
        hideRow.set_active(settings.get_boolean('hide-when-paused'));
        hideRow.connect('notify::active', () => {
            settings.set_boolean('hide-when-paused', hideRow.get_active());
        });
        behaviorGroup.add(hideRow);

        const pollRow = new Adw.SpinRow({
            title: _('Poll Interval'),
            subtitle: _('How often to sync with Spotify. Lyrics stay smooth between polls, so 5s is plenty.'),
            adjustment: new Gtk.Adjustment({
                lower: 3,
                upper: 10,
                step_increment: 1,
                page_increment: 1,
                value: settings.get_int('poll-interval'),
            }),
        });
        pollRow.connect('notify::value', () => {
            settings.set_int('poll-interval', pollRow.get_value());
        });
        behaviorGroup.add(pollRow);

        // Lyrics Offset
        const offsetRow = new Adw.SpinRow({
            title: _('Lyrics Offset'),
            subtitle: _('Shift lyrics timing in seconds. Negative = delay lyrics, positive = speed up.'),
            adjustment: new Gtk.Adjustment({
                lower: -2.0,
                upper: 2.0,
                step_increment: 0.1,
                page_increment: 0.5,
                value: settings.get_double('lyrics-offset'),
            }),
            digits: 1,
        });
        offsetRow.connect('notify::value', () => {
            settings.set_double('lyrics-offset', offsetRow.get_value());
        });
        behaviorGroup.add(offsetRow);
        behaviorPage.add(behaviorGroup);

        // Add pages
        window.add(authPage);
        window.add(appearancePage);
        window.add(behaviorPage);
    }
}
