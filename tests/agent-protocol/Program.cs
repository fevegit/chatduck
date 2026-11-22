internal static class AgentProtocolTests
{
    private static int Main()
    {
        var key = Convert.ToHexString(new byte[32]);
        const string message = "req\nPOST\n/v1/command\n1730000000\nnonce\n{\"command\":\"status\"}";
        var signature = AgentProtocol.Sign(key, message);
        if (!AgentProtocol.Verify(key, message, signature)) throw new Exception("Valid HMAC was rejected.");
        if (AgentProtocol.Verify(key, message + "x", signature)) throw new Exception("Modified request was accepted.");
        if (AgentProtocol.Verify(new string('f', 64), message, signature)) throw new Exception("Wrong key was accepted.");
        if (AgentProtocol.Verify("invalid", message, signature)) throw new Exception("Malformed key was accepted.");
        Console.WriteLine("Agent HMAC checks passed.");
        return 0;
    }
}
