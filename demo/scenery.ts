import * as T from "three";
const material = (color: string) =>
  new T.MeshStandardMaterial({ color, roughness: 1 });
function mesh(
  root: T.Object3D,
  geometry: T.BufferGeometry,
  color: T.Material,
  x: number,
  y: number,
  z: number,
  paint = true,
) {
  const m = new T.Mesh(geometry, color);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  m.userData.inkPaint = paint;
  root.add(m);
  return m;
}
function box(
  root: T.Object3D,
  size: number[],
  color: T.Material,
  x: number,
  y: number,
  z: number,
  paint = true,
) {
  return mesh(
    root,
    new T.BoxGeometry(...(size as [number, number, number])),
    color,
    x,
    y,
    z,
    paint,
  );
}
function hill(
  root: T.Object3D,
  x: number,
  y: number,
  z: number,
  size: number[],
  color: T.Material,
) {
  const m = mesh(root, new T.SphereGeometry(1, 32, 24), color, x, y, z);
  m.scale.set(...(size as [number, number, number]));
  return m;
}
function tree(root: T.Object3D, x: number, z: number, height = 2) {
  const bark = material("#847359"),
    leaves = material("#708377");
  mesh(
    root,
    new T.CylinderGeometry(0.09, 0.12, height, 10),
    bark,
    x,
    height / 2,
    z,
  );
  const crown = mesh(
    root,
    new T.IcosahedronGeometry(1, 2),
    leaves,
    x,
    height,
    z,
  );
  crown.scale.set(0.65, height * 0.65, 0.65);
}
function roof(
  root: T.Object3D,
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
) {
  const shape = new T.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(0, height);
  shape.lineTo(width / 2, 0);
  shape.closePath();
  return mesh(
    root,
    new T.ExtrudeGeometry(shape, { depth, bevelEnabled: false }),
    material("#b57860"),
    x,
    y,
    z - depth / 2,
  );
}
function arch(root: T.Object3D, x: number, y: number, z: number) {
  const shape = new T.Shape();
  shape.moveTo(-0.55, 0);
  shape.lineTo(-0.55, 1);
  shape.absarc(0, 1, 0.55, Math.PI, 0, true);
  shape.lineTo(0.55, 0);
  shape.lineTo(0.38, 0);
  shape.lineTo(0.38, 1);
  shape.absarc(0, 1, 0.38, 0, Math.PI, false);
  shape.lineTo(-0.38, 0);
  shape.closePath();
  return mesh(
    root,
    new T.ExtrudeGeometry(shape, { depth: 0.28, bevelEnabled: false }),
    material("#e4d6b8"),
    x,
    y,
    z,
  );
}
export function courtyard() {
  const root = new T.Group();
  root.name = "Sunlit courtyard";
  const sand = material("#ccb99b"),
    wall = material("#e5d4b7"),
    dark = material("#536b69"),
    stone = material("#a3afa0");
  box(root, [10, 0.22, 8], sand, 0, 0, 0);
  box(root, [4.8, 2.7, 2.3], wall, -0.8, 1.46, -1.65);
  roof(root, 5.15, 0.85, 2.65, -0.8, 2.85, -1.65);
  box(root, [2.35, 4.2, 2.9], wall, 2.8, 2.2, -1.4);
  roof(root, 2.7, 0.85, 3.25, 2.8, 4.32, -1.4);
  box(root, [2.3, 2.9, 2.5], wall, -3.3, 1.55, -0.4);
  roof(root, 2.65, 0.7, 2.85, -3.3, 3, -0.4);
  for (const x of [-2.2, -0.95, 0.3, 1.55]) arch(root, x, 0.12, 0.25);
  box(root, [5.3, 0.18, 1.15], wall, -0.33, 1.85, 0.6);
  for (const x of [-2, -0.5, 1]) {
    box(root, [0.6, 0.82, 0.05], dark, x, 1.7, -0.47);
    box(root, [0.7, 0.1, 0.12], sand, x, 1.25, -0.4);
  }
  for (const y of [1.25, 2.95]) box(root, [0.7, 0.9, 0.06], dark, 2.8, y, 0.08);
  box(root, [1.1, 1.8, 0.08], dark, -3.3, 1.02, 0.9);
  for (let i = 0; i < 3; i++)
    box(
      root,
      [1.6, 0.16, 1.35 - i * 0.3],
      stone,
      -3.3,
      0.13 + i * 0.14,
      1.3 - i * 0.2,
    );
  const basin = mesh(
    root,
    new T.CylinderGeometry(0.9, 1, 0.3, 32),
    stone,
    0.2,
    0.27,
    2.15,
  );
  mesh(
    root,
    new T.CylinderGeometry(0.76, 0.76, 0.04, 32),
    material("#769d9e"),
    basin.position.x,
    0.44,
    basin.position.z,
    false,
  );
  mesh(root, new T.CylinderGeometry(0.18, 0.25, 0.8, 16), sand, 0.2, 0.8, 2.15);
  mesh(root, new T.SphereGeometry(0.2, 16, 12), sand, 0.2, 1.23, 2.15);
  tree(root, 3.7, 2.3, 2.3);
  tree(root, -4.1, 2.4, 1.8);
  for (const [x, z] of [
    [1.5, 1.1],
    [-1.3, 2.9],
    [3.65, 0.8],
  ]) {
    mesh(
      root,
      new T.CylinderGeometry(0.2, 0.15, 0.36, 16),
      material("#ba805e"),
      x,
      0.29,
      z,
    );
    hill(root, x, 0.6, z, [0.32, 0.3, 0.32], material("#7f916a"));
  }
  return { root };
}
export function lighthouse() {
  const root = new T.Group();
  root.name = "Lighthouse coast";
  const rock = material("#b9b5a2"),
    white = material("#e3dccc"),
    red = material("#a66353"),
    sea = material("#8cacad");
  mesh(root, new T.CylinderGeometry(5.1, 5.1, 0.13, 80), sea, 0, -0.3, 0);
  hill(root, 0, -0.7, 0, [3.2, 1.4, 2.7], rock);
  hill(root, -1, -0.65, 1, [2.8, 1.2, 2.6], rock);
  mesh(
    root,
    new T.CylinderGeometry(0.59, 0.84, 3.5, 40),
    white,
    0.6,
    2.15,
    -0.2,
  );
  mesh(
    root,
    new T.CylinderGeometry(0.655, 0.69, 0.45, 40),
    red,
    0.6,
    2.55,
    -0.2,
  );
  mesh(
    root,
    new T.CylinderGeometry(0.93, 0.93, 0.16, 40),
    rock,
    0.6,
    3.99,
    -0.2,
  );
  mesh(
    root,
    new T.CylinderGeometry(0.6, 0.6, 0.75, 16),
    material("#566e72"),
    0.6,
    4.43,
    -0.2,
    false,
  );
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    box(
      root,
      [0.065, 0.8, 0.065],
      white,
      0.6 + Math.cos(a) * 0.58,
      4.43,
      -0.2 + Math.sin(a) * 0.58,
    );
  }
  mesh(root, new T.ConeGeometry(0.82, 0.6, 32), red, 0.6, 5.05, -0.2);
  box(root, [1.95, 1.15, 1.55], white, -1.5, 0.96, 0.3);
  roof(root, 2.3, 0.65, 1.9, -1.5, 1.58, 0.3);
  box(root, [0.42, 0.8, 0.06], material("#667270"), -1.5, 0.75, 1.11);
  for (const x of [-2.03, -0.98])
    box(root, [0.3, 0.35, 0.06], material("#667270"), x, 1.12, 1.11);
  for (let i = 0; i < 6; i++)
    box(root, [0.6, 0.1, 0.32], rock, -1.5, 0.12 + i * 0.065, 2.8 - i * 0.28);
  for (let i = 0; i < 5; i++)
    hill(root, -3 + i * 1.5, -0.25, -3.3, [0.8, 0.5, 0.6], rock);
  return { root };
}
