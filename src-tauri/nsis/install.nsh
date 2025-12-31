; Custom NSIS install script for SQL Parrot
; This script handles copying the bundled database file

!macro customInstall
  ; Get LocalAppData path
  ReadEnvStr $0 LOCALAPPDATA

  ; Create SQL Parrot directory if it doesn't exist
  CreateDirectory "$0\SQL Parrot"

  ; Check if database already exists
  IfFileExists "$0\SQL Parrot\sqlparrot.db" 0 +10
    ; Database exists - ask user if they want to overwrite
    MessageBox MB_YESNO|MB_ICONQUESTION "A SQL Parrot database already exists.$\n$\nOverwriting will delete all your existing groups, snapshots, history, and settings.$\n$\nDo you want to overwrite the existing database?" IDNO +6
      ; User chose YES - delete old database and copy bundled one
      Delete "$0\SQL Parrot\sqlparrot.db"
      ; Copy from bundled resource (included in installer)
      SetOutPath "$0\SQL Parrot"
      File "/oname=sqlparrot.db" "${BUNDLED_DB_PATH}"
      DetailPrint "Overwrote existing database with fresh install"
      Goto +4
    ; User chose NO - keep existing database
    DetailPrint "Kept existing database (user chose not to overwrite)"
    Goto +2

  ; Database doesn't exist - copy bundled database from installer
  SetOutPath "$0\SQL Parrot"
  File "/oname=sqlparrot.db" "${BUNDLED_DB_PATH}"
  DetailPrint "Installed bundled database"
!macroend

