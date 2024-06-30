using System;
using System.Collections.Concurrent;
using System.Reflection.Metadata.Ecma335;
using System.Threading;
using System.Threading.Tasks;
using OllamaSharp;
using OllamaSharp.Models;
using OllamaSharp.Models.Chat;
using OllamaSharp.Streamer;

public class ModelInvoker : IModelInvoker
{
    private const int TimeoutMinutes = 20;

    private OllamaApiClient _ollama;
    private Task? _processingTask;
    private CancellationTokenSource? _cancellationTokenSource;

    private readonly ConcurrentQueue<ModelRequest> _requestQueue = new ConcurrentQueue<ModelRequest>();
    private readonly SemaphoreSlim _modelSemaphore;

    public ModelInvoker(string ollamaApiUrl, int maxConcurrentInvocations)
    {
        _ollama = new OllamaApiClient(new HttpClient() { 
            BaseAddress = new Uri(ollamaApiUrl),
            Timeout = TimeSpan.FromMinutes(TimeoutMinutes) 
            });
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

    public Task<string> InvokeModelAsync(InvokeRequest request)
    {
        var tcs = new TaskCompletionSource<string>();
        var modelRequest = new ModelRequest(tcs, request); 
        _requestQueue.Enqueue(modelRequest);
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
                    
                    var chatRequest = new ChatRequest{
                        Model = request.Model,
                        Messages = request.Messages.Select(m => new Message
                        {
                            Role = m.Role,
                            Content = m.Content
                        }).ToList(),
                        Options = new RequestOptions
                        {
                            Temperature = request.Temperature,
                            Stop = request.Stop,
                            TopP = request.TopP,
                            NumCtx = request.NumCtx,
                            NumPredict = request.NumPredict
                        },
                        Stream = false
                    };

                    var timeout = TimeSpan.FromMinutes(TimeoutMinutes);
                    using var cts = new CancellationTokenSource(timeout);
                   
                    ConversationResponse? modelResponse = null;
                    try
                    {
                        modelResponse = await _ollama.SendChat(chatRequest, new ActionResponseStreamer<ChatResponseStream>(s => {}), cts.Token);
                    }
                    catch (TaskCanceledException ex)
                    {
                        modelResponse = new ConversationResponse(new Message{ Content = "<timeout waiting for a response>", Role = string.Empty}, null);
                    }

                    request.CompletionSource.SetResult(modelResponse.Response.Content);
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


