import type { NestExpressApplication } from "@nestjs/platform-express";
import { json, type Request, type Response, type NextFunction } from "express";

/** Transport configuration only. CLAR-039 leaves every non-automation parser unchanged. */
export function configureAutomationBodyParser(app: NestExpressApplication) {
  const parser = json({ limit: "2mb" });
  // Nest detects an existing global parser by the middleware function name 'jsonParser'.
  // A distinctly named wrapper prevents this scoped parser from suppressing Nest's
  // ordinary JSON/raw-body parser (which must still verify Meta's original bytes).
  app.use(
    "/api/v1/automations",
    function automationGraphJson(request: Request, response: Response, next: NextFunction) {
      parser(request, response, next);
    },
  );
}
