// A small in-memory stand-in for the parts of supabase-js the stores use (tables, storage, auth),
// so store tests exercise the real query-building and row-mapping code without a network.
// `failNext` makes the next matching call fail, for testing how the stores clean up after errors.
import type { SupabaseClient } from '@supabase/supabase-js'

type Row = Record<string, unknown>
type Op = 'select' | 'insert' | 'update' | 'delete' | 'upload'
type Result = { data: unknown; error: { message: string; code?: string } | null; count?: number | null }

export function fakeSupabase(
  options: {
    userId?: string
    beforeInsert?: (table: string, row: Row, existing: Row[]) => string | null
    /** Foreign keys declared `on delete cascade`: deleting from a table also deletes the child rows that point at it. */
    cascades?: Record<string, { table: string; column: string }[]>
    /** Like the project's "Max rows" API setting: no answer has more rows than this, whatever range was asked for. */
    maxRows?: number
  } = {},
) {
  const tables = new Map<string, Row[]>()
  const files = new Map<string, Blob>()
  const failures: { table: string; op: Op; message: string; after: number }[] = []
  const rowsOf = (table: string) => {
    if (!tables.has(table)) tables.set(table, [])
    return tables.get(table)!
  }
  const takeFailure = (table: string, op: Op) => {
    const index = failures.findIndex((f) => f.table === table && f.op === op)
    if (index === -1) return null
    const failure = failures[index]
    if (failure.after > 0) {
      failure.after--
      return null
    }
    failures.splice(index, 1)
    return failure.message
  }

  function query(table: string) {
    let op: Op = 'select'
    let payload: Row | Row[] | null = null
    let columns: string | null = null
    let wantCount = false
    let single: 'one' | 'maybe' | null = null
    const order: { column: string; ascending: boolean }[] = []
    let range: [number, number] | null = null
    const filters: ((row: Row) => boolean)[] = []

    const pick = (row: Row) => (columns ? Object.fromEntries(columns.split(',').map((c) => [c, row[c] ?? null])) : row)

    const run = (): Result => {
      const failure = takeFailure(table, op)
      if (failure) return { data: null, error: { message: failure } }
      const rows = rowsOf(table)
      const matches = rows.filter((row) => filters.every((f) => f(row)))
      let out: Row[]
      if (op === 'insert') {
        const list = Array.isArray(payload) ? payload : [payload!]
        out = []
        for (const input of list) {
          const row: Row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), owner_id: options.userId, ...input }
          const problem = options.beforeInsert?.(table, row, rows)
          if (problem) return { data: null, error: { message: problem, code: '23505' } }
          rows.push(row)
          out.push(row)
        }
      } else if (op === 'update') {
        for (const row of matches) Object.assign(row, payload)
        out = matches
      } else if (op === 'delete') {
        tables.set(table, rows.filter((row) => !matches.includes(row)))
        for (const child of options.cascades?.[table] ?? []) {
          const ids = new Set(matches.map((row) => row.id))
          tables.set(child.table, rowsOf(child.table).filter((row) => !ids.has(row[child.column])))
        }
        out = matches
      } else {
        // Postgres doesn't promise any order for rows the ORDER BY can't tell apart, and it can differ between
        // requests, so shuffle first: paging that relies on a lucky order fails here too.
        out = [...matches].sort(() => Math.random() - 0.5)
        for (const { column, ascending } of [...order].reverse()) {
          out.sort((a, b) => String(a[column]).localeCompare(String(b[column])) * (ascending ? 1 : -1))
        }
      }
      const total = out.length
      if (range) out = out.slice(range[0], range[1] + 1)
      if (op === 'select') out = out.slice(0, options.maxRows ?? 1000)
      const data = out.map(pick)
      if (single === 'one') return data.length === 1 ? { data: data[0], error: null } : { data: null, error: { message: `expected one row, got ${data.length}` } }
      if (single === 'maybe') return { data: data[0] ?? null, error: null }
      return { data: op === 'delete' && !columns ? null : data, error: null, count: wantCount ? total : null }
    }

    const builder = {
      select(cols?: string, opts?: { count?: string }) {
        if (op === 'select' || cols !== undefined) columns = cols ?? null
        wantCount = Boolean(opts?.count)
        return builder
      },
      insert(rows: Row | Row[]) {
        op = 'insert'
        payload = rows
        return builder
      },
      update(patch: Row) {
        op = 'update'
        payload = patch
        return builder
      },
      delete() {
        op = 'delete'
        return builder
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value)
        return builder
      },
      is(column: string, value: unknown) {
        filters.push((row) => (row[column] ?? null) === value)
        return builder
      },
      in(column: string, values: unknown[]) {
        filters.push((row) => values.includes(row[column]))
        return builder
      },
      order(column: string, opts?: { ascending?: boolean }) {
        order.push({ column, ascending: opts?.ascending ?? true })
        return builder
      },
      range(from: number, to: number) {
        range = [from, to]
        return builder
      },
      single() {
        single = 'one'
        return builder
      },
      maybeSingle() {
        single = 'maybe'
        return builder
      },
      then<T>(resolve: (value: Result) => T, reject?: (reason: unknown) => T) {
        return Promise.resolve().then(run).then(resolve, reject)
      },
    }
    return builder
  }

  const client = {
    from: (table: string) => query(table),
    rpc: async (name: string) => {
      const failure = takeFailure(name, 'select')
      return failure ? { data: null, error: { message: failure } } : { data: rowsOf(`rpc:${name}`), error: null }
    },
    auth: {
      getSession: async () => ({ data: { session: options.userId ? { user: { id: options.userId } } : null }, error: null }),
    },
    storage: {
      from: () => ({
        upload: async (path: string, blob: Blob) => {
          const failure = takeFailure('storage', 'upload')
          if (failure) return { data: null, error: { message: failure } }
          files.set(path, blob)
          return { data: { path }, error: null }
        },
        remove: async (paths: string[]) => {
          for (const path of paths) files.delete(path)
          return { data: [], error: null }
        },
        createSignedUrls: async (paths: string[]) => ({
          data: paths.map((path) => (files.has(path) ? { path, signedUrl: `https://signed.example/${path}`, error: null } : { path, signedUrl: '', error: 'Object not found' })),
          error: null,
        }),
      }),
    },
  }

  return {
    client: client as unknown as SupabaseClient,
    tables,
    files,
    /** Makes a call of this kind fail with the given message, after letting `after` such calls succeed. */
    failNext(table: string, op: Op, { message = 'simulated failure', after = 0 }: { message?: string; after?: number } = {}) {
      failures.push({ table, op, message, after })
    },
  }
}
