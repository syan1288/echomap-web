# Echo Map — 左侧栏（与 `echo-map-unified-description_副本.md` 对齐）

以下摘要自 `~/Documents/echomap/docs/echo-map-unified-description_副本.md` 中「页面 1 Prompt」的左侧栏规则，实现时以百分比 / `vh` 近似「左栏高度」百分比（桌面侧栏高度取 `100dvh`）。

## 顺序（固定）

1. 顶部胶囊：`Home` / `Gallery`
2. 主标题：`Echo Map`（Gasoek One，品牌蓝 `#0053D4`）
3. 蓝色单色线描旅行地图插画（本次 SVG：`public/assets/echo-sidebar-brand.svg`，viewBox `0 0 180 146`）
4. 三行居中说明文案（固定英文，见下）
5. 底部信息条（Home 经纬度 / Gallery 统计）

## 尺寸与间距

| 项目 | 规则 |
|------|------|
| 按钮宽 | 左栏宽度 **52%** |
| 按钮高 | 左栏高度 **4.8%**（`min-h-[4.8vh]`） |
| 按钮顶距左栏顶 | **2.5%**（`pt-[2.5vh]`） |
| 按钮底 → 主标题顶 | **9%**（`mb-[9vh]` on nav） |
| 主标题底 → 插画顶 | **4.5%**（`mb-[4.5vh]` on `h1`） |
| 插画宽 | 左栏 **60%**（`w-[60%]`） |
| 插画高 | 左栏 **25%**（`max-h-[25vh]` + `object-contain`，与宽高比取较小者） |
| 插画底 → 文案顶 | **5.5%**（插画容器 `mb-[5.5vh]`） |
| 文案块宽 | 左栏 **68%**（`w-[68%]`） |
| 文案底 → 底部模块顶 | **5.5%**（`mb-[5.5vh]` on 文案） |

## 文案（固定三行，居中）

```
Stories and photos of long walks,
wrong turns,
and everyday discoveries.
```

- 字体：UI Body（原型用 Plus Jakarta Sans / Helvetica Neue 近似 Google Sans）
- 颜色：与主标题相同（品牌蓝 `#0053D4`）
- 行距：**1.25**

## 插画文件

源文件：`public/assets/echo-sidebar-brand.svg`（Quiver / Arrow 导出，描边 `#0D41A4`，与品牌蓝同系）。
