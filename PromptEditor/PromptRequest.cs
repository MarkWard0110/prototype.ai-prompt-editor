using System.Net.WebSockets;
using System.Text.Json.Serialization;


namespace PromptEditor
{
    public class PromptRequest
    {
        [JsonPropertyName("correlationId")]
        public string CorrelationId { get; set; }

        [JsonPropertyName("prompt")]
        public string Prompt { get; set; }

        [System.Text.Json.Serialization.JsonIgnore] // Don't serialize the WebSocket
        public WebSocket WebSocket { get; set; }
    }
}