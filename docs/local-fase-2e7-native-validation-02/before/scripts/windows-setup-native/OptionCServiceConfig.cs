// Acceso SCM acotado al servicio oficial de una instalación. Sin registro,
// cambios de cuentas/políticas, selección libre de servicio ni parada por nombre.
// Compilar junto a OptionCNativePrimitives.cs; sin punto de entrada ejecutable.
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
namespace CommunityTours.Setup026
{
    internal sealed class ServiceHandle : Microsoft.Win32.SafeHandles.SafeHandleZeroOrMinusOneIsInvalid
    {
        private ServiceHandle() : base(true) { }
        protected override bool ReleaseHandle() { return ServiceNative.CloseServiceHandle(handle); }
    }
    internal static class ServiceNative
    {
        [StructLayout(LayoutKind.Sequential)] internal struct Config { internal uint Type,Start,Error;internal IntPtr Binary,Group;internal uint Tag;internal IntPtr Dependencies,Account,Display; }
        [StructLayout(LayoutKind.Sequential)] internal struct Status { internal uint Type,State,Accepted,Win32Exit,ServiceExit,Checkpoint,WaitHint,ProcessId,Flags; }
        [StructLayout(LayoutKind.Sequential)] internal struct FailureActions { internal uint Reset;internal IntPtr Reboot,Command;internal uint Count;internal IntPtr Actions; }
        [StructLayout(LayoutKind.Sequential)] internal struct Action { internal uint Type,Delay; }
        [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] internal static extern ServiceHandle OpenSCManager(string machine,string database,uint access);
        [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] internal static extern ServiceHandle OpenService(ServiceHandle manager,string name,uint access);
        [DllImport("advapi32.dll")] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool CloseServiceHandle(IntPtr handle);
        [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool QueryServiceConfig(ServiceHandle service,IntPtr buffer,uint size,out uint needed);
        [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool QueryServiceConfig2(ServiceHandle service,uint kind,IntPtr buffer,uint size,out uint needed);
        [DllImport("advapi32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool QueryServiceStatusEx(ServiceHandle service,int kind,out Status status,uint size,out uint needed);
        [DllImport("advapi32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool QueryServiceObjectSecurity(ServiceHandle service,uint info,IntPtr buffer,uint size,out uint needed);
        [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] internal static extern ServiceHandle CreateService(ServiceHandle manager,string name,string display,uint access,uint type,uint start,uint error,string command,string group,IntPtr tag,string dependencies,string account,string password);
        [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool ChangeServiceConfig(ServiceHandle service,uint type,uint start,uint error,string command,string group,IntPtr tag,string dependencies,string account,string password,string display);
        [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool ChangeServiceConfig2(ServiceHandle service,uint kind,IntPtr value);
        [DllImport("advapi32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool SetServiceObjectSecurity(ServiceHandle service,uint information,byte[] descriptor);
        [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool StartService(ServiceHandle service,uint count,IntPtr args);
        [DllImport("advapi32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool ControlService(ServiceHandle service,uint control,out Status status);
    }
    internal sealed class OfficialServiceSnapshot
    {
        internal string Name,Account,ServiceSid,ImageCommand;
        internal uint State,ProcessId,StartType,Win32ExitCode;
        internal bool ConfigVerified,AclVerified,RestrictedServiceSid,RecoveryVerified;
        // Este resultado NO certifica token postgres, clúster, puerto o parada.
    }
    internal static class OfficialServiceConfig
    {
        private static string Text(IntPtr pointer) { return pointer==IntPtr.Zero?null:Marshal.PtrToStringUni(pointer); }
        private static NativeBuffer Read(ServiceHandle service,uint kind,bool security=false)
        {
            uint size;bool ok=security?ServiceNative.QueryServiceObjectSecurity(service,5,IntPtr.Zero,0,out size):kind==0?ServiceNative.QueryServiceConfig(service,IntPtr.Zero,0,out size):ServiceNative.QueryServiceConfig2(service,kind,IntPtr.Zero,0,out size);
            Check.That(!ok&&Marshal.GetLastWin32Error()==122&&size>0&&size<=65536,"SERVICE_QUERY_SIZE");var b=new NativeBuffer((int)size);
            try{uint returned;ok=security?ServiceNative.QueryServiceObjectSecurity(service,5,b.Pointer,b.Size,out returned):kind==0?ServiceNative.QueryServiceConfig(service,b.Pointer,b.Size,out returned):ServiceNative.QueryServiceConfig2(service,kind,b.Pointer,b.Size,out returned);Check.That(ok,"SERVICE_QUERY_FAILED");return b;}catch{b.Dispose();throw;}
        }
        private static List<string> Privileges(NativeBuffer b)
        {
            IntPtr pointer=Marshal.ReadIntPtr(b.Pointer);long offset=pointer.ToInt64()-b.Pointer.ToInt64();Check.That(offset>=IntPtr.Size&&offset<b.Size,"SERVICE_PRIVILEGES_POINTER");
            var names=new List<string>();var name=new StringBuilder();bool ended=false;
            for(long i=offset;i+1<b.Size;i+=2){char ch=(char)Marshal.ReadInt16(b.Pointer,(int)i);if(ch=='\0'){if(name.Length==0){ended=true;break;}Check.That(name.Length<256&&!names.Contains(name.ToString()),"SERVICE_PRIVILEGES_DUPLICATE");names.Add(name.ToString());name.Length=0;}else name.Append(ch);}
            Check.That(ended&&names.Count>0,"SERVICE_PRIVILEGES_INCOMPLETE");return names;
        }
        internal static OfficialServiceSnapshot Query(Guid installationId,string serviceSid,string actorSid)
        { return QueryBound(installationId,serviceSid,actorSid,null,false); }
        internal static OfficialServiceSnapshot QueryBound(Guid installationId,string serviceSid,string actorSid,string bootstrapCommand,bool pending,bool disabled=false)
        {
            Check.Windows11();Check.That(installationId!=Guid.Empty&&new SecurityIdentifier(serviceSid).Value==serviceSid&&serviceSid.StartsWith("S-1-5-80-",StringComparison.Ordinal)&&new SecurityIdentifier(actorSid).Value==actorSid&&actorSid.StartsWith("S-1-5-21-",StringComparison.Ordinal),"SERVICE_BINDING_REQUIRED");
            string name="CTSK026-"+installationId.ToString("D"),account=@"NT SERVICE\"+name,data=System.IO.Path.Combine(@"C:\ProgramData\CommunityTours\Acceptance026",installationId.ToString("D"),"data");
            string command="\"C:\\Program Files\\PostgreSQL\\18\\bin\\pg_ctl.exe\" runservice -N \""+name+"\" -D \""+data+"\" -w -t 60";
            if(bootstrapCommand!=null){var m=new Installation{Id=installationId};Check.That(bootstrapCommand==m.BootstrapCommand,"BOOTSTRAP_COMMAND");command=bootstrapCommand;}
            var v=new OfficialServiceSnapshot{Name=name,Account=account,ServiceSid=serviceSid,ImageCommand=command};
            using(var manager=ServiceNative.OpenSCManager(null,null,1)){
                Check.That(!manager.IsInvalid,"SCM_CONNECT");using(var service=ServiceNative.OpenService(manager,name,0x20005)){
                    Check.That(!service.IsInvalid,"OWN_SERVICE_OPEN");
                    using(var b=Read(service,0)){var c=(ServiceNative.Config)Marshal.PtrToStructure(b.Pointer,typeof(ServiceNative.Config));Check.That(c.Type==16&&(disabled?c.Start==4:(c.Start==2||c.Start==3))&&c.Error==1&&Text(c.Binary)==command&&String.Equals(Text(c.Account),account,StringComparison.OrdinalIgnoreCase)&&String.IsNullOrEmpty(Text(c.Dependencies)),"SERVICE_CONFIG_MISMATCH");v.StartType=c.Start;}
                    Check.That(((SecurityIdentifier)new NTAccount(account).Translate(typeof(SecurityIdentifier))).Value==serviceSid,"SERVICE_ACCOUNT_SID");
                    using(var b=Read(service,5))Check.That(b.Size>=4&&Marshal.ReadInt32(b.Pointer)==3,"SERVICE_SID_NOT_RESTRICTED");v.RestrictedServiceSid=true;
                    using(var b=Read(service,6))foreach(string privilege in Privileges(b))Check.That(privilege=="SeChangeNotifyPrivilege"||privilege=="SeLockMemoryPrivilege","SERVICE_PRIVILEGE_EXCESS");
                    using(var b=Read(service,2)){
                        var f=(ServiceNative.FailureActions)Marshal.PtrToStructure(b.Pointer,typeof(ServiceNative.FailureActions));Check.That(String.IsNullOrEmpty(Text(f.Reboot))&&String.IsNullOrEmpty(Text(f.Command)),"SERVICE_RECOVERY_COMMAND");
                        Check.That(bootstrapCommand!=null?(f.Reset==0&&f.Count==0):(f.Reset==86400&&f.Count==3),"SERVICE_RECOVERY_CONFIG");
                        long offset=f.Actions.ToInt64()-b.Pointer.ToInt64();int stride=Marshal.SizeOf(typeof(ServiceNative.Action));Check.That(f.Count==0||(offset>=0&&offset+(long)f.Count*stride<=b.Size),"SERVICE_RECOVERY_SIZE");
                        for(int i=0;i<f.Count;i++){var a=(ServiceNative.Action)Marshal.PtrToStructure(IntPtr.Add(f.Actions,i*stride),typeof(ServiceNative.Action));Check.That(a.Type==(i<2?1u:0u)&&a.Delay==(i==0?10000u:i==1?30000u:0u),"SERVICE_RECOVERY_ACTION");}
                    }using(var b=Read(service,4))Check.That(b.Size>=4&&Marshal.ReadInt32(b.Pointer)==(bootstrapCommand==null?1:0),"SERVICE_FAILURE_ACTIONS_FLAG");v.RecoveryVerified=true;
                    using(var b=Read(service,0,true)){
                        var bytes=new byte[b.Size];Marshal.Copy(b.Pointer,bytes,0,bytes.Length);var sd=new RawSecurityDescriptor(bytes,0);var trusted=new HashSet<string>(StringComparer.Ordinal){"S-1-5-18","S-1-5-32-544",actorSid};Check.That(sd.Owner!=null&&trusted.Contains(sd.Owner.Value)&&sd.DiscretionaryAcl!=null&&sd.DiscretionaryAcl.Count>0,"SERVICE_SECURITY_DESCRIPTOR");
                        foreach(GenericAce ace in sd.DiscretionaryAcl){var allowed=ace as QualifiedAce;if(allowed==null)throw new InvalidOperationException("SERVICE_ACE_UNKNOWN");if(allowed.AceQualifier!=AceQualifier.AccessAllowed)continue;Check.That((allowed.AceFlags&AceFlags.InheritOnly)==0,"SERVICE_ACE_AMBIGUOUS");if(!trusted.Contains(allowed.SecurityIdentifier.Value))Check.That((allowed.AccessMask&unchecked((int)0xf00d0172))==0,"SERVICE_FOREIGN_CONTROL");}
                    }v.AclVerified=true;
                    ServiceNative.Status status;uint returned;Check.That(ServiceNative.QueryServiceStatusEx(service,0,out status,(uint)Marshal.SizeOf(typeof(ServiceNative.Status)),out returned)&&status.Type==16,"SERVICE_STATUS_FAILED");
                    Check.That((status.State==1&&status.ProcessId==0)||(status.State==4&&status.ProcessId>0)||(pending&&(status.State==2||status.State==3)),"SERVICE_STATE_AMBIGUOUS");v.State=status.State;v.ProcessId=status.ProcessId;v.Win32ExitCode=status.Win32Exit;v.ConfigVerified=true;return v;
                }
            }
        }
    }
}
