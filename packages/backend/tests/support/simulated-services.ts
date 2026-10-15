// HTTP-level simulators for PayPal Sandbox and Channel3. They stand in for
// `fetch`, so tests exercise the real HTTP clients: request building, auth
// headers, response parsing, idempotency replay and error mapping.

type FetchArgs = Parameters<typeof fetch>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function headerOf(init: RequestInit | undefined, name: string) {
  const headers = (init?.headers ?? {}) as Record<string, string>;
  const key = Object.keys(headers).find(
    (candidate) => candidate.toLowerCase() === name.toLowerCase(),
  );
  return key ? headers[key] : undefined;
}

interface SimulatedOrder {
  status: string;
  amount: string;
  currency: string;
  authorizationId?: string;
  authorizationStatus?: string;
}

/** A minimal PayPal Orders v2 + Payments v2 Sandbox. */
export function createPayPalSandboxSimulator() {
  const orders = new Map<string, SimulatedOrder>();
  const authorizations = new Map<string, string>(); // authorizationId -> orderId
  const replays = new Map<string, { status: number; body: unknown }>();
  const calls: string[] = [];
  let outages = 0;
  let sequence = 0;

  const unprocessable = (issue: string) =>
    ({
      status: 422,
      body: {
        name: "UNPROCESSABLE_ENTITY",
        message: "The requested action could not be performed.",
        debug_id: `dbg-${issue.toLowerCase()}`,
        details: [{ issue }],
      },
    }) as const;

  function route(
    method: string,
    path: string,
    body: Record<string, unknown>,
  ): { status: number; body: unknown } {
    if (method === "POST" && path === "/v2/checkout/orders") {
      const unit = (
        body.purchase_units as {
          amount: { value: string; currency_code: string };
        }[]
      )[0]!;
      if (body.intent !== "AUTHORIZE") return unprocessable("INVALID_INTENT");
      const id = `ORDER-${++sequence}`;
      orders.set(id, {
        status: "PAYER_ACTION_REQUIRED",
        amount: unit.amount.value,
        currency: unit.amount.currency_code,
      });
      return {
        status: 200,
        body: {
          id,
          status: "PAYER_ACTION_REQUIRED",
          links: [
            {
              rel: "payer-action",
              href: `https://www.sandbox.paypal.com/checkoutnow?token=${id}`,
            },
          ],
        },
      };
    }

    const orderMatch = path.match(
      /^\/v2\/checkout\/orders\/([^/]+)(\/authorize)?$/,
    );
    if (orderMatch) {
      const order = orders.get(orderMatch[1]!);
      if (!order) return { status: 404, body: { name: "RESOURCE_NOT_FOUND" } };
      if (method === "GET") {
        return {
          status: 200,
          body: { id: orderMatch[1], status: order.status },
        };
      }
      if (order.status !== "APPROVED")
        return unprocessable("ORDER_NOT_APPROVED");
      const authorizationId = `AUTH-${++sequence}`;
      order.status = "COMPLETED";
      order.authorizationId = authorizationId;
      order.authorizationStatus = "CREATED";
      authorizations.set(authorizationId, orderMatch[1]!);
      return {
        status: 201,
        body: {
          id: orderMatch[1],
          status: "COMPLETED",
          purchase_units: [
            {
              payments: {
                authorizations: [{ id: authorizationId, status: "CREATED" }],
              },
            },
          ],
        },
      };
    }

    const authMatch = path.match(
      /^\/v2\/payments\/authorizations\/([^/]+)\/(capture|void)$/,
    );
    if (authMatch) {
      const order = orders.get(authorizations.get(authMatch[1]!) ?? "");
      if (!order) return { status: 404, body: { name: "RESOURCE_NOT_FOUND" } };
      if (order.authorizationStatus !== "CREATED") {
        return unprocessable(
          authMatch[2] === "capture"
            ? "AUTHORIZATION_ALREADY_CAPTURED"
            : "CANNOT_BE_VOIDED",
        );
      }
      if (authMatch[2] === "capture") {
        order.authorizationStatus = "CAPTURED";
        return {
          status: 201,
          body: { id: `CAPTURE-${++sequence}`, status: "COMPLETED" },
        };
      }
      order.authorizationStatus = "VOIDED";
      return { status: 204, body: null };
    }

    return { status: 404, body: { name: "RESOURCE_NOT_FOUND" } };
  }

  async function simulatedFetch(
    ...[input, init]: FetchArgs
  ): Promise<Response> {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";

    if (url.pathname === "/v1/oauth2/token") {
      // Only the configured Sandbox merchant credentials get a token.
      const expected = `Basic ${btoa("sandbox-client:sandbox-secret")}`;
      if (headerOf(init, "Authorization") !== expected) {
        return json(
          {
            error: "invalid_client",
            error_description: "Client Authentication failed",
          },
          401,
        );
      }
      return json({ access_token: "sandbox-token", expires_in: 32_400 });
    }
    if (headerOf(init, "Authorization") !== "Bearer sandbox-token") {
      return json({ name: "AUTHENTICATION_FAILURE" }, 401);
    }

    calls.push(`${method} ${url.pathname}`);
    if (outages > 0) {
      outages--;
      return json(
        { name: "INTERNAL_SERVER_ERROR", debug_id: "dbg-outage" },
        503,
      );
    }

    // PayPal replays the original response for a repeated PayPal-Request-Id.
    const requestId = headerOf(init, "PayPal-Request-Id");
    const replayKey = requestId
      ? `${method} ${url.pathname} ${requestId}`
      : null;
    const replay = replayKey ? replays.get(replayKey) : undefined;
    const result =
      replay ??
      route(
        method,
        url.pathname,
        init?.body ? JSON.parse(String(init.body)) : {},
      );
    if (replayKey && !replay && result.status < 300)
      replays.set(replayKey, result);

    return result.status === 204
      ? new Response(null, { status: 204 })
      : json(result.body, result.status);
  }

  return {
    fetch: simulatedFetch as typeof fetch,
    calls,
    orders,
    /** The buyer logs in to Sandbox checkout and clicks Continue. */
    buyerApproves(orderId: string) {
      orders.get(orderId)!.status = "APPROVED";
    },
    /** The next `count` API calls fail with 503. */
    failNext(count = 1) {
      outages = count;
    },
  };
}

/** Channel3 /v1/search returning one offer per listed price. */
export function createChannel3Simulator(
  catalog: Record<string, number[] | "timeout">,
) {
  const queries: string[] = [];

  async function simulatedFetch(
    ...[input, init]: FetchArgs
  ): Promise<Response> {
    const url = new URL(String(input));
    if (url.pathname !== "/v1/search")
      return json({ detail: "Not found" }, 404);
    if (headerOf(init, "x-api-key") !== "channel3-test-key") {
      return json({ detail: "Invalid API key" }, 401);
    }

    const body = JSON.parse(String(init?.body)) as {
      query: string;
      config: { currency: string };
    };
    queries.push(body.query);
    const entry = catalog[body.query];
    if (entry === "timeout") {
      throw new DOMException("The operation timed out.", "TimeoutError");
    }

    return json({
      products: (entry ?? []).map((price, index) => ({
        id: `prod-${index}`,
        title: body.query,
        offers: [
          {
            url: `https://shop${index}.example/item`,
            domain: `shop${index}.example`,
            price: {
              price,
              compare_at_price: null,
              currency: body.config.currency,
            },
            availability: "InStock",
            condition: "new",
          },
        ],
      })),
      next_page_token: null,
    });
  }

  return { fetch: simulatedFetch as typeof fetch, queries };
}
