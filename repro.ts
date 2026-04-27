import { SQL } from 'bun';

const url = process.env.DATABASE_URL ?? 'postgresql://repro:repro@localhost:5499/repro';

const sql = new SQL({ url, prepare: false });

await sql`
  CREATE TABLE IF NOT EXISTS bug (
    id serial PRIMARY KEY,
    value jsonb NOT NULL
  )
`;
await sql`TRUNCATE bug RESTART IDENTITY`;

const cases: Array<{ label: string; run: () => Promise<unknown> }> = [
  {
    label: 'raw JS object, no inline cast',
    run: () => sql`INSERT INTO bug (value) VALUES (${{ hello: 'world' }})`,
  },
  {
    label: 'raw JS object, with ::jsonb cast',
    run: () => sql`INSERT INTO bug (value) VALUES (${{ hello: 'world' }}::jsonb)`,
  },
  {
    label: 'raw JS array, no inline cast',
    run: () => sql`INSERT INTO bug (value) VALUES (${[1, 2, 3]})`,
  },
  {
    label: 'JSON.stringify + ::jsonb cast (workaround)',
    run: () => sql`INSERT INTO bug (value) VALUES (${JSON.stringify({ hello: 'world' })}::jsonb)`,
  },
];

for (const c of cases) {
  try {
    await c.run();
    console.log(`OK    ${c.label}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`FAIL  ${c.label}\n        -> ${msg}`);
  }
}

const rows = await sql<Array<{ id: number; value: unknown; t: string }>>`
  SELECT id, value, jsonb_typeof(value) AS t
  FROM bug
  ORDER BY id
`;
console.log('\nstored rows:');
for (const row of rows) {
  console.log(`  id=${row.id}  jsonb_typeof=${row.t}  value=${JSON.stringify(row.value)}`);
}

console.log(`\nbun version: ${Bun.version}`);

await sql.close();
