; SQL Parrot NSIS Hooks
; This file is included by Tauri's NSIS installer via the installerHooks config
;
; Hook names recognized by Tauri:
;   NSIS_HOOK_PREINSTALL  - Before copying files, registry keys, shortcuts
;   NSIS_HOOK_POSTINSTALL - After installation completes
;   NSIS_HOOK_PREUNINSTALL - Before removing files, registry keys, shortcuts
;   NSIS_HOOK_POSTUNINSTALL - After uninstallation completes
;
; Key variables available during uninstall:
;   $DeleteAppDataCheckboxState - 1 if "Delete application data" checkbox is checked
;   $UpdateMode - 1 if this is an update (not a full uninstall)

; ============================================================================
; POSTINSTALL HOOK - Copy bundled database to user's LocalAppData
; ============================================================================
!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "SQL Parrot: Running post-install hook..."

  ; Set shell variable context to current user
  SetShellVarContext current

  ; Get LocalAppData path
  ReadEnvStr $0 LOCALAPPDATA

  ; Create SQL Parrot directory if it doesn't exist
  CreateDirectory "$0\SQL Parrot"

  ; Check if database already exists
  IfFileExists "$0\SQL Parrot\sqlparrot.db" db_exists db_not_exists

  db_exists:
    ; Database exists - ask user if they want to overwrite
    MessageBox MB_YESNO|MB_ICONQUESTION "A SQL Parrot database already exists.$\n$\nOverwriting will delete all your existing groups, snapshots, history, and settings.$\n$\nDo you want to overwrite the existing database?" IDNO keep_existing
      ; User chose YES - delete old database and copy bundled one
      Delete "$0\SQL Parrot\sqlparrot.db"
      Delete "$0\SQL Parrot\sqlparrot.db-shm"
      Delete "$0\SQL Parrot\sqlparrot.db-wal"
      CopyFiles /SILENT "$INSTDIR\resources\sqlparrot.db" "$0\SQL Parrot\sqlparrot.db"
      DetailPrint "SQL Parrot: Overwrote existing database with fresh install"
      Goto db_done
    keep_existing:
      DetailPrint "SQL Parrot: Kept existing database (user chose not to overwrite)"
      Goto db_done

  db_not_exists:
    ; Database doesn't exist - copy bundled database
    CopyFiles /SILENT "$INSTDIR\resources\sqlparrot.db" "$0\SQL Parrot\sqlparrot.db"
    DetailPrint "SQL Parrot: Installed bundled database to $0\SQL Parrot\"

  db_done:
    DetailPrint "SQL Parrot: Post-install hook completed"
!macroend

; ============================================================================
; PREUNINSTALL HOOK - Delete application data directories
; ============================================================================
!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "SQL Parrot: Running pre-uninstall hook..."
  DetailPrint "SQL Parrot: DeleteAppDataCheckboxState = $DeleteAppDataCheckboxState"
  DetailPrint "SQL Parrot: UpdateMode = $UpdateMode"

  ; Only delete if checkbox is checked AND not in update mode
  ${If} $DeleteAppDataCheckboxState = 1
  ${AndIf} $UpdateMode <> 1
    DetailPrint "SQL Parrot: Checkbox is checked - will delete application data"

    ; Set shell variable context to current user
    SetShellVarContext current

    ; Change working directory to temp so we can delete the target directories
    SetOutPath "$TEMP"

    ; Get LocalAppData and AppData paths
    ReadEnvStr $0 LOCALAPPDATA
    ReadEnvStr $1 APPDATA

    DetailPrint "SQL Parrot: LocalAppData = $0"
    DetailPrint "SQL Parrot: AppData = $1"

    ; === Delete LocalAppData\SQL Parrot ===
    IfFileExists "$0\SQL Parrot\*.*" 0 skip_localappdata
      DetailPrint "SQL Parrot: Deleting $0\SQL Parrot..."

      ; Delete known files first
      Delete "$0\SQL Parrot\sqlparrot.db"
      Delete "$0\SQL Parrot\sqlparrot.db-shm"
      Delete "$0\SQL Parrot\sqlparrot.db-wal"

      ; Delete any remaining files
      Delete "$0\SQL Parrot\*.*"

      ; Remove the directory
      RMDir /r "$0\SQL Parrot"

      ; Check if deletion succeeded
      IfFileExists "$0\SQL Parrot" 0 localappdata_deleted
        DetailPrint "SQL Parrot: WARNING - Directory still exists: $0\SQL Parrot"
        ; Try with REBOOTOK flag
        RMDir /r /REBOOTOK "$0\SQL Parrot"
        Goto skip_localappdata
      localappdata_deleted:
        DetailPrint "SQL Parrot: Successfully deleted $0\SQL Parrot"
    skip_localappdata:

    ; === Delete AppData (Roaming)\SQL Parrot ===
    IfFileExists "$1\SQL Parrot\*.*" 0 skip_appdata
      DetailPrint "SQL Parrot: Deleting $1\SQL Parrot..."

      ; Delete known files first
      Delete "$1\SQL Parrot\config.json"

      ; Delete any remaining files
      Delete "$1\SQL Parrot\*.*"

      ; Remove the directory
      RMDir /r "$1\SQL Parrot"

      ; Check if deletion succeeded
      IfFileExists "$1\SQL Parrot" 0 appdata_deleted
        DetailPrint "SQL Parrot: WARNING - Directory still exists: $1\SQL Parrot"
        ; Try with REBOOTOK flag
        RMDir /r /REBOOTOK "$1\SQL Parrot"
        Goto skip_appdata
      appdata_deleted:
        DetailPrint "SQL Parrot: Successfully deleted $1\SQL Parrot"
    skip_appdata:

    DetailPrint "SQL Parrot: Application data deletion completed"
  ${Else}
    DetailPrint "SQL Parrot: Checkbox not checked or update mode - skipping data deletion"
  ${EndIf}

  DetailPrint "SQL Parrot: Pre-uninstall hook completed"
!macroend

