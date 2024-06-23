let state = {
    versionTree: [],
    selectedNode: null,
    selectedTimelineNode: null,
    variables: {}
};

function generateUUID() {
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
}

class JsonRpcWebSocketClient {
    constructor(url) {
        this.url = url;
        this.socket = new WebSocket(url);
        this.pendingRequests = {};
        this.isOpen = false;
        this.socket.onopen = () => {
            console.log("WebSocket connection established.");
            this.isOpen = true;
            EventBus.publish('jsonRpcConnected');
        };

        this.socket.onmessage = (event) => {
            const response = JSON.parse(event.data);
            console.log("Received from server:", response);
            
            if (response.id && this.pendingRequests[response.id]) {
                this.pendingRequests[response.id].resolve(response.result);
                delete this.pendingRequests[response.id];
            }
        };

        this.socket.onerror = (event) => {
            console.error("WebSocket error observed:", event);
        };
    }

    invokeModel(invokeRequest) {
        return new Promise((resolve, reject) => {
            const requestId = generateUUID();
            this.pendingRequests[requestId] = { resolve, reject };
            
            const request = {
                jsonrpc: "2.0",
                method: "InvokeModel",
                params: [invokeRequest],
                id: requestId
            };
            this.socket.send(JSON.stringify(request));
        });
    }

    listModels() {
        return new Promise((resolve, reject) => {
            const requestId = generateUUID();
            this.pendingRequests[requestId] = { resolve, reject };
            
            const request = {
                jsonrpc: "2.0",
                method: "ListModels",
                params: [],
                id: requestId
            };
            this.socket.send(JSON.stringify(request));
        });
    }
}

const EventBus = {
    events: {},
    subscribe(eventType, listener) {
        if (!this.events[eventType]) {
            this.events[eventType] = [];
        }
        this.events[eventType].push(listener);
    },
    publish(eventType, arg) {
        console.log(`Publishing event: ${eventType}`);
        if (this.events[eventType]) {
            this.events[eventType].forEach(listener => listener(arg));
        }
    }
};

const StateService = {
    saveState() {
        localStorage.setItem('promptAppState', JSON.stringify(state));
    },

    loadState() {
        const savedState = localStorage.getItem('promptAppState');
        if (savedState) {
            state = JSON.parse(savedState);
            EventBus.publish('stateLoaded', state);
            
            if (state.selectedNode) {
                EventBus.publish('nodeSelected', state.selectedNode);
            }
        }
    },

    initialize() {
        this.loadState();
    },

    setup(){
        EventBus.subscribe('stateChanged', this.saveState); 
    }
};

const VariableService = {
    addVariable(name, value) {
        state.variables[name] = value;
        EventBus.publish('variablesChanged', state.variables);
        EventBus.publish('stateChanged');
    },

    deleteVariable(name) {
        delete state.variables[name];
        EventBus.publish('variablesChanged', state.variables);
        EventBus.publish('stateChanged');
    },

    replaceVariablesInPrompt(promptText) {
        return promptText.replace(/\{(\w+)\}/g, (match, varName) => state.variables[varName] || match);
    }
};

const VersionTreeService = {
    addNode(data) {
        
        var isModified = false;

        if (!state.selectedNode) {
            isModified = true;
        }
        else {
            if (data.messages.length !== state.selectedNode.messages.length) {
                isModified = true;
            }
            else {
                for (var i = 0; i < data.messages.length; i++) {
                    if (data.messages[i].role !== state.selectedNode.messages[i].role) {
                        isModified = true;
                        break;
                    }

                    if (data.messages[i].content !== state.selectedNode.messages[i].content) {
                        isModified = true;
                        break;
                    }
                }
            }

            if (data.model !== state.selectedNode.model) {
                isModified = true;
            }

            if (data.temperature !== state.selectedNode.temperature) {
                isModified = true;
            }

            if (data.stopWords !== state.selectedNode.stopWords) {
                isModified = true;
            }
        }

        if (!isModified) {
            return;
        }
        
        const newNode = {
            id: Date.now(),
            previousVersionId: state.selectedNode ? state.selectedNode.id : null,
            title: new Date().toLocaleString(),
            model: data.model,
            messages: data.messages,
            temperature: data.temperature,
            stopWords: data.stopWords,
            children: [],
            flagged: false,
            invokeHistory: [],
            isHead: true
        };

        if (!state.selectedNode) {
            state.versionTree.push(newNode);
        } else if (!state.selectedTimelineNode) {
            state.selectedNode.isHead = false;
            state.versionTree.push(newNode);
        } else if (state.selectedNode.isHead) {
            state.selectedNode.isHead = false;
            state.selectedTimelineNode.children.push(newNode);
        } else {
            state.selectedNode.children.push(newNode);
            state.selectedTimelineNode = state.selectedNode;
        }

        state.selectedNode = newNode;
        
        EventBus.publish('nodeAdded', newNode);
        EventBus.publish('nodeSelected', newNode);
        EventBus.publish('stateChanged');
    },

    flagNode(nodeId) {
        const node = this.findNodeById(nodeId);
        if (node) {
            node.flagged = true;
            EventBus.publish('nodeFlagged', nodeId);
            EventBus.publish('stateChanged');
        }
    },

    unflagNode(nodeId) {
        const node = this.findNodeById(nodeId);
        if (node) {
            node.flagged = false;
            EventBus.publish('nodeUnflagged', nodeId);
            EventBus.publish('stateChanged');
        }
    },

    findNodeById(id, nodes = state.versionTree) {
        for (const node of nodes) {
            if (node.id === id) return node;
            if (node.children.length > 0) {
                const foundInChildren = this.findNodeById(id, node.children);
                if (foundInChildren) return foundInChildren;
            }
        }
        return null;
    },

    findParentById(id, nodes = state.versionTree, parent = null) {
        for (const node of nodes) {
            if (node.id === id) return parent;
            if (node.children.length > 0) {
                const foundInChildren = this.findParentById(id, node.children, node);
                if (foundInChildren) return foundInChildren;
            }
        }
        return null;
    },

    selectNode(nodeId) {
        const node = this.findNodeById(nodeId);
        if (node) {
            state.selectedNode = node;

            if (node.isHead) {
                parentNode = this.findParentById(nodeId);
                state.selectedTimelineNode = parentNode;
            } else {
                state.selectedTimelineNode = node;
            }


            EventBus.publish('nodeSelected', node);
        }
    }
};

const AIModelService = {
    models: [],
    rpcClient: null,

    setup(rpcClient){
        this.rpcClient = rpcClient;

        if (this.rpcClient.isOpen) {
            this.initialize();
        }

        EventBus.subscribe('jsonRpcConnected', () => {
            AIModelService.initialize();
        });
    },
    initialize() {
        this.fetchModels();
    },
    async fetchModels() {
        this.models = await this.rpcClient.listModels();
        EventBus.publish('aiModelListChanged', this.models);
    },
};

const PromptServerService = {
    rpcClient: null,

    setup(rpcClient){
        this.rpcClient = rpcClient;
    },

    async invoke(data) {
        console.log('Invoking prompt...');

        const compiledMessages = data.messages.map(message => ({ role: message.role, content: VariableService.replaceVariablesInPrompt(message.content) }));
        const compiledStopWords = getStopWords(data.stopWords);

        const invokeRequest = {
            messages: compiledMessages,
            model: data.model,
            temperature: data.temperature,
            stop: compiledStopWords
        };

        const invokeEntry = {
            request: invokeRequest,
            requestTimestamp: new Date().toUTCString(),
            hasResponse: false,
            response: null,
            responseTimestamp: null
        };

        data.invokeHistory.push(invokeEntry);
        EventBus.publish('stateChanged');

        const result = await this.rpcClient.invokeModel(invokeRequest);
        invokeEntry.response = result;
        invokeEntry.hasResponse = true;
        invokeEntry.responseTimestamp = new Date().toUTCString();

        EventBus.publish('stateChanged');
    },

    
    invokeResponse(correlationId, responseText) {
        if (this.pendingInvocations[correlationId]) {
            this.pendingInvocations[correlationId].response = responseText;
            delete this.pendingInvocations[correlationId]; // Clean up after updating
            EventBus.publish('stateChanged');
            
        }
    },
};

function getStopWords(stopWords) {
    if (!stopWords) return null;

    return stopWords.split(',').map(word => word.trim()).filter(word => word.length > 0);
}

function parseMessages(input) {
    input = input.replace(/\\n/g, '\n');
    const sections = input.split('<|eot_id|>');
    const messages = [];

    for (const section of sections) {
        const roleStart = section.indexOf('<|start_header_id|>') + '<|start_header_id|>'.length;
        const roleEnd = section.indexOf('<|end_header_id|>');
        const role = section.slice(roleStart, roleEnd).trim();

        const contentStart = section.indexOf('<|end_header_id|>') + '<|end_header_id|>'.length;
        const content = section.slice(contentStart).trim();

        if (role) {
            const message = {
                role: role,
                content: content
            };
            messages.push(message);
        }
    }

    return messages;
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('system loading...');
    setupSplitter();

    const rpcClient = new JsonRpcWebSocketClient('ws://localhost:14900');
    PromptServerService.setup(rpcClient);
    AIModelService.setup(rpcClient);
    StateService.setup();
    setupPromptUI();
    setupVariableUI();
    setupVersionTreeUI();
    setupInvokeHistoryUI();
    setupModelsUI();
    setupTemperatureUI();
    setupStopWordsUI();

    EventBus.subscribe('stateLoaded', () => {
        updateVersionTreeUI();
        updateVariableUI();
    });
    EventBus.subscribe('stateChanged', () => {
        updateVersionTreeUI();
        updateVariableUI();
        updateInvokeHistoryUI(state.selectedNode);
        updateTemperatureUI(state.selectedNode);
        updateStopWordsUI(state.selectedNode);
        if (state.selectedNode) {
            selectModelUI(state.selectedNode.model);
        }
    });

    document.getElementById('flag-prompt-btn').addEventListener('click', () => {
        if (state.selectedNode) {
            if (state.selectedNode.flagged) {
                VersionTreeService.unflagNode(state.selectedNode.id);
                document.getElementById('flag-prompt-btn').textContent = 'Flag Prompt';
            } else {
                VersionTreeService.flagNode(state.selectedNode.id);
                document.getElementById('flag-prompt-btn').textContent = 'Unflag Prompt';
            }
        }
    });
    
    document.getElementById('toggle-advanced').addEventListener('click', function() {
        var advancedArea = document.getElementById('advanced-prompt-options');
        if (advancedArea.style.display === 'none') {
            advancedArea.style.display = 'block';
            this.textContent = 'Hide Advanced Options';
        } else {
            advancedArea.style.display = 'none';
            this.textContent = 'Show Advanced Options';
        }
    });

    document.getElementById('add-message-btn').addEventListener('click', function() {
        addUiChatMessage('','');
    });

    
    document.getElementById('load-chat-btn').addEventListener('click', function() {
        const messages = parseMessages(document.getElementById('load-chat-value').value)
        
        clearChatPrompts();

        messages.forEach(message => {
            addUiChatMessage(message.role, message.content);
        });

    });

    StateService.initialize();
});

