# Daily Task Widget / 每日任务小组件

轻量、离线的 Windows 10/11 桌面任务小组件。任务保存在本机 SQLite 数据库中，无账号、云同步、遥测或第三方跟踪。

## 下载

**当前版本：v0.2.0 · Windows x64**

- [下载安装包](https://github.com/MYPoems/daily-task-widget/releases/download/v0.2.0/DailyTaskWidget_0.2.0_x64-setup.exe)
- [查看 v0.2.0 发布页](https://github.com/MYPoems/daily-task-widget/releases/tag/v0.2.0)
- [下载 SHA-256 校验文件](https://github.com/MYPoems/daily-task-widget/releases/download/v0.2.0/SHA256SUMS.txt)

下载后运行 EXE 安装包，并从开始菜单启动。安装包未做代码签名，Windows 可能显示“未知发布者”。可用 PowerShell 核对下载文件：

```powershell
(Get-FileHash -LiteralPath '.\DailyTaskWidget_0.2.0_x64-setup.exe' -Algorithm SHA256).Hash
```

与发布页的 `SHA256SUMS.txt` 比较即可。应用可离线使用；若电脑缺少 Microsoft Edge WebView2 Runtime，安装程序可能需要联网安装该组件。

## 功能

- 今日任务分为待完成与已完成，分别按优先级排序。顶部显示今日平均进度。
- “其他日期”查看逾期、未来与历史已完成任务；逾期任务可一键移到今天。
- 任务支持标题、描述、日期、优先级、提醒和备注。没有子项时直接勾选任务；有子项时根据勾选比例自动计算完成百分比。
- 本地通知提醒和 10/30/60 分钟稍后提醒。程序保持运行时，休眠唤醒后最多约一分钟重新检查到期提醒。
- 中文/英文切换、浅色/深色/跟随系统、透明度、始终置顶、开机启动。
- 可拖动的圆角窗口、系统托盘、`Ctrl+Alt+T` 快速添加；重复启动会唤出已有窗口。
- 设置页可将全部任务及子项导出为本地 JSON 文件，并从备份合并恢复。

## 使用与数据

点击底部“添加任务”，输入标题后按 Enter。点击任务标题可打开详情并添加子项。窗口顶部空白区域可拖动；右上角 × 会收起到托盘，托盘菜单可重新打开或退出。

任务数据库：`%APPDATA%\com.dailywidget.app\tasks.sqlite3`。更新和重新安装会保留这个文件；首次启动会自动迁移旧数据。界面偏好保存在本机 WebView2 存储中。

在“设置 → 备份与恢复”中选择“导出备份”并保存 JSON。恢复时选择“导入备份”：导入会新增备份中尚不存在的任务，按任务 ID 跳过已有任务，不覆盖或删除当前任务；任务、子项、提醒状态都会保存。语言、主题、透明度等界面偏好不在 JSON 中。建议在重大更新前导出一份备份并妥善保管。

提醒需要程序保持运行且 Windows 允许通知。已经过去的旧日期任务不会补发普通提醒；用户主动设置的稍后提醒仍会按其到期时间处理。

## 开发

推荐 Windows 10/11、Node.js 22、Rust MSVC 工具链、Visual Studio Build Tools 的 **Desktop development with C++** 工作负载，以及 WebView2 Runtime。

```powershell
npm ci
npm run tauri dev
```

验证和构建 NSIS 安装包：

```powershell
npm run build
cargo test --manifest-path src-tauri\Cargo.toml -p task-core --locked
npm run tauri build -- --bundles nsis
```

本地若仅有 Rust GNU/MinGW 工具链：

```powershell
$env:RUSTUP_TOOLCHAIN = 'stable-x86_64-pc-windows-gnu'
$env:CARGO_TARGET_DIR = "$env:LOCALAPPDATA\Temp\daily-task-widget-target"
cargo test --manifest-path src-tauri\Cargo.toml --target x86_64-pc-windows-gnu -p task-core --locked
npm run tauri build -- --target x86_64-pc-windows-gnu --bundles nsis
```

推送到 `main` 或创建拉取请求会运行 Windows 构建检查；推送与 `package.json` 版本一致的 `v*` 标签后，GitHub Actions 会构建安装包，发布 Release 和 `SHA256SUMS.txt`。工作流见 [windows.yml](.github/workflows/windows.yml)。图标源文件位于 `assets/app-icon.svg`；数据库迁移位于 `src-tauri/task-core/migrations`。
