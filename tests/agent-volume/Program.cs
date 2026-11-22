using System.Globalization;

var cases = new (string Name, float Actual, float Expected)[]
{
    ("fixed 80% to 10%", VolumeMath.Apply(.8f, 10), .1f),
    ("fixed keeps volume below target", VolumeMath.Apply(.05f, 10), .05f),
    ("fixed zero target", VolumeMath.Apply(.8f, 0), 0f),
    ("fixed 100% keeps original", VolumeMath.Apply(.8f, 100), .8f),
    ("invalid original is safe", VolumeMath.Apply(float.NaN, 10), 0f)
};

foreach (var item in cases)
{
    if (!float.IsFinite(item.Actual) || Math.Abs(item.Actual - item.Expected) > .00001f)
        throw new InvalidOperationException($"{item.Name}: expected {item.Expected.ToString(CultureInfo.InvariantCulture)}, got {item.Actual.ToString(CultureInfo.InvariantCulture)}");
    Console.WriteLine($"PASS {item.Name}");
}

void Check(bool passed, string name)
{
    if (!passed) throw new InvalidOperationException(name);
    Console.WriteLine($"PASS {name}");
}

var playerPath = @"C:\Program Files\Player\player.exe";
Check(AppIdentity.NormalizeExecutablePath(playerPath).Equals(playerPath, StringComparison.OrdinalIgnoreCase), "normalizes absolute executable path");
Check(AppIdentity.NormalizeExecutablePath(@"player.exe") == "", "rejects a relative executable path");
Check(AppIdentity.NormalizeExecutablePath(@"\\server\share\player.exe") == "", "rejects a network executable path");
Check(AppIdentity.ShouldManageProcess(playerPath, false, [playerPath]), "selects the same installed executable on later runs");
Check(!AppIdentity.ShouldManageProcess(@"C:\Program Files\PlayerHelper\player.exe", false, [playerPath]), "does not match a similar but different path");
Check(!AppIdentity.ShouldManageProcess(@"C:\Program Files\Mozilla Firefox\firefox.exe", false, [@"C:\Program Files\Mozilla Firefox\firefox.exe"]), "protects browser audio even if selected");
Check(AppIdentity.ShouldManageProcess(@"C:\TestFixture\Spotify\Spotify.exe", true, []), "keeps Spotify selection independent");
Check(!AppIdentity.ShouldManageProcess(@"C:\TestFixture\Spotify\Spotify.exe", false, []), "Spotify can be disabled independently");
Check(AppIdentity.ShouldManageMediaId("Player.Package_abcd!Player", false, ["Player.Package_abcd!Player"]), "matches an explicitly selected media app id exactly");
Check(!AppIdentity.ShouldManageMediaId("Player.Package_abcd!PlayerHelper", false, ["Player.Package_abcd!Player"]), "does not partially match media app ids");
Check(AppIdentity.MediaIdMatchesExecutable("player.exe", playerPath), "matches an exact media id to its executable");

var plexPath = @"C:\Program Files\Plex\Plex\Plex.exe";
Check(!AppIdentity.ShouldManageProcess(plexPath, false, []), "does not control Plex before explicit selection");
Check(AppIdentity.ShouldManageProcess(plexPath, false, [plexPath]), "selects only the exact Plex executable");
var inherited = PlayerPolicy.Resolve("duck", 10, new PlayerRule());
Check(inherited.Mode == "duck" && inherited.TargetVolumePercent == 10, "native General inherits global mode and target");
var playerOverride = PlayerPolicy.Resolve("pause", 10, new PlayerRule { Mode = "duck", TargetVolumePercent = 15 });
Check(playerOverride.Mode == "duck" && playerOverride.TargetVolumePercent == 15, "native player rule overrides mode and target");
var modeOnly = PlayerPolicy.Resolve("duck", 10, new PlayerRule { Mode = "pause" });
Check(modeOnly.Mode == "pause" && modeOnly.TargetVolumePercent == 10, "native mode override keeps inherited target");
