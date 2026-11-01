// Host del ejecutor opción C. No se distribuye/activa antes de validación nativa.
// stdin JSON: solo metadatos. El modo SCM deriva toda ruta del UUID registrado.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Security.Principal;
using System.ServiceProcess;
using System.Text;
using System.Threading;
namespace CommunityTours.Setup026
{
    internal static class SetupPostgres
    {
 #if !NATIVE_VALIDATION_ONLY
        private static string Self {get{return Assembly.GetExecutingAssembly().Location;}}
        private static string Package {get{return Path.GetDirectoryName(Self);}}
        private static void Permit(OperationRequest request)
        {
            Storage.Program(Self);var approval=Contract.Object(File.ReadAllBytes(Path.Combine(Package,"native-approval.json")));Check.That(Contract.Text(approval,"protocol")=="ctsk-native-approval-v1"&&Contract.Text(approval,"scope")==Contract.Scope&&approval["productionAuthorized"] is bool&&!(bool)approval["productionAuthorized"],"NATIVE_APPROVAL_INVALID");string hash=Contract.Hash(File.ReadAllBytes(Self));
            if(request.TokenCheck){Check.That(approval.ContainsKey("nativeValidationHostSha256")&&Contract.Text(approval,"nativeValidationHostSha256")==hash&&approval.ContainsKey("allowedNativeValidation")&&Contract.Json.Serialize(approval["allowedNativeValidation"])=="[\"token-check\"]","TOKEN_TRIAL_NOT_APPROVED");}
            else{Check.That(approval.ContainsKey("writeOperationsAuthorized")&&approval["writeOperationsAuthorized"] is bool&&(bool)approval["writeOperationsAuthorized"],"NATIVE_WRITE_NOT_AUTHORIZED");foreach(string kind in new[]{"reader","initdb","service"}){var record=approval.ContainsKey(kind)?approval[kind] as Dictionary<string,object>:null;Check.That(record!=null&&record.ContainsKey("windows11Validated")&&record["windows11Validated"] is bool&&(bool)record["windows11Validated"]&&record.ContainsKey("evidence")&&Contract.Text(record,"evidence").Length>0,"NATIVE_VALIDATION_REQUIRED");if(kind!="reader")Check.That(Contract.Text(record,"sha256")==hash,"NATIVE_HOST_HASH");}}
            request.Installation.HostHash=hash;
        }
        private static Dictionary<string,object> Base(OperationRequest r,Installation m,DependencyLease d)
        {return new Dictionary<string,object>{{"protocol","ctsk-optionc-service-v1"},{"scope",Contract.Scope},{"productionAuthorized",false},{"operationId",r.OperationId.ToString("D")},{"binding",m.Binding(d.ToolHash("postgres"))},{"complete",true}};}
        private static void TokenProof(Installation m,Dictionary<string,object> result,bool trial,Guid operation)
        {
            Check.That(Contract.Text(result,"protocol")=="ctsk-optionc-service-v1"&&Contract.Text(result,"scope")==Contract.Scope&&result["productionAuthorized"] is bool&&!(bool)result["productionAuthorized"]&&Contract.Text(result,"operationId")==operation.ToString("D"),"BOOTSTRAP_RECEIPT_HEADER");
            if(result.ContainsKey("complete")&&result["complete"] is bool&&!(bool)result["complete"]){string code=Contract.Text(result,"code");Check.That(System.Text.RegularExpressions.Regex.IsMatch(code,@"\A[A-Z0-9_]{1,96}\z")&&result.ContainsKey("win32Error")&&result["win32Error"] is int,"BOOTSTRAP_FAILURE_FORMAT");throw new NativeFailure(code,(int)result["win32Error"]);}
            Check.That(result.ContainsKey("complete")&&result["complete"] is bool&&(bool)result["complete"]&&Contract.Text(result,"protocol")=="ctsk-optionc-service-v1"&&Contract.Text(result,"scope")==Contract.Scope&&result["productionAuthorized"] is bool&&!(bool)result["productionAuthorized"]&&Contract.Text(result,"operationId")==operation.ToString("D")&&result["validationOnly"] is bool&&(bool)result["validationOnly"]==trial&&result["jobEmpty"] is bool&&(bool)result["jobEmpty"]&&result["terminationProven"] is bool&&(bool)result["terminationProven"],"BOOTSTRAP_EVIDENCE");
            var token=result["firstToken"] as Dictionary<string,object>;Check.That(token!=null&&Contract.Text(token,"userSid")==m.ServiceSid&&Contract.Text(token,"integrity")=="Medium"&&token["restricted"] is bool&&(bool)token["restricted"]&&token["elevated"] is bool&&!(bool)token["elevated"]&&token["sessionId"] is int&&(int)token["sessionId"]==0&&token.ContainsKey("elevationType")&&token["elevationType"] is int&&(int)token["elevationType"]==1,"BOOTSTRAP_TOKEN_PROOF");
            var groups=token["groups"] as Dictionary<string,object>;var privileges=token["privileges"] as Dictionary<string,object>;Check.That(groups!=null&&privileges!=null&&privileges.Count>0,"BOOTSTRAP_TOKEN_INCOMPLETE");foreach(string sid in new[]{"S-1-5-32-544","S-1-5-32-547"})Check.That(groups.ContainsKey(sid)&&(groups[sid]==null||(groups[sid] is int&&((int)groups[sid]==16||(int)groups[sid]==17))),"BOOTSTRAP_ADMIN_GROUP");foreach(var privilege in privileges)Check.That((privilege.Key=="SeChangeNotifyPrivilege"||privilege.Key=="SeLockMemoryPrivilege")&&privilege.Value is bool,"BOOTSTRAP_PRIVILEGE");
            var restricted=token["restrictedSids"] as object[];Check.That(restricted!=null&&restricted.Contains(m.ServiceSid),"BOOTSTRAP_RESTRICTED_SIDS");
            string[] phases=trial?new[]{"created-suspended","job-assigned","token-checked","terminated-without-resume","job-empty"}:new[]{"created-suspended","job-assigned","token-checked","resumed","exited","job-empty"};Check.That(Contract.Json.Serialize(result["phases"])==Contract.Json.Serialize(phases)&&result["initdbResumed"] is bool&&(bool)result["initdbResumed"]==!trial&&Contract.Text(result,"dependencyInventorySha256")==m.DependencyHash&&Contract.Text(result,"postgresVersion")=="18.6"&&Contract.Text(result,"serverVersionNum")=="180006","BOOTSTRAP_PHASE_PROOF");
            if(trial)Check.That(result["exitCode"]==null,"TOKEN_TRIAL_EXIT_AMBIGUOUS");else Check.That(result["exitCode"] is int&&(int)result["exitCode"]==0&&result["cleanInitialization"] is bool&&(bool)result["cleanInitialization"]&&Contract.Text(result,"systemIdentifier")!="7632825987452064788","INITDB_COMPLETION_PROOF");
        }
        private static Dictionary<string,object> Initialize(OperationRequest r,DependencyLease d,Func<bool> callerExited)
        {
            Check.That(!callerExited(),"CALLER_EXITED");
            var m=r.Installation;using(var process=Process.GetCurrentProcess()){m.ControllerPid=(uint)process.Id;m.ControllerCreated=process.StartTime.ToUniversalTime().ToFileTimeUtc();}m.ControllerImage=Self;ServiceRegistration.RequireAdministrator();ServiceRegistration.RegisterDisabledBootstrap(m);Storage.Prepare(m);Storage.Write(m.Host,File.ReadAllBytes(Self),m);Check.That(Contract.Hash(File.ReadAllBytes(m.Host))==m.HostHash,"HOST_COPY_CHANGED");Storage.Write(Path.Combine(m.Control,"postgres-dependency.json"),d.Bytes,m);Storage.JsonFile(Path.Combine(m.Control,"intent.json"),BootstrapRecords.Intent(m,r),m);Storage.Write(Path.Combine(m.Control,"operation.lock"),new byte[0],m);
            ServiceRegistration.EnableBootstrap(m);using(var ownerGrant=ControllerLifetime.Grant(m.ServiceSid)){ProcessLease host=null;
            try{Check.That(!callerExited(),"CALLER_EXITED");ServiceRegistration.StartBound(m,true);var watch=Stopwatch.StartNew();Dictionary<string,object> result=null;
                while(watch.ElapsedMilliseconds<270000){Check.That(!callerExited(),"CALLER_EXITED");var state=OfficialServiceConfig.QueryBound(m.Id,m.ServiceSid,m.ActorSid,m.BootstrapCommand,true);if(state.ProcessId>0&&host==null)host=ProcessLease.Open(state.ProcessId,m.Host,m.ServiceSid,true);string receipt=Path.Combine(m.Work,"bootstrap-result.json");if(state.State==1&&File.Exists(receipt)){Check.That(host!=null&&Native.WaitForSingleObject(host.Handle,10000)==0,"BOOTSTRAP_HOST_EXIT_UNPROVEN");result=Contract.Object(Storage.Read(receipt,m));break;}Thread.Sleep(100);}
                Check.That(result!=null,"BOOTSTRAP_TIMEOUT_REVIEW");TokenProof(m,result,r.TokenCheck,r.OperationId);Check.That(Contract.Json.Serialize(result["binding"])==Contract.Json.Serialize(m.Binding(d.ToolHash("postgres"))),"BOOTSTRAP_BINDING_CHANGED");
                RuntimeLease.RequireNoOwnedProcesses(m);if(r.TokenCheck){Check.That(Directory.GetFileSystemEntries(m.Data).Length==0,"TOKEN_TRIAL_DATA_WRITTEN");return result;}
                string cluster=Contract.Text(result,"systemIdentifier");Check.That(RuntimeLease.ControlIdentity(m,true)==cluster,"INITIAL_CLUSTER_CHANGED");Storage.JsonFile(Path.Combine(m.Control,"cluster.json"),new{protocol="ctsk-native-cluster-v1",scope=Contract.Scope,productionAuthorized=false,systemIdentifier=cluster,initializationEvidenceSha256=Contract.Hash(Storage.Read(Path.Combine(m.Work,"bootstrap-result.json"),m)),configurationSha256=Contract.Text(result,"configurationSha256"),configurationFiles=result["configurationFiles"]},m);ServiceRegistration.PromoteOfficial(m);return result;
            }catch{
                // Solo el host bootstrap cuya imagen/SID/handle ya se verificó.
                // Su Job no heredable mata los descendientes al cerrar el host.
                if(host==null){var state=OfficialServiceConfig.QueryBound(m.Id,m.ServiceSid,m.ActorSid,m.BootstrapCommand,true);if(state.ProcessId>0)host=ProcessLease.Open(state.ProcessId,m.Host,m.ServiceSid,true);}
                if(host!=null&&!host.Exited){Check.That(Native.TerminateProcess(host.Handle,1)&&Native.WaitForSingleObject(host.Handle,10000)==0,"BOOTSTRAP_CLEANUP_UNPROVEN");}RuntimeLease.RequireNoOwnedProcesses(m);throw;
            }finally{if(host!=null)host.Dispose();}}
        }
        private static Dictionary<string,object> Existing(OperationRequest r,Installation m,DependencyLease d,Func<bool> callerExited)
        {
            string clusterFile=Path.Combine(m.Control,"cluster.json");var record=Contract.Object(Storage.Read(clusterFile,m));Check.That(Contract.Text(record,"protocol")=="ctsk-native-cluster-v1"&&Contract.Text(record,"scope")==Contract.Scope&&record["productionAuthorized"] is bool&&!(bool)record["productionAuthorized"]&&Contract.Text(record,"systemIdentifier")==r.ExpectedCluster,"REGISTERED_CLUSTER_CHANGED");
            Check.That(Contract.Hash(Storage.Read(Path.Combine(m.Work,"bootstrap-result.json"),m))==Contract.Text(record,"initializationEvidenceSha256")&&Contract.Hash(File.ReadAllBytes(Path.Combine(m.Data,"postgresql.conf")))==Contract.Text(record,"configurationSha256"),"CLUSTER_EVIDENCE_OR_CONFIGURATION_CHANGED");
            var configs=record["configurationFiles"] as Dictionary<string,object>;Contract.Keys(configs,"postgresql.conf","postgresql.auto.conf","pg_hba.conf");foreach(string name in configs.Keys){string file=Path.Combine(m.Data,name);Storage.Private(file,m);Check.That(Contract.Hash(File.ReadAllBytes(file))==Contract.Text(configs,name),"CLUSTER_CONFIGURATION_CHANGED");}
            var value=Base(r,m,d);value.Add("systemIdentifier",r.ExpectedCluster);
            if(r.Action=="credentials"){byte[] secret=ProtectedData.Unprotect(Storage.Read(Path.Combine(m.Work,r.CredentialKind+"-secret.dpapi"),m),Encoding.UTF8.GetBytes(m.Id.ToString("D")+"|"+r.CredentialKind),DataProtectionScope.LocalMachine);try{string text=Encoding.ASCII.GetString(secret);Check.That(Contract.Hex(text),"MAINTENANCE_SECRET_FORMAT");value.Add("credentialKind",r.CredentialKind);value.Add("secret",text);return value;}finally{Array.Clear(secret,0,secret.Length);}}
            var before=OfficialServiceConfig.Query(m.Id,m.ServiceSid,m.ActorSid);bool started=false;
            if(r.Action=="start"){RuntimeLease.RequireNoOwnedProcesses(m);Check.That(before.State==1&&!File.Exists(Path.Combine(m.Data,"postmaster.pid"))&&Ports.Free(m.Port)&&RuntimeLease.ControlIdentity(m,false)==r.ExpectedCluster,"START_IDENTITY_OR_PORT");ServiceRegistration.StartBound(m,false);started=true;}
            if(r.Action=="query"&&before.State==1){RuntimeLease.RequireNoOwnedProcesses(m);Check.That(!File.Exists(Path.Combine(m.Data,"postmaster.pid"))&&Ports.Free(m.Port)&&RuntimeLease.ControlIdentity(m,false)==r.ExpectedCluster,"STOPPED_CLUSTER_UNPROVEN");value.Add("serviceState","stopped");value.Add("ownedProcessTreeEmpty",true);value.Add("portReleased",true);value.Add("clusterIdentityVerified",true);return value;}
            RuntimeLease runtime=null;try{var watch=Stopwatch.StartNew();while(true){if(started)Check.That(!callerExited(),"CALLER_EXITED");try{runtime=RuntimeLease.Capture(m,r.ExpectedCluster);break;}catch{if(!started||watch.ElapsedMilliseconds>=60000)throw;Thread.Sleep(200);}}
                using(runtime){if(r.Action=="stop"){runtime.StopAndVerify(m,r.ExpectedCluster);value.Add("serviceState","stopped");foreach(string key in new[]{"postmasterHandleSignaled","serviceHandleSignaled","ownedProcessTreeEmpty","portReleased","cleanShutdownRecorded","identityRechecked"})value.Add(key,true);}else{value.Add("serviceState","running");value.Add("postmasterPid",runtime.Postmaster.Pid);value.Add("postgresTokenSid",m.ServiceSid);value.Add("postgresTokenRestricted",true);value.Add("portOwned",true);value.Add("clusterIdentityVerified",true);}return value;}
            }catch{if(started)ServiceRegistration.RequestStop(m,false);throw;}
        }
        private static Dictionary<string,object> Run(OperationRequest r,Func<bool> callerExited)
        {
            Permit(r);Check.That(!callerExited(),"CALLER_EXITED");var requested=r.Installation;using(var identity=WindowsIdentity.GetCurrent())requested.ActorSid=identity.User.Value;Check.That(System.Text.RegularExpressions.Regex.IsMatch(requested.ActorSid,@"\AS-1-5-21-(?:[0-9]+-){2}[0-9]+-[0-9]+\z"),"ACTOR_REQUIRED");requested.MachineUuid=Contract.Machine();
            using(var ownImage=new FileStream(Self,FileMode.Open,FileAccess.Read,FileShare.Read))using(var d=DependencyLease.Open(Path.Combine(Package,"postgres-dependency.json"),requested.DependencyHash,requested.ActorSid)){
                if(r.Action=="initialize"||r.TokenCheck)return Initialize(r,d,callerExited);
                Guid operation;bool trial;var m=BootstrapRecords.Read(requested.Id,out operation,out trial);Check.That(!trial&&m.ActorSid==requested.ActorSid&&m.Port==requested.Port&&m.DependencyHash==requested.DependencyHash&&m.HostHash==requested.HostHash,"REGISTERED_INSTALLATION_CHANGED");
                using(var operationLock=new FileStream(Path.Combine(m.Control,"operation.lock"),FileMode.Open,FileAccess.Read,FileShare.None))return Existing(r,m,d,callerExited);
            }
        }
 #endif
        [STAThread]
        public static int Main(string[] args)
        {
            if(args.Length==2&&args[0]=="--service-instance")return BootstrapService.Dispatch(args[1]);
#if NATIVE_VALIDATION_ONLY
            return NativeValidation.Entry(args);
#else
            OperationRequest request=null;try{Check.Windows11();
                if(args.Length==3&&args[0]=="--elevated-request")return Elevation.Elevated(args[1],args[2],Run);
                Check.That(args.Length==1&&args[0]=="--request","NATIVE_ARGUMENTS");Console.InputEncoding=new UTF8Encoding(false);Console.OutputEncoding=new UTF8Encoding(false);var input=new StringBuilder();char[] chars=new char[1024];int count;while((count=Console.In.Read(chars,0,chars.Length))>0){input.Append(chars,0,count);Check.That(input.Length<=65536,"NATIVE_REQUEST_LIMIT");}byte[] raw=Encoding.UTF8.GetBytes(input.ToString());request=OperationRequest.Parse(raw);Dictionary<string,object> result;
                if((request.TokenCheck||request.Action=="initialize")&&!Elevation.Administrator){Permit(request);result=Elevation.Launch(raw,request);}else using(var caller=ControllerLifetime.Parent())result=Run(request,()=>caller.Exited);Console.WriteLine(Contract.Json.Serialize(result));return result["complete"] is bool&&(bool)result["complete"]?0:1;
            }catch(Exception error){string code=System.Text.RegularExpressions.Regex.IsMatch(error.Message??"",@"\A[A-Z0-9_]{1,96}\z")?error.Message:"NATIVE_OPERATION_REVIEW";var native=error as NativeFailure;var failure=new Dictionary<string,object>{{"protocol","ctsk-optionc-service-v1"},{"scope",Contract.Scope},{"productionAuthorized",false},{"operationId",request==null?null:request.OperationId.ToString("D")},{"complete",false},{"code",code},{"win32Error",native==null?0:native.Win32Code}};FailureEvidence.AddTo(failure,error);Console.WriteLine(Contract.Json.Serialize(failure));return 1;}
#endif
        }
    }
}
