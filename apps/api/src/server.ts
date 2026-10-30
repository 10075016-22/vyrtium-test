import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openDatabase } from './db/database.js';
import { seedUsers } from './db/seed.js';

const config = loadConfig();
const db = openDatabase(config.databasePath);
await seedUsers(db);

const app = createApp({ config, db });

app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});
