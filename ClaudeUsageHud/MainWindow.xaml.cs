using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Threading;
using Microsoft.Win32;
using WF = System.Windows.Forms;

namespace ClaudeUsageHud;

public partial class MainWindow : Window
{
    private const int WIDTH = 300;
    private const int HEIGHT = 150;
    private const int EDGE_MARGIN = 16;

    private static readonly string StatePath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".claude", "usage-widget", "state.json");

    private static readonly string PositionPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ClaudeUsageHud", "position.json");

    private const string RunRegistryKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string RunValueName = "ClaudeUsageHud";

    private FileSystemWatcher? _watcher;
    private DispatcherTimer? _pollTimer;
    private DispatcherTimer? _tickTimer;
    private DispatcherTimer? _debounceTimer;
    private WF.NotifyIcon? _trayIcon;
    private UsageState? _latestState;
    private bool _clickThrough;
    private bool _hasRenderedOnce;

    public MainWindow()
    {
        InitializeComponent();
        Loaded += MainWindow_Loaded;
    }

    private void MainWindow_Loaded(object sender, RoutedEventArgs e)
    {
        PositionWindow();
        ApplyNonActivatingStyle();
        PinToBottom();
        CreateTrayIcon();
        EnsureAutostart();
        StartWatching();
        RefreshState();

        _tickTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
        _tickTimer.Tick += (_, _) => Tick();
        _tickTimer.Start();

        LocationChanged += (_, _) => DebouncedSave();
    }

    // ---------- Positioning ----------

    private void PositionWindow()
    {
        var saved = LoadSavedPosition();
        if (saved is { } p)
        {
            var (x, y) = ClampToWorkArea(p.X, p.Y);
            Left = x;
            Top = y;
        }
        else
        {
            var (x, y) = DefaultTopRight();
            Left = x;
            Top = y;
        }
    }

    private static (double X, double Y) DefaultTopRight()
    {
        var wa = SystemParameters.WorkArea;
        return (wa.Right - WIDTH - EDGE_MARGIN, wa.Top + EDGE_MARGIN);
    }

    private static (double X, double Y) ClampToWorkArea(double x, double y)
    {
        var wa = SystemParameters.WorkArea;
        var maxX = wa.Right - WIDTH;
        var maxY = wa.Bottom - HEIGHT;
        return (Math.Min(Math.Max(x, wa.Left), maxX), Math.Min(Math.Max(y, wa.Top), maxY));
    }

    private record SavedPosition(double X, double Y);

    private static SavedPosition? LoadSavedPosition()
    {
        try
        {
            if (!File.Exists(PositionPath)) return null;
            var json = File.ReadAllText(PositionPath);
            return JsonSerializer.Deserialize<SavedPosition>(json);
        }
        catch { return null; }
    }

    private void DebouncedSave()
    {
        _debounceTimer?.Stop();
        _debounceTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(300) };
        _debounceTimer.Tick += (_, _) =>
        {
            _debounceTimer!.Stop();
            SavePosition(Left, Top);
            PinToBottom();
        };
        _debounceTimer.Start();
    }

    private static void SavePosition(double x, double y)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(PositionPath)!);
            File.WriteAllText(PositionPath, JsonSerializer.Serialize(new SavedPosition(x, y)));
        }
        catch { /* best-effort */ }
    }

    private void ResetPosition()
    {
        var (x, y) = DefaultTopRight();
        Left = x;
        Top = y;
        SavePosition(x, y);
    }

    // ---------- Dragging ----------

    private void Card_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (_clickThrough) return;
        try { DragMove(); } catch { /* ignore if not in a valid drag state */ }
    }

    // ---------- Win32 z-order / style ----------

    private void ApplyNonActivatingStyle()
    {
        var hwnd = new WindowInteropHelper(this).Handle;
        int exStyle = NativeMethods.GetWindowLong(hwnd, NativeMethods.GWL_EXSTYLE);
        exStyle |= NativeMethods.WS_EX_NOACTIVATE | NativeMethods.WS_EX_LAYERED;
        NativeMethods.SetWindowLong(hwnd, NativeMethods.GWL_EXSTYLE, exStyle);
    }

    private void PinToBottom()
    {
        var hwnd = new WindowInteropHelper(this).Handle;
        var progman = NativeMethods.FindWindow("Progman", "Program Manager");
        var insertAfter = progman != IntPtr.Zero ? progman : NativeMethods.HWND_BOTTOM;
        NativeMethods.SetWindowPos(hwnd, insertAfter, 0, 0, 0, 0,
            NativeMethods.SWP_NOSIZE | NativeMethods.SWP_NOMOVE | NativeMethods.SWP_NOACTIVATE);
    }

    private void SetClickThrough(bool enabled)
    {
        _clickThrough = enabled;
        var hwnd = new WindowInteropHelper(this).Handle;
        int exStyle = NativeMethods.GetWindowLong(hwnd, NativeMethods.GWL_EXSTYLE);
        exStyle = enabled ? (exStyle | NativeMethods.WS_EX_TRANSPARENT) : (exStyle & ~NativeMethods.WS_EX_TRANSPARENT);
        NativeMethods.SetWindowLong(hwnd, NativeMethods.GWL_EXSTYLE, exStyle);
    }

    // ---------- Autostart ----------

    private static void EnsureAutostart()
    {
        try
        {
            var expected = $"\"{Environment.ProcessPath}\"";
            using var key = Registry.CurrentUser.OpenSubKey(RunRegistryKey, writable: false);
            var current = key?.GetValue(RunValueName) as string;
            if (current != expected)
            {
                SetAutostart(true);
            }
        }
        catch { /* best-effort */ }
    }

    private static bool IsAutostartEnabled()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RunRegistryKey, writable: false);
            return key?.GetValue(RunValueName) != null;
        }
        catch { return false; }
    }

    private static void SetAutostart(bool enabled)
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RunRegistryKey, writable: true)
                ?? Registry.CurrentUser.CreateSubKey(RunRegistryKey);
            if (enabled)
            {
                var exePath = Environment.ProcessPath;
                if (exePath != null) key.SetValue(RunValueName, $"\"{exePath}\"");
            }
            else
            {
                key.DeleteValue(RunValueName, throwOnMissingValue: false);
            }
        }
        catch { /* best-effort */ }
    }

    // ---------- Tray ----------

    private void CreateTrayIcon()
    {
        _trayIcon = new WF.NotifyIcon
        {
            Icon = System.Drawing.SystemIcons.Application,
            Visible = true,
            Text = "Claude Usage HUD"
        };

        var menu = new WF.ContextMenuStrip();

        var resetItem = new WF.ToolStripMenuItem("Reset position");
        resetItem.Click += (_, _) => ResetPosition();
        menu.Items.Add(resetItem);

        var clickThroughItem = new WF.ToolStripMenuItem("Click-through") { CheckOnClick = true, Checked = _clickThrough };
        clickThroughItem.Click += (_, _) => SetClickThrough(clickThroughItem.Checked);
        menu.Items.Add(clickThroughItem);

        var loginItem = new WF.ToolStripMenuItem("Launch at login") { CheckOnClick = true, Checked = IsAutostartEnabled() };
        loginItem.Click += (_, _) => SetAutostart(loginItem.Checked);
        menu.Items.Add(loginItem);

        menu.Items.Add(new WF.ToolStripSeparator());

        var quitItem = new WF.ToolStripMenuItem("Quit");
        quitItem.Click += (_, _) => System.Windows.Application.Current.Shutdown();
        menu.Items.Add(quitItem);

        _trayIcon.ContextMenuStrip = menu;
    }

    // ---------- State watching ----------

    private void StartWatching()
    {
        try
        {
            var dir = Path.GetDirectoryName(StatePath)!;
            Directory.CreateDirectory(dir);
            _watcher = new FileSystemWatcher(dir, Path.GetFileName(StatePath))
            {
                NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.CreationTime | NotifyFilters.Size
            };
            _watcher.Changed += (_, _) => Dispatcher.BeginInvoke(RefreshState);
            _watcher.Created += (_, _) => Dispatcher.BeginInvoke(RefreshState);
            _watcher.EnableRaisingEvents = true;
        }
        catch { /* fs watch can fail; polling fallback below still covers us */ }

        _pollTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(2) };
        _pollTimer.Tick += (_, _) => RefreshState();
        _pollTimer.Start();
    }

    private void RefreshState()
    {
        var newState = ReadState();
        var changed = !_hasRenderedOnce
            || newState?.CapturedAt != _latestState?.CapturedAt
            || (newState is null) != (_latestState is null);
        _latestState = newState;
        if (changed)
        {
            _hasRenderedOnce = true;
            RenderFull();
        }
    }

    private static UsageState? ReadState()
    {
        try
        {
            var raw = File.ReadAllText(StatePath);
            if (raw.Length > 0 && raw[0] == '\uFEFF') raw = raw[1..];
            return JsonSerializer.Deserialize<UsageState>(raw);
        }
        catch { return null; }
    }

    // ---------- Rendering ----------

    private static readonly BrushConverter Bc = new();
    private static System.Windows.Media.Brush Col(string hex) => (System.Windows.Media.Brush)Bc.ConvertFrom(hex)!;

    private static System.Windows.Media.Brush ColorForPct(double? pct)
    {
        if (pct is null) return Col("#26FFFFFF");
        if (pct < 50) return Col("#4ADE80");
        if (pct < 80) return Col("#FBBF24");
        return Col("#F87171");
    }

    private static string? FormatCountdown(long? resetsAtEpochSeconds)
    {
        if (resetsAtEpochSeconds is not long epoch) return null;
        var diff = DateTimeOffset.FromUnixTimeSeconds(epoch) - DateTimeOffset.UtcNow;
        if (diff.TotalSeconds <= 0) return "now";
        var totalMinutes = (int)diff.TotalMinutes;
        var h = totalMinutes / 60;
        var m = totalMinutes % 60;
        return h > 0 ? $"{h}h {m}m" : $"{m}m";
    }

    private static (bool Live, string Text) FormatAge(long? capturedAt)
    {
        if (capturedAt is not long epoch) return (false, "");
        var diff = DateTimeOffset.UtcNow - DateTimeOffset.FromUnixTimeSeconds(epoch);
        var seconds = (int)diff.TotalSeconds;
        if (seconds < 60) return (true, "live");
        var minutes = seconds / 60;
        if (minutes < 60) return (false, $"updated {minutes}m ago");
        var hours = minutes / 60;
        return (false, $"updated {hours}h ago");
    }

    // Called when new data arrives (file change / poll): the only place that touches
    // bar widths, colors, and animations - comparatively expensive, so it must not run every tick.
    private void RenderFull()
    {
        if (_latestState is null)
        {
            ShowEmptyState("No data yet — waiting for Claude Code to run in this session.");
            return;
        }

        var state = _latestState;

        if (state.RateLimits is null)
        {
            ShowEmptyState("Session limits unavailable. This appears to be an API-key session, not a Pro/Max subscription.");
            return;
        }

        QuotaBlocks.Visibility = Visibility.Visible;
        EmptyStateText.Visibility = Visibility.Collapsed;

        RenderBlock(SessionPctText, SessionTrack, SessionFill, state.RateLimits.FiveHour);
        RenderBlock(WeeklyPctText, WeeklyTrack, WeeklyFill, state.RateLimits.SevenDay);

        Tick();
    }

    // Called every second: cheap string formatting only - countdowns and staleness age.
    // Must not touch bar widths/colors/brushes, or it defeats the point of splitting this out.
    private void Tick()
    {
        if (_latestState is not { RateLimits: not null } state) return;

        SessionSubText.Text = FormatSubLabel(state.RateLimits.FiveHour);
        WeeklySubText.Text = FormatSubLabel(state.RateLimits.SevenDay);

        var (live, text) = FormatAge(state.CapturedAt);
        StatusDot.Fill = live ? Col("#4ADE80") : Col("#40FFFFFF");
        StatusText.Text = text;
    }

    private static string FormatSubLabel(RateLimitInfo? quota)
    {
        if (quota?.UsedPercentage is null) return " ";
        var countdown = FormatCountdown(quota.ResetsAt);
        return countdown != null ? $"resets in {countdown}" : " ";
    }

    private void RenderBlock(TextBlock pctText, Border track, Border fill, RateLimitInfo? quota)
    {
        if (quota?.UsedPercentage is not double pctRaw)
        {
            pctText.Text = "--";
            pctText.Foreground = Col("#4DFFFFFF");
            fill.BeginAnimation(WidthProperty, new DoubleAnimation(0, TimeSpan.FromMilliseconds(300)));
            fill.Background = ColorForPct(null);
            return;
        }

        var pct = Math.Round(pctRaw);
        pctText.Text = $"{pct}%";
        pctText.Foreground = Col("#EBFFFFFF");

        var trackWidth = track.ActualWidth > 0 ? track.ActualWidth : 272;
        var targetWidth = trackWidth * Math.Min(Math.Max(pct, 0), 100) / 100.0;
        fill.BeginAnimation(WidthProperty, new DoubleAnimation(targetWidth, TimeSpan.FromMilliseconds(300)));
        fill.Background = ColorForPct(pct);
    }

    private void ShowEmptyState(string message)
    {
        QuotaBlocks.Visibility = Visibility.Collapsed;
        EmptyStateText.Visibility = Visibility.Visible;
        EmptyStateText.Text = message;
        StatusDot.Fill = Col("#40FFFFFF");
        StatusText.Text = "";
    }

    protected override void OnClosed(EventArgs e)
    {
        _watcher?.Dispose();
        _pollTimer?.Stop();
        _tickTimer?.Stop();
        _debounceTimer?.Stop();
        _trayIcon?.Dispose();
        base.OnClosed(e);
    }
}
