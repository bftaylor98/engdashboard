const Database = require('better-sqlite3');
const db = new Database('./database/engineering_schedule.db');
const rows = db.prepare(
  "SELECT wo_number, machine_scheduled, current_status FROM engineering_work_orders WHERE wo_number IN ('26-0337','26-0217','26-0344')"
).all();
console.log(JSON.stringify(rows, null, 2));
db.close();
