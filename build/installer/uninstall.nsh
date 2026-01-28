!include "nsDialogs.nsh"

Function un.CustomUninstallPage
  nsDialogs::Create 1018
  Pop $0

  ${NSD_CreateLabel} 10u 20u 100% 40u \
    "SmartStock POS has been removed.\n\nBuilt by betsafehub.\nVisit NetSafeHub for customized digital solutions."
  Pop $1

  ${NSD_CreateLink} 10u 70u 100% 14u \
    "https://netsafehub.com"
  Pop $2
  ${NSD_OnClick} $2 OpenNetSafeHub

  nsDialogs::Show
FunctionEnd

Function OpenNetSafeHub
  ExecShell "open" "https://netsafehub.com"
FunctionEnd
