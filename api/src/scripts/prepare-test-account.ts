// Readies an automated-test account: gives it a role and marks its email
// confirmed. Only for @example.test addresses, and never in production.
// Run inside the API container:
//   docker compose exec api node dist/scripts/prepare-test-account.js <email> <role>
import { Client } from 'pg';
import { ROLES } from '../config';

async function main() {
  const [emailArg, role] = process.argv.slice(2);
  const email = emailArg?.toLowerCase() ?? '';
  if (process.env.NODE_ENV === 'production') {
    console.error('Test accounts are never prepared in production.');
    process.exit(2);
  }
  if (!email.endsWith('@example.test') || !(ROLES as readonly string[]).includes(role)) {
    console.error(`Usage: prepare-test-account <name@example.test> <${ROLES.join('|')}>`);
    process.exit(2);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const updated = await client.query(
      `update users
         set role = $2, email_verified_at = coalesce(email_verified_at, now()),
             must_change_password = false
       where email = $1`,
      [email, role],
    );
    if (updated.rowCount === 0) {
      console.error(`No account has the email ${email}.`);
      process.exit(1);
    }
    console.log(`${email} is ready as ${role}.`);
  } finally {
    await client.end();
  }
}

void main();
