internal sealed class PlayerRule
{
    public string Mode { get; set; } = "general";
    public int? TargetVolumePercent { get; set; }
}

internal static class PlayerPolicy
{
    public static (string Mode, int TargetVolumePercent) Resolve(string globalMode, int globalTarget, PlayerRule? rule) =>
        (rule?.Mode is "pause" or "duck" ? rule.Mode : globalMode == "duck" ? "duck" : "pause",
            Math.Clamp(rule?.TargetVolumePercent ?? globalTarget, 0, 100));
}
