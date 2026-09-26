# Daily Task Widget / 每日任务小组件

一个完全离线的 Windows 10/11 桌面任务小组件，使用 Tauri 2、Rust、React、TypeScript、Zustand 和 SQLite。

## 下载与安装

**当前版本：v0.1.0，适用于 Windows 10/11 x64。**

- [直接下载安装包（EXE）](https://github.com/MYPoems/daily-task-widget/releases/download/v0.1.0/Daily.Task.Widget_0.1.0_x64-setup.exe)
- [查看 GitHub Releases 页面](https://github.com/MYPoems/daily-task-widget/releases/tag/v0.1.0)

下载后运行安装包，即可从开始菜单启动 Daily Task Widget。安装包尚未进行代码签名；如需核对文件，请在下载目录运行：

```powershell
(Get-FileHash -LiteralPath '.\Daily.Task.Widget_0.1.0_x64-setup.exe' -Algorithm SHA256).Hash
```

v0.1.0 安装包的 SHA-256：`0263D20AB2CD78DE2EF19CE8C31ECAF960C685717B234FECABF9FE276B066786`。

应用本身可离线使用。安装时若系统缺少 Microsoft Edge WebView2 Runtime，安装程序需要联网下载该组件；Windows 10/11 通常已提供。提醒功能需要小组件保持运行，并允许 Windows 通知。

## 功能

- 今日任务按优先级排序，待完成和已完成分别显示；顶部显示平均任务进度和完成数量。
- 快速添加、编辑、删除任务；无子项时可直接勾选完成，也可在列表中以 ±5/±10 调整进度。
- 在任务详情中添加、勾选和删除子项。有子项时，任务进度按已完成子项比例自动计算；全部完成后移至已完成区。
- 本地时间提醒、10/30/60 分钟稍后提醒、系统托盘、`Ctrl+Alt+T` 快速添加。
- 中文/英文切换；浅色/深色/跟随系统、窗口透明度、始终置顶、开机启动。
- 无账号、云同步、遥测或第三方跟踪。

## 使用

打开小组件后，点击底部“添加任务”，输入标题后按 Enter。点击任务标题可编辑日期、优先级、提醒、备注并添加子项。勾选子项会立即更新任务进度；没有子项的任务可直接勾选任务左侧方框。窗口顶部空白区域可拖动，右上角 × 将窗口收起到托盘。托盘菜单包含打开、快速添加、设置和退出。

任务数据库位于 `%APPDATA%\com.dailywidget.app\tasks.sqlite3`。更新或重新安装时请保留此文件；首次启动会自动应用数据库迁移。界面偏好保存在本机 WebView2 存储中。

## 开发

标准 Windows 开发环境需要 Node.js、Rust MSVC 工具链、Visual Studio Build Tools 的 **Desktop development with C++** 工作负载，以及 Microsoft Edge WebView2 Runtime。

```powershell
npm install
npm run tauri dev
```

当前开发机没有 MSVC `link.exe`，可以使用已安装的 GNU/MinGW 工具链：

```powershell
$env:RUSTUP_TOOLCHAIN = 'stable-x86_64-pc-windows-gnu'
$env:CARGO_TARGET_DIR = "$env:LOCALAPPDATA\Temp\daily-task-widget-target"
npm run tauri dev -- --target x86_64-pc-windows-gnu
```

构建 Windows NSIS 安装程序：

```powershell
$env:RUSTUP_TOOLCHAIN = 'stable-x86_64-pc-windows-gnu'
$env:CARGO_TARGET_DIR = "$env:LOCALAPPDATA\Temp\daily-task-widget-target"
npm run tauri build -- --target x86_64-pc-windows-gnu --bundles nsis
```

安装包输出到 `$env:CARGO_TARGET_DIR\x86_64-pc-windows-gnu\release\bundle\nsis`。若换用标准 MSVC 工具链，可省略 GNU 相关环境变量和 `--target` 参数。

## 验证

```powershell
npm run build
$env:RUSTUP_TOOLCHAIN = 'stable-x86_64-pc-windows-gnu'
$env:CARGO_TARGET_DIR = "$env:LOCALAPPDATA\Temp\daily-task-widget-target"
cargo test --manifest-path src-tauri\Cargo.toml --target x86_64-pc-windows-gnu -p task-core
```

项目图标的源文件在 `assets/app-icon.svg`。SQLite 迁移位于 `src-tauri/task-core/migrations`。
