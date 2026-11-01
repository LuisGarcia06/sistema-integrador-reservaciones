// Primitivas del instalador opción C, sin entrada ejecutable ni DEBUG_PROCESS.
// No se usan hasta integrar y validar el host SCM, ACL, procedencia y CMD.
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Management;
using Microsoft.Win32;
using Microsoft.Win32.SafeHandles;
namespace CommunityTours.Setup026
{
    internal sealed class KernelHandle : SafeHandleZeroOrMinusOneIsInvalid
    {
        private KernelHandle() : base(true) { }
        internal KernelHandle(IntPtr value) : base(true) { SetHandle(value); }
        protected override bool ReleaseHandle() { return Native.CloseHandle(handle); }
    }
    internal static class Native
    {
        [StructLayout(LayoutKind.Sequential)] internal struct SidAttributes { internal IntPtr Sid; internal uint Attributes; }
        [StructLayout(LayoutKind.Sequential)] internal struct TokenGroups { internal uint Count; internal SidAttributes First; }
        [StructLayout(LayoutKind.Sequential)] internal struct Luid { internal uint Low; internal int High; }
        [StructLayout(LayoutKind.Sequential)] internal struct LuidAttributes { internal Luid Luid; internal uint Attributes; }
        [StructLayout(LayoutKind.Sequential)] internal struct TokenPrivileges { internal uint Count; internal LuidAttributes First; }
        [StructLayout(LayoutKind.Sequential)] internal struct BasicLimits { internal long ProcessTime,JobTime; internal uint Flags; internal UIntPtr MinWorkingSet,MaxWorkingSet; internal uint ProcessLimit; internal UIntPtr Affinity; internal uint Priority,Scheduling; }
        [StructLayout(LayoutKind.Sequential)] internal struct IoCounters { internal ulong ReadOps,WriteOps,OtherOps,ReadBytes,WriteBytes,OtherBytes; }
        [StructLayout(LayoutKind.Sequential)] internal struct ExtendedLimits { internal BasicLimits Basic; internal IoCounters Io; internal UIntPtr ProcessMemory,JobMemory,PeakProcessMemory,PeakJobMemory; }
        [StructLayout(LayoutKind.Sequential)] internal struct Accounting { internal long UserTime,KernelTime,PeriodUserTime,PeriodKernelTime; internal uint PageFaults,TotalProcesses,ActiveProcesses,TerminatedProcesses; }
        [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] internal struct StartupInfo { internal uint Size; internal string Reserved,Desktop,Title; internal uint X,Y,Width,Height,CharsX,CharsY,Fill,Flags; internal ushort Show,ReservedSize; internal IntPtr ReservedBytes,Input,Output,Error; }
        [StructLayout(LayoutKind.Sequential)] internal struct StartupInfoEx { internal StartupInfo Startup; internal IntPtr Attributes; }
        [StructLayout(LayoutKind.Sequential)] internal struct ProcessInformation { internal IntPtr Process,Thread; internal uint ProcessId,ThreadId; }
        [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool CloseHandle(IntPtr handle);
        [DllImport("kernel32.dll")] internal static extern IntPtr GetCurrentProcess();
        [DllImport("advapi32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool OpenProcessToken(IntPtr process,uint access,out KernelHandle token);
        [DllImport("advapi32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool GetTokenInformation(KernelHandle token,int kind,IntPtr value,uint size,out uint needed);
        [DllImport("advapi32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool SetTokenInformation(KernelHandle token,int kind,ref SidAttributes value,uint size);
        [DllImport("advapi32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool CreateRestrictedToken(KernelHandle token,uint flags,uint disabledCount,[In] SidAttributes[] disabled,uint deletedCount,IntPtr deleted,uint restrictedCount,[In] SidAttributes[] restricted,out KernelHandle result);
        [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool LookupPrivilegeName(string system,ref Luid luid,StringBuilder name,ref uint length);
        [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] internal static extern KernelHandle CreateJobObject(IntPtr security,string name);
        [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool SetInformationJobObject(KernelHandle job,int kind,ref ExtendedLimits value,uint size);
        [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool QueryInformationJobObject(KernelHandle job,int kind,out Accounting value,uint size,out uint needed);
        [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool AssignProcessToJobObject(KernelHandle job,KernelHandle process);
        [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool IsProcessInJob(KernelHandle process,KernelHandle job,[MarshalAs(UnmanagedType.Bool)]out bool inside);
        [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool TerminateJobObject(KernelHandle job,uint exitCode);
        [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool TerminateProcess(KernelHandle process,uint exitCode);
        [DllImport("kernel32.dll",SetLastError=true)] internal static extern uint ResumeThread(KernelHandle thread);
        [DllImport("kernel32.dll",SetLastError=true)] internal static extern uint WaitForSingleObject(KernelHandle handle,uint milliseconds);
        [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool GetExitCodeProcess(KernelHandle process,out uint code);
        [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool QueryFullProcessImageName(KernelHandle process,uint flags,StringBuilder path,ref uint size);
        [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool GetHandleInformation(SafeFileHandle handle,out uint flags);
        [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool InitializeProcThreadAttributeList(IntPtr list,int count,uint flags,ref IntPtr size);
        [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool UpdateProcThreadAttribute(IntPtr list,uint flags,IntPtr attribute,IntPtr value,IntPtr size,IntPtr previous,IntPtr returned);
        [DllImport("kernel32.dll")] internal static extern void DeleteProcThreadAttributeList(IntPtr list);
        [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool CreateProcessAsUser(KernelHandle token,string application,StringBuilder command,IntPtr processSecurity,IntPtr threadSecurity,[MarshalAs(UnmanagedType.Bool)]bool inherit,uint flags,IntPtr environment,string cwd,ref StartupInfoEx startup,out ProcessInformation result);
    }
    internal sealed class NativeBuffer : IDisposable
    {
        internal IntPtr Pointer; internal readonly uint Size;
        internal NativeBuffer(int size) { Check.That(size>0&&size<=1048576,"NATIVE_BUFFER_SIZE");Size=(uint)size;Pointer=Marshal.AllocHGlobal(size); }
        public void Dispose() { if(Pointer!=IntPtr.Zero){Marshal.FreeHGlobal(Pointer);Pointer=IntPtr.Zero;} }
        internal static NativeBuffer Token(KernelHandle token,int kind)
        {
            uint size;bool first=Native.GetTokenInformation(token,kind,IntPtr.Zero,0,out size);
            Check.That(!first&&Marshal.GetLastWin32Error()==122&&size>0&&size<=1048576,"TOKEN_QUERY_SIZE");
            var buffer=new NativeBuffer((int)size);
            try { uint returned;Check.That(Native.GetTokenInformation(token,kind,buffer.Pointer,buffer.Size,out returned)&&returned<=buffer.Size,"TOKEN_QUERY_FAILED");return buffer; }
            catch { buffer.Dispose();throw; }
        }
    }
    internal static class Check
    {
        internal static void That(bool ok,string code) { if(!ok)throw new InvalidOperationException(code); }
        internal static void Windows11() { var os=Environment.OSVersion.Version;That(os.Major==10&&os.Build>=22000&&Environment.Is64BitOperatingSystem&&Environment.Is64BitProcess,"WINDOWS11_X64_REQUIRED"); }
    }
    internal sealed class TokenSnapshot
    {
        internal string UserSid,Integrity; internal bool Restricted,Elevated; internal int SessionId,ElevationType;
        internal readonly Dictionary<string,uint?> Groups=new Dictionary<string,uint?>();
        internal readonly Dictionary<string,bool> Privileges=new Dictionary<string,bool>();
        internal readonly List<string> RestrictedSids=new List<string>();
        internal void Require(string sid)
        {
            Check.That(sid!=null&&System.Text.RegularExpressions.Regex.IsMatch(sid,@"\AS-1-5-80-(?:[0-9]+-){4}[0-9]+\z"),"SERVICE_SID_REQUIRED");
            Check.That(UserSid==sid&&Restricted&&!Elevated&&ElevationType==1&&Integrity=="S-1-16-8192"&&SessionId==0,"FIRST_TOKEN_IDENTITY");
            foreach(string admin in new[]{"S-1-5-32-544","S-1-5-32-547"})Check.That(Groups.ContainsKey(admin)&&(!Groups[admin].HasValue||Groups[admin]==16||Groups[admin]==17),"FIRST_TOKEN_ADMIN_GROUP");
            Check.That(RestrictedSids.Contains(sid)&&Privileges.Count>0,"FIRST_TOKEN_INCOMPLETE");
            foreach(var privilege in Privileges)Check.That(privilege.Key=="SeChangeNotifyPrivilege"||privilege.Key=="SeLockMemoryPrivilege","FIRST_TOKEN_PRIVILEGE");
        }
        internal Dictionary<string,object> Evidence()
        {
            return new Dictionary<string,object>{{"userSid",UserSid},{"restricted",Restricted},{"integrity",Integrity=="S-1-16-8192"?"Medium":"unapproved"},{"integritySid",Integrity},{"elevated",Elevated},{"elevationType",ElevationType},{"sessionId",SessionId},{"groups",Groups},{"privileges",Privileges},{"restrictedSids",RestrictedSids}};
        }
    }
    internal sealed class InitdbEnvironment : IDisposable
    {
        internal IntPtr Block;
        internal InitdbEnvironment(string serviceSid,string instance,string privateCwd)
        {
            var options=new EnumerationOptions { Timeout=TimeSpan.FromSeconds(8),ReturnImmediately=false,Rewindable=false };
            using(var search=new ManagementObjectSearcher(new ManagementScope("root\\cimv2"),new ObjectQuery("SELECT Manufacturer,Model FROM Win32_ComputerSystem"),options))
            using(var rows=search.Get()){int count=0;foreach(ManagementBaseObject row in rows)using(row){count++;Check.That(((string)row["Manufacturer"]=="Oracle Corporation"||(string)row["Manufacturer"]=="innotek GmbH")&&(string)row["Model"]=="VirtualBox","VIRTUALBOX_REQUIRED");}Check.That(count==1,"VIRTUALBOX_AMBIGUOUS");}
            using(var identity=WindowsIdentity.GetCurrent())Check.That(identity.User!=null&&identity.User.Value==serviceSid,"SERVICE_IDENTITY_CHANGED");
            foreach(RegistryView view in new[]{RegistryView.Registry32,RegistryView.Registry64}){
                using(var users=RegistryKey.OpenBaseKey(RegistryHive.Users,view))using(var profile=users.OpenSubKey(serviceSid,false)){Check.That(profile!=null,"SERVICE_PROFILE_NOT_LOADED");RegistrySafe(profile,serviceSid);}
                foreach(RegistryHive hive in new[]{RegistryHive.LocalMachine,RegistryHive.CurrentUser})using(var root=RegistryKey.OpenBaseKey(hive,view))using(var key=root.OpenSubKey(@"Software\Microsoft\Command Processor",false)){
                    RegistrySafe(root,serviceSid);foreach(string ancestor in new[]{"Software",@"Software\Microsoft"})using(var parent=root.OpenSubKey(ancestor,false)){if(parent!=null)RegistrySafe(parent,serviceSid);}
                    if(key!=null)RegistrySafe(key,serviceSid);
                    if(key!=null)foreach(string name in key.GetValueNames())Check.That(!String.Equals(name,"AutoRun",StringComparison.OrdinalIgnoreCase),"CMD_AUTORUN_PRESENT");
                }
            }
            string windows=Environment.GetFolderPath(Environment.SpecialFolder.Windows),system=Path.Combine(windows,"System32");
            Check.That(windows==@"C:\Windows"&&File.Exists(Path.Combine(system,"cmd.exe"))&&Directory.Exists(privateCwd),"CMD_CONTEXT_PATH");
            Storage.Program(Path.Combine(system,"cmd.exe"),serviceSid);
            var values=new SortedDictionary<string,string>(StringComparer.OrdinalIgnoreCase){{"COMSPEC",Path.Combine(system,"cmd.exe")},{"LC_ALL","C"},{"PATH",@"C:\Program Files\PostgreSQL\18\bin;"+system},{"PGDATA",Path.Combine(instance,"data")},{"PGTZ","UTC"},{"SystemRoot",windows},{"TEMP",privateCwd},{"TMP",privateCwd},{"WINDIR",windows}};
            var items=new List<string>();foreach(var item in values){Check.That(item.Value.IndexOf('\0')<0,"ENVIRONMENT_VALUE");items.Add(item.Key+"="+item.Value);}Block=Marshal.StringToHGlobalUni(String.Join("\0",items.ToArray())+"\0\0");
        }
        private static void RegistrySafe(RegistryKey key,string serviceSid)
        {
            var trusted=new HashSet<string>(StringComparer.Ordinal){serviceSid,"S-1-5-18","S-1-5-32-544","S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464"};
            var acl=key.GetAccessControl(System.Security.AccessControl.AccessControlSections.Owner|System.Security.AccessControl.AccessControlSections.Access);Check.That(trusted.Contains(acl.GetOwner(typeof(SecurityIdentifier)).Value),"CMD_REGISTRY_OWNER");var rules=acl.GetAccessRules(true,true,typeof(SecurityIdentifier));Check.That(rules.Count>0,"CMD_REGISTRY_EMPTY_ACL");foreach(System.Security.AccessControl.RegistryAccessRule rule in rules){if(rule.AccessControlType!=System.Security.AccessControl.AccessControlType.Allow||(rule.PropagationFlags&System.Security.AccessControl.PropagationFlags.InheritOnly)!=0||trusted.Contains(rule.IdentityReference.Value))continue;Check.That((((int)rule.RegistryRights)&0x000d0006)==0,"CMD_REGISTRY_FOREIGN_WRITE");}
        }
        public void Dispose() { if(Block!=IntPtr.Zero){Marshal.FreeHGlobal(Block);Block=IntPtr.Zero;} }
    }
    internal static class Tokens
    {
        internal static void RequireServiceContext(string expectedSid)
        {
            KernelHandle token;Check.That(Native.OpenProcessToken(Native.GetCurrentProcess(),8,out token),"SERVICE_TOKEN_OPEN");using(token){var value=Read(token);Check.That(value.UserSid==expectedSid&&value.SessionId==0&&!value.Elevated&&value.ElevationType==1&&value.RestrictedSids.Contains(expectedSid),"SERVICE_TOKEN_CONTEXT");foreach(string admin in new[]{"S-1-5-32-544","S-1-5-32-547"})Check.That(value.Groups[admin]==null||value.Groups[admin]==16||value.Groups[admin]==17,"SERVICE_ADMIN_GROUP");foreach(string name in value.Privileges.Keys)Check.That(name=="SeChangeNotifyPrivilege","SERVICE_PRIVILEGE_EXCESS");}
        }
        internal static string Sid(IntPtr pointer) { Check.That(pointer!=IntPtr.Zero,"TOKEN_SID_MISSING");return new SecurityIdentifier(pointer).Value; }
        private static int IntValue(KernelHandle token,int kind) { using(var b=NativeBuffer.Token(token,kind)){Check.That(b.Size==4,"TOKEN_INTEGER_SIZE");return Marshal.ReadInt32(b.Pointer);} }
        internal static TokenSnapshot Read(KernelHandle token)
        {
            var v=new TokenSnapshot();Check.That(IntValue(token,8)==1,"PRIMARY_TOKEN_REQUIRED");
            using(var b=NativeBuffer.Token(token,1))v.UserSid=Sid(Marshal.ReadIntPtr(b.Pointer));
            using(var b=NativeBuffer.Token(token,25))v.Integrity=Sid(Marshal.ReadIntPtr(b.Pointer));
            v.Elevated=IntValue(token,20)!=0;v.ElevationType=IntValue(token,18);v.SessionId=IntValue(token,12);
            foreach(string admin in new[]{"S-1-5-32-544","S-1-5-32-547"})v.Groups.Add(admin,null);
            int offset=(int)Marshal.OffsetOf(typeof(Native.TokenGroups),"First"),stride=Marshal.SizeOf(typeof(Native.SidAttributes));
            foreach(int kind in new[]{2,11})using(var b=NativeBuffer.Token(token,kind)){
                uint count=(uint)Marshal.ReadInt32(b.Pointer);Check.That(count<=4096&&offset+(long)count*stride<=b.Size,"TOKEN_GROUPS_SIZE");
                for(int i=0;i<count;i++){var row=(Native.SidAttributes)Marshal.PtrToStructure(IntPtr.Add(b.Pointer,offset+i*stride),typeof(Native.SidAttributes));string sid=Sid(row.Sid);if(kind==2){Check.That(!v.Groups.ContainsKey(sid)||v.Groups[sid]==null,"TOKEN_GROUP_DUPLICATE");v.Groups[sid]=row.Attributes;}else{Check.That(!v.RestrictedSids.Contains(sid),"TOKEN_RESTRICTED_DUPLICATE");v.RestrictedSids.Add(sid);}}
            }
            v.Restricted=v.RestrictedSids.Count>0;
            using(var b=NativeBuffer.Token(token,3)){
                uint count=(uint)Marshal.ReadInt32(b.Pointer);offset=(int)Marshal.OffsetOf(typeof(Native.TokenPrivileges),"First");stride=Marshal.SizeOf(typeof(Native.LuidAttributes));Check.That(count>0&&count<=1024&&offset+(long)count*stride<=b.Size,"TOKEN_PRIVILEGES_SIZE");
                for(int i=0;i<count;i++){var row=(Native.LuidAttributes)Marshal.PtrToStructure(IntPtr.Add(b.Pointer,offset+i*stride),typeof(Native.LuidAttributes));uint length=256;var name=new StringBuilder(256);Check.That(Native.LookupPrivilegeName(null,ref row.Luid,name,ref length)&&!v.Privileges.ContainsKey(name.ToString())&&(row.Attributes&~3u)==0,"TOKEN_PRIVILEGE_UNKNOWN");v.Privileges.Add(name.ToString(),(row.Attributes&2)!=0);}
            }
            return v;
        }
        internal static KernelHandle RestrictCurrent(string expectedServiceSid)
        {
            Check.Windows11();Check.That(expectedServiceSid!=null&&expectedServiceSid.StartsWith("S-1-5-80-",StringComparison.Ordinal),"SERVICE_SID_REQUIRED");
            KernelHandle original;Check.That(Native.OpenProcessToken(Native.GetCurrentProcess(),0x8b,out original),"CURRENT_TOKEN_OPEN");
            using(original){var current=Read(original);Check.That(current.UserSid==expectedServiceSid&&current.SessionId==0,"SCM_SERVICE_CONTEXT_REQUIRED");var allocations=new List<NativeBuffer>();
                try{
                    Func<string,Native.SidAttributes> sid=name=>{var id=new SecurityIdentifier(name);var bytes=new byte[id.BinaryLength];id.GetBinaryForm(bytes,0);var block=new NativeBuffer(bytes.Length);allocations.Add(block);Marshal.Copy(bytes,0,block.Pointer,bytes.Length);return new Native.SidAttributes{Sid=block.Pointer,Attributes=0};};
                    var disabled=new[]{sid("S-1-5-32-544"),sid("S-1-5-32-547")};var restricted=new[]{sid(expectedServiceSid),sid("S-1-1-0"),sid("S-1-5-11"),sid("S-1-5-32-545")};KernelHandle result;
                    Check.That(Native.CreateRestrictedToken(original,1,(uint)disabled.Length,disabled,0,IntPtr.Zero,(uint)restricted.Length,restricted,out result),"RESTRICTED_TOKEN_CREATE");
                    try{var integrity=sid("S-1-16-8192");integrity.Attributes=0x20;Check.That(Native.SetTokenInformation(result,25,ref integrity,(uint)(Marshal.SizeOf(typeof(Native.SidAttributes))+new SecurityIdentifier("S-1-16-8192").BinaryLength)),"MEDIUM_INTEGRITY_SET");Read(result).Require(expectedServiceSid);return result;}catch{result.Dispose();throw;}
                }finally{foreach(var b in allocations)b.Dispose();}
            }
        }
    }
    // Los tres handles recibidos deben pertenecer a NUL y logs privados abiertos
    // por el host validado; este objeto nunca acepta comandos o tokens del cliente.
    internal sealed class ContainedInitdb : IDisposable
    {
        private KernelHandle job,process,thread;private FileStream imageLock;private bool assigned,resumed,finished;internal TokenSnapshot FirstToken;internal uint ProcessId;
        private ContainedInitdb() { }
        internal static ContainedInitdb CreateSuspended(KernelHandle restricted,string expectedSid,Guid installationId,string imageSha256,string privateCwd,SafeFileHandle input,SafeFileHandle output,SafeFileHandle error,Func<bool> cancelled=null)
        {return CreateTool(restricted,expectedSid,installationId,imageSha256,privateCwd,input,output,error,false,cancelled);}
        internal static ContainedInitdb CreateControlDataSuspended(KernelHandle restricted,string expectedSid,Guid installationId,string imageSha256,string privateCwd,SafeFileHandle input,SafeFileHandle output,SafeFileHandle error,Func<bool> cancelled=null)
        {return CreateTool(restricted,expectedSid,installationId,imageSha256,privateCwd,input,output,error,true,cancelled);}
        private static ContainedInitdb CreateTool(KernelHandle restricted,string expectedSid,Guid installationId,string imageSha256,string privateCwd,SafeFileHandle input,SafeFileHandle output,SafeFileHandle error,bool controlData,Func<bool> cancelled)
        {
            Check.Windows11();string instance=Path.Combine(@"C:\ProgramData\CommunityTours\Acceptance026",installationId.ToString("D"));
            Check.That(installationId!=Guid.Empty&&privateCwd==Path.Combine(instance,"work"),"INITDB_CONTEXT_REQUIRED");
            string arguments="-D \""+Path.Combine(instance,"data")+"\" -U ctsk_standalone_admin --encoding=UTF8 --locale=C --auth=scram-sha-256 --pwfile=\""+Path.Combine(privateCwd,"initdb-password.tmp")+"\"";
            if(controlData)arguments="\""+Path.Combine(instance,"data")+"\"";
            var state=new ContainedInitdb();IntPtr list=IntPtr.Zero,handles=IntPtr.Zero,jobList=IntPtr.Zero;bool initialized=false;var pinned=new List<SafeFileHandle>();
            try{
                state.job=Native.CreateJobObject(IntPtr.Zero,null);Check.That(!state.job.IsInvalid,"JOB_CREATE");var limits=new Native.ExtendedLimits();limits.Basic.Flags=0x2000;
                Check.That(Native.SetInformationJobObject(state.job,9,ref limits,(uint)Marshal.SizeOf(typeof(Native.ExtendedLimits))),"JOB_LIMITS");
                IntPtr size=IntPtr.Zero;bool first=Native.InitializeProcThreadAttributeList(IntPtr.Zero,2,0,ref size);Check.That(!first&&Marshal.GetLastWin32Error()==122&&size.ToInt64()>0&&size.ToInt64()<=65536,"HANDLE_LIST_SIZE");
                list=Marshal.AllocHGlobal(size);Check.That(Native.InitializeProcThreadAttributeList(list,2,0,ref size),"HANDLE_LIST_CREATE");initialized=true;handles=Marshal.AllocHGlobal(3*IntPtr.Size);
                var inherited=new[]{input,output,error};for(int i=0;i<3;i++){bool held=false;Check.That(inherited[i]!=null&&!inherited[i].IsClosed&&!inherited[i].IsInvalid,"STD_HANDLE_INVALID");inherited[i].DangerousAddRef(ref held);Check.That(held,"STD_HANDLE_REFERENCE");pinned.Add(inherited[i]);uint flags;Check.That(Native.GetHandleInformation(inherited[i],out flags)&&(flags&1)!=0,"STD_HANDLE_NOT_INHERITABLE");Marshal.WriteIntPtr(handles,i*IntPtr.Size,inherited[i].DangerousGetHandle());}
                Check.That(Native.UpdateProcThreadAttribute(list,0,new IntPtr(0x20002),handles,new IntPtr(3*IntPtr.Size),IntPtr.Zero,IntPtr.Zero),"HANDLE_LIST_SET");
                // Asociación al Job en la propia creación: cerrar el intervalo
                // de huérfano suspendido si el host muere antes de AssignProcess.
                jobList=Marshal.AllocHGlobal(IntPtr.Size);Marshal.WriteIntPtr(jobList,state.job.DangerousGetHandle());
                Check.That(Native.UpdateProcThreadAttribute(list,0,new IntPtr(0x2000d),jobList,new IntPtr(IntPtr.Size),IntPtr.Zero,IntPtr.Zero),"JOB_LIST_SET");
                var startup=new Native.StartupInfoEx();startup.Attributes=list;startup.Startup.Size=(uint)Marshal.SizeOf(typeof(Native.StartupInfoEx));startup.Startup.Flags=0x101;startup.Startup.Input=input.DangerousGetHandle();startup.Startup.Output=output.DangerousGetHandle();startup.Startup.Error=error.DangerousGetHandle();
                string image=controlData?@"C:\Program Files\PostgreSQL\18\bin\pg_controldata.exe":@"C:\Program Files\PostgreSQL\18\bin\initdb.exe";Native.ProcessInformation pi;
                Check.That(imageSha256!=null&&System.Text.RegularExpressions.Regex.IsMatch(imageSha256,@"\A[a-f0-9]{64}\z"),"INITDB_REFERENCE_REQUIRED");
                state.imageLock=new FileStream(image,FileMode.Open,FileAccess.Read,FileShare.Read);
                using(var sha=SHA256.Create())Check.That(BitConverter.ToString(sha.ComputeHash(state.imageLock)).Replace("-","").ToLowerInvariant()==imageSha256,"INITDB_IMAGE_CHANGED");
                var version=FileVersionInfo.GetVersionInfo(image);Check.That(version.ProductVersion=="18.6"&&version.FileVersion=="18.0.6.0","INITDB_VERSION");
                using(var environment=new InitdbEnvironment(expectedSid,instance,privateCwd)){
                    Check.That(cancelled==null||!cancelled(),"INITDB_CANCELLED");
                    if(!Native.CreateProcessAsUser(restricted,image,new StringBuilder("\""+image+"\" "+arguments),IntPtr.Zero,IntPtr.Zero,true,0x08080404,environment.Block,privateCwd,ref startup,out pi))throw new NativeFailure("INITDB_CREATE_SUSPENDED",Marshal.GetLastWin32Error());
                }
                state.process=new KernelHandle(pi.Process);state.thread=new KernelHandle(pi.Thread);state.ProcessId=pi.ProcessId;
                state.assigned=true;bool inside;Check.That(Native.IsProcessInJob(state.process,state.job,out inside)&&inside&&state.Active()==1,"JOB_ASSIGN_UNPROVEN");
                uint imageLength=32768;var actualImage=new StringBuilder((int)imageLength);Check.That(Native.QueryFullProcessImageName(state.process,0,actualImage,ref imageLength)&&String.Equals(actualImage.ToString(),image,StringComparison.OrdinalIgnoreCase),"FIRST_PROCESS_IMAGE_MISMATCH");
                KernelHandle independent;Check.That(Native.OpenProcessToken(state.process.DangerousGetHandle(),8,out independent),"FIRST_TOKEN_OPEN");
                using(independent){state.FirstToken=Tokens.Read(independent);state.FirstToken.Require(expectedSid);}
                return state;
            }catch{state.Dispose();throw;}
            finally{foreach(var h in pinned)h.DangerousRelease();if(initialized)Native.DeleteProcThreadAttributeList(list);if(list!=IntPtr.Zero)Marshal.FreeHGlobal(list);if(handles!=IntPtr.Zero)Marshal.FreeHGlobal(handles);if(jobList!=IntPtr.Zero)Marshal.FreeHGlobal(jobList);}
        }
        internal void Resume()
        {
            Check.That(!resumed&&!finished&&assigned&&FirstToken!=null,"INITDB_RESUME_STATE");
            Check.That(Native.ResumeThread(thread)==1,"INITDB_RESUME_FAILED");resumed=true;
        }
        private uint Active()
        {
            Native.Accounting accounting;uint needed;Check.That(Native.QueryInformationJobObject(job,1,out accounting,(uint)Marshal.SizeOf(typeof(Native.Accounting)),out needed),"JOB_QUERY_FAILED");return accounting.ActiveProcesses;
        }
        internal uint Wait(int timeoutMilliseconds,Func<bool> cancelled=null)
        {
            Check.That(resumed&&!finished&&timeoutMilliseconds>0&&timeoutMilliseconds<=180000,"INITDB_WAIT_STATE");var watch=Stopwatch.StartNew();
            while(watch.ElapsedMilliseconds<timeoutMilliseconds){Check.That(cancelled==null||!cancelled(),"INITDB_CANCELLED");uint wait=Native.WaitForSingleObject(process,0);Check.That(wait==0||wait==258,"INITDB_WAIT_FAILED");if(wait==0&&Active()==0){uint code;Check.That(Native.GetExitCodeProcess(process,out code)&&code!=259,"INITDB_EXIT_UNKNOWN");finished=true;return code;}Thread.Sleep(25);}
            throw new InvalidOperationException("INITDB_TIMEOUT");
        }
        public void Dispose()
        {
            bool proven=true;
            try{
                if(process!=null&&!process.IsInvalid&&!finished){
                    if(assigned){if(!Native.TerminateJobObject(job,1))proven=false;}else if(!Native.TerminateProcess(process,1))proven=false;
                    if(Native.WaitForSingleObject(process,10000)!=0)proven=false;
                    if(assigned){var watch=Stopwatch.StartNew();while(watch.ElapsedMilliseconds<10000&&Active()!=0)Thread.Sleep(25);if(Active()!=0)proven=false;}
                }
            }finally{if(thread!=null)thread.Dispose();if(process!=null)process.Dispose();if(job!=null)job.Dispose();if(imageLock!=null)imageLock.Dispose();finished=true;}
            Check.That(proven,"INITDB_CLEANUP_UNPROVEN");
        }
    }
}
