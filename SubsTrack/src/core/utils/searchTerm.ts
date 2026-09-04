/**
 * A typed search term made safe to paste into a PostgREST `or()` filter.
 *
 * `,` `(` `)` end a clause or a group and `%` `*` are the wildcards `ilike`
 * itself consumes, so ONE of them unescaped makes the whole filter fail to parse
 * — PostgREST answers "failed to parse logic tree" and the list 400s instead of
 * simply not matching. Staff type `%` and `(` by accident often enough that this
 * has to be stripped, not trusted. The offline repositories call the same helper
 * so a term matches the same characters on both platforms.
 */
export function sanitizeSearchTerm(term: string | undefined | null): string {
  return (term ?? '').trim().replace(/[,()%*\\]/g, '');
}
