param([Parameter(Mandatory = $true)][int64]$Hwnd)

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WidgetWinApi {
    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
}
"@

$HWND_BOTTOM = [IntPtr]::new(1)
$SWP_NOSIZE = 0x0001
$SWP_NOMOVE = 0x0002
$SWP_NOACTIVATE = 0x0010

[WidgetWinApi]::SetWindowPos([IntPtr]::new($Hwnd), $HWND_BOTTOM, 0, 0, 0, 0, ($SWP_NOSIZE -bor $SWP_NOMOVE -bor $SWP_NOACTIVATE)) | Out-Null
