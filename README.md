# `bun:sql` raw JS object bound to JSONB sends `[object Object]` on 1.3.11+

## Symptom

```ts
await sql`INSERT INTO bug (value) VALUES (${{ hello: 'world' }})`;
```

On Bun 1.3.11+, this fails with:

```
PostgresError: invalid input syntax for type json
detail: Token "object" is invalid.
```

Bun is sending the literal string `[object Object]` on the wire — i.e.
`String(value)` coercion. The same query works on Bun 1.3.10. An inline
`::jsonb` cast does not help. Arrays fail the same way (`Token "array" is
invalid.`).

The only binding form that succeeds on 1.3.11+ is
`${JSON.stringify(value)}::jsonb`.

## Reproduce

```sh
docker compose up -d
bun install
bun run repro          # uses your local Bun
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

## Bisect

Tested against Postgres 16, `prepare: false`.

| Bun     | `${rawObject}` → jsonb |
| ------- | ---------------------- |
| 1.3.10  | works                  |
| 1.3.11  | fails                  |
| 1.3.12  | fails                  |
| 1.3.13  | fails                  |

## Output: 1.3.10

```
OK    raw JS object, no inline cast
OK    raw JS object, with ::jsonb cast
OK    raw JS array, no inline cast
OK    JSON.stringify + ::jsonb cast

stored rows:
  id=1  jsonb_typeof=object  value={"hello":"world"}
  id=2  jsonb_typeof=object  value={"hello":"world"}
  id=3  jsonb_typeof=array   value=[1,2,3]
  id=4  jsonb_typeof=string  value="{\"hello\":\"world\"}"
```

## Output: 1.3.11

```
FAIL  raw JS object, no inline cast
        -> invalid input syntax for type json
FAIL  raw JS object, with ::jsonb cast
        -> invalid input syntax for type json
FAIL  raw JS array, no inline cast
        -> invalid input syntax for type json
OK    JSON.stringify + ::jsonb cast

stored rows:
  id=1  jsonb_typeof=object  value={"hello":"world"}
```
