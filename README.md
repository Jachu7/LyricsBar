<p align="center">
  <img src="https://raw.githubusercontent.com/nicoschmit/chrome-spotify-lyrics/master/icon128.png" width="80" alt="LyricsBar Logo" />
  <br/>
  <b>LyricsBar for Spotify</b>
</p>

<h3 align="center">Your top bar, now singing 🎵</h3>

<p align="center">
  A GNOME Shell extension that displays <b>real-time, word-synced Spotify lyrics</b> directly in your desktop panel — so you never have to leave what you're doing to follow along.
</p>

<p align="center">
  <a href="https://buymeacoffee.com/jachu7"><img src="https://img.shields.io/badge/Buy_Me_a_Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black" alt="Buy Me a Coffee"></a>
</p>

---

## ✨ Features

| Feature | Description |
|---|---|
| 🎤 **Synced Lyrics** | Line-by-line lyrics update in real time as your music plays, powered by [LRCLIB](https://lrclib.net) |
| 📍 **Panel Placement** | Position lyrics on the **left**, **center**, or **right** side of the GNOME top bar, with configurable order index |
| 🎨 **Customizable Look** | Adjust max text width, font size, and toggle the music icon on or off |
| ⏸️ **Smart Hiding** | Optionally hide the text when Spotify is paused |
| 🔤 **Title Fallback** | Shows *Artist — Title* when no synced lyrics are available |
| ⏱️ **Lyrics Offset** | Fine-tune timing (±2 s) so lyrics match your audio perfectly |
| 🔐 **Secure Auth** | OAuth 2.0 PKCE flow with refresh tokens stored in **GNOME Keyring** — no password ever touches disk |
| ⚡ **Lightweight** | Smooth 200 ms UI refresh with configurable API poll interval (3–10 s) |

## 📸 Screenshots

<!-- Add your screenshots here -->
<!-- ![LyricsBar in action](screenshots/panel.png) -->
<!-- ![Preferences window](screenshots/prefs.png) -->

## 🖥️ Requirements

- **GNOME Shell 49**
- **Spotify Premium** account (required by the Spotify Web API for playback state)
- Active internet connection

## 📦 Installation

> [!NOTE]
> GNOME Extensions Store listing is coming soon! For now, install manually:

```bash
git clone https://github.com/Jachu7/LyricsBar.git
cd LyricsBar
mkdir -p ~/.local/share/gnome-shell/extensions/lyricsbar@Jachu7.github.io
cp -r * ~/.local/share/gnome-shell/extensions/lyricsbar@Jachu7.github.io/
```

Then restart GNOME Shell:
- **Wayland** — log out and back in
- **X11** — press <kbd>Alt</kbd>+<kbd>F2</kbd>, type `r`, press <kbd>Enter</kbd>

Enable the extension:

```bash
gnome-extensions enable lyricsbar@Jachu7.github.io
```

## 🔧 Configuration

Open the settings via **Extensions** app or:

```bash
gnome-extensions prefs lyricsbar@Jachu7.github.io
```

### Account
- **Log in / Log out** — connect or disconnect your Spotify account
- Status indicator showing the currently authenticated user

### Appearance
- **Side of Panel** — Left / Center / Right
- **Order in Panel** — position index within the chosen section
- **Max Text Width** — 100–800 px
- **Font Size** — custom size or system default (0)
- **Show Music Icon** — toggle the ♪ icon

### Behavior
- **Show Artist — Title** — fallback when no synced lyrics are found
- **Hide When Paused** — clear the panel text when playback is paused
- **Poll Interval** — 3–10 seconds between Spotify API checks
- **Lyrics Offset** — shift lyrics timing by −2.0 to +2.0 seconds

## 🏗️ Architecture

```
lyricsbar@Jachu7.github.io/
├── extension.js        # Main extension lifecycle & polling loop
├── prefs.js            # Preferences window (Adw/Gtk4)
├── metadata.json       # Extension metadata
├── stylesheet.css      # Panel label styles
├── schemas/            # GSettings schema
└── src/
    ├── auth.js         # OAuth 2.0 PKCE flow + GNOME Keyring storage
    ├── spotify.js      # Spotify Web API client
    ├── lyrics.js       # LRCLIB lyrics fetcher & LRC parser
    └── ui.js           # Top-bar indicator widget
```

## 🔒 Privacy & Security

- Authentication uses the **OAuth 2.0 Authorization Code with PKCE** flow — no client secret is needed.
- Refresh tokens are stored exclusively in the **GNOME Keyring** (via `libsecret`), never in plain text.
- The extension only requests the `user-read-playback-state` and `user-read-currently-playing` scopes — it **cannot** control playback or access your library.
- Lyrics are fetched from the open **LRCLIB** API; no personal data is sent.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!
Feel free to open an [issue](https://github.com/Jachu7/LyricsBar/issues) or submit a pull request.

## ☕ Support

If you enjoy LyricsBar, consider supporting the project:

<a href="https://buymeacoffee.com/jachu7"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" height="50" alt="Buy Me a Coffee"></a>

## 📄 License

This project is open source. See the [LICENSE](LICENSE) file for details.

---

<p align="center">Made with ❤️ for the GNOME community</p>
