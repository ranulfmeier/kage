#![no_main]
// Kage ZK Program — entry point dispatcher.
// Actual circuits are in reputation.rs, memory.rs, task.rs.
// This bin exists to satisfy the default-run requirement.
sp1_zkvm::entrypoint!(main);

pub fn main() {
    // No-op dispatcher — use the specific bins (reputation, memory, task).
}
