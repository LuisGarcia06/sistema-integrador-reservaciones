// Fuente en revisión estática. PROHIBIDO compilar/ejecutar mientras siga en cuarentena.
// Prueba aislada de propiedades del token usado por PostgreSQL 18.3.
// No acepta ejecutables externos, no inicia PostgreSQL y no consulta bases.
using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;
using System.Web.Script.Serialization;

public static class SecurityProbe {
 [StructLayout(LayoutKind.Sequential)] public struct LUID { public uint Low; public int High; }
 [StructLayout(LayoutKind.Sequential)] public struct LA { public LUID Luid; public uint Attributes; }
 [StructLayout(LayoutKind.Sequential)] public struct SA { public IntPtr Sid; public uint Attributes; }
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] public struct STARTUPINFO { public uint cb;public string reserved,desktop,title;public uint x,y,xSize,ySize,xChars,yChars,fill,flags;public short show,cbReserved;public IntPtr reserved2,input,output,error; }
 [StructLayout(LayoutKind.Sequential)] public struct STARTUPINFOEX { public STARTUPINFO startup; public IntPtr attributes; }
 [StructLayout(LayoutKind.Sequential)] public struct JOB_BASIC_LIMITS { public long processTime,jobTime;public uint flags;public UIntPtr minWorkingSet,maxWorkingSet;public uint activeProcesses;public UIntPtr affinity;public uint priority,scheduling; }
 [StructLayout(LayoutKind.Sequential)] public struct IO_COUNTERS { public ulong readOperations,writeOperations,otherOperations,readBytes,writeBytes,otherBytes; }
 [StructLayout(LayoutKind.Sequential)] public struct JOB_LIMITS { public JOB_BASIC_LIMITS basic;public IO_COUNTERS io;public UIntPtr processMemory,jobMemory,peakProcessMemory,peakJobMemory; }
 [StructLayout(LayoutKind.Sequential)] public struct PI { public IntPtr process,thread;public uint pid,tid; }
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] public struct TRUSTEE {public IntPtr multiple;public int multipleOperation,form,type;public IntPtr name;}
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] public struct EA { public uint permissions;public int mode;public uint inheritance;public TRUSTEE trustee; }
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool OpenProcessToken(IntPtr process,uint desired,out IntPtr token);
 [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool GetTokenInformation(IntPtr token,int type,IntPtr buffer,int size,out int needed);
 [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool LookupPrivilegeName(string system,ref LUID luid,StringBuilder name,ref int length);
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool CreateRestrictedToken(IntPtr token,uint flags,uint sidCount,SA[] sids,uint privilegeCount,LA[] privileges,uint restrictingCount,IntPtr restricting,out IntPtr restricted);
 [DllImport("advapi32.dll",EntryPoint="CreateProcessAsUserW",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcessAsUser(IntPtr token,string exe,StringBuilder command,IntPtr processSecurity,IntPtr threadSecurity,bool inherit,uint flags,IntPtr environment,string cwd,ref STARTUPINFOEX startup,out PI pi);
 [DllImport("kernel32.dll",EntryPoint="CreateJobObjectW",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr security,string name);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int type,ref JOB_LIMITS limits,uint length);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool TerminateJobObject(IntPtr job,uint code);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool InitializeProcThreadAttributeList(IntPtr list,uint count,uint flags,ref IntPtr size);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool UpdateProcThreadAttribute(IntPtr list,uint flags,IntPtr attribute,IntPtr value,IntPtr size,IntPtr previous,IntPtr returned);
 [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
 [DllImport("kernel32.dll",SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
 [DllImport("kernel32.dll",SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle,uint milliseconds);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr handle,out uint code);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool CloseHandle(IntPtr handle);
 [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr value);
 [DllImport("advapi32.dll")] static extern uint GetSecurityInfo(IntPtr handle,int type,uint flags,out IntPtr owner,out IntPtr group,out IntPtr dacl,out IntPtr sacl,out IntPtr descriptor);
 [DllImport("advapi32.dll",CharSet=CharSet.Unicode)] static extern uint SetEntriesInAcl(uint count,EA[] entries,IntPtr oldAcl,out IntPtr newAcl);
 [DllImport("advapi32.dll")] static extern uint SetSecurityInfo(IntPtr handle,int type,uint flags,IntPtr owner,IntPtr group,IntPtr dacl,IntPtr sacl);
 static void Check(bool ok,string code){if(!ok)throw new Exception(code+":"+Marshal.GetLastWin32Error());}
 static IntPtr Info(IntPtr token,int type,out int length){
  int needed;bool sized=GetTokenInformation(token,type,IntPtr.Zero,0,out needed);int error=Marshal.GetLastWin32Error();
  if(sized||error!=122||needed<=0||needed>1048576)throw new Exception("TOKEN_LENGTH");
  IntPtr p=Marshal.AllocHGlobal(needed);
  try{Check(GetTokenInformation(token,type,p,needed,out length),"TOKEN_READ");if(length<=0||length>needed)throw new Exception("TOKEN_TRUNCATED");return p;}
  catch{Marshal.FreeHGlobal(p);throw;}
 }
 static int Count(IntPtr p,int length,int offset,int stride){if(length<offset)throw new Exception("TOKEN_TRUNCATED");int count=Marshal.ReadInt32(p);if(count<0||count>(length-offset)/stride)throw new Exception("TOKEN_TRUNCATED");return count;}
 static string Privilege(LUID id){int n=256;var b=new StringBuilder(n);Check(LookupPrivilegeName(null,ref id,b,ref n),"PRIVILEGE_NAME");return b.ToString();}
 static List<LA> Privileges(IntPtr token){int length;IntPtr p=Info(token,3,out length);try{int stride=Marshal.SizeOf(typeof(LA)),count=Count(p,length,4,stride);var list=new List<LA>();for(int i=0;i<count;i++)list.Add((LA)Marshal.PtrToStructure(IntPtr.Add(p,4+stride*i),typeof(LA)));return list;}finally{Marshal.FreeHGlobal(p);}}
 static Dictionary<string,object> Describe(){IntPtr token;Check(OpenProcessToken(GetCurrentProcess(),8,out token),"TOKEN_OPEN");try{
  var privs=new List<string>();foreach(var p in Privileges(token))privs.Add(Privilege(p.Luid));
  int length;IntPtr groups=Info(token,2,out length);var selected=new Dictionary<string,object>{{"S-1-5-32-544",null},{"S-1-5-32-547",null}};
  try{int offset=IntPtr.Size==8?8:4,size=Marshal.SizeOf(typeof(SA)),count=Count(groups,length,offset,size);for(int i=0;i<count;i++){var sa=(SA)Marshal.PtrToStructure(IntPtr.Add(groups,offset+i*size),typeof(SA));string sid=new SecurityIdentifier(sa.Sid).Value;if(selected.ContainsKey(sid)){if(selected[sid]!=null)throw new Exception("TOKEN_DUPLICATE_GROUP");selected[sid]=sa.Attributes;}}}finally{Marshal.FreeHGlobal(groups);}
  IntPtr restricted=Info(token,21,out length);int has;
  try{if(length!=4)throw new Exception("TOKEN_TRUNCATED");has=Marshal.ReadInt32(restricted);if(has!=0&&has!=1)throw new Exception("TOKEN_RESTRICTIONS_AMBIGUOUS");}finally{Marshal.FreeHGlobal(restricted);}
  using(var identity=WindowsIdentity.GetCurrent())return new Dictionary<string,object>{{"schemaVersion",1},{"user",identity.User.Value},{"privileges",privs},{"privilegesComplete",true},{"groups",selected},{"groupsComplete",true},{"hasRestrictions",has==1}};
 }finally{Check(CloseHandle(token),"TOKEN_CLOSE");}}
 static void GrantUserTokenDacl(IntPtr token){
  IntPtr owner,group,dacl,sacl,sd=IntPtr.Zero,user=IntPtr.Zero,next=IntPtr.Zero;
  try{uint status=GetSecurityInfo(token,6,4,out owner,out group,out dacl,out sacl,out sd);if(status!=0||sd==IntPtr.Zero||dacl==IntPtr.Zero)throw new Exception("TOKEN_DACL_READ:"+status);
   int length;user=Info(token,1,out length);if(length<Marshal.SizeOf(typeof(SA)))throw new Exception("TOKEN_TRUNCATED");
   var entry=new EA{permissions=0xF01FF,mode=1,inheritance=0,trustee=new TRUSTEE{form=0,type=1,name=Marshal.ReadIntPtr(user)}};
   status=SetEntriesInAcl(1,new EA[]{entry},dacl,out next);if(status!=0||next==IntPtr.Zero)throw new Exception("TOKEN_DACL_BUILD:"+status);
   status=SetSecurityInfo(token,6,4,IntPtr.Zero,IntPtr.Zero,next,IntPtr.Zero);if(status!=0)throw new Exception("TOKEN_DACL_WRITE:"+status);
  }finally{if(user!=IntPtr.Zero)Marshal.FreeHGlobal(user);if(next!=IntPtr.Zero)LocalFree(next);if(sd!=IntPtr.Zero)LocalFree(sd);}
 }
 static void Close(ref IntPtr handle,List<string> errors){if(handle==IntPtr.Zero)return;if(!CloseHandle(handle))errors.Add("HANDLE_CLOSE:"+Marshal.GetLastWin32Error());handle=IntPtr.Zero;}
 static string Quote(string s){if(s.IndexOf('\0')>=0||s.IndexOf('\r')>=0||s.IndexOf('\n')>=0)throw new Exception("ARGUMENT");var b=new StringBuilder("\"");int slashes=0;foreach(char c in s){if(c=='\\'){slashes++;continue;}if(c=='\"'){b.Append('\\',slashes*2+1);b.Append(c);}else{b.Append('\\',slashes);b.Append(c);}slashes=0;}b.Append('\\',slashes*2);b.Append('"');return b.ToString();}
 static void Launch(string output){
  if(File.Exists(output)||!Path.IsPathRooted(output))throw new Exception("NEW_OUTPUT_REQUIRED");
  IntPtr original=IntPtr.Zero,restricted=IntPtr.Zero,job=IntPtr.Zero,attributes=IntPtr.Zero,jobList=IntPtr.Zero;
  bool attributesReady=false,exited=false;var pins=new List<GCHandle>();PI pi=new PI();Exception failure=null;
  try{
   Check(OpenProcessToken(GetCurrentProcess(),0xA,out original),"TOKEN_OPEN_QUERY_DUPLICATE");
   var drop=new SA[2];string[] ids={"S-1-5-32-544","S-1-5-32-547"};for(int i=0;i<2;i++){var sid=new SecurityIdentifier(ids[i]);byte[] bytes=new byte[sid.BinaryLength];sid.GetBinaryForm(bytes,0);var pin=GCHandle.Alloc(bytes,GCHandleType.Pinned);pins.Add(pin);drop[i]=new SA{Sid=pin.AddrOfPinnedObject(),Attributes=0};}
   var delete=new List<LA>();foreach(var p in Privileges(original)){string name=Privilege(p.Luid);if(name!="SeLockMemoryPrivilege"&&name!="SeChangeNotifyPrivilege")delete.Add(p);}
   Check(CreateRestrictedToken(original,0,2,drop,(uint)delete.Count,delete.ToArray(),0,IntPtr.Zero,out restricted),"TOKEN_RESTRICT");
   GrantUserTokenDacl(restricted);
   job=CreateJobObject(IntPtr.Zero,null);Check(job!=IntPtr.Zero,"JOB_CREATE");
   var limits=new JOB_LIMITS();limits.basic.flags=0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
   Check(SetInformationJobObject(job,9,ref limits,(uint)Marshal.SizeOf(typeof(JOB_LIMITS))),"JOB_LIMITS");
   IntPtr attributeBytes=IntPtr.Zero;bool sized=InitializeProcThreadAttributeList(IntPtr.Zero,1,0,ref attributeBytes);int error=Marshal.GetLastWin32Error();
   if(sized||error!=122||attributeBytes.ToInt64()<=0||attributeBytes.ToInt64()>1048576)throw new Exception("ATTRIBUTE_LENGTH");
   attributes=Marshal.AllocHGlobal(attributeBytes);Check(InitializeProcThreadAttributeList(attributes,1,0,ref attributeBytes),"ATTRIBUTE_INIT");attributesReady=true;
   jobList=Marshal.AllocHGlobal(IntPtr.Size);Marshal.WriteIntPtr(jobList,job);
   // Pertenencia atómica al crear: no hay ventana de hijo suspendido fuera del job.
   Check(UpdateProcThreadAttribute(attributes,0,new IntPtr(0x2000D),jobList,new IntPtr(IntPtr.Size),IntPtr.Zero,IntPtr.Zero),"ATTRIBUTE_JOB_LIST");
   string exe=Assembly.GetExecutingAssembly().Location;var startup=new STARTUPINFOEX();startup.startup.cb=(uint)Marshal.SizeOf(typeof(STARTUPINFOEX));startup.attributes=attributes;
   Check(CreateProcessAsUser(restricted,exe,new StringBuilder(Quote(exe)+" --child "+Quote(output)),IntPtr.Zero,IntPtr.Zero,false,0x4|0x8000000|0x80000,IntPtr.Zero,Path.GetDirectoryName(output),ref startup,out pi),"RESTRICTED_CREATE");
   if(ResumeThread(pi.thread)==0xFFFFFFFF)Check(false,"RESUME");
   uint wait=WaitForSingleObject(pi.process,15000);if(wait==258)throw new Exception("CHILD_TIMEOUT");if(wait==0xFFFFFFFF)Check(false,"CHILD_WAIT_FAILED");if(wait!=0)throw new Exception("CHILD_WAIT_AMBIGUOUS");
   exited=true;uint code;Check(GetExitCodeProcess(pi.process,out code),"CHILD_EXIT");if(code!=0)throw new Exception("CHILD_FAILED");
  }catch(Exception e){failure=e;}
  finally{
   var errors=new List<string>();
   if(pi.process!=IntPtr.Zero&&!exited){if(!TerminateJobObject(job,1))errors.Add("CHILD_TERMINATE:"+Marshal.GetLastWin32Error());}
   // Cerrar el job también termina hijos si la terminación explícita falló.
   Close(ref job,errors);
   if(pi.process!=IntPtr.Zero&&!exited&&WaitForSingleObject(pi.process,5000)!=0)errors.Add("CHILD_CLEANUP_UNPROVEN");
   Close(ref pi.thread,errors);Close(ref pi.process,errors);
   if(attributesReady)DeleteProcThreadAttributeList(attributes);
   if(attributes!=IntPtr.Zero)Marshal.FreeHGlobal(attributes);if(jobList!=IntPtr.Zero)Marshal.FreeHGlobal(jobList);
   Close(ref restricted,errors);Close(ref original,errors);foreach(var p in pins)p.Free();
   if(errors.Count>0)failure=new Exception((failure==null?"":failure.Message+";")+String.Join(";",errors.ToArray()));
  }
  if(failure!=null)throw failure;
 }
 public static int Main(string[] args){try{
  if(args.Length==2&&args[0]=="--child"){using(var f=new FileStream(args[1],FileMode.CreateNew,FileAccess.Write,FileShare.None))using(var w=new StreamWriter(f,new UTF8Encoding(false)))w.Write(new JavaScriptSerializer().Serialize(Describe()));return 0;}
  if(args.Length!=2||args[0]!="probe")throw new Exception("PROBE_ARGUMENTS");Launch(Path.GetFullPath(args[1]));Console.WriteLine("RESTRICTED_PROBE_COMPLETED");return 0;
 }catch(Exception e){Console.Error.WriteLine("PROBE_FAILED "+e.Message);return 1;}}
}
