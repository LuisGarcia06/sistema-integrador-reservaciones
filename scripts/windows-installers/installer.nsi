; Compilado por build.cjs. No aprovisiona PostgreSQL ni ejecuta código instalado.
Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"
!include "FileFunc.nsh"
Name "Community Tours ${SIDE} 026 - ENSAYO"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\CommunityTours\Candidates026\${RELEASE}\${SIDE}"
RequestExecutionLevel user
SetCompressor /SOLID zlib
ShowInstDetails show
ShowUninstDetails show
!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Spanish"
Var Options
Var LabOnly
Function .onInit
  ${IfNot} ${RunningX64}
    Abort "Se requiere Windows 11 x64."
  ${EndIf}
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion" "CurrentBuildNumber"
  ${If} $0 < 22000
    Abort "Se requiere Windows 11 x64 (build 22000 o posterior)."
  ${EndIf}
  ${GetParameters} $Options
  ClearErrors
  ${GetOptions} $Options "/LABONLY" $LabOnly
  ${If} ${Errors}
    Abort "Candidato sin firma empresarial. Solo VM aislada: iniciar con /LABONLY. No instalar en Community Tours."
  ${EndIf}
  ; Nunca actualizar en el sitio ni mezclar código con una instalación anterior.
  ; /D= no permite cambiar el destino fijo y versionado.
  StrCpy $INSTDIR "$LOCALAPPDATA\CommunityTours\Candidates026\${RELEASE}\${SIDE}"
  IfFileExists "$INSTDIR\*.*" 0 +2
    Abort "Destino existente: use un candidato con versión nueva y reinscripción explícita."
FunctionEnd
Section "Candidato de ensayo"
  ; Revalidar al comenzar la copia, incluso si cambió el destino tras .onInit.
  StrCpy $INSTDIR "$LOCALAPPDATA\CommunityTours\Candidates026\${RELEASE}\${SIDE}"
  IfFileExists "$INSTDIR\*.*" 0 +2
    Abort "Destino existente. No se sobrescribe."
  SetOutPath "$INSTDIR"
  File /r "${PAYLOAD}\*.*"
  ; Uninstall.exe queda fuera del inventario de runtime y se aloja fuera del payload.
  CreateDirectory "$LOCALAPPDATA\CommunityTours\CandidateUninstall026\${RELEASE}\${SIDE}"
  WriteUninstaller "$LOCALAPPDATA\CommunityTours\CandidateUninstall026\${RELEASE}\${SIDE}\Uninstall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CTSK-${RELEASE}-${SIDE}" "DisplayName" "Community Tours ${SIDE} 026 ENSAYO"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CTSK-${RELEASE}-${SIDE}" "UninstallString" '"$LOCALAPPDATA\CommunityTours\CandidateUninstall026\${RELEASE}\${SIDE}\Uninstall.exe"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CTSK-${RELEASE}-${SIDE}" "InstallLocation" "$INSTDIR"
  CreateDirectory "$SMPROGRAMS\Community Tours ${RELEASE}"
  CreateShortCut "$SMPROGRAMS\Community Tours ${RELEASE}\${SIDE} - Procedimiento.lnk" "$INSTDIR\LEEME.txt"
!ifdef CLIENT
  CreateShortCut "$SMPROGRAMS\Community Tours ${RELEASE}\Cliente 026.lnk" "$INSTDIR\runtime\electron.exe" '--ctsk-descriptor="$LOCALAPPDATA\ctsk-client026-${RELEASE}\client026.json" --ctsk-trust="$LOCALAPPDATA\ctsk-client026-${RELEASE}\authority026.json"'
  CreateShortCut "$DESKTOP\Community Tours Cliente ${RELEASE}.lnk" "$INSTDIR\runtime\electron.exe" '--ctsk-descriptor="$LOCALAPPDATA\ctsk-client026-${RELEASE}\client026.json" --ctsk-trust="$LOCALAPPDATA\ctsk-client026-${RELEASE}\authority026.json"'
!endif
SectionEnd
Function un.onInit
  ; Destino fijo, no confiamos en el directorio del ejecutable ni en un argumento /D.
  StrCpy $INSTDIR "$LOCALAPPDATA\CommunityTours\Candidates026\${RELEASE}\${SIDE}"
FunctionEnd
Section "Uninstall"
  ; Política conservadora: retirar solo accesos/registro. Sin borrado recursivo de archivos.
  ; Código, bases, secretos y respaldos se preservan para revisión y retiro selectivo.
  Delete "$SMPROGRAMS\Community Tours ${RELEASE}\${SIDE} - Procedimiento.lnk"
!ifdef CLIENT
  Delete "$SMPROGRAMS\Community Tours ${RELEASE}\Cliente 026.lnk"
  Delete "$DESKTOP\Community Tours Cliente ${RELEASE}.lnk"
!endif
  RMDir "$SMPROGRAMS\Community Tours ${RELEASE}"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CTSK-${RELEASE}-${SIDE}"
  DetailPrint "Se conservaron código, configuración, bases y respaldos. Retiro de archivos requiere revisión separada."
SectionEnd
