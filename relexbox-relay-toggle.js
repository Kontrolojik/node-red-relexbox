module.exports = function(RED) {
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
        else{
            clientManager.addListener(this);
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

        // Clean up on close
        this.on('close', function() {
            clientManager.removeListener(this);
        });
    }
    RED.nodes.registerType("relexbox-relay-toggle", RelexBoxRelayToggleNode);
} 