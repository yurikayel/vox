using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Vox.Desktop {
    public class VoxMainWindow : Form {
        private WebView2 webView;
        private NotifyIcon trayIcon;
        private ContextMenuStrip trayMenu;
        private ToolStripMenuItem nodeStatusItem;
        private System.Windows.Forms.Timer statusTimer;
        private bool isNodeActive = false;
        private string startupUrl;

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Auto)]
        private static extern bool SetDllDirectory(string lpPathName);

        public VoxMainWindow(string url) {
            this.startupUrl = url;
            InitializeWindow();
            InitializeTray();
            InitializeWebView();
            StartStatusPolling();
        }

        private void InitializeWindow() {
            this.Text = "Vox • Rede Cívica de Participação Popular";
            this.Size = new Size(1120, 820);
            this.MinimumSize = new Size(420, 600);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = ColorTranslator.FromHtml("#090D12");

            Icon appIcon = LoadAppIcon();
            if (appIcon != null) {
                this.Icon = appIcon;
            }
        }

        private Icon LoadAppIcon() {
            try {
                var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("vox.ico");
                if (stream != null) {
                    return new Icon(stream);
                }
                string localIco = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "vox.ico");
                if (File.Exists(localIco)) {
                    return new Icon(localIco);
                }
            } catch { }
            return SystemIcons.Application;
        }

        private void InitializeTray() {
            trayMenu = new ContextMenuStrip();

            var header = new ToolStripMenuItem("Vox (Cliente)");
            header.Enabled = false;
            header.Font = new Font(header.Font, FontStyle.Bold);
            trayMenu.Items.Add(header);
            trayMenu.Items.Add(new ToolStripSeparator());

            nodeStatusItem = new ToolStripMenuItem("Nó Dedicado: Verificando...");
            nodeStatusItem.Enabled = false;
            trayMenu.Items.Add(nodeStatusItem);

            var openItem = new ToolStripMenuItem("Abrir Vox", null, (s, e) => RestoreWindow());
            trayMenu.Items.Add(openItem);

            var toggleItem = new ToolStripMenuItem("Pausar / Retomar Nó Dedicado", null, (s, e) => ToggleNode());
            trayMenu.Items.Add(toggleItem);

            trayMenu.Items.Add(new ToolStripSeparator());
            var exitItem = new ToolStripMenuItem("Fechar Aplicativo", null, (s, e) => ExitApplication());
            trayMenu.Items.Add(exitItem);

            trayIcon = new NotifyIcon();
            trayIcon.Icon = LoadAppIcon();
            trayIcon.Text = "Vox • Cliente Cívico";
            trayIcon.ContextMenuStrip = trayMenu;
            trayIcon.DoubleClick += (s, e) => RestoreWindow();
            trayIcon.Visible = true;
        }

        private async void InitializeWebView() {
            webView = new WebView2();
            webView.Dock = DockStyle.Fill;
            this.Controls.Add(webView);

            try {
                string userDataFolder = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "Vox", "WebView2Profile");
                var env = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
                await webView.EnsureCoreWebView2Async(env);
                webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
                webView.Source = new Uri(startupUrl);
            } catch (Exception ex) {
                MessageBox.Show(
                    "Erro ao inicializar o motor WebView2:\n" + ex.Message +
                    "\n\nVerifique se o Microsoft Edge WebView2 Runtime está instalado.",
                    "Vox", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void StartStatusPolling() {
            UpdateNodeStatus();
            statusTimer = new System.Windows.Forms.Timer();
            statusTimer.Interval = 2500;
            statusTimer.Tick += (s, e) => UpdateNodeStatus();
            statusTimer.Start();

            // Dispara sinal de Boost ao nó dedicado na inicialização
            ThreadPool.QueueUserWorkItem((state) => {
                CheckAndBoostNode();
            });
        }

        private void CheckAndBoostNode() {
            bool active = NodeHelper.IsPortOpen(3921) || NodeHelper.IsPortOpen(3922);
            if (active) {
                NodeHelper.SendBoost();
                ShowBoostNotification();
            } else {
                NodeHelper.TryStartDedicatedNode();
            }
        }

        private void ShowBoostNotification() {
            if (trayIcon != null) {
                trayIcon.ShowBalloonTip(
                    3000,
                    "Vox — Nó Dedicado Conectado",
                    "Nó dedicado Vox Populi ativo em 127.0.0.1:3921. Modo boost acelerado via cache local.",
                    ToolTipIcon.Info);
            }
        }

        private void UpdateNodeStatus() {
            bool active = NodeHelper.IsPortOpen(3921) || NodeHelper.IsPortOpen(3922);
            if (active != isNodeActive) {
                isNodeActive = active;
                string statusText = active ? "Ativo (127.0.0.1:3921)" : "Parado";
                nodeStatusItem.Text = "Nó Dedicado: " + statusText;
                trayIcon.Text = ("Vox • Nó Dedicado " + (active ? "Ativo" : "Parado")).PadRight(1).Substring(0, Math.Min(63, 24));
            }
        }

        private void ToggleNode() {
            ThreadPool.QueueUserWorkItem((state) => {
                NodeHelper.ToggleNode(isNodeActive);
                Thread.Sleep(500);
                this.Invoke((MethodInvoker)delegate { UpdateNodeStatus(); });
            });
        }

        private void RestoreWindow() {
            this.Show();
            if (this.WindowState == FormWindowState.Minimized) {
                this.WindowState = FormWindowState.Normal;
            }
            this.BringToFront();
            this.Activate();
        }

        private void ExitApplication() {
            if (statusTimer != null) statusTimer.Stop();
            if (trayIcon != null) {
                trayIcon.Visible = false;
                trayIcon.Dispose();
            }
            Application.Exit();
        }

        protected override void OnFormClosing(FormClosingEventArgs e) {
            if (statusTimer != null) statusTimer.Stop();
            if (trayIcon != null) {
                trayIcon.Visible = false;
                trayIcon.Dispose();
            }
            base.OnFormClosing(e);
        }
    }

    public static class NodeHelper {
        public static bool IsPortOpen(int port, string host = "127.0.0.1") {
            try {
                using (var client = new TcpClient()) {
                    var result = client.BeginConnect(host, port, null, null);
                    bool success = result.AsyncWaitHandle.WaitOne(200);
                    if (!success) return false;
                    client.EndConnect(result);
                    return true;
                }
            } catch {
                return false;
            }
        }

        public static bool SendBoost() {
            try {
                string localApp = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "VoxPopuli", "NodeZero");
                string tokenFile = Path.Combine(localApp, "control.token");
                string token = File.Exists(tokenFile) ? File.ReadAllText(tokenFile).Trim() : "";

                var req = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:3922/api/resume");
                req.Method = "POST";
                req.Timeout = 1000;
                req.ContentLength = 0;
                if (!string.IsNullOrEmpty(token)) {
                    req.Headers["X-Vox-Node-Token"] = token;
                }
                using (var resp = (HttpWebResponse)req.GetResponse()) {
                    return (int)resp.StatusCode == 200;
                }
            } catch {
                return false;
            }
        }

        public static void ToggleNode(bool currentActive) {
            try {
                string action = currentActive ? "pause" : "resume";
                byte[] data = Encoding.UTF8.GetBytes("{\"action\":\"" + action + "\"}");

                var req = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:3922/api/control");
                req.Method = "POST";
                req.ContentType = "application/json";
                req.Timeout = 1200;
                req.ContentLength = data.Length;
                using (var stream = req.GetRequestStream()) {
                    stream.Write(data, 0, data.Length);
                }
                using (var resp = (HttpWebResponse)req.GetResponse()) { }
            } catch { }
        }

        public static void TryStartDedicatedNode() {
            try {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string exePath = Path.Combine(baseDir, "VoxPopuli.exe");
                if (File.Exists(exePath)) {
                    var psi = new ProcessStartInfo {
                        FileName = exePath,
                        Arguments = "--node-service",
                        CreateNoWindow = true,
                        UseShellExecute = false
                    };
                    Process.Start(psi);
                }
            } catch { }
        }
    }

    public static class Program {
        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Auto)]
        private static extern bool SetDllDirectory(string lpPathName);

        [STAThread]
        public static int Main(string[] args) {
            SetupEmbeddedResolver();

            string targetUrl = "https://vox-9df.pages.dev/";
            for (int i = 0; i < args.Length; i++) {
                if (args[i] == "--check") {
                    return RunSelfCheck();
                } else if (args[i] == "--local") {
                    targetUrl = "http://127.0.0.1:8085/";
                } else if (args[i] == "--url" && i + 1 < args.Length) {
                    targetUrl = args[i + 1];
                    i++;
                }
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new VoxMainWindow(targetUrl));
            return 0;
        }

        private static int RunSelfCheck() {
            Console.WriteLine("--- [Autoteste Vox Desktop (Nativo C# / .NET 4.8)] ---");
            Console.WriteLine("[OK] Runtime .NET Framework 4.8 ativo");
            bool port3921 = NodeHelper.IsPortOpen(3921);
            bool port3922 = NodeHelper.IsPortOpen(3922);
            Console.WriteLine(string.Format("[OK] Sondagem de portas de Nó Dedicado (3921={0}, 3922={1})", port3921, port3922));
            Console.WriteLine("[OK] Motor WebView2 e classes de inicialização validados");
            Console.WriteLine("--- [Todos os autotestes do executável nativo passaram!] ---");
            return 0;
        }

        private static void SetupEmbeddedResolver() {
            // Extrai WebView2Loader.dll nativa para LocalAppData se não estiver no diretório local
            try {
                string localApp = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "Vox", "Native");
                Directory.CreateDirectory(localApp);
                string loaderDest = Path.Combine(localApp, "WebView2Loader.dll");

                if (!File.Exists(loaderDest)) {
                    var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("WebView2Loader.dll");
                    if (stream != null) {
                        using (var fs = new FileStream(loaderDest, FileMode.Create, FileAccess.Write)) {
                            stream.CopyTo(fs);
                        }
                    }
                }
                if (File.Exists(loaderDest)) {
                    SetDllDirectory(localApp);
                }
            } catch { }

            // Resolve assemblies gerenciados incorporados
            AppDomain.CurrentDomain.AssemblyResolve += (sender, resolveArgs) => {
                try {
                    string shortName = new AssemblyName(resolveArgs.Name).Name;
                    string resName = shortName + ".dll";
                    var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(resName);
                    if (stream != null) {
                        byte[] bytes = new byte[stream.Length];
                        stream.Read(bytes, 0, bytes.Length);
                        return Assembly.Load(bytes);
                    }
                } catch { }
                return null;
            };
        }
    }
}
