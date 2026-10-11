using System;
using System.IO;
using System.Drawing;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Web.Script.Serialization;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

internal sealed class GameWindow : Form
{
    private readonly WebView2 view = new WebView2();
    private readonly string root = AppDomain.CurrentDomain.BaseDirectory;
    private readonly bool testMode;
    private readonly bool gestureMode;
    private readonly bool unlockMode;
    private readonly bool restoreMode;
    private readonly string testOutput;
    private int blockedRequests, blockedNavigations, blockedWindows, navigationCount;
    private bool tested;
    private string embeddedDocument;
    private bool initialDocumentAllowed = true;
    private Label loading;
    private string DataDirectory
    {
        get { return Path.Combine(root, unlockMode ? ".unlock-test-data-v3" : testMode ? ".test-data-v3" : ".game-data-v3"); }
    }

    internal GameWindow(string[] args)
    {
        gestureMode = args.Length >= 2 && args[0] == "--gesture-test";
        restoreMode = args.Length >= 2 && args[0] == "--unlock-restore-test";
        unlockMode = args.Length >= 2 && (args[0] == "--unlock-test" || restoreMode);
        testMode = args.Length >= 2 && (args[0] == "--self-test" || gestureMode || unlockMode);
        testOutput = testMode ? Path.GetFullPath(args[1]) : null;
        Text = "赤刃·重铸v3 实验版";
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(1440, 900);
        MinimumSize = new Size(980, 640);
        BackColor = Color.FromArgb(7, 6, 10);
        view.Dock = DockStyle.Fill;
        Controls.Add(view);
        loading = new Label { Text = "赤刃·重铸v3 实验版\n正在加载本地游戏（v2 分支）…",
            Dock = DockStyle.Fill, ForeColor = Color.Coral, BackColor = BackColor,
            TextAlign = ContentAlignment.MiddleCenter, Font = new Font("Microsoft YaHei", 20) };
        Controls.Add(loading);
        Shown += async delegate { await Initialize(); };
        FormClosed += delegate { view.Dispose(); };
    }

    private async Task Initialize()
    {
        try
        {
            string arguments = "--disable-background-networking --disable-component-update " +
                "--disable-domain-reliability --disable-sync --no-pings " +
                "--disable-features=msEdgeMouseGesture,msEdgeSidebarV2,Translate " +
                "--proxy-server=http://127.0.0.1:9 --proxy-bypass-list=<-loopback>";
            var environment = await CoreWebView2Environment.CreateAsync(
                Path.Combine(root, "runtime"), DataDirectory,
                new CoreWebView2EnvironmentOptions(arguments));
            await view.EnsureCoreWebView2Async(environment);
            var core = view.CoreWebView2;
            var settings = core.Settings;
            settings.AreDefaultContextMenusEnabled = false;
            settings.AreBrowserAcceleratorKeysEnabled = false;
            settings.AreDevToolsEnabled = false;
            settings.IsStatusBarEnabled = false;
            settings.IsZoomControlEnabled = false;
            settings.IsPinchZoomEnabled = false;
            settings.IsSwipeNavigationEnabled = false;
            settings.IsGeneralAutofillEnabled = false;
            settings.IsPasswordAutosaveEnabled = false;
            settings.AreHostObjectsAllowed = false;
            settings.IsWebMessageEnabled = true;
            settings.AreDefaultScriptDialogsEnabled = false;
            settings.IsBuiltInErrorPageEnabled = false;
            await core.AddScriptToExecuteOnDocumentCreatedAsync(
                "window.__redProgress={infernoUnlocked:" + (ReadUnlock() ? "true" : "false") + ",campaign24Cleared:" + (ReadCampaign24() ? "true" : "false") + ",edition:\"redline-v3-m3\"};");
            core.WebMessageReceived += async delegate(object sender, CoreWebView2WebMessageReceivedEventArgs e)
            {
                try
                {
                    if (e.WebMessageAsJson.Length > 256) return;
                    if (e.Source != "about:blank" && e.Source != embeddedDocument) return;
                    var payload = new JavaScriptSerializer().Deserialize<System.Collections.Generic.Dictionary<string, object>>(e.WebMessageAsJson);
                    object messageType;
                    if (!payload.TryGetValue("type", out messageType) || (string)messageType != "hell-campaign-cleared" && (string)messageType != "campaign24-cleared") return;
                    string valid = await core.ExecuteScriptAsync(
                        "!!(typeof G!=='undefined'&&G.state==='over'&&G.win===true&&!G.trialBoss&&G.wave===24&&G.runStart===1&&G.runDifficulty==='hell'&&typeof getDifficulty==='function'&&getDifficulty().key==='hell')");
                    if (valid != "true") return;
                    WriteUnlock(true);
                    await core.ExecuteScriptAsync(
                        "window.__redProgress={infernoUnlocked:true,campaign24Cleared:true,edition:\"redline-v3-m3\"};if(typeof initDifficultyUI==='function')initDifficultyUI();if(typeof toast==='function')toast('地狱通关 · 炼狱难度已解锁','ok');");
                }
                catch (Exception)
                {
                    core.ExecuteScriptAsync("if(typeof toast==='function')toast('解锁记录保存失败，请检查游戏目录是否可写','bad');");
                }
            };
            core.ContextMenuRequested += delegate(object sender, CoreWebView2ContextMenuRequestedEventArgs e) { e.Handled = true; };
            core.NewWindowRequested += delegate(object sender, CoreWebView2NewWindowRequestedEventArgs e)
            { blockedWindows++; e.Handled = true; };
            core.DownloadStarting += delegate(object sender, CoreWebView2DownloadStartingEventArgs e) { e.Cancel = true; };
            core.PermissionRequested += delegate(object sender, CoreWebView2PermissionRequestedEventArgs e)
            { e.State = CoreWebView2PermissionState.Deny; };
            core.NavigationStarting += delegate(object sender, CoreWebView2NavigationStartingEventArgs e)
            {
                if (testMode) File.AppendAllText(testOutput + ".log", "Navigation: " + e.Uri.Substring(0, Math.Min(60, e.Uri.Length)) + "\n");
                if (initialDocumentAllowed && e.Uri == embeddedDocument)
                { initialDocumentAllowed = false; return; }
                if (e.Uri != "about:blank") { e.Cancel = true; blockedNavigations++; }
            };
            core.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All);
            core.WebResourceRequested += delegate(object sender, CoreWebView2WebResourceRequestedEventArgs e)
            {
                if (testMode) File.AppendAllText(testOutput + ".log", "Request: " + e.Request.Uri.Substring(0, Math.Min(60, e.Request.Uri.Length)) + "\n");
                if (e.Request.Uri == "about:blank" || e.Request.Uri == embeddedDocument) return;
                blockedRequests++;
                e.Response = environment.CreateWebResourceResponse(
                    new MemoryStream(new byte[0]), 403, "Offline game: requests disabled",
                    "Content-Type: text/plain\r\nCache-Control: no-store\r\n");
            };
            core.NavigationCompleted += async delegate(object sender, CoreWebView2NavigationCompletedEventArgs e)
            {
                navigationCount++;
                if (testMode) File.AppendAllText(testOutput + ".log", "Completed: " + e.IsSuccess + " " + e.WebErrorStatus + "\n");
                if (!e.IsSuccess) return;
                loading.Visible = false;
                loading.Dispose();
                view.Focus();
                if (testMode && !tested) { tested = true; await RunTest(); }
            };
            string html;
            using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("game-v3.html"))
            using (var reader = new StreamReader(stream, Encoding.UTF8)) html = reader.ReadToEnd();
            embeddedDocument = "data:text/html;charset=utf-8;base64," +
                Convert.ToBase64String(Encoding.UTF8.GetBytes(html));
            core.NavigateToString(html);
        }
        catch (Exception error)
        {
            if (testMode)
            {
                File.WriteAllText(testOutput, "{\"passed\":false,\"error\":" +
                    new JavaScriptSerializer().Serialize(error.ToString()) + "}", Encoding.UTF8);
                Environment.ExitCode = 1;
                Close();
            }
            else
            {
                MessageBox.Show(this, "本地游戏加载失败。\n请保留整个游戏目录，尤其是 runtime 文件夹。\n\n" +
                    error.Message, "赤刃 REDLINE", MessageBoxButtons.OK, MessageBoxIcon.Error);
                Close();
            }
        }
    }

    private async Task RunTest()
    {
        try
        {
            if (restoreMode) { await RunRestoreTest(); return; }
            if (unlockMode) { await RunUnlockTest(); return; }
            if (gestureMode) { await RunGestureTest(); return; }
            await Task.Delay(150);
            string script = @"(async function(){
              var checks=[],failures=[];
              function check(ok,name){(ok?checks:failures).push(name);}
              check((typeof DIFFICULTIES!=='undefined')&&DIFFICULTIES.length===10,'Runtime difficulties n=10');
  check((typeof LEVELS!=='undefined')&&LEVELS.length===24,'Runtime stages n=24');
  check(document.querySelectorAll('.diff-card').length===10,'Difficulty cards n=10');
  check(!!window.__M3MANIFEST&&window.__M3MANIFEST.goalTypes.length===3,'Runtime goal types n=3');
  check(!!window.__M3MANIFEST&&window.__M3MANIFEST.bossLevels.length===6,'Runtime boss levels n=6');
  check(!!window.__REDLINE_BUILD__ && window.__REDLINE_BUILD__.edition==='redline-v3' && window.__REDLINE_BUILD__.aiLocked===true && window.__REDLINE_BUILD__.ai===false && document.title==='赤刃·重铸v3 实验版' && document.querySelectorAll('.diff-card').length>0,'Embedded redline-v3 edition; baseline list n='+document.querySelectorAll('.diff-card').length);
              __redTest.start();__redTest.clearEnemies();
              check(__redTest.state().state==='play','Game starts in native window');
              __redTest.spawn('chaser',P.x+65,P.y);en[0].hp=2000;en[0].maxHp=2000;en[0].spd=0;en[0].cd=100;
              P.inv=100;P.aim=0;mouse.x=P.x+200;mouse.y=P.y;
              var damages=[];
              for(var i=0;i<3;i++){P.atkT=0;var before=en[0].hp;melee(false);damages.push(before-en[0].hp);}
              check(damages[2]>damages[1]&&damages[1]>damages[0],'Three-stage combo damage');
              check(Number.isFinite(G.score),'Finite combat score');
              P.atkT=.8;P.dashCd=0;doDash();
              check(P.atkT===0&&P.inv>0,'Dash cancel and invulnerability');
              pauseGame();var t=G.time;__redTest.advance(2);
              check(G.time===t,'Pause freezes game clock');resumeGame();
              var denied=false;try{await fetch('https://example.com/offline-test');}catch(e){denied=true;}
              check(denied,'Network fetch denied by content security policy');
              return JSON.stringify({checks:checks,failures:failures,damages:damages,title:document.title});
            })()";
            // ExecuteScriptAsync does not await JS promises; run the asynchronous test then poll its result.
            await view.CoreWebView2.ExecuteScriptAsync(
                "window.__hostResult=null;(" + script + ").then(function(r){window.__hostResult=r;}).catch(function(e){window.__hostResult=JSON.stringify({failures:[String(e)]});});");
            string result = "null";
            for (int i = 0; i < 100 && result == "null"; i++)
            {
                await Task.Delay(50);
                result = await view.CoreWebView2.ExecuteScriptAsync("window.__hostResult");
            }
            string gameResult = new JavaScriptSerializer().Deserialize<string>(result);
            if (gameResult == null) throw new Exception("Native game self-test timed out.");
            await view.CoreWebView2.ExecuteScriptAsync("location.href='https://example.com/navigation-test'");
            await Task.Delay(100);
            var settings = view.CoreWebView2.Settings;
            bool passed = gameResult.Contains("\"failures\":[]") &&
                !settings.AreDefaultContextMenusEnabled && !settings.AreBrowserAcceleratorKeysEnabled &&
                !settings.IsSwipeNavigationEnabled && blockedNavigations > 0;
            var report = new { passed = passed, game = new JavaScriptSerializer().DeserializeObject(gameResult),
                contextMenusEnabled = settings.AreDefaultContextMenusEnabled,
                browserAcceleratorsEnabled = settings.AreBrowserAcceleratorKeysEnabled,
                swipeNavigationEnabled = settings.IsSwipeNavigationEnabled,
                runtimeFolder = Path.Combine(root, "runtime"),
                blockedRequests = blockedRequests, blockedNavigations = blockedNavigations,
                blockedWindows = blockedWindows, navigationCount = navigationCount };
            File.WriteAllText(testOutput, new JavaScriptSerializer().Serialize(report), Encoding.UTF8);
            Environment.ExitCode = passed ? 0 : 1;
            Close();
        }
        catch (Exception error)
        {
            File.WriteAllText(testOutput, "{\"passed\":false,\"error\":" +
                new JavaScriptSerializer().Serialize(error.ToString()) + "}", Encoding.UTF8);
            Environment.ExitCode = 1;
            Close();
        }
    }

    private bool ReadCampaign24()
  {
    try
    {
      var json = File.ReadAllText(Path.Combine(DataDirectory, "progress-v3.json"));
      if (json.IndexOf("redline-v3-m3", StringComparison.Ordinal) < 0) return false;   /* edition 必须为新版 */
      return json.IndexOf("\"campaign24Cleared\":true", StringComparison.Ordinal) >= 0;  /* 旧 infernoUnlocked 不算 24 通关 */
    }
    catch { return false; }
  }
  private bool ReadUnlock()
    {
        try
        {
            string file = Path.Combine(DataDirectory, "progress-v3.json");
            if (!File.Exists(file)) return false;
            var data = new JavaScriptSerializer().Deserialize<System.Collections.Generic.Dictionary<string, object>>(File.ReadAllText(file, Encoding.UTF8));
            object value;
            return data.TryGetValue("infernoUnlocked", out value) && value is bool && (bool)value;
        }
        catch (Exception) { return false; }
    }

    private void WriteUnlock(bool unlocked)
    {
        Directory.CreateDirectory(DataDirectory);
        string file = Path.Combine(DataDirectory, "progress-v3.json");
        string temporary = Path.Combine(DataDirectory, "progress-v3.tmp");
        File.WriteAllText(temporary, new JavaScriptSerializer().Serialize(
            new { version = 2, infernoUnlocked = unlocked, campaign24Cleared = unlocked, edition = "redline-v3-m3" }), new UTF8Encoding(false));
        if (File.Exists(file)) File.Replace(temporary, file, null);
        else File.Move(temporary, file);
    }

    private async Task RunRestoreTest()
    {
        string enabled = await view.CoreWebView2.ExecuteScriptAsync(
            "window.__redProgress.campaign24Cleared === true && window.__redProgress.edition === \"redline-v3-m3\" && setDifficulty('inferno')");
        bool passed = ReadCampaign24() && ReadUnlock() && enabled == "true";
        File.WriteAllText(testOutput, new JavaScriptSerializer().Serialize(new {
            passed = passed, unlockRestoredInNewProcess = passed, isolatedTestData = DataDirectory }), Encoding.UTF8);
        Environment.ExitCode = passed ? 0 : 1;
        Close();
    }

    private async Task RunUnlockTest()
    {
        WriteUnlock(false);
        try { var p1 = Path.Combine(DataDirectory, "progress-v3.json"); if (File.Exists(p1)) File.Delete(p1); } catch { }
        try { var p2 = Path.Combine(DataDirectory, "progress-v3.tmp"); if (File.Exists(p2)) File.Delete(p2); } catch { }
        await view.CoreWebView2.ExecuteScriptAsync("window.__redProgress={infernoUnlocked:false,campaign24Cleared:false};initDifficultyUI();");
        string locked = await view.CoreWebView2.ExecuteScriptAsync("document.querySelector('[data-diff=\"inferno\"]').disabled");
        await view.CoreWebView2.ExecuteScriptAsync("setDifficulty('hell');reset();G.state='over';G.win=true;G.wave=12;G.runStart=1;G.trialBoss=false;window.chrome.webview.postMessage({type:'campaign24-cleared'});");
        await Task.Delay(150);
        bool rejectedLegacy12 = !ReadCampaign24() && !ReadUnlock();
        await view.CoreWebView2.ExecuteScriptAsync("setDifficulty('hell');reset();G.state='over';G.win=true;G.wave=24;G.runStart=1;G.trialBoss=true;window.chrome.webview.postMessage({type:'campaign24-cleared'});");
        await Task.Delay(150);
        bool rejectedBossTrial = !ReadCampaign24() && !ReadUnlock();
        await view.CoreWebView2.ExecuteScriptAsync("setDifficulty('hell');reset();G.state='over';G.win=true;G.wave=24;G.runStart=5;G.trialBoss=false;window.chrome.webview.postMessage({type:'campaign24-cleared'});");
        await Task.Delay(150);
        bool rejectedPartialRun = !ReadCampaign24() && !ReadUnlock();
        await view.CoreWebView2.ExecuteScriptAsync("setDifficulty('hell');reset();G.state='over';G.win=false;G.wave=24;G.runStart=1;G.trialBoss=false;window.chrome.webview.postMessage({type:'campaign24-cleared'});");
        await Task.Delay(150);
        bool rejectedLoss = !ReadCampaign24() && !ReadUnlock();
        await view.CoreWebView2.ExecuteScriptAsync("setDifficulty('hell');G.runDifficulty='hell';reset();G.state='over';G.win=true;G.wave=24;G.runStart=1;G.trialBoss=false;window.chrome.webview.postMessage({type:'campaign24-cleared'});");
        for (int i = 0; i < 60 && !ReadCampaign24(); i++) await Task.Delay(50);
        bool savedCampaign24 = ReadCampaign24() && ReadUnlock();
        await view.CoreWebView2.ExecuteScriptAsync("window.__redProgress={infernoUnlocked:" + (ReadUnlock() ? "true" : "false") + ",campaign24Cleared:" + (ReadCampaign24() ? "true" : "false") + ",edition:\"redline-v3-m3\"};initDifficultyUI();");
        string uiUnlocked = await view.CoreWebView2.ExecuteScriptAsync("window.__redProgress.campaign24Cleared === true && window.__redProgress.edition === 'redline-v3-m3'");
        bool passed = locked == "true" && rejectedLegacy12 && rejectedBossTrial && rejectedPartialRun && rejectedLoss && savedCampaign24 && uiUnlocked == "true";
        File.WriteAllText(testOutput, new JavaScriptSerializer().Serialize(new {
            passed = passed, initiallyLocked = locked == "true",
            rejectedLegacy12 = rejectedLegacy12, rejectedBossTrial = rejectedBossTrial,
            rejectedPartialRun = rejectedPartialRun, rejectedLoss = rejectedLoss,
            savedCampaign24 = savedCampaign24, uiUnlocked = uiUnlocked == "true",
            isolatedTestData = DataDirectory }), Encoding.UTF8);
        Environment.ExitCode = passed ? 0 : 1;
        Close();
    }

    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr handle);
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr handle, IntPtr processId);
    [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] private static extern bool AttachThreadInput(uint from, uint to, bool attach);
    [DllImport("user32.dll")] private static extern bool BringWindowToTop(IntPtr handle);
    [DllImport("user32.dll")] private static extern IntPtr GetAncestor(IntPtr handle, uint flags);
    [DllImport("user32.dll")] private static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] private static extern void mouse_event(uint flags, uint x, uint y, uint data, UIntPtr extra);

    private void RequireTestFocus()
    {
        if (GetAncestor(GetForegroundWindow(), 2) != Handle)
            throw new Exception("Test lost its own window focus; no further input sent.");
    }

    private async Task RunGestureTest()
    {
        Activate();
        uint foregroundThread = GetWindowThreadProcessId(GetForegroundWindow(), IntPtr.Zero);
        uint gameThread = GetCurrentThreadId();
        bool attached = foregroundThread != gameThread && AttachThreadInput(gameThread, foregroundThread, true);
        try { BringWindowToTop(Handle); SetForegroundWindow(Handle); }
        finally { if (attached) AttachThreadInput(gameThread, foregroundThread, false); }
        view.Focus();
        await Task.Delay(100);
        if (GetAncestor(GetForegroundWindow(), 2) != Handle)
            throw new Exception("Input test could not focus its own game window; no mouse input sent.");
        await view.CoreWebView2.ExecuteScriptAsync(
            "__redTest.start();__redTest.clearEnemies();P.inv=100;" +
            "__redTest.spawn('chaser',P.x+90,P.y);en[0].hp=en[0].maxHp=2000;en[0].spd=0;en[0].cd=100;");
        await Task.Delay(100);
        Point original = Cursor.Position;
        string targetPointJson = await view.CoreWebView2.ExecuteScriptAsync(
            "JSON.stringify({x:(en[0].x*VIEW.s+VIEW.x)/innerWidth,y:(en[0].y*VIEW.s+VIEW.y)/innerHeight})");
        string targetPointText = new JavaScriptSerializer().Deserialize<string>(targetPointJson);
        var targetPoint = new JavaScriptSerializer().Deserialize<System.Collections.Generic.Dictionary<string, object>>(targetPointText);
        Point aim = view.PointToScreen(new Point(
            (int)(Convert.ToDouble(targetPoint["x"]) * view.Width),
            (int)(Convert.ToDouble(targetPoint["y"]) * view.Height)));
        try
        {
            RequireTestFocus();
            SetCursorPos(aim.X, aim.Y);
            mouse_event(0x0008, 0, 0, 0, UIntPtr.Zero);
            for (int i = 0; i < 12; i++)
            {
                RequireTestFocus();
                SetCursorPos(aim.X - 120 + i * 10, aim.Y);
                await Task.Delay(100);
            }
            SetCursorPos(aim.X, aim.Y);
            await Task.Delay(100);
            mouse_event(0x0010, 0, 0, 0, UIntPtr.Zero);
            await Task.Delay(150);
            RequireTestFocus();
            SendKeys.SendWait("^w");
            RequireTestFocus();
            SendKeys.SendWait("%{LEFT}");
            await Task.Delay(150);
            string result = await view.CoreWebView2.ExecuteScriptAsync(
                "JSON.stringify({title:document.title,state:G.state,enemyHp:en[0].hp,charging:P.charging,charge:P.charge,skill:P.skillText,playerX:P.x,playerY:P.y,mouseX:mouse.x,mouseY:mouse.y})");
            string decoded = new JavaScriptSerializer().Deserialize<string>(result);
            var payload = new JavaScriptSerializer().Deserialize<System.Collections.Generic.Dictionary<string, object>>(decoded);
            /* v1.2.3：AI 已隔离，F8 必须不接管（控制源保持 human、队列保持空） */
            RequireTestFocus(); SendKeys.SendWait("{F8}");
            await Task.Delay(50);
            bool aiOn = await view.CoreWebView2.ExecuteScriptAsync("CTRL.mode==='ai'") == "true";
            await Task.Delay(50);
            bool aiOff = await view.CoreWebView2.ExecuteScriptAsync("CTRL.mode==='human' && aiQueue.length===0") == "true";
            RequireTestFocus(); SendKeys.SendWait("p");
            await Task.Delay(50);
            string frozen = await view.CoreWebView2.ExecuteScriptAsync("G.time");
            await Task.Delay(100);
            bool pause = await view.CoreWebView2.ExecuteScriptAsync("G.state==='sysmenu'") == "true" &&
                frozen == await view.CoreWebView2.ExecuteScriptAsync("G.time");
            RequireTestFocus(); SendKeys.SendWait("p");
            await Task.Delay(50);
            bool resume = await view.CoreWebView2.ExecuteScriptAsync("G.state==='play'") == "true";
            RequireTestFocus(); SendKeys.SendWait("{ESC}");
            await Task.Delay(50);
            bool menu = await view.CoreWebView2.ExecuteScriptAsync("G.state==='sysmenu'") == "true";
            await view.CoreWebView2.ExecuteScriptAsync("document.getElementById('bSysTitle').click()");
            bool confirm = await view.CoreWebView2.ExecuteScriptAsync("document.getElementById('mQuit').classList.contains('on')") == "true";
            await view.CoreWebView2.ExecuteScriptAsync("document.getElementById('bQuitNo').click()");
            bool cancel = await view.CoreWebView2.ExecuteScriptAsync("G.state==='sysmenu'") == "true";
            await view.CoreWebView2.ExecuteScriptAsync("document.getElementById('bSysTitle').click();document.getElementById('bQuitYes').click()");
            bool title = await view.CoreWebView2.ExecuteScriptAsync("G.state==='menu'") == "true";
            bool passed = Convert.ToDouble(payload["enemyHp"]) < 1900 &&
                (string)payload["state"] == "play" && (string)payload["title"] == "赤刃 REDLINE v1.2.3" &&
                /* v1.2.3：F8 不得接管 → !aiOn 且控制源保持 human */
                (!aiOn) && aiOff && pause && resume && menu && confirm && cancel && title;
            File.WriteAllText(testOutput, new JavaScriptSerializer().Serialize(new {
                passed = passed, physicalRightHoldAndDrag = true,
                physicalF8MustNotTakeOver = (!aiOn) && aiOff, physicalPPauseResume = pause && resume,
                physicalEscSystemMenu = menu, quitConfirmationDomFlow = confirm && cancel && title,
                browserCloseAndBackKeysIgnored = passed, game = payload,
                aimX = aim.X, aimY = aim.Y, viewWidth = view.Width, viewHeight = view.Height,
                windowX = Bounds.X, windowY = Bounds.Y, windowWidth = Bounds.Width, windowHeight = Bounds.Height,
                focused = view.ContainsFocus, foregroundIsGame = GetForegroundWindow() == Handle,
                navigationCount = navigationCount, blockedNavigations = blockedNavigations }), Encoding.UTF8);
            Environment.ExitCode = passed ? 0 : 1;
        }
        finally
        {
            mouse_event(0x0010, 0, 0, 0, UIntPtr.Zero);
            SetCursorPos(original.X, original.Y);
            Close();
        }
    }

    protected override bool ProcessCmdKey(ref Message message, Keys keyData)
    {
        if (keyData == (Keys.Control | Keys.W) || keyData == (Keys.Control | Keys.N) ||
            keyData == (Keys.Control | Keys.T) || keyData == (Keys.Control | Keys.R) ||
            keyData == (Keys.Control | Keys.L) || keyData == (Keys.Control | Keys.P) ||
            keyData == (Keys.Control | Keys.S) || keyData == (Keys.Alt | Keys.Left) ||
            keyData == (Keys.Alt | Keys.Right) || keyData == Keys.BrowserBack ||
            keyData == Keys.BrowserForward || keyData == Keys.F5 || keyData == Keys.F12)
            return true;
        return base.ProcessCmdKey(ref message, keyData);
    }
}

internal static class Program
{
    [DllImport("user32.dll")] private static extern bool SetProcessDPIAware();
    [STAThread]
    private static void Main(string[] args)
    {
        SetProcessDPIAware();
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new GameWindow(args));
    }
}
