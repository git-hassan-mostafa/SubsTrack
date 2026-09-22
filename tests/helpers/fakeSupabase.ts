type Row = Record<string, unknown>;

export interface RecordedUpsert {
  table: string;
  rows: Row[];
  onConflict: string;
  ignoreDuplicates: boolean;
}

export interface RecordedSelect {
  table: string;
  columns: string;
  gt: [string, string] | null;
  gte: [string, string] | null;
  range: [number, number] | null;
}

/**
 * A recording PostgREST stand-in. The real `stubs/supabase-client.ts` throws on
 * any access so a suite that forgot to mock a repository fails loudly — this is
 * the opt-in replacement for the two suites that drive the sync engine itself
 * and therefore MUST see its requests. It stores no rules: every test says what
 * the server answers.
 */
export class FakeSupabase {
  readonly upserts: RecordedUpsert[] = [];
  readonly deletes: { table: string; ids: string[] }[] = [];
  readonly selects: RecordedSelect[] = [];

  session: { session: unknown } = { session: { user: { id: "u1" } } };
  upsertError: string | null = null;
  deleteError: string | null = null;
  failTables = new Set<string>();
  private serverRows = new Map<string, Row[]>();

  readonly auth = {
    getSession: async () => ({ data: this.session }),
  };

  /** What the server holds for `table` — what a pull of it will return. */
  setRows(table: string, rows: Row[]): void {
    this.serverRows.set(table, rows);
  }

  hasRows(table: string): boolean {
    return this.serverRows.has(table);
  }

  reset(): void {
    this.upserts.length = 0;
    this.deletes.length = 0;
    this.selects.length = 0;
    this.upsertError = null;
    this.deleteError = null;
    this.failTables.clear();
    this.serverRows.clear();
    this.session = { session: { user: { id: "u1" } } };
  }

  from(table: string) {
    const self = this;
    return {
      upsert: async (
        rows: Row[],
        opts: { onConflict: string; ignoreDuplicates?: boolean },
      ) => {
        self.upserts.push({
          table,
          rows,
          onConflict: opts.onConflict,
          ignoreDuplicates: opts.ignoreDuplicates === true,
        });
        const failed = self.upsertError ?? (self.failTables.has(table) ? "boom" : null);
        return { error: failed ? { message: failed } : null };
      },
      delete: () => ({
        in: async (_col: string, ids: string[]) => {
          self.deletes.push({ table, ids });
          return {
            error: self.deleteError ? { message: self.deleteError } : null,
          };
        },
        eq: async (_col: string, id: string) => {
          self.deletes.push({ table, ids: [id] });
          return {
            error: self.deleteError ? { message: self.deleteError } : null,
          };
        },
      }),
      select: (columns: string) => self.query(table, columns),
    };
  }

  private query(table: string, columns: string) {
    const rec: RecordedSelect = {
      table,
      columns,
      gt: null,
      gte: null,
      range: null,
    };
    this.selects.push(rec);

    const self = this;
    const builder = {
      order: () => builder,
      gt: (col: string, v: string) => {
        rec.gt = [col, v];
        return builder;
      },
      gte: (col: string, v: string) => {
        rec.gte = [col, v];
        return builder;
      },
      range: (from: number, to: number) => {
        rec.range = [from, to];
        return builder;
      },
      run: async () => {
        if (self.failTables.has(table)) {
          return { data: null, error: { message: `pull ${table} failed` } };
        }
        let rows = self.serverRows.get(table) ?? [];
        if (rec.gt) {
          const [col, v] = rec.gt;
          rows = rows.filter((r) => String(r[col]) > v);
        }
        if (rec.gte) {
          const [col, v] = rec.gte;
          rows = rows.filter((r) => String(r[col]) >= v);
        }
        const [from, to] = rec.range ?? [0, rows.length];
        return { data: rows.slice(from, to + 1), error: null };
      },
      then: (
        resolve: (v: { data: Row[] | null; error: { message: string } | null }) => unknown,
      ) => builder.run().then(resolve),
    };
    return builder;
  }
}
