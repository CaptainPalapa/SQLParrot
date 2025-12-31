// Post-build script for NSIS installer
// Note: Custom hooks are now handled via the installerHooks config in tauri.conf.json
// pointing to nsis/hooks.nsh which contains:
//   - NSIS_HOOK_POSTINSTALL: Copies bundled database to LocalAppData
//   - NSIS_HOOK_PREUNINSTALL: Deletes SQL Parrot folders when checkbox is checked
//
// This script is kept for any future post-build patching needs

const fs = require('fs');
const path = require('path');

function checkBuild() {
  const nsisDir = path.join(__dirname, '..', 'target', 'release', 'nsis', 'x64');
  const installerScript = path.join(nsisDir, 'installer.nsi');

  if (fs.existsSync(installerScript)) {
    const content = fs.readFileSync(installerScript, 'utf8');

    // Verify hooks are being included
    if (content.includes('NSIS_HOOK_POSTINSTALL') && content.includes('NSIS_HOOK_PREUNINSTALL')) {
      console.log('✅ NSIS installer includes custom hooks');
    } else {
      console.log('⚠️  Custom hooks not detected in installer - check installerHooks config');
    }
  } else {
    console.log('ℹ️  NSIS installer not found (this is normal before building)');
  }
}

checkBuild();
