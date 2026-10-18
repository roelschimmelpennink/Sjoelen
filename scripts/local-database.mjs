import {readFile,readdir} from 'node:fs/promises';

export async function migrateLocalDatabase(db) {
  const directory=new URL('../drizzle/',import.meta.url);
  const files=(await readdir(directory)).filter(name=>name.endsWith('.sql')).sort();
  const existing=!!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='rooms'").get();
  db.exec('CREATE TABLE IF NOT EXISTS __local_migrations (name TEXT PRIMARY KEY NOT NULL)');
  if(existing)db.prepare('INSERT OR IGNORE INTO __local_migrations (name) VALUES (?)').run('0000_multiplayer.sql');
  for(const name of files){
    if(db.prepare('SELECT name FROM __local_migrations WHERE name=?').get(name))continue;
    db.exec('BEGIN IMMEDIATE');
    try{db.exec(await readFile(new URL(name,directory),'utf8'));db.prepare('INSERT INTO __local_migrations (name) VALUES (?)').run(name);db.exec('COMMIT');}
    catch(error){db.exec('ROLLBACK');throw error;}
  }
}
