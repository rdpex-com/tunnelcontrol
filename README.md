# Tunnel Control™

Tunnel Control keeps a set of standard OpenSSH tunnels (`ssh -w`) up between a Linux server and one
or more VPS hosts, routes the traffic of the local network through them, watches every channel and
shows the whole picture in a web panel.

Nothing of its own is installed on the VPS side: the tunnels are plain OpenSSH, the setup script is
kept in memory (`/run/tunnelcontrol`), only the standard packages the tunnels need are added when
missing, and a VPS only has to accept a root SSH login once, for the initial setup.

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
>   101 and up (one per channel), 200 and 300, the rule priorities 50, 51, 90, 91, 100, 101 and 200
>   and the nexthop ids 3000-3999, turns on IP forwarding and turns off IPv6.
> - After installation the network is configured so that the traffic of the local network never
>   goes out directly again, only through the tunnels: while they are stopped, the clients have no
>   internet, not even ping. The VPS hosts cannot open connections into the local network.
> - On every VPS it changes `sshd_config`, adds its key for root, turns on IP forwarding, turns off
>   IPv6 and resets `iptables`, closing incoming connections except ping and SSH.

## Features

- **Tunnels on plain OpenSSH.** Every channel is an `ssh -w` connection with its own point-to-point
  `tunN` interface on both sides. No installed service on the VPS: while a channel is up, a temporary
  `tun-watch-N` unit waits for its `tunN` interface to close and then removes the channel's rules.
- **Zero-touch VPS setup.** On the first connection the server installs its key on the VPS, adds
  `PermitTunnel` and keepalive to `sshd_config` and builds the firewall, NAT and routing rules there.
  The root password is needed once.
- **Monitoring and recovery.** Each channel is checked by its own ping-pong inside the tunnel and by
  traffic counters; a channel that stops answering is reconnected, and a VPS that went down is set
  up again when it comes back.
- **Balancing.** Live channels form one default route with a weight per channel, so a faster VPS can
  take a larger share. On kernels that support it (5.13 and later; `TUNNEL_ROUTING`) the route is a
  resilient nexthop group: when a channel falls, the kernel drops it at once and the connections of
  the other channels stay where they are; otherwise it is one multipath (ECMP) route, rebuilt when a
  channel falls. The place of a fallen or rotated channel goes to a live channel of the same VPS. The
  kernel picks the channel by the pair of addresses (a device and a server on the internet), so a
  site always sees one user from the same VPS address, and a single download goes through one
  channel rather than adding up their speeds.
- **Rate limit per channel.** `tc tbf` in both directions, ingress through an `ifb` interface.
- **Channel rotation.** With more than one VPS the scheduler reconnects channels on a schedule: it
  waits until the channel's traffic drains, and keeps a minimum interval per channel
  (`ROTATION_MIN_CHANNEL_INTERVAL`, 15 minutes by default, counted from the start too, so the first
  rotation comes that long after a start) and a minimum uptime before it touches anything.
- **Web panel.** Channel status, traffic charts, the log, a config editor, start and stop, push
  notifications. HTTPS with a certificate you can install on your devices. Optional: a console-only
  install uses `tun --status` and `tun --monitor` instead.
- **Updates keep your data.** `tun --update` replaces only the code and removes the files that left
  the release; `tun.config`, the per-VPS setup files, `data/` and `bak/` are never touched.

## Requirements

**Server** — Debian or Ubuntu with systemd, root. `tun --install` installs what is missing
(`iproute2`, `iptables`, `conntrack`, `openssh-client`, `sshpass`, `gawk`, and for the web panel
Node.js 20+ and its packages) and checks in a scratch network namespace that the kernel can do what
the manager needs:
`tun` devices, policy routing, ECMP, conntrack, `tc tbf` and `ifb`.

**Local network** — channel N uses the addresses `10.N.N.1` (server) and `10.N.N.2` (VPS), so a
local network in `10.0.0.0/8` must not overlap them; `192.168.0.0/16` and `172.16.0.0/12` are safe.
This is not checked.

**VPS** — Debian or Ubuntu with systemd, root over SSH, and `/dev/net/tun` available (on OpenVZ or
LXC hosting enable TUN/TAP in the hosting panel first).

Both should be clean systems that run nothing else: Tunnel Control reconfigures them completely,
see the warning at the top of this page.

A VPS serves one server at a time. Another server, or a copy of a virtual machine with the same
setup, that tries to set up a VPS while the tunnels of its current server are up is refused and
touches nothing there. A VPS that answers busy is asked once more after a minute, because after a
crash of the server (power loss, hard reset) its own old sessions stay on the VPS for up to 30 seconds.
Every VPS is set up on its own, so this wait or an unreachable VPS does not hold back the tunnels of the others.
If it is still busy, the server logs that the VPS is used by another Tunnel Control server, with the first
eight characters of that server's session mark (every server logs its own at the tunnel start), sends one push
notification (without the mark) and leaves that VPS out until its tunnels are restarted: no retries, and its tunnels
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
   whenever a VPS needs its first setup (an empty answer skips it: the VPS already set up start, a
   new one is held off until `tun --install` is run with the password). Running it again is safe — your config and data are left
   alone, and running tunnels are stopped only after the questions and the install of the services
   and the panel, for the restart itself; if that install fails, they go on as before.
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
| `tun --web-cert` | new panel certificate authority and site certificate; install the new certificate on every device again |
| `tun --version` | installed version |
| `tun --help` | the list of commands; `tun` without a command or with an unknown one prints it too and changes nothing |
| `tun --status` | whether the tunnels run from the console or as the `tun` service, the service, the web panel, then Global Stats, Active Tunnels and System Information as in the web panel: every host with its tunnels (state, port, weight, speed, traffic), CPU, RAM, disk and host data |
| `tun --monitor [N]` | the same, redrawn every `N` seconds (3 by default); keys `1`–`9` turn the host with that number on or off, as `tun --toggle` does; `q` quits |
| `tun --toggle <IP>` | turn a host on or off, like its switch in Active Tunnels of the web panel: the tunnels of a turned off host leave the routing and keep rotating as usual; a host cannot be turned off while it is the only one with working tunnels or the last enabled one, a host whose tunnels are all down can; holds until the tunnels restart. Without an address it lists the hosts with their state |

The tunnels and the panel are installed as the systemd units `tun.service` and `tun-web.service`, so
both come back after a reboot.

## Configuration

`tun.config` is yours: it is created from `tun.config.example`, an update never overwrites it, and
`tun.config.check` validates it before every start and when the panel saves it — it may contain
nothing but settings, every value must fit its setting (addresses, ports, ranges, interface names,
numbers, units), and the tunnels do not start while it is still identical to the example. Values
may be written in double quotes, in single quotes or without quotes; a value with a space, `;`, `&`
or a similar character needs quotes. While you type in the panel's editor, the lines the check
rejects are highlighted, and the cursor on such a line shows why. Before each save the panel keeps a
copy of the old file in `WEB_CONFIG_BACKUP_PATH` (`bak/` next to tun by default; an absolute path such
as `/run/tunnelcontrol/bak` keeps the copies in memory until a reboot, and an empty value keeps none).

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

The server's own outgoing connections take the same way: while the tunnels are up they go through
the tunnels too, except the connections to the VPS addresses and to the local network. While the
tunnels are stopped, the server itself, unlike the clients, goes out directly.

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
moved on the next start; a tmpfs mount point works. Every VPS setup connects with the key of this
server first, so a VPS set up before needs no password again, even after a reboot with `DATA_PATH`
on tmpfs; a VPS that refuses the key and needs its first setup is held off with a message to run
`tun --install`, without retries, until the tunnels are restarted. So is a VPS that rejects the
root password entered in `tun --install`: retrying the same password cannot help, and one that does
not let root log in with a password at all (`PermitRootLogin prohibit-password` or
`PasswordAuthentication no`, common on cloud images): allow it once, or put the key from
`/root/.ssh/id_ed25519_tun.pub` of this server into its `authorized_keys` by hand. So is a VPS
that lacks what tunnels need (`/dev/net/tun`, `PermitTunnel`, `ip_forward`, the NAT or REDIRECT
rule, the `IN_IFACE` interface, or `OUT_IFACE` with a `PUBLIC_IP`): the setup checks the VPS each time and names the reasons; lesser problems are only logged.
Before that check a setup job on the VPS installs the key, the sshd settings and with apt what the
VPS is missing (`iproute2`, `iptables`, `procps`, `kmod`, `linux-modules-extra` for the running kernel);
it runs apart from the ssh session, so a broken link does not stop it, and the next attempt waits for it.
A VPS is expected to run Debian or Ubuntu.

Everything else has a default in `tun.defaults`, one commented line per setting: logging, timeouts
and keepalive, cipher, MTU, rotation, shaping and the panel (`WEB_*`). Do not edit that file — put
the line you want to change into `tun.config`:

```bash
LOG_LEVEL=2
SHAPING_RATE="50mbit"
ROTATION_MIN_UNIQUE_HOSTS=1
WEB_HTTPS_PORT=9443
```

A change applies when the tunnels start or restart: `tun --restart` or Restart in the panel. When a
`WEB_*` setting or `LOG_LEVEL` differs from what the panel started with, the panel restarts with
them, so its settings apply too.

### Logs

`LOG_LEVEL` sets how much goes to the console and the logs:

| Level | What is logged |
| --- | --- |
| `0` | errors and warnings |
| `1` | default: plus key events — install, start and stop, VPS setup, update |
| `2` | plus all other messages, in `/var/log/tun.verbose.log`, and the total traffic log `/var/log/tun.mon.total.log` |
| `3` | plus debug messages, the panel request log and the traffic accounting logs `/var/log/tun.mon.verbose.log` and `/var/log/tun.mon.debug.log` |

`/var/log/tun.log` keeps errors and warnings at every level and key events from level 1,
`/var/log/tun.web.log` is the panel's own log. The Logs tab of the panel lists the main log and the
other log files that exist, except the panel's own log: at level 3 every request is logged, so reading
it there would keep adding to it. After the level is lowered, it also warns how much the logs of the
higher level take in `/var/log`, until they are deleted.
`tun --install` adds `/etc/logrotate.d/tun`: a log over 10 MB is rotated at the daily logrotate
run, two compressed copies are kept.

On every VPS the log is `/var/log/tun.log`. With `LOG_VPS_FILE="/tmp/tun.log"` it is kept in `/tmp`
and leaves nothing behind after a VPS reboot. The VPS log is not rotated: each setup of the VPS trims it
when it is larger than `LOG_VPS_MAX_KB` (1024 KB by default, 0 = never), keeping the last half.

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
Installed as an app it is named `Tunnel Control <WEB_APP_NAME>`; `tun --install` writes the host name of
the server into `WEB_APP_NAME` in `tun.config`, and you may change it (up to 48 characters, without
`/ : * ? < > |`). Apps of several servers must not
share a name: on Windows, Chrome shows the notifications of an app
whose shortcut got a ` (1)` name as its own. An app installed under an earlier name keeps its shortcut
until it is installed again.

- `tun --web-password` sets the login and password; `WEB_AUTH=0` in `tun.config` turns the login off.
- `https://<server address>:8443/cert.pem` is the certificate of the panel's own certificate authority,
  to install on a phone or a PC. The authority issues the site certificate of the panel, which the
  panel renews by itself before it ends, also while the tunnels run (`WEB_CERT_SITE_DAYS`, 825 days by
  default, the most iPhone and Mac accept), with no new install on the devices and no restart; a
  tunnel start also issues it again when the panel address (`WEB_CERT_ADDRESS`, or the IP of the
  `CONFIG` interface) or `WEB_CERT_SITE_DAYS` changed, with a warning in the log; the devices keep
  trusting it.
  `WEB_CERT_DAYS`, the validity of the authority itself, applies on `tun --web-cert`. A panel
  installed earlier has one self-signed certificate, which Firefox rejects; `tun --web-cert` replaces
  it. On Windows install it into Trusted Root
  Certification Authorities of the Local Machine: Firefox reads only that store. Then restart Chrome
  with `chrome://restart`: closing its windows is not enough, it keeps running in the background and
  remembers the old certificate decision. Firefox keeps an accepted warning as a server exception for
  good: delete the panel address on the Servers tab of its certificate manager and restart it. The
  panel shows the steps for the device it is opened on.
- `?debug=1` and `?debug=0` in the panel address turn debug mode on and off; the browser remembers it,
  and Hide in the debug log turns it off.
- **Enable Push Notifications** on the System tab subscribes the browser; it is shown in every browser
  that supports push until it is subscribed (on iPhone and iPad only in the panel added to the home
  screen). On Android and in Chrome on a computer the panel asks for permission by itself when it
  opens; Safari, Firefox and Edge show a permission request only after a click. When notifications
  are blocked for the panel in the browser, the button stays and its click says how to allow them.
- When the panel's push keys are made anew (`vapid.json` lost or removed), the old subscriptions
  are dropped, and a device that was subscribed subscribes again by itself the next time it opens
  the panel.
- The panel header shows RUNNING while the tunnel manager runs (`data/tun_pid`), as the `tun` service or
  started from the console, also when its hosts are held off or still being set up. When they have not been running for 30 seconds, the panel sends one push notification; a
  restart (`tun --restart`, `--install`, `--update`, the panel's Start and Restart) or the start of
  the panel itself sends none, a stop does.
- `WEB_PUSH=0` in `tun.config` turns push notifications off: the panel does not create or load its keys, shows no
  button, does not ask the browser for permission and drops the queued messages; `tun --install` does
  not ask for the e-mail.
- `WEB_PUSH_LOGOUT_UNSUBSCRIBE=1` in `tun.config` makes Log Out in the panel also unsubscribe that
  device from push notifications; by default a device keeps getting them after Log Out.
- `WEB_PUSH_EMAIL` is the contact e-mail for push notifications. Apple devices (iPhone, iPad, Safari
  on Mac) need a real address; `tun --install` asks for it while it is the default `root@localhost`.
  After a change the devices stay subscribed.
- The other `WEB_*` settings in `tun.defaults` cover the login, the listen address, ports, HTTP
  instead of HTTPS and the certificate.

## Extras

`contrib/` holds optional helpers that are not part of the release archive:

- `contrib/vmware-host` is for a server that runs as a VMware Workstation virtual machine: scripts
  for the host that pass its temperatures into the web panel.
- `contrib/vps-traffic` shows the traffic of every tunnel and in total on the VPS side, in the same
  line format as the traffic monitor of the server.

## Development

The components exchange their state through small files in `DATA_PATH`; who writes and who reads
each of them, and in what format, is in [docs/data-files.md](docs/data-files.md).

## Status

Version 0.2.0 — early. It is developed and run on Debian and Ubuntu; nothing else has been tested.
The changes of each release are in [CHANGELOG.md](CHANGELOG.md).
Issues and pull requests are welcome.

## License

GNU GPL v3.0, see [LICENSE](LICENSE). The web panel ships third-party files (Chart.js,
Tailwind CSS, Font Awesome) under their own licenses, listed in
[THIRD-PARTY-NOTICES](THIRD-PARTY-NOTICES).
