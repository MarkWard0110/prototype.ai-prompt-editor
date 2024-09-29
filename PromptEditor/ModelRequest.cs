
using BAIsic.LlmApi.Ollama;

namespace PromptEditor
{
    class ModelRequest
    {
        public TaskCompletionSource<InvokeResponse> CompletionSource { get; }

        public string Model { get; }

        public ModelMessage[] Messages { get; }

        public RequestOptions RequestOptions { get; }

        public ModelRequest(TaskCompletionSource<InvokeResponse> completionSource, InvokeRequest invokeRequest)
        {
            CompletionSource = completionSource;
            var modelMessages = invokeRequest.messages.Select(m => new ModelMessage()
            {
                Role = m.role,
                Content = m.content
            }).ToArray();

            Model = invokeRequest.model;
            RequestOptions = invokeRequest.requestOptions;
            
            Messages = modelMessages;
        }
    }

    public class ModelMessage
    {
        public string Role { get; set; } = string.Empty;
        public string Content { get; set; } = string.Empty;
    }
}