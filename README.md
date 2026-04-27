# bun:sql — raw JS object bound to JSONB column produces `[object Object]` on the wire (1.3.11+)

Binding a raw JS object/array into a `bun:sql` template parameter for a
`jsonb` column sends the literal string `[object Object]` to Postgres, which
rejects the parameter with:

```
PostgresError: invalid input syntax for type json
detail: Token "object" is invalid.
```

This appears to be a regression introduced in `1.3.11` — see bisect below.
The same code works in `1.3.10`.

## Relationship to #28819

[oven-sh/bun#28819](https://github.com/oven-sh/bun/issues/28819) reports
double-encoding when binding a pre-stringified JSON value
(`${JSON.stringify(x)}::json`). Running this repro across versions reveals
the two bugs are linked: whatever change shipped in 1.3.11 fixed #28819
but broke the raw-object path. **No released Bun version handles both
paths correctly.**

| Bun     | raw object/array bind   | `JSON.stringify + ::jsonb` workaround |
| ------- | ----------------------- | ------------------------------------- |
| 1.3.10  | works                   | silently double-encodes (stored as `jsonb_typeof=string`) |
| 1.3.11  | fails (`[object Object]`) | works (`jsonb_typeof=object`)       |
| 1.3.12  | fails                   | works                                 |
| 1.3.13  | fails                   | works                                 |

Reproduced under `prepare: false`. All runs against Postgres 16 (see
`docker-compose.yml`) — note that this contradicts an earlier hypothesis
that the double-encoding bug was Postgres-18-specific; it reproduces here
on 16.

## Reproduce

```sh
docker compose up -d
bun install
bun run repro
docker compose down -v
```

To run across Bun versions without changing your local install:

```sh
docker compose up -d
for ver in 1.3.10 1.3.11 1.3.12 1.3.13; do
  echo "=== bun $ver ==="
  docker run --rm \
    -e DATABASE_URL='postgresql://repro:repro@host.docker.internal:5499/repro' \
    -v "$(pwd)":/app -w /app \
    oven/bun:$ver bun repro.ts
done
docker compose down -v
```

## Sample output: Bun 1.3.11 (failure mode)

```
FAIL  raw JS object, no inline cast
        -> invalid input syntax for type json
FAIL  raw JS object, with ::jsonb cast
        -> invalid input syntax for type json
FAIL  raw JS array, no inline cast
        -> invalid input syntax for type json
OK    JSON.stringify + ::jsonb cast (workaround)

stored rows:
  id=1  jsonb_typeof=object  value={"hello":"world"}
```

The Postgres `detail` field on each failure is `Token "object" is invalid.`
(or `Token "array" is invalid.`) — Bun is sending the literal string
`[object Object]` / `[object Array]` on the wire. The inline `::jsonb` cast
does not change this.

## Sample output: Bun 1.3.10

```
OK    raw JS object, no inline cast
OK    raw JS object, with ::jsonb cast
OK    raw JS array, no inline cast
OK    JSON.stringify + ::jsonb cast (workaround)

stored rows:
  id=1  jsonb_typeof=object  value={"hello":"world"}
  id=2  jsonb_typeof=object  value={"hello":"world"}
  id=3  jsonb_typeof=array   value=[1,2,3]
  id=4  jsonb_typeof=string  value="{\"hello\":\"world\"}"
```

Note that case 4 *appears* to "succeed" — no exception thrown — but the
value is stored as a JSON string, not the intended object. This is the
silent #28819 failure.
