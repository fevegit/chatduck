using System.IO;
using System.Text.RegularExpressions;

internal static class AppIdentity
{
    private static readonly HashSet<string> ProtectedExecutables = new(StringComparer.OrdinalIgnoreCase)
    {
        "firefox", "mozilla", "chatgpt", "openai", "chrome", "msedge", "brave", "vivaldi", "opera", "chromium",
        "teams", "skype", "zoom", "discord", "webex", "slack", "whatsapp", "signal", "telegram", "viber",
        "phoneexperience", "yourphone", "windowsalarm", "windowsalarms", "alarms", "shellexperiencehost",
        "notification", "windowscommunicationsapps", "outlook", "thunderbird", "runtimebroker", "system",
        "audiodg", "explorer"
    };

    public static string NormalizeExecutablePath(string? path)
    {
        if (string.IsNullOrWhiteSpace(path) || path.StartsWith("\\\\", StringComparison.Ordinal) || !path.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) ||
            !Regex.IsMatch(path.Trim(), "^[A-Za-z]:[\\\\/]", RegexOptions.CultureInvariant)) return "";
        try
        {
            var full = Path.GetFullPath(path.Trim()).Replace('/', '\\');
            if (!Path.IsPathRooted(full) || !Regex.IsMatch(full, "^[A-Za-z]:\\\\", RegexOptions.CultureInvariant)) return "";
            return full.TrimEnd('\\');
        }
        catch { return ""; }
    }

    public static string ExecutableName(string? path) => Path.GetFileNameWithoutExtension(path ?? "").Trim();

    public static bool IsProtectedExecutable(string? path)
    {
        var name = ExecutableName(path);
        return ProtectedExecutables.Contains(name);
    }

    public static bool IsSpotifyExecutable(string? path) => string.Equals(ExecutableName(path), "Spotify", StringComparison.OrdinalIgnoreCase);

    public static bool IsSpotifyMediaId(string? appId)
    {
        var id = (appId ?? "").Trim().TrimEnd('!');
        if (id.Equals("Spotify", StringComparison.OrdinalIgnoreCase) || id.Equals("Spotify.exe", StringComparison.OrdinalIgnoreCase) || id.Equals("SpotifyAB.SpotifyMusic", StringComparison.OrdinalIgnoreCase)) return true;
        return Regex.IsMatch(id, "^SpotifyAB\\.SpotifyMusic_[A-Za-z0-9._-]+$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
    }

    public static bool IsProtectedMediaId(string? appId)
    {
        var id = (appId ?? "").Trim();
        var name = Path.GetFileNameWithoutExtension(id).TrimEnd('!');
        if (ProtectedExecutables.Contains(name)) return true;
        string[] packagePrefixes = ["microsoft.teams_", "microsoft.skypeapp_", "windowsalarms_", "microsoft.windowsalarms_", "microsoft.windowscommunicationsapps_"];
        return packagePrefixes.Any(prefix => id.StartsWith(prefix, StringComparison.OrdinalIgnoreCase));
    }

    public static bool ShouldManageProcess(string? executablePath, bool spotifyEnabled, IEnumerable<string> selectedPaths, string? processName = null)
    {
        var path = NormalizeExecutablePath(executablePath);
        if (path.Length == 0) return spotifyEnabled && string.Equals(Path.GetFileNameWithoutExtension(processName ?? ""), "Spotify", StringComparison.OrdinalIgnoreCase);
        if (IsProtectedExecutable(path)) return false;
        if (IsSpotifyExecutable(path)) return spotifyEnabled;
        return selectedPaths.Select(NormalizeExecutablePath).Any(selected => selected.Length > 0 && string.Equals(selected, path, StringComparison.OrdinalIgnoreCase));
    }

    public static bool ShouldManageMediaId(string? appId, bool spotifyEnabled, IEnumerable<string> selectedIds)
    {
        if (string.IsNullOrWhiteSpace(appId) || IsProtectedMediaId(appId)) return false;
        if (IsSpotifyMediaId(appId)) return spotifyEnabled;
        return selectedIds.Any(selected => string.Equals(selected?.Trim(), appId.Trim(), StringComparison.OrdinalIgnoreCase));
    }

    public static bool MediaIdMatchesExecutable(string? appId, string? executablePath)
    {
        if (IsSpotifyMediaId(appId) && IsSpotifyExecutable(executablePath)) return true;
        var appName = Path.GetFileNameWithoutExtension((appId ?? "").Trim().TrimEnd('!'));
        return appName.Length > 0 && string.Equals(appName, ExecutableName(executablePath), StringComparison.OrdinalIgnoreCase);
    }
}
