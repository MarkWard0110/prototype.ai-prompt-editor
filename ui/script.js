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
                params: [invokeRequest.prompt, invokeRequest.model, invokeRequest.temperature, invokeRequest.stop],
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
        const newNode = {
            id: Date.now(),
            title: new Date().toLocaleString(),
            model: data.model,
            prompt: data.prompt,
            temperature: data.temperature,
            stopWords: data.stopWords,
            children: [],
            flagged: false,
            invokeHistory: [],
            isHead: true
        };

        // if (data.parentId === null) {
        //     state.versionTree.push(newNode);
        // } else {
        //     const parentNode = this.findNodeById(data.parentId, state.versionTree);
        //     if (parentNode) {
        //         parentNode.children.push(newNode);
        //     }
        // }

        if (!state.selectedNode) {
            state.versionTree.push(newNode);
            state.selectedTimelineNode = newNode;
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
                state.selectedTimelineNode = parentNode || node;
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

    async invoke(promptNode) {
        console.log('Invoking prompt:', promptNode.prompt);

        const compiledPrompt = VariableService.replaceVariablesInPrompt(promptNode.prompt);
        const compiledStopWords = getStopWords(promptNode.stopWords);

        const invokeRequest = {
            prompt: compiledPrompt, 
            model: promptNode.model,
            temperature: promptNode.temperature,
            stop: compiledStopWords
        };

        const invokeEntry = {
            request: invokeRequest,
            requestTimestamp: new Date().toUTCString(),
            response: null,
            responseTimestamp: null
        };

        promptNode.invokeHistory.push(invokeEntry);
        EventBus.publish('stateChanged');

        const result = await this.rpcClient.invokeModel(invokeRequest);
        invokeEntry.response = result;
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


function setupVariableUI() {
    EventBus.subscribe('variablesChanged', updateVariableUI);

    document.getElementById('add-variable-btn').addEventListener('click', () => {
        const varName = document.getElementById('variable-name').value.trim();
        const varValue = document.getElementById('variable-value').value;
        if (varName && varValue) {
            VariableService.addVariable(varName, varValue);
            document.getElementById('variable-name').value = '';
            document.getElementById('variable-value').value = '';
        }
    });
}

function setupVersionTreeUI() {
    EventBus.subscribe('nodeAdded', updateVersionTreeUI);
    EventBus.subscribe('nodeSelected', (node) => {
        setVersionTreeUI(node);
    });
}

function setVersionTreeUI(node) {
    document.getElementById('prompt-input').value = node.prompt;
    updateVersionTreeUI();
    const flagBtn = document.getElementById('flag-prompt-btn');
    flagBtn.textContent = node.flagged ? 'Unflag Prompt' : 'Flag Prompt';
}

function setupPromptUI() {
    document.getElementById('invoke-btn').addEventListener('click', () => {
        promptModifyCheck();
        PromptServerService.invoke(state.selectedNode);
    });
}

function setupInvokeHistoryUI() {
    EventBus.subscribe('nodeSelected', (node) => {
        updateInvokeHistoryUI(node);
    });
}

function setupModelsUI() {
    EventBus.subscribe('aiModelListChanged', (models) => {
        updateModelsUI(models);
    });
    EventBus.subscribe('nodeSelected', (node) => {
        selectModelUI(node.model);
    });
}

function setupTemperatureUI() {
    EventBus.subscribe('nodeSelected', (node) => {
        updateTemperatureUI(node);
    });
}

function setupStopWordsUI() {
    EventBus.subscribe('nodeSelected', (node) => {
        updateStopWordsUI(node);
    });
}

function promptModifyCheck() {
    const promptText = document.getElementById('prompt-input').value;
    const model = document.getElementById('ai-model').value;
    const temperature = parseFloat(document.getElementById('temperature').value);
    const stopWords = document.getElementById('stop-word-list').value !== '' ? document.getElementById('stop-word-list').value : null;

    var isModified = false;

    if (!state.selectedNode) {
        isModified = true;
    }

    if (state.selectedNode && promptText !== state.selectedNode.prompt) {
        isModified = true;
    }

    if (state.selectedNode && model !== state.selectedNode.model) {
        isModified = true;
    }

    if (state.selectedNode && temperature !== state.selectedNode.temperature) {
        isModified = true;
    }

    if (state.selectedNode && stopWords !== state.selectedNode.stopWords) {
        isModified = true;
    }

    if (isModified) {   
        node = {
            parentId: state.selectedNode ? state.selectedNode.id : null,
            prompt: promptText,
            model: model,
            temperature: temperature,
            stopWords: stopWords
        };

        VersionTreeService.addNode(node);
    }     
}

function updateInvokeHistoryUI() {
    const invokeResponse = document.getElementById('invoke-response');
    invokeResponse.value = '';

    if (state.selectedNode) {
        state.selectedNode.invokeHistory.forEach((invokeItem, index) => {
            requestText = invokeItem.request.prompt;
            responseText = invokeItem.response || '...';
            responseDuration = invokeItem.responseTimestamp ? (new Date(invokeItem.responseTimestamp) - new Date(invokeItem.requestTimestamp)) / 1000 : '';

            invokeResponse.value += `
---------------------------------------------------------------------
Invoke ${index + 1}:

REQUEST:

${requestText}

RESPONSE:(${responseDuration}s)

${responseText}\n\n`;
        });
    }
}

function updateVersionTreeUI() {
    const versionTreeContainer = document.getElementById('revision-history');
    versionTreeContainer.innerHTML = '';

    function renderNodes(nodes, container) {
        nodes.forEach(node => {
            const nodeElement = document.createElement('div');
            const invokeHistoryCount = node.invokeHistory.length;
            nodeElement.textContent = `${node.title}: [${invokeHistoryCount}][${node.model}]: ${node.prompt.substring(0, 20)}... `;
            nodeElement.classList.add('version-node');
            nodeElement.dataset.id = node.id;
            if (state.selectedNode && state.selectedNode.id === node.id) {
                nodeElement.style.fontWeight = 'bold';
            }
            container.appendChild(nodeElement);

            nodeElement.addEventListener('click', () => {
                VersionTreeService.selectNode(node.id);
            });

            if (node.children.length > 0) {
                const childContainer = document.createElement('div');
                childContainer.style.paddingLeft = '20px';
                renderNodes(node.children, childContainer);
                container.appendChild(childContainer);
            }

            if (node.isHead) {
                const headIndicator = document.createElement('span');
                headIndicator.textContent = '@';
                nodeElement.prepend(headIndicator);
            }

            if (node.flagged) {
                const flagIndicator = document.createElement('span');
                flagIndicator.textContent = '🚩';
                nodeElement.prepend(flagIndicator);
            }
        });
    }

    renderNodes(state.versionTree, versionTreeContainer);
}

function updateVariableUI() {
    const variablesList = document.getElementById('variables-list');
    variablesList.innerHTML = '';

    Object.entries(state.variables).forEach(([name, value]) => {
        const listItem = document.createElement('li');

        const inputsDiv = document.createElement('div');
        inputsDiv.id = 'variables-inputs';

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.value = name;
        nameInput.readOnly = true;
        inputsDiv.appendChild(nameInput);

        const valueTextarea = document.createElement('textarea');
        valueTextarea.value = value;
        valueTextarea.readOnly = true;
        inputsDiv.appendChild(valueTextarea);

        listItem.appendChild(inputsDiv);

        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete';
        deleteButton.addEventListener('click', () => {
            VariableService.deleteVariable(name);
        });

        inputsDiv.appendChild(deleteButton);
        variablesList.appendChild(listItem);
    });
}

function updateModelsUI(models) {
    const modelSelect = document.getElementById('ai-model');

    while (modelSelect.firstChild) {
        modelSelect.removeChild(modelSelect.firstChild);
    }

    for (const model of models) {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        modelSelect.appendChild(option);
    }

    if (state.selectedNode) {
        selectModelUI(state.selectedNode.model);
    }
}

function updateTemperatureUI(node) {
    if (!node) return;

    const temperatureInput = document.getElementById('temperature');
    temperatureInput.value = node.temperature || 0.0;
}

function updateStopWordsUI(node) {
    if (!node) return;

    document.getElementById('stop-word-list').value  = node.stopWords || '';
}

function selectModelUI(modelName) {
    if (!modelName) return;

    const modelSelect = document.getElementById('ai-model');
    modelSelect.value = modelName;
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('Document loaded');
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

    StateService.initialize();
});

