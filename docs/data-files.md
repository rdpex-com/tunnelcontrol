# Runtime files in DATA_PATH

The components of Tunnel Control talk to each other through small files in `DATA_PATH` (`./data` by
default; the current path is in `./.data_path`). This page lists who writes and who reads each of them
and in what format. It is for whoever changes the code: keep a writer and its readers in step.

Notation: `<N>` is the bare tunnel number (`1`, `2`, …), `tun<N>` is the interface name (`tun1`, …),
`<IP>` is the VPS address from `TUNNELS`.

Two cleanups in `tun` decide how long a file lives:

- **normal cleanup** (`cleanup` in `tun`) runs at every start, restart, install, stop and kill;
- **full cleanup** runs only on the first start and when `TUNNELS` changes; it deletes every `tun_*`
  file except `tun_host_*_configured`, `tun_bytes_total`, `tun_start`, `tun_stop`, `tun_restarting`
  and `tun_routing_mode`.

## Shared files

### Manager and signals

| File | Written by | Read by | Format, example | Lifetime |
| --- | --- | --- | --- | --- |
| `tun_pid` | `tun.manager` (manager loop PID) | `tun` (kills it before a start), `tun.watchdog`, `tun.status`, `tun.toggle`, panel (`helpers.js`: RUNNING and the stopped notification); every reader takes the PID only when `/proc/<PID>/cmdline` has `./tun.manager`, so a PID left from before a reboot and taken by another process is ignored | PID: `12345` | written at start; removed by normal cleanup; left behind by a crash, which is how the watchdog sees it |
| `tun_start` | `tun` on start, restart, install | `tun`, panel (`/api/tun/status`) | epoch seconds: `1791551234` | removed by `tun --stop` and when a start, restart or install fails (an invalid `tun.config` too) while `tun.manager` is not running |
| `tun_restarting` | `tun --restart` and `--install`, `tun.update` before it stops the tunnels, panel Start and Restart | panel (`monitor.js`: no "stopped" notification while it is younger than 15 minutes) | epoch seconds | removed by `tun.manager` once every VPS has been tried |
| `tun_stop` | `tun --stop` (not `--kill`) | every long-running script (existence = stop), panel (time of the stop) | epoch seconds | kept after the stop; removed at the next start |
| `tun_stop_<N>` | `tun --stop`, `tun.rotation.scheduler` (empty = request); `tun.monitor` (`0` = done) | `tun.monitor`, `tun`, `tun.rotation.scheduler`, `tun.test` (its traffic monitor of the tunnel stops on `0`) | empty or `0` | removed by normal cleanup and after a rotation |
| `tun_session` | `tun` (copy of `/run/tunnelcontrol/session`) | `tun.server.setup` (VPS busy mark) | 16 hex characters, no newline: `3fa91c0d7be24e58` | rewritten at every start; after a reboot `tun` takes the mark back from it |
| `tun_bytes_total_adjust` | `tun` (full cleanup) | `tun.test` (adds `tun_bytes_total` into the persisted total, then removes the file) | empty | until the next traffic monitor start |

### Tunnels

| File | Written by | Read by | Format, example | Lifetime |
| --- | --- | --- | --- | --- |
| `tun_state_<N>` | `tun.monitor` | `tun`, `tun.rotation.scheduler`, `tun.status`, `tun.toggle`, panel | `ONLINE:<epoch>` or `OFFLINE:<epoch>`: `ONLINE:1791551234` | the list of these files is the list of tunnels that `tun.status` and the panel show; removed by normal cleanup and while the host is held |
| `tun_host_<N>` | `tun.monitor`, before each connect | `tun.post.balance.routing`, `tun.status`, `tun.toggle`, panel | `<IP>:<port>:<PUBLIC_IP or NA>`: `203.0.113.10:41873:NA` | rewritten on every reconnect; removed by normal cleanup and while the host is held |
| `tun_speed_tun<N>` | `tun.test`, every ~10 s | `tun.status`, panel | `RX: <n.nnn> <KB/s,MB/s,GB/s> TX: …`: `RX: 1.234 MB/s TX: 0.512 KB/s`; no space after the colon once the number takes 8 characters (`RX:1000.000 KB/s`) | removed by normal cleanup |
| `tun_speed_total` | `tun.test` | `tun.status`, panel | as `tun_speed_tun<N>`, summed | removed by normal cleanup |
| `tun_bytes_tun<N>` | `tun.test` (via `.tmp` and `mv`) | `tun.test` (total), `tun.status`, panel | cumulative bytes `<rx> <tx>`: `1834567123 92345678` | survives restarts; removed by full cleanup |
| `tun_bytes_total` | `tun.test` (via `.tmp` and `mv`) | `tun.status`, panel | `<rx> <tx>` | permanent |
| `tun_weight_<N>` | `tun.post.balance` (`WEIGHT` from `TUNNELS`) | `tun.post.balance.routing`, `tun.status`, panel | integer: `40` | removed by normal cleanup |
| `tun_rotation_<N>` | `tun.rotation.scheduler`: `<epoch>` when draining starts, `0` just before the kill | `tun.rotation.scheduler`, `tun.post.balance.routing` (not `0` = keep the slot in multipath), `tun.monitor` (no ping-pong), panel | `1791551234`, then `0` | only during a rotation; removed by the scheduler, by `tun.monitor` when the tunnel is back online, by normal cleanup |
| `tun_removed_<N>` | `tun.post.balance.remove` | `tun.monitor` (run the full `tun.post.balance` next time, then remove) | empty | removed by normal cleanup |
| `tun_last_rotate_<N>` | `tun.monitor` (at start), `tun.rotation.scheduler` (after a rotation) | `tun.rotation.scheduler`, panel | epoch seconds | survives normal cleanup; removed by full cleanup |
| `tun_start_connect_time_<N>` | `tun.monitor`, `tun.rotation.scheduler` | `tun.monitor` | epoch seconds | removed by normal cleanup |
| `tun_connect_duration_<N>` | `tun.monitor` (appends, keeps 10 lines) | `tun.rotation.scheduler` (average) | seconds, one per line | survives restarts; removed by full cleanup |
| `tun_last_online`, `tun_last_offline` | every `tun.monitor` | `tun.rotation.scheduler`; panel (`tun_last_online`) | `<epoch>:<N>`: `1791551234:2` | survive restarts; removed by full cleanup |
| `tun_ssh_exit_code_<N>` | `tun.monitor` (failed ssh master) | `tun.manager` (255 counts as a host error) | integer: `255` | removed after a successful connect and by normal cleanup |

### Hosts

| File | Written by | Read by | Format, example | Lifetime |
| --- | --- | --- | --- | --- |
| `tun_host_<IP>_enabled`, `tun_host_<IP>_disabled` | `tun.toggle`, panel (one of the two) | `tun.monitor`, `tun.rotation.scheduler`, `tun.post.balance.routing`, `tun.status`, `tun.toggle`, panel | empty; enabled when `_enabled` exists or `_disabled` does not | removed by normal cleanup, so the choice lasts until the tunnels restart |
| `tun_host_<IP>_configured` | `tun.server.setup` (the VPS setup job finished; removed when the VPS refuses the key) | `tun`, `tun.manager`, `tun.monitor`, `tun.rotation.scheduler` | empty | permanent |
| `tun_host_<IP>_loaded` | `tun.server.setup` (VPS script loaded) | `tun.monitor` (waits for it), `tun.rotation.scheduler`, `tun.toggle` and panel (only a set up host counts as one that stays enabled) | empty | removed before each load, when the host is held off and by normal cleanup |
| `tun_host_<IP>_held` | `tun.server.setup` | `tun.manager`, `tun.monitor`, `tun.rotation.scheduler`, `tun.toggle` and panel (a held host does not count as one that stays enabled) (existence only) | line 1 `busy`, `setup`, `password` or `vps`, line 2 the message | removed by normal cleanup |
| `tun_ssh_exit_code_<IP>` | `tun.server.setup`, `tun.manager` | `tun.manager` | integer: `6` busy, `7` needs the first setup, `5` wrong password, `8` the VPS cannot run tunnels (all four hold the host), `-1` check failed, ssh codes | removed after a successful setup or connect and by normal cleanup |
| `known_hosts` | OpenSSH (`accept-new`, `HostKeyAlias=<IP>`) | the ssh calls of `tun.server.setup` and `tun.monitor` | OpenSSH known_hosts keyed by the VPS IP | permanent |

### Notifications

| File | Written by | Read by | Format, example | Lifetime |
| --- | --- | --- | --- | --- |
| `queue/message_*.notify`, `queue/message_*` | `tun.manager`, `tun.server.setup` (`.notify`, not written with `WEB_PANEL=0` or `WEB_PUSH=0`), panel (`monitor.js`, no extension) | panel (`push.js`: oldest first, at most 10 a minute; with `WEB_PUSH=0` removed unsent) | the text of one message: `Host 203.0.113.10 is now DEAD (3 tunnels failed)` | until the panel sends it; they pile up while the panel is not running |

## Web panel files

| File | Written by | Read by | Format |
| --- | --- | --- | --- |
| `cert/ca.key`, `cert/ca.pem` | `tun.web.cert create` (install of a new panel, `tun --web-cert`) | `tun.web.cert` (signs the site certificate), `web/routes/static.js` (`/cert.pem` serves `ca.pem`) | PEM; the key never leaves the server |
| `cert/privkey.pem`, `cert/fullchain.pem` | `tun.web.cert` (with the authority, renewed 30 days before the end at install and start), or one self-signed certificate of an older install | `web/listen.js`; `web/routes/static.js` (`/cert.pem`) only without `ca.pem` | PEM; `fullchain.pem` is the site certificate followed by `ca.pem` |
| `vapid.json` | `web/push.js` (when missing) | `web/push.js` | `{ "publicKey": …, "privateKey": … }` |
| `push_subscriptions.json` | `web/push.js` (via `.tmp`, mode 0600) | `web/push.js` | JSON array of browser push subscriptions |
| `web_settings_hash` | `tun.web` at every panel start | `tun --start`, `--restart` (restart the panel when it differs) | sha256 of the `WEB_*` and `LOG_LEVEL` values the panel started with |
| `web_auth.json` | `tun --web-password` (`web/auth-cli.js`, via `.tmp`, mode 0600) | `web/auth.js` (sessions older than `changed` are rejected) | `{"user":…,"salt":…,"hash":…,"changed":<ms>}` |
| `web_sessions.json` | `web/auth.js` (via `.tmp`) | `web/auth.js` | `{"<sha256 of token>":{"created":<ms>,"expires":<ms>}}` |
| `total_speed_history.log` | `tun.test` (720 lines) | `tun.test` | JSON lines `{"ts":…,"rx":…,"tx":…}`, bytes per second |
| `total_history.json` | `tun.test` | panel (`/data/total_history.json`, the chart) | `{ "history": [ {"ts":…,"rx":…,"tx":…}, … ], "last_update": <epoch> }` |

None of these has the `tun_` prefix, so no cleanup touches them; `tun.data.move` moves them with the rest.

## Files of one owner

- `tun`: `tun_config_hash` (hash of `TUNNELS`, decides the full cleanup).
- `tun.deps`: `tun_routing_mode` (`group` or `route`: how the client route is kept, chosen from `TUNNEL_ROUTING`
  and the kernel at every start; read by `tun.post.balance.routing`, `tun.firewall`, `tun.status`; the full
  cleanup keeps it).
- `tun.manager`: `tun_manager_ready` (empty; written once every VPS has been tried, removed when the manager
  starts; `tun.manager`, and with it `tun --start`, returns when it appears).
- `tun.monitor`: `tun_pingpong_lock_<N>`,
  `tun_ssh_<N>.sock` (ssh control socket; other scripts use its path only to find the process),
  `tun_ssh_<N>.sock.lock`, `tun_ssh_err_<N>`, `tun_host_<IP>_config.lock` and `tun_host_<IP>_last_event`
  (shared by the monitors of one host).
- `tun.rotation.scheduler`: `tun_skip_count_<N>`, `tun_host_<IP>.lock` (directory).
- `tun.post.balance`, `tun.post.balance.remove`: `tun_configure_<N>.lock` (directory).
- `tun.post.balance.routing`: `tun_routing_rebuild.lock` (directory).
- `tun.test`: `tun_persist_tun<N>`, `tun_persist_total`, `tun_last_tun<N>`, `tun_last_total` (`<rx> <tx>`;
  survive restarts, removed by full cleanup).
- Temporary files written and renamed in place: `*.tmp`.
