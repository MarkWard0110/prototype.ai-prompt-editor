using OllamaSharp;

public class OllamaService: IOllamaService
{
    private OllamaApiClient _ollama;

    public OllamaService(string ollamaApiUrl)
    {
        _ollama = new OllamaApiClient(ollamaApiUrl);
    }
    public async Task<string[]> ListModelsAsync()
    {
        var models = await _ollama.ListLocalModels();
        return [.. models.Select(m => m.Name).Order()];
    }
}