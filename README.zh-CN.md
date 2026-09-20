# Anime Style for Three.js

**一个让现有 Three.js 场景呈现动画画风的开源渲染库。**

角色用三段色阶，背景用宽笔触塑造明暗，再按需要叠加钢笔描边、动画阴影、胶片颗粒和磨砂。模型、贴图和动画继续使用你自己的，各层效果可以单独调整。

[**在线试玩**](https://xymeow.github.io/three-anime-style/) · [**左右对照实验室**](https://xymeow.github.io/three-anime-style/?scene=robot&palette=neutral&compare=source) · [English](README.md)

![左侧原材质，右侧开启全套三渲二效果](docs/rendering-comparison.png)

_同一个模型、视角与姿态。左侧为原材质；右侧开启三段色阶、钢笔描边、背景笔触、动画阴影，以及 50% 胶片颗粒和 50% 亚克力磨砂。_

## 这是做什么的？

这是一个面向 **Three.js r186 + WebGLRenderer** 的 TypeScript 库，附带可直接玩的网页 demo 和给 AI coding agent 使用的接入 skill。你可以把它接进已有项目，也可以先把 GLB 拖进试玩页看效果。

| 模块           | 画面会怎样变化                               |
| -------------- | -------------------------------------------- |
| 角色色阶       | 光照分为亮、中、暗三档，暗部可加少量反光     |
| 背景笔触       | 墙面、岩石和地面的明暗过渡带上固定的宽笔触   |
| 描边与动画阴影 | 钢笔风轮廓，选中角色背后可增加轻微片层偏移影 |
| 后期质感       | 胶片颗粒、亚克力磨砂各自调节                 |
| 动画节奏       | 姿态按 12 帧采样，相机与画面继续流畅刷新     |

材质和后期 pass 可以单独使用。实验室里的抽象接地影是应用层示例，可以根据自己的舞台调整。

## 先看效果

**[统一试玩页](https://xymeow.github.io/three-anime-style/)** 收录全部 13 个示例：建筑、地形、静物、动画人物和骨骼／形变测试模型。支持本地 GLB 导入、六套配色、原材质／笔触／阴影对照，以及截图和参数导出。所有模型共用相同的渲染与动画阴影控制。

旧的 `?example=fixture` 仍然打开原模型；`lab.html` 会保留场景、配色和对照参数，跳转到这一页。

本地运行需要 Node 20.19+：

```sh
git clone https://github.com/xymeow/three-anime-style.git
cd three-anime-style
npm ci
npm run dev
```

打开终端给出的 Vite 地址进入统一试玩页。本地版与在线版使用同一份代码，无需部署到作者的网站，也无需账号、后端或 API key。安装好依赖后，附带模型和嵌入式 GLB 可离线使用。

导入的 GLB 在浏览器内读取，不上传；试玩页要求资源嵌入文件，不加载外部资源 URL。`npm run build:demo` 生成的 `site-dist/` 也可以由你自己托管。

## 快速接入：给自己的 Three.js 项目加动画画风

渲染实现就在库的 [`src/`](src/index.ts) 中，可以直接通过 TypeScript / JavaScript 调用。[Skill](skills/three-anime-style/SKILL.md) 是给 coding agent 看的接入指南，帮助它找到你项目的渲染循环、材质和资源释放位置；手动接入无需安装 skill。

### 1. 安装

需要 **Three.js r186 + WebGLRenderer**，先确认已有项目的 Three.js 版本。目前通过 Git 版本标签安装：

```sh
npm install three@0.186.0 github:xymeow/three-anime-style#v0.4.3
```

### 2. 给已有模型加三段色阶

在模型加载完成后调用。`model` 可以是 glTF 的 `gltf.scene`、一个 Mesh、一个 Group，也可以直接传整个 `scene`：

```ts
import { applyInk } from "@xymeow/three-anime-style";

const style = applyInk(model);
```

继续使用原有的 renderer、相机、灯光和动画循环。支持的材质会转换为三段光照，模型贴图和动画保留。只做这一步时，原来的 `renderer.render(scene, camera)` 照常使用。

### 3. 加上钢笔描边与可选质感

如果项目还没有 composer，用已有 renderer 创建一个：

```ts
import { InkPass } from "@xymeow/three-anime-style";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const ink = new InkPass(scene, camera, {
  penWidth: 1.1,
  grain: 0,
  acrylic: 0,
  pixelRatio: renderer.getPixelRatio(),
});
composer.addPass(ink);
composer.addPass(new OutputPass());

// 在已有动画循环中，用这一行替换 renderer.render(scene, camera)：
composer.render();
```

已有 composer 的项目只需插入 `InkPass`，位置在场景渲染之后、最终 `OutputPass` 之前。相机控制和模型动画仍在原来的循环里更新。

先看上面的干净效果，再实时加一点表面质感：

```ts
ink.configure({ grain: 0.15, acrylic: 0.2 });
```

无需重新加载模型，就能切换原材质与效果：

```ts
style.setEnabled(false);
ink.enabled = false;
// 恢复效果：
style.setEnabled(true);
ink.enabled = true;
```

窗口变化时，同步调整 renderer、composer 的尺寸和相机。DPR 改变时，同步两者的像素比例与 `ink.configure({ pixelRatio })`。移除效果时调用 `style.dispose()`，从 composer 中移除 `ink`，再调用 `ink.dispose()`；整个页面卸载时，一并释放自己创建的其他 pass 和 composer。

[完整接入示例](docs/integration.md)提供缩放、DPR 和可选 12 帧动画的代码；[API 文档](docs/api.md)介绍背景笔触与动画阴影。可以先在[本地试玩页](#先看效果)调出喜欢的观感，再把参数用于自己的项目，游戏里无需额外放一个调参面板。

第一次对照先保留原场景灯光。暗光或低角度描边异常的排查见[调参与故障定位](docs/integration.md#tune-in-layers)。

### 哪些模型适用？

支持常见不透明材质、透明裁切、骨骼动画、形变和实例模型。PBR 材质会转换成 toon 光照，贴图和几何体仍归原应用管理。

玻璃、混合透明和自定义 shader 保留原材质，原因记录在 `style.skipped`。当前使用 WebGL shader chunk 和标准深度；WebGPU 或特殊渲染管线接入前请看[兼容性表](docs/api.md#compatibility)。

## 让 agent 帮你接

安装库后，把包内附带的 skill 复制到你的项目：

```sh
mkdir -p .agents/skills
cp -R node_modules/@xymeow/three-anime-style/skills/three-anime-style .agents/skills/
```

然后告诉 agent：

> 用 $three-anime-style 给这个 Three.js 场景加动画画风。保留模型和动画，复用渲染循环，加一个原图/效果切换。先做干净的三段色阶，再让背景笔触、阴影和胶片质感可调。

[Skill](skills/three-anime-style/SKILL.md)说明了接入步骤、兼容性判断和资源释放规则。支持 `SKILL.md` 的 agent 可以直接使用；其他 agent 也可以读取这份文件。要修改库本身，从 [AGENTS.md](AGENTS.md) 开始。

## 开发与来源

```sh
npm run check
npm test
npm run build:demo
npm run format:check
```

库输出到 `dist/`，统一试玩页输出到 `site-dist/`。修改描边或阴影遮罩后，在 Vite 下打开 `/tests/gpu.html` 检查真实 WebGL 渲染。原创动画测试模型可通过 `node scripts/create-fixture.mjs` 重新生成。

渲染方向参考 [Shapefarm 的 Orbitals 技术文章](https://www.unrealengine.com/tech-blog/stepping-inside-a-retro-anime-inspired-game-a-look-into-the-rendering-of-orbitals)。代码和原创场景使用 MIT 许可证；外部模型按各自许可证提供，详见[试玩模型署名](public/ATTRIBUTION.md)与[实验室模型署名](public/lab-models/CREDITS.md)。
