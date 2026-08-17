// Load test — run this yourself against a STAGING deployment, never
// production, and never without warning Supabase first if you're on a
// plan with connection limits (this can exhaust the connection pool on
// small plans in seconds).
//
// Install: https://k6.io/docs/get-started/installation/
// Run:     BASE_URL=https://your-staging-url.vercel.app k6 run load-tests/basic-load-test.js
//
// This is deliberately NOT run against the live app by Claude — there's
// no safe way to load-test someone else's production database and
// billing quota without their explicit, in-the-moment supervision.

import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

export const options = {
  scenarios: {
    // Ramps from 0 to 50 concurrent virtual users over 2 minutes, holds
    // for 3 minutes, ramps back down — a reasonable first check for a
    // small-business app, not a "1 crore users" claim.
    ramping_load: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 10 },
        { duration: "1m", target: 50 },
        { duration: "3m", target: 50 },
        { duration: "30s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<2000"], // 95% of requests under 2s
    http_req_failed: ["rate<0.01"], // less than 1% failures
  },
};

export default function () {
  // Unauthenticated pages only — this script does not attempt to log
  // in, since simulating real auth sessions at load needs seeded test
  // accounts you control, not something to script blind.
  const loginPage = http.get(`${BASE_URL}/login`);
  check(loginPage, { "login page loads": (r) => r.status === 200 });
  sleep(1);

  const signupPage = http.get(`${BASE_URL}/signup`);
  check(signupPage, { "signup page loads": (r) => r.status === 200 });
  sleep(1);
}
