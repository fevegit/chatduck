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
        using var valid = System.Text.Json.JsonDocument.Parse("""{"agentVersion":"2.8.8-rc.1","agentFileVersion":"2.8.8.0","agentExecutablePath":"C:\\ChatDuck\\Agent.exe","agentPid":42,"agentSessionId":7,"agentIsElevated":false}""");
        Check(InstallerAgentVerifier.IsExpectedAgent(valid.RootElement, "2.8.8-rc.1", "2.8.8.0", "C:\\ChatDuck\\Agent.exe", 42, 7));
        Check(!InstallerAgentVerifier.IsExpectedAgent(valid.RootElement, "2.8.8-rc.1", "2.8.8.0", "C:\\ChatDuck\\Agent.exe", 43, 7));
        Check(!InstallerAgentVerifier.IsExpectedAgent(valid.RootElement, "2.8.7", "2.8.8.0", "C:\\ChatDuck\\Agent.exe", 42, 7));
        Check(!InstallerAgentVerifier.IsExpectedAgent(valid.RootElement, "2.8.8-rc.1", "2.8.8.0", "C:\\Other\\Agent.exe", 42, 7));
        Check(!InstallerAgentVerifier.IsExpectedAgent(valid.RootElement, "2.8.8-rc.1", "2.8.8.0", "C:\\ChatDuck\\Agent.exe", 42, 8));
        using var elevated = System.Text.Json.JsonDocument.Parse("""{"agentVersion":"2.8.8-rc.1","agentFileVersion":"2.8.8.0","agentExecutablePath":"C:\\ChatDuck\\Agent.exe","agentPid":42,"agentSessionId":7,"agentIsElevated":true}""");
        Check(!InstallerAgentVerifier.IsExpectedAgent(elevated.RootElement, "2.8.8-rc.1", "2.8.8.0", "C:\\ChatDuck\\Agent.exe", 42, 7));
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
    }),
    ("Discord UIA activation benchmark reduces simulated full-tree scans", async () =>
    {
        var legacy = await BenchmarkDiscordActivationAsync(false, false);
        var optimized = await BenchmarkDiscordActivationAsync(true, false);
        var legacyDeafen = await BenchmarkDiscordActivationAsync(false, true);
        var optimizedDeafen = await BenchmarkDiscordActivationAsync(true, true);
        Check(legacy.Scans == 5 && optimized.Scans == 2);
        Check(legacyDeafen.Scans == 5 && optimizedDeafen.Scans == 2);
        Check(optimized.MedianMs < legacy.MedianMs && optimizedDeafen.MedianMs < legacyDeafen.MedianMs);
        Console.WriteLine($"BENCH simulated-UIA mute legacy={legacy.MedianMs:F1}ms/{legacy.Scans} scans optimized={optimized.MedianMs:F1}ms/{optimized.Scans} scans; deafen legacy={legacyDeafen.MedianMs:F1}ms/{legacyDeafen.Scans} scans optimized={optimizedDeafen.MedianMs:F1}ms/{optimizedDeafen.Scans} scans; fixture discovery delay=8ms/scan, not live Discord.");
    }),
    ("Discord mute starts off, skips existing mute, and restores only its own change", async () =>
    {
        var temp = NewTemp();
        var access = new FakeDiscordAccess();
        var controller = new DiscordVoiceController(access, temp, _ => { });
        Check((await controller.BeginAsync("session-0001", false, false)).Message == "disabled");
        Check(access.SetCount == 0);
        access.Muted = true;
        Check((await controller.BeginAsync("session-0001", true, false)).Message == "already-in-requested-state");
        Check(access.SetCount == 0);
        access.Muted = false;
        Check((await controller.BeginAsync("session-0002", true, false)).Ok);
        Check(access.Muted && access.SetCount == 1);
        Check(await controller.RestoreActiveAsync());
        Check(!access.Muted && access.SetCount == 2);
    }),
    ("Discord manual unmute survives a duplicate begin but a new dictation can mute again", async () =>
    {
        var access = new FakeDiscordAccess();
        var controller = new DiscordVoiceController(access, NewTemp(), _ => { });
        Check((await controller.BeginAsync("session-0003", true, false)).Ok);
        access.Muted = false;
        Check(await controller.RestoreActiveAsync());
        Check(!access.Muted);
        Check((await controller.BeginAsync("session-0003", true, false)).Message == "manual-override");
        Check(!access.Muted && access.SetCount == 1);
        Check((await controller.BeginAsync("session-0004", true, false)).Ok);
        Check(access.Muted && access.SetCount == 2);
    }),
    ("Discord mute event preserves a manual unmute even if the user remutes before restore", async () =>
    {
        var access = new FakeDiscordAccess();
        var controller = new DiscordVoiceController(access, NewTemp(), _ => { });
        Check((await controller.BeginAsync("session-0009", true, false)).Ok);
        access.ManualSet(false);
        access.ManualSet(true);
        Check(await controller.RestoreActiveAsync());
        Check(access.Muted && access.SetCount == 1);
        Check((await controller.BeginAsync("session-0009", true, false)).Message == "manual-override");
        Check(access.Muted && access.SetCount == 1);
    }),
    ("Discord second begin cannot remute after a manual unmute and remute", async () =>
    {
        var access = new FakeDiscordAccess();
        var controller = new DiscordVoiceController(access, NewTemp(), _ => { });
        Check((await controller.BeginAsync("session-0017", true, false)).Ok);
        access.ManualSet(false);
        access.ManualSet(true);
        Check((await controller.BeginAsync("session-0018", true, false)).Message == "manual-override");
        Check(access.Muted && access.SetCount == 1);
    }),
    ("Discord manual override survives restart even if the user remuted", async () =>
    {
        var access = new FakeDiscordAccess();
        var statePath = NewTemp();
        Check((await new DiscordVoiceController(access, statePath, _ => { }).BeginAsync("session-0012", true, false)).Ok);
        access.ManualSet(false);
        access.ManualSet(true);
        var restarted = new DiscordVoiceController(access, statePath, _ => { });
        Check(await restarted.RestorePendingAtStartupAsync());
        Check(access.Muted && access.SetCount == 1);
        Check((await restarted.BeginAsync("session-0012", true, false)).Message == "manual-override");
        access.ManualSet(false);
        Check((await restarted.BeginAsync("session-0013", true, false)).Ok);
        Check(access.Muted && access.SetCount == 2);
    }),
    ("Discord begin is serialized and idempotent", async () =>
    {
        var access = new FakeDiscordAccess();
        var controller = new DiscordVoiceController(access, NewTemp(), _ => { });
        var results = await Task.WhenAll(Enumerable.Range(0, 16).Select(_ => controller.BeginAsync("session-0005", true, false)));
        Check(results.All(result => result.Ok));
        Check(access.SetCount == 1);
    }),
    ("Discord pending state restores after agent restart only for same call", async () =>
    {
        var statePath = NewTemp();
        var access = new FakeDiscordAccess();
        Check((await new DiscordVoiceController(access, statePath, _ => { }).BeginAsync("session-0006", true, false)).Ok);
        var restarted = new DiscordVoiceController(access, statePath, _ => { });
        Check(await restarted.RestorePendingAtStartupAsync());
        Check(!access.Muted);
        var otherAccess = new FakeDiscordAccess { Muted = false };
        Check((await new DiscordVoiceController(otherAccess, statePath, _ => { }).BeginAsync("session-0007", true, false)).Ok);
        otherAccess.CallIdentity = "other-call";
        var newCall = new DiscordVoiceController(otherAccess, statePath, _ => { });
        Check(await newCall.RestorePendingAtStartupAsync());
        Check(otherAccess.Muted && otherAccess.SetCount == 1);
    }),
    ("Discord apply rejects a mute state changed between read and write", async () =>
    {
        var access = new FakeDiscordAccess { ChangeBeforeSet = true };
        var result = await new DiscordVoiceController(access, NewTemp(), _ => { }).BeginAsync("session-0008", true, false);
        Check(!result.Ok);
        Check(access.Muted && access.SetCount == 0);
    }),
    ("Discord fails closed when UI Automation cannot observe user mute changes", async () =>
    {
        var access = new FakeDiscordAccess { WatchUnavailable = true };
        var result = await new DiscordVoiceController(access, NewTemp(), _ => { }).BeginAsync("session-0011", true, false);
        Check(!result.Ok && !access.Muted && access.SetCount == 0);
    }),
    ("Discord deafen also mutes once and restores both original states", async () =>
    {
        var access = new FakeDiscordAccess();
        var controller = new DiscordVoiceController(access, NewTemp(), _ => { });
        Check((await controller.BeginAsync("session-0013", true, true)).Ok);
        Check(access.Deafened && access.Muted);
        Check(access.DeafenSetCount == 1 && access.SetCount == 0);
        Check(await controller.RestoreActiveAsync());
        Check(!access.Deafened && !access.Muted);
        Check(access.DeafenSetCount == 2 && access.SetCount == 0);
    }),
    ("Discord manual undeafen survives restoration and consecutive dictation", async () =>
    {
        var access = new FakeDiscordAccess();
        var controller = new DiscordVoiceController(access, NewTemp(), _ => { });
        Check((await controller.BeginAsync("session-0014", false, true)).Ok);
        access.ManualSetDeafened(false);
        Check(await controller.RestoreActiveAsync());
        Check(!access.Deafened && !access.Muted);
        Check((await controller.BeginAsync("session-0014", false, true)).Message == "manual-override");
        Check(!access.Deafened && !access.Muted);
        Check((await controller.BeginAsync("session-0015", false, true)).Ok);
        Check(access.Deafened && access.Muted);
    }),
    ("Discord deafen snapshot restores an originally muted user", async () =>
    {
        var access = new FakeDiscordAccess { Muted = true };
        var controller = new DiscordVoiceController(access, NewTemp(), _ => { });
        Check((await controller.BeginAsync("session-0016", false, true)).Ok);
        Check(access.Deafened && access.Muted);
        Check(await controller.RestoreActiveAsync());
        Check(!access.Deafened && access.Muted);
    }),
    ("Discord deafen is idempotent under concurrent begin requests", async () =>
    {
        var access = new FakeDiscordAccess();
        var controller = new DiscordVoiceController(access, NewTemp(), _ => { });
        var results = await Task.WhenAll(Enumerable.Range(0, 16).Select(i => controller.BeginAsync($"session-00{100 + i}", true, true)));
        Check(results.All(result => result.Ok));
        Check(access.DeafenSetCount == 1 && access.SetCount == 0 && access.Muted && access.Deafened);
    }),
    ("Discord uncertain UIA action is not immediately toggled back and restores once at end", async () =>
    {
        var access = new FakeDiscordAccess { ThrowAfterDeafen = true };
        var controller = new DiscordVoiceController(access, NewTemp(), _ => { });
        var begin = await controller.BeginAsync("session-0019", false, true);
        Check(!begin.Ok && begin.Message == "apply-outcome-uncertain");
        Check(access.Deafened && access.Muted && access.DeafenSetCount == 1);
        Check(await controller.RestoreActiveAsync());
        Check(!access.Deafened && !access.Muted && access.DeafenSetCount == 2);
        Check(await controller.RestoreActiveAsync());
        Check(access.DeafenSetCount == 2);
    }),
    ("Discord deafen and mute options do not double-toggle an unconfirmed coupled state", async () =>
    {
        var access = new FakeDiscordAccess { DeafenDoesNotMute = true };
        var controller = new DiscordVoiceController(access, NewTemp(), _ => { });
        var begin = await controller.BeginAsync("session-0020", true, true);
        Check(!begin.Ok && begin.Message == "apply-outcome-uncertain");
        Check(access.Deafened && !access.Muted && access.DeafenSetCount == 1 && access.SetCount == 0);
        Check(await controller.RestoreActiveAsync());
        Check(!access.Deafened && !access.Muted && access.DeafenSetCount == 2 && access.SetCount == 0);
    }),
    ("Discord manual deafen override is kept after an uncertain UIA dispatch", async () =>
    {
        var access = new FakeDiscordAccess { ThrowAfterDeafen = true };
        var controller = new DiscordVoiceController(access, NewTemp(), _ => { });
        Check((await controller.BeginAsync("session-0021", false, true)).Message == "apply-outcome-uncertain");
        access.ManualSetDeafened(false);
        Check(await controller.RestoreActiveAsync());
        Check(!access.Deafened && !access.Muted && access.DeafenSetCount == 1);
    }),
    ("Discord uncertain action is recovered after an agent restart", async () =>
    {
        var access = new FakeDiscordAccess { ThrowAfterDeafen = true };
        var path = NewTemp();
        Check((await new DiscordVoiceController(access, path, _ => { }).BeginAsync("session-0022", false, true)).Message == "apply-outcome-uncertain");
        var restarted = new DiscordVoiceController(access, path, _ => { });
        Check(await restarted.RestorePendingAtStartupAsync());
        Check(!access.Deafened && !access.Muted && access.DeafenSetCount == 2);
    }),
    ("Discord concurrent duplicate restores toggle each field once", async () =>
    {
        var access = new FakeDiscordAccess();
        var controller = new DiscordVoiceController(access, NewTemp(), _ => { });
        Check((await controller.BeginAsync("session-0023", true, true)).Ok);
        var restores = await Task.WhenAll(Enumerable.Range(0, 12).Select(_ => controller.RestoreActiveAsync()));
        Check(restores.All(value => value));
        Check(!access.Muted && !access.Deafened && access.DeafenSetCount == 2 && access.SetCount == 0);
    }),
    ("Discord uncertain restore is observed without repeating its toggle", async () =>
    {
        var access = new FakeDiscordAccess();
        var controller = new DiscordVoiceController(access, NewTemp(), _ => { });
        Check((await controller.BeginAsync("session-0024", false, true)).Ok);
        access.ThrowAfterDeafenOff = true;
        Check(!await controller.RestoreActiveAsync());
        Check(!access.Deafened && access.DeafenSetCount == 2);
        Check(await controller.RestoreActiveAsync());
        Check(access.DeafenSetCount == 2);
    })
};

foreach (var (name, run) in tests)
{
    await run();
    Console.WriteLine($"PASS {name}");
}
Console.WriteLine($"{tests.Length} agent regression checks passed.");

static async Task<(double MedianMs, int Scans)> BenchmarkDiscordActivationAsync(bool reuseControls, bool deafen)
{
    var timings = new List<double>();
    var totalScans = 0;
    for (var i = 0; i < 11; i++)
    {
        var path = NewTemp();
        var access = new BenchmarkDiscordAccess(reuseControls);
        var controller = new DiscordVoiceController(access, path, _ => { });
        var started = System.Diagnostics.Stopwatch.GetTimestamp();
        var result = await controller.BeginAsync($"benchmark-session-{i:D2}", !deafen, deafen);
        timings.Add(System.Diagnostics.Stopwatch.GetElapsedTime(started).TotalMilliseconds);
        totalScans += access.FullTreeScans;
        Check(result.Ok);
        File.Delete(path);
    }
    timings.Sort();
    return (timings[timings.Count / 2], totalScans / timings.Count);
}

static string NewTemp() => Path.Combine(Path.GetTempPath(), $"chatduck-discord-{Guid.NewGuid():N}.json");

static void Check(bool condition)
{
    if (!condition) throw new InvalidOperationException("Regression check failed.");
}

sealed class FakeDiscordAccess : IDiscordVoiceAccess
{
    private readonly List<Action<string, bool>> _watchers = [];
    public bool Muted { get; set; }
    public bool Deafened { get; set; }
    public bool ChangeBeforeSet { get; set; }
    public bool WatchUnavailable { get; set; }
    public bool ThrowAfterDeafen { get; set; }
    public bool DeafenDoesNotMute { get; set; }
    public bool ThrowAfterDeafenOff { get; set; }
    public int SetCount { get; private set; }
    public string CallIdentity { get; set; } = "test-call";
    public int DeafenSetCount { get; private set; }
    public DiscordVoiceState Read() => new(true, Muted, Deafened, "call-active", CallIdentity);
    public DiscordVoiceState SetMuted(bool muted, bool expectedCurrent, string expectedCallIdentity)
    {
        if (ChangeBeforeSet) { ChangeBeforeSet = false; Muted = true; }
        if (CallIdentity != expectedCallIdentity || Muted != expectedCurrent)
            throw new DiscordManualOverrideException();
        SetCount++;
        Muted = muted;
        foreach (var watcher in _watchers.ToArray()) watcher("mute", Muted);
        return Read();
    }
    public DiscordVoiceState SetDeafened(bool deafened, bool expectedCurrent, string expectedCallIdentity)
    {
        if (CallIdentity != expectedCallIdentity || Deafened != expectedCurrent)
            throw new DiscordManualOverrideException();
        DeafenSetCount++;
        Deafened = deafened;
        if (!DeafenDoesNotMute) Muted = deafened;
        foreach (var watcher in _watchers.ToArray())
        {
            watcher("deafen", Deafened);
            if (deafened) watcher("mute", Muted);
        }
        if (ThrowAfterDeafen)
        {
            ThrowAfterDeafen = false;
            throw new DiscordActionOutcomeUncertainException("deafen", deafened, Read(), "test-dispatch-then-failure");
        }
        if (!deafened && ThrowAfterDeafenOff)
        {
            ThrowAfterDeafenOff = false;
            throw new DiscordActionOutcomeUncertainException("deafen", false, Read(), "test-restore-dispatch-then-failure");
        }
        return Read();
    }
    public IDisposable WatchChanges(string expectedCallIdentity, Action<string, bool> onChanged)
    {
        if (WatchUnavailable) throw new InvalidOperationException("watch unavailable");
        _watchers.Add(onChanged);
        return new CallbackRegistration(() => _watchers.Remove(onChanged));
    }
    public void ManualSet(bool muted)
    {
        Muted = muted;
        foreach (var watcher in _watchers.ToArray()) watcher("mute", Muted);
    }
    public void ManualSetDeafened(bool deafened)
    {
        Deafened = deafened;
        if (!deafened) Muted = false;
        foreach (var watcher in _watchers.ToArray())
        {
            watcher("deafen", Deafened);
            watcher("mute", Muted);
        }
    }
}

sealed class BenchmarkDiscordAccess(bool reuseControls) : IDiscordVoiceAccess
{
    private readonly List<Action<string, bool>> _watchers = [];
    public int FullTreeScans { get; private set; }
    public bool Muted { get; private set; }
    public bool Deafened { get; private set; }
    public DiscordVoiceState Read() { Scan(); return State(); }
    public DiscordVoiceState SetMuted(bool muted, bool expectedCurrent, string expectedCallIdentity)
    {
        if (!reuseControls) Scan();
        if (expectedCallIdentity != "benchmark-call" || Muted != expectedCurrent) throw new DiscordManualOverrideException();
        Thread.Sleep(2);
        Muted = muted;
        foreach (var watcher in _watchers.ToArray()) watcher("mute", Muted);
        return Read();
    }
    public DiscordVoiceState SetDeafened(bool deafened, bool expectedCurrent, string expectedCallIdentity)
    {
        if (!reuseControls) Scan();
        if (expectedCallIdentity != "benchmark-call" || Deafened != expectedCurrent) throw new DiscordManualOverrideException();
        Thread.Sleep(2);
        Deafened = deafened;
        if (deafened) Muted = true;
        else Muted = false;
        foreach (var watcher in _watchers.ToArray())
        {
            watcher("deafen", Deafened);
            if (deafened) watcher("mute", Muted);
        }
        return Read();
    }
    public IDisposable WatchChanges(string expectedCallIdentity, Action<string, bool> onChanged)
    {
        if (!reuseControls) Scan();
        if (expectedCallIdentity != "benchmark-call") throw new InvalidOperationException("Call changed");
        _watchers.Add(onChanged);
        return new CallbackRegistration(() => _watchers.Remove(onChanged));
    }
    private DiscordVoiceState State() => new(true, Muted, Deafened, "call-active", "benchmark-call");
    private void Scan() { FullTreeScans++; Thread.Sleep(8); }
}

sealed class CallbackRegistration(Action dispose) : IDisposable
{
    public void Dispose() => dispose();
}
