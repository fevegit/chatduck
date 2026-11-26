using System.Diagnostics;
using System.Collections.Concurrent;
using Microsoft.Win32;
using System.Net;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

internal static class Program
{
    private static string AppDirectory = "";
    private static string InstallDirectory = "";
    private static string ConfigPath = "";
    private static string LogPath = "";
    private static int Port;

    private static async Task<int> Main(string[] args)
    {
        var experimental = args.Contains("--experimental", StringComparer.OrdinalIgnoreCase);
        if (args.Contains("--installer-check-version", StringComparer.OrdinalIgnoreCase))
            return CheckInstallerVersion(args);
        if (args.Contains("--installer-start", StringComparer.OrdinalIgnoreCase))
            return await StartAndVerifyInstalledAgentAsync(args);
        if (args.Contains("--installer-restore", StringComparer.OrdinalIgnoreCase))
            return await StartAndVerifyRestoredAgentAsync(args);
        if (args.Contains("--installer-stop-owned", StringComparer.OrdinalIgnoreCase))
            return await StopOwnedAgentForRollbackAsync(args);
        if (!experimental) AgentStartup.MigrateLegacyPathIfOwned();
        InstallDirectory = Path.GetDirectoryName(Environment.ProcessPath) ?? AppContext.BaseDirectory;
        AppDirectory = experimental
            ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "ChatDuckExperimental")
            : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ChatDuck");
        if (!experimental) AgentDataMigration.MigrateLegacyDataIfNeeded(InstallDirectory, AppDirectory);
        ConfigPath = Path.Combine(AppDirectory, "agent.json");
        LogPath = Path.Combine(AppDirectory, "agent.log");
        Port = experimental ? 48732 : 48731;
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
        using var mutex = new Mutex(true, experimental ? @"Local\ChatDuckExperimentalAgent" : @"Local\ChatGPTAudioDuckingTM", out var firstInstance);
        if (shutdownRequested || uninstallRequested)
        {
            if (uninstallRequested && !experimental) AgentStartup.RemoveIfOwned();
            if (!firstInstance)
            {
                try { await AgentProtocol.RequestCommandAsync(token, "shutdown", Port); }
                catch { try { await AgentProtocol.RequestLegacyShutdownAsync(token, Port); } catch { } }
                if (!await WaitForSiblingAgentExitAsync(mutex, TimeSpan.FromSeconds(10))) return 3;
            }
            if (uninstallRequested)
                foreach (var name in new[] { "agent.json", "agent.log", "ChatGPT-Audio-Ducking.user.js", "ChatGPT-Audio-Ducking.user.js.tmp", "agent.json.tmp" })
                    try { File.Delete(Path.Combine(AppDirectory, name)); } catch { }
            return 0;
        }
        if (!firstInstance)
        {
            if (pairRequested) await AgentProtocol.RequestPairingAsync(token, Port);
            return 0;
        }

        var logSync = new object();
        void Log(string message)
        {
            lock (logSync)
            {
                try
                {
                    var line = $"{DateTimeOffset.Now:O} {message.Replace('\r', ' ').Replace('\n', ' ')}{Environment.NewLine}";
                    File.AppendAllText(LogPath, line, Encoding.UTF8);
                }
                catch { }
            }
        }

        using var stop = new CancellationTokenSource();
        var media = new MediaCoordinator(AppDirectory, Log);
        await media.RestorePendingAtStartupAsync();
        Log($"precarga de ruta WASAPI de Ducking; {media.WarmUpDuckingPath():F1} ms");
        using var server = new LocalControlServer(Port, token, Path.Combine(InstallDirectory, "settings.html"),
            Path.Combine(InstallDirectory, "ChatGPT-Audio-Ducking.template.user.js"),
            Path.Combine(AppDirectory, "ChatGPT-Audio-Ducking.user.js"), ConfigPath, config, media, Log, stop, experimental);
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

    private static async Task<int> StartAndVerifyInstalledAgentAsync(string[] args)
    {
        var expectedVersion = args.SkipWhile(arg => !string.Equals(arg, "--installer-start", StringComparison.OrdinalIgnoreCase))
            .Skip(1).FirstOrDefault();
        if (!MatchesInstallerVersion(expectedVersion)) return 20;

        var executable = Environment.ProcessPath;
        if (string.IsNullOrWhiteSpace(executable) || !File.Exists(executable)) return 21;
        var dataDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ChatDuck");
        AgentDataMigration.MigrateLegacyDataIfNeeded(Path.GetDirectoryName(executable)!, dataDirectory);
        var configPath = Path.Combine(dataDirectory, "agent.json");
        var deadline = DateTime.UtcNow.AddSeconds(12);
        while (!File.Exists(configPath) && DateTime.UtcNow < deadline) await Task.Delay(100);
        if (!File.Exists(configPath))
        {
            var initial = new AgentConfig { Token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)) };
            try
            {
                await using var created = new FileStream(configPath, FileMode.CreateNew, FileAccess.Write, FileShare.None);
                await JsonSerializer.SerializeAsync(created, initial, JsonOptions);
            }
            catch (IOException) { }
        }
        if (!File.Exists(configPath)) return 22;
        var config = JsonSerializer.Deserialize<AgentConfig>(await File.ReadAllTextAsync(configPath), JsonOptions);
        var token = config?.Token;
        if (token is null || !Regex.IsMatch(token, "^[A-Fa-f0-9]{64}$")) return 23;

        using var process = Process.Start(new ProcessStartInfo(executable) { UseShellExecute = false, WorkingDirectory = Path.GetDirectoryName(executable)! });
        if (process is null) return 24;
        var expectedFileVersion = typeof(Program).Assembly.GetCustomAttribute<AssemblyFileVersionAttribute>()?.Version;
        deadline = DateTime.UtcNow.AddSeconds(12);
        Exception? lastError = null;
        while (DateTime.UtcNow < deadline)
        {
            try
            {
                using var status = await AgentProtocol.RequestStatusAsync(token, 48731);
                if (InstallerAgentVerifier.IsExpectedAgent(status.RootElement, expectedVersion, expectedFileVersion, executable, process.Id, Process.GetCurrentProcess().SessionId))
                    return 0;
                lastError = new InvalidOperationException("El agente activo no coincide con versión, ruta, sesión o nivel de privilegio esperados.");
            }
            catch (Exception error) { lastError = error; }
            await Task.Delay(150);
        }
        Console.Error.WriteLine($"No se verificó el agente ChatDuck activo: {lastError?.Message ?? "timeout"}");
        return 25;
    }

    private static int CheckInstallerVersion(string[] args)
    {
        var expectedVersion = args.SkipWhile(arg => !string.Equals(arg, "--installer-check-version", StringComparison.OrdinalIgnoreCase))
            .Skip(1).FirstOrDefault();
        if (!MatchesInstallerVersion(expectedVersion)) return 20;
        var revisionIndex = Array.FindIndex(args, arg => string.Equals(arg, "--source-revision", StringComparison.OrdinalIgnoreCase));
        var expectedRevision = revisionIndex >= 0 && revisionIndex + 1 < args.Length ? args[revisionIndex + 1] : null;
        return expectedRevision is null || string.Equals(expectedRevision, GetSourceRevision(), StringComparison.Ordinal) ? 0 : 26;
    }

    private static bool MatchesInstallerVersion(string? expectedVersion)
    {
        var assemblyVersion = typeof(Program).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? "unknown";
        return string.Equals(expectedVersion, assemblyVersion, StringComparison.Ordinal);
    }

    internal static string GetSourceRevision() => typeof(Program).Assembly.GetCustomAttributes<AssemblyMetadataAttribute>()
        .FirstOrDefault(attribute => attribute.Key == "SourceRevisionId")?.Value ?? "unknown";

    private static async Task<int> StartAndVerifyRestoredAgentAsync(string[] args)
    {
        var marker = Array.FindIndex(args, arg => string.Equals(arg, "--installer-restore", StringComparison.OrdinalIgnoreCase));
        var executable = marker >= 0 && marker + 1 < args.Length ? args[marker + 1].Trim('"') : "";
        if (string.IsNullOrWhiteSpace(executable) || !File.Exists(executable)) return 0;
        executable = Path.GetFullPath(executable);
        var dataDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ChatDuck");
        var configPath = Path.Combine(dataDirectory, "agent.json");
        if (!File.Exists(configPath)) return 30;
        var config = JsonSerializer.Deserialize<AgentConfig>(await File.ReadAllTextAsync(configPath), JsonOptions);
        var token = config?.Token;
        if (token is null || !Regex.IsMatch(token, "^[A-Fa-f0-9]{64}$")) return 31;
        using var process = Process.Start(new ProcessStartInfo(executable) { UseShellExecute = false, WorkingDirectory = Path.GetDirectoryName(executable)! });
        if (process is null) return 32;
        var deadline = DateTime.UtcNow.AddSeconds(12);
        Exception? lastError = null;
        while (DateTime.UtcNow < deadline)
        {
            try
            {
                using var status = await AgentProtocol.RequestStatusAsync(token, 48731);
                if (InstallerAgentVerifier.IsExpectedAgent(status.RootElement, null, null, executable, process.Id, Process.GetCurrentProcess().SessionId))
                    return 0;
                lastError = new InvalidOperationException("El agente restaurado no coincide con el proceso, ruta, sesión o privilegio esperados.");
            }
            catch (Exception error) { lastError = error; }
            await Task.Delay(150);
        }
        Console.Error.WriteLine($"No se verificó el agente restaurado: {lastError?.Message ?? "timeout"}");
        return 33;
    }

    private static async Task<int> StopOwnedAgentForRollbackAsync(string[] args)
    {
        var marker = Array.FindIndex(args, arg => string.Equals(arg, "--installer-stop-owned", StringComparison.OrdinalIgnoreCase));
        var expectedVersion = marker >= 0 && marker + 1 < args.Length ? args[marker + 1].Trim('"') : "";
        var expectedFileVersion = typeof(Program).Assembly.GetCustomAttribute<AssemblyFileVersionAttribute>()?.Version;
        var executable = Environment.ProcessPath;
        if (string.IsNullOrWhiteSpace(executable) || string.IsNullOrWhiteSpace(expectedVersion)) return 0;
        var configPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ChatDuck", "agent.json");
        if (!File.Exists(configPath)) return 0;
        var config = JsonSerializer.Deserialize<AgentConfig>(await File.ReadAllTextAsync(configPath), JsonOptions);
        var token = config?.Token;
        if (token is null || !Regex.IsMatch(token, "^[A-Fa-f0-9]{64}$")) return 0;
        JsonDocument status;
        try { status = await AgentProtocol.RequestStatusAsync(token, 48731); }
        catch { return 0; }
        int ownedPid;
        using (status)
        {
            var root = status.RootElement;
            if (!root.TryGetProperty("agentPid", out var pidValue) || !pidValue.TryGetInt32(out var pid) ||
                !InstallerAgentVerifier.IsExpectedAgent(root, expectedVersion, expectedFileVersion, executable, pid, Process.GetCurrentProcess().SessionId)) return 0;
            ownedPid = pid;
        }
        await AgentProtocol.RequestCommandAsync(token, "shutdown", 48731);
        var deadline = DateTime.UtcNow.AddSeconds(10);
        while (DateTime.UtcNow < deadline)
        {
            try
            {
                using var current = await AgentProtocol.RequestStatusAsync(token, 48731);
                if (!current.RootElement.TryGetProperty("agentPid", out var pidValue) || !pidValue.TryGetInt32(out var pid) || pid != ownedPid)
                    return 0;
            }
            catch { return 0; }
            await Task.Delay(100);
        }
        return 34;
    }

    private static async Task<bool> WaitForSiblingAgentExitAsync(Mutex mutex, TimeSpan timeout)
    {
        var deadline = DateTime.UtcNow + timeout;
        do
        {
            try
            {
                if (mutex.WaitOne(0))
                {
                    mutex.ReleaseMutex();
                    RecordShutdownWait("mutex de esta instalación liberado");
                    return true;
                }
            }
            catch (AbandonedMutexException)
            {
                mutex.ReleaseMutex();
                RecordShutdownWait("mutex abandonado recuperado; el proceso terminó");
                return true;
            }
            await Task.Delay(100);
        } while (DateTime.UtcNow < deadline);
        RecordShutdownWait("timeout esperando el mutex de esta instalación");
        return false;
    }

    private static void RecordShutdownWait(string message)
    {
        try { File.AppendAllText(LogPath, $"{DateTimeOffset.Now:O} cierre MSI: {message}{Environment.NewLine}", Encoding.UTF8); }
        catch { }
    }

    internal static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        WriteIndented = false
    };
}

internal static class InstallerAgentVerifier
{
    public static bool IsExpectedAgent(JsonElement status, string? expectedVersion, string? expectedFileVersion, string executable, int expectedPid, int expectedSessionId)
    {
        if (!status.TryGetProperty("agentVersion", out var versionValue) || versionValue.ValueKind != JsonValueKind.String ||
            !status.TryGetProperty("agentFileVersion", out var fileVersionValue) || fileVersionValue.ValueKind != JsonValueKind.String ||
            !status.TryGetProperty("agentExecutablePath", out var pathValue) || pathValue.ValueKind != JsonValueKind.String ||
            !status.TryGetProperty("agentPid", out var pidValue) || !pidValue.TryGetInt32(out var pid) ||
            !status.TryGetProperty("agentSessionId", out var sessionValue) || !sessionValue.TryGetInt32(out var sessionId) ||
            !status.TryGetProperty("agentIsElevated", out var elevatedValue) || elevatedValue.ValueKind is not (JsonValueKind.True or JsonValueKind.False)) return false;
        var version = versionValue.GetString();
        var fileVersion = fileVersionValue.GetString();
        var activePath = pathValue.GetString();
        if (string.IsNullOrWhiteSpace(version) || string.IsNullOrWhiteSpace(fileVersion) || string.IsNullOrWhiteSpace(activePath)) return false;
        try
        {
            return (expectedVersion is null || version == expectedVersion) &&
                (expectedFileVersion is null || fileVersion == expectedFileVersion) &&
                pid == expectedPid && sessionId == expectedSessionId && !elevatedValue.GetBoolean() &&
                string.Equals(Path.GetFullPath(activePath), Path.GetFullPath(executable), StringComparison.OrdinalIgnoreCase);
        }
        catch (Exception error) when (error is ArgumentException or NotSupportedException or PathTooLongException) { return false; }
    }
}

internal static class AgentDataMigration
{
    public static void MigrateLegacyDataIfNeeded(string installDirectory, string dataDirectory)
    {
        Directory.CreateDirectory(dataDirectory);
        foreach (var name in new[] { "agent.json", "agent.log", "ChatGPT-Audio-Ducking.user.js", "pending.json" })
        {
            var source = Path.Combine(installDirectory, name);
            var destination = Path.Combine(dataDirectory, name);
            if (!File.Exists(source) || File.Exists(destination)) continue;
            var temporary = destination + ".migration.tmp";
            try
            {
                File.Copy(source, temporary, overwrite: false);
                File.Move(temporary, destination, overwrite: false);
            }
            catch (IOException) when (File.Exists(destination)) { }
            finally { try { if (File.Exists(temporary)) File.Delete(temporary); } catch { } }
        }
    }
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
    private readonly bool _experimental;
    private readonly int _port;
    private readonly RequestNonceGuard _nonceGuard = new();
    private readonly ConcurrentDictionary<string, (byte[] Contents, long ExpiresAt)> _downloadTickets = new(StringComparer.Ordinal);
    private string? _pairingCode;
    private DateTimeOffset _pairingExpires;
    private readonly object _pairLock = new();

    public LocalControlServer(int port, string token, string settingsPath, string scriptTemplatePath, string installedScriptPath,
        string configPath, AgentConfig config, MediaCoordinator media, Action<string> log, CancellationTokenSource stop, bool experimental)
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
        _experimental = experimental;
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
                "restore" => await _media.RestoreAsync(ReadSessionId(root), ReadReason(root, "dictation-ended")),
                "restore-all" => await _media.RestoreAllAsync(ReadReason(root, "manual-restore-all")),
                "shutdown" => await ShutdownAsync(),
                "set-autostart" => SetAutostart(root),
                "pair" => OpenPairing(),
                _ => new { ok = false, error = "Comando no reconocido." }
            };
            shutdown = command == "shutdown" && result is AgentShutdownResult { SafeToStop: true };
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
        var beginStartedAt = Stopwatch.GetTimestamp();
        var sessionId = ReadSessionId(root);
        var settings = root.TryGetProperty("settings", out var value) ? AgentSettings.From(value) : new AgentSettings();
        _log($"command begin session={sessionId} requestProcessingMs={Stopwatch.GetElapsedTime(requestReceivedAt, beginStartedAt).TotalMilliseconds:F1} mute={settings.DiscordMuteDuringDictation} deafen={settings.DiscordDeafenDuringDictation}");
        var result = await _media.BeginAsync(sessionId, settings, requestReceivedAt);
        var ok = result.GetType().GetProperty("Ok")?.GetValue(result);
        _log($"command begin completed session={sessionId} ok={ok?.ToString() ?? "unknown"} bridgeElapsedMs={Stopwatch.GetElapsedTime(beginStartedAt).TotalMilliseconds:F1} requestElapsedMs={Stopwatch.GetElapsedTime(requestReceivedAt).TotalMilliseconds:F1}");
        return result;
    }

    private static string ReadReason(JsonElement root, string fallback)
    {
        if (!root.TryGetProperty("reason", out var value) || value.ValueKind != JsonValueKind.String) return fallback;
        var reason = value.GetString();
        return !string.IsNullOrWhiteSpace(reason) && reason.Length <= 80 && reason.All(c => char.IsAsciiLetterOrDigit(c) || c == '-') ? reason : fallback;
    }

    private Task<AgentShutdownResult> ShutdownAsync() => _media.PrepareShutdownAsync();

    private object GetStatus()
    {
        var status = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        using var doc = JsonDocument.Parse(JsonSerializer.Serialize(_media.GetStatus(), Program.JsonOptions));
        foreach (var item in doc.RootElement.EnumerateObject()) status[item.Name] = item.Value.Clone();
        status["autostartEnabled"] = !_experimental && AgentStartup.IsEnabled();
        status["agentVersion"] = typeof(Program).Assembly.GetCustomAttribute<System.Reflection.AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? "unknown";
        status["agentSourceRevision"] = Program.GetSourceRevision();
        status["agentPid"] = Environment.ProcessId;
        status["agentSessionId"] = Process.GetCurrentProcess().SessionId;
        status["agentExecutablePath"] = Environment.ProcessPath;
        status["agentFileVersion"] = typeof(Program).Assembly.GetCustomAttribute<System.Reflection.AssemblyFileVersionAttribute>()?.Version ?? "unknown";
        using (var identity = System.Security.Principal.WindowsIdentity.GetCurrent())
            status["agentIsElevated"] = new System.Security.Principal.WindowsPrincipal(identity).IsInRole(System.Security.Principal.WindowsBuiltInRole.Administrator);
        status["capabilities"] = new[] { "discordMute", "discordDeafen" };
        return status;
    }

    private object SetAutostart(JsonElement root)
    {
        if (_experimental) return new { ok = false, error = "El inicio automático no se modifica desde el agente experimental." };
        if (!root.TryGetProperty("enabled", out var value) || value.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
            throw new JsonException("El valor de inicio no es válido.");
        AgentStartup.SetEnabled(value.GetBoolean());
        return new { ok = true, autostartEnabled = AgentStartup.IsEnabled() };
    }

    private object OpenPairing()
    {
        var code = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        lock (_pairLock) { _pairingCode = code; _pairingExpires = DateTimeOffset.UtcNow.AddMinutes(5); }
        var pairingUrl = $"http://127.0.0.1:{_port}/pair#{code}";
        if (_experimental)
        {
            File.WriteAllText(Path.Combine(Path.GetDirectoryName(_configPath)!, "pairing-url.txt"), pairingUrl, new UTF8Encoding(false));
            _log("emparejamiento experimental listo; URL local de 5 minutos en pairing-url.txt");
        }
        else Process.Start(new ProcessStartInfo(pairingUrl) { UseShellExecute = true });
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
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        if (nonce is null || !Regex.IsMatch(nonce, "^[A-Za-z0-9_-]{22}$") ||
            !RequestNonceGuard.IsTimestampFresh(timestamp, now) || string.IsNullOrEmpty(suppliedSignature)) return false;
        var signedData = $"req\nPOST\n/v1/command\n{timestamp}\n{nonce}\n{body}";
        if (!AgentProtocol.Verify(_token, signedData, suppliedSignature)) return false;
        return _nonceGuard.TryUse(nonce, now);
    }

    internal static bool AllowedOrigin(string? origin)
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

    private static readonly byte[] PairPage = CreatePairPage();

    private static byte[] CreatePairPage()
    {
        var version = typeof(Program).Assembly.GetCustomAttribute<System.Reflection.AssemblyInformationalVersionAttribute>()?.InformationalVersion
            ?? typeof(Program).Assembly.GetName().Version?.ToString() ?? "";
        var html = $"<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>ChatDuck pairing</title><main><h1>ChatDuck</h1><p>Windows Agent {WebUtility.HtmlEncode(version)}</p><p data-pair-status>Connecting this browser to ChatDuck Agent…</p><p>Keep this tab open while pairing. Tampermonkey must be installed in this browser. If this remains on Connecting, install the ChatDuck userscript in this browser and start ChatDuck Agent again from the Start menu.</p></main>";
        return Encoding.UTF8.GetBytes(html);
    }

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

internal sealed class RequestNonceGuard
{
    private readonly ConcurrentDictionary<string, long> _used = new(StringComparer.Ordinal);

    internal static bool IsTimestampFresh(string? value, long now)
    {
        return long.TryParse(value, System.Globalization.NumberStyles.None, System.Globalization.CultureInfo.InvariantCulture, out var seconds)
            && seconds >= now - 30 && seconds <= now + 30;
    }

    internal bool TryUse(string nonce, long now)
    {
        if (_used.Count > 1024)
            foreach (var item in _used) if (item.Value < now - 60) _used.TryRemove(item.Key, out _);
        return _used.TryAdd(nonce, now);
    }
}

internal sealed record AgentShutdownResult(bool SafeToStop, int Restored, bool RecoveryPending);

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

    public static void MigrateLegacyPathIfOwned()
    {
        var exe = Environment.ProcessPath;
        if (string.IsNullOrWhiteSpace(exe)) return;
        var legacy = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "ChatGPTAudioDuckingTM", "ChatGPTAudioDuckingAgent.exe");
        using var key = Registry.CurrentUser.OpenSubKey(RunKey, writable: true);
        var value = key?.GetValue(ValueName) as string;
        if (key is null || string.IsNullOrWhiteSpace(value) || !File.Exists(exe)) return;
        var configured = value.Trim().Trim('"');
        if (string.Equals(Path.GetFullPath(configured), Path.GetFullPath(legacy), StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(Path.GetFullPath(exe), Path.GetFullPath(legacy), StringComparison.OrdinalIgnoreCase))
            key.SetValue(ValueName, $"\"{exe}\"", RegistryValueKind.String);
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
    public bool DiscordMuteDuringDictation { get; set; }
    public bool DiscordDeafenDuringDictation { get; set; }
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
            DiscordMuteDuringDictation = DiscordMuteDuringDictation,
            DiscordDeafenDuringDictation = DiscordDeafenDuringDictation,
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
