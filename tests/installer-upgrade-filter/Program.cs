using System;
using ChatDuck.InstallerActions;

var orphan = UpgradePropertyFilter.ConfirmedOrphanProductCode;
const string live = "{3191BE8A-141E-4A9A-B46B-8645CEE48E6C}";
var count = 0;

void Check(bool condition, string name)
{
    if (!condition) throw new InvalidOperationException("FAIL " + name);
    Console.WriteLine("PASS " + name);
    count++;
}

void Throws(Action action, string name)
{
    try { action(); }
    catch (InvalidOperationException) { Console.WriteLine("PASS " + name); count++; return; }
    throw new InvalidOperationException("FAIL " + name);
}

Check(UpgradePropertyFilter.Filter(orphan + ";" + live, code =>
    code == orphan ? ProductRegistration.Absent : ProductRegistration.Present) == live,
    "filters only the audited orphan and keeps the valid 2.8.8 product");
Check(UpgradePropertyFilter.Filter(live, _ => ProductRegistration.Present) == live,
    "keeps a registered product");
Check(UpgradePropertyFilter.Filter(orphan, _ => ProductRegistration.Present) == orphan,
    "keeps the audited code if it becomes a valid current-context product");
Throws(() => UpgradePropertyFilter.Filter(orphan, _ => ProductRegistration.AccessDenied),
    "fails closed on access denied");
Throws(() => UpgradePropertyFilter.Filter(orphan, _ => ProductRegistration.Unknown),
    "fails closed on indeterminate state");
Throws(() => UpgradePropertyFilter.Filter("{AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA}", _ => ProductRegistration.Absent),
    "does not exclude an unaudited absent product");
Throws(() => UpgradePropertyFilter.Filter("not-a-product-code", _ => ProductRegistration.Absent),
    "rejects malformed ActionProperty content");
Check(UpgradePropertyFilter.Filter("", _ => ProductRegistration.Unknown) == "",
    "leaves empty ActionProperty empty");

Check(UpgradeActions.InspectCurrentUser(orphan) == ProductRegistration.Absent,
    "real Windows Installer APIs confirm the audited orphan is absent for the current user");
Check(UpgradeActions.InspectCurrentUser(live) == ProductRegistration.Present,
    "real Windows Installer APIs confirm the valid 2.8.8 product and metadata");

Console.WriteLine(count + " installer upgrade-filter checks passed.");
