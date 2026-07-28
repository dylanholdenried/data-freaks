/** PostgREST / Supabase default max rows per request. */
export const SUPABASE_PAGE_SIZE = 1000;

type QueryError = { message: string } | null;

/** Loose thenable so dynamic Supabase `.select()` builders type-check. */
type PageQuery = PromiseLike<{
  data: unknown;
  error: QueryError;
}>;

/**
 * Fetches every row for a query that would otherwise be truncated at 1000.
 * `fetchPage` must build a fresh query and apply `.range(from, to)` each call.
 */
export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PageQuery,
  pageSize = SUPABASE_PAGE_SIZE
): Promise<{ data: T[]; error: QueryError }> {
  const all: T[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) return { data: all, error };
    const page = (data ?? []) as T[];
    all.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }

  return { data: all, error: null };
}

/** Keep `.in()` URL/body size manageable under PostgREST. */
const DEFAULT_ID_CHUNK = 150;

/**
 * Fetches related rows for a large ID list, chunking `.in()` filters and
 * paging each chunk past the 1000-row cap.
 */
export async function fetchAllByIds<T, Id extends string = string>(
  ids: Id[],
  fetchPage: (idChunk: Id[], from: number, to: number) => PageQuery,
  options?: { idChunkSize?: number; pageSize?: number }
): Promise<{ data: T[]; error: QueryError }> {
  if (ids.length === 0) return { data: [], error: null };

  const idChunkSize = options?.idChunkSize ?? DEFAULT_ID_CHUNK;
  const pageSize = options?.pageSize ?? SUPABASE_PAGE_SIZE;
  const all: T[] = [];

  for (let i = 0; i < ids.length; i += idChunkSize) {
    const idChunk = ids.slice(i, i + idChunkSize);
    const { data, error } = await fetchAllRows<T>(
      (from, to) => fetchPage(idChunk, from, to),
      pageSize
    );
    if (error) return { data: all, error };
    all.push(...data);
  }

  return { data: all, error: null };
}
