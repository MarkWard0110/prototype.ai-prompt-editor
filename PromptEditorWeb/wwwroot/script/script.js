let state = null;

function generateUUID() {
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
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

const dbName = 'promptApp';
const dbVersion = 1;
const storeName = 'stateStore';

const StateService = {
    db: null,
    
    newState() {
        state = {
            versionTree: [],
            selectedNode: null,
            selectedTimelineNode: null,
            variables: {}
        };
    },

    saveState() {
        const db = this.db;
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put({ id: 'promptAppState', state: state });

            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
    },

    loadState() {
        const db = this.db;
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get('promptAppState');

            request.onsuccess = (event) => {
                const result = event.target.result;
                if (result) {
                    state = result.state;
                    EventBus.publish('stateLoaded', state);

                    if (state.selectedNode) {
                        EventBus.publish('nodeSelected', state.selectedNode);
                    }
                }
                resolve();
            };

            request.onerror = (event) => reject(event.target.error);
        });
    },

    async deleteState() {
        this.newState();
        await this.saveState();
        EventBus.publish('stateChanged', state);
        EventBus.publish('nodeSelected', state.selectedNode);
    },

    async initialize() {
        await this.loadState();
    },

    async setup(){
        this.newState();
        this.db = await this.openDB();
        EventBus.subscribe('stateChanged', this.saveState.bind(this));
    },

    openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(dbName, dbVersion);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(storeName)) {
                    db.createObjectStore(storeName, { keyPath: 'id' });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    },
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

            if (data.requestOptions.temperature !== state.selectedNode.requestOptions.temperature) {
                isModified = true;
            }

            if (data.requestOptions.top_p !== state.selectedNode.requestOptions.top_p) {
                isModified = true;
            }

            if (data.requestOptions.top_k !== state.selectedNode.requestOptions.top_k) {
                isModified = true;
            }

            if (data.requestOptions.num_ctx !== state.selectedNode.requestOptions.num_ctx) {
                isModified = true;
            }

            if (data.requestOptions.seed !== state.selectedNode.requestOptions.seed) {
                isModified = true;
            }

            if (data.requestOptions.num_predict !== state.selectedNode.requestOptions.num_predict) {
                isModified = true;
            }

            if (data.requestOptions.stopWords !== state.selectedNode.requestOptions.stopWords) {
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
            requestOptions: {
                temperature: data.requestOptions.temperature,
                top_p: data.requestOptions.top_p,
                top_k: data.requestOptions.top_k,
                num_ctx: data.requestOptions.num_ctx,
                seed: data.requestOptions.seed,
                num_predict: data.requestOptions.num_predict,
                stopWords: data.requestOptions.stopWords,
            },
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
    },

    getFlaggedNodes() {
        let flaggedNodes = [];

        function traverse(node) {
          if (node.flagged) {
            flaggedNodes.push(node);
          }
          if (node.children && node.children.length > 0) {
            node.children.forEach(child => traverse(child));
          }
        }
      
        if (state.versionTree && state.versionTree.length > 0) {
            state.versionTree.forEach(node => traverse(node)); 
        }
        return flaggedNodes;
    },

    extractFlaggedNodes() {
        const flaggedNodes = this.getFlaggedNodes();
        StateService.newState();
        flaggedNodes.forEach(node => {
            node.children = [];
            node.previousVersionId = null;
            node.isHead = false;
        });

        state.versionTree = flaggedNodes;
        EventBus.publish('stateChanged');
        EventBus.publish('nodeSelected', state.selectedNode);
    }
};

const AIModelService = {
    models: [],

    setup() {
        this.initialize();
    },
    initialize() {
        this.fetchModels();
    },
    async fetchModels() {
        this.models = await getModelList();
        EventBus.publish('aiModelListChanged', this.models);
    },
};

const PromptServerService = {

    async invoke(data) {
        console.log('Invoking prompt...');

        const compiledMessages = data.messages.map(message => ({ role: message.role, content: VariableService.replaceVariablesInPrompt(message.content) }));
        const compiledStopWords = getStopWords(data.requestOptions.stopWords);

        const invokeRequest = {
            messages: compiledMessages,
            model: data.model,
            requestOptions: {
                temperature: data.requestOptions.temperature,
                top_p: data.requestOptions.top_p,
                top_k: data.requestOptions.top_k,
                num_ctx: data.requestOptions.num_ctx,
                seed: data.requestOptions.seed,
                num_predict: data.requestOptions.num_predict,
                stop: compiledStopWords
            }
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

        const result = await invokeModel(invokeRequest);
        invokeEntry.response = result;
        invokeEntry.hasResponse = true;
        invokeEntry.responseTimestamp = new Date().toUTCString();

        EventBus.publish('stateChanged');
    },
};

function getStopWords(stopWords) {
    if (!stopWords) return null;

    return stopWords.split(',').map(word => word.trim()).filter(word => word.length > 0);
}

function parseMessages(input) {
    input = input.replace(/\\n/g, '\n');
    input = input.replace(/\\r/g, '');
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

function findAllBenchmarkMessages(jsonObject) {
    
    const messagesArray = [];

    function recursiveSearch(obj) {
        for (const key in obj) {
            if (key.toLowerCase() === "messages" && Array.isArray(obj[key])) {
                messagesArray.push(obj[key]);
            } else if (typeof obj[key] === "object" && obj[key] !== null) {
                recursiveSearch(obj[key]);
            }
        }
    }

    recursiveSearch(jsonObject);
    return messagesArray;
}

function findRequestOptions(jsonObject) {
    if (jsonObject.RequestOptions) {
        return jsonObject.RequestOptions;
    }

    if (jsonObject.options) {
        return jsonObject.options;
    }

    return null;
}

function findModel(jsonObject) {
    if (jsonObject.Model) {
        return jsonObject.Model;
    }

    if (jsonObject.model) {
        return jsonObject.model;
    }

    return null;
}

function getCaseInsensitiveProperty(obj, key) {
    const lowerCaseKey = key.toLowerCase();
    const foundKey = Object.keys(obj).find(k => k.toLowerCase() === lowerCaseKey);
    return foundKey ? obj[foundKey] : undefined;
}

async function initApp() {
    console.log('system loading...');
    setupSplitter();

    AIModelService.setup();
    await StateService.setup();
  
    setupUI();

    await StateService.initialize();
}

