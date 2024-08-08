
using BAIsic.LlmApi.Ollama;

namespace PromptEditor
{
    class ModelRequest
    {
        public TaskCompletionSource<ChatResponse> CompletionSource { get; }

        public string Model { get; }

        public ModelMessage[] Messages { get; }

        public float Temperature { get; }

        public string[] Stop { get; }

        public float TopP { get; }

        public int NumCtx { get; }

        public int NumPredict { get; }

        public ModelRequest(TaskCompletionSource<ChatResponse> completionSource, InvokeRequest invokeRequest)
        {
            CompletionSource = completionSource;
            var modelMessages = invokeRequest.messages.Select(m => new ModelMessage()
            {
                Role = m.role,
                Content = m.content
            }).ToArray();

            Model = invokeRequest.model;
            Temperature = invokeRequest.temperature;
            Stop = invokeRequest.stop;
            TopP = invokeRequest.top_p;
            NumCtx = invokeRequest.num_ctx;
            NumPredict = invokeRequest.num_predict;
            Messages = modelMessages;
        }
    }

    public class ModelMessage
    {
        public string Role { get; set; } = string.Empty;
        public string Content { get; set; } = string.Empty;
    }
}