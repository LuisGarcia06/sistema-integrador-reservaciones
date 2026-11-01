using System;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
namespace CommunityTours.Setup026
{
    internal static class ServiceRegistration
    {
        private const uint Unchanged=0xffffffff;
        internal static void RequireAdministrator(){using(var identity=WindowsIdentity.GetCurrent())Check.That(new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator),"SERVICE_ADMIN_REQUIRED");}
        private static void IntConfig(ServiceHandle service,uint kind,int value){using(var b=new NativeBuffer(4)){Marshal.WriteInt32(b.Pointer,value);Check.That(ServiceNative.ChangeServiceConfig2(service,kind,b.Pointer),"SERVICE_CONFIG_WRITE");}}
        private static void Privileges(ServiceHandle service)
        {
            IntPtr text=Marshal.StringToHGlobalUni("SeChangeNotifyPrivilege\0\0");try{using(var b=new NativeBuffer(IntPtr.Size)){Marshal.WriteIntPtr(b.Pointer,text);Check.That(ServiceNative.ChangeServiceConfig2(service,6,b.Pointer),"SERVICE_REQUIRED_PRIVILEGES");}}finally{Marshal.FreeHGlobal(text);}
        }
        private static void Recovery(ServiceHandle service,bool enabled)
        {
            IntPtr actions=IntPtr.Zero;try{
                var f=new ServiceNative.FailureActions();if(enabled){int stride=Marshal.SizeOf(typeof(ServiceNative.Action));actions=Marshal.AllocHGlobal(3*stride);Marshal.StructureToPtr(new ServiceNative.Action{Type=1,Delay=10000},actions,false);Marshal.StructureToPtr(new ServiceNative.Action{Type=1,Delay=30000},IntPtr.Add(actions,stride),false);Marshal.StructureToPtr(new ServiceNative.Action{Type=0,Delay=0},IntPtr.Add(actions,2*stride),false);f.Reset=86400;f.Count=3;f.Actions=actions;}
                using(var b=new NativeBuffer(Marshal.SizeOf(typeof(ServiceNative.FailureActions)))){Marshal.StructureToPtr(f,b.Pointer,false);Check.That(ServiceNative.ChangeServiceConfig2(service,2,b.Pointer),"SERVICE_RECOVERY_WRITE");}IntConfig(service,4,enabled?1:0);
            }finally{if(actions!=IntPtr.Zero)Marshal.FreeHGlobal(actions);}
        }
        private static void Security(ServiceHandle service,string actor,bool runtime)
        {
            // SY/BA administran. El operador solo consulta/inicia/para su servicio.
            var sd=new RawSecurityDescriptor("O:BAG:BAD:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;"+(runtime?"CCLCSWRPWPLOCRRC":"CCLCSWLOCRRC")+";;;"+actor+")");var bytes=new byte[sd.BinaryLength];sd.GetBinaryForm(bytes,0);Check.That(ServiceNative.SetServiceObjectSecurity(service,5,bytes),"SERVICE_ACL_WRITE");
        }
        internal static void RegisterDisabledBootstrap(Installation m)
        {
            RequireAdministrator();Check.That(!System.IO.Directory.Exists(m.Directory),"INSTANCE_EXISTS_REVIEW");
            using(var manager=ServiceNative.OpenSCManager(null,null,3)){Check.That(!manager.IsInvalid,"SCM_CREATE_ACCESS");
                using(var service=ServiceNative.CreateService(manager,m.Name,"Community Tours acceptance "+m.Id.ToString("D"),0xf01ff,16,4,1,m.BootstrapCommand,null,IntPtr.Zero,null,m.Account,null)){
                    // No OpenService como fallback: un nombre existente nunca se adopta.
                    if(service.IsInvalid)throw new NativeFailure("SERVICE_CREATE_REVIEW",Marshal.GetLastWin32Error());m.ServiceSid=((SecurityIdentifier)new NTAccount(m.Account).Translate(typeof(SecurityIdentifier))).Value;
                    Check.That(System.Text.RegularExpressions.Regex.IsMatch(m.ServiceSid,@"\AS-1-5-80-(?:[0-9]+-){4}[0-9]+\z"),"SERVICE_SID_RESOLUTION");IntConfig(service,5,3);Privileges(service);Recovery(service,false);Security(service,m.ActorSid,false);
                }
            }
        }
        internal static void EnableBootstrap(Installation m)
        {
            RequireAdministrator();Storage.Program(m.Host,m.ActorSid);using(var manager=ServiceNative.OpenSCManager(null,null,1))using(var service=ServiceNative.OpenService(manager,m.Name,2|4)){
                Check.That(!manager.IsInvalid&&!service.IsInvalid,"OWN_SERVICE_OPEN");ServiceNative.Status status;uint bytes;Check.That(ServiceNative.QueryServiceStatusEx(service,0,out status,(uint)Marshal.SizeOf(typeof(ServiceNative.Status)),out bytes)&&status.State==1&&status.ProcessId==0,"SERVICE_NOT_STOPPED");
                Check.That(ServiceNative.ChangeServiceConfig(service,Unchanged,3,Unchanged,null,null,IntPtr.Zero,null,null,null,null),"BOOTSTRAP_ENABLE");
            }OfficialServiceConfig.QueryBound(m.Id,m.ServiceSid,m.ActorSid,m.BootstrapCommand,false);
        }
        internal static void StartBound(Installation m,bool bootstrap)
        {
            var before=OfficialServiceConfig.QueryBound(m.Id,m.ServiceSid,m.ActorSid,bootstrap?m.BootstrapCommand:null,false);Check.That(before.State==1,"SERVICE_ALREADY_RUNNING_REVIEW");
            using(var manager=ServiceNative.OpenSCManager(null,null,1))using(var service=ServiceNative.OpenService(manager,m.Name,16)){Check.That(!service.IsInvalid,"OWN_SERVICE_START_ACCESS");Check.That(ServiceNative.StartService(service,0,IntPtr.Zero),"OWN_SERVICE_START_FAILED");}
        }
        internal static void RequestStop(Installation m,bool bootstrap)
        {
            var watch=System.Diagnostics.Stopwatch.StartNew();while(watch.ElapsedMilliseconds<60000){var before=OfficialServiceConfig.QueryBound(m.Id,m.ServiceSid,m.ActorSid,bootstrap?m.BootstrapCommand:null,true);if(before.State==1||before.State==3)return;
                Check.That(before.State==4||before.State==2,"SERVICE_STOP_STATE");using(var manager=ServiceNative.OpenSCManager(null,null,1))using(var service=ServiceNative.OpenService(manager,m.Name,32)){
                    Check.That(!service.IsInvalid,"OWN_SERVICE_STOP_ACCESS");ServiceNative.Status ignored;if(ServiceNative.ControlService(service,1,out ignored))return;int error=Marshal.GetLastWin32Error();if(error!=1061&&error!=1062)throw new NativeFailure("OWN_SERVICE_STOP_FAILED",error);
                }System.Threading.Thread.Sleep(100);
            }throw new InvalidOperationException("OWN_SERVICE_STOP_TIMEOUT");
            // Esto es una solicitud: el llamador DEBE esperar handles, árbol,
            // puerto y estado limpio. No devuelve una parada certificada.
        }
        internal static void PromoteOfficial(Installation m)
        {
            RequireAdministrator();var before=OfficialServiceConfig.QueryBound(m.Id,m.ServiceSid,m.ActorSid,m.BootstrapCommand,false);Check.That(before.State==1,"BOOTSTRAP_STILL_RUNNING");
            using(var manager=ServiceNative.OpenSCManager(null,null,1))using(var service=ServiceNative.OpenService(manager,m.Name,0xc0002)){
                Check.That(!service.IsInvalid,"OWN_SERVICE_CONFIG_ACCESS");Check.That(ServiceNative.ChangeServiceConfig(service,Unchanged,3,Unchanged,m.OfficialCommand,null,IntPtr.Zero,null,null,null,null),"OFFICIAL_SERVICE_TRANSITION");Recovery(service,true);Security(service,m.ActorSid,true);
            }OfficialServiceConfig.Query(m.Id,m.ServiceSid,m.ActorSid);
        }
    }
}
