module.exports = function(RED) {
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
        else{
            clientManager.addListener(this);
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

        // Clean up on close
        this.on('close', function() {
            clientManager.removeListener(this);
        });
    }
    RED.nodes.registerType("relexbox-preset", RelexBoxPresetNode);
} 