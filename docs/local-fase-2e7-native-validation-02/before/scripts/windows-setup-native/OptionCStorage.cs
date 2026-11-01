using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
namespace CommunityTours.Setup026
{
    internal static class Storage
    {
        [StructLayout(LayoutKind.Sequential)] private struct SecurityAttributes {internal int Size;internal IntPtr Descriptor;[MarshalAs(UnmanagedType.Bool)]internal bool Inherit;}
        [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] private static extern bool CreateDirectoryW(string path,ref SecurityAttributes attributes);
        private static HashSet<string> Trusted(string actor,string service,bool program=false){var result=new HashSet<string>(StringComparer.Ordinal){"S-1-5-18","S-1-5-32-544"};if(actor!=null)result.Add(actor);if(service!=null)result.Add(service);if(program)result.Add("S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464");return result;}
        private static void Inspect(FileSystemInfo item,HashSet<string> trusted,long mask)
        {
            Check.That((item.Attributes&FileAttributes.ReparsePoint)==0,"STORAGE_REPARSE");FileSystemSecurity acl=item is DirectoryInfo?(FileSystemSecurity)((DirectoryInfo)item).GetAccessControl(AccessControlSections.Owner|AccessControlSections.Access):((FileInfo)item).GetAccessControl(AccessControlSections.Owner|AccessControlSections.Access);
            Check.That(trusted.Contains(acl.GetOwner(typeof(SecurityIdentifier)).Value),"STORAGE_OWNER");var rules=acl.GetAccessRules(true,true,typeof(SecurityIdentifier));Check.That(rules.Count>0,"STORAGE_EMPTY_ACL");
            foreach(FileSystemAccessRule rule in rules){if(rule.AccessControlType!=AccessControlType.Allow||(rule.PropagationFlags&PropagationFlags.InheritOnly)!=0||trusted.Contains(rule.IdentityReference.Value))continue;Check.That((((long)rule.FileSystemRights)&mask)==0,"STORAGE_FOREIGN_ACCESS");}
        }
        internal static void Program(string file,string actor=null)
        {
            Check.That(Path.IsPathRooted(file)&&Path.GetFullPath(file)==file&&!file.StartsWith(@"\\"),"PROGRAM_PATH");if(actor==null)using(var id=WindowsIdentity.GetCurrent())actor=id.User.Value;
            var trusted=Trusted(actor,null,true);Inspect(new FileInfo(file),trusted,852310);var parent=new FileInfo(file).Directory;int depth=0;while(parent!=null){Inspect(parent,trusted,depth++==0?852310:852032);parent=parent.Parent;}
        }
        internal static void Private(string file,Installation m,bool directory=false)
        {Check.That(file.StartsWith(m.Directory+Path.DirectorySeparatorChar,StringComparison.Ordinal)||file==m.Directory,"PRIVATE_PATH");var trusted=Trusted(m.ActorSid,m.ServiceSid);Inspect(directory?(FileSystemInfo)new DirectoryInfo(file):new FileInfo(file),trusted,2032127);var parent=directory?new DirectoryInfo(file).Parent:new FileInfo(file).Directory;while(parent!=null&&parent.FullName.StartsWith(m.Directory,StringComparison.Ordinal)){Inspect(parent,trusted,2032127);parent=parent.Parent;}}
        private static DirectorySecurity DirectoryAcl(string actor,string service,bool serviceWrite,bool common)
        {
            var acl=new DirectorySecurity();acl.SetAccessRuleProtection(true,false);acl.SetOwner(new SecurityIdentifier("S-1-5-32-544"));
            foreach(string sid in new[]{"S-1-5-18","S-1-5-32-544"})acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(sid),FileSystemRights.FullControl,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));
            if(common)acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier("S-1-5-32-545"),FileSystemRights.ReadAndExecute,InheritanceFlags.None,PropagationFlags.None,AccessControlType.Allow));
            if(actor!=null)acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(actor),FileSystemRights.ReadAndExecute,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));
            if(service!=null)acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(service),serviceWrite?FileSystemRights.FullControl:FileSystemRights.ReadAndExecute,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));return acl;
        }
        internal static void AtomicDirectory(string file,DirectorySecurity acl)
        {
            byte[] bytes=acl.GetSecurityDescriptorBinaryForm();var pinned=GCHandle.Alloc(bytes,GCHandleType.Pinned);try{var sa=new SecurityAttributes{Size=Marshal.SizeOf(typeof(SecurityAttributes)),Descriptor=pinned.AddrOfPinnedObject(),Inherit=false};Check.That(CreateDirectoryW(file,ref sa),"PRIVATE_DIRECTORY_CREATE_REVIEW");}finally{pinned.Free();}
        }
        internal static void Prepare(Installation m)
        {
            foreach(string file in new[]{@"C:\ProgramData\CommunityTours",@"C:\ProgramData\CommunityTours\Acceptance026"}){
                var parent=new DirectoryInfo(Path.GetDirectoryName(file));Inspect(parent,Trusted(null,null,true),parent.FullName==@"C:\ProgramData"?852032:852310);
                if(Directory.Exists(file))Inspect(new DirectoryInfo(file),Trusted(null,null),852310);else AtomicDirectory(file,DirectoryAcl(null,null,false,true));
            }
            Check.That(!Directory.Exists(m.Directory)&&!File.Exists(m.Directory),"INSTANCE_EXISTS_REVIEW");
            AtomicDirectory(m.Directory,DirectoryAcl(m.ActorSid,m.ServiceSid,false,false));Private(m.Directory,m,true);
            foreach(string file in new[]{m.Control,m.Work,m.Data}){AtomicDirectory(file,DirectoryAcl(m.ActorSid,m.ServiceSid,file!=m.Control,false));Private(file,m,true);}
        }
        private static FileSecurity FileAcl(Installation m,bool serviceWrite)
        {
            var acl=new FileSecurity();acl.SetAccessRuleProtection(true,false);if(serviceWrite){using(var id=WindowsIdentity.GetCurrent())acl.SetOwner(id.User);}else acl.SetOwner(new SecurityIdentifier("S-1-5-32-544"));
            foreach(string sid in new[]{"S-1-5-18","S-1-5-32-544"})acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(sid),FileSystemRights.FullControl,AccessControlType.Allow));
            acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(m.ActorSid),FileSystemRights.ReadAndExecute,AccessControlType.Allow));acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(m.ServiceSid),serviceWrite?FileSystemRights.FullControl:FileSystemRights.ReadAndExecute,AccessControlType.Allow));return acl;
        }
        internal static FileStream NewFile(string file,Installation m,bool serviceWrite)
        {Check.That(Path.GetFullPath(file)==file&&(Path.GetDirectoryName(file)==m.Control||Path.GetDirectoryName(file)==m.Work),"PRIVATE_FILE_PATH");Private(Path.GetDirectoryName(file),m,true);return new FileStream(file,FileMode.CreateNew,FileSystemRights.FullControl,FileShare.Read,4096,FileOptions.WriteThrough,FileAcl(m,serviceWrite));}
        internal static void Write(string file,byte[] bytes,Installation m,bool serviceWrite=false){using(var stream=NewFile(file,m,serviceWrite)){stream.Write(bytes,0,bytes.Length);stream.Flush(true);}Private(file,m);}
        internal static void JsonFile(string file,object value,Installation m,bool serviceWrite=false){Write(file,new UTF8Encoding(false).GetBytes(Contract.Json.Serialize(value)),m,serviceWrite);}
        internal static byte[] Read(string file,Installation m){Private(file,m);byte[] bytes=File.ReadAllBytes(file);Check.That(bytes.Length<=1048576,"PRIVATE_FILE_LIMIT");return bytes;}
    }
}
