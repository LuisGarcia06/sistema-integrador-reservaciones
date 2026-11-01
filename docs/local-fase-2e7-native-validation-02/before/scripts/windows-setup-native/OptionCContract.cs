using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Management;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
namespace CommunityTours.Setup026
{
    internal static class Contract
    {
        internal const string Scope="synthetic-acceptance-only";
        internal static readonly JavaScriptSerializer Json=new JavaScriptSerializer { MaxJsonLength=1048576,RecursionLimit=32 };
        internal static string Hash(byte[] bytes) { using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").ToLowerInvariant(); }
        internal static bool Hex(string text) { return text!=null&&Regex.IsMatch(text,@"\A[a-f0-9]{64}\z"); }
        internal static string Text(Dictionary<string,object> v,string key) { Check.That(v.ContainsKey(key)&&v[key] is string,"REQUEST_FIELD");return (string)v[key]; }
        internal static void Keys(Dictionary<string,object> v,params string[] keys) { Check.That(v!=null&&v.Count==keys.Length&&keys.All(v.ContainsKey),"REQUEST_KEYS"); }
        internal static Guid Id(string text) { Guid id;Check.That(Guid.TryParseExact(text,"D",out id)&&id!=Guid.Empty&&id.ToString("D")==text&&text[14]=='4'&&"89ab".Contains(text[19]),"REQUEST_UUID");return id; }
        internal static Dictionary<string,object> Object(byte[] bytes) { var v=Json.DeserializeObject(new UTF8Encoding(false,true).GetString(bytes)) as Dictionary<string,object>;Check.That(v!=null,"REQUEST_OBJECT");return v; }
        internal static string Machine()
        {
            Check.Windows11();var options=new EnumerationOptions {Timeout=TimeSpan.FromSeconds(8),ReturnImmediately=false,Rewindable=false};
            using(var s=new ManagementObjectSearcher(new ManagementScope("root\\cimv2"),new ObjectQuery("SELECT Manufacturer,Model FROM Win32_ComputerSystem"),options))using(var rows=s.Get()){int count=0;foreach(ManagementBaseObject row in rows)using(row){count++;Check.That(((string)row["Manufacturer"]=="Oracle Corporation"||(string)row["Manufacturer"]=="innotek GmbH")&&(string)row["Model"]=="VirtualBox","VIRTUALBOX_REQUIRED");}Check.That(count==1,"MACHINE_AMBIGUOUS");}
            using(var s=new ManagementObjectSearcher(new ManagementScope("root\\cimv2"),new ObjectQuery("SELECT UUID FROM Win32_ComputerSystemProduct"),options))using(var rows=s.Get()){string value=null;foreach(ManagementBaseObject row in rows)using(row){Guid id=Guid.Empty;Check.That(value==null&&Guid.TryParse((string)row["UUID"],out id)&&id!=Guid.Empty,"MACHINE_UUID");value=id.ToString("D");}Check.That(value!=null,"MACHINE_UUID");return value;}
        }
    }
    internal sealed class Installation
    {
        #if NATIVE_VALIDATION_ONLY
        internal string ValidationScenario;
#endif
        internal Guid Id;internal int Port;internal string ActorSid,MachineUuid,DependencyHash,HostHash,ServiceSid,ControllerImage;internal uint ControllerPid;internal long ControllerCreated;
        internal string Name {get{return "CTSK026-"+Id.ToString("D");}}
        internal string Account {get{return @"NT SERVICE\"+Name;}}
        internal string Directory {get{return Path.Combine(@"C:\ProgramData\CommunityTours\Acceptance026",Id.ToString("D"));}}
        internal string Control {get{return Path.Combine(Directory,"control");}}
        internal string Work {get{return Path.Combine(Directory,"work");}}
        internal string Data {get{return Path.Combine(Directory,"data");}}
        internal string Host {get{return Path.Combine(Control,"SetupPostgres.exe");}}
        internal string BootstrapCommand {get{return "\""+Host+"\" --service-instance "+Id.ToString("D");}}
        internal string OfficialCommand {get{return "\"C:\\Program Files\\PostgreSQL\\18\\bin\\pg_ctl.exe\" runservice -N \""+Name+"\" -D \""+Data+"\" -w -t 60";}}
        internal static Installation FromPlan(Dictionary<string,object> p)
        {
            Contract.Keys(p,"installationId","pgPort","serviceName","serviceAccount","dataDirectory","serviceExecutable","serviceArgs");
            Check.That(p["pgPort"] is int,"PLAN_PORT");var v=new Installation{Id=Contract.Id(Contract.Text(p,"installationId")),Port=(int)p["pgPort"]};
            Check.That(v.Port>=1024&&v.Port<=65535&&v.Port!=5432&&Contract.Text(p,"serviceName")==v.Name&&Contract.Text(p,"serviceAccount")==v.Account&&Contract.Text(p,"dataDirectory")==v.Data&&Contract.Text(p,"serviceExecutable")==@"C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe","PLAN_BINDING");
            var args=p["serviceArgs"] as object[];Check.That(args!=null&&Contract.Json.Serialize(args)==Contract.Json.Serialize(new[]{"runservice","-N",v.Name,"-D",v.Data,"-w","-t","60"}),"PLAN_ARGUMENTS");return v;
        }
        internal Dictionary<string,object> Binding(string imageHash)
        {return new Dictionary<string,object>{{"installationId",Id.ToString("D")},{"pgPort",Port},{"serviceName",Name},{"serviceAccount",Account},{"dataDirectory",Data},{"serviceExecutable",@"C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe"},{"serviceArgs",new[]{"runservice","-N",Name,"-D",Data,"-w","-t","60"}},{"serviceSid",ServiceSid},{"postgresImageSha256",imageHash}};}
    }
    internal sealed class OperationRequest
    {
        internal Guid OperationId;internal string Action,ExpectedCluster=null,CredentialKind=null;internal Installation Installation;internal bool TokenCheck;
        internal static OperationRequest Parse(byte[] bytes)
        {
#if NATIVE_VALIDATION_ONLY
            return NativeValidation.Parse(bytes);
#else
            var v=Contract.Object(bytes);string action=Contract.Text(v,"action");bool trial=action=="token-check";
            var keys=new List<string>{"protocol","scope","productionAuthorized","operationId","action","plan","dependencyInventorySha256"};if(trial)keys.Add("manualConsent");else if(action!="initialize")keys.Add("expectedSystemIdentifier");if(action=="credentials")keys.Add("credentialKind");Contract.Keys(v,keys.ToArray());
            Check.That(Contract.Text(v,"protocol")=="ctsk-optionc-service-v1"&&Contract.Text(v,"scope")==Contract.Scope&&v["productionAuthorized"] is bool&&!(bool)v["productionAuthorized"]&&new[]{"token-check","initialize","query","start","stop","credentials"}.Contains(action),"REQUEST_SCOPE");
            if(trial)Check.That(Contract.Text(v,"manualConsent")=="AUTORIZO SOLO VALIDACION DE TOKEN OPCION C","TOKEN_TRIAL_NOT_AUTHORIZED");
            var p=v["plan"] as Dictionary<string,object>;Check.That(p!=null,"PLAN_REQUIRED");var r=new OperationRequest {OperationId=Contract.Id(Contract.Text(v,"operationId")),Action=action,Installation=Installation.FromPlan(p),TokenCheck=trial};r.Installation.DependencyHash=Contract.Text(v,"dependencyInventorySha256");Check.That(Contract.Hex(r.Installation.DependencyHash),"DEPENDENCY_HASH");
            if(!trial&&action!="initialize"){r.ExpectedCluster=Contract.Text(v,"expectedSystemIdentifier");Check.That(Regex.IsMatch(r.ExpectedCluster,@"\A[0-9]{19,20}\z")&&r.ExpectedCluster!="7632825987452064788","CLUSTER_PROTECTED");}if(action=="credentials"){r.CredentialKind=Contract.Text(v,"credentialKind");Check.That(r.CredentialKind=="maintenance"||r.CredentialKind=="runtime","CREDENTIAL_KIND");}return r;
#endif
        }
    }
    internal sealed class DependencyLease : IDisposable
    {
        private readonly List<FileStream> held=new List<FileStream>();internal readonly Dictionary<string,string> Hashes=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);internal byte[] Bytes;
        internal static DependencyLease Open(string file,string expectedHash,string actor=null)
        {
            var lease=new DependencyLease();try{
                lease.Bytes=File.ReadAllBytes(file);Check.That(Contract.Hash(lease.Bytes)==expectedHash,"DEPENDENCY_INVENTORY_CHANGED");var v=Contract.Object(lease.Bytes);
                Check.That(Contract.Text(v,"scope")==Contract.Scope&&v["productionAuthorized"] is bool&&!(bool)v["productionAuthorized"]&&Contract.Text(v,"postgresVersion")=="18.6"&&v.ContainsKey("authenticated")&&v["authenticated"] is bool&&(bool)v["authenticated"],"DEPENDENCY_NOT_AUTHENTICATED");
                var files=v["files"] as object[];Check.That(files!=null&&files.Length>=6&&files.Length<=2048,"DEPENDENCY_FILES");
                foreach(object raw in files){var row=raw as Dictionary<string,object>;Check.That(row!=null,"DEPENDENCY_FILE");string name=Contract.Text(row,"file"),hash=Contract.Text(row,"sha256");Check.That(name.StartsWith(@"C:\Program Files\PostgreSQL\18\",StringComparison.Ordinal)&&Path.GetFullPath(name)==name&&Contract.Hex(hash)&&!lease.Hashes.ContainsKey(name),"DEPENDENCY_PATH");Storage.Program(name,actor);var stream=new FileStream(name,FileMode.Open,FileAccess.Read,FileShare.Read);lease.held.Add(stream);using(var sha=SHA256.Create())Check.That(BitConverter.ToString(sha.ComputeHash(stream)).Replace("-","").ToLowerInvariant()==hash,"DEPENDENCY_FILE_CHANGED");if(String.Equals(Path.GetExtension(name),".dll",StringComparison.OrdinalIgnoreCase)||String.Equals(Path.GetExtension(name),".exe",StringComparison.OrdinalIgnoreCase))ImageX64(stream);lease.Hashes.Add(name,hash);}
                foreach(string name in new[]{"initdb","postgres","pg_ctl","pg_dump","pg_restore","pg_controldata"}){string exe=@"C:\Program Files\PostgreSQL\18\bin\"+name+".exe";Check.That(lease.Hashes.ContainsKey(exe),"DEPENDENCY_TOOL_MISSING");var version=System.Diagnostics.FileVersionInfo.GetVersionInfo(exe);Check.That(version.ProductVersion=="18.6"&&version.FileVersion=="18.0.6.0","DEPENDENCY_VERSION");}
                foreach(string directory in new[]{@"C:\Program Files\PostgreSQL\18\bin",@"C:\Program Files\PostgreSQL\18\lib"})lease.LibraryCoverage(new DirectoryInfo(directory));
                return lease;
            }catch{lease.Dispose();throw;}
        }
        private static void ImageX64(FileStream stream)
        {
            Check.That(stream.Length>=128,"DEPENDENCY_PE_SHORT");var bytes=new byte[64];stream.Position=0;Check.That(stream.Read(bytes,0,64)==64&&BitConverter.ToUInt16(bytes,0)==0x5a4d,"DEPENDENCY_PE_DOS");uint offset=BitConverter.ToUInt32(bytes,60);Check.That(offset>=64&&offset<=stream.Length-26,"DEPENDENCY_PE_OFFSET");stream.Position=offset;Check.That(stream.Read(bytes,0,26)==26&&BitConverter.ToUInt32(bytes,0)==0x4550&&BitConverter.ToUInt16(bytes,4)==0x8664&&BitConverter.ToUInt16(bytes,24)==0x020b,"DEPENDENCY_PE_X64");
        }
        private void LibraryCoverage(DirectoryInfo directory)
        {
            Check.That(directory.Exists&&(directory.Attributes&FileAttributes.ReparsePoint)==0,"DEPENDENCY_LIBRARY_DIRECTORY");foreach(FileSystemInfo item in directory.GetFileSystemInfos()){Check.That((item.Attributes&FileAttributes.ReparsePoint)==0,"DEPENDENCY_LIBRARY_REPARSE");if(item is DirectoryInfo)LibraryCoverage((DirectoryInfo)item);else if(String.Equals(Path.GetExtension(item.Name),".dll",StringComparison.OrdinalIgnoreCase))Check.That(Hashes.ContainsKey(item.FullName),"DEPENDENCY_LIBRARY_UNREFERENCED");}
        }
        internal string ToolHash(string name){return Hashes[@"C:\Program Files\PostgreSQL\18\bin\"+name+".exe"];}
        public void Dispose(){foreach(var stream in held)stream.Dispose();held.Clear();}
    }
}
