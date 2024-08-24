using BAIsic.LlmApi.Ollama;
using System;
using System.Collections.Concurrent;
using System.Reflection.Metadata.Ecma335;
using System.Threading;
using System.Threading.Tasks;


namespace PromptEditor
{
    public class ModelInvoker : IModelInvoker
    {
        private const int TimeoutMinutes = 20;

        private OllamaClient _ollama;
        private Task? _processingTask;
        private CancellationTokenSource? _cancellationTokenSource;

        private readonly ConcurrentQueue<ModelRequest> _requestQueue = new ConcurrentQueue<ModelRequest>();
        private readonly SemaphoreSlim _modelSemaphore;

        public ModelInvoker(string ollamaApiUrl, int maxConcurrentInvocations)
        {
            _ollama = new OllamaClient(new HttpClient()
            {
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

        public Task<ChatResponse> InvokeModelAsync(InvokeRequest request)
        {
            var tcs = new TaskCompletionSource<ChatResponse>();
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

                        var chatRequest = new ChatRequest
                        {
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
                            Stream = false,
                            KeepAlive = -1,
                        };

                        var timeout = TimeSpan.FromMinutes(TimeoutMinutes);
                        using var cts = new CancellationTokenSource(timeout);

                        ChatResponse? modelResponse = null;
                        try
                        {
                            modelResponse = await _ollama.InvokeChatCompletionAsync(chatRequest, cancellationToken: cts.Token);
                        }
                        catch (TaskCanceledException ex)
                        {
                            modelResponse = new ChatResponse()
                            {
                                Message = new Message()
                                {
                                    Content = "<timeout waiting for a response>",
                                    Role = string.Empty
                                }
                            };
                        }

                        request.CompletionSource.SetResult(modelResponse);
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
                    await Task.Delay(500); // Prevent spinning if the queue is empty
                }
            }
        }
    }


}