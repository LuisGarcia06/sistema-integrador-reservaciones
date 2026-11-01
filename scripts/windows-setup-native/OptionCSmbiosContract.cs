// Parses only bounded SMBIOS system identity; no WMI, permissions or service APIs.
using System;
using System.Security.Cryptography;
using System.Text;
namespace CommunityTours.Setup026
{
    public static class SmbiosContract
    {
        private static void Need(bool value,string code){if(!value)throw new InvalidOperationException(code);}
        private static string Text(byte[] raw,int start,int end,int index)
        {
            Need(index>0,"SMBIOS_STRING_INDEX");int n=1,cursor=start;
            while(cursor<end){int stop=cursor;while(stop<end&&raw[stop]!=0)stop++;if(n==index){Need(stop>cursor,"SMBIOS_STRING_EMPTY");for(int p=cursor;p<stop;p++)Need(raw[p]>=32&&raw[p]<=126,"SMBIOS_STRING_ENCODING");return Encoding.ASCII.GetString(raw,cursor,stop-cursor);}n++;cursor=stop+1;}
            throw new InvalidOperationException("SMBIOS_STRING_INDEX");
        }
        public static string Fingerprint(byte[] raw)
        {
            Need(raw!=null&&raw.Length>=8&&raw.Length<=1048576,"SMBIOS_BUFFER");
            Need(raw[1]>=2&&BitConverter.ToUInt32(raw,4)==raw.Length-8,"SMBIOS_HEADER");
            int cursor=8;string identity=null;bool ended=false;
            while(cursor+4<=raw.Length){
                int type=raw[cursor],length=raw[cursor+1];Need(length>=4&&cursor+length<=raw.Length,"SMBIOS_RECORD_LENGTH");
                int strings=cursor+length,end=strings;while(end+1<raw.Length&&(raw[end]!=0||raw[end+1]!=0))end++;
                Need(end+1<raw.Length,"SMBIOS_STRINGS_UNTERMINATED");
                if(type==1){
                    Need(identity==null&&length>=24,"SMBIOS_SYSTEM_AMBIGUOUS");
                    string manufacturer=Text(raw,strings,end+1,raw[cursor+4]),product=Text(raw,strings,end+1,raw[cursor+5]);
                    Need((manufacturer=="Oracle Corporation"||manufacturer=="innotek GmbH")&&product=="VirtualBox","VIRTUALBOX_REQUIRED");
                    byte[] uuid=new byte[16];Array.Copy(raw,cursor+8,uuid,0,16);bool zero=true,ones=true;foreach(byte b in uuid){zero&=b==0;ones&=b==255;}Need(!zero&&!ones,"SMBIOS_UUID_MISSING");
                    // Bind the exact raw UUID bytes and version to the controller's WMI UUID.
                    // No alternate byte order, inferred UUID or permissive legacy fallback.
                    identity=manufacturer+"|"+product+"|"+raw[1]+"."+raw[2]+"|"+BitConverter.ToString(uuid);
                }
                cursor=end+2;if(type==127){ended=true;break;}
            }
            Need(identity!=null&&ended,"SMBIOS_SYSTEM_MISSING");
            using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(Encoding.ASCII.GetBytes(identity))).Replace("-","").ToLowerInvariant();
        }
    }
}
