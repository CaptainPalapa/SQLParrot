; Custom NSIS uninstall script for SQL Parrot
; This script deletes the application data folder from LocalAppData if the checkbox is checked
; Note: This file needs to be included in the NSIS installer script
; IMPORTANT: We CAN delete directories created by the application (not the installer)
; using RMDir /r - the installer doesn't need to have created them

!macro customUninstall
  ; Delete SQL Parrot application data directories if checkbox is checked
  ; IMPORTANT: We CAN delete directories created by the application using RMDir /r

  DetailPrint "*** SQL Parrot Custom Uninstall Macro Called ***"

  ; Set shell variable context to current user
  SetShellVarContext current

  ; Get LocalAppData path
  ReadEnvStr $0 LOCALAPPDATA
  ReadEnvStr $1 APPDATA

  DetailPrint "LocalAppData: $0"
  DetailPrint "AppData: $1"
  DetailPrint "DeleteAppDataCheckboxState: [$DeleteAppDataCheckboxState]"

  ; Check if checkbox is checked
  ; BM_GETCHECK returns 1 (BST_CHECKED) when checked
  IntCmp $DeleteAppDataCheckboxState 1 0 skip_delete skip_delete

  DetailPrint "*** CHECKBOX IS CHECKED - Proceeding with deletion ***"

  ; Delete all files first, then the directory
  ; LocalAppData\SQL Parrot
  IfFileExists "$0\SQL Parrot\sqlparrot.db" 0 +3
    DetailPrint "Deleting file: $0\SQL Parrot\sqlparrot.db"
    Delete "$0\SQL Parrot\sqlparrot.db"

  ; Delete any other files in the directory
  Delete "$0\SQL Parrot\*.*"

  ; Now remove the directory
  IfFileExists "$0\SQL Parrot" 0 +3
    DetailPrint "Removing directory: $0\SQL Parrot"
    RMDir /r "$0\SQL Parrot"

  ; Verify deletion
  IfFileExists "$0\SQL Parrot" 0 +2
    DetailPrint "WARNING: Directory still exists: $0\SQL Parrot"

  ; AppData (Roaming)\SQL Parrot
  Delete "$1\SQL Parrot\*.*"
  IfFileExists "$1\SQL Parrot" 0 +3
    DetailPrint "Removing directory: $1\SQL Parrot"
    RMDir /r "$1\SQL Parrot"

  IfFileExists "$1\SQL Parrot" 0 +2
    DetailPrint "WARNING: Directory still exists: $1\SQL Parrot"

  DetailPrint "*** Deletion completed ***"
  Goto end

  skip_delete:
    DetailPrint "*** CHECKBOX NOT CHECKED - Skipping deletion ***"

  end:
    DetailPrint "*** SQL Parrot Custom Uninstall Macro Finished ***"
!macroend

