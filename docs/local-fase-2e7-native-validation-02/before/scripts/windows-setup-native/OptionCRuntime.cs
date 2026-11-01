using System;
using System.Collections.Generic;
using System.IO;
using System.Management;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
namespace CommunityTours.Setup026
{
    internal sealed class ProcessLease : IDisposable
    {
        [DllImport("kernel32.dll",SetLastError=true)] private static extern KernelHandle OpenProcess(uint access,[MarshalAs(UnmanagedType.Bool)]bool inherit,uint pid);
        internal KernelHandle Handle;internal uint Pid;
        internal static ProcessLease Open(uint pid,string image,string sid,bool terminate=false)
        {
            Check.That(pid>0,"PROCESS_ID");var v=new ProcessLease{Pid=pid,Handle=OpenProcess(0x101000u|(terminate?1u:0u),false,pid)};
            try{if(v.Handle.IsInvalid)throw new NativeFailure("OWN_PROCESS_ACCESS",Marshal.GetLastWin32Error());uint size=32768;var actual=new StringBuilder((int)size);Check.That(Native.QueryFullProcessImageName(v.Handle,0,actual,ref size)&&String.Equals(actual.ToString(),image,StringComparison.OrdinalIgnoreCase),"OWN_PROCESS_IMAGE");KernelHandle token;Check.That(Native.OpenProcessToken(v.Handle.DangerousGetHandle(),8,out token),"OWN_PROCESS_TOKEN_ACCESS");using(token){var t=Tokens.Read(token);Check.That(t.UserSid==sid&&t.Restricted&&t.RestrictedSids.Contains(sid)&&!t.Elevated&&t.SessionId==0,"OWN_PROCESS_TOKEN");foreach(string admin in new[]{"S-1-5-32-544","S-1-5-32-547"})Check.That(t.Groups[admin]==null||t.Groups[admin]==16||t.Groups[admin]==17,"OWN_PROCESS_ADMIN_GROUP");foreach(string privilege in t.Privileges.Keys)Check.That(privilege=="SeChangeNotifyPrivilege"||privilege=="SeLockMemoryPrivilege","OWN_PROCESS_PRIVILEGE");}return v;}catch{v.Dispose();throw;}
        }
        internal static string User(uint pid)
        {
            using(var handle=OpenProcess(0x1000,false,pid)){if(handle.IsInvalid){int error=Marshal.GetLastWin32Error();if(error==87)return null;throw new NativeFailure("PROCESS_ENUMERATION_ACCESS",error);}KernelHandle token;Check.That(Native.OpenProcessToken(handle.DangerousGetHandle(),8,out token),"PROCESS_ENUMERATION_TOKEN");using(token)using(var b=NativeBuffer.Token(token,1))return Tokens.Sid(Marshal.ReadIntPtr(b.Pointer));}
        }
        internal bool Exited {get{uint status=Native.WaitForSingleObject(Handle,0);Check.That(status==0||status==258,"PROCESS_WAIT_FAILED");return status==0;}}
        public void Dispose(){if(Handle!=null)Handle.Dispose();}
    }
    internal static class Ports
    {
        [DllImport("iphlpapi.dll",SetLastError=true)] private static extern uint GetExtendedTcpTable(IntPtr table,ref uint size,[MarshalAs(UnmanagedType.Bool)]bool order,uint family,uint kind,uint reserved);
        private static List<Tuple<uint,int,string>> Read(uint family)
        {
            uint size=0,code=GetExtendedTcpTable(IntPtr.Zero,ref size,false,family,3,0);Check.That((code==122||code==0)&&size>=4&&size<=1048576,"PORT_TABLE_SIZE");using(var b=new NativeBuffer((int)size)){
                Check.That(GetExtendedTcpTable(b.Pointer,ref size,false,family,3,0)==0,"PORT_TABLE_QUERY");int count=Marshal.ReadInt32(b.Pointer),stride=family==2?24:56;Check.That(count>=0&&4L+(long)count*stride<=size,"PORT_TABLE_FORMAT");var rows=new List<Tuple<uint,int,string>>();for(int i=0;i<count;i++){IntPtr row=IntPtr.Add(b.Pointer,4+i*stride);uint pid=(uint)Marshal.ReadInt32(row,family==2?20:52),port=(uint)Marshal.ReadInt32(row,family==2?8:20);string address;if(family==2)address=new IPAddress((long)(uint)Marshal.ReadInt32(row,4)).ToString();else{var bytes=new byte[16];Marshal.Copy(row,bytes,0,16);address=new IPAddress(bytes).ToString();}rows.Add(Tuple.Create(pid,(int)(ushort)IPAddress.NetworkToHostOrder((short)(port&65535)),address));}return rows;
            }
        }
        internal static bool Free(int port){foreach(uint family in new uint[]{2,23})foreach(var row in Read(family))if(row.Item2==port)return false;return true;}
        internal static void Owned(uint pid,int port){int matches=0;foreach(var row in Read(2)){if(row.Item2==port)Check.That(row.Item1==pid&&row.Item3=="127.0.0.1","PORT_FOREIGN_OR_WILDCARD");if(row.Item1==pid){Check.That(row.Item2==port&&row.Item3=="127.0.0.1","POSTGRES_UNEXPECTED_LISTENER");matches++;}}foreach(var row in Read(23))Check.That(row.Item1!=pid&&row.Item2!=port,"POSTGRES_IPV6_LISTENER");Check.That(matches==1,"PORT_OWNERSHIP_UNPROVEN");}
    }
    internal sealed class RuntimeLease : IDisposable
    {
        internal ProcessLease Service,Postmaster;internal readonly List<ProcessLease> Descendants=new List<ProcessLease>();private readonly HashSet<uint> known=new HashSet<uint>();
        private static Dictionary<uint,uint> Parents()
        {
            var rows=new Dictionary<uint,uint>();var options=new EnumerationOptions{Timeout=TimeSpan.FromSeconds(8),ReturnImmediately=false,Rewindable=false};using(var query=new ManagementObjectSearcher(new ManagementScope("root\\cimv2"),new ObjectQuery("SELECT ProcessId,ParentProcessId FROM Win32_Process"),options))using(var found=query.Get())foreach(ManagementBaseObject row in found)using(row){uint pid=(uint)row["ProcessId"];Check.That(!rows.ContainsKey(pid),"PROCESS_TREE_AMBIGUOUS");rows.Add(pid,(uint)row["ParentProcessId"]);}return rows;
        }
        internal static void RequireNoOwnedProcesses(Installation m)
        {
            var options=new EnumerationOptions{Timeout=TimeSpan.FromSeconds(8),ReturnImmediately=false,Rewindable=false};using(var query=new ManagementObjectSearcher(new ManagementScope("root\\cimv2"),new ObjectQuery("SELECT ProcessId FROM Win32_Process WHERE Name='postgres.exe' OR Name='pg_ctl.exe' OR Name='cmd.exe' OR Name='SetupPostgres.exe'"),options))using(var found=query.Get())foreach(ManagementBaseObject row in found)using(row)Check.That(ProcessLease.User((uint)row["ProcessId"])!=m.ServiceSid,"OWN_PROCESS_SURVIVES");
        }
        internal static string ControlIdentity(Installation m,bool clean)
        {
            string file=Path.Combine(m.Data,"global","pg_control");Storage.Private(file,m);byte[] bytes=new byte[20];using(var s=new FileStream(file,FileMode.Open,FileAccess.Read,FileShare.ReadWrite))Check.That(s.Read(bytes,0,bytes.Length)==bytes.Length,"CONTROL_FILE_SHORT");string id=BitConverter.ToUInt64(bytes,0).ToString(System.Globalization.CultureInfo.InvariantCulture);uint state=BitConverter.ToUInt32(bytes,16);Check.That(System.Text.RegularExpressions.Regex.IsMatch(id,@"\A[0-9]{19,20}\z")&&id!="7632825987452064788"&&(clean?state==1:(state==1||state==6)),"CONTROL_FILE_STATE");return id;
        }
        internal static RuntimeLease Capture(Installation m,string expected)
        {
            var v=new RuntimeLease();try{var service=OfficialServiceConfig.Query(m.Id,m.ServiceSid,m.ActorSid);Check.That(service.State==4,"SERVICE_NOT_RUNNING");v.Service=ProcessLease.Open(service.ProcessId,@"C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe",m.ServiceSid);
                string file=Path.Combine(m.Data,"postmaster.pid");Storage.Private(file,m);string[] lines=File.ReadAllLines(file);uint pid=0;Check.That(lines.Length>=8&&UInt32.TryParse(lines[0],out pid)&&pid>0&&String.Equals(Path.GetFullPath(lines[1]),m.Data,StringComparison.OrdinalIgnoreCase)&&lines[3]==m.Port.ToString(System.Globalization.CultureInfo.InvariantCulture)&&lines[5]=="127.0.0.1"&&lines[7]=="ready","POSTMASTER_FILE_IDENTITY");
                v.Postmaster=ProcessLease.Open(pid,@"C:\Program Files\PostgreSQL\18\bin\postgres.exe",m.ServiceSid);var parents=Parents();Check.That(parents.ContainsKey(pid)&&parents[pid]==service.ProcessId,"POSTMASTER_PARENT");v.known.Add(service.ProcessId);v.known.Add(pid);v.CaptureDescendants(m,parents);Ports.Owned(pid,m.Port);Check.That(ControlIdentity(m,false)==expected&&!v.Service.Exited&&!v.Postmaster.Exited,"RUNTIME_CLUSTER_IDENTITY");return v;
            }catch{v.Dispose();throw;}
        }
        private void CaptureDescendants(Installation m,Dictionary<uint,uint> parents)
        {
            bool changed=true;while(changed){changed=false;foreach(var pair in parents){if(pair.Key==0||known.Contains(pair.Key)||!known.Contains(pair.Value))continue;var lease=ProcessLease.Open(pair.Key,@"C:\Program Files\PostgreSQL\18\bin\postgres.exe",m.ServiceSid);Descendants.Add(lease);known.Add(pair.Key);changed=true;}}
        }
        internal void StopAndVerify(Installation m,string expected)
        {
            CaptureDescendants(m,Parents());ServiceRegistration.RequestStop(m,false);var watch=System.Diagnostics.Stopwatch.StartNew();bool empty=false;
            while(watch.ElapsedMilliseconds<60000){bool all=Service.Exited&&Postmaster.Exited;foreach(var p in Descendants)all&=p.Exited;if(all){empty=true;break;}Thread.Sleep(50);}Check.That(empty,"OFFICIAL_STOP_HANDLES_UNPROVEN");
            uint serviceExit,postmasterExit;Check.That(Native.GetExitCodeProcess(Service.Handle,out serviceExit)&&serviceExit==0&&Native.GetExitCodeProcess(Postmaster.Handle,out postmasterExit)&&postmasterExit==0,"OFFICIAL_STOP_EXIT_CODE");
            var remaining=Parents();foreach(var pair in remaining)Check.That(!known.Contains(pair.Value),"OFFICIAL_DESCENDANT_SURVIVES");RequireNoOwnedProcesses(m);var status=OfficialServiceConfig.Query(m.Id,m.ServiceSid,m.ActorSid);Check.That(status.State==1&&status.Win32ExitCode==0&&Ports.Free(m.Port)&&!File.Exists(Path.Combine(m.Data,"postmaster.pid"))&&ControlIdentity(m,true)==expected,"OFFICIAL_STOP_POSTCONDITIONS");
        }
        public void Dispose(){foreach(var p in Descendants)p.Dispose();if(Postmaster!=null)Postmaster.Dispose();if(Service!=null)Service.Dispose();}
    }
}
