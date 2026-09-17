# Three Ink

给 Three.js 模型加上三段色阶、钢笔轮廓、胶片颗粒和磨砂质感。

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

MIT 开源；示例模型也包含在同一许可证中。
