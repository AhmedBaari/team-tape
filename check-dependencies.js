/**
 * Dependency Check Script
 * Run this to diagnose voice encryption and codec issues
 * Usage: node check-dependencies.js
 */

import { generateDependencyReport } from '@discordjs/voice';
import crypto from 'node:crypto';

console.log('\n🔍 TeamTape Dependency Check\n');
console.log('='.repeat(50));

// Check native AES-256-GCM support
const hasAesGcm = crypto.getCiphers().includes('aes-256-gcm');
console.log(`\n✅ Native AES-256-GCM Support: ${hasAesGcm ? 'YES' : 'NO'}`);

if (!hasAesGcm) {
  console.log('⚠️  Your system does NOT support aes-256-gcm natively.');
  console.log('   You MUST install an encryption library:');
  console.log('   - sodium-native (recommended)');
  console.log('   - libsodium-wrappers');
  console.log('   - @stablelib/xchacha20poly1305');
  console.log('   - @noble/ciphers');
}

// Generate Discord.js voice dependency report
console.log('\n📊 Discord.js Voice Dependencies:\n');
console.log(generateDependencyReport());

console.log('\n' + '='.repeat(50));

// Check for DAVE protocol support
try {
  const davey = await import('@snazzah/davey');
  console.log('\n✅ DAVE Protocol Support: INSTALLED');
} catch (error) {
  console.log('\n⚠️  DAVE Protocol Support: NOT INSTALLED');
  console.log('   Some Discord clients require DAVE for E2EE.');
  console.log('   Install with: npm install @snazzah/davey');
}

console.log('\n' + '='.repeat(50));
console.log('\n💡 If encryption libraries show "not found":');
console.log('   1. Try: npm install --save-exact sodium-native@4.1.1');
console.log('   2. Or: npm install --save-exact libsodium-wrappers@0.7.13');
console.log('   3. Delete node_modules and package-lock.json, then npm install');
console.log('   4. Make sure you\'re using Node.js >= 18.0.0');
console.log('\n');
