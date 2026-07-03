import { serve } from "inngest/next";
import { inngest, functions } from "@craftsite/pipeline";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions
});
