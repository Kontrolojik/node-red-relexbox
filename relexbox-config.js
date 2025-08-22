const net = require('net');

module.exports = function(RED) {
    // Configuration node
    function RelexBoxConfigNode(n) {
        RED.nodes.createNode(this, n);
        this.name = n.name;
        this.host = n.host || 'localhost';
        this.port = n.port || 13013;
        this.settings = n.settings || {};

        // Initialize instance-specific arrays
        let inputs = new Array(8).fill(false);
        let relays = new Array(8).fill(false);
		let globalContext = this.context().global;
		var Context_inputs = n.name + "_" + "inputs";
		var Context_relays = n.name + "_" + "relays";
		globalContext.set(Context_inputs,inputs);
		globalContext.set(Context_relays,relays);
        let old_inputs = new Array(8).fill(false);
        let old_relays = new Array(8).fill(false);
		
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
                    try {
                        const command = `::CMD_STAT\n`;
                        if (!this.write(command)) {
                            this.notifyListeners('error', new Error("Failed to write command to RelexBox"));
                        }
                    } catch (error) {
                        this.notifyListeners('error', new Error("Error getting initial states: " + error.message));
                    }
                    clearTimeout(this.reconnectTimeout);
                    this.addListener
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
                    //this.notifyListeners('data', data);
                    //this.notifyListeners('debug',("Initial States: " + old_inputs + " - " + old_relays));
                    this.handleData(data);
                    clearInterval(this.pingTimeout);
                    this.pingTimeout = setInterval(() => {
                        try {
                                const command = `PING\r`;
                                if (!this.write(command)) {
                                    this.notifyListeners('error', new Error("Failed to write command to RelexBox"));
                                }
                            } catch (error) {
                                this.notifyListeners('error', new Error("Error getting initial states: " + error.message));
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
                /*
                if (this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.reconnectAttempts++;
                    this.notifyListeners('reconnecting', this.reconnectAttempts);
                    this.reconnectTimeout = setTimeout(() => {
                        this.createClient(this.config);
                    }, this.reconnectDelay);
                } else {
                    this.notifyListeners('connectionFailed');
                }
                */
                try {
                    clearTimeout(this.reconnectTimeout);
                    this.reconnectTimeout = setTimeout(() => {
                        this.createClient(this.config);
                    }, this.reconnectDelay);
                } catch (error) {
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

            notifyListeners(event,data) {
                this.listeners.forEach(node => {
                    switch(event) {
                        case 'connect':
                            node.status({fill:"green", shape:"dot", text:"connected"});
                            break;
                        case 'error':
                            node.status({fill:"red", shape:"ring", text:"error"});
                            node.error("RelexBox error: " + data.message);
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
                                node.handleState();
                            }
                            break;
                        case 'debug':
                            node.warn(data);
                            break;
                    }
                });
            },

            // Handle incoming data
            handleData(data) {
                var msg = { payload: data.toString() };
                //this.notifyListeners('debug',msg.payload);
                try {
                    var dataReceived = msg.payload;
                    var validMsg = dataReceived.search("##RELAYS: ");
                    if (validMsg != -1) {
                        var shouldProcess = false;
                        var indexStart = validMsg + 10;
                        var indexEnd = indexStart + 8;
                        var temp = dataReceived.substring(indexStart, indexEnd);
                        if(temp.length >= 8){
                            //this.notifyListeners('debug',("Relays data: " + temp));
							let relayArray = globalContext.get(Context_relays);
                            for(var i = 0; i < 8; i++) {
                                var valTemp = parseInt(temp.charAt(i));
                                //this.notifyListeners('debug',("Relay" + i + ": " + valTemp));
                                if (!isNaN(valTemp)) {
                                    const state = valTemp === 1;
                                    //this.notifyListeners('debug',("State" + i + ": " + state));
                                    relayArray[i] = state;	
                                    if(old_relays[i] != state){
                                        old_relays[i] = state;
                                        shouldProcess = true;
                                    }
                                }
                            }
							if(shouldProcess === true){ 
                                this.notifyListeners('debug',(Context_relays + ": " + relayArray));
                                globalContext.set(Context_relays,relayArray);
							    this.notifyListeners('data'); 
                            }   
                        } 
                    }
					
                    validMsg = dataReceived.search("##INPUTS: ");
                    if (validMsg != -1) {
                        var shouldProcess = false;
                        var indexStart = validMsg + 10;
                        var indexEnd = indexStart + 8;
                        var temp = dataReceived.substring(indexStart, indexEnd);
                        if(temp.length >= 8){
                            //this.notifyListeners('debug',("Inputs data: " + temp));
                            let inputArray = globalContext.get(Context_inputs);
                            for(var i = 0; i < 8; i++) {
                                var valTemp = parseInt(temp.charAt(i));
                                //this.notifyListeners('debug',("Input" + i + ": " + valTemp));
                                if (!isNaN(valTemp)) {
                                    const state = valTemp === 1;
                                    inputArray[i] = state;		
                                    if(old_inputs[i] != state){
                                        old_inputs[i] = state;
                                        shouldProcess = true;
                                    }
                                    //this.notifyListeners('debug',("State" + i + ": " + state + " - " + shouldProcess));
                                }
                            }		
                            if(shouldProcess === true){ 
                                this.notifyListeners('debug',(Context_inputs + ": " + inputArray));
                                globalContext.set(Context_inputs,inputArray);
                                this.notifyListeners('data'); 
                            }   
                        } 
                    }

                } catch (error) {
                    this.notifyListeners('error', new Error("Error processing data: " + error.message));
                }
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
} 