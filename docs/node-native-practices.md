# Node 原生跨平台写法规范(dsh 插件强制)

> 来源:busyloop credentialsPath 在 Linux 读不到 key 的实战教训(b02)。

## 核心原则
**不手写环境变量路径** — 用 Node 内置 API。手写 USERPROFILE/HOME 在另一平台必然出错。

| 场景 | ❌ 手写(易错) | ✅ Node 原生 |
|---|---|---|
| 用户主目录 | `process.env.USERPROFILE ?? ''` | `os.homedir()`(Win→USERPROFILE, Linux/mac→HOME) |
| 拼接路径 | 手拼 `\\` 或 `/` | `node:path` 的 `join()` |
| 配置/缓存目录 | 自己拼 AppData/XDG | `env-paths`(sindresorhus)或 `xdg-app-paths` |
| 临时目录 | `/tmp` 或 `C:\\Temp` | `os.tmpdir()` |
| 换行 | `'\n'`(CRLF 平台错) | `os.EOL` |
| 并行数 | 硬编码 4/8 | `os.cpus().length` |
| 绝对路径判断 | 正则猜盘符 | `path.isAbsolute()` |

## 模板
```ts
import { homedir } from 'node:os'
import { join } from 'node:path'
const f = join(homedir(), '.dsh', 'config.yaml')
```

## 自查清单
1. grep `USERPROFILE|HOMEDRIVE|HOMEPATH|process.env.HOME` → 必须 0
2. 路径一律 join(),禁手拼分隔符
3. 临时文件用 os.tmpdir() + 唯一名
