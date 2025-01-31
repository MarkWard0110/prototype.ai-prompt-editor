
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
    const seed = document.getElementById('seed').value !== '' ? parseFloat(document.getElementById('seed').value) : null;
    const num_predict = parseFloat(document.getElementById('num_predict').value);
    const stopWords = document.getElementById('stop-word-list').value !== '' ? document.getElementById('stop-word-list').value : null;

    node = {
        messages: messages,
        model: model,
        requestOptions: {
            temperature: temperature,
            top_p: top_p,
            num_ctx: num_ctx,
            seed: seed,
            num_predict: num_predict,
            stopWords: stopWords
        }
    };

    VersionTreeService.addNode(node);
}

function setupPromptUI() {
    document.getElementById('invoke-btn').addEventListener('click', () => {
        promptModify();
        PromptServerService.invoke(state.selectedNode); // selectedNode is updated in promptModify via VersionTreeService.addNode
    });


    document.getElementById('save-btn').addEventListener('click', () => {
        promptModify();
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

function setupRequestOptionsUI() {
    EventBus.subscribe('nodeSelected', (node) => {
        updateRequestOptionsUI(node);
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

            var responseText = '[waiting...]';
            var responseDuration = "";
            var tokensPerSecond = "";
            var seed = "";
            var evalCount = "";
            var promptevalCount = "";

            var estimatedTokenCount = 10; // default for prompt template
            var eTokenCount = '';
            invokeItem.request.messages.forEach(message => {
                const words = message.content.split(/\s+/).length;
                estimatedTokenCount += Math.round(words * 2.5);  // llama 3 text 1.2  source code 2.5
            });
            eTokenCount = 'estimate tokens:' + estimatedTokenCount;

            if (invokeItem.hasResponse) {
                responseText = invokeItem.response.chatResponse.message.content;
                responseDuration = 's:' + (invokeItem.response.chatResponse.total_duration ? invokeItem.response.chatResponse.total_duration / 1000000000 : '');
                tokensPerSecond = 'tps:' + (invokeItem.response.chatResponse.eval_count < 0 ? '' : invokeItem.response.chatResponse.eval_count / (invokeItem.response.chatResponse.eval_duration / 1e9));
                seed = 'seed:' + (invokeItem.response.requestOptions.seed ? invokeItem.response.requestOptions.seed : '');
                evalCount = 'eval:' + (invokeItem.response.chatResponse.eval_count ? invokeItem.response.chatResponse.eval_count : '');
                promptevalCount = 'prompt eval:' + (invokeItem.response.chatResponse.prompt_eval_count ? invokeItem.response.chatResponse.prompt_eval_count : '');

                invokeResponse.value += `
---------------------------------------------------------------------
Invoke ${index + 1}:
REQUEST: (${eTokenCount})
RESPONSE:(${responseDuration} ${tokensPerSecond} ${seed} ${evalCount} ${promptevalCount})

${responseText}\n\n`;
            }
            else {
                invokeResponse.value += `
---------------------------------------------------------------------
Invoke ${index + 1}:
(${eTokenCount})

${responseText}\n\n`;
            }
            
            
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

            nodeElement.addEventListener('dblclick', () => {
                VersionTreeService.selectNode(node.id);
                toggleFlag();
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

function newChatMessage(role, content) {
    var itemDiv = document.createElement('div');
    itemDiv.className = 'chat-prompt';

    var roleInput = document.createElement('input');
    roleInput.type = 'text';
    roleInput.placeholder = 'Enter message role';
    roleInput.value = role;

    var roleLabel = document.createElement('label');
    roleLabel.className = 'role-style';
    roleLabel.textContent = 'role';

    var contentInput = document.createElement('textarea');
    contentInput.placeholder = 'Enter message content here...';
    contentInput.className = 'input-style';
    contentInput.value = content;

    var deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete';
    deleteBtn.className = 'delete-btn';
    deleteBtn.addEventListener('click', function () {
        var chatPrompts = document.getElementById('chat-prompts');
        chatPrompts.removeChild(itemDiv);
    });

    var insertMessageBtn = document.createElement('button');
    insertMessageBtn.textContent = 'Insert Message';
    insertMessageBtn.className = 'insert-btn';
    insertMessageBtn.addEventListener('click', function () {
        var newMessage = newChatMessage('', '');
        var chatPrompts = document.getElementById('chat-prompts');
        chatPrompts.insertBefore(newMessage, itemDiv);
    });

    itemDiv.appendChild(roleInput);
    itemDiv.appendChild(roleLabel);
    itemDiv.appendChild(insertMessageBtn);
    itemDiv.appendChild(deleteBtn);
    itemDiv.appendChild(contentInput);

    return itemDiv;
}
function addUiChatMessage(role, content) {

    var itemDiv = newChatMessage(role, content);

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

    updateVersionTreeUI();
}

function toggleFlag() {
    if (state.selectedNode) {
        if (state.selectedNode.flagged) {
            VersionTreeService.unflagNode(state.selectedNode.id);
        } else {
            VersionTreeService.flagNode(state.selectedNode.id);
        }
    }
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

function updateRequestOptionsUI(node) {
    if (!node) return;

    updateRequestOptions(node.requestOptions);
}

function updateRequestOptions(requestOptions) {
    if (!requestOptions) return;

    document.getElementById('temperature').value = requestOptions.temperature || 0.0;
    document.getElementById('top_p').value = requestOptions.top_p || 0.0;
    document.getElementById('seed').value = requestOptions.seed || '';
    document.getElementById('num_ctx').value = requestOptions.num_ctx || 2048;
    document.getElementById('num_predict').value = requestOptions.num_predict || -1;
    document.getElementById('stop-word-list').value = requestOptions.stopWords || '';
}

function selectModelUI(modelName) {
    if (!modelName) return;

    const modelSelect = document.getElementById('ai-model');
    modelSelect.value = modelName;
}

function setupUI() {
    setupPromptUI();
    setupVariableUI();
    setupVersionTreeUI();
    setupInvokeHistoryUI();
    setupModelsUI();

    setupRequestOptionsUI();
    

    EventBus.subscribe('stateLoaded', () => {
        updateVersionTreeUI();
        updateVariableUI();
    });
    EventBus.subscribe('stateChanged', () => {
        updateVersionTreeUI();
        updateVariableUI();               
        updateInvokeHistoryUI(state.selectedNode);
        updateRequestOptionsUI(state.selectedNode);

        if (state.selectedNode) {
            selectModelUI(state.selectedNode.model);
        }
    });

    document.getElementById('toggle-advanced').addEventListener('click', function () {
        var advancedArea = document.getElementById('advanced-prompt-options');
        if (advancedArea.style.display === 'none') {
            advancedArea.style.display = 'block';
            this.textContent = 'Hide Advanced Options';
        } else {
            advancedArea.style.display = 'none';
            this.textContent = 'Show Advanced Options';
        }
    });

    document.getElementById('add-message-btn').addEventListener('click', function () {
        addUiChatMessage('', '');
    });

    document.getElementById('load-llama-prompt-btn').addEventListener('click', function () {
        const messages = parseMessages(document.getElementById('load-llama-prompt-value').value)

        clearChatPrompts();

        messages.forEach(message => {
            addUiChatMessage(message.role, message.content);
        });

    });

    document.getElementById('load-messages-btn').addEventListener('click', function () {
        const jsonObject = JSON.parse(document.getElementById('load-messages-value').value);
        const messageGroup = findAllBenchmarkMessages(jsonObject)
        const requestOptions = findRequestOptions(jsonObject);
        const model = findModel(jsonObject);

        messageGroup.forEach(messages => {
            clearChatPrompts();
            messages.forEach(message => {
                const role = getCaseInsensitiveProperty(message, "Role");
                const content = getCaseInsensitiveProperty(message, "Text") || getCaseInsensitiveProperty(message, "content"); 
                addUiChatMessage(role, content);
            });
            updateRequestOptions(requestOptions);
            selectModelUI(model);
            promptModify(); // save
        });
    });

    document.getElementById('new-session-btn').addEventListener('click', async function () {
        await StateService.deleteState();
    }
    );

    document.getElementById('extract-flagged-btn').addEventListener('click', function () {
        VersionTreeService.extractFlaggedNodes();
    });
}