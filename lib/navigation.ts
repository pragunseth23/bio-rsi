export const PAGE_PATHS = {
  optimization: "/optimization",
  history: "/history",
  verification: "/verification",
} as const;
export type Tab = keyof typeof PAGE_PATHS;
