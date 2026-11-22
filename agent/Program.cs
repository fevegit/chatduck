using System.Diagnostics;
using System.Collections.Concurrent;
using Microsoft.Win32;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

internal static class Program
{
    private static readonly string AppDirectory = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "ChatGPTAudioDuckingTM");
    private static readonly string ConfigPath = Path.Combine(AppDirectory, "agent.json");
    private static readonly string LogPath = Path.Combine(AppDirectory, "agent.log");
    private const int Port = 48731;

    private static async Task<int> Main(string[] args)
    {
        Directory.CreateDirectory(AppDirectory);
        AgentConfig config;
        if (File.Exists(ConfigPath))
            config = JsonSerializer.Deserialize<AgentConfig>(File.ReadAllText(ConfigPath), JsonOptions)
                ?? throw new InvalidDataException("agent.json no es válido.");
        else
        {
            config = new AgentConfig { Token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)) };
            await File.WriteAllTextAsync(ConfigPath, JsonSerializer.Serialize(config, JsonOptions), new UTF8Encoding(false));
        }
        var token = config.Token;
        if (token is null || !Regex.IsMatch(token, "^[A-Fa-f0-9]{64}$")) throw new InvalidDataException("Token del agente no válido.");
        var pairRequested = args.Contains("--pair", StringComparer.OrdinalIgnoreCase);
        var shutdownRequested = args.Contains("--shutdown", StringComparer.OrdinalIgnoreCase);
        var uninstallRequested = args.Contains("--uninstall", StringComparer.OrdinalIgnoreCase);
        using var mutex = new Mutex(true, @"Local\ChatGPTAudioDuckingTM", out var firstInstance);
        if (shutdownRequested || uninstallRequested)
        {
            if (uninstallRequested) AgentStartup.RemoveIfOwned();
            if (!firstInstance)
            {
                try { await AgentProtocol.RequestCommandAsync(token, "shutdown"); }
                catch { try { await AgentProtocol.RequestLegacyShutdownAsync(token); } catch { } }
                await Task.Delay(500);
            }
            if (uninstallRequested)
                foreach (var name in new[] { "agent.json", "agent.log", "ChatGPT-Audio-Ducking.user.js", "ChatGPT-Audio-Ducking.user.js.tmp", "agent.json.tmp" })
                    try { File.Delete(Path.Combine(AppDirectory, name)); } catch { }
            return 0;
        }
        if (!firstInstance)
        {
            if (pairRequested) await AgentProtocol.RequestPairingAsync(token);
            return 0;
        }

        void Log(string message)
        {
            try
            {
                var line = $"{DateTimeOffset.Now:O} {message.Replace('\r', ' ').Replace('\n', ' ')}{Environment.NewLine}";
                File.AppendAllText(LogPath, line, Encoding.UTF8);
            }
            catch { }
        }

        using var stop = new CancellationTokenSource();
        var media = new MediaCoordinator(AppDirectory, Log);
        await media.RestorePendingAtStartupAsync();
        Log($"precarga de ruta WASAPI de Ducking; {media.WarmUpDuckingPath():F1} ms");
        using var server = new LocalControlServer(Port, token, Path.Combine(AppDirectory, "settings.html"),
            Path.Combine(AppDirectory, "ChatGPT-Audio-Ducking.template.user.js"),
            Path.Combine(AppDirectory, "ChatGPT-Audio-Ducking.user.js"), ConfigPath, config, media, Log, stop);
        Log("agente iniciado en loopback");
        try { await server.RunAsync(stop.Token, pairRequested); }
        catch (HttpListenerException error) { Log($"listener detenido: {error.Message}"); }
        catch (Exception error) { Log($"error de listener: {error.GetType().Name} {error.Message}"); }
        finally
        {
            await media.RestoreAllAsync("agent-shutdown");
            Log("agente detenido");
        }
        return 0;
    }

    internal static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        WriteIndented = false
    };
}

internal sealed class AgentConfig
{
    public string? Token { get; set; }
    public List<string> CustomDomains { get; set; } = [];
}

internal sealed class LocalControlServer : IDisposable
{
    private readonly HttpListener _listener = new();
    private readonly string _token;
    private readonly string _settingsPath;
    private readonly string _scriptTemplatePath;
    private readonly string _installedScriptPath;
    private readonly string _configPath;
    private readonly AgentConfig _config;
    private readonly MediaCoordinator _media;
    private readonly Action<string> _log;
    private readonly CancellationTokenSource _stop;
    private readonly int _port;
    private readonly ConcurrentDictionary<string, long> _usedNonces = new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<string, (byte[] Contents, long ExpiresAt)> _downloadTickets = new(StringComparer.Ordinal);
    private string? _pairingCode;
    private DateTimeOffset _pairingExpires;
    private readonly object _pairLock = new();

    public LocalControlServer(int port, string token, string settingsPath, string scriptTemplatePath, string installedScriptPath,
        string configPath, AgentConfig config, MediaCoordinator media, Action<string> log, CancellationTokenSource stop)
    {
        _port = port;
        _token = token;
        _settingsPath = settingsPath;
        _scriptTemplatePath = scriptTemplatePath;
        _installedScriptPath = installedScriptPath;
        _configPath = configPath;
        _config = config;
        _media = media;
        _log = log;
        _stop = stop;
        _listener.Prefixes.Add($"http://127.0.0.1:{port}/");
    }

    public async Task RunAsync(CancellationToken cancellationToken, bool pairRequested = false)
    {
        _listener.Start();
        if (pairRequested) OpenPairing();
        using var registration = cancellationToken.Register(() => { try { _listener.Stop(); } catch { } });
        while (!cancellationToken.IsCancellationRequested)
        {
            HttpListenerContext context;
            try { context = await _listener.GetContextAsync(); }
            catch (HttpListenerException) when (cancellationToken.IsCancellationRequested) { break; }
            catch (ObjectDisposedException) { break; }
            _ = ProcessAsync(context);
        }
    }

    private async Task ProcessAsync(HttpListenerContext context)
    {
        var requestReceivedAt = Stopwatch.GetTimestamp();
        var request = context.Request;
        var response = context.Response;
        string? authenticatedNonce = null;
        var authenticated = false;
        bool shutdown = false;
        try
        {
            response.Headers["Cache-Control"] = "no-store";
            response.Headers["X-Content-Type-Options"] = "nosniff";
            response.Headers["Vary"] = "Origin";
            response.Headers["Referrer-Policy"] = "no-referrer";
            response.Headers["X-Frame-Options"] = "DENY";
            response.Headers["Permissions-Policy"] = "microphone=(), camera=(), geolocation=()";

            var origin = request.Headers["Origin"];
            if (!request.RemoteEndPoint?.Address.Equals(IPAddress.Loopback) ?? true) { await ReplyAsync(response, 403, new { error = "Origen de red no permitido." }); return; }
            if (!string.Equals(request.Headers["Host"], $"127.0.0.1:{_port}", StringComparison.OrdinalIgnoreCase)) { await ReplyAsync(response, 403, new { error = "Host local no permitido." }); return; }
            if (request.HttpMethod == "GET" && request.Url?.AbsolutePath == "/pair")
            {
                if (!string.IsNullOrEmpty(origin) && !string.Equals(origin, $"http://127.0.0.1:{_port}", StringComparison.OrdinalIgnoreCase))
                { await ReplyAsync(response, 403, new { error = "Origen local no permitido." }); return; }
                await ReplyPairPageAsync(response);
                return;
            }
            if (request.HttpMethod == "POST" && request.Url?.AbsolutePath == "/v1/pair")
            {
                if (request.ContentLength64 is < 0 or > 1024) { await ReplyAsync(response, 413, new { error = "Solicitud demasiado grande." }); return; }
                using var pairReader = new StreamReader(request.InputStream, request.ContentEncoding ?? Encoding.UTF8);
                var pairBody = await pairReader.ReadToEndAsync();
                if (Encoding.UTF8.GetByteCount(pairBody) > 1024) { await ReplyAsync(response, 413, new { error = "Solicitud demasiado grande." }); return; }
                using var pairDoc = JsonDocument.Parse(pairBody, new JsonDocumentOptions { MaxDepth = 3 });
                var code = pairDoc.RootElement.TryGetProperty("code", out var codeValue) && codeValue.ValueKind == JsonValueKind.String ? codeValue.GetString() : null;
                if (!ConsumePairingCode(code)) { await ReplyAsync(response, 401, new { error = "Código caducado o incorrecto. Inicia de nuevo ChatDuck Agent." }); return; }
                await ReplyAsync(response, 200, new { ok = true, token = _token });
                return;
            }
            if (request.HttpMethod == "GET" && request.Url?.AbsolutePath == "/settings")
            {
                if (!string.IsNullOrEmpty(origin) && !string.Equals(origin, $"http://127.0.0.1:{_port}", StringComparison.OrdinalIgnoreCase))
                {
                    await ReplyAsync(response, 403, new { error = "Origen local no permitido." });
                    return;
                }
                await ReplySettingsAsync(response);
                return;
            }
            if (request.HttpMethod == "GET" && request.Url?.AbsolutePath == "/ChatGPT-Audio-Ducking.user.js")
            {
                await ReplyUserscriptAsync(request, response);
                return;
            }
            if (!AllowedOrigin(origin)) { await ReplyAsync(response, 403, new { error = "Origen no permitido." }); return; }
            if (!string.IsNullOrEmpty(origin)) response.Headers["Access-Control-Allow-Origin"] = origin;

            if (request.HttpMethod == "OPTIONS")
            {
                response.Headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
                response.Headers["Access-Control-Allow-Headers"] = "Content-Type, X-Audio-Ducking-Timestamp, X-Audio-Ducking-Nonce, X-Audio-Ducking-Signature";
                response.StatusCode = 204;
                return;
            }
            if (request.HttpMethod != "POST" || request.Url?.AbsolutePath != "/v1/command") { await ReplyAsync(response, 404, new { error = "Ruta no encontrada." }); return; }
            if (!string.Equals(request.ContentType?.Split(';')[0].Trim(), "application/json", StringComparison.OrdinalIgnoreCase)) { await ReplyAsync(response, 415, new { error = "Se requiere JSON." }); return; }
            if (request.ContentLength64 is < 0 or > 8192) { await ReplyAsync(response, 413, new { error = "Solicitud demasiado grande." }); return; }
            using var reader = new StreamReader(request.InputStream, request.ContentEncoding ?? Encoding.UTF8);
            var body = await reader.ReadToEndAsync();
            if (Encoding.UTF8.GetByteCount(body) > 8192) { await ReplyAsync(response, 413, new { error = "Solicitud demasiado grande." }); return; }
            authenticatedNonce = request.Headers["X-Audio-Ducking-Nonce"];
            if (!Authorized(request, body, authenticatedNonce)) { await ReplyAsync(response, 401, new { error = "Autenticación local no válida." }); return; }
            authenticated = true;
            using var doc = JsonDocument.Parse(body, new JsonDocumentOptions { MaxDepth = 8 });
            var root = doc.RootElement;
            var command = root.TryGetProperty("command", out var commandValue) ? commandValue.GetString() : null;
            object result = command switch
            {
                "status" => GetStatus(),
                "list-apps" => await _media.ListApplications(),
                "validate-app" => ValidateApp(root),
                "prepare-sites" => await PrepareSitesAsync(root),
                "begin" => await BeginAsync(root, requestReceivedAt),
                "heartbeat" => _media.Heartbeat(ReadSessionId(root)),
                "restore" => await _media.RestoreAsync(ReadSessionId(root), "dictation-ended"),
                "restore-all" => await _media.RestoreAllAsync("manual-restore-all"),
                "shutdown" => await ShutdownAsync(),
                "set-autostart" => SetAutostart(root),
                "pair" => OpenPairing(),
                _ => new { ok = false, error = "Comando no reconocido." }
            };
            shutdown = command == "shutdown";
            await ReplyAuthenticatedAsync(response, 200, result, authenticatedNonce!);
        }
        catch (JsonException)
        {
            if (authenticated) await ReplyAuthenticatedAsync(response, 400, new { error = "JSON no válido." }, authenticatedNonce!);
            else await ReplyAsync(response, 400, new { error = "JSON no válido." });
        }
        catch (Exception error)
        {
            _log($"solicitud fallida: {error.GetType().Name} {error.Message}");
            if (authenticated) await ReplyAuthenticatedAsync(response, 500, new { error = "Error local al controlar el audio." }, authenticatedNonce!);
            else await ReplyAsync(response, 500, new { error = "Error local al controlar el audio." });
        }
        finally
        {
            try { response.Close(); } catch { }
            if (shutdown) _stop.Cancel();
        }
    }

    private async Task<object> BeginAsync(JsonElement root, long requestReceivedAt)
    {
        var sessionId = ReadSessionId(root);
        var settings = root.TryGetProperty("settings", out var value) ? AgentSettings.From(value) : new AgentSettings();
        return await _media.BeginAsync(sessionId, settings, requestReceivedAt);
    }

    private async Task<object> ShutdownAsync()
    {
        var result = await _media.RestoreAllAsync("uninstall");
        _stop.CancelAfter(200);
        return result;
    }

    private object GetStatus()
    {
        var status = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        using var doc = JsonDocument.Parse(JsonSerializer.Serialize(_media.GetStatus(), Program.JsonOptions));
        foreach (var item in doc.RootElement.EnumerateObject()) status[item.Name] = item.Value.Clone();
        status["autostartEnabled"] = AgentStartup.IsEnabled();
        return status;
    }

    private static object SetAutostart(JsonElement root)
    {
        if (!root.TryGetProperty("enabled", out var value) || value.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
            throw new JsonException("El valor de inicio no es válido.");
        AgentStartup.SetEnabled(value.GetBoolean());
        return new { ok = true, autostartEnabled = AgentStartup.IsEnabled() };
    }

    private object OpenPairing()
    {
        var code = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        lock (_pairLock) { _pairingCode = code; _pairingExpires = DateTimeOffset.UtcNow.AddMinutes(5); }
        Process.Start(new ProcessStartInfo($"http://127.0.0.1:{_port}/pair#{code}") { UseShellExecute = true });
        return new { ok = true, expiresInSeconds = 300 };
    }

    private bool ConsumePairingCode(string? code)
    {
        if (code is null || !Regex.IsMatch(code, "^[a-f0-9]{64}$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)) return false;
        lock (_pairLock)
        {
            if (_pairingCode is null || DateTimeOffset.UtcNow > _pairingExpires) { _pairingCode = null; return false; }
            var valid = CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(_pairingCode), Encoding.ASCII.GetBytes(code));
            if (valid) _pairingCode = null;
            return valid;
        }
    }

    private object ValidateApp(JsonElement root)
    {
        var value = root.TryGetProperty("path", out var pathValue) && pathValue.ValueKind == JsonValueKind.String ? pathValue.GetString() : null;
        var path = AppIdentity.NormalizeExecutablePath(value);
        if (path.Length == 0 || !File.Exists(path) || AppIdentity.IsProtectedExecutable(path))
            return new { ok = false, error = "Selecciona una ruta local válida a un ejecutable no protegido." };
        return new { ok = true, path, executable = Path.GetFileName(path) };
    }

    private async Task<object> PrepareSitesAsync(JsonElement root)
    {
        if (!root.TryGetProperty("domains", out var value) || value.ValueKind != JsonValueKind.Array || value.GetArrayLength() > 24)
            throw new JsonException("La lista de dominios no es válida.");
        var domains = new List<string>();
        foreach (var item in value.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.String) throw new JsonException("La lista de dominios no es válida.");
            var domain = NormalizeCustomDomain(item.GetString());
            if (domain is null) throw new JsonException("Hay un dominio personalizado no válido o protegido.");
            if (!domains.Contains(domain, StringComparer.OrdinalIgnoreCase)) domains.Add(domain);
        }

        if (!File.Exists(_scriptTemplatePath)) return new { ok = false, error = "Falta la plantilla local del userscript." };
        var template = await File.ReadAllTextAsync(_scriptTemplatePath);
        const string marker = "// @CUSTOM_SITE_MATCHES@";
        if (Regex.Matches(template, Regex.Escape(marker)).Count != 1)
            return new { ok = false, error = "La plantilla del userscript no tiene los marcadores esperados." };
        var matches = string.Join(Environment.NewLine, domains.SelectMany(domain => new[]
        {
            $"// @match        https://{domain}/*",
            $"// @match        https://*.{domain}/*"
        }));
        var script = template.Replace(marker, matches, StringComparison.Ordinal);
        var newConfig = new AgentConfig { Token = _token, CustomDomains = domains };
        var tempScript = _installedScriptPath + ".tmp";
        var tempConfig = _configPath + ".tmp";
        await File.WriteAllTextAsync(tempScript, script, new UTF8Encoding(false));
        await File.WriteAllTextAsync(tempConfig, JsonSerializer.Serialize(newConfig, Program.JsonOptions), new UTF8Encoding(false));
        File.Move(tempScript, _installedScriptPath, overwrite: true);
        File.Move(tempConfig, _configPath, overwrite: true);
        _config.CustomDomains = domains;
        var ticket = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        _downloadTickets[ticket] = (await File.ReadAllBytesAsync(_installedScriptPath), DateTimeOffset.UtcNow.AddMinutes(2).ToUnixTimeSeconds());
        return new { ok = true, domains, url = $"http://127.0.0.1:{_port}/ChatGPT-Audio-Ducking.user.js?ticket={ticket}" };
    }

    private static string? NormalizeCustomDomain(string? value)
    {
        var text = (value ?? "").Trim();
        if (text.Length is 0 or > 2048 || text.Any(char.IsControl) || text.Any(char.IsWhiteSpace) || text.Contains('\\')) return null;
        if (!Regex.IsMatch(text, "^[A-Za-z][A-Za-z0-9+.-]*://", RegexOptions.CultureInvariant)) text = $"https://{text}";
        if (!Uri.TryCreate(text, UriKind.Absolute, out var uri) || uri.Scheme != "https" || uri.UserInfo.Length > 0) return null;
        var domain = uri.IdnHost.TrimEnd('.').ToLowerInvariant();
        if (domain.Length is 0 or > 253 || !domain.Contains('.') || domain.EndsWith(".local", StringComparison.Ordinal) || domain.EndsWith(".internal", StringComparison.Ordinal)) return null;
        if (IPAddress.TryParse(domain, out _)) return null;
        string[] blocked = ["chatgpt.com", "youtube.com", "youtu.be", "ytimg.com", "youtube-nocookie.com", "spotify.com", "twitch.tv", "localhost"];
        if (blocked.Any(item => domain == item || domain.EndsWith($".{item}", StringComparison.Ordinal))) return null;
        var labels = domain.Split('.');
        if (labels.Any(label => label.Length is 0 or > 63 || !Regex.IsMatch(label, "^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$", RegexOptions.CultureInvariant)) ||
            !Regex.IsMatch(labels[^1], "^[a-z]{2,63}$", RegexOptions.CultureInvariant)) return null;
        return domain;
    }

    private static string ReadSessionId(JsonElement root) =>
        root.TryGetProperty("sessionId", out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() ?? "" : "";

    private bool Authorized(HttpListenerRequest request, string body, string? nonce)
    {
        var timestamp = request.Headers["X-Audio-Ducking-Timestamp"];
        var suppliedSignature = request.Headers["X-Audio-Ducking-Signature"];
        if (nonce is null || !Regex.IsMatch(nonce, "^[A-Za-z0-9_-]{22}$") ||
            !long.TryParse(timestamp, System.Globalization.NumberStyles.None, System.Globalization.CultureInfo.InvariantCulture, out var seconds) ||
            Math.Abs(DateTimeOffset.UtcNow.ToUnixTimeSeconds() - seconds) > 30 || string.IsNullOrEmpty(suppliedSignature)) return false;
        var signedData = $"req\nPOST\n/v1/command\n{timestamp}\n{nonce}\n{body}";
        if (!AgentProtocol.Verify(_token, signedData, suppliedSignature)) return false;
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        if (!_usedNonces.TryAdd(nonce, now)) return false;
        if (_usedNonces.Count > 1024)
            foreach (var item in _usedNonces) if (item.Value < now - 60) _usedNonces.TryRemove(item.Key, out _);
        return true;
    }

    private static bool AllowedOrigin(string? origin)
    {
        if (string.IsNullOrWhiteSpace(origin)) return true; // GM_xmlhttpRequest may omit Origin.
        if (string.Equals(origin, "https://chatgpt.com", StringComparison.OrdinalIgnoreCase)) return true;
        if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri) || uri.Scheme != "moz-extension") return false;
        return Regex.IsMatch(uri.Host, "^[a-f0-9-]{16,64}$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
    }

    private static async Task ReplyAsync(HttpListenerResponse response, int status, object value)
    {
        if (response.OutputStream.CanWrite)
        {
            response.StatusCode = status;
            response.ContentType = "application/json; charset=utf-8";
            var data = JsonSerializer.SerializeToUtf8Bytes(value, Program.JsonOptions);
            response.ContentLength64 = data.Length;
            await response.OutputStream.WriteAsync(data);
        }
    }

    private async Task ReplyAuthenticatedAsync(HttpListenerResponse response, int status, object value, string nonce)
    {
        if (!response.OutputStream.CanWrite) return;
        var data = JsonSerializer.SerializeToUtf8Bytes(value, Program.JsonOptions);
        response.StatusCode = status;
        response.ContentType = "application/json; charset=utf-8";
        response.Headers["X-Audio-Ducking-Response-Nonce"] = nonce;
        response.Headers["X-Audio-Ducking-Response-Signature"] = AgentProtocol.Sign(_token, $"resp\n{status}\n{nonce}\n{Encoding.UTF8.GetString(data)}");
        response.ContentLength64 = data.Length;
        await response.OutputStream.WriteAsync(data);
    }

    private async Task ReplySettingsAsync(HttpListenerResponse response)
    {
        if (!File.Exists(_settingsPath)) { await ReplyAsync(response, 404, new { error = "No se encontró la página de ajustes." }); return; }
        response.StatusCode = 200;
        response.ContentType = "text/html; charset=utf-8";
        response.Headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'";
        var data = await File.ReadAllBytesAsync(_settingsPath);
        response.ContentLength64 = data.Length;
        await response.OutputStream.WriteAsync(data);
    }

    private static readonly byte[] PairPage = Encoding.UTF8.GetBytes("<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>ChatDuck pairing</title><main><h1>ChatDuck</h1><p>Windows Agent 2.7.6-beta.1</p><p data-pair-status>Connecting this browser to ChatDuck Agent…</p><p>Keep this tab open while pairing. Tampermonkey must be installed in this browser. If this remains on Connecting, install the ChatDuck userscript in this browser and start ChatDuck Agent again from the Start menu.</p></main>");

    private async Task ReplyPairPageAsync(HttpListenerResponse response)
    {
        response.StatusCode = 200;
        response.ContentType = "text/html; charset=utf-8";
        response.Headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'";
        response.ContentLength64 = PairPage.Length;
        await response.OutputStream.WriteAsync(PairPage);
    }

    private async Task ReplyUserscriptAsync(HttpListenerRequest request, HttpListenerResponse response)
    {
        var ticket = request.QueryString["ticket"];
        if (ticket is null || !_downloadTickets.TryRemove(ticket, out var file)) { await ReplyAsync(response, 404, new { error = "Descarga no autorizada o ya utilizada." }); return; }
        if (file.ExpiresAt < DateTimeOffset.UtcNow.ToUnixTimeSeconds()) { await ReplyAsync(response, 410, new { error = "La descarga ha caducado. Vuelve a autorizar el sitio." }); return; }
        response.StatusCode = 200;
        response.ContentType = "application/javascript; charset=utf-8";
        response.Headers["Content-Disposition"] = "inline; filename=ChatGPT-Audio-Ducking.user.js";
        var data = file.Contents;
        response.ContentLength64 = data.Length;
        await response.OutputStream.WriteAsync(data);
    }

    public void Dispose() { try { _listener.Close(); } catch { } }
}

internal static class AgentStartup
{
    private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string ValueName = "ChatGPTAudioDuckingAgent";

    public static bool IsEnabled()
    {
        using var key = Registry.CurrentUser.OpenSubKey(RunKey, writable: false);
        var value = key?.GetValue(ValueName) as string;
        var exe = Environment.ProcessPath;
        if (string.IsNullOrWhiteSpace(value) || string.IsNullOrWhiteSpace(exe)) return false;
        var configured = value.Trim().Trim('"');
        return string.Equals(Path.GetFullPath(configured), Path.GetFullPath(exe), StringComparison.OrdinalIgnoreCase);
    }

    public static void SetEnabled(bool enabled)
    {
        using var key = Registry.CurrentUser.CreateSubKey(RunKey, writable: true)
            ?? throw new InvalidOperationException("No se pudo abrir la configuración de inicio de esta cuenta.");
        if (!enabled) { key.DeleteValue(ValueName, throwOnMissingValue: false); return; }
        var exe = Environment.ProcessPath ?? throw new InvalidOperationException("No se encontró la ruta del agente.");
        key.SetValue(ValueName, $"\"{exe}\"", RegistryValueKind.String);
    }

    public static void RemoveIfOwned()
    {
        using var key = Registry.CurrentUser.OpenSubKey(RunKey, writable: true);
        var value = key?.GetValue(ValueName) as string;
        var exe = Environment.ProcessPath;
        if (string.IsNullOrWhiteSpace(value) || string.IsNullOrWhiteSpace(exe)) return;
        if (string.Equals(Path.GetFullPath(value.Trim().Trim('"')), Path.GetFullPath(exe), StringComparison.OrdinalIgnoreCase))
            key!.DeleteValue(ValueName, throwOnMissingValue: false);
    }
}

internal sealed class AgentSettings
{
    public string Mode { get; set; } = "pause";
    public int TargetVolumePercent { get; set; } = 10;
    public int FadeOutMs { get; set; } = 200;
    public int FadeInMs { get; set; } = 350;
    public bool FallbackDucking { get; set; } = true;
    public bool FallbackToPause { get; set; } = true;
    public bool SpotifyDesktop { get; set; } = true;
    public List<WindowsAppSelection> WindowsApps { get; set; } = [];
    public Dictionary<string, PlayerRule> PlayerRules { get; set; } = new(StringComparer.OrdinalIgnoreCase);

    public AgentSettings ForPlayerRule(string key)
    {
        PlayerRules.TryGetValue(key, out var rule);
        var policy = PlayerPolicy.Resolve(Mode, TargetVolumePercent, rule);
        return new AgentSettings
        {
            Mode = policy.Mode,
            TargetVolumePercent = policy.TargetVolumePercent,
            FadeOutMs = FadeOutMs,
            FadeInMs = FadeInMs,
            FallbackDucking = FallbackDucking,
            FallbackToPause = FallbackToPause,
            SpotifyDesktop = SpotifyDesktop,
            WindowsApps = WindowsApps,
            PlayerRules = PlayerRules
        };
    }

    public static AgentSettings From(JsonElement value)
    {
        var result = JsonSerializer.Deserialize<AgentSettings>(value.GetRawText(), Program.JsonOptions) ?? new AgentSettings();
        result.Mode = result.Mode == "duck" ? "duck" : "pause";
        result.TargetVolumePercent = Math.Clamp(result.TargetVolumePercent, 0, 100);
        result.FadeOutMs = Math.Clamp(result.FadeOutMs, 0, 1000);
        result.FadeInMs = Math.Clamp(result.FadeInMs, 0, 1500);
        result.WindowsApps = (result.WindowsApps ?? []).Where(app => app is not null && (app.Path.Length == 0 || !AppIdentity.IsProtectedExecutable(app.Path))).Select(app => new WindowsAppSelection
            {
                Path = AppIdentity.NormalizeExecutablePath(app.Path),
                Enabled = app.Enabled,
                AppUserModelIds = (app.AppUserModelIds ?? []).Where(id => !string.IsNullOrWhiteSpace(id) && id.Length <= 240 && !id.Any(char.IsControl) && !AppIdentity.IsProtectedMediaId(id))
                    .Distinct(StringComparer.OrdinalIgnoreCase).Take(16).ToList()
            })
            .Where(app => (app.Path.Length > 0 && !AppIdentity.IsProtectedExecutable(app.Path)) || app.AppUserModelIds.Count > 0)
            .ToList();
        result.PlayerRules = (result.PlayerRules ?? new(StringComparer.OrdinalIgnoreCase)).Take(128).ToDictionary(
            pair => pair.Key.Length <= 520 ? pair.Key : pair.Key[..520],
            pair => new PlayerRule
            {
                Mode = pair.Value?.Mode is "pause" or "duck" ? pair.Value.Mode : "general",
                TargetVolumePercent = pair.Value?.TargetVolumePercent is int target ? Math.Clamp(target, 0, 100) : null
            }, StringComparer.OrdinalIgnoreCase);
        return result;
    }
}

internal sealed class WindowsAppSelection
{
    public string Path { get; set; } = "";
    public bool Enabled { get; set; } = true;
    public List<string> AppUserModelIds { get; set; } = [];
}
