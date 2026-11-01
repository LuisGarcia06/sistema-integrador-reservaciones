using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Security.Principal;
using System.ServiceProcess;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using Microsoft.Win32.SafeHandles;
namespace CommunityTours.Setup026
{
    internal sealed class NativeFailure : InvalidOperationException
    {internal readonly int Win32Code;internal readonly Dictionary<string,object> Diagnostics;internal NativeFailure(string code,int win32,Dictionary<string,object> diagnostics=null):base(code){Win32Code=win32;Diagnostics=diagnostics;}}
    internal static class BootstrapRecords
    {
        internal static Dictionary<string,object> Intent(Installation m,OperationRequest request)
        {return new Dictionary<string,object>{{"protocol","ctsk-native-intent-v1"},{"scope",Contract.Scope},{"productionAuthorized",false},{"installationId",m.Id.ToString("D")},{"pgPort",m.Port},{"actorSid",m.ActorSid},{"serviceSid",m.ServiceSid},{"machineUuid",m.MachineUuid},{"dependencyInventorySha256",m.DependencyHash},{"hostSha256",m.HostHash},{"operationId",request.OperationId.ToString("D")},{"action",request.Action},{"controllerPid",m.ControllerPid},{"controllerCreated",m.ControllerCreated.ToString(System.Globalization.CultureInfo.InvariantCulture)},{"controllerImage",m.ControllerImage}};}
        internal static Installation Read(Guid id,out Guid operation,out bool trial)
        {var m=ReadLocal(id,out operation,out trial);Check.That(Contract.Machine()==m.MachineUuid,"INTENT_MACHINE_CHANGED");return m;}
        internal static Installation ReadLocal(Guid id,out Guid operation,out bool trial)
        {
            var m=new Installation{Id=id};string file=Path.Combine(m.Control,"intent.json");Storage.Program(file);Check.That(new FileInfo(file).Length<=65536,"INTENT_LIMIT");var v=Contract.Object(File.ReadAllBytes(file));Contract.Keys(v,"protocol","scope","productionAuthorized","installationId","pgPort","actorSid","serviceSid","machineUuid","dependencyInventorySha256","hostSha256","operationId","action","controllerPid","controllerCreated","controllerImage");
            Check.That(Contract.Text(v,"protocol")=="ctsk-native-intent-v1"&&Contract.Text(v,"scope")==Contract.Scope&&v["productionAuthorized"] is bool&&!(bool)v["productionAuthorized"]&&Contract.Text(v,"installationId")==id.ToString("D")&&v["pgPort"] is int,"INTENT_REJECTED");
            m.Port=(int)v["pgPort"];Check.That(v["controllerPid"] is int&&(int)v["controllerPid"]>0,"CONTROLLER_PID");m.ControllerPid=(uint)(int)v["controllerPid"];long created;Check.That(Int64.TryParse(Contract.Text(v,"controllerCreated"),out created)&&created>0,"CONTROLLER_CREATED");m.ControllerCreated=created;m.ControllerImage=Contract.Text(v,"controllerImage");Check.That(Path.IsPathRooted(m.ControllerImage)&&!m.ControllerImage.StartsWith(@"\\"),"CONTROLLER_IMAGE_PATH");m.ActorSid=Contract.Text(v,"actorSid");m.ServiceSid=Contract.Text(v,"serviceSid");m.MachineUuid=Contract.Text(v,"machineUuid");m.DependencyHash=Contract.Text(v,"dependencyInventorySha256");m.HostHash=Contract.Text(v,"hostSha256");operation=Contract.Id(Contract.Text(v,"operationId"));string action=Contract.Text(v,"action");Check.That(action=="token-check"||action=="initialize","INTENT_ACTION");trial=action=="token-check";
            Check.That(Regex.IsMatch(m.ActorSid,@"\AS-1-5-21-(?:[0-9]+-){2}[0-9]+-[0-9]+\z")&&Regex.IsMatch(m.ServiceSid,@"\AS-1-5-80-(?:[0-9]+-){4}[0-9]+\z")&&m.Port>=1024&&m.Port<=65535&&m.Port!=5432&&Contract.Hex(m.DependencyHash)&&Contract.Hex(m.HostHash),"INTENT_IDENTITY");
            Storage.Private(file,m);Check.That(((SecurityIdentifier)new NTAccount(m.Account).Translate(typeof(SecurityIdentifier))).Value==m.ServiceSid,"SERVICE_SID_CHANGED");Check.That(Contract.Hash(File.ReadAllBytes(m.Host))==m.HostHash,"HOST_IMAGE_CHANGED");Storage.Program(m.Host,m.ActorSid);return m;
        }
    }
 #if !NATIVE_VALIDATION_ONLY
    internal static class BootstrapWork
    {
        private static byte[] Secret(Installation m,string kind)
        {
            byte[] random=new byte[32],secret=null;bool returned=false;try{using(var rng=RandomNumberGenerator.Create())rng.GetBytes(random);secret=Encoding.ASCII.GetBytes(BitConverter.ToString(random).Replace("-","").ToLowerInvariant());byte[] blob=ProtectedData.Protect(secret,Encoding.UTF8.GetBytes(m.Id.ToString("D")+"|"+kind),DataProtectionScope.LocalMachine);Storage.Write(Path.Combine(m.Work,kind+"-secret.dpapi"),blob,m,true);returned=true;return secret;}finally{Array.Clear(random,0,random.Length);if(!returned&&secret!=null)Array.Clear(secret,0,secret.Length);}
        }
        [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] private static extern SafeFileHandle CreateFile(string file,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
        [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] private static extern bool SetHandleInformation(SafeFileHandle handle,uint mask,uint flags);
        private static void Inherit(SafeFileHandle handle,bool yes){Check.That(SetHandleInformation(handle,1,yes?1u:0u),"LOG_HANDLE_INHERITANCE");}
        private static Dictionary<string,object> RunTool(Installation m,DependencyLease dependencies,bool control,bool trial,Func<bool> cancelled)
        {
            string tool=control?"pg_controldata":"initdb",stdout=Path.Combine(m.Work,tool+".stdout.log"),stderr=Path.Combine(m.Work,tool+".stderr.log");var phases=new List<string>();Dictionary<string,object> token;uint pid,exit=0;
            using(var output=Storage.NewFile(stdout,m,true))using(var error=Storage.NewFile(stderr,m,true))using(var input=CreateFile("NUL",0x80000000,3,IntPtr.Zero,3,0x80,IntPtr.Zero))using(var restricted=Tokens.RestrictCurrent(m.ServiceSid)){
                Check.That(!input.IsInvalid,"NUL_INPUT");Inherit(input,true);Inherit(output.SafeFileHandle,true);Inherit(error.SafeFileHandle,true);
                try{
                    using(var process=control?ContainedInitdb.CreateControlDataSuspended(restricted,m.ServiceSid,m.Id,dependencies.ToolHash(tool),m.Work,input,output.SafeFileHandle,error.SafeFileHandle,cancelled):ContainedInitdb.CreateSuspended(restricted,m.ServiceSid,m.Id,dependencies.ToolHash(tool),m.Work,input,output.SafeFileHandle,error.SafeFileHandle,cancelled)){
                        phases.Add("created-suspended");phases.Add("job-assigned");phases.Add("token-checked");token=process.FirstToken.Evidence();pid=process.ProcessId;
                        if(!trial){Check.That(!cancelled(),"INITDB_CANCELLED");process.Resume();phases.Add("resumed");exit=process.Wait(control?30000:180000,cancelled);phases.Add("exited");phases.Add("job-empty");}
                    }
                    if(trial){phases.Add("terminated-without-resume");phases.Add("job-empty");}
                }finally{Inherit(input,false);Inherit(output.SafeFileHandle,false);Inherit(error.SafeFileHandle,false);}
                output.Flush(true);error.Flush(true);
            }
            Storage.Private(stdout,m);Storage.Private(stderr,m);string diagnostics=File.ReadAllText(stderr);Check.That(!Regex.IsMatch(diagnostics,"could not (?:create restricted token|drop administrative permissions|re-execute)",RegexOptions.IgnoreCase),"INTERNAL_PRIVILEGE_REDUCTION_FAILED");
            Check.That(String.IsNullOrWhiteSpace(diagnostics),"POSTGRES_NATIVE_DIAGNOSTICS_REVIEW");
            Check.That(trial||exit==0,"POSTGRES_NATIVE_EXIT_FAILED");return new Dictionary<string,object>{{"firstToken",token},{"processId",pid},{"exitCode",trial?null:(object)exit},{"phases",phases.ToArray()},{"jobEmpty",true},{"terminationProven",true},{"initdbResumed",!trial},{"stdoutSha256",Contract.Hash(File.ReadAllBytes(stdout))},{"stderrSha256",Contract.Hash(File.ReadAllBytes(stderr))}};
        }
        internal static Dictionary<string,object> Execute(Installation m,Guid operation,bool trial,Func<bool> cancelled)
        {
            using(var identity=WindowsIdentity.GetCurrent())Check.That(identity.User.Value==m.ServiceSid,"SERVICE_ACCOUNT_REQUIRED");
            Tokens.RequireServiceContext(m.ServiceSid);
            Check.That(Contract.Machine()==m.MachineUuid&&Directory.GetFileSystemEntries(m.Data).Length==0,"NEW_CLUSTER_REQUIRED");Storage.Private(m.Work,m,true);Storage.Private(m.Data,m,true);
            Check.That(!cancelled(),"INITDB_CANCELLED");
            using(var dependencies=DependencyLease.Open(Path.Combine(m.Control,"postgres-dependency.json"),m.DependencyHash,m.ActorSid)){
                Check.That(!cancelled(),"INITDB_CANCELLED");
                string passwordFile=Path.Combine(m.Work,"initdb-password.tmp");byte[] password=null;
                Dictionary<string,object> result;
                try{if(!trial){password=Secret(m,"maintenance");byte[] runtime=Secret(m,"runtime");Array.Clear(runtime,0,runtime.Length);Storage.Write(passwordFile,password,m,true);}result=RunTool(m,dependencies,false,trial,cancelled);}finally{if(password!=null)Array.Clear(password,0,password.Length);if(File.Exists(passwordFile)){Storage.Private(passwordFile,m);File.Delete(passwordFile);}}
                result.Add("protocol","ctsk-optionc-service-v1");result.Add("scope",Contract.Scope);result.Add("productionAuthorized",false);result.Add("operationId",operation.ToString("D"));result.Add("validationOnly",trial);result.Add("binding",m.Binding(dependencies.ToolHash("postgres")));result.Add("dependencyInventorySha256",m.DependencyHash);result.Add("postgresVersion","18.6");result.Add("serverVersionNum","180006");result.Add("cmdContextVerified",true);
                if(trial){Check.That(Directory.GetFileSystemEntries(m.Data).Length==0,"TOKEN_TRIAL_WROTE_DATA");result.Add("complete",true);result.Add("provisioningAuthorized",false);return result;}
                string config=Path.Combine(m.Data,"postgresql.conf");Storage.Private(config,m);File.AppendAllText(config,"\nlisten_addresses='127.0.0.1'\nport="+m.Port+"\nunix_socket_directories=''\nlog_statement='none'\nlog_min_error_statement='panic'\nlog_parameter_max_length=0\nlog_parameter_max_length_on_error=0\nlogging_collector=on\nlog_directory='log'\nlog_filename='postgresql-%Y-%m-%d.log'\nlog_rotation_age='1d'\nlog_truncate_on_rotation=off\nshared_preload_libraries=''\nsession_preload_libraries=''\nlocal_preload_libraries=''\n",new UTF8Encoding(false));
                RunTool(m,dependencies,true,false,cancelled);string data=File.ReadAllText(Path.Combine(m.Work,"pg_controldata.stdout.log"));var id=Regex.Matches(data,@"(?m)^Database system identifier:\s+([0-9]{19,20})\r?$");var state=Regex.Matches(data,@"(?m)^Database cluster state:\s+shut down\r?$");Check.That(id.Count==1&&state.Count==1&&id[0].Groups[1].Value!="7632825987452064788"&&!File.Exists(Path.Combine(m.Data,"postmaster.pid")),"INITIAL_CONTROL_DATA_REJECTED");
                var configFiles=new Dictionary<string,string>();foreach(string name in new[]{"postgresql.conf","postgresql.auto.conf","pg_hba.conf"}){string file=Path.Combine(m.Data,name);Storage.Private(file,m);configFiles.Add(name,Contract.Hash(File.ReadAllBytes(file)));}
                result.Add("systemIdentifier",id[0].Groups[1].Value);result.Add("cleanInitialization",true);result.Add("configurationSha256",Contract.Hash(File.ReadAllBytes(config)));result.Add("configurationFiles",configFiles);result.Add("complete",true);return result;
            }
        }
    }
 #endif
    internal sealed class BootstrapService : ServiceBase
    {
        private readonly Guid instanceId;private Installation installation;private Guid operation;private bool trial;
        private readonly ManualResetEvent stop=new ManualResetEvent(false),done=new ManualResetEvent(false);private Thread worker;
        internal BootstrapService(Guid id){instanceId=id;ServiceName="CTSK026-"+id.ToString("D");AutoLog=false;CanStop=true;CanShutdown=true;}
        internal static int Dispatch(string instance)
        {
            // Only parse the UUID and allocate ServiceBase before attaching to SCM.
            // All fallible environment/identity checks remain in the worker.
            Guid id;if(!Guid.TryParseExact(instance,"D",out id)||id==Guid.Empty||id.ToString("D")!=instance||instance[14]!='4'||"89ab".IndexOf(instance[19])<0)return 1;
            using(var service=new BootstrapService(id)){ServiceBase.Run(service);return service.ExitCode==0?0:1;}
        }
        private void Trace(string phase)
        {
            Storage.JsonFile(Path.Combine(installation.Work,"service-startup-"+phase+".json"),new{protocol="ctsk-scm-startup-v1",scope=Contract.Scope,productionAuthorized=false,complete=false,phase=phase,observedAtUtc=DateTime.UtcNow.ToString("o"),installationId=instanceId.ToString("D"),operationId=operation.ToString("D"),serviceName=installation.Name,serviceSid=installation.ServiceSid,controllerPid=installation.ControllerPid,hostImage=System.Reflection.Assembly.GetExecutingAssembly().Location,tokenValidated=false,jobValidated=false},installation,true);
        }
        protected override void OnStart(string[] args)
        {
            Check.That(args.Length==0,"SERVICE_ARGUMENTS");RequestAdditionalTime(30000);
            worker=new Thread(()=>{
                string stage="read-local-intent";
                try{
                    installation=BootstrapRecords.ReadLocal(instanceId,out operation,out trial);
                    using(var identity=WindowsIdentity.GetCurrent())Check.That(identity.User.Value==installation.ServiceSid,"SCM_ACCOUNT_REQUIRED");
                    Check.That(System.Reflection.Assembly.GetExecutingAssembly().Location==installation.Host,"SCM_HOST_IMAGE");
#if NATIVE_VALIDATION_ONLY
                    Check.That(trial,"VALIDATION_ONLY");
#endif
                    Trace("local-bound");stage="machine-check";Check.That(Contract.Machine()==installation.MachineUuid,"INTENT_MACHINE_CHANGED");Trace("machine-bound");
                    stage="controller-open";using(var owner=ControllerLifetime.Open(installation)){
                        Trace("controller-bound");stage="worker";var result=
#if NATIVE_VALIDATION_ONLY
                            NativeValidation.Work(installation,operation,()=>stop.WaitOne(0)||owner.Exited||!trial);
#else
                            BootstrapWork.Execute(installation,operation,trial,()=>stop.WaitOne(0)||owner.Exited);
#endif
                        Check.That(!owner.Exited,"CONTROLLER_GONE");Storage.JsonFile(Path.Combine(installation.Work,"bootstrap-result.json"),result,installation,true);
                    }
                }catch(Exception error){
                    ExitCode=1;
                    if(installation!=null)try{
                        var result=new Dictionary<string,object>{{"protocol","ctsk-optionc-service-v1"},{"scope",Contract.Scope},{"productionAuthorized",false},{"operationId",operation.ToString("D")},{"complete",false},{"code",FailureEvidence.Code(error,"NATIVE_BOOTSTRAP_FAILED")},{"win32Error",FailureEvidence.Win32(error)},{"startupStage",stage}};
                        FailureEvidence.AddTo(result,error);Storage.JsonFile(Path.Combine(installation.Work,"bootstrap-result.json"),result,installation,true);
                    }catch{} // SCM exit/status and external event collection remain authoritative if local binding/logging fails.
                }finally{done.Set();ThreadPool.QueueUserWorkItem(_=>Stop());}
            });worker.IsBackground=false;worker.Start();
        }
        protected override void OnStop(){stop.Set();RequestAdditionalTime(45000);Check.That(done.WaitOne(40000),"BOOTSTRAP_STOP_UNPROVEN");}
        protected override void OnShutdown(){stop.Set();Check.That(done.WaitOne(40000),"BOOTSTRAP_SHUTDOWN_UNPROVEN");}
        protected override void Dispose(bool disposing){if(disposing&&done.WaitOne(0)){stop.Dispose();done.Dispose();}base.Dispose(disposing);}
    }
}
