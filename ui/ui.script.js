
function setupSplitter(){
    Split(['#side-bar', '#prompt', '#response'], {
        elementStyle: (dimension, size, gutterSize) => ({
            'flex-basis': `calc(${size}% - ${gutterSize}px)`
        }),
        gutterStyle: (dimension, gutterSize) => ({
            'flex-basis':  `${gutterSize}px`
        }),
        gutter: (index, direction) => {
            const gutter = document.createElement('div')
            gutter.className = `gutter gutter-${direction}`
            return gutter
        },
        gutterSize: 8,
        direction: 'horizontal'
    });
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

function promptModify() {
    const messages = getEditorMessages();
    const model = document.getElementById('ai-model').value;
    const temperature = parseFloat(document.getElementById('temperature').value);
    const num_ctx = parseFloat(document.getElementById('num_ctx').value);
    const top_p = parseFloat(document.getElementById('top_p').value);
    const num_predict = parseFloat(document.getElementById('num_predict').value);
    const stopWords = document.getElementById('stop-word-list').value !== '' ? document.getElementById('stop-word-list').value : null;

    node = {
        messages: messages,
        model: model,
        temperature: temperature,
        top_p: top_p,
        num_ctx: num_ctx,
        num_predict: num_predict,
        stopWords: stopWords
    };

    VersionTreeService.addNode(node);
}

function setupPromptUI() {
    document.getElementById('invoke-btn').addEventListener('click', () => {
        promptModify();
        PromptServerService.invoke(state.selectedNode); // selectedNode is updated in promptModify via VersionTreeService.addNode
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
        if (node) {
        selectModelUI(node.model);
        }
    });
}

function setupTemperatureUI() {
    EventBus.subscribe('nodeSelected', (node) => {
        updateTemperatureUI(node);
    });
}

function setupNumCtxUI() {
    EventBus.subscribe('nodeSelected', (node) => {
        updateNumCtxUI(node);
    });
}

function setupNumPredictUI() {
    EventBus.subscribe('nodeSelected', (node) => {
        updateNumPredictUI(node);
    });
}

function setupTopPUI() {
    EventBus.subscribe('nodeSelected', (node) => {
        updateTopPUI(node);
    });
}

function setupStopWordsUI() {
    EventBus.subscribe('nodeSelected', (node) => {
        updateStopWordsUI(node);
    });
}


function getEditorMessages() {
    var chatPrompts = document.getElementById('chat-prompts');
    var itemDivs = chatPrompts.children;
    var messages = [];

    for (var i = 0; i < itemDivs.length; i++) {
        var roleInput = itemDivs[i].getElementsByTagName('input')[0];
        var contentInput = itemDivs[i].getElementsByTagName('textarea')[0];

        var message = {
            role: roleInput.value,
            content: contentInput.value
        };

        messages.push(message);
    }

    return messages;
}

function updateInvokeHistoryUI() {
    const invokeResponse = document.getElementById('invoke-response');
    invokeResponse.value = '';

    if (state.selectedNode) {
        state.selectedNode.invokeHistory.forEach((invokeItem, index) => {
            responseText = invokeItem.hasResponse ? invokeItem.response : '[waiting...]';
            responseDuration = invokeItem.responseTimestamp ? (new Date(invokeItem.responseTimestamp) - new Date(invokeItem.requestTimestamp)) / 1000 : '';

            invokeResponse.value += `
---------------------------------------------------------------------
Invoke ${index + 1}:

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
            //nodeElement.textContent = `${node.title}: ${node.model}: m:${node.messages.length} r:${invokeHistoryCount}`;
            nodeElement.textContent = `${node.title}: m:${node.messages.length} r:${invokeHistoryCount}`;
            nodeElement.classList.add('version-node');
            nodeElement.dataset.id = node.id;
            nodeElement.style.border = '2px solid transparent';
            if (state.selectedNode && state.selectedNode.id === node.id) {
                nodeElement.style.color = 'blue';
                nodeElement.style.border = '2px solid blue';
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
                headIndicator.style.color = 'green';
                nodeElement.prepend(headIndicator);
            }

            if (node.flagged) {
                const flagIndicator = document.createElement('span');
                flagIndicator.textContent = '🚩';
                nodeElement.appendChild(flagIndicator);
            }
        });
    }

    renderNodes(state.versionTree, versionTreeContainer);
}

function addUiChatMessage(role, content) {
    var itemDiv = document.createElement('div');

    var roleInput = document.createElement('input');
    roleInput.type = 'text';
    roleInput.placeholder = 'Enter message role';
    roleInput.value = role;

    var roleLabel = document.createElement('label');
    roleLabel.textContent = 'role';

    var contentInput = document.createElement('textarea');
    contentInput.placeholder = 'Enter message content here...';
    contentInput.className = 'input-style';
    contentInput.value = content;

    var deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete';
    deleteBtn.className = 'delete-btn';
    deleteBtn.addEventListener('click', function() {
        chatPrompts.removeChild(itemDiv);
    });

    itemDiv.appendChild(roleInput);
    itemDiv.appendChild(roleLabel);
    itemDiv.appendChild(deleteBtn);
    itemDiv.appendChild(contentInput);
    
    var chatPrompts = document.getElementById('chat-prompts');
    chatPrompts.appendChild(itemDiv);
}

function clearChatPrompts() {
    var chatPrompts = document.getElementById('chat-prompts');
    while (chatPrompts.firstChild) {
        chatPrompts.removeChild(chatPrompts.firstChild);
    }
}

function setVersionTreeUI(node) {
    if (!node) return;

    clearChatPrompts();

    node.messages.forEach(message => {
        addUiChatMessage(message.role, message.content);
    });

    const flagBtn = document.getElementById('flag-prompt-btn');
    flagBtn.textContent = node.flagged ? 'Unflag Prompt' : 'Flag Prompt';

    updateVersionTreeUI();
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

function updateTopPUI(node) {
    if (!node) return;

    const topInput = document.getElementById('top_p');
    topInput.value = node.top_p || 0.0;
}

function updateNumCtxUI(node) {
    if (!node) return;

    const numInput = document.getElementById('num_ctx');
    numInput.value = node.num_ctx || 0.0;
}

function updateNumPredictUI(node) { 
    if (!node) return;

    const numPredictInput = document.getElementById('num_predict');
    numPredictInput.value = node.num_predict || 1;
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