#!/bin/bash
# install.sh

{
set -euo pipefail

INSTALL_DIR="${TUNNELCONTROL_DIR:-/opt/tunnelcontrol}"
RELEASE_URL="${TUNNELCONTROL_URL:-https://github.com/rdpex-com/tunnelcontrol/releases/latest/download}"

say() {
    echo "Tunnel Control: $*"
}

fail() {
    echo "Tunnel Control: error: $*" >&2
    exit 1
}

apt_progress() {
    local label=$1 line pct verb eta status
    local eta_re='\(([^)]*remaining)\)'
    local -a field
    shift
    if [ ! -t 1 ]; then
        DEBIAN_FRONTEND=noninteractive apt-get -qq "$@" > /dev/null 2>&1
        return
    fi
    DEBIAN_FRONTEND=noninteractive apt-get -o APT::Status-Fd=3 "$@" 3>&1 > /dev/null 2>&1 | while IFS= read -r line; do
        IFS=: read -ra field <<< "$line"
        case "${field[0]:-}" in
            dlstatus) verb=Downloading; pct=${field[2]:-} ;;
            pmstatus) verb=Installing; pct=${field[2]:-}; [[ $pct =~ ^[0-9] ]] || pct=${field[3]:-} ;;
            *) continue ;;
        esac
        [[ $pct =~ ^[0-9] ]] || continue
        eta=""
        [[ $line =~ $eta_re ]] && eta=" (${BASH_REMATCH[1]})"
        printf '\r\033[K%s %s: %s%%%s' "$verb" "$label" "${pct%%.*}" "$eta"
    done
    status=${PIPESTATUS[0]}
    printf '\r\033[K'
    return "$status"
}

[ "$(id -u)" -eq 0 ] || fail "run the installer as root"
command -v apt-get > /dev/null 2>&1 || fail "only Debian and Ubuntu (apt) are supported"
command -v systemctl > /dev/null 2>&1 || fail "systemd is required"

if [ -e /usr/local/bin/tun ]; then
    EXISTING=$(dirname "$(readlink -f /usr/local/bin/tun)")
    [ -f "${EXISTING}/tun.defaults" ] || fail "/usr/local/bin/tun already exists and is not Tunnel Control"
    say "already installed in ${EXISTING}; to update run: tun --update"
    exit 0
fi

if [ -e "${INSTALL_DIR}/tun" ]; then
    say "already installed in ${INSTALL_DIR}; to update run: ${INSTALL_DIR}/tun --update"
    exit 0
fi

MISSING=()
for CMD in curl tar gzip; do
    command -v "$CMD" > /dev/null 2>&1 || MISSING+=("$CMD")
done
if [ ${#MISSING[@]} -gt 0 ]; then
    say "installing ${MISSING[*]}..."
    { apt_progress "package lists" update && apt_progress "${MISSING[*]}" install -y "${MISSING[@]}"; } || fail "cannot install ${MISSING[*]}"
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

say "downloading ${RELEASE_URL}/tunnelcontrol.tar.gz..."
CURL_PROGRESS=--silent
[ -t 2 ] && CURL_PROGRESS=--progress-bar
curl -fSL "$CURL_PROGRESS" "${RELEASE_URL}/tunnelcontrol.tar.gz" -o "$TMP/release.tar.gz" || fail "download failed"

mkdir "$TMP/src"
tar -xzf "$TMP/release.tar.gz" -C "$TMP/src" --strip-components=1 2>/dev/null || fail "the download is not a valid archive"
if [ ! -f "$TMP/src/tun" ] || [ ! -f "$TMP/src/VERSION" ] || [ ! -f "$TMP/src/tun.config.example" ]; then
    fail "the archive does not look like a Tunnel Control release"
fi

mkdir -p "${INSTALL_DIR}"
cp -a "$TMP/src/." "${INSTALL_DIR}/"
ln -sfn "${INSTALL_DIR}/tun" /usr/local/bin/tun
[ -e "${INSTALL_DIR}/tun.config" ] || cp "${INSTALL_DIR}/tun.config.example" "${INSTALL_DIR}/tun.config"

say "version $(cat "${INSTALL_DIR}/VERSION") installed in ${INSTALL_DIR}"
say "warning: tun --install reconfigures this server completely (it resets iptables, takes over the routing,"
say "warning: turns on IP forwarding and turns off IPv6) and every VPS in tun.config (sshd_config, a key for"
say "warning: root, iptables); use clean systems that run nothing else"
say "next: fill in CONFIG and TUNNELS in ${INSTALL_DIR}/tun.config, then run: tun --install"
exit 0
}
