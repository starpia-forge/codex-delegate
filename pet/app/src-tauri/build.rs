fn main() {
    let generated = std::path::Path::new("../ui/notices/THIRD-PARTY-NOTICES.txt");
    let stub = std::path::Path::new("../../notices/development-stub.txt");
    // Watch an existing directory so a missing generated file doesn't make
    // every build dirty. Watching ui also detects creation of notices/.
    println!("cargo:rerun-if-changed=../ui");
    println!("cargo:rerun-if-changed={}", stub.display());
    let source = if generated.exists() { generated } else { stub };
    let output = std::path::PathBuf::from(std::env::var_os("OUT_DIR").expect("OUT_DIR"));
    std::fs::copy(source, output.join("THIRD-PARTY-NOTICES.txt"))
        .expect("copy generated notices or development stub");
    let crates = if generated.exists() {
        std::fs::read_to_string(generated.with_extension("txt.crates"))
            .expect("generated notices must include the crate section; rerun pet-notices.mjs")
    } else { String::new() };
    std::fs::write(output.join("THIRD-PARTY-NOTICES.txt.crates"), crates)
        .expect("write crate notices");
    tauri_build::build()
}
