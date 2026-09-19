# Three Ink

给 Three.js 模型加上三段色阶、背景笔触、钢笔轮廓、胶片颗粒和磨砂质感。

[在线试玩](https://xymeow.github.io/three-ink/) · [完整 API](README.md) · [给 AI agent 的 skill](skills/three-ink/SKILL.md)

从我们研究 Orbitals 时做的小实验里拆出来的通用模块。三段光照负责主要的二维观感，描边和后期质感分别控制。默认磨砂强度是我们选定的 50%。

```sh
git clone https://github.com/xymeow/three-ink.git
cd three-ink
npm ci
npm run dev
```

预览器可以拖入 GLB、旋转观察、切换原始 / 纯色阶 / 完整效果，导出截图或参数。内置机器人由几何体搭建，另有一个带骨骼和形变动画的 GLB 测试模型。

接入已有场景只需要两个模块：

```ts
const binding = applyInk(model);
const ink = new InkPass(scene, camera, {
  acrylic: 0.5,
  grain: 0.5,
  pixelRatio: renderer.getPixelRatio(),
});
// 把 ink 加在已有 composer 的场景渲染之后、OutputPass 之前。
```

`applyInk` 保留模型贴图和动画数据，替换光照材质；`InkPass` 处理轮廓和表面质感。它们可以单独使用。12 帧动画通过 `steppedTime` 采样姿态，相机和画面依然流畅刷新。

第一版针对 Three.js r186 的 WebGLRenderer。常见不透明材质、骨骼、形变和实例模型可用。玻璃、混合透明和自定义 shader 会保持原样，并列出原因。完整接入、释放资源和兼容性说明见英文 README。

把仓库里的 `skills/three-ink` 复制到项目的 `.agents/skills/three-ink`，然后告诉 agent：

> 用 $three-ink 给这个场景加上三段色阶、钢笔轮廓和 50% 磨砂。保留现有模型动画，并提供原图/效果切换。

代码与原创场景为 MIT；外部模型按各自的 CC0 / CC BY 4.0 许可证提供，详见 [模型署名](public/ATTRIBUTION.md)。

## 背景笔触与示例

新增庭院建筑、海边灯塔、Avocado 和动画狐狸，加上原来的机器人和动画测试，一共六个示例。

背景笔触沿用最初实验的做法：固定的大块笔刷遮罩，通过世界坐标投射到墙面、地面和山丘上，轻微改变明暗过渡。背景采用连续的绘画式光照，主体仍保持三段色阶。它与屏幕上的胶片颗粒分开控制。

选 **Paint** 可以单独观察笔触；用 **Scenery brushwork** 调强度，**Brush size** 调大小。**Ink + film** 再叠加钢笔、胶片和磨砂。狐狸可以分别播放观察、走路、跑步三组动作。

模块提供 `createBrushTexture()` 与 `applyInk(..., { paint: { map, strength, scale, select } })`；`select` 决定哪些网格属于绘画式背景，`binding.setPaint()` 可在运行时调整。完整代码见英文 README。

### 本地实验：动画阴影

实验分支新增 `applyInk(model, { shadowHighlight: 0.65 })` 与 `binding.setShadowHighlight(0.4)`，在角色暗部增加少量反光；范围 0..1，默认 0，不影响背景笔触材质。

`InkPass` 可设置 `celShadow: 0.45` 和 `celShadowSelect: mesh => mesh.userData.inkCel === true`，给选中的角色轮廓添加轻微片层偏移影。默认关闭；关闭描边时也能单独工作。前方物体会遮挡偏移影。

实验页另有抽象接地影，并关闭角色的计算投影和接收投影。接地影是应用层放在 y=0 舞台上的平面色块，跟随可识别的髋部骨骼；崎岖地形需要应用层适配。阴影 pass 不会自行修改场景灯光或投影设置。

这些选项尚未发布到 `v0.2.0`。描边修复、透视／正交斜面和遮挡的 WebGL 像素回归位于 `/tests/gpu.html`。
