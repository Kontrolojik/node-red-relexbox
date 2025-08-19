const net = require('net');

module.exports = function(RED) {
    // Configuration node
    function RelexBoxConfigNode(n) {
        RED.nodes.createNode(this, n);
        this.name = n.name;
        this.host = n.host || 'localhost';
        this.port = n.port || 8080;
        this.settings = n.settings || {};

        // Initialize instance-specific arrays
        this.inputs = new Array(8).fill(0);
        this.relays = new Array(8).fill(0);

        // Create instance-specific client manager
        this.clientManager = {
            client: null,
            config: null,
            listeners: new Set(),
            reconnectTimeout: null,
            reconnectAttempts: 0,
            maxReconnectAttempts: 60,
            reconnectDelay: 10000,
            pingTimeout: null,
            pingDelay: 55000,
            
            createClient(config) {
                if (!config || !config.host || !config.port) {
                    this.notifyListeners('error', new Error("Invalid configuration: host and port are required"));
                    return;
                }

                if (this.client) {
                    this.client.destroy();
                }

                this.config = config;
                this.client = new net.Socket();
                
                this.client.on('connect', () => {
                    this.reconnectAttempts = 0;
                    clearTimeout(this.reconnectTimeout);
                    this.notifyListeners('connect');
                });

                this.client.on('error', (err) => {
                    this.notifyListeners('error', err);
                    clearInterval(this.pingTimeout);
                    this.attemptReconnect();
                });

                this.client.on('close', () => {
                    this.notifyListeners('close');
                    clearInterval(this.pingTimeout);
                    this.attemptReconnect();
                });

                this.client.on('data', (data) => {
                    this.notifyListeners('data', data);
                    clearInterval(this.pingTimeout);
                    this.pingTimeout = setInterval(() => {
                        try {
                                const command = `PING\r`;
                                if (!this.write(command)) {
                                    node.error("Failed to write command to RelexBox");
                                }
                            } catch (error) {
                                node.error("Error getting initial states: " + error.message);
                            }
                    }, this.pingDelay);
                });

                this.client.setKeepAlive(true, 60000);
                this.client.setNoDelay(true);

                try {
                    this.client.connect(config.port, config.host);
                } catch (err) {
                    this.notifyListeners('error', err);
                    this.attemptReconnect();
                }
            },

            attemptReconnect() {
                if (this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.reconnectAttempts++;
                    this.notifyListeners('reconnecting', this.reconnectAttempts);
                    this.reconnectTimeout = setTimeout(() => {
                        this.createClient(this.config);
                    }, this.reconnectDelay);
                } else {
                    this.notifyListeners('connectionFailed');
                }
            },

            addListener(node) {
                this.listeners.add(node);
                if (this.client) {
                    node.status(this.client.connecting ? 
                        {fill:"yellow", shape:"ring", text:"connecting"} :
                        {fill:"green", shape:"dot", text:"connected"});
                }
            },

            removeListener(node) {
                this.listeners.delete(node);
            },

            notifyListeners(event, data) {
                this.listeners.forEach(node => {
                    switch(event) {
                        case 'connect':
                            node.status({fill:"green", shape:"dot", text:"connected"});
                            try {
                                const command = `::CMD_STAT\n`;
                                if (!this.write(command)) {
                                    node.error("Failed to write command to RelexBox");
                                }
                            } catch (error) {
                                node.error("Error getting initial states: " + error.message);
                            }

                            break;
                        case 'error':
                            node.status({fill:"red", shape:"ring", text:"error"});
                            node.error("RelexBox connection error: " + data.message);
                            break;
                        case 'close':
                            node.status({fill:"red", shape:"ring", text:"disconnected"});
                            break;
                        case 'reconnecting':
                            node.status({fill:"yellow", shape:"ring", text:`reconnecting (${data})`});
                            break;
                        case 'connectionFailed':
                            node.status({fill:"red", shape:"ring", text:"connection failed"});
                            node.error("Max reconnection attempts reached. Please check your connection settings.");
                            break;
                        case 'data':
                            if (typeof node.handleData === 'function') {
                                node.handleData(data);

                            }
                            break;
                    }
                });
            },

            write(data) {
                if (this.client && this.client.writable) {
                    this.client.write(data);
                    return true;
                }
                return false;
            },

            close() {
                if (this.client) {
                    this.client.destroy();
                }
                clearTimeout(this.reconnectTimeout);
            }
        };

        // Create or update client when config changes
        if (this.host && this.port) {
            this.clientManager.createClient({
                host: this.host,
                port: this.port
            });
        }

        // Clean up on close
        this.on('close', function() {
            if (this.clientManager) {
                this.clientManager.close();
            }
        });
    }
    RED.nodes.registerType("relexbox-config", RelexBoxConfigNode);

    // Helper function to get client manager from config node
    function getClientManager(node) {
        const config = RED.nodes.getNode(node.config);
        if (!config) {
            node.error("Missing configuration");
            return null;
        }
        return config.clientManager;
    }

    // Helper function to get instance arrays from config node
    function getInstanceArrays(node) {
        const config = RED.nodes.getNode(node.config);
        if (!config) {
            node.error("Missing configuration");
            return null;
        }
        return { inputs: config.inputs, relays: config.relays };
    }

    // Relay node
    function RelexBoxRelayNode(n) {
        RED.nodes.createNode(this, n);
        this.config = n.config;
        this.name = n.name;
        this.relayIndex = n.relayIndex || 1;
        this.relayState = n.relayState || false;

        var node = this;
        const configNode = RED.nodes.getNode(this.config);
        
        if (!configNode) {
            node.error("Missing configuration");
            return;
        }

        const clientManager = configNode.clientManager;
        const instanceArrays = { relays: configNode.relays };

        if (!clientManager || !instanceArrays) {
            node.error("Invalid configuration");
            return;
        }

        // Handle incoming data
        this.handleData = function(data) {
            var msg = { payload: data.toString() };
            
            try {
                var dataReceived = msg.payload;
                var validMsg = dataReceived.search("##RELAYS: ");
                if (validMsg != -1) {
                    var indexStart = validMsg + 10;
                    var indexEnd = indexStart + 8;
                    var temp = dataReceived.substring(indexStart, indexEnd);
                    var valTemp = parseInt(temp.charAt(node.relayIndex - 1));
                    if (!isNaN(valTemp)) {
                        const state = valTemp === 1;
                        instanceArrays.relays[node.relayIndex - 1] = state;
                        
                        const outputMsg = {
                            payload: state,
                            topic: `relay${node.relayIndex}`
                        };
                        node.send(outputMsg);
                    }
                }
            } catch (error) {
                node.error("Error processing relay data: " + error.message);
            }
        };

        // Handle incoming messages
        this.on('input', function(msg) {
            try {
                let state = node.relayState;
                if (msg.payload !== undefined) {
                    state = Boolean(msg.payload);
                }
                //console.log("Relay state: " + state);
                const command = `::CMDRL${node.relayIndex}${state ? 'ON' : 'OF'}\n`;
                //console.log("Command: " + command);
                if (!clientManager.write(command)) {
                    node.error("Failed to write command to RelexBox");
                }
            } catch (error) {
                node.error("Error setting relay state: " + error.message);
            }
        });

        // Add this node as a listener to the client manager
        clientManager.addListener(this);

        // Clean up on close
        this.on('close', function() {
            clientManager.removeListener(this);
        });
    }
    RED.nodes.registerType("relexbox-relay", RelexBoxRelayNode);

    // Input node
    function RelexBoxInputNode(n) {
        RED.nodes.createNode(this, n);
        this.config = n.config;
        this.name = n.name;
        this.inputIndex = n.inputIndex || 0;
        this.inputType = n.inputType || 'digital';
        this.topic = n.topic || 'relexbox/input';
        this.payloadType = n.payloadType || 'string';
        this.lastValue = null;

        const clientManager = getClientManager(this);
        if (clientManager) {
            clientManager.addListener(this);
        }

        this.handleData = (data) => {
            try {
                const message = data.toString();
                if (message.startsWith('I')) {
                    const parts = message.split(',');
                    if (parts.length >= 2) {
                        const index = parseInt(parts[0].substring(1));
                        if (index === this.inputIndex) {
                            const value = parts[1];
                            let payload;
                            
                            switch (this.inputType) {
                                case 'digital':
                                    payload = value === '1';
                                    break;
                                case 'analog':
                                    payload = parseInt(value);
                                    break;
                                case 'raw':
                                    payload = value;
                                    break;
                                default:
                                    payload = value;
                            }

                            if (this.payloadType === 'object') {
                                payload = {
                                    index: this.inputIndex,
                                    type: this.inputType,
                                    value: payload
                                };
                            }

                            if (this.lastValue !== payload) {
                                this.lastValue = payload;
                                this.send({
                                    topic: this.topic,
                                    payload: payload
                                });
                            }
                        }
                    }
                }
            } catch (err) {
                this.error("Error processing input data: " + err.message);
            }
        };

        this.on('close', function() {
            if (clientManager) {
                clientManager.removeListener(this);
            }
        });
    }
    RED.nodes.registerType("relexbox-input", RelexBoxInputNode);

    // Relay On node
    function RelexBoxRelayOnNode(n) {
        RED.nodes.createNode(this, n);
        this.config = n.config;
        this.name = n.name;
        this.relayIndex = n.relayIndex || 1;

        const clientManager = getClientManager(this);
        if (clientManager) {
            clientManager.addListener(this);
        }

        this.on('input', (msg) => {
            if (clientManager) {
                const command = `::CMDRL${this.relayIndex}ON\n`;
                clientManager.write(command);
            } else {
                this.error("No valid configuration found");
            }
        });

        this.on('close', function() {
            if (clientManager) {
                clientManager.removeListener(this);
            }
        });
    }
    RED.nodes.registerType("relexbox-relay-on", RelexBoxRelayOnNode);

    // Relay Off node
    function RelexBoxRelayOffNode(n) {
        RED.nodes.createNode(this, n);
        this.config = n.config;
        this.name = n.name;
        this.relayIndex = n.relayIndex || 1;

        const clientManager = getClientManager(this);
        if (clientManager) {
            clientManager.addListener(this);
        }

        this.on('input', (msg) => {
            if (clientManager) {
                const command = `::CMDRL${this.relayIndex}OF\n`;
                clientManager.write(command);
            } else {
                this.error("No valid configuration found");
            }
        });

        this.on('close', function() {
            if (clientManager) {
                clientManager.removeListener(this);
            }
        });
    }
    RED.nodes.registerType("relexbox-relay-off", RelexBoxRelayOffNode);

    // Relay Toggle node
    function RelexBoxRelayToggleNode(n) {
        RED.nodes.createNode(this, n);
        this.config = n.config;
        this.name = n.name;
        this.relayIndex = n.relayIndex || 1;

        var node = this;
        const configNode = RED.nodes.getNode(this.config);
        
        if (!configNode) {
            node.error("Missing configuration");
            return;
        }

        const clientManager = configNode.clientManager;

        if (!clientManager) {
            node.error("Invalid configuration");
            return;
        }

        this.on('input', function(msg) {
            try {
                const index = msg.relayIndex !== undefined ? msg.relayIndex : node.relayIndex;
                const command = `::CMDRL${index}TG\n`;
                if (!clientManager.write(command)) {
                    node.error("Failed to write command to RelexBox");
                }
            } catch (error) {
                node.error("Error toggling relay: " + error.message);
            }
        });

        // Add this node as a listener to the client manager
        clientManager.addListener(this);

        // Clean up on close
        this.on('close', function() {
            clientManager.removeListener(this);
        });
    }
    RED.nodes.registerType("relexbox-relay-toggle", RelexBoxRelayToggleNode);

    // Group On node
    function RelexBoxGroupOnNode(n) {
        RED.nodes.createNode(this, n);
        this.config = n.config;
        this.name = n.name;
        this.groupIndex = n.groupIndex || 1;

        var node = this;
        const configNode = RED.nodes.getNode(this.config);
        
        if (!configNode) {
            node.error("Missing configuration");
            return;
        }

        const clientManager = configNode.clientManager;

        if (!clientManager) {
            node.error("Invalid configuration");
            return;
        }

        this.on('input', function(msg) {
            try {
                const index = msg.groupIndex !== undefined ? msg.groupIndex : node.groupIndex;
                const command = `::CMDGR${index}:ON\n`;
                if (!clientManager.write(command)) {
                    node.error("Failed to write command to RelexBox");
                }
            } catch (error) {
                node.error("Error setting group on: " + error.message);
            }
        });

        // Add this node as a listener to the client manager
        clientManager.addListener(this);

        // Clean up on close
        this.on('close', function() {
            clientManager.removeListener(this);
        });
    }
    RED.nodes.registerType("relexbox-group-on", RelexBoxGroupOnNode);

    // Group Off node
    function RelexBoxGroupOffNode(n) {
        RED.nodes.createNode(this, n);
        this.config = n.config;
        this.name = n.name;
        this.groupIndex = n.groupIndex || 1;

        var node = this;
        const configNode = RED.nodes.getNode(this.config);
        
        if (!configNode) {
            node.error("Missing configuration");
            return;
        }

        const clientManager = configNode.clientManager;

        if (!clientManager) {
            node.error("Invalid configuration");
            return;
        }

        this.on('input', function(msg) {
            try {
                const index = msg.groupIndex !== undefined ? msg.groupIndex : node.groupIndex;
                const command = `::CMDGR${index}:OF\n`;
                if (!clientManager.write(command)) {
                    node.error("Failed to write command to RelexBox");
                }
            } catch (error) {
                node.error("Error setting group off: " + error.message);
            }
        });

        // Add this node as a listener to the client manager
        clientManager.addListener(this);

        // Clean up on close
        this.on('close', function() {
            clientManager.removeListener(this);
        });
    }
    RED.nodes.registerType("relexbox-group-off", RelexBoxGroupOffNode);

    // Preset node
    function RelexBoxPresetNode(n) {
        RED.nodes.createNode(this, n);
        this.config = n.config;
        this.name = n.name;
        this.presetIndex = n.presetIndex || 1;

        var node = this;
        const configNode = RED.nodes.getNode(this.config);
        
        if (!configNode) {
            node.error("Missing configuration");
            return;
        }

        const clientManager = configNode.clientManager;

        if (!clientManager) {
            node.error("Invalid configuration");
            return;
        }

        this.on('input', function(msg) {
            try {
                let index = msg.presetIndex !== undefined ? msg.presetIndex : node.presetIndex;
                if (index === 16) {
                    index = 0;
                }
                const command = `::CMDPRST${index}\n`;
                if (!clientManager.write(command)) {
                    node.error("Failed to write command to RelexBox");
                }
            } catch (error) {
                node.error("Error setting preset: " + error.message);
            }
        });

        // Add this node as a listener to the client manager
        clientManager.addListener(this);

        // Clean up on close
        this.on('close', function() {
            clientManager.removeListener(this);
        });
    }
    RED.nodes.registerType("relexbox-preset", RelexBoxPresetNode);
} 