import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "./index";

/** Route handlers for app/api/auth/[...all]/route.ts. */
export const { GET, POST } = toNextJsHandler(auth.handler);
