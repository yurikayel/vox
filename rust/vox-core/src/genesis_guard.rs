//! Genesis cutoff guard matching `client/js/genesis.js` and `relay/genesis_guard.py`.

use crate::genesis_data::{GENESIS_MS, TEST_ROUTE_IDS};

/// Returns `true` if `route_id` (after trimming whitespace) belongs to the purged
/// pre-genesis test route list.
pub fn is_test_route_id(route_id: &str) -> bool {
    let trimmed = route_id.trim();
    TEST_ROUTE_IDS.contains(&trimmed)
}

/// Returns `true` if a timestamp in UTC milliseconds is strictly positive and
/// strictly before [`GENESIS_MS`]. Zero or negative timestamps are treated as
/// missing and kept (matching client and relay behavior).
pub fn is_before_genesis_ms(ms: i64) -> bool {
    0 < ms && ms < GENESIS_MS
}

/// Returns `true` if a post must be refused because its author is a purged test
/// account or its creation timestamp precedes [`GENESIS_MS`].
pub fn refuses_post(author: Option<&str>, created_ms: Option<i64>) -> bool {
    author.is_some_and(is_test_route_id) || created_ms.is_some_and(is_before_genesis_ms)
}

/// Returns `true` if a profile card must be refused because its `route_id`
/// belongs to a purged test account.
pub fn refuses_profile_card(route_id: Option<&str>) -> bool {
    route_id.is_some_and(is_test_route_id)
}
