// Shared helpers of Setup.exe and PostizRU.exe (C# 5, .NET Framework 4.x csc).
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using Microsoft.Win32;

namespace PostizRu
{
    public static class Common
    {
        public const string AppName = "GravMix";
        public const string AppId = "PostizRU";
        public const string Publisher = "GravMix";
        public const string ProjectName = "postiz-ru";
        public const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
        public const string UninstallKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\PostizRU";

        public static string InstallDir
        {
            get
            {
                return Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    AppId);
            }
        }

        public static string LauncherPath
        {
            get { return Path.Combine(InstallDir, "PostizRU.exe"); }
        }

        public static string DockerExe()
        {
            string bundled = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                @"Docker\Docker\resources\bin\docker.exe");
            return File.Exists(bundled) ? bundled : "docker";
        }

        public static string DockerDesktopExe()
        {
            return Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                @"Docker\Docker\Docker Desktop.exe");
        }

        // Runs a console program hidden, streams its output lines to log,
        // returns the exit code (-1 when it could not start or timed out).
        public static int Run(string file, string args, string workDir, Action<string> log, int timeoutMs)
        {
            StringBuilder ignored;
            return Run(file, args, workDir, log, timeoutMs, out ignored);
        }

        public static int Run(string file, string args, string workDir, Action<string> log, int timeoutMs, out StringBuilder output)
        {
            var collected = new StringBuilder();
            output = collected;
            try
            {
                var psi = new ProcessStartInfo(file, args);
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                psi.RedirectStandardOutput = true;
                psi.RedirectStandardError = true;
                psi.StandardOutputEncoding = Encoding.UTF8;
                psi.StandardErrorEncoding = Encoding.UTF8;
                if (!string.IsNullOrEmpty(workDir)) psi.WorkingDirectory = workDir;
                using (var p = new Process())
                {
                    p.StartInfo = psi;
                    DataReceivedEventHandler h = delegate(object s, DataReceivedEventArgs e)
                    {
                        if (e.Data == null) return;
                        lock (collected) collected.AppendLine(e.Data);
                        if (log != null && e.Data.Trim().Length > 0) log(e.Data);
                    };
                    p.OutputDataReceived += h;
                    p.ErrorDataReceived += h;
                    p.Start();
                    p.BeginOutputReadLine();
                    p.BeginErrorReadLine();
                    if (!p.WaitForExit(timeoutMs))
                    {
                        try { p.Kill(); } catch { }
                        if (log != null) log("Timeout: " + file + " " + args);
                        return -1;
                    }
                    p.WaitForExit();
                    return p.ExitCode;
                }
            }
            catch (Exception ex)
            {
                if (log != null) log(ex.Message);
                return -1;
            }
        }

        public static int Docker(string args, Action<string> log, int timeoutMs)
        {
            return Run(DockerExe(), args, InstallDir, log, timeoutMs);
        }

        public static bool DockerCliExists()
        {
            return Run(DockerExe(), "--version", null, null, 30000) == 0;
        }

        public static bool DockerEngineUp()
        {
            return Run(DockerExe(), "info --format {{.ServerVersion}}", null, null, 30000) == 0;
        }

        public static bool EnsureDockerRunning(Action<string> log, int timeoutSec)
        {
            if (DockerEngineUp()) return true;
            string desktop = DockerDesktopExe();
            if (!File.Exists(desktop))
            {
                if (log != null) log("Docker Desktop не найден: " + desktop);
                return false;
            }
            if (log != null) log("Запускаю Docker Desktop...");
            try { Process.Start(desktop); } catch (Exception ex) { if (log != null) log(ex.Message); }
            DateTime until = DateTime.Now.AddSeconds(timeoutSec);
            while (DateTime.Now < until)
            {
                Thread.Sleep(4000);
                if (DockerEngineUp())
                {
                    if (log != null) log("Docker запущен.");
                    return true;
                }
            }
            if (log != null) log("Docker не ответил за " + timeoutSec + " с.");
            return false;
        }

        public static Dictionary<string, string> ReadEnv(string path)
        {
            var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            if (!File.Exists(path)) return result;
            foreach (string raw in File.ReadAllLines(path, Encoding.UTF8))
            {
                string line = raw.Trim();
                if (line.Length == 0 || line.StartsWith("#")) continue;
                int eq = line.IndexOf('=');
                if (eq <= 0) continue;
                result[line.Substring(0, eq).Trim()] = line.Substring(eq + 1).Trim();
            }
            return result;
        }

        public static string AppUrl()
        {
            var env = ReadEnv(Path.Combine(InstallDir, ".env"));
            string port;
            if (!env.TryGetValue("POSTIZ_PORT", out port) || port.Length == 0) port = "4007";
            return "http://localhost:" + port;
        }

        public static bool PortFree(int port)
        {
            TcpListener l = null;
            try
            {
                l = new TcpListener(IPAddress.Loopback, port);
                l.Start();
                return true;
            }
            catch { return false; }
            finally { if (l != null) try { l.Stop(); } catch { } }
        }

        public static bool HttpOk(string url)
        {
            try
            {
                var req = (HttpWebRequest)WebRequest.Create(url);
                req.Timeout = 5000;
                req.AllowAutoRedirect = true;
                using (var resp = (HttpWebResponse)req.GetResponse())
                {
                    return (int)resp.StatusCode < 500;
                }
            }
            catch (WebException ex)
            {
                var resp = ex.Response as HttpWebResponse;
                return resp != null && (int)resp.StatusCode < 500;
            }
            catch { return false; }
        }

        public static bool WaitHttp(string url, int timeoutSec, Action<string> log)
        {
            DateTime until = DateTime.Now.AddSeconds(timeoutSec);
            int n = 0;
            while (DateTime.Now < until)
            {
                if (HttpOk(url + "/auth")) return true;
                if (log != null && ++n % 8 == 0) log("Жду запуска сервиса " + url + " ...");
                Thread.Sleep(4000);
            }
            return false;
        }

        // App window without browser chrome: Edge --app, else default browser.
        public static void OpenAppWindow(string url)
        {
            string[] candidates = new string[] {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Google\Chrome\Application\chrome.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Google\Chrome\Application\chrome.exe")
            };
            foreach (string exe in candidates)
            {
                if (File.Exists(exe))
                {
                    try
                    {
                        Process.Start(exe, "--app=" + url + " --window-size=1400,900");
                        return;
                    }
                    catch { }
                }
            }
            try { Process.Start(url); } catch { }
        }

        public static bool AutostartEnabled()
        {
            using (var k = Registry.CurrentUser.OpenSubKey(RunKey, false))
            {
                return k != null && k.GetValue(AppId) != null;
            }
        }

        public static void SetAutostart(bool on)
        {
            using (var k = Registry.CurrentUser.CreateSubKey(RunKey))
            {
                if (on) k.SetValue(AppId, "\"" + LauncherPath + "\" --background");
                else if (k.GetValue(AppId) != null) k.DeleteValue(AppId);
            }
        }
    }
}
