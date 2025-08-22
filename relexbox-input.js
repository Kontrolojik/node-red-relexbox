module.exports = function(RED) {
    // Input node
    function RelexBoxInputNode(n) {
        RED.nodes.createNode(this, n);
        this.config = n.config;
        this.name = n.name;
        this.inputIndex = n.inputIndex || 0;
        
        var node = this;
        const configNode = RED.nodes.getNode(this.config);

        if (!configNode) {
            node.error("Missing configuration");
            return;
        }

        const clientManager = configNode.clientManager;
        
		var Context_inputs = configNode.name + "_" + "inputs";
		//this.warn(Context_inputs);
		let globalContext = this.context().global;
		let inputArray = globalContext.get(Context_inputs);
		//this.warn(inputArray);
		if(!inputArray)
			this.inputState = inputArray[node.inputIndex - 1];
		else
			this.inputState = false;
		
        if (!clientManager) {
            node.error("Invalid configuration");
            return;
        }
        else{
            clientManager.addListener(this);
        }

        this.handleState = function() {
            try {
                inputArray = globalContext.get(Context_inputs);
				this.inputState = inputArray[node.inputIndex - 1];
            } catch (error) {
                node.error("Error processing input data: " + error.message);
            }
        };

        // Clean up on close
        this.on('close', function() {
            clientManager.removeListener(this);
        });
    }
    RED.nodes.registerType("relexbox-input", RelexBoxInputNode);
} 