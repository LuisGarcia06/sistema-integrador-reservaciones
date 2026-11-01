#if NATIVE_VALIDATION_ONLY
// Pure mode selection shared by the real validation entry and managed regression.
// No environment, UI, file, network, elevation, service or token API is called here.
using System;
namespace CommunityTours.Setup026
{
    public static class ValidationEntry
    {
        public const string BuildProfile="native-validation-only-v04-token-query-stop";
        public static int Dispatch(string[] args,Action checkContext,Func<int> graphical,Func<int> request,Func<int> elevated,Func<int> child)
        {
            int mode;
            if(args==null)throw new InvalidOperationException("VALIDATION_ARGUMENTS");
            if(args.Length==0)mode=0;
            else if(args.Length==1&&args[0]=="--request")mode=1;
            else if(args.Length==3&&args[0]=="--elevated-request")mode=2;
            else if(args.Length==3&&args[0]=="--trial-child")mode=3;
            else throw new InvalidOperationException("VALIDATION_ARGUMENTS");
            checkContext();
            switch(mode){case 0:return graphical();case 1:return request();case 2:return elevated();case 3:return child();default:throw new InvalidOperationException("VALIDATION_ARGUMENTS");}
        }
    }
}
#endif
