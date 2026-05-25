// scripts/show-network-info.js
// Shows your LAN IP for sharing PWA URL

import os from 'os';

const interfaces = os.networkInterfaces();
const addresses = [];

for (const name of Object.keys(interfaces)) {
  for (const iface of interfaces[name]) {
    if (iface.family === 'IPv4' && !iface.internal) {
      addresses.push({ name, address: iface.address });
    }
  }
}

console.log('\n🌐 A One POS — Network Access Info\n');
console.log('Local Access:');
console.log('  https://localhost:3000\n');
console.log('LAN Access (share with shop devices):');
addresses.forEach(({ name, address }) => {
  console.log(`  https://${address}:3000  (via ${name})`);
});
console.log('\n📱 To install PWA on shop device:');
console.log('  1. Visit URL above on Chromebook/tablet');
console.log('  2. Accept SSL warning');
console.log('  3. Click install icon in address bar\n');
