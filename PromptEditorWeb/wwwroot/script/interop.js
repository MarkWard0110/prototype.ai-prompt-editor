window.setDotNetObjectRef = (dotNetObjectRef) => {
    window.dotNetObjectRef = dotNetObjectRef;
};

async function getModelList() {
    const result = await window.dotNetObjectRef.invokeMethodAsync('ListModelsAsync');
    return result;
};

async function invokeModel(invokeRequest) {

    const result = await window.dotNetObjectRef.invokeMethodAsync('InvokeModelAsync', invokeRequest);
    return result;
}