import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function runCli(args, env) {
  return spawnSync(process.execPath, ['bin/darksol.js', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env,
  });
}

let tempRoot;
let env;

before(() => {
  tempRoot = mkdtempSync(join(tmpdir(), 'darksol-cli-'));
  const home = join(tempRoot, 'home');
  const appData = join(tempRoot, 'appdata');
  const localAppData = join(tempRoot, 'localappdata');
  mkdirSync(home, { recursive: true });
  mkdirSync(appData, { recursive: true });
  mkdirSync(localAppData, { recursive: true });

  env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    APPDATA: appData,
    LOCALAPPDATA: localAppData,
    FORCE_COLOR: '0',
  };
});

after(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

test('CLI help output renders', (t) => {
  const res = runCli(['--help'], env);
  if (res.error && res.error.code === 'EPERM') {
    t.skip('Child process spawn not permitted in this environment');
    return;
  }
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /Usage:/);
  assert.match(res.stdout, /\bwallet\b/);
  assert.match(res.stdout, /\btrade\b/);
  assert.match(res.stdout, /\bscript\b/);
  assert.match(res.stdout, /\bconfig\b/);
});

test('command registration includes trade and script subcommands', (t) => {
  const tradeHelp = runCli(['trade', '--help'], env);
  if (tradeHelp.error && tradeHelp.error.code === 'EPERM') {
    t.skip('Child process spawn not permitted in this environment');
    return;
  }
  assert.equal(tradeHelp.status, 0, tradeHelp.stderr);
  assert.match(tradeHelp.stdout, /\bswap\b/);
  assert.match(tradeHelp.stdout, /\bsnipe\b/);
  assert.match(tradeHelp.stdout, /\bwatch\b/);

  const scriptHelp = runCli(['script', '--help'], env);
  assert.equal(scriptHelp.status, 0, scriptHelp.stderr);
  assert.match(scriptHelp.stdout, /\bcreate\b/);
  assert.match(scriptHelp.stdout, /\brun\b/);
  assert.match(scriptHelp.stdout, /\btemplates\b/);

  const agentHelp = runCli(['agent', '--help'], env);
  assert.equal(agentHelp.status, 0, agentHelp.stderr);
  assert.match(agentHelp.stdout, /\btask\b/);
  assert.match(agentHelp.stdout, /\bplan\b/);
  assert.match(agentHelp.stdout, /\bstatus\b/);
  assert.match(agentHelp.stdout, /\bharness\b/);

  const updateHelp = runCli(['update', '--help'], env);
  assert.equal(updateHelp.status, 0, updateHelp.stderr);
  assert.match(updateHelp.stdout, /\bstatus\b/);
  assert.match(updateHelp.stdout, /\binstall\b/);
  assert.match(updateHelp.stdout, /\breinstall\b/);

  const harnessHelp = runCli(['agent', 'harness', '--help'], env);
  assert.equal(harnessHelp.status, 0, harnessHelp.stderr);
  assert.match(harnessHelp.stdout, /\bmanifest\b/);
  assert.match(harnessHelp.stdout, /\btools\b/);
  assert.match(harnessHelp.stdout, /\brun\b/);
  assert.match(harnessHelp.stdout, /\bstatus\b/);
  assert.match(harnessHelp.stdout, /\bsessions\b/);
  assert.match(harnessHelp.stdout, /\brpc\b/);
  assert.match(harnessHelp.stdout, /call-tool/);
  assert.match(harnessHelp.stdout, /\bevents\b/);
  assert.match(harnessHelp.stdout, /\bexport\b/);

  const autoHelp = runCli(['auto', '--help'], env);
  assert.equal(autoHelp.status, 0, autoHelp.stderr);
  assert.match(autoHelp.stdout, /\bstart\b/);
  assert.match(autoHelp.stdout, /\bstatus\b/);
  assert.match(autoHelp.stdout, /\blist\b/);

  const agentCommsHelp = runCli(['agentcomms', '--help'], env);
  assert.equal(agentCommsHelp.status, 0, agentCommsHelp.stderr);
  assert.match(agentCommsHelp.stdout, /\bhealth\b/);
  assert.match(agentCommsHelp.stdout, /\bcountries\b/);
  assert.match(agentCommsHelp.stdout, /\bbuy\b/);
  assert.match(agentCommsHelp.stdout, /\bmessages\b/);
  assert.match(agentCommsHelp.stdout, /\bpremium-search\b/);

  const smsHelp = runCli(['sms', '--help'], env);
  assert.equal(smsHelp.status, 0, smsHelp.stderr);
  assert.match(smsHelp.stdout, /\bmessages\b/);
});
