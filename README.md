# Node-RED nodes for Kontrolojik Device; RelexBox

<https://github.com/Kontrolojik/node-red-relexbox>

Device has;

- 8 relays with status & control,
- 8 inputs with status,
- 4 groups with control,
- 16 presets with control

This package has several nodes;

- relexbox-config
  - Main configuration node, set ip address and port (default: 13013).
- relexbox-input
  - Select the input number for this node, it will display related input status.
- relexbox-relay
  - Select the relay number for this node, it will display related relay status, and let you control state.
- relexbox-relay-on
  - Select the relay number for this node, it will let you set state to ON.
- relexbox-relay-off
  - Select the relay number for this node, it will let you set state to OFF.
- relexbox-relay-toggle
  - Select the relay number for this node, it will let you toggle state.
- relexbox-group-on
  - Select the group number for this node, it will let you set group relay states to ON.
- relexbox-group-off
  - Select the group number for this node, it will let you set group relay states to OFF.
- relexbox-preset
  - Select the preset number for this node, it will let you call state of all relays in the preset.

Example has a Dashboard2.0 flow that uses some of this nodes.
