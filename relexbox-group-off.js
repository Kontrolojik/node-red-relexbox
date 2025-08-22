module.exports = function(RED) {
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
        else{
            clientManager.addListener(this);
        }

        this.on('input', function(msg) {
            try {
                const index = msg.groupIndex !== undefined ? msg.groupIndex : node.groupIndex;
                const command = `::CMDGR${index}OF\n`;
                if (!clientManager.write(command)) {
                    node.error("Failed to write command to RelexBox");
                }
            } catch (error) {
                node.error("Error setting group off: " + error.message);
            }
        });

        // Clean up on close
        this.on('close', function() {
            clientManager.removeListener(this);
        });
    }
    RED.nodes.registerType("relexbox-group-off", RelexBoxGroupOffNode);
} 