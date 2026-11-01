// Pure contracts: native calls and handles remain in their existing owners.
using System;
namespace CommunityTours.Setup026
{
    public enum TokenQueryPurpose { Unspecified,BoundProcess,ServiceContext,ServiceReceipt,CurrentService,RestrictedCandidate,SuspendedChild,EnumerationUser }
    public static class TokenQueryPolicy
    {
        public static bool KnownClass(int kind){return kind==1||kind==2||kind==3||kind==8||kind==11||kind==12||kind==18||kind==20||kind==25;}
        public static bool Fixed(int kind){return kind==8||kind==12||kind==18||kind==20;}
        public static uint Minimum(int kind){return Fixed(kind)?4u:kind==3?4u:kind==2||kind==11?(uint)IntPtr.Size:(uint)(2*IntPtr.Size);}
        public static string SizeViolation(int kind,bool success,int error,uint bytes)
        {
            if(!KnownClass(kind))return "unsupported-class";
            if(success)return "unexpected-sizing-success";
            // TokenElevation uses ERROR_BAD_LENGTH on supported Windows systems.
            // Accept it ONLY for this known fixed layout, with the exact DWORD size.
            if(error!=122&&!(kind==20&&error==24&&bytes==4))return "unexpected-sizing-error";
            if(bytes<Minimum(kind)||bytes>1048576)return "size-out-of-range";
            if(Fixed(kind)&&bytes!=4)return "fixed-layout-size";
            return null;
        }
        public static string ReadViolation(int kind,bool success,uint returned,uint capacity)
        {
            if(!success)return "native-read-failed";
            if(returned!=capacity||returned<Minimum(kind))return "returned-length-changed";
            if(Fixed(kind)&&returned!=4)return "fixed-layout-size";
            return null;
        }
    }
    public sealed class StopSample {public uint State,Pid;public StopSample(uint state,uint pid){State=state;Pid=pid;}}
    public static class StopWaitPolicy
    {
        public static void Verify(Func<StopSample> query,Action requestStop,Action pause,Func<long> elapsed,int timeout)
        {
            if(timeout<=0||timeout>60000)throw new InvalidOperationException("VALIDATION_STOP_TIMEOUT_RANGE");
            bool requested=false;
            while(elapsed()<timeout){
                var state=query();
                if(state.State==1&&state.Pid==0)return;
                if(state.State!=2&&state.State!=3&&state.State!=4)throw new InvalidOperationException("VALIDATION_SERVICE_STOP_UNPROVEN");
                if(!requested&&state.State!=3){requestStop();requested=true;}
                pause();
            }
            throw new InvalidOperationException("VALIDATION_SERVICE_STOP_UNPROVEN");
        }
    }
}
