# VPS traffic monitor

An optional helper for a VPS of Tunnel Control: it shows the traffic of every tunnel interface (`tun1`,
`tun2`, …) and in total, every 10 seconds, in the same line format as the traffic monitor of the
server. Use it to look at the channels from the VPS side.

It is not part of the release archive and Tunnel Control does not install it: take it from this folder
of the repository.

## Running

Copy `tunnelcontrol-vps-traffic` to the VPS, for example to `/usr/local/bin`, make it executable and run
it as root:

```bash
tunnelcontrol-vps-traffic
```

Every 10 seconds it prints one line per tunnel and a `[TOTAL]` line:

```
[2026-10-08 10:24:31] tun1    | RX:   1.471 MB/s | TX:  98.250 KB/s | RX:   6.103 GB | TX: 702.380 MB
[2026-10-08 10:24:31] [TOTAL] | RX:   4.412 MB/s | TX: 301.776 KB/s | RX:  18.326 GB | TX:   2.107 GB
```

Ctrl+C stops it with all its monitors. Only one copy runs at a time.

To keep it running in the background, start it as a transient systemd unit, watch it in the journal and
stop it with `systemctl`:

```bash
systemd-run --unit tunnelcontrol-vps-traffic /usr/local/bin/tunnelcontrol-vps-traffic
journalctl -fu tunnelcontrol-vps-traffic
systemctl stop tunnelcontrol-vps-traffic
```

## What it shows

- RX and TX are seen from the VPS: RX here is what the server sends into the tunnel, so it matches TX of
  that tunnel in the web panel, and the other way round.
- The totals survive tunnel restarts and restarts of the script; they are kept in
  `/tmp/tunnelcontrol-vps-traffic` and start from zero after a VPS reboot.
- The first line after a start shows no speed yet: speed needs two readings.

## Logs

By default it only prints to the screen and writes nothing to disk. With `LOG_LEVEL=2` it also writes
`/var/log/tun.vps.total.log` (the `[TOTAL]` lines) and `/var/log/tun.vps.verbose.log` (all lines):

```bash
LOG_LEVEL=2 tunnelcontrol-vps-traffic
```

These logs are not rotated: the verbose one grows by about 1 MB a day per tunnel.

## Requirements

bash, `ip`, `awk`, `flock`, `pkill` and GNU `date` — all present on Debian and Ubuntu.
