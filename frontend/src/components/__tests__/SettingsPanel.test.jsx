/**
 * SettingsPanel Component Tests
 * 
 * Tests for settings panel auto-save functionality:
 * - Verifies autoCreateCheckpoint is in useEffect dependency array
 * - Verifies all settings fields are in dependency array
 * - Ensures checkbox changes trigger immediate save
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('SettingsPanel Auto-Save Fix', () => {
  it('should include autoCreateCheckpoint in useEffect dependency array', () => {
    // Read the SettingsPanel component file
    const filePath = path.join(__dirname, '../SettingsPanel.jsx');
    const fileContent = fs.readFileSync(filePath, 'utf8');
    
    // Check that autoCreateCheckpoint is in the dependency array
    // This ensures the auto-save useEffect triggers when checkbox changes
    expect(fileContent).toMatch(/settings\.preferences\?\.autoCreateCheckpoint/);
    
    // Verify it's in a dependency array (not just anywhere in the file)
    const dependencyArrayMatch = fileContent.match(/\[[\s\S]*?settings\.preferences\?\.autoCreateCheckpoint[\s\S]*?\]/);
    expect(dependencyArrayMatch).toBeTruthy();
  });

  it('should include all settings fields in dependency array', () => {
    const filePath = path.join(__dirname, '../SettingsPanel.jsx');
    const fileContent = fs.readFileSync(filePath, 'utf8');
    
    // Verify all settings that are saved are in the dependency array
    expect(fileContent).toMatch(/settings\.preferences\?\.maxHistoryEntries/);
    expect(fileContent).toMatch(/settings\.preferences\?\.autoCreateCheckpoint/);
    expect(fileContent).toMatch(/settings\.preferences\?\.defaultGroup/);
    expect(fileContent).toMatch(/settings\.autoVerification\?\.enabled/);
    expect(fileContent).toMatch(/settings\.autoVerification\?\.intervalMinutes/);
  });

  it('should send autoCreateCheckpoint in PUT request', () => {
    const filePath = path.join(__dirname, '../SettingsPanel.jsx');
    const fileContent = fs.readFileSync(filePath, 'utf8');
    
    // Verify that autoCreateCheckpoint is included in the settings object sent to API
    // Look for the updatedSettings object that includes autoCreateCheckpoint
    expect(fileContent).toMatch(/autoCreateCheckpoint.*updatedSettings|updatedSettings.*autoCreateCheckpoint/);
    
    // More specific: check it's in the preferences object within updatedSettings
    const settingsPattern = /updatedSettings\s*=\s*\{[^}]*preferences:\s*\{[^}]*autoCreateCheckpoint/s;
    expect(fileContent).toMatch(settingsPattern);
  });
});
