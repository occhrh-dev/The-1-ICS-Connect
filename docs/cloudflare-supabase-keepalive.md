# Cloudflare Worker Supabase keep-alive

Updated: 2026-09-28

The production system uses two Cloudflare Workers and two Supabase projects. Both Workers now perform a lightweight database `SELECT` every 6 hours so the Free Plan projects receive regular database activity.

No Supabase key is stored in this repository. The Workers use their existing encrypted Cloudflare environment secrets.

## Production configuration

| Worker | Supabase query | Cron schedule | Deployed version | Previous rollback version |
| --- | --- | --- | --- | --- |
| `the-1-ics-connect` | `config?select=key&limit=1` | Every 6 hours | `1fc3cc57` | `363a447a` |
| `citizen-checkin-worker` | `help_requests?select=id&limit=1` | Every 6 hours | `99824406` | `2d8084cd` |

The Citizen Check-in Worker also keeps its original daily `0 19 * * *` UTC trigger for deleting helped-request photos older than 30 days. The extra 6-hour trigger does not run that cleanup.

## Main Worker code

The following code is appended to the deployed `the-1-ics-connect` Worker. Keep it when deploying a new Wrangler build.

```js
async function keepSupabaseAwake(env) {
  const baseUrl = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
  const apiKey = String(env.SUPABASE_KEY || "");
  if (!baseUrl || !apiKey) throw new Error("Missing SUPABASE_URL or SUPABASE_KEY");

  const response = await fetch(baseUrl + "/rest/v1/config?select=key&limit=1", {
    method: "GET",
    headers: {
      apikey: apiKey,
      Authorization: "Bearer " + apiKey,
      "User-Agent": "the-1-ics-connect-keepalive/1.0"
    }
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 200);
    throw new Error("Supabase keep-alive failed (" + response.status + "): " + detail);
  }
  console.log("[keepalive] the-1-ics-connect ok: " + response.status);
}

worker_default.scheduled = async (_controller, env, ctx) => {
  ctx.waitUntil(keepSupabaseAwake(env));
};
```

## Citizen Check-in Worker code

The following code is appended to the deployed `citizen-checkin-worker`. Keep it when deploying a new Wrangler build.

```js
async function keepCitizenCheckinAwake(env) {
  const baseUrl = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
  const apiKey = String(env.SUPABASE_SERVICE_KEY || "");
  if (!baseUrl || !apiKey) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY");

  const response = await fetch(baseUrl + "/rest/v1/help_requests?select=id&limit=1", {
    method: "GET",
    headers: {
      apikey: apiKey,
      Authorization: "Bearer " + apiKey,
      "User-Agent": "citizen-checkin-keepalive/1.0"
    }
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 200);
    throw new Error("Supabase keep-alive failed (" + response.status + "): " + detail);
  }
  console.log("[keepalive] citizen-checkin ok: " + response.status);
}

const previousCitizenScheduled = citizen_checkin_worker_default.scheduled.bind(
  citizen_checkin_worker_default
);

citizen_checkin_worker_default.scheduled = async (event, env, ctx) => {
  ctx.waitUntil(keepCitizenCheckinAwake(env));
  if (event.cron === "0 19 * * *") {
    await previousCitizenScheduled(event, env, ctx);
  }
};
```

## Verification

In Cloudflare Dashboard, open the Worker, select **Edit code**, then **Schedule**, and choose **Trigger scheduled event**.

Expected successful console messages:

```text
[keepalive] the-1-ics-connect ok: 200
[keepalive] citizen-checkin ok: 200
```

Both messages were verified in production on 2026-09-28.

## Important limitation

This setup reduces the chance of Supabase Free Plan inactivity pausing but is not an uptime guarantee. A paid Supabase project remains the appropriate option when guaranteed non-pausing and automated backups are required.
