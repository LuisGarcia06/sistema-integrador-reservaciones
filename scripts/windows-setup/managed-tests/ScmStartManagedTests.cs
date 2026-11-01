// Managed fixture harness only. Does not call SCM, tokens, jobs, UAC, DPAPI, SQL or network.
using System;
using System.Collections.Generic;
using System.Linq;
namespace CommunityTours.Setup026
{
    internal static class ScmStartManagedTests
    {
        private static int assertions;
        private static void Assert(bool value,string name){if(!value)throw new Exception(name);assertions++;}
        public static int Main()
        {
            foreach(int code in new[]{0,2,3,5,193,1053,1067,1069}){
                var order=new List<string>();int current=code;
                var call=ScmStartCall.Capture(()=>{order.Add("start");return false;},()=>{order.Add("last-error");return current;});
                current=0;order.Add("later-query");
                Assert(String.Join(",",order)=="start,last-error,later-query","capture-order");
                Assert(!call.Accepted&&call.Error==code,"retain-original-code");
                var evidence=call.Evidence();Assert(!(bool)evidence["complete"],"not-native-proof");
                Assert((bool)evidence["win32ErrorAvailable"]==(code>0),"zero-is-unknown");
                var failure=call.Failure(evidence);Assert(failure.Message=="OWN_SERVICE_START_FAILED"&&failure.Win32Code==code,"failure-even-zero");
                FailureEvidence.PreservePrimary(failure,new NativeFailure("CLEANUP_FIXTURE",5));
                var output=new Dictionary<string,object>{{"complete",false}};FailureEvidence.AddTo(output,failure);
                var roundtrip=Contract.Object(System.Text.Encoding.UTF8.GetBytes(Contract.Json.Serialize(output)));
                Assert((int)roundtrip["win32Error"]==code&&!(bool)roundtrip["complete"],"json-retains-error");
                Assert(roundtrip.ContainsKey("nativeDiagnostics")&&roundtrip.ContainsKey("secondaryFailure"),"cleanup-retains-primary");
            }
            int read=0;var accepted=ScmStartCall.Capture(()=>true,()=>{read++;return 999;});
            Assert(accepted.Accepted&&accepted.Error==0&&read==0,"accepted-does-not-read-stale-error");
            Assert(!(bool)accepted.Evidence()["complete"],"SCM-acceptance-is-not-token-proof");
            bool rejected=false;try{accepted.Failure(new Dictionary<string,object>());}catch(InvalidOperationException){rejected=true;}
            Assert(rejected,"cannot-label-accepted-call-as-native-failure");
            Console.WriteLine("managed assertions="+assertions+"; SCM/token/Job/UAC/network calls=0; fixture-only");return 0;
        }
    }
}
