import os
import json
import faiss
import numpy as np
import networkx as nx
from sentence_transformers import SentenceTransformer

# Ensure data directory exists
os.makedirs("data", exist_ok=True)

# 1. Corpus for Vector RAG
docs = [
    {"id": "doc1", "text": "Meridian Holdings Ltd is a corporate entity registered in the British Virgin Islands. Its primary operations are in logistics."},
    {"id": "doc2", "text": "BVI Shell Alpha is a holding company that owns 100% of Meridian Holdings Ltd."},
    {"id": "doc3", "text": "Viktor Kasarov is a known oligarch who holds a 67% controlling stake in BVI Shell Alpha."},
    {"id": "doc4", "text": "A Liechtenstein Trust holds the remaining 33% of BVI Shell Alpha."},
    {"id": "doc5", "text": "Nexus Corp is a software company based in London."},
    {"id": "doc6", "text": "Elena Rostova is a board member of Nexus Corp. She previously worked at a large bank."},
    {"id": "doc7", "text": "Global Trade LLC is an international trading firm. Elena Rostova is also on the board of Global Trade LLC."},
    {"id": "doc8", "text": "Vertex Capital is an investment fund. Vertex Capital provided a $5M loan to Ocean Logistics."},
    {"id": "doc9", "text": "Ocean Logistics is a maritime shipping company. Ocean Logistics transacted heavily with Red Star Shipping last year."},
    {"id": "doc10", "text": "Red Star Shipping was recently sanctioned for illicit activities and smuggling."},
    {"id": "doc11", "text": "Jonathan Doe initiated three wire transfers totaling $150k in October."},
    {"id": "doc12", "text": "Apex Ventures owns a Cayman Islands Account. The wire transfers from Jonathan Doe went to this Cayman Islands Account."},
    {"id": "doc13", "text": "Solaris Energy experienced a massive stock sell-off by major shareholders on T-2 Days before the quarterly report."},
    {"id": "doc14", "text": "A compliance investigation into Solaris Energy was publicly announced on T-0 Days."}
]

# Save chunks
with open("data/chunks.json", "w") as f:
    json.dump(docs, f, indent=2)

# Build FAISS index
print("Building FAISS index...")
embedder = SentenceTransformer("all-MiniLM-L6-v2")
texts = [d["text"] for d in docs]
embeddings = embedder.encode(texts)
dimension = embeddings.shape[1]
index = faiss.IndexFlatL2(dimension)
index.add(np.array(embeddings, dtype=np.float32))
faiss.write_index(index, "data/vector_index.faiss")

# 2. NetworkX Graph for GraphRAG
print("Building NetworkX graph...")
G = nx.DiGraph()

# Add nodes and edges based on the docs
# SCN-001
G.add_node("Meridian Holdings Ltd", type="Company", risk_score=85)
G.add_node("BVI Shell Alpha", type="Company", risk_score=60)
G.add_node("Viktor Kasarov", type="Person", risk_score=95)
G.add_node("Liechtenstein Trust", type="Trust", risk_score=90)
G.add_edge("BVI Shell Alpha", "Meridian Holdings Ltd", relation="OWNS", weight="100%")
G.add_edge("Viktor Kasarov", "BVI Shell Alpha", relation="CONTROLS", weight="67%")
G.add_edge("Liechtenstein Trust", "BVI Shell Alpha", relation="CONTROLS", weight="33%")

# SCN-002
G.add_node("Nexus Corp", type="Company", risk_score=40)
G.add_node("Global Trade LLC", type="Company", risk_score=45)
G.add_node("Elena Rostova", type="Person", risk_score=80)
G.add_edge("Elena Rostova", "Nexus Corp", relation="DIRECTOR_OF", weight="Board Member")
G.add_edge("Elena Rostova", "Global Trade LLC", relation="DIRECTOR_OF", weight="Board Member")

# SCN-003
G.add_node("Vertex Capital", type="Company", risk_score=20)
G.add_node("Ocean Logistics", type="Company", risk_score=55)
G.add_node("Red Star Shipping", type="Company", risk_score=99)
G.add_edge("Vertex Capital", "Ocean Logistics", relation="LOAN_PROVIDED", weight="$5M")
G.add_edge("Ocean Logistics", "Red Star Shipping", relation="TRANSACTED_WITH", weight="Sanctioned Entity")

# SCN-004
G.add_node("Jonathan Doe", type="Person", risk_score=70)
G.add_node("Cayman Islands Account", type="Account", risk_score=85)
G.add_node("Apex Ventures", type="Company", risk_score=90)
G.add_edge("Jonathan Doe", "Cayman Islands Account", relation="WIRE_TRANSFER", weight="$150k")
G.add_edge("Apex Ventures", "Cayman Islands Account", relation="OWNS", weight="100%")

# SCN-005
G.add_node("Solaris Energy", type="Company", risk_score=95)
G.add_node("Major Shareholders", type="Person", risk_score=80)
G.add_node("Compliance Investigation", type="Event", risk_score=100)
G.add_edge("Major Shareholders", "Solaris Energy", relation="MASSIVE_SELLOFF", weight="T-2 Days")
G.add_edge("Compliance Investigation", "Solaris Energy", relation="ANNOUNCED", weight="T-0 Days")

nx.write_gml(G, "data/graph.gml")

# 3. Scenarios
scenarios = [
  {
    "id": "SCN-001",
    "category": "multi_hop_ownership",
    "query": "Who are the ultimate beneficial owners of Meridian Holdings Ltd, and what jurisdictions are they exposed to?",
    "ground_truth": "Meridian Holdings is ultimately controlled by Viktor Kasarov (67%) and a Liechtenstein Trust (33%) through intermediary BVI Shell Alpha.",
    "expected_graphrag_advantage": "Requires 3-hop ownership traversal: Meridian -> BVI Shell -> Kasarov. Vector RAG retrieves company-level documents but misses the chain.",
    "tags": ["ownership", "multi-hop", "jurisdiction-risk"]
  },
  {
    "id": "SCN-002",
    "category": "hidden_connection_detection",
    "query": "Are there any hidden connections between Nexus Corp and Global Trade LLC?",
    "ground_truth": "Yes, Nexus Corp and Global Trade LLC share a director, Elena Rostova, who sits on the board of both entities.",
    "expected_graphrag_advantage": "Cross-entity link discovery.",
    "tags": ["hidden-connection", "entities"]
  },
  {
    "id": "SCN-003",
    "category": "indirect_risk_inference",
    "query": "What is the indirect risk exposure of Vertex Capital?",
    "ground_truth": "Vertex Capital has indirect exposure to sanctioned entity Red Star Shipping via a loan provided to an intermediary shell, Ocean Logistics.",
    "expected_graphrag_advantage": "Multi-edge risk score aggregation.",
    "tags": ["risk", "multi-edge"]
  },
  {
    "id": "SCN-004",
    "category": "cross_document_linkage",
    "query": "Which transactions link Jonathan Doe to offshore accounts?",
    "ground_truth": "Jonathan Doe initiated wire transfers totaling $150k to an account registered in the Cayman Islands held by offshore entity Apex Ventures.",
    "expected_graphrag_advantage": "Entity-document edge traversal.",
    "tags": ["transactions", "offshore"]
  },
  {
    "id": "SCN-005",
    "category": "temporal_pattern_analysis",
    "query": "What events preceded the sudden liquidation or compliance investigation of Solaris Energy?",
    "ground_truth": "Solaris Energy experienced a massive stock sell-off by major shareholders two days before a compliance investigation was publicly announced.",
    "expected_graphrag_advantage": "Temporal edge traversal.",
    "tags": ["temporal", "events"]
  }
]

with open("scenarios.json", "w") as f:
    json.dump(scenarios, f, indent=2)

print("Data initialization complete!")
