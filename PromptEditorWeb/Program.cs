using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using PromptEditor;

namespace PromptEditorWeb
{
    public class Program
    {
        public static async Task Main(string[] args)
        {
            var builder = WebAssemblyHostBuilder.CreateDefault(args);
            builder.RootComponents.Add<App>("#app");
            builder.RootComponents.Add<HeadOutlet>("head::after");

            builder.Services.AddScoped(sp => new HttpClient { BaseAddress = new Uri(builder.HostEnvironment.BaseAddress) });
            var serverUrl = "http://quorra.homelan.binaryward.com:11434";
            var ollamaService = new OllamaService(serverUrl);
            var modelInvoker = new ModelInvoker(serverUrl, maxConcurrentInvocations: 1);
            modelInvoker.Start();
            builder.Services.AddSingleton<IOllamaService>(sp => ollamaService);
            builder.Services.AddSingleton<IModelInvoker>(sp => modelInvoker);

            await builder.Build().RunAsync();
        }
    }
}
