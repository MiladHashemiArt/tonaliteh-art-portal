import { getRouteApi } from "@tanstack/react-router";

const appRoute = getRouteApi("/app");

/** Signed-in user, their profile and their database-verified role. Only usable under /app. */
export function useAppSession() {
  return appRoute.useRouteContext();
}
