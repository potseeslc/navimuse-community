import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export async function launchCdpBrowser(chrome) {
  const profileDir = await mkdtemp(path.join(os.tmpdir(), 'navimuse-cdp-'));
  const chromeProcess = spawn(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    'about:blank'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  const hasExited = () => chromeProcess.exitCode !== null || chromeProcess.signalCode !== null;
  const waitForExit = () => hasExited()
    ? Promise.resolve(true)
    : new Promise((resolve) => {
        const finish = (exited) => {
          clearTimeout(timeout);
          chromeProcess.off('exit', onExit);
          resolve(exited);
        };
        const onExit = () => finish(true);
        const timeout = setTimeout(() => finish(false), 3_000);
        chromeProcess.once('exit', onExit);
      });
  const cleanup = async () => {
    if (!hasExited()) chromeProcess.kill();
    if (!await waitForExit()) {
      chromeProcess.kill('SIGKILL');
      await waitForExit();
    }
    await rm(profileDir, { recursive: true, force: true });
  };
  try {
    const websocketUrl = await new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      const finish = (callback, value) => {
        clearTimeout(timeout);
        chromeProcess.stdout.off('data', onStdout);
        chromeProcess.stderr.off('data', onStderr);
        chromeProcess.off('exit', onExit);
        callback(value);
      };
      const inspectOutput = () => {
        const output = `${stdout}\n${stderr}`;
        const match = output.match(/ws:\/\/[^\s]+/);
        if (!match) return;
        finish(resolve, match[0]);
      };
      const onStdout = (chunk) => {
        stdout += chunk;
        inspectOutput();
      };
      const onStderr = (chunk) => {
        stderr += chunk;
        inspectOutput();
      };
      const onExit = (code, signal) => finish(reject, new Error(`Chrome exited before CDP connected (${code ?? signal}):\nstdout: ${stdout}\nstderr: ${stderr}`));
      const timeout = setTimeout(() => finish(reject, new Error(`Chrome start timeout:\nstdout: ${stdout}\nstderr: ${stderr}`)), 20_000);
      chromeProcess.stdout.on('data', onStdout);
      chromeProcess.stderr.on('data', onStderr);
      chromeProcess.once('exit', onExit);
    });
    const websocket = new WebSocket(websocketUrl);
    await new Promise((resolve, reject) => {
      const finish = (callback, value) => {
        clearTimeout(timeout);
        websocket.onopen = null;
        websocket.onerror = null;
        callback(value);
      };
      const timeout = setTimeout(() => finish(reject, new Error('Chrome CDP WebSocket open timeout')), 20_000);
      websocket.onopen = () => finish(resolve);
      websocket.onerror = (error) => finish(reject, error);
    });
    let requestId = 0;
    const pending = new Map();
    websocket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      clearTimeout(request.timeout);
      message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result);
    };
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const id = ++requestId;
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, 20_000);
      pending.set(id, { resolve, reject, timeout });
      websocket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const command = (method, params = {}) => send(method, params, sessionId);
    await command('Page.enable');
    await command('Runtime.enable');

    return {
      async viewport(width, height, dpr = 1, mobile = true) {
        await command('Emulation.setDeviceMetricsOverride', {
          width,
          height,
          deviceScaleFactor: dpr,
          mobile,
          screenWidth: width,
          screenHeight: height
        });
        if (mobile) {
          await command('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
        }
      },
      async goto(url) {
        await command('Page.navigate', { url });
        for (let attempt = 0; attempt < 100; attempt += 1) {
          const result = await command('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true });
          if (result.result.value === 'complete') return;
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        throw new Error(`Timed out loading ${url}`);
      },
      async evaluate(expression) {
        const result = await command('Runtime.evaluate', { expression, returnByValue: true });
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
        return result.result.value;
      },
      async close() {
        websocket.close();
        await cleanup();
      }
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
