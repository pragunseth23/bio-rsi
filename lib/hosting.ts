/** Build-time switch for deployments that deliberately omit the research backend. */
export const FRONTEND_ONLY = process.env.NEXT_PUBLIC_FRONTEND_ONLY === "true";
