# Changelog

## 0.2.0 — 2026-10-12

### Security

- Panel login could be bypassed with percent-encoded paths (`/%61pi/...`); it now checks the matched
  route.
- Clients never reach the internet directly, in any state, ping included; the VPS hosts can no longer
  open connections into the local network.
- Panel answers carry `X-Frame-Options`, `nosniff` and `Referrer-Policy`; the push subscriptions file
  is written with mode 0600.
- The VPS root password goes by file descriptors and is cleared from memory once no VPS waits for its
  first setup.

### Channels and routing

- The client route is a resilient nexthop group (`TUNNEL_ROUTING`): a dropped channel no longer takes
  the route of the others down; with a plain multipath route the route is rebuilt within a second.
- A tunnel device held on the VPS by an old SSH session is freed at once (`TUNNEL_KILL_MODE`).
- Rotation works with `ROTATION_ACTIVE_HOSTS_ONLY=0`, `ROTATION_MIN_CHANNEL_INTERVAL` is a real
  minimum, pauses are logged with the reason.
- A host counts as recovered only when one of its channels is online.

### VPS setup

- One setup job per VPS under a session mark, run apart from the SSH session and shown step by step;
  it survives dropped connections, reboots and a closed terminal; the VPS hosts are set up in parallel.
- Missing packages and kernel modules are installed; a VPS that cannot run tunnels, rejects the
  password, refuses password logins or is used by another server is held off with the reason.
- sshd settings go to a drop-in file (or before the first `Match`) and are checked with `sshd -T`;
  IPv6 is turned off on the VPS; interfaces and the public IP are checked; the VPS state lives in
  `/run/tunnelcontrol`; the VPS log is trimmed (`LOG_VPS_MAX_KB`).

### Web panel

- Its own certificate authority (`tun --web-cert`); the panel renews its site certificate by itself,
  without a restart; install steps per system.
- The config editor checks the text while you type and highlights the rejected lines; saves are
  atomic, with optional copies (`WEB_CONFIG_BACKUP_PATH`).
- Push notifications: `WEB_PUSH`, `WEB_PUSH_LOGOUT_UNSUBSCRIBE`, alerts kept for 12 hours, a new
  subscription after a key change, no "stopped" alert during a restart started by the user.
- An app name per server (`WEB_APP_NAME`); the phone layout without a desktop flash; light theme
  fixes; more logs on the Logs tab; Reset App installs the service worker again.

### Install, update, settings

- `tun.config.check` checks every value; `tun --install` asks its questions first and stops the
  tunnels only after the install; `tun --update` installs the latest release without questions and
  removes the files that left the release.
- Settings apply on a restart; the panel restarts only when its own settings changed.
- `LOG_LEVEL` 0–3 is applied the same way everywhere; traffic accounting logs from level 3.
- `tun --monitor`: a number key turns the host under that number on or off.

### Documentation

- README: what runs on the VPS, the server's own traffic; `docs/data-files.md` lists the runtime files.
