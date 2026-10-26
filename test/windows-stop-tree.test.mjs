import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Windows tree cleanup respects process lifetimes across snapshots", { skip: process.platform !== "win32" }, () => {
  const script = readFileSync(new URL("../src/runner/windows-stop-tree.ps1", import.meta.url), "utf8");
  // Run the actual traversal with deterministic native API responses: forcing
  // real Windows to reuse a specific PID would make this regression flaky.
  const source = script.split("Add-Type @'")[1].split("'@")[0]
    .replace(/^  \[DllImport.*$/gm, "")
    .replace(/}\s*$/, String.raw`
  static int round, index;
  static uint[] pids;
  static readonly HashSet<uint> opened = new HashSet<uint>();
  static readonly HashSet<uint> ended = new HashSet<uint>();
  static readonly List<uint> killed = new List<uint>();
  static IntPtr CreateToolhelp32Snapshot(uint flags, uint pid) {
    round++;
    pids = round == 1 ? new uint[] {20,40,50,60,65,70,10}
      : round == 2 ? new uint[] {20,30,40,50,60,65,70,90,10}
      : new uint[] {20,30,40,50,60,65,70,80,90,10};
    return new IntPtr(1000);
  }
  static bool Process32First(IntPtr snapshot, ref Entry entry) {
    index = 0; return Process32Next(snapshot, ref entry);
  }
  static bool Process32Next(IntPtr snapshot, ref Entry entry) {
    if(index == pids.Length) return false;
    entry.pid = pids[index++];
    entry.parent = entry.pid == 10 ? 0u : entry.pid == 30 || entry.pid == 90 ? 20u
      : entry.pid == 80 ? 30u : entry.pid == 65 ? 60u : 10u;
    return true;
  }
  static IntPtr OpenProcess(uint rights, bool inherit, uint pid) {
    if((rights & 0x101001) != 0x101001) throw new Exception("Missing process rights");
    if((ended.Contains(pid) || pid == 60 || pid == 70) && opened.Contains(pid))
      throw new Exception("Reopened a dead/reused PID: " + pid);
    opened.Add(pid);
    return new IntPtr(pid);
  }
  static bool GetProcessTimes(IntPtr process, out long creation, out long exit, out long kernel, out long user) {
    uint pid = (uint)process.ToInt64();
    kernel = user = 0;
    creation = pid == 10 ? 100 : pid == 20 ? 150 : pid == 30 ? 210 : pid == 40 ? 310
      : pid == 50 ? 90 : pid == 65 ? 170 : pid == 80 ? 230 : pid == 90 ? 225 : 160;
    exit = pid == 60 ? 180 : ended.Contains(pid) ? (pid == 10 ? 200 : pid == 20 ? 220 : pid == 30 ? 240 : 260) : 0;
    // This snapshot child exits before its times can be read.
    return pid != 70;
  }
  static uint WaitForSingleObject(IntPtr process, uint timeout) {
    uint pid = (uint)process.ToInt64();
    return ended.Contains(pid) || pid == 60 || pid == 70 ? 0u : 258u;
  }
  static bool TerminateProcess(IntPtr process, uint code) {
    uint pid = (uint)process.ToInt64();
    if(pid != 10 && pid != 20 && pid != 30 && pid != 65 && pid != 80)
      throw new Exception("Terminated an unrelated/exited child: " + pid);
    ended.Add(pid); killed.Add(pid); return true;
  }
  static bool CloseHandle(IntPtr handle) { return true; }
  public static void Verify() {
    Stop(10);
    if(String.Join(",", killed) != "10,20,65,30,80") throw new Exception("Wrong termination order or missed child of a dead parent");
    if(round != 4) throw new Exception("Expected a final fresh snapshot");
  }
}
`);
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    "$ErrorActionPreference = 'Stop'; Add-Type ([Console]::In.ReadToEnd()); [WorkerTree]::Verify()"],
  { input: source, encoding: "utf8", timeout: 30_000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
