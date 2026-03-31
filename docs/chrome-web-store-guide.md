# Chrome Web Store 上架指南

## 一、前置准备

### 1. 注册开发者账号
- 访问 https://chrome.google.com/webstore/devconsole
- 使用 Google 账号登录
- 支付一次性注册费 **$5 USD**
- 注册后即可发布扩展

### 2. 部署隐私政策页面
隐私政策文件已在 `docs/privacy-policy.html`，需要部署到公网可访问的 URL。

**方式一：GitHub Pages（推荐）**
```bash
# 1. 在 GitHub 创建仓库（如果还没有）
# 2. 进入仓库 Settings → Pages → Source 选 main 分支 /docs 目录
# 3. 部署后 URL 格式为：
#    https://<username>.github.io/<repo-name>/privacy-policy.html
```

**方式二：其他静态托管**
- Vercel / Netlify / Cloudflare Pages 均可
- 上传 `docs/privacy-policy.html`，记下访问 URL

---

## 二、需要准备的材料

### 必须材料

| 材料 | 说明 | 状态 |
|------|------|------|
| **扩展 ZIP 包** | `npm run build` 后打包 `dist/` 目录 | 需生成 |
| **扩展名称** | `红薯雷达` | 已准备（见 `docs/store-listing.md`） |
| **简短描述** | 132 字符以内 | 已准备（见 `docs/store-listing.md`） |
| **详细描述** | 商店详情页展示 | 已准备（见 `docs/store-listing.md`） |
| **图标** | 128x128 PNG | 需从 `assets/icons/icon.svg` 导出 |
| **截图** | 1280x800 PNG，至少 1 张，最多 5 张 | 需截取 |
| **隐私政策 URL** | 公网可访问的链接 | 需部署 |
| **商店分类** | Productivity（生产力工具） | 已确定 |
| **语言** | Chinese (Simplified) | 已确定 |

### 可选材料

| 材料 | 尺寸 | 说明 |
|------|------|------|
| 小宣传图 | 440x280 PNG | 商店推荐位展示 |
| 大宣传图 | 1400x560 PNG | 精选推荐横幅 |
| 标记石图 | 920x680 PNG | 商店首页特色展示 |
| English 描述 | 文本 | 已准备（见 `docs/store-listing.md`） |

### 截图内容建议

需要在真实小红书页面截取，1280x800 分辨率：

1. **信息流过滤效果** — 小红书首页，几张卡片被模糊标记，对比明显
2. **详情分析** — 点开一条笔记，左上角显示分析标签
3. **Popup 弹窗** — 扩展弹窗面板（开关、统计）
4. **设置页面** — API 配置、灵敏度滑块、自定义规则
5. **统计页面** — 趋势图表

> 提示：用 Chrome DevTools → Device Toolbar 设置 1280x800 视口截图。
> Popup 截图：右键扩展图标 → 审查弹出内容，可以固定弹窗后截取。

---

## 三、生成 ZIP 包

```bash
# 1. 构建生产版本
npm run build

# 2. 打包 dist 目录
cd dist && zip -r ../hongshu-radar.zip . && cd ..

# 生成的 hongshu-radar.zip 就是要上传的文件
```

---

## 四、导出图标 PNG

SVG 源文件在 `assets/icons/icon.svg`，需要导出三个尺寸替换现有 PNG：

**方式一：命令行（需安装 librsvg）**
```bash
brew install librsvg
rsvg-convert -w 16 -h 16 assets/icons/icon.svg > assets/icons/icon16.png
rsvg-convert -w 48 -h 48 assets/icons/icon.svg > assets/icons/icon48.png
rsvg-convert -w 128 -h 128 assets/icons/icon.svg > assets/icons/icon128.png
```

**方式二：在线工具**
- 打开 https://svgtopng.com
- 上传 `icon.svg`，分别导出 16x16、48x48、128x128

**方式三：Figma / Sketch**
- 导入 SVG，导出为 PNG @1x

导出后重新 `npm run build` 即可。

---

## 五、提交上架步骤

### Step 1：进入开发者控制台
访问 https://chrome.google.com/webstore/devconsole

### Step 2：新建商品
点击 "新建商品" → 上传 `hongshu-radar.zip`

### Step 3：填写商品详情

在"商店列表"页面填写：

- **语言**：中文（简体）
- **扩展名称**：`红薯雷达`
- **简短描述**：复制 `docs/store-listing.md` 中的简短描述
- **详细描述**：复制 `docs/store-listing.md` 中的详细描述
- **分类**：生产力工具（Productivity）
- **图标**：上传 128x128 PNG
- **截图**：上传准备好的截图

### Step 4：填写隐私权相关

在"隐私权做法"页面：

- **隐私权政策 URL**：填入部署好的隐私政策页面地址
- **单一用途描述**：`识别并标记小红书信息流中的低质量内容`
- **权限理由**：
  - `storage` → 在本地保存用户配置和分析结果缓存
  - `host_permissions (xiaohongshu.com)` → 在小红书页面注入内容分析脚本
  - `optional_host_permissions` → 仅用于用户手动配置并授权的 AI API 域名；扩展不会自动访问任意站点
- **数据使用声明**：不要直接勾选“我的扩展不收集或使用用户数据”，需按实际情况披露：
  - 扩展会读取小红书页面中的标题、作者名、点赞数
  - 当用户主动打开详情时，扩展会读取详情页正文内容
  - 上述内容可能发送到用户自行配置的 AI API 端点进行分析
  - API Key、配置和缓存仅保存在本地浏览器

建议将 `docs/store-listing.md` 中的以下内容直接粘贴到后台对应字段：
- 审核备注 → `审核说明（可粘贴到审核备注）`
- 权限理由 → `权限说明（可粘贴到权限理由）`
- Privacy practices → `数据披露说明（可粘贴到 Privacy practices）`

### Step 5：设置分发范围

- **公开范围**：公开
- **地区**：所有地区（或仅中国）

### Step 6：提交审核

确认所有信息无误后，点击"提交审核"。

---

## 六、审核须知

- **首次审核**通常需要 **1-5 个工作日**
- 审核关注点：
  - 权限是否合理（不要申请多余权限）
  - 隐私政策是否完整
  - 是否有远程代码执行（MV3 已禁止）
  - 描述是否与实际功能一致
- 如被拒绝，会收到邮件说明原因，修改后可重新提交
- **更新版本**审核通常更快（1-2 天）

---

## 七、后续更新流程

```bash
# 1. 修改代码
# 2. 更新 manifest.json 中的 version（如 "0.1.0" → "0.2.0"）
# 3. 构建 + 打包
npm run build
cd dist && zip -r ../hongshu-radar.zip . && cd ..
# 4. 在开发者控制台上传新包 → 提交审核
```

---

## 八、常见问题

**Q: 审核被拒怎么办？**
A: 根据邮件中的拒绝原因修改，常见原因包括权限过多、描述不清、缺少隐私政策。

**Q: 可以免费上架吗？**
A: 不可以，Google 要求一次性 $5 注册费。

**Q: 上架后多久能搜到？**
A: 审核通过后立即上线，但搜索索引可能需要几小时到一天。

**Q: 需要提供源码吗？**
A: 不需要，只上传构建后的 ZIP 包。

**Q: 版本号有要求吗？**
A: 每次更新必须比上一版大，格式为 `x.y.z`。
