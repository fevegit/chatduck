using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Security.Principal;
using WixToolset.Dtf.WindowsInstaller;

namespace ChatDuck.InstallerActions;

public enum ProductRegistration
{
    Present,
    Absent,
    AccessDenied,
    Unknown
}

public static class UpgradePropertyFilter
{
    public const string UpgradeActionProperty = "WIX_UPGRADE_DETECTED";
    public const string ConfirmedOrphanProductCode = "{7418F7B0-E537-417D-97CC-C47AF92904B2}";

    public static string Filter(string? detectedCodes, Func<string, ProductRegistration> inspect)
    {
        var codes = detectedCodes ?? string.Empty;
        if (string.IsNullOrWhiteSpace(codes)) return string.Empty;

        var kept = new List<string>();
        foreach (var token in codes.Split(';'))
        {
            if (!Guid.TryParse(token.Trim(), out var parsed))
                throw new InvalidOperationException("FindRelatedProducts returned a malformed ProductCode.");

            var productCode = parsed.ToString("B").ToUpperInvariant();
            var registration = inspect(productCode);
            if (registration == ProductRegistration.AccessDenied)
                throw new InvalidOperationException("Windows Installer denied ProductCode validation.");
            if (registration == ProductRegistration.Unknown)
                throw new InvalidOperationException("Windows Installer returned an indeterminate ProductCode state.");

            if (registration == ProductRegistration.Absent)
            {
                if (productCode == ConfirmedOrphanProductCode) continue;
                throw new InvalidOperationException("An unrecognized ProductCode is absent; refusing to filter or remove it.");
            }

            kept.Add(productCode);
        }

        return string.Join(";", kept);
    }
}

public static class UpgradeActions
{
    [CustomAction("FilterDetectedUpgradeProducts")]
    public static ActionResult FilterDetectedUpgradeProducts(Session session)
    {
        var original = session[UpgradePropertyFilter.UpgradeActionProperty];
        if (string.IsNullOrWhiteSpace(original)) return ActionResult.Success;

        try
        {
            var filtered = UpgradePropertyFilter.Filter(original, code => InspectCurrentUser(code, session));
            session.Log("ChatDuck upgrade filter: validated WIX_UPGRADE_DETECTED; preserved all registered products and left WIX_DOWNGRADE_DETECTED untouched.");
            if (!string.Equals(original, filtered, StringComparison.Ordinal))
                session.Log("ChatDuck upgrade filter: excluded only confirmed orphan ProductCode " + UpgradePropertyFilter.ConfirmedOrphanProductCode + ".");
            session[UpgradePropertyFilter.UpgradeActionProperty] = filtered;
            return ActionResult.Success;
        }
        catch (Exception ex)
        {
            session.Log("ChatDuck upgrade filter failed closed: " + ex.Message);
            return ActionResult.Failure;
        }
    }

    public static ProductRegistration InspectCurrentUser(string productCode, Session? session = null)
    {
        var currentSid = WindowsIdentity.GetCurrent().User?.Value
            ?? throw new InvalidOperationException("Could not identify the current Windows user for MSI validation.");
        var found = false;
        for (uint index = 0; index < 16; index++)
        {
            var rc = MsiNative.EnumProduct(productCode, currentSid, 7, index, out var returnedCode, out var context, out var sid);
            if (rc == MsiNative.ErrorNoMoreItems || rc == MsiNative.ErrorUnknownProduct) break;
            if (rc == MsiNative.ErrorAccessDenied) return ProductRegistration.AccessDenied;
            if (rc != MsiNative.ErrorSuccess) return ProductRegistration.Unknown;
            if (!string.Equals(returnedCode, productCode, StringComparison.OrdinalIgnoreCase)) return ProductRegistration.Unknown;
            if (context is not (1 or 2 or 4)) return ProductRegistration.Unknown;

            var effectiveSid = context == 4 ? null : sid;
            var nameResult = MsiNative.ProductInfo(productCode, effectiveSid, context, "ProductName", out var name);
            var versionResult = MsiNative.ProductInfo(productCode, effectiveSid, context, "Version", out var version);
            if (nameResult == MsiNative.ErrorAccessDenied || versionResult == MsiNative.ErrorAccessDenied)
                return ProductRegistration.AccessDenied;
            if (nameResult != MsiNative.ErrorSuccess || versionResult != MsiNative.ErrorSuccess ||
                string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(version))
                return ProductRegistration.Unknown;

            session?.Log("ChatDuck upgrade filter: ProductCode " + productCode + " is registered in MSI context " + context + " (" + name + " " + version + "); retaining it for normal removal/migration.");
            found = true;
        }

        if (found) return ProductRegistration.Present;
        if (!string.Equals(productCode, UpgradePropertyFilter.ConfirmedOrphanProductCode, StringComparison.OrdinalIgnoreCase))
            return ProductRegistration.Absent;

        if (HasCurrentUserComponentClient(productCode, currentSid)) return ProductRegistration.Unknown;
        return ProductRegistration.Absent;
    }

    private static bool HasCurrentUserComponentClient(string productCode, string currentSid)
    {
        foreach (uint context in new uint[] { 1, 2 })
        {
            var complete = false;
            for (uint index = 0; index < 100000; index++)
            {
                var rc = MsiNative.EnumComponent(currentSid, context, index, out var componentCode);
                if (rc == MsiNative.ErrorNoMoreItems) { complete = true; break; }
                if (rc != MsiNative.ErrorSuccess) throw new InvalidOperationException("MsiEnumComponentsEx failed with " + rc + ".");

                for (uint clientIndex = 0; clientIndex < 128; clientIndex++)
                {
                    var clientRc = MsiNative.EnumClient(componentCode, currentSid, context, clientIndex, out var clientCode, out var clientContext, out var sid);
                    if (clientRc == MsiNative.ErrorNoMoreItems) break;
                    if (clientRc != MsiNative.ErrorSuccess) throw new InvalidOperationException("MsiEnumClientsEx failed with " + clientRc + ".");
                    if (!string.Equals(clientCode, productCode, StringComparison.OrdinalIgnoreCase)) continue;

                    var effectiveSid = clientContext == 4 ? null : sid;
                    var state = MsiNative.ComponentPath(clientCode, componentCode, effectiveSid, clientContext, out _);
                    if (state < 0) throw new InvalidOperationException("MsiGetComponentPathEx returned an invalid component state.");
                    return true;
                }
            }
            if (!complete) throw new InvalidOperationException("MsiEnumComponentsEx exceeded its defensive enumeration limit.");
        }

        return false;
    }
}

internal static class MsiNative
{
    internal const uint ErrorSuccess = 0;
    internal const uint ErrorAccessDenied = 5;
    internal const uint ErrorUnknownProduct = 1605;
    internal const uint ErrorNoMoreItems = 259;

    [DllImport("msi.dll", EntryPoint = "MsiEnumProductsExW", ExactSpelling = true, CharSet = CharSet.Unicode)]
    private static extern uint MsiEnumProductsEx(IntPtr productCode, IntPtr userSid, uint context, uint index,
        IntPtr installedProductCode, IntPtr installedContext, IntPtr sid, IntPtr sidLength);

    [DllImport("msi.dll", EntryPoint = "MsiGetProductInfoExW", ExactSpelling = true, CharSet = CharSet.Unicode)]
    private static extern uint MsiGetProductInfoEx(IntPtr productCode, IntPtr userSid, uint context, IntPtr property,
        IntPtr value, IntPtr valueLength);

    [DllImport("msi.dll", EntryPoint = "MsiEnumComponentsExW", ExactSpelling = true, CharSet = CharSet.Unicode)]
    private static extern uint MsiEnumComponentsEx(IntPtr userSid, uint context, uint index, IntPtr componentCode,
        IntPtr installedContext, IntPtr sid, IntPtr sidLength);

    [DllImport("msi.dll", EntryPoint = "MsiEnumClientsExW", ExactSpelling = true, CharSet = CharSet.Unicode)]
    private static extern uint MsiEnumClientsEx(IntPtr componentCode, IntPtr userSid, uint context, uint index,
        IntPtr productCode, IntPtr installedContext, IntPtr sid, IntPtr sidLength);

    [DllImport("msi.dll", EntryPoint = "MsiGetComponentPathExW", ExactSpelling = true, CharSet = CharSet.Unicode)]
    private static extern int MsiGetComponentPathEx(IntPtr productCode, IntPtr componentCode, IntPtr userSid,
        uint context, IntPtr path, IntPtr pathLength);

    internal static uint EnumProduct(string product, string sid, uint context, uint index,
        out string returnedProduct, out uint returnedContext, out string returnedSid)
    {
        using var p = NativeString.From(product);
        using var s = NativeString.From(sid);
        using var code = NativeBuffer.Create(39);
        using var outContext = NativeBuffer.Create(1);
        using var outSid = NativeBuffer.Create(256);
        using var sidLength = NativeBuffer.Create(1);
        Marshal.WriteInt32(sidLength.Handle, 255);
        var rc = MsiEnumProductsEx(p.Handle, s.Handle, context, index, code.Handle, outContext.Handle, outSid.Handle, sidLength.Handle);
        returnedProduct = code.Read();
        returnedContext = unchecked((uint)Marshal.ReadInt32(outContext.Handle));
        returnedSid = outSid.Read();
        return rc;
    }

    internal static uint ProductInfo(string product, string? sid, uint context, string property, out string value)
    {
        using var p = NativeString.From(product);
        using var s = NativeString.From(sid);
        using var propertyName = NativeString.From(property);
        using var output = NativeBuffer.Create(2048);
        using var length = NativeBuffer.Create(1);
        Marshal.WriteInt32(length.Handle, 2047);
        var rc = MsiGetProductInfoEx(p.Handle, s.Handle, context, propertyName.Handle, output.Handle, length.Handle);
        value = output.Read();
        return rc;
    }

    internal static uint EnumComponent(string sid, uint context, uint index, out string component)
    {
        using var s = NativeString.From(sid);
        using var code = NativeBuffer.Create(39);
        using var outContext = NativeBuffer.Create(1);
        using var outSid = NativeBuffer.Create(256);
        using var sidLength = NativeBuffer.Create(1);
        Marshal.WriteInt32(sidLength.Handle, 255);
        var rc = MsiEnumComponentsEx(s.Handle, context, index, code.Handle, outContext.Handle, outSid.Handle, sidLength.Handle);
        component = code.Read();
        return rc;
    }

    internal static uint EnumClient(string component, string sid, uint context, uint index,
        out string product, out uint installedContext, out string installedSid)
    {
        using var c = NativeString.From(component);
        using var s = NativeString.From(sid);
        using var code = NativeBuffer.Create(39);
        using var outContext = NativeBuffer.Create(1);
        using var outSid = NativeBuffer.Create(256);
        using var sidLength = NativeBuffer.Create(1);
        Marshal.WriteInt32(sidLength.Handle, 255);
        var rc = MsiEnumClientsEx(c.Handle, s.Handle, context, index, code.Handle, outContext.Handle, outSid.Handle, sidLength.Handle);
        product = code.Read();
        installedContext = unchecked((uint)Marshal.ReadInt32(outContext.Handle));
        installedSid = outSid.Read();
        return rc;
    }

    internal static int ComponentPath(string product, string component, string? sid, uint context, out string path)
    {
        using var p = NativeString.From(product);
        using var c = NativeString.From(component);
        using var s = NativeString.From(sid);
        using var output = NativeBuffer.Create(4096);
        using var length = NativeBuffer.Create(1);
        Marshal.WriteInt32(length.Handle, 4095);
        var state = MsiGetComponentPathEx(p.Handle, c.Handle, s.Handle, context, output.Handle, length.Handle);
        path = output.Read();
        return state;
    }
}

internal sealed class NativeString : IDisposable
{
    private NativeString(IntPtr handle) => Handle = handle;
    internal IntPtr Handle { get; }
    internal static NativeString From(string? value) => new(value == null ? IntPtr.Zero : Marshal.StringToHGlobalUni(value));
    public void Dispose() { if (Handle != IntPtr.Zero) Marshal.FreeHGlobal(Handle); }
}

internal sealed class NativeBuffer : IDisposable
{
    private NativeBuffer(int chars)
    {
        Handle = Marshal.AllocHGlobal(checked(chars * 2));
        for (var i = 0; i < chars * 2; i++) Marshal.WriteByte(Handle, i, 0);
    }
    internal IntPtr Handle { get; }
    internal static NativeBuffer Create(int chars) => new(chars);
    internal string Read() => Marshal.PtrToStringUni(Handle) ?? string.Empty;
    public void Dispose() => Marshal.FreeHGlobal(Handle);
}
