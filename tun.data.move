#!/bin/bash
# tun.data.move <old_path> <new_path>

if [ -z "${DATA_PATH}" ]; then
    echo "Error: DATA_PATH environment variable is not set. Do not run this script directly."
    exit 1
fi

source ./tun.logger

OLD_PATH=$(realpath -m "${1}")
NEW_PATH=$(realpath -m "${2}")
NEW_PATH_RAW=${2}
WEB_SERVICE="tun-web.service"

DATA_ITEMS=(
    "tun_*"
    "known_hosts"
    "cert"
    "queue"
    "vapid.json"
    "push_subscriptions.json"
    "total_history.json"
    "total_speed_history.log*"
    "web_auth.json"
    "web_sessions.json"
    "web_settings_hash"
)

SYSTEM_DIRS=(/ /tmp /var/tmp /dev/shm /run /mnt /media /srv /opt /home /root /var /etc /usr)

LOG NOTICE "Data path changed: ${OLD_PATH} → ${NEW_PATH}"

if ! { [ -d "$NEW_PATH" ] || { mkdir -p "$(dirname "$NEW_PATH")" && mkdir -m 700 "$NEW_PATH"; }; }; then
    LOG ERROR "Cannot create data path ${NEW_PATH}"
    exit 1
fi

WEB_ACTIVE=false
if systemctl is-active --quiet "$WEB_SERVICE"; then
    WEB_ACTIVE=true
    systemctl stop "$WEB_SERVICE"
fi

FAILED=0
MOVED=0

if [ -d "$OLD_PATH" ]; then
    shopt -s nullglob
    for pattern in "${DATA_ITEMS[@]}"; do
        for item in "$OLD_PATH"/$pattern; do
            [ -e "$item" ] || [ -L "$item" ] || continue
            name=$(basename "$item")
            case "${NEW_PATH}/" in
                "${item}/"*) continue ;;
            esac
            if [ -S "$item" ]; then
                rm -f "$item"
            elif [ -d "$item" ] && [ ! -L "$item" ]; then
                if mkdir -p "${NEW_PATH}/${name}" && cp -a "${item}/." "${NEW_PATH}/${name}/"; then
                    rm -rf "$item"
                    MOVED=$((MOVED + 1))
                else
                    LOG ERROR "Cannot move ${item} to ${NEW_PATH}"
                    FAILED=1
                fi
            elif mv -f "$item" "${NEW_PATH}/${name}"; then
                MOVED=$((MOVED + 1))
            else
                LOG ERROR "Cannot move ${item} to ${NEW_PATH}"
                FAILED=1
            fi
        done
    done
    shopt -u nullglob

    LOG NOTICE "Moved ${MOVED} item(s) from ${OLD_PATH} to ${NEW_PATH}"

    if [ "$FAILED" -eq 0 ]; then
        if [ -n "$(ls -A "$OLD_PATH" 2>/dev/null)" ]; then
            LOG INFO "Previous data path ${OLD_PATH} still has other files, kept"
        elif [[ " ${SYSTEM_DIRS[*]} " == *" ${OLD_PATH} "* ]] || mountpoint -q "$OLD_PATH"; then
            LOG INFO "Previous data path ${OLD_PATH} is a system folder or a mount point, kept"
        elif rmdir "$OLD_PATH"; then
            LOG INFO "Previous data path ${OLD_PATH} removed"
        fi
    fi
else
    LOG WARN "Previous data path ${OLD_PATH} not found, nothing to move"
fi

if [ "$FAILED" -eq 0 ]; then
    echo "$NEW_PATH_RAW" > ./.data_path
fi

if [ "$WEB_ACTIVE" = true ]; then
    systemctl start "$WEB_SERVICE"
fi

exit "$FAILED"
