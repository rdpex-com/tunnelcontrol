# Tunnel Control™

Tunnel Control keeps a set of standard OpenSSH tunnels (`ssh -w`) up between a Linux server and one
or more VPS hosts, routes the traffic of the local network through them, watches every channel and
shows the whole picture in a web panel.

Nothing custom runs on the VPS side: the tunnels are plain OpenSSH, and a VPS only has to accept a
root SSH login once, for the initial setup.

```
   local network              server                       VPS hosts
 192.168.0.0/16  --eth0-->  Tunnel Control  --ssh -w-->  tun1 -->  203.0.113.10
                            balancing       --ssh -w-->  tun2 -->  203.0.113.10
                            monitoring      --ssh -w-->  tun3 -->  198.51.100.7
                            web panel
```

> [!WARNING]
> Tunnel Control reconfigures the server and every VPS completely, so install it on clean systems
> that run nothing else.
>
> - On the server it resets `iptables` on every start, takes over the routing tables 50, 51, 100,
>   200 and 300, turns on IP forwarding and turns off IPv6.
> - On every VPS it changes `sshd_config`, adds its key for root, turns on IP forwarding and resets
>   `iptables`, closing incoming connections except ping and SSH.

## Features

- **Tunnels on plain OpenSSH.** Every channel is an `ssh -w` connection with its own point-to-point
  `tunN` interface on both sides. No daemon and no extra packages on the VPS.
- **Zero-touch VPS setup.** On the first connection the server installs its key on the VPS, adds
  `PermitTunnel` and keepalive to `sshd_config` and builds the firewall, NAT and routing rules there.
  The root password is needed once.
- **Monitoring and recovery.** Each channel is checked by its own ping-pong inside the tunnel and by
  traffic counters; a channel that stops answering is reconnected, and a VPS that went down is set
  up again when it comes back.
- **Balancing.** Live channels form one multipath (ECMP) default route with a weight per channel, so
  a faster VPS can take a larger share. A channel that drops out is taken out of the route.
- **Rate limit per channel.** `tc tbf` in both directions, ingress through an `ifb` interface.
- **Channel rotation.** With more than one VPS the scheduler reconnects channels on a schedule: it
  waits until the channel's traffic drains, and keeps a minimum interval per channel and a minimum
  uptime before it touches anything.
- **Web panel.** Channel status, traffic charts, the log, a config editor, start and stop, push
  notifications. HTTPS with a certificate you can install on your devices. Optional: a console-only
  install uses `tun --status` and `tun --monitor` instead.
- **Updates keep your data.** `tun --update` replaces only the code; `tun.config`, the per-VPS setup
  files, `data/` and `bak/` are never touched.

## Requirements

**Server** — Debian or Ubuntu with systemd, root. `tun --install` installs what is missing
(`iproute2`, `iptables`, `conntrack`, `openssh-client`, `sshpass`, `gawk`, and for the web panel
Node.js 20+ and its packages) and checks in a scratch network namespace that the kernel can do what
the manager needs:
`tun` devices, policy routing, ECMP, conntrack, `tc tbf` and `ifb`.

**VPS** — Debian or Ubuntu with systemd, root over SSH, and `/dev/net/tun` available (on OpenVZ or
LXC hosting enable TUN/TAP in the hosting panel first).

Both should be clean systems that run nothing else: Tunnel Control reconfigures them completely,
see the warning at the top of this page.

A VPS serves one server at a time. Another server, or a copy of a virtual machine with the same
setup, that tries to set up a VPS while the tunnels of its current server are up is refused and
touches nothing there. It logs that the VPS is used by another Tunnel Control server, sends one push
notification and leaves that VPS out until its tunnels are restarted: no retries, and its tunnels
are not listed in `tun --status` or in the panel. The VPS becomes free when the tunnels of its current server are gone or
the VPS reboots.

## Installation

```bash
curl -fsSL https://tunnelcontrol.app/install.sh | bash
```

This installs the latest release into `/opt/tunnelcontrol`, links it as `/usr/local/bin/tun` and
creates `tun.config` from the example. For another folder:

```bash
curl -fsSL https://tunnelcontrol.app/install.sh | TUNNELCONTROL_DIR=/srv/tunnelcontrol bash
```

Or from git, which also makes `tun --update` a `git pull`:

```bash
git clone https://github.com/rdpex-com/tunnelcontrol.git /opt/tunnelcontrol && /opt/tunnelcontrol/tun --install
```

For a console-only server without the web panel and Node.js, add `WEB_PANEL=0` to `tun.config`
before `tun --install`; `tun --status` and `tun --monitor` then show the state in the terminal.

## Quick start

1. Fill in `CONFIG` and `TUNNELS` in `/opt/tunnelcontrol/tun.config` — see
   [Configuration](#configuration).
2. Run `tun --install`: dependencies, systemd units, the panel, the first VPS setup and the tunnels.
   It asks for an e-mail for push notifications until you set one, and for the VPS root password
   whenever a VPS needs its first setup. Running it again is safe — your config and data are left
   alone.
3. Run `tun --web-password` to set the panel login, then open `https://<server address>:8443`.

## Commands

| Command | What it does |
| --- | --- |
| `tun --install` | install and initialize: dependencies, services, first VPS setup. Without `tun.config` it creates one from the example and stops |
| `tun --start` | start the tunnels |
| `tun --restart` | restart the tunnels |
| `tun --stop` | graceful stop |
| `tun --kill` | immediate stop |
| `tun --update` | update the code: `git pull`, or the latest release from GitHub when installed with `install.sh`; `tun --install` runs afterwards |
| `tun --web-password` | set the panel login and password (signs out every open session) |
| `tun --version` | installed version |
| `tun --help` | the list of commands; `tun` without a command or with an unknown one prints it too and changes nothing |
| `tun --status` | whether the tunnels run from the console or as the `tun` service, the service, the web panel, then Global Stats, Active Tunnels and System Information as in the web panel: every host with its tunnels (state, port, weight, speed, traffic), CPU, RAM, disk and host data |
| `tun --monitor [N]` | the same, redrawn every `N` seconds (3 by default); keys `1`–`9` turn the host with that number on or off, as `tun --toggle` does; `q` quits |
| `tun --toggle <IP>` | turn a host on or off, like its switch in Active Tunnels of the web panel: the tunnels of a turned off host leave the routing and the rotation; the last active host cannot be turned off; holds until the tunnels restart. Without an address it lists the hosts with their state |

The tunnels and the panel are installed as the systemd units `tun.service` and `tun-web.service`, so
both come back after a reboot.

## Configuration

`tun.config` is yours: it is created from `tun.config.example`, an update never overwrites it, and
`tun.config.check` validates it before every start — it may contain nothing but settings, and the
tunnels do not start while it is still identical to the example.

```bash
CONFIG="eth0:192.168.0.0/16"

# HOST:PORT:PORT_RANGE:IN_IFACE:PUBLIC_IP:OUT_IFACE:WEIGHT

TUNNELS=(
    "203.0.113.10:22222:22223-65535:eth0:NA:NA:40"
    "203.0.113.10:22222:22223-65535:eth0:NA:NA:40"
    "203.0.113.10:22222:22223-65535:eth0:NA:NA:40"
    # "198.51.100.7:22222:22223-65535:eth0:198.51.100.8:eth0:40"
)

DATA_PATH="./data"
```

`CONFIG` is the interface the clients are on and their subnet. Traffic that arrives on that
interface is routed into the tunnels, while the subnet itself keeps using the normal routing table,
so the server stays reachable from the local network.

One line in `TUNNELS` is one channel; several lines with the same host are several channels to the
same VPS. Three channels per VPS are recommended for the smoothest rotation: it reconnects one
channel at a time, and while that channel is down, the other channels of the same VPS carry its
share of the traffic. The commented line is a VPS with an extra public IP: the traffic of its
channels leaves the VPS from `198.51.100.8` on `eth0`.

| Field | Meaning |
| --- | --- |
| `HOST` | VPS address |
| `PORT` | SSH port of the VPS; sshd has to accept connections there |
| `PORT_RANGE` | each channel connects on a random port out of this range, which the VPS redirects to `PORT` |
| `IN_IFACE` | the VPS interface the tunnel traffic leaves through |
| `PUBLIC_IP` | an extra public IP of the VPS to use as the source address, or `NA` |
| `OUT_IFACE` | the interface that extra IP belongs to, or `NA` |
| `WEIGHT` | the channel's share of the traffic in balancing |

`DATA_PATH` is the runtime folder: state, counters, `known_hosts`. When the path changes, the data is
moved on the next start; a tmpfs mount point works.

Everything else has a default in `tun.defaults`, one commented line per setting: logging, timeouts
and keepalive, cipher, MTU, rotation, shaping and the panel (`WEB_*`). Do not edit that file — put
the line you want to change into `tun.config`:

```bash
LOG_LEVEL=2
SHAPING_RATE="50mbit"
ROTATION_MIN_UNIQUE_HOSTS=1
WEB_HTTPS_PORT=9443
```

### Logs

`LOG_LEVEL` sets how much goes to the console and the logs; it applies when the tunnels restart
(`tun --restart`), the panel request log when the panel restarts (`systemctl restart tun-web`):

| Level | What is logged |
| --- | --- |
| `0` | errors and warnings |
| `1` | default: plus key events — install, start and stop, VPS setup, update |
| `2` | plus all other messages, in `/var/log/tun.verbose.log`, and the traffic monitor logs `/var/log/tun.mon.*.log` |
| `3` | plus debug messages, the panel request log and the traffic monitor debug log |

`/var/log/tun.log` keeps errors, warnings and key events at every level, `/var/log/tun.web.log` is
the panel's own log. The Logs tab of the panel lists the main log and the other log files that
exist. After the level is lowered, it also warns how much the logs of the higher level take in
`/var/log`, until they are deleted.
`tun --install` adds `/etc/logrotate.d/tun`: a log over 10 MB is rotated at the daily logrotate
run, two compressed copies are kept.

On every VPS the log is `/var/log/tun.log`. With `LOG_VPS_FILE="/tmp/tun.log"` it is kept in `/tmp`
and leaves nothing behind after a VPS reboot; the path applies on the next VPS setup, for example
`tun --restart`.

### Per-VPS commands

A VPS is expected to be clean, because its firewall is managed as well: on every setup `iptables` is
reset and incoming connections are closed except ping, SSH on port 22 and `PORT`, and `PORT_RANGE`
for the server. When one VPS needs something of its own, put it in `tun.server.setup.<VPS IP>` next
to `tun`:

```bash
iptables -I INPUT 1 -p tcp --dport 443 -j ACCEPT
```

It is a piece of shell that runs as root on that VPS right after the base rules, on every setup.
Unix line endings only; updates leave the file alone.

## Web panel

`https://<server address>:8443` — status of every channel, traffic charts, the log, the config
editor, start and stop, push notifications. It is a PWA and can be added to a phone's home screen.

- `tun --web-password` sets the login and password; `WEB_AUTH=0` in `tun.config` turns the login off.
- `https://<server address>:8443/cert.pem` is the panel certificate, to install on a phone or a PC.
- `?debug=1` and `?debug=0` in the panel address turn debug mode on and off; the browser remembers it.
- `WEB_PUSH_EMAIL` is the contact e-mail for push notifications. Apple devices (iPhone, iPad, Safari
  on Mac) need a real address; `tun --install` asks for it while it is the default `root@localhost`.
  Change it in `tun.config` at any time: the panel uses it from the next notification, and devices
  stay subscribed.
- The other `WEB_*` settings in `tun.defaults` cover the listen address, ports, HTTP instead of
  HTTPS and the certificate. They apply after `systemctl restart tun-web`.

## Extras

`contrib/` holds optional helpers that are not part of the release archive:

- `contrib/vmware-host` is for a server that runs as a VMware Workstation virtual machine: scripts
  for the host that pass its temperatures into the web panel.
- `contrib/vps-traffic` shows the traffic of every tunnel and in total on the VPS side, in the same
  line format as the traffic monitor of the server.

## Status

Version 0.1.0 — early. It is developed and run on Debian and Ubuntu; nothing else has been tested.
Issues and pull requests are welcome.

## License

GNU GPL v3.0, see [LICENSE](LICENSE). The web panel ships third-party files (Chart.js, htmx,
Tailwind CSS, Font Awesome) under their own licenses, listed in
[THIRD-PARTY-NOTICES](THIRD-PARTY-NOTICES).
