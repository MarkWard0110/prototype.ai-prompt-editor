class ModelRequest
{
    public TaskCompletionSource<string> CompletionSource { get; }

    public string Model { get; }

    public ModelMessage[] Messages { get; }

    public float Temperature { get; }

    public string[] Stop { get; }

    public ModelRequest(TaskCompletionSource<string> completionSource, string model, float temperature, string[] stop, ModelMessage[] messages)
    {
        CompletionSource = completionSource;
        Model = model;
        Temperature = temperature;
        Stop = stop;
        Messages = messages;
    }
}

public class ModelMessage{
    public string Role { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
}