; ── Modulon custom installer script ─────────────────────────────────────────
; customInit runs in both installer and uninstaller .onInit.
; Guard with !ifdef UNINSTALLER_OUT_FILE (only defined during uninstaller compile)
; so the splash only appears when running the installer.

!macro customInit
  !ifndef UNINSTALLER_OUT_FILE
    InitPluginsDir
    File /oname=$PLUGINSDIR\splash.bmp "${__FILEDIR__}\installer-splash.bmp"
    ; advsplash::show <display-ms> <fadein-ms> <fadeout-ms> <bg|-1=none> <path-no-ext>
    advsplash::show 1800 300 300 -1 $PLUGINSDIR\splash
    Pop $0
    Delete "$PLUGINSDIR\splash.bmp"
  !endif
!macroend
