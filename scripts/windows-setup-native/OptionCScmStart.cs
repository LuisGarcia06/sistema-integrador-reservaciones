// SCM call result capture and bounded evidence. No generic exception text or secrets.
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
namespace CommunityTours.Setup026
{
    internal sealed class ScmStartCall
    {
        internal readonly bool Accepted;internal readonly int Error;internal readonly long ElapsedMilliseconds;
        private ScmStartCall(bool accepted,int error,long elapsed){Accepted=accepted;Error=error;ElapsedMilliseconds=elapsed;}
        internal static ScmStartCall Capture(Func<bool> start,Func<int> lastError)
        {
            var clock=Stopwatch.StartNew();
            bool accepted=start();
            int error=accepted?0:lastError(); // FIRST action after failed P/Invoke: retain cached Win32 error.
            clock.Stop();return new ScmStartCall(accepted,error,clock.ElapsedMilliseconds);
        }
        internal Dictionary<string,object> Evidence()
        {return new Dictionary<string,object>{{"api","StartServiceW"},{"accepted",Accepted},{"win32Error",Error},{"win32ErrorAvailable",!Accepted&&Error>0},{"elapsedMilliseconds",ElapsedMilliseconds},{"complete",false},{"tokenValidated",false},{"jobValidated",false}};}
        internal NativeFailure Failure(Dictionary<string,object> evidence)
        {if(Accepted)throw new InvalidOperationException("SCM_CALL_ACCEPTED_IS_NOT_FAILURE");return new NativeFailure("OWN_SERVICE_START_FAILED",Error,evidence);}
    }
    internal static class FailureEvidence
    {
        internal static string Code(Exception error,string fallback)
        {return System.Text.RegularExpressions.Regex.IsMatch(error.Message??"",@"\A[A-Z0-9_]{1,96}\z")?error.Message:fallback;}
        internal static int Win32(Exception error){var native=error as NativeFailure;if(native!=null)return native.Win32Code;var win32=error as Win32Exception;return win32==null?0:win32.NativeErrorCode;}
        internal static Dictionary<string,object> Summary(Exception error)
        {return new Dictionary<string,object>{{"code",Code(error,"NATIVE_EXCEPTION")},{"win32Error",Win32(error)},{"win32ErrorAvailable",Win32(error)>0},{"hresult",error.HResult},{"exceptionType",error.GetType().FullName}};}
        internal static void AddTo(Dictionary<string,object> result,Exception error)
        {
            result["win32Error"]=Win32(error);result["win32ErrorAvailable"]=Win32(error)>0;result["exceptionType"]=error.GetType().FullName;result["hresult"]=error.HResult;
            var native=error as NativeFailure;if(native!=null&&native.Diagnostics!=null)result["nativeDiagnostics"]=native.Diagnostics;
            var management=error as System.Management.ManagementException;if(management!=null)result["managementStatus"]=(int)management.ErrorCode;
            if(error.Data.Contains("ctsk-secondary-failures"))result["secondaryFailures"]=error.Data["ctsk-secondary-failures"];
            if(error.Data.Contains("ctsk-secondary-failure"))result["secondaryFailure"]=error.Data["ctsk-secondary-failure"];
        }
        internal static void PreservePrimary(Exception primary,Exception cleanup)
        {if(primary==null)throw cleanup;if(!primary.Data.Contains("ctsk-secondary-failure"))primary.Data["ctsk-secondary-failure"]=Summary(cleanup);var failures=primary.Data["ctsk-secondary-failures"] as List<Dictionary<string,object>>;if(failures==null){failures=new List<Dictionary<string,object>>();primary.Data["ctsk-secondary-failures"]=failures;}var details=Summary(cleanup);var native=cleanup as NativeFailure;if(native!=null&&native.Diagnostics!=null)details["nativeDiagnostics"]=native.Diagnostics;failures.Add(details);}
    }
    internal static class ScmStartDiagnostics
    {
        private static Dictionary<string,object> Status(ServiceHandle service)
        {
            ServiceNative.Status status;uint bytes;
            bool ok=ServiceNative.QueryServiceStatusEx(service,0,out status,(uint)Marshal.SizeOf(typeof(ServiceNative.Status)),out bytes);
            int error=ok?0:Marshal.GetLastWin32Error();
            var value=new Dictionary<string,object>{{"querySucceeded",ok},{"queryWin32Error",error}};
            if(ok){value["state"]=status.State;value["pid"]=status.ProcessId;value["serviceWin32ExitCode"]=status.Win32Exit;value["serviceSpecificExitCode"]=status.ServiceExit;value["checkpoint"]=status.Checkpoint;value["waitHint"]=status.WaitHint;}
            return value;
        }
        private static object[] Acls(Installation m)
        {
            var records=new List<object>();foreach(string file in new[]{m.Directory,m.Control,m.Work,m.Data,m.Host}){
                bool directory=Directory.Exists(file);Storage.Private(file,m,directory);
                FileSystemSecurity acl=directory?(FileSystemSecurity)new DirectoryInfo(file).GetAccessControl(AccessControlSections.Owner|AccessControlSections.Access):new FileInfo(file).GetAccessControl(AccessControlSections.Owner|AccessControlSections.Access);
                records.Add(new{path=file,directory=directory,sddl=acl.GetSecurityDescriptorSddlForm(AccessControlSections.Owner|AccessControlSections.Access)});
            }return records.ToArray();
        }
        internal static void Start(Installation m,bool bootstrap,OfficialServiceSnapshot before)
        {
            // Configuration query is observational. Never adopt an existing name or change its account/ACL.
            var evidence=new Dictionary<string,object>{{"protocol","ctsk-scm-start-v1"},{"scope",Contract.Scope},{"productionAuthorized",false},{"complete",false},{"installationId",m.Id.ToString("D")},{"serviceName",m.Name},{"serviceAccount",before.Account},{"serviceSid",before.ServiceSid},{"imageCommand",before.ImageCommand},{"serviceSddl",before.SecuritySddl},{"requiredPrivileges",before.RequiredPrivileges},{"restrictedServiceSid",before.RestrictedServiceSid},{"observedAtUtc",DateTime.UtcNow.ToString("o")},{"startAttempts",1},{"tokenValidated",false},{"jobValidated",false},{"containmentValidated",false}};
            if(bootstrap){Storage.Program(m.Host,m.ActorSid);Check.That(Contract.Hash(File.ReadAllBytes(m.Host))==m.HostHash,"BOOTSTRAP_IMAGE_CHANGED");evidence["hostSha256"]=m.HostHash;evidence["fileAcls"]=Acls(m);Storage.JsonFile(Path.Combine(m.Control,"scm-before-start.json"),evidence,m);}
            using(var manager=ServiceNative.OpenSCManager(null,null,1)){
                if(manager.IsInvalid)throw new NativeFailure("SCM_START_CONNECT",Marshal.GetLastWin32Error());
                using(var service=ServiceNative.OpenService(manager,m.Name,16|4)){
                    if(service.IsInvalid)throw new NativeFailure("OWN_SERVICE_START_ACCESS",Marshal.GetLastWin32Error());
                    evidence["beforeStatus"]=Status(service);
                    var call=ScmStartCall.Capture(()=>ServiceNative.StartService(service,0,IntPtr.Zero),Marshal.GetLastWin32Error);
                    evidence["call"]=call.Evidence();evidence["afterStatus"]=Status(service);evidence["completedAtUtc"]=DateTime.UtcNow.ToString("o");
                    if(bootstrap)try{Storage.JsonFile(Path.Combine(m.Control,"scm-start-call.json"),evidence,m);}catch(Exception error){evidence["diagnosticPersistenceFailure"]=FailureEvidence.Summary(error);if(call.Accepted)throw new NativeFailure("SCM_DIAGNOSTIC_WRITE_FAILED",FailureEvidence.Win32(error),evidence);}
                    if(!call.Accepted)throw call.Failure(evidence);
                    // Accepted is only SCM handoff. Caller still verifies host identity, receipt and cleanup.
                }
            }
        }
    }
}
