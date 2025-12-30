; Custom NSIS uninstall script for SQL Parrot
; This script deletes the application data folder from LocalAppData
; Note: This file needs to be included in the NSIS installer script

!macro customUninstall
  ; Delete the SQLite database and application data folder
  ; Path: %LOCALAPPDATA%\SQL Parrot

  ; Get LocalAppData path
  ReadEnvStr $0 LOCALAPPDATA

  ; Check if the folder exists before trying to delete
  IfFileExists "$0\SQL Parrot\*.*" 0 +3
    RMDir /r "$0\SQL Parrot"
    DetailPrint "Deleted application data folder: $0\SQL Parrot"

  ; Also check for config folder in AppData (Roaming) if it exists
  ReadEnvStr $1 APPDATA
  IfFileExists "$1\SQL Parrot\*.*" 0 +3
    RMDir /r "$1\SQL Parrot"
    DetailPrint "Deleted application config folder: $1\SQL Parrot"
!macroend

