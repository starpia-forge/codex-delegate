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
  public static void Stop(uint root) {
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
    Stop(root, children, new HashSet<uint>());
  }
  static void Stop(uint pid, Dictionary<uint,List<uint>> children, HashSet<uint> seen) {
    if(!seen.Add(pid)) return;
    // Stop the parent first to prevent it creating more children during cleanup.
    var process = OpenProcess(0x100001, false, pid);
    if(process == IntPtr.Zero) {
      if(Marshal.GetLastWin32Error() != 87) throw new Win32Exception();
    } else {
      try {
        if(WaitForSingleObject(process, 0) != 0 && !TerminateProcess(process, 1)) throw new Win32Exception();
        if(WaitForSingleObject(process, 10000) != 0) throw new Exception("Worker did not stop");
      } finally { CloseHandle(process); }
    }
    if(children.ContainsKey(pid)) foreach(var child in children[pid]) Stop(child, children, seen);
  }
}
'@
[WorkerTree]::Stop($RootProcessId)
