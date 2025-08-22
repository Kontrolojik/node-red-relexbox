module.exports = function(RED) {
    // Relay node
    function RelexBoxRelayNode(n) {
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
        
		var Context_relays = configNode.name + "_" + "relays";
		let globalContext = this.context().global;
		let relayArray = globalContext.get(Context_relays);
        if(!relayArray)
			this.relayState = relayArray[node.relayIndex - 1];
		else
			this.relayState = false;

        if (!clientManager) {
            node.error("Invalid configuration");
            return;
        }
        else{
            clientManager.addListener(this);
        }

        // Handle incoming data
        this.handleState = function() {
            try {
                relayArray = globalContext.get(Context_relays);
				this.relayState = relayArray[node.relayIndex - 1];
				
                const outputMsg = {
                    payload: this.relayState,
                    topic: `relay${node.relayIndex}`
                };
                node.send(outputMsg);
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

        // Clean up on close
        this.on('close', function() {
            clientManager.removeListener(this);
        });
    }
    RED.nodes.registerType("relexbox-relay", RelexBoxRelayNode);
} 