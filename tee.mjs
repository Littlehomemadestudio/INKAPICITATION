#!/usr/bin/env node
// tee.mjs — cross-platform `tee` for npm scripts.
// Reads stdin, echoes it to stdout, and appends it to the log file(s)
// given as arguments. Works in cmd, PowerShell and POSIX shells:
//   next dev -p 3000 | node tee.mjs dev.log
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

const files = process.argv.slice(2).map((f) => createWriteStream(f, { flags: 'a' }));

process.stdout.on('error', (e) => {
  // tolerate EPIPE when the pager/consumer closes early
  if (e.code === 'EPIPE') process.exit(0);
  throw e;
});

await pipeline(
  process.stdin,
  async function* (source) {
    for await (const chunk of source) {
      process.stdout.write(chunk);
      for (const f of files) f.write(chunk);
    }
  }
);

for (const f of files) f.end();
