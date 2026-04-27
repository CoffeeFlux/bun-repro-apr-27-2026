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

## Why this is filed separately from #28819

[oven-sh/bun#28819](https://github.com/oven-sh/bun/issues/28819) covers a
related but distinct failure mode: passing a *pre-stringified* JSON value
(`${JSON.stringify(x)}::json`) results in double-encoding. The proposed fix
in #28821 explicitly preserves the existing behavior for non-string values
("Non-string values (objects, arrays, numbers) still run through
`jsonStringifyFast` as before"), so it would not address this case.

The repro script here exercises the raw-object path and confirms it fails
on 1.3.11 onward.

## Reproduce

```sh
docker compose up -d
bun install
bun run repro
docker compose down -v
```

## Bisect

| Bun     | raw JS object → jsonb |
| ------- | --------------------- |
| 1.3.10  | works                 |
| 1.3.11  | fails                 |
| 1.3.12  | (not tested)          |
| 1.3.13  | fails                 |

Reproduced under `prepare: false` (matches our application config). Will
update if the same bisect holds with prepared statements enabled.

## Actual output on Bun 1.3.11 (Postgres 16)

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
(or `Token "array" is invalid.`) — i.e. Bun is sending the literal string
`[object Object]` / `[object Array]` on the wire. This means `String(value)`
is being called on the parameter, regardless of the inline `::jsonb` cast.

## Expected output on Bun 1.3.10

All four cases pass. The first three were verified to succeed on 1.3.10 via
a separate Docker rebuild against the same schema (see Bisect above).

## Note on Postgres version

#28819 reports double-encoding on Postgres 18.3 with the `JSON.stringify +
::json` path. This repro is on Postgres 16, where that workaround stores
correctly (`jsonb_typeof=object`). Either the double-encoding bug is
Postgres-version-sensitive, or it manifests only with `::json` (not
`::jsonb`). Not investigated further here — the focus is the raw-object
failure mode, which is independent.
