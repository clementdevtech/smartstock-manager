; =========================================
; SmartStock POS – NSIS Installer
; Built by Clement DevTech
; Powered by NetSafeHub
; =========================================

!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"

!define MUI_ABORTWARNING

; -----------------------------------------
; Welcome Page
; -----------------------------------------
!define MUI_WELCOMEPAGE_TITLE "Welcome to SmartStock POS"
!define MUI_WELCOMEPAGE_TEXT \
"SmartStock POS\n\nOffline-first inventory & sales system.\n\nBuilt by Clement DevTech\nPowered by NetSafeHub"

!insertmacro MUI_PAGE_WELCOME

; Custom advert page (TEXT ONLY — SAFE)
Page custom CustomAdvertPage

!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

; -----------------------------------------
; Finish Page Options
; -----------------------------------------
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Launch SmartStock POS"
!define MUI_FINISHPAGE_RUN_FUNCTION LaunchApp

!define MUI_FINISHPAGE_SHOWREADME
!define MUI_FINISHPAGE_SHOWREADME_TEXT "Visit NetSafeHub Website"
!define MUI_FINISHPAGE_SHOWREADME_FUNCTION OpenNetSafeHub

; -----------------------------------------
; Language
; -----------------------------------------
!insertmacro MUI_LANGUAGE "English"

; -----------------------------------------
; Installer Section
; -----------------------------------------
Section "Install"
  ; electron-builder handles file copying
SectionEnd

; =========================================
; Custom Advert Page
; =========================================
Function CustomAdvertPage
  nsDialogs::Create 1018
  Pop $0

  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 10u 10u 100% 28u \
    "SmartStock POS — Powered by NetSafeHub"
  Pop $1

  ${NSD_CreateLabel} 10u 44u 100% 40u \
    "Offline-first inventory & sales system.$\r$\n$\r$\nBuilt by Clement DevTech."
  Pop $2

  ${NSD_CreateLink} 10u 96u 100% 14u \
    "Visit NetSafeHub → https://netsafehub.com"
  Pop $3
  ${NSD_OnClick} $3 OpenNetSafeHub

  nsDialogs::Show
FunctionEnd

; -----------------------------------------
; Launch App
; -----------------------------------------
Function LaunchApp
  ${If} ${FileExists} "$INSTDIR\${APP_FILENAME}.exe"
    Exec "$INSTDIR\${APP_FILENAME}.exe"
  ${Else}
    MessageBox MB_ICONSTOP "Application executable not found."
  ${EndIf}
FunctionEnd

; -----------------------------------------
; Open Website
; -----------------------------------------
Function OpenNetSafeHub
  ExecShell "open" "https://netsafehub.com"
FunctionEnd

; =========================================
; UNINSTALLER
; =========================================
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH
