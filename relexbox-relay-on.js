module.exports = function(RED) {
    // Relay On node
    function RelexBoxRelayOnNode(n) {
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

        this.on('input', function() {
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
}