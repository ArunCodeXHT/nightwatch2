import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite } from '@capacitor-community/sqlite';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { SCHEMA, saveDay, saveSettings, loadState } from './dbcore.js';

const DB = 'nightwatch';
const LOCAL_KEY = 'nightwatch.local.state';
const native = Capacitor.isNativePlatform();
let mode = 'local';

const sqliteDriver = {
  run: set => CapacitorSQLite.executeSet({ database: DB, set, transaction: true, readonly: false }),
  query: async (statement, values = []) => {
    const r = await CapacitorSQLite.query({ database: DB, statement, values, readonly: false });
    return r.values || [];
  }
};

async function init() {
  if (!native) return;
  try {
    try { await CapacitorSQLite.createConnection({ database: DB, version: 1, encrypted: false, mode: 'no-encryption', readonly: false }); } catch (e) { /* already exists */ }
    await CapacitorSQLite.open({ database: DB, readonly: false });
    await CapacitorSQLite.execute({ database: DB, statements: SCHEMA.join(';\n') + ';', transaction: true, readonly: false });
    mode = 'sqlite';
  } catch (e) {
    console.error('SQLite unavailable, using local storage', e);
    mode = 'local';
  }
}

async function load() {
  if (mode === 'sqlite') return loadState(sqliteDriver);
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY)); } catch (e) { return null; }
}

let chain = Promise.resolve();
function save(S, dates) {
  const snap = JSON.stringify(S), days = (dates || []).filter(d => d !== '@st').map(d => [d, JSON.stringify(S.days[d] || null)]), st = (dates || []).includes('@st') ? JSON.stringify(S.st) : null;
  chain = chain.then(async () => {
    if (mode !== 'sqlite') { localStorage.setItem(LOCAL_KEY, snap); return; }
    for (const [d, j] of days) await saveDay(sqliteDriver, d, JSON.parse(j));
    if (st) await saveSettings(sqliteDriver, JSON.parse(st));
  }).catch(e => { api.lastError = e; console.error('save failed', e); });
  return chain;
}

async function savePdf(b64, filename) {
  let savedTo = null;
  try {
    await Filesystem.writeFile({ path: 'NightWatch/' + filename, data: b64, directory: Directory.Documents, recursive: true });
    savedTo = 'Documents/NightWatch/' + filename;
  } catch (e) { /* not allowed on some Android versions; the share sheet below still works */ }
  const f = await Filesystem.writeFile({ path: filename, data: b64, directory: Directory.Cache });
  try { await Share.share({ title: 'Night Watch report', dialogTitle: 'Open or save report', url: f.uri }); } catch (e) { /* user closed the sheet */ }
  return { savedTo };
}

const api = { native, get mode() { return mode; }, init, load, save, savePdf, lastError: null };
window.DBB = api;
