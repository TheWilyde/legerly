try {
  console.log('native-probe:electron', process.versions.electron || 'none');
  console.log('native-probe:modules', process.versions.modules || 'unknown');
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.pragma('journal_mode = MEMORY');
  db.prepare('SELECT 1 AS ok').get();
  db.close();
  require('keytar');
  console.log('native-probe:ok');
  process.exit(0);
} catch (error) {
  console.error('native-probe:fail');
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
}
