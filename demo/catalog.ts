import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { backdrop, characterStage, type Fixture } from "../lab/scenes";
import { courtyard, lighthouse } from "./scenery";
import { studioRobot } from "./model";

export interface ViewerScene extends Fixture {
  character: boolean;
  animations: T.AnimationClip[];
  animate?: (time: number) => void;
  contactY: number;
}
interface Example {
  label: string;
  file?: string;
  factory?: typeof courtyard | typeof studioRobot;
  landscape?: boolean;
  credit: string;
  url: string;
}
const repo = "https://github.com/xymeow/three-anime-style";
export const examples: Record<string, Example> = {
  terrain: {
    label: "山地",
    landscape: true,
    credit: "原创程序化场景 · MIT",
    url: repo,
  },
  cliffs: {
    label: "峡谷",
    landscape: true,
    credit: "原创程序化场景 · MIT",
    url: repo,
  },
  hall: {
    label: "长廊",
    landscape: true,
    credit: "原创程序化场景 · MIT",
    url: repo,
  },
  forms: {
    label: "几何体",
    landscape: true,
    credit: "原创程序化场景 · MIT",
    url: repo,
  },
  courtyard: {
    label: "庭院",
    factory: courtyard,
    credit: "原创建筑场景 · MIT",
    url: repo,
  },
  lighthouse: {
    label: "灯塔",
    factory: lighthouse,
    credit: "原创海岸场景 · MIT",
    url: repo,
  },
  studio: {
    label: "维修机器人",
    factory: studioRobot,
    credit: "原创程序化模型 · MIT",
    url: repo,
  },
  avocado: {
    label: "牛油果",
    file: "models/avocado.glb",
    credit: "Avocado · Microsoft · CC0",
    url: "https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/Avocado",
  },
  fox: {
    label: "动画狐狸",
    file: "models/fox.glb",
    credit:
      "Fox · PixelMannen / tomkranis / AsoboStudio / scurest · CC0 + CC BY 4.0",
    url: "https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/Fox",
  },
  fixture: {
    label: "骨骼与形变测试",
    file: "animation-fixture.glb",
    credit: "原创 skinning + morph fixture · MIT",
    url: repo,
  },
  cesium: {
    label: "贴图人物",
    file: "lab-models/cesium-man.glb",
    credit: "Cesium Man · Cesium · CC BY 4.0（商标另列）",
    url: "https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CesiumMan",
  },
  quaternius: {
    label: "低模人物",
    file: "lab-models/quaternius-character.glb",
    credit: "Character Animated · Quaternius · CC0",
    url: "https://poly.pizza/m/DgOCW9ZCRJ",
  },
  robot: {
    label: "表情机器人",
    file: "lab-models/robot-expressive.glb",
    credit: "Robot Expressive · Quaternius / Don McCurdy · CC0",
    url: "https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf/RobotExpressive",
  },
};
export function disposeRoot(root: T.Object3D) {
  const geometries = new Set<T.BufferGeometry>(),
    materials = new Set<T.Material>(),
    textures = new Set<T.Texture>(),
    skeletons = new Set<T.Skeleton>();
  root.traverse((o) => {
    const mesh = o as T.Mesh;
    if (!mesh.isMesh) return;
    geometries.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material]) {
      materials.add(material);
      for (const value of Object.values(material))
        if (value instanceof T.Texture) textures.add(value);
    }
    if ((mesh as T.SkinnedMesh).isSkinnedMesh)
      skeletons.add((mesh as T.SkinnedMesh).skeleton);
  });
  skeletons.forEach((s) => s.dispose());
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  textures.forEach((t) => t.dispose());
}
export async function parseGLB(data: ArrayBuffer) {
  const manager = new T.LoadingManager();
  manager.setURLModifier((url) => {
    if (!url.startsWith("blob:") && !url.startsWith("data:"))
      throw new Error("请将贴图嵌入 GLB；不加载外部资源 URL。");
    return url;
  });
  return new GLTFLoader(manager).parseAsync(data, "");
}
export function stageModel(
  root: T.Object3D,
  animations: T.AnimationClip[],
): ViewerScene {
  root.traverse((o) => {
    if ((o as T.Mesh).isMesh) o.userData.inkCel = true;
  });
  return { ...characterStage(root), character: true, contactY: 0, animations };
}
export async function loadExample(
  name: string,
  faceted: boolean,
): Promise<ViewerScene> {
  const item = examples[name];
  if (item.file) {
    const response = await fetch(import.meta.env.BASE_URL + item.file);
    if (!response.ok) throw new Error(`模型下载失败：${response.status}`);
    const gltf = await parseGLB(await response.arrayBuffer());
    return stageModel(gltf.scene, gltf.animations);
  }
  if (item.factory) {
    const model = item.factory();
    const box = new T.Box3().setFromObject(model.root);
    return {
      ...model,
      target: box.getCenter(new T.Vector3()),
      direction: new T.Vector3(1, 0.6, 1.6),
      label: item.label,
      note: "同一套色阶、背景笔触与阴影；左右共享相机和动画姿态。",
      character: name === "studio",
      contactY: name === "studio" ? 0.145 : 0,
      animations: [],
    };
  }
  return {
    ...backdrop(name, faceted),
    character: false,
    contactY: 0,
    animations: [],
  };
}
