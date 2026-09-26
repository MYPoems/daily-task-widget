# Daily Task Widget / 每日任务小组件

轻量、离线的 Windows 10/11 任务小组件。任务保存在本机 SQLite 数据库中；无需账号，没有云同步、遥测或广告。

## 下载 v1.0.0

- [Windows x64 安装包](https://github.com/MYPoems/daily-task-widget/releases/download/v1.0.0/DailyTaskWidget_1.0.0_x64-setup.exe)
- [发布说明](https://github.com/MYPoems/daily-task-widget/releases/tag/v1.0.0)
- [SHA-256 校验文件](https://github.com/MYPoems/daily-task-widget/releases/download/v1.0.0/SHA256SUMS.txt)

下载 EXE 并运行安装。安装包尚未进行商业代码签名，Windows 可能显示“未知发布者”。如需核对文件，运行：

```powershell
(Get-FileHash -LiteralPath '.\DailyTaskWidget_1.0.0_x64-setup.exe' -Algorithm SHA256).Hash
```

将结果与发布页的 `SHA256SUMS.txt` 比较。应用可离线使用；若电脑缺少 Microsoft Edge WebView2 Runtime，安装程序可能需要联网安装该组件。

## 功能

- 今天的任务分为“待完成”和“已完成”，各自按优先级排序。首页显示今日平均进度。
- 无子项的任务可直接勾选；有子项时按勾选比例计算任务进度，全部子项完成后任务自动完成。
- 每日或每周重复：当前任务完成时生成下一次任务，子项恢复为未完成。逾期任务只生成一个未来任务，不补建积压的历史任务。
- “其他日期”查看逾期、未来及已完成任务，支持标题、描述、备注搜索和日期筛选；逾期任务可移到今天。
- 系统通知提醒，以及 10、30、60 分钟稍后提醒。程序运行时，休眠唤醒后通常在一分钟内重新检查。
- 删除后的 8 秒内可撤销；之后可在设置页的“已删除任务”中恢复。
- 中英文切换、浅色／深色／跟随系统、透明度、始终置顶和开机启动。
- 圆角可拖动窗口、系统托盘、`Ctrl+Alt+T` 快速添加；重复启动会唤出已有窗口。
- 本地 JSON 备份和合并导入。手动检查 GitHub 上的新版本；只有点击“检查更新”才会联网。

## 使用与数据

点击底部“添加任务”并输入标题。点击任务标题可设置日期、重复规则、提醒和子项。拖动窗口顶部空白区域可移动窗口。右上角 × 将窗口收起到托盘；从托盘菜单可重新打开或退出。

任务数据库位于 `%APPDATA%\com.dailywidget.app\tasks.sqlite3`。从旧版升级时应用会自动迁移数据库，更新及重新安装不会删除任务。语言和外观偏好保存在本机 WebView2 存储中。

在“设置 → 备份与恢复”中导出 JSON。备份包含任务、子项、重复规则、提醒状态以及已删除任务；不包含语言和外观偏好。导入会添加不存在的任务，按任务 ID 跳过已有任务，不覆盖当前数据；旧版备份仍可导入。重大更新前建议导出一份备份。

提醒需要应用保持运行且 Windows 允许通知。过去日期的普通提醒不会补发，用户主动设置的稍后提醒仍会按时处理。

## 开发

建议使用 Windows 10/11、Node.js 22、Rust MSVC 工具链、Visual Studio Build Tools 的 **Desktop development with C++** 工作负载和 WebView2 Runtime。

```powershell
npm ci
npm run tauri dev
```

验证并构建 NSIS 安装包：

```powershell
npm run build
cargo test --manifest-path src-tauri\Cargo.toml -p task-core --locked
npm run tauri build -- --bundles nsis
```

只有 GNU/MinGW 工具链时：

```powershell
$env:RUSTUP_TOOLCHAIN = 'stable-x86_64-pc-windows-gnu'
$env:CARGO_TARGET_DIR = "$env:LOCALAPPDATA\Temp\daily-task-widget-target"
cargo test --manifest-path src-tauri\Cargo.toml --target x86_64-pc-windows-gnu -p task-core --locked
npm run tauri build -- --target x86_64-pc-windows-gnu --bundles nsis
```

推送到 `main` 或创建拉取请求会运行 Windows 检查；推送与 `package.json` 版本一致的 `v*` 标签后，[发布工作流](.github/workflows/windows.yml)会构建安装包并发布 SHA-256 校验文件。图标源文件在 `assets/app-icon.svg`，数据库迁移在 `src-tauri/task-core/migrations`。

做本机界面测试时，可用 `--config src-tauri/tauri.qa.conf.json` 构建独立测试版；它使用 `com.dailywidget.qa` 数据目录，不会写入正式版任务数据库。
