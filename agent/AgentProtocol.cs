using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

internal static class AgentProtocol
{
    public static string Sign(string token, string message)
    {
        using var hmac = new HMACSHA256(Convert.FromHexString(token));
        return Base64Url(hmac.ComputeHash(Encoding.UTF8.GetBytes(message)));
    }

    public static bool Verify(string token, string message, string signature)
    {
        try
        {
            var actual = Encoding.ASCII.GetBytes(Sign(token, message));
            var supplied = Encoding.ASCII.GetBytes(signature);
            return actual.Length == supplied.Length && CryptographicOperations.FixedTimeEquals(actual, supplied);
        }
        catch (FormatException) { return false; }
    }

    public static Task RequestPairingAsync(string token, int port = 48731) => RequestCommandAsync(token, "pair", port);

    public static async Task<JsonDocument> RequestStatusAsync(string token, int port = 48731)
    {
        const string path = "/v1/command";
        const string body = "{\"command\":\"status\"}";
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString(System.Globalization.CultureInfo.InvariantCulture);
        var nonce = Base64Url(RandomNumberGenerator.GetBytes(16));
        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
        using var request = new HttpRequestMessage(HttpMethod.Post, $"http://127.0.0.1:{port}{path}")
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json")
        };
        request.Headers.TryAddWithoutValidation("X-Audio-Ducking-Timestamp", timestamp);
        request.Headers.TryAddWithoutValidation("X-Audio-Ducking-Nonce", nonce);
        request.Headers.TryAddWithoutValidation("X-Audio-Ducking-Signature", Sign(token, $"req\nPOST\n{path}\n{timestamp}\n{nonce}\n{body}"));
        using var response = await client.SendAsync(request);
        var text = await response.Content.ReadAsStringAsync();
        var responseNonce = response.Headers.TryGetValues("X-Audio-Ducking-Response-Nonce", out var nonceValues) ? nonceValues.SingleOrDefault() : null;
        var responseSignature = response.Headers.TryGetValues("X-Audio-Ducking-Response-Signature", out var signatureValues) ? signatureValues.SingleOrDefault() : null;
        if (responseNonce != nonce || responseSignature is null || !Verify(token, $"resp\n{(int)response.StatusCode}\n{nonce}\n{text}", responseSignature))
            throw new InvalidOperationException("No se pudo autenticar el estado del agente activo.");
        if (!response.IsSuccessStatusCode) throw new InvalidOperationException("El agente rechazó la consulta de estado.");
        return JsonDocument.Parse(text);
    }

    public static async Task RequestCommandAsync(string token, string command, int port = 48731)
    {
        const string path = "/v1/command";
        var body = JsonSerializer.Serialize(new { command });
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString(System.Globalization.CultureInfo.InvariantCulture);
        var nonce = Base64Url(RandomNumberGenerator.GetBytes(16));
        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
        using var request = new HttpRequestMessage(HttpMethod.Post, $"http://127.0.0.1:{port}{path}")
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json")
        };
        request.Headers.TryAddWithoutValidation("X-Audio-Ducking-Timestamp", timestamp);
        request.Headers.TryAddWithoutValidation("X-Audio-Ducking-Nonce", nonce);
        request.Headers.TryAddWithoutValidation("X-Audio-Ducking-Signature", Sign(token, $"req\nPOST\n{path}\n{timestamp}\n{nonce}\n{body}"));
        using var response = await client.SendAsync(request);
        var text = await response.Content.ReadAsStringAsync();
        var responseNonce = response.Headers.TryGetValues("X-Audio-Ducking-Response-Nonce", out var nonceValues) ? nonceValues.SingleOrDefault() : null;
        var responseSignature = response.Headers.TryGetValues("X-Audio-Ducking-Response-Signature", out var signatureValues) ? signatureValues.SingleOrDefault() : null;
        if (responseNonce != nonce || responseSignature is null || !Verify(token, $"resp\n{(int)response.StatusCode}\n{nonce}\n{text}", responseSignature))
            throw new InvalidOperationException("No se pudo autenticar la respuesta del agente activo.");
        if (!response.IsSuccessStatusCode) throw new InvalidOperationException("No se pudo iniciar el emparejamiento del agente.");
    }

    public static async Task RequestLegacyShutdownAsync(string token, int port = 48731)
    {
        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
        using var request = new HttpRequestMessage(HttpMethod.Post, $"http://127.0.0.1:{port}/v1/command")
        {
            Content = new StringContent("{\"command\":\"shutdown\"}", Encoding.UTF8, "application/json")
        };
        request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {token}");
        using var response = await client.SendAsync(request);
    }

    private static string Base64Url(byte[] data) => Convert.ToBase64String(data).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
