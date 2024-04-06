public interface IOllamaService
{
    Task<string[]> ListModelsAsync();
}