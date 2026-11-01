import "cesium/Build/Cesium/Widgets/widgets.css";
import Sandcastle from "Sandcastle";
import { Credit, CreditDisplay, Ion } from "cesium";

window.CESIUM_BASE_URL = "/cesiumStatic/";

const ionToken = import.meta.env.VITE_CESIUM_ION_TOKEN;
if (ionToken) {
  Ion.defaultAccessToken = ionToken;
}

CreditDisplay.cesiumCredit = new Credit(
  '<a href="https://cesium.com/" target="_blank" rel="noopener noreferrer"><img src="/runner/metrocim-ion-credit.svg" title="MetroCIM ion" alt="MetroCIM ion"/></a>',
  true,
);

function brandIonText(node) {
  if (node.nodeType !== Node.TEXT_NODE || !node.textContent) {
    return;
  }
  const next = node.textContent
    .replaceAll("Cesium ion", "MetroCIM ion")
    .replaceAll("CESIUM ion", "MetroCIM ion")
    .replaceAll("Cesium's default ion", "MetroCIM's default ion");
  if (next !== node.textContent) {
    node.textContent = next;
  }
}

function hideDefaultTokenCredit(root = document) {
  root.querySelectorAll(".cesium-credit-wrapper").forEach((el) => {
    const text = el.textContent ?? "";
    if (
      text.includes("default ion access token") ||
      text.includes("This application is using")
    ) {
      el.style.display = "none";
    }
  });
}

function brandIonCredits(root = document) {
  hideDefaultTokenCredit(root);
  root.querySelectorAll('img[src*="ion-credit"]').forEach((img) => {
    img.src = "/runner/metrocim-ion-credit.svg";
    img.alt = "MetroCIM ion";
    img.title = "MetroCIM ion";
  });
  const scopes = root.querySelectorAll(
    ".cesium-widget-credits, .cesium-credit-lightbox, .cesium-credit-textContainer, .cesium-credit-logoContainer",
  );
  for (const scope of scopes.length ? scopes : [root]) {
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    let current = walker.nextNode();
    while (current) {
      brandIonText(current);
      current = walker.nextNode();
    }
  }
}

const creditObserver = new MutationObserver(() => brandIonCredits());
creditObserver.observe(document.documentElement, {
  subtree: true,
  childList: true,
  characterData: true,
});
brandIonCredits();

const htmlModules = import.meta.glob("../Class/*/index.html", {
  query: "?raw",
  import: "default",
});
const jsModules = import.meta.glob("../Class/*/main.js");

const params = new URLSearchParams(location.search);
const sample = params.get("sample") || "hello-world";
const htmlKey = `../Class/${sample}/index.html`;
const jsKey = `../Class/${sample}/main.js`;
const root = document.getElementById("sample-root");

if (!htmlModules[htmlKey] || !jsModules[jsKey]) {
  document.body.classList.remove("sandcastle-loading");
  root.innerHTML = `<div id="loadingOverlay" style="display:block"><h1>Sample not found: ${sample}</h1></div>`;
} else {
  root.innerHTML = await htmlModules[htmlKey]();
  document.title = sample;
  await jsModules[jsKey]();
  try {
    Sandcastle.finishedLoading();
  } catch (error) {
    console.error(error);
    document.body.classList.remove("sandcastle-loading");
  }
}
