; ── Modulon custom installer script ─────────────────────────────────────────
; customInit runs before electron-builder's "app is running" check,
; so silently killing the process here lets the check pass cleanly.

!macro customInit
  !ifndef UNINSTALLER_OUT_FILE
    ; Silently close any lingering Modulon process (ignore errors if not running)
    nsExec::Exec 'taskkill /F /IM "Modulon.exe" /T'
    Pop $0

    ; Splash screen
    InitPluginsDir
    File /oname=$PLUGINSDIR\splash.bmp "${__FILEDIR__}\installer-splash.bmp"
    advsplash::show 1800 300 300 -1 $PLUGINSDIR\splash
    Pop $0
    Delete "$PLUGINSDIR\splash.bmp"
  !endif
!macroend
