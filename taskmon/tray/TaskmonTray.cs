using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace TaskmonTray
{
    /// <summary>
    /// taskmon 轻量托盘：常驻约 20 MB，只负责「打开面板 / 开机自启 / 退出」。
    /// GUI 窗口（taskmon.exe）按需启动，关窗即整体退出，不在后台保留 Chromium 进程。
    /// </summary>
    internal static class Program
    {
        private const string RunKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
        private const string RunValueName = "taskmon-tray";

        [STAThread]
        private static void Main()
        {
            var created = false;
            using (var mutex = new Mutex(true, "taskmon-tray-singleton", out created))
            {
                if (!created) return;

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);

                var dir = AppDomain.CurrentDomain.BaseDirectory;
                var gui = Environment.GetEnvironmentVariable("TASKMON_GUI");
                if (string.IsNullOrEmpty(gui)) gui = Path.Combine(dir, "taskmon.exe");
                var guiArgs = Environment.GetEnvironmentVariable("TASKMON_GUI_ARGS") ?? "";
                var iconPath = Path.Combine(dir, "icon.ico");

                using (var notify = new NotifyIcon())
                {
                    notify.Icon = File.Exists(iconPath) ? new Icon(iconPath) : SystemIcons.Application;
                    notify.Text = "taskmon";
                    notify.Visible = true;

                    var menu = new ContextMenuStrip();
                    menu.Items.Add("打开面板", null, (s, e) => LaunchGui(gui, guiArgs));
                    menu.Items.Add(new ToolStripSeparator());

                    var autoStart = new ToolStripMenuItem("开机自启")
                    {
                        CheckOnClick = true,
#if RELEASE
                        Enabled = true,
#else
                        Enabled = false,
#endif
                        Checked = IsAutoStartEnabled(),
                    };
#if RELEASE
                    autoStart.Click += (s, e) => SetAutoStart(autoStart.Checked);
#endif
                    menu.Items.Add(autoStart);
                    menu.Items.Add(new ToolStripSeparator());
                    menu.Items.Add("退出", null, (s, e) =>
                    {
                        notify.Visible = false;
                        Application.Exit();
                    });

                    notify.ContextMenuStrip = menu;
                    notify.MouseClick += (s, e) =>
                    {
                        if (e.Button == MouseButtons.Left) LaunchGui(gui, guiArgs);
                    };
                    notify.DoubleClick += (s, e) => LaunchGui(gui, guiArgs);

                    Application.Run();
                    notify.Visible = false;
                }
            }
        }

        private static void LaunchGui(string gui, string guiArgs)
        {
            if (!File.Exists(gui)) return;
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = gui,
                    Arguments = guiArgs,
                    WorkingDirectory = Path.GetDirectoryName(gui),
                    UseShellExecute = true,
                });
            }
            catch
            {
                // 启动失败不弹窗：托盘保持可用，用户可重试
            }
        }

        private static bool IsAutoStartEnabled()
        {
            try
            {
                using (var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, false))
                {
                    return key != null && key.GetValue(RunValueName) != null;
                }
            }
            catch
            {
                return false;
            }
        }

        private static void SetAutoStart(bool enabled)
        {
            try
            {
                using (var key = Registry.CurrentUser.CreateSubKey(RunKeyPath))
                {
                    if (key == null) return;
                    if (enabled)
                    {
                        key.SetValue(RunValueName, "\"" + Application.ExecutablePath + "\"");
                    }
                    else
                    {
                        key.DeleteValue(RunValueName, false);
                    }
                }
            }
            catch
            {
                // 注册表不可写时静默失败，不阻塞托盘退出
            }
        }
    }
}
