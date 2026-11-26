using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using NAudio.CoreAudioApi;
using NAudio.CoreAudioApi.Interfaces;
using Windows.Foundation;
using Windows.Media.Control;

internal sealed class MediaCoordinator
{
    private static readonly TimeSpan RecoveryWindow = TimeSpan.FromMinutes(10);
    private static readonly TimeSpan HeartbeatTimeout = TimeSpan.FromMinutes(2.5);
    private const int MinimumPauseWasapiFadeMs = 500;
    private const int MinimumDuckingWasapiFadeMs = 250;
    private const int WasapiFadeUpdateIntervalMs = 8;
    private const int PauseSilenceHoldMs = 50;
    private const float ZeroVolumeTolerance = 0.001f;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly object _volumeSync = new();
    private readonly object _pendingFileSync = new();
    private readonly string _statePath;
    private readonly Action<string> _log;
    private readonly List<string> _errors = [];
    private ActiveControlSession? _active;
    private long _lastHeartbeatUtcTicks;
    private long _pendingRevision;
    private bool _lastRestoreDurable = true;

    public MediaCoordinator(string appDirectory, Action<string> log)
    {
        _statePath = Path.Combine(appDirectory, "pending.json");
        _log = log;
        _ = MonitorAsync();
    }

    public async Task<object> BeginAsync(string sessionId, AgentSettings settings, long requestReceivedAt = 0)
    {
        var started = Stopwatch.GetTimestamp();
        if (requestReceivedAt == 0) requestReceivedAt = started;
        if (sessionId.Length is < 8 or > 100 || sessionId.Any(c => !char.IsAsciiLetterOrDigit(c) && c != '-'))
            return new { ok = false, error = "Identificador de sesión no válido." };
        await _gate.WaitAsync();
        var gateAcquired = Stopwatch.GetTimestamp();
        try
        {
            if (_active?.SessionId == sessionId) return StatusLocked(Stopwatch.GetElapsedTime(started).TotalMilliseconds, sessionId);
            var priorRestoreMs = 0d;
            if (_active is not null)
            {
                var restoreStarted = Stopwatch.GetTimestamp();
                await RestoreLocked("new-session");
                priorRestoreMs = Stopwatch.GetElapsedTime(restoreStarted).TotalMilliseconds;
            }
            var active = new ActiveControlSession(sessionId, settings, DateTimeOffset.UtcNow, requestReceivedAt, started, gateAcquired)
            {
                PriorRestoreMs = priorRestoreMs
            };
            _active = active;
            Interlocked.Exchange(ref _lastHeartbeatUtcTicks, DateTime.UtcNow.Ticks);

            var pausedAppKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var duckTask = DuckFallbackSessions(active, pausedAppKeys);
            await FadeSelectedVolumeSessionsAsync(active);
            var notReadyForPause = await HoldSilenceBeforePauseAsync(active);
            await PauseMediaSessionsAsync(active, pausedAppKeys, notReadyVolumeApps: notReadyForPause);
            await CompletePauseFallbacksAsync(active, pausedAppKeys);
            var failedDuckingApps = await duckTask;
            if (settings.FallbackToPause && failedDuckingApps.Count > 0)
                await PauseMediaSessionsAsync(active, pausedAppKeys, failedDuckingApps, fallbackUsed: true);
            active.UnsupportedCount = failedDuckingApps.Count(failed => !active.Media.Any(item => item.FallbackUsed && MediaIdentityKeys(item.AppId, settings).Contains(failed)));
            SavePendingLocked();
            return StatusLocked(Stopwatch.GetElapsedTime(started).TotalMilliseconds, sessionId, BuildBeginTiming(active));
        }
        finally { _gate.Release(); }
    }

    public object Heartbeat(string sessionId)
    {
        if (_active?.SessionId != sessionId) return new { ok = true, ignored = true };
        Interlocked.Exchange(ref _lastHeartbeatUtcTicks, DateTime.UtcNow.Ticks);
        return new { ok = true, ignored = false };
    }

    public async Task<object> RestoreAsync(string sessionId, string reason)
    {
        var started = Stopwatch.GetTimestamp();
        _log($"command restore received session={sessionId} reason={reason}");
        await _gate.WaitAsync();
        try
        {
            if (_active is not null && _active.SessionId != sessionId)
            {
                _log($"command restore ignored session={sessionId} activeSession={_active.SessionId}");
                return new { ok = true, ignored = true, restored = 0, sessionId, durationMs = Stopwatch.GetElapsedTime(started).TotalMilliseconds };
            }
            var restored = _active is null ? await RestorePendingLocked(sessionId) : await RestoreLocked(reason);
            _log($"command restore completed session={sessionId} ignored=false restored={restored} durationMs={Stopwatch.GetElapsedTime(started).TotalMilliseconds:F1}");
            return new { ok = true, ignored = false, restored, sessionId, durationMs = Stopwatch.GetElapsedTime(started).TotalMilliseconds };
        }
        finally { _gate.Release(); }
    }

    public async Task<object> RestoreAllAsync(string reason)
    {
        _log($"command restore-all received reason={reason}");
        await _gate.WaitAsync();
        try
        {
            var count = _active is null ? await RestorePendingLocked(null) : await RestoreLocked(reason);
            _log($"command restore-all completed restored={count}");
            return new { ok = true, restored = count };
        }
        finally { _gate.Release(); }
    }

    public async Task<AgentShutdownResult> PrepareShutdownAsync()
    {
        await _gate.WaitAsync();
        try
        {
            var restored = _active is null ? await RestorePendingLocked(null) : await RestoreLocked("agent-shutdown");
            return new AgentShutdownResult(_lastRestoreDurable, restored, File.Exists(_statePath));
        }
        finally { _gate.Release(); }
    }

    public async Task<object> ListApplications()
    {
        var media = new Dictionary<string, (string AppId, string Status)>(StringComparer.OrdinalIgnoreCase);
        try
        {
            var manager = await GlobalSystemMediaTransportControlsSessionManager.RequestAsync();
            foreach (var session in manager.GetSessions())
            {
                var appId = session.SourceAppUserModelId ?? "";
                if (appId.Length == 0 || AppIdentity.IsProtectedMediaId(appId)) continue;
                var status = session.GetPlaybackInfo()?.PlaybackStatus.ToString() ?? "Unknown";
                media[appId] = (appId, status);
            }
        }
        catch (Exception error) { RecordError($"Detección multimedia: {error.GetType().Name}"); }

        var apps = new Dictionary<string, DetectedApplication>(StringComparer.OrdinalIgnoreCase);
        foreach (var candidate in EnumerateAllVolumeSessions())
        {
            try
            {
                var path = candidate.ExecutablePath;
                if (path.Length == 0 || AppIdentity.IsProtectedExecutable(path)) continue;
                var key = path.ToLowerInvariant();
                if (!apps.TryGetValue(key, out var app))
                    apps[key] = app = new DetectedApplication(Path.GetFileName(path), path);
                app.VolumeSessions++;
                foreach (var item in media.Values.Where(item => AppIdentity.MediaIdMatchesExecutable(item.AppId, path)))
                {
                    app.AppUserModelId = item.AppId;
                    app.MediaStatus = item.Status;
                    app.PauseAvailable = true;
                }
            }
            finally { candidate.Dispose(); }
        }

        foreach (var item in media.Values)
        {
            if (apps.Values.Any(app => app.PauseAvailable && string.Equals(app.AppUserModelId, item.AppId, StringComparison.OrdinalIgnoreCase))) continue;
            apps[$"aumid:{item.AppId}"] = new DetectedApplication(item.AppId, "")
            {
                AppUserModelId = item.AppId,
                MediaStatus = item.Status,
                PauseAvailable = true,
                DuckingAvailable = false
            };
        }
        AddInstalledPlexApps(apps);
        return new { ok = true, apps = apps.Values.Select(app => new
        {
            displayName = app.Name,
            executable = app.Executable,
            path = app.Path,
            appUserModelId = app.AppUserModelId,
            mediaStatus = app.MediaStatus,
            volumeSessions = app.VolumeSessions,
            pauseAvailable = app.PauseAvailable,
            duckingAvailable = app.DuckingAvailable
        }).ToArray() };
    }

    private static void AddInstalledPlexApps(Dictionary<string, DetectedApplication> apps)
    {
        string[] roots = [
            @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
            @"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
        ];
        foreach (var hive in new[] { Microsoft.Win32.Registry.CurrentUser, Microsoft.Win32.Registry.LocalMachine })
        foreach (var root in roots)
        {
            using var uninstall = hive.OpenSubKey(root);
            if (uninstall is null) continue;
            foreach (var subkeyName in uninstall.GetSubKeyNames())
            {
                try
                {
                    using var entry = uninstall.OpenSubKey(subkeyName);
                    if (entry is null) continue;
                    var name = entry.GetValue("DisplayName") as string;
                    if (name is not ("Plex" or "Plex HTPC" or "Plexamp")) continue;
                    var folder = entry.GetValue("InstallLocation") as string;
                    if (string.IsNullOrWhiteSpace(folder))
                    {
                        var uninstallString = entry.GetValue("UninstallString") as string ?? "";
                        var match = Regex.Match(uninstallString, "^[\\\"]?(.+?\\\\Uninstall\\.exe)", RegexOptions.IgnoreCase);
                        if (match.Success) folder = Path.GetDirectoryName(match.Groups[1].Value.Trim('"'));
                    }
                    if (string.IsNullOrWhiteSpace(folder) || !Directory.Exists(folder)) continue;
                    var candidates = name switch
                    {
                        "Plex" => new[] { "Plex.exe" },
                        "Plex HTPC" => new[] { "Plex HTPC.exe", "PlexHTPC.exe" },
                        _ => new[] { "Plexamp.exe", "PlexampDesktop.exe" }
                    };
                    var executable = candidates.Select(file => Path.Combine(folder, file)).FirstOrDefault(File.Exists);
                    if (executable is null) continue;
                    var key = executable.ToLowerInvariant();
                    apps.TryAdd(key, new DetectedApplication(name, executable) { MediaStatus = "Instalada · sin sesión activa" });
                }
                catch { /* A third-party uninstall entry can disappear during enumeration. */ }
            }
        }
    }

    public object GetStatus()
    {
        _gate.Wait();
        try { return StatusLocked(); }
        finally { _gate.Release(); }
    }

    public async Task RestorePendingAtStartupAsync()
    {
        await _gate.WaitAsync();
        try { await RestorePendingLocked(null); }
        finally { _gate.Release(); }
    }

    public double WarmUpDuckingPath()
    {
        var started = Stopwatch.GetTimestamp();
        foreach (var candidate in EnumerateActiveVolumeSessions(new AgentSettings(), [])) candidate.Dispose();
        return Stopwatch.GetElapsedTime(started).TotalMilliseconds;
    }

    private object StatusLocked(double? durationMs = null, string? correlationId = null, object? timing = null)
    {
        var paused = _active?.Media.Count ?? 0;
        var activeVolumes = _active is null ? [] : VolumeSnapshot(_active);
        var ducked = activeVolumes.Count(item => item.Attenuated);
        var unchanged = activeVolumes.Length - ducked;
        var levels = activeVolumes.Select(item => item.AppliedVolume).ToArray();
        var apps = new List<object>();
        if (_active is not null)
        {
            apps.AddRange(_active.Media.Select(item => new { app = item.AppId, method = item.FallbackUsed ? "pausa (alternativa)" : "pausa", manualOverride = item.ManualOverride }));
            apps.AddRange(activeVolumes.Select(item => new { app = item.ProcessName, method = item.Attenuated ? "ducking" : "sin cambio (ya bajo)", manualOverride = item.ManualOverride }));
        }
        return new
        {
            ok = true,
            running = true,
            sessionActive = _active is not null,
            sessionId = _active?.SessionId,
            mediaSessions = paused + ducked + unchanged,
            pausedSessions = paused,
            duckedSessions = ducked,
            unchangedSessions = unchanged,
            fallbackPausedSessions = _active?.Media.Count(item => item.FallbackUsed) ?? 0,
            unsupportedSessions = _active?.UnsupportedCount ?? 0,
            appliedVolumePercentRange = levels.Length == 0 ? null : new[] { (int)MathF.Round(levels.Min() * 100), (int)MathF.Round(levels.Max() * 100) },
            durationMs,
            correlationId,
            timing,
            apps,
            errors = GetErrors()
        };
    }

    private static object BuildBeginTiming(ActiveControlSession active)
    {
        double? SinceRequest(long? timestamp) => timestamp is long at
            ? Stopwatch.GetElapsedTime(active.RequestReceivedAt, at).TotalMilliseconds
            : null;
        return new
        {
            requestToBeginMs = Stopwatch.GetElapsedTime(active.RequestReceivedAt, active.BeginStartedAt).TotalMilliseconds,
            gateWaitMs = Stopwatch.GetElapsedTime(active.BeginStartedAt, active.GateAcquiredAt).TotalMilliseconds,
            priorRestoreMs = active.PriorRestoreMs,
            wasapiEnumerationMs = active.WasapiEnumerationMs,
            recoverySaveBeforeFadeMs = active.RecoverySaveBeforeFadeMs,
            firstEffectiveVolumeChangeMs = SinceRequest(active.FirstEffectiveVolumeChangeAt),
            firstVolumeBefore = active.FirstVolumeBefore,
            firstVolumeAfter = active.FirstVolumeAfter,
            fadeOutDurationMs = active.FadeOutDurationMs,
            fadeOutCompleteFromRequestMs = SinceRequest(active.FadeOutCompletedAt),
            fadeOutTargetVolume = active.FadeOutTargetVolume,
            fadeOutWriteCount = active.FadeOutWriteCount,
            maxFadeOutStep = active.MaxFadeOutStep
        };
    }

    private async Task FadeSelectedVolumeSessionsAsync(ActiveControlSession active)
    {
        var jobs = new List<Task>();
        var enumerationStarted = Stopwatch.GetTimestamp();
        var candidates = EnumerateActiveVolumeSessions(active.Settings, []).ToArray();
        active.WasapiEnumerationMs += Stopwatch.GetElapsedTime(enumerationStarted).TotalMilliseconds;
        foreach (var candidate in candidates)
        {
            try
            {
                var original = candidate.Volume.Volume;
                if (!float.IsFinite(original) || original <= 0.001f) continue;
                var playerSettings = ResolveForProcess(active.Settings, candidate.ExecutablePath, candidate.ProcessName);
                if (playerSettings.Mode != "pause") continue;
                var tracked = new TrackedVolumeSession(candidate.Control, candidate.Volume, candidate.SessionKey,
                    candidate.ProcessName, candidate.ExecutablePath, original, original, playerSettings);
                TrackVolume(active, tracked);
                candidate.TransferOwnership();
                active.FirstVolumeBefore ??= original;
                active.FadeOutTargetVolume = 0f;
                var saveStarted = Stopwatch.GetTimestamp();
                SavePendingLocked();
                if (active.FirstEffectiveVolumeChangeAt is null) active.RecoverySaveBeforeFadeMs += Stopwatch.GetElapsedTime(saveStarted).TotalMilliseconds;
                jobs.Add(FadeToPauseLevelAsync(active, tracked));
            }
            catch (Exception error)
            {
                RecordError($"Fade de pausa de {candidate.ProcessName}: {error.GetType().Name}");
            }
            finally { candidate.Dispose(); }
        }
        await Task.WhenAll(jobs);
    }

    private async Task FadeToPauseLevelAsync(ActiveControlSession active, TrackedVolumeSession item)
    {
        try
        {
            await FadeVolumeAsync(item, 0f, item.Settings.FadeOutMs, immediate: false, diagnostics: active, fadeOut: true);
            var effectiveVolume = item.Volume.Volume;
            if (!float.IsFinite(effectiveVolume) || effectiveVolume > ZeroVolumeTolerance)
                throw new InvalidOperationException("El volumen WASAPI no quedó en cero.");
            item.AppliedVolume = effectiveVolume;
            item.Attenuated = true;
            SavePendingLocked();
        }
        catch (Exception error)
        {
            UntrackVolume(active, item);
            item.Dispose();
            RecordError($"Fade de pausa de {item.ProcessName}: {error.GetType().Name}");
        }
    }

    private async Task<HashSet<string>> HoldSilenceBeforePauseAsync(ActiveControlSession active)
    {
        var notReady = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var volumes = VolumeSnapshot(active).Where(item => item.Settings.Mode == "pause" && !item.PauseAsDucking).ToArray();
        if (volumes.Length == 0) return notReady;

        foreach (var item in volumes)
        {
            var current = item.Volume.Volume;
            if (!float.IsFinite(current) || current > ZeroVolumeTolerance)
            {
                MarkNotReady(item, current);
                continue;
            }
            item.AppliedVolume = current;
        }
        await Task.Delay(PauseSilenceHoldMs);
        foreach (var item in volumes)
        {
            var current = item.Volume.Volume;
            if (!float.IsFinite(current) || current > ZeroVolumeTolerance) MarkNotReady(item, current);
            else item.AppliedVolume = current;
        }
        return notReady;

        void MarkNotReady(TrackedVolumeSession item, float current)
        {
            var appKey = ProcessIdentityKey(item.ExecutablePath, item.ProcessName);
            if (appKey.Length > 0) notReady.Add(appKey);
            if (float.IsFinite(current) && current > ZeroVolumeTolerance)
            {
                item.OriginalVolume = current;
                item.AppliedVolume = current;
                item.Attenuated = false;
                item.ManualOverride = true;
            }
            _log($"pausa omitida para {item.ProcessName}: volumen efectivo no confirmado en cero ({(float.IsFinite(current) ? current.ToString("F5") : "no finito")}).");
            SavePendingLocked();
        }
    }

    private async Task CompletePauseFallbacksAsync(ActiveControlSession active, HashSet<string> pausedAppKeys)
    {
        foreach (var item in VolumeSnapshot(active))
        {
            if (item.Settings.Mode != "pause") continue;
            if (pausedAppKeys.Contains(ProcessIdentityKey(item.ExecutablePath, item.ProcessName))) continue;
            try
            {
                if (item.Settings.FallbackDucking)
                {
                    item.PauseAsDucking = true;
                    var target = VolumeMath.Apply(item.OriginalVolume, item.Settings.TargetVolumePercent);
                    await FadeVolumeAsync(item, target, item.Settings.FadeOutMs, immediate: false, diagnostics: active, fadeOut: true);
                    item.AppliedVolume = item.Volume.Volume;
                    item.Attenuated = item.AppliedVolume < item.OriginalVolume - 0.005f;
                    SavePendingLocked();
                }
                else
                {
                    await FadeVolumeAsync(item, item.OriginalVolume, active.Settings.FadeInMs, immediate: false, restoring: true, diagnostics: active);
                    UntrackVolume(active, item);
                    item.Dispose();
                }
            }
            catch (Exception error)
            {
                UntrackVolume(active, item);
                item.Dispose();
                RecordError($"Alternativa de pausa de {item.ProcessName}: {error.GetType().Name}");
            }
        }
    }

    private async Task PauseMediaSessionsAsync(ActiveControlSession active, HashSet<string> pausedAppKeys, HashSet<string>? onlyApps = null, bool fallbackUsed = false, HashSet<string>? notReadyVolumeApps = null)
    {
        try
        {
            var manager = await GlobalSystemMediaTransportControlsSessionManager.RequestAsync();
            foreach (var session in manager.GetSessions())
            {
                try
                {
                    var appId = session.SourceAppUserModelId ?? "";
                    var appKeys = MediaIdentityKeys(appId, active.Settings);
                    var playerSettings = ResolveForMediaId(active.Settings, appId);
                    if (!ShouldManageApp(appId, active.Settings) || !IsPlaying(session)) continue;
                    if (onlyApps is null && playerSettings.Mode != "pause") continue;
                    if (onlyApps is not null && playerSettings.Mode != "duck") continue;
                    if (onlyApps is not null && !appKeys.Any(onlyApps.Contains)) continue;
                    if (notReadyVolumeApps is not null && appKeys.Any(notReadyVolumeApps.Contains)) continue;
                    if (appKeys.Any(pausedAppKeys.Contains)) continue;
                    var tracked = new TrackedMediaSession(session, appId, QueueSavePending, fallbackUsed);
                    session.PlaybackInfoChanged += tracked.OnPlaybackInfoChanged;
                    if (!await session.TryPauseAsync())
                    {
                        session.PlaybackInfoChanged -= tracked.OnPlaybackInfoChanged;
                        continue;
                    }
                    tracked.PauseOwned = true;
                    tracked.ConfirmPaused(IsPaused(session));
                    active.Media.Add(tracked);
                    foreach (var key in appKeys) pausedAppKeys.Add(key);
                    SavePendingLocked();
                }
                catch (Exception error) { RecordError($"Sesión multimedia no controlable: {error.GetType().Name}"); }
            }
        }
        catch (Exception error) { RecordError($"Windows Media Control: {error.GetType().Name}"); }
    }

    private async Task<HashSet<string>> DuckFallbackSessions(ActiveControlSession active, HashSet<string> pausedAppKeys)
    {
        var failedApps = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var enumerationStarted = Stopwatch.GetTimestamp();
        var candidates = EnumerateActiveVolumeSessions(active.Settings, failedApps).ToArray();
        active.WasapiEnumerationMs += Stopwatch.GetElapsedTime(enumerationStarted).TotalMilliseconds;
        foreach (var candidate in candidates)
        {
            var original = 0f;
            var volumeRead = false;
            TrackedVolumeSession? tracked = null;
            try
            {
                var appKey = ProcessIdentityKey(candidate.ExecutablePath, candidate.ProcessName);
                if (pausedAppKeys.Contains(appKey))
                {
                    candidate.Dispose();
                    continue;
                }
                var playerSettings = ResolveForProcess(active.Settings, candidate.ExecutablePath, candidate.ProcessName);
                if (playerSettings.Mode != "duck")
                {
                    candidate.Dispose();
                    continue;
                }
                original = candidate.Volume.Volume;
                volumeRead = true;
                if (original <= 0.001f)
                {
                    candidate.Dispose();
                    continue;
                }
                var applied = VolumeMath.Apply(original, playerSettings.TargetVolumePercent);
                tracked = new TrackedVolumeSession(candidate.Control, candidate.Volume, candidate.SessionKey, candidate.ProcessName, candidate.ExecutablePath, original, original, playerSettings);
                TrackVolume(active, tracked);
                candidate.TransferOwnership();
                if (active.FirstEffectiveVolumeChangeAt is null)
                {
                    active.FirstVolumeBefore = original;
                    active.FadeOutTargetVolume = applied;
                }
                var saveStarted = Stopwatch.GetTimestamp();
                SavePendingLocked();
                if (active.FirstEffectiveVolumeChangeAt is null) active.RecoverySaveBeforeFadeMs += Stopwatch.GetElapsedTime(saveStarted).TotalMilliseconds;
                await FadeVolumeAsync(tracked, applied, playerSettings.FadeOutMs, immediate: false, diagnostics: active, fadeOut: true);
                var actual = tracked.Volume.Volume;
                if (!float.IsFinite(actual) || Math.Abs(actual - applied) > 0.015f) throw new InvalidOperationException("El control de sesión no aceptó el volumen solicitado.");
                tracked.AppliedVolume = actual;
                tracked.Attenuated = actual < tracked.OriginalVolume - 0.005f;
                SavePendingLocked();
            }
            catch (Exception error)
            {
                try { if (original > 0f) candidate.Volume.Volume = original; } catch { }
                if (!volumeRead || original > 0.001f) failedApps.Add(ProcessIdentityKey(candidate.ExecutablePath, candidate.ProcessName));
                if (tracked is not null) { UntrackVolume(active, tracked); tracked.Dispose(); }
                candidate.Dispose();
                RecordError($"Ducking de {candidate.ProcessName}: {error.GetType().Name}");
            }
        }
        return failedApps;
    }

    private IEnumerable<VolumeCandidate> EnumerateActiveVolumeSessions(AgentSettings settings, HashSet<string> failedApps)
    {
        var result = new List<VolumeCandidate>();
        try
        {
            using var enumerator = new MMDeviceEnumerator();
            using var endpoints = enumerator.EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active);
            foreach (var endpoint in endpoints)
            {
                using (endpoint)
                using (var sessions = endpoint.AudioSessionManager.Sessions)
                {
                    for (var index = 0; index < sessions.Count; index++)
                    {
                        AudioSessionControl? control = null;
                        SimpleAudioVolume? volume = null;
                        var processName = "";
                        try
                        {
                            control = sessions[index];
                            if (control.State != AudioSessionState.AudioSessionStateActive || control.IsSystemSoundsSession) { control.Dispose(); continue; }
                            var processId = control.GetProcessID;
                            if (processId == 0) { control.Dispose(); continue; }
                            string executablePath;
                            try { (processName, executablePath) = ReadProcessIdentity(processId); }
                            catch { control.Dispose(); continue; }
                            if (!ShouldManageProcess(executablePath, processName, settings)) { control.Dispose(); continue; }
                            var key = Hash(control.GetSessionInstanceIdentifier);
                            volume = control.SimpleAudioVolume;
                            result.Add(new VolumeCandidate(control, volume, key, processName, executablePath));
                            control = null;
                            volume = null;
                        }
                        catch (Exception error)
                        {
                            volume?.Dispose();
                            control?.Dispose();
                            if (processName.Length > 0 && ShouldManageProcess("", processName, settings))
                            {
                                failedApps.Add(ProcessIdentityKey("", processName));
                                RecordError($"Enumerar sesión WASAPI de {processName}: {error.GetType().Name}");
                            }
                        }
                    }
                }
            }
        }
        catch (Exception error) { RecordError($"Enumeración WASAPI: {error.GetType().Name}"); }
        return result;
    }

    private void TrackVolume(ActiveControlSession active, TrackedVolumeSession item)
    {
        lock (_volumeSync) active.Volumes.Add(item);
    }

    private void UntrackVolume(ActiveControlSession active, TrackedVolumeSession item)
    {
        lock (_volumeSync) active.Volumes.Remove(item);
    }

    private TrackedVolumeSession[] VolumeSnapshot(ActiveControlSession active)
    {
        lock (_volumeSync) return active.Volumes.ToArray();
    }

    private void ClearVolumes(ActiveControlSession active)
    {
        lock (_volumeSync) active.Volumes.Clear();
    }

    private static AgentSettings ResolveForProcess(AgentSettings settings, string executablePath, string processName)
    {
        if (AppIdentity.IsSpotifyExecutable(executablePath) || string.Equals(processName, "Spotify", StringComparison.OrdinalIgnoreCase))
            return settings.ForPlayerRule("spotifyDesktop");
        var path = AppIdentity.NormalizeExecutablePath(executablePath);
        return path.Length > 0 ? settings.ForPlayerRule($"app:{path.ToLowerInvariant()}") : settings;
    }

    private static AgentSettings ResolveForMediaId(AgentSettings settings, string appId)
    {
        if (AppIdentity.IsSpotifyMediaId(appId)) return settings.ForPlayerRule("spotifyDesktop");
        var selection = settings.WindowsApps.FirstOrDefault(app => app.AppUserModelIds.Any(id => string.Equals(id, appId, StringComparison.OrdinalIgnoreCase)));
        var path = AppIdentity.NormalizeExecutablePath(selection?.Path);
        return path.Length > 0
            ? settings.ForPlayerRule($"app:{path.ToLowerInvariant()}")
            : settings.ForPlayerRule($"appId:{appId.Trim().ToLowerInvariant()}");
    }

    private static bool ShouldManageApp(string appId, AgentSettings settings) => AppIdentity.ShouldManageMediaId(
        appId, settings.SpotifyDesktop, settings.WindowsApps.Where(app => app.Enabled).SelectMany(app => app.AppUserModelIds));

    private static bool ShouldManageProcess(string executablePath, string processName, AgentSettings settings) => AppIdentity.ShouldManageProcess(
        executablePath, settings.SpotifyDesktop, settings.WindowsApps.Where(app => app.Enabled).Select(app => app.Path), processName);

    private static string ProcessIdentityKey(string executablePath, string processName)
    {
        if (AppIdentity.IsSpotifyExecutable(executablePath) || string.Equals(processName, "Spotify", StringComparison.OrdinalIgnoreCase)) return "spotify";
        var path = AppIdentity.NormalizeExecutablePath(executablePath);
        return path.Length == 0 ? "" : $"path:{path.ToLowerInvariant()}";
    }

    private static HashSet<string> MediaIdentityKeys(string appId, AgentSettings settings)
    {
        var result = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (AppIdentity.IsSpotifyMediaId(appId)) { result.Add("spotify"); return result; }
        result.Add($"aumid:{appId.Trim()}");
        foreach (var selection in settings.WindowsApps.Where(app => app.Enabled && app.AppUserModelIds.Any(id => string.Equals(id, appId, StringComparison.OrdinalIgnoreCase))))
        {
            var pathKey = ProcessIdentityKey(selection.Path, AppIdentity.ExecutableName(selection.Path));
            if (pathKey.Length > 0) result.Add(pathKey);
        }
        return result;
    }

    private static (string ProcessName, string ExecutablePath) ReadProcessIdentity(uint processId)
    {
        using var process = Process.GetProcessById((int)processId);
        var processName = process.ProcessName;
        var path = "";
        try { path = process.MainModule?.FileName ?? ""; } catch { /* Cross-process path access can be denied. */ }
        return (processName, AppIdentity.NormalizeExecutablePath(path));
    }

    private static HashSet<string> IdentityForProcess(string executablePath, string processName) =>
        new([ProcessIdentityKey(executablePath, processName)], StringComparer.OrdinalIgnoreCase);

    private static bool IsPlaying(GlobalSystemMediaTransportControlsSession session) =>
        session.GetPlaybackInfo()?.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing;
    private static bool IsPaused(GlobalSystemMediaTransportControlsSession session) =>
        session.GetPlaybackInfo()?.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Paused;

    private static async Task<bool> IsPlaybackStateAsync(string appId, GlobalSystemMediaTransportControlsSessionPlaybackStatus wanted)
    {
        try
        {
            var manager = await GlobalSystemMediaTransportControlsSessionManager.RequestAsync();
            return manager.GetSessions().Any(session =>
                string.Equals(session.SourceAppUserModelId, appId, StringComparison.OrdinalIgnoreCase) &&
                session.GetPlaybackInfo()?.PlaybackStatus == wanted);
        }
        catch { return false; }
    }

    private static async Task<bool> WaitForPlaybackStateAsync(string appId, GlobalSystemMediaTransportControlsSessionPlaybackStatus wanted, TimeSpan timeout)
    {
        var until = Stopwatch.GetTimestamp() + (long)(timeout.TotalSeconds * Stopwatch.Frequency);
        while (Stopwatch.GetTimestamp() < until)
        {
            if (await IsPlaybackStateAsync(appId, wanted)) return true;
            await Task.Delay(20);
        }
        return await IsPlaybackStateAsync(appId, wanted);
    }

    private async Task<int> RestoreLocked(string reason, bool immediateVolumeRestore = false)
    {
        var active = _active;
        if (active is null) return 0;
        var mediaJobs = active.Media.Select(async item =>
        {
            try
            {
                item.Session.PlaybackInfoChanged -= item.OnPlaybackInfoChanged;
                if (!item.PauseOwned || item.ManualOverride) return (Restored: false, NeedsRecovery: false);
                GlobalSystemMediaTransportControlsSession? session = item.Session;
                var playbackState = session.GetPlaybackInfo()?.PlaybackStatus;
                if (playbackState != GlobalSystemMediaTransportControlsSessionPlaybackStatus.Paused)
                {
                    var manager = await GlobalSystemMediaTransportControlsSessionManager.RequestAsync();
                    session = manager.GetSessions().FirstOrDefault(candidate =>
                        string.Equals(candidate.SourceAppUserModelId, item.AppId, StringComparison.OrdinalIgnoreCase));
                    playbackState = session?.GetPlaybackInfo()?.PlaybackStatus;
                }
                if (playbackState == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing) return (Restored: true, NeedsRecovery: false);
                if (playbackState != GlobalSystemMediaTransportControlsSessionPlaybackStatus.Paused)
                {
                    _log($"no se reanudó {item.AppId}: estado={playbackState?.ToString() ?? "desconocido"}; manual={item.ManualOverride}");
                    return (Restored: false, NeedsRecovery: !item.ManualOverride);
                }
                if (session is not null && await session.TryPlayAsync() &&
                    await WaitForPlaybackStateAsync(item.AppId, GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing, TimeSpan.FromSeconds(2))) return (Restored: true, NeedsRecovery: false);
                _log($"Windows no confirmó Playing para {item.AppId}; el volumen se mantiene en silencio.");
                return (Restored: false, NeedsRecovery: !item.ManualOverride);
            }
            catch (Exception error) { RecordError($"Restaurar {item.AppId}: {error.GetType().Name}"); return (Restored: false, NeedsRecovery: item.PauseOwned && !item.ManualOverride); }
        }).ToArray();
        var mediaResults = await Task.WhenAll(mediaJobs);
        var restoredMedia = mediaResults.Count(result => result.Restored);
        var restored = restoredMedia;
        var keepPending = mediaResults.Any(result => result.NeedsRecovery);
        foreach (var item in VolumeSnapshot(active))
        {
            try
            {
                var current = item.Volume.Volume;
                var relatedMedia = active.Media.FirstOrDefault(media => AppIdentity.MediaIdMatchesExecutable(media.AppId, item.ExecutablePath));
                if (relatedMedia is not null && !await IsPlaybackStateAsync(relatedMedia.AppId, GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing))
                {
                    item.AppliedVolume = current;
                    keepPending = true;
                    _log($"volumen de {item.ProcessName} sigue en silencio hasta confirmar Playing.");
                    continue;
                }
                if (Math.Abs(current - item.AppliedVolume) < 0.015f)
                {
                    if (await FadeVolumeAsync(item, item.OriginalVolume, immediateVolumeRestore ? 0 : item.Settings.FadeInMs,
                        immediate: immediateVolumeRestore, restoring: true, diagnostics: active)) restored++;
                }
            }
            catch (Exception error) { keepPending = true; RecordError($"Restaurar {item.ProcessName}: {error.GetType().Name}"); }
            finally { item.Dispose(); }
        }
        if (keepPending) _lastRestoreDurable = SavePendingLocked();
        active.Media.Clear();
        ClearVolumes(active);
        _active = null;
        if (!keepPending) { DeletePending(); _lastRestoreDurable = !File.Exists(_statePath); }
        else _log("la recuperación de volumen permanece pendiente hasta reanudar Spotify.");
        _log($"sesión restaurada ({reason}); cambios recuperados: {restored}");
        return restored;
    }

    private async Task<int> RestorePendingLocked(string? sessionId)
    {
        var restored = 0;
        var pending = LoadPending();
        if (pending is null) { _lastRestoreDurable = !File.Exists(_statePath); return restored; }
        if (sessionId is not null && pending.SessionId != sessionId) { _lastRestoreDurable = true; return restored; }
        if (DateTimeOffset.UtcNow - pending.SavedAt > RecoveryWindow)
        {
            DeletePending();
            _lastRestoreDurable = !File.Exists(_statePath);
            return restored;
        }

        var audioRestored = 0;
        var keepPending = false;
        try
        {
            var manager = await GlobalSystemMediaTransportControlsSessionManager.RequestAsync();
            foreach (var entry in pending.Media.Where(entry => !entry.ManualOverride && entry.WasPlaying))
            {
                var match = manager.GetSessions().FirstOrDefault(session =>
                    string.Equals(session.SourceAppUserModelId, entry.AppId, StringComparison.OrdinalIgnoreCase) && IsPaused(session));
                if (match is not null)
                {
                    var started = await match.TryPlayAsync();
                    if (started && await WaitForPlaybackStateAsync(entry.AppId, GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing, TimeSpan.FromSeconds(2))) audioRestored++;
                    else keepPending = true;
                }
                else keepPending = true;
            }
        }
        catch (Exception error) { keepPending = true; RecordError($"Recuperación GSMTC: {error.GetType().Name}"); }

        foreach (var candidate in EnumerateAllVolumeSessions())
        {
            try
            {
                var entry = pending.Volumes.FirstOrDefault(item => item.SessionKey == candidate.SessionKey &&
                    (string.IsNullOrEmpty(item.ExecutablePath)
                        ? string.Equals(item.ProcessName, candidate.ProcessName, StringComparison.OrdinalIgnoreCase)
                        : string.Equals(item.ExecutablePath, candidate.ExecutablePath, StringComparison.OrdinalIgnoreCase)));
                if (entry is not null && Math.Abs(candidate.Volume.Volume - entry.AppliedVolume) < 0.005f)
                {
                    var media = pending.Media.FirstOrDefault(item => AppIdentity.MediaIdMatchesExecutable(item.AppId, candidate.ExecutablePath));
                    if (media is not null && !await IsPlaybackStateAsync(media.AppId, GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing))
                    {
                        keepPending = true;
                        continue;
                    }
                    candidate.Volume.Volume = entry.OriginalVolume;
                    audioRestored++;
                }
            }
            catch (Exception error) { RecordError($"Recuperación WASAPI: {error.GetType().Name}"); }
            finally { candidate.Dispose(); }
        }
        if (!keepPending) { DeletePending(); _lastRestoreDurable = !File.Exists(_statePath); }
        else _lastRestoreDurable = WritePendingState(pending);
        _log(keepPending
            ? $"recuperación del estado pendiente; cambios recuperados: {audioRestored}; la restauración de volumen sigue aplazada hasta Playing."
            : $"recuperación del estado pendiente; cambios recuperados: {audioRestored}");
        return restored + audioRestored;
    }

    private async Task<bool> FadeVolumeAsync(TrackedVolumeSession item, float target, int durationMs, bool immediate,
        bool restoring = false, ActiveControlSession? diagnostics = null, bool fadeOut = false)
    {
        if (!immediate && durationMs > 0)
        {
            var minimum = item.Settings.Mode == "pause" && !item.PauseAsDucking
                ? MinimumPauseWasapiFadeMs
                : MinimumDuckingWasapiFadeMs;
            durationMs = Math.Max(durationMs, minimum);
        }
        target = Math.Clamp(float.IsFinite(target) ? target : item.OriginalVolume, 0f, 1f);
        var start = item.Volume.Volume;
        var lastWritten = start;
        var fadeStarted = Stopwatch.GetTimestamp();
        if (immediate || durationMs <= 0)
        {
            item.Volume.Volume = target;
            item.AppliedVolume = item.Volume.Volume;
            item.Attenuated = item.AppliedVolume < item.OriginalVolume - 0.005f;
            if (fadeOut && diagnostics is not null)
            {
                diagnostics.FadeOutWriteCount++;
                diagnostics.MaxFadeOutStep = Math.Max(diagnostics.MaxFadeOutStep, Math.Abs(target - start));
                RecordFirstEffectiveChange(diagnostics, start, item.Volume.Volume);
                diagnostics.FadeOutCompletedAt = Stopwatch.GetTimestamp();
                diagnostics.FadeOutDurationMs = Stopwatch.GetElapsedTime(fadeStarted, diagnostics.FadeOutCompletedAt.Value).TotalMilliseconds;
            }
            SavePendingLocked();
            return true;
        }

        var started = Stopwatch.GetTimestamp();
        var lastSave = started;
        var hasWritten = false;
        while (true)
        {
            var current = hasWritten ? item.Volume.Volume : start;
            if (Math.Abs(current - lastWritten) > 0.015f)
            {
                item.OriginalVolume = current;
                item.ManualOverride = true;
                if (restoring)
                {
                    item.AppliedVolume = current;
                    item.Attenuated = false;
                    SavePendingLocked();
                    return false;
                }
                start = current;
                lastWritten = current;
                target = item.Settings.Mode == "pause" && !item.PauseAsDucking
                    ? 0f
                    : VolumeMath.Apply(current, item.Settings.TargetVolumePercent);
                started = Stopwatch.GetTimestamp();
            }
            var elapsedMs = Stopwatch.GetElapsedTime(started).TotalMilliseconds;
            var progress = Math.Clamp(elapsedMs / durationMs, 0d, 1d);
            // Pace WASAPI writes so providers cannot turn the fade into an
            // unbounded burst of volume changes. Elapsed-time interpolation keeps
            // the requested duration stable when a provider write itself blocks.
            var value = (float)(start + (target - start) * progress);
            if (progress >= 1d) value = target;
            var step = Math.Abs(value - lastWritten);
            item.Volume.Volume = value;
            item.AppliedVolume = value;
            item.Attenuated = value < item.OriginalVolume - 0.005f;
            if (fadeOut && diagnostics is not null)
            {
                diagnostics.FadeOutWriteCount++;
                diagnostics.MaxFadeOutStep = Math.Max(diagnostics.MaxFadeOutStep, step);
                if (diagnostics.FirstEffectiveVolumeChangeAt is null) RecordFirstEffectiveChange(diagnostics, start, item.Volume.Volume);
                if (progress >= 1d)
                {
                    diagnostics.FadeOutCompletedAt = Stopwatch.GetTimestamp();
                    diagnostics.FadeOutDurationMs = Stopwatch.GetElapsedTime(fadeStarted, diagnostics.FadeOutCompletedAt.Value).TotalMilliseconds;
                }
            }
            lastWritten = value;
            hasWritten = true;
            if (Stopwatch.GetElapsedTime(lastSave).TotalMilliseconds >= 64)
            {
                lastSave = Stopwatch.GetTimestamp();
                QueueSavePendingLocked();
            }
            if (progress >= 1d) break;
            await Task.Delay(WasapiFadeUpdateIntervalMs);
        }
        var actual = item.Volume.Volume;
        if (!float.IsFinite(actual)) throw new InvalidOperationException("El volumen WASAPI no es finito.");
        if (Math.Abs(actual - target) > 0.015f)
        {
            if (restoring)
            {
                item.OriginalVolume = actual;
                item.AppliedVolume = actual;
                item.Attenuated = false;
                item.ManualOverride = true;
                SavePendingLocked();
                return false;
            }
            throw new InvalidOperationException("El volumen WASAPI no alcanzó el nivel solicitado.");
        }
        item.AppliedVolume = actual;
        item.Attenuated = actual < item.OriginalVolume - 0.005f;
        SavePendingLocked();
        return true;
    }

    private static void RecordFirstEffectiveChange(ActiveControlSession diagnostics, float before, float after)
    {
        if (diagnostics.FirstEffectiveVolumeChangeAt is not null || !float.IsFinite(after) || Math.Abs(after - before) < 0.0001f) return;
        diagnostics.FirstEffectiveVolumeChangeAt = Stopwatch.GetTimestamp();
        diagnostics.FirstVolumeBefore = before;
        diagnostics.FirstVolumeAfter = after;
    }

    private static IEnumerable<VolumeCandidate> EnumerateAllVolumeSessions()
    {
        var result = new List<VolumeCandidate>();
        try
        {
            using var enumerator = new MMDeviceEnumerator();
            using var endpoints = enumerator.EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active);
            foreach (var endpoint in endpoints)
            {
                using (endpoint)
                using (var sessions = endpoint.AudioSessionManager.Sessions)
                {
                    for (var index = 0; index < sessions.Count; index++)
                    {
                        AudioSessionControl? control = null;
                        SimpleAudioVolume? volume = null;
                        try
                        {
                            control = sessions[index];
                            if (control.State != AudioSessionState.AudioSessionStateActive || control.IsSystemSoundsSession) { control.Dispose(); continue; }
                            var processId = control.GetProcessID;
                            if (processId == 0) { control.Dispose(); continue; }
                            string processName;
                            string executablePath;
                            try { (processName, executablePath) = ReadProcessIdentity(processId); }
                            catch { control.Dispose(); continue; }
                            volume = control.SimpleAudioVolume;
                            result.Add(new VolumeCandidate(control, volume, Hash(control.GetSessionInstanceIdentifier), processName, executablePath));
                            control = null;
                            volume = null;
                        }
                        catch { volume?.Dispose(); control?.Dispose(); }
                    }
                }
            }
        }
        catch { }
        return result;
    }

    private async Task MonitorAsync()
    {
        while (true)
        {
            await Task.Delay(500);
            if (_active is null)
            {
                continue;
            }
            if (!await _gate.WaitAsync(0)) continue;
            try
            {
                var active = _active;
                if (active is null) continue;
                var last = new DateTime(Interlocked.Read(ref _lastHeartbeatUtcTicks), DateTimeKind.Utc);
                if (DateTime.UtcNow - last > HeartbeatTimeout)
                {
                    await RestoreLocked("heartbeat-expired");
                    continue;
                }
                foreach (var item in VolumeSnapshot(active))
                {
                    try
                    {
                        var current = item.Volume.Volume;
                        if (Math.Abs(current - item.AppliedVolume) < 0.005f) continue;
                        item.OriginalVolume = current;
                        item.ManualOverride = true;
                        if (item.Settings.Mode == "pause" && !item.PauseAsDucking)
                        {
                            item.AppliedVolume = current;
                            item.Attenuated = false;
                            SavePendingLocked();
                            continue;
                        }
                        await FadeVolumeAsync(item, VolumeMath.Apply(current, item.Settings.TargetVolumePercent), 100, immediate: false);
                        SavePendingLocked();
                    }
                    catch { /* The audio session may have ended or its device may have changed. */ }
                }
            }
            catch (Exception error) { RecordError($"Supervisión de sesiones: {error.GetType().Name}"); }
            finally { _gate.Release(); }
        }
    }

    private bool SavePendingLocked()
    {
        var active = _active;
        if (active is null || (active.Media.Count == 0 && VolumeSnapshot(active).Length == 0)) { DeletePending(); return !File.Exists(_statePath); }
        var state = CreatePendingState(active);
        var revision = Interlocked.Increment(ref _pendingRevision);
        lock (_pendingFileSync)
        {
            if (revision == Interlocked.Read(ref _pendingRevision)) return WritePendingState(state);
            return File.Exists(_statePath);
        }
    }

    private void QueueSavePendingLocked()
    {
        var active = _active;
        if (active is null || (active.Media.Count == 0 && VolumeSnapshot(active).Length == 0)) return;
        var state = CreatePendingState(active);
        var revision = Interlocked.Increment(ref _pendingRevision);
        _ = Task.Run(() =>
        {
            lock (_pendingFileSync)
            {
                if (revision != Interlocked.Read(ref _pendingRevision)) return;
                try { WritePendingState(state); }
                catch (Exception error) { RecordError($"No se pudo guardar la recuperación local: {error.GetType().Name}"); }
            }
        });
    }

    private PendingState CreatePendingState(ActiveControlSession active) => new(active.SessionId, DateTimeOffset.UtcNow,
        active.Media.Select(item => new PendingMedia(item.AppId, item.PauseOwned, item.ManualOverride)).ToArray(),
        VolumeSnapshot(active).Select(item => new PendingVolume(item.SessionKey, item.ProcessName, item.OriginalVolume, item.AppliedVolume, item.ManualOverride) { ExecutablePath = item.ExecutablePath }).ToArray());

    private bool WritePendingState(PendingState state)
    {
        try
        {
            var temp = _statePath + ".tmp";
            File.WriteAllText(temp, JsonSerializer.Serialize(state));
            File.Move(temp, _statePath, overwrite: true);
            return true;
        }
        catch (Exception error) { RecordError($"No se pudo guardar la recuperación local: {error.GetType().Name}"); return false; }
    }

    private void QueueSavePending() => _ = SavePendingAsync();

    private async Task SavePendingAsync()
    {
        await _gate.WaitAsync();
        try { SavePendingLocked(); }
        catch (Exception error) { RecordError($"Guardado de recuperación: {error.GetType().Name}"); }
        finally { _gate.Release(); }
    }

    private PendingState? LoadPending()
    {
        try { return JsonSerializer.Deserialize<PendingState>(File.ReadAllText(_statePath)); }
        catch (FileNotFoundException) { return null; }
        catch (DirectoryNotFoundException) { return null; }
        catch (Exception error) { RecordError($"Estado de recuperación no válido: {error.GetType().Name}"); DeletePending(); return null; }
    }

    private void DeletePending()
    {
        var revision = Interlocked.Increment(ref _pendingRevision);
        lock (_pendingFileSync)
        {
            if (revision != Interlocked.Read(ref _pendingRevision)) return;
            try { if (File.Exists(_statePath)) File.Delete(_statePath); } catch { }
        }
    }

    private string[] GetErrors() { lock (_errors) return _errors.ToArray(); }

    private void RecordError(string value)
    {
        var message = value.Replace('\r', ' ').Replace('\n', ' ').Slice(0, 180);
        lock (_errors)
        {
            _errors.Add(message);
            if (_errors.Count > 8) _errors.RemoveAt(0);
        }
        _log(message);
    }

    private static string Hash(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));

    private sealed class ActiveControlSession(string sessionId, AgentSettings settings, DateTimeOffset startedAt,
        long requestReceivedAt, long beginStartedAt, long gateAcquiredAt)
    {
        public string SessionId { get; } = sessionId;
        public AgentSettings Settings { get; } = settings;
        public DateTimeOffset StartedAt { get; } = startedAt;
        public long RequestReceivedAt { get; } = requestReceivedAt;
        public long BeginStartedAt { get; } = beginStartedAt;
        public long GateAcquiredAt { get; } = gateAcquiredAt;
        public double PriorRestoreMs { get; set; }
        public double WasapiEnumerationMs { get; set; }
        public double RecoverySaveBeforeFadeMs { get; set; }
        public long? FirstEffectiveVolumeChangeAt { get; set; }
        public float? FirstVolumeBefore { get; set; }
        public float? FirstVolumeAfter { get; set; }
        public float FadeOutTargetVolume { get; set; }
        public double FadeOutDurationMs { get; set; }
        public long? FadeOutCompletedAt { get; set; }
        public int FadeOutWriteCount { get; set; }
        public double MaxFadeOutStep { get; set; }
        public List<TrackedMediaSession> Media { get; } = [];
        public List<TrackedVolumeSession> Volumes { get; } = [];
        public int UnsupportedCount { get; set; }
    }

    private sealed class TrackedMediaSession
    {
        private readonly Action _onManualChange;
        public GlobalSystemMediaTransportControlsSession Session { get; }
        public string AppId { get; }
        public volatile bool PauseOwned;
        public volatile bool ManualOverride;
        private volatile bool _pauseConfirmed;
        public bool FallbackUsed { get; }
        public TypedEventHandler<GlobalSystemMediaTransportControlsSession, PlaybackInfoChangedEventArgs> OnPlaybackInfoChanged { get; }

        public TrackedMediaSession(GlobalSystemMediaTransportControlsSession session, string appId, Action onManualChange, bool fallbackUsed)
        {
            Session = session;
            AppId = appId;
            _onManualChange = onManualChange;
            FallbackUsed = fallbackUsed;
            OnPlaybackInfoChanged = HandlePlaybackChanged;
        }

        private void HandlePlaybackChanged(GlobalSystemMediaTransportControlsSession sender, PlaybackInfoChangedEventArgs args)
        {
            if (!PauseOwned || ManualOverride) return;
            var state = sender.GetPlaybackInfo()?.PlaybackStatus;
            if (state == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Paused)
            {
                _pauseConfirmed = true;
                return;
            }
            if (state != GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing || !_pauseConfirmed) return;
            ManualOverride = true;
            _onManualChange();
        }

        public void ConfirmPaused(bool paused)
        {
            if (paused) _pauseConfirmed = true;
        }
    }

    private sealed class TrackedVolumeSession(AudioSessionControl control, SimpleAudioVolume volume, string sessionKey, string processName, string executablePath, float original, float applied, AgentSettings settings) : IDisposable
    {
        public AudioSessionControl Control { get; } = control;
        public SimpleAudioVolume Volume { get; } = volume;
        public string SessionKey { get; } = sessionKey;
        public string ProcessName { get; } = processName;
        public string ExecutablePath { get; } = executablePath;
        public float OriginalVolume { get; set; } = original;
        public float AppliedVolume { get; set; } = applied;
        public AgentSettings Settings { get; } = settings;
        public bool Attenuated { get; set; } = applied < original - 0.005f;
        public bool ManualOverride { get; set; }
        public bool PauseAsDucking { get; set; }
        public void Dispose() { Volume.Dispose(); Control.Dispose(); }
    }

    private sealed class VolumeCandidate(AudioSessionControl control, SimpleAudioVolume volume, string sessionKey, string processName, string executablePath) : IDisposable
    {
        private bool _transferred;
        public AudioSessionControl Control { get; } = control;
        public SimpleAudioVolume Volume { get; } = volume;
        public string SessionKey { get; } = sessionKey;
        public string ProcessName { get; } = processName;
        public string ExecutablePath { get; } = executablePath;
        public void TransferOwnership() => _transferred = true;
        public void Dispose() { if (!_transferred) { Volume.Dispose(); Control.Dispose(); } }
    }

    private sealed class DetectedApplication(string name, string path)
    {
        public string Name { get; } = name;
        public string Path { get; } = path;
        public string Executable => Path.Length > 0 ? System.IO.Path.GetFileName(Path) : Name;
        public string AppUserModelId { get; set; } = "";
        public string MediaStatus { get; set; } = "Sin sesión multimedia";
        public int VolumeSessions { get; set; }
        public bool PauseAvailable { get; set; }
        public bool DuckingAvailable { get; set; } = true;
    }

    private sealed record PendingState(string SessionId, DateTimeOffset SavedAt, PendingMedia[] Media, PendingVolume[] Volumes);
    private sealed record PendingMedia(string AppId, bool WasPlaying, bool ManualOverride);
    private sealed record PendingVolume(string SessionKey, string ProcessName, float OriginalVolume, float AppliedVolume, bool ManualOverride)
    {
        public string ExecutablePath { get; init; } = "";
    }
}

internal static class StringExtensions
{
    public static string Slice(this string value, int start, int length) => value.Length <= length ? value : value[..length];
}
