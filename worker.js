import { onRequest as adminMedia }     from "./functions/api/admin-media.js";
import { onRequest as adminProfile }   from "./functions/api/admin-profile.js";
import { onRequest as createToken }    from "./functions/api/create-token.js";
import { onRequest as getContent }     from "./functions/api/get-content.js";
import { onRequest as pixCashin }      from "./functions/api/pix-cashin.js";
import { onRequest as pixWebhook }     from "./functions/api/pix-webhook.js";
import { onRequest as syncpayCashin }  from "./functions/api/syncpay-cashin.js";
import { onRequest as activateAccess } from "./functions/api/activate-access.js";

const ROUTES = {
  "/api/admin-media":       adminMedia,
  "/api/admin-profile":     adminProfile,
  "/api/create-token":      createToken,
  "/api/get-content":       getContent,
  "/api/pix-cashin":        pixCashin,
  "/api/pix-webhook":       pixWebhook,
  "/api/syncpay-cashin":    syncpayCashin,
  "/api/activate-access":   activateAccess,
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Redirect /favicon.ico to the actual favicon asset
    if (url.pathname === '/favicon.ico') {
      const faviconUrl = new URL('/images/faviconV2.png', url.origin);
      return env.ASSETS.fetch(new Request(faviconUrl.toString(), request));
    }

    const handler = ROUTES[url.pathname];
    if (handler) {
      return handler({ request, env, ctx });
    }
    // Serve static assets
    return env.ASSETS.fetch(request);
  }
};
