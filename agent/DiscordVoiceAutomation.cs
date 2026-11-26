using System.Diagnostics;
using System.Globalization;
using System.Security.Cryptography;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Automation;

internal sealed record DiscordVoiceState(bool CallActive, bool Muted, bool Deafened, string Status, string? CallIdentity = null, bool WindowOffscreen = false, bool? WindowMinimized = null);

internal sealed record DiscordVoiceSnapshot(
    string SessionId,
    DateTimeOffset StartedAt,
    string CallIdentity,
    bool OriginalMuted,
    bool OriginalDeafened,
    bool? AppliedMuted,
    bool? AppliedDeafened,
    bool ManualOverride = false,
    bool ManualMuteOverride = false,
    bool ManualDeafenOverride = false,
    bool ActionUncertain = false,
    bool RestoreActionUncertain = false);
internal sealed record DiscordBeginResult(bool Ok, DiscordVoiceSnapshot? Snapshot, DiscordVoiceState? State, string Message);

internal interface IDiscordVoiceAccess
{
    DiscordVoiceState Read();
    DiscordVoiceState SetMuted(bool muted, bool expectedCurrent, string expectedCallIdentity);
    DiscordVoiceState SetDeafened(bool deafened, bool expectedCurrent, string expectedCallIdentity);
    IDisposable WatchChanges(string expectedCallIdentity, Action<string, bool> onChanged);
}

internal sealed class DiscordVoiceController(IDiscordVoiceAccess access, string statePath, Action<string> log)
{
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly object _stateSync = new();
    private DiscordVoiceSnapshot? _active;
    private string? _manualOverrideIdentity;
    private string? _manualOverrideSessionId;
    private long _lastObserveTicks;
    private long _lastUncertainRestoreReadTicks;
    private IDisposable? _watcher;
    private int _manualMuteOverride;
    private int _manualDeafenOverride;
    private int _actionInProgress;

    public DiscordVoiceState Read() => access.Read();

    public async Task<DiscordBeginResult> BeginAsync(string sessionId, bool muteEnabled, bool deafenEnabled)
    {
        if (!muteEnabled && !deafenEnabled) return new(true, null, null, "disabled");
        var operationStarted = Stopwatch.GetTimestamp();
        await _gate.WaitAsync();
        try
        {
            var readStarted = Stopwatch.GetTimestamp();
            var before = access.Read();
            var readMs = Stopwatch.GetElapsedTime(readStarted).TotalMilliseconds;
            log($"Discord begin session={sessionId} state={StateText(before)} muteOption={muteEnabled} deafenOption={deafenEnabled}");
            if (!before.CallActive || string.IsNullOrEmpty(before.CallIdentity)) { if (_active is not null) ClearState(); return new(false, null, before, "no-active-call"); }
            if (_manualOverrideIdentity is not null && _manualOverrideIdentity != before.CallIdentity)
            {
                _manualOverrideIdentity = null;
                _manualOverrideSessionId = null;
                DeleteState();
            }
            if (_manualOverrideIdentity == before.CallIdentity && _manualOverrideSessionId == sessionId)
                return new(true, null, before, "manual-override");
            if (_manualOverrideIdentity == before.CallIdentity)
            {
                _manualOverrideIdentity = null;
                _manualOverrideSessionId = null;
                DeleteState();
            }
            if (_active is not null)
            {
                if (_active.SessionId == sessionId) return new(true, _active, before, "already-active");
                if (_active.CallIdentity == before.CallIdentity && (Volatile.Read(ref _manualMuteOverride) != 0 || Volatile.Read(ref _manualDeafenOverride) != 0 || StateChangedByUser(_active, before)))
                {
                    PreserveManualOverride(_active);
                    return new(true, null, before, "manual-override");
                }
                if (_active.CallIdentity == before.CallIdentity) return new(true, _active, before, "already-active");
                _active = null;
                DeleteState();
            }
            var targetMuted = muteEnabled || deafenEnabled;
            var targetDeafened = deafenEnabled;
            var changeMuted = targetMuted && !before.Muted;
            var changeDeafened = targetDeafened && !before.Deafened;
            if (!changeMuted && !changeDeafened) return new(true, null, before, "already-in-requested-state");
            var snapshot = new DiscordVoiceSnapshot(sessionId, DateTimeOffset.UtcNow, before.CallIdentity,
                before.Muted, before.Deafened, targetMuted && (changeMuted || changeDeafened) ? true : null, changeDeafened ? true : null);
            _active = snapshot;
            Interlocked.Exchange(ref _manualMuteOverride, 0);
            Interlocked.Exchange(ref _manualDeafenOverride, 0);
            var checkpointStarted = Stopwatch.GetTimestamp();
            SaveState(snapshot);
            var checkpointMs = Stopwatch.GetElapsedTime(checkpointStarted).TotalMilliseconds;
            var watcherStarted = Stopwatch.GetTimestamp();
            _watcher = access.WatchChanges(before.CallIdentity, (field, value) => OnChanged(snapshot, field, value));
            var watcherMs = Stopwatch.GetElapsedTime(watcherStarted).TotalMilliseconds;
            var after = before;
            var actionMs = 0d;
            if (changeDeafened)
            {
                log($"Discord action session={sessionId} field=deafen target=true before={StateText(after)}");
                var actionStarted = Stopwatch.GetTimestamp();
                after = RunApplyingAction(() => access.SetDeafened(true, after.Deafened, before.CallIdentity));
                actionMs += Stopwatch.GetElapsedTime(actionStarted).TotalMilliseconds;
                log($"Discord action confirmed session={sessionId} field=deafen after={StateText(after)}");
            }
            if (changeMuted && !after.Muted && !deafenEnabled)
            {
                log($"Discord action session={sessionId} field=mute target=true before={StateText(after)}");
                var actionStarted = Stopwatch.GetTimestamp();
                after = RunApplyingAction(() => access.SetMuted(true, after.Muted, before.CallIdentity));
                actionMs += Stopwatch.GetElapsedTime(actionStarted).TotalMilliseconds;
                log($"Discord action confirmed session={sessionId} field=mute after={StateText(after)}");
            }
            if (!after.CallActive || after.CallIdentity != before.CallIdentity)
                throw new DiscordActionOutcomeUncertainException(changeDeafened ? "deafen" : "mute", true, after, "call-identity-changed-after-action");
            if (!after.Muted)
                throw new DiscordActionOutcomeUncertainException("mute", true, after, "discord-deafen-did-not-confirm-microphone-mute");
            if (deafenEnabled && !after.Deafened)
                throw new DiscordActionOutcomeUncertainException("deafen", true, after, "target-not-observed");
            if (Interlocked.Exchange(ref _manualMuteOverride, 0) != 0 || Interlocked.Exchange(ref _manualDeafenOverride, 0) != 0) throw new DiscordManualOverrideException();
            var refreshStarted = Stopwatch.GetTimestamp();
            RefreshWatcher(snapshot);
            var refreshMs = Stopwatch.GetElapsedTime(refreshStarted).TotalMilliseconds;
            log($"Discord begin verified session={sessionId} state={StateText(after)} timingMs={{read={readMs:F1},checkpoint={checkpointMs:F1},watcher={watcherMs:F1},actions={actionMs:F1},refresh={refreshMs:F1},total={Stopwatch.GetElapsedTime(operationStarted).TotalMilliseconds:F1}}}");
            return new(true, snapshot, after, "applied");
        }
        catch (Exception error)
        {
            log($"Discord UI Automation begin: {error.GetType().Name} {error.Message}");
            if (error is DiscordActionOutcomeUncertainException uncertain && _active is { } uncertainSnapshot)
            {
                var pending = uncertainSnapshot with { ActionUncertain = true };
                _active = pending;
                try { SaveState(pending); } catch (Exception checkpointError) { log($"Discord uncertain action checkpoint failed: {checkpointError.GetType().Name}"); }
                RefreshWatcher(pending);
                log($"Discord action outcome uncertain session={uncertainSnapshot.SessionId} field={uncertain.Field} target={uncertain.Target} observed={StateText(uncertain.Observed)}; deferred rollback");
                return new(false, pending, uncertain.Observed, "apply-outcome-uncertain");
            }
            if (error is DiscordManualOverrideException)
            {
                _manualOverrideIdentity = _active?.CallIdentity;
                ClearState();
                return new(false, null, null, "manual-override");
            }
            var restored = _active is null || await RestoreCoreAsync(_active);
            return new(false, restored ? null : _active, null, restored ? "apply-failed-rolled-back" : "apply-failed-restore-pending");
        }
        finally { _gate.Release(); }
    }

    public async Task<bool> RestoreAsync(DiscordVoiceSnapshot? snapshot)
    {
        if (snapshot is null) return true;
        await _gate.WaitAsync();
        try
        {
            return await RestoreCoreAsync(snapshot);
        }
        catch (Exception error)
        {
            log($"Discord UI Automation restore: {error.GetType().Name} {error.Message}");
            return false;
        }
        finally { _gate.Release(); }
    }

    public async Task<bool> RestoreActiveAsync()
    {
        await _gate.WaitAsync();
        try { return _active is null || await RestoreCoreAsync(_active); }
        catch (Exception error) { log($"Discord UI Automation restore: {error.GetType().Name}"); return false; }
        finally { _gate.Release(); }
    }

    public async Task ObserveAsync()
    {
        if (Interlocked.Read(ref _lastObserveTicks) != 0 && Stopwatch.GetElapsedTime(Interlocked.Read(ref _lastObserveTicks)).TotalSeconds < 4.5) return;
        await _gate.WaitAsync();
        try
        {
            Interlocked.Exchange(ref _lastObserveTicks, Stopwatch.GetTimestamp());
            if (_active is not { } snapshot) return;
            if (Interlocked.Exchange(ref _manualMuteOverride, 0) != 0 || Interlocked.Exchange(ref _manualDeafenOverride, 0) != 0) { PreserveManualOverride(snapshot); return; }
            var current = access.Read();
            log($"Discord observe session={snapshot.SessionId} state={StateText(current)} uncertain={snapshot.ActionUncertain}");
            if (!current.CallActive || current.CallIdentity != snapshot.CallIdentity) { ClearState(); return; }
            if (snapshot.ActionUncertain) return;
            if (StateChangedByUser(snapshot, current)) PreserveManualOverride(snapshot);
            else RefreshWatcher(snapshot);
        }
        catch (Exception error) { log($"Discord UI Automation observe: {error.GetType().Name}"); }
        finally { _gate.Release(); }
    }

    private Task<bool> RestoreCoreAsync(DiscordVoiceSnapshot snapshot)
    {
        try
        {
            if (snapshot.ManualOverride || Interlocked.Exchange(ref _manualMuteOverride, 0) != 0 || Interlocked.Exchange(ref _manualDeafenOverride, 0) != 0)
            {
                PreserveManualOverride(snapshot);
                return Task.FromResult(true);
            }
            if (snapshot.RestoreActionUncertain)
            {
                var now = Stopwatch.GetTimestamp();
                var last = Interlocked.Read(ref _lastUncertainRestoreReadTicks);
                if (last != 0 && Stopwatch.GetElapsedTime(last, now).TotalSeconds < 2) return Task.FromResult(false);
                Interlocked.Exchange(ref _lastUncertainRestoreReadTicks, now);
            }
            var current = access.Read();
            log($"Discord restore session={snapshot.SessionId} state={StateText(current)} originalMute={snapshot.OriginalMuted} originalDeafen={snapshot.OriginalDeafened} appliedMute={snapshot.AppliedMuted?.ToString() ?? "unknown"} appliedDeafen={snapshot.AppliedDeafened?.ToString() ?? "unknown"} uncertain={snapshot.ActionUncertain}");
            if (!current.CallActive || current.CallIdentity != snapshot.CallIdentity) { ClearState(); return Task.FromResult(true); }
            if (snapshot.RestoreActionUncertain)
            {
                if (current.Muted == snapshot.OriginalMuted && current.Deafened == snapshot.OriginalDeafened)
                {
                    ClearState();
                    log($"Discord uncertain restore observed complete session={snapshot.SessionId} state={StateText(current)}");
                    return Task.FromResult(true);
                }
                if ((!snapshot.AppliedMuted.HasValue && current.Muted != snapshot.OriginalMuted) ||
                    (!snapshot.AppliedDeafened.HasValue && current.Deafened != snapshot.OriginalDeafened))
                {
                    PreserveManualOverride(snapshot);
                    return Task.FromResult(true);
                }
                log($"Discord uncertain restore pending session={snapshot.SessionId} state={StateText(current)}; no repeat UIA action");
                return Task.FromResult(false);
            }
            if (snapshot.ActionUncertain)
            {
                var atOriginal = current.Muted == snapshot.OriginalMuted && current.Deafened == snapshot.OriginalDeafened;
                if (atOriginal) { ClearState(); log($"Discord uncertain action resolved unchanged session={snapshot.SessionId}"); return Task.FromResult(true); }
                if ((!snapshot.AppliedMuted.HasValue && current.Muted != snapshot.OriginalMuted) ||
                    (!snapshot.AppliedDeafened.HasValue && current.Deafened != snapshot.OriginalDeafened))
                {
                    PreserveManualOverride(snapshot);
                    log($"Discord uncertain action preserved user state session={snapshot.SessionId}");
                    return Task.FromResult(true);
                }
                _watcher?.Dispose();
                _watcher = null;
                if (snapshot.AppliedDeafened.HasValue && current.Deafened != snapshot.OriginalDeafened)
                {
                    log($"Discord restore action session={snapshot.SessionId} field=deafen target={snapshot.OriginalDeafened}");
                    current = access.SetDeafened(snapshot.OriginalDeafened, current.Deafened, snapshot.CallIdentity);
                }
                if (snapshot.AppliedMuted.HasValue && current.Muted != snapshot.OriginalMuted)
                {
                    log($"Discord restore action session={snapshot.SessionId} field=mute target={snapshot.OriginalMuted}");
                    current = access.SetMuted(snapshot.OriginalMuted, current.Muted, snapshot.CallIdentity);
                }
                if (!current.CallActive || current.CallIdentity != snapshot.CallIdentity || current.Muted != snapshot.OriginalMuted || current.Deafened != snapshot.OriginalDeafened) return Task.FromResult(false);
                ClearState();
                log($"Discord uncertain action restored session={snapshot.SessionId} state={StateText(current)}");
                return Task.FromResult(true);
            }
            var muteOverride = snapshot.ManualMuteOverride || Volatile.Read(ref _manualMuteOverride) != 0 || (snapshot.AppliedMuted.HasValue && current.Muted != snapshot.AppliedMuted);
            var deafenOverride = snapshot.ManualDeafenOverride || Volatile.Read(ref _manualDeafenOverride) != 0 || (snapshot.AppliedDeafened.HasValue && current.Deafened != snapshot.AppliedDeafened);
            var coupledOverride = snapshot.AppliedDeafened.HasValue && (muteOverride || deafenOverride);
            _watcher?.Dispose();
            _watcher = null;
            if (!snapshot.ManualOverride && !coupledOverride && !deafenOverride && snapshot.AppliedDeafened.HasValue && current.Deafened != snapshot.OriginalDeafened)
            {
                log($"Discord restore action session={snapshot.SessionId} field=deafen target={snapshot.OriginalDeafened}");
                current = access.SetDeafened(snapshot.OriginalDeafened, current.Deafened, snapshot.CallIdentity);
            }
            if (!snapshot.ManualOverride && !coupledOverride && !muteOverride && snapshot.AppliedMuted.HasValue && current.Muted != snapshot.OriginalMuted)
            {
                log($"Discord restore action session={snapshot.SessionId} field=mute target={snapshot.OriginalMuted}");
                current = access.SetMuted(snapshot.OriginalMuted, current.Muted, snapshot.CallIdentity);
            }
            if (!current.CallActive || current.CallIdentity != snapshot.CallIdentity || (!coupledOverride && !muteOverride && snapshot.AppliedMuted.HasValue && current.Muted != snapshot.OriginalMuted) || (!coupledOverride && !deafenOverride && snapshot.AppliedDeafened.HasValue && current.Deafened != snapshot.OriginalDeafened)) return Task.FromResult(false);
            if (snapshot.ManualOverride || muteOverride || deafenOverride)
            {
                PreserveManualOverride(snapshot);
                return Task.FromResult(true);
            }
            ClearState();
            log($"Discord restore verified session={snapshot.SessionId} state={StateText(current)}");
            return Task.FromResult(true);
        }
        catch (DiscordActionOutcomeUncertainException error)
        {
            var pending = snapshot with { RestoreActionUncertain = true };
            if (_active?.SessionId == snapshot.SessionId) _active = pending;
            try { SaveState(pending); } catch (Exception checkpointError) { log($"Discord uncertain restore checkpoint failed: {checkpointError.GetType().Name}"); }
            log($"Discord restore action outcome uncertain session={snapshot.SessionId} field={error.Field} target={error.Target} observed={StateText(error.Observed)}; no repeat UIA action");
            return Task.FromResult(false);
        }
        catch (Exception error)
        {
            log($"Discord UI Automation restore: {error.GetType().Name} {error.Message}");
            return Task.FromResult(false);
        }
    }

    public async Task<bool> RestorePendingAtStartupAsync()
    {
        await _gate.WaitAsync();
        try
        {
            if (!File.Exists(statePath)) return true;
            try { _active = System.Text.Json.JsonSerializer.Deserialize<DiscordVoiceSnapshot>(File.ReadAllText(statePath)); }
            catch (Exception error) { log($"Discord recovery state invalid: {error.GetType().Name}"); DeleteState(); return false; }
            if (_active is null || DateTimeOffset.UtcNow - _active.StartedAt > TimeSpan.FromMinutes(10)) { ClearState(); return true; }
            if (_active.ManualOverride || _active.ManualMuteOverride || _active.ManualDeafenOverride)
            {
                _manualOverrideIdentity = _active.CallIdentity;
                _manualOverrideSessionId = _active.SessionId;
                _active = null;
                return true;
            }
            return await RestoreCoreAsync(_active);
        }
        finally { _gate.Release(); }
    }

    private void SaveState(DiscordVoiceSnapshot snapshot)
    {
        lock (_stateSync)
        {
            var temp = statePath + ".tmp";
            Directory.CreateDirectory(Path.GetDirectoryName(statePath)!);
            File.WriteAllText(temp, System.Text.Json.JsonSerializer.Serialize(snapshot));
            File.Move(temp, statePath, true);
        }
    }
    private void OnChanged(DiscordVoiceSnapshot snapshot, string field, bool value)
    {
        var active = _active;
        if (active?.SessionId != snapshot.SessionId) return;
        if (Volatile.Read(ref _actionInProgress) != 0)
        {
            log($"Discord state event during agent action session={active.SessionId} field={field} value={value}");
            return;
        }
        var muteChanged = field == "mute" && active.AppliedMuted.HasValue && value != active.AppliedMuted;
        var deafenChanged = field == "deafen" && active.AppliedDeafened.HasValue && value != active.AppliedDeafened;
        if (!muteChanged && !deafenChanged) return;
        if (muteChanged) Interlocked.Exchange(ref _manualMuteOverride, 1);
        if (deafenChanged) Interlocked.Exchange(ref _manualDeafenOverride, 1);
        try
        {
            var updated = active with { ManualMuteOverride = active.ManualMuteOverride || muteChanged, ManualDeafenOverride = active.ManualDeafenOverride || deafenChanged };
            _active = updated;
            SaveState(updated);
            log($"Discord manual override session={active.SessionId} field={field} value={value}");
        }
        catch (Exception error) { log($"Discord manual override checkpoint failed: {error.GetType().Name}"); }
    }
    private void RefreshWatcher(DiscordVoiceSnapshot snapshot)
    {
        try
        {
            var next = access.WatchChanges(snapshot.CallIdentity, (field, value) => OnChanged(snapshot, field, value));
            var previous = _watcher;
            _watcher = next;
            previous?.Dispose();
        }
        catch (Exception error) { log($"Discord UI Automation watcher refresh: {error.GetType().Name}"); }
    }
    private DiscordVoiceState RunApplyingAction(Func<DiscordVoiceState> action)
    {
        Interlocked.Exchange(ref _actionInProgress, 1);
        try { return action(); }
        finally { Interlocked.Exchange(ref _actionInProgress, 0); }
    }
    private static bool StateChangedByUser(DiscordVoiceSnapshot snapshot, DiscordVoiceState state) =>
        (snapshot.AppliedMuted.HasValue && snapshot.AppliedMuted != state.Muted) || (snapshot.AppliedDeafened.HasValue && snapshot.AppliedDeafened != state.Deafened);
    private static string StateText(DiscordVoiceState? state)
    {
        if (state is null) return "unavailable";
        var identity = state.CallIdentity;
        return $"call={state.CallActive},mute={state.Muted},deafen={state.Deafened},identity={(identity is null ? "none" : identity[..Math.Min(12, identity.Length)])}";
    }
    private void DeleteState() { lock (_stateSync) { try { File.Delete(statePath); } catch { } } }
    private void ClearState() { _active = null; _watcher?.Dispose(); _watcher = null; Interlocked.Exchange(ref _lastUncertainRestoreReadTicks, 0); DeleteState(); }
    private void PreserveManualOverride(DiscordVoiceSnapshot snapshot)
    {
        _manualOverrideIdentity = snapshot.CallIdentity;
        _manualOverrideSessionId = snapshot.SessionId;
        _active = null;
        _watcher?.Dispose();
        _watcher = null;
        var checkpoint = snapshot with
        {
            ManualOverride = true,
            ManualMuteOverride = snapshot.ManualMuteOverride || Interlocked.Exchange(ref _manualMuteOverride, 0) != 0,
            ManualDeafenOverride = snapshot.ManualDeafenOverride || Interlocked.Exchange(ref _manualDeafenOverride, 0) != 0
        };
        try { SaveState(checkpoint); }
        catch (Exception error) { log($"Discord manual override checkpoint failed: {error.GetType().Name}"); }
    }
}

internal sealed class DiscordManualOverrideException : InvalidOperationException
{
    public DiscordManualOverrideException() : base("El usuario cambió el mute de Discord durante la operación.") { }
}

internal sealed class DiscordActionOutcomeUncertainException(string field, bool target, DiscordVoiceState? observed, string detail)
    : InvalidOperationException($"La acción UIA de {field} fue enviada, pero el estado quedó sin confirmar ({detail}).")
{
    public string Field { get; } = field;
    public bool Target { get; } = target;
    public DiscordVoiceState? Observed { get; } = observed;
}

internal sealed class WindowsDiscordVoiceAccess : IDiscordVoiceAccess
{
    private static readonly string[] ConnectedLabels = ["voice connected", "voz conectada"];
    private static readonly string[] MuteLabels = ["mute", "unmute", "silenciar", "activar sonido", "quitar silencio", "desactivar silencio"];
    private static readonly string[] DeafenLabels = ["deafen", "undeafen", "ensordecer", "dejar de ensordecer", "activar sonido entrante"];
    private const string AudioControlClass = "audioButtonWithMenu";
    private static readonly object WindowCacheSync = new();
    private static CachedDiscordWindow? CachedWindow;
    private readonly Action<string> log;
    private CachedControls? _lastControls;

    private sealed record CachedDiscordWindow(int ProcessId, IntPtr Handle, long StartedAtTicks, AutomationElement Root);
    private sealed record CachedControls(DiscordVoiceState State, AutomationElement Root, AutomationElement? ConnectedCall, AutomationElement Mute, AutomationElement? Deafen);

    [DllImport("user32.dll")]
    private static extern bool IsWindow(IntPtr handle);
    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr handle, out uint processId);

    public WindowsDiscordVoiceAccess(Action<string>? log = null) => this.log = log ?? (_ => { });

    public DiscordVoiceState Read()
    {
        return ReadControls().State;
    }

    public DiscordVoiceState SetMuted(bool muted, bool expectedCurrent, string expectedCallIdentity)
    {
        var controls = ReadCurrentControls(expectedCallIdentity);
        var before = controls.State;
        if (!before.CallActive || before.CallIdentity != expectedCallIdentity)
            throw new InvalidOperationException("La llamada de Discord cambió durante la operación.");
        if (before.Muted != expectedCurrent)
            throw new DiscordManualOverrideException();
        using var confirmation = WatchForToggle(controls.Mute, muted, "mute");
        SendToggle(muted, controls.Mute, "micrófono", before.Muted);
        return ConfirmAction("mute", muted, expectedCallIdentity, state => state.Muted == muted, confirmation);
    }

    public DiscordVoiceState SetDeafened(bool deafened, bool expectedCurrent, string expectedCallIdentity)
    {
        var controls = ReadCurrentControls(expectedCallIdentity);
        var before = controls.State;
        var deafen = controls.Deafen;
        if (deafen is null) throw new InvalidOperationException("Discord no expone un control accesible de ensordecimiento.");
        if (!before.CallActive || before.CallIdentity != expectedCallIdentity)
            throw new InvalidOperationException("La llamada de Discord cambió durante la operación.");
        if (before.Deafened != expectedCurrent)
            throw new DiscordManualOverrideException();
        using var confirmation = WatchForToggle(deafen, deafened, "deafen");
        SendToggle(deafened, deafen, "ensordecimiento", before.Deafened);
        return ConfirmAction("deafen", deafened, expectedCallIdentity, state => state.Deafened == deafened && (!deafened || state.Muted), confirmation);
    }

    public IDisposable WatchChanges(string expectedCallIdentity, Action<string, bool> onChanged)
    {
        var controls = ReadCurrentControls(expectedCallIdentity);
        var state = controls.State;
        var mute = controls.Mute;
        var deafen = controls.Deafen;
        if (!state.CallActive || state.CallIdentity != expectedCallIdentity)
            throw new InvalidOperationException("La llamada de Discord cambió al registrar el observador.");
        AutomationPropertyChangedEventHandler muteHandler = (_, args) =>
        {
            if (args.Property == TogglePattern.ToggleStateProperty && args.NewValue is ToggleState toggle && toggle != ToggleState.Indeterminate)
                onChanged("mute", toggle == ToggleState.On);
        };
        AutomationPropertyChangedEventHandler deafenHandler = (_, args) =>
        {
            if (args.Property == TogglePattern.ToggleStateProperty && args.NewValue is ToggleState toggle && toggle != ToggleState.Indeterminate)
                onChanged("deafen", toggle == ToggleState.On);
        };
        Automation.AddAutomationPropertyChangedEventHandler(mute, TreeScope.Element, muteHandler, TogglePattern.ToggleStateProperty);
        try { if (deafen is not null) Automation.AddAutomationPropertyChangedEventHandler(deafen, TreeScope.Element, deafenHandler, TogglePattern.ToggleStateProperty); }
        catch { Automation.RemoveAutomationPropertyChangedEventHandler(mute, muteHandler); throw; }
        return new UiAutomationMuteWatcher(mute, muteHandler, deafen, deafenHandler);
    }

    private void SendToggle(bool? target, AutomationElement control, string description, bool current)
    {
        if (target is null || target == current) return;
        var started = Stopwatch.GetTimestamp();
        var toggle = GetTogglePattern(control);
        if (toggle.Current.ToggleState != (current ? ToggleState.On : ToggleState.Off))
            throw new InvalidOperationException($"El estado de {description} cambió durante la operación.");
        log($"Discord UIA invoke field={description} before={(current ? "on" : "off")} target={(target.Value ? "on" : "off")}");
        try { toggle.Toggle(); log($"Discord UIA invoke returned field={description} elapsedMs={Stopwatch.GetElapsedTime(started).TotalMilliseconds:F1}"); }
        catch (Exception error) { throw new DiscordActionOutcomeUncertainException(description, target.Value, null, error.GetType().Name); }
    }

    private ActionConfirmationWatcher? WatchForToggle(AutomationElement control, bool target, string field)
    {
        try
        {
            var watcher = new ActionConfirmationWatcher(control, target);
            log($"Discord UIA confirmation watcher field={field} registered=true");
            return watcher;
        }
        catch (Exception error)
        {
            log($"Discord UIA confirmation watcher field={field} registered=false error={error.GetType().Name}");
            return null;
        }
    }

    private DiscordVoiceState ConfirmAction(string field, bool target, string expectedCallIdentity, Func<DiscordVoiceState, bool> matches, ActionConfirmationWatcher? confirmation)
    {
        var confirmationStarted = Stopwatch.GetTimestamp();
        DiscordVoiceState? observed = null;
        Exception? lastError = null;
        for (var attempt = 0; attempt < 4; attempt++)
        {
            var attemptStarted = Stopwatch.GetTimestamp();
            try
            {
                observed = Read();
                log($"Discord UIA verify field={field} attempt={attempt + 1} elapsedMs={Stopwatch.GetElapsedTime(attemptStarted).TotalMilliseconds:F1} call={observed.CallActive} mute={observed.Muted} deafen={observed.Deafened} identityMatch={observed.CallIdentity == expectedCallIdentity}");
                if (!observed.CallActive || observed.CallIdentity != expectedCallIdentity)
                    throw new DiscordActionOutcomeUncertainException(field, target, observed, "call-identity-changed");
                if (matches(observed))
                {
                    log($"Discord UIA confirmation field={field} attempts={attempt + 1} elapsedMs={Stopwatch.GetElapsedTime(confirmationStarted).TotalMilliseconds:F1}");
                    return observed;
                }
            }
            catch (DiscordActionOutcomeUncertainException) { throw; }
            catch (Exception error) { lastError = error; log($"Discord UIA verify field={field} attempt={attempt + 1} error={error.GetType().Name}"); }
            if (attempt < 3)
            {
                var waitMs = confirmation?.TargetObserved == true ? 10 : attempt switch { 0 => 25, 1 => 75, _ => 150 };
                if (confirmation is null) Thread.Sleep(waitMs);
                else confirmation.WaitForTarget(waitMs);
            }
        }
        log($"Discord UIA confirmation failed field={field} attempts=4 elapsedMs={Stopwatch.GetElapsedTime(confirmationStarted).TotalMilliseconds:F1}");
        throw new DiscordActionOutcomeUncertainException(field, target, observed, lastError?.GetType().Name ?? "target-not-observed");
    }

    private AutomationElement GetDiscordWindow()
    {
        var started = Stopwatch.GetTimestamp();
        lock (WindowCacheSync)
        {
            if (CachedWindow is { } cached && IsCachedWindowAlive(cached))
            {
                log($"Discord UIA process lookup cached=true elapsedMs={Stopwatch.GetElapsedTime(started).TotalMilliseconds:F1}");
                return cached.Root;
            }
            CachedWindow = null;
            var processes = Process.GetProcessesByName("Discord");
            try
            {
                var windows = processes.Where(process => process.MainWindowHandle != IntPtr.Zero).ToArray();
                if (windows.Length != 1) throw new InvalidOperationException("Se esperaba una única ventana principal de Discord.");
                var process = windows[0];
                var handle = process.MainWindowHandle;
                var root = AutomationElement.FromHandle(handle) ?? throw new InvalidOperationException("No se pudo obtener la ventana accesible de Discord.");
                CachedWindow = new(process.Id, handle, process.StartTime.ToUniversalTime().Ticks, root);
                log($"Discord UIA process lookup cached=false processes={processes.Length} elapsedMs={Stopwatch.GetElapsedTime(started).TotalMilliseconds:F1}");
                return root;
            }
            finally { foreach (var process in processes) process.Dispose(); }
        }
    }

    private static bool IsCachedWindowAlive(CachedDiscordWindow cached)
    {
        try
        {
            if (!IsWindow(cached.Handle) || GetWindowThreadProcessId(cached.Handle, out var processId) == 0 || processId != cached.ProcessId) return false;
            using var process = Process.GetProcessById(cached.ProcessId);
            return !process.HasExited && process.ProcessName.Equals("Discord", StringComparison.OrdinalIgnoreCase) && process.StartTime.ToUniversalTime().Ticks == cached.StartedAtTicks;
        }
        catch { return false; }
    }

    private static AutomationElement[] GetAudioButtons(AutomationElement root)
    {
        var condition = new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Button);
        return root.FindAll(TreeScope.Descendants, condition).Cast<AutomationElement>()
            .Where(element => element.Current.ClassName.Contains(AudioControlClass, StringComparison.Ordinal))
            .ToArray();
    }

    private CachedControls ReadControls()
    {
        var started = Stopwatch.GetTimestamp();
        var root = GetDiscordWindow();
        var scanStarted = Stopwatch.GetTimestamp();
        var buttons = GetAudioButtons(root);
        var mute = FindToggle(buttons, MuteLabels, "micrófono");
        var deafen = FindOptionalToggle(buttons, DeafenLabels);
        var connectedCall = FindConnectedCall(root);
        var scanMs = Stopwatch.GetElapsedTime(scanStarted).TotalMilliseconds;
        var activeCall = connectedCall is not null;
        var identity = CreateCallIdentity(root, connectedCall);
        bool? minimized = root.TryGetCurrentPattern(WindowPattern.Pattern, out var windowPattern) && windowPattern is WindowPattern window
            ? window.Current.WindowVisualState == WindowVisualState.Minimized : null;
        var state = new DiscordVoiceState(activeCall, ReadToggle(mute, "micrófono"), deafen is not null && ReadToggle(deafen, "ensordecimiento"),
            activeCall ? "call-active" : "no-active-call", identity, root.Current.IsOffscreen, minimized);
        var result = new CachedControls(state, root, connectedCall, mute, deafen);
        _lastControls = result;
        log($"Discord UIA discovery elapsedMs={Stopwatch.GetElapsedTime(started).TotalMilliseconds:F1} treeSearchMs={scanMs:F1} buttons={buttons.Length} deafenFound={deafen is not null} minimized={minimized?.ToString() ?? "unknown"}");
        return result;
    }

    private CachedControls ReadCurrentControls(string expectedCallIdentity)
    {
        var cached = _lastControls;
        if (cached is null) return ReadControls();
        var started = Stopwatch.GetTimestamp();
        try
        {
            if (!IsCachedWindowAlive(CachedWindowFor(cached.Root))) return ReadControls();
            var current = ReadCachedState(cached);
            var refreshed = cached with { State = current };
            _lastControls = refreshed;
            log($"Discord UIA cached controls elapsedMs={Stopwatch.GetElapsedTime(started).TotalMilliseconds:F1} identityMatch={current.CallIdentity == expectedCallIdentity}");
            return refreshed;
        }
        catch (ElementNotAvailableException error)
        {
            log($"Discord UIA cached controls invalidated elapsedMs={Stopwatch.GetElapsedTime(started).TotalMilliseconds:F1} error={error.GetType().Name}");
            return ReadControls();
        }
    }

    private static CachedDiscordWindow CachedWindowFor(AutomationElement root)
    {
        lock (WindowCacheSync)
        {
            if (CachedWindow is { } cached && ReferenceEquals(cached.Root, root)) return cached;
        }
        throw new ElementNotAvailableException();
    }

    private static DiscordVoiceState ReadCachedState(CachedControls controls)
    {
        var activeCall = controls.ConnectedCall is not null && ConnectedLabels.Any(Normalize(controls.ConnectedCall.Current.Name).Contains);
        var identity = CreateCallIdentity(controls.Root, controls.ConnectedCall);
        return controls.State with
        {
            CallActive = activeCall,
            Muted = ReadToggle(controls.Mute, "micrófono"),
            Deafened = controls.Deafen is not null && ReadToggle(controls.Deafen, "ensordecimiento"),
            Status = activeCall ? "call-active" : "no-active-call",
            CallIdentity = identity
        };
    }

    private static string CreateCallIdentity(AutomationElement root, AutomationElement? connectedCall)
    {
        static string Part(AutomationElement element) => string.Join(',', element.GetRuntimeId());
        // Discord replaces the audio button UIA nodes when toggling them. They
        // are not call identity; include the stable window and call-status node.
        var value = $"{root.Current.ProcessId}|{root.Current.NativeWindowHandle}|{(connectedCall is null ? "no-call" : Part(connectedCall))}";
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
    }

    private static AutomationElement? FindConnectedCall(AutomationElement root)
    {
        var elements = root.FindAll(TreeScope.Descendants, Condition.TrueCondition);
        for (var i = 0; i < elements.Count; i++)
        {
            var name = Normalize(elements[i].Current.Name);
            if (ConnectedLabels.Any(name.Contains)) return elements[i];
        }
        return null;
    }

    private static AutomationElement FindToggle(IEnumerable<AutomationElement> buttons, string[] labels, string description)
    {
        var matches = buttons.Where(element =>
        {
            var name = Normalize(element.Current.Name);
            return labels.Any(label => name == label) &&
                element.TryGetCurrentPattern(TogglePattern.Pattern, out _);
        }).ToArray();
        if (matches.Length != 1) throw new InvalidOperationException($"No se identificó un único control UIA de {description}.");
        return matches[0];
    }

    private static AutomationElement? FindOptionalToggle(IEnumerable<AutomationElement> buttons, string[] labels)
    {
        var matches = buttons.Where(element => labels.Any(label => Normalize(element.Current.Name) == label) && element.TryGetCurrentPattern(TogglePattern.Pattern, out _)).ToArray();
        if (matches.Length > 1) throw new InvalidOperationException("Se identificaron varios controles UIA de ensordecimiento.");
        return matches.SingleOrDefault();
    }

    private static TogglePattern GetTogglePattern(AutomationElement element) =>
        (TogglePattern)element.GetCurrentPattern(TogglePattern.Pattern);

    private static string Normalize(string? value) => (value ?? "").Trim().ToLower(CultureInfo.InvariantCulture);

    private static bool ReadToggle(AutomationElement element, string description) => GetTogglePattern(element).Current.ToggleState switch
    {
        ToggleState.On => true,
        ToggleState.Off => false,
        _ => throw new InvalidOperationException($"El estado de {description} no es concluyente.")
    };
}

internal sealed class ActionConfirmationWatcher : IDisposable
{
    private readonly AutomationElement _control;
    private readonly ManualResetEventSlim _changed = new(false);
    private readonly AutomationPropertyChangedEventHandler _handler;
    private readonly ToggleState _target;

    public ActionConfirmationWatcher(AutomationElement control, bool target)
    {
        _control = control;
        _target = target ? ToggleState.On : ToggleState.Off;
        _handler = (_, args) =>
        {
            if (args.Property == TogglePattern.ToggleStateProperty && args.NewValue is ToggleState value && value == _target)
            {
                try { _changed.Set(); } catch (ObjectDisposedException) { }
            }
        };
        Automation.AddAutomationPropertyChangedEventHandler(_control, TreeScope.Element, _handler, TogglePattern.ToggleStateProperty);
    }

    public bool TargetObserved => _changed.IsSet;
    public bool WaitForTarget(int milliseconds) => _changed.Wait(milliseconds);

    public void Dispose()
    {
        try { Automation.RemoveAutomationPropertyChangedEventHandler(_control, _handler); } catch { }
        _changed.Dispose();
    }
}

internal sealed class UiAutomationMuteWatcher(AutomationElement mute, AutomationPropertyChangedEventHandler muteHandler, AutomationElement? deafen, AutomationPropertyChangedEventHandler deafenHandler) : IDisposable
{
    public void Dispose()
    {
        try { Automation.RemoveAutomationPropertyChangedEventHandler(mute, muteHandler); } catch { }
        if (deafen is not null) try { Automation.RemoveAutomationPropertyChangedEventHandler(deafen, deafenHandler); } catch { }
    }
}
