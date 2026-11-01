#if NATIVE_VALIDATION_ONLY
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Threading;
namespace CommunityTours.Setup026
{
    internal static class ValidationCleanup
    {
        internal static void Complete(Installation m,ProcessLease host)
        {
            var observations=new List<object>();var evidence=new Dictionary<string,object>{{"protocol","ctsk-validation-cleanup-v1"},{"scope",Contract.Scope},{"productionAuthorized",false},{"installationId",m.Id.ToString("D")},{"serviceName",m.Name},{"observations",observations},{"stopRequested",false},{"serviceStopped",false},{"ownedProcessAbsenceProven",false},{"serviceDisabled",false},{"cleanupCompleted",false},{"tokenValidated",false},{"jobValidated",false},{"startedAtUtc",DateTime.UtcNow.ToString("o")}};
            try{
                var clock=Stopwatch.StartNew();
                StopWaitPolicy.Verify(()=>{
                    var state=OfficialServiceConfig.QueryBound(m.Id,m.ServiceSid,m.ActorSid,m.BootstrapCommand,true);
                    // Bounded sample count; retain transitions and the latest state only.
                    if(observations.Count<64)observations.Add(new{elapsedMilliseconds=clock.ElapsedMilliseconds,state=state.State,pid=state.ProcessId,win32Exit=state.Win32ExitCode,serviceExit=state.ServiceSpecificExitCode,checkpoint=state.Checkpoint,waitHint=state.WaitHint});
                    evidence["lastState"]=state.State;evidence["lastPid"]=state.ProcessId;
                    return new StopSample(state.State,state.ProcessId);
                },()=>{evidence["stopRequested"]=true;ServiceRegistration.RequestStop(m,true,10000);},()=>Thread.Sleep(100),()=>clock.ElapsedMilliseconds,45000);
                evidence["serviceStopped"]=true;
                if(host!=null)Check.That(Native.WaitForSingleObject(host.Handle,10000)==0,"VALIDATION_HOST_EXIT_UNPROVEN");
                evidence["hostHandleObserved"]=host!=null;
                RuntimeLease.RequireNoOwnedProcesses(m);evidence["ownedProcessAbsenceProven"]=true;
                ServiceRegistration.DisableStoppedBootstrap(m);evidence["serviceDisabled"]=true;evidence["cleanupCompleted"]=true;evidence["completedAtUtc"]=DateTime.UtcNow.ToString("o");
                Storage.JsonFile(Path.Combine(m.Control,"cleanup-result.json"),evidence,m);
            }catch(Exception error){
                evidence["completedAtUtc"]=DateTime.UtcNow.ToString("o");FailureEvidence.AddTo(evidence,error);
                try{Storage.JsonFile(Path.Combine(m.Control,"cleanup-result.json"),evidence,m);}catch(Exception storage){evidence["persistenceFailure"]=FailureEvidence.Summary(storage);}
                throw new NativeFailure(FailureEvidence.Code(error,"VALIDATION_CLEANUP_FAILED"),FailureEvidence.Win32(error),evidence);
            }
        }
    }
}
#endif
