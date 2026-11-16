using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

internal sealed class PrepareMojo : Form
{
    const string PlayerUrl = "https://jaboyalex.github.io/mojo-ps2-web/";
    static string Distro = "Ubuntu-24.04";
    static string WslExe { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "wsl.exe"); } }
    readonly TextBox disc = new TextBox { ReadOnly = true, Width = 440 };
    readonly TextBox output = new TextBox { ReadOnly = true, Width = 440 };
    readonly TextBox details = new TextBox { Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical, Dock = DockStyle.Fill, Font = new Font("Consolas", 9) };
    readonly Label status = new Label { Text = "Choose your MOJO! USA disc to begin.", AutoSize = true, MaximumSize = new Size(540, 0) };
    readonly Button prepare = new Button { Text = "Prepare my game", AutoSize = true };
    readonly Button cancel = new Button { Text = "Stop", AutoSize = true, Enabled = false };
    readonly Button install = new Button { Text = "Install Ubuntu for Windows...", AutoSize = true, Visible = false };
    readonly Button browse = new Button { Text = "Choose disc...", AutoSize = true };
    readonly Button save = new Button { Text = "Save location...", AutoSize = true };
    readonly Button play = new Button { Text = "Open the player", AutoSize = true, Enabled = false };
    bool busy, installing, cancelled;
    string runId;
    string script, sources;
    volatile Process active;

    [STAThread]
    static int Main(string[] args)
    {
        if (args.Length == 1 && args[0] == "--self-test-wsl") {
            try {
                string first = "C:\\Game Folder\\MOJO! (USA).cue", second = "D:\\Game '日本語' & $(literal)\\image.iso";
                string program = "import base64,sys;print('\\n'.join(base64.b64encode(x.encode()).decode() for x in sys.argv[1:]))";
                using (Process process = Process.Start(new ProcessStartInfo(WslExe, Arguments("--distribution", Distro, "--exec", "python3", "-c", program, first, second)) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, StandardOutputEncoding = Encoding.UTF8 })) {
                    string actual = process.StandardOutput.ReadToEnd().Replace("\r", "").Trim(); process.WaitForExit();
                    string expected = Convert.ToBase64String(Encoding.UTF8.GetBytes(first)) + "\n" + Convert.ToBase64String(Encoding.UTF8.GetBytes(second));
                    if (process.ExitCode != 0 || actual != expected) return 2;
                }
                string scriptPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "prepare.sh");
                using (Process process = Process.Start(new ProcessStartInfo(WslExe, Arguments("--distribution", Distro, "--exec", "bash", "-c", "exec bash \"$(wslpath -u \"$1\")\" check", "--", scriptPath)) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true })) {
                    process.StandardOutput.ReadToEnd(); process.WaitForExit(); return process.ExitCode == 0 ? 0 : 3;
                }
            } catch { return 1; }
        }
        if (args.Length == 1 && args[0] == "--self-test") {
            try {
                VerifyBundle();
                if (Quote("abc") != "abc" || Quote("a\"b") != "\"a\\\"b\"" || Quote("C:\\game folder\\") != "\"C:\\game folder\\\\\"") return 2;
                return 0;
            } catch { return 1; }
        }
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new PrepareMojo());
        return 0;
    }

    static string Resource(string name)
    {
        using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(name))
        using (StreamReader reader = new StreamReader(stream)) return reader.ReadToEnd().Trim();
    }
    static string Hash(string path)
    {
        using (SHA256 hash = SHA256.Create())
        using (Stream stream = File.OpenRead(path)) return BitConverter.ToString(hash.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
    }
    static void VerifyBundle()
    {
        string[] expected = Resource("mojo.bundle-hashes").Split('\n');
        string folder = AppDomain.CurrentDomain.BaseDirectory;
        if (Hash(Path.Combine(folder, "sources.zip")) != expected[0].Trim() || Hash(Path.Combine(folder, "prepare.sh")) != expected[1].Trim())
            throw new InvalidOperationException("The preparation download is incomplete or damaged. Download and extract a fresh copy.");
    }
    // Windows argv quoting, with no intervening command shell. User file names
    // are always arguments, never interpolated into the Linux shell program.
    internal static string Quote(string value)
    {
        if (value.Length > 0 && value.IndexOfAny(new char[] { ' ', '\t', '\n', '\r', '"' }) < 0) return value;
        StringBuilder result = new StringBuilder("\""); int slashes = 0;
        foreach (char ch in value) {
            if (ch == '\\') { slashes++; continue; }
            if (ch == '"') { result.Append('\\', slashes * 2 + 1); result.Append(ch); }
            else { result.Append('\\', slashes); result.Append(ch); }
            slashes = 0;
        }
        result.Append('\\', slashes * 2); return result.Append('"').ToString();
    }
    static string Arguments(params string[] values) { return String.Join(" ", Array.ConvertAll(values, Quote)); }
    void UpdateUi(Action action) { if (!IsDisposed) BeginInvoke(action); }
    void Log(string line)
    {
        if (String.IsNullOrEmpty(line)) return;
        UpdateUi(delegate { if (details.TextLength > 100000) details.Clear(); details.AppendText(line + Environment.NewLine); });
    }
    void State(string text) { UpdateUi(delegate { status.Text = text; }); }
    void Run(params string[] arguments)
    {
        Process process = new Process();
        process.StartInfo = new ProcessStartInfo(WslExe, Arguments(arguments)) {
            UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8
        };
        process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e) { Log(e.Data); };
        process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e) { Log(e.Data); };
        active = process;
        try {
            process.Start(); process.BeginOutputReadLine(); process.BeginErrorReadLine(); process.WaitForExit();
            if (cancelled) throw new OperationCanceledException();
            if (process.ExitCode != 0) throw new InvalidOperationException("Preparation stopped. The details below explain which step needs attention. Your existing game files and saves are kept.");
        } finally { active = null; process.Dispose(); }
    }
    static bool UbuntuReady()
    {
        foreach (string candidate in new[] { "Ubuntu-24.04", "Ubuntu" }) {
            try {
                using (Process process = Process.Start(new ProcessStartInfo(WslExe, Arguments("--distribution", candidate, "--exec", "sh", "-c", ". /etc/os-release; [ \"$ID\" = ubuntu ] && [ \"$VERSION_ID\" = 24.04 ]")) {
                    UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true
                })) {
                    if (!process.WaitForExit(15000)) { process.Kill(); continue; }
                    if (process.ExitCode == 0) { Distro = candidate; return true; }
                }
            } catch { }
        }
        return false;
    }

    PrepareMojo()
    {
        Text = "Prepare MOJO!"; ClientSize = new Size(620, 610); MinimumSize = new Size(630, 600);
        Font = new Font("Segoe UI", 10); StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(20, 27, 32); ForeColor = Color.FromArgb(242, 240, 230);
        TableLayoutPanel layout = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(25), ColumnCount = 1, RowCount = 10 };
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize)); layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 28)); layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 28)); layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 55)); layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 35));
        layout.Controls.Add(new Label { Text = "Make your game ready.", AutoSize = true, Font = new Font("Segoe UI", 23, FontStyle.Bold) }, 0, 0);
        layout.Controls.Add(new Label { Text = "Choose your own MOJO! USA PS2 image. This downloads build tools and prepares your private file locally. First setup can take a while.", AutoSize = true, MaximumSize = new Size(550, 0) }, 0, 1);
        layout.Controls.Add(new Label { Text = "1 / YOUR DISC", AutoSize = true, Padding = new Padding(0, 8, 0, 0) }, 0, 2);
        FlowLayoutPanel discRow = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill }; disc.Width = 420; discRow.Controls.Add(disc); discRow.Controls.Add(browse); layout.Controls.Add(discRow, 0, 3);
        layout.Controls.Add(new Label { Text = "2 / YOUR PREPARED FILE", AutoSize = true, Padding = new Padding(0, 8, 0, 0) }, 0, 4);
        FlowLayoutPanel outputRow = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill }; output.Width = 420; outputRow.Controls.Add(output); outputRow.Controls.Add(save); layout.Controls.Add(outputRow, 0, 5);
        FlowLayoutPanel actions = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, Padding = new Padding(0, 12, 0, 0) };
        actions.Controls.Add(prepare); actions.Controls.Add(cancel); actions.Controls.Add(play); layout.Controls.Add(actions, 0, 6);
        FlowLayoutPanel info = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true }; info.Controls.Add(status); info.Controls.Add(install); layout.Controls.Add(info, 0, 7);
        layout.Controls.Add(details, 0, 8);
        layout.Controls.Add(new Label { Text = "No game uploads. No changes to your saves. Keep the resulting .mojo file private.", AutoSize = true, Padding = new Padding(0, 10, 0, 0), Font = new Font("Segoe UI", 9) }, 0, 9);
        Controls.Add(layout);
        foreach (Button button in new[] { prepare, cancel, install, browse, save, play }) { button.ForeColor = Color.Black; button.BackColor = Color.FromArgb(212, 239, 99); button.FlatStyle = FlatStyle.Flat; }
        output.Text = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads", "MOJO-runtime.mojo");
        browse.Click += delegate { using (OpenFileDialog picker = new OpenFileDialog { Filter = "MOJO! disc image|*.iso;*.bin;*.cue;*.img", Title = "Choose your own MOJO! USA PS2 disc" }) if (picker.ShowDialog(this) == DialogResult.OK) disc.Text = picker.FileName; };
        save.Click += delegate { using (SaveFileDialog picker = new SaveFileDialog { Filter = "Private MOJO! runtime|*.mojo", FileName = "MOJO-runtime.mojo", DefaultExt = "mojo", AddExtension = true, InitialDirectory = Path.GetDirectoryName(output.Text) }) if (picker.ShowDialog(this) == DialogResult.OK) output.Text = picker.FileName; };
        play.Click += delegate { Process.Start(new ProcessStartInfo(PlayerUrl) { UseShellExecute = true }); Process.Start(new ProcessStartInfo("explorer.exe", "/select," + Quote(output.Text)) { UseShellExecute = true }); };
        install.Click += delegate {
            try { Process.Start(new ProcessStartInfo("powershell.exe", "-NoProfile -NoExit -Command \"& wsl.exe --install -d Ubuntu-24.04\"") { UseShellExecute = true, Verb = "runas" }); status.Text = "Finish Ubuntu's setup prompts, restart if asked, then reopen this helper."; }
            catch (Exception error) { status.Text = error.Message; }
        };
        prepare.Click += async delegate {
            if (busy) return;
            if (!File.Exists(disc.Text)) { status.Text = "Choose your MOJO! USA disc first."; return; }
            string image = disc.Text, destination = output.Text;
            busy = true; cancelled = false; prepare.Enabled = browse.Enabled = save.Enabled = play.Enabled = false; details.Clear();
            try {
                VerifyBundle();
                status.Text = "Checking Ubuntu for the local build tools...";
                if (!await Task.Run((Func<bool>)UbuntuReady)) { install.Visible = true; throw new InvalidOperationException("One-time requirement: install Ubuntu 24.04 on WSL2, finish its first-run prompts, then reopen this helper."); }
                install.Visible = false;
                string folder = AppDomain.CurrentDomain.BaseDirectory; script = Path.Combine(folder, "prepare.sh"); sources = Path.Combine(folder, "sources.zip"); runId = Guid.NewGuid().ToString("N");
                installing = true; status.Text = "Setting up build tools in Ubuntu. Your game stays local.";
                await Task.Run(delegate { Run("--distribution", Distro, "--user", "root", "--exec", "bash", "-c", "exec bash \"$(wslpath -u \"$1\")\" install", "--", script); });
                installing = false; cancel.Enabled = true; status.Text = "Preparing your game. You can leave this window open while it works.";
                string expected = Resource("mojo.bundle-hashes").Split('\n')[0].Trim();
                await Task.Run(delegate { Run("--distribution", Distro, "--exec", "bash", "-c", "exec setsid bash \"$(wslpath -u \"$1\")\" \"${@:2}\"", "--", script, "build", image, destination, sources, expected, runId); });
                status.Text = "Ready! Open the player and choose your prepared file once."; play.Enabled = true;
            } catch (OperationCanceledException) { status.Text = "Stopped. Select Prepare again to resume using your local cache."; }
            catch (Exception error) { status.Text = error.Message; }
            finally { busy = installing = false; cancel.Enabled = false; prepare.Enabled = browse.Enabled = save.Enabled = true; }
        };
        cancel.Click += async delegate {
            if (!busy || installing) return; cancel.Enabled = false; cancelled = true; status.Text = "Stopping preparation...";
            await Task.Run(delegate { StopBuild(); });
        };
        FormClosing += delegate(object sender, FormClosingEventArgs e) {
            if (busy) { e.Cancel = true; status.Text = installing ? "Wait for tool installation to finish before closing." : "Select Stop, wait for preparation to stop, then close this window."; }
        };
    }
    void StopBuild()
    {
        try {
            string program = "d=\"${XDG_CACHE_HOME:-$HOME/.cache}/mojo-web-preparer\"; mkdir -p \"$d\"; : > \"$d/$1.cancel\"; p=\"$d/$1.pid\"; for n in {1..15}; do if [ -r \"$p\" ]; then read -r pid < \"$p\"; case $pid in ''|*[!0-9]*) exit 1;; esac; kill -TERM -- \"-$pid\"; exit; fi; sleep .2; done";
            using (Process process = Process.Start(new ProcessStartInfo(WslExe, Arguments("--distribution", Distro, "--exec", "bash", "-c", program, "--", runId)) { UseShellExecute = false, CreateNoWindow = true })) process.WaitForExit(5000);
        } catch { }
    }
}
