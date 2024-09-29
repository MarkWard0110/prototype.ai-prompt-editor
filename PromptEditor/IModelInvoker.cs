
using BAIsic.LlmApi.Ollama;

namespace PromptEditor
{
    public interface IModelInvoker
    {
        Task<InvokeResponse> InvokeModelAsync(InvokeRequest request);
    }

    public class InvokeRequest
    {
        public InvokeMessage[] messages { get; set; }
        public string model { get; set; }

        public RequestOptions requestOptions { get; set; }

    }

    public class InvokeMessage
    {
        public string role { get; set; }
        public string content { get; set; }
    }

    public class InvokeResponse
    {
        public ChatResponse chatResponse { get; set; }
        public RequestOptions requestOptions { get; set; }
    }
}