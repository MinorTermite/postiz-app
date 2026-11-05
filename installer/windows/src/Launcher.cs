// PostizRU.exe: tray icon that keeps the Docker stack running and opens the
// app window. "--background" (autostart) starts the stack without a window.
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace PostizRu
{
    public class TrayApp : ApplicationContext
    {
        private readonly NotifyIcon _icon;
        private readonly ToolStripMenuItem _autostart;
        private readonly SynchronizationContext _ui;
        private volatile bool _busy;

        public TrayApp(bool openWindow)
        {
            _ui = SynchronizationContext.Current ?? new WindowsFormsSynchronizationContext();
            var menu = new ContextMenuStrip();
            var open = new ToolStripMenuItem("Открыть Postiz RU", null, delegate { OpenWindow(); });
            open.Font = new Font(open.Font, FontStyle.Bold);
            menu.Items.Add(open);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Состояние сервисов", null, delegate { ShowStatus(); });
            menu.Items.Add("Перезапустить", null, delegate { Background(Restart); });
            menu.Items.Add("Остановить сервисы", null, delegate { Background(Stop); });
            menu.Items.Add("Журнал (последние строки)", null, delegate { Background(ShowLogs); });
            menu.Items.Add("Папка программы", null, delegate { Process.Start("explorer.exe", "\"" + Common.InstallDir + "\""); });
            _autostart = new ToolStripMenuItem("Запускать вместе с Windows", null, delegate
            {
                Common.SetAutostart(!Common.AutostartEnabled());
                _autostart.Checked = Common.AutostartEnabled();
            });
            _autostart.Checked = Common.AutostartEnabled();
            menu.Items.Add(_autostart);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Выход (сервисы продолжат работу)", null, delegate { Quit(); });

            _icon = new NotifyIcon();
            _icon.Icon = LoadIcon();
            _icon.Text = Common.AppName;
            _icon.ContextMenuStrip = menu;
            _icon.Visible = true;
            _icon.DoubleClick += delegate { OpenWindow(); };

            Background(delegate { StartStack(openWindow); });
        }

        private static Icon LoadIcon()
        {
            try
            {
                string ico = Path.Combine(Common.InstallDir, "postiz-ru.ico");
                if (File.Exists(ico)) return new Icon(ico);
                return Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            }
            catch { return SystemIcons.Application; }
        }

        private void Notify(string text, ToolTipIcon kind)
        {
            _ui.Post(delegate
            {
                _icon.ShowBalloonTip(5000, Common.AppName, text, kind);
            }, null);
        }

        private void Background(ThreadStart work)
        {
            if (_busy)
            {
                Notify("Подождите, предыдущая операция ещё выполняется.", ToolTipIcon.Info);
                return;
            }
            _busy = true;
            var t = new Thread(delegate()
            {
                try { work(); }
                catch (Exception ex) { Notify(ex.Message, ToolTipIcon.Error); }
                finally { _busy = false; }
            });
            t.IsBackground = true;
            t.Start();
        }

        private bool Up()
        {
            if (!Common.EnsureDockerRunning(null, 240))
            {
                Notify("Docker Desktop не запущен. Запустите его и повторите.", ToolTipIcon.Error);
                return false;
            }
            if (Common.Docker("compose up -d", null, 600000) != 0)
            {
                Notify("Не удалось запустить сервисы. Меню -> Журнал.", ToolTipIcon.Error);
                return false;
            }
            return true;
        }

        private void StartStack(bool openWindow)
        {
            string url = Common.AppUrl();
            if (Common.HttpOk(url + "/auth"))
            {
                if (openWindow) Common.OpenAppWindow(url);
                return;
            }
            Notify("Запускаю сервисы...", ToolTipIcon.Info);
            if (!Up()) return;
            if (!Common.WaitHttp(url, 300, null))
            {
                Notify("Сервис не ответил за 5 минут. Меню -> Журнал.", ToolTipIcon.Warning);
                return;
            }
            Notify("Postiz RU работает: " + url, ToolTipIcon.Info);
            if (openWindow) Common.OpenAppWindow(url);
        }

        private void OpenWindow()
        {
            string url = Common.AppUrl();
            if (Common.HttpOk(url + "/auth")) Common.OpenAppWindow(url);
            else Background(delegate { StartStack(true); });
        }

        private void Restart()
        {
            Notify("Перезапуск...", ToolTipIcon.Info);
            Common.Docker("compose restart", null, 300000);
            if (Common.WaitHttp(Common.AppUrl(), 300, null)) Notify("Перезапущено.", ToolTipIcon.Info);
            else Notify("После перезапуска сервис не ответил.", ToolTipIcon.Warning);
        }

        private void Stop()
        {
            Common.Docker("compose stop", null, 300000);
            Notify("Сервисы остановлены. Данные сохранены.", ToolTipIcon.Info);
        }

        private void ShowStatus()
        {
            StringBuilder output;
            Common.Run(Common.DockerExe(), "compose ps --format \"table {{.Service}}\t{{.State}}\t{{.Status}}\"",
                Common.InstallDir, null, 30000, out output);
            MessageBox.Show(output.Length > 0 ? output.ToString() : "Docker не отвечает.",
                Common.AppName + " - " + Common.AppUrl(), MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        private void ShowLogs()
        {
            StringBuilder output;
            Common.Run(Common.DockerExe(), "compose logs --no-color --tail 300", Common.InstallDir, null, 60000, out output);
            string file = Path.Combine(Path.GetTempPath(), "postiz-ru-log.txt");
            File.WriteAllText(file, output.ToString(), new UTF8Encoding(false));
            Process.Start("notepad.exe", "\"" + file + "\"");
        }

        private void Quit()
        {
            _icon.Visible = false;
            _icon.Dispose();
            ExitThread();
        }
    }

    public static class LauncherProgram
    {
        [STAThread]
        public static void Main(string[] args)
        {
            bool background = Array.IndexOf(args, "--background") >= 0;
            bool created;
            using (var mutex = new Mutex(true, @"Local\PostizRU.Tray", out created))
            {
                if (!created)
                {
                    // already in the tray: just bring the app up
                    if (!background) Common.OpenAppWindow(Common.AppUrl());
                    return;
                }
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new TrayApp(!background));
            }
        }
    }
}
