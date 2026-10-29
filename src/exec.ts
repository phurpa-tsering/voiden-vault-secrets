/** Run a CLI with input on stdin (so passwords never appear in the process list). */

import { spawn } from 'node:child_process';
import type { ExecLike } from './http';

export const execFile: ExecLike = (file, args, { input = '', timeoutMs = 20_000 }) =>
  new Promise((resolve, reject) => {
    const child = spawn(file, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`timed out after ${timeoutMs / 1000} s`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.stdin.on('error', () => {}); // the CLI may exit before reading stdin
    child.stdin.end(input);
  });
