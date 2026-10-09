# VMware host scripts

Optional helpers for a Tunnel Control server that runs as a VMware Workstation virtual machine on a
Linux host. A virtual machine cannot read the sensors of the host, so these scripts run on the host
and pass its temperatures into the VM, where `tun.sysinfo` shows them in the web panel next to the
CPU, RAM and disk of the VM itself.

They are not part of the release archive: take them from this folder of the repository.

## How it works

- `tunnelcontrol-host-info --once` prints one line: CPU load, RAM and disk of the host, then the
  temperatures listed in `SENSORS`. Without `--once` it redraws that line every second.
- `tunnelcontrol-guestinfo <vm.vmx>` writes the line into the `guestinfo.sysinfo` variable of the
  VM with `vmrun`.
- In the VM, `tun.sysinfo` reads `guestinfo.sysinfo` through VMware Tools and shows the fields that
  end in °C.

## Requirements

- Host: Linux, VMware Workstation (`vmrun`), `lm-sensors` (`sensors`).
- VM: `open-vm-tools`.

## Setup on the host

1. Copy both scripts into one folder, for example `/usr/local/bin`, and make them executable.
2. Run `sensors` and list the readings you want in `SENSORS` at the top of `tunnelcontrol-host-info`.
   Each entry is `Label=sensor`, where `sensor` is the name at the start of a `sensors` line:
   `Tctl` for an AMD CPU, `Package id 0` for an Intel CPU, `edge` for an AMD GPU, `Composite` for
   an NVMe disk.
3. Check the line: `tunnelcontrol-host-info --once`.
4. Add a cron job for the user who runs the VM (`crontab -e` as that user, since `vmrun` reaches the
   VM as the user who started it):

   ```
   * * * * * /usr/local/bin/tunnelcontrol-guestinfo /path/to/the/vm.vmx
   ```

Inside the VM, `tun.sysinfo --once` now ends with the host temperatures, and the web panel shows
them.
