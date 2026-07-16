export const GITHUB_PAGE_SIZE = 100;

export function nextPageForLoaded(loaded: number): number {
  return Math.floor(Math.max(0, loaded) / GITHUB_PAGE_SIZE) + 1;
}

export function coverageIsComplete(
  pageLength: number,
  loaded: number,
  totalCount?: number,
): boolean {
  return pageLength < GITHUB_PAGE_SIZE || (totalCount !== undefined && loaded >= totalCount);
}
