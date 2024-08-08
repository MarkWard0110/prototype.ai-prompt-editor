
using BAIsic.LlmApi.Ollama;

namespace PromptEditor
{
    public interface IModelInvoker
    {
        Task<ChatResponse> InvokeModelAsync(InvokeRequest request);
    }

    public class InvokeRequest
    {
        public InvokeMessage[] messages { get; set; }
        public string model { get; set; }
        public float temperature { get; set; }
        public float top_p { get; set; }
        public int num_ctx { get; set; }
        public int num_predict { get; set; }
        public string[] stop { get; set; }
    }

    public class InvokeMessage
    {
        public string role { get; set; }
        public string content { get; set; }
    }
}