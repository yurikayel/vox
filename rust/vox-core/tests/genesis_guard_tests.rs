//! Integration tests for `vox_core::genesis_data` and `vox_core::genesis_guard`.

use vox_core::genesis_data::{GENESIS_MS, TEST_ROUTE_IDS};
use vox_core::genesis_guard::{
    is_before_genesis_ms, is_test_route_id, refuses_post, refuses_profile_card,
};

#[test]
fn genesis_constants_match_expected_values() {
    assert_eq!(GENESIS_MS, 1_794_452_400_000);
    assert_eq!(TEST_ROUTE_IDS.len(), 145);
}

#[test]
fn test_route_id_trims_whitespace_and_rejects_unknown() {
    assert!(is_test_route_id("vx_ana"));
    assert!(is_test_route_id("  vx_ana\t\n"));
    assert!(is_test_route_id("vx_0b6fSzm9Fsnvm6yVKpc2"));
    assert!(is_test_route_id("vx_zsCPkfZSpGKN_aHTmUQw"));
    assert!(!is_test_route_id(""));
    assert!(!is_test_route_id("   "));
    assert!(!is_test_route_id("vx_legitimate_user_123"));
}

#[test]
fn before_genesis_ms_handles_boundaries() {
    assert!(!is_before_genesis_ms(0));
    assert!(!is_before_genesis_ms(-1));
    assert!(is_before_genesis_ms(1));
    assert!(is_before_genesis_ms(GENESIS_MS - 1));
    assert!(!is_before_genesis_ms(GENESIS_MS));
    assert!(!is_before_genesis_ms(GENESIS_MS + 1));
}

#[test]
fn refuses_post_and_profile_card_enforce_cutoff_and_purged_list() {
    assert!(refuses_post(Some("  vx_ana "), None));
    assert!(refuses_post(Some("vx_legit"), Some(GENESIS_MS - 1)));
    assert!(!refuses_post(Some("vx_legit"), Some(GENESIS_MS)));
    assert!(!refuses_post(Some("vx_legit"), Some(0)));
    assert!(!refuses_post(None, None));

    assert!(refuses_profile_card(Some("vx_ana")));
    assert!(refuses_profile_card(Some(" vx_0b6fSzm9Fsnvm6yVKpc2 ")));
    assert!(!refuses_profile_card(Some("vx_legit")));
    assert!(!refuses_profile_card(None));
}
