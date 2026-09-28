// Gives an existing account a role. Run inside the API container:
//   docker compose exec api node dist/scripts/set-role.js <email> <role>
import { Client } from 'pg';
import { ROLES } from '../config';

async function main() {
  const [email, role] = process.argv.slice(2);
  if (!email || !(ROLES as readonly string[]).includes(role)) {
    console.error(`Usage: set-role <email> <${ROLES.join('|')}>`);
    process.exit(2);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('begin');
    const updated = await client.query<{ id: string; old_role: string }>(
      `update users u set role = $2
       from (select id, role as old_role from users where email = $1 for update) prev
       where u.id = prev.id
       returning u.id, prev.old_role`,
      [email.toLowerCase(), role],
    );
    const row = updated.rows[0];
    if (!row) {
      await client.query('rollback');
      console.error(`No account has the email ${email}.`);
      process.exit(1);
    }
    await client.query(
      `insert into audit_events
         (actor_id, action, object_type, object_id, prior_state, new_state, reason)
       values (null, 'user.role_changed', 'user', $1, $2, $3, 'set-role script')`,
      [row.id, row.old_role, role],
    );
    await client.query('commit');
    console.log(`${email} is now ${role} (was ${row.old_role}).`);
  } finally {
    await client.end();
  }
}

void main();
