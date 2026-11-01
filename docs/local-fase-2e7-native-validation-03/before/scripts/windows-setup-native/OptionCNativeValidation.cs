#if NATIVE_VALIDATION_ONLY
// Validation-only entry. Shares SCM/UAC/storage/token/atomic Job code with option C.
// No PostgreSQL image, dependency inventory, password, DPAPI, SQL or promotion is used.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32.SafeHandles;
namespace CommunityTours.Setup026
{
    internal sealed class ValidationEnvironment : IDisposable
    {
        internal IntPtr Block;
        internal ValidationEnvironment(string sid,string work)
        {
            using(var id=WindowsIdentity.GetCurrent())Check.That(id.User.Value==sid,"SERVICE_IDENTITY_CHANGED");
            Contract.Machine();
            var values=new[]{"PATH=C:\\Windows\\System32","SystemRoot=C:\\Windows","TEMP="+work,"TMP="+work,"WINDIR=C:\\Windows"};
            Block=Marshal.StringToHGlobalUni(String.Join("\0",values)+"\0\0");
        }
        public void Dispose(){if(Block!=IntPtr.Zero){Marshal.FreeHGlobal(Block);Block=IntPtr.Zero;}}
    }
    internal static class NativeValidation
    {
        internal static readonly string[] Scenarios={"suspended"};
        private const string Protocol="ctsk-optionc-validation-v1";
        private const string Consent="AUTORIZO SOLO PRUEBA NATIVA SIN POSTGRESQL";
        private static string Self {get{return Assembly.GetExecutingAssembly().Location;}}
        private static Dictionary<string,object> Reply(Guid operation,bool complete)
        {return new Dictionary<string,object>{{"protocol",Protocol},{"scope",Contract.Scope},{"productionAuthorized",false},{"operationId",operation.ToString("D")},{"validationOnly",true},{"provisioningAuthorized",false},{"postgresExecuted",false},{"observedAtUtc",DateTime.UtcNow.ToString("o")},{"complete",complete}};}
        internal static OperationRequest Parse(byte[] bytes)
        {
            Check.That(bytes.Length<=4096,"VALIDATION_REQUEST_LIMIT");var v=Contract.Object(bytes);
            Contract.Keys(v,"protocol","scope","productionAuthorized","operationId","installationId","scenario","manualConsent");
            Check.That(Contract.Text(v,"protocol")==Protocol&&Contract.Text(v,"scope")==Contract.Scope&&v["productionAuthorized"] is bool&&!(bool)v["productionAuthorized"]&&Contract.Text(v,"manualConsent")==Consent,"VALIDATION_SCOPE");
            string scenario=Contract.Text(v,"scenario");Check.That(Scenarios.Contains(scenario),"VALIDATION_SCENARIO");
            return new OperationRequest{OperationId=Contract.Id(Contract.Text(v,"operationId")),TokenCheck=true,Action="token-check",Installation=new Installation{Id=Contract.Id(Contract.Text(v,"installationId")),Port=55443,ValidationScenario=scenario}};
        }
        private static void Permit()
        {
            Storage.Program(Self);var v=Contract.Object(File.ReadAllBytes(Path.Combine(Path.GetDirectoryName(Self),"validation-approval.json")));
            Contract.Keys(v,"protocol","scope","productionAuthorized","validationOnly","writeOperationsAuthorized","hostSha256","scenarios");
            Check.That(Contract.Text(v,"protocol")==Protocol&&Contract.Text(v,"scope")==Contract.Scope&&v["productionAuthorized"] is bool&&!(bool)v["productionAuthorized"]&&v["validationOnly"] is bool&&(bool)v["validationOnly"]&&v["writeOperationsAuthorized"] is bool&&!(bool)v["writeOperationsAuthorized"]&&Contract.Text(v,"hostSha256")==Contract.Hash(File.ReadAllBytes(Self))&&Contract.Json.Serialize(v["scenarios"])==Contract.Json.Serialize(Scenarios),"VALIDATION_APPROVAL");
        }
        [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] private static extern SafeFileHandle CreateFile(string file,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
        [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] private static extern bool SetHandleInformation(SafeFileHandle h,uint mask,uint flags);
        private static void Inherit(SafeFileHandle h,bool yes){Check.That(SetHandleInformation(h,1,yes?1u:0u),"VALIDATION_HANDLE_FLAGS");}
        private static Dictionary<string,object> ProcessRecord()
        {using(var p=Process.GetCurrentProcess())return new Dictionary<string,object>{{"pid",p.Id},{"created",p.StartTime.ToUniversalTime().ToFileTimeUtc().ToString()},{"image",Self}};}
        private static void WaitMarker(Installation m,string name,Func<bool> cancelled)
        {
            var watch=Stopwatch.StartNew();string file=Path.Combine(m.Work,name);
            while(!File.Exists(file)){Check.That(!cancelled(),"INITDB_CANCELLED");Check.That(watch.ElapsedMilliseconds<15000,"VALIDATION_CHILD_NOT_READY");Thread.Sleep(25);}Storage.Read(file,m);
        }
        internal static Dictionary<string,object> Work(Installation m,Guid op,Func<bool> cancelled)
        {
            // Give the controller time to retain an identity-checked process handle,
            // including when the service fails before process creation.
            Thread.Sleep(1500);Tokens.RequireServiceContext(m.ServiceSid);
            string scenario=Contract.Text(Contract.Object(Storage.Read(Path.Combine(m.Control,"validation-case.json"),m)),"scenario");
            Check.That(Scenarios.Contains(scenario)&&Directory.GetFileSystemEntries(m.Data).Length==0,"VALIDATION_CONTEXT");
            var result=Reply(op,true);result.Add("scenario",scenario);result.Add("serviceSid",m.ServiceSid);result.Add("machineUuid",m.MachineUuid);result.Add("actorSid",m.ActorSid);result.Add("host",ProcessRecord());
            result.Add("serviceToken",ServiceToken());var phases=new List<string>();bool resumed=false;string observed=null;
            using(var output=Storage.NewFile(Path.Combine(m.Work,"probe.stdout.log"),m,true))using(var error=Storage.NewFile(Path.Combine(m.Work,"probe.stderr.log"),m,true))using(var input=CreateFile("NUL",0x80000000,3,IntPtr.Zero,3,0x80,IntPtr.Zero))using(var token=Tokens.RestrictCurrent(m.ServiceSid)){
                Check.That(!input.IsInvalid,"VALIDATION_NUL");Inherit(input,true);Inherit(output.SafeFileHandle,true);Inherit(error.SafeFileHandle,true);
                try{
                    using(var child=ContainedInitdb.CreateValidationSuspended(token,m,input,output.SafeFileHandle,error.SafeFileHandle,cancelled,scenario)){
                        result.Add("firstToken",child.FirstToken.Evidence());result.Add("childPid",child.ProcessId);
                        phases.AddRange(new[]{"created-suspended","job-assigned","token-checked"});
                        try{
                            if(scenario=="reject-sid")child.FirstToken.Require("S-1-5-80-1-2-3-4-5");
                            if(scenario=="reject-privilege"){
                                // Fault injection into a new in-memory snapshot, never the Windows token.
                                var actual=child.FirstToken;var copy=new TokenSnapshot{UserSid=actual.UserSid,Integrity=actual.Integrity,Restricted=actual.Restricted,Elevated=actual.Elevated,SessionId=actual.SessionId,ElevationType=actual.ElevationType};
                                foreach(var g in actual.Groups)copy.Groups.Add(g.Key,g.Value);foreach(var p in actual.Privileges)copy.Privileges.Add(p.Key,p.Value);copy.RestrictedSids.AddRange(actual.RestrictedSids);
                                copy.Privileges.Add("SeDebugPrivilege",false);copy.Require(m.ServiceSid);
                            }
                            if(scenario=="reject-job")Check.That(child.ValidationActive==2,"VALIDATION_JOB_GATE_REJECTED");
                            if(scenario!="suspended"&& !scenario.StartsWith("reject-",StringComparison.Ordinal)){
                                child.Resume();resumed=true;phases.Add("resumed-probe-only");WaitMarker(m,"probe-started.json",cancelled);
                                if(scenario=="job-tree"||scenario=="host-death"){WaitMarker(m,"probe-grandchild.json",cancelled);Check.That(child.ValidationActive==2,"VALIDATION_TREE_NOT_CONTAINED");result.Add("containedProcessCount",child.ValidationActive);}
                                if(scenario.EndsWith("death",StringComparison.Ordinal)){
                                    var ready=Reply(op,false);ready.Add("status","READY_FOR_MANUAL_DEATH_TEST");ready.Add("scenario",scenario);ready.Add("controllerPid",m.ControllerPid);ready.Add("host",ProcessRecord());ready.Add("childPid",child.ProcessId);ready.Add("firstToken",child.FirstToken.Evidence());Storage.JsonFile(Path.Combine(m.Work,"death-ready.json"),ready,m,true);
                                    child.Wait(60000,cancelled);throw new InvalidOperationException("VALIDATION_DEATH_NOT_EXERCISED");
                                }
                                if(scenario=="timeout")child.Wait(2000,cancelled);
                                if(scenario=="cancel"){var clock=Stopwatch.StartNew();child.Wait(15000,()=>cancelled()||clock.ElapsedMilliseconds>=2000);}
                            }
                        }catch(InvalidOperationException e){
                            string expected=scenario=="reject-sid"?"FIRST_TOKEN_IDENTITY":scenario=="reject-privilege"?"FIRST_TOKEN_PRIVILEGE":scenario=="reject-job"?"VALIDATION_JOB_GATE_REJECTED":scenario=="timeout"?"INITDB_TIMEOUT":scenario=="cancel"?"INITDB_CANCELLED":null;
                            if(expected==null||e.Message!=expected)throw;observed=e.Message;
                        }
                    }
                    phases.Add("termination-proven");phases.Add("job-empty");
                }finally{Inherit(input,false);Inherit(output.SafeFileHandle,false);Inherit(error.SafeFileHandle,false);}
                output.Flush(true);error.Flush(true);
            }
            Check.That(Directory.GetFileSystemEntries(m.Data).Length==0,"VALIDATION_DATA_WRITTEN");
            bool expectedFault=scenario.StartsWith("reject-",StringComparison.Ordinal)||scenario=="timeout"||scenario=="cancel";
            Check.That(!expectedFault||observed!=null,"VALIDATION_FAULT_NOT_OBSERVED");
            Check.That(resumed||!File.Exists(Path.Combine(m.Work,"probe-started.json")),"VALIDATION_RESUME_MARKER");
            result.Add("phases",phases);result.Add("probeResumed",resumed);result.Add("initdbResumed",false);result.Add("expectedFailureObserved",observed);result.Add("jobEmpty",true);result.Add("terminationProven",true);result.Add("dataDirectoryEmpty",true);return result;
        }
        private static Dictionary<string,object> ServiceToken(){KernelHandle h;Check.That(Native.OpenProcessToken(Native.GetCurrentProcess(),8,out h),"SERVICE_TOKEN_OPEN");using(h)return Tokens.Read(h).Evidence();}
        private static void VerifyCompleted(Installation m,OperationRequest request,Dictionary<string,object> value)
        {
            Check.That(value.ContainsKey("complete")&&value["complete"] is bool,"VALIDATION_RECEIPT_FORMAT");
            Check.That(Contract.Text(value,"scope")==Contract.Scope&&value["productionAuthorized"] is bool&&!(bool)value["productionAuthorized"],"VALIDATION_RECEIPT_SCOPE");
            if(!(bool)value["complete"])return;
            Check.That(Contract.Text(value,"protocol")==Protocol&&Contract.Text(value,"scenario")==m.ValidationScenario&&Contract.Text(value,"serviceSid")==m.ServiceSid&&Contract.Text(value,"actorSid")==m.ActorSid&&Contract.Text(value,"machineUuid")==m.MachineUuid,"VALIDATION_RECEIPT_BINDING");
            foreach(string key in new[]{"validationOnly","jobEmpty","terminationProven","dataDirectoryEmpty"})Check.That(value.ContainsKey(key)&&value[key] is bool&&(bool)value[key],"VALIDATION_RECEIPT_PROOF");
            foreach(string key in new[]{"productionAuthorized","provisioningAuthorized","postgresExecuted","initdbResumed"})Check.That(value.ContainsKey(key)&&value[key] is bool&&!(bool)value[key],"VALIDATION_RECEIPT_AUTHORIZATION");
            var token=value["firstToken"] as Dictionary<string,object>;Check.That(token!=null&&Contract.Text(token,"userSid")==m.ServiceSid&&Contract.Text(token,"integrity")=="Medium"&&token["sessionId"] is int&&(int)token["sessionId"]==0&&token["restricted"] is bool&&(bool)token["restricted"]&&token["elevated"] is bool&&!(bool)token["elevated"],"VALIDATION_RECEIPT_TOKEN");
            bool resume=m.ValidationScenario=="timeout"||m.ValidationScenario=="cancel"||m.ValidationScenario=="job-tree";
            Check.That(value["probeResumed"] is bool&&(bool)value["probeResumed"]==resume&&!m.ValidationScenario.EndsWith("death",StringComparison.Ordinal),"VALIDATION_RECEIPT_RESUME");
            string expected=m.ValidationScenario=="reject-sid"?"FIRST_TOKEN_IDENTITY":m.ValidationScenario=="reject-privilege"?"FIRST_TOKEN_PRIVILEGE":m.ValidationScenario=="reject-job"?"VALIDATION_JOB_GATE_REJECTED":m.ValidationScenario=="timeout"?"INITDB_TIMEOUT":m.ValidationScenario=="cancel"?"INITDB_CANCELLED":null;
            Check.That(value.ContainsKey("expectedFailureObserved")&&Object.Equals(value["expectedFailureObserved"],expected),"VALIDATION_RECEIPT_FAULT");
            if(m.ValidationScenario=="job-tree")Check.That(value["containedProcessCount"] is int&&(int)value["containedProcessCount"]==2,"VALIDATION_RECEIPT_TREE");
        }
        private static Dictionary<string,object> Run(OperationRequest r,Func<bool> callerExited)
        {
            Permit();ServiceRegistration.RequireAdministrator();Check.That(!callerExited(),"CALLER_EXITED");var m=r.Installation;
            using(var id=WindowsIdentity.GetCurrent())m.ActorSid=id.User.Value;
            Check.That(System.Text.RegularExpressions.Regex.IsMatch(m.ActorSid,@"\AS-1-5-21-(?:[0-9]+-){2}[0-9]+-[0-9]+\z"),"ACTOR_REQUIRED");
            m.MachineUuid=Contract.Machine();m.HostHash=Contract.Hash(File.ReadAllBytes(Self));m.DependencyHash=m.HostHash; // bootstrap metadata only; not a PostgreSQL reference
            using(var p=Process.GetCurrentProcess()){m.ControllerPid=(uint)p.Id;m.ControllerCreated=p.StartTime.ToUniversalTime().ToFileTimeUtc();}m.ControllerImage=Self;
            using(var held=new FileStream(Self,FileMode.Open,FileAccess.Read,FileShare.Read)){
                ServiceRegistration.RegisterDisabledBootstrap(m);Storage.Prepare(m);Storage.Write(m.Host,File.ReadAllBytes(Self),m);Storage.JsonFile(Path.Combine(m.Control,"intent.json"),BootstrapRecords.Intent(m,r),m);Storage.JsonFile(Path.Combine(m.Control,"validation-case.json"),new{scenario=m.ValidationScenario},m);
                ServiceRegistration.EnableBootstrap(m);
                {
                    var grant=ControllerLifetime.Grant(m.ServiceSid);ProcessLease host=null;bool started=false;Dictionary<string,object> result=null;Exception primary=null;
                    try{
                        Check.That(!callerExited(),"CALLER_EXITED");ServiceRegistration.StartBound(m,true);started=true;var watch=Stopwatch.StartNew();
                        while(watch.ElapsedMilliseconds<100000){
                            Check.That(!callerExited(),"CALLER_EXITED");var state=OfficialServiceConfig.QueryBound(m.Id,m.ServiceSid,m.ActorSid,m.BootstrapCommand,true);
                            if(state.ProcessId>0&&host==null)host=ProcessLease.Open(state.ProcessId,m.Host,m.ServiceSid,true);
                            if(state.State==1){Check.That(host!=null&&host.Exited,"VALIDATION_HOST_EXIT_UNPROVEN");string file=Path.Combine(m.Work,"bootstrap-result.json");Check.That(File.Exists(file),"VALIDATION_RECEIPT_MISSING");result=Contract.Object(Storage.Read(file,m));break;}Thread.Sleep(50);
                        }
                        Check.That(result!=null,"VALIDATION_CONTROLLER_TIMEOUT");
                        Check.That(Contract.Text(result,"operationId")==r.OperationId.ToString("D"),"VALIDATION_NONCE");
                        VerifyCompleted(m,r,result);RuntimeLease.RequireNoOwnedProcesses(m);Check.That(Directory.GetFileSystemEntries(m.Data).Length==0,"VALIDATION_DATA_WRITTEN");
                        // A bootstrap failure receipt remains failure, even with successful cleanup.
                        result["protocol"]=Protocol;result["validationOnly"]=true;result["provisioningAuthorized"]=false;result["postgresExecuted"]=false;result["controllerCleanupVerified"]=true;
                        return result;
                    }catch(Exception error){primary=error;throw;}finally{
                        try{
                            if(host!=null&&!host.Exited)Check.That(Native.TerminateProcess(host.Handle,1)&&Native.WaitForSingleObject(host.Handle,10000)==0,"VALIDATION_HOST_CLEANUP_UNPROVEN");
                            if(started){var state=OfficialServiceConfig.QueryBound(m.Id,m.ServiceSid,m.ActorSid,m.BootstrapCommand,true);Check.That(state.State==1&&state.ProcessId==0,"VALIDATION_SERVICE_STOP_UNPROVEN");RuntimeLease.RequireNoOwnedProcesses(m);ServiceRegistration.DisableStoppedBootstrap(m);if(result!=null)result["serviceDisabled"]=true;}
                        }catch(Exception cleanup){FailureEvidence.PreservePrimary(primary,cleanup);}finally{if(host!=null)host.Dispose();try{grant.Dispose();}catch(Exception cleanup){FailureEvidence.PreservePrimary(primary,cleanup);}}
                    }
                }
            }
        }
        private static int Child(string id,string mode)
        {
            Check.That(mode=="wait"||mode=="tree"||mode=="leaf","VALIDATION_CHILD_MODE");Guid op;bool trial;var m=BootstrapRecords.Read(Contract.Id(id),out op,out trial);
            Check.That(trial&&Self==m.Host,"VALIDATION_CHILD_IMAGE");Tokens.RequireServiceContext(m.ServiceSid);
            Storage.JsonFile(Path.Combine(m.Work,mode=="leaf"?"probe-grandchild.json":"probe-started.json"),ProcessRecord(),m,true);
            if(mode=="tree")using(var descendant=Process.Start(new ProcessStartInfo{FileName=Self,Arguments="--trial-child "+id+" leaf",UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=m.Work}))Check.That(descendant!=null,"VALIDATION_DESCENDANT_START");
            Thread.Sleep(45000);return 0;
        }
        [STAThread]
        internal static int Entry(string[] args)
        {
            Guid operation=Guid.Empty;
            try{
                Check.Windows11();Contract.Machine();
                if(args.Length==3&&args[0]=="--trial-child")return Child(args[1],args[2]);
                Check.That(args.Length==1&&args[0]=="--request","VALIDATION_ARGUMENTS");
                var text=new StringBuilder();int ch;while((ch=Console.In.Read())>=0){Check.That(text.Length<4096,"VALIDATION_REQUEST_LIMIT");text.Append((char)ch);}byte[] bytes=Encoding.UTF8.GetBytes(text.ToString());var request=Parse(bytes);operation=request.OperationId;
                Dictionary<string,object> result;if(!Elevation.Administrator)result=Elevation.Launch(bytes,request);else using(var caller=ControllerLifetime.Parent())result=Run(request,()=>caller.Exited);
                Console.WriteLine(Contract.Json.Serialize(result));return (bool)result["complete"]?0:1;
            }catch(Exception e){var result=Reply(operation,false);var native=e as NativeFailure;result.Add("code",System.Text.RegularExpressions.Regex.IsMatch(e.Message??"",@"\A[A-Z0-9_]{1,96}\z")?e.Message:"VALIDATION_REVIEW");result.Add("win32Error",native==null?0:native.Win32Code);FailureEvidence.AddTo(result,e);Console.WriteLine(Contract.Json.Serialize(result));if(args.Length==0)MessageBox.Show(Contract.Json.Serialize(result),"Validacion opcion C — detenida");return 1;}
        }
        private sealed class ValidationWindow : Form
        {
            private readonly ComboBox scenarios=new ComboBox{DropDownStyle=ComboBoxStyle.DropDownList,Width=220};
            private readonly CheckBox consent=new CheckBox{Text="Autorizo solo un servicio NUEVO y una prueba sin PostgreSQL en esta VM.",AutoSize=true};
            private readonly Button run=new Button{Text="Ejecutar caso seleccionado",AutoSize=true};
            private readonly TextBox output=new TextBox{Multiline=true,ReadOnly=true,ScrollBars=ScrollBars.Both,WordWrap=false,Dock=DockStyle.Fill};
            internal ValidationWindow()
            {
                Text="SetupPostgres — validacion nativa 02 — diagnostico SCM (sin PostgreSQL)";Width=980;Height=690;
                var panel=new FlowLayoutPanel{Dock=DockStyle.Top,Height=145,FlowDirection=FlowDirection.TopDown,WrapContents=false};
                panel.Controls.Add(new Label{Text="synthetic-acceptance-only | productionAuthorized=false\nF-01/F-02 conservadas. No instala Community Tours. No iniciar como administrador.\nCada caso pide UAC con el MISMO usuario y conserva servicio/directorios nuevos. Restaurar snapshot al terminar.",AutoSize=true});
                scenarios.Items.AddRange(Scenarios);scenarios.SelectedIndex=0;panel.Controls.Add(scenarios);panel.Controls.Add(consent);panel.Controls.Add(run);Controls.Add(output);Controls.Add(panel);
                run.Click+=async delegate{
                    if(!consent.Checked||Elevation.Administrator){MessageBox.Show("Marque el consentimiento y abra el EXE con permisos normales.");return;}
                    run.Enabled=false;scenarios.Enabled=false;consent.Checked=false;Guid id=Guid.NewGuid(),op=Guid.NewGuid();string scenario=(string)scenarios.SelectedItem;
                    var request=new{protocol=Protocol,scope=Contract.Scope,productionAuthorized=false,operationId=op.ToString("D"),installationId=id.ToString("D"),scenario=scenario,manualConsent=Consent};
                    string local=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"ctsk-native-validation-"+op.ToString("D"));
                    try{
                        var acl=new DirectorySecurity();using(var actor=WindowsIdentity.GetCurrent()){acl.SetOwner(actor.User);acl.SetAccessRuleProtection(true,false);foreach(string sid in new[]{actor.User.Value,"S-1-5-18","S-1-5-32-544"})acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(sid),FileSystemRights.FullControl,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));}Storage.AtomicDirectory(local,acl);
                        File.WriteAllText(Path.Combine(local,"trial-plan.json"),Contract.Json.Serialize(new{request=request,serviceName="CTSK026-"+id.ToString("D"),instanceDirectory=new Installation{Id=id}.Directory,caller=ProcessRecord()}));
                        output.Text="Caso: "+scenario+"\r\nServicio: CTSK026-"+id+"\r\nInstancia: "+new Installation{Id=id}.Directory+"\r\nPlan/resultado: "+local+"\r\nEsperar UAC. Para casos de muerte: consultar work\\death-ready.json antes de actuar.\r\n";
                        byte[] bytes=Encoding.UTF8.GetBytes(Contract.Json.Serialize(request));var parsed=Parse(bytes);
                        var result=await System.Threading.Tasks.Task.Run(()=>Elevation.Launch(bytes,parsed));
                        // Elevation failures may use the service protocol. Never promote complete=false.
                        Check.That(Contract.Text(result,"operationId")==op.ToString("D")&&result["productionAuthorized"] is bool&&!(bool)result["productionAuthorized"],"VALIDATION_RESPONSE_BINDING");
                        File.WriteAllText(Path.Combine(local,"result.json"),Contract.Json.Serialize(result));
                        output.AppendText("\r\n"+((bool)result["complete"]?"CASO COMPLETADO (no certifica PostgreSQL)":"DETENIDO: conservar evidencia")+"\r\n"+Contract.Json.Serialize(result));
                    }catch(Exception e){var result=Reply(op,false);var native=e as NativeFailure;result.Add("code",System.Text.RegularExpressions.Regex.IsMatch(e.Message??"",@"\A[A-Z0-9_]{1,96}\z")?e.Message:"VALIDATION_REVIEW");result.Add("win32Error",native==null?0:native.Win32Code);FailureEvidence.AddTo(result,e);if(Directory.Exists(local))File.WriteAllText(Path.Combine(local,"result.json"),Contract.Json.Serialize(result));output.AppendText("\r\nDETENIDO: "+Contract.Json.Serialize(result));}
                    finally{run.Enabled=true;scenarios.Enabled=true;}
                };
            }
        }
    }
}
#endif
