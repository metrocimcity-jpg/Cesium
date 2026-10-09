import { IfcAPI } from "web-ifc";

let ifcApiPromise;

function getIfcApi() {
  if (!ifcApiPromise) {
    ifcApiPromise = (async () => {
      const api = new IfcAPI();
      api.SetWasmPath("/web-ifc/", true);
      await api.Init((path) => `/web-ifc/${path.split("/").pop()}`, true);
      return api;
    })();
  }
  return ifcApiPromise;
}

function transformPoint(matrix, x, y, z) {
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
  ];
}

function transformDir(matrix, x, y, z) {
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z,
    matrix[1] * x + matrix[5] * y + matrix[9] * z,
    matrix[2] * x + matrix[6] * y + matrix[10] * z,
  ];
}

function colorKey(color) {
  return [
    color.x.toFixed(3),
    color.y.toFixed(3),
    color.z.toFixed(3),
    color.w.toFixed(3),
  ].join(",");
}

function pad4(value) {
  const rem = value % 4;
  return rem === 0 ? value : value + (4 - rem);
}

function writeGlb(json, binary) {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = pad4(jsonBytes.length);
  const binLength = pad4(binary.byteLength);
  const total = 12 + 8 + jsonLength + 8 + binLength;
  const buffer = new ArrayBuffer(total);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.set(jsonBytes, 20);
  bytes.fill(0x20, 20 + jsonBytes.length, 20 + jsonLength);

  const binHeader = 20 + jsonLength;
  view.setUint32(binHeader, binLength, true);
  view.setUint32(binHeader + 4, 0x004e4942, true);
  bytes.set(new Uint8Array(binary), binHeader + 8);
  return buffer;
}

export async function ifcBufferToGlbUrl(ifcBytes) {
  const api = await getIfcApi();
  const modelID = api.OpenModel(ifcBytes, {
    COORDINATE_TO_ORIGIN: true,
    CIRCLE_SEGMENTS: 12,
  });
  if (modelID < 0) {
    throw new Error("web-ifc could not open the IFC file.");
  }

  const groups = new Map();
  try {
    api.StreamAllMeshes(modelID, (mesh) => {
      for (let i = 0; i < mesh.geometries.size(); i++) {
        const placed = mesh.geometries.get(i);
        const geometry = api.GetGeometry(modelID, placed.geometryExpressID);
        const verts = api.GetVertexArray(
          geometry.GetVertexData(),
          geometry.GetVertexDataSize(),
        );
        const indices = api.GetIndexArray(
          geometry.GetIndexData(),
          geometry.GetIndexDataSize(),
        );
        geometry.delete?.();

        if (verts.length < 6 || indices.length < 3) {
          continue;
        }

        const key = colorKey(placed.color);
        let group = groups.get(key);
        if (!group) {
          group = {
            color: placed.color,
            positions: [],
            normals: [],
            indices: [],
          };
          groups.set(key, group);
        }

        const base = group.positions.length / 3;
        const matrix = placed.flatTransformation;
        for (let v = 0; v < verts.length; v += 6) {
          const [x, y, z] = transformPoint(matrix, verts[v], verts[v + 1], verts[v + 2]);
          const [nx, ny, nz] = transformDir(
            matrix,
            verts[v + 3],
            verts[v + 4],
            verts[v + 5],
          );
          group.positions.push(x, y, z);
          const length = Math.hypot(nx, ny, nz) || 1;
          group.normals.push(nx / length, ny / length, nz / length);
        }
        for (let n = 0; n < indices.length; n++) {
          group.indices.push(base + indices[n]);
        }
      }
    });
  } finally {
    api.CloseModel(modelID);
  }

  if (groups.size === 0) {
    throw new Error("The IFC file did not contain any displayable geometry.");
  }

  const chunks = [];
  let offset = 0;
  const bufferViews = [];
  const accessors = [];
  const materials = [];
  const primitives = [];

  for (const group of groups.values()) {
    const positionBytes = new Uint8Array(new Float32Array(group.positions).buffer);
    const normalBytes = new Uint8Array(new Float32Array(group.normals).buffer);
    const indexArray =
      group.positions.length / 3 > 65535
        ? new Uint32Array(group.indices)
        : new Uint16Array(group.indices);
    const indexBytes = new Uint8Array(
      indexArray.buffer,
      indexArray.byteOffset,
      indexArray.byteLength,
    );

    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < group.positions.length; i += 3) {
      min[0] = Math.min(min[0], group.positions[i]);
      min[1] = Math.min(min[1], group.positions[i + 1]);
      min[2] = Math.min(min[2], group.positions[i + 2]);
      max[0] = Math.max(max[0], group.positions[i]);
      max[1] = Math.max(max[1], group.positions[i + 1]);
      max[2] = Math.max(max[2], group.positions[i + 2]);
    }

    function pushView(bytes, target) {
      const padded = pad4(bytes.byteLength);
      const view = {
        buffer: 0,
        byteOffset: offset,
        byteLength: bytes.byteLength,
        target,
      };
      bufferViews.push(view);
      chunks.push(bytes);
      if (padded !== bytes.byteLength) {
        chunks.push(new Uint8Array(padded - bytes.byteLength));
      }
      offset += padded;
      return bufferViews.length - 1;
    }

    const positionView = pushView(positionBytes, 34962);
    const normalView = pushView(normalBytes, 34962);
    const indexView = pushView(indexBytes, 34963);

    const positionAccessor = accessors.length;
    accessors.push({
      bufferView: positionView,
      componentType: 5126,
      count: group.positions.length / 3,
      type: "VEC3",
      min,
      max,
    });
    const normalAccessor = accessors.length;
    accessors.push({
      bufferView: normalView,
      componentType: 5126,
      count: group.normals.length / 3,
      type: "VEC3",
    });
    const indexAccessor = accessors.length;
    accessors.push({
      bufferView: indexView,
      componentType: indexArray instanceof Uint32Array ? 5125 : 5123,
      count: group.indices.length,
      type: "SCALAR",
    });

    const material = materials.length;
    const alpha = group.color.w;
    materials.push({
      pbrMetallicRoughness: {
        baseColorFactor: [group.color.x, group.color.y, group.color.z, alpha],
        metallicFactor: 0.0,
        roughnessFactor: 0.8,
      },
      alphaMode: alpha < 0.99 ? "BLEND" : "OPAQUE",
      doubleSided: true,
    });

    primitives.push({
      attributes: { POSITION: positionAccessor, NORMAL: normalAccessor },
      indices: indexAccessor,
      material,
    });
  }

  const binary = new Uint8Array(offset);
  let cursor = 0;
  for (const chunk of chunks) {
    binary.set(chunk, cursor);
    cursor += chunk.byteLength;
  }

  const glb = writeGlb(
    {
      asset: { version: "2.0", generator: "Cesium Revit IFC sample" },
      buffers: [{ byteLength: binary.byteLength }],
      bufferViews,
      accessors,
      materials,
      meshes: [{ primitives }],
      nodes: [{ mesh: 0 }],
      scenes: [{ nodes: [0] }],
      scene: 0,
    },
    binary.buffer,
  );

  return URL.createObjectURL(new Blob([glb], { type: "model/gltf-binary" }));
}
