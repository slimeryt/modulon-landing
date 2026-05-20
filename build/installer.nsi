;───────────────────────────────────────────────────────────────────────────────
; Modulon — fully custom NSIS installer
; ROOT is passed from make-installer.mjs as /DROOT="<abs-project-path>"
;───────────────────────────────────────────────────────────────────────────────
Unicode True
SetCompressor /SOLID lzma

!define APPNAME   "Modulon"
!define APPVER    "0.1.0"
!define PUBLISHER "Modulon"
!define EXENAME   "Modulon.exe"

!define SRCDIR    "${ROOT}\dist-electron\win-unpacked"
!define ICONFILE  "${ROOT}\public\icon.ico"
!define BUILDDIR  "${ROOT}\build"

!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\Modulon"

Name    "${APPNAME} ${APPVER}"
OutFile "${ROOT}\dist-electron\Modulon-Setup.exe"
BrandingText "${APPNAME} ${APPVER}"

InstallDir       "$LOCALAPPDATA\Programs\${APPNAME}"
InstallDirRegKey HKCU "${UNINSTKEY}" "InstallLocation"
RequestExecutionLevel user
ShowInstDetails   nevershow
ShowUninstDetails nevershow

;── MUI2 ────────────────────────────────────────────────────────────────────
!include "MUI2.nsh"

!define MUI_ICON   "${ICONFILE}"
!define MUI_UNICON "${ICONFILE}"

!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_BITMAP         "${BUILDDIR}\installer-header.bmp"
!define MUI_HEADERIMAGE_RIGHT

!define MUI_WELCOMEFINISHPAGE_BITMAP   "${BUILDDIR}\installer-sidebar.bmp"
!define MUI_WELCOMEFINISHPAGE_BITMAP_NOSTRETCH

!define MUI_WELCOMEPAGE_TITLE  "Installing ${APPNAME} ${APPVER}"
!define MUI_WELCOMEPAGE_TEXT   "AI chatbot trained on real human conversation.$\r$\n$\r$\nClick Next to choose where to install."
!define MUI_FINISHPAGE_TITLE   "Installation complete"
!define MUI_FINISHPAGE_TEXT    "${APPNAME} ${APPVER} is ready to use."
!define MUI_FINISHPAGE_RUN     "$INSTDIR\${EXENAME}"
!define MUI_FINISHPAGE_RUN_TEXT "Launch ${APPNAME}"
!define MUI_ABORTWARNING

;── Pages ────────────────────────────────────────────────────────────────────
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

;── Splash + kill any running instance ───────────────────────────────────────
Function .onInit
  nsExec::Exec 'taskkill /F /IM "${EXENAME}" /T'
  Pop $0

  InitPluginsDir
  File /oname=$PLUGINSDIR\splash.bmp "${BUILDDIR}\installer-splash.bmp"
  advsplash::show 1800 300 300 -1 $PLUGINSDIR\splash
  Pop $0
  Delete "$PLUGINSDIR\splash.bmp"
FunctionEnd

;── Install ──────────────────────────────────────────────────────────────────
Section "-Main"
  SetOutPath "$INSTDIR"
  ; Exclude app.asar.unpacked — Capacitor/Android build artifacts inside it
  ; contain extremely long paths that NSIS cannot open (MAX_PATH exceeded).
  ; The Electron app uses only app.asar; no native modules are loaded at runtime.
  File /r /x "app.asar.unpacked" "${SRCDIR}\*"

  CreateShortcut "$DESKTOP\${APPNAME}.lnk" \
                 "$INSTDIR\${EXENAME}" "" "$INSTDIR\${EXENAME}" 0

  CreateDirectory "$SMPROGRAMS\${APPNAME}"
  CreateShortcut  "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk" \
                  "$INSTDIR\${EXENAME}" "" "$INSTDIR\${EXENAME}" 0
  CreateShortcut  "$SMPROGRAMS\${APPNAME}\Uninstall ${APPNAME}.lnk" \
                  "$INSTDIR\Uninstall.exe"

  WriteUninstaller "$INSTDIR\Uninstall.exe"

  WriteRegStr   HKCU "${UNINSTKEY}" "DisplayName"     "${APPNAME}"
  WriteRegStr   HKCU "${UNINSTKEY}" "DisplayVersion"  "${APPVER}"
  WriteRegStr   HKCU "${UNINSTKEY}" "Publisher"       "${PUBLISHER}"
  WriteRegStr   HKCU "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr   HKCU "${UNINSTKEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr   HKCU "${UNINSTKEY}" "DisplayIcon"     "$INSTDIR\${EXENAME}"
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoModify"        1
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoRepair"        1
SectionEnd

;── Uninstall ────────────────────────────────────────────────────────────────
Section "Uninstall"
  nsExec::Exec 'taskkill /F /IM "${EXENAME}" /T'
  Pop $0
  Sleep 500

  RMDir /r "$INSTDIR"
  Delete "$DESKTOP\${APPNAME}.lnk"
  RMDir /r "$SMPROGRAMS\${APPNAME}"
  DeleteRegKey HKCU "${UNINSTKEY}"
SectionEnd
