// `npm run serve`: starts the page server and prints the address of the page, for looking at it by hand.
//
//   npm run serve                      the example list, every program marked reachable
//   npm run serve -- --list <file>     the programs of a list kept outside the repository (a Programmliste), all marked reachable
//
// Ctrl-C stops the nginx container and removes it and its test tree (see lib/page-server.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { startPageServer } from './lib/page-server.mjs';

const USAGE = 'Usage: npm run serve -- [--list <file>]\n  --list <file>  show the programs of that list (a Programmliste kept outside the repository), all marked reachable';

function refuse(message) {
  console.error(`${message}\n${USAGE}`);
  process.exitCode = 2;
}

function parseArguments(argv) {
  const options = { list: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--list') {
      if (index + 1 >= argv.length || argv[index + 1].startsWith('-')) return { error: '--list needs the name of a list file' };
      options.list = argv[index + 1];
      index += 1;
    } else {
      return { error: `Unknown option ${argv[index]}` };
    }
  }
  return { options };
}

// The list as an object; the error says what is wrong with the file, never what is in it.
function readList(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    return { error: `Cannot read the list file ${file}: ${error.code === 'ENOENT' ? 'it does not exist' : error.message}` };
  }
  let list;
  try {
    list = JSON.parse(text);
  } catch {
    return { error: `The list file ${file} is not valid JSON` };
  }
  if (!list || !Array.isArray(list.zones) || !Array.isArray(list.programs)) return { error: `The list file ${file} needs a "zones" list and a "programs" list` };
  return { list };
}

async function main() {
  const { options, error } = parseArguments(process.argv.slice(2));
  if (error) return refuse(error);
  let list;
  if (options.list !== null) {
    const result = readList(options.list);
    if (result.error) return refuse(result.error);
    list = result.list;
  }
  const server = await startPageServer({ list });
  console.log(server.url);
  console.log(`Container ${server.name} is running. Press Ctrl-C to stop it and remove it.`);
  if (list) console.log(`Showing the ${list.programs.length} programs of ${path.basename(options.list)}, all marked reachable.`);
  setInterval(() => {}, 1e9); // keeps the process alive until it is interrupted
}

main().catch((error) => {
  console.error(`The page server could not start: ${error.message}`);
  process.exitCode = 1;
});
