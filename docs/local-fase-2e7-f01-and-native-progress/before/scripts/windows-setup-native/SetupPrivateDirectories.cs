// Operación del instalador: creación atómica con DACL privada, sin PowerShell.
// No abre PostgreSQL ni modifica directorios existentes. No deriva de SecurityProbe.
using System;
using System.Collections.Generic;
using System.IO;
using System.Management;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
internal static class SetupPrivateDirectories
{
    [StructLayout(LayoutKind.Sequential)] private struct SecurityAttributes { public int Length; public IntPtr Descriptor; [MarshalAs(UnmanagedType.Bool)] public bool Inherit; }
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)]
    private static extern bool CreateDirectoryW(string path, ref SecurityAttributes security);
    private static readonly JavaScriptSerializer Json=new JavaScriptSerializer { MaxJsonLength=32768 };
    private static void Need(bool yes,string code){if(!yes)throw new InvalidOperationException(code);}
    private static string MachineUuid()
    {
        var options=new EnumerationOptions { Timeout=TimeSpan.FromSeconds(8), ReturnImmediately=false, Rewindable=false };
        using(var s=new ManagementObjectSearcher(new ManagementScope("root\\cimv2"),new ObjectQuery("SELECT Manufacturer,Model FROM Win32_ComputerSystem"),options))
        using(var rows=s.Get()) { int count=0; foreach(ManagementBaseObject row in rows)using(row){count++;Need(((string)row["Manufacturer"]=="Oracle Corporation"||(string)row["Manufacturer"]=="innotek GmbH")&&(string)row["Model"]=="VirtualBox","VIRTUALBOX_REQUIRED");}Need(count==1,"MACHINE_INCOMPLETE"); }
        using(var s=new ManagementObjectSearcher(new ManagementScope("root\\cimv2"),new ObjectQuery("SELECT UUID FROM Win32_ComputerSystemProduct"),options))
        using(var rows=s.Get()) { string result=null; foreach(ManagementBaseObject row in rows)using(row){Need(result==null,"MACHINE_AMBIGUOUS");Guid id;Need(Guid.TryParse((string)row["UUID"],out id)&&id!=Guid.Empty,"MACHINE_INCOMPLETE");result=id.ToString("D");}Need(result!=null,"MACHINE_INCOMPLETE");return result; }
    }
    private static void ProtectedParent(string local,string sid)
    {
        var trusted=new HashSet<string>(StringComparer.Ordinal){sid,"S-1-5-18","S-1-5-32-544","S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464"};
        DirectoryInfo item=new DirectoryInfo(local);int depth=0;
        while(item!=null){Need((item.Attributes&FileAttributes.ReparsePoint)==0,"PARENT_REPARSE");var acl=item.GetAccessControl(AccessControlSections.Owner|AccessControlSections.Access);Need(trusted.Contains(acl.GetOwner(typeof(SecurityIdentifier)).Value),"PARENT_OWNER");var rules=acl.GetAccessRules(true,true,typeof(SecurityIdentifier));Need(rules.Count>0,"PARENT_ACL_EMPTY");foreach(FileSystemAccessRule rule in rules){if(rule.AccessControlType!=AccessControlType.Allow||(rule.PropagationFlags&PropagationFlags.InheritOnly)!=0||trusted.Contains(rule.IdentityReference.Value))continue;Need((((long)rule.FileSystemRights)&(depth==0?852310L:852032L))==0,"PARENT_WRITE_ACCESS");}item=item.Parent;depth++;}
    }
    public static int Main(string[] args)
    {
        Console.InputEncoding=new UTF8Encoding(false);Console.OutputEncoding=new UTF8Encoding(false);
        var created=new List<string>();string operation=null;
        try{
            Need(args.Length==1&&args[0]=="--create-private","COMMAND_REQUIRED");var os=Environment.OSVersion.Version;
            Need(os.Major==10&&os.Build>=22000&&Environment.Is64BitProcess&&Environment.Is64BitOperatingSystem,"WINDOWS11_X64_REQUIRED");
            var input=new StringBuilder();char[] buffer=new char[1024];int n;while((n=Console.In.Read(buffer,0,buffer.Length))>0){input.Append(buffer,0,n);Need(input.Length<=32768,"REQUEST_LIMIT");}
            var v=Json.DeserializeObject(input.ToString()) as Dictionary<string,object>;
            Need(v!=null&&v.Count==9&&v.ContainsKey("protocol")&&(string)v["protocol"]=="ctsk-private-directories-v1"&&(string)v["scope"]=="synthetic-acceptance-only"&&v["productionAuthorized"] is bool&&!(bool)v["productionAuthorized"],"REQUEST_INVALID");
            operation=v["operationId"] as string;Guid op;Need(Guid.TryParse(operation,out op),"OPERATION_ID");
            string release=v["release"] as string;Need(release!=null&&Regex.IsMatch(release,@"\A2e7-candidate-[0-9]{2}\z"),"RELEASE_INVALID");
            string local=Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),sid;
            using(var identity=WindowsIdentity.GetCurrent()){Need(identity.User!=null,"SID_REQUIRED");sid=identity.User.Value;}
            Need((v["sid"] as string)==sid&&(v["uuid"] as string)==MachineUuid()&&String.Equals(v["local"] as string,local,StringComparison.OrdinalIgnoreCase),"IDENTITY_CHANGED");
            ProtectedParent(local,sid);
            object[] paths=v["paths"] as object[];Need(paths!=null&&paths.Length==3,"PATH_COUNT");
            var expected=new List<string>{"ctsk-setup026-"+release,"ctsk-client026-"+release};var unique=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach(object raw in paths){string p=raw as string;Need(!String.IsNullOrEmpty(p)&&Path.IsPathRooted(p)&&p==Path.GetFullPath(p)&&!p.StartsWith(@"\\")&&String.Equals(Path.GetDirectoryName(p),local,StringComparison.OrdinalIgnoreCase)&&unique.Add(p),"PATH_INVALID");string name=Path.GetFileName(p);if(expected.Contains(name))expected.Remove(name);else Need(Regex.IsMatch(name,@"\Actsk-server026-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\z"),"DIRECTORY_NAME");try{File.GetAttributes(p);throw new InvalidOperationException("DIRECTORY_EXISTS");}catch(FileNotFoundException){}catch(DirectoryNotFoundException){}}
            Need(expected.Count==0,"DIRECTORY_SET");
            var security=new DirectorySecurity();security.SetAccessRuleProtection(true,false);security.SetOwner(new SecurityIdentifier(sid));
            foreach(string principal in new[]{sid,"S-1-5-18","S-1-5-32-544"})security.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(principal),FileSystemRights.FullControl,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));
            byte[] descriptor=security.GetSecurityDescriptorBinaryForm();var pinned=GCHandle.Alloc(descriptor,GCHandleType.Pinned);
            try{var sa=new SecurityAttributes{Length=Marshal.SizeOf(typeof(SecurityAttributes)),Descriptor=pinned.AddrOfPinnedObject(),Inherit=false};foreach(string p in paths){if(!CreateDirectoryW(p,ref sa))throw new InvalidOperationException("DIRECTORY_CREATE_FAILED");created.Add(p);var acl=new DirectoryInfo(p).GetAccessControl(AccessControlSections.Owner|AccessControlSections.Access);Need(acl.AreAccessRulesProtected&&acl.GetOwner(typeof(SecurityIdentifier)).Value==sid,"DIRECTORY_POSTCONDITION");}}
            finally{pinned.Free();}
            Console.WriteLine(Json.Serialize(new {protocol="ctsk-private-directories-v1",scope="synthetic-acceptance-only",productionAuthorized=false,operationId=operation,complete=true,created=created.ToArray(),sid=sid,uuid=(string)v["uuid"]}));return 0;
        }catch(Exception error){string code=error is InvalidOperationException&&Regex.IsMatch(error.Message,@"\A[A-Z0-9_]+\z")?error.Message:"DIRECTORY_OPERATION_FAILED";Console.WriteLine(Json.Serialize(new {protocol="ctsk-private-directories-v1",scope="synthetic-acceptance-only",productionAuthorized=false,operationId=operation,complete=false,code=code,created=created.ToArray()}));return 1;}
    }
}
