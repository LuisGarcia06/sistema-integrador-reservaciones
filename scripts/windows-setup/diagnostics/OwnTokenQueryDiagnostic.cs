// Read-only ABI diagnostic on this process's own token. No account/privilege changes.
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class OwnTokenQueryDiagnostic
{
    public sealed class TokenHandle : SafeHandleZeroOrMinusOneIsInvalid
    {
        private TokenHandle():base(true){}
        protected override bool ReleaseHandle(){return CloseHandle(handle);}
    }
    [DllImport("kernel32.dll")]private static extern IntPtr GetCurrentProcess();
    [DllImport("kernel32.dll",SetLastError=true)][return:MarshalAs(UnmanagedType.Bool)]private static extern bool CloseHandle(IntPtr handle);
    [DllImport("advapi32.dll",SetLastError=true)][return:MarshalAs(UnmanagedType.Bool)]private static extern bool OpenProcessToken(IntPtr process,uint access,out TokenHandle token);
    [DllImport("advapi32.dll",SetLastError=true)][return:MarshalAs(UnmanagedType.Bool)]private static extern bool GetTokenInformation(TokenHandle token,int kind,IntPtr value,uint size,out uint needed);
    public static object[] ReadSizes()
    {
        TokenHandle token;if(!OpenProcessToken(GetCurrentProcess(),8,out token))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        var rows=new List<object>();using(token)foreach(int kind in new[]{8,1,25,20,18,12,2,11,3}){
            uint size;bool sizing=GetTokenInformation(token,kind,IntPtr.Zero,0,out size);int sizingError=sizing?0:Marshal.GetLastWin32Error();
            bool read=false;int readError=0;uint returned=0;
            if(size>0&&size<=1048576){IntPtr data=Marshal.AllocHGlobal((int)size);try{read=GetTokenInformation(token,kind,data,size,out returned);readError=read?0:Marshal.GetLastWin32Error();}finally{Marshal.FreeHGlobal(data);}}
            rows.Add(new{informationClass=kind,sizingSucceeded=sizing,sizingWin32Error=sizingError,requiredBytes=size,readSucceeded=read,readWin32Error=readError,returnedBytes=returned});
        }return rows.ToArray();
    }
}
