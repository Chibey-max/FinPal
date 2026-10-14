# API outline

All product APIs use `/api/v1`. Payload schemas belong in `@finpal/contracts`.

| Method | Path                                  | Purpose                                             |
| ------ | ------------------------------------- | --------------------------------------------------- |
| `GET`  | `/api/health`                         | Deployment health check                             |
| `POST` | `/api/v1/proposals`                   | Create a manual or calendar-prefilled proposal      |
| `POST` | `/api/v1/evaluations`                 | Run constraints, quality, trust, and decision rules |
| `POST` | `/api/v1/payments/authorize`          | Create and authorize an approved Sandbox order      |
| `POST` | `/api/v1/payments/:paymentId/capture` | Capture an authorized payment                       |
| `POST` | `/api/v1/payments/:paymentId/void`    | Void an authorization before capture                |
| `POST` | `/api/webhooks/paypal`                | Receive verified, idempotent PayPal events          |

The scaffold returns `501 Not Implemented` from unfinished mutation routes.
