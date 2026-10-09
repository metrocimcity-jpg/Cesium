import * as Cesium from "cesium";
import Sandcastle from "Sandcastle";
import { utmToDegrees } from "./utm.js";

const localLight = new Cesium.DirectionalLight({
  direction: new Cesium.Cartesian3(0.25, 0.55, -0.8),
});

const viewer = new Cesium.Viewer("cesiumContainer", {
  baseLayer: new Cesium.ImageryLayer(
    new Cesium.OpenStreetMapImageryProvider({
      url: "https://tile.openstreetmap.org/",
      maximumLevel: 18,
    }),
  ),
  baseLayerPicker: false,
  geocoder: false,
  sceneModePicker: false,
  animation: false,
  timeline: false,
  navigationHelpButton: false,
  homeButton: false,
  infoBox: true,
  selectionIndicator: true,
  scene3DOnly: true,
});

const DEFAULT_URL = "/SampleData/models/Revit/MEP-Boiler-Room.glb";
const overlay = document.getElementById("loadingOverlay");
const eastInput = document.getElementById("originEast");
const northInput = document.getElementById("originNorth");
const heightInput = document.getElementById("originHeight");
const zoneInput = document.getElementById("originZone");
const hemisphereInput = document.getElementById("originHemisphere");
const headingInput = document.getElementById("originHeading");
const wgs84Hint = document.getElementById("originWgs84");

let currentModel;
let objectUrl;
let placedOnGlobe = false;
let lastAppliedHeight = 0;

function setLoading(message) {
  if (!overlay) {
    return;
  }
  overlay.style.display = message ? "block" : "none";
  const heading = overlay.querySelector("h1");
  if (heading && message) {
    heading.textContent = message;
  }
}

function setLocalScene() {
  viewer.scene.globe.show = false;
  viewer.scene.skyBox.show = false;
  if (Cesium.defined(viewer.scene.skyAtmosphere)) {
    viewer.scene.skyAtmosphere.show = false;
  }
  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#12141a");
  viewer.scene.light = localLight;
}

function setGlobeScene() {
  viewer.scene.globe.show = true;
  viewer.scene.skyBox.show = true;
  if (Cesium.defined(viewer.scene.skyAtmosphere)) {
    viewer.scene.skyAtmosphere.show = true;
  }
  viewer.scene.backgroundColor = Cesium.Color.BLACK;
  viewer.scene.light = new Cesium.SunLight();
}

function readOptionalNumber(input) {
  const raw = String(input.value ?? "").trim();
  if (raw === "") {
    return undefined;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function readHeight() {
  const height = readOptionalNumber(heightInput);
  return height ?? 0;
}

function readOrigin() {
  const easting = readOptionalNumber(eastInput);
  const northing = readOptionalNumber(northInput);
  const zone = readOptionalNumber(zoneInput);
  const headingDeg = readOptionalNumber(headingInput);
  const northHemisphere = hemisphereInput.value !== "S";
  if (
    easting === undefined ||
    northing === undefined ||
    zone === undefined ||
    !Number.isInteger(zone) ||
    zone < 1 ||
    zone > 60
  ) {
    return undefined;
  }

  const { longitude, latitude } = utmToDegrees(
    easting,
    northing,
    zone,
    northHemisphere,
  );
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return undefined;
  }

  return {
    easting,
    northing,
    zone,
    northHemisphere,
    longitude,
    latitude,
    height: readHeight(),
    headingDeg: Number.isFinite(headingDeg) ? headingDeg : 0,
  };
}

function updateWgs84Hint(origin) {
  if (!wgs84Hint) {
    return;
  }
  const heightText = `elev ${readHeight().toFixed(2)} m`;
  if (!origin) {
    wgs84Hint.textContent = `Local origin, ${heightText}. Enter UTM X/Y to place on the globe.`;
    return;
  }
  wgs84Hint.textContent = `WGS84  ${origin.longitude.toFixed(6)}°, ${origin.latitude.toFixed(6)}°, ${heightText}`;
}

function globeMatrix(origin) {
  const position = Cesium.Cartesian3.fromDegrees(
    origin.longitude,
    origin.latitude,
    origin.height,
  );
  const hpr = new Cesium.HeadingPitchRoll(
    Cesium.Math.toRadians(origin.headingDeg),
    0.0,
    0.0,
  );
  return Cesium.Transforms.headingPitchRollToFixedFrame(position, hpr);
}

function localMatrix() {
  return Cesium.Matrix4.fromTranslation(
    new Cesium.Cartesian3(0.0, 0.0, readHeight()),
  );
}

function frameModel(model) {
  const sphere = Cesium.BoundingSphere.clone(model.boundingSphere);
  if (!Cesium.defined(sphere) || !(sphere.radius > 0) || !Number.isFinite(sphere.radius)) {
    return;
  }

  viewer.camera.viewBoundingSphere(
    sphere,
    new Cesium.HeadingPitchRange(
      Cesium.Math.toRadians(40),
      Cesium.Math.toRadians(placedOnGlobe ? -40 : -25),
      sphere.radius * (placedOnGlobe ? 4.5 : 2.4),
    ),
  );
  viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
}

function whenModelReady(model, callback) {
  if (model.ready) {
    callback();
    return;
  }
  const remove = model.readyEvent.addEventListener(() => {
    remove();
    callback();
  });
}

function shiftCameraWithElevation(delta, origin) {
  if (delta === 0) {
    return;
  }
  const direction = origin
    ? Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
        Cesium.Cartesian3.fromDegrees(origin.longitude, origin.latitude, origin.height),
      )
    : Cesium.Cartesian3.UNIT_Z;
  const shift = Cesium.Cartesian3.multiplyByScalar(direction, delta, new Cesium.Cartesian3());
  Cesium.Cartesian3.add(viewer.camera.position, shift, viewer.camera.position);
}

function applyCurrentOrigin(options = {}) {
  if (!currentModel) {
    return;
  }
  const followHeight = options.followHeight !== false;
  const origin = readOrigin();
  const height = origin?.height ?? readHeight();
  const delta = height - lastAppliedHeight;
  updateWgs84Hint(origin);
  if (placedOnGlobe && origin) {
    currentModel.modelMatrix = globeMatrix(origin);
    setGlobeScene();
  } else {
    placedOnGlobe = false;
    currentModel.modelMatrix = localMatrix();
    setLocalScene();
  }
  if (followHeight) {
    shiftCameraWithElevation(delta, placedOnGlobe ? origin : undefined);
  }
  lastAppliedHeight = height;
}

function placeOnGlobe() {
  if (!currentModel) {
    return;
  }
  if (!readOrigin()) {
    window.alert(
      "Enter UTM X (easting) and Y (northing) in meters, plus zone (1–60) and hemisphere.",
    );
    return;
  }
  placedOnGlobe = true;
  applyCurrentOrigin({ followHeight: false });
  frameModel(currentModel);
}

function useLocalOrigin() {
  if (!currentModel) {
    return;
  }
  placedOnGlobe = false;
  applyCurrentOrigin({ followHeight: false });
  frameModel(currentModel);
}

async function loadRevitGlb(url) {
  setLoading("Loading Revit GLB...");
  placedOnGlobe = false;

  if (currentModel) {
    viewer.scene.primitives.remove(currentModel);
    currentModel = undefined;
  }
  if (objectUrl && objectUrl !== url) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = undefined;
  }
  if (url.startsWith("blob:")) {
    objectUrl = url;
  }

  const options = {
    url,
    incrementallyLoadTextures: true,
    maximumScreenSpaceError: 4,
  };
  if (Cesium.defined(Cesium.EdgeDisplayMode)) {
    options.edgeDisplayMode = Cesium.EdgeDisplayMode.SURFACES_AND_EDGES;
  }

  const model = await Cesium.Model.fromGltfAsync(options);
  viewer.scene.primitives.add(model);
  currentModel = model;
  applyCurrentOrigin({ followHeight: false });

  await new Promise((resolve) => {
    whenModelReady(model, () => {
      frameModel(model);
      resolve();
    });
  });

  setLoading(undefined);
}

if (Cesium.PostProcessStageLibrary.isAmbientOcclusionSupported(viewer.scene)) {
  const ambientOcclusion = viewer.scene.postProcessStages.ambientOcclusion;
  ambientOcclusion.enabled = true;
  ambientOcclusion.uniforms.intensity = 2.0;
  ambientOcclusion.uniforms.bias = 0.1;
  ambientOcclusion.uniforms.lengthCap = 0.5;
}

updateWgs84Hint(undefined);
setLocalScene();

for (const el of [
  eastInput,
  northInput,
  heightInput,
  zoneInput,
  hemisphereInput,
  headingInput,
]) {
  el.addEventListener("input", () => applyCurrentOrigin());
}

Sandcastle.addToolbarButton("Open GLB", () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".glb,.gltf,model/gltf-binary,model/gltf+json";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      await loadRevitGlb(url);
    } catch (error) {
      console.error(error);
      setLoading(undefined);
      window.alert(
        `Could not open ${file.name}. Export the Revit model as glTF/GLB and try again.`,
      );
    }
  };
  input.click();
});

Sandcastle.addToolbarButton("Place on globe", placeOnGlobe);
Sandcastle.addToolbarButton("Local origin", useLocalOrigin);

loadRevitGlb(DEFAULT_URL).catch((error) => {
  console.error(error);
  setLoading(undefined);
  window.alert(
    "Could not load the bundled Revit GLB. Use Open GLB to choose an exported Revit file.",
  );
});
