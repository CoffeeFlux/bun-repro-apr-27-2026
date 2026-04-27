# bun:sql — raw JS object bound to JSONB sends `[object Object]` on 1.3.11+

Binding a raw JS object or array into a `bun:sql` template parameter for a
`jsonb` column sends the literal string `[object Object]` (or
`[object Array]`) on the wire, regardless of an inline `::jsonb` cast.
Postgres rejects with:

```
PostgresError: invalid input syntax for type json
detail: Token "object" is invalid.
```

This regressed between 1.3.10 → 1.3.11 and is still present on 1.3.13.
The intended binding behavior for JS values → JSONB doesn't appear to be
documented in `docs/runtime/sql.mdx` for either Postgres or MySQL.

## Reproduce

```sh
docker compose up -d
bun install
bun run repro          # uses your local Bun

# To run across versions without changing your local install:
for ver in 1.3.10 1.3.11 1.3.12 1.3.13; do
  echo "=== bun $ver ==="
  docker run --rm \
    -e DATABASE_URL='postgresql://repro:repro@host.docker.internal:5499/repro' \
    -v "$(pwd)":/app -w /app \
    oven/bun:$ver bun repro.ts
done

docker compose down -v
```

## Bisect (Postgres 16, `prepare: false`)

| Bun     | `${rawObject}` → jsonb |
| ------- | ---------------------- |
| 1.3.10  | works                  |
| 1.3.11  | fails                  |
| 1.3.12  | fails                  |
| 1.3.13  | fails                  |

## Sample output, Bun 1.3.11

```
FAIL  raw JS object, no inline cast
        -> invalid input syntax for type json
FAIL  raw JS object, with ::jsonb cast
        -> invalid input syntax for type json
FAIL  raw JS array, no inline cast
        -> invalid input syntax for type json
OK    JSON.stringify + ::jsonb cast
```
