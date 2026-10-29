// Ticket 07 will expose these to the licences window.
#![allow(dead_code)]

pub const TEXT: &str = include_str!(concat!(env!("OUT_DIR"), "/THIRD-PARTY-NOTICES.txt"));
const DEVELOPMENT_STUB: &str = include_str!("../../../notices/development-stub.txt");

pub fn is_stub() -> bool {
    TEXT.contains(DEVELOPMENT_STUB.lines().next().expect("development stub marker"))
}
