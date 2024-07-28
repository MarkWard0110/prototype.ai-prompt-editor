using BAIsic.LlmApi.Ollama;

public class OllamaService: IOllamaService
{
    private readonly OllamaClient _ollama;
    private const int TimeoutMinutes = 20;

    public OllamaService(string ollamaApiUrl)
    {
        _ollama = new OllamaClient(new HttpClient()
        {
            BaseAddress = new Uri(ollamaApiUrl),
            Timeout = TimeSpan.FromMinutes(TimeoutMinutes)
        });
    }
    public async Task<string[]> ListModelsAsync()
    {
        var models = await _ollama.ListLocalModelsAsync();
        return [.. models.Select(m => m.Name).Order()];
    }
}