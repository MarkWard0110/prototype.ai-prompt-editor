window.setDotNetObjectRef = (dotNetObjectRef) => {
    window.dotNetObjectRef = dotNetObjectRef;
};

async function getModelList() {
    const result = await window.dotNetObjectRef.invokeMethodAsync('ListModelsAsync');
    console.log(result);
    return result;
};

async function invokeModel(invokeRequest) {

    const result = await window.dotNetObjectRef.invokeMethodAsync('InvokeModelAsync', invokeRequest);
    console.log(result);
    return result;
}