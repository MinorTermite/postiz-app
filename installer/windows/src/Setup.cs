// Setup.exe: installs Postiz RU for the current user (no admin rights),
// "--uninstall" removes it. Payload is read from .\payload next to Setup.exe.
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace PostizRu
{
    public class SetupForm : Form
    {
        private readonly TextBox _log;
        private readonly ProgressBar _progress;
        private readonly Button _install;
        private readonly Button _close;
        private readonly CheckBox _desktop;
        private readonly CheckBox _autostart;
        private readonly CheckBox _open;
        private readonly string _payload;
        private readonly bool _silent;
        private readonly string _silentLog = Path.Combine(Path.GetTempPath(), "postiz-ru-setup.log");

        public SetupForm() : this(false) { }

        public SetupForm(bool silent)
        {
            _silent = silent;
            _payload = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "payload");
            Text = "Установка " + Common.AppName;
            Width = 720;
            Height = 520;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }

            var title = new Label();
            title.Text = Common.AppName + " - планировщик публикаций для VK, MAX, OK, Rutube, Telegram, YouTube и других сетей";
            title.Font = new Font(Font.FontFamily, 10, FontStyle.Bold);
            title.SetBounds(16, 12, 680, 40);
            Controls.Add(title);

            var info = new Label();
            info.Text = "Папка: " + Common.InstallDir + "\r\nНужен Docker Desktop (будет предложено установить). Адрес программы: http://localhost:4007";
            info.SetBounds(16, 54, 680, 36);
            Controls.Add(info);

            _desktop = MakeCheck("Ярлык на рабочем столе", 16, 94, true);
            _autostart = MakeCheck("Запускать вместе с Windows", 220, 94, true);
            _open = MakeCheck("Открыть после установки", 450, 94, true);

            _log = new TextBox();
            _log.Multiline = true;
            _log.ReadOnly = true;
            _log.ScrollBars = ScrollBars.Vertical;
            _log.Font = new Font("Consolas", 9);
            _log.SetBounds(16, 124, 672, 280);
            Controls.Add(_log);

            _progress = new ProgressBar();
            _progress.SetBounds(16, 414, 672, 14);
            _progress.Style = ProgressBarStyle.Continuous;
            Controls.Add(_progress);

            _install = new Button();
            _install.Text = "Установить";
            _install.SetBounds(476, 440, 100, 30);
            _install.Click += delegate { StartInstall(); };
            Controls.Add(_install);

            _close = new Button();
            _close.Text = "Закрыть";
            _close.SetBounds(588, 440, 100, 30);
            _close.Click += delegate { Close(); };
            Controls.Add(_close);

            if (!Directory.Exists(_payload))
            {
                Log("Не найдена папка payload рядом с Setup.exe: " + _payload);
                _install.Enabled = false;
            }
            else if (File.Exists(Path.Combine(Common.InstallDir, ".env")))
            {
                Log("Найдена прежняя установка: она будет обновлена, данные и ключи сохранятся.");
                _install.Text = "Обновить";
            }
        }

        private CheckBox MakeCheck(string text, int x, int y, bool on)
        {
            var c = new CheckBox();
            c.Text = text;
            c.Checked = on;
            c.SetBounds(x, y, 220, 24);
            Controls.Add(c);
            return c;
        }

        private void Log(string line)
        {
            if (_silent)
            {
                File.AppendAllText(_silentLog, DateTime.Now.ToString("HH:mm:ss") + "  " + line + "\r\n", new UTF8Encoding(false));
                return;
            }
            if (InvokeRequired)
            {
                BeginInvoke(new Action<string>(Log), line);
                return;
            }
            _log.AppendText(DateTime.Now.ToString("HH:mm:ss") + "  " + line + "\r\n");
        }

        private void Progress(int value)
        {
            if (_silent) return;
            if (InvokeRequired)
            {
                BeginInvoke(new Action<int>(Progress), value);
                return;
            }
            _progress.Value = Math.Max(0, Math.Min(100, value));
        }

        private void Finish(bool ok)
        {
            if (_silent) return;
            if (InvokeRequired)
            {
                BeginInvoke(new Action<bool>(Finish), ok);
                return;
            }
            _install.Enabled = !ok;
            _install.Text = ok ? "Готово" : "Повторить";
            _close.Enabled = true;
            if (ok) Progress(100);
        }

        private void StartInstall()
        {
            _install.Enabled = false;
            _close.Enabled = false;
            bool desktop = _desktop.Checked, autostart = _autostart.Checked, open = _open.Checked;
            var t = new Thread(delegate()
            {
                bool ok = false;
                try { ok = Install(desktop, autostart, open); }
                catch (Exception ex) { Log("Ошибка: " + ex.Message); }
                Finish(ok);
            });
            t.IsBackground = true;
            t.Start();
        }

        private bool Install(bool desktop, bool autostart, bool open)
        {
            Progress(3);
            if (!Common.DockerCliExists())
            {
                if (!InstallDocker()) return false;
                if (!Common.DockerCliExists())
                {
                    Log("Docker установлен. Перезагрузите компьютер, если установщик Docker попросил, и запустите Setup.exe снова.");
                    return false;
                }
            }
            Log("Docker найден.");
            Progress(10);
            if (!Common.EnsureDockerRunning(Log, 300))
            {
                Log("Docker Desktop не запустился. Откройте его вручную (при первом запуске примите условия) и нажмите «Повторить».");
                return false;
            }
            Progress(18);

            string dir = Common.InstallDir;
            Directory.CreateDirectory(dir);
            Log("Копирую файлы в " + dir);
            CopyPayload(_payload, dir);
            CopySelf(dir);
            Progress(25);

            string envPath = Path.Combine(dir, ".env");
            string envBackup = Path.Combine(Path.GetDirectoryName(dir), Common.AppId + "-env-backup", ".env");
            if (!File.Exists(envPath) && File.Exists(envBackup))
            {
                File.Copy(envBackup, envPath);
                Log(".env восстановлен из прежней установки: данные будут доступны.");
            }
            else if (!File.Exists(envPath)) WriteEnv(dir);
            else Log(".env уже есть: ключи и пароли сохранены.");
            Progress(30);

            string image = Path.Combine(_payload, "postiz-ru-image.tar.gz");
            bool downloaded = false;
            if (!File.Exists(image))
            {
                image = Path.Combine(Path.GetTempPath(), "postiz-ru-image.tar.gz");
                if (!DownloadImage(ImageUrl, image)) return false;
                downloaded = true;
            }
            Log("Загружаю образ программы в Docker (несколько минут)...");
            int loaded = Common.Docker("load -i \"" + image + "\"", Log, 1800000);
            if (downloaded) try { File.Delete(image); } catch { }
            if (loaded != 0)
            {
                Log("Не удалось загрузить образ.");
                return false;
            }
            Progress(60);

            Log("Скачиваю служебные образы (Postgres, Redis, Temporal)...");
            if (Common.Docker("compose pull postiz-postgres postiz-redis temporal", Log, 1800000) != 0)
            {
                Log("Не удалось скачать образы. Проверьте интернет.");
                return false;
            }
            Progress(75);

            Log("Запускаю сервисы...");
            if (Common.Docker("compose up -d --remove-orphans", Log, 900000) != 0)
            {
                Log("docker compose up завершился с ошибкой.");
                return false;
            }
            Progress(85);

            string url = Common.AppUrl();
            if (!Common.WaitHttp(url, 420, Log))
            {
                Log("Сервис не ответил за 7 минут. Журнал: docker compose logs в папке " + dir);
                return false;
            }
            Progress(95);

            RegisterApp(dir, desktop, autostart);
            Log("Готово. Postiz RU работает: " + url);
            Log("Первый вход: зарегистрируйте аккаунт владельца. Затем в " + dir + "\\.env поставьте DISABLE_REGISTRATION=true и выберите в трее «Перезапустить».");
            Process.Start(Common.LauncherPath, open ? "" : "--background");
            return true;
        }

        // image of this release, used when the package has no bundled postiz-ru-image.tar.gz
        private const string ImageUrl =
            "https://github.com/MinorTermite/postiz-app/releases/download/v2.25.3-ru/postiz-ru-image.tar.gz";

        private bool DownloadImage(string url, string file)
        {
            Log("Скачиваю образ программы (около 1,6 ГБ): " + url);
            try
            {
                ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
                var req = (HttpWebRequest)WebRequest.Create(url);
                req.UserAgent = "PostizRU-Setup";
                req.Timeout = 60000;
                req.ReadWriteTimeout = 120000;
                using (var resp = (HttpWebResponse)req.GetResponse())
                using (var input = resp.GetResponseStream())
                using (var output = File.Create(file))
                {
                    long total = resp.ContentLength;
                    long done = 0;
                    long nextLog = 0;
                    var buffer = new byte[1 << 20];
                    int n;
                    while ((n = input.Read(buffer, 0, buffer.Length)) > 0)
                    {
                        output.Write(buffer, 0, n);
                        done += n;
                        if (total > 0) Progress(30 + (int)(25 * done / total));
                        if (done >= nextLog)
                        {
                            Log("Скачано " + (done >> 20) + " МБ" + (total > 0 ? " из " + (total >> 20) + " МБ" : ""));
                            nextLog += 100L << 20;
                        }
                    }
                }
                return true;
            }
            catch (Exception ex)
            {
                Log("Скачать образ не удалось: " + ex.Message + ". Проверьте интернет и запустите Setup.exe снова.");
                try { File.Delete(file); } catch { }
                return false;
            }
        }

        // Setup.exe --silent: defaults (shortcut, autostart, no window), log in %TEMP%\postiz-ru-setup.log
        public bool RunSilent()
        {
            if (!Directory.Exists(_payload)) { Log("payload not found: " + _payload); return false; }
            try { return Install(true, true, false); }
            catch (Exception ex) { Log("Ошибка: " + ex.Message); return false; }
        }

        private bool InstallDocker()
        {
            if (_silent)
            {
                Log("Docker Desktop не найден; в тихом режиме не устанавливается.");
                return false;
            }
            var answer = (DialogResult)Invoke(new Func<DialogResult>(delegate
            {
                return MessageBox.Show(this,
                    "Docker Desktop не найден. Он нужен для работы Postiz RU.\r\n\r\n" +
                    "Установить сейчас? Будет установлен Docker Desktop (около 600 МБ) с принятием его лицензии " +
                    "(бесплатно для личного использования и малого бизнеса). Потребуются права администратора и, возможно, перезагрузка.",
                    Common.AppName, MessageBoxButtons.YesNo, MessageBoxIcon.Question);
            }));
            if (answer != DialogResult.Yes)
            {
                Log("Установите Docker Desktop: https://www.docker.com/products/docker-desktop/ и запустите Setup.exe снова.");
                return false;
            }

            Log("Устанавливаю Docker Desktop через winget...");
            int code = Common.Run("winget",
                "install -e --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements",
                null, Log, 3600000);
            if (code == 0) return true;

            Log("winget недоступен или завершился с ошибкой, скачиваю установщик с docker.com...");
            string file = Path.Combine(Path.GetTempPath(), "DockerDesktopInstaller.exe");
            try
            {
                ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
                using (var wc = new WebClient())
                {
                    wc.DownloadFile("https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe", file);
                }
            }
            catch (Exception ex)
            {
                Log("Скачать не удалось: " + ex.Message);
                return false;
            }
            try
            {
                var psi = new ProcessStartInfo(file, "install --quiet --accept-license");
                psi.UseShellExecute = true;
                psi.Verb = "runas";
                using (var p = Process.Start(psi)) { p.WaitForExit(); code = p.ExitCode; }
            }
            catch (Exception ex)
            {
                Log("Установка Docker отменена: " + ex.Message);
                return false;
            }
            Log("Установщик Docker завершился с кодом " + code + ".");
            return code == 0;
        }

        private static void CopyPayload(string from, string to)
        {
            foreach (string file in Directory.GetFiles(from, "*", SearchOption.AllDirectories))
            {
                string rel = file.Substring(from.Length).TrimStart('\\');
                if (rel.EndsWith(".tar.gz", StringComparison.OrdinalIgnoreCase)) continue;
                string target = Path.Combine(to, rel);
                Directory.CreateDirectory(Path.GetDirectoryName(target));
                if (rel.Equals("PostizRU.exe", StringComparison.OrdinalIgnoreCase))
                {
                    foreach (var p in Process.GetProcessesByName("PostizRU"))
                    {
                        try { p.Kill(); p.WaitForExit(5000); } catch { }
                    }
                }
                File.Copy(file, target, true);
            }
        }

        private static void CopySelf(string dir)
        {
            string self = Application.ExecutablePath;
            string target = Path.Combine(dir, "Setup.exe");
            if (!string.Equals(Path.GetFullPath(self), Path.GetFullPath(target), StringComparison.OrdinalIgnoreCase))
                File.Copy(self, target, true);
        }

        private static string Secret(int bytes)
        {
            var b = new byte[bytes];
            using (var rng = RandomNumberGenerator.Create()) rng.GetBytes(b);
            return BitConverter.ToString(b).Replace("-", "").ToLowerInvariant();
        }

        private static string SetLine(string text, string key, string value)
        {
            var re = new Regex("(?m)^" + Regex.Escape(key) + "=.*$");
            string line = key + "=" + value;
            return re.IsMatch(text) ? re.Replace(text, line.Replace("$", "$$")) : text.TrimEnd() + "\n" + line + "\n";
        }

        private void WriteEnv(string dir)
        {
            string text = File.ReadAllText(Path.Combine(dir, ".env.example"), Encoding.UTF8).Replace("\r\n", "\n");
            int port = 4007;
            while (!Common.PortFree(port) && port < 4100) port++;
            string url = "http://localhost:" + port;
            text = SetLine(text, "POSTIZ_PORT", port.ToString());
            text = SetLine(text, "MAIN_URL", url);
            text = SetLine(text, "FRONTEND_URL", url);
            text = SetLine(text, "NEXT_PUBLIC_BACKEND_URL", url + "/api");
            text = SetLine(text, "JWT_SECRET", Secret(48));
            text = SetLine(text, "POSTGRES_PASSWORD", Secret(24));
            text = SetLine(text, "COMPOSE_PROJECT_NAME", Common.ProjectName);
            File.WriteAllText(Path.Combine(dir, ".env"), text, new UTF8Encoding(false));
            Log(".env создан, пароли сгенерированы. Порт: " + port);
        }

        private static string EnvValue(string dir, string key)
        {
            string v;
            return Common.ReadEnv(Path.Combine(dir, ".env")).TryGetValue(key, out v) ? v : "";
        }

        private static void Shortcut(string lnk, string target, string args, string icon)
        {
            Type t = Type.GetTypeFromProgID("WScript.Shell");
            dynamic shell = Activator.CreateInstance(t);
            dynamic sc = shell.CreateShortcut(lnk);
            sc.TargetPath = target;
            sc.Arguments = args;
            sc.WorkingDirectory = Path.GetDirectoryName(target);
            sc.IconLocation = icon;
            sc.Description = Common.AppName;
            sc.Save();
        }

        private void RegisterApp(string dir, bool desktop, bool autostart)
        {
            string icon = Path.Combine(dir, "postiz-ru.ico");
            string startMenu = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), Common.AppName);
            Directory.CreateDirectory(startMenu);
            Shortcut(Path.Combine(startMenu, Common.AppName + ".lnk"), Common.LauncherPath, "", icon);
            Shortcut(Path.Combine(startMenu, "Удалить " + Common.AppName + ".lnk"), Path.Combine(dir, "Setup.exe"), "--uninstall", icon);
            string desktopLnk = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), Common.AppName + ".lnk");
            if (desktop) Shortcut(desktopLnk, Common.LauncherPath, "", icon);
            Common.SetAutostart(autostart);

            using (var k = Registry.CurrentUser.CreateSubKey(Common.UninstallKey))
            {
                k.SetValue("DisplayName", Common.AppName);
                k.SetValue("DisplayVersion", "2.25.3-ru");
                k.SetValue("Publisher", Common.Publisher);
                k.SetValue("InstallLocation", dir);
                k.SetValue("DisplayIcon", icon);
                k.SetValue("UninstallString", "\"" + Path.Combine(dir, "Setup.exe") + "\" --uninstall");
                k.SetValue("NoModify", 1, RegistryValueKind.DWord);
                k.SetValue("NoRepair", 1, RegistryValueKind.DWord);
            }
            Log("Ярлыки, автозапуск и запись в «Приложения» созданы.");
        }
    }

    public static class Uninstaller
    {
        public static void Run()
        {
            string dir = Common.InstallDir;
            if (MessageBox.Show("Удалить " + Common.AppName + "?", Common.AppName,
                    MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
            bool wipe = MessageBox.Show(
                "Удалить также данные: аккаунт, подключённые каналы, посты и загруженные файлы?\r\n\r\n" +
                "«Нет» - данные останутся в Docker и вернутся при повторной установке.",
                Common.AppName, MessageBoxButtons.YesNo, MessageBoxIcon.Warning) == DialogResult.Yes;

            foreach (var p in Process.GetProcessesByName("PostizRU"))
            {
                try { p.Kill(); p.WaitForExit(5000); } catch { }
            }
            if (Common.DockerEngineUp() && File.Exists(Path.Combine(dir, "docker-compose.yml")))
            {
                Common.Docker(wipe ? "compose down -v" : "compose down", null, 600000);
                if (wipe) Common.Docker("image rm postiz-ru:latest", null, 120000);
            }

            Common.SetAutostart(false);
            Registry.CurrentUser.DeleteSubKeyTree(Common.UninstallKey, false);
            TryDelete(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), Common.AppName + ".lnk"));
            string startMenu = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), Common.AppName);
            try { if (Directory.Exists(startMenu)) Directory.Delete(startMenu, true); } catch { }

            // .env keeps the database password: without wiping data it is kept
            // so a reinstall can open the same volumes
            if (!wipe)
            {
                string keep = Path.Combine(Path.GetDirectoryName(dir), Common.AppId + "-env-backup");
                Directory.CreateDirectory(keep);
                try { File.Copy(Path.Combine(dir, ".env"), Path.Combine(keep, ".env"), true); } catch { }
            }

            // Setup.exe runs from the folder it deletes: finish with cmd after exit
            var psi = new ProcessStartInfo("cmd.exe",
                "/c ping -n 3 127.0.0.1 >nul & rmdir /s /q \"" + dir + "\"");
            psi.CreateNoWindow = true;
            psi.UseShellExecute = false;
            Process.Start(psi);
            MessageBox.Show(Common.AppName + " удалён." + (wipe ? "" : "\r\nДанные сохранены, ключи: " +
                Path.Combine(Path.GetDirectoryName(dir), Common.AppId + "-env-backup")),
                Common.AppName, MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        private static void TryDelete(string file)
        {
            try { if (File.Exists(file)) File.Delete(file); } catch { }
        }
    }

    public static class SetupProgram
    {
        [STAThread]
        public static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            if (Array.IndexOf(args, "--uninstall") >= 0)
            {
                Uninstaller.Run();
                return;
            }
            if (Array.IndexOf(args, "--silent") >= 0)
            {
                Environment.ExitCode = new SetupForm(true).RunSilent() ? 0 : 1;
                return;
            }
            Application.Run(new SetupForm());
        }
    }
}
