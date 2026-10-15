import { supabase } from "@/integrations/supabase/client";

const PAGE_SIZE = 1000;

/**
 * Generic paginated fetch for any Supabase table.
 * Avoids the 1000-row default limit by looping through pages.
 */
export async function fetchAllPaginated<T = any>(
  table: string,
  select: string,
  filters: (query: any) => any,
  orderCol = "date",
  ascending = false,
): Promise<T[]> {
  let all: T[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    let q = (supabase.from as any)(table)
      .select(select)
      .order(orderCol, { ascending })
      .range(from, from + PAGE_SIZE - 1);

    q = filters(q);

    const { data, error } = await q;
    if (error) throw error;
    all = all.concat((data as T[]) || []);
    hasMore = (data?.length || 0) === PAGE_SIZE;
    from += PAGE_SIZE;
  }

  return all;
}
