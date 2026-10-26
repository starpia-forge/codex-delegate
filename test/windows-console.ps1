# Real console events, not process.kill's forced Windows termination.
param([string]$Mode, [string]$Request, [int]$ProcessId)
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.IO;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class TestConsole {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  struct Startup {
    public int cb; public string reserved, desktop, title;
    public int x,y,width,height,charsX,charsY,fill,flags;
    public short show, reservedSize; public IntPtr reservedPtr,input,output,error;
  }
  [StructLayout(LayoutKind.Sequential)]
  struct Info { public IntPtr process, thread; public int pid, tid; }
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern bool CreateProcess(string app, System.Text.StringBuilder command, IntPtr pa, IntPtr ta, bool inherit, int flags, IntPtr env, string cwd, ref Startup startup, out Info info);
  [DllImport("kernel32.dll")] static extern bool SetHandleInformation(IntPtr h, int mask, int flags);
  [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr h, uint timeout);
  [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr h, out int code);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll")] static extern bool FreeConsole();
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool AttachConsole(int pid);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GenerateConsoleCtrlEvent(int type, int group);
  public static int Run(string app, string command, string cwd, string output, string error, string pidFile) {
    using(var stdout = File.Create(output)) using(var stderr = File.Create(error)) {
      var si = new Startup(); si.cb = Marshal.SizeOf(si); si.flags = 0x101; si.show = 0;
      si.output = stdout.SafeFileHandle.DangerousGetHandle(); si.error = stderr.SafeFileHandle.DangerousGetHandle();
      SetHandleInformation(si.output, 1, 1); SetHandleInformation(si.error, 1, 1);
      Info info;
      // CREATE_NEW_CONSOLE | CREATE_NEW_PROCESS_GROUP, with its window hidden.
      if(!CreateProcess(app, new System.Text.StringBuilder(command), IntPtr.Zero, IntPtr.Zero, true, 0x210, IntPtr.Zero, cwd, ref si, out info)) throw new Win32Exception();
      File.WriteAllText(pidFile, info.pid.ToString());
      if(WaitForSingleObject(info.process, 30000) != 0) throw new Exception("Runner did not exit");
      int code; GetExitCodeProcess(info.process, out code);
      CloseHandle(info.process); CloseHandle(info.thread); return code;
    }
  }
  public static void Break(int pid) {
    FreeConsole();
    if(!AttachConsole(pid)) throw new Win32Exception();
    if(!GenerateConsoleCtrlEvent(1, pid)) throw new Win32Exception();
    FreeConsole();
  }
}
'@
if ($Mode -eq 'start') {
  $config = Get-Content -LiteralPath $Request -Raw | ConvertFrom-Json
  exit [TestConsole]::Run($config.app, $config.command, $config.cwd, $config.stdout, $config.stderr, $config.pidFile)
} elseif ($Mode -eq 'break') {
  [TestConsole]::Break($ProcessId)
} else { throw "Unknown mode: $Mode" }
