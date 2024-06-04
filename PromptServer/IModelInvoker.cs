public interface IModelInvoker
{
    Task<string> InvokeModelAsync(InvokeRequest request);
}

public class InvokeRequest {
    public InvokeMessage[] messages { get; set; }
    public string model { get; set; }
    public float temperature { get; set; }
    public string[] stop { get; set; }
}

public class InvokeMessage {
    public string role { get; set; }
    public string content {get; set;}
}