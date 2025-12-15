// Lightweight realtime helper with multi-backend support:
// - Pusher + Laravel Echo (recommended)
// - Server-Sent Events (SSE) endpoint
// - Polling fallback
//
// Behavior:
// - call `initRealtime()` once (it is idempotent)
// - use returned `subscribe(channel, event, handler)` to listen for events
// - subscribe returns an unsubscribe() function

type Unsubscribe = () => void;

let initialized = false;
let provider: "pusher" | "sse" | "none" = "none";
let echoInstance: any = null;
let sseSource: EventSource | null = null;

export async function initRealtime() {
  if (initialized) return { provider };
  initialized = true;

  // Pusher/Echo (requires installing laravel-echo and pusher-js and setting env)
  const key = import.meta.env.VITE_PUSHER_APP_KEY;
  const cluster = import.meta.env.VITE_PUSHER_APP_CLUSTER;
  const wsHost = import.meta.env.VITE_PUSHER_WS_HOST; // optional

  if (key) {
    try {
      // import Echo and pusher dynamically if installed. Use indirect dynamic import to avoid
      // bundler static analysis when the packages are not installed in the project.
      // Note: the app should run `npm i laravel-echo pusher-js` to enable this path.
      // @ts-ignore
      const EchoMod = await (new Function('return import("laravel-echo")') as any)();
      // @ts-ignore
      const PusherMod = await (new Function('return import("pusher-js")') as any)();
      const Echo = EchoMod?.default ?? EchoMod;

      // Create Echo
      // @ts-ignore
      echoInstance = new Echo({
        broadcaster: "pusher",
        key,
        cluster: cluster ?? undefined,
        wsHost: wsHost ?? undefined,
        forceTLS: !(import.meta.env.VITE_PUSHER_FORCE_TLS === "false"),
        disableStats: true,
      });
      provider = "pusher";
      return { provider };
    } catch (e) {
      console.warn("Realtime: failed to initialize Pusher/Echo", e);
      // fall through to SSE or polling
    }
  }

  // SSE support: set VITE_ORDERS_SSE_URL to the endpoint that emits events
  const sseUrl = import.meta.env.VITE_ORDERS_SSE_URL;
  if (sseUrl) {
    try {
      sseSource = new EventSource(sseUrl);
      provider = "sse";
      return { provider };
    } catch (e) {
      console.warn("Realtime: failed to initialize SSE", e);
    }
  }

  // No provider configured; we'll rely on polling fallback in calling code
  provider = "none";
  return { provider };
}

export function subscribe(channel: string, event: string, handler: (payload: any) => void): Unsubscribe {
  // Pusher/Echo
  if (provider === "pusher" && echoInstance) {
    try {
      // Laravel Echo uses channel names without prefix for public channels
      const ch = echoInstance.channel(channel) || echoInstance.private(channel);
      ch.listen(event, (e: any) => handler(e));
      return () => { try { ch.stopListening(event); } catch {} };
    } catch (e) {
      console.warn("Realtime: echo subscribe failed", e);
    }
  }

  // SSE - we will listen for MessageEvent with event name in data._event or a simple map
  if (provider === "sse" && sseSource) {
    const listener = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data);
        // Common pattern: { event: 'OrderCreated', data: { ... } }
        const evName = data.event || data.type || data._event;
        const payload = data.data ?? data.payload ?? data;
        if (evName === event) handler(payload);
      } catch (err) {
        // if not JSON, pass raw string
        // we won't try to match by event then
      }
    };
    sseSource.addEventListener("message", listener as EventListener);
    return () => { sseSource?.removeEventListener("message", listener as EventListener); };
  }

  // No realtime available; return a noop - callers should keep a polling fallback
  return () => {};
}

export function disconnectRealtime() {
  try { echoInstance?.disconnect(); } catch {}
  try { sseSource?.close(); sseSource = null; } catch {}
  initialized = false;
  provider = "none";
}

export function getProvider() {
  return provider;
}
