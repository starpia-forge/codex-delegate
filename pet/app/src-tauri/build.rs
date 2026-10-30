fn main() {
    let package = std::path::Path::new("../../../package.json");
    println!("cargo:rerun-if-changed={}", package.display());
    let package: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(package).expect("read repository package.json")
    ).expect("parse repository package.json");
    let version = package["version"].as_str().expect("package.json version must be a string");
    println!("cargo:rustc-env=RELEASE_VERSION={version}");

    let generated = std::path::Path::new("../ui/notices/THIRD-PARTY-NOTICES.txt");
    let stub = std::path::Path::new("../../notices/development-stub.txt");
    // Watch an existing directory so a missing generated file doesn't make
    // every build dirty. Watching ui also detects creation of notices/.
    println!("cargo:rerun-if-changed=../ui");
    println!("cargo:rerun-if-changed={}", stub.display());
    // tauri-build embeds icons/icon.ico as the exe icon but doesn't watch it.
    println!("cargo:rerun-if-changed=icons");
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
