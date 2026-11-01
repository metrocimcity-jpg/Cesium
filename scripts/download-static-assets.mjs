import { mkdir, writeFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";

const files = [
  [
    "https://cesium.com/public/SandcastleSampleData/launchvehicle.glb",
    "SampleData/launchvehicle.glb",
  ],
  [
    "https://cesium.com/public/SandcastleSampleData/kiara_6_afternoon_2k_ibl.ktx2",
    "SampleData/kiara_6_afternoon_2k_ibl.ktx2",
  ],
  [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/Laon_Cathedral_Interior_360x180%2C_Picardy%2C_France_-_Diliff.jpg/3840px-Laon_Cathedral_Interior_360x180%2C_Picardy%2C_France_-_Diliff.jpg",
    "SampleData/panorama/laon-cathedral.jpg",
  ],
  [
    "https://upload.wikimedia.org/wikipedia/commons/3/37/360%C2%B0_Phnom_Penh_%28Central_Market_2022%29_%28left%29.jpg",
    "SampleData/panorama/phnom-penh-left.jpg",
  ],
  [
    "https://upload.wikimedia.org/wikipedia/commons/1/1b/360%C2%B0_Phnom_Penh_%28Central_Market_2022%29_%28right%29.jpg",
    "SampleData/panorama/phnom-penh-right.jpg",
  ],
  [
    "https://upload.wikimedia.org/wikipedia/commons/7/73/360%C2%B0_Phnom_Penh_%28Central_Market_2022%29_%28down%29.jpg",
    "SampleData/panorama/phnom-penh-down.jpg",
  ],
  [
    "https://upload.wikimedia.org/wikipedia/commons/d/de/360%C2%B0_Phnom_Penh_%28Central_Market_2022%29_%28up%29.jpg",
    "SampleData/panorama/phnom-penh-up.jpg",
  ],
  [
    "https://upload.wikimedia.org/wikipedia/commons/2/2e/360%C2%B0_Phnom_Penh_%28Central_Market_2022%29_%28back%29.jpg",
    "SampleData/panorama/phnom-penh-back.jpg",
  ],
  [
    "https://upload.wikimedia.org/wikipedia/commons/d/db/360%C2%B0_Phnom_Penh_%28Central_Market_2022%29_%28front%29.jpg",
    "SampleData/panorama/phnom-penh-front.jpg",
  ],
];

const headers = {
  "User-Agent": "CesiumClassSamples/1.0 (offline classroom mirror)",
  Accept: "*/*",
};

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

for (const [url, dest] of files) {
  const path = join(process.cwd(), dest);
  if (await exists(path)) {
    console.log(`skip ${dest}`);
    continue;
  }
  console.log(`get  ${dest}`);
  await mkdir(dirname(path), { recursive: true });
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`${response.status} ${url}`);
  }
  await writeFile(path, Buffer.from(await response.arrayBuffer()));
}

console.log("done");
