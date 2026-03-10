/**
 * Self-contained HTML graph visualization using Cytoscape.js.
 * Generates a single HTML string that can be opened in any browser.
 */

export interface GraphNode {
  id: string;
  name: string;
  type: string;
  definition_slug: string;
  primary_attribute?: string;
  created_at?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  definition_id: string;
}

export interface RelationshipDefinition {
  id: string;
  name: string;
  entity_1_to_2: string;
  entity_2_to_1: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  relationship_definitions: RelationshipDefinition[];
  total_nodes: number;
  total_edges: number;
}

const NODE_COLORS: Record<string, string> = {
  person: "#4F87E0",
  company: "#34A853",
  deal: "#F4A236",
};
const DEFAULT_COLOR = "#9B59B6";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeJsonForHtml(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

export function generateGraphHtml(data: GraphData): string {
  const nodeColors = { ...NODE_COLORS };
  const typeSet = new Set<string>();
  for (const n of data.nodes) typeSet.add(n.type);

  // Build degree map for sizing
  const degree: Record<string, number> = {};
  for (const n of data.nodes) degree[n.id] = 0;
  for (const e of data.edges) {
    degree[e.source] = (degree[e.source] ?? 0) + 1;
    degree[e.target] = (degree[e.target] ?? 0) + 1;
  }
  const maxDeg = Math.max(1, ...Object.values(degree));

  // Node set for filtering dangling edges
  const nodeIds = new Set(data.nodes.map((n) => n.id));

  // Build Cytoscape elements
  const elements = {
    nodes: data.nodes.map((n) => ({
      data: {
        id: n.id,
        label: n.name,
        type: n.type,
        primary_attribute: n.primary_attribute ?? "",
        created_at: n.created_at ?? "",
        color: nodeColors[n.type] ?? DEFAULT_COLOR,
        size: 20 + ((degree[n.id] ?? 0) / maxDeg) * 40,
      },
    })),
    edges: data.edges
      .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
      .map((e) => ({
        data: {
          id: "e" + e.id,
          source: e.source,
          target: e.target,
          label: e.label,
        },
      })),
  };

  const legendTypes = Array.from(typeSet).sort();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Nex — Workspace Graph</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#1a1a2e;color:#e0e0e0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;overflow:hidden}
#cy{width:100vw;height:100vh}
#search-box{position:fixed;top:16px;left:16px;z-index:10;background:#25253e;border:1px solid #3a3a5c;border-radius:8px;padding:8px 12px;color:#e0e0e0;font-size:14px;width:240px;outline:none}
#search-box::placeholder{color:#6a6a8a}
#search-box:focus{border-color:#4F87E0}
#stats{position:fixed;top:16px;right:16px;z-index:10;background:#25253e;border:1px solid #3a3a5c;border-radius:8px;padding:8px 14px;font-size:13px;color:#9a9ab0}
#legend{position:fixed;bottom:16px;left:16px;z-index:10;background:#25253e;border:1px solid #3a3a5c;border-radius:8px;padding:10px 14px;font-size:13px}
.legend-item{display:flex;align-items:center;gap:8px;margin:4px 0}
.legend-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
#detail-panel{position:fixed;top:0;right:-320px;width:320px;height:100vh;background:#25253e;border-left:1px solid #3a3a5c;z-index:20;padding:20px;overflow-y:auto;transition:right .2s ease}
#detail-panel.open{right:0}
#detail-panel h3{margin-bottom:12px;font-size:16px;color:#fff}
#detail-panel .field{margin-bottom:8px;font-size:13px}
#detail-panel .field .label{color:#6a6a8a;font-size:11px;text-transform:uppercase;letter-spacing:.5px}
#detail-panel .field .value{color:#e0e0e0;margin-top:2px}
#detail-close{position:absolute;top:12px;right:12px;background:none;border:none;color:#6a6a8a;cursor:pointer;font-size:18px}
#detail-close:hover{color:#e0e0e0}
</style>
</head>
<body>
<input id="search-box" type="text" placeholder="Search entities..." autocomplete="off">
<div id="stats">${escapeHtml(String(data.total_nodes))} entities &middot; ${escapeHtml(String(data.total_edges))} relationships</div>
<div id="legend">
${legendTypes
  .map(
    (t) =>
      `<div class="legend-item"><span class="legend-dot" style="background:${escapeHtml(nodeColors[t] ?? DEFAULT_COLOR)}"></span>${escapeHtml(t)}</div>`
  )
  .join("\n")}
</div>
<div id="detail-panel">
<button id="detail-close">&times;</button>
<h3 id="detail-name"></h3>
<div id="detail-body"></div>
</div>
<div id="cy"></div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/cytoscape/3.30.4/cytoscape.min.js"></script>

<script id="graph-data" type="application/json">${escapeJsonForHtml(elements)}</script>

<script>
(function(){
  var elements = JSON.parse(document.getElementById("graph-data").textContent);

  var cy = cytoscape({
    container: document.getElementById("cy"),
    elements: elements,
    style: [
      {
        selector: "node",
        style: {
          "background-color": "data(color)",
          "label": "data(label)",
          "width": "data(size)",
          "height": "data(size)",
          "color": "#c0c0d0",
          "font-size": "11px",
          "text-valign": "bottom",
          "text-margin-y": "6px",
          "text-outline-color": "#1a1a2e",
          "text-outline-width": "2px",
          "min-zoomed-font-size": 10
        }
      },
      {
        selector: "edge",
        style: {
          "width": 1.5,
          "line-color": "#3a3a5c",
          "target-arrow-color": "#3a3a5c",
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",
          "label": "data(label)",
          "font-size": "9px",
          "color": "#6a6a8a",
          "text-rotation": "autorotate",
          "text-outline-color": "#1a1a2e",
          "text-outline-width": "1.5px",
          "min-zoomed-font-size": 12
        }
      },
      {
        selector: "node.highlighted",
        style: {
          "border-width": "3px",
          "border-color": "#fff"
        }
      },
      {
        selector: "node.faded",
        style: {
          "opacity": 0.15
        }
      },
      {
        selector: "edge.faded",
        style: {
          "opacity": 0.08
        }
      }
    ],
    layout: {
      name: "cose",
      animate: false,
      nodeRepulsion: function(){ return 8000; },
      idealEdgeLength: function(){ return 120; },
      gravity: 0.3,
      numIter: 300,
      padding: 40
    },
    wheelSensitivity: 0.3
  });

  // Hover: highlight neighbors
  cy.on("mouseover", "node", function(e){
    var node = e.target;
    var neighborhood = node.neighborhood().add(node);
    cy.elements().addClass("faded");
    neighborhood.removeClass("faded");
    node.addClass("highlighted");
  });

  cy.on("mouseout", "node", function(e){
    cy.elements().removeClass("faded").removeClass("highlighted");
  });

  // Search
  var searchBox = document.getElementById("search-box");
  searchBox.addEventListener("input", function(){
    var q = searchBox.value.trim().toLowerCase();
    if (!q) {
      cy.elements().removeClass("faded");
      return;
    }
    cy.nodes().forEach(function(n){
      var name = (n.data("label") || "").toLowerCase();
      if (name.includes(q)) {
        n.removeClass("faded");
        n.neighborhood().add(n).removeClass("faded");
      } else {
        n.addClass("faded");
      }
    });
    cy.edges().forEach(function(e){
      if (e.source().hasClass("faded") && e.target().hasClass("faded")) {
        e.addClass("faded");
      } else {
        e.removeClass("faded");
      }
    });
    // Center on first match
    var matches = cy.nodes().filter(function(n){
      return (n.data("label") || "").toLowerCase().includes(q);
    });
    if (matches.length > 0) {
      cy.animate({ center: { eles: matches.first() }, zoom: 1.5, duration: 300 });
    }
  });

  // Detail panel
  var panel = document.getElementById("detail-panel");
  var detailName = document.getElementById("detail-name");
  var detailBody = document.getElementById("detail-body");

  document.getElementById("detail-close").addEventListener("click", function(){
    panel.classList.remove("open");
  });

  function addField(parent, labelText, valueText) {
    var field = document.createElement("div");
    field.className = "field";
    var lbl = document.createElement("div");
    lbl.className = "label";
    lbl.textContent = labelText;
    var val = document.createElement("div");
    val.className = "value";
    val.textContent = valueText;
    field.appendChild(lbl);
    field.appendChild(val);
    parent.appendChild(field);
  }

  cy.on("tap", "node", function(e){
    var node = e.target;
    var d = node.data();
    var neighbors = node.neighborhood("node");
    detailName.textContent = d.label || d.id;
    detailBody.textContent = "";
    addField(detailBody, "Type", d.type || "");
    if (d.primary_attribute) addField(detailBody, "Primary", d.primary_attribute);
    if (d.created_at) addField(detailBody, "Created", d.created_at);
    addField(detailBody, "Connections", String(neighbors.length));
    if (neighbors.length > 0) {
      var field = document.createElement("div");
      field.className = "field";
      var lbl = document.createElement("div");
      lbl.className = "label";
      lbl.textContent = "Connected to";
      field.appendChild(lbl);
      var val = document.createElement("div");
      val.className = "value";
      neighbors.slice(0, 20).forEach(function(n){
        var line = document.createElement("div");
        line.textContent = n.data("label") || n.id();
        val.appendChild(line);
      });
      if (neighbors.length > 20) {
        var more = document.createElement("em");
        more.textContent = "...and " + (neighbors.length - 20) + " more";
        val.appendChild(more);
      }
      field.appendChild(val);
      detailBody.appendChild(field);
    }
    panel.classList.add("open");
  });

  cy.on("tap", function(e){
    if (e.target === cy) panel.classList.remove("open");
  });
})();
</script>
</body>
</html>`;
}
