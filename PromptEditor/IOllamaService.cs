
namespace PromptEditor
{
    public interface IOllamaService
    {
        Task<string[]> ListModelsAsync();
    }
}