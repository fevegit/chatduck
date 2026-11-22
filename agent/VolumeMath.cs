public static class VolumeMath
{
    public static float Apply(float original, float targetVolumePercent)
    {
        original = Math.Clamp(float.IsFinite(original) ? original : 0f, 0f, 1f);
        var target = MathF.Min(original, Math.Clamp(float.IsFinite(targetVolumePercent) ? targetVolumePercent : 10f, 0f, 100f) / 100f);
        return Math.Clamp(target, 0f, original);
    }
}
