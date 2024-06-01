using System;
using System.Collections.Concurrent;
using System.Threading;
using System.Threading.Tasks;
using OllamaSharp;
using OllamaSharp.Models;

public class ModelInvoker : IModelInvoker
{
    private OllamaApiClient _ollama;
    private Task? _processingTask;
    private CancellationTokenSource? _cancellationTokenSource;

    private readonly ConcurrentQueue<ModelRequest> _requestQueue = new ConcurrentQueue<ModelRequest>();
    private readonly SemaphoreSlim _modelSemaphore;

    public ModelInvoker(string ollamaApiUrl, int maxConcurrentInvocations)
    {
        _ollama = new OllamaApiClient(ollamaApiUrl);
        _modelSemaphore = new SemaphoreSlim(maxConcurrentInvocations);
    }

    public void Start()
    {
        _cancellationTokenSource = new CancellationTokenSource();
        _processingTask = Task.Run(() => ProcessQueueAsync(_cancellationTokenSource.Token));
    }

    public async Task StopAsync()
    {
        if (_cancellationTokenSource == null)
        {
            return;
        }
        await _cancellationTokenSource.CancelAsync();

        if (_processingTask != null)
        {
            await _processingTask;
        }
    }

    public Task<string> InvokeModelAsync(string prompt, string model, float temperature, string[] stop, string systemPrompt)
    {
        var tcs = new TaskCompletionSource<string>();
        var request = new ModelRequest(tcs, prompt, model, temperature, stop, systemPrompt);
        _requestQueue.Enqueue(request);
        return tcs.Task;
    }

    private async Task ProcessQueueAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            if (_requestQueue.TryDequeue(out var request))
            {
                try
                {
                    await _modelSemaphore.WaitAsync(); // Wait for availability
                    var modelRequest = new GenerateCompletionRequest
                    {
                        Model = request.Model,
                        System = request.System,
                        Prompt = request.Prompt,
                        Options = new RequestOptions
                        {
                            Temperature = request.Temperature,
                            Stop = request.Stop,
                            // NumCtx = 8192
                        }
                    };

                    var timeout = TimeSpan.FromMinutes(10);
                    using var cts = new CancellationTokenSource(timeout);
                   
                    ConversationContextWithResponse? modelResponse = null;
                    try
                    {
                        modelResponse = await _ollama.GetCompletion(modelRequest, cts.Token);   
                    }
                    catch (TaskCanceledException)
                    {
                        modelResponse = new ConversationContextWithResponse("<timeout>", [], null);
                    }

                    request.CompletionSource.SetResult(modelResponse.Response);
                }
                catch (Exception ex)
                {
                    request.CompletionSource.SetException(ex); // Handle failure
                }
                finally
                {
                    _modelSemaphore.Release();
                }
            }
            else
            {
                await Task.Delay(100); // Prevent spinning if the queue is empty
            }
        }
    }
}

class ModelRequest
{
    public TaskCompletionSource<string> CompletionSource { get; }

    public string Model { get; }
    public string Prompt { get; }

    public string System {get; }

    public float Temperature { get; }

    public string[] Stop { get; }

    public ModelRequest(TaskCompletionSource<string> completionSource, string prompt, string model, float temperature, string[] stop, string systemPrompt)
    {
        CompletionSource = completionSource;
        Model = model;
        Prompt = prompt;
        Temperature = temperature;
        Stop = stop;
        System = systemPrompt;
    }
}
