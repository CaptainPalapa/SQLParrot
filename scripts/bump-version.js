#!/usr/bin/env node

/**
 * Version Bump Script
 * 
 * Updates version numbers across all required files in the project.
 * See docs/VERSION_BUMP_CHECKLIST.md for the complete checklist.
 * 
 * Usage:
 *   node scripts/bump-version.js 1.5.0
 *   npm run bump 1.5.0
 */

const fs = require('fs');
const path = require('path');

// File paths relative to project root
const FILES = {
  packageJson: 'package.json',
  versionJs: 'frontend/src/constants/version.js',
  cargoToml: 'src-tauri/Cargo.toml',
  tauriConf: 'src-tauri/tauri.conf.json',
  changelog: 'CHANGELOG.md'
};

/**
 * Validates version format (semver: X.Y.Z, numbers only, no "v" prefix)
 */
function validateVersion(version) {
  const semverRegex = /^\d+\.\d+\.\d+$/;
  if (!semverRegex.test(version)) {
    console.error(`Error: Invalid version format. Expected X.Y.Z (e.g., 1.5.0), got: ${version}`);
    process.exit(1);
  }
  return true;
}

/**
 * Gets the project root directory (where package.json is located)
 */
function getProjectRoot() {
  let currentDir = __dirname;
  while (currentDir !== path.dirname(currentDir)) {
    const packageJsonPath = path.join(currentDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }
  // Fallback: assume script is in scripts/ directory
  return path.dirname(__dirname);
}

/**
 * Reads a file and returns its content
 */
function readFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * Writes content to a file
 */
function writeFile(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8');
}

/**
 * Updates version in package.json
 */
function updatePackageJson(filePath, oldVersion, newVersion) {
  const content = readFile(filePath);
  const packageJson = JSON.parse(content);
  
  if (packageJson.version !== oldVersion) {
    console.error(`Error: Current version mismatch in package.json. Expected ${oldVersion}, found ${packageJson.version}`);
    process.exit(1);
  }
  
  packageJson.version = newVersion;
  writeFile(filePath, JSON.stringify(packageJson, null, 2) + '\n');
  return { old: oldVersion, new: newVersion };
}

/**
 * Updates version in frontend/src/constants/version.js
 */
function updateVersionJs(filePath, oldVersion, newVersion) {
  const content = readFile(filePath);
  
  // Match: export const APP_VERSION = 'X.Y.Z';
  const versionRegex = /(export\s+const\s+APP_VERSION\s*=\s*['"])(\d+\.\d+\.\d+)(['"];)/;
  const match = content.match(versionRegex);
  
  if (!match) {
    console.error(`Error: Could not find APP_VERSION constant in ${filePath}`);
    process.exit(1);
  }
  
  if (match[2] !== oldVersion) {
    console.error(`Error: Current version mismatch in version.js. Expected ${oldVersion}, found ${match[2]}`);
    process.exit(1);
  }
  
  const newContent = content.replace(versionRegex, `$1${newVersion}$3`);
  writeFile(filePath, newContent);
  return { old: match[2], new: newVersion };
}

/**
 * Updates version in src-tauri/Cargo.toml
 */
function updateCargoToml(filePath, oldVersion, newVersion) {
  const content = readFile(filePath);
  
  // Match: version = "X.Y.Z"
  const versionRegex = /(version\s*=\s*["'])(\d+\.\d+\.\d+)(["'])/;
  const match = content.match(versionRegex);
  
  if (!match) {
    console.error(`Error: Could not find version field in ${filePath}`);
    process.exit(1);
  }
  
  if (match[2] !== oldVersion) {
    console.error(`Error: Current version mismatch in Cargo.toml. Expected ${oldVersion}, found ${match[2]}`);
    process.exit(1);
  }
  
  const newContent = content.replace(versionRegex, `$1${newVersion}$3`);
  writeFile(filePath, newContent);
  return { old: match[2], new: newVersion };
}

/**
 * Updates version in src-tauri/tauri.conf.json
 */
function updateTauriConf(filePath, oldVersion, newVersion) {
  const content = readFile(filePath);
  const tauriConf = JSON.parse(content);
  
  if (tauriConf.version !== oldVersion) {
    console.error(`Error: Current version mismatch in tauri.conf.json. Expected ${oldVersion}, found ${tauriConf.version}`);
    process.exit(1);
  }
  
  tauriConf.version = newVersion;
  writeFile(filePath, JSON.stringify(tauriConf, null, 2) + '\n');
  return { old: oldVersion, new: newVersion };
}

/**
 * Adds a placeholder entry to CHANGELOG.md
 */
function updateChangelog(filePath, newVersion) {
  const content = readFile(filePath);
  
  // Get today's date in YYYY-MM-DD format
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;
  
  // Find the [Unreleased] section and add new version entry after it
  // Pattern: ## [Unreleased]\n\n## [X.Y.Z] - YYYY-MM-DD
  // Match: ## [Unreleased] followed by one or more newlines and then ## [version]
  const unreleasedRegex = /(## \[Unreleased\]\n+)(## \[)/;
  const match = content.match(unreleasedRegex);
  
  if (!match) {
    console.error(`Error: Could not find [Unreleased] section in ${filePath}`);
    console.error(`Expected pattern: ## [Unreleased]\\n\\n## [version]`);
    process.exit(1);
  }
  
  // Insert new version entry between [Unreleased] and next version
  // Replace: ## [Unreleased]\n\n## [existingVersion]
  // With: ## [Unreleased]\n\n## [newVersion] - date\n*Placeholder*\n\n## [existingVersion]
  const newEntry = `## [${newVersion}] - ${dateStr}\n*Placeholder entry - add changes here*\n\n`;
  const newContent = content.replace(unreleasedRegex, `$1${newEntry}$2`);
  writeFile(filePath, newContent);
  
  return { added: true, version: newVersion, date: dateStr };
}

/**
 * Gets current version from package.json
 */
function getCurrentVersion(filePath) {
  const content = readFile(filePath);
  const packageJson = JSON.parse(content);
  return packageJson.version;
}

/**
 * Main function
 */
function main() {
  // Get version from command line argument
  const newVersion = process.argv[2];
  
  if (!newVersion) {
    console.error('Error: Version number required');
    console.error('Usage: node scripts/bump-version.js 1.5.0');
    console.error('   or: npm run bump 1.5.0');
    process.exit(1);
  }
  
  // Validate version format
  validateVersion(newVersion);
  
  // Get project root
  const projectRoot = getProjectRoot();
  
  // Get current version from package.json
  const packageJsonPath = path.join(projectRoot, FILES.packageJson);
  const oldVersion = getCurrentVersion(packageJsonPath);
  
  if (oldVersion === newVersion) {
    console.error(`Error: New version (${newVersion}) is the same as current version (${oldVersion})`);
    process.exit(1);
  }
  
  console.log(`Bumping version from ${oldVersion} to ${newVersion}...\n`);
  
  const results = [];
  
  // Update package.json
  console.log(`Updating ${FILES.packageJson}...`);
  results.push({
    file: FILES.packageJson,
    ...updatePackageJson(packageJsonPath, oldVersion, newVersion)
  });
  
  // Update frontend/src/constants/version.js
  const versionJsPath = path.join(projectRoot, FILES.versionJs);
  console.log(`Updating ${FILES.versionJs}...`);
  results.push({
    file: FILES.versionJs,
    ...updateVersionJs(versionJsPath, oldVersion, newVersion)
  });
  
  // Update src-tauri/Cargo.toml
  const cargoTomlPath = path.join(projectRoot, FILES.cargoToml);
  console.log(`Updating ${FILES.cargoToml}...`);
  results.push({
    file: FILES.cargoToml,
    ...updateCargoToml(cargoTomlPath, oldVersion, newVersion)
  });
  
  // Update src-tauri/tauri.conf.json
  const tauriConfPath = path.join(projectRoot, FILES.tauriConf);
  console.log(`Updating ${FILES.tauriConf}...`);
  results.push({
    file: FILES.tauriConf,
    ...updateTauriConf(tauriConfPath, oldVersion, newVersion)
  });
  
  // Update CHANGELOG.md
  const changelogPath = path.join(projectRoot, FILES.changelog);
  console.log(`Updating ${FILES.changelog}...`);
  const changelogResult = updateChangelog(changelogPath, newVersion);
  
  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('Version Bump Summary');
  console.log('='.repeat(60));
  console.log(`\nOverall: ${oldVersion} ? ${newVersion}\n`);
  
  results.forEach(result => {
    console.log(`${result.file.padEnd(40)} ${result.old} ? ${result.new}`);
  });
  
  console.log(`\n${FILES.changelog.padEnd(40)} Added entry: [${changelogResult.version}] - ${changelogResult.date}`);
  
  console.log('\n' + '='.repeat(60));
  console.log('? Version bump complete!');
  console.log('\nNext steps:');
  console.log('  1. Review the changes: git diff');
  console.log('  2. Update CHANGELOG.md with actual changes');
  console.log('  3. Commit: git commit -m "chore: bump version to ' + newVersion + '"');
  console.log('  4. Tag: git tag -a v' + newVersion + ' -m "v' + newVersion + ': [description]"');
  console.log('='.repeat(60));
}

// Run the script
main();
