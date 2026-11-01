using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Text.RegularExpressions;
namespace CommunityTours.Setup026
{
    internal static class Elevation
    {
        [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] private struct ExecuteInfo {internal int Size;internal uint Mask;internal IntPtr Window;internal string Verb,File,Parameters,Directory;internal int Show;internal IntPtr Instance,IdList;internal string Class;internal IntPtr ClassKey;internal uint HotKey;internal IntPtr Icon,Process;}
        [DllImport("shell32.dll",CharSet=CharSet.Unicode,SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] private static extern bool ShellExecuteEx(ref ExecuteInfo info);
        internal static bool Administrator {get{using(var id=WindowsIdentity.GetCurrent())return new WindowsPrincipal(id).IsInRole(WindowsBuiltInRole.Administrator);}}
        private static string Self {get{return Assembly.GetExecutingAssembly().Location;}}
        private static string Actor {get{using(var id=WindowsIdentity.GetCurrent())return id.User.Value;}}
        private static void Private(string path,bool directory)
        {
            FileSystemInfo info=directory?(FileSystemInfo)new DirectoryInfo(path):new FileInfo(path);Check.That((info.Attributes&FileAttributes.ReparsePoint)==0,"ELEVATION_REPARSE");FileSystemSecurity acl=directory?(FileSystemSecurity)((DirectoryInfo)info).GetAccessControl(AccessControlSections.Owner|AccessControlSections.Access):((FileInfo)info).GetAccessControl(AccessControlSections.Owner|AccessControlSections.Access);Check.That(acl.GetOwner(typeof(SecurityIdentifier)).Value==Actor,"ELEVATION_ACTOR_CHANGED");var trusted=new HashSet<string>{Actor,"S-1-5-18","S-1-5-32-544"};foreach(FileSystemAccessRule rule in acl.GetAccessRules(true,true,typeof(SecurityIdentifier)))if(rule.AccessControlType==AccessControlType.Allow&&(rule.PropagationFlags&PropagationFlags.InheritOnly)==0)Check.That(trusted.Contains(rule.IdentityReference.Value)||(((long)rule.FileSystemRights)&2032127)==0,"ELEVATION_FOREIGN_ACCESS");
        }
        private static string DirectoryFor(Guid operation){return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"ctsk-native-rpc-"+operation.ToString("D"));}
        private static void Write(string file,object value){var acl=new FileSecurity();acl.SetOwner(new SecurityIdentifier(Actor));acl.SetAccessRuleProtection(true,false);foreach(string sid in new[]{Actor,"S-1-5-18","S-1-5-32-544"})acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(sid),FileSystemRights.FullControl,AccessControlType.Allow));using(var stream=new FileStream(file,FileMode.CreateNew,FileSystemRights.FullControl,FileShare.Read,4096,FileOptions.WriteThrough,acl)){byte[] bytes=Encoding.UTF8.GetBytes(Contract.Json.Serialize(value));stream.Write(bytes,0,bytes.Length);stream.Flush(true);}Private(file,false);}
        internal static Dictionary<string,object> Launch(byte[] request,OperationRequest parsed)
        {
            Check.That(parsed.TokenCheck||parsed.Action=="initialize","ELEVATION_ACTION_NOT_ALLOWED");using(var caller=ControllerLifetime.Parent()){
                string directory=DirectoryFor(parsed.OperationId),file=Path.Combine(directory,"request.json");var acl=new DirectorySecurity();acl.SetOwner(new SecurityIdentifier(Actor));acl.SetAccessRuleProtection(true,false);foreach(string sid in new[]{Actor,"S-1-5-18","S-1-5-32-544"})acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(sid),FileSystemRights.FullControl,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));Storage.AtomicDirectory(directory,acl);Private(directory,true);
                uint pid;long created;using(var process=Process.GetCurrentProcess()){pid=(uint)process.Id;created=process.StartTime.ToUniversalTime().ToFileTimeUtc();}
                var envelope=new{protocol="ctsk-native-elevation-v1",scope=Contract.Scope,productionAuthorized=false,actorSid=Actor,launcherPid=pid,launcherCreated=created.ToString(System.Globalization.CultureInfo.InvariantCulture),launcherImage=Self,operationId=parsed.OperationId.ToString("D"),request=Contract.Object(request)};Write(file,envelope);byte[] bytes=File.ReadAllBytes(file);
                var info=new ExecuteInfo{Size=Marshal.SizeOf(typeof(ExecuteInfo)),Mask=0x40|0x100,Verb="runas",File=Self,Parameters="--elevated-request \""+file+"\" "+Contract.Hash(bytes),Directory=Path.GetDirectoryName(Self),Show=0};
                // ShellExecuteEx es la API de elevación: destino EXE absoluto,
                // sin intérprete cmd.exe/PowerShell y sin contraseñas en argumentos.
                if(!ShellExecuteEx(ref info))throw new NativeFailure("ELEVATION_NOT_COMPLETED",Marshal.GetLastWin32Error());using(var process=new KernelHandle(info.Process)){Check.That(!process.IsInvalid,"ELEVATION_PROCESS_HANDLE");var watch=Stopwatch.StartNew();while(Native.WaitForSingleObject(process,100)==258){Check.That(!caller.Exited,"CALLER_EXITED");Check.That(watch.ElapsedMilliseconds<420000,"ELEVATION_TIMEOUT_REVIEW");}}
                string response=Path.Combine(directory,"response.json");Private(directory,true);Private(response,false);byte[] output=File.ReadAllBytes(response);Check.That(output.Length<=1048576,"ELEVATION_RESPONSE_LIMIT");return Contract.Object(output);
            }
        }
        internal static int Elevated(string file,string hash,Func<OperationRequest,Func<bool>,Dictionary<string,object>> run)
        {
            ServiceRegistration.RequireAdministrator();Check.That(Contract.Hex(hash)&&Path.GetFullPath(file)==file&&Path.GetFileName(file)=="request.json","ELEVATION_REQUEST_PATH");string directory=Path.GetDirectoryName(file),name=Path.GetFileName(directory);Check.That(name.StartsWith("ctsk-native-rpc-",StringComparison.Ordinal),"ELEVATION_DIRECTORY");Guid operation=Contract.Id(name.Substring("ctsk-native-rpc-".Length));Check.That(directory==DirectoryFor(operation),"ELEVATION_PROFILE_CHANGED");Private(directory,true);Private(file,false);byte[] bytes=File.ReadAllBytes(file);Check.That(bytes.Length<=131072&&Contract.Hash(bytes)==hash,"ELEVATION_REQUEST_CHANGED");var v=Contract.Object(bytes);Contract.Keys(v,"protocol","scope","productionAuthorized","actorSid","launcherPid","launcherCreated","launcherImage","operationId","request");Check.That(Contract.Text(v,"protocol")=="ctsk-native-elevation-v1"&&Contract.Text(v,"scope")==Contract.Scope&&v["productionAuthorized"] is bool&&!(bool)v["productionAuthorized"]&&Contract.Text(v,"actorSid")==Actor&&Contract.Text(v,"operationId")==operation.ToString("D")&&v["launcherPid"] is int,"ELEVATION_ENVELOPE");
            long created;Check.That(Int64.TryParse(Contract.Text(v,"launcherCreated"),out created)&&created>0&&Contract.Text(v,"launcherImage")==Self,"ELEVATION_LAUNCHER");var launcher=new Installation{ControllerPid=(uint)(int)v["launcherPid"],ControllerCreated=created,ControllerImage=Self,ActorSid=Actor};var request=OperationRequest.Parse(Encoding.UTF8.GetBytes(Contract.Json.Serialize(v["request"])));Check.That(request.OperationId==operation&&(request.TokenCheck||request.Action=="initialize"),"ELEVATION_ACTION_NOT_ALLOWED");
            Dictionary<string,object> result;using(var owner=ControllerLifetime.Open(launcher))try{Check.That(!owner.Exited,"CALLER_EXITED");result=run(request,()=>owner.Exited);}catch(Exception error){var native=error as NativeFailure;string code=Regex.IsMatch(error.Message??"",@"\A[A-Z0-9_]{1,96}\z")?error.Message:"NATIVE_OPERATION_REVIEW";result=new Dictionary<string,object>{{"protocol","ctsk-optionc-service-v1"},{"scope",Contract.Scope},{"productionAuthorized",false},{"operationId",operation.ToString("D")},{"complete",false},{"code",code},{"win32Error",native==null?0:native.Win32Code}};FailureEvidence.AddTo(result,error);}
            // Solo metadatos. El transporte por archivo prohíbe credentials.
            Check.That(!result.ContainsKey("secret"),"ELEVATION_SECRET_REPLY_FORBIDDEN");Write(Path.Combine(directory,"response.json"),result);return result["complete"] is bool&&(bool)result["complete"]?0:1;
        }
    }
}
