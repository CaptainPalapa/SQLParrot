// Post-build script to patch the generated NSIS installer script
// This adds custom install logic to copy the bundled database

const fs = require('fs');
const path = require('path');

function patchNsisInstaller() {
  // Find the generated NSIS script
  const nsisDir = path.join(__dirname, '..', 'target', 'release', 'nsis', 'x64');
  const installerScript = path.join(nsisDir, 'installer.nsi');

  if (!fs.existsSync(installerScript)) {
    console.log('NSIS installer script not found, skipping patch');
    return;
  }

  let content = fs.readFileSync(installerScript, 'utf8');

  // Check if already patched
  if (content.includes('customInstall')) {
    console.log('NSIS installer already patched');
    return;
  }

  // Get the absolute path to the bundled database
  const bundledDbPath = path.join(__dirname, '..', 'resources', 'sqlparrot.db');
  if (!fs.existsSync(bundledDbPath)) {
    console.error(`Bundled database not found at: ${bundledDbPath}`);
    return;
  }

  // Convert to Windows path format for NSIS
  const bundledDbPathNsis = bundledDbPath.replace(/\//g, '\\');

  // Read the custom install script
  let customInstallScript = fs.readFileSync(
    path.join(__dirname, '..', 'nsis', 'install.nsh'),
    'utf8'
  );

  // Replace the placeholder with the actual path
  customInstallScript = customInstallScript.replace(
    /\$\{BUNDLED_DB_PATH\}/g,
    bundledDbPathNsis
  );

  // Find the Section "Install" and add our custom macro call before it ends
  const installSectionStart = content.indexOf('Section "Install"');
  if (installSectionStart === -1) {
    console.error('Could not find Install section in NSIS script');
    return;
  }

  // Find SetOutPath $INSTDIR (where app files are installed)
  const setOutPathIndex = content.indexOf('SetOutPath $INSTDIR', installSectionStart);
  if (setOutPathIndex === -1) {
    console.error('Could not find SetOutPath in Install section');
    return;
  }

  // Find where resources are copied (look for "Copy resources" comment)
  const resourcesCommentIndex = content.indexOf('; Copy resources', setOutPathIndex);
  const resourcesEndIndex = resourcesCommentIndex !== -1
    ? content.indexOf('\n', resourcesCommentIndex + 20)
    : setOutPathIndex + 100;

  // Find the SectionEnd after resources
  const sectionEndIndex = content.indexOf('SectionEnd', resourcesEndIndex);
  if (sectionEndIndex === -1) {
    console.error('Could not find SectionEnd after resources');
    return;
  }

  // Insert the custom install macro definition before SectionEnd
  const beforeSectionEnd = content.substring(0, sectionEndIndex);
  const afterSectionEnd = content.substring(sectionEndIndex);

  // Add the custom install macro definition and call
  const patch = `

${customInstallScript}

  ; Call custom install macro to copy database
  !insertmacro customInstall

`;

  content = beforeSectionEnd + patch + afterSectionEnd;

  // Write the patched script
  fs.writeFileSync(installerScript, content, 'utf8');
  console.log('✅ Patched NSIS installer script with custom install logic');
}

patchNsisInstaller();
