public interface IModelInvoker
{
    Task<string> InvokeModelAsync(string prompt, string model, float temperature, string[] stop);
}
