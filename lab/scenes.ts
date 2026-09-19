import * as T from "three";
export type Role = "ground" | "rock" | "wall" | "accent" | "leaf";
export interface Palette {
  name: string;
  bg: string;
  ground: string;
  rock: string;
  wall: string;
  accent: string;
  leaf: string;
  shadow: string;
  mid: string;
  light: string;
  key: string;
  ambient: string;
  ink: string;
}
export const palettes: Record<string, Palette> = {
  neutral: {
    name: "中性日光",
    bg: "#e3e8ed",
    ground: "#a4aca9",
    rock: "#818a96",
    wall: "#d8dbdb",
    accent: "#df593e",
    leaf: "#3c885e",
    shadow: "#676767",
    mid: "#bbbbbb",
    light: "#ffffff",
    key: "#ffffff",
    ambient: "#ffffff",
    ink: "#22262e",
  },
  canyon: {
    name: "朱砂 / 靛蓝",
    bg: "#f5c997",
    ground: "#be643d",
    rock: "#e59059",
    wall: "#efd3a5",
    accent: "#2143cb",
    leaf: "#556458",
    shadow: "#35316e",
    mid: "#c99c92",
    light: "#ffe7b6",
    key: "#ffffff",
    ambient: "#e4deef",
    ink: "#2e1e36",
  },
  pop: {
    name: "高饱和 / 宝蓝",
    bg: "#f5bd18",
    ground: "#184fea",
    rock: "#ff6236",
    wall: "#ffddd4",
    accent: "#fa195f",
    leaf: "#15bc80",
    shadow: "#252e77",
    mid: "#a8baf0",
    light: "#ffffff",
    key: "#ffffff",
    ambient: "#ffffff",
    ink: "#171b49",
  },
  ice: {
    name: "冰蓝 / 紫色",
    bg: "#d1e5ff",
    ground: "#8cb6ea",
    rock: "#596faf",
    wall: "#e2edf9",
    accent: "#d3438e",
    leaf: "#384c89",
    shadow: "#242e63",
    mid: "#94a8e1",
    light: "#dcf8ff",
    key: "#d4eaff",
    ambient: "#bfc9f2",
    ink: "#20233e",
  },
  paper: {
    name: "黑白墨稿",
    bg: "#efede6",
    ground: "#ccccca",
    rock: "#74777b",
    wall: "#e9e7e2",
    accent: "#303237",
    leaf: "#565c59",
    shadow: "#202020",
    mid: "#929292",
    light: "#ffffff",
    key: "#ffffff",
    ambient: "#ffffff",
    ink: "#111111",
  },
  legacy: {
    name: "线上暖灰",
    bg: "#d8dfd5",
    ground: "#b8c0a2",
    rock: "#b9b5a2",
    wall: "#e5d4b7",
    accent: "#b57860",
    leaf: "#708377",
    shadow: "#514f73",
    mid: "#c1c4c9",
    light: "#fff5df",
    key: "#fff3d8",
    ambient: "#d4dfec",
    ink: "#272333",
  },
};
export interface Fixture {
  root: T.Group;
  target: T.Vector3;
  direction: T.Vector3;
  label: string;
  note: string;
}
function mat(role: Role) {
  const m = new T.MeshStandardMaterial({
    color: palettes.neutral[role],
    roughness: 1,
  });
  m.userData.role = role;
  return m;
}
function add(
  root: T.Object3D,
  g: T.BufferGeometry,
  role: Role,
  x: number,
  y: number,
  z: number,
) {
  const m = new T.Mesh(g, mat(role));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  m.userData.inkPaint = true;
  root.add(m);
  return m;
}
function block(
  root: T.Object3D,
  w: number,
  h: number,
  d: number,
  role: Role,
  x: number,
  y: number,
  z: number,
) {
  return add(root, new T.BoxGeometry(w, h, d), role, x, y, z);
}
function terrain(root: T.Object3D, width: number, depth: number, low: boolean) {
  const g = new T.PlaneGeometry(width, depth, low ? 18 : 100, low ? 12 : 70);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      z = p.getZ(i);
    const h =
      0.4 +
      1.25 * Math.sin(x * 0.44 + z * 0.23) +
      0.72 * Math.cos(z * 0.62 - x * 0.12) +
      0.4 * Math.sin(x * 0.95 + z * 0.8);
    p.setY(i, h);
  }
  g.computeVertexNormals();
  return add(root, g, "rock", 0, 0, 0);
}
export function backdrop(kind: string, faceted = false): Fixture {
  const root = new T.Group();
  let label = "",
    note = "";
  let target = new T.Vector3(0, 1, 0),
    direction = new T.Vector3(1, 0.55, 1.5);
  if (kind === "terrain") {
    label = "山地 / 连续明暗";
    note =
      "同一片山坡比较宽笔触；平滑与低多边形切换会同时改变网格密度与面法线。";
    terrain(root, 14, 11, faceted);
    target.set(0, 0.8, 0);
    direction.set(0.6, 0.8, 1.5);
    for (const x of [-5, -2, 3, 5]) {
      const y =
        0.4 +
        1.25 * Math.sin(x * 0.44 + 2 * 0.23) +
        0.72 * Math.cos(2 * 0.62 - x * 0.12) +
        0.4 * Math.sin(x * 0.95 + 2 * 0.8);
      block(root, 0.13, 1.6, 0.13, "accent", x, y + 0.8, 2);
    }
  } else if (kind === "cliffs") {
    label = "峡谷 / 大块岩壁";
    note = "大面积垂直岩壁加斜向光照，观察笔触能否形成有方向的明暗块。";
    block(root, 14, 0.2, 10, "ground", 0, -0.1, 0);
    for (let i = 0; i < 8; i++) {
      const x = -5.6 + i * 1.65,
        h = 3.5 + Math.sin(i * 1.37) * 1.4;
      const m = add(
        root,
        new T.CylinderGeometry(1.05, 1.5, h, faceted ? 5 : 32, 8),
        "rock",
        x,
        h / 2,
        -2.2 + Math.sin(i) * 0.6,
      );
      m.rotation.z = Math.sin(i * 2) * 0.12;
    }
    block(root, 2.4, 2, 2, "wall", 3, 1, 1.6);
    block(root, 2.6, 0.2, 2.2, "accent", 3, 2.1, 1.6);
  } else if (kind === "hall") {
    label = "长廊 / 建筑背景";
    note = "墙、拱面与地面占据画面主体；检查平面上笔触和曲面上的明暗过渡。";
    block(root, 12, 0.18, 9, "ground", 0, -0.09, 0);
    block(root, 12, 5, 0.3, "wall", 0, 2.5, -3.5);
    block(root, 0.3, 5, 7, "wall", -5.85, 2.5, 0);
    for (const x of [-4, -2, 0, 2, 4]) {
      add(
        root,
        new T.CylinderGeometry(0.26, 0.33, 3.4, faceted ? 6 : 40),
        "accent",
        x,
        1.7,
        -1.8,
      );
      block(root, 0.8, 0.2, 0.7, "wall", x, 3.45, -1.8);
    }
    block(root, 10, 0.5, 0.75, "wall", 0, 3.8, -1.8);
    for (let i = 0; i < 3; i++) {
      const m = add(
        root,
        new T.TorusGeometry(1.05, 0.3, faceted ? 5 : 24, 64, Math.PI),
        "wall",
        -3.5 + i * 3.5,
        2.3,
        -3.25,
      );
      m.rotation.z = 0;
    }
    block(root, 1.6, 0.8, 1.6, "accent", 1.8, 0.4, 1.6);
    target.set(-0.4, 1.8, -0.8);
    direction.set(0.65, 0.28, 1.7);
  } else {
    label = "体块 / 曲面与分面";
    note = "比较球体、二十面体和环结的光照与描边；颜色直接由场景材质变化。";
    block(root, 10, 0.2, 7, "ground", 0, -0.1, 0);
    add(
      root,
      new T.SphereGeometry(1.35, faceted ? 12 : 64, faceted ? 8 : 40),
      "rock",
      -2.8,
      1.35,
      0,
    );
    add(
      root,
      new T.IcosahedronGeometry(1.35, faceted ? 0 : 3),
      "accent",
      0.1,
      1.35,
      0,
    );
    add(
      root,
      new T.TorusKnotGeometry(0.8, 0.26, faceted ? 40 : 150, faceted ? 5 : 20),
      "wall",
      2.9,
      1.35,
      0,
    );
    block(root, 9, 3, 0.15, "wall", 0, 1.5, -2.3);
    target.set(0, 1.3, 0);
  }
  root.traverse((o) => {
    if ((o as T.Mesh).isMesh) {
      if (kind === "forms" && (o as T.Mesh).geometry.type !== "BoxGeometry")
        o.userData.inkPaint = false;
      const m = (o as T.Mesh).material as T.MeshStandardMaterial;
      m.flatShading = faceted;
    }
  });
  return { root, target, direction, label, note };
}
export function characterStage(subject: T.Object3D): Fixture {
  const b = new T.Box3().setFromObject(subject),
    s = b.getSize(new T.Vector3()),
    c = b.getCenter(new T.Vector3());
  const anchor = new T.Group();
  const scale = 3.2 / Math.max(s.x, s.y, s.z, 0.001);
  anchor.scale.setScalar(scale);
  anchor.position.set(-c.x * scale, -b.min.y * scale, -c.z * scale);
  anchor.add(subject);
  const root = new T.Group();
  root.add(anchor);
  block(root, 4.7, 0.12, 4, "ground", 0, -0.06, 0);
  const wall = add(
    root,
    new T.SphereGeometry(1, 48, 32, 0, Math.PI * 2, 0, Math.PI / 2),
    "wall",
    0,
    0,
    -2.5,
  );
  wall.scale.set(3.8, 3.8, 0.4);
  return {
    root,
    target: new T.Vector3(0, Math.max((s.y * scale) / 2, 0.8), 0),
    direction: new T.Vector3(0.3, 0.12, 2),
    label: "人物 / 骨骼与材质",
    note: "左侧保留原材质，右侧转换光照。先看面部与关节，再加描边和磨砂；动画姿态两边同步。",
  };
}
