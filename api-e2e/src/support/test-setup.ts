/* eslint-disable */
import axios from 'axios';
import { existsSync } from 'fs';
import { join } from 'path';
import { config as loadEnv } from 'dotenv';

module.exports = async function () {
  const cwd = process.cwd();
  for (const p of [
    join(cwd, 'api', 'src', '.env'),
    join(cwd, 'api', '.env'),
    join(cwd, 'src', '.env'),
    join(cwd, '.env'),
  ]) {
    if (existsSync(p)) loadEnv({ path: p, quiet: true });
  }

  const host = process.env.HOST ?? 'localhost';
  const port = process.env.PORT ?? '3000';
  axios.defaults.baseURL = `http://${host}:${port}`;
};
