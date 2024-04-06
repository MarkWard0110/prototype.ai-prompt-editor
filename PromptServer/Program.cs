using System;
using System.Collections.Concurrent;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using StreamJsonRpc;

class Program
{
    private static readonly ConcurrentQueue<PromptRequest> requestQueue = new ConcurrentQueue<PromptRequest>();

    private static PromptServerConfig? promptServerConfig;

    const string urlPrefix = "http://localhost:14900/";
    static async Task Main(string[] args)
    {
        Initialize();

        var httpListener = new HttpListener();

        httpListener.Prefixes.Add(urlPrefix);
        httpListener.Start();
        Console.WriteLine($"Prompt Server listening on {urlPrefix}");

        while (true)
        {
            var context = await httpListener.GetContextAsync();
            if (context.Request.IsWebSocketRequest)
            {
                await HandleWebSocketConnectionAsync(context);
            }
            else
            {
                context.Response.StatusCode = 400;
                context.Response.Close();
            }
        }
    }

    private static void Initialize(){
        var configuration = new ConfigurationBuilder()
            .SetBasePath(AppDomain.CurrentDomain.BaseDirectory)
            .AddJsonFile("appsettings.json")
            .Build();

        var serverConfig = new PromptServerConfig();
        configuration.GetSection("AppSettings").Bind(serverConfig);

        promptServerConfig = serverConfig;
    }

    static async Task HandleWebSocketConnectionAsync(HttpListenerContext context)
    {
        var webSocketContext = await context.AcceptWebSocketAsync(null);
        var webSocket = webSocketContext.WebSocket;

        var jsonRpc = new JsonRpc(new WebSocketMessageHandler(webSocket));
        var ollamaService = new OllamaService(promptServerConfig.OllamaApiUrl);
        var modelInvoker = new ModelInvoker(promptServerConfig.OllamaApiUrl, maxConcurrentInvocations: 1);
        modelInvoker.Start();
        
        jsonRpc.AddLocalRpcTarget(modelInvoker);
        jsonRpc.AddLocalRpcTarget(ollamaService);
        jsonRpc.StartListening();
        
        Console.WriteLine("WebSocket connection established.");
        Console.WriteLine("JSON-RPC server online.");
        Console.WriteLine("Waiting for requests...");
        
        await jsonRpc.Completion;
        Console.WriteLine("JSON-RPC server offline.");
        await modelInvoker.StopAsync();
    }
}
