const { exec } = require('child_process');
const path = require('path');

const IGNORED = new Set(['/', '/System/Volumes/Data', '/System/Volumes/Preboot', '/System/Volumes/VM', '/System/Volumes/Update', '/System/Volumes/Data/home']);

exec('mount', (err, mountOutput) => {
  const candidates = [];
  for (const line of mountOutput.split('\n')) {
    const match = line.match(/^\/dev\/(disk\d+s?\d*)\s+on\s+(.+?)\s+\(/);
    if (!match) continue;
    const diskId = match[1];
    const mountpoint = match[2];
    if (IGNORED.has(mountpoint)) continue;
    const wholeDisk = diskId.replace(/s\d+$/, '');
    candidates.push({ diskId, wholeDisk, mountpoint });
  }

  console.log('Candidates:', JSON.stringify(candidates, null, 2));

  const uniqueWholeDisks = [...new Set(candidates.map(c => c.wholeDisk))];
  let completed = 0;
  const removableDisks = new Set();

  for (const disk of uniqueWholeDisks) {
    exec('diskutil info /dev/' + disk, (err2, info) => {
      const isRemovable = /Removable Media:\s*(Removable|Yes)/i.test(info || '');
      const isEjectable = /Ejectable:\s*Yes/i.test(info || '');
      const isSDCard = /Protocol:\s*Secure Digital/i.test(info || '');
      console.log(disk + ':', { isRemovable, isEjectable, isSDCard });
      if (isRemovable || isEjectable || isSDCard) removableDisks.add(disk);

      completed++;
      if (completed === uniqueWholeDisks.length) {
        const volumes = candidates.filter(c => removableDisks.has(c.wholeDisk));
        console.log('\nDetected removable volumes:', JSON.stringify(volumes, null, 2));
      }
    });
  }
});
