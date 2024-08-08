using System.Text.Json.Serialization;


namespace PromptEditor
{
    public class PromptResponse
    {
        [JsonPropertyName("type")]
        public string Type { get; set; } = "prompt_response";

        [JsonPropertyName("correlationId")]
        public string CorrelationId { get; set; }

        [JsonPropertyName("response")]
        public string Response { get; set; }
    }
}