import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const cesiumSource = "node_modules/cesium/Build/Cesium";
const cesiumBaseUrl = "cesiumStatic";

export default defineConfig({
  define: {
    CESIUM_BASE_URL: JSON.stringify(`/${cesiumBaseUrl}`),
  },
  resolve: {
    alias: {
      Sandcastle: resolve(root, "runner/Sandcastle.js"),
    },
  },
  plugins: [
    {
      name: "local-sandcastle-sample-data",
      transform(code, id) {
        if (!id.replaceAll("\\", "/").includes("/Class/") || !id.endsWith(".js")) {
          return null;
        }
        const rewrites = [
          [
            "https://cesium.com/public/SandcastleSampleData/",
            "/SampleData/",
          ],
          [
            "https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/Laon_Cathedral_Interior_360x180%2C_Picardy%2C_France_-_Diliff.jpg/3840px-Laon_Cathedral_Interior_360x180%2C_Picardy%2C_France_-_Diliff.jpg",
            "/SampleData/panorama/laon-cathedral.jpg",
          ],
          [
            "https://upload.wikimedia.org/wikipedia/commons/3/37/360%C2%B0_Phnom_Penh_%28Central_Market_2022%29_%28left%29.jpg",
            "/SampleData/panorama/phnom-penh-left.jpg",
          ],
          [
            "https://upload.wikimedia.org/wikipedia/commons/1/1b/360%C2%B0_Phnom_Penh_%28Central_Market_2022%29_%28right%29.jpg",
            "/SampleData/panorama/phnom-penh-right.jpg",
          ],
          [
            "https://upload.wikimedia.org/wikipedia/commons/7/73/360%C2%B0_Phnom_Penh_%28Central_Market_2022%29_%28down%29.jpg",
            "/SampleData/panorama/phnom-penh-down.jpg",
          ],
          [
            "https://upload.wikimedia.org/wikipedia/commons/d/de/360%C2%B0_Phnom_Penh_%28Central_Market_2022%29_%28up%29.jpg",
            "/SampleData/panorama/phnom-penh-up.jpg",
          ],
          [
            "https://upload.wikimedia.org/wikipedia/commons/2/2e/360%C2%B0_Phnom_Penh_%28Central_Market_2022%29_%28back%29.jpg",
            "/SampleData/panorama/phnom-penh-back.jpg",
          ],
          [
            "https://upload.wikimedia.org/wikipedia/commons/d/db/360%C2%B0_Phnom_Penh_%28Central_Market_2022%29_%28front%29.jpg",
            "/SampleData/panorama/phnom-penh-front.jpg",
          ],
        ];
        let next = code;
        let changed = false;
        for (const [from, to] of rewrites) {
          if (next.includes(from)) {
            next = next.replaceAll(from, to);
            changed = true;
          }
        }
        return changed ? next : null;
      },
    },
    viteStaticCopy({
      targets: [
        { src: `${cesiumSource}/ThirdParty`, dest: cesiumBaseUrl },
        { src: `${cesiumSource}/Workers`, dest: cesiumBaseUrl },
        { src: `${cesiumSource}/Assets`, dest: cesiumBaseUrl },
        { src: `${cesiumSource}/Widgets`, dest: cesiumBaseUrl },
        { src: "node_modules/web-ifc/web-ifc.wasm", dest: "web-ifc" },
        { src: "node_modules/web-ifc/web-ifc-mt.wasm", dest: "web-ifc" },
      ],
    }),
    {
      name: "metrocim-ion-credit",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = (req.url ?? "").split("?")[0];
          if (url !== "/cesiumStatic/Assets/Images/ion-credit.png") {
            next();
            return;
          }
          res.setHeader("Content-Type", "image/svg+xml");
          res.end(readFileSync(resolve(root, "runner/metrocim-ion-credit.svg")));
        });
      },
    },
  ],
  optimizeDeps: {
    exclude: ["web-ifc"],
    entries: [
      "index.html",
      "viewer.html",
      "runner/app.js",
      "runner/boot.js",
    ],
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
        viewer: resolve(root, "viewer.html"),
      },
    },
  },
  server: {
    port: 5180,
    strictPort: true,
    open: "/",
  },
});
