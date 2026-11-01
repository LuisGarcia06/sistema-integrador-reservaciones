// Lector independiente de solo lectura. No usa ni deriva de SecurityProbe.cs.
// No crea procesos, tokens, Job, directorios, servicios, claves o descriptores.
using System;
using System.Collections.Generic;
using System.IO;
using System.Management;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Web.Script.Serialization;

internal static class SetupIdentityAcl
{
    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 32768 };
    private static Dictionary<string, object> Map(params object[] pairs)
    {
        var value = new Dictionary<string, object>();
        for (int i = 0; i < pairs.Length; i += 2) value.Add((string)pairs[i], pairs[i + 1]);
        return value;
    }
    private static void Need(bool condition, string code) { if (!condition) throw new InvalidOperationException(code); }
    private static Dictionary<string, object> Query(string query, params string[] names)
    {
        var options = new EnumerationOptions { Timeout = TimeSpan.FromSeconds(8), ReturnImmediately = false, Rewindable = false };
        using (var search = new ManagementObjectSearcher(new ManagementScope("root\\cimv2"), new ObjectQuery(query), options))
        using (var rows = search.Get())
        {
            Dictionary<string, object> result = null;
            foreach (ManagementBaseObject row in rows)
            {
                using (row)
                {
                    Need(result == null, "MACHINE_AMBIGUOUS"); result = new Dictionary<string, object>();
                    foreach (string name in names) { Need(row[name] is string, "MACHINE_INCOMPLETE"); result.Add(name, (string)row[name]); }
                }
            }
            Need(result != null, "MACHINE_INCOMPLETE"); return result;
        }
    }
    private static Dictionary<string, object> InspectPath(Dictionary<string, object> request, HashSet<string> trusted)
    {
        Need(request.Count == 2 && request.ContainsKey("path") && request.ContainsKey("policy"), "PATH_REQUEST");
        string filename = request["path"] as string, policy = request["policy"] as string;
        Need(policy == "program-file" || policy == "private-file" || policy == "private-directory", "PATH_POLICY");
        Need(!String.IsNullOrEmpty(filename) && Path.IsPathRooted(filename) && !filename.StartsWith(@"\\") && filename == Path.GetFullPath(filename), "PATH_INVALID");
        FileAttributes attributes;
        try { attributes = File.GetAttributes(filename); }
        catch (FileNotFoundException) { return Map("path", filename, "policy", policy, "status", "missing"); }
        catch (DirectoryNotFoundException) { return Map("path", filename, "policy", policy, "status", "missing"); }
        bool directory = (attributes & FileAttributes.Directory) != 0;
        Need(directory == (policy == "private-directory"), "PATH_TYPE");
        FileSystemInfo item = directory ? (FileSystemInfo)new DirectoryInfo(filename) : new FileInfo(filename);
        int index = 0;
        while (item != null)
        {
            Need((item.Attributes & FileAttributes.ReparsePoint) == 0, "ACL_REPARSE_POINT");
            FileSystemSecurity acl = item is DirectoryInfo
                ? (FileSystemSecurity)((DirectoryInfo)item).GetAccessControl(AccessControlSections.Owner | AccessControlSections.Access)
                : ((FileInfo)item).GetAccessControl(AccessControlSections.Owner | AccessControlSections.Access);
            string owner = acl.GetOwner(typeof(SecurityIdentifier)).Value;
            Need(trusted.Contains(owner), "ACL_OWNER");
            AuthorizationRuleCollection rules = acl.GetAccessRules(true, true, typeof(SecurityIdentifier));
            Need(rules.Count > 0, "ACL_EMPTY_OR_NULL");
            long mask = index == 0 ? (policy == "program-file" ? 852310L : 2032127L) : index == 1 ? 852310L : 852032L;
            foreach (FileSystemAccessRule rule in rules)
            {
                if (rule.AccessControlType != AccessControlType.Allow || (rule.PropagationFlags & PropagationFlags.InheritOnly) != 0) continue;
                if (trusted.Contains(rule.IdentityReference.Value)) continue;
                Need((((long)rule.FileSystemRights) & mask) == 0, "ACL_UNTRUSTED_ACCESS");
            }
            item = item is DirectoryInfo ? ((DirectoryInfo)item).Parent : ((FileInfo)item).Directory;
            index++;
        }
        return Map("path", filename, "policy", policy, "status", "safe");
    }
    private static Dictionary<string, object> Inspect(Dictionary<string, object> request)
    {
        Version os = Environment.OSVersion.Version;
        Need(Environment.Is64BitOperatingSystem && Environment.Is64BitProcess && os.Major == 10 && os.Build >= 22000, "WINDOWS11_X64_REQUIRED");
        Need(request.Count == 2 && request.ContainsKey("protocol") && (request["protocol"] as string) == "ctsk-setup-acl-read-v1" && request.ContainsKey("paths"), "REQUEST_INVALID");
        object[] paths = request["paths"] as object[];
        Need(paths != null && paths.Length > 0 && paths.Length <= 8, "PATH_COUNT");
        var system = Query("SELECT Manufacturer,Model FROM Win32_ComputerSystem", "Manufacturer", "Model");
        var product = Query("SELECT UUID FROM Win32_ComputerSystemProduct", "UUID");
        string manufacturer = (string)system["Manufacturer"], model = (string)system["Model"];
        Guid uuid; Need(Guid.TryParse((string)product["UUID"], out uuid) && uuid != Guid.Empty, "MACHINE_UUID");
        Need((manufacturer == "Oracle Corporation" || manufacturer == "innotek GmbH") && model == "VirtualBox", "VIRTUALBOX_REQUIRED");
        using (WindowsIdentity identity = WindowsIdentity.GetCurrent())
        {
            Need(identity.User != null, "PRINCIPAL_INCOMPLETE"); string sid = identity.User.Value;
            var trusted = new HashSet<string>(StringComparer.Ordinal) { sid, "S-1-5-18", "S-1-5-32-544", "S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464" };
            var results = new List<object>();
            foreach (object entry in paths)
            {
                var pathRequest = entry as Dictionary<string, object>; Need(pathRequest != null, "PATH_REQUEST");
                results.Add(InspectPath(pathRequest, trusted));
            }
            string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            Need(!String.IsNullOrEmpty(local) && Directory.Exists(local), "LOCAL_DIRECTORY");
            return Map("protocol", "ctsk-setup-acl-read-v1", "scope", "synthetic-acceptance-only", "productionAuthorized", false,
                "complete", true, "code", "READ_COMPLETE", "platform", "win32", "arch", "x64", "release", os.Major + "." + os.Minor + "." + os.Build,
                "manufacturer", manufacturer, "model", model, "uuid", uuid.ToString("D"), "sid", sid, "localAppData", local,
                "paths", results, "firstTokenVerified", false, "containmentVerified", false);
        }
    }
    public static int Main(string[] args)
    {
        Console.InputEncoding = new UTF8Encoding(false); Console.OutputEncoding = new UTF8Encoding(false);
        try
        {
            Need(args.Length == 1 && args[0] == "--inspect", "READ_ONLY_COMMAND_REQUIRED");
            var input = new StringBuilder(); char[] chunk = new char[1024]; int read;
            while ((read = Console.In.Read(chunk, 0, chunk.Length)) > 0) { input.Append(chunk, 0, read); Need(input.Length <= 32768, "REQUEST_LIMIT"); }
            var request = Json.DeserializeObject(input.ToString()) as Dictionary<string, object>; Need(request != null, "REQUEST_INVALID");
            Console.WriteLine(Json.Serialize(Inspect(request))); return 0;
        }
        catch (Exception error)
        {
            string code = error is InvalidOperationException && System.Text.RegularExpressions.Regex.IsMatch(error.Message, @"\A[A-Z0-9_]+\z") ? error.Message : "READ_FAILED";
            Console.WriteLine(Json.Serialize(Map("protocol", "ctsk-setup-acl-read-v1", "scope", "synthetic-acceptance-only", "productionAuthorized", false,
                "complete", false, "code", code, "firstTokenVerified", false, "containmentVerified", false))); return 1;
        }
    }
}
