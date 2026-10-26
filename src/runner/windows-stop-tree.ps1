# taskkill depends on services unavailable in some restricted Windows sessions.
# Fall back to the process snapshot API, operating only on the worker's tree.
param([int]$RootProcessId)
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class WorkerTree {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  struct Entry {
    public uint size,usage,pid; public UIntPtr heap; public uint module,threads,parent;
    public int priority; public uint flags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=260)] public string exe;
  }
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool Process32First(IntPtr snapshot, ref Entry entry);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool Process32Next(IntPtr snapshot, ref Entry entry);
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint rights, bool inherit, uint pid);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateProcess(IntPtr process, uint code);
  [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr process, uint timeout);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetProcessTimes(IntPtr process, out long creation, out long exit, out long kernel, out long user);
  sealed class Member {
    public long creation, exit;
    public bool dead, timesKnown;
  }
  public static void Stop(uint root) {
    // Keep dead ancestors as roots: a child created after a snapshot still
    // names its original parent in the next snapshot, even after that parent dies.
    var known = new Dictionary<uint,Member>(); known.Add(root, new Member());
    for(int round = 0; round < 16; round++) {
      var children = Snapshot();
      var seen = new HashSet<uint>();
      bool stopped = false;
      foreach(var pid in new List<uint>(known.Keys))
        stopped |= Stop(pid, null, children, seen, known);
      if(!stopped) return; // A fresh snapshot found no live members of the tree.
    }
    throw new Exception("Worker tree did not stop within 16 snapshots");
  }
  static Dictionary<uint,List<uint>> Snapshot() {
    var children = new Dictionary<uint,List<uint>>();
    var snapshot = CreateToolhelp32Snapshot(2, 0);
    if(snapshot == new IntPtr(-1)) throw new Win32Exception();
    try {
      var entry = new Entry(); entry.size = (uint)Marshal.SizeOf(entry);
      if(!Process32First(snapshot, ref entry)) throw new Win32Exception();
      do {
        if(!children.ContainsKey(entry.parent)) children[entry.parent] = new List<uint>();
        children[entry.parent].Add(entry.pid);
      } while(Process32Next(snapshot, ref entry));
    } finally { CloseHandle(snapshot); }
    return children;
  }
  static bool Stop(uint pid, Member parent, Dictionary<uint,List<uint>> children, HashSet<uint> seen, Dictionary<uint,Member> known) {
    if(parent != null && !parent.timesKnown) return false;
    if(!seen.Add(pid)) return false;
    Member member;
    if(!known.TryGetValue(pid, out member)) member = new Member();
    bool stopped = false;
    // A dead PID is only a traversal key. Never reopen it: it may be reused.
    if(!member.dead) {
      var process = OpenProcess(0x101001, false, pid); // synchronize, terminate, query limited information
      if(process == IntPtr.Zero) {
        int error = Marshal.GetLastWin32Error();
        if(error != 87) throw new Win32Exception(error);
        member.dead = true;
      } else {
        try {
          long creation, exit, kernel, user;
          if(!GetProcessTimes(process, out creation, out exit, out kernel, out user)) {
            int error = Marshal.GetLastWin32Error();
            if(WaitForSingleObject(process, 0) == 0 || error == 87) {
              member.dead = true;
              known[pid] = member;
              return false;
            }
            throw new Win32Exception(error);
          }
          // Snapshot parent IDs outlive their owners. Check both ends of the
          // parent's lifetime before accepting a newly discovered child.
          if(parent != null && (creation < parent.creation
              || (parent.dead && creation >= parent.exit))) return false;
          bool running = WaitForSingleObject(process, 0) != 0;
          member.creation = creation;
          // An exited child with readable times is still a safe traversal key.
          // Stop the parent first to prevent it creating more children during cleanup.
          if(running) {
            if(!TerminateProcess(process, 1)) {
              int error = Marshal.GetLastWin32Error();
              if(WaitForSingleObject(process, 0) != 0) throw new Win32Exception(error);
            } else stopped = true;
          }
          if(WaitForSingleObject(process, 10000) != 0) throw new Exception("Worker did not stop");
          if(!GetProcessTimes(process, out creation, out exit, out kernel, out user)) throw new Win32Exception();
          member.exit = exit;
          member.timesKnown = true;
          member.dead = true;
        } finally { CloseHandle(process); }
      }
      known[pid] = member;
    }
    if(children.ContainsKey(pid)) foreach(var child in children[pid]) stopped |= Stop(child, member, children, seen, known);
    return stopped;
  }
}
'@
[WorkerTree]::Stop($RootProcessId)
