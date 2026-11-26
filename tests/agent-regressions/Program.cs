using System.IO;

var tests = new (string Name, Func<Task> Run)[]
{
    ("localhost bridge rejects arbitrary web origins", () =>
    {
        Check(LocalControlServer.AllowedOrigin(null));
        Check(LocalControlServer.AllowedOrigin("https://chatgpt.com"));
        Check(LocalControlServer.AllowedOrigin("moz-extension://aabbccddeeff00112233445566778899"));
        Check(!LocalControlServer.AllowedOrigin("https://attacker.example"));
        Check(!LocalControlServer.AllowedOrigin("http://127.0.0.1:48766"));
        Check(!LocalControlServer.AllowedOrigin("moz-extension://attacker.example"));
        return Task.CompletedTask;
    }),
    ("bridge authentication rejects stale timestamps and replayed nonces", () =>
    {
        const long now = 1_800_000_000;
        Check(RequestNonceGuard.IsTimestampFresh(now.ToString(), now));
        Check(RequestNonceGuard.IsTimestampFresh((now - 30).ToString(), now));
        Check(RequestNonceGuard.IsTimestampFresh((now + 30).ToString(), now));
        Check(!RequestNonceGuard.IsTimestampFresh((now - 31).ToString(), now));
        Check(!RequestNonceGuard.IsTimestampFresh((now + 31).ToString(), now));
        Check(!RequestNonceGuard.IsTimestampFresh("1e9", now));
        var guard = new RequestNonceGuard();
        Check(guard.TryUse("nonce-1", now));
        Check(!guard.TryUse("nonce-1", now));
        Check(guard.TryUse("nonce-2", now));
        return Task.CompletedTask;
    }),
    ("installer health verification requires exact process, version, path, session, and non-elevated identity", () =>
    {
        using var valid = System.Text.Json.JsonDocument.Parse("""{"agentVersion":"2.8.9","agentFileVersion":"2.8.9.0","agentExecutablePath":"C:\\ChatDuck\\Agent.exe","agentPid":42,"agentSessionId":7,"agentIsElevated":false}""");
        Check(InstallerAgentVerifier.IsExpectedAgent(valid.RootElement, "2.8.9", "2.8.9.0", "C:\\ChatDuck\\Agent.exe", 42, 7));
        Check(!InstallerAgentVerifier.IsExpectedAgent(valid.RootElement, "2.8.9", "2.8.9.0", "C:\\ChatDuck\\Agent.exe", 43, 7));
        Check(!InstallerAgentVerifier.IsExpectedAgent(valid.RootElement, "2.8.7", "2.8.9.0", "C:\\ChatDuck\\Agent.exe", 42, 7));
        Check(!InstallerAgentVerifier.IsExpectedAgent(valid.RootElement, "2.8.9", "2.8.9.0", "C:\\Other\\Agent.exe", 42, 7));
        Check(!InstallerAgentVerifier.IsExpectedAgent(valid.RootElement, "2.8.9", "2.8.9.0", "C:\\ChatDuck\\Agent.exe", 42, 8));
        using var elevated = System.Text.Json.JsonDocument.Parse("""{"agentVersion":"2.8.9","agentFileVersion":"2.8.9.0","agentExecutablePath":"C:\\ChatDuck\\Agent.exe","agentPid":42,"agentSessionId":7,"agentIsElevated":true}""");
        Check(!InstallerAgentVerifier.IsExpectedAgent(elevated.RootElement, "2.8.9", "2.8.9.0", "C:\\ChatDuck\\Agent.exe", 42, 7));
        return Task.CompletedTask;
    }),
    ("first per-user data migration preserves pairing and source while keeping newer destination data", () =>
    {
        var root = Path.Combine(Path.GetTempPath(), "ChatDuck-migration-" + Guid.NewGuid().ToString("N"));
        var legacy = Path.Combine(root, "legacy");
        var current = Path.Combine(root, "current");
        Directory.CreateDirectory(legacy);
        try
        {
            const string pairedConfig = "{\"token\":\"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef\"}";
            File.WriteAllText(Path.Combine(legacy, "agent.json"), pairedConfig);
            File.WriteAllText(Path.Combine(legacy, "pending.json"), "recovery");
            File.WriteAllText(Path.Combine(legacy, "ChatGPT-Audio-Ducking.user.js"), "paired userscript");
            AgentDataMigration.MigrateLegacyDataIfNeeded(legacy, current);
            Check(File.ReadAllText(Path.Combine(current, "agent.json")) == pairedConfig);
            Check(File.ReadAllText(Path.Combine(current, "pending.json")) == "recovery");
            Check(File.ReadAllText(Path.Combine(current, "ChatGPT-Audio-Ducking.user.js")) == "paired userscript");
            Check(File.Exists(Path.Combine(legacy, "agent.json")));
            File.WriteAllText(Path.Combine(current, "agent.json"), "newer preferences");
            AgentDataMigration.MigrateLegacyDataIfNeeded(legacy, current);
            Check(File.ReadAllText(Path.Combine(current, "agent.json")) == "newer preferences");
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, recursive: true); }
        return Task.CompletedTask;
    })
};

foreach (var (name, run) in tests)
{
    await run();
    Console.WriteLine($"PASS {name}");
}
Console.WriteLine($"{tests.Length} agent regression checks passed.");

static void Check(bool condition)
{
    if (!condition) throw new InvalidOperationException("Regression check failed.");
}
