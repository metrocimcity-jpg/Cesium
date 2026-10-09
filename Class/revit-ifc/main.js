import * as Cesium from "cesium";
import Sandcastle from "Sandcastle";
import { utmToDegrees } from "../revit/utm.js";
import { ifcBufferToGlbUrl } from "./ifcToGlb.js";

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

const DEFAULT_URL = "/SampleData/models/Revit/Sample.ifc";
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
  const raw = String(input.value ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".");
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
  const zoneNumber = zone === undefined ? undefined : Math.round(zone);
  if (
    easting === undefined ||
    northing === undefined ||
    zoneNumber === undefined ||
    zoneNumber < 1 ||
    zoneNumber > 60
  ) {
    return undefined;
  }

  const { longitude, latitude } = utmToDegrees(
    easting,
    northing,
    zoneNumber,
    northHemisphere,
  );
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return undefined;
  }

  return {
    easting,
    northing,
    zone: zoneNumber,
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

function ifcUpAxis() {
  // +90° about X: IFC Y becomes Cesium Z (up) without the 180° flip.
  return Cesium.Matrix4.fromRotationTranslation(
    Cesium.Matrix3.fromRotationX(Cesium.Math.PI_OVER_TWO),
    Cesium.Cartesian3.ZERO,
  );
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
  return Cesium.Matrix4.multiply(
    Cesium.Transforms.headingPitchRollToFixedFrame(position, hpr),
    ifcUpAxis(),
    new Cesium.Matrix4(),
  );
}

function localMatrix() {
  return Cesium.Matrix4.multiply(
    Cesium.Matrix4.fromTranslation(new Cesium.Cartesian3(0.0, 0.0, readHeight())),
    ifcUpAxis(),
    new Cesium.Matrix4(),
  );
}

function modelRadius(model) {
  const radius = model.boundingSphere?.radius;
  return Number.isFinite(radius) && radius > 1 ? radius : 50;
}

function frameModel(model) {
  const origin = placedOnGlobe ? readOrigin() : undefined;
  const sphere = origin
    ? new Cesium.BoundingSphere(
        Cesium.Cartesian3.fromDegrees(origin.longitude, origin.latitude, origin.height),
        modelRadius(model),
      )
    : Cesium.BoundingSphere.clone(model.boundingSphere);
  if (!Cesium.defined(sphere) || !(sphere.radius > 0) || !Number.isFinite(sphere.radius)) {
    return;
  }

  viewer.camera.viewBoundingSphere(
    sphere,
    new Cesium.HeadingPitchRange(
      Cesium.Math.toRadians(40),
      Cesium.Math.toRadians(origin ? -28 : -18),
      sphere.radius * (origin ? 3.2 : 1.9),
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
    currentModel.modelMatrix = Cesium.Matrix4.clone(globeMatrix(origin));
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
    window.alert("Wait for the model to finish loading, then click Place on globe.");
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

async function bytesFromSource(source) {
  if (source instanceof Uint8Array) {
    return source;
  }
  if (source instanceof ArrayBuffer) {
    return new Uint8Array(source);
  }
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Could not fetch IFC (${response.status}).`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function loadRevitIfc(source) {
  setLoading("Loading Revit IFC...");
  placedOnGlobe = false;

  if (currentModel) {
    viewer.scene.primitives.remove(currentModel);
    currentModel = undefined;
  }
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = undefined;
  }

  const bytes = await bytesFromSource(source);
  const url = await ifcBufferToGlbUrl(bytes);
  objectUrl = url;

  const options = {
    url,
    upAxis: Cesium.Axis.Z,
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

Sandcastle.addToolbarButton("Open IFC", () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".ifc,application/x-step";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    try {
      await loadRevitIfc(new Uint8Array(await file.arrayBuffer()));
    } catch (error) {
      console.error(error);
      setLoading(undefined);
      window.alert(
        `Could not open ${file.name}. Export the Revit model as IFC and try again.`,
      );
    }
  };
  input.click();
});

Sandcastle.addToolbarButton("Place on globe", placeOnGlobe);
Sandcastle.addToolbarButton("Local origin", useLocalOrigin);

loadRevitIfc(DEFAULT_URL).catch((error) => {
  console.error(error);
  setLoading(undefined);
  window.alert(
    "Could not load the bundled IFC. Use Open IFC to choose a Revit IFC export.",
  );
});
