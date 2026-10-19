// stripe-webhook — Phase 1. Verifies the Stripe signature; issues check_tokens (hashed) or updates subscribers.
import { notImplemented } from "../_shared/http.ts";

Deno.serve(notImplemented("stripe-webhook", "1"));
