using System;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Diagnostics;
namespace CommunityTours.Setup026
{
    internal sealed class ControllerLifetime : IDisposable
    {
        [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] private struct ProcessEntry {internal uint Size,Usage,Pid;internal UIntPtr Heap;internal uint Module,Threads,Parent;internal int Priority;internal uint Flags;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=260)]internal string Name;}
        [DllImport("kernel32.dll",SetLastError=true)] private static extern KernelHandle CreateToolhelp32Snapshot(uint flags,uint pid);
        [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] private static extern bool Process32First(KernelHandle snapshot,ref ProcessEntry entry);
        [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] private static extern bool Process32Next(KernelHandle snapshot,ref ProcessEntry entry);
        [DllImport("kernel32.dll",SetLastError=true)] private static extern KernelHandle OpenProcess(uint access,[MarshalAs(UnmanagedType.Bool)]bool inherit,uint pid);
        [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] private static extern bool GetProcessTimes(KernelHandle process,out long creation,out long exit,out long kernel,out long user);
        [DllImport("advapi32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] private static extern bool GetKernelObjectSecurity(IntPtr handle,uint info,IntPtr buffer,uint length,out uint needed);
        [DllImport("advapi32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] private static extern bool SetKernelObjectSecurity(IntPtr handle,uint info,byte[] descriptor);
        private KernelHandle owner;private byte[] original;private bool grant;
        internal static ControllerLifetime Parent()
        {
            uint mine;using(var p=Process.GetCurrentProcess())mine=(uint)p.Id;uint parent=0;using(var snapshot=CreateToolhelp32Snapshot(2,0)){Check.That(!snapshot.IsInvalid,"CALLER_SNAPSHOT");var entry=new ProcessEntry{Size=(uint)Marshal.SizeOf(typeof(ProcessEntry))};bool ok=Process32First(snapshot,ref entry);while(ok){if(entry.Pid==mine){parent=entry.Parent;break;}ok=Process32Next(snapshot,ref entry);}}
            Check.That(parent>0,"CALLER_PARENT");var result=new ControllerLifetime{owner=OpenProcess(0x101000,false,parent)};try{Check.That(!result.owner.IsInvalid,"CALLER_PARENT_ACCESS");long created,exited,kernel,user;long mineCreated;using(var p=Process.GetCurrentProcess())mineCreated=p.StartTime.ToUniversalTime().ToFileTimeUtc();Check.That(GetProcessTimes(result.owner,out created,out exited,out kernel,out user)&&created<=mineCreated,"CALLER_PARENT_REUSED");return result;}catch{result.Dispose();throw;}
        }
        internal static ControllerLifetime Grant(string sid)
        {
            uint size;Check.That(!GetKernelObjectSecurity(Native.GetCurrentProcess(),4,IntPtr.Zero,0,out size)&&Marshal.GetLastWin32Error()==122&&size>0&&size<=65536,"CONTROLLER_DACL_SIZE");
            using(var b=new NativeBuffer((int)size)){uint returned;Check.That(GetKernelObjectSecurity(Native.GetCurrentProcess(),4,b.Pointer,b.Size,out returned),"CONTROLLER_DACL_READ");var bytes=new byte[size];Marshal.Copy(b.Pointer,bytes,0,bytes.Length);var descriptor=new RawSecurityDescriptor(bytes,0);Check.That(descriptor.DiscretionaryAcl!=null,"CONTROLLER_DACL_NULL");descriptor.DiscretionaryAcl.InsertAce(descriptor.DiscretionaryAcl.Count,new CommonAce(AceFlags.None,AceQualifier.AccessAllowed,0x101000,new SecurityIdentifier(sid),false,null));var updated=new byte[descriptor.BinaryLength];descriptor.GetBinaryForm(updated,0);Check.That(SetKernelObjectSecurity(Native.GetCurrentProcess(),4,updated),"CONTROLLER_DACL_GRANT");return new ControllerLifetime{original=bytes,grant=true};}
        }
        internal static ControllerLifetime Open(Installation m)
        {
            // El SID del controlador se captura de WindowsIdentity y queda en
            // intent.json, escribible solo por SY/BA. Para vida/muerte bastan el
            // handle, creación e imagen; no se concede acceso a su token.
            var result=new ControllerLifetime{owner=OpenProcess(0x101000,false,m.ControllerPid)};try{Check.That(!result.owner.IsInvalid,"CONTROLLER_PROCESS_ACCESS");long created,exited,kernel,user;Check.That(GetProcessTimes(result.owner,out created,out exited,out kernel,out user)&&created==m.ControllerCreated,"CONTROLLER_PROCESS_REUSED");uint length=32768;var image=new StringBuilder((int)length);Check.That(Native.QueryFullProcessImageName(result.owner,0,image,ref length)&&String.Equals(image.ToString(),m.ControllerImage,StringComparison.OrdinalIgnoreCase),"CONTROLLER_IMAGE_MISMATCH");return result;}catch{result.Dispose();throw;}
        }
        internal bool Exited {get{uint value=Native.WaitForSingleObject(owner,0);Check.That(value==0||value==258,"CONTROLLER_WAIT_FAILED");return value==0;}}
        public void Dispose(){if(owner!=null)owner.Dispose();if(grant){grant=false;Check.That(SetKernelObjectSecurity(Native.GetCurrentProcess(),4,original),"CONTROLLER_DACL_RESTORE");}}
    }
}
