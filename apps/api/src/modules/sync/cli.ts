import { backupQueue, checkQueue, restoreQueue } from './maintenance.js'
const [command, source, destination, ...extra] = process.argv.slice(2)
try {
  if (extra.length || !source) throw new Error()
  if (command === 'check' && !destination) process.stdout.write(JSON.stringify(checkQueue(source)) + '\n')
  else if ((command === 'backup' || command === 'restore') && destination) {
    await (command === 'backup' ? backupQueue : restoreQueue)(source, destination)
    process.stdout.write('Offline database copied and verified.\n')
  } else throw new Error()
} catch {
  process.stderr.write('Offline maintenance failed; originals preserved. Usage: cli.js check ABS_SOURCE | backup ABS_SOURCE ABS_NEW_FILE | restore ABS_BACKUP ABS_NEW_FILE\n')
  process.exitCode = 1
}
