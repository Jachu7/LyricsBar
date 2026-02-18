import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';
import Secret from 'gi://Secret';

// Constants
const CLIENT_ID = '802bf6aeb6f54fc9a4da5df2ae7a6881';
const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const REDIRECT_URI = 'http://127.0.0.1:8888/callback';
const SCOPES = 'user-read-playback-state user-read-currently-playing';
const SECRET_SCHEMA = new Secret.Schema(
    'org.gnome.shell.extensions.barlyrics',
    Secret.SchemaFlags.NONE,
    {'token_type': Secret.SchemaAttributeType.STRING}
);

export const AuthManager = GObject.registerClass({
    GTypeName: 'BarLyricsAuthManager',
    Signals: {
        'authenticated': {},
        'auth-failed': {param_types: [GObject.TYPE_STRING]},
    },
}, class AuthManager extends GObject.Object {
    _init(settings) {
        super._init();
        this._settings = settings;
        this._session = new Soup.Session();
        this._accessToken = null;
        this._codeVerifier = null;
        this._server = null;
    }

    async authenticate() {
        this._codeVerifier = this._generateRandomString(128);

        // Stop any previous server
        if (this._server) {
            try {
                this._server.stop();
                this._server.close();
            } catch (_e) { /* ignore */ }
            this._server = null;
        }

        // Start local server to catch callback
        this._startLocalServer();

        // Build Auth URL — using S256 PKCE
        const codeChallenge = this._generateCodeChallenge(this._codeVerifier);
        const params = [
            `client_id=${encodeURIComponent(CLIENT_ID)}`,
            `response_type=code`,
            `redirect_uri=${encodeURIComponent(REDIRECT_URI)}`,
            `scope=${encodeURIComponent(SCOPES)}`,
            `code_challenge_method=S256`,
            `code_challenge=${encodeURIComponent(codeChallenge)}`,
        ].join('&');

        const uri = `${SPOTIFY_AUTH_URL}?${params}`;

        console.log('[LyricsBar] Opening browser for auth...');

        // Open in default browser
        try {
            Gio.AppInfo.launch_default_for_uri(uri, null);
        } catch (e) {
            console.error('[LyricsBar] Failed to open browser:', e);
            this.emit('auth-failed', `Failed to open browser: ${e.message}`);
        }
    }

    _startLocalServer() {
        // TODO: Consider migrating to Soup.Server for proper HTTP parsing.
        // Gio.SocketService is low-level and doesn't handle edge cases like
        // split headers or preflight requests. Works for this simple callback.
        try {
            this._server = new Gio.SocketService();

            this._server.connect('incoming', (service, connection) => {
                this._handleConnection(connection);
                return true;
            });

            this._server.add_inet_port(8888, null);
            this._server.start();
            console.log('[LyricsBar] Listening for Spotify callback on port 8888...');
        } catch (e) {
            console.error('[LyricsBar] Failed to start local server:', e);
            this.emit('auth-failed', `Failed to start local server: ${e.message}`);
        }
    }

    _handleConnection(connection) {
        try {
            const input = connection.get_input_stream();
            const output = connection.get_output_stream();
            const dataStream = new Gio.DataInputStream({base_stream: input});

            // Read Request Line synchronously (we're in a callback, simpler this way)
            const [line] = dataStream.read_line_utf8(null);

            if (line) {
                console.log('[LyricsBar] Received callback:', line.substring(0, 100));
                const match = line.match(/code=([^& ]+)/);
                if (match) {
                    const code = match[1];

                    // Send success response first
                    const successHTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LyricsBar — Connected</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    background: #121212;
    color: #fff;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
  }
  .card {
    text-align: center;
    padding: 3rem 4rem;
    border-radius: 16px;
    background: #1e1e1e;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    max-width: 420px;
    animation: fadeUp 0.5s ease-out;
  }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .check {
    width: 72px; height: 72px;
    border-radius: 50%;
    background: #1DB954;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 1.5rem;
    animation: pop 0.4s ease-out 0.2s both;
  }
  @keyframes pop {
    from { transform: scale(0); }
    70% { transform: scale(1.15); }
    to { transform: scale(1); }
  }
  .check svg { width: 36px; height: 36px; }
  h1 {
    font-size: 1.5rem;
    font-weight: 600;
    margin-bottom: 0.5rem;
  }
  .sub {
    color: #b3b3b3;
    font-size: 0.95rem;
    line-height: 1.5;
  }
  .brand {
    margin-top: 2rem;
    color: #535353;
    font-size: 0.8rem;
    letter-spacing: 0.5px;
  }
  .countdown {
    color: #1DB954;
    font-weight: 600;
  }
</style>
</head>
<body>
  <div class="card">
    <div class="check">
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    </div>
    <h1>You're all set!</h1>
    <p class="sub">Spotify connected successfully.<br>This tab will close in <span class="countdown" id="cd">3</span>s.</p>
    <p class="brand">LYRICSBAR FOR SPOTIFY</p>
  </div>
  <script>
    let n=3; const el=document.getElementById('cd');
    const t=setInterval(()=>{n--;el.textContent=n;if(n<=0){clearInterval(t);window.close();}},1000);
  </script>
</body>
</html>`;
                    const responseText = 'HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\n\r\n' + successHTML;
                    const encoder = new TextEncoder();
                    const responseBytes = encoder.encode(responseText);
                    output.write_bytes(new GLib.Bytes(responseBytes), null);
                    output.flush(null);
                    connection.close(null);

                    // Stop server
                    if (this._server) {
                        this._server.stop();
                        this._server.close();
                        this._server = null;
                    }

                    // Exchange code for token
                    this._exchangeCodeForToken(code);
                } else {
                    const responseText = 'HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\nAuth Failed - no code found';
                    const encoder = new TextEncoder();
                    output.write_bytes(new GLib.Bytes(encoder.encode(responseText)), null);
                    output.flush(null);
                    connection.close(null);
                }
            }
        } catch (e) {
            console.error('[LyricsBar] Error handling connection:', e);
        }
    }

    async _exchangeCodeForToken(code) {
        const body = [
            `client_id=${encodeURIComponent(CLIENT_ID)}`,
            `grant_type=authorization_code`,
            `code=${encodeURIComponent(code)}`,
            `redirect_uri=${encodeURIComponent(REDIRECT_URI)}`,
            `code_verifier=${encodeURIComponent(this._codeVerifier)}`,
        ].join('&');

        try {
            const message = Soup.Message.new('POST', SPOTIFY_TOKEN_URL);
            const encoder = new TextEncoder();
            message.set_request_body_from_bytes(
                'application/x-www-form-urlencoded',
                new GLib.Bytes(encoder.encode(body))
            );

            const bytes = await this._session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null);
            const status = message.get_status();

            if (status === 200) {
                const decoder = new TextDecoder();
                const response = JSON.parse(decoder.decode(bytes.get_data()));
                this._accessToken = response.access_token;

                if (response.refresh_token) {
                    this._storeRefreshToken(response.refresh_token);
                }

                console.log('[LyricsBar] Successfully obtained Access Token');
                this.emit('authenticated');
            } else {
                const decoder = new TextDecoder();
                const errBody = decoder.decode(bytes.get_data());
                console.error(`[LyricsBar] Token exchange failed: ${status}`, errBody);
                this.emit('auth-failed', `Token exchange failed: ${status}`);
            }
        } catch (e) {
            console.error('[LyricsBar] Token exchange error:', e);
            this.emit('auth-failed', e.message);
        }
    }

    logout() {
        // Clear in-memory token
        this._accessToken = null;

        // Clear refresh token from keyring
        Secret.password_clear(
            SECRET_SCHEMA,
            {'token_type': 'refresh_token'},
            null,
            (source, result) => {
                try {
                    Secret.password_clear_finish(result);
                    console.log('[LyricsBar] Refresh token cleared from keyring.');
                } catch (e) {
                    console.error('[LyricsBar] Failed to clear refresh token:', e);
                }
            }
        );

        console.log('[LyricsBar] Logged out.');
    }

    _storeRefreshToken(token) {
        Secret.password_store(
            SECRET_SCHEMA,
            {'token_type': 'refresh_token'},
            Secret.COLLECTION_DEFAULT,
            'Spotify Lyrics Extension Refresh Token',
            token,
            null,
            (source, result) => {
                try {
                    Secret.password_store_finish(result);
                    console.log('[LyricsBar] Refresh token stored.');
                } catch (e) {
                    console.error('[LyricsBar] Failed to store refresh token:', e);
                }
            }
        );
    }

    async getAccessToken() {
        if (this._accessToken) return this._accessToken;

        // Try refreshing if no access token
        return await this._refreshAccessToken();
    }

    invalidateToken() {
        this._accessToken = null;
    }

    async _refreshAccessToken() {
        return new Promise((resolve) => {
            Secret.password_lookup(
                SECRET_SCHEMA,
                {'token_type': 'refresh_token'},
                null,
                (source, result) => {
                    try {
                        const refreshToken = Secret.password_lookup_finish(result);
                        if (!refreshToken) {
                            resolve(null);
                            return;
                        }

                        const clientId = CLIENT_ID;
                        const body = [
                            `client_id=${encodeURIComponent(clientId)}`,
                            `grant_type=refresh_token`,
                            `refresh_token=${encodeURIComponent(refreshToken)}`,
                        ].join('&');

                        const message = Soup.Message.new('POST', SPOTIFY_TOKEN_URL);
                        const encoder = new TextEncoder();
                        message.set_request_body_from_bytes(
                            'application/x-www-form-urlencoded',
                            new GLib.Bytes(encoder.encode(body))
                        );

                        this._session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null).then((bytes) => {
                            if (message.get_status() === 200) {
                                const decoder = new TextDecoder();
                                const response = JSON.parse(decoder.decode(bytes.get_data()));
                                this._accessToken = response.access_token;
                                if (response.refresh_token) {
                                    this._storeRefreshToken(response.refresh_token);
                                }
                                resolve(this._accessToken);
                            } else {
                                console.warn('[LyricsBar] Refresh failed:', message.get_status());
                                resolve(null);
                            }
                        }).catch((e) => {
                            console.error('[LyricsBar] Refresh error:', e);
                            resolve(null);
                        });
                    } catch (e) {
                        console.error('[LyricsBar] Refresh lookup error:', e);
                        resolve(null);
                    }
                }
            );
        });
    }

    _generateRandomString(length) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(GLib.random_int() % chars.length);
        }
        return result;
    }

    _generateCodeChallenge(codeVerifier) {
        // S256: SHA256 hash of the verifier, then base64url encode
        const encoder = new TextEncoder();
        const data = encoder.encode(codeVerifier);

        // Get SHA256 hex digest
        const hexDigest = GLib.compute_checksum_for_data(GLib.ChecksumType.SHA256, data);

        // Convert hex string to byte array
        const hashBytes = new Uint8Array(hexDigest.length / 2);
        for (let i = 0; i < hexDigest.length; i += 2) {
            hashBytes[i / 2] = parseInt(hexDigest.substring(i, i + 2), 16);
        }

        // Base64url encode (standard base64 with URL-safe replacements, no padding)
        const base64 = GLib.base64_encode(hashBytes);
        return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    }

    destroy() {
        if (this._server) {
            try {
                this._server.stop();
                this._server.close();
            } catch (_e) { /* ignore */ }
            this._server = null;
        }
        if (this._session) {
            this._session.abort();
            this._session = null;
        }
    }
});
