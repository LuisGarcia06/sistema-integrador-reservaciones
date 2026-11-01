using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
namespace CommunityTours.Setup026
{
    internal static class FirmwareIdentity
    {
        [DllImport("kernel32.dll",SetLastError=true)]private static extern uint GetSystemFirmwareTable(uint provider,uint table,IntPtr data,uint length);
        internal static string Capture()
        {
            uint size=GetSystemFirmwareTable(0x52534d42,0,IntPtr.Zero,0);int error=size==0?Marshal.GetLastWin32Error():0;
            var evidence=new Dictionary<string,object>{{"api","GetSystemFirmwareTable"},{"source","SMBIOS-RSMB"},{"phase","size"},{"requiredBytes",size},{"tokenValidated",false},{"jobValidated",false}};
            if(size<8||size>1048576)throw new NativeFailure("FIRMWARE_QUERY_SIZE",error,evidence);
            using(var data=new NativeBuffer((int)size)){
                uint read=GetSystemFirmwareTable(0x52534d42,0,data.Pointer,data.Size);error=read==0?Marshal.GetLastWin32Error():0;
                if(read!=size){evidence["phase"]="read";evidence["returnedBytes"]=read;throw new NativeFailure("FIRMWARE_QUERY_FAILED",error,evidence);}
                byte[] raw=new byte[size];Marshal.Copy(data.Pointer,raw,0,raw.Length);
                try{return SmbiosContract.Fingerprint(raw);}catch(InvalidOperationException failure){evidence["phase"]="parse";evidence["violation"]=failure.Message;throw new NativeFailure(failure.Message,0,evidence);}
            }
        }
        internal static void Require(string expected)
        {Check.That(Contract.Hex(expected),"FIRMWARE_BINDING_REQUIRED");Check.That(Capture()==expected,"FIRMWARE_IDENTITY_CHANGED");}
    }
}
