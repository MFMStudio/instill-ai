# Instill AI — Webhook Reference

Outbound webhooks let you receive real-time events whenever preferences change in your Instill AI instance.

---

## Events

| Event | Fired when |
|---|---|
| `preference.created` | A new preference rule is saved |
| `preference.updated` | An existing rule is edited or restored to a prior version |
| `preference.deleted` | A rule is deleted |

---

## Payload format

Every delivery is a `POST` request with a JSON body:

```json
{
  "event": "preference.updated",
  "ts": "2026-05-08T14:23:01.000Z",
  "data": {
    "preference": {
      "id": "pref_abc123",
      "user_id": "usr_xyz",
      "category": "coding style",
      "rule": "Always use TypeScript strict mode."
    }
  }
}
```

For bundle imports, `data` also includes `"source": "bundle:<bundleId>"`.

---

## Signature verification

Every request carries an `X-Instill-Signature` header. The value is `sha256=<hex-hmac>` computed with **HMAC-SHA256** over the raw request body using the endpoint's signing secret.

**Always verify signatures before trusting webhook payloads.**

### Node.js (Express)

```js
import crypto from 'crypto';

app.post('/hooks/instill', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['x-instill-signature'];
  const expected = 'sha256=' + crypto
    .createHmac('sha256', process.env.INSTILL_WEBHOOK_SECRET)
    .update(req.body)
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return res.status(401).send('Bad signature');
  }

  const event = JSON.parse(req.body.toString());
  console.log('Received:', event.event, event.data.preference.id);
  res.sendStatus(200);
});
```

### Python (Flask)

```python
import hmac, hashlib, os
from flask import Flask, request, abort

app = Flask(__name__)

@app.route('/hooks/instill', methods=['POST'])
def instill_webhook():
    sig = request.headers.get('X-Instill-Signature', '')
    secret = os.environ['INSTILL_WEBHOOK_SECRET'].encode()
    expected = 'sha256=' + hmac.new(secret, request.data, hashlib.sha256).hexdigest()

    if not hmac.compare_digest(sig, expected):
        abort(401)

    event = request.get_json(force=True)
    print(f"Received: {event['event']} — {event['data']['preference']['id']}")
    return '', 200
```

---

## curl — manual test

Send a test delivery from the dashboard, or replay a delivery manually with curl:

```bash
# 1. Compute signature for a test payload
BODY='{"event":"preference.created","ts":"2026-05-08T00:00:00.000Z","data":{"preference":{"id":"test","category":"test","rule":"test"}}}'
SECRET="your-signing-secret"

SIG="sha256=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')"

# 2. POST to your endpoint
curl -X POST https://your-server.example.com/hooks/instill \
  -H "Content-Type: application/json" \
  -H "X-Instill-Signature: $SIG" \
  -d "$BODY"
```

---

## Slack incoming webhook

Forward Instill events to a Slack channel using a Slack Incoming Webhook URL:

```js
// webhook-bridge.js — tiny Express bridge
import express from 'express';
import crypto from 'crypto';
import fetch from 'node-fetch';

const app = express();
app.use(express.raw({ type: 'application/json' }));

app.post('/bridge', (req, res) => {
  const sig = req.headers['x-instill-signature'];
  const expected = 'sha256=' + crypto
    .createHmac('sha256', process.env.INSTILL_WEBHOOK_SECRET)
    .update(req.body)
    .digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return res.status(401).send('Bad signature');
  }

  const { event, data } = JSON.parse(req.body.toString());
  const pref = data.preference;

  const text = `*${event}*\n` +
    `Category: \`${pref.category}\`\n` +
    `Rule: ${pref.rule.slice(0, 140)}`;

  fetch(process.env.SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  res.sendStatus(200);
});

app.listen(3501);
```

---

## Delivery retries

Failed deliveries (non-2xx response or connection timeout) are retried up to **3 times** with exponential backoff:

| Attempt | Delay |
|---|---|
| 1st retry | 2 s |
| 2nd retry | 4 s |
| 3rd retry | — (dead-lettered) |

All delivery attempts are logged in the `webhook_deliveries` table. You can inspect them directly in SQLite or query via the admin panel.

---

## Managing endpoints

Endpoints are managed via the dashboard **Outbound Webhooks** panel, or the REST API:

```bash
# List
curl -H "Authorization: Bearer $API_KEY" https://instill.example.com/api/webhooks

# Add
curl -X POST -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://...","events":["preference.created","preference.updated"]}' \
  https://instill.example.com/api/webhooks

# Test delivery
curl -X POST -H "Authorization: Bearer $API_KEY" \
  https://instill.example.com/api/webhooks/<id>/test

# Delete
curl -X DELETE -H "Authorization: Bearer $API_KEY" \
  https://instill.example.com/api/webhooks/<id>
```

The signing secret is returned **once** when the endpoint is created. Store it securely — it cannot be retrieved again. Rotate by deleting and re-creating the endpoint.
