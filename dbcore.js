// SQLite mapping for Night Watch. Each day is saved on its own, so saves stay fast however long you track.
export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS days(date TEXT PRIMARY KEY, wake TEXT, read_min REAL, study_min REAL, z_start TEXT, z_end TEXT, split TEXT, note TEXT)`,
  `CREATE TABLE IF NOT EXISTS exercises(date TEXT NOT NULL, pos INTEGER NOT NULL, name TEXT NOT NULL, PRIMARY KEY(date,pos))`,
  `CREATE TABLE IF NOT EXISTS sets(date TEXT NOT NULL, ex_pos INTEGER NOT NULL, pos INTEGER NOT NULL, reps REAL, weight REAL, PRIMARY KEY(date,ex_pos,pos))`
];
const n = v => { v = parseFloat(v); return Number.isFinite(v) ? v : null };
const isEmpty = x => !x || (!x.wake && !x.read && !x.study && !x.zs && !x.ze && !x.split && !x.note && !(x.ex || []).some(e => e.n || (e.s || []).some(s => n(s.r) !== null || n(s.w) !== null)));

export async function saveDay(driver, d, x) {
  const set = ['days', 'exercises', 'sets'].map(t => ({ statement: `DELETE FROM ${t} WHERE date=?`, values: [d] }));
  if (!isEmpty(x)) {
    set.push({ statement: `INSERT INTO days(date,wake,read_min,study_min,z_start,z_end,split,note) VALUES(?,?,?,?,?,?,?,?)`, values: [d, x.wake || '', +x.read || 0, +x.study || 0, x.zs || '', x.ze || '', x.split || '', x.note || ''] });
    (x.ex || []).forEach((e, i) => {
      set.push({ statement: `INSERT INTO exercises(date,pos,name) VALUES(?,?,?)`, values: [d, i, e.n || ''] });
      (e.s || []).forEach((s, j) => set.push({ statement: `INSERT INTO sets(date,ex_pos,pos,reps,weight) VALUES(?,?,?,?,?)`, values: [d, i, j, n(s.r), n(s.w)] }));
    });
  }
  await driver.run(set);
}
export async function saveSettings(driver, st) {
  const set = [{ statement: `DELETE FROM settings WHERE 1=?`, values: [1] }];
  Object.keys(st).forEach(k => set.push({ statement: `INSERT INTO settings(key,value) VALUES(?,?)`, values: [k, JSON.stringify(st[k])] }));
  await driver.run(set);
}
export async function loadState(driver) {
  const st = {}, days = {};
  (await driver.query(`SELECT key,value FROM settings`, [])).forEach(r => { try { st[r.key] = JSON.parse(r.value) } catch (e) { st[r.key] = r.value } });
  (await driver.query(`SELECT * FROM days`, [])).forEach(r => {
    const x = {};
    if (r.wake) x.wake = r.wake; if (r.read_min) x.read = r.read_min; if (r.study_min) x.study = r.study_min;
    if (r.z_start) x.zs = r.z_start; if (r.z_end) x.ze = r.z_end; if (r.split) x.split = r.split; if (r.note) x.note = r.note;
    days[r.date] = x;
  });
  (await driver.query(`SELECT date,pos,name FROM exercises ORDER BY date,pos`, [])).forEach(r => { (days[r.date] = days[r.date] || {}); (days[r.date].ex = days[r.date].ex || [])[r.pos] = { n: r.name, s: [] } });
  (await driver.query(`SELECT date,ex_pos,pos,reps,weight FROM sets ORDER BY date,ex_pos,pos`, [])).forEach(r => {
    const e = days[r.date] && days[r.date].ex && days[r.date].ex[r.ex_pos];
    if (e) e.s[r.pos] = { r: r.reps === null ? '' : r.reps, w: r.weight === null ? '' : r.weight };
  });
  if (!Object.keys(st).length && !Object.keys(days).length) return null;
  return { v: 1, st, days };
}
