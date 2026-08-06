/** PostgREST / Supabase default max rows per request. */
export const SUPABASE_PAGE_SIZE = 1000;

/** Default parallel chunk/page concurrency for multi-request fetches. */
const DEFAULT_CONCURRENCY = 8;

type QueryError = { message: string } | null;

/** Loose thenable so dynamic Supabase `.select()` builders type-check. */
type PageQuery = PromiseLike<{
  data: unknown;
  error: QueryError;
}>;

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await mapper(items[i]!, i);
    }
  }

  const workers = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

/**
 * Fetches every row for a query that would otherwise be truncated at 1000.
 * `fetchPage` must build a fresh query and apply `.range(from, to)` each call.
 *
 * Fetches the first page sequentially, then remaining full-size pages in
 * parallel waves (bounded concurrency) until a short page is found.
 */
export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PageQuery,
  pageSize = SUPABASE_PAGE_SIZE,
  concurrency = DEFAULT_CONCURRENCY
): Promise<{ data: T[]; error: QueryError }> {
  const { data, error } = await fetchPage(0, pageSize - 1);
  if (error) return { data: [], error };

  const first = (data ?? []) as T[];
  if (first.length < pageSize) {
    return { data: first, error: null };
  }

  const all: T[] = [...first];
  let pageIndex = 1;

  for (;;) {
    const batchIndexes = Array.from(
      { length: concurrency },
      (_, i) => pageIndex + i
    );
    const pages = await mapPool(batchIndexes, concurrency, async (idx) => {
      const from = idx * pageSize;
      const res = await fetchPage(from, from + pageSize - 1);
      return res;
    });

    let shortFound = false;
    for (const pageRes of pages) {
      if (pageRes.error) {
        return { data: all, error: pageRes.error };
      }
      const page = (pageRes.data ?? []) as T[];
      all.push(...page);
      if (page.length < pageSize) {
        shortFound = true;
        break;
      }
    }

    if (shortFound) break;
    pageIndex += concurrency;
  }

  return { data: all, error: null };
}

/** Keep `.in()` URL/body size manageable under PostgREST. */
const DEFAULT_ID_CHUNK = 150;

/**
 * Fetches related rows for a large ID list, chunking `.in()` filters and
 * paging each chunk past the 1000-row cap.
 * ID chunks run with bounded concurrency.
 */
export async function fetchAllByIds<T, Id extends string = string>(
  ids: Id[],
  fetchPage: (idChunk: Id[], from: number, to: number) => PageQuery,
  options?: {
    idChunkSize?: number;
    pageSize?: number;
    concurrency?: number;
  }
): Promise<{ data: T[]; error: QueryError }> {
  if (ids.length === 0) return { data: [], error: null };

  const idChunkSize = options?.idChunkSize ?? DEFAULT_ID_CHUNK;
  const pageSize = options?.pageSize ?? SUPABASE_PAGE_SIZE;
  const concurrency = options?.concurrency ?? DEFAULT_CONCURRENCY;

  const chunks: Id[][] = [];
  for (let i = 0; i < ids.length; i += idChunkSize) {
    chunks.push(ids.slice(i, i + idChunkSize));
  }

  const chunkResults = await mapPool(chunks, concurrency, async (idChunk) =>
    fetchAllRows<T>((from, to) => fetchPage(idChunk, from, to), pageSize, concurrency)
  );

  const all: T[] = [];
  for (const res of chunkResults) {
    if (res.error) return { data: all, error: res.error };
    all.push(...res.data);
  }

  return { data: all, error: null };
}
