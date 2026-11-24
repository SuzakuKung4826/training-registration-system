import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const chrome=process.env.BROWSER_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe';
export default defineConfig({
  testDir:'./tests/browser',fullyParallel:false,workers:1,timeout:30000,
  use:{baseURL:'http://127.0.0.1:3010',headless:true,launchOptions:existsSync(chrome)?{executablePath:chrome}:{},screenshot:'only-on-failure',trace:'retain-on-failure'},
  webServer:{command:'node tests/browser-server.js',url:'http://127.0.0.1:3010/api/health',reuseExistingServer:false,timeout:30000},
});
